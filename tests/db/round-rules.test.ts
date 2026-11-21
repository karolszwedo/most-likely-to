import { beforeAll, describe, expect, it } from "vitest";
import { anonClient, newHost, newPlayerToken, type Host } from "./support/clients";
import { isRecord, readOwnRoom, seedGuest, seedRoom, type OwnRoom, type SeededGuest } from "./support/rooms";
import {
  OTHER_QUESTION_ID,
  QUESTION_ID,
  addOwnQuestion,
  admitLatecomer,
  castVote,
  drawListQuestion,
  editListQuestion,
  endGame,
  joinRoom,
  nextRound,
  openQuestionList,
  rejectLatecomer,
  removeListQuestion,
  requestJoin,
  revealRound,
  roomLink,
  roomLobby,
  seedStartGame,
  seedVote,
  setCohost,
  skipRound,
  startGame,
  startGameWithQuestionIdOnly,
  type Answer,
} from "./support/rounds";

// Round rules (#3) through the roles' own doors: RPC with the publishable key, as guests and as signed-in hosts, past
// the Worker. Oracle: PRD FR-008 (one person or an abstention, the voter included), FR-009 (the reveal after the last
// vote or when the host moves on, at any time), US-01 (at least 2 guests plus the voting host) and the decisions of
// context/archive/2026-10-13-first-live-round/research.md (D2: a vote is final; D3: no threshold for the reveal).
// Every expected count is written out by hand from the scenario, never computed.
//
// S-03 adds the evening's moves (next_round, skip_round, end_game): only the room's own leader makes them (PRD Access
// Control; the host, and since S-07 a co-host too), checked here; the evening's own rules are
// tests/db/game-rules.test.ts's. The same for S-08's "Wpuść" and "Odrzuć" (admit_latecomer, reject_latecomer, from
// *_latecomer_admission.sql), whose own rules are
// tests/db/latecomers.test.ts's, and for S-06's moves on the game's question list (open_question_list,
// draw_list_question, remove_list_question, edit_list_question, add_own_question, from *_question_list_review.sql),
// whose own rules are tests/db/question-list.test.ts's.
//
// A refusal is the function's answer { ok: false, reason }, never "some error". S-07 (*_co_host_role.sql) grants the
// leader's moves to anon, so a co-host can make them with its token: someone with no token gets room_unknown and a
// guest of the room without the role not_leader; giving the role (set_cohost) stays host A's own. The co-host's own
// rules are tests/db/cohost.test.ts's.
//
// The round functions come from supabase/migrations/*_first_live_round.sql, the evening's from
// *_full_game_evening.sql. Without them PostgREST answers each such call with PGRST202 (no such function): a suite that
// starts a round in beforeAll is red as a whole, and every other test here is red on its own probe.
//
// Two sign-ups per run, in beforeAll. One open room per host, so host A's rooms come one after another (confirm_close
// closes the one before); Vitest runs the suites in order, each suite's beforeAll right before its tests.

const anon = anonClient();

let hostA: Host;
// The other host: its room gives "a nick from another room", and it is the stranger to host A's game.
let hostB: Host;
// Host B's lobby of two players. It stays a lobby until the last test of the file.
let roomB: OwnRoom;
// Host B's guest: a player with a valid token, but of another room.
let zosia: SeededGuest;

beforeAll(async () => {
  [hostA, hostB] = await Promise.all([newHost(), newHost()]);
  roomB = await seedRoom(hostB, { nick: "Hania" });
  zosia = await seedGuest(roomB.linkToken, "Zosia");
});

