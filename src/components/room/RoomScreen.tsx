import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { PartyPopper, Plus, ShieldCheck, ShieldMinus, SkipForward } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { buttonVariants } from "@/components/ui/button";
import EmoteBar, { type EmoteBarPreview } from "@/components/room/EmoteBar";
import EmoteBubbles, { type ShownEmote } from "@/components/room/EmoteBubbles";
import GameSummary from "@/components/room/GameSummary";
import type { HostActionsPreview } from "@/components/room/HostActions";
import JoinRequests from "@/components/room/JoinRequests";
import { LiveBanner } from "@/components/room/LiveBanner";
import type { QuestionListActions } from "@/components/room/QuestionList";
import type { QuestionReactionPreview, Reaction } from "@/components/room/QuestionReaction";
import RoomLobby, { type LobbyPreview } from "@/components/room/RoomLobby";
import { RoomErrorBoundary } from "@/components/room/RoomErrorBoundary";
import { endInHalves, roomColumn } from "@/components/room/room-frame";
import { sendRoomAction, type ActionOutcome, type RoomAction } from "@/components/room/room-actions";
import RoundReveal from "@/components/room/RoundReveal";
import RoundSkipped from "@/components/room/RoundSkipped";
import RoundVoting, { type VotingPreview } from "@/components/room/RoundVoting";
import { useRoomState, type LiveConfig, type LivePreview } from "@/components/room/useRoomState";
import { announcement, announcementKey, roleAnnouncement, skipNotice } from "@/lib/rooms/announce";
import type { ResultView } from "@/lib/rooms/chart";
import { EMOTE_MAX_SHOWN, EMOTE_SHOW_MS, parseEmoteMessage, type EmoteMessage } from "@/lib/rooms/emotes";
import {
  browserNickStorage,
  browserSessionStorage,
  colorAskedIn,
  markColorAsked,
  readRememberedColor,
  rememberColor,
  rememberedColorRequest,
  rememberNick,
} from "@/lib/rooms/remembered-nick";
import type { RoomView } from "@/lib/rooms/shared";
import { cn } from "@/lib/utils";

// Starting state for the dev previews (/dev/room-states with several screens on one page, /dev/room-window with one);
// the real page never sets it. With a preview the screen makes no network call at all: no fetch, no channel, no
// report, and its actions only answer "ok" (a vote shows "Głos oddany", a thumb is pressed at once; a leader's actions
// and the host's co-host switch stay busy, as they do until the new state arrives).
export interface ScreenPreview extends LivePreview, LobbyPreview, VotingPreview {
  idPrefix: string;
  // The reveal as if the player had picked this view with the toggle.
  resultView?: ResultView;
  // A leader's buttons of the voting, the reveal or the skipped last question.
  host?: HostActionsPreview;
  // The notice of the co-host role (S-07) as if it had just changed to the view's leader: given (leader true) or taken.
  roleNotice?: boolean;
  // The thumbs of the reveal: one given, a tap on its way or refused.
  reaction?: QuestionReactionPreview;
  // The screen throws once it is in the browser, to show RoomErrorBoundary's screen.
  crash?: boolean;
  // The emotes' bar and bubbles: the bar resting or refused, bubbles on the screen (they stay; only a channel's emote
  // goes away after EMOTE_SHOW_MS).
  emotes?: EmotesPreview;
  // The screen fills the window as on /r/… (/dev/room-window): the emotes' bar and bubbles stand where they do there.
  // Without it (/dev/room-states, several screens on one page) both stay inside the screen's frame.
  window?: boolean;
}

export interface EmotesPreview extends EmoteBarPreview {
  shown?: EmoteMessage[];
}

interface Props {
  roomId: string;
  initial: RoomView;
  // Only the host gets the link to share, and only in the lobby.
  linkUrl?: string | null;
  realtime?: LiveConfig | null;
  preview?: ScreenPreview;
}

// /dev/room-states: throws after the first render in the browser, so the server's render of the page still works
// (an error boundary catches nothing on the server).
function PreviewCrash() {
  useEffect(() => {
    throw new Error("Preview crash");
  }, []);
  return null;
}

