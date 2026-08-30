import { act, renderHook } from '@testing-library/react-native';

import { useHandRangeSelection } from './use-hand-range-selection';

describe('useHandRangeSelection()', () => {
  it('defaults to an empty set when no defaultValue is given', () => {
    const { result } = renderHook(() => useHandRangeSelection());

    expect(result.current[0]).toEqual(new Set());
  });

  it('starts from the given defaultValue', () => {
    const defaultValue = new Set(['AA', 'AKs']);

    const { result } = renderHook(() => useHandRangeSelection(defaultValue));

    expect(result.current[0]).toBe(defaultValue);
  });

  it('the setter updates the returned value, isolated per hook instance', () => {
    const { result: first } = renderHook(() => useHandRangeSelection());
    const { result: second } = renderHook(() => useHandRangeSelection());

    act(() => {
      first.current[1](new Set(['AA']));
    });

    expect(first.current[0]).toEqual(new Set(['AA']));
    // a second, independent instance is untouched — this hook is meant to
    // be reused across screens without one caller's own selection leaking
    // into another's.
    expect(second.current[0]).toEqual(new Set());
  });
});
