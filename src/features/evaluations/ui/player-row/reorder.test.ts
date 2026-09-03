import {
  clampReorderTranslateY,
  DRAG_LIFT_SCALE,
  LONG_PRESS_MIN_DURATION_MS,
  reorderIndexAt,
  reorderVisualOffset,
} from './reorder';

// this file's own stand-in for `../player-row-content/player-row-content`'s
// own `ROW_HEIGHT` (96) — not imported directly, since that module's own
// import chain reaches react-native-reanimated (`./reorder.ts`'s own doc
// comment explains why), which this suite deliberately avoids needing. every
// test below passes this in exactly where `player-row.tsx` passes its own
// import of the real constant.
const ROW_HEIGHT = 96;

describe('constants', () => {
  it('lifts the dragged row to 1.02 scale (Option A)', () => {
    expect(DRAG_LIFT_SCALE).toBe(1.02);
  });

  it('reads the platform long-press default of 500ms', () => {
    expect(LONG_PRESS_MIN_DURATION_MS).toBe(500);
  });
});

describe('clampReorderTranslateY()', () => {
  it('passes an offset within bounds through unchanged, on a three-row list', () => {
    expect(clampReorderTranslateY(1, 3, ROW_HEIGHT, 40)).toBe(40);
    expect(clampReorderTranslateY(1, 3, ROW_HEIGHT, -40)).toBe(-40);
  });

  it('clamps at the list top when the middle row is dragged past position 0', () => {
    expect(clampReorderTranslateY(1, 3, ROW_HEIGHT, -ROW_HEIGHT * 5)).toBe(-ROW_HEIGHT);
  });

  it('clamps at the list bottom when the middle row is dragged past the last index', () => {
    expect(clampReorderTranslateY(1, 3, ROW_HEIGHT, ROW_HEIGHT * 5)).toBe(ROW_HEIGHT);
  });

  it('never lets the first row travel upward at all, on any list size', () => {
    expect(clampReorderTranslateY(0, 3, ROW_HEIGHT, -10)).toBe(0);
  });

  it('never lets the last row travel downward at all, on any list size', () => {
    expect(clampReorderTranslateY(2, 3, ROW_HEIGHT, 10)).toBe(0);
  });

  it('clamps to exactly 0 on a single-row list, in either direction', () => {
    expect(clampReorderTranslateY(0, 1, ROW_HEIGHT, 40)).toBe(0);
    expect(clampReorderTranslateY(0, 1, ROW_HEIGHT, -40)).toBe(0);
  });
});

describe('reorderIndexAt()', () => {
  it('resolves back to fromIndex for an offset short of half a row', () => {
    expect(reorderIndexAt(1, ROW_HEIGHT, ROW_HEIGHT / 2 - 1)).toBe(1);
    expect(reorderIndexAt(1, ROW_HEIGHT, -(ROW_HEIGHT / 2 - 1))).toBe(1);
  });

  it('crosses to the next row exactly at half a row', () => {
    expect(reorderIndexAt(1, ROW_HEIGHT, ROW_HEIGHT / 2)).toBe(2);
  });

  it('crosses to the previous row exactly at negative half a row', () => {
    expect(reorderIndexAt(1, ROW_HEIGHT, -(ROW_HEIGHT / 2))).toBe(0);
  });

  it('crosses two rows at once for an offset past one and a half row heights', () => {
    expect(reorderIndexAt(0, ROW_HEIGHT, ROW_HEIGHT * 1.6)).toBe(2);
  });

  it('resolves to fromIndex itself for a zero offset', () => {
    expect(reorderIndexAt(2, ROW_HEIGHT, 0)).toBe(2);
  });
});

describe('reorderVisualOffset()', () => {
  it('is the raw translation itself while short of the first crossing', () => {
    expect(reorderVisualOffset(1, ROW_HEIGHT, 10)).toBe(10);
    expect(reorderVisualOffset(1, ROW_HEIGHT, -10)).toBe(-10);
  });

  it('is the residual past the nearest row boundary once a live reorder has crossed it', () => {
    // one whole row plus 20 past it: the crossed index moves by exactly
    // one row, leaving 20 as the residual that keeps the row visually
    // pinned to the finger rather than jumping a whole row height.
    expect(reorderVisualOffset(0, ROW_HEIGHT, ROW_HEIGHT + 20)).toBe(20);
    expect(reorderVisualOffset(0, ROW_HEIGHT, -(ROW_HEIGHT + 20))).toBe(-20);
  });

  it('always stays within half a row height of zero, regardless of how far the drag travelled', () => {
    expect(Math.abs(reorderVisualOffset(0, ROW_HEIGHT, ROW_HEIGHT * 5.3))).toBeLessThanOrEqual(
      ROW_HEIGHT / 2,
    );
  });

  it('is zero at rest and exactly at a settled row boundary', () => {
    expect(reorderVisualOffset(1, ROW_HEIGHT, 0)).toBe(0);
    expect(reorderVisualOffset(0, ROW_HEIGHT, ROW_HEIGHT)).toBe(0);
  });
});
