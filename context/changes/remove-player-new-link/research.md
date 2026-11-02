---
date: 2026-10-31T17:20:50+01:00
researcher: Claude (Opus 5.5) z Karolem
git_commit: a824e6e
branch: remove-player-new-link
repository: most-likely-to
topic: "S-09 usunięcie gracza i nowy link: co dziś łączy gracza z pokojem, rundą i linkiem, i co trzeba zmienić, żeby prowadzący usuwał gracza, a pokój dostawał nowy link bez wyrzucania pozostałych"
tags: [research, remove-player, link_token, players, eligible, ballot_boxes, round_results, leader, room_lobby]
status: complete
last_updated: 2026-10-31
last_updated_by: Claude (Opus 5.5)
last_updated_note: "Decyzje Karola 1–8 przyjęte; punkt 5 zmieniony: link dla graczy widzą host i współhost, także w trakcie gry"
---

# Research: S-09 usunięcie gracza i nowy link

**Date**: 2026-10-31T17:20:50+01:00
**Researcher**: Claude (Opus 5.5) z Karolem
**Git Commit**: a824e6e
**Branch**: remove-player-new-link
**Repository**: most-likely-to

## Research Question

Jak dziś gracz jest związany z pokojem (wejście, ciasteczko, link `/j/<kod>`), z rundą (uprawnieni, urna, wynik) i z podsumowaniem, i co trzeba zmienić, żeby host albo współhost usuwał gracza z pokoju, a pokój dostawał nowy link, przy którym stary przestaje działać, a pozostali gracze zostają w grze (roadmapa S-09, `context/foundation/roadmap.md:219-230`; PRD FR-004, `context/foundation/prd.md:93-94`).

## Summary

- Wymiana linku nie wyrzuci pozostałych graczy. Gracz po wejściu jest rozpoznawany po `rooms.id` z adresu `/r/<id>` i po tokenie gościa w ciasteczku `mlt_player_<roomId>` (host po sesji), a nie po kodzie linku: `/r/[id]` i `GET …/lobby` wołają `room_lobby(p_room_id, p_player_token)` (`src/pages/r/[id].astro:28-29`, `src/lib/rooms/server.ts:226-244`), kanał na żywo ma temat `live-sync:<roomId>` (`src/lib/live-sync/shared.ts`, `topicFor`). Link zaprojektowano tak od S-01: „Separate from id and the live-sync topic, so S-09 can replace the link and keep the room” (`supabase/migrations/20261007122858_room_lobby.sql:22`).
- Kod linku czytają dziś trzy funkcje, wszystkie po `rooms.link_token`: `room_link` (`20261014101922_first_live_round.sql:384`), `join_room` (`20261031090821_player_color_choice.sql:165`) i `request_join` (`20261022132240_latecomer_admission.sql:94`). Żadna funkcja go nie zmienia; pisze go tylko `create_room` (`20261031090821_player_color_choice.sql:142`), a `authenticated` nie ma `update` na `rooms`. Wymiana linku to nowa funkcja `security definer`. Stary kod daje wtedy `room_link` → `{status: "unknown"}`, czyli stronę „Nie znamy tego linku.” (404, `src/pages/j/[token].astro:92`); tego samego `unknown` oczekuje skrypt keep-awake (`scripts/keep-supabase-awake.mjs:74`).
- Usunięcie wiersza `players` sprząta dziś mniej, niż trzeba. Kaskada kasuje `player_secrets` (token przestaje działać, `room_lobby` zwraca `null`) i wiersze `round_results` tego gracza (`first_live_round.sql:130-135`), czyli znika on z wyników poprzednich rund i z podsumowania wieczoru. Bez klucza obcego zostają: jego id w `rounds.eligible`, wiersz w `round_voters`, klucz w `ballot_boxes.tally` i kciuk w `round_reactions` (`first_live_round.sql:141-153`, `20261026074427_question_play_data.sql:86-92`).
- Runda w trakcie głosowania wymaga reguły (Open Roadmap Question 3). Odsłona automatyczna rusza, gdy `count(round_voters) >= cardinality(eligible)` (`20261020205751_round_number_required.sql:214-220`). Usunięty, który jeszcze nie głosował, blokuje ją do ręcznej „Odsłoń wynik”. Głosów oddanych przez usuniętego nie da się cofnąć, bo urna nie wie, na kogo były (tylko liczniki na cel, `first_live_round.sql:137-145`). Głosy na usuniętego `finish_round` już dziś pomija, bo łączy `eligible` z istniejącymi `players` (`question_play_data.sql:184-188`).
- Nowego linku nie ma dziś gdzie pokazać w trakcie gry: Worker czyta kod tylko dla hosta i tylko w poczekalni (`src/pages/r/[id].astro:42-48`), a `linkUrl` to stała z załadowania strony, nie część stanu pokoju (`RoomScreen` dostaje go jako prop, `:65`). Współhost linku dziś nie widzi z decyzji S-07 (`context/domain/glossary.md:41`); decyzja 5 niżej to zmienia.
- Najbliższy wzór ruchu prowadzącego to `reject_latecomer` (`co_host_role.sql:548`, granty `:922`, `:934`) z trasą `src/pages/api/rooms/[id]/reject.ts` (body `{nick}`, sesja albo ciasteczko, na końcu `ringLobby`). Kod `player_unknown` („Tego gracza nie ma w pokoju.”, `src/lib/rooms/errors.ts:81`) pasuje do odmowy dla nieistniejącego nicka.
- Decyzje produktowe (głosy, kogo wolno usunąć, potwierdzenie, ślad usuniętego, link w trakcie gry, powrót, ekran usuniętego, dwie sprawy z S-07) i projekt techniczny: sekcja „Decyzje do planu” na końcu.

