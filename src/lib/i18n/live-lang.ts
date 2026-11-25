import { useSyncExternalStore } from "react";
import type { Lang, UiLang } from "@/lib/i18n";

// The language switched to without a reload (S-27, english-version; plan, "Przełącznik w pokoju"): in the room
// (RoomScreen) and on the latecomer's waiting screen (JoinWaiting), where a reload would lose the chat and the vote
// being made. The page's islands (the header's and the screen's) are separate React trees, so the language lives here,
// in the module they share in the browser; every other page reloads instead and never sets it. null until the person
// switches, then always theirs, for as long as the page lives.
let chosen: Lang | null = null;
const listeners = new Set<() => void>();

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

// Only in the browser, on the person's own press (LanguageSwitch). The page's <html lang> goes along, so a screen reader
// reads the new texts in their language.
export function switchLang(lang: Lang): void {
  chosen = lang;
  document.documentElement.lang = lang;
  for (const listener of listeners) listener();
}

// The language of an island's texts: the one switched to on this page, else the page's own (lang, from Astro.locals.lang).
export function useScreenLang(lang: UiLang): UiLang {
  return (
    useSyncExternalStore(
      subscribe,
      () => chosen,
      () => null,
    ) ?? lang
  );
}
