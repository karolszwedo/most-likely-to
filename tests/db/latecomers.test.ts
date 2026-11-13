import { beforeAll, describe, expect, it } from "vitest";
import { anonClient, newHost, newPlayerToken, type Host } from "./support/clients";
import { isRecord, seedGuest, seedRoom, type OwnRoom, type SeededGuest } from "./support/rooms";
import {
  EVENING_QUESTION_IDS,
  admitLatecomer,
  castVote,
  endGame,
  joinRequestState,
  nextRound,
  rejectLatecomer,
  requestJoin,
  roomLobby,
  seedStartGame,
  type Answer,
} from "./support/rounds";

// Latecomers (S-08) through the roles' own doors: RPC with the publishable key, as the room's guests, as latecomers
// (anon, each with a player token of its own, as the Worker's cookie will keep it) and as the signed-in host, past the
// Worker. Oracle: PRD FR-020 (a latecomer asks to join a game in play with a nick of their choice, the host sees the
// request on every screen of the game and lets them in, and whoever is let in sees the current round and votes from
// the next one) and Karol's decisions 1-6 on the Open Questions of
// context/archive/2026-10-22-latecomer-admission/research.md, as written in
// context/archive/2026-10-22-latecomer-admission/plan.md: "Wpuść" and "Odrzuć", a request waits until the host decides
// or the room closes, and a rejected one may ask again; at most 5 wait at once; a request's nick follows the nick rule
// of joining and is taken by a player or by another waiting request; the one waiting sees only its own request, never
// the question; the one let in mid-round is not among those who vote in it, and nobody votes for them in it. Every
// nick, list and count expected here is written out by hand from the scenario, never computed.
//
// request_join, join_request_state, admit_latecomer, reject_latecomer, room_lobby's requests and round.eligible come
// from supabase/migrations/*_latecomer_admission.sql. Without them PostgREST answers each new call with PGRST202 (no
// such function), and every test here is red on its own probe or on the state those calls should have made. Another
// host letting someone into this host's game is round-rules.test.ts's to check, where the second host lives.
//
// One sign-up per run, in beforeAll. The file plays one room, then a second one for the requests sent at once (F1 of
// context/archive/2026-10-22-latecomer-admission/follow-ups/review-fixes.md): one open room per host, so it opens once
// the first is closed (confirm_close closes it should the end have failed); Vitest runs the suites in order.

const anon = anonClient();
const [Q1, Q2] = EVENING_QUESTION_IDS;

let host: Host;

beforeAll(async () => {
  host = await newHost();
});

