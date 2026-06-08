import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { Route, Activity, CheckCircle, Clock, XCircle, MapPin, Users, ArrowRight } from 'lucide-react';

interface CourseWithExecution {
  id: string;
  date_heure: string;
  depart: string;
  arrivee: string;
  statut: string;
  montant: number;
  chauffeur_id: string | null;
}

interface CourseExecution {
  id: string;
  course_id: string;
  chauffeur_id: string;
  statut: string;
  heure_debut: string;
  heure_fin: string | null;
}

interface ArretExecution {
  id: string;
  course_execution_id: string;
  arret_id: string;
  ordre: number;
  montants: number;
  descendants: number;
  heure_arrivee: string | null;
  heure_depart: string | null;
  statut: string;
}

interface Chauffeur {
  id: string;
  nom: string;
  prenom: string;
  code: string;
}

export function TraficPage() {
  const [courses, setCourses] = useState<CourseWithExecution[]>([]);
  const [executions, setExecutions] = useState<CourseExecution[]>([]);
  const [arretExecutions, setArretExecutions] = useState<ArretExecution[]>([]);
  const [chauffeurs, setChauffeurs] = useState<Chauffeur[]>([]);
  const [filter, setFilter] = useState('all');
  const [selectedCourse, setSelectedCourse] = useState<string | null>(null);

  useEffect(() => {
    loadData();
    const interval = setInterval(loadData, 60000);
    return () => clearInterval(interval);
  }, []);

  async function loadData() {
    const today = new Date().toISOString().split('T')[0];
    try {
      const [coursesRes, execRes, chRes] = await Promise.all([
        supabase.from('courses').select('id, date_heure, depart, arrivee, statut, montant, chauffeur_id')
          .gte('date_heure', today)
          .order('date_heure', { ascending: true }),
        supabase.from('course_executions').select('id, course_id, chauffeur_id, statut, heure_debut, heure_fin')
          .gte('heure_debut', today)
          .order('heure_debut', { ascending: false }),
        supabase.from('chauffeurs').select('id, nom, prenom, code'),
      ]);
      if (coursesRes.data) setCourses(coursesRes.data);
      if (execRes.data) setExecutions(execRes.data);
      if (chRes.data) setChauffeurs(chRes.data);

      // Load arret_executions only for today's executions
      const execIds = (execRes.data || []).map(e => e.id);
      if (execIds.length > 0) {
        const { data: arretData } = await supabase.from('arret_executions')
          .select('id, course_execution_id, arret_id, ordre, montants, descendants, heure_arrivee, heure_depart, statut')
          .in('course_execution_id', execIds)
          .order('ordre', { ascending: true });
        if (arretData) setArretExecutions(arretData);
      } else {
        setArretExecutions([]);
      }
    } catch (err) {
      console.error('Trafic load error:', err);
    }
  }

  const filtered = filter === 'all' ? courses : courses.filter((c) => c.statut === filter);

  const counts = {
    all: courses.length,
    planifiee: courses.filter((c) => c.statut === 'planifiee').length,
    en_cours: courses.filter((c) => c.statut === 'en_cours').length,
    terminee: courses.filter((c) => c.statut === 'terminee').length,
    annulee: courses.filter((c) => c.statut === 'annulee').length,
  };

  const filters = [
    { id: 'all', label: 'Toutes', icon: Activity, count: counts.all },
    { id: 'planifiee', label: 'Planifiees', icon: Clock, count: counts.planifiee },
    { id: 'en_cours', label: 'En cours', icon: Route, count: counts.en_cours },
    { id: 'terminee', label: 'Terminees', icon: CheckCircle, count: counts.terminee },
    { id: 'annulee', label: 'Annulees', icon: XCircle, count: counts.annulee },
  ];

  const statutConfig: Record<string, { bg: string; text: string; dot: string; label: string }> = {
    planifiee: { bg: 'bg-sky-50', text: 'text-sky-700', dot: 'bg-sky-500', label: 'Planifiee' },
    en_cours: { bg: 'bg-amber-50', text: 'text-amber-700', dot: 'bg-amber-500', label: 'En cours' },
    terminee: { bg: 'bg-emerald-50', text: 'text-emerald-700', dot: 'bg-emerald-500', label: 'Terminee' },
    annulee: { bg: 'bg-red-50', text: 'text-red-700', dot: 'bg-red-500', label: 'Annulee' },
  };

  function getChauffeur(id: string | null) {
    return chauffeurs.find(c => c.id === id);
  }

  function getExecution(courseId: string): CourseExecution | undefined {
    return executions.find(e => e.course_id === courseId);
  }

  function getArretExecs(executionId: string): ArretExecution[] {
    return arretExecutions.filter(a => a.course_execution_id === executionId);
  }

  // Real-time stats from executions
  const totalDescendants = arretExecutions.reduce((s, a) => s + (a.descendants || 0), 0);
  const totalMontants = arretExecutions.reduce((s, a) => s + (a.montants || 0), 0);

  return (
    <div className="space-y-6 max-w-[1200px]">
      <div>
        <p className="section-label">Suivi en temps reel</p>
        <h1 className="page-title mt-1">Trafic</h1>
      </div>

      {/* Live stats from Android */}
      <div className="grid grid-cols-4 gap-3">
        <div className="card p-4">
          <p className="section-label">Courses du jour</p>
          <p className="text-2xl font-black text-gray-900 mt-1">{courses.length}</p>
        </div>
        <div className="card p-4">
          <p className="section-label">En cours</p>
          <p className="text-2xl font-black text-amber-600 mt-1">{counts.en_cours}</p>
        </div>
        <div className="card p-4">
          <p className="section-label">Passagers montes</p>
          <p className="text-2xl font-black text-emerald-600 mt-1">{totalMontants}</p>
          <p className="text-xs text-gray-400">via app chauffeur</p>
        </div>
        <div className="card p-4">
          <p className="section-label">Passagers descendus</p>
          <p className="text-2xl font-black text-gray-900 mt-1">{totalDescendants}</p>
          <p className="text-xs text-gray-400">total arrets</p>
        </div>
      </div>

      {/* Filter tabs */}
      <div className="flex gap-1.5 bg-white rounded-lg border border-gray-200 p-1 w-fit">
        {filters.map((f) => (
          <button
            key={f.id}
            onClick={() => setFilter(f.id)}
            className={`flex items-center gap-2 px-3.5 py-2 rounded-md text-xs font-medium transition-all duration-200 ${
              filter === f.id
                ? 'bg-gray-900 text-white shadow-sm'
                : 'text-gray-600 hover:text-gray-900 hover:bg-gray-50'
            }`}
          >
            <f.icon className="w-3.5 h-3.5" />
            {f.label}
            <span className={`ml-0.5 px-1.5 py-0.5 rounded text-[10px] font-semibold ${
              filter === f.id ? 'bg-white/20 text-white' : 'bg-gray-100 text-gray-500'
            }`}>
              {f.count}
            </span>
          </button>
        ))}
      </div>

      {filtered.length === 0 ? (
        <div className="card p-16 text-center animate-fade-in">
          <div className="w-14 h-14 bg-gray-100 rounded-2xl flex items-center justify-center mx-auto mb-4">
            <Route className="w-7 h-7 text-gray-400" />
          </div>
          <p className="text-gray-900 font-medium">Aucune course</p>
          <p className="text-sm text-gray-500 mt-1">Aucune course ne correspond a ce filtre</p>
        </div>
      ) : (
        <div className="space-y-2 animate-fade-in">
          {filtered.map((course, idx) => {
            const config = statutConfig[course.statut] || statutConfig.planifiee;
            const execution = getExecution(course.id);
            const arretExecs = execution ? getArretExecs(execution.id) : [];
            const ch = getChauffeur(course.chauffeur_id);
            const isExpanded = selectedCourse === course.id;
            const coursePassengers = arretExecs.reduce((s, a) => s + (a.montants || 0), 0);
            const courseDescendants = arretExecs.reduce((s, a) => s + (a.descendants || 0), 0);

            return (
              <div key={course.id} className="animate-slide-up" style={{ animationDelay: `${idx * 20}ms` }}>
                <div
                  className={`card px-5 py-4 hover:shadow-card-hover group cursor-pointer transition-all duration-200 ${isExpanded ? '!shadow-card-hover !border-gray-200' : ''}`}
                  onClick={() => setSelectedCourse(isExpanded ? null : course.id)}
                >
                  <div className="flex items-center gap-4">
                    <div className="w-9 h-9 bg-gray-50 rounded-lg flex items-center justify-center group-hover:bg-gray-100 transition-colors flex-shrink-0">
                      <MapPin className="w-4 h-4 text-gray-500" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-gray-900 truncate">
                        {course.depart} <span className="text-gray-400 mx-1">&rarr;</span> {course.arrivee}
                      </p>
                      <div className="flex items-center gap-2 mt-0.5">
                        <p className="text-xs text-gray-500">
                          {new Date(course.date_heure).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}
                        </p>
                        {ch && (
                          <span className="text-xs text-gray-400">· {ch.code} - {ch.nom}</span>
                        )}
                      </div>
                    </div>

                    {/* Execution indicators */}
                    {execution && (
                      <div className="flex items-center gap-3 text-xs">
                        {execution.heure_debut && (
                          <span className={`px-2 py-0.5 rounded ${
                            (() => {
                              const scheduled = new Date(course.date_heure).getTime();
                              const actual = new Date(execution.heure_debut).getTime();
                              const delayMin = Math.round((actual - scheduled) / 60000);
                              return delayMin > 5 ? 'bg-red-50 text-red-600' : 'bg-gray-100 text-gray-600';
                            })()
                          }`}>
                            {new Date(course.date_heure).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}
                            {' → '}
                            {new Date(execution.heure_debut).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}
                            {(() => {
                              const delayMin = Math.round((new Date(execution.heure_debut).getTime() - new Date(course.date_heure).getTime()) / 60000);
                              return delayMin > 5 ? ` (+${delayMin} mn)` : '';
                            })()}
                          </span>
                        )}
                        {(coursePassengers > 0 || courseDescendants > 0) && (
                          <span className="flex items-center gap-1 text-gray-600 bg-gray-100 px-2 py-0.5 rounded">
                            <Users className="w-3 h-3" /> {coursePassengers} mont. / {courseDescendants} desc.
                          </span>
                        )}
                        {execution.heure_debut && execution.heure_fin && (
                          <span className="text-gray-500 bg-gray-100 px-2 py-0.5 rounded">
                            {Math.max(1, Math.round((new Date(execution.heure_fin).getTime() - new Date(execution.heure_debut).getTime()) / 60000))} mn
                          </span>
                        )}
                      </div>
                    )}

                    <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium ${config.bg} ${config.text} flex-shrink-0`}>
                      <span className={`w-1.5 h-1.5 rounded-full ${config.dot}`} />
                      {config.label}
                    </span>
                    <span className="text-sm font-semibold text-gray-900 tabular-nums w-20 text-right flex-shrink-0">
                      {course.montant ? `${course.montant} \u20AC` : '-'}
                    </span>
                  </div>
                </div>

                {/* Expanded: arret executions detail */}
                {isExpanded && arretExecs.length > 0 && (
                  <div className="ml-14 mt-1 mb-2 bg-gray-50 rounded-lg border border-gray-100 p-4 animate-slide-up">
                    <div className="flex items-center gap-2 mb-3">
                      <p className="section-label">Detail execution par arret</p>
                      {execution && execution.heure_debut && (
                        <span className="text-xs text-gray-500">
                          Debut: {new Date(execution.heure_debut).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}
                          {execution.heure_fin && ` → Fin: ${new Date(execution.heure_fin).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}`}
                        </span>
                      )}
                    </div>
                    <div className="space-y-1.5">
                      {arretExecs.map((arret) => (
                        <div key={arret.id} className="flex items-center gap-3 text-sm">
                          <span className="w-5 h-5 rounded-full bg-white border border-gray-200 flex items-center justify-center text-[10px] font-bold text-gray-500 flex-shrink-0">
                            {arret.ordre}
                          </span>
                          <div className="flex-1 flex items-center gap-3">
                            {arret.heure_arrivee && (
                              <span className="text-xs text-gray-500 w-12">
                                {new Date(arret.heure_arrivee).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}
                              </span>
                            )}
                            {arret.heure_depart && (
                              <>
                                <ArrowRight className="w-3 h-3 text-gray-300" />
                                <span className="text-xs text-gray-500 w-12">
                                  {new Date(arret.heure_depart).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}
                                </span>
                              </>
                            )}
                          </div>
                          <div className="flex items-center gap-4 text-xs">
                            {arret.montants > 0 && (
                              <span className="text-emerald-700 font-medium flex items-center gap-1">
                                <Users className="w-3 h-3" /> {arret.montants} mont.
                              </span>
                            )}
                            {arret.descendants > 0 && (
                              <span className="text-gray-600 flex items-center gap-1">
                                {arret.descendants} desc.
                              </span>
                            )}
                            <span className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${
                              arret.statut === 'termine' ? 'bg-emerald-100 text-emerald-700' :
                              arret.statut === 'en_cours' ? 'bg-amber-100 text-amber-700' :
                              'bg-gray-100 text-gray-600'
                            }`}>
                              {arret.statut || 'attente'}
                            </span>
                          </div>
                        </div>
                      ))}
                    </div>
                    <div className="mt-3 pt-3 border-t border-gray-200 flex items-center gap-6 text-xs">
                      <span className="font-medium text-gray-700">{arretExecs.reduce((s, a) => s + (a.montants || 0), 0)} montes</span>
                      <span className="text-gray-500">{arretExecs.reduce((s, a) => s + (a.descendants || 0), 0)} descendus</span>
                      <span className="text-gray-500">{arretExecs.length} arrets</span>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
