import { useEffect, useRef, useState } from "react";
import { Check, Copy } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

// The dev previews only: the link as copied, or just replaced by a removal.
export interface LinkPreview {
  copied?: boolean;
  changed?: boolean;
}

const COPIED_MS = 2000;

const CHANGED = "Link dla graczy się zmienił. Stary już nie działa. Wyślij graczom nowy.";

interface Props {
  linkUrl: string;
  // Unique ids when /dev/room-states renders several screens on one page; "" on the real page.
  idPrefix: string;
  preview?: LinkPreview;
  // The link in one low line: the reveal (RoomScreen).
  compact?: boolean;
}

// The players' link with "Kopiuj" for a leader (the host or a co-host, S-09 decision 5), in the lobby and, above the
// view, while the game is in play (Karol's pick "Pole jak w poczekalni", 2026-11-02). On the reveal it folds into one
// low line (compact: a dimmed label, a low field and "Kopiuj" as a ghost button; Karol's pick of 2026-11-15, reveal-ui),
// so the result stands higher; the label stays the field's name. It comes with the room's state (RoomView.linkUrl), so
// a link a removal replaced shows with the next fetch; a grey line under it, under the low line too, says so until the
// leader copies the new one (Karol's pick "Szara linijka"). Without a clipboard (plain http on a LAN address, an old or
// in-app browser, permission denied) the field is selected, so the leader copies it by hand.
export default function PlayerLink({ linkUrl, idPrefix, preview, compact = false }: Props) {
  const [copied, setCopied] = useState(preview?.copied ?? false);
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
      linkRef.current?.focus();
      linkRef.current?.select();
    }
  }

  return (
    <div className="flex flex-col gap-3">
      {/* The same elements in both modes, only their classes change: a leader's focus on "Kopiuj" stays through the
          reveal. */}
      <div className={cn("flex flex-col gap-3", compact && "flex-row items-center gap-2")}>
        <Label htmlFor={fieldId} className={cn(compact && "text-muted-foreground shrink-0 font-normal")}>
          Link dla graczy
        </Label>
        <div className={cn("flex gap-2", compact && "min-w-0 flex-1")}>
          <Input
            className={cn(compact && "text-muted-foreground h-8 text-xs")}
            ref={linkRef}
            id={fieldId}
            readOnly
            value={linkUrl}
            onFocus={(e) => {
              e.currentTarget.select();
            }}
          />
          <Button
            type="button"
            variant={compact ? "ghost" : "secondary"}
            size={compact ? "sm" : "default"}
            onClick={() => void copyLink()}
          >
            {copied ? <Check /> : <Copy />}
            {copied ? "Skopiowano" : "Kopiuj"}
          </Button>
        </div>
      </div>
      {changed && <p className="text-muted-foreground text-sm">{CHANGED}</p>}
      <p aria-live="polite" className="sr-only">
        {copied ? "Link skopiowany" : changed ? CHANGED : ""}
      </p>
    </div>
  );
}
