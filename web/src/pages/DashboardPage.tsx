import { useEffect, useState, useMemo } from 'react';
import { supabase } from '../lib/supabase';
import { AlertTriangle, Volume2, RefreshCw, X, Download, TrendingUp, TrendingDown } from 'lucide-react';

type PeriodMode = 'jour' | 'semaine' | 'mois';

interface CourseRow {
  id: string;
  date_heure: string;
  statut_realisation: string;
  statut: string;
  chauffeur_id: string | null;
  montant: number;
  duree_minutes: number | null;
  notes: string;
  ligne_id: string | null;
}

interface ChauffeurRow {
  id: string;
  code: string;
  nom: string;
  prenom: string;
  ligne_id: string | null;
}

interface LigneRow {
  id: string;
  nom: string;
  code: string;
}

interface Incident {
  id: string;
  date_heure: string;
  chauffeur_id: string;
  notes: string;
}

export function DashboardPage() {
  const [period, setPeriod] = useState<PeriodMode>('semaine');
  const [courses, setCourses] = useState<CourseRow[]>([]);
  const [prevCourses, setPrevCourses] = useState<CourseRow[]>([]);
  const [chauffeurs, setChauffeurs] = useState<ChauffeurRow[]>([]);
  const [lignes, setLignes] = useState<LigneRow[]>([]);
  const [selectedLigne, setSelectedLigne] = useState<string>('all');
  const [incidents, setIncidents] = useState<Incident[]>([]);
  const [executions, setExecutions] = useState<Array<{ id: string; course_id: string; heure_debut: string; heure_fin: string | null }>>([]);
  const [arretExecs, setArretExecs] = useState<Array<{ id: string; course_execution_id: string; montants: number; descendants: number }>>([]);
  const [tarifPlages, setTarifPlages] = useState<Array<{ type_jour: string; heure_debut: string; heure_fin: string; tarif: number; ligne_id: string | null }>>([]);
  const [showBanner, setShowBanner] = useState(true);
  const [loading, setLoading] = useState(true);
  const [fetchError, setFetchError] = useState<string | null>(null);

  const now = new Date();

  const { periodStart, periodEnd, prevStart, prevEnd, periodLabel } = useMemo(() => {
    const today = new Date();
    let ps: Date, pe: Date, prvS: Date, prvE: Date, label: string;

    if (period === 'jour') {
      ps = new Date(today.getFullYear(), today.getMonth(), today.getDate());
      pe = new Date(today.getFullYear(), today.getMonth(), today.getDate(), 23, 59, 59);
      prvS = new Date(ps.getTime() - 86400000);
      prvE = new Date(pe.getTime() - 86400000);
      label = today.toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'Indian/Mayotte' });
    } else if (period === 'semaine') {
      const day = today.getDay() || 7;
      ps = new Date(today.getFullYear(), today.getMonth(), today.getDate() - day + 1);
      pe = new Date(ps.getFullYear(), ps.getMonth(), ps.getDate() + 6, 23, 59, 59);
      prvS = new Date(ps.getTime() - 7 * 86400000);
      prvE = new Date(pe.getTime() - 7 * 86400000);
      const weekNum = Math.ceil(((today.getTime() - new Date(today.getFullYear(), 0, 1).getTime()) / 86400000 + new Date(today.getFullYear(), 0, 1).getDay() + 1) / 7);
      label = `Semaine ${weekNum}`;
    } else {
      ps = new Date(today.getFullYear(), today.getMonth(), 1);
      pe = new Date(today.getFullYear(), today.getMonth() + 1, 0, 23, 59, 59);
      prvS = new Date(today.getFullYear(), today.getMonth() - 1, 1);
      prvE = new Date(today.getFullYear(), today.getMonth(), 0, 23, 59, 59);
      label = today.toLocaleDateString('fr-FR', { month: 'long', year: 'numeric', timeZone: 'Indian/Mayotte' });
    }
    return { periodStart: ps, periodEnd: pe, prevStart: prvS, prevEnd: prvE, periodLabel: label };
  }, [period]);

  useEffect(() => {
    loadData();
  }, [periodStart, periodEnd]);

  async function loadData() {
    setLoading(true);
    setFetchError(null);
    try {
      const [cRes, prevRes, chRes, lRes, incRes, execRes, tpRes] = await Promise.all([
        supabase.from('courses')
          .select('id, date_heure, statut_realisation, statut, chauffeur_id, montant, duree_minutes, notes, ligne_id')
          .gte('date_heure', periodStart.toISOString())
          .lte('date_heure', periodEnd.toISOString()),
        supabase.from('courses')
          .select('id, date_heure, statut_realisation, statut, chauffeur_id, montant, duree_minutes, notes, ligne_id')
          .gte('date_heure', prevStart.toISOString())
          .lte('date_heure', prevEnd.toISOString()),
        supabase.from('chauffeurs').select('id, code, nom, prenom, ligne_id').eq('statut', 'actif'),
        supabase.from('lignes').select('id, nom, code').eq('active', true),
        supabase.from('courses')
          .select('id, date_heure, chauffeur_id, notes')
          .eq('statut_realisation', 'incident')
          .gte('date_heure', new Date(now.getTime() - 30 * 86400000).toISOString())
          .order('date_heure', { ascending: false }),
        supabase.from('course_executions')
          .select('id, course_id, heure_debut, heure_fin')
          .gte('heure_debut', periodStart.toISOString())
          .lte('heure_debut', periodEnd.toISOString()),
        supabase.from('tarif_plages').select('type_jour, heure_debut, heure_fin, tarif, ligne_id'),
      ]);

      const hasError = [cRes, prevRes, chRes, lRes, incRes, execRes, tpRes].some(r => r.error);
      if (hasError) {
        setFetchError('Erreur de chargement des donnees depuis le serveur.');
      }

      const execData = execRes.data || [];
      const execIds = execData.map(e => e.id);

      let arretData: Array<{ id: string; course_execution_id: string; montants: number; descendants: number }> = [];
      if (execIds.length > 0) {
        const { data } = await supabase.from('arret_executions')
          .select('id, course_execution_id, montants, descendants')
          .in('course_execution_id', execIds);
        arretData = data || [];
      }

      setCourses(cRes.data || []);
      setPrevCourses(prevRes.data || []);
      setChauffeurs(chRes.data || []);
      setLignes(lRes.data || []);
      setIncidents(incRes.data || []);
      setExecutions(execData);
      setArretExecs(arretData);
      setTarifPlages(tpRes.data || []);
    } catch (err) {
      console.error('Dashboard load error:', err);
      setFetchError('Impossible de charger les donnees. Verifiez votre connexion.');
    } finally {
      setLoading(false);
    }
  }

  const filteredCourses = useMemo(() => {
    if (selectedLigne === 'all') return courses;
    return courses.filter(c => c.ligne_id === selectedLigne);
  }, [courses, selectedLigne]);

  const filteredPrevCourses = useMemo(() => {
    if (selectedLigne === 'all') return prevCourses;
    return prevCourses.filter(c => c.ligne_id === selectedLigne);
  }, [prevCourses, selectedLigne]);

  // CA d'une course = montant saisi si > 0, sinon le tarif de la plage horaire
  // correspondante (regle metier, alignee sur ChauffeurDetail). Sans ce repli, la
  // plupart des courses (tarifees par plage, montant=0) donnaient un CA quasi nul.
  const tarifForCourse = useMemo(() => {
    const toMin = (hhmm: string) => { const [h, mi] = (hhmm || '00:00').split(':').map(Number); return (h || 0) * 60 + (mi || 0); };
    return (c: CourseRow): number => {
      if (c.montant && c.montant > 0) return c.montant;
      const d = new Date(c.date_heure);
      if (isNaN(d.getTime())) return 0;
      const dow = d.getDay();
      const typeJour = dow === 6 ? 'samedi' : dow === 0 ? 'dimanche' : 'lun_ven';
      const minutes = d.getHours() * 60 + d.getMinutes();
      const matches = (p: { type_jour: string; heure_debut: string; heure_fin: string }) => {
        if (p.type_jour !== typeJour) return false;
        const start = toMin(p.heure_debut), end = toMin(p.heure_fin);
        return start <= end ? (minutes >= start && minutes < end) : (minutes >= start || minutes < end);
      };
      const plage = tarifPlages.find(p => matches(p) && p.ligne_id === c.ligne_id)
        || tarifPlages.find(p => matches(p) && !p.ligne_id);
      return parseFloat(String(plage?.tarif ?? 0)) || 0;
    };
  }, [tarifPlages]);

  const coursesRealisees = filteredCourses.filter(c => c.statut_realisation === 'termine');
  const prevCoursesRealisees = filteredPrevCourses.filter(c => c.statut_realisation === 'termine');
  const coursesNonEffectuees = filteredCourses.filter(c =>
    c.statut_realisation === 'incident' ||
    c.statut_realisation === 'annule' ||
    c.statut_realisation === 'remplace'
  );

  const ca = coursesRealisees.reduce((s, c) => s + tarifForCourse(c), 0);
  const prevCa = prevCoursesRealisees.reduce((s, c) => s + tarifForCourse(c), 0);
  const caVariation = prevCa > 0 ? ((ca - prevCa) / prevCa * 100) : 0;

  const nbCoursesRealisees = coursesRealisees.length;
  const prevNbCourses = prevCoursesRealisees.length;

  // Ponctualite = retard REEL au depart (heure_debut d'execution vs heure planifiee),
  // et non la duree du trajet (duree_minutes) qui donnait ~0% en permanence.
  const SEUIL_RETARD = 10;
  const execByCourse = useMemo(() => {
    const m = new Map<string, string>();
    executions.forEach(e => { if (e.heure_debut && !m.has(e.course_id)) m.set(e.course_id, e.heure_debut); });
    return m;
  }, [executions]);
  const coursesAvecDepart = coursesRealisees.filter(c => execByCourse.has(c.id));
  const retards = coursesAvecDepart.filter(c => {
    const debut = new Date(execByCourse.get(c.id)!).getTime();
    const prevu = new Date(c.date_heure).getTime();
    return (debut - prevu) / 60000 > SEUIL_RETARD;
  });
  const ponctualite = coursesAvecDepart.length > 0 ? ((coursesAvecDepart.length - retards.length) / coursesAvecDepart.length * 100) : -1;

  const incidentsOuverts = incidents.filter(c => {
    const d = new Date(c.date_heure);
    return d >= periodStart && d <= periodEnd;
  });

  const caParJour = useMemo(() => {
    const days = ['Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam', 'Dim'];
    const map: Record<string, number> = {};
    days.forEach(d => { map[d] = 0; });
    coursesRealisees.forEach(c => {
      const dt = new Date(c.date_heure);
      const dayIdx = (dt.getDay() + 6) % 7;
      map[days[dayIdx]] += tarifForCourse(c);
    });
    return days.map(d => ({ jour: d, montant: map[d] }));
  }, [coursesRealisees, tarifForCourse]);

  // Donnees du graphique CA. En mode "Jour" on decoupe par heure (le titre
  // annoncait deja "Heures" mais l'agregation restait par jour de semaine).
  const chartData = useMemo<{ label: string; montant: number }[]>(() => {
    if (period === 'jour') {
      const map: Record<number, number> = {};
      coursesRealisees.forEach(c => {
        const h = new Date(c.date_heure).getHours();
        map[h] = (map[h] || 0) + tarifForCourse(c);
      });
      const heures = Object.keys(map).map(Number);
      let startH = 6;
      let endH = 20;
      if (heures.length > 0) {
        startH = Math.min(startH, ...heures);
        endH = Math.max(endH, ...heures);
      }
      const arr: { label: string; montant: number }[] = [];
      for (let h = startH; h <= endH; h++) arr.push({ label: `${h}h`, montant: map[h] || 0 });
      return arr;
    }
    return caParJour.map(d => ({ label: d.jour, montant: d.montant }));
  }, [period, coursesRealisees, caParJour, tarifForCourse]);

  const maxCa = Math.max(...chartData.map(d => d.montant), 1);

  const nonEffectues30j = useMemo(() => {
    const all = incidents;
    const motifs: Record<string, number> = {
      'Voiture en panne': 0,
      'Absence chauffeur': 0,
      'Meteo / route bloquee': 0,
      'Autre': 0,
    };
    all.forEach(c => {
      const n = (c.notes || '').toLowerCase();
      if (n.includes('panne')) motifs['Voiture en panne']++;
      else if (n.includes('absent') || n.includes('absence')) motifs['Absence chauffeur']++;
      else if (n.includes('meteo') || n.includes('route') || n.includes('bloque')) motifs['Meteo / route bloquee']++;
      else motifs['Autre']++;
    });
    return motifs;
  }, [incidents]);

  const totalNonEff = Object.values(nonEffectues30j).reduce((s, v) => s + v, 0);
  const causeMax = Object.entries(nonEffectues30j).sort((a, b) => b[1] - a[1])[0];
  const motifColors: Record<string, string> = {
    'Voiture en panne': 'bg-red-500',
    'Absence chauffeur': 'bg-amber-500',
    'Meteo / route bloquee': 'bg-sky-500',
    'Autre': 'bg-gray-400',
  };

  const trajetsParChauffeur = useMemo(() => {
    const map: Record<string, number> = {};
    coursesRealisees.forEach(c => {
      if (c.chauffeur_id) map[c.chauffeur_id] = (map[c.chauffeur_id] || 0) + 1;
    });
    return Object.entries(map)
      .map(([id, count]) => ({ chauffeur: chauffeurs.find(ch => ch.id === id), count }))
      .filter(x => x.chauffeur)
      .sort((a, b) => b.count - a.count)
      .slice(0, 6);
  }, [coursesRealisees, chauffeurs]);

  const maxTrajets = trajetsParChauffeur.length > 0 ? trajetsParChauffeur[0].count : 1;

  const trajetsTheoriques = filteredCourses.length;
  const tauxRealisation = trajetsTheoriques > 0 ? (nbCoursesRealisees / trajetsTheoriques * 100) : 0;
  const nbJoursPeriode = Math.max(1, Math.ceil((periodEnd.getTime() - periodStart.getTime()) / 86400000));
  const voyMoyenParJour = nbJoursPeriode > 0 ? nbCoursesRealisees / nbJoursPeriode : 0;

  // Real data from Android executions
  const totalMontants = arretExecs.reduce((s, a) => s + (a.montants || 0), 0);
  const totalDescendants = arretExecs.reduce((s, a) => s + (a.descendants || 0), 0);
  const completedExecs = executions.filter(e => e.heure_fin);
  const avgRealDuration = completedExecs.length > 0
    ? completedExecs.reduce((s, e) => s + (new Date(e.heure_fin!).getTime() - new Date(e.heure_debut).getTime()) / 60000, 0) / completedExecs.length
    : -1;

  const latestIncident = incidents[0];
  const latestIncidentChauffeur = latestIncident ? chauffeurs.find(c => c.id === latestIncident.chauffeur_id) : null;

  const periodSuffix = period === 'jour' ? 'J-1' : period === 'semaine' ? 'S-1' : 'M-1';
  const ligneLabel = selectedLigne === 'all' ? 'Toutes lignes' : lignes.find(l => l.id === selectedLigne)?.code || '';

  return (
    <div className="space-y-6 max-w-[1400px]">
      {/* Incident Banner */}
      {showBanner && latestIncident && (
        <div className="animate-slide-up bg-white border border-red-100 rounded-xl px-5 py-3.5 flex items-center gap-4 shadow-card">
          <div className="flex items-center gap-2.5">
            <span className="flex items-center gap-1.5 bg-red-50 text-red-600 text-[10px] font-bold px-2.5 py-1 rounded-md uppercase tracking-wide">
              <AlertTriangle className="w-3 h-3" />
              Incident
            </span>
            <span className="text-sm font-semibold text-gray-900">
              {latestIncidentChauffeur ? `${latestIncidentChauffeur.code} - ${latestIncidentChauffeur.nom} ${latestIncidentChauffeur.prenom}` : 'Chauffeur inconnu'}
            </span>
            <span className="text-xs text-gray-400">
              {new Date(latestIncident.date_heure).toLocaleString('fr-FR', { hour: '2-digit', minute: '2-digit', timeZone: 'Indian/Mayotte' })}
            </span>
          </div>
          <p className="text-sm text-gray-500 flex-1 truncate">{latestIncident.notes || 'Incident signale'}</p>
          <div className="flex items-center gap-2 shrink-0">
            <button className="btn-secondary !py-1.5 !px-3 !text-xs flex items-center gap-1.5">
              <Volume2 className="w-3.5 h-3.5" /> Ecouter
            </button>
            <button className="flex items-center gap-1.5 px-3 py-1.5 bg-red-600 hover:bg-red-700 text-white rounded-lg text-xs font-medium transition-all duration-200">
              <RefreshCw className="w-3.5 h-3.5" /> Remplacer
            </button>
            <button onClick={() => setShowBanner(false)} className="p-1.5 text-gray-400 hover:text-gray-600 rounded-lg hover:bg-gray-100 transition-colors">
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

      {/* Header */}
      <div className="flex items-end justify-between">
        <div>
          <p className="section-label">{periodLabel}</p>
          <h1 className="page-title mt-1">Tableau de bord</h1>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex items-center bg-white rounded-lg border border-gray-200 p-0.5">
            {(['jour', 'semaine', 'mois'] as PeriodMode[]).map(p => (
              <button
                key={p}
                onClick={() => setPeriod(p)}
                className={`px-3.5 py-1.5 text-xs font-medium rounded-md transition-all duration-200 ${
                  period === p
                    ? 'bg-gray-900 text-white shadow-sm'
                    : 'text-gray-600 hover:text-gray-900'
                }`}
              >
                {p.charAt(0).toUpperCase() + p.slice(1)}
              </button>
            ))}
          </div>
          <button className="btn-secondary !py-2 flex items-center gap-1.5">
            <Download className="w-3.5 h-3.5" /> Exporter
          </button>
        </div>
      </div>

      {/* Ligne filter */}
      <div className="flex items-center gap-1.5">
        <button
          onClick={() => setSelectedLigne('all')}
          className={`px-3 py-1.5 text-xs font-medium rounded-md transition-all duration-200 ${
            selectedLigne === 'all'
              ? 'bg-gray-900 text-white'
              : 'bg-white text-gray-600 border border-gray-200 hover:border-gray-300'
          }`}
        >
          Toutes lignes
        </button>
        {lignes.map(l => (
          <button
            key={l.id}
            onClick={() => setSelectedLigne(l.id)}
            className={`px-3 py-1.5 text-xs font-medium rounded-md transition-all duration-200 ${
              selectedLigne === l.id
                ? 'bg-gray-900 text-white'
                : 'bg-white text-gray-600 border border-gray-200 hover:border-gray-300'
            }`}
          >
            {l.code}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-24">
          <div className="flex flex-col items-center gap-3">
            <span className="w-7 h-7 border-[2.5px] border-gray-900 border-t-transparent rounded-full animate-spin" />
            <span className="text-xs text-gray-400 font-medium">Chargement des donnees...</span>
          </div>
        </div>
      ) : fetchError ? (
        <div className="flex flex-col items-center justify-center py-24 gap-4">
          <AlertTriangle className="w-10 h-10 text-amber-500" />
          <p className="text-sm text-gray-600 font-medium">{fetchError}</p>
          <button onClick={loadData} className="px-4 py-2 bg-gray-900 text-white text-sm font-medium rounded-lg hover:bg-gray-800 transition-colors flex items-center gap-2">
            <RefreshCw className="w-4 h-4" /> Reessayer
          </button>
        </div>
      ) : (
        <div className="space-y-5 animate-fade-in">
          {/* Top 4 KPIs */}
          <div className="grid grid-cols-4 gap-4">
            <KpiCard
              label={`CA ${period === 'jour' ? 'Jour' : period === 'semaine' ? 'Semaine' : 'Mois'}`}
              value={`${ca.toLocaleString('fr-FR')} \u20AC`}
              variation={caVariation}
              suffix={periodSuffix}
            />
            <KpiCard
              label="Courses realisees"
              value={`${nbCoursesRealisees} / ${trajetsTheoriques}`}
              variation={prevNbCourses > 0 ? ((nbCoursesRealisees - prevNbCourses) / prevNbCourses * 100) : 0}
              suffix={periodSuffix}
            />
            <KpiCard
              label="Ponctualite"
              value={ponctualite >= 0 ? `${ponctualite.toFixed(1)}%` : '-'}
              sub={ponctualite >= 0 ? `${retards.length} retard${retards.length > 1 ? 's' : ''} >${SEUIL_RETARD}mn` : 'Aucune donnee'}
            />
            <KpiCard
              label="Incidents ouverts"
              value={String(incidentsOuverts.length)}
              sub={latestIncident && latestIncidentChauffeur ? `${latestIncidentChauffeur.code} - ${(latestIncident.notes || '').slice(0, 25)}` : 'Aucun'}
              alert={incidentsOuverts.length > 0}
            />
          </div>

          {/* Middle row: Chart + Non effectues */}
          <div className="grid grid-cols-5 gap-4">
            {/* CA Chart */}
            <div className="col-span-3 card p-5">
              <h3 className="section-label mb-5">
                Chiffre d'affaire - {period === 'jour' ? 'Heures' : period === 'semaine' ? 'Semaine' : 'Mois'}
              </h3>
              <div className="h-48 flex items-end gap-1 relative">
                <svg className="w-full h-full" viewBox="0 0 700 180" preserveAspectRatio="none">
                  <defs>
                    <linearGradient id="caGradient" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#f59e0b" stopOpacity="0.12" />
                      <stop offset="100%" stopColor="#f59e0b" stopOpacity="0" />
                    </linearGradient>
                  </defs>
                  {chartData.length > 0 && (() => {
                    const xAt = (i: number) => chartData.length > 1 ? 50 + (i / (chartData.length - 1)) * 600 : 350;
                    const yAt = (m: number) => 180 - (m / maxCa) * 160;
                    const pts = chartData.map((d, i) => `${xAt(i)},${yAt(d.montant)}`);
                    return (
                      <>
                        <path
                          d={`M ${pts.join(' L ')} L ${xAt(chartData.length - 1)},180 L ${xAt(0)},180 Z`}
                          fill="url(#caGradient)"
                        />
                        <polyline
                          points={pts.join(' ')}
                          fill="none"
                          stroke="#d97706"
                          strokeWidth="2"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        />
                        {chartData.map((d, i) => (
                          <circle key={i} cx={xAt(i)} cy={yAt(d.montant)} r="3.5" fill="white" stroke="#d97706" strokeWidth="2" />
                        ))}
                      </>
                    );
                  })()}
                </svg>
              </div>
              <div className="flex justify-between mt-3 px-2">
                {chartData.map((d, i) => (
                  <span key={i} className="text-[11px] text-gray-400 font-medium">{d.label}</span>
                ))}
              </div>
            </div>

            {/* Non effectues */}
            <div className="col-span-2 card p-5">
              <h3 className="section-label mb-4">Trajets non effectues - 30 j</h3>
              <div className="flex items-baseline gap-3 mb-1">
                <span className="text-4xl font-black text-gray-900 tracking-tight">{totalNonEff}</span>
                {causeMax && <span className="text-xs text-gray-500">{causeMax[0].toLowerCase()} = #1</span>}
              </div>
              <div className="space-y-3.5 mt-5">
                {Object.entries(nonEffectues30j).map(([motif, count]) => (
                  <div key={motif} className="flex items-center gap-3">
                    <span className="text-xs text-gray-600 w-36 shrink-0 truncate">{motif}</span>
                    <div className="flex-1 h-2 bg-gray-100 rounded-full overflow-hidden">
                      <div
                        className={`h-full rounded-full ${motifColors[motif] || 'bg-gray-400'} transition-all duration-500`}
                        style={{ width: totalNonEff > 0 ? `${(count / totalNonEff) * 100}%` : '0%' }}
                      />
                    </div>
                    <span className="text-xs font-semibold text-gray-700 w-6 text-right">{count}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Trajets par chauffeur */}
          <div className="card p-5">
            <h3 className="section-label mb-5">
              Trajets realises par chauffeur - {ligneLabel} - {periodLabel}
            </h3>
            {trajetsParChauffeur.length === 0 ? (
              <p className="text-sm text-gray-400 py-6 text-center">Aucun trajet pour cette periode</p>
            ) : (
              <div className="space-y-3">
                {trajetsParChauffeur.map(({ chauffeur, count }, idx) => (
                  <div key={chauffeur!.id} className="flex items-center gap-4 animate-slide-up" style={{ animationDelay: `${idx * 50}ms` }}>
                    <span className="text-sm font-semibold text-gray-900 w-48 shrink-0 truncate">
                      <span className="inline-flex items-center justify-center w-6 h-5 rounded bg-gray-100 text-[10px] font-bold text-gray-600 mr-2">{chauffeur!.code}</span>
                      {chauffeur!.nom} {chauffeur!.prenom}
                    </span>
                    <div className="flex-1 h-2.5 bg-gray-100 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-gradient-to-r from-gray-700 to-gray-900 rounded-full transition-all duration-700"
                        style={{ width: `${(count / maxTrajets) * 100}%` }}
                      />
                    </div>
                    <span className="text-sm font-bold text-gray-700 w-10 text-right tabular-nums">{count}</span>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Bottom stats row */}
          <div className="grid grid-cols-3 lg:grid-cols-6 gap-4">
            <StatCard label="Trajets theoriques" value={String(trajetsTheoriques)} sub={`- ${coursesNonEffectuees.length} non eff.`} />
            <StatCard label="Taux realisation" value={`${tauxRealisation.toFixed(1)}%`} sub="objectif 95%" highlight={tauxRealisation >= 95} />
            <StatCard
              label="Duree moy. reelle"
              value={avgRealDuration > 0 ? `${Math.max(1, Math.round(avgRealDuration))} mn` : '-'}
              sub={`${completedExecs.length} executions`}
            />
            <StatCard label="Courses / jour" value={voyMoyenParJour.toFixed(1)} sub={`${nbJoursPeriode} jours`} />
            <StatCard label="Passagers montes" value={String(totalMontants)} sub="via app chauffeur" highlight={totalMontants > 0} />
            <StatCard label="Passagers descendus" value={String(totalDescendants)} sub="total arrets" />
          </div>
        </div>
      )}
    </div>
  );
}

function KpiCard({ label, value, variation, suffix, sub, alert }: {
  label: string;
  value: string;
  variation?: number;
  suffix?: string;
  sub?: string;
  alert?: boolean;
}) {
  const isPositive = (variation ?? 0) >= 0;
  return (
    <div className={`card p-5 relative overflow-hidden ${alert ? '!border-red-200' : ''}`}>
      {alert && (
        <span className="absolute top-4 right-4 w-2.5 h-2.5 bg-red-500 rounded-full animate-pulse-soft" />
      )}
      <h3 className={`section-label mb-3 ${alert ? '!text-red-600' : ''}`}>{label}</h3>
      <p className="text-3xl font-black text-gray-900 tracking-tight">{value}</p>
      {variation !== undefined && (
        <div className={`flex items-center gap-1 mt-2 text-xs font-medium ${isPositive ? 'text-emerald-600' : 'text-red-600'}`}>
          {isPositive ? <TrendingUp className="w-3.5 h-3.5" /> : <TrendingDown className="w-3.5 h-3.5" />}
          {Math.abs(variation).toFixed(0)}% vs {suffix}
        </div>
      )}
      {sub && <p className="text-xs text-gray-500 mt-2">{sub}</p>}
    </div>
  );
}

function StatCard({ label, value, sub, highlight }: { label: string; value: string; sub: string; highlight?: boolean }) {
  return (
    <div className="card p-5">
      <h3 className="section-label mb-2">{label}</h3>
      <p className={`text-3xl font-black tracking-tight ${highlight ? 'text-emerald-600' : 'text-gray-900'}`}>{value}</p>
      <p className="text-xs text-gray-500 mt-1.5">{sub}</p>
    </div>
  );
}
