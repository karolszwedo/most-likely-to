import { beforeAll, describe, expect, it } from "vitest";
import type { QuestionId } from "@/data/questions";
import { anonClient, newHost, type Host } from "./support/clients";
import { isRecord, seedGuest, seedRoom, type OwnRoom, type SeededGuest } from "./support/rooms";
import {
  addOwnQuestion,
  drawListQuestion,
  editListQuestion,
  endGame,
  moreQuestions,
  nextRound,
  openQuestionList,
  removeListQuestion,
  roomLobby,
  roundOf,
  seedReveal,
  seedSkipRound,
  skipRound,
  startGame,
  type Answer,
} from "./support/rounds";

// The game's question list (S-06) through the roles' own doors: RPC with the publishable key, as the signed-in host and
// as the room's guests, past the Worker. Oracle: PRD FR-012 (before the start the host may review the drawn list of
// the game's questions: remove one, draw another, reword one, add their own; "start now" stays the default, and the
// list belongs to this game only) and Karol's decisions written in
// context/archive/2026-10-24-question-list-review/plan.md: the list appears on "Przejrzyj pytania" with 15 questions of
// the picked categories; "Dolosuj pytanie" adds one at the end; an own or reworded question has 1 to 90 characters,
// without the trailing "?"; the game plays the list first, in its order, then draws on from the picked categories,
// never a question removed or reworded; only the host sees the list, in the lobby and during the game (the questions
// left are counted from it). Since game-length (context/changes/game-length/plan.md, Karol's decisions at its top) the
// list's entries are the game's questions: after its last entry "Następne pytanie" opens nothing, and the game draws on
// only with "Jeszcze 5 pytań". Every list, position, id and text expected here is written out by hand from the
// scenario, never computed.
//
// open_question_list, draw_list_question, remove_list_question, edit_list_question, add_own_question, room_lobby's
// question_list and round.question_text come from supabase/migrations/*_question_list_review.sql. Without them
// PostgREST answers each new call with PGRST202 (no such function), and every test here is red on its own probe or on
// the state those calls should have made. Another host changing this host's list is round-rules.test.ts's to check,
// where the second host lives; a game started with no list is every other file's.
//
// One sign-up per run, in beforeAll. One open room per host, so the second room comes after the first one ends
// (confirm_close closes it should the end have failed); Vitest runs the suites in order, each suite's beforeAll right
// before its tests.

const anon = anonClient();

// The pool of "Przejrzyj pytania": the first 20 questions of the first seed category (SEED_CATEGORIES in
// support/rooms.ts), none 18+, in the order the Worker shuffled them into. `satisfies` makes the build fail if an id
// ever leaves the base; since S-17 the database checks itself that each id is of the base and of the room's choice.
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
// On the list: position 1, reworded by the host; position 2, removed; positions 3 and 4, rounds 2 and 3.
const Q01 = "na-co-dzien-001" satisfies QuestionId;
const Q02 = "na-co-dzien-002" satisfies QuestionId;
const Q03 = "na-co-dzien-003" satisfies QuestionId;
const Q04 = "na-co-dzien-004" satisfies QuestionId;
// Off the list after "Przejrzyj pytania": drawn with "Dolosuj pytanie", fresh after the list, and the p_question_id of
// a start that the list makes meaningless.
const Q16 = "na-co-dzien-016" satisfies QuestionId;
const Q17 = "na-co-dzien-017" satisfies QuestionId;
const Q20 = "na-co-dzien-020" satisfies QuestionId;
// A real id in capitals: not the id format, so the candidates' filter skips it, as it skips null.
const MALFORMED_ID = "NA-CO-DZIEN-001";
// "Przejrzyj pytania" gets the pool with a malformed id, a null and a repeat of the first question among it.
const OPEN_CANDIDATES = [MALFORMED_ID, Q01, null, Q02, Q01, ...POOL.slice(2)];
// More candidates than the limit (a game sends at most 400), none in the id format, so a database without the limit
// answers no_questions and writes nothing.
const TOO_MANY = Array<string>(1001).fill(MALFORMED_ID);
// The Worker's candidates for every next question here: [removed, reworded, fresh]. While the list lasts its entries
// come first; after it only the fresh one may.
const AFTER_LIST = [Q02, Q01, Q17];

