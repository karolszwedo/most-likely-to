---
date: 2026-10-20T09:51:15+02:00
researcher: Claude (Opus 5.5)
git_commit: 06b025d
branch: main
repository: CharlesOnTheWave/most-likely-to
topic: "Przepływ gościa od linku do głosu: tożsamość gracza, głos, dzwonek (Deep Focus z mapą jako priorem)"
tags: [research, guest-join, round, live-sync, rooms-server, sql, s-04]
status: complete
last_updated: 2026-10-20
last_updated_by: Claude (Opus 5.5)
last_updated_note: "Twierdzenia strukturalne sprawdzone ast-grep 0.51.0 (TS/TSX/JS) i grepem (SQL, .astro, każde zero); wyniki w sekcji „Weryfikacja ast-grep”, poprawki w D1, D3, D7, krokach 21-22 i tabeli priorów."
---

# Research: przepływ gościa od linku do głosu

**Date**: 2026-10-20T09:51:15+02:00
**Researcher**: Claude (Opus 5.5)
**Git Commit**: 06b025d (lokalny, jeszcze nie na `origin`; kotwice to `plik:linia`, bez permalinków)
**Branch**: main
**Repository**: CharlesOnTheWave/most-likely-to

Etykiety: **[E]** evidence (widać w kodzie albo w historii git), **[I]** inference (wniosek), **[U]** unknown (biała plama).
Niczego nie uruchamiano: testy db, pgTAP, e2e i smoke chodzą w CI, więc ich pokrycie oceniono z czytania testów.

## Research Question

Jak gość z `/j/<token>` dostaje tożsamość gracza (nick + sekret) i jak ta tożsamość wraca przy głosie (`cast_vote`),
razem z dzwonkiem Realtime? Trzy wymiary: trace end-to-end, luki w testach, blast radius. Mapa
`context/map/repo-map.md` (stan na `785f859`, kod od tamtej pory bez zmian) jest priorem do sprawdzenia: strefa
ryzyka 2, obserwacja „round”, „Pierwszy dzień” pkt 2, 3, 5, 8, „Ograniczenia” niewiadome 1, 2, 3, 6. Wejście do planu
S-04 „Powrót po odświeżeniu”. Tylko stan obecny, bez propozycji refaktoru.

## Summary

- **Przepływ ma cztery przystanki:** strona linku (`room_link`) → POST nicku (`join_room`: wiersz w `players` i hash
  sha256 sekretu w `player_secrets`, surowy sekret w ciasteczku `mlt_player_<roomId>` na 24 h) → ekran pokoju
  (`room_lobby` rozpoznaje gościa po `sha256(token)`) → głos (`cast_vote`: głosujący do `private.round_voters` bez
  celu, cel do `private.ballot_boxes` bez głosującego; ostatni uprawniony głos odsłania rundę w tej samej transakcji).
  Dzwonek niesie `{seq}` (`src/lib/live-sync/server.ts:16`), a odbiorca w `useRoomState.ts:286-288` go nie czyta; w
  sprawdzonym kliencie stan przychodzi z `/api/rooms/<id>/lobby` (`useRoomState.ts:183`). [E]
- **Pod S-04, stan dziś:** po odświeżeniu gość wraca na swój nick (ciasteczko, `me`) i ekran wie, że już zagłosował
  (`me_voted`), ale **nie wie, na kogo**: wybór żyje w stanie Reacta (`RoundVoting.tsx:16-17`, `:95`), a baza z założenia
  nie trzyma pary głosujący↔cel. Utrata ciasteczka zamyka drogę do własnego nicku (`nick_taken`). [E]
- **Najgroźniejszy dług jest cichy:** połączenie Worker↔SQL to nazwy RPC, argumenty `p_*`, kody odmów i wzorce tokenów
  kopiowane ręcznie po obu stronach, bez wygenerowanych typów bazy. Testy db wołają **własne kopie** nazw, więc job `db`
  może być zielony przy zepsutym Workerze; taki rozjazd łapią smoke i e2e w CI, w czasie działania. Nowy kod odmowy i
  kopię dzwonka w sondzie nie łapie nic. [E/I]
- **Tanie sprzężenia** (sygnatura i granty `cast_vote`, tabele `private`, zbiory kluczy `room_lobby`, typy TS, pola logu)
  pilnują pgTAP, `tests/db`, `astro check` i `log.test.ts`. [E]
- **Korekty mapy:** `announce.ts` nie jest nadawcą dzwonka (to teksty dla czytnika ekranu); połączenie TS↔SQL pilnuje
  także smoke, nie tylko e2e; kopii nazw RPC jest więcej niż w `tests/db/support/`; „14 wejść przez `ringRoom`” to
  zasięg w grafie importów, a dzwoni 9 miejsc (8× `ringLobby` w trasach pokoju + `ringRoom` w
  `src/pages/api/live-sync/ring.ts:24`). Szczegóły: „Priory z mapy” i „Weryfikacja ast-grep”.
- **Weryfikacja ast-grep:** 22 twierdzenia strukturalne: 16 potwierdzonych, 6 doprecyzowanych, 0 obalonych. Nowe:
  kod odmowy `not_signed_in` z SQL nie ma komunikatu w `errors.ts` (żywy przykład D3, na ścieżce Workera nieosiągalny).

## Feature overview

### Przepływ krok po kroku

**A. Otwarcie `/j/<token>`**

