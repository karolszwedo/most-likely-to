import { describe, expect, it } from "vitest";
import { pieSlices, playerColors, resultBars, resultViews, slicePath, slicesInOrder } from "@/lib/rooms/chart";
import type { LobbyPlayer, RoundResult } from "@/lib/rooms/shared";

// The reveal's two views, "Koło" and "Paski" (Karol's decision after the screenshot review of Faza 4):
// - the toggle shows only when 1 to 20 players got a vote, and then the pie is the default; with nobody (everyone
//   abstained) or more than 20, only the bars and no toggle;
// - the pie has one slice per player with votes, in the reveal's order (most votes first, a tie in seat order), from
//   12 o'clock clockwise; one player with every vote is a full circle;
// - a bar is as long as its votes relative to the top count, which is a full bar.
// Every expected value below is worked out by hand, never by the module's own logic.

function seats(...entries: [string, number][]): RoundResult[] {
  return entries.map(([nick, votes]) => ({ nick, votes }));
}

// count players with one vote each, then two players with none.
function withVotes(count: number): RoundResult[] {
  const voted = Array.from({ length: count }, (_, index) => ({ nick: `Gracz ${index + 1}`, votes: 1 }));
  return [...voted, { nick: "Zero A", votes: 0 }, { nick: "Zero B", votes: 0 }];
}

describe("resultViews", () => {
  it.each([
    { count: 0, expected: { toggle: false, initial: "bars" } },
    { count: 1, expected: { toggle: true, initial: "pie" } },
    { count: 8, expected: { toggle: true, initial: "pie" } },
    { count: 9, expected: { toggle: true, initial: "pie" } },
    { count: 20, expected: { toggle: true, initial: "pie" } },
    { count: 21, expected: { toggle: false, initial: "bars" } },
  ])("with $count players who got votes: $expected", ({ count, expected }) => {
    expect(resultViews(withVotes(count))).toEqual(expected);
  });

  it("counts players, not votes: one player with 21 votes still gets the toggle", () => {
    expect(resultViews(seats(["Ola", 21], ["Bartek", 0]))).toEqual({ toggle: true, initial: "pie" });
  });
});

describe("pieSlices", () => {
  it("gives one player with every vote the full circle", () => {
    expect(pieSlices(seats(["Ola", 0], ["Bartek", 3], ["Kuba", 0]))).toEqual([
      { nick: "Bartek", votes: 3, startAngle: 0, endAngle: 360 },
    ]);
  });

  it("splits two equal counts into halves, the tie in seat order", () => {
    expect(pieSlices(seats(["Ola", 2], ["Bartek", 2]))).toEqual([
      { nick: "Ola", votes: 2, startAngle: 0, endAngle: 180 },
      { nick: "Bartek", votes: 2, startAngle: 180, endAngle: 360 },
    ]);
  });

  it("splits 3, 2 and 1 votes into 180°, 120° and 60°, most votes first", () => {
    expect(pieSlices(seats(["Ola", 1], ["Bartek", 3], ["Kuba", 2]))).toEqual([
      { nick: "Bartek", votes: 3, startAngle: 0, endAngle: 180 },
      { nick: "Kuba", votes: 2, startAngle: 180, endAngle: 300 },
      { nick: "Ola", votes: 1, startAngle: 300, endAngle: 360 },
    ]);
  });

  it("leaves out the players without votes and keeps the reveal's order", () => {
    const slices = pieSlices(seats(["Ola", 0], ["Bartek", 1], ["Kuba", 2], ["Zosia", 0], ["Igor", 1]));

    expect(slices.map((slice) => slice.nick)).toEqual(["Kuba", "Bartek", "Igor"]);
    expect(slices.map((slice) => [slice.startAngle, slice.endAngle])).toEqual([
      [0, 180],
      [180, 270],
      [270, 360],
    ]);
  });

  it("gives no slice when everyone abstained", () => {
    expect(pieSlices(seats(["Ola", 0], ["Bartek", 0]))).toEqual([]);
  });

  it("ends the last slice exactly at 360°, also when the shares do not divide evenly", () => {
    const slices = pieSlices(seats(["Ola", 1], ["Bartek", 1], ["Kuba", 1]));

    expect(slices.at(-1)?.endAngle).toBe(360);
    expect(slices[0].endAngle).toBeCloseTo(120, 9);
    expect(slices[1].endAngle).toBeCloseTo(240, 9);
  });
});

