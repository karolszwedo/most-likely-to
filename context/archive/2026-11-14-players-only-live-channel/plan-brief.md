# Kanał na żywo tylko dla graczy pokoju — Plan Brief

> Full plan: `context/changes/players-only-live-channel/plan.md`
> Research: `context/changes/players-only-live-channel/research.md`

## What & Why

Kanał na żywo `live-sync:<roomId>` jest publiczny, więc gracz usunięty w S-09 (i każdy, kto zna adres `/r/<id>`) do końca gry widzi emotki pokoju i może je nadawać pod cudzym nickiem. Zmiana przenosi emotki na tajny temat z **klucza kanału**, który znają tylko gracze pokoju i który zmienia się przy usunięciu gracza. To też fundament pod ewentualny czat.

## Starting Point

Jeden publiczny temat na pokój niesie dzwonki i emotki. Nadaje tylko Worker, ale kanał przyjmuje wiadomość od każdego z kluczem publicznym i id pokoju. Przy usunięciu gracza zmienia się tylko link do pokoju.

## Desired End State

Emotki idą na `live-players:<klucz kanału>`. Klucz dostaje każdy gracz w stanie pokoju (`room_lobby`), a `remove_player` losuje nowy. Ekrany pozostałych przechodzą na nowy klucz po najbliższym pobraniu stanu. Usunięty, odrzucony spóźniony i obcy z id pokoju nie widzą emotek i nie podrzucą ich ekranom. Dzwonki zostają publiczne, jak od F-01.

## Key Decisions Made

| Decision                          | Choice                                                    | Why (1 sentence)                                                                                | Source           |
| --------------------------------- | --------------------------------------------------------- | ----------------------------------------------------------------------------------------------- | ---------------- |
| Droga                             | Tajny klucz kanału (W-A), bez kanałów prywatnych Supabase | Zamyka dziurę z roadmapy bez panelu Supabase i bez sekretu w Workerze.                          | Research + Karol |
| Podpis serwera (W-E)              | Dopiero przy czacie                                       | Dla emotek między znajomymi koszt większy niż szkoda z podszycia.                               | Research + Karol |
| Co idzie po kluczu                | Tylko emotki (W-A′), dzwonki publiczne                    | Worker nie ma sekretu, więc klucz do dzwonienia dostałby też spóźniony; dzwonek nic nie niesie. | Plan (Karol)     |
| Powrót z innego urządzenia (S-04) | Bez zmiany klucza                                         | Ta sama osoba; zmiana przełączałaby kanał wszystkim przy każdym powrocie.                       | Plan (Karol)     |
| Nazwa                             | „klucz kanału” (`rooms.channel_key`)                      | Osobna od „link do pokoju” i „kod”.                                                             | Karol            |
| Klucz w bazie                     | Kolumna z losową wartością domyślną                       | `create_room` bez zmian, każdy stary pokój dostaje własny klucz.                                | Plan             |
| Ekran                             | Jeden klient Realtime, dwa kanały                         | Efekt dzwonków bez zmian; e2e z uśpionym połączeniem śledzi jedno gniazdo.                      | Plan             |

## Scope

**In scope:**

- Kolumna `rooms.channel_key`, `room_lobby` daje ją graczom, `remove_player` ją zmienia
- Trasa emotki nadaje na temat z klucza; ekran słucha emotek tylko tam (pokój w grze i zamknięty)
- Testy bazy, pgTAP, jednostkowe, nowy e2e z surowym klientem Realtime, kroki smoke
- Słownik, roadmapa (Parked), test-plan, deploy-plan

**Out of scope:**

- Dzwonki na kluczu, osobny temat prośby spóźnionego
- Podpis serwera, kanały prywatne Supabase, zmiany w panelu, nowy sekret Workera
- Zmiana klucza przy powrocie, końcu gry, zmianie roli, odrzuceniu spóźnionego
- Limit emotek na serwerze, zmiany wyglądu, zmiana PRD

## Architecture / Approach

Baza → Worker → ekran. `room_lobby` zwraca `channel_key` każdemu graczowi; parser trzyma go we wspólnym `RoomState`, więc niosą go stan z bazy i widok ekranu. Trasa emotki bierze klucz z wyniku `room_lobby`, który już woła, i nadaje na `live-players:<klucz>`; do logu idzie tylko id pokoju. Ekran: kanał dzwonków na `live-sync:<roomId>` jak dziś, kanał emotek we własnym efekcie zależnym od klucza z ostatniego stanu. Po usunięciu dzwonek idzie na temat publiczny, ekrany pobierają stan z nowym kluczem i przełączają kanał emotek.

## Phases at a Glance

| Phase                    | What it delivers                                                    | Key risk                                               |
| ------------------------ | ------------------------------------------------------------------- | ------------------------------------------------------ |
| 1. Baza                  | Kolumna klucza, `room_lobby` i `remove_player`, testy bazy i pgTAP  | Kopia `room_lobby` (270 linii) z najnowszej definicji  |
| 2. Worker i ekrany       | Emotki po kluczu, przełączanie na ekranie, unit, e2e, smoke         | Przełączenie kanału gubi emotki albo psuje odpytywanie |
| 3. Dokumenty i wdrożenie | Słownik, roadmapa, test-plan; `db push` przed scaleniem, smoke prod | Scalenie przed `db push` (nowy parser odrzuci stan)    |

**Prerequisites:** gałąź `players-only-live-channel` od `origin/main`; `db push` z domu albo przez hotspot (nie eduroam).
**Estimated effort:** ~3 sesje, po jednej na fazę.

## Open Risks & Assumptions

- Emotki wysłane w chwili przełączenia klucza przepadają (przyjęte).
- Karty otwarte w chwili wdrożenia nie zobaczą emotek do odświeżenia: wdrażać poza wieczorem gry.
- Gracz z kluczem dalej może podszyć się pod kolegę albo zalać kanał; domknie to W-E przy czacie.
- Klucz jest w ścieżce zapytania Workera do Supabase, więc i w logach API Supabase; widzi je tylko twórca gry (przyjęta granica).
- Przegląd planu (2026-11-14, SOUND): wspólny klient w hooku, efekt emotek bez `isLive` w zależnościach, e2e także na końcu wieczoru (`reviews/plan-review.md`).

## Success Criteria (Summary)

- Usunięty gracz i obcy z id pokoju nie widzą emotek pokoju i nie podrzucą ich ekranom (e2e na prawdziwym Realtime).
- Pozostali gracze po usunięciu dalej widzą swoje emotki, w grze i na końcu wieczoru (e2e, przeklikanie Karola).
- Smoke na produkcji widzi klucz w stanie i jego zmianę przy usunięciu.
