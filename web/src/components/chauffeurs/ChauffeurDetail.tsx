import { useEffect, useState } from 'react';
import { supabase } from '../../lib/supabase';
import { Edit2, Power, Trash2, Receipt, X, FileText, TrendingUp, Gauge, Clock, Calendar, ChevronLeft, ChevronRight } from 'lucide-react';
import type { User } from '@supabase/supabase-js';
import type { Chauffeur } from '../../pages/ChauffeursPage';
import { mParts, mDateStr, mAddDaysStr, mMondayStr, mMidnightISO } from '../../lib/mayotte';

type PeriodFilter = 'jour' | 'semaine' | 'mois' | 'annee' | 'total';

interface Course {
  id: string;
  date_heure: string;
  depart: string;
  arrivee: string;
  statut_realisation: string;
  statut_planification?: string;
  montant: number;
  periode: string;
  ligne_id: string | null;
}

interface TarifPlage {
  type_jour: string;
  heure_debut: string;
  heure_fin: string;
  tarif: number;
  ligne_id: string | null;
}

interface Document {
  id: string;
  nom: string;
  type: string;
  url: string;
  created_at: string;
}

interface Avance {
  id: string;
  montant: number;
  date_avance: string;
  motif: string;
  statut: string;
}

interface Facture {
  id: string;
  numero: string;
  date_emission: string;
  montant_ttc: number;
  statut: string;
}

interface KilometrageEntry {
  id: string;
  km_value: number;
  type: string;
  mois: string;
  created_at: string;
}

interface AstreinteSession {
  id: string;
  date: string;
  heure_debut: string;
  heure_fin: string;
  created_at: string;
}

interface CourseExecution {
  id: string;
  course_id: string;
  statut: string;
  heure_debut: string;
  heure_fin: string | null;
  created_at: string;
}

interface ChauffeurDetailProps {
  chauffeur: Chauffeur;
  ligneName?: string;
  user: User;
  onEdit: () => void;
  onDelete: () => void;
  onToggleStatus: () => void;
  onNavigateToPlanning?: (chauffeurId: string) => void;
}

