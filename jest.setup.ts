// registers react-native-unistyles' own published Jest mock
// (`node_modules/react-native-unistyles/src/mocks.ts`). it replaces the
// library's native module with an in-memory mini-runtime a test can read and
// drive directly — `useUnistyles()`, `UnistylesRuntime`, and a themed
// `StyleSheet.create` all keep working under Jest, where the real Nitro
// module has no native binary to load against. the import's own side effect
// is what registers the mock: `react-native-unistyles/mocks` calls
// `jest.mock('react-native-unistyles', ...)` at its own top level, so
// nothing here needs to call `jest.mock` directly.
import 'react-native-unistyles/mocks';

// runs this project's own `StyleSheet.configure` call — the same one
// `main.ts` runs at boot (`src/core/theme/unistyles.ts`) — against the mock
// registered above. the mock's own theme registry starts empty; without
// this, every mounted component's themed `StyleSheet.create` factory would
// resolve against `{}` rather than this project's real design tokens
// (`src/core/theme/tokens.ts`), and a component reading a token that only
// exists on the real theme (which is every themed component here) would
// throw on mount. importing the production configuration module, rather
// than duplicating its `StyleSheet.configure` call here, is what keeps the
// two from drifting apart.
import '@/core/theme/unistyles';

import i18next from 'i18next';
import { initReactI18next } from 'react-i18next';

// registers a minimal, standalone i18next instance for `useTranslation()`
// to attach to under Jest. this deliberately does not import the project's
// real one (`@/core/i18n`): that module calls `expo-localization`'s
// `getLocales()` at its own top level as a side effect of import (see its
// own header comment), which has no native binary to run against under
// Jest — the exact reason `settings-screen.tsx` imports `SupportedLanguage`
// from it only as a type. without any instance registered, `useTranslation`
// warns `NO_I18NEXT_INSTANCE` and `i18n.language` stays `undefined`, which
// a mounted screen's Language row could never distinguish from a real
// language. `resources` stays empty because no test here asserts translated
// copy; `t()` falling back to returning the key is enough to mount every
// screen.
// eslint-disable-next-line import/no-named-as-default-member -- mirrors `@/core/i18n`'s own documented `i18next.use(...)` plugin-API usage.
void i18next.use(initReactI18next).init({
  lng: 'en',
  fallbackLng: 'en',
  resources: {},
});
