import { useEffect, useRef, useState } from "react";
import { UserX, X } from "lucide-react";
import { ServerError } from "@/components/auth/ServerError";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import type { ActionOutcome } from "@/components/room/room-actions";
import type { LobbyPlayer, RoomView } from "@/lib/rooms/shared";
import { cn } from "@/lib/utils";

// TEMPORARY until Karol picks the look on the screenshots (context/changes/remove-player-new-link/plan.md, 3.5): "icon"
// a quiet icon at the row's end, "pill" a pill "usuń" next to the co-host switch, "mode" a switch "Usuń gracza" above
// the list that shows a red pill on each row it may take. The two looks not picked go away with their previews.
export type RemoveLook = "icon" | "pill" | "mode";
export const DEFAULT_REMOVE_LOOK: RemoveLook = "icon";

// The dev previews only (/dev/room-states): the look, the list's switch of "mode" on, and one row asking, on its way
// or refused.
export interface RemovalPreview {
  look?: RemoveLook;
  modeOn?: boolean;
  nick?: string;
  confirming?: boolean;
  sending?: boolean;
  error?: string | null;
}

// Whom the person may remove from the list "Gracze" (S-09, research decision 2): a leader removes a guest, never the
// host nor themselves; a co-host only a guest with no role. The database decides it again (cohost_protected).
export function mayRemove(view: RoomView, player: LobbyPlayer): boolean {
  if (!view.leader || player.host || player.nick === view.me) return false;
  return view.role === "host" || !player.cohost;
}

// While the press is on its way the button waits, still focusable (aria-disabled, not disabled), as CohostButton's.
const BUSY = "aria-disabled:cursor-default aria-disabled:opacity-50";

interface Props {
  player: LobbyPlayer;
  look: RemoveLook;
  // A leader removes the guest: POST …/remove (src/components/room/RoomScreen.tsx).
  onRemove: (nick: string) => Promise<ActionOutcome>;
  // How many refreshed states the screen has had (useRoomState), changed or not.
  refreshes: number;
  preview?: RemovalPreview;
}

// "Usuń" in a guest's row of the list "Gracze" for a leader (S-09, research decisions 2 and 3): a first press asks "Na
// pewno usunąć <nick>?" in the same button, with "Anuluj" next to it, on a line of its own under the row (as
// HostActions asks); the second press sends. Accepted, the button waits until the refreshed list has no such row (the
// spinner), so it never comes back for a moment and a second press never meets player_unknown (review of S-07 and
// S-18, F1). A refusal shows its code's text under the row.
export function RemovePlayerButton({ player, look, onRemove, refreshes, preview }: Props) {
  const { nick } = player;
  const own = preview?.nick === nick ? preview : undefined;
  const [confirming, setConfirming] = useState(own?.confirming ?? false);
  const [busy, setBusy] = useState(own?.sending ?? false);
  const [error, setError] = useState<string | null>(own?.error ?? null);
  // The count of refreshed states when the press was accepted; null while no accepted press waits.
  const [acceptedAt, setAcceptedAt] = useState<number | null>(null);
  const refreshesRef = useRef(refreshes);
  useEffect(() => {
    refreshesRef.current = refreshes;
  }, [refreshes]);
  const buttonRef = useRef<HTMLButtonElement>(null);
  // Adjusting state while rendering (react.dev, "You Might Not Need an Effect"): a state refreshed after the accepted
  // press still has the row (another leader's screen let the guest back in through the new link with the same nick), so
  // the button is free again.
  if (busy && acceptedAt !== null && refreshes > acceptedAt) {
    setBusy(false);
    setConfirming(false);
    setAcceptedAt(null);
  }
  const asking = confirming || busy;

  async function press() {
    if (busy) return;
    if (!confirming) {
      setError(null);
      setConfirming(true);
      return;
    }
    setBusy(true);
    const outcome = await onRemove(nick);
    if (outcome.ok) {
      setAcceptedAt(refreshesRef.current);
      return;
    }
    setBusy(false);
    setConfirming(false);
    setError(outcome.message);
  }

  function cancel() {
    setConfirming(false);
    buttonRef.current?.focus();
  }

  let label: React.ReactNode;
  if (busy) {
    label = (
      <>
        <Spinner aria-hidden="true" className="size-3.5" />
        Usuwam…
      </>
    );
  } else if (confirming) {
    label = `Na pewno usunąć ${nick}?`;
  } else if (look === "icon") {
    label = <UserX className="size-4" />;
  } else {
    label = (
      <>
        <X className="size-3.5" />
        usuń
      </>
    );
  }

  return (
    <>
      {/* Always the same element, so the focus stays on the button while it turns into the question; asking, the
          wrapper takes a line of its own under the row. */}
      <div className={asking ? "flex basis-full flex-wrap items-center justify-end gap-2" : "contents"}>
        <Button
          ref={buttonRef}
          type="button"
          size="sm"
          variant={asking ? "destructive" : look === "icon" ? "ghost" : "outline"}
          aria-label={asking ? undefined : `Usuń: ${nick}`}
          // RoomScreen finds the next row's button by it after a removal.
          data-remove={nick}
          aria-disabled={busy || undefined}
          className={cn(
            BUSY,
            asking && "h-auto min-h-8 py-1.5 whitespace-normal",
            !asking && look === "icon" && "text-muted-foreground size-7 p-0",
            !asking && look === "pill" && "text-muted-foreground h-7 gap-1 rounded-full px-2.5 text-xs",
            !asking && look === "mode" && "text-destructive h-7 gap-1 rounded-full px-2.5 text-xs",
          )}
          onClick={() => void press()}
        >
          {label}
        </Button>
        {confirming && !busy && (
          <Button type="button" size="sm" variant="ghost" onClick={cancel}>
            Anuluj
          </Button>
        )}
      </div>
      {/* A screen reader may not read a focused button again when its name changes; this says the question. */}
      <span aria-live="polite" className="sr-only">
        {confirming && !busy ? `Na pewno usunąć ${nick}?` : ""}
      </span>
      {error && (
        <div className="basis-full">
          <ServerError message={error} />
        </div>
      )}
    </>
  );
}

interface ModeSwitchProps {
  on: boolean;
  onChange: (on: boolean) => void;
}

// "mode" only: above the list "Gracze", next to its heading, for a leader who may remove someone. On, each row the
// leader may take gets its red pill; "Gotowe" hides them again.
export function RemoveModeSwitch({ on, onChange }: ModeSwitchProps) {
  return (
    <Button
      type="button"
      size="sm"
      variant="ghost"
      aria-pressed={on}
      className="text-muted-foreground h-7 px-2 text-xs"
      onClick={() => {
        onChange(!on);
      }}
    >
      {on ? "Gotowe" : "Usuń gracza"}
    </Button>
  );
}
