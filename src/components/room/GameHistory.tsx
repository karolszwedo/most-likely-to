import { ArrowLeft } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import GameSummary from "@/components/room/GameSummary";
import { ResultPie, ResultTable } from "@/components/room/ResultTable";
import RoomMessage from "@/components/room/RoomMessage";
import { historyInHalves } from "@/components/room/room-frame";
import { TILE, TILE_LIST } from "@/components/room/surfaces";
import { playerColors, resultViews } from "@/lib/rooms/chart";
import type { GameHistoryView, HistoryQuestion } from "@/lib/rooms/history";
import { questionSentence, type RoundResult } from "@/lib/rooms/shared";
import { cn } from "@/lib/utils";

// The history of one ended game for its host (S-26, historia gry: /gry/<id>; PRD FR-030;
// context/changes/game-history-details/plan.md, Faza 3 #3, Karol's picks of 2026-11-21 after the gallery). Rendered on
// the server by src/pages/gry/[id].astro without client:*, so the browser gets only this HTML: the view the Worker made
// (GameHistoryView), never a question's id or the number of ballots. No motion anywhere: the reveal's motion plays only
// when a new reveal reaches an open tab of the room (AGENTS.md, "## UI"), and the history is always a page just opened.

interface Props {
  history: GameHistoryView;
  // Unique ids when /dev/room-states renders several histories on one page; "" on the real page.
  idPrefix?: string;
  // The states page has its own h1, so there the title is an h2 (as RoomMessage's titleAs).
  titleAs?: "h1" | "h2";
}

// "Twoje gry" back to the list (N2): the button's variant link (Blurple as text; its row in /dev/ui-kitchen-sink), with
// no padding and the text's own height, so it starts at the title's left edge as a line of text.
const BACK_LINK = cn(buttonVariants({ variant: "link", size: "sm" }), "h-auto self-start px-0 has-[>svg]:px-0");

// The page (N2, U4): the title "Historia gry" first in the DOM with the game's date under it (not a heading) and the way
// back to "Twoje gry"; then, when the game had a reveal, "Podsumowanie wieczoru", the end of the evening's summary
// (GameSummary, its cards saying "tego wieczoru"); then "Pytania po kolei", the game's questions in the order of rounds.
// With the summary's chart (historyInHalves), from lg the title, the counts and the nicks with none on the left and the
// chart on the right, as the end of the evening in two halves, in one grid; the questions under it in two columns, read
// 1, 2 / 3, 4, each tile at its own height. Below lg, and without a chart, one column in the order of the DOM. A game
// that never started has one sentence instead.
export default function GameHistory({ history, idPrefix = "", titleAs: Title = "h1" }: Props) {
  const { date, started, me, players, summary, questions } = history;
  const halves = historyInHalves(summary);
  // Each player's stored colour (S-18), as in the reveals: the dots, the pies and the summary's chart.
  const colors = playerColors(players);
  return (
    <div className="flex flex-col gap-6">
      {/* The title and the summary heading are one item of the grid, so its left column has at most three (with the
          counts and the nicks with none) and a row the chart spans stays empty for the chart's extra height. */}
      <div className={cn("flex flex-col gap-4", halves && "lg:grid lg:grid-cols-2 lg:items-start lg:gap-x-10")}>
        <div className={cn("flex flex-col gap-6", halves && "lg:col-start-1")}>
          <div className="flex flex-col gap-4">
            <div className="flex flex-col gap-1">
              <Title className="text-2xl font-semibold text-balance">Historia gry</Title>
              <p className="text-muted-foreground">{date}</p>
            </div>
            <a href="/gry" className={BACK_LINK}>
              <ArrowLeft aria-hidden="true" className="size-4" />
              Twoje gry
            </a>
          </div>
          {summary !== null && <h2 className="text-lg font-semibold">Podsumowanie wieczoru</h2>}
        </div>
        {summary !== null && (
          <GameSummary colors={colors} me={me} summary={summary} place="history" idPrefix={idPrefix} halves={halves} />
        )}
      </div>

      {!started && <p>Gra nie wystartowała, więc nie ma tu pytań.</p>}

      {questions.length > 0 && (
        <section aria-labelledby={`${idPrefix}history-questions-heading`} className="flex flex-col gap-4">
          <h2 id={`${idPrefix}history-questions-heading`} className="text-lg font-semibold">
            Pytania po kolei
          </h2>
          <ol className={cn(TILE_LIST, halves && "lg:grid lg:grid-cols-2 lg:items-start lg:gap-4")}>
            {questions.map((question) => (
              <QuestionTile key={question.number} question={question} colors={colors} me={me} />
            ))}
          </ol>
        </section>
      )}
    </div>
  );
}

