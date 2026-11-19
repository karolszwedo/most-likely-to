<!-- IMPL-REVIEW-REPORT -->

# Implementation Review: Kanał na żywo tylko dla graczy pokoju

- **Plan**: context/changes/players-only-live-channel/plan.md
- **Scope**: Full plan (Phase 3: all automated criteria done; manual 3.5 pending, the owner's check with the crew)
- **Reviewed phases**: 1, 2, 3
- **Date**: 2026-11-14
- **Verdict**: APPROVED
- **Findings**: 0 critical, 0 warnings, 4 observations

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

- Plan Adherence: every planned item of Phases 1–3 is in place; `room_lobby` and `remove_player` are copies of their latest definitions (`*_game_length.sql`, `*_remove_player.sql`) with only the planned lines added; `admit_latecomer` untouched.
- Scope Discipline: the only EXTRA changes are documented: the eslint exception for `tests/e2e/support/live.ts` (`change.md:17`, test-plan §6.4), the `watchLiveRegions` helper (test-plan §6.4), the sign-up count 23 → 25 (`change.md:19`).
- Success Criteria: local gate green on `50adbc9` (lint, `astro check` 0/0/0, `npm test` 1519/1519, build); `prettier --check` of the Phase 3 documents green; `CI` green on `main` at `43093b4` and `b2c60e9`; 1.2–1.3, 2.2–2.3, 3.2–3.4 recorded in `change.md` and `deploy-plan.md` (migration list not re-run here: it connects to production). 3.5 pending by design.

## Findings

### F1 — Bells' channel now shares a client exposed to the realtime-js "leaving channel" quirk

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: src/components/room/useRoomState.ts:340-345 (with `sharedClient` at :149-157)
- **Detail**: Before this change the bells' effect made a fresh Realtime client on every run; now it takes the page's shared client. realtime-js 2.116 hands back a channel still leaving when its topic is asked for again, and that channel's `subscribe()` never calls back (`RealtimeClient.ts:462-474`, `RealtimeChannel.ts:426-429`). If the bells' effect ever ran again with the same `topicFor(roomId)`, the bells would stop silently and `liveBroken` and the `realtime_status` report would stay quiet. Today it cannot happen: the effect's dependencies change only when `isLive` goes from true to false (that run returns early), and `astro.config` mounts React without StrictMode. The comment at :411-422 warns about this only for the emotes' effect.
- **Fix**: Add a short comment above the bells' effect: it shares the page's client, so it must never run again with the same topic while the page lives (the quirk at :416-418).
- **Decision**: FIXED (owner chose "fix all four", 2026-11-14)

### F2 — Realtime's free-text error reason is logged on the path that now carries the channel key

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: src/lib/live-sync/server.ts:41-46
- **Detail**: `send()` logs `code: error.message`, which realtime-js builds from the Realtime server's response body (`error`/`message`) or the status text (`RealtimeChannel.ts:996-1002`). The line predates the change (audit L6), but it now also covers `sendEmote`, whose topic is `live-players:<key>`. If the server's reason ever repeated the topic, the key would land in Workers Logs, against the plan's "the key never reaches the game's logs" (plan.md:28, glossary "klucz kanału"). Real exposure is nil today: only the game's creator sees Workers Logs and the creator can read `rooms.channel_key` anyway. The unit test (`tests/unit/live-sync-server.test.ts`) checks only a stub message without the topic.
- **Fix**: In `send()`, replace the topic in the message with a placeholder before logging, and add a unit case whose stub error message contains the players' topic.
- **Decision**: FIXED (owner chose "fix all four", 2026-11-14)

### F3 — The raw Realtime test client checks the local URL and publishable key only once

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Pattern Consistency
- **Location**: tests/e2e/support/live.ts:57-93 (with eslint.config.js:93-97)
- **Detail**: The guard (local host, `sb_publishable_…` key) runs only in `liveConfig()`; `rawClient()`, `listen()` and `sendEmoteTo()` accept any `LiveConfig`, an exported plain interface a future test could build by hand. `tests/db/support/clients.ts` does the opposite on purpose: "Every client gets the URL and key through the guard again, so none can exist with an unchecked setup". The eslint exception also lifts the whole file out of the import ban.
- **Fix**: Run the same URL/key check again inside `rawClient()`, as `tests/db/support/clients.ts` does.
- **Decision**: FIXED (owner chose "fix all four", 2026-11-14)

### F4 — One comment still calls the emotes' channel "the room's channel"

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Pattern Consistency
- **Location**: src/lib/rooms/emotes.ts:3
- **Detail**: The file's header says the checks cover "the message the room's channel brings". Phase 2 #3 asked that comments speaking of emotes on the public or "room's" channel speak of the players' channel; the listed lines were all updated, this one was not on the list.
- **Fix**: "the message the players' channel brings".
- **Decision**: FIXED (owner chose "fix all four", 2026-11-14)

## Triage

- Fixed: F1, F2, F3, F4 (4), on the branch `players-only-live-channel-review-fixes` from `origin/main` (`b2c60e9`), no migration.
  - F1: a comment above the bells' channel in `useRoomState.ts` (the effect must never run again for the same room while the page lives).
  - F2: `send()` takes the channel key as `secret` and replaces it in the server's reason with `<key>` (`withoutSecret`); new unit case in `tests/unit/live-sync-server.test.ts` with a reason that repeats the topic, red without the fix (checked locally), green with it.
  - F3: `rawClient()` in `tests/e2e/support/live.ts` runs the local-URL and publishable-key check again (`refuseUnlessLocal`, shared with `liveConfig()`), as `tests/db/support/clients.ts` does. Runs only in the CI job `e2e` (Playwright refuses locally).
  - F4: the header of `src/lib/rooms/emotes.ts` speaks of the players' channel.
- Local gate green after the fixes: lint, `astro check` 0/0/0, `npm test` 1520/1520, build.
