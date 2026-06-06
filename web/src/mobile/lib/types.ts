export interface Chauffeur {
  id: string;
  nom: string;
  prenom: string;
  telephone: string;
  code: string;
  pin: string;
  pin_android: string | null;
  is_coordinateur: boolean;
  ligne_id: string | null;
  statut: string;
  vehicule_immatriculation: string;
  vehicule_places: number;
  user_id: string;
}

export interface Ligne {
  id: string;
  nom: string;
  depart: string;
  arrivee: string;
  code: string;
  couleur: string;
  nb_arrets: number;
}

export interface LigneArret {
  id: string;
  ligne_id: string;
  nom: string;
  latitude: number;
  longitude: number;
  ordre: number;
}

export interface Course {
  id: string;
  date_heure: string;
  chauffeur_id: string | null;
  ligne_id: string | null;
  client_id: string | null;
  depart: string;
  arrivee: string;
  statut: string;
  statut_planification: string | null;
  statut_realisation: string | null;
  periode: string;
  duree_minutes: number;
  notes: string;
  user_id: string;
}

export interface CourseExecution {
  id: string;
  course_id: string;
  chauffeur_id: string;
  statut: 'planifie' | 'en_cours' | 'termine' | 'synchroniser';
  heure_debut: string | null;
  heure_fin: string | null;
  user_id: string;
}

export interface GpsPing {
  id: string;
  course_execution_id: string;
  chauffeur_id: string;
  latitude: number;
  longitude: number;
  recorded_at: string;
}

export interface ArretExecution {
  id: string;
  course_execution_id: string;
  arret_id: string;
  ordre: number;
  montants: number;
  descendants: number;
  heure_arrivee: string | null;
  heure_depart: string | null;
  statut: 'en_attente' | 'en_cours' | 'termine';
}

export interface Incident {
  id: string;
  course_id: string | null;
  chauffeur_id: string;
  type: string;
  description: string;
  photo_url: string;
  video_url: string;
  audio_url: string;
  mesure_prise: string | null;
  coordinateur_id: string | null;
  handled_at: string | null;
  created_at: string;
}

export type IncidentType =
  | 'accident'
  | 'panne'
  | 'retard'
  | 'voie_bloquee'
  | 'passager_refuse'
  | 'securite'
  | 'meteo'
  | 'client_absent'
  | 'autre';

export type UserRole = 'chauffeur' | 'coordinateur';
