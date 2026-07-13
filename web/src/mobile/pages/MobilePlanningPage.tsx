import { useEffect, useRef, useState, useLayoutEffect } from 'react';
import { LogOut, Clock, AlertTriangle, Calendar, ChevronDown, ChevronUp, RefreshCw } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useAuth, clearAuth, refreshSessionExpiry } from '../lib/store';
import { enqueue, isOnline, cacheData, getCachedData } from '../lib/offlineQueue';
import type { CourseExecution, Ligne } from '../lib/types';
import MobileIncidentSheet from '../components/MobileIncidentSheet';
import { mDateStr, mMidnightISO, mAddDaysStr, fmtHM, fmtDateLong } from '../../lib/mayotte';

// Jour calendaire de MAYOTTE (UTC+3 fixe), independant du fuseau du telephone :
// planning et chauffeur partagent ainsi exactement la meme "journee".
function localDayStr(dt: Date = new Date()): string {
  return mDateStr(dt);
}

interface CourseWithDetails {
  id: string;
  date_heure: string;
  depart: string;
  arrivee: string;
  statut: string;
  is_astreinte?: boolean;
  ligne: Ligne | null;
  execution: CourseExecution | null;
}

interface TomorrowCourse {
  id: string;
  date_heure: string;
  depart: string;
  arrivee: string;
  ligne: Ligne | null;
}

interface AstreinteSession {
  id: string;
  chauffeur_id: string;
  date: string;
  heure_debut: string;
  heure_fin: string | null;
}

interface Props {
  onNavigate: (path: string) => void;
}

