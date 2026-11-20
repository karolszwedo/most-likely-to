<!-- PLAN-REVIEW-REPORT -->

# Plan Review: Lista gier hosta i kasowanie (S-13)

- **Plan**: `context/changes/host-game-history/plan.md`
- **Mode**: Deep
- **Date**: 2026-11-10
- **Verdict**: SOUND
- **Findings**: 0 critical, 0 warnings, 2 observations

## Verdicts

| Dimension             | Verdict              |
| --------------------- | -------------------- |
| End-State Alignment   | PASS                 |
| Lean Execution        | PASS                 |
| Architectural Fitness | PASS                 |
| Blind Spots           | PASS (1 observation) |
| Plan Completeness     | PASS (1 observation) |

## Grounding

31/31 existing paths ✓ (`gry.astro`, `HostGames.tsx`, `DeleteGameButton.tsx` new, absent as expected), symbols ✓
(`join_request_state` latest in `rejoin_after_refresh.sql`, `room_open` taken in `errors.ts:72`, `PROTECTED_ROUTES`,
`plural`, `useRowFocus`, `RoomAction`, `callRpc` always sends an args object, pgTAP `plan(424)`), brief↔plan ✓,
Progress↔Phase ✓ (4 phases, 1.1–4.4, no checkboxes outside Progress).

Codebase verification (one sub-agent) confirmed the risky claims:

- Cascade: every FK to `public.rooms`, `public.players` and `private.rounds` is `on delete cascade`; the only
  exception is `rounds (room_id, list_position) → game_questions` (NO ACTION, never redefined). No SET NULL, RESTRICT,
  triggers, rules, FK from rooms to players or self-reference in players; no table in the realtime publication.
- `private.rounds` and `private.game_questions` are logged (a restore does not zero the question count); rounds are
  never deleted, so `count(rounds)` equals the last "Pytanie N", skipped and abandoned rounds included.
- All three ways to close a room (`create_room`, `end_game`, `close_stale_games`) run `private.drop_round_state`
  (thumbs folded), and `react_round` refuses a closed room: nothing waits to be folded in a closed game.
- `seat` exists (host seat 1), removed players are hard-deleted, S-04 rejoin reuses the row: nicks without removed
  players and without duplicates.
- CI smoke uses local Supabase and a fresh account; production smoke is manual only and `.claude/settings.json` asks
  before `npm run smoke` in every form; `smoke.mjs` has no per-request timeout (the first production run's several
  hundred deletes fit).

## Findings

### F1 — Ciasteczko gościa żyje 24 h, potem „Nie jesteś w tym pokoju.”

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Blind Spots
- **Location**: Desired End State, decyzja 5, Faza 2 §3
- **Detail**: `/r/[id].astro` dochodzi do `join_request_state` (`:50-51`) tylko z ciasteczkiem gracza (`:35`), a
  `PLAYER_COOKIE_MAX_AGE` (`src/lib/rooms/tokens.ts:13`) to 24 h od wejścia (`src/pages/api/rooms/[id]/join.ts:88,128`).
  Gość, którego grę host skasuje później (np. sprząta następnego dnia), po odświeżeniu zobaczy „Nie jesteś w tym
  pokoju.” (rodzaj `outside`), nie „Tej gry już nie ma.”. To nie mylące „Usunięto cię”, ale plan o tym nie mówi, a
  zdanie w Desired End State brzmi, jakby dotyczyło każdego gościa.
- **Fix**: dopisać w „What We're NOT Doing”: gość, który wszedł ponad 24 h przed skasowaniem, widzi „Nie jesteś w tym
  pokoju.”, jak przy każdej starej grze; ciasteczka nie przedłużamy.
- **Decision**: FIXED (Fix in plan, Karol 2026-11-10)

### F2 — Dwa drobne twierdzenia Fazy 2 niezgodne z kodem

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Completeness
- **Location**: Faza 2 §3 (`/j/[token].astro`, `JoinWaiting.tsx`), Faza 2 §4, Critical Implementation Details
- **Detail**: (a) „sprawdzić, że typ to wymusza”: typ nie wymusza. `/j/[token].astro:57-70` i `JoinWaiting.tsx:118-124`
  to łańcuchy if/else; nieobsłużony `gone` w `JoinWaiting` po cichu przekieruje na martwy `/j/<kod>`, a jedyna mapa
  wyczerpująca to `TITLES` w `/r/[id].astro:73`. Na `/j/` `room_link` (`:44-47`) daje 404 przed `join_request_state`,
  więc `gone` przychodzi tam tylko w wyścigu. (b) „bez `SMOKE_LIST` krok jest pomijany przez `skippedBy`”: `listRoom`
  powstaje w każdym trybie (`scripts/smoke.mjs:826-841`, obie gałęzie wołają `newListRoom`), więc krok odmowy może
  biec zawsze.
- **Fix**: (a) zamiast „sprawdzić, że typ to wymusza”: na `/j/` bez zmian kodu (`gone` tylko w wyścigu, przechodzi jak
  `none`, komentarz), w `JoinWaiting` jawna gałąź `gone` przed przekierowaniem; (b) usunąć zastrzeżenie o `SMOKE_LIST`
  w Fazie 2 §4 i w Critical Implementation Details: krok „deleting an open game is refused” bez `skippedBy`.
- **Decision**: FIXED (Fix in plan, Karol 2026-11-10)
