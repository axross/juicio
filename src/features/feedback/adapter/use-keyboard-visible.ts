import { useEffect, useState } from 'react';
import { Keyboard, Platform } from 'react-native';

// iOS fires `keyboardWillShow`/`keyboardWillHide` ahead of the animation,
// which is what a layout that reacts to the keyboard needs; Android has no
// `will` pair at all, so `keyboardDidShow`/`keyboardDidHide` is the only
// option there.
const SHOW_EVENT = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
const HIDE_EVENT = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';

/**
 * whether an on-screen keyboard is currently visible. `FeedbackForm` reads
 * this to hide its pinned submit bar entirely while a field is focused, per
 * docs/specs/settings.md's Feedback section — a React binding over
 * `Keyboard`'s own show/hide events, so it lives in `adapter/` per
 * docs/conventions/directory-structure.md.
 */
export function useKeyboardVisible(): boolean {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const showSubscription = Keyboard.addListener(SHOW_EVENT, () => setVisible(true));
    const hideSubscription = Keyboard.addListener(HIDE_EVENT, () => setVisible(false));

    return () => {
      showSubscription.remove();
      hideSubscription.remove();
    };
  }, []);

  return visible;
}
