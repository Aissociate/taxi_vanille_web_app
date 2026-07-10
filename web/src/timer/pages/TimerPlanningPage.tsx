import { useEffect, useState } from 'react';
import { LogOut, Timer, ChevronRight } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useAuth, clearAuth, refreshSessionExpiry } from '../lib/timerStore';
import { isOnline } from '../lib/timerSync';
import { mDateStr, mMidnightISO, mAddDaysStr, fmtHM, fmtDateLong } from '../../lib/mayotte';

interface CourseLite {
  id: string;
  date_heure: string;
  depart: string | null;
  arrivee: string | null;
  ligne: { nom: string } | null;
}

interface Props {
  onNavigate: (path: string) => void;
}

// Planning du jour EN LECTURE SEULE (aucune ecriture dans courses). Sert juste
// a choisir la course a chronometrer. Cache local pour ouverture hors-ligne.
const CACHE_KEY = 'timer_planning_cache';

export default function TimerPlanningPage({ onNavigate }: Props) {
  const { chauffeur } = useAuth();
  const [courses, setCourses] = useState<CourseLite[]>([]);
  const [loading, setLoading] = useState(true);
  const [offline, setOffline] = useState(!navigator.onLine);

  useEffect(() => {
    if (!chauffeur) { onNavigate('/timer'); return; }
    const on = () => setOffline(false);
    const off = () => setOffline(true);
    window.addEventListener('online', on);
    window.addEventListener('offline', off);
    (async () => {
      const key = `${CACHE_KEY}_${chauffeur.id}`;
      if (isOnline()) {
        const today = new Date();
        const dayStr = mDateStr(today);
        const start = mMidnightISO(dayStr);
        const end = mMidnightISO(mAddDaysStr(dayStr, 1));
        const { data } = await supabase
          .from('courses')
          .select('id, date_heure, depart, arrivee, ligne:lignes(nom)')
          .eq('chauffeur_id', chauffeur.id)
          .or('is_brouillon.is.null,is_brouillon.eq.false')
          .gte('date_heure', start).lt('date_heure', end)
          .order('date_heure', { ascending: true });
        if (data) {
          setCourses(data as unknown as CourseLite[]);
          try { localStorage.setItem(key, JSON.stringify(data)); } catch { /* plein */ }
          refreshSessionExpiry();
        }
      } else {
        try { setCourses(JSON.parse(localStorage.getItem(key) || '[]')); } catch { setCourses([]); }
      }
      setLoading(false);
    })();
    return () => { window.removeEventListener('online', on); window.removeEventListener('offline', off); };
  }, [chauffeur, onNavigate]);

  return (
    <div className="min-h-screen bg-indigo-950 text-white flex flex-col">
      {/* Header MODE TIMER */}
      <div className="bg-indigo-600 px-4 py-3 flex items-center justify-between sticky top-0 z-10">
        <div className="flex items-center gap-2">
          <Timer size={20} />
          <span className="text-lg font-black tracking-widest uppercase">Mode Timer</span>
        </div>
        <button onClick={() => { clearAuth(); onNavigate('/timer'); }} className="flex items-center gap-1 text-indigo-100 text-xs">
          <LogOut size={14} /> Deconnexion
        </button>
      </div>

      {offline && (
        <div className="bg-amber-500 text-white text-center py-1.5 text-xs font-bold">HORS-LIGNE - donnees en cache</div>
      )}

      <div className="px-4 pt-4">
        <p className="text-[10px] text-indigo-300 uppercase">{fmtDateLong(new Date())}</p>
        <div className="flex items-center justify-between mt-1">
          <h1 className="text-2xl font-bold">Planning du jour</h1>
          <div className="text-right">
            <p className="text-sm font-bold">{chauffeur?.code || ''}</p>
            <p className="text-[10px] text-indigo-300">{chauffeur?.prenom} {chauffeur?.nom}</p>
          </div>
        </div>
        <p className="text-[11px] text-indigo-300 mt-1">Choisis une course pour chronometrer les temps de passage.</p>
      </div>

      <div className="flex-1 px-4 mt-4 space-y-2 pb-6">
        {loading ? (
          <div className="flex justify-center py-12"><div className="w-8 h-8 border-4 border-indigo-400 border-t-transparent rounded-full animate-spin" /></div>
        ) : courses.length === 0 ? (
          <div className="text-center py-12 text-indigo-300">Aucune course planifiee aujourd'hui</div>
        ) : (
          courses.map((c) => (
            <button
              key={c.id}
              type="button"
              onClick={() => onNavigate(`/timer/course/${c.id}`)}
              className="w-full text-left rounded-lg bg-indigo-900 border border-indigo-700 p-4 flex items-center justify-between active:bg-indigo-800"
            >
              <div>
                <span className="text-lg font-bold">{fmtHM(c.date_heure)}</span>
                <p className="text-sm text-indigo-100">{c.depart || '?'} → {c.arrivee || '?'}</p>
                {c.ligne?.nom && <p className="text-[11px] text-indigo-400">{c.ligne.nom}</p>}
              </div>
              <ChevronRight size={20} className="text-indigo-400" />
            </button>
          ))
        )}
      </div>
    </div>
  );
}
