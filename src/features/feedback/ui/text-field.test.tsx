import '@/core/theme/unistyles';

import { render, screen } from '@testing-library/react-native';
import { StyleSheet } from 'react-native';

import { TextField } from './text-field';

describe('<TextField />', () => {
  // the visible `label` `Text` above the input is not associated with it —
  // React Native has no equivalent of web's `<label for>`, so proximity
  // alone gives the input no programmatically determinable accessible
  // name. querying by that name (rather than by `testID`) is what makes
  // this assertion fail if `accessibilityLabel` stopped reaching the
  // input, per the high-fidelity-ui-design skill's accessible-name rule.
  it("exposes the visible label as the input's accessible name", () => {
    render(<TextField label="Message" value="" onChangeText={jest.fn()} />);

    expect(screen.getByLabelText('Message')).toBeVisible();
  });

  // React Native has no cross-platform `aria-describedby` equivalent (see
  // docs/conventions/accessibility.md), so `accessibilityHint` is the
  // channel this project uses to carry the field's hint or error text with
  // the input itself.
  it("carries the hint as the input's accessibilityHint when there is no error", () => {
    render(
      <TextField
        label="Email"
        hint="Add it only if you'd like a reply."
        value=""
        onChangeText={jest.fn()}
      />,
    );

    expect(screen.getByLabelText('Email').props.accessibilityHint).toBe(
      "Add it only if you'd like a reply.",
    );
  });

  it("carries the error as the input's accessibilityHint in place of the hint when both are given", () => {
    render(
      <TextField
        label="Email"
        hint="Add it only if you'd like a reply."
        error="That doesn't look like an email address."
        value=""
        onChangeText={jest.fn()}
      />,
    );

    expect(screen.getByLabelText('Email').props.accessibilityHint).toBe(
      "That doesn't look like an email address.",
    );
  });
});

// proves docs/conventions/component-styling.md's split root — `style`
// lands on this field's own outer `View`, `inputStyle` on the `TextInput`
// — is real for `TextField`, not merely type-level: each merges onto its
// own element's own style rather than replacing it, and neither leaks onto
// the other's element.
describe('<TextField /> style and inputStyle', () => {
  it("merges a caller's style onto its own outer root without replacing the root's own layout", () => {
    render(
      <TextField label="Message" value="" onChangeText={jest.fn()} style={{ marginTop: 10 }} />,
    );

    const root = screen.toJSON();
    // this field's root is the tree's own single top node — never an array
    // of siblings — so this narrows `screen.toJSON()`'s own wider return
    // type down to the one shape `.props` is actually reachable on.
    if (root === null || Array.isArray(root)) {
      throw new Error('expected a single rendered root');
    }
    const flattenedRootStyle = StyleSheet.flatten(root.props.style);

    // the caller's `marginTop` survived...
    expect(flattenedRootStyle).toMatchObject({ marginTop: 10 });
    // ...alongside this field's own root layout, which a caller replacing
    // rather than extending the style would have wiped.
    expect(flattenedRootStyle).toHaveProperty('gap');
  });

  it("merges a caller's inputStyle onto the TextInput without replacing the input's own chrome, and keeps it off the root", () => {
    render(
      <TextField
        label="Message"
        value=""
        onChangeText={jest.fn()}
        testID="message"
        inputStyle={{ borderColor: 'red' }}
      />,
    );

    const input = screen.getByTestId('message');
    const flattenedInputStyle = StyleSheet.flatten(input.props.style);

    // the caller's `borderColor` survived...
    expect(flattenedInputStyle).toMatchObject({ borderColor: 'red' });
    // ...alongside the input's own chrome, which a caller replacing rather
    // than extending the style would have wiped.
    expect(flattenedInputStyle).toHaveProperty('borderRadius');

    // `inputStyle` never reaches the outer root.
    const root = screen.toJSON();
    if (root === null || Array.isArray(root)) {
      throw new Error('expected a single rendered root');
    }
    expect(StyleSheet.flatten(root.props.style)).not.toHaveProperty('borderColor');
  });
});
