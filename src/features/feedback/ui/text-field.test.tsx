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
});
