import { useCallback, useEffect, useRef, useState } from 'react';

import {
  EspadaNativeError,
  startEspadaJob,
  type EspadaJobHandle,
  type EspadaNativeErrorCode,
} from '@/modules/espada-engine/index';

/**
 * tuned to take on the order of one to a few seconds by trial division on
 * typical mobile hardware, per the plan behind issue #7 — chosen without a
 * device to benchmark against, since this implementation session has none;
 * the receipt this change was implemented with flags it as needing a real
 * measurement once one is available.
 */
const DEMO_PRIME_LIMIT = 30_000_000;
/** `0` = every available core, per `EspadaEngineHybridObject.hpp`'s own
 * `start` contract — the natural showcase value for a demo whose whole
 * point is proving multi-threaded native work off the JS thread. */
const DEMO_THREAD_COUNT = 0;

export type NativeJobDemoState =
  | { status: 'idle' }
  | { status: 'running'; progress: number }
  | { status: 'success'; primeCount: number }
  | { status: 'cancelled' }
  | { status: 'error'; code: EspadaNativeErrorCode; message: string };

export type NativeJobDemo = {
  state: NativeJobDemoState;
  start: () => void;
  cancel: () => void;
};

/**
 * orchestrates one `espada-engine` job for the Analyze tab's demo surface.
 * owns the running job's handle so exactly one `release()` reaches native:
 * once from the job's own settle callback (`startEspadaJob`'s own
 * contract), and — a no-op by then if settle already fired — again from
 * this hook's unmount cleanup, so navigating away from Analyze or a Fast
 * Refresh mid-run never leaves a job unreleased.
 */
export function useNativeJobDemo(): NativeJobDemo {
  const [state, setState] = useState<NativeJobDemoState>({ status: 'idle' });
  const jobRef = useRef<EspadaJobHandle | null>(null);

  useEffect(() => {
    return () => {
      jobRef.current?.cancel();
      jobRef.current?.release();
    };
  }, []);

  const start = useCallback(() => {
    const job = startEspadaJob(DEMO_PRIME_LIMIT, DEMO_THREAD_COUNT, (progress) => {
      setState({ status: 'running', progress });
    });
    jobRef.current = job;
    setState({ status: 'running', progress: 0 });

    job.result
      .then((primeCount) => {
        setState({ status: 'success', primeCount });
      })
      .catch((error: unknown) => {
        if (error instanceof EspadaNativeError && error.code === 'cancelled') {
          setState({ status: 'cancelled' });
          return;
        }

        setState({
          status: 'error',
          code: error instanceof EspadaNativeError ? error.code : 'internal',
          message: error instanceof Error ? error.message : 'Unknown error.',
        });
      })
      .finally(() => {
        jobRef.current = null;
      });
  }, []);

  const cancel = useCallback(() => {
    jobRef.current?.cancel();
  }, []);

  return { state, start, cancel };
}
