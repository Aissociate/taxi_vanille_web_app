import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { PHeading, PText, PTag, PIcon, PSpinner } from '@porsche-design-system/components-react';
import { supabase } from '../lib/supabase';
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
  confirme_coordinateur_at?: string | null;
  chauffeur?: Chauffeur;
  ligne?: { id: string; nom: string; code: string; couleur: string; nb_arrets: number };
  incident?: Incident | null;
}

interface IncidentDetail extends Incident {
  chauffeur?: Chauffeur;
}

interface TomorrowCourseCoord {
  id: string;
  date_heure: string;
  depart: string;
  arrivee: string;
  chauffeur?: Chauffeur;
  ligne?: { id: string; nom: string; code: string; couleur: string; nb_arrets: number };
}

export default function CoordinatorPage() {
  const { chauffeur } = useAuth();
  const navigate = useNavigate();
  const [courses, setCourses] = useState<CourseWithChauffeur[]>([]);
  const [tomorrowCourses, setTomorrowCourses] = useState<TomorrowCourseCoord[]>([]);
  const [showTomorrow, setShowTomorrow] = useState(false);
  const [incidents, setIncidents] = useState<IncidentDetail[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedIncident, setSelectedIncident] = useState<IncidentDetail | null>(null);
  const [replacementCourse, setReplacementCourse] = useState<CourseWithChauffeur | null>(null);
  const [availableDrivers, setAvailableDrivers] = useState<Chauffeur[]>([]);
  const [replacingDriver, setReplacingDriver] = useState(false);
  const [hasCreneaux, setHasCreneaux] = useState(false);

  useEffect(() => {
    if (!chauffeur) {
      navigate('/');
      return;
    }
    fetchAll();
    const interval = setInterval(fetchAll, 30000);

    let refreshTimer: ReturnType<typeof setTimeout> | null = null;
    const scheduleRefresh = () => {
      if (refreshTimer) clearTimeout(refreshTimer);
      refreshTimer = setTimeout(() => fetchAll(), 600);
    };
    const channel = supabase
      .channel(`coordinator_${chauffeur.id}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'courses' }, scheduleRefresh)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'coordinateur_creneaux' }, scheduleRefresh)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'incidents' }, scheduleRefresh)
      .subscribe();

    return () => {
      clearInterval(interval);
      if (refreshTimer) clearTimeout(refreshTimer);
      supabase.removeChannel(channel);
    };
  }, [chauffeur, navigate]);

  const fetchAll = async () => {
    if (!chauffeur) return;
    setLoading(true);
    // Local-day window, aligned with the back-office planning (local time)
    const today = new Date();
    const y = today.getFullYear();
    const m = today.getMonth();
    const d = today.getDate();
    const startOfDay = new Date(y, m, d).toISOString();
    const endOfDay = new Date(y, m, d + 1).toISOString();
    const endOfTomorrow = new Date(y, m, d + 2).toISOString();

    // Drafts and replaced courses are hidden (the replacement course is shown)
    const visibleCourses = () =>
      supabase
        .from('courses')
        .select(`*, chauffeur:chauffeurs!courses_chauffeur_id_fkey(${CHAUFFEUR_PUBLIC_COLS}), ligne:lignes(*)`)
        .neq('chauffeur_id', chauffeur.id)
        .or('is_brouillon.is.null,is_brouillon.eq.false')
        .or('statut_realisation.is.null,statut_realisation.neq.remplace');

    const [coursesRes, incidentsRes, tomorrowRes, creneauxRes] = await Promise.all([
      visibleCourses()
        .gte('date_heure', startOfDay)
        .lt('date_heure', endOfDay)
        .order('date_heure', { ascending: true }),
      supabase
        .from('incidents')
        .select(`*, chauffeur:chauffeurs!incidents_chauffeur_id_fkey(${CHAUFFEUR_PUBLIC_COLS})`)
        .gte('created_at', startOfDay)
        .order('created_at', { ascending: false }),
      visibleCourses()
        .gte('date_heure', endOfDay)
        .lt('date_heure', endOfTomorrow)
        .order('date_heure', { ascending: true }),
      // Le coordinateur ne supervise que les courses de SES creneaux (ligne + plage horaire)
      supabase
        .from('coordinateur_creneaux')
        .select('ligne_id, date_debut, date_fin')
        .eq('coordinateur_id', chauffeur.id)
        .or('is_brouillon.is.null,is_brouillon.eq.false')
        .lte('date_debut', endOfTomorrow)
        .gte('date_fin', startOfDay),
    ]);

    const creneaux = creneauxRes.data || [];
    setHasCreneaux(creneaux.length > 0);
    // Une course apparait si sa duree CHEVAUCHE le creneau (meme ligne) :
    // [debut course, fin course] ∩ [debut creneau, fin creneau] != vide.
    const inCreneau = (course: { ligne?: { id: string }; date_heure: string; duree_minutes?: number }) => {
      const cStart = new Date(course.date_heure).getTime();
      const cEnd = cStart + (course.duree_minutes || 60) * 60000;
      return creneaux.some((cr: { ligne_id: string; date_debut: string; date_fin: string }) =>
        cr.ligne_id === course.ligne?.id &&
        cStart < new Date(cr.date_fin).getTime() &&
        cEnd > new Date(cr.date_debut).getTime()
      );
    };

    if (coursesRes.data) {
      const scoped = (coursesRes.data as CourseWithChauffeur[]).filter(inCreneau);
      const scopedIds = new Set(scoped.map((c) => c.id));
      const coursesWithIncidents = scoped.map((course: CourseWithChauffeur) => {
        const incident = incidentsRes.data?.find(
          (inc: IncidentDetail) => inc.course_id === course.id
        );
        return { ...course, incident: incident || null };
      });
      setCourses(coursesWithIncidents as CourseWithChauffeur[]);
      // N'afficher que les incidents rattaches aux courses supervisees
      setIncidents(((incidentsRes.data || []).filter((inc: IncidentDetail) => scopedIds.has(inc.course_id as string))) as IncidentDetail[]);
    } else {
      setCourses([]);
      setIncidents([]);
    }
    if (tomorrowRes.data) {
      setTomorrowCourses((tomorrowRes.data as TomorrowCourseCoord[]).filter(inCreneau));
    }
    setLoading(false);
  };

  const handleLogout = () => {
    clearAuth();
    navigate('/');
  };

  const formatTime = (dateStr: string) => {
    return new Date(dateStr).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
  };

  const formatDate = () => {
    const today = new Date();
    const options: Intl.DateTimeFormatOptions = { weekday: 'long', day: 'numeric', month: 'long' };
    return today.toLocaleDateString('fr-FR', options).toUpperCase();
  };

  const getPlanificationLabel = (s: string | null): string => {
    switch (s) {
      case 'planifie': return 'PLANIFIE';
      case 'non_planifie': return 'NON PLANIFIE';
      case 'remplacee': return 'REMPLACEE';
      case 'annulee': return 'ANNULEE';
      default: return 'PLANIFIE';
    }
  };

  const getPlanificationVariant = (s: string | null): 'success' | 'warning' | 'error' | 'info' | undefined => {
    switch (s) {
      case 'planifie': return 'success';
      case 'non_planifie': return 'warning';
      case 'remplacee':
      case 'annulee': return 'error';
      default: return undefined;
    }
  };

  const getRealisationLabel = (s: string | null): string => {
    switch (s) {
      case 'terminee':
      case 'termine': return 'TERMINE';
      case 'en_retard': return 'EN RETARD';
      case 'programme': return 'PROGRAMME';
      default: return 'PROGRAMME';
    }
  };

  const getRealisationVariant = (s: string | null): 'success' | 'warning' | 'error' | 'info' | undefined => {
    switch (s) {
      case 'terminee':
      case 'termine': return 'success';
      case 'en_retard': return 'warning';
      case 'programme': return 'info';
      default: return 'info';
    }
  };

  const getIncidentLabel = (type: string) => {
    const labels: Record<string, string> = {
      accident: 'Accident',
      panne: 'Panne',
      retard: 'Retard',
      voie_bloquee: 'Voie bloquee',
      passager_refuse: 'Passager refuse',
      securite: 'Securite',
      meteo: 'Meteo',
      client_absent: 'Client absent',
      autre: 'Autre',
    };
    return labels[type] || type;
  };

  const handleViewIncident = (incident: IncidentDetail) => {
    setSelectedIncident(incident);
  };

  const handleStartReplacement = async (course: CourseWithChauffeur) => {
    setReplacementCourse(course);
    const today = new Date();
    const y = today.getFullYear();
    const m = today.getMonth();
    const d = today.getDate();
    const startOfDay = new Date(y, m, d).toISOString();
    const endOfDay = new Date(y, m, d + 1).toISOString();

    // Get all chauffeurs who do NOT have a course OVERLAPPING the slot to
    // replace (a driver with a course at 14h is still available for 9h).
    const { data: allChauffeurs } = await supabase
      .from('chauffeurs')
      .select(CHAUFFEUR_PUBLIC_COLS)
      .eq('statut', 'actif')
      .neq('id', course.chauffeur_id)
      .neq('id', chauffeur!.id);

    const { data: busyCourses } = await supabase
      .from('courses')
      .select('chauffeur_id, date_heure, duree_minutes')
      .gte('date_heure', startOfDay)
      .lt('date_heure', endOfDay)
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
    const available = (allChauffeurs || []).filter((ch) => !busyIds.has(ch.id));
    setAvailableDrivers(available as Chauffeur[]);
  };

  const handleConfirmReplacement = async (newDriverId: string) => {
    if (!replacementCourse || !chauffeur) return;
    setReplacingDriver(true);

    // 1. Mark original course as replaced (same convention as back-office)
    await supabase
      .from('courses')
      .update({ statut_realisation: 'remplace' })
      .eq('id', replacementCourse.id);

    // 2. Create new course for the replacement driver
    await supabase
      .from('courses')
      .insert({
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

    // 3. If there's an incident, mark mesure_prise
    if (replacementCourse.incident) {
      await supabase
        .from('incidents')
        .update({
          mesure_prise: 'remplacement',
          coordinateur_id: chauffeur.id,
          handled_at: new Date().toISOString(),
        })
        .eq('id', replacementCourse.incident.id);
    }

    setReplacingDriver(false);
    setReplacementCourse(null);
    setAvailableDrivers([]);
    fetchAll();
  };

  const handleConfirmDepart = async (course: CourseWithChauffeur) => {
    // Non bloquant : on note seulement la confirmation de depart par le
    // coordinateur. Le statut de la course n'est pas modifie.
    await supabase.from('courses').update({ confirme_coordinateur_at: new Date().toISOString() }).eq('id', course.id);
    fetchAll();
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-canvas flex items-center justify-center">
        <PSpinner size="medium" aria={{ 'aria-label': 'Chargement' }} />
      </div>
    );
  }

  // Incident detail overlay
  if (selectedIncident) {
    return (
      <div className="min-h-screen bg-canvas flex flex-col">
        <div className="bg-[#1a1a1a] p-static-md flex items-center gap-static-sm">
          <button type="button" onClick={() => setSelectedIncident(null)} className="p-static-xs">
            <PIcon name="arrow-left" color="inherit" />
          </button>
          <PHeading size="medium" tag="h2" color="inherit">
            <span className="text-white">Detail Incident</span>
          </PHeading>
        </div>

        <div className="flex-1 p-static-md space-y-static-md">
          <div className="bg-white border border-contrast-low rounded-[8px] p-static-md">
            <div className="flex items-center gap-static-xs">
              <PTag variant="error">{getIncidentLabel(selectedIncident.type)}</PTag>
              <PTag variant={selectedIncident.handled_at ? 'success' : 'warning'}>
                {selectedIncident.handled_at ? 'TRAITE' : 'OUVERT'}
              </PTag>
            </div>
            <PText size="x-small" color="contrast-medium" className="mt-static-xs">
              {formatTime(selectedIncident.created_at)}
              {selectedIncident.chauffeur && ` - ${selectedIncident.chauffeur.prenom} ${selectedIncident.chauffeur.nom} (${selectedIncident.chauffeur.code})`}
            </PText>
          </div>

          {selectedIncident.description && (
            <div className="bg-white border border-contrast-low rounded-[8px] p-static-md">
              <PText size="x-small" weight="semi-bold" color="contrast-medium">DESCRIPTION</PText>
              <PText size="small" className="mt-static-xs">{selectedIncident.description}</PText>
            </div>
          )}

          {/* Media section */}
          <div className="space-y-static-sm">
            {selectedIncident.photo_url && (
              <div className="bg-white border border-contrast-low rounded-[8px] p-static-md">
                <PText size="x-small" weight="semi-bold" color="contrast-medium">PHOTO</PText>
                <img
                  src={selectedIncident.photo_url}
                  alt="Photo incident"
                  className="mt-static-sm w-full rounded-[4px] object-cover max-h-[200px]"
                />
              </div>
            )}

            {selectedIncident.video_url && (
              <div className="bg-white border border-contrast-low rounded-[8px] p-static-md">
                <PText size="x-small" weight="semi-bold" color="contrast-medium">VIDEO</PText>
                <video
                  src={selectedIncident.video_url}
                  controls
                  className="mt-static-sm w-full rounded-[4px] max-h-[200px]"
                />
              </div>
            )}

            {selectedIncident.audio_url && (
              <div className="bg-white border border-contrast-low rounded-[8px] p-static-md">
                <PText size="x-small" weight="semi-bold" color="contrast-medium">MESSAGE VOCAL</PText>
                <audio src={selectedIncident.audio_url} controls className="mt-static-sm w-full" />
              </div>
            )}

            {!selectedIncident.photo_url && !selectedIncident.video_url && !selectedIncident.audio_url && (
              <div className="bg-surface rounded-[8px] p-static-md text-center">
                <PText size="x-small" color="contrast-medium">Aucun media joint</PText>
              </div>
            )}
          </div>

          {/* Mesure prise */}
          {selectedIncident.mesure_prise && (
            <div className="bg-white border-l-4 border-l-[#0a8a0a] border border-contrast-low rounded-[8px] p-static-md">
              <PText size="x-small" weight="semi-bold" color="contrast-medium">MESURE PRISE</PText>
              <PText size="small" className="mt-static-xs">
                {selectedIncident.mesure_prise === 'remplacement' ? 'Remplacement chauffeur' : selectedIncident.mesure_prise}
              </PText>
            </div>
          )}
        </div>
      </div>
    );
  }

  // Replacement driver selection overlay
  if (replacementCourse) {
    return (
      <div className="min-h-screen bg-canvas flex flex-col">
        <div className="bg-[#1a1a1a] p-static-md flex items-center gap-static-sm">
          <button type="button" onClick={() => { setReplacementCourse(null); setAvailableDrivers([]); }} className="p-static-xs">
            <PIcon name="arrow-left" color="inherit" />
          </button>
          <PHeading size="medium" tag="h2" color="inherit">
            <span className="text-white">Remplacement</span>
          </PHeading>
        </div>

        <div className="p-static-md">
          <div className="bg-white border border-contrast-low rounded-[8px] p-static-md mb-static-md">
            <PText size="x-small" weight="semi-bold" color="contrast-medium">COURSE A REMPLACER</PText>
            <PText weight="semi-bold" className="mt-static-xs">
              {formatTime(replacementCourse.date_heure)} - {replacementCourse.depart} → {replacementCourse.arrivee}
            </PText>
            <PText size="x-small" color="contrast-medium">
              Chauffeur actuel: {replacementCourse.chauffeur?.prenom} {replacementCourse.chauffeur?.nom} ({replacementCourse.chauffeur?.code})
            </PText>
          </div>

          <PText size="x-small" weight="semi-bold" color="contrast-medium" className="mb-static-sm">
            CHAUFFEURS DISPONIBLES
          </PText>

          {availableDrivers.length === 0 ? (
            <div className="bg-surface rounded-[8px] p-static-md text-center">
              <PText size="small" color="contrast-medium">Aucun chauffeur disponible sur ce creneau</PText>
            </div>
          ) : (
            <div className="space-y-static-sm">
              {availableDrivers.map((driver) => (
                <div key={driver.id} className="bg-white border border-contrast-low rounded-[8px] p-static-md">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-static-sm">
                      <div className="w-10 h-10 bg-surface rounded-full flex items-center justify-center">
                        <PText weight="bold" size="small">{driver.code}</PText>
                      </div>
                      <div>
                        <PText weight="semi-bold">{driver.prenom} {driver.nom}</PText>
                        {driver.telephone && (
                          <a href={`tel:${driver.telephone}`} className="flex items-center gap-static-xs mt-[2px]">
                            <PIcon name="phone" size="x-small" color="primary" />
                            <PText size="xx-small" color="primary">{driver.telephone}</PText>
                          </a>
                        )}
                        {!driver.telephone && (
                          <PText size="xx-small" color="contrast-medium">Pas de telephone</PText>
                        )}
                      </div>
                    </div>
                  </div>
                  <button
                    type="button"
                    disabled={replacingDriver}
                    onClick={() => handleConfirmReplacement(driver.id)}
                    className="mt-static-sm w-full bg-[#1a1a1a] text-white rounded-[4px] py-static-xs text-center text-sm font-semibold disabled:opacity-50 active:opacity-80 transition-opacity"
                  >
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

  // Main coordinator view
  const incidentCount = incidents.length;

  return (
    <div className="min-h-screen bg-canvas flex flex-col">
      {/* Header */}
      <div className="bg-[#1a1a1a] text-white p-static-md">
        <div className="flex items-center justify-between">
          <div>
            <PText size="xx-small" color="inherit">
              <span className="text-white opacity-70">{formatDate()}</span>
            </PText>
            <PHeading size="large" tag="h1" color="inherit">
              <span className="text-white">Coordinateur</span>
            </PHeading>
            <PText size="xx-small" color="inherit">
              <span className="text-white opacity-70">{chauffeur?.code} - {chauffeur?.prenom} {chauffeur?.nom}</span>
            </PText>
          </div>
          <div className="flex items-center gap-static-sm">
            <button type="button" onClick={fetchAll} className="p-static-xs">
              <PIcon name="refresh" color="inherit" />
            </button>
            <button type="button" onClick={handleLogout} className="p-static-xs">
              <PIcon name="logout" color="inherit" />
            </button>
          </div>
        </div>

        {/* Stats */}
        <div className="flex gap-static-sm mt-static-md">
          <div className="flex-1 bg-[rgba(255,255,255,0.1)] rounded-[8px] p-static-sm text-center">
            <span className="text-[20px] font-bold text-white">{courses.length}</span>
            <PText size="xx-small" color="inherit"><span className="text-white opacity-70">Courses</span></PText>
          </div>
          <div className={`flex-1 bg-[rgba(255,255,255,0.1)] rounded-[8px] p-static-sm text-center ${incidentCount > 0 ? 'border border-[#e74c3c]' : ''}`}>
            <span className={`text-[20px] font-bold ${incidentCount > 0 ? 'text-[#e74c3c]' : 'text-white'}`}>
              {incidentCount}
            </span>
            <PText size="xx-small" color="inherit"><span className="text-white opacity-70">Incidents</span></PText>
          </div>
        </div>
      </div>

      {/* Courses list */}
      <div className="flex-1 p-static-md space-y-static-sm overflow-y-auto">
        {courses.length === 0 ? (
          <div className="text-center py-static-xl px-static-md">
            <PText color="contrast-medium">
              {hasCreneaux ? 'Aucune course a superviser dans vos creneaux' : "Aucun creneau de coordination ne vous est attribue aujourd'hui"}
            </PText>
          </div>
        ) : (
          courses.map((course) => {
            const isReplaced = course.statut_realisation === 'remplace';
            const hasActiveIncident = course.incident && !isReplaced;
            const isDone = course.statut_realisation === 'termine' || course.statut_realisation === 'terminee';
            const chauffeurConfirmed = course.statut_realisation === 'en_cours' || isDone;
            const coordConfirmed = !!course.confirme_coordinateur_at;
            // En retard : heure passee et aucun depart confirme (ni chauffeur ni coordinateur)
            const isLate = !isReplaced && !chauffeurConfirmed && !coordConfirmed && new Date(course.date_heure).getTime() < Date.now();
            return (
              <div
                key={course.id}
                className={`bg-white border rounded-[8px] p-static-md ${
                  hasActiveIncident ? 'border-[#e74c3c] border-l-4' : 'border-contrast-low'
                }`}
              >
                <div className="flex items-start justify-between">
                  <div>
                    <PText size="large" weight="bold">{formatTime(course.date_heure)}</PText>
                    <PText weight="semi-bold" className="mt-static-xs">
                      {course.depart} → {course.arrivee}
                    </PText>
                    {course.chauffeur && (
                      <div className="flex items-center gap-static-xs mt-static-xs">
                        <PText size="x-small" color="contrast-medium">
                          {course.chauffeur.prenom} {course.chauffeur.nom} ({course.chauffeur.code})
                        </PText>
                        {course.chauffeur.telephone && (
                          <a href={`tel:${course.chauffeur.telephone}`} className="inline-flex">
                            <PIcon name="phone" size="x-small" color="primary" />
                          </a>
                        )}
                      </div>
                    )}
                    <div className="flex items-center gap-static-xs mt-static-xs">
                      <PTag variant={chauffeurConfirmed ? 'success' : undefined}>
                        Chauffeur {chauffeurConfirmed ? '✓' : '—'}
                      </PTag>
                      <PTag variant={coordConfirmed ? 'success' : undefined}>
                        Coord. {coordConfirmed ? '✓' : '—'}
                      </PTag>
                    </div>
                  </div>
                  <div className="flex flex-col items-end gap-static-xs">
                    <PTag variant={getPlanificationVariant(course.statut_planification)}>
                      {getPlanificationLabel(course.statut_planification)}
                    </PTag>
                    <PTag variant={isReplaced ? 'success' : isLate ? 'error' : getRealisationVariant(course.statut_realisation)}>
                      {isReplaced ? 'TERMINE' : isLate ? 'EN RETARD' : getRealisationLabel(course.statut_realisation)}
                    </PTag>
                  </div>
                </div>

                {hasActiveIncident && (
                  <div className="mt-static-sm pt-static-sm border-t border-contrast-low flex gap-static-sm">
                    <button
                      type="button"
                      onClick={() => handleViewIncident(course.incident as IncidentDetail)}
                      className="flex-1 bg-[#fef3f2] border border-[#e74c3c] rounded-[4px] py-static-xs px-static-sm flex items-center justify-center gap-static-xs"
                    >
                      <PIcon name="information" size="x-small" color="notification-error" />
                      <PText size="xx-small" weight="semi-bold" color="notification-error">
                        {getIncidentLabel(course.incident!.type)}
                      </PText>
                    </button>
                    <button
                      type="button"
                      onClick={() => handleStartReplacement(course)}
                      className="bg-[#1a1a1a] text-white rounded-[4px] py-static-xs px-static-sm flex items-center gap-static-xs"
                    >
                      <PIcon name="refresh" size="x-small" color="inherit" />
                      <span className="text-xs font-semibold">Remplacer</span>
                    </button>
                  </div>
                )}

                {!hasActiveIncident && !isReplaced && !isDone && (
                  <div className="mt-static-sm pt-static-sm border-t border-contrast-low flex gap-static-sm">
                    {(chauffeurConfirmed || coordConfirmed) ? (
                      <div className="flex-1 bg-[#e8f5e9] rounded-[4px] py-static-xs px-static-sm flex items-center justify-center">
                        <PText size="xx-small" weight="semi-bold" color="notification-success">Depart confirme ✓</PText>
                      </div>
                    ) : (
                      <button
                        type="button"
                        onClick={() => handleConfirmDepart(course)}
                        className="flex-1 bg-[#e8f5e9] border border-[#0a8a0a] rounded-[4px] py-static-xs px-static-sm flex items-center justify-center"
                      >
                        <PText size="xx-small" weight="semi-bold" color="notification-success">Confirmer depart</PText>
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => handleStartReplacement(course)}
                      className="bg-[#1a1a1a] text-white rounded-[4px] py-static-xs px-static-sm flex items-center gap-static-xs"
                    >
                      <PIcon name="refresh" size="x-small" color="inherit" />
                      <span className="text-xs font-semibold">Remplacer</span>
                    </button>
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>

      {/* Tomorrow's planning */}
      <div className="p-static-md">
        <button
          type="button"
          onClick={() => setShowTomorrow(!showTomorrow)}
          className="w-full flex items-center justify-between bg-[rgba(255,255,255,0.05)] rounded-[8px] p-static-md border border-contrast-low"
        >
          <div className="flex items-center gap-static-sm">
            <PIcon name="calendar" size="small" />
            <PText weight="semi-bold">Planning demain</PText>
          </div>
          <div className="flex items-center gap-static-xs">
            <PTag>{tomorrowCourses.length}</PTag>
            <PIcon name={showTomorrow ? 'arrow-head-up' : 'arrow-head-down'} size="small" />
          </div>
        </button>

        {showTomorrow && (
          <div className="mt-static-sm space-y-static-xs">
            {tomorrowCourses.length === 0 ? (
              <div className="text-center py-static-md">
                <PText size="small" color="contrast-medium">Aucune course prevue demain</PText>
              </div>
            ) : (
              tomorrowCourses.map((course) => (
                <div key={course.id} className="bg-white border border-contrast-low rounded-[8px] p-static-sm">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-static-sm">
                      <PText size="small" weight="bold">{formatTime(course.date_heure)}</PText>
                      <PText size="small">{course.depart} → {course.arrivee}</PText>
                    </div>
                    <PTag variant="info">PROGRAMME</PTag>
                  </div>
                  {course.chauffeur && (
                    <div className="flex items-center gap-static-xs mt-static-xs">
                      <PText size="xx-small" color="contrast-medium">
                        {course.chauffeur.prenom} {course.chauffeur.nom} ({course.chauffeur.code})
                      </PText>
                      {course.chauffeur.telephone && (
                        <a href={`tel:${course.chauffeur.telephone}`} className="inline-flex">
                          <PIcon name="phone" size="x-small" color="primary" />
                        </a>
                      )}
                    </div>
                  )}
                </div>
              ))
            )}
          </div>
        )}
      </div>
    </div>
  );
}
