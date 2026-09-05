import type { Preset } from '../model/preset';
import {
  EMPTY_APPLIED_TAG_FILTERS,
  filterPresetsByTags,
  hasAnyAppliedTagFilter,
  removeAppliedTagValue,
  tagAxisValues,
  toggleAppliedTagValue,
  type AppliedTagFilters,
} from './filter-presets';

function preset(id: number, name: string, tags: Partial<Preset['tags']>): Preset {
  return {
    id,
    name,
    handRange: new Set(),
    tags: { position: [], players: [], stack: [], action: [], ...tags },
  };
}

describe('filterPresetsByTags()', () => {
  const btnOpen = preset(1, 'BTN Open', { position: ['BTN'], players: ['6max'], action: ['Open'] });
  const coOpen = preset(2, 'CO Open', { position: ['CO'], players: ['6max'], action: ['Open'] });
  const btn3bet = preset(3, 'BTN 3bet', { position: ['BTN'], players: ['9max'], action: ['3bet'] });
  const presets = [btnOpen, coOpen, btn3bet];

  it('returns every preset unchanged when no axis has an applied filter', () => {
    expect(filterPresetsByTags(presets, EMPTY_APPLIED_TAG_FILTERS)).toEqual(presets);
  });

  it('narrows to presets carrying any one of an axis’s applied values (OR within one axis)', () => {
    const applied: AppliedTagFilters = {
      ...EMPTY_APPLIED_TAG_FILTERS,
      position: ['BTN', 'CO'],
    };

    expect(filterPresetsByTags(presets, applied)).toEqual([btnOpen, coOpen, btn3bet]);
  });

  it('excludes a preset matching none of an axis’s applied values', () => {
    const applied: AppliedTagFilters = { ...EMPTY_APPLIED_TAG_FILTERS, position: ['SB'] };

    expect(filterPresetsByTags(presets, applied)).toEqual([]);
  });

  it('narrows further across more than one axis with an applied value (AND across axes)', () => {
    const applied: AppliedTagFilters = {
      ...EMPTY_APPLIED_TAG_FILTERS,
      position: ['BTN', 'CO'],
      action: ['Open'],
    };

    // btn3bet carries a matching position (BTN) but not a matching action
    // (3bet, not Open) — AND across axes excludes it.
    expect(filterPresetsByTags(presets, applied)).toEqual([btnOpen, coOpen]);
  });

  it('never excludes a preset on an axis left with no applied filter', () => {
    const applied: AppliedTagFilters = { ...EMPTY_APPLIED_TAG_FILTERS, players: ['9max'] };

    // only btn3bet carries `9max`; `position`/`stack`/`action` are all
    // unfiltered and so exclude nothing regardless of what each preset holds.
    expect(filterPresetsByTags(presets, applied)).toEqual([btn3bet]);
  });

  it('matches a preset carrying more than one value on the applied axis against a single applied value', () => {
    const multiPosition = preset(4, 'Multi', { position: ['BTN', 'CO'] });
    const applied: AppliedTagFilters = { ...EMPTY_APPLIED_TAG_FILTERS, position: ['CO'] };

    expect(filterPresetsByTags([multiPosition], applied)).toEqual([multiPosition]);
  });
});

describe('toggleAppliedTagValue() / removeAppliedTagValue()', () => {
  it('applies a value not yet present on that axis, leaving every other axis untouched', () => {
    const applied: AppliedTagFilters = { ...EMPTY_APPLIED_TAG_FILTERS, action: ['Open'] };

    const next = toggleAppliedTagValue(applied, 'position', 'BTN');

    expect(next).toEqual({ ...EMPTY_APPLIED_TAG_FILTERS, position: ['BTN'], action: ['Open'] });
  });

  it('un-applies a value already present on that axis', () => {
    const applied: AppliedTagFilters = { ...EMPTY_APPLIED_TAG_FILTERS, position: ['BTN', 'CO'] };

    const next = toggleAppliedTagValue(applied, 'position', 'BTN');

    expect(next).toEqual({ ...EMPTY_APPLIED_TAG_FILTERS, position: ['CO'] });
  });

  it('removeAppliedTagValue() restores only the presets the removed value alone had excluded, leaving the rest of that axis and every other axis applied', () => {
    const applied: AppliedTagFilters = {
      ...EMPTY_APPLIED_TAG_FILTERS,
      position: ['BTN', 'CO'],
      action: ['Open'],
    };

    const next = removeAppliedTagValue(applied, 'position', 'CO');

    expect(next).toEqual({ ...EMPTY_APPLIED_TAG_FILTERS, position: ['BTN'], action: ['Open'] });

    const btnOpen = preset(1, 'BTN Open', { position: ['BTN'], action: ['Open'] });
    const coOpen = preset(2, 'CO Open', { position: ['CO'], action: ['Open'] });
    // before the removal, both matched (`position` OR'd BTN/CO); after it,
    // only the preset carrying the value that survived still matches.
    expect(filterPresetsByTags([btnOpen, coOpen], applied)).toEqual([btnOpen, coOpen]);
    expect(filterPresetsByTags([btnOpen, coOpen], next)).toEqual([btnOpen]);
  });

  it('removeAppliedTagValue() is a no-op when the value is not applied on that axis', () => {
    const applied: AppliedTagFilters = { ...EMPTY_APPLIED_TAG_FILTERS, position: ['BTN'] };

    expect(removeAppliedTagValue(applied, 'position', 'SB')).toEqual(applied);
  });
});

describe('hasAnyAppliedTagFilter()', () => {
  it('is false when every axis is empty', () => {
    expect(hasAnyAppliedTagFilter(EMPTY_APPLIED_TAG_FILTERS)).toBe(false);
  });

  it('is true once any single axis carries an applied value', () => {
    expect(hasAnyAppliedTagFilter({ ...EMPTY_APPLIED_TAG_FILTERS, stack: ['100BB'] })).toBe(true);
  });
});

describe('tagAxisValues()', () => {
  it('returns the seeded catalog’s own values for a given axis, in its declared order', () => {
    expect(tagAxisValues('position')).toEqual(['UTG', 'HJ', 'CO', 'BTN', 'SB', 'BB']);
    expect(tagAxisValues('players')).toEqual(['Heads-up', '6max', '9max']);
    expect(tagAxisValues('stack')).toEqual(['200BB', '150BB', '100BB', '75BB']);
    expect(tagAxisValues('action')).toEqual(['Open', 'Call', '3bet', '4bet']);
  });
});