1. `src/pages/j/[token].astro:26` sprawdza token wzorcem `LINK_TOKEN_PATTERN` (22 znaki base64url, `src/lib/rooms/tokens.ts:6`); zły wzorzec → 404. [E]
2. `:30` → `roomLink` (`src/lib/rooms/server.ts:136-150`) → RPC `"room_link"` (`:137`); SQL `supabase/migrations/20261014101922_first_live_round.sql:384-418` (`stable`, bez zapisu) zwraca `{status: open|started, room_id}` albo `{status: closed|unknown}`. [E]
3. `:36-41`: przy sesji albo ciasteczku `mlt_player_<roomId>` strona woła `roomLobby`; jeśli osoba już jest w pokoju → 302 na `/r/<id>` (`:48-50`). [E]
4. W pozostałych przypadkach `started` → 409, `closed` → 410, `open` → `JoinForm` (`:67-71`); `?error=` zamienia się na tekst przez mapę kodów (`:60`, `src/lib/rooms/errors.ts:47-50`). [E]
5. `src/components/room/JoinForm.tsx:53-54`: zwykły POST na `/api/rooms/join` z ukrytym polem `link`; długość nicku sprawdza też klient (`:26-31`). [E]

**B. Wysłanie nicku**

6. `src/pages/api/rooms/join.ts:11-16`: zły `link` → 302 `/j/invalid`. `:24-27`: drugie `roomLink`; closed/unknown → 302 `/j/<link>?error=<kod>`. [E]
7. `:32-37`: kto już jest w pokoju (ciasteczko albo sesja), wraca na `/r/<id>` bez drugiego wpisu; `:41`: gra w toku → `game_started`. [E]
8. `:43`: `newPlayerToken()` (`tokens.ts:26-29`): 32 losowe bajty → 43 znaki base64url. [E]
9. `:44-48` → `joinRoom` (`server.ts:152-169`) → RPC `"join_room"` z `p_link_token`, `p_nick`, `p_player_token`, POST-em (`server.ts:80-89`); argumentów nie loguje `server.ts:55-63`. [E]
10. **SQL `join_room`**, aktualna definicja `first_live_round.sql:308-381` (`full_game_evening.sql` jej nie redefiniuje), `security definer`, grant dla `anon, authenticated` (`first_live_round.sql:800`): [E]
    - zły format tokenu → `raise` 22023 (`:322-324`); pokój `for update` (`:332-335`), bez zapisu do `rooms`;
    - odmowy `room_unknown`, `game_started` (`:342`), `room_closed` (`:346`), `invalid_nick` (`:351-359`);
    - zapis 1: `insert public.players(room_id, nick, seat)` (`:362-366`); naruszenie `players_room_nick_key` (`(room_id, nick_key)`, `:106-107`) → `nick_taken`;
    - zapis 2: `insert public.player_secrets(player_id, token_hash = sha256(...))` (`:376-377`), tabela bez grantów i polityk (`20261007122858_room_lobby.sql:47-52`);
    - zwraca `{ok:true, room_id}` (`:379`); do `private.*` nic nie pisze.
11. `join.ts:53` ustawia ciasteczko `mlt_player_<roomId>` (`tokens.ts:31-33`): wartość to surowy token; `httpOnly`, `sameSite=lax`, `path=/`, `maxAge` 24 h, `secure` na https (`tokens.ts:35-45`). `:55` dzwonek, `:56` 302 na `/r/<roomId>`. [E]

**C. Ekran pokoju**

12. `src/pages/r/[id].astro:24` sprawdza UUID, `:28` czyta ciasteczko, `:29` → `roomLobby` → RPC `"room_lobby"` (`server.ts:177-182`). SQL `20261015122252_full_game_evening.sql:403-519`: host po `auth.uid()` (`:433-437`), gość po `sha256(token)` złączonym z graczami tego pokoju (`:438-447`), inaczej `null` → 404 „Nie jesteś w tym pokoju” (`r/[id].astro:31-39`). [E]
13. Odpowiedź: `{status, role, me, players[{nick,host}], round}`; w głosowaniu runda ma `voted` (nicki w kolejności miejsc), `me_voted`, `after_skip` (`full_game_evening.sql:461-480`); po odsłonie liczby głosów na nick, `abstained`, `ballots` (`:484-501`). [E]
14. `parseLobbyState` (`src/lib/rooms/shared.ts:166-185`) kopiuje wyłącznie klucze kontraktu (komentarz `shared.ts:119-121`); `roomView` (`server.ts:196-205`) dokłada tekst pytania. [E]
15. `src/components/room/useRoomState.ts:183`: `GET /api/rooms/<id>/lobby` po każdym dzwonku, po (re)subskrypcji, po powrocie do karty i cyklicznie (`:236-245`, `:41`); `src/pages/api/rooms/[id]/lobby.ts:26-43` robi to samo co strona. 404 w kliencie → jednorazowe przeładowanie z flagą w sessionStorage (`useRoomState.ts:96-106`, `:169-177`). [E]

**D. Głos**

