import type { APIContext } from "astro";
import { logEvent } from "@/lib/log";
import { MAX_PIE_SLICES } from "@/lib/rooms/chart";
import type { ActionResult, RoomFailure } from "@/lib/rooms/server";

// What the JSON routes of the room screen share: the game's actions (start, vote, reveal, react, next, skip, end, the
// leader's "Wpuść" and "Odrzuć": admit, reject, the host's role button: cohost, and the host's moves on the game's
// question list: question-list, question-draw, question-remove, question-edit, question-add; a player's emote and a
// player's own colour: color; src/pages/api/rooms/[id]/*.ts), the room's state, a latecomer's request state and the
// screens' reports (src/pages/api/client-events.ts). Every answer is JSON and never cached; an error is a code from
// src/lib/rooms/errors.ts, never free text.

const NO_STORE = { "Cache-Control": "no-store" };

// In bytes. A vote is ~100; anything much longer is not our screen.
const MAX_BODY_LENGTH = 4096;

// The largest round number the database takes (p_round is a Postgres integer). A larger one would fail the call before
// the function runs, as a 500 with error lines in the log, instead of a plain refusal.
const MAX_ROUND = 2_147_483_647;

// The positions of the game's question list as the database keeps them (private.game_questions, 1-100).
const MAX_LIST_POSITION = 100;

// The longest text of a question as typed that the database reads at all (edit_list_question, add_own_question), in
// characters as Postgres counts them; the stored text, once normalized, has 1-90 (QUESTION_MAX_LENGTH).
const MAX_QUESTION_TEXT_LENGTH = 400;

// Someone outside the room (no session and no cookie of the room, another host's room, no such room): the same 404 as
// for a room that does not exist, so the answer does not tell which rooms exist.
export const OUTSIDE_ROOM: RoomFailure = { ok: false, reason: "room_unknown" };

export function jsonAnswer(body: unknown, status = 200): Response {
  return Response.json(body, { status, headers: NO_STORE });
}

// Astro's checkOrigin stops a cross-site POST only for form content types
// (node_modules/astro/dist/core/app/origin-check.js), so a JSON route checks the content type and the Origin itself.
// Every browser sends Origin on a POST from fetch, so a missing one counts as foreign. Answers null when the request
// may go on.
export function refuseForeignPost(context: APIContext, op: string): Response | null {
  const contentType = context.request.headers.get("Content-Type")?.split(";")[0].trim().toLowerCase();
  if (contentType !== "application/json") {
    logEvent("warn", { op, step: "content_type", status: 415 });
    return jsonAnswer({ error: "unsupported_media_type" }, 415);
  }
  if (context.request.headers.get("Origin") !== context.url.origin) {
    logEvent("warn", { op, step: "origin", status: 403 });
    return jsonAnswer({ error: "forbidden" }, 403);
  }
  return null;
}

export type JsonBody = { ok: true; body: unknown } | { ok: false; response: Response };

// The body as text, read up to limit bytes; null as soon as it has more, without reading the rest. A chunked body has
// no Content-Length, so the count is the only limit it meets.
async function readLimited(request: Request, limit: number): Promise<string | null> {
  if (request.body === null) return "";
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > limit) {
      await reader.cancel();
      return null;
    }
    chunks.push(value);
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return new TextDecoder().decode(bytes);
}

// The request's JSON body, or a 400 to send back. A body over the limit is refused before it is read (F6 of the S-02
// review): by its Content-Length when it declares one, else after the first byte past the limit. Only the error's
// name is logged, never the body.
export async function readJsonRequest(request: Request, op: string): Promise<JsonBody> {
  const invalid = { ok: false as const, response: jsonAnswer({ error: "invalid_body" }, 400) };
  const declared = request.headers.get("Content-Length");
  if (declared !== null && !/^\d{1,10}$/.test(declared)) {
    logEvent("warn", { op, step: "body", status: 400, code: "bad_length" });
    return invalid;
  }
  if (declared !== null && Number(declared) > MAX_BODY_LENGTH) {
    logEvent("warn", { op, step: "body", status: 400, code: "too_large" });
    return invalid;
  }
  let text: string | null;
  try {
    text = await readLimited(request, MAX_BODY_LENGTH);
  } catch (error) {
    logEvent("warn", { op, step: "body", status: 400, errName: error instanceof Error ? error.name : "unknown" });
    return invalid;
  }
  if (text === null) {
    logEvent("warn", { op, step: "body", status: 400, code: "too_large" });
    return invalid;
  }
  try {
    const body: unknown = JSON.parse(text);
    return { ok: true, body };
  } catch (error) {
    logEvent("warn", { op, step: "body", status: 400, errName: error instanceof Error ? error.name : "unknown" });
    return invalid;
  }
}

