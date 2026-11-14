// Limits, types and the room state's parser, shared by the server and the room islands. No server imports, so safe in
// the browser.

import { MAX_PIE_SLICES } from "@/lib/rooms/chart";

export const NICK_MAX_LENGTH = 20;
// An own or reworded question of the game's question list, as the base's questions are (src/data/questions.ts): the
// ending after "Kto z nas najprawdopodobniej", without the "?". The database has the final word (private.question_text).
export const QUESTION_MAX_LENGTH = 90;
// US-01: the host and at least 2 guests, the host votes too. start_game has the final word; the screen only says it.
export const MIN_PLAYERS = 3;

// lobby → playing (start_game) → closed ("Zakończ grę", "Nowa gra" or the sweep of abandoned games).
export type RoomStatus = "lobby" | "playing" | "closed";

// cohost: a guest the host gave the co-host role (S-07), seen by everyone; never the host, whose row never holds it.
// color: the player's stored colour (S-18, players.color), the number 0 … MAX_PIE_SLICES - 1 of a colour of the game's
// palette (src/components/room/chart-colors.ts), seen by everyone; the first free one on the way in, the same all game
// unless its player changes it. Up to 20 players no two share one; from the 21st on colours repeat.
export interface LobbyPlayer {
  nick: string;
  host: boolean;
  cohost: boolean;
  color: number;
}

// The round's keys as room_lobby names them (context/archive/2026-10-13-first-live-round/plan.md, Faza 1 #4;
// context/archive/2026-10-15-full-game-evening/plan.md, Faza 2 #4;
// context/archive/2026-10-22-latecomer-admission/plan.md, Faza 1 #1;
// context/archive/2026-10-24-question-list-review/plan.md, Faza 1 #1). The latest round of the game only. Its question
// is a question of the base (question_id) or, for an own or reworded question of the game's question list, the text the
// host gave it (question_text, with question_id null); never both null. While it is open: who may vote in it (eligible:
// the players when it opened, in seat order, so a latecomer let in since then is among the players but not here until
// the next question), who has voted, in seat order (never the order of voting), never a count, and whether the round
// before it was skipped (public to everyone, tied to no one's vote).
export interface VotingRound {
  number: number;
  question_id: string | null;
  question_text: string | null;
  phase: "voting";
  eligible: string[];
  voted: string[];
  me_voted: boolean;
  after_skip: boolean;
}

export interface RoundResult {
  nick: string;
  votes: number;
}

// Once revealed: a count for every eligible player in seat order, zeros included, and nothing about who voted how. Its
// question as in a voting round.
export interface RevealedRound {
  number: number;
  question_id: string | null;
  question_text: string | null;
  phase: "revealed";
  results: RoundResult[];
  abstained: number;
  ballots: number;
}

// Skipped while voting, with no question left to open after it: its votes are gone, so only its number and phase.
export interface SkippedRound {
  number: number;
  phase: "skipped";
}

export type RoundState = VotingRound | RevealedRound | SkippedRound;

// An entry of the game's question list as room_lobby names it (context/archive/2026-10-24-question-list-review/plan.md,
// Faza 1 #1): its position, its handle that never changes; the question id of a question of the base, null for an own
// question; the text the host gave it, null for a question of the base as it stands. Never both null.
export interface GameQuestionEntry {
  position: number;
  question_id: string | null;
  text: string | null;
}

// The game's question list, the host's only: the entries not removed, in the order of positions, and the number of the
// list's rows with a question id of the base (base_count, removed and reworded entries included). The Worker counts the
// questions left to draw from leader_draw's two numbers instead (src/lib/rounds/draw.ts, questionsToDraw).
export interface GameQuestionList {
  entries: GameQuestionEntry[];
  base_count: number;
}

// The sums of a closed game's reveals as room_lobby names them (context/archive/2026-10-25-game-summary/plan.md,
// Faza 1 #1): the number of its revealed rounds (at least 1), and for every player with a result in at least one of
// them, in seat order, the sum of those results, zeros included. Counts per nick the reveals already showed the whole
// room, never a voter; a skipped round and one cut short by the end of the game add nothing.
export interface GameTotals {
  revealed: number;
  totals: RoundResult[];
}

