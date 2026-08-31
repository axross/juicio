// registers this project's real themes against the mocked
// `StyleSheet.configure` — see `../../../shared/ui/segmented-tabs/
// segmented-tabs.test.tsx` for why this side-effect import must run before
// anything themed renders.
import '@/core/theme/unistyles';

import { render, screen } from '@testing-library/react-native';

import { DisclosureRow } from './disclosure-row';

// proves docs/conventions/component-contracts.md's "Props Inherit the Root
// Child Element's Own Props" and "Propagate Rest Props to the Root Child
// Element" rules are real for `DisclosureRow`'s own root — `<SettingsRow>`,
// which in turn forwards onto its own root `Pressable` — not merely
// type-level.
describe('<DisclosureRow /> rest props and style', () => {
  it('merges a caller-supplied style onto its own root style rather than replacing it', () => {
    render(
      <DisclosureRow
        label="Language"
        onPress={jest.fn()}
        accessibilityLabel="Language"
        position="single"
        testID="row"
        style={{ marginTop: 10 }}
      />,
    );

    const root = screen.getByTestId('row');
    const flattenedStyle = Array.isArray(root.props.style)
      ? Object.assign({}, ...root.props.style.flat(Infinity).filter(Boolean))
      : root.props.style;

    // the caller's `marginTop` survived...
    expect(flattenedStyle).toMatchObject({ marginTop: 10 });
    // ...alongside `SettingsRow`'s own chrome, which a caller replacing
    // rather than extending the style would have wiped.
    expect(flattenedStyle).toHaveProperty('backgroundColor');
  });

  it('propagates a prop this project names nothing for, straight through to its own root', () => {
    render(
      <DisclosureRow
        label="Language"
        onPress={jest.fn()}
        accessibilityLabel="Language"
        position="single"
        testID="row"
        hitSlop={8}
      />,
    );

    expect(screen.getByTestId('row').props.hitSlop).toBe(8);
  });
});
