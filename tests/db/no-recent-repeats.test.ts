import { beforeAll, describe, expect, it } from "vitest";
import type { QUESTIONS, QuestionId } from "@/data/questions";
import { anonClient, newHost, type Host } from "./support/clients";
import { isRecord, seedGuest, seedRoom, type OwnRoom } from "./support/rooms";
import {
  deleteGame,
  drawListQuestion,
  editListQuestion,
  endGame,
  nextRound,
  openQuestionList,
  removeListQuestion,
  roomLobby,
  roundOf,
  seedNextRound,
  seedReveal,
  seedSkipRound,
  seedVote,
  setCohost,
  startGameWithCandidates,
  type Answer,
} from "./support/rounds";

// The order of the draw (S-20, no-recent-repeats) through the roles' own doors: RPC with the publishable key, as the
// signed-in host, as a co-host (anon with a player token: a co-host has no session) and as the room's guests, past the
// Worker. Oracle: Karol's decisions 1-5 of 2026-11-15 at the top of context/changes/no-recent-repeats/plan.md (PRD
// FR-015): the game draws first the questions the host does not know from its other games, and once they run out the
// ones it has known the longest (1); every game of the host counts (2); a skipped question and a round ended without a
// reveal count as played (3); an entry of the game's question list counts too, a removed or a reworded one included
// (4); a deleted game stops counting (5). Among the questions the host does not know, and among those it knows since
// the same game, the Worker's order stays. Every list, round and refusal expected here is written out by hand from the
// scenario, never computed.
//
// private.ordered_candidates and start_game with p_candidates come from supabase/migrations/*_no_recent_repeats.sql.
// Without it PostgREST answers start_game with p_candidates with PGRST202 (no such function), the lists keep the
// Worker's order, and the tests of rooms A, B and C are red on their own probes. The catalog, and the order of two
// games of one host set apart by a clock turned back, with a second host whose game must not count, are
// supabase/tests/round_creator_view.test.sql's to check.
//
// One sign-up per run, in beforeAll: one host plays four rooms, A to D, and each room's beforeAll builds on the games
// before it; Vitest runs the suites in order, each suite's beforeAll right before its tests. Each room has the seed
// categories with no 18+ (SEED_CATEGORIES in support/rooms.ts) and two guests, Ola and Bartek, and every room after
// the first comes from seedRoom(host, { confirmClose: true }), which closes the one before it. Every move is in
// beforeAll and only checks are in the tests (test-plan §6.2). A move whose answer a test checks is a probe that never
// throws, so a broken order turns its own test red and the scenario goes on; the moves that only build the history
// throw on any refusal. Usuń and Popraw in room B find their entries by question id, never by a fixed position, since a
// broken order moves the entries.

// A question of na-co-dzien with no 18+ mark, so of the choice of every room here: the build fails for any other id.
type RegularId = {
  [K in QuestionId]: (typeof QUESTIONS)[K] extends { category: "na-co-dzien"; adult: false } ? K : never;
}[QuestionId];
// An 18+ question of na-co-dzien: every room here has no 18+ category, so the host left it out (FR-005).
type AdultId = {
  [K in QuestionId]: (typeof QUESTIONS)[K] extends { category: "na-co-dzien"; adult: true } ? K : never;
}[QuestionId];

const Q001 = "na-co-dzien-001" satisfies RegularId;
const Q002 = "na-co-dzien-002" satisfies RegularId;
const Q003 = "na-co-dzien-003" satisfies RegularId;
const Q005 = "na-co-dzien-005" satisfies RegularId;
const Q006 = "na-co-dzien-006" satisfies RegularId;
const Q016 = "na-co-dzien-016" satisfies RegularId;
const Q018 = "na-co-dzien-018" satisfies RegularId;
const Q019 = "na-co-dzien-019" satisfies RegularId;
const Q028 = "na-co-dzien-028" satisfies RegularId;
const Q030 = "na-co-dzien-030" satisfies RegularId;
const Q031 = "na-co-dzien-031" satisfies RegularId;
const Q033 = "na-co-dzien-033" satisfies RegularId;
const ADULT_021 = "na-co-dzien-021" satisfies AdultId;
const ADULT_038 = "na-co-dzien-038" satisfies AdultId;