// "Koniec wieczoru" for everyone once the room is closed: "Zakończ grę", "Nowa gra" or the sweep of abandoned games
// (decision D4 of context/archive/2026-10-15-full-game-evening/research.md), the same screen whichever way it closed.
// Under the thanks the summary of the game (S-15, PRD FR-022: GameSummary) when it had a revealed question; a game with
// none ends as before, with no summary. With the summary's chart, from lg two halves (endInHalves): the title, the
// counts, the nicks with none and the next step on the left, the chart on the right; below lg, and without a chart,
// one column in the order of the DOM. The title stays first, so the focus after "Zakończ grę" goes to it.
function EveningEnd({ view, idPrefix, titleAs: Title }: { view: RoomView; idPrefix: string; titleAs: "h1" | "h2" }) {
  const halves = endInHalves(view);
  return (
    <section
      className={cn(
        "flex flex-col items-center gap-4 py-12 text-center",
        halves && "lg:grid lg:grid-cols-2 lg:items-start lg:gap-x-10 lg:gap-y-5 lg:py-0 lg:text-left",
      )}
    >
      <div className={cn("flex flex-col items-center gap-4", halves && "lg:col-start-1 lg:items-start")}>
        <PartyPopper aria-hidden="true" className="text-muted-foreground size-10" />
        <Title className={cn("text-2xl font-semibold text-balance", halves && "lg:text-4xl")}>Koniec wieczoru</Title>
        <p className="text-lg">Dzięki za grę!</p>
      </div>
      {view.summary !== null && <GameSummary view={view} summary={view.summary} idPrefix={idPrefix} halves={halves} />}
      <div className={cn(halves && "lg:col-start-1")}>
        {view.role === "host" ? (
          <a href="/" className={buttonVariants()}>
            <Plus />
            Nowa gra
          </a>
        ) : (
          <p className="text-muted-foreground">Chcesz zagrać jeszcze raz? Poproś hosta o nowy link.</p>
        )}
      </div>
    </section>
  );
}

// A leader's (the host's or a co-host's) moves that replace the whole view; after them the focus goes to the new view's
// heading. A leader's answer to a latecomer ("Wpuść", "Odrzuć"), the host's co-host switch, the host's moves on the
// game's question list in the lobby ("Przejrzyj pytania", "Dolosuj pytanie", "Usuń", "Popraw", "Dodaj"; QuestionList
// moves the focus itself) and a player's thumb on the reveal keep the view, so they keep the focus too.
const VIEW_CHANGING: readonly RoomAction[] = ["start", "reveal", "next", "skip", "end"];

