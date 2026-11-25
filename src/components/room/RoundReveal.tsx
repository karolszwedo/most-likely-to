import { ChartBarDecreasing, ChartPie } from "lucide-react";
import { Button } from "@/components/ui/button";
import { afterRoundActions, HostActions, type HostActionsPreview } from "@/components/room/HostActions";
import QuestionReaction, { type QuestionReactionPreview, type Reaction } from "@/components/room/QuestionReaction";
import type { ActionOutcome } from "@/components/room/room-actions";
import { ResultPie, ResultTable } from "@/components/room/ResultTable";
import { isLastQuestion, LastQuestionNote, RoundCounter } from "@/components/room/RoundCounter";
import { RoundQuestion } from "@/components/room/RoundQuestion";
import { useT } from "@/lib/i18n/react";
import { playerColors, resultViews, type ResultView } from "@/lib/rooms/chart";
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
  // Whether the result comes in with its motion (reveal-motion.ts): only when it was revealed while this tab stood
  // (RoomScreen), never after a reload or for a latecomer on the reveal.
  animate: boolean;
  // The view this player picked with the toggle, or null for the default. Kept by RoomScreen, so it survives the
  // next round while the page lives; never sent anywhere or stored.
  chosenView: ResultView | null;
  onChooseView: (next: ResultView) => void;
  // The round's number goes with "Następne pytanie" and "Jeszcze 5 pytań", so a second press never moves past the
  // question it opened.
  onNext: (round: number) => Promise<ActionOutcome>;
  onMore: (round: number) => Promise<ActionOutcome>;
  onEnd: () => Promise<ActionOutcome>;
  // A thumb on this question (QuestionReaction): every player's, never waited for by anyone.
  onReact: (reaction: Reaction, round: number) => Promise<ActionOutcome>;
  hostPreview?: HostActionsPreview;
  reactionPreview?: QuestionReactionPreview;
}

// The toggle's two views; their names are the dictionary's (t.round.reveal.views).
const VIEW_OPTIONS: { view: ResultView; Icon: typeof ChartPie }[] = [
  { view: "pie", Icon: ChartPie },
  { view: "bars", Icon: ChartBarDecreasing },
];

// The reveal (PRD FR-009; decision D3: always the counts, also after one vote): every player, most votes first, a tie
// in seat order, zeros dimmed at the bottom (sortResults), and how many abstained. Only counts per person, never who
// voted for whom. "Koło" or "Paski" changes only this player's screen. Each player has their stored colour
// (playerColors) in every round: the slice of the pie and the dot in the row, in both views. The result stays until a
// leader (the host or a co-host, S-07) opens the next question or ends the game; after the game's last question
// (questionsLeft false, game-length) "Zakończ grę" and "Jeszcze N pytań", or only "Zakończ grę" when nothing is left to
// add, while a player with no role reads that the leader decides. Above the question "Pytanie N z T" (RoundCounter).
// Under the question, before the result, every player may rate it with a thumb (QuestionReaction), seen by nobody else
// (S-30: under the result nobody saw them in the game of 2026-11-22). From lg
// the pie stands next to the table and the leader's buttons are a bar at the window's bottom, so the next move stays in
// view however long the table is. Only when the result is revealed in this open tab does it come in with a short motion
// (animate, reveal-motion.ts), under motion-safe; the data, the focus and the announcement come at once as ever.
export default function RoundReveal({
  view,
  round,
  idPrefix,
  titleAs,
  refreshFailed,
  animate,
  chosenView,
  onChooseView,
  onNext,
  onMore,
  onEnd,
  onReact,
  hostPreview,
  reactionPreview,
}: Props) {
  const t = useT();
  const colors = playerColors(view.players);
  const { toggle, initial } = resultViews(round.results);
  const shown: ResultView = toggle ? (chosenView ?? initial) : "bars";
  // The host, or a guest with the co-host role (S-07).
  const leads = view.leader;

  return (
    <div className="flex flex-col gap-8">
      <div className="flex flex-col gap-2">
        <RoundQuestion question={round.question} questionLang={round.questionLang} titleAs={titleAs} />
        <RoundCounter number={round.number} total={view.question_count} />
        {!leads && isLastQuestion(round.number, view.question_count) && <LastQuestionNote />}
        {/* Under the question and before the result (S-30), so the thumbs are on every first screen; after the title in
            the DOM, which stays the view's first element. */}
        <div className="mt-3">
          <QuestionReaction round={round.number} idPrefix={idPrefix} onReact={onReact} preview={reactionPreview} />
        </div>
      </div>

      <section
        aria-labelledby={`${idPrefix}results-heading`}
        className="flex flex-col gap-4 lg:grid lg:grid-cols-2 lg:items-start lg:gap-x-8"
      >
        <div className="flex flex-wrap items-center justify-between gap-3 lg:col-span-2">
          <h2 id={`${idPrefix}results-heading`} className="text-sm font-medium">
            {t.round.reveal.heading}
          </h2>
          {toggle && (
            // A pill around the two pills, as every button of the game (game-restyle).
            <div
              role="group"
              aria-label={t.round.reveal.viewToggle}
              className="inline-flex gap-0.5 rounded-full border p-0.5"
            >
              {VIEW_OPTIONS.map(({ view: option, Icon }) => (
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
                  {t.round.reveal.views[option]}
                </Button>
              ))}
            </div>
          )}
        </div>

        {shown === "pie" && (
          <ResultPie
            results={round.results}
            colors={colors}
            edge="stroke-background"
            className="mx-auto size-48 sm:size-56"
            animate={animate}
          />
        )}

        {/* Next to the pie from lg; across the section when the pie is not shown ("Paski"). */}
        <ResultTable
          results={round.results}
          colors={colors}
          me={view.me}
          bars={shown === "bars"}
          animate={animate}
          className={shown !== "pie" ? "lg:col-span-2" : undefined}
        />

        <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1 lg:col-span-2">
          <p className="text-muted-foreground text-sm">{t.round.reveal.abstained(round.abstained)}</p>
          <p aria-live="polite" className="text-muted-foreground text-xs">
            {refreshFailed ? t.round.refreshFailed : ""}
          </p>
        </div>
      </section>

      {leads && (
        <HostActions
          // null: the Worker could not tell, so the button stays and next_round has the final word: with no question
          // left, the route answers questions_ran_out (src/pages/api/rooms/[id]/next.ts).
          {...afterRoundActions(
            {
              questionsLeft: view.questionsLeft !== false,
              moreQuestions: view.moreQuestions,
              onNext: () => onNext(round.number),
              onMore: () => onMore(round.number),
              onEnd,
            },
            t,
          )}
          placement="bar"
          preview={hostPreview}
        />
      )}
    </div>
  );
}
