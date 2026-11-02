import { useEffect, useRef, useState } from "react";
import { Check, ChevronDown, Copy, Link2, RefreshCw } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

// TEMPORARY until Karol picks on the screenshots (context/changes/remove-player-new-link/plan.md, 3.5). In the game:
// "field" the lobby's field with "Kopiuj", "button" one button that copies, "folded" a button that unfolds the field.
// After a removal: "note" a grey line under the link, "alert" a framed note. The looks not picked go away.
export type LinkLook = "field" | "button" | "folded";
export type LinkChangedLook = "note" | "alert";
export const DEFAULT_GAME_LINK_LOOK: LinkLook = "button";
export const DEFAULT_LINK_CHANGED_LOOK: LinkChangedLook = "note";

// The dev previews only: the link as copied, unfolded, or just replaced by a removal.
export interface LinkPreview {
  gameLook?: LinkLook;
  // In the game: above the view, as the latecomers' requests ("top"), or under it, above the emotes ("bottom").
  gamePlace?: "top" | "bottom";
  changedLook?: LinkChangedLook;
  copied?: boolean;
  unfolded?: boolean;
  changed?: boolean;
}

const COPIED_MS = 2000;

const CHANGED_TITLE = "Link dla graczy się zmienił.";
const CHANGED_TEXT = "Stary już nie działa. Wyślij graczom nowy.";

interface Props {
  linkUrl: string;
  // Unique ids when /dev/room-states renders several screens on one page; "" on the real page.
  idPrefix: string;
  look: LinkLook;
  changedLook: LinkChangedLook;
  preview?: LinkPreview;
}

// The players' link for a leader (the host or a co-host, S-09 decision 5), in the lobby and while the game is in play.
// It comes with the room's state (RoomView.linkUrl), so a link a removal replaced shows with the next fetch, and says
// so until the leader copies the new one. Without a clipboard (plain http on a LAN address, an old or in-app browser,
// permission denied) the field is selected, so the leader copies it by hand.
export default function PlayerLink({ linkUrl, idPrefix, look, changedLook, preview }: Props) {
  const [copied, setCopied] = useState(preview?.copied ?? false);
  const [unfolded, setUnfolded] = useState(preview?.unfolded ?? look === "field");
  // Adjusting state while rendering: a new link (a removal) is news until it is copied; never on the first render.
  const [shownLink, setShownLink] = useState(linkUrl);
  const [changed, setChanged] = useState(preview?.changed ?? false);
  if (linkUrl !== shownLink) {
    setShownLink(linkUrl);
    setChanged(true);
    setCopied(false);
  }
  const linkRef = useRef<HTMLInputElement>(null);
  const isPreview = Boolean(preview);
  const fieldId = `${idPrefix}room-link`;

  useEffect(() => {
    if (!copied || isPreview) return;
    const timer = window.setTimeout(() => {
      setCopied(false);
    }, COPIED_MS);
    return () => {
      window.clearTimeout(timer);
    };
  }, [copied, isPreview]);

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(linkUrl);
      setCopied(true);
      setChanged(false);
    } catch {
      setUnfolded(true);
      // The field shows with the next render.
      window.setTimeout(() => {
        linkRef.current?.focus();
        linkRef.current?.select();
      }, 0);
    }
  }

  const copyLabel = copied ? "Skopiowano" : "Kopiuj";
  const field = (
    <div className="flex flex-col gap-3">
      {look === "field" && <Label htmlFor={fieldId}>Link dla graczy</Label>}
      <div className="flex gap-2">
        <Input
          ref={linkRef}
          id={fieldId}
          readOnly
          aria-label={look === "field" ? undefined : "Link dla graczy"}
          value={linkUrl}
          onFocus={(e) => {
            e.currentTarget.select();
          }}
        />
        <Button type="button" variant="secondary" onClick={() => void copyLink()}>
          {copied ? <Check /> : <Copy />}
          {copyLabel}
        </Button>
      </div>
    </div>
  );

  let body: React.ReactNode = field;
  if (look === "button") {
    body = (
      <div className="flex flex-col gap-3">
        <Button type="button" variant="secondary" className="self-start" onClick={() => void copyLink()}>
          {copied ? <Check /> : <Link2 />}
          {copied ? "Skopiowano link dla graczy" : "Kopiuj link dla graczy"}
        </Button>
        {unfolded && field}
      </div>
    );
  } else if (look === "folded") {
    body = (
      <div className="flex flex-col gap-3">
        <Button
          type="button"
          variant="ghost"
          className="text-muted-foreground self-start px-2"
          aria-expanded={unfolded}
          onClick={() => {
            setUnfolded(!unfolded);
          }}
        >
          <Link2 />
          Link dla graczy
          <ChevronDown className={unfolded ? "rotate-180" : undefined} />
        </Button>
        {unfolded && field}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      {changed && changedLook === "alert" && (
        <Alert role="note">
          <RefreshCw />
          <AlertTitle>{CHANGED_TITLE}</AlertTitle>
          <AlertDescription>{CHANGED_TEXT}</AlertDescription>
        </Alert>
      )}
      {body}
      {changed && changedLook === "note" && (
        <p className="text-muted-foreground text-sm">
          {CHANGED_TITLE} {CHANGED_TEXT}
        </p>
      )}
      <p aria-live="polite" className="sr-only">
        {copied ? "Link skopiowany" : changed ? `${CHANGED_TITLE} ${CHANGED_TEXT}` : ""}
      </p>
    </div>
  );
}
