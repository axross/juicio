import type { ComponentProps } from 'react';
import { useCallback, useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { AccessibilityInfo, Pressable, Text, View } from 'react-native';
import { StyleSheet } from 'react-native-unistyles';

import { usePortal } from '@/shared/ui/portal/portal';

// how long the toast stays up before it clears itself with no interaction —
// the plan's own "roughly five seconds" (issue #99), an implementer's
// choice with no design-file source, the same status `board.tsx`'s
// `SLOT_PRESSED_OPACITY` and `bottom-sheet.tsx`'s scrim both carry. named as
// a constant, with this comment, rather than a bare literal at its one call
// site below.
const AUTO_CLEAR_DELAY_MS = 5000;

// `TabBar`'s own total height, duplicated rather than imported — the same
// "duplicate the one-off measured pixel value, don't centralise it" shape
// `../../../hand-ranges/ui/holding-input-sheet/holding-input-sheet.tsx`'s
// own top-of-file comment already states for a fixed figure with one
// reader. 56 is `src/core/navigation/tab-bar.tsx`'s own fixed per-cell
// content height (that component's own doc comment: 8px top padding + 24px
// icon + 4px gap + 16px label line height + 4px bottom padding); `rt.insets
// .bottom` in `styles.root` below is the same safe-area inset that
// component adds on top of it. `GAP_ABOVE_TAB_BAR` is what keeps this card
// floating clear of the bar rather than resting flush against it — the
// plan's own "16px insets," and, like the 56 above, an implementer's
// choice: the design file draws no toast at all, so there is no measured
// value to reproduce. Whether this actually clears the tab bar on a real
// device is a manual check, not something RNTL's layout-free renderer can
// confirm — see docs/conventions/testing.md.
const TAB_BAR_CONTENT_HEIGHT = 56;
const GAP_ABOVE_TAB_BAR = 16;

/**
 * the Analyze screen's own toast (issue #99): option B3 of the design
 * exhibit — a surface card carrying the theme's `Sheet` effect, a
 * destructive-toned round icon chip at its leading edge, and one sentence
 * of message text beside it. Reports a board or a player sheet closed at a
 * card count the app discarded, since neither sheet had anywhere else to
 * say so before this (`../../ui/analyze-screen/analyze-screen.tsx`'s own
 * doc comment).
 *
 * **the exhibit drew B3 with a bold title line above a detail line; this
 * ships one sentence instead.** The approved copy
 * (docs/conventions/design-system.md's Japanese Copy table) is a single
 * sentence per trigger, not a title-plus-detail pair, so this component
 * keeps the card, the shadow, and the leading chip, and holds that one
 * sentence beside the chip — the plan's own recorded departure from the
 * exhibit.
 *
 * **`message` is this component's whole controlling prop, not a `visible`
 * boolean plus separate text.** `null` renders nothing; a string renders
 * the card with that text. `../../ui/analyze-screen/analyze-screen.tsx`
 * holds one `toastMessage` slot, not a queue, which is what gives this
 * component its "one at a time" rule for free: a second dismissal while a
 * toast is showing overwrites that one slot with a new string rather than
 * appending to a list, and the effect below restarts its own clock any
 * time `message` changes to a new value, non-null included.
 *
 * **renders through `@/shared/ui/portal/`, the same primitive
 * `../../../../shared/ui/bottom-sheet/bottom-sheet.tsx` uses**, so it paints
 * above the tab bar rather than being clipped to whatever screen renders
 * it — this component always returns `null`; its actual output renders
 * through `<PortalHost />` instead. Unlike that sheet, this card is
 * positioned to float *above* the tab bar rather than over it — see
 * `TAB_BAR_CONTENT_HEIGHT`'s own comment — unaccompanied by any dimming
 * backdrop or drag gesture: nothing here blocks touches to the screen
 * beneath it, and nothing here needs `react-native-gesture-handler` at all.
 *
 * **its props type still extends `ComponentProps<typeof Pressable>`, even
 * though this function returns `null`.** The literal JSX return has no root
 * child for docs/conventions/component-contracts.md's props-inheritance
 * rule to read against — but this component does construct a real root
 * `Pressable` (`styles.root` below), just hands that tree to `usePortal`
 * instead of returning it directly, the same non-obvious choice
 * `bottom-sheet.tsx`'s own doc comment explains for its own root `View`.
 * The whole card is that one `Pressable`: **a tap anywhere on it clears it
 * immediately**, per the plan, so there is no separate close affordance
 * inside it to carry its own root.
 *
 * **fires no haptic.** The sheet whose dismissal raised this toast already
 * fired its own `sheetClose` haptic on the same interaction
 * (docs/conventions/haptics.md), and that document records this project as
 * having deliberately not settled an event for a non-destructive warning
 * — a gap this component does not close.
 */
export function Toast({
  message,
  onClear,
  testID,
  style,
  ...props
}: ComponentProps<typeof Pressable> & {
  /** the sentence to show, or `null` for no toast at all — see this
   * component's own doc comment. Resolved by the caller
   * (`../../ui/analyze-screen/analyze-screen.tsx`), which is what knows
   * which of the plan's approved strings a given dismissal reason maps
   * to; this component renders whatever string it is handed. */
  message: string | null;
  /** fires exactly once per toast shown — whichever comes first, the
   * five-second clock (`AUTO_CLEAR_DELAY_MS` above) or a tap on the card
   * — per docs/conventions/component-contracts.md's "exactly one outcome
   * callback, exactly once" rule. Named for the outcome
   * ("the message was cleared"), not the mechanism: the plan's own
   * vocabulary already calls both paths "clearing" the toast, so there is
   * one outcome here, not two. The caller's own responsibility is setting
   * whatever state fed `message` back to `null`; this component holds no
   * state of its own for that. */
  onClear: () => void;
  testID?: string;
}) {
  const { t } = useTranslation('analyze');

  // the latest `onClear`, read from the timer's own callback below without
  // making it a dependency of the effect that schedules that timer — see
  // that effect's own comment for why. plain `useRef`, the same choice
  // `bottom-sheet.tsx`'s own `isClosingRef` doc comment makes and for the
  // same reason: this project's `react-native-reanimated/mock` aside,
  // nothing here needs a shared value, but a ref mutated outside render
  // (here, inside a `useEffect`) and read from a later callback is exactly
  // what a plain ref is for.
  const onClearRef = useRef(onClear);
  useEffect(() => {
    onClearRef.current = onClear;
  }, [onClear]);

  // the pending auto-clear timer's own id, or `null` once it has fired or
  // been cancelled — read and cleared from `handlePress` below too, which
  // is what makes "exactly one outcome callback, exactly once"
  // (docs/conventions/component-contracts.md) hold regardless of how
  // quickly the caller reacts to `onClear` by setting `message` back to
  // `null`: without this, a tap that lands in the same tick the five
  // -second timer was already due to fire could still let that timer's own
  // callback run before the caller's own state update unmounts this
  // effect, calling `onClear` a second time for the one toast shown.
  const clearTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (message === null) {
      return;
    }

    // announces itself to VoiceOver/TalkBack the moment it appears, per
    // the plan and docs/conventions/accessibility.md's own precedent
    // (`../../../feedback/ui/feedback-form.tsx`'s `handleSubmit`, the only
    // other caller of `announceForAccessibility` in this project): nothing
    // here moves a screen reader's focus onto this card, so the
    // announcement is what reaches someone who never finds it by touch.
    // never `accessibilityLiveRegion` — docs/conventions/accessibility.md
    // documents that API `@platform android`-only, which would announce
    // on Android and say nothing at all on iOS.
    AccessibilityInfo.announceForAccessibility(message);

    clearTimerRef.current = setTimeout(() => {
      clearTimerRef.current = null;
      onClearRef.current();
    }, AUTO_CLEAR_DELAY_MS);
    return () => {
      if (clearTimerRef.current !== null) {
        clearTimeout(clearTimerRef.current);
        clearTimerRef.current = null;
      }
    };
    // deliberately keyed on `message` alone. `onClear` is read through
    // `onClearRef` instead of listed here, so a caller re-rendering with a
    // fresh inline `onClear` closure (`() => setToastMessage(null)`, say)
    // never restarts this clock on its own — only a genuine change to
    // `message` does, which is also the one thing that is supposed to
    // restart it (a second dismissal replacing the toast that is showing).
    // no `react-hooks/exhaustive-deps` suppression needed here: the rule
    // only flags a value the effect body references directly, and this one
    // reads `onClear` through the ref instead, which the rule doesn't
    // track — unlike `bottom-sheet.tsx`'s own comparable effect, which
    // does need one.
  }, [message]);

  // cancels the pending auto-clear timer before reporting the outcome —
  // see `clearTimerRef`'s own comment above for why this is what actually
  // keeps a tap from ever letting the timer also fire for the same toast.
  const handlePress = useCallback(() => {
    if (clearTimerRef.current !== null) {
      clearTimeout(clearTimerRef.current);
      clearTimerRef.current = null;
    }
    onClear();
  }, [onClear]);

  usePortal(
    message === null ? null : (
      // `style` is pulled out of the rest spread and merged via array
      // syntax, this component's own `styles.root` first, the caller's
      // last, so a caller extending it doesn't wipe the card's own
      // floating position; every other rest prop, `testID` included,
      // spreads last (default ordering), letting a caller override an
      // explicit default — `accessibilityRole` below, say. `style` is
      // typed as `Pressable`'s own — a plain style *or* a function of its
      // press state — so it's normalised inside this render-prop form
      // before merging, the same way `docs/conventions/component-styling.md`'s
      // `Pressable` row requires and `board.tsx`'s own `BoardSlot` already
      // does.
      <Pressable
        style={(state) => [styles.root, typeof style === 'function' ? style(state) : style]}
        onPress={handlePress}
        accessibilityRole="button"
        accessibilityLabel={t('toast.dismissAccessibilityLabel')}
        testID={testID}
        {...props}
      >
        {
          // decorative: the message `Text` below already carries what
          // happened, and this component's one accessible element is the
          // root `Pressable` above (see its own `accessibilityLabel`) —
          // matching `bottom-sheet.tsx`'s own handle, whose drawn pill
          // similarly carries no accessible text of its own.
        }
        <View style={styles.chip} testID={testID ? 'chip' : undefined}>
          <Text style={styles.chipGlyph}>!</Text>
        </View>
        <Text style={styles.message} testID={testID ? 'message' : undefined}>
          {message}
        </Text>
      </Pressable>
    ),
  );

  return null;
}

