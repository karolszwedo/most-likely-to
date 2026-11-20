import { beforeAll, describe, expect, it } from "vitest";
import { anonClient, newHost, newPlayerToken, type Host } from "./support/clients";
import { hostLobbyNicks, readOwnRoom, seedGuest, seedRoom, type OwnRoom, type SeededGuest } from "./support/rooms";
import {
  EVENING_QUESTION_IDS,
  LOBBY_KEYS,
  REVEALED_ROUND_KEYS,
  admitLatecomer,
  endGame,
  keysOf,
  reactRound,
  requestJoin,
  roomLobby,
  roundOf,
  seedNextRound,
  seedReveal,
  seedSkipRound,
  seedStartGame,
  seedVote,
  type Answer,
} from "./support/rounds";

// The thumb on the reveal (S-11) through the roles' own doors: RPC with the publishable key, as the room's guests, as a
// latecomer let in mid-round and as the signed-in host, past the Worker. Oracle: PRD FR-018 (after the reveal a player
// may give the question a thumb up or down, optionally and without holding the host up) and Karol's decisions written
// in context/archive/2026-10-26-question-reactions-play-data/plan.md: every player of the room may give one, the host
// and a latecomer let in mid-round included, since a thumb rates the question and not the result; the other thumb
// switches it and "none" takes it back; only on the latest round once it is revealed, so a screen behind the game gets
// round_over, a round still voting no_round and a closed room room_closed (the refusal codes the round already has);
// nobody else sees a thumb, so room_lobby keeps exactly its keys. What a thumb adds to the question's counters, and
// that it is gone after the fold, is supabase/tests/round_creator_view.test.sql's to check (pgTAP): no role reaches the
// counters.
//
// react_round comes from supabase/migrations/*_question_play_data.sql. Without it PostgREST answers each call with
// PGRST202 (no such function), and every test here is red on its own probe.
//
// One sign-up per run, in beforeAll. One open room per host, so the rooms come one after another: the second one opens
// once the first is closed.

const anon = anonClient();
const [Q1, Q2] = EVENING_QUESTION_IDS;

let host: Host;

beforeAll(async () => {
  host = await newHost();
});

