import { useEffect, useState, useMemo, useRef, useCallback } from 'react';
import { supabase } from '../lib/supabase';
import { ChevronLeft, ChevronRight, Plus, Copy, Printer, X, RefreshCw, FileEdit, Send, Shield, Download, Upload, UserCheck, Trash2, CheckSquare, ArrowLeftRight } from 'lucide-react';
import type { User } from '@supabase/supabase-js';
import { mDateStr, mInputStr, mParts, mHour, mDow, mSameDay, mMidnightISO, mInputToISO, mMondayStr, mNoon, mAddDaysStr, MAYOTTE_OFFSET, fmtHM, fmtMonthYear } from '../lib/mayotte';

type ViewMode = 'jour' | 'semaine' | 'mois' | 'liste';
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
  statut: string;
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

// ===== Tout est raisonne en HEURE DE MAYOTTE (module ../lib/mayotte) =====
// Les instants (courses, new Date()) sont absolus ; on lit TOUJOURS leurs
// composantes en heure de Mayotte -> le fuseau du PC du directeur n'a aucun effet.
const p2 = (n: number) => String(n).padStart(2, '0');
const toLocalDateStr = (d: Date | string) => mDateStr(d);          // "YYYY-MM-DD" Mayotte
const getTimezoneOffsetStr = (_d?: Date) => MAYOTTE_OFFSET;
const mayotteInputToISO = mInputToISO;
const isoToMayotteInput = (iso: string) => mInputStr(iso);
const toLocalDateTimeStrTz = (d: Date) => mInputToISO(mInputStr(d));

const FR_DAYS = ['Dim', 'Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam'];
const FR_MONTHS = ['Jan', 'Fev', 'Mar', 'Avr', 'Mai', 'Juin', 'Juil', 'Aout', 'Sep', 'Oct', 'Nov', 'Dec'];
function formatDateFr(d: Date): string {
  const p = mParts(d);
  return `${FR_DAYS[p.dow]} ${p.d} ${FR_MONTHS[p.mo]} ${p.y}`;
}

// Lundi (ancre a MIDI heure de Mayotte, pour que getDate/getDay du navigateur au
// rendu tombent sur le bon jour) de la semaine contenant d.
function getMonday(d: Date): Date { return mNoon(mMondayStr(d)); }
const isSameDay = (a: Date | string, b: Date | string) => mSameDay(a, b);