// "Przejrzyj pytania" in room B: 001-015 in the Worker's order. 001 and 002 the host knows from room A.
const LIST_B_CANDIDATES = [
  "na-co-dzien-001",
  "na-co-dzien-002",
  "na-co-dzien-003",
  "na-co-dzien-004",
  "na-co-dzien-005",
  "na-co-dzien-006",
  "na-co-dzien-007",
  "na-co-dzien-008",
  "na-co-dzien-009",
  "na-co-dzien-010",
  "na-co-dzien-011",
  "na-co-dzien-012",
  "na-co-dzien-013",
  "na-co-dzien-014",
  "na-co-dzien-015",
] as const satisfies readonly RegularId[];
// The list they make: the 13 the host does not know first, in the Worker's order, then 001 and 002, both known since
// room A, in the Worker's order too.
const OPENED_B = [
  { position: 1, question_id: "na-co-dzien-003", text: null },
  { position: 2, question_id: "na-co-dzien-004", text: null },
  { position: 3, question_id: "na-co-dzien-005", text: null },
  { position: 4, question_id: "na-co-dzien-006", text: null },
  { position: 5, question_id: "na-co-dzien-007", text: null },
  { position: 6, question_id: "na-co-dzien-008", text: null },
  { position: 7, question_id: "na-co-dzien-009", text: null },
  { position: 8, question_id: "na-co-dzien-010", text: null },
  { position: 9, question_id: "na-co-dzien-011", text: null },
  { position: 10, question_id: "na-co-dzien-012", text: null },
  { position: 11, question_id: "na-co-dzien-013", text: null },
  { position: 12, question_id: "na-co-dzien-014", text: null },
  { position: 13, question_id: "na-co-dzien-015", text: null },
  { position: 14, question_id: "na-co-dzien-001", text: null },
  { position: 15, question_id: "na-co-dzien-002", text: null },
];
// "Popraw" of 006 in room B, as a question is stored.
const REWORDED = "wypiłby mleko prosto z kartonu";
// A real id in capitals: not the id format, so never a candidate, and a database without the limit would answer
// no_questions and start nothing.
const MALFORMED_ID = "NA-CO-DZIEN-001";
// More candidates than the limit (a game sends far fewer).
const TOO_MANY = Array<string>(1001).fill(MALFORMED_ID);

const anon = anonClient();
const OK = { data: { ok: true }, error: null };

function refusal(reason: string): { error: null; data: { ok: false; reason: string } } {
  return { error: null, data: { ok: false, reason } };
}

// A precondition, not the thing under test: throws on anything but { ok: true }, so beforeAll fails red. Only the
// function's own refusal code goes into the message, never its arguments (nicks, tokens, texts).
function seed(answer: Answer, step: string): void {
  if (answer.error) throw new Error(`${step} failed: ${answer.error.code}`);
  const data = answer.data;
  if (!isRecord(data) || data.ok !== true) {
    const reason = isRecord(data) && typeof data.reason === "string" ? data.reason : "an unexpected shape";
    throw new Error(`${step} was refused: ${reason}`);
  }
}

// The entries of the host's list in a room_lobby answer, or [] when there are none to read. Never throws.
function entriesOf(answer: Answer): unknown[] {
  const list: unknown = isRecord(answer.data) ? answer.data.question_list : null;
  return isRecord(list) && Array.isArray(list.entries) ? (list.entries as unknown[]) : [];
}

// The host's entries with that question id, so a check does not lean on a position the order gave. Never throws.
function entriesWith(answer: Answer, questionId: string): unknown[] {
  return entriesOf(answer).filter((entry) => isRecord(entry) && entry.question_id === questionId);
}

