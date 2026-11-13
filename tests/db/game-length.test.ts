import { beforeAll, describe, expect, it } from "vitest";
import { QUESTIONS, type QuestionId } from "@/data/questions";
import { anonClient, newHost, newPlayerToken, type Host } from "./support/clients";
import { isRecord, seedGuest, seedRoom, type OwnRoom, type SeededGuest } from "./support/rooms";
import {
  LOBBY_KEYS,
  addOwnQuestion,
  approveProposal,
  drawListQuestion,
  editListQuestion,
  endGame,
  keysOf,
  moreQuestions,
  nextRound,
  openQuestionList,
  proposeQuestion,
  removeListQuestion,
  roomLobby,
  roundOf,
  seedReveal,
  seedSkipRound,
  seedStartGame,
  setCohost,
  skipRound,
  startGame,
  type Answer,
} from "./support/rounds";

// The game's length (game-length) through the roles' own doors: RPC with the publishable key, as the room's guests
// (anon with a player token), as a co-host (anon with a token: a co-host has no session) and as the signed-in host,
// past the Worker. Oracle: Karol's decisions of 2026-11-07 in context/changes/game-length/change.md and at the top of
// context/changes/game-length/plan.md: every game has 15 questions by default, also when nobody opens the list, and a
// reviewed list has its own number; every player sees the number, and never the list; an approved proposal adds one
// question ("z 16"); a skipped question uses up one of them (decision 4: 3 skips in a game of 15 leave 12 reveals);
// after the last question a leader picks "Zakończ grę" or "Jeszcze 5 pytań", which never promises a question that is
// not there, and the game goes on at once ("Pytanie 16 z 20"). Every number, question and refusal expected here is
// written out by hand from the scenario, never computed.
//
// more_questions, the stop in next_round and skip_round and room_lobby's question_count come from
// supabase/migrations/*_game_length.sql. Without it PostgREST answers more_questions with PGRST202 (no such function),
// room_lobby has no question_count, and every test here is red on its own probe or on the state those calls should have
// made. What the roles cannot see (the catalog, the column's check, the thumbs folded by "Jeszcze 5 pytań") is
// supabase/tests/round_creator_view.test.sql's to check.
//
// One sign-up per run, in beforeAll. One open room per host, so each room opens once the one before is closed
// (confirm_close closes it should the end have failed); Vitest runs the suites in order, each suite's beforeAll right
// before its tests. Each room plays out once, in order, in its beforeAll, and each step's answer is kept and checked by
// its own test, so no test depends on another one having run. The rounds on the way to the last question are skipped:
// a skip is a round too, so the 15th round is the game's last question however it came.

const anon = anonClient();

// The pool of a game here: the first 20 questions of the first seed category (SEED_CATEGORIES in support/rooms.ts),
// none 18+, in the order the Worker shuffled them into. `satisfies` makes the build fail if an id ever leaves the base;
// since S-17 the database checks itself that each id is of the base and of the room's choice.
const POOL = [
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
  "na-co-dzien-016",
  "na-co-dzien-017",
  "na-co-dzien-018",
  "na-co-dzien-019",
  "na-co-dzien-020",
] as const satisfies readonly QuestionId[];
// The pool as the Worker sends it with every leader's move.
const CANDIDATES: string[] = [...POOL];
const Q01 = "na-co-dzien-001" satisfies QuestionId;
const Q02 = "na-co-dzien-002" satisfies QuestionId;
const Q03 = "na-co-dzien-003" satisfies QuestionId;
const Q15 = "na-co-dzien-015" satisfies QuestionId;
const Q16 = "na-co-dzien-016" satisfies QuestionId;
const Q17 = "na-co-dzien-017" satisfies QuestionId;
const Q18 = "na-co-dzien-018" satisfies QuestionId;
const Q20 = "na-co-dzien-020" satisfies QuestionId;
// Questions of the second seed category, none 18+: fresh in a game that played Q01-Q15.
const FRESH = [
  "imprezy-001",
  "imprezy-002",
  "imprezy-003",
  "imprezy-004",
  "imprezy-005",
] as const satisfies readonly QuestionId[];
const [F1, F2, F3, F4, F5] = FRESH;
// An 18+ question of the first seed category. Every room here is opened with no 18+ category, so the host left it out
// of the game (FR-005). `satisfies` makes the build fail if the id ever leaves the base or stops being 18+.
const ADULT_QUESTION_ID = "na-co-dzien-021" satisfies QuestionId;
QUESTIONS[ADULT_QUESTION_ID] satisfies { adult: true };
// A real id in capitals: not the id format, so it is never a candidate, as null is not.
const MALFORMED_ID = "NA-CO-DZIEN-001";
// More candidates than the limit (a game sends at most 216), none in the id format.
const TOO_MANY = Array<string>(1001).fill(MALFORMED_ID);
// Not a player token: the Worker sends the cookie's 32-byte one or none.
const MALFORMED_TOKEN = "not-a-player-token";

