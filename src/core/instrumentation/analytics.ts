import { Identify, identify, init, track } from '@amplitude/analytics-react-native';

import { resolveAmplitudeApiKey } from './analytics-api-key';

/**
 * every product event this app tracks, named by what happened rather than
 * by the surface that fired it — a small, closed schema so a call site's
 * event name and payload are both checked at compile time (issue #211, see
 * docs/conventions/product-analytics.md). a payload of `Record<string,
 * never>` — rather than `undefined` — is what lets `trackEvent` take a
 * second argument unconditionally, with nothing to pass for an event that
 * carries no properties of its own.
 *
 * event names are Title Case in `[Noun] [Past-tense Verb]` order, per
 * Amplitude's own Data Planning Playbook
 * (https://amplitude.com/docs/data/data-planning-playbook) rather than this
 * project's generic lowercase `software-instrumentation` default — the
 * maintainer's own choice, recorded in docs/conventions/product-analytics.md.
 * a payload's own keys, by contrast, stay ordinary camelCase here — see
 * `toWireProperties` below for where they become Title Case at the wire
 * boundary.
 */
export type Events = {
  /** fired once per app launch, after the persisted analytics preference
   * (and every other persisted setting) has already been applied — see
   * `src/app/_layout.tsx`. never fired from `initAnalytics()` itself: doing
   * so would race the async preference read and could report a session for
   * a user who had actually opted out. */
  'Session Started': Record<string, never>;
  /** fired on every navigation to a new top-level route — see
   * `src/core/navigation/use-track-screen-views.ts`. `screenName` is this
   * project's own screen name, verbatim — the tab/nav-bar title the person
   * actually saw (`Analyze`, `History`, `Hand Range Preset`, `Settings`, …),
   * not an internal route or file name. */
  'Screen Viewed': { screenName: string };
  /** the board input sheet's Confirm action, Analyze's own board editor. */
  'Board Confirmed': Record<string, never>;
  /** a player added to the Analyze players list, from either tab of the
   * card/range input sheet. `method` is a closed, internal category with no
   * user-facing label of its own, so it stays a lowercase snake_case token
   * per the convention above, rather than this project's own `Holding`
   * model's `'holeCards' | 'handRange'` spelling. */
  'Player Added': { method: 'hole_cards' | 'range' };
  /** a player removed from the Analyze players list, via its row's
   * swipe-to-delete gesture or its accessibility delete action. */
  'Player Removed': Record<string, never>;
  /** a hand-range player row's own detail press opening the Equity
   * Breakdown sheet. never fires for a hole-cards row — that row has no
   * such affordance. */
  'Equity Breakdown Viewed': Record<string, never>;
};

/**
 * the two settings this app reports as Amplitude user properties rather
 * than events, per docs/conventions/product-analytics.md's event-vs-user-
 * property split: each describes who the user currently is, not something
 * that happened, and neither would be useful sliced by time. Both are
 * plain strings — `theme.ts#ThemePreference` and `i18n`'s
 * `SupportedLanguage` are features/core-layer types this module must not
 * import (docs/conventions/directory-structure.md), and both are already
 * string literal unions, so their call sites pass the value straight
 * through with no cast needed. Sent as the exact user-facing label the
 * person sees (a language's own display name), not an internal preference
 * value — see each call site.
 */
export type UserProperties = {
  language: string;
  theme: string;
};

/**
 * converts one call-site property/user-property key from this project's
 * own idiomatic camelCase (`screenName`) to the Title-Case-with-spaces form
 * Amplitude's Data Planning Playbook prescribes at the wire boundary
 * (`Screen Name`) — the one place this conversion happens, so no call site
 * ever has to spell a property key with a space in it. Splits on every
 * lowercase/digit-to-uppercase boundary a camelCase key can have, then
 * capitalizes the leading word the split leaves alone (`method` has no
 * boundary at all, and still needs its own leading capital).
 */
