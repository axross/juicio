// registers this project's real themes and namespaces — see
// `@/features/evaluations/ui/analyze-screen/analyze-screen.test.tsx` for why
// this side-effect import must run before anything themed renders.
import '@/core/theme/unistyles';
import '@/core/i18n';
// `react-native-gesture-handler`'s own Jest mock — this screen's own
// `PresetTagPickerSheet` composes `BottomSheet`, which mounts a
// `GestureHandlerRootView` internally (see `@/shared/ui/bottom-sheet/
// bottom-sheet.test.tsx`).
import 'react-native-gesture-handler/jestSetup';

import { router } from 'expo-router';

import { StyleSheet as RNStyleSheet } from 'react-native';

import { fireEvent, render, screen, within } from '@testing-library/react-native';

import { PortalHost } from '@/shared/ui/portal/portal';

import type { PresetListStatus } from '../../adapter/use-preset-list';
import { usePresetList } from '../../adapter/use-preset-list';
import type { Preset } from '../../model/preset';
import { PresetListScreen } from './preset-list-screen';

// see `@/shared/ui/bottom-sheet/bottom-sheet.test.tsx`'s own comment on why
// both of these are lazy `require()`s inside the mock factory.
// eslint-disable-next-line @typescript-eslint/no-require-imports
jest.mock('react-native-worklets', () => require('react-native-worklets/src/mock'));
// eslint-disable-next-line @typescript-eslint/no-require-imports
jest.mock('react-native-reanimated', () => require('react-native-reanimated/mock'));

jest.mock('@/core/haptics/haptics');
jest.mock('@/core/instrumentation/report-error', () => ({ reportError: jest.fn() }));

// mirrors `@/features/settings/ui/settings-screen.test.tsx`'s own
// `expo-router` mock: calling the real `router.push` with no navigator
// mounted queues rather than throws, leaving `toHaveBeenCalledWith` nothing
// to assert against.
jest.mock('expo-router', () => ({ router: { push: jest.fn() } }));

// this screen's own data-loading hook — mocked outright so each test drives
// exactly one of `usePresetList`'s own five states directly, rather than
// seeding and querying a real database for every case; `../../adapter/
// use-preset-list.test.ts` is what actually covers that hook's own
// loading/loaded/error behaviour against the real (mocked-client) database.
jest.mock('../../adapter/use-preset-list');

const mockedUsePresetList = jest.mocked(usePresetList);
const mockedPush = jest.mocked(router.push);

function preset(id: number, name: string, tags: Partial<Preset['tags']>): Preset {
  return {
    id,
    name,
    handRange: new Set(),
    tags: { position: [], players: [], stack: [], action: [], ...tags },
  };
}

const BTN_OPEN = preset(1, 'BTN Open', { position: ['BTN'], players: ['6max'], action: ['Open'] });
const CO_OPEN = preset(2, 'CO Open', { position: ['CO'], players: ['6max'], action: ['Open'] });

function setStatus(status: PresetListStatus) {
  mockedUsePresetList.mockReturnValue(status);
}

function renderScreen() {
  return render(
    <PortalHost>
      <PresetListScreen />
    </PortalHost>,
  );
}

beforeEach(() => {
  mockedPush.mockClear();
});

describe('<PresetListScreen /> loading state', () => {
  it('shows a spinner and hides the filter row, list, and FAB', () => {
    setStatus({ status: 'loading' });
    renderScreen();

    expect(screen.getByTestId('presets-loading')).toBeTruthy();
    expect(screen.queryByTestId('presets-filter-chips')).toBeNull();
    expect(screen.queryByTestId('presets-list')).toBeNull();
    expect(screen.queryByTestId('presets-new-preset-fab')).toBeNull();
  });
});

describe('<PresetListScreen /> error state', () => {
  it('shows the error EmptyState and hides the filter row and FAB', () => {
    setStatus({ status: 'error' });
    renderScreen();

    expect(screen.getByTestId('presets-error-state')).toBeTruthy();
    expect(screen.getByTestId('heading')).toHaveTextContent("Presets couldn't load");
    expect(screen.queryByTestId('presets-filter-chips')).toBeNull();
    expect(screen.queryByTestId('presets-new-preset-fab')).toBeNull();
  });
});

describe('<PresetListScreen /> empty state (no preset ever saved)', () => {
  it('shows the empty EmptyState, the FAB, and no filter row', () => {
    setStatus({ status: 'loaded', presets: [] });
    renderScreen();

    expect(screen.getByTestId('heading')).toHaveTextContent('No presets saved yet');
    expect(screen.getByTestId('presets-new-preset-fab')).toBeTruthy();
    expect(screen.queryByTestId('presets-filter-chips')).toBeNull();
  });
});

