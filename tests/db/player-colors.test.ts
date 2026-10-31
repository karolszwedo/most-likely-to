import { beforeAll, describe, expect, it } from "vitest";
import { anonClient, newHost, newPlayerToken, type Host } from "./support/clients";
import { isRecord, readOwnRoom, seedGuest, seedRoom, type SeededGuest } from "./support/rooms";
import { admitLatecomer, requestJoin, roomLobby, seedStartGame, setPlayerColor, type Answer } from "./support/rounds";

// The player's colour (S-18) through the roles' own doors: RPC with the publishable key, as the room's guests (anon
// with a player token), as a latecomer let in mid-game and as the signed-in host, past the Worker. Oracle: PRD FR-025
// (each player picks their colour from the game's palette in the room; while the room has at most 20 players no two
// share a colour, and a player who has not picked gets the first free one) and the owner's decisions 1-6 in
// context/changes/player-color-choice/research.md ("Decyzje do planu"): the first free colour on the way in, so the
// host has 0; a player changes their own colour, in the lobby and while the game is in play, the host on the same
// rules; a colour another player has is taken, and of two asking for the same free colour at once only one gets it;
// from the 21st player on colours repeat. The refusals and their order are written in
// context/changes/player-color-choice/plan.md (Faza 1 #1). Every colour, nick and refusal expected here is written out
// by hand from the scenario, never computed; where a refusal must change nothing, the test compares the colours right
// before and right after it.
//
// players.color, private.free_color, set_player_color and room_lobby's color come from
// supabase/migrations/*_player_color_choice.sql. Without it PostgREST answers set_player_color with PGRST202 (no such
// function), room_lobby gives no color, and every test here is red on its own probe or on the state it reads.
//
// One sign-up per run, in beforeAll. One open room per host, so the second room opens with confirm_close, which closes
// the first one: that closed room is where room_closed is checked. Vitest runs the suites in order, each suite's
// beforeAll right before its tests.

const anon = anonClient();
// Not a player token: the Worker sends the cookie's 32-byte one or none.
const MALFORMED_TOKEN = "not-a-player-token";
const OK = { data: { ok: true }, error: null };

let host: Host;
// The first room and Ola's token there: the room the second one closes, and the second room's stranger.
let firstRoomId: string;
let olaToken: string;

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

// The players of a room_lobby answer, in seat order; [] when it has none (a failed call included). Never throws.
function playersOf(answer: Answer): Record<string, unknown>[] {
  const players: unknown = isRecord(answer.data) ? answer.data.players : null;
  return Array.isArray(players) ? (players as unknown[]).filter(isRecord) : [];
}

// The colour of the player with that nick in a room_lobby answer; undefined when there is no such player.
function colorOf(answer: Answer, nick: string): unknown {
  return playersOf(answer).find((player) => player.nick === nick)?.color;
}

// Every player's colour in a room_lobby answer, in seat order.
function colorsOf(answer: Answer): unknown[] {
  return playersOf(answer).map((player) => player.color);
}

