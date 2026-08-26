import { useEffect, useState } from 'react';
import { supabase } from '../../lib/supabase';
import { Building2, Save } from 'lucide-react';
import type { User } from '@supabase/supabase-js';

interface EntreprisePageProps {
  user: User;
}

export function EntreprisePage({ user }: EntreprisePageProps) {
  const [form, setForm] = useState({
    nom: '', adresse: '', telephone: '', email: '', siret: '',
  });
  const [existingId, setExistingId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => { loadEntreprise(); }, []);

  async function loadEntreprise() {
    const { data } = await supabase.from('entreprise').select('*').eq('user_id', user.id).maybeSingle();
    if (data) {
      setForm({ nom: data.nom, adresse: data.adresse, telephone: data.telephone, email: data.email, siret: data.siret });
      setExistingId(data.id);
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    if (existingId) {
      await supabase.from('entreprise').update({ ...form, updated_at: new Date().toISOString() }).eq('id', existingId);
    } else {
      const { data } = await supabase.from('entreprise').insert({ ...form, user_id: user.id }).select('id').maybeSingle();
      if (data) setExistingId(data.id);
    }
    setSaving(false);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Entreprise</h1>
        <p className="text-gray-500 mt-1">Informations de votre societe</p>
      </div>

      <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-6">
        <form onSubmit={handleSubmit} className="space-y-4 max-w-xl">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Nom de l'entreprise</label>
            <input type="text" value={form.nom} onChange={(e) => setForm({ ...form, nom: e.target.value })} className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-amber-500 focus:border-transparent outline-none" placeholder="Taxi Vanille" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Adresse</label>
            <input type="text" value={form.adresse} onChange={(e) => setForm({ ...form, adresse: e.target.value })} className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-amber-500 focus:border-transparent outline-none" />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Telephone</label>
              <input type="text" value={form.telephone} onChange={(e) => setForm({ ...form, telephone: e.target.value })} className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-amber-500 focus:border-transparent outline-none" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
              <input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-amber-500 focus:border-transparent outline-none" />
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">SIRET</label>
            <input type="text" value={form.siret} onChange={(e) => setForm({ ...form, siret: e.target.value })} className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-amber-500 focus:border-transparent outline-none" />
          </div>
          <div className="pt-2">
            <button type="submit" disabled={saving} className="flex items-center gap-2 px-5 py-2.5 bg-amber-600 hover:bg-amber-700 text-white rounded-xl font-medium transition-colors disabled:opacity-50">
              <Save className="w-4 h-4" />
              {saving ? 'Enregistrement...' : saved ? 'Enregistre !' : 'Enregistrer'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
