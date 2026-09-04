// Rendu HTML du recap mensuel d'un chauffeur, partage par deux sorties :
//   - le PDF du recap seul (bouton dans le recap) ;
//   - l'ANNEXE de la facture PDF (demande DAF : "un seul document c'est mieux").
//
// Le tableau est large : il est mis en page en PAYSAGE via une page nommee,
// pour rester lisible en annexe d'une facture portrait.

import { formatHeures, type RecapMensuel } from './recapMensuel';

export interface RecapPiedLigne {
  libelle: string;
  valeur: string | number;
}

const esc = (s: string | number) => String(s ?? '').replace(/[&<>]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c] || c));
const eur = (n: number) => `${(Math.round(n * 100) / 100).toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} EUR`;

/** Styles du recap. A inclure UNE fois dans le document qui l'accueille. */
export const RECAP_STYLES = `
  @page annexe { size: A4 landscape; margin: 8mm; }
  .recap { page: annexe; font-size: 9px; color: #111; }
  .recap h2 { font-size: 14px; margin: 0 0 2px; }
  .recap .sub { color: #4b5563; margin-bottom: 6px; font-size: 10px; }
  .recap .tarifs { background: #fef3c7; border: 1px solid #fcd34d; padding: 4px 7px; margin-bottom: 6px; }
  .recap table { width: 100%; border-collapse: collapse; }
  .recap th, .recap td { border: 1px solid #d1d5db; padding: 2px 4px; }
  .recap th { background: #f3f4f6; font-size: 8px; text-align: left; }
  .recap .c { text-align: center; }
  .recap .r { text-align: right; white-space: nowrap; }
  .recap .ferie { background: #fffbeb; }
  .recap .tot td { font-weight: bold; background: #f3f4f6; }
  .recap .pied { margin-top: 12px; width: 320px; }
  .recap .pied tr:last-child td { background: #065f46; color: #fff; font-weight: bold; }
`;

/**
 * Corps HTML du recap (sans <html>/<head>) : titre, tableau jour par jour,
 * totaux et bloc recapitulatif de pied.
 */
export function buildRecapHtml(params: {
  titre: string;
  moisLabel: string;
  recap: RecapMensuel;
  pied: RecapPiedLigne[];
  /** Saut de page avant l'annexe (cas de la facture). */
  sautDePage?: boolean;
}): string {
  const { titre, moisLabel, recap, pied, sautDePage } = params;
  const { colonnes, jours, totaux } = recap;

  const enTetes = [
    'Jour', 'Date', 'N°', 'H. astreinte', 'Astreinte', 'Planifies', 'Non effectues',
    'Non planifies effectues', 'Effectues',
    ...colonnes.map(c => `${c.libelle} (${c.tarif.toFixed(2)})`),
    'Valeur', 'Compl. greve',
  ];

  const head = `<tr>${enTetes.map(h => `<th>${esc(h)}</th>`).join('')}</tr>`;
  const body = jours.map(j => `<tr${j.isFerie ? ' class="ferie"' : ''}>
    <td>${esc(j.libelle)}</td><td>${esc(j.date)}</td><td class="c">${j.jourSemaine}</td>
    <td class="c">${formatHeures(j.minutesAstreinte)}</td>
    <td class="r">${j.valeurAstreinte ? eur(j.valeurAstreinte) : ''}</td>
    <td class="c">${j.planifies}</td><td class="c">${j.nonEffectues}</td>
    <td class="c">${j.nonPlanifiesEffectues}</td><td class="c">${j.effectues}</td>
    ${colonnes.map(c => `<td class="c">${j.parPlage[c.key] || 0}</td>`).join('')}
    <td class="r">${eur(j.valeur)}</td><td class="r">${j.complementGreve ? eur(j.complementGreve) : ''}</td>
  </tr>`).join('');

  const tot = `<tr class="tot"><td colspan="3">TOTAL</td>
    <td class="c">${formatHeures(totaux.minutesAstreinte)}</td>
    <td class="r">${eur(totaux.valeurAstreinte)}</td>
    <td class="c">${totaux.planifies}</td><td class="c">${totaux.nonEffectues}</td>
    <td class="c">${totaux.nonPlanifiesEffectues}</td><td class="c">${totaux.effectues}</td>
    ${colonnes.map(c => `<td class="c">${totaux.parPlage[c.key] || 0}</td>`).join('')}
    <td class="r">${eur(totaux.valeur)}</td><td class="r">${eur(totaux.complementGreve)}</td></tr>`;

  const piedRows = pied.map(r => `<tr><td>${esc(r.libelle)}</td><td class="r">${
    typeof r.valeur === 'number' ? r.valeur.toLocaleString('fr-FR') : esc(String(r.valeur ?? ''))
  }</td></tr>`).join('');

  const tarifs = colonnes.map(c => `${esc(c.libelle)} : ${c.tarif.toFixed(2)} EUR`).join(' &nbsp;|&nbsp; ');

  return `<div class="recap"${sautDePage ? ' style="page-break-before: always;"' : ''}>
  <h2>Annexe — Recap mensuel des prestations</h2>
  <div class="sub">${esc(titre)} — ${esc(moisLabel)}</div>
  ${tarifs ? `<div class="tarifs"><b>Mode tarif trajet :</b> ${tarifs}</div>` : ''}
  <table><thead>${head}</thead><tbody>${body}${tot}</tbody></table>
  ${piedRows ? `<table class="pied"><tbody>${piedRows}</tbody></table>` : ''}
</div>`;
}
