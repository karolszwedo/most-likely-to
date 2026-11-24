import { useEffect, useRef, useState } from "react";
import { Check, Plus } from "lucide-react";
import { ServerError } from "@/components/auth/ServerError";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import type { ActionOutcome } from "@/components/room/room-actions";
import { useT, useTextState } from "@/lib/i18n/react";
import type { LobbyPlayer } from "@/lib/rooms/shared";
import { cn } from "@/lib/utils";

// The layout of a row of the lists "Gracze" (in the lobby and while a game is in play) and of the vote's options: the
// dot and the nick on the left, the badges and buttons after them. Its look, a tile, comes from surfaces.ts.
export const PLAYER_ROW = "flex items-center gap-3 px-3";

// The row of the list "Gracze" in the host's view: its switch may not fit next to a long nick and the badges, so the
// row wraps and the switch goes under them, still at the row's end. The nick keeps the line's start (mr-auto), the
// badges and the switch its end (ml-auto on the badges, justify-end for a switch alone on its line). The same height
// as a guest's row (min-h-11) with the switch inside it. Next to PLAYER_ROW, which it adjusts.
export const COHOST_ROW = "min-h-11 flex-wrap justify-end gap-y-2 py-1.5";

// Next to a co-host's nick on the lists "Gracze" and in the vote's form, for everyone (S-07); in the host's view of
// "Gracze" the switch stands in its place, pressed it looks the same. Not in the reveal's result nor the summary.
export function CohostBadge() {
  const t = useT();
  return <Badge variant="secondary">{t.room.cohost.badge}</Badge>;
}

// The dev previews only (/dev/room-states): the switch of one guest's row on its way, or refused.
export interface RoleSwitchPreview {
  nick: string;
  sending?: boolean;
  error?: string | null;
}

interface Props {
  player: LobbyPlayer;
  // The hint under the list (the lobby's or the game's), which says what the role gives.
  hintId: string;
  // The host gives the role (true) or takes it back (false): POST …/cohost (src/components/room/RoomScreen.tsx).
  onCohost: (nick: string, cohost: boolean) => Promise<ActionOutcome>;
  // How many refreshed states the screen has had (useRoomState), changed or not.
  refreshes: number;
  preview?: RoleSwitchPreview;
}

// While the press is on its way the switch waits, still focusable (aria-disabled, not disabled), as JoinRequests' and
// HostActions' buttons do, so the keyboard's place is not lost when the press is refused.
const SWITCH_BUSY = "aria-disabled:cursor-default aria-disabled:opacity-50";

// The host's switch next to a guest's nick on the list "Gracze" (research decision 5; Karol's pick "Przełącznik",
// 2026-10-29): a pill pressed or not, "+ współhost" quiet in outline, pressed "✓ współhost" as the badge the others
// see. Its name says the nick, aria-pressed whether the guest has the role. Only the host sees it, never on the host's
// own row; any guest can get the role, a latecomer let in too. A press waits until the refreshed state shows the value
// asked for (the spinner in place of the icon, as in JoinRequests); a refusal shows its code's text under the row.
export function CohostButton({ player, hintId, onCohost, refreshes, preview }: Props) {
  const t = useT();
  const { nick, cohost } = player;
  const own = preview?.nick === nick ? preview : undefined;
  // The value asked for, from the press until the refreshed list shows it or the refusal comes back; null when free.
  const [asked, setAsked] = useState<boolean | null>(own?.sending ? !cohost : null);
  const [error, setError] = useTextState(own?.error ?? null);
  // The count of refreshed states when the press was accepted; null while no accepted press waits.
  const [acceptedAt, setAcceptedAt] = useState<number | null>(null);
  // The latest count, for the press's continuation, which runs with the count of the render it started in.
  const refreshesRef = useRef(refreshes);
  useEffect(() => {
    refreshesRef.current = refreshes;
  }, [refreshes]);
  // Adjusting state while rendering (react.dev, "You Might Not Need an Effect"): the refreshed list has the value asked
  // for, so the switch is free again, in its new look. A state refreshed after the accepted press frees it too, even
  // with the other value: the host's other screen changed the role back before this one saw the press (review of S-07,
  // F1; as RequestRow in JoinRequests). Known limit, as there: a fetch already on its way before the press landed may
  // show the old value for a moment, until the next refresh.
  if (asked !== null && (asked === cohost || (acceptedAt !== null && refreshes > acceptedAt))) {
    setAsked(null);
    setAcceptedAt(null);
  }
  const busy = asked !== null;

  async function toggle() {
    if (busy) return;
    const next = !cohost;
    setAsked(next);
    setError(null);
    const outcome = await onCohost(nick, next);
    if (outcome.ok) {
      setAcceptedAt(refreshesRef.current);
      return;
    }
    setAsked(null);
    setError(outcome.message);
  }

  let icon = <Plus className="size-3.5" />;
  if (busy) icon = <Spinner aria-hidden="true" className="size-3.5" />;
  else if (cohost) icon = <Check className="size-3.5" />;

  return (
    <>
      <Button
        type="button"
        size="sm"
        variant={cohost ? "secondary" : "outline"}
        aria-pressed={cohost}
        aria-label={t.room.cohost.switchLabel(nick)}
        aria-describedby={hintId}
        aria-disabled={busy || undefined}
        className={cn("h-7 gap-1 rounded-full px-2.5 text-xs", !cohost && "text-muted-foreground", SWITCH_BUSY)}
        onClick={() => void toggle()}
      >
        {icon}
        {t.room.cohost.switchText}
      </Button>
      {/* On a line of its own under the row: a refusal by its code's text (src/lib/rooms/errors.ts), e.g.
          player_unknown for a guest who is gone. */}
      {error && (
        <div className="basis-full">
          <ServerError message={error} />
        </div>
      )}
    </>
  );
}
