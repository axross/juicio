import { HistoryScreen } from '@/features/history/ui/history-screen/history-screen';

/**
 * the History tab's route entry point: a thin composition of
 * `HistoryScreen` and nothing else, mirroring `./index.tsx`'s own split
 * with `AnalyzeScreen`. The screen's own body, styles, and doc comment
 * live at `src/features/history/ui/history-screen/history-screen.tsx` —
 * see that file's own header comment for why (issue #180).
 */
export default function HistoryTab() {
  return <HistoryScreen />;
}
