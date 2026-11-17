// The Worker's Supabase key must be the publishable one (AGENTS.md: sb_publishable_…): a secret or service_role key in
// SUPABASE_KEY would bypass the database's grants for every request, and could reach the browser with the Realtime
// config (W-8 of the security review). One check for both uses in src/lib/supabase.ts, here, apart from astro:env, so
// the unit tests can load it.
export function isPublishableKey(key: string | undefined): key is string {
  return key?.startsWith("sb_publishable_") ?? false;
}
