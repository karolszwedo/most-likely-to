# Nowa gra bez zaznaczonych kategorii: brief planu

> Full plan: `context/changes/categories-unticked/plan.md`

## What & Why

Formularz nowej gry przestaje wybierać kategorie za hosta: na start żadna nie jest zaznaczona, a host sam zaznacza, z czego gra ma losować pytania. Kategorii jest 14, więc nad listą dochodzi skrót „Zaznacz wszystkie”, a przy pełnym wyborze „Odznacz wszystkie”. To punkt L kolejki gry, decyzja Karola z 21.11.2026.

## Starting Point

Dziś `NewGameForm` startuje ze wszystkimi kategoriami zaznaczonymi i 18+ wyłączonym. To ustalenie z wywiadu do planu S-02. Pusty wybór ma już błąd „Wybierz co najmniej jedną kategorię”. E2e i smoke zakładają gry trasą, bez klikania w formularz.

## Desired End State

Host na `/` widzi puste kwadraciki i wyłączone 18+. Jednym kliknięciem może zaznaczyć wszystkie kategorie (18+ zostaje wyłączone) i jednym je odznaczyć. Podglądy w `/dev/room-states` pokazują nowe stany, a test jednostkowy pilnuje pustego startu i działania skrótu.

## Key Decisions Made

| Decision                 | Choice                                                                                               | Why (1 sentence)                                                       |
| ------------------------ | ---------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------- |
| Miejsce w kolejce        | L przed F                                                                                            | Mała zmiana, ekipa zobaczy ją już przy najbliższej grze (Karol).       |
| Start formularza         | Żadna kategoria, 18+ wyłączone                                                                       | Host wybiera świadomie, zamiast odznaczać (Karol).                     |
| Skrót                    | „Zaznacz wszystkie” / „Odznacz wszystkie”                                                            | Gra ze wszystkich kategorii w jednym kliknięciu, a nie w 14 (Karol).   |
| Wygląd skrótu            | Do wyboru na zrzutach: W1 guzik przy nagłówku, W2 link pod zdaniem, W3 kafelek „Wszystkie kategorie” | Wygląd ekranu wybiera Karol.                                           |
| Zdanie pod nagłówkiem    | Bez zmian                                                                                            | Puste kwadraciki mówią same za siebie, a błąd prowadzi dalej (Karol).  |
| 18+ przy skrócie         | Bez zmian                                                                                            | Zasada „18+ osobno w każdej kategorii” zostaje.                        |
| Wybór po błędzie serwera | Przepada (wraca pusty)                                                                               | Rzadkie, a dziś też przepada. Kategorie nie idą do adresu ani pamięci. |
| Test                     | Jednostkowy, render na serwerze + czyste funkcje skrótu, próbny alarm lokalnie                       | Klikanie sprawdza Karol, a e2e nie dotyka formularza.                  |

## Scope

**In scope:**

- pusty start formularza;
- skrót w wybranym wariancie (przy W3 stan częściowy kwadracika);
- podglądy (`picked` zamiast `noCategories`, nowy stan „wszystkie zaznaczone”);
- test i wpis alarmu w test-plan §6.1;
- PR i wdrożenie.

**Out of scope:**

- pamiętanie wyboru między grami i po błędzie;
- skrót dla 18+;
- zmiana zdania i komunikatu błędu;
- serwer gry, baza, trasa, e2e, smoke;
- wpis w roadmapie.

## Architecture / Approach

Wszystko dzieje się w wyspie `NewGameForm`: inny stan startowy i dwie czyste funkcje skrótu (czy wszystkie zaznaczone, ustaw wszystkie), które woła ekran i sprawdza test. Skrót niczego nie wysyła w formularzu (`type="button"` albo kwadracik bez `name`), więc trasa `/api/rooms` dostaje to samo co dziś.

## Phases at a Glance

| Phase                           | What it delivers                                                   | Key risk                                                        |
| ------------------------------- | ------------------------------------------------------------------ | --------------------------------------------------------------- |
| 1. Galeria skrótu               | Pusty start + 3 warianty skrótu na zrzutach, wybór Karola          | Galeria w złym układzie strony myli przy ocenie                 |
| 2. Formularz z wybranym skrótem | Wybrany wariant, podglądy, test z alarmem, bramka, zrzuty przed/po | W3: kwadracik „wszystkie” z `name` dopisałby fałszywą kategorię |
| 3. PR i wdrożenie               | Zielone CI, scalenie przez Karola, smoke prod, sprawdzenie Karola  | Brak (bez bazy)                                                 |

**Prerequisites:** gałąź `categories-unticked` od `origin/main` (`49741c0`). Serwer dev tylko do `/dev/*`.
**Estimated effort:** ~1–2 krótkie sesje (galeria, potem kod i PR).

## Open Risks & Assumptions

- Zakładamy, że host, który chce grać ze wszystkich, znajdzie skrót. Karol oceni to na zrzutach.
- Po rzadkim błędzie serwera host zaznacza kategorie od nowa (przyjęte).

## Success Criteria (Summary)

- Host na `/` widzi puste kategorie i sam wybiera, a skrót zaznacza i odznacza wszystkie.
- 18+ dalej wyłączone na start i po skrócie.
- CI i smoke na produkcji zielone, a Karol potwierdza na telefonie i laptopie.
