// registers this project's real themes against the mocked
// `StyleSheet.configure` — see `../segmented-tabs/segmented-tabs.test.tsx`
// for why this side-effect import must run before anything themed renders.
import '@/core/theme/unistyles';

import { createHash } from 'node:crypto';

import { render, screen, within } from '@testing-library/react-native';
import { SvgXml } from 'react-native-svg';

import { EmptyState } from './empty-state';
import { HOURGLASS_ILLUSTRATION_XML } from './hourglass-illustration';

// an automock reaches `@sentry/react-native` via `report-error`, which
// starts a real `setInterval` nothing here clears — see
// `../../../core/navigation/nav-bar.test.tsx`.
jest.mock('@/core/instrumentation/report-error', () => ({ reportError: jest.fn() }));

// issue #263's own acceptance criterion: the hourglass illustration's
// markup in code must stay byte-identical to the SVG recorded there as
// its source of truth — a drift a type check or a markup-content
// assertion could not catch, since either would still pass against a
// bit-for-bit-altered string.
const HOURGLASS_SVG_SHA256 = 'a221a93cadc368ca0e34a8375b0ea39ca4714b5bf356929a3858a8b9e412a62c';

describe('<EmptyState /> illustration choice', () => {
  it('renders the shark illustration when the caller chooses none, per its default', async () => {
    await render(<EmptyState heading="No hands yet" description="Play one." />);

    const { xml } = screen.UNSAFE_getByType(SvgXml).props;

    expect(xml).toContain('id="Shark Body"');
    expect(xml).not.toBe(HOURGLASS_ILLUSTRATION_XML);
  });

  it('renders the hourglass illustration when the caller chooses it', async () => {
    await render(
      <EmptyState
        heading="Nothing to look back on"
        description="Run an analysis."
        illustration="hourglass"
      />,
    );

    expect(screen.UNSAFE_getByType(SvgXml).props.xml).toBe(HOURGLASS_ILLUSTRATION_XML);
  });

  it("keeps the hourglass illustration's exported markup byte-identical to the SVG issue #263 records", () => {
    expect(createHash('sha256').update(HOURGLASS_ILLUSTRATION_XML).digest('hex')).toBe(
      HOURGLASS_SVG_SHA256,
    );
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
    await render(<EmptyState heading="No hands yet" description="Play one." testID="empty" />);

    const root = within(screen.getByTestId('empty'));

    expect(root.getByTestId('illustration')).toBeTruthy();
    expect(root.getByTestId('heading')).toBeTruthy();
    expect(root.getByTestId('description')).toBeTruthy();
  });

  it('gives no child a testID when the caller gave the root none', async () => {
    await render(<EmptyState heading="No hands yet" description="Play one." />);

    expect(screen.queryByTestId('illustration')).toBeNull();
    expect(screen.queryByTestId('heading')).toBeNull();
    expect(screen.queryByTestId('description')).toBeNull();
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
        heading="No hands yet"
        description="Play one."
        testID="empty"
        accessibilityHint="nothing to review yet"
      />,
    );

    expect(screen.getByTestId('empty').props.accessibilityHint).toBe('nothing to review yet');
  });
});
