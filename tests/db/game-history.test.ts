import { beforeAll, describe, expect, it } from "vitest";
import { anonClient, newHost, type Host } from "./support/clients";
import { isRecord, seedGuest, seedRoom, type OwnRoom, type SeededGuest } from "./support/rooms";
import {
  EVENING_QUESTION_IDS,
  HISTORY_KEYS,
  HISTORY_PLAYER_KEYS,
  HISTORY_REVEALED_ROUND_KEYS,
  HISTORY_ROUND_KEYS,
  RESULT_KEYS,
  addOwnQuestion,
  approveProposal,
  deleteGame,
  editListQuestion,
  endGame,
  gameHistory,
  hostGames,
  joinRequestState,
  keysOf,
  openQuestionList,
  proposeQuestion,
  removePlayer,
  roomLink,
  roomLobby,
  roundOf,
  seedNextRound,
  seedReveal,
  seedSkipRound,
  seedStartGame,
  seedVote,
  type Answer,
} from "./support/rounds";

// The host's list of its games and deleting one (S-13), through the roles' own doors: RPC with the publishable key, as
// the signed-in host, as a guest of the deleted game (anon with its player token) and as anon with no token, past the
// Worker. Oracle: PRD FR-019 (the host sees a minimal list of its past games, with the date, the number of questions
// and who played, and deletes any of them; deleting removes everything tied to nicks) and Karol's decisions of
// 2026-11-10 at the top of context/archive/2026-11-10-host-game-history/plan.md: only an ended game can be deleted (1);
// a row of the list has the start of the game (null for a game that never started, which is on the list too), the
// number of questions asked, skipped ones included, and the nicks, newest first (3); a guest of a deleted game is told
// the game is gone, not that they were removed (5). Every id, nick, count and refusal expected here is written out by
// hand from the scenario, never computed. What the deletion takes from the tables the publishable key cannot read, and
// that the question counters stay, is the pgTAP file's (supabase/tests/round_creator_view.test.sql).
//
// host_games, delete_game and join_request_state's gone come from supabase/migrations/*_host_game_history.sql. Without
// it PostgREST answers both new calls with PGRST202 (no such function), join_request_state answers none, and every test
// here is red on its own probe or on the state those calls should have made.
//
// The history of an ended game (S-26), in the second suite, comes from supabase/migrations/*_game_history_details.sql;
// without it game_history answers PGRST202 and every test of that suite is red on its own probe.
//
// One sign-up per run, in beforeAll. One open room per host, so the rooms come one after another (confirm_close closes
// the one before); Vitest runs the suites in order, each suite's beforeAll right before its tests.

const anon = anonClient();
const [Q1, Q2, Q3, Q4] = EVENING_QUESTION_IDS;
// Not a player token: the Worker sends the cookie's 32-byte one or none.
const MALFORMED_TOKEN = "not-a-player-token";
// Exact keys, sorted, of a game on the host's list: a key outside them (a result, a colour, a role) would be a leak
// until a decision adds it here.
const GAME_KEYS = ["created_at", "id", "nicks", "questions", "started_at"];

let host: Host;

beforeAll(async () => {
  host = await newHost();
});

function accepted(answer: Answer): boolean {
  return answer.error === null && isRecord(answer.data) && answer.data.ok === true;
}

// The function's own refusal code, never its arguments: they hold nicks and tokens.
function refusalOf(answer: Answer): string {
  if (answer.error) return answer.error.code;
  return isRecord(answer.data) && typeof answer.data.reason === "string" ? answer.data.reason : "an unexpected shape";
}

// A step that is a precondition, not the thing under test. Throws on any failure: beforeAll only.
function mustAccept(step: string, answer: Answer): void {
  if (!accepted(answer)) {
    throw new Error(`precondition failed: ${step} was refused: ${refusalOf(answer)}`);
  }
}

// The entries of a host_games answer, in its order; [] when it is not a list (a failed call included). Never throws.
function gamesOf(answer: Answer): unknown[] {
  return Array.isArray(answer.data) ? (answer.data as unknown[]) : [];
}

// The ids on the list, in its order; undefined for an entry that is not an object. Never throws.
function idsOf(answer: Answer): unknown[] {
  return gamesOf(answer).map((game) => (isRecord(game) ? game.id : undefined));
}

