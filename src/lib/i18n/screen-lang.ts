import type { AstroCookieSetOptions } from "astro";
import { isLang, type Lang } from "@/lib/i18n";

// A person's screen language on the server (S-27, english-version; plan, decisions 3 and 4): the language they picked
// with the switch in the corner of every screen (the cookie LANG_COOKIE), else their browser's. The game itself has no
// language, so nothing here reads the database. No astro:* import, so the unit tests load it (src/middleware.ts uses it).

// Set only by POST /api/lang; the values are the languages' codes.
export const LANG_COOKIE = "mlt-lang";
const LANG_COOKIE_MAX_AGE = 60 * 60 * 24 * 365;

// As the guest's cookie (src/lib/rooms/tokens.ts): Secure only on https, or a phone on http://<LAN IP> would reject it.
export function langCookieOptions(url: URL): AstroCookieSetOptions {
  return {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: LANG_COOKIE_MAX_AGE,
    secure: url.protocol === "https:",
  };
}

interface Tag {
  // The main subtag in lower case: "pl" of "pl-PL".
  main: string;
  q: number;
}

// One entry of Accept-Language ("en-US", "pl;q=0.8"); null for an empty one. A weight that is not a number from 0 to 1
// counts as 0, as if the language were refused.
function readTag(entry: string): Tag | null {
  const [range, ...params] = entry.split(";").map((part) => part.trim());
  if (range === "") return null;
  const weight = params.find((param) => /^q=/i.test(param));
  const q = weight === undefined ? 1 : Number(weight.slice(2));
  return { main: range.toLowerCase().split("-")[0], q: q >= 0 && q <= 1 ? q : 0 };
}

// The language a screen opens in: the cookie's, when it holds one; else the first of Polish and English on the
// browser's list by its weights (the earlier one on a tie, a language with q=0 left out); English when the list names
// neither; Polish with no list at all (no header, an empty one, or only "*": bots, Discord's card, smoke).
export function screenLang(cookie: string | undefined, acceptLanguage: string | null): Lang {
  const tags = (acceptLanguage ?? "")
    .split(",")
    .map(readTag)
    .filter((tag) => tag !== null);
  // Array.prototype.sort keeps the order of equal weights.
  const first = tags
    .filter((tag) => tag.q > 0)
    .sort((a, b) => b.q - a.q)
    .find((tag) => isLang(tag.main));
  if (first && isLang(first.main)) return first.main;
  if (isLang(cookie)) return cookie;
  return tags.some((tag) => tag.main !== "*") ? "en" : "pl";
}

// Where POST /api/lang sends the browser back to: the path and query of next on this site, "/" for anything else. The
// browser reads "\" as "/", so next goes through the URL parser and never by its first characters, and what comes out
// goes through it once more: "/.//evil.com" on this site has the path "//evil.com", an address of another site.
export function nextPath(next: string | null, origin: string): string {
  if (next === null || !URL.canParse(next, origin)) return "/";
  const url = new URL(next, origin);
  if (url.origin !== origin) return "/";
  const path = url.pathname + url.search;
  return URL.canParse(path, origin) && new URL(path, origin).origin === origin ? path : "/";
}

// The language GET /api/rooms/<id>/lobby answers in: the one the room's screen asks for (?lang=, as it may have been
// switched a moment ago, before the cookie is set), else the request's own (cookie, then browser); null for a value
// that is no language.
export function askedLang(params: URLSearchParams, requestLang: Lang): Lang | null {
  const asked = params.get("lang");
  if (asked === null) return requestLang;
  return isLang(asked) ? asked : null;
}