// The first room plays out once, in order, in beforeAll: every pick of a colour, every way in and every refused try
// between them. Each step's answer is kept and checked by its own test, so no test depends on another one having run.
describe("a game of colours: Host, Ola and Kuba come in, Ola and the host pick theirs, Ewa joins, Ula is let in", () => {
  // Each latecomer's token, as the cookie of this room would keep it.
  const ula = newPlayerToken();
  const hania = newPlayerToken();
  // The lobby as each of the first three sees it.
  let hostFirst: Answer;
  let olaFirst: Answer;
  let kubaFirst: Answer;
  // Ola picks 7, then Ewa joins.
  let olaPicks7: Answer;
  let afterOla: Answer;
  let afterEwa: Answer;
  // The host picks 5, twice.
  let hostPicks5: Answer;
  let hostPicks5Again: Answer;
  let afterHost: Answer;
  // Kuba asks for Ola's 7.
  let kubaPicks7: Answer;
  let afterKuba: Answer;
  // The host and Ola ask for 9 at once.
  let bothPick9: Answer[];
  let afterBoth: Answer;
  // The game in play.
  let kubaPicks0: Answer;
  let afterKubaInGame: Answer;
  let haniaWaitingPicks: Answer;
  let afterUla: Answer;

  beforeAll(async () => {
    const room = await seedRoom(host);
    const ola = await seedGuest(room.linkToken, "Ola");
    const kuba = await seedGuest(room.linkToken, "Kuba");
    firstRoomId = room.id;
    olaToken = ola.playerToken;

    hostFirst = await roomLobby(host.client, room.id);
    olaFirst = await roomLobby(anon, room.id, ola.playerToken);
    kubaFirst = await roomLobby(anon, room.id, kuba.playerToken);

    // Ola leaves 1 for 7. Ewa then joins at seat 4, whose colour would be 3 if colours still came from seats.
    olaPicks7 = await setPlayerColor(anon, room.id, 7, ola.playerToken);
    afterOla = await roomLobby(host.client, room.id);
    await seedGuest(room.linkToken, "Ewa");
    afterEwa = await roomLobby(host.client, room.id);

    // The host leaves 0 for 5, then sends 5 again (a double click).
    hostPicks5 = await setPlayerColor(host.client, room.id, 5);
    hostPicks5Again = await setPlayerColor(host.client, room.id, 5);
    afterHost = await roomLobby(host.client, room.id);

    kubaPicks7 = await setPlayerColor(anon, room.id, 7, kuba.playerToken);
    afterKuba = await roomLobby(host.client, room.id);

    // The free 9, asked for by the host and Ola at the same moment: only the room's lock decides who gets it. The
    // colours they would leave, 5 and 7, are both above 2, so Ula's colour below does not depend on who wins.
    bothPick9 = await Promise.all([
      setPlayerColor(host.client, room.id, 9),
      setPlayerColor(anon, room.id, 9, ola.playerToken),
    ]);
    afterBoth = await roomLobby(host.client, room.id);

    // The game in play: Kuba leaves 2 for the 0 the host left; Hania asks and waits; Ula is let in.
    await seedStartGame(host, room.id);
    kubaPicks0 = await setPlayerColor(anon, room.id, 0, kuba.playerToken);
    afterKubaInGame = await roomLobby(host.client, room.id);
    mustAccept("Ula's request", await requestJoin(room.linkToken, "Ula", ula));
    mustAccept("Hania's request", await requestJoin(room.linkToken, "Hania", hania));
    // 3 is free: only who she is can refuse it.
    haniaWaitingPicks = await setPlayerColor(anon, room.id, 3, hania);
    mustAccept("Wpuść for Ula", await admitLatecomer(host.client, room.id, "Ula"));
    afterUla = await roomLobby(host.client, room.id);
  });

  // Positive control: the colours must be there to be read, or a wrong address would look like a missing colour
  // everywhere.
  it("positive control: the host, Ola and Kuba come in with colours 0, 1 and 2, as each of them sees the lobby", () => {
    const players = [
      { nick: "Host", color: 0 },
      { nick: "Ola", color: 1 },
      { nick: "Kuba", color: 2 },
    ];

    expect(hostFirst).toMatchObject({ error: null, data: { status: "lobby", role: "host", players } });
    expect(olaFirst).toMatchObject({ error: null, data: { status: "lobby", me: "Ola", players } });
    expect(kubaFirst).toMatchObject({ error: null, data: { status: "lobby", me: "Kuba", players } });
  });

  it("Ola, a guest with her token, picks the free 7: exactly { ok: true }, and the host's state shows her with 7", () => {
    expect(olaPicks7).toEqual(OK);
    expect(colorOf(afterOla, "Ola")).toBe(7);
  });

  // The first free colour, not the next seat's.
  it("Ewa, joining once Ola has left 1, gets 1, the lowest free colour", () => {
    expect(afterEwa).toMatchObject({
      error: null,
      data: {
        players: [
          { nick: "Host", color: 0 },
          { nick: "Ola", color: 7 },
          { nick: "Kuba", color: 2 },
          { nick: "Ewa", color: 1 },
        ],
      },
    });
  });

  // Decision 4: the host picks on the same rules, by its session.
  it("the host, by its session, picks 5 and then 5 again: each exactly { ok: true }, and its row shows 5", () => {
    expect(hostPicks5).toEqual(OK);
    expect(hostPicks5Again).toEqual(OK);
    expect(colorOf(afterHost, "Host")).toBe(5);
  });

  // Decision 3: another player's colour is taken, and the refusal changes nothing.
  it("Kuba asking for Ola's 7 gets color_taken, and every player keeps the colour they had right before", () => {
    expect(kubaPicks7).toMatchObject({ error: null, data: { ok: false, reason: "color_taken" } });
    expect(colorsOf(afterHost)).toHaveLength(4);
    expect(colorsOf(afterKuba)).toEqual(colorsOf(afterHost));
  });

  // Decision 3: of two asking for the same free colour at once, one gets it. Which one is the race's; how many is not.
  it("the host and Ola asking for the free 9 at once get exactly 1 × ok and 1 × color_taken, and 9 is one player's", () => {
    expect(bothPick9.map(outcomeOf).sort()).toEqual(["color_taken", "ok"]);
    expect(colorsOf(afterBoth).filter((color) => color === 9)).toHaveLength(1);
  });

  // Decision 2: in the lobby and while the game is in play.
  it("while the game is in play Kuba picks the 0 the host left: exactly { ok: true }, and his row shows 0", () => {
    expect(kubaPicks0).toEqual(OK);
    expect(afterKubaInGame).toMatchObject({ error: null, data: { status: "playing" } });
    expect(colorOf(afterKubaInGame, "Kuba")).toBe(0);
  });

  // The first free colour for a latecomer let in too: Kuba has 0, Ewa 1, and the host and Ola are above 2.
  it("Ula, let in while the game is in play, gets 2, the lowest free colour", () => {
    expect(afterUla).toMatchObject({
      error: null,
      data: {
        players: [
          { nick: "Host" },
          { nick: "Ola" },
          { nick: "Kuba", color: 0 },
          { nick: "Ewa", color: 1 },
          { nick: "Ula", color: 2 },
        ],
      },
    });
  });

  // A latecomer still waiting has no player row, so no colour of their own.
  it("Hania, a latecomer still waiting, asking for a free colour gets room_unknown", () => {
    expect(haniaWaitingPicks).toMatchObject({ error: null, data: { ok: false, reason: "room_unknown" } });
  });
});

