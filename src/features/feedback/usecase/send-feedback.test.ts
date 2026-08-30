import { canSendUserFeedback, sendUserFeedback } from '@/core/instrumentation/user-feedback';

import type { FeedbackDraft } from '../model/feedback-draft';
import { sendFeedback } from './send-feedback';

// the narrowest boundary that keeps this test off the real Sentry SDK
// (which starts a real `setInterval` under Jest that nothing here ever
// clears — the same reasoning `settings-screen.test.tsx` and
// `button.test.tsx` give for mocking `report-error`): a factory mock, so
// the real module — and its `@sentry/react-native` import — never loads.
jest.mock('@/core/instrumentation/user-feedback', () => ({
  canSendUserFeedback: jest.fn(),
  sendUserFeedback: jest.fn(),
}));

const mockedCanSend = jest.mocked(canSendUserFeedback);
const mockedSend = jest.mocked(sendUserFeedback);

function draft(overrides: Partial<FeedbackDraft> = {}): FeedbackDraft {
  return { message: '', name: '', email: '', ...overrides };
}

beforeEach(() => {
  mockedCanSend.mockReset();
  mockedSend.mockReset();
});

describe('sendFeedback()', () => {
  it('returns invalid/emptyMessage without checking availability or sending', () => {
    const result = sendFeedback(draft({ message: '   ' }));

    expect(result).toEqual({ status: 'invalid', reason: 'emptyMessage' });
    expect(mockedCanSend).not.toHaveBeenCalled();
    expect(mockedSend).not.toHaveBeenCalled();
  });

  it('returns invalid/invalidEmail without checking availability or sending', () => {
    const result = sendFeedback(draft({ message: 'hi', email: 'not-an-email' }));

    expect(result).toEqual({ status: 'invalid', reason: 'invalidEmail' });
    expect(mockedCanSend).not.toHaveBeenCalled();
    expect(mockedSend).not.toHaveBeenCalled();
  });

  it('returns unavailable when Sentry cannot send, without calling sendUserFeedback', () => {
    mockedCanSend.mockReturnValue(false);

    const result = sendFeedback(draft({ message: 'hi' }));

    expect(result).toEqual({ status: 'unavailable' });
    expect(mockedSend).not.toHaveBeenCalled();
  });

  it('sends the validated feedback and returns sent', () => {
    mockedCanSend.mockReturnValue(true);

    const result = sendFeedback(
      draft({ message: '  hi  ', name: '  Ada  ', email: '  ada@example.com  ' }),
    );

    expect(result).toEqual({ status: 'sent' });
    expect(mockedSend).toHaveBeenCalledWith({
      message: 'hi',
      name: 'Ada',
      email: 'ada@example.com',
    });
  });

  it('returns failed when sendUserFeedback throws, without rethrowing', () => {
    mockedCanSend.mockReturnValue(true);
    mockedSend.mockImplementation(() => {
      throw new Error('network down');
    });

    const result = sendFeedback(draft({ message: 'hi' }));

    expect(result).toEqual({ status: 'failed' });
  });
});
