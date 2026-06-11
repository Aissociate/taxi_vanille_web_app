import { supabase } from './supabase';
import { onNetworkChange, isNative } from './native';

export interface QueuedMedia {
  bucket: string;
  path: string;
  dataUrl: string;
  field: string;
}

interface QueuedOperation {
  id: string;
  table: string;
  type: 'insert' | 'update';
  data: Record<string, unknown>;
  filter?: { column: string; value: string };
  media?: QueuedMedia[];
  createdAt: string;
}

const QUEUE_KEY = 'offline_queue';
const CACHE_PREFIX = 'offline_cache_';

function generateId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

function getQueue(): QueuedOperation[] {
  try {
    const raw = localStorage.getItem(QUEUE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function saveQueue(queue: QueuedOperation[]) {
  localStorage.setItem(QUEUE_KEY, JSON.stringify(queue));
}

export function isOnline(): boolean {
  return navigator.onLine;
}

export function enqueue(op: Omit<QueuedOperation, 'id' | 'createdAt'>) {
  const queue = getQueue();
  queue.push({ ...op, id: generateId(), createdAt: new Date().toISOString() });
  try {
    saveQueue(queue);
  } catch {
    // localStorage quota exceeded: retry without the (heavy) media payloads so
    // the operation itself is not lost.
    if (op.media?.length) {
      queue[queue.length - 1] = { ...queue[queue.length - 1], media: undefined };
      try {
        saveQueue(queue);
      } catch {
        // Still full: drop the new operation, nothing else we can do.
      }
    }
  }
}

export function getPendingCount(): number {
  return getQueue().length;
}

export async function syncQueue(): Promise<{ synced: number; failed: number }> {
  const queue = getQueue();
  if (queue.length === 0) return { synced: 0, failed: 0 };

  let synced = 0;
  const remaining: QueuedOperation[] = [];

  for (const op of queue) {
    try {
      // Upload any media captured offline first, then patch the row data with
      // the resulting public URLs. If an upload fails the whole operation stays
      // queued so the media is not silently lost.
      if (op.media?.length) {
        for (const m of op.media) {
          if (op.data[m.field]) continue; // already uploaded on a previous attempt
          const blob = await (await fetch(m.dataUrl)).blob();
          const { data: uploaded, error: uploadError } = await supabase.storage
            .from(m.bucket)
            .upload(m.path, blob, { upsert: true });
          if (uploadError || !uploaded) throw uploadError || new Error('upload failed');
          const { data: urlData } = supabase.storage.from(m.bucket).getPublicUrl(uploaded.path);
          op.data[m.field] = urlData.publicUrl;
        }
      }

      if (op.type === 'insert') {
        const { error } = await supabase.from(op.table).insert(op.data);
        if (error) throw error;
      } else if (op.type === 'update' && op.filter) {
        const { error } = await supabase
          .from(op.table)
          .update(op.data)
          .eq(op.filter.column, op.filter.value);
        if (error) throw error;
      }
      synced++;
    } catch {
      remaining.push(op);
    }
  }

  saveQueue(remaining);
  return { synced, failed: remaining.length };
}

export function cacheData(key: string, data: unknown) {
  try {
    localStorage.setItem(CACHE_PREFIX + key, JSON.stringify(data));
  } catch {
    // Storage full, ignore
  }
}

export function getCachedData<T>(key: string): T | null {
  try {
    const raw = localStorage.getItem(CACHE_PREFIX + key);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

let syncListeners: Array<(result: { synced: number; failed: number }) => void> = [];

export function onSyncComplete(listener: (result: { synced: number; failed: number }) => void) {
  syncListeners.push(listener);
  return () => {
    syncListeners = syncListeners.filter((l) => l !== listener);
  };
}

function notifySyncListeners(result: { synced: number; failed: number }) {
  syncListeners.forEach((l) => l(result));
}

let syncInProgress = false;

async function attemptSync() {
  if (syncInProgress || !isOnline() || getPendingCount() === 0) return;
  syncInProgress = true;
  try {
    const result = await syncQueue();
    if (result.synced > 0) notifySyncListeners(result);
  } finally {
    syncInProgress = false;
  }
}

export function initOfflineSync() {
  onNetworkChange((connected) => {
    if (connected) attemptSync();
  });

  if (!isNative) {
    window.addEventListener('online', () => {
      attemptSync();
    });
  }

  setInterval(() => {
    attemptSync();
  }, 30000);

  attemptSync();
}
