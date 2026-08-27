import { readFileSync } from 'node:fs';
import path from 'node:path';

const mainTsSource = readFileSync(path.join(__dirname, 'main.ts'), 'utf-8');

/**
 * Index, in `main.ts`'s own source text, of the bare side-effect import
 * statement for `specifier` — e.g. `import '@/core/i18n';` — or -1 if no
 * such statement exists. Matching the statement itself, rather than the
 * specifier string anywhere in the file, is what keeps this from matching
 * the specifier's own name inside a neighbouring comment.
 */
function importStatementIndex(specifier: string): number {
  const escaped = specifier.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const pattern = new RegExp(`^import\\s+['"]${escaped}['"];?\\s*$`, 'm');
  const match = mainTsSource.match(pattern);

  return match?.index ?? -1;
}

function assertImported(specifier: string): number {
  const index = importStatementIndex(specifier);

  if (index === -1) {
    throw new Error(
      `main.ts no longer has a bare side-effect import of '${specifier}'. This test guards ` +
        'startup-ordering invariants by locating that exact import statement; if the import ' +
        'was intentionally rewritten (e.g. combined with named bindings), update this test to match.',
    );
  }

  return index;
}

function assertPrecedes(earlier: string, later: string, crashExplanation: string): void {
  const earlierIndex = assertImported(earlier);
  const laterIndex = assertImported(later);

  if (!(earlierIndex < laterIndex)) {
    throw new Error(
      `main.ts imports '${earlier}' after '${later}', not before it. ${crashExplanation}`,
    );
  }
}

describe('main.ts startup import order', () => {
  // Regression guard for two startup-ordering bugs this file has already
  // shipped once each — neither is caught by format, lint, or the
  // type-checker, since all of them accept either import order equally.

  it('configures Unistyles before expo-router can evaluate any route module', () => {
    assertPrecedes(
      '@/core/theme/unistyles',
      'expo-router/entry',
      'Route modules under src/app/ load lazily, through require.context, during the root ' +
        "navigator's render — and require.context walks its keys in sorted order, where " +
        "'(' (0x28) sorts before '_' (0x5F). That puts src/app/(tabs)/_layout.tsx, and the " +
        'themed StyleSheet.create it pulls in via tab-bar-item.tsx, ahead of src/app/_layout.tsx ' +
        'itself. Configuring Unistyles anywhere but this entry file crashes the app on launch with ' +
        '"Unistyles: ... no theme has been selected yet" (Sentry event JUICIO-1, release ' +
        '0.1.0-pr-11) the moment some other route happens to sort first.',
    );
  });

  it('initializes Sentry before expo-router/entry and before @/core/i18n', () => {
    const crashExplanation =
      'Sentry can only report a startup crash that happens after it initializes. Every import ' +
      "in this file runs, in source order, before any of the file's own statements do — so " +
      'placing the sentry-boot import any later leaves every import above it (including ' +
      "@/core/i18n's synchronous i18next.init and expo-localization calls, and expo-router/entry's " +
      'own module evaluation) able to crash unreported, which is exactly what shipped once already ' +
      '(fixed in 12dd457).';

    assertPrecedes('@/core/instrumentation/sentry-boot', 'expo-router/entry', crashExplanation);
    assertPrecedes('@/core/instrumentation/sentry-boot', '@/core/i18n', crashExplanation);
  });
});
