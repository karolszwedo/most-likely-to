import type { RoomView } from "@/lib/rooms/shared";

// The widths of the room page /r/[id] in one place (AGENTS.md, "## UI"): the page's frame with its header, and the
// column of each state inside it. Below lg (1024 px) every room screen is one column of 512 px (max-w-lg), as on a
// phone; the wider classes start at lg: and come from Tailwind's default scale, never an arbitrary value. Whole class
// names only: Tailwind generates just the classes it finds written out, never one put together from parts.

// The page's frame: <main> of /r/[id] and the inner box of its header (AppHeader with wide).
export const ROOM_FRAME = "max-w-lg lg:max-w-6xl";

// Around the header and <main> of the room's screen (/r/[id] with RoomScreen, /dev/room-window): from xl (1280 px) the
// chat's panel stands at the window's left edge (RoomChat: left-4, w-80, Karol's pick L3 of 2026-11-17) and the emotes'
// card at its right edge (EmoteBar), so the page keeps clear of both and the game sits between them. Below xl nothing.
export const ROOM_PAGE_CHAT = "xl:pr-20 xl:pl-88";

// A screen centred in 512 px at every width: a guest's vote, the skipped last question, the end of the evening without
// a chart, the crash screen and the room pages' messages.
export const ROOM_NARROW = "mx-auto w-full max-w-lg";

// The lobby in two columns across the whole frame.
const LOBBY_COLUMN = "mx-auto w-full max-w-lg lg:max-w-6xl";
// A leader's vote (the host's or a co-host's, before and after their own vote) and every reveal: the pie next to the
// table, the leader's buttons in one line.
const ROUND_COLUMN = "mx-auto w-full max-w-lg lg:max-w-3xl";

// The end of the evening with the summary's chart, in two halves across the whole frame (endInHalves).
const END_HALVES_COLUMN = "mx-auto w-full max-w-lg lg:max-w-6xl";

// The end of the evening whose summary has a chart, because someone got a vote (S-15): from lg two halves, the title,
// the counts, the nicks with none and the next step on the left, the chart on the right (Karol's choice "Dwie połowy"
// after the screenshots, 2026-10-25). Without a chart (no reveal, or everyone abstained) one narrow column.
export function endInHalves(view: RoomView): boolean {
  return view.status === "closed" && view.summary !== null && view.summary.top.length > 0;
}

// The column of the state the room screen shows, chosen as RoomScreen chooses its view.
export function roomColumn(view: RoomView): string {
  if (view.status === "closed") return endInHalves(view) ? END_HALVES_COLUMN : ROOM_NARROW;
  if (view.round === null) return LOBBY_COLUMN;
  if (view.round.phase === "revealed") return ROUND_COLUMN;
  if (view.round.phase === "voting" && view.leader) return ROUND_COLUMN;
  return ROOM_NARROW;
}
