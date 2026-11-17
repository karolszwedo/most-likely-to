// The headers every answer of the Worker gets on its way out of the middleware (src/middleware.ts; W-4 of the security
// review, context/changes/security-hardening/plan.md, Faza 2 #2). No other site may show the game in a frame of its own;
// a link out of the game carries no path of it (the room's id, a link code); the browser takes a file only as the type
// it was sent with; and a page holding the room's channel key, the players' link or nicks stays in no cache, the
// browser's or a proxy's. An answer with its own Cache-Control keeps it. Here, not in the middleware, which imports
// astro:* modules that the unit tests cannot load.

const SECURITY_HEADERS: readonly (readonly [string, string])[] = [
  ["X-Frame-Options", "DENY"],
  ["Referrer-Policy", "same-origin"],
  ["X-Content-Type-Options", "nosniff"],
];

// Sets the headers on the answer itself and gives it back, never a copy: the middleware's answers (context.redirect,
// what next() renders, a route's Response.json or new Response) all have headers that may change.
export function withSecurityHeaders(response: Response): Response {
  for (const [name, value] of SECURITY_HEADERS) response.headers.set(name, value);
  if (!response.headers.has("Cache-Control")) response.headers.set("Cache-Control", "no-store");
  return response;
}
