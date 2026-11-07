import { useRef, useState } from "react";
import { ArrowRight, Flag, Plus, type LucideIcon } from "lucide-react";
import { ServerError } from "@/components/auth/ServerError";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import type { ActionOutcome } from "@/components/room/room-actions";
import { QUESTIONS_RAN_OUT } from "@/lib/rooms/errors";
import { plural } from "@/lib/rooms/summary";
import { cn } from "@/lib/utils";

// The host's buttons that move the game on: "Odsłoń wynik", "Pomiń pytanie", "Zakończ grę", "Następne pytanie",
// "Jeszcze 5 pytań" (game-length). An action that takes something away (votes, the evening) asks first: the same
// button turns into the question and acts on the second press, with "Anuluj" next to it, so the focus stays where it
// was (the pattern of "Odsłoń wynik" from S-02). One question at a time; while one action is on its way every button
// waits, still focusable (aria-disabled, not disabled), so the keyboard's place is not lost while the new state is on
// its way or when the action is refused.

export type HostActionId = "reveal" | "skip" | "end" | "next" | "more";

export interface HostAction {
  id: HostActionId;
  label: string;
  busyLabel: string;
  Icon: LucideIcon;
  // The question on the second press; without it the first press acts.
  confirmText?: string;
  variant: "default" | "secondary" | "outline";
  run: () => Promise<ActionOutcome>;
}

// "Zakończ grę" while voting, after a reveal and after the last question was skipped: the room closes for everyone
// (decision D4), so it always asks. The main button ("default") once the game's last question is over and more can be
// added (game-length, Karol's variant 3B), the second one everywhere else.
export function endGameAction(
  run: () => Promise<ActionOutcome>,
  variant: HostAction["variant"] = "outline",
): HostAction {
  return {
    id: "end",
    label: "Zakończ grę",
    busyLabel: "Kończenie gry…",
    Icon: Flag,
    confirmText: "Na pewno zakończyć grę? Wszyscy zobaczą koniec wieczoru",
    variant,
    run,
  };
}

// "Jeszcze 5 pytań" once the game's last question is over (game-length): count is how many questions it adds
// (RoomView.moreQuestions: at most 5, fewer when fewer are left), so the label never promises more ("Jeszcze 3
// pytania"). One press, nothing is lost; the route opens the next question at once (src/pages/api/rooms/[id]/more.ts).
export function moreQuestionsAction(count: number, run: () => Promise<ActionOutcome>): HostAction {
  return {
    id: "more",
    label: `Jeszcze ${String(count)} ${plural(count, "pytanie", "pytania", "pytań")}`,
    busyLabel: "Dobieranie pytań…",
    Icon: Plus,
    variant: "outline",
    run,
  };
}

// "Następne pytanie" after a reveal: one press, nothing is lost.
export function nextQuestionAction(run: () => Promise<ActionOutcome>): HostAction {
  return {
    id: "next",
    label: "Następne pytanie",
    busyLabel: "Wczytywanie pytania…",
    Icon: ArrowRight,
    variant: "default",
    run,
  };
}

export interface AfterRound {
  // Whether the game has a question before its last one, as the screen reads RoomView.questionsLeft (RoundReveal and
  // RoundSkipped read its null differently).
  questionsLeft: boolean;
  // How many questions "Jeszcze 5 pytań" adds once questionsLeft is false (RoomView.moreQuestions); null reads as 0.
  moreQuestions: number | null;
  onNext: () => Promise<ActionOutcome>;
  onMore: () => Promise<ActionOutcome>;
  onEnd: () => Promise<ActionOutcome>;
}

// A leader's buttons once no round is voting (RoundReveal, RoundSkipped). The game never ends by itself:
// - before the game's last question: "Następne pytanie", then "Zakończ grę";
// - after it, with questions left to add (game-length, Karol's variant 3B): "Zakończ grę" as the main button first, then
//   "Jeszcze N pytań";
// - with none left: "Zakończ grę" alone and the sentence that the questions ran out.
export function afterRoundActions({ questionsLeft, moreQuestions, onNext, onMore, onEnd }: AfterRound): {
  actions: HostAction[];
  note?: string;
} {
  if (questionsLeft) {
    return { actions: [nextQuestionAction(onNext), endGameAction(onEnd)] };
  }
  const more = moreQuestions ?? 0;
  if (more > 0) {
    return { actions: [endGameAction(onEnd, "default"), moreQuestionsAction(more, onMore)] };
  }
  return { actions: [endGameAction(onEnd)], note: QUESTIONS_RAN_OUT };
}

// The dev previews only (/dev/room-states, /dev/room-window): the starting state of the host's buttons; the real page
// never sets it.
export interface HostActionsPreview {
  confirming?: HostActionId;
  busy?: HostActionId;
  error?: string | null;
}

