import { beforeAll, describe, expect, it } from "vitest";
import { anonClient, newHost, type Host } from "./support/clients";
import { seedGuest, seedRoom, type OwnRoom, type SeededGuest } from "./support/rooms";
import {
  EVENING_QUESTION_IDS,
  castVote,
  endGame,
  joinRoom,
  nextRound,
  revealRound,
  roomLink,
  roomLobby,
  roundOf,
  seedReveal,
  seedStartGame,
  seedVote,
  skipRound,
  type Answer,
} from "./support/rounds";

// The evening's rules (#3) through the roles' own doors: RPC with the publishable key, as guests and as the signed-in
// host, past the Worker. Oracle: PRD FR-006 (the host moves on to the next question, skips a round, whose votes are
// lost, and ends the game after a confirmation), FR-015 (no question twice in one game) and the decisions of
// context/archive/2026-10-15-full-game-evening/research.md: D1 (the Worker sends the pool in its own order and the
// database takes the first question not played yet), D2 (a skip only while voting, with the next question at once;
// skipping the last question does not end the game), D3 (a skipped round keeps no count), D4 (ending the game closes
// the room) and T1 (a vote and the host's moves carry the number of the question on screen; another number is
// round_over), plus the fixes of context/archive/2026-10-20-deferred-review-fixes/plan.md with the cases of
// context/domain/02-invariant-aggregate-refactor.md §5.3: F2 (a vote and "Odsłoń wynik" with no question number or
// another one are round_over, and so is a reveal of a skipped round; I2, I7-I10, I15) and F3 (malformed candidates are
// ignored like played ones, and a list longer than 1000 is refused whole with 22023). Every expected question, round
// number and count is written out by hand from the scenario, never computed.
//
// next_round, skip_round, end_game and cast_vote's p_round come from supabase/migrations/*_full_game_evening.sql,
// reveal_round's p_round and the candidates' limit from *_round_number_required.sql. Without them PostgREST answers
// each of those calls with PGRST202 (no such function), and every test here is red on its own probe or on the state
// those calls should have made.
//
// One sign-up per run, in beforeAll. One open room per host, so the rooms come one after another (confirm_close closes
// the one before); Vitest runs the suites in order, each suite's beforeAll right before its tests.

const anon = anonClient();
const [Q1, Q2, Q3, Q4] = EVENING_QUESTION_IDS;
// The whole pool, as the Worker would send it at any point of this file's evening.
const POOL = [Q1, Q2, Q3, Q4];
// A real id in capitals: not the id format, so the candidates' filter ignores it, as it ignores null.
const MALFORMED_ID = "NA-CO-DZIEN-001";
// More candidates than the limit (a game sends at most 400): Q1, in the id format and played in every room here, so a
// database without the limit answers no_questions and writes nothing.
const TOO_MANY = Array<string>(1001).fill(Q1);

let host: Host;

beforeAll(async () => {
  host = await newHost();
});

