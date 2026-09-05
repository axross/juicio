import i18next from '@/core/i18n';
import type { SupportedLanguage } from '@/core/i18n';
import { identifyUserProperty } from '@/core/instrumentation/analytics';

import { writeStoredLanguage } from '../adapter/settings-storage';
import { changeLanguage } from './change-language';

// docs/conventions/product-analytics.md's "Testing a New Call Site" section
// requires this call site to assert the exact user property name and value
// it sends, mocking `@/core/instrumentation/analytics` the same way
// `use-players.test.ts` does for `trackEvent` — `analytics.test.ts` itself
// already covers the API-key/preference gates and the key conversion, so
// this only has to prove `changeLanguage()` reports the right `Language`
// user property (issue #211), alongside the i18next switch and the
// persisted write it was already relied on to make. `LANGUAGE_ANALYTICS_LABELS`
// is this module's own private table, not exported, so the expected labels
// below are hardcoded literals read straight off it rather than re-derived
// from the source — the same "assert the literal, don't reimport the
// mapping" convention `screen-name.test.ts`'s own table follows.
jest.mock('@/core/instrumentation/analytics', () => ({ identifyUserProperty: jest.fn() }));
jest.mock('../adapter/settings-storage', () => ({ writeStoredLanguage: jest.fn() }));
jest.mock('@/core/i18n', () => ({ __esModule: true, default: { changeLanguage: jest.fn() } }));

const mockedIdentifyUserProperty = jest.mocked(identifyUserProperty);
const mockedWriteStoredLanguage = jest.mocked(writeStoredLanguage);
const mockedChangeLanguage = jest.mocked(i18next.changeLanguage);

beforeEach(() => {
  jest.clearAllMocks();
  mockedChangeLanguage.mockResolvedValue(undefined as never);
});

describe('changeLanguage()', () => {
  it.each<[SupportedLanguage, string]>([
    ['en', 'English (United States)'],
    ['ja', '日本語'],
  ])(
    'switches to %s, persists it, and identifies the Language user property as %s',
    async (language, label) => {
      await changeLanguage(language);

      expect(mockedChangeLanguage).toHaveBeenCalledWith(language);
      expect(mockedIdentifyUserProperty).toHaveBeenCalledWith('language', label);
      expect(mockedWriteStoredLanguage).toHaveBeenCalledWith(language);
    },
  );
});
