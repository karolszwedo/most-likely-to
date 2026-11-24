declare namespace App {
  interface Locals {
    user: import("@supabase/supabase-js").User | null;
    // The screen's language (S-27, src/lib/i18n): set by src/middleware.ts; the pseudo language only on /dev/*?lang=xx
    // in `astro dev`.
    lang: import("@/lib/i18n").UiLang;
  }
}