// The list after "Przejrzyj pytania": the first 15 distinct candidates of the room's choice (S-17; the malformed id and
// the null drop out, the repeat counts once), at positions 1-15.
const OPENED = [
  { position: 1, question_id: "na-co-dzien-001", text: null },
  { position: 2, question_id: "na-co-dzien-002", text: null },
  { position: 3, question_id: "na-co-dzien-003", text: null },
  { position: 4, question_id: "na-co-dzien-004", text: null },
  { position: 5, question_id: "na-co-dzien-005", text: null },
  { position: 6, question_id: "na-co-dzien-006", text: null },
  { position: 7, question_id: "na-co-dzien-007", text: null },
  { position: 8, question_id: "na-co-dzien-008", text: null },
  { position: 9, question_id: "na-co-dzien-009", text: null },
  { position: 10, question_id: "na-co-dzien-010", text: null },
  { position: 11, question_id: "na-co-dzien-011", text: null },
  { position: 12, question_id: "na-co-dzien-012", text: null },
  { position: 13, question_id: "na-co-dzien-013", text: null },
  { position: 14, question_id: "na-co-dzien-014", text: null },
  { position: 15, question_id: "na-co-dzien-015", text: null },
];

// "Popraw" of position 1, typed with the "?" the screen adds itself; stored without it.
const REWORDED = "wypiłby mleko prosto z kartonu?";
const REWORDED_STORED = "wypiłby mleko prosto z kartonu";
// "Dodaj własne": exactly 90 characters, the most a question may have.
const OWN_TEXT = "zabrałby na biwak namiot bez śledzi, cztery latarki bez baterii i ani jednej łyżki do zupy";
// 91 characters: one over the limit.
const TOO_LONG_TEXT = "zabrałby na biwak namiot bez śledzi, cztery latarki bez baterii i ani jednej łyżki do zupek";
// A good question after 395 spaces: 16 characters once normalized, but 411 as sent, over the cap of 400.
const PADDED_TEXT = " ".repeat(395) + "zasnąłby w kinie";

// The question_list of a room_lobby answer; undefined when the answer has none (a failed call included). Never throws.
function questionListOf(answer: Answer): unknown {
  return isRecord(answer.data) ? answer.data.question_list : undefined;
}

// The entries of the host's list, or [] when there are none to read. Never throws.
function entriesOf(answer: Answer): unknown[] {
  const list = questionListOf(answer);
  return isRecord(list) && Array.isArray(list.entries) ? (list.entries as unknown[]) : [];
}

// The positions of the host's entries, in the order the answer lists them. Never throws.
function positionsOf(answer: Answer): unknown[] {
  return entriesOf(answer).map((entry) => (isRecord(entry) ? entry.position : null));
}

// A move on the list that is a precondition, not the thing under test. Throws on any failure: beforeAll only. The
// function's own refusal code, never its arguments.
async function seedListMove(move: Promise<Answer>, fn: string): Promise<void> {
  const answer = await move;
  if (answer.error !== null || !isRecord(answer.data) || answer.data.ok !== true) {
    const reason = isRecord(answer.data) && typeof answer.data.reason === "string" ? answer.data.reason : null;
    throw new Error(`${fn} refused the seed move: ${answer.error?.code ?? reason ?? "an unexpected shape"}`);
  }
}

let host: Host;

beforeAll(async () => {
  host = await newHost();
});

