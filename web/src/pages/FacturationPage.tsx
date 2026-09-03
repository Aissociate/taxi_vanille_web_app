import { useEffect, useState, useMemo } from 'react';
import { supabase } from '../lib/supabase';
import { Receipt, Plus, X, ChevronLeft, ChevronRight, Eye, Check, Trash2, List, Columns3, Calendar, ChevronDown, ChevronUp, Download, Printer } from 'lucide-react';
import type { User } from '@supabase/supabase-js';
import { mParts, mDateStr, mMidnightISO } from '../lib/mayotte';
import { valeurTarif } from '../lib/tarifDefauts';
import { downloadSpreadsheet, type CellValue } from '../lib/spreadsheetExport';
import { buildRecapMensuel, formatHeures, type RecapCourse, type RecapPlage } from '../lib/recapMensuel';
import { RecapMensuelChauffeur, type RecapPied } from '../components/RecapMensuelChauffeur';
import { DettesChauffeur, loadDettes, echeancesDuMois, type Dette } from '../components/DettesChauffeur';
import { buildFactureHtml, numeroFactureMarche, printFacture, type FactureDoc } from '../lib/factureTemplate';
import { RecapLigneMensuel } from '../components/RecapLigneMensuel';

interface LigneSupp {
  libelle: string;
  quantite: number;
  montant: number;
}

interface Facture {
  id: string;
  numero: string;
  chauffeur_id: string | null;
  client_id: string | null;
  date_emission: string;
  date_echeance: string | null;
  mois_reference: string | null;
  montant_ht: number;
  tva: number;
  montant_ttc: number;
  statut: string;
  notes: string;
  nb_trajets_normaux: number;
  tarif_trajet_normal: number;
  nb_trajets_astreinte: number;
  tarif_trajet_astreinte: number;
  nb_heures_astreinte: number;
  tarif_heure_astreinte: number;
  location_vehicule: boolean;
  tarif_location: number;
  frais_gestion: boolean;
  tarif_frais_gestion: number;
  km_debut_mois: number;
  km_fin_mois: number;
  seuil_km: number;
  tarif_km_depassement: number;
  montant_depassement_km: number;
  lignes_supplementaires: LigneSupp[];
  remboursement_avance: number;
  net_a_payer: number;
  solde_avance_avant: number;
  solde_avance_apres: number;
}

interface Chauffeur {
  id: string;
  nom: string;
  prenom: string;
  code: string;
  telephone: string;
  email: string;
  nif_siret: string;
  adresse: string;
  vehicule_places: number;
  ligne_id: string | null;
}

interface TarifFrais {
  cle: string;
  valeur: number;
  actif: boolean;
}

interface FacturationPageProps {
  user: User;
}

type ViewMode = 'kanban' | 'list';
type KanbanStatus = 'brouillon' | 'validee' | 'payee';

const STATUTS: { key: KanbanStatus; label: string; color: string; dotColor: string }[] = [
  { key: 'brouillon', label: 'BROUILLON', color: 'border-gray-300', dotColor: 'bg-gray-400' },
  { key: 'validee', label: 'VALIDEE - A PAYER', color: 'border-emerald-300', dotColor: 'bg-emerald-500' },
  { key: 'payee', label: 'PAYEE', color: 'border-teal-300', dotColor: 'bg-teal-500' },
];

const MONTHS_FR = ['Janvier', 'Fevrier', 'Mars', 'Avril', 'Mai', 'Juin', 'Juillet', 'Aout', 'Septembre', 'Octobre', 'Novembre', 'Decembre'];

// On facture le mois ECOULE : en septembre, c'est aout qui est a facturer.
// Le mois affiche est ensuite memorise pour la duree de la session, pour ne pas
// avoir a revenir dessus a chaque aller-retour dans le menu ; une nouvelle
// session repart sur le mois precedent.
const MOIS_SESSION_KEY = 'facturation.mois';
function moisPrecedent(): string {
  const d = new Date();
  d.setDate(1);
  d.setMonth(d.getMonth() - 1);
  return `${d.getFullYear()}-${(d.getMonth() + 1).toString().padStart(2, '0')}`;
}
function moisInitial(): string {
  try {
    const saved = sessionStorage.getItem(MOIS_SESSION_KEY);
    if (saved && /^\d{4}-\d{2}$/.test(saved)) return saved;
  } catch { /* stockage indisponible (navigation privee) : on prend le defaut */ }
  return moisPrecedent();
}

// Tri d'affichage des chauffeurs : par ligne, puis par NUMERO de code
// (D2 avant D10, ce qu'un tri alphabetique ne fait pas).
function numeroCode(code: string): number {
  const m = (code || '').match(/(\d+)/);
  return m ? parseInt(m[1], 10) : 9999;
}
function comparerChauffeurs(a: { code: string }, b: { code: string }): number {
  const prefA = (a.code || '').replace(/\d+/g, '');
  const prefB = (b.code || '').replace(/\d+/g, '');
  return prefA.localeCompare(prefB) || numeroCode(a.code) - numeroCode(b.code) || a.code.localeCompare(b.code);
}

