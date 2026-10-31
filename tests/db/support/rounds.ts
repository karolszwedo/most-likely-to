import type { QuestionId } from "@/data/questions";
import { anonClient, newPlayerToken, type Host, type TestClient } from "./clients";
import { isRecord } from "./rooms";

// The round's contract (context/archive/2026-10-13-first-live-round/plan.md, Faza 1 #4) and the evening's
// (context/archive/2026-10-15-full-game-evening/plan.md, Faza 1 #2), called through the roles' own doors: start_game,
// reveal_round, next_round, skip_round and end_game as the signed-in host, cast_vote as a guest with its player token
// or as the host by its session, room_lobby as either. supabase/migrations/*_first_live_round.sql implements the
// round and *_full_game_evening.sql the evening (S-03, phase 2); before a function exists, PostgREST answers its call
// with PGRST202 (no such function), the expected red of phase 1.
//
// seed* helpers throw on any failure: beforeAll only, as in rooms.ts. The other calls are probes: they return
// { data, error } and never throw, so a test checks the exact answer, a refusal included.
//
// start_game(p_room_id uuid, p_question_id text): authenticated only. { ok: true } or { ok: false, reason } with
//   reason in room_unknown, room_closed, game_started, not_enough_players, invalid_question; another host's room is
//   room_unknown. Opens round 1 only.
// cast_vote(p_room_id uuid, p_target text, p_player_token text default null, p_round integer default null): anon and
//   authenticated, in one version only (S-03 drops the one without p_round). The voter is the host by auth.uid() or a
//   guest by token, as in room_lobby. p_target is a nick of the room or null (an abstention). p_round is the number of
//   the question the voter saw; its default only makes a call without it a refusal (deferred-review-fixes, F2).
//   { ok: true } and nothing else, or { ok: false, reason } with reason in room_unknown, room_closed, no_round,
//   round_revealed, round_over (p_round missing or not the latest round's number, or the round was skipped),
//   already_voted, unknown_target. A malformed token raises 22023, as in join_room.
// reveal_round(p_room_id uuid, p_round integer default null): authenticated only, in one version only. p_round is the
//   number of the round on the host's screen. { ok: true }, also when already revealed, or { ok: false, reason } with
//   reason in room_unknown, room_closed, no_round, round_over (p_round missing or not the latest round's number, or the
//   round was skipped).
// next_round(p_room_id uuid, p_round integer, p_candidates text[]): authenticated only. "Następne pytanie": p_round is
//   the number of the round on the host's screen, which must be the latest one, revealed or skipped; the new round
//   takes the first candidate not yet played in this room. { ok: true } or { ok: false, reason } with reason in
//   room_unknown, room_closed, no_round (a lobby), round_over (another number), round_in_progress (still voting),
//   no_questions (every candidate played; no new round).
// skip_round(p_room_id uuid, p_round integer, p_candidates text[]): authenticated only. "Pomiń pytanie", only while
//   round p_round, the latest one, is voting: its votes are gone, it stays as a skipped row, and the next round opens
//   as in next_round. { ok: true }, also when no candidate is left (the skipped round stays the latest one), or
//   { ok: false, reason } with reason in room_unknown, room_closed, no_round, round_over (another number, or skipped
//   already), round_revealed.
// end_game(p_room_id uuid): authenticated only. "Zakończ grę" while the game is in play: the room is closed and its
//   round's in-progress state deleted. { ok: true } or { ok: false, reason } with reason in room_unknown, room_closed,
//   no_round (a lobby).
// room_lobby: the fields of S-01 plus round, requests, question_list (S-06, below) and game_totals (S-15, below), with
//   exactly the keys below: a skipped round shows only its number and phase, and a voting round says who may vote in
//   it (eligible: the players when it opened, in seat order) and whether the round before it was skipped (after_skip).
//   requests: the nicks of the latecomers waiting, in the order of asking, for the host; [] for a guest. room_link of a
//   game in play: { status: "started", room_id }. join_room into a game in play: reason game_started.
//
// The latecomer's way in (S-08, context/archive/2026-10-22-latecomer-admission/plan.md, Faza 1), from
// supabase/migrations/*_latecomer_admission.sql:
// request_join(p_link_token text, p_nick text, p_player_token text): anon and authenticated. A request to join a game
//   in play, with the token the Worker keeps in the room's cookie. { ok: true }, also for a player of the room or a
//   request already waiting (nothing changes then), or { ok: false, reason } with reason in room_unknown, room_open
//   (the lobby, which join_room takes), room_closed, invalid_nick, nick_taken (a player's or another waiting
//   request's), requests_full (5 waiting). A rejected request asks again under the new nick. A malformed token raises
//   22023, as in join_room.
// join_request_state(p_room_id uuid, p_player_token text): anon and authenticated, writes nothing.
//   { state: "admitted" } for a player of the room, { state: "closed" } for a closed room,
//   { state: "pending" | "rejected", nick } for the token's request, { state: "none" } otherwise.
// admit_latecomer(p_room_id uuid, p_nick text), reject_latecomer(p_room_id uuid, p_nick text): authenticated only.
//   "Wpuść" (the request becomes a player at the next seat and is deleted) and "Odrzuć" (the request stays, rejected).
//   { ok: true } or { ok: false, reason } with reason in room_unknown (another host's room), request_unknown (no
//   request with that nick waiting, or the room not in play), latecomer_nick_taken (admit only, a backstop).
//
// The game's question list (S-06, context/archive/2026-10-24-question-list-review/plan.md, Faza 1), from
// supabase/migrations/*_question_list_review.sql. Every move on it is authenticated only, the room's host's and the
// lobby's: { ok: true } or { ok: false, reason } with reason in room_unknown (another host's room), room_closed,
// game_started, or one of the move's own below. An entry is named by its position, which never changes.
// open_question_list(p_room_id uuid, p_candidates text[]): "Przejrzyj pytania". The first 15 distinct candidates in the
//   id format, in the given order, become positions 1-15; a list with rows already stays as it is (ok). no_questions
//   when no candidate is usable; more than 1000 candidates raise 22023.
// draw_list_question(p_room_id uuid, p_candidates text[]): "Dolosuj pytanie". The first candidate in the id format on
//   no row of the list (removed and reworded entries included) becomes a new entry at the end. list_full at 100 rows,
//   no_questions when no candidate is left; more than 1000 candidates raise 22023.
// remove_list_question(p_room_id uuid, p_position integer): "Usuń". The entry is marked removed and stays a row.
//   question_unknown when there is no such entry or it is removed already.
// edit_list_question(p_room_id uuid, p_position integer, p_text text): "Popraw". The entry gets a text of its own and
//   keeps its question id. question_unknown as in "Usuń"; invalid_question_text for a text over 400 characters as
//   sent, or outside 1-90 characters once normalized as a nick is and without the trailing "?" and spaces.
// add_own_question(p_room_id uuid, p_text text): "Dodaj własne". A new entry at the end with the text and no question
//   id. invalid_question_text as in "Popraw", list_full at 100 rows.
// With a list, start_game opens round 1 with its first entry not removed, whatever p_question_id, or answers
//   list_empty when every entry is removed; next_round and skip_round take the list's next entry not removed before any
//   candidate, and after the list the first candidate on no row of it. room_lobby adds question_list, the host's in
//   every status of a room with a list: { entries, base_count }, the entries not removed as { position, question_id,
//   text } in the order of positions and the number of rows with a question id; null for a guest and with no list. A
//   voting or revealed round adds question_text: the entry's text when the round has no question_id, else null.
//
// The game's summary (S-15, context/archive/2026-10-25-game-summary/plan.md, Faza 1), from
// supabase/migrations/*_game_summary.sql: room_lobby adds game_totals, the same for the host and every player of the
// room. null in the lobby, while the game is in play and for a closed room with no revealed round; for a closed room
// with one, { revealed, totals }: the number of its revealed rounds, and every player with a result in at least one of
// them as { nick, votes } with the sum of those results, in seat order, zeros included. A skipped round and a round
// ended without a reveal add nothing and are not counted; a latecomer with no result in a revealed round is not there.
//
// The thumb on the reveal (S-11, context/changes/question-reactions-play-data/plan.md, Faza 1), from
// supabase/migrations/*_question_play_data.sql:
// react_round(p_room_id uuid, p_round integer, p_reaction text, p_player_token text default null): anon and
//   authenticated. Any player of the room, the host by auth.uid() or a guest by token, a latecomer let in mid-round
//   included, on the latest round once it is revealed: p_reaction up, down, or none to take the thumb back.
//   { ok: true } and nothing else, or { ok: false, reason } with reason in room_unknown, room_closed, no_round (the
//   lobby, or the round still voting), round_over (p_round missing or not the latest round's number, or the round was
//   skipped). A malformed token or a reaction other than up, down and none raises 22023. Nobody sees a thumb: room_lobby
//   keeps exactly the keys below.
//
// The co-host (S-07, context/changes/co-host-role/plan.md, Faza 1), from supabase/migrations/*_co_host_role.sql. The
// leader is the room's host or a co-host. Since S-07 the leader's seven moves above (start_game, reveal_round,
// next_round, skip_round, end_game, admit_latecomer, reject_latecomer) take p_player_token text default null as their
// last argument and are granted to anon and authenticated, in one version each: the host moves by its session (no
// token), a co-host, who has no session, by its player token. Before any other check, a player of the room without the
// role gets { ok: false, reason: not_leader }, anyone else (no token, another room's token, another host) room_unknown,
// and a malformed token raises 22023. The "authenticated only" above is the state before S-07.
// set_cohost(p_room_id uuid, p_nick text, p_cohost boolean): authenticated only, the room's host's, in the lobby and
//   while the game is in play. Gives (true) or takes (false) the role of the guest with that nick (as compared).
//   { ok: true }, also when the guest has that value already, or { ok: false, reason } with reason in room_unknown
//   (another host's room), room_closed, player_unknown (a nick of no guest of the room, the host's own included).
// room_lobby: each player is { nick, host, cohost }; requests go to every leader; leader_draw, for a leader only and
//   null for anyone else: { categories, adult_categories, list_entries, list_base_count } (the room's picked categories
//   and their 18+ ones, the game's question list's entries not removed and its base_count, both 0 with no list).
//   question_list stays the host's, and role stays host or guest.
//
// The player's colour (S-18, context/changes/player-color-choice/plan.md, Faza 1), from
// supabase/migrations/*_player_color_choice.sql. Every player has a colour 0-19 of the game's palette: create_room,
// join_room and admit_latecomer give the room's first free one (the host 0), and with all 20 taken the number of the
// room's players modulo 20, so from the 21st player on colours repeat.
// set_player_color(p_room_id uuid, p_color integer, p_player_token text default null): anon and authenticated. The
//   player changes their own colour, the host by its session (no token) or a guest by its player token, in the lobby
//   and while the game is in play. { ok: true } and nothing else, also for the colour the player has already, or
//   { ok: false, reason } with reason in room_unknown (no player of this room: no token, another room's token, a
//   latecomer still waiting), room_closed, color_taken (another player of the room has it). A colour outside 0-19 or
//   null, or a malformed token, raises 22023.
// room_lobby: each player is { nick, host, cohost, color }.

