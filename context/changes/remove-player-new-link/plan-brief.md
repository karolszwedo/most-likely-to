# Usunięcie gracza i nowy link (S-09) — Plan Brief

> Full plan: `context/changes/remove-player-new-link/plan.md`
> Research: `context/changes/remove-player-new-link/research.md`

## What & Why

Host albo współhost usuwa gracza z pokoju, a pokój w tej samej chwili dostaje nowy link dla graczy; stary przestaje działać, pozostali grają dalej (roadmapa S-09, PRD FR-004). To jedyne lekarstwo na link, który wyciekł albo trafił do niewłaściwej osoby, bez zamykania wieczoru przez „Nową grę”.

## Starting Point

Usunięcia gracza nie ma. Gracz jest rozpoznawany po pokoju i ciasteczku, nie po kodzie linku (link jest osobny od pokoju od S-01), więc wymiana kodu nikogo nie wyrzuci. Kod linku pisze dziś tylko `create_room`, a widzi go tylko host, tylko w poczekalni, jako prop z ładowania strony. Usunięty, który nie głosował, blokowałby dziś samą odsłonę.

## Desired End State

Host widzi „Usuń” przy każdym gościu, współhost przy gościach bez roli; po potwierdzeniu usunięty widzi „Nie jesteś w tym pokoju.”, runda nie czeka na jego głos, a host i współhost od razu widzą nowy link (w poczekalni i w grze), który wklejają na Discorda. Stary link mówi „Ten link nie działa…”. Usunięty może wrócić nowym linkiem.

## Key Decisions Made

| Decision              | Choice                                                                                                          | Why (1 sentence)                                                                           | Source   |
| --------------------- | --------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------ | -------- |
| Głosy przy usunięciu  | Głosy na usuniętego przepadają, jego oddany głos zostaje, niegłosujący zdjęty z uprawnionych                    | Anonimowość: gra nie wie, na kogo głosował; runda nie czeka na kogoś, kogo nie ma          | Research |
| Kto kogo usuwa        | Host każdego gościa, współhost gości bez roli, nikt hosta ani siebie                                            | O współhostach decyduje tylko host, jak przy nadawaniu roli                                | Research |
| Potwierdzenie         | „Na pewno usunąć <nick>?” + „Anuluj” w wierszu                                                                  | Jak „Zakończ grę”: ruch nieodwracalny                                                      | Research |
| Ślad usuniętego       | Znika ze wszystkiego, także z poprzednich wyników i podsumowania                                                | Kaskada, którą baza już ma; miękkie usuwanie to filtr w kilkunastu funkcjach               | Research |
| Link u prowadzących   | Host i współhost widzą link w poczekalni i w grze (zmienia decyzję 4 z S-07)                                    | Współhost usuwający pod nieobecność hosta musi znać nowy link                              | Research |
| Powrót i stary link   | Powrót tylko nowym linkiem, bez banów; stary link: jeden prawdziwy tekst                                        | PRD Non-Goals; rozróżnienie starego linku od literówki wymagałoby pamiętania starych kodów | Research |
| Kształt w bazie       | Jedna funkcja `remove_player` (wzór `reject_latecomer`), odmowy przed zapisami, nowy kod w tej samej transakcji | Jeden ruch = jedna transakcja pod blokadą pokoju, bez wyścigu z ostatnim głosem            | Plan     |
| Współhost → współhost | Nowy kod odmowy `cohost_protected` („Współhosta może usunąć tylko host.”)                                       | `not_leader` mówiłby nieprawdę („Nie jesteś już współhostem.”)                             | Plan     |
| Link w stanie pokoju  | `room_lobby` zwraca kod tylko prowadzącemu (wzór `leader_draw`), Worker robi z niego `RoomView.linkUrl`         | Wymiana dociera do karty drugiego prowadzącego dzwonkiem, bez osobnego zapytania           | Plan     |
| Struktura i złożoność | Średnio-wysoka, bez dalszych pytań; 4 fazy: baza → serwer gry → ekrany → wdrożenie                              | Research rozstrzygnął wszystkie decyzje produktowe                                         | Plan     |

