// A raw Realtime client in Node (players-only-live-channel): the room's channels as someone past the Worker reaches
// them, with the publishable key and nothing else, as tests/db/support/clients.ts makes a client for the database. The
// URL and the key come from the app's own GET /api/live-sync/config, which anyone may call; a player's channel key
// comes from that player's own room state (GET /api/rooms/<id>/lobby in the player's browser context), as their screen
// gets it. A listener keeps every emote one topic brings; a sender broadcasts on a topic as anyone with the key may,
// through Realtime's REST endpoint, as the Worker does. And a watch over a page's socket tells when the page joined a
// topic and Realtime said ok.
//
// The only module of the tests that makes its own Supabase client besides clients.ts (eslint.config.js, testsConfig):
// before each one it makes it checks the config as the suites' guards do (tests/e2e/support/env.ts,
// tests/db/support/env.ts), a local stack and a publishable key, so it never reaches production. Values never go into
// a message.

import { createClient, REALTIME_SUBSCRIBE_STATES } from "@supabase/supabase-js";
import { expect, type APIRequestContext, type BrowserContext, type Page } from "@playwright/test";

// The room's two topics and the emotes' event as the plan names them (context/changes/players-only-live-channel/plan.md,
// Desired End State; src/lib/live-sync/shared.ts makes them for the app), written out here, so a topic the app renamed
// shows up red: the public one of the room's id, with the bells, and the players' one of the room's channel key, with
// the emotes.
export function publicTopic(roomId: string): string {
  return `live-sync:${roomId}`;
}

export function playersTopic(channelKey: string): string {
  return `live-players:${channelKey}`;
}

const EMOTE_EVENT = "emote";

// The channel key as the database makes it: 16 random bytes, base64url without padding, 22 characters.
const CHANNEL_KEY = /^[A-Za-z0-9_-]{22}$/;
const LOCAL_HOSTS = ["127.0.0.1", "localhost"];
// The page's socket to Realtime, as tests/e2e/support/realtime.ts finds it.
const REALTIME_SOCKET = "/realtime/v1/websocket";

