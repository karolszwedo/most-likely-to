import { createServerClient, parseCookieHeader } from "@supabase/ssr";
import type { AstroCookies } from "astro";
import { SUPABASE_URL, SUPABASE_KEY } from "astro:env/server";
import { isPublishableKey } from "@/lib/supabase-key";

// null without a URL, or with a key that is not the publishable one (src/lib/supabase-key.ts): the callers answer 503
// or their page's error instead of running with a secret key.
export function createClient(requestHeaders: Headers, cookies: AstroCookies) {
  if (!SUPABASE_URL || !isPublishableKey(SUPABASE_KEY)) {
    return null;
  }
  return createServerClient(SUPABASE_URL, SUPABASE_KEY, {
    // Only the server reads the session and PKCE cookies (no auth client in the browser), so scripts never need them.
    // Secure everywhere but the dev server (W-7), so a session never travels over http on the game's own domain; a
    // build on http://localhost (e2e, CI) still works, as browsers count localhost as secure. Unlike the player's cookie,
    // which takes Secure from the request's protocol (playerCookieOptions in src/lib/rooms/tokens.ts): a build opened
    // from a phone at http://<home network IP> lets a guest in but never signs the host in.
    cookieOptions: { httpOnly: true, secure: !import.meta.env.DEV },
    cookies: {
      getAll() {
        return parseCookieHeader(requestHeaders.get("Cookie") ?? "");
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value, options }) => {
          cookies.set(name, value, options);
        });
      },
    },
  });
}

// URL and key for the browser, only for Realtime subscriptions (AGENTS.md). Anything but a publishable key gives null,
// so a misconfigured secret key is never served.
export function getPublicSupabaseConfig(): { supabaseUrl: string; supabaseKey: string } | null {
  if (!SUPABASE_URL || !isPublishableKey(SUPABASE_KEY)) {
    return null;
  }
  return { supabaseUrl: SUPABASE_URL, supabaseKey: SUPABASE_KEY };
}