// What a leader's moves need from the room as room_lobby names it (context/changes/co-host-role/plan.md, Faza 1 #1):
// the categories the host picked and their 18+ ones, from which the Worker draws the next question
// (src/lib/rounds/draw.ts), and two numbers of the game's question list, from which it counts the questions left to
// draw for "Jeszcze 5 pytań" (questionsToDraw, game-length): its entries not removed (list_entries) and its rows with a
// question id of the base (list_base_count, removed and reworded entries included), both 0 with no list and no
// approved proposal. A question approved from a proposal (S-10) is an entry with no question id, so it counts in
// list_entries alone, also in a game with no list. Never the list itself.
export interface LeaderDraw {
  categories: string[];
  adult_categories: string[];
  list_entries: number;
  list_base_count: number;
}

// A proposal of a question waiting for a leader's answer, as room_lobby names it (S-10,
// context/changes/guest-question-proposals/plan.md, Faza 1 #3): its number, its handle within the room; the nick of its
// author, which only a leader learns; its text, the ending after "Kto z nas najprawdopodobniej", plain text for the
// screen.
export interface QuestionProposal {
  number: number;
  nick: string;
  text: string;
}

// The player's own proposals as room_lobby names them (S-10): how many they may still send (left) and how many of
// theirs wait for a leader (waiting). Only the counts: never a text, and never how a decided one was decided.
export interface OwnProposals {
  left: number;
  waiting: number;
}

// What room_lobby returns: nicks in join order, no ids or hashes; a round only while a game is in play.
// requests: the nicks of the latecomers waiting for a leader (the host or a co-host) to let them in, in the order of
// asking; only a leader sees them, anyone else always gets [] (and so does a leader before the start and once the room
// is closed). question_list: the game's question list for the host of a room that has one ("Przejrzyj pytania", or the
// first proposal approved in a game with no list, S-10), in every status of the room; null for a guest, a co-host
// included, and while the room has none. The Worker keeps it: the browser gets only the host's questions in the lobby
// (RoomView.questions), so a list made by an approval shows nowhere. game_totals: for everyone in a closed
// room whose game had a revealed round; null in the lobby, while the game is in play and for a closed room with no
// reveal. The Worker keeps it too: the browser gets only the summary made of it (RoomView.summary). leader_draw: for a
// leader, in every status; null for anyone else. The Worker keeps it as well: the browser gets only whether the person
// leads (RoomView.leader). link_token: the room's link code (S-09, context/changes/remove-player-new-link/plan.md,
// Faza 1 #1), for a leader in every status; null for anyone else. Removing a player replaces it, so every fetch carries
// the current one. The Worker keeps it as well: the browser gets only the players' link made of it (RoomView.linkUrl).
// returning: the nicks of requests that ask to come back to a place (S-04,
// context/changes/rejoin-after-refresh/plan.md, Faza 3 #1), in the order of asking, a part of requests; a leader may
// get them in the lobby too, anyone else always gets []. proposals: the proposals waiting (S-10), in the order of their
// numbers, only for a leader, who decides on them, in every status; anyone else always gets [], so a text reaches
// nobody else before its round opens, and its author's nick never does (none once the room is closed). own_proposals:
// the player's own counts, for every player in every status. question_count: the number of the game's questions
// (game-length, context/changes/game-length/plan.md, Faza 1 #4), for every player in every status: with a list the host
// reviewed, its entries not removed, else 15; plus every approved proposal and the questions added with "Jeszcze 5
// pytań". A number, never the list, so it goes on to the screen ("Pytanie 7 z 15"). channel_key: the room's channel key
// (klucz kanału, players-only-live-channel, context/changes/players-only-live-channel/plan.md, Faza 1 #1), for every
// player in every status: the topic of the room's emotes is made of it (playersTopicFor in src/lib/live-sync/shared.ts).
// Removing a player replaces it, so every fetch carries the current one. It goes on to the screen, which listens to the
// emotes with it, and never into a log line or an address of the game.
export interface LobbyState {
  status: RoomStatus;
  role: "host" | "guest";
  me: string;
  players: LobbyPlayer[];
  round: RoundState | null;
  requests: string[];
  returning: string[];
  proposals: QuestionProposal[];
  own_proposals: OwnProposals;
  question_count: number;
  channel_key: string;
  question_list: GameQuestionList | null;
  game_totals: GameTotals | null;
  leader_draw: LeaderDraw | null;
  link_token: string | null;
}

