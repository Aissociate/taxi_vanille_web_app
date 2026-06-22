import { useEffect, useState, useMemo, useRef, useCallback } from 'react';
import { supabase } from '../lib/supabase';
import { ChevronLeft, ChevronRight, Plus, Copy, Printer, X, RefreshCw, FileEdit, Send, Shield, Download, Upload, UserCheck, Trash2, CheckSquare } from 'lucide-react';
import type { User } from '@supabase/supabase-js';

type ViewMode = 'jour' | 'semaine' | 'mois';
type PeriodeFilter = 'all' | 'matin' | 'apres_midi' | 'astreinte';

interface Course {
  id: string;
  date_heure: string;
  depart: string;
  arrivee: string;
  statut_planification: string;
  statut_realisation: string;
  montant: number;
  notes: string;
  chauffeur_id: string | null;
  client_id: string | null;
  ligne_id: string | null;
  coordinateur_id: string | null;
  periode: string;
  duree_minutes: number;
  is_astreinte: boolean;
  is_brouillon: boolean;
}

interface Chauffeur {
  id: string;
  code: string;
  nom: string;
  prenom: string;
  ligne_id: string | null;
  is_coordinateur: boolean;
}

interface Ligne {
  id: string;
  code: string;
  nom: string;
  depart: string;
  arrivee: string;
  couleur: string;
}

interface Client {
  id: string;
  nom: string;
}

interface Astreinte {
  id: string;
  chauffeur_id: string;
  ligne_id: string;
  coordinateur_id: string | null;
  date_debut: string;
  date_fin: string;
  is_brouillon: boolean;
  notes: string;
}

// Créneau de coordination : un coordinateur affecté à une ligne sur une plage
// horaire, indépendamment de tout chauffeur. Sert à filtrer la vue mobile du
// coordinateur (il ne voit que les courses de ses créneaux : ligne + horaire).
interface CoordCreneau {
  id: string;
  coordinateur_id: string;
  ligne_id: string;
  date_debut: string;
  date_fin: string;
  is_brouillon: boolean;
  notes: string;
}

interface PlanningPageProps {
  user: User;
}

const HOURS = Array.from({ length: 20 }, (_, i) => i + 4);
const TOTAL_HOURS = 20;
const START_HOUR = 4;

