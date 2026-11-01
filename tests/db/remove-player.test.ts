import { beforeAll, describe, expect, it } from "vitest";
import { anonClient, newHost, type Host } from "./support/clients";
import { isRecord, seedGuest, seedRoom, type OwnRoom } from "./support/rooms";
import {
  EVENING_QUESTION_IDS,
  admitLatecomer,
  castVote,
  endGame,
  joinRoom,
  removePlayer,
  requestJoin,
  roomLink,
  roomLobby,
  roundOf,
  seedNextRound,
  seedStartGame,
  seedVote,
  setCohost,
  type Answer,
} from "./support/rounds";

// Removing a player (S-09) through the roles' own doors: RPC with the publishable key, as the room's guests (anon with a
// player token: a co-host has no session) and as the signed-in host, past the Worker. Oracle: PRD FR-004 (the host or
// a co-host removes a player from the room; the room then gets a new link and the old one stops working), PRD Access
// Control (a co-host removes players too) and Karol's decisions in context/changes/remove-player-new-link/research.md
// ("Decyzje do planu"): 1, the votes of a round in progress (votes for the removed player are lost, a vote the removed
// player cast stays counted, and a round waiting for a removed player who has not voted reveals itself once everyone
// left has voted); 2, who removes whom (the host any guest, a co-host included; a co-host the guests with no role;
// nobody the host); 4, nothing of the removed player stays, the colours of the others included; 5, a leader, the host
// or a co-host, sees the players' link; 6, the removed player comes back only with the new link, in the lobby through
// join_room and while the game is in play through a request and "Wpuść". The refusals and their order are written in
// context/changes/remove-player-new-link/plan.md (Faza 1 #1). Every nick, count, colour and refusal expected here is
// written out by hand from the scenario, never computed; where a refusal must change nothing, the test compares the
// players and the link code in the host's state right before and right after it, each refusal with arguments that
// would remove someone or replace the code if it got through. The urn left behind by a reveal the removal makes is the
// creator's view to check (supabase/tests/round_creator_view.test.sql), since no role can read it.
//
// remove_player and room_lobby's link_token come from supabase/migrations/*_remove_player.sql. Without it PostgREST
// answers remove_player with PGRST202 (no such function), room_lobby gives no link_token, and every test here is red on
// its own probe or on the state it reads.
//
// One sign-up per run, in beforeAll. One open room per host, so the second room opens with confirm_close, which closes
// the first one; Vitest runs the suites in order, each suite's beforeAll right before its tests.

const anon = anonClient();
const [Q1, Q2, Q3, Q4] = EVENING_QUESTION_IDS;
// The whole pool, as the Worker would send it at any point of the second room's game.
const POOL = [Q1, Q2, Q3, Q4];
// Not a player token: the Worker sends the cookie's 32-byte one or none.
const MALFORMED_TOKEN = "not-a-player-token";
// A link code as create_room makes one: 16 random bytes, base64url without padding.
const LINK_CODE = /^[A-Za-z0-9_-]{22}$/;
const OK = { data: { ok: true }, error: null };

let host: Host;
// Ewa's token, a co-host of the first room: the second room's stranger.
let firstCohostToken: string;

beforeAll(async () => {
  host = await newHost();
});

// One answer as a word: ok, the refusal's reason or the error's code, never the call's arguments, which hold tokens.
// Never throws.
function outcomeOf(answer: Answer): string {
  if (answer.error) return `error ${answer.error.code}`;
  const data = answer.data;
  if (isRecord(data) && data.ok === true) return "ok";
  return isRecord(data) && typeof data.reason === "string" ? data.reason : "an unexpected shape";
}

// A step that is a precondition, not the thing under test. Throws on any failure: beforeAll only.
function mustAccept(step: string, answer: Answer): void {
  const outcome = outcomeOf(answer);
  if (outcome !== "ok") {
    throw new Error(`precondition failed: ${step} was refused: ${outcome}`);
  }
}

// A top-level field of a room_lobby answer; undefined when the answer has none. Never throws.
function fieldOf(answer: Answer, key: string): unknown {
  return isRecord(answer.data) ? answer.data[key] : undefined;
}

// The link code of a room_lobby answer: a string for a leader, null for anyone else. Never throws.
function linkCodeOf(answer: Answer): unknown {
  return fieldOf(answer, "link_token");
}

// The same code to call with: "" when there is none, which room_link, join_room and request_join take as unknown.
function codeText(answer: Answer): string {
  const code = linkCodeOf(answer);
  return typeof code === "string" ? code : "";
}

