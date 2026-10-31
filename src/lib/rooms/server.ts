import type { SupabaseClient } from "@supabase/supabase-js";
import { ringRoom, sendEmote } from "@/lib/live-sync/server";
import { logEvent } from "@/lib/log";
import type { EmoteMessage } from "@/lib/rooms/emotes";
import { questionPool, questionsLeft, questionText, type QuestionSelection } from "@/lib/rounds/draw";
import {
  parseJoinRequestState,
  parseLobbyState,
  type GameQuestionList,
  type JoinRequestState,
  type LeaderDraw,
  type ListQuestion,
  type LobbyState,
  type RoomView,
} from "@/lib/rooms/shared";
import { gameSummary } from "@/lib/rooms/summary";

// Every database call of the room screens, in one place. The functions come from supabase/migrations/*_room_lobby.sql,
// *_first_live_round.sql, *_full_game_evening.sql, *_round_number_required.sql, *_latecomer_admission.sql,
// *_question_list_review.sql, *_game_summary.sql, *_question_play_data.sql, *_co_host_role.sql and
// *_player_color_choice.sql; failures come back as codes for the URL or the JSON answer (src/lib/rooms/errors.ts).
// Logs go only through src/lib/log.ts, never with an RPC's arguments: they hold nicks, player tokens, link codes,
// a vote's target and the text of a question the host typed.

export interface RoomFailure {
  ok: false;
  reason: string;
}

// A game's action (start, vote, reveal, thumb, next, skip, end), a latecomer's request to join, the leader's answer to
// it ("Wpuść", "Odrzuć"), the host's role button (set_cohost), a player's pick of a colour (set_player_color) and the
// host's moves on the game's question list ("Przejrzyj pytania", "Dolosuj pytanie", "Usuń", "Popraw", "Dodaj własne"):
// the database answers { ok: true } and nothing else, or its refusal.
export type ActionResult = { ok: true } | RoomFailure;

export type CreateRoomResult = { ok: true; roomId: string; closedRoomId: string | null } | RoomFailure;
// "started": a game in play; the /j/<code> page lets the room's own players back in, and anyone else asks the host to
// let them in (request_join). One member per status, so a check of one status narrows the rest.
export type RoomLinkResult =
  | { ok: true; status: "open"; roomId: string }
  | { ok: true; status: "started"; roomId: string }
  | { ok: true; status: "closed" }
  | { ok: true; status: "unknown" }
  | RoomFailure;
export type JoinRoomResult = { ok: true; roomId: string } | RoomFailure;
// lobby is null for anyone who is neither the host nor a player of the room, and for a room that does not exist.
export type RoomLobbyResult = { ok: true; lobby: LobbyState | null } | RoomFailure;
export type JoinRequestStateResult = { ok: true; request: JoinRequestState } | RoomFailure;
// selection is null when the signed-in user does not see the room (not its host, or no such room).
export type RoomCategoriesResult = { ok: true; selection: QuestionSelection | null } | RoomFailure;
// The room's categories for the leader's draw; anyone who does not lead gets a refusal instead (leaderSelection).
export type LeaderSelectionResult = { ok: true; selection: QuestionSelection } | RoomFailure;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isStringList(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((entry) => typeof entry === "string");
}

function errorName(error: unknown): string {
  return error instanceof Error ? error.name : "unknown";
}

// postgrest-js turns a failed fetch (network, DNS, timeout) into status 0, code "" and "<name>: <message>" as the
// message. Only the name is kept, and only when it looks like one: the rest may echo the request.
function transportErrorName(message: string): string | undefined {
  return /^([A-Za-z]{1,64}):/.exec(message)?.[1];
}

// Never logs the arguments or the error message: they can hold a nick, a player token, a link code or a vote's target.
// A network error (status 0) or a 5xx means Supabase itself is down, e.g. a paused project.
function logFailure(failure: { op: string; roomId?: string; status: number; code?: string; errName?: string }) {
  logEvent("error", failure);
  return {
    ok: false as const,
    reason: failure.status === 0 || failure.status >= 500 ? "service_unavailable" : "unexpected",
  };
}

