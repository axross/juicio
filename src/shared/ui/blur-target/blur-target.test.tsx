// registers this project's real themes against the mocked
// `StyleSheet.configure` — see `../portal/portal.test.tsx`'s own comment on
// why this side-effect import has to run before anything themed renders.
import '@/core/theme/unistyles';

import { render, screen } from '@testing-library/react-native';
import type { RefObject } from 'react';
import { Text, type View } from 'react-native';

import { BlurTarget, BlurTargetProvider, useBlurTargetRef } from './blur-target';

/** reads `useBlurTargetRef()` and hands the ref it returns to the test
 * through `onRef`, rendering nothing of its own — mirrors `../portal/
 * portal.test.tsx`'s own `Portalled` helper. */
function RefReader({ onRef }: { onRef: (ref: RefObject<View | null>) => void }) {
  onRef(useBlurTargetRef());
  return null;
}

describe('<BlurTargetProvider /> / useBlurTargetRef', () => {
  it('throws when useBlurTargetRef is called with no <BlurTargetProvider /> ancestor', async () => {
    // suppresses RNTL's own console output for this expected render-phase
    // throw — see `../portal/portal.test.tsx`'s identical test for why.
    const consoleError = jest.spyOn(console, 'error').mockImplementation(() => {});

    expect(() => render(<RefReader onRef={() => {}} />)).toThrow(
      'useBlurTargetRef must be called from a component rendered beneath <BlurTargetProvider />',
    );

    consoleError.mockRestore();
  });

  it('hands every descendant the same ref object', async () => {
    let refA: RefObject<View | null> | undefined;
    let refB: RefObject<View | null> | undefined;

    await render(
      <BlurTargetProvider>
        <RefReader
          onRef={(ref) => {
            refA = ref;
          }}
        />
        <RefReader
          onRef={(ref) => {
            refB = ref;
          }}
        />
      </BlurTargetProvider>,
    );

    expect(refA).toBeDefined();
    expect(refA).toBe(refB);
  });
});

describe('<BlurTarget />', () => {
  // `<BlurTarget />` itself calls `useBlurTargetRef()` internally, so it
  // needs a `<BlurTargetProvider />` ancestor the same as any other
  // consumer — this builds that tree once for both tests below.
  function TargetTree() {
    return (
      <BlurTargetProvider>
        <BlurTarget>
          <Text>screen content</Text>
        </BlurTarget>
      </BlurTargetProvider>
    );
  }

  it('renders its children', async () => {
    await render(<TargetTree />);

    expect(screen.getByText('screen content')).toBeTruthy();
  });

  // the ref `<BlurTarget />` attaches to `expo-blur`'s own `BlurTargetView`
  // is the exact object `useBlurTargetRef()` hands every other consumer —
  // `../bottom-sheet/bottom-sheet.tsx`'s own `BlurView` backdrop reads this
  // same object to find what to blur. this only proves the two sides share
  // one ref, not that Android's native blur actually samples from it —
  // that stays a manual device check (docs/conventions/testing.md).
  it('attaches the shared ref to the rendered BlurTargetView', async () => {
    let observedRef: RefObject<View | null> | undefined;

    await render(
      <BlurTargetProvider>
        <RefReader
          onRef={(ref) => {
            observedRef = ref;
          }}
        />
        <BlurTarget>
          <Text>screen content</Text>
        </BlurTarget>
      </BlurTargetProvider>,
    );

    expect(observedRef?.current).not.toBeNull();
  });
});
