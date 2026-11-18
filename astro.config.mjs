// @ts-check
import { defineConfig, envField } from "astro/config";

import react from "@astrojs/react";
import sitemap from "@astrojs/sitemap";
import tailwindcss from "@tailwindcss/vite";
import cloudflare from "@astrojs/cloudflare";

// https://astro.build/config
export default defineConfig({
  output: "server",
  integrations: [react(), sitemap()],
  vite: {
    plugins: [tailwindcss()],
  },
  adapter: cloudflare(),
  env: {
    schema: {
      SUPABASE_URL: envField.string({ context: "server", access: "secret", optional: true }),
      SUPABASE_KEY: envField.string({ context: "server", access: "secret", optional: true }),
      // The Worker's private key for the signature on the room's players' topic (src/lib/live-sync/signing-key.ts).
      // Optional: a missing required variable would take every route down with it, so without it only the routes that
      // sign answer 503.
      LIVE_SIGNING_KEY: envField.string({ context: "server", access: "secret", optional: true }),
      // The key of KLIPY's gif search (src/lib/rooms/gif-key.ts), which the room's page hands to its screen. A secret
      // only so it lies in no public repo; optional as the one above: without it the chat simply has no gifs.
      KLIPY_API_KEY: envField.string({ context: "server", access: "secret", optional: true }),
    },
  },
});
