import { useEffect, useState } from "react";
import { DoorClosed, Hourglass } from "lucide-react";
import { createClient, REALTIME_SUBSCRIBE_STATES, type RealtimeChannel } from "@supabase/supabase-js";
import { ROOM_NARROW } from "@/components/room/room-frame";
import { reportClientEvent, type LiveConfig } from "@/components/room/useRoomState";
// Types only: the validator itself runs on the server (POST /api/client-events).
import type { ClientState } from "@/lib/client-events";
import { createFetchLimiter } from "@/lib/live-sync/limiter";
import { BELL_EVENT, LOBBY_POLL_MS, topicFor } from "@/lib/live-sync/shared";
import { logEvent } from "@/lib/log";
import { parseJoinRequestState } from "@/lib/rooms/shared";
import { cn } from "@/lib/utils";

// The latecomer's screen on /j/<code> while the request waits for a leader, the host or a co-host (S-08, S-07): the
// nick asked with, and nothing of the game, never the question (lessons.md). The same screen waits for a request to
// come back to one's own place (S-04), in the lobby too, with its own words. It looks again at its own request (GET
// /api/rooms/<id>/request) on a bell on the room's channel and every LOBBY_POLL_MS while the tab is visible, through
// the room screen's limiter (src/lib/live-sync/limiter.ts), and then: let in, to the room; turned away or no request
// any more, the link's page
// again, which shows the form; the room closed, or deleted by its host since (S-13), "Gra się skończyła." and nothing
// more to wait for. Its own small effect on purpose: the room screen's useRoomState stays as it runs in production.

// /dev/room-states: the state to show, and no network at all (no fetch, no channel, no report).
export interface WaitingPreview {
  refreshFailed?: boolean;
  closed?: boolean;
}

interface Props {
  roomId: string;
  // The code from /j/<code>, to load that page again once the request is turned away.
  linkToken: string;
  nick: string;
  // A request to come back to one's own place (S-04), not to join under a new nick: its own words.
  returning?: boolean;
  // The URL and the publishable key, only for the room's Realtime channel (AGENTS.md); null means polling only.
  realtime?: LiveConfig | null;
  preview?: WaitingPreview;
}

// As in useRoomState: a CLOSED channel is gone for good, so a new one after 1 s, then 2, 4… up to 30 s.
const RESUBSCRIBE_MS = 1000;
const MAX_RESUBSCRIBE_MS = 30_000;

function errorName(error: unknown): string {
  return error instanceof Error ? error.name : "unknown";
}

function isVisible(): boolean {
  return document.visibilityState === "visible";
}

