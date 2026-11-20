<!-- PLAN-REVIEW-REPORT -->

# Plan Review: Wybór koloru przez gracza (S-18)

- **Plan**: `context/changes/player-color-choice/plan.md`
- **Mode**: Deep
- **Date**: 2026-10-31
- **Verdict**: SOUND (F1–F3 poprawione w planie po triage, 2026-10-31)
- **Findings**: 0 critical, 1 warning, 2 observations

## Verdicts

| Dimension             | Verdict |
| --------------------- | ------- |
| End-State Alignment   | PASS    |
| Lean Execution        | PASS    |
| Architectural Fitness | PASS    |
| Blind Spots           | WARNING |
| Plan Completeness     | WARNING |

## Grounding

32/32 paths ✓, 9/9 symbols ✓ (`seatColors`, `parsePlayers`, `set_cohost`, `leader_refusal`, `ringLobby`, `actionResult`, `PLANNED_ROUND_REFUSALS`, `SQL_SIGNATURES`, `plan(277)`), brief↔plan ✓, Progress↔Phases ✓.

Verified in code (sub-agent, read-only):

- Backfill `(seat - 1) % 20` = today's `seatColors`: seats have no gaps (`create_room` seat 1, `join_room` and `admit_latecomer` `coalesce(max(seat),0)+1` under `for update` on the room, no sequence), no player row is ever deleted or re-seated, and the latest `room_lobby` returns every player unfiltered `order by p.seat` (`co_host_role.sql:879-888`); all five views colour the full `view.players`.
- The three functions in the plan are the only live insert paths into `public.players`; pgTAP builds rooms through `create_room`/`join_room`, there is no `supabase/seed.sql`, REST inserts in `tests/db` still get 42501 before NOT NULL.
- `join_room` and `admit_latecomer` lock the room row before the insert; `create_room` makes a room nobody else sees before commit.
- `parsePlayers` (`shared.ts:200-211`) copies only known keys, so `db push` before the code is safe.
- `vote.ts:40-48` sends session and cookie token together; a signed-in non-host guest falls through to the token. `ringLobby` has no host-only assumption (guest routes already ring).
- A ring with a changed player object moves no focus and announces nothing (`announce.ts:10-12`, `RoomScreen.tsx:173-221`); the voter's unsent choice survives (`RoundVoting` keyed by round number, proven by `cohost.spec.ts:209-231`).
- pgTAP has no exact enumerations of `players` columns or of all functions; only `plan(277)` must be bumped. No player cap exists.

## Findings

### F1 — E2E nie odróżnia dzwonka od odpytywania

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Blind Spots
- **Location**: Faza 3 #5 — E2E („gość wybiera kolor”)
- **Detail**: Plan: „na ekranie hosta kropka Oli zmienia kolor bez przeładowania”. Ekran sam pobiera stan co `LOBBY_POLL_MS` (15 s), a smoke nie słucha Realtime, więc ten spec jest jedynym dowodem, że trasa `color` dzwoni (`ringLobby`). Bez przepisu „Bell vs poll” z `test-plan.md` §6.4 (`nextListFetch` przed `goto`/`reload`, czas od załadowania krótszy niż `LOBBY_POLL_MS`) test przejdzie także po zgubieniu `ringLobby` w `color.ts`: odpytanie trafia w 10-sekundowe okno w około 2 przebiegach na 3 (§6.4).
- **Fix**: W kontrakcie E2E dopisać przepis „Bell vs poll” z §6.4, a w Implementation Note fazy 3 próbny alarm: `color.ts` bez `ringLobby` → czerwony tylko `player-color.spec.ts`; wynik do §6.4 „Break-check”.
- **Decision**: FIXED — Fix in plan (E2E według „Bell vs poll”, próbny alarm e2e jako 3.4; ręczne punkty przenumerowane na 3.5–3.6)

### F2 — Zapamiętany kolor przy każdym przeładowaniu, także w środku gry

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Blind Spots
- **Location**: Critical Implementation Details („Zapamiętany kolor bez pętli”), Faza 3 #3
- **Detail**: Research: „po wejściu do pokoju ekran raz prosi”. Plan: „najwyżej raz na załadowanie strony”, w poczekalni albo w trakcie gry. Gdy zapamiętany kolor był zajęty przy wejściu, a ktoś go później zwolni, zwykłe odświeżenie strony w środku gry zmieni graczowi kolor bez jego wyboru, a inni zobaczą, że kropka i kawałek koła tego gracza nagle mają inny kolor. Rzadkie i kosmetyczne, ale niezgodne z researchem.
- **Fix**: Prosić raz na pokój zamiast raz na załadowanie strony (id pokoju, w którym prośba już poszła, w `sessionStorage`, z tym samym logowaniem błędów pamięci), z przypadkiem w testach `rememberedColorRequest`/`RoomScreen`.
- **Decision**: FIXED — Fix in plan (raz na pokój: `mlt-color-asked` w `sessionStorage`, `colorAskedIn`/`markColorAsked`; brief i słownik zaktualizowane)

### F3 — Drobne nieścisłości w plikach i nazwach

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Completeness
- **Location**: Faza 1 #1–#2, Faza 2 #1, #4, #5
- **Detail**:
  - 409 dla `color_taken` daje domyślna gałąź `statusFor` (`json-route.ts:167-173`); `ROUND_REFUSALS` czyta tylko `room-errors.test.ts:92`. Dopisać tam nadal, ale „(409)” nie wynika z tej listy.
  - Graczy dokładnie (`PLAYER_KEYS`) porównują dwa testy: `cohost.test.ts:289` i `round-anonymity.test.ts:166`; ich tytuły (`cohost.test.ts:285`, `round-anonymity.test.ts:159`: „tylko nick, host i cohost”) się zestarzeją.
  - `room-rpc-gate.test.ts`: komentarze `plik:linia` przy `create_room`, `join_room`, `admit_latecomer` po nowej migracji wskażą starsze definicje.
  - `private.free_color`: plan nie mówi `security invoker` czy `definer`; wzorem jest `private.leader_refusal` (invoker, właściciel `postgres`, bez grantów).
  - „W obu parserach” to jedna funkcja `parsePlayers`, wspólna dla `parseLobbyState` i `parseRoomView`.
- **Fix**: Dopisać te pięć punktów jednym zdaniem każdy w fazach 1–2.
- **Decision**: FIXED — Fix in plan (wszystkie pięć punktów dopisane w fazach 1–2)
