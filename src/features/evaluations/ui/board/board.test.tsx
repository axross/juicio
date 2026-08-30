// registers this project's real themes and namespaces — see
// `../../../../shared/ui/segmented-tabs/segmented-tabs.test.tsx` for why
// this side-effect import must run before anything themed renders.
import '@/core/theme/unistyles';
import '@/core/i18n';

import { fireEvent, render, screen } from '@testing-library/react-native';

import { HapticEvent, triggerHaptic } from '@/core/haptics/haptics';

import { BOARD_SLOT_COUNT } from '../../model/board';
import { Board } from './board';

jest.mock('@/core/haptics/haptics');

// an automock still needs the real `./haptics` once, to introspect its
// exports (see `settings-screen.test.tsx`'s `change-theme` comment) — and
// that reaches `@sentry/react-native` via `report-error`, which starts a
// real `setInterval` nothing here clears. mocking `report-error` too keeps
// the native SDK out entirely.
jest.mock('@/core/instrumentation/report-error', () => ({ reportError: jest.fn() }));

const mockedTriggerHaptic = jest.mocked(triggerHaptic);

beforeEach(() => {
  mockedTriggerHaptic.mockClear();
});

async function renderBoard(onEditRequest: jest.Mock = jest.fn()) {
  await render(<Board onEditRequest={onEditRequest} testID="board" />);
  return onEditRequest;
}

describe('<Board />', () => {
  it('renders one slot per community card', async () => {
    await renderBoard();

    expect(screen.getAllByTestId(/^slot-\d$/)).toHaveLength(BOARD_SLOT_COUNT);
  });

  it('gives each slot its own label naming its position and that it holds no card', async () => {
    await renderBoard();

    expect(screen.getByTestId('slot-0').props.accessibilityLabel).toBe(
      'Board card 1 is not selected',
    );
    expect(screen.getByTestId('slot-4').props.accessibilityLabel).toBe(
      'Board card 5 is not selected',
    );
  });

  it('exposes each slot as a button rather than collapsing the row into one element', async () => {
    // the row used to carry `accessible` + one label for all five slots.
    // it cannot any more: `accessible={true}` collapses every descendant
    // into one element, and five separate controls are then unreachable.
    await renderBoard();

    expect(screen.getByTestId('board').props.accessible).toBeFalsy();
    expect(screen.getByTestId('board').props.accessibilityLabel).toBeUndefined();
    for (const slot of screen.getAllByTestId(/^slot-\d$/)) {
      expect(slot.props.accessibilityRole).toBe('button');
    }
  });

  it('reports the pressed slot, so the sheet can open focused on it', async () => {
    const onEditRequest = await renderBoard();

    await fireEvent.press(screen.getByTestId('slot-3'));

    expect(onEditRequest).toHaveBeenCalledTimes(1);
    expect(onEditRequest).toHaveBeenCalledWith(3);
  });

  it('fires the primaryAction haptic on a slot press, the same event + New Player fires', async () => {
    await renderBoard();

    await fireEvent.press(screen.getByTestId('slot-0'));

    expect(mockedTriggerHaptic).toHaveBeenCalledWith(HapticEvent.PrimaryAction);
  });

  // the pressed state itself (option 2B — a slot fades while a finger is
  // down on it) has no test here, and cannot have one: `Pressable` keeps
  // its press state internally, driven by the native touch responder, and
  // neither `fireEvent.press` nor a synthetic `pressIn` reaches it — the
  // rendered slot resolves to its resting style throughout, verified
  // against this suite rather than assumed. that leaves the fade to the
  // manual device check the plan already schedules it for, which is also
  // the only thing that can judge whether so subtle a signal reads at all.
  // what is asserted instead is what actually carries "this is pressable"
  // to a screen reader: the button role above.
});