// The lobby and the game play out once, in order, in beforeAll: every move on the list, the rounds through the whole
// list and one past it, and every refused try between them. Each step's answer is kept and checked by its own test, so
// no test depends on another one having run.
describe("a game from the list: Host, Ola and Bartek review it, then play it through", () => {
  let room: OwnRoom;
  let ola: SeededGuest;
  let bartek: SeededGuest;
  // Przejrzyj pytania.
  let openWithTooMany: Answer;
  let hostBeforeOpen: Answer;
  let openList: Answer;
  let hostOpened: Answer;
  let olaOpened: Answer;
  let openAgain: Answer;
  let hostOpenedAgain: Answer;
  // Usuń and Popraw.
  let removeSecond: Answer;
  let hostAfterRemove: Answer;
  let removeSecondAgain: Answer;
  let removeNoEntry: Answer;
  let editFirst: Answer;
  let hostAfterEdit: Answer;
  let editTooLong: Answer;
  let editOnlySpaces: Answer;
  let editRemoved: Answer;
  // Dodaj własne and Dolosuj pytanie.
  let addOwn: Answer;
  let hostAfterAdd: Answer;
  let addPadded: Answer;
  let draw: Answer;
  let hostAfterDraw: Answer;
  let drawNoneLeft: Answer;
  let drawWithTooMany: Answer;
  // A guest trying the host's moves on the list.
  let guestOpens: Answer;
  let guestDraws: Answer;
  let guestRemoves: Answer;
  let guestEdits: Answer;
  let guestAdds: Answer;
  // The game: the list first.
  let start: Answer;
  let hostRound1: Answer;
  let olaRound1: Answer;
  let nextToThird: Answer;
  let hostRound2: Answer;
  let skipSecond: Answer;
  let bartekRound3: Answer;
  let olaOwnRound: Answer;
  let hostLastOnList: Answer;
  // After the list.
  let nextAtListEnd: Answer;
  let nextAfterList: Answer;
  let hostAfterList: Answer;
  // The list's moves while the game is in play.
  let openInPlay: Answer;
  let drawInPlay: Answer;
  let removeInPlay: Answer;
  let editInPlay: Answer;
  let addInPlay: Answer;
  // The end.
  let end: Answer;
  let hostAfterEnd: Answer;
  let openClosed: Answer;
  let drawClosed: Answer;
  let removeClosed: Answer;
  let editClosed: Answer;
  let addClosed: Answer;

  beforeAll(async () => {
    room = await seedRoom(host);
    ola = await seedGuest(room.linkToken, "Ola");
    bartek = await seedGuest(room.linkToken, "Bartek");

    // A list too long, before the list exists: refused whole, before the candidates are even looked at.
    openWithTooMany = await openQuestionList(host.client, room.id, TOO_MANY);
    hostBeforeOpen = await roomLobby(host.client, room.id);

    // "Przejrzyj pytania", then again from another screen with the pool in another order.
    openList = await openQuestionList(host.client, room.id, OPEN_CANDIDATES);
    hostOpened = await roomLobby(host.client, room.id);
    olaOpened = await roomLobby(anon, room.id, ola.playerToken);
    openAgain = await openQuestionList(host.client, room.id, [...POOL].reverse());
    hostOpenedAgain = await roomLobby(host.client, room.id);

    // "Usuń" of position 2, twice (a double click), and of a position with no entry yet.
    removeSecond = await removeListQuestion(host.client, room.id, 2);
    hostAfterRemove = await roomLobby(host.client, room.id);
    removeSecondAgain = await removeListQuestion(host.client, room.id, 2);
    removeNoEntry = await removeListQuestion(host.client, room.id, 16);

    // "Popraw" of position 1. The refused texts go to position 3, which round 2 later shows as the base has it.
    editFirst = await editListQuestion(host.client, room.id, 1, REWORDED);
    hostAfterEdit = await roomLobby(host.client, room.id);
    editTooLong = await editListQuestion(host.client, room.id, 3, TOO_LONG_TEXT);
    editOnlySpaces = await editListQuestion(host.client, room.id, 3, "   ");
    editRemoved = await editListQuestion(host.client, room.id, 2, "zasnąłby w kinie");

    // "Dodaj własne" with 90 characters, then a text over the cap as sent.
    addOwn = await addOwnQuestion(host.client, room.id, OWN_TEXT);
    hostAfterAdd = await roomLobby(host.client, room.id);
    addPadded = await addOwnQuestion(host.client, room.id, PADDED_TEXT);

    // "Dolosuj pytanie": the malformed candidates, Q01 (reworded) and Q02 (removed) are skipped, so Q16 comes up. Then
    // a pool with nothing off the list, and a list too long.
    draw = await drawListQuestion(host.client, room.id, [MALFORMED_ID, null, Q01, Q02, Q16, Q17]);
    hostAfterDraw = await roomLobby(host.client, room.id);
    drawNoneLeft = await drawListQuestion(host.client, room.id, [Q01, Q02, Q16]);
    drawWithTooMany = await drawListQuestion(host.client, room.id, TOO_MANY);

    // A guest has no grant on any move of the list. Arguments a host's call would take, so the grant is the only
    // thing they can be refused for.
    guestOpens = await openQuestionList(anon, room.id, [Q17]);
    guestDraws = await drawListQuestion(anon, room.id, [Q17]);
    guestRemoves = await removeListQuestion(anon, room.id, 3);
    guestEdits = await editListQuestion(anon, room.id, 3, "zasnąłby w kinie");
    guestAdds = await addOwnQuestion(anon, room.id, "zasnąłby w kinie");

    // "Zacznij grę" with Q20, which is not on the list: the list's first entry is round 1 all the same.
    start = await startGame(host.client, room.id, Q20);
    hostRound1 = await roomLobby(host.client, room.id);
    olaRound1 = await roomLobby(anon, room.id, ola.playerToken);

    // Round 2 after the reveal: position 2 is removed, so position 3 (Q03) comes up, not a candidate.
    await seedReveal(host, room.id, 1);
    nextToThird = await nextRound(host.client, room.id, 1, AFTER_LIST);
    hostRound2 = await roomLobby(host.client, room.id);
    // Round 3 after a skip: the next entry, position 4 (Q04).
    skipSecond = await skipRound(host.client, room.id, 2, AFTER_LIST);
    bartekRound3 = await roomLobby(anon, room.id, bartek.playerToken);

    // Rounds 3 to 14 (positions 4 to 15) skipped one after another: round 15 is position 16, the own question.
    for (let round = 3; round <= 14; round++) {
      await seedSkipRound(host, room.id, round, AFTER_LIST);
    }
    olaOwnRound = await roomLobby(anon, room.id, ola.playerToken);
    // Round 16 is position 17, the drawn Q16: the list's last entry.
    await seedSkipRound(host, room.id, 15, AFTER_LIST);
    hostLastOnList = await roomLobby(host.client, room.id);

    // Round 17 after the reveal: the list is played, and its 16 entries are the game's 16 questions, so "Następne
    // pytanie" opens nothing and "Jeszcze 5 pytań" draws from the candidates. Q02 was removed and Q01 reworded: neither
    // was played, so only the list keeps them out, and Q17 comes up.
    await seedReveal(host, room.id, 16);
    nextAtListEnd = await nextRound(host.client, room.id, 16, AFTER_LIST);
    nextAfterList = await moreQuestions(host.client, room.id, 16, AFTER_LIST);
    hostAfterList = await roomLobby(host.client, room.id);

    // The list's moves while round 17 is voting, after every round the list gave: a move that got through could not
    // change a round above.
    openInPlay = await openQuestionList(host.client, room.id, [Q20]);
    drawInPlay = await drawListQuestion(host.client, room.id, [Q20]);
    removeInPlay = await removeListQuestion(host.client, room.id, 3);
    editInPlay = await editListQuestion(host.client, room.id, 3, "zasnąłby w kinie");
    addInPlay = await addOwnQuestion(host.client, room.id, "zasnąłby w kinie");

    // "Zakończ grę", then the list's moves in the closed room.
    end = await endGame(host.client, room.id);
    hostAfterEnd = await roomLobby(host.client, room.id);
    openClosed = await openQuestionList(host.client, room.id, [Q20]);
    drawClosed = await drawListQuestion(host.client, room.id, [Q20]);
    removeClosed = await removeListQuestion(host.client, room.id, 3);
    editClosed = await editListQuestion(host.client, room.id, 3, "zasnąłby w kinie");
    addClosed = await addOwnQuestion(host.client, room.id, "zasnąłby w kinie");
  });

  // F3 of *_round_number_required.sql, for the list too: a malformed list from a client calling the database directly;
  // no row's values in DETAIL.
  it("open_question_list with 1001 candidates is refused whole with 22023", () => {
    expect(openWithTooMany).toMatchObject({ error: { code: "22023", details: null } });
  });

  it("before Przejrzyj pytania the host's question_list is null", () => {
    expect(hostBeforeOpen).toMatchObject({ error: null, data: { status: "lobby", question_list: null } });
  });

  // Positive control: an allowed move must work, or a wrong address would look like a refusal everywhere.
  it("positive control: open_question_list as the host gets ok: true", () => {
    expect(openList).toMatchObject({ error: null, data: { ok: true } });
  });

  // FR-012: 15 questions of the picked categories, in the Worker's order; the malformed id, null and the repeat of Q01
  // are skipped, so the positions run 1 to 15 with no gap.
  it("the host sees exactly 15 entries, Q01 to Q15 at positions 1-15, and base_count: 15", () => {
    expect(hostOpened).toMatchObject({ error: null, data: { question_list: { entries: OPENED, base_count: 15 } } });
  });

  // Break-check A of the plan (room_lobby gives a guest the list) turns this test and the one in play red, and only
  // them.
  it("in the lobby a guest sees question_list: null while the host's list is open", () => {
    expect(olaOpened).toMatchObject({ error: null, data: { status: "lobby", question_list: null } });
  });

  it("opening the list again, with the pool in another order, gets ok: true and changes nothing", () => {
    expect(openAgain).toMatchObject({ error: null, data: { ok: true } });
    expect(hostOpenedAgain).toMatchObject({
      error: null,
      data: { question_list: { entries: OPENED, base_count: 15 } },
    });
  });

  it("Usuń of position 2 gets ok: true; position 2 leaves the entries and base_count stays 15", () => {
    expect(removeSecond).toMatchObject({ error: null, data: { ok: true } });
    expect(positionsOf(hostAfterRemove)).toEqual([1, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15]);
    expect(hostAfterRemove).toMatchObject({ error: null, data: { question_list: { base_count: 15 } } });
  });

  it.each([
    { move: "Usuń of position 2 again", answer: () => removeSecondAgain },
    { move: "Usuń of position 16, with no entry yet", answer: () => removeNoEntry },
    { move: "Popraw of the removed position 2", answer: () => editRemoved },
  ])("$move gets question_unknown", ({ answer }) => {
    expect(answer()).toMatchObject({ error: null, data: { ok: false, reason: "question_unknown" } });
  });

  // The screen adds the "?" itself; the entry keeps its question id, so that wording never comes up after the list.
  it("Popraw of position 1 gets ok: true and the entry is Q01 with the text, without the trailing ?", () => {
    expect(editFirst).toMatchObject({ error: null, data: { ok: true } });
    expect(entriesOf(hostAfterEdit)[0]).toEqual({ position: 1, question_id: Q01, text: REWORDED_STORED });
  });

  it.each([
    { move: "Popraw with 91 characters", answer: () => editTooLong },
    { move: "Popraw with only spaces", answer: () => editOnlySpaces },
    { move: "Dodaj własne with 411 characters as sent, 16 once normalized", answer: () => addPadded },
  ])("$move gets invalid_question_text", ({ answer }) => {
    expect(answer()).toMatchObject({ error: null, data: { ok: false, reason: "invalid_question_text" } });
  });

  it("Dodaj własne with 90 characters gets ok: true and the entry comes last, at position 16, with no question id", () => {
    expect(addOwn).toMatchObject({ error: null, data: { ok: true } });
    expect(entriesOf(hostAfterAdd).at(-1)).toEqual({ position: 16, question_id: null, text: OWN_TEXT });
  });

  it("Dolosuj pytanie gets ok: true and Q16, the first candidate off the list, comes last, at position 17", () => {
    expect(draw).toMatchObject({ error: null, data: { ok: true } });
    expect(entriesOf(hostAfterDraw).at(-1)).toEqual({ position: 17, question_id: Q16, text: null });
  });

  it("Dolosuj pytanie with every candidate on the list already gets no_questions", () => {
    expect(drawNoneLeft).toMatchObject({ error: null, data: { ok: false, reason: "no_questions" } });
  });

  it("Dolosuj pytanie with 1001 candidates is refused whole with 22023", () => {
    expect(drawWithTooMany).toMatchObject({ error: { code: "22023", details: null } });
  });

  // Only the host reviews the list: no grant to anon, so the function's name is checked, not only 42501 (G2).
  it.each([
    { fn: "open_question_list", answer: () => guestOpens },
    { fn: "draw_list_question", answer: () => guestDraws },
    { fn: "remove_list_question", answer: () => guestRemoves },
    { fn: "edit_list_question", answer: () => guestEdits },
    { fn: "add_own_question", answer: () => guestAdds },
  ])("a guest calling $fn is refused permission on the function", ({ fn, answer }) => {
    expect(answer().error?.code).toBe("42501");
    expect(answer().error?.message).toContain(`function ${fn}`);
  });

  it("Zacznij grę with a question off the list gets ok: true", () => {
    expect(start).toMatchObject({ error: null, data: { ok: true } });
  });

  // The list's first entry, reworded: no question id, so S-11's data under Q01 never gets the host's wording.
  it("round 1 is position 1: no question_id, and question_text is the host's wording", () => {
    expect(roundOf(hostRound1)).toMatchObject({
      number: 1,
      question_id: null,
      question_text: REWORDED_STORED,
      phase: "voting",
    });
  });

  it("a guest sees round 1 with the same question_text", () => {
    expect(roundOf(olaRound1)).toMatchObject({ number: 1, question_id: null, question_text: REWORDED_STORED });
  });

  // The Worker counts the questions left from the list during the game: 15 drawn and 1 drawn later have an id of the
  // base, the own question has none; the removed position 2 counts in base_count, not among the entries.
  it("while the game is in play the host still gets the list: 16 entries and base_count: 16", () => {
    expect(positionsOf(hostRound1)).toEqual([1, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17]);
    expect(hostRound1).toMatchObject({ error: null, data: { status: "playing", question_list: { base_count: 16 } } });
  });

  it("while the game is in play a guest still sees question_list: null", () => {
    expect(olaRound1).toMatchObject({ error: null, data: { status: "playing", question_list: null } });
  });

  it("Następne pytanie after round 1 gets ok: true", () => {
    expect(nextToThird).toMatchObject({ error: null, data: { ok: true } });
  });

  // Position 2 was removed, and the refused rewordings of position 3 changed nothing.
  it("round 2 is position 3: Q03 as the base has it, question_text null", () => {
    expect(roundOf(hostRound2)).toMatchObject({ number: 2, question_id: Q03, question_text: null, phase: "voting" });
  });

  it("Pomiń pytanie in round 2 gets ok: true and round 3 is the list's next entry, position 4 (Q04)", () => {
    expect(skipSecond).toMatchObject({ error: null, data: { ok: true } });
    expect(roundOf(bartekRound3)).toMatchObject({
      number: 3,
      question_id: Q04,
      question_text: null,
      phase: "voting",
      after_skip: true,
    });
  });

  it("round 15 is position 16, the own question: a guest sees no question_id and its text", () => {
    expect(roundOf(olaOwnRound)).toMatchObject({
      number: 15,
      question_id: null,
      question_text: OWN_TEXT,
      phase: "voting",
    });
  });

  it("round 16 is position 17, the drawn Q16", () => {
    expect(roundOf(hostLastOnList)).toMatchObject({ number: 16, question_id: Q16, question_text: null });
  });

  // game-length: the list's 16 entries are the game's 16 questions.
  it("Następne pytanie after the list's last entry gets no_questions", () => {
    expect(nextAtListEnd).toMatchObject({ error: null, data: { ok: false, reason: "no_questions" } });
  });

  it("Jeszcze 5 pytań after the list's last entry gets ok: true", () => {
    expect(nextAfterList).toMatchObject({ error: null, data: { ok: true } });
  });

  // Break-check B of the plan (the candidates after the list do not skip those on the list; since game-length they are
  // private.unplayed_candidates, which "Jeszcze 5 pytań" counts and private.open_next_round takes from) turns this test
  // red, and only this one: the rounds of the list come before it, and "Jeszcze 5 pytań" gets ok either way.
  it("after the list, the candidates [Q02 removed, Q01 reworded, Q17] give round 17 the fresh Q17", () => {
    expect(roundOf(hostAfterList)).toMatchObject({ number: 17, question_id: Q17, question_text: null });
  });

  it.each([
    { fn: "open_question_list", answer: () => openInPlay },
    { fn: "draw_list_question", answer: () => drawInPlay },
    { fn: "remove_list_question", answer: () => removeInPlay },
    { fn: "edit_list_question", answer: () => editInPlay },
    { fn: "add_own_question", answer: () => addInPlay },
  ])("$fn while the game is in play gets game_started", ({ answer }) => {
    expect(answer()).toMatchObject({ error: null, data: { ok: false, reason: "game_started" } });
  });

  it("end_game gets ok: true, and the host still gets the list of the closed room", () => {
    expect(end).toMatchObject({ error: null, data: { ok: true } });
    expect(hostAfterEnd).toMatchObject({ error: null, data: { status: "closed", question_list: { base_count: 16 } } });
  });

  it.each([
    { fn: "open_question_list", answer: () => openClosed },
    { fn: "draw_list_question", answer: () => drawClosed },
    { fn: "remove_list_question", answer: () => removeClosed },
    { fn: "edit_list_question", answer: () => editClosed },
    { fn: "add_own_question", answer: () => addClosed },
  ])("$fn in the closed room gets room_closed", ({ answer }) => {
    expect(answer()).toMatchObject({ error: null, data: { ok: false, reason: "room_closed" } });
  });
});

