import type { Messages } from "@/lib/i18n";

// Room errors travel only as codes: in the URL (`?error=`) after a form, in the JSON answer of a round's action. The
// screen shows the text of its language's dictionary for the code (src/lib/i18n/pl/room-errors.ts), so text typed into
// `?error=` never reaches the screen (same as src/lib/auth-errors.ts).

// The refusals of the game's actions (start, vote, reveal, next, skip, end), of the leader's answer to a latecomer
// ("Wpuść", "Odrzuć"), of the host's role button (player_unknown) and of the host's moves on the game's question list
// ("Przejrzyj pytania", "Dolosuj pytanie", "Usuń", "Popraw", "Dodaj własne"; list_empty is the start's), each with its
// own text (audit G2). not_leader: a leader's move by a guest of the room without the co-host role, e.g. once the host
// took it (S-07). color_taken: a player's pick of a colour another player of the room has (S-18). cohost_protected: a
// co-host's "Usuń" by another co-host's nick, or its own (S-09); player_unknown is also the removal's, for a nick no
// guest of the room has. cohost_returns_by_host: a co-host's "Wpuść" of a request to come back to a co-host's place
// (S-04; admit_latecomer's cohost_protected, renamed by POST /api/rooms/<id>/admit). proposal_limit: a player's
// proposal once theirs are used up (S-10). proposal_unknown: a leader's answer to a proposal no longer waiting.
// game_not_started: "Zatwierdź" of a proposal in the lobby. game_not_ended: the host's "Usuń" of a game on its list of
// own games while the room is in the lobby or the game in play (S-13). room_full: "Wpuść" of a latecomer once the room
// has 50 players (security-hardening); also join_room's and request_join's. tests/unit/room-errors.test.ts checks this
// list against the plans. game_started is also join_room's: a game in play takes a latecomer only through a request to
// the host (S-08).
export const ROUND_REFUSALS = [
  "game_started",
  "not_enough_players",
  "no_questions",
  "already_voted",
  "round_revealed",
  "unknown_target",
  "no_round",
  "round_over",
  "round_in_progress",
  "questions_ran_out",
  "request_unknown",
  "latecomer_nick_taken",
  "question_unknown",
  "invalid_question_text",
  "list_full",
  "list_empty",
  "no_new_questions",
  "not_leader",
  "player_unknown",
  "color_taken",
  "cohost_protected",
  "cohost_returns_by_host",
  "proposal_limit",
  "proposal_unknown",
  "game_not_started",
  "game_not_ended",
  "room_full",
] as const;

export type RoundRefusal = (typeof ROUND_REFUSALS)[number];

// The game's questions ran out: the host's note after the last question (HostActions) and the refusal of "Następne
// pytanie" (questions_ran_out) say the same sentence, so the screen shows it once; HostActions tells the refusal by
// this code, never by its text.
export const QUESTIONS_RAN_OUT: RoundRefusal = "questions_ran_out";

// The code's text in the screen's dictionary (t = messages(lang), src/lib/i18n); a code the dictionary does not know
// ("unexpected", a code typed into `?error=`) gets the generic text. An own-property check, so "constructor" from
// Object.prototype is no code either.
export function roomErrorMessage(code: string | null, t: Messages): string | null {
  if (code === null) return null;
  const { codes, generic } = t.roomErrors;
  return Object.hasOwn(codes, code) ? codes[code as keyof typeof codes] : generic;
}
