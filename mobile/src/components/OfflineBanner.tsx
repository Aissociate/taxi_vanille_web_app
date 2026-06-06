import { useState, useEffect } from 'react';
import { PText, PIcon } from '@porsche-design-system/components-react';
import { getPendingCount, onSyncComplete } from '../lib/offlineQueue';
import { onNetworkChange, getNetworkStatus } from '../lib/native';

export default function OfflineBanner() {
  const [online, setOnline] = useState(navigator.onLine);
  const [pendingCount, setPendingCount] = useState(getPendingCount());
  const [syncMessage, setSyncMessage] = useState<string | null>(null);

  useEffect(() => {
    getNetworkStatus().then(setOnline);

    const unsubNetwork = onNetworkChange((connected) => setOnline(connected));

    const unsubSync = onSyncComplete((result) => {
      setPendingCount(getPendingCount());
      if (result.synced > 0) {
        setSyncMessage(`${result.synced} operation${result.synced > 1 ? 's' : ''} synchronisee${result.synced > 1 ? 's' : ''}`);
        setTimeout(() => setSyncMessage(null), 3000);
      }
    });

    const interval = setInterval(() => {
      setPendingCount(getPendingCount());
    }, 5000);

    return () => {
      unsubNetwork();
      unsubSync();
      clearInterval(interval);
    };
  }, []);

  if (syncMessage) {
    return (
      <div className="sticky top-0 z-[100] bg-[#0a8a0a] text-white px-static-sm py-static-xs flex items-center justify-center gap-static-xs">
        <PIcon name="check" size="x-small" style={{ color: '#fff' }} />
        <PText size="xx-small" weight="bold" style={{ color: '#fff' }}>
          {syncMessage}
        </PText>
      </div>
    );
  }

  if (!online) {
    return (
      <div className="sticky top-0 z-[100] bg-[#e65c00] text-white px-static-sm py-static-xs flex items-center justify-center gap-static-xs">
        <PIcon name="warning" size="x-small" style={{ color: '#fff' }} />
        <PText size="xx-small" weight="bold" style={{ color: '#fff' }}>
          HORS-LIGNE {pendingCount > 0 ? `- ${pendingCount} en attente` : ''}
        </PText>
      </div>
    );
  }

  if (pendingCount > 0) {
    return (
      <div className="sticky top-0 z-[100] bg-[#d35400] text-white px-static-sm py-static-xs flex items-center justify-center gap-static-xs">
        <PIcon name="refresh" size="x-small" style={{ color: '#fff' }} />
        <PText size="xx-small" weight="bold" style={{ color: '#fff' }}>
          Synchronisation en cours... ({pendingCount})
        </PText>
      </div>
    );
  }

  return null;
}
