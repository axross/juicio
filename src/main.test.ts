import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';

const mainTsPath = path.join(__dirname, 'main.ts');
const mainTsSource = readFileSync(mainTsPath, 'utf-8');
const appDir = path.join(__dirname, 'app');

/**
 * Every import declaration's module specifier in `main.ts`, in source order.
 * Matches both a bare side-effect import (`import 'x';`) and a named one
 * (`import { y } from 'x';`), since `main.ts` has one of each.
 */
function importSpecifiers(): string[] {
  const pattern = /^import\s+(?:[^'"]*from\s+)?['"]([^'"]+)['"];?\s*$/gm;

  return [...mainTsSource.matchAll(pattern)].map((match) => match[1]);
}

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

/**
 * Every `.ts`/`.tsx` file under `src/app/`, recursively, as absolute paths.
 * Route modules are discovered from disk rather than from a fixed list, so
 * a newly added route is covered automatically.
 */
function appSourceFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const entryPath = path.join(dir, entry.name);

    if (entry.isDirectory()) {
      return appSourceFiles(entryPath);
    }

    return /\.tsx?$/.test(entry.name) ? [entryPath] : [];
  });
}

describe('main.ts startup import order', () => {
  // Regression guard for two startup-ordering bugs this file has already
  // shipped once each — neither is caught by format, lint, or the
  // type-checker, since both accept an import arrangement that reintroduces
  // the crash just as readily as the one that fixes it.

  it("imports 'expo-router/entry' first, before any other import or side effect", () => {
    const specifiers = importSpecifiers();
    const first = specifiers[0];

    if (first !== 'expo-router/entry') {
      throw new Error(
        `main.ts's first import is '${first}', not 'expo-router/entry'. The ` +
          "expo-app-development skill's project-layout.md MUSTs the router-entry import be " +
          'first in the entry module, before any other import or statement with a side effect.',
      );
    }
  });

  it('configures Unistyles from the entry module', () => {
    assertImported('@/core/theme/unistyles');
  });

  it('never configures Unistyles from a route module under src/app/', () => {
    const unistylesImportPattern = /import\s+(?:[^'"]*from\s+)?['"]@\/core\/theme\/unistyles['"]/;
    const offenders = appSourceFiles(appDir).filter((file) =>
      unistylesImportPattern.test(readFileSync(file, 'utf-8')),
    );

    if (offenders.length > 0) {
      throw new Error(
        `${offenders.map((file) => path.relative(process.cwd(), file)).join(', ')} ` +
          "imports '@/core/theme/unistyles'. Route modules under src/app/ load lazily, through " +
          "require.context, during the root navigator's render — and require.context walks its " +
          "keys in sorted order, where '(' (0x28) sorts before '_' (0x5F). That puts " +
          'src/app/(tabs)/_layout.tsx, and the themed StyleSheet.create it pulls in via ' +
          'tab-bar-item.tsx, ahead of src/app/_layout.tsx itself. Configuring Unistyles from any ' +
          'route module crashes the app on launch with "Unistyles: ... no theme has been ' +
          'selected yet" (Sentry event JUICIO-1, release 0.1.0-pr-11) the moment some other route ' +
          'happens to sort first — move this import back to main.ts, the one module guaranteed ' +
          'to run before every route module regardless of sort order.',
      );
    }
  });

  it('initializes Sentry before @/core/i18n', () => {
    assertPrecedes(
      '@/core/instrumentation/sentry-boot',
      '@/core/i18n',
      'Sentry can only report a startup crash that happens after it initializes. Every import ' +
        "in this file runs, in source order, before any of the file's own statements do — so " +
        'placing the sentry-boot import any later leaves every import above it (including ' +
        "@/core/i18n's synchronous i18next.init and expo-localization calls) able to crash " +
        'unreported, which is exactly what shipped once already (fixed in 12dd457).',
    );
  });
});
