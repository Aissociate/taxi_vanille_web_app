import { useState, useEffect, useMemo, useCallback } from 'react';
import { supabase } from '../lib/supabase';
import { X, ChevronRight, ChevronLeft, Save, FileText, Check, Users, AlertTriangle } from 'lucide-react';
import type { User } from '@supabase/supabase-js';

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
  statut: string;
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
  nbre_usagers: number;
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
    total_usagers: number;
    capacite_max: number;
    taux_frequentation: number;
    temps_moyen: string;
    ecart_type: string;
  };
  soir: {
    trips: TripRow[];
    total_usagers: number;
    capacite_max: number;
    taux_frequentation: number;
    temps_moyen: string;
    ecart_type: string;
  };
  journee: {
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
  matin: { usagers: number; taux: number; temps_moyen: string; ecart_type: string };
  soir: { usagers: number; taux: number; temps_moyen: string; ecart_type: string };
  total_usagers: number;
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
    days.push(new Date(year, month, d));
  }
  return days;
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
  const [capaciteMatin, setCapaciteMatin] = useState(0);
  const [capaciteAprem, setCapaciteAprem] = useState(0);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  const [daysData, setDaysData] = useState<DayData[]>([]);
  const [dataGenerated, setDataGenerated] = useState(false);
  const [activeTab, setActiveTab] = useState<'semaine' | 'samedi' | 'dimanche' | 'feries' | 'hebdo' | 'mensuel'>('semaine');
  const [activePeriod, setActivePeriod] = useState<'matin' | 'soir' | 'journee'>('matin');

  const selectedLigne = lignes.find(l => l.id === selectedLigneId);
  const [year, month] = selectedMonth.split('-').map(Number);

  useEffect(() => {
    async function load() {
      const [chRes, jfRes] = await Promise.all([
        supabase.from('chauffeurs').select('id, nom, prenom, vehicule_places, ligne_id').eq('statut', 'actif'),
        supabase.from('jours_feries').select('date, intitule'),
      ]);
      if (chRes.data) {
        setChauffeurs(chRes.data);
        const lc = chRes.data.filter(c => c.ligne_id === selectedLigneId);
        const total = lc.reduce((s, c) => s + (c.vehicule_places || 0), 0);
        setCapaciteMatin(total);
        setCapaciteAprem(total);
      }
      if (jfRes.data) setJoursFeries(jfRes.data);
    }
    load();
  }, [selectedLigneId]);

  const ligneChauffeurs = useMemo(() => chauffeurs.filter(c => c.ligne_id === selectedLigneId), [chauffeurs, selectedLigneId]);

  const generateData = useCallback(() => {
    const days = getDaysInMonth(year, month - 1);
    const ligneCourses = courses.filter(c => c.ligne_id === selectedLigneId);
    const feriesDates = new Set(joursFeries.map(jf => jf.date));
    const feriesMap = Object.fromEntries(joursFeries.map(jf => [jf.date, jf.intitule]));

    const result: DayData[] = days.map(day => {
      const dateStr = day.toISOString().split('T')[0];
      const dayLabel = `${DAYS_FR[day.getDay()]} ${day.getDate()} ${MONTHS_FR[day.getMonth()]} ${day.getFullYear()}`;
      const jourSemaine = DAYS_FR[day.getDay()];
      const isFerie = feriesDates.has(dateStr);

      const dayCourses = ligneCourses.filter(c => c.date_heure.startsWith(dateStr));
      const matinCourses = dayCourses.filter(c => c.periode === 'matin');
      const soirCourses = dayCourses.filter(c => c.periode === 'apres_midi');

      const buildTrips = (periodCourses: Course[], capacite: number): TripRow[] => {
        const byHour: Record<string, Course[]> = {};
        periodCourses.forEach(c => {
          const h = new Date(c.date_heure).toTimeString().slice(0, 5);
          if (!byHour[h]) byHour[h] = [];
          byHour[h].push(c);
        });
        return Object.entries(byHour)
          .sort(([a], [b]) => a.localeCompare(b))
          .map(([heure, trips]) => {
            // Real passenger counts reported by the driver app; fall back to
            // the historical estimate (40/trip) for courses without counts.
            const usagers = trips.reduce(
              (s, c) => s + (c.nb_passagers || c.passagers_depart || 40),
              0
            );
            const avgDuree = trips.reduce((s, c) => s + (c.duree_minutes || 0), 0) / trips.length;
            return {
              heure_depart: heure,
              nbre_usagers: usagers,
              taux_frequentation: capacite > 0 ? Math.round((usagers / capacite) * 100) : 0,
              temps_moyen: formatMinutes(avgDuree),
            };
          });
      };

      const matinTrips = buildTrips(matinCourses, capaciteMatin);
      const soirTrips = buildTrips(soirCourses, capaciteAprem);

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
          total_usagers: matinUsagers,
          capacite_max: capaciteMatin,
          taux_frequentation: capaciteMatin > 0 ? Math.round((matinUsagers / capaciteMatin) * 100) : 0,
          temps_moyen: formatMinutes(matinAvg),
          ecart_type: formatMinutes(calcEcartType(matinDurees)),
        },
        soir: {
          trips: soirTrips,
          total_usagers: soirUsagers,
          capacite_max: capaciteAprem,
          taux_frequentation: capaciteAprem > 0 ? Math.round((soirUsagers / capaciteAprem) * 100) : 0,
          temps_moyen: formatMinutes(soirAvg),
          ecart_type: formatMinutes(calcEcartType(soirDurees)),
        },
        journee: {
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
  }, [year, month, selectedLigneId, courses, capaciteMatin, capaciteAprem, joursFeries]);

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
  const sundayData = useMemo(() => daysData.filter(d => d.jour_semaine === 'dimanche'), [daysData]);
  const feriesData = useMemo(() => daysData.filter(d => d.is_ferie), [daysData]);

  // Weekly summaries
  const weeklySummaries = useMemo((): WeekSummary[] => {
    const weeks: Record<number, DayData[]> = {};
    daysData.forEach(d => {
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
          taux: matinCap > 0 ? Math.round((matinUsagers / matinCap) * 100) : 0,
          temps_moyen: formatMinutes(matinDurees.length > 0 ? matinDurees.reduce((s, v) => s + v, 0) / matinDurees.length : 0),
          ecart_type: formatMinutes(calcEcartType(matinDurees)),
        },
        soir: {
          usagers: soirUsagers,
          taux: soirCap > 0 ? Math.round((soirUsagers / soirCap) * 100) : 0,
          temps_moyen: formatMinutes(soirDurees.length > 0 ? soirDurees.reduce((s, v) => s + v, 0) / soirDurees.length : 0),
          ecart_type: formatMinutes(calcEcartType(soirDurees)),
        },
        total_usagers: matinUsagers + soirUsagers,
        taux_global: (matinCap + soirCap) > 0 ? Math.round(((matinUsagers + soirUsagers) / (matinCap + soirCap)) * 100) : 0,
      };
    }).sort((a, b) => a.semaine - b.semaine);
  }, [daysData]);

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
      taux_global: (matinCap + soirCap) > 0 ? Math.round(((matinUsagers + soirUsagers) / (matinCap + soirCap)) * 100) : 0,
      jours_travailles: daysData.filter(d => d.journee.total_usagers > 0).length,
      jours_feries: daysData.filter(d => d.is_ferie).length,
    };
  }, [daysData]);

  async function handleSaveDraft() {
    setSaving(true);
    try {
      const titre = `${selectedLigne?.code || ''} - Statistiques ${MONTHS_FR[month - 1]} ${year} - ${clientNom}`;
      await supabase.from('data_report_client_consolidated').insert({
        client_id: clientId,
        ligne_id: selectedLigneId || null,
        mois: `${year}-${month.toString().padStart(2, '0')}-01`,
        titre,
        statut: 'brouillon',
        data_matin: daysData.map(d => ({ date: d.date, ...d.matin })),
        data_apres_midi: daysData.map(d => ({ date: d.date, ...d.soir })),
        data_journee: daysData.map(d => ({ date: d.date, label: d.label, jour_semaine: d.jour_semaine, is_ferie: d.is_ferie, ferie_intitule: d.ferie_intitule, ...d.journee })),
        data_trajets_matin: daysData.flatMap(d => d.matin.trips.map(t => ({ date: d.date, ...t }))),
        data_trajets_aprem: daysData.flatMap(d => d.soir.trips.map(t => ({ date: d.date, ...t }))),
        metadata: { capacite_matin: capaciteMatin, capacite_aprem: capaciteAprem, ligne_code: selectedLigne?.code, ligne_depart: selectedLigne?.depart, ligne_arrivee: selectedLigne?.arrivee, weekly: weeklySummaries, monthly: monthlySummary },
        user_id: user.id,
      });
      setSaved(true);
      onSaved();
    } finally {
      setSaving(false);
    }
  }

  async function handleFinalizeReport() {
    setSaving(true);
    try {
      const titre = `${selectedLigne?.code || ''} - Statistiques ${MONTHS_FR[month - 1]} ${year} - ${clientNom}`;
      await supabase.from('data_report_client_consolidated').insert({
        client_id: clientId,
        ligne_id: selectedLigneId || null,
        mois: `${year}-${month.toString().padStart(2, '0')}-01`,
        titre,
        statut: 'finalise',
        data_matin: daysData.map(d => ({ date: d.date, ...d.matin })),
        data_apres_midi: daysData.map(d => ({ date: d.date, ...d.soir })),
        data_journee: daysData.map(d => ({ date: d.date, label: d.label, jour_semaine: d.jour_semaine, is_ferie: d.is_ferie, ferie_intitule: d.ferie_intitule, ...d.journee })),
        data_trajets_matin: daysData.flatMap(d => d.matin.trips.map(t => ({ date: d.date, ...t }))),
        data_trajets_aprem: daysData.flatMap(d => d.soir.trips.map(t => ({ date: d.date, ...t }))),
        metadata: { capacite_matin: capaciteMatin, capacite_aprem: capaciteAprem, ligne_code: selectedLigne?.code, ligne_depart: selectedLigne?.depart, ligne_arrivee: selectedLigne?.arrivee, weekly: weeklySummaries, monthly: monthlySummary },
        user_id: user.id,
      });
      setSaved(true);
      onSaved();
    } finally {
      setSaving(false);
    }
  }

  function renderDayTable(days: DayData[], title: string) {
    return (
      <div className="mb-6">
        <h4 className="text-xs font-bold text-red-700 uppercase mb-2">{title}</h4>
        <div className="overflow-x-auto border border-gray-200 rounded-lg">
          <table className="w-full text-[11px]">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-200">
                <th className="px-2 py-2 text-left font-semibold text-gray-600 min-w-[140px]">Jour</th>
                <th className="px-2 py-2 text-center font-semibold text-gray-600">H. depart</th>
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
                    <td className="px-2 py-1.5 text-center text-gray-600">
                      {trips.length > 0 ? trips[0].heure_depart : '--:--'}
                      {trips.length > 1 && <span className="text-[9px] text-gray-400 ml-0.5">+{trips.length - 1}</span>}
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
                    <td className={`px-2 py-1.5 text-center font-bold ${data.taux_frequentation >= 95 ? 'text-red-700' : data.taux_frequentation >= 80 ? 'text-orange-700' : 'text-gray-700'}`}>
                      {data.taux_frequentation}%
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

  function renderWeeklyTable() {
    return (
      <div className="mb-6">
        <h4 className="text-xs font-bold text-red-700 uppercase mb-2">Synthese hebdomadaire</h4>
        <div className="overflow-x-auto border border-gray-200 rounded-lg">
          <table className="w-full text-[11px]">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-200">
                <th className="px-3 py-2 text-left font-semibold text-gray-600">Semaine</th>
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
                  <td className="px-3 py-2 text-center text-gray-700">{w.matin.usagers}</td>
                  <td className={`px-3 py-2 text-center font-bold ${w.matin.taux >= 95 ? 'text-red-700' : 'text-gray-700'}`}>{w.matin.taux}%</td>
                  <td className="px-3 py-2 text-center text-gray-600">{w.matin.temps_moyen}</td>
                  <td className="px-3 py-2 text-center text-gray-400">{w.matin.ecart_type}</td>
                  <td className="px-3 py-2 text-center text-gray-700">{w.soir.usagers}</td>
                  <td className={`px-3 py-2 text-center font-bold ${w.soir.taux >= 85 ? 'text-red-700' : 'text-gray-700'}`}>{w.soir.taux}%</td>
                  <td className="px-3 py-2 text-center text-gray-600">{w.soir.temps_moyen}</td>
                  <td className="px-3 py-2 text-center text-gray-400">{w.soir.ecart_type}</td>
                  <td className="px-3 py-2 text-center font-bold text-gray-900 bg-gray-50">{w.total_usagers}</td>
                  <td className={`px-3 py-2 text-center font-bold bg-gray-50 ${w.taux_global >= 90 ? 'text-red-700' : 'text-gray-700'}`}>{w.taux_global}%</td>
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
              <div className="flex justify-between"><span className="text-gray-400">Taux global</span><span className="font-bold text-white">{monthlySummary.taux_global}%</span></div>
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
                    <label className="block text-xs font-semibold text-gray-500 uppercase mb-1.5"><Users className="w-3 h-3 inline mr-1" />Capacite Matin</label>
                    <input type="number" value={capaciteMatin} onChange={(e) => setCapaciteMatin(parseInt(e.target.value) || 0)} className="w-full px-3 py-2.5 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-amber-500 outline-none" />
                    <p className="text-[10px] text-gray-400 mt-1">Calculee: {ligneChauffeurs.reduce((s, c) => s + (c.vehicule_places || 0), 0)} places</p>
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-gray-500 uppercase mb-1.5"><Users className="w-3 h-3 inline mr-1" />Capacite Apres-midi</label>
                    <input type="number" value={capaciteAprem} onChange={(e) => setCapaciteAprem(parseInt(e.target.value) || 0)} className="w-full px-3 py-2.5 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-amber-500 outline-none" />
                    <p className="text-[10px] text-gray-400 mt-1">Ajustable si rotation differente l'AM</p>
                  </div>
                </div>
              </div>
              <div className="bg-blue-50 border border-blue-200 rounded-xl p-4">
                <p className="text-sm text-blue-800">
                  Donnees generees par jour: <b>heure de depart</b>, <b>nbre usagers</b>, <b>taux frequentation</b>, <b>temps moyen</b>, <b>ecart-type</b>.
                  Vue par jour type (semaine/samedi/dimanche), par semaine, et mensuel.
                  Jours feries indiques. Chiffres <span className="text-blue-700 font-bold">bleus</span> = modifiables.
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
                  {([['semaine', 'Jours semaine'], ['samedi', 'Samedis'], ['dimanche', 'Dimanches'], ['feries', 'Jours feries'], ['hebdo', 'Par semaine'], ['mensuel', 'Mensuel']] as [string, string][]).map(([key, label]) => (
                    <button key={key} onClick={() => setActiveTab(key as typeof activeTab)} className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${activeTab === key ? 'bg-amber-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}>
                      {label}
                      {key === 'feries' && feriesData.length > 0 && <span className="ml-1 text-[9px]">({feriesData.length})</span>}
                    </button>
                  ))}
                </div>
                {/* Period toggle */}
                {!['hebdo', 'mensuel'].includes(activeTab) && (
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
              {activeTab === 'dimanche' && renderDayTable(sundayData, `Dimanches - ${activePeriod === 'matin' ? 'Matin' : activePeriod === 'soir' ? 'Apres-midi' : 'Journee'}`)}
              {activeTab === 'feries' && (feriesData.length > 0 ? renderDayTable(feriesData, 'Jours feries') : <p className="text-sm text-gray-400 italic p-4">Aucun jour ferie sur ce mois</p>)}
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
