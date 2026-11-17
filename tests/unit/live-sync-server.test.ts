import { Buffer } from "node:buffer";
import { format } from "node:util";
import type { SupabaseClient } from "@supabase/supabase-js";
import { afterEach, beforeEach, describe, expect, it, vi, type MockInstance } from "vitest";
import { ringRoom, ringRoomLeaders, sendEmote } from "@/lib/live-sync/server";
import { playersTopicFor, topicFor } from "@/lib/live-sync/shared";
import { openSignedMessage, type ChannelSigner, type SignedEnvelope } from "@/lib/live-sync/signature";

// The room's two topics and the Worker's sender (players-only-live-channel,
// context/changes/players-only-live-channel/plan.md, Faza 2 #1 and #6). The bells stay on the room's public topic, made
// of its id; the emotes go on the players' topic, made of the room's channel key, which only the room's players get.
// The key never reaches a log line: a failed send names the room by its id. The topics are written out by hand from the
// plan's Desired End State, never from the module's prefixes. Since room-chat (Faza 1) an emote goes out only as an
// envelope the Worker signed (context/changes/room-chat/plan.md, Desired End State), and the line of a failed send has
// neither the envelope nor anything inside it.

const ROOM_ID = "3f2b8c1e-7a4d-4e9b-9c2a-5d6e7f8a9b0c";
// The room's channel key as the column's default makes it: 22 base64url characters.
const CHANNEL_KEY = "Pk7sW2nQ9xLb4VmT8rYc-a";
const PLAYERS_TOPIC = "live-players:Pk7sW2nQ9xLb4VmT8rYc-a";
const PUBLIC_TOPIC = "live-sync:3f2b8c1e-7a4d-4e9b-9c2a-5d6e7f8a9b0c";

interface Sent {
  topic: string;
  event: string;
  payload: unknown;
}

// A client that has only what the sender uses: channel(topic) with httpSend, and removeChannel. Every send is kept with
// its channel's topic; failure: the error httpSend throws, as realtime-js does for any status but 202 (its message is
// the Realtime server's reason).
function stubClient(failure?: Error): { client: SupabaseClient; sent: Sent[]; removed: string[] } {
  const sent: Sent[] = [];
  const removed: string[] = [];
  const client = {
    channel: (topic: string) => ({
      topic,
      httpSend: (event: string, payload: unknown) => {
        sent.push({ topic, event, payload });
        return failure ? Promise.reject(failure) : Promise.resolve({ success: true });
      },
    }),
    removeChannel: (channel: { topic: string }) => {
      removed.push(channel.topic);
      return Promise.resolve("ok");
    },
  };
  return { client: client as unknown as SupabaseClient, sent, removed };
}

let consoleError: MockInstance<typeof console.error>;

beforeEach(() => {
  consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);
});

afterEach(() => {
  consoleError.mockRestore();
});

function logged(): string {
  return consoleError.mock.calls.map((call) => format(...(call as unknown[]))).join("\n");
}

// A key pair made for the test, so no key material sits in the repo: the Worker's signer (the private key and the
// public one, raw in base64url) and the screen's key to check with.
async function testKeys(): Promise<{ signer: ChannelSigner; verifyKey: CryptoKey }> {
  const pair = await crypto.subtle.generateKey({ name: "ECDSA", namedCurve: "P-256" }, false, ["sign", "verify"]);
  const publicKey = Buffer.from(await crypto.subtle.exportKey("raw", pair.publicKey)).toString("base64url");
  return { signer: { privateKey: pair.privateKey, publicKey }, verifyKey: pair.publicKey };
}

// The one payload sent, which must be exactly an envelope { data, sig } of two texts.
function envelopeOf(sent: Sent | undefined): SignedEnvelope {
  const payload = sent?.payload;
  if (
    typeof payload !== "object" ||
    payload === null ||
    Object.keys(payload).sort().join() !== "data,sig" ||
    !("data" in payload && "sig" in payload) ||
    typeof payload.data !== "string" ||
    typeof payload.sig !== "string"
  ) {
    throw new Error("the sent payload is no envelope { data, sig }");
  }
  return { data: payload.data, sig: payload.sig };
}

describe("playersTopicFor", () => {
  it("makes the players' topic of the room's channel key", () => {
    expect(playersTopicFor(CHANNEL_KEY)).toBe(PLAYERS_TOPIC);
  });

  it("is another topic than the room's public one, which is made of the room's id", () => {
    expect(topicFor(ROOM_ID)).toBe(PUBLIC_TOPIC);
    expect(playersTopicFor(CHANNEL_KEY)).not.toBe(topicFor(ROOM_ID));
  });
});

