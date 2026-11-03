import { useEffect, useRef, useState } from "react";
import { X } from "lucide-react";
import { ServerError } from "@/components/auth/ServerError";
import { Button, buttonVariants } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import type { ActionOutcome } from "@/components/room/room-actions";
import type { LobbyPlayer, RoomView } from "@/lib/rooms/shared";
import { cn } from "@/lib/utils";

// The dev previews only (/dev/room-states): one row asking, on its way or refused.
export interface RemovalPreview {
  nick: string;
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
  // A leader removes the guest: POST …/remove (src/components/room/RoomScreen.tsx).
  onRemove: (nick: string) => Promise<ActionOutcome>;
  // How many refreshed states the screen has had (useRoomState), changed or not.
  refreshes: number;
  preview?: RemovalPreview;
}

// "Usuń" in a guest's row of the list "Gracze" for a leader (S-09, research decisions 2 and 3; Karol's pick "Pigułka",
// 2026-11-02): a quiet pill "usuń" next to the co-host switch. A first press asks "Na pewno usunąć <nick>?" in the same
// button, with "Anuluj" next to it, on a line of its own under the row (as HostActions asks); the second press sends.
// Accepted, the button waits until the refreshed list has no such row (the spinner), so it never comes back for a
// moment and a second press never meets player_unknown (review of S-07 and S-18, F1). A refusal shows its code's text
// under the row.
export function RemovePlayerButton({ player, onRemove, refreshes, preview }: Props) {
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
  // press still has the row (the guest came back through the new link under the same nick before this screen saw the
  // removal), so the button is free again.
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

  let label: React.ReactNode = (
    <>
      <X className="size-3.5" />
      usuń
    </>
  );
  if (busy) {
    label = (
      <>
        <Spinner aria-hidden="true" className="size-3.5" />
        Usuwam…
      </>
    );
  } else if (confirming) {
    label = `Na pewno usunąć ${nick}?`;
  }

  return (
    <>
      {/* Asking, the pill's place in the row stays taken by an empty one of its size: without it the co-host switch
          would slide under the pointer, and the second click of a double click would toggle the role (review of S-09,
          F1). */}
      {asking && (
        <span
          aria-hidden="true"
          className={cn(
            buttonVariants({ variant: "outline", size: "sm" }),
            "invisible h-7 gap-1 rounded-full px-2.5 text-xs",
          )}
        >
          <X className="size-3.5" />
          usuń
        </span>
      )}
      {/* Always the same element, so the focus stays on the button while it turns into the question; asking, the
          wrapper takes a line of its own under the row. */}
      <div className={asking ? "flex basis-full flex-wrap items-center justify-end gap-2" : "contents"}>
        <Button
          ref={buttonRef}
          type="button"
          size="sm"
          variant={asking ? "destructive" : "outline"}
          aria-label={asking ? undefined : `Usuń: ${nick}`}
          aria-disabled={busy || undefined}
          // RoomScreen finds the next row's button by it after a removal.
          data-remove={nick}
          className={cn(
            BUSY,
            asking
              ? "h-auto min-h-8 py-1.5 whitespace-normal"
              : "text-muted-foreground h-7 gap-1 rounded-full px-2.5 text-xs",
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
