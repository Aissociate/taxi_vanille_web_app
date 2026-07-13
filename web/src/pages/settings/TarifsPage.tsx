import { useEffect, useState, useRef } from 'react';
import { supabase } from '../../lib/supabase';
import { Calendar, Star, Moon, X } from 'lucide-react';
import type { User } from '@supabase/supabase-js';

interface TarifsPageProps {
  user: User;
}

type TypeJour = 'lun_ven' | 'samedi' | 'dimanche' | 'feries' | 'astreinte';

interface Plage {
  id?: string;
  type_jour: TypeJour;
  heure_debut: string;
  heure_fin: string;
  libelle: string;
  tarif: number;
  ordre: number;
  ligne_id: string | null;
}

interface Frais {
  id?: string;
  cle: string;
  valeur: number;
  periode: string;
  actif: boolean;
  description: string;
}

interface TrancheKm {
  id?: string;
  km_de: number;
  km_a: number | null;
  tarif: number;
  ordre: number;
}

interface Ligne {
  id: string;
  code: string;
  nom: string;
}

const TABS: { key: TypeJour; label: string }[] = [
  { key: 'lun_ven', label: 'Lun \u2013 Ven' },
  { key: 'samedi', label: 'Samedi' },
  { key: 'dimanche', label: 'Dimanche' },
  { key: 'feries', label: 'Jours feries' },
  { key: 'astreinte', label: 'Astreinte' },
];

// Toutes les demi-heures sur 24h (00:00 -> 23:30) pour pouvoir definir des plages
// de nuit (ex. 21:00 -> 05:00) que l'ancienne plage 04:00-22:00 interdisait.
const HEURES = Array.from({ length: 48 }, (_, i) => {
  const h = Math.floor(i / 2);
  const m = i % 2 === 0 ? '00' : '30';
  return `${h.toString().padStart(2, '0')}:${m}`;
});

