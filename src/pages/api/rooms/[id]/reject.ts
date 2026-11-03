import type { APIRoute } from "astro";
import { actionAnswer, bodyNick, OUTSIDE_ROOM, readJsonBody, refuseForeignPost } from "@/lib/rooms/json-route";
import { rejectLatecomer, ringLobby } from "@/lib/rooms/server";
import { PLAYER_TOKEN_PATTERN, playerCookieName, UUID_PATTERN } from "@/lib/rooms/tokens";
import { createClient } from "@/lib/supabase";

const OP = "reject";

// "Odrzuć", for the room's leader: the host by the session, a co-host by the room's cookie (S-07), while the game is in
// play (S-08) and, for a request to come back, in the lobby too (S-04), with no question first: the request with this nick is turned away, the latecomer's screen says so, and
// they may ask again. The body as in admit.ts ({nick}, never logged). A request already answered is request_unknown.
// JSON from the room screen: {ok: true} or {error: code} (src/lib/rooms/json-route.ts).
export const POST: APIRoute = async (context) => {
  const refused = refuseForeignPost(context, OP);
  if (refused) return refused;

  const roomId = context.params.id ?? "";
  if (!UUID_PATTERN.test(roomId)) return actionAnswer(OP, undefined, OUTSIDE_ROOM);

  const body = await readJsonBody(context, OP);
  if (!body.ok) return body.response;
  const nick = bodyNick(body.body);
  if (nick === undefined) return actionAnswer(OP, roomId, { ok: false, reason: "invalid_body" });

  // A cookie in another form is not ours (reject_latecomer would raise on it), so it counts as none.
  const cookie = context.cookies.get(playerCookieName(roomId))?.value;
  const playerToken = cookie !== undefined && PLAYER_TOKEN_PATTERN.test(cookie) ? cookie : null;
  if (!context.locals.user && !playerToken) return actionAnswer(OP, roomId, OUTSIDE_ROOM);

  const supabase = createClient(context.request.headers, context.cookies);
  if (!supabase) return actionAnswer(OP, roomId, { ok: false, reason: "service_unavailable" });

  // Another host's room answers room_unknown from the database, the same 404 as no room at all; a guest of the room
  // without the co-host role gets not_leader.
  const result = await rejectLatecomer(supabase, roomId, nick, playerToken);
  // The latecomer's waiting screen shows the refusal, and the leaders' other screens drop the request from the list.
  if (result.ok) await ringLobby(context.locals, supabase, roomId);
  return actionAnswer(OP, roomId, result);
};