// A query's or an RPC's own error: its status and SQLSTATE (or PostgREST code), never its message or details.
function queryFailure(
  op: string,
  roomId: string | undefined,
  result: { status: number; error: { code: string; message: string } },
): RoomFailure {
  return logFailure({
    op,
    roomId,
    status: result.status,
    code: result.error.code,
    errName: result.status === 0 ? transportErrorName(result.error.message) : undefined,
  });
}

// Always a POST: rpc(…, { get: true }) would put the arguments, a guest's token or a vote's target among them, into the
// URL and the logs.
async function callRpc(
  supabase: SupabaseClient,
  fn: string,
  args: Record<string, unknown>,
  roomId?: string,
): Promise<{ ok: true; data: unknown } | RoomFailure> {
  try {
    const result = await supabase.rpc(fn, args);
    if (result.error) {
      return queryFailure(fn, roomId, result);
    }
    const data: unknown = result.data;
    return { ok: true, data };
  } catch (error) {
    return logFailure({ op: fn, roomId, status: 0, errName: errorName(error) });
  }
}

// field: the part of the answer that did not pass, so a database and a Worker out of step say where (audit P6).
function unexpectedShape(op: string, field: string, roomId?: string): RoomFailure {
  logEvent("error", { op, step: "shape", field, roomId });
  return { ok: false, reason: "unexpected" };
}

// The function's own refusal ({ok: false, reason}) passes through as is: its reasons are the codes in errors.ts.
function refusal(data: Record<string, unknown>): RoomFailure | null {
  return data.ok === false && typeof data.reason === "string" ? { ok: false, reason: data.reason } : null;
}

export async function createRoom(
  supabase: SupabaseClient,
  input: { nick: string; linkToken: string; categories: string[]; adultCategories: string[]; confirmClose: boolean },
): Promise<CreateRoomResult> {
  const result = await callRpc(supabase, "create_room", {
    p_nick: input.nick,
    p_link_token: input.linkToken,
    p_categories: input.categories,
    p_adult_categories: input.adultCategories,
    p_confirm_close: input.confirmClose,
  });
  if (!result.ok) return result;

  const { data } = result;
  if (!isRecord(data)) return unexpectedShape("create_room", "root");
  if (data.ok === true && typeof data.room_id === "string") {
    return {
      ok: true,
      roomId: data.room_id,
      closedRoomId: typeof data.closed_room_id === "string" ? data.closed_room_id : null,
    };
  }
  return refusal(data) ?? unexpectedShape("create_room", "ok");
}

export async function roomLink(supabase: SupabaseClient, linkToken: string): Promise<RoomLinkResult> {
  const result = await callRpc(supabase, "room_link", { p_link_token: linkToken });
  if (!result.ok) return result;

  const { data } = result;
  if (!isRecord(data)) return unexpectedShape("room_link", "root");
  const { status, room_id: roomId } = data;
  if (status === "open" || status === "started") {
    return typeof roomId === "string" ? { ok: true, status, roomId } : unexpectedShape("room_link", "room_id");
  }
  if (status === "closed" || status === "unknown") {
    return { ok: true, status };
  }
  return unexpectedShape("room_link", "status");
}

export async function joinRoom(
  supabase: SupabaseClient,
  input: { linkToken: string; nick: string; playerToken: string },
): Promise<JoinRoomResult> {
  const result = await callRpc(supabase, "join_room", {
    p_link_token: input.linkToken,
    p_nick: input.nick,
    p_player_token: input.playerToken,
  });
  if (!result.ok) return result;

  const { data } = result;
  if (!isRecord(data)) return unexpectedShape("join_room", "root");
  if (data.ok === true && typeof data.room_id === "string") {
    return { ok: true, roomId: data.room_id };
  }
  return refusal(data) ?? unexpectedShape("join_room", "ok");
}

// A latecomer asks the host to let them into a game in play (S-08), with the token the Worker keeps in the room's
// cookie: it becomes the player's token once the host lets them in. { ok: true } also when nothing changed (a request
// already waiting, or a player already). The database raises on a token in another form, so the caller passes one that
// matches PLAYER_TOKEN_PATTERN.
export async function requestJoin(
  supabase: SupabaseClient,
  linkToken: string,
  nick: string,
  playerToken: string,
): Promise<ActionResult> {
  const result = await callRpc(supabase, "request_join", {
    p_link_token: linkToken,
    p_nick: nick,
    p_player_token: playerToken,
  });
  return result.ok ? actionResult("request_join", result.data) : result;
}