// What the room screen gets: the round with its question's text, which the Worker adds from the question base, or the
// host's own text of an own or reworded question (question_text). The text is the ending after "Kto z nas
// najprawdopodobniej" (src/data/questions.ts), plain text for the screen. null when the base does not have the round's
// question (the Worker logs which id): the screen then says it could not load the question instead of building a
// sentence around a placeholder. A skipped round shows no question.
export type RoundView = ((VotingRound | RevealedRound) & { question: string | null }) | SkippedRound;

// A question of the game's question list as the host's screen shows it: its position (the handle of "Usuń" and
// "Popraw"), its text, plain text for the screen, and whether the text is the host's own (an own or reworded question).
export interface ListQuestion {
  position: number;
  text: string;
  own: boolean;
}

// The summary of a closed game on the end of the evening (S-15, PRD FR-022), made by the Worker from game_totals
// (src/lib/rooms/summary.ts, gameSummary): the number of revealed questions; votes, the number of votes for players in
// all of them (an abstention is no vote for anyone), which the chart cuts into the top's slices and one for the rest;
// top, the players with the most votes, at most 3 unless the top tie alone is more, in seat order within a tie, each
// with their sum; unvoted, the nicks of the players who could get a vote in a reveal and got none, in seat order.
// Nothing else of the sums: the rest is one number, never a nick.
export interface GameSummary {
  revealed: number;
  votes: number;
  top: RoundResult[];
  unvoted: string[];
}

// leader: whether the person on this screen leads the game (S-07): the host, or a guest with the co-host role (the
// cohost of the player who is me). Never leader_draw itself: the Worker never sends it to a screen (a leader may still
// read it from room_lobby, granted to anon; it holds no question's text). The badges "host" and "ty"
// come from players[].host and me, never from leader. questionsLeft: for a leader once the latest round is revealed or
// skipped, whether the game has a question left before its last one (game-length: round.number < question_count, so
// "Następne pytanie"); false once the game's last question is played; null in every other state and for anyone who does
// not lead. moreQuestions: how many questions "Jeszcze 5 pytań" adds (game-length), a count exactly where questionsLeft
// is false: at most 5, fewer when fewer are left to draw, 0 when none is (then "Pytań już nie ma. Możesz zakończyć
// grę."); null wherever questionsLeft is not false. questions: the game's question list for its host
// in the lobby, the entries not removed in the order of positions; null before the host opens it, for a guest (a
// co-host included) and once the game has started. Never question_list itself: its question ids would tell nothing the
// screen needs. summary: for everyone in a closed room whose game had a revealed round, null otherwise; never
// game_totals itself, whose sums outside the summary the screen does not show. linkUrl: the players' link
// (<origin>/j/<code>) for a leader, the host or a co-host, in every status (S-09), so the next fetch after a removal
// brings the new one; null for anyone who does not lead. Never link_token itself. proposals and own_proposals go to the
// screen as room_lobby gave them (LobbyState): a proposal's text and its author's nick only to a leader. So does
// channel_key, every player's: the screen listens to the room's emotes on the topic made of it.
export interface RoomView extends Omit<LobbyState, "question_list" | "game_totals" | "leader_draw" | "link_token"> {
  leader: boolean;
  round: RoundView | null;
  questionsLeft: boolean | null;
  moreQuestions: number | null;
  questions: ListQuestion[] | null;
  summary: GameSummary | null;
  linkUrl: string | null;
}

// A parser's answer: the value with only the contract's keys, or the field that did not pass (a dotted path without
// indexes, e.g. "round.results.votes"), for the log line. Never a value: a field may hold a nick.
export type ParseResult<T> = { ok: true; value: T } | { ok: false; field: string };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function fail(field: string): { ok: false; field: string } {
  return { ok: false, field };
}

function isCount(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
}

function isStringList(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((entry) => typeof entry === "string");
}

function isPosition(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 1;
}

function isTextOrNull(value: unknown): value is string | null {
  return typeof value === "string" || value === null;
}

// A colour of the game's palette: a whole number from 0 to MAX_PIE_SLICES - 1, as the database's check has it.
function isColor(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value >= 0 && value < MAX_PIE_SLICES;
}

function parsePlayers(value: unknown): ParseResult<LobbyPlayer[]> {
  if (!Array.isArray(value)) return fail("players");
  const players: LobbyPlayer[] = [];
  for (const entry of value as unknown[]) {
    if (!isRecord(entry)) return fail("players");
    if (typeof entry.nick !== "string") return fail("players.nick");
    if (typeof entry.host !== "boolean") return fail("players.host");
    if (typeof entry.cohost !== "boolean") return fail("players.cohost");
    if (!isColor(entry.color)) return fail("players.color");
    players.push({ nick: entry.nick, host: entry.host, cohost: entry.cohost, color: entry.color });
  }
  return { ok: true, value: players };
}