export interface LiveConfig {
  supabaseUrl: string;
  supabaseKey: string;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isLocal(url: string): boolean {
  try {
    return LOCAL_HOSTS.includes(new URL(url).hostname);
  } catch {
    // A broken address is no local one: the caller refuses it.
    return false;
  }
}

// Refuses a config unless the URL is the local stack's and the key a publishable one. source names where the config
// came from, never its values.
function refuseUnlessLocal(config: LiveConfig, source: string): void {
  if (!isLocal(config.supabaseUrl)) {
    throw new Error(`${source} does not point at the local stack (127.0.0.1 or localhost)`);
  }
  if (!config.supabaseKey.startsWith("sb_publishable_")) {
    throw new Error(`${source} gave a key that is not publishable (sb_publishable_…)`);
  }
}

// The URL and the publishable key the room's screens get, from the app's public endpoint. Refused, before any client
// exists, unless the URL is the local stack's and the key a publishable one.
export async function liveConfig(request: APIRequestContext, baseURL: string): Promise<LiveConfig> {
  const response = await request.get(`${baseURL}/api/live-sync/config`);
  expect(response.status(), "GET /api/live-sync/config").toBe(200);
  const body: unknown = await response.json();
  if (!isRecord(body) || typeof body.supabaseUrl !== "string" || typeof body.supabaseKey !== "string") {
    throw new Error("GET /api/live-sync/config gave no URL and key");
  }
  const config = { supabaseUrl: body.supabaseUrl, supabaseKey: body.supabaseKey };
  refuseUnlessLocal(config, "GET /api/live-sync/config");
  return config;
}

// The room's channel key from a player's own room state, with that player's cookie (a guest) or session (the host).
export async function channelKeyOf(context: BrowserContext, baseURL: string, roomId: string): Promise<string> {
  const response = await context.request.get(`${baseURL}/api/rooms/${roomId}/lobby`);
  expect(response.status(), "the player's room state").toBe(200);
  const body: unknown = await response.json();
  const key = isRecord(body) ? body.channel_key : undefined;
  if (typeof key !== "string" || !CHANNEL_KEY.test(key)) {
    throw new Error("the player's room state carries no channel key of 22 base64url characters");
  }
  return key;
}

// Realtime only, as the room screen's client: it never signs in. Every client gets the config through the check again,
// as in tests/db/support/clients.ts, so none can exist with a config a test built by hand.
function rawClient(config: LiveConfig) {
  refuseUnlessLocal(config, "the raw Realtime client's config");
  return createClient(config.supabaseUrl, config.supabaseKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
}

// A listener on one topic, with the emotes it brought: their payloads as they came, untrusted.
export interface Listener {
  // Every emote's payload in the order it came.
  received: unknown[];
  // Whether an emote with this id and this nick came.
  heard(emote: string, nick: string): boolean;
  // Whether the channel has stayed subscribed since it first was: a listener that dropped out meanwhile could have
  // missed an emote, so its "nothing came" would prove nothing.
  steady(): boolean;
  close(): Promise<void>;
}

function isEmote(payload: unknown, emote: string, nick: string): boolean {
  return isRecord(payload) && payload.emote === emote && payload.nick === nick;
}

// Listens to one topic's emotes, as a screen would, from the moment Realtime said the channel is subscribed.
export async function listen(config: LiveConfig, topic: string): Promise<Listener> {
  const client = rawClient(config);
  const received: unknown[] = [];
  const channel = client.channel(topic);
  let subscribed = false;
  let dropped = false;
  let closing = false;
  const ready = new Promise<void>((resolve, reject) => {
    channel
      .on("broadcast", { event: EMOTE_EVENT }, (message) => {
        const payload: unknown = message.payload;
        received.push(payload);
      })
      .subscribe((state) => {
        if (state === REALTIME_SUBSCRIBE_STATES.SUBSCRIBED) {
          subscribed = true;
          resolve();
          return;
        }
        if (subscribed && !closing) dropped = true;
        reject(new Error(`the listener's channel did not subscribe: ${state}`));
      });
  });
  try {
    await ready;
  } catch (error) {
    // A listener that never subscribed leaves no socket behind; the failure goes on to the test.
    closing = true;
    await client.removeAllChannels();
    throw error;
  }
  return {
    received,
    heard: (emote, nick) => received.some((payload) => isEmote(payload, emote, nick)),
    steady: () => !dropped,
    // Leaves the topic and closes the socket (removeAllChannels disconnects after the last channel).
    async close() {
      closing = true;
      await client.removeAllChannels();
    },
  };
}

// One emote broadcast on a topic through Realtime's REST endpoint, with the publishable key alone, as anyone who knows
// the topic may send it, past the Worker. true when Realtime accepted it (202), which says nothing about delivery.
export async function sendEmoteTo(config: LiveConfig, topic: string, emote: string, nick: string): Promise<boolean> {
  const client = rawClient(config);
  const channel = client.channel(topic);
  try {
    const result = await channel.httpSend(EMOTE_EVENT, { emote, nick });
    return result.success;
  } finally {
    await client.removeChannel(channel);
    await client.realtime.disconnect();
  }
}

// One frame of the Phoenix protocol, as realtime-js 2.116 sends it in text (serializer 2.0.0: [join_ref, ref, topic,
// event, payload]) or as an object (1.0.0). A binary frame (a broadcast) is no join and no reply, so it is null.
interface Frame {
  ref: unknown;
  topic: unknown;
  event: unknown;
  payload: unknown;
}

function readFrame(data: string | Buffer): Frame | null {
  if (typeof data !== "string") return null;
  const parsed: unknown = JSON.parse(data);
  if (Array.isArray(parsed)) {
    const [, ref, topic, event, payload] = parsed as unknown[];
    return { ref, topic, event, payload };
  }
  if (isRecord(parsed)) return { ref: parsed.ref, topic: parsed.topic, event: parsed.event, payload: parsed.payload };
  return null;
}

export interface TopicJoins {
  // Whether the page has sent phx_join for the topic on one of its sockets, and Realtime answered that very join (by
  // its ref) with status ok.
  joined(topic: string): boolean;
}

// Watches every socket the page opens to Realtime from now on. Call before the page loads, so its first socket is
// watched too.
export function watchJoins(page: Page): TopicJoins {
  // `<socket>|<ref>` of every phx_join sent, with its topic, and `<socket>|<ref>|<topic>` of every reply ok.
  const joins = new Map<string, string>();
  const answered = new Set<string>();
  let sockets = 0;
  page.on("websocket", (socket) => {
    if (!socket.url().includes(REALTIME_SOCKET)) return;
    sockets += 1;
    const id = String(sockets);
    socket.on("framesent", ({ payload }) => {
      const frame = readFrame(payload);
      if (frame?.event !== "phx_join" || typeof frame.ref !== "string" || typeof frame.topic !== "string") return;
      joins.set(`${id}|${frame.ref}`, frame.topic);
    });
    socket.on("framereceived", ({ payload }) => {
      const frame = readFrame(payload);
      if (frame?.event !== "phx_reply" || typeof frame.ref !== "string" || typeof frame.topic !== "string") return;
      if (isRecord(frame.payload) && frame.payload.status === "ok") answered.add(`${id}|${frame.ref}|${frame.topic}`);
    });
  });
  return {
    joined(topic) {
      // realtime-js puts "realtime:" before every topic it joins.
      const wire = `realtime:${topic}`;
      return [...joins].some(([join, joinTopic]) => joinTopic === wire && answered.has(`${join}|${wire}`));
    },
  };
}

// Every text a screen reader hears from the page's live regions from now on, the emotes' "<nick>: <name>" among them
// (src/components/room/EmoteBubbles.tsx), so a step can tell afterwards whether an emote ever showed, also one that has
// left the screen since. Installed on the page as it is, with no reload.
export async function watchLiveRegions(page: Page): Promise<() => Promise<string[]>> {
  await page.evaluate(() => {
    const heard = new Set<string>();
    const record = () => {
      for (const region of document.querySelectorAll("[aria-live]")) {
        const text = region.textContent.trim();
        if (text !== "") heard.add(text);
      }
    };
    record();
    new MutationObserver(record).observe(document.body, { subtree: true, childList: true, characterData: true });
    Object.assign(window, { mltHeardLive: heard });
  });
  return () =>
    page.evaluate(() => {
      const heard = (window as unknown as { mltHeardLive?: Set<string> }).mltHeardLive;
      return heard ? [...heard] : [];
    });
}
