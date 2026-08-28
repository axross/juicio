import { useCallback, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, Text, View } from 'react-native';
import { StyleSheet } from 'react-native-unistyles';

import { useFrameRateMonitor } from '../adapter/use-frame-rate-monitor';
import { useHeartbeatCounter } from '../adapter/use-heartbeat-counter';
import { useNativeJobDemo } from '../adapter/use-native-job-demo';

/**
 * a demo of `espada-engine` (issue #7): starts a CPU-bound job on Rust-owned
 * background threads and proves, on-screen, that the JS thread stays free
 * for the whole run — a continuously spinning square driven by
 * `requestAnimationFrame`, its measured frame rate, and a 100ms-timer
 * counter, alongside the job's own progress and result. it occupies the
 * place Analyze's real equity engine will eventually take, and is meant to
 * be deleted by whichever change brings that engine in.
 *
 * renders beneath `AnalyzeScreen`'s existing empty state, leaving every one
 * of that screen's own elements and test IDs untouched.
 */
export function NativeJobDemo() {
  const { t } = useTranslation('analyze');
  const { rotationDeg, currentFps, minFps } = useFrameRateMonitor();
  const heartbeat = useHeartbeatCounter();
  const { state, start, cancel } = useNativeJobDemo();

  // captured once, at the moment a job starts, from the same continuously
  // running monitor — never touched again until the next job starts — so
  // the copy below can compare a job's own frame rate against what this
  // screen was already producing immediately beforehand.
  const [idleBaselineFps, setIdleBaselineFps] = useState<number | null>(null);

  const isRunning = state.status === 'running';

  const handleStart = useCallback(() => {
    setIdleBaselineFps(currentFps);
    start();
  }, [currentFps, start]);

  return (
    <View style={styles.container} testID="analyze-native-demo">
      <Text style={styles.heading}>{t('nativeDemo.heading')}</Text>
      <Text style={styles.description}>{t('nativeDemo.description')}</Text>

      <View style={styles.metricsRow}>
        <View
          style={[styles.spinner, { transform: [{ rotate: `${rotationDeg}deg` }] }]}
          testID="analyze-native-demo-spinner"
        />
        <View style={styles.metricsText}>
          <Text style={styles.metric} testID="analyze-native-demo-fps">
            {t('nativeDemo.frameRate', {
              current: currentFps.toFixed(0),
              min: minFps === null ? '—' : minFps.toFixed(0),
              baseline: idleBaselineFps === null ? '—' : idleBaselineFps.toFixed(0),
            })}
          </Text>
          <Text style={styles.metric} testID="analyze-native-demo-counter">
            {t('nativeDemo.heartbeat', { count: heartbeat })}
          </Text>
        </View>
      </View>

      <View style={styles.controls}>
        {isRunning ? (
          <Pressable
            onPress={cancel}
            style={({ pressed }) => [
              styles.button,
              styles.cancelButton,
              pressed && styles.cancelButtonPressed,
            ]}
            accessibilityRole="button"
            accessibilityLabel={t('nativeDemo.cancelButton')}
            testID="analyze-native-demo-cancel-button"
          >
            <Text style={styles.cancelButtonLabel}>{t('nativeDemo.cancelButton')}</Text>
          </Pressable>
        ) : (
          <Pressable
            onPress={handleStart}
            style={({ pressed }) => [styles.button, pressed && styles.startButtonPressed]}
            accessibilityRole="button"
            accessibilityLabel={t('nativeDemo.startButton')}
            testID="analyze-native-demo-start-button"
          >
            <Text style={styles.startButtonLabel}>{t('nativeDemo.startButton')}</Text>
          </Pressable>
        )}
      </View>

      {state.status === 'running' ? (
        <Text style={styles.status} testID="analyze-native-demo-progress">
          {t('nativeDemo.progress', { percent: Math.round(state.progress * 100) })}
        </Text>
      ) : null}

      {state.status === 'success' ? (
        <Text style={styles.status} testID="analyze-native-demo-result">
          {t('nativeDemo.result', { count: state.primeCount })}
        </Text>
      ) : null}

      {state.status === 'cancelled' ? (
        <Text style={styles.status} testID="analyze-native-demo-result">
          {t('nativeDemo.cancelled')}
        </Text>
      ) : null}

      {state.status === 'error' ? (
        <Text style={[styles.status, styles.errorText]} testID="analyze-native-demo-error">
          {t('nativeDemo.error', { message: state.message })}
        </Text>
      ) : null}
    </View>
  );
}

// fixed control dimensions — well-known minimums (a touch target, a small
// square glyph), not spacing decisions — per react-component-styling's
// "Fixed element dimensions" exemption; neither is one of this project's
// `space.x*` steps.
const BUTTON_MIN_SIZE = 44;
const SPINNER_SIZE = 24;

const styles = StyleSheet.create((theme) => ({
  container: {
    marginTop: theme.space.x32,
    marginHorizontal: theme.space.x16,
    padding: theme.space.x16,
    gap: theme.space.x12,
    borderRadius: theme.radius.md,
    backgroundColor: theme.colors.component.neutral.rest,
  },
  heading: {
    ...theme.typography.heading,
    color: theme.colors.text.neutral.high,
  },
  description: {
    ...theme.typography.description,
    color: theme.colors.text.neutral.low,
  },
  metricsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.space.x12,
  },
  spinner: {
    width: SPINNER_SIZE,
    height: SPINNER_SIZE,
    borderRadius: theme.radius.sm,
    backgroundColor: theme.colors.solid.accent.rest,
  },
  metricsText: {
    flex: 1,
    gap: theme.space.x4,
  },
  metric: {
    ...theme.typography.caption,
    color: theme.colors.text.neutral.low,
  },
  controls: {
    flexDirection: 'row',
  },
  button: {
    height: BUTTON_MIN_SIZE,
    minWidth: BUTTON_MIN_SIZE,
    paddingHorizontal: theme.space.x16,
    borderRadius: theme.radius.md,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: theme.colors.solid.accent.rest,
  },
  startButtonPressed: {
    backgroundColor: theme.colors.solid.accent.hovered,
  },
  startButtonLabel: {
    ...theme.typography.label,
    color: theme.colors.text.accent.onSolid,
  },
  cancelButton: {
    backgroundColor: theme.colors.solid.destructive.rest,
  },
  cancelButtonPressed: {
    backgroundColor: theme.colors.solid.destructive.hovered,
  },
  cancelButtonLabel: {
    ...theme.typography.label,
    color: theme.colors.text.destructive.onSolid,
  },
  status: {
    ...theme.typography.body,
    color: theme.colors.text.neutral.high,
  },
  errorText: {
    color: theme.colors.text.destructive.high,
  },
}));
