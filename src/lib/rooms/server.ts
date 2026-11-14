import type { SupabaseClient } from "@supabase/supabase-js";
import { ringRoom, ringRoomLeaders, sendEmote } from "@/lib/live-sync/server";
import { logEvent } from "@/lib/log";
import type { EmoteMessage } from "@/lib/rooms/emotes";
import { MORE_QUESTIONS, questionPool, questionsToDraw, questionText, type QuestionSelection } from "@/lib/rounds/draw";
import {
  parseHostGames,
  parseJoinRequestState,
  parseLobbyState,
  type GameQuestionList,
  type HostGame,
  type JoinRequestState,
  type LeaderDraw,
  type ListQuestion,
  type LobbyState,
  type RoomView,
} from "@/lib/rooms/shared";
import { gameSummary } from "@/lib/rooms/summary";

// Every database call of the room screens, in one place. The functions come from supabase/migrations/*_room_lobby.sql,
// *_first_live_round.sql, *_full_game_evening.sql, *_round_number_required.sql, *_latecomer_admission.sql,
// *_question_list_review.sql, *_game_summary.sql, *_question_play_data.sql, *_co_host_role.sql,
// *_player_color_choice.sql, *_remove_player.sql, *_rejoin_after_refresh.sql, *_guest_question_proposals.sql,
// *_game_length.sql and *_host_game_history.sql; failures come back as codes for the URL or the JSON answer
// (src/lib/rooms/errors.ts).
// Logs go only through src/lib/log.ts, never with an RPC's arguments: they hold nicks, player tokens, link codes,
// a vote's target and the text of a question a host or a player typed.

export interface RoomFailure {
  ok: false;
  reason: string;
}

// A game's action (start, vote, reveal, thumb, next, "Jeszcze 5 pytań", skip, end), a latecomer's request to join, the
// leader's answer to it ("Wpuść", "Odrzuć"), the host's role button (set_cohost), a player's pick of a colour
// (set_player_color), a leader's removal of a player (remove_player), the host's moves on the game's question list
// ("Przejrzyj pytania", "Dolosuj pytanie", "Usuń", "Popraw", "Dodaj własne"), a player's proposal of a question and
// a leader's answer to it (propose_question, approve_proposal, reject_proposal) and the host's deletion of an ended
// game (delete_game, S-13): the database answers { ok: true } and nothing else, or its refusal.
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
// The signed-in host's ended games, newest first (S-13); [] for a host with none, and for no session at all.
export type HostGamesResult = { ok: true; games: HostGame[] } | RoomFailure;

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

