// Declared as package.json's "main". The router-entry import must stay
// first and uninterrupted by any other statement with a side effect — ES
// module imports are hoisted, so this ordering does not make initialization
// run before the router's own module evaluation, only before the app's own
// modules evaluate and before the first render. See
// docs/conventions/directory-structure.md for why this file lives at the
// repository root rather than under src/.
import 'expo-router/entry';

import { initSentry } from '@/core/instrumentation/sentry';

initSentry();
