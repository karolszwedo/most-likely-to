import { describe, expect, it } from "vitest";
import {
  appendChatMessage,
  bodyChatText,
  CHAT_COOLDOWN_MS,
  CHAT_MAX_KEPT,
  CHAT_MAX_LENGTH,
  chatTextLength,
  keepPlayersChat,
  parseChatMessage,
  type ChatMessage,
} from "@/lib/rooms/chat";

// S-23 (PRD FR-028): a player writes short messages to the whole room, and everyone sees them with the sender's nick.
// The oracle is Karol's decision 1 of 2026-11-17 (context/changes/room-chat/plan.md, Overview): a message has up to 200
// characters, counted as in the field of a proposal, so a Polish letter and an emoji are one character each, and a
// player waits 2 s between messages; a screen keeps the last 50 (plan, Desired End State). The text is plain text: no
// control characters and no characters that turn the direction of the text around them (plan, Faza 2 #1). Of the
// fields the Worker signed (tests/unit/live-sync-signature.test.ts) a screen shows a message only when its nick is a
// player's on the screen's own list, as it stands there: case counts, as it does in a nick (context/domain/glossary.md,
// "nick"). Every expected value is written out by hand.

// 4 Polish letters, written composed (NFC), 50 times: 200 characters.
const POLISH_200 = "żółć".repeat(50);
// The same letters typed as a base letter and a combining mark where Unicode has one (ż, ó, ć; ł has none): 350 code
// points before NFC, 200 characters after.
const POLISH_200_DECOMPOSED = "żółć".repeat(50);
// An emoji of one code point (two UTF-16 units), 200 times.
const EMOJI_200 = "😀".repeat(200);

// The room's players on the receiving screen, a nick with an emoji among them.
const NICKS: ReadonlySet<string> = new Set(["Bartek", "Ola", "Zosia 🎉"]);
// A message's random id as the Worker makes it: 16 bytes, 22 base64url characters.
const ID = "Pk7sW2nQ9xLb4VmT8rYc-a";

describe("the chat's limits", () => {
  it("are Karol's: 200 characters, a 2 s pause, the last 50 messages on a screen", () => {
    expect(CHAT_MAX_LENGTH).toBe(200);
    expect(CHAT_COOLDOWN_MS).toBe(2000);
    expect(CHAT_MAX_KEPT).toBe(50);
  });
});

describe("chatTextLength", () => {
  it.each([
    ["a Polish letter as one character", "żółć", 4],
    ["a Polish letter typed with a combining mark as one character", "żółć", 4],
    ["an emoji as one character", "😀😀", 2],
    ["the text with its blanks collapsed and cut at the edges", "  a \n\n b  ", 3],
    ["a trailing question mark, which is the player's own", "Serio?", 6],
  ])("counts %s", (_name, text, length) => {
    expect(chatTextLength(text)).toBe(length);
  });
});

describe("bodyChatText", () => {
  it.each([
    ["one character", "a"],
    ["200 characters", "a".repeat(200)],
    ["200 Polish letters", POLISH_200],
    ["200 simple emoji", EMOJI_200],
    ["a word that names something on Object.prototype, which is just a word", "constructor"],
    ["an emoji of a family joined with zero-width joiners", "Moja ekipa: 👨\u200D👩\u200D👧"],
    ["a word with a zero-width space inside", "su\u200Bper"],
  ])("takes a message of %s as it is", (_name, text) => {
    expect(bodyChatText({ text })).toBe(text);
  });

  it("takes 200 Polish letters typed with combining marks, as 200 composed letters", () => {
    expect(bodyChatText({ text: POLISH_200_DECOMPOSED })).toBe(POLISH_200);
  });

  it.each([
    ["runs of spaces and newlines inside", "Hej,\n\nco   słychać?", "Hej, co słychać?"],
    ["a Windows newline and a tab", "Linia 1\r\n\tLinia 2", "Linia 1 Linia 2"],
    ["non-breaking spaces", "a  b", "a b"],
    ["blanks at the edges", " \n Hej \t ", "Hej"],
    [
      "200 characters once blanks collapse, though more as typed",
      `  ${"a".repeat(100)}\n\n\n${"b".repeat(99)}  `,
      `${"a".repeat(100)} ${"b".repeat(99)}`,
    ],
  ])("collapses %s into one space", (_name, text, expected) => {
    expect(bodyChatText({ text })).toBe(expected);
  });

  it.each([
    ["no character", { text: "" }],
    ["only blanks and newlines", { text: "  \n\t  " }],
    ["201 characters", { text: "a".repeat(201) }],
    ["201 Polish letters", { text: `${POLISH_200}ą` }],
    ["201 simple emoji", { text: "😀".repeat(201) }],
    ["a NUL character", { text: "Cześć\u0000" }],
    ["an escape character", { text: "\u001b[31mCześć" }],
    ["a right-to-left override", { text: "Cześć \u202Etxt.exe" }],
    ["a first-strong isolate", { text: "Cześć \u2068Ola\u2069" }],
    ["only a zero-width space", { text: "\u200B" }],
    ["only invisible characters among blanks", { text: " \u200B\u2060 \uFEFF\u200D " }],
    ["only a left-to-right mark", { text: "\u200E" }],
    ["a text that is not a text", { text: 42 }],
    ["a null text", { text: null }],
    ["no text", {}],
    ["a text only on the prototype", Object.create({ text: "Hej" }) as unknown],
    ["a name from Object.prototype as the body", "constructor"],
    ["the text alone", "Hej"],
    ["null", null],
    ["an array", [{ text: "Hej" }]],
  ])("refuses %s", (_name, body) => {
    expect(bodyChatText(body)).toBeUndefined();
  });
});