// The entry with that id, or undefined. Never throws.
function gameOf(answer: Answer, id: string): unknown {
  return gamesOf(answer).find((game) => isRecord(game) && game.id === id);
}

// What the entry's created_at and started_at hold: "a time" (a string that Date.parse reads), "null", or "something
// else". The times themselves are the database's clock, so only their kind is written out here. Never throws.
function timesOf(entry: unknown): { created_at: string; started_at: string } {
  const kind = (value: unknown): string => {
    if (value === null) return "null";
    return typeof value === "string" && !Number.isNaN(Date.parse(value)) ? "a time" : "something else";
  };
  const fields: Record<string, unknown> = isRecord(entry) ? entry : {};
  return { created_at: kind(fields.created_at), started_at: kind(fields.started_at) };
}

// A list key of a game_history answer (players, rounds); [] for anything else, a refusal or a failed call included.
// Never throws.
function historyList(answer: Answer, key: "players" | "rounds"): unknown[] {
  const list: unknown = isRecord(answer.data) ? answer.data[key] : null;
  return Array.isArray(list) ? (list as unknown[]) : [];
}

// The results of a round of the history; [] for anything else. Never throws.
function resultsOf(round: unknown): unknown[] {
  const results: unknown = isRecord(round) ? round.results : null;
  return Array.isArray(results) ? (results as unknown[]) : [];
}

// What a reveal of the history counts, its results' votes and its abstentions, next to its ballots; null for a round
// with no reveal. Never throws.
function countedOf(round: unknown): { counted: number; ballots: unknown } | null {
  if (!isRecord(round) || round.phase !== "revealed") return null;
  const votes = resultsOf(round).reduce<number>(
    (sum, result) => sum + (isRecord(result) && typeof result.votes === "number" ? result.votes : 0),
    0,
  );
  const abstained = typeof round.abstained === "number" ? round.abstained : 0;
  return { counted: votes + abstained, ballots: round.ballots };
}

// The sums of the history's reveals by the rule of game_totals (S-15): every player with a result in at least one
// reveal, as { nick, votes }, in the order of the history's players (seat order). Never throws.
function sumsOfReveals(answer: Answer): { nick: unknown; votes: number }[] {
  const sums = new Map<unknown, number>();
  for (const round of historyList(answer, "rounds")) {
    if (!isRecord(round) || round.phase !== "revealed") continue;
    for (const result of resultsOf(round)) {
      if (isRecord(result) && typeof result.votes === "number") {
        sums.set(result.nick, (sums.get(result.nick) ?? 0) + result.votes);
      }
    }
  }
  return historyList(answer, "players")
    .map((player) => (isRecord(player) ? player.nick : undefined))
    .filter((nick) => sums.has(nick))
    .map((nick) => ({ nick, votes: sums.get(nick) ?? 0 }));
}

// game_totals.totals of a room_lobby answer; [] for anything else. Never throws.
function totalsOf(answer: Answer): unknown[] {
  const gameTotals: unknown = isRecord(answer.data) ? answer.data.game_totals : null;
  const totals: unknown = isRecord(gameTotals) ? gameTotals.totals : null;
  return Array.isArray(totals) ? (totals as unknown[]) : [];
}

