import { useState } from 'react';
import type { Dispatch, SetStateAction } from 'react';

import type { RankPairKey } from '@/shared/model/rank-pair';

/**
 * dedicated state-management hook for a hand range's own rank-pair
 * selection — a leaf hook: takes the `defaultValue` the caller starts from
 * and hands back the current value and its setter, exactly `useState`'s
 * own shape. it exists so this state — not merely the `HandRangePane`
 * component that renders it — is reusable across whatever screen wants a
 * hand-range selection of its own (the card/range input sheet today; a
 * future preset editor is exactly the kind of second caller this hook is
 * for), each isolated from every other caller's instance, under one name
 * every such caller shares instead of re-declaring the same
 * `useState<ReadonlySet<RankPairKey>>` call site by site.
 */
export function useHandRangeSelection(
  defaultValue: ReadonlySet<RankPairKey> = new Set(),
): readonly [ReadonlySet<RankPairKey>, Dispatch<SetStateAction<ReadonlySet<RankPairKey>>>] {
  return useState<ReadonlySet<RankPairKey>>(defaultValue);
}
