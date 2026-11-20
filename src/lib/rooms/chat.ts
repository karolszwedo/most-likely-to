// The room's chat (S-23, PRD FR-028): short messages a player writes to the whole room, which everyone sees live with
// the sender's nick, in the lobby, during the game and on the end of the evening. A message is a text or, since
// room-chat-gifs (S-24), a gif from KLIPY's search with its description. The limits Karol chose
// (context/archive/2026-11-17-room-chat/plan.md, decision 1) and the rules of a message's text and of a gif, for the
// body that sends one and for the message the players' channel brings (playersTopicFor in src/lib/live-sync/shared.ts).
// Shared by the Worker, the room screen and the tests. No server imports, so safe in the browser. Nothing of a message
// is ever written, a gif's address and description neither: not to the database, a log line, the browser's storage or
// an address; a screen keeps the last ones in its tab's memory only.

import { chatText } from "@/lib/rooms/chat-text";
import { gifTitle, isKlipyMediaUrl } from "@/lib/rooms/gifs";

// The rules of a text, shared with a gif's description (src/lib/rooms/chat-text.ts).
export { chatTextLength, isBlankChatText } from "@/lib/rooms/chat-text";

// The longest message, in characters as a person counts them: a Polish letter or an emoji is one (chatTextLength).
export const CHAT_MAX_LENGTH = 200;
// After a message the player's "Wyślij" rests this long. The screen keeps the pause itself, as with the emotes: a
// player of the room, who has the channel key, sends to the players' channel past the Worker anyway, and the Worker
// keeps no count (context/archive/2026-11-17-room-chat/plan.md, What We're NOT Doing).
export const CHAT_COOLDOWN_MS = 2000;
// The most messages a screen keeps; an older one is dropped. Only in the tab's memory, so a reload starts empty.
export const CHAT_MAX_KEPT = 50;

// A message as a screen keeps it: the random id the Worker signed it with (one per message, also a key for the list),
// who sent it, by the nick room_lobby gave the Worker, and what it says: a text, as plain text, or a gif (ChatGif).
export interface ChatText {
  id: string;
  nick: string;
  kind: "text";
  text: string;
}

// A gif on the chat (room-chat-gifs): its address on one of KLIPY's media hosts, exactly as KLIPY gave it
// (isKlipyMediaUrl, src/lib/rooms/gifs.ts), and its description for a screen reader, "" when it had none the chat
// takes.
export interface ChatGif {
  id: string;
  nick: string;
  kind: "gif";
  gif: string;
  title: string;
}

export type ChatMessage = ChatText | ChatGif;

// What a message says, as the body of a player's message gives it and the Worker signs it: a message without the id
// the Worker draws and the nick it takes from room_lobby.
export type ChatContent = Omit<ChatText, "id" | "nick"> | Omit<ChatGif, "id" | "nick">;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

// What a message says, from the record's own keys: exactly one of text and gif. A text that passes chatText; or a gif
// whose address passes isKlipyMediaUrl (src/lib/rooms/gifs.ts), as it is, with its description as gifTitle gives it,
// the same as the search showed the sender (src/lib/rooms/gifs.ts): normalized, or "" when it is missing, empty, too
// long or breaks the rules of a text; it only helps a screen reader, so it is never a reason to refuse the gif.
// undefined for both keys, for neither, or for a text or an address the chat does not take.
function chatContent(record: Record<string, unknown>): ChatContent | undefined {
  const hasText = Object.hasOwn(record, "text");
  if (hasText === Object.hasOwn(record, "gif")) return undefined;
  if (hasText) {
    const text = chatText(record.text, CHAT_MAX_LENGTH);
    return text === undefined ? undefined : { kind: "text", text };
  }
  const { gif } = record;
  if (!isKlipyMediaUrl(gif)) return undefined;
  return { kind: "gif", gif, title: Object.hasOwn(record, "title") ? gifTitle(record.title) : "" };
}

// What the body of a player's message says ({text} as typed, or {gif, title?} with a gif from KLIPY's search,
// room-chat-gifs), as chatContent takes it: what the Worker signs and sends, the text normalized, the address as it
// came. undefined when the body is not an object, has neither or both of text and gif as keys of its own, or holds a
// text the chat does not take (empty, only blanks or invisible characters, longer than CHAT_MAX_LENGTH, a control or
// direction character) or an address that is not KLIPY's (isKlipyMediaUrl). Never logged.
export function bodyChatContent(body: unknown): ChatContent | undefined {
  if (!isRecord(body)) return undefined;
  return chatContent(body);
}

// A message from the room's players' channel, as the screen opened it: only fields the Worker signed for this room
// (openSignedMessage in src/lib/live-sync/signature.ts, in useRoomState), so the nick is the one room_lobby gave the
// Worker, never one a player with the channel key typed in past it. Of those it takes only a message id, a nick of the
// receiver's own list of players, as a text and as it stands there (case counts, as in a nick), and a text or a gif
// that passes the rules of bodyChatContent; null for anything else, which the screen does not show: a message of a
// version with other rules, or of a player who has left this screen's list since (removed). Copies only the contract's
// keys.
export function parseChatMessage(fields: unknown, nicks: ReadonlySet<string>): ChatMessage | null {
  if (!isRecord(fields)) return null;
  const { id, nick } = fields;
  if (typeof id !== "string" || id === "" || typeof nick !== "string" || !nicks.has(nick)) return null;
  const content = chatContent(fields);
  if (content === undefined) return null;
  return { id, nick, ...content };
}

// A screen's list of messages with one more at its end, the oldest dropped past CHAT_MAX_KEPT. A message whose id is on
// the list already leaves it as it was (the same list), so a copy never shows twice. Of either kind, or of one only.
export function appendChatMessage<T extends ChatMessage>(list: readonly T[], message: T): readonly T[] {
  if (list.some((kept) => kept.id === message.id)) return list;
  return [...list, message].slice(-CHAT_MAX_KEPT);
}

// A screen's list of messages without those of a nick that is no longer on its list of players: a leader removed the
// player, and the player's messages, gifs too, go from every screen with them
// (context/archive/2026-11-17-room-chat/plan.md, decision 2). The screen calls it when a refreshed state brings its
// list of players, not when it draws the chat, so a player who comes in later under the same nick never brings the old
// messages back. The same list when nothing goes.
export function keepPlayersChat<T extends ChatMessage>(list: readonly T[], nicks: ReadonlySet<string>): readonly T[] {
  const kept = list.filter((message) => nicks.has(message.nick));
  return kept.length === list.length ? list : kept;
}
