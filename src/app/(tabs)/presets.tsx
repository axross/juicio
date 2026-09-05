import { PresetListScreen } from '@/features/presets/ui/preset-list-screen/preset-list-screen';

/**
 * the Presets tab (issue #176): renders the Preset list screen, replacing
 * the former native-job-engine demo placeholder outright — see
 * `docs/specs/hand-ranges.md`'s "The Preset List" and
 * `docs/specs/navigation.md`. `PresetListScreen` owns its own nav bar,
 * layout, and every one of its five states; this route is a thin entry
 * point, the same shape every other tab route in this project already
 * takes.
 */
export default function PresetsScreen() {
  return <PresetListScreen />;
}