## Scope

**In scope:**

- Funkcja bazy, trasa `POST /api/rooms/<id>/remove`, „Usuń” z potwierdzeniem na liście „Gracze” (poczekalnia i głosowanie)
- Link dla graczy u hosta i współhosta w poczekalni i w grze, odświeżany dzwonkiem
- Tekst strony starego linku, dokumenty (PRD, słownik, test-plan, roadmapa)
- Testy bazy, pgTAP, unit, smoke, e2e, próbne alarmy

**Out of scope:**

- Host, który wyszedł, i „Nowa gra” hosta przy współhoście (decyzja 8)
- Bany, miękkie usuwanie, ogłoszenie usunięcia innym graczom
- Lista „Gracze” na odsłonie (w grze „Usuń” jest po oddaniu własnego głosu)
- Zmiany w `room_link`, `join_room`, `request_join`, `cast_vote`, `finish_round`, keep-awake

## Architecture / Approach

Baza robi cały ruch w jednej transakcji pod blokadą pokoju: sprawdza prowadzącego i cel, zdejmuje niegłosującego z uprawnionych (i odsłania rundę, jeśli to był ostatni brakujący głos), kasuje jego kciuk i wiersz gracza (kaskada zabiera token i wyniki) i losuje nowy kod linku. `room_lobby` niesie kod tylko prowadzącym; Worker zamienia go na `linkUrl` w widoku, więc po dzwonku każdy prowadzący ma nowy link, a usunięty dostaje 404 i ekran „Nie jesteś w tym pokoju.”.

## Phases at a Glance

| Phase         | What it delivers                                                          | Key risk                                                            |
| ------------- | ------------------------------------------------------------------------- | ------------------------------------------------------------------- |
| 1. Baza       | `remove_player`, kod linku w stanie pokoju, testy bazy i pgTAP, dokumenty | Głosujący zdjęty z uprawnionych odsłoniłby rundę o głos za wcześnie |
| 2. Serwer gry | `linkUrl` w widoku, trasa `remove`, odmowa, unit i smoke                  | Nowy parser wymaga `link_token`: stara baza = brak pokoju           |
| 3. Ekrany     | Warianty → wybór Karola, „Usuń” w wierszu, link w grze, podglądy, e2e     | Fokus znika z usuniętym wierszem; usunięcie dociera tylko dzwonkiem |
| 4. Wdrożenie  | `db push` przed scaleniem, smoke na produkcji, gra z ekipą                | `db push` nie z eduroam; kod przed bazą zepsułby każdy pokój        |

**Prerequisites:** S-07 (współhost) i S-18 (zapisany kolor) na produkcji, oba są; dobre łącze na fazę 4.
**Estimated effort:** ~4–5 sesji w 4 fazach (faza 3 z rundą zrzutów do wyboru Karola).

## Open Risks & Assumptions

- W grze lista „Gracze” jest dopiero po własnym głosie, a na odsłonie jej nie ma: prowadzący usuwa w poczekalni albo w głosowaniu po swoim głosie.
- Usunięty dowiaduje się tylko przez odświeżenie po dzwonku (404 → jedno przeładowanie); przy zerwanym kanale na żywo dopiero po odpytaniu co 15 s.
- Odrzucony spóźniony ze starym linkiem zobaczy „Ten link nie działa…” (akceptowane).
- Dane o pytaniach (S-11) liczą głos usuniętego w `ballots`, ale nie głos na usuniętego w wynikach; spójne z tym, co pokazała odsłona.

## Success Criteria (Summary)

- Prowadzący usuwa gracza w poczekalni i w grze, pozostali grają dalej bez przeładowania.
- Nowy link widać od razu u hosta i współhosta, stary nie działa, usunięty wraca tylko nowym.
- Runda nie czeka na usuniętego, a odsłona nigdy nie zdradza, kto na kogo głosował.
