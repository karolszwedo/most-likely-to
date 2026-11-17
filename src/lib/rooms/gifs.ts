// The room chat's gifs (S-24, context/changes/room-chat-gifs/plan.md): KLIPY's addresses in one place, for the
// Content-Security-Policy of every answer (src/lib/security-headers.ts), the Worker's check of a gif's address and the
// screen's search. No server imports: the browser and the unit tests load this module too.
//
// From KLIPY's documentation (docs.klipy.com/network-requirements.md, 2026-11-17): the browser searches on the API's
// origin and takes the media from these three hosts, over https only. A host KLIPY adds later is a new entry here.

export const KLIPY_API_ORIGIN = "https://api.klipy.com";

export const KLIPY_MEDIA_HOSTS = ["static.klipy.com", "static1.klipy.com", "static2.klipy.com"] as const;
