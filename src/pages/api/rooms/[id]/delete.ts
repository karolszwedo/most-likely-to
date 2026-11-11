import type { APIRoute } from "astro";
import { actionAnswer, OUTSIDE_ROOM, refuseForeignPost } from "@/lib/rooms/json-route";
import { deleteGame } from "@/lib/rooms/server";
import { UUID_PATTERN } from "@/lib/rooms/tokens";
import { createClient } from "@/lib/supabase";

const OP = "delete";

// "Usuń" on the host's list of own games (S-13, skasowanie gry), for the game's host only (the session), once the game
// is ended: the room goes with everything tied to it, and the anonymous counters of the questions stay (delete_game).
// The body is {} and nothing in it is read. No bell: a closed room's screens neither poll nor listen, so nobody would
// hear it; a guest of the deleted game learns it on the next load of the room's page ("Tej gry już nie ma."). A room in
// the lobby or with a game in play is game_not_ended (409): the host ends it first. JSON from the host's screen:
// {ok: true} or {error: code} (src/lib/rooms/json-route.ts).
export const POST: APIRoute = async (context) => {
  const refused = refuseForeignPost(context, OP);
  if (refused) return refused;

  const roomId = context.params.id ?? "";
  if (!UUID_PATTERN.test(roomId)) return actionAnswer(OP, undefined, OUTSIDE_ROOM);

  // Only the host deletes its games: a player's cookie, a co-host's included, does not count here.
  if (!context.locals.user) return actionAnswer(OP, roomId, OUTSIDE_ROOM);

  const supabase = createClient(context.request.headers, context.cookies);
  if (!supabase) return actionAnswer(OP, roomId, { ok: false, reason: "service_unavailable" });

  // Another host's room and a game deleted already answer room_unknown from the database, the same 404 as no room at
  // all.
  const result = await deleteGame(supabase, roomId);
  return actionAnswer(OP, roomId, result);
};