// The second room: opening it closes the first one, strangers and malformed calls are refused at its door, and it
// fills up to 22 players. Each nick carries its seat: "Gracz 2" sits right after the host.
describe("a second room: the first one closed, refusals at the door, and 22 players", () => {
  let roomId: string;
  let second: SeededGuest;
  // The first room, closed now.
  let olaInClosed: Answer;
  let hostInClosed: Answer;
  // The room filling up.
  let at20: Answer;
  let at21: Answer;
  let twentyFirstPicks: Answer[];
  let at22: Answer;

  beforeAll(async () => {
    const room = await seedRoom(host, { confirmClose: true });
    roomId = room.id;
    if ((await readOwnRoom(host, firstRoomId)).status !== "closed") {
      throw new Error("precondition failed: opening the second room did not close the first one");
    }
    // 3 is free in the first room: only its status can refuse it.
    olaInClosed = await setPlayerColor(anon, firstRoomId, 3, olaToken);
    hostInClosed = await setPlayerColor(host.client, firstRoomId, 3);

    // One after another, so the seats follow the order of joining.
    second = await seedGuest(room.linkToken, "Gracz 2");
    for (let seat = 3; seat <= 20; seat++) {
      await seedGuest(room.linkToken, `Gracz ${seat}`);
    }
    at20 = await roomLobby(host.client, room.id);
    const twentyFirst = await seedGuest(room.linkToken, "Gracz 21");
    at21 = await roomLobby(host.client, room.id);

    // The 21st player asks for every other colour of the palette, one after another.
    twentyFirstPicks = [];
    for (let color = 1; color <= 19; color++) {
      twentyFirstPicks.push(await setPlayerColor(anon, room.id, color, twentyFirst.playerToken));
    }
    await seedGuest(room.linkToken, "Gracz 22");
    at22 = await roomLobby(host.client, room.id);
  });

  it.each([
    { player: "Ola, with her token of the first room,", answer: () => olaInClosed },
    { player: "the first room's host", answer: () => hostInClosed },
  ])("$player asking for a free colour there once it is closed gets room_closed", ({ answer }) => {
    expect(answer()).toMatchObject({ error: null, data: { ok: false, reason: "room_closed" } });
  });

  // FR-025: up to 20 players no two share a colour. Nobody here changes theirs before the 21st comes, so the colours
  // follow the seats.
  it("20 players have 20 different colours: 0 to 19 in seat order", () => {
    expect(colorsOf(at20)).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19]);
  });

  // Decision 6: from the 21st player on, colours repeat.
  it("the 21st player gets 0 and the 22nd gets 1", () => {
    expect(colorOf(at21, "Gracz 21")).toBe(0);
    expect(colorOf(at22, "Gracz 22")).toBe(1);
  });

  // With 21 players every colour is someone's, so every change to another colour is refused.
  it("the 21st player asking for each of the 19 other colours gets color_taken every time, and keeps 0", () => {
    expect(twentyFirstPicks.map(outcomeOf)).toEqual(Array.from({ length: 19 }, () => "color_taken"));
    expect(colorOf(at22, "Gracz 21")).toBe(0);
  });

  // A colour changes only through set_player_color: the host reads players through RLS and has no update on it.
  it("the host cannot change a colour over REST: updating Gracz 2's color gets 42501, and the row stays as it was", async () => {
    const read = () => host.client.from("players").select("nick, color").eq("room_id", roomId).eq("nick", "Gracz 2");
    const before = await read();
    const update = await host.client.from("players").update({ color: 7 }).eq("room_id", roomId).eq("nick", "Gracz 2");
    const after = await read();
    const rowsBefore: unknown = before.data;
    const rowsAfter: unknown = after.data;

    expect(update.error?.code).toBe("42501");
    expect(before.error).toBeNull();
    expect(after.error).toBeNull();
    expect(Array.isArray(rowsBefore) ? rowsBefore.length : null).toBe(1);
    expect(rowsAfter).toEqual(rowsBefore);
  });

  // Only a player of the room changes a colour in it: anyone else learns nothing about the room.
  it.each([
    { who: "someone with no token", attempt: () => setPlayerColor(anon, roomId, 1) },
    { who: "Ola, with her token of the first room,", attempt: () => setPlayerColor(anon, roomId, 1, olaToken) },
  ])("$who asking for a colour here gets room_unknown", async ({ attempt }) => {
    expect(await attempt()).toMatchObject({ error: null, data: { ok: false, reason: "room_unknown" } });
  });

  // Not our client's input: an exception, as for a malformed token in a vote, with no row's values in details.
  it.each([
    { what: "colour -1", attempt: () => setPlayerColor(anon, roomId, -1, second.playerToken) },
    { what: "colour 20", attempt: () => setPlayerColor(anon, roomId, 20, second.playerToken) },
    { what: "no colour (null)", attempt: () => setPlayerColor(anon, roomId, null, second.playerToken) },
    { what: "a malformed player token", attempt: () => setPlayerColor(anon, roomId, 1, MALFORMED_TOKEN) },
  ])("asking with $what is refused with 22023", async ({ attempt }) => {
    expect(await attempt()).toMatchObject({ data: null, error: { code: "22023", details: null } });
  });
});
