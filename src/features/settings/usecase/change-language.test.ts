import i18next from '@/core/i18n';
import type { SupportedLanguage } from '@/core/i18n';
import { identifyUserProperty } from '@/core/instrumentation/analytics';

import { writeStoredLanguage } from '../adapter/settings-storage';
import { changeLanguage } from './change-language';

// per docs/conventions/product-analytics.md's "Testing a New Call Site"
// section, asserts the exact `Language` user property `changeLanguage()`
// reports. `LANGUAGE_ANALYTICS_LABELS` is this module's own private table,
// so the expected labels below are hardcoded literals read straight off it
// rather than re-derived from the source, the same convention
// `screen-name.test.ts`'s own table follows.
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
