import { AnalyzeScreen } from '@/features/analyze/ui/analyze-screen';

/**
 * the Analyze tab's route entry point: a thin composition of
 * `AnalyzeScreen` and nothing else. The screen's own body, styles, and
 * doc comment live at `src/features/analyze/ui/analyze-screen.tsx` — see
 * that file's own header comment for why (issue #93).
 */
export default function AnalyzeTab() {
  return <AnalyzeScreen />;
}
