import { describe, expect, it } from "vitest";
import { plural } from "@/lib/i18n";
import type { GameTotals } from "@/lib/rooms/shared";
import { gameSummary } from "@/lib/rooms/summary";

// The summary on the end of the evening (S-15, PRD FR-022), made from the sums of a closed game's reveals, and the
// Polish plural of its counts. Oracle: Karol's decisions of 2026-10-25 in
// context/archive/2026-10-25-game-summary/plan.md ("Implementation Approach": the examples 5/4/2/2, 5/3/3, 5/4/3/3,
// 4/4/4/4 and everyone at 0, at most 3 people unless the top tie alone is more, zeros in seat order). Every expected
// list is written out by hand, never computed. The sums come in seat order, as room_lobby gives them, and on purpose
// not sorted by votes.

function sums(revealed: number, ...entries: [string, number][]): GameTotals {
  return { revealed, totals: entries.map(([nick, votes]) => ({ nick, votes })) };
}

describe("gameSummary", () => {
  it("5, 4, 2, 2: the two with the most, the tie of two at 2 does not fit in 3", () => {
    const summary = gameSummary(sums(4, ["Ola", 2], ["Bartek", 5], ["Kuba", 2], ["Zosia", 4]));

    expect(summary.top).toEqual([
      { nick: "Bartek", votes: 5 },
      { nick: "Zosia", votes: 4 },
    ]);
  });

  it("5, 3, 3: three, the tie at 3 fits whole, in seat order", () => {
    const summary = gameSummary(sums(3, ["Ola", 3], ["Bartek", 5], ["Kuba", 3]));

    expect(summary.top).toEqual([
      { nick: "Bartek", votes: 5 },
      { nick: "Ola", votes: 3 },
      { nick: "Kuba", votes: 3 },
    ]);
  });

  it("5, 4, 3, 3: two, the tie at 3 would make four and ends the list", () => {
    const summary = gameSummary(sums(4, ["Ola", 3], ["Bartek", 4], ["Kuba", 5], ["Zosia", 3]));

    expect(summary.top).toEqual([
      { nick: "Kuba", votes: 5 },
      { nick: "Bartek", votes: 4 },
    ]);
  });

  it("4, 4, 4, 4: the whole top tie of four, past the limit of 3", () => {
    const summary = gameSummary(sums(4, ["Ola", 4], ["Bartek", 4], ["Kuba", 4], ["Zosia", 4]));

    expect(summary.top).toEqual([
      { nick: "Ola", votes: 4 },
      { nick: "Bartek", votes: 4 },
      { nick: "Kuba", votes: 4 },
      { nick: "Zosia", votes: 4 },
    ]);
  });

  it("a top tie past the limit is the whole list, so nobody joins it", () => {
    const summary = gameSummary(sums(5, ["Ola", 4], ["Bartek", 4], ["Igor", 2], ["Kuba", 4], ["Zosia", 4]));

    expect(summary.top).toEqual([
      { nick: "Ola", votes: 4 },
      { nick: "Bartek", votes: 4 },
      { nick: "Kuba", votes: 4 },
      { nick: "Zosia", votes: 4 },
    ]);
  });

  it("3, 2, 1: three groups of one fill the limit of 3 people", () => {
    const summary = gameSummary(sums(2, ["Ola", 1], ["Bartek", 2], ["Kuba", 3], ["Zosia", 0]));

    expect(summary.top).toEqual([
      { nick: "Kuba", votes: 3 },
      { nick: "Bartek", votes: 2 },
      { nick: "Ola", votes: 1 },
    ]);
  });

  // Everyone abstained in every reveal.
  it("everyone at 0: nobody has the most votes, and nobody got one", () => {
    const summary = gameSummary(sums(2, ["Ola", 0], ["Bartek", 0], ["Kuba", 0]));

    expect(summary.top).toEqual([]);
    expect(summary.unvoted).toEqual(["Ola", "Bartek", "Kuba"]);
  });

  it("one with votes: only them at the top, everyone else among the zeros", () => {
    const summary = gameSummary(sums(1, ["Ola", 0], ["Bartek", 3], ["Kuba", 0]));

    expect(summary).toEqual({ revealed: 1, votes: 3, top: [{ nick: "Bartek", votes: 3 }], unvoted: ["Ola", "Kuba"] });
  });

  it("lists the zeros in seat order, whatever the others got", () => {
    const summary = gameSummary(sums(3, ["Zosia", 0], ["Ola", 2], ["Kuba", 0], ["Bartek", 1], ["Igor", 0]));

    expect(summary.unvoted).toEqual(["Zosia", "Kuba", "Igor"]);
  });

  it("has no zeros when everyone got a vote", () => {
    const summary = gameSummary(sums(2, ["Ola", 1], ["Bartek", 2], ["Kuba", 1]));

    expect(summary.unvoted).toEqual([]);
  });

  // Kuba was let in after the last reveal (S-08): no result anywhere, so room_lobby gives him no entry. He is a player
  // of the room, but he could not get a vote, so "nobody voted for" him would not be true.
  it("leaves out a latecomer with no entry, from the zeros too", () => {
    const summary = gameSummary(sums(2, ["Ola", 2], ["Bartek", 0]));

    expect(summary).toEqual({ revealed: 2, votes: 2, top: [{ nick: "Ola", votes: 2 }], unvoted: ["Bartek"] });
  });

  it("keeps the number of revealed questions as it came", () => {
    expect(gameSummary(sums(12, ["Ola", 1], ["Bartek", 0])).revealed).toBe(12);
  });

  // "Ilość głosów łącznie" and the whole of the chart: the people outside the top count too (5 + 4 + 2 + 2 = 13), only
  // as a number.
  it("counts every vote of the game, those for the people outside the top too", () => {
    expect(gameSummary(sums(4, ["Ola", 2], ["Bartek", 5], ["Kuba", 2], ["Zosia", 4])).votes).toBe(13);
  });

  it("counts 0 votes when everyone abstained", () => {
    expect(gameSummary(sums(2, ["Ola", 0], ["Bartek", 0])).votes).toBe(0);
  });
});

// "1 głos, 2 głosy, 5 głosów", "1 pytanie, 2 pytania, 5 pytań": which of the three forms a count takes, now through the
// dictionary's plural (src/lib/i18n, S-27; the Polish rule of Intl.PluralRules). The forms are placeholders here, not
// the Polish words (test-plan §6.1).
describe("plural", () => {
  it.each([
    { count: 1, form: "one" },
    { count: 2, form: "few" },
    { count: 4, form: "few" },
    { count: 5, form: "many" },
    { count: 12, form: "many" },
    { count: 14, form: "many" },
    { count: 22, form: "few" },
    { count: 25, form: "many" },
    { count: 0, form: "many" },
    { count: 112, form: "many" },
    { count: 102, form: "few" },
  ])("gives $count the form $form", ({ count, form }) => {
    expect(plural("pl", count, { one: "one", few: "few", many: "many" })).toBe(form);
  });
});
