import type { APIRoute } from "astro";
import { actionAnswer, bodyQuestionText, OUTSIDE_ROOM, readJsonBody, refuseForeignPost } from "@/lib/rooms/json-route";
import { proposeQuestion, ringLobby } from "@/lib/rooms/server";
import { PLAYER_TOKEN_PATTERN, playerCookieName, UUID_PATTERN } from "@/lib/rooms/tokens";
import { createClient } from "@/lib/supabase";

const OP = "propose";

// A player's proposal of a question (S-10, PRD FR-013): any player of the room, the host by the session, a guest by the
// room's cookie, a latecomer once let in; in the lobby and while the game is in play. The body carries the text as the
// player typed it ({text}), as in question-add.ts: never in a URL or a log line. The database normalizes it and answers
// invalid_question_text outside 1-90 characters, proposal_limit once the player has used up their proposals and
// room_closed once the game is over; the same text waiting from this player again is ok. JSON from the room screen:
// {ok: true} or {error: code} (src/lib/rooms/json-route.ts).
export const POST: APIRoute = async (context) => {
  const refused = refuseForeignPost(context, OP);
  if (refused) return refused;

  const roomId = context.params.id ?? "";
  if (!UUID_PATTERN.test(roomId)) return actionAnswer(OP, undefined, OUTSIDE_ROOM);

  const body = await readJsonBody(context, OP);
  if (!body.ok) return body.response;
  const text = bodyQuestionText(body.body);
  if (text === undefined) return actionAnswer(OP, roomId, { ok: false, reason: "invalid_body" });

  // A cookie in another form is not ours (propose_question would raise on it), so it counts as none.
  const cookie = context.cookies.get(playerCookieName(roomId))?.value;
  const playerToken = cookie !== undefined && PLAYER_TOKEN_PATTERN.test(cookie) ? cookie : null;
  if (!context.locals.user && !playerToken) return actionAnswer(OP, roomId, OUTSIDE_ROOM);

  const supabase = createClient(context.request.headers, context.cookies);
  if (!supabase) return actionAnswer(OP, roomId, { ok: false, reason: "service_unavailable" });

  // Someone who is not a player of this room, another host's room included, answers room_unknown from the database,
  // the same 404 as no room at all.
  const result = await proposeQuestion(supabase, roomId, text, playerToken);
  // The bell carries no text: a leader's screen gets it from the room's state, as the author's gets the counts.
  if (result.ok) await ringLobby(context.locals, supabase, roomId);
  return actionAnswer(OP, roomId, result);
};
