# Test stack

## E2E

<!-- Written by /10x-e2e-setup. Re-run it to change this section; other skills only read it. -->

- runner: Playwright Test, @playwright/test 1.64.0
- config: playwright.config.ts
- single-spec command: npx playwright test tests/e2e/<name>.spec.ts (runs only in the CI job e2e, see below)
- full-suite command: npx playwright test (runs only in the CI job e2e; `npx playwright test --list` works anywhere)
- base URL: http://localhost:4321
- port: 4321 (detected from the Astro preview default: astro.config.mjs and the preview script set none; override with E2E_PORT)
- web server command: npm run build && npm run preview -- --port $E2E_PORT; reuseExistingServer outside CI
- auth setup project: setup (tests/e2e/auth.setup.ts), credentials from E2E_USERNAME / E2E_PASSWORD in the CI job's environment (the job signs the host up on its local Supabase)
- storageState: playwright/.auth/user.json (gitignored)
- seed: tests/e2e/seed.spec.ts — protects #2, lobby part only: a guest who joins shows up on the host's screen without a reload, through the room's bell. The round (the same question and the same reveal on 3 screens) is tests/e2e/round.spec.ts
- browser CLI: playwright-cli, command skill at .claude/skills/playwright-cli/SKILL.md
- updated: 2026-10-11

## Where E2E runs

- Only in the CI job `e2e` (`.github/workflows/ci.yml`), on a throwaway local Supabase with Realtime on. There is no
  Docker on the owner's machine, and the local `.dev.vars` points at production, so `playwright.config.ts` refuses to
  start locally (`tests/e2e/support/env.ts`) before the build. A red check, a break-check or a second run happens on a
  branch: push, read the job, revert a temporary commit (test-plan §6.2, Break-check).
- Exploration with `playwright-cli` needs no backend on `/dev/room-states` (`npm run dev`): every room screen with sample
  data. That dev server talks to production, so snapshots only: never submit a form or press "Wyloguj" there.
- Tests run one after another (`workers: 1`): one host account, and opening a room closes that host's previous room.
- No cleanup: the tests leave their rooms and guests behind (the host's deletion of ended games, S-13, cleans up only
  smoke's account, at the end of each smoke run). The job's database is discarded (`supabase stop --no-backup`), and
  unique nicks (`uniqueNick` in `tests/e2e/support/room.ts`) keep runs apart.
