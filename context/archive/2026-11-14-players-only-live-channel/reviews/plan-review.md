<!-- PLAN-REVIEW-REPORT -->

# Plan Review: Kanał na żywo tylko dla graczy pokoju

- **Plan**: `context/changes/players-only-live-channel/plan.md`
- **Mode**: Deep
- **Date**: 2026-11-14
- **Verdict**: SOUND (after triage: all 4 findings fixed in the plan)
- **Findings**: 0 critical, 2 warnings, 2 observations

## Verdicts

| Dimension             | Verdict |
| --------------------- | ------- |
| End-State Alignment   | WARNING |
| Lean Execution        | PASS    |
| Architectural Fitness | PASS    |
| Blind Spots           | WARNING |
| Plan Completeness     | WARNING |

## Grounding

Grounding: 18/18 paths ✓ (2 new files expected), 11/11 symbols ✓ (`topicFor`, `send`, `sendEmote`, `broadcastEmote`, the latest `room_lobby` in `game_length.sql:304`, `remove_player` (d) `:149-152`, `LOBBY_KEYS`, `VIEW_KEYS`, `removeSteps`, `LINK_IN_VIEW`, pgTAP `extra_questions`), brief↔plan ✓. Progress↔Phase ✓ (3 phases, 4+4+5 steps).

Checked in the code and confirmed: no later migration redefines `room_lobby` or `remove_player`; a waiting or turned-away latecomer, a removed player and the old device after an S-04 rejoin get `null` from `room_lobby`, and a closed room still answers; no SQL and no server code returns a whole `rooms` row (`host_games` builds explicit keys); no test lists the columns of `rooms`; CI `smoke` runs on a local Supabase with this branch's migrations (without Realtime); CI `e2e` has Realtime, `GET /api/live-sync/config` returns the URL and the publishable key, and Node 22 has a global `WebSocket`; `lobby.ts` answers `no-store`.

## Findings

### F1 — End of the evening: the new emote effect has no test, and the contract leaves two traps open

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: End-State Alignment
- **Location**: Faza 2, #3 Ekran pokoju i #7 E2E
- **Detail**: The plan replaces the end-of-evening effect (`useRoomState.ts:388-404`) with one emote effect for a live and a closed room, but no automated test sends an emote in a closed room: `emotes.spec.ts` covers only the lobby and voting (test-plan §6.4), and `players-channel.spec.ts` steps 1–4 stay in the game. The brief still promises "w grze i na końcu wieczoru (e2e, …)". Two traps fit that blind spot:
  1. realtime-js 2.116: `channel(topic)` returns an existing channel with the same topic (`RealtimeClient.ts:462-474`), and `subscribe()` on a channel that is not closed does nothing and calls no callback (`RealtimeChannel.ts:426-429`). If the emote effect depends on `isLive` or on the view's status, "Zakończ grę" re-runs it on the same key while the old channel is still leaving, and the screen goes deaf to emotes at the end of the evening without any error.
  2. `rejoin.spec.ts` (:231-242, :499-507) assumes the next fetch after the sleep is the poll; an emote channel that calls `limiter.refresh()` or `schedulePoll` on SUBSCRIBED shifts that. The plan forbids only `liveBroken` and reports.
- **Fix**: In Faza 2 #3: the emote effect depends only on `isPreview`, `roomId`, the shared client and `view.channel_key` (not on `isLive` or the status), and it never touches the limiter or the poll; the client lives in the hook (`useRef` or `useMemo` on `supabaseUrl`/`supabaseKey`), created once. In #7: step 5 "Zakończ grę": after the 3 s pause Ola sends an emote, the host's screen shows it, and the K1 listener gets nothing.
  - Strength: It covers the only path the plan rewrites that is now untested, and it closes the one trap the library hides.
  - Tradeoff: One more step (~5 s) in an e2e that is already `test.slow()`.
  - Confidence: HIGH — read in realtime-js 2.116 and in the specs.
  - Blind spot: None significant.
- **Decision**: FIXED (Fix in plan: effect deps and limiter in Faza 2 #3, shared client in the hook, e2e step 5)

### F2 — E2E step 4 does not wait for the host's screen to join the new key

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Blind Spots
- **Location**: Faza 2, #7 E2E, step 4, and the alarm prediction
- **Detail**: After the removal the test checks only that Ola's state has K2. The host's screen switches only after its own fetch and a new join. If Ola's tap comes earlier (the 3 s pause may already have run out during the removal), the one-time emote is lost and "host hears Ola after the removal" fails at random, on a slow runner too. Then the alarm's result cannot be told from flakiness.
- **Fix**: Before Ola's tap, wait for the host page's join on `live-players:<K2>` (`page.on("websocket")`, the `phx_join` frame with that topic and its `ok` reply). Write in the alarm's prediction that this wait is what goes red under the alarm.
- **Decision**: FIXED (Fix in plan: step 4 waits for the host's phx_join on K2, alarm prediction updated)

### F3 — Files left out of the plan: two unit tests, `LobbyState`, stale comments

- **Severity**: 🔍 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Completeness
- **Location**: Faza 2, #2 and #6
- **Detail**:
  - `tsconfig.json` includes the tests, so `astro check` fails on `RoomView` literals without the key: `tests/unit/announce.test.ts:25,56,89,123,144` and `tests/unit/remembered-nick.test.ts:355` (`colorView`).
  - `RoomState` (`shared.ts:431`) is a non-exported `Omit` alias, so the field goes into `LobbyState` (`:151`) and its check into `parseRoomState`.
  - Comments that will say "public channel" or "room's channel" for emotes: `emotes.ts:24-25,51-55`, `useRoomState.ts:10-16,146,386-387`, `rooms/server.ts:843`, `EmoteBar.tsx:48`, `EmoteBubbles.tsx:7`, `tests/e2e/emotes.spec.ts:2`, `infrastructure.md:198`.
- **Fix**: Add these files to the lists in Faza 2 #2 and #6 (and `infrastructure.md:198` in Faza 3 #2); "the field goes into `LobbyState`" instead of "`RoomState` gets".
- **Decision**: FIXED (Fix in plan: LobbyState, two unit-test files, comment list, infrastructure.md:198)

### F4 — The key does go into a URL: Supabase's request path

- **Severity**: 🔍 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Blind Spots
- **Location**: Desired End State ("Klucz nie trafia do adresu, logu…"), Faza 1 #1 (column comment)
- **Detail**: `httpSend` puts the topic in the path of the Worker's request (`RealtimeChannel.ts:965`: `…/api/broadcast/live-players%3A<klucz>/events/emote`), so the key is in Supabase's API logs. Only the game's creator sees them, and the creator can read the database anyway, so this is the accepted boundary from `AGENTS.md`. The plan's sentence, though, says "nowhere". Also: the smoke runner prints the expected regex on a failure (`smoke.mjs:1044-1049`), so the new step must not put the key into a printed pattern.
- **Fix**: Narrow the sentence to "the game's addresses, logs and answers", add "in Supabase's request logs, seen only by the creator (accepted boundary)" to it and to the column comment; the smoke step compares the keys in words, as `linkInView` does.
- **Decision**: FIXED (Fix in plan: Desired End State, column comment, glossary row, smoke step compares in words)
