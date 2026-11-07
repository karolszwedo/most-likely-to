import type { APIRoute } from "astro";
import { actionAnswer, bodyPosition, OUTSIDE_ROOM, readJsonBody, refuseForeignPost } from "@/lib/rooms/json-route";
import { removeListQuestion } from "@/lib/rooms/server";
import { UUID_PATTERN } from "@/lib/rooms/tokens";
import { createClient } from "@/lib/supabase";

const OP = "question-remove";

// "Usuń", for the room's host (the session), in the lobby (S-06): the entry of the game's question list at this
// position is marked removed, and its question does not come up in this game. The body carries the entry's position as
// it stands on the host's list ({position}). An entry removed already (a double tap, the host's second screen) is
// question_unknown. Once accepted, the room's bell: the number of the game's questions falls by one on every player's
// screen at once (game-length), not only on the host's list. JSON from the room screen: {ok: true} or {error: code}
// (src/lib/rooms/json-route.ts).
export const POST: APIRoute = async (context) => {
  const refused = refuseForeignPost(context, OP);
  if (refused) return refused;

  const roomId = context.params.id ?? "";
  if (!UUID_PATTERN.test(roomId)) return actionAnswer(OP, undefined, OUTSIDE_ROOM);

  const body = await readJsonBody(context, OP);
  if (!body.ok) return body.response;
  const position = bodyPosition(body.body);
  if (position === undefined) return actionAnswer(OP, roomId, { ok: false, reason: "invalid_body" });

  if (!context.locals.user) return actionAnswer(OP, roomId, OUTSIDE_ROOM);

  const supabase = createClient(context.request.headers, context.cookies);
  if (!supabase) return actionAnswer(OP, roomId, { ok: false, reason: "service_unavailable" });

  // Another host's room answers room_unknown from the database, the same 404 as no room at all.
  const result = await removeListQuestion(supabase, roomId, position);
  return actionAnswer(OP, roomId, result);
};
