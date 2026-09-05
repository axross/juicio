import '@/core/theme/unistyles';
import '@/core/i18n';

import { fireEvent, render, screen } from '@testing-library/react-native';

import { PresetEditorScreen } from './preset-editor-screen';

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
