import { useEffect, useMemo, useState } from 'react';
import type { User } from '@supabase/supabase-js';
import { Timer, MapPin, Loader2 } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { mDateStr } from '../lib/mayotte';

interface Props { user: User }

interface Segment {
  ordre: number;
  arret_depart_id: string | null;
  arret_arrivee_id: string | null;
  chauffeur_id: string | null;
  duree_secondes: number | null;
}
interface Arret { id: string; nom: string }
interface Ch { id: string; code: string | null; nom: string | null; prenom: string | null }

function fmt(sec: number): string {
  if (!isFinite(sec)) return '-';
  const m = Math.floor(sec / 60);
  const s = Math.round(sec % 60);
  return m > 0 ? `${m}m${String(s).padStart(2, '0')}` : `${s}s`;
}
function avg(list: number[]): number { return list.length ? list.reduce((a, b) => a + b, 0) / list.length : NaN; }

// Espace "Timer" : lit UNIQUEMENT timer_segments (donnees isolees de l'app
// Timer). Aucune donnee de facturation/planning n'entre ici, et rien d'ici ne
// ressort ailleurs. Mesure les temps de passage moyens par segment et par
// chauffeur pilote.
export function TimerPage({ user }: Props) {
  void user;
  const [lignes, setLignes] = useState<{ id: string; code: string; nom: string }[]>([]);
  const [ligneId, setLigneId] = useState('');
  const [from, setFrom] = useState(() => mDateStr(new Date()).slice(0, 8) + '01');
  const [to, setTo] = useState(() => mDateStr(new Date()));
  const [segments, setSegments] = useState<Segment[]>([]);
  const [arrets, setArrets] = useState<Arret[]>([]);
  const [chauffeurs, setChauffeurs] = useState<Ch[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    (async () => {
      const { data } = await supabase.from('lignes').select('id, code, nom').eq('active', true).order('code');
      const list = (data || []) as { id: string; code: string; nom: string }[];
      setLignes(list);
      if (list.length) setLigneId((p) => p || list[0].id);
    })();
  }, []);

  useEffect(() => {
    if (!ligneId) return;
    setLoading(true);
    (async () => {
      const [segRes, arrRes, chRes] = await Promise.all([
        supabase.from('timer_segments')
          .select('ordre, arret_depart_id, arret_arrivee_id, chauffeur_id, duree_secondes')
          .eq('ligne_id', ligneId)
          .not('duree_secondes', 'is', null)
          .gte('jour', from).lte('jour', to)
          .range(0, 9999),
        supabase.from('ligne_arrets').select('id, nom').eq('ligne_id', ligneId).order('ordre'),
        supabase.from('chauffeurs').select('id, code, nom, prenom'),
      ]);
      setSegments((segRes.data || []) as Segment[]);
      setArrets((arrRes.data || []) as Arret[]);
      setChauffeurs((chRes.data || []) as Ch[]);
      setLoading(false);
    })();
  }, [ligneId, from, to]);

  const arretNom = useMemo(() => {
    const m = new Map<string, string>();
    arrets.forEach((a) => m.set(a.id, a.nom));
    return (id: string | null) => (id ? m.get(id) || '?' : '?');
  }, [arrets]);

  const chLabel = useMemo(() => {
    const m = new Map<string, string>();
    chauffeurs.forEach((c) => m.set(c.id, c.code || `${c.nom || ''} ${c.prenom || ''}`.trim() || '?'));
    return (id: string | null) => (id ? m.get(id) || '?' : '?');
  }, [chauffeurs]);

  // Regroupement par segment (ordre) : moyenne globale + par chauffeur.
  const rows = useMemo(() => {
    const byOrdre = new Map<number, Segment[]>();
    for (const s of segments) {
      if (s.duree_secondes == null) continue;
      const arr = byOrdre.get(s.ordre) || [];
      arr.push(s);
      byOrdre.set(s.ordre, arr);
    }
    return [...byOrdre.entries()]
      .sort((a, b) => a[0] - b[0])
      .map(([ordre, list]) => {
        const durees = list.map((s) => s.duree_secondes as number);
        const parCh = new Map<string, number[]>();
        for (const s of list) {
          const k = s.chauffeur_id || '?';
          const a = parCh.get(k) || [];
          a.push(s.duree_secondes as number);
          parCh.set(k, a);
        }
        return {
          ordre,
          depart: arretNom(list[0].arret_depart_id),
          arrivee: arretNom(list[0].arret_arrivee_id),
          nb: durees.length,
          moyenne: avg(durees),
          min: Math.min(...durees),
          max: Math.max(...durees),
          parChauffeur: [...parCh.entries()].map(([id, ds]) => ({ ch: chLabel(id), nb: ds.length, moy: avg(ds) })).sort((a, b) => a.ch.localeCompare(b.ch)),
        };
      });
  }, [segments, arretNom, chLabel]);

  const chauffeursMesures = useMemo(() => {
    const set = new Set<string>();
    segments.forEach((s) => s.chauffeur_id && set.add(s.chauffeur_id));
    return [...set].map(chLabel).sort();
  }, [segments, chLabel]);

  return (
    <div className="space-y-5">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <p className="text-xs text-indigo-500 uppercase font-semibold flex items-center gap-1.5"><Timer className="w-3.5 h-3.5" /> Mode Timer</p>
          <h1 className="text-2xl font-bold text-gray-900">Temps de passage</h1>
          <p className="text-sm text-gray-500 mt-0.5">Temps moyens entre arrets, mesures par les chauffeurs pilotes. Donnees isolees — aucun impact sur planning/facturation.</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <div className="relative">
            <MapPin className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
            <select value={ligneId} onChange={(e) => setLigneId(e.target.value)} className="pl-9 pr-8 py-2.5 border border-gray-200 rounded-xl text-sm font-medium bg-white focus:ring-2 focus:ring-indigo-500 outline-none">
              {lignes.map((l) => <option key={l.id} value={l.id}>{l.code} - {l.nom}</option>)}
            </select>
          </div>
          <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="px-3 py-2 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 outline-none" />
          <span className="text-gray-400 text-sm">→</span>
          <input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="px-3 py-2 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 outline-none" />
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-20 text-gray-400 gap-2"><Loader2 className="w-5 h-5 animate-spin" /> Chargement...</div>
      ) : rows.length === 0 ? (
        <div className="bg-white border border-gray-200 rounded-xl p-10 text-center text-gray-400">
          Aucune mesure sur cette ligne pour la periode. Les chauffeurs pilotes doivent chronometrer via l'app <span className="font-semibold text-indigo-600">Taxi Vanille Timer</span>.
        </div>
      ) : (
        <>
          <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-x-auto">
            <table className="text-sm border-collapse min-w-max w-full">
              <thead>
                <tr className="bg-indigo-50 border-b border-indigo-100 text-indigo-900">
                  <th className="px-3 py-2 text-left font-semibold">Segment</th>
                  <th className="px-3 py-2 text-center font-semibold">Mesures</th>
                  <th className="px-3 py-2 text-center font-semibold">Temps moyen</th>
                  <th className="px-3 py-2 text-center font-semibold">Min</th>
                  <th className="px-3 py-2 text-center font-semibold">Max</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.ordre} className="border-b border-gray-50">
                    <td className="px-3 py-2 text-gray-800">{r.depart} → {r.arrivee}</td>
                    <td className="px-3 py-2 text-center text-gray-500 tabular-nums">{r.nb}</td>
                    <td className="px-3 py-2 text-center font-bold text-indigo-700 tabular-nums">{fmt(r.moyenne)}</td>
                    <td className="px-3 py-2 text-center text-gray-500 tabular-nums">{fmt(r.min)}</td>
                    <td className="px-3 py-2 text-center text-gray-500 tabular-nums">{fmt(r.max)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Ventilation par chauffeur : matrice segment x chauffeur (temps moyen) */}
          <div>
            <h3 className="text-xs font-bold text-gray-500 uppercase mb-2">Temps moyen par chauffeur</h3>
            <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-x-auto">
              <table className="text-sm border-collapse min-w-max">
                <thead>
                  <tr className="bg-gray-50 border-b border-gray-200">
                    <th className="px-3 py-2 text-left font-semibold text-gray-500">Segment</th>
                    {chauffeursMesures.map((c) => <th key={c} className="px-3 py-2 text-center font-semibold text-gray-500">{c}</th>)}
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => (
                    <tr key={r.ordre} className="border-b border-gray-50">
                      <td className="px-3 py-2 text-gray-700 whitespace-nowrap">{r.depart} → {r.arrivee}</td>
                      {chauffeursMesures.map((c) => {
                        const cell = r.parChauffeur.find((p) => p.ch === c);
                        return <td key={c} className="px-3 py-2 text-center tabular-nums text-gray-700">{cell ? fmt(cell.moy) : <span className="text-gray-300">-</span>}</td>;
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
