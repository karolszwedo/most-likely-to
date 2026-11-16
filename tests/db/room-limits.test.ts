import { beforeAll, describe, expect, it } from "vitest";
import { anonClient, newHost, newPlayerToken, type Host } from "./support/clients";
import { isRecord, readOwnRoom, seedGuest, seedRoom, type OwnRoom } from "./support/rooms";
import {
  admitLatecomer,
  joinRequestState,
  joinRoom,
  rejectLatecomer,
  removePlayer,
  requestJoin,
  requestReturn,
  roomLobby,
  seedStartGame,
  type Answer,
} from "./support/rounds";

// The room's ceiling of 50 players (security-hardening) through the roles' own doors: RPC with the publishable key, as
// guests and latecomers (anon, each with a player token of its own, as the Worker's cookie keeps it), as a guest on a
// new browser and as the signed-in host, past the Worker. Oracle: Karol's decision of 2026-11-16 in
// context/changes/security-hardening/change.md (at most 50 players in a room, well above the 20 the game is checked
// at) and the contract of context/changes/security-hardening/plan.md, Faza 1 #1 and #3, with F2 of its
// reviews/plan-review.md: the host counts; the 51st gets room_full on each way that adds a player (join_room in the
// lobby, request_join for a game in play, a new request and a rejected one asking again, and the leader's "Wpuść" of a
// latecomer, whose request then stays); a nick of a player of the room is still nick_taken in a full room, because only
// that answer offers to ask to come back; coming back to one's own place adds no player, so a full room lets it; a form
// sent twice by a request already waiting or by a player still gets { ok: true }. Every nick, list and refusal expected
// here is written out by hand from the scenario, never computed.
//
// The ceiling comes from supabase/migrations/*_security_hardening.sql. Without it the refusals here are red: the 51st
// player gets in, and so does a latecomer's request in a full room. Each of the four ways in is checked by one test,
// and the other tests read only what stays true without the ceiling, so a missing check reddens exactly its own test.
//
// One sign-up per run, in beforeAll. One open room per host, so the second room opens with confirm_close, which closes
// the first one. Each room plays out once, in order, in its beforeAll, and each step's answer is kept and checked by
// its own test, so no test depends on another one having run.

const anon = anonClient();
const OK = { data: { ok: true }, error: null };

function refusal(reason: string): { error: null; data: { ok: false; reason: string } } {
  return { error: null, data: { ok: false, reason } };
}

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

// The nicks of a room_lobby answer, in seat order; [] when it has none (a failed call included). Never throws.
function nicksOf(answer: Answer): unknown[] {
  const players: unknown = isRecord(answer.data) ? answer.data.players : null;
  return Array.isArray(players) ? (players as unknown[]).map((player) => (isRecord(player) ? player.nick : null)) : [];
}

// A top-level field of a room_lobby answer; undefined when the answer has none. Never throws.
function fieldOf(answer: Answer, key: string): unknown {
  return isRecord(answer.data) ? answer.data[key] : undefined;
}

// The guests of each room, by seat: "Gracz 2" sits right after the host. 49 guests and the host make 50 players in the
// lobby; 48 and the host make 49 players for the game, and one latecomer let in makes 50.
const LOBBY_GUESTS = Array.from({ length: 49 }, (_, index) => `Gracz ${index + 2}`);
const GAME_GUESTS = Array.from({ length: 48 }, (_, index) => `Gracz ${index + 2}`);

let host: Host;

beforeAll(async () => {
  host = await newHost();
});

