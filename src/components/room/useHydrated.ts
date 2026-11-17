import { useSyncExternalStore } from "react";

// Nothing to listen to: once the island runs in the browser the answer never changes. A constant of the module, so
// React does not subscribe again on every render.
const subscribeNever = () => () => undefined;

// Whether the island runs in the browser: false in the server's render and in the hydration's first render (so the two
// match), true from the render right after hydration, and from the first render of a component mounted later. For a
// control that must not work before the island's own handler does (B-1: "Zagłosuj" before hydration would let the
// browser send the vote's form itself, into the page's address).
export function useHydrated(): boolean {
  return useSyncExternalStore(
    subscribeNever,
    () => true,
    () => false,
  );
}
