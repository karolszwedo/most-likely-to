import { beforeAll, describe, expect, it } from "vitest";
import { anonClient, newHost, newLinkToken, type Host } from "./support/clients";
import {
  SEED_CATEGORIES,
  isRecord,
  readOwnRoom,
  seedGuest,
  seedRoom,
  type OwnRoom,
  type SeededGuest,
} from "./support/rooms";
import {
  EVENING_QUESTION_IDS,
  HISTORY_KEYS,
  LOBBY_KEYS,
  endGame,
  gameHistory,
  keysOf,
  roomLink,
  roomLobby,
  seedStartGame,
  type Answer,
} from "./support/rounds";

// The game's language (język gry, english-version) through the roles' own doors: RPC and REST with the publishable
// key, as the signed-in host and as a guest (anon with a player token), past the Worker. Oracle: PRD FR-031 and
// decision 1 at the top of context/changes/english-version/plan.md, with its Faza 2 #1: the host picks Polish (pl) or
// English (en) at "Nowa gra"; the game's language is the start language of every player (the link's page, the room,
// the end of the game, the game's history) and fixed for the room's life; a call with no language makes a Polish game,
// as every game before it; any other language, null included, is refused (invalid_language) before anything is made or
// closed. Every language and every answer expected here is written out by hand.
//
// rooms.language, create_room's p_language and the key language in room_lobby, room_link and game_history come from
// supabase/migrations/*_game_language.sql. Without it create_room has no p_language (PGRST202 on every call with it)
// and no answer has language, so every test here is red. The column's shape and check, create_room's one version and
// grants, and the language the room stores are the creator's view to check
// (supabase/tests/round_creator_view.test.sql).
//
// Each case of an English game stands apart from the Polish ones and from the refusals, so a create_room that always
// wrote pl turns red only the English cases (the break-check of the plan's Faza 2).
//
// One sign-up per run, in beforeAll. One open room per host: the English game is ended before the Polish rooms open,
// and each next room opens with confirm_close; Vitest runs the suites in order, each suite's beforeAll right before its
// tests.

const anon = anonClient();
const [Q1] = EVENING_QUESTION_IDS;
const OK = { data: { ok: true }, error: null };

let host: Host;
// The host's open room once the Polish games are made: the refusals below must leave it open.
let openRoom: OwnRoom | undefined;

beforeAll(async () => {
  host = await newHost();
});

// The game's language of an answer (room_lobby, room_link or game_history); undefined when it has none. Never throws.
function languageOf(answer: Answer): unknown {
  return isRecord(answer.data) ? answer.data.language : undefined;
}

// The host's rooms as the host reads them through RLS, by id: the rows as they come, and the error's code, never its
// message or details.
interface RestRead {
  rows: unknown;
  code: string | null;
}

async function hostRooms(): Promise<RestRead> {
  const result = await host.client.from("rooms").select("id").order("id");
  const rows: unknown = result.data;
  return { rows, code: result.error ? result.error.code : null };
}

// "Nowa gra" as a host calling the database directly could send it, with the "guests are still in it" question
// answered: a create_room that let the language pass would close the host's open room and make a new one.
async function createRoomIn(language: string | null): Promise<Answer> {
  const created = await host.client.rpc("create_room", {
    p_nick: "Host",
    p_link_token: newLinkToken(),
    p_categories: SEED_CATEGORIES,
    p_adult_categories: [],
    p_confirm_close: true,
    p_language: language,
  });
  return { data: created.data, error: created.error };
}

