import { useEffect, useRef, useState } from 'react';
import { ArrowLeft, Play, Square, Check, Timer } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../lib/timerStore';
import { timerInsert, timerUpdate, isOnline } from '../lib/timerSync';
import { mDateStr, fmtHM } from '../../lib/mayotte';

interface Arret { id: string; nom: string; ordre: number }
interface CourseInfo { id: string; date_heure: string; depart: string | null; arrivee: string | null; ligne_id: string | null; ligne: { nom: string } | null }
interface Recorded { ordre: number; depart: string; arrivee: string; duree: number }

interface Props {
  courseId: string;
  onNavigate: (path: string) => void;
}

function fmtChrono(sec: number): string {
  const m = Math.floor(sec / 60).toString().padStart(2, '0');
  const s = Math.floor(sec % 60).toString().padStart(2, '0');
  return `${m}:${s}`;
}

// Chronometrage des SEGMENTS d'une course : 1 bouton alterne Start (depart d'un
// arret) / Stop (arrivee au suivant). Chaque segment = 1 ligne timer_segments.
// Aucune ecriture dans courses/course_executions : impact zero sur la facturation.
export default function TimerCoursePage({ courseId, onNavigate }: Props) {
  const { chauffeur } = useAuth();
  const [course, setCourse] = useState<CourseInfo | null>(null);
  const [arrets, setArrets] = useState<Arret[]>([]);
  const [loading, setLoading] = useState(true);

  const [idx, setIdx] = useState(0);          // segment courant = arret[idx] -> arret[idx+1]
  const [running, setRunning] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [recorded, setRecorded] = useState<Recorded[]>([]);
  const startRef = useRef<number | null>(null);
  const activeIdRef = useRef<string | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (!chauffeur) { onNavigate('/timer'); return; }
    (async () => {
      const { data: c } = await supabase
        .from('courses')
        .select('id, date_heure, depart, arrivee, ligne_id, ligne:lignes(nom)')
        .eq('id', courseId).maybeSingle();
      if (!c) { onNavigate('/timer/planning'); return; }
      setCourse(c as unknown as CourseInfo);
      if (c.ligne_id) {
        const { data: a } = await supabase
          .from('ligne_arrets').select('id, nom, ordre')
          .eq('ligne_id', c.ligne_id).order('ordre', { ascending: true });
        if (a) setArrets(a as Arret[]);
      }
      setLoading(false);
    })();
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [chauffeur, courseId, onNavigate]);

  const nbSegments = Math.max(0, arrets.length - 1);
  const done = arrets.length > 0 && idx >= nbSegments;
  const arretDepart = arrets[idx];
  const arretArrivee = arrets[idx + 1];

  const handleStart = async () => {
    if (!chauffeur || !course || !arretDepart || !arretArrivee || running) return;
    const now = new Date();
    const id = crypto.randomUUID();
    activeIdRef.current = id;
    startRef.current = now.getTime();
    setElapsed(0);
    setRunning(true);
    timerRef.current = setInterval(() => {
      if (startRef.current) setElapsed(Math.floor((Date.now() - startRef.current) / 1000));
    }, 1000);
    await timerInsert({
      id,
      course_id: course.id,
      ligne_id: course.ligne_id,
      chauffeur_id: chauffeur.id,
      arret_depart_id: arretDepart.id,
      arret_arrivee_id: arretArrivee.id,
      ordre: idx,
      heure_start: now.toISOString(),
      jour: mDateStr(course.date_heure),
      user_id: chauffeur.user_id || chauffeur.id,
    });
  };

  const handleStop = async () => {
    if (!running || !activeIdRef.current || !arretDepart || !arretArrivee || startRef.current == null) return;
    const now = new Date();
    const duree = Math.round((now.getTime() - startRef.current) / 1000);
    if (timerRef.current) clearInterval(timerRef.current);
    setRunning(false);
    setRecorded((r) => [...r, { ordre: idx, depart: arretDepart.nom, arrivee: arretArrivee.nom, duree }]);
    await timerUpdate(activeIdRef.current, { heure_stop: now.toISOString(), duree_secondes: duree });
    activeIdRef.current = null;
    setIdx((i) => i + 1);
    setElapsed(0);
  };

  if (loading) {
    return <div className="min-h-screen bg-indigo-950 flex items-center justify-center"><div className="w-8 h-8 border-4 border-indigo-400 border-t-transparent rounded-full animate-spin" /></div>;
  }
  if (!course) return null;

  return (
    <div className="min-h-screen bg-indigo-950 text-white flex flex-col">
      <div className="bg-indigo-600 px-4 py-3 flex items-center gap-2 sticky top-0 z-10">
        <button onClick={() => onNavigate('/timer/planning')} className="mr-1"><ArrowLeft size={20} /></button>
        <Timer size={18} />
        <span className="text-base font-black tracking-widest uppercase">Mode Timer</span>
      </div>

      <div className="px-4 pt-4">
        <h1 className="text-xl font-bold">{course.ligne?.nom || `${course.depart} → ${course.arrivee}`}</h1>
        <p className="text-[11px] text-indigo-300 mt-0.5">Depart prevu {fmtHM(course.date_heure)} · {arrets.length} arrets · {nbSegments} segments {isOnline() ? '' : '· hors-ligne'}</p>
      </div>

      {arrets.length < 2 ? (
        <div className="flex-1 flex items-center justify-center px-6 text-center text-indigo-300">
          Cette ligne n'a pas assez d'arrets pour chronometrer des segments.
        </div>
      ) : done ? (
        <div className="flex-1 flex flex-col items-center justify-center px-6 text-center">
          <div className="w-16 h-16 rounded-full bg-green-600 flex items-center justify-center"><Check size={32} /></div>
          <h2 className="text-2xl font-bold mt-4">Trajet chronometre</h2>
          <p className="text-indigo-300 text-sm mt-1">{recorded.length} segment{recorded.length > 1 ? 's' : ''} enregistre{recorded.length > 1 ? 's' : ''}</p>
          <button onClick={() => onNavigate('/timer/planning')} className="mt-8 bg-indigo-600 px-6 py-3 rounded-xl font-bold">Retour au planning</button>
        </div>
      ) : (
        <>
          <div className="px-4 mt-6">
            <p className="text-[10px] text-indigo-400 uppercase tracking-wide text-center">Segment {idx + 1} / {nbSegments}</p>
            <div className="mt-2 bg-indigo-900 border border-indigo-700 rounded-2xl p-5 text-center">
              <p className="text-sm text-indigo-200">{arretDepart?.nom}</p>
              <p className="text-indigo-500 my-1 text-xs">↓</p>
              <p className="text-lg font-bold">{arretArrivee?.nom}</p>
              <div className="mt-4 font-mono text-5xl font-black tracking-wider tabular-nums">{fmtChrono(elapsed)}</div>
            </div>
          </div>

          <div className="px-6 mt-8">
            {!running ? (
              <button onClick={handleStart} className="w-full bg-green-600 py-6 rounded-2xl font-black text-2xl flex items-center justify-center gap-3 active:bg-green-700 shadow-lg">
                <Play size={28} /> START
                <span className="text-sm font-medium opacity-80">(depart {arretDepart?.nom})</span>
              </button>
            ) : (
              <button onClick={handleStop} className="w-full bg-red-600 py-6 rounded-2xl font-black text-2xl flex items-center justify-center gap-3 active:bg-red-700 shadow-lg animate-pulse">
                <Square size={26} /> STOP
                <span className="text-sm font-medium opacity-80">(arrivee {arretArrivee?.nom})</span>
              </button>
            )}
          </div>
        </>
      )}

      {recorded.length > 0 && (
        <div className="px-4 mt-6 pb-6">
          <p className="text-[10px] text-indigo-400 uppercase mb-2">Segments enregistres</p>
          <div className="space-y-1">
            {recorded.map((r) => (
              <div key={r.ordre} className="flex items-center justify-between bg-indigo-900/60 rounded-lg px-3 py-2 text-sm">
                <span className="text-indigo-100 truncate">{r.depart} → {r.arrivee}</span>
                <span className="font-mono font-bold tabular-nums ml-2">{fmtChrono(r.duree)}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