export function readJsonBody(context: APIContext, op: string): Promise<JsonBody> {
  return readJsonRequest(context.request, op);
}

// The number of the question on the player's screen, from a game action's body: a whole number from 1 to MAX_ROUND.
// undefined when the body has no round, is not an object, or holds something else than a number of a round. Every move
// of a round (vote, reveal, thumb, next, skip) needs one, so a move never lands in a question its screen has not shown.
export function bodyRound(body: unknown): number | undefined {
  if (typeof body !== "object" || body === null || Array.isArray(body) || !Object.hasOwn(body, "round")) {
    return undefined;
  }
  const { round } = body as Record<string, unknown>;
  return typeof round === "number" && Number.isInteger(round) && round >= 1 && round <= MAX_ROUND ? round : undefined;
}

// The latecomer's nick from the body of the leader's "Wpuść" or "Odrzuć" ({nick}), as it stands on the leader's list of
// requests, or the guest's nick from the body of the host's role button ({nick, cohost}), as it stands on the list of
// players: a text (the database compares it by the nick rule). undefined when the body has no nick, is not an object,
// or holds something else than a text. Never logged.
export function bodyNick(body: unknown): string | undefined {
  if (typeof body !== "object" || body === null || Array.isArray(body) || !Object.hasOwn(body, "nick")) {
    return undefined;
  }
  const { nick } = body as Record<string, unknown>;
  return typeof nick === "string" ? nick : undefined;
}

// The entry's position from the body of the host's "Usuń" or "Popraw" ({position}): a whole number from 1 to
// MAX_LIST_POSITION, as it stands on the host's list. undefined when the body has no position, is not an object, or
// holds something else than a position of the list.
export function bodyPosition(body: unknown): number | undefined {
  if (typeof body !== "object" || body === null || Array.isArray(body) || !Object.hasOwn(body, "position")) {
    return undefined;
  }
  const { position } = body as Record<string, unknown>;
  return typeof position === "number" && Number.isInteger(position) && position >= 1 && position <= MAX_LIST_POSITION
    ? position
    : undefined;
}

// The question's text from the body of the host's "Popraw" or "Dodaj własne" ({text}): a text of at most
// MAX_QUESTION_TEXT_LENGTH characters, as the host typed it (the database normalizes it and has the final word on its
// length). undefined when the body has no text, is not an object, or holds something else than such a text. Never
// logged.
export function bodyQuestionText(body: unknown): string | undefined {
  if (typeof body !== "object" || body === null || Array.isArray(body) || !Object.hasOwn(body, "text")) {
    return undefined;
  }
  const { text } = body as Record<string, unknown>;
  return typeof text === "string" && Array.from(text).length <= MAX_QUESTION_TEXT_LENGTH ? text : undefined;
}

// The colour from the body of a player's pick ({color}): a whole number from 0 to MAX_PIE_SLICES - 1, a colour of the
// game's palette as the database keeps it (players.color). undefined when the body has no color, is not an object, or
// holds something else than a colour of the palette. Never logged.
export function bodyColor(body: unknown): number | undefined {
  if (typeof body !== "object" || body === null || Array.isArray(body) || !Object.hasOwn(body, "color")) {
    return undefined;
  }
  const { color } = body as Record<string, unknown>;
  return typeof color === "number" && Number.isInteger(color) && color >= 0 && color < MAX_PIE_SLICES
    ? color
    : undefined;
}

function statusFor(reason: string): number {
  if (reason === "room_unknown") return 404;
  if (reason === "invalid_body") return 400;
  if (reason === "service_unavailable") return 503;
  if (reason === "unexpected") return 500;
  return 409;
}

// The answer to one attempt of a round's action, and its one log line {op, outcome, roomId}: "ok" or the refusal code,
// never the vote's target or who sent it. 200 {ok: true}; a refusal 409 {error: code}; someone outside the room 404; a
// body that is not ours 400; a failure 503 or 500 (already logged with its status and code by src/lib/rooms/server.ts).
// roomId is left out when it did not match the pattern of a room id.
export function actionAnswer(op: string, roomId: string | undefined, result: ActionResult): Response {
  if (result.ok) {
    logEvent("info", { op, outcome: "ok", roomId });
    return jsonAnswer({ ok: true });
  }
  const status = statusFor(result.reason);
  logEvent(status >= 500 ? "error" : "info", { op, outcome: result.reason, roomId, status });
  return jsonAnswer({ error: status === 404 ? "not_found" : result.reason }, status);
}
