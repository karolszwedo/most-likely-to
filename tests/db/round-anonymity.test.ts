import { beforeAll, describe, expect, it } from "vitest";
import { anonClient, newHost, type Host, type TestClient } from "./support/clients";
import { isRecord, readOwnRoom, seedGuest, seedRoom, type OwnRoom, type SeededGuest } from "./support/rooms";
import {
  EVENING_QUESTION_IDS,
  LOBBY_KEYS,
  PLAYER_KEYS,
  RESULT_KEYS,
  REVEALED_ROUND_KEYS,
  SKIPPED_ROUND_KEYS,
  VOTING_ROUND_KEYS,
  castVote,
  endGame,
  keysOf,
  roomLink,
  roomLobby,
  roundOf,
  seedReveal,
  seedSkipRound,
  seedStartGame,
  seedVote,
  type Answer,
} from "./support/rounds";

// Anonymity (#1) through the roles' own doors: RPC and REST with the publishable key, as guests and as the signed-in
// host. No role gets a voter next to a target, or any count before the reveal, and a round that ends without a reveal
// (skipped, or the game ended or closed mid-round) leaves nothing to read. Oracle: PRD Non-Goals and the anonymity NFR
// (nobody, the host and the game's creator included, can tell who voted for whom), AGENTS.md Hard Rules, decision D1
// of context/archive/2026-10-13-first-live-round/research.md (the urn that disappears) and decisions D3 and D4 of
// context/archive/2026-10-15-full-game-evening/research.md (a skipped round keeps no count; ending the game drops the
// urn). What the creator sees as the database owner is supabase/tests/round_creator_view.test.sql's to check (pgTAP).
//
// Exact key sets, not "the fields we know of": a new key in an answer is how a pair or an early count would leak
// (test-plan §2, #1: never only the table's columns). S-08 added two keys tied to no one's vote: room_lobby's requests
// (the latecomers waiting, the host's only; tests/db/latecomers.test.ts checks who sees them) and a voting round's
// eligible (who may vote in it, in seat order), from supabase/migrations/*_latecomer_admission.sql. Without them every
// exact key set of the lobby and of a voting round here is red. S-06 added two more, tied to no one's vote either, from
// *_question_list_review.sql: room_lobby's question_list (the game's question list, the host's only, and null here,
// where no room has one; tests/db/question-list.test.ts checks who sees it) and a voting or revealed round's
// question_text (the text of an own or reworded question, null for a question of the base); without them the exact key
// sets of the lobby and of a voting or revealed round are red. S-15 added room_lobby's game_totals from
// *_game_summary.sql: the sums of a closed room's reveals, counts per nick only, and null in every room here, where no
// closed room had a reveal (tests/db/game-summary.test.ts checks the sums); without it the exact key sets of the lobby
// are red.
//
// The round functions come from supabase/migrations/*_first_live_round.sql, the evening's (skip_round, end_game,
// cast_vote's p_round, room_lobby's skipped round and after_skip) from *_full_game_evening.sql. Without them the suites
// that need them are red (PGRST202, no such function, or a key set without after_skip). The private-schema guard
// starts no round, so it holds with or without them.
//
// One sign-up per run. One open room per host, so the rooms come one after another (confirm_close closes the one
// before); Vitest runs the suites in order, each suite's beforeAll right before its tests.

const anon = anonClient();
let host: Host;

beforeAll(async () => {
  host = await newHost();
});

// S-11 adds the thumbs on a reveal (round_reactions), the question counters (question_stats) and the hosts whose games
// count nothing (stats_excluded_hosts), from *_question_play_data.sql: schema private too, out of every role's reach.
const ROUND_TABLES = [
  "rounds",
  "round_results",
  "ballot_boxes",
  "round_voters",
  "round_reactions",
  "question_stats",
  "stats_excluded_hosts",
];

