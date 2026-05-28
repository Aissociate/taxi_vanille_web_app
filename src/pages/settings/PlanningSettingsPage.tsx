import { useEffect, useState } from 'react';
import { supabase } from '../../lib/supabase';
import { Plus, X } from 'lucide-react';
import type { User } from '@supabase/supabase-js';

interface PlanningSettingsPageProps {
  user: User;
}

interface JourFerie {
  id: string;
  date: string;
  intitule: string;
  recurrent: boolean;
}

function formatDateFr(dateStr: string): string {
  const d = new Date(dateStr + 'T00:00:00');
  const day = d.getDate();
  const months = ['janv.', 'fevr.', 'mars', 'avr.', 'mai', 'juin', 'juil.', 'aout', 'sept.', 'oct.', 'nov.', 'dec.'];
  return `${day} ${months[d.getMonth()]} ${d.getFullYear()}`;
}

export function PlanningSettingsPage({ user }: PlanningSettingsPageProps) {
  const [jours, setJours] = useState<JourFerie[]>([]);
  const [loading, setLoading] = useState(true);
  const [newDate, setNewDate] = useState('');
  const [newIntitule, setNewIntitule] = useState('');
  const [newType, setNewType] = useState<'annuel' | 'unique'>('unique');

  useEffect(() => { loadJours(); }, []);

  async function loadJours() {
    setLoading(true);
    const { data } = await supabase
      .from('jours_feries')
      .select('*')
      .order('date');
    if (data) setJours(data);
    setLoading(false);
  }

  async function addJour() {
    if (!newDate || !newIntitule.trim()) return;
    await supabase.from('jours_feries').insert({
      date: newDate,
      intitule: newIntitule.trim(),
      recurrent: newType === 'annuel',
      user_id: user.id,
    });
    setNewDate('');
    setNewIntitule('');
    setNewType('unique');
    loadJours();
  }

  async function deleteJour(id: string) {
    await supabase.from('jours_feries').delete().eq('id', id);
    setJours(jours.filter(j => j.id !== id));
  }

  if (loading) return <div className="p-8 text-center text-gray-400">Chargement...</div>;

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Planning</h1>
        <p className="text-gray-500 mt-1">Configuration du planning, jours feries et periodes speciales</p>
      </div>

      {/* JOURS FERIES */}
      <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
        <div className="px-5 pt-5 pb-3 flex items-center justify-between">
          <span className="text-[10px] text-gray-400 uppercase font-semibold tracking-wide">Jours feries specifiques</span>
          <span className="text-xs text-amber-600 font-medium">{jours.length} configures</span>
        </div>

        {/* Table header */}
        <div className="px-5">
          <div className="grid grid-cols-[140px_1fr_120px_30px] gap-4 items-center border-b border-gray-100 pb-2">
            <span className="text-[10px] text-gray-400 uppercase font-semibold">Date</span>
            <span className="text-[10px] text-gray-400 uppercase font-semibold">Intitule</span>
            <span className="text-[10px] text-gray-400 uppercase font-semibold text-right">Recurrent</span>
            <span />
          </div>
        </div>

        {/* Rows */}
        <div className="px-5 divide-y divide-dashed divide-gray-100">
          {jours.map(jour => (
            <div key={jour.id} className="grid grid-cols-[140px_1fr_120px_30px] gap-4 items-center py-3">
              <span className="text-sm font-mono text-teal-700">{formatDateFr(jour.date)}</span>
              <span className="text-sm text-gray-900">{jour.intitule}</span>
              <span className="text-xs text-right text-gray-400">
                {jour.recurrent ? (
                  <span className="inline-flex items-center gap-1">
                    <span className="text-teal-600">↻</span> annuel
                  </span>
                ) : (
                  'unique'
                )}
              </span>
              <button onClick={() => deleteJour(jour.id)} className="p-0.5 text-gray-300 hover:text-red-500 transition-colors">
                <X className="w-4 h-4" />
              </button>
            </div>
          ))}
          {jours.length === 0 && (
            <div className="py-8 text-center text-gray-400 text-sm">Aucun jour ferie configure</div>
          )}
        </div>

        {/* Add form */}
        <div className="px-5 py-4 border-t border-gray-100 bg-gray-50/50">
          <div className="grid grid-cols-[140px_1fr_120px_auto] gap-4 items-end">
            <div>
              <label className="block text-[10px] text-gray-400 uppercase font-semibold mb-1">Date</label>
              <input
                type="date"
                value={newDate}
                onChange={(e) => setNewDate(e.target.value)}
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-amber-500 outline-none bg-white"
              />
            </div>
            <div>
              <label className="block text-[10px] text-gray-400 uppercase font-semibold mb-1">Intitule</label>
              <input
                type="text"
                value={newIntitule}
                onChange={(e) => setNewIntitule(e.target.value)}
                placeholder="ex. Aid el-Fitr"
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-amber-500 outline-none bg-white"
                onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addJour(); } }}
              />
            </div>
            <div>
              <label className="block text-[10px] text-gray-400 uppercase font-semibold mb-1">Type</label>
              <select
                value={newType}
                onChange={(e) => setNewType(e.target.value as 'annuel' | 'unique')}
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-amber-500 outline-none bg-white"
              >
                <option value="unique">Unique</option>
                <option value="annuel">Annuel</option>
              </select>
            </div>
            <button
              onClick={addJour}
              disabled={!newDate || !newIntitule.trim()}
              className="px-4 py-2 bg-amber-600 hover:bg-amber-700 disabled:bg-gray-200 disabled:text-gray-400 text-white rounded-lg text-sm font-medium transition-colors flex items-center gap-1.5"
            >
              <Plus className="w-3.5 h-3.5" /> Ajouter
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
