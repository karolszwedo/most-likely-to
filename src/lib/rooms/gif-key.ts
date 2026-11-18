import { KLIPY_API_KEY } from "astro:env/server";
import { logEvent } from "@/lib/log";

// The key of KLIPY's search for the room chat's gifs (room-chat-gifs, Faza 2 #3), from the Worker's secret
// KLIPY_API_KEY, read only through astro:env/server (AGENTS.md) and only when a page needs it: the value is the
// Worker's at request time, never at the module's load. Unlike LIVE_SIGNING_KEY it is no secret from the players: KLIPY
// wants the search and the media to come straight from the player's browser, never through the Worker
// (context/changes/room-chat-gifs/research.md), so the room's page hands it to its screen (src/pages/r/[id].astro). It
// is the Worker's secret only so it lies in no public repo, where anyone could use up the limit the whole game shares.
// Apart from src/lib/rooms/gifs.ts and outside the unit tests, which load no astro:* module (test-plan.md §6.1).

// The key goes into the path of the search's address (/api/v1/<key>/gifs/search), so only characters that need no
// encoding there, of a sensible length.
const GIF_SEARCH_KEY = /^[A-Za-z0-9_-]{8,128}$/;

// One line per isolate for a key that is missing or of another shape, not one per page.
let logged = false;

// The key, or null without the secret or with one of another shape: the room's page then gives its screen no key, and
// the chat has no gifs while its texts go on as before. Logged once per isolate (op gif_key, step missing or shape),
// never with anything of the value.
export function getGifSearchKey(): string | null {
  const key = KLIPY_API_KEY;
  if (key !== undefined && GIF_SEARCH_KEY.test(key)) return key;
  if (!logged) {
    logged = true;
    logEvent("error", { op: "gif_key", step: key ? "shape" : "missing" });
  }
  return null;
}