// The game plays out once, in order, in beforeAll: every thumb, every move of the host and every refused try between
// them. Each step's answer is kept and checked by its own test, so no test depends on another one having run.
describe("thumbs in a game: Host, Ola and Bartek play, Kuba is let in mid-round, then a second room", () => {
  let room: OwnRoom;
  let ola: SeededGuest;
  let bartek: SeededGuest;
  // Kuba's token, as the cookie of this room would keep it.
  const kuba = newPlayerToken();
  let olaWhileVoting: Answer;
  let olaUp: Answer;
  let hostUp: Answer;
  let bartekUp: Answer;
  let bartekDown: Answer;
  let bartekNone: Answer;
  let kubaDown: Answer;
  let unknownReaction: Answer;
  let malformedToken: Answer;
  let olaRevealView: Answer;
  let hostRevealView: Answer;
  let olaFromRound1: Answer;
  let olaOnSkipped: Answer;
  let olaAfterEnd: Answer;
  let olaInRoom2: Answer;
  let ewaInRoom2: Answer;

  beforeAll(async () => {
    room = await seedRoom(host);
    ola = await seedGuest(room.linkToken, "Ola");
    bartek = await seedGuest(room.linkToken, "Bartek");
    await seedStartGame(host, room.id, Q1);

    // Round 1 is voting: no result on the screen to rate yet.
    olaWhileVoting = await reactRound(anon, room.id, 1, "up", ola.playerToken);

    // Kuba asks and is let in while round 1 is voting: he may not vote in it, but he sees its reveal.
    await requestJoin(room.linkToken, "Kuba", kuba);
    await admitLatecomer(host.client, room.id, "Kuba");
    const nicks = await hostLobbyNicks(host, room.id);
    if (nicks.join() !== ["Host", "Ola", "Bartek", "Kuba"].join()) {
      throw new Error("precondition failed: Wpuść did not make Kuba the player at seat 4");
    }

    await seedVote(anon, room.id, "Bartek", ola.playerToken, 1);
    await seedReveal(host, room.id, 1);

    // Round 1 is revealed and the latest one. Bartek changes his mind: up, then down, then none takes it back.
    olaUp = await reactRound(anon, room.id, 1, "up", ola.playerToken);
    hostUp = await reactRound(host.client, room.id, 1, "up");
    bartekUp = await reactRound(anon, room.id, 1, "up", bartek.playerToken);
    bartekDown = await reactRound(anon, room.id, 1, "down", bartek.playerToken);
    bartekNone = await reactRound(anon, room.id, 1, "none", bartek.playerToken);
    kubaDown = await reactRound(anon, room.id, 1, "down", kuba);
    unknownReaction = await reactRound(anon, room.id, 1, "sideways", ola.playerToken);
    malformedToken = await reactRound(anon, room.id, 1, "up", "not-a-player-token");
    olaRevealView = await roomLobby(anon, room.id, ola.playerToken);
    hostRevealView = await roomLobby(host.client, room.id);

    // Round 2: Q1 was played, so Q2 comes up, and a thumb sent from round 1's screen is late.
    await seedNextRound(host, room.id, 1, [Q1, Q2]);
    olaFromRound1 = await reactRound(anon, room.id, 1, "down", ola.playerToken);

    // Round 2 is skipped with no question left, so it stays the latest round: it showed no result to rate.
    await seedSkipRound(host, room.id, 2, [Q1, Q2]);
    olaOnSkipped = await reactRound(anon, room.id, 2, "up", ola.playerToken);

    await endGame(host.client, room.id);
    if ((await readOwnRoom(host, room.id)).status !== "closed") {
      throw new Error("precondition failed: end_game did not close the room");
    }
    olaAfterEnd = await reactRound(anon, room.id, 2, "up", ola.playerToken);

    // A second room of the same host, revealed: Ola's token belongs to the first one.
    const room2 = await seedRoom(host);
    const ewa = await seedGuest(room2.linkToken, "Ewa");
    await seedGuest(room2.linkToken, "Zosia");
    await seedStartGame(host, room2.id, Q1);
    await seedReveal(host, room2.id, 1);
    olaInRoom2 = await reactRound(anon, room2.id, 1, "up", ola.playerToken);
    ewaInRoom2 = await reactRound(anon, room2.id, 1, "up", ewa.playerToken);
  });

  // Positive control: an allowed thumb must work, or a wrong address would look like a refusal everywhere. The whole
  // answer: a thumb carries nothing back.
  it("positive control: a guest's and the host's thumb up on the revealed round 1 answer exactly { ok: true }", () => {
    expect(olaUp).toEqual({ data: { ok: true }, error: null });
    expect(hostUp).toEqual({ data: { ok: true }, error: null });
  });

  it("Bartek's thumb up, then down, then none each answer exactly { ok: true }", () => {
    expect(bartekUp).toEqual({ data: { ok: true }, error: null });
    expect(bartekDown).toEqual({ data: { ok: true }, error: null });
    expect(bartekNone).toEqual({ data: { ok: true }, error: null });
  });

  it("Kuba, let in while round 1 was voting, gives its reveal a thumb: exactly { ok: true }", () => {
    expect(kubaDown).toEqual({ data: { ok: true }, error: null });
  });

  it("a thumb while round 1 is voting gets no_round", () => {
    expect(olaWhileVoting).toMatchObject({ error: null, data: { ok: false, reason: "no_round" } });
  });

  it("a thumb sent from round 1's screen after Następne pytanie gets round_over", () => {
    expect(olaFromRound1).toMatchObject({ error: null, data: { ok: false, reason: "round_over" } });
  });

  it("a thumb on the skipped round 2, the latest one, gets round_over", () => {
    expect(olaOnSkipped).toMatchObject({ error: null, data: { ok: false, reason: "round_over" } });
  });

  it("a thumb after the end gets room_closed", () => {
    expect(olaAfterEnd).toMatchObject({ error: null, data: { ok: false, reason: "room_closed" } });
  });

  it("in the second room Ola's token from the first gets room_unknown, while Ewa's own gets ok: true", () => {
    expect(olaInRoom2).toMatchObject({ error: null, data: { ok: false, reason: "room_unknown" } });
    expect(ewaInRoom2).toEqual({ data: { ok: true }, error: null });
  });

  // Not our client's input: an exception, as for a malformed token in a vote, with no row's values in details.
  it.each([
    { what: "a reaction other than up, down and none", answer: () => unknownReaction },
    { what: "a malformed player token", answer: () => malformedToken },
  ])("a thumb with $what is refused with 22023", ({ answer }) => {
    expect(answer()).toMatchObject({ data: null, error: { code: "22023", details: null } });
  });

  // Nobody sees a thumb: not the one who gave it, not the host, and no count of them.
  it.each([
    { viewer: "Ola, who gave a thumb", lobby: () => olaRevealView },
    { viewer: "the host", lobby: () => hostRevealView },
  ])("after the thumbs $viewer sees exactly the lobby's keys and the reveal's keys", ({ lobby }) => {
    expect(keysOf(lobby().data)).toEqual(LOBBY_KEYS);
    expect(keysOf(roundOf(lobby()))).toEqual(REVEALED_ROUND_KEYS);
    expect(roundOf(lobby())).toMatchObject({ number: 1, phase: "revealed" });
  });
});
