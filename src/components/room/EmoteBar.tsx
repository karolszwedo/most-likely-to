import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { FieldError } from "@/components/ui/field";
import { sendRoomAction } from "@/components/room/room-actions";
import { EMOTE_COOLDOWN_MS, EMOTES, type EmoteId } from "@/lib/rooms/emotes";
import { cn } from "@/lib/utils";

// The dev previews only (/dev/room-states, /dev/room-window): the starting state of the bar; the real page never sets
// it. A tap on a preview's bar sends nothing.
export interface EmoteBarPreview {
  // The bar resting after a tap.
  cooling?: boolean;
  // The text of a refused tap.
  error?: string | null;
}

const LABEL = "Emotki";

// Where the bar stands (Karol's pick of 2026-10-26 on the screenshots): below lg fixed to the window's bottom, on the
// page's background, its slot in the column keeping the view's end clear of it; from lg under the view, where the
// host's bar is the one stuck to the bottom (HostActions); from xl (1280 px, where the widest room column leaves a
// margin) upright at the window's right edge, always in view. slot: the bar's place in the column; bar: the bar itself;
// line: the label with the buttons, and the buttons.
const IN_WINDOW = {
  slot: "h-18 lg:h-auto lg:border-t lg:pt-4 xl:h-0 xl:border-t-0 xl:pt-0",
  bar: cn(
    "bg-background fixed inset-x-0 bottom-0 z-10 border-t px-4 py-3",
    "lg:static lg:border-t-0 lg:bg-transparent lg:p-0",
    "xl:bg-card xl:fixed xl:inset-x-auto xl:top-1/2 xl:right-4 xl:bottom-auto xl:max-w-40 xl:-translate-y-1/2",
    "xl:rounded-xl xl:border xl:p-2",
  ),
  line: "xl:flex-col",
};
// /dev/room-states: under the view at every width, inside the screen's frame.
const IN_FRAME = { slot: "border-t pt-4", bar: "", line: "" };

interface Props {
  roomId: string;
  // Unique ids when /dev/room-states renders several screens on one page; "" on the real page.
  idPrefix: string;
  // /dev/room-states, several screens on one page: the bar stays inside the screen's frame.
  inFrame: boolean;
  preview?: EmoteBarPreview;
}

// "Emotki" on every screen of the room (S-16, PRD FR-023): any player, the host and a latecomer let in too, sends one
// of the six emotes (src/lib/rooms/emotes.ts) to the whole room with one tap; everyone sees it for a moment with the
// player's nick (EmoteBubbles), the player too, from the room's players' channel. After a tap every button rests for
// EMOTE_COOLDOWN_MS from the tap, whatever the answer, and looks it, still focusable (aria-disabled), so the keyboard's
// place is not lost; a tap while resting sends nothing. A refusal says its short text under the bar. No heading, so
// the focus after the host's move still goes to the view's title; nothing here waits for anyone or holds up the game.
export default function EmoteBar({ roomId, idPrefix, inFrame, preview }: Props) {
  const [cooling, setCooling] = useState(preview?.cooling ?? false);
  const [error, setError] = useState<string | null>(preview?.error ?? null);
  const timer = useRef<number | undefined>(undefined);
  const labelId = `${idPrefix}emotes-label`;
  const errorId = `${idPrefix}emotes-error`;

  useEffect(
    () => () => {
      window.clearTimeout(timer.current);
    },
    [],
  );

  async function tap(emote: EmoteId) {
    if (cooling) return;
    setCooling(true);
    setError(null);
    timer.current = window.setTimeout(() => {
      setCooling(false);
    }, EMOTE_COOLDOWN_MS);
    if (preview) return;
    const outcome = await sendRoomAction(roomId, "emote", { emote });
    if (!outcome.ok) setError(outcome.message);
  }

  const { slot, bar, line } = inFrame ? IN_FRAME : IN_WINDOW;
  return (
    <div className={slot}>
      <div className={bar}>
        {/* As wide as a phone's column while the bar spans the window's width. */}
        <div className="mx-auto flex max-w-lg flex-col gap-2 lg:max-w-none">
          <div role="group" aria-labelledby={labelId} className={cn("flex items-center gap-3", line)}>
            {/* Below lg only for a screen reader: six 44 px buttons and the label do not fit a 360 px phone's row. */}
            <p id={labelId} className="sr-only text-sm font-medium lg:not-sr-only">
              {LABEL}
            </p>
            <div className={cn("flex flex-1 flex-wrap justify-between gap-2 lg:flex-none lg:justify-start", line)}>
              {EMOTES.map(({ id, char, label }) => (
                <Button
                  key={id}
                  type="button"
                  variant="outline"
                  size="icon"
                  aria-label={label}
                  aria-disabled={cooling || undefined}
                  aria-describedby={error ? errorId : undefined}
                  className="size-11 text-2xl aria-disabled:cursor-default aria-disabled:opacity-50"
                  onClick={() => {
                    void tap(id);
                  }}
                >
                  <span aria-hidden="true">{char}</span>
                </Button>
              ))}
            </div>
          </div>
          {error && <FieldError id={errorId}>{error}</FieldError>}
        </div>
      </div>
    </div>
  );
}
