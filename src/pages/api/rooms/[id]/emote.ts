import type { APIRoute } from "astro";
import { bodyEmote } from "@/lib/rooms/emotes";
import { actionAnswer, OUTSIDE_ROOM, readJsonBody, refuseForeignPost } from "@/lib/rooms/json-route";
import { broadcastEmote, roomLobby } from "@/lib/rooms/server";
import { PLAYER_TOKEN_PATTERN, playerCookieName, UUID_PATTERN } from "@/lib/rooms/tokens";
import { createClient } from "@/lib/supabase";

const OP = "emote";

// An emote to the whole room (S-16, PRD FR-023): any player of the room, the host by the session, a guest by the room's
// cookie, a latecomer once let in; in the lobby, during the game and on the end of the evening alike. room_lobby tells
// the player and their nick, which goes with the emote, so the room sees who sent it; a latecomer still waiting or
// turned away, and anyone else, gets null from it: the same 404 as no room. Nothing is written: the emote and the nick
// go only onto the room's players' channel (sendEmote, src/lib/live-sync/server.ts), on the topic of the channel key
// from that same state (players-only-live-channel), never into the database, a log line or the answer, which is
// {ok: true} or {error: code} (src/lib/rooms/json-route.ts). So a stranger with only the room's id, a removed player and
// a latecomer turned away reach no screen with an emote, through the Worker or past it. The bound within the room stays:
// a player who has the key may still send to the channel past the Worker, with another player's nick. No bell: the
// room's state does not change. The pause between emotes is the screen's own (src/lib/rooms/emotes.ts), since a player
// with the key sends past the Worker anyway.
export const POST: APIRoute = async (context) => {
  const refused = refuseForeignPost(context, OP);
  if (refused) return refused;

  const roomId = context.params.id ?? "";
  if (!UUID_PATTERN.test(roomId)) return actionAnswer(OP, undefined, OUTSIDE_ROOM);

  const body = await readJsonBody(context, OP);
  if (!body.ok) return body.response;
  const emote = bodyEmote(body.body);
  if (emote === undefined) return actionAnswer(OP, roomId, { ok: false, reason: "invalid_body" });

  // A cookie in another form is no player's token (room_lobby takes it for no one), so it counts as none.
  const cookie = context.cookies.get(playerCookieName(roomId))?.value;
  const playerToken = cookie !== undefined && PLAYER_TOKEN_PATTERN.test(cookie) ? cookie : null;
  if (!context.locals.user && !playerToken) return actionAnswer(OP, roomId, OUTSIDE_ROOM);

  const supabase = createClient(context.request.headers, context.cookies);
  if (!supabase) return actionAnswer(OP, roomId, { ok: false, reason: "service_unavailable" });

  const result = await roomLobby(supabase, roomId, playerToken);
  if (!result.ok) return actionAnswer(OP, roomId, result);
  if (!result.lobby) return actionAnswer(OP, roomId, OUTSIDE_ROOM);

  await broadcastEmote(context.locals, supabase, roomId, result.lobby.channel_key, { emote, nick: result.lobby.me });
  return actionAnswer(OP, roomId, { ok: true });
};