// The scenario plays out once, in order, in beforeAll. Each kept answer is checked by its own test, so no test depends
// on another one having run.
//
// The host's rooms, oldest first, with seats Host 1, then the guests in the order they came in:
//   "unstarted": Host and Ela, closed in the lobby by the next room's "Nowa gra": never started, no round;
//   "game": Host, Ola and Bartek; round 1 (Q1) revealed, round 2 (Q2) skipped with every candidate played, so no round
//     3 opens, then "Zakończ grę": 2 questions asked;
//   "open": Host and Kasia, left in the lobby.
// So the list holds "game", started last, then "unstarted", and never "open"; once "game" is deleted, only
// "unstarted".
describe("the host's games: one ended, one closed in the lobby and one open, then the ended one deleted", () => {
  let unstarted: OwnRoom;
  let game: OwnRoom;
  let open: OwnRoom;
  let ola: SeededGuest;
  // The list before any deletion.
  let listBefore: Answer;
  // Positive controls of what the deletion takes away from Ola and from the link.
  let olaLobbyBefore: Answer;
  let olaStateBefore: Answer;
  let oldLinkBefore: Answer;
  // anon, with no session, calling the host's functions.
  let anonDeletes: Answer;
  let anonLists: Answer;
  // The open room, right before and right after its host tries to delete it.
  let openBefore: Answer;
  let openDeleted: Answer;
  let openAfter: Answer;
  // The deletion, and what it leaves.
  let deleted: Answer;
  let listAfter: Answer;
  let olaLobbyAfter: Answer;
  let olaStateAfter: Answer;
  let malformedStateAfter: Answer;
  let oldLinkAfter: Answer;
  let deletedAgain: Answer;
  let unknownDeleted: Answer;

  beforeAll(async () => {
    unstarted = await seedRoom(host);
    await seedGuest(unstarted.linkToken, "Ela");

    // "Nowa gra" with Ela in the lobby closes the first room before any game.
    game = await seedRoom(host, { confirmClose: true });
    ola = await seedGuest(game.linkToken, "Ola");
    const bartek = await seedGuest(game.linkToken, "Bartek");
    await seedStartGame(host, game.id, Q1);
    await seedVote(anon, game.id, "Bartek", ola.playerToken, 1);
    await seedVote(anon, game.id, "Ola", bartek.playerToken, 1);
    await seedReveal(host, game.id, 1);
    await seedNextRound(host, game.id, 1, [Q1, Q2]);
    // Both candidates played: the skip opens no round 3, and round 2 stays the latest one.
    await seedSkipRound(host, game.id, 2, [Q1, Q2]);
    mustAccept("end_game of the game", await endGame(host.client, game.id));

    open = await seedRoom(host, { confirmClose: true });
    await seedGuest(open.linkToken, "Kasia");

    listBefore = await hostGames(host.client);
    olaLobbyBefore = await roomLobby(anon, game.id, ola.playerToken);
    olaStateBefore = await joinRequestState(game.id, ola.playerToken);
    oldLinkBefore = await roomLink(game.linkToken);

    // No session: the room closed in the lobby, which a call let through could delete.
    anonDeletes = await deleteGame(anon, unstarted.id);
    anonLists = await hostGames(anon);

    // Decision 1: the open room, with Kasia in it, stays as it is.
    openBefore = await roomLobby(host.client, open.id);
    openDeleted = await deleteGame(host.client, open.id);
    openAfter = await roomLobby(host.client, open.id);

    deleted = await deleteGame(host.client, game.id);
    listAfter = await hostGames(host.client);
    olaLobbyAfter = await roomLobby(anon, game.id, ola.playerToken);
    olaStateAfter = await joinRequestState(game.id, ola.playerToken);
    malformedStateAfter = await joinRequestState(game.id, MALFORMED_TOKEN);
    oldLinkAfter = await roomLink(game.linkToken);
    deletedAgain = await deleteGame(host.client, game.id);
    unknownDeleted = await deleteGame(host.client, crypto.randomUUID());
  });

  // Positive control: an allowed call must work, or a wrong address would look like a refusal everywhere.
  it("positive control: host_games lists the host's two closed rooms, newest first: the ended game, then the room closed in the lobby", () => {
    expect(listBefore.error).toBeNull();
    expect(idsOf(listBefore)).toEqual([game.id, unstarted.id]);
  });

  it("the open room is not on the list", () => {
    expect(listBefore.error).toBeNull();
    expect(idsOf(listBefore)).not.toContain(open.id);
  });

  // Decision 3: the number of questions asked, the skipped one included, and who played, in seat order.
  it("the ended game is on the list with questions: 2, nicks Host, Ola and Bartek in seat order, and its start", () => {
    const entry = gameOf(listBefore, game.id);

    expect(entry).toMatchObject({ id: game.id, questions: 2, nicks: ["Host", "Ola", "Bartek"] });
    expect(timesOf(entry)).toEqual({ created_at: "a time", started_at: "a time" });
  });

  it("the room closed in the lobby is on the list with started_at: null, questions: 0 and nicks Host and Ela", () => {
    const entry = gameOf(listBefore, unstarted.id);

    expect(entry).toMatchObject({ id: unstarted.id, started_at: null, questions: 0, nicks: ["Host", "Ela"] });
    expect(timesOf(entry)).toEqual({ created_at: "a time", started_at: "null" });
  });

  it("each game on the list has exactly the keys id, created_at, started_at, questions and nicks: nothing about votes, results, colours or roles", () => {
    expect(gamesOf(listBefore).map(keysOf)).toEqual([GAME_KEYS, GAME_KEYS]);
  });

  it("positive control: before the deletion Ola's token opens the closed game, her state is admitted, and the link says closed", () => {
    expect(olaLobbyBefore).toMatchObject({ error: null, data: { status: "closed", me: "Ola" } });
    expect(olaStateBefore).toEqual({ data: { state: "admitted" }, error: null });
    expect(oldLinkBefore).toEqual({ data: { status: "closed", language: "pl" }, error: null });
  });

  it("delete_game of the ended game as its host gets exactly { ok: true }", () => {
    expect(deleted).toEqual({ data: { ok: true }, error: null });
  });

  // The guest's call before it, with the room closed in the lobby as its argument, deleted nothing either.
  it("after the deletion host_games lists only the room closed in the lobby", () => {
    expect(listAfter.error).toBeNull();
    expect(idsOf(listAfter)).toEqual([unstarted.id]);
  });

  it("after the deletion Ola's token opens nothing: room_lobby gives null", () => {
    expect(olaLobbyAfter).toEqual({ data: null, error: null });
  });

  // Decision 5: the page tells Ola the game is gone, not that she was removed (none).
  it("after the deletion join_request_state with Ola's token is exactly { state: gone }", () => {
    expect(olaStateAfter).toEqual({ data: { state: "gone" }, error: null });
  });

  // The token's format is checked first, as before S-13: not our client, so nothing to tell.
  it("after the deletion join_request_state with a malformed token is still exactly { state: none }", () => {
    expect(malformedStateAfter).toEqual({ data: { state: "none" }, error: null });
  });

  it("after the deletion the game's old link code is unknown to room_link", () => {
    expect(oldLinkAfter).toEqual({ data: { status: "unknown" }, error: null });
  });

  // Decision 1: let through, the call would delete the room Kasia is in.
  it("delete_game of the open room gets game_not_ended, and the room stays open and unchanged", () => {
    expect(openDeleted).toMatchObject({ error: null, data: { ok: false, reason: "game_not_ended" } });
    expect(openBefore).toMatchObject({ error: null, data: { status: "lobby" } });
    expect(openAfter).toEqual(openBefore);
  });

  it.each([
    { what: "the same game a second time", answer: () => deletedAgain },
    { what: "a room that does not exist", answer: () => unknownDeleted },
  ])("delete_game of $what gets room_unknown", ({ answer }) => {
    expect(answer()).toMatchObject({ error: null, data: { ok: false, reason: "room_unknown" } });
  });

  // The list and the deletion are the signed-in host's: no grant to anon, so the function's name is checked, not only
  // 42501 (G2 in roles.test.ts).
  it.each([
    { fn: "delete_game", answer: () => anonDeletes },
    { fn: "host_games", answer: () => anonLists },
  ])("a guest with no session calling $fn is refused permission on the function", ({ fn, answer }) => {
    expect(answer().error?.code).toBe("42501");
    expect(answer().error?.message).toContain(`function ${fn}`);
  });
});