16. `RoundVoting.tsx:118-127` → `RoomScreen.tsx:124` (`act("vote", {target, round})`) → `room-actions.ts:29-37` → `POST /api/rooms/<id>/vote`. [E]
17. `src/pages/api/rooms/[id]/vote.ts`: Content-Type i Origin (`:25-26`, `json-route.ts:30-41`), UUID (`:29`), treść ≤ 4096 B (`json-route.ts:74-103`), `target` string|null i `round` całkowity (`:10-16`, `:33-37`), ciasteczko liczone, gdy pasuje do `PLAYER_TOKEN_PATTERN`, bez sesji i ciasteczka → 404 (`:40-42`). [E]
18. `:47` → `castVote` (`server.ts:243-257`) → RPC `"cast_vote"` (`p_room_id, p_target, p_player_token, p_round`, `:253`). [E]
19. **SQL `cast_vote`**: `drop` starej wersji (`full_game_evening.sql:248`), `create function` z `(uuid,text,text,integer)` (`:255-392`), grant dla `anon, authenticated` (`:542`): [E]
    - głosujący jak w `room_lobby` (`:294-303`); pokój `for update` (`:285-288`);
    - odmowy `room_unknown`, `room_closed`, `no_round`, `round_over`, `round_revealed`, `already_voted`, `unknown_target` (`:290-361`);
    - zapis: `private.round_voters(round_id, player_id)` bez celu (`:363`); `private.ballot_boxes`: `tally` (cel → licznik) albo `abstained + 1`, bez głosującego (`:367-379`); obie tabele `unlogged` (`first_live_round.sql:141`, `:149`);
    - gdy liczba głosujących osiągnie liczbę uprawnionych → `private.finish_round` w tej samej transakcji (`full_game_evening.sql:381-388`): liczby do `round_results`, `phase='revealed'`, kasowanie wierszy obu tabel urny (`first_live_round.sql:182-213`);
    - zwraca `{ok:true}` (`full_game_evening.sql:390`).
20. Dzwonek przy `ok` (`vote.ts:48`); `actionAnswer` loguje `{op, outcome, roomId, status}` (`json-route.ts:130-138`). Klient trzyma `myVote` w stanie (`RoundVoting.tsx:110-113`) i pokazuje „Twój głos: X” (`:169`). [E]

**E. Dzwonek Realtime**

21. `ringLobby` (`server.ts:368-381`) → `ringRoom` (`src/lib/live-sync/server.ts:12-32`) → `httpSend(BELL_EVENT, {seq})` na temat `live-sync:<roomId>` (`src/lib/live-sync/shared.ts:3-4`, `:20-22`). Ładunek to `{seq}`, bez danych gracza i głosu. `ringLobby` wołają 8 tras pokoju (`api/rooms/index.ts:51`, `join.ts:55`, `[id]/{end:25,next:39,reveal:23,skip:38,start:33,vote:48}`), z czego 6 pod `if (result.ok)`; drugim wywołującym `ringRoom` jest endpoint sondy F-01 `src/pages/api/live-sync/ring.ts:24` (tylko zalogowany, `:8-10`). [E, ast-grep]
22. Odbiorca `useRoomState.ts:286-288` woła `limiter.bell()` i nie czyta ładunku. `src/lib/rooms/announce.ts` to teksty aria-live (`announce.ts:1-34`, `RoomScreen.tsx:85-96`), nie Realtime. [E]

### Diagram

```mermaid
sequenceDiagram
  participant B as Przeglądarka gościa
  participant W as Worker (Astro)
  participant DB as Supabase SQL
  participant RT as Realtime
  B->>W: GET /j/<token>
  W->>DB: room_link(token)
  DB-->>W: {status, room_id}
  W-->>B: JoinForm (albo 302/404/409/410)
  B->>W: POST /api/rooms/join {link, nick}
  W->>DB: room_link, [room_lobby gdy ciasteczko/sesja]
  W->>DB: join_room(link, nick, token)
  DB->>DB: lock rooms, INSERT players, INSERT player_secrets(sha256)
  DB-->>W: {ok, room_id} | {ok:false, reason}
  W->>RT: httpSend bell {seq}
  W-->>B: Set-Cookie mlt_player_<id>; 302 /r/<id>
  B->>W: GET /r/<id> (ciasteczko)
  W->>DB: room_lobby(id, token)
  DB-->>W: {status, role, me, players, round}
  W-->>B: RoomScreen(initial, realtime)
  B->>RT: subscribe live-sync:<id>
  B->>W: POST /api/rooms/<id>/vote {target, round}
  W->>DB: cast_vote(id, target, token, round)
  DB->>DB: lock rooms, INSERT round_voters, UPDATE ballot_boxes, [ostatni głos: finish_round]
  DB-->>W: {ok:true}
  W->>RT: httpSend bell {seq}
  W-->>B: 200 {ok:true}
  RT-->>B: bell (pozostałe ekrany)
  B->>W: GET /api/rooms/<id>/lobby
```

### Ścieżki błędów (sprawdzone na tej trasie) [E]

| Sytuacja | Wynik |
| --- | --- |
| zły format tokenu linku | `/j`: 404; POST: 302 `/j/invalid` |
| nieznany / zamknięty / rozpoczęty pokój | `/j`: 404 / 410 / 409; z POST: 302 `?error=room_unknown\|room_closed\|game_started` |
| zajęty / zły nick | 302 `/j/<link>?error=nick_taken\|invalid_nick`, komunikat z `errors.ts:23-25` |
| brak lub zły sekret | `/r`: 404; `/lobby`: 404 `not_found`; `vote`: 404 `not_found` (`json-route.ts:119`, `:137`) |
| głos poza rundą | 409 `no_round` / `round_over` / `round_revealed` / `room_closed` |
| podwójny głos | 409 `already_voted`; w SQL dodatkowo klucz główny `round_voters`; w kliencie blokada `voting` (`RoundVoting.tsx:125`) |
| zła treść / obcy POST | 400 `invalid_body`, 415, 403 |
| Supabase niedostępny / inna awaria | 503 `service_unavailable` / 500 `unexpected` |