// The players of a room_lobby answer, in seat order; [] when it has none (a failed call included). Never throws.
function playersOf(answer: Answer): Record<string, unknown>[] {
  const players: unknown = fieldOf(answer, "players");
  return Array.isArray(players) ? (players as unknown[]).filter(isRecord) : [];
}

function nicksOf(answer: Answer): unknown[] {
  return playersOf(answer).map((player) => player.nick);
}

// A try that must change nothing, with the host's state of the room right before and right after it.
interface Attempt {
  answer: Answer;
  before: Answer;
  after: Answer;
}

async function attempt(roomId: string, removal: () => Promise<Answer>): Promise<Attempt> {
  const before = await roomLobby(host.client, roomId);
  const answer = await removal();
  const after = await roomLobby(host.client, roomId);
  return { answer, before, after };
}

// The first room stays in the lobby: Host, Ola, Kuba, Ewa, Zosia and Bartek, with Ewa and Zosia co-hosts. The link code
// is read before anything is removed, then every refused try comes, then the host removes Ola, she comes back with the
// new code, Ewa removes Bartek and the host removes Zosia. Each step's answer is kept and checked by its own test, so no
// test depends on another one having run.
describe("the lobby: the host removes Ola, the room gets a new link, and Ola comes back with it", () => {
  let room: OwnRoom;
  // The link code before anything is removed.
  let hostFirst: Answer;
  let ewaFirst: Answer;
  let kubaFirst: Answer;
  let firstLink: Answer;
  // The refused tries.
  let ewaRemovesZosia: Attempt;
  let ewaRemovesHerself: Attempt;
  let kubaRemovesBartek: Attempt;
  let hostRemovesHost: Attempt;
  let hostRemovesZenon: Attempt;
  let noTokenRemovesBartek: Attempt;
  let malformedRemovesBartek: Attempt;
  let hostRemovesOlaAgain: Attempt;
  // Ola removed, and back.
  let hostRemovesOla: Answer;
  let olaAfter: Answer;
  let oldLink: Answer;
  let hostAfter: Answer;
  let newLink: Answer;
  let kubaAfter: Answer;
  let olaJoinsAgain: Answer;
  // The co-host's removal, and the host's removal of a co-host.
  let ewaRemovesBartek: Answer;
  let afterEwa: Answer;
  let hostRemovesZosia: Answer;
  let afterHost: Answer;

  beforeAll(async () => {
    room = await seedRoom(host);
    const ola = await seedGuest(room.linkToken, "Ola");
    const kuba = await seedGuest(room.linkToken, "Kuba");
    const ewa = await seedGuest(room.linkToken, "Ewa");
    await seedGuest(room.linkToken, "Zosia");
    await seedGuest(room.linkToken, "Bartek");
    firstCohostToken = ewa.playerToken;
    mustAccept("giving Ewa the role", await setCohost(host.client, room.id, "Ewa", true));
    mustAccept("giving Zosia the role", await setCohost(host.client, room.id, "Zosia", true));

    hostFirst = await roomLobby(host.client, room.id);
    ewaFirst = await roomLobby(anon, room.id, ewa.playerToken);
    kubaFirst = await roomLobby(anon, room.id, kuba.playerToken);
    firstLink = await roomLink(room.linkToken);

    // Decision 2: only the host decides about co-hosts, and nobody removes the host.
    ewaRemovesZosia = await attempt(room.id, () => removePlayer(anon, room.id, "Zosia", ewa.playerToken));
    ewaRemovesHerself = await attempt(room.id, () => removePlayer(anon, room.id, "Ewa", ewa.playerToken));
    kubaRemovesBartek = await attempt(room.id, () => removePlayer(anon, room.id, "Bartek", kuba.playerToken));
    hostRemovesHost = await attempt(room.id, () => removePlayer(host.client, room.id, "Host"));
    hostRemovesZenon = await attempt(room.id, () => removePlayer(host.client, room.id, "Zenon"));
    noTokenRemovesBartek = await attempt(room.id, () => removePlayer(anon, room.id, "Bartek"));
    malformedRemovesBartek = await attempt(room.id, () => removePlayer(anon, room.id, "Bartek", MALFORMED_TOKEN));

    hostRemovesOla = await removePlayer(host.client, room.id, "Ola");
    olaAfter = await roomLobby(anon, room.id, ola.playerToken);
    oldLink = await roomLink(room.linkToken);
    hostAfter = await roomLobby(host.client, room.id);
    newLink = await roomLink(codeText(hostAfter));
    kubaAfter = await roomLobby(anon, room.id, kuba.playerToken);
    // A double click, or another leader's screen: Ola is no guest of the room any more.
    hostRemovesOlaAgain = await attempt(room.id, () => removePlayer(host.client, room.id, "Ola"));
    // Decision 6: in the lobby she comes back by herself, with the new link, as a new phone does.
    olaJoinsAgain = await joinRoom(codeText(hostAfter), "Ola");

    ewaRemovesBartek = await removePlayer(anon, room.id, "Bartek", ewa.playerToken);
    afterEwa = await roomLobby(host.client, room.id);
    hostRemovesZosia = await removePlayer(host.client, room.id, "Zosia");
    afterHost = await roomLobby(host.client, room.id);
  });

  // Decision 5: the players' link is every leader's, so a co-host who removes someone knows the new one.
  it("the link code in the room's state: the host and Ewa, a co-host, get the room's 22-character code, which room_link opens; Kuba, a guest with no role, gets null", () => {
    expect(linkCodeOf(hostFirst)).toMatch(LINK_CODE);
    expect(linkCodeOf(hostFirst)).toBe(room.linkToken);
    expect(linkCodeOf(ewaFirst)).toBe(room.linkToken);
    expect(firstLink).toEqual({ data: { status: "open", room_id: room.id }, error: null });
    expect(kubaFirst.error).toBeNull();
    expect(linkCodeOf(kubaFirst)).toBeNull();
  });

  // Positive control: the removal must work, or a wrong address would look like a refusal everywhere.
  it("positive control: the host removes Ola, a guest in the lobby, with exactly { ok: true }", () => {
    expect(hostRemovesOla).toEqual(OK);
  });

  it("once removed, Ola's token opens the room no more: room_lobby answers null", () => {
    expect(olaAfter).toEqual({ data: null, error: null });
  });

  // FR-004: the old link stops working, and the new one is in the leader's state.
  it("the old code is unknown to room_link, and the new code in the host's state, another 22-character one, opens the room", () => {
    expect(oldLink).toEqual({ data: { status: "unknown" }, error: null });
    expect(linkCodeOf(hostAfter)).toMatch(LINK_CODE);
    expect(linkCodeOf(hostAfter)).not.toBe(room.linkToken);
    expect(newLink).toEqual({ data: { status: "open", room_id: room.id }, error: null });
  });

  // The new link replaces no one else's way in, and decision 4 keeps every other colour.
  it("Kuba, still in the room, sees it without Ola, keeping the colour 2 he had", () => {
    expect(playersOf(kubaFirst).find((player) => player.nick === "Kuba")?.color).toBe(2);
    expect(kubaAfter).toMatchObject({
      error: null,
      data: {
        status: "lobby",
        me: "Kuba",
        players: [
          { nick: "Host", color: 0 },
          { nick: "Kuba", color: 2 },
          { nick: "Ewa", color: 3 },
          { nick: "Zosia", color: 4 },
          { nick: "Bartek", color: 5 },
        ],
      },
    });
  });

  // Decision 6.
  it("Ola comes back with the new code through join_room: exactly { ok: true, room_id }", () => {
    expect(olaJoinsAgain).toEqual({ data: { ok: true, room_id: room.id }, error: null });
  });

  // Decision 2: a co-host removes a guest with no role.
  it("Ewa, a co-host, removes Bartek, a guest with no role: exactly { ok: true }, and Bartek is gone", () => {
    expect(ewaRemovesBartek).toEqual(OK);
    expect(nicksOf(afterEwa)).toEqual(["Host", "Kuba", "Ewa", "Zosia", "Ola"]);
  });

  // Decision 2: the host removes any guest, a co-host included.
  it("the host removes Zosia, a co-host: exactly { ok: true }, and Zosia is gone", () => {
    expect(hostRemovesZosia).toEqual(OK);
    expect(nicksOf(afterHost)).toEqual(["Host", "Kuba", "Ewa", "Ola"]);
  });

  // Each with a player of the room to remove: let through, it would take that player away and replace the code.
  it.each([
    {
      who: "Ewa, a co-host, removing Zosia, another co-host,",
      target: "Zosia",
      reason: "cohost_protected",
      tried: () => ewaRemovesZosia,
    },
    {
      who: "Ewa, a co-host, removing herself",
      target: "Ewa",
      reason: "cohost_protected",
      tried: () => ewaRemovesHerself,
    },
    {
      who: "Kuba, a guest with no role, removing Bartek",
      target: "Bartek",
      reason: "not_leader",
      tried: () => kubaRemovesBartek,
    },
    { who: "the host removing its own nick", target: "Host", reason: "player_unknown", tried: () => hostRemovesHost },
    {
      who: "someone with no token removing Bartek",
      target: "Bartek",
      reason: "room_unknown",
      tried: () => noTokenRemovesBartek,
    },
  ])("$who gets $reason, and the players and the link code stay as they were", ({ target, reason, tried }) => {
    const { answer, before, after } = tried();

    expect(answer).toMatchObject({ error: null, data: { ok: false, reason } });
    expect(nicksOf(before)).toContain(target);
    expect(nicksOf(after)).toEqual(nicksOf(before));
    expect(linkCodeOf(before)).toMatch(LINK_CODE);
    expect(linkCodeOf(after)).toBe(linkCodeOf(before));
  });

  // No guest with the nick: let through, it would still replace the code.
  it.each([
    { who: "the host removing a nick in no room", tried: () => hostRemovesZenon },
    { who: "the host removing Ola a second time", tried: () => hostRemovesOlaAgain },
  ])("$who gets player_unknown, and the players and the link code stay as they were", ({ tried }) => {
    const { answer, before, after } = tried();

    expect(answer).toMatchObject({ error: null, data: { ok: false, reason: "player_unknown" } });
    expect(nicksOf(after)).toEqual(nicksOf(before));
    expect(linkCodeOf(before)).toMatch(LINK_CODE);
    expect(linkCodeOf(after)).toBe(linkCodeOf(before));
  });

  // Not our client's input: an exception, as for a malformed token in a vote, with no row's values in details.
  it("removing Bartek with a malformed player token is refused with 22023, and the players and the link code stay as they were", () => {
    const { answer, before, after } = malformedRemovesBartek;

    expect(answer).toMatchObject({ data: null, error: { code: "22023", details: null } });
    expect(nicksOf(before)).toContain("Bartek");
    expect(nicksOf(after)).toEqual(nicksOf(before));
    expect(linkCodeOf(before)).toMatch(LINK_CODE);
    expect(linkCodeOf(after)).toBe(linkCodeOf(before));
  });
});

