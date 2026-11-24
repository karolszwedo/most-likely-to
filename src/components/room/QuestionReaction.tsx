import { useState } from "react";
import { ThumbsDown, ThumbsUp } from "lucide-react";
import { Button } from "@/components/ui/button";
import { FieldError } from "@/components/ui/field";
import { Spinner } from "@/components/ui/spinner";
import type { ActionOutcome } from "@/components/room/room-actions";
import { useT } from "@/lib/i18n/react";
import { cn } from "@/lib/utils";

// A thumb as the route takes it (src/pages/api/rooms/[id]/react.ts): "none" takes this player's thumb back.
export type Reaction = "up" | "down" | "none";
type Thumb = Exclude<Reaction, "none">;

// The dev previews only (/dev/room-states, /dev/room-window): the starting state of the thumbs; the real page never
// sets it.
export interface QuestionReactionPreview {
  // The thumb given, as if its answer had come back.
  chosen?: Thumb;
  // A tap on its way: this thumb's button spins and both wait.
  sending?: Thumb;
  // The text of a refused tap.
  error?: string | null;
}

// Each button shows its thumb and a word ("Dobre", "Słabe"); its name, which starts with that word, says the whole
// meaning ("Dobre pytanie"). Both are the dictionary's under the thumb (t.round.reaction).
const THUMBS: { thumb: Thumb; Icon: typeof ThumbsUp }[] = [
  { thumb: "up", Icon: ThumbsUp },
  { thumb: "down", Icon: ThumbsDown },
];

interface Props {
  // The number of the revealed question; the thumb goes with it, so it never lands on a question this screen has not
  // shown (round_over).
  round: number;
  // Unique ids when /dev/room-states renders several screens on one page; "" on the real page.
  idPrefix: string;
  onReact: (reaction: Reaction, round: number) => Promise<ActionOutcome>;
  preview?: QuestionReactionPreview;
}

// "Oceń pytanie" on the reveal, a thumb up ("Dobre pytanie") or down ("Słabe pytanie") (S-11, PRD FR-016 and FR-018):
// any player of the room, the host and a latecomer let in during the question too, may give the question a thumb, or
// none. A tap sends it at once; the second tap of the same thumb takes it back, the other thumb switches. Nobody else
// sees it, and the room's state never carries it, so it lives only in this component's memory: a new question
// (RoundReveal's key) or a reload starts empty, and a tap then overwrites what the database had. While a tap is on its
// way both buttons wait, still focusable (aria-disabled), so the keyboard's place is not lost; a refusal says its short
// text under them. Nothing here waits for the host or holds up the host's buttons.
// One quiet line under the question (S-30, variant W2, Karol's pick of 2026-11-24): the label on the left, the two
// pills with a word on the right, wrapping on a narrow phone. In the first game with friends (2026-11-22) nobody saw
// the thumbs under the result, below the phone's first screen, next to the emotes' bigger 👍 👎. The label is muted, so
// rating never competes with "Wynik".
export default function QuestionReaction({ round, idPrefix, onReact, preview }: Props) {
  const t = useT();
  const [chosen, setChosen] = useState<Thumb | null>(preview?.chosen ?? null);
  const [sending, setSending] = useState<Thumb | null>(preview?.sending ?? null);
  const [error, setError] = useState<string | null>(preview?.error ?? null);
  const labelId = `${idPrefix}reaction-label`;
  const errorId = `${idPrefix}reaction-error`;

  async function tap(thumb: Thumb) {
    if (sending !== null) return;
    const next: Reaction = chosen === thumb ? "none" : thumb;
    setSending(thumb);
    setError(null);
    const outcome = await onReact(next, round);
    setSending(null);
    if (outcome.ok) {
      setChosen(next === "none" ? null : next);
      return;
    }
    setError(outcome.message);
  }

  return (
    <div className="flex flex-col gap-2">
      <div
        role="group"
        aria-labelledby={labelId}
        className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2"
      >
        <p id={labelId} className="text-muted-foreground text-sm">
          {t.round.reaction.label}
        </p>
        <div className="flex gap-2">
          {THUMBS.map(({ thumb, Icon }) => {
            const pressed = chosen === thumb;
            return (
              <Button
                key={thumb}
                type="button"
                variant={pressed ? "default" : "outline"}
                size="lg"
                aria-label={t.round.reaction[thumb]}
                aria-pressed={pressed}
                aria-disabled={sending !== null || undefined}
                aria-describedby={error ? errorId : undefined}
                // One border in both states, and the spinner as wide as the thumb it stands for, with the word kept, so
                // a press never moves its neighbour.
                className={cn(
                  "border aria-disabled:cursor-default aria-disabled:opacity-50",
                  pressed && "border-primary",
                )}
                onClick={() => {
                  void tap(thumb);
                }}
              >
                {sending === thumb ? (
                  <Spinner aria-hidden="true" className="size-4" />
                ) : (
                  <Icon aria-hidden="true" className={cn("size-4", pressed && "fill-current")} />
                )}
                {t.round.reaction.words[thumb]}
              </Button>
            );
          })}
        </div>
      </div>
      {error && <FieldError id={errorId}>{error}</FieldError>}
    </div>
  );
}