## Detailed Findings

### Jak gracz jest rozpoznawany po wejściu

- Strona pokoju: `/r/[id]` czyta ciasteczko `playerCookieName(roomId)` i woła `roomLobby(supabase, roomId, playerToken)` (`src/pages/r/[id].astro:28-29`); bez wyniku loguje ostrzeżenie z flagami `hasUser`, `hasPlayerCookie` i pokazuje „Nie jesteś w tym pokoju.” / „Poproś hosta o link.” z kodem 404 (`:31-39`, `:54-55`, `:67`).
- Odświeżanie: `GET /api/rooms/[id]/lobby` robi to samo i dla `null` odpowiada 404 `not_found` (raport pomocnika: `src/pages/api/rooms/[id]/lobby.ts:453-463`). Otwarta karta traktuje 404 jako `notFound()` i przeładowuje się raz na wejście, pilnowana flagą `mlt-room-reloaded:<roomId>` w `sessionStorage` (`src/components/room/useRoomState.ts:53-55`, `:98-118`, `:190-194`, `:210`). Po przeładowaniu strona pokazuje ekran „Nie jesteś w tym pokoju.” jak wyżej. W sprawdzonych plikach klienta to jedyna ścieżka, którą usunięty gracz dowie się o usunięciu: dzwonek nie niesie treści, a kanał ma dwa zdarzenia, oba do całego pokoju (raport pomocnika: `src/lib/live-sync/shared.ts`, `BELL_EVENT`, `EMOTE_EVENT`; `src/lib/live-sync/server.ts` nieprzeczytany).
- Token gościa: 43 znaki, w bazie tylko `sha256` w `public.player_secrets` (`player_id` → `players(id)` on delete cascade, `20261007122858_room_lobby.sql:49-52`), ciasteczko httpOnly na 24 h (`src/lib/rooms/tokens.ts:13`, `:26-45`). Skasowanie wiersza `players` kasuje hash, więc stare ciasteczko usuniętego przestaje cokolwiek otwierać: `room_lobby` zwraca `null`, a `private.leader_refusal` daje `room_unknown` (`co_host_role.sql:59`).
- Stan pokoju jest kluczowany nickiem: `LobbyState.me` to nick, listy `eligible`, `voted`, `results` to nicki, `leader` liczy Worker z `players` i `cohost` (raport pomocnika: `src/lib/rooms/shared.ts:110`, `:123`; `src/lib/rooms/server.ts:279-306`).

