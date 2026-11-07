import type { SupabaseClient } from "@supabase/supabase-js";
import { describe, expect, it } from "vitest";
import { leaderMoreQuestions, leaderQuestionsLeft, leaderSelection, roomView } from "@/lib/rooms/server";
import {
  parseJoinRequestState,
  parseLobbyState,
  parseRoomView,
  questionLength,
  type LobbyState,
} from "@/lib/rooms/shared";
import { questionPool } from "@/lib/rounds/draw";

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
// context/changes/remove-player-new-link/plan.md, Faza 1 #1 and Faza 2 #1: link_token and the view's linkUrl;
// context/changes/guest-question-proposals/plan.md, Faza 1 #3 and Faza 2 #1: proposals and own_proposals;
// context/changes/game-length/plan.md, Faza 1 #4 and Faza 2 #1-#2: question_count and the view's moreQuestions;
// tests/db/support/rounds.ts, the exact key sets), never from the parser.

// S-09: the room's link code as create_room makes it (22 base64url characters), and the players' link the Worker makes
// of it on the page's origin, both written out by hand.
const LINK_TOKEN = "Xq3vL9tR2mWb7KpZ0aYc_e";
const ORIGIN = "https://most-likely-to.charlesonthewave.workers.dev";
const LINK_URL = "https://most-likely-to.charlesonthewave.workers.dev/j/Xq3vL9tR2mWb7KpZ0aYc_e";

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

// S-10: a player's own counts before their first proposal: all 3 left, none waiting.
const OWN_PROPOSALS = { left: 3, waiting: 0 };

// requests: the latecomers waiting, for a leader only; anyone else always gets []. proposals: the proposals waiting,
// for a leader only; anyone else always gets []. own_proposals: the player's own counts, for every player, in every
// status. question_count: the number of the game's questions, for every player in every status; 15 with no list
// (game-length). question_list: the game's question
// list, for the host of a room with one only; null for a guest and before the host opens it. game_totals: the sums of
// a closed game's reveals, for everyone; null in every other status and for a closed room with no reveal. leader_draw:
// for a leader, in every status. link_token: the room's link code, for a leader in every status; null for anyone else.
const LOBBY = {
  status: "lobby",
  role: "host",
  me: "Ola",
  players: PLAYERS,
  round: null,
  requests: [],
  returning: [],
  proposals: [],
  own_proposals: OWN_PROPOSALS,
  question_count: 15,
  question_list: null,
  game_totals: null,
  leader_draw: LEADER_DRAW,
  link_token: LINK_TOKEN,
};
const CLOSED = {
  status: "closed",
  role: "guest",
  me: "Bartek",
  players: PLAYERS,
  round: null,
  requests: [],
  returning: [],
  proposals: [],
  own_proposals: OWN_PROPOSALS,
  question_count: 15,
  question_list: null,
  game_totals: null,
  leader_draw: null,
  link_token: null,
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
  returning: [],
  proposals: [],
  own_proposals: OWN_PROPOSALS,
  question_count: 15,
  question_list: null,
  game_totals: null,
  leader_draw: null,
  link_token: null,
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
  returning: [],
  proposals: [],
  own_proposals: OWN_PROPOSALS,
  question_count: 15,
  question_list: null,
  game_totals: null,
  leader_draw: LEADER_DRAW,
  link_token: LINK_TOKEN,
};
// S-07: the host gave Bartek, a guest, the co-host role. Everyone sees it by his nick; he leads as the host does, so he
// gets the latecomers waiting, what a leader's moves need and the room's link code (S-09), but never the game's
// question list. Kuba, a guest without the role, sees the same players and nothing a leader gets.
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
  returning: [],
  proposals: [],
  own_proposals: OWN_PROPOSALS,
  question_count: 15,
  question_list: null,
  game_totals: null,
  leader_draw: LEADER_DRAW,
  link_token: LINK_TOKEN,
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
  returning: [],
  proposals: [],
  own_proposals: OWN_PROPOSALS,
  question_count: 15,
  question_list: null,
  game_totals: null,
  leader_draw: LEADER_DRAW,
  link_token: LINK_TOKEN,
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
  returning: [],
  proposals: [],
  own_proposals: OWN_PROPOSALS,
  question_count: 15,
  question_list: null,
  game_totals: null,
  leader_draw: null,
  link_token: null,
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
// The leader's draw with that list: its 3 entries not removed and its 15 rows with a question id of the base. The game
// has those 3 questions.
const LIST_DRAW = { ...LEADER_DRAW, list_entries: 3, list_base_count: 15 };
const LOBBY_WITH_LIST = { ...LOBBY, question_list: QUESTION_LIST, leader_draw: LIST_DRAW, question_count: 3 };
// During the game the host still gets the list.
const REVEALED_WITH_LIST = { ...REVEALED, question_list: QUESTION_LIST, leader_draw: LIST_DRAW, question_count: 3 };
// A round of an own or reworded question of the list has no question id, only the host's text, for every player.
const OWN_ROUND = { ...VOTING_ROUND, question_id: null, question_text: REWORDED };
const OWN = { ...VOTING, round: OWN_ROUND };
const OWN_REVEALED_ROUND = { ...REVEALED_ROUND, question_id: null, question_text: OWN_QUESTION };
const OWN_REVEALED = { ...REVEALED, round: OWN_REVEALED_ROUND };

