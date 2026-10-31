# Wybór koloru przez gracza (S-18): plan implementacji

## Overview

Gracz (host i gość) sam wybiera swój kolor z palety 20 kolorów gry: dotyka swojej kropki na liście „Gracze” i wybiera wolny kolor. Kolor przestaje wynikać z miejsca przy stole (`seatColors`) i trafia do bazy, więc do 20 graczy dwóch graczy w pokoju nie ma tego samego koloru, a kto nie wybierze, dostaje pierwszy wolny. Przeglądarka pamięta wybrany kolor jak nick. S-18 z roadmapy (`context/foundation/roadmap.md:337-350`), nowy dodatek v1 FR-025. Zapisanego koloru potrzebuje S-09 (usunięcie gracza nie może zmienić kolorów pozostałych, `context/domain/glossary.md:48`).

## Current State Analysis

Szczegóły i kotwice: `context/changes/player-color-choice/research.md`.

- Kolor nie jest nigdzie zapisany. `seatColors(players)` (`src/lib/rooms/chart.ts:95-97`) daje nickowi numer koloru z pozycji na liście graczy modulo `MAX_PIE_SLICES` = 20, a lista przychodzi z `room_lobby` w kolejności `seat` (`supabase/migrations/20261027121442_co_host_role.sql:879-888`).
- Pięć widoków bierze kolor z mapy nick → numer: `RoomLobby.tsx:82`, `RoundVoting.tsx:143`, `RoundReveal.tsx:93`, `GameSummary.tsx:28`, `EmoteBubbles.tsx:44`. Klasy są w `src/components/room/chart-colors.ts` (`SLICE_FILLS`, `SLICE_DOTS`, `SLICE_BORDERS`), kolory to tokeny `--chart-1` … `--chart-20` (`src/styles/global.css:81-100`). Nazw kolorów repo nie ma.
- Gracza dodają trzy funkcje: `create_room` (host, `seat = 1`; najnowsza definicja `20261014101922_first_live_round.sql:220`), `join_room` (`first_live_round.sql:308`, blokada wiersza pokoju, tylko w poczekalni) i `admit_latecomer` (`co_host_role.sql:477`, blokada wiersza pokoju). `request_join` nie tworzy gracza.
- Lista „Gracze” jest tylko w poczekalni (`RoomLobby.tsx:220`) i w głosowaniu (`RoundVoting.tsx:198`). Odsłona ma tabelę wyniku, podsumowanie legendę.
- Wzory: zmiana cechy gracza pod blokadą pokoju `set_cohost` (`co_host_role.sql:595-643`), rozpoznanie hosta po `auth.uid()` albo gościa po `sha256(token)` w `player_secrets` (`private.leader_refusal`, `co_host_role.sql:59-98`; `cast_vote`), trasa „sesja albo ciasteczko gracza” `src/pages/api/rooms/[id]/vote.ts:39-47`, dzwonek `ringLobby` po sukcesie (`cohost.ts`).
- Zapamiętany nick (S-14): `src/lib/rooms/remembered-nick.ts` (klucz `mlt-nick`), zapis w `RoomScreen.tsx:203-207`, E2E `tests/e2e/remembered-nick.spec.ts`.

## Desired End State

- Przy wejściu do pokoju każdy gracz ma kolor: host 0, potem najniższy wolny numer. Przy 20 zajętych kolorach 21. gracz dostaje `(liczba graczy) % 20`, czyli kolory się powtarzają jak dziś. Pokoje sprzed wdrożenia mają te same kolory co dziś.
- Na liście „Gracze” (poczekalnia i głosowanie) własna kropka gracza jest przyciskiem. Otwiera paletę 20 kolorów z polskimi nazwami dla czytnika ekranu. Kolory innych graczy są wyszarzone i nieklikalne, a od 21. gracza cała paleta jest zajęta. Wybór działa w poczekalni i w trakcie gry, w zamkniętej grze nie.
- Zmiana koloru dociera do wszystkich ekranów bez przeładowania (dzwonek): kropki, koło odsłony, legenda i koło podsumowania, obwódka dymka emotki. Dwa równoczesne wybory tego samego koloru: drugi dostaje „Ten kolor ktoś właśnie zajął.”.
- Przeglądarka pamięta kolor wybrany przez gracza (`mlt-color`). W następnej grze ekran raz prosi o ten kolor, jeśli jest wolny. Kolor nadany przez grę nie nadpisuje zapamiętanego.
- Kropki tylko tam, gdzie są dziś. Kolor jest tylko na `players`, nigdy w danych rundy, w `question_stats` ani w logach.
- Sprawdzenie: CI zielone (`ci`, `smoke`, `db` z pgTAP, `e2e`), smoke na produkcji, gra Karola z ekipą.

### Key Discoveries:

