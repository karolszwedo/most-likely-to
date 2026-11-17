import type { APIRoute } from "astro";
import { createClient } from "@/lib/supabase";
import { authErrorCode } from "@/lib/auth-errors";
import { logEvent } from "@/lib/log";
import { readFormRequest } from "@/lib/rooms/json-route";

// Only an error code goes into the URL; /auth/signin turns it into a Polish message (src/lib/auth-errors.ts).
export const POST: APIRoute = async (context) => {
  // A body that is not our form (JSON, no Content-Type, over the limit; logged by readFormRequest) counts as empty
  // fields, not a 500.
  const body = await readFormRequest(context.request, "signin");
  const email = body.ok ? body.form.get("email") : null;
  const password = body.ok ? body.form.get("password") : null;

  // The form validates in the browser, but a post without JS or before hydration lands here as is.
  if (!email?.trim() || !password) {
    return context.redirect("/auth/signin?error=missing_fields");
  }

  const supabase = createClient(context.request.headers, context.cookies);
  if (!supabase) {
    return context.redirect("/auth/signin?error=config_missing");
  }
  const { error } = await supabase.auth.signInWithPassword({ email, password });

  if (error) {
    // The raw message no longer reaches the URL, so Workers Logs are the only trace: the error's name, status and code
    // only (logEvent's fields). Never the email or password.
    logEvent("error", { op: "signin", step: "password", status: error.status, code: error.code, errName: error.name });
    return context.redirect(`/auth/signin?error=${encodeURIComponent(authErrorCode(error))}`);
  }

  return context.redirect("/");
};
