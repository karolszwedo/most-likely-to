# Wersja angielska gry: brief planu

> Full plan: `context/changes/english-version/plan.md`
> Research: `context/changes/english-version/research.md`

## What & Why

Gra jest dziś tylko po polsku (punkt 11 F kolejki, FR-031). Host ma móc założyć grę po angielsku dla ekipy, która nie mówi po polsku. Każdy gracz ma móc w każdej chwili przełączyć swoje ekrany na drugi język, żeby mieszana ekipa grała razem.

## Starting Point

Około 450 polskich napisów jest wpisanych na sztywno w około 50 plikach, a gra nie ma mechanizmu języków. Pytania są już rozdzielone na numer (baza) i tekst (Worker), a każda pula losowania powstaje w Workerze, więc drugi tekst pod tym samym numerem nie rusza losowania ani „bez powtórek”.

## Desired End State

Na „Nowa gra” host wybiera język gry: to język startowy wszystkich ekranów tej gry (strona linku z kartą na Discordzie, pokój, koniec, historia) i pula pytań (angielska gra losuje tylko przetłumaczone). W prawym górnym rogu każdego ekranu stoi przełącznik PL | EN, który zmienia tylko ekrany osoby, która kliknie, także w trakcie rundy, bez przeładowania. Polski wygląda co do litery jak dziś.

## Key Decisions Made

| Decision                               | Choice                                                                                                      | Why (1 sentence)                                                               | Source                                                         |
| -------------------------------------- | ----------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------ | -------------------------------------------------------------- |
| Czyj jest język                        | Gry: wybór hosta na „Nowa gra”, stały                                                                       | Pytania od ludzi są w jednym języku, a pula musi wiedzieć, co losować          | Research (Karol 21.11)                                         |
| Pytania po angielsku                   | Te same 960 numerów, drugi tekst                                                                            | Losowanie, „bez powtórek” i migawka bazy bez zmian                             | Research (Karol 21.11)                                         |
| Przełącznik                            | PL \| EN w prawym górnym rogu każdego ekranu, dla osoby, w każdej chwili                                    | Mieszana ekipa gra razem, każdy w swoim języku; bez nowej funkcji bazy         | Plan (Karol 21.11)                                             |
| Kolejność źródeł języka                | Przełącznik → język gry → przeglądarka                                                                      | Wybór osoby wygrywa, gra daje start, przeglądarka resztę                       | Plan                                                           |
| Przeglądarka                           | Polski, gdy stoi przed angielskim; angielski, gdy angielski przed polskim albo żadnego; bez nagłówka polski | Obcokrajowiec czyta po angielsku, boty i karta na Discordzie zostają po polsku | Plan (Karol 21.11; `de, pl` → polski to rozstrzygnięcie sesji) |
| Początek pytania                       | „Who’s most likely to …?”                                                                                   | Najbardziej naturalne i najkrótsze na telefonie                                | Plan (Karol 21.11)                                             |
| Tłumaczenie                            | Dosłownie albo pytanie wypada                                                                               | Pod jednym numerem to samo pytanie w obu językach                              | Plan (Karol 21.11)                                             |
| Pytanie bez angielskiego na ekranie EN | Po polsku, z `lang="pl"` (tylko w polskiej grze)                                                            | Gracz widzi pytanie rundy, czytnik czyta je poprawnie                          | Plan                                                           |
| Kto tłumaczy                           | Agent + agent-krytyk, wszystkie 960 z 18+, Karol ogląda ~30                                                 | Wzór punktu I                                                                  | Research (Karol 21.11)                                         |
| Słownik                                | Moduły TS w `src/lib/i18n/`, bez biblioteki i bez `/en/`                                                    | Typ wymusza kompletny angielski, adresy i przekierowania bez zmian             | Plan (sesja)                                                   |
| PR-y                                   | PR A: sam słownik bez zmiany wyglądu; PR B: reszta z migracją przed scaleniem                               | Polski sprawdzony osobno, zanim dojdzie angielski                              | Plan (Karol 21.11)                                             |

