import { beforeAll, describe, expect, it } from "vitest";
import { QUESTIONS, type QuestionId } from "@/data/questions";
import { anonClient, newHost, newLinkToken, type Host } from "./support/clients";
import { SEED_CATEGORIES, isRecord, seedGuest, seedRoom, type OwnRoom, type SeededGuest } from "./support/rooms";
import {
  drawListQuestion,
  nextRound,
  openQuestionList,
  roomLobby,
  roundOf,
  seedReveal,
  setCohost,
  skipRound,
  startGame,
  type Answer,
} from "./support/rounds";

// The host's choice in the leader's moves (S-17, context/changes/question-pool-in-db/plan.md, Faza 2 #2) through the
// roles' own doors: RPC with the publishable key, as the signed-in host and as a co-host (anon with a player token: a
// co-host has no session), past the Worker. Oracle: PRD FR-005 (the host picks the game's categories and, for each of
// them, whether its 18+ questions are in) and the outcome of S-17 in context/foundation/roadmap.md (a leader, the host
// or a co-host, opens only a question of the picked categories, and an 18+ one only from a category where the host
// included them, also when calling the database directly). Every id below is written out by hand and checked by hand
// in src/data/questions.ts, never computed by the game's code; `satisfies` makes the build fail if one of them leaves
// the base or changes its category or 18+ mark. Every refusal, round and list expected here is written out by hand
// from the scenario.
//
// private.picked_candidates and the checks in create_room, start_game, private.unplayed_candidates (next_round,
// skip_round, more_questions), open_question_list and draw_list_question come from
// supabase/migrations/*_question_base_checks.sql. Without it the refusals here are red: the database checked only the
// id's format, so an id outside the choice opened a round or joined the list, and any category name made a room.
//
// One sign-up per run, in beforeAll. One open room per host, so the second room opens with confirm_close, which closes
// the first one. Each room plays out once, in order, in its beforeAll, and each step's answer is kept and checked by
// its own test, so no test depends on another one having run.

const anon = anonClient();

// The room's choice: both seed categories (SEED_CATEGORIES in support/rooms.ts), 18+ only in imprezy.
const PICKED = ["na-co-dzien", "imprezy"];
const ADULT_PICKED = ["imprezy"];

// Outside the choice. A category the host did not pick.
const OTHER_CATEGORY = "przyszlosc-008" satisfies QuestionId;
QUESTIONS[OTHER_CATEGORY] satisfies { category: "przyszlosc"; adult: false };
// An 18+ question of a picked category without its 18+ ones.
const ADULT_LEFT_OUT = "na-co-dzien-021" satisfies QuestionId;
QUESTIONS[ADULT_LEFT_OUT] satisfies { category: "na-co-dzien"; adult: true };
// The id's format, and no question of the base (na-co-dzien has 40 questions); checked against the file in beforeAll.
const NOT_IN_BASE = "na-co-dzien-999";
const OUTSIDE = [OTHER_CATEGORY, ADULT_LEFT_OUT, NOT_IN_BASE];

// Of the choice. An 18+ question of the picked category where the host included them.
const ADULT_INCLUDED = "imprezy-021" satisfies QuestionId;
QUESTIONS[ADULT_INCLUDED] satisfies { category: "imprezy"; adult: true };
// Questions that are not 18+, of the two picked categories.
const Q01 = "na-co-dzien-001" satisfies QuestionId;
QUESTIONS[Q01] satisfies { category: "na-co-dzien"; adult: false };
const Q02 = "na-co-dzien-002" satisfies QuestionId;
QUESTIONS[Q02] satisfies { category: "na-co-dzien"; adult: false };
const IMPREZY_020 = "imprezy-020" satisfies QuestionId;
QUESTIONS[IMPREZY_020] satisfies { category: "imprezy"; adult: false };

const OK = { data: { ok: true }, error: null };

function refusal(reason: string): { error: null; data: { ok: false; reason: string } } {
  return { error: null, data: { ok: false, reason } };
}

// A precondition, not the thing under test: throws on anything but { ok: true }, so beforeAll fails red. Only the
// function's own refusal code goes into the message, never its arguments (nicks, tokens).
function seed(answer: Answer, step: string): void {
  if (answer.error) throw new Error(`${step} failed: ${answer.error.code}`);
  const data = answer.data;
  if (!isRecord(data) || data.ok !== true) {
    const reason = isRecord(data) && typeof data.reason === "string" ? data.reason : "an unexpected shape";
    throw new Error(`${step} was refused: ${reason}`);
  }
}

// A top-level field of a room_lobby answer; undefined when the answer has none. Never throws.
function fieldOf(answer: Answer, key: string): unknown {
  return isRecord(answer.data) ? answer.data[key] : undefined;
}

