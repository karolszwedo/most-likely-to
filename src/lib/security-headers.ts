// The headers every answer of the Worker gets on its way out of the middleware (src/middleware.ts; W-4 of the security
// review, context/changes/security-hardening/plan.md, Faza 2 #2). No other site may show the game in a frame of its own;
// a link out of the game carries no path of it (the room's id, a link code); the browser takes a file only as the type
// it was sent with; and a page holding the room's channel key, the players' link or nicks stays in no cache, the
// browser's or a proxy's. An answer with its own Cache-Control keeps it. Here, not in the middleware, which imports
// astro:* modules that the unit tests cannot load.
//
// With them the Content-Security-Policy (room-chat-gifs, Faza 1): the game's page shows images only from its own domain
// and KLIPY's media hosts, and connects only to its own domain, Supabase's Realtime and KLIPY's API. A new foreign
// address the browser needs is a new entry here. No default-src, script-src or style-src: Astro's islands and inline
// scripts stay as they are.

import { KLIPY_API_ORIGIN, KLIPY_MEDIA_HOSTS } from "@/lib/rooms/gifs";

const SECURITY_HEADERS: readonly (readonly [string, string])[] = [
  ["X-Frame-Options", "DENY"],
  ["Referrer-Policy", "same-origin"],
  ["X-Content-Type-Options", "nosniff"],
];

// Realtime's socket on the origin of SUPABASE_URL, with the socket's scheme: CSP matches ws: and wss: to 'self' only,
// never to an https:// source, so the address stands here in full. null for no URL or one that is not http(s).
function realtimeSource(supabaseUrl: string | null): string | null {
  if (supabaseUrl === null || !URL.canParse(supabaseUrl)) return null;
  const url = new URL(supabaseUrl);
  if (url.protocol === "https:") return `wss://${url.host}`;
  if (url.protocol === "http:") return `ws://${url.host}`;
  return null;
}

// The policy for the Supabase project at supabaseUrl (the same SUPABASE_URL the page hands the screen); without a
// readable one the page connects to no Supabase.
export function contentSecurityPolicy(supabaseUrl: string | null): string {
  const images = ["'self'", ...KLIPY_MEDIA_HOSTS.map((host) => `https://${host}`)];
  const realtime = realtimeSource(supabaseUrl);
  const connections = ["'self'", ...(realtime === null ? [] : [realtime]), KLIPY_API_ORIGIN];
  return `img-src ${images.join(" ")}; connect-src ${connections.join(" ")}`;
}

// Sets the headers on the answer itself and gives it back, never a copy: the middleware's answers (context.redirect,
// what next() renders, a route's Response.json or new Response) all have headers that may change.
export function withSecurityHeaders(response: Response, supabaseUrl: string | null): Response {
  for (const [name, value] of SECURITY_HEADERS) response.headers.set(name, value);
  response.headers.set("Content-Security-Policy", contentSecurityPolicy(supabaseUrl));
  if (!response.headers.has("Cache-Control")) response.headers.set("Cache-Control", "no-store");
  return response;
}
