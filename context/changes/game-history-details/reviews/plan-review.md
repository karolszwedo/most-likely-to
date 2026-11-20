<!-- PLAN-REVIEW-REPORT -->

# Plan Review: Historia gry w panelu hosta (S-26)

- **Plan**: `context/changes/game-history-details/plan.md`
- **Mode**: Deep (jeden podagent sprawdził w kodzie bazę, usuniętego gracza, testy i promień rażenia)
- **Date**: 2026-11-20
- **Verdict**: SOUND
- **Findings**: 0 critical, 3 warnings, 0 observations
- **Triage**: 20.11.2026, Karol „tak” dla F1–F3; poprawki wpisane do `plan.md` (Faza 2 #3, Faza 3 #1, #2, #5, #6). Werdykt po poprawkach: SOUND

## Verdicts

| Dimension             | Verdict |
| --------------------- | ------- |
| End-State Alignment   | PASS    |
| Lean Execution        | PASS    |
| Architectural Fitness | WARNING |
| Blind Spots           | PASS    |
| Plan Completeness     | WARNING |

## Grounding

22/22 ścieżek ✓ (nowe pliki jeszcze nie istnieją, jak trzeba: `src/pages/gry/[id].astro`, `src/lib/rooms/history.ts`, `ResultTable.tsx`, `GameHistory.tsx`, `tests/unit/game-history.test.ts`), 10/10 symboli ✓ (`baseQuestionText`, `gameDate`, `gameSummary`, `sortResults`, `playerColors`, `UUID_PATTERN`, `PROTECTED_ROUTES`, `hostGames`, `parseHostGames`, `roomErrorMessage`), brief↔plan ✓, Progress↔Fazy ✓ (1.1–1.4, 2.1–2.3, 3.1–3.6, 4.1–4.6, bez checkboxów poza Progress). Jedno twierdzenie o testach nie zgadza się z kodem (F3).

Potwierdzone w kodzie:

- Jeden pokój to jedna gra: `start_game` przyjmuje tylko `lobby` (`20261116172906_security_hardening.sql:573-577`), „Nowa gra” zamyka stary pokój i zakłada nowy (`:137-144`). Rundy pokoju `closed` mają tylko `voting`, `revealed`, `skipped` (`20261015122252_full_game_evening.sql:29`); `end_game`, „Nowa gra” i sprzątanie nie zmieniają fazy.
- Host przez `players.user_id = rooms.host_id`: wiersz hosta zakłada `create_room` (`security_hardening.sql:154`), `remove_player` rusza tylko wiersze z `user_id is null` (`20261114101656_players_channel_key.sql:104`).
- Usunięty gracz (decyzja 2 i „Critical Implementation Details”): po odsłonie jego `round_results` znikają kaskadą, a `ballots` stoi (dopisek tylko, gdy miał głosy, czyli dokładnie wtedy, gdy coś przepadło); głosy na gracza usuniętego w trakcie głosowania przepadają przy odsłonie (`20261026074427_question_play_data.sql:183-187`); usunięty, który sam zagłosował, zostaje w `round_voters` (bez klucza obcego, `20261014101922_first_live_round.sql:146-150`; `players_channel_key.sql:121-127`), więc jego kartka liczy się w `ballots` i w wyniku, bez dopisku.
- `room_lobby` oddaje hostowi `game_totals` także dla pokoju zamkniętego, tą samą regułą (gracze z wynikiem w co najmniej jednej odsłonie, kolejność `seat`, `players_channel_key.sql:400-427`), więc porównanie w teście bazy ma sens.
- Wpis listy łączy się `game_questions.position = rounds.list_position` (kolumna wpisu to `position`, `20261024094002_question_list_review.sql:50`); przeredagowany wpis z bazy zachowuje `question_id` i ma `text`, więc dostaje `origin = 'own'`, zgodnie z decyzją 3.
- pgTAP: `plan(506)` :90, katalog S-13 :2013-2032, scenariusz :3070-3190, pokój zamknięty `host_ends` przed skasowaniem, runda 2 to zatwierdzona propozycja (`origin = 'proposal'`), drugi host `open_room('deleted-other')` :3155.
- Smoke: główna gra ma odsłonę (runda 1), pominiętą propozycję (2), drugą odsłonę bez głosów (3) i rundę przerwaną (4), więc „dwie tabele, jedno pominięcie, jedno przerwanie, propozycja gościa” z Fazy 3 #7 się zgadza; `listRoom` jest w tym miejscu otwarty (`scripts/smoke.mjs:1151-1155`); tryby `ROUND`, `GAME`, `LIST` w `:30-34`.
- Promień rażenia: poszerzenie `playerColors` do `{nick, color}` jest bezpieczne dla 6 wywołań; `href` ustawiany w `hostGameRow` nie psuje `room-states.astro` ani `tests/unit/game-list.test.ts` (żaden nie składa `HostGameRow` ręcznie); `GameSummary` używa tylko `RoomScreen`.

## Findings

### F1 — Historia z ruchem odsłony przy każdym wejściu

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Architectural Fitness
- **Location**: Faza 3 #2 (Wspólne części wyniku) i #3 (Strona historii)
- **Detail**: Plan wydziela `ResultTable` „z kropką koloru, „ty”, paskami i ruchem jak dziś”, ale nie mówi, z jakim ruchem strona historii go rysuje. Dziś ruch włącza `animate` (`RoundReveal.tsx:159`, `:163`, `:190`), a `AGENTS.md` („## UI”) każe, by ruch odsłony grał raz, gdy nowa odsłona dotrze do otwartej karty, nigdy po przeładowaniu. Historia z ruchem odtwarzałaby wjazd każdej tabeli przy każdym wejściu na stronę. Przy okazji: `ResultPie` ma krawędzie `stroke-background` (`RoundReveal.tsx:77`), a małe koło na karcie (SURFACE) potrzebuje `stroke-card`, jak koło podsumowania (`GameSummary.tsx:137`); paski za nickiem rysują się tylko w widoku „Paski” (`:182`).
- **Fix**: Kontrakt `ResultTable`: props `animate` (strona historii zawsze `false`) i `bars` (paski tak/nie według wyboru z galerii); `ResultPie` z klasą krawędzi zależną od tła; w e2e historii brak klas `animate-in` na `/gry/<id>`.
- **Decision**: FIXED (Fix) — Karol 20.11.2026 („tak” dla F1–F3)

### F2 — Strona 404 historii bez brzmienia i poza `RoomMessage`

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Completeness
- **Location**: Faza 2 #3 (Strona), Faza 3 #3 i #5 (Strona historii, Podglądy)
- **Detail**: `room_unknown` i `game_not_ended` mają dać 404 „z jednym zdaniem i linkiem do „Twoje gry””, ale plan nie podaje zdań. Teksty tych kodów z `roomErrorMessage` pasują do innych ekranów: `room_unknown` = „Ten link nie działa. Sprawdź, czy skopiował się cały, albo poproś hosta o nowy.” (`src/lib/rooms/errors.ts:73`), `game_not_ended` = „Tej gry nie da się usunąć, dopóki trwa. Najpierw ją zakończ.” (`:123`). `AGENTS.md` („## UI”): wyśrodkowany komunikat strony to `RoomMessage` z ikoną z jego zestawu (`src/components/room/RoomMessage.tsx:23-32`), nigdy ekran złożony ręcznie. Podglądy (Faza 3 #5) wymieniają błąd bazy, ale nie oba stany 404.
- **Fix**: 404 jako `RoomMessage` (h1, ikona z zestawu, np. `gone` dla nieznanej albo skasowanej gry i `waiting` dla gry, która trwa; link „Twoje gry” jako `children`), własne zdania strony zamiast `roomErrorMessage` tych kodów, brzmienie z galerii Fazy 3, oba stany w `/dev/room-states`.
- **Decision**: FIXED (Fix) — Karol 20.11.2026 („tak” dla F1–F3)

### F3 — E2E: gra w `game-history.spec.ts` kończy się na pierwszym pytaniu

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Completeness
- **Location**: Faza 3 #6 (E2E)
- **Detail**: Plan pisze „ta sama jedna gra (budżet gier bez zmian): pierwsza runda odsłonięta głosami gości, druga pominięta, trzecia przerwana końcem gry; karta „3 pytania””, jakby spec grał tak już dziś. Dziś host kończy grę w trakcie pierwszego pytania (`tests/e2e/game-history.spec.ts:70-76`), a karta ma „1 pytanie” (`:87`). Implementator może dopisać drugą grę (więcej czasu i pokoi) albo przeoczyć zmianę asercji. Dłuższa gra wydłuża test w obu projektach (`chromium` i `phone`), a job `e2e` ma limit 20 min.
- **Fix**: W Fazie 3 #6 napisać wprost: rozszerzyć dzisiejszą grę specu (głosy gości w 1. pytaniu i odsłona, „Pomiń pytanie” w 2., koniec gry w 3.), asercję karty „1 pytanie” zmienić na „3 pytania”, `test.slow()` zostaje.
- **Decision**: FIXED (Fix) — Karol 20.11.2026 („tak” dla F1–F3)