// Where the buttons stand from lg (1024 px, src/components/room/room-frame.ts); below lg every placement is one row per
// action, as on a phone. "stack": one row per action at every width. "row": every action in one line, each as wide as
// the others, and a question "Na pewno…?" with "Anuluj" twice as wide. "bar": that line stuck to the window's bottom,
// on the page's background and above the content that scrolls under it. Sticky works while no ancestor clips its
// overflow.
export type HostActionsPlacement = "stack" | "row" | "bar";

const BAR = "lg:bg-background lg:sticky lg:bottom-0 lg:z-10 lg:-mx-4 lg:px-4 lg:pb-4";

interface Props {
  actions: HostAction[];
  // A quiet line under the buttons, e.g. when the questions ran out.
  note?: string;
  placement?: HostActionsPlacement;
  preview?: HostActionsPreview;
}

export function HostActions({ actions, note, placement = "stack", preview }: Props) {
  const [confirming, setConfirming] = useState<HostActionId | null>(preview?.confirming ?? null);
  const [busy, setBusy] = useState<HostActionId | null>(preview?.busy ?? null);
  const [error, setError] = useState<string | null>(preview?.error ?? null);
  const buttons = useRef(new Map<HostActionId, HTMLButtonElement>());
  const asking = actions.find((action) => action.id === confirming && busy === null);
  const inLine = placement !== "stack";
  // Running out of questions is news, not a failure (Karol, deferred-review-fixes phase 3): a refused "Następne
  // pytanie" says so in the note's grey, and once the refreshed state shows the note, only there.
  const ranOut = error === QUESTIONS_RAN_OUT;
  const quiet = note ?? (ranOut ? QUESTIONS_RAN_OUT : undefined);

  async function run(action: HostAction) {
    setBusy(action.id);
    setError(null);
    const outcome = await action.run();
    // Accepted: the button stays busy until the new state arrives and this view goes away.
    if (!outcome.ok) {
      setBusy(null);
      setConfirming(null);
      setError(outcome.message);
    }
  }

  function press(action: HostAction) {
    if (busy !== null) return;
    if (action.confirmText !== undefined && confirming !== action.id) {
      setError(null);
      setConfirming(action.id);
      return;
    }
    void run(action);
  }

  function cancel(id: HostActionId) {
    setConfirming(null);
    buttons.current.get(id)?.focus();
  }

  return (
    <div className={cn("flex flex-col gap-3 border-t pt-6", placement === "bar" && BAR)}>
      {/* Below lg display: contents, so each action is a row of the column; from lg the line of "row" and "bar". */}
      <div className={cn("contents", inLine && "lg:flex lg:gap-3")}>
        {actions.map((action) => {
          const isAsking = asking?.id === action.id;
          const isBusy = busy === action.id;
          const { Icon } = action;
          return (
            // In a line the question takes twice the room of a button, so it wraps to about two lines next to "Anuluj".
            <div
              key={action.id}
              className={cn(
                "flex flex-col gap-2 sm:flex-row",
                inLine && (isAsking ? "lg:flex-2 lg:items-center" : "lg:flex-1"),
              )}
            >
              <Button
                ref={(node) => {
                  if (node) buttons.current.set(action.id, node);
                  else buttons.current.delete(action.id);
                }}
                type="button"
                variant={isAsking ? "default" : action.variant}
                aria-disabled={busy !== null || undefined}
                // The question may wrap on a phone ("Głosy przepadną (zagłosowało 12 z 20)"); busy looks as disabled.
                className="h-auto min-h-9 py-2 text-center whitespace-normal aria-disabled:cursor-default aria-disabled:opacity-50 sm:flex-1"
                onClick={() => {
                  press(action);
                }}
              >
                {isBusy ? (
                  <>
                    <Spinner aria-hidden="true" />
                    {action.busyLabel}
                  </>
                ) : (
                  <>
                    <Icon />
                    {isAsking ? action.confirmText : action.label}
                  </>
                )}
              </Button>
              {isAsking && (
                <Button
                  type="button"
                  variant="ghost"
                  onClick={() => {
                    cancel(action.id);
                  }}
                >
                  Anuluj
                </Button>
              )}
            </div>
          );
        })}
      </div>
      {quiet && <p className="text-muted-foreground text-sm">{quiet}</p>}
      {/* A screen reader may not read a focused button again when its name changes; this says the question, and the
          refusal shown in grey, which is not an alert. */}
      <p aria-live="polite" className="sr-only">
        {asking?.confirmText ?? (ranOut ? QUESTIONS_RAN_OUT : "")}
      </p>
      <ServerError message={ranOut ? null : error} />
    </div>
  );
}
