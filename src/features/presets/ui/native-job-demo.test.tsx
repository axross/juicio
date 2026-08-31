// registers this project's real themes against the mocked
// `StyleSheet.configure` — see `../../../shared/ui/segmented-tabs/
// segmented-tabs.test.tsx` for why this side-effect import must run before
// anything themed renders.
import '@/core/theme/unistyles';

import { render, screen } from '@testing-library/react-native';

import { NativeJobDemo } from './native-job-demo';

// keeps `espada-engine`'s native module, the `requestAnimationFrame` loop,
// and the `setInterval` heartbeat entirely out of this test — none of those
// run under Jest (docs/conventions/testing.md's Native Surfaces section),
// and none of them are what this test is about.
jest.mock('../adapter/use-frame-rate-monitor', () => ({
  useFrameRateMonitor: () => ({ rotationDeg: 0, currentFps: 0, minFps: null }),
}));
jest.mock('../adapter/use-heartbeat-counter', () => ({ useHeartbeatCounter: () => 0 }));
jest.mock('../adapter/use-native-job-demo', () => ({
  useNativeJobDemo: () => ({ state: { status: 'idle' }, start: jest.fn(), cancel: jest.fn() }),
}));
jest.mock('@/core/haptics/haptics');
jest.mock('@/core/instrumentation/report-error', () => ({ reportError: jest.fn() }));

// proves docs/conventions/component-styling.md's root-style merge rule is
// real for `NativeJobDemo`'s own root `View`, not merely type-level — its
// own root style used to also carry its placement (`marginTop`/
// `marginHorizontal`), moved to its one caller
// (`src/app/(tabs)/presets.tsx`) by this same change (issue #94) per
// "Placement Is the Caller's".
describe('<NativeJobDemo /> style', () => {
  it('merges a caller-supplied style onto its own root style rather than replacing it', () => {
    render(<NativeJobDemo style={{ marginTop: 10 }} />);

    const root = screen.getByTestId('presets-native-demo');
    const flattenedStyle = Array.isArray(root.props.style)
      ? Object.assign({}, ...root.props.style.flat(Infinity).filter(Boolean))
      : root.props.style;

    // the caller's `marginTop` survived...
    expect(flattenedStyle).toMatchObject({ marginTop: 10 });
    // ...alongside this demo's own card chrome, which a caller replacing
    // rather than extending the style would have wiped.
    expect(flattenedStyle).toHaveProperty('backgroundColor');
  });
});
