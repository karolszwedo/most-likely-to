import { useCallback, useEffect, useRef, useState } from "react";
import { createClient, REALTIME_SUBSCRIBE_STATES, type RealtimeChannel } from "@supabase/supabase-js";
// Types only: the validator itself runs on the server (POST /api/client-events).
import type { ClientEvent, ClientState } from "@/lib/client-events";
import { createFetchLimiter, type FetchLimiter } from "@/lib/live-sync/limiter";
import {
  BELL_EVENT,
  EMOTE_EVENT,
  LEADER_BELL_EVENT,
  playersTopicFor,
  ROOM_POLL_MS,
  topicFor,
} from "@/lib/live-sync/shared";
import { logEvent } from "@/lib/log";
import { parseRoomView, type RoomView } from "@/lib/rooms/shared";

// The room's live state for its screen, in the lobby and with a game in play: one place for the channels, the polling
// and their failures (audit L1–L4 in context/audits/observability/2026-10-11_guest-join-live-lobby.md). The database
// (room_lobby through GET /api/rooms/<id>/lobby) is the only source of truth; a bell on the room's public channel only
// says "check", and so does every (re)subscription, because bells sent while the connection was down are lost. The
// leaders' bell (LEADER_BELL_EVENT) says the same, only to a leader's screen. Every fetch goes through the limiter
// (src/lib/live-sync/limiter.ts) and the parser (parseRoomView). The players' emotes (S-16), which change no state, come
// on the room's players' channel instead, of the channel key from the latest state (players-only-live-channel), on the
// same connection. A closed room never opens again, so its screen stops fetching; it keeps hearing the emotes.

// The URL and the publishable key, only for the room's Realtime channels (AGENTS.md). Without them (CI without Realtime,
// a key that is not publishable) the screen only polls, and hears no emote.
export interface LiveConfig {
  supabaseUrl: string;
  supabaseKey: string;
}

// /dev/room-states: the flags to start with, and no network at all (no fetch, no channel, no report).
export interface LivePreview {
  refreshFailed?: boolean;
  liveBroken?: boolean;
}

export interface RoomLive {
  view: RoomView;
  // The last fetch failed: the screen shows the state it had, with a quiet note.
  refreshFailed: boolean;
  // The channel is down (CHANNEL_ERROR, TIMED_OUT, CLOSED): the screen says so and polls more often.
  liveBroken: boolean;
  // Look again through the limiter, e.g. right after the player's own action, without waiting for the bell.
  refresh: () => void;
  // How many fetches have brought the room's state so far, changed or not (0 before the first): a part of the screen
  // waiting for the state after its own action (a row of JoinRequests) learns from it that one came, also when nothing
  // in the state changed and the view stayed the same.
  refreshes: number;
}

// While the channel is down, in place of ROOM_POLL_MS.
export const BROKEN_POLL_MS = 5000;
// Decision D4 (context/archive/2026-10-13-first-live-round/research.md): report only from a visible tab, only a channel
// down for more than 5 s of that, and at most 3 reports of each event per page load, so a locked phone makes no noise.
const REPORT_AFTER_MS = 5000;
const MAX_REPORTS_PER_EVENT = 3;
// A CLOSED channel is gone for good: a new one, after 1 s, then 2, 4… up to 30 s while it keeps closing.
const RESUBSCRIBE_MS = 1000;
const MAX_RESUBSCRIBE_MS = 30_000;
// A 404 reloads the page once per entry: the page runs the same room_lobby check and says "Nie jesteś w tym pokoju",
// or "Usunięto cię z pokoju" to a player a leader removed (S-09). Only a flag for this tab, never anything about the
// game.
const RELOAD_KEY_PREFIX = "mlt-room-reloaded:";

// Module scope: one count per page load, also if the island mounts again.
const reportsSent = new Map<ClientEvent["event"], number>();

function errorName(error: unknown): string {
  return error instanceof Error ? error.name : "unknown";
}

function isVisible(): boolean {
  return document.visibilityState === "visible";
}

// A screen's report to the owner's logs (POST /api/client-events): only the contract's keys, an event and a state
// from its lists and the room's id; never a nick, a vote's target or any text. A report that does not arrive leaves a
// line in this browser's console, through the same list of fields as the Worker's lines. Also RoomErrorBoundary's
// island_crash, under the same limits.
export function reportClientEvent(report: ClientEvent, keepalive = false): void {
  if (!isVisible()) return;
  const sent = reportsSent.get(report.event) ?? 0;
  if (sent >= MAX_REPORTS_PER_EVENT) return;
  reportsSent.set(report.event, sent + 1);

  const body: ClientEvent = { event: report.event };
  if (report.state) body.state = report.state;
  if (report.roomId) body.roomId = report.roomId;
  void fetch("/api/client-events", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    cache: "no-store",
    // A report sent just before a reload still goes out.
    keepalive,
  }).then(
    (res) => {
      if (!res.ok) logEvent("warn", { op: "client_event", event: report.event, status: res.status });
    },
    (error: unknown) => {
      logEvent("warn", { op: "client_event", event: report.event, errName: errorName(error) });
    },
  );
}

