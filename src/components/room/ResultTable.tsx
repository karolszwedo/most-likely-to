import { Badge } from "@/components/ui/badge";
import { SLICE_DOTS, SLICE_FILLS } from "@/components/room/chart-colors";
import { MOTION_BAR, MOTION_PIE, MOTION_TABLE } from "@/components/room/reveal-motion";
import { TABLE_FRAME } from "@/components/room/surfaces";
import { pieSlices, resultBars, slicePath } from "@/lib/rooms/chart";
import type { RoundResult } from "@/lib/rooms/shared";
import { cn } from "@/lib/utils";

// The two parts of a reveal's result, shared by the reveal in the room (RoundReveal) and the game's history (S-26,
// GameHistory; context/changes/game-history-details/plan.md, Faza 3 #2), so both draw the same table and the same pie.
// Only counts per person, never who voted for whom. Each player has their stored colour (playerColors): the slice of
// the pie and the dot in the row. animate: the reveal's motion (reveal-motion.ts), only when the result was revealed
// while the room's tab stood (RoomScreen); the history is always a page just opened, so never there.

interface PieProps {
  // Every player of the round with their count, in seat order (the round's results as the database gives them).
  results: readonly RoundResult[];
  colors: ReadonlyMap<string, number>;
  // The colour of the slices' edges, the surface the pie stands on, so neighbours stay apart: the page's background in
  // the room, the card's on a tile of the history (as the summary's pie in GameSummary).
  edge: "stroke-background" | "stroke-card";
  // Its size and place, whole class names only (Tailwind generates just the classes it finds written out).
  className: string;
  animate: boolean;
}

// The pie for the eye only (the table holds the data): slices from 12 o'clock clockwise, each in its player's stored
// colour (playerColors), not from its place in the result, and edged in the surface's colour; one player with every
// vote is a plain circle.
export function ResultPie({ results, colors, edge, className, animate }: PieProps) {
  return (
    <svg viewBox="0 0 100 100" aria-hidden="true" className={cn(className, animate && MOTION_PIE)}>
      {pieSlices(results).map((slice) => {
        const color = colors.get(slice.nick);
        const fill = color === undefined ? undefined : SLICE_FILLS[color];
        const path = slicePath(slice, 50, 48);
        return path === null ? (
          <circle key={slice.nick} cx="50" cy="50" r="48" className={fill} />
        ) : (
          <path key={slice.nick} d={path} strokeLinejoin="round" className={cn(fill, edge, "stroke-2")} />
        );
      })}
    </svg>
  );
}

interface TableProps {
  // Every player of the round with their count, in seat order; the table sorts them as the reveal does (sortResults).
  results: readonly RoundResult[];
  colors: ReadonlyMap<string, number>;
  // The screen's own player, whose row has the badge "ty"; the history's is its host.
  me: string | null;
  // "Paski": a bar behind each nick, as long as its votes relative to the top count.
  bars: boolean;
  animate: boolean;
  // The frame's place in its parent's layout, whole class names only.
  className?: string;
}

// The result's table (PRD FR-009; decision D3: always the counts): every player, most votes first, a tie in seat order,
// zeros dimmed at the bottom (sortResults), the most votes in bold. One card with the game's shadow, its rows with no
// line between them.
export function ResultTable({ results, colors, me, bars, animate, className }: TableProps) {
  const rows = resultBars(results);
  const top = rows[0]?.votes ?? 0;
  return (
    <div className={cn(TABLE_FRAME, className, animate && MOTION_TABLE)}>
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
        <tbody>
          {rows.map((row) => {
            const isTop = top > 0 && row.votes === top;
            const color = colors.get(row.nick);
            return (
              <tr key={row.nick} className={cn(row.votes === 0 && "text-muted-foreground")}>
                <td className="relative px-3 py-2.5">
                  {bars && row.percent > 0 && (
                    // Behind the nick, as long as its votes relative to the top count; low opacity keeps the text
                    // readable on it.
                    <span
                      aria-hidden="true"
                      className={cn(
                        "absolute inset-y-1 left-0 rounded-r-sm",
                        isTop ? "bg-primary/35" : "bg-primary/20",
                        animate && MOTION_BAR,
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
                      {row.nick === me && <Badge variant="outline">ty</Badge>}
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
  );
}
