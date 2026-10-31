import type { SupabaseClient } from "@supabase/supabase-js";
import { describe, expect, it } from "vitest";
import { leaderSelection, roomView } from "@/lib/rooms/server";
import {
  parseJoinRequestState,
  parseLobbyState,
  parseRoomView,
  questionLength,
  type LobbyState,
} from "@/lib/rooms/shared";

// The room's state as room_lobby returns it, and as the room screen gets it from the Worker (with the question's
// text). Every new state goes through one parser that names the field that did not pass (audit P6, L4): a database and
// a Worker out of step must give a log line that says which field, not "an unexpected shape", and an island must not
// render a shape it does not know. The fixtures are written by hand from the round's contract
// (context/archive/2026-10-13-first-live-round/plan.md, Faza 1 #4;
// context/archive/2026-10-15-full-game-evening/plan.md, Faza 1 #2 and Faza 3 #2;
// context/archive/2026-10-22-latecomer-admission/plan.md, Faza 1 #1: requests and round.eligible;
// context/archive/2026-10-24-question-list-review/plan.md, Faza 1 #1 and Faza 2 #1: question_list, round.question_text
// and the view's questions; context/archive/2026-10-25-game-summary/plan.md, Faza 1 #1 and Faza 2 #1: game_totals and
// the view's summary; context/changes/co-host-role/plan.md, Faza 1 #1 and Faza 2 #1: players[].cohost, leader_draw and
// the view's leader; context/changes/player-color-choice/plan.md, Faza 1 #1 and Faza 2 #1: players[].color;
// tests/db/support/rounds.ts, the exact key sets), never from the parser.

// color: each player's stored colour, here the first free one on the way in (the host 0, then 1 and 2).
const PLAYERS = [
  { nick: "Ola", host: true, cohost: false, color: 0 },
  { nick: "Bartek", host: false, cohost: false, color: 1 },
  { nick: "Kuba", host: false, cohost: false, color: 2 },
];
// S-18: the players' stored colours, not their places: Bartek picked the palette's last colour, 19, and Kuba 7.
const PICKED_PLAYERS = [
  { nick: "Ola", host: true, cohost: false, color: 0 },
  { nick: "Bartek", host: false, cohost: false, color: 19 },
  { nick: "Kuba", host: false, cohost: false, color: 7 },
];

// S-07: what a leader's moves need, for the host and a co-host only; null for anyone else. The room has no game's
// question list, so both of its numbers are 0.
const LEADER_DRAW = {
  categories: ["na-co-dzien", "przyszlosc"],
  adult_categories: ["przyszlosc"],
  list_entries: 0,
  list_base_count: 0,
};

// requests: the latecomers waiting, for a leader only; anyone else always gets []. question_list: the game's question
// list, for the host of a room with one only; null for a guest and before the host opens it. game_totals: the sums of
// a closed game's reveals, for everyone; null in every other status and for a closed room with no reveal. leader_draw:
// for a leader, in every status.
const LOBBY = {
  status: "lobby",
  role: "host",
  me: "Ola",
  players: PLAYERS,
  round: null,
  requests: [],
  question_list: null,
  game_totals: null,
  leader_draw: LEADER_DRAW,
};
const CLOSED = {
  status: "closed",
  role: "guest",
  me: "Bartek",
  players: PLAYERS,
  round: null,
  requests: [],
  question_list: null,
  game_totals: null,
  leader_draw: null,
};
// question_text: null for a question of the base, which the round names by its id.
const VOTING_ROUND = {
  number: 1,
  question_id: "na-co-dzien-001",
  question_text: null,
  phase: "voting",
  eligible: ["Ola", "Bartek", "Kuba"],
  voted: ["Ola", "Kuba"],
  me_voted: true,
  after_skip: false,
};
const VOTING = {
  status: "playing",
  role: "guest",
  me: "Kuba",
  players: PLAYERS,
  round: VOTING_ROUND,
  requests: [],
  question_list: null,
  game_totals: null,
  leader_draw: null,
};
// S-08: Kuba was let in after the round opened, so he is among the players but not among those who may vote in it;
// the host sees two latecomers still waiting, in the order of asking.
const LATECOMER_ROUND = { ...VOTING_ROUND, eligible: ["Ola", "Bartek"], voted: ["Ola"], me_voted: true };
const HOST_WITH_REQUESTS = {
  status: "playing",
  role: "host",
  me: "Ola",
  players: PLAYERS,
  round: LATECOMER_ROUND,
  requests: ["Zosia", "Igor"],
  question_list: null,
  game_totals: null,
  leader_draw: LEADER_DRAW,
};
// S-07: the host gave Bartek, a guest, the co-host role. Everyone sees it by his nick; he leads as the host does, so he
// gets the latecomers waiting and what a leader's moves need, but never the game's question list. Kuba, a guest
// without the role, sees the same players and nothing a leader gets.
const COHOST_PLAYERS = [
  { nick: "Ola", host: true, cohost: false, color: 0 },
  { nick: "Bartek", host: false, cohost: true, color: 1 },
  { nick: "Kuba", host: false, cohost: false, color: 2 },
];
const COHOST = {
  status: "playing",
  role: "guest",
  me: "Bartek",
  players: COHOST_PLAYERS,
  round: VOTING_ROUND,
  requests: ["Zosia"],
  question_list: null,
  game_totals: null,
  leader_draw: LEADER_DRAW,
};
const BESIDE_COHOST = { ...VOTING, players: COHOST_PLAYERS };
// Every eligible player in seat order, zeros included; one abstention among four ballots.
const REVEALED_ROUND = {
  number: 1,
  question_id: "na-co-dzien-001",
  question_text: null,
  phase: "revealed",
  results: [
    { nick: "Ola", votes: 2 },
    { nick: "Bartek", votes: 0 },
    { nick: "Kuba", votes: 1 },
  ],
  abstained: 1,
  ballots: 4,
};
const REVEALED = {
  status: "playing",
  role: "host",
  me: "Ola",
  players: PLAYERS,
  round: REVEALED_ROUND,
  requests: [],
  question_list: null,
  game_totals: null,
  leader_draw: LEADER_DRAW,
};
// S-03: the host skipped the last question of the pool, so the skipped round stays the latest one. Its votes are gone:
// only its number and phase.
const SKIPPED_ROUND = { number: 4, phase: "skipped" };
const SKIPPED = {
  status: "playing",
  role: "guest",
  me: "Bartek",
  players: PLAYERS,
  round: SKIPPED_ROUND,
  requests: [],
  question_list: null,
  game_totals: null,
  leader_draw: null,
};
// The round after a skip says so to every screen, including one that slept through the skip.
const AFTER_SKIP_ROUND = { ...VOTING_ROUND, number: 3, after_skip: true };
const AFTER_SKIP = { ...VOTING, round: AFTER_SKIP_ROUND };

