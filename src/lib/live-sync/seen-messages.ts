// What the room's screen keeps to check the players' topic's messages beyond their signature (useRoomState): the ids it
// took, so a copy of a message never shows twice, and the offset of the server's clock, for the signature's time window
// (src/lib/live-sync/signature.ts, openSignedMessage). Pure functions, so Vitest checks them without a screen.
import { SIGNED_WINDOW_MS } from "@/lib/live-sync/signature";

// How long the screen keeps an id, by the server's time the Worker signed the message at: twice the signature's window,
// so no copy of it can pass openSignedMessage once it is gone, even after a later correction of the clock's offset.
export const SEEN_KEEP_MS = 2 * SIGNED_WINDOW_MS;

// true for an id the screen has not taken yet, which it then keeps with the message's time (at); false for a copy of
// one it took. Ids go by time, never by count (room-chat, impl-review F2): a flood of messages within the window, sent
// past the Worker's pause by whoever has the channel key, cannot push a real message's id out and then show the message
// again under its sender's nick. now is the server's time as the screen knows it; the ids come in about the order of
// their time, so the oldest ones at the front go as soon as they are past SEEN_KEEP_MS.
export function firstSeen(seen: Map<string, number>, id: string, at: number, now: number): boolean {
  for (const [keptId, keptAt] of seen) {
    if (now - keptAt <= SEEN_KEEP_MS) break;
    seen.delete(keptId);
  }
  if (seen.has(id)) return false;
  seen.set(id, at);
  return true;
}

// The offset of the server's clock to this device's (ms), from the Date header of an answer read at localNow (this
// device's clock); null for a missing or unreadable header, and the screen keeps the offset it had. Date has whole
// seconds, well inside the signature's window.
export function clockOffsetFrom(dateHeader: string | null, localNow: number): number | null {
  if (dateHeader === null) return null;
  const serverDate = Date.parse(dateHeader);
  return Number.isFinite(serverDate) ? serverDate - localNow : null;
}