- Wszystkie trzy funkcje dodające gracza i nowa funkcja zmiany koloru trzymają blokadę wiersza pokoju (`for update`), więc wolny kolor da się wyliczyć i sprawdzić pod tą blokadą jak zajęty nick. `create_room` tworzy pokój w tej samej transakcji, więc nikt inny nie wejdzie do niego równocześnie.
- Unikalny indeks `(room_id, color)` nie wchodzi w grę: od 21. gracza kolory muszą się powtarzać (decyzja 6). Unikalność do 20 graczy pilnuje kontrola pod blokadą.
- `seat` nie ma luk (host 1, potem `max(seat)+1`, wstawienie z kolizją nicka cofa się w bloku `exception`, nikt nie wychodzi), więc `(seat - 1) % 20` to dokładnie dzisiejszy `seatColors`.
- Stary parser Workera kopiuje tylko klucze kontraktu (`parsePlayers`, `src/lib/rooms/shared.ts:200-210`), więc `color` w `room_lobby` przed nowym kodem nic nie psuje. Nowy parser wymaga klucza, więc `db push` przed scaleniem.
- `tests/unit/room-errors.test.ts:31-52` wypisuje ręcznie odmowy z planów (`PLANNED_ROUND_REFUSALS`) z odwołaniem do planu, więc `color_taken` trzeba tam dopisać.
- `radix-ui` jest już w zależnościach (`package.json:36`), więc komponent shadcn do palety (np. `radio-group`, `popover`) zwykle nie dokłada nowej paczki npm.
- Limit rejestracji w testach bazy: dziś 16 kont na przebieg przy 30 na 5 minut (`context/foundation/test-plan.md:189`). Nowy plik z jednym hostem daje 17.

## What We're NOT Doing

- Wybór koloru w formularzach z nickiem (`JoinForm`, `NewGameForm`) i u spóźnionego przed wpuszczeniem (`join_requests` bez koloru). Kolor dostaje dopiero wpuszczony gracz.
- Zmiana koloru innego gracza przez hosta albo współhosta (decyzja 4: host wybiera tylko swój).
- Nowe kolory, zmiana palety, jasny motyw.
- Unikalny indeks `(room_id, color)` i rezerwacja koloru dla hosta.
- Kropki w nowych miejscach: formularz głosu, chipy „Nikt dziś nie głosował na”, prośby spóźnionych, wiersz odsłony poza tym, co jest (decyzja 7).
- Ogłoszenie zmiany koloru innym graczom w regionie na żywo i limit częstotliwości zmian.
- Zmiany sygnatur `create_room`, `join_room`, `admit_latecomer` i `room_lobby`, zmiany w `request_join`, funkcjach rundy i listy pytań.
- Usunięcie gracza (S-09). Zapisany kolor jest dla niego gotowy, ale tu niczego nie usuwamy.
- Ręczna tabela sygnatur SQL w `context/changes/refactor-opportunities/plan.md` (nie była aktualizowana i przy S-07; dotyczy tamtej zmiany).

## Implementation Approach

- **Faza 1:** migracja i jej testy. `players.color` z uzupełnieniem dzisiejszych kolorów, `private.free_color`, `create_room`, `join_room` i `admit_latecomer` z pierwszym wolnym kolorem, `public.set_player_color`, `room_lobby` z `color`. Testy bazy, pgTAP i próbny alarm na draft PR. Dokumenty z nazwami (PRD FR-025, słownik, `test-plan.md`) razem z bazą.
- **Faza 2:** Worker. `LobbyPlayer.color`, `playerColors` w miejsce `seatColors`, trasa `POST /api/rooms/[id]/color`, odmowa `color_taken`, testy jednostkowe i kroki smoke.
- **Faza 3:** ekrany. Najpierw 2–3 warianty palety na zrzutach, Karol wybiera. Potem przycisk własnej kropki i paleta, nazwy kolorów, zapamiętany kolor, podglądy i E2E.
- **Faza 4:** wdrożenie według `context/deployment/deploy-plan.md`: zielone CI, `db push`, scalenie przez Karola, smoke na produkcji, gra z ekipą.

Jedna gałąź `player-color-choice`, jeden PR. Zmiany w `supabase/migrations/`, `src/lib/rooms/`, `src/pages/api/rooms/` i `tests/` idą tylko przez PR z zielonym `db` (AGENTS.md).

## Critical Implementation Details

- **Kopiuj najnowsze definicje.** `create_room` i `join_room` z `first_live_round.sql:220` i `:308`, `admit_latecomer` i `room_lobby` z `co_host_role.sql:477` i `:667`. Sprawdź jeszcze raz `grep -ln "function public.<name>(" supabase/migrations/*.sql`. Zmień tylko wstawienie gracza (kolumna `color` z `private.free_color`) i obiekt gracza w `room_lobby`. Sygnatury bez zmian, więc `create or replace` podmienia jedyną wersję. Starsza kopia cofnęłaby po cichu współhosta, sumy S-15 albo prośby S-08.
- **Kolejność w migracji.** Kolumna bez `not null` → uzupełnienie `(seat - 1) % 20` → `set not null` i `check (color between 0 and 19)` → podmiana trzech funkcji dodających gracza. Bez wartości domyślnej, żeby zapomniana droga wstawienia gracza padła w CI, a nie dała po cichu koloru 0. Trzy funkcje wymienione w tej samej transakcji, więc żadne wejście nie trafi na kolumnę `not null` bez koloru.
- **Kolejność wdrożenia:** `db push` przed scaleniem kodu. Stary Worker nie kopiuje `color` i woła funkcje wejścia z tymi samymi argumentami. Nowy parser wymaga `players[].color`, którego stara baza nie zwraca.
- **Zapamiętany kolor bez pętli.** Ekran prosi o zapamiętany kolor najwyżej raz na pokój (id pokoju, w którym prośba już poszła, w `sessionStorage`), po pierwszym stanie ze znanym `me`, w poczekalni albo w trakcie gry, nigdy w podglądzie. Odświeżenie strony w środku gry nie prosi drugi raz, więc kolor nie zmienia się graczowi bez jego wyboru. Odmowa (np. `color_taken`, gdy ktoś zajął go chwilę wcześniej) przechodzi po cichu, bez komunikatu i bez zapisu. Zapis do `mlt-color` tylko po przyjętym wyborze gracza z palety.