[I] Wyjątek 22023 (zły format tokenu gracza w SQL) skończyłby się `unexpected` (`server.ts:61`); normalna trasa tu nie
trafia, bo token generuje serwer.

### Stan po odświeżeniu `/r/<id>` (wejście do S-04)

- **Tożsamość wraca** przez ciasteczko ważne 24 h; `room_lobby` zwraca `me` i `role='guest'`; ekran pokazuje
  „Jesteś w grze jako {me}” (`RoomLobby.tsx:88`) i plakietkę „ty” (`RoundVoting.tsx:183`, `:199`; `RoundReveal.tsx:210`). [E]
- **Ekran wie, że gość zagłosował**: `hasVoted = myVote !== null || round.me_voted` (`RoundVoting.tsx:100`), `me_voted`
  z `full_game_evening.sql:473-475`. [E]
- **Ekran nie wie, na kogo**: `myVote` żyje w stanie Reacta (`RoundVoting.tsx:95`); komentarz `:16-17` mówi, że S-04 ma
  to pokazać po przeładowaniu, i jednocześnie „never in storage, a cookie or the URL (AGENTS.md)”. `myVote` ginie też
  przy zmianie rundy (`key=round.number`, `RoomScreen.tsx:163`). [E]
- **Baza nie przechowuje celu przy głosującym** (`round_voters` bez celu, `ballot_boxes` bez głosującego, `room_lobby`
  zwraca `me_voted` jako bool). [E] Z bazy dzisiejszego celu nie da się odtworzyć. [I]
- **W przeglądarce głos nie jest zapisany**: w `src` jedyne użycie storage to flaga przeładowania
  (`useRoomState.ts:51`, `:96-114`; grep `localStorage|sessionStorage`). [E]
- **Utracone ciasteczko** (inna przeglądarka, wyczyszczone dane, po 24 h): `/r` → 404, ten sam nick w lobby →
  `nick_taken` (`errors.ts:24-25`), w trakcie gry `/j` → 409. Odzyskania miejsca w kodzie nie ma. [E]

### Para „kto na kogo”

- W tabelach i logach aplikacji nie występuje (zapis SQL wyżej; `server.ts:55-63`, `json-route.ts:126-138`,
  `src/lib/log.ts` lista pól). [E]
- Istnieje w locie: w pamięci przeglądarki, w jednym żądaniu POST (ciasteczko + `target`), w treści RPC
  Worker→PostgREST (`server.ts:253`) i w zmiennych `v_voter`/`v_target` transakcji `cast_vote`. [E]
- Czy logi żądań Supabase/PostgREST/Cloudflare zapisują treść żądań: [U]. Granicę przyjętego ryzyka opisuje `AGENTS.md`
  (Hard Rules, pierwszy punkt).

## Technical debt

### Dług prawdziwy (cichy, nic go nie pilnuje albo dopiero w CI w czasie działania)

| # | Co | Rodzaj sprzężenia | Co by to złapało | Etykieta |
| --- | --- | --- | --- | --- |
| D1 | Nazwy RPC i argumenty `p_*` jako stringi: 10 wywołań `callRpc` (początek wywołania `server.ts:115,137,156,177,235,250,261,274,291,302`; przy wywołaniach wielolinijkowych nazwa stoi w `:179`, `:252`, `:276`, `:293`), jedyne `.rpc(` w `src` to `server.ts:89` (ast-grep); kopie w testach: `join_room` (`tests/db/nicks.test.ts:40`, `roles.test.ts:299`, `support/rooms.ts:75`, `support/rounds.ts:143`, pgTAP `:127`), `room_link`, `room_lobby`, `cast_vote`, `reveal_round` podobnie | nazwa na dystansie TS↔SQL, bez typów bazy | job `db` testuje **własne kopie**, więc może być zielony przy literówce w `server.ts`; łapią smoke i e2e w CI; lokalnie nic | E (kopie), I (skutek) |
| D2 | Ręczne typy odpowiedzi (`server.ts:22-35`, `shared.ts:20-59`), walidacja w runtime; `parseLobbyState` celowo pomija klucze spoza kontraktu (`shared.ts:119-121`) | znaczenie/kształt na dystansie | zmiana nazwy lub brak pola → `unexpected` + log `step:"shape"` (`server.ts:101-104`), łapią smoke/e2e; **nowy** klucz z SQL znika po cichu (świadomie: ochrona przed wyciekiem liczby, decyzja D3 z `context/archive/2026-10-15-full-game-evening/research.md` wg komentarza) | E |
| D3 | Kody odmów: SQL ↔ `MESSAGES` w `errors.ts:22-49` ↔ ręczna lista w `tests/unit/room-errors.test.ts:21`; `refusal()` przepuszcza dowolny `reason` (`server.ts:107-109`) | znaczenie | nowy kod daje tekst ogólny (`errors.ts:49`) i nic tego nie sygnalizuje; smoke sprawdza `nick_taken` i `game_started`. Przykład z dziś: `not_signed_in` (`first_live_round.sql:240`, aktualne `create_room` z `:220`) nie ma klucza w `MESSAGES` (18 kluczy, `errors.ts:22`; pozostałe 17 kodów `'reason'` z migracji ma komunikat); na ścieżce Workera nieosiągalny, bo `api/rooms/index.ts:16` odrzuca brak sesji wcześniej [I] | E |
| D4 | Wzorce tokenów w kilku miejscach: gracz `{43}` w `tokens.ts:11` i SQL (`first_live_round.sql:322`, `full_game_evening.sql:279`, `:438`); link `{22}` w `tokens.ts:6`, SQL (`room_lobby.sql:23`, `first_live_round.sql:326`, `:395`) i `scripts/smoke.mjs:194-198`, `:245` | algorytm/wartość | smoke i e2e w CI, w runtime | E |
| D5 | Kopia kontraktu dzwonka w sondzie: `scripts/live-sync-probe.mjs:12-13` (`TOPIC_PREFIX`, `BELL_EVENT`) obok `src/lib/live-sync/shared.ts:3-4` | nazwa | nic: sondy nie ma w CI | E |
| D6 | Gałęzie awarii bez testu: `server.ts:57-104` (`service_unavailable`, `unexpected`, `catch` w `callRpc`), `vote.ts` 403/415/404, `join.ts:11-16` i `:20-25`, `useRoomState.ts` 404 → przeładowanie (`:96-106`) | luka testowa | brak testu | I (z czytania testów) |
| D7 | Zasada „wybór tylko w pamięci” (`RoundVoting.tsx:16-17`, `room-actions.ts:5-8`) bez strażnika: żaden test ani lint nie sprawdza, że głos nie trafia do storage, ciasteczka ani URL | znaczenie (reguła anonimowości po stronie klienta) | nic | E (brak w testach i lincie, grep; w `src` storage to wyłącznie `window.sessionStorage` w `useRoomState.ts:99,100,110`, `localStorage` 0 — ast-grep + grep) |
| D8 | Smoke w CI startuje Supabase bez Realtime (`.github/workflows/ci.yml:47`), więc dzwonek w smoke trafia najpewniej w ścieżkę błędu; działający dzwonek potwierdza e2e (Supabase z Realtime, `ci.yml:126-128`) | luka testowa | e2e | E (konfiguracja), I (skutek) |