### Link do pokoju

- Kolumna: `rooms.link_token text not null unique check (link_token ~ '^[A-Za-z0-9_-]{22}$')` (`20261007122858_room_lobby.sql:23`). Kod robi baza: `translate(encode(extensions.gen_random_bytes(16), 'base64'), '+/=', '-_')` w `create_room` (`20261031090821_player_color_choice.sql:142`); parametr `p_link_token` w `create_room` jest przyjmowany i pomijany (raport pomocnika bazy; `context/archive/2026-10-13-first-live-round/plan.md:62`).
- Odczyt kodu:
  - `room_link(p_link_token)` (`first_live_round.sql:384`): `unknown` dla złego formatu albo braku wiersza, `open`/`started` z `room_id`, `closed`. Nigdy nie redefiniowana (przeszukane wszystkie 11 migracji).
  - `join_room` (`player_color_choice.sql:165`): `select … where r.link_token = p_link_token for update` (`:189-192`), nieznany kod → `room_unknown`.
  - `request_join` (`latecomer_admission.sql:94`): nieznany kod → `room_unknown`.
  - Host czyta kod przez RLS (`select link_token from rooms`, `hostLinkToken`, `src/lib/rooms/server.ts:603-619`; polityka „Hosts read their rooms”, `20261007122858_room_lobby.sql:65`).
- Zmiana kodu: brak funkcji; `authenticated` nie ma `update` na `rooms` (raport pomocnika bazy: `first_live_round.sql:36-37`). Każdy ruch prowadzącego blokuje najpierw wiersz pokoju `for update` po `id`; `join_room` i `request_join` blokują go po `link_token`. Wejście czekające na blokadę starym kodem po wymianie powinno dostać `room_unknown` (Postgres w READ COMMITTED sprawdza `where` ponownie na nowej wersji wiersza). To wniosek, niesprawdzony testem.
- Strona `/j/[token]` (`src/pages/j/[token].astro:31-59`): `unknown` → 404 „Nie znamy tego linku.” / „Sprawdź, czy skopiował się cały.” (`:92`), `closed` → 410 „Ta gra już się skończyła.” / „Poproś hosta o nowy link.” (`:121`). Stary, wymieniony kod trafi do `unknown`. Tekst „Sprawdź, czy skopiował się cały.” mówi nieprawdę osobie ze starym linkiem z Discorda; rozróżnienie „stary link” od „literówki” wymagałoby pamiętania starych kodów w bazie.
- Gdzie widać link: tylko host, tylko w poczekalni (`src/pages/r/[id].astro:42-48`, komentarz: „During a game the same link still works: a latecomer asks there”). `RoomLobby` pokazuje pole z „Kopiuj” dla `isHost` (raport pomocnika: `src/components/room/RoomLobby.tsx:165-192`). `linkUrl` nie jest w `RoomView` ani w odpowiedzi `GET …/lobby`; `room_lobby` celowo nie zwraca kodu linku (komentarz „no ids, hashes or link code”, `player_color_choice.sql:394`). Po wymianie przez współhosta otwarta karta hosta nie dostanie nowego linku bez zmiany tej ścieżki.
- Keep-awake: `POST /rest/v1/rpc/room_link {p_link_token: "keep-awake-ping-000000"}`, sukces tylko przy 200 i `status === "unknown"` (`scripts/keep-supabase-awake.mjs:74`). Wymiana linku nie zmienia `room_link`, więc skrypt zostaje bez zmian, o ile S-09 nie przerobi tej funkcji.

### Wszystko, co wskazuje na gracza