function toWireKey(key: string): string {
  const spaced = key.replace(/([a-z0-9])([A-Z])/g, '$1 $2');

  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
}

/** applies `toWireKey` to every key of an event payload, leaving values
 * untouched — a value is sent exactly as the call site provided it, per
 * `Events`' and `UserProperties`' own doc comments on value conventions. */
function toWireProperties(properties: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(properties).map(([key, value]) => [toWireKey(key), value]),
  );
}

let apiKeyConfigured = false;
let initialized = false;
/** the persisted analytics preference, pushed in by
 * `src/features/settings/adapter/use-analytics-preference.ts` — see that
 * module's own doc comment for why this flows from features into core
 * rather than the other way around. defaults to this project's own default
 * (enabled), matching `resolveStoredAnalyticsPreference`'s default before
 * that preference has ever been read. */
let enabled = true;

/**
 * initializes Amplitude from EXPO_PUBLIC_AMPLITUDE_API_KEY when present and
 * non-empty. safe to call even when the variable is absent: the app runs
 * normally with every `trackEvent`/`identifyUserProperty` call below
 * silently no-op'd instead.
 *
 * `autocapture` and `trackingSessionEvents` are both turned off explicitly
 * rather than left to the SDK's own default: this app fires session-start
 * and screen-view events itself, at the points its own architecture
 * already tracks readiness and navigation (see `Events` above), rather
 * than through Amplitude's own automatic instrumentation — turning them off
 * is what keeps a session or a screen view from being reported twice.
 * sending is disabled in development builds via the SDK's own `optOut`
 * option — the same role `enabled: !__DEV__` plays in `sentry.ts` — rather
 * than by skipping `init()` here: the wiring stays in place so it can be
 * turned on locally to test it, the same precedent that file's own doc
 * comment states. without this, a maintainer's own local
 * `EXPO_PUBLIC_AMPLITUDE_API_KEY`, set for this feature's manual
 * verification against a live Amplitude project, would quietly keep
 * sending real events on every later local dev session too.
 */
export function initAnalytics(): void {
  if (initialized) {
    return;
  }

  const apiKey = resolveAmplitudeApiKey(process.env.EXPO_PUBLIC_AMPLITUDE_API_KEY);

  if (!apiKey) {
    return;
  }

  apiKeyConfigured = true;
  init(apiKey, undefined, {
    autocapture: false,
    trackingSessionEvents: false,
    optOut: __DEV__,
  });
  initialized = true;
}

/**
 * the on-device analytics preference's write path into this module — see
 * `enabled`'s own comment above. called once at boot with the persisted
 * value (`src/features/settings/usecase/apply-persisted-settings.ts`) and
 * again on every tap of the Analytics screen's switch.
 */
export function setAnalyticsEnabled(value: boolean): void {
  enabled = value;
}

/**
 * reports a product event, gated on both `initAnalytics()` having found a
 * usable API key and the on-device preference being on — either absence is
 * a silent no-op, never a throw, so a call site never has to check either
 * condition itself. `name` and `properties` are both checked against
 * `Events` at compile time, so a call site can only report an event this
 * module already declares, with exactly the payload shape that event
 * carries — spelled in ordinary camelCase; `toWireProperties` above is what
 * turns it into the Title Case wire form Amplitude actually receives.
 */
export function trackEvent<Name extends keyof Events>(name: Name, properties: Events[Name]): void {
  if (!apiKeyConfigured || !enabled) {
    return;
  }

  track(name, toWireProperties(properties));
}

/**
 * sets a user property — see `UserProperties` above for which two settings
 * these are and why they are properties rather than events. gated the same
 * way `trackEvent` is, and its key goes through the same `toWireKey`
 * conversion `trackEvent`'s own payload keys do.
 */
export function identifyUserProperty<Name extends keyof UserProperties>(
  name: Name,
  value: UserProperties[Name],
): void {
  if (!apiKeyConfigured || !enabled) {
    return;
  }

  identify(new Identify().set(toWireKey(name), value));
}
