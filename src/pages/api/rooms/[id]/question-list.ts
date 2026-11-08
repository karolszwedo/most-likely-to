import type { APIRoute } from "astro";
import { actionAnswer, OUTSIDE_ROOM, refuseForeignPost } from "@/lib/rooms/json-route";
import { hostRoomCategories, openQuestionList } from "@/lib/rooms/server";
import { UUID_PATTERN } from "@/lib/rooms/tokens";
import { shuffledQuestions } from "@/lib/rounds/draw";
import { createClient } from "@/lib/supabase";

const OP = "question-list";

// "Przejrzyj pytania", for the room's host (the session), in the lobby (S-06, PRD FR-012). The Worker sends the game's
// pool in random order (src/lib/rounds/draw.ts), and open_question_list writes its first 15 as the game's question
// list; a list that exists already stays as it is (a double tap, the host's second screen). No bell: the list is the
// host's only, a list of 15 leaves the number of the game's questions every player sees at 15 (game-length), and the
// host's screen fetches the room's state after the answer anyway, so the guests' screens are not woken for nothing
// (test-plan.md, risk #7). JSON from the room screen: {ok: true} or {error: code}
// (src/lib/rooms/json-route.ts).
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

  const result = await openQuestionList(supabase, roomId, shuffledQuestions(room.selection, Math.random));
  return actionAnswer(OP, roomId, result);
};