function toLocalDateStr(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function getTimezoneOffsetStr(d: Date): string {
  const offset = -d.getTimezoneOffset();
  const sign = offset >= 0 ? '+' : '-';
  const absOffset = Math.abs(offset);
  const h = String(Math.floor(absOffset / 60)).padStart(2, '0');
  const m = String(absOffset % 60).padStart(2, '0');
  return `${sign}${h}:${m}`;
}

function toLocalDateTimeStr(d: Date): string {
  const date = toLocalDateStr(d);
  const h = String(d.getHours()).padStart(2, '0');
  const min = String(d.getMinutes()).padStart(2, '0');
  return `${date}T${h}:${min}`;
}

function toLocalDateTimeStrTz(d: Date): string {
  return `${toLocalDateTimeStr(d)}:00${getTimezoneOffsetStr(d)}`;
}

function formatDateFr(d: Date): string {
  const days = ['Dim', 'Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam'];
  const months = ['Jan', 'Fev', 'Mar', 'Avr', 'Mai', 'Juin', 'Juil', 'Aout', 'Sep', 'Oct', 'Nov', 'Dec'];
  return `${days[d.getDay()]} ${d.getDate()} ${months[d.getMonth()]} ${d.getFullYear()}`;
}

function getMonday(d: Date): Date {
  const date = new Date(d);
  const day = date.getDay() || 7;
  date.setDate(date.getDate() - day + 1);
  date.setHours(0, 0, 0, 0);
  return date;
}

function isSameDay(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

function parseCourseDate(dateStr: string): Date {
  if (dateStr.endsWith('Z') || dateStr.includes('+')) {
    return new Date(dateStr);
  }
  return new Date(dateStr.replace('T', ' '));
}

export function PlanningPage({ user }: PlanningPageProps) {
  const [view, setView] = useState<ViewMode>('jour');
  const [currentDate, setCurrentDate] = useState(new Date());
  const [courses, setCourses] = useState<Course[]>([]);
  const [chauffeurs, setChauffeurs] = useState<Chauffeur[]>([]);
  const [lignes, setLignes] = useState<Ligne[]>([]);
  const [ligneArrets, setLigneArrets] = useState<{ ligne_id: string; nom: string; ordre: number }[]>([]);
  const [clients, setClients] = useState<Client[]>([]);
  const [astreintes, setAstreintes] = useState<Astreinte[]>([]);
  const [lineFilter, setLineFilter] = useState<string>('all');
  const [chauffeurFilter, setChauffeurFilter] = useState<string>('all');
  const [periodeFilter, setPeriodeFilter] = useState<PeriodeFilter>('all');
  const [showForm, setShowForm] = useState(false);
  const [editingCourse, setEditingCourse] = useState<Course | null>(null);
  const [form, setForm] = useState({
    date_heure: '',
    depart: '',
    arrivee: '',
    statut_planification: 'planifie',
    statut_realisation: 'programme',
    montant: 0,
    notes: '',
    chauffeur_id: '',
    client_id: '',
    ligne_id: '',
    coordinateur_id: '',
    periode: 'matin',
    duree_minutes: 60,
    is_astreinte: false,
    is_brouillon: false,
  });

  // Draft mode
  const [draftMode, setDraftMode] = useState(false);

  // Astreinte period
  const [showAstreinte, setShowAstreinte] = useState(false);
  const [astreinteForm, setAstreinteForm] = useState({
    chauffeur_id: '',
    ligne_id: '',
    coordinateur_id: '',
    date_debut: '',
    date_fin: '',
    is_brouillon: false,
    notes: '',
  });

  // Créneaux de coordination (planning coordinateur indépendant)
  const [coordCreneaux, setCoordCreneaux] = useState<CoordCreneau[]>([]);
  const [showCoord, setShowCoord] = useState(false);
  const [editingCoord, setEditingCoord] = useState<CoordCreneau | null>(null);
  const [coordForm, setCoordForm] = useState({
    coordinateur_id: '',
    ligne_id: '',
    date_debut: '',
    date_fin: '',
    is_brouillon: false,
    notes: '',
  });

  // Replacement state
  const [showReplace, setShowReplace] = useState(false);
  const [replaceChauffeurId, setReplaceChauffeurId] = useState('');

  // Selection en lot (suppression par cases a cocher)
  const [selectMode, setSelectMode] = useState(false);
  const [selectedCourseIds, setSelectedCourseIds] = useState<Set<string>>(new Set());

  // Resize state
  const [resizingId, setResizingId] = useState<string | null>(null);
  const resizeRef = useRef<{ startX: number; startWidth: number; courseId: string; containerWidth: number } | null>(null);

  useEffect(() => {
    loadRefs();
    const savedFilter = sessionStorage.getItem('planning_chauffeur_filter');
    if (savedFilter) {
      setChauffeurFilter(savedFilter);
      sessionStorage.removeItem('planning_chauffeur_filter');
    }
  }, []);
  useEffect(() => { loadCourses(); loadAstreintes(); loadCoordCreneaux(); }, [currentDate, view]);

  async function loadRefs() {
    const [ch, li, cl, ar] = await Promise.all([
      supabase.from('chauffeurs').select('id, code, nom, prenom, ligne_id, is_coordinateur').order('code, nom'),
      supabase.from('lignes').select('id, code, nom, depart, arrivee, couleur').eq('active', true).order('code'),
      supabase.from('clients').select('id, nom'),
      supabase.from('ligne_arrets').select('ligne_id, nom, ordre').order('ordre', { ascending: true }),
    ]);
    if (ch.data) setChauffeurs(ch.data);
    if (li.data) setLignes(li.data);
    if (cl.data) setClients(cl.data);
    if (ar.data) setLigneArrets(ar.data);
  }

  function getDateRange(): { from: string; to: string } {
    const d = new Date(currentDate);
    d.setHours(0, 0, 0, 0);
    let from: Date, to: Date;
    if (view === 'jour') {
      from = new Date(d);
      to = new Date(d);
      to.setDate(to.getDate() + 1);
    } else if (view === 'semaine') {
      from = getMonday(d);
      to = new Date(from);
      to.setDate(to.getDate() + 7);
    } else {
      from = new Date(d.getFullYear(), d.getMonth(), 1);
      to = new Date(d.getFullYear(), d.getMonth() + 1, 1);
    }
    return { from: toLocalDateStr(from) + 'T00:00:00', to: toLocalDateStr(to) + 'T00:00:00' };
  }

  async function loadCourses() {
    const { from, to } = getDateRange();
    const { data } = await supabase
      .from('courses')
      .select('*')
      .gte('date_heure', from)
      .lt('date_heure', to)
      .order('date_heure');
    if (data) setCourses(data);
  }

  async function loadAstreintes() {
    const { from, to } = getDateRange();
    const { data } = await supabase
      .from('astreintes')
      .select('id, chauffeur_id, ligne_id, coordinateur_id, date_debut, date_fin, is_brouillon, notes')
      .lte('date_debut', to)
      .gte('date_fin', from);
    if (data) setAstreintes(data);
  }

  async function loadCoordCreneaux() {
    const { from, to } = getDateRange();
    const { data } = await supabase
      .from('coordinateur_creneaux')
      .select('id, coordinateur_id, ligne_id, date_debut, date_fin, is_brouillon, notes')
      .lte('date_debut', to)
      .gte('date_fin', from);
    if (data) setCoordCreneaux(data);
  }

  async function logAction(action: string, entite: string, entiteId: string | null, details: string, oldData?: Record<string, unknown> | null, newData?: Record<string, unknown> | null) {
    await supabase.from('logs').insert({
      action,
      entite,
      entite_id: entiteId,
      details,
      user_id: user.id,
      user_email: user.email || '',
      old_data: oldData || null,
      new_data: newData || null,
    });
  }

  function navigate(dir: number) {
    const d = new Date(currentDate);
    if (view === 'jour') d.setDate(d.getDate() + dir);
    else if (view === 'semaine') d.setDate(d.getDate() + dir * 7);
    else d.setMonth(d.getMonth() + dir);
    setCurrentDate(d);
  }

  function goToday() { setCurrentDate(new Date()); }

  // Duplication modal state
  const [showDuplicate, setShowDuplicate] = useState(false);
  const [dupDays, setDupDays] = useState({ lun: true, mar: true, mer: true, jeu: true, ven: true, sam: false, dim: false, ferie: false });
  const [dupWeeks, setDupWeeks] = useState(1);
  const [dupLoading, setDupLoading] = useState(false);
  const [joursFeries, setJoursFeries] = useState<string[]>([]);
  const [dupSelectedIds, setDupSelectedIds] = useState<Set<string>>(new Set());
  const [dupChauffeurFilter, setDupChauffeurFilter] = useState('');
  const [dupTargetDates, setDupTargetDates] = useState<string[]>([]);

  async function loadJoursFeries() {
    const { data } = await supabase.from('jours_feries').select('date, recurrent');
    if (data) {
      const dates: string[] = [];
      data.forEach(jf => {
        if (jf.recurrent) {
          const base = jf.date as string;
          const yNow = new Date().getFullYear();
          for (let y = yNow - 1; y <= yNow + 5; y++) {
            dates.push(`${y}-${base.slice(5)}`);
          }
        } else {
          dates.push(jf.date as string);
        }
      });
      setJoursFeries(dates);
    }
  }

  function openDuplicate() {
    loadJoursFeries();
    setDupDays({ lun: true, mar: true, mer: true, jeu: true, ven: true, sam: false, dim: false, ferie: false });
    setDupWeeks(1);
    setDupChauffeurFilter('');
    setDupTargetDates([]);
    // Pre-select all duplicable courses in current view
    const duplicable = getDuplicableCourses();
    setDupSelectedIds(new Set(duplicable.map(c => c.id)));
    setShowDuplicate(true);
  }

  function getDuplicableCourses(): Course[] {
    const monday = getMonday(currentDate);
    if (view === 'jour') {
      return courses.filter(c => isDuplicable(c) && isSameDay(parseCourseDate(c.date_heure), currentDate));
    } else {
      const sunday = new Date(monday);
      sunday.setDate(sunday.getDate() + 7);
      return courses.filter(c => {
        if (!isDuplicable(c)) return false;
        const d = parseCourseDate(c.date_heure);
        return d >= monday && d < sunday;
      });
    }
  }

  function isDayAllowed(date: Date, feries: string[]): boolean {
    const dow = date.getDay();
    const dateStr = toLocalDateStr(date);
    const isFerie = feries.includes(dateStr);

    if (isFerie && !dupDays.ferie) return false;
    if (isFerie && dupDays.ferie) return true;

    if (dow === 1 && dupDays.lun) return true;
    if (dow === 2 && dupDays.mar) return true;
    if (dow === 3 && dupDays.mer) return true;
    if (dow === 4 && dupDays.jeu) return true;
    if (dow === 5 && dupDays.ven) return true;
    if (dow === 6 && dupDays.sam) return true;
    if (dow === 0 && dupDays.dim) return true;
    return false;
  }

  // Replaced/cancelled courses must not be duplicated: they would resurrect
  // ghost copies (the replaced original AND its replacement) on every target day.
  function isDuplicable(c: Course): boolean {
    return !['remplace', 'annule', 'incident'].includes(c.statut_realisation || '');
  }

  async function handleDuplicate() {
    if (dupSelectedIds.size === 0) { alert('Selectionnez au moins une course'); return; }
    setDupLoading(true);
    try {
      const sourceCourses = getDuplicableCourses().filter(c => dupSelectedIds.has(c.id));
      if (sourceCourses.length === 0) { alert('Aucune course selectionnee'); setDupLoading(false); return; }

      const newCourses: Array<Record<string, unknown>> = [];

      if (dupTargetDates.length > 0) {
        dupTargetDates.forEach(targetDateStr => {
          const targetDate = new Date(targetDateStr + 'T00:00:00');
          sourceCourses.forEach(c => {
            const srcDate = parseCourseDate(c.date_heure);
            const dupDate = new Date(targetDate);
            dupDate.setHours(srcDate.getHours(), srcDate.getMinutes(), 0, 0);
            newCourses.push({
              date_heure: toLocalDateTimeStrTz(dupDate),
              depart: c.depart, arrivee: c.arrivee,
              statut_planification: 'planifie', statut_realisation: 'programme',
              montant: c.montant, notes: c.notes, chauffeur_id: c.chauffeur_id,
              coordinateur_id: null, // gere par creneau coordinateur, non recopie a la duplication
              client_id: c.client_id, ligne_id: c.ligne_id, user_id: user.id,
              periode: c.periode, duree_minutes: c.duree_minutes,
              is_astreinte: c.is_astreinte || false,
              is_brouillon: true,
            });
          });
        });
      } else {
        const startDate = new Date(currentDate);
        startDate.setHours(0, 0, 0, 0);

        if (view === 'jour') {
          for (let dayOffset = 1; dayOffset <= dupWeeks * 7; dayOffset++) {
            const targetDate = new Date(startDate);
            targetDate.setDate(targetDate.getDate() + dayOffset);
            if (!isDayAllowed(targetDate, joursFeries)) continue;
            sourceCourses.forEach(c => {
              const srcDate = parseCourseDate(c.date_heure);
              const dupDate = new Date(targetDate);
              dupDate.setHours(srcDate.getHours(), srcDate.getMinutes(), 0, 0);
              newCourses.push({
                date_heure: toLocalDateTimeStrTz(dupDate),
                depart: c.depart, arrivee: c.arrivee,
                statut_planification: 'planifie', statut_realisation: 'programme',
                montant: c.montant, notes: c.notes, chauffeur_id: c.chauffeur_id,
                coordinateur_id: null, // gere par creneau coordinateur, non recopie a la duplication
                client_id: c.client_id, ligne_id: c.ligne_id, user_id: user.id,
                periode: c.periode, duree_minutes: c.duree_minutes,
                is_astreinte: c.is_astreinte || false,
                is_brouillon: true,
              });
            });
          }
        } else {
          for (let weekOffset = 1; weekOffset <= dupWeeks; weekOffset++) {
            sourceCourses.forEach(c => {
              const sourceDate = parseCourseDate(c.date_heure);
              const targetDate = new Date(sourceDate);
              targetDate.setDate(targetDate.getDate() + (weekOffset * 7));
              if (!isDayAllowed(targetDate, joursFeries)) return;
              newCourses.push({
                date_heure: toLocalDateTimeStrTz(targetDate),
                depart: c.depart, arrivee: c.arrivee,
                statut_planification: 'planifie', statut_realisation: 'programme',
                montant: c.montant, notes: c.notes, chauffeur_id: c.chauffeur_id,
                coordinateur_id: null, // gere par creneau coordinateur, non recopie a la duplication
                client_id: c.client_id, ligne_id: c.ligne_id, user_id: user.id,
                periode: c.periode, duree_minutes: c.duree_minutes,
                is_astreinte: c.is_astreinte || false,
                is_brouillon: true,
              });
            });
          }
        }
      }

      if (newCourses.length === 0) { alert('Aucun jour cible ne correspond aux criteres'); setDupLoading(false); return; }

      if (!confirm(`${newCourses.length} course(s) vont etre creees en brouillon. Continuer ?`)) {
        setDupLoading(false);
        return;
      }

      let inserted = 0;
      for (let i = 0; i < newCourses.length; i += 50) {
        const batch = newCourses.slice(i, i + 50);
        const { error } = await supabase.from('courses').insert(batch);
        if (error) {
          alert(`Erreur lors de la duplication : ${inserted} course(s) creee(s) sur ${newCourses.length} avant l'echec.\n${error.message}`);
          break;
        }
        inserted += batch.length;
      }

      if (inserted > 0) {
        alert(`${inserted} course(s) dupliquee(s) en brouillon avec succes.`);
        await logAction('duplicate', 'courses', null, `Duplication: ${sourceCourses.length} course(s) selectionnee(s) → ${inserted} course(s) creees en brouillon`, null, { count: inserted });
      }
      setShowDuplicate(false);
      loadCourses();
    } finally {
      setDupLoading(false);
    }
  }

  function handleExportCSV() {
    const rows: string[][] = [['Date', 'Heure', 'Chauffeur', 'Ligne', 'Depart', 'Arrivee', 'Periode', 'Duree (min)', 'Statut planif.', 'Statut real.', 'Montant', 'Notes']];
    const sorted = [...filteredCourses].sort((a, b) => a.date_heure.localeCompare(b.date_heure));
    sorted.forEach(c => {
      const d = parseCourseDate(c.date_heure);
      const ch = chauffeurs.find(x => x.id === c.chauffeur_id);
      const li = lignes.find(x => x.id === c.ligne_id);
      rows.push([
        toLocalDateStr(d),
        d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' }),
        ch ? `${ch.code} ${ch.prenom} ${ch.nom}` : '',
        li ? li.code : '',
        c.depart,
        c.arrivee,
        c.periode || '',
        String(c.duree_minutes || ''),
        c.statut_planification || '',
        c.statut_realisation || '',
        String(c.montant || 0),
        (c.notes || '').replace(/"/g, '""'),
      ]);
    });
    const csv = rows.map(r => r.map(cell => `"${cell}"`).join(';')).join('\n');
    const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `planning_${toLocalDateStr(currentDate)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  const importInputRef = useRef<HTMLInputElement>(null);

  async function handleImportCSV(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const text = await file.text();
    const lines = text.split('\n').filter(l => l.trim());
    if (lines.length < 2) { alert('Fichier vide ou invalide'); return; }

    const rows = lines.slice(1).map(line => {
      const cols = line.split(';').map(c => c.replace(/^"|"$/g, '').trim());
      return cols;
    });

    const newCourses: Array<Record<string, unknown>> = [];
    for (const cols of rows) {
      if (cols.length < 6) continue;
      const [date, heure, chauffeurStr, ligneCode, depart, arrivee, periode, duree] = cols;
      if (!date || !heure) continue;

      const dateHeure = `${date}T${heure}:00${getTimezoneOffsetStr(new Date())}`;
      const ch = chauffeurs.find(c => chauffeurStr && (c.code === chauffeurStr.trim() || `${c.code} ${c.prenom} ${c.nom}` === chauffeurStr.trim()));
      const li = lignes.find(l => ligneCode && l.code === ligneCode.trim());

      newCourses.push({
        date_heure: dateHeure,
        depart: depart || li?.depart || '',
        arrivee: arrivee || li?.arrivee || '',
        chauffeur_id: ch?.id || null,
        ligne_id: li?.id || null,
        statut_planification: 'planifie',
        statut_realisation: 'programme',
        periode: periode || 'matin',
        duree_minutes: parseInt(duree) || 60,
        montant: 0,
        notes: '',
        user_id: user.id,
        is_brouillon: true,
      });
    }

    if (newCourses.length === 0) { alert('Aucune course valide trouvee dans le fichier'); return; }
    if (!confirm(`Importer ${newCourses.length} course(s) en mode brouillon ?`)) return;

    const { error } = await supabase.from('courses').insert(newCourses);
    if (error) { alert('Erreur import: ' + error.message); return; }
    alert(`${newCourses.length} course(s) importee(s) en brouillon`);
    loadCourses();
    if (importInputRef.current) importInputRef.current.value = '';
  }

  function openCreate(chauffeurId?: string, hour?: number) {
    const d = new Date(currentDate);
    if (hour !== undefined) d.setHours(hour, 0, 0, 0);
    else d.setHours(8, 0, 0, 0);
    const chauffeur = chauffeurId ? chauffeurs.find(c => c.id === chauffeurId) : null;
    const ligne = chauffeur?.ligne_id ? lignes.find(l => l.id === chauffeur.ligne_id) : null;

    const saved = localStorage.getItem('planning_last_course');
    const last = saved ? JSON.parse(saved) : null;

    setForm({
      date_heure: toLocalDateTimeStr(d),
      depart: ligne?.depart || '',
      arrivee: ligne?.arrivee || '',
      statut_planification: 'planifie',
      statut_realisation: 'programme',
      montant: 0,
      notes: '',
      chauffeur_id: chauffeurId || (last?.chauffeur_id || ''),
      client_id: last?.client_id || '',
      ligne_id: chauffeur?.ligne_id || (last?.ligne_id || ''),
      coordinateur_id: last?.coordinateur_id || '',
      periode: (hour !== undefined && hour >= 12) ? 'apres_midi' : (last?.periode || 'matin'),
      duree_minutes: last?.duree_minutes || 60,
      is_astreinte: false,
      is_brouillon: draftMode,
    });
    setEditingCourse(null);
    setShowForm(true);
  }

  function openEdit(course: Course) {
    const d = parseCourseDate(course.date_heure);
    setForm({
      date_heure: toLocalDateTimeStr(d),
      depart: course.depart,
      arrivee: course.arrivee,
      statut_planification: course.statut_planification || 'planifie',
      statut_realisation: course.statut_realisation || 'en_cours',
      montant: course.montant,
      notes: course.notes,
      chauffeur_id: course.chauffeur_id || '',
      client_id: course.client_id || '',
      ligne_id: course.ligne_id || '',
      coordinateur_id: course.coordinateur_id || '',
      periode: course.periode || 'matin',
      duree_minutes: course.duree_minutes || 60,
      is_astreinte: course.is_astreinte || false,
      is_brouillon: course.is_brouillon || false,
    });
    setEditingCourse(course);
    setShowForm(true);
  }

  // Points selectionnables (arrets + terminus) de la ligne choisie dans le formulaire
  const arretOptions = useMemo(() => {
    const points: string[] = [];
    const ligne = lignes.find(l => l.id === form.ligne_id);
    if (ligne) {
      if (ligne.depart) points.push(ligne.depart);
      if (ligne.arrivee) points.push(ligne.arrivee);
    }
    ligneArrets
      .filter(a => a.ligne_id === form.ligne_id && a.nom)
      .forEach(a => points.push(a.nom));
    return Array.from(new Set(points));
  }, [form.ligne_id, ligneArrets, lignes]);

  async function publishDrafts() {
    const { from, to } = getDateRange();
    const draftIds = courses.filter(c => c.is_brouillon).map(c => c.id);
    if (draftIds.length === 0) return;
    if (!confirm(`Publier ${draftIds.length} brouillon(s) pour cette periode ?`)) return;
    await supabase.from('courses').update({ is_brouillon: false }).in('id', draftIds);
    await logAction('publish', 'courses', null, `Publication de ${draftIds.length} brouillon(s)`, null, { ids: draftIds });
    loadCourses();
  }

  const [editingAstreinte, setEditingAstreinte] = useState<Astreinte | null>(null);

  function openAstreinteForm() {
    const dateStr = toLocalDateStr(currentDate);
    setAstreinteForm({
      chauffeur_id: '',
      ligne_id: '',
      coordinateur_id: '',
      date_debut: `${dateStr}T18:00`,
      date_fin: `${dateStr}T23:59`,
      is_brouillon: draftMode,
      notes: '',
    });
    setEditingAstreinte(null);
    setShowAstreinte(true);
  }

  function openAstreinteEdit(astreinte: Astreinte) {
    const debut = new Date(astreinte.date_debut);
    const fin = new Date(astreinte.date_fin);
    setAstreinteForm({
      chauffeur_id: astreinte.chauffeur_id,
      ligne_id: astreinte.ligne_id,
      coordinateur_id: astreinte.coordinateur_id || '',
      date_debut: toLocalDateTimeStr(debut),
      date_fin: toLocalDateTimeStr(fin),
      is_brouillon: astreinte.is_brouillon,
      notes: astreinte.notes || '',
    });
    setEditingAstreinte(astreinte);
    setShowAstreinte(true);
  }

  async function handleAstreinteSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!astreinteForm.chauffeur_id || !astreinteForm.ligne_id) return;
    const payload = {
      chauffeur_id: astreinteForm.chauffeur_id,
      ligne_id: astreinteForm.ligne_id,
      coordinateur_id: astreinteForm.coordinateur_id || null,
      date_debut: toLocalDateTimeStrTz(new Date(astreinteForm.date_debut)),
      date_fin: toLocalDateTimeStrTz(new Date(astreinteForm.date_fin)),
      is_brouillon: astreinteForm.is_brouillon,
      notes: astreinteForm.notes,
      user_id: user.id,
    };
    if (editingAstreinte) {
      await supabase.from('astreintes').update(payload).eq('id', editingAstreinte.id);
    } else {
      await supabase.from('astreintes').insert(payload);
    }
    setShowAstreinte(false);
    setEditingAstreinte(null);
    loadAstreintes();
  }

  async function handleDeleteAstreinte() {
    if (!editingAstreinte) return;
    if (!confirm('Supprimer cette astreinte ?')) return;
    await supabase.from('astreintes').delete().eq('id', editingAstreinte.id);
    setShowAstreinte(false);
    setEditingAstreinte(null);
    loadAstreintes();
  }

  function openCoordForm() {
    const dateStr = toLocalDateStr(currentDate);
    setCoordForm({
      coordinateur_id: '',
      ligne_id: '',
      date_debut: `${dateStr}T06:00`,
      date_fin: `${dateStr}T12:00`,
      is_brouillon: draftMode,
      notes: '',
    });
    setEditingCoord(null);
    setShowCoord(true);
  }

  function openCoordEdit(creneau: CoordCreneau) {
    setCoordForm({
      coordinateur_id: creneau.coordinateur_id,
      ligne_id: creneau.ligne_id,
      date_debut: toLocalDateTimeStr(new Date(creneau.date_debut)),
      date_fin: toLocalDateTimeStr(new Date(creneau.date_fin)),
      is_brouillon: creneau.is_brouillon,
      notes: creneau.notes || '',
    });
    setEditingCoord(creneau);
    setShowCoord(true);
  }

  async function handleCoordSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!coordForm.coordinateur_id || !coordForm.ligne_id) return;
    const payload = {
      coordinateur_id: coordForm.coordinateur_id,
      ligne_id: coordForm.ligne_id,
      date_debut: toLocalDateTimeStrTz(new Date(coordForm.date_debut)),
      date_fin: toLocalDateTimeStrTz(new Date(coordForm.date_fin)),
      is_brouillon: coordForm.is_brouillon,
      notes: coordForm.notes,
      user_id: user.id,
    };
    if (editingCoord) {
      await supabase.from('coordinateur_creneaux').update(payload).eq('id', editingCoord.id);
    } else {
      await supabase.from('coordinateur_creneaux').insert(payload);
    }
    setShowCoord(false);
    setEditingCoord(null);
    loadCoordCreneaux();
  }

  async function handleDeleteCoord() {
    if (!editingCoord) return;
    if (!confirm('Supprimer ce creneau de coordination ?')) return;
    await supabase.from('coordinateur_creneaux').delete().eq('id', editingCoord.id);
    setShowCoord(false);
    setEditingCoord(null);
    loadCoordCreneaux();
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const formDate = new Date(form.date_heure);
    const payload = {
      ...form,
      date_heure: toLocalDateTimeStrTz(formDate),
      chauffeur_id: form.chauffeur_id || null,
      client_id: form.client_id || null,
      ligne_id: form.ligne_id || null,
      coordinateur_id: form.coordinateur_id || null,
      user_id: user.id,
    };
    if (editingCourse) {
      await supabase.from('courses').update(payload).eq('id', editingCourse.id);
      const chauffeur = chauffeurs.find(c => c.id === form.chauffeur_id);
      await logAction('update', 'courses', editingCourse.id, `Course modifiee: ${form.depart} → ${form.arrivee}${chauffeur ? ` (${chauffeur.prenom} ${chauffeur.nom})` : ''}`, editingCourse as unknown as Record<string, unknown>, payload);
    } else {
      const { data } = await supabase.from('courses').insert(payload).select('id').maybeSingle();
      const chauffeur = chauffeurs.find(c => c.id === form.chauffeur_id);
      await logAction('create', 'courses', data?.id || null, `Course creee: ${form.depart} → ${form.arrivee}${chauffeur ? ` (${chauffeur.prenom} ${chauffeur.nom})` : ''}`, null, payload);
      localStorage.setItem('planning_last_course', JSON.stringify({
        chauffeur_id: form.chauffeur_id,
        client_id: form.client_id,
        ligne_id: form.ligne_id,
        coordinateur_id: form.coordinateur_id,
        periode: form.periode,
        duree_minutes: form.duree_minutes,
      }));
    }
    setShowForm(false);
    loadCourses();
  }

  async function handleDeleteCourse() {
    if (!editingCourse) return;
    if (!confirm('Supprimer cette course ?')) return;
    // On controle le resultat: sans ca, un echec RLS (course appartenant a un
    // autre compte) renvoyait un succes avec 0 ligne supprimee, la modale se
    // fermait et la course reapparaissait sans aucun message.
    const { error, count } = await supabase
      .from('courses')
      .delete({ count: 'exact' })
      .eq('id', editingCourse.id);
    if (error) { alert(`Suppression impossible : ${error.message}`); return; }
    if (!count) { alert('Suppression impossible : course introuvable ou droits insuffisants.'); return; }
    const chauffeur = chauffeurs.find(c => c.id === editingCourse.chauffeur_id);
    await logAction('delete', 'courses', editingCourse.id, `Course supprimee: ${editingCourse.depart} → ${editingCourse.arrivee}${chauffeur ? ` (${chauffeur.prenom} ${chauffeur.nom})` : ''}`, editingCourse as unknown as Record<string, unknown>, null);
    setShowForm(false);
    loadCourses();
  }

  function toggleCourseSelection(id: string) {
    setSelectedCourseIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  // Clic sur une course : en mode selection on coche/decoche, sinon on edite.
  function onCourseClick(c: Course) {
    if (selectMode) toggleCourseSelection(c.id);
    else openEdit(c);
  }

  async function handleBatchDelete() {
    if (selectedCourseIds.size === 0) return;
    if (!confirm(`Supprimer definitivement ${selectedCourseIds.size} course(s) ?`)) return;
    const ids = Array.from(selectedCourseIds);
    const { error, count } = await supabase.from('courses').delete({ count: 'exact' }).in('id', ids);
    if (error) { alert('Suppression impossible : ' + error.message); return; }
    if (!count) { alert('Aucune course supprimee (droits insuffisants ?).'); return; }
    await logAction('delete', 'courses', null, `Suppression en lot: ${count} course(s)`, null, { ids });
    setSelectedCourseIds(new Set());
    setSelectMode(false);
    loadCourses();
  }

  async function handleReplace() {
    if (!editingCourse || !replaceChauffeurId) return;
    const oldChauffeur = chauffeurs.find(c => c.id === editingCourse.chauffeur_id);
    const newChauffeur = chauffeurs.find(c => c.id === replaceChauffeurId);
    // Mark original course as remplacee
    await supabase.from('courses').update({ statut_realisation: 'remplace' }).eq('id', editingCourse.id);
    // Duplicate course onto the new chauffeur with non_planifie status
    await supabase.from('courses').insert({
      date_heure: editingCourse.date_heure,
      depart: editingCourse.depart,
      arrivee: editingCourse.arrivee,
      statut_planification: 'non_planifie',
      statut_realisation: 'programme',
      montant: editingCourse.montant,
      notes: editingCourse.notes ? `[Remplacement] ${editingCourse.notes}` : '[Remplacement]',
      chauffeur_id: replaceChauffeurId,
      client_id: editingCourse.client_id,
      ligne_id: editingCourse.ligne_id,
      periode: editingCourse.periode,
      duree_minutes: editingCourse.duree_minutes,
      user_id: user.id,
    });
    await logAction('replace', 'courses', editingCourse.id, `Remplacement: ${oldChauffeur ? `${oldChauffeur.prenom} ${oldChauffeur.nom}` : '?'} → ${newChauffeur ? `${newChauffeur.prenom} ${newChauffeur.nom}` : '?'} (${editingCourse.depart} → ${editingCourse.arrivee})`, editingCourse as unknown as Record<string, unknown>, { chauffeur_id: replaceChauffeurId, statut_planification: 'non_planifie' });
    setShowReplace(false);
    setShowForm(false);
    setReplaceChauffeurId('');
    loadCourses();
  }

  // Resize handlers
  const handleResizeStart = useCallback((e: React.MouseEvent, courseId: string, containerEl: HTMLElement) => {
    e.stopPropagation();
    e.preventDefault();
    const courseEl = e.currentTarget.parentElement;
    if (!courseEl) return;
    resizeRef.current = {
      startX: e.clientX,
      startWidth: courseEl.offsetWidth,
      courseId,
      containerWidth: containerEl.offsetWidth,
    };
    setResizingId(courseId);

    const handleMouseMove = (ev: MouseEvent) => {
      if (!resizeRef.current) return;
      const delta = ev.clientX - resizeRef.current.startX;
      const newWidth = Math.max(80, resizeRef.current.startWidth + delta);
      const el = document.querySelector(`[data-course-id="${resizeRef.current.courseId}"]`) as HTMLElement;
      if (el) el.style.width = `${newWidth}px`;
    };

    const handleMouseUp = async (ev: MouseEvent) => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
      if (!resizeRef.current) return;
      const delta = ev.clientX - resizeRef.current.startX;
      const newWidth = Math.max(80, resizeRef.current.startWidth + delta);
      const pxPerHour = resizeRef.current.containerWidth / TOTAL_HOURS;
      const newDurationHours = newWidth / pxPerHour;
      const newDurationMinutes = Math.max(15, Math.round(newDurationHours * 60 / 15) * 15);

      await supabase.from('courses').update({ duree_minutes: newDurationMinutes }).eq('id', resizeRef.current.courseId);
      resizeRef.current = null;
      setResizingId(null);
      loadCourses();
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
  }, []);

  // Filtering
  const filteredChauffeurs = useMemo(() => {
    let result = chauffeurs;
    if (lineFilter !== 'all') {
      result = result.filter(c => c.ligne_id === lineFilter);
    }
    if (chauffeurFilter !== 'all') {
      result = result.filter(c => c.id === chauffeurFilter);
    }
    return result;
  }, [chauffeurs, lineFilter, chauffeurFilter]);

  const filteredCourses = useMemo(() => {
    let result = courses;
    if (lineFilter !== 'all') {
      result = result.filter(c => c.ligne_id === lineFilter);
    }
    if (chauffeurFilter !== 'all') {
      result = result.filter(c => c.chauffeur_id === chauffeurFilter);
    }
    if (periodeFilter !== 'all') {
      result = result.filter(c => c.periode === periodeFilter);
    }
    return result;
  }, [courses, lineFilter, chauffeurFilter, periodeFilter]);

  const chauffeursByLigne = useMemo(() => {
    const groups: Map<string | null, Chauffeur[]> = new Map();
    filteredChauffeurs.forEach(c => {
      const key = c.ligne_id;
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key)!.push(c);
    });
    return groups;
  }, [filteredChauffeurs]);

  function getCourseForChauffeur(chauffeurId: string, date?: Date): Course[] {
    return filteredCourses.filter(c => {
      if (c.chauffeur_id !== chauffeurId) return false;
      if (date) return isSameDay(parseCourseDate(c.date_heure), date);
      return true;
    });
  }

  // Courses sans chauffeur affecte: elles n'apparaissent dans aucune colonne
  // chauffeur (donc invisibles/non supprimables). On applique ligne + periode
  // mais PAS le filtre chauffeur, pour les garder atteignables et cliquables.
  const unassignedCoursesBase = useMemo(() => {
    let result = courses.filter(c => !c.chauffeur_id);
    if (lineFilter !== 'all') result = result.filter(c => c.ligne_id === lineFilter);
    if (periodeFilter !== 'all') result = result.filter(c => c.periode === periodeFilter);
    return result;
  }, [courses, lineFilter, periodeFilter]);

  function getUnassignedCourses(date?: Date): Course[] {
    return unassignedCoursesBase.filter(c => {
      if (date) return isSameDay(parseCourseDate(c.date_heure), date);
      return true;
    });
  }

  function getCoursePosition(course: Course): { left: string; width: string } {
    const d = parseCourseDate(course.date_heure);
    const h = d.getHours() + d.getMinutes() / 60;
    const startOffset = h - START_HOUR;
    const duration = (course.duree_minutes || 60) / 60;
    return {
      left: `${(Math.max(0, startOffset) / TOTAL_HOURS) * 100}%`,
      width: `${(duration / TOTAL_HOURS) * 100}%`,
    };
  }

  const weekDays = useMemo(() => {
    const monday = getMonday(currentDate);
    return Array.from({ length: 7 }, (_, i) => {
      const d = new Date(monday);
      d.setDate(d.getDate() + i);
      return d;
    });
  }, [currentDate]);

  const monthDays = useMemo(() => {
    const first = new Date(currentDate.getFullYear(), currentDate.getMonth(), 1);
    const last = new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 0);
    const days: Date[] = [];
    for (let d = new Date(first); d <= last; d.setDate(d.getDate() + 1)) {
      days.push(new Date(d));
    }
    return days;
  }, [currentDate]);

  const headerTitle = view === 'jour'
    ? formatDateFr(currentDate)
    : view === 'semaine'
      ? `Sem. du ${formatDateFr(getMonday(currentDate))}`
      : `${['Janvier','Fevrier','Mars','Avril','Mai','Juin','Juillet','Aout','Septembre','Octobre','Novembre','Decembre'][currentDate.getMonth()]} ${currentDate.getFullYear()}`;

  const nonPlanifieCount = courses.filter(c => c.statut_planification === 'non_planifie').length;
  const brouillonCount = courses.filter(c => c.is_brouillon).length;

  const periodeLabels: Record<string, string> = {
    matin: 'AM',
    apres_midi: 'PM',
    astreinte: 'Astr.',
  };

  return (
    <div className="space-y-4 -m-8 p-0">
      {/* Draft mode banner */}
      {draftMode && (
        <div className="mx-6 mt-4 px-4 py-2.5 bg-blue-50 border border-blue-200 rounded-lg flex items-center justify-between">
          <div className="flex items-center gap-2">
            <FileEdit className="w-4 h-4 text-blue-600" />
            <span className="text-sm font-medium text-blue-800">Mode brouillon actif</span>
            <span className="text-xs text-blue-600">Les courses creees ne seront pas visibles par les chauffeurs</span>
          </div>
          <button onClick={() => setDraftMode(false)} className="text-xs text-blue-600 hover:text-blue-800 font-medium underline">Quitter</button>
        </div>
      )}
      {/* Header */}
      <div className="px-6 pt-6 pb-4 bg-white border-b border-gray-100">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-1">
              <button onClick={() => navigate(-1)} className="p-1.5 hover:bg-gray-100 rounded-lg transition-colors"><ChevronLeft className="w-4 h-4" /></button>
              <button onClick={goToday} className="px-3 py-1.5 text-xs font-medium border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors">Aujourd'hui</button>
              <button onClick={() => navigate(1)} className="p-1.5 hover:bg-gray-100 rounded-lg transition-colors"><ChevronRight className="w-4 h-4" /></button>
            </div>
            <div>
              <p className="text-[10px] text-gray-500 uppercase tracking-wide font-semibold">Planning {view === 'jour' ? 'Journee' : view === 'semaine' ? 'Semaine' : 'Mois'}</p>
              <h1 className="text-lg font-bold text-gray-900">{headerTitle}</h1>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <div className="flex border border-gray-200 rounded-lg overflow-hidden">
              {(['jour', 'semaine', 'mois'] as ViewMode[]).map(v => (
                <button key={v} onClick={() => setView(v)} className={`px-3 py-1.5 text-xs font-medium transition-colors ${view === v ? 'bg-gray-900 text-white' : 'bg-white text-gray-600 hover:bg-gray-50'}`}>
                  {v === 'jour' ? 'Jour' : v === 'semaine' ? 'Semaine' : 'Mois'}
                </button>
              ))}
            </div>
            <button onClick={openDuplicate} className="px-3 py-1.5 text-xs font-medium border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors flex items-center gap-1.5">
              <Copy className="w-3.5 h-3.5" /> Dupliquer
            </button>
            <button onClick={() => window.print()} className="px-3 py-1.5 text-xs font-medium border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors flex items-center gap-1.5">
              <Printer className="w-3.5 h-3.5" /> Imprimer
            </button>
            <button onClick={handleExportCSV} className="px-3 py-1.5 text-xs font-medium border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors flex items-center gap-1.5">
              <Download className="w-3.5 h-3.5" /> Exporter
            </button>
            <button onClick={() => importInputRef.current?.click()} className="px-3 py-1.5 text-xs font-medium border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors flex items-center gap-1.5">
              <Upload className="w-3.5 h-3.5" /> Importer
            </button>
            <input ref={importInputRef} type="file" accept=".csv" onChange={handleImportCSV} className="hidden" />
            <button
              onClick={() => setDraftMode(!draftMode)}
              className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-colors flex items-center gap-1.5 border ${draftMode ? 'bg-blue-600 text-white border-blue-600' : 'bg-white text-gray-700 border-gray-200 hover:bg-gray-50'}`}
            >
              <FileEdit className="w-3.5 h-3.5" /> {draftMode ? 'Mode brouillon' : 'Brouillon'}
            </button>
            {brouillonCount > 0 && (
              <button onClick={publishDrafts} className="px-3 py-1.5 text-xs font-medium bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg transition-colors flex items-center gap-1.5">
                <Send className="w-3.5 h-3.5" /> Publier ({brouillonCount})
              </button>
            )}
            <button onClick={openAstreinteForm} className="px-3 py-1.5 text-xs font-medium bg-gray-800 hover:bg-gray-900 text-white rounded-lg transition-colors flex items-center gap-1.5">
              <Shield className="w-3.5 h-3.5" /> Astreinte
            </button>
            <button onClick={openCoordForm} className="px-3 py-1.5 text-xs font-medium bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg transition-colors flex items-center gap-1.5">
              <UserCheck className="w-3.5 h-3.5" /> Coordinateur
            </button>
            <button onClick={() => openCreate()} className="px-4 py-1.5 text-xs font-medium bg-amber-600 hover:bg-amber-700 text-white rounded-lg transition-colors flex items-center gap-1.5">
              <Plus className="w-3.5 h-3.5" /> Course
            </button>
            <button onClick={() => { setSelectMode(!selectMode); setSelectedCourseIds(new Set()); }} className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-colors flex items-center gap-1.5 border ${selectMode ? 'bg-blue-600 text-white border-blue-600' : 'bg-white text-gray-700 border-gray-200 hover:bg-gray-50'}`}>
              <CheckSquare className="w-3.5 h-3.5" /> {selectMode ? 'Quitter' : 'Selection'}
            </button>
            {selectMode && selectedCourseIds.size > 0 && (
              <button onClick={handleBatchDelete} className="px-3 py-1.5 text-xs font-medium bg-red-600 hover:bg-red-700 text-white rounded-lg transition-colors flex items-center gap-1.5">
                <Trash2 className="w-3.5 h-3.5" /> Supprimer ({selectedCourseIds.size})
              </button>
            )}
          </div>
        </div>

        {/* Filters row */}
        <div className="flex items-center gap-3 mt-3">
          {/* Line filters */}
          <div className="flex items-center gap-1.5">
            <span className="text-[10px] text-gray-500 uppercase font-semibold">Ligne</span>
            <button onClick={() => setLineFilter('all')} className={`px-2.5 py-1 rounded text-xs font-medium transition-colors ${lineFilter === 'all' ? 'bg-gray-900 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}>
              Tous
            </button>
            {lignes.map(l => (
              <button key={l.id} onClick={() => setLineFilter(l.id)} className={`px-2.5 py-1 rounded text-xs font-medium transition-colors ${lineFilter === l.id ? 'bg-gray-900 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}>
                {l.code}
              </button>
            ))}
          </div>

          <div className="w-px h-5 bg-gray-200" />

          {/* Periode filters */}
          <div className="flex items-center gap-1.5">
            <button onClick={() => setPeriodeFilter('all')} className={`px-2 py-1 rounded text-[10px] font-bold transition-colors ${periodeFilter === 'all' ? 'bg-gray-900 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}>■</button>
            <button onClick={() => setPeriodeFilter('matin')} className={`px-2 py-1 rounded text-[10px] font-medium transition-colors ${periodeFilter === 'matin' ? 'bg-gray-900 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}>AM</button>
            <button onClick={() => setPeriodeFilter('apres_midi')} className={`px-2 py-1 rounded text-[10px] font-medium transition-colors ${periodeFilter === 'apres_midi' ? 'bg-gray-900 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}>PM</button>
            <button onClick={() => setPeriodeFilter('astreinte')} className={`px-2 py-1 rounded text-[10px] font-medium transition-colors ${periodeFilter === 'astreinte' ? 'bg-gray-900 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}>Astr.</button>
          </div>

          <div className="w-px h-5 bg-gray-200" />

          {/* Chauffeur filter */}
          <div className="flex items-center gap-1.5">
            <span className="text-[10px] text-gray-500 uppercase font-semibold">Chauffeur</span>
            <select
              value={chauffeurFilter}
              onChange={(e) => setChauffeurFilter(e.target.value)}
              className="text-xs border border-gray-200 rounded-lg px-2 py-1 bg-white focus:outline-none focus:border-amber-500"
            >
              <option value="all">Tous</option>
              {chauffeurs.map(c => (
                <option key={c.id} value={c.id}>{c.code} - {c.prenom} {c.nom}</option>
              ))}
            </select>
          </div>

          {/* Brouillon badge */}
          {brouillonCount > 0 && (
            <span className="ml-2 text-[10px] px-2 py-0.5 border border-blue-300 bg-blue-50 text-blue-700 rounded font-medium">
              Brouillons ({brouillonCount})
            </span>
          )}

          {/* Non planifie badge */}
          {nonPlanifieCount > 0 && (
            <span className="ml-2 text-[10px] px-2 py-0.5 border border-amber-300 text-amber-700 rounded font-medium">
              Non planifie ({nonPlanifieCount})
            </span>
          )}
        </div>
      </div>

      {/* Day View - Timeline */}
      {view === 'jour' && (
        <div className="px-6 pb-6">
          <div className="flex border-b border-gray-200 bg-gray-50 rounded-t-lg overflow-hidden">
            <div className="w-60 flex-shrink-0 px-3 py-2 border-r border-gray-200">
              <span className="text-[10px] text-gray-500 uppercase font-semibold">{formatDateFr(currentDate)}</span>
            </div>
            <div className="flex-1 flex">
              {HOURS.map(h => (
                <div key={h} className="flex-1 text-center border-r border-gray-100 py-2">
                  <span className="text-[10px] text-gray-500 font-medium">{h.toString().padStart(2, '0')}h</span>
                </div>
              ))}
            </div>
            <div className="w-16 flex-shrink-0" />
          </div>

          <div className="border border-t-0 border-gray-200 rounded-b-lg overflow-hidden">
            {Array.from(chauffeursByLigne.entries()).map(([ligneId, chauffs]) => {
              const ligne = ligneId ? lignes.find(l => l.id === ligneId) : null;
              return (
                <div key={ligneId || 'none'}>
                  <div className="flex items-center gap-2 px-3 py-1.5 bg-gray-50 border-b border-gray-100">
                    {ligne && <span className="w-2 h-2 rounded-full" style={{ backgroundColor: ligne.couleur }} />}
                    <span className="text-[10px] font-semibold text-gray-600 uppercase tracking-wide">
                      {ligne ? `${ligne.code}  ${ligne.depart} ↔ ${ligne.arrivee}` : 'Sans ligne'}
                    </span>
                    <span className="text-[10px] text-gray-400 ml-auto">{chauffs.length} chauffeur{chauffs.length > 1 ? 's' : ''}</span>
                  </div>

                  {chauffs.map(ch => {
                    const chCourses = getCourseForChauffeur(ch.id, currentDate);
                    return (
                      <div key={ch.id} className="flex border-b border-gray-50 hover:bg-amber-50/30 transition-colors group">
                        <div className="w-60 flex-shrink-0 px-3 py-2.5 border-r border-gray-100">
                          <div className="flex items-center gap-2">
                            <span className="w-2 h-2 rounded-full bg-amber-500" />
                            <span className="inline-flex items-center justify-center px-1.5 py-0.5 rounded text-[9px] font-bold border" style={{ borderColor: ligne?.couleur || '#ccc', color: ligne?.couleur || '#666' }}>
                              {ch.code || '?'}
                            </span>
                            <span className="text-sm font-semibold text-gray-900">{ch.nom} {ch.prenom}</span>
                          </div>
                          <div className="flex items-center gap-1.5 mt-0.5 ml-4">
                            {ligne && <span className="text-[10px] px-1.5 py-0.5 rounded border" style={{ borderColor: ligne.couleur, color: ligne.couleur }}>{ligne.code}</span>}
                            <span className="text-[10px] text-gray-400">{ligne ? `${ligne.depart}→${ligne.arrivee}` : ''}</span>
                          </div>
                        </div>
                        <div
                          className="flex-1 relative min-h-[52px] cursor-pointer"
                          onClick={() => { if (!selectMode) openCreate(ch.id); }}
                          data-timeline-container={ch.id}
                        >
                          <div className="absolute inset-0 flex pointer-events-none">
                            {HOURS.map(h => (
                              <div key={h} className="flex-1 border-r border-gray-50" />
                            ))}
                          </div>
                          {chCourses.map(course => {
                            const pos = getCoursePosition(course);
                            const time = parseCourseDate(course.date_heure).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
                            const isNonPlanifie = course.statut_planification === 'non_planifie';
                            const isRemplacee = course.statut_realisation === 'remplace';
                            const isBrouillon = course.is_brouillon;
                            const bgColor = isBrouillon ? '#3b82f6' : isRemplacee ? '#f87171' : isNonPlanifie ? '#9ca3af' : (ligne?.couleur || '#d97706');
                            return (
                              <div
                                key={course.id}
                                data-course-id={course.id}
                                onClick={(e) => { e.stopPropagation(); onCourseClick(course); }}
                                className={`absolute top-1 bottom-1 rounded cursor-pointer flex items-center px-2 gap-1 text-white text-[10px] font-medium overflow-hidden shadow-sm hover:shadow-md transition-shadow select-none ${isNonPlanifie ? 'border-2 border-dashed border-gray-500' : ''} ${isBrouillon ? 'border-2 border-dashed border-blue-300 opacity-75' : ''} ${isRemplacee ? 'opacity-60' : ''} ${selectMode && selectedCourseIds.has(course.id) ? 'ring-2 ring-blue-700 ring-offset-1' : ''}`}
                                style={{ left: pos.left, width: pos.width, minWidth: '80px', backgroundColor: bgColor }}
                              >
                                <span className={`truncate flex-1 ${isRemplacee ? 'line-through' : ''}`}>
                                  {isBrouillon ? '✎' : isRemplacee ? '⟳' : '▶'} {course.depart} → {course.arrivee} · {time}
                                </span>
                                <span className="bg-white/20 px-1 rounded text-[9px] flex-shrink-0">{course.duree_minutes}m</span>
                                {isBrouillon && (
                                  <span className="bg-white/30 px-1 rounded text-[9px] flex-shrink-0">Brouillon</span>
                                )}
                                {isRemplacee && (
                                  <span className="bg-white/30 px-1 rounded text-[9px] flex-shrink-0">Rempl.</span>
                                )}
                                {!isRemplacee && course.periode && (
                                  <span className="bg-white/20 px-1 rounded text-[9px] flex-shrink-0">{periodeLabels[course.periode] || ''}</span>
                                )}
                                {/* Resize handle */}
                                <div
                                  className="absolute right-0 top-0 bottom-0 w-2 cursor-ew-resize hover:bg-white/30 transition-colors"
                                  onMouseDown={(e) => {
                                    const container = document.querySelector(`[data-timeline-container="${ch.id}"]`) as HTMLElement;
                                    if (container) handleResizeStart(e, course.id, container);
                                  }}
                                  onClick={(e) => e.stopPropagation()}
                                />
                              </div>
                            );
                          })}
                          {/* Astreinte periods */}
                          {astreintes
                            .filter(a => a.chauffeur_id === ch.id)
                            .map(a => {
                              const aStart = new Date(a.date_debut);
                              const aEnd = new Date(a.date_fin);
                              const dayStart = new Date(currentDate);
                              dayStart.setHours(START_HOUR, 0, 0, 0);
                              const startH = Math.max(0, (aStart.getTime() - dayStart.getTime()) / 3600000);
                              const endH = Math.min(TOTAL_HOURS, (aEnd.getTime() - dayStart.getTime()) / 3600000);
                              if (endH <= 0 || startH >= TOTAL_HOURS) return null;
                              const left = `${(Math.max(0, startH) / TOTAL_HOURS) * 100}%`;
                              const width = `${((Math.min(TOTAL_HOURS, endH) - Math.max(0, startH)) / TOTAL_HOURS) * 100}%`;
                              const aLigne = lignes.find(l => l.id === a.ligne_id);
                              return (
                                <div
                                  key={`astr-${a.id}`}
                                  onClick={(e) => { e.stopPropagation(); openAstreinteEdit(a); }}
                                  className={`absolute top-0 bottom-0 rounded cursor-pointer flex items-center px-2 gap-1 hover:ring-2 hover:ring-gray-400 transition-shadow ${a.is_brouillon ? 'border-2 border-dashed border-gray-400' : ''}`}
                                  style={{ left, width, minWidth: '60px', backgroundColor: 'rgba(31, 41, 55, 0.12)' }}
                                >
                                  <span className="text-[9px] font-bold text-gray-700 truncate">
                                    Astreinte {aLigne ? aLigne.code : ''}
                                  </span>
                                  {a.is_brouillon && <span className="text-[8px] text-gray-500 bg-white/70 px-1 rounded">Brouillon</span>}
                                  {a.notes && <span className="text-[8px] text-gray-500 truncate">{a.notes}</span>}
                                </div>
                              );
                            })}
                          {/* Creneaux de coordination (bande indigo en haut de la ligne) */}
                          {coordCreneaux
                            .filter(cc => cc.coordinateur_id === ch.id)
                            .map(cc => {
                              const cStart = new Date(cc.date_debut);
                              const cEnd = new Date(cc.date_fin);
                              const dayStart = new Date(currentDate);
                              dayStart.setHours(START_HOUR, 0, 0, 0);
                              const startH = Math.max(0, (cStart.getTime() - dayStart.getTime()) / 3600000);
                              const endH = Math.min(TOTAL_HOURS, (cEnd.getTime() - dayStart.getTime()) / 3600000);
                              if (endH <= 0 || startH >= TOTAL_HOURS) return null;
                              const left = `${(Math.max(0, startH) / TOTAL_HOURS) * 100}%`;
                              const width = `${((Math.min(TOTAL_HOURS, endH) - Math.max(0, startH)) / TOTAL_HOURS) * 100}%`;
                              const ccLigne = lignes.find(l => l.id === cc.ligne_id);
                              return (
                                <div
                                  key={`coord-${cc.id}`}
                                  onClick={(e) => { e.stopPropagation(); openCoordEdit(cc); }}
                                  title={`Coordination ${ccLigne ? ccLigne.code : ''}`}
                                  className={`absolute top-0 h-[14px] rounded-b cursor-pointer flex items-center px-1.5 gap-1 z-10 hover:ring-2 hover:ring-indigo-400 transition-shadow ${cc.is_brouillon ? 'border border-dashed border-indigo-300 opacity-80' : ''}`}
                                  style={{ left, width, minWidth: '50px', backgroundColor: 'rgba(79, 70, 229, 0.9)' }}
                                >
                                  <UserCheck className="w-2.5 h-2.5 text-white flex-shrink-0" />
                                  <span className="text-[8px] font-bold text-white truncate">
                                    {ccLigne ? ccLigne.code : 'Coord.'}
                                  </span>
                                </div>
                              );
                            })}
                        </div>
                        <div className="w-16 flex-shrink-0 flex items-center justify-center">
                          {chCourses.some(c => c.statut_planification === 'non_planifie') && (
                            <span className="text-[9px] text-amber-600 font-medium">⚠</span>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              );
            })}
            {filteredChauffeurs.length === 0 && (
              <div className="p-8 text-center text-gray-400 text-sm">Aucun chauffeur pour ce filtre</div>
            )}

            {/* Courses non affectees (sans chauffeur) */}
            {(() => {
              const unassigned = getUnassignedCourses(currentDate);
              if (unassigned.length === 0) return null;
              return (
                <div className="border-t-2 border-amber-200">
                  <div className="flex items-center gap-2 px-3 py-1.5 bg-amber-50 border-b border-amber-100">
                    <span className="w-2 h-2 rounded-full bg-amber-500" />
                    <span className="text-[10px] font-semibold text-amber-700 uppercase tracking-wide">Non affectees</span>
                    <span className="text-[10px] text-amber-600 ml-auto">{unassigned.length} a assigner</span>
                  </div>
                  <div className="flex border-b border-gray-50">
                    <div className="w-60 flex-shrink-0 px-3 py-2.5 border-r border-gray-100">
                      <div className="flex items-center gap-2">
                        <span className="w-2 h-2 rounded-full bg-amber-500" />
                        <span className="text-sm font-semibold text-amber-700">Sans chauffeur</span>
                      </div>
                      <p className="text-[10px] text-gray-400 mt-0.5 ml-4">Cliquer pour affecter / editer / supprimer</p>
                    </div>
                    <div className="flex-1 p-2 flex flex-wrap gap-1.5 content-start">
                      {unassigned.map(course => {
                        const ligne = course.ligne_id ? lignes.find(l => l.id === course.ligne_id) : null;
                        const time = parseCourseDate(course.date_heure).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
                        const isNonPlanifie = course.statut_planification === 'non_planifie';
                        const isBrouillon = course.is_brouillon;
                        return (
                          <button
                            key={course.id}
                            type="button"
                            data-course-id={course.id}
                            onClick={() => onCourseClick(course)}
                            className={`flex items-center gap-1.5 px-2 py-1 rounded text-[10px] font-medium text-white cursor-pointer shadow-sm hover:shadow-md transition-shadow border-2 border-dashed ${isBrouillon ? 'border-blue-300' : 'border-amber-300'} ${selectMode && selectedCourseIds.has(course.id) ? 'ring-2 ring-blue-700 ring-offset-1' : ''}`}
                            style={{ backgroundColor: isBrouillon ? '#3b82f6' : '#f59e0b' }}
                          >
                            <span>{time}</span>
                            <span className="truncate max-w-[180px]">{course.depart} → {course.arrivee}</span>
                            {ligne && <span className="bg-white/20 px-1 rounded">{ligne.code}</span>}
                            <span className="bg-white/20 px-1 rounded">{course.duree_minutes}m</span>
                            {isNonPlanifie && <span className="bg-white/30 px-1 rounded">Non planifie</span>}
                            {isBrouillon && <span className="bg-white/30 px-1 rounded">Brouillon</span>}
                          </button>
                        );
                      })}
                    </div>
                    <div className="w-16 flex-shrink-0 flex items-center justify-center">
                      <span className="text-[9px] text-amber-600 font-medium">⚠</span>
                    </div>
                  </div>
                </div>
              );
            })()}
          </div>
        </div>
      )}

      {/* Week View */}
      {view === 'semaine' && (
        <div className="px-6 pb-6">
          <div className="border border-gray-200 rounded-lg overflow-hidden">
            <div className="flex bg-gray-50 border-b border-gray-200">
              <div className="w-52 flex-shrink-0 px-3 py-2 border-r border-gray-200">
                <span className="text-[10px] text-gray-500 uppercase font-semibold">Chauffeur</span>
              </div>
              {weekDays.map(d => (
                <div key={d.toISOString()} className={`flex-1 text-center py-2 border-r border-gray-100 ${isSameDay(d, new Date()) ? 'bg-amber-50' : ''}`}>
                  <p className="text-[10px] text-gray-500 uppercase">{['Dim','Lun','Mar','Mer','Jeu','Ven','Sam'][d.getDay()]}</p>
                  <p className={`text-sm font-bold ${isSameDay(d, new Date()) ? 'text-amber-600' : 'text-gray-900'}`}>{d.getDate()}</p>
                </div>
              ))}
            </div>

            {filteredChauffeurs.map(ch => {
              const ligne = ch.ligne_id ? lignes.find(l => l.id === ch.ligne_id) : null;
              return (
                <div key={ch.id} className="flex border-b border-gray-50 hover:bg-gray-50/50">
                  <div className="w-52 flex-shrink-0 px-3 py-2 border-r border-gray-100">
                    <div className="flex items-center gap-1.5">
                      <span className="text-[9px] px-1 py-0.5 rounded border font-bold" style={{ borderColor: ligne?.couleur || '#ccc', color: ligne?.couleur || '#666' }}>{ch.code}</span>
                      <span className="text-xs font-medium text-gray-900">{ch.nom} {ch.prenom}</span>
                    </div>
                  </div>
                  {weekDays.map(d => {
                    const dayCourses = getCourseForChauffeur(ch.id, d);
                    const dayAstreintes = astreintes.filter(a => {
                      const aStart = new Date(a.date_debut);
                      const aEnd = new Date(a.date_fin);
                      const dayEnd = new Date(d); dayEnd.setHours(23, 59, 59, 999);
                      return a.chauffeur_id === ch.id && aStart <= dayEnd && aEnd >= d;
                    });
                    return (
                      <div key={d.toISOString()} className={`flex-1 p-1 border-r border-gray-50 min-h-[40px] cursor-pointer ${isSameDay(d, new Date()) ? 'bg-amber-50/50' : ''}`} onClick={() => { if (!selectMode) { setCurrentDate(d); openCreate(ch.id); } }}>
                        {dayAstreintes.map(a => {
                          const aLigne = lignes.find(l => l.id === a.ligne_id);
                          return (
                            <div key={`astr-${a.id}`} className={`text-[8px] px-1 py-0.5 rounded mb-0.5 bg-gray-800 text-white truncate ${a.is_brouillon ? 'border border-dashed border-gray-400 opacity-60' : ''}`}>
                              Astr. {aLigne?.code || ''}
                            </div>
                          );
                        })}
                        {coordCreneaux
                          .filter(cc => {
                            const cStart = new Date(cc.date_debut);
                            const cEnd = new Date(cc.date_fin);
                            const dayEnd = new Date(d); dayEnd.setHours(23, 59, 59, 999);
                            return cc.coordinateur_id === ch.id && cStart <= dayEnd && cEnd >= d;
                          })
                          .map(cc => {
                            const ccLigne = lignes.find(l => l.id === cc.ligne_id);
                            return (
                              <div key={`coord-${cc.id}`} onClick={(e) => { e.stopPropagation(); openCoordEdit(cc); }} className={`text-[8px] px-1 py-0.5 rounded mb-0.5 bg-indigo-600 text-white truncate cursor-pointer ${cc.is_brouillon ? 'border border-dashed border-indigo-300 opacity-70' : ''}`}>
                                Coord. {ccLigne?.code || ''}
                              </div>
                            );
                          })}
                        {dayCourses.map(c => {
                          const isNonPlanifie = c.statut_planification === 'non_planifie';
                          const isRemplacee = c.statut_realisation === 'remplace';
                          const isBrouillon = c.is_brouillon;
                          return (
                            <div key={c.id} onClick={(e) => { e.stopPropagation(); onCourseClick(c); }} className={`text-[9px] px-1 py-0.5 rounded mb-0.5 text-white truncate cursor-pointer ${isNonPlanifie ? 'border border-dashed border-gray-400' : ''} ${isBrouillon ? 'border border-dashed border-blue-300 opacity-75' : ''} ${isRemplacee ? 'opacity-50 line-through' : ''} ${selectMode && selectedCourseIds.has(c.id) ? 'ring-2 ring-blue-700' : ''}`} style={{ backgroundColor: isBrouillon ? '#3b82f6' : isRemplacee ? '#f87171' : isNonPlanifie ? '#9ca3af' : (ligne?.couleur || '#d97706') }}>
                              {isBrouillon ? '✎ ' : isRemplacee ? '⟳ ' : ''}{parseCourseDate(c.date_heure).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })} {c.depart} → {c.arrivee}
                            </div>
                          );
                        })}
                      </div>
                    );
                  })}
                </div>
              );
            })}

            {/* Ligne courses non affectees (sans chauffeur) */}
            {(() => {
              const weekUnassigned = unassignedCoursesBase.filter(c => {
                const d = parseCourseDate(c.date_heure);
                return weekDays.some(wd => isSameDay(d, wd));
              });
              if (weekUnassigned.length === 0) return null;
              return (
                <div className="flex border-b border-gray-50 bg-amber-50/30">
                  <div className="w-52 flex-shrink-0 px-3 py-2 border-r border-gray-100">
                    <div className="flex items-center gap-1.5">
                      <span className="w-2 h-2 rounded-full bg-amber-500" />
                      <span className="text-xs font-semibold text-amber-700">Non affectees</span>
                    </div>
                    <p className="text-[9px] text-gray-400 mt-0.5">Sans chauffeur</p>
                  </div>
                  {weekDays.map(d => {
                    const dayUnassigned = getUnassignedCourses(d);
                    return (
                      <div key={d.toISOString()} className="flex-1 p-1 border-r border-gray-50 min-h-[40px]">
                        {dayUnassigned.map(c => {
                          const isNonPlanifie = c.statut_planification === 'non_planifie';
                          const isBrouillon = c.is_brouillon;
                          return (
                            <div
                              key={c.id}
                              onClick={(e) => { e.stopPropagation(); onCourseClick(c); }}
                              title={isNonPlanifie ? 'Non planifie - sans chauffeur' : 'Sans chauffeur'}
                              className={`text-[9px] px-1 py-0.5 rounded mb-0.5 text-white truncate cursor-pointer border-2 border-dashed ${isBrouillon ? 'border-blue-300' : 'border-amber-300'} ${selectMode && selectedCourseIds.has(c.id) ? 'ring-2 ring-blue-700' : ''}`}
                              style={{ backgroundColor: isBrouillon ? '#3b82f6' : '#f59e0b' }}
                            >
                              ⚠ {parseCourseDate(c.date_heure).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })} {c.depart} → {c.arrivee}
                            </div>
                          );
                        })}
                      </div>
                    );
                  })}
                </div>
              );
            })()}
          </div>
        </div>
      )}

      {/* Month View */}
      {view === 'mois' && (
        <div className="px-6 pb-6">
          <div className="border border-gray-200 rounded-lg overflow-hidden">
            <div className="grid grid-cols-7 bg-gray-50 border-b border-gray-200">
              {['Lun','Mar','Mer','Jeu','Ven','Sam','Dim'].map(d => (
                <div key={d} className="text-center py-2 text-[10px] font-semibold text-gray-500 uppercase">{d}</div>
              ))}
            </div>
            <div className="grid grid-cols-7">
              {Array.from({ length: (monthDays[0]?.getDay() || 7) - 1 }, (_, i) => (
                <div key={`empty-${i}`} className="border-r border-b border-gray-50 min-h-[80px]" />
              ))}
              {monthDays.map(d => {
                const dayCourses = filteredCourses.filter(c => isSameDay(parseCourseDate(c.date_heure), d));
                return (
                  <div key={d.toISOString()} className={`border-r border-b border-gray-50 min-h-[80px] p-1 cursor-pointer hover:bg-gray-50 ${isSameDay(d, new Date()) ? 'bg-amber-50' : ''}`} onClick={() => { setCurrentDate(d); setView('jour'); }}>
                    <p className={`text-xs font-medium mb-0.5 ${isSameDay(d, new Date()) ? 'text-amber-600' : 'text-gray-700'}`}>{d.getDate()}</p>
                    {dayCourses.slice(0, 3).map(c => {
                      const ligne = c.ligne_id ? lignes.find(l => l.id === c.ligne_id) : null;
                      return (
                        <div key={c.id} className="text-[8px] px-1 py-0.5 rounded mb-0.5 text-white truncate" style={{ backgroundColor: c.statut_planification === 'non_planifie' ? '#9ca3af' : (ligne?.couleur || '#d97706') }}>
                          {parseCourseDate(c.date_heure).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}
                        </div>
                      );
                    })}
                    {dayCourses.length > 3 && <p className="text-[8px] text-gray-400">+{dayCourses.length - 3}</p>}
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* Duplication Modal */}
      {showDuplicate && (() => {
        const duplicable = getDuplicableCourses();
        const filteredDup = dupChauffeurFilter
          ? duplicable.filter(c => c.chauffeur_id === dupChauffeurFilter)
          : duplicable;
        const chauffeurIdsInView = [...new Set(duplicable.map(c => c.chauffeur_id).filter(Boolean))];

        return (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl w-full max-w-lg shadow-2xl max-h-[90vh] flex flex-col">
            <div className="p-5 border-b border-gray-100 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 bg-amber-50 rounded-lg flex items-center justify-center">
                  <Copy className="w-4 h-4 text-amber-600" />
                </div>
                <div>
                  <h3 className="font-bold text-gray-900">Dupliquer des courses</h3>
                  <p className="text-xs text-gray-500 mt-0.5">
                    {view === 'jour' ? `Journee du ${formatDateFr(currentDate)}` : `Semaine du ${formatDateFr(getMonday(currentDate))}`}
                  </p>
                </div>
              </div>
              <button onClick={() => setShowDuplicate(false)} className="text-gray-400 hover:text-gray-600"><X className="w-5 h-5" /></button>
            </div>

            <div className="flex-1 overflow-y-auto p-5 space-y-4">
              {/* Step 1: Select courses */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="text-xs font-semibold text-gray-500 uppercase">1. Selectionner les courses</label>
                  <div className="flex gap-2">
                    <button type="button" onClick={() => setDupSelectedIds(new Set(filteredDup.map(c => c.id)))} className="text-[10px] text-amber-600 font-medium hover:underline">Tout</button>
                    <button type="button" onClick={() => setDupSelectedIds(new Set())} className="text-[10px] text-gray-500 font-medium hover:underline">Aucun</button>
                  </div>
                </div>
                {chauffeurIdsInView.length > 1 && (
                  <select value={dupChauffeurFilter} onChange={(e) => setDupChauffeurFilter(e.target.value)} className="w-full mb-2 px-3 py-1.5 border border-gray-200 rounded-lg text-xs focus:ring-2 focus:ring-amber-500 outline-none">
                    <option value="">Tous les chauffeurs</option>
                    {chauffeurIdsInView.map(cid => {
                      const ch = chauffeurs.find(x => x.id === cid);
                      return <option key={cid} value={cid!}>{ch ? `${ch.code} - ${ch.nom} ${ch.prenom}` : cid}</option>;
                    })}
                  </select>
                )}
                <div className="border border-gray-200 rounded-lg max-h-48 overflow-y-auto divide-y divide-gray-100">
                  {filteredDup.length === 0 && <p className="p-3 text-xs text-gray-400 text-center">Aucune course duplicable</p>}
                  {filteredDup.map(c => {
                    const ch = chauffeurs.find(x => x.id === c.chauffeur_id);
                    const li = lignes.find(x => x.id === c.ligne_id);
                    const checked = dupSelectedIds.has(c.id);
                    return (
                      <label key={c.id} className="flex items-center gap-3 px-3 py-2 hover:bg-gray-50 cursor-pointer">
                        <input type="checkbox" checked={checked} onChange={() => {
                          const next = new Set(dupSelectedIds);
                          checked ? next.delete(c.id) : next.add(c.id);
                          setDupSelectedIds(next);
                        }} className="w-4 h-4 rounded border-gray-300 text-amber-600 focus:ring-amber-500" />
                        <div className="flex-1 min-w-0">
                          <span className="text-xs font-medium text-gray-800">{parseCourseDate(c.date_heure).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}</span>
                          <span className="text-xs text-gray-500 ml-2">{c.depart} → {c.arrivee}</span>
                        </div>
                        <span className="text-[10px] text-gray-400">{ch?.code || ''}</span>
                        {li && <span className="text-[10px] px-1.5 py-0.5 rounded text-white" style={{ backgroundColor: li.couleur || '#6b7280' }}>{li.code}</span>}
                      </label>
                    );
                  })}
                </div>
                <p className="text-[10px] text-gray-400 mt-1">{dupSelectedIds.size} course(s) selectionnee(s)</p>
              </div>

              {/* Step 2: Target */}
              <div>
                <label className="text-xs font-semibold text-gray-500 uppercase mb-2 block">2. Ou dupliquer ?</label>
                <div className="space-y-3">
                  {/* Specific dates */}
                  <div>
                    <label className="text-[11px] text-gray-600 font-medium mb-1 block">Dates specifiques (optionnel)</label>
                    <input
                      type="date"
                      className="w-full px-3 py-1.5 border border-gray-200 rounded-lg text-xs focus:ring-2 focus:ring-amber-500 outline-none"
                      onChange={(e) => {
                        if (e.target.value && !dupTargetDates.includes(e.target.value)) {
                          setDupTargetDates(prev => [...prev, e.target.value].sort());
                        }
                        e.target.value = '';
                      }}
                    />
                    {dupTargetDates.length > 0 && (
                      <div className="flex flex-wrap gap-1 mt-1.5">
                        {dupTargetDates.map(d => (
                          <span key={d} className="inline-flex items-center gap-1 px-2 py-0.5 bg-amber-50 text-amber-700 rounded text-[10px] font-medium">
                            {new Date(d + 'T00:00:00').toLocaleDateString('fr-FR', { weekday: 'short', day: '2-digit', month: 'short' })}
                            <button type="button" onClick={() => setDupTargetDates(prev => prev.filter(x => x !== d))} className="text-amber-400 hover:text-red-500">
                              <X className="w-3 h-3" />
                            </button>
                          </span>
                        ))}
                        <button type="button" onClick={() => setDupTargetDates([])} className="text-[10px] text-gray-400 hover:text-red-500">Vider</button>
                      </div>
                    )}
                  </div>

                  {dupTargetDates.length === 0 && (
                    <>
                      <div className="border-t border-gray-100 pt-3">
                        <label className="text-[11px] text-gray-600 font-medium mb-1.5 block">Ou repetition par semaine</label>
                        <div className="grid grid-cols-4 gap-1.5">
                          {([
                            { key: 'lun', label: 'Lu' }, { key: 'mar', label: 'Ma' },
                            { key: 'mer', label: 'Me' }, { key: 'jeu', label: 'Je' },
                            { key: 'ven', label: 'Ve' }, { key: 'sam', label: 'Sa' },
                            { key: 'dim', label: 'Di' }, { key: 'ferie', label: 'Fer' },
                          ] as const).map(d => (
                            <button key={d.key} type="button" onClick={() => setDupDays(prev => ({ ...prev, [d.key]: !prev[d.key] }))}
                              className={`px-2 py-1.5 rounded-lg text-[11px] font-medium border transition-colors ${dupDays[d.key] ? 'bg-amber-600 text-white border-amber-600' : 'bg-white text-gray-600 border-gray-200 hover:border-gray-300'}`}>
                              {d.label}
                            </button>
                          ))}
                        </div>
                        <div className="flex items-center gap-3 mt-2">
                          <input type="range" min={1} max={12} value={dupWeeks} onChange={(e) => setDupWeeks(parseInt(e.target.value))} className="flex-1 accent-amber-600" />
                          <span className="text-xs font-bold text-gray-700 w-20 text-right">{dupWeeks} sem.</span>
                        </div>
                      </div>
                    </>
                  )}
                </div>
              </div>

              {/* Summary */}
              <div className="bg-amber-50 rounded-lg p-3 border border-amber-100">
                <p className="text-xs font-medium text-amber-800">
                  {dupSelectedIds.size} course(s) × {dupTargetDates.length > 0 ? `${dupTargetDates.length} date(s)` : `${Object.values(dupDays).filter(Boolean).length} jour(s)/sem × ${dupWeeks} sem.`}
                  {' '}→ creees en <span className="font-bold">brouillon</span>
                </p>
              </div>
            </div>

            <div className="p-5 border-t border-gray-100 flex gap-3">
              <button type="button" onClick={() => setShowDuplicate(false)} className="flex-1 px-3 py-2.5 border border-gray-200 text-gray-700 rounded-xl text-sm font-medium hover:bg-gray-50 transition-colors">
                Annuler
              </button>
              <button type="button" onClick={handleDuplicate}
                disabled={dupLoading || dupSelectedIds.size === 0 || (dupTargetDates.length === 0 && !Object.values(dupDays).some(Boolean))}
                className="flex-1 px-3 py-2.5 bg-amber-600 hover:bg-amber-700 disabled:bg-gray-300 disabled:cursor-not-allowed text-white rounded-xl text-sm font-medium transition-colors flex items-center justify-center gap-2">
                {dupLoading ? <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" /> : <><Copy className="w-3.5 h-3.5" /> Dupliquer</>}
              </button>
            </div>
          </div>
        </div>
        );
      })()}

      {/* Replacement Modal */}
      {showReplace && editingCourse && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-[60] p-4">
          <div className="bg-white rounded-2xl w-full max-w-sm shadow-2xl">
            <div className="p-5 border-b border-gray-100">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 bg-blue-50 rounded-lg flex items-center justify-center">
                  <RefreshCw className="w-4 h-4 text-blue-600" />
                </div>
                <div>
                  <h3 className="font-bold text-gray-900">Remplacer la course</h3>
                  <p className="text-xs text-gray-500 mt-0.5">
                    L'ancienne affectation sera marquee comme remplacee
                  </p>
                </div>
              </div>
            </div>
            <div className="p-5 space-y-4">
              <div className="bg-gray-50 rounded-lg p-3">
                <p className="text-xs text-gray-500 mb-1">Course actuelle</p>
                <p className="text-sm font-medium text-gray-900">
                  {editingCourse.depart} → {editingCourse.arrivee}
                </p>
                <p className="text-xs text-gray-400 mt-0.5">
                  {new Date(editingCourse.date_heure).toLocaleString('fr-FR', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
                  {editingCourse.chauffeur_id && ` — ${chauffeurs.find(c => c.id === editingCourse.chauffeur_id)?.prenom || ''} ${chauffeurs.find(c => c.id === editingCourse.chauffeur_id)?.nom || ''}`}
                </p>
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-500 uppercase mb-1.5">Nouveau chauffeur</label>
                <select
                  value={replaceChauffeurId}
                  onChange={(e) => setReplaceChauffeurId(e.target.value)}
                  className="w-full px-3 py-2.5 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 outline-none"
                >
                  <option value="">Selectionner un chauffeur...</option>
                  {chauffeurs
                    .filter(c => c.id !== editingCourse.chauffeur_id)
                    .map(c => <option key={c.id} value={c.id}>{c.code} — {c.prenom} {c.nom}</option>)
                  }
                </select>
              </div>
              <div className="flex gap-3 pt-1">
                <button
                  type="button"
                  onClick={() => setShowReplace(false)}
                  className="flex-1 px-3 py-2.5 border border-gray-200 text-gray-700 rounded-xl text-sm font-medium hover:bg-gray-50 transition-colors"
                >
                  Annuler
                </button>
                <button
                  type="button"
                  onClick={handleReplace}
                  disabled={!replaceChauffeurId}
                  className="flex-1 px-3 py-2.5 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-300 disabled:cursor-not-allowed text-white rounded-xl text-sm font-medium transition-colors"
                >
                  Confirmer
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Course Form Modal */}
      {showForm && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl w-full max-w-md shadow-2xl max-h-[90vh] overflow-y-auto">
            <div className="p-5 border-b border-gray-100 flex items-center justify-between">
              <div>
                <p className="text-xs text-gray-500 uppercase tracking-wide">Planning</p>
                <h2 className="font-bold text-gray-900">{editingCourse ? 'Modifier la course' : 'Nouvelle course'}</h2>
              </div>
              <button onClick={() => setShowForm(false)} className="text-gray-400 hover:text-gray-600"><X className="w-5 h-5" /></button>
            </div>
            <form onSubmit={handleSubmit} className="p-5 space-y-4">
              <div>
                <label className="block text-xs font-semibold text-gray-500 uppercase mb-1">Date et heure</label>
                <input type="datetime-local" value={form.date_heure} onChange={(e) => setForm({ ...form, date_heure: e.target.value })} className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-amber-500 outline-none" required />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-gray-500 uppercase mb-1">Chauffeur</label>
                  <select value={form.chauffeur_id} onChange={(e) => setForm({ ...form, chauffeur_id: e.target.value })} className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-amber-500 outline-none">
                    <option value="">--</option>
                    {chauffeurs.map(c => <option key={c.id} value={c.id}>{c.code} {c.nom} {c.prenom}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-500 uppercase mb-1">Client</label>
                  <select value={form.client_id} onChange={(e) => setForm({ ...form, client_id: e.target.value })} className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-amber-500 outline-none">
                    <option value="">--</option>
                    {clients.map(c => <option key={c.id} value={c.id}>{c.nom}</option>)}
                  </select>
                </div>
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-500 uppercase mb-1">Coordinateur</label>
                <select value={form.coordinateur_id} onChange={(e) => setForm({ ...form, coordinateur_id: e.target.value })} className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-amber-500 outline-none">
                  <option value="">--</option>
                  {chauffeurs.filter(c => c.is_coordinateur).map(c => <option key={c.id} value={c.id}>{c.code} {c.prenom} {c.nom}</option>)}
                </select>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-gray-500 uppercase mb-1">Periode</label>
                  <select value={form.periode} onChange={(e) => setForm({ ...form, periode: e.target.value })} className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-amber-500 outline-none">
                    <option value="matin">Matin (AM)</option>
                    <option value="apres_midi">Apres-midi (PM)</option>
                    <option value="astreinte">Astreinte</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-500 uppercase mb-1">Duree (min)</label>
                  <input type="number" min={15} step={15} value={form.duree_minutes} onChange={(e) => setForm({ ...form, duree_minutes: parseInt(e.target.value) || 60 })} className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-amber-500 outline-none" />
                </div>
              </div>
              {/* Astreinte toggle */}
              <div className="flex items-center justify-between py-2 px-1">
                <div>
                  <label className="text-xs font-semibold text-gray-500 uppercase">Astreinte</label>
                  <p className="text-[10px] text-gray-400 mt-0.5">Course d'astreinte (hors planning regulier)</p>
                </div>
                <button
                  type="button"
                  onClick={() => setForm({ ...form, is_astreinte: !form.is_astreinte })}
                  className={`relative w-11 h-6 rounded-full transition-colors ${form.is_astreinte ? 'bg-amber-600' : 'bg-gray-200'}`}
                >
                  <span className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform ${form.is_astreinte ? 'translate-x-5' : ''}`} />
                </button>
              </div>
              {/* Brouillon toggle */}
              <div className="flex items-center justify-between py-2 px-1">
                <div>
                  <label className="text-xs font-semibold text-gray-500 uppercase">Brouillon</label>
                  <p className="text-[10px] text-gray-400 mt-0.5">Non publie, invisible pour les chauffeurs</p>
                </div>
                <button
                  type="button"
                  onClick={() => setForm({ ...form, is_brouillon: !form.is_brouillon })}
                  className={`relative w-11 h-6 rounded-full transition-colors ${form.is_brouillon ? 'bg-blue-600' : 'bg-gray-200'}`}
                >
                  <span className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform ${form.is_brouillon ? 'translate-x-5' : ''}`} />
                </button>
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-500 uppercase mb-1">Ligne</label>
                <select value={form.ligne_id} onChange={(e) => { const l = lignes.find(x => x.id === e.target.value); setForm({ ...form, ligne_id: e.target.value, depart: l?.depart || form.depart, arrivee: l?.arrivee || form.arrivee }); }} className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-amber-500 outline-none">
                  <option value="">--</option>
                  {lignes.map(l => <option key={l.id} value={l.id}>{l.code} - {l.depart} ↔ {l.arrivee}</option>)}
                </select>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-gray-500 uppercase mb-1">Depart</label>
                  <input type="text" list="course-arret-options" value={form.depart} onChange={(e) => setForm({ ...form, depart: e.target.value })} placeholder={arretOptions.length ? 'Selectionner ou saisir...' : ''} className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-amber-500 outline-none" required />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-500 uppercase mb-1">Arrivee</label>
                  <input type="text" list="course-arret-options" value={form.arrivee} onChange={(e) => setForm({ ...form, arrivee: e.target.value })} placeholder={arretOptions.length ? 'Selectionner ou saisir...' : ''} className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-amber-500 outline-none" required />
                </div>
                <datalist id="course-arret-options">
                  {arretOptions.map(p => <option key={p} value={p} />)}
                </datalist>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-gray-500 uppercase mb-1">Planification</label>
                  <select value={form.statut_planification} onChange={(e) => setForm({ ...form, statut_planification: e.target.value })} className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-amber-500 outline-none">
                    <option value="planifie">Planifie</option>
                    <option value="non_planifie">Non planifie</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-500 uppercase mb-1">Realisation</label>
                  <select value={form.statut_realisation} onChange={(e) => setForm({ ...form, statut_realisation: e.target.value })} className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-amber-500 outline-none">
                    <option value="programme">Programme</option>
                    <option value="en_cours">En cours</option>
                    <option value="en_retard">En retard</option>
                    <option value="termine">Termine</option>
                    <option value="annule">Annule</option>
                    <option value="remplace">Remplace</option>
                  </select>
                </div>
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-500 uppercase mb-1">Notes</label>
                <textarea value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} rows={2} className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-amber-500 outline-none resize-none" />
              </div>
              <div className="flex gap-3 pt-2">
                {editingCourse && editingCourse.statut_realisation !== 'remplace' && (
                  <button type="button" onClick={() => { setReplaceChauffeurId(''); setShowReplace(true); }} className="px-3 py-2 text-blue-600 border border-blue-200 rounded-xl text-sm font-medium hover:bg-blue-50 transition-colors flex items-center gap-1.5">
                    <RefreshCw className="w-3.5 h-3.5" /> Remplacer
                  </button>
                )}
                {editingCourse && (
                  <button type="button" onClick={handleDeleteCourse} className="px-3 py-2 text-red-600 border border-red-200 rounded-xl text-sm font-medium hover:bg-red-50 transition-colors">
                    Supprimer
                  </button>
                )}
                <button type="button" onClick={() => setShowForm(false)} className="flex-1 px-3 py-2 border border-gray-200 text-gray-700 rounded-xl text-sm font-medium hover:bg-gray-50 transition-colors">
                  Annuler
                </button>
                <button type="submit" className="flex-1 px-3 py-2 bg-amber-600 hover:bg-amber-700 text-white rounded-xl text-sm font-medium transition-colors">
                  {editingCourse ? 'Modifier' : 'Creer'} →
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Astreinte Period Modal */}
      {showAstreinte && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl w-full max-w-md shadow-2xl">
            <div className="p-5 border-b border-gray-100 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Shield className="w-5 h-5 text-gray-700" />
                <h3 className="font-semibold text-gray-900">{editingAstreinte ? 'Modifier l\'astreinte' : 'Periode d\'astreinte'}</h3>
              </div>
              <button onClick={() => setShowAstreinte(false)} className="text-gray-400 hover:text-gray-600"><X className="w-5 h-5" /></button>
            </div>
            <form onSubmit={handleAstreinteSubmit} className="p-5 space-y-4">
              <div>
                <label className="block text-xs font-semibold text-gray-500 uppercase mb-1">Chauffeur</label>
                <select
                  value={astreinteForm.chauffeur_id}
                  onChange={(e) => setAstreinteForm({ ...astreinteForm, chauffeur_id: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-amber-500 outline-none"
                  required
                >
                  <option value="">-- Selectionner --</option>
                  {chauffeurs.map(c => (
                    <option key={c.id} value={c.id}>{c.code} - {c.nom} {c.prenom}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-500 uppercase mb-1">Ligne</label>
                <select
                  value={astreinteForm.ligne_id}
                  onChange={(e) => setAstreinteForm({ ...astreinteForm, ligne_id: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-amber-500 outline-none"
                  required
                >
                  <option value="">-- Selectionner --</option>
                  {lignes.map(l => (
                    <option key={l.id} value={l.id}>{l.code} - {l.nom}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-500 uppercase mb-1">Coordinateur</label>
                <select
                  value={astreinteForm.coordinateur_id}
                  onChange={(e) => setAstreinteForm({ ...astreinteForm, coordinateur_id: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-amber-500 outline-none"
                >
                  <option value="">-- Aucun --</option>
                  {chauffeurs.filter(c => c.is_coordinateur).map(c => (
                    <option key={c.id} value={c.id}>{c.code} - {c.nom} {c.prenom}</option>
                  ))}
                </select>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-gray-500 uppercase mb-1">Debut</label>
                  <input
                    type="datetime-local"
                    value={astreinteForm.date_debut}
                    onChange={(e) => setAstreinteForm({ ...astreinteForm, date_debut: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-amber-500 outline-none"
                    required
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-500 uppercase mb-1">Fin</label>
                  <input
                    type="datetime-local"
                    value={astreinteForm.date_fin}
                    onChange={(e) => setAstreinteForm({ ...astreinteForm, date_fin: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-amber-500 outline-none"
                    required
                  />
                </div>
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-500 uppercase mb-1">Notes</label>
                <textarea
                  value={astreinteForm.notes}
                  onChange={(e) => setAstreinteForm({ ...astreinteForm, notes: e.target.value })}
                  rows={3}
                  placeholder="Ex: Couverture soiree + nuit pour ligne Nord..."
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-amber-500 outline-none resize-none"
                />
              </div>
              <div className="flex items-center justify-between py-2 px-1">
                <div>
                  <label className="text-xs font-semibold text-gray-500 uppercase">Brouillon</label>
                  <p className="text-[10px] text-gray-400 mt-0.5">Non publie, invisible pour les chauffeurs</p>
                </div>
                <button
                  type="button"
                  onClick={() => setAstreinteForm({ ...astreinteForm, is_brouillon: !astreinteForm.is_brouillon })}
                  className={`relative w-11 h-6 rounded-full transition-colors ${astreinteForm.is_brouillon ? 'bg-blue-600' : 'bg-gray-200'}`}
                >
                  <span className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform ${astreinteForm.is_brouillon ? 'translate-x-5' : ''}`} />
                </button>
              </div>
              <div className="flex gap-3 pt-2">
                {editingAstreinte && (
                  <button type="button" onClick={handleDeleteAstreinte} className="px-3 py-2.5 text-red-600 border border-red-200 rounded-xl text-sm font-medium hover:bg-red-50 transition-colors">
                    Supprimer
                  </button>
                )}
                <button type="button" onClick={() => { setShowAstreinte(false); setEditingAstreinte(null); }} className="flex-1 px-3 py-2.5 border border-gray-200 text-gray-700 rounded-xl text-sm font-medium hover:bg-gray-50 transition-colors">
                  Annuler
                </button>
                <button type="submit" className="flex-1 px-3 py-2.5 bg-gray-800 hover:bg-gray-900 text-white rounded-xl text-sm font-medium transition-colors">
                  {editingAstreinte ? 'Modifier' : 'Definir l\'astreinte'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Coordinateur Creneau Modal */}
      {showCoord && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl w-full max-w-md shadow-2xl">
            <div className="p-5 border-b border-gray-100 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <UserCheck className="w-5 h-5 text-indigo-600" />
                <h3 className="font-semibold text-gray-900">{editingCoord ? 'Modifier le creneau' : 'Creneau de coordination'}</h3>
              </div>
              <button onClick={() => { setShowCoord(false); setEditingCoord(null); }} className="text-gray-400 hover:text-gray-600"><X className="w-5 h-5" /></button>
            </div>
            <form onSubmit={handleCoordSubmit} className="p-5 space-y-4">
              <p className="text-[11px] text-gray-500 bg-indigo-50 border border-indigo-100 rounded-lg px-3 py-2">
                Le coordinateur verra sur son mobile <span className="font-semibold">uniquement les courses de cette ligne</span> qui tombent dans cette plage horaire.
              </p>
              <div>
                <label className="block text-xs font-semibold text-gray-500 uppercase mb-1">Coordinateur</label>
                <select
                  value={coordForm.coordinateur_id}
                  onChange={(e) => setCoordForm({ ...coordForm, coordinateur_id: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 outline-none"
                  required
                >
                  <option value="">-- Selectionner --</option>
                  {chauffeurs.filter(c => c.is_coordinateur).map(c => (
                    <option key={c.id} value={c.id}>{c.code} - {c.nom} {c.prenom}</option>
                  ))}
                </select>
                {chauffeurs.filter(c => c.is_coordinateur).length === 0 && (
                  <p className="text-[10px] text-amber-600 mt-1">Aucun chauffeur marque comme coordinateur (fiche chauffeur).</p>
                )}
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-500 uppercase mb-1">Ligne supervisee</label>
                <select
                  value={coordForm.ligne_id}
                  onChange={(e) => setCoordForm({ ...coordForm, ligne_id: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 outline-none"
                  required
                >
                  <option value="">-- Selectionner --</option>
                  {lignes.map(l => (
                    <option key={l.id} value={l.id}>{l.code} - {l.nom}</option>
                  ))}
                </select>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-gray-500 uppercase mb-1">Debut</label>
                  <input
                    type="datetime-local"
                    value={coordForm.date_debut}
                    onChange={(e) => setCoordForm({ ...coordForm, date_debut: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 outline-none"
                    required
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-500 uppercase mb-1">Fin</label>
                  <input
                    type="datetime-local"
                    value={coordForm.date_fin}
                    onChange={(e) => setCoordForm({ ...coordForm, date_fin: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 outline-none"
                    required
                  />
                </div>
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-500 uppercase mb-1">Notes</label>
                <textarea
                  value={coordForm.notes}
                  onChange={(e) => setCoordForm({ ...coordForm, notes: e.target.value })}
                  rows={2}
                  placeholder="Ex: Coordination matin ligne 3..."
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 outline-none resize-none"
                />
              </div>
              <div className="flex items-center justify-between py-2 px-1">
                <div>
                  <label className="text-xs font-semibold text-gray-500 uppercase">Brouillon</label>
                  <p className="text-[10px] text-gray-400 mt-0.5">Non publie, invisible pour le coordinateur</p>
                </div>
                <button
                  type="button"
                  onClick={() => setCoordForm({ ...coordForm, is_brouillon: !coordForm.is_brouillon })}
                  className={`relative w-11 h-6 rounded-full transition-colors ${coordForm.is_brouillon ? 'bg-blue-600' : 'bg-gray-200'}`}
                >
                  <span className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform ${coordForm.is_brouillon ? 'translate-x-5' : ''}`} />
                </button>
              </div>
              <div className="flex gap-3 pt-2">
                {editingCoord && (
                  <button type="button" onClick={handleDeleteCoord} className="px-3 py-2.5 text-red-600 border border-red-200 rounded-xl text-sm font-medium hover:bg-red-50 transition-colors">
                    Supprimer
                  </button>
                )}
                <button type="button" onClick={() => { setShowCoord(false); setEditingCoord(null); }} className="flex-1 px-3 py-2.5 border border-gray-200 text-gray-700 rounded-xl text-sm font-medium hover:bg-gray-50 transition-colors">
                  Annuler
                </button>
                <button type="submit" className="flex-1 px-3 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-sm font-medium transition-colors">
                  {editingCoord ? 'Modifier' : 'Definir le creneau'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
