import { useEffect, useState } from 'react';
import { supabase } from '../../lib/supabase';
import { DatabaseBackup, Save, RotateCcw, Loader2, ShieldCheck, AlertTriangle } from 'lucide-react';
import type { User } from '@supabase/supabase-js';

interface Backup {
  id: string;
  created_at: string;
  type: 'auto' | 'manuel';
  note: string | null;
  stats: { courses?: number; astreintes?: number; coordinateur_creneaux?: number };
}

interface DiffPart { total: number; manquants: number }
interface Diff { courses: DiffPart; astreintes: DiffPart; coordinateur_creneaux: DiffPart }

interface Props { user: User }

const fmtDate = (iso: string) =>
  new Date(iso).toLocaleString('fr-FR', {
    weekday: 'short', day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit',
    timeZone: 'Indian/Mayotte',
  });

export function SauvegardesPage(_props: Props) {
  const [backups, setBackups] = useState<Backup[]>([]);
  const [loading, setLoading] = useState(true);
  const [working, setWorking] = useState(false);
  // Diff charge a la demande pour la sauvegarde selectionnee (avant restauration)
  const [diffs, setDiffs] = useState<Record<string, Diff>>({});

  useEffect(() => { load(); }, []);

  async function load() {
    setLoading(true);
    const { data, error } = await supabase
      .from('backups')
      .select('id, created_at, type, note, stats')
      .order('created_at', { ascending: false });
    if (error) alert(`Chargement impossible : ${error.message}`);
    setBackups((data as Backup[]) ?? []);
    setLoading(false);
  }

  async function backupNow() {
    const note = prompt('Note pour cette sauvegarde (facultatif) :') ?? undefined;
    setWorking(true);
    try {
      const { data, error } = await supabase.rpc('create_backup', { p_type: 'manuel', p_note: note || null });
      if (error) { alert(`Sauvegarde impossible : ${error.message}`); return; }
      const s = data as { courses: number; astreintes: number; coordinateur_creneaux: number };
      alert(`Sauvegarde creee : ${s.courses} courses, ${s.astreintes} astreintes, ${s.coordinateur_creneaux} creneaux coordinateur.`);
      load();
    } finally {
      setWorking(false);
    }
  }

  async function loadDiff(backupId: string) {
    const { data, error } = await supabase.rpc('backup_diff', { p_backup_id: backupId });
    if (error) { alert(`Analyse impossible : ${error.message}`); return null; }
    const diff = data as Diff;
    setDiffs(prev => ({ ...prev, [backupId]: diff }));
    return diff;
  }

  async function restore(b: Backup, mode: 'manquants' | 'ecraser') {
    const diff = diffs[b.id] ?? await loadDiff(b.id);
    if (!diff) return;
    const totalManquants = diff.courses.manquants + diff.astreintes.manquants + diff.coordinateur_creneaux.manquants;

    let msg: string;
    if (mode === 'manquants') {
      if (totalManquants === 0) { alert('Rien a restaurer : aucun element de cette sauvegarde ne manque dans le planning actuel.'); return; }
      msg = `Restaurer les elements DISPARUS depuis la sauvegarde du ${fmtDate(b.created_at)} ?\n\n`
        + `- ${diff.courses.manquants} course(s)\n`
        + `- ${diff.astreintes.manquants} astreinte(s)\n`
        + `- ${diff.coordinateur_creneaux.manquants} creneau(x) coordinateur\n\n`
        + `Les donnees actuelles ne sont PAS modifiees, seuls les elements manquants sont reinseres.`;
    } else {
      msg = `ATTENTION - mode ECRASER.\n\nToutes les donnees du planning seront remises dans l'etat du ${fmtDate(b.created_at)} `
        + `(${diff.courses.total} courses) : les modifications faites DEPUIS cette date seront perdues, `
        + `et ${totalManquants} element(s) disparu(s) seront reinseres.\n\nConfirmer ?`;
    }
    if (!confirm(msg)) return;
    if (mode === 'ecraser' && !confirm('Derniere confirmation : ecraser le planning actuel avec cette sauvegarde ?')) return;

    setWorking(true);
    try {
      const { data, error } = await supabase.rpc('restore_backup', { p_backup_id: b.id, p_mode: mode });
      if (error) { alert(`Restauration impossible : ${error.message}`); return; }
      const r = data as Record<string, { reinserees: number; ecrasees: number }>;
      alert(`Restauration terminee :\n`
        + `- courses : ${r.courses.reinserees} reinseree(s)${mode === 'ecraser' ? `, ${r.courses.ecrasees} remise(s) a l'etat sauvegarde` : ''}\n`
        + `- astreintes : ${r.astreintes.reinserees} reinseree(s)\n`
        + `- creneaux coordinateur : ${r.coordinateur_creneaux.reinserees} reinseree(s)`);
      setDiffs({});
      load();
    } finally {
      setWorking(false);
    }
  }

  return (
    <div className="space-y-6 max-w-[900px]">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="section-label">Parametrage</p>
          <h1 className="page-title mt-1">Sauvegardes</h1>
          <p className="text-sm text-gray-500 mt-1">
            Le planning (courses, astreintes, creneaux coordinateur) est sauvegarde automatiquement toutes les 12 h.
            En cas d'urgence, restaurez ici les elements disparus.
          </p>
        </div>
        <button
          onClick={backupNow}
          disabled={working}
          className="flex items-center gap-2 px-4 py-2.5 bg-amber-600 hover:bg-amber-700 disabled:opacity-50 text-white rounded-xl font-medium transition-colors shadow-sm text-sm flex-shrink-0"
        >
          {working ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
          Sauvegarder maintenant
        </button>
      </div>

      <div className="flex items-start gap-2.5 px-4 py-3 bg-blue-50 border border-blue-100 rounded-xl text-xs text-blue-800">
        <ShieldCheck className="w-4 h-4 flex-shrink-0 mt-0.5" />
        <p>
          <span className="font-semibold">Restaurer les manquants</span> reinsere uniquement les elements supprimes depuis la
          sauvegarde, sans toucher au reste — c'est le mode sans risque.{' '}
          <span className="font-semibold">Ecraser</span> remet TOUT le planning dans l'etat de la sauvegarde
          (les modifications plus recentes sont perdues) : a reserver aux vraies urgences.
        </p>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-16 text-gray-400 gap-2">
          <Loader2 className="w-5 h-5 animate-spin" /> Chargement...
        </div>
      ) : backups.length === 0 ? (
        <div className="bg-white rounded-xl border border-gray-200 p-12 text-center">
          <DatabaseBackup className="w-12 h-12 text-gray-300 mx-auto mb-3" />
          <p className="text-gray-500">Aucune sauvegarde pour le moment</p>
          <p className="text-xs text-gray-400 mt-1">La premiere sauvegarde automatique sera prise dans les 12 prochaines heures.</p>
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-200 text-[10px] uppercase text-gray-500">
              <tr>
                <th className="text-left px-4 py-2.5 font-semibold">Date (Mayotte)</th>
                <th className="text-left px-4 py-2.5 font-semibold">Type</th>
                <th className="text-left px-4 py-2.5 font-semibold">Contenu</th>
                <th className="text-left px-4 py-2.5 font-semibold">Note</th>
                <th className="text-right px-4 py-2.5 font-semibold">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {backups.map(b => {
                const diff = diffs[b.id];
                const manquants = diff
                  ? diff.courses.manquants + diff.astreintes.manquants + diff.coordinateur_creneaux.manquants
                  : null;
                return (
                  <tr key={b.id} className="hover:bg-gray-50/50">
                    <td className="px-4 py-3 font-medium text-gray-900 whitespace-nowrap">{fmtDate(b.created_at)}</td>
                    <td className="px-4 py-3">
                      <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${b.type === 'auto' ? 'bg-gray-100 text-gray-600' : 'bg-amber-100 text-amber-700'}`}>
                        {b.type === 'auto' ? 'Auto' : 'Manuelle'}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-xs text-gray-500 whitespace-nowrap">
                      {b.stats.courses ?? '?'} courses · {b.stats.astreintes ?? '?'} astr. · {b.stats.coordinateur_creneaux ?? '?'} coord.
                      {manquants !== null && (
                        <span className={`ml-2 font-semibold ${manquants > 0 ? 'text-red-600' : 'text-emerald-600'}`}>
                          {manquants > 0 ? `${manquants} manquant(s)` : 'rien ne manque'}
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-xs text-gray-500 max-w-[180px] truncate">{b.note || ''}</td>
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-end gap-1.5">
                        <button
                          onClick={() => loadDiff(b.id)}
                          disabled={working}
                          className="px-2.5 py-1.5 text-xs font-medium border border-gray-200 text-gray-600 rounded-lg hover:bg-gray-50 disabled:opacity-40 transition-colors"
                          title="Comparer cette sauvegarde avec le planning actuel"
                        >
                          Analyser
                        </button>
                        <button
                          onClick={() => restore(b, 'manquants')}
                          disabled={working}
                          className="flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium border border-emerald-300 text-emerald-700 bg-emerald-50 rounded-lg hover:bg-emerald-100 disabled:opacity-40 transition-colors"
                          title="Reinsere uniquement les elements disparus (sans risque)"
                        >
                          <RotateCcw className="w-3.5 h-3.5" /> Restaurer les manquants
                        </button>
                        <button
                          onClick={() => restore(b, 'ecraser')}
                          disabled={working}
                          className="flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium border border-red-200 text-red-600 rounded-lg hover:bg-red-50 disabled:opacity-40 transition-colors"
                          title="Remet TOUT le planning dans l'etat de la sauvegarde (modifications recentes perdues)"
                        >
                          <AlertTriangle className="w-3.5 h-3.5" /> Ecraser
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <p className="text-[11px] text-gray-400">
        Retention : 14 sauvegardes automatiques (7 jours) et 10 manuelles. Portee : astreintes et creneaux en totalite,
        courses des 60 derniers jours + tout le futur. Chaque restauration est tracee dans les Logs.
      </p>
    </div>
  );
}
