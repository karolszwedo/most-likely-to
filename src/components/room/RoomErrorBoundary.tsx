import { Component, createRef, type ReactNode, type RefObject } from "react";
import { RotateCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ROOM_NARROW } from "@/components/room/room-frame";
import { reportClientEvent } from "@/components/room/useRoomState";
import { useT } from "@/lib/i18n/react";
import { logEvent } from "@/lib/log";
import { cn } from "@/lib/utils";

interface Props {
  roomId: string;
  titleAs: "h1" | "h2";
  // /dev/room-states: no report leaves the page.
  isPreview: boolean;
  children: ReactNode;
}

interface State {
  crashed: boolean;
}

// F4 of the S-02 review (context/archive/2026-10-13-first-live-round/follow-ups/review-fixes.md): a room screen that
// throws while rendering shows the player what to do instead of an empty page, and leaves a trace in the owner's logs:
// island_crash with the room's id only (src/lib/client-events.ts), through the same limits as the screen's other
// reports. The error's name goes only to this browser's console, through the log's list of fields; its message may
// hold a nick. Only the browser: on the server an error in the screen fails the page as any other.
// The snapshot says whether the focus was in the room screen just before the crash screen replaced it.
export class RoomErrorBoundary extends Component<Props, State> {
  state: State = { crashed: false };
  private readonly screen = createRef<HTMLDivElement>();
  private readonly title = createRef<HTMLHeadingElement>();

  static getDerivedStateFromError(): State {
    return { crashed: true };
  }

  componentDidCatch(error: unknown) {
    const { roomId, isPreview } = this.props;
    logEvent("error", { op: "island_crash", roomId, errName: error instanceof Error ? error.name : "unknown" });
    if (!isPreview) reportClientEvent({ event: "island_crash", roomId });
  }

  getSnapshotBeforeUpdate(): boolean {
    const focused = document.activeElement;
    return focused !== null && this.screen.current?.contains(focused) === true;
  }

  // The focused element went away with the room screen, so the focus goes to the crash screen's heading instead of the
  // page's start (as RoomScreen does after a host's move). Focus that was elsewhere on the page stays where it is.
  componentDidUpdate(_props: Props, previous: State, focusWasInScreen: unknown) {
    if (this.state.crashed && !previous.crashed && focusWasInScreen === true) this.title.current?.focus();
  }

  render() {
    if (!this.state.crashed) {
      return (
        <div ref={this.screen} className="contents">
          {this.props.children}
        </div>
      );
    }
    return <CrashScreen titleAs={this.props.titleAs} titleRef={this.title} />;
  }
}

// The crash screen's texts come from the island's dictionary (useT), which a class component cannot read: RoomScreen's
// provider stands above the boundary, so this child reads it.
function CrashScreen({
  titleAs: Title,
  titleRef,
}: {
  titleAs: "h1" | "h2";
  titleRef: RefObject<HTMLHeadingElement | null>;
}) {
  const t = useT();
  // Outside RoomContent and its column, so centred in 512 px here (src/components/room/room-frame.ts).
  return (
    <section className={cn("flex flex-col items-center gap-4 py-12 text-center", ROOM_NARROW)}>
      {/* The alert holds the text only, so a screen reader does not read the button's name with it. */}
      <div role="alert">
        <Title ref={titleRef} tabIndex={-1} className="text-2xl font-semibold text-balance outline-none">
          {t.room.crash.title}
        </Title>
      </div>
      <Button
        type="button"
        onClick={() => {
          window.location.reload();
        }}
      >
        <RotateCw />
        {t.room.crash.reload}
      </Button>
    </section>
  );
}