## Faza 1: Baza

### Overview

Kolor gracza w bazie: zapis, pierwszy wolny przy wejściu, zmiana przez gracza z kontrolą zajętego koloru i kolor w stanie pokoju. Testy bazy, pgTAP i próbny alarm na draft PR.

### Changes Required:

#### 1. Migracja

**File**: `supabase/migrations/<timestamp>_player_color_choice.sql` (przez `npx supabase migration new player_color_choice`)

**Intent**: Zapisać kolor każdego gracza, nadać wolny przy wejściu i pozwolić graczowi go zmienić, nie zmieniając nikomu koloru przy wdrożeniu i nie psując starego Workera.

**Contract**:

- `public.players.color smallint not null` z `check (color between 0 and 19)`, bez wartości domyślnej. Istniejące wiersze: `color = (seat - 1) % 20`. Bez unikalnego indeksu, bez nowych grantów i polityk (host dalej bez `update` na `players`).
- `private.free_color(p_room_id uuid) returns smallint`: najniższy numer 0–19, którego nie ma żaden gracz pokoju; gdy zajęte wszystkie 20, `(liczba graczy pokoju) % 20`. `security invoker` jak `private.leader_refusal` (`co_host_role.sql:59-98`), `set search_path = ''`, nazwy z schematem, bez grantów, właściciel `postgres`, wołana tylko z funkcji `security definer` pod blokadą wiersza pokoju (w `create_room` po wstawieniu pokoju).
- `create_room`, `join_room`, `admit_latecomer` (`create or replace`, argumenty bez zmian): wstawienie gracza z `color = private.free_color(<pokój>)`. Host nowego pokoju dostaje 0. Granty bez zmian, ale `revoke`/`grant` powtórzone dla każdej funkcji z tego pliku (wzór `co_host_role.sql:913-936`).
- `public.set_player_color(p_room_id uuid, p_color integer, p_player_token text default null) returns jsonb`, `security definer`, `set search_path = ''`, właściciel `postgres`, `revoke … from public, anon, authenticated`, potem `grant execute … to anon, authenticated` (publiczny punkt wejścia, wszystkie kontrole w środku). Po kolei:
  - `p_color` null albo spoza 0–19: 22023; token nie-null w złym formacie (`^[A-Za-z0-9_-]{43}$`): 22023;
  - blokada wiersza pokoju (`for update`);
  - gracz: host pokoju po `auth.uid()` (wiersz z `user_id`), inaczej gracz tego pokoju po `sha256(token)` w `player_secrets`. Nikt z nich albo brak pokoju: `{ok: false, reason: 'room_unknown'}`;
  - pokój `closed`: `room_closed`;
  - inny gracz pokoju ma `p_color`: `color_taken`;
  - zapis tylko przy zmianie, odpowiedź dokładnie `{ok: true}`, także dla koloru, który gracz już ma. Działa w poczekalni i w trakcie gry.
- `room_lobby` (`create or replace`, argumenty bez zmian): gracz to `{nick, host, cohost, color}`, nadal w kolejności `seat`. Komentarz funkcji i nagłówek migracji opisują kolor, kolejność wdrożenia i to, że kolor nie trafia do danych rundy.

#### 2. Testy bazy

**File**: `tests/db/player-colors.test.ts` (nowy), `tests/db/support/rounds.ts`, `tests/db/cohost.test.ts`, `tests/db/round-anonymity.test.ts`

**Intent**: Dowieść z decyzji Karola 1–6, kto dostaje jaki kolor i kiedy wybór przechodzi. Przed pisaniem przeczytaj `context/foundation/test-plan.md` §6.

**Contract**:

- `player-colors.test.ts`, jeden host na plik:
  - kontrola pozytywna: host 0, Ola 1, Kuba 2 w `room_lobby` każdego z nich;
  - Ola (`anon` z tokenem) zmienia na 7: dokładnie `{ok: true}`, stan pokoju hosta pokazuje u Oli 7; następny gość dostaje 1 (najniższy wolny, nie następne miejsce);
  - host (sesja) zmienia swój kolor: `ok`; ten sam kolor drugi raz: `ok`;
  - Kuba prosi o kolor Oli: `color_taken`, a jego kolor zostaje;
  - dwa równoczesne wybory tego samego wolnego koloru: dokładnie jeden `ok` i jeden `color_taken` (wzór równoległych próśb w `latecomers.test.ts`);
  - zmiana w trakcie gry (po `start_game`) przechodzi; wpuszczony spóźniony dostaje najniższy wolny kolor;
  - odmowy: `anon` bez tokenu i token z innego pokoju `room_unknown`, czekający spóźniony `room_unknown`, zamknięty pokój `room_closed` (drugi pokój przez `seedRoom(host, { confirmClose: true })`), `p_color` -1, 20 i null oraz token w złym formacie 22023;
  - 20 graczy ma 20 różnych kolorów, 21. dostaje 0, a 22. 1; przy 21 graczach każda zmiana na inny kolor to `color_taken`;
  - host nie zmieni `color` przez REST (brak `update`).