// True when this entry may still reload, and records that it did. Storage that refuses counts as "already reloaded":
// without the flag a reload could loop, so the screen stays and says the refresh failed.
function claimReload(roomId: string): boolean {
  try {
    const key = `${RELOAD_KEY_PREFIX}${roomId}`;
    if (window.sessionStorage.getItem(key) !== null) return false;
    window.sessionStorage.setItem(key, "1");
    return true;
  } catch (error) {
    logEvent("warn", { op: "room_reload", roomId, step: "claim", errName: errorName(error) });
    return false;
  }
}

function releaseReload(roomId: string): void {
  try {
    window.sessionStorage.removeItem(`${RELOAD_KEY_PREFIX}${roomId}`);
  } catch (error) {
    logEvent("warn", { op: "room_reload", roomId, step: "release", errName: errorName(error) });
  }
}

function channelState(state: REALTIME_SUBSCRIBE_STATES): ClientState {
  if (state === REALTIME_SUBSCRIBE_STATES.TIMED_OUT) return "TIMED_OUT";
  if (state === REALTIME_SUBSCRIBE_STATES.CLOSED) return "CLOSED";
  return "CHANNEL_ERROR";
}

// Realtime only: this client never signs in, the host's session lives in server-side cookies.
function realtimeClient(supabaseUrl: string, supabaseKey: string) {
  return createClient(supabaseUrl, supabaseKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
}

type LiveClient = ReturnType<typeof realtimeClient>;

// The page's one Realtime client, kept in the hook's ref and shared by the bells' channel and the emotes' channel, so
// the page has one socket, as a phone has one connection (a test that puts a screen's connection to sleep follows the
// page's last socket: tests/e2e/support/realtime.ts). Made by the first effect that asks for it, so never on the server
// and never in a preview; the URL and the key come with the page and do not change while it lives. null without them.
function sharedClient(
  ref: { current: LiveClient | null },
  supabaseUrl: string | undefined,
  supabaseKey: string | undefined,
): LiveClient | null {
  if (!supabaseUrl || !supabaseKey) return null;
  ref.current ??= realtimeClient(supabaseUrl, supabaseKey);
  return ref.current;
}

export function useRoomState({
  roomId,
  initial,
  realtime,
  preview,
  onEmote,
}: {
  roomId: string;
  initial: RoomView;
  realtime?: LiveConfig | null;
  preview?: LivePreview;
  // A player's emote from the room's players' channel (EMOTE_EVENT), its payload as it came: untrusted, the screen checks
  // it (parseEmoteMessage). It never calls the limiter: an emote changes nothing in the room's state.
  onEmote?: (payload: unknown) => void;
}): RoomLive {
  const [view, setView] = useState(initial);
  const [refreshFailed, setRefreshFailed] = useState(preview?.refreshFailed ?? false);
  const [liveBroken, setLiveBroken] = useState(preview?.liveBroken ?? false);
  const [refreshes, setRefreshes] = useState(0);
  const limiterRef = useRef<FetchLimiter | null>(null);
  // The page's one Realtime client (sharedClient), for both of the room's channels.
  const clientRef = useRef<LiveClient | null>(null);
  // The latest onEmote, so a new one from a render never subscribes the channel again.
  const onEmoteRef = useRef(onEmote);
  useEffect(() => {
    onEmoteRef.current = onEmote;
  }, [onEmote]);
  // Whether this screen leads the game now, for the channel's handler: a role given or taken back mid-game never
  // subscribes the channel again.
  const leaderRef = useRef(initial.leader);
  useEffect(() => {
    leaderRef.current = view.leader;
  }, [view.leader]);
  // The state the previous fetch found, as JSON: room_lobby has no version, so "changed" means "different JSON".
  const shownRef = useRef(JSON.stringify(initial));
  const isPreview = Boolean(preview);
  const isLive = view.status !== "closed";
  const supabaseUrl = realtime?.supabaseUrl;
  const supabaseKey = realtime?.supabaseKey;

  useEffect(() => {
    if (isPreview || !isLive) return;
    let active = true;
    let released = false;
    let pollTimer: number | undefined;
    let reportTimer: number | undefined;
    let resubscribeTimer: number | undefined;
    let resubscribes = 0;
    // The channel's last state other than SUBSCRIBED; null while it is subscribed (or not heard from yet).
    let broken: ClientState | null = null;
    // This stretch of a broken channel was reported already.
    let reported = false;

    function failed(state: ClientState | undefined, error?: unknown) {
      if (!active) return;
      setRefreshFailed(true);
      logEvent("warn", {
        op: "room_refresh",
        roomId,
        state,
        errName: error === undefined ? undefined : errorName(error),
      });
      reportClientEvent({ event: "refresh_failed", state, roomId });
    }

    function notFound() {
      if (!active) return;
      reportClientEvent({ event: "refresh_failed", state: "http_4xx", roomId }, true);
      if (claimReload(roomId)) {
        window.location.reload();
        return;
      }
      setRefreshFailed(true);
    }

    // One fetch for the limiter: true when the state differs from the one the previous fetch found.
    async function fetchState(signal: AbortSignal): Promise<boolean> {
      let res: Response;
      try {
        res = await fetch(`/api/rooms/${roomId}/lobby`, { cache: "no-store", signal });
      } catch (error) {
        failed("network", error);
        return false;
      }
      if (res.status === 404) {
        notFound();
        return false;
      }
      if (!res.ok) {
        failed(res.status >= 500 ? "http_5xx" : "http_4xx");
        return false;
      }
      let body: unknown;
      try {
        body = await res.json();
      } catch (error) {
        // Given up by the limiter while reading, or not JSON (an error page of the edge).
        failed(signal.aborted ? "network" : undefined, error);
        return false;
      }
      if (!active || signal.aborted) return false;

      const parsed = parseRoomView(body);
      if (!parsed.ok) {
        // The field's name only, never its value: it may hold a nick (audit L4).
        logEvent("warn", { op: "room_refresh", roomId, step: "shape", field: parsed.field });
        setRefreshFailed(true);
        reportClientEvent({ event: "refresh_failed", roomId });
        return false;
      }
      if (!released) {
        released = true;
        releaseReload(roomId);
      }
      setRefreshFailed(false);
      setRefreshes((count) => count + 1);
      const json = JSON.stringify(parsed.value);
      if (json === shownRef.current) return false;
      shownRef.current = json;
      setView(parsed.value);
      return true;
    }

    const limiter = createFetchLimiter({
      fetchState,
      onError: (error) => {
        logEvent("error", { op: "room_refresh", roomId, step: "limiter", errName: errorName(error) });
      },
    });
    limiterRef.current = limiter;

    // The screen polls on its own, only while the tab is visible: every ROOM_POLL_MS, every BROKEN_POLL_MS while the
    // channel is down.
    function schedulePoll() {
      window.clearTimeout(pollTimer);
      pollTimer = window.setTimeout(
        () => {
          if (isVisible()) limiter.refresh();
          schedulePoll();
        },
        broken === null ? ROOM_POLL_MS : BROKEN_POLL_MS,
      );
    }

    // Reported after more than REPORT_AFTER_MS of a visible tab with the channel down; once per broken stretch.
    function armReport() {
      if (broken === null || reported || reportTimer !== undefined || !isVisible()) return;
      reportTimer = window.setTimeout(() => {
        reportTimer = undefined;
        if (!active || broken === null || reported || !isVisible()) return;
        reported = true;
        reportClientEvent({ event: "realtime_status", state: broken, roomId });
      }, REPORT_AFTER_MS);
    }

    function disarmReport() {
      window.clearTimeout(reportTimer);
      reportTimer = undefined;
    }

    function onVisibility() {
      if (isVisible()) {
        limiter.refresh();
        armReport();
      } else {
        disarmReport();
      }
    }

    // The network is back, or the page came back from the back-forward cache: bells sent meanwhile are lost and the
    // socket may still look alive, so the screen looks at once instead of waiting for the poll (S-04).
    function onOnline() {
      limiter.refresh();
    }

    function onPageShow(event: PageTransitionEvent) {
      if (event.persisted) limiter.refresh();
    }

    // The bells' channel, on the room's public topic: its state is the screen's measure of the connection (liveBroken,
    // the reports, the poll's pace). The emotes' channel below shares its client and never touches any of these.
    const supabase = sharedClient(clientRef, supabaseUrl, supabaseKey);
    let channel: RealtimeChannel | null = null;

    function subscribe() {
      if (!supabase) return;
      const current = supabase.channel(topicFor(roomId));
      channel = current;
      current
        .on("broadcast", { event: BELL_EVENT }, () => {
          limiter.bell();
        })
        .on("broadcast", { event: LEADER_BELL_EVENT }, () => {
          if (leaderRef.current) limiter.bell();
        })
        .subscribe((state) => {
          if (!active || channel !== current) return;
          if (state === REALTIME_SUBSCRIBE_STATES.SUBSCRIBED) {
            const wasBroken = broken !== null;
            broken = null;
            reported = false;
            resubscribes = 0;
            disarmReport();
            setLiveBroken(false);
            if (wasBroken) schedulePoll();
            limiter.refresh();
            return;
          }
          // CHANNEL_ERROR and TIMED_OUT: realtime-js joins again by itself. CLOSED: the channel removed itself from the
          // client, so the screen makes a new one.
          const wasSubscribed = broken === null;
          broken = channelState(state);
          setLiveBroken(true);
          if (wasSubscribed) schedulePoll();
          armReport();
          if (state === REALTIME_SUBSCRIBE_STATES.CLOSED) {
            window.clearTimeout(resubscribeTimer);
            resubscribeTimer = window.setTimeout(
              () => {
                if (active) subscribe();
              },
              Math.min(RESUBSCRIBE_MS * 2 ** resubscribes, MAX_RESUBSCRIBE_MS),
            );
            resubscribes += 1;
          }
        });
    }

    schedulePoll();
    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("online", onOnline);
    window.addEventListener("pageshow", onPageShow);
    subscribe();

    return () => {
      active = false;
      limiter.stop();
      limiterRef.current = null;
      window.clearTimeout(pollTimer);
      window.clearTimeout(reportTimer);
      window.clearTimeout(resubscribeTimer);
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("online", onOnline);
      window.removeEventListener("pageshow", onPageShow);
      if (supabase && channel) {
        supabase.removeChannel(channel).catch((error: unknown) => {
          logEvent("warn", { op: "room_channel", roomId, step: "remove", errName: errorName(error) });
        });
      }
    };
  }, [isPreview, isLive, roomId, supabaseUrl, supabaseKey]);

  // The players' emotes (S-16) on the room's players' channel (playersTopicFor), of the channel key from the latest state
  // (players-only-live-channel): one effect for the lobby, a game in play and the end of the evening, on the page's one
  // client. A new key (a leader removed a player, and the bell brought the state with the new key) takes the screen off
  // the old topic and onto the new one; an emote sent in between is lost, as an emote may be. The effect follows the
  // room and the key only, never the room's status: realtime-js 2.116 hands back a channel still leaving when its topic
  // is asked for again, and that channel's subscribe() does nothing and never calls back (RealtimeClient.ts:462-474,
  // RealtimeChannel.ts:426-429), so running again at "Zakończ grę" would quietly end the emotes on the end of the
  // evening. The connection's health is the bells' channel's to measure: nothing here touches liveBroken, the reports,
  // the limiter or the poll, so a fetch comes only from the bells' channel and the poll. A CLOSED channel removed itself
  // from the client, so a new one follows after the same delay as the bells'; on CHANNEL_ERROR and TIMED_OUT realtime-js
  // joins again by itself. Nothing is shown when this channel breaks: an emote that does not arrive is lost, and the
  // screen waits for nothing else on it. Its log lines name the room by its id, never by the key.
  const channelKey = view.channel_key;
  useEffect(() => {
    if (isPreview) return;
    const supabase = sharedClient(clientRef, supabaseUrl, supabaseKey);
    if (!supabase) return;
    let active = true;
    let channel: RealtimeChannel | null = null;
    let resubscribeTimer: number | undefined;
    let resubscribes = 0;

    function subscribe(client: LiveClient) {
      const current = client.channel(playersTopicFor(channelKey));
      channel = current;
      current
        .on("broadcast", { event: EMOTE_EVENT }, (message) => {
          if (active) onEmoteRef.current?.(message.payload);
        })
        .subscribe((state) => {
          if (!active || channel !== current) return;
          if (state === REALTIME_SUBSCRIBE_STATES.SUBSCRIBED) {
            resubscribes = 0;
            return;
          }
          if (state !== REALTIME_SUBSCRIBE_STATES.CLOSED) return;
          window.clearTimeout(resubscribeTimer);
          resubscribeTimer = window.setTimeout(
            () => {
              if (active) subscribe(client);
            },
            Math.min(RESUBSCRIBE_MS * 2 ** resubscribes, MAX_RESUBSCRIBE_MS),
          );
          resubscribes += 1;
        });
    }

    subscribe(supabase);

    return () => {
      active = false;
      window.clearTimeout(resubscribeTimer);
      if (channel) {
        supabase.removeChannel(channel).catch((error: unknown) => {
          logEvent("warn", { op: "room_channel", roomId, step: "remove", errName: errorName(error) });
        });
      }
    };
  }, [isPreview, roomId, supabaseUrl, supabaseKey, channelKey]);

  const refresh = useCallback(() => {
    limiterRef.current?.refresh();
  }, []);

  return { view, refreshFailed, liveBroken, refresh, refreshes };
}
