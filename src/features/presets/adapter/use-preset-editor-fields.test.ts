import { act, renderHook } from '@testing-library/react-native';

import type { Preset } from '../model/preset';
import { usePresetEditorFields } from './use-preset-editor-fields';

const NO_TAGS: Preset['tags'] = { position: [], players: [], stack: [], action: [] };

function preset(overrides: Partial<Preset> = {}): Preset {
  return {
    id: 7,
    name: 'BTN Open',
    handRange: new Set(['AA', 'KK']),
    tags: { position: ['BTN'], players: [], stack: [], action: ['Open'] },
    ...overrides,
  };
}

describe('usePresetEditorFields()', () => {
  it('starts empty when called with no initial preset — create mode', () => {
    const { result } = renderHook(() => usePresetEditorFields());

    expect(result.current.name).toBe('');
    expect(result.current.handRange).toEqual(new Set());
    expect(result.current.tags).toEqual(NO_TAGS);
  });

  it('starts seeded when an initial preset is already available on the first render', () => {
    const { result } = renderHook(() => usePresetEditorFields(preset()));

    expect(result.current.name).toBe('BTN Open');
    expect(result.current.handRange).toEqual(new Set(['AA', 'KK']));
    expect(result.current.tags).toEqual({
      position: ['BTN'],
      players: [],
      stack: [],
      action: ['Open'],
    });
  });

  // the render-phase reseed this hook's own doc comment describes: edit
  // mode's fetch (`use-edited-preset.ts`) resolves after this hook's own
  // first render, `initialPreset` going from `undefined` to a real `Preset`
  // on a later render of the same hook instance.
  it('reseeds its fields once the initial preset becomes available on a later render', () => {
    const { result, rerender } = renderHook(({ initial }) => usePresetEditorFields(initial), {
      initialProps: { initial: undefined as Preset | undefined },
    });

    expect(result.current.name).toBe('');

    rerender({ initial: preset() });

    expect(result.current.name).toBe('BTN Open');
    expect(result.current.handRange).toEqual(new Set(['AA', 'KK']));
    expect(result.current.tags).toEqual({
      position: ['BTN'],
      players: [],
      stack: [],
      action: ['Open'],
    });
  });

  it('does not overwrite what the user already typed on a later render carrying the same preset id', () => {
    const { result, rerender } = renderHook(({ initial }) => usePresetEditorFields(initial), {
      initialProps: { initial: preset() },
    });

    act(() => {
      result.current.setName('Renamed');
    });
    expect(result.current.name).toBe('Renamed');

    // a fresh object with the same `id` — as a re-render passing the exact
    // same fetched `Preset` reference would never trigger a reseed either,
    // but a fresh object proves this is keyed on `id`, not reference
    // identity.
    rerender({ initial: preset({ name: 'BTN Open' }) });

    expect(result.current.name).toBe('Renamed');
  });

  it('reseeds again if the initial preset changes to a different id', () => {
    const { result, rerender } = renderHook(({ initial }) => usePresetEditorFields(initial), {
      initialProps: { initial: preset({ id: 1, name: 'First' }) },
    });

    rerender({ initial: preset({ id: 2, name: 'Second' }) });

    expect(result.current.name).toBe('Second');
  });

  it('updates name via setName', () => {
    const { result } = renderHook(() => usePresetEditorFields());

    act(() => {
      result.current.setName('CO Open');
    });

    expect(result.current.name).toBe('CO Open');
  });

  it('updates the hand range via setHandRange', () => {
    const { result } = renderHook(() => usePresetEditorFields());

    act(() => {
      result.current.setHandRange(new Set(['AA']));
    });

    expect(result.current.handRange).toEqual(new Set(['AA']));
  });

  it('toggles one tag value on, leaving every other axis untouched', () => {
    const { result } = renderHook(() => usePresetEditorFields());

    act(() => {
      result.current.toggleTagValue('position', 'BTN');
    });

    expect(result.current.tags).toEqual({ position: ['BTN'], players: [], stack: [], action: [] });
  });

  it('toggles an already-selected tag value back off', () => {
    const { result } = renderHook(() => usePresetEditorFields(preset()));

    act(() => {
      result.current.toggleTagValue('position', 'BTN');
    });

    expect(result.current.tags.position).toEqual([]);
  });
});
