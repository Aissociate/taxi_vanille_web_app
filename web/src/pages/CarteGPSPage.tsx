import { useEffect, useState, useRef } from 'react';
import { supabase } from '../lib/supabase';
import { ChevronDown } from 'lucide-react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';

interface Ligne {
  id: string;
  nom: string;
  code: string;
  couleur: string;
}

interface LigneArret {
  id: string;
  ligne_id: string;
  nom: string;
  latitude: number;
  longitude: number;
  ordre: number;
}

interface Chauffeur {
  id: string;
  nom: string;
  prenom: string;
  code: string;
  statut: string;
}

interface GpsPing {
  id: string;
  chauffeur_id: string;
  latitude: number;
  longitude: number;
  recorded_at: string;
}

interface CourseActive {
  id: string;
  chauffeur_id: string;
  ligne_id: string;
  statut: string;
}

type FilterLigne = 'tous' | string;

export function CarteGPSPage() {
  const mapRef = useRef<HTMLDivElement>(null);
  const mapInstance = useRef<L.Map | null>(null);
  const [lignes, setLignes] = useState<Ligne[]>([]);
  const [arrets, setArrets] = useState<LigneArret[]>([]);
  const [chauffeurs, setChauffeurs] = useState<Chauffeur[]>([]);
  const [coursesActives, setCoursesActives] = useState<CourseActive[]>([]);
  const [gpsPings, setGpsPings] = useState<GpsPing[]>([]);
  const [filterLigne, setFilterLigne] = useState<FilterLigne>('tous');
  const [showLignes, setShowLignes] = useState(true);
  const [darkMode, setDarkMode] = useState(false);
  const [expandedChauffeur, setExpandedChauffeur] = useState<string | null>(null);
  const layersRef = useRef<L.LayerGroup | null>(null);
  const markersRef = useRef<L.LayerGroup | null>(null);

  useEffect(() => {
    loadData();
    loadPings();
    const interval = setInterval(loadPings, 30000);
    return () => clearInterval(interval);
  }, []);

  async function loadData() {
    const [lignesRes, arretsRes, chauffeursRes, coursesRes] = await Promise.all([
      supabase.from('lignes').select('id, nom, code, couleur').order('code'),
      supabase.from('ligne_arrets').select('*').order('ordre'),
      supabase.from('chauffeurs').select('id, nom, prenom, code, statut').order('code'),
      supabase.from('courses').select('id, chauffeur_id, ligne_id, statut').eq('statut', 'en_cours'),
    ]);
    if (lignesRes.data) setLignes(lignesRes.data);
    if (arretsRes.data) setArrets(arretsRes.data);
    if (chauffeursRes.data) setChauffeurs(chauffeursRes.data);
    if (coursesRes.data) setCoursesActives(coursesRes.data);
  }

  async function loadPings() {
    const { data } = await supabase
      .from('gps_pings')
      .select('id, chauffeur_id, latitude, longitude, recorded_at')
      .order('recorded_at', { ascending: false })
      .limit(200);
    if (data) setGpsPings(data);
  }

  function getLastPing(chauffeurId: string): GpsPing | null {
    return gpsPings.find(p => p.chauffeur_id === chauffeurId) || null;
  }

  function getLast5Pings(chauffeurId: string): GpsPing[] {
    return gpsPings.filter(p => p.chauffeur_id === chauffeurId).slice(0, 5);
  }

  function isActive(chauffeurId: string): boolean {
    const lastPing = getLastPing(chauffeurId);
    if (!lastPing) return false;
    const diff = Date.now() - new Date(lastPing.recorded_at).getTime();
    return diff < 2 * 60 * 1000;
  }

  // Init map
  useEffect(() => {
    if (!mapRef.current || mapInstance.current) return;

    const validArrets = arrets.filter(a => a.latitude !== 0 || a.longitude !== 0);
    const defaultCenter: L.LatLngExpression = validArrets.length > 0
      ? [validArrets[0].latitude, validArrets[0].longitude]
      : [-12.78, 45.15];

    const map = L.map(mapRef.current, {
      center: defaultCenter,
      zoom: 12,
      zoomControl: false,
    });

    L.control.zoom({ position: 'bottomright' }).addTo(map);

    L.tileLayer(
      darkMode
        ? 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png'
        : 'https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png',
      { attribution: '&copy; OpenStreetMap &copy; CARTO', maxZoom: 19 }
    ).addTo(map);

    layersRef.current = L.layerGroup().addTo(map);
    markersRef.current = L.layerGroup().addTo(map);
    mapInstance.current = map;

    return () => { map.remove(); mapInstance.current = null; };
  }, [arrets.length]);

  // Update tile layer on dark mode change
  useEffect(() => {
    if (!mapInstance.current) return;
    mapInstance.current.eachLayer((layer) => {
      if (layer instanceof L.TileLayer) layer.remove();
    });
    L.tileLayer(
      darkMode
        ? 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png'
        : 'https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png',
      { attribution: '&copy; OpenStreetMap &copy; CARTO', maxZoom: 19 }
    ).addTo(mapInstance.current);
  }, [darkMode]);

  // Draw lines
  useEffect(() => {
    if (!layersRef.current) return;
    layersRef.current.clearLayers();

    if (!showLignes) return;

    const filteredLignes = filterLigne === 'tous' ? lignes : lignes.filter(l => l.id === filterLigne);

    filteredLignes.forEach(ligne => {
      const ligneArrets = arrets
        .filter(a => a.ligne_id === ligne.id && (a.latitude !== 0 || a.longitude !== 0))
        .sort((a, b) => a.ordre - b.ordre);

      if (ligneArrets.length < 2) return;

      const coords: L.LatLngExpression[] = ligneArrets.map(a => [a.latitude, a.longitude]);
      const polyline = L.polyline(coords, {
        color: ligne.couleur || '#e74c3c',
        weight: 4,
        opacity: 0.85,
      });
      layersRef.current!.addLayer(polyline);

      ligneArrets.forEach(a => {
        const circle = L.circleMarker([a.latitude, a.longitude], {
          radius: 5,
          color: ligne.couleur || '#e74c3c',
          fillColor: '#fff',
          fillOpacity: 1,
          weight: 2,
        });
        circle.bindTooltip(a.nom, { direction: 'top', offset: [0, -8] });
        layersRef.current!.addLayer(circle);
      });
    });
  }, [lignes, arrets, filterLigne, showLignes]);

  // Draw chauffeur markers from latest pings
  useEffect(() => {
    if (!markersRef.current) return;
    markersRef.current.clearLayers();

    chauffeurs.forEach(ch => {
      const lastPing = getLastPing(ch.id);
      if (!lastPing) return;

      const active = isActive(ch.id);
      const color = active ? '#10b981' : '#9ca3af';

      const marker = L.circleMarker([lastPing.latitude, lastPing.longitude], {
        radius: 8,
        color: color,
        fillColor: color,
        fillOpacity: 0.9,
        weight: 2,
      });
      marker.bindTooltip(`${ch.code} - ${ch.nom} ${ch.prenom}`, { direction: 'top', offset: [0, -10] });
      markersRef.current!.addLayer(marker);
    });
  }, [gpsPings, chauffeurs]);

  function focusOnPing(ping: GpsPing) {
    if (!mapInstance.current) return;
    mapInstance.current.setView([ping.latitude, ping.longitude], 15);
  }

  function formatPingTime(dateStr: string): string {
    const d = new Date(dateStr);
    return d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  }

  function formatPingDate(dateStr: string): string {
    const d = new Date(dateStr);
    return d.toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit' }) + ' ' + formatPingTime(dateStr);
  }

  const activeCount = chauffeurs.filter(c => isActive(c.id)).length;
  const inactiveCount = chauffeurs.length - activeCount;

  const filteredChauffeurs = filterLigne === 'tous'
    ? chauffeurs
    : chauffeurs.filter(c => {
        const course = coursesActives.find(co => co.chauffeur_id === c.id);
        return course?.ligne_id === filterLigne;
      });

  return (
    <div className="h-[calc(100vh-4rem)] flex flex-col -m-8">
      {/* Top bar */}
      <div className="flex items-center justify-between px-6 py-3 bg-white border-b border-gray-100">
        <div>
          <p className="text-[10px] text-gray-400 uppercase tracking-wide font-medium">Direction - Temps reel</p>
          <h1 className="text-xl font-bold text-gray-900">Carte GPS</h1>
        </div>
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-3">
            <span className="flex items-center gap-1.5 text-xs">
              <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
              <span className="font-medium text-emerald-700">{activeCount} actif{activeCount > 1 ? 's' : ''}</span>
            </span>
            <span className="flex items-center gap-1.5 text-xs">
              <span className="w-2 h-2 rounded-full bg-gray-300" />
              <span className="font-medium text-gray-500">{inactiveCount} inactif{inactiveCount > 1 ? 's' : ''}</span>
            </span>
          </div>
          <button
            onClick={() => setShowLignes(!showLignes)}
            className={`px-3 py-1.5 text-xs rounded-lg border font-medium transition-colors ${showLignes ? 'border-gray-300 text-gray-700 bg-white' : 'border-amber-300 bg-amber-50 text-amber-700'}`}
          >
            {showLignes ? 'Masquer lignes' : 'Afficher lignes'}
          </button>
          <button
            onClick={() => setDarkMode(!darkMode)}
            className="px-3 py-1.5 text-xs rounded-lg border border-gray-300 text-gray-700 font-medium hover:bg-gray-50 transition-colors"
          >
            {darkMode ? '○ Clair' : '● Sombre'}
          </button>
        </div>
      </div>

      <div className="flex flex-1 overflow-hidden">
        {/* Sidebar */}
        <div className="w-64 bg-white border-r border-gray-100 flex flex-col overflow-hidden">
          {/* Line filter */}
          <div className="px-3 py-3 border-b border-gray-100">
            <div className="flex flex-wrap gap-1.5">
              <button
                onClick={() => setFilterLigne('tous')}
                className={`px-2.5 py-1 rounded text-xs font-medium border transition-colors ${filterLigne === 'tous' ? 'bg-gray-900 text-white border-gray-900' : 'bg-white text-gray-600 border-gray-200 hover:border-gray-300'}`}
              >
                Tous
              </button>
              {lignes.map(l => (
                <button
                  key={l.id}
                  onClick={() => setFilterLigne(l.id)}
                  className={`px-2.5 py-1 rounded text-xs font-medium border transition-colors ${filterLigne === l.id ? 'text-white border-transparent' : 'bg-white text-gray-600 border-gray-200 hover:border-gray-300'}`}
                  style={filterLigne === l.id ? { backgroundColor: l.couleur || '#333' } : {}}
                >
                  {l.code || l.nom.slice(0, 3)}
                </button>
              ))}
            </div>
          </div>

          {/* Legend */}
          <div className="px-3 py-2 border-b border-gray-50">
            <div className="flex items-center gap-3 text-[10px] text-gray-500">
              <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-emerald-500" /> Actif (&lt;2min)</span>
              <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-gray-300" /> Inactif</span>
            </div>
          </div>

          {/* Chauffeur list with ping history */}
          <div className="flex-1 overflow-y-auto">
            {filteredChauffeurs.map(c => {
              const active = isActive(c.id);
              const lastPing = getLastPing(c.id);
              const last5 = getLast5Pings(c.id);
              const isExpanded = expandedChauffeur === c.id;

              return (
                <div key={c.id} className="border-b border-gray-50">
                  <div
                    className="px-3 py-2.5 hover:bg-gray-50 transition-colors cursor-pointer"
                    onClick={() => {
                      if (lastPing) focusOnPing(lastPing);
                      setExpandedChauffeur(isExpanded ? null : c.id);
                    }}
                  >
                    <div className="flex items-center gap-2">
                      <span className={`w-2.5 h-2.5 rounded-full flex-shrink-0 ${active ? 'bg-emerald-500 animate-pulse' : 'bg-gray-300'}`} />
                      <span className="text-[10px] px-1.5 py-0.5 rounded font-bold bg-gray-100 text-gray-700 flex-shrink-0">
                        {c.code || '?'}
                      </span>
                      <span className="text-sm font-medium text-gray-900 truncate">
                        {c.nom} {c.prenom}
                      </span>
                      {last5.length > 0 && (
                        <ChevronDown className={`w-3.5 h-3.5 text-gray-400 ml-auto flex-shrink-0 transition-transform ${isExpanded ? 'rotate-180' : ''}`} />
                      )}
                    </div>
                    <div className="ml-5 mt-0.5 flex items-center gap-2">
                      <span className={`text-[10px] font-semibold ${active ? 'text-emerald-600' : 'text-gray-400'}`}>
                        {active ? 'ACTIF' : 'INACTIF'}
                      </span>
                      {lastPing && (
                        <span className="text-[10px] text-gray-400">
                          Dernier: {formatPingDate(lastPing.recorded_at)}
                        </span>
                      )}
                      {!lastPing && (
                        <span className="text-[10px] text-gray-300">Aucun ping</span>
                      )}
                    </div>
                  </div>

                  {/* Expandable ping history */}
                  {isExpanded && last5.length > 0 && (
                    <div className="bg-gray-50 border-t border-gray-100 px-3 py-2">
                      <p className="text-[9px] text-gray-400 uppercase font-semibold mb-1.5">5 derniers pings</p>
                      <div className="space-y-1">
                        {last5.map((ping, i) => (
                          <button
                            key={ping.id}
                            onClick={(e) => { e.stopPropagation(); focusOnPing(ping); }}
                            className={`w-full text-left px-2 py-1.5 rounded text-[11px] transition-colors flex items-center gap-2 ${i === 0 ? 'bg-emerald-50 hover:bg-emerald-100 border border-emerald-200' : 'bg-white hover:bg-gray-100 border border-gray-150'}`}
                          >
                            <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${i === 0 ? 'bg-emerald-500' : 'bg-gray-300'}`} />
                            <span className="font-medium text-gray-700">{formatPingTime(ping.recorded_at)}</span>
                            <span className="text-gray-400 text-[10px]">
                              {Number(ping.latitude).toFixed(4)}, {Number(ping.longitude).toFixed(4)}
                            </span>
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
            {filteredChauffeurs.length === 0 && (
              <div className="p-4 text-center text-xs text-gray-400">Aucun chauffeur</div>
            )}
          </div>
        </div>

        {/* Map area */}
        <div className="flex-1 relative">
          {/* Status cards */}
          <div className="absolute top-4 left-4 z-[1000] flex gap-3">
            <div className="bg-white rounded-lg shadow-sm border border-gray-100 px-4 py-2">
              <p className="text-[10px] text-gray-400 uppercase font-medium">Actifs</p>
              <p className="text-xl font-bold text-emerald-600">{activeCount}</p>
            </div>
            <div className="bg-white rounded-lg shadow-sm border border-gray-100 px-4 py-2">
              <p className="text-[10px] text-gray-400 uppercase font-medium">Inactifs</p>
              <p className="text-xl font-bold text-gray-500">{inactiveCount}</p>
            </div>
          </div>

          {/* Legend */}
          {showLignes && lignes.length > 0 && (
            <div className="absolute bottom-6 left-4 z-[1000] bg-white rounded-lg shadow-sm border border-gray-100 px-4 py-3">
              <p className="text-[10px] text-gray-400 uppercase font-medium mb-2">Lignes</p>
              <div className="space-y-1.5">
                {(filterLigne === 'tous' ? lignes : lignes.filter(l => l.id === filterLigne)).map(l => (
                  <div key={l.id} className="flex items-center gap-2">
                    <span className="w-5 h-0.5 rounded" style={{ backgroundColor: l.couleur || '#333' }} />
                    <span
                      className="px-1 py-0 rounded text-[9px] font-bold text-white"
                      style={{ backgroundColor: l.couleur || '#333' }}
                    >
                      {l.code}
                    </span>
                    <span className="text-xs text-gray-600">{l.nom}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div ref={mapRef} className="w-full h-full" />
        </div>
      </div>
    </div>
  );
}
