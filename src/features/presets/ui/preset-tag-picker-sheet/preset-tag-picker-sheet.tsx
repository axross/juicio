import type { ComponentProps } from 'react';
import { useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { Circle, Svg } from 'react-native-svg';
import { Pressable, Text, View } from 'react-native';
import { StyleSheet, useUnistyles } from 'react-native-unistyles';

import { HapticEvent, triggerHaptic } from '@/core/haptics/haptics';
import { BottomSheet, BottomSheetBody } from '@/shared/ui/bottom-sheet/bottom-sheet';

import { tagAxisValues } from '../../adapter/filter-presets';
import type { TagAxis } from '../../model/preset';

const ROW_HEIGHT = 44;

// this component's own invented values, not a Figma measurement and not
// reused from an existing component — this file's own doc comment above
// already says this checkbox indicator has no existing precedent to
// borrow, so these three are chosen to read as a plausible ring-and-dot
// checkbox at `INDICATOR_SIZE`'s own scale rather than derived from any
// design source.
const INDICATOR_SIZE = 20;
const INDICATOR_RING_RADIUS = 8.25;
const INDICATOR_DOT_RADIUS = 4;
const INDICATOR_CENTER = INDICATOR_SIZE / 2;

/**
 * one tag axis's own multi-select value picker (issue #176's Assumptions:
 * "each of the four filter chips opens its OWN independent multi-select
 * picker... NOT one combined sheet for all four axes"). Composes the shared
 * `@/shared/ui/bottom-sheet/bottom-sheet.tsx` the way every other sheet in
 * this project does — `../preset-list-screen/preset-list-screen.tsx`
 * mounts **one** instance of this component, parametrized by whichever axis
 * is currently open (`axis`), rather than four separate always-mounted
 * sheet instances: this satisfies "each opens its own independent picker"
 * (about per-axis filtering independence, not about four literal component
 * instances) the same way `../equity-breakdown-sheet/
 * equity-breakdown-sheet.tsx` is one sheet parametrized by whichever
 * player is currently open.
 *
 * **holds no filter state of its own.** `appliedValues` is read-only —
 * every value `tagAxisValues(axis)` (`../../adapter/filter-presets.ts`)
 * lists for this axis, each shown selected or not; a press reports the
 * toggle through `onToggleValue`, named for the outcome per
 * docs/conventions/component-contracts.md, and
 * `../preset-list-screen/preset-list-screen.tsx` is what actually calls
 * `toggleAppliedTagValue`.
 *
 * **`axis` is `null` while `visible` is `false`**, the same "no payload to
 * show while closed" shape `EquityBreakdownSheet`'s own `player` prop
 * takes — this component renders an empty sheet body for that case, since
 * `BottomSheet` itself stays mounted regardless of `visible` (see its own
 * doc comment on why).
 *
 * a value row is a checkbox, not a radio — every value on an axis may be
 * selected at once (OR-within-axis, `../../adapter/filter-presets.ts`'s own
 * doc comment) — drawn with `RadioIndicator`'s own ring/dot visual language
 * (`@/features/settings/ui/radio-indicator.tsx`) since this project has no
 * existing checkbox precedent to reuse, but **not that component itself**:
 * cross-feature imports are forbidden
 * (docs/conventions/directory-structure.md), so this file draws its own,
 * local indicator rather than importing Settings' own.
 */
export function PresetTagPickerSheet({
  visible,
  axis,
  appliedValues,
  onToggleValue,
  onRequestClose,
  testID,
  style,
  ...props
}: ComponentProps<typeof View> & {
  visible: boolean;
  /** the axis this sheet is picking values for — `null` while `visible` is
   * `false`. */
  axis: TagAxis | null;
  /** every value currently applied for `axis` — empty while `axis` is
   * `null`. */
  appliedValues: readonly string[];
  /** fires with the value whose row was pressed, whether that press applies
   * or un-applies it — `../preset-list-screen/preset-list-screen.tsx`'s own
   * `toggleAppliedTagValue` call decides which. */
  onToggleValue: (value: string) => void;
  onRequestClose: () => void;
  testID?: string;
}) {
  const { t } = useTranslation('presets');

  // one fixed identity for both branches — mirroring
  // `../equity-breakdown-sheet/equity-breakdown-sheet.tsx`'s own
  // `accessibilityLabel`/`handle.accessibilityLabel`, which stay identical
  // regardless of which player that sheet is open for — rather than
  // interpolating an axis label that would read as empty in the `axis ===
  // null` branch below (unreachable in practice; see this component's own
  // doc comment).
  const sheetAccessibilityLabel = t('list.tagPickerSheet.accessibilityLabel');
  const handleAccessibilityLabel = t('list.tagPickerSheet.handle.accessibilityLabel');

  if (axis === null) {
    return (
      <BottomSheet
        visible={visible}
        onRequestClose={onRequestClose}
        handleAccessibilityLabel={handleAccessibilityLabel}
        accessibilityLabel={sheetAccessibilityLabel}
        testID={testID}
        style={style}
        {...props}
      >
        <BottomSheetBody />
      </BottomSheet>
    );
  }

  const axisLabel = t(`list.filterAxisLabel.${axis}`);

  return (
    <BottomSheet
      visible={visible}
      onRequestClose={onRequestClose}
      handleAccessibilityLabel={handleAccessibilityLabel}
      accessibilityLabel={sheetAccessibilityLabel}
      testID={testID}
      style={style}
      {...props}
    >
      <BottomSheetBody>
        <Text
          style={styles.heading}
          accessibilityRole="header"
          testID={testID ? 'heading' : undefined}
        >
          {axisLabel}
        </Text>
        {tagAxisValues(axis).map((value) => (
          <ValueRow
            key={value}
            value={value}
            selected={appliedValues.includes(value)}
            onPress={onToggleValue}
            testID={testID ? `value-${value}` : undefined}
          />
        ))}
      </BottomSheetBody>
    </BottomSheet>
  );
}

function ValueRow({
  value,
  selected,
  onPress,
  testID,
}: {
  value: string;
  selected: boolean;
  onPress: (value: string) => void;
  testID?: string;
}) {
  const handlePress = useCallback(() => {
    triggerHaptic(selected ? HapticEvent.ToggleOff : HapticEvent.ToggleOn);
    onPress(value);
  }, [onPress, selected, value]);

  return (
    <Pressable
      onPress={handlePress}
      style={styles.row}
      accessibilityRole="checkbox"
      accessibilityLabel={value}
      accessibilityState={{ checked: selected }}
      testID={testID}
    >
      <Indicator selected={selected} />
      <Text style={styles.rowLabel} numberOfLines={1}>
        {value}
      </Text>
    </Pressable>
  );
}

/** this sheet's own local checkbox indicator — see this file's own doc
 * comment for why it is not an import of `RadioIndicator`. */
function Indicator({ selected }: { selected: boolean }) {
  const { theme } = useUnistyles();

  if (selected) {
    return (
      <Svg
        width={INDICATOR_SIZE}
        height={INDICATOR_SIZE}
        viewBox={`0 0 ${INDICATOR_SIZE} ${INDICATOR_SIZE}`}
      >
        <Circle
          cx={INDICATOR_CENTER}
          cy={INDICATOR_CENTER}
          r={INDICATOR_RING_RADIUS}
          stroke={theme.colors.text.accent.brand}
          strokeWidth={1.5}
          fill="none"
        />
        <Circle
          cx={INDICATOR_CENTER}
          cy={INDICATOR_CENTER}
          r={INDICATOR_DOT_RADIUS}
          fill={theme.colors.text.accent.brand}
        />
      </Svg>
    );
  }

  return (
    <Svg
      width={INDICATOR_SIZE}
      height={INDICATOR_SIZE}
      viewBox={`0 0 ${INDICATOR_SIZE} ${INDICATOR_SIZE}`}
    >
      <Circle
        cx={INDICATOR_CENTER}
        cy={INDICATOR_CENTER}
        r={INDICATOR_RING_RADIUS}
        stroke={theme.colors.border.neutral.unselectedControl}
        strokeWidth={1.5}
        fill={theme.colors.component.neutral.restAlpha}
      />
    </Svg>
  );
}

const styles = StyleSheet.create((theme) => ({
  heading: {
    ...theme.typography.heading,
    color: theme.colors.text.neutral.high,
    marginBottom: theme.space.x16,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.space.x16,
    height: ROW_HEIGHT,
  },
  rowLabel: {
    ...theme.typography.body,
    color: theme.colors.text.neutral.high,
  },
}));
