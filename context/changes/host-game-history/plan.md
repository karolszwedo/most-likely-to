# Lista gier hosta i kasowanie (S-13) Implementation Plan

## Overview

Zalogowany host dostaje stronę „Twoje gry” (`/gry`) z minimalną listą swoich zakończonych gier (data, liczba pytań, kto grał) i kasuje dowolną z nich. Kasowanie zabiera wszystko, co wiąże się z nickami i z tą grą, a anonimowe liczniki pytań (`private.question_stats`) zostają, o czym potwierdzenie mówi wprost (roadmapa S-13, PRD FR-019; decyzje Karola 1–7 z 2026-11-10 niżej).

**Decyzje Karola (2026-11-10, wszystkie według rekomendacji):**

1. Kasować można tylko gry zakończone (`status = 'closed'`); otwarty pokój host najpierw kończy („Zakończ grę” albo „Nowa gra”).
2. Pytania dopisane w grze (zatwierdzone propozycje gości, własne pytania hosta w `private.game_questions`) znikają razem z grą.
3. Wiersz listy: data startu gry (gra bez startu: data założenia pokoju i dopisek, że nie wystartowała), liczba pytań, które padły (tyle rund, ile gra otworzyła, z pominiętymi, czyli ostatnie „Pytanie N”), nicki graczy; najnowsze na górze; gry bez startu też są na liście.
4. Adres `/gry`, link na stronie głównej przy „Nowa gra”; `/dashboard` (pozostałość startera) znika, ochrona trasy i smoke przechodzą na `/gry`.
5. Gość, który po skasowaniu gry odświeży jej kartę: „Tej gry już nie ma.” + „Host ją usunął. Na następną grę poproś go o nowy link.”; nowy stan w bazie zamiast dzisiejszego „Usunięto cię z pokoju.”. Host w starym adresie: dzisiejsze „Nie jesteś w tym pokoju.”.
6. Smoke na końcu każdego przebiegu kasuje wszystkie zakończone gry swojego konta nową akcją; pierwszy przebieg na produkcji sprząta też stare. Bez migracji kasującej dane.
7. Pod „Na pewno usunąć tę grę?”: „Znikną nicki, wyniki i pytania tej gry. Zostaną tylko anonimowe liczniki pytań (ile razy padły, pominięcia, kciuki), bez nicków i bez tej gry.” Wygląd Karol wybiera na zrzutach (Faza 3).

## Current State Analysis

- Nic w repo nie kasuje pokoju (`grep "delete from public.rooms" supabase/migrations/`: 0 trafień). Każdy klucz obcy do `public.rooms` i `public.players` ma `on delete cascade` (`20261007122858_room_lobby.sql:36,50`, `20261014101922_first_live_round.sql:114,132`, `20261022132240_latecomer_admission.sql:41`, `20261024094002_question_list_review.sql:48`, `20261103151953_rejoin_after_refresh.sql:54`, `20261104095452_guest_question_proposals.sql:66,71`), a tabele urny i kciuków wiszą kaskadą na `private.rounds` (`first_live_round.sql:131,142,150`, `20261026074427_question_play_data.sql:87`). Wyjątek: `rounds (room_id, list_position) → game_questions` bez `on delete` i bez `deferrable` (`question_list_review.sql:77-78`, przegląd S-06 F2 odłożony do S-13).
- `private.question_stats` nie ma klucza do pokoju ani gracza (`question_play_data.sql:53-81`), więc kaskada go nie dotknie. Kciuki składa `private.drop_round_state` (`guest_question_proposals.sql:384-406`, `fold_reactions` w `:390`) przy każdym zamknięciu pokoju (`create_room`, `end_game`, `close_stale_games`), więc w zamkniętej grze nic nie czeka na złożenie. `counts_for_stats` dla nieistniejącego pokoju daje `true` (`question_play_data.sql:120-125`), ale po zamknięciu nikt go już nie woła.
- Host czyta własne `rooms` i `players` przez RLS (`room_lobby.sql:65-67`, `:78-83`; grant `select` dla `authenticated`, `first_live_round.sql:33-34`), ale liczba pytań leży w `private.rounds` (fazy `voting`, `revealed`, `skipped`, `20261015122252_full_game_evening.sql:28-29`), więc lista wymaga funkcji `security definer`. `rooms` ma `created_at` i `started_at`, nie ma `closed_at`.
- Dziś host widzi tylko swój jeden otwarty pokój (`OpenRoomNotice`, `src/pages/index.astro:43`); zamknięte gry są nieosiągalne. `/dashboard` to angielska strona startera (`src/pages/dashboard.astro`), chroniona przez `PROTECTED_ROUTES` (`src/middleware.ts:5`), sprawdzana trzema krokami smoke (`scripts/smoke.mjs:111,125,127`).
- `public.join_request_state` (najnowsza wersja `rejoin_after_refresh.sql:321`) zwraca `{state:'none'}` dla brakującego pokoju (`:343-344`), a `/r/[id].astro:53` czyta `none` przy ciasteczku pokoju jako „usunięto cię” (ryzyko F6 z przeglądu S-09). Test `tests/db/latecomers.test.ts:421-428` utrwala `none` dla nieistniejącego pokoju.

## Desired End State

- Na `/` zalogowany host widzi link do „Twoje gry”. `/gry` pokazuje jego zakończone gry, najnowsze na górze: data, liczba pytań („7 pytań”) albo dopisek o grze bez startu, nicki. „Usuń” → w miejscu „Na pewno usunąć tę grę?” ze zdaniem z decyzji 7, „Usuń” i „Anuluj”. Po skasowaniu wiersz znika, fokus przechodzi dalej według `focus.ts`, czytnik słyszy, że gra usunięta. Pusta lista: zdanie, że nie ma jeszcze zakończonych gier.
- Po skasowaniu w bazie nie zostaje żaden wiersz tej gry (pokój, gracze, hashe tokenów, prośby, rundy, wyniki, urna, kciuki, propozycje, lista pytań), a liczniki pytań się nie zmieniają.
- Gość z ciasteczkiem skasowanej gry po odświeżeniu widzi „Tej gry już nie ma.” (404); stary link `/j/<kod>` daje 404 „Ten link nie działa.”; spóźniony, który czekał, widzi to, co przy zamkniętej grze.
- `/dashboard` nie istnieje, `/gry` bez sesji przekierowuje na logowanie.
- Smoke kończy przebieg bez zakończonych gier na swoim koncie.
- Weryfikacja: testy bazy `game-history.test.ts`, pgTAP, testy jednostkowe, smoke, e2e `game-history.spec.ts`, smoke na produkcji i przeklikanie Karola na telefonie i laptopie.

