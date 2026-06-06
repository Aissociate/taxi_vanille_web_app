import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { Plus, Search } from 'lucide-react';
import type { User } from '@supabase/supabase-js';
import { ChauffeurDetail } from '../components/chauffeurs/ChauffeurDetail';
import { ChauffeurForm } from '../components/chauffeurs/ChauffeurForm';

export interface Chauffeur {
  id: string;
  code: string;
  nom: string;
  prenom: string;
  telephone: string;
  email: string;
  numero_permis: string;
  date_embauche: string;
  statut: string;
  notes: string;
  adresse: string;
  facturation_type: string;
  nif_siret: string;
  licence_transport: string;
  carte_conducteur_numero: string;
  carte_conducteur_validite: string;
  vehicule_immatriculation: string;
  vehicule_marque: string;
  vehicule_places: number;
  n_adherent: string;
  secteur_activite: string;
  commentaires: string;
  telephone2: string;
  carte_identite_numero: string;
  carte_sejour_numero: string;
  vehicule_date_1ere_immat: string;
  vehicule_carburant: string;
  vehicule_date_controle_technique: string;
  vehicule_assureur: string;
  ligne_id: string | null;
  pin: string;
  is_coordinateur: boolean;
  pin_android: string | null;
}

interface ChauffeursPageProps {
  user: User;
  onNavigateToPage?: (page: string) => void;
}

export function ChauffeursPage({ user, onNavigateToPage }: ChauffeursPageProps) {
  const [chauffeurs, setChauffeurs] = useState<Chauffeur[]>([]);
  const [search, setSearch] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [editingChauffeur, setEditingChauffeur] = useState<Chauffeur | null>(null);
  const [lignes, setLignes] = useState<Array<{ id: string; nom: string }>>([]);

  useEffect(() => {
    loadChauffeurs();
    loadLignes();
  }, []);

  async function loadChauffeurs() {
    const { data } = await supabase.from('chauffeurs').select('*').order('code, nom');
    if (data) {
      setChauffeurs(data);
      if (!selectedId && data.length > 0) setSelectedId(data[0].id);
    }
  }

  async function loadLignes() {
    const { data } = await supabase.from('lignes').select('id, nom');
    if (data) setLignes(data);
  }

  function openCreate() {
    setEditingChauffeur(null);
    setShowForm(true);
  }

  function openEdit(c: Chauffeur) {
    setEditingChauffeur(c);
    setShowForm(true);
  }

  async function handleDelete(id: string) {
    if (!confirm('Supprimer ce chauffeur ?')) return;
    await supabase.from('chauffeurs').delete().eq('id', id);
    if (selectedId === id) setSelectedId(null);
    loadChauffeurs();
  }

  async function handleToggleStatus(id: string, currentStatut: string) {
    const newStatut = currentStatut === 'actif' ? 'inactif' : 'actif';
    await supabase.from('chauffeurs').update({ statut: newStatut }).eq('id', id);
    loadChauffeurs();
  }

  async function handleSave(data: Partial<Chauffeur>) {
    if (editingChauffeur) {
      await supabase.from('chauffeurs').update({ ...data, updated_at: new Date().toISOString() }).eq('id', editingChauffeur.id);
    } else {
      await supabase.from('chauffeurs').insert({ ...data, user_id: user.id });
    }
    setShowForm(false);
    loadChauffeurs();
  }

  const filtered = chauffeurs.filter((c) =>
    `${c.nom} ${c.prenom} ${c.code} ${c.telephone}`.toLowerCase().includes(search.toLowerCase())
  );

  const selectedChauffeur = chauffeurs.find((c) => c.id === selectedId) || null;
  const selectedLigne = selectedChauffeur?.ligne_id ? lignes.find(l => l.id === selectedChauffeur.ligne_id) : null;

  return (
    <div className="flex h-[calc(100vh-4rem)] -m-8">
      {/* Left Panel - List */}
      <div className="w-64 border-r border-gray-200 bg-white flex flex-col flex-shrink-0">
        <div className="p-4 border-b border-gray-100">
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
              Chauffeurs · {chauffeurs.length}
            </span>
            <button
              onClick={openCreate}
              className="px-3 py-1.5 bg-amber-600 hover:bg-amber-700 text-white text-xs font-medium rounded-lg transition-colors"
            >
              + Ajouter
            </button>
          </div>
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400" />
            <input
              type="text"
              placeholder="Rechercher..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-8 pr-3 py-2 text-sm bg-gray-50 border border-gray-200 rounded-lg focus:ring-2 focus:ring-amber-500 focus:border-transparent outline-none"
            />
          </div>
        </div>

        <div className="flex-1 overflow-y-auto">
          {filtered.map((c) => (
            <button
              key={c.id}
              onClick={() => setSelectedId(c.id)}
              className={`w-full text-left px-4 py-3 border-b border-gray-50 transition-all ${
                selectedId === c.id
                  ? 'bg-amber-50 border-l-[3px] border-l-amber-600'
                  : 'hover:bg-gray-50 border-l-[3px] border-l-transparent'
              }`}
            >
              <div className="flex items-center gap-2">
                <span className={`w-2 h-2 rounded-full flex-shrink-0 ${c.statut === 'actif' ? 'bg-emerald-500' : 'bg-gray-300'}`} />
                <div className="flex items-center gap-1.5">
                  {c.code && (
                    <span className="inline-flex items-center justify-center w-6 h-6 rounded bg-amber-100 text-amber-700 text-[10px] font-bold">
                      {c.code}
                    </span>
                  )}
                  <span className="text-sm font-medium text-gray-900">{c.nom} {c.prenom}</span>
                </div>
              </div>
              <div className="ml-4 mt-0.5">
                {c.telephone && <p className="text-xs text-gray-500">{c.telephone}</p>}
              </div>
            </button>
          ))}
          {filtered.length === 0 && (
            <div className="p-6 text-center text-sm text-gray-400">Aucun resultat</div>
          )}
        </div>
      </div>

      {/* Right Panel - Detail */}
      <div className="flex-1 overflow-y-auto bg-gray-50">
        {selectedChauffeur ? (
          <ChauffeurDetail
            chauffeur={selectedChauffeur}
            ligneName={selectedLigne?.nom}
            user={user}
            onEdit={() => openEdit(selectedChauffeur)}
            onDelete={() => handleDelete(selectedChauffeur.id)}
            onToggleStatus={() => handleToggleStatus(selectedChauffeur.id, selectedChauffeur.statut)}
            onNavigateToPlanning={(chauffeurId) => {
              sessionStorage.setItem('planning_chauffeur_filter', chauffeurId);
              onNavigateToPage?.('planning');
            }}
          />
        ) : (
          <div className="flex items-center justify-center h-full text-gray-400">
            <p>Selectionnez un chauffeur</p>
          </div>
        )}
      </div>

      {/* Modal */}
      {showForm && (
        <ChauffeurForm
          chauffeur={editingChauffeur}
          lignes={lignes}
          onSave={handleSave}
          onClose={() => setShowForm(false)}
        />
      )}
    </div>
  );
}