| miejsce                          | kształt                                                                                          | gdy wiersz `players` zniknie dziś                                                                                                                    |
| -------------------------------- | ------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| `public.player_secrets`          | FK on delete cascade (`room_lobby.sql:49-52`)                                                    | hash znika, token nic nie otwiera                                                                                                                    |
| `private.round_results`          | FK on delete cascade (`first_live_round.sql:130-135`)                                            | jego wiersze znikają z odsłon poprzednich rund i z `game_totals` (podsumowanie łączy z `players`, `player_color_choice.sql:413`, blok `game_totals`) |
| `private.rounds.eligible uuid[]` | migawka przy otwarciu rundy, bez FK (`first_live_round.sql:120`)                                 | id zostaje; `cardinality(eligible)` się nie zmienia                                                                                                  |
| `private.round_voters`           | unlogged, celowo bez FK (`first_live_round.sql:147-153`)                                         | wiersz zostaje i liczy się do progu odsłony; z listy „zagłosowali” znika, bo `room_lobby` łączy z `players`                                          |
| `private.ballot_boxes.tally`     | unlogged, klucz = id celu (`first_live_round.sql:141-145`)                                       | jego klucz zostaje; `finish_round` go pomija                                                                                                         |
| `private.round_reactions`        | unlogged, bez FK (`question_play_data.sql:86-92`)                                                | kciuk zostaje i liczy się przy zsypie                                                                                                                |
| `public.join_requests`           | brak `player_id`; `admit_latecomer` kasuje prośbę po wpuszczeniu (`player_color_choice.sql:308`) | bez wpływu                                                                                                                                           |
| `players.seat`, `players.color`  | `max(seat)+1`, `free_color` przy wejściu (`player_color_choice.sql:291-292`)                     | dziura w miejscach bez skutków; kolor usuniętego wraca do puli, kolory pozostałych bez zmian                                                         |

- `room_lobby` (`player_color_choice.sql:413`) buduje `eligible` i `voted` złączeniem z `players` (blok „Who may vote and who has voted”), więc usunięty znika z obu list na ekranie; wynik rundy (`round_results join players`) też.
- `private.question_stats` nie wskazuje gracza; `finish_round` dopisuje `cardinality(r.eligible)` (`question_play_data.sql:193-196`), więc migawka `eligible` decyduje, ilu uprawnionych trafi do danych o pytaniu.

### Runda w trakcie głosowania

- `cast_vote` (`round_number_required.sql:87`, próg `:214-220`): głosujący spoza `eligible` → `no_round`, cel spoza `players` ∩ `eligible` → `unknown_target`; po zapisie głosu, gdy `count(round_voters) >= cardinality(eligible)`, woła `private.finish_round`.
- `finish_round` (`question_play_data.sql:160-237`): `ballots = count(round_voters)`; `round_results` dla `players` złączonych z `eligible` (`:184-188`), więc głosy na kogoś, kogo nie ma w `players`, nie trafiają do wyniku; potem liczniki pytania i skasowanie urny (`:234-235`).
- Skutki usunięcia w trakcie głosowania (stan dzisiejszy, bez zmian w funkcjach):
  - nie głosował → zostaje w `eligible`, runda nie odsłoni się sama (ten sam objaw co host, który wyszedł, i spóźniony bez ciasteczka: `context/changes/co-host-role/plan.md:24`, `context/archive/2026-10-22-latecomer-admission/plan.md:40`);
  - głosował → jego `round_voters` liczy się do progu (spójnie z `cardinality(eligible)`), a jego głos zostaje u celu;
  - głosy na niego przepadają przy odsłonie.
- Wniosek do projektu: jeśli usunięty nie głosował, usunięcie powinno zdjąć go z `eligible` i sprawdzić próg odsłony w tej samej transakcji; jeśli głosował, zostawić `eligible` i `round_voters` bez zmian, żeby próg i `ballots` dalej się zgadzały (zdjęcie go z `eligible` przy pozostawionym `round_voters` odsłoniłoby rundę o jeden głos za wcześnie). Nic z tego nie wymaga pary głosujący→cel: funkcja patrzy tylko na to, czy jego id jest w `round_voters`, czyli na publiczną listę „kto już zagłosował”.

### Ruch prowadzącego: wzór