### Key Discoveries:

- Wzór funkcji tylko dla hosta: `set_cohost` (`20261027121442_co_host_role.sql:595-643`): `v_user := (select auth.uid())` (`:602`), `for update` (`:613-616`), obcy pokój i brak pokoju to ta sama odmowa `room_unknown` (`:619-621`), wszystkie odmowy przed jedynym zapisem, właściciel `:910`, `revoke` `:923`, `grant … to authenticated` `:935`.
- Wzór trasy hosta: `src/pages/api/rooms/[id]/cohost.ts:24-48` (`refuseForeignPost`, id nie-UUID i brak sesji → `OUTSIDE_ROOM` czyli 404, `actionAnswer`). `statusFor` (`src/lib/rooms/json-route.ts:198-204`): `room_unknown` 404, `invalid_body` 400, `service_unavailable` 503, `unexpected` 500, każda inna odmowa 409. Wzór GET: `src/pages/api/rooms/[id]/lobby.ts:16-44`.
- Kod `room_open` już istnieje w `MESSAGES` (`src/lib/rooms/errors.ts:72`, inne znaczenie), więc odmowa kasowania otwartej gry dostaje nową nazwę `game_not_ended`.
- `sendRoomAction(roomId, action, body)` (`src/components/room/room-actions.ts:66-91`) nie zależy od stanu pokoju i buduje `/api/rooms/<id>/<action>`; akcje to zamknięta unia `RoomAction` (`:26-48`). Wzór potwierdzenia w miejscu: `RemovePlayerButton.tsx:66-87`, `:123-159`; fokus po zniknięciu wiersza: `useRowFocus` (`src/components/room/focus.ts:46-64`).
- Brama RPC (`tests/unit/room-rpc-gate.test.ts`): wyrocznia pisana ręcznie, wiersz `SQL_SIGNATURES` (`:41-206`) z `plik:linia` migracji, wpis `CASES` (`:256-543`), `SUCCESS` (`:209-215`) dla funkcji, która nie zwraca `{ok}`.
- Odmiana „pytanie/pytania/pytań”: `plural` w `src/lib/rooms/summary.ts:32-39`. W `src/` nie ma formatowania dat (`Intl`), a Worker biegnie w UTC.
- Otwarta karta „Koniec wieczoru” nie odpytuje serwera (`useRoomState.ts:169-174`), więc po skasowaniu nic się w niej nie zmieni do ręcznego odświeżenia.
- Smoke: kroki `[nazwa, run, oczekiwanie]` (`scripts/smoke.mjs:962-976`), `act()` to POST JSON na `/api/rooms/<id>/<akcja>` (`:281-283`), host zalogowany w `hostJar`; ostatni krok to „host signs out” (`:932-936`). Na końcu przebiegu główny pokój jest zamknięty, a `listRoom` czeka otwarty w poczekalni (`:826-841`) do następnego „host creates a room” z `confirmClose`.

## What We're NOT Doing

- Bez kasowania otwartych gier (decyzja 1) i bez kasowania konta hosta (brak FR; kaskada od `auth.users` istnieje, ale ekranu nie ma).
- Bez zachowywania dopisanych pytań do przeglądu twórcy gry (decyzja 2): propozycja ze skasowanej gry, której twórca nie przejrzał zapytaniem z `deploy-plan.md`, przepada.
- Bez automatycznego kasowania po czasie (PRD odrzuca 30 dni), bez „Usuń wszystkie”, bez cofania skasowania, bez stronicowania listy.
- Bez wejścia z listy w podsumowanie gry i bez listy dla współhosta (panel tylko hosta, PRD Access Control).
- Bez zmiany otwartej karty „Koniec wieczoru” po skasowaniu (nie odpytuje serwera); gość zobaczy „Tej gry już nie ma.” po odświeżeniu.
- Bez rozróżniania na `/j/<kod>` skasowanej gry od literówki: 404 „Ten link nie działa.” jak dla każdego nieznanego kodu.
- Bez przedłużania ciasteczka gracza (24 h od wejścia, `PLAYER_COOKIE_MAX_AGE` w `src/lib/rooms/tokens.ts:13`): gość, który wszedł ponad 24 h przed skasowaniem gry, po odświeżeniu widzi „Nie jesteś w tym pokoju.”, jak przy każdej starej grze; „Tej gry już nie ma.” dostaje tylko gość z żywym ciasteczkiem.
- Dwie karty `/gry` i drugie kasowanie tej samej gry: odmowa pokazuje ogólny tekst błędu, wiersz zostaje do odświeżenia; akceptowane.
- Bez migracji kasującej stare pokoje konta smoke (decyzja 6).
- Bez edycji `context/domain/domain-distillation.md` i plików `context/domain/evidence/`: to wynik skilla, odświeży je następny przebieg `/10x-domain-distillation`. Historyczny „Stan kodu” w `roadmap.md:82,85` też zostaje.
- Bez zmian w S-12: skasowana gra znika też z „ostatnich wieczorów hosta”, więc jej pytania mogą się szybciej powtórzyć (dopisek do Unknowns S-12 w roadmapie, Faza 1).

## Implementation Approach

