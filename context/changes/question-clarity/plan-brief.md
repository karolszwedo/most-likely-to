# Przegląd brzmienia pytań bazy (S-28): brief planu

> Full plan: `context/changes/question-clarity/plan.md`
> Research: `context/changes/question-clarity/research.md`

## What & Why

Na pierwszej grze ze znajomymi (22.11.2026) graczka zacięła się na pytaniu „trafiłby pilotem od Wii w telewizor”: pytanie zakłada nieopisaną anegdotę, a „trafiłby” brzmi jak celny rzut. Audyt 960 pytań znalazł 16 takich zacięć i bałagan w znaczniku 18+. Poprawiamy jedno i drugie przed tłumaczeniem pytań na angielski (S-27 Faza 3), bo niejasne po polsku pytanie byłoby niejasne i po angielsku.

## Starting Point

960 pytań w `src/data/questions.ts`, 241 z nich 18+. Baza danych zna tylko numer, kategorię i 18+, więc zmiana tekstu jej nie dotyka, a zmiana 18+ idzie migawką i `db push` przed scaleniem. Zasady tekstu (≤ 90 znaków, mała litera, bez „?”) spełnia dziś każde pytanie, ale żaden test ich nie pilnuje.

## Desired End State

Gracz rozumie każde z 16 poprawionych pytań bez domyślania się. 18+ zostaje tylko przy tym, co naprawdę jest dla dorosłych: upijaniu się i grach alkoholowych, hazardzie na pieniądze, wyraźnym podtekście (nagość, noc u kogoś) i aplikacjach randkowych. Pytania z samą wzmianką o winie, z pocałunkiem, ex, zauroczeniem albo randką trafiają do gier bez 18+, więc te gry dostają dużo więcej materiału. Test pilnuje zasad tekstu, także przy przyszłych przeróbkach i tłumaczeniu.

## Key Decisions Made

| Decision                 | Choice                                                                               | Why (1 sentence)                                                                                 | Source              |
| ------------------------ | ------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------ | ------------------- |
| Brzmienie                | Wszystkie 16 poprawek z listy A, numery zostają                                      | Sens się nie zmienia, więc „bez powtórek” i dane pytań liczą się dalej                           | Research (decyzja 1) |
| Granica 18+              | Tylko upijanie się i gry alkoholowe, hazard na pieniądze, wyraźny podtekst, aplikacje randkowe | Karol: „większość tych rzeczy dla przeciętnego gracza nie będzie w ogóle drastyczna”; Tinder „generalnie do 18+” | Research (decyzje 2, 3, 5) |
| Zdjęcie 18+              | 39 pytań (23 zauroczenia, 6 wątpliwych, 10 randek); Tinder zostaje                   | Według nowej granicy nie mają powodu do 18+                                                      | Research (decyzja 3) |
| Reszta pytań 18+         | Przegląd 202 pozostałych według nowej granicy (agent + krytyk → lista Karola tematami) | Około 70 ma 18+ tylko przez alkohol, wiele bez upijania się                                      | Plan (decyzja 6 przy wdrożeniu) |
| Powtórki                 | Zostają wszystkie 14 par, bez pracy później                                          | Inna gra albo film to inna odpowiedź i smaczek dla tego, kto zna                                 | Research (decyzja 4) |
| Test zasad tekstu        | Nowy test jednostkowy z próbnym alarmem                                              | Dziś nic nie pilnuje 90 znaków, a S-27 będzie przerabiać teksty                                  | Plan                |
| Wydanie                  | Jeden PR, jedna migawka, `db push` przed scaleniem                                   | Zmiana tylko `true → false`, więc okienko między wgraniem a scaleniem jest bezpieczne            | Plan                |

## Scope

**In scope:**
- 16 nowych brzmień i nowa zasada 18+ w nagłówku pliku pytań
- zdjęcie 18+ z 39 pytań i z tych zatwierdzonych w przeglądzie
- test zasad tekstu, migawka bazy, wydanie

**Out of scope:**
- powtórki, zmiany sensu (nowe numery), wycofywanie pytań
- włączanie 18+, nowe pytania i kategorie
- tłumaczenie (S-27)

## Architecture / Approach

Najpierw tekst bez bazy (Faza 1), potem 18+ z decyzją Karola i migawką (Faza 2), na końcu wydanie w kolejności baza przed kodem (Faza 3). Tekst żyje tylko w Workerze, a migawka zmienia w `private.question_base` wyłącznie znacznik 18+.

## Phases at a Glance

| Phase                  | What it delivers                                              | Key risk                                                              |
| ---------------------- | ------------------------------------------------------------- | --------------------------------------------------------------------- |
| 1. Brzmienie i zasada  | 16 nowych brzmień, zasada 18+ w nagłówku, test zasad tekstu  | Przeróbka przekracza 90 znaków albo zmienia sens (test + Karol)      |
| 2. Oznaczenia 18+      | Przegląd reszty 18+, zdjęcie znaczników, migawka              | Kategoria z bardzo małą liczbą pytań 18+; pytanie przypięte w teście (przepiąć) |
| 3. Wydanie             | PR, CI, `db push`, scalenie, smoke na produkcji               | `db push` z eduroam nie przejdzie; kolejność migracji z S-27          |

**Prerequisites:** decyzje Karola z 23.11 (są w `research.md`); `db push` z kabla w akademiku albo hotspotu.
**Estimated effort:** 1–2 sesje: Faza 1 krótka, Faza 2 z przeglądem i decyzją Karola, Faza 3 zależy od CI i sieci.

## Open Risks & Assumptions

- Po naszej migawce migracja S-27 (`20261121200226_game_language.sql`, draft PR #92) będzie starsza niż ostatnia wgrana: przed jej `db push` trzeba nadać jej nowy znacznik czasu.
- Łagodniejsza granica może zostawić kategorię z bardzo małą liczbą pytań 18+ albo bez żadnego. Pole 18+ tej kategorii w formularzu dalej będzie widoczne, a uzupełnienie to osobne dopisywanie pytań. Raport przeglądu pokaże liczby.
- Sprawdzenie trybu przypuszczającego w teście to przybliżenie (słowo na „łby” albo „liby”); dziś pasuje do wszystkich 960 pytań.

## Success Criteria (Summary)

- Przy grze nikt nie musi się domyślać, o co chodzi w poprawionych pytaniach.
- W grze bez 18+ padają pytania o zauroczeniu, randkach i z samą wzmianką o winie; Tinder, upijanie się, kasyno i nagość dalej tylko z 18+.
- Bramka, CI i smoke na produkcji zielone, migawka wgrana przed scaleniem.
