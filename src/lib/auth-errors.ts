import { isAuthRetryableFetchError, type AuthError } from "@supabase/supabase-js";
import type { Messages } from "@/lib/i18n";

// Sign-in errors (password and OAuth) travel in the URL only as codes; the page shows the text of its language's
// dictionary for the code (src/lib/i18n/pl/auth-errors.ts), so text typed into `?error=` never reaches the screen.
// OAuth codes come from /api/auth/oauth, /api/auth/callback and from Supabase itself, which sends OAuth state errors
// straight to the Site URL (/auth/signin) as `error_code`.
export function authErrorMessage(code: string | null, t: Messages): string | null {
  if (code === null) return null;
  const { codes, generic } = t.authErrors;
  return Object.hasOwn(codes, code) ? codes[code as keyof typeof codes] : generic;
}

// Code for the redirect URL. AuthRetryableFetchError (no connection or 502/503/504, e.g. a paused project) has no
// code, so it and any other 5xx mean Supabase itself is down.
export function authErrorCode(error: AuthError): string {
  if (isAuthRetryableFetchError(error) || (error.status ?? 0) >= 500) return "service_unavailable";
  return error.code ?? "unknown";
}