// Counts per nick: a revealed round's results, a closed game's sums and its summary's top. field names the list in the
// answer ("round.results", "game_totals.totals", "summary.top"), so a failure says which one.
function parseResults(value: unknown, field: string): ParseResult<RoundResult[]> {
  if (!Array.isArray(value)) return fail(field);
  const results: RoundResult[] = [];
  for (const entry of value as unknown[]) {
    if (!isRecord(entry)) return fail(field);
    if (typeof entry.nick !== "string") return fail(`${field}.nick`);
    if (!isCount(entry.votes)) return fail(`${field}.votes`);
    results.push({ nick: entry.nick, votes: entry.votes });
  }
  return { ok: true, value: results };
}

// The number of a closed game's revealed questions: a game with none has no sums and no summary at all (null).
function isRevealedCount(value: unknown): value is number {
  return isCount(value) && value >= 1;
}

// Copies only the contract's keys: a key the database might add by mistake (a count before the reveal) stays here.
// A skipped round is the exception: any key next to its number and phase means its votes were not dropped (decision D3
// of context/archive/2026-10-15-full-game-evening/research.md), so the state is refused.
function parseRound(value: Record<string, unknown>): ParseResult<RoundState> {
  const { number, question_id: questionId, question_text: questionText, phase } = value;
  if (typeof number !== "number" || !Number.isSafeInteger(number) || number < 1) return fail("round.number");
  if (phase !== "voting" && phase !== "revealed" && phase !== "skipped") return fail("round.phase");
  if (phase === "skipped") {
    const extra = Object.keys(value).find((key) => key !== "number" && key !== "phase");
    return extra === undefined ? { ok: true, value: { number, phase } } : fail(`round.${extra}`);
  }
  if (!isTextOrNull(questionId)) return fail("round.question_id");
  if (!isTextOrNull(questionText)) return fail("round.question_text");
  // A round with neither has no question to show at all.
  if (questionId === null && questionText === null) return fail("round.question_id");

  if (phase === "voting") {
    if (!isStringList(value.eligible)) return fail("round.eligible");
    if (!isStringList(value.voted)) return fail("round.voted");
    if (typeof value.me_voted !== "boolean") return fail("round.me_voted");
    if (typeof value.after_skip !== "boolean") return fail("round.after_skip");
    return {
      ok: true,
      value: {
        number,
        question_id: questionId,
        question_text: questionText,
        phase,
        eligible: [...value.eligible],
        voted: [...value.voted],
        me_voted: value.me_voted,
        after_skip: value.after_skip,
      },
    };
  }
  const results = parseResults(value.results, "round.results");
  if (!results.ok) return results;
  if (!isCount(value.abstained)) return fail("round.abstained");
  if (!isCount(value.ballots)) return fail("round.ballots");
  return {
    ok: true,
    value: {
      number,
      question_id: questionId,
      question_text: questionText,
      phase,
      results: results.value,
      abstained: value.abstained,
      ballots: value.ballots,
    },
  };
}

// The game's question list, or null (a guest, or no list yet). Copies only the contract's keys, as the round does: a
// key the database might add by mistake (a removed entry's mark) stays here.
function parseQuestionList(value: unknown): ParseResult<GameQuestionList | null> {
  if (value === null) return { ok: true, value: null };
  if (!isRecord(value)) return fail("question_list");
  if (!Array.isArray(value.entries)) return fail("question_list.entries");
  const entries: GameQuestionEntry[] = [];
  for (const entry of value.entries as unknown[]) {
    if (!isRecord(entry)) return fail("question_list.entries");
    const { position, question_id: questionId, text } = entry;
    if (!isPosition(position)) return fail("question_list.entries.position");
    if (!isTextOrNull(questionId)) return fail("question_list.entries.question_id");
    if (!isTextOrNull(text)) return fail("question_list.entries.text");
    // An entry with neither is no question at all (the database's check says the same).
    if (questionId === null && text === null) return fail("question_list.entries.question_id");
    entries.push({ position, question_id: questionId, text });
  }
  if (!isCount(value.base_count)) return fail("question_list.base_count");
  return { ok: true, value: { entries, base_count: value.base_count } };
}

