# Kanał na żywo tylko dla graczy pokoju Implementation Plan

## Overview

Emotki pokoju (a później ewentualny czat) przestają iść publicznym tematem `live-sync:<roomId>`, który zna każdy z id pokoju. Idą na nowy temat `live-players:<klucz kanału>`, a klucz kanału to losowy kod pokoju (128 bitów, jak kod linku), który `room_lobby` daje tylko graczom pokoju i który `remove_player` zmienia. Usunięty gracz, odrzucony spóźniony i obcy z adresem `/r/<id>` nie widzą już emotek pokoju i nie podrzucą ich ekranom. Dzwonki zostają na temacie publicznym, bez zmian.

**Decyzje Karola (2026-11-14):**

1. Tajny klucz kanału teraz (W-A z `research.md`); podpis serwera na każdej wiadomości (W-E) dopiero przy czacie.
2. W-A′: po kluczu idą tylko emotki; `bell` i `leader-bell` zostają na `live-sync:<roomId>`. Ekran czekania spóźnionego i trasy z dzwonkiem bez zmian.
3. Powrót na swój nick z innego urządzenia (S-04, `admit_latecomer` z prośbą o powrót) nie zmienia klucza. Zmienia go tylko usunięcie gracza.
4. Nazwa w słowniku: „klucz kanału”, osobna od „link do pokoju” i „kod”.

## Current State Analysis

- Temat kanału to surowe id pokoju: `topicFor(room)` → `"live-sync:" + room` (`src/lib/live-sync/shared.ts:3,35-37`). Id nie zmienia się przez całą grę, przy usunięciu gracza zmienia się tylko `link_token` (`supabase/migrations/20261101125331_remove_player.sql:149-152`).
- Jedynym nadawcą jest Worker przez REST Realtime z kluczem publicznym: `send()` (`src/lib/live-sync/server.ts:15-45`), wrappery `ringRoom`, `ringRoomLeaders`, `sendEmote` (`:47-59`), na trasach `ringLobby`, `ringLeaders`, `broadcastEmote` (`src/lib/rooms/server.ts:832-864`). Kanał jest publiczny, więc przyjmuje też wiadomość od każdego, kto zna temat.
- Trasa emotki już woła `room_lobby` i bierze z niego nick nadawcy (`src/pages/api/rooms/[id]/emote.ts:38-42`); usunięty gracz dostaje tam 404.
- Ekran pokoju ma dziś jeden kanał `topicFor(roomId)` z trzema zdarzeniami (`src/components/room/useRoomState.ts:315-359`) i osobny efekt dla końca wieczoru, który słucha tylko emotek na tym samym temacie (`:388-404`). Każdy efekt tworzy własnego klienta (`realtimeClient`, `:129-133`). Ekran pokazuje tylko emotkę z listy od nicku z listy graczy (`parseEmoteMessage`, `src/lib/rooms/emotes.ts:51-61`; `RoomScreen.tsx:155-166`).
- `room_lobby` (najnowsza wersja `20261107091322_game_length.sql:304-576`) zwraca stan każdemu graczowi pokoju w każdym statusie, także w zamkniętym; `link_token` tylko prowadzącym (`:553`). Spóźniony czekający i odrzucony dostają `null`.
- `remove_player` odmawia w zamkniętym pokoju (`remove_player.sql`, `room_closed`), więc na ekranie końca wieczoru klucz się nie zmieni.
- Parsery: `parseLobbyState` (`src/lib/rooms/shared.ts:486-512`) i `parseRoomView` (`:636-687`) budują wynik tylko ze znanych kluczy, a `RoomState` (`:431`) to część wspólna stanu z bazy i widoku dla ekranu. Dzisiejszy Worker pominie więc nowe pole z bazy bez błędu.

## Desired End State

- `public.rooms.channel_key`: 22 znaki base64url, losowy dla każdego pokoju, także dla pokoi sprzed migracji. `room_lobby` daje go jako `channel_key` każdemu graczowi pokoju (host, gość, współhost) w poczekalni, w grze i po końcu; spóźniony czekający, odrzucony i usunięty go nie dostają. `remove_player` w tym samym ruchu losuje nowy klucz i nowy link.
- Trasa emotki nadaje `{ emote, nick }` na `live-players:<channel_key>` z aktualnego `room_lobby`. Ekran pokoju i ekran końca wieczoru słuchają emotek tylko tam, a na temacie publicznym słuchają już tylko dzwonków. Po usunięciu gracza ekrany pozostałych przechodzą na nowy klucz po najbliższym pobraniu stanu.
- Klucz nie trafia do adresów gry, jej logów (`logEvent`, `client-events`) ani do odpowiedzi dla kogoś spoza pokoju. Trafia za to do ścieżki zapytania Workera do Supabase (`httpSend` wkłada temat do adresu, `node_modules/@supabase/realtime-js/src/RealtimeChannel.ts:965`), więc jest w logach API Supabase: widzi je tylko twórca gry, który i tak czyta bazę (przyjęta granica, jak w `AGENTS.md`).
- Weryfikacja: testy bazy i pgTAP (kto dostaje klucz, rotacja przy usunięciu, brak rotacji przy powrocie), testy jednostkowe (parsery, temat, log bez klucza), nowy e2e `players-channel.spec.ts` z surowym klientem Realtime, nowe kroki smoke, smoke na produkcji i przeklikanie Karola.