- `support/rounds.ts`: `PLAYER_KEYS` = `["cohost", "color", "host", "nick"]` i pomocnik `setPlayerColor`. Dokładnie (przez `PLAYER_KEYS`) porównują graczy tylko `cohost.test.ts:289` i `round-anonymity.test.ts:166`; ich tytuły i komentarze („nick, host i cohost”, `cohost.test.ts:285`, `round-anonymity.test.ts:157-159`) dostają `color`. Pozostałe porównania graczy to `toMatchObject` i zostają bez zmian.

#### 3. Widok twórcy (pgTAP)

**File**: `supabase/tests/round_creator_view.test.sql`

**Intent**: Przypiąć to, czego klucz publishable nie widzi: kolumnę, kontrolę, brak wartości domyślnej, wersje funkcji i granty.

**Contract**: kolumna `players.color` `smallint`, `not null`, bez wartości domyślnej, z `check` 0–19. `set_player_color` w jednej wersji, `security definer`, `search_path=''`, właściciel `postgres`, `execute` dla `anon` i `authenticated`. `private.free_color` bez grantów, z `search_path=''` i właścicielem `postgres`. `create_room`, `join_room`, `admit_latecomer`, `room_lobby` nadal w jednej wersji z tymi samymi grantami. Na `players` dalej bez `update` dla API. `plan(N)` zaktualizowany (dziś 277).

#### 4. Dokumenty z nazwami

**File**: `context/foundation/prd.md`, `context/domain/glossary.md`, `context/foundation/test-plan.md`

**Intent**: Wymaganie i nazwy z kodu zapisane przed kodem Workera i ekranów.

**Contract**:

