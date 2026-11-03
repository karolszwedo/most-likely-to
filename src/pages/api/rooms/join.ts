import type { APIRoute } from "astro";
import { joinRoom, requestJoin, requestReturn, ringLobby, roomLink, roomLobby } from "@/lib/rooms/server";
import {
  LINK_TOKEN_PATTERN,
  newPlayerToken,
  PLAYER_TOKEN_PATTERN,
  playerCookieName,
  playerCookieOptions,
  TAKEN_NICK_COOKIE,
  takenNickCookieOptions,
} from "@/lib/rooms/tokens";
import { createClient } from "@/lib/supabase";

// request_return's refusals that mean something else on the link's form than on a leader's screen: nick_taken there is
// another request to come back already waiting for that nick, player_unknown a nick no player of the room has.
const RETURN_REFUSALS: Record<string, string> = {
  nick_taken: "return_taken",
  player_unknown: "return_unknown",
};

// A guest joins a room in the lobby through the host's link and gets the room's cookie. Once the game is in play, the
// same form sends a latecomer's request to join, which the host answers on the room screen (S-08). A guest whose nick
// is taken because it is their own place (another browser, cleared data: the room's cookie is gone) asks a leader to
// come back to it instead (intent=return, S-04), in the lobby and while the game is in play; a leader's "Wpuść" moves
// the place to this browser's token. Only an error code and the link code (checked against its pattern) go into the
// URL, never the nick; /j/<code> turns the code into a Polish message (src/lib/rooms/errors.ts). The nick of a refusal
// as taken goes back in a short cookie of the link pages only (TAKEN_NICK_COOKIE), so the form can offer the return.
export const POST: APIRoute = async (context) => {
  // A body that is not a form counts as empty fields, not a 500. The nick rule lives in the database.
  const form = await context.request.formData().catch(() => null);
  const link = form?.get("link");
  const rawNick = form?.get("nick");
  const nick = typeof rawNick === "string" ? rawNick : "";
  const returning = form?.get("intent") === "return";
  if (typeof link !== "string" || !LINK_TOKEN_PATTERN.test(link)) {
    return context.redirect("/j/invalid");
  }
  const backToLink = (reason: string) => context.redirect(`/j/${link}?error=${encodeURIComponent(reason)}`);
  // A refusal the form answers with the return: the nick it asked with goes back with it, outside the URL.
  const backWithNick = (reason: string) => {
    context.cookies.set(TAKEN_NICK_COOKIE, nick, takenNickCookieOptions(context.url));
    return backToLink(reason);
  };
  const forgetNick = () => {
    context.cookies.delete(TAKEN_NICK_COOKIE, { path: "/j/" });
  };

  const supabase = createClient(context.request.headers, context.cookies);
  if (!supabase) {
    return backToLink("service_unavailable");
  }

  const room = await roomLink(supabase, link);
  if (!room.ok) return backToLink(room.reason);
  if (room.status === "closed") return backToLink("room_closed");
  if (room.status === "unknown") return backToLink("room_unknown");

  // Someone already in the room (a guest whose cookie still works, or the host) goes back to it without a second entry:
  // a double tap on "Dołącz", or the link opened again, also once the game has started. Same rule as the /j/<code>
  // page.
  const playerToken = context.cookies.get(playerCookieName(room.roomId))?.value;
  if (context.locals.user || playerToken) {
    const inside = await roomLobby(supabase, room.roomId, playerToken);
    if (!inside.ok) return backToLink(inside.reason);
    if (inside.lobby) {
      forgetNick();
      return context.redirect(`/r/${room.roomId}`);
    }
  }

  // The token of a request: the one in the room's cookie when it has our form (a request asked before, e.g. turned away
  // and asking again), else a new one, because request_join and request_return raise on any other form. Once a leader
  // lets them in it is the player's token, so the same cookie opens the room.
  const requestToken =
    playerToken !== undefined && PLAYER_TOKEN_PATTERN.test(playerToken) ? playerToken : newPlayerToken();

  // A request asked: the room's cookie keeps its token, the host's screen fetches its list of requests again, and the
  // link's page shows the waiting screen (a 303, so a reload never posts again).
  const asked = async () => {
    context.cookies.set(playerCookieName(room.roomId), requestToken, playerCookieOptions(context.url));
    forgetNick();
    await ringLobby(context.locals, supabase, room.roomId);
    return context.redirect(`/j/${link}`, 303);
  };

  // Back to one's own place (S-04), in the lobby or with a game in play. A refusal goes back with its code above the
  // form, and with the nick, so the form still offers the return (e.g. requests_full: in a moment).
  if (returning) {
    const result = await requestReturn(supabase, link, nick, requestToken);
    if (!result.ok) return backWithNick(RETURN_REFUSALS[result.reason] ?? result.reason);
    return asked();
  }

  // A game in play takes no one new through join_room (game_started): a latecomer asks the host instead. A refusal goes
  // back with its code, above the form.
  if (room.status === "started") {
    const result = await requestJoin(supabase, link, nick, requestToken);
    if (!result.ok) return result.reason === "nick_taken" ? backWithNick(result.reason) : backToLink(result.reason);
    return asked();
  }

  // A room in the lobby. If the game starts between these two calls, join_room says game_started, and the link's page
  // shows the request form under it.
  const newToken = newPlayerToken();
  const result = await joinRoom(supabase, { linkToken: link, nick, playerToken: newToken });
  if (!result.ok) {
    return result.reason === "nick_taken" ? backWithNick(result.reason) : backToLink(result.reason);
  }

  context.cookies.set(playerCookieName(result.roomId), newToken, playerCookieOptions(context.url));
  forgetNick();
  // The host and the players already in the room fetch the list again.
  await ringLobby(context.locals, supabase, result.roomId);
  return context.redirect(`/r/${result.roomId}`);
};