// The position of the host's entry with that question id, as the host's screen finds it. Throws when there is none:
// beforeAll only, a precondition.
function positionOf(answer: Answer, questionId: string): number {
  const [entry] = entriesWith(answer, questionId);
  if (!isRecord(entry) || typeof entry.position !== "number") {
    throw new Error(`precondition failed: ${questionId} is not on the host's list`);
  }
  return entry.position;
}

let host: Host;
// Room A, which room D's suite deletes.
let roomA: OwnRoom;

beforeAll(async () => {
  host = await newHost();
});

// The host's first game. Its questions become ones the host knows: 001 skipped, 002 revealed, 028 and 030 skipped, and
// 031 still voting when the game ends.
describe("room A, the host's first game, with no list: Host, Ola and Bartek", () => {
  let start: Answer;
  let hostRound1: Answer;
  let hostRound5: Answer;

  beforeAll(async () => {
    roomA = await seedRoom(host);
    const ola = await seedGuest(roomA.linkToken, "Ola");
    const bartek = await seedGuest(roomA.linkToken, "Bartek");

    start = await startGameWithCandidates(host.client, roomA.id, [Q001, Q002, Q003]);
    hostRound1 = await roomLobby(host.client, roomA.id);

    // One candidate per move from here: the history, not the thing under test. The third vote reveals round 2.
    await seedSkipRound(host, roomA.id, 1, [Q002]);
    await seedVote(anon, roomA.id, "Bartek", ola.playerToken, 2);
    await seedVote(anon, roomA.id, "Ola", bartek.playerToken, 2);
    await seedVote(host.client, roomA.id, "Ola", undefined, 2);
    await seedNextRound(host, roomA.id, 2, [Q028]);
    await seedSkipRound(host, roomA.id, 3, [Q030]);
    await seedSkipRound(host, roomA.id, 4, [Q031]);
    hostRound5 = await roomLobby(host.client, roomA.id);

    // "Zakończ grę" while round 5 votes: a round ended without a reveal.
    seed(await endGame(host.client, roomA.id), "end_game of room A");
  });

  // An allowed move must work, or a wrong address would look like a refusal everywhere.
  it("positive control: Zacznij grę as the host with the candidates [001, 002, 003] gets exactly { ok: true }, and round 1 is 001: with no other game of the host, the Worker's order decides", () => {
    expect(start).toEqual(OK);
    expect(roundOf(hostRound1)).toMatchObject({ number: 1, question_id: Q001, question_text: null, phase: "voting" });
  });

  it("the history the next rooms stand on: round 5 votes on 031, after 001 skipped, 002 revealed, 028 and 030 skipped", () => {
    expect(roundOf(hostRound5)).toMatchObject({ number: 5, question_id: Q031, phase: "voting", after_skip: true });
  });
});

