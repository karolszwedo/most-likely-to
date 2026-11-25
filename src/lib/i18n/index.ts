import { en } from "@/lib/i18n/en";
import { pl } from "@/lib/i18n/pl";
import { pseudoOf } from "@/lib/i18n/pseudo";

// The game's texts (S-27, english-version, PRD FR-031): every text a screen shows lives in the dictionary of its
// language, never in the screen's code. Plain TypeScript modules, no library: the Polish dictionary (src/lib/i18n/pl/)
// is the pattern of the type, and the English one (src/lib/i18n/en/) has to have every key of it (`npx astro check`). A
// text with a parameter is a function, a count's noun goes through plural, a date through dateFormat. Nothing here may
// pull server code into the browser: the islands import this module (context/foundation/lessons.md, "Pytania gry
// tylko po stronie serwera"); the game's questions are never in a dictionary.
//
// A new text goes to the dictionary of its screen in both languages, src/lib/i18n/pl/ and src/lib/i18n/en/;
// `npm run lint` refuses a line with a Polish letter outside a comment in the screens' code (scripts/ui-text.mjs).
//
// Which language a person's screen is in: src/lib/i18n/screen-lang.ts (the server, every page) and
// src/lib/i18n/live-lang.ts (a switch without a reload, in the room and on the waiting screen).

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

// The dictionary of a screen's language.
export function messages(lang: UiLang): Messages {
  if (lang === PSEUDO && import.meta.env.DEV) {
    pseudo ??= pseudoOf(pl);
    return pseudo;
  }
  return lang === "en" ? en : pl;
}

// The page's <html lang>: the pseudo language is Polish underneath.
export function htmlLang(lang: UiLang): Lang {
  return lang === PSEUDO ? "pl" : lang;
}

// A preview's language, /dev/*?lang=en or ?lang=xx in `astro dev` only (src/middleware.ts): Polish without the
// parameter, so a preview never follows the cookie or the browser; null everywhere else.
export function devPreviewLang(url: URL): UiLang | null {
  if (!import.meta.env.DEV || !url.pathname.startsWith("/dev/")) return null;
  const asked = url.searchParams.get("lang");
  return asked === PSEUDO || asked === "en" ? asked : "pl";
}

// The language a question's sentence is put together in: always its text's own (plan, "Język treści pytania"), so a
// sentence never mixes two languages; in the pseudo language the screen's, so the preview shows its start in ⟦…⟧ too.
export function contentLang(textLang: Lang, screen: UiLang): UiLang {
  return screen === PSEUDO ? PSEUDO : textLang;
}

// The lang of an element whose words are in another language than its screen (a base question with no text in the
// screen's language); undefined for the screen's own, which <html lang> already says.
export function foreignLang(lang: UiLang, screen: UiLang): Lang | undefined {
  return lang === screen ? undefined : htmlLang(lang);
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
