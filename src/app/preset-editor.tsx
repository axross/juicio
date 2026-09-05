import { router, useLocalSearchParams } from 'expo-router';

import { PresetEditorScreen } from '@/features/presets/ui/preset-editor-screen/preset-editor-screen';

/**
 * the Preset editor's route entry point (issue #176): a sibling of
 * `feedback.tsx`/`settings-language.tsx`, outside the `(tabs)` group — being
 * outside that group is what hides the tab bar, exactly as it does for
 * those two. `../features/presets/ui/preset-list-screen/
 * preset-list-screen.tsx` is this route's only navigator today, in both
 * create mode (its own "new preset" action, no `id` param) and edit mode
 * (a row press, `id` set to that preset's own id) — `../features/presets/
 * ui/preset-editor-screen/preset-editor-screen.tsx` is now the real editor
 * issue #177 built (no longer issue #176's field-less stub); this file only
 * resolves the two query params its `mode`/`presetId` props need.
 *
 * `mode` defaults to `'create'` for any value other than the literal string
 * `'edit'` **with a parseable `id` alongside it** — including the `mode`
 * param being absent altogether, which is exactly what the "new preset"
 * action's own navigation call sends. `id` is parsed with `Number(...)`, and
 * treated as absent whenever that isn't a finite number — a preset's own id
 * is always a positive integer (`@/features/presets/model/preset.ts`), so a
 * malformed or missing `id` has nothing sound to fall back to.
 * `mode=edit` with no usable `id` falls back to `create` mode, since
 * `../features/presets/ui/preset-editor-screen/preset-editor-screen.tsx`'s
 * own props are a discriminated union that requires `presetId` whenever
 * `mode` is `'edit'` — this route resolves both params together into one
 * `screenProps` value of that same union before rendering. Every real
 * navigation into this route already sends a matching pair (`../features/presets/ui/
 * preset-list-screen/preset-list-screen.tsx`'s own `handleOpenPreset` always
 * sends both), so this fallback is reachable only from a hand-typed or
 * otherwise malformed URL — the real editor renders anyway, just titled as
 * a new preset instead of a stale "Edit Preset" over nothing; issue #177's
 * real fields kept this same fallback rather than adding anything more for
 * that malformed-URL case.
 */
export default function PresetEditorRoute() {
  const { mode, id } = useLocalSearchParams<{ mode?: string; id?: string }>();

  const parsedId = id === undefined || id === '' ? undefined : Number(id);
  const presetId = parsedId !== undefined && Number.isFinite(parsedId) ? parsedId : undefined;

  const screenProps =
    mode === 'edit' && presetId !== undefined
      ? ({ mode: 'edit', presetId } as const)
      : ({ mode: 'create' } as const);

  return <PresetEditorScreen {...screenProps} onBack={() => router.back()} />;
}
