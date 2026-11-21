import React, { useEffect, useRef, useState } from "react";
import { CircleCheck, Eye, Hourglass, Send, SkipForward } from "lucide-react";
import { ServerError } from "@/components/auth/ServerError";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { FieldError, FieldLegend, FieldSet } from "@/components/ui/field";
import { Spinner } from "@/components/ui/spinner";
import { SLICE_DOTS } from "@/components/room/chart-colors";
import {
  COHOST_ROW,
  CohostBadge,
  CohostButton,
  PLAYER_ROW,
  type RoleSwitchPreview,
} from "@/components/room/CohostButton";
import { endGameAction, HostActions, type HostActionsPreview } from "@/components/room/HostActions";
import {
  ColorDotButton,
  ColorPalette,
  type ColorPickerPreview,
  useColorPicker,
} from "@/components/room/PlayerColorPicker";
import { BUSY_BUTTON } from "@/components/room/QuestionField";
import { mayRemove, RemovePlayerButton, type RemovalPreview } from "@/components/room/RemovePlayerButton";
import type { ActionOutcome } from "@/components/room/room-actions";
import { RoundCounter } from "@/components/room/RoundCounter";
import { RoundQuestion } from "@/components/room/RoundQuestion";
import { CHOICE_TILE, TILE, TILE_LIST } from "@/components/room/surfaces";
import { useHydrated } from "@/components/room/useHydrated";
import { useT } from "@/lib/i18n/react";
import { playerColors } from "@/lib/rooms/chart";
import { forgetMyVote, recallMyVote, rememberMyVote, type MyVote } from "@/lib/rooms/my-vote";
import { browserSessionStorage } from "@/lib/rooms/remembered-nick";
import type { LobbyPlayer, RoomView, RoundView } from "@/lib/rooms/shared";
import { cn } from "@/lib/utils";

type VotingRoundView = Extract<RoundView, { phase: "voting" }>;

// /dev/room-states only: the starting state of this round's screen; the real page never sets it.
export interface VotingPreview {
  // Chosen, not sent yet: a nick, or null for "Wstrzymuję się".
  choice?: string | null;
  // "Zagłosuj" pressed with nothing chosen.
  missingChoice?: boolean;
  myVote?: MyVote;
  voting?: boolean;
  voteError?: string | null;
  // The host's co-host switch of one guest's row, on its way or refused (S-07).
  roleSwitch?: RoleSwitchPreview;
  // The player's own colour's palette (S-18).
  colorPicker?: ColorPickerPreview;
  // A leader's "Usuń" by a guest's nick (S-09).
  removal?: RemovalPreview;
}

interface Props {
  // The room whose entry of this tab's own vote the screen remembers and reads back (my-vote.ts, S-04).
  roomId: string;
  view: RoomView;
  round: VotingRoundView;
  // Unique ids when /dev/room-states renders several screens on one page; "" on the real page.
  idPrefix: string;
  titleAs: "h1" | "h2";
  refreshFailed: boolean;
  // The round's number goes with the vote, the reveal and the skip, so none of them lands in a question this screen
  // has not shown (round_over).
  onVote: (target: string | null, round: number) => Promise<ActionOutcome>;
  onReveal: (round: number) => Promise<ActionOutcome>;
  onSkip: (round: number) => Promise<ActionOutcome>;
  onEnd: () => Promise<ActionOutcome>;
  // The host gives a guest the co-host role or takes it back (CohostButton), sent as the other moves.
  onCohost: (nick: string, cohost: boolean) => Promise<ActionOutcome>;
  // The player picks their own colour (useColorPicker), sent as the other moves.
  onColor: (color: number) => Promise<ActionOutcome>;
  // A leader removes a guest (RemovePlayerButton), sent as the other moves.
  onRemove: (nick: string) => Promise<ActionOutcome>;
  // How many refreshed states the screen has had (useRoomState), for CohostButton and RemovePlayerButton.
  refreshes: number;
  preview?: VotingPreview;
  hostPreview?: HostActionsPreview;
}