// The end of the evening: the top in its order, then one part for everyone else, last even when it is bigger.
describe("slicesInOrder", () => {
  it("keeps the order given: 6, 4, 3 and the rest's 5 of 18 votes", () => {
    const slices = slicesInOrder(seats(["Bartek", 6], ["Ola", 4], ["Kasia", 3], ["", 5]));

    expect(slices.map((slice) => slice.nick)).toEqual(["Bartek", "Ola", "Kasia", ""]);
    expect(slices.map((slice) => [slice.startAngle, slice.endAngle])).toEqual([
      [0, 120],
      [120, 200],
      [200, 260],
      [260, 360],
    ]);
  });

  it("leaves out a part with no votes: a top with every vote is the full circle", () => {
    expect(slicesInOrder(seats(["Bartek", 3], ["", 0]))).toEqual([
      { nick: "Bartek", votes: 3, startAngle: 0, endAngle: 360 },
    ]);
  });
});

describe("slicePath", () => {
  // A circle of radius 50 around (50, 50): 12 o'clock is (50, 0), 3 o'clock (100, 50), 6 o'clock (50, 100).
  it("draws no arc for the full circle (an SVG arc cannot draw 360°)", () => {
    expect(slicePath({ startAngle: 0, endAngle: 360 }, 50, 50)).toBeNull();
  });

  it("draws the right half from 12 to 6 o'clock", () => {
    expect(slicePath({ startAngle: 0, endAngle: 180 }, 50, 50)).toBe("M 50 50 L 50 0 A 50 50 0 0 1 50 100 Z");
  });

  it("draws a quarter from 12 to 3 o'clock", () => {
    expect(slicePath({ startAngle: 0, endAngle: 90 }, 50, 50)).toBe("M 50 50 L 50 0 A 50 50 0 0 1 100 50 Z");
  });

  it("takes the large arc for more than half the circle", () => {
    expect(slicePath({ startAngle: 90, endAngle: 360 }, 50, 50)).toBe("M 50 50 L 100 50 A 50 50 0 1 1 50 0 Z");
  });
});

describe("resultBars", () => {
  it("makes the top count a full bar and the others relative to it, in the reveal's order", () => {
    expect(resultBars(seats(["Ola", 2], ["Bartek", 4], ["Kuba", 1], ["Zosia", 0]))).toEqual([
      { nick: "Bartek", votes: 4, percent: 100 },
      { nick: "Ola", votes: 2, percent: 50 },
      { nick: "Kuba", votes: 1, percent: 25 },
      { nick: "Zosia", votes: 0, percent: 0 },
    ]);
  });

  it("gives a tie at the top two full bars", () => {
    expect(resultBars(seats(["Ola", 3], ["Bartek", 3])).map((bar) => bar.percent)).toEqual([100, 100]);
  });

  it("gives no bar when everyone abstained", () => {
    expect(resultBars(seats(["Ola", 0], ["Bartek", 0])).map((bar) => bar.percent)).toEqual([0, 0]);
  });
});

// Each player's stored colour (S-18, players.color in the room's state), as the database gave it: never from the place
// at the table nor from the votes; from the 21st player on colours repeat, as the database gives them.
describe("playerColors", () => {
  // The players in seat order, the first one the host, each with the colour given.
  function players(...entries: [string, number][]): LobbyPlayer[] {
    return entries.map(([nick, color], index) => ({ nick, host: index === 0, cohost: false, color }));
  }

  it("gives each nick its own stored colour, not its place: a guest second on the list with colour 7 has 7", () => {
    expect([...playerColors(players(["Ola", 0], ["Bartek", 7], ["Kuba", 1], ["Zosia", 19]))]).toEqual([
      ["Ola", 0],
      ["Bartek", 7],
      ["Kuba", 1],
      ["Zosia", 19],
    ]);
  });

  it("passes on a colour two players share from the 21st player on", () => {
    const twentyTwo = players(
      ...Array.from({ length: 20 }, (_, index): [string, number] => [`Gracz ${index + 1}`, index]),
      ["Gracz 21", 0],
      ["Gracz 22", 1],
    );
    const colors = playerColors(twentyTwo);

    expect(colors.size).toBe(22);
    expect(colors.get("Gracz 1")).toBe(0);
    expect(colors.get("Gracz 20")).toBe(19);
    expect(colors.get("Gracz 21")).toBe(0);
    expect(colors.get("Gracz 22")).toBe(1);
  });

  it("gives an empty list an empty map", () => {
    expect(playerColors([]).size).toBe(0);
  });
});