// The round's tables live in schema private, which the API does not expose (supabase/config.toml: public and
// graphql_public). This guard keeps it that way: a migration that exposed private, or put one of these tables or a
// view of it in public, turns it red. Green from day one: it needs no round.
describe("the round's tables are out of the API's reach", () => {
  const doors = ROUND_TABLES.flatMap((table) => [
    { role: "anon", table, client: (): TestClient => anon },
    { role: "the host", table, client: (): TestClient => host.client },
  ]);

  // PGRST106: the schema is not one the API serves.
  it.each(doors)("$role reading private.$table gets PGRST106 and no rows", async ({ table, client }) => {
    const result = await client().schema("private").from(table).select("*");
    const data: unknown = result.data;

    expect(result.error?.code).toBe("PGRST106");
    expect(data).toBeNull();
  });

  // PGRST205: no such table in the exposed schemas.
  it.each(doors)("$role reading $table without a schema gets PGRST205 and no rows", async ({ table, client }) => {
    const result = await client().from(table).select("*");
    const data: unknown = result.data;

    expect(result.error?.code).toBe("PGRST205");
    expect(data).toBeNull();
  });
});

// While the round is open, who voted is public (FR-009) and how is nobody's. Kuba (seat 4) votes before the host
// (seat 1): the list of who voted must not keep that order, or it would tell the order of voting.
describe("a round in progress shows who voted, never how", () => {
  let room: OwnRoom;
  let ola: SeededGuest;
  let kubaVote: Answer;
  let kubaAgain: Answer;
  let hostVote: Answer;
  let olaView: Answer;
  let kubaView: Answer;
  let hostView: Answer;

  beforeAll(async () => {
    room = await seedRoom(host);
    ola = await seedGuest(room.linkToken, "Ola");
    await seedGuest(room.linkToken, "Bartek");
    const kuba = await seedGuest(room.linkToken, "Kuba");
    await seedStartGame(host, room.id);

    kubaVote = await castVote(anon, room.id, "Ola", kuba.playerToken, 1);
    kubaAgain = await castVote(anon, room.id, "Bartek", kuba.playerToken, 1);
    hostVote = await castVote(host.client, room.id, "Ola", undefined, 1);
    // Two of four have voted: the round stays open.
    olaView = await roomLobby(anon, room.id, ola.playerToken);
    kubaView = await roomLobby(anon, room.id, kuba.playerToken);
    hostView = await roomLobby(host.client, room.id);
  });

  const viewers = [
    { viewer: "a guest who has not voted", meVoted: false, lobby: () => olaView },
    { viewer: "a guest who voted", meVoted: true, lobby: () => kubaView },
    { viewer: "the host", meVoted: true, lobby: () => hostView },
  ];

  // One of the two tests that check the whole answer of an accepted vote (S-02 plan, Faza 5, break-check b): this one
  // for a guest and the host; the skipped-round suite below for a vote in a round that is skipped next. Both carry the
  // question's number, as the room screen sends it. No target, no count.
  it("cast_vote answers exactly { ok: true }, to a guest and to the host", () => {
    expect(kubaVote).toEqual({ data: { ok: true }, error: null });
    expect(hostVote).toEqual({ data: { ok: true }, error: null });
  });

  // A refusal raised as an error would carry Postgres DETAIL (a row's values) in error.details: the refusal is data.
  it("a refused second vote answers exactly { ok: false, reason: already_voted }, no error to carry details", () => {
    expect(kubaAgain).toEqual({ data: { ok: false, reason: "already_voted" }, error: null });
  });

  it.each(viewers)("$viewer sees exactly the voting keys and no count", ({ lobby }) => {
    expect(keysOf(roundOf(lobby()))).toEqual(VOTING_ROUND_KEYS);
  });

  it.each(viewers)("$viewer sees who voted in seat order and whether they voted", ({ meVoted, lobby }) => {
    expect(roundOf(lobby())).toMatchObject({ phase: "voting", voted: ["Host", "Kuba"], me_voted: meVoted });
  });

  // room_lobby keeps the fields of S-01 and adds only round, requests, question_list, game_totals and leader_draw (S-07):
  // no count beside a nick, and nothing per player but the roles everyone sees (host, and cohost since S-07) and the
  // player's colour everyone sees by the nick (color since S-18, from *_player_color_choice.sql), tied to no vote.
  it.each(viewers)(
    "$viewer's lobby has only its old keys plus round, requests, question_list, game_totals and leader_draw, and players only nick, host, cohost and color",
    ({ lobby }) => {
      const data = lobby().data;
      const players: unknown = isRecord(data) ? data.players : null;
      const playerKeys = Array.isArray(players) ? (players as unknown[]).map(keysOf) : [];

      expect(keysOf(data)).toEqual(LOBBY_KEYS);
      expect(playerKeys).toEqual([PLAYER_KEYS, PLAYER_KEYS, PLAYER_KEYS, PLAYER_KEYS]);
    },
  );

  // After the reveal, counts per nick and nothing more (D1: only the counts stay).
  describe("after the reveal", () => {
    let olaRevealView: Answer;
    let hostRevealView: Answer;

    beforeAll(async () => {
      await seedReveal(host, room.id, 1);
      olaRevealView = await roomLobby(anon, room.id, ola.playerToken);
      hostRevealView = await roomLobby(host.client, room.id);
    });

    it.each([
      { viewer: "a guest", lobby: () => olaRevealView },
      { viewer: "the host", lobby: () => hostRevealView },
    ])("$viewer sees exactly the reveal keys, and each result is exactly nick and votes", ({ lobby }) => {
      const round = roundOf(lobby());
      const results: unknown = round?.results;
      const resultKeys = Array.isArray(results) ? (results as unknown[]).map(keysOf) : [];

      expect(keysOf(round)).toEqual(REVEALED_ROUND_KEYS);
      expect(resultKeys).toEqual([RESULT_KEYS, RESULT_KEYS, RESULT_KEYS, RESULT_KEYS]);
    });
  });
});

