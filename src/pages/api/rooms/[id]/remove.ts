import type { APIRoute } from "astro";
import { actionAnswer, bodyNick, OUTSIDE_ROOM, readJsonBody, refuseForeignPost } from "@/lib/rooms/json-route";
import { removePlayer, ringLobby } from "@/lib/rooms/server";
import { PLAYER_TOKEN_PATTERN, playerCookieName, UUID_PATTERN } from "@/lib/rooms/tokens";
import { createClient } from "@/lib/supabase";

const OP = "remove";

// "Usuń" by a guest's nick on the list of players (S-09), for the room's leader: the host by the session, a co-host by
// the room's cookie, in the lobby and while the game is in play. The guest leaves the room and the room gets a new link
// code in the same move; every other player stays. The body carries the nick as it stands on the leader's list
// ({nick}); it goes only into remove_player's POST body, never into a URL or a log line. A nick no guest of the room
// has (the host's own, or one removed already: a double tap, another leader's screen) is player_unknown; a co-host
// removing a co-host, itself included, cohost_protected. JSON from the room screen: {ok: true} or {error: code}
// (src/lib/rooms/json-route.ts).
export const POST: APIRoute = async (context) => {
  const refused = refuseForeignPost(context, OP);
  if (refused) return refused;

  const roomId = context.params.id ?? "";
  if (!UUID_PATTERN.test(roomId)) return actionAnswer(OP, undefined, OUTSIDE_ROOM);

  const body = await readJsonBody(context, OP);
  if (!body.ok) return body.response;
  const nick = bodyNick(body.body);
  if (nick === undefined) return actionAnswer(OP, roomId, { ok: false, reason: "invalid_body" });

  // A cookie in another form is not ours (remove_player would raise on it), so it counts as none.
  const cookie = context.cookies.get(playerCookieName(roomId))?.value;
  const playerToken = cookie !== undefined && PLAYER_TOKEN_PATTERN.test(cookie) ? cookie : null;
  if (!context.locals.user && !playerToken) return actionAnswer(OP, roomId, OUTSIDE_ROOM);

  const supabase = createClient(context.request.headers, context.cookies);
  if (!supabase) return actionAnswer(OP, roomId, { ok: false, reason: "service_unavailable" });

  // Another host's room answers room_unknown from the database, the same 404 as no room at all; a guest of the room
  // without the co-host role gets not_leader.
  const result = await removePlayer(supabase, roomId, nick, playerToken);
  // The removed player's open screen fetches the room's state and finds itself outside the room, the others drop the
  // nick from the list, and every leader's screen gets the new link.
  if (result.ok) await ringLobby(context.locals, supabase, roomId);
  return actionAnswer(OP, roomId, result);
};
