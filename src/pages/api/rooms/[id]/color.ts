import type { APIRoute } from "astro";
import { actionAnswer, bodyColor, OUTSIDE_ROOM, readJsonBody, refuseForeignPost } from "@/lib/rooms/json-route";
import { ringLobby, setPlayerColor } from "@/lib/rooms/server";
import { PLAYER_TOKEN_PATTERN, playerCookieName, UUID_PATTERN } from "@/lib/rooms/tokens";
import { createClient } from "@/lib/supabase";

const OP = "color";

// A player's own colour (S-18, PRD FR-025): any player of the room, the host by the session, a guest by the room's
// cookie, a latecomer once let in; in the lobby and while the game is in play. The body is {color}, a colour of the
// game's palette, 0-19 (bodyColor); anything else is not our screen's (invalid_body). The colour goes only into
// set_player_color's POST body, never into a URL or a log line, and the answer is {ok: true} or {error: code}
// (src/lib/rooms/json-route.ts): color_taken when another player of the room has it, room_closed once the game is
// over; the player's own colour again is ok. Every screen learns the change from the bell, the player's own too.
export const POST: APIRoute = async (context) => {
  const refused = refuseForeignPost(context, OP);
  if (refused) return refused;

  const roomId = context.params.id ?? "";
  if (!UUID_PATTERN.test(roomId)) return actionAnswer(OP, undefined, OUTSIDE_ROOM);

  const body = await readJsonBody(context, OP);
  if (!body.ok) return body.response;
  const color = bodyColor(body.body);
  if (color === undefined) return actionAnswer(OP, roomId, { ok: false, reason: "invalid_body" });

  // A cookie in another form is not ours (set_player_color would raise on it), so it counts as none.
  const cookie = context.cookies.get(playerCookieName(roomId))?.value;
  const playerToken = cookie !== undefined && PLAYER_TOKEN_PATTERN.test(cookie) ? cookie : null;
  if (!context.locals.user && !playerToken) return actionAnswer(OP, roomId, OUTSIDE_ROOM);

  const supabase = createClient(context.request.headers, context.cookies);
  if (!supabase) return actionAnswer(OP, roomId, { ok: false, reason: "service_unavailable" });

  // Someone who is not a player of this room, another host's room included, answers room_unknown from the database,
  // the same 404 as no room at all.
  const result = await setPlayerColor(supabase, roomId, color, playerToken);
  if (result.ok) await ringLobby(context.locals, supabase, roomId);
  return actionAnswer(OP, roomId, result);
};