export function FacturationPage({ user }: FacturationPageProps) {
  const [factures, setFactures] = useState<Facture[]>([]);
  const [chauffeurs, setChauffeurs] = useState<Chauffeur[]>([]);
  const [tarifs, setTarifs] = useState<TarifFrais[]>([]);
  const [lignes, setLignes] = useState<{ id: string; code: string; nom: string }[]>([]);
  const [viewMode, setViewMode] = useState<ViewMode>('kanban');
  const [selectedMonth, setSelectedMonth] = useState(moisInitial);
  useEffect(() => {
    try { sessionStorage.setItem(MOIS_SESSION_KEY, selectedMonth); } catch { /* ignore */ }
  }, [selectedMonth]);
  const [showForm, setShowForm] = useState(false);
  const [showRecapLigne, setShowRecapLigne] = useState(false);
  const [editingFacture, setEditingFacture] = useState<Facture | null>(null);

  useEffect(() => { loadAll(); }, []);

  async function loadAll() {
    const [fRes, cRes, tRes, lRes] = await Promise.all([
      supabase.from('factures').select('*').order('date_emission', { ascending: false }),
      supabase.from('chauffeurs').select('id, nom, prenom, code, telephone, email, nif_siret, adresse, vehicule_places, ligne_id').eq('statut', 'actif'),
      supabase.from('tarif_frais').select('cle, valeur, actif'),
      supabase.from('lignes').select('id, code, nom').order('code'),
    ]);
    if (fRes.data) setFactures(fRes.data);
    if (cRes.data) setChauffeurs(cRes.data);
    if (tRes.data) setTarifs(tRes.data);
    if (lRes.data) setLignes(lRes.data);
  }

  const [filterYear, filterMonth] = selectedMonth.split('-').map(Number);

  const filteredFactures = useMemo(() => {
    return factures.filter(f => {
      if (!f.mois_reference) return true;
      const d = new Date(f.mois_reference);
      return d.getFullYear() === filterYear && d.getMonth() + 1 === filterMonth;
    });
  }, [factures, filterYear, filterMonth]);

  const kanbanColumns = useMemo(() => {
    const cols: Record<KanbanStatus, Facture[]> = { brouillon: [], validee: [], payee: [] };
    filteredFactures.forEach(f => {
      const s = f.statut as KanbanStatus;
      if (cols[s]) cols[s].push(f);
      else cols.brouillon.push(f);
    });
    return cols;
  }, [filteredFactures]);

  function getChauffeur(id: string | null) {
    return chauffeurs.find(c => c.id === id);
  }

  function openCreate() {
    setEditingFacture(null);
    setShowForm(true);
  }

  function openEdit(f: Facture) {
    setEditingFacture(f);
    setShowForm(true);
  }

  async function updateStatus(id: string, newStatus: KanbanStatus) {
    if (newStatus === 'payee') {
      // Atomic server-side payment: locks the facture, imputes the advances
      // and flips the statut in one transaction (no double imputation if two
      // payments run at the same time).
      const { error } = await supabase.rpc('payer_facture', { p_facture_id: id });
      if (error) {
        alert(error.message.includes('facture_deja_payee')
          ? 'Cette facture est deja payee.'
          : `Erreur lors du paiement: ${error.message}`);
      }
      loadAll();
      return;
    }
    const { error } = await supabase.from('factures').update({ statut: newStatus }).eq('id', id);
    if (error) alert(`Erreur lors du changement de statut: ${error.message}`);
    loadAll();
  }

  async function deleteFacture(id: string) {
    if (!confirm('Supprimer cette facture ?')) return;
    await supabase.from('factures').delete().eq('id', id);
    loadAll();
  }

  function navigateMonth(dir: number) {
    const d = new Date(filterYear, filterMonth - 1 + dir, 1);
    setSelectedMonth(`${d.getFullYear()}-${(d.getMonth() + 1).toString().padStart(2, '0')}`);
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <p className="text-xs text-gray-500 uppercase font-semibold">Direction - Factures</p>
          <h1 className="text-2xl font-bold text-gray-900">Factures de retrocession</h1>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex items-center border border-gray-200 rounded-lg overflow-hidden">
            <button onClick={() => setViewMode('kanban')} className={`px-3 py-2 text-sm font-medium flex items-center gap-1.5 transition-colors ${viewMode === 'kanban' ? 'bg-amber-600 text-white' : 'bg-white text-gray-600 hover:bg-gray-50'}`}>
              <Columns3 className="w-4 h-4" /> Kanban
            </button>
            <button onClick={() => setViewMode('list')} className={`px-3 py-2 text-sm font-medium flex items-center gap-1.5 transition-colors ${viewMode === 'list' ? 'bg-amber-600 text-white' : 'bg-white text-gray-600 hover:bg-gray-50'}`}>
              <List className="w-4 h-4" /> Liste
            </button>
          </div>
          {/* Recap mensuel d'une ligne complete : un chauffeur par ligne du
              tableau, cumuls du mois (demande DAF du 03/09). */}
          <button onClick={() => setShowRecapLigne(true)} className="flex items-center gap-2 px-4 py-2.5 border border-gray-200 text-gray-700 rounded-xl font-medium hover:bg-gray-50 transition-colors">
            <List className="w-4 h-4" /> Recap par ligne
          </button>
          <button onClick={openCreate} className="flex items-center gap-2 px-4 py-2.5 bg-amber-600 hover:bg-amber-700 text-white rounded-xl font-medium transition-colors shadow-sm">
            <Plus className="w-4 h-4" /> Nouvelle facture
          </button>
        </div>
      </div>

      {/* Month navigation */}
      <div className="flex items-center gap-3">
        <button onClick={() => navigateMonth(-1)} className="p-2 hover:bg-gray-100 rounded-lg transition-colors"><ChevronLeft className="w-4 h-4 text-gray-600" /></button>
        <span className="text-sm font-semibold text-gray-800 min-w-[140px] text-center">{MONTHS_FR[filterMonth - 1]} {filterYear}</span>
        <button onClick={() => navigateMonth(1)} className="p-2 hover:bg-gray-100 rounded-lg transition-colors"><ChevronRight className="w-4 h-4 text-gray-600" /></button>
      </div>

      {/* Kanban View */}
      {viewMode === 'kanban' && (
        <div className="grid grid-cols-4 gap-4 min-h-[500px]">
          {STATUTS.map(col => (
            <div key={col.key} className={`bg-gray-50 rounded-xl border-t-4 ${col.color} p-3`}>
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <span className={`w-2.5 h-2.5 rounded-full ${col.dotColor}`} />
                  <span className="text-xs font-bold text-gray-600 uppercase">{col.label}</span>
                </div>
                <span className="text-xs font-bold text-gray-400 bg-white border border-gray-200 rounded-full w-6 h-6 flex items-center justify-center">{kanbanColumns[col.key].length}</span>
              </div>
              <div className="space-y-3">
                {kanbanColumns[col.key].map(f => {
                  const ch = getChauffeur(f.chauffeur_id);
                  return (
                    <div key={f.id} className="bg-white rounded-xl border border-gray-200 p-4 shadow-sm hover:shadow-md transition-all cursor-pointer" onClick={() => openEdit(f)}>
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-sm font-bold text-gray-900">{f.numero}</span>
                        <span className={`px-2 py-0.5 rounded-full text-[10px] font-semibold border ${col.key === 'validee' ? 'border-emerald-200 text-emerald-700 bg-emerald-50' : col.key === 'payee' ? 'border-teal-200 text-teal-700 bg-teal-50' : 'border-gray-200 text-gray-600 bg-gray-50'}`}>
                          {col.key.toUpperCase()}
                        </span>
                      </div>
                      {ch && <p className="text-xs text-gray-600 mb-1">{ch.code} - {ch.nom} {ch.prenom}</p>}
                      {f.mois_reference && <p className="text-[10px] text-gray-400">S{new Date(f.mois_reference).getMonth() + 1}/{new Date(f.mois_reference).getFullYear().toString().slice(2)}</p>}
                      <p className="text-lg font-bold text-gray-900 mt-2">{(f.net_a_payer || f.montant_ttc || 0).toLocaleString('fr-FR', { minimumFractionDigits: 2 })} EUR</p>
                      <div className="flex items-center gap-2 mt-3">
                        {col.key === 'brouillon' && (
                          <button onClick={(e) => { e.stopPropagation(); updateStatus(f.id, 'validee'); }} className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-medium rounded-lg transition-colors">Valider</button>
                        )}
                        {col.key === 'validee' && (
                          <button onClick={(e) => { e.stopPropagation(); updateStatus(f.id, 'payee'); }} className="px-3 py-1.5 bg-teal-600 hover:bg-teal-700 text-white text-xs font-medium rounded-lg transition-colors">Mettre en paiement</button>
                        )}
                        <button onClick={(e) => { e.stopPropagation(); openEdit(f); }} className="px-3 py-1.5 border border-gray-200 text-gray-600 text-xs font-medium rounded-lg hover:bg-gray-50 transition-colors">
                          <Eye className="w-3 h-3" />
                        </button>
                        <button onClick={(e) => { e.stopPropagation(); deleteFacture(f.id); }} className="ml-auto px-2 py-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 text-xs rounded-lg transition-colors">
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  );
                })}
                {kanbanColumns[col.key].length === 0 && (
                  <div className="text-center py-8 text-xs text-gray-400">Aucune facture</div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* List View */}
      {viewMode === 'list' && (
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
          {filteredFactures.length === 0 ? (
            <div className="p-12 text-center">
              <Receipt className="w-12 h-12 text-gray-300 mx-auto mb-3" />
              <p className="text-gray-500">Aucune facture ce mois</p>
            </div>
          ) : (
            <table className="w-full">
              <thead className="bg-gray-50 border-b border-gray-100">
                <tr>
                  <th className="px-5 py-3 text-left text-xs font-semibold text-gray-500 uppercase">Numero</th>
                  <th className="px-5 py-3 text-left text-xs font-semibold text-gray-500 uppercase">Chauffeur</th>
                  <th className="px-5 py-3 text-left text-xs font-semibold text-gray-500 uppercase">Mois</th>
                  <th className="px-5 py-3 text-left text-xs font-semibold text-gray-500 uppercase">Net a payer</th>
                  <th className="px-5 py-3 text-left text-xs font-semibold text-gray-500 uppercase">Statut</th>
                  <th className="px-5 py-3 text-right text-xs font-semibold text-gray-500 uppercase">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {filteredFactures.map(f => {
                  const ch = getChauffeur(f.chauffeur_id);
                  return (
                    <tr key={f.id} className="hover:bg-gray-50 transition-colors cursor-pointer" onClick={() => openEdit(f)}>
                      <td className="px-5 py-3 text-sm font-bold text-gray-900">{f.numero}</td>
                      <td className="px-5 py-3 text-sm text-gray-600">{ch ? `${ch.code} - ${ch.nom} ${ch.prenom}` : '-'}</td>
                      <td className="px-5 py-3 text-sm text-gray-600">{f.mois_reference ? MONTHS_FR[new Date(f.mois_reference).getMonth()] : '-'}</td>
                      <td className="px-5 py-3 text-sm font-bold text-gray-900">{(f.net_a_payer || 0).toLocaleString('fr-FR', { minimumFractionDigits: 2 })} EUR</td>
                      <td className="px-5 py-3">
                        <span className={`px-2.5 py-1 rounded-full text-xs font-medium ${f.statut === 'payee' ? 'bg-teal-100 text-teal-700' : f.statut === 'validee' ? 'bg-emerald-100 text-emerald-700' : 'bg-gray-100 text-gray-600'}`}>
                          {f.statut}
                        </span>
                      </td>
                      <td className="px-5 py-3 text-right">
                        <button onClick={(e) => { e.stopPropagation(); deleteFacture(f.id); }} className="p-1.5 text-gray-400 hover:text-red-600 rounded-lg transition-colors"><Trash2 className="w-4 h-4" /></button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      )}

      {showRecapLigne && (
        <RecapLigneMensuel
          lignes={lignes}
          chauffeurs={chauffeurs}
          mois={selectedMonth}
          onClose={() => setShowRecapLigne(false)}
        />
      )}

      {/* Form modal */}
      {showForm && (
        <FactureForm
          user={user}
          facture={editingFacture}
          chauffeurs={chauffeurs}
          tarifs={tarifs}
          lignes={lignes}
          onClose={() => { setShowForm(false); setEditingFacture(null); }}
          onSaved={() => { setShowForm(false); setEditingFacture(null); loadAll(); }}
        />
      )}
    </div>
  );
}

interface FactureFormProps {
  user: User;
  facture: Facture | null;
  chauffeurs: Chauffeur[];
  tarifs: TarifFrais[];
  lignes: { id: string; code: string; nom: string }[];
  onClose: () => void;
  onSaved: () => void;
}

interface CourseDetail {
  id: string;
  date_heure: string;
  depart: string;
  arrivee: string;
  periode: string;
  statut_planification: string;
  duree_minutes: number | null;
  ligne_id: string | null;
  lignes: { nom: string } | null;
  categorie: string;
}

function FactureForm({ user, facture, chauffeurs, tarifs, lignes, onClose, onSaved }: FactureFormProps) {
  const [chauffeurId, setChauffeurId] = useState(facture?.chauffeur_id || '');
  // Nouvelle facture : mois precedent (on facture le mois ecoule).
  const [moisReference, setMoisReference] = useState(facture?.mois_reference || `${moisPrecedent()}-01`);
  const [loading, setLoading] = useState(false);
  const [coursesDetail, setCoursesDetail] = useState<CourseDetail[]>([]);
  const [showListing, setShowListing] = useState(false);

  // Editable fields
  const [nbSemaineJour, setNbSemaineJour] = useState(0);
  const [tarifSemaineJour, setTarifSemaineJour] = useState(0);
  const [nbSemaineNuit, setNbSemaineNuit] = useState(0);
  // tarif* semaine-nuit/samedi/dimanche/non-planifie : plus lus a l'affichage
  // (le detail par tranche calcule les tarifs reels) mais encore ecrits pour les
  // colonnes agregees stockees -> on garde le setter, pas la valeur.
  const [, setTarifSemaineNuit] = useState(0);
  const [nbSamedi, setNbSamedi] = useState(0);
  const [, setTarifSamedi] = useState(0);
  const [nbDimanche, setNbDimanche] = useState(0);
  const [, setTarifDimanche] = useState(0);
  const [nbAstreinte, setNbAstreinte] = useState(0);
  const [tarifAstreinte, setTarifAstreinte] = useState(0);
  // Astreinte facturee au FORFAIT : nombre d'astreintes realisees x forfait
  // (le mobile confirme l'astreinte en un clic, sans duree -> plus d'heures).
  const [nbAstreintesReal, setNbAstreintesReal] = useState((facture as any)?.nb_astreintes || 0);
  // L'astreinte est payee A L'HEURE, au tarif de l'onglet "Astreinte" de la
  // grille tarifaire (plage propre a la ligne du chauffeur si elle en a une).
  const [tarifHeureAstreinte, setTarifHeureAstreinte] = useState((facture as any)?.tarif_heure_astreinte || 0);
  const [nbNonPlanifie, setNbNonPlanifie] = useState(0);
  const [, setTarifNonPlanifie] = useState(0);
  const [nbSamedisCoord, setNbSamedisCoord] = useState((facture as any)?.nb_samedis_coordinateur || 0);
  const [forfaitCoordSamedi, setForfaitCoordSamedi] = useState((facture as any)?.forfait_coordinateur_samedi || 200);
  const [nbDimanchesCoord, setNbDimanchesCoord] = useState((facture as any)?.nb_dimanches_coordinateur || 0);
  const [forfaitCoordDimanche, setForfaitCoordDimanche] = useState((facture as any)?.forfait_coordinateur_dimanche || 300);
  // #5 : forfait coordinateur en jour de semaine (lun-ven), meme logique que sam/dim.
  const [nbJoursCoordSemaine, setNbJoursCoordSemaine] = useState((facture as any)?.nb_jours_coordinateur_semaine || 0);
  const [forfaitCoordSemaine, setForfaitCoordSemaine] = useState((facture as any)?.forfait_coordinateur_semaine || 150);
  // Detail des trajets par (ligne de transport x tranche horaire) : granularite
  // maximale, chaque tranche facturee separement au tarif reel de la plage.
  const [plagesBreakdown, setPlagesBreakdown] = useState<{ key: string; ligneCode: string; ligneNom: string; typeJour: string; tranche: string; libelle: string; count: number; tarif: number; total: number; nonPlanifie: number }[]>([]);

  const [locationVehicule, setLocationVehicule] = useState(facture?.location_vehicule || false);
  const [tarifLocation, setTarifLocation] = useState(facture?.tarif_location || 0);
  const [fraisGestion, setFraisGestion] = useState(facture?.frais_gestion ?? true);
  const [tarifFraisGestion, setTarifFraisGestion] = useState(facture?.tarif_frais_gestion || 0);
  const [kmDebutMois, setKmDebutMois] = useState(facture?.km_debut_mois || 0);
  const [kmFinMois, setKmFinMois] = useState(facture?.km_fin_mois || 0);
  const [seuilKm, setSeuilKm] = useState(facture?.seuil_km || 0);
  const [tarifKmDepassement, setTarifKmDepassement] = useState(facture?.tarif_km_depassement || 0);
  const [lignesSupp, setLignesSupp] = useState<LigneSupp[]>(facture?.lignes_supplementaires || []);
  const [remboursementAvance, setRemboursementAvance] = useState(facture?.remboursement_avance || 0);
  const [soldeAvanceAvant, setSoldeAvanceAvant] = useState(facture?.solde_avance_avant || 0);
  const [saving, setSaving] = useState(false);

  // ---- Recap mensuel jour par jour + dettes etalees (demande DAF 18/08/2026) ----
  // Location : la DAF veut voir le nombre de jours loues a cote du forfait.
  const [nbJoursLocation, setNbJoursLocation] = useState((facture as any)?.nb_jours_location || 0);
  const [depotGarantie, setDepotGarantie] = useState((facture as any)?.depot_garantie || 0);
  // Le recap a besoin de TOUTES les courses du mois (y compris non realisees et
  // non planifiees), la facture n'en charge que les realisees.
  const [recapCourses, setRecapCourses] = useState<RecapCourse[]>([]);
  const [recapPlages, setRecapPlages] = useState<RecapPlage[]>([]);
  const [recapFeries, setRecapFeries] = useState<Set<string>>(new Set());
  // Sessions = astreintes realisees (compte / forfait). Creneaux = astreintes
  // planifiees, seules porteuses d'une vraie plage horaire.
  const [recapSessions, setRecapSessions] = useState<{ date: string }[]>([]);
  const [recapCreneaux, setRecapCreneaux] = useState<{ date_debut: string; date_fin: string | null }[]>([]);
  // Complement greve : saisie manuelle, aucune autre source ne le connait.
  const [complementsGreve, setComplementsGreve] = useState<Record<string, number>>(
    ((facture as any)?.recap_journalier?.complements as Record<string, number>) || {});
  // Heures d'astreinte saisies a la main (minutes par date) : elles priment sur
  // les creneaux planifies, qui ne couvrent pas toujours le realise.
  const [heuresAstreinte, setHeuresAstreinte] = useState<Record<string, number>>(
    ((facture as any)?.recap_journalier?.heures_manuelles as Record<string, number>) || {});
  const [dettes, setDettes] = useState<Dette[]>([]);
  const [entreprise, setEntreprise] = useState<Record<string, string | null> | null>(null);
  const [lignesInfo, setLignesInfo] = useState<Map<string, { code: string; nom: string; depart: string; arrivee: string }>>(new Map());

  useEffect(() => {
    // On recharge aussi pour une facture EXISTANTE : sinon les compteurs de
    // trajets restaient a 0 et re-enregistrer ecrasait la facture avec un net a 0.
    if (chauffeurId) {
      loadCoursesAndDefaults();
    }
  }, [chauffeurId, moisReference]);

  async function loadCoursesAndDefaults() {
    setLoading(true);
    try {
    const moisStart = moisReference.slice(0, 7) + '-01';
    const [y, m] = moisReference.slice(0, 7).split('-').map(Number);
    const lastDay = new Date(y, m, 0).getDate();
    const moisEnd = `${y}-${String(m).padStart(2, '0')}-${lastDay}`;
    // Bornes du mois en MINUIT de Mayotte (instants absolus) -> memes journees que
    // le planning et l'appli chauffeur, quel que soit le fuseau du navigateur.
    const nextY = m === 12 ? y + 1 : y;
    const nextM = m === 12 ? 1 : m + 1;
    const debutInstant = mMidnightISO(moisStart);
    const finInstant = mMidnightISO(`${nextY}-${String(nextM).padStart(2, '0')}-01`);

    const [coursesRes, kmRes, plagesRes, avancesRes, kmAndroidRes, feriesRes, lignesRes] = await Promise.all([
      supabase.from('courses')
        .select('id, date_heure, periode, statut_planification, statut_realisation, duree_minutes, depart, arrivee, ligne_id, montant, is_astreinte, lignes(nom)')
        .eq('chauffeur_id', chauffeurId)
        .eq('statut_realisation', 'termine')
        .gte('date_heure', debutInstant)
        .lt('date_heure', finInstant)
        .order('date_heure', { ascending: true }),
      supabase.from('chauffeur_kilometres')
        .select('km_debut, km_fin')
        .eq('chauffeur_id', chauffeurId)
        .eq('mois', moisStart)
        .maybeSingle(),
      supabase.from('tarif_plages').select('id, type_jour, heure_debut, heure_fin, tarif, libelle, ligne_id, ordre'),
      supabase.from('chauffeur_avances')
        .select('montant')
        .eq('chauffeur_id', chauffeurId)
        .eq('statut', 'en_cours'),
      supabase.from('kilometrage')
        .select('km_value, type')
        .eq('chauffeur_id', chauffeurId)
        .eq('mois', moisStart.slice(0, 7))
        .order('created_at', { ascending: true }),
      supabase.from('jours_feries')
        .select('date')
        .gte('date', moisStart)
        .lte('date', moisEnd),
      supabase.from('lignes').select('id, code, nom, depart, arrivee'),
    ]);
    // id -> {code, nom} pour libeller le detail par ligne de transport.
    const lignesRows = (lignesRes.data as { id: string; code: string; nom: string; depart: string | null; arrivee: string | null }[] | null) || [];
    const ligneMap = new Map<string, { code: string; nom: string }>(
      lignesRows.map(l => [l.id, { code: l.code, nom: l.nom }]),
    );
    setLignesInfo(new Map(lignesRows.map(l => [l.id, { code: l.code, nom: l.nom, depart: l.depart || '', arrivee: l.arrivee || '' }])));

    // Valeurs par defaut : uniquement pour une NOUVELLE facture. Pour une facture
    // existante on conserve ce qui a ete saisi/enregistre (deja charge via facture?.*).
    if (!facture) {
      // Android driver readings (table kilometrage) are the live source of
      // truth; the legacy chauffeur_kilometres table is only a fallback.
      if (kmAndroidRes.data && kmAndroidRes.data.length > 0) {
        const debut = kmAndroidRes.data.find(k => k.type === 'debut_mois');
        const fin = kmAndroidRes.data.find(k => k.type === 'fin_mois');
        if (debut) setKmDebutMois(debut.km_value);
        if (fin) setKmFinMois(fin.km_value);
      } else if (kmRes.data) {
        setKmDebutMois(kmRes.data.km_debut || 0);
        setKmFinMois(kmRes.data.km_fin || 0);
      }

      // Calculate solde avances en cours
      const totalAvances = (avancesRes.data || []).reduce((s, a) => s + (a.montant || 0), 0);
      setSoldeAvanceAvant(totalAvances);

      // Load tarif defaults
      const locationTarif = tarifs.find(t => t.cle === 'forfait_location');
      const fraisTarif = tarifs.find(t => t.cle === 'frais_gestion');
      const kmSeuil = tarifs.find(t => t.cle === 'seuil_km');
      const kmTarif = tarifs.find(t => t.cle === 'tarif_km_depassement');
      if (locationTarif) setTarifLocation(locationTarif.valeur);
      // Le montant affiche dans Parametres > Tarifs n'est pas toujours enregistre
      // en base : on retombe sur la meme valeur par defaut que cet ecran, sinon
      // la facture proposait 0 alors que le tarif "prevu" affichait 30.
      setTarifFraisGestion(valeurTarif(tarifs, 'frais_gestion'));
      if (fraisTarif) setFraisGestion(fraisTarif.actif);
      if (kmSeuil) setSeuilKm(kmSeuil.valeur);
      if (kmTarif) setTarifKmDepassement(kmTarif.valeur);
      // Depot de garantie : inactif tant que la direction n'a pas saisi le
      // montant dans Parametres > Tarifs (aucune facture existante n'est touchee).
      const depotTarif = tarifs.find(t => t.cle === 'depot_garantie');
      if (depotTarif && depotTarif.actif) setDepotGarantie(depotTarif.valeur);
      // Par defaut le vehicule est loue tout le mois (cas nominal du modele DAF).
      setNbJoursLocation(lastDay);
    }

    // Jours feries du mois (cle "YYYY-MM-DD") pour tarifer au bon tarif ferie.
    const plages = plagesRes.data || [];
    const feries = new Set((feriesRes.data || []).map((f: { date: string }) => f.date));

    // Group plages by type_jour (uniquement pour le tarif MOYEN d'affichage si 0 course)
    const plagesLunVen = plages.filter(p => p.type_jour === 'lun_ven');
    const plagesSamedi = plages.filter(p => p.type_jour === 'samedi');
    const plagesDimanche = plages.filter(p => p.type_jour === 'dimanche' || p.type_jour === 'feries');
    const plagesAstreinte = plages.filter(p => p.type_jour === 'astreinte');
    const avgTarif = (list: typeof plages) => list.length > 0 ? list.reduce((s, p) => s + p.tarif, 0) / list.length : 0;
    const tarifJour = avgTarif(plagesLunVen);
    const tarifSam = avgTarif(plagesSamedi);
    const tarifDim = avgTarif(plagesDimanche);
    const tarifAstr = avgTarif(plagesAstreinte);
    // Tarif horaire d'astreinte : plage propre a la ligne du chauffeur en
    // priorite, sinon la plage generique (meme regle que le trigger tarif_course).
    const ligneChauffeur = chauffeurs.find(c => c.id === chauffeurId)?.ligne_id || null;
    const plageAstreinteRetenue = [...plagesAstreinte]
      .sort((a, b) => (Number(b.ligne_id === ligneChauffeur) - Number(a.ligne_id === ligneChauffeur)) || (a.ordre - b.ordre))
      .find(pl => pl.ligne_id === ligneChauffeur || pl.ligne_id == null);
    if (!facture && plageAstreinteRetenue) setTarifHeureAstreinte(plageAstreinteRetenue.tarif);

    // Categorize courses dynamically and accumulate weighted totals
    const courses = coursesRes.data || [];
    let semaineJour = 0, semaineNuit = 0, samedi = 0, dimanche = 0, astreinte = 0, nonPlanifie = 0;
    let totalSemaineJour = 0, totalSemaineNuit = 0, totalSamedi = 0, totalDimanche = 0, totalAstreinte = 0, totalNonPlanifie = 0;
    const detailList: CourseDetail[] = [];

    courses.forEach(c => {
      const p = mParts(c.date_heure);                          // jour/heure en Mayotte
      const isFerie = feries.has(mDateStr(c.date_heure));
      const montant = (c as { montant?: number }).montant || 0; // prix autoritatif (trigger tarif_course)

      let cat = '';
      if (c.statut_planification === 'non_planifie') {
        nonPlanifie++; totalNonPlanifie += montant; cat = 'Non planifie';
      } else if ((c as { is_astreinte?: boolean }).is_astreinte) {
        astreinte++; totalAstreinte += montant; cat = 'Astreinte';
      } else if (isFerie || p.dow === 0) {                     // ferie ou dimanche -> 27,5
        dimanche++; totalDimanche += montant; cat = isFerie ? 'Ferie' : 'Dimanche';
      } else if (p.dow === 6) {
        samedi++; totalSamedi += montant; cat = 'Samedi';
      } else if (p.h >= 19) {                                  // lun-ven soir
        semaineNuit++; totalSemaineNuit += montant; cat = 'Semaine nuit';
      } else {
        semaineJour++; totalSemaineJour += montant; cat = 'Semaine jour';
      }

      detailList.push({
        id: c.id,
        date_heure: c.date_heure,
        depart: c.depart || '',
        arrivee: c.arrivee || '',
        periode: c.periode || '',
        statut_planification: c.statut_planification || 'planifie',
        duree_minutes: c.duree_minutes,
        ligne_id: c.ligne_id,
        lignes: c.lignes as { nom: string } | null,
        categorie: cat,
      });
    });

    setCoursesDetail(detailList);

    // #6 : ventilation du nombre de trajets par plage tarifaire. On rattache
    // chaque course a UNE plage en repliquant la selection du trigger
    // `tarif_course` (type de jour Mayotte + heure ; plage specifique a la ligne
    // prioritaire, sinon `ordre` le plus petit) -> le decompte reconcilie avec
    // le montant facture.
    type PlageRow = { id: string; type_jour: string; heure_debut: string; heure_fin: string; tarif: number; libelle: string | null; ligne_id: string | null; ordre: number };
    const plagesTyped = plages as unknown as PlageRow[];
    type Brk = { key: string; ligneCode: string; ligneNom: string; typeJour: string; tranche: string; libelle: string; count: number; tarif: number; total: number; nonPlanifie: number };
    const tally = new Map<string, Brk>();
    courses.forEach(c => {
      const p = mParts(c.date_heure);
      const isFerie = feries.has(mDateStr(c.date_heure));
      const montant = (c as { montant?: number }).montant || 0;
      const ligneId = (c as { ligne_id?: string | null }).ligne_id || null;
      const isNonPlan = c.statut_planification === 'non_planifie';
      const typeJour = (c as { is_astreinte?: boolean }).is_astreinte ? 'astreinte'
        : isFerie ? 'feries' : p.dow === 0 ? 'dimanche' : p.dow === 6 ? 'samedi' : 'lun_ven';
      const hhmm = `${String(p.h).padStart(2, '0')}:${String(p.mi).padStart(2, '0')}`;
      // Meme selection de plage que le trigger tarif_course (plage specifique a la
      // ligne prioritaire, sinon generique ; ordre le plus petit).
      const match = plagesTyped
        .filter(pl => pl.type_jour === typeJour && hhmm >= pl.heure_debut && hhmm < pl.heure_fin
          && (pl.ligne_id === ligneId || pl.ligne_id == null))
        .sort((a, b) =>
          (Number(b.ligne_id === ligneId) - Number(a.ligne_id === ligneId)) || (a.ordre - b.ordre))[0];
      const lig = ligneId ? ligneMap.get(ligneId) : null;
      const ligneCode = lig?.code || (ligneId ? '?' : 'Sans ligne');
      const tranche = match ? `${match.heure_debut}-${match.heure_fin}` : '(hors plage)';
      // Cle par LIGNE de transport ET tranche -> detail maximal.
      const key = `${ligneId || '∅'}::${match ? match.id : 'none:' + typeJour}`;
      const cur: Brk = tally.get(key) || {
        key, ligneCode, ligneNom: lig?.nom || '', typeJour, tranche,
        libelle: match?.libelle || '', count: 0, tarif: Number(match?.tarif ?? 0), total: 0, nonPlanifie: 0,
      };
      cur.count += 1;
      cur.total += montant;
      if (isNonPlan) cur.nonPlanifie += 1;
      tally.set(key, cur);
    });
    // Tri : par code ligne, puis par heure de debut de tranche.
    setPlagesBreakdown([...tally.values()].sort((a, b) =>
      a.ligneCode.localeCompare(b.ligneCode) || a.tranche.localeCompare(b.tranche)));

    setNbSemaineJour(semaineJour);
    setTarifSemaineJour(semaineJour > 0 ? totalSemaineJour / semaineJour : tarifJour);
    setNbSemaineNuit(semaineNuit);
    setTarifSemaineNuit(semaineNuit > 0 ? totalSemaineNuit / semaineNuit : tarifJour);
    setNbSamedi(samedi);
    setTarifSamedi(samedi > 0 ? totalSamedi / samedi : tarifSam);
    setNbDimanche(dimanche);
    setTarifDimanche(dimanche > 0 ? totalDimanche / dimanche : tarifDim);
    setNbAstreinte(astreinte);
    setTarifAstreinte(astreinte > 0 ? totalAstreinte / astreinte : tarifAstr);
    setNbNonPlanifie(nonPlanifie);
    setTarifNonPlanifie(nonPlanifie > 0 ? totalNonPlanifie / nonPlanifie : tarifJour);

    // Astreintes realisees : on COMPTE les sessions confirmees du mois (le
    // modele mobile a un seul bouton "realisee", plus de duree) -> forfait.
    const { data: astreinteSessions } = await supabase
      .from('astreinte_sessions')
      .select('id, date')
      .eq('chauffeur_id', chauffeurId)
      .gte('date', moisStart)
      .lte('date', moisEnd);

    if (!facture && astreinteSessions) {
      setNbAstreintesReal(astreinteSessions.length);
    }
    setRecapSessions((astreinteSessions || []).map(s => ({ date: s.date })));

    // Recap jour par jour : contrairement a la facture, il doit voir AUSSI les
    // trajets planifies non effectues et les non planifies -> requete dediee.
    const [recapRes, creneauxRes, dettesRows, entRes] = await Promise.all([
      supabase.from('courses')
        .select('id, date_heure, ligne_id, montant, is_astreinte, statut_planification, statut_realisation, depart, arrivee')
        .eq('chauffeur_id', chauffeurId)
        .gte('date_heure', debutInstant)
        .lt('date_heure', finInstant)
        .order('date_heure', { ascending: true })
        .range(0, 9999),                       // sans .range() PostgREST tronque a 1000
      // Creneaux d'astreinte PLANIFIES : la seule source d'une duree reelle
      // (les sessions realisees ont heure_debut == heure_fin).
      supabase.from('astreintes')
        .select('date_debut, date_fin')
        .eq('chauffeur_id', chauffeurId)
        .gte('date_debut', debutInstant)
        .lt('date_debut', finInstant),
      loadDettes(chauffeurId),
      // Pas de filtre user_id : les donnees sont partagees org-wide, l'entete de
      // facture doit sortir identique quel que soit le directeur connecte.
      supabase.from('entreprise').select('*').order('created_at', { ascending: true }).limit(1).maybeSingle(),
    ]);
    setRecapCourses((recapRes.data as RecapCourse[] | null) || []);
    setRecapCreneaux((creneauxRes.data as { date_debut: string; date_fin: string | null }[] | null) || []);
    setRecapPlages(plagesTyped);
    setRecapFeries(feries);
    setDettes(dettesRows);
    if (entRes.data) setEntreprise(entRes.data as Record<string, string | null>);

    // Facture existante : restaurer les compteurs enregistres (JSON notes) et les
    // tarifs agreges stockes, afin de retrouver la facture telle qu'enregistree
    // plutot que la version recalculee (qui pourrait avoir change depuis).
    if (facture) {
      try {
        const n = JSON.parse((facture as { notes?: string }).notes || '{}');
        if (typeof n.semaine_jour === 'number') setNbSemaineJour(n.semaine_jour);
        if (typeof n.semaine_nuit === 'number') setNbSemaineNuit(n.semaine_nuit);
        if (typeof n.samedi === 'number') setNbSamedi(n.samedi);
        if (typeof n.dimanche === 'number') setNbDimanche(n.dimanche);
        if (typeof n.astreinte === 'number') setNbAstreinte(n.astreinte);
        if (typeof n.non_planifie === 'number') setNbNonPlanifie(n.non_planifie);
        // Detail fige : pour une facture validee/payee on reaffiche la liste des
        // courses telle qu'enregistree (et non recalculee), afin de toujours
        // pouvoir consulter ce qui a ete facture meme si les courses ont change.
        // Un brouillon garde le detail recalcule en direct (il reflete les edits).
        if (Array.isArray(n.courses_snapshot) && (facture as { statut?: string }).statut !== 'brouillon') {
          setCoursesDetail(n.courses_snapshot as CourseDetail[]);
        }
        // Detail des tranches fige (facture validee/payee) : on reaffiche ce qui a
        // ete facture, pas un recalcul (les tarifs/plages ont pu changer depuis).
        if (Array.isArray(n.tranche_breakdown) && (facture as { statut?: string }).statut !== 'brouillon') {
          setPlagesBreakdown(n.tranche_breakdown);
        }
      } catch { /* notes non JSON : on garde les valeurs recalculees */ }
      const f = facture as unknown as Record<string, number | undefined>;
      if (f.tarif_trajet_normal) setTarifSemaineJour(f.tarif_trajet_normal);
      if (f.tarif_trajet_astreinte) setTarifAstreinte(f.tarif_trajet_astreinte);
    }
    } catch (err) {
      console.error('Facturation load error:', err);
    } finally {
      setLoading(false);
    }
  }

  // Calculations
  // Total des trajets = somme des tranches (ligne x plage), montants reels
  // (prix trigger tarif_course). Remplace les anciens 6 paquets moyennes.
  const montantTrajets = plagesBreakdown.reduce((s, b) => s + b.total, 0);
  const nbTrajetsVentiles = plagesBreakdown.reduce((s, b) => s + b.count, 0);
  const montantCoordSamedi = nbSamedisCoord * forfaitCoordSamedi;
  const montantCoordDimanche = nbDimanchesCoord * forfaitCoordDimanche;
  const montantCoordSemaine = nbJoursCoordSemaine * forfaitCoordSemaine;
  const montantLocation = locationVehicule ? tarifLocation : 0;
  const montantFraisGestion = fraisGestion ? tarifFraisGestion : 0;
  // Coherence check: an end-of-month odometer lower than the start one means a
  // bad reading (or a vehicle change) — flag it instead of silently billing 0.
  const kmIncoherent = kmFinMois > 0 && kmFinMois < kmDebutMois;
  const kmParcourus = kmIncoherent ? 0 : kmFinMois - kmDebutMois;
  const kmSurplus = Math.max(0, kmParcourus - seuilKm);
  const montantDepassementKm = kmSurplus * tarifKmDepassement;
  const montantLignesSupp = lignesSupp.reduce((s, l) => s + (l.quantite * l.montant), 0);

  // On ne rembourse jamais plus que le solde d'avance restant.
  const remboursementEffectif = Math.min(remboursementAvance, soldeAvanceAvant);

  // Echeances de dette tombant sur le mois facture : retenues automatiquement.
  const echeancesMois = useMemo(() => echeancesDuMois(dettes, moisReference), [dettes, moisReference]);
  const montantDettes = echeancesMois.reduce((s, e) => s + e.montant, 0);

  // Recap jour par jour. La colonne "Valeur" reprend les montants reels des
  // courses (trigger tarif_course) : le total du recap doit tomber sur le
  // montant des trajets de la facture, c'est la raison d'etre du document.
  const [recapY, recapM] = moisReference.slice(0, 7).split('-').map(Number);
  const recap = useMemo(() => buildRecapMensuel({
    annee: recapY, mois: recapM, courses: recapCourses, plages: recapPlages,
    feries: recapFeries, sessions: recapSessions, creneaux: recapCreneaux,
    tarifHeureAstreinte, complements: complementsGreve, heuresManuelles: heuresAstreinte,
  }), [recapY, recapM, recapCourses, recapPlages, recapFeries, recapSessions, recapCreneaux,
      tarifHeureAstreinte, complementsGreve, heuresAstreinte]);
  const montantComplementGreve = recap.totaux.complementGreve;
  // Astreinte = heures retenues x tarif horaire ; le recap est la source unique.
  const montantAstreinte = recap.totaux.valeurAstreinte;
  const heuresAstreinteTotal = recap.totaux.minutesAstreinte / 60;
  // Le planning d'astreinte ne colle pas toujours au realise : on le signale
  // plutot que de sous-payer en silence.
  const astreinteIncoherente = recap.totaux.nbAstreintes > 0 && recap.totaux.minutesAstreinte === 0;

  const sousTotal = montantTrajets + montantAstreinte + montantLignesSupp + montantCoordSemaine + montantCoordSamedi + montantCoordDimanche + montantComplementGreve;
  const totalDeductions = montantLocation + montantFraisGestion + montantDepassementKm + remboursementEffectif + depotGarantie + montantDettes;
  const netAPayer = sousTotal - totalDeductions;

  const selectedChauffeur = chauffeurs.find(c => c.id === chauffeurId);
  const totalTrajets = nbTrajetsVentiles;

  const nbJoursMois = new Date(recapY, recapM, 0).getDate();
  const recapPied: RecapPied = {
    kmDebut: kmDebutMois, kmFin: kmFinMois, kmParcourus, seuilKm, kmSurplus,
    vehiculeLoue: locationVehicule, nbJoursLocation, nbJoursMois,
    fraisGestion: montantFraisGestion, forfaitLocation: montantLocation,
    depotGarantie, supplementKm: montantDepassementKm,
    dettes: echeancesMois.map(e => ({ libelle: e.libelle, montant: e.montant })),
    remboursementAvance: remboursementEffectif, netAPayer,
  };

  async function reloadDettes() {
    if (chauffeurId) setDettes(await loadDettes(chauffeurId));
  }

  function addLigneSupp() {
    setLignesSupp([...lignesSupp, { libelle: '', quantite: 1, montant: 0 }]);
  }

  function updateLigneSupp(idx: number, field: keyof LigneSupp, val: string | number) {
    setLignesSupp(prev => prev.map((l, i) => i === idx ? { ...l, [field]: val } : l));
  }

  function removeLigneSupp(idx: number) {
    setLignesSupp(prev => prev.filter((_, i) => i !== idx));
  }

  // ---- Export facture (PDF via impression navigateur, Excel sans dependance) ----
  function factureExportData() {
    const ch = selectedChauffeur;
    const chLabel = ch ? `${ch.code} ${ch.prenom} ${ch.nom}`.trim() : '';
    const lines: { label: string; nb: number; tarif: number; montant: number }[] = [];
    const push = (label: string, nb: number, tarif: number, montant: number) => { if (montant || nb) lines.push({ label, nb, tarif, montant }); };
    // Detail par ligne x tranche horaire (granularite maximale).
    plagesBreakdown.forEach(b => push(
      `${b.ligneCode} ${b.tranche}${b.libelle ? ' ' + b.libelle : ''} (${DAYTYPE_LABEL[b.typeJour] || b.typeJour})`,
      b.count, b.tarif, b.total));
    push(`Astreinte (${formatHeures(recap.totaux.minutesAstreinte)})`, heuresAstreinteTotal, tarifHeureAstreinte, montantAstreinte);
    push('Coordinateur (jours de semaine)', nbJoursCoordSemaine, forfaitCoordSemaine, montantCoordSemaine);
    push('Coordinateur (samedis)', nbSamedisCoord, forfaitCoordSamedi, montantCoordSamedi);
    push('Coordinateur (dimanches)', nbDimanchesCoord, forfaitCoordDimanche, montantCoordDimanche);
    lignesSupp.forEach(l => push(l.libelle || 'Ligne supplementaire', l.quantite, l.montant, l.quantite * l.montant));
    push('Complement greve', 0, 0, montantComplementGreve);
    const deductions: { label: string; montant: number }[] = [];
    const pushD = (label: string, montant: number) => { if (montant) deductions.push({ label, montant }); };
    pushD('Location vehicule', montantLocation);
    pushD('Frais de gestion', montantFraisGestion);
    pushD('Depot de garantie', depotGarantie);
    pushD('Depassement kilometrique', montantDepassementKm);
    echeancesMois.forEach(e => pushD(e.libelle, e.montant));
    pushD('Remboursement avance', remboursementEffectif);
    return { numero: facture?.numero || 'BROUILLON', chLabel, code: ch?.code || 'facture', mois: moisReference, lines, deductions, sousTotal, totalDeductions, netAPayer };
  }

  function exportFactureExcel() {
    const d = factureExportData();
    const rows: CellValue[][] = [
      [`Facture retrocession ${d.numero} - ${d.chLabel} - ${d.mois}`],
      [],
      ['Prestation', 'Quantite', 'Tarif (EUR)', 'Montant (EUR)'],
      ...d.lines.map(l => [l.label, l.nb, l.tarif, Math.round(l.montant * 100) / 100] as CellValue[]),
      ['Sous-total', '', '', Math.round(d.sousTotal * 100) / 100],
      ...d.deductions.map(l => [`Deduction : ${l.label}`, '', '', -Math.round(l.montant * 100) / 100] as CellValue[]),
      ['Total deductions', '', '', -Math.round(d.totalDeductions * 100) / 100],
      ['NET A PAYER', '', '', Math.round(d.netAPayer * 100) / 100],
    ];
    downloadSpreadsheet(`Facture_${d.code}_${d.mois}`, [{ name: 'Facture', rows }]);
  }

  // Facture au format SOUS-TRAITANT demande par la DAF : c'est l'artisan qui
  // facture Taxi Vanille (entete a ses coordonnees, detail par ligne de
  // transport, bloc compensations, NET A REGLER).
  function buildFactureDoc(): FactureDoc {
    const ch = selectedChauffeur;
    const [y, m] = moisReference.slice(0, 7).split('-').map(Number);
    const lastDay = new Date(y, m, 0).getDate();
    const prefixe = (entreprise?.facture_prefixe as string) || '';

    // Une prestation par LIGNE de transport : c'est la maille du document DAF.
    const parLigne = new Map<string, number>();
    plagesBreakdown.forEach(b => {
      const ligneId = b.key.split('::')[0];
      parLigne.set(ligneId, (parLigne.get(ligneId) || 0) + b.total);
    });
    const designation = (entreprise?.marche_libelle as string)
      ? `Prestations de transport realisees dans le cadre du ${entreprise?.marche_libelle}`
      : 'Prestations de transport realisees';
    const prestations = [...parLigne.entries()]
      .filter(([, montant]) => montant !== 0)
      .map(([ligneId, montant]) => {
        const info = lignesInfo.get(ligneId);
        const trajet = info && info.depart && info.arrivee ? `${info.depart} <-> ${info.arrivee}` : (info?.nom || 'Sans ligne');
        return { designation, ligne: `${info?.code ? info.code + ' — ' : ''}${trajet}`, montant };
      })
      .sort((a, b) => a.ligne.localeCompare(b.ligne));

    if (montantAstreinte) prestations.push({ designation, ligne: `Astreinte (${formatHeures(recap.totaux.minutesAstreinte)})`, montant: montantAstreinte });
    if (montantCoordSemaine) prestations.push({ designation, ligne: `Coordination jours de semaine (${nbJoursCoordSemaine})`, montant: montantCoordSemaine });
    if (montantCoordSamedi) prestations.push({ designation, ligne: `Coordination samedis (${nbSamedisCoord})`, montant: montantCoordSamedi });
    if (montantCoordDimanche) prestations.push({ designation, ligne: `Coordination dimanches (${nbDimanchesCoord})`, montant: montantCoordDimanche });
    lignesSupp.forEach(l => { if (l.quantite * l.montant) prestations.push({ designation: l.libelle || 'Prestation complementaire', ligne: '', montant: l.quantite * l.montant }); });
    if (montantComplementGreve) prestations.push({ designation: 'Complement greve', ligne: '', montant: montantComplementGreve });

    const compensations: { libelle: string; montant: number }[] = [];
    const pushC = (libelle: string, montant: number) => { if (montant) compensations.push({ libelle, montant }); };
    pushC('Frais de gestion', montantFraisGestion);
    pushC(`Location vehicule${nbJoursLocation ? ` (${nbJoursLocation} j / ${lastDay} j)` : ''}`, montantLocation);
    pushC('Depot de garantie mensuel', depotGarantie);
    pushC(`Supplement kilometrage (${kmSurplus.toFixed(0)} km)`, montantDepassementKm);
    echeancesMois.forEach(e => pushC(e.libelle, e.montant));
    pushC('Remboursement avance', remboursementEffectif);

    return {
      numero: facture?.numero || numeroFactureMarche(prefixe, y, m, ch?.code || ''),
      moisNumero: m,
      moisLabel: `${MONTHS_FR[m - 1]} ${y}`,
      dateFacture: new Date(y, m - 1, lastDay).toLocaleDateString('fr-FR'),
      artisan: {
        matricule: ch?.code || '',
        nomComplet: ch ? `${ch.nom} ${ch.prenom}`.trim() : '',
        adresse: ch?.adresse || '',
        telephone: ch?.telephone || '',
        email: ch?.email || '',
        siret: ch?.nif_siret || '',
      },
      destinataire: {
        nom: (entreprise?.nom as string) || 'Taxi Vanille',
        adresse: (entreprise?.adresse as string) || '',
        telephone: (entreprise?.telephone as string) || '',
        siret: (entreprise?.siret as string) || '',
      },
      marche: {
        libelle: (entreprise?.marche_libelle as string) || '',
        contratDate: entreprise?.marche_contrat_date ? new Date(entreprise.marche_contrat_date as string).toLocaleDateString('fr-FR') : '',
        mentionTva: (entreprise?.mention_tva as string) || '',
        modeReglement: (entreprise?.mode_reglement as string) || '',
      },
      prestations,
      compensations,
      montantFacture: sousTotal,
      montantCompensation: totalDeductions,
      netARegler: netAPayer,
    };
  }

  function exportFacturePdf() {
    if (!printFacture(buildFactureHtml(buildFactureDoc()))) {
      alert("Impossible d'ouvrir la fenetre d'impression (popup bloquee par le navigateur).");
    }
  }

  async function handleSave(statut: string) {
    if (kmIncoherent && !confirm('Le kilometrage est incoherent (fin < debut) : le depassement km sera facture 0. Enregistrer quand meme ?')) {
      return;
    }
    setSaving(true);
    try {
      // Numerotation du marche (CADEMA-2026-07-C4) des qu'un prefixe est
      // configure dans Parametres > Entreprise ; sinon on garde l'ancien format.
      // Une facture existante ne se renumerote jamais.
      const prefixeFacture = (entreprise?.facture_prefixe as string) || '';
      const [numY, numM] = moisReference.slice(0, 7).split('-').map(Number);
      const numero = facture?.numero
        || (prefixeFacture
          ? numeroFactureMarche(prefixeFacture, numY, numM, selectedChauffeur?.code || '')
          : `F${new Date().getFullYear()}-${String(Math.floor(Math.random() * 9999)).padStart(4, '0')}`);
      const payload = {
        numero,
        chauffeur_id: chauffeurId || null,
        client_id: null,
        date_emission: new Date().toISOString().split('T')[0],
        mois_reference: moisReference,
        statut,
        nb_trajets_normaux: nbSemaineJour + nbSemaineNuit + nbSamedi + nbDimanche,
        tarif_trajet_normal: tarifSemaineJour,
        nb_trajets_astreinte: nbAstreinte + nbNonPlanifie,
        tarif_trajet_astreinte: tarifAstreinte,
        nb_astreintes: nbAstreintesReal,
        forfait_astreinte: 0,               // remplace par la facturation horaire
        nb_heures_astreinte: heuresAstreinteTotal,
        tarif_heure_astreinte: tarifHeureAstreinte,
        forfait_coordinateur_samedi: forfaitCoordSamedi,
        forfait_coordinateur_dimanche: forfaitCoordDimanche,
        nb_samedis_coordinateur: nbSamedisCoord,
        nb_dimanches_coordinateur: nbDimanchesCoord,
        forfait_coordinateur_semaine: forfaitCoordSemaine,
        nb_jours_coordinateur_semaine: nbJoursCoordSemaine,
        location_vehicule: locationVehicule,
        tarif_location: tarifLocation,
        nb_jours_location: nbJoursLocation,
        frais_gestion: fraisGestion,
        tarif_frais_gestion: tarifFraisGestion,
        depot_garantie: depotGarantie,
        montant_dettes: montantDettes,
        // Recap fige : le detail jour par jour tel que facture, + les saisies
        // manuelles (complement greve) qui n'existent nulle part ailleurs.
        recap_journalier: {
          complements: complementsGreve,
          heures_manuelles: heuresAstreinte,
          colonnes: recap.colonnes,
          jours: recap.jours,
          totaux: recap.totaux,
        },
        km_debut_mois: kmDebutMois,
        km_fin_mois: kmFinMois,
        seuil_km: seuilKm,
        tarif_km_depassement: tarifKmDepassement,
        montant_depassement_km: montantDepassementKm,
        lignes_supplementaires: lignesSupp,
        remboursement_avance: remboursementEffectif,
        solde_avance_avant: soldeAvanceAvant,
        solde_avance_apres: Math.max(0, soldeAvanceAvant - remboursementEffectif),
        montant_ht: sousTotal,
        montant_ttc: sousTotal,
        tva: 0,
        net_a_payer: netAPayer,
        notes: JSON.stringify({
          semaine_jour: nbSemaineJour, semaine_nuit: nbSemaineNuit, samedi: nbSamedi,
          dimanche: nbDimanche, astreinte: nbAstreinte, non_planifie: nbNonPlanifie,
          // Snapshot fige de la liste des courses facturees : permet de reconsulter
          // le detail meme si les courses changent/disparaissent apres validation
          // (sans ca le detail est recalcule en direct et peut se vider).
          courses_snapshot: coursesDetail.map(c => ({
            id: c.id, date_heure: c.date_heure, depart: c.depart, arrivee: c.arrivee,
            duree_minutes: c.duree_minutes, lignes: c.lignes, categorie: c.categorie,
          })),
          // Detail fige par (ligne x tranche horaire) : ce qui a ete facture.
          tranche_breakdown: plagesBreakdown,
        }),
        user_id: user.id,
      };

      const { data: saved, error } = facture
        ? await supabase.from('factures').update(payload).eq('id', facture.id).select('id').maybeSingle()
        : await supabase.from('factures').insert(payload).select('id').maybeSingle();

      if (error) {
        alert(error.code === '23505'
          ? 'Une facture existe deja pour ce chauffeur et ce mois de reference.'
          : `Erreur lors de l'enregistrement: ${error.message}`);
        return;
      }

      // Une echeance n'est consideree comme remboursee qu'une fois la facture
      // sortie du brouillon : un brouillon peut encore etre supprime ou change.
      const factureId = saved?.id || facture?.id || null;
      if (echeancesMois.length > 0) {
        const ids = echeancesMois.map(e => e.echeanceId);
        await supabase.from('chauffeur_dette_echeances')
          .update(statut === 'brouillon'
            ? { statut: 'prevue', facture_id: null, updated_at: new Date().toISOString() }
            : { statut: 'appliquee', facture_id: factureId, updated_at: new Date().toISOString() })
          .in('id', ids);
      }
      onSaved();
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 bg-black/60 z-50 flex items-start justify-center overflow-y-auto py-4">
      <div className="bg-white rounded-2xl w-full max-w-3xl shadow-2xl mx-4 my-auto">
        {/* Header */}
        <div className="sticky top-0 z-10 bg-white rounded-t-2xl border-b border-gray-200 px-6 py-4 flex items-center justify-between">
          <div>
            <h2 className="font-bold text-gray-900">{facture ? `Facture ${facture.numero}` : 'Nouvelle facture de retrocession'}</h2>
            <p className="text-xs text-gray-500">Chauffeur vers Taxi Vanille 976</p>
          </div>
          <button onClick={onClose} className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-6 space-y-6 max-h-[80vh] overflow-y-auto">
          {/* Chauffeur selection */}
          <div className="bg-gray-50 rounded-xl p-4 space-y-3">
            <h3 className="text-xs font-bold text-gray-500 uppercase">Emetteur (Chauffeur)</h3>
            {/* Chauffeurs groupes par ligne, puis tries par numero de code
                (D2 avant D10) : demande "selectionner par ligne, puis dans
                l'ordre des numeros". */}
            <select value={chauffeurId} onChange={(e) => setChauffeurId(e.target.value)} className="w-full px-3 py-2.5 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-amber-500 outline-none bg-white">
              <option value="">-- Selectionner un chauffeur --</option>
              {lignes.map(l => {
                const membres = chauffeurs.filter(c => c.ligne_id === l.id).sort(comparerChauffeurs);
                if (membres.length === 0) return null;
                return (
                  <optgroup key={l.id} label={`${l.code} - ${l.nom}`}>
                    {membres.map(c => <option key={c.id} value={c.id}>{c.code} - {c.prenom} {c.nom}</option>)}
                  </optgroup>
                );
              })}
              {(() => {
                const sansLigne = chauffeurs.filter(c => !c.ligne_id || !lignes.some(l => l.id === c.ligne_id)).sort(comparerChauffeurs);
                if (sansLigne.length === 0) return null;
                return (
                  <optgroup label="Sans ligne">
                    {sansLigne.map(c => <option key={c.id} value={c.id}>{c.code} - {c.prenom} {c.nom}</option>)}
                  </optgroup>
                );
              })()}
            </select>
            {selectedChauffeur && (
              <div className="grid grid-cols-2 gap-3 text-xs text-gray-600 bg-white rounded-lg p-3 border border-gray-100">
                <div><span className="text-gray-400">NIF/SIRET:</span> {selectedChauffeur.nif_siret || '-'}</div>
                <div><span className="text-gray-400">Tel:</span> {selectedChauffeur.telephone || '-'}</div>
                <div><span className="text-gray-400">Adresse:</span> {selectedChauffeur.adresse || '-'}</div>
                <div><span className="text-gray-400">Email:</span> {selectedChauffeur.email || '-'}</div>
              </div>
            )}
          </div>

          {/* Mois reference */}
          <div>
            <label className="block text-xs font-bold text-gray-500 uppercase mb-1.5">Mois de reference</label>
            <input type="month" value={moisReference.slice(0, 7)} onChange={(e) => setMoisReference(e.target.value + '-01')} className="w-48 px-3 py-2 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-amber-500 outline-none" />
          </div>

          {loading && (
            <div className="text-center py-4">
              <span className="inline-block w-5 h-5 border-2 border-amber-600 border-t-transparent rounded-full animate-spin" />
              <p className="text-xs text-gray-500 mt-2">Chargement des courses...</p>
            </div>
          )}

          {/* Courses breakdown by category */}
          {!loading && chauffeurId && (
            <>
              <div className="bg-white border border-gray-200 rounded-xl p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <h3 className="text-xs font-bold text-gray-500 uppercase">Trajets termines - Detail par categorie</h3>
                  <span className="text-xs font-bold text-gray-700 bg-gray-100 px-2 py-1 rounded">{totalTrajets} trajets</span>
                </div>

                {/* Detail par LIGNE x TRANCHE horaire (calcule, tarifs reels du
                    trigger tarif_course). Chaque tranche facturee separement. */}
                {plagesBreakdown.length > 0 ? (
                  <div className="border border-gray-100 rounded-lg overflow-hidden">
                    <div className="grid grid-cols-[64px_1fr_44px_66px_88px] gap-2 px-2 py-1.5 bg-gray-50 text-[10px] uppercase font-semibold text-gray-400">
                      <span>Ligne</span><span>Tranche horaire</span><span className="text-center">Nb</span><span className="text-right">Tarif</span><span className="text-right">Total EUR</span>
                    </div>
                    {plagesBreakdown.map((b) => (
                      <div key={b.key} className="grid grid-cols-[64px_1fr_44px_66px_88px] gap-2 px-2 py-1.5 items-center text-xs border-t border-gray-50">
                        <span className="font-semibold text-gray-800">{b.ligneCode}</span>
                        <span className="text-gray-600">
                          {b.tranche}{b.libelle ? ` · ${b.libelle}` : ''}
                          <span className="text-[10px] text-gray-400"> ({DAYTYPE_LABEL[b.typeJour] || b.typeJour})</span>
                          {b.nonPlanifie > 0 && <span className="text-[10px] text-teal-600"> · {b.nonPlanifie} non planifie(s)</span>}
                        </span>
                        <span className="text-center tabular-nums text-gray-700">{b.count}</span>
                        <span className="text-right tabular-nums text-gray-500">{b.tarif.toFixed(2)}</span>
                        <span className="text-right font-bold text-gray-900 tabular-nums">{b.total.toFixed(2)}</span>
                      </div>
                    ))}
                    <div className="grid grid-cols-[64px_1fr_44px_66px_88px] gap-2 px-2 py-1.5 items-center text-xs border-t border-gray-200 bg-gray-50 font-bold">
                      <span className="col-span-2 text-gray-700">Sous-total trajets</span>
                      <span className="text-center tabular-nums">{nbTrajetsVentiles}</span>
                      <span />
                      <span className="text-right tabular-nums text-gray-900">{montantTrajets.toFixed(2)}</span>
                    </div>
                  </div>
                ) : (
                  <p className="text-xs text-gray-400 text-center py-3">Aucun trajet termine sur ce mois.</p>
                )}

                {/* Astreinte a l'heure : les heures viennent du recap (creneaux
                    planifies, corrigeables a la main jour par jour). */}
                <div className="space-y-1.5 border-t border-gray-100 pt-2">
                  <div className="grid grid-cols-[1fr_80px_100px_100px] gap-2 items-center text-sm">
                    <span className="text-gray-700 font-medium">
                      Astreinte <span className="text-[10px] text-gray-400">({formatHeures(recap.totaux.minutesAstreinte)} — {recap.totaux.nbAstreintes} confirmee(s))</span>
                    </span>
                    <span className="text-center tabular-nums text-gray-700">{heuresAstreinteTotal.toFixed(2)} h</span>
                    <input type="number" step="0.01" value={tarifHeureAstreinte} onChange={(e) => setTarifHeureAstreinte(parseFloat(e.target.value) || 0)} title="EUR par heure d'astreinte" className="px-2 py-1.5 border border-orange-200 rounded-lg text-center text-orange-700 bg-orange-50/50 focus:ring-1 focus:ring-orange-400 outline-none" />
                    <span className="text-right font-bold text-gray-900">{montantAstreinte.toFixed(2)} EUR</span>
                  </div>
                  {astreinteIncoherente && (
                    <p className="text-[11px] text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-2 py-1.5">
                      {recap.totaux.nbAstreintes} astreinte(s) confirmee(s) par le chauffeur mais aucun creneau planifie sur le mois :
                      saisissez les heures jour par jour dans le recap ci-dessous, sinon l'astreinte sera payee 0.
                    </p>
                  )}
                </div>

                {/* Forfait coordinateur */}
                {selectedChauffeur && chauffeurs.find(c => c.id === chauffeurId)?.code && (
                  <>
                    <div className="grid grid-cols-[1fr_80px_100px_100px] gap-2 items-center text-sm border-t border-gray-100 pt-2">
                      <span className="text-gray-700 font-medium">Forfait coord. semaine (lun-ven)</span>
                      <input type="number" value={nbJoursCoordSemaine} onChange={(e) => setNbJoursCoordSemaine(parseInt(e.target.value) || 0)} className="px-2 py-1.5 border border-indigo-200 rounded-lg text-center text-indigo-700 bg-indigo-50/50 focus:ring-1 focus:ring-indigo-400 outline-none" />
                      <input type="number" step="0.01" value={forfaitCoordSemaine} onChange={(e) => setForfaitCoordSemaine(parseFloat(e.target.value) || 0)} className="px-2 py-1.5 border border-indigo-200 rounded-lg text-center text-indigo-700 bg-indigo-50/50 focus:ring-1 focus:ring-indigo-400 outline-none" />
                      <span className="text-right font-bold text-gray-900">{montantCoordSemaine.toFixed(2)} EUR</span>
                    </div>
                    <div className="grid grid-cols-[1fr_80px_100px_100px] gap-2 items-center text-sm">
                      <span className="text-gray-700 font-medium">Forfait coord. samedi</span>
                      <input type="number" value={nbSamedisCoord} onChange={(e) => setNbSamedisCoord(parseInt(e.target.value) || 0)} className="px-2 py-1.5 border border-indigo-200 rounded-lg text-center text-indigo-700 bg-indigo-50/50 focus:ring-1 focus:ring-indigo-400 outline-none" />
                      <input type="number" step="0.01" value={forfaitCoordSamedi} onChange={(e) => setForfaitCoordSamedi(parseFloat(e.target.value) || 0)} className="px-2 py-1.5 border border-indigo-200 rounded-lg text-center text-indigo-700 bg-indigo-50/50 focus:ring-1 focus:ring-indigo-400 outline-none" />
                      <span className="text-right font-bold text-gray-900">{montantCoordSamedi.toFixed(2)} EUR</span>
                    </div>
                    <div className="grid grid-cols-[1fr_80px_100px_100px] gap-2 items-center text-sm">
                      <span className="text-gray-700 font-medium">Forfait coord. dimanche</span>
                      <input type="number" value={nbDimanchesCoord} onChange={(e) => setNbDimanchesCoord(parseInt(e.target.value) || 0)} className="px-2 py-1.5 border border-indigo-200 rounded-lg text-center text-indigo-700 bg-indigo-50/50 focus:ring-1 focus:ring-indigo-400 outline-none" />
                      <input type="number" step="0.01" value={forfaitCoordDimanche} onChange={(e) => setForfaitCoordDimanche(parseFloat(e.target.value) || 0)} className="px-2 py-1.5 border border-indigo-200 rounded-lg text-center text-indigo-700 bg-indigo-50/50 focus:ring-1 focus:ring-indigo-400 outline-none" />
                      <span className="text-right font-bold text-gray-900">{montantCoordDimanche.toFixed(2)} EUR</span>
                    </div>
                  </>
                )}

                {/* Header labels */}
                <div className="grid grid-cols-[1fr_80px_100px_100px] gap-2 text-[10px] text-gray-400 uppercase font-semibold border-t border-gray-100 pt-2">
                  <span></span>
                  <span className="text-center">Nb trajets</span>
                  <span className="text-center">Tarif/trajet</span>
                  <span className="text-right">Total</span>
                </div>
              </div>

              {/* Detail listing jour par jour */}
              {coursesDetail.length > 0 && (
                <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
                  <button
                    onClick={() => setShowListing(!showListing)}
                    className="w-full px-4 py-3 flex items-center justify-between hover:bg-gray-50 transition-colors"
                  >
                    <div className="flex items-center gap-2">
                      <Calendar className="w-4 h-4 text-amber-600" />
                      <span className="text-xs font-bold text-gray-500 uppercase">Detail jour par jour ({coursesDetail.length} courses)</span>
                    </div>
                    {showListing ? <ChevronUp className="w-4 h-4 text-gray-400" /> : <ChevronDown className="w-4 h-4 text-gray-400" />}
                  </button>
                  {showListing && (
                    <CoursesListing courses={coursesDetail} />
                  )}
                </div>
              )}

              {/* Lignes supplementaires */}
              <div className="bg-white border border-gray-200 rounded-xl p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <h3 className="text-xs font-bold text-gray-500 uppercase">Lignes supplementaires</h3>
                  <button onClick={addLigneSupp} className="text-xs text-amber-600 font-medium hover:text-amber-700 flex items-center gap-1"><Plus className="w-3 h-3" /> Ajouter</button>
                </div>
                {lignesSupp.map((l, i) => (
                  <div key={i} className="grid grid-cols-[1fr_80px_100px_32px] gap-2 items-end">
                    <div>
                      <label className="block text-[11px] text-gray-500 mb-1">Libelle</label>
                      <input type="text" value={l.libelle} onChange={(e) => updateLigneSupp(i, 'libelle', e.target.value)} className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-amber-500 outline-none" placeholder="Description..." />
                    </div>
                    <div>
                      <label className="block text-[11px] text-gray-500 mb-1">Qte</label>
                      <input type="number" value={l.quantite} onChange={(e) => updateLigneSupp(i, 'quantite', parseInt(e.target.value) || 0)} className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-amber-500 outline-none" />
                    </div>
                    <div>
                      <label className="block text-[11px] text-gray-500 mb-1">Montant</label>
                      <input type="number" step="0.01" value={l.montant} onChange={(e) => updateLigneSupp(i, 'montant', parseFloat(e.target.value) || 0)} className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-amber-500 outline-none" />
                    </div>
                    <button onClick={() => removeLigneSupp(i)} className="p-2 text-gray-400 hover:text-red-600 rounded-lg transition-colors"><X className="w-4 h-4" /></button>
                  </div>
                ))}
                {lignesSupp.length > 0 && (
                  <div className="text-right text-sm font-bold text-gray-700">Total: {montantLignesSupp.toFixed(2)} EUR</div>
                )}
              </div>

              {/* Recap mensuel jour par jour : piece justificative de la facture
                  (modele demande par la DAF le 18/08/2026). */}
              {chauffeurId && (
                <RecapMensuelChauffeur
                  titre={selectedChauffeur ? `${selectedChauffeur.code} ${selectedChauffeur.nom} ${selectedChauffeur.prenom}`.trim() : ''}
                  moisLabel={`${MONTHS_FR[recapM - 1]} ${recapY}`}
                  recap={recap}
                  trajets={recapCourses}
                  pied={recapPied}
                  onComplementChange={(date, montant) => setComplementsGreve(prev => ({ ...prev, [date]: montant }))}
                  onHeuresChange={(date, minutes) => setHeuresAstreinte(prev => {
                    const next = { ...prev };
                    if (minutes === null) delete next[date]; else next[date] = minutes;
                    return next;
                  })}
                  readOnly={facture?.statut === 'payee'}
                />
              )}

              {/* Dettes etalees sur plusieurs mois */}
              {chauffeurId && (
                <DettesChauffeur
                  chauffeurId={chauffeurId}
                  moisFacture={moisReference}
                  dettes={dettes}
                  onReload={reloadDettes}
                />
              )}

              {/* Deductions */}
              <div className="bg-red-50/50 border border-red-200 rounded-xl p-4 space-y-4">
                <h3 className="text-xs font-bold text-red-700 uppercase">Deductions</h3>

                {/* Location vehicule */}
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <label className="relative inline-flex items-center cursor-pointer">
                      <input type="checkbox" checked={locationVehicule} onChange={(e) => setLocationVehicule(e.target.checked)} className="sr-only peer" />
                      <div className="w-9 h-5 bg-gray-200 peer-focus:ring-2 peer-focus:ring-amber-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-amber-600"></div>
                    </label>
                    <span className="text-sm text-gray-700">Location vehicule</span>
                  </div>
                  {locationVehicule && (
                    <div className="flex items-center gap-2">
                      {/* Jours loues / jours du mois : justificatif attendu par la DAF. */}
                      <input type="number" min={0} max={nbJoursMois} value={nbJoursLocation} onChange={(e) => setNbJoursLocation(parseInt(e.target.value) || 0)} title="Nombre de jours de location dans le mois" className="w-16 px-2 py-1.5 border border-gray-200 rounded-lg text-sm text-right outline-none focus:ring-2 focus:ring-amber-500" />
                      <span className="text-xs text-gray-500">/ {nbJoursMois} j</span>
                      <input type="number" step="0.01" value={tarifLocation} onChange={(e) => setTarifLocation(parseFloat(e.target.value) || 0)} className="w-24 px-2 py-1.5 border border-gray-200 rounded-lg text-sm text-right outline-none focus:ring-2 focus:ring-amber-500" />
                      <span className="text-xs text-gray-500">EUR</span>
                    </div>
                  )}
                </div>

                {/* Depot de garantie mensuel */}
                <div className="flex items-center justify-between">
                  <span className="text-sm text-gray-700">Depot de garantie mensuel</span>
                  <div className="flex items-center gap-2">
                    <input type="number" step="0.01" value={depotGarantie} onChange={(e) => setDepotGarantie(parseFloat(e.target.value) || 0)} className="w-24 px-2 py-1.5 border border-gray-200 rounded-lg text-sm text-right outline-none focus:ring-2 focus:ring-amber-500" />
                    <span className="text-xs text-gray-500">EUR</span>
                  </div>
                </div>

                {/* Echeances de dette du mois : posees dans le bloc "Dettes",
                    imputees ici automatiquement (non modifiables a la volee). */}
                {echeancesMois.length > 0 && (
                  <div className="space-y-1 pt-2 border-t border-red-200">
                    <h4 className="text-[11px] font-semibold text-gray-600">Echeances de dette du mois</h4>
                    {echeancesMois.map(e => (
                      <div key={e.echeanceId} className="flex items-center justify-between text-xs">
                        <span className="text-gray-500">{e.libelle}</span>
                        <span className="font-bold text-red-700">-{e.montant.toFixed(2)} EUR</span>
                      </div>
                    ))}
                  </div>
                )}

                {/* Frais de gestion */}
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <label className="relative inline-flex items-center cursor-pointer">
                      <input type="checkbox" checked={fraisGestion} onChange={(e) => setFraisGestion(e.target.checked)} className="sr-only peer" />
                      <div className="w-9 h-5 bg-gray-200 peer-focus:ring-2 peer-focus:ring-amber-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-amber-600"></div>
                    </label>
                    <span className="text-sm text-gray-700">Frais de gestion</span>
                  </div>
                  {fraisGestion && (
                    <div className="flex items-center gap-2">
                      <input type="number" step="0.01" value={tarifFraisGestion} onChange={(e) => setTarifFraisGestion(parseFloat(e.target.value) || 0)} className="w-24 px-2 py-1.5 border border-gray-200 rounded-lg text-sm text-right outline-none focus:ring-2 focus:ring-amber-500" />
                      <span className="text-xs text-gray-500">EUR</span>
                    </div>
                  )}
                </div>

                {/* Depassement km */}
                <div className="space-y-2">
                  <h4 className="text-[11px] font-semibold text-gray-600">Depassement kilometrique</h4>
                  <div className="grid grid-cols-4 gap-2">
                    <div>
                      <label className="block text-[10px] text-gray-400 mb-0.5">Km debut</label>
                      <input type="number" value={kmDebutMois} onChange={(e) => setKmDebutMois(parseFloat(e.target.value) || 0)} className="w-full px-2 py-1.5 border border-gray-200 rounded-lg text-xs outline-none focus:ring-2 focus:ring-amber-500" />
                    </div>
                    <div>
                      <label className="block text-[10px] text-gray-400 mb-0.5">Km fin</label>
                      <input type="number" value={kmFinMois} onChange={(e) => setKmFinMois(parseFloat(e.target.value) || 0)} className="w-full px-2 py-1.5 border border-gray-200 rounded-lg text-xs outline-none focus:ring-2 focus:ring-amber-500" />
                    </div>
                    <div>
                      <label className="block text-[10px] text-gray-400 mb-0.5">Seuil</label>
                      <input type="number" value={seuilKm} onChange={(e) => setSeuilKm(parseFloat(e.target.value) || 0)} className="w-full px-2 py-1.5 border border-gray-200 rounded-lg text-xs outline-none focus:ring-2 focus:ring-amber-500" />
                    </div>
                    <div>
                      <label className="block text-[10px] text-gray-400 mb-0.5">Tarif/km surplus</label>
                      <input type="number" step="0.01" value={tarifKmDepassement} onChange={(e) => setTarifKmDepassement(parseFloat(e.target.value) || 0)} className="w-full px-2 py-1.5 border border-gray-200 rounded-lg text-xs outline-none focus:ring-2 focus:ring-amber-500" />
                    </div>
                  </div>
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-gray-500">Parcourus: {kmParcourus.toFixed(0)} km | Surplus: {kmSurplus.toFixed(0)} km</span>
                    <span className="font-bold text-red-700">-{montantDepassementKm.toFixed(2)} EUR</span>
                  </div>
                  {kmIncoherent && (
                    <div className="flex items-start gap-2 bg-red-50 border border-red-200 rounded-lg px-3 py-2 text-xs text-red-700">
                      <span className="font-bold shrink-0">!</span>
                      <span>
                        Kilometrage incoherent : le km de fin ({kmFinMois.toLocaleString('fr-FR')}) est inferieur au km de debut ({kmDebutMois.toLocaleString('fr-FR')}).
                        Verifiez les releves du chauffeur avant de valider — le depassement km est calcule a 0 par defaut.
                      </span>
                    </div>
                  )}
                </div>

                {/* Remboursement avance */}
                <div className="pt-2 border-t border-red-200 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-gray-700">Remboursement avance</span>
                    <div className="flex items-center gap-2">
                      <input type="number" step="0.01" value={remboursementAvance} onChange={(e) => setRemboursementAvance(parseFloat(e.target.value) || 0)} className="w-28 px-2 py-1.5 border border-gray-200 rounded-lg text-sm text-right outline-none focus:ring-2 focus:ring-amber-500" />
                      <span className="text-xs text-gray-500">EUR</span>
                    </div>
                  </div>
                  {soldeAvanceAvant > 0 && (
                    <div className="bg-white rounded-lg p-3 border border-gray-200 space-y-1.5">
                      <div className="flex items-center justify-between text-xs">
                        <span className="text-gray-500">Solde avances avant</span>
                        <span className="font-bold text-gray-800">{soldeAvanceAvant.toFixed(2)} EUR</span>
                      </div>
                      <div className="flex items-center justify-between text-xs">
                        <span className="text-gray-500">Remboursement impute</span>
                        <span className="font-bold text-red-600">-{Math.min(remboursementAvance, soldeAvanceAvant).toFixed(2)} EUR</span>
                      </div>
                      <div className="flex items-center justify-between text-xs pt-1 border-t border-gray-100">
                        <span className="text-gray-600 font-medium">Solde avances apres</span>
                        <span className="font-bold text-gray-900">{Math.max(0, soldeAvanceAvant - remboursementAvance).toFixed(2)} EUR</span>
                      </div>
                    </div>
                  )}
                  {soldeAvanceAvant === 0 && chauffeurId && (
                    <p className="text-xs text-gray-400">Aucune avance en cours pour ce chauffeur</p>
                  )}
                </div>
              </div>

              {/* Totaux */}
              <div className="bg-gray-900 rounded-xl p-5 text-white space-y-3">
                <div className="flex justify-between text-sm">
                  <span className="text-gray-400">Sous-total ({totalTrajets} trajets + forfaits + lignes supp.)</span>
                  <span className="font-medium">{sousTotal.toFixed(2)} EUR</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-gray-400">Total deductions</span>
                  <span className="font-medium text-red-400">-{totalDeductions.toFixed(2)} EUR</span>
                </div>
                <div className="flex justify-between text-lg pt-2 border-t border-gray-700">
                  <span className="font-bold">NET A PAYER</span>
                  <span className="font-bold text-emerald-400">{netAPayer.toFixed(2)} EUR</span>
                </div>
              </div>

              {/* Actions */}
              <div className="flex items-center justify-between pt-2">
                <div className="flex gap-2">
                  <button onClick={onClose} className="px-4 py-2.5 border border-gray-200 text-gray-700 rounded-xl font-medium hover:bg-gray-50 transition-colors">
                    Annuler
                  </button>
                  <button onClick={exportFacturePdf} disabled={!chauffeurId} title="Ouvrir une version imprimable (Enregistrer en PDF)" className="px-3 py-2.5 border border-gray-200 text-gray-700 rounded-xl font-medium hover:bg-gray-50 transition-colors disabled:opacity-50 flex items-center gap-2">
                    <Printer className="w-4 h-4" /> PDF
                  </button>
                  <button onClick={exportFactureExcel} disabled={!chauffeurId} title="Telecharger la facture au format Excel" className="px-3 py-2.5 border border-gray-200 text-gray-700 rounded-xl font-medium hover:bg-gray-50 transition-colors disabled:opacity-50 flex items-center gap-2">
                    <Download className="w-4 h-4" /> Excel
                  </button>
                </div>
                <div className="flex gap-3">
                  <button onClick={() => handleSave('brouillon')} disabled={saving} className="px-5 py-2.5 border border-amber-300 text-amber-700 bg-amber-50 rounded-xl font-medium hover:bg-amber-100 transition-colors disabled:opacity-50 flex items-center gap-2">
                    Brouillon
                  </button>
                  <button onClick={() => handleSave('validee')} disabled={saving || !chauffeurId} className="px-5 py-2.5 bg-amber-600 hover:bg-amber-700 text-white rounded-xl font-medium transition-colors disabled:opacity-50 flex items-center gap-2">
                    {saving ? <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" /> : <Check className="w-4 h-4" />}
                    Enregistrer
                  </button>
                </div>
              </div>
            </>
          )}

          {!chauffeurId && !loading && (
            <div className="text-center py-8">
              <Receipt className="w-12 h-12 text-gray-300 mx-auto mb-3" />
              <p className="text-sm text-gray-400">Selectionnez un chauffeur pour charger ses courses</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

const JOURS_FR = ['Dim', 'Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam'];
const DAYTYPE_LABEL: Record<string, string> = {
  lun_ven: 'Lun-Ven', samedi: 'Samedi', dimanche: 'Dimanche', feries: 'Ferie', astreinte: 'Astreinte',
};
const CAT_COLORS: Record<string, string> = {
  'Semaine jour': 'bg-blue-100 text-blue-700',
  'Semaine nuit': 'bg-slate-700 text-white',
  'Samedi': 'bg-amber-100 text-amber-700',
  'Dimanche': 'bg-orange-100 text-orange-700',
  'Astreinte': 'bg-red-100 text-red-700',
  'Non planifie': 'bg-teal-100 text-teal-700',
};

function CoursesListing({ courses }: { courses: CourseDetail[] }) {
  // Group by date
  const grouped = useMemo(() => {
    const map = new Map<string, CourseDetail[]>();
    courses.forEach(c => {
      const dateKey = c.date_heure.slice(0, 10);
      if (!map.has(dateKey)) map.set(dateKey, []);
      map.get(dateKey)!.push(c);
    });
    return Array.from(map.entries()).sort((a, b) => a[0].localeCompare(b[0]));
  }, [courses]);

  return (
    <div className="border-t border-gray-200 max-h-[400px] overflow-y-auto">
      {grouped.map(([dateStr, dayCourses]) => {
        const dt = new Date(dateStr + 'T00:00:00');
        const jourNom = JOURS_FR[dt.getDay()];
        const jourNum = dt.getDate();
        const catCounts = dayCourses.reduce((acc, c) => {
          acc[c.categorie] = (acc[c.categorie] || 0) + 1;
          return acc;
        }, {} as Record<string, number>);

        return (
          <div key={dateStr} className="border-b border-gray-50 last:border-b-0">
            <div className="px-4 py-2 bg-gray-50 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="text-xs font-bold text-gray-700">{jourNom} {jourNum}</span>
                <span className="text-[10px] text-gray-400">{dateStr}</span>
              </div>
              <div className="flex items-center gap-1.5">
                {Object.entries(catCounts).map(([cat, count]) => (
                  <span key={cat} className={`text-[10px] font-medium px-1.5 py-0.5 rounded ${CAT_COLORS[cat] || 'bg-gray-100 text-gray-600'}`}>
                    {count} {cat}
                  </span>
                ))}
              </div>
            </div>
            <div className="divide-y divide-gray-50">
              {dayCourses.map(c => {
                const heure = new Date(c.date_heure).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit', timeZone: 'Indian/Mayotte' });
                return (
                  <div key={c.id} className="px-4 py-1.5 flex items-center gap-3 text-xs hover:bg-gray-50/50">
                    <span className="text-gray-400 font-mono w-12">{heure}</span>
                    <span className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${CAT_COLORS[c.categorie] || 'bg-gray-100 text-gray-600'}`}>{c.categorie}</span>
                    <span className="text-gray-700 truncate flex-1">
                      {c.lignes?.nom || `${c.depart || '?'} → ${c.arrivee || '?'}`}
                    </span>
                    {c.duree_minutes && <span className="text-gray-400">{c.duree_minutes} min</span>}
                  </div>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
}
