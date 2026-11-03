# Powrót po odświeżeniu (S-04) — Plan Brief

> Full plan: `context/changes/rejoin-after-refresh/plan.md`
> Research: `context/changes/rejoin-after-refresh/research.md`
>
> **Szkic (2026-11-03): D1 i D2 czekają na „tak” Karola.** Do tego czasu `change.md` = `preparing`, roadmapa bez zmian.

## What & Why

Gracz, który odświeży stronę albo straci połączenie, ma w mniej niż 10 s wrócić na swój nick w bieżącej rundzie i widzieć swój oddany głos, a nikt inny nie może przejąć jego nicku (S-04, US-01, FR-011). To ostatni brakujący kawałek kryteriów pierwszej rundy na żywo.

## Starting Point

Odświeżenie z ciasteczkiem już przywraca gracza w jednym załadowaniu strony, z „Głos oddany”, ale bez „Twój głos: X.”. Nicku nikt nie przejmie, ale kto zgubi ciasteczko (inna przeglądarka, np. Discord → Safari), nie wróci na swój nick. Po zerwanym połączeniu ekran dogania stan dopiero po 15 s albo później.

## Desired End State

Po zerwaniu połączenia stan dociera w ≤ 10 s, a po powrocie sieci od razu. Po przeładowaniu w tej samej karcie widać „Twój głos: X.” do końca rundy; serwer dalej nie zna pary „kto na kogo”. Gracz w innej przeglądarce wpisuje swój nick, prosi o powrót, prowadzący wpuszcza, a gracz wraca na swoje miejsce z kolorem, wynikami i oddanym głosem.

## Key Decisions Made

| Decision                                   | Choice                                                                                                   | Why (1 sentence)                                                                        | Source                                       |
| ------------------------------------------ | -------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------- | -------------------------------------------- |
| D1 własny głos po przeładowaniu            | `sessionStorage` karty, kasowany przy odsłonie, pominięciu i nowej rundzie; wyjątek w AGENTS.md i PRD    | daje kryterium US-01, a para nie wychodzi z telefonu gracza i nie żyje dłużej niż runda | Research (rekomendacja, **czeka na Karola**) |
| D2 gracz bez ciasteczka                    | prośba o powrót, zatwierdza prowadzący („Wpuść”), serwer przepina miejsce na nowy token                  | weryfikację „to ta sama osoba” robi człowiek, który widzi ekipę; wzór z S-08            | Research (rekomendacja, **czeka na Karola**) |
| D3 czas po zerwaniu połączenia             | odpytywanie ekranu pokoju 15 s → 8 s (`ROOM_POLL_MS`) + natychmiastowe pobranie po `online` i `pageshow` | gwarantuje ≤ 10 s bez polegania na heartbeacie realtime-js (25–50 s)                    | Plan                                         |
| Heartbeat realtime-js                      | bez zmian                                                                                                | koszt wiadomości w limicie Supabase niepewny, a odpytywanie wystarcza                   | Plan                                         |
| Stare urządzenie po powrocie gdzie indziej | ślad `moved` starego tokenu, własny tekst zamiast „Usunięto cię z pokoju.”                               | inaczej gracz dostałby mylący komunikat z S-09                                          | Plan                                         |
| Host                                       | wraca logowaniem; prośba o powrót na nick hosta odrzucana                                                | host ma już pewną drogę z każdego urządzenia                                            | Plan                                         |

## Scope

**In scope:** szybsze doganianie stanu; e2e odświeżenia i martwego gniazda; własny głos w pamięci karty; prośba o powrót w poczekalni i w grze, „Wpuść” u hosta i współhosta; tekst na starym urządzeniu; smoke z krokiem powrotu; wdrożenie.

**Out of scope:** serwer zwracający cel głosu; `localStorage`/ciasteczko z głosem; przywracanie niewysłanego wyboru, kciuka, „Koło”/„Paski”, emotek; dłuższe ciasteczko i kody powrotu; obecność „kto online”; zmiana heartbeatu.

## Architecture / Approach

Bez nowych dróg dla odświeżenia z ciasteczkiem. Głos: mały moduł `my-vote.ts` obok `remembered-nick.ts`, zapis w `RoundVoting` po `{ok:true}`, odczyt po zamontowaniu, kasowanie w `RoomScreen`. Powrót: `join_requests.player_id` + `request_return` + rozszerzony `admit_latecomer` (przepięcie `player_secrets.token_hash`, ślad `moved`), `JoinRequests` także w poczekalni, druga droga w formularzu po `nick_taken`.

## Phases at a Glance

| Phase                                           | What it delivers                                                                    | Key risk                                                        |
| ----------------------------------------------- | ----------------------------------------------------------------------------------- | --------------------------------------------------------------- |
| 1. Doganianie stanu po zerwaniu połączenia      | ≤ 10 s bez przeładowania, e2e odświeżenia i martwego gniazda                        | węższy zapas wyroczni dzwonka (8 s) na CI                       |
| 2. Własny głos po przeładowaniu (D1)            | „Twój głos: X.” po przeładowaniu, wyjątek w zasadach                                | niezgodność HTML przy odczycie pamięci (czytać po zamontowaniu) |
| 3. Powrót bez ciasteczka — baza (D2)            | `request_return`, przepięcie miejsca, ślad `moved`, testy bazy                      | unikalność `token_hash` przy przepięciu, prośby w poczekalni    |
| 4. Powrót bez ciasteczka — serwer i ekrany (D2) | przycisk powrotu, prośba u prowadzącego w poczekalni i w grze, warianty na zrzutach | rozrost ekranu prowadzącego w poczekalni                        |
| 5. Wdrożenie                                    | baza, scalenie, smoke, gra z ekipą                                                  | `db push` tylko z dobrej sieci                                  |

**Prerequisites:** PR #38 scalony (te same pliki ekranów) i gałąź odświeżona z `origin/main` przed Fazą 2; „tak” Karola dla D1 i D2.
**Estimated effort:** ~4–5 sesji (Faza 1 i 2 po jednej, Faza 3 i 4 po jednej–dwie, Faza 5 krótka).

## Open Risks & Assumptions

- Chrome kopiuje `sessionStorage` przy „Duplikuj kartę” i przy przywróceniu sesji, więc głos może być widoczny w zduplikowanej karcie do końca rundy (przyjęte w D1).
- Dwa–trzy wieczory jednego dnia przy odpytywaniu co 8 s zbliżają się do 100 tys. zapytań/dzień planu Workers.
- Prośba o powrót może przyjść od kogoś, kto podaje się za gracza; chroni tylko decyzja prowadzącego (zgodne z FR-011).

## Success Criteria (Summary)

- Telefon w trybie samolotowym na kilka sekund: po włączeniu sieci gra od razu pokazuje aktualny stan.
- Przeciągnięcie strony po głosie: nadal „Twój głos: X.”.
- Link w innej przeglądarce: ten sam nick, „poproś o powrót”, prowadzący wpuszcza, gracz jest na swoim miejscu.
