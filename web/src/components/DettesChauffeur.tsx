// Dettes du chauffeur remboursees par echeances mensuelles.
//
// Demande DAF (facture C4 de juillet) : une dette moteur de 1 500 EUR est
// retenue 500 EUR sur les factures de mai, juillet et aout. Il faut donc poser
// l'echeancier une fois, et le voir s'imputer tout seul le bon mois — ce que la
// saisie "remboursement d'avance" (ponctuelle, a retaper chaque mois) ne fait pas.

import { useCallback, useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { Plus, Trash2, ChevronDown, ChevronUp, Wallet } from 'lucide-react';

export interface DetteEcheance {
  id: string;
  dette_id: string;
  mois: string;          // YYYY-MM-DD (1er du mois)
  montant: number;
  statut: string;        // prevue | appliquee | annulee
  facture_id: string | null;
}

export interface Dette {
  id: string;
  chauffeur_id: string;
  libelle: string;
  montant_total: number;
  date_creation: string;
  statut: string;
  echeances: DetteEcheance[];
}

const MOIS_FR = ['Janvier', 'Fevrier', 'Mars', 'Avril', 'Mai', 'Juin', 'Juillet', 'Aout', 'Septembre', 'Octobre', 'Novembre', 'Decembre'];
const eur = (n: number) => `${(Math.round(n * 100) / 100).toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} EUR`;
const moisLabel = (d: string) => {
  const [y, m] = d.split('-').map(Number);
  return `${MOIS_FR[m - 1]} ${y}`;
};

/** Charge les dettes d'un chauffeur avec leurs echeances. */
export async function loadDettes(chauffeurId: string): Promise<Dette[]> {
  const { data: dettes } = await supabase
    .from('chauffeur_dettes')
    .select('id, chauffeur_id, libelle, montant_total, date_creation, statut')
    .eq('chauffeur_id', chauffeurId)
    .neq('statut', 'annulee')
    .order('date_creation', { ascending: false });
  if (!dettes || dettes.length === 0) return [];

  const { data: echeances } = await supabase
    .from('chauffeur_dette_echeances')
    .select('id, dette_id, mois, montant, statut, facture_id')
    .in('dette_id', dettes.map(d => d.id))
    .neq('statut', 'annulee')
    .order('mois', { ascending: true });

  return dettes.map(d => ({
    ...d,
    echeances: (echeances || []).filter(e => e.dette_id === d.id),
  }));
}

/** Echeances a imputer sur la facture d'un mois donne (mois = "YYYY-MM-01"). */
export function echeancesDuMois(dettes: Dette[], mois: string): { libelle: string; montant: number; echeanceId: string }[] {
  const cible = mois.slice(0, 7);
  return dettes.flatMap(d => d.echeances
    .filter(e => e.mois.slice(0, 7) === cible)
    .map(e => ({ libelle: `${d.libelle} — echeance ${moisLabel(e.mois)}`, montant: e.montant, echeanceId: e.id })));
}

interface Props {
  chauffeurId: string;
  /** Mois de la facture en cours d'edition ("YYYY-MM-01") : mis en evidence. */
  moisFacture: string;
  dettes: Dette[];
  onReload: () => void;
}

export function DettesChauffeur({ chauffeurId, moisFacture, dettes, onReload }: Props) {
  const [open, setOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({ libelle: '', montantTotal: 0, nbMensualites: 1, moisDebut: moisFacture.slice(0, 7) });

  useEffect(() => { setForm(f => ({ ...f, moisDebut: moisFacture.slice(0, 7) })); }, [moisFacture]);

  const moisCible = moisFacture.slice(0, 7);
  const totalDuMois = echeancesDuMois(dettes, moisFacture).reduce((s, e) => s + e.montant, 0);

  const resteDu = useCallback((d: Dette) =>
    d.montant_total - d.echeances.filter(e => e.statut === 'appliquee').reduce((s, e) => s + e.montant, 0), []);

  async function createDette() {
    if (!form.libelle.trim() || form.montantTotal <= 0 || form.nbMensualites < 1) return;
    setSaving(true);
    try {
      const { data: dette, error } = await supabase.from('chauffeur_dettes')
        .insert({ chauffeur_id: chauffeurId, libelle: form.libelle.trim(), montant_total: form.montantTotal })
        .select('id').single();
      if (error || !dette) throw error;

      // Repartition egale ; le dernier mois absorbe l'arrondi pour que la somme
      // des echeances tombe exactement sur le montant de la dette.
      const base = Math.floor((form.montantTotal / form.nbMensualites) * 100) / 100;
      const [y0, m0] = form.moisDebut.split('-').map(Number);
      const rows = Array.from({ length: form.nbMensualites }, (_, i) => {
        const total = m0 - 1 + i;
        const y = y0 + Math.floor(total / 12);
        const m = (total % 12) + 1;
        const montant = i === form.nbMensualites - 1
          ? Math.round((form.montantTotal - base * (form.nbMensualites - 1)) * 100) / 100
          : base;
        return { dette_id: dette.id, mois: `${y}-${String(m).padStart(2, '0')}-01`, montant };
      });
      await supabase.from('chauffeur_dette_echeances').insert(rows);

      setForm({ libelle: '', montantTotal: 0, nbMensualites: 1, moisDebut: moisCible });
      setCreating(false);
      onReload();
    } catch (err) {
      console.error('Creation dette:', err);
      alert("La dette n'a pas pu etre creee.");
    } finally {
      setSaving(false);
    }
  }

  async function deleteDette(id: string) {
    if (!confirm('Supprimer cette dette et tout son echeancier ?')) return;
    await supabase.from('chauffeur_dettes').delete().eq('id', id);
    onReload();
  }

  async function updateEcheance(id: string, montant: number) {
    await supabase.from('chauffeur_dette_echeances')
      .update({ montant, updated_at: new Date().toISOString() }).eq('id', id);
    onReload();
  }

  return (
    <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
      <div className="flex items-center justify-between px-4 py-3">
        <button onClick={() => setOpen(o => !o)} className="flex items-center gap-2 text-xs font-bold text-gray-500 uppercase hover:text-gray-700">
          {open ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
          <Wallet className="w-4 h-4" />
          Dettes et echeanciers
          {totalDuMois > 0 && (
            <span className="ml-1 px-2 py-0.5 bg-red-100 text-red-700 rounded-full text-[10px] normal-case font-semibold">
              -{eur(totalDuMois)} ce mois
            </span>
          )}
        </button>
        <button onClick={() => { setOpen(true); setCreating(true); }} className="text-xs text-amber-600 font-medium hover:text-amber-700 flex items-center gap-1">
          <Plus className="w-3 h-3" /> Nouvelle dette
        </button>
      </div>

      {open && (
        <div className="border-t border-gray-100 p-4 space-y-3">
          {creating && (
            <div className="bg-amber-50/60 border border-amber-200 rounded-lg p-3 space-y-3">
              <div className="grid grid-cols-[1fr_110px_90px_120px] gap-2 items-end">
                <div>
                  <label className="block text-[11px] text-gray-500 mb-1">Libelle</label>
                  <input type="text" value={form.libelle} onChange={e => setForm({ ...form, libelle: e.target.value })}
                    placeholder="Dette moteur" className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm outline-none focus:ring-2 focus:ring-amber-500" />
                </div>
                <div>
                  <label className="block text-[11px] text-gray-500 mb-1">Montant total</label>
                  <input type="number" step="0.01" value={form.montantTotal || ''} onChange={e => setForm({ ...form, montantTotal: parseFloat(e.target.value) || 0 })}
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm text-right outline-none focus:ring-2 focus:ring-amber-500" />
                </div>
                <div>
                  <label className="block text-[11px] text-gray-500 mb-1">Mensualites</label>
                  <input type="number" min={1} value={form.nbMensualites} onChange={e => setForm({ ...form, nbMensualites: Math.max(1, parseInt(e.target.value) || 1) })}
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm text-right outline-none focus:ring-2 focus:ring-amber-500" />
                </div>
                <div>
                  <label className="block text-[11px] text-gray-500 mb-1">A partir de</label>
                  <input type="month" value={form.moisDebut} onChange={e => setForm({ ...form, moisDebut: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm outline-none focus:ring-2 focus:ring-amber-500" />
                </div>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-[11px] text-gray-500">
                  {form.nbMensualites > 0 && form.montantTotal > 0
                    ? `${form.nbMensualites} echeance(s) d'environ ${eur(form.montantTotal / form.nbMensualites)}`
                    : 'Renseignez le montant et le nombre de mensualites'}
                </span>
                <div className="flex gap-2">
                  <button onClick={() => setCreating(false)} className="px-3 py-1.5 border border-gray-200 text-gray-600 rounded-lg text-xs hover:bg-white">Annuler</button>
                  <button onClick={createDette} disabled={saving || !form.libelle.trim() || form.montantTotal <= 0}
                    className="px-3 py-1.5 bg-amber-600 hover:bg-amber-700 text-white rounded-lg text-xs font-medium disabled:opacity-50">
                    Creer l'echeancier
                  </button>
                </div>
              </div>
            </div>
          )}

          {dettes.length === 0 && !creating && (
            <p className="text-xs text-gray-400">Aucune dette en cours pour ce chauffeur.</p>
          )}

          {dettes.map(d => (
            <div key={d.id} className="border border-gray-200 rounded-lg p-3 space-y-2">
              <div className="flex items-center justify-between">
                <div>
                  <span className="font-semibold text-sm text-gray-800">{d.libelle}</span>
                  <span className="ml-2 text-xs text-gray-500">
                    {eur(d.montant_total)} — reste {eur(resteDu(d))}
                  </span>
                </div>
                <button onClick={() => deleteDette(d.id)} className="p-1.5 text-gray-400 hover:text-red-600 rounded-lg" title="Supprimer la dette">
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
              <div className="flex flex-wrap gap-2">
                {d.echeances.map(e => {
                  const cible = e.mois.slice(0, 7) === moisCible;
                  return (
                    <div key={e.id}
                      className={`flex items-center gap-1.5 px-2 py-1 rounded-lg border text-xs ${
                        cible ? 'border-red-300 bg-red-50' : e.statut === 'appliquee' ? 'border-emerald-200 bg-emerald-50' : 'border-gray-200 bg-gray-50'}`}
                      title={e.statut === 'appliquee' ? 'Deja imputee sur une facture validee' : 'Prevue'}>
                      <span className={cible ? 'font-semibold text-red-700' : 'text-gray-600'}>{moisLabel(e.mois)}</span>
                      <input type="number" step="0.01" value={e.montant}
                        onChange={ev => updateEcheance(e.id, parseFloat(ev.target.value) || 0)}
                        disabled={e.statut === 'appliquee'}
                        className="w-20 px-1 py-0.5 border border-gray-200 rounded text-right outline-none focus:ring-1 focus:ring-amber-400 disabled:bg-transparent disabled:border-transparent disabled:text-emerald-700 disabled:font-semibold" />
                      {e.statut === 'appliquee' && <span className="text-emerald-600">✓</span>}
                    </div>
                  );
                })}
                {d.echeances.length === 0 && <span className="text-xs text-gray-400">Aucune echeance</span>}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
