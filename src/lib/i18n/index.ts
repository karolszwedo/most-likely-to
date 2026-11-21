import { pl } from "@/lib/i18n/pl";
import { pseudoOf } from "@/lib/i18n/pseudo";

// The game's texts (S-27, english-version, PRD FR-031): every text a screen shows lives in the dictionary of its
// language, never in the screen's code. Plain TypeScript modules, no library: the Polish dictionary (src/lib/i18n/pl/)
// is the pattern of the type, and from phase 4 the English one has to have every key of it (`npx astro check`). A text
// with a parameter is a function, a count's noun goes through plural, a date through dateFormat. Nothing here may
// pull server code into the browser: the islands import this module (context/foundation/lessons.md, "Pytania gry
// tylko po stronie serwera"); the game's questions are never in a dictionary.
//
// A new text goes to the dictionary of its screen in src/lib/i18n/pl/ (and from phase 4 to the English one too);
// `npm run lint` refuses a line with a Polish letter outside a comment in the screens' code (scripts/ui-text.mjs).

export type Lang = "pl" | "en";
export const LANGS: readonly Lang[] = ["pl", "en"];

// The previews' pseudo language (context/changes/english-version/reviews/plan-review.md, F2): /dev/*?lang=xx shows
// every text of the dictionary in ⟦…⟧, so a text still written in a screen's code stands out on the preview without
// them, whatever its letters. Outside Lang on purpose and off outside `astro dev`.
export const PSEUDO = "xx";
export type UiLang = Lang | typeof PSEUDO;

export type Messages = typeof pl;

export function isLang(value: unknown): value is Lang {
  return value === "pl" || value === "en";
}

let pseudo: Messages | null = null;

// The dictionary of a screen's language. Phase 1: Polish for both languages, the English dictionary comes in phase 4.
export function messages(lang: UiLang): Messages {
  if (lang === PSEUDO && import.meta.env.DEV) {
    pseudo ??= pseudoOf(pl);
    return pseudo;
  }
  return pl;
}

// The page's <html lang>: the pseudo language is Polish underneath.
export function htmlLang(lang: UiLang): Lang {
  return lang === PSEUDO ? "pl" : lang;
}

// /dev/*?lang=xx in `astro dev` only (src/middleware.ts); null everywhere else.
export function devPseudoLang(url: URL): typeof PSEUDO | null {
  return import.meta.env.DEV && url.pathname.startsWith("/dev/") && url.searchParams.get("lang") === PSEUDO
    ? PSEUDO
    : null;
}

// The language a question's sentence is put together in: always its text's own (plan, "Język treści pytania"), so a
// sentence never mixes two languages; in the pseudo language the screen's, so the preview shows its start in ⟦…⟧ too.
// Phase 1: every text is Polish.
export function contentLang(textLang: Lang, screen: UiLang): UiLang {
  return screen === PSEUDO ? PSEUDO : textLang;
}

export type PluralForms = Partial<Record<Intl.LDMLPluralRule, string>>;

const pluralRules = new Map<Lang, Intl.PluralRules>();

// The form of a noun after a count, by the language's own rules (Intl.PluralRules): Polish one ("1 głos"), few ("2
// głosy", "22 głosy") and many ("0 głosów", "5 głosów", "12 głosów"); English one and other. A form the language's rule
// names but forms lack falls back to other, then many.
export function plural(lang: Lang, count: number, forms: PluralForms): string {
  let rules = pluralRules.get(lang);
  if (!rules) {
    rules = new Intl.PluralRules(lang);
    pluralRules.set(lang, rules);
  }
  return forms[rules.select(count)] ?? forms.other ?? forms.many ?? "";
}

// Always the game's own time zone, never the runtime's: the Worker runs in UTC, and a date made in the browser would
// differ from the server's render. Polish pl-PL, English en-GB (plan, "What We're NOT Doing": no viewer's time zone).
export const TIME_ZONE = "Europe/Warsaw";
const LOCALES: Record<Lang, string> = { pl: "pl-PL", en: "en-GB" };

export function dateFormat(lang: Lang, options: Intl.DateTimeFormatOptions): Intl.DateTimeFormat {
  return new Intl.DateTimeFormat(LOCALES[lang], { ...options, timeZone: TIME_ZONE });
}