// The game plays out once, in order, in beforeAll: every request, every move of the host and every refused try between
// them. Each step's answer is kept and checked by its own test, so no test depends on another one having run.
describe("a game with latecomers: Host, Ola and Bartek play, Kuba and five more ask to join", () => {
  let room: OwnRoom;
  let ola: SeededGuest;
  let bartek: SeededGuest;
  // Each latecomer's token, as the cookie of this room would keep it.
  const ela = newPlayerToken();
  const kuba = newPlayerToken();
  const zosia = newPlayerToken();
  const wiktor = newPlayerToken();
  const hania = newPlayerToken();
  const tomek = newPlayerToken();
  const ula = newPlayerToken();
  // The lobby.
  let elaAsksInLobby: Answer;
  let elaAfterStart: Answer;
  // Round 1: Kuba asks.
  let kubaAsks: Answer;
  let kubaWaiting: Answer;
  let kubaLobbyWhileWaiting: Answer;
  let hostSeesKuba: Answer;
  let olaSeesKuba: Answer;
  let kubaAsksAgain: Answer;
  let kubaStillWaiting: Answer;
  // Nicks and the limit.
  let asksAsPlayer: Answer;
  let asksAsWaiting: Answer;
  let fourMoreAsk: Answer[];
  let ulaAsksSixth: Answer;
  let hostSeesFive: Answer;
  // Odrzuć and Wpuść.
  let rejectZosia: Answer;
  let zosiaRejected: Answer;
  let admitKuba: Answer;
  let kubaAdmitted: Answer;
  let kubaLobbyLetIn: Answer;
  let olaLobbyAfterAdmit: Answer;
  let kubaAsksOnceLetIn: Answer;
  let ulaAsksAsZosia: Answer;
  let zosiaAsksAgain: Answer;
  let zosiaWaitingAgain: Answer;
  let hostSeesAfterAskingAgain: Answer;
  // Round 1 goes on without Kuba.
  let kubaVotesInRound1: Answer;
  let olaVotesForKubaInRound1: Answer;
  let round1Revealed: Answer;
  // Round 2: Kuba votes.
  let kubaRound2View: Answer;
  let kubaVotesInRound2: Answer;
  let olaVotesForKubaInRound2: Answer;
  let hostRound2View: Answer;
  // The host's moves on no waiting request.
  let admitWithNoRequest: Answer;
  let rejectWithNoRequest: Answer;
  let admitKubaAgain: Answer;
  let guestAdmits: Answer;
  let guestRejects: Answer;
  let olaAdmits: Answer;
  let olaRejects: Answer;
  // The waiting screen's state for nobody.
  let neverAskedState: Answer;
  let malformedTokenState: Answer;
  let unknownRoomState: Answer;
  // The end.
  let endWithRequestsWaiting: Answer;
  let ulaAfterEnd: Answer;
  let hostAfterEnd: Answer;
  let askAfterEnd: Answer;
  let admitAfterEnd: Answer;

  beforeAll(async () => {
    room = await seedRoom(host);
    ola = await seedGuest(room.linkToken, "Ola");
    bartek = await seedGuest(room.linkToken, "Bartek");

    // Before the start the lobby takes anyone through join_room, without the host.
    elaAsksInLobby = await requestJoin(room.linkToken, "Ela", ela);
    await seedStartGame(host, room.id, Q1);
    elaAfterStart = await joinRequestState(room.id, ela);

    // Round 1 is voting: Kuba asks, then sends the form again under another nick.
    kubaAsks = await requestJoin(room.linkToken, "Kuba", kuba);
    kubaWaiting = await joinRequestState(room.id, kuba);
    kubaLobbyWhileWaiting = await roomLobby(anon, room.id, kuba);
    hostSeesKuba = await roomLobby(host.client, room.id);
    olaSeesKuba = await roomLobby(anon, room.id, ola.playerToken);
    kubaAsksAgain = await requestJoin(room.linkToken, "Jakub", kuba);
    kubaStillWaiting = await joinRequestState(room.id, kuba);

    // A player's nick and a waiting latecomer's nick, each from someone new.
    asksAsPlayer = await requestJoin(room.linkToken, "Bartek", newPlayerToken());
    asksAsWaiting = await requestJoin(room.linkToken, "Kuba", newPlayerToken());

    // Four more ask, one after another, so five wait; the sixth finds the list full.
    fourMoreAsk = [
      await requestJoin(room.linkToken, "Zosia", zosia),
      await requestJoin(room.linkToken, "Wiktor", wiktor),
      await requestJoin(room.linkToken, "Hania", hania),
      await requestJoin(room.linkToken, "Tomek", tomek),
    ];
    ulaAsksSixth = await requestJoin(room.linkToken, "Ula", ula);
    hostSeesFive = await roomLobby(host.client, room.id);

    // The host turns Zosia away and lets Kuba in, while round 1 is voting and nobody has voted yet.
    rejectZosia = await rejectLatecomer(host.client, room.id, "Zosia");
    zosiaRejected = await joinRequestState(room.id, zosia);
    admitKuba = await admitLatecomer(host.client, room.id, "Kuba");
    kubaAdmitted = await joinRequestState(room.id, kuba);
    kubaLobbyLetIn = await roomLobby(anon, room.id, kuba);
    olaLobbyAfterAdmit = await roomLobby(anon, room.id, ola.playerToken);
    // Kuba's form sent once more: he is a player now.
    kubaAsksOnceLetIn = await requestJoin(room.linkToken, "Jakub", kuba);

    // Zosia's nick is free once she is turned away: Ula, whose first try asked nothing, takes it. Zosia asks again with
    // the same token, under a new nick.
    ulaAsksAsZosia = await requestJoin(room.linkToken, "Zosia", ula);
    zosiaAsksAgain = await requestJoin(room.linkToken, "Zuzia", zosia);
    zosiaWaitingAgain = await joinRequestState(room.id, zosia);
    hostSeesAfterAskingAgain = await roomLobby(host.client, room.id);

    // Round 1 goes on with the three who were in the room when it opened. Kuba's vote and a vote for him come first,
    // so a vote of either that counted would show up in the reveal.
    kubaVotesInRound1 = await castVote(anon, room.id, "Ola", kuba, 1);
    olaVotesForKubaInRound1 = await castVote(anon, room.id, "Kuba", ola.playerToken, 1);
    await castVote(host.client, room.id, "Ola", undefined, 1);
    await castVote(anon, room.id, "Bartek", ola.playerToken, 1);
    // The third of three who may vote: the round reveals itself.
    await castVote(anon, room.id, "Ola", bartek.playerToken, 1);
    round1Revealed = await roomLobby(host.client, room.id);

    // Round 2: Q1 was played, so Q2 comes up, and Kuba is in the room when it opens.
    await nextRound(host.client, room.id, 1, [Q1, Q2]);
    kubaRound2View = await roomLobby(anon, room.id, kuba);
    kubaVotesInRound2 = await castVote(anon, room.id, "Ola", kuba, 2);
    olaVotesForKubaInRound2 = await castVote(anon, room.id, "Kuba", ola.playerToken, 2);
    hostRound2View = await roomLobby(host.client, room.id);

    // Nicks with no request waiting: Ula asks as Zosia, so no request is called Ula; Kuba is a player already (the
    // host's double click on "Wpuść").
    admitWithNoRequest = await admitLatecomer(host.client, room.id, "Ula");
    rejectWithNoRequest = await rejectLatecomer(host.client, room.id, "Ula");
    admitKubaAgain = await admitLatecomer(host.client, room.id, "Kuba");
    // Someone with no token and Ola, a guest with no co-host role, trying the leader's moves while Wiktor waits, so a
    // call that got through would have someone to act on.
    guestAdmits = await admitLatecomer(anon, room.id, "Wiktor");
    guestRejects = await rejectLatecomer(anon, room.id, "Wiktor");
    olaAdmits = await admitLatecomer(anon, room.id, "Wiktor", ola.playerToken);
    olaRejects = await rejectLatecomer(anon, room.id, "Wiktor", ola.playerToken);

    // While the game is in play: a token with nothing in this room, a malformed one, and a room that does not exist
    // (S-13: gone).
    neverAskedState = await joinRequestState(room.id, newPlayerToken());
    malformedTokenState = await joinRequestState(room.id, "not-a-player-token");
    unknownRoomState = await joinRequestState(crypto.randomUUID(), wiktor);

    // "Zakończ grę" with five requests waiting.
    endWithRequestsWaiting = await endGame(host.client, room.id);
    ulaAfterEnd = await joinRequestState(room.id, ula);
    hostAfterEnd = await roomLobby(host.client, room.id);
    askAfterEnd = await requestJoin(room.linkToken, "Igor", newPlayerToken());
    admitAfterEnd = await admitLatecomer(host.client, room.id, "Wiktor");
  });

  it("a request to the lobby gets room_open", () => {
    expect(elaAsksInLobby).toMatchObject({ error: null, data: { ok: false, reason: "room_open" } });
  });

  it("the refused request in the lobby left nothing: after the start Ela's state is exactly { state: none }", () => {
    expect(elaAfterStart).toEqual({ data: { state: "none" }, error: null });
  });

  // Positive control: an allowed request must work, or a wrong address would look like a refusal everywhere.
  it("positive control: Kuba asking while round 1 is voting gets ok: true", () => {
    expect(kubaAsks).toMatchObject({ error: null, data: { ok: true } });
  });

  // The waiting screen gets its own request and nothing else: no question, no players, no other request.
  it("Kuba's state while he waits is exactly { state: pending, nick: Kuba }", () => {
    expect(kubaWaiting).toEqual({ data: { state: "pending", nick: "Kuba" }, error: null });
  });

  it("while Kuba waits, room_lobby with his token gives null: not the question, not the players", () => {
    expect(kubaLobbyWhileWaiting).toEqual({ data: null, error: null });
  });

  // Only a leader decides who comes in, so only a leader sees who asks: Ola has no co-host role (S-07,
  // tests/db/cohost.test.ts).
  it("while round 1 is voting the host sees requests: [Kuba] and a guest sees requests: []", () => {
    expect(hostSeesKuba).toMatchObject({ error: null, data: { status: "playing", requests: ["Kuba"] } });
    expect(olaSeesKuba).toMatchObject({ error: null, data: { status: "playing", requests: [] } });
  });

  it("Kuba asking again while he waits, under another nick, gets ok: true and his request keeps the nick Kuba", () => {
    expect(kubaAsksAgain).toMatchObject({ error: null, data: { ok: true } });
    expect(kubaStillWaiting).toEqual({ data: { state: "pending", nick: "Kuba" }, error: null });
  });

  it.each([
    { whose: "a player's nick (Bartek)", answer: () => asksAsPlayer },
    { whose: "a waiting latecomer's nick (Kuba)", answer: () => asksAsWaiting },
  ])("a request with $whose gets nick_taken", ({ answer }) => {
    expect(answer()).toMatchObject({ error: null, data: { ok: false, reason: "nick_taken" } });
  });

  it("Zosia, Wiktor, Hania and Tomek asking after Kuba each get ok: true", () => {
    expect(fourMoreAsk).toMatchObject([
      { error: null, data: { ok: true } },
      { error: null, data: { ok: true } },
      { error: null, data: { ok: true } },
      { error: null, data: { ok: true } },
    ]);
  });

  it("a sixth request while five wait gets requests_full", () => {
    expect(ulaAsksSixth).toMatchObject({ error: null, data: { ok: false, reason: "requests_full" } });
  });

  it("the host sees the five waiting in the order they asked: Kuba, Zosia, Wiktor, Hania, Tomek", () => {
    expect(hostSeesFive).toMatchObject({
      error: null,
      data: { requests: ["Kuba", "Zosia", "Wiktor", "Hania", "Tomek"] },
    });
  });

  it("Odrzuć for Zosia gets ok: true and her state is exactly { state: rejected, nick: Zosia }", () => {
    expect(rejectZosia).toMatchObject({ error: null, data: { ok: true } });
    expect(zosiaRejected).toEqual({ data: { state: "rejected", nick: "Zosia" }, error: null });
  });

  it("Wpuść for Kuba while round 1 is voting gets ok: true and his state is exactly { state: admitted }", () => {
    expect(admitKuba).toMatchObject({ error: null, data: { ok: true } });
    expect(kubaAdmitted).toEqual({ data: { state: "admitted" }, error: null });
  });

  // FR-020: whoever is let in sees the current round at once, and votes from the next one.
  it("once let in, Kuba's token opens the room: he sees round 1 voting, with Host, Ola and Bartek eligible", () => {
    expect(kubaLobbyLetIn).toMatchObject({
      error: null,
      data: {
        status: "playing",
        role: "guest",
        me: "Kuba",
        round: { number: 1, question_id: Q1, phase: "voting", eligible: ["Host", "Ola", "Bartek"], me_voted: false },
      },
    });
  });

  it("after Wpuść Kuba is a player at the next seat, while round 1's eligible stays Host, Ola and Bartek", () => {
    expect(olaLobbyAfterAdmit).toMatchObject({
      error: null,
      data: {
        players: [
          { nick: "Host", host: true },
          { nick: "Ola", host: false },
          { nick: "Bartek", host: false },
          { nick: "Kuba", host: false },
        ],
        round: { number: 1, phase: "voting", eligible: ["Host", "Ola", "Bartek"], voted: [] },
      },
    });
  });

  it("Kuba asking once more after he was let in gets ok: true", () => {
    expect(kubaAsksOnceLetIn).toMatchObject({ error: null, data: { ok: true } });
  });

  it("Zosia's nick is free once she is turned away: Ula asking as Zosia gets ok: true", () => {
    expect(ulaAsksAsZosia).toMatchObject({ error: null, data: { ok: true } });
  });

  it("Zosia asking again with her token, as Zuzia, gets ok: true and her state is pending with the nick Zuzia", () => {
    expect(zosiaAsksAgain).toMatchObject({ error: null, data: { ok: true } });
    expect(zosiaWaitingAgain).toEqual({ data: { state: "pending", nick: "Zuzia" }, error: null });
  });

  // Kuba left the list when he was let in, and his forms sent again added nothing; the rejected request asking again
  // joins the end of the list, as a request made now.
  it("the host then sees Wiktor, Hania, Tomek, Zosia (Ula) and Zuzia waiting", () => {
    expect(hostSeesAfterAskingAgain).toMatchObject({
      error: null,
      data: { requests: ["Wiktor", "Hania", "Tomek", "Zosia", "Zuzia"] },
    });
  });

  // Let in mid-round: not among those who vote in round 1, and nobody votes for him in it.
  it("Kuba's vote in round 1 gets no_round", () => {
    expect(kubaVotesInRound1).toMatchObject({ error: null, data: { ok: false, reason: "no_round" } });
  });

  it("a vote for Kuba in round 1 gets unknown_target", () => {
    expect(olaVotesForKubaInRound1).toMatchObject({ error: null, data: { ok: false, reason: "unknown_target" } });
  });

  // Host for Ola, Ola for Bartek, Bartek for Ola: the third vote of three reveals the round, with no result for Kuba.
  it("after the votes of Host, Ola and Bartek round 1 reveals itself: Ola 2, Bartek 1, Host 0, no row for Kuba", () => {
    expect(round1Revealed).toMatchObject({
      error: null,
      data: {
        round: {
          number: 1,
          question_id: Q1,
          phase: "revealed",
          results: [
            { nick: "Host", votes: 0 },
            { nick: "Ola", votes: 2 },
            { nick: "Bartek", votes: 1 },
          ],
          abstained: 0,
          ballots: 3,
        },
      },
    });
  });

  it("in round 2 Kuba sees Q2 voting with Host, Ola, Bartek and Kuba eligible", () => {
    expect(kubaRound2View).toMatchObject({
      error: null,
      data: {
        round: {
          number: 2,
          question_id: Q2,
          phase: "voting",
          eligible: ["Host", "Ola", "Bartek", "Kuba"],
          me_voted: false,
        },
      },
    });
  });

  it("Kuba's vote in round 2 gets ok: true", () => {
    expect(kubaVotesInRound2).toMatchObject({ error: null, data: { ok: true } });
  });

  it("a vote for Kuba in round 2 gets ok: true", () => {
    expect(olaVotesForKubaInRound2).toMatchObject({ error: null, data: { ok: true } });
  });

  // A request waits for the host's answer, through the reveal and the next question.
  it("in round 2 the host sees Ola and Kuba voted and the same five requests waiting", () => {
    expect(hostRound2View).toMatchObject({
      error: null,
      data: {
        round: { number: 2, phase: "voting", voted: ["Ola", "Kuba"] },
        requests: ["Wiktor", "Hania", "Tomek", "Zosia", "Zuzia"],
      },
    });
  });

  it.each([
    { move: "Wpuść for a nick no request has (Ula)", answer: () => admitWithNoRequest },
    { move: "Odrzuć for a nick no request has (Ula)", answer: () => rejectWithNoRequest },
    { move: "Wpuść for Kuba, let in already", answer: () => admitKubaAgain },
  ])("$move gets request_unknown", ({ answer }) => {
    expect(answer()).toMatchObject({ error: null, data: { ok: false, reason: "request_unknown" } });
  });

  // Only a leader lets in and turns away: the host, or a co-host by its token (S-07, tests/db/cohost.test.ts). Granted to
  // anon since S-07, so the refusal is the function's own answer: no token learns nothing about the room, and a guest
  // of the room without the role gets not_leader.
  it.each([
    { fn: "admit_latecomer", answer: () => guestAdmits },
    { fn: "reject_latecomer", answer: () => guestRejects },
  ])("a guest with no token calling $fn gets room_unknown", ({ answer }) => {
    expect(answer()).toMatchObject({ error: null, data: { ok: false, reason: "room_unknown" } });
  });

  it.each([
    { fn: "admit_latecomer", answer: () => olaAdmits },
    { fn: "reject_latecomer", answer: () => olaRejects },
  ])("Ola, a guest with no co-host role, calling $fn gets not_leader", ({ answer }) => {
    expect(answer()).toMatchObject({ error: null, data: { ok: false, reason: "not_leader" } });
  });

  // The waiting screen gets no state to tell, and no error.
  it.each([
    { what: "a token that never asked", answer: () => neverAskedState },
    { what: "a malformed token", answer: () => malformedTokenState },
  ])("while the game is in play, join_request_state for $what is exactly { state: none }", ({ answer }) => {
    expect(answer()).toEqual({ data: { state: "none" }, error: null });
  });

  // S-13, decision 5 of context/changes/host-game-history/plan.md: a room that does not exist is what a guest of a game
  // its host deleted asks about, so the page tells them the game is gone, not that they were removed. The deletion
  // itself is tests/db/game-history.test.ts's.
  it("join_request_state with Wiktor's token for a room that does not exist is exactly { state: gone }", () => {
    expect(unknownRoomState).toEqual({ data: { state: "gone" }, error: null });
  });

  it("end_game with five requests waiting gets ok: true", () => {
    expect(endWithRequestsWaiting).toMatchObject({ error: null, data: { ok: true } });
  });

  // A request waits only until the room closes: the waiting screen says the game is over, and the host's list is empty.
  it("after the end Ula's request is closed and the host sees no requests", () => {
    expect(ulaAfterEnd).toEqual({ data: { state: "closed" }, error: null });
    expect(hostAfterEnd).toMatchObject({ error: null, data: { status: "closed", requests: [] } });
  });

  it("a request to the closed room gets room_closed", () => {
    expect(askAfterEnd).toMatchObject({ error: null, data: { ok: false, reason: "room_closed" } });
  });

  it("Wpuść after the end gets request_unknown", () => {
    expect(admitAfterEnd).toMatchObject({ error: null, data: { ok: false, reason: "request_unknown" } });
  });
});