- PRD, FR-025 w trzech miejscach jak FR-024: zdanie o zakresie v1 (`prd.md:68`), lista FR po `:143` (np. „FR-025: Each player picks their colour from the game's palette in the room; while the room has at most 20 players no two share a colour, a player who has not picked gets the first free one, and the same browser offers the colour its player picked last time. Priority: nice-to-have”), lista dodatków v1 po `:172` z „decyzja hosta 2026-10-31”.
- Słownik, wiersz „kolor gracza” (`glossary.md:48`): zapisany kolor gracza na całą grę, przy wejściu pierwszy wolny, gracz zmienia go sam w poczekalni i w trakcie gry, do 20 graczy każdy inny, od 21. się powtarzają; usunięcie gracza (S-09) nie zmienia kolorów pozostałych. Nazwy: `players.color`, `free_color`, `set_player_color`, `playerColors`, `mlt-color`, `mlt-color-asked`. Unikać: „kolor zwycięzcy”, kolor z miejsca w wyniku, `seatColors`.
- `test-plan.md` §6.2: `player-colors.test.ts` na liście plików (wzór wiersza `cohost.test.ts`, `:158`), rejestracje 17 na przebieg (`player-colors` 1, `:189`), a po próbnym alarmie wpis w „Break-check”.

### Success Criteria:

#### Automated Verification:

- Bramka lokalna przechodzi: `npm run lint`, `npx astro check`, `npm test`, `npm run build`
- `npx prettier --check` dla nowych i zmienionych plików `.md` przechodzi
- Draft PR do `main` (push za zgodą Karola): CI zielone we wszystkich jobach, w `db` nowe testy `player-colors.test.ts` i nowe asercje pgTAP przechodzą
- Próbny alarm: tymczasowy commit zapala tylko przewidziane testy; po `git revert` CI zielone

#### Manual Verification:

- Karol czyta streszczenie migracji (kolumna i uzupełnienie, pierwszy wolny kolor, zmiana koloru i jej odmowy, kolor w stanie pokoju) i je akceptuje

**Implementation Note**: Próbny alarm według `test-plan.md` §6.2 „Break-check”. Jeden tymczasowy commit z dwoma uszkodzeniami, jak w S-07, bo każde zapala inne testy: (a) `set_player_color` przepuszcza zajęty kolor (bez odmowy `color_taken`), (b) `private.free_color` zawsze daje 0. Przewidywania przed pushem, a opis commita wymienia z nazwy każdy test, który ma zaświecić. Tymczasowej migracji nigdy nie wgrywamy, a na końcu `git diff main...HEAD -- supabase/migrations` pokazuje tylko migrację zmiany. Po fazie pauza na akceptację Karola.

---

## Faza 2: Serwer gry

### Overview

Stan pokoju niesie kolor gracza, widoki biorą kolor z bazy, a gracz zmienia go jedną trasą z odmową `color_taken`. Bez zmian wyglądu: ekrany pokazują te same kolory co dziś.

### Changes Required:

#### 1. Typy i parsery stanu

**File**: `src/lib/rooms/shared.ts`; literały tych typów: `src/pages/dev/room-states.astro`, `src/pages/dev/room-window.astro`, `tests/unit/announce.test.ts`, `tests/unit/chart.test.ts`, fikstury `tests/unit/room-state.test.ts`

**Intent**: Kolor gracza przechodzi z bazy do widoku przeglądarki jako dane gracza.

**Contract**: `LobbyPlayer.color: number`. `parsePlayers` (`shared.ts:200-211`) wymaga liczby całkowitej 0 … `MAX_PIE_SLICES - 1`, inaczej błąd z nazwą pola `players.color`. To jedna funkcja, wspólna dla obu parserów (`parseLobbyState` w Workerze i `parseRoomView` w przeglądarce). Test „podrzuconego klucza” (`room-state.test.ts:497`, `:511`) dostaje `color` i na wejściu, i w oczekiwanym wyniku. Typowane literały i fikstury dostają już w tej fazie `color` równy dzisiejszemu (pozycja % 20), żeby podglądy wyglądały jak dziś i przeszły `npx astro check` oraz `npm test`.

#### 2. Kolor w widokach

**File**: `src/lib/rooms/chart.ts`, `src/components/room/{RoomLobby,RoundVoting,RoundReveal,GameSummary,EmoteBubbles}.tsx`, `tests/unit/chart.test.ts`

**Intent**: Jedno źródło koloru: zapisany kolor gracza, a nie jego pozycja.

**Contract**: `seatColors` → `playerColors(players): ReadonlyMap<string, number>` (nick → `color`), z komentarzem o zapisanym kolorze. Pięć widoków zmienia tylko wywołanie. `chart.test.ts`: mapa bierze `color` z danych (np. gość z kolorem 7 na drugim miejscu ma 7), powtórzone kolory od 21. gracza przechodzą bez zmian, pusta lista daje pustą mapę.

#### 3. Funkcja bazy i trasa

**File**: `src/lib/rooms/server.ts`, nowe `src/pages/api/rooms/[id]/color.ts`

**Intent**: Gracz zmienia swój kolor jedną trasą, a każdy ekran dowiaduje się o zmianie z dzwonka.

**Contract**:

- `setPlayerColor(supabase, roomId, color, playerToken): Promise<ActionResult>` przez `callRpc` i `actionResult` (wzór `setCohost`, `server.ts:500-508`);
- `POST /api/rooms/[id]/color` jak `vote.ts:39-47`: ciało `{color}` z liczbą całkowitą 0–19, inaczej `invalid_body`; sesja hosta albo ciasteczko gracza (ciasteczko w innym formacie liczy się jako brak, bez obu `OUTSIDE_ROOM`); odpowiedź `{ok: true}` albo `{error: code}` (`json-route.ts`), dzwonek `ringLobby` po sukcesie. Numer koloru nie trafia do linii logu ani do URL.

#### 4. Odmowa

**File**: `src/lib/rooms/errors.ts`, `tests/unit/room-errors.test.ts`

**Intent**: Zajęty kolor ma własny tekst zamiast „Coś poszło nie tak”.

**Contract**: `color_taken` w `ROUND_REFUSALS` i `MESSAGES`: „Ten kolor ktoś właśnie zajął.”. Status 409 daje domyślna gałąź `statusFor` (`json-route.ts:167-173`); `ROUND_REFUSALS` czyta tylko `room-errors.test.ts:92`. W `room-errors.test.ts` `color_taken` w `PLANNED_ROUND_REFUSALS`, a komentarz nad listą odsyła do tego planu (Faza 2 #4).

#### 5. Testy jednostkowe i smoke

**File**: `tests/unit/room-state.test.ts`, `tests/unit/room-rpc-gate.test.ts`, `scripts/smoke.mjs`

**Intent**: Przypiąć nowy kontrakt i przejść zmianę koloru przez prawdziwy Worker.

**Contract**:

- `room-state`: `color` przechodzi przez oba parsery; brak `color` (baza sprzed migracji) i wartość spoza 0–19 dają błąd `players.color` (wzór `:279-292`, `:677-681`).
- `room-rpc-gate`: `set_player_color` w `SQL_SIGNATURES` z `plik:linia` nowej migracji, z domyślnym `p_player_token`. Komentarze `plik:linia` przy `create_room`, `join_room` i `admit_latecomer` przepięte na nową migrację, bo to w niej będzie najnowsza definicja.
- smoke:
  - Ola (ciasteczko) zmienia kolor na wolny: 200, a stan pokoju pokazuje u niej nowy kolor;
  - Kuba prosi o ten sam kolor: 409 `color_taken`;
  - host zmienia swój kolor: 200;
  - kolor 20: 400 `invalid_body`.

### Success Criteria:

#### Automated Verification:

- Bramka lokalna przechodzi: `npm run lint`, `npx astro check`, `npm test`, `npm run build`
- CI na PR zielone we wszystkich jobach, w tym nowe kroki smoke koloru

#### Manual Verification:

- Nowa trasa `color` przeklikana raz na serwerze dev przez API po `db push` z fazy 4, bo serwer dev łączy się z produkcyjną bazą (lessons.md, wpis 3)

**Implementation Note**: Faza 2 bez zmian ekranów: kolory na ekranach wyglądają jak dziś, a wybór koloru jest tylko w API. Po fazie pauza na akceptację Karola.

---

## Faza 3: Ekrany

### Overview

Najpierw warianty palety do wyboru Karola, potem przycisk własnej kropki i paleta na liście „Gracze”, nazwy kolorów, zapamiętany kolor, podglądy i E2E.

### Changes Required:

#### 1. Warianty do wyboru

**File**: `/dev/room-states` (tymczasowe stany wariantów), strona HTML z „Co oceniasz” w scratchpadzie

**Intent**: Wygląd palety to decyzja Karola (decyzja 8; pamięć: wygląd ekranu = decyzja Karola).

**Contract**:

- 2–3 warianty otwierania i układu palety przy własnej kropce na liście „Gracze”, np. paleta rozwijana pod wierszem gracza, okienko przy kropce, siatka kolorów pod listą. Każdy pokazany w poczekalni i w głosowaniu, z zajętymi kolorami, z całą paletą zajętą (21 graczy) i z komunikatem „Ten kolor ktoś właśnie zajął.”;
- zrzuty: laptop jako całe okno gry 1:1, telefon w prawdziwej wielkości, headless Chrome przez Playwright z `channel: "chrome"`, ukryty `astro-dev-toolbar`;
- strona otwarta w Chrome Karola, z nazwami 20 kolorów do akceptacji, a wybór zapisany w Progress (3.5);
- komponenty tylko z `src/components/ui`; brakujący przez `npx shadcn@latest add <name>`. Jeśli dodanie dokłada nową paczkę npm, najpierw zgoda Karola. Kolory tylko z tokenów.

#### 2. Wybór koloru

**File**: nowy komponent w `src/components/room/` (np. `PlayerColorPicker.tsx`), `src/components/room/{RoomLobby,RoundVoting,RoomScreen}.tsx`, `src/components/room/room-actions.ts`, `src/components/room/chart-colors.ts`, `scripts/ui-literals.mjs`

**Intent**: Gracz dotyka swojej kropki i wybiera wolny kolor; kolor nigdy nie jest jedynym nośnikiem informacji.

**Contract**:

- tylko we własnym wierszu na liście „Gracze” w poczekalni i w głosowaniu kropka staje się przyciskiem z nazwą dostępną typu „Twój kolor: <nazwa>. Zmień kolor”. Kropki innych graczy zostają `aria-hidden`;
- paleta: 20 opcji z `COLOR_NAMES` (20 polskich nazw dopasowanych do ciemnych odcieni `--chart-1` … `--chart-20`, w `chart-colors.ts` obok klas), bieżący kolor zaznaczony, kolory innych graczy wyszarzone i nieklikalne, z dopiskiem „zajęty” dla czytnika;
- wybór idzie akcją `color` (`room-actions.ts`, poza `VIEW_CHANGING`). Po sukcesie paleta się zamyka, a fokus wraca na kropkę. `color_taken` pokazuje tekst z `roomErrorMessage` przy palecie, która zostaje otwarta z odświeżonymi zajętymi kolorami;
- zamknięta gra (podsumowanie): bez przycisku;
- nowe pliki widoków dopisane do `VIEWS` w `scripts/ui-literals.mjs`.

#### 3. Zapamiętany kolor

**File**: `src/lib/rooms/remembered-nick.ts`, `src/components/room/RoomScreen.tsx`, `tests/unit/remembered-nick.test.ts`

**Intent**: Ten sam telefon w następnej grze dostaje kolor, który gracz wybrał ostatnio, jeśli jest wolny (decyzja 5).

**Contract**:

- `REMEMBERED_COLOR_KEY = "mlt-color"`, `readRememberedColor(storage): number | null` (tylko liczba całkowita 0–19, inaczej null), `rememberColor(storage, color)`, z tym samym logowaniem błędów pamięci (`op: "remembered_color"`, nigdy wartość). Komentarz modułu: w `localStorage` leżą nick i kolor, pod dwoma kluczami, a w `sessionStorage` tylko id pokoju, w którym ekran już poprosił o kolor; nigdy głos ani token;
- `COLOR_ASKED_KEY = "mlt-color-asked"` w `sessionStorage`: `colorAskedIn(session, roomId): boolean` i `markColorAsked(session, roomId)`, z tym samym logowaniem błędów pamięci. Niedostępna pamięć sesji: najwyżej raz na załadowanie strony;
- czysta funkcja `rememberedColorRequest(view, remembered): number | null`: null bez `me`, w zamkniętej grze, gdy gracz już ma ten kolor albo ma go inny gracz;
- `RoomScreen`: `rememberColor` po przyjętym wyborze z palety; najwyżej raz na pokój: po pierwszym stanie ze znanym `me`, gdy `colorAskedIn` daje false, najpierw `markColorAsked`, potem akcja `color` z kolorem z `rememberedColorRequest`, a odmowa bez komunikatu i bez zapisu. Odświeżenie strony w tym samym pokoju nie prosi drugi raz. Nigdy w podglądzie;
- testy jednostkowe funkcji odczytu i zapisu (obu kluczy) oraz `rememberedColorRequest` (wolny, zajęty, ten sam, zamknięta gra, brak `me`, zła wartość w pamięci), a dla `colorAskedIn` także inny pokój i rzucająca pamięć.

#### 4. Podglądy

**File**: `src/pages/dev/room-states.astro`

**Intent**: Każdy nowy stan ma podgląd (AGENTS.md, UI).

**Contract**: otwarta paleta w poczekalni (z zajętymi kolorami) i w głosowaniu, 21 graczy z całą paletą zajętą, komunikat `color_taken`. Budowniczowie stanów przyjmują `color`. `/dev/room-window` bez zmian (okno, nagłówek i pasek hosta się nie zmieniają).

#### 5. E2E

**File**: `tests/e2e/player-color.spec.ts` (nowy), pomocniki w `tests/e2e/support/`

**Intent**: Dowieść w przeglądarce, że wybór koloru dociera do innych bez przeładowania i że zapamiętany kolor wraca w następnej grze.

**Contract**:

- „gość wybiera kolor”: Ola otwiera paletę w poczekalni, kolor hosta jest nieklikalny, Ola wybiera wolny kolor, a na ekranie hosta kropka Oli zmienia kolor bez przeładowania. Wyrocznią jest stabilny atrybut kropki z numerem koloru (np. `data-color`), bo kropki innych graczy są `aria-hidden`. Dowód dzwonka według „Bell vs poll” (`test-plan.md` §6.4): `nextListFetch` przed `goto`/`reload` ekranu hosta, a zmiana kropki w czasie krótszym niż `LOBBY_POLL_MS` od tego załadowania; inaczej test przejdzie też bez dzwonka, bo ekran sam odpytuje co 15 s;
- „zapamiętany kolor”: na wzór `remembered-nick.spec.ts` Ola wchodzi do następnej gry i od razu ma swój kolor;
- pułapka: do opcji „wyszarzona, ale fokusowalna” `not.toHaveAttribute("disabled")` albo `aria-disabled`, nie `toBeEnabled()`.

### Success Criteria:

#### Automated Verification:

- Bramka lokalna przechodzi: `npm run lint`, `npx astro check`, `npm test`, `npm run build`
- `npx playwright test --list` pokazuje `player-color.spec.ts`
- CI na PR zielone we wszystkich jobach, w `e2e` nowe scenariusze `player-color.spec.ts` przechodzą
- Próbny alarm e2e: `color.ts` bez dzwonka zapala tylko „gość wybiera kolor”; po `git revert` CI zielone

#### Manual Verification:

- Karol wybiera wariant palety i akceptuje nazwy kolorów na zrzutach
- Karol ocenia zrzuty gotowych stanów (paleta w poczekalni i w głosowaniu, zajęte kolory, 21 graczy, komunikat zajętego koloru) na laptopie i telefonie

**Implementation Note**: Najpierw warianty i wybór Karola (3.5), dopiero potem wybór koloru na ekranach. Tymczasowe stany wariantów znikają z `/dev/room-states` po wyborze. Próbny alarm e2e według `test-plan.md` §6.4 „Break-check”: tymczasowy commit usuwa z `color.ts` wywołanie `ringLobby` razem z importem (inaczej czerwony byłby też lint); przewidywanie: czerwony tylko „gość wybiera kolor” w `player-color.spec.ts`, smoke (bez Realtime), baza i `ci` zielone. Po `git revert` CI zielone, wynik w §6.4. Po fazie pauza na akceptację Karola.

---

## Faza 4: Wdrożenie

### Overview

Baza, potem kod (`context/deployment/deploy-plan.md`), smoke na produkcji i gra z ekipą.

### Changes Required:

#### 1. Baza na produkcji

**Intent**: Migracja na produkcji przed scaleniem kodu.

**Contract**:

- PR gotowy do przeglądu (nie draft), CI zielone;
- `npx supabase db push --dry-run` (pokazuje tylko migrację tej zmiany), `npx supabase db push`, `npx supabase migration list`, każde za zgodą i nie z eduroam;
- Advisors → Security: nowe ostrzeżenie dla `set_player_color` przyznanej `anon` jest zamierzone, jak dla `join_room`;
- `deploy-plan.md` („Wgrane migracje”) dostaje wpis;
- potem 2.3 na serwerze dev.

#### 2. Scalenie i sprawdzenie

**Intent**: Kod na produkcji i dowód, że działa.

**Contract**: scala Karol (`! gh pr merge <n> --merge`). Potem `BASE_URL=https://most-likely-to.charlesonthewave.workers.dev npm run smoke` (za zgodą) i gra Karola z ekipą.

### Success Criteria:

#### Automated Verification:

- `npx supabase migration list` pokazuje nową migrację lokalnie i zdalnie
- Smoke na produkcji zielony

#### Manual Verification:

- Karol scala PR
- Karol z ekipą: każdy wybiera kolor w poczekalni, zajęty jest wyszarzony, zmianę w trakcie gry widać na kole odsłony i w podsumowaniu, a w następnej grze telefon od razu ma zapamiętany kolor

---

## Testing Strategy

### Unit Tests:

- Parsery stanu (`players.color`, brak i zła wartość), `playerColors`, bramka RPC (`set_player_color`), odmowa `color_taken`, zapamiętany kolor (`readRememberedColor`, `rememberColor`, `colorAskedIn`, `markColorAsked`, `rememberedColorRequest`).

### Integration Tests:

- `tests/db/player-colors.test.ts`: pierwszy wolny przy wejściu i wpuszczeniu, zmiana gościa i hosta, zajęty kolor, równoczesne wybory, odmowy, 21+ graczy (CI `db`).
- pgTAP: kolumna, `check`, brak domyślnej, wersje i granty funkcji (CI `db`).
- E2E `player-color.spec.ts` (CI `e2e`), smoke (CI i produkcja).

### Manual Testing Steps:

1. Zrzuty wariantów i gotowych stanów (faza 3).
2. Na produkcji: gra z 3–4 osobami, każdy wybiera kolor w poczekalni, dwie osoby próbują tego samego koloru.
3. W trakcie gry ktoś zmienia kolor w głosowaniu: nowy kolor na liście, na kole odsłony i w obwódce emotki.
4. Koniec gry: legenda podsumowania w wybranych kolorach. Następna gra: telefon dostaje zapamiętany kolor.

## Performance Considerations

`free_color` czyta kolory graczy jednego pokoju (kilkanaście wierszy) pod istniejącą blokadą, raz na wejście. Każda zmiana koloru to jeden dzwonek i odświeżenie stanu u wszystkich, jak przy innych ruchach. Limitu zmian nie dodajemy.

## Migration Notes

- Migracja jest addytywna dla starego Workera: te same sygnatury funkcji wejścia, nowy klucz `color` ignorowany przez stary parser, nowa funkcja nieużywana. Uzupełnienie `(seat - 1) % 20` daje każdemu graczowi dzisiejszy kolor, także w podsumowaniach zamkniętych gier. `db push` przed scaleniem nie psuje produkcji.
- Wycofanie kodu: revert PR (stary Worker dalej liczy kolor z miejsca). Wycofanie bazy: nowa migracja (pushowanej nie edytujemy). Kolory nie wymagają sprzątania.

## References

- Research i decyzje Karola 1–8: `context/changes/player-color-choice/research.md` (sekcja „Decyzje do planu”)
- Roadmapa: `context/foundation/roadmap.md:337-350`; PRD `context/foundation/prd.md:68,143,172` (wzór FR-024)
- Wzorce: `set_cohost` i `private.leader_refusal` `supabase/migrations/20261027121442_co_host_role.sql:59-98,595-643`, `join_room` `20261014101922_first_live_round.sql:308`, trasa `src/pages/api/rooms/[id]/vote.ts:39-47`, `cohost.ts`, zapamiętany nick `src/lib/rooms/remembered-nick.ts`
- Poprzednia zmiana z tym samym układem faz: `context/changes/co-host-role/plan.md`; kolory z miejsca: `context/archive/2026-10-25-player-colors/plan.md`
- Zasady testów: `context/foundation/test-plan.md` §6; wdrożenie: `context/deployment/deploy-plan.md`

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: Baza

#### Automated

- [x] 1.1 Bramka lokalna przechodzi: `npm run lint`, `npx astro check`, `npm test`, `npm run build` — 59548bb
- [x] 1.2 `npx prettier --check` dla nowych i zmienionych plików `.md` przechodzi — 59548bb
- [x] 1.3 Draft PR do `main` (push za zgodą Karola): CI zielone we wszystkich jobach, w `db` nowe testy `player-colors.test.ts` i nowe asercje pgTAP przechodzą — PR #32, e015a18
- [x] 1.4 Próbny alarm: tymczasowy commit zapala tylko przewidziane testy; po `git revert` CI zielone — 5311c24, revert dc7b08f

#### Manual

- [x] 1.5 Karol czyta streszczenie migracji (kolumna i uzupełnienie, pierwszy wolny kolor, zmiana koloru i jej odmowy, kolor w stanie pokoju) i je akceptuje — 2026-10-31

### Phase 2: Serwer gry

#### Automated

- [x] 2.1 Bramka lokalna przechodzi: `npm run lint`, `npx astro check`, `npm test`, `npm run build` — d7c2ec4
- [x] 2.2 CI na PR zielone we wszystkich jobach, w tym nowe kroki smoke koloru — 65f1c0f

#### Manual

- [ ] 2.3 Nowa trasa `color` przeklikana raz na serwerze dev przez API po `db push` z fazy 4, bo serwer dev łączy się z produkcyjną bazą (lessons.md, wpis 3)

### Phase 3: Ekrany

#### Automated

- [x] 3.1 Bramka lokalna przechodzi: `npm run lint`, `npx astro check`, `npm test`, `npm run build` — 54560e8
- [x] 3.2 `npx playwright test --list` pokazuje `player-color.spec.ts` — 54560e8
- [x] 3.3 CI na PR zielone we wszystkich jobach, w `e2e` nowe scenariusze `player-color.spec.ts` przechodzą — 54560e8
- [ ] 3.4 Próbny alarm e2e: `color.ts` bez dzwonka zapala tylko „gość wybiera kolor”; po `git revert` CI zielone

#### Manual

- [x] 3.5 Karol wybiera wariant palety i akceptuje nazwy kolorów na zrzutach — 54560e8
- [x] 3.6 Karol ocenia zrzuty gotowych stanów (paleta w poczekalni i w głosowaniu, zajęte kolory, 21 graczy, komunikat zajętego koloru) na laptopie i telefonie — 54560e8

### Phase 4: Wdrożenie

#### Automated

- [ ] 4.1 `npx supabase migration list` pokazuje nową migrację lokalnie i zdalnie
- [ ] 4.2 Smoke na produkcji zielony

#### Manual

- [ ] 4.3 Karol scala PR
- [ ] 4.4 Karol z ekipą: każdy wybiera kolor w poczekalni, zajęty jest wyszarzony, zmianę w trakcie gry widać na kole odsłony i w podsumowaniu, a w następnej grze telefon od razu ma zapamiętany kolor