const QUESTION = "spóźniłby się na własne urodziny";
const REWORDED = "wypiłby mleko prosto z kartonu";
const OWN_QUESTION = "zgubiłby klucze w drodze do domu";

// S-06: the host's game's question list after "Przejrzyj pytania", shortened: entry 1 reworded (its question id stays),
// entry 2 removed (gone from the entries, still counted in base_count), entry 3 as drawn, entries 4-15 left out here,
// and the host's own question 16. base_count: the 15 drawn rows, the removed and the reworded one included.
const QUESTION_LIST = {
  entries: [
    { position: 1, question_id: "na-co-dzien-001", text: REWORDED },
    { position: 3, question_id: "na-co-dzien-003", text: null },
    { position: 16, question_id: null, text: OWN_QUESTION },
  ],
  base_count: 15,
};
// The leader's draw with that list: its 3 entries not removed and its 15 rows with a question id of the base.
const LIST_DRAW = { ...LEADER_DRAW, list_entries: 3, list_base_count: 15 };
const LOBBY_WITH_LIST = { ...LOBBY, question_list: QUESTION_LIST, leader_draw: LIST_DRAW };
// During the game the host still gets the list.
const REVEALED_WITH_LIST = { ...REVEALED, question_list: QUESTION_LIST, leader_draw: LIST_DRAW };
// A round of an own or reworded question of the list has no question id, only the host's text, for every player.
const OWN_ROUND = { ...VOTING_ROUND, question_id: null, question_text: REWORDED };
const OWN = { ...VOTING, round: OWN_ROUND };
const OWN_REVEALED_ROUND = { ...REVEALED_ROUND, question_id: null, question_text: OWN_QUESTION };
const OWN_REVEALED = { ...REVEALED, round: OWN_REVEALED_ROUND };

// S-15: a game of two reveals, closed. Ola and Bartek could vote and be voted for in both; between them Ola got 2 votes
// and Bartek none (2 abstentions). Kuba was let in after the last reveal, so he has no result anywhere and no entry.
const GAME_TOTALS = {
  revealed: 2,
  totals: [
    { nick: "Ola", votes: 2 },
    { nick: "Bartek", votes: 0 },
  ],
};
const CLOSED_AFTER_GAME = { ...CLOSED, game_totals: GAME_TOTALS };
// The same for the host, who also sees it.
const CLOSED_AFTER_GAME_HOST = { ...CLOSED_AFTER_GAME, role: "host", me: "Ola", leader_draw: LEADER_DRAW };

function withTotals(totals: unknown, state: Record<string, unknown> = CLOSED): Record<string, unknown> {
  return { ...state, game_totals: totals };
}

// The host's lobby with the leader's draw given, or with its fields given.
function withDraw(draw: unknown): Record<string, unknown> {
  return { ...LOBBY, leader_draw: draw };
}

function withDrawFields(fields: Record<string, unknown>): Record<string, unknown> {
  return withDraw({ ...LEADER_DRAW, ...fields });
}

function without(record: Record<string, unknown>, key: string): Record<string, unknown> {
  return Object.fromEntries(Object.entries(record).filter(([name]) => name !== key));
}

function withRound(state: Record<string, unknown>, round: Record<string, unknown>): Record<string, unknown> {
  return { ...state, round };
}

function withList(list: unknown): Record<string, unknown> {
  return { ...LOBBY, question_list: list };
}

// The list with one entry, entry 3 with the fields given.
function withEntry(fields: Record<string, unknown>): Record<string, unknown> {
  return withList({ ...QUESTION_LIST, entries: [{ ...QUESTION_LIST.entries[1], ...fields }] });
}

