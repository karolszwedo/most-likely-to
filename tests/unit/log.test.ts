import { format } from "node:util";
import { afterEach, beforeEach, describe, expect, it, vi, type MockInstance } from "vitest";
import { allowedFields, logEvent } from "@/lib/log";

// Every log line of the Worker goes through one helper with a list of the keys it may write (plan T6, audit §6 step 2).
// A nick, a player token, a link code, a vote's target or the request's URL must never reach Workers Logs (AGENTS.md,
// Hard Rules; PRD: "kto na kogo" never recoverable), so the helper drops every key that is not on the list, whatever
// the caller passes. The oracle is the plan's list (context/archive/2026-10-13-first-live-round/plan.md, Faza 3 #1)
// plus the two flags of the L3 line (#6), not the module's own list.
const ALLOWED = [
  "op",
  "route",
  "step",
  "roomId",
  "status",
  "code",
  "errName",
  "field",
  "event",
  "state",
  "outcome",
  "hasUser",
  "hasPlayerCookie",
];

// What a caller might have at hand next to the allowed fields, and must never see in the log.
const FORBIDDEN = [
  "nick",
  "me",
  "target",
  "p_target",
  "token",
  "playerToken",
  "p_player_token",
  "linkToken",
  "url",
  "message",
  "details",
  "players",
];

// A value that must never reach the log, planted under every forbidden key.
const SECRET = "Ola-planted-secret";

describe("allowedFields", () => {
  it.each(ALLOWED)("keeps the allowed field %s", (field) => {
    expect(allowedFields({ [field]: "value" })).toEqual({ [field]: "value" });
  });

  it.each(FORBIDDEN)("drops the field %s", (field) => {
    expect(allowedFields({ [field]: SECRET })).toEqual({});
  });

  it("keeps the allowed fields of a mixed entry and drops the rest", () => {
    const entry = {
      op: "vote",
      outcome: "ok",
      roomId: "3f2b8c1e-7a4d-4e9b-9c2a-5d6e7f8a9b0c",
      status: 409,
      hasUser: false,
      target: SECRET,
      nick: SECRET,
      token: SECRET,
      url: `https://example.test/j/${SECRET}`,
    };

    expect(allowedFields(entry)).toEqual({
      op: "vote",
      outcome: "ok",
      roomId: "3f2b8c1e-7a4d-4e9b-9c2a-5d6e7f8a9b0c",
      status: 409,
      hasUser: false,
    });
  });

  // An object or an array under an allowed key could carry a nick inside it.
  it.each([
    { why: "an object", value: { nick: SECRET } },
    { why: "an array", value: [SECRET] },
    { why: "null", value: null },
    { why: "undefined", value: undefined },
    { why: "NaN", value: Number.NaN },
    { why: "a function", value: () => SECRET },
  ])("drops an allowed field whose value is $why", ({ value }) => {
    expect(allowedFields({ op: value })).toEqual({});
  });

  it("cuts a very long value", () => {
    const line = allowedFields({ code: "x".repeat(10_000) });

    expect(typeof line.code).toBe("string");
    expect(String(line.code).length).toBeLessThanOrEqual(200);
  });

  // JSON from a request can carry keys that live on Object.prototype.
  it("reads no key from the prototype chain", () => {
    const parsed: unknown = JSON.parse('{"__proto__": {"op": "planted"}, "constructor": "planted"}');

    expect(allowedFields(parsed as Record<string, unknown>)).toEqual({});
  });
});

describe("logEvent", () => {
  let consoleLog: MockInstance<typeof console.log>;
  let consoleWarn: MockInstance<typeof console.warn>;
  let consoleError: MockInstance<typeof console.error>;

  beforeEach(() => {
    consoleLog = vi.spyOn(console, "log").mockImplementation(() => undefined);
    consoleWarn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);
  });

  afterEach(() => {
    consoleLog.mockRestore();
    consoleWarn.mockRestore();
    consoleError.mockRestore();
  });

  function logged(): string {
    return [consoleLog, consoleWarn, consoleError]
      .flatMap((spy) => spy.mock.calls.map((call) => format(...(call as unknown[]))))
      .join("\n");
  }

  it.each([
    { level: "info" as const, spy: () => consoleLog },
    { level: "warn" as const, spy: () => consoleWarn },
    { level: "error" as const, spy: () => consoleError },
  ])("writes one $level line with only the allowed fields", ({ level, spy }) => {
    // A variable, not a literal: what a caller holding a vote's request would pass by mistake.
    const entry = { op: "vote", outcome: "ok", roomId: "room", target: SECRET, nick: SECRET };

    logEvent(level, entry);

    expect(spy()).toHaveBeenCalledTimes(1);
    expect(spy().mock.calls[0]).toEqual([{ op: "vote", outcome: "ok", roomId: "room" }]);
    expect(logged()).not.toContain(SECRET);
  });
});