// The entries of the host's question list, or [] when there are none to read. Never throws.
function listOf(answer: Answer): unknown[] {
  const list = fieldOf(answer, "question_list");
  return isRecord(list) && Array.isArray(list.entries) ? (list.entries as unknown[]) : [];
}

let host: Host;

beforeAll(async () => {
  if (PICKED.some((category, index) => SEED_CATEGORIES[index] !== category) || SEED_CATEGORIES.length !== 2) {
    throw new Error("precondition failed: the seed categories are not na-co-dzien and imprezy");
  }
  if (Object.hasOwn(QUESTIONS, NOT_IN_BASE)) {
    throw new Error("precondition failed: NOT_IN_BASE is a question of the base");
  }
  host = await newHost();
});

describe("a game of na-co-dzien and imprezy, with 18+ only in imprezy: Host, Ola, a co-host, and Kuba", () => {
  // create_room.
  let unknownCategory: Answer;
  let roomsAfterUnknown: Answer;
  let room: OwnRoom;
  let ola: SeededGuest;
  // The lobby, with no list.
  let hostLobby: Answer;
  let olaStartsOutside: Answer[];
  let hostStartsAdultLeftOut: Answer;
  let afterRefusedStarts: Answer;
  let olaStarts: Answer;
  let afterStart: Answer;
  // The game.
  let olaSkips: Answer;
  let afterSkip: Answer;
  let hostNext: Answer;
  let afterNext: Answer;
  let olaNextOutside: Answer;
  let afterNextOutside: Answer;

  beforeAll(async () => {
    // A name the base does not have, next to a real one, as a host calling the database directly could send it.
    const created = await host.client.rpc("create_room", {
      p_nick: "Host",
      p_link_token: newLinkToken(),
      p_categories: ["na-co-dzien", "nieznana"],
      p_adult_categories: [],
      p_confirm_close: false,
    });
    unknownCategory = { data: created.data, error: created.error };
    const rooms = await host.client.from("rooms").select("id");
    roomsAfterUnknown = { data: rooms.data, error: rooms.error };

    room = await seedRoom(host, { adultCategories: ADULT_PICKED });
    ola = await seedGuest(room.linkToken, "Ola");
    await seedGuest(room.linkToken, "Kuba");
    seed(await setCohost(host.client, room.id, "Ola", true), "the co-host role for Ola");
    hostLobby = await roomLobby(host.client, room.id);

    // The lobby, with no list: every start outside the choice is refused, Ola's three and the host's.
    olaStartsOutside = [];
    for (const questionId of OUTSIDE) {
      olaStartsOutside.push(await startGame(anon, room.id, questionId, ola.playerToken));
    }
    hostStartsAdultLeftOut = await startGame(host.client, room.id, ADULT_LEFT_OUT);
    afterRefusedStarts = await roomLobby(host.client, room.id);
    olaStarts = await startGame(anon, room.id, ADULT_INCLUDED, ola.playerToken);
    afterStart = await roomLobby(host.client, room.id);

    // Round 1 votes on imprezy-021. Ola skips it with the ids outside the choice first: round 2 is Q01.
    olaSkips = await skipRound(anon, room.id, 1, [...OUTSIDE, Q01], ola.playerToken);
    afterSkip = await roomLobby(host.client, room.id);

    // The host, by its session, moves on from round 2 with the ids outside the choice first: round 3 is imprezy-020.
    await seedReveal(host, room.id, 2);
    hostNext = await nextRound(host.client, room.id, 2, [...OUTSIDE, IMPREZY_020]);
    afterNext = await roomLobby(host.client, room.id);

    // Ola moves on from round 3 with only the ids outside the choice.
    await seedReveal(host, room.id, 3);
    olaNextOutside = await nextRound(anon, room.id, 3, OUTSIDE, ola.playerToken);
    afterNextOutside = await roomLobby(host.client, room.id);
  });

  it("create_room with a category name the base does not have gets exactly invalid_categories, and the host has no room", () => {
    expect(unknownCategory).toEqual(refusal("invalid_categories"));
    expect(roomsAfterUnknown).toEqual({ data: [], error: null });
  });

  // Positive control: the room the rest of this file plays has the choice the oracle assumes.
  it("positive control: the room is made with na-co-dzien and imprezy, 18+ only in imprezy", () => {
    expect(fieldOf(hostLobby, "leader_draw")).toEqual({
      categories: PICKED,
      adult_categories: ADULT_PICKED,
      list_entries: 0,
      list_base_count: 0,
    });
  });

  it.each([
    { question: "przyszlosc-008, of a category the host did not pick", index: 0 },
    { question: "na-co-dzien-021, 18+ in a category without its 18+ ones", index: 1 },
    { question: "na-co-dzien-999, in the id's format and not in the base", index: 2 },
  ])("Ola, a co-host with her token, starting with $question gets exactly invalid_question", ({ index }) => {
    expect(olaStartsOutside[index]).toEqual(refusal("invalid_question"));
  });

  it("the host, by its session, starting with na-co-dzien-021, 18+ the host left out, gets exactly invalid_question", () => {
    expect(hostStartsAdultLeftOut).toEqual(refusal("invalid_question"));
  });

  it("after those refusals the room is still in the lobby, with no round", () => {
    expect(afterRefusedStarts).toMatchObject({ error: null, data: { status: "lobby", round: null } });
  });

  // An 18+ question where the host included them must pass, or the refusals above could be of every start.
  it("positive control: Ola starting with imprezy-021, 18+ where the host included them, gets exactly { ok: true }, and round 1 is imprezy-021", () => {
    expect(olaStarts).toEqual(OK);
    expect(roundOf(afterStart)).toMatchObject({ number: 1, question_id: ADULT_INCLUDED, phase: "voting" });
  });

  // A filter, not a refusal: the ids outside the choice drop out, and the first one of it in the Worker's order opens.
  it("Ola's skip_round with the ids outside the choice before na-co-dzien-001 gets exactly { ok: true }, and round 2 is na-co-dzien-001", () => {
    expect(olaSkips).toEqual(OK);
    expect(roundOf(afterSkip)).toMatchObject({ number: 2, question_id: Q01, phase: "voting", after_skip: true });
  });

  it("the host's next_round, by its session, with the ids outside the choice before imprezy-020 gets exactly { ok: true }, and round 3 is imprezy-020", () => {
    expect(hostNext).toEqual(OK);
    expect(roundOf(afterNext)).toMatchObject({ number: 3, question_id: IMPREZY_020, phase: "voting" });
  });

  it("Ola's next_round with only the ids outside the choice gets exactly no_questions, and round 3, revealed, stays the latest", () => {
    expect(olaNextOutside).toEqual(refusal("no_questions"));
    expect(roundOf(afterNextOutside)).toMatchObject({ number: 3, question_id: IMPREZY_020, phase: "revealed" });
  });
});