### Key Discoveries:

- Kod generowany jak link: `translate(encode(extensions.gen_random_bytes(16), 'base64'), '+/=', '-_')` (`remove_player.sql:150-151`), kolumna linku z kontrolą formatu `check (link_token ~ '^[A-Za-z0-9_-]{22}$')` (`20261007122858_room_lobby.sql:23`).
- Wzory migracji: nagłówek „same signature, create or replace” (`game_length.sql:24-42`), kolumna z komentarzem (`:46-51`), właściciel i granty powtórzone dla każdej odtworzonej funkcji (`:580-594`).
- `public.rooms` ma `grant select` dla `authenticated` na całą tabelę i jedną politykę „Hosts read their rooms” (`20261014101922_first_live_round.sql:33-34`, `room_lobby.sql:65-67`), więc host przeczyta klucz swojego pokoju przez REST. Host jest graczem, to zgodne z zasadą. `anon` nie ma nic (`tests/db/roles.test.ts:150`).
- `sleepableRealtime` śledzi tylko ostatni WebSocket strony (`tests/e2e/support/realtime.ts:15-45`), a od niego zależą `lobby-connection-drop.spec.ts` i `rejoin.spec.ts`: ekran musi mieć jednego klienta Realtime na oba kanały.
- `LOBBY_KEYS` (`tests/db/support/rounds.ts:238`) to dokładny zbiór kluczy stanu, a `VIEW_KEYS` (`tests/unit/room-state.test.ts:1144-1161`) widoku; oba trzeba poszerzyć.
- Brama RPC (`tests/unit/room-rpc-gate.test.ts:77,158`) wskazuje w komentarzu plik i linię najnowszej definicji `room_lobby` i `remove_player`; sygnatury się nie zmieniają.
- Smoke ma już kroki usunięcia gracza (`scripts/smoke.mjs:756-812`, `removeSteps`), z regexem linku w widoku (`:207`).
- pgTAP sprawdza kształt kolumny `rooms` wzorem `extra_questions` (`supabase/tests/round_creator_view.test.sql:1825-1833`).

## What We're NOT Doing

- Dzwonki (`bell`, `leader-bell`) zostają na publicznym `live-sync:<roomId>` (decyzja 2): usunięty i obcy z id pokoju dalej je słyszą (bez treści) i mogą dzwonić, co spowalnia pokój najwyżej do odpytywania. Przyjęte od F-01.
- Bez podpisu serwera (W-E, decyzja 1): gracz pokoju dalej może nadać emotkę z nickiem kolegi albo zalać kanał graczy. Granica zapisana w roadmapie i słowniku do czasu czatu. Bez `test.fails`: e2e pokazuje ją jako kontrolę pozytywną (wiadomość z kluczem i cudzym nickiem dochodzi), a przy W-E ten krok zmieni się razem z kodem.
- Bez kanałów prywatnych Supabase, bez zmian w panelu projektu i bez nowego sekretu Workera.
- Bez zmiany klucza przy powrocie z innego urządzenia (decyzja 3), przy końcu gry, przy zmianie roli współhosta, przy odrzuceniu spóźnionego.
- Bez limitu emotek na serwerze (przerwa 3 s zostaje na ekranie, `src/lib/rooms/emotes.ts:24-26`).
- Bez zmian w ekranie czekania spóźnionego (`JoinWaiting.tsx`), dev-demo F-01 (`/dev/live-sync`, `src/pages/api/live-sync/ring.ts`) i sondzie (`scripts/live-sync-probe.mjs`): mają własne tematy albo słuchają tylko dzwonków.
- Bez zmian w wyglądzie: nie ma nowego stanu pokoju ani nowego podglądu, więc nie ma też zrzutów do wyboru.
- Bez zmiany PRD (czat dalej w Parked) i bez edycji `context/archive/`.

## Implementation Approach

Trzy fazy jak przy S-09 i S-13: baza → Worker i ekrany → dokumenty i wdrożenie. Baza dokłada kolumnę z losową wartością domyślną (więc `create_room` zostaje bez zmian) i odtwarza dwie funkcje z jedną nową linią każda. Klucz trafia do `RoomState`, więc niesie go i stan z bazy (`LobbyState`), i widok dla ekranu (`RoomView`). Trasa emotki bierze go z wyniku `room_lobby`, który już woła. Na ekranie jeden klient Realtime trzyma dwa kanały: publiczny z dzwonkami (efekt bez zmian, z tymi samymi zależnościami) i kanał graczy z emotkami we własnym efekcie, zależnym od klucza z ostatniego stanu. Ten sam efekt obsługuje pokój w grze i pokój zamknięty.

