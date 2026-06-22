import { useEffect, useState } from 'react';
import { supabase } from '../../lib/supabase';
import { MapPin, Plus, Settings, Trash2, X, Pencil, Check } from 'lucide-react';
import type { User } from '@supabase/supabase-js';

interface Ligne {
  id: string;
  code: string;
  nom: string;
  depart: string;
  arrivee: string;
  couleur: string;
  sens_am: string;
  sens_pm: string;
  nb_arrets: number;
  active: boolean;
}

interface Arret {
  id?: string;
  nom: string;
  latitude: number;
  longitude: number;
  ordre: number;
}

interface LignesPageProps {
  user: User;
}

const COLORS = [
  '#1a1a1a', '#e65100', '#1565c0', '#2e7d32', '#c62828', '#4527a0', '#ef6c00',
];

export function LignesPage({ user }: LignesPageProps) {
  const [lignes, setLignes] = useState<Ligne[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [selectedLigne, setSelectedLigne] = useState<Ligne | null>(null);
  const [selectedArrets, setSelectedArrets] = useState<Arret[]>([]);
  const [form, setForm] = useState({
    code: '',
    couleur: '#1a1a1a',
    nom: '',
    sens_am: '',
    sens_pm: '',
    nb_arrets: 0,
  });
  const [arrets, setArrets] = useState<Arret[]>([]);
  const [newArret, setNewArret] = useState({ nom: '', latitude: -12.788, longitude: 45.227 });
  const [editingArretId, setEditingArretId] = useState<string | null>(null);
  const [editingArretData, setEditingArretData] = useState<{ latitude: number; longitude: number }>({ latitude: 0, longitude: 0 });
  const [editingLigneId, setEditingLigneId] = useState<string | null>(null);
  const [originalArretIds, setOriginalArretIds] = useState<string[]>([]);

  async function saveArretGps(arretId: string) {
    await supabase.from('ligne_arrets').update({ latitude: editingArretData.latitude, longitude: editingArretData.longitude }).eq('id', arretId);
    setEditingArretId(null);
    if (selectedLigne) selectLigne(selectedLigne);
  }

  useEffect(() => { loadLignes(); }, []);

  async function loadLignes() {
    const { data } = await supabase.from('lignes').select('*').order('code, nom');
    if (data) setLignes(data);
  }

  async function selectLigne(ligne: Ligne) {
    setSelectedLigne(ligne);
    const { data } = await supabase.from('ligne_arrets').select('*').eq('ligne_id', ligne.id).order('ordre', { ascending: true });
    setSelectedArrets(data || []);
  }

  function openCreate() {
    setForm({ code: '', couleur: '#1a1a1a', nom: '', sens_am: '', sens_pm: '', nb_arrets: 0 });
    setArrets([]);
    setEditingLigneId(null);
    setOriginalArretIds([]);
    setShowForm(true);
  }

  async function openEditLigne(ligne: Ligne) {
    setForm({
      code: ligne.code,
      couleur: ligne.couleur || '#1a1a1a',
      nom: ligne.nom,
      sens_am: ligne.sens_am || '',
      sens_pm: ligne.sens_pm || '',
      nb_arrets: ligne.nb_arrets,
    });
    const { data } = await supabase.from('ligne_arrets').select('*').eq('ligne_id', ligne.id).order('ordre', { ascending: true });
    const loaded = (data || []) as Arret[];
    setArrets(loaded);
    setOriginalArretIds(loaded.map(a => a.id).filter(Boolean) as string[]);
    setEditingLigneId(ligne.id);
    setShowForm(true);
  }

  function addArret() {
    if (!newArret.nom) return;
    setArrets([...arrets, { ...newArret, ordre: arrets.length + 1 }]);
    setNewArret({ nom: '', latitude: -12.788, longitude: 45.227 });
  }

  function removeArret(index: number) {
    setArrets(arrets.filter((_, i) => i !== index));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const depart = form.sens_am.replace('→ ', '').trim();
    const arrivee = form.sens_pm.replace('→ ', '').trim();

    // --- Mode EDITION : mettre a jour la ligne et synchroniser ses arrets ---
    if (editingLigneId) {
      await supabase.from('lignes').update({
        code: form.code,
        nom: form.nom || `${depart} ↔ ${arrivee}`,
        depart,
        arrivee,
        couleur: form.couleur,
        sens_am: form.sens_am,
        sens_pm: form.sens_pm,
        nb_arrets: arrets.length,
      }).eq('id', editingLigneId);

      // Arrets retires (presents au chargement mais plus dans la liste)
      const currentIds = arrets.map(a => a.id).filter(Boolean) as string[];
      const removed = originalArretIds.filter(id => !currentIds.includes(id));
      if (removed.length > 0) {
        await supabase.from('arret_executions').delete().in('arret_id', removed);
        await supabase.from('ligne_arrets').delete().in('id', removed);
      }
      // Mise a jour des arrets conserves + insertion des nouveaux (ordre = position)
      for (let i = 0; i < arrets.length; i++) {
        const a = arrets[i];
        if (a.id) {
          await supabase.from('ligne_arrets').update({ nom: a.nom, latitude: a.latitude, longitude: a.longitude, ordre: i + 1 }).eq('id', a.id);
        } else {
          await supabase.from('ligne_arrets').insert({ ligne_id: editingLigneId, nom: a.nom, latitude: a.latitude, longitude: a.longitude, ordre: i + 1, user_id: user.id });
        }
      }
      setShowForm(false);
      const editedId = editingLigneId;
      setEditingLigneId(null);
      loadLignes();
      if (selectedLigne?.id === editedId) selectLigne({ ...selectedLigne, nb_arrets: arrets.length });
      return;
    }

    // --- Mode CREATION ---
    const { data: newLigne } = await supabase.from('lignes').insert({
      code: form.code,
      nom: form.nom || `${depart} ↔ ${arrivee}`,
      depart,
      arrivee,
      couleur: form.couleur,
      sens_am: form.sens_am,
      sens_pm: form.sens_pm,
      nb_arrets: arrets.length,
      active: true,
      user_id: user.id,
    }).select('id').maybeSingle();

    if (newLigne && arrets.length > 0) {
      const arretRows = arrets.map((a, i) => ({
        ligne_id: newLigne.id,
        nom: a.nom,
        latitude: a.latitude,
        longitude: a.longitude,
        ordre: i + 1,
        user_id: user.id,
      }));
      await supabase.from('ligne_arrets').insert(arretRows);
    }

    setShowForm(false);
    loadLignes();
  }

  async function handleDelete(id: string) {
    if (!confirm('Supprimer cette ligne et toutes ses donnees associees (arrets, tarifs, astreintes) ? Les chauffeurs seront detaches. Cette action est irreversible.')) return;
    const { data: arretIds } = await supabase.from('ligne_arrets').select('id').eq('ligne_id', id);
    if (arretIds && arretIds.length > 0) {
      const ids = arretIds.map(a => a.id);
      await supabase.from('arret_executions').delete().in('arret_id', ids);
    }
    await supabase.from('ligne_arrets').delete().eq('ligne_id', id);
    await supabase.from('tarifs').delete().eq('ligne_id', id);
    await supabase.from('astreintes').delete().eq('ligne_id', id);
    await supabase.from('data_report_client_consolidated').delete().eq('ligne_id', id);
    await supabase.from('chauffeurs').update({ ligne_id: null }).eq('ligne_id', id);
    await supabase.from('courses').update({ ligne_id: null }).eq('ligne_id', id);
    const { error } = await supabase.from('lignes').delete().eq('id', id);
    if (error) {
      alert('Erreur lors de la suppression : ' + error.message);
    }
    loadLignes();
  }

  async function handleToggleActive(id: string, active: boolean) {
    await supabase.from('lignes').update({ active: !active }).eq('id', id);
    loadLignes();
  }

  const activeLignes = lignes.filter(l => l.active);
  const inactiveLignes = lignes.filter(l => !l.active);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Lignes & Routes</h1>
          <p className="text-gray-500 mt-1">Configuration des itineraires</p>
        </div>
      </div>

      {/* Active Lines */}
      <div className="bg-white rounded-xl border border-gray-100 shadow-sm">
        <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
          <span className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
            Lignes actives · {activeLignes.length}
          </span>
          <button onClick={openCreate} className="px-4 py-2 bg-amber-600 hover:bg-amber-700 text-white text-sm font-medium rounded-lg transition-colors">
            + Nouvelle ligne
          </button>
        </div>

        {activeLignes.length === 0 && inactiveLignes.length === 0 ? (
          <div className="p-12 text-center">
            <MapPin className="w-12 h-12 text-gray-300 mx-auto mb-3" />
            <p className="text-gray-500">Aucune ligne configuree</p>
          </div>
        ) : (
          <div className="divide-y divide-gray-50">
            {activeLignes.map((ligne) => (
              <div key={ligne.id} onClick={() => selectLigne(ligne)} className={`px-5 py-4 flex items-center gap-4 hover:bg-gray-50 transition-colors cursor-pointer ${selectedLigne?.id === ligne.id ? 'bg-amber-50 border-l-[3px] border-l-amber-600' : ''}`}>
                <div
                  className="w-11 h-8 rounded border-2 flex items-center justify-center text-xs font-bold text-white"
                  style={{ borderColor: ligne.couleur, backgroundColor: ligne.couleur === '#1a1a1a' ? 'transparent' : 'transparent', color: ligne.couleur }}
                >
                  {ligne.code || '?'}
                </div>
                <div className="flex-1">
                  <p className="font-semibold text-gray-900">
                    {ligne.depart} ↔ {ligne.arrivee}
                  </p>
                  <p className="text-xs text-gray-500 mt-0.5">
                    · {ligne.sens_am || ligne.depart} · {ligne.sens_pm || ligne.arrivee}
                  </p>
                </div>
                <span className="text-sm text-gray-500">{ligne.nb_arrets} arrets</span>
                <span className="flex items-center gap-1.5 text-sm text-emerald-600">
                  <span className="w-2 h-2 bg-emerald-500 rounded-full" />
                  Active
                </span>
                <button onClick={(e) => { e.stopPropagation(); openEditLigne(ligne); }} className="px-3 py-1.5 text-xs font-medium border border-gray-200 text-gray-700 rounded-lg hover:bg-amber-50 hover:border-amber-300 transition-colors flex items-center gap-1">
                  <Pencil className="w-3.5 h-3.5" /> Editer
                </button>
                <button onClick={(e) => { e.stopPropagation(); handleToggleActive(ligne.id, ligne.active); }} className="px-3 py-1.5 text-xs font-medium border border-gray-200 text-gray-700 rounded-lg hover:bg-gray-100 transition-colors">
                  Desactiver
                </button>
                <button onClick={(e) => { e.stopPropagation(); handleDelete(ligne.id); }} className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors" title="Supprimer">
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Inactive lines */}
      {inactiveLignes.length > 0 && (
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm">
          <div className="px-5 py-4 border-b border-gray-100">
            <span className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
              Lignes inactives · {inactiveLignes.length}
            </span>
          </div>
          <div className="divide-y divide-gray-50">
            {inactiveLignes.map((ligne) => (
              <div key={ligne.id} className="px-5 py-4 flex items-center gap-4 hover:bg-gray-50 transition-colors opacity-60">
                <div
                  className="w-11 h-8 rounded border-2 flex items-center justify-center text-xs font-bold"
                  style={{ borderColor: ligne.couleur, color: ligne.couleur }}
                >
                  {ligne.code || '?'}
                </div>
                <div className="flex-1">
                  <p className="font-semibold text-gray-900">{ligne.depart} ↔ {ligne.arrivee}</p>
                </div>
                <span className="text-sm text-gray-500">{ligne.nb_arrets} arrets</span>
                <span className="flex items-center gap-1.5 text-sm text-gray-400">
                  <span className="w-2 h-2 bg-gray-300 rounded-full" />
                  Inactive
                </span>
                <button onClick={() => openEditLigne(ligne)} className="px-3 py-1.5 text-xs font-medium border border-gray-200 text-gray-700 rounded-lg hover:bg-amber-50 hover:border-amber-300 transition-colors flex items-center gap-1">
                  <Pencil className="w-3.5 h-3.5" /> Editer
                </button>
                <button onClick={() => handleToggleActive(ligne.id, ligne.active)} className="px-3 py-1.5 text-xs font-medium border border-gray-200 text-gray-700 rounded-lg hover:bg-gray-100 transition-colors">
                  Activer
                </button>
                <button onClick={() => handleDelete(ligne.id)} className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors" title="Supprimer">
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Detail Panel */}
      {selectedLigne && (
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm">
          <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div
                className="w-11 h-8 rounded border-2 flex items-center justify-center text-xs font-bold"
                style={{ borderColor: selectedLigne.couleur, color: selectedLigne.couleur }}
              >
                {selectedLigne.code || '?'}
              </div>
              <div>
                <h3 className="font-semibold text-gray-900">{selectedLigne.nom || `${selectedLigne.depart} ↔ ${selectedLigne.arrivee}`}</h3>
                <p className="text-xs text-gray-500">AM: {selectedLigne.sens_am} · PM: {selectedLigne.sens_pm}</p>
              </div>
            </div>
            <button onClick={() => setSelectedLigne(null)} className="text-gray-400 hover:text-gray-600 p-1">
              <X className="w-5 h-5" />
            </button>
          </div>
          <div className="p-5">
            <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">
              Arrets ({selectedArrets.length})
            </h4>
            {selectedArrets.length === 0 ? (
              <p className="text-sm text-gray-400 text-center py-4">Aucun arret configure pour cette ligne</p>
            ) : (
              <div className="space-y-2">
                {selectedArrets.map((a, i) => (
                  <div key={a.id || i} className="flex items-center gap-3 px-3 py-2.5 bg-gray-50 rounded-lg">
                    <span className="w-6 h-6 rounded-full bg-amber-100 text-amber-700 text-xs font-bold flex items-center justify-center flex-shrink-0">{a.ordre}</span>
                    <MapPin className="w-3.5 h-3.5 text-gray-400 flex-shrink-0" />
                    <span className="text-sm font-medium text-gray-900 flex-1">{a.nom}</span>
                    {editingArretId === a.id ? (
                      <>
                        <input type="number" step="0.0001" value={editingArretData.latitude} onChange={(e) => setEditingArretData({ ...editingArretData, latitude: parseFloat(e.target.value) || 0 })} className="w-24 px-2 py-1 text-xs border border-gray-300 rounded" />
                        <input type="number" step="0.0001" value={editingArretData.longitude} onChange={(e) => setEditingArretData({ ...editingArretData, longitude: parseFloat(e.target.value) || 0 })} className="w-24 px-2 py-1 text-xs border border-gray-300 rounded" />
                        <button type="button" onClick={() => saveArretGps(a.id!)} className="p-1 text-green-600 hover:bg-green-50 rounded"><Check className="w-4 h-4" /></button>
                        <button type="button" onClick={() => setEditingArretId(null)} className="p-1 text-gray-400 hover:bg-gray-100 rounded"><X className="w-4 h-4" /></button>
                      </>
                    ) : (
                      <>
                        <span className="text-xs text-gray-500 font-mono">{a.latitude.toFixed(4)}, {a.longitude.toFixed(4)}</span>
                        <button type="button" onClick={() => { setEditingArretId(a.id!); setEditingArretData({ latitude: a.latitude, longitude: a.longitude }); }} className="p-1 text-gray-400 hover:text-amber-600 hover:bg-amber-50 rounded" title="Modifier GPS"><Pencil className="w-3.5 h-3.5" /></button>
                      </>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Create Modal */}
      {showForm && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl w-full max-w-xl max-h-[90vh] overflow-y-auto shadow-2xl">
            <div className="p-6 border-b border-gray-100 flex items-center justify-between">
              <div>
                <p className="text-xs text-gray-500 uppercase tracking-wide">Parametrage · Lignes & Routes</p>
                <h2 className="text-lg font-bold text-gray-900 mt-0.5">{editingLigneId ? 'Modifier la ligne' : 'Nouvelle ligne'}</h2>
              </div>
              <button onClick={() => { setShowForm(false); setEditingLigneId(null); }} className="text-gray-400 hover:text-gray-600 p-1">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSubmit} className="p-6 space-y-5">
              {/* Code + Couleur */}
              <div className="flex items-start gap-6">
                <div className="flex-shrink-0">
                  <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">Code *</label>
                  <input
                    type="text"
                    value={form.code}
                    onChange={(e) => setForm({ ...form, code: e.target.value })}
                    placeholder="ex. L5"
                    className="w-24 px-3 py-2.5 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-amber-500 focus:border-transparent outline-none"
                    required
                  />
                </div>
                <div className="flex-1">
                  <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">Couleur</label>
                  <div className="flex items-center gap-3">
                    <div className="flex gap-1.5">
                      {COLORS.map((c) => (
                        <button
                          key={c}
                          type="button"
                          onClick={() => setForm({ ...form, couleur: c })}
                          className={`w-7 h-7 rounded-full transition-all ${form.couleur === c ? 'ring-2 ring-offset-2 ring-amber-500 scale-110' : 'hover:scale-110'}`}
                          style={{ backgroundColor: c }}
                        />
                      ))}
                    </div>
                    <span className="text-xs text-gray-400 ml-2">Apercu →</span>
                    <span
                      className="inline-flex items-center justify-center w-9 h-7 rounded border-2 text-[10px] font-bold"
                      style={{ borderColor: form.couleur, color: form.couleur }}
                    >
                      {form.code || 'XX'}
                    </span>
                  </div>
                </div>
              </div>

              {/* Itineraire */}
              <div>
                <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">Itineraire *</label>
                <input
                  type="text"
                  value={form.nom}
                  onChange={(e) => setForm({ ...form, nom: e.target.value })}
                  placeholder="ex. Boueni ↔ Mamoudzou"
                  className="w-full px-3 py-2.5 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-amber-500 focus:border-transparent outline-none"
                  required
                />
              </div>

              {/* Sens AM / PM */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">Sens AM *</label>
                  <input
                    type="text"
                    value={form.sens_am}
                    onChange={(e) => setForm({ ...form, sens_am: e.target.value })}
                    placeholder="ex. → Mamoudzou"
                    className="w-full px-3 py-2.5 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-amber-500 focus:border-transparent outline-none"
                    required
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">Sens PM *</label>
                  <input
                    type="text"
                    value={form.sens_pm}
                    onChange={(e) => setForm({ ...form, sens_pm: e.target.value })}
                    placeholder="ex. → Boueni"
                    className="w-full px-3 py-2.5 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-amber-500 focus:border-transparent outline-none"
                    required
                  />
                </div>
              </div>

              {/* Nombre d'arrets (auto) */}
              <div>
                <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">Nombre d'arrets</label>
                <div className="flex items-center gap-2">
                  <input
                    type="number"
                    value={arrets.length}
                    readOnly
                    className="w-20 px-3 py-2.5 border border-gray-200 rounded-lg text-sm bg-gray-50 text-gray-500"
                  />
                  <span className="text-sm text-gray-500">arrets</span>
                </div>
              </div>

              {/* Points GPS */}
              <div className="border-t border-gray-100 pt-5">
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Points GPS des arrets</label>
                    <span className="text-[10px] text-gray-400">· Ordre AM →</span>
                  </div>
                  <span className="text-xs text-gray-500">{arrets.length} arrets</span>
                </div>

                {/* Existing arrets list */}
                {arrets.length > 0 && (
                  <div className="space-y-2 mb-3">
                    {arrets.map((a, i) => (
                      <div key={i} className="flex items-center gap-2 px-3 py-2 bg-gray-50 rounded-lg">
                        <span className="text-xs font-bold text-gray-400 w-5">{i + 1}.</span>
                        <span className="text-sm text-gray-900 flex-1">{a.nom}</span>
                        <span className="text-xs text-gray-500">{a.latitude}, {a.longitude}</span>
                        <button type="button" onClick={() => removeArret(i)} className="text-gray-400 hover:text-red-500 p-0.5">
                          <X className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}

                {/* Add arret row */}
                <div className="grid grid-cols-[1fr_100px_100px_auto] gap-2 items-end">
                  <div>
                    <label className="block text-[10px] text-gray-400 uppercase mb-1">Nom de l'arret</label>
                    <input
                      type="text"
                      value={newArret.nom}
                      onChange={(e) => setNewArret({ ...newArret, nom: e.target.value })}
                      placeholder="ex. Mamoudzou Centre"
                      className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-amber-500 focus:border-transparent outline-none"
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] text-gray-400 uppercase mb-1">Latitude</label>
                    <input
                      type="number"
                      step="0.0001"
                      value={newArret.latitude}
                      onChange={(e) => setNewArret({ ...newArret, latitude: parseFloat(e.target.value) || 0 })}
                      className="w-full px-2 py-2 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-amber-500 focus:border-transparent outline-none"
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] text-gray-400 uppercase mb-1">Longitude</label>
                    <input
                      type="number"
                      step="0.0001"
                      value={newArret.longitude}
                      onChange={(e) => setNewArret({ ...newArret, longitude: parseFloat(e.target.value) || 0 })}
                      className="w-full px-2 py-2 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-amber-500 focus:border-transparent outline-none"
                    />
                  </div>
                  <button
                    type="button"
                    onClick={addArret}
                    className="px-3 py-2 bg-amber-600 hover:bg-amber-700 text-white text-sm font-medium rounded-lg transition-colors"
                  >
                    + Ajouter
                  </button>
                </div>
                <p className="text-[10px] text-gray-400 mt-1.5">Coordonnees decimales WGS84 · ex. -12.7880 / 45.2270 pour Mamoudzou</p>
              </div>

              {/* Buttons */}
              <div className="flex gap-3 pt-4 border-t border-gray-100">
                <button type="button" onClick={() => { setShowForm(false); setEditingLigneId(null); }} className="flex-1 px-4 py-2.5 border border-gray-200 text-gray-700 rounded-xl font-medium hover:bg-gray-50 transition-colors text-sm">
                  Annuler
                </button>
                <button type="submit" className="flex-1 px-4 py-2.5 bg-amber-600 hover:bg-amber-700 text-white rounded-xl font-medium transition-colors text-sm">
                  {editingLigneId ? 'Enregistrer' : 'Creer la ligne →'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