// Real question ids from the base, in the first of the seed categories (SEED_CATEGORIES in rooms.ts) and not 18+:
// `satisfies` makes the build fail if an id ever leaves the base. The database checks only the id's format.
export const QUESTION_ID = "na-co-dzien-001" satisfies QuestionId;
export const OTHER_QUESTION_ID = "na-co-dzien-002" satisfies QuestionId;
// An evening's questions, in the order of the base: the scenarios pass them as candidates and expect the first one not
// yet played, written out by hand.
export const EVENING_QUESTION_IDS = [
  "na-co-dzien-001",
  "na-co-dzien-002",
  "na-co-dzien-003",
  "na-co-dzien-004",
] as const satisfies readonly QuestionId[];

// Exact key sets, sorted, of room_lobby and its round. A key outside these lists is a possible leak (counts before the
// reveal, a voter next to a target) until a decision adds it here.
// requests: the nicks of the latecomers waiting, the host's only (S-08). question_list: the game's question list, the
// host's only, null for a guest and with no list (S-06). game_totals: the sums of the reveals, only in a closed room and
// null otherwise (S-15); they are counts per nick that the reveals already showed the whole room, so they hold no
// voter, and the room's every player sees the same ones. leader_draw: what the leader's moves need (the room's
// categories and two numbers of the list), a leader's only and null otherwise (S-07). A player's cohost: the role
// everyone sees by the nick, like host (S-07). A player's color: the number of the player's colour, which everyone sees
// by the nick on the list of players and which no round's data holds (S-18).
export const LOBBY_KEYS = [
  "game_totals",
  "leader_draw",
  "me",
  "players",
  "question_list",
  "requests",
  "role",
  "round",
  "status",
];
export const PLAYER_KEYS = ["cohost", "color", "host", "nick"];
// voted: nicks in seat order, never in the order of voting. after_skip: whether the round before this one was skipped,
// public to everyone and tied to no one's vote. eligible: who may vote in this round, nicks in seat order, tied to no
// one's vote either (S-08). question_text: the text of an own or reworded question of the list, which has no
// question_id; null otherwise (S-06).
export const VOTING_ROUND_KEYS = [
  "after_skip",
  "eligible",
  "me_voted",
  "number",
  "phase",
  "question_id",
  "question_text",
  "voted",
];
// results: every eligible player in seat order, zeros included; counts only, per nick. question_text as in a voting
// round.
export const REVEALED_ROUND_KEYS = [
  "abstained",
  "ballots",
  "number",
  "phase",
  "question_id",
  "question_text",
  "results",
];
export const RESULT_KEYS = ["nick", "votes"];
// A skipped round: its votes are gone, so nothing of them is left to show, not even who voted.
export const SKIPPED_ROUND_KEYS = ["number", "phase"];
// game_totals of a closed room with a revealed round (S-15): revealed, the number of its revealed rounds; totals, one
// entry per player with a result in at least one of them, each exactly RESULT_KEYS (votes: the sum of those results).
export const GAME_TOTALS_KEYS = ["revealed", "totals"];