// How the latecomer's own request stands, by the token from the room's cookie: never the question, the players or
// anyone else's request. Writes nothing, so the /j/<code> page may ask it on a GET.
export async function joinRequestState(
  supabase: SupabaseClient,
  roomId: string,
  playerToken: string,
): Promise<JoinRequestStateResult> {
  const result = await callRpc(
    supabase,
    "join_request_state",
    { p_room_id: roomId, p_player_token: playerToken },
    roomId,
  );
  if (!result.ok) return result;

  const parsed = parseJoinRequestState(result.data);
  return parsed.ok ? { ok: true, request: parsed.value } : unexpectedShape("join_request_state", parsed.field, roomId);
}

// The host is recognised by the session (auth.uid()), a guest by the token from their cookie.
export async function roomLobby(
  supabase: SupabaseClient,
  roomId: string,
  playerToken?: string | null,
): Promise<RoomLobbyResult> {
  const result = await callRpc(
    supabase,
    "room_lobby",
    { p_room_id: roomId, p_player_token: playerToken ?? null },
    roomId,
  );
  if (!result.ok) return result;

  if (result.data === null) return { ok: true, lobby: null };
  const parsed = parseLobbyState(result.data);
  return parsed.ok ? { ok: true, lobby: parsed.value } : unexpectedShape("room_lobby", parsed.field, roomId);
}

const QUESTION_ID_PATTERN = /^[a-z0-9-]+-[0-9]{3}$/;

// The text of a question of the base, or null for an id the base does not have (the database checks only the id's
// format), logged with the id when it has the id's form. Never with a text: an own question's text is the host's.
function baseQuestionText(questionId: string, roomId: string): string | null {
  const text = questionText(questionId);
  if (text === null) {
    const code = QUESTION_ID_PATTERN.test(questionId) ? questionId : undefined;
    logEvent("error", { op: "question_text", step: "unknown_question", roomId, code });
  }
  return text;
}

// The game's question list as its host's screen shows it: the host's own text of an entry, else its text from the
// base. An entry whose question the base does not have is left out, and logged as in a round: the screen has no text
// to show for it.
function listQuestions(list: GameQuestionList, roomId: string): ListQuestion[] {
  const questions: ListQuestion[] = [];
  for (const entry of list.entries) {
    const text = entry.text ?? (entry.question_id === null ? null : baseQuestionText(entry.question_id, roomId));
    if (text === null) continue;
    questions.push({ position: entry.position, text, own: entry.text !== null });
  }
  return questions;
}

// The room's state for its screen: the round gets its question's text from the base, on the server only
// (context/foundation/lessons.md, "Pytania gry tylko po stronie serwera"), or the host's own text of an own or reworded
// question of the game's question list (question_text). A question the base does not have (the database checks only
// the id's format) goes out as null: the round goes on, the screen says it could not load the question, and the log
// says which id. A skipped round has no question to show. questionsLeft from leaderQuestionsLeft. question_list stays
// here: the host in the lobby gets the list's questions as text (questions), and nobody else gets anything of it.
// game_totals stays here too: a closed room's players get only the summary made of it (gameSummary, S-15), never the
// sums outside it. So does leader_draw (S-07): the screen gets only whether the person leads (leader), the host or the
// player who is me with the co-host role, as private.leader_refusal decides it for the moves.
export function roomView(lobby: LobbyState, roomId: string, questionsLeft: boolean | null): RoomView {
  const { question_list: list, game_totals: totals, leader_draw: _leaderDraw, ...state } = lobby;
  const leader = state.role === "host" || state.players.some((player) => player.nick === state.me && player.cohost);
  const questions =
    state.role === "host" && state.status === "lobby" && list !== null ? listQuestions(list, roomId) : null;
  const summary = totals === null ? null : gameSummary(totals);
  const { round } = state;
  if (round === null || round.phase === "skipped") {
    return { ...state, leader, round, questionsLeft, questions, summary };
  }
  // parseLobbyState refuses a round with neither.
  const question =
    round.question_text ?? (round.question_id === null ? null : baseQuestionText(round.question_id, roomId));
  return { ...state, leader, round: { ...round, question }, questionsLeft, questions, summary };
}

