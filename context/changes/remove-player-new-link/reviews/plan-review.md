<!-- PLAN-REVIEW-REPORT -->

# Plan Review: Usunięcie gracza i nowy link (S-09)

- **Plan**: `context/changes/remove-player-new-link/plan.md`
- **Mode**: Deep
- **Date**: 2026-11-01
- **Verdict**: SOUND
- **Findings**: 0 critical, 2 warnings, 0 observations

## Verdicts

| Dimension             | Verdict |
| --------------------- | ------- |
| End-State Alignment   | PASS    |
| Lean Execution        | PASS    |
| Architectural Fitness | PASS    |
| Blind Spots           | WARNING |
| Plan Completeness     | WARNING |

## Grounding

29/29 paths ✓; symbols ✓ (`room_lobby` latest in `20261031090821_player_color_choice.sql`, `hostLinkToken`, `roomView` callers `lobby.ts:42` / `[id].astro:49`, `leader_draw` pattern, `request_join` accepts a dead token, `cast_vote` → `private.finish_round(v_round)`); brief↔plan ✓; Progress↔Phase ✓ (4 phases, 1.1–4.4).

Checked and sound (sub-agent, file:line evidence):

- Reveal and summary after a removal: `ballots` never reaches a screen (only `results` and `abstained`, `RoundReveal.tsx:149-191`, `chart.ts`); `summary.votes >= sum(top)` holds, because the cascade lowers both sides together. A lost vote never shows up as an abstention.
- The voter who stays in `eligible` keeps the threshold right: `round_voters` has no FK, so their row survives, and the plan keeps their id in `eligible` (an `array_remove` on a voter would reveal one vote early; the plan rules that out).
- The removed player's tab: 404 → one reload (`useRoomState.ts:190-198`). It is skipped only in a narrow case: a flag left in the same tab with no successful fetch since, or `sessionStorage` blocked. The tab then stays with "Nie udało się odświeżyć…" and polls a 404 every 15 s (accepted, as in the brief).
- pgTAP already drives rounds and checks the empty urn on every way a round ends (`round_creator_view.test.sql:1388`, `:1410`, `:1457`, `:1491`, `:1585`), so a "removal reveal" check fits there. Sign-up limit: 17 → 18 accounts out of 30.

## Findings

### F1 — „Usuń”: no wait for the refreshed state, focus lost when the removal reveals the round

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Blind Spots
- **Location**: Critical Implementation Details („Fokus po usunięciu”); Faza 3 #2 and #5
- **Detail**:
  - (a) The plan does not say that the row waits for the refreshed state after success. `CohostButton.tsx:75` and `RequestRow` (`JoinRequests.tsx:65`) wait for `refreshes > acceptedAt`. Without that, „Usuń” comes back for a moment and a second click gets `player_unknown`. The same defect was found in the impl-reviews of S-07 (F1) and S-18 (F1).
  - (b) When the removal reveals the round (decision 1, e2e scenario 1), the voting view goes away together with the button. `remove` is not in `VIEW_CHANGING` (`RoomScreen.tsx:122`), so `movedFrom` does not move the focus, and it falls to the start of the page. The plan's focus rule covers only the case where the list stays.
- **Fix**: a single rule in Critical Implementation Details:
  - the row stays disabled until the refresh (`refreshes`);
  - same view → the next row's „Usuń” or the „Gracze” heading;
  - the removal revealed the round (`announcementKey` changed) → the new view's heading, as after `VIEW_CHANGING`, without leaving `movedFrom` set after a removal that did not change the view.
  - In e2e scenario 1: the host's focus is on the reveal's heading.
- **Decision**: FIXED (Fix in plan)

### F2 — Phase 2 file list misses places the new `link_token` / `linkUrl` touches

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Completeness
- **Location**: Faza 1 #2, Faza 2 #1 and #5, Faza 3 #3 and #5
- **Detail**: Not in the plan:
  - the `RoomView` literals in `tests/unit/announce.test.ts` (5 builders) and `tests/unit/remembered-nick.test.ts:354-367` (tsconfig includes `tests/`);
  - the second `Omit` in `parseRoomState` (`shared.ts:352-354`);
  - in `roomView`, pulling `link_token` out of `...state` (`server.ts:280`): without it the raw code goes to the browser next to `linkUrl`, and only `VIEW_KEYS` would catch it;
  - `LOBBY_KEYS` is also checked by `cohost`, `game-summary`, `reactions` and `round-anonymity` (one constant is enough, because the key is always present), plus the title `cohost.test.ts:285`;
  - the same unknown-link sentence in `errors.ts:51` (`room_unknown`, `join.ts:34`) and `room-states.astro:580`;
  - `LINK_IN_PAGE` in `smoke.mjs:201`;
  - the new smoke group stands on the list room with Ela, so it must skip under `SMOKE_LIST=0` (`smoke.mjs:555`).
- **Fix**: add these places to the phase contracts.
- **Decision**: FIXED (Fix in plan)
