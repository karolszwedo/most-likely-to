import { defineConfig, devices } from "@playwright/test";
import { assertLocalBackend } from "./tests/e2e/support/env";

// Before the build: the suite runs only against a local Supabase (tests/e2e/support/env.ts). Listing the tests
// starts no server and writes nothing, so `--list` works anywhere.
if (!process.argv.includes("--list")) assertLocalBackend();

// 4321 is Astro's default preview port (astro.config.mjs and the preview script set none).
// E2E_PORT overrides it when that port is taken on this machine.
const PORT = Number(process.env.E2E_PORT ?? 4321);
const baseURL = `http://localhost:${PORT}`;

// E2E_USERNAME and E2E_PASSWORD come from the job's environment. No env file is loaded here: the only local one,
// .dev.vars, holds production values.
export default defineConfig({
  testDir: "./tests/e2e",
  // One host account, and a host has at most one open room: opening a room closes the previous one. Tests running
  // side by side would close each other's rooms, so they run one after another.
  fullyParallel: false,
  workers: 1,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  reporter: process.env.CI ? [["list"], ["html", { open: "never" }]] : "html",
  use: {
    baseURL,
    trace: "on-first-retry",
    screenshot: "only-on-failure",
  },
  projects: [
    { name: "setup", testMatch: /.*\.setup\.ts/ },
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"], storageState: "playwright/.auth/user.json" },
      dependencies: ["setup"],
    },
    // The evening, the host's question list, the emotes, the proposals and the game's length (game-length) once more in
    // a phone's window: below lg (1024 px) the room has its phone layout, which chromium's 1280 px window never shows.
    // Same browser and host session; guests' contexts (newGuestContext) inherit this window. Layout only: no touch
    // emulation (no isMobile, no hasTouch).
    {
      name: "phone",
      testMatch: /(game|question-list|emotes|proposals|game-length)\.spec\.ts/,
      use: {
        ...devices["Desktop Chrome"],
        viewport: { width: 390, height: 844 },
        storageState: "playwright/.auth/user.json",
      },
      dependencies: ["setup"],
    },
  ],
  webServer: {
    // Production-like build + preview, on the port above.
    command: `npm run build && npm run preview -- --port ${PORT}`,
    url: baseURL,
    reuseExistingServer: !process.env.CI,
    timeout: 180_000,
    // Astro 7 moves `astro preview` into a background daemon when it detects an agent; this keeps it in the foreground,
    // so Playwright owns the server and stops it.
    env: { ASTRO_PREVIEW_BACKGROUND: "1" },
  },
});