Jedna migracja dodaje dwie funkcje hosta: `host_games()` (lista) i `delete_game(p_room_id)` (sprawdzenia, potem jeden `delete from public.rooms`, resztę robi kaskada), i zmienia w `join_request_state` tylko gałąź brakującego pokoju na nowy stan `gone`. Worker dostaje dwie trasy (GET listy dla smoke i POST kasowania) według wzorów `lobby.ts` i `cohost.ts`, nowy rodzaj strony `/r/<id>` i sprzątanie w smoke. Ekrany: strona `/gry` z wyspą listy i potwierdzeniem w miejscu (wzór `RemovePlayerButton`), link na `/`, warianty wyglądu na zrzutach dla Karola. Wdrożenie: baza przed kodem.

## Critical Implementation Details

- **Jeden `delete` na pokój.** Klucz `rounds → game_questions` jest `NO ACTION` i nie `deferrable` (`question_list_review.sql:77-78`), więc sprawdza się na końcu instrukcji: `delete from public.rooms` zabiera kaskadą i rundy, i listę pytań w tej samej instrukcji. Osobny `delete` z `game_questions` przed rundami padłby na tym kluczu. Dowodem jest test pgTAP z rundą z listy.
- **`join_request_state`: kopiuj najnowszą wersję** (`rejoin_after_refresh.sql:321`; sprawdź jeszcze raz `grep -ln "function public.join_request_state(" supabase/migrations/*.sql`) i zmień tylko gałąź `v_status is null` (`:343-344`). Sprawdzenie formatu tokenu (`:335-336`) zostaje pierwsze, więc zły token dalej daje `none`. Granty powtórzone jak w `:832`, `:841`.
- **Kolejność wdrożenia:** `db push` przed scaleniem. Stary Worker nie zna `gone` (parser `src/lib/rooms/shared.ts:536` odmawia, strona daje 500), ale `gone` dostaje tylko ciasteczko skasowanej gry, a kasuje dopiero nowy kod: smoke na serwerze dev przed scaleniem kasuje wyłącznie gry konta smoke, których nikt nie otwiera.
- **Daty formatuje serwer** (`Intl.DateTimeFormat("pl-PL", { …, timeZone: "Europe/Warsaw" })` w stronie `/gry`), a wyspa dostaje gotowe napisy. Worker biegnie w UTC, a formatowanie w przeglądarce rozjechałoby się z renderem serwera.
- **Sprzątanie smoke przed „host signs out”** (`scripts/smoke.mjs:932-936`), póki `hostJar` jest zalogowany; odmowę dla otwartej gry sprawdza na `listRoom`, który na końcu przebiegu czeka w poczekalni; powstaje w każdym trybie (`scripts/smoke.mjs:826-841`, obie gałęzie wołają `newListRoom`), więc krok biegnie zawsze, bez `skippedBy`.

## Faza 1: Baza

### Overview

Funkcje listy i kasowania, stan `gone`, testy bazy i pgTAP (kaskada z rundą z listy, liczniki bez zmian), dokumenty z nazwami i próbny alarm na draft PR.

### Changes Required:

#### 1. Migracja

**File**: `supabase/migrations/<timestamp>_host_game_history.sql` (przez `npx supabase migration new host_game_history`)

**Intent**: Host widzi swoje zakończone gry i kasuje wybraną jednym ruchem; gość skasowanej gry dostaje osobny stan zamiast „usunięto cię”.

**Contract**:

- `public.host_games() returns jsonb`, `stable security definer`, `set search_path = ''`, właściciel `postgres`, `revoke execute … from public, anon, authenticated`, `grant execute … to authenticated`. Zwraca tablicę gier wołającego (`rooms.host_id = (select auth.uid())`, tylko `status = 'closed'`; brak `auth.uid()` → `[]`), posortowaną `coalesce(started_at, created_at) desc`, potem `id`. Element: `{id, created_at, started_at (null, gdy gra nie wystartowała), questions (liczba wierszy private.rounds pokoju), nicks (nicki z public.players w kolejności seat, host też)}`. Nic o głosach, wynikach, kolorach ani rolach.
- `public.delete_game(p_room_id uuid) returns jsonb`, `security definer`, `set search_path = ''`, właściciel `postgres`, `revoke … from public, anon, authenticated`, `grant execute … to authenticated` (wzór `set_cohost`). Po kolei, wszystkie odmowy przed zapisem:
  - blokada wiersza pokoju `for update`;
  - brak pokoju, brak `auth.uid()` albo obcy host: `{ok:false, reason:'room_unknown'}`;
  - `status <> 'closed'`: `{ok:false, reason:'game_not_ended'}`;
  - zapis: `delete from public.rooms where id = p_room_id` (kaskada zabiera resztę);
  - odpowiedź dokładnie `{ok:true}`.
- `public.join_request_state` (`create or replace`, sygnatura bez zmian): dla poprawnego tokenu i brakującego pokoju `{state:'gone'}`; reszta odpowiedzi bez zmian. Komentarz funkcji wymienia nowy stan.
- Nagłówek migracji: decyzje 1, 2, 5; że kasowanie nie dotyka `private.question_stats` ani `private.stats_excluded_hosts`; uwaga o kluczu `rounds → game_questions` (jeden `delete`); kolejność wdrożenia (baza, potem kod).

#### 2. Testy bazy

**File**: `tests/db/game-history.test.ts` (nowy), `tests/db/latecomers.test.ts`, `tests/db/support/rounds.ts`

**Intent**: Dowieść decyzji 1, 3 i 5 przez REST jako host i gość. Przed pisaniem przeczytaj `context/foundation/test-plan.md` §6.

**Contract**:

