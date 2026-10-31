import { format } from "node:util";
import { afterEach, beforeEach, describe, expect, it, vi, type MockInstance } from "vitest";
import {
  browserNickStorage,
  browserSessionStorage,
  colorAskedIn,
  markColorAsked,
  readRememberedColor,
  readRememberedNick,
  rememberColor,
  rememberedColorRequest,
  rememberNick,
  type NickStorage,
} from "@/lib/rooms/remembered-nick";
import type { LobbyPlayer, RoomView } from "@/lib/rooms/shared";

// S-14 (FR-024): the same browser suggests the nick its player last joined with. S-18 (FR-025): it also asks once for
// the colour its player last picked. In localStorage the browser keeps only the nick and the colour, under two keys, and
// in sessionStorage only the ids of the rooms where it already asked for the colour; never a vote or its target (roadmap
// S-14, Risk; AGENTS.md, Hard Rules), so remembering is exactly one setItem under the planned key and nothing else
// (context/archive/2026-10-25-remembered-nick/plan.md, Faza 1 #1; context/changes/player-color-choice/plan.md, Faza 3
// #3).
// A value is written or suggested only when the form would take it: 1 to 20 characters as the database counts them, an
// emoji as one (invalid_nick, supabase/migrations/20261014101922_first_live_round.sql:355-359). Storage that refuses
// (blocked site data, a full quota) never throws to the screen, and its log line carries the step and the error's
// name, never the nick. Every expected value is written out by hand; nothing here is counted with nickLength.

const KEY = "mlt-nick";

// Counted by hand in characters: ł and ń are one each, and so is 🎉, though it is two UTF-16 units, so a limit checked
// on String.length would wrongly refuse TWENTY_WITH_EMOJI.
const TWENTY = "Bartłomiej z Gdańska";
const TWENTY_WITH_EMOJI = "Bartłomiej z Gdańsk🎉";
const VALID_NICKS = ["Ola", TWENTY, TWENTY_WITH_EMOJI];
// Empty, only spaces, only whitespace of any kind, and one character over the limit, also with the emoji.
const INVALID_NICKS = ["", "   ", " \t\n ", "Bartłomiej z Gdańska!", "Bartłomiej z Gdańska🎉"];

interface FakeStorage extends NickStorage {
  // Every setItem call in order, as [key, value].
  writes: [string, string][];
}

function fakeStorage(stored: Record<string, string> = {}): FakeStorage {
  const entries = new Map(Object.entries(stored));
  const writes: [string, string][] = [];
  return {
    writes,
    getItem: (key) => entries.get(key) ?? null,
    setItem: (key, value) => {
      writes.push([key, value]);
      entries.set(key, value);
    },
  };
}