describe("a full lobby: the host and 49 guests, Gracz 2 to Gracz 50, then the 51st", () => {
  let room: OwnRoom;
  let at50: Answer;
  let fiftyFirst: Answer;
  let takenNick: Answer;
  let afterRefusals: Answer;
  let joinAfterRemoval: Answer;
  let afterJoin: Answer;

  beforeAll(async () => {
    room = await seedRoom(host);
    // One after another, so the seats follow the order of joining. seedGuest throws on a refusal, so the 50th player
    // getting in is a precondition here too.
    for (const nick of LOBBY_GUESTS) {
      await seedGuest(room.linkToken, nick);
    }
    at50 = await roomLobby(host.client, room.id);

    fiftyFirst = await joinRoom(room.linkToken, "Gracz 51");
    // A player without the cookie typing their own nick: the way to "To ty? Poproś o powrót".
    takenNick = await joinRoom(room.linkToken, "Gracz 2");
    afterRefusals = await roomLobby(host.client, room.id);

    // A seat frees up. Removing a player gives the room a new link code (S-09), read back as the host's screen does.
    // A nick nobody tried yet, so the join below does not depend on whether the 51st got in.
    seed(await removePlayer(host.client, room.id, "Gracz 50"), "Usuń for Gracz 50");
    const { linkToken: linkAfterRemoval } = await readOwnRoom(host, room.id);
    joinAfterRemoval = await joinRoom(linkAfterRemoval, "Gracz 52");
    afterJoin = await roomLobby(host.client, room.id);
  });

  // Positive control: 50 players, the host included, fit, so the refusal below is the 51st's.
  it("positive control: the host and 49 guests are 50 players, as the host sees the lobby", () => {
    expect(nicksOf(at50)).toEqual(["Host", ...LOBBY_GUESTS]);
  });

  it("join_room as the 51st player gets exactly room_full, and the host still sees the same 50 players", () => {
    expect(fiftyFirst).toEqual(refusal("room_full"));
    expect(nicksOf(afterRefusals)).toEqual(["Host", ...LOBBY_GUESTS]);
  });

  // F2: a taken nick before the ceiling.
  it("join_room in the full lobby with the nick of Gracz 2, a guest of the room, gets exactly nick_taken", () => {
    expect(takenNick).toEqual(refusal("nick_taken"));
  });

  it("once the host removes Gracz 50, Gracz 52 joins: exactly { ok: true } with the room's id, last on the host's list", () => {
    expect(joinAfterRemoval).toEqual({ error: null, data: { ok: true, room_id: room.id } });
    expect(nicksOf(afterJoin).at(-1)).toBe("Gracz 52");
  });
});

