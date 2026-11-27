# Wersja angielska gry: brief planu

> Full plan: `context/changes/english-version/plan.md`
> Research: `context/changes/english-version/research.md`

## What & Why

Gra jest dziś tylko po polsku (punkt 11 F kolejki, FR-031). Mieszana ekipa ma grać razem: każdy gracz w każdej chwili przełącza swoje ekrany i pytania na polski albo angielski, niezależnie od innych.

## Starting Point

Słownik wszystkich napisów jest na produkcji (Faza 1, polski co do litery). Na gałęzi są angielskie teksty 927 z 960 pytań (Faza 3) i język gry w bazie (Faza 2), który decyzją Karola z 24.11 znika, zanim trafił na produkcję. Pytania są rozdzielone na numer (baza) i tekst (Worker), więc drugi tekst pod tym samym numerem nie rusza losowania ani „bez powtórek”.

## Desired End State

Gra nie ma języka. W prawym górnym rogu każdego ekranu stoi przełącznik F2, który zmienia tylko ekrany osoby, która kliknie, także w trakcie rundy, bez przeładowania; bez wyboru ekran otwiera się w języku przeglądarki. Każda gra losuje ze wszystkich pytań; pytanie, które nie działa po angielsku nawet z krótkim wyjaśnieniem, na ekranie EN stoi po polsku z dopiskiem „Only in Polish”. Link skopiowany z ekranu po angielsku ma angielską kartę na Discordzie. Polski wygląda co do litery jak dziś.

> Po wdrożeniu (25.11.2026): dopisku „Only in Polish” nie ma. Po Fazie 4 każde z 960 pytań ma angielski tekst, więc Karol odłożył dopisek do pierwszego pytania tylko po polsku (24.11.2026); pilnuje tego test. Wzmianki o dopisku niżej to zamiar z planu. Szczegóły: `plan.md`, „Po decyzjach Karola i wdrożeniu”.

## Key Decisions Made

| Decision                               | Choice                                                                                                      | Why (1 sentence)                                                                 | Source                                                         |
| -------------------------------------- | ----------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------- | -------------------------------------------------------------- |
| Czyj jest język                        | Gracza, nie gry: przełącznik ekranu, bez wyboru na „Nowa gra”                                               | Mieszana ekipa gra razem, każdy w swoim języku                                   | Karol 24.11 (zastępuje „język gry” z 21.11)                    |
| Pytania po angielsku                   | Te same 960 numerów, drugi tekst                                                                            | Losowanie, „bez powtórek” i migawka bazy bez zmian                               | Research (Karol 21.11)                                         |
| Przełącznik                            | F2 w prawym górnym rogu każdego ekranu, dla osoby, w każdej chwili                                          | Bez nowej funkcji bazy; wygląd wybrany na zrzutach                               | Karol 21.11 i 24.11                                            |
| Kolejność źródeł języka                | Przełącznik → przeglądarka                                                                                  | Wybór osoby wygrywa, przeglądarka daje start                                     | Karol 24.11                                                    |
| Przeglądarka                           | Polski, gdy stoi przed angielskim; angielski, gdy angielski przed polskim albo żadnego; bez nagłówka polski | Obcokrajowiec czyta po angielsku, boty i smoke zostają po polsku                 | Plan (Karol 21.11; `de, pl` → polski to rozstrzygnięcie sesji) |
| Początek pytania                       | „Who’s most likely to …?”                                                                                   | Najbardziej naturalne i najkrótsze na telefonie                                  | Plan (Karol 21.11)                                             |
| Tłumaczenie                            | Dosłownie, w razie potrzeby z krótkim wyjaśnieniem; nigdy inne znaczenie                                    | W jednej rundzie gracze czytają to samo pytanie w dwóch językach                 | Karol 24.11                                                    |
| Pytanie bez angielskiego na ekranie EN | Po polsku, z `lang="pl"` i dopiskiem „Only in Polish”; dalej w losowaniu                                    | Polskie wieczory nie tracą pytań, a gracz wie, że to nie błąd                    | Karol 24.11                                                    |
| Pytania wpisane przez graczy           | Tekst autora, początek w języku czytającego                                                                 | Gra nie zna języka autora, a zapamiętanie go to migracja dla rzadkiego przypadku | Karol 24.11                                                    |
| Karta linku                            | W języku ekranu, z którego skopiowano link (`?lang=en`)                                                     | Angielscy znajomi widzą angielską kartę, bez zmian w bazie                       | Karol 24.11                                                    |
| Kto tłumaczy                           | Agent + agent-krytyk, Karol ogląda próbkę i wszystkie dotłumaczone                                          | Wzór punktu I                                                                    | Research (Karol 21.11)                                         |
| Słownik                                | Moduły TS w `src/lib/i18n/`, bez biblioteki i bez `/en/`                                                    | Typ wymusza kompletny angielski, adresy i przekierowania bez zmian               | Plan (sesja)                                                   |
| PR-y                                   | PR A: sam słownik (na produkcji); PR B: reszta, bez migracji                                                | Polski sprawdzony osobno, zanim dojdzie angielski                                | Plan (Karol 21.11), bez migracji od 24.11                      |

