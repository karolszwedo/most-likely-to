import type { Lang } from "@/lib/i18n";
import type {
  GameSummary,
  GameTotals,
  HistoryPlayer,
  HistoryRevealedRound,
  HistoryRound,
  QuestionOrigin,
  RoundResult,
} from "@/lib/rooms/shared";

// The history of one ended game for its host (S-26, historia gry: /gry/<id>; context/changes/game-history-details/
// plan.md, Faza 2 #2; PRD FR-030): the page's view and the two rules the Worker makes it with. Types from shared.ts
// and src/lib/i18n only, no other import: the Worker makes the view (src/lib/rooms/server.ts, gameHistory), and nothing
// here may pull server code or the question base into the browser (context/foundation/lessons.md, "Pytania gry tylko po
// stronie serwera").

// How a round of the game ended, as the page shows it: a reveal with its counts per nick in seat order (the page sorts
// them as the reveal did, sortResults), its abstentions and whether votes went with a removed player (votesLost, decision
// 2: a note with no number and no nick); a question skipped while voting; or one cut short without a reveal (the end of
// the game, "Nowa gra" or the sweep). Never the number of ballots.
export type HistoryOutcome =
  | { kind: "revealed"; results: RoundResult[]; abstained: number; votesLost: boolean }
  | { kind: "skipped" }
  | { kind: "cutShort" };

// A question of the game in the order of rounds: its number, its text (the ending after "Kto z nas najprawdopodobniej"
// or "Who’s most likely to", plain text for the page; null when the base does not have the round's question, so the
// page says it could not load it and the round stays), the language its sentence's start is in (english-version: for a
// question of the base the language of its text, the page's where it has a text in it, else Polish; for the host's
// own, reworded and proposed ones the page's, as the game does not know the language a player wrote in; the page's for
// a question with no text), where it comes from (decision 3) and how its round ended. Never the question's id.
export interface HistoryQuestion {
  number: number;
  text: string | null;
  lang: Lang;
  origin: QuestionOrigin;
  outcome: HistoryOutcome;
}

// What the page /gry/<id> gets from the Worker: the game's date (the start's, else the room's creation, as on "Twoje
// gry"), whether it started, the host's own nick (the badge "ty"), the players with their colours, the summary of the
// end of the evening (null with no reveal) and the questions in the order of rounds. Only what the reveals showed the
// room; never who voted for whom, the number of ballots or a question's id.
export interface GameHistoryView {
  date: string;
  started: boolean;
  me: string;
  players: HistoryPlayer[];
  summary: GameSummary | null;
  questions: HistoryQuestion[];
}

// The sums of the game's reveals by the rule of game_totals (context/archive/2026-10-25-game-summary/plan.md): the
// number of revealed rounds, and for every player with a result in at least one of them, in seat order (the order of
// players), the sum of those results, zeros included. A skipped round and one cut short add nothing; a player with no
// result anywhere (a latecomer let in after the last reveal) has no entry. null with no reveal: no summary at all.
export function historyTotals(
  players: readonly Pick<HistoryPlayer, "nick">[],
  rounds: readonly HistoryRound[],
): GameTotals | null {
  const reveals = rounds.filter((round): round is HistoryRevealedRound => round.phase === "revealed");
  if (reveals.length === 0) return null;
  const totals: RoundResult[] = [];
  for (const { nick } of players) {
    const own = reveals.flatMap((round) => round.results.filter((result) => result.nick === nick));
    if (own.length === 0) continue;
    totals.push({ nick, votes: own.reduce((sum, result) => sum + result.votes, 0) });
  }
  return { revealed: reveals.length, totals };
}

// Whether a reveal lost votes with a removed player (S-09): its counts and abstentions add up to fewer than the ballots
// cast. A removed player's own ballot still counts, so only votes for them are missing (plan, "Critical Implementation
// Details").
export function votesLost(round: Pick<HistoryRevealedRound, "results" | "abstained" | "ballots">): boolean {
  const counted = round.results.reduce((sum, result) => sum + result.votes, 0) + round.abstained;
  return counted < round.ballots;
}
