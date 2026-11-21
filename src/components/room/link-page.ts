import type { RoomMessageIcon } from "@/components/room/RoomMessage";
import type { Messages } from "@/lib/i18n";

// The states of the host's link /j/<code> as the page shows them (LinkScreen.astro), shared by the real page
// (src/pages/j/[token].astro, which loads them), the waiting screen (JoinWaiting.tsx) and the previews. "inside" is
// not here: someone already in the room never sees the link's page, they go straight to the room. The texts live in
// the dictionary (src/lib/i18n/pl/link.ts); t = messages(lang) of the page or the island (useT).
export type LinkView =
  // A room in the lobby: the join form; rejectedReturn is the nick of a request to come back a leader turned away.
  | { kind: "join"; linkToken: string; rejectedReturn: string | null }
  // A game in play: the request form; rejected is the request a leader turned away before, with its nick.
  | { kind: "started"; linkToken: string; rejected: { nick: string; returning: boolean } | null }
  | { kind: "waiting"; linkToken: string; roomId: string; nick: string; returning: boolean }
  | { kind: "closed" }
  // The same for an old link (replaced when a leader removed a player, S-09) and one copied only in part.
  | { kind: "unknown" }
  // linkToken for "Odśwież stronę": the page loads only a code of the right form, so it is never a stranger's text.
  | { kind: "error"; linkToken: string; reason: string };

// What the forms of "join" and "started" get from the page's request (?error= and the link pages' short cookie).
export interface LinkForm {
  serverError: string | null;
  // The form suggests the nick this browser remembers (S-14), except after "nick zajęty".
  suggestNick: boolean;
  // The nick of a place the guest may ask to come back to (S-04), for the question "To ty?".
  takenNick: string | null;
}

// The browser tab's name from the screen's title (join-page-ui, Z4), as /r/[id] has it.
export function linkTitle(view: LinkView, t: Messages): string {
  const titles = t.link.tabTitle;
  switch (view.kind) {
    case "join":
      return view.rejectedReturn === null ? titles.join : titles.rejected;
    case "started":
      return view.rejected === null ? titles.request : titles.rejected;
    case "waiting":
      return titles.waiting;
    case "closed":
      return titles.closed;
    case "unknown":
      return titles.unknown;
    case "error":
      return titles.error;
  }
}

interface Message {
  title: string;
  text: string;
  icon: RoomMessageIcon;
}

// The end of the game in one wording (K1): a link opened after the game, and a latecomer whose request was still
// waiting when the game ended. e2e looks for this h1 (tests/e2e/game.spec.ts).
export function gameOver(t: Messages): Message {
  return { ...t.link.gameOver, icon: "game-over" };
}

// An unknown link (T2). e2e looks for this h1 (tests/e2e/support/room.ts).
export function deadLink(t: Messages): Message {
  return { ...t.link.deadLink, icon: "dead-link" };
}
