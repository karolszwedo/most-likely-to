import type { GameSummary, GameTotals, RoundResult } from "@/lib/rooms/shared";

// The summary of a closed game (S-15, PRD FR-022). Types from shared.ts only, no other import: the Worker calls
// gameSummary (src/lib/rooms/server.ts, roomView), and nothing here may pull server code into the browser
// (context/foundation/lessons.md, "Pytania gry tylko po stronie serwera"). The plural of its counts ("1 głos", "2
// głosy", "5 głosów") is the dictionary's (plural in src/lib/i18n, S-27).

// At most this many people under "Najwięcej głosów dziś", unless the top tie alone is more.
const TOP_LIMIT = 3;

// The rule of context/archive/2026-10-25-game-summary/plan.md ("Implementation Approach", Karol's decisions of
// 2026-10-25), from the sums of the game's reveals only (a skipped round and one cut short add nothing, so they are not
// in totals). top: the players with a sum above 0, grouped by sum, highest first; the highest group always whole, each
// next one only if the whole group still fits in TOP_LIMIT people, and the first that does not fit ends the list; a
// group in seat order (the order of totals). unvoted: the players with a sum of 0, in seat order. Only a player with a
// result in at least one reveal is in totals, so a latecomer let in after the last one is in neither list. votes: all
// the sums together, "Ilość głosów łącznie" and the whole of the chart (Karol's decisions of 2026-10-25 after the
// screenshots).
export function gameSummary({ revealed, totals }: GameTotals): GameSummary {
  const sums = [...new Set(totals.map(({ votes }) => votes).filter((votes) => votes > 0))].sort((a, b) => b - a);
  const top: RoundResult[] = [];
  for (const sum of sums) {
    const group = totals.filter(({ votes }) => votes === sum);
    if (top.length > 0 && top.length + group.length > TOP_LIMIT) break;
    top.push(...group.map(({ nick, votes }) => ({ nick, votes })));
  }
  const unvoted = totals.filter(({ votes }) => votes === 0).map(({ nick }) => nick);
  const votes = totals.reduce((sum, total) => sum + total.votes, 0);
  return { revealed, votes, top, unvoted };
}