// The sums of a closed game's reveals, or null (no closed room, or no reveal). Copies only the contract's keys, as the
// round does: a key the database might add by mistake (a voter, a round's own counts) stays here.
function parseGameTotals(value: unknown, status: RoomStatus): ParseResult<GameTotals | null> {
  if (value === null) return { ok: true, value: null };
  if (!isRecord(value) || status !== "closed") return fail("game_totals");
  if (!isRevealedCount(value.revealed)) return fail("game_totals.revealed");
  const totals = parseResults(value.totals, "game_totals.totals");
  if (!totals.ok) return totals;
  return { ok: true, value: { revealed: value.revealed, totals: totals.value } };
}

// What a leader's moves need, or null (anyone who does not lead). Copies only the contract's keys, as the round does: a
// key the database might add by mistake (the list's question ids) stays here.
function parseLeaderDraw(value: unknown): ParseResult<LeaderDraw | null> {
  if (value === null) return { ok: true, value: null };
  if (!isRecord(value)) return fail("leader_draw");
  const { categories, adult_categories: adultCategories, list_entries: listEntries } = value;
  if (!isStringList(categories)) return fail("leader_draw.categories");
  if (!isStringList(adultCategories)) return fail("leader_draw.adult_categories");
  if (!isCount(listEntries)) return fail("leader_draw.list_entries");
  if (!isCount(value.list_base_count)) return fail("leader_draw.list_base_count");
  return {
    ok: true,
    value: {
      categories: [...categories],
      adult_categories: [...adultCategories],
      list_entries: listEntries,
      list_base_count: value.list_base_count,
    },
  };
}

// The proposals waiting: a leader's, [] for anyone else. Copies only the contract's keys, as the round does: a key the
// database might add by mistake (the author's id) stays here.
function parseProposals(value: unknown): ParseResult<QuestionProposal[]> {
  if (!Array.isArray(value)) return fail("proposals");
  const proposals: QuestionProposal[] = [];
  for (const entry of value as unknown[]) {
    if (!isRecord(entry)) return fail("proposals");
    const { number, nick, text } = entry;
    if (!isPosition(number)) return fail("proposals.number");
    if (typeof nick !== "string") return fail("proposals.nick");
    if (typeof text !== "string") return fail("proposals.text");
    proposals.push({ number, nick, text });
  }
  return { ok: true, value: proposals };
}

// The player's own counts. Copies only the contract's keys, as the round does: a key the database might add by mistake
// (how a decided proposal was decided) stays here.
function parseOwnProposals(value: unknown): ParseResult<OwnProposals> {
  if (!isRecord(value)) return fail("own_proposals");
  const { left, waiting } = value;
  if (!isCount(left)) return fail("own_proposals.left");
  if (!isCount(waiting)) return fail("own_proposals.waiting");
  return { ok: true, value: { left, waiting } };
}

// The room's link code as create_room and remove_player make it: 16 random bytes in base64url, 22 characters (the
// same pattern as LINK_TOKEN_PATTERN in src/lib/rooms/tokens.ts, which stays on the server).
const LINK_CODE_PATTERN = /^[A-Za-z0-9_-]{22}$/;

// The room's link code, or null (anyone who does not lead). Only a code of that form: anything else would make a link
// that opens nothing.
function parseLinkToken(value: unknown): ParseResult<string | null> {
  if (value === null) return { ok: true, value: null };
  return typeof value === "string" && LINK_CODE_PATTERN.test(value) ? { ok: true, value } : fail("link_token");
}

// The room's channel key as the column's default and remove_player make it (supabase/migrations/
// *_players_channel_key.sql): 16 random bytes in base64url, 22 characters. A pattern of its own, not the link code's:
// the two codes only happen to be made alike.
const CHANNEL_KEY_PATTERN = /^[A-Za-z0-9_-]{22}$/;

type RoomState = Omit<LobbyState, "question_list" | "game_totals" | "leader_draw" | "link_token">;

