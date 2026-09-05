import { BlurTargetView } from 'expo-blur';
import type { ComponentProps, ReactNode, RefObject } from 'react';
import { createContext, useContext, useRef } from 'react';
import type { View } from 'react-native';
import { StyleSheet } from 'react-native-unistyles';

type BlurTargetContextValue = RefObject<View | null>;

const BlurTargetContext = createContext<BlurTargetContextValue | null>(null);

/**
 * provides the ref `../bottom-sheet/bottom-sheet.tsx`'s own `BlurView`
 * backdrop layer needs to blur Android's screen content (`blurTarget`,
 * `BlurView`'s own prop) — mirrors `../portal/portal.tsx`'s own
 * `PortalContext` pattern: a registration channel a descendant reads,
 * rather than a value it invents for itself.
 *
 * mounted once, in `src/app/_layout.tsx`, above `<PortalHost />` — never
 * inside a feature. that positioning is load-bearing the same way
 * `../portal/portal.tsx`'s own doc comment already states it for Unistyles'
 * theme, `react-i18next`'s translations, and gesture-handler's root
 * context: `BottomSheet`'s backdrop reads this context from *inside*
 * `<PortalHost />`'s own portalled output, so the provider has to be an
 * ancestor of `<PortalHost />` itself, not merely of whatever calls
 * `usePortal`.
 */
export function BlurTargetProvider({ children }: { children: ReactNode }) {
  const blurTargetRef = useRef<View>(null);

  return <BlurTargetContext.Provider value={blurTargetRef}>{children}</BlurTargetContext.Provider>;
}

/** throws when called from a component with no `<BlurTargetProvider />`
 * ancestor — the same shape `../portal/portal.tsx`'s `usePortal` throws for
 * a node rendered outside `<PortalHost />`. */
export function useBlurTargetRef(): BlurTargetContextValue {
  const context = useContext(BlurTargetContext);
  if (context === null) {
    throw new Error(
      'useBlurTargetRef must be called from a component rendered beneath <BlurTargetProvider />',
    );
  }
  return context;
}

/**
 * wraps `children` — `src/app/_layout.tsx`'s own `<Stack />` — in
 * `expo-blur`'s `BlurTargetView`, the real screen content Android's
 * `dimezisBlurViewSdk31Plus` blur method (`../bottom-sheet/bottom-sheet.tsx`)
 * samples from. Rendered *inside* `<PortalHost />`, wrapping only `<Stack />`
 * and not the portal's own later siblings — a bottom sheet's own backdrop
 * and panel — which must stay outside whatever gets blurred, or a sheet
 * would blur itself.
 *
 * reads its own ref from `<BlurTargetProvider />`'s context rather than
 * creating one locally: the same ref object both wraps this content here
 * and reaches `BottomSheet`'s backdrop, mounted elsewhere in the tree.
 *
 * `flex: 1` on this component's own root — permitted under
 * docs/conventions/component-styling.md's "Claiming the Space You Were
 * Given Is Not Choosing an Amount" — is what lets it fill whatever
 * `<GestureHandlerRootView />` allotted, the same full-screen space `<Stack
 * />` itself filled before this component wrapped it.
 */
export function BlurTarget({
  children,
  style,
  ...props
}: Omit<ComponentProps<typeof BlurTargetView>, 'ref'>) {
  const blurTargetRef = useBlurTargetRef();

  return (
    <BlurTargetView ref={blurTargetRef} style={[styles.root, style]} {...props}>
      {children}
    </BlurTargetView>
  );
}

const styles = StyleSheet.create(() => ({
  root: {
    flex: 1,
  },
}));
