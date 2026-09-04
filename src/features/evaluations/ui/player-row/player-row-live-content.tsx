import type { ComponentProps } from 'react';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';
import Animated from 'react-native-reanimated';

import { cardSpokenName } from '@/shared/ui/card-spoken-name';

import { usePlayerEquityResult } from '../../adapter/use-equity-evaluation';
import type { Player } from '../../model/player';
import { PlayerRowContent } from '../player-row-content/player-row-content';

/**
 * the part of `./player-row.tsx`'s own row that depends on the live equity
 * result — split out as of issue #163, purely to fix a performance defect,
 * not to change anything the row shows: **this is the exact JSX `PlayerRow`
 * used to render directly, unchanged in what it outputs.** `PlayerRow`
 * itself renders this inside its own `GestureDetector`, in place of the
 * accessible group that used to sit there directly, and renders nothing
 * else in its place — see `PlayerRow`'s own doc comment ("as of issue
 * #163...") for the fuller picture this component is one half of.
 *
 * **why this exists at all: `GestureDetector`'s own native re-sync effect
 * depends on its entire incoming `props` object, not on any one prop's own
 * identity** (`react-native-gesture-handler`'s own
 * `GestureDetector/useDetectorUpdater.ts`, confirmed against the installed
 * 2.32.0 source before this issue's plan was finalized) — so `GestureDetector`
 * re-syncs its gesture configuration to the native side, unconditionally,
 * every time *whatever renders it* re-renders, regardless of whether the
 * gesture's own configuration actually changed. Before this issue,
 * `PlayerRow` itself called `usePlayerEquityResult` and computed everything
 * below directly in its own render body — which meant `PlayerRow`, and the
 * `GestureDetector` it renders, re-rendered (and re-synced) on every one of
 * this player's own live equity-result updates, for nothing the gesture
 * itself needed to know about. Moving that subscription down into this
 * component, one level *inside* `GestureDetector`, is what fixes it:
 * `PlayerRow`'s own render body no longer reads the live result at all, so
 * it has no reason to re-render on a tick, and neither does the
 * `GestureDetector` it renders — only this component does, since it is the
 * one thing `usePlayerEquityResult` is actually called from.
 *
 * **renders `PlayerRowContent` exactly as `PlayerRow` always did** —
 * `../player-row-content/player-row-content.tsx`'s own doc comment covers
 * what that component itself lays out and why; this component's own job is
 * only to resolve `resultLabel`/`chevron`/`onDetailPress` from the live
 * result before handing them down, plus the result portion of the row's own
 * accessibility label. Everything else this component takes as props —
 * `label`/`subtitle`, the animated swipe style, the edit/delete
 * accessibility labels and their handler — is resolved by `PlayerRow`
 * itself, since none of it depends on the live result and there is nothing
 * to gain by resolving it a second time down here.
 */
