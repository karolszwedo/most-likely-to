import { describe, expect, it } from "vitest";
import { bodyEmote, EMOTES, parseEmoteMessage } from "@/lib/rooms/emotes";

// S-16 (PRD FR-023): a player sends one of six emotes to the whole room, and everyone sees it with the sender's nick.
// The oracle is Karol's decision of 2026-10-26 (context/changes/room-emotes/change.md, Notes): ❤️ 👍 👎 😭 🤬 💀 in
// this order, with the nick. Of the fields the Worker signed (room-chat, Faza 1; tests/unit/live-sync-signature.test.ts)
// a screen shows an emote only when its id is one of the six and its nick is a player's on the screen's own list, as it
// stands there: case counts, as it does in a nick (context/domain/glossary.md, "nick"). Every expected value is written
// out by hand; nothing here is read from EMOTES.

// The ids as the plan names them (context/changes/room-emotes/plan.md, Faza 1 #1), in Karol's order.
const IDS = ["heart", "like", "dislike", "cry", "angry", "skull"];

// The room's players on the receiving screen, a nick with an emoji among them.
const NICKS: ReadonlySet<string> = new Set(["Bartek", "Ola", "Zosia 🎉"]);

describe("EMOTES", () => {
  it("holds Karol's six emotes in his order", () => {
    expect(EMOTES.map((emote) => emote.id)).toEqual(IDS);
    expect(EMOTES.map((emote) => emote.char)).toEqual(["❤️", "👍", "👎", "😭", "🤬", "💀"]);
  });

  it("gives every emote a name of its own for a screen reader", () => {
    const labels = EMOTES.map((emote) => emote.label.trim());

    expect(labels.every((label) => label.length > 0)).toBe(true);
    expect(new Set(labels).size).toBe(IDS.length);
  });
});

describe("bodyEmote", () => {
  it.each(IDS)("takes the body of a tap on %s", (id) => {
    expect(bodyEmote({ emote: id })).toBe(id);
  });

  it.each([
    ["an id off the list", { emote: "eggplant" }],
    ["an id in another case", { emote: "Heart" }],
    ["the emoji instead of its id", { emote: "❤️" }],
    ["a name from Object.prototype", { emote: "constructor" }],
    ["an emote that is not a text", { emote: 1 }],
    ["no emote", {}],
    ["an emote only on the prototype", Object.create({ emote: "heart" }) as unknown],
    ["null", null],
    ["an array", [{ emote: "heart" }]],
    ["a number", 42],
    ["the id alone", "heart"],
  ])("refuses %s", (_name, body) => {
    expect(bodyEmote(body)).toBeUndefined();
  });
});

describe("parseEmoteMessage", () => {
  it.each([
    [{ emote: "heart", nick: "Ola" }],
    [{ emote: "skull", nick: "Bartek" }],
    [{ emote: "cry", nick: "Zosia 🎉" }],
  ])("shows the emote of a player of the room: %j", (payload) => {
    expect(parseEmoteMessage(payload, NICKS)).toStrictEqual(payload);
  });

  it("keeps only the emote and the nick of a message with more", () => {
    expect(parseEmoteMessage({ emote: "like", nick: "Ola", seq: 7, color: "red" }, NICKS)).toStrictEqual({
      emote: "like",
      nick: "Ola",
    });
  });

  it("keeps only the emote and the nick of the fields of an opened envelope", () => {
    const opened = {
      v: 1,
      room: "3f2b8c1e-7a4d-4e9b-9c2a-5d6e7f8a9b0c",
      event: "emote",
      at: 1_763_380_000_000,
      id: "Pk7sW2nQ9xLb4VmT8rYc-a",
      emote: "heart",
      nick: "Ola",
    };

    expect(parseEmoteMessage(opened, NICKS)).toStrictEqual({ emote: "heart", nick: "Ola" });
  });

  it.each([
    ["a nick of no player", { emote: "heart", nick: "Kasia" }],
    ["a player's nick in another case", { emote: "heart", nick: "ola" }],
    ["a player's nick with a trailing space", { emote: "heart", nick: "Ola " }],
    ["an emote off the list", { emote: "eggplant", nick: "Ola" }],
    ["the emoji instead of its id", { emote: "❤️", nick: "Ola" }],
    ["a name from Object.prototype as the emote", { emote: "constructor", nick: "Ola" }],
    ["a nick that is not a text", { emote: "heart", nick: 1 }],
    ["no nick", { emote: "heart" }],
    ["no emote", { nick: "Ola" }],
    ["null", null],
    ["an array", [{ emote: "heart", nick: "Ola" }]],
    ["a text", "heart"],
  ])("drops %s", (_name, payload) => {
    expect(parseEmoteMessage(payload, NICKS)).toBeNull();
  });

  it("drops a player's emote on a screen whose list does not have them", () => {
    expect(parseEmoteMessage({ emote: "heart", nick: "Ola" }, new Set(["Bartek"]))).toBeNull();
  });
});
