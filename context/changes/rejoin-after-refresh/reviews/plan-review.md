<!-- PLAN-REVIEW-REPORT -->

# Plan Review: Powrót po odświeżeniu (S-04)

- **Plan**: `context/changes/rejoin-after-refresh/plan.md`
- **Mode**: Deep
- **Date**: 2026-11-03
- **Verdict**: REVISE → SOUND po poprawkach (wszystkie ustalenia naniesione w planie tego samego dnia)
- **Findings**: 1 critical, 2 warnings, 3 observations

Triage: decyzje techniczne podejmuje sesja (zasada Karola od 26.10), więc każde ustalenie poprawione w planie według rekomendowanej opcji.

## Verdicts

| Dimension             | Verdict |
| --------------------- | ------- |
| End-State Alignment   | WARNING |
| Lean Execution        | PASS    |
| Architectural Fitness | PASS    |
| Blind Spots           | FAIL    |
| Plan Completeness     | WARNING |

## Grounding

Grounding: 29/29 paths ✓, 14/14 symbols ✓, brief↔plan ✓ (po zapisaniu D1 i D2). Twierdzenia Fazy 2 (`RoundVoting.tsx:34-35,147,181`, `RoomScreen.tsx:375-377`, `cohost.spec.ts:225-226`, `prd.md:152`, słownik) zgodne z kodem. Migration Notes (parser ignoruje nieznany klucz najwyższego poziomu, `shared.ts:370-428`; smoke sprawdza `/lobby` tylko wyrażeniami z lookahead) potwierdzone.

## Findings

### F1 — Scenariusz martwego gniazda i próbny alarm zależą od losowej fazy odpytywania

- **Severity**: ❌ CRITICAL
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Blind Spots
- **Location**: Faza 1 — 4. E2E odświeżenia i martwego gniazda; Progress 1.3, 1.4
- **Detail**: Odpytywanie to łańcuch `setTimeout` od zamontowania (`useRoomState.ts:259-268`), restartowany tylko przy zmianie stanu kanału (`:318`, `:327`), nie po dzwonku. `sleep()` zostawia gniazdo otwarte (`realtime.ts:25-29`), heartbeat realtime-js wykrywa to po ≥ 25 s, więc w oknie 10 s kanał nie jest „broken” i `BROKEN_POLL_MS` (5 s) się nie włącza. Czas od kliknięcia do następnego odpytania jest więc losowy w [0, interwał]: przy próbnym alarmie `ROOM_POLL_MS = 15000` scenariusz (b) czerwieni się tylko w ~1 przebiegu na 3, a przy 8 s najgorszy przypadek (~8,3–9 s) zostawia ok. 1 s zapasu w wymaganym jobie `e2e`. `test-plan.md:293` opisuje dokładnie ten problem i wzór z `game.spec.ts`.
- **Fix**: Po `sleep()` test czeka na jedno pobranie z odpytywania (`nextListFetch`) i zaraz potem host odsłania wynik; czas od potwierdzenia odsłony do odsłony u gościa `< ROUND_UPDATE_MS`. Przy 15 s czerwień za każdym razem, przy 8 s świadomie mierzony najgorszy przypadek.
- **Decision**: FIXED (Faza 1, pkt 4, Contract)

### F2 — Wyrocznie dzwonka poza listą planu i słabsze `ROUND_UPDATE_MS`

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Plan Completeness
- **Location**: Faza 1 — 3. Wyrocznie dzwonka
- **Detail**: `tests/e2e/remove-player.spec.ts:69-70,88-91,141-150` mierzy ekran pokoju względem `LOBBY_POLL_MS`; po zmianie na 8 s ta wyrocznia przechodziłaby na samym odpytaniu, a próbny alarm S-09 (`test-plan.md:316`) przestałby działać. `support/round.ts:9-11` i `test-plan.md:291` zakładają, że `ROUND_UPDATE_MS` (10 s) jest krótsze niż odpytywanie; po zmianie jest dłuższe, więc zwykłe czekanie na przejście fazy nie dowodzi już dzwonka. Budżet 8 s w `lobby-connection-drop` i `player-color` obejmuje kroki przygotowania (ryzyko niestabilności na CI). `limiter.ts:109` i `limiter.test.ts` nie wymagają zmian.
- **Fix A ⭐ Recommended**: Dopisać `remove-player.spec.ts`, `support/round.ts` i komentarz `shared.ts:9-11` do zmian; zapisać, że dzwonek dowodzą tylko wyrocznie `< ROOM_POLL_MS`, a 10 s to budżet S-04; przy zapasie < 2 s w pierwszym CI liczyć od pobrania tuż przed akcją.
  - Strength: zachowuje stabilne 10 s dla wolnego runnera; 10 s pokrywa się z kryterium PRD.
  - Tradeoff: zwykłe czekania w specach przestają łapać brak dzwonka.
  - Confidence: HIGH — każdy dzwonek ma już swoją osobną wyrocznię (seed, lobby-connection-drop, game, player-color, remove-player).
  - Blind spot: rzeczywisty zapas 8 s na CI nieznany do pierwszego przebiegu.