// D1: a round that ends without a reveal ("Nowa gra" mid-round) leaves no counts and no voters behind.
describe("a room closed mid-round keeps nothing of the round", () => {
  let room: OwnRoom;
  let olaToken: string;

  beforeAll(async () => {
    // Closes the room of the round above.
    room = await seedRoom(host, { confirmClose: true });
    const ola = await seedGuest(room.linkToken, "Ola");
    const bartek = await seedGuest(room.linkToken, "Bartek");
    olaToken = ola.playerToken;
    await seedStartGame(host, room.id);
    await seedVote(anon, room.id, "Ola", bartek.playerToken, 1);
    // "Nowa gra" with the "guests are still in it" question answered.
    await seedRoom(host, { confirmClose: true });
    if ((await readOwnRoom(host, room.id)).status !== "closed") {
      throw new Error("precondition failed: the new room did not close the room mid-round");
    }
  });

  it("the old room's link answers exactly { status: closed }", async () => {
    const answer = await roomLink(room.linkToken);

    expect(answer).toEqual({ data: { status: "closed" }, error: null });
  });

  // No reveal happened, so no counts may appear: not as a revealed round, not anywhere in the round.
  it.each([
    { viewer: "a guest", read: () => roomLobby(anon, room.id, olaToken) },
    { viewer: "the host", read: () => roomLobby(host.client, room.id) },
  ])("$viewer reading the old room sees it closed and no counts", async ({ read }) => {
    const answer = await read();
    const countKeys = keysOf(roundOf(answer)).filter((key) => ["abstained", "ballots", "results"].includes(key));

    expect(answer).toMatchObject({ error: null, data: { status: "closed" } });
    expect(countKeys).toEqual([]);
  });
});