export function PlayerRowLiveContent({
  player,
  label,
  subtitle,
  animatedContentStyle,
  editLabel,
  deleteLabel,
  handleAccessibilityAction,
  onPreviewPress,
  onDetailPress,
  testID,
  style,
  ...props
}: ComponentProps<typeof View> & {
  player: Player;
  /** this row's own title — `PlayerRow`'s own `analyze.playerRow.title`,
   * resolved by that caller since it doesn't depend on the live result. */
  label: string;
  /** this row's own subtitle — resolved by `PlayerRow` the same way, and
   * also read here directly for the hand-range accessibility label's own
   * `combos` interpolation below. */
  subtitle: string;
  /** `PlayerRow`'s own swipe `useAnimatedStyle` result (`translateX`'s
   * transform) — that hook's own mechanics are unchanged by this issue
   * (see `PlayerRow`'s own doc comment), only which component applies the
   * style it returns. Composed ahead of this component's own caller-`style`
   * below, per docs/conventions/component-styling.md's Animated.View
   * composition order (own/animated, then caller, last). */
  animatedContentStyle: ComponentProps<typeof Animated.View>['style'];
  /** `PlayerRow`'s own `analyze.playerRow.editAccessibilityLabel` —
   * resolved there since it doesn't depend on the live result either. */
  editLabel: string;
  /** `PlayerRow`'s own `analyze.playerRow.deleteAccessibilityLabel`, the
   * same way. */
  deleteLabel: string;
  /** `PlayerRow`'s own `handleAccessibilityAction` — routes this row's
   * `'edit'`/`'delete'` accessibility actions to `onEditRequested`/
   * `onDelete`, neither of which reads the live result, so this stays
   * built in `PlayerRow` rather than duplicated here. Named for the
   * function it forwards, not `onAccessibilityAction` — the exact name
   * `ComponentProps<typeof View>` above already carries for the native
   * prop this ultimately becomes, which a same-named prop of this
   * component's own would collide with at the type level. */
  handleAccessibilityAction: (event: { nativeEvent: { actionName: string } }) => void;
  /** `PlayerRow`'s own `handleEditPress` — fires on this row's preview tap,
   * unconditionally, exactly as `PlayerRowContent`'s own `onPreviewPress`
   * already always is; named to match that prop directly, since this
   * component does nothing but forward it. */
  onPreviewPress: () => void;
  /** `PlayerRow`'s own `handleDetailPress` — unlike `onPreviewPress` above,
   * this is not forwarded unconditionally: `PlayerRowContent`'s own
   * `onDetailPress` fires only for a hand-range row that currently has a
   * result to break down, so this component gates the value it actually
   * hands down below (`hasResult && isHandRange`) rather than `PlayerRow`
   * gating it, since neither half of that gate is available in `PlayerRow`
   * anymore. */
  onDetailPress: () => void;
  testID?: string;
}) {
  const { t } = useTranslation('analyze');
  const { t: tHandRanges } = useTranslation('handRanges');

  const isHoleCards = player.holding.kind === 'holeCards';
  const isHandRange = !isHoleCards;

  // this player's own equity result, by id — `null` whenever no result is
  // currently available (fewer than 2 players, more than 3, or an
  // evaluation not yet far enough along to have reported one). the one
  // subscription this whole split exists to move here, out of `PlayerRow` —
  // see this file's own doc comment above.
  const result = usePlayerEquityResult(player.id);
  const hasResult = result !== null;
  const resultLabel = hasResult
    ? t('playerRow.resultPercentage', { percent: Math.round(result.equity * 100) })
    : null;
  const resultPhrase = resultLabel ?? t('playerRow.resultUnavailableLabel');

  // **`chevron`/`onDetailPress` follow the result, not the holding kind
  // alone** (issue #103's own settled decision, unchanged by this issue):
  // no result at all → `'omitted'` and no detail press, regardless of
  // holding kind; a result present is what supersedes the row's own former
  // `isHandRange ? 'shown' : 'reserved'`-only logic, and only *then* does
  // the holding kind decide `'shown'` (opens the breakdown) versus
  // `'reserved'` (a hole-cards row still has no distribution to break
  // down, so it keeps the reserved, inert column it always rendered).
  const chevron = !hasResult ? 'omitted' : isHandRange ? 'shown' : 'reserved';
  const resolvedOnDetailPress = hasResult && isHandRange ? onDetailPress : undefined;

  const accessibilityLabel = isHoleCards
    ? t('playerRow.holeCardsAccessibilityLabel', {
        number: player.number,
        first: cardSpokenName(player.holding.holeCards.first, tHandRanges),
        second: cardSpokenName(player.holding.holeCards.second, tHandRanges),
        result: resultPhrase,
      })
    : t('playerRow.handRangeAccessibilityLabel', {
        number: player.number,
        combos: subtitle,
        result: resultPhrase,
      });

  return (
    // this component's own root — the exact accessible group `PlayerRow`
    // used to render directly (its own doc comment above). `testID` stays
    // the same local, fixed literal (`'content'`) `PlayerRow` always gave
    // it, rather than the caller's raw `testID` landing here unchanged: from
    // the whole row's own point of view this is still a non-root
    // descendant of `PlayerRow`'s own root (docs/conventions/
    // component-contracts.md's "A Non-Root Child Gets Its Own Local
    // testID"), even though it is now this file's own literal JSX root.
    // rest props spread first, not last, since every explicit prop below is
    // load-bearing wiring this component computes from the live result or
    // its own caller, not a mere default a caller might reasonably want to
    // override (docs/conventions/component-contracts.md's "Propagate Rest
    // Props" ordering rule).
    <Animated.View
      {...props}
      style={[animatedContentStyle, style]}
      accessible
      // a hand-range row announces itself as a button that opens its own
      // breakdown (issue #102's own Accessibility section); a hole-cards
      // row stays a plain grouped element, unchanged.
      accessibilityRole={isHandRange ? 'button' : undefined}
      accessibilityLabel={accessibilityLabel}
      accessibilityActions={[
        { name: 'edit', label: editLabel },
        { name: 'delete', label: deleteLabel },
      ]}
      onAccessibilityAction={handleAccessibilityAction}
      testID={testID ? 'content' : undefined}
    >
      <PlayerRowContent
        player={player}
        label={label}
        subtitle={subtitle}
        resultLabel={resultLabel}
        chevron={chevron}
        onPreviewPress={onPreviewPress}
        onDetailPress={resolvedOnDetailPress}
        testID={testID}
      />
    </Animated.View>
  );
}
