/**
 * `player-row.tsx`'s own swipe-to-delete rule set, kept free of React,
 * gesture-handler, and Reanimated entirely — mirroring `../../../../shared/ui/
 * selection-grid/painting.ts`'s own shape: the whole decision for one small
 * interaction, pulled out so it's testable with no gesture and no render.
 *
 * the two measured offsets below are read directly off `423:24648`'s
 * `Dismissing` variants (Figma file `vkZzv1l45PBcVi5Wp92Eqg`) — `Started`
 * puts the row at x −109, `Almost` at x −247. the design draws no third
 * rest position for `Almost`: crossing it is what this module treats as
 * committing to delete, not a place the row itself ever settles.
 */

/** the row's own resting reveal offset (`Dismissing=Started`) — where a
 * release that has travelled far enough to reveal the delete panel, but
 * not far enough to commit, settles. */
export const SWIPE_REVEAL_OFFSET = -109;

/** the commit threshold (`Dismissing=Almost`) — a release at or past this
 * offset deletes the player without a further tap, per the design's own
 * "carrying the swipe past the design's own far offset also deletes it." */
export const SWIPE_COMMIT_THRESHOLD = -247;

/**
 * halfway to `SWIPE_REVEAL_OFFSET` — the boundary a release short of the
 * commit threshold uses to decide between springing back to `0` and
 * settling at `SWIPE_REVEAL_OFFSET` instead. the design measures the two
 * named rest positions above, not a decision boundary between them; this
 * project's own choice, in the same shape `../../../../shared/ui/
 * bottom-sheet/bottom-sheet.tsx`'s own `DISMISS_DISTANCE_RATIO` already
 * takes for an identical kind of decision (a release past half of some
 * measured distance commits, short of it springs back) — reused here
 * rather than invented fresh.
 */
export const SWIPE_REVEAL_THRESHOLD = SWIPE_REVEAL_OFFSET / 2;

export type SwipeReleaseOutcome = 'restsClosed' | 'restsRevealed' | 'commitsDelete';

/**
 * the row's own release decision, pure over the drag's current offset
 * (negative, further left is further into a dismissal) — evaluated
 * against the *current* offset rather than the release gesture's own
 * translation, so re-dragging from an already-revealed row (offset
 * already `SWIPE_REVEAL_OFFSET`) resolves correctly too.
 *
 * marked `'worklet'` so it runs on the UI thread, the same reason
 * `@/core/motion/tokens`'s `motionSpring` and `./player-row.tsx`'s own
 * `clampDragOffset` are: that file's `Gesture.Pan()` never calls
 * `.runOnJS(true)`, so its `onEnd` is a real worklet and a plain function
 * it calls has to be callable there. nothing in this module touches
 * Reanimated itself, which is what makes the directive easy to leave off
 * — and nothing in this project's own gates would say so:
 * `react-native-reanimated`'s Jest mock does not enforce the UI/JS-thread
 * boundary, so the tests below pass either way, and neither lint nor the
 * type-checker models it at all. Releasing a swipe on a real device is
 * the first thing that would have failed.
 */
export function resolveSwipeRelease(offset: number): SwipeReleaseOutcome {
  'worklet';
  if (offset <= SWIPE_COMMIT_THRESHOLD) {
    return 'commitsDelete';
  }
  if (offset <= SWIPE_REVEAL_THRESHOLD) {
    return 'restsRevealed';
  }
  return 'restsClosed';
}