// The evening plays out once, in order, in beforeAll: every move and every refused try between them. Each step's
// answer is kept and checked by its own test, so no test depends on another one having run.
describe("an evening: Host, Ola and Bartek through four questions", () => {
  let room: OwnRoom;
  let ola: SeededGuest;
  let bartek: SeededGuest;
  // Round 2: the next question.
  let nextAfterReveal: Answer;
  let olaRound2View: Answer;
  let olaVotesWithNoNumber: Answer;
  let revealFromOldScreen: Answer;
  let nextWhileVoting: Answer;
  let nextFromOldScreen: Answer;
  let hostRound2View: Answer;
  let bartekLateForRound1: Answer;
  // Round 3: after a skip.
  let skipWhileVoting: Answer;
  let olaRound3View: Answer;
  let bartekLateForRound2: Answer;
  let skipSentAgain: Answer;
  let hostRound3View: Answer;
  let olaVotesWithNumber: Answer;
  let revealWithNoNumber: Answer;
  let hostRound3AfterRefusedReveal: Answer;
  let round3Revealed: Answer;
  let skipAfterReveal: Answer;
  // Round 4: the last question, skipped.
  let nextWithNoneLeft: Answer;
  let nextWithOnlyMalformed: Answer;
  let nextWithTooMany: Answer;
  let hostAfterNoneLeft: Answer;
  let nextToLastQuestion: Answer;
  let olaRound4View: Answer;
  let skipLastQuestion: Answer;
  let olaSkippedView: Answer;
  let olaVotesOnSkipped: Answer;
  let revealSkipped: Answer;
  let nextAfterLastSkip: Answer;
  // The end.
  let endAfterLastSkip: Answer;
  let olaEndView: Answer;
  let olaVotesAfterEnd: Answer;
  let revealAfterEnd: Answer;

  beforeAll(async () => {
    room = await seedRoom(host);
    ola = await seedGuest(room.linkToken, "Ola");
    bartek = await seedGuest(room.linkToken, "Bartek");

    // Round 1: Ola votes; Bartek is still choosing when the host reveals.
    await seedStartGame(host, room.id, Q1);
    await seedVote(anon, room.id, "Bartek", ola.playerToken, 1);
    await seedReveal(host, room.id, 1);

    // Round 2: the pool starts with Q1, which was played, so Q2 comes up.
    nextAfterReveal = await nextRound(host.client, room.id, 1, [Q1, Q2]);
    olaRound2View = await roomLobby(anon, room.id, ola.playerToken);
    // A vote with no question number: nobody can tell which question its voter saw (T1, F2).
    olaVotesWithNoNumber = await castVote(anon, room.id, "Bartek", ola.playerToken);
    // Ola's vote with round 2's number, as her screen sends it: round 2 holds her vote until the skip.
    await seedVote(anon, room.id, "Bartek", ola.playerToken, 2);
    // The host's second screen, still on round 1, sends "Odsłoń wynik": it must not reveal round 2, which it has not
    // shown (I8).
    revealFromOldScreen = await revealRound(host.client, room.id, 1);
    nextWhileVoting = await nextRound(host.client, room.id, 2, POOL);
    // The host's own screen still on round 1, or the same click sent twice.
    nextFromOldScreen = await nextRound(host.client, room.id, 1, POOL);
    hostRound2View = await roomLobby(host.client, room.id);
    // Bartek's screen still shows Q1 and sends his choice now. He has not voted in round 2, so the number is the only
    // thing it can be refused for.
    bartekLateForRound1 = await castVote(anon, room.id, "Ola", bartek.playerToken, 1);

    // Round 3: the host skips round 2 while it is voting; Q1 and Q2 were played, so Q3 comes up.
    skipWhileVoting = await skipRound(host.client, room.id, 2, [Q1, Q2, Q3]);
    olaRound3View = await roomLobby(anon, room.id, ola.playerToken);
    // Bartek's screen still shows the skipped Q2. He has not voted in round 3.
    bartekLateForRound2 = await castVote(anon, room.id, "Ola", bartek.playerToken, 2);
    // The skip sent twice: it must not skip round 3, which nobody has answered yet.
    skipSentAgain = await skipRound(host.client, room.id, 2, POOL);
    hostRound3View = await roomLobby(host.client, room.id);
    olaVotesWithNumber = await castVote(anon, room.id, "Bartek", ola.playerToken, 3);
    // "Odsłoń wynik" with no question number. Right before the seed's reveal: a database that takes it reveals round 3
    // just as the seed does, so the rest of the evening does not depend on the answer.
    revealWithNoNumber = await revealRound(host.client, room.id);
    hostRound3AfterRefusedReveal = await roomLobby(host.client, room.id);
    await seedReveal(host, room.id, 3);
    round3Revealed = await roomLobby(host.client, room.id);
    skipAfterReveal = await skipRound(host.client, room.id, 3, POOL);

    // Round 4: Q1, Q2 and Q3 were played, so a pool of those three has nothing left; the whole pool has Q4.
    nextWithNoneLeft = await nextRound(host.client, room.id, 3, [Q1, Q2, Q3]);
    // F3: malformed candidates are never a question, so these two leave nothing to open either.
    nextWithOnlyMalformed = await nextRound(host.client, room.id, 3, [MALFORMED_ID, null]);
    // F3: a list longer than the limit is refused whole, before the candidates are even looked at.
    nextWithTooMany = await nextRound(host.client, room.id, 3, TOO_MANY);
    hostAfterNoneLeft = await roomLobby(host.client, room.id);
    // F3: the filter ignores the malformed candidates and takes Q4, the first good one not played yet.
    nextToLastQuestion = await nextRound(host.client, room.id, 3, [MALFORMED_ID, null, Q4]);
    olaRound4View = await roomLobby(anon, room.id, ola.playerToken);
    // Skipping the last question: no question is left to open, and the game goes on until the host ends it (D2).
    skipLastQuestion = await skipRound(host.client, room.id, 4, POOL);
    olaSkippedView = await roomLobby(anon, room.id, ola.playerToken);
    // Ola's screen still shows question 4, which was skipped.
    olaVotesOnSkipped = await castVote(anon, room.id, "Bartek", ola.playerToken, 4);
    // "Odsłoń wynik" from a screen still on question 4, which was skipped: its votes are gone, nothing is left to show.
    revealSkipped = await revealRound(host.client, room.id, 4);
    nextAfterLastSkip = await nextRound(host.client, room.id, 4, POOL);

    // "Zakończ grę" once the questions ran out.
    endAfterLastSkip = await endGame(host.client, room.id);
    olaEndView = await roomLobby(anon, room.id, ola.playerToken);
    // Screens that still show question 4 after the end.
    olaVotesAfterEnd = await castVote(anon, room.id, "Bartek", ola.playerToken, 4);
    revealAfterEnd = await revealRound(host.client, room.id, 4);
  });

  // Positive control: the first next question must work, or a wrong address would look like a refusal everywhere.
  it("positive control: next_round after the reveal gets ok: true", () => {
    expect(nextAfterReveal).toMatchObject({ error: null, data: { ok: true } });
  });

  // FR-015: Q1 was played, so the first candidate left is Q2. Ola voted in round 1; round 2 starts with nobody's vote.
  it("Ola, who voted in round 1, sees round 2 with Q2, voting, nobody voted yet and no skip before it", () => {
    expect(olaRound2View).toMatchObject({
      error: null,
      data: {
        status: "playing",
        round: { number: 2, question_id: Q2, phase: "voting", voted: [], me_voted: false, after_skip: false },
      },
    });
  });

  // T1 and F2 (I2): the number is not optional; a vote without it lands in no question.
  it("a vote with no question number in round 2 gets round_over", () => {
    expect(olaVotesWithNoNumber).toMatchObject({ error: null, data: { ok: false, reason: "round_over" } });
  });

  it("Odsłoń wynik from a screen still on round 1, sent while round 2 is voting, gets round_over", () => {
    expect(revealFromOldScreen).toMatchObject({ error: null, data: { ok: false, reason: "round_over" } });
  });

  it("next_round while round 2 is voting gets round_in_progress", () => {
    expect(nextWhileVoting).toMatchObject({ error: null, data: { ok: false, reason: "round_in_progress" } });
  });

  it("next_round from a screen still on round 1 gets round_over", () => {
    expect(nextFromOldScreen).toMatchObject({ error: null, data: { ok: false, reason: "round_over" } });
  });

  // I15: no refusal moved the game or touched the votes.
  it("after the refused reveal and both refused next_round calls the game is still in round 2 with Q2, voting, with Ola's vote in it", () => {
    expect(hostRound2View).toMatchObject({
      error: null,
      data: { round: { number: 2, question_id: Q2, phase: "voting", voted: ["Ola"] } },
    });
  });

  // T1: a choice made at question 1 must not land in question 2, which Bartek has not seen.
  it("Bartek's vote for question 1, sent while round 2 is voting, gets round_over", () => {
    expect(bartekLateForRound1).toMatchObject({ error: null, data: { ok: false, reason: "round_over" } });
  });

  it("skip_round while round 2 is voting gets ok: true", () => {
    expect(skipWhileVoting).toMatchObject({ error: null, data: { ok: true } });
  });

  // D2: the next question comes at once. Ola voted in the skipped round 2, and her vote is gone with it.
  it("after the skip Ola sees round 3 with Q3, voting, nobody voted yet, after a skip", () => {
    expect(olaRound3View).toMatchObject({
      error: null,
      data: {
        status: "playing",
        round: { number: 3, question_id: Q3, phase: "voting", voted: [], me_voted: false, after_skip: true },
      },
    });
  });

  it("Bartek's vote for the skipped question 2, sent while round 3 is voting, gets round_over", () => {
    expect(bartekLateForRound2).toMatchObject({ error: null, data: { ok: false, reason: "round_over" } });
  });

  it("the same skip of round 2 sent again gets round_over", () => {
    expect(skipSentAgain).toMatchObject({ error: null, data: { ok: false, reason: "round_over" } });
  });

  it("after the repeated skip the game is still in round 3 with Q3", () => {
    expect(hostRound3View).toMatchObject({
      error: null,
      data: { round: { number: 3, question_id: Q3, phase: "voting", after_skip: true } },
    });
  });

  it("a vote with round 3's number while round 3 is voting gets ok: true", () => {
    expect(olaVotesWithNumber).toMatchObject({ error: null, data: { ok: true } });
  });

  // F2: "Odsłoń wynik" carries the number of the question on the host's screen, as the vote does.
  it("Odsłoń wynik with no question number while round 3 is voting gets round_over", () => {
    expect(revealWithNoNumber).toMatchObject({ error: null, data: { ok: false, reason: "round_over" } });
  });

  it("after the refused reveal round 3 is still voting, with Ola's vote in it", () => {
    expect(hostRound3AfterRefusedReveal).toMatchObject({
      error: null,
      data: { round: { number: 3, question_id: Q3, phase: "voting", voted: ["Ola"] } },
    });
  });

  // Only Ola's vote for Bartek in round 3 counts: her vote for Bartek in the skipped round 2 would make it 2, and
  // Bartek's late vote for Ola would give her 1.
  it("round 3 reveals only its own vote: Bartek 1, the rest 0, 1 ballot", () => {
    expect(round3Revealed).toMatchObject({
      error: null,
      data: {
        round: {
          number: 3,
          question_id: Q3,
          phase: "revealed",
          results: [
            { nick: "Host", votes: 0 },
            { nick: "Ola", votes: 0 },
            { nick: "Bartek", votes: 1 },
          ],
          abstained: 0,
          ballots: 1,
        },
      },
    });
  });

  // D2: once the counts are shown there is nothing left to lose.
  it("skip_round after round 3 was revealed gets round_revealed", () => {
    expect(skipAfterReveal).toMatchObject({ error: null, data: { ok: false, reason: "round_revealed" } });
  });

  it("next_round when every candidate was played gets no_questions", () => {
    expect(nextWithNoneLeft).toMatchObject({ error: null, data: { ok: false, reason: "no_questions" } });
  });

  it("next_round with only malformed candidates (not the id format, null) gets no_questions", () => {
    expect(nextWithOnlyMalformed).toMatchObject({ error: null, data: { ok: false, reason: "no_questions" } });
  });

  // F3: a malformed list from a client calling the database directly; no row's values in DETAIL.
  it("next_round with 1001 candidates is refused whole with 22023", () => {
    expect(nextWithTooMany).toMatchObject({ error: { code: "22023", details: null } });
  });

  it("after no_questions and the refused long list the game is still in play, in round 3, revealed", () => {
    expect(hostAfterNoneLeft).toMatchObject({
      error: null,
      data: { status: "playing", round: { number: 3, question_id: Q3, phase: "revealed" } },
    });
  });

  it("next_round with malformed candidates before the one left gets ok: true", () => {
    expect(nextToLastQuestion).toMatchObject({ error: null, data: { ok: true } });
  });

  // FR-015 and F3: Q4 is the only candidate in the id format not played yet. Round 3 was revealed, not skipped.
  it("round 4 is Q4, voting, nobody voted yet and no skip before it", () => {
    expect(olaRound4View).toMatchObject({
      error: null,
      data: { round: { number: 4, question_id: Q4, phase: "voting", voted: [], me_voted: false, after_skip: false } },
    });
  });

  it("skipping the last question gets ok: true", () => {
    expect(skipLastQuestion).toMatchObject({ error: null, data: { ok: true } });
  });

  // D2 and D3: no new round, the game stays in play, and the skipped round shows its number and phase, nothing else.
  it("after the last skip the game is still in play and its latest round is exactly round 4, skipped", () => {
    expect(olaSkippedView).toMatchObject({ error: null, data: { status: "playing" } });
    expect(roundOf(olaSkippedView)).toEqual({ number: 4, phase: "skipped" });
  });

  it("a vote with question 4's number on the skipped round gets round_over", () => {
    expect(olaVotesOnSkipped).toMatchObject({ error: null, data: { ok: false, reason: "round_over" } });
  });

  // I9 (decision 0.3 of 02-invariant-aggregate-refactor.md): an illegal move is refused, never a silent ok.
  it("Odsłoń wynik with the number of the skipped round 4 gets round_over", () => {
    expect(revealSkipped).toMatchObject({ error: null, data: { ok: false, reason: "round_over" } });
  });

  it("next_round after the last question was skipped gets no_questions", () => {
    expect(nextAfterLastSkip).toMatchObject({ error: null, data: { ok: false, reason: "no_questions" } });
  });

  // D4: when the questions ran out, the host ends the game.
  it("end_game after the last question was skipped gets ok: true", () => {
    expect(endAfterLastSkip).toMatchObject({ error: null, data: { ok: true } });
  });

  it("after the end Ola sees the room closed and no round", () => {
    expect(olaEndView).toMatchObject({ error: null, data: { status: "closed", round: null } });
  });

  // I7 and I10: the end comes first, whatever number the screen sends.
  it("a vote with question 4's number after the end gets room_closed", () => {
    expect(olaVotesAfterEnd).toMatchObject({ error: null, data: { ok: false, reason: "room_closed" } });
  });

  it("Odsłoń wynik with question 4's number after the end gets room_closed", () => {
    expect(revealAfterEnd).toMatchObject({ error: null, data: { ok: false, reason: "room_closed" } });
  });
});

