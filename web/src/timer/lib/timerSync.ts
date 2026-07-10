import { supabase } from '../../lib/supabase';

// File d'attente hors-ligne PROPRE a l'app Timer (cle distincte) : aucune
// interaction avec la file de l'app chauffeur. Ne cible QUE `timer_segments`.
interface QueuedOp {
  type: 'insert' | 'update';
  data: Record<string, unknown>;
  filterId?: string; // pour update : timer_segments.id
}

const QUEUE_KEY = 'timer_offline_queue';

export function isOnline(): boolean { return navigator.onLine; }

function getQueue(): QueuedOp[] {
  try { return JSON.parse(localStorage.getItem(QUEUE_KEY) || '[]'); } catch { return []; }
}
function saveQueue(q: QueuedOp[]) {
  try { localStorage.setItem(QUEUE_KEY, JSON.stringify(q)); } catch { /* plein */ }
}

export function enqueue(op: QueuedOp) {
  const q = getQueue();
  q.push(op);
  saveQueue(q);
}

export function getPendingCount(): number { return getQueue().length; }

export async function syncQueue(): Promise<number> {
  const q = getQueue();
  if (q.length === 0) return 0;
  let synced = 0;
  let remaining: QueuedOp[] = [];
  for (let i = 0; i < q.length; i++) {
    const op = q[i];
    try {
      if (op.type === 'insert') {
        const { error } = await supabase.from('timer_segments').insert(op.data);
        if (error) throw error;
      } else if (op.filterId) {
        // count exact : si la ligne parente (insert) est encore en file, on re-tente.
        const { error, count } = await supabase
          .from('timer_segments')
          .update(op.data, { count: 'exact' })
          .eq('id', op.filterId);
        if (error) throw error;
        if (!count) throw new Error('0 rows, retry');
      }
      synced++;
    } catch {
      remaining = q.slice(i); // preserve l'ordre causal (insert avant update)
      break;
    }
  }
  saveQueue(remaining);
  return synced;
}

let inProgress = false;
async function attempt() {
  if (inProgress || !isOnline() || getPendingCount() === 0) return;
  inProgress = true;
  try { await syncQueue(); } finally { inProgress = false; }
}

export function initTimerSync() {
  window.addEventListener('online', () => attempt());
  setInterval(() => attempt(), 30000);
  attempt();
}

/** Insert (online) ou mise en file (offline). */
export async function timerInsert(row: Record<string, unknown>) {
  if (isOnline()) {
    const { error } = await supabase.from('timer_segments').insert(row);
    if (!error) return;
  }
  enqueue({ type: 'insert', data: row });
}

/** Update par id (online) ou mise en file (offline). */
export async function timerUpdate(id: string, patch: Record<string, unknown>) {
  if (isOnline()) {
    const { error } = await supabase.from('timer_segments').update(patch).eq('id', id);
    if (!error) return;
  }
  enqueue({ type: 'update', filterId: id, data: patch });
}
