import '@/core/theme/unistyles';

import { render, screen } from '@testing-library/react-native';

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