- `private.leader_refusal(p_room_id, p_host, p_player_token)` (`co_host_role.sql:59`): zły token → 22023; brak pokoju → `room_unknown`; host po `auth.uid()` → zgoda; gość po hashu: brak → `room_unknown`, bez roli → `not_leader`, współhost → zgoda.
- `reject_latecomer(p_room_id, p_nick, p_player_token default null)` (`co_host_role.sql:548`): blokada pokoju, `leader_refusal`, `room_closed`, wyszukanie po nicku; `security definer`, właściciel `postgres` (`:909`), `revoke` (`:922`) i `grant … to anon, authenticated` (`:934`). Gościa po nicku szuka `set_cohost` (`co_host_role.sql:595`): `p.user_id is null and p.nick_key = private.nick_key(p_nick)`, czyli hosta z definicji nie znajdzie.
- Trasa: `src/pages/api/rooms/[id]/reject.ts` (raport pomocnika: `:355-381`): `refuseForeignPost`, `UUID_PATTERN`, `bodyNick`, ciasteczko albo sesja, wrapper w `server.ts`, `ringLobby` po sukcesie, `actionAnswer` (`room_unknown` 404, `invalid_body` 400, reszta odmów 409). Nowa odmowa wymaga wpisu w `ROUND_REFUSALS` i `MESSAGES` (`src/lib/rooms/errors.ts:12-34`, `:42-85`) oraz ręcznie w `PLANNED_ROUND_REFUSALS` (`tests/unit/room-errors.test.ts:33-55`).
- Przycisk: wiersz listy „Gracze” w poczekalni (`RoomLobby.tsx:250`, `:282-290`) i w grze (`RoundVoting.tsx:226`, `:264-272`) ma już `CohostButton` dla hosta; dwuklik z „Anuluj” jest w `HostActions.tsx` (`confirmText`, `:24`, `:37`, `:119`), ale jako pasek przycisków, nie wiersz.

### Testy i strażnicy, których dotknie zmiana

- `tests/unit/room-rpc-gate.test.ts`: wiersz `SQL_SIGNATURES` dla nowej funkcji (wzór `set_cohost` `:127`) i przypadek ruchu (`:378-386`), w tej samej zmianie co migracja (`context/foundation/test-plan.md` §6.1).
- pgTAP `supabase/tests/round_creator_view.test.sql`: `select plan(291)` (`:51`); fakty funkcji (właściciel, `search_path`, granty, jedna wersja) w stylu sekcji współhosta (raport pomocnika bazy: `:1223-1280`).
- Testy bazy: wzory `tests/db/cohost.test.ts` i `tests/db/player-colors.test.ts`; limit 30 rejestracji na 5 minut w lokalnym Supabase (test-plan §6.2).
- Smoke: `act(action, body, jar)`, dziś „Razem 86 kroków” (`context/foundation/test-plan.md:318`); usunięty gracz potrzebuje własnego słoika ciasteczek, żeby sprawdzić 404 po usunięciu.
- E2E: wzory `cohost.spec.ts`, `latecomer.spec.ts`, reguła „Bell vs poll” (test-plan §6.4).
- Podglądy: nowy stan pokoju → `/dev/room-states`; zmiana okna (link u hosta w grze) → `/dev/room-window` (AGENTS.md, UI).

## Code References

- `supabase/migrations/20261007122858_room_lobby.sql:22-23` — `link_token`, komentarz o S-09
- `supabase/migrations/20261007122858_room_lobby.sql:49-52` — `player_secrets`, kaskada z `players`
- `supabase/migrations/20261014101922_first_live_round.sql:121-153` — `rounds.eligible`, `round_results` (FK cascade), `ballot_boxes`, `round_voters` (bez FK)
- `supabase/migrations/20261014101922_first_live_round.sql:384` — `room_link`
- `supabase/migrations/20261020205751_round_number_required.sql:87` — `cast_vote`, odsłona po ostatnim uprawnionym
- `supabase/migrations/20261022132240_latecomer_admission.sql:94` — `request_join`
- `supabase/migrations/20261026074427_question_play_data.sql:160-238` — `finish_round`; `:243` `drop_round_state`
- `supabase/migrations/20261027121442_co_host_role.sql:59` — `leader_refusal`; `:548` `reject_latecomer`; `:595` `set_cohost`
- `supabase/migrations/20261031090821_player_color_choice.sql:142` — generowanie kodu linku; `:165` `join_room`; `:247` `admit_latecomer`; `:413` `room_lobby`
- `src/pages/r/[id].astro:28-49`, `:67` — rozpoznanie gracza, link tylko u hosta w poczekalni, ekran „Nie jesteś w tym pokoju.”
- `src/pages/j/[token].astro:31-59`, `:92`, `:121` — rozpoznanie kodu, teksty dla nieznanego i zamkniętego linku
- `src/lib/rooms/server.ts:226-244` — `roomLobby`; `:603-619` `hostLinkToken`
- `src/components/room/useRoomState.ts:53-55`, `:190-210` — 404 → jedno przeładowanie
- `src/lib/rooms/errors.ts:50-51`, `:79-81` — `room_closed`, `room_unknown`, `not_leader`, `player_unknown`
- `scripts/keep-supabase-awake.mjs:74` — oczekiwane `status: "unknown"`
- `tests/unit/room-rpc-gate.test.ts:46`, `:127` — `SQL_SIGNATURES` (`room_link`, `set_cohost`)

