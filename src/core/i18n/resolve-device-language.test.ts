import { resolveDeviceLanguage } from './resolve-device-language';

describe('resolveDeviceLanguage', () => {
  it('resolves to ja when the first locale in the list is Japanese', () => {
    expect(resolveDeviceLanguage([{ languageCode: 'ja' }, { languageCode: 'en' }])).toBe('ja');
  });

  it('resolves to en when the first locale in the list is not Japanese', () => {
    expect(resolveDeviceLanguage([{ languageCode: 'en' }, { languageCode: 'ja' }])).toBe('en');
  });

  it('resolves to en when given an empty locale list', () => {
    expect(resolveDeviceLanguage([])).toBe('en');
  });

  it('resolves to en when the first locale has no language code', () => {
    expect(resolveDeviceLanguage([{ languageCode: null }])).toBe('en');
  });
});
