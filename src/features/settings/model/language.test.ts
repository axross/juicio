import { resolveStoredLanguage } from './language';

describe('resolveStoredLanguage', () => {
  it('resolves a stored "en" to en', () => {
    expect(resolveStoredLanguage('en')).toBe('en');
  });

  it('resolves a stored "ja" to ja', () => {
    expect(resolveStoredLanguage('ja')).toBe('ja');
  });

  it('resolves null (nothing ever stored) to undefined, so the caller keeps its device default', () => {
    expect(resolveStoredLanguage(null)).toBeUndefined();
  });

  it('resolves undefined to undefined', () => {
    expect(resolveStoredLanguage(undefined)).toBeUndefined();
  });

  it('resolves an unrecognised language code to undefined rather than crashing', () => {
    expect(resolveStoredLanguage('fr')).toBeUndefined();
  });

  it('resolves corrupt (non-language) stored data to undefined rather than crashing', () => {
    expect(resolveStoredLanguage('{"not":"a language"}')).toBeUndefined();
  });
});