## Scope

**In scope:**

- Słownik wszystkich napisów ekranów, strażnik nowych polskich napisów w `npm run lint` (zrobione).
- Angielskie teksty pytań i 14 nazw kategorii, dotłumaczenie 33 z wyjaśnieniem, strażnik podziału.
- Cofnięcie języka gry z bazy i Workera.
- Przełącznik w rogu, ciasteczko `mlt-lang`, `<html lang>`, dopisek „Only in Polish”, karta linku w języku kopiującego, daty `en-GB`.
- Podglądy `?lang=en`, jeden angielski przebieg e2e, kroki smoke.

**Out of scope:**

- Język gry, inne języki, tłumaczenie pytań od graczy, adaptacja z innym znaczeniem, usuwanie pytań tylko po polsku z losowania.
- `/en/` w adresach, `i18n` Astro, angielski manifest, strefa czasowa widza, podział liczników pytań na języki.

## Architecture / Approach

Middleware czyta ciasteczko i `Accept-Language`; jedna czysta funkcja rozstrzyga język ekranu, który trafia do `Astro.locals`, `<html lang>` i propsów wysp. W wyspach słownik podaje kontekst React. Worker rysuje tekst pytania bazy w języku ekranu osoby (z polskim zapasem i znacznikiem języka), a pulę bierze z samych kategorii. Przełącznik zapisuje ciasteczko przez `POST /api/lang`: na zwykłych stronach z przeładowaniem, w pokoju bez przeładowania (świeży widok w nowym języku). `PlayerLink` dokleja `?lang=en` do linku z ekranu po angielsku, a strona linku bierze z niego tylko kartę.

## Phases at a Glance

| Phase                                | What it delivers                                                  | Key risk                                                        |
| ------------------------------------ | ----------------------------------------------------------------- | --------------------------------------------------------------- |
| 1. Słownik bez zmiany wyglądu (PR A) | ~450 napisów w słowniku, strażnik, polski co do litery (zrobione) | —                                                               |
| 2. Język gry w bazie                 | Wycofana 24.11 (nigdy na produkcji)                               | —                                                               |
| 3. Angielskie pytania                | 927 z 960 tłumaczeń z krytykiem, testy reguł (zrobione)           | —                                                               |
| 4. Gra bez języka i dotłumaczenie    | Baza jak na `main`, pula ze wszystkich pytań, 33 z wyjaśnieniem   | Niepełne cofnięcie Fazy 2; łapie `git diff` z `main` i job `db` |
| 5. Angielskie ekrany i przełącznik   | Angielski słownik, przełącznik, dopisek, karta, e2e, smoke        | Zmiana języka w pokoju na żywo (stan, fokus, czat)              |
| 6. Dokumenty i wdrożenie             | Słownik pojęć, `AGENTS.md`, scalenie, smoke                       | —                                                               |

**Prerequisites:** galeria dopisku „Only in Polish” przed kodem Fazy 5.
**Estimated effort:** Faza 4 około 1–2 sesje, Faza 5 około 2–3, Faza 6 jedna.

## Open Risks & Assumptions

- Część z 33 pytań nie zadziała po angielsku nawet z wyjaśnieniem; zostają w grze z dopiskiem, a host może je pominąć.
- W mieszanej ekipie pytanie wpisane przez gracza może mieszać języki w jednym zdaniu (świadomie przyjęte 24.11).
- Porównanie podglądów nie widzi napisów, które pojawiają się tylko po akcji (komunikaty czytnika, błędy z serwera); pilnują ich testy jednostkowe i e2e.

## Success Criteria (Summary)

- Gracz z angielską przeglądarką widzi wszystko po angielsku, od karty linku skopiowanej z angielskiego ekranu po odsłonę.
- Każdy może przełączyć swój ekran PL | EN w trakcie rundy bez utraty głosu i czatu.
- Polska gra wygląda i działa jak dziś; CI i smoke na produkcji zielone.
