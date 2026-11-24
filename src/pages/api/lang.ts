import type { APIContext, APIRoute } from "astro";
import { isLang, type Lang } from "@/lib/i18n";
import { LANG_COOKIE, langCookieOptions, nextPath } from "@/lib/i18n/screen-lang";
import { jsonAnswer, readFormRequest, readJsonBody, refuseForeignPost } from "@/lib/rooms/json-route";

const OP = "lang";

// The switch of the screen's language (S-27, LanguageSwitch): keeps the person's language in their browser's cookie for
// the next pages, and changes nothing else, so nobody else's screen and nothing of a game. Two ways in: the form of a
// page without live state (url-encoded, under Astro's checkOrigin), answered with a 303 back to the page (next, only a
// path of this site), and the room's and the waiting screen's fetch (JSON, with the checks of every JSON route),
// answered with 204, as that screen has already changed by itself. A language other than pl and en is a 400 with no
// cookie; the body is never logged.
function keepLang(context: APIContext, lang: Lang): void {
  context.cookies.set(LANG_COOKIE, lang, langCookieOptions(context.url));
}

function bodyLang(body: unknown): unknown {
  return typeof body === "object" && body !== null && Object.hasOwn(body, "lang")
    ? (body as Record<string, unknown>).lang
    : undefined;
}

export const POST: APIRoute = async (context) => {
  const contentType = context.request.headers.get("Content-Type")?.split(";")[0].trim().toLowerCase();
  if (contentType === "application/json") {
    const refusal = refuseForeignPost(context, OP);
    if (refusal) return refusal;
    const read = await readJsonBody(context, OP);
    if (!read.ok) return read.response;
    const lang = bodyLang(read.body);
    if (!isLang(lang)) return jsonAnswer({ error: "invalid_body" }, 400);
    keepLang(context, lang);
    return new Response(null, { status: 204 });
  }

  const read = await readFormRequest(context.request, OP);
  const lang = read.ok ? read.form.get("lang") : null;
  if (!read.ok || !isLang(lang)) return jsonAnswer({ error: "invalid_body" }, 400);
  keepLang(context, lang);
  return context.redirect(nextPath(read.form.get("next"), context.url.origin), 303);
};