// Storage whose every call throws, as a browser's does. The nick sits in the error's message, which must never reach
// the log.
function refusingStorage(name: string): NickStorage {
  const refuse = (): never => {
    throw Object.assign(new Error(`storage refused ${TWENTY}`), { name });
  };
  return { getItem: refuse, setItem: refuse };
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

describe("readRememberedNick", () => {
  it("gives null when nothing is remembered", () => {
    expect(readRememberedNick(fakeStorage())).toBeNull();
    expect(consoleWarn).not.toHaveBeenCalled();
  });

  it.each(VALID_NICKS)("gives back the remembered nick %j as it was stored", (nick) => {
    expect(readRememberedNick(fakeStorage({ [KEY]: nick }))).toBe(nick);
    expect(consoleWarn).not.toHaveBeenCalled();
  });

  it.each(INVALID_NICKS)("gives null for the remembered value %j, which the form would refuse", (value) => {
    expect(readRememberedNick(fakeStorage({ [KEY]: value }))).toBeNull();
  });

  it("gives null when the storage refuses, and logs the step without the nick", () => {
    expect(readRememberedNick(refusingStorage("SecurityError"))).toBeNull();
    expect(consoleWarn).toHaveBeenCalledTimes(1);
    expect(consoleWarn.mock.calls[0]).toContainEqual({ op: "remembered_nick", step: "read", errName: "SecurityError" });
    expect(logged()).not.toContain(TWENTY);
  });

  it("gives null without a storage", () => {
    expect(readRememberedNick(null)).toBeNull();
  });
});

describe("rememberNick", () => {
  it.each(VALID_NICKS)("writes %j once under the key and nothing else", (nick) => {
    const storage = fakeStorage();

    rememberNick(storage, nick);

    expect(storage.writes).toEqual([[KEY, nick]]);
    expect(consoleWarn).not.toHaveBeenCalled();
  });

  it.each(INVALID_NICKS)("writes nothing for %j, which the form would refuse", (value) => {
    const storage = fakeStorage();

    rememberNick(storage, value);

    expect(storage.writes).toEqual([]);
  });

  it("does not throw when the storage refuses, and logs the step without the nick", () => {
    expect(() => {
      rememberNick(refusingStorage("QuotaExceededError"), TWENTY);
    }).not.toThrow();
    expect(consoleWarn).toHaveBeenCalledTimes(1);
    expect(consoleWarn.mock.calls[0]).toContainEqual({
      op: "remembered_nick",
      step: "write",
      errName: "QuotaExceededError",
    });
    expect(logged()).not.toContain(TWENTY);
  });

  it("does not throw without a storage", () => {
    expect(() => {
      rememberNick(null, TWENTY);
    }).not.toThrow();
  });
});

describe("remembered nick round trip", () => {
  it.each(VALID_NICKS)("reads back %j from the same storage after remembering it", (nick) => {
    const storage = fakeStorage();

    rememberNick(storage, nick);

    expect(readRememberedNick(storage)).toBe(nick);
  });
});

describe("browserNickStorage", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  // The unit tests run in node (vitest.config.ts), with no window, as in a server render.
  it("gives no storage and logs nothing outside the browser", () => {
    expect(browserNickStorage()).toBeNull();
    expect(consoleWarn).not.toHaveBeenCalled();
  });

  // A browser in private mode or with blocked site data throws on merely reaching its storage.
  it("gives no storage when reaching it throws, and logs the step without the nick", () => {
    vi.stubGlobal("window", {
      get localStorage(): never {
        throw Object.assign(new Error(`storage refused ${TWENTY}`), { name: "SecurityError" });
      },
    });

    expect(browserNickStorage()).toBeNull();
    expect(consoleWarn).toHaveBeenCalledTimes(1);
    expect(consoleWarn.mock.calls[0]).toContainEqual({ op: "remembered_nick", step: "open", errName: "SecurityError" });
    expect(logged()).not.toContain(TWENTY);
  });
});

// S-18: the colour this browser's player last picked from the palette (context/changes/player-color-choice/plan.md,
// Faza 3 #3). A colour of the palette is a whole number 0 … 19, as players.color holds it (check 0–19 in the migration
// of S-18); the expected values are written out by hand.
const COLOR_KEY = "mlt-color";
const ASKED_KEY = "mlt-color-asked";
const ROOM_A = "3f2b8c1e-7a4d-4e9b-9c2a-5d6e7f8a9b0c";
const ROOM_B = "9c2a5d6e-7f8a-4b0c-8e1a-3f2b8c1e7a4d";

