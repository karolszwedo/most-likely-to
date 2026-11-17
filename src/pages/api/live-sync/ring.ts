import type { APIRoute } from "astro";
import { ringRoom } from "@/lib/live-sync/server";
import { isValidRoomId, isValidSeq } from "@/lib/live-sync/shared";
import { jsonAnswer, readJsonRequest } from "@/lib/rooms/json-route";
import { createClient } from "@/lib/supabase";

// Only a signed-in user rings through this endpoint; the public channel itself does not enforce it. Its body is read
// under the JSON routes' limit (W-2), and every answer is never cached. No Origin check: the live-sync probe
// (scripts/live-sync-probe.mjs) rings from Node, which sends no Origin.
export const POST: APIRoute = async (context) => {
  if (!context.locals.user) {
    return jsonAnswer({ error: "Sign in to ring" }, 401);
  }

  const read = await readJsonRequest(context.request, "ring");
  if (!read.ok) return read.response;
  const body = read.body as { room?: unknown; seq?: unknown } | null;
  const room = body?.room;
  const seq = body?.seq;
  if (!isValidRoomId(room) || !isValidSeq(seq)) {
    return jsonAnswer({ error: "Invalid room or seq" }, 400);
  }

  const supabase = createClient(context.request.headers, context.cookies);
  if (!supabase) {
    return jsonAnswer({ error: "Supabase is not configured" }, 503);
  }

  const result = await ringRoom(supabase, room, seq);
  return jsonAnswer(result, result.ok ? 200 : 502);
};
