// The room chat's gifs (S-24, context/changes/room-chat-gifs/plan.md): KLIPY's addresses in one place, for the
// Content-Security-Policy of every answer (src/lib/security-headers.ts), the Worker's check of a gif's address and the
// screen's search. No server imports: the browser and the unit tests load this module too.
//
// From KLIPY's documentation (docs.klipy.com/network-requirements.md, 2026-11-17): the browser searches on the API's
// origin and takes the media from these three hosts, over https only. A host KLIPY adds later is a new entry here.

import type { Lang } from "@/lib/i18n";
import { logEvent } from "@/lib/log";
import { chatText } from "@/lib/rooms/chat-text";

export const KLIPY_API_ORIGIN = "https://api.klipy.com";

export const KLIPY_MEDIA_HOSTS = ["static.klipy.com", "static1.klipy.com", "static2.klipy.com"] as const;

// The longest gif address the room takes. KLIPY's media addresses are about 100 characters, so the envelope with the
// address, its description, the nick and the signature's own fields stays well within the 4096 characters a screen
// opens (src/lib/live-sync/signature.ts) and the body within the route's 4096 bytes (src/lib/rooms/json-route.ts).
export const GIF_URL_MAX_LENGTH = 512;
// The longest description of a gif (KLIPY's title, which a screen reader reads for the image): a longer one becomes ""
// (gifTitle), never a reason to refuse the gif.
export const GIF_TITLE_MAX_LENGTH = 100;

// A gif's description as the room takes it, both KLIPY's title in the search's results (parseGifResults) and the one a
// message brings (src/lib/rooms/chat.ts): by the rules of a chat text (src/lib/rooms/chat-text.ts) of up to
// GIF_TITLE_MAX_LENGTH characters, normalized, and "" for anything else (not a text, empty, too long, a control or
// direction character). So the sender hears in the search the very description the others hear with the gif, and a
// long one never pushes the message's body past the route's limit (impl-review F2).
export function gifTitle(value: unknown): string {
  return chatText(value, GIF_TITLE_MAX_LENGTH) ?? "";
}

const MEDIA_HOSTS: ReadonlySet<string> = new Set(KLIPY_MEDIA_HOSTS);

// True for the address of a gif on one of KLIPY's media hosts exactly as KLIPY gave it: a text of up to
// GIF_URL_MAX_LENGTH characters, https, a host of KLIPY_MEDIA_HOSTS, no login, password or port, and in the canonical
// form, which new URL gives back unchanged (no capitals in the host, no "..", no encoding the parser would undo). So
// neither the Worker nor a screen ever rewrites an address, which KLIPY forbids: they take it as it is or refuse it
// (plan, Critical Implementation Details; decision 3: the game shows only images from KLIPY's servers). The Worker's
// check before it signs a gif and a screen's before it shows one are this one function; img-src of the
// Content-Security-Policy is the third wall.
export function isKlipyMediaUrl(value: unknown): value is string {
  if (typeof value !== "string" || value.length > GIF_URL_MAX_LENGTH) return false;
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    // Not an address at all (new URL's TypeError): no gif, which is what the caller asks.
    return false;
  }
  return (
    url.protocol === "https:" &&
    MEDIA_HOSTS.has(url.hostname) &&
    url.username === "" &&
    url.password === "" &&
    url.port === "" &&
    url.href === value
  );
}

// The longest word of a search, in characters as a person counts them; a longer one is cut (gifSearchQuery).
export const GIF_QUERY_MAX_LENGTH = 50;
// How many results one search asks for: KLIPY's per_page takes 8 to 50, and twelve fill the search's grid. Twelve
// previews (xs webp) are about 0.4 MB.
export const GIF_RESULTS_PER_SEARCH = 12;

// The word of a search as it goes to KLIPY: every run of whitespace one space, no blanks at the edges, at most
// GIF_QUERY_MAX_LENGTH characters. "" for nothing to search: the screen then asks KLIPY nothing (decision 4: a search
// only after a word and "Szukaj", for the limit of 100 an hour the whole game shares).
export function gifSearchQuery(raw: string): string {
  return Array.from(raw.replace(/\s+/g, " ").trim()).slice(0, GIF_QUERY_MAX_LENGTH).join("").trim();
}

