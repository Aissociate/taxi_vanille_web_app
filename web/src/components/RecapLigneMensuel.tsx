// Recapitulatif mensuel d'une LIGNE : une ligne du tableau par chauffeur, les
// memes colonnes que le recap individuel, et les cumuls du mois en donnee.
//
// Demandes DAF du 03/09/2026 :
//   - "Pouvoir avoir le tableau mensuel par chauffeur en recapitulatif pour une
//      ligne complete"
//   - "En ligne les chauffeurs, en colonne les colonnes des tableaux des
//      chauffeurs, en donnee les cumuls mensuels"
//
// Les chiffres sont produits par buildRecapMensuel(), exactement comme le recap
// individuel : le total d'une ligne du tableau est donc au centime celui du
// recap du chauffeur, et donc de sa facture.

import { useEffect, useMemo, useState } from 'react';
import { X, Download, RefreshCw } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { mMidnightISO } from '../lib/mayotte';
import { downloadSpreadsheet, type CellValue } from '../lib/spreadsheetExport';
import {
  buildRecapMensuel, formatHeures,
  type RecapCourse, type RecapPlage, type RecapColonne, type RecapTotaux,
} from '../lib/recapMensuel';

interface Ligne { id: string; code: string; nom: string }
interface Chauffeur { id: string; code: string; nom: string; prenom: string; ligne_id: string | null }

interface Props {
  lignes: Ligne[];
  chauffeurs: Chauffeur[];
  /** Mois affiche a l'ouverture, au format "YYYY-MM". */
  mois: string;
  onClose: () => void;
}

const MOIS_FR = ['Janvier', 'Fevrier', 'Mars', 'Avril', 'Mai', 'Juin', 'Juillet', 'Aout', 'Septembre', 'Octobre', 'Novembre', 'Decembre'];
const eur = (n: number) => `${(Math.round(n * 100) / 100).toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} EUR`;

interface LigneRecap {
  chauffeur: Chauffeur;
  totaux: RecapTotaux;
}

