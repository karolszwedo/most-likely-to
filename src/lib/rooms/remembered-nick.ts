import { logEvent } from "@/lib/log";
import { MAX_PIE_SLICES } from "@/lib/rooms/chart";
import { NICK_MAX_LENGTH, nickLength, type RoomView } from "@/lib/rooms/shared";

// What this browser remembers about its player between games. In localStorage two values under two keys: the nick
// (S-14, FR-024), the last nick the database took, which the join form and "Nowa gra" suggest in an empty field; and the
// colour (S-18, FR-025), the last colour the player picked from the palette, which the room's screen asks for once in
// the next game. In sessionStorage only the id of the room in which the screen has already asked for that colour. Never
// a vote, its target, a token or anything else about the game (AGENTS.md, Hard Rules; roadmap S-14). Storage that
// refuses (private mode, blocked site data, a full quota) only means no suggestion: nothing here throws to the screen,
// and a failure leaves a log line with its step and the error's name, never the value.

export const REMEMBERED_NICK_KEY = "mlt-nick";
export const REMEMBERED_COLOR_KEY = "mlt-color";
export const COLOR_ASKED_KEY = "mlt-color-asked";

// The only two calls the module makes, so a unit test can pass a fake in place of the browser's storage.
export type NickStorage = Pick<Storage, "getItem" | "setItem">;

function errorName(error: unknown): string {
  return error instanceof Error ? error.name : "unknown";
}

// A nick the form would take, by the part of the nick rule a browser can apply (nickLength); the database has the
// final word. Anything else is neither written nor suggested.
function isNick(value: string): boolean {
  const length = nickLength(value);
  return length >= 1 && length <= NICK_MAX_LENGTH;
}

// The browser's storage, or null on the server and when even reaching it throws (blocked site data). The one line that
// reaches it; the rest of the module works on what this returns.
export function browserNickStorage(): NickStorage | null {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage;
  } catch (error) {
    logEvent("warn", { op: "remembered_nick", step: "open", errName: errorName(error) });
    return null;
  }
}

// The remembered nick as it was stored, or null when there is none, when it is not a nick the form would take (edited
// by hand, left by an older rule) or when the storage refuses.
export function readRememberedNick(storage: NickStorage | null): string | null {
  if (storage === null) return null;
  let value: string | null;
  try {
    value = storage.getItem(REMEMBERED_NICK_KEY);
  } catch (error) {
    logEvent("warn", { op: "remembered_nick", step: "read", errName: errorName(error) });
    return null;
  }
  return value !== null && isNick(value) ? value : null;
}

// Remembers a nick the database took, with one write under the module's key and nothing else; a value the form would
// refuse is not written. A write the storage refuses leaves the old nick, never an error on the screen.
export function rememberNick(storage: NickStorage | null, nick: string): void {
  if (storage === null || !isNick(nick)) return;
  try {
    storage.setItem(REMEMBERED_NICK_KEY, nick);
  } catch (error) {
    logEvent("warn", { op: "remembered_nick", step: "write", errName: errorName(error) });
  }
}

// A colour of the game's palette: a whole number 0 … MAX_PIE_SLICES - 1, as players.color holds it.
function isColor(value: number): boolean {
  return Number.isInteger(value) && value >= 0 && value < MAX_PIE_SLICES;
}

// The remembered colour, or null when there is none, when it is not a colour of the palette (written as anything but
// its plain number) or when the storage refuses.
export function readRememberedColor(storage: NickStorage | null): number | null {
  if (storage === null) return null;
  let value: string | null;
  try {
    value = storage.getItem(REMEMBERED_COLOR_KEY);
  } catch (error) {
    logEvent("warn", { op: "remembered_color", step: "read", errName: errorName(error) });
    return null;
  }
  if (value === null || !/^\d{1,2}$/.test(value)) return null;
  const color = Number(value);
  return isColor(color) ? color : null;
}

// Remembers a colour the player picked from the palette and the database took, with one write under its key; never a
// colour the game gave on the way in, so that never overwrites the player's own pick.
export function rememberColor(storage: NickStorage | null, color: number): void {
  if (storage === null || !isColor(color)) return;
  try {
    storage.setItem(REMEMBERED_COLOR_KEY, String(color));
  } catch (error) {
    logEvent("warn", { op: "remembered_color", step: "write", errName: errorName(error) });
  }
}

// The browser's sessionStorage (this tab, until it closes), or null as browserNickStorage gives it.
export function browserSessionStorage(): NickStorage | null {
  if (typeof window === "undefined") return null;
  try {
    return window.sessionStorage;
  } catch (error) {
    logEvent("warn", { op: "color_asked", step: "open", errName: errorName(error) });
    return null;
  }
}

// Whether this tab has already asked for the remembered colour in this room; false when the storage refuses (the
// screen then asks at most once per page load).
export function colorAskedIn(session: NickStorage | null, roomId: string): boolean {
  if (session === null) return false;
  try {
    return session.getItem(COLOR_ASKED_KEY) === roomId;
  } catch (error) {
    logEvent("warn", { op: "color_asked", step: "read", errName: errorName(error) });
    return false;
  }
}

// Notes that this tab has asked for the remembered colour in this room: one value, the room's id.
export function markColorAsked(session: NickStorage | null, roomId: string): void {
  if (session === null) return;
  try {
    session.setItem(COLOR_ASKED_KEY, roomId);
  } catch (error) {
    logEvent("warn", { op: "color_asked", step: "write", errName: errorName(error) });
  }
}

// The colour the screen asks for on the way into a room (decision 5): the remembered one, only while the game is not
// closed, the player is on the list, has another colour and no other player has it; null otherwise.
export function rememberedColorRequest(view: RoomView, remembered: number | null): number | null {
  if (remembered === null || view.status === "closed") return null;
  const me = view.players.find((player) => player.nick === view.me);
  if (me === undefined || me.color === remembered) return null;
  if (view.players.some((player) => player.nick !== view.me && player.color === remembered)) return null;
  return remembered;
}
