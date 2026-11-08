import { Badge } from "@/components/ui/badge";

// How long the game is, on every screen that has it (game-length, context/changes/game-length/plan.md, Faza 3; Karol's
// choices on the screenshots of 2026-11-07, change.md): the number of the game's questions (question_count) in the
// lobby, "Pytanie N z T" at every round's screen, and the line for a player with no role once the game's last question
// is over. Numbers only, never the list (lessons.md, "Pytania gry tylko po stronie serwera"). None is a heading: the
// focus after a leader's move goes to the view's first h1 or h2 (RoomScreen), and e2e reads the round's title by its
// heading.

// "Pytanie 7 z 15" on the voting, the reveal and a skipped question (variant 2A): a quiet line above the round's title.
// It stands after the title in the DOM, so the title stays the view's first element (AGENTS.md, UI), and order-first
// lifts it above the title on the screen: put it right after the title, inside the title's flex column. number is the
// round's (a skipped one counts too, Karol's decision 4), total the game's question_count.
export function RoundCounter({ number, total }: { number: number; total: number }) {
  return (
    <p className="text-muted-foreground order-first text-sm font-medium">
      Pytanie {number} z {total}
    </p>
  );
}

// "Liczba pytań: 15" under the lobby's subtitle, for every role (variant 1C, Karol's words): the grey pill of the
// "host" badge. The wording takes the same form for every count, so it needs no plural.
export function QuestionCountBadge({ count }: { count: number }) {
  return <Badge variant="secondary">Liczba pytań: {count}</Badge>;
}

// Whether the round on the screen is the game's last question: the database opens no next one after it
// (private.open_next_round) until a leader adds questions ("Jeszcze 5 pytań") or approves a proposal (S-10).
export function isLastQuestion(roundNumber: number, questionCount: number): boolean {
  return roundNumber >= questionCount;
}

// For a player with no role after the game's last question, revealed or skipped (variant G2): a leader has the buttons
// ("Zakończ grę", "Jeszcze 5 pytań"), everyone else is told why nothing moves on.
export function LastQuestionNote() {
  return <p className="text-muted-foreground">To było ostatnie pytanie. Prowadzący zdecyduje, czy gramy dalej.</p>;
}
