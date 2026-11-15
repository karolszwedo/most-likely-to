import type { APIRoute } from "astro";
import { actionAnswer, OUTSIDE_ROOM, refuseForeignPost } from "@/lib/rooms/json-route";
import { leaderSelection, ringLobby, startGame } from "@/lib/rooms/server";
import { PLAYER_TOKEN_PATTERN, playerCookieName, UUID_PATTERN } from "@/lib/rooms/tokens";
import { shuffledQuestions } from "@/lib/rounds/draw";
import { createClient } from "@/lib/supabase";

const OP = "start";

// "Zacznij grę", for the room's leader: the host by the session, a co-host by the room's cookie (S-07). The Worker
// sends the game's whole pool in random order (src/lib/rounds/draw.ts), from the room's categories that room_lobby
// gives a leader only (leader_draw), as next.ts does, and start_game opens round 1 with the first of them in the order
// of the draw (S-20: first the questions the host does not know from its other games), or with the first entry of the
// game's question list when there is one. It checks who leads, the room and the players (at least 3) and fixes who may
// vote. JSON from the room screen: {ok: true} or {error: code} (src/lib/rooms/json-route.ts).
export const POST: APIRoute = async (context) => {
  const refused = refuseForeignPost(context, OP);
  if (refused) return refused;

  const roomId = context.params.id ?? "";
  if (!UUID_PATTERN.test(roomId)) return actionAnswer(OP, undefined, OUTSIDE_ROOM);

  // A cookie in another form is not ours (start_game would raise on it), so it counts as none.
  const cookie = context.cookies.get(playerCookieName(roomId))?.value;
  const playerToken = cookie !== undefined && PLAYER_TOKEN_PATTERN.test(cookie) ? cookie : null;
  if (!context.locals.user && !playerToken) return actionAnswer(OP, roomId, OUTSIDE_ROOM);

  const supabase = createClient(context.request.headers, context.cookies);
  if (!supabase) return actionAnswer(OP, roomId, { ok: false, reason: "service_unavailable" });

  // Only a leader gets the room's categories: anyone outside the room ends here as outside it, and a guest of the
  // room without the co-host role as not_leader.
  const room = await leaderSelection(supabase, roomId, playerToken);
  if (!room.ok) return actionAnswer(OP, roomId, room);

  const candidates = shuffledQuestions(room.selection, Math.random);
  if (candidates.length === 0) return actionAnswer(OP, roomId, { ok: false, reason: "no_questions" });

  const result = await startGame(supabase, roomId, candidates, playerToken);
  if (result.ok) await ringLobby(context.locals, supabase, roomId);
  return actionAnswer(OP, roomId, result);
};
