import { useCallback, useEffect, useRef } from "react";
import type { ActionOutcome } from "@/components/room/room-actions";

// Where the focus goes when the player's own move takes away the button it was on (scroll-and-focus-fixes), one rule
// for the room's screen: (1) the same button in the next row of the same list, taken from the list as it was at the
// press; (2) what is left of the block (the list's button, a section's heading, the line on the limit of proposals);
// (3) the view's title. Only when the focus was lost with the button (focusWasLost): a player who has moved on keeps
// their place, and another player's move never moves anyone's focus (RoomScreen). Used after a leader's "Zatwierdź"
// and "Odrzuć" of a proposal (QuestionProposals), "Wpuść" and "Odrzuć" of a request (JoinRequests), a player's last
// proposal (ProposalForm) and a vote (RoomScreen: the voting's title, or the reveal's when the vote revealed the
// round). "Usuń" on the list "Gracze" (RoomScreen's removal) and on the game's question list (QuestionList) keep their
// own code, in the same order.

// The button under the focus went away: the browser left the focus on the page's body.
export function focusWasLost(): boolean {
  const active = document.activeElement;
  return active === null || active === document.body;
}

// Moves the focus to the element. One that cannot take it by itself (a heading, a line of text) first gets tabIndex -1,
// so Tab never stops there, and no outline, as the view's title after a leader's move. False with no element, or when
// the focus did not land on it.
export function focusTarget(el: HTMLElement | null): boolean {
  if (el === null) return false;
  if (el.tabIndex < 0 && !el.hasAttribute("tabindex")) {
    el.tabIndex = -1;
    el.classList.add("outline-none");
  }
  el.focus();
  return document.activeElement === el;
}

// The keys of the rows after this one in its list, nearest first: where the same button may take the focus. Several,
// so a next row that went away meanwhile (another leader's answer) hands it on to the one after it.
export function rowsAfter<Key>(keys: readonly Key[], key: Key): Key[] {
  const at = keys.indexOf(key);
  return at < 0 ? [] : keys.slice(at + 1);
}

// The player's own answer on a row that goes away only with the refreshed state (a leader's proposals and requests).
// The move is noted before it is sent, since the bell may bring the refreshed list before the answer
// (src/lib/rooms/server.ts), and a refusal drops it. Once the list has no such key, and only when the focus was lost
// with the row, `resolve` takes the focus on by the order above. Kept in the list's component, not in the row, which
// goes away with the state. A row still on the list after an accepted answer (a latecomer who asked again under the
// same nick) keeps the focus where it is.
export function useRowFocus<Move extends { key: unknown }>(
  keys: readonly Move["key"][],
  resolve: (move: Move) => void,
): (move: Move, send: () => Promise<ActionOutcome>) => Promise<ActionOutcome> {
  const pending = useRef<Move | null>(null);
  // After every render: with no move noted, or its row still on the list, it returns at once.
  useEffect(() => {
    const move = pending.current;
    if (move === null || keys.includes(move.key)) return;
    pending.current = null;
    if (focusWasLost()) resolve(move);
  });
  return useCallback(async (move: Move, send: () => Promise<ActionOutcome>) => {
    pending.current = move;
    const outcome = await send();
    if (!outcome.ok && pending.current === move) pending.current = null;
    return outcome;
  }, []);
}