// What room_lobby and the Worker's view share: everything but the game's question list, the sums of its reveals, the
// leader's draw and the link code, which only the Worker reads. A round only while a game is in play, and always one
// then. The channel key is always there and always a key: every player of the room gets it, and a topic made of
// anything else would hear no emote.
function parseRoomState(value: Record<string, unknown>): ParseResult<RoomState> {
  const { status, role, me } = value;
  if (status !== "lobby" && status !== "playing" && status !== "closed") return fail("status");
  if (role !== "host" && role !== "guest") return fail("role");
  if (typeof me !== "string") return fail("me");
  const players = parsePlayers(value.players);
  if (!players.ok) return players;
  if (!isStringList(value.requests)) return fail("requests");
  const requests = [...value.requests];
  // Every request to come back is a request on the leader's list: a nick outside it would be a row nobody can answer.
  if (!isStringList(value.returning) || !value.returning.every((nick) => requests.includes(nick))) {
    return fail("returning");
  }
  const returning = [...value.returning];
  const proposals = parseProposals(value.proposals);
  if (!proposals.ok) return proposals;
  const ownProposals = parseOwnProposals(value.own_proposals);
  if (!ownProposals.ok) return ownProposals;
  if (!isCount(value.question_count)) return fail("question_count");
  const { channel_key: channelKey } = value;
  if (typeof channelKey !== "string" || !CHANNEL_KEY_PATTERN.test(channelKey)) return fail("channel_key");
  const shared: Omit<RoomState, "round"> = {
    status,
    role,
    me,
    players: players.value,
    requests,
    returning,
    proposals: proposals.value,
    own_proposals: ownProposals.value,
    question_count: value.question_count,
    channel_key: channelKey,
  };

  const { round: rawRound } = value;
  if (rawRound === undefined) return fail("round");
  if (status !== "playing") {
    if (rawRound !== null) return fail("round");
    return { ok: true, value: { ...shared, round: null } };
  }
  if (!isRecord(rawRound)) return fail("round");
  const round = parseRound(rawRound);
  if (!round.ok) return round;
  return { ok: true, value: { ...shared, round: round.value } };
}

// room_lobby's answer (src/lib/rooms/server.ts). question_list, game_totals, leader_draw and link_token are always
// there, null included: a database without them (before *_question_list_review.sql, *_game_summary.sql,
// *_co_host_role.sql, *_remove_player.sql) is refused, not read as "no list", "no reveal", "does not lead" or "no
// link"; so is a player without cohost, or without color (before *_player_color_choice.sql), a state without
// returning (before *_rejoin_after_refresh.sql), not read as "nobody asks to come back", a state without proposals
// or own_proposals (before *_guest_question_proposals.sql), not read as "no proposal waits" or "all 3 left", a state
// without question_count (before *_game_length.sql), not read as a game of 0 questions, and a state without
// channel_key (before *_players_channel_key.sql), not read as a room with no emotes.
export function parseLobbyState(value: unknown): ParseResult<LobbyState> {
  if (!isRecord(value)) return fail("root");
  const state = parseRoomState(value);
  if (!state.ok) return state;
  if (value.question_list === undefined) return fail("question_list");
  const questionList = parseQuestionList(value.question_list);
  if (!questionList.ok) return questionList;
  if (value.game_totals === undefined) return fail("game_totals");
  const gameTotals = parseGameTotals(value.game_totals, state.value.status);
  if (!gameTotals.ok) return gameTotals;
  if (value.leader_draw === undefined) return fail("leader_draw");
  const leaderDraw = parseLeaderDraw(value.leader_draw);
  if (!leaderDraw.ok) return leaderDraw;
  if (value.link_token === undefined) return fail("link_token");
  const linkToken = parseLinkToken(value.link_token);
  if (!linkToken.ok) return linkToken;
  return {
    ok: true,
    value: {
      ...state.value,
      question_list: questionList.value,
      game_totals: gameTotals.value,
      leader_draw: leaderDraw.value,
      link_token: linkToken.value,
    },
  };
}

// How a latecomer's own request stands (join_request_state, through GET /api/rooms/<id>/request), for the /j/<code>
// page and its waiting screen: pending or rejected with the nick it asked with, and returning: true for a request to
// come back to one's place (S-04), never there for a latecomer's; admitted once the host let them in; closed once the
// room is closed; moved for a token whose place a leader moved to another token ("Wpuść" of a request to come back,
// S-04), with the place's nick, for the old device's room page; gone when the room no longer exists, which is a game
// its host deleted (S-13, skasowanie gry), so the room page tells its guest the game is gone, not that they were
// removed; none when the room's cookie has nothing in this room. Never the question, the players or anyone else's
// request.
export type JoinRequestState =
  | { state: "pending" | "rejected"; nick: string; returning?: true }
  | { state: "moved"; nick: string }
  | { state: "admitted" | "closed" | "gone" | "none" };

