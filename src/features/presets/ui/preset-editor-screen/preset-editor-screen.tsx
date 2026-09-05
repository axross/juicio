import type { ComponentProps } from 'react';
import { useCallback, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { AccessibilityInfo, ActivityIndicator, ScrollView, Text, View } from 'react-native';
import { StyleSheet, useUnistyles } from 'react-native-unistyles';

import { CheckIcon } from '@/core/icons/check-icon';
import { reportError } from '@/core/instrumentation/report-error';
import { NavBar } from '@/core/navigation/nav-bar';
import { TextField } from '@/features/feedback/ui/text-field';
import { EmptyState } from '@/shared/ui/empty-state/empty-state';
import { HandRangePane } from '@/shared/ui/hand-range-pane/hand-range-pane';
import { SubmitBar } from '@/shared/ui/submit-bar/submit-bar';

import { TAG_AXIS_ORDER, tagAxisValues } from '../../adapter/filter-presets';
import { createPreset, updatePreset } from '../../adapter/preset-storage';
import { useEditedPreset } from '../../adapter/use-edited-preset';
import { usePresetEditorFields } from '../../adapter/use-preset-editor-fields';
import { validatePresetDraft } from '../../model/preset-draft';
import { TagValueChip } from './tag-value-chip';

/**
 * the Preset editor screen (docs/specs/hand-ranges.md's "The
 * Preset Editor"): a `Name` field, a `Hand Range` section (the existing
 * rank-pair grid and shorthand chips), and a `Tags` section (one
 * multi-select chip row per tag axis), pre-filled from the given preset in
 * edit mode or empty in create mode, with a pinned Save action. Replaces
 * the field-less stub issue #176 left behind, keeping that stub's own prop
 * contract (`mode`/`presetId`/`onBack`) and its `preset-editor-nav-bar`/
 * `title`/`back`/`preset-editor-screen` testIDs unchanged — nothing else in
 * this app, and no existing e2e flow, reaches this screen any differently.
 *
 * **seven states**, matching this issue's own plan UI design section
 * exactly:
 *
 * - **loading** (edit mode only) — a centered spinner beneath the nav bar
 *   while `useEditedPreset` fetches the preset being edited; create mode
 *   never reaches this, since it passes no `presetId` for that hook to
 *   fetch.
 * - **load-failed** (edit mode only) — `EmptyState` with load-failed copy,
 *   when that fetch rejects (a since-deleted preset included); the nav
 *   bar's own back action is this state's "way back to the list", the same
 *   affordance the stub already had.
 * - **default/editable** — the fields, populated (edit) or empty (create).
 * - **invalid-to-save** — a Save press with an empty name and/or an empty
 *   hand range flags the offending field(s) inline and announces the
 *   failure, without altering any previously saved preset.
 * - **in-progress-save** — the Save bar's own `loading` spinner
 *   (`@/shared/ui/submit-bar/submit-bar.tsx`), which already ignores a
 *   repeat press; this screen's own `saveStatus` guard in `handleSave`
 *   below is a second, defensive check against the same repeat.
 * - **save-failed** — an error banner above the fields, reusing the
 *   Feedback screen's own banner treatment, with every typed field left
 *   exactly as it was.
 *
 * **its own field state — name, hand-range selection, and a per-axis tag
 * selection — lives in one hook**, `../../adapter/use-preset-editor-fields.ts`'s
 * `usePresetEditorFields`, seeded from `useEditedPreset`'s own fetched
 * preset in edit mode. Both hooks are called unconditionally on every
 * render, in both modes, per the Rules of Hooks — `presetId` being
 * `undefined` in create mode is what actually skips the fetch, not a
 * conditional call to the hook itself; see each hook's own doc comment.
 *
 * **validates on Save press only, never per keystroke** — `handleSave`
 * below is the sole caller of `../../model/preset-draft.ts`'s
 * `validatePresetDraft`, mirroring `@/features/feedback/ui/feedback-form.tsx`'s
 * identical validate-on-submit-only shape; each field's own `onChange`
 * clears that field's own error immediately, the same "watch it clear, not
 * re-validate live" rule that form already follows.
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
         * cannot construct an `'edit'` mode with no preset to edit. */
        presetId: number;
      }
  )) {
  // `presetId` only exists on `rest`'s own type in the `'edit'` arm of the
  // union above, so pulling it out here — rather than in the destructuring
  // above — is what lets this one destructure name a property absent from
  // every member of a union in one step. Read below to actually drive
  // `useEditedPreset` and `updatePreset`, not merely excluded from
  // `...props`.
  const { presetId, ...props } = rest as typeof rest & { presetId?: number };

  const { t } = useTranslation('presets');
  const { t: tNav } = useTranslation('navigation');
  const { theme } = useUnistyles();

  const editedPreset = useEditedPreset(presetId);
  const initialPreset = editedPreset.status === 'loaded' ? editedPreset.preset : undefined;
  const fields = usePresetEditorFields(initialPreset);

  const [nameError, setNameError] = useState(false);
  const [handRangeError, setHandRangeError] = useState(false);
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'failed'>('idle');

  const title = mode === 'create' ? t('editor.createTitle') : t('editor.editTitle');

  const handleSave = useCallback(() => {
    // defensive: `SubmitBar`'s own `loading` state already ignores a repeat
    // press at the button, per this screen's own doc comment.
    if (saveStatus === 'saving') {
      return;
    }

    const validation = validatePresetDraft({
      name: fields.name,
      handRange: fields.handRange,
      tags: fields.tags,
    });

    if (!validation.valid) {
      setNameError(validation.nameInvalid);
      setHandRangeError(validation.handRangeInvalid);
      // clears a stale save-failed banner the same way
      // `feedback-form.tsx`'s own `handleSubmit` `'invalid'` case clears
      // `sendError` — without this, blanking the name after a failed save
      // and pressing Save again would show the old error banner and the
      // fresh inline name error at once.
      setSaveStatus('idle');
      // the announcement is this project's stand-in for `aria-describedby`
      // — docs/conventions/accessibility.md — reaching someone whose focus
      // is still on the just-pressed Save button, not on the field(s) now
      // showing an error.
      AccessibilityInfo.announceForAccessibility(
        validation.nameInvalid && validation.handRangeInvalid
          ? t('editor.bothRequired')
          : validation.nameInvalid
            ? t('editor.nameRequired')
            : t('editor.handRangeRequired'),
      );
      return;
    }

    setNameError(false);
    setHandRangeError(false);
    setSaveStatus('saving');

    // `presetId` is guaranteed defined whenever `mode` is `'edit'` by this
    // screen's own props union — the widening cast above only loosens its
    // *type*, not the runtime guarantee that union already enforces.
    const persist =
      mode === 'edit'
        ? updatePreset(presetId!, validation.preset)
        : createPreset(validation.preset);

    persist
      .then(() => {
        onBack();
      })
      .catch((error: unknown) => {
        reportError(error, {
          tags: { feature: 'presets' },
          extra: { operation: mode === 'edit' ? 'updatePreset' : 'createPreset' },
        });
        setSaveStatus('failed');
      });
  }, [saveStatus, fields, mode, presetId, onBack, t]);

  if (mode === 'edit' && editedPreset.status === 'loading') {
    return (
      <View style={[styles.screen, style]} testID="preset-editor-screen" {...props}>
        <NavBar
          title={title}
          onBack={onBack}
          backAccessibilityLabel={tNav('back')}
          testID="preset-editor-nav-bar"
        />
        <View style={styles.centered} testID="preset-editor-loading">
          <ActivityIndicator size="large" color={theme.colors.solid.accent.rest} />
        </View>
      </View>
    );
  }

  if (mode === 'edit' && editedPreset.status === 'load-failed') {
    return (
      <View style={[styles.screen, style]} testID="preset-editor-screen" {...props}>
        <NavBar
          title={title}
          onBack={onBack}
          backAccessibilityLabel={tNav('back')}
          testID="preset-editor-nav-bar"
        />
        <EmptyState
          heading={t('editor.loadFailed.heading')}
          description={t('editor.loadFailed.description')}
          style={styles.emptyState}
          testID="preset-editor-load-failed"
        />
      </View>
    );
  }

  return (
    <View style={[styles.screen, style]} testID="preset-editor-screen" {...props}>
      <NavBar
        title={title}
        onBack={onBack}
        backAccessibilityLabel={tNav('back')}
        testID="preset-editor-nav-bar"
      />

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.content}
        testID="preset-editor-scroll"
      >
        {saveStatus === 'failed' ? (
          <View style={styles.errorBanner} testID="preset-editor-error-banner">
            <Text style={styles.errorBannerText}>{t('editor.saveFailed')}</Text>
          </View>
        ) : null}

        <TextField
          label={t('editor.nameLabel')}
          placeholder={t('editor.namePlaceholder')}
          error={nameError ? t('editor.nameRequired') : undefined}
          value={fields.name}
          // clears on any change rather than re-checking blankness, so the
          // user watches the error clear as they type — the same
          // `feedback-form.tsx`-established rule.
          onChangeText={(name) => {
            fields.setName(name);
            setNameError(false);
          }}
          testID="preset-editor-name-input"
        />

        <View style={styles.section}>
          <Text
            style={styles.sectionHeading}
            accessibilityRole="header"
            testID="hand-range-heading"
          >
            {t('editor.handRangeHeading')}
          </Text>
          <HandRangePane
            selectedRankPairs={fields.handRange}
            onSelectionChange={(next) => {
              fields.setHandRange(next);
              setHandRangeError(false);
            }}
            testID="preset-editor-hand-range"
          />
          {handRangeError ? (
            <Text style={styles.fieldError} testID="preset-editor-hand-range-error">
              {t('editor.handRangeRequired')}
            </Text>
          ) : null}
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionHeading} accessibilityRole="header" testID="tags-heading">
            {t('editor.tagsHeading')}
          </Text>
          {TAG_AXIS_ORDER.map((axis) => (
            <View key={axis} style={styles.tagAxis}>
              <Text style={styles.axisHeading} testID={`tags-axis-heading-${axis}`}>
                {t(`list.filterAxisLabel.${axis}`)}
              </Text>
              <View style={styles.tagRow} testID={`tags-row-${axis}`}>
                {tagAxisValues(axis).map((value) => (
                  <TagValueChip
                    key={value}
                    value={value}
                    active={fields.tags[axis].includes(value)}
                    onPress={(pressedValue) => fields.toggleTagValue(axis, pressedValue)}
                    testID={`tag-${axis}-${value}`}
                  />
                ))}
              </View>
            </View>
          ))}
        </View>
      </ScrollView>

      <SubmitBar
        label={t('editor.save')}
        Icon={CheckIcon}
        onPress={handleSave}
        loading={saveStatus === 'saving'}
        testID="preset-editor-submit-bar"
      />
    </View>
  );
}

