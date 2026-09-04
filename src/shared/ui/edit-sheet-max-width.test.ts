import { PANEL_MAX_WIDTH } from '@/shared/ui/bottom-sheet/bottom-sheet';

import { editSheetMaxWidth, EDIT_SHEET_VERTICAL_RESERVE } from './edit-sheet-max-width';

// `./bottom-sheet/bottom-sheet.tsx`, imported above (via
// `./edit-sheet-max-width`, for `PANEL_MAX_WIDTH`), pulls in
// `react-native-reanimated`, which reaches into `react-native-worklets`'
// native module on import — same reason `card-fan-geometry.test.ts` needs
// this.
// eslint-disable-next-line @typescript-eslint/no-require-imports
jest.mock('react-native-worklets', () => require('react-native-worklets/src/mock'));

describe('editSheetMaxWidth()', () => {
  it('returns undefined below the existing 600px cap, in either orientation', () => {
    expect(editSheetMaxWidth(PANEL_MAX_WIDTH - 1, 300, 0, 0)).toBeUndefined();
    // a short, wide-but-not-600 viewport — the case the plan's own
    // Assumptions confirm must stay untouched, not merely a value picked
    // at random below the cap.
    expect(editSheetMaxWidth(PANEL_MAX_WIDTH - 1, 390, 0, 0)).toBeUndefined();
  });

  it('returns the height-minus-insets-minus-reserve figure at and above the cap, once it renders narrower than 600', () => {
    // a tablet in landscape: wide enough to have hit the cap, short enough
    // that the reserve pushes the result below it.
    const screenWidth = PANEL_MAX_WIDTH;
    const screenHeight = 500;
    const insetTop = 24;
    const insetBottom = 16;

    expect(editSheetMaxWidth(screenWidth, screenHeight, insetTop, insetBottom)).toBe(
      screenHeight - insetTop - insetBottom - EDIT_SHEET_VERTICAL_RESERVE,
    );
  });

  it('returns the raw figure even when it still exceeds 600px — the caller’s own maxWidth merge, not this function, is what makes that a no-op', () => {
    const screenWidth = PANEL_MAX_WIDTH;
    const screenHeight = 1000; // tall enough that the reserve still leaves well over 600
    const insetTop = 0;
    const insetBottom = 0;

    const result = editSheetMaxWidth(screenWidth, screenHeight, insetTop, insetBottom);

    expect(result).toBe(screenHeight - EDIT_SHEET_VERTICAL_RESERVE);
    expect(result).toBeGreaterThan(PANEL_MAX_WIDTH);
  });

  it('gates on screenWidth alone — a viewport at exactly the cap is treated as at or above it', () => {
    expect(editSheetMaxWidth(PANEL_MAX_WIDTH, 700, 0, 0)).toBe(700 - EDIT_SHEET_VERTICAL_RESERVE);
  });
});