describe("readRememberedColor", () => {
  it.each([
    ["0", 0],
    ["7", 7],
    ["19", 19],
  ])("gives back the remembered colour %j as %i", (stored, color) => {
    expect(readRememberedColor(fakeStorage({ [COLOR_KEY]: stored }))).toBe(color);
    expect(consoleWarn).not.toHaveBeenCalled();
  });

  it.each(["20", "100", "-1", "1.5", "1e1", " 3", "3 ", "abc", ""])(
    "gives null for the remembered value %j, which is not a colour of the palette",
    (value) => {
      expect(readRememberedColor(fakeStorage({ [COLOR_KEY]: value }))).toBeNull();
    },
  );

  it("gives null when nothing is remembered, and never reads the nick's key", () => {
    expect(readRememberedColor(fakeStorage({ [KEY]: "7" }))).toBeNull();
  });

  it("gives null when the storage refuses, and logs the step without the value", () => {
    expect(readRememberedColor(refusingStorage("SecurityError"))).toBeNull();
    expect(consoleWarn).toHaveBeenCalledTimes(1);
    expect(consoleWarn.mock.calls[0]).toContainEqual({
      op: "remembered_color",
      step: "read",
      errName: "SecurityError",
    });
    expect(logged()).not.toContain(TWENTY);
  });

  it("gives null without a storage", () => {
    expect(readRememberedColor(null)).toBeNull();
  });
});

describe("rememberColor", () => {
  it.each([
    [0, "0"],
    [19, "19"],
  ])("writes the colour %i once under its key as %j and nothing else", (color, stored) => {
    const storage = fakeStorage();

    rememberColor(storage, color);

    expect(storage.writes).toEqual([[COLOR_KEY, stored]]);
    expect(consoleWarn).not.toHaveBeenCalled();
  });

  it.each([-1, 20, 1.5, Number.NaN])("writes nothing for %d, which is not a colour of the palette", (color) => {
    const storage = fakeStorage();

    rememberColor(storage, color);

    expect(storage.writes).toEqual([]);
  });

  it("does not throw when the storage refuses, and logs the step", () => {
    expect(() => {
      rememberColor(refusingStorage("QuotaExceededError"), 7);
    }).not.toThrow();
    expect(consoleWarn).toHaveBeenCalledTimes(1);
    expect(consoleWarn.mock.calls[0]).toContainEqual({
      op: "remembered_color",
      step: "write",
      errName: "QuotaExceededError",
    });
  });

  it("reads back the colour from the same storage, next to a remembered nick", () => {
    const storage = fakeStorage();

    rememberNick(storage, "Ola");
    rememberColor(storage, 12);

    expect(readRememberedColor(storage)).toBe(12);
    expect(readRememberedNick(storage)).toBe("Ola");
  });
});

