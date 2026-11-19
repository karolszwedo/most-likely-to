<!-- IMPL-REVIEW-REPORT -->

# Implementation Review: Pula pytań w bazie (S-17)

- **Plan**: context/changes/question-pool-in-db/plan.md
- **Scope**: Full plan (Phase 3: all automated criteria done; manual 3.7 pending, the owner's short game on production)
- **Reviewed phases**: 1, 2, 3
- **Date**: 2026-11-14
- **Verdict**: APPROVED
- **Findings**: 0 critical, 0 warnings, 3 observations (all 3 fixed 2026-11-14)

## Verdicts

| Dimension           | Verdict |
| ------------------- | ------- |
| Plan Adherence      | PASS    |
| Scope Discipline    | PASS    |
| Safety & Quality    | WARNING |
| Architecture        | PASS    |
| Pattern Consistency | WARNING |
| Success Criteria    | PASS    |

Evidence:

- Plan Adherence: every planned item of Phases 1–3 is in place. Each recreated function body, diffed against its previous latest definition (`co_host_role`, `question_list_review`, `player_color_choice`, `game_length`), differs only by the planned check; signatures, refusal codes and the 1000-candidate cap unchanged. Migration order table (`134418`) → snapshot (`134826`) → checks (`162527`). No later migration (`20261113214619_question_base_snapshot.sql`, `20261114101656_players_channel_key.sql`) recreates any S-17 function.
- Safety: `picked_candidates` is the same rule as `poolFrom` (`src/lib/rounds/draw.ts`); null ids, an all-null array, capitals, whitespace and lookalikes fail the join; no other function takes a question id from the caller; the table has RLS and no grants, the function is invoker with no grants; the generator uses no shell or `npx` and validates ids, categories and the 18+ flag before interpolating them; no foreign key points at `question_base`, so a deleted row never cascades; no voter→target pairing anywhere. Accepted transitional edge: a question list built by a direct database call before 13.11 in a room still in the lobby could start unchecked (the 12 h sweep closes only started games).
- Scope Discipline: changes outside the plan are harmless: `tests/db/support/rooms.ts` (optional `adultCategories` for `seedRoom`, test-plan §6.2), a comment in `tests/unit/draw.test.ts` (assertions unchanged), roadmap status; `context/changes/host-game-history/plan.md` shows up only in the two-dot diff (S-13 epilogue merged to `main` after the branch point), not in the merge's effect.
- Success Criteria: local gate green on the current `main` tree (lint, `astro check` 0/0/0, `npm test` 1520/1520, build); `CI` green on `9cb4ec1` and on `main`; the snapshot guard re-checked locally today on the latest snapshot `20261113214619`: one row removed → exactly 2 red tests, one 18+ flag flipped → exactly 1 red test, file restored, no commit. 3.7 pending by design. Known and recorded (test-plan §6.2): under alarm (a) the in-game filter case stayed green because `na-co-dzien-021` had been played as round 1; the 18+ rule in next/skip/more is pinned by the two former F1 tests.

## Findings

### F1 — The snapshot guard trusts the marker line

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: tests/unit/question-base-snapshot.test.ts:44, 49, 86-88
- **Detail**: A file counts as a snapshot only because its first line equals `MARKER`, and the writer check skips snapshots entirely. Rows are read with `ROW` from the raw SQL, comments included; only `writesIn` strips comments. These stay green: a snapshot with an extra statement after the merge (e.g. `update private.question_base set adult = false`), a snapshot with a row commented out (counted as present, never reaching the database), a hand-written migration that starts with the marker. Getting past it takes a deliberate edit that also survives PR review.
- **Fix**: Read the rows from the SQL with comments stripped, and assert that every snapshot's writes (`writesIn`) are exactly `["merge"]`.
- **Decision**: FIXED (2026-11-14, branch `question-pool-in-db-review-fixes`): the rows and the writes are read from the SQL without comments, and a new case checks that every snapshot, without comments, rows and spacing, is exactly the generator's one `merge` (`STATEMENT`, written out in the test), which is stronger than `writesIn` = `["merge"]`: an added statement, a changed clause and a hand-written file behind the marker are all red. Local trial alarm (test-plan §6.1): a row in `--` or `/* */` → 2 red, an `update` after the merge → 1, a changed `when matched` clause → 1.

### F2 — The generator leaves a created file behind on failure without saying so

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: scripts/question-base-migration.mjs:93-99
- **Detail**: After `supabase migration new` has created a file, the script can stop with exit 1 (non-zero status, or `added.length !== 1`); the file stays in `supabase/migrations/`, empty or partial, and the message does not name it. An empty leftover has no marker, so the guard ignores it and it could be committed (harmless); a partial one fails `db push` as a whole (safe). When the CLI is killed by a signal, `created.status` is `null` and the message reads "exit code null".
- **Fix**: On those failures name the new file(s) in the message and tell the user to delete them; report the signal when `status` is `null`.
- **Decision**: FIXED (2026-11-14, branch `question-pool-in-db-review-fixes`): every failure after the CLI starts (start error, signal, non-zero exit, not exactly one new `*_question_base_snapshot.sql`, a failed check or write of the file) names every file the run added to `supabase/migrations/` and says to delete them, or says nothing was written; `status === null` reports the signal. Run locally: the success path writes a file byte-identical to `20261113214619` (deleted after), and the four failure paths on throwaway copies of the script print the leftover file or "Nothing was written."

### F3 — create_room's check is not quite the Worker's, and nothing pins the difference

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Pattern Consistency
- **Location**: supabase/migrations/20261113162527_question_base_checks.sql:127-132 (vs src/pages/api/rooms/index.ts:9)
- **Detail**: The comment says the database checks the names "as the Worker checks it", but the Worker checks against `CATEGORIES` and the database against the categories that have at least one row in `private.question_base`. A category added to `CATEGORIES` before it has a question would pass the Worker and be refused by the database ("Wybierz co najmniej jedną kategorię."). Today all 10 categories have 40 questions each. The migration is on production, so its comment cannot be edited (AGENTS.md).
- **Fix**: A unit assertion that every `CATEGORIES` id has at least one question in `QUESTIONS`, with a comment naming the database's rule.
- **Decision**: FIXED (2026-11-14, branch `question-pool-in-db-review-fixes`): an `it.each` over `CATEGORIES` in `tests/unit/question-base-snapshot.test.ts` asserts that every category of the form has at least one row of the latest snapshot, the base `create_room` checks against, with a comment naming the database's rule. Local trial alarm: a new category in `CATEGORIES` without questions → 1 red.
