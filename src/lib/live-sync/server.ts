import type { SupabaseClient } from "@supabase/supabase-js";
import { QUESTIONS } from "@/data/questions";
import {
  BELL_EVENT,
  EMOTE_EVENT,
  LEADER_BELL_EVENT,
  playersTopicFor,
  topicFor,
  type LiveSyncState,
} from "@/lib/live-sync/shared";
import { logEvent } from "@/lib/log";
import type { EmoteMessage } from "@/lib/rooms/emotes";

// The F-01 prototype's questions (the round draws in src/lib/rounds/draw.ts). The base stays on the server (lessons.md).
const PLAIN_QUESTIONS = Object.values(QUESTIONS).filter((entry) => !entry.adult);

// F-01 caps a delivery at 5 s; the library default of 10 s would leave the host's request hanging.
const RING_TIMEOUT_MS = 5000;

// One event on one of the room's topics through Realtime's REST endpoint. It reaches every screen on that topic, that of
// the player whose move sent it too: broadcast's `self` concerns only a client's own sends. A failure is logged under op
// with the room's id, never with the payload, and never with the topic: the players' topic holds the room's channel key
// (playersTopicFor), so the topic and the room's id come apart here. secret: what the topic holds that no log may (the
// channel key), cut out of the server's reason too.
async function send(
  supabase: SupabaseClient,
  topic: string,
  roomId: string,
  event: string,
  payload: Record<string, unknown>,
  op: string,
  secret?: string,
): Promise<{ ok: boolean }> {
  const channel = supabase.channel(topic);
  try {
    // 202 means "accepted", not "delivered"; delivery time is measured on the receivers.
    const result = await channel.httpSend(event, payload, { timeout: RING_TIMEOUT_MS });
    return { ok: result.success };
  } catch (error) {
    // Any status other than 202, and a timeout, throw a plain Error without the status. Its message is the Realtime
    // server's reason (or the status text), so it stays as the line's code: a limit (429) and a rejected key (401) must
    // not look the same (audit L6). The reason is the server's free text and the request's path holds the topic, so a
    // secret is cut out of it first, should the server ever repeat the topic (players-only-live-channel, review F2).
    logEvent("error", {
      op,
      roomId,
      errName: error instanceof Error ? error.name : "unknown",
      code: error instanceof Error ? withoutSecret(error.message, secret) : undefined,
    });
    return { ok: false };
  } finally {
    await supabase.removeChannel(channel);
  }
}

// The server's reason with every copy of the secret replaced; as it came without one.
function withoutSecret(reason: string, secret: string | undefined): string {
  return secret ? reason.replaceAll(secret, "<key>") : reason;
}

// The bell, on the room's public topic (topicFor).
export function ringRoom(supabase: SupabaseClient, room: string, seq: number): Promise<{ ok: boolean }> {
  return send(supabase, topicFor(room), room, BELL_EVENT, { seq }, "ring");
}

// The bell only a leader's screen acts on (LEADER_BELL_EVENT), on the room's public topic too.
export function ringRoomLeaders(supabase: SupabaseClient, room: string, seq: number): Promise<{ ok: boolean }> {
  return send(supabase, topicFor(room), room, LEADER_BELL_EVENT, { seq }, "ring");
}

// A player's emote to the whole room (S-16), on the room's players' topic (playersTopicFor), of the channel key from the
// room's current state (players-only-live-channel). Its line on a failure (emote_send) names the room by its id and has
// neither the emote, the nick nor the key, not even inside the server's reason.
export function sendEmote(
  supabase: SupabaseClient,
  roomId: string,
  channelKey: string,
  message: EmoteMessage,
): Promise<{ ok: boolean }> {
  return send(
    supabase,
    playersTopicFor(channelKey),
    roomId,
    EMOTE_EVENT,
    { emote: message.emote, nick: message.nick },
    "emote_send",
    channelKey,
  );
}

// Prototype shortcut: F-01 has no tables, so the question is derived from the bell's seq. Anyone with the publishable
// key can ring the public channel with any seq; from S-02 the board reads the current round from the database and
// takes nothing that decides content from the bell (plan.md, "Dzwonek jest niezaufaną podpowiedzią").
export function stateFor(room: string, seq: number): LiveSyncState {
  const entry = PLAIN_QUESTIONS[seq % PLAIN_QUESTIONS.length];
  return { room, seq, question: `Kto z nas najprawdopodobniej ${entry.text}?` };
}
