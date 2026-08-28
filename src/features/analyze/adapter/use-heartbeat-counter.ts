import { useEffect, useState } from 'react';

const INTERVAL_MS = 100;

/**
 * a counter incrementing once every 100ms via a plain JS timer — the native
 * job demo's second, coarser proof that the JS thread stays responsive
 * while a job runs (alongside `useFrameRateMonitor`'s `requestAnimationFrame`
 * loop): a counter that visibly freezes is legible at a glance in a way a
 * frame-rate figure is not (see the plan behind issue #7).
 */
export function useHeartbeatCounter(): number {
  const [count, setCount] = useState(0);

  useEffect(() => {
    const id = setInterval(() => {
      setCount((current) => current + 1);
    }, INTERVAL_MS);

    return () => clearInterval(id);
  }, []);

  return count;
}