- `game-history.test.ts`, jeden host na plik (`newHost`, `tests/db/support/clients.ts:33-46`; pokoje `seedRoom` z `confirmClose`, goście `seedGuest`, `tests/db/support/rooms.ts:48,73`); przygotowanie w `beforeAll`, ciała testów tylko zbierają `{data, error}`:
  - kontrola pozytywna: gra z dwoma gośćmi i dwiema rundami (jedna odsłonięta, jedna pominięta), zakończona `end_game`; `host_games` ma ją z `questions: 2`, nickami w kolejności miejsc i `started_at`; pokój zamknięty bez startu (`seedRoom(host, { confirmClose: true })`) ma `started_at: null` i `questions: 0`; otwarty pokój nie jest na liście; kolejność od najnowszej;
  - `delete_game` zakończonej gry → dokładnie `{ok: true}`; potem `host_games` jej nie ma, token gościa → `room_lobby` `null`, `join_request_state` z tokenem gościa → dokładnie `{state: "gone"}`, stary kod → `room_link` `unknown`;
  - odmowy z argumentami, które przepuszczone coś by zmieniły: otwarty pokój → `game_not_ended`, a pokój dalej otwarty i bez zmian; drugie kasowanie tej samej gry i losowy UUID → `room_unknown`; `anon` woła `delete_game` i `host_games` → `42501` z nazwą funkcji w komunikacie (wzór `cohost.test.ts:394-398`).
- `latecomers.test.ts:421-428`: przypadek „a room that does not exist” wyjęty z `it.each` do własnego testu z wyrocznią dokładnie `{state: "gone"}`; dwa pozostałe dalej `none`.
- `support/rounds.ts`: wrappery `hostGames`, `deleteGame` obok `joinRequestState` (`:437`), komentarz kontraktu stanów (`:56-58`) z `gone`.

#### 3. Widok twórcy (pgTAP)

**File**: `supabase/tests/round_creator_view.test.sql`

**Intent**: Przypiąć to, czego klucz publishable nie widzi: kaskadę do zera wierszy, liczniki bez zmian, obcego hosta i granty.

**Contract**:

- `function_facts` (`:479-508`): `host_games()` i `delete_game(uuid)` jako `security definer | owner postgres | search_path="" | execute: authenticated` (wzór `:1394-1398`); `versions_of` (`:525-534`) po jednej wersji każdej; `join_request_state` dalej jedna wersja z tymi samymi grantami (`:1131-1135`, `:1153-1156`).
- Scenariusz kaskady: gra z przeglądniętą listą (wiersz `game_questions` z `proposed = true` i runda z `list_position`), runda odsłonięta z `round_results`, runda pominięta, kciuki złożone, prośba spóźnionego i ślad `moved`, zakończona `end_game`; `snapshot_stats` (`:757-775`), `delete_game` jako host, potem zero wierszy tego pokoju w `rooms`, `players`, `player_secrets`, `join_requests`, `rounds`, `round_results`, `game_questions`, `question_proposals`, `round_voters`, `ballot_boxes`, `round_reactions` (rundy przez zapamiętane id, wzór `test_rounds` `:69-71` i `urn_rows` `:285-309`), a `stats_gain` (`:777-813`) zero we wszystkich kolumnach.
- Drugi host (wstawiony do `auth.users`, nie liczy się do limitu rejestracji): `delete_game` cudzej gry → `room_unknown`, a gra cała; `host_games` drugiego hosta nie ma cudzej gry.
- `plan(N)` zaktualizowany (dziś 424, `:65`).

#### 4. Dokumenty z nazwami

**File**: `context/foundation/prd.md`, `context/domain/glossary.md`, `context/foundation/test-plan.md`, `context/foundation/roadmap.md`, `context/deployment/deploy-plan.md`

**Intent**: Decyzje Karola i nazwy z kodu zapisane przed Workerem i ekranami.

**Contract**:

- PRD: pod FR-019 (`prd.md:135`) dopisek „Uzupełnienie 2026-11-10 (S-13, decyzje twórcy gry)” z decyzjami 1–3 i 7; zdanie NFR o zatwierdzonej propozycji (`:154`) uzupełnione: zostaje do przeglądu twórcy gry, chyba że host wcześniej skasuje grę.
- Słownik: „lista własnych gier” (`glossary.md:54`) z nazwami `/gry`, `host_games`, `GET /api/rooms`; nowy termin „skasowanie gry” (host usuwa zakończoną grę ze wszystkim, co wiąże się z nickami; anonimowe liczniki pytań zostają; nazwy `delete_game`, `POST /api/rooms/<id>/delete`, odmowa `game_not_ended`, stan `gone`; nie nazywać „usunięcie gracza”).
- `test-plan.md` §6.2: `game-history` na liście plików i 22 konta na przebieg (`:194-195`).
- Roadmapa: Unknowns S-12 (`roadmap.md:263-270`) dostaje zdanie, że skasowana gra wypada z „ostatnich wieczorów hosta”.
- `deploy-plan.md`, „Przegląd pytań z gier” (`:73-83`): pytania ze skasowanej gry znikają razem z nią, przed przeglądem też.

### Success Criteria:

#### Automated Verification:

- Bramka lokalna przechodzi: `npm run lint`, `npx astro check`, `npm test`, `npm run build`
- `npx prettier --check` dla nowych i zmienionych plików `.md` przechodzi
- Draft PR do `main` (push za zgodą Karola): CI zielone we wszystkich jobach, w `db` nowe testy `game-history.test.ts` i nowe asercje pgTAP przechodzą
- Próbny alarm: tymczasowy commit zapala tylko przewidziane testy; po `git revert` CI zielone

#### Manual Verification:

- Karol czyta streszczenie migracji (co widzi lista, kto i co może skasować, co znika, co zostaje, co widzi gość) i je akceptuje

**Implementation Note**: Próbny alarm według `test-plan.md` §6.2 „Break-check”: jeden tymczasowy commit z dwoma uszkodzeniami, bo każde zapala inne testy: (a) `delete_game` bez sprawdzenia `status` (otwarty pokój da się skasować); (b) `join_request_state` znów daje `none` dla brakującego pokoju. Przewidywania przed pushem, a opis commita wymienia z nazwy każdy test, który ma zaświecić (w `game-history.test.ts`, `latecomers.test.ts` i pgTAP). Tymczasowej migracji nigdy nie wgrywamy; na końcu `git diff main...HEAD -- supabase/migrations` pokazuje tylko migrację zmiany. Wynik w §6.2. Po fazie pauza na akceptację Karola.