## Critical Implementation Details

- **Kopiuj najnowsze definicje.** `room_lobby` z `20261107091322_game_length.sql:304-576`, `remove_player` z `20261101125331_remove_player.sql`. Przed kopiowaniem sprawdź jeszcze raz: `grep -ln "function public.room_lobby(" supabase/migrations/*.sql` i to samo dla `remove_player`. Kolumna z losową wartością domyślną liczy się osobno dla każdego istniejącego wiersza (Postgres przepisuje tabelę przy `add column` z funkcją zmienną), więc każdy stary pokój dostaje własny klucz. Bez `unique`: po kluczu nic nie szuka.
- **Przełączenie po usunięciu.** Dzwonek po `remove_player` idzie dalej na temat publiczny, więc pozostali pobierają stan, dostają nowy klucz i efekt emotek przechodzi na nowy temat. Emotki wysłane między rotacją a przełączeniem danego ekranu przepadają (przyjęte, emotka i tak jest ulotna). Efekt dzwonków nie może zależeć od klucza, bo każda rotacja zerowałaby ogranicznik i odpytywanie.
- **Klucz poza logami.** `send()` loguje dziś `roomId: room`, a `room` jest też tematem (`src/lib/live-sync/server.ts:27-35`). Temat i id pokoju trzeba rozdzielić: do logu idzie tylko id pokoju. `logEvent` sprawdza nazwy pól, nie ich treść (`src/lib/log.ts`), więc tego nie złapie sam.
- **Kolejność wdrożenia.** Nowy parser odrzuci stan bez `channel_key`, więc `db push` idzie przed scaleniem kodu. Dzisiejszy Worker z nową bazą działa, bo parsery pomijają nieznane klucze.

## Faza 1: Baza

### Overview

Kolumna klucza kanału, `room_lobby` daje ją każdemu graczowi, `remove_player` ją zmienia, powrót z S-04 nie. Testy bazy, pgTAP i próbny alarm na draft PR.

### Changes Required:

#### 1. Migracja

**File**: `supabase/migrations/<timestamp>_players_channel_key.sql` (przez `npx supabase migration new players_channel_key`)

**Intent**: Dać pokojowi tajny kod tematu emotek, znany tylko graczom, i zmieniać go razem z linkiem przy usunięciu gracza.

**Contract**:

- Nagłówek pliku według wzoru `game_length.sql:24-42`: co dodaje, które funkcje odtwarza z tą samą sygnaturą i że `admit_latecomer` (S-04) celowo klucza nie zmienia (decyzja 3).
- `public.rooms.channel_key text not null`, wartość domyślna jak kod linku (`remove_player.sql:150-151`), kontrola formatu jak `link_token` (`room_lobby.sql:23`), komentarz kolumny: kto ją dostaje, kiedy się zmienia, że nie trafia do adresów ani logów gry (jest w logach API Supabase, które widzi tylko twórca). Bez nowych grantów i polityk na `rooms`.
- `public.room_lobby(uuid, text)`: `create or replace`, ta sama sygnatura; wynik dostaje `'channel_key'` dla każdego, komu funkcja zwraca stan (obok `link_token`, `game_length.sql:553`), z komentarzem. Reszta funkcji bez zmian.
- `public.remove_player(...)`: `create or replace`, ta sama sygnatura; krok (d) w jednym `update` losuje nowy `link_token` i nowy `channel_key`.
- Właściciel `postgres`, `revoke execute … from public, anon, authenticated` i dotychczasowe `grant` powtórzone dla obu funkcji (wzór `game_length.sql:580-594`).

#### 2. Testy bazy

**File**: `tests/db/channel-key.test.ts` (nowy), `tests/db/support/rounds.ts`

**Intent**: Przypiąć, kto dostaje klucz i kiedy się zmienia, wyrocznią rozpisaną ręcznie (`test-plan.md` §6.2).

**Contract**:

- `LOBBY_KEYS` (`rounds.ts:238`) z `channel_key` i dopiskiem w komentarzu.
- Przypadki (wzory: `tests/db/remove-player.test.ts:205-229,515-519`, `tests/db/game-length.test.ts:259-336`):
  - host, gość i współhost dostają ten sam 22-znakowy klucz w poczekalni, w grze i po końcu gry; dwa pokoje mają różne klucze;
  - `remove_player`: pozostali dostają nowy, jednakowy klucz, różny od starego; token usuniętego dostaje `null`;
  - powrót z innego urządzenia (S-04, `admit_latecomer` z prośbą o powrót): klucz się nie zmienia, stare urządzenie dostaje `null` (decyzja 3);
  - spóźniony czekający i odrzucony: `room_lobby` daje `null`, a wynik `join_request_state` nie ma klucza `channel_key`;
  - REST: `anon` nie czyta `rooms.channel_key`, inny host nie czyta klucza cudzego pokoju, host czyta klucz swojego.