export interface Answer {
  data: unknown;
  // Kept whole for the log. A refusal by grant is code 42501 with the function's name in message; details would carry a
  // row's values (Postgres DETAIL), which no round call may send back.
  error: { code: string; message: string; details: string | null; hint: string | null } | null;
}

async function call(client: TestClient, fn: string, args: Record<string, unknown>): Promise<Answer> {
  const result = await client.rpc(fn, args);
  const data: unknown = result.data;
  const error = result.error
    ? {
        code: result.error.code,
        message: result.error.message,
        details: result.error.details || null,
        hint: result.error.hint || null,
      }
    : null;
  return { data, error };
}

// The player token of a leader's move (S-07): undefined for the host, who moves by its session, so the call carries no
// p_player_token at all; a guest's token for a co-host, or for a probe of who may move.
function tokenArg(playerToken: string | undefined): Record<string, string> {
  return playerToken === undefined ? {} : { p_player_token: playerToken };
}

export function startGame(
  client: TestClient,
  roomId: string,
  questionId: string,
  playerToken?: string,
): Promise<Answer> {
  return call(client, "start_game", { p_room_id: roomId, p_question_id: questionId, ...tokenArg(playerToken) });
}

// The host votes by its session (no token); a guest sends its player token. null target: an abstention. round: the
// number of the question the voter saw, as the room screen sends it; without it the call carries no p_round at all,
// only in the probes of that refusal.
export function castVote(
  client: TestClient,
  roomId: string,
  target: string | null,
  playerToken?: string,
  round?: number,
): Promise<Answer> {
  return call(client, "cast_vote", {
    p_room_id: roomId,
    p_target: target,
    ...(playerToken === undefined ? {} : { p_player_token: playerToken }),
    ...(round === undefined ? {} : { p_round: round }),
  });
}