// KLIPY's locale is a country's code ("us", "uk", …; docs.klipy.com, 2026-11-24), not a language's.
const GIF_LOCALES: Record<Lang, string> = { pl: "pl", en: "us" };

// The address of one search on KLIPY's API (docs.klipy.com/gifs-api/gifs-search-api.md, 2026-11-17), straight from the
// player's browser: the key in the path, the word, one page of GIF_RESULTS_PER_SEARCH results, KLIPY's strictest
// content filter (decision 3; the partner panel is set to High: G as well), the language of the player's screen (S-27;
// GIF_LOCALES) and the webp files the screen shows. Nothing of the game goes with it: no customer_id, nick, room or
// anything else of the player (PRD FR-028), and the room's page sends no Referer there (useGifSearch).
export function gifSearchUrl(key: string, query: string, lang: Lang): string {
  const params = new URLSearchParams({
    q: gifSearchQuery(query),
    per_page: String(GIF_RESULTS_PER_SEARCH),
    page: "1",
    content_filter: "high",
    locale: GIF_LOCALES[lang],
    format_filter: "webp",
  });
  return `${KLIPY_API_ORIGIN}/api/v1/${encodeURIComponent(key)}/gifs/search?${params.toString()}`;
}

// One result of a search as the screen shows it: the small file for the search's grid, the larger one that goes to the
// chat, both on KLIPY's media hosts exactly as KLIPY gave them, and KLIPY's description ("" without one).
export interface GifResult {
  preview: string;
  gif: string;
  title: string;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

// The address of one of a result's files, file.<size>.webp.url, when it passes isKlipyMediaUrl; undefined otherwise.
function webpUrl(file: Record<string, unknown>, size: "sm" | "xs"): string | undefined {
  const sized = file[size];
  if (!isRecord(sized)) return undefined;
  const webp = sized.webp;
  if (!isRecord(webp)) return undefined;
  return isKlipyMediaUrl(webp.url) ? webp.url : undefined;
}

// One item of KLIPY's answer as a result, or undefined when the screen cannot show it: not a gif, or without both of its
// files sm and xs in webp on KLIPY's media hosts in canonical form (isKlipyMediaUrl).
function gifResult(item: unknown): GifResult | undefined {
  if (!isRecord(item) || item.type !== "gif" || !isRecord(item.file)) return undefined;
  const preview = webpUrl(item.file, "xs");
  const gif = webpUrl(item.file, "sm");
  if (preview === undefined || gif === undefined) return undefined;
  return { preview, gif, title: gifTitle(item.title) };
}

// KLIPY's answer to gifSearchUrl ({ result, data: { data: [ … ] } }) read: the results the screen shows, and how many of
// KLIPY's items it left out other than ads (an ad is left out on purpose; the partner panel keeps them off). null for
// an answer of another shape.
function readGifAnswer(json: unknown): { results: GifResult[]; unshowable: number } | null {
  if (!isRecord(json) || !isRecord(json.data) || !Array.isArray(json.data.data)) return null;
  const results: GifResult[] = [];
  let unshowable = 0;
  for (const item of json.data.data) {
    const result = gifResult(item);
    if (result !== undefined) {
      results.push(result);
    } else if (!isRecord(item) || item.type !== "ad") {
      unshowable += 1;
    }
  }
  return { results, unshowable };
}

// The results of KLIPY's answer to gifSearchUrl, in KLIPY's order and as KLIPY gave them, which KLIPY requires
// (integration-requirements.md): the screen filters nothing of its own. It only leaves out a result it cannot show
// (gifResult): an ad, or a gif without both of its files on KLIPY's media hosts. The description as gifTitle gives it.
// null for an answer of another shape: the screen then shows its failure, never a guess.
export function parseGifResults(json: unknown): GifResult[] | null {
  return readGifAnswer(json)?.results ?? null;
}

// How long one search may take, the answer's body included, before the screen gives it up as a failure (runGifSearch).
export const GIF_SEARCH_TIMEOUT_MS = 8000;

// Why a search brought nothing to show: KLIPY's limit for the hour (429; the test key's 100 searches an hour are the
// whole game's), or anything else (another status, no network, the timeout, an answer of another shape).
export type GifSearchFailure = "limit" | "error";

// What one search brought: results in KLIPY's order, none for the word, or a failure.
export type GifSearchOutcome =
  { kind: "results"; results: GifResult[] } | { kind: "empty" } | { kind: "failed"; failure: GifSearchFailure };

// The fetch a search goes through: the browser's own on the room's screen (useGifSearch), a stub in the tests.
export type GifFetch = (url: string, init: RequestInit) => Promise<Response>;

function errorName(error: unknown): string {
  return error instanceof Error ? error.name : "unknown";
}

// The reason runGifSearch aborts a search with once GIF_SEARCH_TIMEOUT_MS have passed, which searchGifs counts a
// failure; an abort with any other reason is the caller giving the search up.
function gifSearchTimeout(): DOMException {
  return new DOMException("The gif search took too long.", "TimeoutError");
}

// True when the caller gave the search up before it ended (its signal aborted, not by the timeout).
function givenUp(signal: AbortSignal): boolean {
  return signal.aborted && !(signal.reason instanceof DOMException && signal.reason.name === "TimeoutError");
}

// One search on KLIPY straight from the player's browser (gifSearchUrl), the screen's only call to KLIPY's API: with no
// cookie and no Referer, so KLIPY learns nothing of the room or the player (PRD FR-028; the browser still names the
// game's site in the Origin header of every such request, and the key names the game anyway). The caller passes a word
// that gifSearchQuery leaves non-empty and the signal that ends the search (runGifSearch); nothing here asks twice. A
// failure is one log line through logEvent with op gif_search and only the answer's status, the error's name, or the
// field of an answer that did not pass: never the word, the key or an address (AGENTS.md, Hard Rules: like a chat
// message, the word is written nowhere). Results KLIPY gave of which the screen can show none are a failure (field
// file), not "no gifs for this word" (impl-review F1). null when the caller gave the search up meanwhile: no log line,
// nothing to show.
export async function searchGifs(
  fetchGifs: GifFetch,
  key: string,
  query: string,
  lang: Lang,
  signal: AbortSignal,
): Promise<GifSearchOutcome | null> {
  let res: Response;
  try {
    res = await fetchGifs(gifSearchUrl(key, query, lang), {
      credentials: "omit",
      referrerPolicy: "no-referrer",
      signal,
    });
  } catch (error) {
    if (givenUp(signal)) return null;
    logEvent("warn", { op: "gif_search", errName: errorName(error) });
    return { kind: "failed", failure: "error" };
  }
  if (!res.ok) {
    logEvent("warn", { op: "gif_search", status: res.status });
    return { kind: "failed", failure: res.status === 429 ? "limit" : "error" };
  }
  let json: unknown;
  try {
    json = await res.json();
  } catch (error) {
    if (givenUp(signal)) return null;
    logEvent("warn", { op: "gif_search", status: res.status, errName: errorName(error) });
    return { kind: "failed", failure: "error" };
  }
  const answer = readGifAnswer(json);
  if (answer === null) {
    logEvent("warn", { op: "gif_search", status: res.status, field: "data" });
    return { kind: "failed", failure: "error" };
  }
  const { results, unshowable } = answer;
  if (results.length > 0) return { kind: "results", results };
  if (unshowable > 0) {
    logEvent("warn", { op: "gif_search", status: res.status, field: "file" });
    return { kind: "failed", failure: "error" };
  }
  return { kind: "empty" };
}

// One search of the screen with its own way to end (impl-review F3): an AbortController the search's fetch listens to,
// aborted after GIF_SEARCH_TIMEOUT_MS by a plain setTimeout, which ends the search as a failure, or by the returned
// cancel (a newer search, the picker closing), after which the search ends with no log line and onOutcome is never
// called. Not AbortSignal.timeout, which Safari has only from 16, while the room's screen runs from 15.4. onOutcome is
// called at most once.
export function runGifSearch(
  fetchGifs: GifFetch,
  key: string,
  query: string,
  lang: Lang,
  onOutcome: (outcome: GifSearchOutcome) => void,
): () => void {
  const controller = new AbortController();
  let ended = false;
  const timeout = setTimeout(() => {
    controller.abort(gifSearchTimeout());
  }, GIF_SEARCH_TIMEOUT_MS);
  void searchGifs(fetchGifs, key, query, lang, controller.signal).then((outcome) => {
    clearTimeout(timeout);
    if (ended || outcome === null) return;
    ended = true;
    onOutcome(outcome);
  });
  return () => {
    if (ended) return;
    ended = true;
    clearTimeout(timeout);
    controller.abort();
  };
}
