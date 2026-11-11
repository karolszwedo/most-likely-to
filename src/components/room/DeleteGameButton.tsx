import { useEffect, useRef, useState } from "react";
import { Trash2, TriangleAlert } from "lucide-react";
import { ServerError } from "@/components/auth/ServerError";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import type { ActionOutcome } from "@/components/room/room-actions";
import { cn } from "@/lib/utils";

// The dev previews only (/dev/room-states): the row asking, on its way or refused.
export interface DeletionPreview {
  confirming?: boolean;
  sending?: boolean;
  error?: string | null;
}

// While the deletion is on its way "Usuń grę" waits, still focusable (aria-disabled, not disabled), as
// RemovePlayerButton's.
const BUSY = "aria-disabled:cursor-default aria-disabled:opacity-50";

interface Props {
  // The room's id: HostGames finds the next row's "Usuń" by it after a deletion.
  gameId: string;
  // The row's date as the list shows it, so the button's name says which game it deletes.
  date: string;
  // HostGames sends POST …/delete (sendRoomAction) and, accepted, takes the row away with this button.
  onDelete: () => Promise<ActionOutcome>;
  preview?: DeletionPreview;
}

// "Usuń" in a game's row of the host's list of own games (S-13, skasowanie gry; Karol's pick "C2", 2026-11-11: the
// look of "Nowa gra"'s question before it closes a room with guests, NewGameForm). A first press hides "Usuń" and
// opens, under the row, the question "Na pewno usunąć tę grę?" with what goes and what stays (decision 7), then
// "Usuń grę", which takes the focus (as NewGameForm's confirming button), and "Anuluj", which closes the question and
// gives the focus back to "Usuń". On its way "Usuń grę" spins, "Usuń" stays hidden and "Anuluj" is not offered.
// Accepted, the row goes away with this button (HostGames). A refusal closes the question, shows its code's text under
// the row and gives the focus back to "Usuń".
export function DeleteGameButton({ gameId, date, onDelete, preview }: Props) {
  const [confirming, setConfirming] = useState(preview?.confirming === true || preview?.sending === true);
  const [busy, setBusy] = useState(preview?.sending ?? false);
  const [error, setError] = useState<string | null>(preview?.error ?? null);
  const deleteRef = useRef<HTMLButtonElement>(null);
  const confirmRef = useRef<HTMLButtonElement>(null);
  // Where the focus goes once the row shows its new face: "Usuń grę" when the question opens, "Usuń" when it closes.
  // Never on the first render, so a preview with the question open takes no focus.
  const focusNext = useRef<"confirm" | "delete" | null>(null);

  useEffect(() => {
    const target = focusNext.current;
    if (target === null) return;
    focusNext.current = null;
    (target === "confirm" ? confirmRef.current : deleteRef.current)?.focus();
  });

  function ask() {
    setError(null);
    setConfirming(true);
    focusNext.current = "confirm";
  }

  function cancel() {
    if (busy) return;
    setConfirming(false);
    focusNext.current = "delete";
  }

  async function confirm() {
    if (busy) return;
    setBusy(true);
    const outcome = await onDelete();
    // Accepted: the button waits on, spinning, until HostGames takes the row away.
    if (outcome.ok) return;
    setBusy(false);
    setConfirming(false);
    setError(outcome.message);
    focusNext.current = "delete";
  }

  return (
    <>
      {!confirming && (
        <Button
          ref={deleteRef}
          type="button"
          size="sm"
          variant="outline"
          // The visible word first, then which game: two rows never share a name unless they share the minute.
          aria-label={`Usuń grę: ${date}`}
          data-delete-game={gameId}
          onClick={ask}
        >
          Usuń
        </Button>
      )}
      {confirming && (
        <div className="flex basis-full flex-col gap-3">
          <Alert>
            <TriangleAlert />
            {/* The title may wrap: on a phone a one-line clamp would cut the question off. */}
            <AlertTitle className="line-clamp-none">Na pewno usunąć tę grę?</AlertTitle>
            <AlertDescription>
              Znikną nicki, wyniki i pytania tej gry. Zostaną tylko anonimowe liczniki pytań (ile razy padły,
              pominięcia, kciuki), bez nicków i bez tej gry.
            </AlertDescription>
          </Alert>
          <Button
            ref={confirmRef}
            type="button"
            variant="destructive"
            aria-disabled={busy || undefined}
            className={cn("w-full", BUSY)}
            onClick={() => void confirm()}
          >
            {busy ? (
              <>
                <Spinner aria-hidden="true" />
                Usuwam…
              </>
            ) : (
              <>
                <Trash2 className="size-4" />
                Usuń grę
              </>
            )}
          </Button>
          {!busy && (
            <Button type="button" variant="ghost" className="w-full" onClick={cancel}>
              Anuluj
            </Button>
          )}
        </div>
      )}
      {error && (
        <div className="basis-full">
          <ServerError message={error} />
        </div>
      )}
    </>
  );
}