export default function JoinWaiting({ roomId, linkToken, nick, returning = false, realtime, preview }: Props) {
  const [closed, setClosed] = useState(preview?.closed ?? false);
  const [refreshFailed, setRefreshFailed] = useState(preview?.refreshFailed ?? false);
  const isPreview = Boolean(preview);
  // The states page has its own h1, so there the title is an h2.
  const Title = isPreview ? "h2" : "h1";
  const supabaseUrl = realtime?.supabaseUrl;
  const supabaseKey = realtime?.supabaseKey;

  useEffect(() => {
    if (isPreview || closed) return;
    // false once the screen stops waiting (stop): no fetch, poll or bell after that.
    let active = true;
    let pollTimer: number | undefined;
    let resubscribeTimer: number | undefined;
    let resubscribes = 0;

    function failed(state: ClientState | undefined, error?: unknown) {
      if (!active) return;
      setRefreshFailed(true);
      logEvent("warn", {
        op: "request_refresh",
        roomId,
        state,
        errName: error === undefined ? undefined : errorName(error),
      });
      reportClientEvent({ event: "refresh_failed", state, roomId });
    }

    // One fetch for the limiter: true when the request is no longer waiting.
    async function fetchState(signal: AbortSignal): Promise<boolean> {
      let res: Response;
      try {
        res = await fetch(`/api/rooms/${roomId}/request`, { cache: "no-store", signal });
      } catch (error) {
        failed("network", error);
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

      const parsed = parseJoinRequestState(body);
      if (!parsed.ok) {
        // The field's name only, never its value: it may hold a nick.
        logEvent("warn", { op: "request_refresh", roomId, step: "shape", field: parsed.field });
        setRefreshFailed(true);
        reportClientEvent({ event: "refresh_failed", roomId });
        return false;
      }
      setRefreshFailed(false);
      const { state } = parsed.value;
      if (state === "pending") return false;

      // Nothing more to wait for: the poll, the limiter and the channel stop here.
      stop();
      if (state === "closed") {
        setClosed(true);
      } else if (state === "gone") {
        // The room is gone (S-13): its host deleted the game, which can be done only once it is over, so the same
        // screen as a closed room. Not the link's page: its code opens nothing any more.
        setClosed(true);
      } else {
        // Let in: the room. Turned away, or no request any more (moved never comes here: a waiting request's token
        // never had a place): the link's page, which shows the form again.
        window.location.assign(state === "admitted" ? `/r/${roomId}` : `/j/${linkToken}`);
      }
      return true;
    }

    // Known limit, accepted for now: a request still waiting is "no new state" to the limiter, so every bell of a busy
    // round (each vote rings) doubles the bells' gap, and the host's "Wpuść" may reach this screen up to LOBBY_POLL_MS
    // late. That brake is what bounds a stranger ringing the public channel.
    const limiter = createFetchLimiter({
      fetchState,
      onError: (error) => {
        logEvent("error", { op: "request_refresh", roomId, step: "limiter", errName: errorName(error) });
      },
    });

    // Its own poll, only while the tab is visible: the limiter fetches only when asked.
    function schedulePoll() {
      window.clearTimeout(pollTimer);
      pollTimer = window.setTimeout(() => {
        if (!active) return;
        if (isVisible()) limiter.refresh();
        schedulePoll();
      }, LOBBY_POLL_MS);
    }

    function onVisibility() {
      if (active && isVisible()) limiter.refresh();
    }

    // Realtime only: this client never signs in.
    const supabase =
      supabaseUrl && supabaseKey
        ? createClient(supabaseUrl, supabaseKey, {
            auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
          })
        : null;
    let channel: RealtimeChannel | null = null;

    // The room's channel, as the room screen listens to it: a bell only says "check". Every (re)subscription looks
    // again, because bells sent while the connection was down are lost. Without a channel the poll still runs.
    function subscribe() {
      if (!supabase) return;
      const current = supabase.channel(topicFor(roomId));
      channel = current;
      current
        .on("broadcast", { event: BELL_EVENT }, () => {
          if (active) limiter.bell();
        })
        .subscribe((state) => {
          if (!active || channel !== current) return;
          if (state === REALTIME_SUBSCRIBE_STATES.SUBSCRIBED) {
            resubscribes = 0;
            limiter.refresh();
            return;
          }
          // CHANNEL_ERROR and TIMED_OUT: realtime-js joins again by itself. CLOSED: a new channel.
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

    // Once the request is answered or the room closed, and when the island unmounts; a second call does nothing more.
    function stop() {
      active = false;
      limiter.stop();
      window.clearTimeout(pollTimer);
      window.clearTimeout(resubscribeTimer);
      document.removeEventListener("visibilitychange", onVisibility);
      const current = channel;
      channel = null;
      if (supabase && current) {
        supabase.removeChannel(current).catch((error: unknown) => {
          logEvent("warn", { op: "request_channel", roomId, step: "remove", errName: errorName(error) });
        });
      }
    }

    schedulePoll();
    document.addEventListener("visibilitychange", onVisibility);
    subscribe();

    return stop;
  }, [isPreview, closed, roomId, linkToken, supabaseUrl, supabaseKey]);

  if (closed) {
    return (
      <section className={cn("flex flex-col items-center gap-4 py-12 text-center", ROOM_NARROW)}>
        <DoorClosed aria-hidden="true" className="text-muted-foreground size-10" />
        <Title className="text-2xl font-semibold text-balance">Gra się skończyła.</Title>
        <p className="text-muted-foreground">Skończyła się, zanim prowadzący cię wpuścił. Poproś hosta o nowy link.</p>
      </section>
    );
  }

  return (
    <section className={cn("flex flex-col items-center gap-4 py-12 text-center", ROOM_NARROW)}>
      <Hourglass aria-hidden="true" className="text-muted-foreground size-10" />
      <Title className="text-2xl font-semibold text-balance">
        {returning ? "Czekasz, aż prowadzący potwierdzi, że to ty" : "Czekasz, aż prowadzący cię wpuści"}
      </Title>
      <p>
        {returning ? "Prosisz o powrót jako " : "Prosisz o wejście jako "}
        <span className="font-semibold break-all">{nick}</span>.
      </p>
      <p className="text-muted-foreground">
        {returning
          ? "Gdy prowadzący cię wpuści, wrócisz na swoje miejsce: z kolorem, wynikami i oddanym głosem."
          : "Gdy prowadzący cię wpuści, ta strona sama przejdzie do gry."}
      </p>
      <p aria-live="polite" className="text-muted-foreground text-xs">
        {refreshFailed ? "Nie udało się odświeżyć stanu gry" : ""}
      </p>
    </section>
  );
}