export function TarifsPage({ user }: TarifsPageProps) {
  const [activeTab, setActiveTab] = useState<TypeJour>('lun_ven');
  const [plages, setPlages] = useState<Plage[]>([]);
  const [frais, setFrais] = useState<Frais[]>([]);
  const [tranchesKm, setTranchesKm] = useState<TrancheKm[]>([]);
  const [lignes, setLignes] = useState<Ligne[]>([]);
  const [selectedLigne, setSelectedLigne] = useState<string>('all');
  const [loading, setLoading] = useState(true);
  // Sauvegardes accumulees par (table, id) : evite qu'editer un 2e champ dans le
  // delai de debounce annule la sauvegarde du 1er (l'ancien saveTimeout partage
  // ecrasait la sauvegarde precedente et savePlageNow ne s'executait meme pas).
  const pendingUpdates = useRef<Map<string, { table: string; id: string; updates: Record<string, unknown> }>>(new Map());
  const flushTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  async function flushUpdates() {
    if (flushTimer.current) { clearTimeout(flushTimer.current); flushTimer.current = null; }
    const items = Array.from(pendingUpdates.current.values());
    pendingUpdates.current.clear();
    for (const it of items) {
      const { error } = await supabase.from(it.table).update(it.updates).eq('id', it.id);
      if (error) alert(`Erreur d'enregistrement (${it.table}) : ${error.message}`);
    }
  }

  function scheduleUpdate(table: string, id: string, updates: Record<string, unknown>) {
    const key = `${table}:${id}`;
    const existing = pendingUpdates.current.get(key);
    pendingUpdates.current.set(key, { table, id, updates: { ...(existing?.updates || {}), ...updates } });
    if (flushTimer.current) clearTimeout(flushTimer.current);
    flushTimer.current = setTimeout(() => { flushUpdates(); }, 600);
  }

  useEffect(() => { loadAll(); }, []);
  // Flush les sauvegardes en attente si l'utilisateur quitte la page.
  useEffect(() => () => { if (pendingUpdates.current.size) flushUpdates(); }, []);

  async function loadAll() {
    setLoading(true);
    const [pRes, fRes, kRes, lRes] = await Promise.all([
      supabase.from('tarif_plages').select('*').order('ordre'),
      supabase.from('tarif_frais').select('*'),
      supabase.from('tarif_km').select('*').order('ordre'),
      supabase.from('lignes').select('id, code, nom').eq('active', true).order('code'),
    ]);
    if (pRes.data) setPlages(pRes.data);
    if (fRes.data) setFrais(fRes.data);
    if (kRes.data) setTranchesKm(kRes.data);
    if (lRes.data) setLignes(lRes.data);
    setLoading(false);
  }

  // Plages - local state update + debounced save
  const currentPlages = plages.filter(p => {
    if (p.type_jour !== activeTab) return false;
    if (selectedLigne === 'all') return !p.ligne_id;
    return p.ligne_id === selectedLigne;
  });

  function computeCoveredHours(): number {
    let totalMinutes = 0;
    currentPlages.forEach(p => {
      const [h1, m1] = p.heure_debut.split(':').map(Number);
      const [h2, m2] = p.heure_fin.split(':').map(Number);
      let diff = (h2 * 60 + m2) - (h1 * 60 + m1);
      if (diff < 0) diff += 24 * 60; // plage chevauchant minuit (ex. 21:00 -> 05:00)
      totalMinutes += diff;
    });
    return totalMinutes / 60;
  }

  async function addPlage() {
    const lastEnd = currentPlages.length > 0 ? currentPlages[currentPlages.length - 1].heure_fin : '05:00';
    const [h, m] = lastEnd.split(':').map(Number);
    const newEnd = `${(h + 2).toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}`;
    await supabase.from('tarif_plages').insert({
      type_jour: activeTab,
      heure_debut: lastEnd,
      heure_fin: newEnd,
      libelle: '',
      tarif: 0,
      ordre: currentPlages.length,
      ligne_id: selectedLigne === 'all' ? null : selectedLigne,
      user_id: user.id,
    });
    loadAll();
  }

  function updatePlageLocal(id: string, updates: Partial<Plage>) {
    setPlages(prev => prev.map(p => p.id === id ? { ...p, ...updates } : p));
    scheduleUpdate('tarif_plages', id, updates);
  }

  // onBlur : force la sauvegarde immediate (l'ancienne version n'awaitait pas la
  // requete PostgREST -> elle n'etait jamais envoyee et le tarif restait a l'ancien).
  async function savePlageNow(id: string, updates: Partial<Plage>) {
    scheduleUpdate('tarif_plages', id, updates);
    await flushUpdates();
  }

  async function deletePlage(id: string) {
    const { error } = await supabase.from('tarif_plages').delete().eq('id', id);
    if (error) { alert(`Suppression impossible : ${error.message}`); return; }
    setPlages(plages.filter(p => p.id !== id));
  }

  // Frais helpers
  function getFrais(cle: string): Frais | undefined {
    return frais.find(f => f.cle === cle);
  }

  function updateFraisLocal(cle: string, updates: Partial<Frais>) {
    setFrais(prev => prev.map(f => f.cle === cle ? { ...f, ...updates } : f));
    const existing = frais.find(f => f.cle === cle);
    if (existing?.id) {
      scheduleUpdate('tarif_frais', existing.id, updates);
    } else {
      // Premier enregistrement de ce frais : insertion immediate (rare).
      supabase.from('tarif_frais')
        .insert({ cle, valeur: 0, actif: true, periode: '', description: '', user_id: user.id, ...updates })
        .then(({ error }) => { if (error) alert(`Erreur : ${error.message}`); else loadAll(); });
    }
  }

  async function toggleFrais(cle: string, actif: boolean, defaultValeur: number, periode: string) {
    const existing = getFrais(cle);
    if (existing?.id) {
      await supabase.from('tarif_frais').update({ actif }).eq('id', existing.id);
    } else {
      await supabase.from('tarif_frais').insert({ cle, valeur: defaultValeur, actif, periode, description: '', user_id: user.id });
    }
    loadAll();
  }

  // Tranches Km
  async function addTrancheKm() {
    const lastKmA = tranchesKm.length > 0 ? (tranchesKm[tranchesKm.length - 1].km_a || tranchesKm[tranchesKm.length - 1].km_de + 50) : 0;
    await supabase.from('tarif_km').insert({
      km_de: lastKmA,
      km_a: null,
      tarif: 0,
      ordre: tranchesKm.length,
      user_id: user.id,
    });
    loadAll();
  }

  function updateTrancheKmLocal(id: string, updates: Partial<TrancheKm>) {
    setTranchesKm(prev => prev.map(t => t.id === id ? { ...t, ...updates } : t));
    scheduleUpdate('tarif_km', id, updates);
  }

  async function deleteTrancheKm(id: string) {
    const { error } = await supabase.from('tarif_km').delete().eq('id', id);
    if (error) { alert(`Suppression impossible : ${error.message}`); return; }
    setTranchesKm(tranchesKm.filter(t => t.id !== id));
  }

  const forfaitLocation = getFrais('forfait_location');
  const fraisGestion = getFrais('frais_gestion');
  const forfaitLocationActif = forfaitLocation?.actif ?? true;

  if (loading) return <div className="p-8 text-center text-gray-400">Chargement...</div>;

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Tarification</h1>
        <p className="text-gray-500 mt-1">Grilles tarifaires par tranche horaire et frais de gestion</p>
      </div>

      {/* Line selector */}
      <div className="flex items-center gap-2">
        <span className="text-xs font-semibold text-gray-500 uppercase">Ligne :</span>
        <button
          onClick={() => setSelectedLigne('all')}
          className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${selectedLigne === 'all' ? 'bg-gray-900 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}
        >
          Par defaut (toutes)
        </button>
        {lignes.map(l => (
          <button
            key={l.id}
            onClick={() => setSelectedLigne(l.id)}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${selectedLigne === l.id ? 'bg-gray-900 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}
          >
            {l.code}
          </button>
        ))}
      </div>

      {/* PLAGES HORAIRES */}
      <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
        <div className="flex border-b border-gray-100">
          {TABS.map(tab => (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={`flex-1 flex flex-col items-center gap-1 py-4 px-3 text-xs font-medium transition-colors border-b-2 ${activeTab === tab.key ? 'border-amber-500 text-amber-700 bg-amber-50/50' : 'border-transparent text-gray-500 hover:text-gray-700 hover:bg-gray-50'}`}
            >
              {tab.key === 'lun_ven' && <Calendar className="w-4 h-4" />}
              {tab.key === 'samedi' && <span className="w-4 h-4 rounded border border-current flex items-center justify-center text-[8px] font-bold">1</span>}
              {tab.key === 'dimanche' && <span className="w-4 h-4 rounded bg-amber-100 text-amber-600 flex items-center justify-center text-[8px] font-bold">D</span>}
              {tab.key === 'feries' && <Star className="w-4 h-4" />}
              {tab.key === 'astreinte' && <Moon className="w-4 h-4" />}
              <span>{tab.label}</span>
            </button>
          ))}
        </div>

        <div className="p-5">
          <div className="grid grid-cols-[100px_20px_100px_1fr_100px_30px] gap-3 items-center mb-2">
            <span className="text-[10px] text-gray-400 uppercase font-semibold">De</span>
            <span />
            <span className="text-[10px] text-gray-400 uppercase font-semibold">A</span>
            <span className="text-[10px] text-gray-400 uppercase font-semibold">Libelle</span>
            <span className="text-[10px] text-gray-400 uppercase font-semibold text-right">Tarif / trajet</span>
            <span />
          </div>

          {currentPlages.map(plage => (
            <div key={plage.id} className="grid grid-cols-[100px_20px_100px_1fr_100px_30px] gap-3 items-center mb-2">
              <select
                value={plage.heure_debut}
                onChange={(e) => updatePlageLocal(plage.id!, { heure_debut: e.target.value })}
                className="px-2 py-2 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-amber-500 outline-none"
              >
                {HEURES.map(h => <option key={h} value={h}>{h}</option>)}
              </select>
              <span className="text-center text-gray-400">&mdash;</span>
              <select
                value={plage.heure_fin}
                onChange={(e) => updatePlageLocal(plage.id!, { heure_fin: e.target.value })}
                className="px-2 py-2 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-amber-500 outline-none"
              >
                {HEURES.map(h => <option key={h} value={h}>{h}</option>)}
              </select>
              <input
                type="text"
                value={plage.libelle}
                onChange={(e) => updatePlageLocal(plage.id!, { libelle: e.target.value })}
                onBlur={() => savePlageNow(plage.id!, { libelle: plage.libelle })}
                placeholder="ex. Heure de pointe"
                className="px-3 py-2 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-amber-500 outline-none"
              />
              <div className="flex items-center gap-1">
                <input
                  type="number"
                  step="0.01"
                  value={plage.tarif}
                  onChange={(e) => updatePlageLocal(plage.id!, { tarif: parseFloat(e.target.value) || 0 })}
                  onBlur={() => savePlageNow(plage.id!, { tarif: plage.tarif })}
                  className="w-20 px-2 py-2 border border-gray-200 rounded-lg text-sm text-right focus:ring-2 focus:ring-amber-500 outline-none"
                />
                <span className="text-xs text-gray-400">EUR</span>
              </div>
              <button onClick={() => deletePlage(plage.id!)} className="p-1 text-gray-300 hover:text-red-500 transition-colors">
                <X className="w-4 h-4" />
              </button>
            </div>
          ))}

          <div className="flex items-center justify-between mt-4 pt-3 border-t border-gray-50">
            <button onClick={addPlage} className="text-xs text-gray-500 hover:text-amber-600 font-medium border border-dashed border-gray-200 rounded-lg px-3 py-1.5 hover:border-amber-300 transition-colors">
              + Ajouter une plage
            </button>
            <span className="text-xs text-gray-400">{computeCoveredHours().toFixed(0)}h couvertes</span>
          </div>
        </div>
      </div>

      {/* FRAIS DE GESTION */}
      <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
        <div className="px-5 pt-5 pb-2">
          <span className="text-[10px] text-gray-400 uppercase font-semibold tracking-wide">Frais de gestion</span>
        </div>

        {/* Forfait location vehicule */}
        <div className="px-5 py-4 border-b border-gray-50">
          <div className="flex items-start justify-between">
            <div className="flex-1">
              <h3 className="font-semibold text-gray-900">Forfait location vehicule</h3>
              <p className="text-sm text-gray-500 mt-0.5">Montant fixe deduit de la retrocession chauffeur pour la mise a disposition du vehicule</p>
            </div>
            <button
              onClick={() => toggleFrais('forfait_location', !forfaitLocationActif, 180, forfaitLocation?.periode || 'semaine')}
              className={`relative w-11 h-6 rounded-full transition-colors ${forfaitLocationActif ? 'bg-amber-500' : 'bg-gray-200'}`}
            >
              <span className={`absolute top-0.5 w-5 h-5 rounded-full bg-white shadow transition-transform ${forfaitLocationActif ? 'left-[22px]' : 'left-0.5'}`} />
            </button>
          </div>
          {forfaitLocationActif && (
            <div className="flex items-center gap-4 mt-4">
              <div>
                <label className="block text-[10px] text-gray-400 uppercase font-semibold mb-1">Montant forfaitaire</label>
                <div className="flex items-center gap-1">
                  <input
                    type="number"
                    step="0.01"
                    value={forfaitLocation?.valeur ?? 180}
                    onChange={(e) => updateFraisLocal('forfait_location', { valeur: parseFloat(e.target.value) || 0 })}
                    className="w-24 px-3 py-2 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-amber-500 outline-none"
                  />
                  <span className="text-sm text-gray-400">EUR</span>
                </div>
              </div>
              <div>
                <label className="block text-[10px] text-gray-400 uppercase font-semibold mb-1">Periode</label>
                <select
                  value={forfaitLocation?.periode || 'semaine'}
                  onChange={(e) => updateFraisLocal('forfait_location', { periode: e.target.value })}
                  className="px-3 py-2 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-amber-500 outline-none"
                >
                  <option value="semaine">Par semaine</option>
                  <option value="mois">Par mois</option>
                  <option value="jour">Par jour</option>
                </select>
              </div>
              <span className="text-sm text-gray-400 mt-5">
                = {forfaitLocation?.periode === 'mois' ? ((forfaitLocation?.valeur ?? 180) / 30).toFixed(2) : forfaitLocation?.periode === 'jour' ? (forfaitLocation?.valeur ?? 180).toFixed(2) : ((forfaitLocation?.valeur ?? 180) / 7).toFixed(2)} EUR/j
              </span>
            </div>
          )}
        </div>

        {/* Frais de gestion mensuels */}
        <div className="px-5 py-4 border-b border-gray-50">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="font-semibold text-gray-900">Frais de gestion mensuels</h3>
              <p className="text-sm text-gray-500 mt-0.5">Montant fixe mensuel facture au chauffeur pour la gestion administrative et le suivi de l'activite</p>
            </div>
            <div className="flex items-center gap-1">
              <input
                type="number"
                step="0.01"
                value={fraisGestion?.valeur ?? 30}
                onChange={(e) => updateFraisLocal('frais_gestion', { valeur: parseFloat(e.target.value) || 0 })}
                className="w-20 px-2 py-2 border border-gray-200 rounded-lg text-sm text-right focus:ring-2 focus:ring-amber-500 outline-none"
              />
              <span className="text-xs text-gray-400">EUR / mois</span>
            </div>
          </div>
        </div>

        {/* Supplement kilometrique */}
        <div className="px-5 py-4">
          <h3 className="font-semibold text-gray-900">Supplement kilometrique</h3>
          <p className="text-sm text-gray-500 mt-0.5">Cout par km applique selon la tranche de kilometrage journalier du chauffeur</p>

          <div className="mt-4">
            <div className="grid grid-cols-[80px_20px_80px_1fr_100px_30px] gap-3 items-center mb-2">
              <span className="text-[10px] text-gray-400 uppercase font-semibold">De (km)</span>
              <span />
              <span className="text-[10px] text-gray-400 uppercase font-semibold">A (km)</span>
              <span />
              <span className="text-[10px] text-gray-400 uppercase font-semibold text-right">Tarif / km</span>
              <span />
            </div>

            {tranchesKm.map((t) => (
              <div key={t.id} className="grid grid-cols-[80px_20px_80px_1fr_100px_30px] gap-3 items-center mb-2">
                <input
                  type="number"
                  value={t.km_de}
                  onChange={(e) => updateTrancheKmLocal(t.id!, { km_de: parseFloat(e.target.value) || 0 })}
                  className="px-2 py-2 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-amber-500 outline-none"
                />
                <span className="text-center text-gray-400">&rarr;</span>
                <input
                  type="number"
                  value={t.km_a ?? ''}
                  placeholder="\u221E"
                  onChange={(e) => updateTrancheKmLocal(t.id!, { km_a: e.target.value ? parseFloat(e.target.value) : null })}
                  className="px-2 py-2 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-amber-500 outline-none placeholder:text-gray-300"
                />
                <span className="text-xs text-gray-400">
                  {t.km_a ? `(${t.km_a - t.km_de} km)` : 'et plus'}
                </span>
                <div className="flex items-center gap-1">
                  <input
                    type="number"
                    step="0.01"
                    value={t.tarif}
                    onChange={(e) => updateTrancheKmLocal(t.id!, { tarif: parseFloat(e.target.value) || 0 })}
                    className="w-20 px-2 py-2 border border-gray-200 rounded-lg text-sm text-right focus:ring-2 focus:ring-amber-500 outline-none"
                  />
                  <span className="text-xs text-gray-400">EUR/km</span>
                </div>
                <button onClick={() => deleteTrancheKm(t.id!)} className="p-1 text-gray-300 hover:text-red-500 transition-colors">
                  <X className="w-4 h-4" />
                </button>
              </div>
            ))}

            <button onClick={addTrancheKm} className="text-xs text-gray-500 hover:text-amber-600 font-medium border border-dashed border-gray-200 rounded-lg px-3 py-1.5 hover:border-amber-300 transition-colors mt-2">
              + Ajouter une tranche
            </button>
          </div>
        </div>
      </div>

      {/* FORFAIT PAR ASTREINTE REALISEE */}
      <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
        <div className="px-5 py-4">
          <div className="flex items-center gap-2 mb-3">
            <Moon className="w-4 h-4 text-amber-600" />
            <span className="text-[10px] text-gray-500 uppercase font-bold tracking-wide">Forfait par astreinte realisee</span>
          </div>

          <p className="text-sm text-gray-600 mb-4">
            Montant paye au chauffeur pour chaque astreinte realisee (confirmee d'un clic sur l'appli).
            Remplace l'ancien tarif horaire : on ne compte plus les heures mais le nombre d'astreintes du mois.
          </p>

          <div className="flex items-center justify-between">
            <div>
              <h4 className="font-medium text-gray-900">Forfait par astreinte</h4>
              <p className="text-xs text-gray-500">Multiplie par le nombre d'astreintes realisees sur le mois</p>
            </div>
            <div className="flex items-center gap-1">
              <input
                type="number"
                step="0.01"
                value={getFrais('forfait_astreinte')?.valeur ?? 50}
                onChange={(e) => updateFraisLocal('forfait_astreinte', { valeur: parseFloat(e.target.value) || 0, periode: 'astreinte', actif: true })}
                className="w-24 px-2 py-2 border border-gray-200 rounded-lg text-sm text-right focus:ring-2 focus:ring-amber-500 outline-none"
              />
              <span className="text-xs text-gray-400">EUR / astreinte</span>
            </div>
          </div>
        </div>
      </div>

      {/* DEPASSEMENT KILOMETRIQUE */}
      <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
        <div className="px-5 py-4">
          <div className="flex items-center gap-2 mb-3">
            <span className="text-[10px] text-gray-500 uppercase font-bold tracking-wide">Depassement kilometrique mensuel</span>
          </div>

          <p className="text-sm text-gray-600 mb-4">
            Au-dela du seuil mensuel, chaque kilometre supplementaire est deduit de la facture de retrocession du chauffeur.
          </p>

          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <h4 className="font-medium text-gray-900">Seuil kilometrique mensuel</h4>
                <p className="text-xs text-gray-500">Kilometres inclus avant facturation du depassement</p>
              </div>
              <div className="flex items-center gap-1">
                <input
                  type="number"
                  value={getFrais('seuil_km')?.valeur ?? 0}
                  onChange={(e) => updateFraisLocal('seuil_km', { valeur: parseFloat(e.target.value) || 0, periode: 'mois', actif: true })}
                  className="w-24 px-2 py-2 border border-gray-200 rounded-lg text-sm text-right focus:ring-2 focus:ring-amber-500 outline-none"
                />
                <span className="text-xs text-gray-400">km / mois</span>
              </div>
            </div>
            <div className="flex items-center justify-between">
              <div>
                <h4 className="font-medium text-gray-900">Tarif du kilometre de depassement</h4>
                <p className="text-xs text-gray-500">Applique a chaque km au-dela du seuil</p>
              </div>
              <div className="flex items-center gap-1">
                <input
                  type="number"
                  step="0.01"
                  value={getFrais('tarif_km_depassement')?.valeur ?? 0}
                  onChange={(e) => updateFraisLocal('tarif_km_depassement', { valeur: parseFloat(e.target.value) || 0, periode: 'km', actif: true })}
                  className="w-24 px-2 py-2 border border-gray-200 rounded-lg text-sm text-right focus:ring-2 focus:ring-amber-500 outline-none"
                />
                <span className="text-xs text-gray-400">EUR / km</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
