# Historia gry w panelu hosta (S-26) Implementation Plan

## Overview

Host na liście „Twoje gry” (`/gry`) otwiera zakończoną grę na osobnej stronie `/gry/<id>`. Widzi podsumowanie wieczoru jak na ekranie końca gry, a pod nim pytania w kolejności, w jakiej padły, przy każdym wynik odsłony taki, jaki widział pokój (ile głosów dostał każdy nick, ile osób się wstrzymało). Pytanie pominięte i przerwane bez odsłony są oznaczone. Widzi to tylko host; gra nie zapisuje nic nowego (PRD FR-030, roadmapa S-26, wariant B z 2026-11-20).

**Decyzje Karola (2026-11-20, przy planie):**

1. **Osobna strona gry** `/gry/<id>`, a nie rozwinięcie karty na liście (rekomendacja). Wygląd strony Karol wybiera na zrzutach (Faza 3).
2. **Krótki dopisek przy usuniętym graczu:** przy odsłonie, w której suma głosów i wstrzymań jest mniejsza niż liczba osób, które oddały głos, strona pokazuje zdanie w rodzaju „Część głosów przepadła razem z usuniętym graczem.”, bez liczby i bez nicku (brzmienie z galerii).
3. **Plakietki pochodzenia pytania:** „Twoje” przy pytaniu własnym hosta i przy przeredagowanym, „propozycja gościa” przy zatwierdzonej propozycji (nigdy autor); pytanie z bazy bez plakietki (brzmienie z galerii).

**Przyjęte bez osobnego pytania (z researchu i PRD, Karol mógł zmienić):**

4. Gra, która nie wystartowała, nie dostaje wejścia w historię (nie ma czego pokazać; po starcie gra ma zawsze co najmniej jedną rundę, `start_game` otwiera pierwszą, `20261116172906_security_hardening.sql:629`).
5. Pytania z bazy pokazują dzisiejsze brzmienie z `src/data/questions.ts` (poprawka literówki zmienia też starą grę): FR-030 mówi „adds nothing to what the database keeps”, więc bez kopii tekstu.
6. Wykres przy każdym pytaniu, układ strony i wejście z karty: wybór Karola na zrzutach w Fazie 3.
7. Historię widzi tylko host gry (PRD Access Control, FR-030); współhost i goście nie mają panelu.

## Current State Analysis

- Po zamknięciu gry baza trzyma wszystko, czego historia potrzebuje, aż host skasuje grę: `public.rooms`, `public.players`, `private.rounds`, `private.round_results`, `private.game_questions` (research, „Baza: co zostaje po grze”). Kolejność pytań to `rounds.number`, bez dziur.
- Los rundy wynika z danych: `phase = 'revealed'` (z `abstained`, `ballots`, wierszami `round_results`), `phase = 'skipped'` (bez wyników), `phase = 'voting'` w pokoju `closed` = przerwana bez odsłony (co najwyżej ostatnia runda gry).
- `ballots` to liczba osób, które oddały kartkę (głos albo wstrzymanie, `count(*)` z `round_voters`, `20261026074427_question_play_data.sql:180-182`); `round_results` dostaje wiersz tylko dla uprawnionych, którzy wciąż istnieją (`:184-188`). Głosy na gracza usuniętego (S-09) przepadają, więc suma głosów + `abstained` < `ballots` wskazuje dokładnie taką odsłonę. `room_lobby` już dziś oddaje `ballots` przy odsłonie każdemu graczowi (`REVEALED_ROUND_KEYS`, `tests/db/support/rounds.ts:313-321`), więc liczba nie jest nową klasą danych.
- Żadna funkcja nie oddaje wyników rund zakończonej gry: `host_games()` daje tylko `{id, created_at, started_at, questions, nicks}` (`20261110131123_host_game_history.sql:48-73`), a `game_totals` w `room_lobby` same sumy (`20261114101656_players_channel_key.sql:400-430`).
- Tekst pytania: runda z bazy ma `question_id`, tekst tylko w Workerze (`baseQuestionText`, `src/lib/rooms/server.ts:277`); runda z listy gry ma `list_position`, a gdy wpis ma własny tekst (przeredagowany, własny hosta, zatwierdzona propozycja), `question_id = null` i tekst w `game_questions.text` (`20261107091322_game_length.sql:132`, `security_hardening.sql:578`); `proposed = true` oznacza zatwierdzoną propozycję (`20261104095452_guest_question_proposals.sql:246-249`).
- Ekrany: tabela wyniku i `ResultPie` siedzą w `RoundReveal.tsx:59-82`, `:163-219`, spięte z `view`; `GameSummary.tsx:9-17` bierze z `view` tylko kolory (`playerColors(view.players)`) i `view.me`. `HostGames.tsx:86-97` ma kartę bez wejścia w grę; `hostGameRow` (`src/lib/rooms/game-list.ts:42-51`) daje gotowe napisy.
- `/gry/<id>` jest już chronione: `PROTECTED_ROUTES = ["/gry"]` sprawdzane `startsWith` (`src/middleware.ts:7`, `:33`).
- Serwer dev (`.dev.vars`) wskazuje na produkcyjne Supabase, gdzie `game_history` pojawi się dopiero po `db push` w Fazie 4. Do tego czasu prawdziwą stronę sprawdza tylko CI (`smoke`, `db`, `e2e` na lokalnym Supabase, `.github/workflows/ci.yml:33-80`), a ekrany podglądy `/dev/room-states` bez sieci.

