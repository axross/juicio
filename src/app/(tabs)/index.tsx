import { AnalyzeScreen } from '@/features/evaluations/ui/analyze-screen';

/**
 * the Analyze tab's route entry point: a thin composition of
 * `AnalyzeScreen` and nothing else. The screen's own body, styles, and
 * doc comment live at `src/features/evaluations/ui/analyze-screen.tsx` —
 * see that file's own header comment for why (PR #93).
 */
export default function AnalyzeTab() {
  return <AnalyzeScreen />;
}
