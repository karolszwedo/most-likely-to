# Lista gier hosta i kasowanie (S-13) — Plan Brief

> Full plan: `context/changes/host-game-history/plan.md`
> Research: `context/changes/host-game-history/research.md`

## What & Why

Host dostaje stronę „Twoje gry” z minimalną listą swoich zakończonych gier i kasuje dowolną. PRD (FR-019) obiecuje, że host może skasować swoje dane: skasowanie zabiera wszystko, co wiąże się z nickami, a anonimowe liczniki pytań zostają we wspólnej bazie i aplikacja mówi to wprost („inaczej przycisk kłamie”). Przy okazji smoke przestaje zostawiać pokoje na koncie testowym w produkcyjnej bazie.

## Starting Point

Nic w aplikacji nie kasuje pokoju, a host widzi tylko swój jeden otwarty pokój; zakończone gry są nieosiągalne. Baza jest gotowa: każdy klucz obcy do pokoju i gracza ma kaskadę, a liczniki pytań (`private.question_stats`) nie mają klucza do gry. `/dashboard` to angielska pozostałość startera, a gość skasowanej gry zobaczyłby dziś błędne „Usunięto cię z pokoju.”.

## Desired End State

Na stronie głównej host ma link „Twoje gry”. Na `/gry` widzi swoje zakończone gry (data, liczba pytań, nicki), klika „Usuń”, czyta „Na pewno usunąć tę grę?” ze zdaniem, co znika, a co zostaje, i potwierdza; wiersz znika. W bazie nie zostaje żaden wiersz tej gry, liczniki pytań się nie zmieniają. Gość tej gry po odświeżeniu widzi „Tej gry już nie ma.”. Smoke kończy każdy przebieg bez zakończonych gier na swoim koncie.

## Key Decisions Made

| Decision                  | Choice                                                                                                          | Why (1 sentence)                                                                         | Source          |
| ------------------------- | --------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------- | --------------- |
| Które gry da się skasować | Tylko zakończone                                                                                                | Nikomu nie znika ekran w środku gry, a w rundzie nic nie czeka na złożenie do liczników. | Plan (Karol, 1) |
| Pytania dopisane w grze   | Znikają razem z grą                                                                                             | Tekst pytania może nazywać osobę, a host chciał usunąć grę; robi to sama kaskada.        | Plan (Karol, 2) |
| Co pokazuje wiersz        | Data startu, pytania, które padły, nicki; gry bez startu też                                                    | Mówi, co naprawdę było, a gry bez startu z nickami z poczekalni też da się skasować.     | Plan (Karol, 3) |
| Adres i wejście           | `/gry`, link na głównej, `/dashboard` znika                                                                     | Polski adres zgodny ze słownikiem; nic nie rozprasza w pokoju.                           | Plan (Karol, 4) |
| Gość skasowanej gry       | „Tej gry już nie ma.” przez nowy stan `gone`                                                                    | Gość wie, że nikt go nie wyrzucił (ryzyko F6 z roadmapy).                                | Plan (Karol, 5) |
| Pokoje konta smoke        | Smoke kasuje swoje zakończone gry na końcu przebiegu                                                            | Bez migracji kasującej dane, a kasowanie sprawdzane na produkcji przy każdym smoke.      | Plan (Karol, 6) |
| Zdanie przy kasowaniu     | „Znikną nicki, wyniki i pytania tej gry. Zostaną tylko anonimowe liczniki pytań (…), bez nicków i bez tej gry.” | Mówi wprost, co zostaje (FR-019).                                                        | Plan (Karol, 7) |
| Mechanizm kasowania       | Funkcja `security definer` tylko dla hosta + jeden `delete from public.rooms`                                   | Host nie ma grantów `delete`; kaskada zabiera resztę w jednej instrukcji.                | Research        |
| Odmowa dla otwartej gry   | Nowy kod `game_not_ended`                                                                                       | `room_open` już istnieje z innym znaczeniem.                                             | Plan            |
| Daty                      | Formatuje serwer w strefie `Europe/Warsaw`                                                                      | Worker biegnie w UTC; przeglądarka rozjechałaby się z renderem.                          | Plan            |

## Scope

**In scope:**

