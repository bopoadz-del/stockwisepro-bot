import { useEffect, useState } from 'react';
import { liveApi, type LiveSnapshot, type LiveAlert } from '@/lib/api/live';

export type { LiveSnapshot, LiveAlert };

/**
 * Polls the backend live feed (rotating score snapshot + recent market alerts)
 * on an interval. The backend advances to a new ticker roughly every minute.
 */
export function useLiveFeed(intervalMs = 20000) {
  const [snapshot, setSnapshot] = useState<LiveSnapshot | null>(null);
  const [alerts, setAlerts] = useState<LiveAlert[]>([]);

  useEffect(() => {
    let mounted = true;
    const load = async () => {
      const res = await liveApi.getFeed();
      if (!mounted || !res.data) return;
      setSnapshot(res.data.snapshot);
      setAlerts(res.data.alerts || []);
    };
    load();
    const id = setInterval(load, intervalMs);
    return () => {
      mounted = false;
      clearInterval(id);
    };
  }, [intervalMs]);

  return { snapshot, alerts };
}