describe("in the lobby there is no round to move on from, skip or end", () => {
  let room: OwnRoom;

  beforeAll(async () => {
    // Closes the evening's room, should ending it have failed.
    room = await seedRoom(host, { confirmClose: true });
    await seedGuest(room.linkToken, "Ola");
    await seedGuest(room.linkToken, "Bartek");
  });

  // end_game last: a lobby it closed by mistake would leave the other two nothing to refuse.
  it.each([
    { fn: "next_round", attempt: () => nextRound(host.client, room.id, 1, POOL) },
    { fn: "skip_round", attempt: () => skipRound(host.client, room.id, 1, POOL) },
    { fn: "end_game", attempt: () => endGame(host.client, room.id) },
  ])("$fn in the lobby gets no_round", async ({ attempt }) => {
    const answer = await attempt();

    expect(answer).toMatchObject({ error: null, data: { ok: false, reason: "no_round" } });
  });
});

// D4: "Zakończ grę" also while a round is voting; the room is closed for everyone, the link included.
describe("the host ends the game while round 1 is voting", () => {
  let room: OwnRoom;
  let ola: SeededGuest;
  let skipWithTooMany: Answer;
  let hostAfterTooMany: Answer;
  let endWhileVoting: Answer;

  beforeAll(async () => {
    // Closes the lobby room.
    room = await seedRoom(host, { confirmClose: true });
    ola = await seedGuest(room.linkToken, "Ola");
    await seedGuest(room.linkToken, "Bartek");
    await seedStartGame(host, room.id, Q1);
    await seedVote(anon, room.id, "Bartek", ola.playerToken, 1);
    // F3: the skip deletes the urn before it opens the next question; a list too long undoes both. Here, right before
    // the end: a database without the limit skips round 1, and the end closes the room all the same.
    skipWithTooMany = await skipRound(host.client, room.id, 1, TOO_MANY);
    hostAfterTooMany = await roomLobby(host.client, room.id);
    endWhileVoting = await endGame(host.client, room.id);
  });

  it("skip_round with 1001 candidates while round 1 is voting is refused whole with 22023", () => {
    expect(skipWithTooMany).toMatchObject({ error: { code: "22023", details: null } });
  });

  it("after the refused skip round 1 is still voting, with Ola's vote in it", () => {
    expect(hostAfterTooMany).toMatchObject({
      error: null,
      data: { round: { number: 1, question_id: Q1, phase: "voting", voted: ["Ola"] } },
    });
  });

  it("end_game while round 1 is voting gets ok: true", () => {
    expect(endWhileVoting).toMatchObject({ error: null, data: { ok: true } });
  });

  it.each([
    { viewer: "Ola", read: () => roomLobby(anon, room.id, ola.playerToken) },
    { viewer: "the host", read: () => roomLobby(host.client, room.id) },
  ])("$viewer sees the room closed and no round", async ({ read }) => {
    const answer = await read();

    expect(answer).toMatchObject({ error: null, data: { status: "closed", round: null } });
  });

  it("the room's link answers exactly { status: closed }", async () => {
    const answer = await roomLink(room.linkToken);

    expect(answer).toEqual({ data: { status: "closed" }, error: null });
  });

  it("a new guest joining after the end gets room_closed", async () => {
    const answer = await joinRoom(room.linkToken, "Wiktor");

    expect(answer).toMatchObject({ error: null, data: { ok: false, reason: "room_closed" } });
  });

  it.each([
    { fn: "end_game", attempt: () => endGame(host.client, room.id) },
    { fn: "next_round", attempt: () => nextRound(host.client, room.id, 1, POOL) },
    { fn: "skip_round", attempt: () => skipRound(host.client, room.id, 1, POOL) },
  ])("$fn after the end gets room_closed", async ({ attempt }) => {
    const answer = await attempt();

    expect(answer).toMatchObject({ error: null, data: { ok: false, reason: "room_closed" } });
  });
});
