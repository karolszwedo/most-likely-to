import { useEffect, useRef, useState } from "react";
import { Check, X } from "lucide-react";
import { ServerError } from "@/components/auth/ServerError";
import { Spinner } from "@/components/ui/spinner";
import { COLOR_NAMES, SLICE_DOTS } from "@/components/room/chart-colors";
import type { ActionOutcome } from "@/components/room/room-actions";
import { MAX_PIE_SLICES } from "@/lib/rooms/chart";
import type { LobbyPlayer } from "@/lib/rooms/shared";
import { cn } from "@/lib/utils";

// The dev previews only (/dev/room-states): the palette open, and a pick refused.
export interface ColorPickerPreview {
  open?: boolean;
  error?: string | null;
}

interface UseColorPickerArgs {
  // The player whose screen it is (view.me) and the room's players, the own row among them.
  meNick: string;
  players: readonly LobbyPlayer[];
  idPrefix: string;
  // POST …/color with {color} (src/components/room/RoomScreen.tsx); the player's own colour is only remembered there.
  onColor: (color: number) => Promise<ActionOutcome>;
  // The count of refreshed room states (useRoomState): an accepted pick waits for a state that came after it.
  refreshes: number;
  preview?: ColorPickerPreview;
}

export interface ColorPicker {
  // The player's own colour; null only if the list has no row of theirs, and then nothing shows.
  color: number | null;
  open: boolean;
  paletteId: string;
  // Colours another player of the room has (from the 21st player on, every colour).
  taken: ReadonlySet<number>;
  // The colour on its way, or null.
  sending: number | null;
  error: string | null;
  dotRef: React.RefObject<HTMLButtonElement | null>;
  paletteRef: React.RefObject<HTMLDivElement | null>;
  toggle: () => void;
  close: () => void;
  choose: (color: number) => void;
}

// The player's own colour on the list "Gracze" (S-18, research decisions 1–3; Karol's pick, look A "Kropki pod
// nickiem", 2026-10-31): in the lobby and while a game is in play the player taps their own dot and the game's 20
// colours unfold under their row; a colour another player has is greyed and cannot be picked. A pick goes to the
// database, which refuses a colour someone took a moment before (color_taken): its text shows under the palette, which
// stays open with the refreshed colours. An accepted pick closes the palette once the refreshed list has the colour and
// takes the focus back to the dot. A tap on the player's own colour keeps it: no request, but remembered for the next
// game (review of S-18, F4).
export function useColorPicker({
  meNick,
  players,
  idPrefix,
  onColor,
  refreshes,
  preview,
}: UseColorPickerArgs): ColorPicker {
  const [open, setOpen] = useState(preview?.open ?? false);
  const [sending, setSending] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(preview?.error ?? null);
  // The count of refreshed states when the pick was accepted; null while no accepted pick waits.
  const [acceptedAt, setAcceptedAt] = useState<number | null>(null);
  // The latest count, for the pick's continuation, which runs with the count of the render it started in.
  const refreshesRef = useRef(refreshes);
  useEffect(() => {
    refreshesRef.current = refreshes;
  }, [refreshes]);
  const dotRef = useRef<HTMLButtonElement>(null);
  const paletteRef = useRef<HTMLDivElement>(null);
  // Opened by the player's tap: the keyboard then goes to their own colour (never on a preview's first render).
  const focusOnOpen = useRef(false);
  // Closed after an accepted pick: the keyboard goes back to the dot, which by then has the new colour.
  const focusOnClose = useRef(false);
  useEffect(() => {
    if (open && focusOnOpen.current) {
      focusOnOpen.current = false;
      paletteRef.current?.querySelector<HTMLButtonElement>('button[aria-pressed="true"]')?.focus();
    } else if (!open && focusOnClose.current) {
      focusOnClose.current = false;
      dotRef.current?.focus();
    }
  }, [open]);
  const color = players.find((player) => player.nick === meNick)?.color ?? null;
  const taken = new Set(players.filter((player) => player.nick !== meNick).map((player) => player.color));

  // Adjusting state while rendering (as CohostButton; review of S-18, F1): an accepted pick keeps its spinner until the
  // refreshed list has the colour, so the dot and its name never show the old colour after the pick. A state refreshed
  // after the accepted pick ends it too, even with another colour: the player's other screen picked again. Known limit,
  // as there: a fetch already on its way before the pick landed may show the old colour for a moment, until the next
  // refresh.
  if (acceptedAt !== null && (color === sending || refreshes > acceptedAt)) {
    setAcceptedAt(null);
    setSending(null);
    setOpen(false);
    setError(null);
  }

  function close() {
    focusOnClose.current = false;
    setOpen(false);
    setError(null);
    dotRef.current?.focus();
  }

  function toggle() {
    if (open) {
      close();
      return;
    }
    setError(null);
    focusOnOpen.current = true;
    setOpen(true);
  }

  async function pick(asked: number) {
    if (sending !== null) return;
    if (asked !== color && taken.has(asked)) return;
    setSending(asked);
    setError(null);
    const outcome = await onColor(asked);
    if (outcome.ok) {
      focusOnClose.current = true;
      setAcceptedAt(refreshesRef.current);
      return;
    }
    setSending(null);
    setError(outcome.message);
  }

  return {
    color,
    open,
    paletteId: `${idPrefix}color-palette`,
    taken,
    sending,
    error,
    dotRef,
    paletteRef,
    toggle,
    close,
    choose: (asked) => void pick(asked),
  };
}

