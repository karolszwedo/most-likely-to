# Propozycje pytań od gości (S-10) — Plan Brief

> Full plan: `context/changes/guest-question-proposals/plan.md`
> Research: `context/changes/guest-question-proposals/research.md`

## What & Why

Gracz w trakcie wieczoru proponuje własne pytanie, a prowadzący je zatwierdza albo odrzuca; zatwierdzone pada w następnej rundzie (FR-013, FR-014). To pierwsza treść pisana przez gości, więc tekst nie może dotrzeć do nikogo innego przed zatwierdzeniem, a para autor–tekst nie może zostać po grze.

## Starting Point

Lista pytań gry (`private.game_questions`) jest czytana na żywo, więc dopisany w grze wiersz zostanie zagrany istniejącą drogą. Wzór „gracz prosi, prowadzący decyduje” już działa w prośbach o wejście (S-08, S-04). Brakuje limitu na osobę, miejsca na autora i pierwszeństwa w kolejce.

## Desired End State

Każdy gracz w poczekalni i w grze wysyła do 3 propozycji i widzi swoje liczniki. Prowadzący widzi czekające z nickiem autora, od startu gry je zatwierdza, a odrzucić może zawsze. Zatwierdzone pytanie pada w następnej rundzie, także gdy pytania się skończyły, i zostaje po grze bez autora do przeglądu twórcy gry SQL-em.

## Key Decisions Made

| Decision | Choice | Why (1 sentence) | Source |
| --- | --- | --- | --- |
| Kiedy | Wysyłanie w poczekalni i w grze, zatwierdzanie od startu gry | Wiersz na liście przed startem zepsułby „Przejrzyj pytania” i start gry | Research + Karol |
| Kolejność | Następna runda, przed resztą listy | Inaczej przy liście 15 pytań propozycja może nie paść tego wieczoru | Research + Karol |
| Autor | Nick widzą tylko prowadzący | Prowadzącemu nick pomaga ocenić pytanie, a lista gry nie ma autora, więc grający go nie poznają | Research + Karol |
| Limit | Każdy gracz 3 na grę, odrzucone się liczą | Host i współhost mają propozycję w tabeli ról PRD, a odrzucenie nie otwiera drogi do zalewu | Research + Karol |
| Co widzi autor | Tylko liczniki „czeka” i „zostało” | Nikomu nie robi się przykro, a tekst znika z bazy zaraz po decyzji | Plan + Karol |
| Dane | Osobna nielogowana `private.question_proposals`, znacznik `proposed` na liście | Autor spotyka się z tekstem tylko w tabeli sprzątanej przy zamknięciu pokoju | Plan |
| FR-021 | Przegląd z `game_questions where proposed`, SQL-em | Te wiersze zostają po grze i nie mają autora, więc magazyn nie jest potrzebny | Research |
| Porzucona poczekalnia | Godzinne sprzątanie kasuje propozycje po 12 h | Dzisiejsze sprzątanie bierze tylko gry w toku | Research + Plan |

## Scope

**In scope:**

- Tabela propozycji, trzy funkcje bazy, pierwszeństwo w kolejce, stan pokoju, sprzątanie
- Trzy trasy Workera, teksty odmów, smoke
- Formularz gracza, lista prowadzącego, podglądy `/dev`, e2e
- Dokumenty: słownik, PRD, roadmapa, test-plan, deploy-plan z zapytaniem twórcy gry

**Out of scope:**

- Edycja tekstu przez prowadzącego i cofanie decyzji
- Status „zatwierdzona/odrzucona” u autora
- Filtr słów, limit na pokój
- Panel twórcy gry i dane o pytaniu dla takich pytań
- Zmiany w `open_question_list`, `start_game` i pięciu funkcjach listy

## Architecture / Approach

Gracz → `propose_question` → czekający wiersz z autorem i tekstem → `room_lobby` pokazuje go tylko prowadzącemu → `approve_proposal` kopiuje sam tekst do `game_questions` z `proposed = true` i kasuje tekst z wiersza → `open_next_round` bierze najpierw wpisy `proposed`. Wiersz po decyzji zostaje jako zużyty limit, a `drop_round_state` kasuje całość przy zamknięciu pokoju. Dzwonek niesie tylko `seq`.

## Phases at a Glance

| Phase | What it delivers | Key risk |
| --- | --- | --- |
| 1. Baza | Tabela, funkcje, kolejka, stan, sprzątanie, testy, próbne alarmy | Wiersz na liście przed startem gry |
| 2. Serwer gry | Trzy trasy, kontrakt stanu, teksty odmów, smoke | Kroki smoke przesuwają kolejne rundy |
| 3. Ekrany | Warianty na zrzutach, formularz, lista prowadzącego, e2e | Mało miejsca na telefonie przy pasku emotek |
| 4. Wdrożenie | Dokumenty, migracja, scalenie, smoke na produkcji | Scalenie przed `db push` blokuje każdy pokój |

**Prerequisites:** S-07 na produkcji (jest); dobra sieć do `db push` (nie eduroam).
**Estimated effort:** ~3–4 sesje (Faza 1 jedna, Faza 2 krótka, Faza 3 jedna–dwie, Faza 4 krótka).

## Open Risks & Assumptions

- Tekst propozycji może nazywać kogoś z ekipy; bramką jest prowadzący, a po zatwierdzeniu tekst zostaje w bazie (jak własne pytanie hosta).
- Pytanie zatwierdzone przez pomyłkę da się tylko pominąć w rundzie.
- Awaria bazy kasuje czekające propozycje i zeruje limity tej gry, bo tabela jest nielogowana (przyjęte).
- Usunięty gracz, który wraca nowym linkiem, dostaje nowy limit (przyjęte).
- Sprzątanie poczekalni starszej niż 12 h kasuje jej propozycje i zeruje limity przy każdym przebiegu, także gdy pokój założono z wyprzedzeniem (przyjęte).
- S-13: kasowanie gry usunie kaskadą także zatwierdzone pytania przed przeglądem twórcy gry.

## Success Criteria (Summary)

- Gracz proponuje, prowadzący zatwierdza, a pytanie pada w następnej rundzie u wszystkich, bez nicku autora.
- Nikt poza prowadzącymi nie widzi tekstu przed rundą, a po zamknięciu pokoju nie zostaje para autor–tekst.
- Propozycje nie rozbijają rytmu wieczoru z ekipą.
