import { beforeAll, describe, expect, it } from "vitest";
import { QUESTIONS, type QuestionId } from "@/data/questions";
import { anonClient, newHost, newPlayerToken, type Host } from "./support/clients";
import { SEED_CATEGORIES, isRecord, seedGuest, seedRoom, type OwnRoom, type SeededGuest } from "./support/rooms";
import {
  EVENING_QUESTION_IDS,
  LOBBY_KEYS,
  PLAYER_KEYS,
  addOwnQuestion,
  admitLatecomer,
  endGame,
  joinRequestState,
  keysOf,
  nextRound,
  openQuestionList,
  rejectLatecomer,
  removeListQuestion,
  requestJoin,
  revealRound,
  roomLobby,
  setCohost,
  skipRound,
  startGame,
  type Answer,
} from "./support/rounds";

// The co-host (S-07) through the roles' own doors: RPC with the publishable key, as the room's guests (anon with a
// player token: a co-host has no session) and as the signed-in host, past the Worker. Oracle: PRD FR-003 (the host
// gives and takes the co-host role of a guest in the room), FR-006 and FR-009 (the host or a co-host starts the game,
// reveals, moves on, skips and ends it), FR-020 (latecomers are let in by the host or a co-host, and both see who asks),
// PRD Access Control (a co-host leads the game but does not give the role and has no host's panel), and Karol's
// decisions 1-6 in context/changes/co-host-role/research.md ("Decyzje do planu"): any number of co-hosts; any guest of
// the room, a latecomer let in included, never the host; a co-host ends the game too; the game's question list and the
// players' link stay the host's. A player of the room without the role gets not_leader, anyone else room_unknown, as
// written in context/changes/co-host-role/plan.md. Every nick, question, count and refusal expected here is written out
// by hand from the scenario, never computed.
//
// players.cohost, private.leader_refusal, set_cohost, the leader's moves with p_player_token and room_lobby's cohost and
// leader_draw come from supabase/migrations/*_co_host_role.sql. Without it PostgREST answers set_cohost and every move
// with a token with PGRST202 (no such function), and every test here is red on its own probe or on the state those
// calls should have made.
//
// A known hole is a test.fails with the oracle's expectation (test-plan §6.2): preconditions live in beforeAll, whose
// helpers throw (a failed beforeAll stays red; beforeEach and afterEach would run inside the test, so this file has
// none); the hole's probe is kept from beforeAll, its body never throws and returns early on a failed call, so the test
// passes and test.fails shows it red; the closing expect is the only thing that can fail.
//
// One sign-up per run, in beforeAll. One open room per host, so the second room opens once the first is closed
// (confirm_close closes it should the end have failed); Vitest runs the suites in order, each suite's beforeAll right
// before its tests.

const KNOWN_HOLE_F1 = "znana dziura F1 → S-17: ";

const anon = anonClient();
const [Q1, Q2, Q3, Q4] = EVENING_QUESTION_IDS;
// The whole pool, as the Worker would send it at any point of the first room's game.
const POOL = [Q1, Q2, Q3, Q4];
// An 18+ question of the first seed category (SEED_CATEGORIES in support/rooms.ts). Every room here is opened with no
// 18+ category, so the host left it out of the game (FR-005). `satisfies` makes the build fail if the id ever leaves
// the base or stops being 18+; its category is checked against the seed's in beforeAll.
const ADULT_QUESTION_ID = "na-co-dzien-021" satisfies QuestionId;
const ADULT_QUESTION = QUESTIONS[ADULT_QUESTION_ID] satisfies { adult: true };
// "Przejrzyj pytania" in the second room: 15 questions of the first seed category, none 18+.
const LIST_CANDIDATES = [
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
] as const satisfies readonly QuestionId[];
// Not a player token: the Worker sends the cookie's 32-byte one or none.
const MALFORMED_TOKEN = "not-a-player-token";

let host: Host;
// Ola's token, a co-host of the first room: the second room's stranger.
let olaToken: string;

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

// A top-level field of a room_lobby answer (leader_draw, requests, players); undefined when the answer has none. Never
// throws.
function fieldOf(answer: Answer, key: string): unknown {
  return isRecord(answer.data) ? answer.data[key] : undefined;
}