describe("sendEmote", () => {
  // room-chat, Faza 1 #3 and #7: the emote goes out only as an envelope { data, sig } the Worker signed, which the
  // room's public key opens to this room's id, the event "emote", the emote and the nick (PRD: nobody writes with
  // another player's nick). Opened with the signature module the screens use, under a key made for the test.
  it("sends a signed envelope on the players' topic of the key, and nothing on the room's public topic", async () => {
    const { client, sent, removed } = stubClient();
    const { signer, verifyKey } = await testKeys();

    expect(await sendEmote(client, ROOM_ID, CHANNEL_KEY, signer, { emote: "heart", nick: "Ola" })).toEqual({
      ok: true,
    });
    expect(sent.map(({ topic, event }) => ({ topic, event }))).toEqual([{ topic: PLAYERS_TOPIC, event: "emote" }]);
    const envelope = envelopeOf(sent[0]);
    const fields = await openSignedMessage(verifyKey, envelope, { room: ROOM_ID, event: "emote", now: Date.now() });
    expect(fields && { room: fields.room, event: fields.event, emote: fields.emote, nick: fields.nick }).toEqual({
      room: ROOM_ID,
      event: "emote",
      emote: "heart",
      nick: "Ola",
    });
    expect(removed).toEqual([PLAYERS_TOPIC]);
    expect(consoleError).not.toHaveBeenCalled();
  });

  it("sends nothing unsigned: a key that cannot sign loses the emote with one line under the room's id", async () => {
    const { client, sent } = stubClient();
    const { signer } = await testKeys();
    // A public key in the private key's place: crypto.subtle.sign refuses it.
    const broken = { privateKey: (await testKeys()).verifyKey, publicKey: signer.publicKey };

    expect(await sendEmote(client, ROOM_ID, CHANNEL_KEY, broken, { emote: "heart", nick: "Ola" })).toEqual({
      ok: false,
    });
    expect(sent).toEqual([]);
    expect(consoleError).toHaveBeenCalledTimes(1);
    expect(consoleError.mock.calls[0]).toContainEqual({
      op: "emote_send",
      step: "sign",
      roomId: ROOM_ID,
      errName: "InvalidAccessError",
    });
    expect(logged()).not.toContain("Ola");
  });

  it("logs a failed send once, under the room's id, with the server's reason", async () => {
    const { client, removed } = stubClient(new Error("Too Many Requests"));
    const { signer } = await testKeys();

    expect(await sendEmote(client, ROOM_ID, CHANNEL_KEY, signer, { emote: "skull", nick: "Kuba" })).toEqual({
      ok: false,
    });
    expect(consoleError).toHaveBeenCalledTimes(1);
    expect(consoleError.mock.calls[0]).toContainEqual({
      op: "emote_send",
      roomId: ROOM_ID,
      errName: "Error",
      code: "Too Many Requests",
    });
    // The channel goes away after a failure too.
    expect(removed).toEqual([PLAYERS_TOPIC]);
  });

  it("keeps the channel key, the topic, the emote, the nick and the envelope out of the failure's line", async () => {
    const { client, sent } = stubClient(new Error("Too Many Requests"));
    const { signer } = await testKeys();

    await sendEmote(client, ROOM_ID, CHANNEL_KEY, signer, { emote: "skull", nick: "Kuba" });

    const envelope = envelopeOf(sent[0]);
    const line = logged();
    expect(line).toContain(ROOM_ID);
    expect(line).not.toContain(CHANNEL_KEY);
    expect(line).not.toContain("live-players");
    expect(line).not.toContain("skull");
    expect(line).not.toContain("Kuba");
    expect(line).not.toContain(envelope.sig);
    expect(line).not.toContain(envelope.data);
    expect(line).not.toContain(signer.publicKey);
  });

  // Review F2 (context/changes/players-only-live-channel/reviews/impl-review.md): the reason is the Realtime server's
  // free text, and the request's path holds the players' topic.
  it("cuts the channel key out of a server's reason that repeats the topic", async () => {
    const { client } = stubClient(
      new Error("Unauthorized: no access to live-players:Pk7sW2nQ9xLb4VmT8rYc-a (Pk7sW2nQ9xLb4VmT8rYc-a)"),
    );
    const { signer } = await testKeys();

    expect(await sendEmote(client, ROOM_ID, CHANNEL_KEY, signer, { emote: "skull", nick: "Kuba" })).toEqual({
      ok: false,
    });
    expect(consoleError.mock.calls[0]).toContainEqual({
      op: "emote_send",
      roomId: ROOM_ID,
      errName: "Error",
      code: "Unauthorized: no access to live-players:<key> (<key>)",
    });
    expect(logged()).not.toContain(CHANNEL_KEY);
  });
});

// The bells stay where they were (decision 2 of the plan): on the room's public topic, which the latecomer's waiting
// screen and every room screen listen to.
describe("ringRoom and ringRoomLeaders", () => {
  it.each([
    { why: "the bell", ring: ringRoom, event: "bell" },
    { why: "the leaders' bell", ring: ringRoomLeaders, event: "leader-bell" },
  ])("ring $why on the room's public topic, with its seq", async ({ ring, event }) => {
    const { client, sent } = stubClient();

    expect(await ring(client, ROOM_ID, 7)).toEqual({ ok: true });
    expect(sent).toEqual([{ topic: PUBLIC_TOPIC, event, payload: { seq: 7 } }]);
  });

  it("logs a failed bell under the room's id", async () => {
    const { client } = stubClient(new Error("Unauthorized"));

    expect(await ringRoom(client, ROOM_ID, 7)).toEqual({ ok: false });
    expect(consoleError.mock.calls[0]).toContainEqual({
      op: "ring",
      roomId: ROOM_ID,
      errName: "Error",
      code: "Unauthorized",
    });
  });
});
