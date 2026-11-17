// Names and validation shared by the server, the demo island and the probe. No server imports, so safe in the browser.

// A room has two topics on the same connection (players-only-live-channel). The public one (topicFor) is made of the
// room's id, which anyone who saw the room's address knows: it carries only the bells, which say "check" and nothing
// else. The players' one (playersTopicFor) is made of the room's channel key (klucz kanału, rooms.channel_key), which
// room_lobby gives to the room's players alone and remove_player replaces: it carries the emotes and the chat.
export const LIVE_SYNC_TOPIC_PREFIX = "live-sync:";
export const PLAYERS_TOPIC_PREFIX = "live-players:";
// On the public topic: anyone with the room's id may ring it.
export const BELL_EVENT = "bell";
// The bell of a move only a leader's screen has to show at once: a proposal sent or answered (S-10). It goes to the
// whole channel, as untrusted as the bell, and only a leader's screen rings its limiter with it. To any other screen
// such a move changes nothing, or only its author's counts, so its fetch would find the same state, the limiter would
// take that for a spammer's bell, and the next real bell would come late (impl-review of S-10, F1). The counts wait for
// the author's own poll.
export const LEADER_BELL_EVENT = "leader-bell";
// A player's emote to the whole room (S-16), on the players' topic only: whoever sends it there knows the channel key,
// so is a player of the room (players-only-live-channel), and someone with no more than the room's id reaches no screen
// with it. Its payload is an envelope the Worker signed (room-chat, Faza 1; src/lib/live-sync/signature.ts) with the
// room's id, this event, the emote and the nick room_lobby gave the Worker. The screen opens it with the page's public
// key and drops anything else, so a player with the key can no longer send with another player's nick past the Worker;
// of what the Worker signed it shows only what parseEmoteMessage (src/lib/rooms/emotes.ts) takes. It changes nothing in
// the room's state, so it never makes a screen fetch.
export const EMOTE_EVENT = "emote";
// A player's message on the room's chat (S-23), on the players' topic only, as the emote: content a player wrote, so
// it goes only as an envelope the Worker signed (src/lib/live-sync/signature.ts) with the room's id, this event, the
// text and the nick room_lobby gave the Worker, and a screen shows only what it opened with the page's public key and
// parseChatMessage (src/lib/rooms/chat.ts) takes. Nothing of it is written anywhere: not the database, a log line or
// the browser's storage; a screen keeps it in its tab's memory only. It changes nothing in the room's state, so it
// never makes a screen fetch.
export const CHAT_EVENT = "chat";
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

// The room's public topic, of its id: the bells.
export function topicFor(room: string): string {
  return `${LIVE_SYNC_TOPIC_PREFIX}${room}`;
}

// The room's players' topic, of its channel key: the emotes and the chat. The key never goes into the game's addresses
// or logs: a log line names the room by its id, never by this topic.
export function playersTopicFor(channelKey: string): string {
  return `${PLAYERS_TOPIC_PREFIX}${channelKey}`;
}

export interface LiveSyncState {
  room: string;
  seq: number;
  question: string;
}