const OK = { data: { ok: true }, error: null };

// The first room's game plays out once, in order, in beforeAll: every move of Ola, the co-host, with her token and no
// session, every refused try of Kuba, a guest with no role, and every give and take of the role by the host. Each
// step's answer is kept and checked by its own test, so no test depends on another one having run. Kuba's tries come
// right after Ola's move of the same kind (his end_game in the lobby), each with arguments that would change nothing if
// it got through: the answer names the role either way, and a hole shows only in his own tests.
describe("a game led by Ola, a co-host: Host, Ola and Kuba play, Ula is let in and given the role too", () => {
  let room: OwnRoom;
  let ola: SeededGuest;
  let kuba: SeededGuest;
  // Each latecomer's token, as the cookie of this room would keep it.
  const ula = newPlayerToken();
  const wiktor = newPlayerToken();
  const hania = newPlayerToken();
  const tomek = newPlayerToken();
  // set_cohost's refusals in the lobby.
  let anonGives: Answer;
  let hostNickGiven: Answer;
  let unknownNickGiven: Answer;
  // The role, given, given again, taken, given back.
  let olaGiven: Answer;
  let olaGivenAgain: Answer;
  let olaTaken: Answer;
  let olaGivenBack: Answer;
  // Ola's moves.
  let olaStarts: Answer;
  let olaAdmits: Answer;
  let olaRejects: Answer;
  let olaReveals: Answer;
  let olaNext: Answer;
  let olaSkips: Answer;
  let olaEnds: Answer;
  // What they did.
  let afterStart: Answer;
  let wiktorAfterReject: Answer;
  let afterReveal: Answer;
  let afterNext: Answer;
  let afterSkip: Answer;
  let afterEnd: Answer;
  // Kuba's tries, one per move.
  let kubaEnds: Answer;
  let kubaStarts: Answer;
  let kubaAdmits: Answer;
  let kubaRejects: Answer;
  let kubaReveals: Answer;
  let kubaNext: Answer;
  let kubaSkips: Answer;
  // The states while Hania waits.
  let olaView: Answer;
  let kubaView: Answer;
  let olaViewTaken: Answer;
  // Ula, let in mid-game, as a co-host.
  let ulaGiven: Answer;
  let ulaView: Answer;
  let ulaAdmits: Answer;
  // Ola once her role is taken.
  let olaRevealsTaken: Answer;
  // The known hole's probe.
  let adultNext: Answer;
  // The closed room.
  let closedGiven: Answer;

  beforeAll(async () => {
    if (!SEED_CATEGORIES.includes(ADULT_QUESTION.category)) {
      throw new Error("precondition failed: ADULT_QUESTION_ID is not a question of a picked category");
    }

    room = await seedRoom(host);
    ola = await seedGuest(room.linkToken, "Ola");
    kuba = await seedGuest(room.linkToken, "Kuba");
    olaToken = ola.playerToken;

    // The lobby: only the host gives the role, and only to a guest of the room.
    anonGives = await setCohost(anon, room.id, "Ola", true);
    hostNickGiven = await setCohost(host.client, room.id, "Host", true);
    unknownNickGiven = await setCohost(host.client, room.id, "Zenon", true);
    // Let through, the lobby would only answer no_round.
    kubaEnds = await endGame(anon, room.id, kuba.playerToken);

    olaGiven = await setCohost(host.client, room.id, "Ola", true);
    olaGivenAgain = await setCohost(host.client, room.id, "Ola", true);

    olaStarts = await startGame(anon, room.id, Q1, ola.playerToken);
    afterStart = await roomLobby(host.client, room.id);
    // Let through, the game in play would only answer game_started.
    kubaStarts = await startGame(anon, room.id, Q2, kuba.playerToken);

    // Round 1 is voting: three latecomers ask. Ola lets Ula in and turns Wiktor away; Hania waits.
    mustAccept("Ula's request", await requestJoin(room.linkToken, "Ula", ula));
    mustAccept("Wiktor's request", await requestJoin(room.linkToken, "Wiktor", wiktor));
    olaAdmits = await admitLatecomer(anon, room.id, "Ula", ola.playerToken);
    // Let through, Ula's request is gone already: request_unknown.
    kubaAdmits = await admitLatecomer(anon, room.id, "Ula", kuba.playerToken);
    olaRejects = await rejectLatecomer(anon, room.id, "Wiktor", ola.playerToken);
    wiktorAfterReject = await joinRequestState(room.id, wiktor);
    // Let through, Wiktor waits no more: request_unknown.
    kubaRejects = await rejectLatecomer(anon, room.id, "Wiktor", kuba.playerToken);
    mustAccept("Hania's request", await requestJoin(room.linkToken, "Hania", hania));
    olaView = await roomLobby(anon, room.id, ola.playerToken);
    kubaView = await roomLobby(anon, room.id, kuba.playerToken);

    // Ula, let in mid-game, is given the role and lets Tomek in.
    ulaGiven = await setCohost(host.client, room.id, "Ula", true);
    ulaView = await roomLobby(anon, room.id, ula);
    mustAccept("Tomek's request", await requestJoin(room.linkToken, "Tomek", tomek));
    ulaAdmits = await admitLatecomer(anon, room.id, "Tomek", ula);

    olaReveals = await revealRound(anon, room.id, 1, ola.playerToken);
    afterReveal = await roomLobby(host.client, room.id);
    // Let through, a second reveal changes nothing (D3).
    kubaReveals = await revealRound(anon, room.id, 1, kuba.playerToken);

    // Round 2: Q1 was played, so Q2 comes up.
    olaNext = await nextRound(anon, room.id, 1, POOL, ola.playerToken);
    afterNext = await roomLobby(host.client, room.id);
    // Let through, round 1 is no longer the latest: round_over.
    kubaNext = await nextRound(anon, room.id, 1, [Q4], kuba.playerToken);

    // Round 2 is skipped and Q3 comes up.
    olaSkips = await skipRound(anon, room.id, 2, POOL, ola.playerToken);
    afterSkip = await roomLobby(host.client, room.id);
    // Let through, round 2 is no longer the latest: round_over.
    kubaSkips = await skipRound(anon, room.id, 2, [Q4], kuba.playerToken);

    // The known hole's precondition: Ola leads, and round 3 is revealed and the latest one, so a next question may open.
    mustAccept("Ola's reveal of round 3", await revealRound(anon, room.id, 3, ola.playerToken));
    adultNext = await nextRound(anon, room.id, 3, [ADULT_QUESTION_ID], ola.playerToken);

    // The host takes Ola's role while Hania still waits, then gives it back.
    olaTaken = await setCohost(host.client, room.id, "Ola", false);
    olaViewTaken = await roomLobby(anon, room.id, ola.playerToken);
    // Let through, round 1 is no longer the latest: round_over.
    olaRevealsTaken = await revealRound(anon, room.id, 1, ola.playerToken);
    olaGivenBack = await setCohost(host.client, room.id, "Ola", true);

    // A co-host ends the game too (decision 3).
    olaEnds = await endGame(anon, room.id, ola.playerToken);
    afterEnd = await roomLobby(host.client, room.id);
    closedGiven = await setCohost(host.client, room.id, "Kuba", true);
  });

  // Positive control: the role must be given and seen, or a wrong address would look like a refusal everywhere.
  it("positive control: set_cohost gives Ola the role with exactly { ok: true }, and her state shows the role, the room's categories and the requests", () => {
    expect(olaGiven).toEqual(OK);
    expect(olaView).toMatchObject({
      error: null,
      data: {
        status: "playing",
        role: "guest",
        me: "Ola",
        players: [
          { nick: "Host", host: true, cohost: false },
          { nick: "Ola", host: false, cohost: true },
          { nick: "Kuba", host: false, cohost: false },
          { nick: "Ula", host: false, cohost: false },
        ],
        requests: ["Hania"],
      },
    });
    // The room was opened with the seed categories and no 18+ one; no list.
    expect(fieldOf(olaView, "leader_draw")).toEqual({
      categories: SEED_CATEGORIES,
      adult_categories: [],
      list_entries: 0,
      list_base_count: 0,
    });
  });

  // Exact keys (test-plan §6.3): a co-host's state is no wider than anyone's. Each player's color since S-18.
  it("Ola's state as a co-host has exactly the lobby's keys, and each player exactly nick, host, cohost and color", () => {
    const players: unknown = fieldOf(olaView, "players");

    expect(keysOf(olaView.data)).toEqual(LOBBY_KEYS);
    expect(Array.isArray(players) ? (players as unknown[]).map(keysOf) : []).toEqual([
      PLAYER_KEYS,
      PLAYER_KEYS,
      PLAYER_KEYS,
      PLAYER_KEYS,
    ]);
  });

  it("giving Ola the role a second time, taking it and giving it back each answer exactly { ok: true }", () => {
    expect(olaGivenAgain).toEqual(OK);
    expect(olaTaken).toEqual(OK);
    expect(olaGivenBack).toEqual(OK);
  });

  // FR-006, FR-009, FR-020: a co-host makes every move of the leader, with her token and no session.
  it.each([
    { move: "start_game", answer: () => olaStarts },
    { move: "admit_latecomer (Ula)", answer: () => olaAdmits },
    { move: "reject_latecomer (Wiktor)", answer: () => olaRejects },
    { move: "reveal_round (round 1)", answer: () => olaReveals },
    { move: "next_round (from round 1)", answer: () => olaNext },
    { move: "skip_round (round 2)", answer: () => olaSkips },
    { move: "end_game", answer: () => olaEnds },
  ])("Ola, a co-host with her token, makes $move: exactly { ok: true }", ({ answer }) => {
    expect(answer()).toEqual(OK);
  });

  // Ula let in shows in the positive control's players.
  it("Ola's moves took effect: the game started on Q1, Wiktor turned away, round 1 revealed, Q2, then Q3 after the skip, and the room closed", () => {
    expect(afterStart).toMatchObject({
      error: null,
      data: { status: "playing", round: { number: 1, question_id: Q1, phase: "voting" } },
    });
    expect(wiktorAfterReject).toEqual({ data: { state: "rejected", nick: "Wiktor" }, error: null });
    expect(afterReveal).toMatchObject({ error: null, data: { round: { number: 1, phase: "revealed" } } });
    expect(afterNext).toMatchObject({ error: null, data: { round: { number: 2, question_id: Q2, phase: "voting" } } });
    expect(afterSkip).toMatchObject({
      error: null,
      data: { round: { number: 3, question_id: Q3, phase: "voting", after_skip: true } },
    });
    expect(afterEnd).toMatchObject({ error: null, data: { status: "closed", requests: [] } });
  });

  // Decision 2: any guest of the room, a latecomer let in included; any number of co-hosts.
  it("Ula, let in mid-game, is given the role next to Ola and lets Tomek in: each exactly { ok: true }", () => {
    expect(ulaGiven).toEqual(OK);
    expect(ulaView).toMatchObject({
      error: null,
      data: {
        me: "Ula",
        players: [
          { nick: "Host", cohost: false },
          { nick: "Ola", cohost: true },
          { nick: "Kuba", cohost: false },
          { nick: "Ula", cohost: true },
        ],
      },
    });
    expect(ulaAdmits).toEqual(OK);
  });

  it.each([
    { move: "end_game (in the lobby)", answer: () => kubaEnds },
    { move: "start_game", answer: () => kubaStarts },
    { move: "admit_latecomer", answer: () => kubaAdmits },
    { move: "reject_latecomer", answer: () => kubaRejects },
    { move: "reveal_round", answer: () => kubaReveals },
    { move: "next_round", answer: () => kubaNext },
    { move: "skip_round", answer: () => kubaSkips },
  ])("Kuba, a guest with no co-host role, making $move gets not_leader", ({ answer }) => {
    expect(answer()).toMatchObject({ error: null, data: { ok: false, reason: "not_leader" } });
  });

  // The role is taken between two moves: the room's lock orders them, so the next one is refused.
  it("once the host takes Ola's role, her reveal gets not_leader", () => {
    expect(olaRevealsTaken).toMatchObject({ error: null, data: { ok: false, reason: "not_leader" } });
  });

  // Only a leader decides who comes in and draws the next question; Hania waits, so a leader's state would show her.
  it.each([
    { player: "Kuba, a guest with no role,", lobby: () => kubaView },
    { player: "Ola, once the host takes her role,", lobby: () => olaViewTaken },
  ])("$player sees leader_draw: null and requests: [] while Hania waits", ({ lobby }) => {
    expect(lobby().error).toBeNull();
    expect(fieldOf(lobby(), "leader_draw")).toBeNull();
    expect(fieldOf(lobby(), "requests")).toEqual([]);
  });

  it("once the host takes Ola's role, her row says cohost: false", () => {
    expect(olaViewTaken).toMatchObject({
      error: null,
      data: {
        players: [
          { nick: "Host", cohost: false },
          { nick: "Ola", cohost: false },
          { nick: "Kuba", cohost: false },
          { nick: "Ula", cohost: true },
          { nick: "Tomek", cohost: false },
        ],
      },
    });
  });

  // Only the signed-in host gives the role: no grant to anon, so the function's name is checked, not only 42501 (G2).
  it("a guest calling set_cohost is refused permission on the function", () => {
    expect(anonGives.error?.code).toBe("42501");
    expect(anonGives.error?.message).toContain("function set_cohost");
  });

  // Decision 2: a guest of the room, never the host.
  it.each([
    { nick: "the host's own nick", answer: () => hostNickGiven },
    { nick: "a nick in no room", answer: () => unknownNickGiven },
  ])("set_cohost with $nick gets player_unknown", ({ answer }) => {
    expect(answer()).toMatchObject({ error: null, data: { ok: false, reason: "player_unknown" } });
  });

  it("set_cohost in the closed room gets room_closed", () => {
    expect(closedGiven).toMatchObject({ error: null, data: { ok: false, reason: "room_closed" } });
  });

  // Known hole F1 of context/changes/co-host-role/reviews/plan-review.md: the database checks only the format of a
  // question id, and the pool (the picked categories, 18+ only where the host included it, FR-005) only the Worker. A
  // co-host calling next_round with the token of its own cookie opens any question of the base. The fix (the pool in
  // the database) is not on the roadmap yet.
  it.fails(`${KNOWN_HOLE_F1}Ola's next_round with an 18+ question the host left out is refused`, () => {
    // A failed call is not the expected failure: returning passes the test, and test.fails shows it red.
    if (adultNext.error !== null) return;

    expect(adultNext.data).toMatchObject({ ok: false });
  });
});