const styles = StyleSheet.create((theme) => ({
  screen: {
    flex: 1,
    backgroundColor: theme.colors.background.neutral.app,
  },
  centered: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyState: {
    flex: 1,
    justifyContent: 'center',
    paddingHorizontal: theme.space.x16,
  },
  scroll: {
    flex: 1,
  },
  content: {
    padding: theme.space.x16,
    gap: theme.space.x24,
  },
  errorBanner: {
    padding: theme.space.x16,
    borderRadius: theme.radius.md,
    borderWidth: theme.borderWidth.base,
    borderColor: theme.colors.border.destructive.interactive,
    backgroundColor: theme.colors.background.destructive.subtle,
  },
  errorBannerText: {
    ...theme.typography.paragraph,
    color: theme.colors.text.destructive.high,
  },
  section: {
    gap: theme.space.x16,
  },
  // the mockup renders the `Hand Range`/`Tags` section headings with the
  // identical class as the Name field's own label (`text-field.tsx`'s
  // `label` style) — `typography.label`, not `typography.heading` — so
  // this reads that token directly rather than the visually larger one.
  sectionHeading: {
    ...theme.typography.label,
    color: theme.colors.text.neutral.high,
  },
  fieldError: {
    ...theme.typography.description,
    color: theme.colors.text.destructive.high,
  },
  tagAxis: {
    gap: theme.space.x8,
  },
  // a per-axis label (`Position`, `# of Players`, …) reads smaller and
  // muted in the mockup, distinct from `sectionHeading` above.
  axisHeading: {
    ...theme.typography.caption,
    color: theme.colors.text.neutral.low,
  },
  tagRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: theme.space.x8,
  },
}));