export default function MobilePlanningPage({ onNavigate }: Props) {
  const { chauffeur } = useAuth();
  const [courses, setCourses] = useState<CourseWithDetails[]>([]);
  const [tomorrowCourses, setTomorrowCourses] = useState<TomorrowCourse[]>([]);
  const [showTomorrow, setShowTomorrow] = useState(false);
  const [loading, setLoading] = useState(true);
  const [isOffline, setIsOffline] = useState(!navigator.onLine);
  const [showIncident, setShowIncident] = useState(false);
  const [lastSync, setLastSync] = useState<string>('');
  const [hasAstreinte, setHasAstreinte] = useState(false);
  const [plannedAstreinteId, setPlannedAstreinteId] = useState<string | null>(null);
  const [astreinteSession, setAstreinteSession] = useState<AstreinteSession | null>(null);

  // Ping GPS unique au moment de la confirmation de l'astreinte (plus de suivi
  // continu : l'astreinte est un simple bouton "realisee", sans start/stop).
  const sendAstreinteGpsPing = (sessionId: string) => {
    if (!chauffeur) return;
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        const pingData = {
          astreinte_session_id: sessionId,
          chauffeur_id: chauffeur.id,
          latitude: pos.coords.latitude,
          longitude: pos.coords.longitude,
          recorded_at: new Date().toISOString(),
        };
        if (isOnline()) {
          await supabase.from('gps_pings').insert(pingData);
        } else {
          enqueue({ table: 'gps_pings', type: 'insert', data: pingData });
        }
      },
      () => {},
      { enableHighAccuracy: true, timeout: 10000 }
    );
  };

  useEffect(() => {
    if (!chauffeur) { onNavigate('/mobile'); return; }
    fetchCourses();
    const handleOnline = () => setIsOffline(false);
    const handleOffline = () => setIsOffline(true);
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    // Rafraichissement en arriere-plan toutes les 3 min (au lieu d'un refresh a
    // chaque changement de course de toute l'organisation, trop frequent). On
    // garde le temps-reel sur astreintes et creneaux (rares).
    const poll = setInterval(() => fetchCourses(true), 180000);
    let refreshTimer: ReturnType<typeof setTimeout> | null = null;
    const scheduleRefresh = () => {
      if (refreshTimer) clearTimeout(refreshTimer);
      refreshTimer = setTimeout(() => fetchCourses(true), 600);
    };
    const channel = supabase
      .channel(`planning_${chauffeur.id}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'astreintes' }, scheduleRefresh)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'coordinateur_creneaux' }, scheduleRefresh)
      .subscribe();

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
      clearInterval(poll);
      if (refreshTimer) clearTimeout(refreshTimer);
      supabase.removeChannel(channel);
    };
  }, [chauffeur]);

  // Position de scroll a restaurer apres un rafraichissement en arriere-plan.
  const pendingScrollRef = useRef<number | null>(null);
  useLayoutEffect(() => {
    if (pendingScrollRef.current != null) {
      window.scrollTo(0, pendingScrollRef.current);
      pendingScrollRef.current = null;
    }
  });

  const fetchCourses = async (background = false) => {
    if (!chauffeur) return;
    if (!background) setLoading(true);
    // Fenetre de journee en heure de MAYOTTE (bornes minuit Mayotte), identique
    // a celle du planning back-office -> meme "aujourd'hui" pour tous.
    const today = new Date();
    const dayStr = mDateStr(today);
    const startOfDay = mMidnightISO(dayStr);
    const endOfDay = mMidnightISO(mAddDaysStr(dayStr, 1));
    const endOfTomorrow = mMidnightISO(mAddDaysStr(dayStr, 2));
    const todayStr = localDayStr(today);
    const online = isOnline();

    // Cles de cache par chauffeur : le dernier planning connu doit survivre a une
    // coupure reseau pour que l'app s'ouvre hors-ligne avec des donnees reelles.
    const CK_TODAY = `planning_today_${chauffeur.id}`;
    const CK_TOMORROW = `planning_tomorrow_${chauffeur.id}`;
    const CK_SYNCED = `planning_synced_${chauffeur.id}`;

    // Drafts, replaced, cancelled and incident courses must never reach the driver
    const visibleCourses = () =>
      supabase.from('courses').select('*, ligne:lignes(*)').eq('chauffeur_id', chauffeur.id)
        .or('is_brouillon.is.null,is_brouillon.eq.false')
        .or('statut_realisation.is.null,and(statut_realisation.neq.remplace,statut_realisation.neq.annule,statut_realisation.neq.incident)');

    let mergedToday: CourseWithDetails[] | null = null;
    let tomorrow: TomorrowCourse[] | null = null;

    if (online) {
      try {
        const [todayRes, tomorrowRes] = await Promise.all([
          visibleCourses().gte('date_heure', startOfDay).lt('date_heure', endOfDay).order('date_heure', { ascending: true }),
          visibleCourses().gte('date_heure', endOfDay).lt('date_heure', endOfTomorrow).order('date_heure', { ascending: true }),
        ]);

        if (todayRes.data) {
          const { data: executions } = await supabase.from('course_executions').select('*').eq('chauffeur_id', chauffeur.id).in('course_id', todayRes.data.map((c) => c.id));
          mergedToday = todayRes.data.map((course) => ({ ...course, execution: executions?.find((e) => e.course_id === course.id) || null })) as CourseWithDetails[];
          cacheData(CK_TODAY, mergedToday);
          cacheData(CK_SYNCED, new Date().toISOString());
          // On a joint le serveur : on repousse l'expiration de la session de 30j.
          refreshSessionExpiry();
        }
        if (tomorrowRes.data) {
          tomorrow = tomorrowRes.data as TomorrowCourse[];
          cacheData(CK_TOMORROW, tomorrow);
        }
      } catch {
        // Echec reseau en cours de requete -> on bascule sur le cache ci-dessous.
      }
    }

    // Hors-ligne ou echec reseau : relire le dernier planning mis en cache.
    if (mergedToday == null) {
      mergedToday = getCachedData<CourseWithDetails[]>(CK_TODAY) ?? [];
      const ts = getCachedData<string>(CK_SYNCED);
      if (ts) setLastSync(fmtHM(new Date(ts)));
    } else {
      setLastSync(fmtHM(new Date()));
    }
    if (tomorrow == null) {
      tomorrow = getCachedData<TomorrowCourse[]>(CK_TOMORROW) ?? [];
    }

    // Rafraichissement en arriere-plan : memoriser le scroll pour le restaurer.
    if (background) pendingScrollRef.current = window.scrollY;
    setCourses(mergedToday);
    setTomorrowCourses(tomorrow);

    // Astreinte : calcul sur le planning courant (en ligne comme hors-ligne),
    // en tenant compte des astreintes planifiees cote back-office.
    const astreinteCourses = mergedToday.filter((c) => c.is_astreinte === true);
    let plannedId: string | null = null;
    if (online) {
      const { data: planned } = await supabase
        .from('astreintes')
        .select('id')
        .eq('chauffeur_id', chauffeur.id)
        .or('is_brouillon.is.null,is_brouillon.eq.false')
        .lte('date_debut', endOfDay)
        .gte('date_fin', startOfDay)
        .limit(1);
      plannedId = planned?.[0]?.id ?? null;
      cacheData(`astreinte_planned_${chauffeur.id}_${todayStr}`, plannedId);
    } else {
      plannedId = getCachedData<string | null>(`astreinte_planned_${chauffeur.id}_${todayStr}`) ?? null;
    }
    setPlannedAstreinteId(plannedId);

    if (astreinteCourses.length > 0 || plannedId) {
      setHasAstreinte(true);
      if (online) {
        const { data: session } = await supabase.from('astreinte_sessions').select('*').eq('chauffeur_id', chauffeur.id).eq('date', todayStr).maybeSingle();
        if (session) { setAstreinteSession(session as AstreinteSession); cacheData(`astreinte_${chauffeur.id}_${todayStr}`, session); }
      } else {
        const cached = getCachedData<AstreinteSession>(`astreinte_${chauffeur.id}_${todayStr}`);
        if (cached) setAstreinteSession(cached);
      }
    }

    setLoading(false);
  };

  // Confirmation de l'astreinte en UNE action : plus de start/stop. On horodate
  // heure_debut ET heure_fin a l'instant du clic -> l'astreinte est "realisee".
  // Un ping GPS unique enregistre la position au moment de la confirmation.
  const handleConfirmAstreinte = async () => {
    if (!chauffeur) return;
    const now = new Date().toISOString();
    const todayStr = localDayStr();
    const localId = crypto.randomUUID();
    const sessionData = { id: localId, chauffeur_id: chauffeur.id, date: todayStr, heure_debut: now, heure_fin: now, astreinte_id: plannedAstreinteId, user_id: chauffeur.user_id || chauffeur.id };

    if (isOnline()) {
      const { data } = await supabase.from('astreinte_sessions').insert(sessionData).select().maybeSingle();
      if (data) {
        setAstreinteSession(data as AstreinteSession);
        cacheData(`astreinte_${chauffeur.id}_${todayStr}`, data);
        sendAstreinteGpsPing((data as AstreinteSession).id);
        return;
      }
    }
    const localSession: AstreinteSession = { id: localId, chauffeur_id: chauffeur.id, date: todayStr, heure_debut: now, heure_fin: now };
    setAstreinteSession(localSession);
    cacheData(`astreinte_${chauffeur.id}_${todayStr}`, localSession);
    enqueue({ table: 'astreinte_sessions', type: 'insert', data: sessionData });
  };

  const getStatut = (course: CourseWithDetails): string => course.execution ? course.execution.statut : course.statut;

  const getStatusLabel = (statut: string) => {
    switch (statut) {
      case 'termine': case 'terminee': return 'TERMINE';
      case 'en_cours': return 'EN COURS';
      case 'en_retard': return 'EN RETARD';
      case 'annulee': return 'ANNULEE';
      case 'synchroniser': return 'A SYNCHRONISER';
      default: return 'PLANIFIE';
    }
  };

  const getStatusColor = (statut: string) => {
    switch (statut) {
      case 'termine': case 'terminee': return 'bg-green-100 text-green-800';
      case 'en_cours': return 'bg-green-100 text-green-800';
      case 'en_retard': return 'bg-yellow-100 text-yellow-800';
      case 'annulee': case 'remplacee': return 'bg-red-100 text-red-800';
      case 'synchroniser': return 'bg-yellow-100 text-yellow-800';
      default: return 'bg-gray-100 text-gray-700';
    }
  };

  const formatTime = (dateStr: string) => fmtHM(dateStr);
  const formatDate = () => fmtDateLong(new Date()).toUpperCase();

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="w-8 h-8 border-4 border-orange-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  // Astreinte not started
  if (hasAstreinte && !astreinteSession) {
    return (
      <div className="min-h-screen bg-white flex flex-col">
        {/* Barre haute : le chauffeur peut TOUJOURS sortir (pas de piege). */}
        <div className="flex items-center justify-end px-4 pt-4">
          <button type="button" onClick={() => { clearAuth(); onNavigate('/mobile'); }} className="flex items-center gap-1 text-gray-500">
            <LogOut size={14} /><span className="text-xs">Deconnexion</span>
          </button>
        </div>
        <div className="flex-1 flex flex-col items-center justify-center px-6 py-8">
          <div className="w-20 h-20 rounded-full bg-orange-600 flex items-center justify-center mb-6">
            <Clock size={32} className="text-white" />
          </div>
          <h1 className="text-3xl font-bold text-gray-900">Astreinte</h1>
          <div className="mt-4 bg-gray-50 rounded-xl p-4 w-full max-w-[360px]">
            <div className="flex items-center justify-between border-b border-gray-200 pb-3 mb-3">
              <span className="text-xs text-gray-500">DATE</span>
              <span className="text-sm font-semibold">{formatDate()}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-xs text-gray-500">COURSES</span>
              <span className="text-sm font-semibold">{courses.filter((c) => c.is_astreinte).length}</span>
            </div>
          </div>
        </div>
        <div className="p-4 pb-8">
          <button type="button" onClick={handleConfirmAstreinte} className="w-full bg-orange-600 text-white py-5 rounded-xl font-bold text-xl shadow-md active:bg-orange-700">
            CONFIRMER L'ASTREINTE
          </button>
          <p className="text-[10px] text-gray-400 text-center mt-2">En confirmant, l'astreinte est marquee comme realisee</p>
        </div>
      </div>
    );
  }

  // NB : plus d'ecran plein "astreinte terminee" (il piegeait le chauffeur sans
  // sortie). Une fois confirmee, on retombe sur le planning normal avec une
  // banniere verte "realisee" -> l'utilisateur reste libre de naviguer.

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      {isOffline && (
        <div className="bg-yellow-500 text-white text-center py-2 px-4">
          <span className="text-xs font-bold">MODE HORS-LIGNE - {courses.length} ELEMENTS EN ATTENTE</span>
        </div>
      )}

      {hasAstreinte && astreinteSession?.heure_fin && (
        <div className="bg-green-600 text-white px-4 py-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 rounded-full bg-white" />
              <span className="text-sm font-bold">ASTREINTE REALISEE</span>
            </div>
            <span className="text-sm font-semibold">Confirmee a {fmtHM(astreinteSession.heure_debut)}</span>
          </div>
        </div>
      )}

      <div className="px-4 pt-4">
        <div className="flex items-center justify-between">
          <span className="text-[10px] text-gray-500">{formatDate()}</span>
          <button type="button" onClick={() => { clearAuth(); onNavigate('/mobile'); }} className="flex items-center gap-1 text-gray-500">
            <LogOut size={14} /><span className="text-xs">Deconnexion</span>
          </button>
        </div>
        <div className="flex items-center justify-between mt-1">
          <h1 className="text-2xl font-bold text-gray-900">Planning du jour</h1>
          <div className="text-right">
            <p className="text-sm font-bold">{chauffeur?.code || ''}</p>
            <p className="text-[10px] text-gray-500">{chauffeur?.prenom} {chauffeur?.nom}</p>
          </div>
        </div>
        {lastSync && (
          <div className="mt-2 bg-white rounded-lg px-3 py-2">
            <span className="text-[10px] text-gray-400">Donnees en cache - derniere maj {lastSync}</span>
          </div>
        )}
      </div>

      <div className="flex-1 px-4 mt-4 space-y-2 pb-4">
        {courses.length === 0 ? (
          <div className="text-center py-12"><p className="text-gray-400">Aucune course planifiee aujourd'hui</p></div>
        ) : (
          courses.map((course) => {
            const statut = getStatut(course);
            const isActive = statut === 'en_cours';
            const isTermine = statut === 'termine';
            return (
              <button
                key={course.id}
                type="button"
                onClick={() => { if (!isTermine) onNavigate(`/mobile/course/${course.id}`); }}
                disabled={isTermine}
                className={`w-full text-left rounded-lg border p-4 transition-all ${
                  isActive ? 'border-green-500 border-2 bg-white' : isTermine ? 'border-l-4 border-l-green-500 border-gray-200 bg-gray-50 opacity-60' : 'border-gray-200 bg-white'
                }`}
              >
                <div className="flex items-start justify-between">
                  <div>
                    <span className="text-lg font-bold text-gray-900">{formatTime(course.date_heure)}</span>
                    <div className="mt-1">
                      <p className="font-semibold text-gray-800">{course.depart || '?'} → {course.arrivee || '?'}</p>
                      {course.ligne?.nom && <p className="text-xs text-gray-500">{course.ligne.nom}</p>}
                    </div>
                  </div>
                  <div className="flex items-center gap-1">
                    {statut === 'synchroniser' && <RefreshCw size={12} className="text-yellow-600" />}
                    <span className={`text-[10px] font-bold px-2 py-0.5 rounded ${getStatusColor(statut)}`}>{getStatusLabel(statut)}</span>
                  </div>
                </div>
              </button>
            );
          })
        )}
      </div>

      <div className="px-4 mb-4">
        <button type="button" onClick={() => setShowTomorrow(!showTomorrow)} className="w-full flex items-center justify-between bg-white rounded-lg p-4 border border-gray-200">
          <div className="flex items-center gap-2">
            <Calendar size={16} className="text-gray-500" />
            <span className="font-semibold text-gray-800">Planning demain</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xs bg-gray-100 px-2 py-0.5 rounded font-bold">{tomorrowCourses.length}</span>
            {showTomorrow ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
          </div>
        </button>
        {showTomorrow && (
          <div className="mt-2 space-y-1">
            {tomorrowCourses.length === 0 ? (
              <p className="text-center text-sm text-gray-400 py-4">Aucune course prevue demain</p>
            ) : tomorrowCourses.map((course) => (
              <div key={course.id} className="bg-white border border-gray-200 rounded-lg p-3 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-bold">{formatTime(course.date_heure)}</span>
                  <span className="text-sm">{course.depart || '?'} → {course.arrivee || '?'}</span>
                </div>
                <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-blue-50 text-blue-700">PROGRAMME</span>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="sticky bottom-0 left-0 right-0 p-4 bg-gray-50 border-t border-gray-200 space-y-2">
        <button type="button" onClick={() => setShowIncident(true)} className="w-full bg-red-600 text-white py-4 rounded-xl font-bold text-center flex items-center justify-center gap-2">
          <AlertTriangle size={18} /><span>SIGNALER UN INCIDENT</span>
        </button>
      </div>

      {showIncident && <MobileIncidentSheet onClose={() => setShowIncident(false)} chauffeurId={chauffeur?.id || ''} userId={chauffeur?.user_id || chauffeur?.id || ''} />}
    </div>
  );
}
