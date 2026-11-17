import { describe, expect, it } from "vitest";
import { withSecurityHeaders } from "@/lib/security-headers";

// W-4 of the security review (context/changes/security-hardening/plan.md, Faza 2 #2): every answer the middleware
// returns carries X-Frame-Options DENY (no other site frames the game), Referrer-Policy same-origin (a link out of the
// game carries no room's path), X-Content-Type-Options nosniff, and Cache-Control no-store unless the answer has its own
// (a page with the room's channel key, link or nicks stays in no cache). The oracle is the plan's list, written out here.
// That the middleware applies it to the real answers is smoke's step "the game's answers carry the security headers".

const EXPECTED = {
  "x-frame-options": "DENY",
  "referrer-policy": "same-origin",
  "x-content-type-options": "nosniff",
};

function headersOf(response: Response, names: string[]): Record<string, string | null> {
  return Object.fromEntries(names.map((name) => [name, response.headers.get(name)]));
}

describe("withSecurityHeaders", () => {
  it.each([
    { why: "a page", response: () => new Response("<!doctype html>", { headers: { "Content-Type": "text/html" } }) },
    { why: "an answer without a body", response: () => new Response(null, { status: 204 }) },
  ])("gives $why all four headers", ({ response }) => {
    const answer = withSecurityHeaders(response());

    expect(headersOf(answer, [...Object.keys(EXPECTED), "cache-control"])).toEqual({
      ...EXPECTED,
      "cache-control": "no-store",
    });
  });

  it("keeps the answer's own Cache-Control", () => {
    const answer = withSecurityHeaders(
      new Response("{}", { headers: { "Content-Type": "application/json", "Cache-Control": "private, max-age=60" } }),
    );

    expect(answer.headers.get("cache-control")).toBe("private, max-age=60");
    expect(headersOf(answer, Object.keys(EXPECTED))).toEqual(EXPECTED);
  });

  // As context.redirect makes it (node_modules/astro/dist/core/fetch/fetch-state.js).
  it("leaves a redirect a redirect, to the same place, with the headers", () => {
    const redirect = new Response(null, { status: 302, headers: { Location: "/auth/signin?error=missing_fields" } });

    const answer = withSecurityHeaders(redirect);

    expect(answer.status).toBe(302);
    expect(answer.headers.get("location")).toBe("/auth/signin?error=missing_fields");
    expect(headersOf(answer, [...Object.keys(EXPECTED), "cache-control"])).toEqual({
      ...EXPECTED,
      "cache-control": "no-store",
    });
  });

  it("sets them on the answer itself, not on a copy", () => {
    const response = new Response("ok");

    expect(withSecurityHeaders(response)).toBe(response);
  });
});
