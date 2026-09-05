import i18next from '@/core/i18n';

import { applyThemeInstruction } from '../adapter/apply-theme-instruction';
import {
  readStoredAnalyticsPreference,
  readStoredLanguage,
  readStoredTheme,
} from '../adapter/settings-storage';
import { setAnalyticsPreference } from '../adapter/use-analytics-preference';
import { applyPersistedSettings } from './apply-persisted-settings';

// each of the three storage reads, `applyThemeInstruction` (Unistyles), and
// `i18next.changeLanguage` are mocked independently so a test can make any
// one of them reject without touching the others — this module's own
// branching, where one rejected read must never suppress the other two
// settings, is exactly what earns this a test, the same reasoning
// `analytics.test.ts`'s own header comment gives for testing a module
// adjacent to a normally test-exempt vendor wrapper
// (`apply-theme-instruction.ts` and `@/core/i18n` both stay untested at
// their own layer, per their own doc comments, for that native/vendor
// reason).
jest.mock('../adapter/settings-storage', () => ({
  readStoredLanguage: jest.fn(),
  readStoredTheme: jest.fn(),
  readStoredAnalyticsPreference: jest.fn(),
}));
jest.mock('../adapter/apply-theme-instruction', () => ({ applyThemeInstruction: jest.fn() }));
jest.mock('../adapter/use-analytics-preference', () => ({ setAnalyticsPreference: jest.fn() }));
jest.mock('@/core/i18n', () => ({ __esModule: true, default: { changeLanguage: jest.fn() } }));

const mockedReadStoredLanguage = jest.mocked(readStoredLanguage);
const mockedReadStoredTheme = jest.mocked(readStoredTheme);
const mockedReadStoredAnalyticsPreference = jest.mocked(readStoredAnalyticsPreference);
const mockedApplyThemeInstruction = jest.mocked(applyThemeInstruction);
const mockedSetAnalyticsPreference = jest.mocked(setAnalyticsPreference);
const mockedChangeLanguage = jest.mocked(i18next.changeLanguage);

beforeEach(() => {
  jest.clearAllMocks();
  mockedReadStoredLanguage.mockResolvedValue(undefined);
  mockedReadStoredTheme.mockResolvedValue('system');
  mockedReadStoredAnalyticsPreference.mockResolvedValue(true);
  mockedChangeLanguage.mockResolvedValue(undefined as never);
});

describe('applyPersistedSettings()', () => {
  it('applies the theme and the analytics preference, and changes the language, when every read succeeds', async () => {
    mockedReadStoredLanguage.mockResolvedValue('ja');
    mockedReadStoredTheme.mockResolvedValue('dark');
    mockedReadStoredAnalyticsPreference.mockResolvedValue(false);

    await applyPersistedSettings();

    expect(mockedApplyThemeInstruction).toHaveBeenCalledWith({ adaptive: false, theme: 'dark' });
    expect(mockedSetAnalyticsPreference).toHaveBeenCalledWith(false);
    expect(mockedChangeLanguage).toHaveBeenCalledWith('ja');
  });

  // a language or theme read failing must not discard an already-successful
  // analytics read.
  it('still applies the analytics preference when readStoredTheme() rejects', async () => {
    mockedReadStoredAnalyticsPreference.mockResolvedValue(false);
    mockedReadStoredTheme.mockRejectedValue(new Error('theme storage failure'));

    await expect(applyPersistedSettings()).rejects.toThrow('theme storage failure');

    expect(mockedSetAnalyticsPreference).toHaveBeenCalledWith(false);
    expect(mockedApplyThemeInstruction).not.toHaveBeenCalled();
  });

  it('still applies the analytics preference when readStoredLanguage() rejects', async () => {
    mockedReadStoredAnalyticsPreference.mockResolvedValue(false);
    mockedReadStoredLanguage.mockRejectedValue(new Error('language storage failure'));

    await expect(applyPersistedSettings()).rejects.toThrow('language storage failure');

    expect(mockedSetAnalyticsPreference).toHaveBeenCalledWith(false);
    // the theme still applies too — a language failure must not suppress it.
    expect(mockedApplyThemeInstruction).toHaveBeenCalledWith({ adaptive: true });
    expect(mockedChangeLanguage).not.toHaveBeenCalled();
  });

  // the reverse: an analytics read failure must not block the theme or the
  // language from being applied.
  it('still applies the theme and changes the language when readStoredAnalyticsPreference() rejects', async () => {
    mockedReadStoredTheme.mockResolvedValue('light');
    mockedReadStoredLanguage.mockResolvedValue('ja');
    mockedReadStoredAnalyticsPreference.mockRejectedValue(new Error('analytics storage failure'));

    await applyPersistedSettings();

    expect(mockedApplyThemeInstruction).toHaveBeenCalledWith({ adaptive: false, theme: 'light' });
    expect(mockedChangeLanguage).toHaveBeenCalledWith('ja');
    expect(mockedSetAnalyticsPreference).not.toHaveBeenCalled();
  });

  // a failed analytics read is deliberately left unreported — see this
  // module's own doc comment for why `enabled` staying at its default is
  // not a difference worth surfacing.
  it('resolves, rather than rejecting, when only readStoredAnalyticsPreference() rejects', async () => {
    mockedReadStoredAnalyticsPreference.mockRejectedValue(new Error('analytics storage failure'));

    await expect(applyPersistedSettings()).resolves.toBeUndefined();
  });

  it('propagates a changeLanguage() rejection uncaught, after the theme and analytics preference have already applied', async () => {
    mockedReadStoredLanguage.mockResolvedValue('ja');
    mockedReadStoredAnalyticsPreference.mockResolvedValue(false);
    mockedChangeLanguage.mockRejectedValue(new Error('i18next backend failure'));

    await expect(applyPersistedSettings()).rejects.toThrow('i18next backend failure');

    expect(mockedApplyThemeInstruction).toHaveBeenCalled();
    expect(mockedSetAnalyticsPreference).toHaveBeenCalledWith(false);
  });

  it('does not call changeLanguage() when nothing is persisted', async () => {
    await applyPersistedSettings();

    expect(mockedChangeLanguage).not.toHaveBeenCalled();
  });
});
