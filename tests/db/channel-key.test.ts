import { beforeAll, describe, expect, it } from "vitest";
import { anonClient, newHost, newPlayerToken, type Host, type TestClient } from "./support/clients";
import { isRecord, seedGuest, seedRoom, type OwnRoom, type SeededGuest } from "./support/rooms";
import {
  EVENING_QUESTION_IDS,
  LOBBY_KEYS,
  admitLatecomer,
  endGame,
  joinRequestState,
  keysOf,
  rejectLatecomer,
  removePlayer,
  requestJoin,
  requestReturn,
  roomLobby,
  seedStartGame,
  setCohost,
  type Answer,
} from "./support/rounds";

// The players' channel key (klucz kanału, players-only-live-channel) through the roles' own doors: RPC and REST with
// the publishable key, as the room's guests (anon with a player token: a co-host has no session), as latecomers and
// guests on a new browser (anon with a fresh token, as the Worker's cookie keeps it) and as signed-in hosts, past the
// Worker. Oracle: the owner's decisions 1 and 3 at the top of context/changes/players-only-live-channel/plan.md and its
// Desired End State: the room's emotes go on a topic made of a random code of the room, 22 base64url characters like
// the link code; every player of the room gets it from room_lobby, the host, a co-host and a guest with no role alike,
// in the lobby, while the game is in play and once the room is closed; a latecomer waiting or turned away, a removed
// player and a token whose place moved get nothing; removing a player gives the room a new key, the same for everyone
// left; nothing else changes it, a place moved to another device (S-04) included. The keys are random, so the test
// compares them with each other, as remove-player.test.ts compares link codes: which key must equal which, and which
// must differ, is written out by hand from the scenario. The column's shape and its check are the creator's view to
// check (supabase/tests/round_creator_view.test.sql).
//
// Each case that a guest's key decides stands apart from the leaders' cases, and the rotation is checked on the
// leaders' keys only, so a room_lobby that gave the key only to leaders turns red only the guests' cases, and a
// remove_player that kept the old key only the rotation's (the break-check of the plan's Faza 1).
//
// channel_key and its rotation come from supabase/migrations/*_players_channel_key.sql. Without it room_lobby has no
// channel_key, and every test here is red on the key it reads.
//
// Two sign-ups per run, in beforeAll: the host, and another host for the REST read of a room not its own. One open room
// per host, so the second room opens with confirm_close should the first game's end have failed; Vitest runs the
// suites in order, each suite's beforeAll right before its tests.

const anon = anonClient();
const [Q1] = EVENING_QUESTION_IDS;
// The channel key as the column's default and remove_player make it: 16 random bytes, base64url without padding.
const CHANNEL_KEY = /^[A-Za-z0-9_-]{22}$/;
const OK = { data: { ok: true }, error: null };

let host: Host;
// A host with no room here: it only tries to read this host's room over REST.
let otherHost: Host;
// The first room's key as its host got it in the lobby, for the second room to differ from.
let firstRoomKey: unknown;

beforeAll(async () => {
  [host, otherHost] = await Promise.all([newHost(), newHost()]);
});

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

// The channel key of a room_lobby answer; undefined when the answer has none (a null state included). Never throws.
function keyOf(answer: Answer): unknown {
  return isRecord(answer.data) ? answer.data.channel_key : undefined;
}

// The link code of a room_lobby answer as a string to call with; "" when there is none. Never throws.
function codeText(answer: Answer): string {
  const code: unknown = isRecord(answer.data) ? answer.data.link_token : undefined;
  return typeof code === "string" ? code : "";
}

// A REST read of the room's channel_key: the rows as they come, and the error's code, never its message or details.
interface RestRead {
  rows: unknown;
  code: string | null;
}

async function readKeyOverRest(client: TestClient, roomId: string): Promise<RestRead> {
  const result = await client.from("rooms").select("channel_key").eq("id", roomId);
  const rows: unknown = result.data;
  return { rows, code: result.error ? result.error.code : null };
}

