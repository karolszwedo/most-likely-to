import { format } from "node:util";
import type { User } from "@supabase/supabase-js";
import { afterEach, beforeEach, describe, expect, it, vi, type MockInstance } from "vitest";
import { readUser } from "@/lib/auth-user";

// Every request asks Supabase Auth who is signed in (src/middleware.ts). An Auth outage, a timeout or a rejected refresh
// token gives no user, like a guest, so the page still works; unless it is logged, the owner reading Workers Logs sees a
// host who looks signed out for no reason (context/audits/observability/2026-10-11_guest-join-live-lobby.md, P1). A
// guest without a session is the normal case and stays out of the log, or every guest request would be noise. The line
// carries the error's name, status and code only: an Auth message may echo request data, and AGENTS.md keeps tokens and
// keys out of logs. Since W-9 of the security review (context/changes/security-hardening/plan.md, Faza 2 #5) it is a
// logEvent line, with only the fields of src/lib/log.ts: the name as errName, an absent code left out.

type Auth = Parameters<typeof readUser>[0];
type AuthResult = Awaited<ReturnType<Auth["getUser"]>>;

function auth(result: AuthResult): Auth {
  return { getUser: () => Promise.resolve(result) };
}

// A value that must never reach the log, planted in each error's message.
const SECRET = "sb_secret_planted_in_the_message";

function authError(name: string, status: number, code?: string) {
  return Object.assign(new Error(`upstream said: ${SECRET}`), { name, status, code });
}

// What auth-js returns from getUser for each failure (node_modules/@supabase/auth-js/dist/main/lib/fetch.js).
const AUTH_FAILURES = [
  { why: "Auth unreachable (network, DNS, timeout)", name: "AuthRetryableFetchError", status: 0, code: undefined },
  { why: "Auth down", name: "AuthRetryableFetchError", status: 503, code: undefined },
  { why: "the session's refresh token rejected", name: "AuthApiError", status: 400, code: "refresh_token_not_found" },
];

describe("readUser", () => {
  let consoleError: MockInstance<typeof console.error>;

  beforeEach(() => {
    consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);
  });

  afterEach(() => {
    consoleError.mockRestore();
  });

  function logged(): string {
    return consoleError.mock.calls.map((call) => format(...(call as unknown[]))).join("\n");
  }

  it.each(AUTH_FAILURES)("gives no user and logs the failure once when $why", async ({ name, status, code }) => {
    const user = await readUser(auth({ data: { user: null }, error: authError(name, status, code) }));

    expect(user).toBeNull();
    expect(consoleError).toHaveBeenCalledTimes(1);
    expect(consoleError.mock.calls[0]).toStrictEqual([
      { op: "read_user", step: "get_user", status, errName: name, ...(code === undefined ? {} : { code }) },
    ]);
  });

  it.each(AUTH_FAILURES)("keeps the error message out of the log when $why", async ({ name, status, code }) => {
    await readUser(auth({ data: { user: null }, error: authError(name, status, code) }));

    expect(logged()).not.toContain(SECRET);
  });

  it("gives no user and logs nothing for a guest without a session", async () => {
    const user = await readUser(auth({ data: { user: null }, error: authError("AuthSessionMissingError", 400) }));

    expect(user).toBeNull();
    expect(consoleError).not.toHaveBeenCalled();
  });

  it("gives the signed-in host and logs nothing", async () => {
    const host = { id: "host" } as User;

    const user = await readUser(auth({ data: { user: host }, error: null }));

    expect(user).toBe(host);
    expect(consoleError).not.toHaveBeenCalled();
  });
});
