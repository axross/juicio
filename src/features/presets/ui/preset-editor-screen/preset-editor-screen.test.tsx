import '@/core/theme/unistyles';
import '@/core/i18n';
// `HandRangePane` composes `SelectionGrid`, which needs a
// `GestureHandlerRootView` to mount without throwing — see
// `@/shared/ui/hand-range-pane/hand-range-pane.test.tsx`'s identical setup.
import 'react-native-gesture-handler/jestSetup';

import { act, fireEvent, render, screen, within } from '@testing-library/react-native';
import { AccessibilityInfo } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';

import { SharkIllustration } from '@/shared/ui/empty-state/shark-illustration';

import { createPreset, updatePreset } from '../../adapter/preset-storage';
import { useEditedPreset } from '../../adapter/use-edited-preset';
import type { Preset } from '../../model/preset';
import { PresetEditorScreen } from './preset-editor-screen';

// see `@/shared/ui/hand-range-pane/hand-range-pane.test.tsx`'s identical
// comment on why this has to be a lazy `require()` inside the mock factory.
// eslint-disable-next-line @typescript-eslint/no-require-imports
jest.mock('react-native-worklets', () => require('react-native-worklets/src/mock'));

// `NavBar`'s own back button, and every tag chip, fire a haptic on press —
// mocked outright per this project's own convention (see
// `@/core/navigation/nav-bar.test.tsx`'s identical pair): an automock still
// needs the real `./haptics` once, to introspect its exports, and that
// reaches `@sentry/react-native` via `report-error`, which starts a real
// `setInterval` nothing here clears.
jest.mock('@/core/haptics/haptics');
jest.mock('@/core/instrumentation/report-error', () => ({ reportError: jest.fn() }));

// this screen's own two data-loading/persisting seams — mocked outright so
// each test drives exactly one status or outcome directly, rather than
// seeding and querying a real database. `../../adapter/
// use-edited-preset.test.ts` and `../../adapter/preset-storage.test.ts` are
// what actually cover those modules' own behaviour against the real
// (mocked-client) database.
jest.mock('../../adapter/use-edited-preset');
jest.mock('../../adapter/preset-storage');

const mockedUseEditedPreset = jest.mocked(useEditedPreset);
const mockedCreatePreset = jest.mocked(createPreset);
const mockedUpdatePreset = jest.mocked(updatePreset);
const mockedAnnounce = jest.mocked(AccessibilityInfo.announceForAccessibility);

function preset(overrides: Partial<Preset> = {}): Preset {
  return {
    id: 7,
    name: 'BTN Open',
    handRange: new Set(['AA', 'KK']),
    tags: { position: ['BTN'], players: [], stack: [], action: [] },
    ...overrides,
  };
}

function renderScreen(props: Parameters<typeof PresetEditorScreen>[0]) {
  return render(
    <GestureHandlerRootView>
      <PresetEditorScreen {...props} />
    </GestureHandlerRootView>,
  );
}

beforeEach(() => {
  mockedUseEditedPreset.mockReturnValue({ status: 'skipped' });
  mockedCreatePreset.mockReset();
  mockedUpdatePreset.mockReset();
  mockedAnnounce.mockReset();
});

describe('<PresetEditorScreen /> — nav bar (unchanged from the stub)', () => {
  it('titles itself "New Preset" in create mode', () => {
    renderScreen({ mode: 'create', onBack: jest.fn() });

    expect(screen.getByTestId('title')).toHaveTextContent('New Preset');
  });

  it('titles itself "Edit Preset" in edit mode', () => {
    mockedUseEditedPreset.mockReturnValue({ status: 'loaded', preset: preset() });
    renderScreen({ mode: 'edit', presetId: 7, onBack: jest.fn() });

    expect(screen.getByTestId('title')).toHaveTextContent('Edit Preset');
  });

  it('calls onBack when the back button is pressed', () => {
    const onBack = jest.fn();
    renderScreen({ mode: 'create', onBack });

    fireEvent.press(screen.getByTestId('back'));

    expect(onBack).toHaveBeenCalledTimes(1);
  });

  it('does not leak presetId onto the underlying View root', () => {
    mockedUseEditedPreset.mockReturnValue({ status: 'loaded', preset: preset() });
    renderScreen({ mode: 'edit', presetId: 7, onBack: jest.fn() });

    expect(screen.getByTestId('preset-editor-screen').props.presetId).toBeUndefined();
  });
});

describe('<PresetEditorScreen /> — create mode', () => {
  it('shows an empty name, an empty hand range, and no tag selected on any axis', () => {
    renderScreen({ mode: 'create', onBack: jest.fn() });

    expect(screen.getByTestId('preset-editor-name-input').props.value).toBe('');
    expect(screen.getByTestId('cell-AA').props.accessibilityState).toMatchObject({
      selected: false,
    });
    expect(screen.getByTestId('tag-position-BTN').props.accessibilityState).toMatchObject({
      checked: false,
    });
  });

  it('never calls useEditedPreset with a presetId', () => {
    renderScreen({ mode: 'create', onBack: jest.fn() });

    expect(mockedUseEditedPreset).toHaveBeenCalledWith(undefined);
  });
});

