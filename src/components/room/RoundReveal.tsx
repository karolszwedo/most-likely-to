import { ChartBarDecreasing, ChartPie } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { SLICE_DOTS, SLICE_FILLS } from "@/components/room/chart-colors";
import { afterRoundActions, HostActions, type HostActionsPreview } from "@/components/room/HostActions";
import QuestionReaction, { type QuestionReactionPreview, type Reaction } from "@/components/room/QuestionReaction";
import type { ActionOutcome } from "@/components/room/room-actions";
import { RoundQuestion } from "@/components/room/RoundQuestion";
import {
  pieSlices,
  playerColors,
  resultBars,
  resultViews,
  slicePath,
  type PieSlice,
  type ResultView,
} from "@/lib/rooms/chart";
import type { RoomView, RoundView } from "@/lib/rooms/shared";
import { cn } from "@/lib/utils";

type RevealedRoundView = Extract<RoundView, { phase: "revealed" }>;

interface Props {
  view: RoomView;
  round: RevealedRoundView;
  // Unique ids when /dev/room-states renders several screens on one page; "" on the real page.
  idPrefix: string;
  titleAs: "h1" | "h2";
  refreshFailed: boolean;
  // The view this player picked with the toggle, or null for the default. Kept by RoomScreen, so it survives the
  // next round while the page lives; never sent anywhere or stored.
  chosenView: ResultView | null;
  onChooseView: (next: ResultView) => void;
  // The round's number goes with "Następne pytanie", so a second press never moves past the question it opened.
  onNext: (round: number) => Promise<ActionOutcome>;
  onEnd: () => Promise<ActionOutcome>;
  // A thumb on this question (QuestionReaction): every player's, never waited for by anyone.
  onReact: (reaction: Reaction, round: number) => Promise<ActionOutcome>;
  hostPreview?: HostActionsPreview;
  reactionPreview?: QuestionReactionPreview;
}

const VIEW_OPTIONS: { view: ResultView; label: string; Icon: typeof ChartPie }[] = [
  { view: "pie", label: "Koło", Icon: ChartPie },
  { view: "bars", label: "Paski", Icon: ChartBarDecreasing },
];

// The pie for the eye only (the table below holds the data): slices from 12 o'clock clockwise, each in its player's
// stored colour (playerColors), not from its place in the result, and edged in the page's background so neighbours stay
// apart; one player with every vote is a plain circle.
function ResultPie({ slices, colors }: { slices: PieSlice[]; colors: ReadonlyMap<string, number> }) {
  return (
    <svg viewBox="0 0 100 100" aria-hidden="true" className="mx-auto size-48 sm:size-56">
      {slices.map((slice) => {
        const color = colors.get(slice.nick);
        const fill = color === undefined ? undefined : SLICE_FILLS[color];
        const path = slicePath(slice, 50, 48);
        return path === null ? (
          <circle key={slice.nick} cx="50" cy="50" r="48" className={fill} />
        ) : (
          <path key={slice.nick} d={path} strokeLinejoin="round" className={cn(fill, "stroke-background stroke-2")} />
        );
      })}
    </svg>
  );
}

