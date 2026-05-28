import { useEffect, useState } from 'react';
import { supabase } from '../../lib/supabase';
import { Bell, Plus, Trash2, X } from 'lucide-react';
import type { User } from '@supabase/supabase-js';

interface Alerte {
  id: string;
  nom: string;
  type: string;
  condition_texte: string;
  active: boolean;
}

interface AlertesPageProps {
  user: User;
}

export function AlertesPage({ user }: AlertesPageProps) {
  const [alertes, setAlertes] = useState<Alerte[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ nom: '', type: 'info', condition_texte: '', active: true });

  useEffect(() => { loadAlertes(); }, []);

  async function loadAlertes() {
    const { data } = await supabase.from('alertes_config').select('*').order('created_at');
    if (data) setAlertes(data);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    await supabase.from('alertes_config').insert({ ...form, user_id: user.id });
    setShowForm(false);
    loadAlertes();
  }

  async function toggleActive(id: string, active: boolean) {
    await supabase.from('alertes_config').update({ active: !active }).eq('id', id);
    loadAlertes();
  }

  async function handleDelete(id: string) {
    if (!confirm('Supprimer cette alerte ?')) return;
    await supabase.from('alertes_config').delete().eq('id', id);
    loadAlertes();
  }

  const typeColors: Record<string, string> = {
    info: 'bg-blue-100 text-blue-700',
    warning: 'bg-amber-100 text-amber-700',
    error: 'bg-red-100 text-red-700',
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Alertes</h1>
          <p className="text-gray-500 mt-1">Configuration des notifications</p>
        </div>
        <button onClick={() => { setForm({ nom: '', type: 'info', condition_texte: '', active: true }); setShowForm(true); }} className="flex items-center gap-2 px-4 py-2.5 bg-amber-600 hover:bg-amber-700 text-white rounded-xl font-medium transition-colors shadow-sm">
          <Plus className="w-4 h-4" /> Ajouter
        </button>
      </div>

      {alertes.length === 0 ? (
        <div className="bg-white rounded-xl border border-gray-100 p-12 text-center">
          <Bell className="w-12 h-12 text-gray-300 mx-auto mb-3" />
          <p className="text-gray-500">Aucune alerte configuree</p>
        </div>
      ) : (
        <div className="grid gap-3">
          {alertes.map((a) => (
            <div key={a.id} className="bg-white rounded-xl border border-gray-100 p-4 shadow-sm">
              <div className="flex items-center gap-4">
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <p className="font-medium text-gray-900">{a.nom}</p>
                    <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${typeColors[a.type] || 'bg-gray-100'}`}>{a.type}</span>
                  </div>
                  <p className="text-sm text-gray-500 mt-0.5">{a.condition_texte}</p>
                </div>
                <button onClick={() => toggleActive(a.id, a.active)} className={`px-3 py-1 rounded-full text-xs font-medium transition-colors ${a.active ? 'bg-emerald-100 text-emerald-700' : 'bg-gray-100 text-gray-500'}`}>
                  {a.active ? 'Active' : 'Inactive'}
                </button>
                <button onClick={() => handleDelete(a.id)} className="p-2 text-gray-400 hover:text-red-600 rounded-lg transition-colors">
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {showForm && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl w-full max-w-md">
            <div className="p-6 border-b border-gray-100 flex items-center justify-between">
              <h2 className="text-lg font-semibold">Nouvelle alerte</h2>
              <button onClick={() => setShowForm(false)} className="text-gray-400 hover:text-gray-600"><X className="w-5 h-5" /></button>
            </div>
            <form onSubmit={handleSubmit} className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Nom</label>
                <input type="text" value={form.nom} onChange={(e) => setForm({ ...form, nom: e.target.value })} className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-amber-500 focus:border-transparent outline-none" required />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Type</label>
                <select value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })} className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-amber-500 focus:border-transparent outline-none">
                  <option value="info">Info</option>
                  <option value="warning">Warning</option>
                  <option value="error">Error</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Condition</label>
                <textarea value={form.condition_texte} onChange={(e) => setForm({ ...form, condition_texte: e.target.value })} rows={3} className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-amber-500 focus:border-transparent outline-none resize-none" />
              </div>
              <div className="flex gap-3 pt-2">
                <button type="button" onClick={() => setShowForm(false)} className="flex-1 px-4 py-2.5 border border-gray-200 text-gray-700 rounded-xl font-medium hover:bg-gray-50 transition-colors">Annuler</button>
                <button type="submit" className="flex-1 px-4 py-2.5 bg-amber-600 hover:bg-amber-700 text-white rounded-xl font-medium transition-colors">Creer</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