describe('<PresetEditorScreen /> — edit mode, loading', () => {
  it('shows a centered spinner and no fields while the preset is being fetched', () => {
    mockedUseEditedPreset.mockReturnValue({ status: 'loading' });
    renderScreen({ mode: 'edit', presetId: 7, onBack: jest.fn() });

    expect(screen.getByTestId('preset-editor-loading')).toBeVisible();
    expect(screen.queryByTestId('preset-editor-name-input')).toBeNull();
  });
});

describe('<PresetEditorScreen /> — edit mode, loaded', () => {
  it('pre-fills the name, hand range, and tags from the fetched preset', () => {
    mockedUseEditedPreset.mockReturnValue({ status: 'loaded', preset: preset() });
    renderScreen({ mode: 'edit', presetId: 7, onBack: jest.fn() });

    expect(screen.getByTestId('preset-editor-name-input').props.value).toBe('BTN Open');
    expect(screen.getByTestId('cell-AA').props.accessibilityState).toMatchObject({
      selected: true,
    });
    expect(screen.getByTestId('cell-KK').props.accessibilityState).toMatchObject({
      selected: true,
    });
    expect(screen.getByTestId('cell-72o').props.accessibilityState).toMatchObject({
      selected: false,
    });
    expect(screen.getByTestId('tag-position-BTN').props.accessibilityState).toMatchObject({
      checked: true,
    });
    expect(screen.getByTestId('tag-position-CO').props.accessibilityState).toMatchObject({
      checked: false,
    });
  });
});

describe('<PresetEditorScreen /> — edit mode, load-failed', () => {
  it('shows a load-failed message and no fields', () => {
    mockedUseEditedPreset.mockReturnValue({ status: 'load-failed' });
    renderScreen({ mode: 'edit', presetId: 7, onBack: jest.fn() });

    expect(screen.getByTestId('preset-editor-load-failed')).toBeVisible();
    expect(screen.queryByTestId('preset-editor-name-input')).toBeNull();
    expect(
      within(screen.getByTestId('preset-editor-load-failed')).UNSAFE_getByType(SharkIllustration),
    ).toBeTruthy();
  });

  it('still offers a way back to the list via the nav bar back action', () => {
    const onBack = jest.fn();
    mockedUseEditedPreset.mockReturnValue({ status: 'load-failed' });
    renderScreen({ mode: 'edit', presetId: 7, onBack });

    fireEvent.press(screen.getByTestId('back'));

    expect(onBack).toHaveBeenCalledTimes(1);
  });
});

describe('<PresetEditorScreen /> — invalid save', () => {
  it('flags only the name when the hand range already has a rank pair selected', () => {
    renderScreen({ mode: 'create', onBack: jest.fn() });
    fireEvent.press(screen.getByTestId('chip-55+'));

    fireEvent.press(screen.getByTestId('preset-editor-submit-bar'));

    expect(screen.getByTestId('preset-editor-name-input-error')).toBeVisible();
    expect(screen.queryByTestId('preset-editor-hand-range-error')).toBeNull();
    expect(mockedCreatePreset).not.toHaveBeenCalled();
  });

  it('flags only the hand range when the name is already filled in', () => {
    renderScreen({ mode: 'create', onBack: jest.fn() });
    fireEvent.changeText(screen.getByTestId('preset-editor-name-input'), 'BTN Open');

    fireEvent.press(screen.getByTestId('preset-editor-submit-bar'));

    expect(screen.getByTestId('preset-editor-hand-range-error')).toBeVisible();
    expect(screen.queryByTestId('preset-editor-name-input-error')).toBeNull();
    expect(mockedCreatePreset).not.toHaveBeenCalled();
  });

  it('flags both fields at once and announces a combined failure when both are empty', () => {
    renderScreen({ mode: 'create', onBack: jest.fn() });

    fireEvent.press(screen.getByTestId('preset-editor-submit-bar'));

    expect(screen.getByTestId('preset-editor-name-input-error')).toBeVisible();
    expect(screen.getByTestId('preset-editor-hand-range-error')).toBeVisible();
    expect(mockedCreatePreset).not.toHaveBeenCalled();
    expect(mockedAnnounce).toHaveBeenCalledTimes(1);
  });

  it('clears the name error as soon as the name changes', () => {
    renderScreen({ mode: 'create', onBack: jest.fn() });
    fireEvent.press(screen.getByTestId('preset-editor-submit-bar'));
    expect(screen.getByTestId('preset-editor-name-input-error')).toBeVisible();

    fireEvent.changeText(screen.getByTestId('preset-editor-name-input'), 'BTN Open');

    expect(screen.queryByTestId('preset-editor-name-input-error')).toBeNull();
  });

  it('clears the hand range error as soon as a rank pair is selected', () => {
    renderScreen({ mode: 'create', onBack: jest.fn() });
    fireEvent.press(screen.getByTestId('preset-editor-submit-bar'));
    expect(screen.getByTestId('preset-editor-hand-range-error')).toBeVisible();

    fireEvent.press(screen.getByTestId('chip-55+'));

    expect(screen.queryByTestId('preset-editor-hand-range-error')).toBeNull();
  });

  it('does not persist any previously saved preset when the save is blocked', () => {
    mockedUseEditedPreset.mockReturnValue({ status: 'loaded', preset: preset() });
    renderScreen({ mode: 'edit', presetId: 7, onBack: jest.fn() });
    fireEvent.changeText(screen.getByTestId('preset-editor-name-input'), '');

    fireEvent.press(screen.getByTestId('preset-editor-submit-bar'));

    expect(mockedUpdatePreset).not.toHaveBeenCalled();
  });
});

