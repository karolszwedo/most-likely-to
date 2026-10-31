# Wybór koloru przez gracza (S-18) — Plan Brief

> Full plan: `context/changes/player-color-choice/plan.md`
> Research: `context/changes/player-color-choice/research.md`

## What & Why

Gracz (host i gość) sam wybiera swój kolor z palety 20 kolorów gry, zamiast dostawać go z miejsca przy stole. O to prosili znajomi po grze 2026-10-26. Zapisany kolor jest też warunkiem S-09: usunięcie gracza nie może zmienić kolorów pozostałych.

## Starting Point

Dziś kolor nie jest nigdzie zapisany. Liczy go przeglądarka (`seatColors`: pozycja na liście graczy modulo 20), a pięć widoków (lista „Gracze”, koło odsłony, podsumowanie, dymki emotek) bierze go z mapy nick → numer. Gracza dodają `create_room`, `join_room` i `admit_latecomer`, wszystkie pod blokadą wiersza pokoju.

## Desired End State

Każdy gracz ma kolor zapisany w bazie: przy wejściu pierwszy wolny, a potem ten, który sam wybierze. Na liście „Gracze” w poczekalni i w głosowaniu dotyka swojej kropki i wybiera z palety. Kolory zajęte przez innych są wyszarzone, a zmianę od razu widać u wszystkich, także na kołach i w podsumowaniu. Telefon pamięta wybrany kolor i w następnej grze dostaje go od razu, jeśli jest wolny. Pokoje sprzed wdrożenia zachowują dzisiejsze kolory.

## Key Decisions Made

| Decision                     | Choice                                                                                               | Why (1 sentence)                                                                                     | Source              |
| ---------------------------- | ---------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------- | ------------------- |
| Gdzie się wybiera            | Własna kropka na liście „Gracze”, formularze bez zmian                                               | Jedno miejsce, bez nowego kroku przy wejściu                                                         | Research (Karol, 1) |
| Kiedy                        | W poczekalni i w trakcie gry, w zamkniętej grze nie                                                  | Ktoś może chcieć zmienić kolor w środku wieczoru                                                     | Research (Karol, 2) |
| Zajęty kolor                 | Wyszarzony; przy równoczesnym wyborze drugi dostaje „Ten kolor ktoś właśnie zajął.”                  | Widać od razu, co jest wolne, a wyścig rozstrzyga baza                                               | Research (Karol, 3) |
| Host                         | Te same zasady, bez rezerwacji                                                                       | Prosto i równo dla wszystkich                                                                        | Research (Karol, 4) |
| Zapamiętany kolor            | `mlt-color` obok nicka, zapis tylko po wyborze gracza                                                | Jak FR-024; kolor nadany przez grę nie nadpisuje wyboru                                              | Research (Karol, 5) |
| Ponad 20 graczy              | Od 21. kolory się powtarzają, cała paleta zajęta                                                     | Paleta ma 20 kolorów                                                                                 | Research (Karol, 6) |
| Kropki                       | Tylko tam, gdzie są dziś                                                                             | Bez zmian w formularzu głosu i chipach                                                               | Research (Karol, 7) |
| Wygląd palety                | 2–3 warianty na zrzutach, wybiera Karol                                                              | Wygląd ekranu to decyzja Karola                                                                      | Research (Karol, 8) |
| Zapis w bazie                | `players.color smallint not null`, `check` 0–19, bez domyślnej i bez unikalnego indeksu              | Unikalność do 20 graczy pilnuje kontrola pod blokadą pokoju; zapomniana droga wstawienia padnie w CI | Research + Plan     |
| Kolory przy wdrożeniu        | Uzupełnienie `(seat - 1) % 20`                                                                       | Dokładnie dzisiejszy `seatColors`, nikt nie zmienia koloru                                           | Research            |
| Zmiana koloru                | `set_player_color` dla `anon` i `authenticated`, odmowy `room_unknown`, `room_closed`, `color_taken` | Gość nie ma konta; wzór `set_cohost` + rozpoznanie jak w `cast_vote`                                 | Research            |
| Zapamiętany kolor na ekranie | Jedna prośba na pokój (`sessionStorage`), odmowa po cichu                                            | Bez pętli i bez zmiany koloru po odświeżeniu w środku gry                                            | Plan + przegląd F2  |