describe("colorAskedIn and markColorAsked", () => {
  it("has not asked in a room before anything is noted", () => {
    expect(colorAskedIn(fakeStorage(), ROOM_A)).toBe(false);
  });

  it("notes the room's id once under its key, and has asked only in that room", () => {
    const session = fakeStorage();

    markColorAsked(session, ROOM_A);

    expect(session.writes).toEqual([[ASKED_KEY, ROOM_A]]);
    expect(colorAskedIn(session, ROOM_A)).toBe(true);
    expect(colorAskedIn(session, ROOM_B)).toBe(false);
  });

  // Review of S-18, F3: with only the last room kept, a tab in room A that went to room B and came back asked again in
  // A, and the colour picked in B (localStorage is shared by tabs) changed the player's colour in A with no tap.
  it("still has asked in room A after room B: A → B → back to A never asks again", () => {
    const session = fakeStorage();

    markColorAsked(session, ROOM_A);
    markColorAsked(session, ROOM_B);

    expect(session.writes).toEqual([
      [ASKED_KEY, ROOM_A],
      [ASKED_KEY, `${ROOM_A} ${ROOM_B}`],
    ]);
    expect(colorAskedIn(session, ROOM_A)).toBe(true);
    expect(colorAskedIn(session, ROOM_B)).toBe(true);
  });

  it("notes a room again as the latest, once", () => {
    const session = fakeStorage();

    markColorAsked(session, ROOM_A);
    markColorAsked(session, ROOM_B);
    markColorAsked(session, ROOM_A);

    expect(session.writes.at(-1)).toEqual([ASKED_KEY, `${ROOM_B} ${ROOM_A}`]);
  });

  it("keeps the last 10 rooms: the 11th forgets the first", () => {
    const session = fakeStorage();
    // Eleven distinct room ids, written out by pattern: …-000000000001 to …-000000000011.
    const rooms = Array.from({ length: 11 }, (_, i) => `3f2b8c1e-7a4d-4e9b-9c2a-${String(i + 1).padStart(12, "0")}`);

    for (const room of rooms) markColorAsked(session, room);

    expect(colorAskedIn(session, rooms[0])).toBe(false);
    expect(rooms.slice(1).every((room) => colorAskedIn(session, room))).toBe(true);
    expect(session.writes.at(-1)).toEqual([ASKED_KEY, rooms.slice(1).join(" ")]);
  });

  it("reads a value from before the list, one room's id, as that room", () => {
    expect(colorAskedIn(fakeStorage({ [ASKED_KEY]: ROOM_A }), ROOM_A)).toBe(true);
    expect(colorAskedIn(fakeStorage({ [ASKED_KEY]: ROOM_A }), ROOM_B)).toBe(false);
  });

  it("has not asked when the storage refuses, and logs each step", () => {
    const session = refusingStorage("SecurityError");

    expect(colorAskedIn(session, ROOM_A)).toBe(false);
    expect(() => {
      markColorAsked(session, ROOM_A);
    }).not.toThrow();
    expect(consoleWarn).toHaveBeenCalledTimes(2);
    expect(consoleWarn.mock.calls[0]).toContainEqual({ op: "color_asked", step: "read", errName: "SecurityError" });
    expect(consoleWarn.mock.calls[1]).toContainEqual({ op: "color_asked", step: "write", errName: "SecurityError" });
  });

  it("has not asked and writes nothing without a storage", () => {
    expect(colorAskedIn(null, ROOM_A)).toBe(false);
    expect(() => {
      markColorAsked(null, ROOM_A);
    }).not.toThrow();
  });
});

// Ola (the host) has colour 0, Kasia (this screen) 1, Bartek 4.
const colorPlayers: LobbyPlayer[] = [
  { nick: "Ola", host: true, cohost: false, color: 0 },
  { nick: "Kasia", host: false, cohost: false, color: 1 },
  { nick: "Bartek", host: false, cohost: false, color: 4 },
];

function colorView(status: RoomView["status"], me = "Kasia"): RoomView {
  return {
    status,
    role: "guest",
    leader: false,
    me,
    players: colorPlayers,
    round: null,
    requests: [],
    questionsLeft: null,
    questions: null,
    summary: null,
  };
}

describe("rememberedColorRequest", () => {
  it.each([
    ["lobby", 7],
    ["playing", 19],
  ] as const)("asks for the remembered colour in a %s room when it is free (%i)", (status, remembered) => {
    expect(rememberedColorRequest(colorView(status), remembered)).toBe(remembered);
  });

  it.each([
    ["another player has it", colorView("lobby"), 4],
    ["the player already has it", colorView("lobby"), 1],
    ["the game is closed", colorView("closed"), 7],
    ["the player is not on the list", colorView("lobby", "Zosia"), 7],
    ["nothing is remembered", colorView("lobby"), null],
  ])("asks for nothing when %s", (_, view, remembered) => {
    expect(rememberedColorRequest(view, remembered)).toBeNull();
  });
});

describe("browserSessionStorage", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("gives no storage and logs nothing outside the browser", () => {
    expect(browserSessionStorage()).toBeNull();
    expect(consoleWarn).not.toHaveBeenCalled();
  });

  it("gives no storage when reaching it throws, and logs the step", () => {
    vi.stubGlobal("window", {
      get sessionStorage(): never {
        throw Object.assign(new Error("storage refused"), { name: "SecurityError" });
      },
    });

    expect(browserSessionStorage()).toBeNull();
    expect(consoleWarn).toHaveBeenCalledTimes(1);
    expect(consoleWarn.mock.calls[0]).toContainEqual({ op: "color_asked", step: "open", errName: "SecurityError" });
  });
});
