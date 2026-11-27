import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react";
import { messages, type Messages, type UiLang } from "@/lib/i18n";

// The dictionary inside an island (S-27, english-version). Each island's root wraps its tree in I18nProvider with the
// language the page hands it (`lang` in its props, from Astro.locals.lang); every component under it reads the texts
// with useT. A component Astro renders straight from a .astro file is a root of its own, as Astro never passes React
// context across its slots: it takes `lang` and wraps itself through WithI18n. Outside any provider the dictionary is
// Polish, so the previews' pseudo language (/dev/*?lang=xx) shows a missing provider as texts without ⟦…⟧.

interface I18nValue {
  lang: UiLang;
  t: Messages;
}

const I18nContext = createContext<I18nValue>({ lang: "pl", t: messages("pl") });

export function I18nProvider({ lang, children }: { lang: UiLang; children: ReactNode }) {
  const value = useMemo(() => ({ lang, t: messages(lang) }), [lang]);
  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

// For a component that is an island's child and, on some page, a root rendered straight from a .astro file
// (RoomMessage, ServerError, GameHistory): with `lang` it provides the dictionary itself, without it reads the island's.
export function WithI18n({ lang, children }: { lang?: UiLang; children: ReactNode }) {
  return lang === undefined ? children : <I18nProvider lang={lang}>{children}</I18nProvider>;
}

export function useT(): Messages {
  return useContext(I18nContext).t;
}

export function useLang(): UiLang {
  return useContext(I18nContext).lang;
}

type Text = string | null | undefined;

// The state of a text already put into the screen's language (a refusal's, a notice's), null with none. The switch of
// the language without a reload (src/lib/i18n/live-lang.ts) takes a shown one away for good, as it would stay in the
// old language until the next move. One that comes after the switch from a move sent before it is shown, in the
// language of that move: a refusal in the other language is better than a move that ends with no word.
export function useTextState(initial: Text): [string | null, (text: Text) => void] {
  const lang = useLang();
  const [text, setText] = useState<string | null>(initial ?? null);
  // Adjusting state while rendering (react.dev, "You Might Not Need an Effect"). Before any set of the component's own
  // in the same render, so a text it makes there, already in the new language, stays.
  const [shownLang, setShownLang] = useState(lang);
  if (lang !== shownLang) {
    setShownLang(lang);
    setText(null);
  }
  const set = useCallback((next: Text) => {
    setText(next ?? null);
  }, []);
  return [text, set];
}

// What a hidden live region said last, in which language, and whether it is to stay quiet.
export interface Spoken {
  lang: UiLang;
  text: string;
  quiet: boolean;
}

// One render's step of useSpoken: a new language quiets the region, whatever it says now; a new text in the same
// language is heard; anything else keeps the state as it is (the same object, so the hook sets nothing).
export function nextSpoken(shown: Spoken, lang: UiLang, text: string): Spoken {
  if (lang !== shown.lang) return { lang, text, quiet: false };
  if (text !== shown.text) return { lang, text, quiet: false };
  return shown;
}

// The text of a hidden live region (aria-live, role="status") that a component puts together while it draws (a
// notice that stands, the newest emote, the gifs found), as against a text kept in useTextState from the move that
// made it. The switch of the language without a reload gives such a region the same words in the other language, and
// a screen reader reads a changed text as news; so after the switch the region says nothing until its words change
// for another reason (the next message, emote, link or question), and then speaks the new language. "" already in the
// render of the switch, or the region would hold the new language for a moment and be read. The same words before and
// after a move are not read again either, as today: the region's text does not change. A move that lands in the very
// render of the switch stays unheard, as in useTextState. The region's visible copy (an alert, a grey line) is drawn
// without it, so the eye gets the new language at once.
export function useSpoken(text: string): string {
  const lang = useLang();
  const [shown, setShown] = useState<Spoken>({ lang, text, quiet: false });
  // Adjusting state while rendering (react.dev, "You Might Not Need an Effect").
  const next = nextSpoken(shown, lang, text);
  if (next !== shown) setShown(next);
  return next.quiet ? "" : next.text;
}
