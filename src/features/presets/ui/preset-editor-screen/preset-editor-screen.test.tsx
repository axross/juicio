import '@/core/theme/unistyles';
import '@/core/i18n';

import { fireEvent, render, screen } from '@testing-library/react-native';

import { PresetEditorScreen } from './preset-editor-screen';

// `NavBar` imports `react-native-reanimated` directly now (its own
// scroll-linked blur, issue #260) — this screen never passes it a
// `scrollOffset` (it has nothing to scroll), but `NavBar` still reaches
// into `react-native-worklets`'s native module on init merely by being
// imported. this project's own established pair of mocks for that (see
// `@/core/navigation/nav-bar.test.tsx`'s identical pair, and
// `@/shared/ui/bottom-sheet/bottom-sheet.test.tsx`'s own comment for why
// `require()` inside the factory, not a same-file `import`, is what gets
// the load order right).
// eslint-disable-next-line @typescript-eslint/no-require-imports
jest.mock('react-native-worklets', () => require('react-native-worklets/src/mock'));
// eslint-disable-next-line @typescript-eslint/no-require-imports
jest.mock('react-native-reanimated', () => require('react-native-reanimated/mock'));

// `NavBar`'s own back button fires a haptic on press — mocked outright per
// this project's own convention (see `@/core/navigation/nav-bar.test.tsx`'s
// identical pair): an automock still needs the real `./haptics` once, to
// introspect its exports, and that reaches `@sentry/react-native` via
// `report-error`, which starts a real `setInterval` nothing here clears.
jest.mock('@/core/haptics/haptics');
jest.mock('@/core/instrumentation/report-error', () => ({ reportError: jest.fn() }));

describe('<PresetEditorScreen />', () => {
  it('titles itself "New Preset" in create mode', () => {
    render(<PresetEditorScreen mode="create" onBack={jest.fn()} />);

    expect(screen.getByTestId('title')).toHaveTextContent('New Preset');
  });

  it('titles itself "Edit Preset" in edit mode', () => {
    render(<PresetEditorScreen mode="edit" presetId={7} onBack={jest.fn()} />);

    expect(screen.getByTestId('title')).toHaveTextContent('Edit Preset');
  });

  it('calls onBack when the back button is pressed', () => {
    const onBack = jest.fn();
    render(<PresetEditorScreen mode="create" onBack={onBack} />);

    fireEvent.press(screen.getByTestId('back'));

    expect(onBack).toHaveBeenCalledTimes(1);
  });

  it('renders no field of its own — a field-less stub for issue #177 to complete', () => {
    render(<PresetEditorScreen mode="create" onBack={jest.fn()} />);

    expect(screen.queryByRole('textbox')).toBeNull();
  });

  it('does not leak presetId onto the underlying View root', () => {
    render(<PresetEditorScreen mode="edit" presetId={7} onBack={jest.fn()} />);

    expect(screen.getByTestId('preset-editor-screen').props.presetId).toBeUndefined();
  });
});
