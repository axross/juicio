import type { PresetTags } from './preset';
import { isBlankName, validatePresetDraft, type PresetDraft } from './preset-draft';

// a bare `{ axis: [] }` fixture, not a shared import from `../adapter/
// filter-presets.ts`'s own `EMPTY_APPLIED_TAG_FILTERS`: a `model/` test
// stays self-contained rather than reaching into `adapter/`, the tier this
// feature's own import direction (docs/conventions/directory-structure.md)
// never has `model/` depend on.
const EMPTY_TAGS: PresetTags = { position: [], players: [], stack: [], action: [] };

function draft(overrides: Partial<PresetDraft> = {}): PresetDraft {
  return {
    name: 'HJ Call against CO 4bet',
    handRange: new Set(['AA']),
    tags: EMPTY_TAGS,
    ...overrides,
  };
}

describe('isBlankName()', () => {
  it('is true for an empty string', () => {
    expect(isBlankName('')).toBe(true);
  });

  it('is true for a whitespace-only string', () => {
    expect(isBlankName('   ')).toBe(true);
  });

  it('is false for a name with visible characters', () => {
    expect(isBlankName('BTN Open')).toBe(false);
  });
});

describe('validatePresetDraft()', () => {
  it('accepts a draft with a non-empty name and at least one rank pair, trimming the name', () => {
    const result = validatePresetDraft(draft({ name: '  BTN Open  ' }));

    expect(result).toEqual({
      valid: true,
      preset: { name: 'BTN Open', handRange: new Set(['AA']), tags: EMPTY_TAGS },
    });
  });

  it('rejects an empty name, naming only the name as invalid', () => {
    const result = validatePresetDraft(draft({ name: '' }));

    expect(result).toEqual({ valid: false, nameInvalid: true, handRangeInvalid: false });
  });

  it('rejects a whitespace-only name', () => {
    const result = validatePresetDraft(draft({ name: '   ' }));

    expect(result).toEqual({ valid: false, nameInvalid: true, handRangeInvalid: false });
  });

  it('rejects an empty hand range, naming only the hand range as invalid', () => {
    const result = validatePresetDraft(draft({ handRange: new Set() }));

    expect(result).toEqual({ valid: false, nameInvalid: false, handRangeInvalid: true });
  });

  it('flags both fields at once when both are invalid', () => {
    const result = validatePresetDraft(draft({ name: '', handRange: new Set() }));

    expect(result).toEqual({ valid: false, nameInvalid: true, handRangeInvalid: true });
  });

  it('carries tags through unchecked, including every axis left empty', () => {
    const result = validatePresetDraft(draft({ tags: EMPTY_TAGS }));

    expect(result).toEqual({
      valid: true,
      preset: expect.objectContaining({ tags: EMPTY_TAGS }),
    });
  });
});