describe("parseLobbyState", () => {
  it.each([
    { why: "the lobby", state: LOBBY },
    { why: "a closed room", state: CLOSED },
    { why: "a round open for votes", state: VOTING },
    { why: "a revealed round", state: REVEALED },
    { why: "a skipped round", state: SKIPPED },
    { why: "a round after a skip", state: AFTER_SKIP },
    { why: "a round with a latecomer let in after it opened, for the host with requests", state: HOST_WITH_REQUESTS },
    { why: "the host's lobby with the game's question list", state: LOBBY_WITH_LIST },
    { why: "a revealed round for the host with the game's question list", state: REVEALED_WITH_LIST },
    { why: "a list whose every entry is removed", state: withList({ entries: [], base_count: 15 }) },
    { why: "a round of an own or reworded question, open for votes", state: OWN },
    { why: "a revealed round of an own question", state: OWN_REVEALED },
    { why: "a closed room after a game with reveals, for a guest", state: CLOSED_AFTER_GAME },
    { why: "a closed room after a game with reveals, for the host", state: CLOSED_AFTER_GAME_HOST },
    {
      why: "a closed room whose every reveal had no votes",
      state: withTotals({ revealed: 1, totals: [{ nick: "Ola", votes: 0 }] }),
    },
    { why: "a co-host's round, with the latecomers waiting and the leader's draw", state: COHOST },
    { why: "a round of a guest without the role, beside a co-host", state: BESIDE_COHOST },
    { why: "the leader's draw of a room with no 18+ question", state: withDrawFields({ adult_categories: [] }) },
    { why: "the lobby with colours the guests picked", state: { ...LOBBY, players: PICKED_PLAYERS } },
  ])("accepts $why as it came", ({ state }) => {
    expect(parseLobbyState(state)).toEqual({ ok: true, value: state });
  });

  // Objects, not bare values: it.each would spread an array into the test's arguments.
  it.each([{ value: null }, { value: [] }, { value: "lobby" }, { value: 1 }])(
    "names the root for a value that is not an object: $value",
    ({ value }) => {
      expect(parseLobbyState(value)).toEqual({ ok: false, field: "root" });
    },
  );

  it.each(["paused", "open", "started", "", null, 1])("names status for the unknown status %j", (status) => {
    expect(parseLobbyState({ ...LOBBY, status })).toEqual({ ok: false, field: "status" });
  });

  it.each(["status", "role", "me", "players", "round", "requests", "question_list", "game_totals", "leader_draw"])(
    "names the missing field %s",
    (field) => {
      expect(parseLobbyState(without(LOBBY, field))).toEqual({ ok: false, field });
    },
  );

  // Likewise a database without the co-host role (before *_co_host_role.sql): its players have no cohost and its
  // state no leader_draw, which is not read as "nobody leads" for the guest nor for the host.
  it.each([{ state: COHOST }, { state: BESIDE_COHOST }, { state: SKIPPED }, { state: CLOSED_AFTER_GAME_HOST }])(
    "names leader_draw when a $state.status room's state has none",
    ({ state }) => {
      expect(parseLobbyState(without(state, "leader_draw"))).toEqual({ ok: false, field: "leader_draw" });
    },
  );

  it.each([{ state: LOBBY }, { state: COHOST }, { state: CLOSED }])(
    "names players.cohost when a $state.status room's players have none",
    ({ state }) => {
      const players = state.players.map((player) => without(player, "cohost"));
      expect(parseLobbyState({ ...state, players })).toEqual({ ok: false, field: "players.cohost" });
    },
  );

  // Likewise a database without the player's colour (before *_player_color_choice.sql): its players have no color,
  // which is not read as colour 0 nor as the colour of the place at the table.
  it.each([{ state: LOBBY }, { state: VOTING }, { state: CLOSED }])(
    "names players.color when a $state.status room's players have none",
    ({ state }) => {
      const players = state.players.map((player) => without(player, "color"));
      expect(parseLobbyState({ ...state, players })).toEqual({ ok: false, field: "players.color" });
    },
  );

  // A colour of the game's palette only: a whole number from 0 to 19, as the database's check has it.
  it.each([-1, 20, 1.5, "3", null, true])("names players.color for the colour %j", (color) => {
    expect(parseLobbyState({ ...LOBBY, players: [{ ...PLAYERS[0], color }] })).toEqual({
      ok: false,
      field: "players.color",
    });
  });

  // A database without requests (the Worker deployed before the migration) is refused in every status, not read as
  // "nobody waits".
  it.each([{ state: VOTING }, { state: SKIPPED }, { state: CLOSED }])(
    "names requests when a $state.status room's state has none",
    ({ state }) => {
      expect(parseLobbyState(without(state, "requests"))).toEqual({ ok: false, field: "requests" });
    },
  );

  // Likewise a database without the game's question list (before *_question_list_review.sql): not read as "no list".
  it.each([{ state: REVEALED }, { state: SKIPPED }, { state: CLOSED }])(
    "names question_list when a $state.status room's state has none",
    ({ state }) => {
      expect(parseLobbyState(without(state, "question_list"))).toEqual({ ok: false, field: "question_list" });
    },
  );

  // Likewise a database without the sums of the reveals (before *_game_summary.sql): not read as "no reveal".
  it.each([{ state: REVEALED }, { state: SKIPPED }, { state: CLOSED }, { state: CLOSED_AFTER_GAME }])(
    "names game_totals when a $state.status room's state has none",
    ({ state }) => {
      expect(parseLobbyState(without(state, "game_totals"))).toEqual({ ok: false, field: "game_totals" });
    },
  );

  // The sums come only once the room is closed: in the lobby and while the game is in play, after a reveal too, the
  // database has none to give.
  it.each([
    { why: "the lobby", state: withTotals(GAME_TOTALS, LOBBY) },
    { why: "a round open for votes", state: withTotals(GAME_TOTALS, VOTING) },
    { why: "a revealed round", state: withTotals(GAME_TOTALS, REVEALED) },
    { why: "a skipped round", state: withTotals(GAME_TOTALS, SKIPPED) },
  ])("names game_totals for sums in $why", ({ state }) => {
    expect(parseLobbyState(state)).toEqual({ ok: false, field: "game_totals" });
  });

  it.each([
    { field: "game_totals", totals: [] },
    { field: "game_totals", totals: "Ola" },
    { field: "game_totals", totals: 2 },
    // A game with no reveal has no sums at all (null), never sums of 0 questions.
    { field: "game_totals.revealed", totals: { ...GAME_TOTALS, revealed: 0 } },
    { field: "game_totals.revealed", totals: { ...GAME_TOTALS, revealed: 1.5 } },
    { field: "game_totals.revealed", totals: { ...GAME_TOTALS, revealed: "2" } },
    { field: "game_totals.revealed", totals: { totals: GAME_TOTALS.totals } },
    { field: "game_totals.totals", totals: { revealed: 2 } },
    { field: "game_totals.totals", totals: { revealed: 2, totals: {} } },
    { field: "game_totals.totals", totals: { revealed: 2, totals: [null] } },
    { field: "game_totals.totals.nick", totals: { revealed: 2, totals: [{ nick: 1, votes: 2 }] } },
    { field: "game_totals.totals.nick", totals: { revealed: 2, totals: [{ votes: 2 }] } },
    { field: "game_totals.totals.votes", totals: { revealed: 2, totals: [{ nick: "Ola", votes: -1 }] } },
    { field: "game_totals.totals.votes", totals: { revealed: 2, totals: [{ nick: "Ola", votes: "2" }] } },
    { field: "game_totals.totals.votes", totals: { revealed: 2, totals: [{ nick: "Ola" }] } },
  ])("names $field for wrong sums", ({ field, totals }) => {
    expect(parseLobbyState(withTotals(totals))).toEqual({ ok: false, field });
  });

  it.each([
    { field: "role", state: { ...LOBBY, role: "admin" } },
    { field: "me", state: { ...LOBBY, me: 1 } },
    { field: "players", state: { ...LOBBY, players: {} } },
    { field: "players", state: { ...LOBBY, players: [null] } },
    { field: "players.nick", state: { ...LOBBY, players: [{ nick: 1, host: true, cohost: false, color: 0 }] } },
    { field: "players.host", state: { ...LOBBY, players: [{ nick: "Ola", host: "yes", cohost: false, color: 0 }] } },
    { field: "players.cohost", state: { ...LOBBY, players: [{ nick: "Ola", host: true, cohost: "no", color: 0 }] } },
    { field: "players.cohost", state: { ...LOBBY, players: [{ nick: "Ola", host: true, cohost: null, color: 0 }] } },
    { field: "players.cohost", state: { ...LOBBY, players: [{ nick: "Bartek", host: false, cohost: 1, color: 1 }] } },
    { field: "leader_draw", state: withDraw([]) },
    { field: "leader_draw", state: withDraw("na-co-dzien") },
    { field: "leader_draw", state: withDraw(true) },
    { field: "leader_draw.categories", state: withDrawFields({ categories: undefined }) },
    { field: "leader_draw.categories", state: withDrawFields({ categories: "na-co-dzien" }) },
    { field: "leader_draw.categories", state: withDrawFields({ categories: [1] }) },
    { field: "leader_draw.adult_categories", state: withDrawFields({ adult_categories: undefined }) },
    { field: "leader_draw.adult_categories", state: withDrawFields({ adult_categories: null }) },
    { field: "leader_draw.adult_categories", state: withDrawFields({ adult_categories: [null] }) },
    { field: "leader_draw.list_entries", state: withDrawFields({ list_entries: undefined }) },
    { field: "leader_draw.list_entries", state: withDrawFields({ list_entries: -1 }) },
    { field: "leader_draw.list_entries", state: withDrawFields({ list_entries: "3" }) },
    { field: "leader_draw.list_base_count", state: withDrawFields({ list_base_count: undefined }) },
    { field: "leader_draw.list_base_count", state: withDrawFields({ list_base_count: 1.5 }) },
    { field: "leader_draw.list_base_count", state: withDrawFields({ list_base_count: null }) },
    { field: "requests", state: { ...LOBBY, requests: null } },
    { field: "requests", state: { ...LOBBY, requests: "Zosia" } },
    { field: "requests", state: { ...LOBBY, requests: [1] } },
    // A nick only: a request with anything next to it (a token hash, a time) is not ours.
    { field: "requests", state: { ...LOBBY, requests: [{ nick: "Zosia" }] } },
    { field: "question_list", state: withList([]) },
    { field: "question_list", state: withList("na-co-dzien-001") },
    { field: "question_list.entries", state: withList({ base_count: 15 }) },
    { field: "question_list.entries", state: withList({ entries: {}, base_count: 15 }) },
    { field: "question_list.entries", state: withList({ entries: [null], base_count: 15 }) },
    { field: "question_list.entries.position", state: withEntry({ position: 0 }) },
    { field: "question_list.entries.position", state: withEntry({ position: 1.5 }) },
    { field: "question_list.entries.position", state: withEntry({ position: "3" }) },
    { field: "question_list.entries.position", state: withEntry({ position: undefined }) },
    { field: "question_list.entries.question_id", state: withEntry({ question_id: 3 }) },
    { field: "question_list.entries.question_id", state: withEntry({ question_id: undefined }) },
    { field: "question_list.entries.text", state: withEntry({ text: 1 }) },
    { field: "question_list.entries.text", state: withEntry({ text: undefined }) },
    // An entry with neither a question id nor a text is no question at all.
    { field: "question_list.entries.question_id", state: withEntry({ question_id: null, text: null }) },
    { field: "question_list.base_count", state: withList({ entries: [] }) },
    { field: "question_list.base_count", state: withList({ entries: [], base_count: -1 }) },
    { field: "question_list.base_count", state: withList({ entries: [], base_count: "15" }) },
  ])("names $field for a wrong type", ({ field, state }) => {
    expect(parseLobbyState(state)).toEqual({ ok: false, field });
  });

  // The database has a round only while a game is in play, and always one then.
  it.each([
    { why: "a round in the lobby", state: { ...LOBBY, round: VOTING_ROUND } },
    { why: "a round in a closed room", state: { ...CLOSED, round: REVEALED_ROUND } },
    { why: "no round in a game in play", state: { ...VOTING, round: null } },
    { why: "a round that is not an object", state: { ...VOTING, round: "voting" } },
  ])("names round for $why", ({ state }) => {
    expect(parseLobbyState(state)).toEqual({ ok: false, field: "round" });
  });

  it.each(["number", "question_id", "question_text", "phase", "eligible", "voted", "me_voted", "after_skip"])(
    "names the missing voting field round.%s",
    (key) => {
      expect(parseLobbyState(withRound(VOTING, without(VOTING_ROUND, key)))).toEqual({
        ok: false,
        field: `round.${key}`,
      });
    },
  );

  it.each(["number", "phase"])("names the missing skipped field round.%s", (key) => {
    expect(parseLobbyState(withRound(SKIPPED, without(SKIPPED_ROUND, key)))).toEqual({
      ok: false,
      field: `round.${key}`,
    });
  });

  it.each(["number", "question_id", "question_text", "phase", "results", "abstained", "ballots"])(
    "names the missing revealed field round.%s",
    (key) => {
      expect(parseLobbyState(withRound(REVEALED, without(REVEALED_ROUND, key)))).toEqual({
        ok: false,
        field: `round.${key}`,
      });
    },
  );

  it.each([
    { field: "round.number", round: { ...VOTING_ROUND, number: 0 } },
    { field: "round.number", round: { ...VOTING_ROUND, number: 1.5 } },
    { field: "round.number", round: { ...VOTING_ROUND, number: "1" } },
    { field: "round.question_id", round: { ...VOTING_ROUND, question_id: 1 } },
    { field: "round.question_text", round: { ...OWN_ROUND, question_text: 1 } },
    // A round with neither a question id nor a text has no question to show at all.
    { field: "round.question_id", round: { ...VOTING_ROUND, question_id: null } },
    { field: "round.question_id", round: { ...REVEALED_ROUND, question_id: null } },
    { field: "round.phase", round: { ...VOTING_ROUND, phase: "counting" } },
    { field: "round.eligible", round: { ...VOTING_ROUND, eligible: null } },
    { field: "round.eligible", round: { ...VOTING_ROUND, eligible: "Ola" } },
    { field: "round.eligible", round: { ...VOTING_ROUND, eligible: [1] } },
    { field: "round.voted", round: { ...VOTING_ROUND, voted: "Ola" } },
    { field: "round.voted", round: { ...VOTING_ROUND, voted: [1] } },
    { field: "round.me_voted", round: { ...VOTING_ROUND, me_voted: "yes" } },
    { field: "round.after_skip", round: { ...VOTING_ROUND, after_skip: "yes" } },
    { field: "round.number", round: { ...SKIPPED_ROUND, number: 0 } },
    { field: "round.results", round: { ...REVEALED_ROUND, results: {} } },
    { field: "round.results", round: { ...REVEALED_ROUND, results: [null] } },
    { field: "round.results.nick", round: { ...REVEALED_ROUND, results: [{ nick: 1, votes: 0 }] } },
    { field: "round.results.votes", round: { ...REVEALED_ROUND, results: [{ nick: "Ola", votes: -1 }] } },
    { field: "round.results.votes", round: { ...REVEALED_ROUND, results: [{ nick: "Ola", votes: "2" }] } },
    { field: "round.abstained", round: { ...REVEALED_ROUND, abstained: -1 } },
    { field: "round.ballots", round: { ...REVEALED_ROUND, ballots: "4" } },
  ])("names $field for a wrong value", ({ field, round }) => {
    expect(parseLobbyState(withRound(VOTING, round))).toEqual({ ok: false, field });
  });

  // Anonymity (test-plan #1) and decision D3 of context/archive/2026-10-15-full-game-evening/research.md: a skipped
  // round's votes are gone, so anything about them next to it (a count, who voted, even its question) means they were
  // not dropped. The state is refused, not passed on without it.
  it.each([
    { field: "round.results", round: { ...SKIPPED_ROUND, results: [{ nick: "Ola", votes: 1 }] } },
    { field: "round.abstained", round: { ...SKIPPED_ROUND, abstained: 0 } },
    { field: "round.ballots", round: { ...SKIPPED_ROUND, ballots: 1 } },
    { field: "round.voted", round: { ...SKIPPED_ROUND, voted: ["Ola"] } },
    { field: "round.eligible", round: { ...SKIPPED_ROUND, eligible: ["Ola"] } },
    { field: "round.me_voted", round: { ...SKIPPED_ROUND, me_voted: true } },
    { field: "round.question_id", round: { ...SKIPPED_ROUND, question_id: "na-co-dzien-004" } },
    { field: "round.question_text", round: { ...SKIPPED_ROUND, question_text: OWN_QUESTION } },
  ])("names $field for a skipped round that carries it", ({ field, round }) => {
    expect(parseLobbyState(withRound(SKIPPED, round))).toEqual({ ok: false, field });
  });

  // Anonymity (test-plan #1): a key outside the contract, such as counts before the reveal, never reaches a screen,
  // even if the database sent one; nor does anything of the game's question list beyond its entries and base_count (a
  // removed entry, the room's id), nor of the leader's draw beyond its categories and two numbers (the list's question
  // ids).
  it("passes on no key outside the contract", () => {
    const host = { ...VOTING, role: "host", me: "Ola", leader_draw: LIST_DRAW };
    const leaky = {
      ...host,
      link_token: "planted",
      round: { ...VOTING_ROUND, tally: { Ola: 2 }, votes: 2, list_position: 1 },
      players: [{ nick: "Ola", host: true, cohost: false, color: 0, id: "planted" }],
      request_tokens: ["planted"],
      question_list: {
        ...QUESTION_LIST,
        removed: [{ position: 2, question_id: "na-co-dzien-002" }],
        entries: [{ ...QUESTION_LIST.entries[0], removed: false, room_id: "planted" }],
      },
      leader_draw: { ...LIST_DRAW, question_ids: ["na-co-dzien-002"], room_id: "planted" },
    };

    expect(parseLobbyState(leaky)).toEqual({
      ok: true,
      value: {
        ...host,
        players: [{ nick: "Ola", host: true, cohost: false, color: 0 }],
        question_list: { entries: [QUESTION_LIST.entries[0]], base_count: 15 },
      },
    });
  });

  // Anonymity (test-plan #1): of the sums, only the number of reveals and a count per nick reach the Worker, even if
  // the database sent more (who voted for whom, a round's own counts, a player's id).
  it("passes on nothing of the sums outside the contract", () => {
    const leaky = withTotals({
      ...GAME_TOTALS,
      rounds: [{ number: 1, results: GAME_TOTALS.totals, abstained: 2 }],
      totals: [
        { nick: "Ola", votes: 2, voters: ["Bartek"], player_id: "planted" },
        { nick: "Bartek", votes: 0, voters: [] },
      ],
    });

    expect(parseLobbyState(leaky)).toEqual({ ok: true, value: CLOSED_AFTER_GAME });
  });
});

