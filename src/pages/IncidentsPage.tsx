import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { AlertTriangle, Camera, Mic, Video, CheckCircle, Clock, X, MapPin, User as UserIcon } from 'lucide-react';
import type { User } from '@supabase/supabase-js';

interface Incident {
  id: string;
  course_id: string | null;
  chauffeur_id: string | null;
  type: string;
  description: string;
  photo_url: string | null;
  audio_url: string | null;
  video_url: string | null;
  latitude: number | null;
  longitude: number | null;
  created_at: string;
  mesure_prise: string | null;
  coordinateur_id: string | null;
  handled_at: string | null;
}

interface Chauffeur {
  id: string;
  nom: string;
  prenom: string;
  code: string;
}

interface IncidentsPageProps {
  user: User;
}

type FilterStatus = 'all' | 'open' | 'handled';

export function IncidentsPage({ user }: IncidentsPageProps) {
  const [incidents, setIncidents] = useState<Incident[]>([]);
  const [chauffeurs, setChauffeurs] = useState<Chauffeur[]>([]);
  const [filter, setFilter] = useState<FilterStatus>('all');
  const [selectedIncident, setSelectedIncident] = useState<Incident | null>(null);
  const [mesureForm, setMesureForm] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadData();
  }, []);

  async function loadData() {
    setLoading(true);
    try {
      const [incRes, chRes] = await Promise.all([
        supabase.from('incidents')
          .select('*')
          .order('created_at', { ascending: false })
          .limit(100),
        supabase.from('chauffeurs').select('id, nom, prenom, code'),
      ]);
      if (incRes.data) setIncidents(incRes.data);
      if (chRes.data) setChauffeurs(chRes.data);
    } catch (err) {
      console.error('Incidents load error:', err);
    } finally {
      setLoading(false);
    }
  }

  function getChauffeur(id: string | null) {
    return chauffeurs.find(c => c.id === id);
  }

  const filtered = incidents.filter(i => {
    if (filter === 'open') return !i.handled_at;
    if (filter === 'handled') return !!i.handled_at;
    return true;
  });

  const openCount = incidents.filter(i => !i.handled_at).length;
  const handledCount = incidents.filter(i => !!i.handled_at).length;

  async function handleResolve(incident: Incident) {
    const { error } = await supabase.from('incidents').update({
      mesure_prise: mesureForm || null,
      handled_at: new Date().toISOString(),
      coordinateur_id: incident.coordinateur_id || user.id,
    }).eq('id', incident.id);
    if (error) {
      console.error('Resolve error:', error);
      return;
    }
    setSelectedIncident(null);
    setMesureForm('');
    loadData();
  }

  return (
    <div className="space-y-6 max-w-[1200px]">
      <div>
        <p className="section-label">Suivi et resolution</p>
        <h1 className="page-title mt-1">Incidents</h1>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-4">
        <div className="card p-4">
          <p className="section-label">Total</p>
          <p className="text-2xl font-black text-gray-900 mt-1">{incidents.length}</p>
        </div>
        <div className="card p-4 !border-amber-200">
          <p className="section-label text-amber-600">En attente</p>
          <p className="text-2xl font-black text-amber-600 mt-1">{openCount}</p>
        </div>
        <div className="card p-4 !border-emerald-200">
          <p className="section-label text-emerald-600">Traites</p>
          <p className="text-2xl font-black text-emerald-600 mt-1">{handledCount}</p>
        </div>
      </div>

      {/* Filters */}
      <div className="flex gap-1.5 bg-white rounded-lg border border-gray-200 p-1 w-fit">
        {([
          { id: 'all' as FilterStatus, label: 'Tous', count: incidents.length },
          { id: 'open' as FilterStatus, label: 'En attente', count: openCount },
          { id: 'handled' as FilterStatus, label: 'Traites', count: handledCount },
        ]).map(f => (
          <button
            key={f.id}
            onClick={() => setFilter(f.id)}
            className={`flex items-center gap-2 px-3.5 py-2 rounded-md text-xs font-medium transition-all duration-200 ${
              filter === f.id ? 'bg-gray-900 text-white shadow-sm' : 'text-gray-600 hover:text-gray-900 hover:bg-gray-50'
            }`}
          >
            {f.label}
            <span className={`px-1.5 py-0.5 rounded text-[10px] font-semibold ${
              filter === f.id ? 'bg-white/20 text-white' : 'bg-gray-100 text-gray-500'
            }`}>{f.count}</span>
          </button>
        ))}
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-16">
          <span className="w-6 h-6 border-2 border-gray-900 border-t-transparent rounded-full animate-spin" />
        </div>
      ) : filtered.length === 0 ? (
        <div className="card p-16 text-center">
          <AlertTriangle className="w-12 h-12 text-gray-300 mx-auto mb-3" />
          <p className="text-gray-500">Aucun incident</p>
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map((incident, idx) => {
            const ch = getChauffeur(incident.chauffeur_id);
            const isHandled = !!incident.handled_at;
            return (
              <div
                key={incident.id}
                onClick={() => setSelectedIncident(incident)}
                className={`card px-5 py-4 cursor-pointer hover:shadow-card-hover transition-all duration-200 animate-slide-up ${isHandled ? 'opacity-75' : ''}`}
                style={{ animationDelay: `${idx * 30}ms` }}
              >
                <div className="flex items-start gap-4">
                  {/* Status indicator */}
                  <div className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 ${isHandled ? 'bg-emerald-50' : 'bg-red-50'}`}>
                    {isHandled
                      ? <CheckCircle className="w-5 h-5 text-emerald-600" />
                      : <AlertTriangle className="w-5 h-5 text-red-600" />
                    }
                  </div>

                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <span className={`text-xs font-semibold px-2 py-0.5 rounded ${isHandled ? 'bg-emerald-100 text-emerald-700' : 'bg-red-100 text-red-700'}`}>
                        {incident.type || 'Incident'}
                      </span>
                      {ch && (
                        <span className="text-xs text-gray-500 flex items-center gap-1">
                          <UserIcon className="w-3 h-3" />
                          {ch.code} - {ch.nom} {ch.prenom}
                        </span>
                      )}
                      {incident.latitude && (
                        <span className="text-xs text-gray-400 flex items-center gap-0.5">
                          <MapPin className="w-3 h-3" />
                          {Number(incident.latitude).toFixed(4)}, {Number(incident.longitude).toFixed(4)}
                        </span>
                      )}
                    </div>
                    <p className="text-sm text-gray-900 line-clamp-2">{incident.description || 'Aucune description'}</p>
                    {incident.mesure_prise && (
                      <p className="text-xs text-emerald-700 mt-1 flex items-center gap-1">
                        <CheckCircle className="w-3 h-3" /> {incident.mesure_prise}
                      </p>
                    )}
                  </div>

                  {/* Media indicators */}
                  <div className="flex items-center gap-2 flex-shrink-0">
                    {incident.photo_url && <Camera className="w-4 h-4 text-sky-500" />}
                    {incident.audio_url && <Mic className="w-4 h-4 text-amber-500" />}
                    {incident.video_url && <Video className="w-4 h-4 text-red-500" />}
                  </div>

                  {/* Time */}
                  <div className="text-right flex-shrink-0">
                    <p className="text-xs text-gray-500">
                      {new Date(incident.created_at).toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit' })}
                    </p>
                    <p className="text-xs font-medium text-gray-700">
                      {new Date(incident.created_at).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}
                    </p>
                    {isHandled && incident.handled_at && (
                      <p className="text-[10px] text-emerald-600 mt-1">
                        Traite {new Date(incident.handled_at).toLocaleDateString('fr-FR')}
                      </p>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Detail Modal */}
      {selectedIncident && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={() => setSelectedIncident(null)}>
          <div className="bg-white rounded-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto shadow-2xl animate-scale-in" onClick={e => e.stopPropagation()}>
            <div className="p-6 border-b border-gray-100 flex items-center justify-between">
              <div>
                <p className="section-label">Detail incident</p>
                <h2 className="text-lg font-bold text-gray-900 mt-0.5">{selectedIncident.type || 'Incident'}</h2>
              </div>
              <button onClick={() => setSelectedIncident(null)} className="text-gray-400 hover:text-gray-600 p-1">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-6 space-y-5">
              {/* Meta */}
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <p className="text-xs text-gray-500 uppercase font-semibold mb-1">Chauffeur</p>
                  <p className="font-medium text-gray-900">
                    {(() => {
                      const ch = getChauffeur(selectedIncident.chauffeur_id);
                      return ch ? `${ch.code} - ${ch.nom} ${ch.prenom}` : 'Non identifie';
                    })()}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-gray-500 uppercase font-semibold mb-1">Date/Heure</p>
                  <p className="font-medium text-gray-900">
                    {new Date(selectedIncident.created_at).toLocaleString('fr-FR')}
                  </p>
                </div>
                {selectedIncident.latitude != null && selectedIncident.longitude != null && (
                  <div>
                    <p className="text-xs text-gray-500 uppercase font-semibold mb-1">Position GPS</p>
                    <p className="font-medium text-gray-900">
                      {Number(selectedIncident.latitude).toFixed(5)}, {Number(selectedIncident.longitude).toFixed(5)}
                    </p>
                  </div>
                )}
                <div>
                  <p className="text-xs text-gray-500 uppercase font-semibold mb-1">Statut</p>
                  <span className={`inline-flex items-center gap-1 text-xs font-medium px-2 py-1 rounded ${selectedIncident.handled_at ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'}`}>
                    {selectedIncident.handled_at ? <CheckCircle className="w-3 h-3" /> : <Clock className="w-3 h-3" />}
                    {selectedIncident.handled_at ? 'Traite' : 'En attente'}
                  </span>
                </div>
              </div>

              {/* Description */}
              <div>
                <p className="text-xs text-gray-500 uppercase font-semibold mb-1">Description</p>
                <p className="text-sm text-gray-900 bg-gray-50 rounded-lg p-3">{selectedIncident.description || 'Aucune description fournie'}</p>
              </div>

              {/* Media */}
              {(selectedIncident.photo_url || selectedIncident.audio_url || selectedIncident.video_url) && (
                <div>
                  <p className="text-xs text-gray-500 uppercase font-semibold mb-2">Preuves multimedia</p>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    {selectedIncident.photo_url && (
                      <div className="border border-gray-200 rounded-lg overflow-hidden">
                        <div className="px-3 py-2 bg-gray-50 flex items-center gap-2 border-b border-gray-200">
                          <Camera className="w-4 h-4 text-sky-500" />
                          <span className="text-xs font-medium text-gray-700">Photo</span>
                        </div>
                        <a href={selectedIncident.photo_url} target="_blank" rel="noopener noreferrer" className="block">
                          <img
                            src={selectedIncident.photo_url}
                            alt="Photo incident"
                            className="w-full h-48 object-cover hover:opacity-90 transition-opacity"
                            onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
                          />
                        </a>
                      </div>
                    )}
                    {selectedIncident.audio_url && (
                      <div className="border border-gray-200 rounded-lg overflow-hidden">
                        <div className="px-3 py-2 bg-gray-50 flex items-center gap-2 border-b border-gray-200">
                          <Mic className="w-4 h-4 text-amber-500" />
                          <span className="text-xs font-medium text-gray-700">Audio</span>
                        </div>
                        <div className="p-3">
                          <audio controls className="w-full" src={selectedIncident.audio_url}>
                            Votre navigateur ne supporte pas l'audio
                          </audio>
                        </div>
                      </div>
                    )}
                    {selectedIncident.video_url && (
                      <div className="border border-gray-200 rounded-lg overflow-hidden md:col-span-2">
                        <div className="px-3 py-2 bg-gray-50 flex items-center gap-2 border-b border-gray-200">
                          <Video className="w-4 h-4 text-red-500" />
                          <span className="text-xs font-medium text-gray-700">Video</span>
                        </div>
                        <div className="p-3">
                          <video controls className="w-full rounded" src={selectedIncident.video_url}>
                            Votre navigateur ne supporte pas la video
                          </video>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* Resolution */}
              {selectedIncident.handled_at ? (
                <div className="bg-emerald-50 border border-emerald-200 rounded-lg p-4">
                  <p className="text-xs text-emerald-700 uppercase font-semibold mb-1">Mesure prise</p>
                  <p className="text-sm text-emerald-900">{selectedIncident.mesure_prise || 'Aucune mesure specifiee'}</p>
                  <p className="text-xs text-emerald-600 mt-2">
                    Traite le {new Date(selectedIncident.handled_at).toLocaleString('fr-FR')}
                  </p>
                </div>
              ) : (
                <div className="border-t border-gray-100 pt-4">
                  <p className="text-xs text-gray-500 uppercase font-semibold mb-2">Marquer comme traite</p>
                  <textarea
                    value={mesureForm}
                    onChange={(e) => setMesureForm(e.target.value)}
                    placeholder="Decrire la mesure prise..."
                    className="input-field h-20 resize-none mb-3"
                  />
                  <button
                    onClick={() => handleResolve(selectedIncident)}
                    className="btn-accent flex items-center gap-2"
                  >
                    <CheckCircle className="w-4 h-4" /> Marquer comme traite
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