// A list the host reviews and never starts. Usuń of 005 and Popraw of 006, so the next room meets a removed and a
// reworded entry the host knows.
describe("room B, a list the host never starts: Host, Ola and Bartek", () => {
  let openList: Answer;
  let hostOpened: Answer;
  let hostAfterEdits: Answer;
  let drawFresh: Answer;
  let hostAfterFresh: Answer;
  let drawKnown: Answer;
  let hostAfterKnown: Answer;

  beforeAll(async () => {
    const room = await seedRoom(host, { confirmClose: true });
    await seedGuest(room.linkToken, "Ola");
    await seedGuest(room.linkToken, "Bartek");

    openList = await openQuestionList(host.client, room.id, [...LIST_B_CANDIDATES]);
    hostOpened = await roomLobby(host.client, room.id);

    seed(await removeListQuestion(host.client, room.id, positionOf(hostOpened, Q005)), "Usuń of 005");
    seed(await editListQuestion(host.client, room.id, positionOf(hostOpened, Q006), REWORDED), "Popraw of 006");
    hostAfterEdits = await roomLobby(host.client, room.id);

    // 001 is on the list, 028 the host knows from room A, 016 it does not.
    drawFresh = await drawListQuestion(host.client, room.id, [Q001, Q028, Q016]);
    hostAfterFresh = await roomLobby(host.client, room.id);
    // A question the host knows is drawn last, never left out.
    drawKnown = await drawListQuestion(host.client, room.id, [Q028]);
    hostAfterKnown = await roomLobby(host.client, room.id);
  });

  it("Przejrzyj pytania with [001…015] gets exactly { ok: true }, and the list is exactly [003…015, 001, 002]: the 13 questions the host does not know first, then 001 and 002 of room A, in the Worker's order", () => {
    expect(openList).toEqual(OK);
    expect(hostOpened).toMatchObject({ error: null, data: { question_list: { entries: OPENED_B, base_count: 15 } } });
  });

  it("Usuń of 005 and Popraw of 006, found by their question ids, keep both as rows of the list: 005 is off the entries, 006 has the host's text, and base_count stays 15", () => {
    expect(entriesWith(hostAfterEdits, Q005)).toEqual([]);
    expect(entriesWith(hostAfterEdits, Q006)).toMatchObject([{ question_id: Q006, text: REWORDED }]);
    expect(hostAfterEdits).toMatchObject({ error: null, data: { question_list: { base_count: 15 } } });
  });

  it("Dolosuj pytanie with [001, 028, 016] gets exactly { ok: true } and adds 016 at position 16: 001 is on the list, 028 the host knows from room A, 016 it does not", () => {
    expect(drawFresh).toEqual(OK);
    expect(entriesOf(hostAfterFresh).at(-1)).toEqual({ position: 16, question_id: Q016, text: null });
  });

  it("Dolosuj pytanie with [028] alone gets exactly { ok: true } and adds 028 at position 17: a question the host knows is drawn last, never left out", () => {
    expect(drawKnown).toEqual(OK);
    expect(entriesOf(hostAfterKnown).at(-1)).toEqual({ position: 17, question_id: Q028, text: null });
  });
});

