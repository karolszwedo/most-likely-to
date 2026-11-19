import { describe, expect, it } from "vitest";
import { contentSecurityPolicy, withSecurityHeaders } from "@/lib/security-headers";

// W-4 of the security review (context/archive/2026-11-16-security-hardening/plan.md, Faza 2 #2): every answer the
// middleware returns carries X-Frame-Options DENY (no other site frames the game), Referrer-Policy same-origin (a link
// out of the game carries no room's path), X-Content-Type-Options nosniff, and Cache-Control no-store unless the answer
// has its own (a page with the room's channel key, link or nicks stays in no cache). With them the
// Content-Security-Policy (room-chat-gifs, Faza 1): the game's page loads images only from its own domain and KLIPY's
// three media hosts, and connects only to its own domain, the Realtime socket of its Supabase project and KLIPY's API.
// The oracle is the plans' lists, written out here. That the middleware applies them to the real answers is smoke's
// step "the game's answers carry the security headers".

const SUPABASE_URL = "https://abc.supabase.co";

const KLIPY_IMAGES = "img-src 'self' https://static.klipy.com https://static1.klipy.com https://static2.klipy.com";

const EXPECTED = {
  "x-frame-options": "DENY",
  "referrer-policy": "same-origin",
  "x-content-type-options": "nosniff",
  "content-security-policy": `${KLIPY_IMAGES}; connect-src 'self' wss://abc.supabase.co https://api.klipy.com`,
};

function headersOf(response: Response, names: string[]): Record<string, string | null> {
  return Object.fromEntries(names.map((name) => [name, response.headers.get(name)]));
}

describe("contentSecurityPolicy", () => {
  it("connects to the Realtime socket of a project on https over wss", () => {
    expect(contentSecurityPolicy("https://abc.supabase.co")).toBe(
      `${KLIPY_IMAGES}; connect-src 'self' wss://abc.supabase.co https://api.klipy.com`,
    );
  });

  // Local Supabase in CI and e2e: http with a port, so the socket is ws with the same port.
  it("connects to a local project on http over ws, with its port", () => {
    expect(contentSecurityPolicy("http://127.0.0.1:54321")).toBe(
      `${KLIPY_IMAGES}; connect-src 'self' ws://127.0.0.1:54321 https://api.klipy.com`,
    );
  });

  it("takes only the origin of a URL with a path", () => {
    expect(contentSecurityPolicy("https://abc.supabase.co/rest/v1/")).toBe(
      `${KLIPY_IMAGES}; connect-src 'self' wss://abc.supabase.co https://api.klipy.com`,
    );
  });

  it.each([
    { why: "no URL", url: null },
    { why: "an empty one", url: "" },
    { why: "one that does not parse", url: "abc.supabase.co" },
    { why: "one that is not http(s)", url: "ftp://abc.supabase.co" },
  ])("leaves Supabase out for $why", ({ url }) => {
    expect(contentSecurityPolicy(url)).toBe(`${KLIPY_IMAGES}; connect-src 'self' https://api.klipy.com`);
  });
});

describe("withSecurityHeaders", () => {
  it.each([
    { why: "a page", response: () => new Response("<!doctype html>", { headers: { "Content-Type": "text/html" } }) },
    { why: "an answer without a body", response: () => new Response(null, { status: 204 }) },
  ])("gives $why all five headers", ({ response }) => {
    const answer = withSecurityHeaders(response(), SUPABASE_URL);

    expect(headersOf(answer, [...Object.keys(EXPECTED), "cache-control"])).toEqual({
      ...EXPECTED,
      "cache-control": "no-store",
    });
  });

  it("keeps the answer's own Cache-Control", () => {
    const answer = withSecurityHeaders(
      new Response("{}", { headers: { "Content-Type": "application/json", "Cache-Control": "private, max-age=60" } }),
      SUPABASE_URL,
    );

    expect(answer.headers.get("cache-control")).toBe("private, max-age=60");
    expect(headersOf(answer, Object.keys(EXPECTED))).toEqual(EXPECTED);
  });

  // As context.redirect makes it (node_modules/astro/dist/core/fetch/fetch-state.js).
  it("leaves a redirect a redirect, to the same place, with the headers", () => {
    const redirect = new Response(null, { status: 302, headers: { Location: "/auth/signin?error=missing_fields" } });

    const answer = withSecurityHeaders(redirect, SUPABASE_URL);

    expect(answer.status).toBe(302);
    expect(answer.headers.get("location")).toBe("/auth/signin?error=missing_fields");
    expect(headersOf(answer, [...Object.keys(EXPECTED), "cache-control"])).toEqual({
      ...EXPECTED,
      "cache-control": "no-store",
    });
  });

  it("sets them on the answer itself, not on a copy", () => {
    const response = new Response("ok");

    expect(withSecurityHeaders(response, SUPABASE_URL)).toBe(response);
  });
});
