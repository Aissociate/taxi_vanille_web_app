import { useEffect, useMemo, useState, useCallback } from 'react';
import type { User } from '@supabase/supabase-js';
import {
  MapPin, ChevronLeft, ChevronRight, Plus, Trash2, RotateCcw, Download,
  CalendarDays, CalendarRange, Calendar, Loader2, ChevronDown,
} from 'lucide-react';
import { supabase } from '../lib/supabase';
import {
  COLONNES, type ColDef, type ChampId, type StatRow, type LigneLite, type SlotConso,
  loadDay, loadRange, consolider, setCell, addManualRow, deleteRow, resetDay,
  moyennePassagers, tauxFrequentation, toInt,
} from '../lib/statLigne';
import { downloadSpreadsheet, type SheetData, type CellValue } from '../lib/spreadsheetExport';
import { mDateStr, mNoon, mAddDaysStr, mMondayStr, fmtDateLong, fmtMonthYear, mParts } from '../lib/mayotte';

type ViewMode = 'jour' | 'semaine' | 'mois';

interface Props {
  user: User;
}

const p2 = (n: number) => String(n).padStart(2, '0');
const ddmm = (jour: string) => `${jour.slice(8, 10)}/${jour.slice(5, 7)}`;

function daysOfMonth(anchor: string): string[] {
  const [y, m] = anchor.split('-').map(Number);
  const nb = new Date(y, m, 0).getDate();
  return Array.from({ length: nb }, (_, i) => `${y}-${p2(m)}-${p2(i + 1)}`);
}
function weekDays(anchor: string): string[] {
  const monday = mMondayStr(mNoon(anchor));
  return Array.from({ length: 7 }, (_, i) => mAddDaysStr(monday, i));
}

// En-tetes d'export (colonnes de la feuille + valeurs calculees).
const EXPORT_HEADERS = [
  ...COLONNES.map((c) => c.label),
  'Nbre moyen passagers',
  'Taux frequentation %',
];

function rowToExport(values: StatRow['values']): CellValue[] {
  const taux = Math.round(tauxFrequentation(values) * 1000) / 10;
  return [
    values.arret,
    values.heure_theo,
    values.horaire,
    values.chauffeur,
    values.heure_reelle,
    values.non_effectue === '1' ? 1 : 0,
    values.retard === '1' ? 1 : 0,
    toInt(values.montees),
    toInt(values.descentes),
    values.heure_arrivee,
    values.commentaires,
    values.temps_aller ? toInt(values.temps_aller) : '',
    moyennePassagers(values),
    toInt(values.capacite),
    taux,
  ];
}