#### 3. Widok twórcy (pgTAP)

**File**: `supabase/tests/round_creator_view.test.sql`

**Intent**: Przypiąć kształt kolumny i to, że każdy pokój ma własny klucz.

**Contract**: wzorem `extra_questions` (`:1825-1833`): `channel_key` to `text`, `not null`, wartość domyślna z `gen_random_bytes`, kontrola formatu; dwa świeżo założone pokoje mają różne klucze. Granty na `public.rooms` bez zmian (istniejące asercje zostają zielone).

#### 4. Brama RPC

**File**: `tests/unit/room-rpc-gate.test.ts`

**Intent**: Komentarze przy `room_lobby` (`:77`) i `remove_player` (`:158`) wskazują nową migrację jako najnowszą definicję; sygnatury bez zmian.

**Contract**: tylko komentarze z `plik:linia`.

### Success Criteria:

#### Automated Verification:

- Bramka lokalna przechodzi: `npm run lint`, `npx astro check`, `npm test`, `npm run build`
- Draft PR do `main` (push za zgodą Karola): CI zielone we wszystkich jobach, w `db` nowy `channel-key.test.ts` i nowe asercje pgTAP przechodzą
- Próbny alarm: tymczasowy commit zapala tylko przewidziane testy; po `git revert` CI zielone

#### Manual Verification:

- Karol czyta streszczenie migracji (kto dostaje klucz, kiedy się zmienia, czego nie dostaje spóźniony i usunięty) i je akceptuje

**Implementation Note**: Próbny alarm według `test-plan.md` §6.2 „Break-check”: jeden tymczasowy commit z dwoma uszkodzeniami, bo każde zapala inne asercje: (a) `remove_player` bez nowego `channel_key` (czerwona tylko rotacja przy usunięciu); (b) `room_lobby` daje `channel_key` tylko prowadzącym (czerwone tylko przypadki gościa, a `LOBBY_KEYS` zostaje zielony, bo klucz jest, tylko `null`). Przewidywanie zapisać przed pushem, wynik w rejestrze §6.2.

---

## Faza 2: Worker i ekrany

### Overview

Klucz w stanie i widoku pokoju, trasa emotki nadaje na temat z klucza, ekran słucha emotek na osobnym kanale tego samego połączenia i przełącza się po zmianie klucza. Testy jednostkowe, e2e z surowym klientem Realtime, kroki smoke i próbny alarm.

### Changes Required:

#### 1. Temat i nadawca

**File**: `src/lib/live-sync/shared.ts`, `src/lib/live-sync/server.ts`

**Intent**: Osobny temat kanału graczy i nadawca, który zna temat i id pokoju osobno, żeby klucz nie trafił do logu.

**Contract**:

- `PLAYERS_TOPIC_PREFIX = "live-players:"` i `playersTopicFor(channelKey)`; komentarze przy `EMOTE_EVENT` i prefiksie: dzwonki na temacie publicznym (każdy z id pokoju), emotki na temacie graczy (każdy z kluczem kanału, czyli gracz pokoju).
- `send()` dostaje temat i id pokoju osobno; log błędu ma `roomId`, nigdy temat ani klucz. `ringRoom` i `ringRoomLeaders` dalej na `topicFor(roomId)`.
- `sendEmote(supabase, roomId, channelKey, message)` nadaje na `playersTopicFor(channelKey)`.

#### 2. Stan, widok i trasa emotki

**File**: `src/lib/rooms/shared.ts`, `src/lib/rooms/server.ts`, `src/pages/api/rooms/[id]/emote.ts`

**Intent**: Klucz przechodzi z bazy do ekranu tylko tego gracza, a trasa emotki nadaje na temat z aktualnego klucza.

**Contract**:

- `LobbyState` (`shared.ts:151`) dostaje `channel_key: string` (`RoomState`, `:431`, to nieeksportowany `Omit` z niego, więc niesie go sam); `parseRoomState` wymaga 22 znaków base64url (osobna stała wzoru, nie wzór linku), więc `LobbyState` i `RoomView` niosą go same. Komentarze parserów: stan bez klucza (baza sprzed `*_players_channel_key.sql`) jest odrzucany.
- `roomView()` (`server.ts:315-340`) przekazuje klucz dalej; komentarz: klucz idzie do każdego gracza, bo z nim ekran słucha emotek.
- `broadcastEmote(locals, supabase, roomId, channelKey, message)`; trasa emotki podaje `result.lobby.channel_key`. Komentarz trasy: obcy bez klucza nie dotrze do ekranów, granica w pokoju zostaje (gracz z kluczem może nadać z cudzym nickiem).