// An English game: Host, Ola and Kuba, in the lobby, while the game is in play and once it is ended.
describe("a game made in English gives en to everyone, in every status, and to its link and its history", () => {
  let room: OwnRoom;
  let ola: SeededGuest;
  // The lobby.
  let hostLobby: Answer;
  let olaLobby: Answer;
  let openLink: Answer;
  // The game in play.
  let hostPlaying: Answer;
  let olaPlaying: Answer;
  let startedLink: Answer;
  // The ended game.
  let hostEnds: Answer;
  let hostClosed: Answer;
  let olaClosed: Answer;
  let closedLink: Answer;
  let history: Answer;

  beforeAll(async () => {
    room = await seedRoom(host, { language: "en" });
    ola = await seedGuest(room.linkToken, "Ola");
    await seedGuest(room.linkToken, "Kuba");
    hostLobby = await roomLobby(host.client, room.id);
    olaLobby = await roomLobby(anon, room.id, ola.playerToken);
    openLink = await roomLink(room.linkToken);

    // The database keeps no question's text, so a question of the base opens an English game's round as any other.
    await seedStartGame(host, room.id, Q1);
    hostPlaying = await roomLobby(host.client, room.id);
    olaPlaying = await roomLobby(anon, room.id, ola.playerToken);
    startedLink = await roomLink(room.linkToken);

    hostEnds = await endGame(host.client, room.id);
    hostClosed = await roomLobby(host.client, room.id);
    olaClosed = await roomLobby(anon, room.id, ola.playerToken);
    closedLink = await roomLink(room.linkToken);
    history = await gameHistory(host.client, room.id);
  });

  // Positive control: the room was made with p_language and its host reads its state, or a wrong address would look
  // like a game with no language everywhere. It reads no language, so a room made in the wrong one leaves it green.
  it("positive control: create_room with p_language en makes the room, and its host reads its state in the lobby", () => {
    expect(hostLobby).toMatchObject({ error: null, data: { status: "lobby", role: "host", me: "Host" } });
  });

  it.each([
    { status: "lobby", expected: "lobby", state: () => hostLobby },
    { status: "game in play", expected: "playing", state: () => hostPlaying },
    { status: "ended game", expected: "closed", state: () => hostClosed },
  ])("the host's state in the $status says en", ({ expected, state }) => {
    expect(state()).toMatchObject({ error: null, data: { status: expected, role: "host" } });
    expect(languageOf(state())).toBe("en");
  });

  // Decision 1: the start language of every player, a guest's too.
  it.each([
    { status: "lobby", expected: "lobby", state: () => olaLobby },
    { status: "game in play", expected: "playing", state: () => olaPlaying },
    { status: "ended game", expected: "closed", state: () => olaClosed },
  ])("Ola, a guest, gets en in the $status", ({ expected, state }) => {
    expect(state()).toMatchObject({ error: null, data: { status: expected, role: "guest", me: "Ola" } });
    expect(languageOf(state())).toBe("en");
  });

  // Exact keys (test-plan §6.3): language is the one key the game's language adds to a guest's state.
  it("Ola's state while the game is in play has exactly the lobby's keys, language among them", () => {
    expect(keysOf(olaPlaying.data)).toEqual(LOBBY_KEYS);
  });

  // The link's page and its card on Discord speak the game's language before anyone comes in; a closed room's link
  // still names no room.
  it("room_link of the English game in the lobby is exactly { status: open, room_id, language: en }", () => {
    expect(openLink).toEqual({ data: { status: "open", room_id: room.id, language: "en" }, error: null });
  });

  it("room_link of the English game in play is exactly { status: started, room_id, language: en }", () => {
    expect(startedLink).toEqual({ data: { status: "started", room_id: room.id, language: "en" }, error: null });
  });

  it("room_link of the ended English game is exactly { status: closed, language: en }", () => {
    expect(hostEnds).toEqual(OK);
    expect(closedLink).toEqual({ data: { status: "closed", language: "en" }, error: null });
  });

  it("game_history of the ended English game says en, with exactly the history's keys", () => {
    expect(history).toMatchObject({ error: null, data: { ok: true, me: "Host", language: "en" } });
    expect(keysOf(history.data)).toEqual(HISTORY_KEYS);
  });
});

// Polish games: one made with no p_language, as the Worker deployed before the migration and every older call sends
// it, and then one made with p_language pl, as the Worker sends it since; the second closes the first.
describe("a game made with no language, or with pl, is Polish", () => {
  let noLanguage: OwnRoom;
  let noLanguageLobby: Answer;
  let noLanguageLink: Answer;
  let polish: OwnRoom;
  let polishLobby: Answer;
  let polishLink: Answer;

  beforeAll(async () => {
    noLanguage = await seedRoom(host, { confirmClose: true });
    noLanguageLobby = await roomLobby(host.client, noLanguage.id);
    noLanguageLink = await roomLink(noLanguage.linkToken);
    polish = await seedRoom(host, { confirmClose: true, language: "pl" });
    polishLobby = await roomLobby(host.client, polish.id);
    polishLink = await roomLink(polish.linkToken);
    openRoom = polish;
  });

  it("create_room with no p_language makes a room whose state says pl, and whose link is exactly { status: open, room_id, language: pl }", () => {
    expect(noLanguageLobby).toMatchObject({ error: null, data: { status: "lobby", role: "host", language: "pl" } });
    expect(noLanguageLink).toEqual({ data: { status: "open", room_id: noLanguage.id, language: "pl" }, error: null });
  });

  it("create_room with p_language pl makes a room whose state says pl, and whose link is exactly { status: open, room_id, language: pl }", () => {
    expect(polishLobby).toMatchObject({ error: null, data: { status: "lobby", role: "host", language: "pl" } });
    expect(polishLink).toEqual({ data: { status: "open", room_id: polish.id, language: "pl" }, error: null });
  });
});

// Refusals, while the Polish room above is the host's open room: each answer, then the host's rooms and the open room
// right after, the same as right before.
describe("create_room with any other language gets invalid_language, and makes and closes nothing", () => {
  const LANGUAGES = ["de", null, "EN", "pl-PL", ""];
  let roomsBefore: RestRead;
  let answers: Answer[];
  let roomsAfter: RestRead;
  let openRoomAfter: OwnRoom;

  beforeAll(async () => {
    if (!openRoom) throw new Error("precondition failed: the host has no open Polish room");
    roomsBefore = await hostRooms();
    answers = [];
    for (const language of LANGUAGES) {
      answers.push(await createRoomIn(language));
    }
    roomsAfter = await hostRooms();
    openRoomAfter = await readOwnRoom(host, openRoom.id);
  });

  it.each(LANGUAGES.map((language, index) => ({ language: JSON.stringify(language), index })))(
    "create_room with p_language $language gets exactly { ok: false, reason: invalid_language }",
    ({ index }) => {
      expect(answers[index]).toEqual({ data: { ok: false, reason: "invalid_language" }, error: null });
    },
  );

  // Positive control of the REST read: the host's three games of this file, the English one and the two Polish ones.
  it("after those refusals the host has the same three rooms as before, and its open room is still in the lobby", () => {
    expect(roomsBefore.code).toBeNull();
    expect(roomsBefore.rows).toHaveLength(3);
    expect(roomsAfter).toEqual(roomsBefore);
    expect(openRoomAfter).toMatchObject({ id: openRoom?.id, status: "lobby" });
  });
});