Uwaga do „co by to złapało”: push na `main` wdraża na produkcję także przy czerwonym CI (`AGENTS.md`, Commands), więc
„łapane w CI” działa, dopóki zmiana idzie przez PR (`src/lib/rooms/`, `src/pages/api/rooms/`, `src/pages/j/`,
`src/pages/r/`, `supabase/migrations/` są na liście „tylko przez PR”).

### Dług tani (wygląda groźnie, ale CI albo typy go łapią)

- Sygnatura, granty i właściciel `cast_vote`, jedna jego wersja: pgTAP `supabase/tests/round_creator_view.test.sql:581`, `:586-595` (job `db`). [E]
- Tabele `private`: `unlogged`, bez grantów, poza publikacją, bez kolumn porządku; `round_results` bez głosującego: pgTAP `:476-537`. [E]
- Zbiory kluczy `room_lobby` w każdej fazie: `tests/db/round-anonymity.test.ts:128-167`, `:257`, `:266` (dokładne zbiory; zastrzeżenie: to ręczne kopie kluczy w `tests/db/support/rounds.ts:59-68`, więc pilnują, dopóki nikt nie zmieni ich razem z SQL). [E]
- Odpowiedź `cast_vote` dokładnie `{ok:true}`: `round-anonymity.test.ts:118-121` i `scripts/smoke.mjs:243-244`. [E]
- Eksporty `tokens.ts`, typy `RoomView`, `locals.user`: `astro check` i lint (job `ci`). [E]
- Pola logu: `tests/unit/log.test.ts:27-139` (lokalnie, `npm test`). [E]
- Migracje: reguła „nowa migracja zamiast edycji” pilnowana przez job `db` i pgTAP (prior z mapy, nie sprawdzano osobno). [I]

### Luki w testach na tej ścieżce (z czytania, [I] dla db/e2e/smoke)

- Pokryte: odsłona po ostatnim głosie (`tests/db/round-rules.test.ts:151-173`, pgTAP `:601-611`, `tests/e2e/round.spec.ts:50-74`, smoke `:274-279`); `nick_taken` (26 par w `tests/db/support/nick-pairs.ts`, smoke `:414-421`); tożsamość gościa z tokenu (`roles.test.ts:179-203`); `already_voted` w bazie (`round-rules.test.ts:124-129`); głos po odsłonie (`round-rules.test.ts:284-286`, smoke `:280-284`). [E]
- Częściowo: ciasteczko gracza (smoke `:403-407` sprawdza nazwę, atrybuty z `tokens.ts:37-45` nie są sprawdzane); `invalid_nick` tylko w bazie (`nicks.test.ts:100-141`); powrót na nick przez API lobby (smoke `:413`), strona `/r/` po przeładowaniu sprawdzana tylko na odsłonie (`tests/e2e/game.spec.ts:106-110`). [E]
- Brak: ekran po przeładowaniu w trakcie głosowania (`RoundVoting.tsx:100`); głos bez ciasteczka i ze zniekształconym ciasteczkiem przez HTTP; podwójny głos przez HTTP/UI; walidacja nicku w `JoinForm`; `cast_vote` w zamkniętym pokoju (`full_game_evening.sql:310-312`); utrata ciasteczka → `nick_taken`. [I]
- Na tej ścieżce nie ma aktywnego `test.fails`; mechanizm żyje w `tests/db/nicks.test.ts:79-80`, żadna para nie ma `knownHole: true`. [E]
- Strażnicy anonimowości lokalnie: `log.test.ts`, `room-state.test.ts:162-187`, `client-events.test.ts:61`; żaden nie dotyka SQL ani trasy `vote.ts`. Reszta (round-anonymity, pgTAP, smoke) chodzi w CI. [E]

