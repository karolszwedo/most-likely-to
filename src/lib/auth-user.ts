import type { User } from "@supabase/supabase-js";
import { logEvent } from "@/lib/log";

// What readUser needs from supabase.auth. Of an AuthError only the name, status and code are read.
interface UserReader {
  getUser(): Promise<{ data: { user: User | null }; error: { name: string; status?: number; code?: string } | null }>;
}

// The signed-in host of this request, or null for anyone else. A guest has no session (AuthSessionMissingError): normal,
// not logged. Any other error (Auth down or unreachable, a rejected refresh token) also gives null, so the page works as
// for a guest, but it is logged: otherwise an Auth outage looks like a host who signed out. Only the name, status and
// code, through logEvent's fields: the message may echo request data.
export async function readUser(auth: UserReader): Promise<User | null> {
  const { data, error } = await auth.getUser();
  if (error && error.name !== "AuthSessionMissingError") {
    logEvent("error", {
      op: "read_user",
      step: "get_user",
      status: error.status,
      code: error.code,
      errName: error.name,
    });
  }
  return data.user ?? null;
}