// round: the number of the round on the leader's screen; without it the call carries no p_round at all, only in the
// probes of that refusal.
export function revealRound(client: TestClient, roomId: string, round?: number, playerToken?: string): Promise<Answer> {
  return call(client, "reveal_round", {
    p_room_id: roomId,
    ...(round === undefined ? {} : { p_round: round }),
    ...tokenArg(playerToken),
  });
}

// round: the number of the round on the leader's screen. candidates: the game's pool in the Worker's order; null and
// malformed ids only in the probes of the candidates' filter.
export function nextRound(
  client: TestClient,
  roomId: string,
  round: number,
  candidates: (string | null)[],
  playerToken?: string,
): Promise<Answer> {
  return call(client, "next_round", {
    p_room_id: roomId,
    p_round: round,
    p_candidates: candidates,
    ...tokenArg(playerToken),
  });
}

export function skipRound(
  client: TestClient,
  roomId: string,
  round: number,
  candidates: (string | null)[],
  playerToken?: string,
): Promise<Answer> {
  return call(client, "skip_round", {
    p_room_id: roomId,
    p_round: round,
    p_candidates: candidates,
    ...tokenArg(playerToken),
  });
}

// A thumb: the host by its session (no token), a guest with its player token. round: the number of the round on the
// player's screen. reaction: "up", "down" or "none"; anything else only in the probe of that refusal.
export function reactRound(
  client: TestClient,
  roomId: string,
  round: number,
  reaction: string,
  playerToken?: string,
): Promise<Answer> {
  return call(client, "react_round", {
    p_room_id: roomId,
    p_round: round,
    p_reaction: reaction,
    ...(playerToken === undefined ? {} : { p_player_token: playerToken }),
  });
}

