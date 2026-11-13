import { describe, expect, it } from "vitest";
import { hostGameRow } from "@/lib/rooms/game-list";
import type { HostGame } from "@/lib/rooms/shared";

// A row of the host's list of own games ("Twoje gry", /gry) as the page shows it. Oracle: Karol's picks of 2026-11-11
// in context/changes/host-game-history/plan.md (decision 3 and the screenshots: the date "D2", e.g. "wtorek, 10
// listopada 2026, 21:14", in Europe/Warsaw; "1 pytanie", "2 pytania", "7 pytań"; a game that never started shows the
// day its room was made and "Gra nie wystartowała"). Every expected text is written out by hand from a calendar, never
// formatted here: the date format is the decision itself, so this test spells it out. Each instant is given in UTC
// and lies so close to midnight that the day itself differs in UTC: a row made in the runtime's zone (the Worker runs
// in UTC) or in UTC fails, in summer time (CEST, UTC+2) and in winter time (CET, UTC+1) alike.

function game(change: Partial<HostGame>): HostGame {
  return {
    id: "3f2b8c1e-7a4d-4e9b-9c2a-5d6e7f8a9b0c",
    createdAt: "2026-11-10T19:50:00+00:00",
    startedAt: "2026-11-10T20:14:00+00:00",
    questions: 7,
    nicks: ["Ola", "Bartek", "Kasia 🎉"],
    ...change,
  };
}

describe("hostGameRow", () => {
  it("dates a game by its start in Polish time: the weekday, the day, the month, the year and the hour", () => {
    // 20:14 UTC in November is 21:14 in Warsaw (CET). As the database sends it: microseconds and an offset.
    expect(hostGameRow(game({ startedAt: "2026-11-10T20:14:33.123456+00:00" })).date).toBe(
      "wtorek, 10 listopada 2026, 21:14",
    );
  });

  it("winter time (CET, UTC+1): 23:30 UTC on a Tuesday is already Wednesday in Warsaw", () => {
    expect(hostGameRow(game({ startedAt: "2026-11-10T23:30:00+00:00" })).date).toBe("środa, 11 listopada 2026, 00:30");
  });

  it("summer time (CEST, UTC+2): 22:15 UTC on a Saturday is already Sunday in Warsaw", () => {
    expect(hostGameRow(game({ startedAt: "2026-07-04T22:15:00+00:00" })).date).toBe("niedziela, 5 lipca 2026, 00:15");
  });

  it("a minute and an hour below 10 keep two digits", () => {
    // 07:05 UTC in July is 09:05 in Warsaw.
    expect(hostGameRow(game({ startedAt: "2026-07-14T07:05:00+00:00" })).date).toBe("wtorek, 14 lipca 2026, 09:05");
  });

  it.each([
    [1, "1 pytanie"],
    [2, "2 pytania"],
    [4, "4 pytania"],
    [5, "5 pytań"],
    [12, "12 pytań"],
    [22, "22 pytania"],
  ])("a game that opened %i questions says %s", (questions, text) => {
    expect(hostGameRow(game({ questions })).questions).toBe(text);
  });

  it("a game that never started: the day its room was made, and no count of questions", () => {
    // 23:10 UTC on 7 November 2026 (a Saturday) is 00:10 on Sunday in Warsaw.
    const row = hostGameRow(game({ createdAt: "2026-11-07T23:10:00+00:00", startedAt: null, questions: 0 }));

    expect(row.date).toBe("niedziela, 8 listopada 2026, 00:10");
    expect(row.questions).toBe("Gra nie wystartowała");
  });

  it("the nicks in the order they came, the host's included, joined with a comma", () => {
    const row = hostGameRow(game({ nicks: ["Ola", "Najdłuższy nick 20zn", "Kasia 🎉"] }));

    expect(row.nicks).toBe("Ola, Najdłuższy nick 20zn, Kasia 🎉");
  });

  it("keeps the room's id, the handle of the deletion", () => {
    expect(hostGameRow(game({ id: "0b6c2a51-9d3e-4f8a-8c71-2e5d9a4b7f10" })).id).toBe(
      "0b6c2a51-9d3e-4f8a-8c71-2e5d9a4b7f10",
    );
  });
});