// The first room: Host, Ola (a guest with no role) and Kuba (a co-host), in the lobby, while the game is in play and
// once it is ended. While the game is in play Ela asks to join and waits, and Zenon asks and is turned away.
describe("every player of the room gets one channel key, in the lobby, in play and after the end", () => {
  let room: OwnRoom;
  let ola: SeededGuest;
  let kuba: SeededGuest;
  const ela = newPlayerToken();
  const zenon = newPlayerToken();
  // The lobby.
  let hostLobby: Answer;
  let kubaLobby: Answer;
  let olaLobby: Answer;
  // The game in play, with the latecomers.
  let hostPlaying: Answer;
  let kubaPlaying: Answer;
  let olaPlaying: Answer;
  let elaLobby: Answer;
  let elaState: Answer;
  let zenonLobby: Answer;
  let zenonState: Answer;
  // The closed room.
  let hostClosed: Answer;
  let kubaClosed: Answer;
  let olaClosed: Answer;

  beforeAll(async () => {
    room = await seedRoom(host);
    ola = await seedGuest(room.linkToken, "Ola");
    kuba = await seedGuest(room.linkToken, "Kuba");

    // The host's key before Kuba gets the role, so the role is seen not to change it.
    hostLobby = await roomLobby(host.client, room.id);
    seed(await setCohost(host.client, room.id, "Kuba", true), "the co-host role for Kuba");
    kubaLobby = await roomLobby(anon, room.id, kuba.playerToken);
    olaLobby = await roomLobby(anon, room.id, ola.playerToken);
    firstRoomKey = keyOf(hostLobby);

    await seedStartGame(host, room.id, Q1);
    seed(await requestJoin(room.linkToken, "Ela", ela), "Ela's request to join");
    seed(await requestJoin(room.linkToken, "Zenon", zenon), "Zenon's request to join");
    seed(await rejectLatecomer(host.client, room.id, "Zenon"), "Odrzuć for Zenon");
    hostPlaying = await roomLobby(host.client, room.id);
    kubaPlaying = await roomLobby(anon, room.id, kuba.playerToken);
    olaPlaying = await roomLobby(anon, room.id, ola.playerToken);
    elaLobby = await roomLobby(anon, room.id, ela);
    elaState = await joinRequestState(room.id, ela);
    zenonLobby = await roomLobby(anon, room.id, zenon);
    zenonState = await joinRequestState(room.id, zenon);

    seed(await endGame(host.client, room.id), "end_game");
    hostClosed = await roomLobby(host.client, room.id);
    kubaClosed = await roomLobby(anon, room.id, kuba.playerToken);
    olaClosed = await roomLobby(anon, room.id, ola.playerToken);
  });

  // Decision 3: the start, the co-host role, turning a latecomer away and the end leave the key as it is.
  it("the host and Kuba, a co-host, get one 22-character key in the lobby, and the same one in play and after the end", () => {
    expect(hostLobby).toMatchObject({ error: null, data: { status: "lobby", role: "host" } });
    expect(keyOf(hostLobby)).toMatch(CHANNEL_KEY);
    expect(keyOf(kubaLobby)).toBe(keyOf(hostLobby));
    expect(hostPlaying).toMatchObject({ error: null, data: { status: "playing" } });
    expect(keyOf(hostPlaying)).toBe(keyOf(hostLobby));
    expect(keyOf(kubaPlaying)).toBe(keyOf(hostLobby));
    expect(hostClosed).toMatchObject({ error: null, data: { status: "closed" } });
    expect(keyOf(hostClosed)).toBe(keyOf(hostLobby));
    expect(keyOf(kubaClosed)).toBe(keyOf(hostLobby));
  });

  // The guest's cases, one per status: the topic of the emotes is every player's.
  it.each([
    { status: "lobby", expected: "lobby", guest: () => olaLobby, leader: () => hostLobby },
    { status: "game in play", expected: "playing", guest: () => olaPlaying, leader: () => hostPlaying },
    { status: "closed room", expected: "closed", guest: () => olaClosed, leader: () => hostClosed },
  ])("Ola, a guest with no role, gets the host's 22-character key in the $status", ({ expected, guest, leader }) => {
    expect(guest()).toMatchObject({ error: null, data: { status: expected, role: "guest", me: "Ola" } });
    expect(keyOf(guest())).toMatch(CHANNEL_KEY);
    expect(keyOf(guest())).toBe(keyOf(leader()));
  });

  // Exact keys (test-plan §6.3): the key is the one key a guest gets with the players' channel.
  it("Ola's state while the game is in play has exactly the lobby's keys, channel_key among them", () => {
    expect(keysOf(olaPlaying.data)).toEqual(LOBBY_KEYS);
  });

  // The plan's Desired End State: someone outside the room gets no key, from either function a latecomer's screen
  // calls.
  it("Ela, a latecomer waiting to be let in, gets null from room_lobby, and her state is exactly { state: pending, nick: Ela }", () => {
    expect(elaLobby).toEqual({ data: null, error: null });
    expect(elaState).toEqual({ data: { state: "pending", nick: "Ela" }, error: null });
  });

  it("Zenon, a latecomer turned away, gets null from room_lobby, and his state is exactly { state: rejected, nick: Zenon }", () => {
    expect(zenonLobby).toEqual({ data: null, error: null });
    expect(zenonState).toEqual({ data: { state: "rejected", nick: "Zenon" }, error: null });
  });
});

