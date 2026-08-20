import { useState, useEffect, useMemo, useCallback } from 'react';
import { supabase } from '../lib/supabase';
import { X, ChevronRight, ChevronLeft, Save, FileText, Check, Users, AlertTriangle } from 'lucide-react';
import type { User } from '@supabase/supabase-js';
import { mDateStr, fmtHM } from '../lib/mayotte';

interface Ligne {
  id: string;
  code: string;
  nom: string;
  depart: string;
  arrivee: string;
  couleur: string;
}

interface Course {
  id: string;
  date_heure: string;
  depart: string;
  arrivee: string;
  passagers_arrivee?: number;
  statut: string;
  statut_realisation?: string | null;
  notes?: string | null;
  is_brouillon?: boolean;
  montant: number;
  chauffeur_id: string | null;
  client_id: string | null;
  ligne_id: string | null;
  periode: string;
  duree_minutes: number;
  nb_passagers?: number;
  passagers_depart?: number;
}

interface TripRow {
  heure_depart: string;
  nb_trajets: number;
  nb_realises: number;
  nbre_usagers: number;
  capacite_max: number;
  taux_frequentation: number;
  temps_moyen: string;
}

interface DayData {
  date: string;
  label: string;
  jour_semaine: string;
  is_ferie: boolean;
  ferie_intitule: string;
  matin: {
    trips: TripRow[];
    nb_trajets: number;
    nb_realises: number;
    total_usagers: number;
    capacite_max: number;
    taux_frequentation: number;
    temps_moyen: string;
    ecart_type: string;
  };
  soir: {
    trips: TripRow[];
    nb_trajets: number;
    nb_realises: number;
    total_usagers: number;
    capacite_max: number;
    taux_frequentation: number;
    temps_moyen: string;
    ecart_type: string;
  };
  journee: {
    nb_trajets: number;
    nb_realises: number;
    total_usagers: number;
    capacite_max: number;
    taux_frequentation: number;
    temps_moyen: string;
    ecart_type: string;
  };
}

interface WeekSummary {
  semaine: number;
  date_debut: string;
  date_fin: string;
  matin: { usagers: number; trajets: number; capacite: number; taux: number; temps_moyen: string; ecart_type: string };
  soir: { usagers: number; trajets: number; capacite: number; taux: number; temps_moyen: string; ecart_type: string };
  total_usagers: number;
  total_trajets: number;
  total_realises: number;
  taux_global: number;
}

interface ReportWizardProps {
  user: User;
  clientId: string;
  clientNom: string;
  lignes: Ligne[];
  courses: Course[];
  onClose: () => void;
  onSaved: () => void;
}

interface Chauffeur {
  id: string;
  code: string | null;
  nom: string;
  prenom: string;
  vehicule_places: number;
  ligne_id: string | null;
}

interface JourFerie {
  date: string;
  intitule: string;
}

const DAYS_FR = ['dimanche', 'lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi'];
const DAYS_SHORT = ['dim', 'lun', 'mar', 'mer', 'jeu', 'ven', 'sam'];
const MONTHS_FR = ['janvier', 'fevrier', 'mars', 'avril', 'mai', 'juin', 'juillet', 'aout', 'septembre', 'octobre', 'novembre', 'decembre'];

// Capacite d'UN trajet, chauffeur exclu : un vehicule 9 places transporte 8
// usagers. Utilisee a defaut d'information sur le vehicule de la ligne.
const CAPACITE_TRAJET_DEFAUT = 8;

type Sens = 'tous' | 'aller' | 'retour';