---

## Faza 2: Serwer gry

### Overview

Trasy listy i kasowania, stan `gone` w Workerze i na ekranach gościa, sprzątanie i nowe kroki w smoke.

### Changes Required:

#### 1. Funkcje serwera i parser

**File**: `src/lib/rooms/server.ts`, `src/lib/rooms/shared.ts`

**Intent**: Worker woła nowe funkcje bazy tak jak dzisiejsze akcje i odrzuca odpowiedź w złym kształcie.

**Contract**:

- `hostGames(supabase): Promise<{ok:true; games: HostGame[]} | RoomFailure>` przez `callRpc` (`server.ts:102-118`), `HostGame = { id: string; createdAt: string; startedAt: string | null; questions: number; nicks: string[] }`, parser w `shared.ts` (zły kształt → `unexpectedShape("host_games", pole)`).
- `deleteGame(supabase, roomId): Promise<ActionResult>` przez `callRpc` i `actionResult` (`:388-392`), wzór `setCohost` (`:600-608`).
- Parser stanu prośby (`shared.ts:520-537`): `gone` w typie i na liście przyjętych stanów.

#### 2. Trasy

**File**: `src/pages/api/rooms/index.ts`, `src/pages/api/rooms/[id]/delete.ts` (nowy)

**Intent**: Lista dla smoke (i każdego klienta hosta) i kasowanie jako akcja JSON jak „współhost”.

**Contract**:

- `GET /api/rooms` (nowy eksport obok `POST`, `index.ts:15-54`): bez sesji 404 `{error:"not_found"}` jak trasy hosta; brak klienta 503; odpowiedź `jsonAnswer({ games })` z `NO_STORE`; awaria 503/500 jak `lobby.ts:29-31`. Log tylko przez `logEvent` (`op: "host_games"`, bez nicków).
- `POST /api/rooms/<id>/delete`: kopia przebiegu `cohost.ts:24-48` bez ciała akcji (`refuseForeignPost`, id nie-UUID i brak sesji → `OUTSIDE_ROOM`), `deleteGame`, `actionAnswer("delete", roomId, result)`; bez dzwonka (zamknięty pokój nikogo nie słucha). `room_unknown` → 404 `not_found`, `game_not_ended` → 409.
- `RoomAction` (`src/components/room/room-actions.ts:26-48`): dopisane `"delete"`.
- `MESSAGES` (`src/lib/rooms/errors.ts:51-113`): `game_not_ended` z tekstem „Tej gry nie da się usunąć, dopóki trwa. Najpierw ją zakończ.”

#### 3. Ekrany gościa po skasowaniu

**File**: `src/pages/r/[id].astro`, `src/components/room/JoinWaiting.tsx`, `src/pages/dev/room-states.astro`

**Intent**: Decyzja 5: gość wie, że gry nie ma, a nie że go wyrzucono.

**Contract**:

- `/r/[id].astro`: nowy rodzaj strony `gone` w unii `Page` (`:22-28`), `asked.request.state === "gone"` → `{kind:"gone"}` obok `removed` (`:53`), status 404 (`:68-69`), tytuł „Tej gry już nie ma” w `TITLES` (`:73-79`), `RoomMessage` z „Tej gry już nie ma.” i „Host ją usunął. Na następną grę poproś go o nowy link.”. Komentarz przy gałęzi ciasteczka (`:46-49`) wymienia skasowanie gry.
- `JoinWaiting.tsx:118-124`: jawna gałąź `gone` jak `closed` (`setClosed(true)`) przed przekierowaniem; to łańcuch if/else, więc typ jej nie wymusza, a bez niej `gone` po cichu przekieruje na martwy `/j/<kod>`.
- `/j/[token].astro:57-70`: bez zmian kodu. `room_link` (`:44-47`) daje 404 dla skasowanej gry przed `join_request_state`, więc `gone` przychodzi tylko w wyścigu i przechodzi dalej jak `none`; komentarz przy łańcuchu stanów to mówi (typ tego nie wymusza).
- `/dev/room-states`: stan „Gra skasowana” obok „Usunięty gracz (S-09)” (`:1090-1097`), następny wolny numer.

#### 4. Smoke

**File**: `scripts/smoke.mjs`

**Intent**: Decyzja 6 i dowód na każdej bazie, że kasowanie działa i odmawia.

**Contract**: nowe kroki przed „host signs out” (`:932-936`):

- „host lists finished games”: `GET /api/rooms` z `hostJar` → 200, w ciele id głównego pokoju (zakończonego w tym przebiegu);
- „guest cannot list games”: ten sam GET z ciasteczkami gościa → 404 `{"error":"not_found"}`;
- „deleting an open game is refused”: `act("delete", …)` na `listRoom` → 409 `{"error":"game_not_ended"}` (w każdym trybie, bez `skippedBy`);
- „guest cannot delete a game”: `act("delete")` z ciasteczkami gościa → 404;
- „host deletes every finished game”: jeden krok, który pobiera listę i kasuje każdą grę po kolei; przechodzi, gdy każda odpowiedź to 200 `{"ok":true}`, a raportuje pierwszą inną;
- „no finished games left”: `GET /api/rooms` → `{"games":[]}`;
- „deleted game's guest sees it is gone”: `/r/<id>` głównego pokoju z ciasteczkami gościa → 404, w ciele „Tej gry już nie ma.”;
- „deleted game's old link is not found”: stary `/j/<kod>` głównego pokoju → 404 (wcześniej w przebiegu 410, `:631`);
- „deleting a deleted game is not found”: drugie kasowanie → 404.
- Nagłówek (`:3-5`): pokoje konta smoke kasuje koniec przebiegu; zostaje najwyżej otwarty pokój w poczekalni, który zamknie następny przebieg.

#### 5. Testy jednostkowe

**File**: `tests/unit/room-rpc-gate.test.ts`, `tests/unit/room-state.test.ts`, `tests/unit/room-errors.test.ts`

