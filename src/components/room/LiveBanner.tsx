import { WifiOff } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { useSpoken, useT } from "@/lib/i18n/react";

interface Props {
  // The room's channel is down (CHANNEL_ERROR, TIMED_OUT, CLOSED): the screen polls every few seconds meanwhile
  // (src/components/room/useRoomState.ts; decision D4, audit L1).
  broken: boolean;
}

// The status region is on the page from the start, so a screen reader hears the note when it appears; a status, not an
// alert, because nothing is asked of the player. It is visually hidden (out of the layout's flow), and the visible note
// below is plain content.
export function LiveBanner({ broken }: Props) {
  const t = useT();
  const text = t.room.liveBanner.broken;
  // The connection may stay down for minutes, so the switch of the language must not read it out again; the visible
  // note below takes the new language at once.
  const spoken = useSpoken(broken ? text : "");
  return (
    <>
      <p role="status" className="sr-only">
        {spoken}
      </p>
      {broken && (
        <Alert role="none">
          <WifiOff />
          <AlertDescription>{text}</AlertDescription>
        </Alert>
      )}
    </>
  );
}