### Historia zmian (co zmienia się razem)

- W 5 commitach z `git log -- src/lib/rooms/server.ts` (`8e76b01`, `2507462`, `b5a753e`, `90e3b7c`, `77860b8`) żaden
  nie zmienia pliku w `supabase/migrations/`. Sprzężenie TS↔SQL widać jako sekwencję faz jednej zmiany, np.
  `6dbfedd → 77860b8`, `4fedd34 → 90e3b7c → b5a753e`, `ecb290d → 2507462`; co-change liczony per commit tego nie
  widzi. [E: SHA; I: interpretacja]
- Ciasna para: `server.ts` ↔ `shared.ts` (4 z 5 commitów `server.ts`; piąty, `8e76b01`, zmienia komentarz). [E]
- Huby, nie pary: `tokens.ts` (12 importerów w `src`, 2 commity, stabilny kontrakt), `RoomLobby.tsx` (10 commitów,
  głównie UI; ze ścieżką głosu łączy go `b5a753e`). [E]
- Mechaniczne: pary TEMP→Revert na migracjach i `join.ts` (np. `8278677/4a4ce82`), `519bf3f` (przepisanie ścieżek w
  komentarzach). [E]

## Weryfikacja ast-grep (2026-10-20)

**Metoda.** ast-grep 0.51.0 (`npx -p @ast-grep/cli`, jednorazowo, bez instalacji w projekcie), języki TS, TSX i JS.
ast-grep nie parsuje SQL ani plików `.astro`, więc tam liczy grep (zaznaczone). Każde zero z ast-grep sprawdzono
grepem. Dwa zera okazały się złymi wzorcami, a nie brakiem wystąpień: `sessionStorage` jako identyfikator (w kodzie to
właściwość `window.sessionStorage`) i `import { … } from` (w testach to re-eksport `export { … } from`). Skrypty
weryfikacji zostały poza repo (scratchpad sesji); wynik jest poniżej.

| # | Twierdzenie z raportu | Werdykt | Pliki i linie |
| --- | --- | --- | --- |
| C1 | jedyne `.rpc(` w `src` to `server.ts:89` | potwierdzone | ast-grep `$C.rpc($$$)`: 1; grep: 1 |
| C2 | 10 nazw RPC jako stringi w `callRpc` | doprecyzowane (linie) | 10 wywołań od `server.ts:115,137,156,177,235,250,261,274,291,302`: `create_room`, `room_link`, `join_room`, `room_lobby`, `start_game`, `cast_vote`, `reveal_round`, `next_round`, `skip_round`, `end_game`; grep: 11 = 10 + definicja `:82` |
| C3 | 3× `.from("rooms")` | potwierdzone | `server.ts:311,328,343` |
| C4 | `ringRoom` wołany z `server.ts` | doprecyzowane | 2 wywołania: `server.ts:369` i `src/pages/api/live-sync/ring.ts:24` (endpoint sondy F-01, tylko zalogowany) |
| C5 | „14 wejść przez `ringRoom`” (mapa) | doprecyzowane | `ringLobby(` 8×: `api/rooms/index.ts:51`, `join.ts:55`, `[id]/end.ts:25`, `next.ts:39`, `reveal.ts:23`, `skip.ts:38`, `start.ts:33`, `vote.ts:48`; +1 `ringRoom` (C4) = 9 miejsc, które dzwonią; „14” to zasięg grafu (`evidence/3-structure.md:108`) |
| C6 | w `vote.ts` dzwonek przy `ok` | potwierdzone | `if ($R.ok) await ringLobby($$$)`: 6 z 8 (`end`, `next`, `reveal`, `skip`, `start`, `vote`); `join.ts:55` i `index.ts:51` dzwonią po wcześniejszych sprawdzeniach |
| C7 | `BELL_EVENT` w `src` z jednego źródła | potwierdzone | definicja `live-sync/shared.ts:4`; użycia `live-sync/server.ts:3,16`, `useRoomState.ts:6,286`, `LiveSyncDemo.tsx:4,61` |
| C8 | sonda kopiuje `BELL_EVENT` i `TOPIC_PREFIX` | potwierdzone | `scripts/live-sync-probe.mjs:12-13` |
| C9 | w `src` storage to tylko flaga przeładowania | doprecyzowane (fałszywe zero) | `$W.sessionStorage`: `useRoomState.ts:99,100,110`; grep (z `.astro`): te same 3 |
| C10 | `localStorage` w `src` brak | potwierdzone | ast-grep 0, grep 0 |
| C11 | ciasteczko gracza ustawiane w jednym miejscu | potwierdzone | `join.ts:53`; grep widzi jeszcze `src/lib/supabase.ts:18` (ciasteczka sesji Supabase, nie gracza) |
| C12 | ciasteczko gracza czytane w 5 miejscach | potwierdzone | ast-grep: `join.ts:32`, `[id]/lobby.ts:26`, `[id]/vote.ts:40`; grep (`.astro`): `j/[token].astro:36`, `r/[id].astro:28` |
| C13 | `tokens.ts` ma 12 importerów w `src` | potwierdzone | 10 `.ts` (ast-grep) + 2 `.astro` (grep) |
| C14 | „+1 import w testach” | doprecyzowane (fałszywe zero) | to re-eksport: `tests/db/support/clients.ts:9` |
| C15 | `server.ts` ma 12 importerów runtime + 1 typu | potwierdzone | 9 `.ts` (ast-grep) + `index.astro:11`, `j/[token].astro:8`, `r/[id].astro:9` (grep); typ: `json-route.ts:3` |
| C16 | żaden test nie importuje `server.ts` | potwierdzone | ast-grep 0, grep `rooms/server"` w `tests/`: 0 |
| C17 | brak wygenerowanych typów bazy | potwierdzone | `createServerClient<…>` i `SupabaseClient<…>`: ast-grep 0, grep 0 (`src`, `tests`, `scripts`) |
| C18 | kopie nazw RPC w testach TS (D1) | potwierdzone | literały: `join_room` 4 (`nicks.test.ts:40`, `roles.test.ts:299`, `support/rooms.ts:75`, `support/rounds.ts:143`), `room_link` 5 (`canary.test.ts:20`, `roles.test.ts:228,257,269`, `support/rounds.ts:138`), `room_lobby` 5 (`roles.test.ts:180,187,198`, `support/rooms.ts:92`, `support/rounds.ts:131`), `cast_vote` 1 (`support/rounds.ts:105`), `reveal_round` 2 (`support/rounds.ts:114`, `round-rules.test.ts:213`); grep liczy 2–4× więcej, bo łapie komentarze i nazwy testów |
| C19 | `server.ts` nie loguje argumentów RPC | potwierdzone | 4× `logEvent` (`:58`, `:102`, `:202`, `:373`); `logFailure` (`:57-63`) loguje `op`, `roomId`, `status`, `code`, `errName` |
| C20 | wzorzec tokenu gracza sprawdza w TS tylko `vote.ts` | potwierdzone | `PLAYER_TOKEN_PATTERN.test(`: `vote.ts:41`; grep (z `.astro`): 1 |
| C21 | `room-actions` obsługuje 6 akcji (mapa) | potwierdzone | `act(…)`: `RoomScreen.tsx:123-128` (`start`, `vote`, `reveal`, `next`, `skip`, `end`) |
| C22 | nowy kod odmowy daje tekst ogólny (D3) | doprecyzowane (żywy przypadek) | `MESSAGES` ma 18 kluczy (`errors.ts:22`); kody `'reason'` w migracjach (grep): 18, z czego `not_signed_in` (`first_live_round.sql:240`) bez komunikatu |