// S-10: two proposals waiting, in the order of their numbers, each with its author's nick, for a leader only. Number 2
// is decided already, so it is gone from the list.
const PROPOSAL = { number: 1, nick: "Kuba", text: OWN_QUESTION };
const PROPOSALS = [PROPOSAL, { number: 3, nick: "Bartek", text: REWORDED }];
// A player's own counts with one of 3 proposals decided and one waiting: only numbers, whatever became of the first.
const OWN_ONE_WAITING = { left: 1, waiting: 1 };

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
const CLOSED_AFTER_GAME_HOST = {
  ...CLOSED_AFTER_GAME,
  role: "host",
  me: "Ola",
  leader_draw: LEADER_DRAW,
  link_token: LINK_TOKEN,
};

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
    // game-length: a game of 0 questions, which "Zacznij grę" refuses (list_empty).
    {
      why: "a list whose every entry is removed",
      state: { ...withList({ entries: [], base_count: 15 }), question_count: 0 },
    },
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
    // S-09: every character base64url has, "-" and "_" included.
    {
      why: "the host's lobby with a code of every kind of character",
      state: { ...LOBBY, link_token: "AZaz09_-AZaz09_-AZaz09" },
    },
    // S-04 (context/changes/rejoin-after-refresh/plan.md, Faza 3 #1): a request to come back waits in the lobby too, and
    // in a game next to a latecomer's request.
    {
      why: "the host's lobby with a request to come back",
      state: { ...LOBBY, requests: ["Kasia"], returning: ["Kasia"] },
    },
    {
      why: "a round with a request to come back among the latecomers",
      state: { ...HOST_WITH_REQUESTS, returning: ["Igor"] },
    },
    // S-10: a proposal waits in the lobby and in a game, and a leader sees it with its author's nick.
    { why: "the host's lobby with proposals waiting", state: { ...LOBBY, proposals: PROPOSALS } },
    { why: "a co-host's round with proposals waiting", state: { ...COHOST, proposals: PROPOSALS } },
    { why: "a guest's round with their own proposal waiting", state: { ...VOTING, own_proposals: OWN_ONE_WAITING } },
    { why: "a guest with no proposal left", state: { ...SKIPPED, own_proposals: { left: 0, waiting: 0 } } },
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

  it.each([
    "status",
    "role",
    "me",
    "players",
    "round",
    "requests",
    "returning",
    "proposals",
    "own_proposals",
    "question_count",
    "question_list",
    "game_totals",
    "leader_draw",
    "link_token",
  ])("names the missing field %s", (field) => {
    expect(parseLobbyState(without(LOBBY, field))).toEqual({ ok: false, field });
  });

  // S-09: likewise a database without the room's link code in the state (before *_remove_player.sql): not read as "no
  // link" for a leader, nor for a guest, whose null would pass otherwise.
  it.each([{ state: LOBBY }, { state: COHOST }, { state: VOTING }, { state: CLOSED_AFTER_GAME_HOST }])(
    "names link_token when a $state.status room's state has none",
    ({ state }) => {
      expect(parseLobbyState(without(state, "link_token"))).toEqual({ ok: false, field: "link_token" });
    },
  );

  // The room's link code only: 22 base64url characters, as create_room and remove_player make it, or null. Anything
  // else would become a link that opens nothing.
  it.each([
    "",
    "Xq3vL9tR2mWb7KpZ0aYc_",
    "Xq3vL9tR2mWb7KpZ0aYc_eX",
    "Xq3vL9tR2mWb7KpZ0aYc+e",
    "Xq3vL9tR2mWb7KpZ0aYc/e",
    "Xq3vL9tR2mWb7KpZ0aY==",
    "Xq3vL9tR2mWb7KpZ0aYc e",
    "https://most-likely-to.charlesonthewave.workers.dev/j/Xq3vL9tR2mWb7KpZ0aYc_e",
    22,
    true,
  ])("names link_token for the code %j", (code) => {
    expect(parseLobbyState({ ...LOBBY, link_token: code })).toEqual({ ok: false, field: "link_token" });
  });

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

  // Likewise a database without the proposals (before *_guest_question_proposals.sql), in every status: not read as "no
  // proposal waits" nor as "all 3 left".
  it.each([{ state: LOBBY }, { state: VOTING }, { state: REVEALED }, { state: SKIPPED }, { state: CLOSED }])(
    "names proposals when a $state.status room's state has none",
    ({ state }) => {
      expect(parseLobbyState(without(state, "proposals"))).toEqual({ ok: false, field: "proposals" });
    },
  );

  it.each([{ state: LOBBY }, { state: VOTING }, { state: REVEALED }, { state: SKIPPED }, { state: CLOSED }])(
    "names own_proposals when a $state.status room's state has none",
    ({ state }) => {
      expect(parseLobbyState(without(state, "own_proposals"))).toEqual({ ok: false, field: "own_proposals" });
    },
  );

  // Likewise a database without the number of the game's questions (before *_game_length.sql), in every status: not
  // read as a game of 0 questions.
  it.each([{ state: LOBBY }, { state: VOTING }, { state: REVEALED }, { state: SKIPPED }, { state: CLOSED }])(
    "names question_count when a $state.status room's state has none",
    ({ state }) => {
      expect(parseLobbyState(without(state, "question_count"))).toEqual({ ok: false, field: "question_count" });
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
    { field: "returning", state: { ...LOBBY, returning: null } },
    { field: "returning", state: { ...LOBBY, requests: ["Kasia"], returning: "Kasia" } },
    { field: "returning", state: { ...LOBBY, requests: ["Kasia"], returning: [{ nick: "Kasia" }] } },
    // Every request to come back is on the leader's list of requests: a row nobody could answer is not ours.
    { field: "returning", state: { ...LOBBY, requests: ["Zosia"], returning: ["Kasia"] } },
    { field: "proposals", state: { ...LOBBY, proposals: null } },
    { field: "proposals", state: { ...LOBBY, proposals: {} } },
    { field: "proposals", state: { ...LOBBY, proposals: [null] } },
    // A proposal has a number and a nick next to its text: a bare text is not ours.
    { field: "proposals", state: { ...LOBBY, proposals: [OWN_QUESTION] } },
    { field: "proposals.number", state: { ...LOBBY, proposals: [{ ...PROPOSAL, number: 0 }] } },
    { field: "proposals.number", state: { ...LOBBY, proposals: [{ ...PROPOSAL, number: 1.5 }] } },
    { field: "proposals.number", state: { ...LOBBY, proposals: [{ ...PROPOSAL, number: "1" }] } },
    { field: "proposals.number", state: { ...LOBBY, proposals: [{ nick: "Kuba", text: OWN_QUESTION }] } },
    { field: "proposals.nick", state: { ...LOBBY, proposals: [{ ...PROPOSAL, nick: 1 }] } },
    { field: "proposals.nick", state: { ...LOBBY, proposals: [{ ...PROPOSAL, nick: null }] } },
    // A decided proposal has no text, and it is on nobody's list.
    { field: "proposals.text", state: { ...LOBBY, proposals: [{ ...PROPOSAL, text: null }] } },
    { field: "proposals.text", state: { ...LOBBY, proposals: [{ ...PROPOSAL, text: 1 }] } },
    { field: "own_proposals", state: { ...LOBBY, own_proposals: null } },
    { field: "own_proposals", state: { ...LOBBY, own_proposals: [] } },
    { field: "own_proposals", state: { ...LOBBY, own_proposals: 3 } },
    { field: "own_proposals.left", state: { ...LOBBY, own_proposals: { waiting: 0 } } },
    { field: "own_proposals.left", state: { ...LOBBY, own_proposals: { left: -1, waiting: 0 } } },
    { field: "own_proposals.left", state: { ...LOBBY, own_proposals: { left: "3", waiting: 0 } } },
    { field: "own_proposals.waiting", state: { ...LOBBY, own_proposals: { left: 3 } } },
    { field: "own_proposals.waiting", state: { ...LOBBY, own_proposals: { left: 3, waiting: 1.5 } } },
    { field: "question_count", state: { ...LOBBY, question_count: -1 } },
    { field: "question_count", state: { ...LOBBY, question_count: 1.5 } },
    { field: "question_count", state: { ...LOBBY, question_count: "15" } },
    { field: "question_count", state: { ...LOBBY, question_count: null } },
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
  // ids), nor of a proposal beyond its number, nick and text (its author's id), nor of a player's own counts (how a
  // decided proposal was decided).
  it("passes on no key outside the contract", () => {
    const host = { ...VOTING, role: "host", me: "Ola", leader_draw: LIST_DRAW, link_token: LINK_TOKEN };
    const leaky = {
      ...host,
      room_id: "planted",
      round: { ...VOTING_ROUND, tally: { Ola: 2 }, votes: 2, list_position: 1 },
      players: [{ nick: "Ola", host: true, cohost: false, color: 0, id: "planted" }],
      request_tokens: ["planted"],
      question_list: {
        ...QUESTION_LIST,
        removed: [{ position: 2, question_id: "na-co-dzien-002" }],
        entries: [{ ...QUESTION_LIST.entries[0], removed: false, room_id: "planted" }],
      },
      leader_draw: { ...LIST_DRAW, question_ids: ["na-co-dzien-002"], room_id: "planted" },
      proposals: [{ ...PROPOSAL, player_id: "planted", room_id: "planted" }],
      own_proposals: { ...OWN_PROPOSALS, rejected: 1 },
    };

    expect(parseLobbyState(leaky)).toEqual({
      ok: true,
      value: {
        ...host,
        players: [{ nick: "Ola", host: true, cohost: false, color: 0 }],
        question_list: { entries: [QUESTION_LIST.entries[0]], base_count: 15 },
        proposals: [PROPOSAL],
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

// The Worker's view keeps question_list, game_totals, leader_draw and link_token to itself and adds leader,
// questionsLeft, moreQuestions, questions, summary and linkUrl. leader: whether the person leads, here true for the host
// (a co-host's view sets it itself). questionsLeft: for a leader once the latest round is revealed or skipped, whether
// the game has a question left before its last one; null in every other state and for anyone who does not lead.
// moreQuestions: how many questions "Jeszcze 5 pytań" adds, a count exactly where questionsLeft is false (a view at the
// game's last question sets it itself), null otherwise. questions: the game's question
// list for its host in the lobby, as text; null otherwise. summary: for everyone in a closed room whose game had a
// reveal, what the end of the evening shows of the sums; null otherwise. linkUrl: the players' link for the host whose
// state has the code (a co-host's view sets it itself, as leader); null otherwise.
function view(
  state: Record<string, unknown>,
  questionsLeft: boolean | null = null,
  questions: unknown[] | null = null,
  summary: Record<string, unknown> | null = null,
): Record<string, unknown> {
  const kept = without(without(without(without(state, "question_list"), "game_totals"), "leader_draw"), "link_token");
  const linkUrl = state.role === "host" && state.link_token !== null ? LINK_URL : null;
  return { ...kept, leader: state.role === "host", questionsLeft, moreQuestions: null, questions, summary, linkUrl };
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
    {
      why: "a skipped last question, for the host with none left to draw",
      state: { ...view({ ...SKIPPED, role: "host" }, false), moreQuestions: 0 },
    },
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
      why: "a revealed last question of an own question",
      state: {
        ...view(withRound(OWN_REVEALED, { ...OWN_REVEALED_ROUND, question: OWN_QUESTION }), false),
        moreQuestions: 5,
      },
    },
  ])("accepts $why with its question", ({ state }) => {
    expect(parseRoomView(state)).toEqual({ ok: true, value: state });
  });

  // A question the base does not have comes as null (src/lib/rooms/server.ts, roomView): the screen says it could not
  // load the question, and the round goes on.
  it.each([
    { why: "a round open for votes", state: view(withRound(VOTING, { ...VOTING_ROUND, question: null })) },
    {
      why: "a revealed last question",
      state: { ...view(withRound(REVEALED, { ...REVEALED_ROUND, question: null }), false), moreQuestions: 3 },
    },
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

  // game-length: the number of the game's questions goes to every screen, so a Worker deployed before it is not read
  // as a game of 0 questions.
  it("names question_count when the view has none", () => {
    const state = view(withRound(VOTING, { ...VOTING_ROUND, question: QUESTION }));

    expect(parseRoomView(without(state, "question_count"))).toEqual({ ok: false, field: "question_count" });
  });

  // game-length: how many questions "Jeszcze 5 pytań" adds is always there, null included, so a Worker deployed before
  // it is not read as "nothing to add"; a count exactly where the game's last question is played (questionsLeft false),
  // and only a whole number from 0 on.
  const LAST_SKIPPED = { ...SKIPPED, role: "host", me: "Ola", leader_draw: LEADER_DRAW, link_token: LINK_TOKEN };
  it.each([
    { why: "missing", state: without(view(LOBBY), "moreQuestions") },
    { why: "missing at the game's last question", state: without(view(LAST_SKIPPED, false), "moreQuestions") },
    { why: "null at the game's last question", state: view(LAST_SKIPPED, false) },
    {
      why: "a count before the game's last question",
      state: { ...view(withRound(REVEALED, { ...REVEALED_ROUND, question: QUESTION }), true), moreQuestions: 5 },
    },
    { why: "a count with no questionsLeft", state: { ...view(LOBBY), moreQuestions: 5 } },
    { why: "below 0", state: { ...view(LAST_SKIPPED, false), moreQuestions: -1 } },
    { why: "not a whole number", state: { ...view(LAST_SKIPPED, false), moreQuestions: 1.5 } },
    { why: "a text", state: { ...view(LAST_SKIPPED, false), moreQuestions: "5" } },
  ])("names moreQuestions when it is $why", ({ state }) => {
    expect(parseRoomView(state)).toEqual({ ok: false, field: "moreQuestions" });
  });

  // S-07: a co-host's screen leads as the host's does, with the latecomers waiting and whether questions are left; a
  // guest without the role sees the co-host by the nick, and leads nothing.
  it.each([
    {
      why: "a co-host's round open for votes",
      state: { ...view(withRound(COHOST, { ...VOTING_ROUND, question: QUESTION })), leader: true, linkUrl: LINK_URL },
    },
    {
      why: "a co-host's revealed round with questions left",
      state: {
        ...view(withRound(COHOST, { ...REVEALED_ROUND, question: QUESTION }), true),
        leader: true,
        linkUrl: LINK_URL,
      },
    },
    {
      why: "a co-host's skipped last question with none left to draw",
      state: { ...view(withRound(COHOST, SKIPPED_ROUND), false), leader: true, linkUrl: LINK_URL, moreQuestions: 0 },
    },
    {
      why: "a guest's round beside a co-host",
      state: view(withRound(BESIDE_COHOST, { ...VOTING_ROUND, question: QUESTION })),
    },
  ])("accepts $why as it came", ({ state }) => {
    expect(parseRoomView(state)).toEqual({ ok: true, value: state });
  });

  // S-10: a leader's screen gets the proposals waiting with their authors' nicks, in the lobby and in a game; any other
  // screen gets only the player's own counts.
  it.each([
    { why: "the host's lobby with proposals waiting", state: view({ ...LOBBY, proposals: PROPOSALS }) },
    {
      why: "a co-host's round with proposals waiting",
      state: {
        ...view(withRound({ ...COHOST, proposals: PROPOSALS }, { ...VOTING_ROUND, question: QUESTION })),
        leader: true,
        linkUrl: LINK_URL,
      },
    },
    {
      why: "a guest's lobby with their own proposal waiting",
      state: view({ ...LOBBY, role: "guest", me: "Bartek", own_proposals: OWN_ONE_WAITING }),
    },
  ])("accepts $why as it came", ({ state }) => {
    expect(parseRoomView(state)).toEqual({ ok: true, value: state });
  });

  // A Worker deployed before S-10 sends neither: the screen is not told that no proposal waits, nor that all 3 are left.
  it.each([
    { field: "proposals", why: "missing", state: without(view(LOBBY), "proposals") },
    { field: "proposals", why: "not a list", state: { ...view(LOBBY), proposals: "zgubiłby klucze" } },
    {
      field: "proposals.text",
      why: "a decided proposal",
      state: view({ ...LOBBY, proposals: [{ number: 1, nick: "Kuba", text: null }] }),
    },
    { field: "own_proposals", why: "missing", state: without(view(VOTING), "own_proposals") },
    { field: "own_proposals", why: "not an object", state: { ...view(LOBBY), own_proposals: 3 } },
  ])("names $field when it is $why", ({ field, state }) => {
    expect(parseRoomView(state)).toEqual({ ok: false, field });
  });

  // Nothing of a proposal beyond its number, nick and text reaches the browser, nor of a player's own counts.
  it("passes on nothing of a proposal outside the contract", () => {
    const leaky = view({
      ...LOBBY,
      proposals: [{ ...PROPOSAL, player_id: "planted" }],
      own_proposals: { ...OWN_PROPOSALS, approved: 1 },
    });

    expect(parseRoomView(leaky)).toEqual({ ok: true, value: view({ ...LOBBY, proposals: [PROPOSAL] }) });
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

  // S-09: the players' link is always there, null included, so a Worker deployed before it is not read as "no link";
  // only a leader's view carries one, and only a link to the room's /j/ page.
  it.each([
    { why: "missing", state: without(view(LOBBY), "linkUrl") },
    { why: "a number", state: { ...view(LOBBY), linkUrl: 1 } },
    { why: "the bare code", state: { ...view(LOBBY), linkUrl: LINK_TOKEN } },
    {
      why: "a link to the room's own page",
      state: { ...view(LOBBY), linkUrl: `${ORIGIN}/r/3f2b8c1e-7a4d-4e9b-9c2a-5d6e7f8a9b0c` },
    },
    { why: "a link with a short code", state: { ...view(LOBBY), linkUrl: `${ORIGIN}/j/Xq3vL9tR2mWb7KpZ0aYc_` } },
    { why: "in a guest's view", state: { ...view(VOTING), linkUrl: LINK_URL } },
    { why: "in a guest's closed room", state: { ...view(CLOSED), linkUrl: LINK_URL } },
  ])("names linkUrl when it is $why", ({ state }) => {
    expect(parseRoomView(state)).toEqual({ ok: false, field: "linkUrl" });
  });

  it("accepts the host's link on another origin, as on a local server", () => {
    const state = { ...view(LOBBY), linkUrl: "http://localhost:4321/j/Xq3vL9tR2mWb7KpZ0aYc_e" };

    expect(parseRoomView(state)).toEqual({ ok: true, value: state });
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
  // is the host's own; nor the leader's draw, whose categories would name the 18+ ones the host included; nor the raw
  // link code next to the link (S-09).
  it("passes on no question_list, no leader_draw, no link_token and no key outside the contract", () => {
    const leaky = {
      ...view(LOBBY_WITH_LIST, null, [{ ...QUESTIONS[1], question_id: "na-co-dzien-003", removed: false }]),
      question_list: QUESTION_LIST,
      leader_draw: LIST_DRAW,
      link_token: LINK_TOKEN,
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
// without it; leader_draw never reaches the browser, nor do question_list and game_totals. S-09
// (context/changes/remove-player-new-link/plan.md, Faza 2 #1): linkUrl is <origin>/j/<code> for a leader, null for
// anyone else; link_token never reaches the browser. S-10 (context/changes/guest-question-proposals/plan.md, Faza 2
// #1): proposals and own_proposals go on as the database gave them. game-length (context/changes/game-length/plan.md,
// Faza 2 #1-#2): question_count goes on as the database gave it, and moreQuestions is the Worker's. Written by hand from
// the plans, never from roomView.
const ROOM_ID = "3f2b8c1e-7a4d-4e9b-9c2a-5d6e7f8a9b0c";
const VIEW_KEYS = [
  "status",
  "role",
  "me",
  "players",
  "round",
  "requests",
  "returning",
  "proposals",
  "own_proposals",
  "question_count",
  "leader",
  "questionsLeft",
  "moreQuestions",
  "questions",
  "summary",
  "linkUrl",
];

// A fixture as room_lobby's answer the Worker has read.
function lobbyState(state: Record<string, unknown>): LobbyState {
  const parsed = parseLobbyState(state);
  if (!parsed.ok) throw new Error(`the fixture does not pass the parser at ${parsed.field}`);
  return parsed.value;
}

// game-length (context/changes/game-length/plan.md, Faza 2 #2): what a leader may do once the latest round is revealed
// or skipped. "Następne pytanie" while the round's number is below the number of the game's questions
// (leaderQuestionsLeft true); at the game's last question (false) "Jeszcze 5 pytań" adds at most 5, fewer when fewer
// are left to draw, and 0 when none is (leaderMoreQuestions). The room has no list, so after round N its pool has
// POOL - N left to draw (draw.test.ts, questionsToDraw). POOL is the pool of LEADER_DRAW's categories from questionPool,
// which draw.test.ts checks against the base, so the cases still hold when the base grows; what is left to draw (7, 3,
// 0) and every answer are written by hand. A game of POOL - 7 questions is one of 15 with POOL - 22 added by "Jeszcze 5
// pytań".
const POOL = questionPool({ categories: LEADER_DRAW.categories, adultCategories: LEADER_DRAW.adult_categories }).length;

// The host's state once round `number` of a game of `count` questions is revealed, or skipped.
function afterRound(
  number: number,
  count: number,
  phase: "revealed" | "skipped" = "revealed",
): Record<string, unknown> {
  const round = phase === "revealed" ? { ...REVEALED_ROUND, number } : { number, phase };
  return { ...REVEALED, round, question_count: count };
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
    expect(roomView(lobbyState(state), ROOM_ID, null, ORIGIN).leader).toBe(leader);
  });

  // S-09: every leader gets the players' link in every status, so the next fetch after a removal brings the new one;
  // anyone else gets none, also when the state carried a code by mistake.
  it.each([
    { why: "the host in the lobby", state: LOBBY, linkUrl: LINK_URL },
    { why: "the host after a reveal", state: REVEALED, linkUrl: LINK_URL },
    { why: "a guest with the co-host role", state: COHOST, linkUrl: LINK_URL },
    { why: "the host of a closed room", state: CLOSED_AFTER_GAME_HOST, linkUrl: LINK_URL },
    { why: "a guest without the role, beside a co-host", state: BESIDE_COHOST, linkUrl: null },
    { why: "a guest in a closed room", state: CLOSED, linkUrl: null },
    { why: "a guest whose state carried a code", state: { ...VOTING, link_token: LINK_TOKEN }, linkUrl: null },
  ])("gives $why linkUrl: $linkUrl", ({ state, linkUrl }) => {
    expect(roomView(lobbyState(state), ROOM_ID, null, ORIGIN).linkUrl).toBe(linkUrl);
  });

  it("makes the link on the origin it is given, as a local server's", () => {
    expect(roomView(lobbyState(LOBBY), ROOM_ID, null, "http://localhost:4321").linkUrl).toBe(
      "http://localhost:4321/j/Xq3vL9tR2mWb7KpZ0aYc_e",
    );
  });

  it.each([
    { why: "the host with the game's question list", state: REVEALED_WITH_LIST },
    { why: "the host in the lobby with the list", state: LOBBY_WITH_LIST },
    { why: "a co-host", state: COHOST },
    { why: "the host of a closed room with reveals", state: CLOSED_AFTER_GAME_HOST },
    { why: "a guest", state: VOTING },
  ])("gives $why the view's keys only, never leader_draw nor link_token", ({ state }) => {
    expect(Object.keys(roomView(lobbyState(state), ROOM_ID, null, ORIGIN)).sort()).toEqual([...VIEW_KEYS].sort());
  });

  // game-length: every player's screen gets the number of the game's questions as room_lobby gave it.
  it.each([
    { why: "the host in the lobby", state: LOBBY, count: 15 },
    { why: "the host in the lobby with a list of 3", state: LOBBY_WITH_LIST, count: 3 },
    { why: "a guest in a game", state: VOTING, count: 15 },
    { why: "a guest in a closed room", state: CLOSED, count: 15 },
  ])("passes question_count on to $why", ({ state, count }) => {
    expect(roomView(lobbyState(state), ROOM_ID, null, ORIGIN).question_count).toBe(count);
  });

  // game-length: roomView counts moreQuestions itself from the state, as leaderMoreQuestions does.
  it.each([
    { why: "the host at the last question with 3 left to draw", state: afterRound(POOL - 3, POOL - 3), more: 3 },
    { why: "the host at a skipped last question with none left", state: afterRound(POOL, POOL, "skipped"), more: 0 },
    { why: "the host before the last question", state: afterRound(14, 15), more: null },
    { why: "a guest", state: VOTING, more: null },
  ])("gives $why moreQuestions: $more", ({ state, more }) => {
    const lobby = lobbyState(state);

    expect(roomView(lobby, ROOM_ID, leaderQuestionsLeft(lobby), ORIGIN).moreQuestions).toBe(more);
  });

  // room_lobby gives the proposals to a leader alone, and the view does not change them.
  it.each([
    { why: "the host in the lobby", state: { ...LOBBY, proposals: PROPOSALS } },
    { why: "a co-host in a game", state: { ...COHOST, proposals: PROPOSALS } },
    { why: "a guest", state: { ...VOTING, own_proposals: OWN_ONE_WAITING } },
  ])("passes proposals and own_proposals on to $why", ({ state }) => {
    const shown = roomView(lobbyState(state), ROOM_ID, null, ORIGIN);

    expect(shown.proposals).toEqual(state.proposals);
    expect(shown.own_proposals).toEqual(state.own_proposals);
  });
});

describe("leaderQuestionsLeft and leaderMoreQuestions", () => {
  // Every case below needs a pool past a game of 15 with 7 left to draw.
  it("has a pool of at least 22 questions", () => {
    expect(POOL).toBeGreaterThanOrEqual(22);
  });

  it.each([
    { why: "round 14 of 15, revealed", state: afterRound(14, 15), left: true, more: null },
    { why: "round 14 of 15, skipped", state: afterRound(14, 15, "skipped"), left: true, more: null },
    { why: "the last round revealed, 7 left to draw", state: afterRound(POOL - 7, POOL - 7), left: false, more: 5 },
    { why: "the last round revealed, 3 left to draw", state: afterRound(POOL - 3, POOL - 3), left: false, more: 3 },
    { why: "the last round revealed, none left to draw", state: afterRound(POOL, POOL), left: false, more: 0 },
    {
      why: "the last round skipped, 3 left to draw",
      state: afterRound(POOL - 3, POOL - 3, "skipped"),
      left: false,
      more: 3,
    },
    {
      why: "round 15 of 15 for a co-host",
      state: { ...afterRound(15, 15), role: "guest", me: "Bartek", players: COHOST_PLAYERS },
      left: false,
      more: 5,
    },
    {
      why: "round 15 of 15 for a guest without the role",
      state: { ...afterRound(15, 15), role: "guest", me: "Kuba", leader_draw: null, link_token: null },
      left: null,
      more: null,
    },
    {
      why: "round 15 of 15 still voting",
      state: { ...REVEALED, round: { ...VOTING_ROUND, number: 15 }, question_count: 15 },
      left: null,
      more: null,
    },
    { why: "the lobby", state: LOBBY, left: null, more: null },
    { why: "a closed room", state: CLOSED_AFTER_GAME_HOST, left: null, more: null },
  ])("gives $why questionsLeft: $left and moreQuestions: $more", ({ state, left, more }) => {
    const lobby = lobbyState(state);

    expect(leaderQuestionsLeft(lobby)).toBe(left);
    expect(leaderMoreQuestions(lobby)).toBe(more);
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
    // S-04 (context/changes/rejoin-after-refresh/plan.md, Faza 3 #1 and Faza 4 #1).
    { why: "a request to come back waiting", state: { state: "pending", nick: "Kasia", returning: true } },
    { why: "a request to come back turned away", state: { state: "rejected", nick: "Kasia", returning: true } },
    { why: "a place moved to another device", state: { state: "moved", nick: "Kasia" } },
  ])("accepts $why as it came", ({ state }) => {
    expect(parseJoinRequestState(state)).toEqual({ ok: true, value: state });
  });

  // returning is there only for a request to come back, and then only true: anything else is not ours.
  it.each([false, "true", 1, null])("names returning for returning %j", (returning) => {
    expect(parseJoinRequestState({ state: "pending", nick: "Kasia", returning })).toEqual({
      ok: false,
      field: "returning",
    });
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
    { why: "missing from a moved place", state: { state: "moved" } },
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
    {
      why: "a moved place",
      state: { state: "moved", nick: "Kasia", returning: true, player_id: "planted" },
      value: { state: "moved", nick: "Kasia" },
    },
  ])("passes on no key outside the contract for $why", ({ state, value }) => {
    expect(parseJoinRequestState(state)).toEqual({ ok: true, value });
  });
});
