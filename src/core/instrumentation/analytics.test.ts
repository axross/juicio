const mockInit = jest.fn();
const mockTrack = jest.fn();
const mockIdentify = jest.fn();
const mockIdentifySet = jest.fn();

// the whole SDK is replaced, never loaded for real: this wrapper's own
// logic is what's under test here (gating on a configured API key and on
// the on-device preference, plus the camelCase-to-Title-Case key
// conversion), not Amplitude's own `init`/`track`/`identify` — see
// `report-error.ts`'s doc comment for why a module that imports a vendor
// SDK directly carries no test of its own at the call-site layer; this
// module earns one anyway because, unlike `sentry.ts`, it owns real
// branching and transformation logic beyond "was a key configured".
jest.mock('@amplitude/analytics-react-native', () => {
  class FakeIdentify {
    set(...args: unknown[]) {
      mockIdentifySet(...args);
      return this;
    }
  }

  return {
    init: (...args: unknown[]) => mockInit(...args),
    track: (...args: unknown[]) => mockTrack(...args),
    identify: (...args: unknown[]) => mockIdentify(...args),
    Identify: FakeIdentify,
  };
});

describe('analytics', () => {
  const originalValue = process.env.EXPO_PUBLIC_AMPLITUDE_API_KEY;

  beforeEach(() => {
    jest.resetModules();
    mockInit.mockClear();
    mockTrack.mockClear();
    mockIdentify.mockClear();
    mockIdentifySet.mockClear();
    delete process.env.EXPO_PUBLIC_AMPLITUDE_API_KEY;
  });

  afterAll(() => {
    if (originalValue === undefined) {
      delete process.env.EXPO_PUBLIC_AMPLITUDE_API_KEY;
    } else {
      process.env.EXPO_PUBLIC_AMPLITUDE_API_KEY = originalValue;
    }
  });

  it('does not initialize Amplitude when no API key is configured', () => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports -- a fresh require, after jest.resetModules(), is what re-evaluates this module's own top-level `let` state for each test; a static top-level import would share one module instance across every test in this file instead.
    const { initAnalytics, trackEvent } = require('./analytics');

    initAnalytics();
    trackEvent('Session Started', {});

    expect(mockInit).not.toHaveBeenCalled();
    expect(mockTrack).not.toHaveBeenCalled();
  });

  it('initializes Amplitude once, with autocapture and session events off, when a key is configured', () => {
    process.env.EXPO_PUBLIC_AMPLITUDE_API_KEY = 'abcd1234';
    // eslint-disable-next-line @typescript-eslint/no-require-imports -- same as above.
    const { initAnalytics } = require('./analytics');

    initAnalytics();
    initAnalytics();

    expect(mockInit).toHaveBeenCalledTimes(1);
    expect(mockInit).toHaveBeenCalledWith('abcd1234', undefined, {
      autocapture: false,
      trackingSessionEvents: false,
    });
  });

  it('tracks an event once initialized, converting a camelCase payload key to its Title Case wire form', () => {
    process.env.EXPO_PUBLIC_AMPLITUDE_API_KEY = 'abcd1234';
    // eslint-disable-next-line @typescript-eslint/no-require-imports -- same as above.
    const { initAnalytics, trackEvent } = require('./analytics');

    initAnalytics();
    trackEvent('Player Added', { method: 'hole_cards' });

    expect(mockTrack).toHaveBeenCalledWith('Player Added', { Method: 'hole_cards' });
  });

  it('converts a multi-word camelCase payload key to Title Case with spaces', () => {
    process.env.EXPO_PUBLIC_AMPLITUDE_API_KEY = 'abcd1234';
    // eslint-disable-next-line @typescript-eslint/no-require-imports -- same as above.
    const { initAnalytics, trackEvent } = require('./analytics');

    initAnalytics();
    trackEvent('Screen Viewed', { screenName: 'Analyze' });

    expect(mockTrack).toHaveBeenCalledWith('Screen Viewed', { 'Screen Name': 'Analyze' });
  });

  it('sends an empty payload for an event with no properties of its own', () => {
    process.env.EXPO_PUBLIC_AMPLITUDE_API_KEY = 'abcd1234';
    // eslint-disable-next-line @typescript-eslint/no-require-imports -- same as above.
    const { initAnalytics, trackEvent } = require('./analytics');

    initAnalytics();
    trackEvent('Board Confirmed', {});

    expect(mockTrack).toHaveBeenCalledWith('Board Confirmed', {});
  });

  it('does not track an event once the on-device preference is turned off', () => {
    process.env.EXPO_PUBLIC_AMPLITUDE_API_KEY = 'abcd1234';
    // eslint-disable-next-line @typescript-eslint/no-require-imports -- same as above.
    const { initAnalytics, setAnalyticsEnabled, trackEvent } = require('./analytics');

    initAnalytics();
    setAnalyticsEnabled(false);
    trackEvent('Player Removed', {});

    expect(mockTrack).not.toHaveBeenCalled();
  });

  it('tracks again once the preference is turned back on', () => {
    process.env.EXPO_PUBLIC_AMPLITUDE_API_KEY = 'abcd1234';
    // eslint-disable-next-line @typescript-eslint/no-require-imports -- same as above.
    const { initAnalytics, setAnalyticsEnabled, trackEvent } = require('./analytics');

    initAnalytics();
    setAnalyticsEnabled(false);
    setAnalyticsEnabled(true);
    trackEvent('Player Removed', {});

    expect(mockTrack).toHaveBeenCalledWith('Player Removed', {});
  });

  it('does not identify a user property without a configured API key', () => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports -- same as above.
    const { identifyUserProperty } = require('./analytics');

    identifyUserProperty('language', 'English (United States)');

    expect(mockIdentify).not.toHaveBeenCalled();
  });

  it('identifies a user property once initialized, converting its key to Title Case', () => {
    process.env.EXPO_PUBLIC_AMPLITUDE_API_KEY = 'abcd1234';
    // eslint-disable-next-line @typescript-eslint/no-require-imports -- same as above.
    const { initAnalytics, identifyUserProperty } = require('./analytics');

    initAnalytics();
    identifyUserProperty('theme', 'Dark');

    expect(mockIdentifySet).toHaveBeenCalledWith('Theme', 'Dark');
    expect(mockIdentify).toHaveBeenCalledTimes(1);
  });
});
