import type { APIRoute } from "astro";
import { CATEGORIES } from "@/data/questions";
import { logEvent } from "@/lib/log";
import { jsonAnswer } from "@/lib/rooms/json-route";
import { createRoom, hostGames, ringLobby } from "@/lib/rooms/server";
import { newLinkToken } from "@/lib/rooms/tokens";
import { createClient } from "@/lib/supabase";

const CATEGORY_IDS: readonly string[] = CATEGORIES.map((category) => category.id);

// The host's list of own games (S-13, lista własnych gier), as JSON: {games: [{id, createdAt, startedAt, questions,
// nicks}]}, the signed-in host's ended games, newest first (HostGame, src/lib/rooms/shared.ts); {games: []} for a host
// with none. For smoke's cleanup at the end of its run and any client of the host; the page "Twoje gry" reads the same
// list on the server. Without a session the same 404 as the host's routes, so the answer does not tell whether the
// list exists. A failure is 503 or 500, already logged with its status and code by src/lib/rooms/server.ts, never an
// empty list. Nothing is logged with the nicks.
export const GET: APIRoute = async (context) => {
  if (!context.locals.user) {
    logEvent("warn", { op: "host_games", step: "session", status: 404 });
    return jsonAnswer({ error: "not_found" }, 404);
  }

  const supabase = createClient(context.request.headers, context.cookies);
  if (!supabase) {
    return jsonAnswer({ error: "service_unavailable" }, 503);
  }

  const result = await hostGames(supabase);
  if (!result.ok) {
    return jsonAnswer({ error: result.reason }, result.reason === "service_unavailable" ? 503 : 500);
  }
  return jsonAnswer({ games: result.games });
};

function formStrings(form: FormData | null, name: string): Set<string> {
  return new Set((form?.getAll(name) ?? []).filter((value): value is string => typeof value === "string"));
}

// "Nowa gra". Only an error code goes into the URL, never the nick; / turns it into a Polish message
// (src/lib/rooms/errors.ts).
export const POST: APIRoute = async (context) => {
  if (!context.locals.user) {
    return context.redirect("/auth/signin");
  }

  // A body that is not a form counts as empty fields, not a 500. The nick rule lives in the database.
  const form = await context.request.formData().catch(() => null);
  const nick = form?.get("nick");
  const picked = formStrings(form, "category");
  const adult = formStrings(form, "adult");

  if (picked.size === 0 || [...picked].some((id) => !CATEGORY_IDS.includes(id))) {
    return context.redirect("/?error=invalid_categories");
  }
  // In the order of the question base; 18+ outside the picked categories is dropped without a word.
  const categories = CATEGORY_IDS.filter((id) => picked.has(id));
  const adultCategories = categories.filter((id) => adult.has(id));

  const supabase = createClient(context.request.headers, context.cookies);
  if (!supabase) {
    return context.redirect("/?error=service_unavailable");
  }

  const result = await createRoom(supabase, {
    nick: typeof nick === "string" ? nick : "",
    linkToken: newLinkToken(),
    categories,
    adultCategories,
    confirmClose: form?.get("confirm_close") === "1",
  });
  if (!result.ok) {
    return context.redirect(`/?error=${encodeURIComponent(result.reason)}`);
  }

  // Guests of the closed room see "Koniec wieczoru" right away instead of at their next poll.
  if (result.closedRoomId) {
    await ringLobby(context.locals, supabase, result.closedRoomId);
  }
  return context.redirect(`/r/${result.roomId}`);
};