// "Popraw" and "Dodaj własne" in the game with a list, and a player's proposal, as a question is stored.
const REWORDED = "wypiłby mleko prosto z kartonu";
const OWN_TEXT = "zgubiłby kartkę z pytaniem";
const KINO = "zasnąłby w kinie";

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

// A top-level field of a room_lobby answer; undefined when the answer has none. Never throws.
function fieldOf(answer: Answer, key: string): unknown {
  return isRecord(answer.data) ? answer.data[key] : undefined;
}

function countOf(answer: Answer): unknown {
  return fieldOf(answer, "question_count");
}

// Which of several calls made at once got which answer is the race's; how many got each is not. Sorted. Never throws.
function outcomesOf(answers: Answer[]): string[] {
  return answers
    .map((answer) => {
      if (answer.error) return `error ${answer.error.code}`;
      const data = answer.data;
      if (isRecord(data) && data.ok === true) return "ok";
      return isRecord(data) && typeof data.reason === "string" ? data.reason : "an unexpected shape";
    })
    .sort();
}

let host: Host;

beforeAll(async () => {
  host = await newHost();
});

// Rounds `from` to `to` skipped one after another as the host, each skip opening the next round: a precondition.
// Throws on any failure: beforeAll only.
async function skipRounds(roomId: string, from: number, to: number, candidates: string[]): Promise<void> {
  for (let round = from; round <= to; round++) {
    await seedSkipRound(host, roomId, round, candidates);
  }
}