#### 3. Ekran pokoju

**File**: `src/components/room/useRoomState.ts`, `src/components/room/RoomScreen.tsx`; komentarze: `src/lib/rooms/emotes.ts`, `src/lib/rooms/server.ts`, `src/components/room/EmoteBar.tsx`, `src/components/room/EmoteBubbles.tsx`, `tests/e2e/emotes.spec.ts`

**Intent**: Emotki z kanału graczy w pokoju w grze i w zamkniętym, przełączane po zmianie klucza; na temacie publicznym już tylko dzwonki.

**Contract**:

- Jeden klient Realtime na stronę dla obu kanałów (nie w podglądzie), tworzony raz w hooku (`useRef` albo `useMemo` na `supabaseUrl` i `supabaseKey`); oba efekty biorą go stamtąd. Drugie gniazdo zepsułoby `sleepableRealtime` (Key Discoveries).
- Kanał dzwonków (`topicFor(roomId)`): tylko `bell` i `leader-bell`, bez nasłuchu `EMOTE_EVENT`; zależności efektu i obsługa połączenia (ogranicznik, odpytywanie, `liveBroken`, zgłoszenie) bez zmian.
- Kanał emotek: jeden efekt dla pokoju w grze i zamkniętego (zastępuje efekt końca wieczoru, `:388-404`), zależny od `channel_key` z ostatniego widoku. Przy zmianie klucza zdejmuje stary kanał i dołącza do nowego; po `CLOSED` dołącza ponownie z tym samym odstępem co kanał dzwonków.
  - Zależności efektu: tylko `isPreview`, `roomId`, wspólny klient i `view.channel_key`, nigdy `isLive` ani status. realtime-js 2.116 przy `channel()` z tym samym tematem oddaje jeszcze wychodzący kanał, a jego `subscribe()` nic nie robi i nie woła wywołania zwrotnego (`RealtimeClient.ts:462-474`, `RealtimeChannel.ts:426-429`), więc ponowne uruchomienie efektu przy „Zakończ grę” po cichu wyłączyłoby emotki na końcu wieczoru.
  - Nie rusza `liveBroken`, zgłoszeń, ogranicznika ani odpytywania: zdrowie połączenia mierzy kanał dzwonków, a `rejoin.spec.ts` (`:231-242`, `:499-507`) zakłada, że następne pobranie po uśpieniu gniazda to odpytanie.
- Logi wyspy (`room_channel`) mają `roomId`, nigdy klucza. `parseEmoteMessage` zostaje; komentarz w `RoomScreen.tsx:146-147` mówi o kanale graczy zamiast publicznego.
- Komentarze, które po zmianie mówiłyby o emotkach na kanale publicznym albo „kanale pokoju”, mówią o kanale graczy: `emotes.ts:24-25,51-55`, `useRoomState.ts:10-16,146,386-387`, `rooms/server.ts:843`, `EmoteBar.tsx:48`, `EmoteBubbles.tsx:7`, `tests/e2e/emotes.spec.ts:2`.

#### 4. Podglądy

**File**: `src/pages/dev/room-states.astro`, `src/pages/dev/room-window.astro`

**Intent**: Widoki podglądów mają klucz, żeby typy się zgadzały; podgląd nie łączy się z Realtime.

**Contract**: `seat()` (`room-states.astro:221-227`, `room-window.astro:129-135`) i literały widoków dostają stały klucz w poprawnym formacie.

#### 5. Smoke

**File**: `scripts/smoke.mjs`

**Intent**: Na produkcji złapać rozjazd bazy i kodu: klucz jest w stanie graczy i zmienia się przy usunięciu.

**Contract**: w `removeSteps` (`:756-812`) przed usunięciem krok „host's and Ela's room states carry the same channel key” (22 znaki), po usunięciu „Ela's room state carries a new channel key” (inny niż przed, ten sam co u hosta). Regex formatu klucza obok `LINK_IN_VIEW` (`:207`). Klucze porównane słowami, jak `linkInView`: runner przy porażce wypisuje oczekiwany wzór (`:1044-1049`), więc klucz nigdy nie stoi we wzorze.

#### 6. Testy jednostkowe

**File**: `tests/unit/room-state.test.ts`, `tests/unit/live-sync-server.test.ts` (nowy), `tests/unit/announce.test.ts`, `tests/unit/remembered-nick.test.ts`

**Intent**: Przypiąć parsery, temat i log bez klucza.

**Contract**:

- Literały `RoomView` w `announce.test.ts:25,56,89,123,144` i `colorView` w `remembered-nick.test.ts:355` dostają klucz w poprawnym formacie: `tsconfig.json` obejmuje testy, więc bez tego `astro check` jest czerwony.

