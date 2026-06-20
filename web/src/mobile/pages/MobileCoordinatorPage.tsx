import { useEffect, useState } from 'react';
import { LogOut, RefreshCw, ArrowLeft, Phone, Info, RotateCw } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useAuth, clearAuth } from '../lib/store';
import type { Chauffeur, Incident } from '../lib/types';

// Columns the anon role is allowed to read on chauffeurs (column-level grant,
// see migration 20260611120000): selecting * would be rejected.
const CHAUFFEUR_PUBLIC_COLS =
  'id, code, nom, prenom, telephone, statut, is_coordinateur, ligne_id, vehicule_immatriculation, vehicule_places, user_id';

interface CourseWithChauffeur {
  id: string;
  date_heure: string;
  depart: string;
  arrivee: string;
  statut: string;
  statut_planification: string | null;
  statut_realisation: string | null;
  chauffeur_id: string;
  user_id: string;
  periode?: string;
  duree_minutes?: number;
  chauffeur?: Chauffeur;
  ligne?: { id: string; nom: string; code: string; couleur: string; nb_arrets: number };
  incident?: Incident | null;
}

interface IncidentDetail extends Incident {
  chauffeur?: Chauffeur;
}

interface Props {
  onNavigate: (path: string) => void;
}

export default function MobileCoordinatorPage({ onNavigate }: Props) {
  const { chauffeur } = useAuth();
  const [courses, setCourses] = useState<CourseWithChauffeur[]>([]);
  const [incidents, setIncidents] = useState<IncidentDetail[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedIncident, setSelectedIncident] = useState<IncidentDetail | null>(null);
  const [replacementCourse, setReplacementCourse] = useState<CourseWithChauffeur | null>(null);
  const [availableDrivers, setAvailableDrivers] = useState<Chauffeur[]>([]);
  const [replacingDriver, setReplacingDriver] = useState(false);

  useEffect(() => {
    if (!chauffeur) { onNavigate('/mobile'); return; }
    fetchAll();
    const interval = setInterval(fetchAll, 30000);
    return () => clearInterval(interval);
  }, [chauffeur]);

  const fetchAll = async () => {
    if (!chauffeur) return;
    setLoading(true);
    // Local-day window, aligned with the back-office planning (local time)
    const today = new Date();
    const y = today.getFullYear(), m = today.getMonth(), d = today.getDate();
    const startOfDay = new Date(y, m, d).toISOString();
    const endOfDay = new Date(y, m, d + 1).toISOString();

    const [coursesRes, incidentsRes] = await Promise.all([
      // Drafts and replaced courses are hidden (the replacement course is shown)
      supabase.from('courses').select(`*, chauffeur:chauffeurs!courses_chauffeur_id_fkey(${CHAUFFEUR_PUBLIC_COLS}), ligne:lignes(*)`)
        .neq('chauffeur_id', chauffeur.id)
        .or('is_brouillon.is.null,is_brouillon.eq.false')
        .or('statut_realisation.is.null,statut_realisation.neq.remplace')
        .gte('date_heure', startOfDay).lt('date_heure', endOfDay).order('date_heure', { ascending: true }),
      supabase.from('incidents').select(`*, chauffeur:chauffeurs!incidents_chauffeur_id_fkey(${CHAUFFEUR_PUBLIC_COLS})`).gte('created_at', startOfDay).order('created_at', { ascending: false }),
    ]);

    if (coursesRes.data) {
      const coursesWithIncidents = coursesRes.data.map((course: any) => {
        const incident = incidentsRes.data?.find((inc: any) => inc.course_id === course.id);
        return { ...course, incident: incident || null };
      });
      setCourses(coursesWithIncidents as CourseWithChauffeur[]);
    }
    if (incidentsRes.data) setIncidents(incidentsRes.data as IncidentDetail[]);
    setLoading(false);
  };

  const formatTime = (dateStr: string) => new Date(dateStr).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
  const formatDate = () => new Date().toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' }).toUpperCase();

  const getIncidentLabel = (type: string) => {
    const labels: Record<string, string> = { accident: 'Accident', panne: 'Panne', retard: 'Retard', voie_bloquee: 'Voie bloquee', passager_refuse: 'Passager refuse', securite: 'Securite', meteo: 'Meteo', client_absent: 'Client absent', autre: 'Autre' };
    return labels[type] || type;
  };

  const getRealisationLabel = (s: string | null): string => {
    switch (s) { case 'terminee': case 'termine': return 'TERMINE'; case 'en_retard': return 'EN RETARD'; default: return 'PROGRAMME'; }
  };
  const getRealisationColor = (s: string | null): string => {
    switch (s) { case 'terminee': case 'termine': return 'bg-green-100 text-green-800'; case 'en_retard': return 'bg-yellow-100 text-yellow-800'; default: return 'bg-blue-50 text-blue-700'; }
  };

  const handleStartReplacement = async (course: CourseWithChauffeur) => {
    setReplacementCourse(course);
    const today = new Date();
    const y = today.getFullYear(), m = today.getMonth(), d = today.getDate();
    const startOfDay = new Date(y, m, d).toISOString();
    const endOfDay = new Date(y, m, d + 1).toISOString();

    // A driver is busy only if one of his courses OVERLAPS the slot to replace
    const { data: allChauffeurs } = await supabase.from('chauffeurs').select(CHAUFFEUR_PUBLIC_COLS).eq('statut', 'actif').neq('id', course.chauffeur_id).neq('id', chauffeur!.id);
    const { data: busyCourses } = await supabase.from('courses')
      .select('chauffeur_id, date_heure, duree_minutes')
      .gte('date_heure', startOfDay).lt('date_heure', endOfDay)
      .neq('statut', 'annulee')
      .or('statut_realisation.is.null,statut_realisation.neq.remplace');
    const slotStart = new Date(course.date_heure).getTime();
    const slotEnd = slotStart + (course.duree_minutes || 60) * 60000;
    const busyIds = new Set(
      (busyCourses || [])
        .filter((c) => {
          const cStart = new Date(c.date_heure).getTime();
          const cEnd = cStart + (c.duree_minutes || 60) * 60000;
          return cStart < slotEnd && cEnd > slotStart;
        })
        .map((c) => c.chauffeur_id)
    );
    setAvailableDrivers((allChauffeurs || []).filter((ch) => !busyIds.has(ch.id)) as Chauffeur[]);
  };

  const handleConfirmReplacement = async (newDriverId: string) => {
    if (!replacementCourse || !chauffeur) return;
    setReplacingDriver(true);
    await supabase.from('courses').update({ statut_realisation: 'remplace' }).eq('id', replacementCourse.id);
    await supabase.from('courses').insert({
      date_heure: replacementCourse.date_heure,
      chauffeur_id: newDriverId,
      ligne_id: replacementCourse.ligne?.id || null,
      depart: replacementCourse.depart,
      arrivee: replacementCourse.arrivee,
      statut: 'planifiee',
      statut_planification: 'non_planifie',
      statut_realisation: 'programme',
      periode: replacementCourse.periode || 'matin',
      duree_minutes: replacementCourse.duree_minutes || 60,
      user_id: replacementCourse.user_id,
      coordinateur_id: chauffeur.id,
      notes: '[Remplacement]',
    });
    if (replacementCourse.incident) {
      await supabase.from('incidents').update({ mesure_prise: 'remplacement', coordinateur_id: chauffeur.id, handled_at: new Date().toISOString() }).eq('id', replacementCourse.incident.id);
    }
    setReplacingDriver(false);
    setReplacementCourse(null);
    setAvailableDrivers([]);
    fetchAll();
  };

  const handleConfirmDepart = async (course: CourseWithChauffeur) => {
    await supabase.from('courses').update({ statut_realisation: 'en_cours', statut: 'en_cours' }).eq('id', course.id);
    fetchAll();
  };

  if (loading) {
    return <div className="min-h-screen bg-gray-50 flex items-center justify-center"><div className="w-8 h-8 border-4 border-gray-600 border-t-transparent rounded-full animate-spin" /></div>;
  }

  if (selectedIncident) {
    return (
      <div className="min-h-screen bg-gray-50 flex flex-col">
        <div className="bg-gray-900 p-4 flex items-center gap-3">
          <button type="button" onClick={() => setSelectedIncident(null)} className="p-1"><ArrowLeft size={18} className="text-white" /></button>
          <h2 className="text-white font-bold">Detail Incident</h2>
        </div>
        <div className="flex-1 p-4 space-y-4">
          <div className="bg-white border border-gray-200 rounded-lg p-4">
            <div className="flex items-center gap-2">
              <span className="text-xs font-bold px-2 py-0.5 rounded bg-red-100 text-red-800">{getIncidentLabel(selectedIncident.type)}</span>
              <span className={`text-xs font-bold px-2 py-0.5 rounded ${selectedIncident.handled_at ? 'bg-green-100 text-green-800' : 'bg-amber-100 text-amber-800'}`}>
                {selectedIncident.handled_at ? 'TRAITE' : 'OUVERT'}
              </span>
            </div>
            <p className="text-xs text-gray-500 mt-2">
              {formatTime(selectedIncident.created_at)}
              {selectedIncident.chauffeur && ` - ${selectedIncident.chauffeur.prenom} ${selectedIncident.chauffeur.nom} (${selectedIncident.chauffeur.code})`}
            </p>
          </div>
          {selectedIncident.description && (
            <div className="bg-white border border-gray-200 rounded-lg p-4">
              <p className="text-[10px] font-semibold text-gray-400">DESCRIPTION</p>
              <p className="text-sm mt-1">{selectedIncident.description}</p>
            </div>
          )}
          {selectedIncident.photo_url && (
            <div className="bg-white border border-gray-200 rounded-lg p-4">
              <p className="text-[10px] font-semibold text-gray-400">PHOTO</p>
              <img src={selectedIncident.photo_url} alt="Incident" className="mt-2 w-full rounded object-cover max-h-[200px]" />
            </div>
          )}
          {selectedIncident.video_url && (
            <div className="bg-white border border-gray-200 rounded-lg p-4">
              <p className="text-[10px] font-semibold text-gray-400">VIDEO</p>
              <video src={selectedIncident.video_url} controls className="mt-2 w-full rounded max-h-[200px]" />
            </div>
          )}
          {selectedIncident.mesure_prise && (
            <div className="bg-white border-l-4 border-l-green-500 border border-gray-200 rounded-lg p-4">
              <p className="text-[10px] font-semibold text-gray-400">MESURE PRISE</p>
              <p className="text-sm mt-1">{selectedIncident.mesure_prise === 'remplacement' ? 'Remplacement chauffeur' : selectedIncident.mesure_prise}</p>
            </div>
          )}
        </div>
      </div>
    );
  }

  if (replacementCourse) {
    return (
      <div className="min-h-screen bg-gray-50 flex flex-col">
        <div className="bg-gray-900 p-4 flex items-center gap-3">
          <button type="button" onClick={() => { setReplacementCourse(null); setAvailableDrivers([]); }} className="p-1"><ArrowLeft size={18} className="text-white" /></button>
          <h2 className="text-white font-bold">Remplacement</h2>
        </div>
        <div className="p-4">
          <div className="bg-white border border-gray-200 rounded-lg p-4 mb-4">
            <p className="text-[10px] font-semibold text-gray-400">COURSE A REMPLACER</p>
            <p className="font-semibold mt-1">{formatTime(replacementCourse.date_heure)} - {replacementCourse.depart} → {replacementCourse.arrivee}</p>
            <p className="text-xs text-gray-500">Chauffeur: {replacementCourse.chauffeur?.prenom} {replacementCourse.chauffeur?.nom} ({replacementCourse.chauffeur?.code})</p>
          </div>
          <p className="text-[10px] font-semibold text-gray-400 mb-2">CHAUFFEURS DISPONIBLES</p>
          {availableDrivers.length === 0 ? (
            <div className="bg-gray-100 rounded-lg p-4 text-center"><p className="text-sm text-gray-500">Aucun chauffeur disponible</p></div>
          ) : (
            <div className="space-y-2">
              {availableDrivers.map((driver) => (
                <div key={driver.id} className="bg-white border border-gray-200 rounded-lg p-4">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 bg-gray-100 rounded-full flex items-center justify-center"><span className="font-bold text-sm">{driver.code}</span></div>
                    <div>
                      <p className="font-semibold">{driver.prenom} {driver.nom}</p>
                      {driver.telephone && <a href={`tel:${driver.telephone}`} className="flex items-center gap-1 mt-0.5"><Phone size={10} className="text-blue-600" /><span className="text-[10px] text-blue-600">{driver.telephone}</span></a>}
                    </div>
                  </div>
                  <button type="button" disabled={replacingDriver} onClick={() => handleConfirmReplacement(driver.id)} className="mt-3 w-full bg-gray-900 text-white rounded py-2 text-center text-sm font-semibold disabled:opacity-50 active:opacity-80">
                    Assigner cette course
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    );
  }

  const incidentCount = incidents.length;

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      <div className="bg-gray-900 text-white p-4">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-[10px] text-white/70">{formatDate()}</p>
            <h1 className="text-xl font-bold">Coordinateur</h1>
            <p className="text-[10px] text-white/70">{chauffeur?.code} - {chauffeur?.prenom} {chauffeur?.nom}</p>
          </div>
          <div className="flex items-center gap-2">
            <button type="button" onClick={fetchAll} className="p-2"><RefreshCw size={16} className="text-white" /></button>
            <button type="button" onClick={() => { clearAuth(); onNavigate('/mobile'); }} className="p-2"><LogOut size={16} className="text-white" /></button>
          </div>
        </div>
        <div className="flex gap-3 mt-4">
          <div className="flex-1 bg-white/10 rounded-lg p-2 text-center">
            <span className="text-xl font-bold">{courses.length}</span>
            <p className="text-[10px] text-white/70">Courses</p>
          </div>
          <div className={`flex-1 bg-white/10 rounded-lg p-2 text-center ${incidentCount > 0 ? 'border border-red-500' : ''}`}>
            <span className={`text-xl font-bold ${incidentCount > 0 ? 'text-red-500' : ''}`}>{incidentCount}</span>
            <p className="text-[10px] text-white/70">Incidents</p>
          </div>
        </div>
      </div>

      <div className="flex-1 p-4 space-y-2 overflow-y-auto">
        {courses.length === 0 ? (
          <div className="text-center py-12"><p className="text-gray-400">Aucune course a superviser</p></div>
        ) : courses.map((course) => {
          const isReplaced = course.statut_realisation === 'remplace';
          const hasActiveIncident = course.incident && !isReplaced;
          return (
            <div key={course.id} className={`bg-white border rounded-lg p-4 ${hasActiveIncident ? 'border-red-500 border-l-4' : 'border-gray-200'}`}>
              <div className="flex items-start justify-between">
                <div>
                  <span className="text-lg font-bold">{formatTime(course.date_heure)}</span>
                  <p className="font-semibold mt-1">{course.depart} → {course.arrivee}</p>
                  {course.chauffeur && (
                    <div className="flex items-center gap-1 mt-1">
                      <span className="text-xs text-gray-500">{course.chauffeur.prenom} {course.chauffeur.nom} ({course.chauffeur.code})</span>
                      {course.chauffeur.telephone && <a href={`tel:${course.chauffeur.telephone}`}><Phone size={10} className="text-blue-600" /></a>}
                    </div>
                  )}
                </div>
                <span className={`text-[10px] font-bold px-2 py-0.5 rounded ${isReplaced ? 'bg-green-100 text-green-800' : getRealisationColor(course.statut_realisation)}`}>
                  {isReplaced ? 'TERMINE' : getRealisationLabel(course.statut_realisation)}
                </span>
              </div>
              {hasActiveIncident && (
                <div className="mt-3 pt-3 border-t border-gray-200 flex gap-2">
                  <button type="button" onClick={() => setSelectedIncident(course.incident as IncidentDetail)} className="flex-1 bg-red-50 border border-red-500 rounded py-2 px-2 flex items-center justify-center gap-1">
                    <Info size={12} className="text-red-600" />
                    <span className="text-[10px] font-semibold text-red-600">{getIncidentLabel(course.incident!.type)}</span>
                  </button>
                  <button type="button" onClick={() => handleStartReplacement(course)} className="bg-gray-900 text-white rounded py-2 px-3 flex items-center gap-1">
                    <RotateCw size={12} />
                    <span className="text-xs font-semibold">Remplacer</span>
                  </button>
                </div>
              )}
              {!hasActiveIncident && !isReplaced && course.statut_realisation !== 'termine' && course.statut_realisation !== 'en_cours' && (
                <div className="mt-3 pt-3 border-t border-gray-200 flex gap-2">
                  <button type="button" onClick={() => handleConfirmDepart(course)} className="flex-1 bg-green-50 border border-green-500 rounded py-2 px-2 flex items-center justify-center gap-1">
                    <span className="text-[10px] font-semibold text-green-700">Confirmer depart</span>
                  </button>
                  <button type="button" onClick={() => handleStartReplacement(course)} className="bg-gray-900 text-white rounded py-2 px-3 flex items-center gap-1">
                    <RotateCw size={12} />
                    <span className="text-xs font-semibold">Remplacer</span>
                  </button>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