describe("a game with no list, to its 15th question and 5 more: Host, Ola, Bartek and Kuba, a co-host", () => {
  let room: OwnRoom;
  let ola: SeededGuest;
  let bartek: SeededGuest;
  let kuba: SeededGuest;
  // The lobby.
  let hostLobby: Answer;
  let kubaLobby: Answer;
  let bartekLobby: Answer;
  let moreInLobby: Answer;
  // Round 15, the last question, while it votes.
  let hostRound15: Answer;
  let hostMoreWhileVoting: Answer;
  let bartekMore: Answer;
  let noTokenMore: Answer;
  let strangerMore: Answer;
  let malformedMore: Answer;
  // The stop.
  let nextAfter15: Answer;
  let hostStopped: Answer;
  let bartekStopped: Answer;
  // Jeszcze 5 pytań.
  let kubaMore: Answer;
  let moreAgain: Answer;
  let hostRound16: Answer;
  let olaRound16: Answer;
  // The stop after round 20.
  let nextAfter20: Answer;
  let hostStopped20: Answer;
  let moreNoneLeft: Answer;
  let hostAfterNoneLeft: Answer;
  // The end.
  let hostClosed: Answer;
  let olaClosed: Answer;
  let moreClosed: Answer;

  beforeAll(async () => {
    room = await seedRoom(host);
    ola = await seedGuest(room.linkToken, "Ola");
    bartek = await seedGuest(room.linkToken, "Bartek");
    kuba = await seedGuest(room.linkToken, "Kuba");
    seed(await setCohost(host.client, room.id, "Kuba", true), "the co-host role for Kuba");

    // Nobody opens the list.
    hostLobby = await roomLobby(host.client, room.id);
    kubaLobby = await roomLobby(anon, room.id, kuba.playerToken);
    bartekLobby = await roomLobby(anon, room.id, bartek.playerToken);
    moreInLobby = await moreQuestions(host.client, room.id, 1, CANDIDATES);

    // Round 1 is Q01 and round 2 Q02; rounds 2 to 14 are skipped, so round 15 is Q15.
    await seedStartGame(host, room.id, Q01);
    await seedReveal(host, room.id, 1);
    seed(await nextRound(host.client, room.id, 1, CANDIDATES), "the next question after round 1");
    await skipRounds(room.id, 2, 14, CANDIDATES);
    hostRound15 = await roomLobby(host.client, room.id);

    // While round 15 votes. Each try, let through, would only answer round_in_progress.
    hostMoreWhileVoting = await moreQuestions(host.client, room.id, 15, CANDIDATES);
    bartekMore = await moreQuestions(anon, room.id, 15, CANDIDATES, bartek.playerToken);
    noTokenMore = await moreQuestions(anon, room.id, 15, CANDIDATES);
    strangerMore = await moreQuestions(anon, room.id, 15, CANDIDATES, newPlayerToken());
    malformedMore = await moreQuestions(anon, room.id, 15, CANDIDATES, MALFORMED_TOKEN);

    // The stop: Q16 to Q20 are left in the pool, and the game opens none of them.
    await seedReveal(host, room.id, 15);
    nextAfter15 = await nextRound(host.client, room.id, 15, CANDIDATES);
    hostStopped = await roomLobby(host.client, room.id);
    bartekStopped = await roomLobby(anon, room.id, bartek.playerToken);

    // "Jeszcze 5 pytań" by Kuba, with his token and no session, then the same click again from round 15.
    kubaMore = await moreQuestions(anon, room.id, 15, CANDIDATES, kuba.playerToken);
    moreAgain = await moreQuestions(host.client, room.id, 15, CANDIDATES);
    hostRound16 = await roomLobby(host.client, room.id);
    olaRound16 = await roomLobby(anon, room.id, ola.playerToken);

    // Rounds 16 to 19 are skipped, so round 20 is Q20, the pool's last question.
    await skipRounds(room.id, 16, 19, CANDIDATES);
    await seedReveal(host, room.id, 20);
    nextAfter20 = await nextRound(host.client, room.id, 20, CANDIDATES);
    hostStopped20 = await roomLobby(host.client, room.id);
    moreNoneLeft = await moreQuestions(host.client, room.id, 20, CANDIDATES);
    hostAfterNoneLeft = await roomLobby(host.client, room.id);

    seed(await endGame(host.client, room.id), "end_game");
    hostClosed = await roomLobby(host.client, room.id);
    olaClosed = await roomLobby(anon, room.id, ola.playerToken);
    moreClosed = await moreQuestions(host.client, room.id, 20, CANDIDATES);
  });

  // Every player sees the number, also when nobody opens the list.
  it.each([
    { who: "the host", view: () => hostLobby },
    { who: "Kuba, a co-host,", view: () => kubaLobby },
    { who: "Bartek, a guest with no role,", view: () => bartekLobby },
  ])("in the lobby with no list $who sees question_count 15", ({ view }) => {
    expect(view()).toMatchObject({ error: null, data: { status: "lobby", question_count: 15 } });
  });

  // Exact keys (test-plan §6.3): the number is the one key a guest gets with the game's length.
  it("Bartek's state has exactly the lobby's keys, question_count among them", () => {
    expect(keysOf(bartekLobby.data)).toEqual(LOBBY_KEYS);
  });

  it("Jeszcze 5 pytań in the lobby gets no_round", () => {
    expect(moreInLobby).toMatchObject(refusal("no_round"));
  });

  // Decision 4: a skip uses up a question, so the 15th round is the last one.
  it("round 15 votes on Q15 after 13 skips, and the number is still 15", () => {
    expect(roundOf(hostRound15)).toMatchObject({ number: 15, question_id: Q15, phase: "voting" });
    expect(countOf(hostRound15)).toBe(15);
  });

  it.each([
    { who: "the host", answer: () => hostMoreWhileVoting, reason: "round_in_progress" },
    { who: "Bartek, a guest with no role,", answer: () => bartekMore, reason: "not_leader" },
    { who: "someone with no token", answer: () => noTokenMore, reason: "room_unknown" },
    { who: "someone with a token of no player", answer: () => strangerMore, reason: "room_unknown" },
  ])("$who making Jeszcze 5 pytań while round 15 votes gets $reason", ({ answer, reason }) => {
    expect(answer()).toMatchObject(refusal(reason));
  });

  // Not our client: an exception, as for a malformed token in a vote, with no row's values in details.
  it("Jeszcze 5 pytań with a malformed player token is refused with 22023", () => {
    expect(malformedMore).toMatchObject({ data: null, error: { code: "22023", details: null } });
  });

  // The stop: Q16 to Q20 are still in the pool.
  it("Następne pytanie after round 15 gets no_questions, and round 15, revealed, stays the latest", () => {
    expect(nextAfter15).toMatchObject(refusal("no_questions"));
    expect(roundOf(hostStopped)).toMatchObject({ number: 15, question_id: Q15, phase: "revealed" });
    expect(countOf(hostStopped)).toBe(15);
  });

  it("Bartek, a guest with no role, sees question_count 15 while the game is in play", () => {
    expect(bartekStopped).toMatchObject({ error: null, data: { status: "playing", question_count: 15 } });
  });

  // An allowed move must work, or a wrong address would look like a refusal everywhere.
  it("positive control: Kuba, a co-host with his token and no session, makes Jeszcze 5 pytań: exactly { ok: true }", () => {
    expect(kubaMore).toEqual(OK);
  });

  it("round 16 opens at once on Q16, and the number is 20 for the host and for Ola", () => {
    expect(roundOf(hostRound16)).toMatchObject({ number: 16, question_id: Q16, phase: "voting" });
    expect(countOf(hostRound16)).toBe(20);
    expect(countOf(olaRound16)).toBe(20);
  });

  it("the same click sent again from round 15 gets round_over, and adds nothing: the number stays 20", () => {
    expect(moreAgain).toMatchObject(refusal("round_over"));
    expect(countOf(hostRound16)).toBe(20);
  });

  it("Następne pytanie after round 20 gets no_questions, and round 20, revealed on Q20, stays the latest", () => {
    expect(nextAfter20).toMatchObject(refusal("no_questions"));
    expect(roundOf(hostStopped20)).toMatchObject({ number: 20, question_id: Q20, phase: "revealed" });
    expect(countOf(hostStopped20)).toBe(20);
  });

  // Never a question that is not there.
  it("Jeszcze 5 pytań with the whole pool played gets no_questions, and the number stays 20", () => {
    expect(moreNoneLeft).toMatchObject(refusal("no_questions"));
    expect(roundOf(hostAfterNoneLeft)).toMatchObject({ number: 20, phase: "revealed" });
    expect(countOf(hostAfterNoneLeft)).toBe(20);
  });

  it.each([
    { who: "the host", view: () => hostClosed },
    { who: "Ola", view: () => olaClosed },
  ])("after Zakończ grę $who still sees question_count 20", ({ view }) => {
    expect(view()).toMatchObject({ error: null, data: { status: "closed", question_count: 20 } });
  });

  it("Jeszcze 5 pytań in the closed room gets room_closed", () => {
    expect(moreClosed).toMatchObject(refusal("room_closed"));
  });
});

