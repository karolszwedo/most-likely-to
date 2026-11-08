import type { APIRoute } from "astro";
import { actionAnswer, bodyQuestionText, OUTSIDE_ROOM, readJsonBody, refuseForeignPost } from "@/lib/rooms/json-route";
import { addOwnQuestion, ringLobby } from "@/lib/rooms/server";
import { UUID_PATTERN } from "@/lib/rooms/tokens";
import { createClient } from "@/lib/supabase";

const OP = "question-add";

// "Dodaj własne", for the room's host (the session), in the lobby (S-06): an own question at the end of the game's
// question list. The body carries the text as the host typed it ({text}), as in question-edit.ts: never in a URL or a
// log line. The database normalizes it and answers invalid_question_text outside 1-90 characters, and list_full once
// the list has 100 rows. Once accepted, the room's bell: the number of the game's questions grows by one on every
// player's screen at once (game-length), not only on the host's list. JSON from the room screen: {ok: true} or
// {error: code} (src/lib/rooms/json-route.ts).
export const POST: APIRoute = async (context) => {
  const refused = refuseForeignPost(context, OP);
  if (refused) return refused;

  const roomId = context.params.id ?? "";
  if (!UUID_PATTERN.test(roomId)) return actionAnswer(OP, undefined, OUTSIDE_ROOM);

  const body = await readJsonBody(context, OP);
  if (!body.ok) return body.response;
  const text = bodyQuestionText(body.body);
  if (text === undefined) return actionAnswer(OP, roomId, { ok: false, reason: "invalid_body" });

  if (!context.locals.user) return actionAnswer(OP, roomId, OUTSIDE_ROOM);

  const supabase = createClient(context.request.headers, context.cookies);
  if (!supabase) return actionAnswer(OP, roomId, { ok: false, reason: "service_unavailable" });

  // Another host's room answers room_unknown from the database, the same 404 as no room at all.
  const result = await addOwnQuestion(supabase, roomId, text);
  if (result.ok) await ringLobby(context.locals, supabase, roomId);
  return actionAnswer(OP, roomId, result);
};