// The player's own dot, a button that opens and closes the palette; the other players' dots stay aria-hidden.
export function ColorDotButton({ picker }: { picker: ColorPicker }) {
  const { color, open, paletteId, dotRef, toggle, close } = picker;
  if (color === null) return null;
  return (
    <button
      ref={dotRef}
      type="button"
      aria-expanded={open}
      aria-controls={paletteId}
      aria-label={`Twój kolor: ${COLOR_NAMES[color]}. Zmień kolor`}
      // The colour's number for the E2E specs (the other players' dots carry it too); never its name on the screen.
      data-color={color}
      onClick={toggle}
      // Escape closes the open palette from the dot too, not only from inside it (review of S-18, F6).
      onKeyDown={(e) => {
        if (e.key === "Escape" && open) close();
      }}
      className="hover:bg-accent focus-visible:ring-ring/50 -m-1.5 flex size-7 shrink-0 items-center justify-center rounded-full outline-none focus-visible:ring-3"
    >
      <span
        aria-hidden="true"
        className={cn(
          "ring-muted-foreground ring-offset-background size-3.5 rounded-full ring-1 ring-offset-2",
          SLICE_DOTS[color],
        )}
      />
    </button>
  );
}

// Under the list "Gracze", for every player: where their colour is changed.
export const COLOR_HINT = "Dotknij swojej kropki, żeby zmienić kolor.";

const SWATCH_BASE =
  "focus-visible:ring-ring/50 relative flex items-center outline-none focus-visible:ring-3 aria-disabled:cursor-not-allowed";

function Swatch({ picker, color }: { picker: ColorPicker; color: number }) {
  const { taken, sending, choose } = picker;
  const current = color === picker.color;
  const isTaken = taken.has(color) && !current;
  const busy = sending !== null;
  const name = COLOR_NAMES[color];
  let mark = null;
  if (sending === color) mark = <Spinner aria-hidden="true" className="text-primary-foreground size-4" />;
  else if (current) mark = <Check aria-hidden="true" className="text-primary-foreground size-4" strokeWidth={3} />;
  else if (isTaken) mark = <X aria-hidden="true" className="text-primary-foreground size-4" />;

  return (
    <button
      type="button"
      aria-pressed={current}
      aria-disabled={isTaken || (busy && sending !== color) || undefined}
      aria-label={isTaken ? `${name}, zajęty` : name}
      data-swatch={color}
      onClick={() => {
        choose(color);
      }}
      className={cn(
        SWATCH_BASE,
        "size-10 justify-center rounded-full",
        SLICE_DOTS[color],
        current && "ring-foreground ring-offset-background ring-2 ring-offset-2",
        isTaken && "opacity-25",
      )}
    >
      {mark}
    </button>
  );
}

// The palette under the player's own row: the 20 colours in the order of the pie (five to a row), the player's own
// marked, the others' greyed. Escape closes it, here or on the dot.
export function ColorPalette({ picker }: { picker: ColorPicker }) {
  const { color: own, open, paletteId, taken, error, paletteRef, close } = picker;
  if (!open || own === null) return null;
  const colors = Array.from({ length: MAX_PIE_SLICES }, (_, color) => color);
  const allTaken = colors.every((color) => color === own || taken.has(color));
  return (
    <div
      ref={paletteRef}
      id={paletteId}
      onKeyDown={(e) => {
        if (e.key === "Escape") close();
      }}
      className="flex basis-full flex-col gap-3 pt-1 pb-2"
    >
      {/* No visible name (Karol, 2026-10-31): a screen reader hears the group's name and each colour's. */}
      <div role="group" aria-label="Kolory" className="grid w-fit grid-cols-5 gap-3">
        {colors.map((color) => (
          <Swatch key={color} picker={picker} color={color} />
        ))}
      </div>
      {allTaken && <p className="text-muted-foreground text-sm">Wszystkie kolory są zajęte.</p>}
      <ServerError message={error} />
    </div>
  );
}
