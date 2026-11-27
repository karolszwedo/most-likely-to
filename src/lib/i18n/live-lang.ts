import { useSyncExternalStore } from "react";
import type { Lang, UiLang } from "@/lib/i18n";
import { logEvent } from "@/lib/log";

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

// How long one save of a pick may take before the next pick's goes.
const KEEP_TIMEOUT_MS = 10_000;

async function sendLang(lang: Lang): Promise<void> {
  try {
    const res = await fetch("/api/lang", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ lang }),
      cache: "no-store",
      // A pick right before a reload or the page's close is kept too.
      keepalive: true,
      signal: AbortSignal.timeout(KEEP_TIMEOUT_MS),
    });
    if (!res.ok) logEvent("warn", { op: "lang", step: "keep", status: res.status });
  } catch (error) {
    logEvent("warn", { op: "lang", step: "keep", errName: error instanceof Error ? error.name : "unknown" });
  }
}

// The saves so far; a failed one ends as well (sendLang logs it).
let keeping: Promise<void> = Promise.resolve();

// The room's and the waiting screen's pick kept for the next pages only (POST /api/lang). One save after another, in the
// order of the presses: of two sent at once the one answered last would win, whichever pick it was. A failure never
// takes the switch back; after a reload the screen is then in the browser's language again (blocked cookies, a known
// limit of the plan).
export function keepLang(lang: Lang): Promise<void> {
  keeping = keeping.then(() => sendLang(lang));
  return keeping;
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