describe("the last question skipped, then a proposal approved at the stop: Host, Ola and Bartek, with no list", () => {
  let room: OwnRoom;
  let ola: SeededGuest;
  let bartek: SeededGuest;
  let skipLast: Answer;
  let hostSkippedLast: Answer;
  let nextAfterSkippedLast: Answer;
  let approve: Answer;
  let hostAfterApprove: Answer;
  let bartekAfterApprove: Answer;
  let nextAfterApprove: Answer;
  let olaRound16: Answer;
  let nextAfter16: Answer;

  beforeAll(async () => {
    room = await seedRoom(host, { confirmClose: true });
    ola = await seedGuest(room.linkToken, "Ola");
    bartek = await seedGuest(room.linkToken, "Bartek");
    seed(await proposeQuestion(anon, room.id, KINO, ola.playerToken), "Ola's proposal");

    // Rounds 1 to 14 are skipped, so round 15 is Q15; then it is skipped too.
    await seedStartGame(host, room.id, Q01);
    await skipRounds(room.id, 1, 14, CANDIDATES);
    skipLast = await skipRound(host.client, room.id, 15, CANDIDATES);
    hostSkippedLast = await roomLobby(host.client, room.id);
    nextAfterSkippedLast = await nextRound(host.client, room.id, 15, CANDIDATES);

    // At the stop the host approves Ola's proposal: one question more.
    approve = await approveProposal(host.client, room.id, 1);
    hostAfterApprove = await roomLobby(host.client, room.id);
    bartekAfterApprove = await roomLobby(anon, room.id, bartek.playerToken);
    nextAfterApprove = await nextRound(host.client, room.id, 15, CANDIDATES);
    olaRound16 = await roomLobby(anon, room.id, ola.playerToken);

    await seedReveal(host, room.id, 16);
    nextAfter16 = await nextRound(host.client, room.id, 16, CANDIDATES);

    seed(await endGame(host.client, room.id), "end_game");
  });

  it("Pomiń pytanie on round 15, the last question, gets exactly { ok: true }, and round 15 stays the latest, skipped", () => {
    expect(skipLast).toEqual(OK);
    expect(roundOf(hostSkippedLast)).toEqual({ number: 15, phase: "skipped" });
    expect(countOf(hostSkippedLast)).toBe(15);
  });

  it("Następne pytanie after the skipped last question gets no_questions", () => {
    expect(nextAfterSkippedLast).toMatchObject(refusal("no_questions"));
  });

  it("the host approves Ola's proposal at the stop: exactly { ok: true }, and the number is 16 for the host and for Bartek", () => {
    expect(approve).toEqual(OK);
    expect(countOf(hostAfterApprove)).toBe(16);
    expect(countOf(bartekAfterApprove)).toBe(16);
  });

  it("then Następne pytanie gets exactly { ok: true }, and round 16 is the approved question", () => {
    expect(nextAfterApprove).toEqual(OK);
    expect(roundOf(olaRound16)).toMatchObject({
      number: 16,
      question_id: null,
      question_text: KINO,
      phase: "voting",
      after_skip: true,
    });
    expect(countOf(olaRound16)).toBe(16);
  });

  it("Następne pytanie after round 16 gets no_questions", () => {
    expect(nextAfter16).toMatchObject(refusal("no_questions"));
  });
});