- **Fix B**: Obniżyć `ROUND_UPDATE_MS` poniżej 8 s.
  - Strength: każde czekanie dalej odróżnia dzwonek od odpytania.
  - Tradeoff: 10 s dobrano pod wolny runner; ryzyko niestabilności we wszystkich specach rundy.
  - Confidence: MED — brak pomiarów czasów na CI.
  - Blind spot: scenariusz (b) i tak potrzebuje budżetu 10 s.
- **Decision**: FIXED (Fix A)

### F3 — Ślad `moved` nieobsłużony przez jego czytelników

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: End-State Alignment
- **Location**: Faza 3 — Migracja; Faza 4 — Worker
- **Detail**: (a) `parseJoinRequestState` przyjmuje tylko `pending|rejected|admitted|closed|none` (`shared.ts:430-441`); `moved` daje `fail("state")`, więc `/r/[id]` na starym urządzeniu pokazałby 500 „Nie udało się otworzyć pokoju.”, a nie nowy tekst. Ten sam zestaw stanów mają `JoinWaiting.tsx:111-120` i `requestAnswer` w `scripts/smoke.mjs:247-253`. (b) `request_join` wskrzesza każdy wiersz tokenu jako `pending` z nowym nickiem (`latecomer_admission.sql:160-192`); gdyby ślad `moved` niósł `player_id`, „Wpuść” takiej prośby przepiąłby miejsce z powrotem na stare urządzenie. Plan `request_return` („token ma już prośbę → ok”) zostawiałby urządzenie czekające na śladzie. Ścieżka na żywo jest w porządku: 404 z odpytania przeładowuje stronę (`useRoomState.ts:191-213`), więc wystarczy strona serwera.
- **Fix**: Wiersz `moved` z `player_id = null`; `request_join` i `request_return` kasują ślad tokenu i idą jak nowa prośba; `request_return` zwraca `{ok:true}` tylko przy prośbie `pending`; `parseJoinRequestState`, `JoinRequestState`, `JoinWaiting` i smoke przyjmują `moved`; test bazy: stary token prosi jako spóźniony, „Wpuść” nie rusza przeniesionego miejsca.
- **Decision**: FIXED

### F4 — Dwie pozycje migracji już działają

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Lean Execution
- **Location**: Faza 3 — Migracja
- **Detail**: `room_lobby` już zwraca `requests` w każdym stanie pokoju (`20261101125331_remove_player.sql:249-253`), a `drop_round_state` już kasuje wszystkie `join_requests` pokoju przy zamknięciu (`20261026074427_question_play_data.sql:243-262`).
- **Fix**: Skreślić obie zmiany z kontraktu migracji, zostawić asercję w teście bazy.
- **Decision**: FIXED

### F5 — Głos w pamięci karty może przeżyć rundę

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Blind Spots
- **Location**: Faza 2 — 3. Wyjątek w zasadach
- **Detail**: Wpis kasuje `RoomScreen`. Gdy karta trafi na stronę bez ekranu pokoju (gracz usunięty albo przeniesiony, pokój zamknięty), nikt go nie skasuje i para zostaje w tej karcie do jej zamknięcia, dłużej niż „do końca rundy” z briefu.
- **Fix**: Brzmienie wyjątku w AGENTS.md i PRD: „najdłużej do zamknięcia karty, gdy ekran pokoju już się nie otworzy”.
- **Decision**: FIXED

### F6 — Ręczne sprawdzenia 1.5 i 2.6 na telefonie przy serwerze dev

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Completeness
- **Location**: Faza 1 i 2 — Manual Verification; Progress 1.5, 2.6
- **Detail**: Serwer dev słucha na `localhost`, więc telefon go nie widzi, a `.dev.vars` wskazuje na produkcyjną bazę (pokój powstaje tam jak przy smoke na dev).
- **Fix**: 1.5 i 2.6 w Chrome na laptopie (DevTools → Offline, F5), za zgodą; telefon sprawdza 5.4 na produkcji.
- **Decision**: FIXED