## Architecture Insights

- Link jest osobnym bytem od pokoju od pierwszej migracji, więc wymiana to jedna kolumna jednego wiersza pod blokadą pokoju; pokój, kanał, gracze, tokeny i kolory zostają (`room_lobby.sql:22`; `context/archive/2026-10-07-room-lobby/plan.md:87`).
- Twarde usunięcie wiersza `players` zgadza się z resztą modelu: token umiera przez kaskadę, nick i kolor wracają do puli, a wynik i stan pokoju już dziś złączają z `players`. Miękkie oznaczenie („usunięty”) wymagałoby filtra w każdej funkcji, która czyta `players` (wejście, unikalność nicka, `free_color`, `leader_refusal`, `cast_vote`, `react_round`, `room_lobby`, migawka `eligible` w `start_game` i `open_next_round`); pominięty filtr = usunięty, który dalej głosuje.
- Tabele urny są celowo bez kluczy obcych (blokada wiersza gracza zdradzałaby głosującego, `first_live_round.sql:147-148`), więc ich sprzątanie przy usunięciu musi zrobić sama nowa funkcja.
- Kontrola „wszystko przed pierwszym zapisem” jest konwencją, nie mechanizmem (`context/domain/02-invariant-aggregate-refactor.md:253`): nowa funkcja z kilkoma zapisami (gracz, urna, link) powinna sprawdzić wszystkie odmowy przed pierwszym.

## Historical Context (from prior changes)

- `context/archive/2026-10-07-room-lobby/plan.md:87`, `plan-brief.md:41` — link osobny od pokoju i kanału, „S-09 wymieni link bez zmiany pokoju” (nadal prawda: kod potwierdza `room_lobby.sql:22`).
- `context/archive/2026-10-07-room-lobby/plan-brief.md:94` — do S-09 jedynym lekarstwem na wyciek linku jest „Nowa gra” (nadal prawda).
- `context/archive/2026-10-21-keep-supabase-awake/plan.md:13`, `:99` — ping `room_link` oczekuje `unknown` (nadal prawda, `scripts/keep-supabase-awake.mjs:74`).
- `context/changes/co-host-role/plan.md:24`, `:38` — „Host, który wyszedł, dalej jest uprawniony do głosu … To zostaje do S-09”; `research.md:246` (decyzja 6 Karola).
- `context/changes/co-host-role/plan.md:39`, `reviews/plan-review.md` F4 — „Nowa gra” hosta zamyka wieczór prowadzony przez współhosta; „do S-09 albo później”.
- `context/changes/co-host-role/research.md:240` — link dla graczy widać tylko w poczekalni i tylko u hosta (nadal prawda, `src/pages/r/[id].astro:42-48`).
- `context/archive/2026-10-25-player-colors/plan.md:48` — stary kolor z pozycji zakładał, że nikt nie znika; od S-18 kolor jest zapisany (`players.color`), więc usunięcie nie zmienia kolorów pozostałych (`context/domain/glossary.md:48`).
- `context/archive/2026-10-22-latecomer-admission/plan.md:40` — gracz bez ciasteczka wraca nowym nickiem, stary nick blokuje odsłonę do ręcznej; ten sam objaw ma usunięty, który nie głosował.
- `context/domain/02-invariant-aggregate-refactor.md:131` (N2) — każda ścieżka końca rundy potrzebuje testu „urna pusta”; `:757` — „głosy usuniętego gracza (S-09, OQ3)” jako znana luka.