/** derived from the component's own argument type — per
 * docs/conventions/component-contracts.md's props-declaration rule — so
 * this stays a single source of truth rather than a hand-duplicated copy. */
export type ToastProps = ComponentProps<typeof Toast>;

// the exhibit's own `.toast-card` rule measures a 10px gap and a 10px/12px
// (vertical/horizontal) padding, neither of which is one of `theme.space`'s
// 4/8px-grid steps — reproduced faithfully below rather than nudged onto
// the nearest step, per docs/conventions/design-system.md's Spacing and
// Radius section: this manifest's own mockup CSS *is* the specification
// for option B3, so these two are read off it the same way a Figma
// measurement would be, not implementer's choices the way
// `TAB_BAR_CONTENT_HEIGHT`/`GAP_ABOVE_TAB_BAR` above are.
const CARD_GAP = 10;
const CARD_PADDING_VERTICAL = 10;

const styles = StyleSheet.create((theme, rt) => ({
  // this component renders through `<PortalHost />` (`usePortal` above),
  // painting outside its caller's own layout entirely — its caller is
  // therefore not in a position to place it, which is why this root sets
  // its own `position: 'absolute'` and its own insets rather than taking
  // placement from a caller the way docs/conventions/component-styling.md's
  // "Placement Is the Caller's" rule otherwise requires. `bottom-sheet.tsx`'s
  // own root states the identical exception for the identical reason.
  root: {
    position: 'absolute',
    left: Math.max(theme.space.x16, rt.insets.left),
    right: Math.max(theme.space.x16, rt.insets.right),
    bottom: TAB_BAR_CONTENT_HEIGHT + rt.insets.bottom + GAP_ABOVE_TAB_BAR,
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: CARD_GAP,
    borderRadius: theme.radius.lg,
    borderWidth: theme.borderWidth.base,
    borderColor: theme.colors.border.neutral.subtle,
    backgroundColor: theme.colors.background.neutral.app,
    paddingVertical: CARD_PADDING_VERTICAL,
    paddingHorizontal: theme.space.x12,
    boxShadow: theme.effects.sheet,
  },
  chip: {
    width: 20,
    height: 20,
    borderRadius: theme.radius.full,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: theme.colors.solid.destructive.rest,
  },
  // a single decorative glyph, not prose copy — docs/conventions/
  // design-system.md's Typography table governs text content, which this
  // isn't; this stays a plain inline size rather than reaching for a named
  // `theme.typography` role the way `styles.message` below does. its face
  // is still `theme.fontFaces.bold`, the same named token every typography
  // role reaches for (`../../../../core/theme/tokens.ts`), rather than a
  // numeric `fontWeight` — carrying one alongside a named face risks a
  // synthesised heavier style on top of an already-heavy one.
  chipGlyph: {
    fontSize: 12,
    fontFamily: theme.fontFaces.bold,
    color: theme.colors.text.destructive.onSolid,
  },
  // reuses the existing `description` role (14, Regular, 18px line height)
  // rather than adding a new one — the same reuse
  // docs/conventions/design-system.md's own Typography section already
  // records for the hand-range sheet's card pair count, and for the same
  // reason: a new role is warranted only once an existing one can't serve
  // the call site, and this compact, secondary-register sentence is
  // exactly what `description` already exists for. `text.neutral.high`,
  // not `.low`: the exhibit split this into a high-contrast title and a
  // low-contrast detail line; collapsed into this component's one sentence
  // (this component's own doc comment on the departure), the high-contrast
  // colour is the closer match for text carrying the toast's whole message
  // rather than a subordinate detail beneath a title.
  message: {
    ...theme.typography.description,
    flex: 1,
    color: theme.colors.text.neutral.high,
  },
}));