// The radio button's value for an abstention; a player's radio carries the player's place in the list, so no nick can
// clash with it. The choice itself is kept as the nick.
const ABSTAIN = "abstain";

// An option of the vote, laid out as a player's row: a tile that shows the choice and the keyboard focus of its radio
// (the radio itself has no outline of its own). The radio is the light Blurple (primary-text): the chosen tile is
// bg-accent, on which the button's primary measures 2.72:1, under WCAG's 3:1 (scripts/contrast.mjs, primary-text on
// accent). RADIO and CHOICE_LABEL are exported for the states' matrix (/dev/ui-kitchen-sink).
const CHOICE_ROW = `${PLAYER_ROW} ${CHOICE_TILE}`;
export const RADIO = "accent-primary-text size-4 shrink-0 outline-none";
export const CHOICE_LABEL = "min-w-0 flex-1 cursor-pointer py-2.5 wrap-anywhere";

// cohost: the badge "współhost" next to a co-host's nick (S-07), false where the host's switch stands in its place.
function PlayerBadges({
  player,
  cohost,
  isMe,
  hasVoted,
}: {
  player: LobbyPlayer;
  cohost: boolean;
  isMe: boolean;
  hasVoted: boolean;
}) {
  const t = useT();
  return (
    <>
      {player.host && <Badge variant="secondary">{t.round.badges.host}</Badge>}
      {cohost && <CohostBadge />}
      {isMe && <Badge variant="outline">{t.round.badges.me}</Badge>}
      {hasVoted && (
        <Badge variant="outline" className="text-muted-foreground">
          <CircleCheck />
          {t.round.badges.voted}
        </Badge>
      )}
    </>
  );
}

