// registers this project's real themes against the mocked
// `StyleSheet.configure` — see `../segmented-tabs/segmented-tabs.test.tsx`
// for why this side-effect import must run before anything themed renders.
import '@/core/theme/unistyles';

import { Image } from 'react-native';

import { render, screen, within } from '@testing-library/react-native';
import { SvgXml } from 'react-native-svg';

import { EmptyState } from './empty-state';
import { HourglassIllustration } from './hourglass-illustration';
import { SharkIllustration } from './shark-illustration';

// an automock reaches `@sentry/react-native` via `report-error`, which
// starts a real `setInterval` nothing here clears — see
// `../../../core/navigation/nav-bar.test.tsx`.
jest.mock('@/core/instrumentation/report-error', () => ({ reportError: jest.fn() }));

// proves this component renders whatever real illustration its caller
// passes, not only a stand-in — `Image` above already proves the cloning
// mechanics; this proves a real illustration component works the same way.
describe('<EmptyState /> real caller-supplied illustration', () => {
  it('renders the hourglass illustration when the caller passes it', async () => {
    await render(
      <EmptyState
        illustration={<HourglassIllustration />}
        heading="Nothing to look back on"
        description="Run an analysis."
      />,
    );

    expect(screen.UNSAFE_getByType(SvgXml).props.xml).toContain('id="Hourglass"');
  });
});

// `EmptyState`'s three non-root children carry local testIDs per
// docs/conventions/component-contracts.md's "A Non-Root Child Gets Its Own
// Local testID". a local id is not unique across the tree — Analyze's and
// History's empty states are both mounted at once — so each is reachable
// only scoped through the root, and each stays absent entirely when the
// caller gave the root no testID to scope from.
describe('<EmptyState /> non-root child testIDs', () => {
  it('gives each non-root child a local id, reachable scoped through the root', async () => {
    await render(
      <EmptyState
        illustration={<SharkIllustration />}
        heading="No hands yet"
        description="Play one."
        testID="empty"
      />,
    );

    const root = within(screen.getByTestId('empty'));

    expect(root.getByTestId('illustration')).toBeTruthy();
    expect(root.getByTestId('heading')).toBeTruthy();
    expect(root.getByTestId('description')).toBeTruthy();
  });

  it('gives no child a testID when the caller gave the root none', async () => {
    await render(
      <EmptyState
        illustration={<SharkIllustration />}
        heading="No hands yet"
        description="Play one."
      />,
    );

    expect(screen.queryByTestId('illustration')).toBeNull();
    expect(screen.queryByTestId('heading')).toBeNull();
    expect(screen.queryByTestId('description')).toBeNull();
  });
});

// proves this component renders whatever illustration its caller hands it,
// stamped with this component's own testID. `Image` stands in for a real
// illustration precisely because it is not one, so the test cannot pass by
// this component rendering a shark of its own underneath.
describe('<EmptyState /> caller-supplied illustration', () => {
  it("renders whatever illustration element its caller passed, stamped with this component's own local testID", async () => {
    await render(
      <EmptyState
        illustration={<Image source={{ uri: 'stand-in.png' }} />}
        heading="No hands yet"
        description="Play one."
        testID="empty"
      />,
    );

    const illustration = within(screen.getByTestId('empty')).getByTestId('illustration');

    // `Image`'s own host-rendered type name — proof this is the caller's
    // `Image`, not the shark or any other real illustration component,
    // neither of which has a `source` prop to compare against either.
    expect(illustration.type).toBe('Image');
    expect(illustration.props.source).toEqual({ uri: 'stand-in.png' });
  });
});

// proves docs/conventions/component-contracts.md's "Props Inherit the Root
// Child Element's Own Props" and "Propagate Rest Props to the Root Child
// Element" rules are real for `EmptyState`'s own root `View`, not merely
// type-level.
describe('<EmptyState /> rest props and style', () => {
  it('merges a caller-supplied style onto its own root style rather than replacing it', async () => {
    await render(
      <EmptyState
        illustration={<SharkIllustration />}
        heading="No hands yet"
        description="Play one."
        testID="empty"
        style={{ marginTop: 10 }}
      />,
    );

    const root = screen.getByTestId('empty');
    const flattenedStyle = Array.isArray(root.props.style)
      ? Object.assign({}, ...root.props.style.flat(Infinity).filter(Boolean))
      : root.props.style;

    // the caller's `marginTop` survived...
    expect(flattenedStyle).toMatchObject({ marginTop: 10 });
    // ...alongside this component's own centring, which a caller replacing
    // rather than extending the style would have wiped.
    expect(flattenedStyle).toHaveProperty('alignItems');
  });

  it('propagates a prop this project names nothing for, straight through to its own root', async () => {
    await render(
      <EmptyState
        illustration={<SharkIllustration />}
        heading="No hands yet"
        description="Play one."
        testID="empty"
        accessibilityHint="nothing to review yet"
      />,
    );

    expect(screen.getByTestId('empty').props.accessibilityHint).toBe('nothing to review yet');
  });
});
