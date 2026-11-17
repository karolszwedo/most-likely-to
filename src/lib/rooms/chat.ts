// The room's chat (S-23, PRD FR-028): short messages a player writes to the whole room, which everyone sees live with
// the sender's nick, in the lobby, during the game and on the end of the evening. The limits Karol chose
// (context/changes/room-chat/plan.md, decision 1) and the rules of a message's text, for the body that sends one
// and for the message the players' channel brings (playersTopicFor in src/lib/live-sync/shared.ts). Shared by the
// Worker, the room screen and the tests. No server imports, so safe in the browser. Nothing of a message is ever
// written: not to the database, a log line, the browser's storage or an address; a screen keeps the last ones in its
// tab's memory only.

// The longest message, in characters as a person counts them: a Polish letter or an emoji is one (chatTextLength).
export const CHAT_MAX_LENGTH = 200;
// After a message the player's "Wyślij" rests this long. The screen keeps the pause itself, as with the emotes: a
// player of the room, who has the channel key, sends to the players' channel past the Worker anyway, and the Worker
// keeps no count (context/changes/room-chat/plan.md, What We're NOT Doing).
export const CHAT_COOLDOWN_MS = 2000;
// The most messages a screen keeps; an older one is dropped. Only in the tab's memory, so a reload starts empty.
export const CHAT_MAX_KEPT = 50;

// A message as a screen keeps it: the random id the Worker signed it with (one per message, also a key for the list),
// who sent it, by the nick room_lobby gave the Worker, and its text, as plain text.
export interface ChatMessage {
  id: string;
  nick: string;
  text: string;
}

// What no message may hold once whitespace runs are one space: a control character (\p{Cc}: NUL, ESC, DEL and the C1
// ones; a tab or a newline is whitespace and is gone by then), and the characters that change the direction of the
// text around them (U+202A–U+202E embeddings and overrides, U+2066–U+2069 isolates), which could make a message read
// as something else on another player's screen.
const REFUSED_CHARACTERS = /[\p{Cc}\u202A-\u202E\u2066-\u2069]/u;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

// The text as the room sees it: NFC, so a letter typed as a base and a combining mark is one character; every run of
// whitespace, newlines included, one space; no blanks at the edges.
function normalizeChatText(text: string): string {
  return text.normalize("NFC").replace(/\s+/g, " ").trim();
}

// A message's length as the room counts it: code points of the normalized text, as questionLength
// (src/lib/rooms/shared.ts) counts a question, without cutting a trailing "?": in a message it is the player's own.
export function chatTextLength(text: string): number {
  return Array.from(normalizeChatText(text)).length;
}

// The normalized text of a message: 1 to CHAT_MAX_LENGTH characters and none of REFUSED_CHARACTERS. undefined for
// anything else.
function chatText(text: unknown): string | undefined {
  if (typeof text !== "string") return undefined;
  const normalized = normalizeChatText(text);
  const length = Array.from(normalized).length;
  if (length < 1 || length > CHAT_MAX_LENGTH || REFUSED_CHARACTERS.test(normalized)) return undefined;
  return normalized;
}

// The text from the body of a player's message ({text}), normalized: what the Worker signs and sends. undefined when
// the body has no text of its own, is not an object, or holds a text the chat does not take (empty or only blanks,
// longer than CHAT_MAX_LENGTH, a control or direction character). Never logged.
export function bodyChatText(body: unknown): string | undefined {
  if (!isRecord(body) || !Object.hasOwn(body, "text")) return undefined;
  return chatText(body.text);
}

// A message from the room's players' channel, as the screen opened it: only fields the Worker signed for this room
// (openSignedMessage in src/lib/live-sync/signature.ts, in useRoomState), so the nick is the one room_lobby gave the
// Worker, never one a player with the channel key typed in past it. Of those it takes only a message id, a nick of the
// receiver's own list of players, as a text and as it stands there (case counts, as in a nick), and a text that passes
// the rules of bodyChatText; null for anything else, which the screen does not show: a message of a version with other
// rules, or of a player who has left this screen's list since (removed). Copies only the contract's keys.
export function parseChatMessage(fields: unknown, nicks: ReadonlySet<string>): ChatMessage | null {
  if (!isRecord(fields)) return null;
  const { id, nick } = fields;
  if (typeof id !== "string" || id === "" || typeof nick !== "string" || !nicks.has(nick)) return null;
  const text = chatText(fields.text);
  if (text === undefined) return null;
  return { id, nick, text };
}
