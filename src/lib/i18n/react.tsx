import { createContext, useContext, useMemo, type ReactNode } from "react";
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
