import { logEvent } from "@/lib/log";
import type { SessionStorage } from "@/lib/rooms/remembered-nick";
import { NICK_MAX_LENGTH, nickLength } from "@/lib/rooms/shared";

// This tab's own vote in the round now voting (S-04, decision D1): after a reload the screen says again whom its player
// voted for, as it did before the reload. In sessionStorage only (this tab, until it closes), one entry per room: the
// round's number and the nick, or null for an abstention. Never in localStorage, a cookie or the URL, never sent
// anywhere: the server keeps only who has voted (me_voted), and the host and the game's creator never see the entry.
// It lives until the round stops voting: RoomScreen forgets it at the reveal, the skip, a new round and the game's end,
// and an entry of another round is dropped on reading; when the room's screen never opens in this tab again (the
// player removed, the room gone), at the latest until the tab closes (AGENTS.md, Hard Rules). Kept apart from the
// remembered nick (remembered-nick.ts), which must never hold a vote. Storage that refuses only means "Głos oddany"
// without the choice: nothing here throws to the screen, and a failure leaves a log line with its step and the error's
// name, never the nick.

export const MY_VOTE_KEY_PREFIX = "mlt-my-vote:";

// A vote as this screen remembers it: a nick, or null for an abstention.
export interface MyVote {
  target: string | null;
}

function myVoteKey(roomId: string): string {
  return `${MY_VOTE_KEY_PREFIX}${roomId}`;
}

function errorName(error: unknown): string {
  return error instanceof Error ? error.name : "unknown";
}

function isRound(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value >= 1;
}

// A nick by the part of the nick rule a browser can apply (nickLength), or null for an abstention.
function isTarget(value: unknown): value is string | null {
  if (value === null) return true;
  if (typeof value !== "string") return false;
  const length = nickLength(value);
  return length >= 1 && length <= NICK_MAX_LENGTH;
}

// The stored entry as {round, target}, or null when it is not one (edited by hand, cut short, another shape).
function parseEntry(value: string): { round: number; target: string | null } | null {
  let entry: unknown;
  try {
    entry = JSON.parse(value);
  } catch (error) {
    logEvent("warn", { op: "my_vote", step: "parse", errName: errorName(error) });
    return null;
  }
  if (typeof entry !== "object" || entry === null) return null;
  const { round, target } = entry as Record<string, unknown>;
  return isRound(round) && isTarget(target) ? { round, target } : null;
}

// Remembers the vote the database took in this round, with one write under the room's key; anything that is not a
// round's number and a nick or null is not written. A write the storage refuses leaves only "Głos oddany" after a
// reload, never an error on the screen.
export function rememberMyVote(
  storage: SessionStorage | null,
  roomId: string,
  round: number,
  target: string | null,
): void {
  if (storage === null || !isRound(round) || !isTarget(target)) return;
  try {
    storage.setItem(myVoteKey(roomId), JSON.stringify({ round, target }));
  } catch (error) {
    logEvent("warn", { op: "my_vote", step: "write", errName: errorName(error) });
  }
}

// Forgets this room's entry, whatever it holds.
export function forgetMyVote(storage: SessionStorage | null, roomId: string): void {
  if (storage === null) return;
  try {
    storage.removeItem(myVoteKey(roomId));
  } catch (error) {
    logEvent("warn", { op: "my_vote", step: "forget", errName: errorName(error) });
  }
}

// The vote remembered in this round, or null when there is none or the storage refuses. An entry of another round, or
// one that is not an entry at all, is forgotten on the way, never shown.
export function recallMyVote(storage: SessionStorage | null, roomId: string, round: number): MyVote | null {
  if (storage === null) return null;
  let value: string | null;
  try {
    value = storage.getItem(myVoteKey(roomId));
  } catch (error) {
    logEvent("warn", { op: "my_vote", step: "read", errName: errorName(error) });
    return null;
  }
  if (value === null) return null;
  const entry = parseEntry(value);
  // null (not an entry) never equals a round's number.
  if (entry?.round !== round) {
    forgetMyVote(storage, roomId);
    return null;
  }
  return { target: entry.target };
}