- `VIEW_KEYS` (`room-state.test.ts:1144-1161`) z `channel_key`; `parseLobbyState` i `parseRoomView` odrzucają brak klucza, `null`, zły format i złą długość; `roomView` przekazuje klucz gracza.
- `playersTopicFor` daje `live-players:<klucz>`, inny niż `topicFor` tego samego pokoju; `sendEmote` nadaje na temat graczy `{ emote, nick }`; jego log błędu ma `roomId`, a żadna wartość linii logu nie zawiera klucza (stub kanału z błędem `httpSend`).

#### 7. E2E

**File**: `tests/e2e/players-channel.spec.ts` (nowy), `tests/e2e/support/live.ts` (nowy)

**Intent**: Dowieść w przeglądarce i na prawdziwym Realtime, że usunięty traci kanał emotek, obcy nie podrzuci emotki, a pozostali słyszą się dalej.

**Contract**:

- `support/live.ts`: surowy klient Realtime w Node (`@supabase/supabase-js`, jak `tests/db/support/clients.ts:13-16`), URL i klucz publiczny z `GET /api/live-sync/config`; klucz kanału gracza z `context.request.get('/api/rooms/<id>/lobby')` jego kontekstu; słuchacz zapisujący odebrane emotki i nadawca.
- Scenariusz (host, Ola, Zosia, `chromium`, `test.slow()`), nicki i nazwy emotek rozpisane ręcznie; każdy krok inną emotką, żeby dymki się nie myliły:
  1. słuchacz na kluczu Zosi (K1) dostaje „Serce” Oli (kontrola pozytywna); nadawca z K1 i nickiem Oli wysyła inną emotkę, a ekran hosta ją pokazuje (granica w pokoju i kontrola nadawcy);
  2. obcy nadaje emotkę z nickiem Oli na `live-sync:<roomId>`; ekran hosta jej nie pokazuje, a słuchacz tego tematu nie dostaje prawdziwej emotki Oli (Worker nie nadaje już emotek na temat publiczny); okno czekania kończy ta prawdziwa emotka Oli, wysłana po obcej, gdy ekran hosta ją pokaże;
  3. host usuwa Zosię; stan Oli ma nowy klucz K2 ≠ K1;
  4. test czeka, aż ekran hosta dołączy do `live-players:<K2>` (`page.on("websocket")`: ramka `phx_join` z tym tematem i odpowiedź `ok`), bo emotka wysłana wcześniej przepada; potem, po przerwie 3 s, Ola wysyła „Kciuk w górę”: ekran hosta ją pokazuje (przełączył temat), słuchacz K2 ją dostaje, słuchacz K1 nie dostaje niczego (sprawdzone po odbiorze K2 z zapasem);
  5. host kończy grę („Zakończ grę”); po przerwie 3 s Ola wysyła emotkę, której test jeszcze nie użył: ekran hosta na końcu wieczoru ją pokazuje, słuchacz K2 ją dostaje, słuchacz K1 nie dostaje niczego.
- Siatka regresji zostaje zielona: `emotes.spec.ts`, `remove-player.spec.ts`, `lobby-connection-drop.spec.ts`, `rejoin.spec.ts`, `seed.spec.ts`.

### Success Criteria:

#### Automated Verification:

- Bramka lokalna przechodzi: `npm run lint`, `npx astro check`, `npm test`, `npm run build`
- Push do draft PR (za zgodą Karola): CI zielone; `players-channel.spec.ts` przechodzi, siatka regresji e2e zielona, nowe kroki smoke przechodzą
- Próbny alarm e2e: ekran słucha emotek tylko na kluczu z pierwszego stanu; czerwony tylko krok 4 w `players-channel.spec.ts`; po `git revert` CI zielone

#### Manual Verification:

- Podglądy `/dev/room-states` i `/dev/room-window` wyglądają jak przed zmianą (zrzuty przed i po w headless Chrome, serwer dev bez sieci, zatrzymany po pracy)

**Implementation Note**: Próbny alarm według `test-plan.md` §6.4 „Break-check”: efekt emotek bez klucza w zależnościach (subskrybuje klucz z pierwszego widoku). Przewidywanie: czerwone tylko czekanie kroku 4 na dołączenie ekranu hosta do `live-players:<K2>` w `players-channel.spec.ts`, we wszystkich próbach; `emotes.spec.ts` zielony (klucz się nie zmienia), `ci`, `smoke`, `db` zielone. Wynik w rejestrze §6.4.

---

## Faza 3: Dokumenty i wdrożenie

### Overview

Słownik, roadmapa, test-plan i notatki zmiany, potem baza na produkcji przed scaleniem, scalenie przez Karola, smoke na produkcji i przeklikanie na telefonie i laptopie. Wpis migracji w `deploy-plan.md` idzie epilogiem po scaleniu.

### Changes Required:

#### 1. Słownik

**File**: `context/domain/glossary.md`

**Intent**: Nazwy z tej zmiany w sekcji „Pokój i gracze”.

**Contract**:

