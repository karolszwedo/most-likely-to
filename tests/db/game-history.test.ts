import { beforeAll, describe, expect, it } from "vitest";
import { anonClient, newHost, type Host } from "./support/clients";
import { isRecord, seedGuest, seedRoom, type OwnRoom, type SeededGuest } from "./support/rooms";
import {
  EVENING_QUESTION_IDS,
  deleteGame,
  endGame,
  hostGames,
  joinRequestState,
  keysOf,
  roomLink,
  roomLobby,
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
// 2026-11-10 at the top of context/changes/host-game-history/plan.md: only an ended game can be deleted (1); a row of
// the list has the start of the game (null for a game that never started, which is on the list too), the number of
// questions asked, skipped ones included, and the nicks, newest first (3); a guest of a deleted game is told the game
// is gone, not that they were removed (5). Every id, nick, count and refusal expected here is written out by hand from
// the scenario, never computed. What the deletion takes from the tables the publishable key cannot read, and that the
// question counters stay, is the pgTAP file's (supabase/tests/round_creator_view.test.sql).
//
// host_games, delete_game and join_request_state's gone come from supabase/migrations/*_host_game_history.sql. Without
// it PostgREST answers both new calls with PGRST202 (no such function), join_request_state answers none, and every test
// here is red on its own probe or on the state those calls should have made.
//
// One sign-up per run, in beforeAll. One open room per host, so the rooms come one after another (confirm_close closes
// the one before); Vitest runs the suites in order.

const anon = anonClient();
const [Q1, Q2] = EVENING_QUESTION_IDS;
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
    expect(oldLinkBefore).toEqual({ data: { status: "closed" }, error: null });
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