// The Worker's view keeps question_list, game_totals and leader_draw to itself and adds leader, questionsLeft,
// questions and summary. leader: whether the person leads, here true for the host (a co-host's view sets it itself).
// questionsLeft: for a leader once the latest round is revealed or skipped, whether the game has a question not played
// yet; null in every other state and for anyone who does not lead. questions: the game's question list for its host in
// the lobby, as text; null otherwise. summary: for everyone in a closed room whose game had a reveal, what the end of
// the evening shows of the sums; null otherwise.
function view(
  state: Record<string, unknown>,
  questionsLeft: boolean | null = null,
  questions: unknown[] | null = null,
  summary: Record<string, unknown> | null = null,
): Record<string, unknown> {
  const kept = without(without(without(state, "question_list"), "game_totals"), "leader_draw");
  return { ...kept, leader: state.role === "host", questionsLeft, questions, summary };
}

// QUESTION_LIST as the host's screen gets it: the host's own text of an entry, else its text from the base.
const QUESTIONS = [
  { position: 1, text: REWORDED, own: true },
  { position: 3, text: "zjadłby na śniadanie wczorajszą pizzę prosto z lodówki", own: false },
  { position: 16, text: OWN_QUESTION, own: true },
];

// GAME_TOTALS as the end of the evening gets it, written by hand: 2 questions, Ola with the most votes, Bartek with
// none; Kuba, with no entry, in neither list.
const SUMMARY = { revealed: 2, votes: 2, top: [{ nick: "Ola", votes: 2 }], unvoted: ["Bartek"] };

