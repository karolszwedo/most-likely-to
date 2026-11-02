import type { APIRoute } from "astro";
import { logEvent } from "@/lib/log";
import { jsonAnswer } from "@/lib/rooms/json-route";
import { leaderQuestionsLeft, roomLobby, roomView } from "@/lib/rooms/server";
import { playerCookieName, UUID_PATTERN } from "@/lib/rooms/tokens";
import { createClient } from "@/lib/supabase";

const ROUTE = "/api/rooms/[id]/lobby";

// The room's state the room screen fetches after each bell and every 15 s, with the round's question as text
// (RoomView, src/lib/rooms/shared.ts): the database is the source of truth, the channel only says "check". The host is
// recognised by the session, a guest by the room's cookie; a leader (the host or a co-host, S-07) also learns whether
// questions are left once a round is revealed or skipped, and gets the players' link on this request's origin (S-09),
// so a link replaced by a removal reaches every leader with the next fetch. Anyone else, a malformed id and a room that
// does not exist get the same 404, so the endpoint does not tell which rooms exist.
export const GET: APIRoute = async (context) => {
  const roomId = context.params.id ?? "";
  if (!UUID_PATTERN.test(roomId)) {
    return jsonAnswer({ error: "not_found" }, 404);
  }

  const supabase = createClient(context.request.headers, context.cookies);
  if (!supabase) {
    return jsonAnswer({ error: "service_unavailable" }, 503);
  }

  const playerToken = context.cookies.get(playerCookieName(roomId))?.value;
  const result = await roomLobby(supabase, roomId, playerToken);
  if (!result.ok) {
    return jsonAnswer({ error: result.reason }, result.reason === "service_unavailable" ? 503 : 500);
  }
  if (!result.lobby) {
    // A stranger guessing ids, a host whose session did not refresh and a phone that dropped the cookie all end here
    // (audit L3); the flags tell them apart, never the values.
    logEvent("warn", {
      route: ROUTE,
      roomId,
      hasUser: Boolean(context.locals.user),
      hasPlayerCookie: playerToken !== undefined,
    });
    return jsonAnswer({ error: "not_found" }, 404);
  }
  return jsonAnswer(roomView(result.lobby, roomId, leaderQuestionsLeft(result.lobby), context.url.origin));
};