// D3: a skipped round's votes are gone for everyone. The round after a skip shows only the voting keys, with nobody's
// vote from the skipped one, and a skipped round that stays the latest one (no question left) shows its number and
// phase: no count, no question, not even who voted in it.
describe("a skipped round keeps nothing of its votes", () => {
  const [Q1, Q2] = EVENING_QUESTION_IDS;
  let olaVoteWithNumber: Answer;
  let olaNextView: Answer;
  let bartekNextView: Answer;
  let hostNextView: Answer;
  let olaSkippedView: Answer;
  let bartekSkippedView: Answer;
  let hostSkippedView: Answer;

  beforeAll(async () => {
    // Closes the lobby left open by "Nowa gra" above.
    const room = await seedRoom(host, { confirmClose: true });
    const ola = await seedGuest(room.linkToken, "Ola");
    const bartek = await seedGuest(room.linkToken, "Bartek");
    await seedStartGame(host, room.id, Q1);

    // Round 1: Ola votes with the question's number, then the host skips it; Q2 comes up as round 2.
    olaVoteWithNumber = await castVote(anon, room.id, "Bartek", ola.playerToken, 1);
    await seedSkipRound(host, room.id, 1, [Q1, Q2]);
    olaNextView = await roomLobby(anon, room.id, ola.playerToken);
    bartekNextView = await roomLobby(anon, room.id, bartek.playerToken);
    hostNextView = await roomLobby(host.client, room.id);

    // Round 2: Ola votes again, then the host skips it with no question left, so it stays the latest round.
    await seedVote(anon, room.id, "Bartek", ola.playerToken, 2);
    await seedSkipRound(host, room.id, 2, [Q1, Q2]);
    olaSkippedView = await roomLobby(anon, room.id, ola.playerToken);
    bartekSkippedView = await roomLobby(anon, room.id, bartek.playerToken);
    hostSkippedView = await roomLobby(host.client, room.id);
  });

  // The other test that checks the whole answer of an accepted vote.
  it("cast_vote with the question's number answers exactly { ok: true }", () => {
    expect(olaVoteWithNumber).toEqual({ data: { ok: true }, error: null });
  });

  it.each([
    { viewer: "Ola, who voted in the skipped round", lobby: () => olaNextView },
    { viewer: "Bartek, who did not", lobby: () => bartekNextView },
    { viewer: "the host", lobby: () => hostNextView },
  ])("after a skip $viewer sees the next round with exactly the voting keys and nobody's vote", ({ lobby }) => {
    const round = roundOf(lobby());

    expect(keysOf(round)).toEqual(VOTING_ROUND_KEYS);
    expect(round).toMatchObject({ number: 2, phase: "voting", voted: [], me_voted: false, after_skip: true });
  });

  it.each([
    { viewer: "Ola, who voted in the skipped round", lobby: () => olaSkippedView },
    { viewer: "Bartek, who did not", lobby: () => bartekSkippedView },
    { viewer: "the host", lobby: () => hostSkippedView },
  ])("$viewer sees the last skipped round with exactly its number and phase", ({ lobby }) => {
    expect(keysOf(lobby().data)).toEqual(LOBBY_KEYS);
    expect(keysOf(roundOf(lobby()))).toEqual(SKIPPED_ROUND_KEYS);
  });
});

// D4: "Zakończ grę" mid-round, like "Nowa gra", leaves no counts and no voters behind.
describe("a game ended mid-round keeps nothing of the round", () => {
  let room: OwnRoom;
  let olaToken: string;
  let bartekToken: string;

  beforeAll(async () => {
    room = await seedRoom(host, { confirmClose: true });
    const ola = await seedGuest(room.linkToken, "Ola");
    const bartek = await seedGuest(room.linkToken, "Bartek");
    olaToken = ola.playerToken;
    bartekToken = bartek.playerToken;
    await seedStartGame(host, room.id);
    await seedVote(anon, room.id, "Ola", bartek.playerToken, 1);
    await endGame(host.client, room.id);
    if ((await readOwnRoom(host, room.id)).status !== "closed") {
      throw new Error("precondition failed: end_game did not close the room mid-round");
    }
  });

  it("the ended game's link answers exactly { status: closed }", async () => {
    const answer = await roomLink(room.linkToken);

    expect(answer).toEqual({ data: { status: "closed" }, error: null });
  });

  it.each([
    { viewer: "Bartek, who voted", read: () => roomLobby(anon, room.id, bartekToken) },
    { viewer: "Ola, who did not", read: () => roomLobby(anon, room.id, olaToken) },
    { viewer: "the host", read: () => roomLobby(host.client, room.id) },
  ])("$viewer sees the room closed with no round, and only the lobby's keys", async ({ read }) => {
    const answer = await read();

    expect(answer).toMatchObject({ error: null, data: { status: "closed", round: null } });
    expect(keysOf(answer.data)).toEqual(LOBBY_KEYS);
  });
});