- Migracja: `host_games()`, `delete_game(p_room_id)`, stan `gone` w `join_request_state`.
- Trasy `GET /api/rooms` i `POST /api/rooms/<id>/delete`, ekran „Tej gry już nie ma.”, spóźniony czekający widzi to, co przy zamkniętej grze.
- Strona `/gry` z potwierdzeniem w miejscu, link na `/`, usunięcie `/dashboard`.
- Smoke: lista, odmowy, kasowanie wszystkich zakończonych gier konta, ekran gościa i stary link.
- Testy: `tests/db/game-history.test.ts`, pgTAP (kaskada, liczniki, obcy host), jednostkowe, e2e `game-history.spec.ts`.
- Dokumenty: PRD, słownik, test-plan, test-stack, AGENTS.md (smoke), deploy-plan, roadmapa.

**Out of scope:**

- Kasowanie otwartych gier, konta hosta, automatyczne po czasie, „Usuń wszystkie”, cofanie.
- Zachowanie dopisanych pytań do przeglądu twórcy gry.
- Podsumowanie gry z listy, lista dla współhosta, stronicowanie.
- Zmiana otwartej karty „Koniec wieczoru” bez odświeżenia; rozróżnienie skasowanej gry od literówki na `/j/`.
- Migracja sprzątająca stare pokoje smoke; `domain-distillation.md` (odświeży go skill).

## Architecture / Approach

Baza: dwie nowe funkcje hosta (lista z liczbą rund i nickami, kasowanie z blokadą wiersza i odmowami przed zapisem) i zmiana jednej gałęzi `join_request_state`. Worker: GET listy i POST akcji według wzorów `lobby.ts` i `cohost.ts`, nowy rodzaj strony `/r/<id>`. Ekrany: strona Astro `/gry` formatuje dane na serwerze i podaje je wyspie React z przyciskiem kasowania (wzór `RemovePlayerButton`, fokus przez `focus.ts`). Wdrożenie: baza przed kodem.

## Phases at a Glance

| Phase         | What it delivers                                                                          | Key risk                                                                        |
| ------------- | ----------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------- |
| 1. Baza       | Funkcje listy i kasowania, stan `gone`, testy bazy i pgTAP, dokumenty z nazwami           | Klucz `rounds → game_questions` bez kaskady; dowodzi test pgTAP z rundą z listy |
| 2. Serwer gry | Trasy, ekran „Tej gry już nie ma.”, sprzątanie w smoke                                    | Stary Worker nie zna `gone`; kasuje dopiero nowy kod                            |
| 3. Ekrany     | `/gry` z kasowaniem, link na głównej (wybór Karola na zrzutach), koniec `/dashboard`, e2e | Wiersz szukany wśród wielu gier hosta e2e; fokus po zniknięciu wiersza          |
| 4. Wdrożenie  | Migracja na produkcji, scalenie, smoke na produkcji, przeklikanie Karola                  | Pierwszy smoke kasuje zaległe gry konta smoke (kilkaset żądań)                  |

**Prerequisites:** S-11 zamknięte (liczniki na produkcji), gałąź `host-game-history` od `origin/main`; `db push` z dobrej sieci (nie eduroam).
**Estimated effort:** ~4 sesje, po jednej na fazę; Faza 3 z rundą zrzutów do wyboru.

## Open Risks & Assumptions

- Pytania ze skasowanej gry przepadają, także zatwierdzone propozycje, których twórca nie przejrzał; Karol jest dziś i hostem, i twórcą, więc przyjęte.
- Skasowana gra wypada z „ostatnich wieczorów hosta”, więc po S-12 jej pytania mogą się szybciej powtórzyć (dopisek w roadmapie).
- Otwarta karta „Koniec wieczoru” u gościa nie zmienia się do odświeżenia.

## Success Criteria (Summary)

- Host na produkcji widzi swoje zakończone gry i kasuje wybraną; zdanie o anonimowych licznikach jest przy potwierdzeniu.
- Po skasowaniu nie zostaje żaden wiersz gry, liczniki pytań bez zmian (pgTAP), gość widzi „Tej gry już nie ma.”.
- Smoke na produkcji zielony i bez zaległych gier na koncie smoke.
