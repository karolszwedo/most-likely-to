// The room chat's gifs (S-24, context/changes/room-chat-gifs/plan.md): KLIPY's addresses in one place, for the
// Content-Security-Policy of every answer (src/lib/security-headers.ts), the Worker's check of a gif's address and the
// screen's search. No server imports: the browser and the unit tests load this module too.
//
// From KLIPY's documentation (docs.klipy.com/network-requirements.md, 2026-11-17): the browser searches on the API's
// origin and takes the media from these three hosts, over https only. A host KLIPY adds later is a new entry here.

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
