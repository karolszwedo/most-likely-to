// Names and validation shared by the server, the demo island and the probe. No server imports, so safe in the browser.

export const LIVE_SYNC_TOPIC_PREFIX = "live-sync:";
export const BELL_EVENT = "bell";
// A player's emote to the whole room (S-16), payload { emote, nick }. As untrusted as the bell: anyone with the
// publishable key may send it on the public channel, so the screen shows only what parseEmoteMessage
// (src/lib/rooms/emotes.ts) takes. It changes nothing in the room's state, so it never makes a screen fetch.
export const EMOTE_EVENT = "emote";
// How often a latecomer's waiting screen (JoinWaiting) asks about its request on its own, and the slowest the limiter
// gets after bells that changed nothing.
export const LOBBY_POLL_MS = 15000;
// How often an open room screen (the lobby or a game in play) fetches its state on its own while its channel looks
// alive. The bell is the fast path; the poll catches a missed bell, a dropped connection and a phone that slept. A
// socket that died quietly looks alive for 25–50 s (the realtime-js heartbeat), so this poll alone keeps a player
// within the 10 s of S-04 (PRD US-01). Cost: 20 players ≈ 150 fetches a minute, a 3 h evening ≈ 27 000, against the
// 100 000 a day of the Workers plan (context/foundation/infrastructure.md). E2E reads it to tell the bell from the poll.
export const ROOM_POLL_MS = 8000;

const ROOM_ID_PATTERN = /^[a-z0-9-]{1,64}$/;

export function isValidRoomId(room: unknown): room is string {
  return typeof room === "string" && ROOM_ID_PATTERN.test(room);
}

export function isValidSeq(seq: unknown): seq is number {
  return typeof seq === "number" && Number.isSafeInteger(seq) && seq > 0;
}

export function topicFor(room: string): string {
  return `${LIVE_SYNC_TOPIC_PREFIX}${room}`;
}

export interface LiveSyncState {
  room: string;
  seq: number;
  question: string;
}
