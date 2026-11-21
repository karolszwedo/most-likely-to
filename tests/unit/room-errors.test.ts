import { describe, expect, it } from "vitest";
import { messages } from "@/lib/i18n";
import { ROUND_REFUSALS, roomErrorMessage } from "@/lib/rooms/errors";

// Every refusal on a guest's way in (src/pages/api/rooms/join.ts), a latecomer's request to join a game in play
// included, and of a game's action (start, vote, reveal, next, skip, end, the host's "Wpuść" and "Odrzuć", and the
// host's moves on the game's question list) must say what went wrong. A code renamed on one side would leave the player with the generic "something went wrong"
// (test-plan #6; audit G2). The Polish texts are not copied here: the test checks that each refusal has its own text,
// not what the text says.
const GUEST_REFUSALS = [
  "invalid_nick",
  "nick_taken",
  "room_closed",
  "room_unknown",
  "service_unavailable",
  "game_started",
  // request_join (context/archive/2026-10-22-latecomer-admission/plan.md, Faza 1 #1 and Faza 2 #3).
  "requests_full",
  "room_open",
  // request_return (context/archive/2026-11-03-rejoin-after-refresh/plan.md, Faza 4 #1), as POST /api/rooms/join names
  // them.
  "return_taken",
  "return_unknown",
  "host_returns_by_login",
  // join_room and request_join once the room has 50 players (context/archive/2026-11-16-security-hardening/plan.md,
  // Faza 1 #5).
  "room_full",
];

// Every refusal of the host's "Nowa gra" form (src/pages/api/rooms/index.ts, shown on / from ?error=), create_room's
// own: invalid_categories (also from the Worker's own check), open_room_has_guests and try_again, too_many_games once
// the account has opened 60 games within the hour (context/archive/2026-11-16-security-hardening/plan.md, Faza 1 #5),
// and invalid_language for a game's language other than pl and en, also from the Worker's own check
// (context/changes/english-version/plan.md, Faza 2 #3).
const HOST_REFUSALS = ["invalid_categories", "open_room_has_guests", "try_again", "too_many_games", "invalid_language"];

// The round's codes as the plans list them (context/archive/2026-10-13-first-live-round/plan.md, Faza 3 #4;
// context/archive/2026-10-15-full-game-evening/plan.md, Faza 3 #4: round_over for a question that changed under the
// screen, round_in_progress for "Następne pytanie" while the round is voting;
// context/archive/2026-10-20-deferred-review-fixes/plan.md, Faza 3: questions_ran_out for "Następne pytanie" once the
// game's questions ran out; context/archive/2026-10-22-latecomer-admission/plan.md, Faza 2 #3: request_unknown and
// latecomer_nick_taken for the host's "Wpuść" and "Odrzuć"; and
// context/archive/2026-10-24-question-list-review/plan.md, Faza 2 #5: question_unknown, invalid_question_text,
// list_full and no_new_questions for the host's moves on the game's question list, list_empty for the start with every
// entry removed; context/changes/co-host-role/plan.md, Faza 2 #4: not_leader for a leader's move once the co-host role
// is taken, player_unknown for the host's role button on a nick no guest has;
// context/archive/2026-10-31-player-color-choice/plan.md, Faza 2 #4: color_taken for a player's pick of a colour
// another player has; context/changes/remove-player-new-link/plan.md, Faza 2 #3: cohost_protected for a co-host's
// removal of a co-host; context/archive/2026-11-03-rejoin-after-refresh/plan.md, Faza 4 #1: cohost_returns_by_host for
// a co-host's "Wpuść" of a request to come back to a co-host's place;
// context/archive/2026-11-04-guest-question-proposals/plan.md, Faza 2 #3: proposal_limit for a player's proposal once
// theirs are used up, proposal_unknown for a leader's answer to a proposal no longer waiting, game_not_started for
// "Zatwierdź" in the lobby; context/archive/2026-11-10-host-game-history/plan.md, Faza 2 #2: game_not_ended for the
// host's deletion of a game still open; context/archive/2026-11-16-security-hardening/plan.md, Faza 1 #5: room_full for
// the leader's "Wpuść" once the room has 50 players, and no invalid_question, which no start answers any more), written
// out by hand: a code dropped from ROUND_REFUSALS would otherwise drop out of this test too.
const PLANNED_ROUND_REFUSALS = [
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
];

const ALL_REFUSALS = [...new Set([...GUEST_REFUSALS, ...HOST_REFUSALS, ...PLANNED_ROUND_REFUSALS])];

// Codes come from ?error= in the URL or from a JSON answer, so anything can arrive. "constructor" is on
// Object.prototype: a lookup that is not an own-property check would find it.
const UNKNOWN_CODES = ["no_such_code", "constructor"];

// The Polish dictionary (S-27): the codes' texts come from the screen's language; Polish is the pattern of the type.
const PL = messages("pl");

describe("roomErrorMessage", () => {
  const generic = roomErrorMessage(UNKNOWN_CODES[0], PL);

  it.each(UNKNOWN_CODES)("gives the unknown code %s the one generic text", (code) => {
    const message = roomErrorMessage(code, PL);

    expect(message).toBeTypeOf("string");
    expect(message).not.toBe("");
    expect(message).toBe(generic);
  });

  it.each(ALL_REFUSALS)("gives the refusal %s its own text, not the generic one", (code) => {
    const message = roomErrorMessage(code, PL);

    expect(message).toBeTypeOf("string");
    expect(message).not.toBe(generic);
  });

  it("gives every refusal a different text", () => {
    const messages = new Set(ALL_REFUSALS.map((code) => roomErrorMessage(code, PL)));

    expect(messages.size).toBe(ALL_REFUSALS.length);
  });

  it("gives no text when there is no code", () => {
    expect(roomErrorMessage(null, PL)).toBeNull();
  });
});

describe("ROUND_REFUSALS", () => {
  it("lists exactly the round's codes from the plan", () => {
    expect([...ROUND_REFUSALS].sort()).toEqual([...PLANNED_ROUND_REFUSALS].sort());
  });

  it.each(PLANNED_ROUND_REFUSALS)("gives the listed code %s its own text", (code) => {
    expect(roomErrorMessage(code, PL)).not.toBe(roomErrorMessage(UNKNOWN_CODES[0], PL));
  });
});