describe("a full game: 49 players start, Ula is let in, Kuba, Zenon and Ewa are not, and Gracz 3 comes back", () => {
  let room: OwnRoom;
  // Each latecomer's token, as the cookie of this room would keep it, and Gracz 3's new browser.
  const ula = newPlayerToken();
  const kuba = newPlayerToken();
  const zenon = newPlayerToken();
  const ewa = newPlayerToken();
  const gracz3New = newPlayerToken();
  // Ula, who asked at 49 players, is let in.
  let admitUla: Answer;
  let at50: Answer;
  // Kuba, who asked at 49 players too.
  let admitKuba: Answer;
  let kubaState: Answer;
  let afterKuba: Answer;
  // Asking in the full room.
  let zenonAsksAgain: Answer;
  let zenonState: Answer;
  let ewaAsks: Answer;
  let ewaState: Answer;
  let takenNick: Answer;
  let kubaAsksAgain: Answer;
  let ulaAsksAgain: Answer;
  // Coming back to one's own place.
  let beforeReturn: Answer;
  let gracz3Asks: Answer;
  let admitGracz3: Answer;
  let gracz3NewView: Answer;
  let afterReturn: Answer;
  // Kuba's request, turned away in the end.
  let rejectKuba: Answer;

  beforeAll(async () => {
    room = await seedRoom(host, { confirmClose: true });
    for (const nick of GAME_GUESTS) {
      await seedGuest(room.linkToken, nick);
    }
    await seedStartGame(host, room.id);

    // At 49 players three latecomers ask, and the host turns Zenon away while a seat is still free.
    seed(await requestJoin(room.linkToken, "Ula", ula), "Ula's request");
    seed(await requestJoin(room.linkToken, "Kuba", kuba), "Kuba's request");
    seed(await requestJoin(room.linkToken, "Zenon", zenon), "Zenon's request");
    seed(await rejectLatecomer(host.client, room.id, "Zenon"), "Odrzuć for Zenon");

    // Ula is the 50th player; Kuba, who asked at 49 too, finds the room full.
    admitUla = await admitLatecomer(host.client, room.id, "Ula");
    at50 = await roomLobby(host.client, room.id);
    admitKuba = await admitLatecomer(host.client, room.id, "Kuba");
    kubaState = await joinRequestState(room.id, kuba);
    afterKuba = await roomLobby(host.client, room.id);

    // Asking in the full room: Zenon again, his rejected request; Ewa, new; someone under a player's nick; and the form
    // sent again by Kuba, whose request waits, and by Ula, a player now.
    zenonAsksAgain = await requestJoin(room.linkToken, "Zenon", zenon);
    zenonState = await joinRequestState(room.id, zenon);
    ewaAsks = await requestJoin(room.linkToken, "Ewa", ewa);
    ewaState = await joinRequestState(room.id, ewa);
    takenNick = await requestJoin(room.linkToken, "Gracz 2", newPlayerToken());
    kubaAsksAgain = await requestJoin(room.linkToken, "Kuba", kuba);
    ulaAsksAgain = await requestJoin(room.linkToken, "Ula", ula);

    // Gracz 3 comes back on a new browser to the full room.
    beforeReturn = await roomLobby(host.client, room.id);
    gracz3Asks = await requestReturn(room.linkToken, "Gracz 3", gracz3New);
    admitGracz3 = await admitLatecomer(host.client, room.id, "Gracz 3");
    gracz3NewView = await roomLobby(anon, room.id, gracz3New);
    afterReturn = await roomLobby(host.client, room.id);

    rejectKuba = await rejectLatecomer(host.client, room.id, "Kuba");
  });

  // Positive control: a latecomer let in while a seat is free gets it, so the refusals below are the full room's.
  it("positive control: Wpuść for Ula, who asked at 49 players, gets exactly { ok: true }, and the room has 50 players, Ula last", () => {
    expect(admitUla).toEqual(OK);
    expect(nicksOf(at50)).toEqual(["Host", ...GAME_GUESTS, "Ula"]);
  });

  it("Wpuść for Kuba, who asked at 49 players, once the room has 50 gets exactly room_full; his request still waits, the room keeps its 50 players, and a leader may still turn him away", () => {
    expect(admitKuba).toEqual(refusal("room_full"));
    expect(kubaState).toEqual({ error: null, data: { state: "pending", nick: "Kuba" } });
    expect(nicksOf(afterKuba)).toEqual(["Host", ...GAME_GUESTS, "Ula"]);
    expect(fieldOf(afterKuba, "requests")).toEqual(["Kuba"]);
    expect(rejectKuba).toEqual(OK);
  });

  // F2: the branch that renews a rejected request is a write too.
  it("Zenon, turned away while a seat was free, asking again once the room has 50 gets exactly room_full, and his request stays rejected", () => {
    expect(zenonAsksAgain).toEqual(refusal("room_full"));
    expect(zenonState).toEqual({ error: null, data: { state: "rejected", nick: "Zenon" } });
  });

  it("Ewa, a new latecomer, asking once the room has 50 gets exactly room_full, and has no request", () => {
    expect(ewaAsks).toEqual(refusal("room_full"));
    expect(ewaState).toEqual({ error: null, data: { state: "none" } });
  });

  // F2: a taken nick before the ceiling.
  it("request_join in the full game with the nick of Gracz 2, a player of the room, gets exactly nick_taken", () => {
    expect(takenNick).toEqual(refusal("nick_taken"));
  });

  it.each([
    { who: "Kuba, whose request waits,", answer: () => kubaAsksAgain },
    { who: "Ula, a player of the room since Wpuść,", answer: () => ulaAsksAgain },
  ])("$who sending the form again in the full room gets exactly { ok: true }", ({ answer }) => {
    expect(answer()).toEqual(OK);
  });

  // Coming back moves a place and adds no player, so the ceiling never stands in its way. That the room is full here is
  // the Kuba test's to show: this one compares the players before and after only, so it reads the same without the
  // ceiling.
  it("Gracz 3, coming back on a new browser to the full room: request_return and Wpuść each get exactly { ok: true }, the new browser is Gracz 3's, and the room keeps the same players", () => {
    expect(gracz3Asks).toEqual(OK);
    expect(admitGracz3).toEqual(OK);
    expect(gracz3NewView).toMatchObject({ error: null, data: { status: "playing", me: "Gracz 3" } });
    expect(nicksOf(beforeReturn)).toContain("Gracz 3");
    expect(nicksOf(afterReturn)).toEqual(nicksOf(beforeReturn));
  });
});