describe("parseChatMessage", () => {
  it.each([
    [{ id: ID, nick: "Ola", text: "Hej" }],
    [{ id: ID, nick: "Bartek", text: EMOJI_200 }],
    [{ id: ID, nick: "Zosia 🎉", text: POLISH_200 }],
  ])("shows the message of a player of the room: %j", (fields) => {
    expect(parseChatMessage(fields, NICKS)).toStrictEqual(fields);
  });

  it("keeps only the id, the nick and the text of the fields of an opened envelope", () => {
    const opened = {
      v: 1,
      room: "3f2b8c1e-7a4d-4e9b-9c2a-5d6e7f8a9b0c",
      event: "chat",
      at: 1_763_380_000_000,
      id: ID,
      text: "Kto stawia pizzę? 🍕",
      nick: "Ola",
    };

    expect(parseChatMessage(opened, NICKS)).toStrictEqual({ id: ID, nick: "Ola", text: "Kto stawia pizzę? 🍕" });
  });

  it.each([
    ["a nick of no player", { id: ID, nick: "Kasia", text: "Hej" }],
    ["a player's nick in another case", { id: ID, nick: "ola", text: "Hej" }],
    ["a player's nick with a trailing space", { id: ID, nick: "Ola ", text: "Hej" }],
    ["a nick that is not a text", { id: ID, nick: 1, text: "Hej" }],
    ["no nick", { id: ID, text: "Hej" }],
    ["201 characters", { id: ID, nick: "Ola", text: "a".repeat(201) }],
    ["an empty text", { id: ID, nick: "Ola", text: "" }],
    ["a NUL character", { id: ID, nick: "Ola", text: "Cześć\u0000" }],
    ["a right-to-left override", { id: ID, nick: "Ola", text: "Cześć \u202Etxt.exe" }],
    ["a text that is not a text", { id: ID, nick: "Ola", text: 42 }],
    ["no text", { id: ID, nick: "Ola" }],
    ["no id", { nick: "Ola", text: "Hej" }],
    ["an id that is not a text", { id: 7, nick: "Ola", text: "Hej" }],
    ["null", null],
    ["an array", [{ id: ID, nick: "Ola", text: "Hej" }]],
    ["a text", "Hej"],
  ])("drops %s", (_name, fields) => {
    expect(parseChatMessage(fields, NICKS)).toBeNull();
  });

  it("drops a player's message on a screen whose list does not have them", () => {
    expect(parseChatMessage({ id: ID, nick: "Ola", text: "Hej" }, new Set(["Bartek"]))).toBeNull();
  });
});

// A screen's list of messages (plan, Faza 3 #3): the last 50 in the order they came, and a removed player's messages
// gone from it (Karol's decision 2 of 2026-11-17: when a leader removes a player, the player's messages leave the
// chat on everyone else's screen).
describe("appendChatMessage", () => {
  const first: ChatMessage = { id: "m1", nick: "Ola", text: "Hej" };
  const second: ChatMessage = { id: "m2", nick: "Bartek", text: "Cześć 🎉" };

  it("puts a new message at the end of the list", () => {
    expect(appendChatMessage([first], second)).toStrictEqual([first, second]);
  });

  it("leaves the list as it was for a message already on it", () => {
    const list = [first, second];

    expect(appendChatMessage(list, { ...first })).toBe(list);
  });

  it("keeps the newest 50 and drops the oldest when the 51st comes", () => {
    const fifty = Array.from({ length: 50 }, (_, index) => ({ id: `m${String(index)}`, nick: "Ola", text: "Hej" }));
    const fiftyFirst: ChatMessage = { id: "m50", nick: "Bartek", text: "Ostatnia" };

    const list = appendChatMessage(fifty, fiftyFirst);

    expect(list).toHaveLength(50);
    expect(list[0]).toStrictEqual({ id: "m1", nick: "Ola", text: "Hej" });
    expect(list[49]).toStrictEqual(fiftyFirst);
  });
});

describe("keepPlayersChat", () => {
  const ola: ChatMessage = { id: "m1", nick: "Ola", text: "Hej" };
  const bartek: ChatMessage = { id: "m2", nick: "Bartek", text: "Cześć" };
  const olaAgain: ChatMessage = { id: "m3", nick: "Ola", text: "Gramy?" };
  const zosia: ChatMessage = { id: "m4", nick: "Zosia 🎉", text: "Jasne" };

  it("drops every message of a removed player and keeps the rest in their order", () => {
    expect(keepPlayersChat([ola, bartek, olaAgain, zosia], new Set(["Bartek", "Zosia 🎉"]))).toStrictEqual([
      bartek,
      zosia,
    ]);
  });

  it("gives the same list when every sender is still on the list of players", () => {
    const list = [ola, bartek, zosia];

    expect(keepPlayersChat(list, NICKS)).toBe(list);
  });

  it("keeps a removed player's messages away when someone comes in under the same nick", () => {
    const afterRemoval = keepPlayersChat([ola, bartek], new Set(["Bartek"]));
    const newOla: ChatMessage = { id: "m5", nick: "Ola", text: "To ja, nowa Ola" };

    expect(keepPlayersChat(appendChatMessage(afterRemoval, newOla), NICKS)).toStrictEqual([bartek, newOla]);
  });
});