## Desired End State

- Na `/gry` karta gry, która wystartowała, prowadzi do `/gry/<id>`; karta gry bez startu nie ma wejścia.
- `/gry/<id>` dla zalogowanego hosta tej gry: tytuł z datą gry, powrót do „Twoje gry”, podsumowanie wieczoru jak na ekranie końca (gdy była choć jedna odsłona), potem pytania w kolejności rund:
  - odsłona: tekst pytania, tabela (nick z kolorem, głosy; najwięcej na górze, remis w kolejności miejsc, zera na dole), „Wstrzymało się: N”, przy utraconych głosach dopisek;
  - pominięte i przerwane bez odsłony: tekst pytania i oznaczenie;
  - plakietka „Twoje” albo „propozycja gościa”, gdy pytanie nie jest z bazy;
  - pytanie, którego tekstu Worker nie zna: zdanie zastępcze, runda dalej widoczna.
- Bez sesji: przekierowanie na logowanie; cudza gra, nieznane id, gra otwarta: 404; baza nie odpowiada: 503/500 z tekstem błędu, nigdy pusta historia.
- Do przeglądarki idzie tylko wyrenderowany HTML: strona bez wyspy (`client:*`), więc ani id pytań, ani `ballots`, ani nic poza tym, co widać, nie trafia do propsów.
- Weryfikacja: testy bazy, pgTAP, testy jednostkowe, smoke, e2e, galeria i podglądy, smoke na produkcji, sprawdzenie Karola na prawdziwych grach z 19.11.

### Key Discoveries:

- Wzór funkcji hosta: `delete_game` (`20261110131123_host_game_history.sql:81-114`): `v_user := (select auth.uid())`, obcy host i brak pokoju to ta sama odmowa `room_unknown`, `game_not_ended` dla pokoju niezamkniętego, właściciel `postgres`, `revoke` i `grant … to authenticated` (`:189-202`).
- Wzór tekstu pytania z listy w SQL: `room_lobby` (`players_channel_key.sql:342-348`); wzór złożenia tekstu w Workerze: `roomView` (`server.ts:319-345`), `listQuestions` (`:289-298`).
- Wzór strony hosta z błędem bazy: `src/pages/gry.astro:14-30` (503/500, `roomErrorMessage`, nigdy pusta lista); id pokoju sprawdza `UUID_PATTERN` (`src/lib/rooms/tokens.ts:8`, użycie `src/pages/r/[id].astro:41`).
- Reguła podsumowania: `gameSummary` (`src/lib/rooms/summary.ts:19-30`) z `GameTotals` (sumy tylko z odsłon, gracz z wynikiem w co najmniej jednej odsłonie, kolejność miejsc); kolejność wierszy wyniku: `sortResults` (`src/lib/rooms/results.ts`); data: `gameDate` (`src/lib/rooms/game-list.ts:36-39`).
- Testy S-13 do rozszerzenia (raport mapy testów): brama RPC `tests/unit/room-rpc-gate.test.ts` (`SQL_SIGNATURES` :43-213, `SUCCESS` :216-223, `CASES` :263-563); pgTAP `supabase/tests/round_creator_view.test.sql` (`plan(506)` :90, katalog S-13 :2013-2032, scenariusz :3070-3190 z `round_sources` = `'1 revealed at 1, 2 skipped at 4, 3 voting at 2'` :3127, drugi host :3153-3175); testy bazy `tests/db/game-history.test.ts` (jeden host, `GAME_KEYS` :45, odmowy :243-264); smoke: główna gra ma odsłonę, pominiętą propozycję, drugą odsłonę i rundę przerwaną (`scripts/smoke.mjs:751-857`), a `deleteSteps()` (:1145, wołane :1283) kasuje ją na końcu; e2e `tests/e2e/game-history.spec.ts` (bez sprawdzenia okna telefonu, choć biegnie w projekcie `phone`).
- Limit rejestracji w testach bazy: 27 kont z 30 na przebieg (`context/foundation/test-plan.md:215`).
- `scripts/ui-literals.mjs:8-20`: nowa strona `src/pages/gry/[id].astro` trzeba dopisać do `VIEWS` ręcznie; komponenty w `src/components/room/` są objęte same.

## What We're NOT Doing

- Bez dostępu współhosta i gości, bez linku do historii w pokoju, bez porównań i sum między grami (FR-030: „No ranking and no totals across games”).
- Bez zapisu czegokolwiek nowego: bez kopii tekstu pytań, bez kolumny z czasem końca gry, bez zmian w zapisach gry; historia trwa do skasowania gry (FR-019).
- Bez „kto już zagłosował” i bez liczby głosujących na ekranie; `ballots` zostaje w Workerze, strona dostaje tylko „dopisek tak/nie”. Bez nicku usuniętego gracza i bez liczby utraconych głosów.
- Bez nowej trasy API (`GET /api/rooms/<id>/history`): smoke czyta samą stronę.
- Bez skryptu w przeglądarce na stronie historii: bez przełącznika „Koło/Paski” (jeśli Karol wybierze wykres przy pytaniu, jest statyczny).
- Bez zmiany wyglądu odsłony w pokoju i ekranu końca gry: wydzielenie tabeli i zmiana propsów `GameSummary` zostawiają ich DOM i klasy bez zmian.
- Bez stanu w `/dev/room-window` (okno, nagłówek i pasek hosta bez zmian).
- Bez rozróżniania na stronie historii, dlaczego runda została przerwana (koniec gry, „Nowa gra”, sprzątanie): baza tego nie wie.
- Bez edycji `context/domain/domain-distillation.md` (wynik skilla) i niczego w `context/archive/`.