// The leader's draw as the draw takes it (src/lib/rounds/draw.ts).
function drawSelection(draw: LeaderDraw): QuestionSelection {
  return { categories: draw.categories, adultCategories: draw.adult_categories };
}

// For a leader (the host or a co-host, S-07) once the latest round is revealed or skipped: whether the game has a
// question not played yet (the game's question list first, then the pool of the picked categories; questionsLeft in
// src/lib/rounds/draw.ts), from room_lobby's leader_draw, so the screen offers "Następne pytanie" or says the questions
// ran out. null in every other state and for anyone who does not lead. On null the two screens differ on purpose: after
// a reveal (RoundReveal) the screen still offers "Następne pytanie", and if none is left the route answers
// questions_ran_out (next_round's no_questions, src/pages/api/rooms/[id]/next.ts); a skipped latest round
// (RoundSkipped) offers only "Zakończ grę", because skip_round opens the next question whenever there is one, so a skip
// that stayed the latest round means the game's questions had run out.
export function leaderQuestionsLeft(lobby: LobbyState): boolean | null {
  const { round, leader_draw: draw } = lobby;
  if (draw === null || lobby.status !== "playing" || round === null || round.phase === "voting") return null;
  return questionsLeft(questionPool(drawSelection(draw)).length, draw, round.number);
}

// The room's categories for the leader's draw (start, "Następne pytanie", "Pomiń pytanie"), from room_lobby's
// leader_draw: the host by the session, a co-host by the token from the room's cookie (S-07). Someone who is neither the
// host nor a player of the room, and a room that does not exist, get room_unknown, the same 404 as OUTSIDE_ROOM in
// src/lib/rooms/json-route.ts; a player of the room without the co-host role gets not_leader, as the move itself would
// (private.leader_refusal). The database checks the role again in the move, under the room's lock.
export async function leaderSelection(
  supabase: SupabaseClient,
  roomId: string,
  playerToken: string | null,
): Promise<LeaderSelectionResult> {
  const result = await roomLobby(supabase, roomId, playerToken);
  if (!result.ok) return result;
  if (!result.lobby) return { ok: false, reason: "room_unknown" };
  if (!result.lobby.leader_draw) return { ok: false, reason: "not_leader" };
  return { ok: true, selection: drawSelection(result.lobby.leader_draw) };
}

// A round's answer: { ok: true } and nothing else, or the function's refusal. roomId only for the log line: a request
// to join knows the room only by its link code, which never goes into a log.
function actionResult(fn: string, data: unknown, roomId?: string): ActionResult {
  if (!isRecord(data)) return unexpectedShape(fn, "root", roomId);
  if (data.ok === true) return { ok: true };
  return refusal(data) ?? unexpectedShape(fn, "ok", roomId);
}

// The leader's moves below (start, reveal, next, skip, end, "Wpuść", "Odrzuć"): the host by the session (no token), a
// co-host by the token from the room's cookie (S-07); the database decides who leads (private.leader_refusal), and a
// guest of the room without the role gets not_leader.

// "Zacznij grę": a leader's; the question was drawn by the Worker (src/lib/rounds/draw.ts). With the game's question
// list the database opens its first entry not removed instead, and answers list_empty when every entry is removed.
export async function startGame(
  supabase: SupabaseClient,
  roomId: string,
  questionId: string,
  playerToken: string | null,
): Promise<ActionResult> {
  const result = await callRpc(
    supabase,
    "start_game",
    { p_room_id: roomId, p_question_id: questionId, p_player_token: playerToken },
    roomId,
  );
  return result.ok ? actionResult("start_game", result.data, roomId) : result;
}

// A vote: the host by the session (no token), a guest by the room's cookie. target is a nick of the room or null for
// an abstention; it travels only in this POST's body, and the answer never carries it back. round is the number of the
// question on the voter's screen: another one than the latest round's is round_over.
export async function castVote(
  supabase: SupabaseClient,
  roomId: string,
  target: string | null,
  playerToken: string | null,
  round: number,
): Promise<ActionResult> {
  const result = await callRpc(
    supabase,
    "cast_vote",
    { p_room_id: roomId, p_target: target, p_player_token: playerToken, p_round: round },
    roomId,
  );
  return result.ok ? actionResult("cast_vote", result.data, roomId) : result;
}