// The second room plays three rounds, one per part of decision 1: Host, Ola, Kuba, Ewa (a co-host), Bartek and Zosia.
// Round 1: Bartek votes and is removed, so the round still waits for the others and counts his vote. Round 2: two
// votes go to Zosia, she abstains, and Ewa removes her, so the reveal shows the other counts as cast and no Zosia.
// Round 3: everyone left but Kuba votes, and the host removes him, so the removal itself reveals the round; it comes
// last, so a round still voting cannot hold up the steps after it. Then Kuba comes back through a request and "Wpuść",
// the host removes Ewa, and the game ends.
describe("a game: Bartek, Zosia and Kuba are removed while voting, and Kuba comes back through Wpuść", () => {
  let room: OwnRoom;
  let strangerRemovesOla: Attempt;
  // Round 1: Bartek has voted.
  let hostRemovesBartek: Answer;
  let afterBartek: Answer;
  let afterFour: Answer;
  let zosiaLastVote: Answer;
  let afterRound1: Answer;
  // Round 2: votes for Zosia.
  let ewaRemovesZosia: Answer;
  let ewaLastVote: Answer;
  let afterRound2: Answer;
  // Round 3: Kuba has not voted.
  let beforeKuba: Answer;
  let hostRemovesKuba: Answer;
  let afterKuba: Answer;
  let kubaAfter: Answer;
  let oldLink: Answer;
  let newLink: Answer;
  // Kuba back.
  let kubaAsks: Answer;
  let ewaAdmitsKuba: Answer;
  let kubaBack: Answer;
  // The host removes the co-host.
  let hostRemovesEwa: Answer;
  let afterEwa: Answer;
  // The ended game.
  let closedRemovesOla: Attempt;

  beforeAll(async () => {
    room = await seedRoom(host, { confirmClose: true });
    const ola = await seedGuest(room.linkToken, "Ola");
    const kuba = await seedGuest(room.linkToken, "Kuba");
    const ewa = await seedGuest(room.linkToken, "Ewa");
    const bartek = await seedGuest(room.linkToken, "Bartek");
    const zosia = await seedGuest(room.linkToken, "Zosia");
    mustAccept("giving Ewa the role", await setCohost(host.client, room.id, "Ewa", true));

    // A co-host leads only the room she plays in.
    strangerRemovesOla = await attempt(room.id, () => removePlayer(anon, room.id, "Ola", firstCohostToken));

    await seedStartGame(host, room.id, Q1);

    // Round 1: Bartek votes for Ola, then the host removes him; then four of the five left vote, and Zosia last.
    await seedVote(anon, room.id, "Ola", bartek.playerToken, 1);
    hostRemovesBartek = await removePlayer(host.client, room.id, "Bartek");
    afterBartek = await roomLobby(host.client, room.id);
    await seedVote(host.client, room.id, "Ola", undefined, 1);
    await seedVote(anon, room.id, "Ewa", ola.playerToken, 1);
    await seedVote(anon, room.id, "Ola", kuba.playerToken, 1);
    await seedVote(anon, room.id, "Zosia", ewa.playerToken, 1);
    afterFour = await roomLobby(host.client, room.id);
    zosiaLastVote = await castVote(anon, room.id, "Ewa", zosia.playerToken, 1);
    afterRound1 = await roomLobby(host.client, room.id);

    // Round 2 (Q2): the host and Ola vote for Zosia, Kuba for Ewa, Zosia abstains; then Ewa removes her and votes last.
    await seedNextRound(host, room.id, 1, POOL);
    await seedVote(host.client, room.id, "Zosia", undefined, 2);
    await seedVote(anon, room.id, "Zosia", ola.playerToken, 2);
    await seedVote(anon, room.id, "Ewa", kuba.playerToken, 2);
    await seedVote(anon, room.id, null, zosia.playerToken, 2);
    ewaRemovesZosia = await removePlayer(anon, room.id, "Zosia", ewa.playerToken);
    ewaLastVote = await castVote(anon, room.id, "Ola", ewa.playerToken, 2);
    afterRound2 = await roomLobby(host.client, room.id);

    // Round 3 (Q3): the host, Ola and Ewa vote, Kuba does not; then the host removes him.
    await seedNextRound(host, room.id, 2, POOL);
    await seedVote(host.client, room.id, "Ola", undefined, 3);
    await seedVote(anon, room.id, "Ewa", ola.playerToken, 3);
    await seedVote(anon, room.id, "Ola", ewa.playerToken, 3);
    beforeKuba = await roomLobby(host.client, room.id);
    hostRemovesKuba = await removePlayer(host.client, room.id, "Kuba");
    afterKuba = await roomLobby(host.client, room.id);
    kubaAfter = await roomLobby(anon, room.id, kuba.playerToken);
    oldLink = await roomLink(codeText(beforeKuba));
    newLink = await roomLink(codeText(afterKuba));

    // Decision 6: while the game is in play he asks with the new link and the cookie he had, and a leader lets him in.
    kubaAsks = await requestJoin(codeText(afterKuba), "Kuba", kuba.playerToken);
    ewaAdmitsKuba = await admitLatecomer(anon, room.id, "Kuba", ewa.playerToken);
    kubaBack = await roomLobby(anon, room.id, kuba.playerToken);

    hostRemovesEwa = await removePlayer(host.client, room.id, "Ewa");
    afterEwa = await roomLobby(host.client, room.id);

    mustAccept("Zakończ grę", await endGame(host.client, room.id));
    // Let through, it would take Ola out of the closed room and replace its code.
    closedRemovesOla = await attempt(room.id, () => removePlayer(host.client, room.id, "Ola"));
  });

  // Decision 1: a vote cast stays counted, so the round keeps waiting for everyone else.
  it("round 1: Bartek, who has voted, removed by the host: exactly { ok: true }, and the round still waits for the five others", () => {
    expect(hostRemovesBartek).toEqual(OK);
    expect(roundOf(afterBartek)).toMatchObject({
      number: 1,
      phase: "voting",
      eligible: ["Host", "Ola", "Kuba", "Ewa", "Zosia"],
      voted: [],
    });
  });

  // Decision 1: his vote counts toward the threshold too, so the reveal comes with the last of the others, not before.
  it("round 1: with four of the five others voted the round still waits, and Zosia's vote reveals it with Bartek's vote for Ola counted", () => {
    expect(roundOf(afterFour)).toMatchObject({ number: 1, phase: "voting", voted: ["Host", "Ola", "Kuba", "Ewa"] });
    expect(zosiaLastVote).toEqual(OK);
    // Bartek, the host and Kuba for Ola; Ola and Zosia for Ewa; Ewa for Zosia: 6 ballots, Bartek's among them.
    expect(roundOf(afterRound1)).toMatchObject({
      number: 1,
      phase: "revealed",
      results: [
        { nick: "Host", votes: 0 },
        { nick: "Ola", votes: 3 },
        { nick: "Kuba", votes: 0 },
        { nick: "Ewa", votes: 2 },
        { nick: "Zosia", votes: 1 },
      ],
      abstained: 0,
      ballots: 6,
    });
  });

  // Decision 2: a co-host removes a guest with no role, while the game is in play too.
  it("round 2: Ewa, a co-host, removes Zosia, a guest with no role who has voted: exactly { ok: true }", () => {
    expect(ewaRemovesZosia).toEqual(OK);
  });

  // Decision 1: the votes for the removed player are lost, and nothing else moves.
  it("round 2: at the reveal Zosia is not in the result, the two votes for her are lost, and every other count stays as cast", () => {
    expect(ewaLastVote).toEqual(OK);
    // The host and Ola for Zosia (lost), Kuba for Ewa, Ewa for Ola, Zosia abstains: 5 ballots.
    expect(roundOf(afterRound2)).toMatchObject({
      number: 2,
      phase: "revealed",
      results: [
        { nick: "Host", votes: 0 },
        { nick: "Ola", votes: 1 },
        { nick: "Kuba", votes: 0 },
        { nick: "Ewa", votes: 1 },
      ],
      abstained: 1,
      ballots: 5,
    });
  });

  // Decision 1: a round waiting for a removed player who has not voted stops waiting.
  it("round 3: Kuba, who has not voted, removed by the host while the round waits for him alone: exactly { ok: true }, and the removal itself reveals the round without him", () => {
    expect(roundOf(beforeKuba)).toMatchObject({ number: 3, phase: "voting", voted: ["Host", "Ola", "Ewa"] });
    expect(hostRemovesKuba).toEqual(OK);
    // The host and Ewa for Ola, Ola for Ewa: 3 ballots.
    expect(roundOf(afterKuba)).toMatchObject({
      number: 3,
      phase: "revealed",
      results: [
        { nick: "Host", votes: 0 },
        { nick: "Ola", votes: 2 },
        { nick: "Ewa", votes: 1 },
      ],
      abstained: 0,
      ballots: 3,
    });
  });

  it("once removed mid-game, Kuba's token opens the room no more: room_lobby answers null", () => {
    expect(kubaAfter).toEqual({ data: null, error: null });
  });

  // FR-004 while the game is in play: the room and its players stay, only the code changes.
  it("mid-game, the code from right before Kuba's removal is unknown to room_link, and the new code in the host's state says started", () => {
    expect(linkCodeOf(beforeKuba)).toMatch(LINK_CODE);
    expect(oldLink).toEqual({ data: { status: "unknown" }, error: null });
    expect(newLink).toEqual({ data: { status: "started", room_id: room.id }, error: null });
  });

  // Decision 6: his old cookie's hash went with him, so the same token asks as a new latecomer.
  it("Kuba comes back: with the new code and the same token he asks to join, Ewa lets him in, and his token opens the room again", () => {
    expect(kubaAsks).toEqual(OK);
    expect(ewaAdmitsKuba).toEqual(OK);
    expect(kubaBack).toMatchObject({ error: null, data: { status: "playing", role: "guest", me: "Kuba" } });
  });

  // Decision 2: the host removes a co-host, while the game is in play too.
  it("the host removes Ewa, a co-host: exactly { ok: true }, and Ewa is gone", () => {
    expect(hostRemovesEwa).toEqual(OK);
    expect(nicksOf(afterEwa)).toEqual(["Host", "Ola", "Kuba"]);
  });

  it.each([
    {
      who: "Ewa of the first room, a co-host there, removing Ola here with her token",
      reason: "room_unknown",
      tried: () => strangerRemovesOla,
    },
    { who: "the host removing Ola once the game is ended", reason: "room_closed", tried: () => closedRemovesOla },
  ])("$who gets $reason, and the players and the link code stay as they were", ({ reason, tried }) => {
    const { answer, before, after } = tried();

    expect(answer).toMatchObject({ error: null, data: { ok: false, reason } });
    expect(nicksOf(before)).toContain("Ola");
    expect(nicksOf(after)).toEqual(nicksOf(before));
    expect(linkCodeOf(before)).toMatch(LINK_CODE);
    expect(linkCodeOf(after)).toBe(linkCodeOf(before));
  });
});
