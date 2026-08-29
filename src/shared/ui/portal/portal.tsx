import type { ReactNode } from 'react';
import {
  createContext,
  useCallback,
  useContext,
  useId,
  useLayoutEffect,
  useMemo,
  useState,
} from 'react';
import { View } from 'react-native';
import { StyleSheet } from 'react-native-unistyles';

type PortalEntry = { readonly id: string; readonly node: ReactNode };

type PortalContextValue = {
  readonly mount: (id: string, node: ReactNode) => void;
  readonly unmount: (id: string) => void;
};

const PortalContext = createContext<PortalContextValue | null>(null);

/**
 * renders `node` at the app root — inside `<PortalHost />` (mounted once,
 * in `src/app/_layout.tsx`, above `<Stack>`, per `<PortalHost />`'s own
 * doc comment below) — instead of wherever the calling component itself
 * sits in the tree. Pass `null` to render nothing; a caller does not have
 * to unmount its own entry by hand, since this hook does that itself on
 * every `node` change and on the caller's own unmount.
 *
 * this is this project's whole in-tree substitute for `@gorhom/portal` —
 * see
 * docs/decisions/2026-08-29-build-the-bottom-sheet-in-tree-rather-than-adopt-gorhom.md
 * for why that dependency, and React Native's own `<Modal>`, are both out.
 * it does not move `node` into a different React *tree* the way a DOM
 * portal would — mobile native exposes no such primitive to app code — it
 * lifts `node` into `<PortalHost />`'s own state instead, so `node` renders
 * as `<PortalHost />`'s own child in the real component tree while still
 * closing over whatever props and state the calling component built it
 * from. every context a portalled node depends on therefore has to be
 * available as an ancestor of `<PortalHost />` itself, not of the caller —
 * true today for the three contexts a bottom sheet's own content actually
 * reaches for: `react-native-gesture-handler`'s root context (this is
 * exactly why `<PortalHost />` MUST sit inside `GestureHandlerRootView` —
 * see its own doc comment), Unistyles' theme (read from a native registry,
 * never React context, per `react-component-styling`'s Unistyles
 * reference), and `react-i18next`'s translations (this app never wraps
 * itself in an `I18nextProvider`, so `useTranslation` already reads the
 * global `i18next` instance from any tree position).
 */
export function usePortal(node: ReactNode | null): void {
  const context = useContext(PortalContext);
  if (context === null) {
    throw new Error('usePortal must be called from a component rendered beneath <PortalHost />');
  }

  // React's own built-in `useId` — a stable id for this call site's whole
  // lifetime, safe to read during render (unlike a module-level counter
  // mutated in a ref, which this project's own `react-hooks/globals` and
  // `react-hooks/refs` rules both correctly reject: a ref read during
  // render, and a module-scope variable reassigned during render, are both
  // side effects render is not supposed to have).
  const id = useId();

  // registers (or replaces) this id's own entry on every `node` change —
  // a layout effect, not a plain effect, so the entry is live before the
  // next paint rather than one frame after it, the same reasoning
  // `selection-grid.tsx`'s own ref-sync effect gives for choosing one over
  // a plain `useEffect`.
  useLayoutEffect(() => {
    if (node === null) {
      context.unmount(id);
      return;
    }
    context.mount(id, node);
    // no cleanup here: unmounting on every `node` change (rather than only
    // on this hook's own unmount, below) would remove-then-re-add this id
    // on every render that changes `node`'s own identity — which a JSX
    // expression recreated fresh every render always does — for no
    // purpose `mount`'s own replace-in-place behaviour does not already
    // cover.
  }, [context, id, node]);

  // this id's own entry MUST still be removed when the calling component
  // itself unmounts while `node` was non-null — the effect above has no
  // further render to run its own `node === null` branch from by then.
  // registered once, for this hook's whole lifetime.
  useLayoutEffect(() => {
    return () => context.unmount(id);
    // `context` and `id` are both stable for this hook's whole lifetime
    // (see their own definitions above); this cleanup fires exactly once,
    // on this hook's own unmount.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
}

/**
 * the portal's own host, mounted exactly once — in `src/app/_layout.tsx`,
 * above `<Stack>`, inside `GestureHandlerRootView` — never inside a
 * feature. Renders `children` first, then every current `usePortal` entry
 * as a later sibling, absolutely positioned over the whole window: React
 * Native paints later siblings over earlier ones, so a portalled node
 * always paints above `children` — this is what lets
 * `../bottom-sheet/bottom-sheet.tsx` cover the tab bar the `Tabs` navigator
 * draws inside `children`, with neither `<Stack>` nor the tab bar needing
 * to know a sheet exists. Entries stack in the order they were mounted —
 * the same rule, applied to more than one entry — so a future modal
 * surface that mounts after an already-open bottom sheet paints above it,
 * with no explicit z-index of its own to keep in sync.
 *
 * **does not extend `ComponentProps<typeof View>` (or any other element's),
 * unlike this project's other components.** Its own root is a
 * `<PortalContext.Provider>` — a context wrapper with no native view of its
 * own, never a `View`, `Pressable`, or any other rendered element a rest
 * prop could land on — so there is no "root child element" for
 * `docs/conventions/component-contracts.md`'s props-inheritance rule to
 * mean anything against. Its contract stays exactly `{ children: ReactNode
 * }`, the one thing this host actually needs from its caller.
 */
export function PortalHost({ children }: { children: ReactNode }) {
  const [entries, setEntries] = useState<readonly PortalEntry[]>([]);

  const mount = useCallback((id: string, node: ReactNode) => {
    setEntries((current) => [...current.filter((entry) => entry.id !== id), { id, node }]);
  }, []);

  const unmount = useCallback((id: string) => {
    setEntries((current) => current.filter((entry) => entry.id !== id));
  }, []);

  const value = useMemo(() => ({ mount, unmount }), [mount, unmount]);

  return (
    <PortalContext.Provider value={value}>
      {children}
      {entries.map((entry) => (
        // `box-none`: this wrapper's own empty area never captures a
        // touch — only whatever `entry.node` itself renders (a bottom
        // sheet's own full-bleed backdrop, say) does, the same way it
        // already would without this wrapper in between.
        <View key={entry.id} style={styles.entry} pointerEvents="box-none">
          {entry.node}
        </View>
      ))}
    </PortalContext.Provider>
  );
}

const styles = StyleSheet.create(() => ({
  entry: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
  },
}));
