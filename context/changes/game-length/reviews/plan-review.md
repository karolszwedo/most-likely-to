<!-- PLAN-REVIEW-REPORT -->
# Plan Review: Długość gry widoczna dla wszystkich

- **Plan**: context/changes/game-length/plan.md
- **Mode**: Deep
- **Date**: 2026-11-07
- **Verdict**: REVISE (po naniesieniu poprawek: SOUND)
- **Findings**: 0 critical, 5 warnings, 2 observations

Weryfikacja czytaniem kodu, bez uruchamiania testów i CI. Wyjątek: jednorazowe policzenie puli i sprawdzenie wyrażenia `testMatch` w Node.

## Verdicts

| Dimension | Verdict |
|-----------|---------|
| End-State Alignment | PASS |
| Lean Execution | PASS |
| Architectural Fitness | PASS |
| Blind Spots | WARNING |
| Plan Completeness | WARNING |

## Grounding

34/34 ścieżek ✓, symbole ✓, brief↔plan ✓, Progress↔Fazy ✓ (14 kroków automatycznych i 5 ręcznych, tytuły zgodne).

## Co się trzyma

Sprawdzone w kodzie, bez ustaleń:

- `room_lobby` ma jeden kształt stanu, więc jeden klucz obejmuje każdą rolę i status. `isCount` przepuszcza 0, a `parseRoomView` idzie przez `parseRoomState`.
- `private.game_questions` nie ma żadnego `delete`, a ruchy listy działają tylko w poczekalni, więc liczba nie maleje w trakcie gry. Wiersz pokoju nie wraca do gry, więc `extra_questions` nie przechodzi na nową grę.
- Wzór `poolSize - list_base_count + list_entries - N` daje przy N = T dokładnie liczbę kandydatów z bazy: bez listy, z usuniętymi, po „Popraw”, z własnym, z dolosowanym, z propozycją, po dobraniu.
- Pula ma najmniej 19 pytań przy każdym dozwolonym wyborze, bo 18+ to tylko dodatek do kategorii, więc 15 zawsze się mieści.
- `private.open_next_round` wołają tylko `next_round` i `skip_round`. Nie ma zamkniętej listy tras: `op` w `log.ts` to wolny tekst, a `middleware.ts` nie wylicza tras.
- Dzwonki nie gubią tekstu ani fokusu u hosta (`key={position}`), a po serii ostatni stan dochodzi do gościa, bo ogranicznik robi pobranie końcowe.
- Cztery widoki mają już `view`, a `summary.ts` jest bezpieczny w przeglądarce. `FR-026` i `S-19` są wolne.

## Findings

### F1 — pgTAP `stats-excluded` padnie na strażniku

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Blind Spots
- **Location**: Faza 1 #6
- **Detail**: Plan i research wskazują tylko `tests/db/question-list.test.ts`. Tymczasem `supabase/tests/round_creator_view.test.sql:2300-2319` ma listę 2 wpisów z usuniętą pozycją 2, czyli T=1, i gra do rundy 3. `host_next` (`:2310`) dostanie `no_questions`, a `host_skips`, `host_reveals` i `guest_reacts` odmowę, bo rundy 2 nie ma. To 4 czerwone asercje w wymaganym jobie `db`.
- **Fix**: W Fazie 1 #6 dopisać: scenariusz `stats-excluded` dostaje na liście 4 kandydatów `pgtap-excluded-001..004`, dalej z usuniętą pozycją 2 (T=3, rundy 001, 003, 004). Zmienia się opis asercji `setup`, a `plan(n)` i `stats_gain` zostają.
- **Decision**: FIXED (Fix in plan)

### F2 — `game-length.spec.ts` nie pobiegnie w projekcie `phone`

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Completeness
- **Location**: Faza 3 #6, kryterium 3.2
- **Detail**: `playwright.config.ts:42` ma `testMatch: /(game|question-list|emotes|proposals)\.spec\.ts/`, a `game-length.spec.ts` do tego nie pasuje. Pliku konfiguracji nie ma w planie. CI będzie zielone, chociaż test nie pobiegnie w oknie telefonu, więc 3.2 byłoby fałszywą zielenią.
- **Fix**: W Fazie 3 #6 dopisać `playwright.config.ts` (`game-length` w `testMatch`, komentarz nad projektem), a w Fazie 4 akapit „Spec w oknie telefonu” w `test-plan.md:308`.
- **Decision**: FIXED (Fix in plan)