// "Odsłoń wynik": a leader's, at any time; a second reveal is ok too. round is the number of the round on the leader's
// screen: another one than the latest round's, or a skipped round, is round_over.
export async function revealRound(
  supabase: SupabaseClient,
  roomId: string,
  round: number,
  playerToken: string | null,
): Promise<ActionResult> {
  const result = await callRpc(
    supabase,
    "reveal_round",
    { p_room_id: roomId, p_round: round, p_player_token: playerToken },
    roomId,
  );
  return result.ok ? actionResult("reveal_round", result.data, roomId) : result;
}

// A thumb on the question just revealed (S-11): any player of the room, the host by the session (no token), a guest by
// the room's cookie. round is the number of the round on the player's screen, which must be the latest one and
// revealed; "none" takes the thumb back. Nobody else sees it, and the answer never carries it back.
export async function reactRound(
  supabase: SupabaseClient,
  roomId: string,
  round: number,
  reaction: "up" | "down" | "none",
  playerToken?: string | null,
): Promise<ActionResult> {
  const result = await callRpc(
    supabase,
    "react_round",
    { p_room_id: roomId, p_round: round, p_reaction: reaction, p_player_token: playerToken ?? null },
    roomId,
  );
  return result.ok ? actionResult("react_round", result.data, roomId) : result;
}

// "Następne pytanie": a leader's. round is the number of the round on the leader's screen, revealed or skipped;
// candidates the game's pool in random order (src/lib/rounds/draw.ts), of which the database opens the first one not
// played yet.
export async function nextRound(
  supabase: SupabaseClient,
  roomId: string,
  round: number,
  candidates: string[],
  playerToken: string | null,
): Promise<ActionResult> {
  const result = await callRpc(
    supabase,
    "next_round",
    { p_room_id: roomId, p_round: round, p_candidates: candidates, p_player_token: playerToken },
    roomId,
  );
  return result.ok ? actionResult("next_round", result.data, roomId) : result;
}

// "Pomiń pytanie": a leader's, while round `round` is voting. Its votes are gone, and the next question opens at once
// from candidates, as in nextRound.
export async function skipRound(
  supabase: SupabaseClient,
  roomId: string,
  round: number,
  candidates: string[],
  playerToken: string | null,
): Promise<ActionResult> {
  const result = await callRpc(
    supabase,
    "skip_round",
    { p_room_id: roomId, p_round: round, p_candidates: candidates, p_player_token: playerToken },
    roomId,
  );
  return result.ok ? actionResult("skip_round", result.data, roomId) : result;
}

// "Zakończ grę": a leader's, while the game is in play. The room is closed for everyone.
export async function endGame(
  supabase: SupabaseClient,
  roomId: string,
  playerToken: string | null,
): Promise<ActionResult> {
  const result = await callRpc(supabase, "end_game", { p_room_id: roomId, p_player_token: playerToken }, roomId);
  return result.ok ? actionResult("end_game", result.data, roomId) : result;
}

// "Wpuść": a leader's, while the game is in play. nick is one on the leader's list of requests; the latecomer becomes a
// player at the next seat and votes from the next question on. It travels only in this POST's body.
export async function admitLatecomer(
  supabase: SupabaseClient,
  roomId: string,
  nick: string,
  playerToken: string | null,
): Promise<ActionResult> {
  const result = await callRpc(
    supabase,
    "admit_latecomer",
    { p_room_id: roomId, p_nick: nick, p_player_token: playerToken },
    roomId,
  );
  return result.ok ? actionResult("admit_latecomer", result.data, roomId) : result;
}

// "Odrzuć": a leader's, as "Wpuść". The request stays, turned away: the latecomer's screen says so, and they may ask
// again.
export async function rejectLatecomer(
  supabase: SupabaseClient,
  roomId: string,
  nick: string,
  playerToken: string | null,
): Promise<ActionResult> {
  const result = await callRpc(
    supabase,
    "reject_latecomer",
    { p_room_id: roomId, p_nick: nick, p_player_token: playerToken },
    roomId,
  );
  return result.ok ? actionResult("reject_latecomer", result.data, roomId) : result;
}