// The game's question list is the host's (S-06), so only the signed-in host calls its functions here.
describe("a second room's question list, of the same choice: the host alone", () => {
  let opened: Answer;
  let afterOpen: Answer;
  let drawn: Answer;
  let afterDraw: Answer;
  let drawnOutside: Answer;
  let afterDrawOutside: Answer;

  beforeAll(async () => {
    const room = await seedRoom(host, { confirmClose: true, adultCategories: ADULT_PICKED });

    opened = await openQuestionList(host.client, room.id, [
      OTHER_CATEGORY,
      ADULT_LEFT_OUT,
      ADULT_INCLUDED,
      NOT_IN_BASE,
      Q01,
    ]);
    afterOpen = await roomLobby(host.client, room.id);
    drawn = await drawListQuestion(host.client, room.id, [OTHER_CATEGORY, ADULT_LEFT_OUT, Q02]);
    afterDraw = await roomLobby(host.client, room.id);
    drawnOutside = await drawListQuestion(host.client, room.id, OUTSIDE);
    afterDrawOutside = await roomLobby(host.client, room.id);
  });

  it("Przejrzyj pytania with five candidates gets exactly { ok: true }, and the list is exactly imprezy-021 and na-co-dzien-001", () => {
    expect(opened).toEqual(OK);
    expect(listOf(afterOpen)).toEqual([
      { position: 1, question_id: ADULT_INCLUDED, text: null },
      { position: 2, question_id: Q01, text: null },
    ]);
  });

  it("Dolosuj pytanie with na-co-dzien-002 after two ids outside the choice gets exactly { ok: true }, and adds na-co-dzien-002 at position 3", () => {
    expect(drawn).toEqual(OK);
    expect(listOf(afterDraw)).toEqual([
      { position: 1, question_id: ADULT_INCLUDED, text: null },
      { position: 2, question_id: Q01, text: null },
      { position: 3, question_id: Q02, text: null },
    ]);
  });

  it("Dolosuj pytanie with only the ids outside the choice gets exactly no_questions, and the list stays as it was", () => {
    expect(drawnOutside).toEqual(refusal("no_questions"));
    expect(listOf(afterDrawOutside)).toEqual([
      { position: 1, question_id: ADULT_INCLUDED, text: null },
      { position: 2, question_id: Q01, text: null },
      { position: 3, question_id: Q02, text: null },
    ]);
  });
});
