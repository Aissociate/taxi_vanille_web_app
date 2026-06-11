import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { PHeading, PText, PTag, PIcon, PSpinner } from '@porsche-design-system/components-react';
import { supabase } from '../lib/supabase';
import { useAuth, clearAuth } from '../lib/store';
import { enqueue, isOnline, cacheData, getCachedData } from '../lib/offlineQueue';
import type { CourseExecution, Ligne } from '../lib/types';
import IncidentSheet from '../components/IncidentSheet';
import KilometrageScreen from '../components/KilometrageScreen';

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

function getCurrentMois() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
}

function getPreviousMois() {
  const now = new Date();
  const prev = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  return `${prev.getFullYear()}-${String(prev.getMonth() + 1).padStart(2, '0')}`;
}

function isEndOfMonth() {
  const now = new Date();
  const lastDay = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
  return now.getDate() >= lastDay - 2;
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

export default function PlanningPage() {
  const { chauffeur } = useAuth();
  const navigate = useNavigate();
  const [courses, setCourses] = useState<CourseWithDetails[]>([]);
  const [tomorrowCourses, setTomorrowCourses] = useState<TomorrowCourse[]>([]);
  const [showTomorrow, setShowTomorrow] = useState(false);
  const [loading, setLoading] = useState(true);
  const [isOffline, setIsOffline] = useState(!navigator.onLine);
  const [showIncident, setShowIncident] = useState(false);
  const [lastSync, setLastSync] = useState<string>('');
  const [kmRequired, setKmRequired] = useState<{ type: 'debut_mois' | 'fin_mois'; mois: string } | null>(null);
  const [kmChecked, setKmChecked] = useState(false);
  const [hasAstreinte, setHasAstreinte] = useState(false);
  const [plannedAstreinteId, setPlannedAstreinteId] = useState<string | null>(null);
  const [astreinteSession, setAstreinteSession] = useState<AstreinteSession | null>(null);
  const [astreinteElapsed, setAstreinteElapsed] = useState('00:00:00');
  const astreinteGpsRef = useRef<ReturnType<typeof setInterval> | null>(null);

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

  const startAstreinteGps = (sessionId: string) => {
    if (astreinteGpsRef.current) return;
    sendAstreinteGpsPing(sessionId);
    astreinteGpsRef.current = setInterval(() => sendAstreinteGpsPing(sessionId), 60000);
  };

  const stopAstreinteGps = () => {
    if (astreinteGpsRef.current) {
      clearInterval(astreinteGpsRef.current);
      astreinteGpsRef.current = null;
    }
  };

  useEffect(() => {
    if (!chauffeur) {
      navigate('/');
      return;
    }
    checkKilometrage();
    fetchCourses();

    const handleOnline = () => setIsOffline(false);
    const handleOffline = () => setIsOffline(true);
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
      stopAstreinteGps();
    };
  }, [chauffeur, navigate]);

  useEffect(() => {
    if (!astreinteSession || astreinteSession.heure_fin) {
      stopAstreinteGps();
      return;
    }
    startAstreinteGps(astreinteSession.id);
    const interval = setInterval(() => {
      const diff = Date.now() - new Date(astreinteSession.heure_debut).getTime();
      const h = Math.floor(diff / 3600000).toString().padStart(2, '0');
      const m = Math.floor((diff % 3600000) / 60000).toString().padStart(2, '0');
      const s = Math.floor((diff % 60000) / 1000).toString().padStart(2, '0');
      setAstreinteElapsed(`${h}:${m}:${s}`);
    }, 1000);
    return () => clearInterval(interval);
  }, [astreinteSession]);

  const checkKilometrage = async () => {
    if (!chauffeur) return;

    const currentMois = getCurrentMois();
    const previousMois = getPreviousMois();

    // Check if end-of-month mileage for previous month is missing
    const { data: prevEnd } = await supabase
      .from('kilometrage')
      .select('id')
      .eq('chauffeur_id', chauffeur.id)
      .eq('type', 'fin_mois')
      .eq('mois', previousMois)
      .maybeSingle();

    if (!prevEnd) {
      const { data: prevStart } = await supabase
        .from('kilometrage')
        .select('id')
        .eq('chauffeur_id', chauffeur.id)
        .eq('type', 'debut_mois')
        .eq('mois', previousMois)
        .maybeSingle();

      if (prevStart) {
        setKmRequired({ type: 'fin_mois', mois: previousMois });
        setKmChecked(true);
        return;
      }
    }

    // Check if start-of-month mileage for current month is missing
    const { data: currentStart } = await supabase
      .from('kilometrage')
      .select('id')
      .eq('chauffeur_id', chauffeur.id)
      .eq('type', 'debut_mois')
      .eq('mois', currentMois)
      .maybeSingle();

    if (!currentStart) {
      setKmRequired({ type: 'debut_mois', mois: currentMois });
      setKmChecked(true);
      return;
    }

    // Check if end-of-month is needed (last 3 days of month)
    if (isEndOfMonth()) {
      const { data: currentEnd } = await supabase
        .from('kilometrage')
        .select('id')
        .eq('chauffeur_id', chauffeur.id)
        .eq('type', 'fin_mois')
        .eq('mois', currentMois)
        .maybeSingle();

      if (!currentEnd) {
        setKmRequired({ type: 'fin_mois', mois: currentMois });
        setKmChecked(true);
        return;
      }
    }

    setKmRequired(null);
    setKmChecked(true);
  };

  const fetchCourses = async () => {
    if (!chauffeur) return;
    setLoading(true);

    // Local-day window: the back-office plans courses in local time, so the
    // driver's "today" must match the local calendar day, not the UTC one.
    const today = new Date();
    const y = today.getFullYear();
    const m = today.getMonth();
    const d = today.getDate();
    const startOfDay = new Date(y, m, d).toISOString();
    const endOfDay = new Date(y, m, d + 1).toISOString();
    const endOfTomorrow = new Date(y, m, d + 2).toISOString();

    // Drafts and replaced courses must never reach the driver
    const visibleCourses = () =>
      supabase
        .from('courses')
        .select('*, ligne:lignes(*)')
        .eq('chauffeur_id', chauffeur.id)
        .or('is_brouillon.is.null,is_brouillon.eq.false')
        .or('statut_realisation.is.null,statut_realisation.neq.remplace');

    const [todayRes, tomorrowRes] = await Promise.all([
      visibleCourses()
        .gte('date_heure', startOfDay)
        .lt('date_heure', endOfDay)
        .order('date_heure', { ascending: true }),
      visibleCourses()
        .gte('date_heure', endOfDay)
        .lt('date_heure', endOfTomorrow)
        .order('date_heure', { ascending: true }),
    ]);

    if (todayRes.data) {
      const { data: executions } = await supabase
        .from('course_executions')
        .select('*')
        .eq('chauffeur_id', chauffeur.id)
        .in('course_id', todayRes.data.map((c) => c.id));

      const merged = todayRes.data.map((course) => ({
        ...course,
        execution: executions?.find((e) => e.course_id === course.id) || null,
      }));

      setCourses(merged as CourseWithDetails[]);
      setLastSync(new Date().toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' }));

      const astreinteCourses = todayRes.data.filter((c: any) => c.is_astreinte === true);
      const todayStr = new Date().toISOString().split('T')[0];

      // Also honor astreintes planned by the back-office in the dedicated
      // `astreintes` table (not only courses flagged is_astreinte).
      let plannedId: string | null = null;
      if (isOnline()) {
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

        if (isOnline()) {
          const { data: session } = await supabase
            .from('astreinte_sessions')
            .select('*')
            .eq('chauffeur_id', chauffeur.id)
            .eq('date', todayStr)
            .maybeSingle();
          if (session) {
            setAstreinteSession(session as AstreinteSession);
            cacheData(`astreinte_${chauffeur.id}_${todayStr}`, session);
          }
        } else {
          const cached = getCachedData<AstreinteSession>(`astreinte_${chauffeur.id}_${todayStr}`);
          if (cached) {
            setAstreinteSession(cached);
          }
        }
      }
    }

    if (tomorrowRes.data) {
      setTomorrowCourses(tomorrowRes.data as TomorrowCourse[]);
    }

    setLoading(false);
  };

  const getStatut = (course: CourseWithDetails): string => {
    if (course.execution) {
      return course.execution.statut;
    }
    return course.statut;
  };

  const getStatusLabel = (statut: string) => {
    switch (statut) {
      case 'termine':
      case 'terminee': return 'TERMINE';
      case 'en_cours': return 'EN COURS';
      case 'en_retard': return 'EN RETARD';
      case 'annulee': return 'ANNULEE';
      case 'remplacee': return 'REMPLACEE';
      case 'synchroniser': return 'A SYNCHRONISER';
      default: return 'PLANIFIE';
    }
  };

  const getStatusVariant = (statut: string): 'success' | 'warning' | 'error' | 'info' | undefined => {
    switch (statut) {
      case 'termine':
      case 'terminee': return 'success';
      case 'en_cours': return 'success';
      case 'en_retard': return 'warning';
      case 'annulee':
      case 'remplacee': return 'error';
      case 'synchroniser': return 'warning';
      default: return undefined;
    }
  };

  const handleStartAstreinte = async () => {
    if (!chauffeur) return;
    const now = new Date().toISOString();
    const todayStr = new Date().toISOString().split('T')[0];
    const localId = crypto.randomUUID();
    const sessionData = {
      id: localId,
      chauffeur_id: chauffeur.id,
      date: todayStr,
      heure_debut: now,
      astreinte_id: plannedAstreinteId,
      user_id: chauffeur.user_id || chauffeur.id,
    };

    if (isOnline()) {
      const { data } = await supabase
        .from('astreinte_sessions')
        .insert(sessionData)
        .select()
        .maybeSingle();
      if (data) {
        const session = data as AstreinteSession;
        setAstreinteSession(session);
        cacheData(`astreinte_${chauffeur.id}_${todayStr}`, session);
        return;
      }
    }

    // Offline: save locally and enqueue for sync
    const localSession: AstreinteSession = {
      id: localId,
      chauffeur_id: chauffeur.id,
      date: todayStr,
      heure_debut: now,
      heure_fin: null,
    };
    setAstreinteSession(localSession);
    cacheData(`astreinte_${chauffeur.id}_${todayStr}`, localSession);
    enqueue({ table: 'astreinte_sessions', type: 'insert', data: sessionData });
  };

  const handleEndAstreinte = async () => {
    if (!astreinteSession || !chauffeur) return;
    const now = new Date().toISOString();
    const updatedSession = { ...astreinteSession, heure_fin: now };

    if (isOnline()) {
      await supabase
        .from('astreinte_sessions')
        .update({ heure_fin: now })
        .eq('id', astreinteSession.id);
    } else {
      enqueue({
        table: 'astreinte_sessions',
        type: 'update',
        data: { heure_fin: now },
        filter: { column: 'id', value: astreinteSession.id },
      });
    }

    setAstreinteSession(updatedSession);
    const todayStr = new Date().toISOString().split('T')[0];
    cacheData(`astreinte_${chauffeur.id}_${todayStr}`, updatedSession);
  };

  const formatTime = (dateStr: string) => {
    const date = new Date(dateStr);
    return date.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
  };

  const formatDate = () => {
    const today = new Date();
    const options: Intl.DateTimeFormatOptions = { weekday: 'long', day: 'numeric', month: 'long' };
    return today.toLocaleDateString('fr-FR', options).toUpperCase();
  };

  const handleCourseClick = (course: CourseWithDetails) => {
    navigate(`/course/${course.id}`);
  };

  if (!kmChecked || loading) {
    return (
      <div className="min-h-screen bg-canvas flex items-center justify-center">
        <PSpinner size="medium" aria={{ 'aria-label': 'Chargement' }} />
      </div>
    );
  }

  if (kmRequired) {
    return (
      <KilometrageScreen
        chauffeurId={chauffeur!.id}
        type={kmRequired.type}
        mois={kmRequired.mois}
        onComplete={() => {
          setKmRequired(null);
          checkKilometrage();
        }}
      />
    );
  }

  // Astreinte: not started yet
  if (hasAstreinte && !astreinteSession) {
    const now = new Date();
    const currentTime = now.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    const astreinteCount = courses.filter((c) => c.is_astreinte).length;
    return (
      <div className="min-h-screen bg-surface flex flex-col">
        <div className="flex-1 flex flex-col items-center justify-center px-static-lg">
          <div className="w-20 h-20 rounded-full bg-[#e65c00] flex items-center justify-center mb-static-lg">
            <PIcon name="clock" size="medium" color="inherit" />
          </div>

          <PHeading size="xx-large" tag="h1" align="center">Astreinte</PHeading>

          <div className="mt-static-md bg-canvas rounded-[12px] p-static-md w-full max-w-[360px]">
            <div className="flex items-center justify-between border-b border-contrast-low pb-static-sm mb-static-sm">
              <PText size="x-small" color="contrast-medium">DATE</PText>
              <PText size="small" weight="semi-bold">{formatDate()}</PText>
            </div>
            <div className="flex items-center justify-between border-b border-contrast-low pb-static-sm mb-static-sm">
              <PText size="x-small" color="contrast-medium">HEURE ACTUELLE</PText>
              <PText size="small" weight="semi-bold">{currentTime}</PText>
            </div>
            <div className="flex items-center justify-between">
              <PText size="x-small" color="contrast-medium">COURSES ASSIGNEES</PText>
              <PText size="small" weight="semi-bold">{astreinteCount}</PText>
            </div>
          </div>
        </div>

        <div className="p-static-md pb-static-lg">
          <button
            type="button"
            onClick={handleStartAstreinte}
            className="w-full bg-[#e65c00] text-white py-5 rounded-[12px] font-bold text-center text-xl tracking-wide shadow-md"
          >
            DEMARRER L'ASTREINTE
          </button>
          <PText size="xx-small" color="contrast-medium" align="center" className="mt-static-sm">
            L'heure de debut sera horodatee automatiquement
          </PText>
        </div>
      </div>
    );
  }

  // Astreinte: ended
  if (hasAstreinte && astreinteSession?.heure_fin) {
    const debutTime = new Date(astreinteSession.heure_debut).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
    const finTime = new Date(astreinteSession.heure_fin).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
    const diffMs = new Date(astreinteSession.heure_fin).getTime() - new Date(astreinteSession.heure_debut).getTime();
    const diffH = Math.floor(diffMs / 3600000);
    const diffM = Math.floor((diffMs % 3600000) / 60000);
    const dureeStr = diffH > 0 ? `${diffH}h${diffM.toString().padStart(2, '0')}` : `${diffM} min`;
    return (
      <div className="min-h-screen bg-surface flex flex-col items-center justify-center p-static-lg">
        <div className="w-16 h-16 rounded-full bg-[#0a8a0a] flex items-center justify-center">
          <PIcon name="check" size="medium" color="inherit" />
        </div>
        <PHeading size="x-large" tag="h1" className="mt-static-md" align="center">
          Astreinte terminee
        </PHeading>

        <div className="mt-static-lg bg-canvas rounded-[12px] p-static-lg w-full max-w-[360px] shadow-low">
          <div className="flex items-center justify-between pb-static-sm border-b border-contrast-low">
            <PText size="small" color="contrast-medium">Debut</PText>
            <PText size="large" weight="bold">{debutTime}</PText>
          </div>
          <div className="flex items-center justify-between py-static-sm border-b border-contrast-low">
            <PText size="small" color="contrast-medium">Fin</PText>
            <PText size="large" weight="bold">{finTime}</PText>
          </div>
          <div className="flex items-center justify-between pt-static-sm">
            <PText size="small" color="contrast-medium">Duree totale</PText>
            <PText size="large" weight="bold">{dureeStr}</PText>
          </div>
        </div>

        <PText size="small" color="contrast-medium" className="mt-static-xl">
          Session enregistree avec succes
        </PText>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-canvas flex flex-col">
      {/* Offline banner */}
      {isOffline && (
        <div className="bg-[#f5a623] text-white text-center py-static-sm px-static-md">
          <PText size="x-small" weight="bold" color="inherit">
            <span className="text-white">MODE HORS-LIGNE - {courses.length} ELEMENTS EN ATTENTE</span>
          </PText>
        </div>
      )}

      {/* Astreinte active banner */}
      {hasAstreinte && astreinteSession && !astreinteSession.heure_fin && (
        <div className="bg-[#e65c00] text-white px-static-md py-static-md">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-static-sm">
              <div className="w-3 h-3 rounded-full bg-white animate-pulse" />
              <PText size="small" weight="bold" color="inherit">
                <span className="text-white">ASTREINTE EN COURS</span>
              </PText>
            </div>
            <span className="text-white font-mono text-lg font-bold tracking-wider">{astreinteElapsed}</span>
          </div>
          <PText size="xx-small" color="inherit" className="mt-static-xs">
            <span className="text-white opacity-80">
              Debut : {new Date(astreinteSession.heure_debut).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}
            </span>
          </PText>
        </div>
      )}

      {/* Header */}
      <div className="px-static-md pt-static-md">
        <div className="flex items-center justify-between">
          <PText size="xx-small" color="contrast-medium">{formatDate()}</PText>
          <button type="button" onClick={() => { clearAuth(); navigate('/'); }} className="flex items-center gap-static-xs">
            <PIcon name="logout" size="small" color="contrast-medium" />
            <PText size="xx-small" color="contrast-medium">Deconnexion</PText>
          </button>
        </div>
        <div className="flex items-center justify-between mt-static-xs">
          <PHeading size="x-large" tag="h1">Planning du jour</PHeading>
          <div className="text-right">
            <PText size="small" weight="bold">{chauffeur?.code || ''}</PText>
            <PText size="xx-small" color="contrast-medium">
              {chauffeur?.prenom} {chauffeur?.nom}
            </PText>
          </div>
        </div>

        {lastSync && (
          <div className="mt-static-sm bg-surface rounded-[8px] px-static-md py-static-sm">
            <PText size="xx-small" color="contrast-medium">
              Donnees en cache - derniere maj {lastSync}
            </PText>
          </div>
        )}
      </div>

      {/* Course list */}
      <div className="flex-1 px-static-md mt-static-md space-y-static-sm">
        {courses.length === 0 ? (
          <div className="text-center py-static-xl">
            <PText color="contrast-medium">Aucune course planifiee aujourd'hui</PText>
          </div>
        ) : (
          courses.map((course) => {
            const statut = getStatut(course);
            const isActive = statut === 'en_cours';
            return (
              <button
                key={course.id}
                type="button"
                onClick={() => handleCourseClick(course)}
                className={`w-full text-left rounded-[8px] border p-static-md transition-all ${
                  isActive
                    ? 'border-[#0a8a0a] border-2 bg-white'
                    : statut === 'termine'
                    ? 'border-l-4 border-l-[#0a8a0a] border-contrast-low bg-white'
                    : 'border-contrast-low bg-white'
                }`}
              >
                <div className="flex items-start justify-between">
                  <div>
                    <PText size="large" weight="bold" tag="span">
                      {formatTime(course.date_heure)}
                    </PText>
                    <div className="mt-static-xs">
                      <PText weight="semi-bold">
                        {course.ligne?.nom || course.depart || 'Course'}
                      </PText>
                      <PText size="x-small" color="contrast-medium">
                        {course.ligne
                          ? `${course.ligne.nb_arrets || 0} arrets`
                          : course.arrivee}
                      </PText>
                    </div>
                  </div>
                  <div className="flex items-center gap-static-xs">
                    {statut === 'synchroniser' && (
                      <PIcon name="refresh" size="small" color="notification-warning" />
                    )}
                    <PTag variant={getStatusVariant(statut)}>
                      {getStatusLabel(statut)}
                    </PTag>
                  </div>
                </div>
              </button>
            );
          })
        )}
      </div>

      {/* Tomorrow's planning */}
      <div className="px-static-md mt-static-md">
        <button
          type="button"
          onClick={() => setShowTomorrow(!showTomorrow)}
          className="w-full flex items-center justify-between bg-surface rounded-[8px] p-static-md"
        >
          <div className="flex items-center gap-static-sm">
            <PIcon name="calendar" size="small" />
            <PText weight="semi-bold">Planning demain</PText>
          </div>
          <div className="flex items-center gap-static-xs">
            <PTag>{tomorrowCourses.length}</PTag>
            <PIcon name={showTomorrow ? 'arrow-head-up' : 'arrow-head-down'} size="small" />
          </div>
        </button>

        {showTomorrow && (
          <div className="mt-static-sm space-y-static-xs">
            {tomorrowCourses.length === 0 ? (
              <div className="text-center py-static-md">
                <PText size="small" color="contrast-medium">Aucune course prevue demain</PText>
              </div>
            ) : (
              tomorrowCourses.map((course) => (
                <div key={course.id} className="bg-white border border-contrast-low rounded-[8px] p-static-sm flex items-center justify-between">
                  <div className="flex items-center gap-static-sm">
                    <PText size="small" weight="bold">{formatTime(course.date_heure)}</PText>
                    <PText size="small">{course.ligne?.nom || course.depart || 'Course'}</PText>
                  </div>
                  <PTag variant="info">PROGRAMME</PTag>
                </div>
              ))
            )}
          </div>
        )}
      </div>

      {/* Bottom actions */}
      <div className="sticky bottom-0 left-0 right-0 p-static-md bg-canvas border-t border-contrast-low space-y-static-sm">
        {hasAstreinte && astreinteSession && !astreinteSession.heure_fin && (
          <button
            type="button"
            onClick={handleEndAstreinte}
            className="w-full border-2 border-[#e65c00] text-[#e65c00] bg-white py-4 rounded-[12px] font-bold text-center flex items-center justify-center gap-static-sm text-base"
          >
            <PIcon name="close" color="inherit" />
            <span>TERMINER L'ASTREINTE</span>
          </button>
        )}
        <button
          type="button"
          onClick={() => setShowIncident(true)}
          className="w-full bg-[#c0392b] text-white py-4 rounded-[12px] font-bold text-center flex items-center justify-center gap-static-sm text-base"
        >
          <PIcon name="exclamation" color="inherit" />
          <span>SIGNALER UN INCIDENT</span>
        </button>
      </div>

      {/* Incident sheet */}
      {showIncident && (
        <IncidentSheet
          onClose={() => setShowIncident(false)}
          chauffeurId={chauffeur?.id || ''}
          userId={chauffeur?.user_id || chauffeur?.id || ''}
        />
      )}
    </div>
  );
}