// The host's role button (S-07): the host's session only, in the lobby and while the game is in play. nick is a guest's
// nick on the host's list of players; cohost true gives the co-host role, false takes it, and the same value twice is
// ok. A nick no guest of the room has (the host's own included) is player_unknown. The nick travels only in this POST's
// body.
export async function setCohost(
  supabase: SupabaseClient,
  roomId: string,
  nick: string,
  cohost: boolean,
): Promise<ActionResult> {
  const result = await callRpc(supabase, "set_cohost", { p_room_id: roomId, p_nick: nick, p_cohost: cohost }, roomId);
  return result.ok ? actionResult("set_cohost", result.data, roomId) : result;
}

// A player's own colour (S-18): any player of the room, the host by the session (no token), a guest by the room's
// cookie, in the lobby and while the game is in play. color is a colour of the palette, 0-19 (the database raises on
// anything else, so the caller passes one); the player's own colour again is ok. Another player's colour is
// color_taken, a closed room room_closed. The colour travels only in this POST's body, never in a log line.
export async function setPlayerColor(
  supabase: SupabaseClient,
  roomId: string,
  color: number,
  playerToken: string | null,
): Promise<ActionResult> {
  const result = await callRpc(
    supabase,
    "set_player_color",
    { p_room_id: roomId, p_color: color, p_player_token: playerToken },
    roomId,
  );
  return result.ok ? actionResult("set_player_color", result.data, roomId) : result;
}

// "Przejrzyj pytania": the host's session, in the lobby. candidates is the game's pool in random order
// (src/lib/rounds/draw.ts), of which the database writes the first 15 as the game's question list; a list that exists
// already stays as it is (ok).
export async function openQuestionList(
  supabase: SupabaseClient,
  roomId: string,
  candidates: string[],
): Promise<ActionResult> {
  const result = await callRpc(supabase, "open_question_list", { p_room_id: roomId, p_candidates: candidates }, roomId);
  return result.ok ? actionResult("open_question_list", result.data, roomId) : result;
}

// "Dolosuj pytanie": the host's session, in the lobby. candidates as in openQuestionList; the first one on no row of
// the list becomes a new entry at its end.
export async function drawListQuestion(
  supabase: SupabaseClient,
  roomId: string,
  candidates: string[],
): Promise<ActionResult> {
  const result = await callRpc(supabase, "draw_list_question", { p_room_id: roomId, p_candidates: candidates }, roomId);
  return result.ok ? actionResult("draw_list_question", result.data, roomId) : result;
}

// "Usuń": the host's session, in the lobby. position is the entry's handle on the host's list; the entry is marked
// removed and its question does not come up in this game.
export async function removeListQuestion(
  supabase: SupabaseClient,
  roomId: string,
  position: number,
): Promise<ActionResult> {
  const result = await callRpc(supabase, "remove_list_question", { p_room_id: roomId, p_position: position }, roomId);
  return result.ok ? actionResult("remove_list_question", result.data, roomId) : result;
}

// "Popraw": the host's session, in the lobby. text is what the host typed, which the database normalizes and checks
// (1-90 characters); it travels only in this POST's body.
export async function editListQuestion(
  supabase: SupabaseClient,
  roomId: string,
  position: number,
  text: string,
): Promise<ActionResult> {
  const result = await callRpc(
    supabase,
    "edit_list_question",
    { p_room_id: roomId, p_position: position, p_text: text },
    roomId,
  );
  return result.ok ? actionResult("edit_list_question", result.data, roomId) : result;
}

// "Dodaj własne": the host's session, in the lobby. text as in editListQuestion; the own question becomes a new entry
// at the end of the list.
export async function addOwnQuestion(supabase: SupabaseClient, roomId: string, text: string): Promise<ActionResult> {
  const result = await callRpc(supabase, "add_own_question", { p_room_id: roomId, p_text: text }, roomId);
  return result.ok ? actionResult("add_own_question", result.data, roomId) : result;
}

