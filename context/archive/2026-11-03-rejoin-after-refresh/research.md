---
date: 2026-11-03T08:12:20+01:00
researcher: Claude (Opus 5.5)
git_commit: 80a6ea1
branch: rejoin-after-refresh
repository: most-likely-to
topic: "S-04 powrót po odświeżeniu: co dziś działa po odświeżeniu strony i utracie połączenia, czego brakuje do kryterium (< 10 s na swój nick, widoczny oddany głos, nikt nie przejmie nicku) i jak pokazać własny głos bez pary głosujący→cel z serwera"
tags:
  [
    research,
    rejoin-after-refresh,
    player-token,
    room_lobby,
    me_voted,
    RoundVoting,
    useRoomState,
    join_requests,
    anonymity,
  ]
status: complete
last_updated: 2026-11-03
last_updated_by: Claude (Opus 5.5)
---

# Research: S-04 powrót po odświeżeniu

**Date**: 2026-11-03T08:12:20+01:00
**Researcher**: Claude (Opus 5.5)
**Git Commit**: 80a6ea1 (`origin/main`; PR #38 z poprawkami S-09 jeszcze niescalony, zmienia m.in. `RoundVoting.tsx`, `RoomScreen.tsx` i `src/pages/r/[id].astro`)
**Branch**: rejoin-after-refresh
**Repository**: most-likely-to

## Research Question

Roadmapa S-04 (`context/foundation/roadmap.md:157-168`): gracz, który odświeży stronę albo straci połączenie, w mniej niż 10 s wraca na swój nick w bieżącej rundzie i widzi swój oddany głos, a nikt inny nie może w tym czasie przejąć jego nicku. PRD: US-01 (`context/foundation/prd.md:79`), FR-011 (`prd.md:111-112`), wymaganie niefunkcjonalne 10 s (`prd.md:151`) i „kto na kogo” nigdy do odzyskania (`prd.md:152`). Co z tego działa dziś, czego brakuje i jak pokazać własny głos, skoro serwer nie może zwrócić pary głosujący→cel (AGENTS.md, Hard Rules).

## Summary

- **Odświeżenie z zachowanym ciasteczkiem już dziś przywraca gracza na jego nick i do bieżącej rundy, w czasie jednego załadowania strony.** Gość wraca tokenem gościa z ciasteczka `mlt_player_<roomId>` (httpOnly, 24 h, `src/lib/rooms/tokens.ts:13,31-45`), host sesją Supabase. `/r/[id].astro` woła `room_lobby` po stronie serwera (`src/pages/r/[id].astro:32`, `src/lib/rooms/server.ts:228-244`), więc stan rundy przychodzi razem ze stroną. Ponowne otwarcie linku `/j/<kod>` z działającym ciasteczkiem przekierowuje 302 do pokoju (`src/pages/j/[token].astro:41-47,65-67`).
- **Po odświeżeniu gracz widzi „Głos oddany”, ale nie widzi, na kogo zagłosował.** Wybór żyje tylko w stanie Reacta (`RoundVoting.tsx:34-38,147`); po przeładowaniu zostaje `me_voted` z serwera (`:153-154`), a linijka „Twój głos: X.” / „Wstrzymujesz się.” renderuje się tylko z pamięci komponentu (`:336`). Podgląd tego stanu to „35. Gość: po głosie i odświeżeniu strony” (`src/pages/dev/room-states.astro:1031-1039`).
- **Serwer nie ma skąd zwrócić celu głosu i tak ma zostać.** `private.round_voters` trzyma tylko `(round_id, player_id)`, a `private.ballot_boxes` liczniki na cel (`supabase/migrations/20261014101922_first_live_round.sql:141-153`). `cast_vote` odpowiada dokładnie `{ok:true}` (`20261020205751_round_number_required.sql:223`), a runda w `room_lobby` ma `me_voted: boolean` bez celu (`20261101125331_remove_player.sql:312-337`). Pilnują tego testy kluczy (`tests/db/round-anonymity.test.ts:140-172`) i pgTAP (`supabase/tests/round_creator_view.test.sql:866-873`). Pokazanie własnego głosu po odświeżeniu wymaga więc pamięci w przeglądarce gracza, a to łamie dzisiejsze brzmienie Hard Rule („never persist … in any form”). Potrzebna jest decyzja Karola i wyjątek w AGENTS.md (decyzja D1 niżej).
- **Nicku nie da się przejąć.** Unikalność `players_room_nick_key UNIQUE (room_id, nick_key)` (`first_live_round.sql:103-107`); `join_room` zamienia naruszenie na `nick_taken`, a `request_join` sprawdza graczy i oczekujące prośby przed zapisem (`20261022132240_latecomer_admission.sql:171-177`).
- **Gracz, który zgubi ciasteczko, nie odzyska swojego nicku żadną drogą.** Dotyczy to ciasteczka starszego niż 24 h, wyczyszczonych danych, innej przeglądarki albo telefonu oraz przeglądarki w Discordzie kontra Safari na iOS. Taki gracz dostaje 404 „Nie jesteś w tym pokoju.” (`[id].astro:35-51`). Wchodzi tylko pod nowym nickiem: w poczekalni przez `join_room`, w grze przez prośbę spóźnionego i „Wpuść” (`src/pages/api/rooms/join.ts:51-61`). Stary nick zostaje w `eligible`, więc runda czeka na ręczne „Odsłoń wynik” albo na usunięcie starego miejsca (S-09). FR-011 wymaga tu odzyskania nicku po weryfikacji, że to ta sama osoba (decyzja D2).
- **Utrata połączenia bez przeładowania nie zawsze mieści się w 10 s.** Ekran odpytuje serwer co 15 s, póki kanał uchodzi za żywy (`LOBBY_POLL_MS`, `src/lib/live-sync/shared.ts:12`), i co 5 s, gdy jest zerwany (`BROKEN_POLL_MS`, `src/components/room/useRoomState.ts:45`). Po ponownej subskrypcji i po powrocie karty pobiera stan od razu (`useRoomState.ts:286-293,311-320`). Nie ma nasłuchu zdarzenia `online` (sprawdzone `src/`). Dopóki realtime-js nie zauważy martwego gniazda (czas biblioteki, poza repo), łapie tylko 15-sekundowe odpytywanie (decyzja D3, techniczna).

## Detailed Findings

### Tożsamość gracza po załadowaniu strony

- Token gościa: 32 losowe bajty jako base64url, 43 znaki (`tokens.ts:11,26-29`), wydany w `join.ts:65`. W bazie leży tylko `sha256` w `public.player_secrets(player_id PK → players ON DELETE CASCADE, token_hash UNIQUE)`, bez grantów i polityk (`20261007122858_room_lobby.sql:49-58`). Spóźniony z poprawnym tokenem w ciasteczku zachowuje go (`join.ts:52-53`); `admit_latecomer` kopiuje hash z prośby (`20261031090821_player_color_choice.sql:305-306`).
- Ciasteczko pisane jest tylko przy wejściu albo prośbie (`join.ts:57,75`) i nie jest odnawiane, więc 24 h liczy się od wejścia. W bazie hash nie wygasa; znika z wierszem gracza (`remove_player`) albo z pokojem.
- Host: `auth.uid() = rooms.host_id`; dla hosta token jest ignorowany (`remove_player.sql:227-231`, `round_number_required.sql:126-129`). Host wraca z każdego urządzenia, na którym się zaloguje. Współhost jest gościem z rolą, więc wraca jak gość (ciasteczkiem).
- `room_lobby` zwraca `null` dla kogoś, kto nie jest hostem i nie ma pasującego hasha (`remove_player.sql:232-244`), a w przeciwnym razie `{status, role, me, players, round, requests, question_list, leader_draw, link_token, game_totals}` (`:392-414`), bez identyfikatorów.
- Przy `null` strona pokoju odpowiada 404 „Nie jesteś w tym pokoju.”, a gdy ciasteczko ma format tokenu i `join_request_state` daje `none`, pokazuje „Usunięto cię z pokoju.” (`[id].astro:35-51`, S-09).

### Własny głos na ekranie

- `MyVote {target: string | null}` z komentarzem „never in storage, a cookie or the URL (AGENTS.md)” i zapowiedzią „S-04 shows it after a reload” (`RoundVoting.tsx:34-38`).
- `hasVoted = myVote !== null || round.me_voted` z komentarzem „After a reload only the database knows: "Głos oddany", without the choice.” (`RoundVoting.tsx:153-154`).
- W tej samej karcie bez przeładowania (zerwany kanał, uśpiony telefon) wyspa się nie odmontowuje, więc `myVote` i linijka „Twój głos: X.” zostają; brak dotyczy tylko przeładowania.
- Przeglądarka przechowuje dziś: `localStorage` `mlt-nick`, `mlt-color` (`src/lib/rooms/remembered-nick.ts:13-14`) i `sessionStorage` `mlt-color-asked` (`:15`) oraz `mlt-room-reloaded:<roomId>` (strażnik pętli przeładowań, `useRoomState.ts:56,101-119`). Nic o głosie, nawet „zagłosowałem”. S-14 zapisało w decyzji, że pamięć nicku nigdy nie trzyma głosu ani celu głosu (`context/archive/2026-10-25-remembered-nick/change.md:12`, `plan.md:47`).
- Po przeładowaniu ginie też (poza zakresem kryterium S-04): niewysłany wybór w formularzu, kciuk na odsłoniętym pytaniu (przyciski startują puste, `QuestionReaction.tsx:44-47`), wybór „Koło” / „Paski” (`RoomScreen.tsx:183-185`), emotki na ekranie.

### Głos po stronie serwera

- `cast_vote(p_room_id, p_target, p_player_token default null, p_round default null)` wstawia wiersz do `round_voters` i podbija licznik w `ballot_boxes` (`round_number_required.sql:196-212`); drugi głos tym samym tokenem dostaje `already_voted` (`:182-184`). Po odświeżeniu nie da się więc zagłosować drugi raz (test z S-02: `context/archive/2026-10-13-first-live-round/plan.md:197`).
- Obie tabele są unlogged i bez grantów (`first_live_round.sql:141-161`), kasowane przy odsłonie w `finish_round` (`20261026074427_question_play_data.sql:234-235`) i przy zamknięciu w `drop_round_state` (`latecomer_admission.sql:69-84`).
- Worker przekazuje dalej tylko ok albo odmowę (`server.ts:339-343,369-383`, `src/pages/api/rooms/[id]/vote.ts:18-23`).

### Nick i jego odzyskanie

- Nicku nie przejmie nikt inny: unikalność `(room_id, nick_key)`, `nick_key` bez selektorów wariantu (`first_live_round.sql:90-107`), odmowa `nick_taken` w `join_room` (`player_color_choice.sql:218-231`) i w `request_join` (`latecomer_admission.sql:171-177`).
- Odzyskania nie ma: kto stracił ciasteczko, jest dla gry obcym. Tekst podpowiedzi przy `nick_taken` od S-01: „Jeśli to ty, a telefon cię nie pamięta… wpisz inny nick.” (`context/archive/2026-10-07-room-lobby/plan.md:271`). Zapamiętany nick nie jest podpowiadany po `nick_taken` (`j/[token].astro:77-78`).
- Obejście dostępne od S-09: prowadzący usuwa stare miejsce (`remove_player` kasuje gracza, hash i jego wyniki, `remove_player.sql:146-147`, i wymienia link, `:149-152`), a gracz wchodzi nowym linkiem pod tym samym nickiem (`tests/db/remove-player.test.ts:243,502`). Koszt: nowy link dla wszystkich, gracz traci wyniki poprzednich rund i podsumowanie, a jeśli w bieżącej rundzie już głosował, jako nowy gracz zagłosuje dopiero od następnego pytania (`player_color_choice.sql:244-245`).
- Najbliższy wzór na odzyskanie z weryfikacją to prośba spóźnionego (S-08): `join_requests` z `token_hash`, limit 5 oczekujących (`latecomer_admission.sql:48,181-185`), „Wpuść” u prowadzącego (`admit_latecomer`), stan prośby dla gracza w `join_request_state` (`:207-257`).

### Utrata połączenia bez przeładowania

- Kanał tylko „dzwoni”; stan zawsze przychodzi z `GET /api/rooms/<id>/lobby` (`useRoomState.ts`).
- Po CHANNEL_ERROR / TIMED_OUT realtime-js dołącza sam; po CLOSED ekran zakłada nowy kanał po 1 s, 2 s, 4 s… do 30 s (`useRoomState.ts:51-52,329-338`). W tym czasie baner „Połączenie na żywo przerwane — odświeżam” (`LiveBanner.tsx:4`) i odpytywanie co 5 s.
- Ogranicznik: co najmniej 500 ms między pobraniami, pobranie porzucane po 3 s (`src/lib/live-sync/limiter.ts:18-19`). Nieudane pobranie zostawia ostatni stan i dopisek „Nie udało się odświeżyć stanu gry” (`RoundVoting.tsx:214`); 404 przeładowuje stronę raz na wejście (`useRoomState.ts:191-199`).
- Najgorszy przypadek dziś: martwe gniazdo, którego biblioteka jeszcze nie wykryła, i widoczna karta. Wtedy stan dogania tylko odpytywanie co 15 s, więcej niż 10 s z `prd.md:151`. Czasu wykrycia przez realtime-js (heartbeat) w repo nie ma; to luka do sprawdzenia przy planie albo do obejścia własnym nasłuchem.

## Code References

- `src/lib/rooms/tokens.ts:11-45` — token gościa, ciasteczko `mlt_player_<roomId>`, 24 h
- `src/pages/r/[id].astro:32-75` — rozpoznanie gracza, 404 / „Usunięto cię z pokoju.”, propsy wyspy
- `src/pages/j/[token].astro:41-47,65-67,77-78` — powrót linkiem z ciasteczkiem, brak podpowiedzi nicku po `nick_taken`
- `src/pages/api/rooms/join.ts:51-78` — wejście w poczekalni i prośba spóźnionego, zapis ciasteczka
- `src/components/room/RoundVoting.tsx:34-38,147,153-154,336` — `MyVote` w pamięci, `hasVoted`, linijka „Twój głos”
- `src/components/room/useRoomState.ts:45,51-56,101-119,191-199,257-268,286-293,311-338` — odpytywanie, ponowne kanały, powrót karty, strażnik przeładowań
- `src/lib/live-sync/shared.ts:12` — `LOBBY_POLL_MS = 15000`
- `src/lib/rooms/remembered-nick.ts:8-15` — co dziś leży w pamięci przeglądarki
- `src/pages/dev/room-states.astro:1031-1039` — podgląd 35 „po głosie i odświeżeniu strony”
- `supabase/migrations/20261014101922_first_live_round.sql:90-161` — `nick_key`, unikalność, `ballot_boxes`, `round_voters`
- `supabase/migrations/20261020205751_round_number_required.sql:87-225` — `cast_vote`
- `supabase/migrations/20261101125331_remove_player.sql:183-416` — najnowszy `room_lobby` (`me_voted` `:330-332`)
- `supabase/migrations/20261022132240_latecomer_admission.sql:48,69-84,165-185,207-257` — prośby spóźnionych, `drop_round_state`, `join_request_state`
- `tests/db/round-anonymity.test.ts:140-172`, `tests/db/support/rounds.ts:185-194`, `supabase/tests/round_creator_view.test.sql:797-873` — strażnicy anonimowości

## Architecture Insights

- Tożsamość gracza to wyłącznie ciasteczko (gość) albo sesja (host). Kod linku służy tylko do wejścia; pokój i kanał na żywo są po `rooms.id`. Odświeżenie z ciasteczkiem nie potrzebuje więc żadnej nowej drogi; brakuje tylko odzyskania bez ciasteczka.
- Stan rundy dla gracza jest zbudowany tak, żeby serwer nie znał pary głosujący→cel w jednym wierszu. Każde rozwiązanie D1 musi zostawić `VOTING_ROUND_KEYS` i odpowiedź `cast_vote` bez zmian; inaczej czerwienią się testy anonimowości.
- Wzorzec „gracz prosi, prowadzący zatwierdza” istnieje (S-08) i jest naturalnym miejscem na weryfikację „to ta sama osoba” z FR-011: prowadzący widzi ludzi w pokoju albo na Discordzie.

## Historical Context (from prior changes)

- `context/archive/2026-10-13-first-live-round/plan.md:73`, `research.md:50,239,428` — S-02 pokazuje po odświeżeniu tylko „Głos oddany”; zapis wyboru w telefonie odłożony do S-04, bo koliduje z AGENTS.md; „głos tylko w przeglądarce” był rekomendacją recenzenta, nie decyzją (aktualne).
- `context/archive/2026-09-27-live-sync-spike/external-research.md:169` — źródło pomysłu „własny głos gracza (FR-011) trzymać tylko w jego przeglądarce” (nierozstrzygnięte do dziś).
- `context/archive/2026-10-25-remembered-nick/research.md:166,171-172` — moduł S-14 nie może cicho stać się miejscem na głos; „ten sam telefon” znaczy w praktyce „ta sama przeglądarka”, bo przeglądarka Discorda na iOS i Safari mają osobne pamięci (aktualne).
- `context/archive/2026-10-07-room-lobby/plan.md:49,58`, `context/archive/2026-10-10-testing-lobby-foundation/research.md:160-162` — powrót na nick po utracie ciasteczka, 24 h ciasteczka i rozjazd ciasteczek na iOS odłożone do S-04 (aktualne: nic się nie zmieniło).
- `context/archive/2026-10-22-latecomer-admission/plan.md:40`, `research.md:145` — gracz bez ciasteczka w trakcie gry wraca tylko pod nowym nickiem przez prośbę; stary nick blokuje samoczynną odsłonę; pełny powrót to S-04 (aktualne; od S-09 dochodzi obejście przez usunięcie starego miejsca).
- `context/changes/remove-player-new-link/research.md:160` (decyzja 6) — usunięty wraca tylko nowym linkiem, bez banów.
- `context/changes/refactor-opportunities/research.md:53-54`, `plan-brief.md:95` — P12 (głos po odświeżeniu) i P13 (utrata ciasteczka zamyka drogę do nicku) zatrzymane jako decyzje produktowe dla S-04; nowa pamięć w przeglądarce wymaga decyzji właściciela i nowego wyjątku.
- `context/domain/domain-distillation.md:204,211-213,219` (Q-01, ranking #1) — dosłowne S-04 złamałoby jedyną stałą regułę gry; właściciel decyduje przed planem. Odnośniki `prd.md:105` / `:75` w tym dokumencie odpowiadają dziś `prd.md:111` / `:79`.
- `context/foundation/test-plan.md:45-50,63-68,82` — ryzyka #1 (jak S-04 przywraca głos), #2 (stan w 2 s także po odświeżeniu), #3 (podwójny głos po powrocie), #6 (po odświeżeniu ktoś zajmuje nick); faza 3 testów (odsłona na żywo i zerwane połączenie) nierozpoczęta, archiwum `2026-10-15-full-game-evening/research.md:48,134,148` radzi zrobić ją „najlepiej z S-04”.

## Related Research

- `context/changes/guest-vote-flow-analysis/research.md:159-170,334` — stan głosowania gościa, Open Question 1 o głosie po odświeżeniu
- `context/changes/remove-player-new-link/research.md` — tożsamość gracza, link, usunięcie
- `context/archive/2026-10-22-latecomer-admission/research.md` — prośby spóźnionych

## Decyzje do planu

**D1 (Karol, produkt i wyjątek od Hard Rule): czy po odświeżeniu pokazać, na kogo gracz zagłosował?**

| Ścieżka                                                  | Co gracz widzi po odświeżeniu                       | Koszt                                                                                              | Ryzyko dla anonimowości                                                                                            |
| -------------------------------------------------------- | --------------------------------------------------- | -------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| A. Nie pokazywać                                         | „Głos oddany” jak dziś                              | zmiana brzmienia US-01/FR-011 w PRD                                                                | żadne nowe                                                                                                         |
| B. Pamięć karty (`sessionStorage`), tylko do końca rundy | „Głos oddany” + „Twój głos: X.”, w tej samej karcie | mały: zapis po `{ok:true}`, odczyt przy starcie, kasowanie przy zmianie rundy; wyjątek w AGENTS.md | para leży w przeglądarce gracza do odsłony, tak jak dziś na jego ekranie; serwer i twórca gry nadal nic nie wiedzą |
| C. Pamięć przeglądarki (`localStorage`)                  | jak B, także po zamknięciu karty                    | jak B                                                                                              | para może przeżyć zamknięcie karty, gdy gracz nie wróci do pokoju i nic jej nie skasuje                            |

Rekomendacja: **B**. Daje pełne kryterium US-01 dla typowego przypadku (przypadkowe przeciągnięcie strony, przeładowanie po uśpieniu), a nic nie wychodzi poza telefon gracza i nie żyje dłużej niż runda. Klucz z numerem rundy, wartość: nick celu albo „wstrzymuję się”; przy innej rundzie albo odsłonie wpis jest kasowany. „Ten sam telefon” znaczy tu „ta sama karta tej samej przeglądarki” (iOS: Discord i Safari to osobne pamięci).

**D2 (Karol, produkt): gracz bez ciasteczka a jego nick.**

| Ścieżka                                   | Jak wraca                                                                                                                                                                                                                | Koszt                                                                                                                |
| ----------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------- |
| A. Bez zmian                              | nowy nick albo usunięcie starego miejsca przez prowadzącego i nowy link (S-09)                                                                                                                                           | zero; ale nowy link dla wszystkich i utrata wyników                                                                  |
| B. Prośba o powrót, zatwierdza prowadzący | wpisuje swój nick, widzi „Ten nick jest w grze. To ty? Poproś o powrót”; prowadzący dostaje „Kasia chce wrócić na swój nick” → „Wpuść”; serwer przepina hash tokenu na stare miejsce (zostają wyniki, kolor, `me_voted`) | migracja (rodzaj prośby „powrót”, przepięcie hasha), ekrany gracza i prowadzącego, testy bazy; największa część S-04 |
| C. Kod powrotu na ekranie gracza          | gracz przepisuje kod z innego urządzenia                                                                                                                                                                                 | nowy sekret do pokazania i przechowania; niewygodne na imprezie                                                      |

Rekomendacja: **B**. Weryfikację „to ta sama osoba” z FR-011 robi człowiek, który widzi ekipę. Gotowy wzorzec to S-08, więc stary głos zostaje przy miejscu i nie da się zagłosować drugi raz. Bez tego S-04 nie domyka realnego przypadku z telefonów: link otwarty w Discordzie, potem w Safari.

**D3 (techniczna, rozstrzyga sesja): utrata połączenia w < 10 s.** Do rozważenia w planie: nasłuch `online` i `pageshow` z natychmiastowym pobraniem stanu oraz krótsze odpytywanie w stanie „kanał żywy” (dziś 15 s) albo krótszy heartbeat realtime-js. Każde odpytanie to jedno wywołanie `room_lobby`, więc częstotliwość liczyć na pokój z 20 graczami.

**Testy (dla planu):** e2e „odświeżenie w trakcie rundy” (gracz wraca na nick, „Głos oddany”, przy D1=B także „Twój głos: X.”, drugi głos odrzucony); przy D2=B testy bazy: powrót tylko po „Wpuść”, cudzy token nie przepina miejsca, drugi głos po powrocie dostaje `already_voted`; testy anonimowości bez zmian (`VOTING_ROUND_KEYS`, odpowiedź `cast_vote`).

## Open Questions

- Czas wykrycia martwego gniazda przez realtime-js (heartbeat, backoff) nie wynika z repo; plan powinien albo go zmierzyć, albo nie polegać na nim (D3).
- Przy D2=B: czy prośba o powrót ma działać także w poczekalni (dziś prośby istnieją tylko w trakcie gry), i co z miejscem, które w tej chwili ma też żywe ciasteczko na innym urządzeniu (dwa urządzenia na jednym nicku po zatwierdzeniu).
- Kolejność z PR #38: zmienia `RoundVoting.tsx`, `RoomScreen.tsx` i `src/pages/r/[id].astro`; gałąź S-04 trzeba odświeżyć po jego scaleniu, zanim zmieni te pliki.
