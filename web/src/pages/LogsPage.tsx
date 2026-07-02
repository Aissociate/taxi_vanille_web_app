import { useEffect, useState, useMemo } from 'react';
import { supabase } from '../lib/supabase';
import { ScrollText, RefreshCw, Search, Undo2, Filter, CheckCircle2 } from 'lucide-react';
import type { User } from '@supabase/supabase-js';

interface Log {
  id: string;
  action: string;
  entite: string;
  entite_id: string | null;
  details: string;
  user_email: string;
  old_data: Record<string, unknown> | null;
  new_data: Record<string, unknown> | null;
  is_undone: boolean;
  source: string;
  created_at: string;
}

interface LogsPageProps {
  user: User;
}

const ACTION_LABELS: Record<string, string> = {
  create: 'Creation',
  update: 'Modification',
  delete: 'Suppression',
  replace: 'Remplacement',
  duplicate: 'Duplication',
};

const ENTITY_LABELS: Record<string, string> = {
  courses: 'Course',
  chauffeurs: 'Chauffeur',
  clients: 'Client',
  lignes: 'Ligne',
  tarifs: 'Tarif',
  factures: 'Facture',
  entreprise: 'Entreprise',
  course_executions: 'Execution course',
  arret_executions: 'Execution arret',
  incidents: 'Incident',
  chauffeur_documents: 'Document chauffeur',
  chauffeur_avances: 'Avance chauffeur',
  chauffeur_kilometres: 'Kilometres',
  tarif_plages: 'Plage horaire',
  tarif_km: 'Tarif km',
  tarif_frais: 'Frais',
  tarif_courses_non_prevues: 'Tarif non prevu',
  jours_feries: 'Jour ferie',
  data_report_client_consolidated: 'Rapport client',
  ligne_arrets: 'Arret',
  ia_settings: 'Parametre IA',
  alertes_config: 'Alerte',
  ia_prompts: 'Prompt IA',
};

const SOURCE_LABELS: Record<string, { label: string; color: string }> = {
  admin: { label: 'Admin', color: 'bg-blue-50 text-blue-700' },
  chauffeur_app: { label: 'App Chauffeur', color: 'bg-amber-50 text-amber-700' },
  system: { label: 'Systeme', color: 'bg-gray-100 text-gray-600' },
};

