import type { APIRoute } from "astro";
import { actionAnswer, bodyRound, OUTSIDE_ROOM, readJsonBody, refuseForeignPost } from "@/lib/rooms/json-route";
import { leaderSelection, nextRound, ringLobby } from "@/lib/rooms/server";
import { PLAYER_TOKEN_PATTERN, playerCookieName, UUID_PATTERN } from "@/lib/rooms/tokens";
import { shuffledQuestions } from "@/lib/rounds/draw";
import { createClient } from "@/lib/supabase";

const OP = "next";

// "Następne pytanie", for the room's leader: the host by the session, a co-host by the room's cookie (S-07), once the
// round on the leader's screen is revealed or skipped. The body carries that round's number ({round}), so a double
// click or a resent request never moves past a question nobody has seen (round_over). The Worker sends the game's
// whole pool in random order (src/lib/rounds/draw.ts), from the room's categories that room_lobby gives a leader only
// (leader_draw), and next_round opens the first question not played in this game yet in the order of the draw (S-20:
// first the questions the host does not know from its other games, then the known ones, the longest known first;
// FR-015; decision D1 of context/archive/2026-10-15-full-game-evening/research.md). When none is left, next_round
// answers no_questions, the start's code, whose text tells the host to set up a new game; that would close the game in
// play. So this route answers questions_ran_out instead, whose text says the game can be ended (F5 of the S-03 review).
// JSON from the room screen: {ok: true} or {error: code} (src/lib/rooms/json-route.ts).
export const POST: APIRoute = async (context) => {
  const refused = refuseForeignPost(context, OP);
  if (refused) return refused;

  const roomId = context.params.id ?? "";
  if (!UUID_PATTERN.test(roomId)) return actionAnswer(OP, undefined, OUTSIDE_ROOM);

  const body = await readJsonBody(context, OP);
  if (!body.ok) return body.response;
  const round = bodyRound(body.body);
  if (typeof round !== "number") return actionAnswer(OP, roomId, { ok: false, reason: "invalid_body" });

  // A cookie in another form is not ours (next_round would raise on it), so it counts as none.
  const cookie = context.cookies.get(playerCookieName(roomId))?.value;
  const playerToken = cookie !== undefined && PLAYER_TOKEN_PATTERN.test(cookie) ? cookie : null;
  if (!context.locals.user && !playerToken) return actionAnswer(OP, roomId, OUTSIDE_ROOM);

  const supabase = createClient(context.request.headers, context.cookies);
  if (!supabase) return actionAnswer(OP, roomId, { ok: false, reason: "service_unavailable" });

  // Only a leader gets the room's categories: anyone outside the room ends here as outside it, and a guest of the
  // room without the co-host role as not_leader.
  const room = await leaderSelection(supabase, roomId, playerToken);
  if (!room.ok) return actionAnswer(OP, roomId, room);

  const result = await nextRound(supabase, roomId, round, shuffledQuestions(room.selection, Math.random), playerToken);
  if (result.ok) await ringLobby(context.locals, supabase, roomId);
  if (!result.ok && result.reason === "no_questions") {
    return actionAnswer(OP, roomId, { ok: false, reason: "questions_ran_out" });
  }
  return actionAnswer(OP, roomId, result);
};
