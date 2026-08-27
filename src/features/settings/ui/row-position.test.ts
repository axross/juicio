import { rowPosition } from './row-position';

describe('rowPosition', () => {
  it('is "single" for the only row in a length-1 group', () => {
    expect(rowPosition(0, 1)).toBe('single');
  });

  it('is "top" for the first row in a longer group', () => {
    expect(rowPosition(0, 2)).toBe('top');
    expect(rowPosition(0, 3)).toBe('top');
  });

  it('is "bottom" for the last row in a longer group', () => {
    expect(rowPosition(1, 2)).toBe('bottom');
    expect(rowPosition(2, 3)).toBe('bottom');
  });

  it('is "middle" for every row strictly between the first and last', () => {
    expect(rowPosition(1, 3)).toBe('middle');
  });

  it('treats a reported length of 0 as a single row rather than throwing', () => {
    expect(rowPosition(0, 0)).toBe('single');
  });
});
