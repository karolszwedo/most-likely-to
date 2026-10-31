import { Badge } from "@/components/ui/badge";
import { SLICE_DOTS, SLICE_FILLS } from "@/components/room/chart-colors";
import { playerColors, slicePath, slicesInOrder } from "@/lib/rooms/chart";
import type { GameSummary as Summary, RoomView, RoundResult } from "@/lib/rooms/shared";
import { plural } from "@/lib/rooms/summary";
import { cn } from "@/lib/utils";

interface Props {
  view: RoomView;
  summary: Summary;
  // Unique ids when /dev/room-states renders several screens on one page; "" on the real page.
  idPrefix: string;
  // From lg the end of the evening is two halves (endInHalves): the counts and the nicks with none on the left, the
  // chart on the right across the left's rows.
  halves: boolean;
}

// The summary on the end of the evening (S-15, PRD FR-022), each thing in its own place (Karol's choice "Dwie połowy"
// after the screenshots, 2026-10-25): how many questions the game revealed and how many votes it had in all, who got
// the most votes (the Worker's pick, src/lib/rooms/summary.ts; never numbered, no points) as a pie with one grey slice
// for everyone else, and who could get a vote and got none. The chart only when someone got a vote, the nicks with none
// only when there are some. Only what the reveals already showed the whole room, never who voted for whom; the rest is
// one number, never a nick. A fragment: its parts are items of the end's grid, between the title and the next step.
export default function GameSummary({ view, summary, idPrefix, halves }: Props) {
  const { revealed, votes, top, unvoted } = summary;
  const rest = votes - top.reduce((sum, entry) => sum + entry.votes, 0);
  // The top's players in their stored colours (playerColors), as in the reveals.
  const colors = playerColors(view.players);
  const topColors = top.map((entry) => colors.get(entry.nick));
  return (
    <>
      <dl className={cn("grid w-full grid-cols-2 gap-4 text-left", halves && "lg:col-start-1")}>
        <Count label="Odsłoniętych pytań:" value={revealed} />
        <Count label="Ilość głosów łącznie:" value={votes} />
      </dl>
      {top.length > 0 && (
        <section
          aria-labelledby={`${idPrefix}summary-top-heading`}
          className={cn(
            "bg-card flex w-full flex-col gap-5 rounded-md border p-5 text-left",
            halves && "lg:col-start-2 lg:row-span-4 lg:row-start-1",
          )}
        >
          <h2 id={`${idPrefix}summary-top-heading`} className="text-muted-foreground text-sm font-medium">
            Najwięcej głosów dziś
          </h2>
          <SummaryPie top={top} rest={rest} topColors={topColors} />
          <ul className="flex flex-col gap-2 self-center">
            {top.map(({ nick, votes: count }, index) => {
              const color = topColors[index];
              return (
                <li key={nick} className="flex flex-wrap items-center gap-x-2 gap-y-1">
                  <span
                    aria-hidden="true"
                    className={cn("size-3 shrink-0 rounded-full", color !== undefined && SLICE_DOTS[color])}
                  />
                  <span className="min-w-0 font-semibold wrap-anywhere">{nick}</span>
                  {nick === view.me && <Badge variant="outline">ty</Badge>}
                  <span className="text-muted-foreground tabular-nums">
                    — {count} {plural(count, "głos", "głosy", "głosów")}
                  </span>
                </li>
              );
            })}
            {rest > 0 && (
              <li className="text-muted-foreground flex items-center gap-2">
                <span aria-hidden="true" className="bg-muted-foreground size-3 shrink-0 rounded-full" />
                <span className="tabular-nums">
                  pozostali — {rest} {plural(rest, "głos", "głosy", "głosów")}
                </span>
              </li>
            )}
          </ul>
        </section>
      )}
      {unvoted.length > 0 && (
        <section
          aria-labelledby={`${idPrefix}summary-unvoted-heading`}
          className={cn(
            "bg-card flex w-full flex-col gap-3 rounded-md border p-5 text-left",
            halves && "lg:col-start-1",
          )}
        >
          <h2 id={`${idPrefix}summary-unvoted-heading`} className="text-muted-foreground text-sm font-medium">
            Nikt dziś nie głosował na
          </h2>
          <ul className="flex flex-wrap gap-2">
            {unvoted.map((nick) => (
              <li
                key={nick}
                className="bg-muted flex min-w-0 items-center gap-1.5 rounded-full px-3 py-1 wrap-anywhere"
              >
                {nick}
                {nick === view.me && <Badge variant="outline">ty</Badge>}
              </li>
            ))}
          </ul>
        </section>
      )}
    </>
  );
}

// One count of the game: a term and its number.
function Count({ label, value }: { label: string; value: number }) {
  return (
    <div className="bg-card flex flex-col gap-2 rounded-md border p-4 lg:p-5">
      <dt className="text-muted-foreground text-sm">{label}</dt>
      <dd className="text-4xl font-semibold tabular-nums lg:text-5xl">{value}</dd>
    </div>
  );
}

// The pie for the eye only (the list under it holds the data): the top's slices in their order, each in its player's
// stored colour (topColors, as in the reveals), then one grey slice for everyone else, each edged in the card's colour;
// a top with every vote is a plain circle. Every player of the top has votes, so no slice of the top drops out and a
// slice's index is its player's position in the top, the same as in topColors.
function SummaryPie({
  top,
  rest,
  topColors,
}: {
  top: RoundResult[];
  rest: number;
  topColors: readonly (number | undefined)[];
}) {
  const slices = slicesInOrder([...top, { nick: "", votes: rest }]);
  return (
    <svg viewBox="0 0 100 100" aria-hidden="true" className="mx-auto size-56 lg:size-72">
      {slices.map((slice, index) => {
        const color = topColors[index];
        const topFill = color === undefined ? undefined : SLICE_FILLS[color];
        const fill = index < top.length ? topFill : "fill-muted-foreground";
        const path = slicePath(slice, 50, 48);
        return path === null ? (
          <circle key={index} cx="50" cy="50" r="48" className={fill} />
        ) : (
          <path key={index} d={path} strokeLinejoin="round" className={cn(fill, "stroke-card stroke-1")} />
        );
      })}
    </svg>
  );
}
