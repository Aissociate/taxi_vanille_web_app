// Recap mensuel du chauffeur : la piece justificative jour par jour qui
// accompagne la facture (modele DAF du 18/08/2026, fichier "C4 Ligne 4 07 2026").
//
// Les colonnes de ventilation sont construites a partir des plages tarifaires
// reellement rencontrees dans le mois : chaque ligne de transport a sa propre
// grille, on ne code donc aucune colonne en dur.

import { Fragment, useState } from 'react';
import { Download, Printer, ChevronDown, ChevronUp } from 'lucide-react';
import { downloadSpreadsheet, type CellValue } from '../lib/spreadsheetExport';
import { formatHeures, parseHeures, type RecapMensuel, type RecapCourse } from '../lib/recapMensuel';
import { mDateStr, mParts } from '../lib/mayotte';
import { buildRecapHtml, RECAP_STYLES } from '../lib/recapHtml';

/** Bloc du bas : le meme que sur le document de la DAF. */
export interface RecapPied {
  kmDebut: number;
  kmFin: number;
  kmParcourus: number;
  seuilKm: number;
  kmSurplus: number;
  vehiculeLoue: boolean;
  nbJoursLocation: number;
  nbJoursMois: number;
  fraisGestion: number;
  forfaitLocation: number;
  depotGarantie: number;
  supplementKm: number;
  dettes: { libelle: string; montant: number }[];
  remboursementAvance: number;
  netAPayer: number;
}

interface Props {
  titre: string;               // "C4 — TOUMBOU Toibourani"
  moisLabel: string;           // "Juillet 2026"
  recap: RecapMensuel;
  pied: RecapPied;
  /** Saisie du complement greve (aucune autre source ne le connait). */
  onComplementChange: (date: string, montant: number) => void;
  /**
   * Saisie manuelle des heures d'astreinte (minutes, ou null pour revenir au
   * creneau planifie). Necessaire quand le planning ne couvre pas les
   * astreintes reellement faites.
   */
  onHeuresChange: (date: string, minutes: number | null) => void;
  /**
   * Trajets du mois : permet d'ouvrir le detail d'une journee en cliquant sur
   * sa ligne (demande "pouvoir faire des allers-retours dans les trajets
   * effectues en selectionnant le jour").
   */
  trajets?: RecapCourse[];
  readOnly?: boolean;
}

const eur = (n: number) => `${(Math.round(n * 100) / 100).toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} EUR`;