// Copies only the contract's keys, as parseLobbyState does: a key the database might add by mistake stays here.
export function parseJoinRequestState(value: unknown): ParseResult<JoinRequestState> {
  if (!isRecord(value)) return fail("root");
  const { state, nick, returning } = value;
  if (state === "pending" || state === "rejected") {
    if (typeof nick !== "string") return fail("nick");
    if (returning === undefined) return { ok: true, value: { state, nick } };
    return returning === true ? { ok: true, value: { state, nick, returning } } : fail("returning");
  }
  if (state === "moved") return typeof nick === "string" ? { ok: true, value: { state, nick } } : fail("nick");
  if (state === "admitted" || state === "closed" || state === "gone" || state === "none") {
    return { ok: true, value: { state } };
  }
  return fail("state");
}

// An ended game on its host's list of own games (S-13, lista własnych gier: "Twoje gry"), as host_games gives it
// (context/changes/host-game-history/plan.md, Faza 1 #1): the room's id, the handle of the game's deletion; when the
// room was made (createdAt) and when its game started (startedAt, null for a game that never started), as the
// database's timestamps; the number of questions the game opened, the skipped ones included (questions); and the
// players' nicks in seat order, the host's included. Nothing about votes, results, colours or roles.
export interface HostGame {
  id: string;
  createdAt: string;
  startedAt: string | null;
  questions: number;
  nicks: string[];
}

// host_games' answer (src/lib/rooms/server.ts): a list, [] for a host with no ended game. Copies only the contract's
// keys, as parseLobbyState does: a key the database might add by mistake (a result, a voter) stays here. field names
// the database's key, as in the other parsers.
export function parseHostGames(value: unknown): ParseResult<HostGame[]> {
  if (!Array.isArray(value)) return fail("root");
  const games: HostGame[] = [];
  for (const entry of value as unknown[]) {
    if (!isRecord(entry)) return fail("root");
    const { id, created_at: createdAt, started_at: startedAt, questions, nicks } = entry;
    if (typeof id !== "string") return fail("id");
    if (typeof createdAt !== "string") return fail("created_at");
    if (!isTextOrNull(startedAt)) return fail("started_at");
    if (!isCount(questions)) return fail("questions");
    if (!isStringList(nicks)) return fail("nicks");
    games.push({ id, createdAt, startedAt, questions, nicks: [...nicks] });
  }
  return { ok: true, value: games };
}

// The host's questions in the view: an array only for the host in the lobby (the list is reviewed before the start
// only, and only by the host), null otherwise. Copies only the contract's keys.
function parseQuestions(
  value: unknown,
  state: Pick<LobbyState, "status" | "role">,
): ParseResult<ListQuestion[] | null> {
  if (value === null) return { ok: true, value: null };
  if (!Array.isArray(value) || state.role !== "host" || state.status !== "lobby") return fail("questions");
  const questions: ListQuestion[] = [];
  for (const entry of value as unknown[]) {
    if (!isRecord(entry)) return fail("questions");
    const { position, text, own } = entry;
    if (!isPosition(position)) return fail("questions.position");
    if (typeof text !== "string") return fail("questions.text");
    if (typeof own !== "boolean") return fail("questions.own");
    questions.push({ position, text, own });
  }
  return { ok: true, value: questions };
}

// The summary in the view, or null (no closed room, or no reveal), by the rules of game_totals. Copies only the
// contract's keys: the browser gets nothing of the sums beyond what the end of the evening shows. votes is never fewer
// than the top's own, so the chart's rest is never below 0.
function parseSummary(value: unknown, status: RoomStatus): ParseResult<GameSummary | null> {
  if (value === null) return { ok: true, value: null };
  if (!isRecord(value) || status !== "closed") return fail("summary");
  if (!isRevealedCount(value.revealed)) return fail("summary.revealed");
  const top = parseResults(value.top, "summary.top");
  if (!top.ok) return top;
  const topVotes = top.value.reduce((sum, { votes }) => sum + votes, 0);
  if (!isCount(value.votes) || value.votes < topVotes) return fail("summary.votes");
  if (!isStringList(value.unvoted)) return fail("summary.unvoted");
  return {
    ok: true,
    value: { revealed: value.revealed, votes: value.votes, top: top.value, unvoted: [...value.unvoted] },
  };
}

// The players' link as the Worker makes it of the room's code (src/lib/rooms/server.ts, roomView): the page's origin,
// then /j/ and the code.
const LINK_URL_PATTERN = /^https?:\/\/[^/]+\/j\/[A-Za-z0-9_-]{22}$/;

