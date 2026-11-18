import type { SupabaseClient } from "@supabase/supabase-js";
import { QUESTIONS } from "@/data/questions";
import {
  BELL_EVENT,
  CHAT_EVENT,
  EMOTE_EVENT,
  LEADER_BELL_EVENT,
  playersTopicFor,
  topicFor,
  type LiveSyncState,
} from "@/lib/live-sync/shared";
import { signMessage, type ChannelSigner, type SignedEnvelope } from "@/lib/live-sync/signature";
import { logEvent } from "@/lib/log";
import type { ChatContent } from "@/lib/rooms/chat";
import type { EmoteMessage } from "@/lib/rooms/emotes";

// The F-01 prototype's questions (the round draws in src/lib/rounds/draw.ts). The base stays on the server (lessons.md).
const PLAIN_QUESTIONS = Object.values(QUESTIONS).filter((entry) => !entry.adult);

// F-01 caps a delivery at 5 s; the library default of 10 s would leave the host's request hanging.
const RING_TIMEOUT_MS = 5000;

// One event on one of the room's topics through Realtime's REST endpoint. It reaches every screen on that topic, that of
// the player whose move sent it too: broadcast's `self` concerns only a client's own sends. A failure is logged under op
// with the room's id, never with the payload, and never with the topic: the players' topic holds the room's channel key
// (playersTopicFor), so the topic and the room's id come apart here. secret: what the topic holds that no log may (the
// channel key), cut out of the server's reason too. content: what a player sent (the envelope's data and sig, the nick,
// a chat's text), cut out of the server's reason as well, should the server ever repeat the payload there
// (room-chat, impl-review F6).
async function send(
  supabase: SupabaseClient,
  topic: string,
  roomId: string,
  event: string,
  payload: Record<string, unknown>,
  op: string,
  secret?: string,
  content: readonly string[] = [],
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
      code: error instanceof Error ? withoutSecret(error.message, secret, content) : undefined,
    });
    return { ok: false };
  } finally {
    await supabase.removeChannel(channel);
  }
}

// The server's reason with every copy of the secret replaced, and of every piece of content, as it is or as it stands
// inside a JSON text once or twice (a reason that repeats the payload, the envelope's data inside it); as it came
// without them. Longest first, so the envelope's data goes whole before the text and the nick inside it.
function withoutSecret(reason: string, secret: string | undefined, content: readonly string[]): string {
  let cut = secret ? reason.replaceAll(secret, "<key>") : reason;
  const forms = content
    .flatMap((piece) => {
      const once = JSON.stringify(piece).slice(1, -1);
      return [piece, once, JSON.stringify(once).slice(1, -1)];
    })
    .filter((form) => form !== "")
    .sort((a, b) => b.length - a.length);
  for (const form of forms) cut = cut.replaceAll(form, "<content>");
  return cut;
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
// room's current state (players-only-live-channel), as an envelope the Worker signed (room-chat, Faza 1;
// src/lib/live-sync/signature.ts): the room's id, the event, the emote and the nick, with the server's time and a
// random id. A screen shows only such an envelope, so a player who has the key can no longer send with another
// player's nick. Its line on a failure (emote_send, also step sign) names the room by its id and has neither the
// envelope, the emote, the nick nor the key, not even inside the server's reason.
export async function sendEmote(
  supabase: SupabaseClient,
  roomId: string,
  channelKey: string,
  signer: ChannelSigner,
  message: EmoteMessage,
): Promise<{ ok: boolean }> {
  let envelope: SignedEnvelope;
  try {
    envelope = await signMessage(signer.privateKey, {
      room: roomId,
      event: EMOTE_EVENT,
      emote: message.emote,
      nick: message.nick,
    });
  } catch (error) {
    // Nothing unsigned goes out: the emote is lost, as one whose send failed.
    logEvent("error", {
      op: "emote_send",
      step: "sign",
      roomId,
      errName: error instanceof Error ? error.name : "unknown",
    });
    return { ok: false };
  }
  return send(
    supabase,
    playersTopicFor(channelKey),
    roomId,
    EMOTE_EVENT,
    { data: envelope.data, sig: envelope.sig },
    "emote_send",
    channelKey,
    [envelope.data, envelope.sig, message.nick],
  );
}

// A player's message on the room's chat (S-23), the way an emote goes (sendEmote): on the room's players' topic of the
// channel key from the room's current state, as an envelope the Worker signed with the room's id, the event, what the
// message says (bodyChatContent, src/lib/rooms/chat.ts, already took it) and the nick: the text, normalized, or a gif
// (room-chat-gifs) with its address on KLIPY's media host as it came and its description. A screen shows only such an
// envelope, so nobody writes with another player's nick. The text, the gif's address and its description are a
// player's own content and are never written anywhere: the line on a failure (chat_send, also step sign) names the room
// by its id and has neither the envelope, the text, the address, the description, the nick nor the key, not even
// inside the server's reason.
export async function sendChat(
  supabase: SupabaseClient,
  roomId: string,
  channelKey: string,
  signer: ChannelSigner,
  message: ChatContent & { nick: string },
): Promise<{ ok: boolean }> {
  // The envelope's content: {text} as before gifs, so a screen opened before them still shows a text; or {gif, title}.
  const content: Record<string, string> =
    message.kind === "text" ? { text: message.text } : { gif: message.gif, title: message.title };
  let envelope: SignedEnvelope;
  try {
    envelope = await signMessage(signer.privateKey, {
      room: roomId,
      event: CHAT_EVENT,
      ...content,
      nick: message.nick,
    });
  } catch (error) {
    // Nothing unsigned goes out: the message is lost, as one whose send failed.
    logEvent("error", {
      op: "chat_send",
      step: "sign",
      roomId,
      errName: error instanceof Error ? error.name : "unknown",
    });
    return { ok: false };
  }
  return send(
    supabase,
    playersTopicFor(channelKey),
    roomId,
    CHAT_EVENT,
    { data: envelope.data, sig: envelope.sig },
    "chat_send",
    channelKey,
    [envelope.data, envelope.sig, message.nick, ...Object.values(content)],
  );
}

// Prototype shortcut: F-01 has no tables, so the question is derived from the bell's seq. Anyone with the publishable
// key can ring the public channel with any seq; from S-02 the board reads the current round from the database and
// takes nothing that decides content from the bell (plan.md, "Dzwonek jest niezaufaną podpowiedzią").
export function stateFor(room: string, seq: number): LiveSyncState {
  const entry = PLAIN_QUESTIONS[seq % PLAIN_QUESTIONS.length];
  return { room, seq, question: `Kto z nas najprawdopodobniej ${entry.text}?` };
}