**Intent**: Brama pilnuje nazw i argumentów nowych wywołań; parsery i teksty przypięte.

**Contract**:

- `room-rpc-gate.test.ts`: wiersze `SQL_SIGNATURES` `host_games` (bez parametrów) i `delete_game` (`p_room_id`) z `plik:linia` nowej migracji; `CASES` „Lista gier hosta” i „Usuń grę”; `SUCCESS.host_games = []`.
- `room-state.test.ts:1365-1397`: `gone` wśród przyjętych stanów; parser listy gier: poprawny kształt, `startedAt: null`, pusta lista, odmowy złego kształtu (brak `nicks`, `questions` jako tekst, element nie-obiekt).
- `room-errors.test.ts`: `game_not_ended` na liście odmów z własnym tekstem.

#### 6. Dokumenty

**File**: `AGENTS.md`, `context/foundation/test-stack.md`, `context/foundation/test-plan.md`, `docs/development.md`

**Intent**: Nieaktualne zdania o „S-13 posprząta” poprawione razem z kodem, który sprząta.

**Contract**: `AGENTS.md:45` (smoke kasuje zakończone gry swojego konta na końcu przebiegu, dalej pyta przed uruchomieniem, bo zmienia produkcyjną bazę); `test-stack.md:29`; `test-plan.md:330` (e2e same nie kasują pokoi, baza joba jest jednorazowa); `docs/development.md` sekcja „Smoke test” (`:184`) i trasy API.

### Success Criteria:

#### Automated Verification:

- Bramka lokalna przechodzi: `npm run lint`, `npx astro check`, `npm test`, `npm run build`
- Push do draft PR (za zgodą Karola): CI zielone, w `smoke` nowe kroki kasowania przechodzą
- Próbny alarm smoke: `/r/[id].astro` czyta `gone` jak `removed`; czerwony tylko krok „deleted game's guest sees it is gone”; po `git revert` CI zielone

#### Manual Verification:

- Karol widzi na `/dev/room-states` stan „Gra skasowana” i akceptuje tekst

**Implementation Note**: Przewidywanie alarmu przed pushem: czerwony wyłącznie krok smoke „deleted game's guest sees it is gone” (ciało bez „Tej gry już nie ma.”); `ci`, `db`, `e2e` zielone. Wynik w `test-plan.md` §6.2 albo przy smoke. Serwer dev tylko do podglądów `/dev/*`, zatrzymać po pracy. Po fazie pauza na akceptację Karola.

---

## Faza 3: Ekrany

### Overview

Strona `/gry` z kasowaniem w miejscu, link na `/`, warianty wyglądu na zrzutach dla Karola, `/dashboard` usunięty, e2e i próbny alarm.

### Changes Required:

#### 1. Strona listy

**File**: `src/pages/gry.astro` (nowy), `src/components/room/HostGames.tsx` (nowy), `src/components/room/DeleteGameButton.tsx` (nowy)

**Intent**: Decyzje 3 i 7: host widzi swoje gry i kasuje wybraną, a potwierdzenie mówi, co zostaje.

**Contract**:

- `gry.astro`: `Layout title="Twoje gry"`, `AppHeader`, kolumna jak `index.astro:40` (`max-w-lg`), tytuł „Twoje gry” pierwszy w DOM (h1); serwer woła `hostGames`, formatuje datę (`Europe/Warsaw`, decyzja 3), liczbę pytań przez `plural` (`summary.ts:32-39`: „1 pytanie”, „2 pytania”, „7 pytań”) albo dopisek o grze bez startu, i podaje wyspie gotowe napisy z `id`. Awaria bazy: `ServerError` z `roomErrorMessage` i status 503/500, bez cichego pustego stanu. Pusta lista: zdanie „Nie masz jeszcze zakończonych gier.” i link do `/`.
- `HostGames.tsx`: lista wierszy (data, pytania, nicki); po udanym kasowaniu wiersz znika lokalnie, region `aria-live` mówi „Gra usunięta.”, fokus przez `useRowFocus` (`focus.ts:46-64`): „Usuń” następnego wiersza, inaczej zdanie pustej listy, inaczej tytuł strony (zasada fokusu z `AGENTS.md`).
- `DeleteGameButton.tsx`: wzór `RemovePlayerButton.tsx:66-87`, `:123-159` bez `refreshes` (lista nie ma stanu pokoju): „Usuń” → ten sam przycisk staje się „Na pewno usunąć tę grę?”, pod nim zdanie z decyzji 7 i „Anuluj” (fokus wraca na „Usuń”); w trakcie „Usuwam…” z `aria-disabled`; odmowa → `ServerError` w wierszu. Wysyła `sendRoomAction(id, "delete", {})`.
- Stany na `/dev/room-states` (nowa grupa „Twoje gry (/gry)”): lista z kilkoma grami (jedna bez startu, długa lista nicków), potwierdzenie otwarte, wysyłanie, odmowa, pusta lista, awaria bazy.
- `scripts/ui-literals.mjs` (`:8-18`): `src/pages/gry.astro` na liście widoków.

#### 2. Wejście z głównej i koniec `/dashboard`

**File**: `src/pages/index.astro`, `src/middleware.ts`, `src/pages/dashboard.astro` (usunięty), `scripts/smoke.mjs`, `docs/development.md`, `src/pages/dev/room-states.astro`

**Intent**: Decyzja 4.

**Contract**: na `/` dla zalogowanego link „Twoje gry” przy karcie „Nowa gra” (miejsce i wygląd z wariantu wybranego przez Karola), stany `/` z linkiem na `/dev/room-states` (z otwartym pokojem i bez); `PROTECTED_ROUTES = ["/gry"]` (`middleware.ts:5`); `dashboard.astro` usunięty; trzy kroki smoke (`:111,125,127`) na `/gry` („gry redirects anonymous user”, „gry renders for signed-in user”, „gry redirects after signout”); `docs/development.md` (`:136-160`): wiersz `/dashboard` znika, `/gry` w „Game routes”.

