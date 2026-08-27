import { useEffect, useRef, useState } from 'react';

const ROTATION_DEGREES_PER_SECOND = 90;
/** The loop's first few callbacks report a much longer delta than any real
 * frame ever takes (there is no previous frame to measure against yet),
 * which would otherwise poison "minimum observed" with a number no actual
 * frame drop ever produces. Discarded from `minFps` tracking only — not
 * from the rotation or the smoothed current figure, which tolerate it
 * fine. */
const WARMUP_FRAMES = 5;
/** How much weight a single new sample carries in the smoothed "current
 * fps" figure — low enough that one slow frame does not visibly jump the
 * displayed number, high enough that a sustained drop still shows up
 * quickly. */
const SMOOTHING_FACTOR = 0.1;

export type FrameRateSample = {
  /** Degrees, wrapped to `[0, 360)` — drives a rendered rotation, the
   * demo's own visible proof that a render actually committed this frame. */
  rotationDeg: number;
  /** An exponential moving average of the instantaneous frame rate. */
  currentFps: number;
  /** The lowest instantaneous frame rate observed since mount, once past
   * the warmup window; `null` until then. */
  minFps: number | null;
};

const INITIAL_SAMPLE: FrameRateSample = { rotationDeg: 0, currentFps: 0, minFps: null };

/**
 * Runs a `requestAnimationFrame` loop for the caller's whole mounted
 * lifetime, committing a React render every single frame — the mechanism
 * the plan behind issue #7 specifies for proving the JS thread stays
 * responsive while a `juicio-native` job runs on its own Rust-owned
 * threads.
 *
 * This is deliberately NOT `Animated` with the native driver, and NOT a
 * Reanimated worklet: both are dispatched from the UI thread and would go
 * on animating smoothly even with the JS thread fully blocked, which would
 * make this demo a false proof of the one thing it exists to demonstrate.
 * A plain `useState` update inside a `requestAnimationFrame` callback is
 * the one implementation that actually stalls when the JS thread does —
 * do not "optimise" this into either of those.
 */
export function useFrameRateMonitor(): FrameRateSample {
  const [sample, setSample] = useState<FrameRateSample>(INITIAL_SAMPLE);

  const frameCountRef = useRef(0);
  const lastTimestampRef = useRef<number | null>(null);
  const rotationRef = useRef(0);
  const currentFpsRef = useRef(0);
  const minFpsRef = useRef<number | null>(null);

  useEffect(() => {
    let frameId: number;

    const tick = (timestamp: number) => {
      const lastTimestamp = lastTimestampRef.current;
      lastTimestampRef.current = timestamp;
      frameCountRef.current += 1;

      if (lastTimestamp !== null) {
        const deltaMs = timestamp - lastTimestamp;

        if (deltaMs > 0) {
          const instantFps = 1000 / deltaMs;
          currentFpsRef.current =
            currentFpsRef.current === 0
              ? instantFps
              : currentFpsRef.current * (1 - SMOOTHING_FACTOR) + instantFps * SMOOTHING_FACTOR;

          if (frameCountRef.current > WARMUP_FRAMES) {
            minFpsRef.current =
              minFpsRef.current === null ? instantFps : Math.min(minFpsRef.current, instantFps);
          }
        }

        rotationRef.current =
          (rotationRef.current + (deltaMs / 1000) * ROTATION_DEGREES_PER_SECOND) % 360;
      }

      // The render this triggers every frame IS the proof: it can only
      // keep happening on schedule if the JS thread is free to run it.
      setSample({
        rotationDeg: rotationRef.current,
        currentFps: currentFpsRef.current,
        minFps: minFpsRef.current,
      });

      frameId = requestAnimationFrame(tick);
    };

    frameId = requestAnimationFrame(tick);

    return () => cancelAnimationFrame(frameId);
  }, []);

  return sample;
}
