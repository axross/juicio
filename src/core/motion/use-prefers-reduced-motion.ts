import { useEffect, useState } from 'react';
import { AccessibilityInfo } from 'react-native';

/**
 * the OS "reduce motion" accessibility setting, read live — this
 * project's first read of it anywhere, so there is no existing precedent
 * to follow; this is a small, generic wrapper rather than a per-component
 * read, so a second caller (this change already has several) shares one
 * subscription shape instead of re-deriving it.
 *
 * `AccessibilityInfo.isReduceMotionEnabled()` resolves asynchronously —
 * this project's React Native version exposes no synchronous read — so a
 * caller's first render always sees `false` (motion allowed) until that
 * promise settles, then whatever `reduceMotionChanged` reports after
 * that. every surface this project animates renders correctly either
 * way: a transition beginning before the true value resolves plays once,
 * as ordinary motion, rather than breaking anything.
 */
export function usePrefersReducedMotion(): boolean {
  const [prefersReducedMotion, setPrefersReducedMotion] = useState(false);

  useEffect(() => {
    let mounted = true;

    AccessibilityInfo.isReduceMotionEnabled().then((enabled) => {
      if (mounted) {
        setPrefersReducedMotion(enabled);
      }
    });

    const subscription = AccessibilityInfo.addEventListener(
      'reduceMotionChanged',
      setPrefersReducedMotion,
    );

    return () => {
      mounted = false;
      subscription.remove();
    };
  }, []);

  return prefersReducedMotion;
}
