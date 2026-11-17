import type { APIRoute } from "astro";
import { getChannelSigner } from "@/lib/live-sync/signing-key";
import { bodyChatText } from "@/lib/rooms/chat";
import { actionAnswer, OUTSIDE_ROOM, readJsonBody, refuseForeignPost } from "@/lib/rooms/json-route";
import { broadcastChat, roomLobby } from "@/lib/rooms/server";
import { PLAYER_TOKEN_PATTERN, playerCookieName, UUID_PATTERN } from "@/lib/rooms/tokens";
import { createClient } from "@/lib/supabase";

const OP = "chat";

// A player's message on the room's chat (S-23, PRD FR-028), with the checks of the emote's route in the same order
// (src/pages/api/rooms/[id]/emote.ts): any player of the room, the host by the session, a guest by the room's cookie, a
// latecomer once let in; in the lobby, during the game and on the end of the evening alike. The body carries the text
// as typed ({text}); bodyChatText (src/lib/rooms/chat.ts) normalizes it and refuses one the chat does not take (empty,
// over 200 characters, a control or direction character) before the database is asked, as invalid_body. room_lobby
// tells the player and their nick, which goes with the message, so the room sees who wrote it; a latecomer still
// waiting or turned away, a removed player and anyone else get null from it: the same 404 as no room. The message goes
// out signed with the Worker's key (src/lib/live-sync/signature.ts) on the room's players' channel of the channel key
// from that same state (sendChat, src/lib/live-sync/server.ts), and a screen shows only what the Worker signed for this
// room, so nobody writes with another player's nick. Without a usable key the route answers 503 before room_lobby,
// rather than send anything unsigned. Nothing of the message is written: not to the database, a log line (only
// actionAnswer's op, outcome and room id) or the answer, which is {ok: true} or {error: code}
// (src/lib/rooms/json-route.ts). No bell: the room's state does not change. The pause between messages is the
// screen's own (CHAT_COOLDOWN_MS), since a player with the key sends past the Worker anyway.
export const POST: APIRoute = async (context) => {
  const refused = refuseForeignPost(context, OP);
  if (refused) return refused;

  const roomId = context.params.id ?? "";
  if (!UUID_PATTERN.test(roomId)) return actionAnswer(OP, undefined, OUTSIDE_ROOM);

  const body = await readJsonBody(context, OP);
  if (!body.ok) return body.response;
  const text = bodyChatText(body.body);
  if (text === undefined) return actionAnswer(OP, roomId, { ok: false, reason: "invalid_body" });

  // A cookie in another form is no player's token (room_lobby takes it for no one), so it counts as none.
  const cookie = context.cookies.get(playerCookieName(roomId))?.value;
  const playerToken = cookie !== undefined && PLAYER_TOKEN_PATTERN.test(cookie) ? cookie : null;
  if (!context.locals.user && !playerToken) return actionAnswer(OP, roomId, OUTSIDE_ROOM);

  const supabase = createClient(context.request.headers, context.cookies);
  if (!supabase) return actionAnswer(OP, roomId, { ok: false, reason: "service_unavailable" });
  // No key, or a secret that is no key (logged once per isolate by getChannelSigner).
  const signer = await getChannelSigner();
  if (!signer) return actionAnswer(OP, roomId, { ok: false, reason: "service_unavailable" });

  const result = await roomLobby(supabase, roomId, playerToken);
  if (!result.ok) return actionAnswer(OP, roomId, result);
  if (!result.lobby) return actionAnswer(OP, roomId, OUTSIDE_ROOM);

  await broadcastChat(context.locals, supabase, roomId, result.lobby.channel_key, signer, {
    nick: result.lobby.me,
    text,
  });
  return actionAnswer(OP, roomId, { ok: true });
};