export function endGame(client: TestClient, roomId: string, playerToken?: string): Promise<Answer> {
  return call(client, "end_game", { p_room_id: roomId, ...tokenArg(playerToken) });
}

export function roomLobby(client: TestClient, roomId: string, playerToken?: string): Promise<Answer> {
  return call(client, "room_lobby", {
    p_room_id: roomId,
    ...(playerToken === undefined ? {} : { p_player_token: playerToken }),
  });
}

export function roomLink(linkToken: string): Promise<Answer> {
  return call(anonClient(), "room_link", { p_link_token: linkToken });
}

// A new guest on a new phone, with a fresh player token like the Worker's cookie.
export function joinRoom(linkToken: string, nick: string): Promise<Answer> {
  return call(anonClient(), "join_room", { p_link_token: linkToken, p_nick: nick, p_player_token: newPlayerToken() });
}

// A latecomer on a new phone, with no session. playerToken: the token of the room's cookie (newPlayerToken()), which
// the test keeps to ask again, follow the request and, once let in, act as the new player.
export function requestJoin(linkToken: string, nick: string, playerToken: string): Promise<Answer> {
  return call(anonClient(), "request_join", { p_link_token: linkToken, p_nick: nick, p_player_token: playerToken });
}

// The latecomer's own request, as its waiting screen asks for it.
export function joinRequestState(roomId: string, playerToken: string): Promise<Answer> {
  return call(anonClient(), "join_request_state", { p_room_id: roomId, p_player_token: playerToken });
}

// "Wpuść" as a leader: nick is the nick on the leader's list.
export function admitLatecomer(
  client: TestClient,
  roomId: string,
  nick: string,
  playerToken?: string,
): Promise<Answer> {
  return call(client, "admit_latecomer", { p_room_id: roomId, p_nick: nick, ...tokenArg(playerToken) });
}

// "Odrzuć" as a leader: nick is the nick on the leader's list.
export function rejectLatecomer(
  client: TestClient,
  roomId: string,
  nick: string,
  playerToken?: string,
): Promise<Answer> {
  return call(client, "reject_latecomer", { p_room_id: roomId, p_nick: nick, ...tokenArg(playerToken) });
}

// The role button as the host (S-07): cohost true gives the co-host role to the guest with that nick, false takes it.
export function setCohost(client: TestClient, roomId: string, nick: string, cohost: boolean): Promise<Answer> {
  return call(client, "set_cohost", { p_room_id: roomId, p_nick: nick, p_cohost: cohost });
}

// A player's own colour (S-18): the host by its session (no token, so the call carries no p_player_token at all), a
// guest with its player token. color: a number of the palette, 0-19; anything else, null included, only in the probes
// of that refusal.
export function setPlayerColor(
  client: TestClient,
  roomId: string,
  color: number | null,
  playerToken?: string,
): Promise<Answer> {
  return call(client, "set_player_color", { p_room_id: roomId, p_color: color, ...tokenArg(playerToken) });
}

