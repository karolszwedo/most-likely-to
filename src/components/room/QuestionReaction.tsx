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

// The buttons show the thumb alone; their names, the dictionary's under the thumb (t.round.reaction), say what it means.
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

// "Oceń pytanie" on the reveal, a thumb up ("Dobre pytanie") or down ("Słabe pytanie") (S-11, PRD FR-016 and FR-018): any player of the room, the host and
// a latecomer let in during the question too, may give the question a thumb, or none. A tap sends it at once; the
// second tap of the same thumb takes it back, the other thumb switches. Nobody else sees it, and the room's state never
// carries it, so it lives only in this component's memory: a new question (RoundReveal's key) or a reload starts
// empty, and a tap then overwrites what the database had. While a tap is on its way both buttons wait, still focusable
// (aria-disabled), so the keyboard's place is not lost; a refusal says its short text under them. Nothing here waits
// for the host or holds up the host's buttons.
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
      <div role="group" aria-labelledby={labelId} className="flex flex-col gap-2">
        <p id={labelId} className="text-sm font-medium">
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
                size="icon"
                aria-label={t.round.reaction[thumb]}
                aria-pressed={pressed}
                aria-disabled={sending !== null || undefined}
                aria-describedby={error ? errorId : undefined}
                // One border in both states, so a press never moves its neighbour.
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
              </Button>
            );
          })}
        </div>
      </div>
      {error && <FieldError id={errorId}>{error}</FieldError>}
    </div>
  );
}