// Host A starts and the round plays out once, in order, in beforeAll: four votes plus every refused try between them.
// Each step's answer is kept and checked by its own test, so no test depends on another one having run.
describe("main round: Host, Ola, Bartek and Kuba", () => {
  let room: OwnRoom;
  let ola: SeededGuest;
  let bartek: SeededGuest;
  let kuba: SeededGuest;
  let hostForOla: Answer;
  let hostAgain: Answer;
  let olaForOla: Answer;
  let olaAgain: Answer;
  let bartekForOla: Answer;
  let kubaForStranger: Answer;
  let kubaForOtherRoom: Answer;
  let kubaAbstains: Answer;
  let hostBForOla: Answer;
  let zosiaForOla: Answer;
  let noTokenForOla: Answer;
  let hostView: Answer;
  let guestView: Answer;

  beforeAll(async () => {
    room = await seedRoom(hostA);
    ola = await seedGuest(room.linkToken, "Ola");
    bartek = await seedGuest(room.linkToken, "Bartek");
    kuba = await seedGuest(room.linkToken, "Kuba");
    await seedStartGame(hostA, room.id, QUESTION_ID);

    // Strangers first, while the round is open: a vote of theirs that counted would show up as Ola's in the reveal.
    // The votes carry round 1's number, as the room screen sends it; the one with no token is refused before the
    // number is read.
    hostBForOla = await castVote(hostB.client, room.id, "Ola", undefined, 1);
    zosiaForOla = await castVote(anon, room.id, "Ola", zosia.playerToken, 1);
    noTokenForOla = await castVote(anon, room.id, "Ola");

    hostForOla = await castVote(hostA.client, room.id, "Ola", undefined, 1);
    // Second tries go to Bartek, so a second vote that counted would show up as Bartek's vote in the reveal.
    hostAgain = await castVote(hostA.client, room.id, "Bartek", undefined, 1);
    olaForOla = await castVote(anon, room.id, "Ola", ola.playerToken, 1);
    olaAgain = await castVote(anon, room.id, "Bartek", ola.playerToken, 1);
    bartekForOla = await castVote(anon, room.id, "Ola", bartek.playerToken, 1);
    // Kuba has not voted yet, so the target is the only thing these two can be refused for.
    kubaForStranger = await castVote(anon, room.id, "Zenon", kuba.playerToken, 1);
    kubaForOtherRoom = await castVote(anon, room.id, "Zosia", kuba.playerToken, 1);
    // The fourth of four eligible players: the round reveals itself.
    kubaAbstains = await castVote(anon, room.id, null, kuba.playerToken, 1);

    hostView = await roomLobby(hostA.client, room.id);
    guestView = await roomLobby(anon, room.id, kuba.playerToken);

    // A latecomer waiting after the reveal, so host B letting her in or turning her away would have someone to act on.
    const elaAsks = await requestJoin(room.linkToken, "Ela", newPlayerToken());
    if (!isRecord(elaAsks.data) || elaAsks.data.ok !== true) {
      throw new Error("precondition failed: request_join did not take Ela's request to join the game in play");
    }
  });

  // Positive control: an allowed vote must work, or a wrong address would look like a refusal everywhere. ok only: the
  // exact answer is round-anonymity.test.ts's to check.
  it("positive control: the host's vote for Ola gets ok: true", () => {
    expect(hostForOla).toMatchObject({ error: null, data: { ok: true } });
  });

  it("Ola voting for herself gets ok: true", () => {
    expect(olaForOla).toMatchObject({ error: null, data: { ok: true } });
  });

  it("Bartek's vote for Ola gets ok: true", () => {
    expect(bartekForOla).toMatchObject({ error: null, data: { ok: true } });
  });

  it("Kuba abstaining gets ok: true", () => {
    expect(kubaAbstains).toMatchObject({ error: null, data: { ok: true } });
  });

  // D2: a vote is final, for the host (by session) and for a guest (the same token, as after a refresh).
  it.each([
    { voter: "the host", answer: () => hostAgain },
    { voter: "Ola, with the same token", answer: () => olaAgain },
  ])("a second vote by $voter gets already_voted", ({ answer }) => {
    expect(answer()).toMatchObject({ error: null, data: { ok: false, reason: "already_voted" } });
  });

  it.each([
    { target: "a nick in no room", answer: () => kubaForStranger },
    { target: "a nick from host B's room", answer: () => kubaForOtherRoom },
  ])("a vote for $target gets unknown_target", ({ answer }) => {
    expect(answer()).toMatchObject({ error: null, data: { ok: false, reason: "unknown_target" } });
  });

  // cast_vote is open to anon, so the room check lives inside it (PRD Access Control, test-plan §2 #4): a stranger to
  // the room learns nothing about it and votes for no one.
  it.each([
    { stranger: "host B, by its session", answer: () => hostBForOla },
    { stranger: "Zosia, host B's guest, by her token", answer: () => zosiaForOla },
    { stranger: "a guest with no token", answer: () => noTokenForOla },
  ])("a vote by $stranger gets room_unknown", ({ answer }) => {
    expect(answer()).toMatchObject({ error: null, data: { ok: false, reason: "room_unknown" } });
  });

  // Ola 3 (the host's, her own, Bartek's), everyone else 0, one abstention, four ballots. The refused tries count
  // nothing: Bartek, the target of both second votes, stays at 0, and the strangers' votes for Ola add nothing to her
  // 3. Everyone sees the same reveal.
  it.each([
    { viewer: "the host", lobby: () => hostView },
    { viewer: "a guest", lobby: () => guestView },
  ])("after the fourth vote $viewer sees the round revealed: Ola 3, the rest 0, 1 abstained", ({ lobby }) => {
    expect(lobby()).toMatchObject({
      error: null,
      data: {
        round: {
          number: 1,
          question_id: QUESTION_ID,
          phase: "revealed",
          results: [
            { nick: "Host", votes: 0 },
            { nick: "Ola", votes: 3 },
            { nick: "Bartek", votes: 0 },
            { nick: "Kuba", votes: 0 },
          ],
          abstained: 1,
          ballots: 4,
        },
      },
    });
  });

  it("starting the game again gets game_started", async () => {
    const answer = await startGame(hostA.client, room.id, OTHER_QUESTION_ID);

    expect(answer).toMatchObject({ error: null, data: { ok: false, reason: "game_started" } });
  });

  // A game in play takes no one new through join_room: a latecomer asks to be let in (request_join, S-08,
  // tests/db/latecomers.test.ts).
  it("a new guest joining after the start gets game_started", async () => {
    const answer = await joinRoom(room.linkToken, "Wiktor");

    expect(answer).toMatchObject({ error: null, data: { ok: false, reason: "game_started" } });
  });

  it("room_link of the game in play says started", async () => {
    const answer = await roomLink(room.linkToken);

    expect(answer.error).toBeNull();
    expect(answer.data).toEqual({ status: "started", room_id: room.id, language: "pl" });
  });

  // A host owns its own games and nobody else's (PRD Access Control). Checked after the reveal, so a hole cannot
  // change the round above.
  it("host B starting host A's game gets room_unknown", async () => {
    const answer = await startGame(hostB.client, room.id, OTHER_QUESTION_ID);

    expect(answer).toMatchObject({ error: null, data: { ok: false, reason: "room_unknown" } });
  });

  it("host B revealing host A's round gets room_unknown", async () => {
    const answer = await revealRound(hostB.client, room.id, 1);

    expect(answer).toMatchObject({ error: null, data: { ok: false, reason: "room_unknown" } });
  });

  // Only the leader starts, reveals, moves on, skips and ends: the host, or a co-host by its token (S-07,
  // tests/db/cohost.test.ts). The moves are granted to anon since S-07, so the refusal is the function's own answer:
  // someone with no token learns nothing about the room, and a player of the room without the co-host role gets
  // not_leader. Round 1 is revealed, the round number is right and the candidate was never played, so the role is the
  // only thing these can be refused for. end_game last, so a hole cannot close the room under the ones before it.
  it.each([
    { fn: "start_game", attempt: () => startGame(anon, room.id, OTHER_QUESTION_ID) },
    { fn: "reveal_round", attempt: () => revealRound(anon, room.id, 1) },
    { fn: "next_round", attempt: () => nextRound(anon, room.id, 1, [OTHER_QUESTION_ID]) },
    { fn: "skip_round", attempt: () => skipRound(anon, room.id, 1, [OTHER_QUESTION_ID]) },
    { fn: "end_game", attempt: () => endGame(anon, room.id) },
  ])("a guest with no token calling $fn gets room_unknown", async ({ attempt }) => {
    const answer = await attempt();

    expect(answer).toMatchObject({ error: null, data: { ok: false, reason: "room_unknown" } });
  });

  it.each([
    { fn: "start_game", attempt: () => startGame(anon, room.id, OTHER_QUESTION_ID, kuba.playerToken) },
    { fn: "reveal_round", attempt: () => revealRound(anon, room.id, 1, kuba.playerToken) },
    { fn: "next_round", attempt: () => nextRound(anon, room.id, 1, [OTHER_QUESTION_ID], kuba.playerToken) },
    { fn: "skip_round", attempt: () => skipRound(anon, room.id, 1, [OTHER_QUESTION_ID], kuba.playerToken) },
    { fn: "end_game", attempt: () => endGame(anon, room.id, kuba.playerToken) },
  ])("Kuba, a guest of the room with no co-host role, calling $fn gets not_leader", async ({ attempt }) => {
    const answer = await attempt();

    expect(answer).toMatchObject({ error: null, data: { ok: false, reason: "not_leader" } });
  });

  // S-03: the evening's moves are host A's own as well. Round 1 is revealed, the round number is right and the
  // candidate was never played, so the room is the only thing they can be refused for. S-08: so are "Wpuść" and
  // "Odrzuć"; Ela is waiting, so a call that got through would act on her. S-07: giving the co-host role is host A's
  // own too (PRD Access Control: only the host gives and takes it); Ola is a guest of the room, so a call that got
  // through would make her a co-host. end_game last, so a hole cannot close the room under the ones before it.
  it.each([
    { fn: "next_round", attempt: () => nextRound(hostB.client, room.id, 1, [OTHER_QUESTION_ID]) },
    { fn: "skip_round", attempt: () => skipRound(hostB.client, room.id, 1, [OTHER_QUESTION_ID]) },
    { fn: "admit_latecomer", attempt: () => admitLatecomer(hostB.client, room.id, "Ela") },
    { fn: "reject_latecomer", attempt: () => rejectLatecomer(hostB.client, room.id, "Ela") },
    { fn: "set_cohost", attempt: () => setCohost(hostB.client, room.id, "Ola", true) },
    { fn: "end_game", attempt: () => endGame(hostB.client, room.id) },
  ])("host B calling $fn on host A's game gets room_unknown", async ({ attempt }) => {
    const answer = await attempt();

    expect(answer).toMatchObject({ error: null, data: { ok: false, reason: "room_unknown" } });
  });
});

