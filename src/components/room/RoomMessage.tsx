import type { ReactNode } from "react";
import {
  DoorClosed,
  Hourglass,
  Link2Off,
  Lock,
  RotateCw,
  Smartphone,
  Trash2,
  TriangleAlert,
  UserRoundMinus,
} from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { ROOM_NARROW } from "@/components/room/room-frame";
import { cn } from "@/lib/utils";

// The centred message of the room pages, one look for all of them (join-page-ui, K1): the link's page /j/<code>
// (unknown or closed link, an error, the latecomer's waiting screen) and the room page /r/[id] (not in the room,
// removed, moved, gone, an error). Rendered on the server from Astro without client:*, and inside the JoinWaiting
// island. Shared with /dev/room-states so the states page shows the real screen; the states page has its own h1, so
// there the title is an h2. Centred in 512 px also in the wide frame of /r/[id] (src/components/room/room-frame.ts).
// A new message adds its icon here instead of putting a centred screen together by hand (AGENTS.md, "## UI").
const ICONS = {
  "game-over": DoorClosed,
  "dead-link": Link2Off,
  error: TriangleAlert,
  waiting: Hourglass,
  outside: Lock,
  removed: UserRoundMinus,
  moved: Smartphone,
  gone: Trash2,
};

export type RoomMessageIcon = keyof typeof ICONS;

interface Props {
  title: string;
  // roomErrorMessage() is typed string | null; the pages only pass a known code, so in practice it is always text.
  text: string | null;
  icon: RoomMessageIcon;
  titleAs?: "h1" | "h2";
  // "Odśwież stronę" after an error: a plain GET of the page again, without ?error=, which changes nothing.
  refreshHref?: string;
  // More under the text, from a React parent (the waiting screen's nick and its live line).
  children?: ReactNode;
}

export default function RoomMessage({ title, text, icon, titleAs: Title = "h1", refreshHref, children }: Props) {
  const Icon = ICONS[icon];
  return (
    <section className={cn("flex flex-col items-center gap-4 py-12 text-center", ROOM_NARROW)}>
      <Icon aria-hidden="true" className="text-muted-foreground size-10" />
      <Title className="text-2xl font-semibold text-balance">{title}</Title>
      {text !== null && <p className="text-muted-foreground">{text}</p>}
      {children}
      {refreshHref !== undefined && (
        <a href={refreshHref} className={buttonVariants()}>
          <RotateCw />
          Odśwież stronę
        </a>
      )}
    </section>
  );
}