Bez ast-grep (SQL, tylko czytanie i grep): ostatnie definicje `join_room`, `room_link`, `room_lobby`, `cast_vote`,
`unlogged` dla `round_voters` i `ballot_boxes`, kopie wzorców tokenów w SQL (D4).

## Code References

- `src/pages/j/[token].astro:26-71` — strona linku: wzorzec, `room_link`, powrót do pokoju, formularz
- `src/pages/api/rooms/join.ts:11-56` — POST nicku, `join_room`, ciasteczko, dzwonek, 302
- `src/lib/rooms/tokens.ts:6-45` — wzorce tokenów, generator, nazwa i opcje ciasteczka
- `src/lib/rooms/server.ts:55-109` — `callRpc`, logowanie awarii, `unexpectedShape`, `refusal`
- `src/lib/rooms/server.ts:136-257` — `roomLink`, `joinRoom`, `roomLobby`, `roomView`, `castVote`
- `src/lib/rooms/server.ts:368-381` — `ringLobby`
- `src/lib/rooms/shared.ts:110-185` — parser stanu pokoju (kopiuje klucze kontraktu)
- `src/pages/r/[id].astro:24-65` — ekran pokoju, rozpoznanie gościa
- `src/pages/api/rooms/[id]/vote.ts:10-49` — trasa głosu
- `src/components/room/RoundVoting.tsx:16-17,95-127,169` — wybór w pamięci, `hasVoted`, „Twój głos”
- `src/components/room/useRoomState.ts:96-114,183,236-245,286-288` — odświeżanie stanu, dzwonek
- `src/lib/live-sync/shared.ts:3-4,20-22`, `src/lib/live-sync/server.ts:12-32` — kontrakt i nadawca dzwonka
- `scripts/live-sync-probe.mjs:12-13` — kopia kontraktu dzwonka
- `supabase/migrations/20261014101922_first_live_round.sql:141-213,308-418` — urna `unlogged`, `finish_round`, `join_room`, `room_link`
- `supabase/migrations/20261015122252_full_game_evening.sql:248-392,403-519` — `cast_vote`, `room_lobby`

## Architecture Insights

- Logika gry siedzi w funkcjach SQL `security definer`; Worker to cienka brama (`server.ts`) z walidacją wejścia,
  mapowaniem błędów i dzwonkiem. [E]
- Anonimowość jest zbudowana rozdziałem danych: kto głosował (`round_voters`) i na kogo (`ballot_boxes.tally`) leżą w
  osobnych tabelach `unlogged`, czyszczonych przy odsłonie (`finish_round`) i przy każdym innym końcu rundy
  (`drop_round_state`, wołane przez `create_room`, `end_game`, sweep `close_stale_games`, oraz `skip_round`). [E]
- Dzwonek to sygnał „pobierz stan”, a nie kanał danych: na sprawdzonej ścieżce (strona `/r/<id>` i `/lobby`) stan
  pochodzi z `room_lobby`. [E]