// F1 of context/archive/2026-10-22-latecomer-admission/follow-ups/review-fixes.md: request_join's first refusal, and
// its limit when the requests come at once. The limit above is checked one request after another; here six
// latecomers ask at the same moment, so only the lock on the room's row keeps the sixth out (at most 5 wait, decision
// of context/archive/2026-10-22-latecomer-admission/plan.md).
describe("a second game: a malformed token, and six latecomers asking at once", () => {
  const SIX = ["Ala", "Bea", "Cyla", "Dora", "Ewka", "Fela"];
  let room: OwnRoom;
  let malformedToken: Answer;
  let sixAtOnce: Answer[];
  let hostSeesWaiting: Answer;

  beforeAll(async () => {
    room = await seedRoom(host, { confirmClose: true });
    await seedGuest(room.linkToken, "Ola");
    await seedGuest(room.linkToken, "Bartek");
    await seedStartGame(host, room.id, Q1);

    // Not our client: the Worker sends the cookie's 32-byte token or a fresh one.
    malformedToken = await requestJoin(room.linkToken, "Igor", "not-a-player-token");

    // Each with a token and a nick of its own, so the limit is the only thing the sixth can be refused for.
    sixAtOnce = await Promise.all(SIX.map((nick) => requestJoin(room.linkToken, nick, newPlayerToken())));
    hostSeesWaiting = await roomLobby(host.client, room.id);
  });

  it("a request with a malformed player token is refused with 22023", () => {
    expect(malformedToken).toMatchObject({ data: null, error: { code: "22023", details: null } });
  });

  // Which of the six comes last is the race's; how many get in is not.
  it("six requests at once get exactly 5 × ok and 1 × requests_full", () => {
    const outcomes = sixAtOnce.map((answer) => {
      if (answer.error) return `error ${answer.error.code}`;
      const data = answer.data;
      if (isRecord(data) && data.ok === true) return "ok";
      return isRecord(data) && typeof data.reason === "string" ? data.reason : "an unexpected shape";
    });

    expect(outcomes.sort()).toEqual(["ok", "ok", "ok", "ok", "ok", "requests_full"]);
  });

  it("after them the host sees exactly 5 of the six waiting", () => {
    const data = hostSeesWaiting.data;
    const requests: unknown = isRecord(data) ? data.requests : null;
    const waiting = Array.isArray(requests) ? (requests as unknown[]) : [];

    expect(hostSeesWaiting.error).toBeNull();
    expect(waiting).toHaveLength(5);
    expect(waiting.every((nick) => typeof nick === "string" && SIX.includes(nick))).toBe(true);
  });
});