// D3: the host may move on at any time (FR-009), and the reveal shows the counts even after a single vote.
describe("the host reveals after one vote", () => {
  let room: OwnRoom;
  let firstReveal: Answer;
  let firstView: Answer;
  let lateVote: Answer;
  let secondReveal: Answer;
  let secondView: Answer;

  beforeAll(async () => {
    // Closes the main round's room.
    room = await seedRoom(hostA, { confirmClose: true });
    const ola = await seedGuest(room.linkToken, "Ola");
    const bartek = await seedGuest(room.linkToken, "Bartek");
    await seedStartGame(hostA, room.id, QUESTION_ID);
    await seedVote(anon, room.id, "Ola", bartek.playerToken, 1);

    firstReveal = await revealRound(hostA.client, room.id, 1);
    firstView = await roomLobby(hostA.client, room.id);
    // Ola has not voted and sends round 1's number, so the reveal is the only thing this can be refused for.
    lateVote = await castVote(anon, room.id, "Bartek", ola.playerToken, 1);
    secondReveal = await revealRound(hostA.client, room.id, 1);
    secondView = await roomLobby(anon, room.id, ola.playerToken);
  });

  const AFTER_ONE_VOTE = {
    number: 1,
    question_id: QUESTION_ID,
    phase: "revealed",
    results: [
      { nick: "Host", votes: 0 },
      { nick: "Ola", votes: 1 },
      { nick: "Bartek", votes: 0 },
    ],
    abstained: 0,
    ballots: 1,
  };

  it("the host's reveal after one vote gets ok: true", () => {
    expect(firstReveal).toMatchObject({ error: null, data: { ok: true } });
  });

  it("the reveal shows the counts at once: Ola 1, the rest 0, 1 ballot", () => {
    expect(firstView).toMatchObject({ error: null, data: { round: AFTER_ONE_VOTE } });
  });

  it("a vote after the reveal gets round_revealed", () => {
    expect(lateVote).toMatchObject({ error: null, data: { ok: false, reason: "round_revealed" } });
  });

  it("a second reveal gets ok: true", () => {
    expect(secondReveal).toMatchObject({ error: null, data: { ok: true } });
  });

  it("after the late vote and the second reveal the result is the same", () => {
    expect(secondView).toMatchObject({ error: null, data: { round: AFTER_ONE_VOTE } });
  });
});

