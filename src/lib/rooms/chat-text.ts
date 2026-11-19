// The rules of a text on the room's chat (S-23, src/lib/rooms/chat.ts): a message's text and a gif's description
// (room-chat-gifs, src/lib/rooms/gifs.ts) follow the same ones, so both modules take them from here, and neither
// imports the other's rules in a circle. No server imports, so safe in the browser. Never logs a text.

// What no text may hold once whitespace runs are one space: a control character (\p{Cc}: NUL, ESC, DEL and the C1
// ones; a tab or a newline is whitespace and is gone by then), and the characters that change the direction of the
// text around them (U+202A–U+202E embeddings and overrides, U+2066–U+2069 isolates), which could make a message read
// as something else on another player's screen.
const REFUSED_CHARACTERS = /[\p{Cc}‪-‮⁦-⁩]/u;

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

// True for a text with nothing to read once normalized: empty, only blanks, or only format characters (\p{Cf}: a
// zero-width space U+200B, a word joiner U+2060, a direction mark…), which would stand on every screen as an empty
// message under the sender's nick (impl-review F3). A format character inside a readable text stays (an emoji joined
// with U+200D, a soft hyphen). The screen's check before sending and the Worker's rule are this one function.
export function isBlankChatText(text: string): boolean {
  return (
    normalizeChatText(text)
      .replace(/\p{Cf}/gu, "")
      .trim() === ""
  );
}

// The normalized text: 1 to max characters (CHAT_MAX_LENGTH for a message, GIF_TITLE_MAX_LENGTH for a gif's
// description), something to read, and none of REFUSED_CHARACTERS. undefined for anything else.
export function chatText(text: unknown, max: number): string | undefined {
  if (typeof text !== "string") return undefined;
  const normalized = normalizeChatText(text);
  const length = Array.from(normalized).length;
  if (length > max || isBlankChatText(normalized) || REFUSED_CHARACTERS.test(normalized)) return undefined;
  return normalized;
}
