import { act, renderHook } from '@testing-library/react-native';

import { useHoleCardsSelection } from './use-hole-cards-selection';

describe('useHoleCardsSelection()', () => {
  it('defaults to two empty slots when no defaultValue is given', () => {
    const { result } = renderHook(() => useHoleCardsSelection());

    expect(result.current[0]).toEqual([null, null]);
  });

  it('starts from the given defaultValue', () => {
    const defaultValue: readonly [{ rank: 'A'; suit: 's' }, null] = [
      { rank: 'A', suit: 's' },
      null,
    ];

    const { result } = renderHook(() => useHoleCardsSelection(defaultValue));

    expect(result.current[0]).toBe(defaultValue);
  });

  it('the setter updates the returned value, isolated per hook instance', () => {
    const { result: first } = renderHook(() => useHoleCardsSelection());
    const { result: second } = renderHook(() => useHoleCardsSelection());

    act(() => {
      first.current[1]([{ rank: 'A', suit: 's' }, null]);
    });

    expect(first.current[0]).toEqual([{ rank: 'A', suit: 's' }, null]);
    // a second, independent instance is untouched.
    expect(second.current[0]).toEqual([null, null]);
  });
});