#### 3. Warianty wyglądu (decyzja Karola)

**File**: strona HTML ze zrzutami w scratchpadzie

**Intent**: Karol wybiera wygląd wiersza listy, potwierdzenia i linku na głównej.

**Contract**: 2–3 warianty każdego z trzech elementów jako zrzuty w headless Chrome (laptop jako całe okno 1:1, telefon w prawdziwej wielkości), strona HTML z „Co oceniasz” otwarta w Chrome Karola; po wyborze zrzuty gotowych ekranów do akceptacji.

#### 4. E2E

**File**: `tests/e2e/game-history.spec.ts` (nowy), `playwright.config.ts`, `tests/e2e/support/room.ts`, komentarze w `tests/e2e/*.spec.ts`

**Intent**: Dowód w przeglądarce: lista, potwierdzenie, kasowanie, fokus i ekran gościa.

**Contract**:

- Scenariusz 1: host zakłada pokój (`openRoom`, `room.ts:31-59`), dwóch gości wchodzi (`joinRoom`), `startGame`, `endGame`, `eveningEnd` (`round.ts:23-27,111-117,126-128`); host na `/` klika „Twoje gry”, wiersz z nickami gości jest na liście; „Usuń” → widać „Na pewno usunąć tę grę?” i zdanie o anonimowych licznikach; „Anuluj” zwraca fokus na „Usuń”; ponownie „Usuń” i potwierdzenie → wiersza nie ma, fokus nie zginął; gość odświeża kartę → „Tej gry już nie ma.” (404); stary link w obcym kontekście → 404 i `deadLinkTitle` (`room.ts:129-131`).
- Wiersz szukany po unikalnych nickach (`uniqueNick`), bo host e2e ma wiele zakończonych gier.
- `playwright.config.ts:42`: `game-history` w `testMatch` projektu `phone`.
- Komentarze „until S-13” / „nothing can delete them yet (S-13)” w `tests/e2e/*.spec.ts` i `support/room.ts:20` przepisane (testy same nie kasują pokoi, baza joba jest jednorazowa); `grep -rn "S-13" tests scripts` bez trafień.

### Success Criteria:

#### Automated Verification:

- Bramka lokalna przechodzi: `npm run lint`, `npx astro check`, `npm test`, `npm run build`
- Push (za zgodą Karola): CI zielone, `game-history.spec.ts` przechodzi w `chromium` i `phone`
- Próbny alarm e2e: `HostGames` nie usuwa wiersza po udanym kasowaniu; czerwony tylko krok „wiersza nie ma” w `game-history.spec.ts` (oba projekty); po `git revert` CI zielone

#### Manual Verification:

- Karol wybiera warianty wiersza, potwierdzenia i linku na zrzutach
- Karol akceptuje zrzuty gotowych ekranów (`/gry`, `/` z linkiem, potwierdzenie, pusta lista) na laptopie i telefonie

**Implementation Note**: Wygląd wybiera Karol przed pisaniem gotowych ekranów (zasada „Wygląd ekranu = decyzja Karola”). Próbny alarm według `test-plan.md` §6.4 „Break-check”, wynik w rejestrze §6.4. Serwer dev zatrzymać po zrzutach (`npx astro dev stop`). Po fazie pauza na akceptację Karola.

---

## Faza 4: Wdrożenie

### Overview

Baza, potem kod (`context/deployment/deploy-plan.md`), smoke na produkcji (pierwszy przebieg sprząta stare gry konta smoke) i sprawdzenie Karola.

### Changes Required:

#### 1. Baza na produkcji

**Intent**: Migracja na produkcji przed scaleniem kodu.

**Contract**:

- PR gotowy do przeglądu (nie draft), CI zielone;
- `npx supabase db push --dry-run` (pokazuje tylko migrację tej zmiany), `npx supabase db push`, `npx supabase migration list`, każde za zgodą Karola i nie z eduroam;
- `npx supabase db advisors --linked --type security`: nowe ostrzeżenia 0029 dla `host_games` i `delete_game` (funkcje `authenticated`, host sprawdzany w środku) są zamierzone;
- smoke na serwerze dev (nowy kod na produkcyjnej bazie, za zgodą): pierwszy przebieg kasuje zaległe gry konta smoke, kroki kasowania zielone;
- `deploy-plan.md` („Wgrane migracje”) dostaje wpis z wynikiem advisors i smoke.

#### 2. Scalenie i sprawdzenie

**Intent**: Kod na produkcji i dowód, że działa.

**Contract**: scala Karol (`! gh pr merge <n> --merge`). Potem `BASE_URL=https://most-likely-to.charlesonthewave.workers.dev npm run smoke` (za zgodą) i przeklikanie Karola.

### Success Criteria:

#### Automated Verification:

- `npx supabase migration list` pokazuje nową migrację lokalnie i zdalnie
- Smoke na produkcji zielony, kroki kasowania przechodzą

#### Manual Verification:

- Karol scala PR
- Karol na laptopie i telefonie: „Twoje gry” z głównej, lista swoich zakończonych gier z datą, liczbą pytań i nickami, kasuje jedną testową grę (zdanie o anonimowych licznikach widoczne), a karta gościa tej gry po odświeżeniu mówi „Tej gry już nie ma.”

**Implementation Note**: Do testu Karol zakłada krótką grę (np. z drugim telefonem jako gość) i kasuje ją, nie prawdziwy wieczór z ekipą, chyba że sam tak zdecyduje.

---

## Testing Strategy

### Unit Tests:

- Brama RPC: nazwy i argumenty `host_games`, `delete_game`; `SUCCESS` dla listy.
- Parsery: stan `gone`, lista gier (poprawny kształt, `startedAt: null`, pusta, złe kształty).
- Teksty: `game_not_ended` z własnym tekstem.

### Integration Tests:

