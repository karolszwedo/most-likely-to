<!-- IMPL-REVIEW-REPORT -->

# Implementation Review: Poprawki z przeglądu bezpieczeństwa (punkt H)

- **Plan**: context/changes/security-hardening/plan.md
- **Scope**: Full plan (Phase 3: all automated criteria done; manual 3.7 pending, the owner's check at the next game)
- **Reviewed phases**: 1, 2, 3
- **Date**: 2026-11-17
- **Verdict**: APPROVED
- **Findings**: 0 critical, 1 warning, 5 observations

## Verdicts

| Dimension           | Verdict |
| ------------------- | ------- |
| Plan Adherence      | PASS    |
| Scope Discipline    | PASS    |
| Safety & Quality    | WARNING |
| Architecture        | PASS    |
| Pattern Consistency | WARNING |
| Success Criteria    | PASS    |

Evidence: the five recreated SQL functions (`start_game`, `join_room`, `request_join`, `admit_latecomer`, `create_room`) compared with their previous definitions: only the planned checks and the replaced `start_game` branch differ; signatures, defaults, `security definer`, `search_path`, owner and grants unchanged; every player count runs under the room's `for update` lock; the taken nick is checked before the cap. B-1: the vote form holds only the radios and one submit button, `disabled` until hydration, so neither a click nor Enter in the radio group sends it. `readFormRequest` refuses another Content-Type and an oversized or malformed Content-Length before reading and never logs the body. Nothing new touches the ballot box or logs a vote. Local gate on `55a22d5`: `npm run lint` (0 literals), `npx astro check` (0 errors), `npm test` (2147), `npm run test:hooks` (33), `npm run build` green; the plan's greps (`console.error|log` in auth, `formData()` in `src/pages/api`) empty; `git diff 2dcb056 d8b3cbb -- supabase/migrations` only `20261116172906_security_hardening.sql`; `ci`, `smoke`, `db`, `e2e` green on PR #72 and on `main` `d8b3cbb` with Workers Builds; smoke on production 138/138 on 17.11 and green again after PR #75. Outside the plan, all harmless: the `AGENTS.md` line (`5a6edeb`, the owner's "tak" of 17.11) also names the other spellings of wrangler and supabase; `room-errors.test.ts` got a new `HOST_REFUSALS` list (the plan's "list of host codes" did not exist), so `invalid_categories`, `open_room_has_guests` and `try_again` must keep their own texts too; the `p_question_id` line in "Poza tym planem" of `deploy-plan.md` (recorded at 3.6).

## Findings

### F1 — Nic nie pilnuje, że `p_question_id` nic nie znaczy

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: supabase/migrations/20261116172906_security_hardening.sql:604-607; tests/db/support/rounds.ts:365
- **Detail**: Migracja usuwa gałąź `p_question_id` w `start_game` (S-20 F3), ale żaden test nie wysyła już `p_question_id`: `startGame` i pomocnicy pgTAP wysyłają `p_candidates`, a dawne testy `invalid_question` (`round-rules.test.ts:381`, `question-base.test.ts:263-273`) sprawdzają dziś pulę jednego pytania. Przyszła migracja, która skopiuje starszą treść `start_game`, przywróci stare wejście przy zielonym CI.
- **Fix**: w `tests/db/round-rules.test.ts` jedno wywołanie `start_game` z samym `p_question_id` (pytanie z wyboru pokoju, bez listy i bez `p_candidates`): dokładnie `no_questions`, pokój dalej w poczekalni.
- **Decision**: FIXED (test w `tests/db/round-rules.test.ts`: sam `p_question_id` daje dokładnie `no_questions`, pokój zostaje w poczekalni; pomocnik `startGameWithQuestionIdOnly`)

### F2 — `npm explore` omija pytania o zgodę

- **Severity**: 💬 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: .claude/settings.json:4-6
- **Detail**: `Bash(npm *)` i `Bash(node *)` są w `allow`, więc lista `ask` działa na tyle, na ile zna pisownie. `npm exec` i `npm x` już pytają, a `npm explore <paczka> -- <polecenie>` uruchamia dowolne polecenie bez pytania. Polecenia składanego w locie (`node -e`) żadna reguła nie złapie, co jest znaną granicą (lekcja „Dopisuj regułę ask…”).
- **Fix**: dopisać `Bash(npm explore*)` do `ask`.
- **Decision**: FIXED (`Bash(npm explore*)` w `ask`)

### F3 — Odpowiedź 500 i pliki statyczne bez nagłówków bezpieczeństwa

- **Severity**: 💬 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: src/middleware.ts:37
- **Detail**: Gdy trasa rzuci wyjątek, `await next()` odrzuca i `withSecurityHeaders` się nie wykona; bez `src/pages/500.astro` Astro oddaje pustą odpowiedź bez nagłówków i bez `no-store`. Pliki statyczne (`dist/`) Worker serwuje bez middleware, co plan przyjął. Puste ciało i pliki publiczne, więc nic do osadzenia w ramce ani do zapamiętania.
- **Fix**: zapisać w `change.md` jako przyjętą granicę (bez zmiany kodu).
- **Decision**: ACCEPTED (przyjęta granica w `change.md`)

### F4 — Limit gier liczy istniejące pokoje, nie wywołania

- **Severity**: 💬 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: supabase/migrations/20261116172906_security_hardening.sql:111-119
- **Detail**: Gra skasowana przez `delete_game` wypada z licznika, co nagłówek migracji mówi wprost (`:24`). Liczba wierszy pokoi zostaje ograniczona, a liczba wywołań nie; ogranicznik żądań to W-1, odłożony do własnej domeny.
- **Fix**: zapisać w `change.md` jako przyjętą granicę razem z W-1 (bez zmiany kodu).
- **Decision**: ACCEPTED (przyjęta granica w `change.md`, razem z W-1)

### F5 — Linia logu formularza podaje status 400, a gość dostaje przekierowanie

- **Severity**: 💬 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Pattern Consistency
- **Location**: src/lib/rooms/json-route.ts:143 (i `readBoundedText`)
- **Detail**: `readFormRequest` loguje `status: 400`, a każda trasa formularza odpowiada przekierowaniem (`rooms/index.ts:49`, `join.ts:41`, `signin.ts`, `oauth.ts`). `src/lib/log.ts:9` opisuje `status` jako status HTTP. Powód odmowy i tak stoi w `code`.
- **Fix**: pominąć (log tylko dla twórcy, `code` mówi, co się stało).
- **Decision**: SKIPPED

### F6 — Licznik gier czyta całą historię pokoi hosta

- **Severity**: 💬 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: supabase/migrations/20261116172906_security_hardening.sql:116
- **Detail**: Indeks `rooms_by_host` jest tylko na `host_id` (`*_no_recent_repeats.sql:50`), więc `count(*)` z ostatniej godziny przechodzi przez wszystkie pokoje hosta. Dziś to kilkadziesiąt wierszy (smoke kasuje swoje skończone gry, e2e działa na lokalnej bazie).
- **Fix**: pominąć; indeks `(host_id, created_at)` dopiero, gdy historia hostów urośnie.
- **Decision**: SKIPPED