// The history of an ended game (S-26), the host's only, through its own door: RPC with the publishable key, as the
// signed-in host and as anon. Oracle: PRD FR-030 (the host opens a game on its list and sees the game's questions in
// the order they were played, each with its reveal's result as the room saw it, how many votes each nick got, a skipped
// question and one cut short without a reveal marked; only what the room saw at the reveals, never who voted for whom;
// the evening's summary as on the end screen) and Karol's decisions 1-3 of 2026-11-20 at the top of
// context/changes/game-history-details/plan.md (a note under a reveal whose votes went with a removed player, with no
// number and no nick; a badge for the host's own or reworded question and for an approved proposal, never its author),
// with the contract of that plan's Faza 1. Every nick, colour, count, text and origin expected here is written out by
// hand from the scenario, never computed; only the comparison with game_totals adds the history's reveals up, and
// game_totals is written out too. Another host's game and a call with no caller are the pgTAP file's: a second host
// here would be a second sign-up.
//
// The host of the suite above, whose other games are by now one closed in the lobby (no round, no list) and the one
// this suite's "Nowa gra" closes in the lobby: the game with Q1 and Q2 was deleted, so the host knows no question
// (S-20) and the list comes in the given order. Q3 and Q4 were in none of those games anyway.
//
// The game, seats Host 1, Ola 2, Bartek 3, Kuba 4, with colours 0 to 3 (each the lowest free one). In the lobby the
// host reviews the list: "Przejrzyj pytania" with [Q3, Q4] makes positions 1 (Q3) and 2 (Q4), "Popraw" rewords
// position 2 and "Dodaj własne" adds position 3; Bartek's proposal, approved during round 3, becomes position 4.
//   round 1, position 1 (Q3 as it stands: base), revealed: the host for Ola, Ola for Bartek, Bartek for Ola, Kuba
//     abstains, the fourth ballot of four, which reveals it: Host 0, Ola 2, Bartek 1, Kuba 0, abstained 1, ballots 4;
//   round 2, position 2 (Q4 reworded: own, with no question id), revealed: the host and Ola for Kuba, Bartek for Ola,
//     Kuba for Bartek: Host 0, Ola 1, Bartek 1, Kuba 2, abstained 0, ballots 4; then the host removes Kuba, and his
//     results go with him;
//   round 3, position 3 (the host's own question: own), skipped after Ola's vote for the host; before the skip Bartek
//     proposes a question and the host approves it, so the skip opens
//   round 4, position 4 (the approved proposal: proposal), with Ola's vote for Bartek in it when "Zakończ grę" ends the
//     game.
// So the history has Host, Ola and Bartek; round 1 Host 0, Ola 2, Bartek 1 (Kuba's 0 gone, and 3 votes + 1 abstained
// = 4 ballots); round 2 Host 0, Ola 1, Bartek 1 (Kuba's 2 gone, so 2 votes + 0 abstained < 4 ballots: the reveal
// decision 2 marks); rounds 3 and 4 with no counts. Sums of the reveals: Host 0, Ola 3, Bartek 2, as game_totals.
describe("the history of an ended game: a reviewed list, two reveals, a removed guest, a skip, a proposal and Zakończ grę mid-round", () => {
  // "Popraw" of Q4, "Dodaj własne" and Bartek's proposal, each as the database keeps it: no trailing "?" to drop.
  const REWORDED = "zgubiłby klucze we własnym domu";
  const OWN = "przypaliłby wodę na herbatę";
  const PROPOSAL = "zaśpiewałby solo na weselu";
  // The candidates of "Następne pytanie" and "Pomiń pytanie": the list plays first, and both are on it.
  const LIST_IDS = [Q3, Q4];
  let game: OwnRoom;
  // Positive control of what the removal takes: round 2 as the host saw it at its reveal, Kuba still in the room.
  let round2Revealed: Answer;
  let history: Answer;
  let lobbyAfter: Answer;
  let anonHistory: Answer;
  let unknownHistory: Answer;
  // A game of the same host still in play, right before its host asks for its history.
  let playingLobby: Answer;
  let playingHistory: Answer;

  beforeAll(async () => {
    // "Nowa gra" closes the room the suite above left in the lobby with Kasia.
    game = await seedRoom(host, { confirmClose: true });
    const ola = await seedGuest(game.linkToken, "Ola");
    const bartek = await seedGuest(game.linkToken, "Bartek");
    const kuba = await seedGuest(game.linkToken, "Kuba");

    mustAccept("open_question_list with Q3 and Q4", await openQuestionList(host.client, game.id, LIST_IDS));
    mustAccept("edit_list_question of position 2", await editListQuestion(host.client, game.id, 2, REWORDED));
    mustAccept("add_own_question", await addOwnQuestion(host.client, game.id, OWN));

    // Round 1: the list's position 1, whatever the start's candidate. The fourth ballot reveals it.
    await seedStartGame(host, game.id, Q3);
    await seedVote(host.client, game.id, "Ola", undefined, 1);
    await seedVote(anon, game.id, "Bartek", ola.playerToken, 1);
    await seedVote(anon, game.id, "Ola", bartek.playerToken, 1);
    await seedVote(anon, game.id, null, kuba.playerToken, 1);

    // Round 2: the reworded position 2. The fourth ballot reveals it; then Kuba, with 2 votes in it, is removed.
    await seedNextRound(host, game.id, 1, LIST_IDS);
    await seedVote(host.client, game.id, "Kuba", undefined, 2);
    await seedVote(anon, game.id, "Kuba", ola.playerToken, 2);
    await seedVote(anon, game.id, "Ola", bartek.playerToken, 2);
    await seedVote(anon, game.id, "Bartek", kuba.playerToken, 2);
    round2Revealed = await roomLobby(host.client, game.id);
    mustAccept("remove_player of Kuba", await removePlayer(host.client, game.id, "Kuba"));

    // Round 3: the host's own position 3. A vote, the approved proposal, then the skip, which opens the proposal.
    await seedNextRound(host, game.id, 2, LIST_IDS);
    await seedVote(anon, game.id, "Host", ola.playerToken, 3);
    mustAccept("propose_question as Bartek", await proposeQuestion(anon, game.id, PROPOSAL, bartek.playerToken));
    mustAccept("approve_proposal of number 1", await approveProposal(host.client, game.id, 1));
    await seedSkipRound(host, game.id, 3, LIST_IDS);

    // Round 4: the proposal, cut short by "Zakończ grę" with one vote in.
    await seedVote(anon, game.id, "Bartek", ola.playerToken, 4);
    mustAccept("end_game of the game", await endGame(host.client, game.id));

    history = await gameHistory(host.client, game.id);
    lobbyAfter = await roomLobby(host.client, game.id);
    // No session, the ended game as the argument: let through, the call would give its whole history.
    anonHistory = await gameHistory(anon, game.id);
    unknownHistory = await gameHistory(host.client, crypto.randomUUID());

    // The host's next game, in play: let through, the call would give its players and its round.
    const playing = await seedRoom(host);
    await seedGuest(playing.linkToken, "Ewa");
    await seedGuest(playing.linkToken, "Zosia");
    await seedStartGame(host, playing.id, Q1);
    playingLobby = await roomLobby(host.client, playing.id);
    playingHistory = await gameHistory(host.client, playing.id);
  });

  // Positive control: an allowed call must work, or a wrong address would look like a refusal everywhere.
  it("positive control: game_history of the ended game as its host answers ok: true, me: Host and the game's times", () => {
    expect(history).toMatchObject({ error: null, data: { ok: true, me: "Host" } });
    expect(timesOf(history.data)).toEqual({ created_at: "a time", started_at: "a time" });
  });

  it("players are Host, Ola and Bartek with colours 0, 1 and 2, in seat order: Kuba, removed, is not there", () => {
    expect(historyList(history, "players")).toEqual([
      { nick: "Host", color: 0 },
      { nick: "Ola", color: 1 },
      { nick: "Bartek", color: 2 },
    ]);
  });

  it("the rounds come in the order they were played: 1 and 2 revealed, 3 skipped, 4 voting (cut short by the end)", () => {
    expect(
      historyList(history, "rounds").map((round) => (isRecord(round) ? [round.number, round.phase] : round)),
    ).toEqual([
      [1, "revealed"],
      [2, "revealed"],
      [3, "skipped"],
      [4, "voting"],
    ]);
  });

  it("round 1, Q3 as it stands, is base with its question id and no text, and keeps its reveal: Host 0, Ola 2, Bartek 1, abstained 1, ballots 4", () => {
    expect(historyList(history, "rounds")[0]).toEqual({
      number: 1,
      phase: "revealed",
      question_id: Q3,
      question_text: null,
      origin: "base",
      results: [
        { nick: "Host", votes: 0 },
        { nick: "Ola", votes: 2 },
        { nick: "Bartek", votes: 1 },
      ],
      abstained: 1,
      ballots: 4,
    });
  });

  it("positive control: at round 2's reveal the room saw Host 0, Ola 1, Bartek 1, Kuba 2, abstained 0, ballots 4", () => {
    expect(round2Revealed.error).toBeNull();
    expect(roundOf(round2Revealed)).toMatchObject({
      number: 2,
      phase: "revealed",
      results: [
        { nick: "Host", votes: 0 },
        { nick: "Ola", votes: 1 },
        { nick: "Bartek", votes: 1 },
        { nick: "Kuba", votes: 2 },
      ],
      abstained: 0,
      ballots: 4,
    });
  });

  it("round 2, Q4 reworded, is own with the reworded text and no question id, and keeps its reveal without Kuba's row: Host 0, Ola 1, Bartek 1, abstained 0, ballots 4", () => {
    expect(historyList(history, "rounds")[1]).toEqual({
      number: 2,
      phase: "revealed",
      question_id: null,
      question_text: REWORDED,
      origin: "own",
      results: [
        { nick: "Host", votes: 0 },
        { nick: "Ola", votes: 1 },
        { nick: "Bartek", votes: 1 },
      ],
      abstained: 0,
      ballots: 4,
    });
  });

  // Decision 2: the Worker tells such a reveal by the sum alone, so the sums are what it will read.
  it("votes and abstentions add up to the ballots in round 1 (4 of 4, Kuba's abstention still counted) and fall short in round 2 (2 of 4, Kuba's 2 votes gone)", () => {
    expect(historyList(history, "rounds").map(countedOf)).toEqual([
      { counted: 4, ballots: 4 },
      { counted: 2, ballots: 4 },
      null,
      null,
    ]);
  });

  it("round 3, the host's own question, is own with its text, skipped, and keeps no results, abstained or ballots", () => {
    expect(historyList(history, "rounds")[2]).toEqual({
      number: 3,
      phase: "skipped",
      question_id: null,
      question_text: OWN,
      origin: "own",
    });
  });

  it("round 4, Bartek's approved proposal, is proposal with its text and no author, still voting when the game ended, and keeps no results, abstained or ballots", () => {
    expect(historyList(history, "rounds")[3]).toEqual({
      number: 4,
      phase: "voting",
      question_id: null,
      question_text: PROPOSAL,
      origin: "proposal",
    });
  });

  it("the answer has exactly the keys ok, created_at, started_at, me, players and rounds; a player exactly nick and color; a round exactly its own keys, a reveal's with results, abstained and ballots; a result exactly nick and votes", () => {
    expect(keysOf(history.data)).toEqual(HISTORY_KEYS);
    expect(historyList(history, "players").map(keysOf)).toEqual([
      HISTORY_PLAYER_KEYS,
      HISTORY_PLAYER_KEYS,
      HISTORY_PLAYER_KEYS,
    ]);
    expect(historyList(history, "rounds").map(keysOf)).toEqual([
      HISTORY_REVEALED_ROUND_KEYS,
      HISTORY_REVEALED_ROUND_KEYS,
      HISTORY_ROUND_KEYS,
      HISTORY_ROUND_KEYS,
    ]);
    expect(historyList(history, "rounds").map((round) => resultsOf(round).map(keysOf))).toEqual([
      [RESULT_KEYS, RESULT_KEYS, RESULT_KEYS],
      [RESULT_KEYS, RESULT_KEYS, RESULT_KEYS],
      [],
      [],
    ]);
  });

  // The summary at the top of the page is counted from the history's reveals by the rule of game_totals (S-15).
  it("the sums of the history's reveals equal room_lobby's game_totals for the same game as its host: Host 0, Ola 3, Bartek 2", () => {
    expect(lobbyAfter).toMatchObject({
      error: null,
      data: {
        status: "closed",
        game_totals: {
          revealed: 2,
          totals: [
            { nick: "Host", votes: 0 },
            { nick: "Ola", votes: 3 },
            { nick: "Bartek", votes: 2 },
          ],
        },
      },
    });
    expect(sumsOfReveals(history)).toEqual(totalsOf(lobbyAfter));
  });

  it("game_history of the host's game still in play gets exactly { ok: false, reason: game_not_ended }", () => {
    expect(playingLobby).toMatchObject({ error: null, data: { status: "playing" } });
    expect(playingHistory).toEqual({ data: { ok: false, reason: "game_not_ended" }, error: null });
  });

  it("game_history of a room that does not exist gets exactly { ok: false, reason: room_unknown }", () => {
    expect(unknownHistory).toEqual({ data: { ok: false, reason: "room_unknown" }, error: null });
  });

  // The history is the signed-in host's: no grant to anon, so the function's name is checked, not only 42501 (G2 in
  // roles.test.ts).
  it("a guest with no session calling game_history is refused permission on the function", () => {
    expect(anonHistory.error?.code).toBe("42501");
    expect(anonHistory.error?.message).toContain("function game_history");
  });
});
