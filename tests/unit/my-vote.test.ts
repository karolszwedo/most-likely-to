import { format } from "node:util";
import { afterEach, beforeEach, describe, expect, it, vi, type MockInstance } from "vitest";
import { forgetMyVote, recallMyVote, rememberMyVote } from "@/lib/rooms/my-vote";
import { browserSessionStorage, type SessionStorage } from "@/lib/rooms/remembered-nick";

// S-04 (decision D1): after a reload the screen says again whom its player voted for, from this tab's sessionStorage
// only, one entry per room, {round, target}, until the round stops voting (context/changes/rejoin-after-refresh/plan.md,
// Faza 2 #1; AGENTS.md, Hard Rules). Remembering is exactly one setItem under the room's key and nothing else; an entry
// of another round or of another shape is forgotten on reading, never shown; storage that refuses never throws to the
// screen, and its log line carries the step and the error's name, never the nick. Every expected value is written out
// by hand.

const ROOM_A = "3f2b8c1e-7a4d-4e9b-9c2a-5d6e7f8a9b0c";
const ROOM_B = "9c2a5d6e-7f8a-4b0c-8e1a-3f2b8c1e7a4d";
const KEY_A = "mlt-my-vote:3f2b8c1e-7a4d-4e9b-9c2a-5d6e7f8a9b0c";
const KEY_B = "mlt-my-vote:9c2a5d6e-7f8a-4b0c-8e1a-3f2b8c1e7a4d";
// Twenty characters as the database counts them, the emoji one of them.
const NICK = "Bartłomiej z Gdańsk🎉";

interface FakeStorage extends SessionStorage {
  // Every setItem and removeItem call in order.
  calls: string[][];
  entries: Map<string, string>;
}

function fakeStorage(stored: Record<string, string> = {}): FakeStorage {
  const entries = new Map(Object.entries(stored));
  const calls: string[][] = [];
  return {
    calls,
    entries,
    getItem: (key) => entries.get(key) ?? null,
    setItem: (key, value) => {
      calls.push(["set", key, value]);
      entries.set(key, value);
    },
    removeItem: (key) => {
      calls.push(["remove", key]);
      entries.delete(key);
    },
  };
}

// Storage whose every call throws, as a browser's does. The nick sits in the error's message, which must never reach
// the log.
function refusingStorage(name: string): SessionStorage {
  const refuse = (): never => {
    throw Object.assign(new Error(`storage refused ${NICK}`), { name });
  };
  return { getItem: refuse, setItem: refuse, removeItem: refuse };
}

let consoleWarn: MockInstance<typeof console.warn>;

beforeEach(() => {
  consoleWarn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
});

afterEach(() => {
  consoleWarn.mockRestore();
});

function logged(): string {
  return consoleWarn.mock.calls.map((call) => format(...call)).join("\n");
}

describe("rememberMyVote", () => {
  it("writes the round and the nick once under the room's key and nothing else", () => {
    const storage = fakeStorage();

    rememberMyVote(storage, ROOM_A, 3, NICK);

    expect(storage.calls).toEqual([["set", KEY_A, '{"round":3,"target":"Bartłomiej z Gdańsk🎉"}']]);
    expect(consoleWarn).not.toHaveBeenCalled();
  });

  it("writes an abstention as a null target", () => {
    const storage = fakeStorage();

    rememberMyVote(storage, ROOM_A, 1, null);

    expect(storage.calls).toEqual([["set", KEY_A, '{"round":1,"target":null}']]);
  });

  it.each([
    ["a round of 0", 0, "Ola"],
    ["a round that is not whole", 1.5, "Ola"],
    ["an empty nick", 1, ""],
    ["a nick of spaces", 1, "   "],
    ["a nick one character too long", 1, "Bartłomiej z Gdańska!"],
  ])("writes nothing for %s", (_, round, target) => {
    const storage = fakeStorage();

    rememberMyVote(storage, ROOM_A, round, target);

    expect(storage.calls).toEqual([]);
  });

  it("does not throw when the storage refuses, and logs the step without the nick", () => {
    expect(() => {
      rememberMyVote(refusingStorage("QuotaExceededError"), ROOM_A, 1, NICK);
    }).not.toThrow();
    expect(consoleWarn).toHaveBeenCalledTimes(1);
    expect(consoleWarn.mock.calls[0]).toContainEqual({ op: "my_vote", step: "write", errName: "QuotaExceededError" });
    expect(logged()).not.toContain(NICK);
  });

  it("does not throw without a storage", () => {
    expect(() => {
      rememberMyVote(null, ROOM_A, 1, NICK);
    }).not.toThrow();
  });
});