## Scope

**In scope:**

- Słownik wszystkich napisów ekranów, strażnik nowych polskich napisów w `npm run lint`.
- `rooms.language`, nowy parametr `create_room`, język w `room_lobby`, `room_link` i `game_history`.
- Angielskie teksty 960 pytań i 14 nazw kategorii.
- Przełącznik w rogu, wybór języka na „Nowa gra”, ciasteczko `mlt-lang`, `<html lang>`, angielska karta linku, daty `en-GB`.
- Podglądy `?lang=en`, jeden angielski przebieg e2e, kroki smoke.

**Out of scope:**

- Zmiana języka gry po założeniu, inne języki, tłumaczenie pytań od graczy, adaptacja polskich odniesień.
- `/en/` w adresach, `i18n` Astro, angielski manifest, strefa czasowa widza, podział liczników pytań na języki.

## Architecture / Approach

Middleware czyta ciasteczko i `Accept-Language`, a strona gry dokłada język gry z bazy. Jedna czysta funkcja rozstrzyga język ekranu, który trafia do `Astro.locals`, `<html lang>` i propsów wysp. W wyspach słownik podaje kontekst React. Worker rysuje tekst pytania w języku ekranu osoby (z polskim zapasem) i bierze pulę z języka gry. Przełącznik zapisuje ciasteczko przez `POST /api/lang`: na zwykłych stronach z przeładowaniem, w pokoju bez przeładowania (najpierw ciasteczko, potem słownik i świeży widok).

## Phases at a Glance

| Phase                                | What it delivers                                        | Key risk                                                                                    |
| ------------------------------------ | ------------------------------------------------------- | ------------------------------------------------------------------------------------------- |
| 1. Słownik bez zmiany wyglądu (PR A) | ~450 napisów w słowniku, strażnik, polski co do litery  | Przeoczony napis albo zmieniony znak; łapią pseudosłownik i porównanie podglądów przed i po |
| 2. Język gry w bazie                 | Migracja, Worker zapisuje i czyta język, angielska pula | Nowy podpis `create_room` i dokładne klucze w kilkunastu testach bazy                       |
| 3. Angielskie pytania                | 960 tłumaczeń z krytykiem, testy reguł                  | Kategoria spada poniżej 15 zwykłych pytań → pytanie do Karola                               |
| 4. Angielskie ekrany i przełącznik   | Angielski słownik, przełącznik, „Nowa gra”, e2e, smoke  | Zmiana języka w pokoju na żywo (stan, fokus, czat)                                          |
| 5. Dokumenty i wdrożenie             | Słownik pojęć, `AGENTS.md`, `db push`, scalenie, smoke  | `db push` z dobrej sieci (nie eduroam)                                                      |

**Prerequisites:** S-26 na produkcji (jest); `/10x-plan-review` w świeżej sesji przed Fazą 1; galeria wyglądu przed kodem Fazy 4.
**Estimated effort:** około 7–9 sesji w 5 fazach.

## Open Risks & Assumptions

- Dosłowne tłumaczenie może zostawić popkulturę i gry z małą liczbą angielskich pytań; próg 15 zwykłych na kategorię zatrzymuje Fazę 3 do decyzji Karola.
- Porównanie podglądów nie widzi napisów, które pojawiają się tylko po akcji (komunikaty czytnika, błędy z serwera); pilnują ich testy jednostkowe i e2e.
- Faza 1 to duża mechaniczna zmiana wielu plików; dzielona na podagentów po obszarach, z bramką po każdym.

## Success Criteria (Summary)

- Host zakłada angielską grę, a gość z linku widzi wszystko po angielsku, od karty na Discordzie po odsłonę.
- Każdy może przełączyć swój ekran PL | EN w trakcie rundy bez utraty głosu i czatu.
- Polska gra wygląda i działa jak dziś; CI i smoke na produkcji zielone.
