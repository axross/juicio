import { beginPaint, continuePaint } from './selection-grid-paint';

describe('beginPaint()', () => {
  it('decides "select" and adds the key when the touched cell starts unselected', () => {
    const { mode, selected } = beginPaint(new Set<string>(), 'AKs');

    expect(mode).toBe('select');
    expect(selected).toEqual(new Set(['AKs']));
  });

  it('decides "deselect" and removes the key when the touched cell starts selected', () => {
    const { mode, selected } = beginPaint(new Set(['AKs', 'QQ']), 'AKs');

    expect(mode).toBe('deselect');
    expect(selected).toEqual(new Set(['QQ']));
  });

  it('does not mutate the set it was given', () => {
    const original = new Set(['AKs']);

    beginPaint(original, 'AKs');

    expect(original).toEqual(new Set(['AKs']));
  });
});

describe('continuePaint()', () => {
  it('adds the key and reports a change when painting "select" over an unselected cell', () => {
    const { selected, changed } = continuePaint(new Set<string>(), 'AKs', 'select');

    expect(changed).toBe(true);
    expect(selected).toEqual(new Set(['AKs']));
  });

  it('removes the key and reports a change when painting "deselect" over a selected cell', () => {
    const { selected, changed } = continuePaint(new Set(['AKs']), 'AKs', 'deselect');

    expect(changed).toBe(true);
    expect(selected).toEqual(new Set());
  });

  it('reports no change, and returns the same set reference, when the cell is already at the "select" target', () => {
    const original = new Set(['AKs']);

    const { selected, changed } = continuePaint(original, 'AKs', 'select');

    expect(changed).toBe(false);
    expect(selected).toBe(original);
  });

  it('reports no change, and returns the same set reference, when the cell is already at the "deselect" target', () => {
    const original = new Set<string>();

    const { selected, changed } = continuePaint(original, 'AKs', 'deselect');

    expect(changed).toBe(false);
    expect(selected).toBe(original);
  });

  it('does not mutate the set it was given', () => {
    const original = new Set<string>();

    continuePaint(original, 'AKs', 'select');

    expect(original).toEqual(new Set());
  });

  it('does not toggle a cell back off when a wobbling drag crosses it twice in one paint', () => {
    // simulates one continuous drag: begin on an unselected cell (mode
    // "select"), cross into a second unselected cell, then wobble back
    // across the boundary into the first cell again. the first cell must
    // stay selected — a naive per-crossing toggle would flip it back off.
    const { mode, selected: afterBegin } = beginPaint(new Set<string>(), 'AKs');
    expect(mode).toBe('select');

    const afterCrossingIntoSecond = continuePaint(afterBegin, 'AKo', mode);
    expect(afterCrossingIntoSecond.changed).toBe(true);
    expect(afterCrossingIntoSecond.selected).toEqual(new Set(['AKs', 'AKo']));

    const afterWobblingBackToFirst = continuePaint(afterCrossingIntoSecond.selected, 'AKs', mode);
    expect(afterWobblingBackToFirst.changed).toBe(false);
    expect(afterWobblingBackToFirst.selected).toEqual(new Set(['AKs', 'AKo']));

    const afterWobblingOnceMore = continuePaint(afterWobblingBackToFirst.selected, 'AKo', mode);
    expect(afterWobblingOnceMore.changed).toBe(false);
    expect(afterWobblingOnceMore.selected).toEqual(new Set(['AKs', 'AKo']));
  });

  it('does not re-toggle a cell back on when a wobbling deselect drag crosses it twice', () => {
    const start = new Set(['AKs', 'AKo']);

    const { mode, selected: afterBegin } = beginPaint(start, 'AKs');
    expect(mode).toBe('deselect');

    const afterCrossingIntoSecond = continuePaint(afterBegin, 'AKo', mode);
    expect(afterCrossingIntoSecond.changed).toBe(true);
    expect(afterCrossingIntoSecond.selected).toEqual(new Set());

    const afterWobblingBack = continuePaint(afterCrossingIntoSecond.selected, 'AKs', mode);
    expect(afterWobblingBack.changed).toBe(false);
    expect(afterWobblingBack.selected).toEqual(new Set());
  });
});
