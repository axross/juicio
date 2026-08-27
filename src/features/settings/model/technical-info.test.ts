import { resolveTechnicalInfo } from './technical-info';

describe('resolveTechnicalInfo', () => {
  it('passes through a fully populated build', () => {
    expect(
      resolveTechnicalInfo({
        buildChannel: 'Production',
        version: '1.2.3',
        buildNumber: 123,
        commitHash: '48038c4abcdef0123456789abcdef0123456789',
      }),
    ).toEqual({
      buildChannel: 'Production',
      version: '1.2.3',
      buildNumber: '123',
      commitHash: '48038c4',
    });
  });

  it('falls back every field to a legible local value rather than undefined', () => {
    expect(
      resolveTechnicalInfo({
        buildChannel: undefined,
        version: undefined,
        buildNumber: undefined,
        commitHash: undefined,
      }),
    ).toEqual({
      buildChannel: 'Development',
      version: '0.0.0',
      buildNumber: '0',
      commitHash: 'unknown',
    });
  });

  it('treats an empty string the same as undefined for buildChannel, version and commitHash', () => {
    expect(
      resolveTechnicalInfo({
        buildChannel: '',
        version: '',
        buildNumber: 7,
        commitHash: '',
      }),
    ).toEqual({
      buildChannel: 'Development',
      version: '0.0.0',
      buildNumber: '7',
      commitHash: 'unknown',
    });
  });

  it('renders buildNumber 0 as "0" rather than falling back, since 0 is a real value', () => {
    expect(
      resolveTechnicalInfo({
        buildChannel: 'Development',
        version: '0.1.0',
        buildNumber: 0,
        commitHash: 'abc1234',
      }).buildNumber,
    ).toBe('0');
  });

  it('shortens a full commit hash to 7 characters, matching the design example', () => {
    expect(
      resolveTechnicalInfo({
        buildChannel: 'Preview',
        version: '0.1.0',
        buildNumber: 1,
        commitHash: '48038c4abcdef0123456789abcdef0123456789',
      }).commitHash,
    ).toBe('48038c4');
  });

  it('leaves a commit hash already shorter than 7 characters untouched', () => {
    expect(
      resolveTechnicalInfo({
        buildChannel: 'Preview',
        version: '0.1.0',
        buildNumber: 1,
        commitHash: 'abc12',
      }).commitHash,
    ).toBe('abc12');
  });
});