describe("a game with a list: the number follows the host's moves, and Jeszcze 5 pytań draws past the list: Host, Ewa and Zosia", () => {
  let room: OwnRoom;
  let ewa: SeededGuest;
  // The lobby.
  let afterOpen: Answer;
  let ewaAfterOpen: Answer;
  let afterRemove: Answer;
  let afterDraw: Answer;
  let afterOwn: Answer;
  let afterEdit: Answer;
  // The list's end.
  let hostRound16: Answer;
  let nextAtListEnd: Answer;
  let moreAtListEnd: Answer;
  let hostRound17: Answer;

  beforeAll(async () => {
    room = await seedRoom(host, { confirmClose: true });
    ewa = await seedGuest(room.linkToken, "Ewa");
    await seedGuest(room.linkToken, "Zosia");

    // Positions 1-15 are Q01-Q15. Position 2 is removed, Q16 drawn at position 16, the own question added at position
    // 17, and position 1 reworded.
    seed(await openQuestionList(host.client, room.id, CANDIDATES), "Przejrzyj pytania");
    afterOpen = await roomLobby(host.client, room.id);
    ewaAfterOpen = await roomLobby(anon, room.id, ewa.playerToken);
    seed(await removeListQuestion(host.client, room.id, 2), "Usuń of position 2");
    afterRemove = await roomLobby(host.client, room.id);
    seed(await drawListQuestion(host.client, room.id, [Q01, Q02, Q16, Q17]), "Dolosuj pytanie");
    afterDraw = await roomLobby(host.client, room.id);
    seed(await addOwnQuestion(host.client, room.id, OWN_TEXT), "Dodaj własne");
    afterOwn = await roomLobby(host.client, room.id);
    seed(await editListQuestion(host.client, room.id, 1, REWORDED), "Popraw of position 1");
    afterEdit = await roomLobby(host.client, room.id);

    // The list's 16 entries are rounds 1-16: rounds 1 to 15 are skipped, so round 16 is the own question.
    await seedStartGame(host, room.id, Q20);
    await skipRounds(room.id, 1, 15, CANDIDATES);
    hostRound16 = await roomLobby(host.client, room.id);

    // Past the list: Q02 was removed and Q01 reworded, Q03 and Q16 were played from the list; Q17 and Q18 are fresh.
    await seedReveal(host, room.id, 16);
    nextAtListEnd = await nextRound(host.client, room.id, 16, [Q02, Q01, Q03, Q16, Q17, Q18]);
    moreAtListEnd = await moreQuestions(host.client, room.id, 16, [Q02, Q01, Q03, Q16, Q17, Q18]);
    hostRound17 = await roomLobby(host.client, room.id);

    seed(await endGame(host.client, room.id), "end_game");
  });

  it.each([
    { move: "Przejrzyj pytania", view: () => afterOpen, count: 15 },
    { move: "Usuń of position 2", view: () => afterRemove, count: 14 },
    { move: "Dolosuj pytanie", view: () => afterDraw, count: 15 },
    { move: "Dodaj własne", view: () => afterOwn, count: 16 },
    { move: "Popraw of position 1", view: () => afterEdit, count: 16 },
  ])("after $move the host sees question_count $count", ({ view, count }) => {
    expect(view()).toMatchObject({ error: null, data: { status: "lobby", question_count: count } });
  });

  // The number and nothing else: the list stays the host's.
  it("Ewa, a guest with no role, sees question_count 15 and nothing of the list", () => {
    expect(countOf(ewaAfterOpen)).toBe(15);
    expect(fieldOf(ewaAfterOpen, "question_list")).toBeNull();
    expect(fieldOf(ewaAfterOpen, "leader_draw")).toBeNull();
    expect(JSON.stringify(ewaAfterOpen.data)).not.toContain("na-co-dzien");
  });

  it("round 16 is the list's last entry, the own question, and the number is still 16", () => {
    expect(roundOf(hostRound16)).toMatchObject({ number: 16, question_id: null, question_text: OWN_TEXT });
    expect(countOf(hostRound16)).toBe(16);
  });

  it("Następne pytanie after the list's last entry gets no_questions", () => {
    expect(nextAtListEnd).toMatchObject(refusal("no_questions"));
  });

  // Never a question that is not there: of the six candidates only Q17 and Q18 may still be drawn.
  it("Jeszcze 5 pytań after it gets exactly { ok: true } and adds only the 2 fresh candidates: the number is 18", () => {
    expect(moreAtListEnd).toEqual(OK);
    expect(countOf(hostRound17)).toBe(18);
  });

  it("round 17 is Q17: never the removed Q02, the reworded Q01 or a question played from the list", () => {
    expect(roundOf(hostRound17)).toMatchObject({ number: 17, question_id: Q17, question_text: null, phase: "voting" });
  });
});