// One question of the game as a tile: "Pytanie N" with where the question comes from (P1, decision 3: "Twoje" for the
// host's own and reworded ones, "propozycja gościa" for an approved proposal, never its author; none for the base),
// the question as one sentence (or the sentence that it could not be loaded, and the round stays), and how its round
// ended (O1): the reveal's result, or a grey sentence for a skipped question and for one cut short without a reveal.
function QuestionTile({
  question: { number, text, origin, outcome },
  colors,
  me,
}: {
  question: HistoryQuestion;
  colors: ReadonlyMap<string, number>;
  me: string;
}) {
  return (
    <li className={cn(TILE, "flex flex-col gap-3 p-4")}>
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
        <span className="text-muted-foreground text-sm">Pytanie {number}</span>
        {origin === "own" && <Badge variant="secondary">Twoje</Badge>}
        {origin === "proposal" && <Badge variant="secondary">propozycja gościa</Badge>}
      </div>
      <p className="font-medium text-balance break-words">{questionSentence(text)}</p>
      {outcome.kind === "revealed" && (
        <RevealResult
          results={outcome.results}
          abstained={outcome.abstained}
          votesLost={outcome.votesLost}
          colors={colors}
          me={me}
        />
      )}
      {outcome.kind === "skipped" && <p className="text-muted-foreground text-sm">Pytanie pominięte.</p>}
      {outcome.kind === "cutShort" && <p className="text-muted-foreground text-sm">Gra skończyła się przed odsłoną.</p>}
    </li>
  );
}

// A reveal as the room saw it (W2): the result's table, with a small still pie next to it whenever the room's reveal
// could show one (1 to MAX_PIE_SLICES players with votes, resultViews), so none when everyone abstained; then the
// abstentions, and the note when votes went with a removed player (D1, decision 2: no number, no nick).
function RevealResult({
  results,
  abstained,
  votesLost,
  colors,
  me,
}: {
  results: RoundResult[];
  abstained: number;
  votesLost: boolean;
  colors: ReadonlyMap<string, number>;
  me: string;
}) {
  const pie = resultViews(results).toggle;
  const table = (
    <ResultTable
      results={results}
      colors={colors}
      me={me}
      bars={false}
      animate={false}
      className={pie ? "min-w-0 flex-1" : undefined}
    />
  );
  return (
    <>
      {pie ? (
        <div className="flex items-center gap-4">
          <ResultPie
            results={results}
            colors={colors}
            edge="stroke-card"
            className="size-20 shrink-0 lg:size-28"
            animate={false}
          />
          {table}
        </div>
      ) : (
        table
      )}
      <p className="text-muted-foreground text-sm">Wstrzymało się: {abstained}</p>
      {votesLost && <p className="text-muted-foreground text-sm">Część głosów przepadła razem z usuniętym graczem.</p>}
    </>
  );
}

// The page's answers when there is no history to show (Z1), as the room pages' centred messages (RoomMessage), each
// with the way back to "Twoje gry": a game that is not there (deleted, never was, a malformed address or another
// host's game) and a game still open. The database not answering gets its code's text and "Odśwież stronę". Shared with
// /dev/room-states, so the preview shows the page's own sentences.
type MessageProps =
  | { kind: "unknown" | "playing"; titleAs?: "h1" | "h2" }
  | { kind: "error"; text: string | null; refreshHref: string; titleAs?: "h1" | "h2" };

const MISSING = {
  unknown: { icon: "gone", title: "Nie ma takiej gry.", text: "Mogła zostać usunięta albo adres jest niepełny." },
  playing: { icon: "waiting", title: "Ta gra jeszcze trwa.", text: "Jej historia będzie tutaj, gdy gra się skończy." },
} as const;

export function GameHistoryMessage(props: MessageProps) {
  if (props.kind === "error") {
    return (
      <RoomMessage
        titleAs={props.titleAs}
        icon="error"
        title="Nie udało się otworzyć historii gry."
        text={props.text}
        refreshHref={props.refreshHref}
      />
    );
  }
  const { icon, title, text } = MISSING[props.kind];
  return (
    <RoomMessage titleAs={props.titleAs} icon={icon} title={title} text={text}>
      <a href="/gry" className={buttonVariants({ variant: "secondary" })}>
        Twoje gry
      </a>
    </RoomMessage>
  );
}
