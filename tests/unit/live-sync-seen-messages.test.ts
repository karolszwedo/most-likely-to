import { describe, expect, it } from "vitest";
import { clockOffsetFrom, firstSeen } from "@/lib/live-sync/seen-messages";

// What the room's screen checks beyond the Worker's signature (room-chat, impl-review F2 and F7). The oracle is the
// plan (context/changes/room-chat/plan.md, Desired End State): a screen shows a message of the players' topic only when
// its id has not come before and its time is within 60 s of the server's time as the screen knows it, and that time is
// the device's clock with the offset read from the page's serverNow and then from every answer's Date header (Faza 1
// #5: a missing or unreadable header keeps the offset). A copy of a real message, sent again by whoever has the channel
// key, never shows twice while it can still pass the signature's window, however many messages come in between.
// Every expected value is written out here: the 60 s window, and an id kept for twice that, 120 s.

const NOW = Date.UTC(2026, 10, 17, 18, 0, 0);
const SECOND = 1000;

// An id as the Worker makes it (16 random bytes, base64url), numbered so each one differs.
function idNumber(n: number): string {
  return `id-${String(n).padStart(19, "0")}`;
}

describe("firstSeen", () => {
  it("takes an id once and refuses its copy", () => {
    const seen = new Map<string, number>();
    expect(firstSeen(seen, "Pk7sW2nQ9xLb4VmT8rYc-a", NOW, NOW)).toBe(true);
    expect(firstSeen(seen, "Pk7sW2nQ9xLb4VmT8rYc-a", NOW, NOW + SECOND)).toBe(false);
  });

  it("refuses the copy of a real message after a flood of 1000 others within the window", () => {
    const seen = new Map<string, number>();
    expect(firstSeen(seen, "real", NOW, NOW)).toBe(true);
    for (let n = 0; n < 1000; n++) {
      expect(firstSeen(seen, idNumber(n), NOW + n * 10, NOW + n * 10)).toBe(true);
    }
    expect(firstSeen(seen, "real", NOW, NOW + 50 * SECOND)).toBe(false);
  });

  it("keeps an id for 120 s of the server's time, past the 60 s window either way", () => {
    const seen = new Map<string, number>();
    firstSeen(seen, "real", NOW, NOW);
    expect(firstSeen(seen, "later", NOW + 120 * SECOND, NOW + 120 * SECOND)).toBe(true);
    expect(seen.has("real")).toBe(true);
    expect(firstSeen(seen, "real", NOW, NOW + 120 * SECOND)).toBe(false);
  });

  it("lets go of an id once its message is more than 120 s old", () => {
    const seen = new Map<string, number>();
    firstSeen(seen, "old", NOW, NOW);
    firstSeen(seen, "new", NOW + 121 * SECOND, NOW + 121 * SECOND);
    expect([...seen.keys()]).toEqual(["new"]);
  });

  it("keeps the memory small once the flood is over", () => {
    const seen = new Map<string, number>();
    for (let n = 0; n < 1000; n++) firstSeen(seen, idNumber(n), NOW + n * 10, NOW + n * 10);
    firstSeen(seen, "after", NOW + 200 * SECOND, NOW + 200 * SECOND);
    expect(seen.size).toBe(1);
  });
});

describe("clockOffsetFrom", () => {
  it("gives the server's clock minus the device's from a Date header", () => {
    expect(clockOffsetFrom("Tue, 17 Nov 2026 18:00:00 GMT", NOW - 90 * SECOND)).toBe(90 * SECOND);
    expect(clockOffsetFrom("Tue, 17 Nov 2026 18:00:00 GMT", NOW + 5 * 60 * SECOND)).toBe(-5 * 60 * SECOND);
  });

  it.each([
    ["no header", null],
    ["an empty header", ""],
    ["a header that is no date", "jutro"],
  ])("gives null for %s, so the screen keeps its offset", (_name, header) => {
    expect(clockOffsetFrom(header, NOW)).toBeNull();
  });
});