describe('<PresetListScreen /> populated state', () => {
  it('renders one row per preset, the filter row, the FAB, and no pill row while nothing is applied', () => {
    setStatus({ status: 'loaded', presets: [BTN_OPEN, CO_OPEN] });
    renderScreen();

    expect(screen.getByText('BTN Open')).toBeTruthy();
    expect(screen.getByText('CO Open')).toBeTruthy();
    expect(screen.getByTestId('presets-filter-chips')).toBeTruthy();
    expect(screen.getByTestId('presets-new-preset-fab')).toBeTruthy();
    expect(screen.queryByTestId('presets-filter-pills')).toBeNull();
  });

  it('navigates to /preset-editor in create mode with no id when the FAB is pressed', () => {
    setStatus({ status: 'loaded', presets: [BTN_OPEN] });
    renderScreen();

    fireEvent.press(screen.getByTestId('presets-new-preset-fab'));

    expect(mockedPush).toHaveBeenCalledWith({
      pathname: '/preset-editor',
      params: { mode: 'create' },
    });
  });

  it('navigates to /preset-editor in edit mode with that preset’s own id when a row is pressed', () => {
    setStatus({ status: 'loaded', presets: [BTN_OPEN, CO_OPEN] });
    renderScreen();

    fireEvent.press(screen.getByText('CO Open'));

    expect(mockedPush).toHaveBeenCalledWith({
      pathname: '/preset-editor',
      params: { mode: 'edit', id: '2' },
    });
  });
});

describe('<PresetListScreen /> filtering', () => {
  it('opens the pressed chip’s own axis picker sheet', () => {
    setStatus({ status: 'loaded', presets: [BTN_OPEN, CO_OPEN] });
    renderScreen();

    fireEvent.press(screen.getByTestId('chip-position'));

    expect(screen.getByTestId('heading', { includeHiddenElements: true })).toHaveTextContent(
      'Position',
    );
  });

  it('narrows the list, shows a removable pill, and restores the list when that pill is removed', () => {
    setStatus({ status: 'loaded', presets: [BTN_OPEN, CO_OPEN] });
    renderScreen();

    fireEvent.press(screen.getByTestId('chip-position'));
    fireEvent.press(screen.getByTestId('value-BTN', { includeHiddenElements: true }));

    expect(screen.getByText('BTN Open')).toBeTruthy();
    expect(screen.queryByText('CO Open')).toBeNull();
    const pill = screen.getByTestId('pill-position-BTN');
    expect(pill).toBeTruthy();

    fireEvent.press(pill);

    expect(screen.getByText('BTN Open')).toBeTruthy();
    expect(screen.getByText('CO Open')).toBeTruthy();
    expect(screen.queryByTestId('presets-filter-pills')).toBeNull();
  });

  it('shows a filtered-empty state, distinct from the no-presets-at-all empty state, once an applied filter matches nothing', () => {
    setStatus({ status: 'loaded', presets: [BTN_OPEN, CO_OPEN] });
    renderScreen();

    fireEvent.press(screen.getByTestId('chip-position'));
    fireEvent.press(screen.getByTestId('value-SB', { includeHiddenElements: true }));

    const filteredEmpty = screen.getByTestId('presets-filtered-empty-state');
    expect(within(filteredEmpty).getByTestId('heading')).toHaveTextContent('No matching presets');
    expect(screen.queryByTestId('presets-empty-state')).toBeNull();
    // the filter row and its own pill stay visible — the user can still
    // adjust or remove what they applied from this state.
    expect(screen.getByTestId('presets-filter-chips')).toBeTruthy();
    expect(screen.getByTestId('pill-position-SB')).toBeTruthy();
    // still allowed to start a new preset from this state.
    expect(screen.getByTestId('presets-new-preset-fab')).toBeTruthy();
  });
});

describe('<PresetListScreen /> FAB placement', () => {
  it('positions the FAB absolutely, anchored to the screen’s own bottom-right corner', () => {
    setStatus({ status: 'loaded', presets: [BTN_OPEN] });
    renderScreen();

    const flattenedStyle = RNStyleSheet.flatten(
      screen.getByTestId('presets-new-preset-fab').props.style,
    );

    expect(flattenedStyle.position).toBe('absolute');
    expect(typeof flattenedStyle.bottom).toBe('number');
    expect(typeof flattenedStyle.right).toBe('number');
  });
});