// The second room, a lobby to the end of the file: Ewa is a co-host while the host reviews the game's question list,
// and Zosia has no role. Strangers to the room try every move of the leader in the tests: in a lobby of 3 with a list,
// a start that got through would open the game.
describe("a second room: Ewa, a co-host, next to the host's question list; Zosia with no role; strangers", () => {
  let room: OwnRoom;
  let hostView: Answer;
  let ewaView: Answer;
  let zosiaView: Answer;

  beforeAll(async () => {
    room = await seedRoom(host, { confirmClose: true });
    const ewa = await seedGuest(room.linkToken, "Ewa");
    const zosia = await seedGuest(room.linkToken, "Zosia");

    // The host's list: 15 entries, two of them removed, one own question added. So 14 entries in play, and 15 rows with
    // a question id of the base: the removed ones count, the own one does not.
    mustAccept("Przejrzyj pytania", await openQuestionList(host.client, room.id, [...LIST_CANDIDATES]));
    mustAccept("Usuń of position 2", await removeListQuestion(host.client, room.id, 2));
    mustAccept("Usuń of position 3", await removeListQuestion(host.client, room.id, 3));
    mustAccept("Dodaj własne", await addOwnQuestion(host.client, room.id, "zasnąłby w kinie"));
    mustAccept("giving Ewa the role", await setCohost(host.client, room.id, "Ewa", true));

    hostView = await roomLobby(host.client, room.id);
    ewaView = await roomLobby(anon, room.id, ewa.playerToken);
    zosiaView = await roomLobby(anon, room.id, zosia.playerToken);
  });

  // The game's question list stays the host's (decision 4 and S-06); a co-host gets only what the Worker needs to draw
  // and to count the questions left.
  it("Ewa, a co-host, sees question_list: null and the same leader_draw as the host: the list's 14 entries and its base_count 15", () => {
    const draw = { categories: SEED_CATEGORIES, adult_categories: [], list_entries: 14, list_base_count: 15 };
    const hostList: unknown = fieldOf(hostView, "question_list");
    const hostEntries: unknown = isRecord(hostList) ? hostList.entries : null;

    // Positive control: the host does see the list, so Ewa's null is the role's, not a missing list.
    expect(Array.isArray(hostEntries) ? hostEntries.length : null).toBe(14);
    expect(fieldOf(hostView, "leader_draw")).toEqual(draw);
    expect(ewaView).toMatchObject({ error: null, data: { status: "lobby", me: "Ewa", question_list: null } });
    expect(fieldOf(ewaView, "leader_draw")).toEqual(draw);
  });

  it("Zosia, a guest with no role, sees leader_draw: null", () => {
    expect(zosiaView.error).toBeNull();
    expect(fieldOf(zosiaView, "leader_draw")).toBeNull();
  });

  // Every move of the leader, with arguments the room's own leader could send now. end_game last, so a hole cannot
  // close the room under the ones before it.
  const MOVES = [
    { fn: "start_game", attempt: (token?: string) => startGame(anon, room.id, Q1, token) },
    { fn: "reveal_round", attempt: (token?: string) => revealRound(anon, room.id, 1, token) },
    { fn: "next_round", attempt: (token?: string) => nextRound(anon, room.id, 1, [Q2], token) },
    { fn: "skip_round", attempt: (token?: string) => skipRound(anon, room.id, 1, [Q2], token) },
    { fn: "admit_latecomer", attempt: (token?: string) => admitLatecomer(anon, room.id, "Zosia", token) },
    { fn: "reject_latecomer", attempt: (token?: string) => rejectLatecomer(anon, room.id, "Zosia", token) },
    { fn: "end_game", attempt: (token?: string) => endGame(anon, room.id, token) },
  ];

  // The moves are public endpoints since S-07: someone who is not a player of the room learns nothing about it.
  it.each(MOVES)("someone with no token making $fn gets room_unknown", async ({ attempt }) => {
    const answer = await attempt();

    expect(answer).toMatchObject({ error: null, data: { ok: false, reason: "room_unknown" } });
  });

  // A co-host leads only the room she plays in.
  it.each(MOVES)(
    "Ola, a co-host of the first room, making $fn here with her token gets room_unknown",
    async ({ attempt }) => {
      const answer = await attempt(olaToken);

      expect(answer).toMatchObject({ error: null, data: { ok: false, reason: "room_unknown" } });
    },
  );

  // Not our client's input: an exception, as for a malformed token in a vote, with no row's values in details.
  it.each(MOVES)("making $fn with a malformed player token is refused with 22023", async ({ attempt }) => {
    const answer = await attempt(MALFORMED_TOKEN);

    expect(answer).toMatchObject({ data: null, error: { code: "22023", details: null } });
  });

  // The role changes only through set_cohost: the host reads players through RLS and has no update or insert on it.
  it("the host cannot give the role over REST: updating Zosia's cohost and inserting a co-host get 42501, and the players stay as they were", async () => {
    const update = await host.client
      .from("players")
      .update({ cohost: true })
      .eq("room_id", room.id)
      .eq("nick", "Zosia");
    const insert = await host.client.from("players").insert({ room_id: room.id, nick: "Zenek", seat: 9, cohost: true });
    const read = await host.client.from("players").select("nick, cohost").eq("room_id", room.id).order("seat");
    const rows: unknown = read.data;

    expect(update.error?.code).toBe("42501");
    expect(insert.error?.code).toBe("42501");
    expect(read.error).toBeNull();
    expect(rows).toEqual([
      { nick: "Host", cohost: false },
      { nick: "Ewa", cohost: true },
      { nick: "Zosia", cohost: false },
    ]);
  });
});