export function RecapLigneMensuel({ lignes, chauffeurs, mois, onClose }: Props) {
  const [ligneId, setLigneId] = useState<string>(lignes[0]?.id || '');
  const [moisSel, setMoisSel] = useState(mois);
  const [loading, setLoading] = useState(false);
  const [courses, setCourses] = useState<RecapCourse[]>([]);
  const [plages, setPlages] = useState<RecapPlage[]>([]);
  const [feries, setFeries] = useState<Set<string>>(new Set());
  const [sessions, setSessions] = useState<{ chauffeur_id: string; date: string }[]>([]);
  const [creneaux, setCreneaux] = useState<{ chauffeur_id: string; date_debut: string; date_fin: string | null }[]>([]);
  const [tarifHeureAstreinte, setTarifHeureAstreinte] = useState(0);

  const membres = useMemo(
    () => chauffeurs
      .filter(c => c.ligne_id === ligneId)
      .sort((a, b) => {
        const n = (code: string) => { const m = code.match(/(\d+)/); return m ? parseInt(m[1], 10) : 9999; };
        return (a.code.replace(/\d+/g, '')).localeCompare(b.code.replace(/\d+/g, '')) || n(a.code) - n(b.code);
      }),
    [chauffeurs, ligneId],
  );

  useEffect(() => { if (ligneId) charger(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [ligneId, moisSel]);

  async function charger() {
    const ids = chauffeurs.filter(c => c.ligne_id === ligneId).map(c => c.id);
    if (ids.length === 0) { setCourses([]); return; }
    setLoading(true);
    try {
      const [y, m] = moisSel.split('-').map(Number);
      const debut = mMidnightISO(`${y}-${String(m).padStart(2, '0')}-01`);
      const finY = m === 12 ? y + 1 : y;
      const finM = m === 12 ? 1 : m + 1;
      const fin = mMidnightISO(`${finY}-${String(finM).padStart(2, '0')}-01`);
      const dernier = new Date(y, m, 0).getDate();

      // Courses paginees : une ligne complete sur un mois depasse largement les
      // 1000 lignes que PostgREST renvoie par defaut.
      const toutes: RecapCourse[] = [];
      const pageSize = 1000;
      for (let offset = 0; ; offset += pageSize) {
        const { data, error } = await supabase
          .from('courses')
          .select('id, date_heure, ligne_id, montant, is_astreinte, statut_planification, statut_realisation, chauffeur_id')
          .in('chauffeur_id', ids)
          .gte('date_heure', debut)
          .lt('date_heure', fin)
          .order('date_heure')
          .range(offset, offset + pageSize - 1);
        if (error || !data) break;
        toutes.push(...(data as RecapCourse[]));
        if (data.length < pageSize) break;
      }

      const [plagesRes, feriesRes, sessionsRes, creneauxRes] = await Promise.all([
        supabase.from('tarif_plages').select('id, type_jour, heure_debut, heure_fin, tarif, libelle, ligne_id, ordre'),
        supabase.from('jours_feries').select('date')
          .gte('date', `${y}-${String(m).padStart(2, '0')}-01`)
          .lte('date', `${y}-${String(m).padStart(2, '0')}-${dernier}`),
        supabase.from('astreinte_sessions').select('chauffeur_id, date')
          .in('chauffeur_id', ids)
          .gte('date', `${y}-${String(m).padStart(2, '0')}-01`)
          .lte('date', `${y}-${String(m).padStart(2, '0')}-${dernier}`),
        supabase.from('astreintes').select('chauffeur_id, date_debut, date_fin')
          .in('chauffeur_id', ids)
          .gte('date_debut', debut)
          .lt('date_debut', fin),
      ]);

      const p = (plagesRes.data as RecapPlage[] | null) || [];
      setCourses(toutes);
      setPlages(p);
      setFeries(new Set(((feriesRes.data as { date: string }[] | null) || []).map(f => f.date)));
      setSessions((sessionsRes.data as { chauffeur_id: string; date: string }[] | null) || []);
      setCreneaux((creneauxRes.data as { chauffeur_id: string; date_debut: string; date_fin: string | null }[] | null) || []);

      // Tarif horaire d'astreinte : plage propre a la ligne si elle existe,
      // sinon plage generique (meme regle que le trigger tarif_course).
      const astr = p.filter(pl => pl.type_jour === 'astreinte')
        .sort((a, b) => (Number(b.ligne_id === ligneId) - Number(a.ligne_id === ligneId)) || (a.ordre - b.ordre))
        .find(pl => pl.ligne_id === ligneId || pl.ligne_id == null);
      setTarifHeureAstreinte(astr?.tarif || 0);
    } finally {
      setLoading(false);
    }
  }

  const [annee, moisNum] = moisSel.split('-').map(Number);

  // Colonnes de ventilation : union de toutes les plages rencontrees sur la
  // ligne, pour que chaque chauffeur soit lu sous le meme en-tete.
  const colonnes: RecapColonne[] = useMemo(() => buildRecapMensuel({
    annee, mois: moisNum, courses, plages, feries, sessions: [], creneaux: [], tarifHeureAstreinte,
  }).colonnes, [annee, moisNum, courses, plages, feries, tarifHeureAstreinte]);

  const lignesRecap: LigneRecap[] = useMemo(() => membres.map(ch => {
    const sien = courses.filter(c => c.chauffeur_id === ch.id);
    const recap = buildRecapMensuel({
      annee, mois: moisNum, courses: sien, plages, feries,
      sessions: sessions.filter(s => s.chauffeur_id === ch.id).map(s => ({ date: s.date })),
      creneaux: creneaux.filter(c => c.chauffeur_id === ch.id).map(c => ({ date_debut: c.date_debut, date_fin: c.date_fin })),
      tarifHeureAstreinte,
    });
    return { chauffeur: ch, totaux: recap.totaux };
  }), [membres, courses, plages, feries, sessions, creneaux, annee, moisNum, tarifHeureAstreinte]);

  const grandTotal: RecapTotaux = useMemo(() => {
    const vide: RecapTotaux = {
      minutesAstreinte: 0, minutesPlanifiees: 0, nbAstreintes: 0, valeurAstreinte: 0,
      planifies: 0, nonEffectues: 0, nonPlanifiesEffectues: 0, effectues: 0,
      parPlage: {}, valeur: 0, complementGreve: 0,
    };
    return lignesRecap.reduce((acc, l) => {
      const parPlage = { ...acc.parPlage };
      colonnes.forEach(c => { parPlage[c.key] = (parPlage[c.key] || 0) + (l.totaux.parPlage[c.key] || 0); });
      return {
        minutesAstreinte: acc.minutesAstreinte + l.totaux.minutesAstreinte,
        minutesPlanifiees: acc.minutesPlanifiees + l.totaux.minutesPlanifiees,
        nbAstreintes: acc.nbAstreintes + l.totaux.nbAstreintes,
        valeurAstreinte: acc.valeurAstreinte + l.totaux.valeurAstreinte,
        planifies: acc.planifies + l.totaux.planifies,
        nonEffectues: acc.nonEffectues + l.totaux.nonEffectues,
        nonPlanifiesEffectues: acc.nonPlanifiesEffectues + l.totaux.nonPlanifiesEffectues,
        effectues: acc.effectues + l.totaux.effectues,
        parPlage,
        valeur: acc.valeur + l.totaux.valeur,
        complementGreve: acc.complementGreve + l.totaux.complementGreve,
      };
    }, vide);
  }, [lignesRecap, colonnes]);

  const ligne = lignes.find(l => l.id === ligneId);
  const enTetes = [
    'Chauffeur', 'H. astreinte', 'Astreinte (EUR)', 'Planifies', 'Non effectues',
    'Non planifies effectues', 'Effectues',
    ...colonnes.map(c => `${c.libelle} (${c.tarif.toFixed(2)})`),
    'Valeur',
  ];

  function exportExcel() {
    const rows: CellValue[][] = [enTetes];
    lignesRecap.forEach(l => rows.push([
      `${l.chauffeur.code} ${l.chauffeur.nom} ${l.chauffeur.prenom}`.trim(),
      formatHeures(l.totaux.minutesAstreinte),
      Math.round(l.totaux.valeurAstreinte * 100) / 100,
      l.totaux.planifies, l.totaux.nonEffectues, l.totaux.nonPlanifiesEffectues, l.totaux.effectues,
      ...colonnes.map(c => l.totaux.parPlage[c.key] || 0),
      Math.round(l.totaux.valeur * 100) / 100,
    ]));
    rows.push([
      `TOTAL (${lignesRecap.length} chauffeurs)`,
      formatHeures(grandTotal.minutesAstreinte),
      Math.round(grandTotal.valeurAstreinte * 100) / 100,
      grandTotal.planifies, grandTotal.nonEffectues, grandTotal.nonPlanifiesEffectues, grandTotal.effectues,
      ...colonnes.map(c => grandTotal.parPlage[c.key] || 0),
      Math.round(grandTotal.valeur * 100) / 100,
    ]);
    downloadSpreadsheet(
      `Recap_${ligne?.code || 'ligne'}_${MOIS_FR[moisNum - 1]}_${annee}`,
      [{ name: 'Recap ligne', rows }],
    );
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl w-full max-w-[95vw] shadow-2xl max-h-[92vh] flex flex-col">
        <div className="p-5 border-b border-gray-100 flex items-center justify-between gap-4 flex-wrap">
          <div>
            <h3 className="font-bold text-gray-900">Recapitulatif mensuel par ligne</h3>
            <p className="text-xs text-gray-500 mt-0.5">
              Cumuls du mois par chauffeur, memes colonnes que le recap individuel.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <select
              value={ligneId}
              onChange={(e) => setLigneId(e.target.value)}
              className="px-3 py-2 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-amber-500 outline-none bg-white"
            >
              {lignes.map(l => <option key={l.id} value={l.id}>{l.code} - {l.nom}</option>)}
            </select>
            <input
              type="month"
              value={moisSel}
              onChange={(e) => { if (e.target.value) setMoisSel(e.target.value); }}
              className="px-3 py-2 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-amber-500 outline-none"
            />
            <button onClick={charger} title="Recharger" className="p-2 border border-gray-200 rounded-lg text-gray-500 hover:bg-gray-50">
              <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            </button>
            <button onClick={exportExcel} disabled={lignesRecap.length === 0} className="px-3 py-2 border border-gray-200 rounded-lg text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50 flex items-center gap-1.5">
              <Download className="w-3.5 h-3.5" /> Excel
            </button>
            <button onClick={onClose} className="text-gray-400 hover:text-gray-600 p-1"><X className="w-5 h-5" /></button>
          </div>
        </div>

        <div className="flex-1 overflow-auto p-5">
          {loading && <p className="text-sm text-gray-400 py-6 text-center">Chargement...</p>}
          {!loading && membres.length === 0 && (
            <p className="text-sm text-gray-400 py-6 text-center">Aucun chauffeur actif sur cette ligne.</p>
          )}
          {!loading && membres.length > 0 && (
            <div className="border border-gray-200 rounded-lg overflow-x-auto">
              <table className="w-full text-xs whitespace-nowrap">
                <thead className="bg-gray-50 border-b border-gray-200 text-[10px] uppercase text-gray-500">
                  <tr>
                    <th className="px-2 py-2 text-left font-semibold sticky left-0 bg-gray-50">Chauffeur</th>
                    <th className="px-2 py-2 text-center font-semibold">H. astreinte</th>
                    <th className="px-2 py-2 text-right font-semibold">Astreinte</th>
                    <th className="px-2 py-2 text-center font-semibold">Planifies</th>
                    <th className="px-2 py-2 text-center font-semibold">Non effectues</th>
                    <th className="px-2 py-2 text-center font-semibold" title="Trajets effectues sans avoir ete planifies">Non planif. effectues</th>
                    <th className="px-2 py-2 text-center font-semibold">Effectues</th>
                    {colonnes.map(c => (
                      <th key={c.key} className="px-2 py-2 text-center font-semibold" title={`${c.libelle} — ${c.tarif.toFixed(2)} EUR`}>
                        {c.libelle}
                        <span className="block text-[9px] font-normal text-gray-400">{c.tarif.toFixed(2)}</span>
                      </th>
                    ))}
                    <th className="px-2 py-2 text-right font-semibold">Valeur</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {lignesRecap.map(({ chauffeur: ch, totaux: t }) => (
                    <tr key={ch.id} className="hover:bg-gray-50/60">
                      <td className="px-2 py-1.5 font-medium text-gray-800 sticky left-0 bg-white">
                        <span className="text-[10px] px-1 py-0.5 rounded border border-gray-200 text-gray-500 font-bold mr-1.5">{ch.code}</span>
                        {ch.nom} {ch.prenom}
                      </td>
                      <td className="px-2 py-1.5 text-center font-mono text-gray-600">{formatHeures(t.minutesAstreinte)}</td>
                      <td className="px-2 py-1.5 text-right text-gray-700">{t.valeurAstreinte ? eur(t.valeurAstreinte) : ''}</td>
                      <td className="px-2 py-1.5 text-center text-gray-700">{t.planifies || ''}</td>
                      <td className={`px-2 py-1.5 text-center ${t.nonEffectues > 0 ? 'text-amber-700 font-semibold' : 'text-gray-300'}`}>{t.nonEffectues || ''}</td>
                      <td className={`px-2 py-1.5 text-center ${t.nonPlanifiesEffectues > 0 ? 'text-blue-700 font-semibold' : 'text-gray-300'}`}>{t.nonPlanifiesEffectues || ''}</td>
                      <td className="px-2 py-1.5 text-center font-semibold text-gray-900">{t.effectues || ''}</td>
                      {colonnes.map(c => (
                        <td key={c.key} className="px-2 py-1.5 text-center text-gray-600">{t.parPlage[c.key] || ''}</td>
                      ))}
                      <td className="px-2 py-1.5 text-right font-semibold text-gray-900">{t.valeur ? eur(t.valeur) : ''}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot className="bg-gray-100 font-bold text-gray-900 border-t border-gray-200">
                  <tr>
                    <td className="px-2 py-2 sticky left-0 bg-gray-100">TOTAL ({lignesRecap.length} chauffeurs)</td>
                    <td className="px-2 py-2 text-center font-mono">{formatHeures(grandTotal.minutesAstreinte)}</td>
                    <td className="px-2 py-2 text-right">{eur(grandTotal.valeurAstreinte)}</td>
                    <td className="px-2 py-2 text-center">{grandTotal.planifies}</td>
                    <td className="px-2 py-2 text-center">{grandTotal.nonEffectues}</td>
                    <td className="px-2 py-2 text-center">{grandTotal.nonPlanifiesEffectues}</td>
                    <td className="px-2 py-2 text-center">{grandTotal.effectues}</td>
                    {colonnes.map(c => (
                      <td key={c.key} className="px-2 py-2 text-center">{grandTotal.parPlage[c.key] || 0}</td>
                    ))}
                    <td className="px-2 py-2 text-right">{eur(grandTotal.valeur)}</td>
                  </tr>
                </tfoot>
              </table>
            </div>
          )}
          <p className="text-[10px] text-gray-400 mt-3">
            Valeur = somme des montants des trajets realises + astreinte du mois, exactement comme le recap
            individuel de chaque chauffeur. Les colonnes de droite comptent les trajets realises par plage tarifaire.
          </p>
        </div>
      </div>
    </div>
  );
}
