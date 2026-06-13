import { useEffect, useState, useRef, useCallback } from 'react';
import { ArrowLeft, AlertTriangle } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../lib/store';
import { enqueue, isOnline, cacheData, getCachedData } from '../lib/offlineQueue';
import { getCurrentPosition, requestLocationPermission } from '../lib/native';
import MobileIncidentSheet from '../components/MobileIncidentSheet';
import type { Course, CourseExecution, LigneArret } from '../lib/types';

type Step = 'preview' | 'depart' | 'arrivee';

interface Props {
  courseId: string;
  onNavigate: (path: string) => void;
}

export default function MobileCourseDetailPage({ courseId, onNavigate }: Props) {
  const { chauffeur } = useAuth();
  const [course, setCourse] = useState<(Course & { ligne?: { nom: string; nb_arrets: number } }) | null>(null);
  const [execution, setExecution] = useState<CourseExecution | null>(null);
  const [arrets, setArrets] = useState<LigneArret[]>([]);
  const [step, setStep] = useState<Step>('preview');
  const [passagersDepart, setPassagersDepart] = useState(0);
  const [passagersArrivee, setPassagersArrivee] = useState(0);
  const [loading, setLoading] = useState(true);
  const [elapsedTime, setElapsedTime] = useState('00:00:00');
  const [showIncident, setShowIncident] = useState(false);
  const gpsIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const startTimeRef = useRef<Date | null>(null);

  useEffect(() => {
    if (!chauffeur) { onNavigate('/mobile'); return; }
    fetchData();
    return () => {
      if (gpsIntervalRef.current) clearInterval(gpsIntervalRef.current);
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [chauffeur, courseId]);

  const fetchData = async () => {
    if (!courseId || !chauffeur) return;
    setLoading(true);

    if (isOnline()) {
      const { data: courseData } = await supabase.from('courses').select('*, ligne:lignes(*)').eq('id', courseId).maybeSingle();
      if (!courseData) { onNavigate('/mobile/planning'); return; }
      if (courseData.statut_realisation === 'termine' || courseData.statut === 'terminee') { onNavigate('/mobile/planning'); return; }
      setCourse(courseData as any);
      cacheData(`course_${courseId}`, courseData);

      if (courseData.ligne_id) {
        const { data: arretsData } = await supabase.from('ligne_arrets').select('*').eq('ligne_id', courseData.ligne_id).order('ordre', { ascending: true });
        if (arretsData) { setArrets(arretsData); cacheData(`arrets_${courseData.ligne_id}`, arretsData); }
      }

      const { data: execData } = await supabase.from('course_executions').select('*').eq('course_id', courseId).eq('chauffeur_id', chauffeur.id).maybeSingle();
      if (execData) {
        setExecution(execData as CourseExecution);
        cacheData(`exec_${courseId}`, execData);
        if (execData.heure_debut) { startTimeRef.current = new Date(execData.heure_debut); startTimer(); startGpsTracking(execData.id); }
        if (execData.statut === 'en_cours') setStep('arrivee');
      }
    } else {
      const cachedCourse = getCachedData<any>(`course_${courseId}`);
      if (!cachedCourse) { onNavigate('/mobile/planning'); return; }
      setCourse(cachedCourse);
      if (cachedCourse.ligne_id) { const ca = getCachedData<LigneArret[]>(`arrets_${cachedCourse.ligne_id}`); if (ca) setArrets(ca); }
      const cachedExec = getCachedData<CourseExecution>(`exec_${courseId}`);
      if (cachedExec) {
        setExecution(cachedExec);
        if (cachedExec.heure_debut) { startTimeRef.current = new Date(cachedExec.heure_debut); startTimer(); }
        if (cachedExec.statut === 'en_cours') setStep('arrivee');
      }
    }
    setLoading(false);
  };

  const startTimer = () => {
    if (timerRef.current) return;
    timerRef.current = setInterval(() => {
      if (!startTimeRef.current) return;
      const diff = Date.now() - startTimeRef.current.getTime();
      const h = Math.floor(diff / 3600000).toString().padStart(2, '0');
      const m = Math.floor((diff % 3600000) / 60000).toString().padStart(2, '0');
      const s = Math.floor((diff % 60000) / 1000).toString().padStart(2, '0');
      setElapsedTime(`${h}:${m}:${s}`);
    }, 1000);
  };

  const sendGpsPing = useCallback(async (executionId: string) => {
    if (!chauffeur) return;
    try {
      const pos = await getCurrentPosition();
      if (!pos) return;
      const pingData = { course_execution_id: executionId, chauffeur_id: chauffeur.id, latitude: pos.latitude, longitude: pos.longitude, recorded_at: new Date().toISOString() };
      if (isOnline()) { await supabase.from('gps_pings').insert(pingData); }
      else { enqueue({ table: 'gps_pings', type: 'insert', data: pingData }); }
    } catch { /* GPS unavailable */ }
  }, [chauffeur]);

  const startGpsTracking = async (executionId: string) => {
    if (gpsIntervalRef.current) return;
    await requestLocationPermission();
    sendGpsPing(executionId);
    gpsIntervalRef.current = setInterval(() => sendGpsPing(executionId), 60000);
  };

  const handleStart = () => { setStep('depart'); };

  const handleValidateDepart = async () => {
    if (!courseId || !chauffeur) return;
    const now = new Date();
    startTimeRef.current = now;
    const scheduledTime = new Date(course!.date_heure);
    const diffMinutes = (now.getTime() - scheduledTime.getTime()) / 60000;
    const courseStatut = diffMinutes > 10 ? 'en_retard' : 'en_cours';
    const executionId = crypto.randomUUID();
    const userId = chauffeur.user_id || chauffeur.id;
    const courseUpdate = { statut: courseStatut, statut_realisation: 'en_cours', passagers_depart: passagersDepart };
    const executionData = { id: executionId, course_id: courseId, chauffeur_id: chauffeur.id, statut: 'en_cours', heure_debut: now.toISOString(), user_id: userId };
    const arretDepartData = arrets.length > 0 ? { course_execution_id: executionId, arret_id: arrets[0].id, ordre: 0, montants: passagersDepart, descendants: 0, statut: 'termine', heure_arrivee: now.toISOString(), heure_depart: now.toISOString(), user_id: userId } : null;

    if (isOnline()) {
      await supabase.from('courses').update(courseUpdate).eq('id', courseId);
      const { data } = await supabase.from('course_executions').insert(executionData).select().maybeSingle();
      if (data) {
        setExecution(data as CourseExecution);
        cacheData(`exec_${courseId}`, data);
        if (arretDepartData) await supabase.from('arret_executions').insert({ ...arretDepartData, course_execution_id: data.id });
        startGpsTracking(data.id);
      }
    } else {
      enqueue({ table: 'courses', type: 'update', data: courseUpdate, filter: { column: 'id', value: courseId } });
      enqueue({ table: 'course_executions', type: 'insert', data: executionData });
      if (arretDepartData) enqueue({ table: 'arret_executions', type: 'insert', data: arretDepartData });
      setExecution(executionData as unknown as CourseExecution);
      cacheData(`exec_${courseId}`, executionData);
    }
    startTimer();
    setStep('arrivee');
  };

  const handleTerminer = async () => {
    if (!execution || !courseId || !chauffeur) return;
    const now = new Date();
    const userId = chauffeur.user_id || chauffeur.id;
    const arretArriveeData = arrets.length > 1 ? { course_execution_id: execution.id, arret_id: arrets[arrets.length - 1].id, ordre: arrets.length - 1, montants: 0, descendants: passagersArrivee, statut: 'termine', heure_arrivee: now.toISOString(), heure_depart: now.toISOString(), user_id: userId } : null;
    const execUpdate = { statut: 'termine', heure_fin: now.toISOString() };

    let montant = 0;
    if (isOnline() && course?.date_heure) {
      const d = new Date(course.date_heure);
      const dow = d.getDay();
      let typeJour = 'lun_ven';
      if (dow === 6) typeJour = 'samedi';
      else if (dow === 0) typeJour = 'dimanche';
      const heure = `${d.getHours().toString().padStart(2, '0')}:${d.getMinutes().toString().padStart(2, '0')}`;
      const { data: plages } = await supabase.from('tarif_plages').select('tarif').eq('type_jour', typeJour).lte('heure_debut', heure).gt('heure_fin', heure);
      if (plages && plages.length > 0) montant = plages[0].tarif || 0;
    }

    const courseUpdate = { statut: 'terminee', statut_realisation: 'termine', passagers_arrivee: passagersArrivee, nb_passagers: Math.max(passagersDepart, passagersArrivee), montant };

    if (isOnline()) {
      if (arretArriveeData) await supabase.from('arret_executions').insert(arretArriveeData);
      await supabase.from('course_executions').update(execUpdate).eq('id', execution.id);
      await supabase.from('courses').update(courseUpdate).eq('id', courseId);
    } else {
      if (arretArriveeData) enqueue({ table: 'arret_executions', type: 'insert', data: arretArriveeData });
      enqueue({ table: 'course_executions', type: 'update', data: execUpdate, filter: { column: 'id', value: execution.id } });
      enqueue({ table: 'courses', type: 'update', data: courseUpdate, filter: { column: 'id', value: courseId } });
    }
    if (gpsIntervalRef.current) clearInterval(gpsIntervalRef.current);
    if (timerRef.current) clearInterval(timerRef.current);
    onNavigate('/mobile/planning');
  };

  if (loading) {
    return <div className="min-h-screen bg-gray-50 flex items-center justify-center"><div className="w-8 h-8 border-4 border-orange-500 border-t-transparent rounded-full animate-spin" /></div>;
  }
  if (!course) return null;

  const firstArret = arrets[0];
  const lastArret = arrets[arrets.length - 1];
  const maxPassagers = chauffeur && chauffeur.vehicule_places > 1 ? chauffeur.vehicule_places - 1 : 8;

  if (step === 'preview') {
    return (
      <div className="min-h-screen bg-gray-50 flex flex-col p-4">
        <button type="button" onClick={() => onNavigate('/mobile/planning')} className="mb-4 self-start"><ArrowLeft size={20} /></button>
        <h1 className="text-2xl font-bold text-gray-900">{course.ligne?.nom || `${course.depart} - ${course.arrivee}`}</h1>
        <p className="text-sm text-gray-500 mt-2">{arrets.length} arrets - Depart prevu {new Date(course.date_heure).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}</p>
        <div className="mt-6 space-y-2">
          {arrets.map((arret, i) => (
            <div key={arret.id} className="flex items-center gap-3 p-3 border border-gray-200 rounded-lg bg-white">
              <span className="text-sm font-bold text-gray-400 w-6">{i + 1}</span>
              <span className="text-sm text-gray-800">{arret.nom}</span>
              {i === 0 && <span className="ml-auto text-[10px] text-gray-400">Depart</span>}
              {i === arrets.length - 1 && <span className="ml-auto text-[10px] text-gray-400">Terminus</span>}
            </div>
          ))}
        </div>
        <div className="mt-auto pt-6">
          <button type="button" onClick={handleStart} className="w-full bg-green-700 text-white py-4 rounded-lg font-bold text-lg active:bg-green-800">DEMARRER LA COURSE</button>
        </div>
      </div>
    );
  }

  if (step === 'depart') {
    return (
      <div className="min-h-screen bg-gray-50 flex flex-col">
        <div className="p-4">
          <p className="text-[10px] font-semibold text-gray-500 uppercase">{course.ligne?.nom?.toUpperCase() || ''}</p>
          <h1 className="text-2xl font-bold text-gray-900">Terminus depart</h1>
        </div>
        {firstArret && (
          <div className="mx-4 p-4 border border-gray-200 rounded-lg bg-white">
            <p className="text-[10px] text-gray-400">ARRET DE DEPART</p>
            <h2 className="text-lg font-bold mt-1">{firstArret.nom}</h2>
          </div>
        )}
        <div className="mx-4 mt-6 p-4 border border-gray-200 rounded-lg bg-white">
          <p className="text-[10px] font-semibold text-gray-500 text-center uppercase">PASSAGERS MONTANTS</p>
          <div className="flex items-center justify-center gap-6 mt-4">
            <button type="button" onClick={() => setPassagersDepart(Math.max(0, passagersDepart - 1))} className="w-14 h-14 rounded-full border-2 border-gray-900 flex items-center justify-center text-2xl font-bold">-</button>
            <span className="text-5xl font-bold w-16 text-center">{passagersDepart}</span>
            <button type="button" onClick={() => setPassagersDepart(Math.min(maxPassagers, passagersDepart + 1))} className="w-14 h-14 rounded-full bg-gray-900 text-white flex items-center justify-center text-2xl font-bold">+</button>
          </div>
          <p className="text-[10px] text-center text-gray-400 mt-2">{maxPassagers} passagers maximum</p>
        </div>
        <div className="mx-4 mt-6 p-4 border border-gray-200 rounded-lg bg-white flex items-center justify-between">
          <span className="text-4xl font-bold">{passagersDepart}</span>
          <span className="text-sm text-gray-500">passagers<br/>a bord</span>
        </div>
        <div className="sticky bottom-0 left-0 right-0 p-4 bg-gray-50">
          <button type="button" onClick={handleValidateDepart} className="w-full bg-orange-600 text-white py-4 rounded-lg font-bold text-lg active:bg-orange-700">VALIDER ET PARTIR</button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      <div className="p-4">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-[10px] font-semibold text-gray-500 uppercase">{course.ligne?.nom?.toUpperCase() || ''}</p>
            <h1 className="text-2xl font-bold text-gray-900">Terminus arrivee</h1>
          </div>
          <div className="text-right">
            <p className="text-[10px] text-gray-400">TEMPS</p>
            <p className="text-sm font-bold font-mono">{elapsedTime}</p>
          </div>
        </div>
      </div>
      {lastArret && (
        <div className="mx-4 p-4 border border-gray-200 rounded-lg bg-white">
          <p className="text-[10px] text-gray-400">ARRET D'ARRIVEE</p>
          <h2 className="text-lg font-bold mt-1">{lastArret.nom}</h2>
        </div>
      )}
      <div className="mx-4 mt-6 p-4 border border-gray-200 rounded-lg bg-white">
        <p className="text-[10px] font-semibold text-gray-500 text-center uppercase">PASSAGERS DESCENDANTS</p>
        <div className="flex items-center justify-center gap-6 mt-4">
          <button type="button" onClick={() => setPassagersArrivee(Math.max(0, passagersArrivee - 1))} className="w-14 h-14 rounded-full border-2 border-gray-900 flex items-center justify-center text-2xl font-bold">-</button>
          <span className="text-5xl font-bold w-16 text-center">{passagersArrivee}</span>
          <button type="button" onClick={() => setPassagersArrivee(Math.min(maxPassagers, passagersArrivee + 1))} className="w-14 h-14 rounded-full bg-gray-900 text-white flex items-center justify-center text-2xl font-bold">+</button>
        </div>
        <p className="text-[10px] text-center text-gray-400 mt-2">{maxPassagers} passagers maximum</p>
      </div>
      <div className="flex-1" />
      <div className="sticky bottom-0 left-0 right-0 p-4 bg-gray-50 mt-6 space-y-2">
        <button type="button" onClick={() => setShowIncident(true)} className="w-full flex items-center justify-center gap-2 bg-red-50 border border-red-200 text-red-700 py-3 rounded-lg font-semibold text-sm active:bg-red-100">
          <AlertTriangle size={16} /> SIGNALER UN INCIDENT
        </button>
        <button type="button" onClick={handleTerminer} disabled={passagersArrivee === 0} className="w-full bg-orange-600 text-white py-4 rounded-lg font-bold text-lg active:bg-orange-700 disabled:bg-gray-300 disabled:cursor-not-allowed">TERMINER LA COURSE</button>
        {passagersArrivee === 0 && <p className="text-[10px] text-center text-red-500">Saisir le nombre de passagers descendants avant de terminer</p>}
      </div>
      {showIncident && chauffeur && (
        <MobileIncidentSheet
          onClose={() => setShowIncident(false)}
          chauffeurId={chauffeur.id}
          userId={chauffeur.user_id || chauffeur.id}
          courseId={courseId}
        />
      )}
    </div>
  );
}