## Implementation Approach

Jedna migracja dodaje `public.game_history(p_room_id uuid)`: odmowy jak w `delete_game`, potem gracze (nick, kolor) i rundy po kolei z tekstem wpisu listy, rodzajem pytania i, przy odsłonie, wynikami, wstrzymaniami i liczbą kartek. Worker czyta ją (parser z samymi kluczami kontraktu), zamienia id pytań na tekst, liczy podsumowanie tą samą regułą co koniec gry (`gameSummary` z sum odsłon) i dopisek, a strona `/gry/<id>` renderuje gotowy widok na serwerze. Ekrany: najpierw galeria wariantów do wyboru Karola, potem wydzielenie tabeli wyniku z `RoundReveal`, nowe propsy `GameSummary`, komponent historii, wejście z karty na `/gry`, podglądy, e2e i smoke na treść. Wdrożenie: baza przed kodem.

## Critical Implementation Details

- **Kolejność wdrożenia:** `db push` przed scaleniem kodu. Migracja tylko dodaje funkcję, której stary Worker nie woła, więc wgrana wcześniej nic nie zmienia.
- **Lokalnie nie ma prawdziwej strony przed `db push`:** serwer dev wskazuje na produkcyjne Supabase bez `game_history`, więc trasę sprawdzają kroki smoke i e2e w CI (lokalne Supabase z migracjami), a wygląd podglądy `/dev/room-states` z danymi z ręki. Nie odpalać `npm run smoke` lokalnie dla kroków historii przed `db push`.
- **Podsumowanie z tych samych rund co tabele:** suma po graczach z wynikiem w co najmniej jednej odsłonie, w kolejności miejsc (lista `players` jest w kolejności miejsc, wyniki rundy też), to ta sama reguła co `game_totals`; test bazy porównuje sumy z historii z `game_totals` z `room_lobby` tej samej gry, żeby dwie drogi się nie rozjechały.
- **Gracz usunięty w trakcie głosowania** też daje dopisek (głosy na niego przepadły już przy odsłonie); zdanie „przepadła razem z usuniętym graczem” jest wtedy dalej prawdziwe. Gracz usunięty, który sam głosował albo się wstrzymał, dopisku nie daje (jego kartka zostaje policzona).

## Faza 1: Baza

### Overview

Funkcja `game_history`, testy bazy i pgTAP, próbny alarm na draft PR.

### Changes Required:

#### 1. Migracja

**File**: `supabase/migrations/<timestamp>_game_history_details.sql` (przez `npx supabase migration new game_history_details`)

**Intent**: Host dostaje jedną zakończoną grę z wynikami odsłon, bez niczego, czego pokój nie widział na odsłonach.

**Contract**:

- `public.game_history(p_room_id uuid) returns jsonb`, `language plpgsql`, `stable`, `security definer`, `set search_path = ''`, nazwy z prefiksem schematu, właściciel `postgres`, `revoke execute … from public, anon, authenticated`, `grant execute … to authenticated`. Nic nie zapisuje.
- Odmowy przed odczytem czegokolwiek z gry (wzór `delete_game`): brak pokoju, brak `auth.uid()` albo obcy host → `{ok:false, reason:'room_unknown'}`; `status <> 'closed'` → `{ok:false, reason:'game_not_ended'}`.
- Odpowiedź: `{ok:true, created_at, started_at, me, players, rounds}`:
  - `me`: nick gracza hosta (`players.user_id = rooms.host_id`);
  - `players`: `[{nick, color}]` wszystkich graczy pokoju w kolejności `seat`;
  - `rounds`: w kolejności `number`; każda runda `{number, phase, question_id, question_text, origin}`, a odsłonięta dodatkowo `{results, abstained, ballots}`; `results` to `[{nick, votes}]` z `round_results` złączonych z `players`, w kolejności `seat`, zera też;
  - `question_text`: tekst wpisu listy (`game_questions.text` przez `list_position`), gdy wpis go ma, inaczej `null`; `question_id` jak w rundzie;
  - `origin`: `'proposal'`, gdy wpis listy ma `proposed`; `'own'`, gdy wpis ma własny tekst (własne i przeredagowane); `'base'` w pozostałych przypadkach (runda bez `list_position` albo wpis bez tekstu).
- Nagłówek migracji: FR-030 i decyzje 1–3, co funkcja oddaje i czego nie (głosujący, „kto już zagłosował”, autor propozycji), że `ballots` służy tylko dopiskowi w Workerze, kolejność wdrożenia (baza przed kodem).

#### 2. Testy bazy

**File**: `tests/db/game-history.test.ts`, `tests/db/support/rounds.ts`

**Intent**: Dowieść kontraktu przez REST jako host, z wyrocznią pisaną ręcznie. Przed pisaniem przeczytaj `context/foundation/test-plan.md` §6 (§6.2 i §6.3).

**Contract**:

