import type { APIRoute } from "astro";
import { actionAnswer, bodyNick, OUTSIDE_ROOM, readJsonBody, refuseForeignPost } from "@/lib/rooms/json-route";
import { admitLatecomer, ringLobby } from "@/lib/rooms/server";
import { PLAYER_TOKEN_PATTERN, playerCookieName, UUID_PATTERN } from "@/lib/rooms/tokens";
import { createClient } from "@/lib/supabase";

const OP = "admit";

// "Wpuść", for the room's leader: the host by the session, a co-host by the room's cookie (S-07), while the game is in
// play (S-08): the latecomer whose request has this nick becomes a player, sees the round in progress and votes from
// the next question on. A request to come back (S-04), in the lobby too: the place with this nick moves to the
// request's token, with its colour, results and vote; a co-host may not move a co-host's place. The body carries the nick as it stands on the leader's list ({nick}); it goes only into
// admit_latecomer's POST body, never into a URL or a log line. A request already answered (a double tap, another
// leader's screen) is request_unknown. JSON from the room screen: {ok: true} or {error: code}
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

  // A cookie in another form is not ours (admit_latecomer would raise on it), so it counts as none.
  const cookie = context.cookies.get(playerCookieName(roomId))?.value;
  const playerToken = cookie !== undefined && PLAYER_TOKEN_PATTERN.test(cookie) ? cookie : null;
  if (!context.locals.user && !playerToken) return actionAnswer(OP, roomId, OUTSIDE_ROOM);

  const supabase = createClient(context.request.headers, context.cookies);
  if (!supabase) return actionAnswer(OP, roomId, { ok: false, reason: "service_unavailable" });

  // Another host's room answers room_unknown from the database, the same 404 as no room at all; a guest of the room
  // without the co-host role gets not_leader.
  const result = await admitLatecomer(supabase, roomId, nick, playerToken);
  // The latecomer's waiting screen moves on to the room, and every screen shows the new player; for a request to come
  // back, the old device's screen finds its way in gone and says the place moved (S-04).
  if (result.ok) await ringLobby(context.locals, supabase, roomId);
  // A co-host letting someone back to a co-host's place: the removal's text (cohost_protected) would say "usunąć".
  if (!result.ok && result.reason === "cohost_protected") {
    return actionAnswer(OP, roomId, { ok: false, reason: "cohost_returns_by_host" });
  }
  return actionAnswer(OP, roomId, result);
};
