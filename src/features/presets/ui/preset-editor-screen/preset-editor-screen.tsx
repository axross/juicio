import type { ComponentProps } from 'react';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';
import { StyleSheet } from 'react-native-unistyles';

import { NavBar } from '@/core/navigation/nav-bar';

/**
 * the Preset editor route's own field-less stub (issue #176) — this is
 * deliberately **all** this screen does today: a mode-appropriate `NavBar`
 * with a working back action, above an otherwise empty body. Real fields
 * (the `Name` input, the hand-range editor, the `Tags` section — see
 * docs/specs/hand-ranges.md's "The Preset Editor") are issue #177's own
 * scope, tracked separately; this exists only so
 * `../preset-list-screen/preset-list-screen.tsx`'s "new preset" action and
 * its own row press each have a real, correctly-parameterized navigation
 * destination rather than a dead link.
 *
 * **`mode` decides the title, nothing else** — `createTitle` for a
 * newly-started preset, `editTitle` (matching docs/specs/hand-ranges.md's
 * "Titled `Edit Preset`") for an existing one — since this stub carries no
 * behaviour that would otherwise differ between the two. `presetId` is
 * accepted (and required in `edit` mode — see this component's own prop
 * comment) purely so issue #177's own change has it already threaded
 * through the route; this stub itself never reads it.
 */
export function PresetEditorScreen({
  mode,
  onBack,
  style,
  // destructured out and intentionally unused (`_presetId`) so this
  // declared-but-not-yet-read prop is excluded from `...props` below,
  // rather than silently landing on the underlying `View` root, which
  // never asked for a `presetId` attribute — see
  // react-component-development's props reference on excluding a prop the
  // component must deliberately not forward.
  presetId: _presetId,
  ...props
}: ComponentProps<typeof View> & {
  mode: 'create' | 'edit';
  /** the preset being edited — always present in `edit` mode, always
   * absent in `create` mode. unused by this stub itself; threaded through
   * for issue #177 to read once it builds this screen's real fields. */
  presetId?: number;
  onBack: () => void;
}) {
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