// The reveal (PRD FR-009; decision D3: always the counts, also after one vote): every player, most votes first, a tie
// in seat order, zeros dimmed at the bottom (sortResults), and how many abstained. Only counts per person, never who
// voted for whom. "Koło" or "Paski" changes only this player's screen. Each player has their stored colour
// (playerColors) in every round: the slice of the pie and the dot in the row, in both views. The result stays until a
// leader (the host or a co-host, S-07) opens the next question or ends the game; when the game's pool ran out,
// only "Zakończ grę" (questionsLeft false). Under the result every player may rate the question with a thumb
// (QuestionReaction), seen by nobody else. From lg the pie stands next to the table and the leader's buttons are a bar
// at the window's bottom, so the next move stays in view however long the table is.
export default function RoundReveal({
  view,
  round,
  idPrefix,
  titleAs,
  refreshFailed,
  chosenView,
  onChooseView,
  onNext,
  onEnd,
  onReact,
  hostPreview,
  reactionPreview,
}: Props) {
  const rows = resultBars(round.results);
  const top = rows[0]?.votes ?? 0;
  const slices = pieSlices(round.results);
  const colors = playerColors(view.players);
  const { toggle, initial } = resultViews(round.results);
  const shown: ResultView = toggle ? (chosenView ?? initial) : "bars";
  // The host, or a guest with the co-host role (S-07).
  const leads = view.leader;

  return (
    <div className="flex flex-col gap-8">
      <RoundQuestion question={round.question} titleAs={titleAs} />

      <section
        aria-labelledby={`${idPrefix}results-heading`}
        className="flex flex-col gap-4 lg:grid lg:grid-cols-2 lg:items-start lg:gap-x-8"
      >
        <div className="flex flex-wrap items-center justify-between gap-3 lg:col-span-2">
          <h2 id={`${idPrefix}results-heading`} className="text-sm font-medium">
            Wynik
          </h2>
          {toggle && (
            <div role="group" aria-label="Widok wyniku" className="inline-flex gap-0.5 rounded-md border p-0.5">
              {VIEW_OPTIONS.map(({ view: option, label, Icon }) => (
                <Button
                  key={option}
                  type="button"
                  size="sm"
                  variant={shown === option ? "secondary" : "ghost"}
                  aria-pressed={shown === option}
                  className={cn(shown !== option && "text-muted-foreground")}
                  onClick={() => {
                    onChooseView(option);
                  }}
                >
                  <Icon />
                  {label}
                </Button>
              ))}
            </div>
          )}
        </div>

        {shown === "pie" && <ResultPie slices={slices} colors={colors} />}

        {/* Next to the pie from lg; across the section when the pie is not shown ("Paski"). */}
        <div className={cn("overflow-hidden rounded-md border", shown !== "pie" && "lg:col-span-2")}>
          <table className="w-full">
            <thead className="bg-muted/50 text-muted-foreground text-xs">
              <tr>
                <th scope="col" className="px-3 py-2 text-left font-medium">
                  Gracz
                </th>
                <th scope="col" className="px-3 py-2 text-right font-medium">
                  Głosy
                </th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {rows.map((row) => {
                const isTop = top > 0 && row.votes === top;
                const color = colors.get(row.nick);
                return (
                  <tr key={row.nick} className={cn(row.votes === 0 && "text-muted-foreground")}>
                    <td className="relative px-3 py-2.5">
                      {shown === "bars" && row.percent > 0 && (
                        // Behind the nick, as long as its votes relative to the top count; low opacity keeps the text
                        // readable on it.
                        <span
                          aria-hidden="true"
                          className={cn(
                            "absolute inset-y-1 left-0 rounded-r-sm",
                            isTop ? "bg-primary/35" : "bg-primary/20",
                          )}
                          style={{ width: `${row.percent}%` }}
                        />
                      )}
                      <span className="relative flex items-center gap-x-2">
                        {/* The player's stored colour, in every row and both views; in full also in a dimmed row
                            without votes, as it is the person's colour, not the slice's. A nick without a colour
                            keeps the space, so the nicks stay aligned. Outside the wrapping span, so a long nick
                            wraps next to its dot instead of pushing it onto a line of its own. */}
                        <span
                          aria-hidden="true"
                          className={cn("size-2.5 shrink-0 rounded-full", color !== undefined && SLICE_DOTS[color])}
                        />
                        <span className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
                          <span className={cn("min-w-0 wrap-anywhere", isTop && "font-semibold")}>{row.nick}</span>
                          {row.nick === view.me && <Badge variant="outline">ty</Badge>}
                        </span>
                      </span>
                    </td>
                    <td className={cn("px-3 py-2.5 text-right tabular-nums", isTop && "font-semibold")}>{row.votes}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1 lg:col-span-2">
          <p className="text-muted-foreground text-sm">Wstrzymało się: {round.abstained}</p>
          <p aria-live="polite" className="text-muted-foreground text-xs">
            {refreshFailed ? "Nie udało się odświeżyć stanu gry" : ""}
          </p>
        </div>
      </section>

      <QuestionReaction round={round.number} idPrefix={idPrefix} onReact={onReact} preview={reactionPreview} />

      {leads && (
        <HostActions
          // null: the Worker could not tell, so the button stays and next_round has the final word: with no question
          // left, the route answers questions_ran_out (src/pages/api/rooms/[id]/next.ts).
          {...afterRoundActions(view.questionsLeft !== false, () => onNext(round.number), onEnd)}
          placement="bar"
          preview={hostPreview}
        />
      )}
    </div>
  );
}