- `support/rounds.ts`: wrapper `gameHistory(client, roomId)` obok `deleteGame` (:524), komentarz kontraktu obok bloku S-13 (:201-212), stałe kluczy `HISTORY_KEYS`, `HISTORY_PLAYER_KEYS`, `HISTORY_ROUND_KEYS`, `HISTORY_REVEALED_ROUND_KEYS` (wyniki: istniejące `RESULT_KEYS`).
- `game-history.test.ts`: nowy `describe` z własnym `beforeAll` i hostem pliku (bez nowej rejestracji, dalej 27 kont); kolejne gry tego hosta według reguły S-20 z §6.2. Jedna gra z listą przejrzaną przez hosta (wpis przeredagowany i własne pytanie), co najmniej trzema gośćmi i zatwierdzoną propozycją, która pokrywa:
  - odsłonę z wstrzymaniem;
  - odsłonę, po której gość z głosami zostaje usunięty (`removePlayer`): jego wiersza nie ma w `results`, `ballots` bez zmian, więc suma głosów + `abstained` < `ballots`;
  - rundę pominiętą i rundę przerwaną przez `end_game` (`phase: 'voting'`), obie bez `results`, `abstained`, `ballots`;
  - `origin` każdego rodzaju: `base`, `own` (przeredagowane i własne), `proposal`, z `question_text` wpisu albo `null`;
  - dokładne zbiory kluczy na każdym poziomie (`keysOf`, wzór `GAME_KEYS` :204-206);
  - sumy wyników z odsłon historii równe `game_totals.totals` z `room_lobby` tej samej gry jako host.
- Odmowy z argumentami, które przepuszczone coś by oddały: otwarty pokój hosta → dokładnie `{ok:false, reason:'game_not_ended'}`; losowy UUID → `room_unknown`; `anon` → `42501` z nazwą funkcji w komunikacie (wzór :258-264).

#### 3. Widok twórcy (pgTAP)

**File**: `supabase/tests/round_creator_view.test.sql`

**Intent**: Przypiąć granty i obcego hosta, których klucz publishable nie sprawdzi bez nowej rejestracji.

**Contract**:

- Nagłówek pliku (:44-47) wymienia `game_history`. Blok katalogu S-13 (:2013-2032) dostaje `function_facts('public.game_history(uuid)')` = `security definer | owner postgres | search_path="" | execute: authenticated` i `versions_of('game_history')` = `game_history(p_room_id uuid)`.
- W scenariuszu S-13 (:3070-3190), przed skasowaniem gry: kontrola pozytywna (własny host dostaje `ok` z rundami zgodnymi z `round_sources`: 1 odsłonięta, 2 pominięta z `origin = 'proposal'`, 3 przerwana), drugi host (`open_room('deleted-other', …)`, :3153) → `room_unknown`, wywołanie bez wołającego → `room_unknown`, a `game_rows` bez zmian (funkcja nic nie zapisuje).
- `plan(N)` zaktualizowany.

### Success Criteria:

#### Automated Verification:

- Bramka lokalna przechodzi: `npm run lint`, `npx astro check`, `npm test`, `npm run build`
- Draft PR do `main` (push za zgodą Karola): CI zielone we wszystkich jobach, w `db` nowe testy `game-history.test.ts` i nowe asercje pgTAP przechodzą
- Próbny alarm: tymczasowy commit zapala tylko przewidziane testy; po `git revert` CI zielone

#### Manual Verification:

- Karol czyta krótkie streszczenie funkcji (co oddaje, komu, czego nigdy) i je akceptuje

**Implementation Note**: Próbny alarm według `test-plan.md` §6.2 „Break-check”: `game_history` bez sprawdzenia właściciela (każdy zalogowany host czyta każdą zakończoną grę). Przewidywania przed pushem w opisie commita, z nazwy (pgTAP: obcy host; bez wołającego, jeśli usunięte sprawdzenie je obejmuje; testy bazy nie mają drugiego hosta). Tymczasowej migracji nigdy nie wgrywamy; na końcu `git diff main...HEAD -- supabase/migrations` pokazuje tylko migrację zmiany. Wynik w §6.2. Po fazie pauza na akceptację Karola.

---

## Faza 2: Serwer gry

### Overview

Odczyt historii w Workerze, widok strony, strona `/gry/<id>` z odpowiedziami 200/404/302/503/500, testy jednostkowe, kroki smoke, próbny alarm.

### Changes Required:

#### 1. Parser i typy

**File**: `src/lib/rooms/shared.ts`

**Intent**: Worker bierze z odpowiedzi bazy tylko klucze kontraktu, jak `parseHostGames`.

**Contract**: `parseGameHistory(value: unknown): ParseResult<GameHistoryRecord>`; kopiuje tylko klucze z Fazy 1 (klucz spoza kontraktu zostaje w parserze); `phase` w `revealed | skipped | voting`, `origin` w `base | own | proposal`; runda odsłonięta wymaga `results`, `abstained`, `ballots`, pozostałe ich nie mają; `field` w błędzie nazywa klucz bazy. Odmowy `room_unknown` i `game_not_ended` przechodzą jak w `actionResult`.

#### 2. Widok historii

**File**: `src/lib/rooms/history.ts` (nowy), `src/lib/rooms/server.ts`

**Intent**: Strona dostaje gotowy widok: tekst każdego pytania, podsumowanie liczone regułą końca gry i dopisek jako tak/nie.

**Contract**:

