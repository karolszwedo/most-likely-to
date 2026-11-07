import type { APIRoute } from "astro";
import {
  actionAnswer,
  bodyPosition,
  bodyQuestionText,
  OUTSIDE_ROOM,
  readJsonBody,
  refuseForeignPost,
} from "@/lib/rooms/json-route";
import { editListQuestion } from "@/lib/rooms/server";
import { UUID_PATTERN } from "@/lib/rooms/tokens";
import { createClient } from "@/lib/supabase";

const OP = "question-edit";

// "Popraw", for the room's host (the session), in the lobby (S-06): the entry of the game's question list at this
// position gets the host's own text, and the base's wording of its question does not come up in this game. The body
// carries the entry's position and the text as the host typed it ({position, text}); the text goes only into
// edit_list_question's POST body, never into a URL or a log line. The database normalizes it and answers
// invalid_question_text outside 1-90 characters; an entry removed already is question_unknown. No bell, as in
// question-list.ts: a reworded entry is still one question of the game, so the number every player sees stays
// (game-length). JSON from the room screen: {ok: true} or {error: code} (src/lib/rooms/json-route.ts).
export const POST: APIRoute = async (context) => {
  const refused = refuseForeignPost(context, OP);
  if (refused) return refused;

  const roomId = context.params.id ?? "";
  if (!UUID_PATTERN.test(roomId)) return actionAnswer(OP, undefined, OUTSIDE_ROOM);

  const body = await readJsonBody(context, OP);
  if (!body.ok) return body.response;
  const position = bodyPosition(body.body);
  const text = bodyQuestionText(body.body);
  if (position === undefined || text === undefined) {
    return actionAnswer(OP, roomId, { ok: false, reason: "invalid_body" });
  }

  if (!context.locals.user) return actionAnswer(OP, roomId, OUTSIDE_ROOM);

  const supabase = createClient(context.request.headers, context.cookies);
  if (!supabase) return actionAnswer(OP, roomId, { ok: false, reason: "service_unavailable" });

  // Another host's room answers room_unknown from the database, the same 404 as no room at all.
  const result = await editListQuestion(supabase, roomId, position, text);
  return actionAnswer(OP, roomId, result);
};