export function RecapMensuelChauffeur({ titre, moisLabel, recap, pied, onComplementChange, onHeuresChange, trajets, readOnly }: Props) {
  const [open, setOpen] = useState(false);
  // Journee dont on affiche le detail des trajets (clic sur la ligne).
  const [jourOuvert, setJourOuvert] = useState<string | null>(null);
  const { colonnes, jours, totaux } = recap;

  const trajetsDuJour = (date: string) => (trajets || [])
    .filter(t => mDateStr(t.date_heure) === date)
    .sort((a, b) => a.date_heure.localeCompare(b.date_heure));

  const libelleStatut = (t: RecapCourse) => {
    const st = t.statut_realisation || '';
    if (st === 'termine' || st === 'terminee') return { texte: 'Effectue', cls: 'bg-emerald-100 text-emerald-700' };
    if (st === 'remplace') return { texte: 'Remplace', cls: 'bg-red-100 text-red-700' };
    if (st === 'en_cours') return { texte: 'En cours', cls: 'bg-blue-100 text-blue-700' };
    if (st === 'annule' || st === 'annulee') return { texte: 'Annule', cls: 'bg-red-100 text-red-700' };
    if (st === 'incident') return { texte: 'Incident', cls: 'bg-orange-100 text-orange-700' };
    return { texte: 'Programme', cls: 'bg-gray-100 text-gray-600' };
  };

  const enTetes = [
    'Jour', 'Date', 'N°', 'H. astreinte', 'Astreinte (EUR)', 'Planifies', 'Non effectues',
    'Non planifies effectues', 'Effectues',
    ...colonnes.map(c => `${c.libelle} (${c.tarif.toFixed(2)})`),
    'Valeur', 'Complement greve',
  ];

  function lignesExport(): CellValue[][] {
    const rows: CellValue[][] = [enTetes];
    jours.forEach(j => {
      rows.push([
        j.libelle.split(' ')[0], j.date, j.jourSemaine,
        formatHeures(j.minutesAstreinte),
        Math.round(j.valeurAstreinte * 100) / 100,
        j.planifies, j.nonEffectues, j.nonPlanifiesEffectues, j.effectues,
        ...colonnes.map(c => j.parPlage[c.key] || 0),
        Math.round(j.valeur * 100) / 100,
        Math.round(j.complementGreve * 100) / 100,
      ]);
    });
    rows.push([
      'TOTAL', '', '',
      formatHeures(totaux.minutesAstreinte),
      Math.round(totaux.valeurAstreinte * 100) / 100,
      totaux.planifies, totaux.nonEffectues, totaux.nonPlanifiesEffectues, totaux.effectues,
      ...colonnes.map(c => totaux.parPlage[c.key] || 0),
      Math.round(totaux.valeur * 100) / 100,
      Math.round(totaux.complementGreve * 100) / 100,
    ]);
    return rows;
  }

  function lignesPied(): CellValue[][] {
    const rows: CellValue[][] = [
      ['Recapitulatif', 'Valeur'],
      ['Nbre kilometre debut mois', pied.kmDebut],
      ['Nbre kilometre fin de mois', pied.kmFin],
      ['Nbre kilometre parcouru', pied.kmParcourus],
      [`Nbre km > ${pied.seuilKm}`, pied.kmSurplus],
      ['Vehicule loue', pied.vehiculeLoue ? 1 : 0],
      ['Nombre de jour de location', pied.nbJoursLocation],
      ['Nombre de jour dans le mois', pied.nbJoursMois],
      ['Frais de gestion', -Math.round(pied.fraisGestion * 100) / 100],
      ['Forfait location vehicule', -Math.round(pied.forfaitLocation * 100) / 100],
      ['Depot de garantie mensuel', -Math.round(pied.depotGarantie * 100) / 100],
      ['Supplement kilometrage', -Math.round(pied.supplementKm * 100) / 100],
    ];
    pied.dettes.forEach(d => rows.push([d.libelle, -Math.round(d.montant * 100) / 100]));
    if (pied.remboursementAvance) rows.push(['Remboursement avance', -Math.round(pied.remboursementAvance * 100) / 100]);
    rows.push(['NET A PAYER', Math.round(pied.netAPayer * 100) / 100]);
    return rows;
  }

  function exportExcel() {
    downloadSpreadsheet(`Recap_${titre.replace(/[^\w-]+/g, '_')}_${moisLabel.replace(/\s+/g, '_')}`, [
      { name: 'Recap journalier', rows: lignesExport() },
      { name: 'Recapitulatif', rows: lignesPied() },
    ]);
  }

  function exportPdf() {
    // Meme rendu que l'annexe de la facture (lib/recapHtml) : un seul endroit a
    // maintenir pour les deux sorties papier.
    const html = `<!doctype html><html lang="fr"><head><meta charset="utf-8">
<title>Recap ${titre} ${moisLabel}</title>
<style>
  @page { size: A4 landscape; margin: 10mm; }
  body { font-family: Arial, Helvetica, sans-serif; margin: 0; }
${RECAP_STYLES}
</style></head><body>
${buildRecapHtml({
      titre,
      moisLabel,
      recap,
      pied: lignesPied().slice(1).map(r => ({ libelle: String(r[0] ?? ''), valeur: (r[1] ?? '') as string | number })),
    })}
</body></html>`;
    const w = window.open('', '_blank');
    if (!w) { alert("Impossible d'ouvrir la fenetre d'impression (popup bloquee)."); return; }
    w.document.write(html);
    w.document.close();
    w.focus();
    setTimeout(() => w.print(), 350);
  }

  return (
    <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
      <div className="flex items-center justify-between px-4 py-3">
        <button onClick={() => setOpen(o => !o)} className="flex items-center gap-2 text-xs font-bold text-gray-500 uppercase hover:text-gray-700">
          {open ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
          Recap mensuel jour par jour ({jours.length} jours — {totaux.effectues} trajets realises)
        </button>
        <div className="flex gap-2">
          <button onClick={exportPdf} title="Version imprimable (Enregistrer en PDF)" className="px-2.5 py-1.5 border border-gray-200 text-gray-600 rounded-lg text-xs hover:bg-gray-50 flex items-center gap-1.5">
            <Printer className="w-3.5 h-3.5" /> PDF
          </button>
          <button onClick={exportExcel} title="Telecharger le recap au format Excel" className="px-2.5 py-1.5 border border-gray-200 text-gray-600 rounded-lg text-xs hover:bg-gray-50 flex items-center gap-1.5">
            <Download className="w-3.5 h-3.5" /> Excel
          </button>
        </div>
      </div>

      {open && (
        <div className="border-t border-gray-100">
          <div className="px-4 py-2 bg-amber-50 border-b border-amber-100 text-[11px] text-amber-900">
            <span className="font-semibold">Mode tarif trajet :</span>{' '}
            {colonnes.map(c => `${c.libelle} ${c.tarif.toFixed(2)} EUR`).join(' | ') || 'aucune plage tarifaire sur le mois'}
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-[11px] whitespace-nowrap">
              <thead className="bg-gray-50 text-gray-500">
                <tr>
                  <th className="px-2 py-2 text-left font-semibold">Jour</th>
                  <th className="px-2 py-2 text-center font-semibold" title="Numero du jour dans la semaine (1 = lundi)">N°</th>
                  <th className="px-2 py-2 text-center font-semibold" title="Heures d'astreinte : creneau planifie, modifiable a la main">H. astreinte</th>
                  <th className="px-2 py-2 text-right font-semibold">Astreinte</th>
                  <th className="px-2 py-2 text-center font-semibold">Planifies</th>
                  <th className="px-2 py-2 text-center font-semibold">Non effectues</th>
                  <th className="px-2 py-2 text-center font-semibold">Non planif. effectues</th>
                  <th className="px-2 py-2 text-center font-semibold">Effectues</th>
                  {colonnes.map(c => (
                    <th key={c.key} className="px-2 py-2 text-center font-semibold" title={`${c.tarif.toFixed(2)} EUR / trajet`}>
                      {c.libelle}
                      <span className="block text-[9px] font-normal text-gray-400">{c.tarif.toFixed(2)} EUR</span>
                    </th>
                  ))}
                  <th className="px-2 py-2 text-right font-semibold">Valeur</th>
                  <th className="px-2 py-2 text-center font-semibold">Compl. greve</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {jours.map(j => (
                  <Fragment key={j.date}>
                  <tr className={`${j.isFerie ? 'bg-yellow-50/50' : j.jourSemaine >= 6 ? 'bg-blue-50/20' : ''} ${jourOuvert === j.date ? 'bg-amber-50' : ''} hover:bg-gray-50/60`}>
                    <td
                      className={`px-2 py-1.5 font-medium text-gray-800 ${trajets ? 'cursor-pointer hover:text-amber-700' : ''}`}
                      onClick={() => { if (trajets) setJourOuvert(jourOuvert === j.date ? null : j.date); }}
                      title={trajets ? 'Afficher les trajets de cette journee' : undefined}
                    >
                      {trajets && <span className="text-gray-400 mr-1">{jourOuvert === j.date ? '▾' : '▸'}</span>}
                      {j.libelle}
                    </td>
                    <td className="px-2 py-1.5 text-center text-gray-500">{j.jourSemaine}</td>
                    <td className="px-2 py-1.5 text-center">
                      <input
                        type="text"
                        defaultValue={formatHeures(j.minutesAstreinte)}
                        key={`${j.date}-${j.minutesAstreinte}`}
                        onBlur={e => {
                          const v = e.target.value.trim();
                          // Vide -> on repart du creneau planifie.
                          if (v === '') { onHeuresChange(j.date, null); return; }
                          const min = parseHeures(v);
                          if (min === null) { e.target.value = formatHeures(j.minutesAstreinte); return; }
                          onHeuresChange(j.date, min === j.minutesPlanifiees ? null : min);
                        }}
                        disabled={readOnly}
                        title={j.heuresSaisies
                          ? `Saisi a la main (planning : ${formatHeures(j.minutesPlanifiees)})`
                          : 'Creneau planifie — modifiable'}
                        className={`w-16 px-1 py-0.5 rounded text-center font-mono border outline-none focus:ring-1 focus:ring-amber-400 disabled:bg-gray-50 disabled:text-gray-400 disabled:border-gray-200 ${
                          j.heuresSaisies ? 'border-amber-300 bg-amber-50 text-amber-800 font-semibold' : 'border-gray-200 text-gray-600'}`}
                      />
                    </td>
                    <td className="px-2 py-1.5 text-right text-gray-700">{j.valeurAstreinte ? eur(j.valeurAstreinte) : ''}</td>
                    <td className="px-2 py-1.5 text-center text-gray-700">{j.planifies || ''}</td>
                    <td className={`px-2 py-1.5 text-center ${j.nonEffectues > 0 ? 'text-amber-700 font-semibold' : 'text-gray-400'}`}>{j.nonEffectues || ''}</td>
                    <td className={`px-2 py-1.5 text-center ${j.nonPlanifiesEffectues > 0 ? 'text-blue-700 font-semibold' : 'text-gray-400'}`}>{j.nonPlanifiesEffectues || ''}</td>
                    <td className="px-2 py-1.5 text-center font-semibold text-gray-800">{j.effectues || ''}</td>
                    {colonnes.map(c => (
                      <td key={c.key} className="px-2 py-1.5 text-center text-gray-600">{j.parPlage[c.key] || ''}</td>
                    ))}
                    <td className="px-2 py-1.5 text-right font-semibold text-gray-800">{j.valeur ? eur(j.valeur) : ''}</td>
                    <td className="px-2 py-1.5 text-center">
                      <input
                        type="number" step="0.01" value={j.complementGreve || ''}
                        onChange={e => onComplementChange(j.date, parseFloat(e.target.value) || 0)}
                        disabled={readOnly}
                        placeholder="0"
                        className="w-20 px-1 py-0.5 border border-blue-200 bg-blue-50/50 text-blue-700 rounded text-center outline-none focus:ring-1 focus:ring-blue-400 disabled:bg-gray-50 disabled:text-gray-400 disabled:border-gray-200"
                      />
                    </td>
                  </tr>
                  {jourOuvert === j.date && trajets && (
                    <tr className="bg-amber-50/40">
                      <td colSpan={9 + colonnes.length + 2} className="px-3 py-2">
                        {trajetsDuJour(j.date).length === 0 ? (
                          <p className="text-[11px] text-gray-400 italic">Aucun trajet ce jour.</p>
                        ) : (
                          <table className="w-full text-[11px]">
                            <thead className="text-gray-500 uppercase">
                              <tr>
                                <th className="text-left px-2 py-1 font-semibold">Heure</th>
                                <th className="text-left px-2 py-1 font-semibold">Trajet</th>
                                <th className="text-left px-2 py-1 font-semibold">Statut</th>
                                <th className="text-right px-2 py-1 font-semibold">Valeur</th>
                              </tr>
                            </thead>
                            <tbody>
                              {trajetsDuJour(j.date).map(t => {
                                const st = libelleStatut(t);
                                const p = mParts(t.date_heure);
                                const estEffectue = (t.statut_realisation || '') === 'termine' || (t.statut_realisation || '') === 'terminee';
                                return (
                                  <tr key={t.id} className="border-t border-amber-100/70">
                                    <td className="px-2 py-1 font-mono text-gray-700">{String(p.h).padStart(2, '0')}:{String(p.mi).padStart(2, '0')}</td>
                                    <td className="px-2 py-1 text-gray-700">
                                      {t.depart || ''}{t.depart || t.arrivee ? ' → ' : ''}{t.arrivee || ''}
                                      {t.is_astreinte && <span className="ml-1 text-[10px] px-1 rounded bg-gray-200 text-gray-600">astreinte</span>}
                                      {t.statut_planification === 'non_planifie' && <span className="ml-1 text-[10px] px-1 rounded bg-blue-100 text-blue-700">non planifie</span>}
                                    </td>
                                    <td className="px-2 py-1"><span className={`px-1.5 py-0.5 rounded font-semibold ${st.cls}`}>{st.texte}</span></td>
                                    <td className={`px-2 py-1 text-right ${estEffectue ? 'text-gray-800 font-semibold' : 'text-gray-300'}`}>
                                      {estEffectue ? eur(t.montant || 0) : '—'}
                                    </td>
                                  </tr>
                                );
                              })}
                            </tbody>
                          </table>
                        )}
                      </td>
                    </tr>
                  )}
                  </Fragment>
                ))}
              </tbody>
              <tfoot className="bg-gray-100 font-bold text-gray-800">
                <tr>
                  <td className="px-2 py-2">TOTAL</td>
                  <td></td>
                  <td className="px-2 py-2 text-center font-mono">{formatHeures(totaux.minutesAstreinte)}</td>
                  <td className="px-2 py-2 text-right">{eur(totaux.valeurAstreinte)}</td>
                  <td className="px-2 py-2 text-center">{totaux.planifies}</td>
                  <td className="px-2 py-2 text-center">{totaux.nonEffectues}</td>
                  <td className="px-2 py-2 text-center">{totaux.nonPlanifiesEffectues}</td>
                  <td className="px-2 py-2 text-center">{totaux.effectues}</td>
                  {colonnes.map(c => (
                    <td key={c.key} className="px-2 py-2 text-center">{totaux.parPlage[c.key] || 0}</td>
                  ))}
                  <td className="px-2 py-2 text-right">{eur(totaux.valeur)}</td>
                  <td className="px-2 py-2 text-center">{eur(totaux.complementGreve)}</td>
                </tr>
              </tfoot>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