- Parser po stronie Workera działa jak filtr prywatności (kopiuje tylko znane klucze), co zarazem czyni go cichym przy
  nowych polach. [E/I]

## Priory z mapy (`context/map/repo-map.md`) — werdykty

| Prior | Werdykt | Kotwica |
| --- | --- | --- |
| `server.ts` to jedyna brama TS do SQL, 10 RPC jako stringi, 3× `.from("rooms")` | potwierdzony | `server.ts:89`, lista w D1, `:311`, `:328`, `:343` |
| aktualne `join_room` i `room_link` w `first_live_round.sql`, `room_lobby` i `cast_vote` w `full_game_evening.sql` | potwierdzony; doprecyzowanie: `cast_vote` przez `drop` + `create`, nie `create or replace` | `first_live_round.sql:308`, `:384`; `full_game_evening.sql:248`, `:255`, `:403` |
| sonda ma własną kopię `BELL_EVENT` | potwierdzony; kopiuje też `TOPIC_PREFIX` | `live-sync-probe.mjs:12-13` |
| nadawca dzwonka to `announce.ts` / `live-sync/server.ts`; `announce.ts` w „Gdzie żyje” live-sync | **skorygowany**: `announce.ts` to teksty aria-live; nadawca to `live-sync/server.ts` | `announce.ts:1-34`, `live-sync/server.ts:12-32` |
| `server.ts` nie importuje żaden test | potwierdzony co do importów; doprecyzowanie: wykonują go smoke i e2e przez HTTP, bez testu są jego gałęzie awarii | grep `tests/`; smoke, e2e |
| niewiadoma 2: brak typów DB, czy formy pilnuje e2e lub `db`: `unknown` | brak typów potwierdzony; rozjazd nazw i kształtów łapią smoke i e2e w CI, nie `db` (ma własne kopie) | `tests/db/support/clients.ts:18`, D1, D2 |
| kopie nazw RPC w `tests/db/support/{rounds,rooms}.ts` | **skorygowany**: także `canary`, `nicks`, `roles` i pgTAP | D1 |
| niewiadoma 3: kontrakt dzwonka `unknown` | rozstrzygnięty: w `src` jedno źródło (`shared.ts`), ładunek ignorowany, kopia w sondzie bez strażnika | D5 |
| stan rundy w tabelach `unlogged` | doprecyzowanie: `unlogged` są `ballot_boxes` i `round_voters`; `private.rounds` i `round_results` są logowane i trzymają fazę, listę uprawnionych i liczby po odsłonie | `first_live_round.sql:112`, `:130`, `:141`, `:149` |
| `tokens.ts` Ca 12 | potwierdzony (12 importerów w `src`, plus 1 w testach) | lista importów w raporcie blast radius |
| „14 wejść przez `ringRoom`” | **doprecyzowany**: 14 to zasięg w grafie importów (`context/map/evidence/3-structure.md:108`); dzwoni 9 miejsc: 8× `ringLobby` w trasach pokoju + `ringRoom` w `api/live-sync/ring.ts:24`. Importerów runtime `server.ts` w `src` jest 12 (9 `.ts` przez ast-grep, 3 `.astro` przez grep), plus import typu w `json-route.ts:3` | „Weryfikacja ast-grep”, C4–C5 |
| niewiadoma 1 (graf SQL), niewiadoma 6 (okno F1/F4) | poza zakresem; dla tej ścieżki tabele i funkcje wypisane wyżej | — |

Drobna nieścisłość w kodzie: komentarz `server.ts:7-9` wskazuje `*_room_lobby.sql` jako źródło funkcji, a aktualne
ciała leżą w dwóch późniejszych migracjach. [E]

## Historical Context (from prior changes)

Nie czytano w tym badaniu; wskazane przez komentarze w kodzie, `AGENTS.md` i mapę:

- `context/archive/2026-10-13-first-live-round/research.md` — D1 (granica przyjętego ryzyka anonimowości, na którą powołuje się `AGENTS.md`)
- `context/archive/2026-10-15-full-game-evening/research.md` — D3 (runda pominięta bez liczb; powód odrzucania kluczy w parserze)
- `context/archive/2026-10-07-room-lobby/` — schemat pokoju, `player_secrets`, ciasteczko gracza
- `context/foundation/roadmap.md` § S-04 — niewiadoma „czy przywrócenie głosu może działać tylko na tym samym urządzeniu”

## Related Research

- `context/map/repo-map.md` i `context/map/evidence/` — mapa projektu (prior tego badania)

## Open Questions

1. **S-04, decyzja produktowa:** gdzie pokazać własny wybór po przeładowaniu, skoro `AGENTS.md` zakazuje utrwalania pary
   głosujący↔cel „in any form”, a komentarz `RoundVoting.tsx:16-17` wyklucza storage, ciasteczko i URL. Serwer pary nie
   ma (z założenia). Rozstrzyga plan S-04 i właściciel produktu (roadmapa S-04, Unknowns). [U]
2. Czy logi żądań Supabase/PostgREST/Cloudflare zapisują treść żądania z celem głosu: [U] (zewnętrzne).
3. ~~„14 wejść przez `ringRoom`” z mapy~~: rozstrzygnięte w „Weryfikacja ast-grep” (C4–C5).
4. Czy rekordy pokoi i graczy są kiedyś kasowane (dotyczy utraconych ciasteczek i S-13): nie sprawdzano. [U]
5. Wyjątek 22023 → `unexpected`: wniosek z kodu, bez testu. [I]