// The list's edges, in a room of its own: the main room stays at 17 rows, so its game reaches the end of the list in
// 16 rounds. A start with no list is every other file's.
describe("a second room: a list with every entry removed, then 100 rows", () => {
  let room: OwnRoom;
  let hostAllRemoved: Answer;
  let startAllRemoved: Answer;
  let addToFull: Answer;
  let drawToFull: Answer;

  beforeAll(async () => {
    // Closes the first room, should ending it have failed. Three players, so a start can be refused for the list only.
    room = await seedRoom(host, { confirmClose: true });
    await seedGuest(room.linkToken, "Ola");
    await seedGuest(room.linkToken, "Bartek");

    // 15 entries, every one removed.
    await seedListMove(openQuestionList(host.client, room.id, [...POOL]), "open_question_list");
    for (let position = 1; position <= 15; position++) {
      await seedListMove(removeListQuestion(host.client, room.id, position), "remove_list_question");
    }
    hostAllRemoved = await roomLobby(host.client, room.id);
    startAllRemoved = await startGame(host.client, room.id, Q20);

    // 85 own questions on top of the 15 removed rows: 100 rows, the most a list holds.
    for (let n = 1; n <= 85; n++) {
      await seedListMove(
        addOwnQuestion(host.client, room.id, `zgubiłby kartkę z pytaniem numer ${n}`),
        "add_own_question",
      );
    }
    addToFull = await addOwnQuestion(host.client, room.id, OWN_TEXT);
    drawToFull = await drawListQuestion(host.client, room.id, [Q20]);
  });

  it("with every entry removed the host sees entries: [] and base_count: 15", () => {
    expect(hostAllRemoved).toMatchObject({ error: null, data: { question_list: { entries: [], base_count: 15 } } });
  });

  it("Zacznij grę with every entry removed gets list_empty", () => {
    expect(startAllRemoved).toMatchObject({ error: null, data: { ok: false, reason: "list_empty" } });
  });

  it.each([
    { move: "Dodaj własne", answer: () => addToFull },
    { move: "Dolosuj pytanie", answer: () => drawToFull },
  ])("$move with 100 rows on the list gets list_full", ({ answer }) => {
    expect(answer()).toMatchObject({ error: null, data: { ok: false, reason: "list_full" } });
  });
});
