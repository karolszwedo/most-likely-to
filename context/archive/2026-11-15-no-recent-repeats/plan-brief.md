# Bez powtórek z gier hosta (S-20) — Plan Brief

> Full plan: `context/changes/no-recent-repeats/plan.md`
> Research: `context/changes/no-recent-repeats/research.md`

## What & Why

Gra ma losować najpierw pytania, których host jeszcze nie zna ze swoich innych gier, a dopiero potem pytania znane mu najdawniej, jak w talii, gdzie zagrane karty idą pod spód. Przed pierwszym wieczorem z ekipą Karol przegrał wiele pytań w grach testowych, a ekipa nie powinna dostać właśnie tych (FR-015, S-20 wydzielone z S-12).

## Starting Point

Dziś gra pilnuje tylko braku powtórek w jednej grze. Worker tasuje całą pulę wybranych kategorii, a baza bierze pierwszego pasującego kandydata w czterech miejscach: lista na start, „Dolosuj pytanie”, pytania po liście i pierwsze pytanie gry bez listy (to ostatnie Worker losuje sam). Historia gier hosta już leży w bazie (`rooms.host_id`, rundy i listy zostają po końcu gry).

## Desired End State

Każde losowanie pytania bierze najpierw pytania nieznane hostowi, w kolejności Workera, a potem znane, od poznanych najdawniej. Nic nie wypada, więc liczba pytań i „Jeszcze N pytań” liczą jak dziś, a ekrany się nie zmieniają. Karol widzi to po dwóch listach pod rząd w jednej kategorii: druga nie ma żadnego pytania z pierwszej.

## Key Decisions Made

| Decision                            | Choice                                                                            | Why (1 sentence)                                                        | Source           |
| ----------------------------------- | --------------------------------------------------------------------------------- | ----------------------------------------------------------------------- | ---------------- |
| Gdy świeże się skończą              | Najpierw znane najdawniej (talia)                                                 | Gra nie zapomina historii, a powtórki idą na koniec.                    | Research (Karol) |
| Które gry się liczą                 | Wszystkie gry hosta, bez limitu                                                   | Przy „najdawniej najpierw” limit nic nie daje.                          | Research (Karol) |
| Pominięte i przerwane rundy         | Liczą się jako zagrane                                                            | Ekipa je widziała.                                                      | Research (Karol) |
| Usunięte i przeredagowane z listy   | Liczą się jako znane, także z gry zamkniętej w poczekalni                         | Host je widział na liście.                                              | Research (Karol) |
| Skasowana gra                       | Wypada z historii                                                                 | Kaskada rund; kasowanie zostawia tylko anonimowe dane.                  | Research         |
| Gdzie reguła                        | Jeden pomocnik `private.ordered_candidates` dla czterech miejsc                   | Jedna definicja, jak FR-005 w S-17.                                     | Plan             |
| Kolejność w liście 15               | Świeże na początku, znane na końcu, bez tasowania                                 | Przy wcześniejszym końcu gry znane nie padną.                           | Plan             |
| Pierwsze pytanie bez listy          | `start_game` z `p_candidates default null`, stara ścieżka `p_question_id` zostaje | Stary Worker działa między `db push` a scaleniem i po cofnięciu wersji. | Plan             |
| Stare losowanie jednego pytania     | `drawQuestion`/`drawFrom` usunięte, testy na `questionPool`                       | Bez martwego kodu.                                                      | Plan             |
| Indeks                              | `rooms (host_id)`                                                                 | Odczyt gier zamkniętych nie ma dziś indeksu.                            | Plan             |
| Testy z jednym hostem na wiele gier | `game-length` kasuje wcześniejsze gry, `proposals` dostaje świeżych kandydatów    | Bez nowych kont (limit 30 na 5 min).                                    | Plan             |

## Scope

**In scope:**

- migracja: pomocnik kolejności, nowe ciała `unplayed_candidates`, `open_question_list` i `draw_list_question`, nowa wersja `start_game`, indeks;
- Worker: „Zacznij grę” wysyła pulę;
- testy: nowy `tests/db/no-recent-repeats.test.ts`, scenariusz pgTAP na dwóch hostach, poprawki `proposals` i `game-length`, brama RPC, `draw.test.ts`;
- dwa próbne alarmy w CI;
- dokumenty: słownik, PRD, test-plan, roadmapa, deploy-plan;
- wdrożenie: baza przed kodem.

**Out of scope:**

- wagi z danych o pytaniach (S-12);
- limit „N ostatnich gier”;
- nowe dane i kolumny;
- zmiany ekranów i liczników;
- historia ekipy albo gracza;
- usunięcie `p_question_id`;
- propozycje i własne pytania w historii.

## Architecture / Approach

Worker dalej tasuje pulę i wysyła ją bazie. Baza w jednym pomocniku dokłada przed kolejnością Workera drugi klucz: kiedy host ostatnio poznał to pytanie w innej swojej grze. „Nigdy” idzie pierwsze, a potem od najdawniej. Historia to rundy i wiersze listy innych pokoi tego samego `host_id`, a czas to `coalesce(started_at, created_at)` pokoju. `open_next_round` i `more_questions` zostają bez zmian, bo biorą `place` z `unplayed_candidates`.

## Phases at a Glance

| Phase                          | What it delivers                                                              | Key risk                                                                     |
| ------------------------------ | ----------------------------------------------------------------------------- | ---------------------------------------------------------------------------- |
| 1. Kolejność losowania w bazie | Migracja, testy bazy i pgTAP, poprawki dwóch plików, dwa alarmy               | Testy z jednym hostem na wiele gier, które dziś zależą od kolejności Workera |
| 2. „Zacznij grę” wysyła pulę   | Pierwsze pytanie gry bez listy też w nowej kolejności, sprzątanie `draw.ts`   | Brama RPC i testy losowania na prawdziwej bazie pytań                        |
| 3. Dokumenty i wdrożenie       | Słownik, PRD, test-plan; `db push` przed scaleniem, smoke, sprawdzenie Karola | `db push` nie z eduroam                                                      |

**Prerequisites:** S-17 i S-19 na produkcji (są), gałąź `no-recent-repeats` od `origin/main` `47d0a4d`, dobra sieć przy `db push`.
**Estimated effort:** ok. 3 sesje w 3 fazach (Faza 1 największa).

## Open Risks & Assumptions

- Przegląd testów bazy mógł nie wyłapać każdego oczekiwania zależnego od kolejności w późniejszych grach jednego hosta. CI na Fazie 1 to pokaże, a poprawka jest ta sama (`deleteGame` albo świeży kandydat).
- Gry testowe Karola z ręcznego sprawdzenia też trafią do historii, jeśli ich nie skasuje w „Twoje gry”.
- Przy jednej wybranej kategorii (30 pytań bez 18+) świeże skończą się po dwóch grach, a od trzeciej gra będzie dawać najdawniej znane. Tak zdecydował Karol.

## Success Criteria (Summary)

- Druga lista pod rząd w tej samej kategorii nie ma żadnego pytania z pierwszej.
- Liczba pytań, „Jeszcze N pytań” i wszystkie dotychczasowe testy, smoke i e2e działają jak dziś.
- Nowe testy świecą na czerwono przy obu próbnych usterkach kolejności.
