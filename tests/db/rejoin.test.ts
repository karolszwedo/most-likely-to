import { beforeAll, describe, expect, it } from "vitest";
import { anonClient, newHost, newLinkToken, newPlayerToken, type Host } from "./support/clients";
import { isRecord, seedGuest, seedRoom, type OwnRoom, type SeededGuest } from "./support/rooms";
import {
  EVENING_QUESTION_IDS,
  LOBBY_KEYS,
  VOTING_ROUND_KEYS,
  admitLatecomer,
  castVote,
  endGame,
  joinRequestState,
  keysOf,
  rejectLatecomer,
  requestJoin,
  requestReturn,
  roomLobby,
  roundOf,
  seedStartGame,
  seedVote,
  setCohost,
  setPlayerColor,
  type Answer,
} from "./support/rounds";

// Coming back without the cookie (S-04) through the roles' own doors: RPC with the publishable key, as the room's
// guests, as a guest on a new browser (anon, with a fresh player token, as the Worker's cookie there will keep it) and
// as the signed-in host, past the Worker. Oracle: PRD US-01 and FR-011 (a player who lost the connection comes back to
// their nick in the current round and sees their vote cast; nobody else takes the nick), Karol's decision D2 of
// context/changes/rejoin-after-refresh/research.md (a request to come back, approved by a leader, who sees the people)
// and the plan's Faza 3 contract (context/changes/rejoin-after-refresh/plan.md): nothing moves before "Wpuść"; a
// player's token never takes another place; once let back the place keeps its colour, results and me_voted (a second
// vote is already_voted); the old token opens nothing and its state says moved; the old token may then ask as a
// latecomer under a new nick, whose "Wpuść" leaves the place alone; the host's nick is refused; in the lobby and while
// the game is in play; a co-host lets back a guest, and the host alone a co-host (decision 2 of
// context/changes/remove-player-new-link/research.md, as in remove_player). Every nick, colour, list and count expected
// here is written out by hand from the scenario, never computed.
//
// request_return, room_lobby's returning, join_request_state's moved and returning, and admit_latecomer's and
// reject_latecomer's requests to come back come from supabase/migrations/*_rejoin_after_refresh.sql. Without it
// PostgREST answers request_return with PGRST202 (no such function), and every test here is red on its own probe or on
// the state those calls should have made.
//
// One sign-up per run, in beforeAll; one room, played in order: the lobby, then the game, then its end.

const anon = anonClient();
const [Q1] = EVENING_QUESTION_IDS;

// A precondition, not the thing under test: throws on anything but { ok: true }, so beforeAll fails red. Only the
// function's own refusal code goes into the message, never its arguments (nicks, tokens).
function seed(answer: Answer, step: string): void {
  if (answer.error) throw new Error(`${step} failed: ${answer.error.code}`);
  const data = answer.data;
  if (!isRecord(data) || data.ok !== true) {
    const reason = isRecord(data) && typeof data.reason === "string" ? data.reason : "an unexpected shape";
    throw new Error(`${step} was refused: ${reason}`);
  }
}

let host: Host;

beforeAll(async () => {
  host = await newHost();
});

