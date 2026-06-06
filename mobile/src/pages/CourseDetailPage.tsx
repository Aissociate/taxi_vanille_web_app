import { useEffect, useState, useRef, useCallback } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { PHeading, PText, PIcon, PSpinner } from '@porsche-design-system/components-react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../lib/store';
import { enqueue, isOnline, cacheData, getCachedData } from '../lib/offlineQueue';
import { getCurrentPosition, requestLocationPermission } from '../lib/native';
import type { Course, CourseExecution, LigneArret } from '../lib/types';

type Step = 'preview' | 'depart' | 'arrivee';

export default function CourseDetailPage() {
  const { courseId } = useParams<{ courseId: string }>();
  const { chauffeur } = useAuth();
  const navigate = useNavigate();
  const [course, setCourse] = useState<(Course & { ligne?: { nom: string; nb_arrets: number } }) | null>(null);
  const [execution, setExecution] = useState<CourseExecution | null>(null);
  const [arrets, setArrets] = useState<LigneArret[]>([]);
  const [step, setStep] = useState<Step>('preview');
  const [passagersDepart, setPassagersDepart] = useState(0);
  const [passagersArrivee, setPassagersArrivee] = useState(0);
  const [loading, setLoading] = useState(true);
  const [elapsedTime, setElapsedTime] = useState('00:00:00');
  const gpsIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const startTimeRef = useRef<Date | null>(null);

  useEffect(() => {
    if (!chauffeur) {
      navigate('/');
      return;
    }
    fetchData();
    return () => {
      if (gpsIntervalRef.current) clearInterval(gpsIntervalRef.current);
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [chauffeur, courseId, navigate]);

  const fetchData = async () => {
    if (!courseId || !chauffeur) return;
    setLoading(true);

    if (isOnline()) {
      const { data: courseData } = await supabase
        .from('courses')
        .select('*, ligne:lignes(*)')
        .eq('id', courseId)
        .maybeSingle();

      if (!courseData) {
        navigate('/planning');
        return;
      }
      setCourse(courseData as any);
      cacheData(`course_${courseId}`, courseData);

      if (courseData.ligne_id) {
        const { data: arretsData } = await supabase
          .from('ligne_arrets')
          .select('*')
          .eq('ligne_id', courseData.ligne_id)
          .order('ordre', { ascending: true });

        if (arretsData) {
          setArrets(arretsData);
          cacheData(`arrets_${courseData.ligne_id}`, arretsData);
        }
      }

      const { data: execData } = await supabase
        .from('course_executions')
        .select('*')
        .eq('course_id', courseId)
        .eq('chauffeur_id', chauffeur.id)
        .maybeSingle();

      if (execData) {
        setExecution(execData as CourseExecution);
        cacheData(`exec_${courseId}`, execData);
        if (execData.heure_debut) {
          startTimeRef.current = new Date(execData.heure_debut);
          startTimer();
          startGpsTracking(execData.id);
        }
        if (execData.statut === 'en_cours') {
          setStep('arrivee');
        }
      }
    } else {
      // Load from cache
      const cachedCourse = getCachedData<any>(`course_${courseId}`);
      if (!cachedCourse) {
        navigate('/planning');
        return;
      }
      setCourse(cachedCourse);

      if (cachedCourse.ligne_id) {
        const cachedArrets = getCachedData<LigneArret[]>(`arrets_${cachedCourse.ligne_id}`);
        if (cachedArrets) setArrets(cachedArrets);
      }

      const cachedExec = getCachedData<CourseExecution>(`exec_${courseId}`);
      if (cachedExec) {
        setExecution(cachedExec);
        if (cachedExec.heure_debut) {
          startTimeRef.current = new Date(cachedExec.heure_debut);
          startTimer();
        }
        if (cachedExec.statut === 'en_cours') {
          setStep('arrivee');
        }
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

      const pingData = {
        course_execution_id: executionId,
        chauffeur_id: chauffeur.id,
        latitude: pos.latitude,
        longitude: pos.longitude,
        recorded_at: new Date().toISOString(),
      };

      if (isOnline()) {
        await supabase.from('gps_pings').insert(pingData);
      } else {
        enqueue({ table: 'gps_pings', type: 'insert', data: pingData });
      }
    } catch {
      // GPS unavailable
    }
  }, [chauffeur]);

  const startGpsTracking = async (executionId: string) => {
    if (gpsIntervalRef.current) return;
    await requestLocationPermission();
    sendGpsPing(executionId);
    gpsIntervalRef.current = setInterval(() => sendGpsPing(executionId), 60000);
  };

  const handleStart = async () => {
    if (!courseId || !chauffeur) return;
    setStep('depart');
  };

  const handleValidateDepart = async () => {
    if (!courseId || !chauffeur) return;

    const now = new Date();
    startTimeRef.current = now;

    const scheduledTime = new Date(course!.date_heure);
    const diffMinutes = (now.getTime() - scheduledTime.getTime()) / 60000;
    const courseStatut = diffMinutes > 10 ? 'en_retard' : 'en_cours';

    const executionId = crypto.randomUUID();
    const userId = chauffeur.user_id || chauffeur.id;

    const courseUpdate = { statut: courseStatut };
    const executionData = {
      id: executionId,
      course_id: courseId,
      chauffeur_id: chauffeur.id,
      statut: 'en_cours',
      heure_debut: now.toISOString(),
      user_id: userId,
    };

    const arretDepartData = arrets.length > 0 ? {
      course_execution_id: executionId,
      arret_id: arrets[0].id,
      ordre: 0,
      montants: passagersDepart,
      descendants: 0,
      statut: 'termine',
      heure_arrivee: now.toISOString(),
      heure_depart: now.toISOString(),
      user_id: userId,
    } : null;

    if (isOnline()) {
      await supabase.from('courses').update(courseUpdate).eq('id', courseId);
      const { data } = await supabase
        .from('course_executions')
        .insert(executionData)
        .select()
        .maybeSingle();

      if (data) {
        setExecution(data as CourseExecution);
        cacheData(`exec_${courseId}`, data);
        if (arretDepartData) {
          await supabase.from('arret_executions').insert({ ...arretDepartData, course_execution_id: data.id });
        }
        startGpsTracking(data.id);
      }
    } else {
      enqueue({ table: 'courses', type: 'update', data: courseUpdate, filter: { column: 'id', value: courseId } });
      enqueue({ table: 'course_executions', type: 'insert', data: executionData });
      if (arretDepartData) {
        enqueue({ table: 'arret_executions', type: 'insert', data: arretDepartData });
      }

      const localExec = executionData as unknown as CourseExecution;
      setExecution(localExec);
      cacheData(`exec_${courseId}`, localExec);
    }

    startTimer();
    setStep('arrivee');
  };

  const handleTerminer = async () => {
    if (!execution || !courseId || !chauffeur) return;

    const now = new Date();
    const userId = chauffeur.user_id || chauffeur.id;

    const arretArriveeData = arrets.length > 1 ? {
      course_execution_id: execution.id,
      arret_id: arrets[arrets.length - 1].id,
      ordre: arrets.length - 1,
      montants: 0,
      descendants: passagersArrivee,
      statut: 'termine',
      heure_arrivee: now.toISOString(),
      heure_depart: now.toISOString(),
      user_id: userId,
    } : null;

    const execUpdate = { statut: 'termine', heure_fin: now.toISOString() };
    const courseUpdate = { statut: 'terminee' };

    if (isOnline()) {
      if (arretArriveeData) {
        await supabase.from('arret_executions').insert(arretArriveeData);
      }
      await supabase.from('course_executions').update(execUpdate).eq('id', execution.id);
      await supabase.from('courses').update(courseUpdate).eq('id', courseId);
    } else {
      if (arretArriveeData) {
        enqueue({ table: 'arret_executions', type: 'insert', data: arretArriveeData });
      }
      enqueue({ table: 'course_executions', type: 'update', data: execUpdate, filter: { column: 'id', value: execution.id } });
      enqueue({ table: 'courses', type: 'update', data: courseUpdate, filter: { column: 'id', value: courseId } });
    }

    if (gpsIntervalRef.current) clearInterval(gpsIntervalRef.current);
    if (timerRef.current) clearInterval(timerRef.current);

    navigate('/planning');
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-canvas flex items-center justify-center">
        <PSpinner size="medium" aria={{ 'aria-label': 'Chargement' }} />
      </div>
    );
  }

  if (!course) return null;

  const firstArret = arrets[0];
  const lastArret = arrets[arrets.length - 1];

  if (step === 'preview') {
    return (
      <div className="min-h-screen bg-canvas flex flex-col p-static-md">
        <button type="button" onClick={() => navigate('/planning')} className="mb-static-md self-start">
          <PIcon name="arrow-left" />
        </button>
        <PHeading size="large" tag="h1">
          {course.ligne?.nom || `${course.depart} → ${course.arrivee}`}
        </PHeading>
        <PText color="contrast-medium" className="mt-static-sm">
          {arrets.length} arrets - Depart prevu {new Date(course.date_heure).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}
        </PText>

        <div className="mt-static-lg space-y-static-sm">
          {arrets.map((arret, i) => (
            <div key={arret.id} className="flex items-center gap-static-sm p-static-sm border border-contrast-low rounded-[8px]">
              <span className="text-sm font-bold text-contrast-medium w-6">{i + 1}</span>
              <PText size="small">{arret.nom}</PText>
              {i === 0 && <PText size="xx-small" color="contrast-medium" className="ml-auto">Depart</PText>}
              {i === arrets.length - 1 && <PText size="xx-small" color="contrast-medium" className="ml-auto">Terminus</PText>}
            </div>
          ))}
        </div>

        <div className="mt-auto pt-static-lg">
          <button
            type="button"
            onClick={handleStart}
            className="w-full bg-[#0a8a0a] text-white py-static-md rounded-[8px] font-bold text-center text-lg"
          >
            DEMARRER LA COURSE
          </button>
        </div>
      </div>
    );
  }

  if (step === 'depart') {
    return (
      <div className="min-h-screen bg-canvas flex flex-col">
        <div className="p-static-md">
          <PText size="xx-small" weight="semi-bold" color="contrast-medium">
            {course.ligne?.nom?.toUpperCase() || ''}
          </PText>
          <PHeading size="large" tag="h1">Terminus depart</PHeading>
        </div>

        {firstArret && (
          <div className="mx-static-md p-static-md border border-contrast-low rounded-[8px]">
            <PText size="xx-small" color="contrast-medium">ARRET DE DEPART</PText>
            <PHeading size="medium" tag="h2" className="mt-static-xs">
              {firstArret.nom}
            </PHeading>
          </div>
        )}

        <div className="mx-static-md mt-static-lg p-static-md border border-contrast-low rounded-[8px]">
          <PText size="xx-small" weight="semi-bold" color="contrast-medium" className="text-center">
            PASSAGERS MONTANTS
          </PText>
          <div className="flex items-center justify-center gap-static-md mt-static-md">
            <button
              type="button"
              onClick={() => setPassagersDepart(Math.max(0, passagersDepart - 1))}
              className="w-14 h-14 rounded-full border-2 border-primary flex items-center justify-center text-2xl font-bold"
            >
              -
            </button>
            <span className="text-[48px] font-bold w-16 text-center">{passagersDepart}</span>
            <button
              type="button"
              onClick={() => setPassagersDepart(passagersDepart + 1)}
              className="w-14 h-14 rounded-full bg-primary text-white flex items-center justify-center text-2xl font-bold"
            >
              +
            </button>
          </div>
        </div>

        <div className="mx-static-md mt-static-lg p-static-md border border-contrast-low rounded-[8px] flex items-center justify-between">
          <span className="text-[40px] font-bold">{passagersDepart}</span>
          <PText size="small" color="contrast-medium">passagers<br />a bord</PText>
        </div>

        <div className="sticky bottom-0 left-0 right-0 p-static-md bg-canvas">
          <button
            type="button"
            onClick={handleValidateDepart}
            className="w-full bg-[#e65c00] text-white py-static-md rounded-[8px] font-bold text-center text-lg"
          >
            VALIDER ET PARTIR
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-canvas flex flex-col">
      <div className="p-static-md">
        <div className="flex items-center justify-between">
          <div>
            <PText size="xx-small" weight="semi-bold" color="contrast-medium">
              {course.ligne?.nom?.toUpperCase() || ''}
            </PText>
            <PHeading size="large" tag="h1">Terminus arrivee</PHeading>
          </div>
          <div className="text-right">
            <PText size="xx-small" color="contrast-medium">TEMPS</PText>
            <PText size="small" weight="bold">{elapsedTime}</PText>
          </div>
        </div>
      </div>

      {lastArret && (
        <div className="mx-static-md p-static-md border border-contrast-low rounded-[8px]">
          <PText size="xx-small" color="contrast-medium">ARRET D'ARRIVEE</PText>
          <PHeading size="medium" tag="h2" className="mt-static-xs">
            {lastArret.nom}
          </PHeading>
        </div>
      )}

      <div className="mx-static-md mt-static-lg p-static-md border border-contrast-low rounded-[8px]">
        <PText size="xx-small" weight="semi-bold" color="contrast-medium" className="text-center">
          PASSAGERS DESCENDANTS
        </PText>
        <div className="flex items-center justify-center gap-static-md mt-static-md">
          <button
            type="button"
            onClick={() => setPassagersArrivee(Math.max(0, passagersArrivee - 1))}
            className="w-14 h-14 rounded-full border-2 border-primary flex items-center justify-center text-2xl font-bold"
          >
            -
          </button>
          <span className="text-[48px] font-bold w-16 text-center">{passagersArrivee}</span>
          <button
            type="button"
            onClick={() => setPassagersArrivee(passagersArrivee + 1)}
            className="w-14 h-14 rounded-full bg-primary text-white flex items-center justify-center text-2xl font-bold"
          >
            +
          </button>
        </div>
      </div>

      <div className="mx-static-md mt-static-lg p-static-md border border-contrast-low rounded-[8px] flex items-center justify-between">
        <span className="text-[40px] font-bold">{passagersDepart - passagersArrivee}</span>
        <PText size="small" color="contrast-medium">passagers<br />restants</PText>
      </div>

      <div className="fixed bottom-0 left-0 right-0 p-static-md bg-canvas">
        <button
          type="button"
          onClick={handleTerminer}
          className="w-full bg-[#e65c00] text-white py-static-md rounded-[8px] font-bold text-center text-lg"
        >
          TERMINER LA COURSE
        </button>
      </div>
    </div>
  );
}