## Related Research

- `context/changes/co-host-role/research.md` — rola prowadzącego, `leader_refusal`, link tylko u hosta.
- `context/changes/player-color-choice/research.md` — zapisany kolor, `free_color`, miejsca.
- `context/archive/2026-10-22-latecomer-admission/research.md` — migawka `eligible`, prośby o wejście.

## Open Questions

- Zachowanie wejścia czekającego na blokadę pokoju starym kodem w chwili wymiany (oczekiwane `room_unknown`) — do sprawdzenia testem bazy w planie.
- Odczyt `ballots` na ekranie odsłony po usunięciu kogoś w fazie odsłony: wynik traci jego wiersz (kaskada), `rounds.ballots` zostaje; czy ekran pokazuje sumę, która się wtedy nie zgodzi, nie sprawdziłem (`RoundReveal.tsx` nieprzeczytany w całości).
- Decyzje produktowe 1–8 rozstrzygnięte (sekcja niżej).

## Decyzje do planu

### Produktowe (Karol, 2026-10-31: „rekomendacja jest ok i poza tym wszystkie punkty są spoko”; punkt 5 zmieniony po jego pytaniu)

1. **Głosy przy usunięciu w trakcie głosowania (Open Roadmap Question 3).** Głosy na usuniętego przepadają (odsłona bez niego). Głos oddany przez niego zostaje policzony, bo gra nie wie, na kogo był (anonimowość). Jeśli jeszcze nie głosował, runda przestaje na niego czekać i odsłoni się sama, gdy zagłosuje reszta.
2. **Kogo wolno usunąć.** Host usuwa każdego gościa, także współhosta. Współhost usuwa gości bez roli (o współhostach decyduje tylko host, jak przy nadawaniu roli). Nikt nie usuwa hosta ani siebie.
3. **Potwierdzenie.** Tak: „Usuń” → „Na pewno usunąć <nick>?” + „Anuluj”, jak przy „Zakończ grę”.
4. **Ślad usuniętego.** Znika ze wszystkiego: z listy „Gracze”, z wyników poprzednich rund i z podsumowania wieczoru (kaskada, którą baza już ma). Zachowanie go w starych wynikach wymagałoby miękkiego usuwania w kilkunastu funkcjach.
5. **Link dla graczy u prowadzących, także w trakcie gry.** Host i współhost widzą link dla graczy w poczekalni i w trakcie gry (dziś tylko host w poczekalni), żeby po usunięciu wkleić nowy na Discorda. Zmienia decyzję 4 z S-07 („link dla graczy zostaje tylko u hosta”, `context/changes/co-host-role/research.md`, „Decyzje do planu”): gdy współhost usunie kogoś pod nieobecność hosta, bez tego nikt nie zna nowego linku, a stary już nie działa. Link nie jest tajemnicą przed graczami (każdy w pokoju nim wszedł). Do poprawy w tej zmianie: dopisek S-07 w PRD (`context/foundation/prd.md:170`, „link dla graczy widzi tylko host”), tabela Access Control (`:181`, wiersz „link dla graczy w poczekalni”), słownik (`glossary.md:41`, „nie widzi … linku dla graczy”). Wygląd na zrzutach.
6. **Powrót usuniętego.** Może wrócić tylko nowym linkiem: w poczekalni sam, w trakcie gry przez prośbę i „Wpuść”. Bez banów (PRD Non-Goals).
7. **Co widzi usunięty i ktoś ze starym linkiem.** Usunięty: istniejący ekran „Nie jesteś w tym pokoju. Poproś hosta o link.”. Stary link: tekst nieznanego linku zmieniony na prawdziwy dla obu przypadków, np. „Ten link nie działa.” / „Sprawdź, czy skopiował się cały, albo poproś hosta o nowy.”. Ostateczne teksty na zrzutach.
8. **Dwie sprawy odłożone z S-07 zostają poza S-09.** Host, który wyszedł, dalej blokuje samą odsłonę (współhost klika „Odsłoń wynik”, działa od S-07); „Nowa gra” hosta dalej zamyka wieczór współhosta. Żadna nie jest częścią FR-004.

