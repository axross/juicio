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
 * ui/preset-editor-screen/preset-editor-screen.tsx` itself is the
 * field-less stub issue #177 completes; this file only resolves the two
 * query params that stub's own `mode`/`presetId` props need.
 *
 * `mode` defaults to `'create'` for any value other than the literal string
 * `'edit'` — including the param being absent altogether, which is exactly
 * what the "new preset" action's own navigation call sends. `id` is parsed
 * with `Number(...)`, and ignored (left `undefined`) whenever that isn't a
 * finite number — a preset's own id is always a positive integer
 * (`@/features/presets/model/preset.ts`), so a malformed or missing `id` in
 * `edit` mode has nothing sound to fall back to; this stub renders anyway
 * (its own body reads nothing from `presetId` yet), and issue #177's real
 * fields are what will need to decide how to handle that case once they
 * exist.
 */
export default function PresetEditorRoute() {
  const { mode, id } = useLocalSearchParams<{ mode?: string; id?: string }>();

  const resolvedMode = mode === 'edit' ? 'edit' : 'create';
  const parsedId = id === undefined ? undefined : Number(id);
  const presetId = parsedId !== undefined && Number.isFinite(parsedId) ? parsedId : undefined;

  return (
    <PresetEditorScreen mode={resolvedMode} presetId={presetId} onBack={() => router.back()} />
  );
}