- `history.ts` (tylko typy z `shared.ts` i `gameSummary`/`plural`, bez kodu serwera; `context/foundation/lessons.md`, „Pytania gry tylko po stronie serwera”): `historyTotals(players, rounds): GameTotals | null` (null bez odsłony; suma po graczach z wynikiem w co najmniej jednej odsłonie, kolejność miejsc) i `votesLost(round): boolean` (suma `votes` + `abstained` < `ballots`).
- `server.ts`: `gameHistory(supabase, roomId): Promise<GameHistoryResult>` (RPC `game_history` z `{p_room_id}`, wzór `hostGames` :630). Widok `GameHistoryView`: `date` (`gameDate(started_at ?? created_at)`), `started`, `me`, `players` (nick, kolor), `summary: GameSummary | null`, `questions`: po kolei `{number, text: string | null, origin, outcome}`, gdzie `outcome` to odsłona `{results (kolejność miejsc), abstained, votesLost}`, pominięcie albo przerwanie bez odsłony. Tekst: `question_text` wpisu albo `baseQuestionText` (nieznane id → `null` i dzisiejszy log `unknown_question` bez tekstu). `ballots` i `question_id` nie wychodzą poza Worker.

#### 3. Strona

**File**: `src/pages/gry/[id].astro` (nowy), `scripts/ui-literals.mjs`

**Intent**: Host czyta historię swojej gry; każdy inny przypadek ma jawny status.

**Contract**:

- `id` niezgodne z `UUID_PATTERN` → 404 bez zapytania do bazy; brak klienta Supabase → 503; `room_unknown` i `game_not_ended` → 404 jako `RoomMessage` (h1, ikona z jego zestawu, np. `gone` dla nieznanej albo skasowanej gry i `waiting` dla gry, która trwa; link „Twoje gry” jako `children`) z własnym zdaniem strony, nie tekstem `roomErrorMessage` tych kodów (te mówią o linku i o usuwaniu, `src/lib/rooms/errors.ts:73`, `:123`); brzmienie ostateczne z galerii Fazy 3; `service_unavailable` → 503, inne błędy → 500 z `roomErrorMessage`, nigdy pusta historia (wzór `gry.astro:14-30`). Bez sesji przekierowuje middleware.
- Render na serwerze, bez `client:*`. W tej fazie pierwsza wersja wyglądu najbliższa rekomendacji (tytuł z datą, podsumowanie, lista pytań); Faza 3 zmienia ją według wyboru Karola.
- `scripts/ui-literals.mjs`: `src/pages/gry/[id].astro` w `VIEWS`.

#### 4. Testy jednostkowe

**File**: `tests/unit/room-rpc-gate.test.ts`, `tests/unit/room-state.test.ts`, `tests/unit/game-history.test.ts` (nowy)

**Intent**: Wyrocznia pisana ręcznie dla wywołania, parsera i widoku (`test-plan.md` §6.1).

**Contract**:

- Brama RPC: wiersz `SQL_SIGNATURES` `game_history: [{ name: "p_room_id", hasDefault: false }]` z kotwicą migracji, wpis `SUCCESS` z poprawną odpowiedzią, przypadek w `CASES`, import.
- `parseGameHistory` (obok `describe("parseHostGames")`, :1522): przyjmuje kontrakt; klucze spoza kontraktu (`voter`, `target`, `eligible`, `host_id`) nie przechodzą; odmowa per pole (`it.each`) i dla odsłony bez wyników.
- `game-history.test.ts`: `historyTotals` (dwie odsłony, runda pominięta bez wkładu, spóźniony z wynikiem tylko w drugiej, gracz z zerem w `unvoted` po `gameSummary`, brak odsłony → `null`); `votesLost` (równe → `false`, mniej → `true`); `gameHistory` na udawanym kliencie: tekst z bazy dla `base`, tekst wpisu dla `own` i `proposal`, nieznane id → `text: null`, widok bez `ballots` i `question_id`.

#### 5. Smoke

**File**: `scripts/smoke.mjs`

**Intent**: Statusy strony na każdym przebiegu, także na produkcji.

**Contract**: kroki (nazwy nigdy nie mówią, kto na kogo głosował):

- bez sesji `/gry/<losowy uuid>` → 302 na `/auth/signin` (obok :126);
- host, losowy UUID → 404;
- host, otwarty `listRoom` → 404;
- host, główny pokój po `closingSteps()` (:1280), przed `deleteSteps()` (:1283) → 200.

Suma kroków w `test-plan.md` §6.5 (:432) zaktualizowana.

### Success Criteria:

#### Automated Verification:

- Bramka lokalna przechodzi: `npm run lint`, `npx astro check`, `npm test`, `npm run build`
- Push na draft PR za zgodą Karola: CI zielone, w `smoke` nowe kroki historii przechodzą
- Próbny alarm: tymczasowy commit zapala tylko przewidziane testy; po `git revert` CI zielone

**Implementation Note**: Próbny alarm: `parseGameHistory` kopiuje całą rundę zamiast kluczy kontraktu. Przewidywanie: w `ci` czerwony tylko test „klucze spoza kontraktu nie przechodzą”; `db`, `smoke`, `e2e` zielone. Wynik w `test-plan.md` §6.1, obok wpisów o alarmach testów jednostkowych (:151-158). Po fazie pauza.

---

## Faza 3: Ekrany

### Overview

Galeria wariantów i wybór Karola, wydzielenie tabeli wyniku, propsy `GameSummary`, komponent historii, wejście z karty, podglądy, e2e i smoke na treść, próbny alarm.