- `tests/db/game-history.test.ts`: lista (kolejność, liczba pytań, nicki, gra bez startu, bez otwartego pokoju), kasowanie (dokładnie `{ok:true}`, skutki dla gościa i linku), odmowy (`game_not_ended`, `room_unknown`, `42501`).
- `tests/db/latecomers.test.ts`: brakujący pokój → `gone`.
- pgTAP: kaskada do zera wierszy z rundą z listy i zatwierdzoną propozycją, `question_stats` przyrost 0, obcy host, granty i wersje.
- Smoke: lista, odmowy, kasowanie wszystkich zakończonych gier konta, ekran gościa i stary link po skasowaniu.
- E2E `game-history.spec.ts` w `chromium` i `phone`.

### Manual Testing Steps:

1. Na `/dev/room-states`: stan „Gra skasowana” i grupa „Twoje gry (/gry)” (Faza 2 i 3).
2. Zrzuty wariantów i gotowych ekranów na laptopie i telefonie (Faza 3).
3. Na produkcji: „Twoje gry”, skasowanie testowej gry, karta gościa po odświeżeniu (Faza 4).

## Performance Considerations

- `host_games` czyta wszystkie zakończone gry hosta bez limitu (lista minimalna, bez stronicowania); host z ekipą ma ich dziesiątki. Konto smoke przed pierwszym sprzątaniem na produkcji może mieć ich kilkaset: krok „host deletes every finished game” robi wtedy kilkaset żądań po kolei (rzędu minuty), potem już kilka na przebieg.
- `delete_game` to jedna instrukcja z kaskadą po indeksach kluczy obcych pokoju; pojedyncza gra ma dziesiątki wierszy.

## Migration Notes

- Migracja nie zmienia danych ani schematu tabel: dwie nowe funkcje i nowa wersja `join_request_state`. Wycofanie to nowa migracja (bez kasowania czegokolwiek, co już skasowano).
- Stary Worker po `db push` nie zna `host_games`, `delete_game` ani stanu `gone`; do scalenia nikt poza smoke na serwerze dev nie kasuje gier.

## References

- Research: `context/changes/host-game-history/research.md`
- Roadmapa S-13: `context/foundation/roadmap.md:273-283`; PRD FR-019: `context/foundation/prd.md:135`
- Wzór funkcji hosta: `supabase/migrations/20261027121442_co_host_role.sql:595-643`
- Wzór trasy akcji: `src/pages/api/rooms/[id]/cohost.ts:24-48`; GET: `src/pages/api/rooms/[id]/lobby.ts:16-44`
- Wzór potwierdzenia w miejscu: `src/components/room/RemovePlayerButton.tsx:66-159`
- Przegląd S-06 (F2, F3 odłożone do S-13): `context/archive/2026-10-24-question-list-review/follow-ups/review-fixes.md:3-19`
- Podobna zmiana (baza → serwer → ekrany → wdrożenie): `context/changes/remove-player-new-link/plan.md`

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: Baza

#### Automated

- [x] 1.1 Bramka lokalna przechodzi: `npm run lint`, `npx astro check`, `npm test`, `npm run build`
- [x] 1.2 `npx prettier --check` dla nowych i zmienionych plików `.md` przechodzi
- [x] 1.3 Draft PR do `main` (push za zgodą Karola): CI zielone we wszystkich jobach, w `db` nowe testy `game-history.test.ts` i nowe asercje pgTAP przechodzą — PR #51, `a960e7b`: `ci`, `smoke`, `db`, `e2e` zielone, w `db` 17/17 testów `game-history.test.ts` i pgTAP 458/458
- [x] 1.4 Próbny alarm: tymczasowy commit zapala tylko przewidziane testy; po `git revert` CI zielone — 5020afe, revert de34a30, CI zielone na 8f88051

#### Manual

- [x] 1.5 Karol czyta streszczenie migracji (co widzi lista, kto i co może skasować, co znika, co zostaje, co widzi gość) i je akceptuje — 54f38ce

### Phase 2: Serwer gry

#### Automated

- [x] 2.1 Bramka lokalna przechodzi: `npm run lint`, `npx astro check`, `npm test`, `npm run build` — 54f38ce
- [x] 2.2 Push do draft PR (za zgodą Karola): CI zielone, w `smoke` nowe kroki kasowania przechodzą — 8f88051
- [x] 2.3 Próbny alarm smoke: `/r/[id].astro` czyta `gone` jak `removed`; czerwony tylko krok „deleted game's guest sees it is gone”; po `git revert` CI zielone — 5020afe, revert de34a30, CI zielone na 8f88051

#### Manual

- [x] 2.4 Karol widzi na `/dev/room-states` stan „Gra skasowana” i akceptuje tekst

### Phase 3: Ekrany

#### Automated

- [x] 3.1 Bramka lokalna przechodzi: `npm run lint`, `npx astro check`, `npm test`, `npm run build`
- [ ] 3.2 Push (za zgodą Karola): CI zielone, `game-history.spec.ts` przechodzi w `chromium` i `phone`
- [ ] 3.3 Próbny alarm e2e: `HostGames` nie usuwa wiersza po udanym kasowaniu; czerwony tylko krok „wiersza nie ma” w `game-history.spec.ts` (oba projekty); po `git revert` CI zielone

#### Manual

- [x] 3.4 Karol wybiera warianty wiersza, potwierdzenia i linku na zrzutach
- [x] 3.5 Karol akceptuje zrzuty gotowych ekranów (`/gry`, `/` z linkiem, potwierdzenie, pusta lista) na laptopie i telefonie

### Phase 4: Wdrożenie

#### Automated

- [ ] 4.1 `npx supabase migration list` pokazuje nową migrację lokalnie i zdalnie
- [ ] 4.2 Smoke na produkcji zielony, kroki kasowania przechodzą

#### Manual

- [ ] 4.3 Karol scala PR
- [ ] 4.4 Karol na laptopie i telefonie: „Twoje gry” z głównej, lista swoich zakończonych gier z datą, liczbą pytań i nickami, kasuje jedną testową grę (zdanie o anonimowych licznikach widoczne), a karta gościa tej gry po odświeżeniu mówi „Tej gry już nie ma.”