// The closed room's view with the summary given.
function withSummary(summary: unknown, state: Record<string, unknown> = CLOSED_AFTER_GAME): Record<string, unknown> {
  return { ...view(state), summary };
}

describe("parseRoomView", () => {
  it.each([
    { why: "the lobby", state: view(LOBBY) },
    { why: "the lobby with colours the guests picked", state: view({ ...LOBBY, players: PICKED_PLAYERS }) },
    { why: "a closed room", state: view(CLOSED) },
    { why: "a skipped round, for a guest", state: view(SKIPPED) },
    { why: "a skipped round, for the host with no question left", state: view({ ...SKIPPED, role: "host" }, false) },
  ])("accepts $why without a question", ({ state }) => {
    expect(parseRoomView(state)).toEqual({ ok: true, value: state });
  });

  it.each([
    { why: "with reveals, for a guest", state: view(CLOSED_AFTER_GAME, null, null, SUMMARY) },
    { why: "with reveals, for the host", state: view(CLOSED_AFTER_GAME_HOST, null, null, SUMMARY) },
    // Everyone abstained in every reveal: nobody has the most votes.
    {
      why: "where nobody got a vote",
      state: withSummary({ revealed: 1, votes: 0, top: [], unvoted: ["Ola", "Bartek"] }),
    },
    {
      why: "where everyone got a vote",
      state: withSummary({
        revealed: 3,
        votes: 3,
        top: [
          { nick: "Bartek", votes: 2 },
          { nick: "Ola", votes: 1 },
        ],
        unvoted: [],
      }),
    },
  ])("accepts the end of a game $why with its summary", ({ state }) => {
    expect(parseRoomView(state)).toEqual({ ok: true, value: state });
  });

  it.each([
    { why: "a round open for votes", state: view(withRound(VOTING, { ...VOTING_ROUND, question: QUESTION })) },
    { why: "a round after a skip", state: view(withRound(AFTER_SKIP, { ...AFTER_SKIP_ROUND, question: QUESTION })) },
    { why: "a revealed round", state: view(withRound(REVEALED, { ...REVEALED_ROUND, question: QUESTION }), true) },
    { why: "a round of a reworded question", state: view(withRound(OWN, { ...OWN_ROUND, question: REWORDED })) },
    {
      why: "a revealed round of an own question",
      state: view(withRound(OWN_REVEALED, { ...OWN_REVEALED_ROUND, question: OWN_QUESTION }), false),
    },
  ])("accepts $why with its question", ({ state }) => {
    expect(parseRoomView(state)).toEqual({ ok: true, value: state });
  });

  // A question the base does not have comes as null (src/lib/rooms/server.ts, roomView): the screen says it could not
  // load the question, and the round goes on.
  it.each([
    { why: "a round open for votes", state: view(withRound(VOTING, { ...VOTING_ROUND, question: null })) },
    { why: "a revealed round", state: view(withRound(REVEALED, { ...REVEALED_ROUND, question: null }), false) },
  ])("accepts $why whose question the base does not have", ({ state }) => {
    expect(parseRoomView(state)).toEqual({ ok: true, value: state });
  });

  it.each([
    { why: "the game's question list", state: view(LOBBY_WITH_LIST, null, QUESTIONS) },
    { why: "a list whose every entry is removed", state: view(LOBBY_WITH_LIST, null, []) },
  ])("accepts the host's lobby with $why", ({ state }) => {
    expect(parseRoomView(state)).toEqual({ ok: true, value: state });
  });

  it.each([
    { why: "missing", state: view(VOTING) },
    { why: "not a text", state: view(withRound(VOTING, { ...VOTING_ROUND, question: 1 })) },
    { why: "an object", state: view(withRound(VOTING, { ...VOTING_ROUND, question: { text: QUESTION } })) },
  ])("names round.question when it is $why", ({ state }) => {
    expect(parseRoomView(state)).toEqual({ ok: false, field: "round.question" });
  });

  it.each([
    { why: "missing", state: without(view(LOBBY), "questionsLeft") },
    { why: "not true, false or null", state: { ...view(LOBBY), questionsLeft: "yes" } },
    { why: "a number", state: { ...view(LOBBY), questionsLeft: 3 } },
  ])("names questionsLeft when it is $why", ({ state }) => {
    expect(parseRoomView(state)).toEqual({ ok: false, field: "questionsLeft" });
  });

  // S-07: a co-host's screen leads as the host's does, with the latecomers waiting and whether questions are left; a
  // guest without the role sees the co-host by the nick, and leads nothing.
  it.each([
    {
      why: "a co-host's round open for votes",
      state: { ...view(withRound(COHOST, { ...VOTING_ROUND, question: QUESTION })), leader: true },
    },
    {
      why: "a co-host's revealed round with questions left",
      state: { ...view(withRound(COHOST, { ...REVEALED_ROUND, question: QUESTION }), true), leader: true },
    },
    {
      why: "a co-host's skipped round with no question left",
      state: { ...view(withRound(COHOST, SKIPPED_ROUND), false), leader: true },
    },
    {
      why: "a guest's round beside a co-host",
      state: view(withRound(BESIDE_COHOST, { ...VOTING_ROUND, question: QUESTION })),
    },
  ])("accepts $why as it came", ({ state }) => {
    expect(parseRoomView(state)).toEqual({ ok: true, value: state });
  });

  // A Worker deployed before S-07 sends no leader: the screen is not told that nobody leads.
  it.each([
    { why: "missing", state: without(view(LOBBY), "leader") },
    { why: "null", state: { ...view(LOBBY), leader: null } },
    { why: "a text", state: { ...view(LOBBY), leader: "host" } },
    { why: "a number", state: { ...view(COHOST), leader: 1 } },
  ])("names leader when it is $why", ({ state }) => {
    expect(parseRoomView(state)).toEqual({ ok: false, field: "leader" });
  });

  it("names players.cohost when the view's players have none", () => {
    const state = view(LOBBY);
    const players = PLAYERS.map((player) => without(player, "cohost"));

    expect(parseRoomView({ ...state, players })).toEqual({ ok: false, field: "players.cohost" });
  });

  // A Worker deployed before S-18 sends no colour: the screen does not paint the place at the table instead.
  it("names players.color when the view's players have none", () => {
    const state = view(LOBBY);
    const players = PLAYERS.map((player) => without(player, "color"));

    expect(parseRoomView({ ...state, players })).toEqual({ ok: false, field: "players.color" });
  });

  it.each([-1, 20])("names players.color for the view's colour %j", (color) => {
    const state = view(LOBBY);

    expect(parseRoomView({ ...state, players: [{ ...PLAYERS[0], color }] })).toEqual({
      ok: false,
      field: "players.color",
    });
  });

  // The list is reviewed before the start only, and only by the host: anyone else's view, and the host's in a game in
  // play, carries none.
  it.each([
    { why: "missing", state: without(view(LOBBY), "questions") },
    { why: "not an array", state: { ...view(LOBBY), questions: "na-co-dzien-001" } },
    { why: "an object", state: { ...view(LOBBY), questions: { 1: REWORDED } } },
    { why: "an entry that is not an object", state: view(LOBBY, null, [null]) },
    { why: "a guest's in the lobby", state: view({ ...LOBBY, role: "guest", me: "Bartek" }, null, QUESTIONS) },
    {
      why: "the host's in a game in play",
      state: view(withRound(REVEALED, { ...REVEALED_ROUND, question: QUESTION }), true, QUESTIONS),
    },
    { why: "the host's in a closed room", state: view({ ...CLOSED, role: "host", me: "Ola" }, null, QUESTIONS) },
  ])("names questions when it is $why", ({ state }) => {
    expect(parseRoomView(state)).toEqual({ ok: false, field: "questions" });
  });

  it.each([
    { field: "questions.position", entry: { ...QUESTIONS[0], position: 0 } },
    { field: "questions.position", entry: { ...QUESTIONS[0], position: "1" } },
    { field: "questions.text", entry: { ...QUESTIONS[0], text: null } },
    { field: "questions.text", entry: { ...QUESTIONS[0], text: 1 } },
    { field: "questions.own", entry: { ...QUESTIONS[0], own: "yes" } },
    { field: "questions.own", entry: { position: 1, text: REWORDED } },
  ])("names $field for a wrong value", ({ field, entry }) => {
    expect(parseRoomView(view(LOBBY_WITH_LIST, null, [entry]))).toEqual({ ok: false, field });
  });

  // The summary is always there, null included, and comes only once the room is closed: a Worker deployed before it is
  // not read as "no reveal", and a game in play shows no sums.
  it.each([
    { why: "missing from a closed room", state: without(view(CLOSED), "summary") },
    { why: "missing from a game in play", state: without(view(SKIPPED), "summary") },
    { why: "not an object", state: withSummary([]) },
    { why: "a text", state: withSummary("Ola") },
    { why: "in the lobby", state: withSummary(SUMMARY, LOBBY) },
    {
      why: "in a game in play, after a reveal",
      state: { ...view(withRound(REVEALED, { ...REVEALED_ROUND, question: QUESTION }), true), summary: SUMMARY },
    },
    { why: "in a game in play, after a skip", state: withSummary(SUMMARY, SKIPPED) },
  ])("names summary when it is $why", ({ state }) => {
    expect(parseRoomView(state)).toEqual({ ok: false, field: "summary" });
  });

  it.each([
    { field: "summary.revealed", summary: { ...SUMMARY, revealed: 0 } },
    { field: "summary.revealed", summary: { ...SUMMARY, revealed: "2" } },
    { field: "summary.revealed", summary: { top: SUMMARY.top, unvoted: SUMMARY.unvoted } },
    { field: "summary.top", summary: { ...SUMMARY, top: undefined } },
    { field: "summary.top", summary: { ...SUMMARY, top: { Ola: 2 } } },
    { field: "summary.top", summary: { ...SUMMARY, top: [null] } },
    { field: "summary.top.nick", summary: { ...SUMMARY, top: [{ nick: 1, votes: 2 }] } },
    { field: "summary.top.votes", summary: { ...SUMMARY, top: [{ nick: "Ola", votes: -1 }] } },
    { field: "summary.top.votes", summary: { ...SUMMARY, top: [{ nick: "Ola", votes: "2" }] } },
    { field: "summary.votes", summary: { revealed: 2, top: SUMMARY.top, unvoted: SUMMARY.unvoted } },
    { field: "summary.votes", summary: { ...SUMMARY, votes: -1 } },
    { field: "summary.votes", summary: { ...SUMMARY, votes: "2" } },
    // Fewer votes in all than the top got alone: the chart's rest would be below 0.
    { field: "summary.votes", summary: { ...SUMMARY, votes: 1 } },
    { field: "summary.unvoted", summary: { ...SUMMARY, unvoted: undefined } },
    { field: "summary.unvoted", summary: { ...SUMMARY, unvoted: "Bartek" } },
    { field: "summary.unvoted", summary: { ...SUMMARY, unvoted: [1] } },
    // A nick only: an entry with a count next to it is not ours.
    { field: "summary.unvoted", summary: { ...SUMMARY, unvoted: [{ nick: "Bartek", votes: 0 }] } },
  ])("names $field for a wrong summary", ({ field, summary }) => {
    expect(parseRoomView(withSummary(summary))).toEqual({ ok: false, field });
  });

  // The browser never gets question_list itself, nor anything of a question beyond its position, text and whether it
  // is the host's own; nor the leader's draw, whose categories would name the 18+ ones the host included.
  it("passes on no question_list, no leader_draw and no key outside the contract", () => {
    const leaky = {
      ...view(LOBBY_WITH_LIST, null, [{ ...QUESTIONS[1], question_id: "na-co-dzien-003", removed: false }]),
      question_list: QUESTION_LIST,
      leader_draw: LIST_DRAW,
    };

    expect(parseRoomView(leaky)).toEqual({ ok: true, value: view(LOBBY_WITH_LIST, null, [QUESTIONS[1]]) });
  });

  // Anonymity (test-plan #1): the browser never gets game_totals itself, nor anything of the summary beyond the
  // number of questions, the top's nicks and counts and the nicks with none.
  it("passes on no game_totals and nothing of the summary outside the contract", () => {
    const leaky = {
      ...withSummary({
        ...SUMMARY,
        totals: GAME_TOTALS.totals,
        top: [{ nick: "Ola", votes: 2, voters: ["Bartek"] }],
      }),
      game_totals: GAME_TOTALS,
    };

    expect(parseRoomView(leaky)).toEqual({ ok: true, value: view(CLOSED_AFTER_GAME, null, null, SUMMARY) });
  });

  it("names the field the lobby parser names", () => {
    expect(parseRoomView(view({ ...LOBBY, status: "paused" }))).toEqual({ ok: false, field: "status" });
  });
});

