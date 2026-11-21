import { defineMiddleware } from "astro:middleware";
import { readUser } from "@/lib/auth-user";
import { devPseudoLang } from "@/lib/i18n";
import { withSecurityHeaders } from "@/lib/security-headers";
import { createClient, getPublicSupabaseConfig } from "@/lib/supabase";

// "Twoje gry" (S-13): the host's list of own games, and under the same prefix a game's history (S-26, /gry/<id>), for a
// signed-in host only.
const PROTECTED_ROUTES = ["/gry"];

// Every answer it returns, a redirect too, leaves with the security headers (src/lib/security-headers.ts). Their
// Content-Security-Policy lets the page connect to Realtime at the same SUPABASE_URL the room's page hands its screen.
export const onRequest = defineMiddleware(async (context, next) => {
  const supabaseUrl = getPublicSupabaseConfig()?.supabaseUrl ?? null;
  const supabase = createClient(context.request.headers, context.cookies);

  // The screen's language (S-27): Polish for now; the previews' pseudo language on /dev/*?lang=xx in `astro dev` only.
  context.locals.lang = devPseudoLang(context.url) ?? "pl";

  if (supabase) {
    context.locals.user = await readUser(supabase.auth);
  } else {
    context.locals.user = null;
  }

  // A signed-in host has nothing to do on the sign-in screens and goes home. Sign-in errors (S-05, and Supabase's OAuth
  // state errors) come back to /auth/signin with ?error= or ?error_code=, so those still reach a host with a session.
  const { pathname, searchParams } = context.url;
  if (
    context.locals.user &&
    pathname.startsWith("/auth/") &&
    !searchParams.has("error") &&
    !searchParams.has("error_code")
  ) {
    return withSecurityHeaders(context.redirect("/"), supabaseUrl);
  }

  if (PROTECTED_ROUTES.some((route) => context.url.pathname.startsWith(route))) {
    if (!context.locals.user) {
      return withSecurityHeaders(context.redirect("/auth/signin"), supabaseUrl);
    }
  }

  return withSecurityHeaders(await next(), supabaseUrl);
});