export function ChauffeurDetail({ chauffeur, ligneName, user, onEdit, onDelete, onToggleStatus, onNavigateToPlanning }: ChauffeurDetailProps) {
  const [period, setPeriod] = useState<PeriodFilter>('semaine');
  const [referenceDate, setReferenceDate] = useState(new Date());
  const [courses, setCourses] = useState<Course[]>([]);
  const [documents, setDocuments] = useState<Document[]>([]);
  const [avances, setAvances] = useState<Avance[]>([]);
  const [factures, setFactures] = useState<Facture[]>([]);
  const [tarifPlages, setTarifPlages] = useState<TarifPlage[]>([]);
  const [feriesDates, setFeriesDates] = useState<Set<string>>(new Set());
  const [kilometrage, setKilometrage] = useState<KilometrageEntry[]>([]);
  const [astreinteSessions, setAstreinteSessions] = useState<AstreinteSession[]>([]);
  const [courseExecutions, setCourseExecutions] = useState<CourseExecution[]>([]);
  const [showAvanceForm, setShowAvanceForm] = useState(false);
  const [avanceForm, setAvanceForm] = useState({ montant: 0, motif: '', date_avance: new Date().toISOString().split('T')[0] });
  const [showDocUpload, setShowDocUpload] = useState(false);
  const [docForm, setDocForm] = useState({ nom: '', url: '' });

  useEffect(() => {
    Promise.all([
      loadCourses(),
      loadDocuments(),
      loadAvances(),
      loadFactures(),
      loadTarifs(),
      loadKilometrage(),
      loadAstreinteSessions(),
      loadCourseExecutions(),
    ]).catch(err => console.error('ChauffeurDetail load error:', err));
  }, [chauffeur.id, period, referenceDate]);

  function getDateRange(): { from: string; to: string } {
    // Fenetres de periode en heure de MAYOTTE (bornes minuit Mayotte, "to" exclusif
    // = debut de la periode suivante), independantes du fuseau du navigateur.
    const p = mParts(referenceDate);
    const pad = (n: number) => String(n).padStart(2, '0');
    let fromStr: string, toStr: string;
    switch (period) {
      case 'jour':
        fromStr = mDateStr(referenceDate);
        toStr = mAddDaysStr(fromStr, 1);
        break;
      case 'semaine':
        fromStr = mMondayStr(referenceDate);
        toStr = mAddDaysStr(fromStr, 7);
        break;
      case 'mois': {
        fromStr = `${p.y}-${pad(p.mo + 1)}-01`;
        const ny = p.mo === 11 ? p.y + 1 : p.y, nmo = p.mo === 11 ? 0 : p.mo + 1;
        toStr = `${ny}-${pad(nmo + 1)}-01`;
        break;
      }
      case 'annee':
        fromStr = `${p.y}-01-01`;
        toStr = `${p.y + 1}-01-01`;
        break;
      default:
        return { from: '2000-01-01T00:00:00.000Z', to: mMidnightISO(`${p.y + 5}-12-31`) };
    }
    return { from: mMidnightISO(fromStr), to: mMidnightISO(toStr) };
  }

  function navigatePeriod(direction: number) {
    const d = new Date(referenceDate);
    switch (period) {
      case 'jour': d.setDate(d.getDate() + direction); break;
      case 'semaine': d.setDate(d.getDate() + (7 * direction)); break;
      case 'mois': d.setMonth(d.getMonth() + direction); break;
      case 'annee': d.setFullYear(d.getFullYear() + direction); break;
    }
    setReferenceDate(d);
  }

  function getPeriodLabel(): string {
    const d = referenceDate;
    switch (period) {
      case 'jour':
        return d.toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'Indian/Mayotte' });
      case 'semaine': {
        const day = d.getDay() || 7;
        const mon = new Date(d); mon.setDate(d.getDate() - day + 1);
        const sun = new Date(mon); sun.setDate(mon.getDate() + 6);
        return `${mon.toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', timeZone: 'Indian/Mayotte' })} - ${sun.toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: 'numeric', timeZone: 'Indian/Mayotte' })}`;
      }
      case 'mois':
        return d.toLocaleDateString('fr-FR', { month: 'long', year: 'numeric', timeZone: 'Indian/Mayotte' });
      case 'annee':
        return String(d.getFullYear());
      default:
        return 'Total';
    }
  }

  async function loadCourses() {
    const { from, to } = getDateRange();
    const { data } = await supabase
      .from('courses')
      .select('id, date_heure, depart, arrivee, statut_realisation, statut_planification, montant, periode, ligne_id')
      .eq('chauffeur_id', chauffeur.id)
      .gte('date_heure', from)
      .lt('date_heure', to)
      .order('date_heure', { ascending: true });
    if (data) setCourses(data);
  }

  async function loadTarifs() {
    const [{ data }, { data: feries }] = await Promise.all([
      supabase.from('tarif_plages').select('type_jour, heure_debut, heure_fin, tarif, ligne_id'),
      supabase.from('jours_feries').select('date'),
    ]);
    if (data) setTarifPlages(data);
    if (feries) setFeriesDates(new Set(feries.map((f: { date: string }) => f.date)));
  }

  async function loadDocuments() {
    const { data } = await supabase
      .from('chauffeur_documents')
      .select('*')
      .eq('chauffeur_id', chauffeur.id)
      .order('created_at', { ascending: false });
    if (data) setDocuments(data);
  }

  async function loadAvances() {
    const { data } = await supabase
      .from('chauffeur_avances')
      .select('*')
      .eq('chauffeur_id', chauffeur.id)
      .order('date_avance', { ascending: false });
    if (data) setAvances(data);
  }

  async function loadFactures() {
    const { data } = await supabase
      .from('factures')
      .select('id, numero, date_emission, montant_ttc, statut')
      .eq('chauffeur_id', chauffeur.id)
      .in('statut', ['validee', 'payee'])
      .order('date_emission', { ascending: false })
      .limit(10);
    if (data) setFactures(data);
  }

  async function loadKilometrage() {
    const { data } = await supabase
      .from('kilometrage')
      .select('id, km_value, type, mois, created_at')
      .eq('chauffeur_id', chauffeur.id)
      .order('created_at', { ascending: false })
      .limit(12);
    if (data) setKilometrage(data);
  }

  async function loadAstreinteSessions() {
    const { from, to } = getDateRange();
    // La colonne `date` est un jour calendaire de Mayotte : on compare en jours
    // de Mayotte (from inclus, to est le debut de periode suivante -> -1ms = dernier jour inclus).
    const fromDay = mDateStr(new Date(from));
    const toDay = mDateStr(new Date(new Date(to).getTime() - 1));
    const { data } = await supabase
      .from('astreinte_sessions')
      .select('id, date, heure_debut, heure_fin, created_at')
      .eq('chauffeur_id', chauffeur.id)
      .gte('date', fromDay)
      .lte('date', toDay)
      .order('date', { ascending: false });
    if (data) setAstreinteSessions(data);
  }

  async function loadCourseExecutions() {
    const { from, to } = getDateRange();
    const { data } = await supabase
      .from('course_executions')
      .select('id, course_id, statut, heure_debut, heure_fin, created_at, course:courses!course_executions_course_id_fkey(date_heure, depart, arrivee)')
      .eq('chauffeur_id', chauffeur.id)
      .gte('heure_debut', from)
      .lt('heure_debut', to)
      .order('heure_debut', { ascending: false })
      .limit(50);
    if (data) setCourseExecutions(data);
  }

  async function handleAddAvance(e: React.FormEvent) {
    e.preventDefault();
    await supabase.from('chauffeur_avances').insert({
      chauffeur_id: chauffeur.id,
      ...avanceForm,
      user_id: user.id,
    });
    setShowAvanceForm(false);
    setAvanceForm({ montant: 0, motif: '', date_avance: new Date().toISOString().split('T')[0] });
    loadAvances();
  }

  async function handleDeleteAvance(id: string) {
    await supabase.from('chauffeur_avances').delete().eq('id', id);
    loadAvances();
  }

  async function handleAddDocument(e: React.FormEvent) {
    e.preventDefault();
    await supabase.from('chauffeur_documents').insert({
      chauffeur_id: chauffeur.id,
      nom: docForm.nom,
      url: docForm.url,
      user_id: user.id,
    });
    setShowDocUpload(false);
    setDocForm({ nom: '', url: '' });
    loadDocuments();
  }

  async function handleDeleteDocument(id: string) {
    await supabase.from('chauffeur_documents').delete().eq('id', id);
    loadDocuments();
  }

  const coursesTerminees = courses.filter(c => c.statut_realisation === 'termine');
  const nbTermines = coursesTerminees.length;
  const nbTotal = courses.length;
  const nbIncidents = courses.filter(c => c.statut_realisation === 'annule').length;

  function getTarifForCourse(course: Course): number {
    if (course.montant > 0) return course.montant; // prix autoritatif (trigger tarif_course)
    if (!course.date_heure) return 0;
    // Jour/heure en heure de MAYOTTE (pas le fuseau du navigateur) + jours feries + astreinte.
    const p = mParts(course.date_heure);
    let typeJour = 'lun_ven';
    if ((course as { is_astreinte?: boolean }).is_astreinte) typeJour = 'astreinte';
    else if (feriesDates.has(mDateStr(course.date_heure))) typeJour = 'feries';
    else if (p.dow === 6) typeJour = 'samedi';
    else if (p.dow === 0) typeJour = 'dimanche';
    const toMinutes = (hhmm: string) => {
      const [h, mi] = (hhmm || '00:00').split(':').map(Number);
      return (h || 0) * 60 + (mi || 0);
    };
    const minutes = p.h * 60 + p.mi;
    const matchesTime = (pl: TarifPlage) => {
      if (pl.type_jour !== typeJour) return false;
      const start = toMinutes(pl.heure_debut);
      const end = toMinutes(pl.heure_fin);
      return start <= end ? minutes >= start && minutes < end : minutes >= start || minutes < end;
    };
    // Une seule plage, la bonne : specifique a la ligne d'abord, sinon generique.
    const ligneMatch = tarifPlages.find(pl => matchesTime(pl) && pl.ligne_id === course.ligne_id);
    const genericMatch = tarifPlages.find(pl => matchesTime(pl) && !pl.ligne_id);
    return parseFloat(String((ligneMatch || genericMatch)?.tarif ?? 0)) || 0;
  }

  const caProjection = coursesTerminees.reduce((sum, c) => sum + getTarifForCourse(c), 0);
  // Kilometrage stats
  const kmTotal = kilometrage.reduce((s, k) => s + k.km_value, 0);
  // Km parcourus = fin - debut du MEME mois (le plus recent releve), et non les
  // deux releves les plus recents qui pouvaient appartenir a des mois differents.
  const kmMoisRecent = kilometrage.find(k => k.type === 'fin_mois')?.mois ?? kilometrage[0]?.mois;
  const kmDebutM = kilometrage.find(k => k.type === 'debut_mois' && k.mois === kmMoisRecent);
  const kmFinM = kilometrage.find(k => k.type === 'fin_mois' && k.mois === kmMoisRecent);
  const kmParcourus = kmDebutM && kmFinM ? Math.max(0, kmFinM.km_value - kmDebutM.km_value) : 0;

  // Astreinte hours
  const totalAstreinteMinutes = astreinteSessions.reduce((sum, s) => {
    if (!s.heure_debut || !s.heure_fin) return sum;
    const start = new Date(s.heure_debut).getTime();
    const end = new Date(s.heure_fin).getTime();
    return sum + Math.max(0, (end - start) / 60000);
  }, 0);
  const astreinteHours = (totalAstreinteMinutes / 60).toFixed(1);

  // Execution stats
  const completedExecutions = courseExecutions.filter(e => e.statut === 'termine' || e.statut === 'completed');
  const avgExecutionMinutes = completedExecutions.length > 0
    ? completedExecutions.reduce((sum, e) => {
        if (!e.heure_debut || !e.heure_fin) return sum;
        const dur = (new Date(e.heure_fin).getTime() - new Date(e.heure_debut).getTime()) / 60000;
        return sum + Math.max(0, dur);
      }, 0) / completedExecutions.length
    : 0;

  const periods: { id: PeriodFilter; label: string }[] = [
    { id: 'jour', label: "Aujourd'hui" },
    { id: 'semaine', label: 'Semaine' },
    { id: 'mois', label: 'Mois' },
    { id: 'annee', label: 'Annee' },
    { id: 'total', label: 'Total' },
  ];

  const statutColors: Record<string, string> = {
    programme: 'text-gray-500',
    en_cours: 'text-amber-600',
    en_retard: 'text-orange-600',
    termine: 'text-emerald-600',
    annule: 'text-red-500',
    remplace: 'text-gray-400',
  };

  const jourNoms = ['Dim', 'Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam'];

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 bg-amber-100 rounded-full flex items-center justify-center">
            <span className="text-base font-bold text-amber-700">{chauffeur.code || ((chauffeur.prenom?.[0] || '') + (chauffeur.nom?.[0] || ''))}</span>
          </div>
          <div>
            <p className="text-xs text-gray-500 uppercase tracking-wide">
              Chauffeur · {ligneName || 'Aucune ligne'}
            </p>
            <h2 className="text-xl font-bold text-gray-900">{chauffeur.nom} {chauffeur.prenom}</h2>
            <p className="text-sm text-gray-500">
              {chauffeur.telephone}{chauffeur.telephone2 ? ` / ${chauffeur.telephone2}` : ''}
              {chauffeur.facturation_type ? ` · Fact. ${chauffeur.facturation_type}` : ''}
            </p>
            {chauffeur.email && <p className="text-xs text-gray-400">{chauffeur.email}</p>}
          </div>
        </div>
        <div className="flex items-center gap-2">
          {onNavigateToPlanning && (
            <button
              onClick={() => onNavigateToPlanning(chauffeur.id)}
              className="px-3 py-1.5 rounded-lg text-xs font-medium border border-amber-200 text-amber-700 hover:bg-amber-50 transition-colors"
            >
              <Calendar className="w-3.5 h-3.5 inline mr-1" />Planning
            </button>
          )}
          <button
            onClick={onToggleStatus}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors ${
              chauffeur.statut === 'actif'
                ? 'border-red-200 text-red-600 hover:bg-red-50'
                : 'border-emerald-200 text-emerald-600 hover:bg-emerald-50'
            }`}
          >
            <Power className="w-3.5 h-3.5 inline mr-1" />
            {chauffeur.statut === 'actif' ? 'Desactiver' : 'Activer'}
          </button>
          <button onClick={onEdit} className="px-3 py-1.5 rounded-lg text-xs font-medium border border-gray-200 text-gray-700 hover:bg-gray-50 transition-colors">
            <Edit2 className="w-3.5 h-3.5 inline mr-1" />Modifier
          </button>
          <button onClick={onDelete} className="px-3 py-1.5 rounded-lg text-xs font-medium border border-gray-200 text-gray-700 hover:bg-gray-50 hover:text-red-600 hover:border-red-200 transition-colors">
            <Trash2 className="w-3.5 h-3.5 inline mr-1" />Supprimer
          </button>
        </div>
      </div>

      {/* Period Filter */}
      <div className="flex items-center gap-2 flex-wrap">
        {periods.map((p) => (
          <button
            key={p.id}
            onClick={() => { setPeriod(p.id); setReferenceDate(new Date()); }}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
              period === p.id ? 'bg-gray-900 text-white' : 'bg-white border border-gray-200 text-gray-600 hover:bg-gray-50'
            }`}
          >
            {p.label}
          </button>
        ))}
        {period !== 'total' && (
          <div className="flex items-center gap-1 ml-2">
            <button onClick={() => navigatePeriod(-1)} className="p-1.5 rounded-lg hover:bg-gray-100 transition-colors text-gray-500">
              <ChevronLeft className="w-4 h-4" />
            </button>
            <span className="text-xs font-medium text-gray-700 min-w-[120px] text-center">{getPeriodLabel()}</span>
            <button onClick={() => navigatePeriod(1)} className="p-1.5 rounded-lg hover:bg-gray-100 transition-colors text-gray-500">
              <ChevronRight className="w-4 h-4" />
            </button>
            <button onClick={() => setReferenceDate(new Date())} className="text-[10px] text-amber-600 font-medium hover:underline ml-1">Ajd</button>
          </div>
        )}
      </div>

      {/* Info card */}
      <div className="bg-white rounded-xl border border-gray-100 p-4 grid grid-cols-2 md:grid-cols-4 gap-3 text-xs">
        {chauffeur.vehicule_immatriculation && (
          <div>
            <p className="text-gray-400 uppercase font-semibold">Vehicule</p>
            <p className="text-gray-900 font-medium mt-0.5">{chauffeur.vehicule_immatriculation}</p>
            {chauffeur.vehicule_marque && <p className="text-gray-500">{chauffeur.vehicule_marque}</p>}
            {chauffeur.vehicule_places > 0 && <p className="text-gray-500">{chauffeur.vehicule_places} places</p>}
            {chauffeur.vehicule_carburant && <p className="text-gray-500">{chauffeur.vehicule_carburant}</p>}
          </div>
        )}
        {(chauffeur.vehicule_date_1ere_immat || chauffeur.vehicule_date_controle_technique || chauffeur.vehicule_assureur || chauffeur.vehicule_type_lien) && (
          <div>
            <p className="text-gray-400 uppercase font-semibold">Vehicule (suite)</p>
            {chauffeur.vehicule_date_1ere_immat && <p className="text-gray-500 mt-0.5">1ere immat: {chauffeur.vehicule_date_1ere_immat}</p>}
            {chauffeur.vehicule_date_controle_technique && <p className="text-gray-500">CT: {chauffeur.vehicule_date_controle_technique}</p>}
            {chauffeur.vehicule_assureur && <p className="text-gray-500">Assureur: {chauffeur.vehicule_assureur}</p>}
            {chauffeur.vehicule_type_lien && (
              <p className="text-gray-500">Lien: {({ proprietaire: 'Proprietaire', locataire: 'Locataire', credit_bail: 'Credit-Bail', loue_tv: 'Loue a TV' } as Record<string, string>)[chauffeur.vehicule_type_lien] || chauffeur.vehicule_type_lien}</p>
            )}
          </div>
        )}
        {chauffeur.licence_transport && (
          <div>
            <p className="text-gray-400 uppercase font-semibold">Licence</p>
            <p className="text-gray-900 font-medium mt-0.5">{chauffeur.licence_transport}</p>
          </div>
        )}
        {chauffeur.carte_conducteur_numero && (
          <div>
            <p className="text-gray-400 uppercase font-semibold">Carte conducteur</p>
            <p className="text-gray-900 font-medium mt-0.5">N {chauffeur.carte_conducteur_numero}</p>
            {chauffeur.carte_conducteur_validite && <p className="text-gray-500">Exp. {chauffeur.carte_conducteur_validite}</p>}
          </div>
        )}
        {chauffeur.nif_siret && (
          <div>
            <p className="text-gray-400 uppercase font-semibold">SIRET</p>
            <p className="text-gray-900 font-medium mt-0.5">{chauffeur.nif_siret}</p>
          </div>
        )}
        {(chauffeur.carte_identite_numero || chauffeur.carte_sejour_numero) && (
          <div>
            <p className="text-gray-400 uppercase font-semibold">Identite</p>
            {chauffeur.carte_identite_numero && <p className="text-gray-900 font-medium mt-0.5">CI: {chauffeur.carte_identite_numero}</p>}
            {chauffeur.carte_sejour_numero && <p className="text-gray-500">Sejour: {chauffeur.carte_sejour_numero}</p>}
          </div>
        )}
        {chauffeur.n_adherent && (
          <div>
            <p className="text-gray-400 uppercase font-semibold">N adherent</p>
            <p className="text-gray-900 font-medium mt-0.5">{chauffeur.n_adherent}</p>
          </div>
        )}
        {chauffeur.secteur_activite && (
          <div>
            <p className="text-gray-400 uppercase font-semibold">Secteur</p>
            <p className="text-gray-900 font-medium mt-0.5">{chauffeur.secteur_activite}</p>
          </div>
        )}
        {chauffeur.commentaires && (
          <div className="col-span-2">
            <p className="text-gray-400 uppercase font-semibold">Commentaires</p>
            <p className="text-gray-900 font-medium mt-0.5">{chauffeur.commentaires}</p>
          </div>
        )}
      </div>

      {/* KPI Cards - Extended with Android data */}
      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-3">
        <div className="card p-4">
          <p className="section-label">Trajets termines</p>
          <p className="text-2xl font-bold text-gray-900 mt-1">{nbTermines}</p>
          <p className="text-xs text-gray-400">sur {nbTotal} total</p>
        </div>
        <div className="card p-4 relative">
          <div className="flex items-center gap-1">
            <p className="section-label">CA projection</p>
            <TrendingUp className="w-3 h-3 text-emerald-500" />
          </div>
          <p className="text-2xl font-bold text-emerald-700 mt-1">{caProjection.toFixed(0)} EUR</p>
          <p className="text-xs text-gray-400">base tarifs</p>
        </div>
        <div className="card p-4">
          <div className="flex items-center gap-1">
            <p className="section-label">Duree moy.</p>
            <Clock className="w-3 h-3 text-sky-500" />
          </div>
          <p className="text-2xl font-bold text-gray-900 mt-1">{avgExecutionMinutes.toFixed(0)}<span className="text-sm font-medium text-gray-500"> mn</span></p>
          <p className="text-xs text-gray-400">{completedExecutions.length} executions</p>
        </div>
        <div className="card p-4">
          <div className="flex items-center gap-1">
            <p className="section-label">Kilometrage</p>
            <Gauge className="w-3 h-3 text-amber-500" />
          </div>
          <p className="text-2xl font-bold text-gray-900 mt-1">{kmParcourus > 0 ? kmParcourus : kmTotal}<span className="text-sm font-medium text-gray-500"> km</span></p>
          <p className="text-xs text-gray-400">{kilometrage.length} releves</p>
        </div>
        <div className="card p-4">
          <div className="flex items-center gap-1">
            <p className="section-label">Astreinte</p>
            <Clock className="w-3 h-3 text-orange-500" />
          </div>
          <p className="text-2xl font-bold text-gray-900 mt-1">{astreinteHours}<span className="text-sm font-medium text-gray-500"> h</span></p>
          <p className="text-xs text-gray-400">{astreinteSessions.length} sessions</p>
        </div>
        <div className="card p-4">
          <p className="section-label text-red-600">Incidents</p>
          <p className={`text-2xl font-bold mt-1 ${nbIncidents > 0 ? 'text-red-600' : 'text-gray-900'}`}>{nbIncidents}</p>
          <p className="text-xs text-gray-400">annulations</p>
        </div>
      </div>

      {/* Astreinte Sessions */}
      {astreinteSessions.length > 0 && (
        <div className="card p-5">
          <h3 className="section-label mb-4">Sessions d'astreinte</h3>
          <div className="space-y-2">
            {astreinteSessions.map(s => {
              const debut = s.heure_debut ? new Date(s.heure_debut) : null;
              const fin = s.heure_fin ? new Date(s.heure_fin) : null;
              const dureeMin = debut && fin ? Math.round((fin.getTime() - debut.getTime()) / 60000) : null;
              return (
                <div key={s.id} className="flex items-center gap-4 px-3 py-2 bg-gray-50 rounded-lg text-sm">
                  <span className="font-medium text-gray-900 w-24">{new Date(s.date).toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', timeZone: 'Indian/Mayotte' })}</span>
                  <span className="text-amber-600 font-medium">
                    {debut?.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit', timeZone: 'Indian/Mayotte' }) || '-'}
                    {' → '}
                    {fin?.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit', timeZone: 'Indian/Mayotte' }) || 'en cours'}
                  </span>
                  {dureeMin !== null && (
                    <span className="text-xs text-gray-500 bg-white px-2 py-0.5 rounded border border-gray-200">{Math.floor(dureeMin / 60)}h{(dureeMin % 60).toString().padStart(2, '0')}</span>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Kilometrage */}
      {kilometrage.length > 0 && (
        <div className="card p-5">
          <h3 className="section-label mb-4">Releves kilometriques</h3>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {kilometrage.map(k => (
              <div key={k.id} className="flex items-center gap-3 px-3 py-2.5 bg-gray-50 rounded-lg">
                <Gauge className="w-4 h-4 text-gray-400 flex-shrink-0" />
                <div>
                  <p className="text-sm font-semibold text-gray-900">{k.km_value.toLocaleString()} km</p>
                  <p className="text-xs text-gray-500">{k.type} · {k.mois || new Date(k.created_at).toLocaleDateString('fr-FR', { month: 'short', year: '2-digit', timeZone: 'Indian/Mayotte' })}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Course Executions */}
      {courseExecutions.length > 0 && (
        <div className="card p-5">
          <div className="flex items-center justify-between mb-4">
            <h3 className="section-label">Historique des executions</h3>
            <span className="text-xs text-gray-500">{courseExecutions.length} executions</span>
          </div>
          <div className="space-y-1.5 max-h-64 overflow-y-auto scrollbar-thin">
            {courseExecutions.map(e => {
              const debut = new Date(e.heure_debut);
              const fin = e.heure_fin ? new Date(e.heure_fin) : null;
              const dureeMin = fin ? Math.round((fin.getTime() - debut.getTime()) / 60000) : null;
              const isComplete = e.statut === 'termine' || e.statut === 'completed';
              const courseData = (e as any).course;
              const theorique = courseData?.date_heure ? new Date(courseData.date_heure) : null;
              const retardMin = theorique ? Math.round((debut.getTime() - theorique.getTime()) / 60000) : 0;
              const isLate = retardMin > 10;
              const isReplacement = courseData?.depart && !theorique;
              return (
                <div key={e.id} className="flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-gray-50 text-sm">
                  <span className={`w-2 h-2 rounded-full flex-shrink-0 ${isComplete ? 'bg-emerald-500' : e.statut === 'en_cours' ? 'bg-amber-500' : 'bg-gray-300'}`} />
                  <span className="text-gray-900 font-medium w-20">
                    {debut.toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', timeZone: 'Indian/Mayotte' })}
                  </span>
                  {theorique && (
                    <span className="text-xs text-gray-400 w-14">
                      {theorique.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit', timeZone: 'Indian/Mayotte' })}
                    </span>
                  )}
                  <span className="text-amber-600 font-medium w-28">
                    {debut.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit', timeZone: 'Indian/Mayotte' })}
                    {fin && ` → ${fin.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit', timeZone: 'Indian/Mayotte' })}`}
                  </span>
                  {isLate && (
                    <span className="text-[10px] font-bold text-red-600 bg-red-50 px-1.5 py-0.5 rounded">+{retardMin}mn</span>
                  )}
                  {dureeMin !== null && (
                    <span className="text-xs text-gray-500 bg-gray-100 px-2 py-0.5 rounded">{dureeMin} mn</span>
                  )}
                  <span className={`text-xs font-medium ml-auto ${isComplete ? 'text-emerald-600' : 'text-gray-500'}`}>
                    {e.statut}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Planning */}
      <div className="card p-5">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <h3 className="section-label">Programme de ligne</h3>
            <span className="px-2 py-0.5 bg-gray-100 text-gray-600 text-[10px] font-bold rounded uppercase">
              {period === 'jour' ? "Aujourd'hui" : period === 'semaine' ? 'Semaine en cours' : period}
            </span>
          </div>
          {ligneName && (
            <span className="px-2.5 py-1 border border-gray-200 text-gray-600 text-xs rounded font-medium">
              {ligneName}
            </span>
          )}
        </div>

        {courses.length === 0 ? (
          <p className="text-sm text-gray-400 text-center py-4">Aucune course sur cette periode</p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="text-[11px] text-gray-500 uppercase tracking-wide border-b border-gray-100">
                <th className="text-left py-2 font-semibold">Jour</th>
                <th className="text-left py-2 font-semibold">Heure theorique</th>
                <th className="text-left py-2 font-semibold">Ligne / Trajet</th>
                <th className="text-left py-2 font-semibold">Type</th>
                <th className="text-right py-2 font-semibold">Statut</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {courses.map((c) => {
                const d = new Date(c.date_heure);
                const isRemplacement = (c as any).statut_planification === 'non_planifie';
                return (
                  <tr key={c.id}>
                    <td className="py-2 font-medium text-gray-900">{jourNoms[d.getDay()]}</td>
                    <td className="py-2 text-amber-600 font-medium">{d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit', timeZone: 'Indian/Mayotte' })}</td>
                    <td className="py-2 text-gray-600">{c.depart} → {c.arrivee}</td>
                    <td className="py-2">{isRemplacement ? <span className="text-[10px] bg-blue-50 text-blue-700 px-1.5 py-0.5 rounded font-medium">Remplacement</span> : <span className="text-[10px] bg-gray-100 text-gray-600 px-1.5 py-0.5 rounded font-medium">Programme</span>}</td>
                    <td className={`py-2 text-right font-medium ${statutColors[c.statut_realisation] || 'text-gray-500'}`}>{c.statut_realisation}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      {/* Two columns: Documents & Avances */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Documents */}
        <div className="card p-5">
          <div className="flex items-center justify-between mb-4">
            <h3 className="section-label">Documents & RIB</h3>
            <button onClick={() => setShowDocUpload(true)} className="px-3 py-1.5 text-xs font-medium border border-gray-200 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors">
              + Ajouter
            </button>
          </div>

          {documents.length === 0 ? (
            <p className="text-sm text-gray-400 text-center py-6">Aucun document</p>
          ) : (
            <div className="space-y-2">
              {documents.map((doc) => (
                <div key={doc.id} className="flex items-center gap-3 p-2 rounded-lg hover:bg-gray-50">
                  <FileText className="w-4 h-4 text-gray-400" />
                  <div className="flex-1">
                    <p className="text-sm font-medium text-gray-900">{doc.nom}</p>
                    <p className="text-xs text-gray-400">{new Date(doc.created_at).toLocaleDateString('fr-FR', { timeZone: 'Indian/Mayotte' })}</p>
                  </div>
                  <button onClick={() => handleDeleteDocument(doc.id)} className="text-gray-400 hover:text-red-500 p-1">
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Avances */}
        <div className="card p-5">
          <div className="flex items-center justify-between mb-4">
            <h3 className="section-label">Acomptes & Avances</h3>
            <button onClick={() => setShowAvanceForm(true)} className="px-3 py-1.5 text-xs font-medium border border-gray-200 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors">
              + Nouvel acompte
            </button>
          </div>

          {avances.length === 0 ? (
            <p className="text-sm text-gray-400 text-center py-6">Aucun acompte enregistre</p>
          ) : (
            <div className="space-y-2">
              {avances.map((a) => (
                <div key={a.id} className="flex items-center gap-3 p-2 rounded-lg hover:bg-gray-50">
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-semibold text-gray-900">{a.montant} EUR</p>
                      <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium ${a.statut === 'rembourse' ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'}`}>
                        {a.statut}
                      </span>
                    </div>
                    <p className="text-xs text-gray-500">{a.motif} · {new Date(a.date_avance).toLocaleDateString('fr-FR', { timeZone: 'Indian/Mayotte' })}</p>
                  </div>
                  <button onClick={() => handleDeleteAvance(a.id)} className="text-gray-400 hover:text-red-500 p-1">
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Factures payees */}
      <div className="card p-5">
        <div className="flex items-center gap-2 mb-4">
          <h3 className="section-label">Historique des factures</h3>
          <Receipt className="w-4 h-4 text-gray-400" />
        </div>

        {factures.length === 0 ? (
          <p className="text-sm text-gray-400 text-center py-4">Aucune facture</p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="text-[11px] text-gray-500 uppercase tracking-wide border-b border-gray-100">
                <th className="text-left py-2 font-semibold">Numero</th>
                <th className="text-left py-2 font-semibold">Date</th>
                <th className="text-left py-2 font-semibold">Statut</th>
                <th className="text-right py-2 font-semibold">Montant TTC</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {factures.map((f) => (
                <tr key={f.id}>
                  <td className="py-2 font-medium text-gray-900">{f.numero}</td>
                  <td className="py-2 text-gray-600">{f.date_emission}</td>
                  <td className="py-2">
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${f.statut === 'payee' ? 'bg-emerald-100 text-emerald-700' : f.statut === 'validee' ? 'bg-sky-100 text-sky-700' : 'bg-gray-100 text-gray-600'}`}>
                      {f.statut}
                    </span>
                  </td>
                  <td className="py-2 text-right font-semibold text-gray-900">{f.montant_ttc} EUR</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Avance Modal */}
      {showAvanceForm && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl w-full max-w-sm shadow-2xl animate-scale-in">
            <div className="p-5 border-b border-gray-100 flex items-center justify-between">
              <h3 className="font-semibold text-gray-900">Nouvel acompte</h3>
              <button onClick={() => setShowAvanceForm(false)} className="text-gray-400 hover:text-gray-600"><X className="w-5 h-5" /></button>
            </div>
            <form onSubmit={handleAddAvance} className="p-5 space-y-4">
              <div>
                <label className="block text-xs font-semibold text-gray-500 uppercase mb-1">Montant (EUR)</label>
                <input type="number" step="0.01" value={avanceForm.montant} onChange={(e) => setAvanceForm({ ...avanceForm, montant: parseFloat(e.target.value) || 0 })} className="input-field" required />
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-500 uppercase mb-1">Date</label>
                <input type="date" value={avanceForm.date_avance} onChange={(e) => setAvanceForm({ ...avanceForm, date_avance: e.target.value })} className="input-field" />
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-500 uppercase mb-1">Motif</label>
                <input type="text" value={avanceForm.motif} onChange={(e) => setAvanceForm({ ...avanceForm, motif: e.target.value })} className="input-field" placeholder="Ex: Avance sur salaire mars" />
              </div>
              <div className="flex gap-3 pt-2">
                <button type="button" onClick={() => setShowAvanceForm(false)} className="flex-1 btn-secondary">Annuler</button>
                <button type="submit" className="flex-1 btn-accent">Ajouter</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Document Upload Modal */}
      {showDocUpload && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl w-full max-w-sm shadow-2xl animate-scale-in">
            <div className="p-5 border-b border-gray-100 flex items-center justify-between">
              <h3 className="font-semibold text-gray-900">Ajouter un document</h3>
              <button onClick={() => setShowDocUpload(false)} className="text-gray-400 hover:text-gray-600"><X className="w-5 h-5" /></button>
            </div>
            <form onSubmit={handleAddDocument} className="p-5 space-y-4">
              <div>
                <label className="block text-xs font-semibold text-gray-500 uppercase mb-1">Nom du document</label>
                <input type="text" value={docForm.nom} onChange={(e) => setDocForm({ ...docForm, nom: e.target.value })} className="input-field" placeholder="Ex: Permis de conduire" required />
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-500 uppercase mb-1">URL du fichier</label>
                <input type="url" value={docForm.url} onChange={(e) => setDocForm({ ...docForm, url: e.target.value })} className="input-field" placeholder="https://..." required />
              </div>
              <div className="flex gap-3 pt-2">
                <button type="button" onClick={() => setShowDocUpload(false)} className="flex-1 btn-secondary">Annuler</button>
                <button type="submit" className="flex-1 btn-accent">Ajouter</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
