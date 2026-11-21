import { SUPABASE_URL, SUPABASE_KEY } from "astro:env/server";
import type { Messages } from "@/lib/i18n";

export interface ConfigStatus {
  name: string;
  configured: boolean;
  message: string;
  docsUrl?: string;
  docsLabel?: string;
}

// The warnings in the words of the page's dictionary (t = messages(lang), src/lib/i18n/pl/pages.ts).
export function configStatuses(t: Messages): ConfigStatus[] {
  return [
    {
      name: "Supabase",
      configured: Boolean(SUPABASE_URL && SUPABASE_KEY),
      message: t.pages.config.supabase.message,
      docsUrl: "https://github.com/przeprogramowani/10x-astro-starter#supabase-configuration",
      docsLabel: t.pages.config.supabase.docsLabel,
    },
  ];
}

export function missingConfigs(t: Messages): ConfigStatus[] {
  return configStatuses(t).filter((s) => !s.configured);
}