describe("refusals before a round: a closed room, the lobby, too few players, a malformed question, another host's list", () => {
  // Three players each, so a refusal can only come from the state under test, never from too few players.
  let closedRoom: OwnRoom;
  let lobbyRoom: OwnRoom;
  let lobbyGuest: SeededGuest;

  beforeAll(async () => {
    // Closes the room of the reveal after one vote.
    closedRoom = await seedRoom(hostA, { confirmClose: true });
    await seedGuest(closedRoom.linkToken, "Ola");
    await seedGuest(closedRoom.linkToken, "Bartek");
    lobbyRoom = await seedRoom(hostA, { confirmClose: true });
    lobbyGuest = await seedGuest(lobbyRoom.linkToken, "Ola");
    await seedGuest(lobbyRoom.linkToken, "Bartek");
    if ((await readOwnRoom(hostA, closedRoom.id)).status !== "closed") {
      throw new Error("precondition failed: opening the lobby room did not close the room before it");
    }
  });

  it("a vote in the lobby gets no_round", async () => {
    const answer = await castVote(anon, lobbyRoom.id, "Ola", lobbyGuest.playerToken, 1);

    expect(answer).toMatchObject({ error: null, data: { ok: false, reason: "no_round" } });
  });

  it("the host's reveal in the lobby gets no_round", async () => {
    const answer = await revealRound(hostA.client, lobbyRoom.id, 1);

    expect(answer).toMatchObject({ error: null, data: { ok: false, reason: "no_round" } });
  });

  it("starting a closed room gets room_closed", async () => {
    const answer = await startGame(hostA.client, closedRoom.id, QUESTION_ID);

    expect(answer).toMatchObject({ error: null, data: { ok: false, reason: "room_closed" } });
  });

  // An id is "<category-id>-<NNN>": lowercase letters, digits and hyphens, then three digits (src/data/questions.ts).
  // Last in the suite: a start that ignored the format would put the lobby room in play. Since security-hardening the
  // start takes only a pool, so a pool of one id outside the format has no question to open.
  it.each(["na-co-dzien", "na-co-dzien-1", "NA-CO-DZIEN-001"])(
    "starting with only the question id %j gets no_questions",
    async (questionId) => {
      const answer = await startGame(hostA.client, lobbyRoom.id, questionId);

      expect(answer).toMatchObject({ error: null, data: { ok: false, reason: "no_questions" } });
    },
  );

  // S-20 F3, closed by security-hardening: p_question_id means nothing. A question of the room's choice (the lobby room
  // has every seed category and no list), sent the way the Worker sent it before S-20, with no pool, opens no round; the
  // old way in would put the lobby room in play.
  it("starting with only p_question_id, a question of the room's choice, gets no_questions and the room stays in the lobby", async () => {
    const answer = await startGameWithQuestionIdOnly(hostA.client, lobbyRoom.id, QUESTION_ID);
    const lobby = await roomLobby(hostA.client, lobbyRoom.id);

    expect(answer).toMatchObject({ error: null, data: { ok: false, reason: "no_questions" } });
    expect(lobby).toMatchObject({ error: null, data: { status: "lobby", round: null } });
  });

  // US-01: the host and at least 2 guests. Host B's room has the host and one guest.
  it("starting a room of two players gets not_enough_players", async () => {
    const answer = await startGame(hostB.client, roomB.id, QUESTION_ID);

    expect(answer).toMatchObject({ error: null, data: { ok: false, reason: "not_enough_players" } });
  });

  // S-06: the game's question list is host A's own as well (PRD Access Control: only the host reviews it). Host A's
  // lobby has no list and the arguments are ones host A's own call would take, so the room is the only thing they can
  // be refused for; a move that got through would open or change a list there. Last in the file, so such a list could
  // not change a start above.
  it.each([
    { fn: "open_question_list", attempt: () => openQuestionList(hostB.client, lobbyRoom.id, [OTHER_QUESTION_ID]) },
    { fn: "draw_list_question", attempt: () => drawListQuestion(hostB.client, lobbyRoom.id, [OTHER_QUESTION_ID]) },
    { fn: "remove_list_question", attempt: () => removeListQuestion(hostB.client, lobbyRoom.id, 1) },
    { fn: "edit_list_question", attempt: () => editListQuestion(hostB.client, lobbyRoom.id, 1, "zasnąłby w kinie") },
    { fn: "add_own_question", attempt: () => addOwnQuestion(hostB.client, lobbyRoom.id, "zasnąłby w kinie") },
  ])("host B calling $fn on host A's lobby gets room_unknown", async ({ attempt }) => {
    const answer = await attempt();

    expect(answer).toMatchObject({ error: null, data: { ok: false, reason: "room_unknown" } });
  });
});
