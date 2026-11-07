import { afterRoundActions, HostActions, type HostActionsPreview } from "@/components/room/HostActions";
import type { ActionOutcome } from "@/components/room/room-actions";
import { isLastQuestion, LastQuestionNote, RoundCounter } from "@/components/room/RoundCounter";
import type { RoomView, SkippedRound } from "@/lib/rooms/shared";

interface Props {
  view: RoomView;
  round: SkippedRound;
  titleAs: "h1" | "h2";
  refreshFailed: boolean;
  onNext: (round: number) => Promise<ActionOutcome>;
  onMore: (round: number) => Promise<ActionOutcome>;
  onEnd: () => Promise<ActionOutcome>;
  hostPreview?: HostActionsPreview;
}

// The latest round was skipped and no question was left to open after it (decision D2 of
// context/archive/2026-10-15-full-game-evening/research.md: skipping the last question does not end the game by
// itself): since game-length the game's last question, which still counts ("Pytanie 15 z 15", RoundCounter; Karol's
// decision 4). Its votes are gone, so there is nothing to show but that. A leader (the host or a co-host, S-07) ends
// the game or adds questions ("Jeszcze N pytań", when the Worker counted some to add); "Następne pytanie" only if the
// Worker still sees a question left (questionsLeft true): once a leader approves a proposal (S-10). A player with no
// role reads that the leader decides.
export default function RoundSkipped({
  view,
  round,
  titleAs: Title,
  refreshFailed,
  onNext,
  onMore,
  onEnd,
  hostPreview,
}: Props) {
  return (
    <div className="flex flex-col gap-8">
      <section className="flex flex-col gap-2">
        <Title className="text-2xl font-semibold text-balance">Prowadzący pominął pytanie.</Title>
        <RoundCounter number={round.number} total={view.question_count} />
        <p className="text-muted-foreground">Głosy z niego przepadły.</p>
        {!view.leader && isLastQuestion(round.number, view.question_count) && <LastQuestionNote />}
        <p aria-live="polite" className="text-muted-foreground text-xs">
          {refreshFailed ? "Nie udało się odświeżyć stanu gry" : ""}
        </p>
      </section>

      {view.leader && (
        <HostActions
          // null: the Worker could not tell; skip_round opens the next question whenever there is one, so a skip that
          // stayed the latest round reads as the game's last question, with nothing counted to add.
          {...afterRoundActions({
            questionsLeft: view.questionsLeft === true,
            moreQuestions: view.moreQuestions,
            onNext: () => onNext(round.number),
            onMore: () => onMore(round.number),
            onEnd,
          })}
          preview={hostPreview}
        />
      )}
    </div>
  );
}