### Projekt techniczny (wniosek z badania; do potwierdzenia w planie)

- Jedna migracja: `public.remove_player(p_room_id uuid, p_nick text, p_player_token text default null)`, `security definer`, `set search_path = ''`, właściciel `postgres`, `grant execute … to anon, authenticated` (wzór `reject_latecomer`). Kolejność: blokada pokoju `for update` → `leader_refusal` → `room_closed` → wyszukanie gościa po `nick_key` z `user_id is null` (host nieosiągalny) → odmowy (`player_unknown`; współhost usuwający współhosta albo siebie: odmowa, kod do ustalenia w planie) → dopiero potem zapisy.
- Zapisy w tej samej transakcji: (a) runda w głosowaniu: jeśli usunięty nie jest w `round_voters`, `eligible = array_remove(eligible, id)` i usunięcie jego klucza z `tally`; potem próg odsłony jak w `cast_vote` (`finish_round`, gdy `count(round_voters) >= cardinality(eligible)`; `eligible` ma `check cardinality >= 1`, ale host jest w każdej migawce, bo migawka obejmuje wszystkich graczy pokoju przy otwarciu rundy, a hosta usunąć nie można, więc tablica nie spadnie do zera: `array_agg(p.id order by p.seat)` po wszystkich `players` pokoju w `start_game` (`co_host_role.sql:164`) i w obu miejscach `question_list_review.sql:453-455`, `:527-529`); (b) jego kciuk z `round_reactions` (nic po nieistniejącym graczu); (c) `delete from public.players` (kaskada: `player_secrets`, `round_results`); (d) nowy `link_token` generowany w bazie tak jak w `create_room`. Odpowiedź `{ok: true}`, bez nowego kodu i bez czegokolwiek o głosach.
- Worker: trasa `POST /api/rooms/[id]/remove` (wzór `reject.ts`), wrapper w `server.ts`, `ringLobby` po sukcesie, wpis w `room-actions.ts`, `SQL_SIGNATURES`, nowe kody odmów w `errors.ts`.
- Link u prowadzących w stanie pokoju (decyzja 5): współhost nie ma sesji, więc nie przeczyta `rooms.link_token` przez RLS jak host (`hostLinkToken`). Rekomendacja: `room_lobby` zwraca kod linku tylko prowadzącemu, na wzór `leader_draw` (klucz tylko dla prowadzących, który Worker zamienia na `linkUrl` w `RoomView`, a zwykły gość dostaje `null`); `/r/[id]` i `GET …/lobby` biorą link ze stanu zamiast stałego propa, w poczekalni i w grze. Dzięki temu wymiana przez jednego prowadzącego dociera do karty drugiego dzwonkiem. Zmienia komentarz „no … link code” w `room_lobby` (`player_color_choice.sql:394`) i dokładne zestawy kluczy w testach stanu pokoju (test-plan §6.3). Alternatywa: osobna funkcja `leader_link` = jedno wywołanie RPC więcej na każde odświeżenie prowadzącego.
- Testy: `tests/db/remove-player.test.ts` (wzór `cohost.test.ts`: odmowy z argumentami, które przepuszczone coś by zmieniły; reguła 1 w trzech wariantach: nie głosował → odsłona sama, głosował → wynik z jego głosem, głosy na niego → przepadają; pozostali dalej w pokoju; stary kod `unknown`, nowy `open`/`started`; urna pusta po odsłonie), pgTAP (fakty funkcji, plan 291 → więcej), smoke (host usuwa gościa, 404 u usuniętego, 200 u pozostałego, stary link 404, nowy link działa, `player_unknown` przy drugim usunięciu, współhost bez prawa do współhosta), e2e (usunięcie w trakcie głosowania, „Bell vs poll” dla ekranu usuniętego). Próbny alarm wg test-plan §6.2.