- Nowy wiersz „kanał na żywo”: temat publiczny pokoju `live-sync:<roomId>` z dzwonkami (niezaufana podpowiedź, stan zawsze z serwera) i temat graczy `live-players:<klucz kanału>` z emotkami; kod: `topicFor`, `playersTopicFor`, `BELL_EVENT`, `LEADER_BELL_EVENT`, `EMOTE_EVENT`.
- Nowy wiersz „klucz kanału”: losowy kod pokoju, który dostaje każdy gracz w stanie pokoju; zmienia się przy usunięciu gracza, nie przy powrocie z innego urządzenia; nigdy w adresie ani logu gry; kod: `rooms.channel_key`, `channel_key`; nie nazywać „token”, „kod linku”.
- Dopiski: „usunięcie gracza” (nowy klucz kanału w tym samym ruchu), „emotka” (idzie kanałem graczy, z kluczem kanału).

#### 2. Roadmapa i fundamenty

**File**: `context/foundation/roadmap.md`, `context/foundation/infrastructure.md`

**Intent**: Wpis w Parked mówi, co jest zamknięte i co zostaje do czatu.

**Contract**:

- Parked „Kanał na żywo tylko dla graczy pokoju” (`roadmap.md:421`) przepisany: od `players-only-live-channel` (data) emotki idą tematem z klucza kanału; zostają dzwonki publiczne (przyjęte od F-01) i podszycie wewnątrz pokoju, które domyka podpis serwera (W-E) przy podjęciu czatu.
- Parked „Drobny czat w pokoju” (`:413`): dopisek, że przed czatem potrzebny jest podpis serwera (W-E, `research.md` tej zmiany).
- `infrastructure.md:151,156,198`: dopisek o kluczu kanału i poprawiony link do `context/archive/2026-10-26-room-emotes/`.
- `updated:` we frontmatterze obu plików.

#### 3. Test-plan i notatki

**File**: `context/foundation/test-plan.md`, `context/changes/players-only-live-channel/change.md`

**Intent**: Nowy wzór testu (surowy klient Realtime) i wyniki alarmów tam, gdzie następna zmiana ich szuka.

**Contract**:

- §6.4: `players-channel.spec.ts` na liście wzorów, punkt „Raw Realtime client” (`support/live.ts`: skąd URL, klucz i klucz kanału, kontrola pozytywna przed każdym „nie dostał”), wynik alarmu Fazy 2. §6.2: wynik alarmu Fazy 1. Freshness Ledger z datą.
- `change.md` Notes: decyzje 1–4 z datą.

#### 4. Wdrożenie

**File**: — (polecenia; `context/deployment/deploy-plan.md` epilogiem)

**Intent**: Baza przed kodem, potem scalenie i sprawdzenie na produkcji.

**Contract**:

- Z domu albo przez hotspot (nie eduroam), każdy krok za zgodą Karola: `npx supabase db push --dry-run` pokazuje tylko `*_players_channel_key.sql` → `npx supabase db push` → `npx supabase migration list` zgodny.
- PR gotowy (nie draft) → scala Karol (`! gh pr merge <n> --merge`) → Workers Builds → smoke na produkcji (za zgodą).
- Epilog osobnym PR-em: wpis w „Wgrane migracje” w `deploy-plan.md` z wynikiem `db advisors`, SHA w Progress.

### Success Criteria:

#### Automated Verification:

- `npx prettier --check` dla zmienionych plików `.md` przechodzi
- `npx supabase db push --dry-run` pokazuje tylko nową migrację, a po `db push` `npx supabase migration list` jest zgodny (za zgodą Karola, nie z eduroam)
- Po scaleniu: Workers Builds zielony, na `main` zielone `ci`, `smoke`, `db`, `e2e`
- Smoke na produkcji zielony, z nowymi krokami klucza kanału (za zgodą Karola)

#### Manual Verification:

- Karol na telefonie i laptopie: emotki w poczekalni, w grze i na końcu wieczoru dochodzą do wszystkich; po usunięciu gracza w grze testowej pozostali dalej widzą swoje emotki, a usunięty widzi „Usunięto cię z pokoju.”

**Implementation Note**: `PR NIE scalać przed db push`: nowy parser odrzuci stan pokoju bez klucza. Otwarte w chwili wdrożenia karty ze starym kodem słuchają emotek na temacie publicznym, więc do odświeżenia ich nie zobaczą; wdrażać poza wieczorem gry.

---

## Testing Strategy

### Unit Tests:

- Parsery stanu i widoku: klucz wymagany, format i długość; `VIEW_KEYS`.
- `roomView` przekazuje klucz; `playersTopicFor` różny od `topicFor`; `sendEmote` na temat graczy; log błędu bez klucza.

### Integration Tests:

