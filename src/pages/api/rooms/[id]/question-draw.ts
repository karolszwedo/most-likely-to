import type { APIRoute } from "astro";
import { actionAnswer, OUTSIDE_ROOM, refuseForeignPost } from "@/lib/rooms/json-route";
import { drawListQuestion, hostRoomCategories, ringLobby } from "@/lib/rooms/server";
import { UUID_PATTERN } from "@/lib/rooms/tokens";
import { shuffledQuestions } from "@/lib/rounds/draw";
import { createClient } from "@/lib/supabase";

const OP = "question-draw";

// "Dolosuj pytanie", for the room's host (the session), in the lobby (S-06). The Worker sends the game's pool in random
// order, as for "Przejrzyj pytania" (question-list.ts), and draw_list_question puts the first question on no row of the
// list (removed and reworded entries included) at its end. When every question of the picked categories is on the list
// already, draw_list_question answers no_questions, the start's code, whose text tells the host to set up a new game;
// so this route answers no_new_questions instead, whose text points to an own question (as next.ts does with
// questions_ran_out). Once accepted, the room's bell: the number of the game's questions grows by one on every
// player's screen at once (game-length), not only on the host's list. JSON from the room screen: {ok: true} or
// {error: code} (src/lib/rooms/json-route.ts).
export const POST: APIRoute = async (context) => {
  const refused = refuseForeignPost(context, OP);
  if (refused) return refused;

  const roomId = context.params.id ?? "";
  if (!UUID_PATTERN.test(roomId)) return actionAnswer(OP, undefined, OUTSIDE_ROOM);
  if (!context.locals.user) return actionAnswer(OP, roomId, OUTSIDE_ROOM);

  const supabase = createClient(context.request.headers, context.cookies);
  if (!supabase) return actionAnswer(OP, roomId, { ok: false, reason: "service_unavailable" });

  // Only the host sees the room's row, so anyone else ends here as outside the room.
  const room = await hostRoomCategories(supabase, roomId);
  if (!room.ok) return actionAnswer(OP, roomId, room);
  if (!room.selection) return actionAnswer(OP, roomId, OUTSIDE_ROOM);

  const result = await drawListQuestion(supabase, roomId, shuffledQuestions(room.selection, Math.random));
  if (result.ok) await ringLobby(context.locals, supabase, roomId);
  if (!result.ok && result.reason === "no_questions") {
    return actionAnswer(OP, roomId, { ok: false, reason: "no_new_questions" });
  }
  return actionAnswer(OP, roomId, result);
};
