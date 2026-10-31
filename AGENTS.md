# Repository Guidelines

"Most Likely To" is a live browser party game: everyone sees the same question, casts one anonymous vote, and the result is revealed after the last vote. Stack: Astro 7 (SSR) + React 19 islands + Tailwind 4 + Supabase auth, deployed to Cloudflare Workers. Product scope: `context/foundation/prd.md`. Stack decision: `context/foundation/tech-stack.md`.

## Hard Rules

- Never persist, log or return a pairing of voter and voted-for player, in any form. Votes are anonymous by design (PRD Non-Goals). The in-progress state of a round lives only in unlogged `private` tables with no grants and is deleted at the reveal and whenever the round ends otherwise, including an hourly pg_cron sweep that closes games started more than 12 h ago. The one exception are the thumbs on a revealed question (`private.round_reactions`: a player's thumb, never a vote), kept from the reveal until the leader's (host's or co-host's) next move or the game's end, which count them into `private.question_stats` and delete them; accepted boundary: the game's creator watching the database live (for a round abandoned without a reveal, up to about 13 h after the game started) or turning on extra logging (context/archive/2026-10-13-first-live-round/research.md, D1; reviews/plan-review.md, F1).
- Do not add points, leaderboards or round timers; they are PRD Non-Goals.
- Ask the user before any command that publishes or changes remote or database state: `git push` (a push to `main` deploys to production), `npx wrangler deploy`, `npx wrangler rollback`, `npx wrangler versions deploy`, `npx wrangler delete`, `npx wrangler secret put`, `npx supabase db push`, `npx supabase db reset`, `npm run keep-awake` (calls the production database), `gh workflow run`, `gh workflow enable`, `gh workflow disable`, `gh secret set`, `gh variable set`.
- Changes to `supabase/migrations/`, `src/lib/rooms/`, `src/pages/api/rooms/`, `src/pages/j/`, `src/pages/r/`, `tests/`, `vitest.config.ts` or `.github/workflows/` go only through a PR and are merged only on green CI, the `db` job included; never push them straight to `main`. Since 2026-10-23 the `main` ruleset merges a PR only on green `ci`, `smoke`, `db` and `e2e`, and blocks every direct push to `main`.
- Read `SUPABASE_URL` / `SUPABASE_KEY` only through `astro:env/server` (see `src/lib/supabase.ts`), never via `import.meta.env`. Never commit `.env` or `.dev.vars`.
- `SUPABASE_KEY` must be the publishable key (`sb_publishable_…`). Server code may pass the URL and this key to the browser at runtime (page props or a JSON endpoint), only for Realtime subscriptions. A secret or `service_role` key never goes to the browser, the repo or logs.
- Only `/10x-archive` moves a finished change into `context/archive/`; never edit anything already there.
- Keep "Confirm email" ON in the Supabase project: never turn it off to make smoke or the probe pass, it reopens account takeover through OAuth.

## Conventions

- Add shadcn/ui components with `npx shadcn@latest add <name>`. Since September 2026 (after your training data) shadcn ships `cn()` as the `cn` npm package and imports it from `"cn"`; `@/lib/utils` only re-exports it. Keep those imports and the `cn` dependency; they are not a bug.
- No Next.js directives such as `"use client"` in React components.
- Domain words: before naming anything in code, tests or plans, read `context/domain/glossary.md`; new code uses its terms (gość ≠ gracz, odsłona, pominięcie pytania vs wstrzymanie się).
- No `catch` that swallows a failure or turns it into a redirect or a `200`: rethrow it, answer with an explicit error status, or log it through `logEvent` (`src/lib/log.ts`: allowed fields only, never an error message or player data).
- Create Supabase migrations with `npx supabase migration new <name>` (pattern: `supabase/migrations/*_room_lobby.sql`):
  - every new table: RLS, `revoke all … from public, anon, authenticated`, an explicit `grant` of only what a role needs and a policy for every granted operation; a table reached only through functions gets no grants and no policies;
  - every function: `set search_path = ''`, schema-qualified names, `revoke execute … from public, anon, authenticated`, then a selective `grant`;
  - a `security definer` function granted to `anon` is a public endpoint that bypasses the Worker, so all checks live inside it; its owner is `postgres`;
  - apply migrations only with `npx supabase db push` (ask), never SQL in the dashboard, and never edit a pushed migration: a fix is a new one. Details: `context/deployment/deploy-plan.md`.

## Commands

Before handing off a change, `npm run lint`, `npx astro check`, `npm test` and `npm run build` must pass; CI (`.github/workflows/ci.yml`) runs the same gate, plus the `smoke` and `db` jobs. `.github/workflows/ai-review.yml` comments an AI review on every PR (`tools/pr-review/README.md`); its verdict is a suggestion for the owner, not part of the gate. Other scripts: `docs/development.md`.

- `npx astro sync`: regenerate `.astro/` types after a fresh clone or config change; without it, lint reports false `no-unsafe-*` errors.
- Workers Builds deploys every push to `main` to production, even when CI fails: run the gate before `git push`, then `BASE_URL=https://most-likely-to.charlesonthewave.workers.dev npm run smoke`. Deploy steps and status: `context/deployment/deploy-plan.md`.

## Testing

- `npm test`: unit tests (Vitest, `tests/unit/`), local and CI.
- `npm run test:db`: database tests (`tests/db/`) through REST/RPC as a guest and as a host. Local Supabase only, so in practice it runs only in the CI job `db` (no Docker locally); it refuses any URL but `127.0.0.1`/`localhost` and any key but `sb_publishable_…` before the first request.
- `supabase test db` (pgTAP, `supabase/tests/`): the creator's view of the database (catalog, grants, publication, leftover rows), CI job `db` only. Locally it needs Docker, and with `--linked` it would run against production, so the command asks first (`.claude/settings.json`).
- `npx playwright test`: E2E (Playwright, `tests/e2e/`), the real build in a browser with several players in one room, against local Supabase with Realtime. CI job `e2e` only: locally `playwright.config.ts` refuses before the build, because `.dev.vars` points at production (`npx playwright test --list` still works). Details: `context/foundation/test-stack.md`.
- `npm run test:hooks`: the agent hooks (`.claude/hooks/`, wired in `.claude/settings.json`) run against throwaway git repos with stub tools; local and CI. Change a hook together with its case in `tests/hooks/agent-hooks.test.ts`.
- Before writing or changing a test, read `context/foundation/test-plan.md` §6 (oracle, refusals, hooks, sign-up limit).
- A `test.fails` test named "znana dziura <F> → <change>" documents a known hole. When the fix turns it red, remove the marker; never delete the test.

`npm run smoke` (`scripts/smoke.mjs`) needs a running server and a reachable Supabase. It signs in with the fixed test account `SMOKE_EMAIL` / `SMOKE_PASSWORD` from `.dev.vars` and creates no accounts; the account lives in the only Supabase project, which production also uses. Its room steps leave rooms and guests on that account in that database (until S-13 cleans up), so `npm run smoke` asks first. Without `.dev.vars` or its `SMOKE_*` lines (fresh clone, new worktree), copy `.dev.vars` from the main checkout or skip smoke; a failure then is not a code bug.

## UI

- Tokens live in `src/styles/global.css` (`:root`, `.dark`, published in `@theme inline`); the app always runs dark (`class="dark"` on `<html>`). Use role classes (`bg-primary`, `text-muted-foreground`, `border-input`). A new colour is a new token, never a literal: no palette classes (`bg-purple-600`), hex/rgb/oklch or arbitrary values (`p-[13px]`) in views.
- Room page widths come from `src/components/room/room-frame.ts`. Below `lg` (1024 px) every room screen is one 512 px column, as on a phone; wider classes start at `lg:` and come from Tailwind's default scale, never an arbitrary value.
- In a room view the title comes first in the DOM (focus goes there after a host's move) and a grid places the columns; each region appears once (e2e finds "Gracze" and "Wynik" by role).
- A new room state gets a preview in `/dev/room-states`; when it changes the window (header, the host's bar), also a state in `/dev/room-window`.
- Components live in `src/components/ui` (shadcn). Check that directory before writing a component; add missing ones with `npx shadcn@latest add <name>`. Auth screens compose them in `src/components/auth`.
- Sign-in states (default, hover, focus, disabled, error, empty, loading) are shown at `/dev/ui-kitchen-sink` (dev only).
- `npm run lint` runs `scripts/ui-literals.mjs` on the views already on tokens; when a new view is moved onto tokens, add its files to the list in that script.

## Tooling Gotchas

- Files use LF line endings (`.gitattributes`, Prettier). Lint errors `Delete ␍` mean CRLF crept in: run `npm run lint:fix`.
- The husky pre-commit hook is not installed (no `prepare` script); run `npm run lint` yourself before committing.
- `npm run dev` (Astro 7) starts the dev server in the background and returns at once; manage it with `npx astro dev status`, `npx astro dev logs` and `npx astro dev stop`. Stop it when you are done.
- The deploy target is Cloudflare Workers (`wrangler.jsonc`), not Pages: never use `wrangler pages` commands.
- In `CLAUDE.md` and `AGENTS.md`, `@path` followed by a space pastes the whole file into every session (the only intended import is `@AGENTS.md` in `CLAUDE.md`). Point to files as `path` in backticks.