function parseCourseDate(dateStr: string): Date {
  if (dateStr.endsWith('Z') || dateStr.includes('+')) return new Date(dateStr);
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
  const [reassignTargetId, setReassignTargetId] = useState('');

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
      supabase.from('chauffeurs').select('id, code, nom, prenom, ligne_id, is_coordinateur, statut').order('code, nom'),
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
    // Bornes en MINUIT de Mayotte (instants absolus), independantes du fuseau du
    // navigateur -> memes fenetres de journee que l'appli chauffeur/coordinateur.
    const p = mParts(currentDate);
    let fromStr: string, toStr: string;
    if (view === 'jour' || view === 'liste') {
      fromStr = mDateStr(currentDate);
      toStr = mAddDaysStr(fromStr, 1);
    } else if (view === 'semaine') {
      fromStr = mMondayStr(currentDate);
      toStr = mAddDaysStr(fromStr, 7);
    } else {
      fromStr = `${p.y}-${p2(p.mo + 1)}-01`;
      const ny = p.mo === 11 ? p.y + 1 : p.y;
      const nmo = p.mo === 11 ? 0 : p.mo + 1;
      toStr = `${ny}-${p2(nmo + 1)}-01`;
    }
    return { from: mMidnightISO(fromStr), to: mMidnightISO(toStr) };
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
    // currentDate est ancre a MIDI d'un jour de Mayotte ; on navigue en jours de
    // Mayotte (independant du fuseau du navigateur).
    const dayStr = mDateStr(currentDate);
    if (view === 'jour' || view === 'liste') setCurrentDate(mNoon(mAddDaysStr(dayStr, dir)));
    else if (view === 'semaine') setCurrentDate(mNoon(mAddDaysStr(dayStr, dir * 7)));
    else {
      const p = mParts(currentDate);
      let y = p.y, mo = p.mo + dir;
      if (mo < 0) { mo = 11; y--; }
      if (mo > 11) { mo = 0; y++; }
      setCurrentDate(mNoon(`${y}-${p2(mo + 1)}-01`));
    }
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
  const [dupCalMonth, setDupCalMonth] = useState(new Date());
  const [dupIncludeAstreintes, setDupIncludeAstreintes] = useState(false);
  const [dupIncludeCreneaux, setDupIncludeCreneaux] = useState(false);

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
    setDupCalMonth(new Date(currentDate.getFullYear(), currentDate.getMonth(), 1));
    setDupIncludeAstreintes(false);
    setDupIncludeCreneaux(false);
    // Pre-select all duplicable courses in current view
    const duplicable = getDuplicableCourses();
    setDupSelectedIds(new Set(duplicable.map(c => c.id)));
    setShowDuplicate(true);
  }

  function getDuplicableCourses(): Course[] {
    // Comparaison par JOUR (ou SEMAINE) de Mayotte, sans bornes d'instants.
    if (view === 'jour') {
      return courses.filter(c => isDuplicable(c) && mSameDay(c.date_heure, currentDate));
    }
    const wk = mMondayStr(currentDate);
    return courses.filter(c => isDuplicable(c) && mMondayStr(c.date_heure) === wk);
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

  // Astreintes / creneaux coordinateur de la vue courante (jour ou semaine),
  // filtres sur leur date de debut, pour duplication en meme temps que les courses.
  function inCurrentView(dateStr: string): boolean {
    if (view === 'jour') return mSameDay(dateStr, currentDate);
    return mMondayStr(dateStr) === mMondayStr(currentDate);
  }

  function getDuplicableAstreintes(): Astreinte[] {
    return astreintes.filter(a => inCurrentView(a.date_debut));
  }

  function getDuplicableCreneaux(): CoordCreneau[] {
    return coordCreneaux.filter(cc => inCurrentView(cc.date_debut));
  }

  // Decale un instant de nDays jours en CONSERVANT l'heure de Mayotte (mur).
  // On manipule la date via les champs Mayotte pour rester invariant au fuseau
  // du navigateur (Mayotte n'a pas de changement d'heure -> pas d'ambiguite).
  function shiftDaysMayotte(iso: string, nDays: number): string {
    const m = isoToMayotteInput(iso); // "YYYY-MM-DDTHH:MM" en heure de Mayotte
    const base = new Date(m + ':00Z');
    base.setUTCDate(base.getUTCDate() + nDays);
    const p = (n: number) => String(n).padStart(2, '0');
    return mayotteInputToISO(`${base.getUTCFullYear()}-${p(base.getUTCMonth() + 1)}-${p(base.getUTCDate())}T${m.slice(11, 16)}`);
  }
  function shiftRange(debutStr: string, finStr: string, nDays: number): { date_debut: string; date_fin: string } {
    return { date_debut: shiftDaysMayotte(debutStr, nDays), date_fin: shiftDaysMayotte(finStr, nDays) };
  }

  // Nombre de jours (entier) entre le jour de Mayotte de la source et un jour cible "YYYY-MM-DD".
  function daysToTargetStr(sourceDebutStr: string, targetDateStr: string): number {
    return Math.round((mNoon(targetDateStr).getTime() - mNoon(mDateStr(sourceDebutStr)).getTime()) / 86400000);
  }

  async function handleDuplicate() {
    if (dupSelectedIds.size === 0 && !dupIncludeAstreintes && !dupIncludeCreneaux) {
      alert('Selectionnez au moins une course, ou cochez les astreintes / creneaux a dupliquer');
      return;
    }
    setDupLoading(true);
    let skippedDup = 0;
    try {
      // On respecte le filtre chauffeur de la modale : sans ca, des courses
      // cochees mais masquees (autres chauffeurs) etaient dupliquees a l'insu.
      const sourceCourses = getDuplicableCourses().filter(c => dupSelectedIds.has(c.id) && (!dupChauffeurFilter || c.chauffeur_id === dupChauffeurFilter));
      const sourceAstreintes = dupIncludeAstreintes ? getDuplicableAstreintes() : [];
      const sourceCreneaux = dupIncludeCreneaux ? getDuplicableCreneaux() : [];

      const newCourses: Array<Record<string, unknown>> = [];
      const newAstreintes: Array<Record<string, unknown>> = [];
      const newCreneaux: Array<Record<string, unknown>> = [];

      const buildAstreinte = (a: Astreinte, nDays: number) => {
        const { date_debut, date_fin } = shiftRange(a.date_debut, a.date_fin, nDays);
        newAstreintes.push({
          chauffeur_id: a.chauffeur_id, ligne_id: a.ligne_id, coordinateur_id: a.coordinateur_id,
          date_debut, date_fin, notes: a.notes, is_brouillon: true, user_id: user.id,
        });
      };
      const buildCreneau = (cc: CoordCreneau, nDays: number) => {
        const { date_debut, date_fin } = shiftRange(cc.date_debut, cc.date_fin, nDays);
        newCreneaux.push({
          coordinateur_id: cc.coordinateur_id, ligne_id: cc.ligne_id,
          date_debut, date_fin, notes: cc.notes, is_brouillon: true, user_id: user.id,
        });
      };

      if (dupTargetDates.length > 0) {
        // En vue Semaine, un jour cible ne recoit que les elements du MEME jour
        // de semaine (lundi->lundi...) : cocher plusieurs jours reconstitue la
        // semaine sans tout ecraser sur une seule date. En vue Jour, tout le
        // jour source est copie sur chaque jour coche (quel que soit le jour).
        const sameDow = (srcStr: string, targetStr: string) => mDow(srcStr) === mDow(mNoon(targetStr));
        dupTargetDates.forEach(targetDateStr => {
          const courseSrc = view !== 'jour' ? sourceCourses.filter(c => sameDow(c.date_heure, targetDateStr)) : sourceCourses;
          const astrSrc = view !== 'jour' ? sourceAstreintes.filter(a => sameDow(a.date_debut, targetDateStr)) : sourceAstreintes;
          const crenSrc = view !== 'jour' ? sourceCreneaux.filter(cc => sameDow(cc.date_debut, targetDateStr)) : sourceCreneaux;
          courseSrc.forEach(c => {
            // On copie l'heure de MAYOTTE de la source sur le jour cible.
            const srcHHMM = isoToMayotteInput(c.date_heure).slice(11, 16);
            newCourses.push({
              date_heure: mayotteInputToISO(`${targetDateStr}T${srcHHMM}`),
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
          astrSrc.forEach(a => buildAstreinte(a, daysToTargetStr(a.date_debut, targetDateStr)));
          crenSrc.forEach(cc => buildCreneau(cc, daysToTargetStr(cc.date_debut, targetDateStr)));
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
            sourceAstreintes.forEach(a => buildAstreinte(a, daysToTargetStr(a.date_debut, mDateStr(targetDate))));
            sourceCreneaux.forEach(cc => buildCreneau(cc, daysToTargetStr(cc.date_debut, mDateStr(targetDate))));
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
            const nDays = weekOffset * 7;
            sourceAstreintes.forEach(a => {
              const td = new Date(a.date_debut); td.setDate(td.getDate() + nDays);
              if (!isDayAllowed(td, joursFeries)) return;
              buildAstreinte(a, nDays);
            });
            sourceCreneaux.forEach(cc => {
              const td = new Date(cc.date_debut); td.setDate(td.getDate() + nDays);
              if (!isDayAllowed(td, joursFeries)) return;
              buildCreneau(cc, nDays);
            });
          }
        }
      }

      // Garde anti-doublon : ne pas recreer une course identique (meme chauffeur,
      // meme instant, meme trajet) si elle existe deja pour la periode cible, ni
      // en creer deux fois dans le meme lot. Evite les "2 fois le meme trajet".
      if (newCourses.length > 0) {
        const times = newCourses.map(c => new Date(c.date_heure as string).getTime());
        const minT = new Date(Math.min(...times));
        const maxT = new Date(Math.max(...times) + 60000);
        const { data: existing } = await supabase
          .from('courses')
          .select('chauffeur_id, date_heure, depart, arrivee')
          .gte('date_heure', minT.toISOString())
          .lt('date_heure', maxT.toISOString());
        const keyOf = (chId: unknown, dh: string, dep: unknown, arr: unknown) =>
          `${chId || ''}|${new Date(dh).getTime()}|${dep || ''}|${arr || ''}`;
        const seen = new Set((existing || []).map(e => keyOf(e.chauffeur_id, e.date_heure as string, e.depart, e.arrivee)));
        const deduped: Array<Record<string, unknown>> = [];
        for (const c of newCourses) {
          const k = keyOf(c.chauffeur_id, c.date_heure as string, c.depart, c.arrivee);
          if (seen.has(k)) continue; // existe deja en base ou deja ajoute dans ce lot
          seen.add(k);
          deduped.push(c);
        }
        skippedDup = newCourses.length - deduped.length;
        newCourses.length = 0;
        newCourses.push(...deduped);
      }

      const totalNew = newCourses.length + newAstreintes.length + newCreneaux.length;
      if (totalNew === 0) {
        alert(skippedDup > 0
          ? `Rien a dupliquer : les ${skippedDup} course(s) existent deja pour la periode cible (aucun doublon cree).`
          : 'Aucun jour cible ne correspond aux criteres');
        setDupLoading(false);
        return;
      }

      const parts: string[] = [];
      if (newCourses.length) parts.push(`${newCourses.length} course(s)`);
      if (newAstreintes.length) parts.push(`${newAstreintes.length} astreinte(s)`);
      if (newCreneaux.length) parts.push(`${newCreneaux.length} creneau(x) coordinateur`);
      const skipNote = skippedDup > 0 ? `\n(${skippedDup} course(s) deja existante(s) ignoree(s))` : '';
      if (!confirm(`${parts.join(', ')} vont etre crees en brouillon.${skipNote} Continuer ?`)) {
        setDupLoading(false);
        return;
      }

      // Helper d'insertion par lots ; renvoie le nombre insere, stoppe et alerte en cas d'erreur.
      const insertBatched = async (table: string, rows: Array<Record<string, unknown>>, label: string) => {
        let done = 0;
        for (let i = 0; i < rows.length; i += 50) {
          const batch = rows.slice(i, i + 50);
          const { error } = await supabase.from(table).insert(batch);
          if (error) {
            alert(`Erreur lors de la duplication des ${label} : ${done} cree(s) sur ${rows.length} avant l'echec.\n${error.message}`);
            return { done, ok: false };
          }
          done += batch.length;
        }
        return { done, ok: true };
      };

      const resCourses = await insertBatched('courses', newCourses, 'courses');
      const insAstreintes = resCourses.ok ? await insertBatched('astreintes', newAstreintes, 'astreintes') : { done: 0, ok: false };
      const insCreneaux = (resCourses.ok && insAstreintes.ok) ? await insertBatched('coordinateur_creneaux', newCreneaux, 'creneaux coordinateur') : { done: 0, ok: false };

      const resume: string[] = [];
      if (resCourses.done) resume.push(`${resCourses.done} course(s)`);
      if (insAstreintes.done) resume.push(`${insAstreintes.done} astreinte(s)`);
      if (insCreneaux.done) resume.push(`${insCreneaux.done} creneau(x)`);
      if (resume.length) {
        alert(`Duplique en brouillon avec succes : ${resume.join(', ')}.${skippedDup > 0 ? `\n${skippedDup} doublon(s) ignore(s).` : ''}`);
        await logAction('duplicate', 'courses', null, `Duplication: ${resume.join(', ')} crees en brouillon`, null, { courses: resCourses.done, astreintes: insAstreintes.done, creneaux: insCreneaux.done });
      }
      setShowDuplicate(false);
      loadCourses();
      loadAstreintes();
      loadCoordCreneaux();
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
        fmtHM(c.date_heure),
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
    // Heure par defaut construite en heure de MAYOTTE (jour affiche + heure H).
    const defaultHour = hour !== undefined ? hour : 8;
    const dateHeureDefault = `${mDateStr(currentDate)}T${p2(defaultHour)}:00`;
    const chauffeur = chauffeurId ? chauffeurs.find(c => c.id === chauffeurId) : null;
    const ligne = chauffeur?.ligne_id ? lignes.find(l => l.id === chauffeur.ligne_id) : null;

    const saved = localStorage.getItem('planning_last_course');
    const last = saved ? JSON.parse(saved) : null;

    setForm({
      date_heure: dateHeureDefault,
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
    setForm({
      // On remplit l'input avec l'heure de MAYOTTE de l'instant stocke (pas
      // l'heure du navigateur), pour qu'un enregistrement sans changement ne
      // decale pas l'horaire.
      date_heure: isoToMayotteInput(course.date_heure),
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
    setAstreinteForm({
      chauffeur_id: astreinte.chauffeur_id,
      ligne_id: astreinte.ligne_id,
      coordinateur_id: astreinte.coordinateur_id || '',
      date_debut: isoToMayotteInput(astreinte.date_debut),
      date_fin: isoToMayotteInput(astreinte.date_fin),
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
      date_debut: mayotteInputToISO(astreinteForm.date_debut),
      date_fin: mayotteInputToISO(astreinteForm.date_fin),
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
      date_debut: isoToMayotteInput(creneau.date_debut),
      date_fin: isoToMayotteInput(creneau.date_fin),
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
      date_debut: mayotteInputToISO(coordForm.date_debut),
      date_fin: mayotteInputToISO(coordForm.date_fin),
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
    const payload = {
      ...form,
      // L'heure saisie est une heure de Mayotte (offset fixe), pas l'heure du
      // navigateur du planificateur (qui peut etre en metropole/Reunion).
      date_heure: mayotteInputToISO(form.date_heure),
      chauffeur_id: form.chauffeur_id || null,
      client_id: form.client_id || null,
      ligne_id: form.ligne_id || null,
      coordinateur_id: form.coordinateur_id || null,
      user_id: user.id,
    };
    if (editingCourse) {
      const { error, count } = await supabase.from('courses').update(payload, { count: 'exact' }).eq('id', editingCourse.id);
      if (error) { alert(`Enregistrement impossible : ${error.message}`); return; }
      if (!count) { alert('Enregistrement impossible : course introuvable ou droits insuffisants.'); return; }
      const chauffeur = chauffeurs.find(c => c.id === form.chauffeur_id);
      await logAction('update', 'courses', editingCourse.id, `Course modifiee: ${form.depart} → ${form.arrivee}${chauffeur ? ` (${chauffeur.prenom} ${chauffeur.nom})` : ''}`, editingCourse as unknown as Record<string, unknown>, payload);
    } else {
      const { data, error } = await supabase.from('courses').insert(payload).select('id').maybeSingle();
      if (error) { alert(`Creation impossible : ${error.message}`); return; }
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

  // Une course est "reaffectable" tant qu'elle n'est pas demarree/terminee ni
  // deja remplacee/annulee/incident : on ne bascule que du PLANIFIE non realise.
  function isReassignable(c: Course): boolean {
    return !['en_cours', 'termine', 'terminee', 'remplace', 'annule', 'incident'].includes(c.statut_realisation || '');
  }

  // Coche toutes les courses reaffectables d'un chauffeur, dans la vue courante
  // (jour / semaine / mois de Mayotte) — pour basculer un chauffeur absent en un clic.
  function selectAllForChauffeur(chId: string) {
    if (!chId) return;
    const inView = courses.filter(c => {
      if (view === 'jour') return mSameDay(c.date_heure, currentDate);
      if (view === 'semaine') return mMondayStr(c.date_heure) === mMondayStr(currentDate);
      const p = mParts(c.date_heure), cur = mParts(currentDate);
      return p.y === cur.y && p.mo === cur.mo; // mois / liste
    });
    const ids = inView.filter(c => c.chauffeur_id === chId && isReassignable(c)).map(c => c.id);
    if (ids.length === 0) { alert('Aucune course planifiee non realisee pour ce chauffeur dans la vue affichee.'); return; }
    setSelectedCourseIds(new Set(ids));
  }

  // Bascule les courses cochees (PLANIFIEES non realisees) vers un autre chauffeur.
  async function handleBatchReassign() {
    if (selectedCourseIds.size === 0 || !reassignTargetId) return;
    const selected = courses.filter(c => selectedCourseIds.has(c.id));
    const okIds = selected.filter(isReassignable).map(c => c.id);
    const blocked = selected.length - okIds.length;
    if (okIds.length === 0) { alert('Aucune course reaffectable dans la selection (deja demarrees / terminees).'); return; }
    const target = chauffeurs.find(c => c.id === reassignTargetId);
    const nom = target ? `${target.code} ${target.prenom} ${target.nom}`.trim() : 'ce chauffeur';
    if (!confirm(`Reaffecter ${okIds.length} course(s) a ${nom} ?${blocked > 0 ? `\n${blocked} course(s) deja realisee(s) ignoree(s).` : ''}`)) return;
    const { error, count } = await supabase.from('courses').update({ chauffeur_id: reassignTargetId }, { count: 'exact' }).in('id', okIds);
    if (error) { alert('Reaffectation impossible : ' + error.message); return; }
    if (!count) { alert('Aucune course reaffectee (droits insuffisants ?).'); return; }
    await logAction('update', 'courses', null, `Reaffectation en lot: ${count} course(s) -> ${nom}`, null, { ids: okIds, chauffeur_id: reassignTargetId });
    setSelectedCourseIds(new Set());
    setSelectMode(false);
    setReassignTargetId('');
    loadCourses();
  }

  async function handleReplace() {
    if (!editingCourse || !replaceChauffeurId) return;
    const oldChauffeur = chauffeurs.find(c => c.id === editingCourse.chauffeur_id);
    const newChauffeur = chauffeurs.find(c => c.id === replaceChauffeurId);
    // On marque l'originale remplacee de facon CONDITIONNELLE et controlee : si
    // l'update echoue (0 ligne / RLS), on n'insere PAS le remplacant (sinon deux
    // courses actives au meme horaire, les deux chauffeurs se presentent).
    const { error: updErr, count: updCount } = await supabase
      .from('courses')
      .update({ statut_realisation: 'remplace' }, { count: 'exact' })
      .eq('id', editingCourse.id)
      .neq('statut_realisation', 'remplace');
    if (updErr) { alert(`Remplacement impossible : ${updErr.message}`); return; }
    if (!updCount) { alert('Remplacement impossible : course deja remplacee, introuvable ou droits insuffisants.'); return; }
    // Duplicate course onto the new chauffeur ; on recopie is_brouillon / is_astreinte
    // (remplacer un brouillon ne doit pas publier immediatement une course).
    const { error: insErr } = await supabase.from('courses').insert({
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
      is_brouillon: editingCourse.is_brouillon || false,
      is_astreinte: editingCourse.is_astreinte || false,
      user_id: user.id,
    });
    if (insErr) {
      // On tente de revenir en arriere pour ne pas laisser une course "fantome".
      await supabase.from('courses').update({ statut_realisation: 'programme' }).eq('id', editingCourse.id);
      alert(`Remplacement impossible (creation du remplacant) : ${insErr.message}`);
      return;
    }
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
    // Les chauffeurs desactives ne doivent plus apparaitre dans le planning.
    let result = chauffeurs.filter(c => c.statut === 'actif');
    if (lineFilter !== 'all') {
      // Tri par la ligne DE LA COURSE (pas seulement la ligne par defaut du
      // chauffeur) : un chauffeur permute temporairement sur une autre ligne
      // apparait des qu'il a une course sur la ligne filtree.
      const chauffeurIdsOnLine = new Set(
        courses.filter(c => c.ligne_id === lineFilter && c.chauffeur_id).map(c => c.chauffeur_id as string)
      );
      result = result.filter(c => c.ligne_id === lineFilter || chauffeurIdsOnLine.has(c.id));
    }
    if (chauffeurFilter !== 'all') {
      result = result.filter(c => c.id === chauffeurFilter);
    }
    return result;
  }, [chauffeurs, courses, lineFilter, chauffeurFilter]);

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
      // Quand une ligne est filtree, on regroupe tout le monde sous cette ligne
      // (la ligne de la course), pas sous la ligne par defaut de chaque chauffeur.
      const key = lineFilter !== 'all' ? lineFilter : c.ligne_id;
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key)!.push(c);
    });
    return groups;
  }, [filteredChauffeurs, lineFilter]);

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
    // Position sur la grille selon l'heure de MAYOTTE (pas l'heure du navigateur).
    const h = mHour(course.date_heure);
    const startOffset = h - START_HOUR;
    const duration = (course.duree_minutes || 60) / 60;
    return {
      left: `${(Math.max(0, startOffset) / TOTAL_HOURS) * 100}%`,
      width: `${(duration / TOTAL_HOURS) * 100}%`,
    };
  }

  // Jours (ancres a midi Mayotte) : getDay()/getDate() au rendu tombent sur le bon jour.
  const weekDays = useMemo(() => {
    const monday = mMondayStr(currentDate);
    return Array.from({ length: 7 }, (_, i) => mNoon(mAddDaysStr(monday, i)));
  }, [currentDate]);

  const monthDays = useMemo(() => {
    const p = mParts(currentDate);
    const days: Date[] = [];
    let ds = `${p.y}-${p2(p.mo + 1)}-01`;
    while (mParts(mNoon(ds)).mo === p.mo) { days.push(mNoon(ds)); ds = mAddDaysStr(ds, 1); }
    return days;
  }, [currentDate]);

  const headerTitle = (view === 'jour' || view === 'liste')
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
              <p className="text-[10px] text-gray-500 uppercase tracking-wide font-semibold">Planning {view === 'jour' ? 'Journee' : view === 'semaine' ? 'Semaine' : view === 'mois' ? 'Mois' : 'Liste'}</p>
              <h1 className="text-lg font-bold text-gray-900">{headerTitle}</h1>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <div className="flex border border-gray-200 rounded-lg overflow-hidden">
              {(['jour', 'semaine', 'mois', 'liste'] as ViewMode[]).map(v => (
                <button key={v} onClick={() => setView(v)} className={`px-3 py-1.5 text-xs font-medium transition-colors ${view === v ? 'bg-gray-900 text-white' : 'bg-white text-gray-600 hover:bg-gray-50'}`}>
                  {v === 'jour' ? 'Jour' : v === 'semaine' ? 'Semaine' : v === 'mois' ? 'Mois' : 'Liste'}
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
            {selectMode && (
              <select
                value=""
                onChange={(e) => selectAllForChauffeur(e.target.value)}
                title="Cocher toutes les courses non realisees d'un chauffeur (vue affichee)"
                className="px-2 py-1.5 text-xs font-medium bg-white text-gray-700 border border-gray-200 rounded-lg outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="">Tout sélectionner pour…</option>
                {chauffeurs.map(c => <option key={c.id} value={c.id}>{c.code} — {c.prenom} {c.nom}</option>)}
              </select>
            )}
            {selectMode && selectedCourseIds.size > 0 && (
              <>
                <select
                  value={reassignTargetId}
                  onChange={(e) => setReassignTargetId(e.target.value)}
                  className="px-2 py-1.5 text-xs font-medium bg-white text-gray-700 border border-gray-200 rounded-lg outline-none focus:ring-2 focus:ring-emerald-500"
                >
                  <option value="">Réaffecter à…</option>
                  {chauffeurs.map(c => <option key={c.id} value={c.id}>{c.code} — {c.prenom} {c.nom}</option>)}
                </select>
                <button onClick={handleBatchReassign} disabled={!reassignTargetId} className="px-3 py-1.5 text-xs font-medium bg-emerald-600 hover:bg-emerald-700 disabled:opacity-40 disabled:cursor-not-allowed text-white rounded-lg transition-colors flex items-center gap-1.5">
                  <ArrowLeftRight className="w-3.5 h-3.5" /> Réaffecter ({selectedCourseIds.size})
                </button>
                <button onClick={handleBatchDelete} className="px-3 py-1.5 text-xs font-medium bg-red-600 hover:bg-red-700 text-white rounded-lg transition-colors flex items-center gap-1.5">
                  <Trash2 className="w-3.5 h-3.5" /> Supprimer ({selectedCourseIds.size})
                </button>
              </>
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
              {chauffeurs.filter(c => c.statut === 'actif').map(c => (
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
                            const time = fmtHM(course.date_heure);
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
                              const dayStart = new Date(new Date(mMidnightISO(mDateStr(currentDate))).getTime() + START_HOUR * 3600000);
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
                              const dayStart = new Date(new Date(mMidnightISO(mDateStr(currentDate))).getTime() + START_HOUR * 3600000);
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
                        const time = fmtHM(course.date_heure);
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
                              {isBrouillon ? '✎ ' : isRemplacee ? '⟳ ' : ''}{fmtHM(c.date_heure)} {c.depart} → {c.arrivee}
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
                              ⚠ {fmtHM(c.date_heure)} {c.depart} → {c.arrivee}
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
                          {fmtHM(c.date_heure)}
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

      {/* List View */}
      {view === 'liste' && (() => {
        const jour = [...filteredCourses]
          .filter(c => isSameDay(parseCourseDate(c.date_heure), currentDate))
          .sort((a, b) => a.date_heure.localeCompare(b.date_heure));
        const statutBadge = (c: Course) => {
          const s = c.is_brouillon ? 'brouillon' : (c.statut_realisation || 'programme');
          const map: Record<string, [string, string]> = {
            brouillon: ['Brouillon', 'bg-blue-100 text-blue-700'],
            programme: ['Programme', 'bg-gray-100 text-gray-600'],
            en_cours: ['En cours', 'bg-green-100 text-green-700'],
            termine: ['Termine', 'bg-green-100 text-green-700'],
            terminee: ['Termine', 'bg-green-100 text-green-700'],
            en_retard: ['En retard', 'bg-yellow-100 text-yellow-700'],
            remplace: ['Remplace', 'bg-red-100 text-red-700'],
            annule: ['Annule', 'bg-red-100 text-red-700'],
          };
          const [lab, cls] = map[s] || [s, 'bg-gray-100 text-gray-600'];
          return <span className={`text-[10px] font-semibold px-2 py-0.5 rounded ${cls}`}>{lab}</span>;
        };
        return (
          <div className="px-6 pb-6">
            <div className="border border-gray-200 rounded-lg overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 border-b border-gray-200 text-[10px] uppercase text-gray-500">
                  <tr>
                    <th className="text-left px-3 py-2 font-semibold">Heure</th>
                    <th className="text-left px-3 py-2 font-semibold">Chauffeur</th>
                    <th className="text-left px-3 py-2 font-semibold">Ligne</th>
                    <th className="text-left px-3 py-2 font-semibold">Trajet</th>
                    <th className="text-left px-3 py-2 font-semibold">Periode</th>
                    <th className="text-left px-3 py-2 font-semibold">Statut</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {jour.map(course => {
                    const ch = chauffeurs.find(x => x.id === course.chauffeur_id);
                    const li = course.ligne_id ? lignes.find(x => x.id === course.ligne_id) : null;
                    const selected = selectMode && selectedCourseIds.has(course.id);
                    return (
                      <tr key={course.id} onClick={() => onCourseClick(course)} className={`cursor-pointer transition-colors ${selected ? 'bg-blue-50' : 'hover:bg-amber-50/40'}`}>
                        <td className="px-3 py-2 font-medium text-gray-900 whitespace-nowrap">{fmtHM(course.date_heure)}</td>
                        <td className="px-3 py-2 whitespace-nowrap">{ch ? `${ch.code} ${ch.nom} ${ch.prenom}` : <span className="text-amber-600 font-medium">Non affecte</span>}</td>
                        <td className="px-3 py-2">{li && <span className="text-[10px] px-1.5 py-0.5 rounded text-white font-medium" style={{ backgroundColor: li.couleur || '#6b7280' }}>{li.code}</span>}</td>
                        <td className="px-3 py-2 text-gray-700">{course.depart} → {course.arrivee}</td>
                        <td className="px-3 py-2 text-gray-500">{periodeLabels[course.periode] || course.periode}</td>
                        <td className="px-3 py-2">{statutBadge(course)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              {jour.length === 0 && (
                <div className="p-8 text-center text-gray-400 text-sm">Aucune course ce jour</div>
              )}
            </div>
            <p className="text-[10px] text-gray-400 mt-2">{jour.length} course(s) · {formatDateFr(currentDate)}</p>
          </div>
        );
      })()}

      {/* Duplication Modal */}
      {showDuplicate && (() => {
        const duplicable = getDuplicableCourses();
        const filteredDup = dupChauffeurFilter
          ? duplicable.filter(c => c.chauffeur_id === dupChauffeurFilter)
          : duplicable;
        const chauffeurIdsInView = [...new Set(duplicable.map(c => c.chauffeur_id).filter(Boolean))];

        // Calendrier jour-par-jour (cible de duplication). Les jours cochés
        // alimentent dupTargetDates ('YYYY-MM-DD'), gérés par handleDuplicate.
        const calFirst = new Date(dupCalMonth.getFullYear(), dupCalMonth.getMonth(), 1);
        const calDays: Date[] = [];
        for (let d = new Date(calFirst); d.getMonth() === calFirst.getMonth(); d.setDate(d.getDate() + 1)) calDays.push(new Date(d));
        const leadBlanks = (calFirst.getDay() || 7) - 1; // lundi = 0
        const dupWeekStart = getMonday(currentDate);
        const dupWeekEnd = new Date(dupWeekStart); dupWeekEnd.setDate(dupWeekEnd.getDate() + 7);
        const isSourceDay = (d: Date) => view === 'jour' ? isSameDay(d, currentDate) : (d >= dupWeekStart && d < dupWeekEnd);
        const toggleDay = (d: Date) => {
          const key = toLocalDateStr(d);
          setDupTargetDates(prev => prev.includes(key) ? prev.filter(x => x !== key) : [...prev, key].sort());
        };
        const selectMonthWeekdays = () => {
          const keys = calDays.filter(d => !isSourceDay(d) && d.getDay() >= 1 && d.getDay() <= 5).map(toLocalDateStr);
          setDupTargetDates(prev => Array.from(new Set([...prev, ...keys])).sort());
        };

        return (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl w-full max-w-lg shadow-2xl max-h-[90vh] flex flex-col">
            <div className="p-5 border-b border-gray-100 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 bg-amber-50 rounded-lg flex items-center justify-center">
                  <Copy className="w-4 h-4 text-amber-600" />
                </div>
                <div>
                  <h3 className="font-bold text-gray-900">Dupliquer le planning</h3>
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
                          <span className="text-xs font-medium text-gray-800">{view === 'semaine' ? <span className="text-amber-600 capitalize mr-1">{FR_DAYS[mDow(c.date_heure)]}</span> : null}{fmtHM(c.date_heure)}</span>
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

              {/* Autres elements a inclure */}
              <div>
                <label className="text-xs font-semibold text-gray-500 uppercase mb-2 block">Inclure aussi</label>
                <div className="space-y-1.5">
                  <label className="flex items-center gap-3 px-3 py-2 border border-gray-200 rounded-lg hover:bg-gray-50 cursor-pointer">
                    <input type="checkbox" checked={dupIncludeAstreintes} onChange={(e) => setDupIncludeAstreintes(e.target.checked)} className="w-4 h-4 rounded border-gray-300 text-amber-600 focus:ring-amber-500" />
                    <span className="text-xs font-medium text-gray-800 flex-1">Les astreintes</span>
                    <span className="text-[10px] text-gray-400">{getDuplicableAstreintes().length} sur la {view === 'jour' ? 'journee' : 'semaine'}</span>
                  </label>
                  <label className="flex items-center gap-3 px-3 py-2 border border-gray-200 rounded-lg hover:bg-gray-50 cursor-pointer">
                    <input type="checkbox" checked={dupIncludeCreneaux} onChange={(e) => setDupIncludeCreneaux(e.target.checked)} className="w-4 h-4 rounded border-gray-300 text-amber-600 focus:ring-amber-500" />
                    <span className="text-xs font-medium text-gray-800 flex-1">Les creneaux coordinateur</span>
                    <span className="text-[10px] text-gray-400">{getDuplicableCreneaux().length} sur la {view === 'jour' ? 'journee' : 'semaine'}</span>
                  </label>
                </div>
              </div>

              {/* Step 2: Target - calendrier jour par jour a cocher */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="text-xs font-semibold text-gray-500 uppercase">2. Dupliquer vers quels jours ?</label>
                  <span className="text-[10px] text-gray-400">{dupTargetDates.length} jour(s) coche(s)</span>
                </div>
                <div className="border border-gray-200 rounded-lg p-3">
                  {/* Navigation mois */}
                  <div className="flex items-center justify-between mb-2">
                    <button type="button" onClick={() => setDupCalMonth(new Date(dupCalMonth.getFullYear(), dupCalMonth.getMonth() - 1, 1))} className="p-1 rounded hover:bg-gray-100 text-gray-500"><ChevronLeft className="w-4 h-4" /></button>
                    <span className="text-xs font-semibold text-gray-700 capitalize">{fmtMonthYear(dupCalMonth)}</span>
                    <button type="button" onClick={() => setDupCalMonth(new Date(dupCalMonth.getFullYear(), dupCalMonth.getMonth() + 1, 1))} className="p-1 rounded hover:bg-gray-100 text-gray-500"><ChevronRight className="w-4 h-4" /></button>
                  </div>
                  {/* Entetes jours */}
                  <div className="grid grid-cols-7 gap-1 mb-1">
                    {['Lu', 'Ma', 'Me', 'Je', 'Ve', 'Sa', 'Di'].map(w => (
                      <div key={w} className="text-center text-[9px] font-semibold text-gray-400 uppercase">{w}</div>
                    ))}
                  </div>
                  {/* Grille des jours */}
                  <div className="grid grid-cols-7 gap-1">
                    {Array.from({ length: leadBlanks }).map((_, i) => <div key={`b${i}`} />)}
                    {calDays.map(d => {
                      const key = toLocalDateStr(d);
                      const checked = dupTargetDates.includes(key);
                      const source = isSourceDay(d);
                      return (
                        <button
                          key={key}
                          type="button"
                          disabled={source}
                          onClick={() => toggleDay(d)}
                          title={source ? 'Jour source (non duplicable sur lui-meme)' : ''}
                          className={`relative h-8 rounded text-[11px] font-medium border transition-colors flex items-center justify-center ${
                            source
                              ? 'bg-gray-100 text-gray-300 border-gray-100 cursor-not-allowed'
                              : checked
                                ? 'bg-amber-600 text-white border-amber-600'
                                : 'bg-white text-gray-700 border-gray-200 hover:border-amber-300'
                          }`}
                        >
                          {d.getDate()}
                          {checked && <span className="absolute top-0.5 right-0.5 w-1.5 h-1.5 bg-white rounded-full" />}
                        </button>
                      );
                    })}
                  </div>
                  {/* Actions rapides */}
                  <div className="flex items-center gap-3 mt-2 pt-2 border-t border-gray-100">
                    <button type="button" onClick={selectMonthWeekdays} className="text-[10px] text-amber-600 font-medium hover:underline">Lun–Ven du mois</button>
                    <button type="button" onClick={() => setDupTargetDates([])} className="text-[10px] text-gray-500 font-medium hover:underline">Tout decocher</button>
                  </div>
                </div>
                {/* Recap des jours coches */}
                {dupTargetDates.length > 0 && (
                  <div className="flex flex-wrap gap-1 mt-2">
                    {dupTargetDates.map(d => (
                      <span key={d} className="inline-flex items-center gap-1 px-2 py-0.5 bg-amber-50 text-amber-700 rounded text-[10px] font-medium">
                        {(() => { const p = mParts(mNoon(d)); return `${FR_DAYS[p.dow]} ${p2(p.d)} ${FR_MONTHS[p.mo]}`; })()}
                        <button type="button" onClick={() => setDupTargetDates(prev => prev.filter(x => x !== d))} className="text-amber-400 hover:text-red-500">
                          <X className="w-3 h-3" />
                        </button>
                      </span>
                    ))}
                  </div>
                )}
              </div>

              {/* Summary */}
              <div className="bg-amber-50 rounded-lg p-3 border border-amber-100">
                <p className="text-xs font-medium text-amber-800">
                  {dupSelectedIds.size} course(s){dupIncludeAstreintes ? ` + ${getDuplicableAstreintes().length} astreinte(s)` : ''}{dupIncludeCreneaux ? ` + ${getDuplicableCreneaux().length} creneau(x)` : ''} × {dupTargetDates.length} jour(s) coche(s)
                  {' '}→ crees en <span className="font-bold">brouillon</span>
                </p>
              </div>
            </div>

            <div className="p-5 border-t border-gray-100 flex gap-3">
              <button type="button" onClick={() => setShowDuplicate(false)} className="flex-1 px-3 py-2.5 border border-gray-200 text-gray-700 rounded-xl text-sm font-medium hover:bg-gray-50 transition-colors">
                Annuler
              </button>
              <button type="button" onClick={handleDuplicate}
                disabled={dupLoading || (dupSelectedIds.size === 0 && !dupIncludeAstreintes && !dupIncludeCreneaux) || dupTargetDates.length === 0}
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
                  {(() => { const p = mParts(editingCourse.date_heure); return `${p.d} ${FR_MONTHS[p.mo]} ${fmtHM(editingCourse.date_heure)}`; })()}
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
                  <select value={form.depart} onChange={(e) => setForm({ ...form, depart: e.target.value })} className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-amber-500 outline-none bg-white" required>
                    <option value="">{arretOptions.length ? '-- Arret de depart --' : '(choisir une ligne)'}</option>
                    {[...new Set([form.depart, ...arretOptions].filter(Boolean))].map(p => <option key={p} value={p}>{p}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-500 uppercase mb-1">Arrivee</label>
                  <select value={form.arrivee} onChange={(e) => setForm({ ...form, arrivee: e.target.value })} className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-amber-500 outline-none bg-white" required>
                    <option value="">{arretOptions.length ? '-- Arret d arrivee --' : '(choisir une ligne)'}</option>
                    {[...new Set([form.arrivee, ...arretOptions].filter(Boolean))].map(p => <option key={p} value={p}>{p}</option>)}
                  </select>
                </div>
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