describe("recallMyVote", () => {
  it("gives back the vote remembered in the same round, the nick or the abstention", () => {
    const storage = fakeStorage();

    rememberMyVote(storage, ROOM_A, 2, NICK);
    rememberMyVote(storage, ROOM_B, 5, null);

    expect(recallMyVote(storage, ROOM_A, 2)).toEqual({ target: NICK });
    expect(recallMyVote(storage, ROOM_B, 5)).toEqual({ target: null });
    expect(consoleWarn).not.toHaveBeenCalled();
  });

  it("gives null when nothing is remembered in the room, and forgets nothing", () => {
    const storage = fakeStorage({ [KEY_B]: '{"round":1,"target":"Ola"}' });

    expect(recallMyVote(storage, ROOM_A, 1)).toBeNull();
    expect(storage.calls).toEqual([]);
  });

  it("gives null for another round's vote, and forgets it", () => {
    const storage = fakeStorage({ [KEY_A]: '{"round":1,"target":"Ola"}' });

    expect(recallMyVote(storage, ROOM_A, 2)).toBeNull();
    expect(storage.calls).toEqual([["remove", KEY_A]]);
    expect(storage.entries.has(KEY_A)).toBe(false);
  });

  it.each([
    ["not JSON", "Ola"],
    ["a bare nick in quotes", '"Ola"'],
    ["null", "null"],
    ["no target", '{"round":1}'],
    ["a round as text", '{"round":"1","target":"Ola"}'],
    ["a target that is not a nick", '{"round":1,"target":42}'],
    ["a target of 21 characters", '{"round":1,"target":"Bartłomiej z Gdańska!"}'],
  ])("gives null for an entry that is %s, and forgets it", (_, value) => {
    const storage = fakeStorage({ [KEY_A]: value });

    expect(recallMyVote(storage, ROOM_A, 1)).toBeNull();
    expect(storage.calls).toEqual([["remove", KEY_A]]);
  });

  it("gives null when the storage refuses, and logs the step without the nick", () => {
    expect(recallMyVote(refusingStorage("SecurityError"), ROOM_A, 1)).toBeNull();
    expect(consoleWarn).toHaveBeenCalledTimes(1);
    expect(consoleWarn.mock.calls[0]).toContainEqual({ op: "my_vote", step: "read", errName: "SecurityError" });
    expect(logged()).not.toContain(NICK);
  });

  it("gives null without a storage", () => {
    expect(recallMyVote(null, ROOM_A, 1)).toBeNull();
  });
});

describe("forgetMyVote", () => {
  it("removes only the room's entry", () => {
    const storage = fakeStorage({
      [KEY_A]: '{"round":1,"target":"Ola"}',
      [KEY_B]: '{"round":4,"target":null}',
      "mlt-color-asked": ROOM_A,
    });

    forgetMyVote(storage, ROOM_A);

    expect(storage.calls).toEqual([["remove", KEY_A]]);
    expect([...storage.entries.keys()]).toEqual([KEY_B, "mlt-color-asked"]);
  });

  it("does not throw when the storage refuses, and logs the step", () => {
    expect(() => {
      forgetMyVote(refusingStorage("SecurityError"), ROOM_A);
    }).not.toThrow();
    expect(consoleWarn).toHaveBeenCalledTimes(1);
    expect(consoleWarn.mock.calls[0]).toContainEqual({ op: "my_vote", step: "forget", errName: "SecurityError" });
    expect(logged()).not.toContain(NICK);
  });

  it("does not throw without a storage", () => {
    expect(() => {
      forgetMyVote(null, ROOM_A);
    }).not.toThrow();
  });
});

describe("browserSessionStorage for the tab's own vote", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("gives no storage when reaching it throws, and logs the step under my_vote", () => {
    vi.stubGlobal("window", {
      get sessionStorage(): never {
        throw Object.assign(new Error("storage refused"), { name: "SecurityError" });
      },
    });

    expect(browserSessionStorage("my_vote")).toBeNull();
    expect(consoleWarn).toHaveBeenCalledTimes(1);
    expect(consoleWarn.mock.calls[0]).toContainEqual({ op: "my_vote", step: "open", errName: "SecurityError" });
  });
});