// The view as it goes to the browser (src/lib/rooms/server.ts, roomView): the room's page and GET /api/rooms/<id>/lobby
// send it as it is, not through parseRoomView. S-07 (context/changes/co-host-role/plan.md, Faza 2 #2 and Critical
// Implementation Details): leader is true for the host and for a guest with the co-host role, false for a guest
// without it; leader_draw never reaches the browser, nor do question_list and game_totals. Written by hand from the
// plan, never from roomView.
const ROOM_ID = "3f2b8c1e-7a4d-4e9b-9c2a-5d6e7f8a9b0c";
const VIEW_KEYS = [
  "status",
  "role",
  "me",
  "players",
  "round",
  "requests",
  "leader",
  "questionsLeft",
  "questions",
  "summary",
];

// A fixture as room_lobby's answer the Worker has read.
function lobbyState(state: Record<string, unknown>): LobbyState {
  const parsed = parseLobbyState(state);
  if (!parsed.ok) throw new Error(`the fixture does not pass the parser at ${parsed.field}`);
  return parsed.value;
}

describe("roomView", () => {
  it.each([
    { why: "the host in the lobby", state: LOBBY, leader: true },
    { why: "the host after a reveal", state: REVEALED, leader: true },
    { why: "a guest with the co-host role", state: COHOST, leader: true },
    { why: "a guest without the role, beside a co-host", state: BESIDE_COHOST, leader: false },
    { why: "a guest in a room with no co-host", state: VOTING, leader: false },
    { why: "a guest in a closed room", state: CLOSED, leader: false },
  ])("gives $why leader: $leader", ({ state, leader }) => {
    expect(roomView(lobbyState(state), ROOM_ID, null).leader).toBe(leader);
  });

  it.each([
    { why: "the host with the game's question list", state: REVEALED_WITH_LIST },
    { why: "the host in the lobby with the list", state: LOBBY_WITH_LIST },
    { why: "a co-host", state: COHOST },
    { why: "the host of a closed room with reveals", state: CLOSED_AFTER_GAME_HOST },
  ])("gives $why the view's keys only, never leader_draw", ({ state }) => {
    expect(Object.keys(roomView(lobbyState(state), ROOM_ID, null)).sort()).toEqual([...VIEW_KEYS].sort());
  });
});

