<!-- IMPL-REVIEW-REPORT -->

# Implementation Review: S-11 Kciuki na odsłonie i zbiorcze dane o pytaniach

- **Plan**: context/changes/question-reactions-play-data/plan.md
- **Scope**: Full plan
- **Reviewed phases**: 1, 2
- **Date**: 2026-10-27
- **Verdict**: APPROVED
- **Findings**: 0 critical, 0 warnings, 5 observations

## Verdicts

| Dimension           | Verdict |
| ------------------- | ------- |
| Plan Adherence      | PASS    |
| Scope Discipline    | PASS    |
| Safety & Quality    | PASS    |
| Architecture        | PASS    |
| Pattern Consistency | PASS    |
| Success Criteria    | PASS    |

Phase 3 (deployment) is not reviewed: 3.5 (counters on production after Karol's game) is still open. Every planned item
of phases 1–2 matches the plan's intent. Migration contract: three `private` tables with RLS, revokes, no grants and no
policies; every new or replaced function with `set search_path = ''`, schema-qualified names, owner postgres, revoke then
selective grant (`anon` only on `react_round`); the five replaced functions only gain lines against their last
definitions; `react_round` checks everything inside, in `cast_vote`'s order, and answers only `{ok: true}`. No stats row
holds a room, player or round, so no voter→target; thumbs are folded and deleted on every close path
(`drop_round_state`), counters cannot double-count (room lock + phase checks). `react.ts` mirrors `vote.ts` without the
bell; `QuestionReaction.tsx` follows the room's button patterns. Extra without harm: each thumb goes through `act`, so it
also refreshes the room's state once. Automated criteria re-run on main 2026-10-27 (lint, `astro check`, `npm test`
662, build): pass; the db and E2E suites ran green in CI on PR #26; the break-check pair `0a06624`/`1bb1506` is in the
history. Manual 3.4 confirmed by Karol after the game of 2026-10-26.

## Findings

### F1 — A refused thumb drops the focus target of the host's move

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Pattern Consistency
- **Location**: src/components/room/RoomScreen.tsx:189-193
- **Detail**: `act()` clears `movedFrom` after any failed action, not only a view-changing one. If the host taps a thumb
  and then "Następne pytanie", and `next_round` takes the room lock first, `react_round` answers `round_over` and clears
  `movedFrom` before the new view arrives, so the focus stays on the body instead of the new question's heading.
- **Fix**: Clear `movedFrom` on a failure only when the action is in `VIEW_CHANGING`.
- **Decision**: FIXED (RoomScreen.tsx: movedFrom czyszczony tylko po odmowie ruchu z VIEW_CHANGING)

### F2 — The smoke exclusion rests on one hard-coded UUID

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: supabase/migrations/20261026074427_question_play_data.sql:109
- **Detail**: If the smoke account is ever recreated, every later smoke run counts into `private.question_stats`
  silently, and the counters keep no room or time to separate them afterwards.
- **Fix**: Add to `context/deployment/deploy-plan.md` that a recreated smoke account needs a new migration inserting its
  UUID into `private.stats_excluded_hosts`.
- **Decision**: FIXED (context/deployment/deploy-plan.md, sekcja Supabase)

### F3 — The sweep's fold across rooms can, rarely, deadlock with a list start

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: supabase/migrations/20261026074427_question_play_data.sql:131-153
- **Detail**: Inside one fold the upserts go in question-id order, but the hourly sweep folds several rooms in one
  transaction, so across rooms the counter rows lock in room order. With a concurrent multi-row `start_game` upsert a
  deadlock is possible; it needs two stale rooms left on a reveal with thumbs plus an overlapping list start, and the
  victim only rolls back (the sweep retries an hour later, or the host gets one 500). The pushed migration cannot be
  edited.
- **Fix**: Accept; a later migration touching the sweep may fold all stale rooms in one ordered statement.
- **Decision**: ACCEPTED (Karol 2026-10-27: bardzo mało prawdopodobne, ofiara się wycofuje; wypchniętej migracji nie edytujemy)

### F4 — The hard rule on round state does not name the thumbs

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Pattern Consistency
- **Location**: AGENTS.md (Hard Rules, first rule)
- **Detail**: The rule says a round's in-progress state is deleted at the reveal. The thumbs (`private.round_reactions`)
  are by design kept from the reveal until the fold (the host's next move or the end of the game, at most ~13 h). Only
  the migration's header and the glossary say so; an agent applying the rule literally could misjudge them either way.
- **Fix**: Add one clause to the rule: the thumbs of a revealed question stay until the fold, then are counted and
  deleted.
- **Decision**: FIXED (AGENTS.md, pierwsza twarda zasada)

### F5 — The RPC oracle's line references are off by one

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Adherence
- **Location**: tests/unit/room-rpc-gate.test.ts (comments citing the migration)
- **Detail**: The comments cite `:270`, `:506-511`, `:358`, `:424`; after commit `8db6c2e` removed a TODO line the real
  lines are 269, 505-510, 357, 423. Comments only; the gate checks names and arguments.
- **Fix**: Update the four line numbers.
- **Decision**: FIXED (tests/unit/room-rpc-gate.test.ts)
