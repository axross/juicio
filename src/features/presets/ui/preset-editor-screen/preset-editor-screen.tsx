import type { ComponentProps } from 'react';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';
import { StyleSheet } from 'react-native-unistyles';

import { NavBar } from '@/core/navigation/nav-bar';

/**
 * the Preset editor route's own field-less stub — this is deliberately
 * **all** this screen does today: a mode-appropriate `NavBar` with a
 * working back action, above an otherwise empty body. Real fields (the
 * `Name` input, the hand-range editor, the `Tags` section — see
 * docs/specs/hand-ranges.md's "The Preset Editor") are not built yet; this
 * exists only so `../preset-list-screen/preset-list-screen.tsx`'s "new
 * preset" action and its own row press each have a real,
 * correctly-parameterized navigation destination rather than a dead link.
 *
 * **`mode` decides the title, nothing else** — `createTitle` for a
 * newly-started preset, `editTitle` (matching docs/specs/hand-ranges.md's
 * "Titled `Edit Preset`") for an existing one — since this stub carries no
 * behaviour that would otherwise differ between the two. `presetId` is
 * accepted (and required in `edit` mode — see this component's own prop
 * comment) purely so it is already threaded through the route once this
 * screen's real fields are built; this stub itself never reads it.
 */
export function PresetEditorScreen({
  mode,
  onBack,
  style,
  ...rest
}: ComponentProps<typeof View> & {
  onBack: () => void;
} & (
    | { mode: 'create' }
    | {
        mode: 'edit';
        /** the preset being edited — required whenever `mode` is `'edit'`,
         * and absent whenever it is `'create'`, enforced by this
         * discriminated union rather than merely documented, so a caller
         * cannot construct an `'edit'` mode with no preset to edit. unused
         * by this stub itself; threaded through for this screen's real
         * fields to read once they're built. */
        presetId: number;
      }
  )) {
  // TypeScript refuses to destructure a property absent from every member
  // of a union in one step, so `presetId` is pulled out here via a
  // widening cast — this changes nothing about `rest`'s runtime shape, and
  // keeps `presetId` out of `...props` below so it never lands on the
  // underlying `View` root.
  const { presetId: _presetId, ...props } = rest as typeof rest & { presetId?: number };

  const { t } = useTranslation('presets');
  const { t: tNav } = useTranslation('navigation');

  const title = mode === 'create' ? t('editor.createTitle') : t('editor.editTitle');

  return (
    <View style={[styles.screen, style]} testID="preset-editor-screen" {...props}>
      <NavBar
        title={title}
        onBack={onBack}
        backAccessibilityLabel={tNav('back')}
        testID="preset-editor-nav-bar"
      />
    </View>
  );
}

const styles = StyleSheet.create((theme) => ({
  screen: {
    flex: 1,
    backgroundColor: theme.colors.background.neutral.app,
  },
}));