### F3 — Test dzwonka nie odróżnia dzwonka od odpytywania

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Blind Spots
- **Location**: Faza 3 #6, kryterium 3.3
- **Detail**: Plan każe sprawdzić, że po 13 usunięciach gość widzi „2 pytania” szybciej niż `ROOM_POLL_MS`. Ekran gościa i tak odpytuje co 8 s, więc liczba przyjdzie też bez dzwonka, a alarm C może nie zaświecić (`test-plan.md:302-306`, „Bell vs poll”: odpytanie trafia w okno w około 2 przypadkach na 3). Dzwonków `question-draw` i `question-add` nie pilnuje nic, a smoke biegnie bez Realtime. To główna obietnica „na żywo w 2 s”.
- **Fix**: Użyć wzoru z §6.4 dla trzech ruchów: gość przeładowuje stronę z `nextListFetch` tuż przed ruchem, a czas liczy się od przeładowania. Kolejność: dolosowanie (16), własne (17), usuwanie do 3, a pomiar przy ostatnim usunięciu (2).
  - Strength: Ten sam wzór złapał dzwonek w `game.spec.ts`, a alarm C trafia w jeden krok.
  - Tradeoff: Trzy przeładowania więcej w obu projektach, czyli kilka sekund biegu.
  - Confidence: HIGH — wzór działa już w `game.spec.ts`, `player-color.spec.ts` i `rejoin.spec.ts`.
  - Blind spot: Nie mierzyliśmy 2 s z obietnicy, test dowodzi tylko dzwonka, jak w S-03.
- **Decision**: FIXED (Fix in plan)

### F4 — Wyścig w `question-list.spec.ts` zaczyna się w Fazie 2, nie w Fazie 3

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Blind Spots
- **Location**: Faza 2 #4 i Faza 3 #6
- **Detail**: Dzwonki wchodzą w Fazie 2, a plan sprawdza spec dopiero w Fazie 3. W `tests/e2e/question-list.spec.ts:165-171` host dodaje własne pytanie, więc gość A dostaje teraz dzwonek. `nextListFetch` (`tests/e2e/support/room.ts:53`) czeka na dowolną odpowiedź `/lobby` i startuje przed `reload`, więc może złapać pobranie starego dokumentu. Wtedy `lobbyA.text()` może paść, a krok nie dowodzi, że przeładowany ekran słucha. Wymagany job `e2e` zacznie migać.
- **Fix**: Przenieść punkt do Fazy 2 #5 i nazwać poprawkę: `await pageA.reload({ waitUntil: "commit" })`, dopiero potem `await nextListFetch(pageA, room.id)`.
- **Decision**: FIXED (Fix in plan)

### F5 — Testy `afterRoundActions` nie mają pliku ani fazy

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Completeness
- **Location**: Testing Strategy i Faza 3 #3
- **Detail**: Testing Strategy obiecuje trzy stany przycisków i odmianę dla 1, 3 i 5, ale żadna faza nie wskazuje pliku, a żaden test jednostkowy nie importuje dziś `@/components`. E2E z pulą 20 pokaże tylko „Jeszcze 5”, więc „Jeszcze 3” i stan bez dobierania nie mają innej ochrony.
- **Fix**: W Fazie 3 #3 dopisać `tests/unit/host-actions.test.ts` (nowy). Jeśli import `HostActions.tsx` nie przejdzie w Vitest, przenieść `afterRoundActions` do zwykłego pliku `.ts` obok. Importu nie uruchamialiśmy.
- **Decision**: FIXED (Fix in plan)

### F6 — Sprostowania w planie i brakujące miejsca w dokumentach

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Completeness
- **Location**: „What We're NOT Doing”, Faza 2 #5, Faza 3 #2, Faza 4 #1, `plan-brief.md`
- **Detail**: Punkt o ręcznym `insert` do `public.rooms` opisuje nieistniejącą drogę: `20261014101922_first_live_round.sql:33-37` cofnął `insert` i polityki, `authenticated` ma tylko `select`. `tests/unit/room-errors.test.ts` nie ma się czego zmieniać, bo nie przybywa kod odmowy. `scripts/ui-literals.mjs` czyta folder sam (`readdirSync`, `:17`). Faza 4 nie wymienia liczby kont w §6.2 (20 → 21 z limitu 30, `test-plan.md:193`) ani `docs/development.md` (tabela tras, opis smoke). Komentarz `QuestionList.tsx:17` („The list's moves ring no bell”) stanie się fałszywy.
- **Fix**: Skreślić punkt o `insert` w planie i w briefie, skreślić `room-errors.test.ts` i zdanie o `ui-literals`, dopisać `docs/development.md`, liczbę kont oraz komentarz `QuestionList.tsx:17`, razem z komentarzami `json-route.ts:6-11` i `smoke.mjs:277`.
- **Decision**: FIXED (Fix in plan)

### F7 — `more_questions` liczy powtórzone id kandydatów

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Blind Spots
- **Location**: Faza 1 #3
- **Detail**: Funkcja dla `anon` to publiczne wejście, a sprawdzenia mają być w niej (`AGENTS.md`). `count(*)` bez `distinct` pozwala prowadzącemu podbić `extra_questions` powtórzonymi id przez bezpośrednie RPC. Liczba obieca wtedy pytania, których nie ma, ale szkoda dotyczy tylko jego gry. Osobno: gdy N + 1 przekracza T + 5, czyli w grze w toku przy wdrożeniu, krok 5 odpowiada `no_questions`, a podbite `extra_questions` zostaje. To mieści się w świadomie pominiętej grze w toku i nikomu nie psuje stanu.
- **Fix**: W kroku 4 `count(distinct question_id)` z jednym przypadkiem w `game-length.test.ts`. Zapis przy N > T zostawić bez zmian i dopisać go do punktu o grze w toku.
- **Decision**: FIXED (Fix in plan)
