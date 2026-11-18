// The room chat's gifs (S-24, context/changes/room-chat-gifs/plan.md): KLIPY's addresses in one place, for the
// Content-Security-Policy of every answer (src/lib/security-headers.ts), the Worker's check of a gif's address and the
// screen's search. No server imports: the browser and the unit tests load this module too.
//
// From KLIPY's documentation (docs.klipy.com/network-requirements.md, 2026-11-17): the browser searches on the API's
// origin and takes the media from these three hosts, over https only. A host KLIPY adds later is a new entry here.

import { logEvent } from "@/lib/log";

export const KLIPY_API_ORIGIN = "https://api.klipy.com";

export const KLIPY_MEDIA_HOSTS = ["static.klipy.com", "static1.klipy.com", "static2.klipy.com"] as const;

// The longest gif address the room takes. KLIPY's media addresses are about 100 characters, so the envelope with the
// address, its description, the nick and the signature's own fields stays well within the 4096 characters a screen
// opens (src/lib/live-sync/signature.ts) and the body within the route's 4096 bytes (src/lib/rooms/json-route.ts).
export const GIF_URL_MAX_LENGTH = 512;
// The longest description of a gif (KLIPY's title, which a screen reader reads for the image): a longer one becomes "",
// never a reason to refuse the gif (src/lib/rooms/chat.ts).
export const GIF_TITLE_MAX_LENGTH = 100;

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

// The address of one search on KLIPY's API (docs.klipy.com/gifs-api/gifs-search-api.md, 2026-11-17), straight from the
// player's browser: the key in the path, the word, one page of GIF_RESULTS_PER_SEARCH results, KLIPY's strictest
// content filter (decision 3; the partner panel is set to High: G as well), the game's language and the webp files the
// screen shows. Nothing of the game goes with it: no customer_id, nick, room or anything else of the player
// (PRD FR-028), and the room's page sends no Referer there (useGifSearch).
export function gifSearchUrl(key: string, query: string): string {
  const params = new URLSearchParams({
    q: gifSearchQuery(query),
    per_page: String(GIF_RESULTS_PER_SEARCH),
    page: "1",
    locale: "pl",
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

// The results of KLIPY's answer to gifSearchUrl ({ result, data: { data: [ … ] } }), in KLIPY's order and as KLIPY gave
// them, which KLIPY requires (integration-requirements.md): the screen filters nothing of its own. It only leaves out a
// result it cannot show: not a gif (an ad, which the partner panel keeps off), or without both of its files sm and xs
// in webp on KLIPY's media hosts in canonical form (isKlipyMediaUrl). A title that is not a text becomes "". null for
// an answer of another shape: the screen then shows its failure, never a guess.
export function parseGifResults(json: unknown): GifResult[] | null {
  if (!isRecord(json) || !isRecord(json.data) || !Array.isArray(json.data.data)) return null;
  const results: GifResult[] = [];
  for (const item of json.data.data) {
    if (!isRecord(item) || item.type !== "gif" || !isRecord(item.file)) continue;
    const preview = webpUrl(item.file, "xs");
    const gif = webpUrl(item.file, "sm");
    if (preview === undefined || gif === undefined) continue;
    results.push({ preview, gif, title: typeof item.title === "string" ? item.title : "" });
  }
  return results;
}

// How long one search may take, the answer's body included, before the screen gives it up as a failure.
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

// One search on KLIPY straight from the player's browser (gifSearchUrl), the screen's only call to KLIPY's API: with no
// cookie and no Referer, so KLIPY learns nothing of the game's site or room (PRD FR-028), given up after
// GIF_SEARCH_TIMEOUT_MS. The caller passes a word that gifSearchQuery leaves non-empty; nothing here asks twice. A
// failure is one log line through logEvent with op gif_search and only the answer's status, the error's name, or the
// field of an answer of another shape: never the word, the key or an address (AGENTS.md, Hard Rules: like a chat
// message, the word is written nowhere).
export async function searchGifs(fetchGifs: GifFetch, key: string, query: string): Promise<GifSearchOutcome> {
  let res: Response;
  try {
    res = await fetchGifs(gifSearchUrl(key, query), {
      credentials: "omit",
      referrerPolicy: "no-referrer",
      signal: AbortSignal.timeout(GIF_SEARCH_TIMEOUT_MS),
    });
  } catch (error) {
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
    logEvent("warn", { op: "gif_search", status: res.status, errName: errorName(error) });
    return { kind: "failed", failure: "error" };
  }
  const results = parseGifResults(json);
  if (results === null) {
    logEvent("warn", { op: "gif_search", status: res.status, field: "data" });
    return { kind: "failed", failure: "error" };
  }
  return results.length === 0 ? { kind: "empty" } : { kind: "results", results };
}
