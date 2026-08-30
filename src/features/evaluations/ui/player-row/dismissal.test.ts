import {
  resolveSwipeRelease,
  SWIPE_COMMIT_THRESHOLD,
  SWIPE_REVEAL_OFFSET,
  SWIPE_REVEAL_THRESHOLD,
} from './dismissal';

describe('measured offsets', () => {
  it('matches the design-file Dismissing variants exactly', () => {
    expect(SWIPE_REVEAL_OFFSET).toBe(-109);
    expect(SWIPE_COMMIT_THRESHOLD).toBe(-247);
  });

  it('sits halfway to the reveal offset', () => {
    expect(SWIPE_REVEAL_THRESHOLD).toBe(-54.5);
  });
});

describe('resolveSwipeRelease()', () => {
  it('rests closed at 0', () => {
    expect(resolveSwipeRelease(0)).toBe('restsClosed');
  });

  it('rests closed for a short drag that has not reached the reveal threshold', () => {
    expect(resolveSwipeRelease(-20)).toBe('restsClosed');
  });

  it('rests revealed once past the reveal threshold, short of the commit threshold', () => {
    expect(resolveSwipeRelease(-60)).toBe('restsRevealed');
  });

  it('rests revealed exactly at the resting reveal offset', () => {
    expect(resolveSwipeRelease(SWIPE_REVEAL_OFFSET)).toBe('restsRevealed');
  });

  it('rests revealed exactly at the reveal threshold boundary', () => {
    expect(resolveSwipeRelease(SWIPE_REVEAL_THRESHOLD)).toBe('restsRevealed');
  });

  it('rests closed just short of the reveal threshold', () => {
    expect(resolveSwipeRelease(SWIPE_REVEAL_THRESHOLD + 1)).toBe('restsClosed');
  });

  it('commits to delete exactly at the commit threshold', () => {
    expect(resolveSwipeRelease(SWIPE_COMMIT_THRESHOLD)).toBe('commitsDelete');
  });

  it('commits to delete once carried past the commit threshold', () => {
    expect(resolveSwipeRelease(-300)).toBe('commitsDelete');
  });

  it('rests revealed when a further drag from an already-revealed row falls short of committing', () => {
    // re-dragging from the resting reveal offset a little further, but not
    // past the commit threshold, still resolves off the current offset —
    // not off the release gesture's own (smaller) translation.
    expect(resolveSwipeRelease(SWIPE_REVEAL_OFFSET - 30)).toBe('restsRevealed');
  });
});
