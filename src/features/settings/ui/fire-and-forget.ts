import { reportError } from '@/core/instrumentation/report-error';

/**
 * fires a promise without awaiting it, reporting a rejection instead of
 * letting it fail silently. `LanguageScreen` and `ThemeScreen` (issue #76)
 * both call a use case's persist step this way — `changeLanguage` and
 * `changeTheme` — from inside a `Pressable`'s `onPress`, which cannot itself
 * be `async` without leaving the returned promise unhandled; catching the
 * rejection here and reporting it is what stops a failed AsyncStorage write
 * from losing the user's choice silently.
 *
 * React-free and shared by both screens rather than a component, so it lives
 * beside them in `ui/` rather than in `adapter/` — the same reasoning
 * `row-position.ts`'s own comment gives for staying out of `model/`.
 */
export function fireAndForget(promise: Promise<void>): void {
  promise.catch((error: unknown) => {
    reportError(error, { tags: { module: 'settings' } });
  });
}
