import { Badge } from "@/components/ui/badge";
import { SLICE_DOTS, SLICE_FILLS } from "@/components/room/chart-colors";
import { SURFACE } from "@/components/room/surfaces";
import { slicePath, slicesInOrder } from "@/lib/rooms/chart";
import { useT } from "@/lib/i18n/react";
import type { GameSummary as Summary, RoundResult } from "@/lib/rooms/shared";
import { cn } from "@/lib/utils";

// Where the summary stands (Karol's pick N2 of 2026-11-21): on the end of the evening, under the screen's title, the two
// cards say "dziś" and their headings are h2; on the game's history (S-26, GameHistory), under its heading
// "Podsumowanie wieczoru", "tego wieczoru" and h3. The headings' texts are the dictionary's, under the same place
// (t.round.summary.headings).
const HEADINGS = {
  end: { as: "h2" },
  history: { as: "h3" },
} as const;

interface Props {
  // Each player's stored colour (playerColors of the room's or the history's players), as in the reveals.
  colors: ReadonlyMap<string, number>;
  // The screen's own player, whose nick has the badge "ty"; the history's is its host.
  me: string | null;
  summary: Summary;
  place: keyof typeof HEADINGS;
  // Unique ids when /dev/room-states renders several screens on one page; "" on the real page.
  idPrefix: string;
  // From lg the end of the evening is two halves (endInHalves), and so is the game's history (historyInHalves): the
  // counts and the nicks with none on the left, the chart on the right across the left's first four rows. The history
  // has at most three items on its left, so a row the chart spans stays empty and takes the chart's extra height, and
  // the left column does not spread out.
  halves: boolean;
}

// The summary on the end of the evening (S-15, PRD FR-022), each thing in its own place (Karol's choice "Dwie połowy"
// after the screenshots, 2026-10-25): how many questions the game revealed and how many votes it had in all, who got
// the most votes (the Worker's pick, src/lib/rooms/summary.ts; never numbered, no points) as a pie with one grey slice
// for everyone else, and who could get a vote and got none. The chart only when someone got a vote, the nicks with none
// only when there are some. Only what the reveals already showed the whole room, never who voted for whom; the rest is
// one number, never a nick. A fragment: its parts are items of the end's grid, between the title and the next step,
// and of the history's, under its title (S-26, GameHistory).
export default function GameSummary({ colors, me, summary, place, idPrefix, halves }: Props) {
  const t = useT();
  const { revealed, votes, top, unvoted } = summary;
  const rest = votes - top.reduce((sum, entry) => sum + entry.votes, 0);
  const { as: Heading } = HEADINGS[place];
  const { top: topHeading, unvoted: unvotedHeading } = t.round.summary.headings[place];
  // The top's players in their stored colours, as in the reveals.
  const topColors = top.map((entry) => colors.get(entry.nick));
  return (
    <>
      <dl className={cn("grid w-full grid-cols-2 gap-4 text-left", halves && "lg:col-start-1")}>
        <Count label={t.round.summary.revealed} value={revealed} />
        <Count label={t.round.summary.votesTotal} value={votes} />
      </dl>
      {top.length > 0 && (
        <section
          aria-labelledby={`${idPrefix}summary-top-heading`}
          className={cn(
            SURFACE,
            "flex w-full flex-col gap-5 p-5 text-left",
            halves && "lg:col-start-2 lg:row-span-4 lg:row-start-1",
          )}
        >
          <Heading id={`${idPrefix}summary-top-heading`} className="text-muted-foreground text-sm font-medium">
            {topHeading}
          </Heading>
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
                  {nick === me && <Badge variant="outline">{t.round.badges.me}</Badge>}
                  <span className="text-muted-foreground tabular-nums">{t.round.summary.topVotes(count)}</span>
                </li>
              );
            })}
            {rest > 0 && (
              <li className="text-muted-foreground flex items-center gap-2">
                <span aria-hidden="true" className="bg-muted-foreground size-3 shrink-0 rounded-full" />
                <span className="tabular-nums">{t.round.summary.rest(rest)}</span>
              </li>
            )}
          </ul>
        </section>
      )}
      {unvoted.length > 0 && (
        <section
          aria-labelledby={`${idPrefix}summary-unvoted-heading`}
          className={cn(SURFACE, "flex w-full flex-col gap-3 p-5 text-left", halves && "lg:col-start-1")}
        >
          <Heading id={`${idPrefix}summary-unvoted-heading`} className="text-muted-foreground text-sm font-medium">
            {unvotedHeading}
          </Heading>
          <ul className="flex flex-wrap gap-2">
            {unvoted.map((nick) => (
              <li
                key={nick}
                className="bg-muted flex min-w-0 items-center gap-1.5 rounded-full px-3 py-1 wrap-anywhere"
              >
                {nick}
                {nick === me && <Badge variant="outline">{t.round.badges.me}</Badge>}
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
    <div className={cn(SURFACE, "flex flex-col gap-2 p-4 lg:p-5")}>
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