// The second room, in the lobby: Host, Ola (a guest with no role), Kuba (a co-host), Zosia and Bartek. The host removes
// Zosia; then Bartek's new browser asks to come back to his place with the new link, and the host lets him back. At the
// end the room's key is read over REST by its host, by another host and by anon.
describe("removing a player gives the room a new key; coming back on another browser does not", () => {
  let room: OwnRoom;
  let ola: SeededGuest;
  let kuba: SeededGuest;
  let zosia: SeededGuest;
  let bartek: SeededGuest;
  const bartekNew = newPlayerToken();
  // Before the removal.
  let hostBefore: Answer;
  let kubaBefore: Answer;
  // The removal.
  let hostRemovesZosia: Answer;
  let hostAfter: Answer;
  let kubaAfter: Answer;
  let olaAfter: Answer;
  let zosiaAfter: Answer;
  // Bartek back on a new browser.
  let bartekAsks: Answer;
  let hostAdmitsBartek: Answer;
  let hostAfterReturn: Answer;
  let bartekNewView: Answer;
  let bartekOldView: Answer;
  // REST.
  let hostRest: RestRead;
  let otherHostRest: RestRead;
  let anonRest: RestRead;

  beforeAll(async () => {
    room = await seedRoom(host, { confirmClose: true });
    ola = await seedGuest(room.linkToken, "Ola");
    kuba = await seedGuest(room.linkToken, "Kuba");
    zosia = await seedGuest(room.linkToken, "Zosia");
    bartek = await seedGuest(room.linkToken, "Bartek");
    seed(await setCohost(host.client, room.id, "Kuba", true), "the co-host role for Kuba");

    hostBefore = await roomLobby(host.client, room.id);
    kubaBefore = await roomLobby(anon, room.id, kuba.playerToken);

    hostRemovesZosia = await removePlayer(host.client, room.id, "Zosia");
    hostAfter = await roomLobby(host.client, room.id);
    kubaAfter = await roomLobby(anon, room.id, kuba.playerToken);
    olaAfter = await roomLobby(anon, room.id, ola.playerToken);
    zosiaAfter = await roomLobby(anon, room.id, zosia.playerToken);

    // S-04: the link changed with the removal, so Bartek's new browser asks with the new one.
    bartekAsks = await requestReturn(codeText(hostAfter), "Bartek", bartekNew);
    hostAdmitsBartek = await admitLatecomer(host.client, room.id, "Bartek");
    hostAfterReturn = await roomLobby(host.client, room.id);
    bartekNewView = await roomLobby(anon, room.id, bartekNew);
    bartekOldView = await roomLobby(anon, room.id, bartek.playerToken);

    hostRest = await readKeyOverRest(host.client, room.id);
    otherHostRest = await readKeyOverRest(otherHost.client, room.id);
    anonRest = await readKeyOverRest(anon, room.id);
  });

  // Positive control: the removal must work, or a wrong address would look like a key that never changes.
  it("positive control: the host removes Zosia, a guest in the lobby, with exactly { ok: true }", () => {
    expect(hostRemovesZosia).toEqual(OK);
  });

  // The rotation, on the leaders' keys only.
  it("remove_player gives the room a new key: after Zosia's removal the host and Kuba, a co-host, share another 22-character key", () => {
    expect(keyOf(hostBefore)).toMatch(CHANNEL_KEY);
    expect(keyOf(kubaBefore)).toBe(keyOf(hostBefore));
    expect(keyOf(hostAfter)).toMatch(CHANNEL_KEY);
    expect(keyOf(hostAfter)).not.toBe(keyOf(hostBefore));
    expect(keyOf(kubaAfter)).toBe(keyOf(hostAfter));
  });

  it("Ola, a guest with no role left in the room, gets the host's 22-character key after the removal", () => {
    expect(olaAfter).toMatchObject({ error: null, data: { status: "lobby", me: "Ola" } });
    expect(keyOf(olaAfter)).toMatch(CHANNEL_KEY);
    expect(keyOf(olaAfter)).toBe(keyOf(hostAfter));
  });

  it("once removed, Zosia's token opens the room no more: room_lobby answers null, with no key", () => {
    expect(zosiaAfter).toEqual({ data: null, error: null });
  });

  // Decision 3: a place moved to another device is the same person, so the key stays.
  it("Bartek's request to come back and the host's Wpuść get ok: true, and the host's key is the same before and after", () => {
    expect(bartekAsks).toEqual(OK);
    expect(hostAdmitsBartek).toEqual(OK);
    expect(keyOf(hostAfter)).toMatch(CHANNEL_KEY);
    expect(keyOf(hostAfterReturn)).toBe(keyOf(hostAfter));
  });

  it("Bartek's new browser, let back to his place, gets that same key", () => {
    expect(bartekNewView).toMatchObject({ error: null, data: { status: "lobby", role: "guest", me: "Bartek" } });
    expect(keyOf(bartekNewView)).toMatch(CHANNEL_KEY);
    expect(keyOf(bartekNewView)).toBe(keyOf(hostAfterReturn));
  });

  it("Bartek's old browser then opens nothing: room_lobby answers null, with no key", () => {
    expect(bartekOldView).toEqual({ data: null, error: null });
  });

  // Each room's own default: the second room's key before any removal is not the first room's.
  it("two rooms of one host have different keys", () => {
    expect(firstRoomKey).toMatch(CHANNEL_KEY);
    expect(keyOf(hostBefore)).toMatch(CHANNEL_KEY);
    expect(keyOf(hostBefore)).not.toBe(firstRoomKey);
  });

  // Positive control of the REST reads: an allowed one must work, or a wrong address would look like a refusal.
  it("positive control: the host, a player of the room, reads its own room's channel_key over REST: the key room_lobby gives it", () => {
    expect(hostRest.code).toBeNull();
    expect(keyOf(hostAfterReturn)).toMatch(CHANNEL_KEY);
    expect(hostRest.rows).toEqual([{ channel_key: keyOf(hostAfterReturn) }]);
  });

  // RLS hides another host's room without an error: no row, so no key.
  it("another host selecting this room's channel_key over REST gets no row", () => {
    expect(otherHostRest.code).toBeNull();
    expect(otherHostRest.rows).toEqual([]);
  });

  // anon has no grant on rooms at all (G1 in roles.test.ts): 42501.
  it("anon selecting rooms.channel_key over REST gets 42501", () => {
    expect(anonRest.code).toBe("42501");
    expect(anonRest.rows).toBeNull();
  });
});
