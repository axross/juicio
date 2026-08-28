/**
 * which corners of a row a group's own 10px radius belongs on: the first
 * row in a card gets its top corners rounded, the last gets its bottom
 * corners, a lone row gets all four, and every row in between gets none —
 * the "1px flex gap letting the screen background through as the divider"
 * shape docs/specs/settings.md and the design file draw. pure UI-layout
 * arithmetic, not a settings domain concept, so it lives beside the rows it
 * positions rather than in `../model/`.
 */
export type RowPosition = 'single' | 'top' | 'middle' | 'bottom';

export function rowPosition(index: number, length: number): RowPosition {
  if (length <= 1) {
    return 'single';
  }

  if (index === 0) {
    return 'top';
  }

  if (index === length - 1) {
    return 'bottom';
  }

  return 'middle';
}