## Scope

**In scope:**

- Kolumna, pierwszy wolny kolor, `set_player_color`, kolor w `room_lobby`; testy bazy, pgTAP, próbny alarm
- `playerColors` zamiast `seatColors`, trasa `POST /api/rooms/[id]/color`, odmowa `color_taken`, smoke
- Paleta z 20 polskimi nazwami (czytnik ekranu), zapamiętany kolor, podglądy, E2E
- PRD FR-025, słownik „kolor gracza”, `test-plan.md` (17 rejestracji)

**Out of scope:**

- Kolor w formularzach z nickiem i u czekającego spóźnionego
- Zmiana koloru innego gracza przez hosta albo współhosta
- Nowe kolory, nowe miejsca kropek, ogłoszenie zmiany koloru, limit zmian
- Usunięcie gracza (S-09)

## Architecture / Approach

Kolor staje się danymi gracza w bazie. Funkcje wejścia nadają pierwszy wolny kolor pod blokadą wiersza pokoju, a `set_player_color` zmienia go pod tą samą blokadą i odrzuca zajęty. `room_lobby` daje graczowi `{nick, host, cohost, color}`, Worker przepuszcza `color` do widoku, a widoki biorą kolor z `playerColors` zamiast z pozycji. Zmiana idzie trasą `color` i dzwonkiem do wszystkich ekranów. Migracja wchodzi przed kodem, bo stary Worker ignoruje nowy klucz.

## Phases at a Glance

| Phase         | What it delivers                                                                                  | Key risk                                                                     |
| ------------- | ------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------- |
| 1. Baza       | Kolumna z dzisiejszymi kolorami, pierwszy wolny, `set_player_color`, kolor w stanie pokoju, testy | Kopia starszej definicji funkcji wejścia cofnie po cichu wcześniejsze zmiany |
| 2. Serwer gry | Kolor z bazy w widokach, trasa i odmowa, smoke                                                    | Parser wymaga `color`, więc kod nie może wejść przed bazą                    |
| 3. Ekrany     | Paleta wybrana przez Karola, zapamiętany kolor, podglądy, E2E                                     | Paleta 20 kolorów musi się zmieścić i być czytelna na telefonie              |
| 4. Wdrożenie  | `db push`, scalenie, smoke na produkcji, gra z ekipą                                              | `db push` nie z eduroam ani ze słabego łącza                                 |

**Prerequisites:** gałąź `player-color-choice` (lokalny `f9e4f34`), S-07 na produkcji, dobre łącze do `db push` w fazie 4.
**Estimated effort:** ~3–4 sesje w 4 fazach, jak S-07.

## Open Risks & Assumptions

- Nazwy 20 kolorów muszą pasować do odcieni; akceptuje je Karol na zrzutach (3.5).
- Gdy shadcn dla palety dokłada nową paczkę npm, potrzebna zgoda Karola.
- 2.3 da się przeklikać dopiero po `db push`, bo serwer dev łączy się z produkcyjną bazą.

## Success Criteria (Summary)

- Każdy gracz w pokoju do 20 osób ma inny kolor, sam go zmienia w poczekalni i w grze, a zajęty kolor jest nieklikalny.
- Zmianę koloru widać od razu u wszystkich, na listach, kołach i w podsumowaniu, a następna gra na tym telefonie zaczyna się od zapamiętanego koloru.
- CI zielone we wszystkich jobach, smoke na produkcji zielony, gra z ekipą bez niespodzianek.