// A client that has only rpc(): room_lobby answers with the given state, as the database would.
function lobbyClient(state: unknown): SupabaseClient {
  const client = { rpc: () => Promise.resolve({ data: state, error: null, status: 200 }) };
  return client as unknown as SupabaseClient;
}

// The Worker's own gate before start, next and skip (S-07; review of S-07, F2): the room's state decides whether the
// caller leads, before the move goes to the database, which checks the role again under the room's lock. The oracle:
// plan.md Faza 2 #2 (null leader_draw for a player of the room → not_leader, no room → the 404 of OUTSIDE_ROOM) and the
// leader's draw from the room's categories (FR-005).
describe("leaderSelection", () => {
  it.each([
    { why: "the host", state: LOBBY },
    { why: "a guest with the co-host role", state: COHOST },
  ])("gives $why the room's categories for the draw", async ({ state }) => {
    expect(await leaderSelection(lobbyClient(state), ROOM_ID, null)).toEqual({
      ok: true,
      selection: { categories: ["na-co-dzien", "przyszlosc"], adultCategories: ["przyszlosc"] },
    });
  });

  it.each([
    { why: "a guest without the role, beside a co-host", state: BESIDE_COHOST },
    { why: "a guest in a room with no co-host", state: VOTING },
  ])("refuses $why with not_leader", async ({ state }) => {
    expect(await leaderSelection(lobbyClient(state), ROOM_ID, "token")).toEqual({ ok: false, reason: "not_leader" });
  });

  it("refuses someone outside the room with room_unknown", async () => {
    expect(await leaderSelection(lobbyClient(null), ROOM_ID, null)).toEqual({ ok: false, reason: "room_unknown" });
  });
});

