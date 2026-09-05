import { resolveScreenName } from './screen-name';

describe('resolveScreenName', () => {
  it.each([
    ['/', 'Analyze'],
    ['/history', 'History'],
    ['/presets', 'Hand Range Preset'],
    ['/settings', 'Settings'],
    ['/feedback', 'Feedback'],
    ['/settings-language', 'Language'],
    ['/settings-theme', 'Theme'],
    ['/settings-analytics', 'Analytics'],
  ])('maps %s to %s', (pathname, expected) => {
    expect(resolveScreenName(pathname)).toBe(expected);
  });

  it('returns undefined for a pathname this app does not recognize', () => {
    expect(resolveScreenName('/not-a-real-route')).toBeUndefined();
  });
});
