import { SLICE_BORDERS } from "@/components/room/chart-colors";
import { playerColors } from "@/lib/rooms/chart";
import { EMOTES, type EmoteId, type EmoteMessage } from "@/lib/rooms/emotes";
import type { LobbyPlayer } from "@/lib/rooms/shared";
import { cn } from "@/lib/utils";

// An emote on the screen: the message from the room's channel, with a key of this screen's own.
export interface ShownEmote extends EmoteMessage {
  key: number;
}

// Where the bubbles start, next to EmoteBar (Karol's pick of 2026-10-26): below lg above the bar fixed to the window's
// bottom, from lg in the window's corner, from xl left of the bar upright at the window's right edge. In a frame of
// /dev/room-states, in the frame's corner. From there each one rises (Karol's pick of 2026-10-27, "Unoszące się":
// context/changes/emote-visibility/plan.md).
const IN_WINDOW = "fixed right-4 bottom-20 lg:bottom-4 xl:right-20";
const IN_FRAME = "absolute right-4 bottom-4";
// Each bubble starts a step to the left of the one before it, so two rising at once do not cover each other.
const RISE_STEPS = ["", "motion-safe:-translate-x-10", "motion-safe:-translate-x-20"];

const CHARS = new Map<EmoteId, { char: string; label: string }>(
  EMOTES.map(({ id, char, label }) => [id, { char, label }]),
);

interface Props {
  shown: readonly ShownEmote[];
  // The room's players, for each nick's stored colour (playerColors), as on the lists of players.
  players: readonly LobbyPlayer[];
  // /dev/room-states: inside the screen's frame, so several screens on one page keep their bubbles apart; everywhere
  // else over the page, at the window's edge.
  inFrame: boolean;
  // The dev previews: their bubbles stay, so each is held on its way up instead of fading out.
  still?: boolean;
}

// The emotes the room's players sent (S-16, PRD FR-023), each for EMOTE_SHOW_MS (RoomScreen takes it away): a big
// emote and the nick on a bubble outlined in the player's colour for the whole game, at most EMOTE_MAX_SHOWN at once.
// Over the page and never in its way: no pointer events, so a tap goes through to the button under a bubble, and hidden
// from a screen reader, which hears the newest one as "<nick>: <emote's name>" instead. A bubble rises from the corner
// about 40% of the window's height and fades out within EMOTE_SHOW_MS (--animate-emote-rise in src/styles/global.css)
// only when the player's system allows motion; with reduced motion the bubbles stand stacked in the corner, the newest
// at the bottom.
export default function EmoteBubbles({ shown, players, inFrame, still = false }: Props) {
  const colors = playerColors(players);
  const newest = shown.at(-1);
  const newestLabel = newest === undefined ? undefined : CHARS.get(newest.emote)?.label;
  return (
    <>
      <p aria-live="polite" className="sr-only">
        {newest && newestLabel ? `${newest.nick}: ${newestLabel}` : ""}
      </p>
      <div
        aria-hidden="true"
        className={cn("pointer-events-none z-20 flex flex-col items-end gap-2", inFrame ? IN_FRAME : IN_WINDOW)}
      >
        {shown.map(({ key, nick, emote }, index) => {
          const color = colors.get(nick);
          return (
            <div
              key={key}
              className={cn(
                "bg-secondary text-secondary-foreground flex max-w-full items-center gap-2 rounded-full border-2 px-3 py-1.5 shadow-lg lg:gap-2.5 lg:px-4 lg:py-2",
                "motion-safe:animate-emote-rise motion-safe:absolute motion-safe:right-0 motion-safe:bottom-0 motion-safe:w-max motion-safe:max-w-none",
                color !== undefined && SLICE_BORDERS[color],
                RISE_STEPS[key % RISE_STEPS.length],
              )}
              // A preview holds each bubble at its own height, the newest lowest, as if they had come one after another.
              style={
                still
                  ? {
                      animationDelay: `${String(-0.4 - (shown.length - 1 - index) * 0.35)}s`,
                      animationPlayState: "paused",
                    }
                  : undefined
              }
            >
              <span className="text-2xl leading-none">{CHARS.get(emote)?.char}</span>
              <span className="min-w-0 text-sm font-semibold break-words lg:text-base">{nick}</span>
            </div>
          );
        })}
      </div>
    </>
  );
}
