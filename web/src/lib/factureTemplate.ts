// Modele de facture SOUS-TRAITANT (artisan taxi -> Taxi Vanille), calque sur le
// document envoye par la DAF le 18/08/2026 ("C4 TOUMBOU ... Factures_CADEMA_2026").
//
// Difference avec l'ancien PDF "facture de retrocession" : c'est ici l'artisan
// qui facture la societe. L'entete porte donc ses coordonnees a lui (matricule,
// SIRET, adresse, emails), le detail est regroupe PAR LIGNE de transport, et les
// retenues sont presentees dans un bloc "Compensations / retenues" separe avec
// un NET A REGLER en bas.

export interface FactureArtisan {
  matricule: string;      // code chauffeur (C4, D2...)
  nomComplet: string;
  adresse: string;
  telephone: string;
  email: string;
  siret: string;
}

export interface FactureDestinataire {
  nom: string;
  adresse: string;
  telephone: string;
  siret: string;
}

export interface FactureMarche {
  libelle: string;        // "Marche CADEMA / CARIBUS"
  contratDate: string;    // "24/02/2026" (vide = mention masquee)
  mentionTva: string;     // "TVA non applicable a Mayotte"
  modeReglement: string;  // "Par virement bancaire"
}

export interface FacturePrestation {
  designation: string;    // "Prestations de transport realisees dans le cadre du marche ..."
  ligne: string;          // "Vahibe <-> PEM Passamainty"
  montant: number;
}

export interface FactureCompensation {
  libelle: string;
  montant: number;        // toujours positif : c'est une retenue
}

export interface FactureDoc {
  numero: string;
  moisNumero: number;     // 7
  moisLabel: string;      // "Juillet 2026"
  dateFacture: string;    // "31/07/2026"
  artisan: FactureArtisan;
  destinataire: FactureDestinataire;
  marche: FactureMarche;
  prestations: FacturePrestation[];
  compensations: FactureCompensation[];
  montantFacture: number;
  montantCompensation: number;
  netARegler: number;
  /**
   * Annexe HTML imprimee a la suite de la facture (recap mensuel des
   * prestations). La DAF veut un seul document : facture + justificatif.
   */
  annexeHtml?: string;
  /** Styles de l'annexe, injectes dans l'entete du document. */
  annexeStyles?: string;
}

/** "CADEMA-2026-07-C4" — numerotation du marche demandee par la DAF. */
export function numeroFactureMarche(prefixe: string, annee: number, mois: number, codeChauffeur: string): string {
  const base = (prefixe || 'FACT').trim();
  return `${base}-${annee}-${String(mois).padStart(2, '0')}-${codeChauffeur || '??'}`;
}

const esc = (s: string | number) => String(s ?? '').replace(/[&<>]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c] || c));
const money = (n: number) => `${(Math.round(n * 100) / 100).toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} EUR`;

