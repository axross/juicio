import { normalizeError } from './normalize-error';

describe('normalizeError', () => {
  it('returns an Error instance unchanged', () => {
    const error = new Error('boom');

    expect(normalizeError(error)).toBe(error);
  });

  it('wraps a thrown string as the Error message', () => {
    const error = normalizeError('something broke');

    expect(error).toBeInstanceOf(Error);
    expect(error.message).toBe('something broke');
  });

  it('stringifies a thrown plain object into the Error message', () => {
    const error = normalizeError({ code: 'E_STORAGE', attempt: 2 });

    expect(error).toBeInstanceOf(Error);
    expect(error.message).toBe('{"code":"E_STORAGE","attempt":2}');
  });

  it('falls back to String() for a value JSON.stringify cannot serialize', () => {
    const circular: Record<string, unknown> = {};
    circular.self = circular;

    const error = normalizeError(circular);

    expect(error).toBeInstanceOf(Error);
    expect(error.message).toBe(String(circular));
  });

  it('produces a legible message for undefined and null', () => {
    expect(normalizeError(undefined).message).toBe('undefined');
    expect(normalizeError(null).message).toBe('null');
  });
});
