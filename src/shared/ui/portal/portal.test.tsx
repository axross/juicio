// registers this project's real themes against the mocked
// `StyleSheet.configure` — see `../segmented-tabs/segmented-tabs.test.tsx`'s
// own comment on why this side-effect import has to run before anything
// themed renders.
import '@/core/theme/unistyles';

import { render, screen, within } from '@testing-library/react-native';
import type { ReactNode } from 'react';
import { Text, View } from 'react-native';

import { PortalHost, usePortal } from './portal';

/** calls `usePortal` with `node`, rendering nothing of its own — the
 * caller's own tree position is exactly what these tests prove the
 * portalled node does *not* end up at. */
function Portalled({ node }: { node: ReactNode }) {
  usePortal(node);
  return null;
}

describe('<PortalHost /> / usePortal', () => {
  it('renders children with no portal entries mounted', async () => {
    await render(
      <PortalHost>
        <Text>base content</Text>
      </PortalHost>,
    );

    expect(screen.getByText('base content')).toBeTruthy();
  });

  it("renders a portalled node at the host's own position, not at the calling component's own position in the tree", async () => {
    await render(
      <PortalHost>
        <View testID="elsewhere">
          <Portalled node={<Text testID="portalled">portalled content</Text>} />
        </View>
      </PortalHost>,
    );

    expect(screen.getByTestId('portalled')).toBeTruthy();
    expect(within(screen.getByTestId('elsewhere')).queryByTestId('portalled')).toBeNull();
  });

  it('throws when usePortal is called with no <PortalHost /> ancestor', async () => {
    // RNTL logs React's own "error boundary" console output for a thrown
    // render; suppressing it here keeps this expected failure from
    // spamming the test run the way every other test file in this
    // repository already does for an expected console error. `render()` is
    // synchronous on this project's RNTL (see docs/conventions/testing.md),
    // so a render-phase throw propagates out of the call itself rather than
    // surfacing as a rejection.
    const consoleError = jest.spyOn(console, 'error').mockImplementation(() => {});

    expect(() => render(<Portalled node={<Text>x</Text>} />)).toThrow(
      'usePortal must be called from a component rendered beneath <PortalHost />',
    );

    consoleError.mockRestore();
  });

  it('removes the entry when the node changes to null', async () => {
    const { rerender } = await render(
      <PortalHost>
        <Portalled node={<Text testID="portalled">x</Text>} />
      </PortalHost>,
    );
    expect(screen.getByTestId('portalled')).toBeTruthy();

    await rerender(
      <PortalHost>
        <Portalled node={null} />
      </PortalHost>,
    );

    expect(screen.queryByTestId('portalled')).toBeNull();
  });

  it('removes the entry when the calling component itself unmounts', async () => {
    const { rerender } = await render(
      <PortalHost>
        <Portalled node={<Text testID="portalled">x</Text>} />
      </PortalHost>,
    );
    expect(screen.getByTestId('portalled')).toBeTruthy();

    await rerender(<PortalHost>{null}</PortalHost>);

    expect(screen.queryByTestId('portalled')).toBeNull();
  });

  // paints later siblings over earlier ones (React Native's own stacking
  // order) — `children` first, every portal entry after — is
  // `<PortalHost />`'s whole reason to exist (see its own doc comment):
  // this is what lets a portalled bottom sheet cover the tab bar `Tabs`
  // itself draws as part of `children`. RNTL runs no layout engine, so
  // this cannot prove the *visual* result on a real device (see
  // `docs/conventions/testing.md`'s own limits on that) — it instead pins
  // the one thing that actually decides paint order under the hood: the
  // rendered tree's own sibling order, both for `children` against a
  // portal entry, and for two portal entries against each other in the
  // order they mounted.
  it('renders every portal entry after children, and stacks multiple entries in mount order', async () => {
    const { rerender } = await render(
      <PortalHost>
        <Text testID="base">base</Text>
        <Portalled node={<Text testID="first">first</Text>} />
      </PortalHost>,
    );

    const serializedOneEntry = JSON.stringify(screen.toJSON());
    expect(serializedOneEntry.indexOf('base')).toBeLessThan(serializedOneEntry.indexOf('first'));

    await rerender(
      <PortalHost>
        <Text testID="base">base</Text>
        <Portalled node={<Text testID="first">first</Text>} />
        <Portalled node={<Text testID="second">second</Text>} />
      </PortalHost>,
    );

    const serializedTwoEntries = JSON.stringify(screen.toJSON());
    expect(serializedTwoEntries.indexOf('first')).toBeLessThan(
      serializedTwoEntries.indexOf('second'),
    );
  });
});
