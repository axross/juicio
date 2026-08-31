import '@/core/theme/unistyles';

import { render, screen } from '@testing-library/react-native';
import { StyleSheet } from 'react-native';

import { SpeechBubbleIcon } from '@/core/icons/speech-bubble-icon';
import { Button } from '@/shared/ui/button/button';

import { SubmitBar } from './submit-bar';

// `SubmitBar` renders the real, byte-identical `Button`, which fires a
// haptic on press and, through it, reaches `@/core/instrumentation/
// report-error` and `@sentry/react-native` — the same native-SDK
// `setInterval` hazard `button.test.tsx` and `feedback-form.test.tsx` mock
// away. mocked here for the same reason.
jest.mock('@/core/haptics/haptics');
jest.mock('@/core/instrumentation/report-error', () => ({ reportError: jest.fn() }));

describe('<SubmitBar />', () => {
  // `submit-bar.tsx`'s own header comment names this the load-bearing
  // mechanism for the full-width Send button: it never touches
  // `button.tsx`, instead stretching the pill by passing
  // `style={{ alignSelf: 'stretch' }}` through `Button`'s caller-`style`
  // prop — which only works because `button.tsx` merges the caller's style
  // last rather than replacing its own. this renders a bare `Button` to
  // capture its own resolved pill styles, then asserts the rendered
  // `SubmitBar` root carries all of them plus the stretch, rather than one
  // or the other.
  it('extends the Button pill styles with alignSelf: stretch on the rendered root, rather than replacing them', () => {
    const { unmount } = render(
      <Button label="Send" Icon={SpeechBubbleIcon} onPress={jest.fn()} testID="bare-button" />,
    );
    const bareButtonStyle = StyleSheet.flatten(screen.getByTestId('bare-button').props.style);
    unmount();

    render(<SubmitBar label="Send" onPress={jest.fn()} testID="submit" />);
    const submitBarStyle = StyleSheet.flatten(screen.getByTestId('submit').props.style);

    expect(submitBarStyle).toMatchObject(bareButtonStyle);
    expect(submitBarStyle.alignSelf).toBe('stretch');
  });

  it("renders the caller-supplied label as the button's visible text", () => {
    render(<SubmitBar label="Send feedback" onPress={jest.fn()} testID="submit" />);

    expect(screen.getByText('Send feedback')).toBeVisible();
  });
});

// proves docs/conventions/component-styling.md's root-style merge rule is
// real for `SubmitBar`'s own root `View`, not merely type-level. this root
// carries no `testID` of its own — `SubmitBar`'s own `testID` prop reaches
// its inner `Button` instead — so the rendered tree's own top node
// (`screen.toJSON()`) is what this reads the merged style off, rather than
// a query by id.
describe('<SubmitBar /> style', () => {
  it('merges a caller-supplied style onto its own root style rather than replacing it', () => {
    render(
      <SubmitBar label="Send" onPress={jest.fn()} testID="submit" style={{ marginTop: 10 }} />,
    );

    const root = screen.toJSON();
    // this bar's root is the tree's own single top node — never an array of
    // siblings — so this narrows `screen.toJSON()`'s own wider return type
    // down to the one shape `.props` is actually reachable on.
    if (root === null || Array.isArray(root)) {
      throw new Error('expected a single rendered root');
    }
    const flattenedStyle = StyleSheet.flatten(root.props.style);

    // the caller's `marginTop` survived...
    expect(flattenedStyle).toMatchObject({ marginTop: 10 });
    // ...alongside this bar's own chrome, which a caller replacing rather
    // than extending the style would have wiped.
    expect(flattenedStyle).toHaveProperty('backgroundColor');
  });
});
