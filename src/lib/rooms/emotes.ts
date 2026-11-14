// The room's emotes (S-16, PRD FR-023): the six a player sends to the whole room with one tap, in the order Karol
// chose (context/changes/room-emotes/change.md, Notes), and the checks of the body that sends one and of the message
// the players' channel brings (playersTopicFor in src/lib/live-sync/shared.ts). Shared by the Worker, the room screen
// and the tests. No server imports, so safe in the browser.

// id: what the body and the channel carry; char: what the screen shows; label: the button's name for a screen reader.
export const EMOTES = [
  { id: "heart", char: "❤️", label: "Serce" },
  { id: "like", char: "👍", label: "Kciuk w górę" },
  { id: "dislike", char: "👎", label: "Kciuk w dół" },
  { id: "cry", char: "😭", label: "Płacz" },
  { id: "angry", char: "🤬", label: "Wkurzenie" },
  { id: "skull", char: "💀", label: "Czaszka" },
] as const;

export type EmoteId = (typeof EMOTES)[number]["id"];

// An emote as the channel carries it: who sent it, by the nick room_lobby gave the Worker.
export interface EmoteMessage {
  emote: EmoteId;
  nick: string;
}

// After a tap every button of the bar rests this long. The screen keeps the pause itself: a player of the room, who has
// the channel key, sends to the players' channel past the Worker anyway (context/archive/2026-10-26-room-emotes/plan.md,
// What We're NOT Doing; context/changes/players-only-live-channel/plan.md, What We're NOT Doing).
export const EMOTE_COOLDOWN_MS = 3000;
// How long a bubble stays on everyone's screen.
export const EMOTE_SHOW_MS = 3000;
// The most bubbles on a screen at once; the rest is dropped.
export const EMOTE_MAX_SHOWN = 5;

// A Set, so an id is never looked up on Object.prototype ("constructor").
const EMOTE_IDS: ReadonlySet<string> = new Set(EMOTES.map((emote) => emote.id));

function isEmoteId(value: unknown): value is EmoteId {
  return typeof value === "string" && EMOTE_IDS.has(value);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

// The emote from the body of a player's tap ({emote}): an id of the list. undefined when the body has no emote, is not
// an object, or holds something else than an id of the list (an emoji itself included). Never logged.
export function bodyEmote(body: unknown): EmoteId | undefined {
  if (!isRecord(body) || !Object.hasOwn(body, "emote")) return undefined;
  const { emote } = body;
  return isEmoteId(emote) ? emote : undefined;
}

// An emote from the room's players' channel, which anyone with the channel key and the publishable key may send to
// (src/lib/live-sync/shared.ts, EMOTE_EVENT): only an id of the list with a nick of the receiver's own list of players,
// as a text and as it stands there (case counts, as in a nick); null for anything else, which the screen does not show.
// Copies only the contract's keys. A player who has the key may still forge another player's nick (no server's
// signature, decision 1 of context/changes/players-only-live-channel/plan.md): this stops a stranger's nick and an emote
// off the list, never a player's nick.
export function parseEmoteMessage(payload: unknown, nicks: ReadonlySet<string>): EmoteMessage | null {
  if (!isRecord(payload)) return null;
  const { emote, nick } = payload;
  if (!isEmoteId(emote) || typeof nick !== "string" || !nicks.has(nick)) return null;
  return { emote, nick };
}