describe("Zosia, Ola and Bartek come back on new browsers, in the lobby and while the game is in play", () => {
  let room: OwnRoom;
  let ola: SeededGuest;
  let bartek: SeededGuest;
  let kuba: SeededGuest;
  let zosia: SeededGuest;
  // The tokens of the new browsers, as the Worker's cookie there keeps them.
  const zosiaNew = newPlayerToken();
  const olaNew = newPlayerToken();
  const bartekNew = newPlayerToken();
  // The lobby: refusals and a player's own token.
  let hostNick: Answer;
  let unknownNick: Answer;
  let longNick: Answer;
  let malformedToken: Answer;
  let unknownLink: Answer;
  let malformedLink: Answer;
  let bartekAsksForOla: Answer;
  let bartekStateAfter: Answer;
  let olaAfterBartekAsked: Answer;
  let bartekAfterHeAsked: Answer;
  // The lobby: Zosia's request, turned away, then let back.
  let zosiaAsks: Answer;
  let zosiaAsksTwice: Answer;
  let someoneElseAsksForZosia: Answer;
  let zosiaNewBeforeWpusc: Answer;
  let zosiaNewWaiting: Answer;
  let hostSeesZosia: Answer;
  let olaSeesZosia: Answer;
  let olaAdmitsZosia: Answer;
  let noTokenAdmitsZosia: Answer;
  let rejectZosiaInLobby: Answer;
  let zosiaNewRejected: Answer;
  let zosiaOldWhileRejected: Answer;
  let zosiaAsksAgain: Answer;
  let zosiaNewWaitingAgain: Answer;
  let admitZosiaInLobby: Answer;
  let zosiaNewAdmitted: Answer;
  let zosiaNewLobby: Answer;
  let zosiaOldLobby: Answer;
  let zosiaOldState: Answer;
  let hostAfterZosiaBack: Answer;
  let admitZosiaAgain: Answer;
  // The game: Ola, who voted in round 1, comes back through Kuba, a co-host.
  let olaAsks: Answer;
  let kubaSeesOla: Answer;
  let kubaAdmitsOla: Answer;
  let olaNewView: Answer;
  let olaNewVotesAgain: Answer;
  let olaOldLobby: Answer;
  let olaOldState: Answer;
  let olaOldVotes: Answer;
  // The game: Bartek, a co-host, comes back only through the host.
  let bartekAsks: Answer;
  let kubaAdmitsBartek: Answer;
  let bartekNewStillWaiting: Answer;
  let bartekOldStillBartek: Answer;
  let hostAdmitsBartek: Answer;
  let bartekNewView: Answer;
  // The game: Ola's old token asks as a latecomer.
  let olaOldAsksAsOlka: Answer;
  let olaOldWaitingAsOlka: Answer;
  let hostSeesOlka: Answer;
  let admitOlka: Answer;
  let olaOldAsOlka: Answer;
  let olaNewStillOla: Answer;
  let hostSeesPlayers: Answer;
  // Round 1 goes on and reveals itself.
  let bartekNewVotes: Answer;
  let kubaVotes: Answer;
  let zosiaNewAbstains: Answer;
  let round1Revealed: Answer;
  // The limit and the end.
  let returnWithFiveWaiting: Answer;
  let zosiaOldAfterEnd: Answer;
  let olaNewAfterEnd: Answer;
  let returnAfterEnd: Answer;

  beforeAll(async () => {
    room = await seedRoom(host);
    ola = await seedGuest(room.linkToken, "Ola");
    bartek = await seedGuest(room.linkToken, "Bartek");
    kuba = await seedGuest(room.linkToken, "Kuba");
    zosia = await seedGuest(room.linkToken, "Zosia");
    // Ola's own colour, not the one of her seat: a place rebuilt for her would get the lowest free colour instead.
    seed(await setPlayerColor(anon, room.id, 7, ola.playerToken), "Ola's colour 7");

    // The lobby. The host's nick, a nick nobody has, one over the nick rule's cap; a malformed token and links.
    hostNick = await requestReturn(room.linkToken, "Host", newPlayerToken());
    unknownNick = await requestReturn(room.linkToken, "Nikt", newPlayerToken());
    longNick = await requestReturn(room.linkToken, "Zosia".repeat(21), newPlayerToken());
    malformedToken = await requestReturn(room.linkToken, "Zosia", "not-a-player-token");
    unknownLink = await requestReturn(newLinkToken(), "Zosia", newPlayerToken());
    malformedLink = await requestReturn("not-a-link", "Zosia", newPlayerToken());
    // Bartek's own token asking for Ola's place: a player's token never takes another place.
    bartekAsksForOla = await requestReturn(room.linkToken, "Ola", bartek.playerToken);
    bartekStateAfter = await joinRequestState(room.id, bartek.playerToken);
    olaAfterBartekAsked = await roomLobby(anon, room.id, ola.playerToken);
    bartekAfterHeAsked = await roomLobby(anon, room.id, bartek.playerToken);

    // Zosia's new browser asks to come back, by her nick with a variation selector (the same nick, as compared), then
    // sends the form again; someone else asks for her nick meanwhile.
    zosiaAsks = await requestReturn(room.linkToken, "Zosia\u{FE0F}", zosiaNew);
    zosiaAsksTwice = await requestReturn(room.linkToken, "Zosia", zosiaNew);
    someoneElseAsksForZosia = await requestReturn(room.linkToken, "Zosia", newPlayerToken());
    zosiaNewBeforeWpusc = await roomLobby(anon, room.id, zosiaNew);
    zosiaNewWaiting = await joinRequestState(room.id, zosiaNew);
    hostSeesZosia = await roomLobby(host.client, room.id);
    olaSeesZosia = await roomLobby(anon, room.id, ola.playerToken);
    // Ola has no co-host role; someone with no token is nobody.
    olaAdmitsZosia = await admitLatecomer(anon, room.id, "Zosia", ola.playerToken);
    noTokenAdmitsZosia = await admitLatecomer(anon, room.id, "Zosia");
    // The host turns her away in the lobby, she asks again, and the host lets her back.
    rejectZosiaInLobby = await rejectLatecomer(host.client, room.id, "Zosia");
    zosiaNewRejected = await joinRequestState(room.id, zosiaNew);
    zosiaOldWhileRejected = await roomLobby(anon, room.id, zosia.playerToken);
    zosiaAsksAgain = await requestReturn(room.linkToken, "Zosia", zosiaNew);
    zosiaNewWaitingAgain = await joinRequestState(room.id, zosiaNew);
    admitZosiaInLobby = await admitLatecomer(host.client, room.id, "Zosia");
    zosiaNewAdmitted = await joinRequestState(room.id, zosiaNew);
    zosiaNewLobby = await roomLobby(anon, room.id, zosiaNew);
    zosiaOldLobby = await roomLobby(anon, room.id, zosia.playerToken);
    zosiaOldState = await joinRequestState(room.id, zosia.playerToken);
    hostAfterZosiaBack = await roomLobby(host.client, room.id);
    // The host's double click.
    admitZosiaAgain = await admitLatecomer(host.client, room.id, "Zosia");

    // The game: round 1 opens for Host, Ola, Bartek, Kuba and Zosia; Kuba and Bartek lead with the host.
    await seedStartGame(host, room.id, Q1);
    seed(await setCohost(host.client, room.id, "Kuba", true), "the co-host role for Kuba");
    seed(await setCohost(host.client, room.id, "Bartek", true), "the co-host role for Bartek");
    // Ola for Bartek and the host for Ola, before Ola loses her cookie.
    await seedVote(anon, room.id, "Bartek", ola.playerToken, 1);
    await seedVote(host.client, room.id, "Ola", undefined, 1);

    // Ola comes back on a new browser, and Kuba, a co-host, lets her back.
    olaAsks = await requestReturn(room.linkToken, "Ola", olaNew);
    kubaSeesOla = await roomLobby(anon, room.id, kuba.playerToken);
    kubaAdmitsOla = await admitLatecomer(anon, room.id, "Ola", kuba.playerToken);
    olaNewView = await roomLobby(anon, room.id, olaNew);
    olaNewVotesAgain = await castVote(anon, room.id, "Kuba", olaNew, 1);
    olaOldLobby = await roomLobby(anon, room.id, ola.playerToken);
    olaOldState = await joinRequestState(room.id, ola.playerToken);
    olaOldVotes = await castVote(anon, room.id, "Kuba", ola.playerToken, 1);

    // Bartek, a co-host, comes back: Kuba may not let him back, the host may.
    bartekAsks = await requestReturn(room.linkToken, "Bartek", bartekNew);
    kubaAdmitsBartek = await admitLatecomer(anon, room.id, "Bartek", kuba.playerToken);
    bartekNewStillWaiting = await joinRequestState(room.id, bartekNew);
    bartekOldStillBartek = await roomLobby(anon, room.id, bartek.playerToken);
    hostAdmitsBartek = await admitLatecomer(host.client, room.id, "Bartek");
    bartekNewView = await roomLobby(anon, room.id, bartekNew);

    // Ola's old browser asks to join as a latecomer, as Olka, and the host lets her in.
    olaOldAsksAsOlka = await requestJoin(room.linkToken, "Olka", ola.playerToken);
    olaOldWaitingAsOlka = await joinRequestState(room.id, ola.playerToken);
    hostSeesOlka = await roomLobby(host.client, room.id);
    admitOlka = await admitLatecomer(host.client, room.id, "Olka");
    olaOldAsOlka = await roomLobby(anon, room.id, ola.playerToken);
    olaNewStillOla = await roomLobby(anon, room.id, olaNew);
    hostSeesPlayers = await roomLobby(host.client, room.id);

    // The rest of round 1: Bartek (new browser) for Ola, Kuba for Ola, Zosia (new browser) abstains. The fifth vote of
    // five reveals the round; Olka, let in mid-round, is not among those who vote in it.
    bartekNewVotes = await castVote(anon, room.id, "Ola", bartekNew, 1);
    kubaVotes = await castVote(anon, room.id, "Ola", kuba.playerToken, 1);
    zosiaNewAbstains = await castVote(anon, room.id, null, zosiaNew, 1);
    round1Revealed = await roomLobby(anon, room.id, olaNew);

    // Five latecomers wait; a request to come back finds the list full.
    for (const nick of ["Ala", "Bea", "Cyla", "Dora", "Ewka"]) {
      seed(await requestJoin(room.linkToken, nick, newPlayerToken()), `${nick}'s request to join`);
    }
    returnWithFiveWaiting = await requestReturn(room.linkToken, "Kuba", newPlayerToken());

    // "Zakończ grę".
    seed(await endGame(host.client, room.id), "end_game");
    zosiaOldAfterEnd = await joinRequestState(room.id, zosia.playerToken);
    olaNewAfterEnd = await roomLobby(anon, room.id, olaNew);
    returnAfterEnd = await requestReturn(room.linkToken, "Ola", newPlayerToken());
  });

  // The lobby -------------------------------------------------------------------------------------------------------

  // Positive control: an allowed request must work, or a wrong address would look like a refusal everywhere.
  it("positive control: Zosia's new browser asking to come back in the lobby gets ok: true", () => {
    expect(zosiaAsks).toMatchObject({ error: null, data: { ok: true } });
  });

  it("asking to come back to the host's nick gets host_returns_by_login", () => {
    expect(hostNick).toMatchObject({ error: null, data: { ok: false, reason: "host_returns_by_login" } });
  });

  it.each([
    { what: "a nick no player has", answer: () => unknownNick },
    { what: "a nick over the nick rule's cap", answer: () => longNick },
  ])("asking to come back to $what gets player_unknown", ({ answer }) => {
    expect(answer()).toMatchObject({ error: null, data: { ok: false, reason: "player_unknown" } });
  });

  it("a request to come back with a malformed player token is refused with 22023", () => {
    expect(malformedToken).toMatchObject({ data: null, error: { code: "22023", details: null } });
  });

  it.each([
    { what: "a link code of no room", answer: () => unknownLink },
    { what: "a malformed link code", answer: () => malformedLink },
  ])("asking to come back through $what gets room_unknown", ({ answer }) => {
    expect(answer()).toMatchObject({ error: null, data: { ok: false, reason: "room_unknown" } });
  });

  // A player's token never takes another place: the screen moves on to the room, and nothing changes.
  it("Bartek's own token asking for Ola's place gets ok: true, and Bartek is still a player: { state: admitted }", () => {
    expect(bartekAsksForOla).toMatchObject({ error: null, data: { ok: true } });
    expect(bartekStateAfter).toEqual({ data: { state: "admitted" }, error: null });
  });

  it("after Bartek asked for her place, Ola's token still opens Ola and Bartek's still opens Bartek", () => {
    expect(olaAfterBartekAsked).toMatchObject({ error: null, data: { me: "Ola" } });
    expect(bartekAfterHeAsked).toMatchObject({ error: null, data: { me: "Bartek" } });
  });

  it("Zosia's new browser sending the form again gets ok: true", () => {
    expect(zosiaAsksTwice).toMatchObject({ error: null, data: { ok: true } });
  });

  it("someone else asking to come back to Zosia's place while she waits gets nick_taken", () => {
    expect(someoneElseAsksForZosia).toMatchObject({ error: null, data: { ok: false, reason: "nick_taken" } });
  });

  // Nothing moves before a leader's "Wpuść".
  it("while Zosia's new browser waits, room_lobby with its token gives null", () => {
    expect(zosiaNewBeforeWpusc).toEqual({ data: null, error: null });
  });

  it("Zosia's new browser's state is exactly { state: pending, nick: Zosia, returning: true }", () => {
    expect(zosiaNewWaiting).toEqual({ data: { state: "pending", nick: "Zosia", returning: true }, error: null });
  });

  it("in the lobby the host sees requests: [Zosia] and returning: [Zosia]; Ola, a guest, sees [] and []", () => {
    expect(hostSeesZosia).toMatchObject({
      error: null,
      data: { status: "lobby", requests: ["Zosia"], returning: ["Zosia"] },
    });
    expect(olaSeesZosia).toMatchObject({ error: null, data: { status: "lobby", requests: [], returning: [] } });
  });

  it("the host's state in the lobby has exactly the lobby's keys, returning included", () => {
    expect(keysOf(hostSeesZosia.data)).toEqual(LOBBY_KEYS);
  });

  it("Ola, a guest with no co-host role, letting Zosia back gets not_leader", () => {
    expect(olaAdmitsZosia).toMatchObject({ error: null, data: { ok: false, reason: "not_leader" } });
  });

  it("someone with no token letting Zosia back gets room_unknown", () => {
    expect(noTokenAdmitsZosia).toMatchObject({ error: null, data: { ok: false, reason: "room_unknown" } });
  });

  it("Odrzuć for Zosia in the lobby gets ok: true and her state is exactly rejected, Zosia, returning", () => {
    expect(rejectZosiaInLobby).toMatchObject({ error: null, data: { ok: true } });
    expect(zosiaNewRejected).toEqual({ data: { state: "rejected", nick: "Zosia", returning: true }, error: null });
  });

  it("while her request is turned away, Zosia's old token still opens her place", () => {
    expect(zosiaOldWhileRejected).toMatchObject({ error: null, data: { me: "Zosia" } });
  });

  it("Zosia asking again after Odrzuć gets ok: true and waits again: pending, Zosia, returning", () => {
    expect(zosiaAsksAgain).toMatchObject({ error: null, data: { ok: true } });
    expect(zosiaNewWaitingAgain).toEqual({ data: { state: "pending", nick: "Zosia", returning: true }, error: null });
  });

  it("Wpuść for Zosia in the lobby gets ok: true and her new browser's state is exactly { state: admitted }", () => {
    expect(admitZosiaInLobby).toMatchObject({ error: null, data: { ok: true } });
    expect(zosiaNewAdmitted).toEqual({ data: { state: "admitted" }, error: null });
  });

  it("once let back, Zosia's new browser opens the lobby as Zosia, a guest", () => {
    expect(zosiaNewLobby).toMatchObject({ error: null, data: { status: "lobby", role: "guest", me: "Zosia" } });
  });

  it("Zosia's old token then opens nothing: room_lobby gives null", () => {
    expect(zosiaOldLobby).toEqual({ data: null, error: null });
  });

  it("Zosia's old token's state is exactly { state: moved, nick: Zosia }", () => {
    expect(zosiaOldState).toEqual({ data: { state: "moved", nick: "Zosia" }, error: null });
  });

  // The place moved, it was not made again: the same five players in the same seats with the same colours.
  it("after Zosia came back the host sees the same five players with their colours, and no request", () => {
    expect(hostAfterZosiaBack).toMatchObject({
      error: null,
      data: {
        players: [
          { nick: "Host", host: true, cohost: false, color: 0 },
          { nick: "Ola", host: false, cohost: false, color: 7 },
          { nick: "Bartek", host: false, cohost: false, color: 2 },
          { nick: "Kuba", host: false, cohost: false, color: 3 },
          { nick: "Zosia", host: false, cohost: false, color: 4 },
        ],
        requests: [],
        returning: [],
      },
    });
  });

  it("Wpuść for Zosia once more gets request_unknown", () => {
    expect(admitZosiaAgain).toMatchObject({ error: null, data: { ok: false, reason: "request_unknown" } });
  });

  // While the game is in play ---------------------------------------------------------------------------------------

  it("Ola's new browser asking to come back while round 1 is voting gets ok: true", () => {
    expect(olaAsks).toMatchObject({ error: null, data: { ok: true } });
  });

  it("Kuba, a co-host, sees requests: [Ola] and returning: [Ola]", () => {
    expect(kubaSeesOla).toMatchObject({ error: null, data: { requests: ["Ola"], returning: ["Ola"] } });
  });

  it("Wpuść for Ola by Kuba, a co-host, gets ok: true", () => {
    expect(kubaAdmitsOla).toMatchObject({ error: null, data: { ok: true } });
  });

  // US-01: back on her nick in the current round, with her vote cast; her colour stays hers.
  it("Ola's new browser opens round 1 as Ola, with me_voted: true, Host and Ola voted, and Ola still colour 7", () => {
    expect(olaNewView).toMatchObject({
      error: null,
      data: {
        status: "playing",
        role: "guest",
        me: "Ola",
        requests: [],
        returning: [],
        players: [
          { nick: "Host", color: 0 },
          { nick: "Ola", color: 7 },
          { nick: "Bartek", color: 2, cohost: true },
          { nick: "Kuba", color: 3, cohost: true },
          { nick: "Zosia", color: 4 },
        ],
        round: {
          number: 1,
          question_id: Q1,
          phase: "voting",
          eligible: ["Host", "Ola", "Bartek", "Kuba", "Zosia"],
          voted: ["Host", "Ola"],
          me_voted: true,
        },
      },
    });
  });

  // Coming back moves a token, not a vote: the state has exactly the keys it had, with nothing about how Ola voted.
  it("Ola's new browser's state has exactly the lobby's keys and its round exactly the voting round's keys", () => {
    expect(keysOf(olaNewView.data)).toEqual(LOBBY_KEYS);
    expect(keysOf(roundOf(olaNewView))).toEqual(VOTING_ROUND_KEYS);
  });

  it("Ola's new browser voting in round 1 gets already_voted", () => {
    expect(olaNewVotesAgain).toMatchObject({ error: null, data: { ok: false, reason: "already_voted" } });
  });

  it("Ola's old token then opens nothing, and its state is exactly { state: moved, nick: Ola }", () => {
    expect(olaOldLobby).toEqual({ data: null, error: null });
    expect(olaOldState).toEqual({ data: { state: "moved", nick: "Ola" }, error: null });
  });

  it("a vote with Ola's old token gets room_unknown", () => {
    expect(olaOldVotes).toMatchObject({ error: null, data: { ok: false, reason: "room_unknown" } });
  });

  it("Bartek's new browser asking to come back to his place, a co-host's, gets ok: true", () => {
    expect(bartekAsks).toMatchObject({ error: null, data: { ok: true } });
  });

  // Only the host decides who holds a co-host's place.
  it("Wpuść for Bartek, a co-host, by Kuba, a co-host, gets cohost_protected and changes nothing", () => {
    expect(kubaAdmitsBartek).toMatchObject({ error: null, data: { ok: false, reason: "cohost_protected" } });
    expect(bartekNewStillWaiting).toEqual({ data: { state: "pending", nick: "Bartek", returning: true }, error: null });
    expect(bartekOldStillBartek).toMatchObject({ error: null, data: { me: "Bartek" } });
  });

  it("Wpuść for Bartek by the host gets ok: true, and his new browser opens his place, co-host role included", () => {
    expect(hostAdmitsBartek).toMatchObject({ error: null, data: { ok: true } });
    expect(bartekNewView).toMatchObject({
      error: null,
      data: {
        me: "Bartek",
        players: [
          { nick: "Host" },
          { nick: "Ola" },
          { nick: "Bartek", cohost: true },
          { nick: "Kuba", cohost: true },
          { nick: "Zosia" },
        ],
      },
    });
  });

  // The trace never turns back into a request to come back: the old token asks as a latecomer, under a new nick.
  it("Ola's old token asking to join as Olka gets ok: true, and its state is exactly pending, Olka", () => {
    expect(olaOldAsksAsOlka).toMatchObject({ error: null, data: { ok: true } });
    expect(olaOldWaitingAsOlka).toEqual({ data: { state: "pending", nick: "Olka" }, error: null });
  });

  it("the host sees requests: [Olka] and returning: []", () => {
    expect(hostSeesOlka).toMatchObject({ error: null, data: { requests: ["Olka"], returning: [] } });
  });

  it("Wpuść for Olka gets ok: true: the old token opens Olka, and Ola's new browser still opens Ola", () => {
    expect(admitOlka).toMatchObject({ error: null, data: { ok: true } });
    expect(olaOldAsOlka).toMatchObject({ error: null, data: { me: "Olka" } });
    expect(olaNewStillOla).toMatchObject({ error: null, data: { me: "Ola" } });
  });

  // Olka is a new player at the next seat with the lowest free colour (1, Ola's colour of her seat, free since she took
  // 7); Ola's place is where it was.
  it("the host then sees Host, Ola, Bartek, Kuba, Zosia and Olka, with Olka at the next seat in colour 1", () => {
    expect(hostSeesPlayers).toMatchObject({
      error: null,
      data: {
        players: [
          { nick: "Host", color: 0 },
          { nick: "Ola", color: 7 },
          { nick: "Bartek", color: 2 },
          { nick: "Kuba", color: 3 },
          { nick: "Zosia", color: 4 },
          { nick: "Olka", color: 1 },
        ],
      },
    });
  });

  it.each([
    { who: "Bartek's new browser", answer: () => bartekNewVotes },
    { who: "Kuba", answer: () => kubaVotes },
    { who: "Zosia's new browser, abstaining", answer: () => zosiaNewAbstains },
  ])("$who voting in round 1 gets ok: true", ({ answer }) => {
    expect(answer()).toMatchObject({ error: null, data: { ok: true } });
  });

  // Ola's vote from her old browser counts (Bartek 1), and the votes for her place count to it (Ola 3).
  it("round 1 reveals itself: Host 0, Ola 3, Bartek 1, Kuba 0, Zosia 0, 1 abstained of 5 ballots, no row for Olka", () => {
    expect(round1Revealed).toMatchObject({
      error: null,
      data: {
        round: {
          number: 1,
          phase: "revealed",
          results: [
            { nick: "Host", votes: 0 },
            { nick: "Ola", votes: 3 },
            { nick: "Bartek", votes: 1 },
            { nick: "Kuba", votes: 0 },
            { nick: "Zosia", votes: 0 },
          ],
          abstained: 1,
          ballots: 5,
        },
      },
    });
  });

  it("a request to come back while five latecomers wait gets requests_full", () => {
    expect(returnWithFiveWaiting).toMatchObject({ error: null, data: { ok: false, reason: "requests_full" } });
  });

  // The end ---------------------------------------------------------------------------------------------------------

  // The room's requests go when it closes, the traces included.
  it("after the end, Zosia's old token's state is exactly { state: closed }", () => {
    expect(zosiaOldAfterEnd).toEqual({ data: { state: "closed" }, error: null });
  });

  it("after the end, Ola's new browser sees the game's sums with her 3 votes", () => {
    expect(olaNewAfterEnd).toMatchObject({
      error: null,
      data: {
        status: "closed",
        me: "Ola",
        game_totals: {
          revealed: 1,
          totals: [
            { nick: "Host", votes: 0 },
            { nick: "Ola", votes: 3 },
            { nick: "Bartek", votes: 1 },
            { nick: "Kuba", votes: 0 },
            { nick: "Zosia", votes: 0 },
          ],
        },
      },
    });
  });

  it("a request to come back to the closed room gets room_closed", () => {
    expect(returnAfterEnd).toMatchObject({ error: null, data: { ok: false, reason: "room_closed" } });
  });
});