### Changes Required:

#### 1. Galeria wariantów (decyzja Karola)

**File**: zrzuty w scratchpadzie (podglądy z danymi z ręki, bez sieci)

**Intent**: Karol wybiera wygląd na zrzutach (`AGENTS.md`, „## UI”; pamięć: strona HTML z „Co oceniasz” w jego Chrome, laptop jako całe okno 1:1, telefon w prawdziwej wielkości).

**Contract**: warianty do wyboru: wejście z karty na `/gry` (cała karta jako link albo przycisk obok „Usuń”); układ strony (podsumowanie u góry jak ekran końca, dwie połowy od `lg` albo jedna kolumna; szerokość); przy każdym pytaniu sama tabela albo tabela z małym kołem; oznaczenia: pominięte, przerwane bez odsłony, dopisek, plakietki „Twoje” i „propozycja gościa”; zdania stron 404 (gra nieznana albo skasowana, gra, która trwa). Wybór Karola zapisany w `change.md` (Notes) i na górze tego planu.

#### 2. Wspólne części wyniku

**File**: `src/components/room/ResultTable.tsx` (nowy), `src/components/room/RoundReveal.tsx`, `src/components/room/GameSummary.tsx`, `src/components/room/RoomScreen.tsx`, `src/lib/rooms/chart.ts`

**Intent**: Historia używa tej samej tabeli, koła i podsumowania co pokój, bez zmiany wyglądu pokoju.

**Contract**:

- `ResultTable` (tabela z kropką koloru, „ty”, paskami i ruchem jak dziś) i `ResultPie` wydzielone z `RoundReveal.tsx:59-82`, `:163-216`; `RoundReveal` używa ich z tym samym DOM i klasami (e2e `round.spec.ts` sprawdza odsłonę i jej ruch). Propsy: `animate` (ruch odsłony, `reveal-motion.ts`) i `bars` (paski za nickiem, dziś `shown === "bars"`, `RoundReveal.tsx:182`); `ResultPie` dostaje klasę krawędzi (`stroke-background` w pokoju, `stroke-card` na karcie, jak koło podsumowania `GameSummary.tsx:137`).
- Strona historii rysuje je zawsze z `animate = false`: ruch odsłony gra tylko przy nowej odsłonie w otwartej karcie, nigdy po przeładowaniu (`AGENTS.md`, „## UI”), a historia to zawsze wejście na stronę.
- `GameSummary`: `view` zastąpione przez `colors: ReadonlyMap<string, number>` i `me: string | null`; `RoomScreen` (:124) podaje `playerColors(view.players)` i `view.me`.
- `playerColors` przyjmuje każdy zbiór `{nick, color}` (dziś `LobbyPlayer[]`).

#### 3. Strona historii

**File**: `src/components/room/GameHistory.tsx` (nowy), `src/pages/gry/[id].astro`

**Intent**: Wygląd z wyboru Karola na tokenach i powierzchniach gry.

**Contract**: tytuł pierwszy w DOM (h1 z datą), powrót do „Twoje gry”, `GameSummary` gdy `summary`, pytania jako `<ol>` (kafelki z `surfaces.ts`, gdy lista), przy odsłonie `ResultTable` z `sortResults`, „Wstrzymało się: N” i dopisek, oznaczenia, plakietki, zdanie zastępcze dla `text: null`; gra bez startu: jedno zdanie. Tylko klasy ról i tokeny (`AGENTS.md`, „## UI”); nowa para tekst–tło → wiersz w `PAIRS` (`scripts/contrast.mjs`); nowa kontrolka albo wariant przycisku → wiersz w `/dev/ui-kitchen-sink`.

#### 4. Wejście z listy

**File**: `src/lib/rooms/game-list.ts`, `src/components/room/HostGames.tsx`

**Intent**: Karta gry, która wystartowała, prowadzi do jej historii.

**Contract**: `HostGameRow` dostaje `href: string | null` (`/gry/<id>` albo `null` dla gry bez startu); `HostGames` rysuje wejście według wyboru Karola, „Usuń” i fokus po usunięciu bez zmian.

#### 5. Podglądy

**File**: `src/pages/dev/room-states.astro`

**Intent**: Każdy stan historii widać bez sieci (`AGENTS.md`, „## UI”).

**Contract**: nowa sekcja „Historia gry (/gry/<id>)” z danymi z ręki: pełna gra (odsłony, wstrzymania, dopisek, pominięte, przerwane, plakietki, pytanie bez tekstu), gra bez odsłony (bez podsumowania), gra bez startu, gra nieznana (404), gra, która trwa (404), błąd bazy; lista `/gry` z wejściem i kartą bez startu.

#### 6. E2E

**File**: `tests/e2e/game-history.spec.ts`

**Intent**: Prawdziwa przeglądarka: host wchodzi z listy w historię i widzi to, co pokój widział (`test-plan.md` §6.4).

**Contract**: ta sama jedna gra (budżet gier bez zmian), rozszerzona: dziś host kończy ją w trakcie pierwszego pytania (`tests/e2e/game-history.spec.ts:70-76`), a karta ma „1 pytanie” (`:87`). Teraz pierwsza runda odsłonięta głosami gości, druga pominięta („Pomiń pytanie”), trzecia przerwana końcem gry, a asercja karty zmienia się na „3 pytania”; `test.slow()` zostaje. Wejście z karty → `/gry/<id>`, h1, liczby podsumowania, trzy pytania z wynikiem i oznaczeniami, na stronie żadnej klasy `animate-in`, powrót do listy; dalej dzisiejsze kasowanie. W projekcie `phone` sprawdzenie okna strony historii (bez poziomego przewijania, wzór z `game.spec.ts`).

#### 7. Smoke na treść

**File**: `scripts/smoke.mjs`

**Intent**: Krok 200 z Fazy 2 sprawdza też treść strony.

**Contract**: w pełnym trybie (`gameSteps` biegły) całe ciało strony: dwie tabele wyników, jedno oznaczenie pominięcia, jedno przerwania, plakietka „propozycja gościa”, nagłówek podsumowania (brzmienie z wyboru Karola); w trybach skróconych sam status.

### Success Criteria:

#### Automated Verification:

- Bramka lokalna przechodzi: `npm run lint` (z `ui-literals` i kontrastem), `npx astro check`, `npm test`, `npm run build`
- Push za zgodą Karola: CI zielone, w `e2e` (oba projekty) i `smoke` nowe sprawdzenia historii przechodzą, `round.spec.ts` i `game.spec.ts` bez zmian zielone
- Próbny alarm: tymczasowy commit zapala tylko przewidziane testy; po `git revert` CI zielone

#### Manual Verification:

- Karol wybiera warianty na zrzutach (wejście z karty, układ, wykres przy pytaniu, oznaczenia)
- Karol akceptuje podglądy wszystkich stanów historii i listy na zrzutach (laptop i telefon)
- Odsłona w pokoju i ekran końca gry wyglądają jak przed zmianą (zrzuty podglądów przed i po)

**Implementation Note**: Próbny alarm: `GameHistory` nie rysuje oznaczenia przerwania bez odsłony. Przewidywanie: czerwone `game-history.spec.ts` w obu projektach (krok z trzecim pytaniem) i krok smoke treści historii; `ci`, `db` zielone. Wynik w §6.4. Po fazie pauza.

---

## Faza 4: Dokumenty i wdrożenie

### Overview

Nazwy i decyzje w dokumentach, baza na produkcji przed scaleniem, PR, smoke na produkcji, sprawdzenie Karola na prawdziwych grach.

### Changes Required:

#### 1. Dokumenty

**File**: `context/foundation/prd.md`, `context/domain/glossary.md`, `context/foundation/test-plan.md`, `context/deployment/deploy-plan.md`, `context/foundation/roadmap.md`

**Intent**: Decyzje Karola i nazwy z kodu zapisane tam, gdzie szuka ich następna zmiana.

**Contract**:

- PRD: pod FR-030 dopisek „Uzupełnienie 2026-11-20 (S-26, decyzje hosta)” z decyzjami 1–3 (osobna strona, dopisek o usuniętym graczu bez liczby i nicku, plakietki bez autora).
- Słownik: nowy termin „historia gry” (strona tylko hosta z jedną zakończoną grą: podsumowanie i pytania po kolei z wynikiem odsłony, pominięte i przerwane bez odsłony oznaczone; nazwy `/gry/<id>`, `game_history`, `GameHistory`; nie: „ranking”, „statystyki”, „wyniki wieczoru”); „lista własnych gier” z wejściem w historię.
- `test-plan.md`: §6.2 wpis `game-history` (historia, konta bez zmian), §6.5 suma kroków, wyniki alarmów z faz 1–3, wpis w §8.
- `deploy-plan.md`: migracja w „Wgrane migracje” po `db push`.
- Roadmapa: status S-26 prowadzą `/10x-implement` i `/10x-archive`; tu tylko „Stan kodu”, jeśli sekcja go wymaga.

#### 2. Baza na produkcji

**File**: brak (polecenia)

**Intent**: Funkcja na produkcji, zanim kod, który ją woła.

**Contract**: za zgodą Karola i nie z eduroam: `npx supabase db push --dry-run` (tylko migracja zmiany), `npx supabase db push`, `npx supabase migration list`.

#### 3. Scalenie i sprawdzenie

**File**: brak

**Intent**: Kod na produkcji i sprawdzony na prawdziwych grach.

**Contract**: PR gotowy (nie draft), CI zielone; scala Karol (`! gh pr merge <n> --merge`); Workers Builds; smoke na produkcji za zgodą (`BASE_URL=https://most-likely-to.charlesonthewave.workers.dev npm run smoke`); Karol na telefonie i laptopie.

### Success Criteria:

#### Automated Verification:

- `npx prettier --check` dla zmienionych plików `.md` przechodzi
- `npx supabase migration list` pokazuje migrację zmiany po stronie lokalnej i zdalnej
- CI na PR zielone (`ci`, `smoke`, `db`, `e2e`)
- Smoke na produkcji zielony, z krokami historii

#### Manual Verification:

- Karol na laptopie i telefonie: „Twoje gry” → gra z 19.11 → podsumowanie i pytania po kolei zgodne z tym, co pamięta z odsłon; gra bez startu bez wejścia
- Karol: strona historii bez sesji przekierowuje na logowanie (np. w oknie prywatnym)

**Implementation Note**: Kolejność: dokumenty i bramka → `db push` (zgoda) → PR gotowy → zielone CI → scala Karol → smoke prod (zgoda) → sprawdzenie Karola. Potem `/10x-impl-review` (zmiana bazy, większa) i poprawki.

---

## Testing Strategy

### Unit Tests:

- Brama RPC: nazwa funkcji, argumenty, metoda POST (`room-rpc-gate.test.ts`).
- `parseGameHistory`: kontrakt, klucze spoza kontraktu, odmowy per pole.
- `historyTotals`, `votesLost`, `gameHistory` na udawanym kliencie: wyrocznia z PRD i decyzji, nie z kodu.

### Integration Tests:

- Testy bazy (`game-history.test.ts`): wszystkie losy rundy, rodzaje pytań, usunięty gracz, dokładne klucze, sumy równe `game_totals`, odmowy.
- pgTAP: granty, wersje, obcy host, brak wołającego, brak zapisów.
- Smoke: statusy (302, 404, 404, 200) i treść strony głównej gry smoke.
- E2E: wejście z listy, historia jednej gry na laptopie i telefonie.

### Manual Testing Steps:

1. Galeria: Karol wybiera warianty.
2. Podglądy wszystkich stanów: Karol akceptuje.
3. Produkcja: Karol otwiera historię gry z 19.11 na laptopie i telefonie.

## Performance Considerations

Jedno wywołanie bazy na odsłonę strony; gra ma najwyżej kilkadziesiąt rund, a pokój najwyżej 50 graczy, więc odpowiedź to co najwyżej kilka tysięcy liczb. Strona bez skryptu w przeglądarce.

## Migration Notes

Migracja tylko dodaje funkcję. Nie ma czego przenosić: wszystkie zakończone gry na produkcji (także te z 19.11) mają historię od razu po wdrożeniu. Runda sprzed S-17 z id, którego dzisiejsza baza pytań nie zna, pokaże zdanie zastępcze.

## References

- Research: `context/changes/game-history-details/research.md`
- PRD: `context/foundation/prd.md` (FR-030, NFR o anonimowości, Access Control)
- Roadmapa: `context/foundation/roadmap.md` (S-26)
- Wzór: `context/archive/2026-11-10-host-game-history/plan.md` (S-13), `supabase/migrations/20261110131123_host_game_history.sql:81-114`
- Podsumowanie: `context/archive/2026-10-25-game-summary/plan-brief.md`, `src/lib/rooms/summary.ts:19`
- Usunięty gracz: `context/changes/remove-player-new-link/research.md:158`
- Testy: `context/foundation/test-plan.md` §6

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: Baza

#### Automated

- [x] 1.1 Bramka lokalna przechodzi: `npm run lint`, `npx astro check`, `npm test`, `npm run build` — fcf034b
- [x] 1.2 Draft PR do `main` (push za zgodą Karola): CI zielone we wszystkich jobach, w `db` nowe testy `game-history.test.ts` i nowe asercje pgTAP przechodzą — fcf034b
- [x] 1.3 Próbny alarm: tymczasowy commit zapala tylko przewidziane testy; po `git revert` CI zielone — 444a1de, revert 03bc8d8

#### Manual

- [x] 1.4 Karol czyta krótkie streszczenie funkcji (co oddaje, komu, czego nigdy) i je akceptuje — fcf034b

### Phase 2: Serwer gry

#### Automated

- [ ] 2.1 Bramka lokalna przechodzi: `npm run lint`, `npx astro check`, `npm test`, `npm run build`
- [ ] 2.2 Push na draft PR za zgodą Karola: CI zielone, w `smoke` nowe kroki historii przechodzą
- [ ] 2.3 Próbny alarm: tymczasowy commit zapala tylko przewidziane testy; po `git revert` CI zielone

### Phase 3: Ekrany

#### Automated

- [ ] 3.1 Bramka lokalna przechodzi: `npm run lint` (z `ui-literals` i kontrastem), `npx astro check`, `npm test`, `npm run build`
- [ ] 3.2 Push za zgodą Karola: CI zielone, w `e2e` (oba projekty) i `smoke` nowe sprawdzenia historii przechodzą, `round.spec.ts` i `game.spec.ts` bez zmian zielone
- [ ] 3.3 Próbny alarm: tymczasowy commit zapala tylko przewidziane testy; po `git revert` CI zielone

#### Manual

- [ ] 3.4 Karol wybiera warianty na zrzutach (wejście z karty, układ, wykres przy pytaniu, oznaczenia)
- [ ] 3.5 Karol akceptuje podglądy wszystkich stanów historii i listy na zrzutach (laptop i telefon)
- [ ] 3.6 Odsłona w pokoju i ekran końca gry wyglądają jak przed zmianą (zrzuty podglądów przed i po)

### Phase 4: Dokumenty i wdrożenie

#### Automated

- [ ] 4.1 `npx prettier --check` dla zmienionych plików `.md` przechodzi
- [ ] 4.2 `npx supabase migration list` pokazuje migrację zmiany po stronie lokalnej i zdalnej
- [ ] 4.3 CI na PR zielone (`ci`, `smoke`, `db`, `e2e`)
- [ ] 4.4 Smoke na produkcji zielony, z krokami historii

#### Manual

- [ ] 4.5 Karol na laptopie i telefonie: „Twoje gry” → gra z 19.11 → podsumowanie i pytania po kolei zgodne z tym, co pamięta z odsłon; gra bez startu bez wejścia
- [ ] 4.6 Karol: strona historii bez sesji przekierowuje na logowanie (np. w oknie prywatnym)