// A guest whose cookie is gone (another browser, cleared data) asks a leader to come back to their own place, the one
// with this nick (S-04), in the lobby or while the game is in play, with the token the Worker keeps in the room's
// cookie: once a leader lets them back, the place moves to it. { ok: true } also when nothing changed (a request of this
// token already waiting, or a player already). The database raises on a token in another form, as in request_join.
export async function requestReturn(
  supabase: SupabaseClient,
  linkToken: string,
  nick: string,
  playerToken: string,
): Promise<ActionResult> {
  const result = await callRpc(supabase, "request_return", {
    p_link_token: linkToken,
    p_nick: nick,
    p_player_token: playerToken,
  });
  return result.ok ? actionResult("request_return", result.data) : result;
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

// The text of a question of the base, or null for an id the base does not have (since S-17 the database opens only ids
// of its copy of the base, so that is left for a round or an entry from before S-17 or the code and that copy out of
// step), logged with the id when it has the id's form. Never with a text: an own question's text is the host's.
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
// (context/foundation/lessons.md, "Pytania gry tylko po stronie serwera"), or the text an entry of the game's question
// list has of its own (question_text): the host's on an own or reworded question, a player's on an approved proposal. A
// question the base does not have (since S-17 only a round from before S-17, or the code and the database's copy of the
// base out of step) goes out as null: the round goes on, the screen says it could not load the question, and the log
// says which id. A skipped round has no question to show.
// questionsLeft from leaderQuestionsLeft, and moreQuestions, which roomView counts itself from the state
// (leaderMoreQuestions, game-length), so its callers pass only questionsLeft. question_count goes on to the screen as it
// came: a number every player sees, never the list. proposals and own_proposals go on to the screen as they came (S-10):
// room_lobby gives a proposal's text and its author's nick to a leader only, proposals: [] to anyone else.
// question_list stays here: the host in the lobby gets the list's questions as text (questions), and nobody else gets
// anything of it.
// game_totals stays here too: a closed room's players get only the summary made of it (gameSummary, S-15), never the
// sums outside it. So does leader_draw (S-07): the screen gets only whether the person leads (leader), the host or the
// player who is me with the co-host role, as private.leader_refusal decides it for the moves. So does link_token
// (S-09): a leader gets the players' link made of it on origin, the page's own (linkUrl, <origin>/j/<code>), in every
// status, so the next fetch after a removal brings the new link; anyone else gets null, even if the state carried a
// code. The raw code never goes to the browser next to the link. channel_key goes on to the screen as it came
// (players-only-live-channel): room_lobby gives it to every player of the room, and the screen listens to the room's
// emotes on the topic made of it, so the next fetch after a removal moves the screen to the new key.
export function roomView(lobby: LobbyState, roomId: string, questionsLeft: boolean | null, origin: string): RoomView {
  const { question_list: list, game_totals: totals, leader_draw: _leaderDraw, link_token: linkToken, ...state } = lobby;
  const leader = state.role === "host" || state.players.some((player) => player.nick === state.me && player.cohost);
  const questions =
    state.role === "host" && state.status === "lobby" && list !== null ? listQuestions(list, roomId) : null;
  const summary = totals === null ? null : gameSummary(totals);
  const linkUrl = leader && linkToken !== null ? `${origin}/j/${linkToken}` : null;
  const more = leaderMoreQuestions(lobby);
  const { round } = state;
  if (round === null || round.phase === "skipped") {
    return { ...state, leader, round, questionsLeft, moreQuestions: more, questions, summary, linkUrl };
  }
  // parseLobbyState refuses a round with neither.
  const question =
    round.question_text ?? (round.question_id === null ? null : baseQuestionText(round.question_id, roomId));
  return {
    ...state,
    leader,
    round: { ...round, question },
    questionsLeft,
    moreQuestions: more,
    questions,
    summary,
    linkUrl,
  };
}

// The leader's draw as the draw takes it (src/lib/rounds/draw.ts).
function drawSelection(draw: LeaderDraw): QuestionSelection {
  return { categories: draw.categories, adultCategories: draw.adult_categories };
}

// For a leader (the host or a co-host, S-07) once the latest round is revealed or skipped: whether the game has a
// question left before its last one (game-length): the round's number is below the number of the game's questions
// (question_count, which every player sees and at which the database stops the game, private.open_next_round), so the
// screen offers "Następne pytanie"; false once the game's last question is played, and the screen offers what "Jeszcze
// 5 pytań" can add (leaderMoreQuestions) or says the questions ran out. null in every other state and for anyone who
// does not lead (leader_draw null). On null the two screens differ on purpose: after a reveal (RoundReveal) the screen
// still offers "Następne pytanie", and if none is left the route answers questions_ran_out (next_round's no_questions,
// src/pages/api/rooms/[id]/next.ts); a skipped latest round (RoundSkipped) offers only "Zakończ grę", because
// skip_round opens the next question whenever there is one, so a skip that stayed the latest round means the game's
// last question was skipped. A proposal approved after that makes this true again (S-10), since it adds one to
// question_count, and "Następne pytanie" comes back with the bell: next_round refuses only a round still voting.
export function leaderQuestionsLeft(lobby: LobbyState): boolean | null {
  const { round, leader_draw: draw } = lobby;
  if (draw === null || lobby.status !== "playing" || round === null || round.phase === "voting") return null;
  return round.number < lobby.question_count;
}

// For a leader once the game's last question is played (leaderQuestionsLeft false): how many questions "Jeszcze 5
// pytań" adds (more_questions, game-length), at most MORE_QUESTIONS, fewer when fewer are left to draw from the game's
// question list and the pool of the picked categories (questionsToDraw in src/lib/rounds/draw.ts, from room_lobby's
// leader_draw), 0 when none is, so the button never says more than the database adds. null whenever
// leaderQuestionsLeft is not false: before the game's last question, in every other state and for anyone who does not
// lead.
export function leaderMoreQuestions(lobby: LobbyState): number | null {
  const { round, leader_draw: draw } = lobby;
  if (leaderQuestionsLeft(lobby) !== false || draw === null || round === null) return null;
  return Math.min(MORE_QUESTIONS, questionsToDraw(questionPool(drawSelection(draw)).length, draw, round.number));
}

// The room's categories for the leader's draw (start, "Następne pytanie", "Jeszcze 5 pytań", "Pomiń pytanie"), from
// room_lobby's leader_draw: the host by the session, a co-host by the token from the room's cookie (S-07). Someone who
// is neither the host nor a player of the room, and a room that does not exist, get room_unknown, the same 404 as
// OUTSIDE_ROOM in src/lib/rooms/json-route.ts; a player of the room without the co-host role gets not_leader, as the
// move itself would (private.leader_refusal). The database checks the role again in the move, under the room's lock.
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

// The leader's moves below (start, reveal, next, "Jeszcze 5 pytań", skip, end, "Wpuść", "Odrzuć", "Usuń" of a player,
// "Zatwierdź" and "Odrzuć" of a proposal): the host by the session (no token), a co-host by the token from the room's
// cookie (S-07); the database decides who leads (private.leader_refusal), and a guest of the room without the role gets
// not_leader.

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

// "Jeszcze 5 pytań" (game-length): a leader's, once round `round` on the leader's screen, revealed or skipped, is the
// game's last question. candidates as in nextRound: the database adds as many of them as are not played in this game and
// on no row of its list, at most 5, and opens the next question at once, as next_round does; no_questions when none is
// left. On a round before the game's last one (another leader has just approved a proposal) it adds nothing and does
// what next_round does.
export async function moreQuestions(
  supabase: SupabaseClient,
  roomId: string,
  round: number,
  candidates: string[],
  playerToken: string | null,
): Promise<ActionResult> {
  const result = await callRpc(
    supabase,
    "more_questions",
    { p_room_id: roomId, p_round: round, p_candidates: candidates, p_player_token: playerToken },
    roomId,
  );
  return result.ok ? actionResult("more_questions", result.data, roomId) : result;
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
// player at the next seat and votes from the next question on. For a request to come back (S-04), in the lobby too, the
// place with that nick moves to the request's token; a co-host moving a co-host's place gets cohost_protected. The nick
// travels only in this POST's body.
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

// "Usuń" by a guest's nick on the list of players (S-09): a leader's, in the lobby and while the game is in play. The
// guest leaves the room, and in the same move the room gets a new link code, so the old link opens nothing; every
// other player stays. The host removes any guest, a co-host only a guest with no role: a co-host removing a co-host
// (itself included) is cohost_protected. A nick no guest of the room has (the host's own, or one removed already) is
// player_unknown. The database answers { ok: true } and nothing else: nothing about the votes, nor the new code, which
// the leaders' screens get with the next fetch of the room's state. The nick travels only in this POST's body.
export async function removePlayer(
  supabase: SupabaseClient,
  roomId: string,
  nick: string,
  playerToken: string | null,
): Promise<ActionResult> {
  const result = await callRpc(
    supabase,
    "remove_player",
    { p_room_id: roomId, p_nick: nick, p_player_token: playerToken },
    roomId,
  );
  return result.ok ? actionResult("remove_player", result.data, roomId) : result;
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

// The host's list of own games (S-13, "Twoje gry"): the signed-in host's ended games, newest first by the start of the
// game or, for a room closed in the lobby, by its creation. The host by the session only: a co-host has no list (PRD
// Access Control), and no session gets []. Writes nothing. The nicks go on to the host's own screen, never into a log
// line.
export async function hostGames(supabase: SupabaseClient): Promise<HostGamesResult> {
  const result = await callRpc(supabase, "host_games", {});
  if (!result.ok) return result;

  const parsed = parseHostGames(result.data);
  return parsed.ok ? { ok: true, games: parsed.value } : unexpectedShape("host_games", parsed.field);
}

// "Usuń" on the host's list of games (S-13, skasowanie gry): the host's session only, once the game is ended. The room
// goes with everything tied to it (players, results, requests, the game's question list); the anonymous counters of
// the questions stay. A room in the lobby or with a game in play is game_not_ended; another host's room, a game deleted
// already and no room at all are room_unknown.
export async function deleteGame(supabase: SupabaseClient, roomId: string): Promise<ActionResult> {
  const result = await callRpc(supabase, "delete_game", { p_room_id: roomId }, roomId);
  return result.ok ? actionResult("delete_game", result.data, roomId) : result;
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

// A player's proposal of a question (S-10): any player of the room, the host by the session (no token), a guest by the
// room's cookie, in the lobby and while the game is in play. text is what the player typed, which the database
// normalizes and checks (1-90 characters, invalid_question_text); it travels only in this POST's body. The same text
// waiting from this player again is ok and uses up no proposal; with none left it is proposal_limit, a closed room
// room_closed. The answer never says anything about a leader's decisions.
export async function proposeQuestion(
  supabase: SupabaseClient,
  roomId: string,
  text: string,
  playerToken: string | null,
): Promise<ActionResult> {
  const result = await callRpc(
    supabase,
    "propose_question",
    { p_room_id: roomId, p_text: text, p_player_token: playerToken },
    roomId,
  );
  return result.ok ? actionResult("propose_question", result.data, roomId) : result;
}

// "Zatwierdź" of a proposal: a leader's, once the game has started. number is the proposal's number on the leader's
// list; its text alone becomes the next question of the game. A proposal no longer waiting is proposal_unknown; in the
// lobby it is game_not_started and with 100 rows on the game's question list list_full, and the proposal goes on
// waiting. A closed room is room_closed.
export async function approveProposal(
  supabase: SupabaseClient,
  roomId: string,
  number: number,
  playerToken: string | null,
): Promise<ActionResult> {
  const result = await callRpc(
    supabase,
    "approve_proposal",
    { p_room_id: roomId, p_number: number, p_player_token: playerToken },
    roomId,
  );
  return result.ok ? actionResult("approve_proposal", result.data, roomId) : result;
}

// "Odrzuć" of a proposal: a leader's, in the lobby too, since it does not touch the game's question list. number as in
// approveProposal; the proposal's text is gone, and it still counts against its author's limit. A proposal no longer
// waiting is proposal_unknown, a closed room room_closed.
export async function rejectProposal(
  supabase: SupabaseClient,
  roomId: string,
  number: number,
  playerToken: string | null,
): Promise<ActionResult> {
  const result = await callRpc(
    supabase,
    "reject_proposal",
    { p_room_id: roomId, p_number: number, p_player_token: playerToken },
    roomId,
  );
  return result.ok ? actionResult("reject_proposal", result.data, roomId) : result;
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

// The categories the host picked for the room, through RLS: only the host reads them. The draw filters them through
// the question base, so the Worker sends only questions the database takes; since S-17 the database checks the names
// and the room's choice itself too (supabase/migrations/*_question_base_checks.sql).
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

// Workers may cut a promise still running after the response, so a bell goes through waitUntil; without an execution
// context it is awaited instead. A failed bell is only logged (ringRoom and ringRoomLeaders log it): the screens' own
// poll catches up.
async function deliverBell(locals: BellLocals, roomId: string, sent: Promise<{ ok: boolean }>): Promise<void> {
  const ring = sent.then(
    () => undefined,
    // Only removeChannel's failure gets here; the ring catches its own.
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

// Wakes everyone on the room's channel: they fetch the room's state again.
export function ringLobby(locals: BellLocals, supabase: SupabaseClient, roomId: string): Promise<void> {
  return deliverBell(locals, roomId, ringRoom(supabase, roomId, Date.now()));
}

// Wakes the room's leaders, for a move no one else has to see at once (LEADER_BELL_EVENT): a proposal sent or answered.
export function ringLeaders(locals: BellLocals, supabase: SupabaseClient, roomId: string): Promise<void> {
  return deliverBell(locals, roomId, ringRoomLeaders(supabase, roomId, Date.now()));
}

// A player's emote to everyone on the room's players' channel (S-16; players-only-live-channel: the topic of the room's
// channel key, from the room's current state), the player too, sent as the bell is: through waitUntil, or awaited
// without an execution context. A failed send is only logged (sendEmote logs it with the room's id, never the emote, the
// nick or the key): that emote is lost, and nothing else in the room depends on it.
export async function broadcastEmote(
  locals: BellLocals,
  supabase: SupabaseClient,
  roomId: string,
  channelKey: string,
  message: EmoteMessage,
): Promise<void> {
  const send = sendEmote(supabase, roomId, channelKey, message).then(
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