export function FacturationLignePage({ user }: Props) {
  void user;
  const [lignes, setLignes] = useState<LigneLite[]>([]);
  const [ligneId, setLigneId] = useState('');
  const [view, setView] = useState<ViewMode>('jour');
  const [anchor, setAnchor] = useState(() => mDateStr(new Date()));

  const [rows, setRows] = useState<StatRow[]>([]);
  const [perDay, setPerDay] = useState<Map<string, StatRow[]>>(new Map());
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(0);
  const [exporting, setExporting] = useState(false);
  const [exportOpen, setExportOpen] = useState(false);

  const ligne = lignes.find((l) => l.id === ligneId);

  useEffect(() => {
    (async () => {
      const { data } = await supabase.from('lignes').select('id, code, nom').eq('active', true).order('code');
      const list = (data || []) as LigneLite[];
      setLignes(list);
      if (list.length > 0) setLigneId((prev) => prev || list.find((l) => l.code === 'L3')?.id || list[0].id);
    })();
  }, []);

  const jours = useMemo(() => {
    if (view === 'jour') return [anchor];
    if (view === 'semaine') return weekDays(anchor);
    return daysOfMonth(anchor);
  }, [view, anchor]);

  const refresh = useCallback(async () => {
    if (!ligneId) return;
    setLoading(true);
    try {
      if (view === 'jour') {
        setRows(await loadDay(ligneId, anchor));
      } else {
        setPerDay(await loadRange(ligneId, jours));
      }
    } catch (e) {
      alert(`Erreur de chargement : ${(e as Error).message}`);
    } finally {
      setLoading(false);
    }
  }, [ligneId, view, anchor, jours]);

  useEffect(() => { refresh(); }, [refresh]);

  const conso = useMemo<SlotConso[]>(
    () => (view === 'jour' ? [] : consolider(perDay, jours)),
    [view, perDay, jours],
  );

  // ---- Edition (vue jour) --------------------------------------------------

  function applyLocalEdit(row: StatRow, champ: ChampId, value: string): StatRow {
    const values = { ...row.values, [champ]: value };
    const overridden = new Set(row.overridden);
    if (!row.manual && value === row.base[champ]) overridden.delete(champ);
    else overridden.add(champ);
    return { ...row, values, overridden };
  }

  async function persistCell(row: StatRow, champ: ChampId, value: string) {
    setSaving((s) => s + 1);
    try {
      await setCell(ligneId, anchor, row, champ, value);
    } catch (e) {
      alert(`Erreur d'enregistrement : ${(e as Error).message}`);
      refresh();
    } finally {
      setSaving((s) => s - 1);
    }
  }

  function onCellChange(idx: number, champ: ChampId, value: string) {
    setRows((prev) => prev.map((r, i) => (i === idx ? applyLocalEdit(r, champ, value) : r)));
  }
  function onCellCommit(idx: number, champ: ChampId, value: string) {
    const row = rows[idx];
    if (!row) return;
    persistCell(row, champ, value);
  }

  async function onAddRow() {
    if (!ligneId) return;
    setSaving((s) => s + 1);
    try {
      await addManualRow(ligneId, anchor);
      await refresh();
    } finally {
      setSaving((s) => s - 1);
    }
  }
  async function onDeleteRow(row: StatRow) {
    if (!confirm(row.manual ? 'Supprimer cette ligne ajoutee ?' : 'Masquer cette ligne du tableau ?')) return;
    setSaving((s) => s + 1);
    try {
      await deleteRow(ligneId, anchor, row);
      await refresh();
    } finally {
      setSaving((s) => s - 1);
    }
  }
  async function onResetDay() {
    if (!confirm('Effacer toutes les modifications manuelles de ce jour et revenir aux donnees reelles ?')) return;
    setSaving((s) => s + 1);
    try {
      await resetDay(ligneId, anchor);
      await refresh();
    } finally {
      setSaving((s) => s - 1);
    }
  }

  // ---- Navigation ----------------------------------------------------------

  function navigate(dir: number) {
    if (view === 'jour') setAnchor(mAddDaysStr(anchor, dir));
    else if (view === 'semaine') setAnchor(mAddDaysStr(anchor, dir * 7));
    else {
      const [y, m] = anchor.split('-').map(Number);
      const d = new Date(y, m - 1 + dir, 1);
      setAnchor(`${d.getFullYear()}-${p2(d.getMonth() + 1)}-01`);
    }
  }

  const periodeLabel = useMemo(() => {
    if (view === 'jour') {
      const p = mParts(mNoon(anchor));
      return `${fmtDateLong(mNoon(anchor))} ${p.y}`;
    }
    if (view === 'semaine') {
      const w = weekDays(anchor);
      return `Semaine du ${ddmm(w[0])} au ${ddmm(w[6])}`;
    }
    return fmtMonthYear(mNoon(anchor));
  }, [view, anchor]);

  // ---- Export --------------------------------------------------------------

  function daySheet(name: string, dayRows: StatRow[]): SheetData {
    return { name, rows: [EXPORT_HEADERS, ...dayRows.map((r) => rowToExport(r.values))] };
  }

  function syntheseSheet(name: string, slots: SlotConso[], daysCols: string[] | null): SheetData {
    const header: CellValue[] = ['Arret', 'Heure theo'];
    if (daysCols) header.push(...daysCols.map(ddmm));
    header.push('Nb departs', 'Total montees', 'Total descentes', 'Taux moyen %', 'Temps moyen (min)', 'Non effectues', 'Retards');
    const rowsX = slots.map((s) => {
      const line: CellValue[] = [s.arret, s.heure_theo];
      if (daysCols) line.push(...daysCols.map((j) => s.parJour.get(j)?.montees ?? 0));
      line.push(
        s.nbDeparts,
        s.totMontees,
        s.totDescentes,
        Math.round(s.tauxMoyen * 1000) / 10,
        Math.round(s.tempsMoyen * 10) / 10,
        s.nbNonEffectue,
        s.nbRetard,
      );
      return line;
    });
    return { name, rows: [header, ...rowsX] };
  }

  async function doExport(scope: ViewMode) {
    if (!ligne) return;
    setExporting(true);
    setExportOpen(false);
    try {
      const code = ligne.code;
      if (scope === 'jour') {
        const dr = await loadDay(ligneId, anchor);
        downloadSpreadsheet(`${code}-Stat-${anchor}`, [daySheet(`${code} ${ddmm(anchor)}`, dr)]);
        return;
      }
      const list = scope === 'semaine' ? weekDays(anchor) : daysOfMonth(anchor);
      const data = await loadRange(ligneId, list);
      const slots = consolider(data, list);
      const sheets: SheetData[] = [
        syntheseSheet('Synthese', slots, scope === 'semaine' ? list : null),
        ...list.map((j) => daySheet(ddmm(j), data.get(j) || [])),
      ];
      const suffix = scope === 'semaine' ? `Semaine-${list[0]}` : `Mois-${anchor.slice(0, 7)}`;
      downloadSpreadsheet(`${code}-${suffix}`, sheets);
    } catch (e) {
      alert(`Erreur d'export : ${(e as Error).message}`);
    } finally {
      setExporting(false);
    }
  }

  // ---- Totaux vue jour -----------------------------------------------------

  const totaux = useMemo(() => {
    let montees = 0, descentes = 0, nonEff = 0, retard = 0, tauxSum = 0, tauxN = 0;
    for (const r of rows) {
      montees += toInt(r.values.montees);
      descentes += toInt(r.values.descentes);
      if (r.values.non_effectue === '1') nonEff += 1;
      if (r.values.retard === '1') retard += 1;
      tauxSum += tauxFrequentation(r.values);
      tauxN += 1;
    }
    return { montees, descentes, nonEff, retard, tauxMoyen: tauxN > 0 ? tauxSum / tauxN : 0, nb: rows.length };
  }, [rows]);

  const nbModifs = useMemo(() => rows.reduce((n, r) => n + (r.manual ? 1 : r.overridden.size), 0), [rows]);

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <p className="text-xs text-gray-500 uppercase font-semibold">Direction - Exploitation</p>
          <h1 className="text-2xl font-bold text-gray-900">Facturation / Stats par ligne</h1>
          <p className="text-sm text-gray-500 mt-0.5">Remontee d'informations editable, consolidee par semaine ou mois.</p>
        </div>
        <div className="flex items-center gap-2">
          {/* Ligne */}
          <div className="relative">
            <MapPin className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
            <select
              value={ligneId}
              onChange={(e) => setLigneId(e.target.value)}
              className="pl-9 pr-8 py-2.5 border border-gray-200 rounded-xl text-sm font-medium bg-white focus:ring-2 focus:ring-amber-500 outline-none appearance-none"
            >
              {lignes.map((l) => <option key={l.id} value={l.id}>{l.code} - {l.nom}</option>)}
            </select>
          </div>
          {/* Export */}
          <div className="relative">
            <button
              onClick={() => setExportOpen((o) => !o)}
              disabled={exporting || !ligneId}
              className="flex items-center gap-2 px-4 py-2.5 bg-amber-600 hover:bg-amber-700 disabled:opacity-50 text-white rounded-xl font-medium transition-colors shadow-sm text-sm"
            >
              {exporting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
              Export Excel <ChevronDown className="w-3.5 h-3.5" />
            </button>
            {exportOpen && (
              <div className="absolute right-0 mt-1 w-56 bg-white rounded-xl border border-gray-200 shadow-lg z-20 py-1 text-sm">
                <button onClick={() => doExport('jour')} className="w-full text-left px-4 py-2 hover:bg-gray-50 flex items-center gap-2"><CalendarDays className="w-4 h-4 text-gray-400" /> Jour courant</button>
                <button onClick={() => doExport('semaine')} className="w-full text-left px-4 py-2 hover:bg-gray-50 flex items-center gap-2"><CalendarRange className="w-4 h-4 text-gray-400" /> Semaine (jours + synthese)</button>
                <button onClick={() => doExport('mois')} className="w-full text-left px-4 py-2 hover:bg-gray-50 flex items-center gap-2"><Calendar className="w-4 h-4 text-gray-400" /> Mois (jours + synthese)</button>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Toolbar : vue + navigation */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center border border-gray-200 rounded-lg overflow-hidden">
          {([['jour', 'Jour', CalendarDays], ['semaine', 'Semaine', CalendarRange], ['mois', 'Mois', Calendar]] as const).map(([v, label, Icon]) => (
            <button
              key={v}
              onClick={() => setView(v)}
              className={`px-3 py-2 text-sm font-medium flex items-center gap-1.5 transition-colors ${view === v ? 'bg-amber-600 text-white' : 'bg-white text-gray-600 hover:bg-gray-50'}`}
            >
              <Icon className="w-4 h-4" /> {label}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => navigate(-1)} className="p-2 hover:bg-gray-100 rounded-lg transition-colors"><ChevronLeft className="w-4 h-4 text-gray-600" /></button>
          <span className="text-sm font-semibold text-gray-800 min-w-[220px] text-center capitalize">{periodeLabel}</span>
          <button onClick={() => navigate(1)} className="p-2 hover:bg-gray-100 rounded-lg transition-colors"><ChevronRight className="w-4 h-4 text-gray-600" /></button>
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-20 text-gray-400 gap-2">
          <Loader2 className="w-5 h-5 animate-spin" /> Chargement...
        </div>
      ) : view === 'jour' ? (
        <DayTable
          rows={rows}
          totaux={totaux}
          nbModifs={nbModifs}
          saving={saving > 0}
          onCellChange={onCellChange}
          onCellCommit={onCellCommit}
          onDeleteRow={onDeleteRow}
          onAddRow={onAddRow}
          onResetDay={onResetDay}
        />
      ) : (
        <ConsoTable slots={conso} jours={view === 'semaine' ? jours : null} />
      )}
    </div>
  );
}

// ==== Vue JOUR : tableau editable ==========================================

interface DayTableProps {
  rows: StatRow[];
  totaux: { montees: number; descentes: number; nonEff: number; retard: number; tauxMoyen: number; nb: number };
  nbModifs: number;
  saving: boolean;
  onCellChange: (idx: number, champ: ChampId, value: string) => void;
  onCellCommit: (idx: number, champ: ChampId, value: string) => void;
  onDeleteRow: (row: StatRow) => void;
  onAddRow: () => void;
  onResetDay: () => void;
}

function DayTable({ rows, totaux, nbModifs, saving, onCellChange, onCellCommit, onDeleteRow, onAddRow, onResetDay }: DayTableProps) {
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-3 text-xs">
          <span className="inline-flex items-center gap-1.5 text-gray-500"><span className="w-3 h-3 rounded bg-amber-100 border border-amber-300" /> Cellule modifiee</span>
          {nbModifs > 0 && <span className="text-amber-700 font-medium">{nbModifs} modification{nbModifs > 1 ? 's' : ''} enregistree{nbModifs > 1 ? 's' : ''}</span>}
          {saving && <span className="inline-flex items-center gap-1 text-gray-400"><Loader2 className="w-3 h-3 animate-spin" /> enregistrement...</span>}
        </div>
        <div className="flex items-center gap-2">
          <button onClick={onResetDay} disabled={nbModifs === 0} className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-gray-600 border border-gray-200 rounded-lg hover:bg-gray-50 disabled:opacity-40 transition-colors">
            <RotateCcw className="w-3.5 h-3.5" /> Reinitialiser le jour
          </button>
          <button onClick={onAddRow} className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-amber-700 border border-amber-300 bg-amber-50 rounded-lg hover:bg-amber-100 transition-colors">
            <Plus className="w-3.5 h-3.5" /> Ajouter une ligne
          </button>
        </div>
      </div>

      <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-x-auto">
        <table className="text-xs border-collapse min-w-max">
          <thead>
            <tr className="bg-gray-50 border-b border-gray-200">
              {COLONNES.map((c) => (
                <th key={c.id} className="px-2 py-2 text-left font-semibold text-gray-500 uppercase tracking-tight" style={{ minWidth: c.width }}>{c.label}</th>
              ))}
              <th className="px-2 py-2 text-center font-semibold text-gray-500 uppercase" style={{ minWidth: 64 }}>Moy.</th>
              <th className="px-2 py-2 text-center font-semibold text-gray-500 uppercase" style={{ minWidth: 70 }}>Taux</th>
              <th className="px-2 py-2 w-10" />
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr><td colSpan={COLONNES.length + 3} className="text-center py-10 text-gray-400">Aucun depart ce jour. Utilisez "Ajouter une ligne" pour saisir.</td></tr>
            ) : rows.map((row, idx) => (
              <tr key={row.rowKey} className={`border-b border-gray-50 hover:bg-gray-50/50 ${row.manual ? 'bg-teal-50/30' : ''}`}>
                {COLONNES.map((col) => (
                  <td key={col.id} className="px-1 py-0.5">
                    <EditableCell
                      col={col}
                      value={row.values[col.id]}
                      overridden={row.overridden.has(col.id)}
                      onChange={(v) => onCellChange(idx, col.id, v)}
                      onCommit={(v) => onCellCommit(idx, col.id, v)}
                    />
                  </td>
                ))}
                <td className="px-2 py-1 text-center text-gray-500 tabular-nums">{moyennePassagers(row.values)}</td>
                <td className="px-2 py-1 text-center font-medium text-gray-700 tabular-nums">{(tauxFrequentation(row.values) * 100).toFixed(0)}%</td>
                <td className="px-1 py-1 text-center">
                  <button onClick={() => onDeleteRow(row)} title={row.manual ? 'Supprimer' : 'Masquer'} className="p-1 text-gray-300 hover:text-red-600 rounded transition-colors">
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
          {rows.length > 0 && (
            <tfoot>
              <tr className="bg-gray-50 border-t-2 border-gray-200 font-semibold text-gray-700">
                <td className="px-2 py-2" colSpan={5}>TOTAL ({totaux.nb} departs)</td>
                <td className="px-2 py-2 text-center tabular-nums">{totaux.nonEff}</td>
                <td className="px-2 py-2 text-center tabular-nums">{totaux.retard}</td>
                <td className="px-2 py-2 text-center tabular-nums">{totaux.montees}</td>
                <td className="px-2 py-2 text-center tabular-nums">{totaux.descentes}</td>
                <td colSpan={4} />
                <td className="px-2 py-2 text-center tabular-nums">{(totaux.tauxMoyen * 100).toFixed(0)}%</td>
                <td />
              </tr>
            </tfoot>
          )}
        </table>
      </div>
    </div>
  );
}

interface EditableCellProps {
  col: ColDef;
  value: string;
  overridden: boolean;
  onChange: (v: string) => void;
  onCommit: (v: string) => void;
}

function EditableCell({ col, value, overridden, onChange, onCommit }: EditableCellProps) {
  const base = `w-full px-1.5 py-1 rounded border text-xs outline-none transition-colors ${
    overridden ? 'border-amber-300 bg-amber-50 text-amber-900 font-medium' : 'border-transparent hover:border-gray-200 focus:border-amber-400 bg-transparent'
  }`;

  if (col.type === 'bool') {
    return (
      <div className="flex justify-center">
        <input
          type="checkbox"
          checked={value === '1'}
          onChange={(e) => { const v = e.target.checked ? '1' : '0'; onChange(v); onCommit(v); }}
          className={`w-4 h-4 rounded accent-amber-600 ${overridden ? 'ring-2 ring-amber-300' : ''}`}
        />
      </div>
    );
  }

  const type = col.type === 'time' ? 'time' : col.type === 'int' ? 'number' : 'text';
  return (
    <input
      type={type}
      value={value}
      min={col.type === 'int' ? 0 : undefined}
      onChange={(e) => onChange(e.target.value)}
      onBlur={(e) => onCommit(e.target.value)}
      className={`${base} ${col.type !== 'text' ? 'text-center tabular-nums' : ''}`}
      style={{ minWidth: col.width }}
    />
  );
}

// ==== Vue SEMAINE / MOIS : consolidation ===================================

function ConsoTable({ slots, jours }: { slots: SlotConso[]; jours: string[] | null }) {
  const totBas = useMemo(() => {
    return slots.reduce(
      (acc, s) => ({
        nbDeparts: acc.nbDeparts + s.nbDeparts,
        totMontees: acc.totMontees + s.totMontees,
        totDescentes: acc.totDescentes + s.totDescentes,
        nonEff: acc.nonEff + s.nbNonEffectue,
        retard: acc.retard + s.nbRetard,
      }),
      { nbDeparts: 0, totMontees: 0, totDescentes: 0, nonEff: 0, retard: 0 },
    );
  }, [slots]);

  if (slots.length === 0) {
    return <div className="text-center py-16 text-gray-400 bg-white rounded-xl border border-gray-200">Aucune donnee sur la periode.</div>;
  }

  return (
    <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-x-auto">
      <table className="text-xs border-collapse min-w-max w-full">
        <thead>
          <tr className="bg-gray-50 border-b border-gray-200 text-gray-500 uppercase">
            <th className="px-3 py-2 text-left font-semibold">Arret</th>
            <th className="px-3 py-2 text-left font-semibold">Heure theo</th>
            {jours && jours.map((j) => <th key={j} className="px-2 py-2 text-center font-semibold">{ddmm(j)}</th>)}
            <th className="px-2 py-2 text-center font-semibold">Nb dep.</th>
            <th className="px-2 py-2 text-center font-semibold">Tot. montees</th>
            <th className="px-2 py-2 text-center font-semibold">Tot. descentes</th>
            <th className="px-2 py-2 text-center font-semibold">Taux moy.</th>
            <th className="px-2 py-2 text-center font-semibold">Temps moy.</th>
            <th className="px-2 py-2 text-center font-semibold">Non eff.</th>
            <th className="px-2 py-2 text-center font-semibold">Retards</th>
          </tr>
        </thead>
        <tbody>
          {slots.map((s) => (
            <tr key={`${s.arret}|${s.heure_theo}`} className="border-b border-gray-50 hover:bg-gray-50/50">
              <td className="px-3 py-1.5 font-medium text-gray-700">{s.arret}</td>
              <td className="px-3 py-1.5 text-gray-600 tabular-nums">{s.heure_theo}</td>
              {jours && jours.map((j) => {
                const c = s.parJour.get(j);
                return <td key={j} className="px-2 py-1.5 text-center tabular-nums text-gray-600">{c ? c.montees : ''}</td>;
              })}
              <td className="px-2 py-1.5 text-center tabular-nums">{s.nbDeparts}</td>
              <td className="px-2 py-1.5 text-center tabular-nums font-medium">{s.totMontees}</td>
              <td className="px-2 py-1.5 text-center tabular-nums">{s.totDescentes}</td>
              <td className="px-2 py-1.5 text-center tabular-nums">{(s.tauxMoyen * 100).toFixed(0)}%</td>
              <td className="px-2 py-1.5 text-center tabular-nums">{s.tempsMoyen.toFixed(0)}</td>
              <td className="px-2 py-1.5 text-center tabular-nums">{s.nbNonEffectue || ''}</td>
              <td className="px-2 py-1.5 text-center tabular-nums">{s.nbRetard || ''}</td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr className="bg-gray-50 border-t-2 border-gray-200 font-semibold text-gray-700">
            <td className="px-3 py-2" colSpan={2 + (jours ? jours.length : 0)}>TOTAL</td>
            <td className="px-2 py-2 text-center tabular-nums">{totBas.nbDeparts}</td>
            <td className="px-2 py-2 text-center tabular-nums">{totBas.totMontees}</td>
            <td className="px-2 py-2 text-center tabular-nums">{totBas.totDescentes}</td>
            <td />
            <td />
            <td className="px-2 py-2 text-center tabular-nums">{totBas.nonEff}</td>
            <td className="px-2 py-2 text-center tabular-nums">{totBas.retard}</td>
          </tr>
        </tfoot>
      </table>
    </div>
  );
}
