import { isBlankMessage, validateFeedbackDraft, type FeedbackDraft } from './feedback-draft';

function draft(overrides: Partial<FeedbackDraft> = {}): FeedbackDraft {
  return { message: '', name: '', email: '', ...overrides };
}

describe('isBlankMessage()', () => {
  it('returns true for an empty string', () => {
    expect(isBlankMessage('')).toBe(true);
  });

  it('returns true for a whitespace-only string', () => {
    expect(isBlankMessage('   \n\t ')).toBe(true);
  });

  it('returns false once the string has non-whitespace content', () => {
    expect(isBlankMessage('  hi  ')).toBe(false);
  });
});

describe('validateFeedbackDraft()', () => {
  it('rejects an empty message', () => {
    const result = validateFeedbackDraft(draft({ message: '' }));

    expect(result).toEqual({ valid: false, reason: 'emptyMessage' });
  });

  it('rejects a whitespace-only message', () => {
    const result = validateFeedbackDraft(draft({ message: '   ' }));

    expect(result).toEqual({ valid: false, reason: 'emptyMessage' });
  });

  it('accepts a message with no name or email, dropping both from the result', () => {
    const result = validateFeedbackDraft(draft({ message: 'Great app' }));

    expect(result).toEqual({ valid: true, feedback: { message: 'Great app' } });
  });

  it('trims the message, name, and email', () => {
    const result = validateFeedbackDraft(
      draft({ message: '  Great app  ', name: '  Ada  ', email: '  ada@example.com  ' }),
    );

    expect(result).toEqual({
      valid: true,
      feedback: { message: 'Great app', name: 'Ada', email: 'ada@example.com' },
    });
  });

  it('rejects a non-empty email that does not parse', () => {
    const result = validateFeedbackDraft(draft({ message: 'Great app', email: 'not-an-email' }));

    expect(result).toEqual({ valid: false, reason: 'invalidEmail' });
  });

  it('accepts a well-formed email', () => {
    const result = validateFeedbackDraft(draft({ message: 'Great app', email: 'ada@example.com' }));

    expect(result).toEqual({
      valid: true,
      feedback: { message: 'Great app', email: 'ada@example.com' },
    });
  });
});