export function buildFactureHtml(d: FactureDoc): string {
  const prestaRows = d.prestations.length > 0
    ? d.prestations.map(p => `<tr>
        <td>${esc(p.designation)}</td>
        <td>${esc(p.ligne)}</td>
        <td class="r">${money(p.montant)}</td>
      </tr>`).join('')
    : '<tr><td colspan="3" class="empty">Aucune prestation sur la periode</td></tr>';

  const compRows = d.compensations.length > 0
    ? d.compensations.map(c => `<tr><td colspan="2">${esc(c.libelle)}</td><td class="r">${money(c.montant)}</td></tr>`).join('')
    : '<tr><td colspan="3" class="empty">Aucune retenue</td></tr>';

  const contrat = d.marche.contratDate
    ? `<span class="contrat">Selon le contrat de prestations de services signe le ${esc(d.marche.contratDate)}</span>`
    : '';

  return `<!doctype html><html lang="fr"><head><meta charset="utf-8"><title>Facture ${esc(d.numero)}</title>
<style>
  @page { size: A4; margin: 14mm; }
  body { font-family: Arial, Helvetica, sans-serif; color: #111; font-size: 12px; margin: 0; }
  .wrap { max-width: 780px; margin: 0 auto; }
  .parties { display: flex; justify-content: space-between; gap: 24px; }
  .bloc { flex: 1; }
  .bloc h2 { font-size: 10px; letter-spacing: .08em; text-transform: uppercase; color: #6b7280; margin: 0 0 6px; }
  .bloc .nom { font-weight: bold; font-size: 13px; }
  .bloc div { line-height: 1.5; }
  .titre { margin: 22px 0 4px; padding: 8px 10px; background: #f3f4f6; border-left: 4px solid #b45309; }
  .titre h1 { font-size: 15px; margin: 0; }
  .contrat { font-size: 11px; color: #4b5563; }
  .infos { display: flex; gap: 24px; margin: 10px 0 4px; font-size: 11.5px; }
  .infos b { color: #374151; }
  table { width: 100%; border-collapse: collapse; margin-top: 12px; }
  th, td { border: 1px solid #d1d5db; padding: 6px 8px; vertical-align: top; }
  th { background: #f3f4f6; text-align: left; font-size: 11px; text-transform: uppercase; letter-spacing: .03em; }
  .r { text-align: right; white-space: nowrap; }
  .empty { color: #9ca3af; font-style: italic; text-align: center; }
  .tot td { font-weight: bold; background: #f9fafb; }
  .net td { background: #065f46; color: #fff; font-size: 14px; }
  .mentions { margin-top: 18px; font-size: 11px; color: #374151; line-height: 1.7; }
  .mentions .tva { font-weight: bold; }
  .foot { margin-top: 24px; font-size: 10px; color: #9ca3af; }
  @media print { body { padding: 0; } }
  ${d.annexeStyles || ''}
</style>
</head><body><div class="wrap">

  <div class="parties">
    <div class="bloc">
      <h2>Artisan</h2>
      <div class="nom">${esc(d.artisan.nomComplet)}</div>
      <div>Matricule : ${esc(d.artisan.matricule)}</div>
      ${d.artisan.adresse ? `<div>${esc(d.artisan.adresse)}</div>` : ''}
      ${d.artisan.telephone ? `<div>Tel. : ${esc(d.artisan.telephone)}</div>` : ''}
      ${d.artisan.siret ? `<div>SIRET : ${esc(d.artisan.siret)}</div>` : ''}
      ${d.artisan.email ? `<div>Email : ${esc(d.artisan.email)}</div>` : ''}
    </div>
    <div class="bloc">
      <h2>Facture a</h2>
      <div class="nom">${esc(d.destinataire.nom)}</div>
      ${d.destinataire.adresse ? `<div>${esc(d.destinataire.adresse)}</div>` : ''}
      ${d.destinataire.telephone ? `<div>Tel. : ${esc(d.destinataire.telephone)}</div>` : ''}
      ${d.destinataire.siret ? `<div>SIRET : ${esc(d.destinataire.siret)}</div>` : ''}
    </div>
  </div>

  <div class="titre">
    <h1>FACTURE${d.marche.libelle ? ` — ${esc(d.marche.libelle)}` : ''}</h1>
    ${contrat}
  </div>

  <div class="infos">
    <span><b>N° facture :</b> ${esc(d.numero)}</span>
    <span><b>Date facture :</b> ${esc(d.dateFacture)}</span>
    <span><b>Periode :</b> ${esc(d.moisLabel)}</span>
    <span><b>Mois n° a facturer :</b> ${d.moisNumero}</span>
  </div>

  <table>
    <thead><tr><th style="width:52%">Designation</th><th>Ligne</th><th class="r" style="width:20%">Montant</th></tr></thead>
    <tbody>
      ${prestaRows}
      <tr class="tot"><td colspan="2">Montant facture</td><td class="r">${money(d.montantFacture)}</td></tr>
    </tbody>
  </table>

  <table>
    <thead><tr><th colspan="2">Compensations / retenues</th><th class="r" style="width:20%">Montant</th></tr></thead>
    <tbody>
      ${compRows}
      <tr class="tot"><td colspan="2">Montant compensation</td><td class="r">${money(d.montantCompensation)}</td></tr>
      <tr class="tot net"><td colspan="2">NET A REGLER</td><td class="r">${money(d.netARegler)}</td></tr>
    </tbody>
  </table>

  <div class="mentions">
    ${d.marche.mentionTva ? `<div class="tva">${esc(d.marche.mentionTva)}</div>` : ''}
    ${d.marche.modeReglement ? `<div>${esc(d.marche.modeReglement)}</div>` : ''}
  </div>

  <div class="foot">Document genere le ${new Date().toLocaleDateString('fr-FR')}.</div>
</div>
${d.annexeHtml || ''}
</body></html>`;
}

/** Ouvre la facture dans un onglet et lance l'impression (Enregistrer en PDF). */
export function printFacture(html: string): boolean {
  const w = window.open('', '_blank');
  if (!w) return false;
  w.document.write(html);
  w.document.close();
  w.focus();
  setTimeout(() => w.print(), 350);
  return true;
}