// "Przejrzyj pytania" as the host. candidates: the pool of the picked categories in the Worker's order; null and
// malformed ids only in the probes of the candidates' filter.
export function openQuestionList(client: TestClient, roomId: string, candidates: (string | null)[]): Promise<Answer> {
  return call(client, "open_question_list", { p_room_id: roomId, p_candidates: candidates });
}

// "Dolosuj pytanie" as the host, with candidates as in openQuestionList.
export function drawListQuestion(client: TestClient, roomId: string, candidates: (string | null)[]): Promise<Answer> {
  return call(client, "draw_list_question", { p_room_id: roomId, p_candidates: candidates });
}

// "Usuń" as the host: position is the entry's place on the host's list.
export function removeListQuestion(client: TestClient, roomId: string, position: number): Promise<Answer> {
  return call(client, "remove_list_question", { p_room_id: roomId, p_position: position });
}

// "Popraw" as the host: text is what the host typed, before the database's normalization.
export function editListQuestion(client: TestClient, roomId: string, position: number, text: string): Promise<Answer> {
  return call(client, "edit_list_question", { p_room_id: roomId, p_position: position, p_text: text });
}

// "Dodaj własne" as the host: text as in editListQuestion.
export function addOwnQuestion(client: TestClient, roomId: string, text: string): Promise<Answer> {
  return call(client, "add_own_question", { p_room_id: roomId, p_text: text });
}

// The function's own refusal code, never its arguments: they hold nicks, vote targets and tokens.
function refusalOf(answer: Answer): string {
  if (answer.error) return answer.error.code;
  return isRecord(answer.data) && typeof answer.data.reason === "string" ? answer.data.reason : "an unexpected shape";
}

function accepted(answer: Answer): boolean {
  return answer.error === null && isRecord(answer.data) && answer.data.ok === true;
}

// "Zacznij grę" as the host. Throws on any failure: beforeAll only.
export async function seedStartGame(host: Host, roomId: string, questionId: string = QUESTION_ID): Promise<void> {
  const answer = await startGame(host.client, roomId, questionId);
  if (!accepted(answer)) {
    throw new Error(`start_game refused the seed round: ${refusalOf(answer)}`);
  }
}

// A vote that is a precondition, not the thing under test, with the number of the question the voter saw. playerToken
// undefined: the host's vote. Throws on any failure: beforeAll only.
export async function seedVote(
  client: TestClient,
  roomId: string,
  target: string | null,
  playerToken: string | undefined,
  round: number,
): Promise<void> {
  const answer = await castVote(client, roomId, target, playerToken, round);
  if (!accepted(answer)) {
    throw new Error(`cast_vote refused the seed vote: ${refusalOf(answer)}`);
  }
}

// "Odsłoń wynik" of round `round` as the host, as a precondition. Throws on any failure: beforeAll only.
export async function seedReveal(host: Host, roomId: string, round: number): Promise<void> {
  const answer = await revealRound(host.client, roomId, round);
  if (!accepted(answer)) {
    throw new Error(`reveal_round refused the seed reveal: ${refusalOf(answer)}`);
  }
}

// "Następne pytanie" as the host, as a precondition. Throws on any failure: beforeAll only.
export async function seedNextRound(host: Host, roomId: string, round: number, candidates: string[]): Promise<void> {
  const answer = await nextRound(host.client, roomId, round, candidates);
  if (!accepted(answer)) {
    throw new Error(`next_round refused the seed round: ${refusalOf(answer)}`);
  }
}

// "Pomiń pytanie" as the host, as a precondition. Throws on any failure: beforeAll only.
export async function seedSkipRound(host: Host, roomId: string, round: number, candidates: string[]): Promise<void> {
  const answer = await skipRound(host.client, roomId, round, candidates);
  if (!accepted(answer)) {
    throw new Error(`skip_round refused the seed skip: ${refusalOf(answer)}`);
  }
}

// The round of a room_lobby answer, or null when there is none (a failed call included). Never throws.
export function roundOf(answer: Answer): Record<string, unknown> | null {
  const round: unknown = isRecord(answer.data) ? answer.data.round : null;
  return isRecord(round) ? round : null;
}

// Sorted keys of a record, for the exact key-set checks; [] for anything else. Never throws.
export function keysOf(value: unknown): string[] {
  return isRecord(value) ? Object.keys(value).sort() : [];
}
