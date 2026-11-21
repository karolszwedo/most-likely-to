// The previews' pseudo dictionary (/dev/*?lang=xx, src/lib/i18n/index.ts): the Polish one with every text in ⟦…⟧ and
// every function's result in them too, so on a preview a text without the marks did not come from the dictionary.
const OPEN = "⟦";
const CLOSE = "⟧";

export function pseudoOf<T>(value: T): T {
  if (typeof value === "string") return `${OPEN}${value}${CLOSE}` as T;
  if (typeof value === "function") {
    const fn = value as (...args: unknown[]) => unknown;
    return ((...args: unknown[]) => pseudoOf(fn(...args))) as T;
  }
  if (Array.isArray(value)) return value.map((item: unknown) => pseudoOf(item)) as T;
  if (value !== null && typeof value === "object") {
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, pseudoOf(item)])) as T;
  }
  return value;
}
