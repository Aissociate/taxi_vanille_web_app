import { useEffect, useState } from 'react';
import { supabase } from '../../lib/supabase';
import { Users, Save } from 'lucide-react';

export function ParamChauffeursPage() {
  const [chauffeurs, setChauffeurs] = useState<Array<{ id: string; nom: string; prenom: string; statut: string }>>([]);

  useEffect(() => { loadChauffeurs(); }, []);

  async function loadChauffeurs() {
    const { data } = await supabase.from('chauffeurs').select('id, nom, prenom, statut').order('nom');
    if (data) setChauffeurs(data);
  }

  async function toggleStatut(id: string, currentStatut: string) {
    const newStatut = currentStatut === 'actif' ? 'inactif' : 'actif';
    await supabase.from('chauffeurs').update({ statut: newStatut }).eq('id', id);
    loadChauffeurs();
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Parametrage Chauffeurs</h1>
        <p className="text-gray-500 mt-1">Gestion rapide des statuts</p>
      </div>

      {chauffeurs.length === 0 ? (
        <div className="bg-white rounded-xl border border-gray-100 p-12 text-center">
          <Users className="w-12 h-12 text-gray-300 mx-auto mb-3" />
          <p className="text-gray-500">Aucun chauffeur enregistre</p>
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
          <table className="w-full">
            <thead className="bg-gray-50 border-b border-gray-100">
              <tr>
                <th className="px-5 py-3 text-left text-xs font-semibold text-gray-500 uppercase">Chauffeur</th>
                <th className="px-5 py-3 text-left text-xs font-semibold text-gray-500 uppercase">Statut</th>
                <th className="px-5 py-3 text-right text-xs font-semibold text-gray-500 uppercase">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {chauffeurs.map((c) => (
                <tr key={c.id} className="hover:bg-gray-50 transition-colors">
                  <td className="px-5 py-3 text-sm font-medium text-gray-900">{c.prenom} {c.nom}</td>
                  <td className="px-5 py-3">
                    <span className={`px-2.5 py-1 rounded-full text-xs font-medium ${c.statut === 'actif' ? 'bg-emerald-100 text-emerald-700' : 'bg-gray-100 text-gray-500'}`}>
                      {c.statut}
                    </span>
                  </td>
                  <td className="px-5 py-3 text-right">
                    <button onClick={() => toggleStatut(c.id, c.statut)} className="px-3 py-1.5 text-sm bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-lg transition-colors">
                      {c.statut === 'actif' ? 'Desactiver' : 'Activer'}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