/** Comparaison de lieux tolerante (accents, casse, "PEM PASSAMAINTY" ~ "PASSAMAINTY"). */
function normLieu(s: string | null | undefined): string {
  return (s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase().replace(/[^A-Z0-9]/g, '');
}
function memeLieu(a: string | null | undefined, b: string | null | undefined): boolean {
  const x = normLieu(a), y = normLieu(b);
  if (!x || !y) return false;
  return x === y || x.includes(y) || y.includes(x);
}

/**
 * Sens d'une course par rapport a la ligne : ALLER = dans le sens
 * depart -> arrivee de la ligne, RETOUR = l'inverse. Les arrets intermediaires
 * (ex. "M'Tsapere" sur la L3) sont rattaches grace au point d'arrivee.
 */
function sensCourse(c: Course, ligne: Ligne | undefined): 'aller' | 'retour' | 'autre' {
  if (!ligne) return 'autre';
  if (memeLieu(c.depart, ligne.depart)) return 'aller';
  if (memeLieu(c.depart, ligne.arrivee)) return 'retour';
  if (memeLieu(c.arrivee, ligne.arrivee)) return 'aller';
  if (memeLieu(c.arrivee, ligne.depart)) return 'retour';
  return 'autre';
}

/**
 * Nombre d'usagers d'une course = MAX(montees, descentes) — regle metier.
 * Avant : `nb_passagers || passagers_depart || 40`, l'estimation historique a 40
 * usagers par trajet faisait exploser le taux de frequentation des que le
 * chauffeur n'avait pas saisi ses comptages.
 */
function usagersCourse(c: Course): number {
  return Math.max(c.passagers_depart || 0, c.passagers_arrivee || 0, c.nb_passagers || 0);
}

/**
 * Un trajet n'entre dans le calcul du taux de frequentation que s'il a
 * REELLEMENT ETE FAIT : sinon on ajouterait 8 places offertes face a 0 usager,
 * ce qui ecrase le taux (une grande partie des courses passees restent au
 * statut "programme", jamais cloturees dans l'appli chauffeur).
 * Le nombre de trajets PLANIFIES reste affiche a cote, pour comparaison.
 */
function estRealise(c: Course): boolean {
  const s = c.statut_realisation || c.statut || '';
  return s === 'termine' || s === 'terminee' || s === 'en_cours' || usagersCourse(c) > 0;
}

function formatMinutes(minutes: number): string {
  if (minutes <= 0) return '00:00';
  const h = Math.floor(minutes / 60);
  const m = Math.round(minutes % 60);
  return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}`;
}

function calcEcartType(values: number[]): number {
  if (values.length < 2) return 0;
  const mean = values.reduce((s, v) => s + v, 0) / values.length;
  const variance = values.reduce((s, v) => s + Math.pow(v - mean, 2), 0) / values.length;
  return Math.sqrt(variance);
}

function getDaysInMonth(year: number, month: number): Date[] {
  const days: Date[] = [];
  const last = new Date(year, month + 1, 0).getDate();
  for (let d = 1; d <= last; d++) {
    // Ancre a MIDI : mDateStr (offset +3h Mayotte) tombe alors sur le bon jour
    // calendaire quel que soit le fuseau du navigateur (metropole/Reunion).
    days.push(new Date(year, month, d, 12, 0, 0));
  }
  return days;
}

// Cle de date en HEURE DE MAYOTTE (UTC+3 fixe), coherente avec le planning et
// l'appli chauffeur. On ne se base plus sur l'heure locale du navigateur du
// directeur (metropole/Reunion) : sinon les courses de bord de journee tombaient
// sur le mauvais jour dans le rapport.
function toLocalDateStr(d: Date | string): string {
  return mDateStr(d);
}

// Meme logique de parsing que le planning (PlanningPage) pour rester coherent:
// une chaine avec fuseau est un instant, une chaine naive est lue en local.
function parseCourseDate(dateStr: string): Date {
  if (dateStr.endsWith('Z') || dateStr.includes('+')) {
    return new Date(dateStr);
  }
  return new Date(dateStr.replace('T', ' '));
}

function getWeekNumber(date: Date): number {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() + 3 - (d.getDay() + 6) % 7);
  const week1 = new Date(d.getFullYear(), 0, 4);
  return 1 + Math.round(((d.getTime() - week1.getTime()) / 86400000 - 3 + (week1.getDay() + 6) % 7) / 7);
}

export function ReportWizard({ user, clientId, clientNom, lignes, courses, onClose, onSaved }: ReportWizardProps) {
  const [step, setStep] = useState(1);
  const [selectedLigneId, setSelectedLigneId] = useState(lignes[0]?.id || '');
  const [selectedMonth, setSelectedMonth] = useState(() => {
    const now = new Date();
    return `${now.getFullYear()}-${(now.getMonth() + 1).toString().padStart(2, '0')}`;
  });
  const [chauffeurs, setChauffeurs] = useState<Chauffeur[]>([]);
  const [joursFeries, setJoursFeries] = useState<JourFerie[]>([]);
  // Capacite MAX D'UN TRAJET (places du vehicule moins le chauffeur). Avant :
  // deux capacites "matin"/"apres-midi" egales a la somme des places de TOUS les
  // vehicules de la ligne, comparees au cumul des usagers de la journee -> taux
  // de frequentation faux.
  const [capaciteTrajet, setCapaciteTrajet] = useState(CAPACITE_TRAJET_DEFAUT);
  const [sensFilter, setSensFilter] = useState<Sens>('tous');
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  const [daysData, setDaysData] = useState<DayData[]>([]);
  const [dataGenerated, setDataGenerated] = useState(false);
  // Dimanches et jours feries sont traites ENSEMBLE (meme regime pour le
  // client) : ils avaient chacun leur onglet auparavant.
  const [activeTab, setActiveTab] = useState<'semaine' | 'samedi' | 'dimanche_feries' | 'chauffeurs' | 'hebdo' | 'mensuel'>('semaine');
  const [activePeriod, setActivePeriod] = useState<'matin' | 'soir' | 'journee'>('matin');

  const selectedLigne = lignes.find(l => l.id === selectedLigneId);
  const [year, month] = selectedMonth.split('-').map(Number);

  useEffect(() => {
    async function load() {
      const [chRes, jfRes] = await Promise.all([
        supabase.from('chauffeurs').select('id, code, nom, prenom, vehicule_places, ligne_id').eq('statut', 'actif'),
        supabase.from('jours_feries').select('date, intitule'),
      ]);
      if (chRes.data) {
        setChauffeurs(chRes.data);
        // Vehicule median de la ligne, chauffeur deduit (9 places -> 8 usagers).
        const places = chRes.data
          .filter(c => c.ligne_id === selectedLigneId)
          .map(c => c.vehicule_places || 0)
          .filter(p => p > 1)
          .sort((a, b) => a - b);
        const median = places.length > 0 ? places[Math.floor(places.length / 2)] : 0;
        setCapaciteTrajet(median > 1 ? median - 1 : CAPACITE_TRAJET_DEFAUT);
      }
      if (jfRes.data) setJoursFeries(jfRes.data);
    }
    load();
  }, [selectedLigneId]);

  const ligneChauffeurs = useMemo(() => chauffeurs.filter(c => c.ligne_id === selectedLigneId), [chauffeurs, selectedLigneId]);

  const generateData = useCallback(() => {
    const days = getDaysInMonth(year, month - 1);
    // Cloisonnement : le rapport ne compte QUE les courses de CE client (et de la
    // ligne choisie). Sans le filtre client, deux clients partageant une ligne se
    // retrouvaient mutuellement dans leurs rapports.
    // Filtre supplementaire par SENS du trajet (aller / retour) : demande client
    // pour analyser separement les deux sens de la ligne.
    const ligneCourses = courses.filter(c =>
      c.ligne_id === selectedLigneId
      && c.client_id === clientId
      && (sensFilter === 'tous' || sensCourse(c, selectedLigne) === sensFilter));
    const feriesDates = new Set(joursFeries.map(jf => jf.date));
    const feriesMap = Object.fromEntries(joursFeries.map(jf => [jf.date, jf.intitule]));

    const result: DayData[] = days.map(day => {
      const dateStr = toLocalDateStr(day);
      const dayLabel = `${DAYS_FR[day.getDay()]} ${day.getDate()} ${MONTHS_FR[day.getMonth()]} ${day.getFullYear()}`;
      const jourSemaine = DAYS_FR[day.getDay()];
      const isFerie = feriesDates.has(dateStr);

      const dayCourses = ligneCourses.filter(c => toLocalDateStr(parseCourseDate(c.date_heure)) === dateStr);
      const matinCourses = dayCourses.filter(c => c.periode === 'matin');
      const soirCourses = dayCourses.filter(c => c.periode === 'apres_midi');

      // Un depart = une ligne. La capacite d'un creneau = nombre de trajets x
      // capacite d'un vehicule : c'est ce qui rend le taux comparable d'un jour
      // a l'autre.
      const buildTrips = (periodCourses: Course[]): TripRow[] => {
        const byHour: Record<string, Course[]> = {};
        periodCourses.forEach(c => {
          const h = fmtHM(c.date_heure);
          if (!byHour[h]) byHour[h] = [];
          byHour[h].push(c);
        });
        return Object.entries(byHour)
          .sort(([a], [b]) => a.localeCompare(b))
          .map(([heure, trips]) => {
            const usagers = trips.reduce((s, c) => s + usagersCourse(c), 0);
            const realises = trips.filter(estRealise).length;
            const capacite = realises * capaciteTrajet;
            const avgDuree = trips.reduce((s, c) => s + (c.duree_minutes || 0), 0) / trips.length;
            return {
              heure_depart: heure,
              nb_trajets: trips.length,
              nb_realises: realises,
              nbre_usagers: usagers,
              capacite_max: capacite,
              taux_frequentation: capacite > 0 ? Math.round((usagers / capacite) * 100) : 0,
              temps_moyen: formatMinutes(avgDuree),
            };
          });
      };

      const matinTrips = buildTrips(matinCourses);
      const soirTrips = buildTrips(soirCourses);
      const matinRealises = matinCourses.filter(estRealise).length;
      const soirRealises = soirCourses.filter(estRealise).length;
      const capaciteMatin = matinRealises * capaciteTrajet;
      const capaciteAprem = soirRealises * capaciteTrajet;

      const matinDurees = matinCourses.map(c => c.duree_minutes || 0);
      const soirDurees = soirCourses.map(c => c.duree_minutes || 0);
      const allDurees = dayCourses.map(c => c.duree_minutes || 0);

      const matinUsagers = matinTrips.reduce((s, t) => s + t.nbre_usagers, 0);
      const soirUsagers = soirTrips.reduce((s, t) => s + t.nbre_usagers, 0);

      const matinAvg = matinDurees.length > 0 ? matinDurees.reduce((s, v) => s + v, 0) / matinDurees.length : 0;
      const soirAvg = soirDurees.length > 0 ? soirDurees.reduce((s, v) => s + v, 0) / soirDurees.length : 0;
      const allAvg = allDurees.length > 0 ? allDurees.reduce((s, v) => s + v, 0) / allDurees.length : 0;

      return {
        date: dateStr,
        label: dayLabel,
        jour_semaine: jourSemaine,
        is_ferie: isFerie,
        ferie_intitule: feriesMap[dateStr] || '',
        matin: {
          trips: matinTrips,
          nb_trajets: matinCourses.length,
          nb_realises: matinRealises,
          total_usagers: matinUsagers,
          capacite_max: capaciteMatin,
          taux_frequentation: capaciteMatin > 0 ? Math.round((matinUsagers / capaciteMatin) * 100) : 0,
          temps_moyen: formatMinutes(matinAvg),
          ecart_type: formatMinutes(calcEcartType(matinDurees)),
        },
        soir: {
          trips: soirTrips,
          nb_trajets: soirCourses.length,
          nb_realises: soirRealises,
          total_usagers: soirUsagers,
          capacite_max: capaciteAprem,
          taux_frequentation: capaciteAprem > 0 ? Math.round((soirUsagers / capaciteAprem) * 100) : 0,
          temps_moyen: formatMinutes(soirAvg),
          ecart_type: formatMinutes(calcEcartType(soirDurees)),
        },
        journee: {
          nb_trajets: matinCourses.length + soirCourses.length,
          nb_realises: matinRealises + soirRealises,
          total_usagers: matinUsagers + soirUsagers,
          capacite_max: capaciteMatin + capaciteAprem,
          taux_frequentation: (capaciteMatin + capaciteAprem) > 0 ? Math.round(((matinUsagers + soirUsagers) / (capaciteMatin + capaciteAprem)) * 100) : 0,
          temps_moyen: formatMinutes(allAvg),
          ecart_type: formatMinutes(calcEcartType(allDurees)),
        },
      };
    });

    setDaysData(result);
    setDataGenerated(true);
  }, [year, month, selectedLigneId, selectedLigne, clientId, courses, capaciteTrajet, sensFilter, joursFeries]);

  // Editable field updater
  const updateDayField = (dateStr: string, period: 'matin' | 'soir', field: string, tripIdx: number | null, value: number | string) => {
    setDaysData(prev => prev.map(d => {
      if (d.date !== dateStr) return d;
      const copy = { ...d };
      if (tripIdx !== null) {
        const trips = [...copy[period].trips];
        trips[tripIdx] = { ...trips[tripIdx], [field]: value };
        // recalculate totals
        const totalUsagers = trips.reduce((s, t) => s + t.nbre_usagers, 0);
        copy[period] = {
          ...copy[period],
          trips,
          total_usagers: totalUsagers,
          taux_frequentation: copy[period].capacite_max > 0 ? Math.round((totalUsagers / copy[period].capacite_max) * 100) : 0,
        };
      } else {
        copy[period] = { ...copy[period], [field]: value };
        if (field === 'capacite_max') {
          const cap = value as number;
          copy[period].taux_frequentation = cap > 0 ? Math.round((copy[period].total_usagers / cap) * 100) : 0;
        }
      }
      // Recalculate journee
      copy.journee = {
        ...copy.journee,
        total_usagers: copy.matin.total_usagers + copy.soir.total_usagers,
        capacite_max: copy.matin.capacite_max + copy.soir.capacite_max,
        taux_frequentation: (copy.matin.capacite_max + copy.soir.capacite_max) > 0
          ? Math.round(((copy.matin.total_usagers + copy.soir.total_usagers) / (copy.matin.capacite_max + copy.soir.capacite_max)) * 100) : 0,
      };
      return copy;
    }));
  };

  // Filtered views
  const weekdayData = useMemo(() => daysData.filter(d => !['samedi', 'dimanche'].includes(d.jour_semaine) && !d.is_ferie), [daysData]);
  const saturdayData = useMemo(() => daysData.filter(d => d.jour_semaine === 'samedi'), [daysData]);
  // Dimanches ET jours feries dans le meme tableau (meme regime tarifaire /
  // meme service pour le client) : ils etaient separes en deux onglets.
  const dimancheFeriesData = useMemo(
    () => daysData.filter(d => d.jour_semaine === 'dimanche' || d.is_ferie),
    [daysData],
  );

  // Weekly summaries
  // Synthese hebdomadaire calculee sur les SEULS JOURS DE SEMAINE (hors samedi,
  // dimanche et jours feries) : demande client, le service de semaine n'est pas
  // comparable a celui du week-end.
  const weeklySummaries = useMemo((): WeekSummary[] => {
    const weeks: Record<number, DayData[]> = {};
    weekdayData.forEach(d => {
      const w = getWeekNumber(new Date(d.date));
      if (!weeks[w]) weeks[w] = [];
      weeks[w].push(d);
    });
    return Object.entries(weeks).map(([w, days]) => {
      const sorted = days.sort((a, b) => a.date.localeCompare(b.date));
      const matinUsagers = days.reduce((s, d) => s + d.matin.total_usagers, 0);
      const soirUsagers = days.reduce((s, d) => s + d.soir.total_usagers, 0);
      const matinCap = days.reduce((s, d) => s + d.matin.capacite_max, 0);
      const soirCap = days.reduce((s, d) => s + d.soir.capacite_max, 0);
      const matinDurees = days.filter(d => d.matin.temps_moyen !== '00:00').map(d => timeToMinutes(d.matin.temps_moyen));
      const soirDurees = days.filter(d => d.soir.temps_moyen !== '00:00').map(d => timeToMinutes(d.soir.temps_moyen));
      return {
        semaine: parseInt(w),
        date_debut: sorted[0].date,
        date_fin: sorted[sorted.length - 1].date,
        matin: {
          usagers: matinUsagers,
          trajets: days.reduce((s, d) => s + d.matin.nb_trajets, 0),
          capacite: matinCap,
          taux: matinCap > 0 ? Math.round((matinUsagers / matinCap) * 100) : 0,
          temps_moyen: formatMinutes(matinDurees.length > 0 ? matinDurees.reduce((s, v) => s + v, 0) / matinDurees.length : 0),
          ecart_type: formatMinutes(calcEcartType(matinDurees)),
        },
        soir: {
          usagers: soirUsagers,
          trajets: days.reduce((s, d) => s + d.soir.nb_trajets, 0),
          capacite: soirCap,
          taux: soirCap > 0 ? Math.round((soirUsagers / soirCap) * 100) : 0,
          temps_moyen: formatMinutes(soirDurees.length > 0 ? soirDurees.reduce((s, v) => s + v, 0) / soirDurees.length : 0),
          ecart_type: formatMinutes(calcEcartType(soirDurees)),
        },
        total_usagers: matinUsagers + soirUsagers,
        total_trajets: days.reduce((s, d) => s + d.journee.nb_trajets, 0),
        total_realises: days.reduce((s, d) => s + d.journee.nb_realises, 0),
        taux_global: (matinCap + soirCap) > 0 ? Math.round(((matinUsagers + soirUsagers) / (matinCap + soirCap)) * 100) : 0,
      };
    }).sort((a, b) => a.semaine - b.semaine);
  }, [weekdayData]);

  // ---- Statistiques par chauffeur (demande client) -------------------------
  // Pour chaque chauffeur sur le mois / la ligne / le sens choisis :
  //   planifies - non effectues + realises en remplacement = effectues
  // Une course de remplacement est creee par le planning avec la note
  // "[Remplacement]" : c'est le seul marqueur disponible en base.
  const chauffeurStats = useMemo(() => {
    const prefix = `${year}-${month.toString().padStart(2, '0')}`;
    const moisCourses = courses.filter(c =>
      c.ligne_id === selectedLigneId
      && c.client_id === clientId
      && !c.is_brouillon
      && toLocalDateStr(parseCourseDate(c.date_heure)).startsWith(prefix)
      && (sensFilter === 'tous' || sensCourse(c, selectedLigne) === sensFilter));

    const acc = new Map<string, { planifies: number; nonEffectues: number; remplacements: number; effectues: number; usagers: number }>();
    for (const c of moisCourses) {
      const key = c.chauffeur_id || 'non_affecte';
      const a = acc.get(key) || { planifies: 0, nonEffectues: 0, remplacements: 0, effectues: 0, usagers: 0 };
      const statut = c.statut_realisation || c.statut || '';
      const estRemplacement = (c.notes || '').startsWith('[Remplacement]');
      a.planifies += 1;
      if (statut === 'annule' || statut === 'annulee' || statut === 'non_effectue' || statut === 'remplace') a.nonEffectues += 1;
      if (statut === 'termine' || statut === 'terminee') {
        a.effectues += 1;
        a.usagers += usagersCourse(c);
        if (estRemplacement) a.remplacements += 1;
      }
      acc.set(key, a);
    }

    return [...acc.entries()].map(([id, a]) => {
      const ch = chauffeurs.find(x => x.id === id);
      return {
        id,
        libelle: ch ? [ch.code, `${ch.nom} ${ch.prenom}`.trim()].filter(Boolean).join(' - ') : (id === 'non_affecte' ? 'Non affecte' : 'Chauffeur archive'),
        ...a,
      };
    }).sort((a, b) => a.libelle.localeCompare(b.libelle));
  }, [courses, chauffeurs, selectedLigneId, selectedLigne, clientId, sensFilter, year, month]);

  // Monthly summary
  const monthlySummary = useMemo(() => {
    const matinUsagers = daysData.reduce((s, d) => s + d.matin.total_usagers, 0);
    const soirUsagers = daysData.reduce((s, d) => s + d.soir.total_usagers, 0);
    const matinCap = daysData.reduce((s, d) => s + d.matin.capacite_max, 0);
    const soirCap = daysData.reduce((s, d) => s + d.soir.capacite_max, 0);
    const matinDurees = daysData.filter(d => d.matin.temps_moyen !== '00:00').map(d => timeToMinutes(d.matin.temps_moyen));
    const soirDurees = daysData.filter(d => d.soir.temps_moyen !== '00:00').map(d => timeToMinutes(d.soir.temps_moyen));
    return {
      matin: { usagers: matinUsagers, taux: matinCap > 0 ? Math.round((matinUsagers / matinCap) * 100) : 0, temps_moyen: formatMinutes(matinDurees.length > 0 ? matinDurees.reduce((s, v) => s + v, 0) / matinDurees.length : 0), ecart_type: formatMinutes(calcEcartType(matinDurees)) },
      soir: { usagers: soirUsagers, taux: soirCap > 0 ? Math.round((soirUsagers / soirCap) * 100) : 0, temps_moyen: formatMinutes(soirDurees.length > 0 ? soirDurees.reduce((s, v) => s + v, 0) / soirDurees.length : 0), ecart_type: formatMinutes(calcEcartType(soirDurees)) },
      total_usagers: matinUsagers + soirUsagers,
      total_trajets: daysData.reduce((s, d) => s + d.journee.nb_trajets, 0),
      total_realises: daysData.reduce((s, d) => s + d.journee.nb_realises, 0),
      capacite_totale: matinCap + soirCap,
      taux_global: (matinCap + soirCap) > 0 ? Math.round(((matinUsagers + soirUsagers) / (matinCap + soirCap)) * 100) : 0,
      jours_travailles: daysData.filter(d => d.journee.nb_realises > 0).length,
      jours_feries: daysData.filter(d => d.is_ferie).length,
    };
  }, [daysData]);

  function buildReportPayload(statut: 'brouillon' | 'finalise') {
    return {
      client_id: clientId,
      ligne_id: selectedLigneId || null,
      mois: `${year}-${month.toString().padStart(2, '0')}-01`,
      titre: `${selectedLigne?.code || ''} - Statistiques ${MONTHS_FR[month - 1]} ${year} - ${clientNom}`,
      statut,
      data_matin: daysData.map(d => ({ date: d.date, ...d.matin })),
      data_apres_midi: daysData.map(d => ({ date: d.date, ...d.soir })),
      data_journee: daysData.map(d => ({ date: d.date, label: d.label, jour_semaine: d.jour_semaine, is_ferie: d.is_ferie, ferie_intitule: d.ferie_intitule, ...d.journee })),
      data_trajets_matin: daysData.flatMap(d => d.matin.trips.map(t => ({ date: d.date, ...t }))),
      data_trajets_aprem: daysData.flatMap(d => d.soir.trips.map(t => ({ date: d.date, ...t }))),
      metadata: { capacite_trajet: capaciteTrajet, sens: sensFilter, ligne_code: selectedLigne?.code, ligne_depart: selectedLigne?.depart, ligne_arrivee: selectedLigne?.arrivee, weekly: weeklySummaries, monthly: monthlySummary },
      user_id: user.id,
    };
  }

  // UPSERT logique : une SEULE ligne par (client, ligne, mois). Sauver un brouillon
  // puis finaliser met a jour la meme ligne au lieu d'en creer une nouvelle
  // -> plus de doublons dans data_report_client_consolidated.
  async function saveReport(statut: 'brouillon' | 'finalise') {
    setSaving(true);
    try {
      const payload = buildReportPayload(statut);
      let q = supabase.from('data_report_client_consolidated').select('id')
        .eq('client_id', clientId).eq('mois', payload.mois);
      q = selectedLigneId ? q.eq('ligne_id', selectedLigneId) : q.is('ligne_id', null);
      const { data: existingRows } = await q.order('created_at', { ascending: false }).limit(1);
      const existingId = existingRows?.[0]?.id as string | undefined;
      if (existingId) {
        await supabase.from('data_report_client_consolidated').update(payload).eq('id', existingId);
      } else {
        await supabase.from('data_report_client_consolidated').insert(payload);
      }
      setSaved(true);
      onSaved();
    } finally {
      setSaving(false);
    }
  }

  const handleSaveDraft = () => saveReport('brouillon');
  const handleFinalizeReport = () => saveReport('finalise');

  function renderDayTable(days: DayData[], title: string) {
    return (
      <div className="mb-6">
        <h4 className="text-xs font-bold text-red-700 uppercase mb-2">{title}</h4>
        <div className="overflow-x-auto border border-gray-200 rounded-lg">
          <table className="w-full text-[11px]">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-200">
                <th className="px-2 py-2 text-left font-semibold text-gray-600 min-w-[140px]">Jour</th>
                <th className="px-2 py-2 text-center font-semibold text-gray-600" title="Nombre de trajets prevus au planning sur la periode">Trajets</th>
                <th className="px-2 py-2 text-center font-semibold text-gray-600" title="Trajets reellement effectues : eux seuls entrent dans le taux de frequentation">Realises</th>
                <th className="px-2 py-2 text-center font-semibold text-gray-600">Usagers</th>
                <th className="px-2 py-2 text-center font-semibold text-gray-600">Taux freq.</th>
                <th className="px-2 py-2 text-center font-semibold text-gray-600">Temps moy.</th>
                <th className="px-2 py-2 text-center font-semibold text-gray-600">Ecart-type</th>
                <th className="px-2 py-2 text-center font-semibold text-gray-600">Cap. max</th>
                <th className="px-2 py-2 text-center font-semibold text-gray-600 w-8"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {days.map(day => {
                const period = activePeriod === 'journee' ? null : day[activePeriod];
                const journee = day.journee;
                const data = activePeriod === 'journee' ? journee : period!;
                const trips = activePeriod !== 'journee' ? period!.trips : [];
                const isWeekend = day.jour_semaine === 'samedi' || day.jour_semaine === 'dimanche';
                const freqColor = data.taux_frequentation >= 95 ? 'bg-red-50' : data.taux_frequentation >= 80 ? 'bg-orange-50' : '';

                return (
                  <tr key={day.date} className={`${isWeekend ? 'bg-blue-50/20' : ''} ${day.is_ferie ? 'bg-yellow-50/40' : ''} ${freqColor} hover:bg-gray-50/50 transition-colors`}>
                    <td className="px-2 py-1.5">
                      <div className="flex items-center gap-1">
                        <span className="font-medium text-gray-800">{DAYS_SHORT[new Date(day.date).getDay()]} {new Date(day.date).getDate()}</span>
                        {day.is_ferie && (
                          <span className="inline-flex items-center gap-0.5 px-1 py-0.5 bg-yellow-100 text-yellow-700 rounded text-[9px] font-semibold" title={day.ferie_intitule}>
                            <AlertTriangle className="w-2.5 h-2.5" /> F
                          </span>
                        )}
                      </div>
                    </td>
                    {/* Avant : l'heure du premier depart, que personne ne savait
                        interpreter. On affiche le NOMBRE DE TRAJETS (les horaires
                        restent lisibles en infobulle). */}
                    <td
                      className="px-2 py-1.5 text-center font-medium text-gray-700"
                      title={trips.length > 0 ? `Departs : ${trips.map(t => `${t.heure_depart} (${t.nb_trajets})`).join(', ')}` : undefined}
                    >
                      {data.nb_trajets}
                    </td>
                    <td className={`px-2 py-1.5 text-center ${data.nb_realises < data.nb_trajets ? 'text-amber-600 font-medium' : 'text-gray-600'}`}>
                      {data.nb_realises}
                    </td>
                    <td className="px-2 py-1.5 text-center">
                      <input
                        type="number"
                        value={data.total_usagers}
                        onChange={(e) => {
                          if (activePeriod !== 'journee') {
                            updateDayField(day.date, activePeriod, 'total_usagers', null, parseInt(e.target.value) || 0);
                          }
                        }}
                        disabled={activePeriod === 'journee'}
                        className={`w-14 px-1 py-0.5 rounded text-center font-medium ${activePeriod === 'journee' ? 'bg-gray-50 text-gray-500 border-gray-200' : 'border-blue-200 text-blue-700 bg-blue-50/50 focus:ring-1 focus:ring-blue-400'} border outline-none`}
                      />
                    </td>
                    <td
                      className={`px-2 py-1.5 text-center font-bold ${data.taux_frequentation >= 95 ? 'text-red-700' : data.taux_frequentation >= 80 ? 'text-orange-700' : 'text-gray-700'}`}
                      title={`${data.total_usagers} usagers / ${data.capacite_max} places (${data.nb_realises} trajets realises x ${capaciteTrajet})`}
                    >
                      {data.taux_frequentation}%
                      <span className="block text-[9px] font-normal text-gray-400">
                        {data.total_usagers}/{data.capacite_max}
                      </span>
                    </td>
                    <td className="px-2 py-1.5 text-center">
                      <input
                        type="text"
                        value={data.temps_moyen}
                        onChange={(e) => {
                          if (activePeriod !== 'journee') {
                            updateDayField(day.date, activePeriod, 'temps_moyen', null, e.target.value);
                          }
                        }}
                        disabled={activePeriod === 'journee'}
                        className={`w-14 px-1 py-0.5 rounded text-center font-medium ${activePeriod === 'journee' ? 'bg-gray-50 text-gray-500 border-gray-200' : 'border-blue-200 text-blue-700 bg-blue-50/50 focus:ring-1 focus:ring-blue-400'} border outline-none`}
                      />
                    </td>
                    <td className="px-2 py-1.5 text-center text-gray-500 font-mono">
                      {data.ecart_type}
                    </td>
                    <td className="px-2 py-1.5 text-center">
                      <input
                        type="number"
                        value={'capacite_max' in data ? (data as { capacite_max: number }).capacite_max : 0}
                        onChange={(e) => {
                          if (activePeriod !== 'journee') {
                            updateDayField(day.date, activePeriod, 'capacite_max', null, parseInt(e.target.value) || 0);
                          }
                        }}
                        disabled={activePeriod === 'journee'}
                        className={`w-14 px-1 py-0.5 rounded text-center font-medium ${activePeriod === 'journee' ? 'bg-gray-50 text-gray-500 border-gray-200' : 'border-blue-200 text-blue-700 bg-blue-50/50 focus:ring-1 focus:ring-blue-400'} border outline-none`}
                      />
                    </td>
                    <td className="px-2 py-1.5 text-center">
                      {day.is_ferie && <span className="text-[9px] text-yellow-600">{day.ferie_intitule}</span>}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    );
  }

  function renderChauffeurTable() {
    const tot = chauffeurStats.reduce((s, c) => ({
      planifies: s.planifies + c.planifies,
      nonEffectues: s.nonEffectues + c.nonEffectues,
      remplacements: s.remplacements + c.remplacements,
      effectues: s.effectues + c.effectues,
      usagers: s.usagers + c.usagers,
    }), { planifies: 0, nonEffectues: 0, remplacements: 0, effectues: 0, usagers: 0 });
    if (chauffeurStats.length === 0) {
      return <p className="text-sm text-gray-400 italic p-4">Aucune course sur ce mois pour cette ligne.</p>;
    }
    return (
      <div className="mb-6">
        <h4 className="text-xs font-bold text-red-700 uppercase mb-2">
          Detail par chauffeur - {MONTHS_FR[month - 1]} {year}
        </h4>
        <div className="overflow-x-auto border border-gray-200 rounded-lg">
          <table className="w-full text-[11px]">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-200">
                <th className="px-3 py-2 text-left font-semibold text-gray-600">Chauffeur</th>
                <th className="px-3 py-2 text-center font-semibold text-gray-600" title="Toutes les courses qui lui etaient affectees">Trajets planifies</th>
                <th className="px-3 py-2 text-center font-semibold text-gray-600" title="Annules, non effectues ou repris par un remplacant">Non effectues</th>
                <th className="px-3 py-2 text-center font-semibold text-gray-600" title="Trajets qu'il a assures a la place d'un autre chauffeur">Dont remplacements</th>
                <th className="px-3 py-2 text-center font-semibold text-gray-700 bg-gray-100">Trajets effectues</th>
                <th className="px-3 py-2 text-center font-semibold text-gray-600">Usagers</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {chauffeurStats.map(c => (
                <tr key={c.id} className="hover:bg-gray-50 transition-colors">
                  <td className="px-3 py-2 font-medium text-gray-800">{c.libelle}</td>
                  <td className="px-3 py-2 text-center text-gray-700">{c.planifies}</td>
                  <td className={`px-3 py-2 text-center ${c.nonEffectues > 0 ? 'text-red-600 font-medium' : 'text-gray-400'}`}>{c.nonEffectues}</td>
                  <td className={`px-3 py-2 text-center ${c.remplacements > 0 ? 'text-amber-600 font-medium' : 'text-gray-400'}`}>{c.remplacements}</td>
                  <td className="px-3 py-2 text-center font-bold text-gray-900 bg-gray-50">{c.effectues}</td>
                  <td className="px-3 py-2 text-center text-gray-700">{c.usagers}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="bg-gray-50 border-t-2 border-gray-200 font-bold text-gray-800">
                <td className="px-3 py-2">TOTAL ({chauffeurStats.length} chauffeurs)</td>
                <td className="px-3 py-2 text-center">{tot.planifies}</td>
                <td className="px-3 py-2 text-center">{tot.nonEffectues}</td>
                <td className="px-3 py-2 text-center">{tot.remplacements}</td>
                <td className="px-3 py-2 text-center">{tot.effectues}</td>
                <td className="px-3 py-2 text-center">{tot.usagers}</td>
              </tr>
            </tfoot>
          </table>
        </div>
      </div>
    );
  }

  function renderWeeklyTable() {
    return (
      <div className="mb-6">
        <h4 className="text-xs font-bold text-red-700 uppercase mb-2">
          Synthese hebdomadaire
          <span className="ml-2 font-normal normal-case text-[10px] text-gray-500">
            jours de semaine uniquement (hors samedi, dimanche et jours feries)
          </span>
        </h4>
        <div className="overflow-x-auto border border-gray-200 rounded-lg">
          <table className="w-full text-[11px]">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-200">
                <th className="px-3 py-2 text-left font-semibold text-gray-600">Semaine</th>
                <th className="px-3 py-2 text-center font-semibold text-gray-600" title="Trajets realises / planifies">Trajets</th>
                <th className="px-3 py-2 text-center font-semibold text-gray-600">Usagers Matin</th>
                <th className="px-3 py-2 text-center font-semibold text-gray-600">Taux Matin</th>
                <th className="px-3 py-2 text-center font-semibold text-gray-600">Temps moy. Matin</th>
                <th className="px-3 py-2 text-center font-semibold text-gray-600">Ecart-type</th>
                <th className="px-3 py-2 text-center font-semibold text-gray-600">Usagers Soir</th>
                <th className="px-3 py-2 text-center font-semibold text-gray-600">Taux Soir</th>
                <th className="px-3 py-2 text-center font-semibold text-gray-600">Temps moy. Soir</th>
                <th className="px-3 py-2 text-center font-semibold text-gray-600">Ecart-type</th>
                <th className="px-3 py-2 text-center font-semibold text-gray-700 bg-gray-100">Total</th>
                <th className="px-3 py-2 text-center font-semibold text-gray-700 bg-gray-100">Taux</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {weeklySummaries.map(w => (
                <tr key={w.semaine} className="hover:bg-gray-50 transition-colors">
                  <td className="px-3 py-2 font-medium text-gray-800">S{w.semaine}</td>
                  <td className="px-3 py-2 text-center text-gray-500" title={`${w.total_realises} realises sur ${w.total_trajets} planifies`}>
                    {w.total_realises}<span className="text-gray-300">/{w.total_trajets}</span>
                  </td>
                  <td className="px-3 py-2 text-center text-gray-700">{w.matin.usagers}</td>
                  <td className={`px-3 py-2 text-center font-bold ${w.matin.taux >= 95 ? 'text-red-700' : 'text-gray-700'}`}>{w.matin.taux}%</td>
                  <td className="px-3 py-2 text-center text-gray-600">{w.matin.temps_moyen}</td>
                  <td className="px-3 py-2 text-center text-gray-400">{w.matin.ecart_type}</td>
                  <td className="px-3 py-2 text-center text-gray-700">{w.soir.usagers}</td>
                  <td className={`px-3 py-2 text-center font-bold ${w.soir.taux >= 85 ? 'text-red-700' : 'text-gray-700'}`}>{w.soir.taux}%</td>
                  <td className="px-3 py-2 text-center text-gray-600">{w.soir.temps_moyen}</td>
                  <td className="px-3 py-2 text-center text-gray-400">{w.soir.ecart_type}</td>
                  <td className="px-3 py-2 text-center font-bold text-gray-900 bg-gray-50">{w.total_usagers}</td>
                  <td
                    className={`px-3 py-2 text-center font-bold bg-gray-50 ${w.taux_global >= 90 ? 'text-red-700' : 'text-gray-700'}`}
                    title={`${w.total_usagers} usagers / ${w.matin.capacite + w.soir.capacite} places`}
                  >{w.taux_global}%</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    );
  }

  function renderMonthlyCard() {
    return (
      <div className="mb-6">
        <h4 className="text-xs font-bold text-red-700 uppercase mb-2">Synthese mensuelle - {MONTHS_FR[month - 1]} {year}</h4>
        <div className="grid grid-cols-3 gap-4">
          <div className="bg-white border border-gray-200 rounded-xl p-4">
            <p className="text-[10px] text-gray-500 uppercase font-semibold mb-2">Matin</p>
            <p className="text-xl font-bold text-gray-900">{monthlySummary.matin.usagers} <span className="text-xs font-normal text-gray-400">usagers</span></p>
            <div className="mt-2 space-y-1 text-[11px]">
              <div className="flex justify-between"><span className="text-gray-500">Taux freq.</span><span className={`font-bold ${monthlySummary.matin.taux >= 90 ? 'text-red-600' : 'text-gray-700'}`}>{monthlySummary.matin.taux}%</span></div>
              <div className="flex justify-between"><span className="text-gray-500">Temps moyen</span><span className="font-medium text-gray-700">{monthlySummary.matin.temps_moyen}</span></div>
              <div className="flex justify-between"><span className="text-gray-500">Ecart-type</span><span className="text-gray-500">{monthlySummary.matin.ecart_type}</span></div>
            </div>
          </div>
          <div className="bg-white border border-gray-200 rounded-xl p-4">
            <p className="text-[10px] text-gray-500 uppercase font-semibold mb-2">Apres-midi</p>
            <p className="text-xl font-bold text-gray-900">{monthlySummary.soir.usagers} <span className="text-xs font-normal text-gray-400">usagers</span></p>
            <div className="mt-2 space-y-1 text-[11px]">
              <div className="flex justify-between"><span className="text-gray-500">Taux freq.</span><span className={`font-bold ${monthlySummary.soir.taux >= 85 ? 'text-red-600' : 'text-gray-700'}`}>{monthlySummary.soir.taux}%</span></div>
              <div className="flex justify-between"><span className="text-gray-500">Temps moyen</span><span className="font-medium text-gray-700">{monthlySummary.soir.temps_moyen}</span></div>
              <div className="flex justify-between"><span className="text-gray-500">Ecart-type</span><span className="text-gray-500">{monthlySummary.soir.ecart_type}</span></div>
            </div>
          </div>
          <div className="bg-gray-900 border border-gray-700 rounded-xl p-4 text-white">
            <p className="text-[10px] text-gray-400 uppercase font-semibold mb-2">Total Mensuel</p>
            <p className="text-xl font-bold">{monthlySummary.total_usagers} <span className="text-xs font-normal text-gray-400">usagers</span></p>
            <div className="mt-2 space-y-1 text-[11px]">
              <div className="flex justify-between" title="Trajets realises sur trajets planifies"><span className="text-gray-400">Trajets realises</span><span className="text-white">{monthlySummary.total_realises} / {monthlySummary.total_trajets}</span></div>
              <div className="flex justify-between"><span className="text-gray-400">Capacite totale</span><span className="text-white">{monthlySummary.capacite_totale}</span></div>
              <div className="flex justify-between"><span className="text-gray-400">Taux global</span><span className="font-bold text-white" title={`${monthlySummary.total_usagers} usagers / ${monthlySummary.capacite_totale} places`}>{monthlySummary.taux_global}%</span></div>
              <div className="flex justify-between"><span className="text-gray-400">Jours travailles</span><span className="text-white">{monthlySummary.jours_travailles}</span></div>
              <div className="flex justify-between"><span className="text-gray-400">Jours feries</span><span className="text-yellow-400">{monthlySummary.jours_feries}</span></div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 bg-black/60 z-50 flex items-start justify-center overflow-y-auto py-4">
      <div className="bg-gray-50 rounded-2xl w-full max-w-6xl shadow-2xl mx-4 my-auto">
        {/* Header */}
        <div className="sticky top-0 z-10 bg-white rounded-t-2xl border-b border-gray-200 px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-amber-50 rounded-xl flex items-center justify-center">
              <FileText className="w-5 h-5 text-amber-600" />
            </div>
            <div>
              <h2 className="font-bold text-gray-900">Generer un rapport</h2>
              <p className="text-xs text-gray-500">{clientNom} — {selectedLigne?.code} {selectedLigne?.depart} ↔ {selectedLigne?.arrivee}</p>
            </div>
          </div>
          <button onClick={onClose} className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-6">
          {/* Step indicator */}
          <div className="flex items-center gap-2 mb-6">
            {[1, 2, 3].map(s => (
              <div key={s} className="flex items-center gap-2">
                <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold transition-colors ${step === s ? 'bg-amber-600 text-white' : step > s ? 'bg-emerald-500 text-white' : 'bg-gray-200 text-gray-500'}`}>
                  {step > s ? <Check className="w-4 h-4" /> : s}
                </div>
                <span className={`text-xs font-medium ${step === s ? 'text-gray-900' : 'text-gray-400'}`}>
                  {s === 1 ? 'Configuration' : s === 2 ? 'Brouillon' : 'Rapport'}
                </span>
                {s < 3 && <ChevronRight className="w-4 h-4 text-gray-300" />}
              </div>
            ))}
          </div>

          {/* Step 1: Configuration */}
          {step === 1 && (
            <div className="space-y-6">
              <div className="bg-white rounded-xl border border-gray-200 p-6 space-y-5">
                <h3 className="font-semibold text-gray-900">Configuration du rapport</h3>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-semibold text-gray-500 uppercase mb-1.5">Ligne</label>
                    <select value={selectedLigneId} onChange={(e) => setSelectedLigneId(e.target.value)} className="w-full px-3 py-2.5 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-amber-500 outline-none">
                      {lignes.map(l => <option key={l.id} value={l.id}>{l.code} - {l.depart} ↔ {l.arrivee}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-gray-500 uppercase mb-1.5">Mois</label>
                    <input type="month" value={selectedMonth} onChange={(e) => setSelectedMonth(e.target.value)} className="w-full px-3 py-2.5 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-amber-500 outline-none" />
                  </div>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-500 uppercase mb-1.5">Chauffeurs affectes ({ligneChauffeurs.length})</label>
                  {ligneChauffeurs.length > 0 ? (
                    <div className="border border-gray-200 rounded-lg divide-y divide-gray-100 max-h-40 overflow-y-auto">
                      {ligneChauffeurs.map(c => (
                        <div key={c.id} className="px-3 py-2 flex items-center justify-between">
                          <span className="text-sm text-gray-700">{c.prenom} {c.nom}</span>
                          <span className="text-xs font-bold text-teal-700 bg-teal-50 px-2 py-0.5 rounded">{c.vehicule_places} places</span>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-sm text-gray-400 italic">Aucun chauffeur affecte</p>
                  )}
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-semibold text-gray-500 uppercase mb-1.5"><Users className="w-3 h-3 inline mr-1" />Capacite max par trajet</label>
                    <input type="number" min={1} value={capaciteTrajet} onChange={(e) => setCapaciteTrajet(parseInt(e.target.value) || CAPACITE_TRAJET_DEFAUT)} className="w-full px-3 py-2.5 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-amber-500 outline-none" />
                    <p className="text-[10px] text-gray-400 mt-1">
                      Places du vehicule moins le chauffeur (9 places = 8 usagers).
                      La capacite d'une periode = nombre de trajets x cette valeur.
                    </p>
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-gray-500 uppercase mb-1.5">Sens du trajet</label>
                    <select value={sensFilter} onChange={(e) => setSensFilter(e.target.value as Sens)} className="w-full px-3 py-2.5 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-amber-500 outline-none">
                      <option value="tous">Les deux sens</option>
                      <option value="aller">Aller ({selectedLigne?.depart} vers {selectedLigne?.arrivee})</option>
                      <option value="retour">Retour ({selectedLigne?.arrivee} vers {selectedLigne?.depart})</option>
                    </select>
                    <p className="text-[10px] text-gray-400 mt-1">Filtre applique a tout le rapport</p>
                  </div>
                </div>
              </div>
              <div className="bg-blue-50 border border-blue-200 rounded-xl p-4">
                <p className="text-sm text-blue-800">
                  Donnees generees par jour: <b>nombre de trajets</b>, <b>nbre usagers</b> (le plus grand des
                  comptages montees / descentes), <b>capacite max</b>, <b>taux de frequentation</b>
                  (usagers / capacite), <b>temps moyen</b>, <b>ecart-type</b>.
                  Vue par jour type (semaine / samedi / dimanche et feries), par semaine
                  (jours de semaine uniquement) et mensuel.
                  Chiffres <span className="text-blue-700 font-bold">bleus</span> = modifiables.
                </p>
              </div>
              <div className="flex justify-end">
                <button onClick={() => { generateData(); setStep(2); }} className="px-6 py-2.5 bg-amber-600 hover:bg-amber-700 text-white rounded-xl font-medium transition-colors flex items-center gap-2">
                  Generer le brouillon <ChevronRight className="w-4 h-4" />
                </button>
              </div>
            </div>
          )}

          {/* Step 2: Editable Draft */}
          {step === 2 && dataGenerated && (
            <div className="space-y-4">
              <div className="bg-white rounded-xl border border-gray-200 p-4">
                <div className="flex items-center justify-between mb-3">
                  <h3 className="font-semibold text-gray-900">Brouillon - Donnees detaillees</h3>
                  <div className="flex items-center gap-2 text-[11px]">
                    <span className="px-2 py-1 bg-blue-50 text-blue-700 border border-blue-200 rounded">Modifiable</span>
                    <span className="px-2 py-1 bg-gray-50 text-gray-500 border border-gray-200 rounded">Calcule auto</span>
                    <span className="px-2 py-1 bg-yellow-50 text-yellow-700 border border-yellow-200 rounded flex items-center gap-0.5"><AlertTriangle className="w-3 h-3" /> Ferie</span>
                  </div>
                </div>
                {/* Tab navigation */}
                <div className="flex flex-wrap gap-1 mb-3">
                  {([['semaine', 'Jours semaine'], ['samedi', 'Samedis'], ['dimanche_feries', 'Dimanches et feries'], ['chauffeurs', 'Par chauffeur'], ['hebdo', 'Par semaine'], ['mensuel', 'Mensuel']] as [string, string][]).map(([key, label]) => (
                    <button key={key} onClick={() => setActiveTab(key as typeof activeTab)} className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${activeTab === key ? 'bg-amber-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}>
                      {label}
                      {key === 'dimanche_feries' && dimancheFeriesData.length > 0 && <span className="ml-1 text-[9px]">({dimancheFeriesData.length})</span>}
                    </button>
                  ))}
                </div>
                {/* Period toggle */}
                {!['hebdo', 'mensuel', 'chauffeurs'].includes(activeTab) && (
                  <div className="flex gap-1 mb-3">
                    {([['matin', 'Matin'], ['soir', 'Apres-midi'], ['journee', 'Journee']] as [typeof activePeriod, string][]).map(([key, label]) => (
                      <button key={key} onClick={() => setActivePeriod(key)} className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${activePeriod === key ? 'bg-teal-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}>
                        {label}
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {/* Content based on tab */}
              {activeTab === 'semaine' && renderDayTable(weekdayData, `Jours de semaine - ${activePeriod === 'matin' ? 'Matin' : activePeriod === 'soir' ? 'Apres-midi' : 'Journee'}`)}
              {activeTab === 'samedi' && renderDayTable(saturdayData, `Samedis - ${activePeriod === 'matin' ? 'Matin' : activePeriod === 'soir' ? 'Apres-midi' : 'Journee'}`)}
              {activeTab === 'dimanche_feries' && (dimancheFeriesData.length > 0
                ? renderDayTable(dimancheFeriesData, `Dimanches et jours feries - ${activePeriod === 'matin' ? 'Matin' : activePeriod === 'soir' ? 'Apres-midi' : 'Journee'}`)
                : <p className="text-sm text-gray-400 italic p-4">Aucun dimanche ni jour ferie sur ce mois</p>)}
              {activeTab === 'chauffeurs' && renderChauffeurTable()}
              {activeTab === 'hebdo' && renderWeeklyTable()}
              {activeTab === 'mensuel' && renderMonthlyCard()}

              <div className="flex items-center justify-between pt-4">
                <button onClick={() => setStep(1)} className="px-4 py-2.5 border border-gray-200 text-gray-700 rounded-xl font-medium hover:bg-gray-50 transition-colors flex items-center gap-2">
                  <ChevronLeft className="w-4 h-4" /> Retour
                </button>
                <div className="flex gap-3">
                  <button onClick={handleSaveDraft} disabled={saving} className="px-5 py-2.5 border border-amber-300 text-amber-700 bg-amber-50 rounded-xl font-medium hover:bg-amber-100 transition-colors flex items-center gap-2 disabled:opacity-50">
                    <Save className="w-4 h-4" /> Sauver brouillon
                  </button>
                  <button onClick={() => setStep(3)} className="px-6 py-2.5 bg-amber-600 hover:bg-amber-700 text-white rounded-xl font-medium transition-colors flex items-center gap-2">
                    Apercu rapport <ChevronRight className="w-4 h-4" />
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Step 3: Report Preview + Finalize */}
          {step === 3 && (
            <div className="space-y-4">
              <div className="bg-white rounded-xl border border-gray-200 p-4 flex items-center justify-between">
                <div>
                  <h3 className="font-semibold text-gray-900">Apercu du rapport final</h3>
                  <p className="text-xs text-gray-500">Verifiez les donnees avant de finaliser</p>
                </div>
                {saved && (
                  <span className="flex items-center gap-1.5 text-sm text-emerald-600 font-medium">
                    <Check className="w-4 h-4" /> Rapport sauvegarde
                  </span>
                )}
              </div>

              {/* Report header */}
              <div className="bg-white border border-gray-200 rounded-xl p-6">
                <div className="flex items-center justify-between mb-4">
                  <div>
                    <h3 className="text-lg font-bold text-gray-900">TAXI VANILLE 976</h3>
                    <p className="text-xs text-gray-500">Cooperative des Artisans Taxis de Mayotte - CariBus</p>
                  </div>
                </div>
                <h2 className="text-center text-base font-bold text-red-700 mb-1">
                  LIGNE {selectedLigne?.code} - STATISTIQUES MOIS DE {MONTHS_FR[month - 1].toUpperCase()} {year}
                </h2>
                <p className="text-center text-sm text-gray-500">{selectedLigne?.depart} ↔ {selectedLigne?.arrivee}</p>
              </div>

              {renderMonthlyCard()}
              {renderChauffeurTable()}
              {renderWeeklyTable()}
              {renderDayTable(weekdayData, 'Statistiques journalieres - Semaine (Matin)')}

              {/* Chart */}
              <div className="bg-white border border-gray-200 rounded-xl p-6">
                <h4 className="text-xs font-bold text-gray-700 mb-4">Taux de frequentation journalier</h4>
                <div className="h-40 flex items-end gap-0.5 px-2">
                  {daysData.map((d, i) => (
                    <div key={i} className="flex-1 flex flex-col items-center justify-end gap-0.5">
                      <div className="w-full rounded-t" style={{ height: `${Math.max(2, d.matin.taux_frequentation * 1.2)}px`, backgroundColor: selectedLigne?.couleur || '#1a56db' }} />
                      <div className="w-full rounded-t" style={{ height: `${Math.max(1, d.soir.taux_frequentation * 0.8)}px`, backgroundColor: '#ea580c' }} />
                      {i % 5 === 0 && <span className="text-[7px] text-gray-400 mt-1">{new Date(d.date).getDate()}</span>}
                    </div>
                  ))}
                </div>
                <div className="flex items-center gap-4 mt-3 text-[10px] text-gray-500">
                  <span className="flex items-center gap-1"><span className="w-3 h-1 rounded" style={{ backgroundColor: selectedLigne?.couleur || '#1a56db' }} /> Matin</span>
                  <span className="flex items-center gap-1"><span className="w-3 h-1 rounded bg-orange-600" /> Apres-midi</span>
                </div>
              </div>

              <div className="flex items-center justify-between pt-4 pb-2">
                <button onClick={() => setStep(2)} className="px-4 py-2.5 border border-gray-200 text-gray-700 rounded-xl font-medium hover:bg-gray-50 transition-colors flex items-center gap-2">
                  <ChevronLeft className="w-4 h-4" /> Modifier
                </button>
                <div className="flex gap-3">
                  {!saved ? (
                    <button onClick={handleFinalizeReport} disabled={saving} className="px-6 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl font-medium transition-colors flex items-center gap-2 disabled:opacity-50">
                      {saving ? <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" /> : <Save className="w-4 h-4" />}
                      Finaliser et sauvegarder
                    </button>
                  ) : (
                    <button onClick={onClose} className="px-6 py-2.5 bg-gray-900 hover:bg-gray-800 text-white rounded-xl font-medium transition-colors flex items-center gap-2">
                      Fermer <Check className="w-4 h-4" />
                    </button>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function timeToMinutes(time: string): number {
  const [h, m] = time.split(':').map(Number);
  return (h || 0) * 60 + (m || 0);
}