export function LogsPage({ user }: LogsPageProps) {
  const [logs, setLogs] = useState<Log[]>([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState('');
  const [actionFilter, setActionFilter] = useState<string>('all');
  const [entityFilter, setEntityFilter] = useState<string>('all');
  const [sourceFilter, setSourceFilter] = useState<string>('all');
  const [undoingId, setUndoingId] = useState<string | null>(null);

  useEffect(() => { loadLogs(); }, []);

  async function loadLogs() {
    setLoading(true);
    const { data } = await supabase
      .from('logs')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(200);
    if (data) setLogs(data as Log[]);
    setLoading(false);
  }

  async function undoAction(log: Log) {
    if (!log.old_data || !log.entite_id || log.is_undone) return;
    setUndoingId(log.id);
    try {
      if (log.action === 'create') {
        await supabase.from(log.entite).delete().eq('id', log.entite_id);
      } else if (log.action === 'update' || log.action === 'replace') {
        const { user_id, id, created_at, ...restoreData } = log.old_data as Record<string, unknown>;
        await supabase.from(log.entite).update(restoreData).eq('id', log.entite_id);
      } else if (log.action === 'delete') {
        await supabase.from(log.entite).insert({ ...log.old_data, user_id: user.id });
      }
      await supabase.from('logs').update({ is_undone: true }).eq('id', log.id);
      // Log the undo itself
      await supabase.from('logs').insert({
        action: 'update',
        entite: log.entite,
        entite_id: log.entite_id,
        details: `Annulation: ${log.details}`,
        user_id: user.id,
        user_email: user.email || '',
        old_data: log.new_data,
        new_data: log.old_data,
      });
      loadLogs();
    } finally {
      setUndoingId(null);
    }
  }

  const filteredLogs = useMemo(() => {
    return logs.filter(log => {
      if (actionFilter !== 'all' && log.action !== actionFilter) return false;
      if (entityFilter !== 'all' && log.entite !== entityFilter) return false;
      if (sourceFilter !== 'all' && log.source !== sourceFilter) return false;
      if (search) {
        const s = search.toLowerCase();
        const matches = (
          log.details.toLowerCase().includes(s) ||
          log.entite.toLowerCase().includes(s) ||
          log.action.toLowerCase().includes(s) ||
          (log.user_email || '').toLowerCase().includes(s)
        );
        if (!matches) return false;
      }
      return true;
    });
  }, [logs, search, actionFilter, entityFilter, sourceFilter]);

  const actionOptions = useMemo(() => {
    const set = new Set(logs.map(l => l.action));
    return Array.from(set);
  }, [logs]);

  const entityOptions = useMemo(() => {
    const set = new Set(logs.map(l => l.entite));
    return Array.from(set);
  }, [logs]);

  const actionColors: Record<string, string> = {
    create: 'bg-emerald-50 text-emerald-700 border-emerald-200',
    update: 'bg-blue-50 text-blue-700 border-blue-200',
    delete: 'bg-red-50 text-red-700 border-red-200',
    replace: 'bg-orange-50 text-orange-700 border-orange-200',
    duplicate: 'bg-cyan-50 text-cyan-700 border-cyan-200',
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Journal d'activite</h1>
          <p className="text-gray-500 mt-1">Historique complet des modifications avec possibilite d'annulation</p>
        </div>
        <button onClick={loadLogs} disabled={loading} className="flex items-center gap-2 px-4 py-2.5 bg-white border border-gray-200 text-gray-700 rounded-xl font-medium hover:bg-gray-50 transition-colors">
          <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} /> Rafraichir
        </button>
      </div>

      {/* Filters Bar */}
      <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-4">
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
          {/* Search */}
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input
              type="text"
              placeholder="Rechercher dans les logs..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-10 pr-4 py-2.5 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-amber-500 focus:border-amber-500 outline-none transition-colors"
            />
          </div>

          {/* Action filter */}
          <div className="flex items-center gap-2">
            <Filter className="w-4 h-4 text-gray-400 hidden sm:block" />
            <select
              value={actionFilter}
              onChange={(e) => setActionFilter(e.target.value)}
              className="px-3 py-2.5 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-amber-500 outline-none bg-white"
            >
              <option value="all">Toutes les actions</option>
              {actionOptions.map(a => (
                <option key={a} value={a}>{ACTION_LABELS[a] || a}</option>
              ))}
            </select>

            {/* Entity filter */}
            <select
              value={entityFilter}
              onChange={(e) => setEntityFilter(e.target.value)}
              className="px-3 py-2.5 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-amber-500 outline-none bg-white"
            >
              <option value="all">Toutes les entites</option>
              {entityOptions.map(e => (
                <option key={e} value={e}>{ENTITY_LABELS[e] || e}</option>
              ))}
            </select>

            {/* Source filter */}
            <select
              value={sourceFilter}
              onChange={(e) => setSourceFilter(e.target.value)}
              className="px-3 py-2.5 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-amber-500 outline-none bg-white"
            >
              <option value="all">Toutes les sources</option>
              <option value="admin">Admin</option>
              <option value="chauffeur_app">App Chauffeur</option>
              <option value="system">Systeme</option>
            </select>
          </div>
        </div>

        {/* Active filters summary */}
        {(actionFilter !== 'all' || entityFilter !== 'all' || sourceFilter !== 'all' || search) && (
          <div className="flex items-center gap-2 mt-3 pt-3 border-t border-gray-100">
            <span className="text-xs text-gray-500">{filteredLogs.length} resultat(s)</span>
            {search && (
              <span className="text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded">"{search}"</span>
            )}
            {actionFilter !== 'all' && (
              <span className={`text-xs px-2 py-0.5 rounded border ${actionColors[actionFilter] || 'bg-gray-100 text-gray-600 border-gray-200'}`}>
                {ACTION_LABELS[actionFilter] || actionFilter}
              </span>
            )}
            {entityFilter !== 'all' && (
              <span className="text-xs bg-amber-50 text-amber-700 border border-amber-200 px-2 py-0.5 rounded">
                {ENTITY_LABELS[entityFilter] || entityFilter}
              </span>
            )}
            {sourceFilter !== 'all' && (
              <span className={`text-xs px-2 py-0.5 rounded ${SOURCE_LABELS[sourceFilter]?.color || 'bg-gray-100 text-gray-600'}`}>
                {SOURCE_LABELS[sourceFilter]?.label || sourceFilter}
              </span>
            )}
            <button
              onClick={() => { setSearch(''); setActionFilter('all'); setEntityFilter('all'); setSourceFilter('all'); }}
              className="text-xs text-amber-600 hover:underline ml-auto"
            >
              Effacer les filtres
            </button>
          </div>
        )}
      </div>

      {/* Logs List */}
      {filteredLogs.length === 0 ? (
        <div className="bg-white rounded-xl border border-gray-100 p-12 text-center">
          <ScrollText className="w-12 h-12 text-gray-300 mx-auto mb-3" />
          <p className="text-gray-500">{logs.length === 0 ? 'Aucun log enregistre' : 'Aucun resultat pour ces filtres'}</p>
        </div>
      ) : (
        <div className="space-y-2">
          {filteredLogs.map((log) => {
            const canUndo = !log.is_undone && log.old_data && log.entite_id && (log.action === 'create' || log.action === 'update' || log.action === 'delete' || log.action === 'replace');
            return (
              <div
                key={log.id}
                className={`bg-white rounded-xl border shadow-sm transition-all hover:shadow-md ${log.is_undone ? 'border-gray-200 opacity-60' : 'border-gray-100'}`}
              >
                <div className="px-5 py-4 flex items-start gap-4">
                  {/* Action badge */}
                  <div className="flex-shrink-0 pt-0.5">
                    <span className={`inline-flex px-2.5 py-1 rounded-lg text-xs font-semibold border ${actionColors[log.action] || 'bg-gray-50 text-gray-600 border-gray-200'}`}>
                      {ACTION_LABELS[log.action] || log.action}
                    </span>
                  </div>

                  {/* Content */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-sm font-semibold text-gray-900">
                        {ENTITY_LABELS[log.entite] || log.entite}
                      </span>
                      {log.source && (
                        <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${SOURCE_LABELS[log.source]?.color || 'bg-gray-100 text-gray-600'}`}>
                          {SOURCE_LABELS[log.source]?.label || log.source}
                        </span>
                      )}
                      {log.is_undone && (
                        <span className="inline-flex items-center gap-1 text-[10px] bg-gray-100 text-gray-500 px-1.5 py-0.5 rounded font-medium">
                          <CheckCircle2 className="w-3 h-3" /> Annule
                        </span>
                      )}
                    </div>
                    <p className="text-sm text-gray-600 mt-0.5 truncate">{log.details || 'Aucun detail'}</p>
                    <div className="flex items-center gap-3 mt-2">
                      <span className="text-[11px] text-gray-400">
                        {new Date(log.created_at).toLocaleString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', timeZone: 'Indian/Mayotte' })}
                      </span>
                      {log.user_email && (
                        <span className="text-[11px] text-gray-400">
                          par <span className="font-medium text-gray-500">{log.user_email}</span>
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Undo button */}
                  <div className="flex-shrink-0">
                    {canUndo && (
                      <button
                        onClick={() => undoAction(log)}
                        disabled={undoingId === log.id}
                        className="flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-amber-700 bg-amber-50 border border-amber-200 rounded-lg hover:bg-amber-100 transition-colors disabled:opacity-50"
                      >
                        {undoingId === log.id ? (
                          <span className="w-3.5 h-3.5 border-2 border-amber-600 border-t-transparent rounded-full animate-spin" />
                        ) : (
                          <Undo2 className="w-3.5 h-3.5" />
                        )}
                        Annuler
                      </button>
                    )}
                  </div>
                </div>

                {/* Expandable diff preview */}
                {(log.old_data || log.new_data) && !log.is_undone && (
                  <details className="border-t border-gray-50">
                    <summary className="px-5 py-2 text-[11px] text-gray-400 cursor-pointer hover:text-gray-600 hover:bg-gray-50 transition-colors">
                      Voir les donnees
                    </summary>
                    <div className="px-5 pb-3 grid grid-cols-2 gap-3">
                      {log.old_data && (
                        <div>
                          <p className="text-[10px] font-semibold text-gray-400 uppercase mb-1">Avant</p>
                          <pre className="text-[10px] text-gray-600 bg-red-50 rounded p-2 overflow-auto max-h-32 border border-red-100">
                            {JSON.stringify(log.old_data, null, 2)}
                          </pre>
                        </div>
                      )}
                      {log.new_data && (
                        <div>
                          <p className="text-[10px] font-semibold text-gray-400 uppercase mb-1">Apres</p>
                          <pre className="text-[10px] text-gray-600 bg-emerald-50 rounded p-2 overflow-auto max-h-32 border border-emerald-100">
                            {JSON.stringify(log.new_data, null, 2)}
                          </pre>
                        </div>
                      )}
                    </div>
                  </details>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