// The room's screen for its host or a player: the lobby, the round's voting, its reveal, a skipped last question or
// the end of the evening, chosen by the room's status and the round's phase. A leader (the host or a co-host, S-07;
// view.leader) gets the moves of the game and, while a game is in play, the latecomers waiting to be let in (S-08)
// above the view; the host alone keeps the link, the game's question list, the co-host switch and "Nowa gra".
// useRoomState keeps the state live; the actions go to the game's endpoints and then look again at once, without
// waiting for the bell.
function RoomContent({ roomId, initial, linkUrl, realtime, preview }: Props) {
  // The players' emotes on this screen (S-16): only an emote of the list from a player on this screen's own list of
  // players (parseEmoteMessage; the channel is public), each for EMOTE_SHOW_MS, the oldest dropped past EMOTE_MAX_SHOWN.
  // A preview's bubbles stay.
  const [emotes, setEmotes] = useState<ShownEmote[]>(() =>
    (preview?.emotes?.shown ?? []).map((message, index) => ({ ...message, key: index })),
  );
  const emoteKey = useRef(emotes.length);
  const emoteTimers = useRef(new Set<number>());
  const nicksRef = useRef<ReadonlySet<string>>(new Set(initial.players.map((player) => player.nick)));
  const onEmote = useCallback((payload: unknown) => {
    const message = parseEmoteMessage(payload, nicksRef.current);
    if (!message) return;
    const key = emoteKey.current;
    emoteKey.current += 1;
    setEmotes((shown) => [...shown, { ...message, key }].slice(-EMOTE_MAX_SHOWN));
    const timer = window.setTimeout(() => {
      emoteTimers.current.delete(timer);
      setEmotes((shown) => shown.filter((emote) => emote.key !== key));
    }, EMOTE_SHOW_MS);
    emoteTimers.current.add(timer);
  }, []);
  useEffect(() => {
    const timers = emoteTimers.current;
    return () => {
      for (const timer of timers) window.clearTimeout(timer);
    };
  }, []);
  const { view, refreshFailed, liveBroken, refresh, refreshes } = useRoomState({
    roomId,
    initial,
    realtime,
    preview,
    onEmote,
  });
  useEffect(() => {
    nicksRef.current = new Set(view.players.map((player) => player.nick));
  }, [view.players]);
  const isPreview = Boolean(preview);
  const inFrame = isPreview && !preview?.window;
  const idPrefix = preview ? `${preview.idPrefix}-` : "";
  // The states page has its own h1, so there the screen's title is an h2 (as titleAs in SignInCard.astro).
  const titleAs = isPreview ? "h2" : "h1";
  const key = announcementKey(view);
  // Adjusting state while rendering (react.dev, "You Might Not Need an Effect"): a new question, phase or status sets
  // the announcement (src/lib/rooms/announce.ts); never on the first render.
  const [shownKey, setShownKey] = useState(key);
  const [announced, setAnnounced] = useState("");
  // "Koło" or "Paski" as this player picked it; null until they do. Here and not in RoundReveal, so the pick survives
  // the next round while the page lives. Never sent anywhere or stored.
  const [resultView, setResultView] = useState<ResultView | null>(preview?.resultView ?? null);
  if (key !== shownKey) {
    setShownKey(key);
    setAnnounced(announcement(view));
  }
  // The co-host role given or taken by the host between two refreshes (S-07; roleAnnouncement), apart from the key: said
  // in a live region of its own and shown above the view until the view moves on (another question, phase or status) or
  // the role changes again. Never on the first render, but a preview may start with it (roleNotice).
  const [shownLeader, setShownLeader] = useState(view.leader);
  const [roleNews, setRoleNews] = useState<{ text: string; key: string } | null>(() =>
    preview?.roleNotice ? { text: roleAnnouncement(!initial.leader, initial), key } : null,
  );
  if (view.leader !== shownLeader) {
    setShownLeader(view.leader);
    const text = roleAnnouncement(shownLeader, view);
    setRoleNews(text === "" ? null : { text, key });
  }
  const roleNotice = roleNews !== null && roleNews.key === key ? roleNews.text : "";
  const contentRef = useRef<HTMLDivElement>(null);
  // The view the host's move started from, until another view replaces it: the pressed button goes away with its view,
  // so the focus goes to the new heading instead of the page's start. Other players' focus is never moved.
  const movedFrom = useRef<string | null>(null);
  useEffect(() => {
    if (movedFrom.current === null || movedFrom.current === key) return;
    movedFrom.current = null;
    const heading = contentRef.current?.querySelector<HTMLElement>("h1, h2");
    if (!heading) return;
    heading.tabIndex = -1;
    heading.classList.add("outline-none");
    heading.focus();
  }, [key]);
  // The nick the database took for this player (the host, a guest or a latecomer let in) becomes this browser's
  // remembered nick for the next join form and "Nowa gra" (S-14): only the nick, never a vote. Never from a preview.
  useEffect(() => {
    if (isPreview) return;
    rememberNick(browserNickStorage(), view.me);
  }, [isPreview, view.me]);

  const act = useCallback(
    async (action: RoomAction, body: unknown): Promise<ActionOutcome> => {
      if (isPreview) return { ok: true };
      if (VIEW_CHANGING.includes(action)) movedFrom.current = key;
      const outcome = await sendRoomAction(roomId, action, body);
      // Only a refused move of the leader's own drops its focus target: a thumb refused while "Następne pytanie" is on
      // its way (round_over) must not.
      if (!outcome.ok && VIEW_CHANGING.includes(action)) movedFrom.current = null;
      // Accepted or refused, the room's state may have moved on (a refused vote: already cast, already revealed).
      refresh();
      return outcome;
    },
    [isPreview, roomId, refresh, key],
  );
  const start = useCallback(() => act("start", {}), [act]);
  const vote = useCallback((target: string | null, round: number) => act("vote", { target, round }), [act]);
  const reveal = useCallback((round: number) => act("reveal", { round }), [act]);
  const react = useCallback((reaction: Reaction, round: number) => act("react", { reaction, round }), [act]);
  const next = useCallback((round: number) => act("next", { round }), [act]);
  const skip = useCallback((round: number) => act("skip", { round }), [act]);
  const end = useCallback(() => act("end", {}), [act]);
  const admit = useCallback((nick: string) => act("admit", { nick }), [act]);
  const reject = useCallback((nick: string) => act("reject", { nick }), [act]);
  // The host's switch by a guest's nick: true gives the co-host role, false takes it back.
  const setCohost = useCallback((nick: string, cohost: boolean) => act("cohost", { nick, cohost }), [act]);
  // The player's own colour from the palette on the list "Gracze" (S-18). Accepted, it becomes this browser's
  // remembered colour for the next game; a colour the game gave on the way in never does. Never from a preview.
  const setColor = useCallback(
    async (color: number) => {
      const outcome = await act("color", { color });
      if (outcome.ok && !isPreview) rememberColor(browserNickStorage(), color);
      return outcome;
    },
    [act, isPreview],
  );
  // The remembered colour (S-18, decision 5), asked for at most once per room: on the first state with the player on
  // the list, unless this tab has already asked in this room (sessionStorage; without it, once per page load), so a
  // reload in the middle of a game never changes the player's colour behind their back. Noted as asked first, then
  // sent only when rememberedColorRequest finds it free; a refusal (color_taken a moment before) passes in silence,
  // with no message and nothing remembered. Never from a preview.
  const colorAsked = useRef(false);
  useEffect(() => {
    if (isPreview || colorAsked.current || !view.players.some((player) => player.nick === view.me)) return;
    colorAsked.current = true;
    const session = browserSessionStorage();
    if (colorAskedIn(session, roomId)) return;
    markColorAsked(session, roomId);
    const color = rememberedColorRequest(view, readRememberedColor(browserNickStorage()));
    if (color !== null) void act("color", { color });
  }, [isPreview, view, roomId, act]);
  // The game's question list carries the entry's position, the handle that never changes, and the host's text.
  const questionActions = useMemo<QuestionListActions>(
    () => ({
      onOpen: () => act("question-list", {}),
      onDraw: () => act("question-draw", {}),
      onRemove: (position) => act("question-remove", { position }),
      onEdit: (position, text) => act("question-edit", { position, text }),
      onAdd: (text) => act("question-add", { text }),
    }),
    [act],
  );

  let content;
  if (view.status === "closed") {
    content = <EveningEnd view={view} idPrefix={idPrefix} titleAs={titleAs} />;
  } else if (view.round === null) {
    content = (
      <RoomLobby
        view={view}
        idPrefix={idPrefix}
        titleAs={titleAs}
        linkUrl={linkUrl}
        refreshFailed={refreshFailed}
        onStart={start}
        questionActions={questionActions}
        onCohost={setCohost}
        onColor={setColor}
        refreshes={refreshes}
        preview={preview}
      />
    );
  } else if (view.round.phase === "skipped") {
    content = (
      <RoundSkipped
        // Each round starts with fresh buttons.
        key={view.round.number}
        view={view}
        round={view.round}
        titleAs={titleAs}
        refreshFailed={refreshFailed}
        onNext={next}
        onEnd={end}
        hostPreview={preview?.host}
      />
    );
  } else if (view.round.phase === "voting") {
    content = (
      <RoundVoting
        // A new round starts with a fresh choice.
        key={view.round.number}
        view={view}
        round={view.round}
        idPrefix={idPrefix}
        titleAs={titleAs}
        refreshFailed={refreshFailed}
        onVote={vote}
        onReveal={reveal}
        onSkip={skip}
        onEnd={end}
        onCohost={setCohost}
        onColor={setColor}
        refreshes={refreshes}
        preview={preview}
        hostPreview={preview?.host}
      />
    );
  } else {
    content = (
      <RoundReveal
        key={view.round.number}
        view={view}
        round={view.round}
        idPrefix={idPrefix}
        titleAs={titleAs}
        refreshFailed={refreshFailed}
        chosenView={resultView}
        onChooseView={setResultView}
        onNext={next}
        onEnd={end}
        onReact={react}
        hostPreview={preview?.host}
        reactionPreview={preview?.reaction}
      />
    );
  }

  // The state's column in the page's frame (src/components/room/room-frame.ts), so the banner, the notice of the role, a
  // leader's list of requests, the note after a skip and the emotes' bar are as wide as the view under them.
  return (
    <div className={cn("flex flex-col gap-6", roomColumn(view), inFrame && "relative")}>
      <p aria-live="polite" className="sr-only">
        {announced}
      </p>
      {/* On the page from the start, so a screen reader hears the role's change (a live region added together with its
          text is often not read). */}
      <p aria-live="polite" className="sr-only">
        {roleNotice}
      </p>
      {view.status !== "closed" && <LiveBanner broken={liveBroken} />}
      {roleNotice && (
        // Not a live region: the one above says it. The same words, for the eye, until the view moves on.
        <Alert role="note">
          {view.leader ? <ShieldCheck /> : <ShieldMinus />}
          <AlertTitle>{roleNotice}</AlertTitle>
        </Alert>
      )}
      {view.leader && view.status === "playing" && (
        // Outside contentRef: answering a request is not a move that takes the focus to the view's heading.
        <JoinRequests requests={view.requests} onAdmit={admit} onReject={reject} refreshes={refreshes} />
      )}
      {skipNotice(view) && (
        // Not a live region: the announcement above already says the skip with the new question.
        <Alert role="note">
          <SkipForward />
          <AlertTitle>Prowadzący pominął poprzednie pytanie.</AlertTitle>
          <AlertDescription>Głosy z niego przepadły.</AlertDescription>
        </Alert>
      )}
      {preview?.crash && <PreviewCrash />}
      <div ref={contentRef} className="contents">
        {content}
      </div>
      {/* Outside contentRef, with no heading: an emote is not a move that takes the focus to the view's heading. */}
      <EmoteBar roomId={roomId} idPrefix={idPrefix} inFrame={inFrame} preview={preview?.emotes} />
      <EmoteBubbles shown={emotes} players={view.players} inFrame={inFrame} still={isPreview} />
    </div>
  );
}

export default function RoomScreen(props: Props) {
  return (
    <RoomErrorBoundary roomId={props.roomId} titleAs={props.preview ? "h2" : "h1"} isPreview={Boolean(props.preview)}>
      <RoomContent {...props} />
    </RoomErrorBoundary>
  );
}
