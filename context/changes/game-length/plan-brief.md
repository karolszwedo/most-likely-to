# Długość gry widoczna dla wszystkich — Plan Brief

> Full plan: `context/changes/game-length/plan.md`
> Research: `context/changes/game-length/research.md`

## What & Why

Każda gra dostaje widoczną liczbę pytań: domyślnie 15, „Pytanie 7 z 15” przy każdym pytaniu i przystanek po ostatnim. Powód: w grach ze znajomymi pytań było „bez końca”, bo po liście gra po cichu losuje całą pulę, do 216 pytań, a nigdzie nie ma licznika.

## Starting Point

Gra losuje rundę po rundzie i nie zna swojej długości. Liczby listy mają tylko prowadzący, a koniec przychodzi po wyczerpaniu puli albo po „Zakończ grę”.

## Desired End State

W poczekalni każdy gracz widzi liczbę pytań, która zmienia się na żywo przy ruchach hosta na liście. W grze wszyscy widzą „Pytanie N z T”, a zatwierdzona propozycja dokłada jedno pytanie. Po ostatnim pytaniu prowadzący wybiera „Zakończ grę” albo „Jeszcze 5 pytań”, a licznik idzie dalej („Pytanie 16 z 20”).

## Key Decisions Made

| Decision | Choice | Why (1 sentence) | Source |
| --- | --- | --- | --- |
| Model długości | M2: licznik nad dzisiejszym losowaniem | Nie rusza startu gry, statystyk ani kilkunastu testów, więc jest bezpieczniejszy przed wieczorem z ekipą | Research, Karol |
| Domyślna długość | 15 pytań także bez listy | Tyle ma lista, a najmniejsza pula jednej kategorii to 19 | `change.md` |
| Pominięte pytanie | Zużywa jedno z liczby pytań | Licznik nie skacze, a 15 na liście to dokładnie 15 rund | Plan, Karol |
| Propozycja a decyzja 5 S-10 | Licznik mówi autorowi o decyzji chwilę wcześniej, przyjęte | Różnica to tylko chwila do następnej rundy | Research, Karol |
| Opóźnienie „z 16” | Do 8 s u graczy bez roli | Dzwonek tylko do prowadzących z PR #44 zostaje | Research, Karol |
| Mało pytań w puli | Przycisk pokazuje prawdziwą liczbę, np. „Jeszcze 3 pytania” | Liczba „z 20” nie może obiecać pytań, których nie ma | Plan |
| Nieświeży ekran | „Jeszcze 5” przy pytaniach w zapasie działa jak „Następne pytanie” | Drugi prowadzący mógł właśnie zatwierdzić propozycję | Plan |
| Kto dobiera | Prowadzący: host i współhost | Tak jak pozostałe ruchy gry | `change.md` |

## Scope

**In scope:**

- liczba pytań gry dla każdego gracza, także na żywo w poczekalni;
- licznik na ekranach rundy i w ogłoszeniu czytnika ekranu;
- zatrzymanie po ostatnim pytaniu i ruch „Jeszcze 5 pytań”;
- testy, podglądy `/dev`, dokumenty i S-19 w roadmapie.

**Out of scope:**

- lista zapisywana na starcie (M1) i zmiany w losowaniu;
- wybór długości przy tworzeniu gry;
- samoczynny koniec gry;
- liczba na ekranie czekania spóźnionego i na ekranie końca;
- obsługa gry w toku przy wdrożeniu;
- punkt 6 kolejki, pominięty decyzją Karola.

## Architecture / Approach

Jedna funkcja `private.question_count` liczy: lista albo 15, plus zatwierdzone propozycje, plus nowa kolumna `rooms.extra_questions`. Korzystają z niej `room_lobby` (klucz `question_count` dla każdego gracza), strażnik w `private.open_next_round` (jedno miejsce dla „Następnego pytania” i „Pomiń pytanie”) oraz nowy ruch `more_questions`, który dobiera najwyżej 5 i od razu otwiera rundę. Worker wylicza z tego przyciski prowadzącego, a trzy trasy listy zaczynają dzwonić.

## Phases at a Glance

| Phase | What it delivers | Key risk |
| --- | --- | --- |
| 1. Baza | Liczba pytań, strażnik, `more_questions`, klucz w stanie, testy, alarmy A i B | Przepisany test listy zgubi to, czego pilnował |
| 2. Serwer gry | Umowa stanu, liczenie po rundzie, trasa `more`, dzwonki, smoke | Nowe znaczenie `questionsLeft` |
| 3. Ekrany | Warianty na zrzutach, licznik, przyciski, podglądy, e2e, alarm C | Fokus i testy zależne od nagłówka |
| 4. Wdrożenie | Dokumenty, `db push`, scalenie, smoke na produkcji | Scalenie przed `db push` blokuje każdy pokój |

**Prerequisites:** dobra sieć do `db push` (dom albo hotspot, nie eduroam), brak trwającej gry przy wdrożeniu, wybór wariantów przez Karola.
**Estimated effort:** około 3–4 sesji, po jednej na fazę, z pracą CI między nimi.

## Open Risks & Assumptions

- Liczba jest wyliczana, a nie wynika z wierszy, więc wszystko zależy od jednej funkcji i jej testów.
- Stałe 15 i 5 są w SQL i w Workerze. Testy pilnują obu stron.
- Przez chwilę między `db push` a scaleniem stary Worker po 15. pytaniu pokaże „Pytań już nie ma”. Dlatego wdrażamy poza grą.

## Success Criteria (Summary)

- Każdy gracz w każdej chwili wie, które to pytanie i ile ich jest.
- Gra sama nie losuje dalej po ostatnim pytaniu, a prowadzący decyzją kończy albo dobiera.
- Na produkcji przechodzi smoke, a Karol przechodzi drogę na telefonie i laptopie.