// Opening this room closes room B in the lobby. The host knows now: 030 and 031 from room A; from room B, later, every
// row of its list (003-015, 001, 002, 016 and 028, the removed 005 and the reworded 006 included), so 001, 002 and 028,
// which room A played too, since room B. 018 and 019 it does not know.
describe("room C, a game with no list led with Ola, a co-host: Host, Ola and Bartek", () => {
  let adultStart: Answer;
  let emptyStart: Answer;
  let tooManyStart: Answer;
  let hostAfterRefusals: Answer;
  let start: Answer;
  let hostRound1: Answer;
  let olaNext: Answer;
  let hostRound2: Answer;
  let hostNext: Answer;
  let hostRound3: Answer;

  beforeAll(async () => {
    const room = await seedRoom(host, { confirmClose: true });
    const ola = await seedGuest(room.linkToken, "Ola");
    await seedGuest(room.linkToken, "Bartek");
    seed(await setCohost(host.client, room.id, "Ola", true), "the co-host role for Ola");

    // Starts with nothing of the room's choice, and with a list too long: each leaves the room in the lobby.
    adultStart = await startGameWithCandidates(anon, room.id, [ADULT_021, ADULT_038], ola.playerToken);
    emptyStart = await startGameWithCandidates(host.client, room.id, []);
    tooManyStart = await startGameWithCandidates(host.client, room.id, TOO_MANY);
    hostAfterRefusals = await roomLobby(host.client, room.id);

    // 005 (removed in room B), 006 (reworded in room B) and 001 the host knows; 018 it does not.
    start = await startGameWithCandidates(host.client, room.id, [Q005, Q006, Q018, Q001]);
    hostRound1 = await roomLobby(host.client, room.id);

    // 003 known since room B, 030 since room A, 019 not known.
    await seedReveal(host, room.id, 1);
    olaNext = await nextRound(anon, room.id, 1, [Q003, Q030, Q019], ola.playerToken);
    hostRound2 = await roomLobby(host.client, room.id);

    // All three known: 030 since room A only; 003 since room B; 001 played in room A but on room B's list too, so since
    // room B, the later one.
    await seedReveal(host, room.id, 2);
    hostNext = await nextRound(host.client, room.id, 2, [Q001, Q003, Q030]);
    hostRound3 = await roomLobby(host.client, room.id);

    seed(await endGame(host.client, room.id), "end_game of room C");
  });

  // As for next_round in cohost.test.ts (old known hole F1 of S-07, closed by S-17): a co-host calling the database
  // directly opens no question outside the host's choice, with the start's candidates too.
  it("Zacznij grę by Ola, a co-host with her token, with only the 18+ questions [021, 038] the host left out gets exactly no_questions", () => {
    expect(adultStart).toEqual(refusal("no_questions"));
  });

  it("Zacznij grę as the host with no candidates gets exactly no_questions", () => {
    expect(emptyStart).toEqual(refusal("no_questions"));
  });

  // Malformed input from a client calling the database directly, with no row's values in DETAIL.
  it("Zacznij grę with 1001 candidates is refused whole with 22023", () => {
    expect(tooManyStart).toMatchObject({ data: null, error: { code: "22023", details: null } });
  });

  it("after those refusals the room is still in the lobby, with no round", () => {
    expect(hostAfterRefusals).toMatchObject({ error: null, data: { status: "lobby", round: null } });
  });

  it("Zacznij grę as the host with [005, 006, 018, 001] gets exactly { ok: true }, and round 1 is 018: 005 removed and 006 reworded on room B's list, and 001, the host knows", () => {
    expect(start).toEqual(OK);
    expect(roundOf(hostRound1)).toMatchObject({ number: 1, question_id: Q018, question_text: null, phase: "voting" });
  });

  it("Następne pytanie by Ola, a co-host with her token, with [003, 030, 019] gets exactly { ok: true }, and round 2 is 019, the one the host does not know", () => {
    expect(olaNext).toEqual(OK);
    expect(roundOf(hostRound2)).toMatchObject({ number: 2, question_id: Q019, question_text: null, phase: "voting" });
  });

  // The latest game a question was in counts, not the first: with the first, 001 and 030 would both be room A's, and
  // 001 would come first in the Worker's order.
  it("Następne pytanie as the host with [001, 003, 030] gets exactly { ok: true }, and round 3 is 030, known the longest: since room A only, while 001 and 003 were on room B's list, later", () => {
    expect(hostNext).toEqual(OK);
    expect(roundOf(hostRound3)).toMatchObject({ number: 3, question_id: Q030, question_text: null, phase: "voting" });
  });
});

// Room A is deleted first. 031 the host knew from room A alone; 033 it never met. The room stays in the lobby, the last
// of this file.
describe("room D, a list once room A is deleted: Host, Ola and Bartek", () => {
  let deleteA: Answer;
  let openList: Answer;
  let hostOpened: Answer;

  beforeAll(async () => {
    deleteA = await deleteGame(host.client, roomA.id);
    const room = await seedRoom(host, { confirmClose: true });
    await seedGuest(room.linkToken, "Ola");
    await seedGuest(room.linkToken, "Bartek");

    openList = await openQuestionList(host.client, room.id, [Q031, Q033]);
    hostOpened = await roomLobby(host.client, room.id);
  });

  it("delete_game of room A, ended, gets exactly { ok: true }", () => {
    expect(deleteA).toEqual(OK);
  });

  // With room A still there the list would be [033, 031].
  it("Przejrzyj pytania with [031, 033] gets exactly { ok: true }, and the list is exactly [031, 033]: 031 was known from room A alone, so with room A deleted the host does not know it any more", () => {
    expect(openList).toEqual(OK);
    expect(hostOpened).toMatchObject({
      error: null,
      data: {
        question_list: {
          entries: [
            { position: 1, question_id: Q031, text: null },
            { position: 2, question_id: Q033, text: null },
          ],
          base_count: 2,
        },
      },
    });
  });
});