// The length of an own or reworded question as the database counts it (private.question_text: the nick rule, then
// without the trailing "?" and spaces), for the screen's counter before it sends the text. Written out by hand.
describe("questionLength", () => {
  it.each([
    { text: "wypiłby mleko prosto z kartonu", length: 30 },
    { text: "  wypiłby   mleko prosto z kartonu?  ", length: 30 },
    { text: "wypiłby mleko prosto z kartonu ? ?", length: 30 },
    // "o" with a combining accent is one "ó" after NFC.
    { text: "zjadłby góralski", length: 16 },
    { text: "zjadłby pizzę 🍕", length: 15 },
    { text: "???", length: 0 },
    { text: "", length: 0 },
  ])("counts $length characters in $text", ({ text, length }) => {
    expect(questionLength(text)).toBe(length);
  });
});

// A latecomer's own request as join_request_state returns it
// (context/archive/2026-10-22-latecomer-admission/plan.md, Faza 1 #1), for the /j/<code> page and its waiting screen:
// the state, and the nick only while a request exists.
describe("parseJoinRequestState", () => {
  it.each([
    { why: "a request waiting", state: { state: "pending", nick: "Kuba" } },
    { why: "a request turned away", state: { state: "rejected", nick: "Kuba" } },
    { why: "a latecomer let in", state: { state: "admitted" } },
    { why: "a room closed", state: { state: "closed" } },
    { why: "no request", state: { state: "none" } },
  ])("accepts $why as it came", ({ state }) => {
    expect(parseJoinRequestState(state)).toEqual({ ok: true, value: state });
  });

  it.each([{ value: null }, { value: [] }, { value: "pending" }, { value: 1 }])(
    "names the root for a value that is not an object: $value",
    ({ value }) => {
      expect(parseJoinRequestState(value)).toEqual({ ok: false, field: "root" });
    },
  );

  it.each(["waiting", "admit", "", null, 1, undefined])("names state for the unknown state %j", (state) => {
    expect(parseJoinRequestState({ state, nick: "Kuba" })).toEqual({ ok: false, field: "state" });
  });

  it.each([
    { why: "missing from a request waiting", state: { state: "pending" } },
    { why: "missing from a request turned away", state: { state: "rejected" } },
    { why: "not a text", state: { state: "pending", nick: 1 } },
    { why: "null", state: { state: "rejected", nick: null } },
  ])("names nick when it is $why", ({ state }) => {
    expect(parseJoinRequestState(state)).toEqual({ ok: false, field: "nick" });
  });

  // Whoever is still outside sees nothing of the game: a key outside the contract (the question, the players, another
  // latecomer's request) never reaches the waiting screen, even if the database sent one.
  it.each([
    {
      why: "a request waiting",
      state: { state: "pending", nick: "Kuba", question: "planted", players: ["Ola"], requests: ["Zosia"] },
      value: { state: "pending", nick: "Kuba" },
    },
    {
      why: "a latecomer let in",
      state: { state: "admitted", nick: "Kuba", room_id: "planted" },
      value: { state: "admitted" },
    },
    { why: "no request", state: { state: "none", nick: "planted" }, value: { state: "none" } },
  ])("passes on no key outside the contract for $why", ({ state, value }) => {
    expect(parseJoinRequestState(state)).toEqual({ ok: true, value });
  });
});