describe("a game with a list, a proposal and a stale screen: Host, Ewa, Zosia and Kuba, a co-host", () => {
  let room: OwnRoom;
  let zosia: SeededGuest;
  let nextAtStop: Answer;
  let hostAtStop: Answer;
  let kubaApproves: Answer;
  let hostAfterApprove: Answer;
  let zosiaAfterApprove: Answer;
  let staleMore: Answer;
  let hostRound16: Answer;

  beforeAll(async () => {
    room = await seedRoom(host, { confirmClose: true });
    const ewa = await seedGuest(room.linkToken, "Ewa");
    zosia = await seedGuest(room.linkToken, "Zosia");
    const kuba = await seedGuest(room.linkToken, "Kuba");
    seed(await setCohost(host.client, room.id, "Kuba", true), "the co-host role for Kuba");
    seed(await proposeQuestion(anon, room.id, KINO, ewa.playerToken), "Ewa's proposal");

    // The list's 15 entries are Q01-Q15: rounds 1 to 14 are skipped, so round 15 is Q15.
    seed(await openQuestionList(host.client, room.id, CANDIDATES), "Przejrzyj pytania");
    await seedStartGame(host, room.id, Q20);
    await skipRounds(room.id, 1, 14, CANDIDATES);
    await seedReveal(host, room.id, 15);
    nextAtStop = await nextRound(host.client, room.id, 15, CANDIDATES);
    hostAtStop = await roomLobby(host.client, room.id);

    // Kuba approves Ewa's proposal; the host's screen still shows the stop, and its "Jeszcze 5 pytań" comes after.
    kubaApproves = await approveProposal(anon, room.id, 1, kuba.playerToken);
    hostAfterApprove = await roomLobby(host.client, room.id);
    zosiaAfterApprove = await roomLobby(anon, room.id, zosia.playerToken);
    staleMore = await moreQuestions(host.client, room.id, 15, CANDIDATES);
    hostRound16 = await roomLobby(host.client, room.id);

    seed(await endGame(host.client, room.id), "end_game");
  });

  it("the list's 15 entries are the game's questions: after round 15 Następne pytanie gets no_questions", () => {
    expect(nextAtStop).toMatchObject(refusal("no_questions"));
    expect(roundOf(hostAtStop)).toMatchObject({ number: 15, question_id: Q15, phase: "revealed" });
    expect(countOf(hostAtStop)).toBe(15);
  });

  it("Kuba, a co-host, approves Ewa's proposal: exactly { ok: true }, and the number is 16 for the host and for Zosia", () => {
    expect(kubaApproves).toEqual(OK);
    expect(countOf(hostAfterApprove)).toBe(16);
    expect(countOf(zosiaAfterApprove)).toBe(16);
  });

  it("the host's Jeszcze 5 pytań from the screen before the approval gets exactly { ok: true } and opens the approved question", () => {
    expect(staleMore).toEqual(OK);
    expect(roundOf(hostRound16)).toMatchObject({ number: 16, question_id: null, question_text: KINO, phase: "voting" });
  });

  it("the stale screen's move draws nothing: the number stays 16", () => {
    expect(countOf(hostRound16)).toBe(16);
  });
});

