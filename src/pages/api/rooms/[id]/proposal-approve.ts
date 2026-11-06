import type { APIRoute } from "astro";
import {
  actionAnswer,
  bodyProposalNumber,
  OUTSIDE_ROOM,
  readJsonBody,
  refuseForeignPost,
} from "@/lib/rooms/json-route";
import { approveProposal, ringLobby } from "@/lib/rooms/server";
import { PLAYER_TOKEN_PATTERN, playerCookieName, UUID_PATTERN } from "@/lib/rooms/tokens";
import { createClient } from "@/lib/supabase";

const OP = "proposal-approve";

// "Zatwierdź" of a proposal, for the room's leader: the host by the session, a co-host by the room's cookie, once the
// game has started (S-10, PRD FR-014). The body is {number}, the proposal's number on the leader's list
// (bodyProposalNumber); anything else is not our screen's (invalid_body). The approved question plays in the next
// round. game_not_started in the lobby and list_full at 100 rows of the game's question list: the proposal goes on
// waiting. proposal_unknown for a proposal no longer waiting. JSON from the room screen: {ok: true} or {error: code}
// (src/lib/rooms/json-route.ts).
export const POST: APIRoute = async (context) => {
  const refused = refuseForeignPost(context, OP);
  if (refused) return refused;

  const roomId = context.params.id ?? "";
  if (!UUID_PATTERN.test(roomId)) return actionAnswer(OP, undefined, OUTSIDE_ROOM);

  const body = await readJsonBody(context, OP);
  if (!body.ok) return body.response;
  const number = bodyProposalNumber(body.body);
  if (number === undefined) return actionAnswer(OP, roomId, { ok: false, reason: "invalid_body" });

  // A cookie in another form is not ours (approve_proposal would raise on it), so it counts as none.
  const cookie = context.cookies.get(playerCookieName(roomId))?.value;
  const playerToken = cookie !== undefined && PLAYER_TOKEN_PATTERN.test(cookie) ? cookie : null;
  if (!context.locals.user && !playerToken) return actionAnswer(OP, roomId, OUTSIDE_ROOM);

  const supabase = createClient(context.request.headers, context.cookies);
  if (!supabase) return actionAnswer(OP, roomId, { ok: false, reason: "service_unavailable" });

  // Another host's room answers room_unknown from the database, the same 404 as no room at all; a guest of the room
  // without the co-host role gets not_leader.
  const result = await approveProposal(supabase, roomId, number, playerToken);
  // The leaders' other screens drop the proposal, its author's count falls, and "Następne pytanie" comes back if the
  // questions had run out.
  if (result.ok) await ringLobby(context.locals, supabase, roomId);
  return actionAnswer(OP, roomId, result);
};
