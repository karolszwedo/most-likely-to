import { describe, expect, it } from "vitest";
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
];

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
// context/changes/player-color-choice/plan.md, Faza 2 #4: color_taken for a player's pick of a colour another player
// has), written out by hand: a code dropped from ROUND_REFUSALS would otherwise drop out of this test too.
const PLANNED_ROUND_REFUSALS = [
  "game_started",
  "not_enough_players",
  "no_questions",
  "invalid_question",
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
];

const ALL_REFUSALS = [...new Set([...GUEST_REFUSALS, ...PLANNED_ROUND_REFUSALS])];

// Codes come from ?error= in the URL or from a JSON answer, so anything can arrive. "constructor" is on
// Object.prototype: a lookup that is not an own-property check would find it.
const UNKNOWN_CODES = ["no_such_code", "constructor"];

describe("roomErrorMessage", () => {
  const generic = roomErrorMessage(UNKNOWN_CODES[0]);

  it.each(UNKNOWN_CODES)("gives the unknown code %s the one generic text", (code) => {
    const message = roomErrorMessage(code);

    expect(message).toBeTypeOf("string");
    expect(message).not.toBe("");
    expect(message).toBe(generic);
  });

  it.each(ALL_REFUSALS)("gives the refusal %s its own text, not the generic one", (code) => {
    const message = roomErrorMessage(code);

    expect(message).toBeTypeOf("string");
    expect(message).not.toBe(generic);
  });

  it("gives every refusal a different text", () => {
    const messages = new Set(ALL_REFUSALS.map((code) => roomErrorMessage(code)));

    expect(messages.size).toBe(ALL_REFUSALS.length);
  });

  it("gives no text when there is no code", () => {
    expect(roomErrorMessage(null)).toBeNull();
  });
});

describe("ROUND_REFUSALS", () => {
  it("lists exactly the round's codes from the plan", () => {
    expect([...ROUND_REFUSALS].sort()).toEqual([...PLANNED_ROUND_REFUSALS].sort());
  });

  it.each(PLANNED_ROUND_REFUSALS)("gives the listed code %s its own text", (code) => {
    expect(roomErrorMessage(code)).not.toBe(roomErrorMessage(UNKNOWN_CODES[0]));
  });
});