- Baza (`tests/db/channel-key.test.ts`): kto dostaje klucz w każdym statusie, rotacja przy usunięciu, brak rotacji przy powrocie, brak klucza dla spóźnionego i przez REST dla obcych.
- pgTAP: kształt kolumny, różne klucze pokoi.
- E2E (`players-channel.spec.ts`): kontrola pozytywna, obcy na temacie publicznym, usunięcie i przełączenie, usunięty bez emotek, emotki na końcu wieczoru.
- Smoke: klucz w stanie i jego zmiana przy usunięciu, na CI i na produkcji.

### Manual Testing Steps:

1. Telefon i laptop, pokój testowy z 3 graczami: emotki w poczekalni dochodzą do wszystkich.
2. W grze host usuwa jednego gracza; pozostali wysyłają emotki i widzą je u siebie nawzajem; usunięty widzi „Usunięto cię z pokoju.”.
3. „Zakończ grę”: emotki na końcu wieczoru dalej dochodzą.

## Performance Considerations

Liczba połączeń WebSocket bez zmian (jedno na ekran), na ekranie dochodzi jeden kanał. Liczba wiadomości emotek bez zmian: jedna emotka to dalej jeden broadcast do graczy pokoju. Usunięcie gracza daje jednorazowo do kilkunastu ponownych dołączeń do kanału (każdy pozostały ekran raz).

## Migration Notes

- Istniejące pokoje dostają klucz z wartości domyślnej przy `add column`; tabela `rooms` jest mała, przepisanie trwa chwilę.
- Wycofanie: kolumna i dodatkowe pole w `room_lobby` nie przeszkadzają staremu Workerowi, więc cofnięcie kodu (`wrangler rollback`, za zgodą) działa bez cofania migracji.

## References

- Research: `context/changes/players-only-live-channel/research.md` (sekcja „Kontynuacja”)
- Wzór rotacji i testów: `context/changes/remove-player-new-link/`, `supabase/migrations/20261101125331_remove_player.sql:149-152`, `tests/db/remove-player.test.ts:205-229`
- Wzór odtworzenia funkcji: `supabase/migrations/20261107091322_game_length.sql:24-42,304-594`
- Decyzje F-01 i S-16 o kanale publicznym: `context/archive/2026-09-27-live-sync-spike/external-research.md`, `context/archive/2026-10-26-room-emotes/plan.md`
- Testy: `context/foundation/test-plan.md` §6.2, §6.4, §6.5

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: Baza

#### Automated

- [x] 1.1 Bramka lokalna przechodzi: `npm run lint`, `npx astro check`, `npm test`, `npm run build` — c6ab7b0
- [x] 1.2 Draft PR do `main` (push za zgodą Karola): CI zielone we wszystkich jobach, w `db` nowy `channel-key.test.ts` i nowe asercje pgTAP przechodzą — c6ab7b0
- [x] 1.3 Próbny alarm: tymczasowy commit zapala tylko przewidziane testy; po `git revert` CI zielone — d4e57a0

#### Manual

- [x] 1.4 Karol czyta streszczenie migracji (kto dostaje klucz, kiedy się zmienia, czego nie dostaje spóźniony i usunięty) i je akceptuje — c6ab7b0

### Phase 2: Worker i ekrany

#### Automated

- [x] 2.1 Bramka lokalna przechodzi: `npm run lint`, `npx astro check`, `npm test`, `npm run build` — 4258b11
- [x] 2.2 Push do draft PR (za zgodą Karola): CI zielone; `players-channel.spec.ts` przechodzi, siatka regresji e2e zielona, nowe kroki smoke przechodzą — 4258b11
- [x] 2.3 Próbny alarm e2e: ekran słucha emotek tylko na kluczu z pierwszego stanu; czerwony tylko krok 4 w `players-channel.spec.ts`; po `git revert` CI zielone — 2900704

#### Manual

- [x] 2.4 Podglądy `/dev/room-states` i `/dev/room-window` wyglądają jak przed zmianą (zrzuty przed i po w headless Chrome, serwer dev bez sieci, zatrzymany po pracy) — 4258b11

### Phase 3: Dokumenty i wdrożenie

#### Automated

- [x] 3.1 `npx prettier --check` dla zmienionych plików `.md` przechodzi
- [ ] 3.2 `npx supabase db push --dry-run` pokazuje tylko nową migrację, a po `db push` `npx supabase migration list` jest zgodny (za zgodą Karola, nie z eduroam)
- [ ] 3.3 Po scaleniu: Workers Builds zielony, na `main` zielone `ci`, `smoke`, `db`, `e2e`
- [ ] 3.4 Smoke na produkcji zielony, z nowymi krokami klucza kanału (za zgodą Karola)

#### Manual

- [ ] 3.5 Karol na telefonie i laptopie: emotki w poczekalni, w grze i na końcu wieczoru dochodzą do wszystkich; po usunięciu gracza w grze testowej pozostali dalej widzą swoje emotki, a usunięty widzi „Usunięto cię z pokoju.”