// The host's open room, read through RLS: a host has at most one room in the lobby or with a game in play.
export async function hostOpenRoomId(
  supabase: SupabaseClient,
): Promise<{ ok: true; roomId: string | null } | RoomFailure> {
  try {
    const result = await supabase.from("rooms").select("id").in("status", ["lobby", "playing"]).limit(1).maybeSingle();
    if (result.error) {
      return queryFailure("open_room", undefined, result);
    }
    const row: unknown = result.data;
    return { ok: true, roomId: isRecord(row) && typeof row.id === "string" ? row.id : null };
  } catch (error) {
    return logFailure({ op: "open_room", status: 0, errName: errorName(error) });
  }
}

// The room's link code, through RLS: only the host reads it.
export async function hostLinkToken(
  supabase: SupabaseClient,
  roomId: string,
): Promise<{ ok: true; linkToken: string | null } | RoomFailure> {
  try {
    const result = await supabase.from("rooms").select("link_token").eq("id", roomId).maybeSingle();
    if (result.error) {
      return queryFailure("link_code", roomId, result);
    }
    const row: unknown = result.data;
    return { ok: true, linkToken: isRecord(row) && typeof row.link_token === "string" ? row.link_token : null };
  } catch (error) {
    return logFailure({ op: "link_code", roomId, status: 0, errName: errorName(error) });
  }
}

// The categories the host picked for the room, through RLS: only the host reads them. The draw filters them through
// the question base, because the database checks only their shape.
export async function hostRoomCategories(supabase: SupabaseClient, roomId: string): Promise<RoomCategoriesResult> {
  try {
    const result = await supabase.from("rooms").select("categories, adult_categories").eq("id", roomId).maybeSingle();
    if (result.error) {
      return queryFailure("room_categories", roomId, result);
    }
    const row: unknown = result.data;
    if (row === null) return { ok: true, selection: null };
    if (!isRecord(row)) return unexpectedShape("room_categories", "root", roomId);
    const { categories, adult_categories: adultCategories } = row;
    if (!isStringList(categories)) return unexpectedShape("room_categories", "categories", roomId);
    if (!isStringList(adultCategories)) return unexpectedShape("room_categories", "adult_categories", roomId);
    return { ok: true, selection: { categories, adultCategories } };
  } catch (error) {
    return logFailure({ op: "room_categories", roomId, status: 0, errName: errorName(error) });
  }
}

// The part of locals.cfContext (the Worker's ExecutionContext from the Cloudflare adapter) the bell and an emote need.
// Typed here because the project has no Workers types, so the adapter's own type resolves to any.
interface BellLocals {
  cfContext?: { waitUntil(promise: Promise<unknown>): void };
}

// Wakes everyone on the room's channel: they fetch the room's state again. Workers may cut a promise still running
// after the response, so the bell goes through waitUntil; without an execution context it is awaited instead. A failed
// bell is only logged (ringRoom logs it): the players' 15 s polling catches up.
export async function ringLobby(locals: BellLocals, supabase: SupabaseClient, roomId: string): Promise<void> {
  const ring = ringRoom(supabase, roomId, Date.now()).then(
    () => undefined,
    // Only removeChannel's failure gets here; ringRoom catches its own.
    (error: unknown) => {
      logEvent("error", { op: "ring", step: "remove_channel", roomId, errName: errorName(error) });
    },
  );
  if (locals.cfContext) {
    locals.cfContext.waitUntil(ring);
    return;
  }
  await ring;
}

// A player's emote to everyone on the room's channel (S-16), the player too, sent as the bell is: through waitUntil, or
// awaited without an execution context. A failed send is only logged (sendEmote logs it, never the emote or the nick):
// that emote is lost, and nothing else in the room depends on it.
export async function broadcastEmote(
  locals: BellLocals,
  supabase: SupabaseClient,
  roomId: string,
  message: EmoteMessage,
): Promise<void> {
  const send = sendEmote(supabase, roomId, message).then(
    () => undefined,
    // Only removeChannel's failure gets here; sendEmote catches its own.
    (error: unknown) => {
      logEvent("error", { op: "emote_send", step: "remove_channel", roomId, errName: errorName(error) });
    },
  );
  if (locals.cfContext) {
    locals.cfContext.waitUntil(send);
    return;
  }
  await send;
}
