# Pula pytań w bazie (S-17) — Plan Brief

> Full plan: `context/changes/question-pool-in-db/plan.md`
> Research: `context/changes/question-pool-in-db/research.md`

## What & Why

Prowadzący (host albo współhost) ma otworzyć tylko pytanie z kategorii wybranych przez hosta, a pytanie 18+ tylko z kategorii, w których host je włączył, także gdy woła funkcję bazy sam, z pominięciem ekranu gry (S-17, FR-005). Dziś pilnuje tego tylko Worker, więc współhost, który zna technikę, może otworzyć pytanie 18+ spoza wyboru hosta (znana dziura F1), a host może grać dowolne numery i zawyżać liczniki pytań (ryzyko 8 z S-11).

## Starting Point

Sześć funkcji bazy przyjmuje numer pytania i sprawdza tylko jego format: `start_game`, `next_round`, `skip_round` i `more_questions` (te trzy przez jedno `private.unplayed_candidates`) oraz `open_question_list` i `draw_list_question`. Baza nie zna kategorii ani znacznika 18+ żadnego pytania: wspólna baza pytań (216 pytań, 8 kategorii) jest tylko w `src/data/questions.ts`.

## Desired End State

Baza ma własną kopię wspólnej bazy pytań (numer, kategoria, 18+, bez treści) i sama przepuszcza tylko pytania z wyboru hosta. Numer spoza wyboru odpada albo dostaje odmowę, także od hosta z sesją. Gra na ekranie działa jak dotąd. Dopisanie pytań to od teraz jedna komenda generująca migrację, PR, `db push` i scalenie. `npm test` jest czerwony, gdy plik pytań i migracja się rozjadą.

## Key Decisions Made

| Decision                            | Choice                                                                                                                                                     | Why (1 sentence)                                                            | Source           |
| ----------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------- | ---------------- |
| Skąd baza zna kategorię i 18+       | W-A: tabela `private.question_base` (numer, kategoria, 18+) wypełniana migracją z `questions.ts`                                                           | Jedyny tani wariant, który spełnia S-17 także dla hosta i zamyka ryzyko 8   | Research + Karol |
| Jak dopisywać pytania               | `npm run questions:migration` robi migrację „migawkę” ustawiającą katalog dokładnie na stan pliku; test w `npm test` porównuje najnowszą migawkę z plikiem | Jedna komenda i automatyczny strażnik zamiast ręcznego SQL                  | Plan             |
| Numer spoza wyboru wśród kandydatów | Odpada jak dziś zły format; nic nie zostaje → `no_questions`                                                                                               | Zachowuje kontrakt D1 z S-03 („pierwszy pasujący”) i dzisiejsze odpowiedzi  | Plan             |
| Start gry z numerem spoza wyboru    | Odmowa `invalid_question` (dzisiejszy napis „Spróbuj jeszcze raz”), sygnatura bez zmian                                                                    | Stary Worker działa w okienku między `db push` a scaleniem; ekran bez zmian | Plan             |
| Nieznana nazwa kategorii            | `create_room` odmawia (`invalid_categories`)                                                                                                               | Katalog zna kategorie, więc baza nie musi ufać Workerowi                    | Plan             |
| Jedna reguła w bazie                | Funkcja `private.picked_candidates` użyta we wszystkich wejściach                                                                                          | Łatanie funkcji osobno groziło pominięciem jednej (uwaga z przeglądu S-19)  | Plan             |
| Ekrany                              | Bez zmian, bez zrzutów                                                                                                                                     | Gra wysyła te same numery, baza je przepuszcza                              | Plan             |

## Scope

**In scope:**

- tabela katalogu, generator migawek, pierwsza migawka 216 pytań, test zgodności;
- sprawdzenie wyboru w sześciu wejściach numeru i nazw kategorii w `create_room`;
- nowy plik testów bazy, dawne `it.fails` F1 jako zwykłe testy, pgTAP, próbny alarm;
- zasady dopisywania pytań (`questions.ts`, `AGENTS.md`, `deploy-plan.md`), test-plan, słownik;
- wdrożenie: `db push` przed scaleniem, smoke, krótka gra Karola.

**Out of scope:**

- treść pytań i losowanie w bazie (W-C), znacznik „odłożone” (S-12);
- zmiany sygnatur, ekranów i logiki Workera;
- rozbudowa bazy pytań (osobna zmiana po S-17);
- strażnik CI sprawdzający, czy migawka jest już na produkcji.

## Architecture / Approach

Najpierw dane, potem sprawdzanie: migracje idą w kolejności tabela → migawka (z generatora) → sprawdzenia. Worker dalej liczy pulę w `poolFrom` i wysyła kandydatów. Baza filtruje ich jedną funkcją `private.picked_candidates`, z tą samą regułą co `poolFrom`, więc „Jeszcze N pytań” dalej zgadza się z tym, co baza doda. Strażnik w `npm test` pilnuje, żeby najnowsza migawka była równa `questions.ts`. Kolejność „baza, potem kod” przy każdym dopisaniu pytań opisuje `deploy-plan.md`.

## Phases at a Glance

| Phase                                  | What it delivers                                                                        | Key risk                                                                                       |
| -------------------------------------- | --------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| 1. Katalog wspólnej bazy pytań w bazie | Tabela, generator, migawka 216 pytań, test zgodności, zasady dopisywania                | Generator nie zadziała na Node 22/24 albo migawka rozjedzie się z plikiem                      |
| 2. Sprawdzenie w ruchach prowadzącego  | Reguła FR-005 w bazie w sześciu wejściach i w `create_room`; testy, pgTAP, próbny alarm | Reguła różna od `poolFrom` (zła liczba „Jeszcze N”); scenariusze pgTAP na wymyślonych numerach |
| 3. Dokumenty i wdrożenie               | Test-plan, deploy-plan, słownik; migracje na produkcji, smoke, gra Karola               | `db push` z eduroam albo scalenie przed `db push`                                              |

**Prerequisites:** S-07 (na produkcji); gałąź `question-pool-in-db` od `8128c48`; do `db push` dom albo hotspot.
**Estimated effort:** ok. 3 sesje, po jednej na fazę.

## Open Risks & Assumptions

- Po S-17 scalenie zmiany pytań przed `db push` daje cichy rozjazd: nowe pytania nie padają, start czasem prosi o ponowienie, a „Jeszcze N pytań” obiecuje za dużo. Gry z nową kategorią nie da się wtedy założyć. CI tego nie widzi; chroni kolejność w `deploy-plan.md`.
- Zakładamy, że `npx supabase migration new` przyjmuje powtarzaną nazwę `question_base_snapshot` (różnią się znacznikiem czasu); jeśli nie, generator doda do nazwy liczbę pytań.
- Pokoje otwarte w chwili wdrożenia grają dalej bez zmian (ich lista i wybór pochodzą z puli Workera).

## Success Criteria (Summary)

- Współhost i host wołający bazę z pominięciem ekranu nie otworzą pytania spoza wyboru hosta ani 18+ tam, gdzie host go nie włączył (testy bazy, dawne F1 zielone bez znacznika).
- Gra na produkcji działa jak przed zmianą (smoke, krótka gra Karola).
- Dopisanie pytania bez migawki daje czerwony `npm test`.