describe('<PresetEditorScreen /> — saving', () => {
  it('shows a spinner and ignores a repeat press while the save is in flight', async () => {
    let resolveCreate!: (preset: Preset) => void;
    mockedCreatePreset.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          resolveCreate = resolve;
        }),
    );
    renderScreen({ mode: 'create', onBack: jest.fn() });
    fireEvent.changeText(screen.getByTestId('preset-editor-name-input'), 'BTN Open');
    fireEvent.press(screen.getByTestId('chip-55+'));

    fireEvent.press(screen.getByTestId('preset-editor-submit-bar'));
    expect(screen.getByTestId('spinner')).toBeVisible();

    fireEvent.press(screen.getByTestId('preset-editor-submit-bar'));
    expect(mockedCreatePreset).toHaveBeenCalledTimes(1);

    await act(async () => {
      resolveCreate(preset());
    });
  });

  it('calls createPreset with the current name, hand range, and tags in create mode', async () => {
    mockedCreatePreset.mockResolvedValueOnce(preset());
    const onBack = jest.fn();
    renderScreen({ mode: 'create', onBack });
    fireEvent.changeText(screen.getByTestId('preset-editor-name-input'), 'BTN Open');
    fireEvent.press(screen.getByTestId('chip-55+'));
    fireEvent.press(screen.getByTestId('tag-position-BTN'));

    await act(async () => {
      fireEvent.press(screen.getByTestId('preset-editor-submit-bar'));
    });

    expect(mockedCreatePreset).toHaveBeenCalledWith(
      expect.objectContaining({
        name: 'BTN Open',
        tags: expect.objectContaining({ position: ['BTN'] }),
      }),
    );
    expect(onBack).toHaveBeenCalledTimes(1);
  });

  it('calls updatePreset with the given presetId in edit mode', async () => {
    mockedUseEditedPreset.mockReturnValue({ status: 'loaded', preset: preset() });
    mockedUpdatePreset.mockResolvedValueOnce(preset());
    const onBack = jest.fn();
    renderScreen({ mode: 'edit', presetId: 7, onBack });

    await act(async () => {
      fireEvent.press(screen.getByTestId('preset-editor-submit-bar'));
    });

    expect(mockedUpdatePreset).toHaveBeenCalledWith(
      7,
      expect.objectContaining({ name: 'BTN Open' }),
    );
    expect(onBack).toHaveBeenCalledTimes(1);
  });
});

describe('<PresetEditorScreen /> — save-failed', () => {
  it('shows an error banner, returns the bar to pressable, and preserves the typed fields', async () => {
    mockedCreatePreset.mockRejectedValueOnce(new Error('boom'));
    renderScreen({ mode: 'create', onBack: jest.fn() });
    fireEvent.changeText(screen.getByTestId('preset-editor-name-input'), 'BTN Open');
    fireEvent.press(screen.getByTestId('chip-55+'));

    await act(async () => {
      fireEvent.press(screen.getByTestId('preset-editor-submit-bar'));
    });

    expect(screen.getByTestId('preset-editor-error-banner')).toBeVisible();
    expect(screen.queryByTestId('spinner')).toBeNull();
    expect(screen.getByTestId('preset-editor-name-input').props.value).toBe('BTN Open');
    expect(screen.getByTestId('cell-55').props.accessibilityState).toMatchObject({
      selected: true,
    });
  });

  it('does not call onBack when the save fails', async () => {
    mockedCreatePreset.mockRejectedValueOnce(new Error('boom'));
    const onBack = jest.fn();
    renderScreen({ mode: 'create', onBack });
    fireEvent.changeText(screen.getByTestId('preset-editor-name-input'), 'BTN Open');
    fireEvent.press(screen.getByTestId('chip-55+'));

    await act(async () => {
      fireEvent.press(screen.getByTestId('preset-editor-submit-bar'));
    });

    expect(onBack).not.toHaveBeenCalled();
  });
});