describe("what Jeszcze 5 pytań may add, and two leaders at once: Host, Ola, Bartek and Kuba, a co-host, with no list", () => {
  let room: OwnRoom;
  let tooMany: Answer;
  let noneFresh: Answer;
  let hostAfterRefusals: Answer;
  let threeFresh: Answer;
  let hostRound16: Answer;
  let nextAfter18: Answer;
  let atOnce: Answer[];
  let hostAfterAtOnce: Answer;
  let kubaAdultMore: Answer;
  let hostAfterAdultMore: Answer;

  beforeAll(async () => {
    room = await seedRoom(host, { confirmClose: true });
    await seedGuest(room.linkToken, "Ola");
    await seedGuest(room.linkToken, "Bartek");
    const kuba = await seedGuest(room.linkToken, "Kuba");
    seed(await setCohost(host.client, room.id, "Kuba", true), "the co-host role for Kuba");

    // Rounds 1 to 14 are skipped, so round 15 is Q15, revealed.
    await seedStartGame(host, room.id, Q01);
    await skipRounds(room.id, 1, 14, CANDIDATES);
    await seedReveal(host, room.id, 15);

    // Nothing to add: a list too long, then only played, malformed and missing ids.
    tooMany = await moreQuestions(host.client, room.id, 15, TOO_MANY);
    noneFresh = await moreQuestions(host.client, room.id, 15, [Q01, Q15, MALFORMED_ID, null]);
    hostAfterRefusals = await roomLobby(host.client, room.id);

    // F1, F2 and F3 are fresh, each of F1 and F2 twice, among played, malformed and missing ids.
    threeFresh = await moreQuestions(host.client, room.id, 15, [Q01, F1, F1, F2, MALFORMED_ID, null, F2, F3, Q15]);
    hostRound16 = await roomLobby(host.client, room.id);

    // Rounds 16 and 17 are skipped, so round 18, the last question, is F3; F4 and F5 are still fresh.
    await skipRounds(room.id, 16, 17, [...FRESH]);
    await seedReveal(host, room.id, 18);
    nextAfter18 = await nextRound(host.client, room.id, 18, [...FRESH]);

    // The host and Kuba press "Jeszcze 5 pytań" at the same moment.
    atOnce = await Promise.all([
      moreQuestions(host.client, room.id, 18, [F4, F5]),
      moreQuestions(anon, room.id, 18, [F4, F5], kuba.playerToken),
    ]);
    hostAfterAtOnce = await roomLobby(host.client, room.id);

    // Round 19 is skipped, so round 20, the last question, is F5. Kuba then sends only an 18+ question the host left
    // out: the probe of known hole F1, closed by S-17, kept for its test.
    await skipRounds(room.id, 19, 19, [F5]);
    await seedReveal(host, room.id, 20);
    kubaAdultMore = await moreQuestions(anon, room.id, 20, [ADULT_QUESTION_ID], kuba.playerToken);
    hostAfterAdultMore = await roomLobby(host.client, room.id);

    seed(await endGame(host.client, room.id), "end_game");
  });

  // F3 of *_round_number_required.sql, for this move too: malformed input from a client calling the database directly,
  // with no row's values in DETAIL.
  it("Jeszcze 5 pytań with 1001 candidates is refused whole with 22023", () => {
    expect(tooMany).toMatchObject({ data: null, error: { code: "22023", details: null } });
  });

  it("Jeszcze 5 pytań with no candidate to add, only played, malformed and missing ids, gets no_questions", () => {
    expect(noneFresh).toMatchObject(refusal("no_questions"));
  });

  it("after those refusals the number stays 15, and round 15, revealed, stays the latest", () => {
    expect(countOf(hostAfterRefusals)).toBe(15);
    expect(roundOf(hostAfterRefusals)).toMatchObject({ number: 15, phase: "revealed" });
  });

  // Never a question that is not there, and a repeated id is one question.
  it("with 3 fresh candidates, two of them sent twice, it gets exactly { ok: true } and adds 3: the number is 18", () => {
    expect(threeFresh).toEqual(OK);
    expect(countOf(hostRound16)).toBe(18);
  });

  it("round 16 is F1, the first fresh candidate in the Worker's order", () => {
    expect(roundOf(hostRound16)).toMatchObject({ number: 16, question_id: F1, phase: "voting" });
  });

  it("after round 18 Następne pytanie gets no_questions, with F4 and F5 still in the pool", () => {
    expect(nextAfter18).toMatchObject(refusal("no_questions"));
  });

  // Which leader gets through is the race's; only the lock on the room's row keeps the second out.
  it("two leaders making Jeszcze 5 pytań at once get exactly 1 × ok and 1 × round_over", () => {
    expect(outcomesOf(atOnce)).toEqual(["ok", "round_over"]);
  });

  it("after them the number grew once, by F4 and F5, to 20, and round 19, on F4, is the one round opened", () => {
    expect(countOf(hostAfterAtOnce)).toBe(20);
    expect(roundOf(hostAfterAtOnce)).toMatchObject({ number: 19, question_id: F4, phase: "voting" });
  });

  // Known hole F1 of context/changes/co-host-role/reviews/plan-review.md, the same as next_round's in
  // tests/db/cohost.test.ts, closed by S-17 (context/changes/question-pool-in-db/plan.md, Faza 2): the database checks
  // the host's choice itself (the picked categories, 18+ only where the host included it, FR-005), so a co-host calling
  // more_questions with the token of its own cookie adds and opens no question outside it. Round 20 is the game's last
  // question, so the refusal comes from the count of what may still be drawn, and nothing is written.
  it("Kuba's Jeszcze 5 pytań with an 18+ question the host left out is refused with exactly no_questions, and adds nothing", () => {
    expect(kubaAdultMore).toEqual({ error: null, data: { ok: false, reason: "no_questions" } });
    expect(countOf(hostAfterAdultMore)).toBe(20);
    expect(roundOf(hostAfterAdultMore)).toMatchObject({ number: 20, phase: "revealed" });
  });
});

// The room stays in the lobby, the last of this file.
describe("a list with every entry removed: Host, Ola and Bartek", () => {
  let hostAllRemoved: Answer;
  let startAllRemoved: Answer;

  beforeAll(async () => {
    // Three players, so a start can be refused for the list only.
    const room = await seedRoom(host, { confirmClose: true });
    await seedGuest(room.linkToken, "Ola");
    await seedGuest(room.linkToken, "Bartek");

    seed(await openQuestionList(host.client, room.id, [Q01, Q02]), "Przejrzyj pytania");
    seed(await removeListQuestion(host.client, room.id, 1), "Usuń of position 1");
    seed(await removeListQuestion(host.client, room.id, 2), "Usuń of position 2");
    hostAllRemoved = await roomLobby(host.client, room.id);
    startAllRemoved = await startGame(host.client, room.id, Q20);
  });

  it("the host sees question_count 0", () => {
    expect(hostAllRemoved).toMatchObject({ error: null, data: { status: "lobby", question_count: 0 } });
  });

  it("Zacznij grę gets list_empty", () => {
    expect(startAllRemoved).toMatchObject(refusal("list_empty"));
  });
});