// "Kto z nas najprawdopodobniej …?": one person from the list (oneself too) or "Wstrzymuję się", then "Zagłosuj". A
// vote is final (decision D2), so the screen says so before and after. Everyone sees who has voted, never for whom;
// a leader (the host or a co-host, S-07) can reveal the result at any time (decision D3), skip the question while it is
// voting (its votes are gone, the next question opens at once) and end the game (decisions D2 and D4 of
// context/archive/2026-10-15-full-game-evening/research.md); skipping and ending ask first. After their own vote the
// host has the co-host switch by each guest's nick in the list of players. Only the round's eligible players (the
// players when it opened, round.eligible) are counted in "Zagłosowało X z Y" and offered in the list: a latecomer a
// leader let in since then (S-08) sees the question with a note instead of the form, stands among the players marked
// "od następnego pytania", and votes from the next question on. The own vote stays on the screen after a reload in the
// same tab (S-04, decision D1): only this tab's sessionStorage knows it (my-vote.ts), the server says only "Głos oddany".
// Above the question, in every state of the round, "Pytanie N z T" (RoundCounter, game-length).
export default function RoundVoting({
  roomId,
  view,
  round,
  idPrefix,
  titleAs,
  refreshFailed,
  onVote,
  onReveal,
  onSkip,
  onEnd,
  onCohost,
  onColor,
  onRemove,
  refreshes,
  preview,
  hostPreview,
}: Props) {
  const t = useT();
  // undefined: nothing chosen yet.
  const [choice, setChoice] = useState<string | null | undefined>(preview?.choice);
  const [missingChoice, setMissingChoice] = useState(preview?.missingChoice ?? false);
  const [myVote, setMyVote] = useState<MyVote | null>(preview?.myVote ?? null);
  const [voting, setVoting] = useState(preview?.voting ?? false);
  const [voteError, setVoteError] = useState<string | null>(preview?.voteError ?? null);
  // false in the page from the server until the island runs (B-1): "Zagłosuj" waits for handleSubmit.
  const hydrated = useHydrated();
  // A preview never touches the browser's storage.
  const isPreview = preview !== undefined;
  const isHost = view.role === "host";
  // The host, or a guest with the co-host role (S-07): the leader's buttons.
  const leads = view.leader;
  // After a reload in another tab or browser only the database knows: "Głos oddany", without the choice.
  const hasVoted = myVote !== null || round.me_voted;
  // Whether this round's screen is still on the page. A vote's answer that comes after the view moved on (the bell
  // brought the reveal first) remembers nothing: RoomScreen has already forgotten this round's entry.
  const mounted = useRef(false);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  // After a reload in the same tab: the choice this tab remembered in this round, once the database says the player has
  // voted. Read after mounting, not in useState, so the first render matches the server's HTML (as useNickField reads
  // the remembered nick). Without the database's word, or with another round's entry, the entry is forgotten, never
  // shown. A choice the vote's answer already set stays.
  useEffect(() => {
    if (isPreview) return;
    const session = browserSessionStorage("my_vote");
    if (!round.me_voted) {
      forgetMyVote(session, roomId);
      return;
    }
    const remembered = recallMyVote(session, roomId, round.number);
    // eslint-disable-next-line react-hooks/set-state-in-effect -- one read of the tab's storage after hydration, which the server's render cannot see
    if (remembered !== null) setMyVote((current) => current ?? remembered);
  }, [isPreview, roomId, round.me_voted, round.number]);
  const voted = new Set(round.voted);
  const eligible = new Set(round.eligible);
  // false for a latecomer let in while this question was voting.
  const canVote = eligible.has(view.me);
  // Whom the form offers: the eligible players, in seat order (the players' order).
  const candidates = view.players.filter((player) => eligible.has(player.nick));
  const colors = playerColors(view.players);
  const choiceErrorId = `${idPrefix}vote-choice-error`;
  const cohostHintId = `${idPrefix}cohost-hint`;
  const picker = useColorPicker({
    meNick: view.me,
    players: view.players,
    idPrefix,
    onColor,
    refreshes,
    preview: preview?.colorPicker,
  });

  async function vote(target: string | null) {
    setVoting(true);
    setVoteError(null);
    const outcome = await onVote(target, round.number);
    setVoting(false);
    if (outcome.ok) {
      // Remembered in this tab until the round stops voting, so a reload still shows it (S-04, decision D1).
      if (!isPreview && mounted.current) rememberMyVote(browserSessionStorage("my_vote"), roomId, round.number, target);
      // Confirmed on screen at once, from the answer (PRD NFR), before the new state arrives.
      setMyVote({ target });
      return;
    }
    setVoteError(outcome.message);
  }

  function handleSubmit(e: React.SubmitEvent<HTMLFormElement>) {
    e.preventDefault();
    if (choice === undefined) {
      setMissingChoice(true);
      e.currentTarget.querySelector<HTMLInputElement>('input[type="radio"]')?.focus();
      return;
    }
    if (voting) return;
    void vote(choice);
  }

  function choose(next: string | null) {
    setChoice(next);
    setMissingChoice(false);
  }

  function describedBy(...ids: (string | false)[]): string | undefined {
    const list = ids.filter((id): id is string => id !== false);
    return list.length > 0 ? list.join(" ") : undefined;
  }

  // Who has voted so far out of those who may, and the quiet note when the state could not be refreshed.
  const status = (
    <div className="text-muted-foreground flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1 text-xs">
      <p>{t.round.voting.votedCount(round.voted.length, round.eligible.length)}</p>
      <p aria-live="polite">{refreshFailed ? t.round.refreshFailed : ""}</p>
    </div>
  );

  // Every player, a latecomer too: one let in during this question has a grey "od następnego pytania" and never the
  // vote's badge. Each with the dot of the player's stored colour (playerColors), as in the lobby and the reveal; the
  // form's list has none.
  const players = (
    <section aria-labelledby={`${idPrefix}players-heading`} className="flex flex-col gap-3">
      <h2 id={`${idPrefix}players-heading`} className="text-sm font-medium">
        {t.round.voting.playersHeading(view.players.length)}
      </h2>
      <ul className={TILE_LIST}>
        {view.players.map((player) => {
          const mayVote = eligible.has(player.nick);
          const color = colors.get(player.nick);
          // The host's switch on every guest's row, never on the host's own; the host sees this list only after their
          // own vote.
          const switchShown = isHost && !player.host;
          const isMe = player.nick === view.me;
          return (
            <li
              key={player.nick}
              className={cn(
                TILE,
                PLAYER_ROW,
                leads ? COHOST_ROW : "justify-between py-2.5",
                // The own row holds the palette of colours under the nick (S-18).
                isMe && "flex-wrap",
              )}
            >
              <span className={cn("flex min-w-0 items-center gap-x-2", leads && "mr-auto")}>
                {/* The own dot is the button that changes the colour. Outside the nick's span, so a long nick wraps
                    next to its dot. */}
                {isMe ? (
                  <ColorDotButton picker={picker} />
                ) : (
                  <span
                    aria-hidden="true"
                    data-color={color}
                    className={cn("size-2.5 shrink-0 rounded-full", color !== undefined && SLICE_DOTS[color])}
                  />
                )}
                <span className="flex min-w-0 flex-col">
                  <span className="wrap-anywhere">{player.nick}</span>
                  {!mayVote && <span className="text-muted-foreground text-xs">{t.round.voting.fromNextQuestion}</span>}
                </span>
              </span>
              <span className={cn("flex shrink-0 flex-wrap justify-end gap-1.5", leads && "ml-auto")}>
                <PlayerBadges
                  player={player}
                  // In the host's view the switch stands in the badge's place; pressed, it looks the same.
                  cohost={player.cohost && !switchShown}
                  isMe={player.nick === view.me}
                  hasVoted={mayVote && voted.has(player.nick)}
                />
              </span>
              {switchShown && (
                <CohostButton
                  player={player}
                  hintId={cohostHintId}
                  onCohost={onCohost}
                  refreshes={refreshes}
                  preview={preview?.roleSwitch}
                />
              )}
              {mayRemove(view, player) && (
                <RemovePlayerButton
                  player={player}
                  onRemove={onRemove}
                  refreshes={refreshes}
                  preview={preview?.removal}
                />
              )}
              {isMe && <ColorPalette picker={picker} />}
            </li>
          );
        })}
      </ul>
      {status}
      <p className="text-muted-foreground text-sm">{t.round.voting.colorHint}</p>
      {isHost && view.players.some((player) => !player.host) && (
        <p id={cohostHintId} className="text-muted-foreground text-sm">
          {t.round.voting.cohostHint}
        </p>
      )}
    </section>
  );

  // The hints are for those who may vote; a latecomer gets the note in place of the form instead.
  let hint: string | null = t.round.voting.hint;
  if (!canVote) {
    hint = null;
  } else if (hasVoted) {
    hint = leads ? t.round.voting.waitingLeader : t.round.voting.waiting;
  }

  let body: React.ReactNode;
  if (!canVote) {
    body = (
      <>
        {/* A note, not an alert: it is on the screen from the moment the latecomer comes in. */}
        <Alert role="note">
          <Hourglass />
          <AlertTitle>{t.round.voting.latecomerTitle}</AlertTitle>
          <AlertDescription>{t.round.voting.latecomerText}</AlertDescription>
        </Alert>
        {players}
      </>
    );
  } else if (hasVoted) {
    body = (
      <>
        <Alert>
          <CircleCheck />
          <AlertTitle>{t.round.voting.votedTitle}</AlertTitle>
          <AlertDescription>
            {myVote && (
              <p>{myVote.target === null ? t.round.voting.abstained : t.round.voting.myVote(myVote.target)}</p>
            )}
            <p>{t.round.voting.final}</p>
          </AlertDescription>
        </Alert>
        {players}
      </>
    );
  } else {
    body = (
      <form onSubmit={handleSubmit} noValidate className="flex flex-col gap-6">
        <FieldSet className="min-w-0 gap-3">
          <FieldLegend variant="label">{t.round.voting.legend}</FieldLegend>
          <ul className={TILE_LIST}>
            {candidates.map((player, index) => {
              const id = `${idPrefix}vote-${index}`;
              const badgesId = `${id}-badges`;
              const isMe = player.nick === view.me;
              const hasBadges = player.host || player.cohost || isMe || voted.has(player.nick);
              return (
                <li key={player.nick} className={CHOICE_ROW}>
                  <input
                    type="radio"
                    id={id}
                    name={`${idPrefix}vote`}
                    value={index}
                    checked={choice === player.nick}
                    onChange={() => {
                      choose(player.nick);
                    }}
                    aria-describedby={describedBy(hasBadges && badgesId, missingChoice && choiceErrorId)}
                    aria-invalid={missingChoice || undefined}
                    className={RADIO}
                  />
                  <label htmlFor={id} className={CHOICE_LABEL}>
                    {player.nick}
                  </label>
                  {hasBadges && (
                    <span id={badgesId} className="flex shrink-0 flex-wrap justify-end gap-1.5">
                      <PlayerBadges
                        player={player}
                        cohost={player.cohost}
                        isMe={isMe}
                        hasVoted={voted.has(player.nick)}
                      />
                    </span>
                  )}
                </li>
              );
            })}
            <li className={CHOICE_ROW}>
              <input
                type="radio"
                id={`${idPrefix}vote-abstain`}
                name={`${idPrefix}vote`}
                value={ABSTAIN}
                checked={choice === null}
                onChange={() => {
                  choose(null);
                }}
                aria-describedby={describedBy(missingChoice && choiceErrorId)}
                aria-invalid={missingChoice || undefined}
                className={RADIO}
              />
              <label htmlFor={`${idPrefix}vote-abstain`} className="min-w-0 flex-1 cursor-pointer py-2.5">
                {t.round.voting.abstain}
              </label>
            </li>
          </ul>
          {missingChoice && <FieldError id={choiceErrorId}>{t.round.voting.missingChoice}</FieldError>}
          {status}
        </FieldSet>

        <ServerError message={voteError} />

        <div className="flex flex-col gap-2">
          {/* Disabled until the island runs (B-1): the form has no method, so a press in the page from the server
              would make the browser send it itself, a GET with the chosen radio in the page's address. While the vote
              is on its way the button waits, still focusable (aria-disabled, not disabled), so a refusal leaves the
              focus on it; handleSubmit stops a second press. An accepted vote takes it away, and RoomScreen takes the
              focus to the view's title (focus.ts). */}
          <Button
            type="submit"
            className={cn("w-full", BUSY_BUTTON)}
            disabled={!hydrated}
            aria-disabled={voting || undefined}
          >
            {voting ? (
              <>
                <Spinner aria-hidden="true" />
                {t.round.voting.sending}
              </>
            ) : (
              <>
                <Send />
                {t.round.voting.vote}
              </>
            )}
          </Button>
          <p className="text-muted-foreground text-sm">{t.round.voting.final}</p>
        </div>
      </form>
    );
  }

  return (
    <div className="flex flex-col gap-8">
      <div className="flex flex-col gap-2">
        <RoundQuestion question={round.question} titleAs={titleAs} />
        <RoundCounter number={round.number} total={view.question_count} />
        {hint && <p className="text-muted-foreground">{hint}</p>}
      </div>

      {body}

      {leads && (
        <HostActions
          actions={[
            // Two steps (decision D3, option b): the round reveals itself after the last vote, so this button exists
            // only while someone has not voted, and the first press always asks. No timer.
            {
              id: "reveal",
              label: t.round.voting.reveal.label,
              busyLabel: t.round.voting.reveal.busyLabel,
              Icon: Eye,
              confirmText: t.round.voting.reveal.confirmText(round.voted.length, round.eligible.length),
              variant: "secondary",
              run: () => onReveal(round.number),
            },
            {
              id: "skip",
              label: t.round.voting.skip.label,
              busyLabel: t.round.voting.skip.busyLabel,
              Icon: SkipForward,
              confirmText: t.round.voting.skip.confirmText(round.voted.length, round.eligible.length),
              variant: "outline",
              run: () => onSkip(round.number),
            },
            endGameAction(onEnd, t),
          ]}
          note={t.round.voting.leaderNote}
          // From lg one line under the form, stuck to the window's bottom only once the leader has voted: before, a
          // bar would cover "Zagłosuj".
          placement={hasVoted ? "bar" : "row"}
          preview={hostPreview}
        />
      )}
    </div>
  );
}