// The players' link in the view, or null: a link only for a leader, who shares it (S-09); a guest's view never carries
// one.
function parseLinkUrl(value: unknown, leader: boolean): ParseResult<string | null> {
  if (value === null) return { ok: true, value: null };
  return typeof value === "string" && leader && LINK_URL_PATTERN.test(value) ? { ok: true, value } : fail("linkUrl");
}

// How many questions "Jeszcze 5 pytań" adds (game-length): a count exactly where the game's last question is played
// (questionsLeft false), null everywhere else, as the Worker counts it (leaderMoreQuestions in src/lib/rooms/server.ts).
function parseMoreQuestions(value: unknown, questionsLeft: boolean | null): ParseResult<number | null> {
  if (questionsLeft === false) return isCount(value) ? { ok: true, value } : fail("moreQuestions");
  return value === null ? { ok: true, value: null } : fail("moreQuestions");
}

// The Worker's answer to the room screen (GET /api/rooms/<id>/lobby): room_lobby's state without question_list,
// game_totals, leader_draw and link_token, plus whether the person leads, the round's question, a text or null for a
// question the base does not have, questionsLeft, moreQuestions, the host's questions, the summary and the players'
// link. leader is always there, a Worker deployed before it is not read as "does not lead"; summary, linkUrl and
// moreQuestions are always there, null included, as questions is; so is channel_key, a key, from a Worker on a
// database with *_players_channel_key.sql: a view without it is refused, not read as a room with no emotes.
export function parseRoomView(value: unknown): ParseResult<RoomView> {
  if (!isRecord(value)) return fail("root");
  const state = parseRoomState(value);
  if (!state.ok) return state;
  const { leader, questionsLeft } = value;
  if (typeof leader !== "boolean") return fail("leader");
  if (typeof questionsLeft !== "boolean" && questionsLeft !== null) return fail("questionsLeft");
  const moreQuestions = parseMoreQuestions(value.moreQuestions, questionsLeft);
  if (!moreQuestions.ok) return moreQuestions;
  if (value.questions === undefined) return fail("questions");
  const questions = parseQuestions(value.questions, state.value);
  if (!questions.ok) return questions;
  if (value.summary === undefined) return fail("summary");
  const summary = parseSummary(value.summary, state.value.status);
  if (!summary.ok) return summary;
  if (value.linkUrl === undefined) return fail("linkUrl");
  const linkUrl = parseLinkUrl(value.linkUrl, leader);
  if (!linkUrl.ok) return linkUrl;
  const { round } = state.value;
  if (round === null || round.phase === "skipped") {
    return {
      ok: true,
      value: {
        ...state.value,
        leader,
        round,
        questionsLeft,
        moreQuestions: moreQuestions.value,
        questions: questions.value,
        summary: summary.value,
        linkUrl: linkUrl.value,
      },
    };
  }

  const rawRound = value.round;
  const question = isRecord(rawRound) ? rawRound.question : undefined;
  if (typeof question !== "string" && question !== null) return fail("round.question");
  return {
    ok: true,
    value: {
      ...state.value,
      leader,
      round: { ...round, question },
      questionsLeft,
      moreQuestions: moreQuestions.value,
      questions: questions.value,
      summary: summary.value,
      linkUrl: linkUrl.value,
    },
  };
}

// Length as the database counts it (characters, not UTF-16 units, so an emoji is one), after the part of the nick
// rule a browser can apply: NFC, whitespace runs to one space, trimmed edges. The database has the final word.
export function nickLength(nick: string): number {
  return Array.from(nick.normalize("NFC").replace(/\s+/g, " ").trim()).length;
}

// A question's length as the database counts it (private.question_text): the part of the nick rule a browser can
// apply, as in nickLength, then without the trailing question marks and spaces, since the screen adds the "?" itself.
// The database has the final word.
export function questionLength(text: string): number {
  return Array.from(
    text
      .normalize("NFC")
      .replace(/\s+/g, " ")
      .trim()
      .replace(/[? ]+$/, ""),
  ).length;
}

export function playerCountLabel(count: number): string {
  return count === 1 ? "1 gracz" : `${count} graczy`;
}

// The round's question as one sentence, for its heading and the screen reader. React renders it as text, never as HTML
// (lessons.md). null: the base did not have the round's question, so the sentence says only that.
export function questionSentence(question: string | null): string {
  return question === null ? "Nie udało się wczytać pytania." : `Kto z nas najprawdopodobniej ${question}?`;
}
