# Powrót po odświeżeniu (S-04) Implementation Plan

> **Decyzje Karola (2026-11-03): D1 = tak, D2 = tak.** D1: własny głos w `sessionStorage` karty do końca rundy, z wyjątkiem w AGENTS.md i PRD (Faza 2). D2: powrót bez ciasteczka przez prośbę zatwierdzaną przez prowadzącego (Fazy 3–4). `change.md` = `planned`, roadmapa S-04 = `planning`.

## Overview

Gracz, który odświeży stronę albo straci połączenie, ma w mniej niż 10 s wrócić na swój nick w bieżącej rundzie i widzieć swój oddany głos, a nikt inny nie może w tym czasie przejąć jego nicku (roadmapa S-04, PRD US-01, FR-011, `prd.md:151`). Odświeżenie z ciasteczkiem już działa. Ten plan dokłada trzy rzeczy: szybsze doganianie stanu po zerwanym połączeniu, własny głos z pamięci karty po przeładowaniu oraz powrót na swój nick bez ciasteczka po zatwierdzeniu przez prowadzącego.

## Current State Analysis

Pełne ustalenia: `context/changes/rejoin-after-refresh/research.md`. W skrócie:

- Odświeżenie z ciasteczkiem `mlt_player_<roomId>` (24 h) przywraca gracza w jednym załadowaniu strony: `/r/[id].astro` woła `room_lobby` po stronie serwera. Gracz widzi bieżącą rundę i „Głos oddany” z `me_voted`, bez linijki „Twój głos: X.” (`RoundVoting.tsx:153-154,336`).
- Serwer nie zna pary głosujący→cel w jednym wierszu (`round_voters` bez celu, `ballot_boxes` liczniki) i nie ma jej zwracać; pilnują tego `tests/db/round-anonymity.test.ts:140-172` i pgTAP `round_creator_view.test.sql:866-873`.
- Nicku nie da się przejąć (`players_room_nick_key`, odmowa `nick_taken`), ale kto zgubi ciasteczko, nie wróci na swój nick żadną drogą. Prośby spóźnionych (`join_requests`, `request_join`, `admit_latecomer`) działają tylko w trakcie gry i zawsze tworzą nowe miejsce.
- Zerwane połączenie: ekran odpytuje co 15 s, póki kanał uchodzi za żywy (`LOBBY_POLL_MS`), a realtime-js 2.116 wykrywa martwe gniazdo po ok. 25–50 s (heartbeat 25 s, timeout równy interwałowi). Nasłuchu `online` nie ma. Najgorszy przypadek przekracza 10 s.

## Desired End State

- Gracz z zerwanym połączeniem (martwe gniazdo, widoczna karta) widzi nowy stan rundy w ≤ 10 s bez przeładowania; po powrocie sieci (`online`) albo powrocie strony z bfcache (`pageshow`) natychmiast.
- Po przeładowaniu w trakcie głosowania gracz widzi „Głos oddany” i „Twój głos: X.” albo „Wstrzymujesz się.”, w tej samej karcie. Wpis w `sessionStorage` znika przy odsłonie, pominięciu i nowej rundzie. Serwer dalej zwraca tylko `me_voted`.
- Gracz bez ciasteczka (inna przeglądarka, wyczyszczone dane) przy zajętym nicku może poprosić o powrót na swoje miejsce; prowadzący widzi „Kasia chce wrócić” i wpuszcza albo odrzuca; po „Wpuść” gracz wraca na swoje miejsce (kolor, wyniki, `me_voted` zostają), a stare urządzenie pokazuje, że gracz wrócił gdzie indziej. W poczekalni i w trakcie gry.
- Weryfikacja: e2e `rejoin.spec.ts` (odświeżenie, martwe gniazdo, powrót bez ciasteczka), testy bazy `tests/db/rejoin.test.ts`, testy anonimowości bez zmian kluczy.

### Key Discoveries:

- `RoundVoting` jest montowany z `key={view.round.number}` (`RoomScreen.tsx:375-377`) i znika przy odsłonie i pominięciu, więc kasowanie wpisu głosu musi siedzieć w `RoomScreen`, nie w `RoundVoting`.
- Pamięć przeglądarki czytamy po zamontowaniu, nie w inicjalizatorze `useState` (zgodność z HTML z serwera): wzór `useNickField.ts:4-5,17-23`, `RoomScreen.tsx:318-327`; bezpieczny dostęp `browserSessionStorage()` (`remembered-nick.ts:101-109`).
- `LOBBY_POLL_MS` służy też `JoinWaiting.tsx:9,142` i ogranicznikowi (`limiter.ts:109`), a wyrocznie „dzwonek szybszy niż odpytanie” porównują z nim czas (`test-plan.md:292-296`, `seed.spec.ts:24-26`, `lobby-connection-drop.spec.ts:47`, `player-color.spec.ts:85-87`, `game.spec.ts:132-134`).
- `admit_latecomer` przy nicku istniejącego gracza kończy się dziś `latecomer_nick_taken` (`20261031090821_player_color_choice.sql:247-312`); `join_requests.status` ma tylko `pending|rejected` (`20261022132240_latecomer_admission.sql:39-61`); `JoinRequests` renderuje się tylko w trakcie gry (`RoomScreen.tsx:438-441`).
- Stare urządzenie po przepięciu miejsca trafiłoby w ścieżkę „Usunięto cię z pokoju.” (`src/pages/r/[id].astro:35-51,77-81`), bo `join_request_state` daje `none`.
- `e2e/support/realtime.ts:15` `sleepableRealtime` (`sleep()` udaje martwe gniazdo) i `ROUND_UPDATE_MS = 10 s` (`support/round.ts:12`) są gotowe do testu D3.

## What We're NOT Doing

- Serwer nie zwraca ani nie zapisuje celu głosu; `VOTING_ROUND_KEYS` i odpowiedź `cast_vote` bez zmian.
- Własnego głosu nie pamiętamy w `localStorage`, w ciasteczku ani w adresie; po zamknięciu karty albo w innej przeglądarce widać tylko „Głos oddany”.
- Nie przywracamy po przeładowaniu niewysłanego wyboru, kciuka na odsłonie, „Koło”/„Paski” ani emotek.
- Host wraca logowaniem, nie prośbą; prośba o powrót na nick hosta jest odrzucana.
- Bez dłuższego ciasteczka, odnawiania ciasteczka i kodów powrotu; bez obecności („kto jest online”).
- Bez zmiany heartbeatu realtime-js (koszt wiadomości w limicie Supabase niepewny); wystarcza odpytywanie i nasłuchy.

## Implementation Approach

Najpierw część niezależna od decyzji (Faza 1: czas po zerwaniu połączenia i e2e odświeżenia), potem D1 w samej przeglądarce (Faza 2), potem D2 w kolejności baza → serwer i ekrany (Fazy 3–4), na końcu wdrożenie (Faza 5). Fazy zmieniające `RoundVoting.tsx`, `RoomScreen.tsx` i `src/pages/r/[id].astro` startują po scaleniu PR #38 i odświeżeniu gałęzi z `origin/main`.

## Critical Implementation Details

- **Kolejność kasowania wpisu głosu:** `RoomScreen` kasuje wpis, gdy widok nie jest głosowaniem albo numer rundy różni się od zapisanego; `RoundVoting` zapisuje go dopiero po `{ok:true}`. Odczyt po zamontowaniu, tylko gdy `round.me_voted` i numer się zgadza; inaczej wpis jest kasowany, nie pokazywany.
- **Przepięcie miejsca:** w jednej transakcji z blokadą pokoju: stary hash z `player_secrets` trafia jako ślad „przeniesiony” (żeby stare urządzenie dostało właściwy tekst), nowy hash z prośby zastępuje go, prośba znika. Unikalność `token_hash` w obu tabelach musi to przepuścić.

## Faza 1: Doganianie stanu po zerwaniu połączenia

### Overview

Każdy widoczny ekran pokoju dogania stan w ≤ 10 s także przy martwym gnieździe, a od razu po powrocie sieci; e2e utrwala dzisiejsze odświeżenie z ciasteczkiem.

### Changes Required:

#### 1. Częstsze odpytywanie ekranu pokoju

**File**: `src/lib/live-sync/shared.ts`, `src/components/room/useRoomState.ts`

**Intent**: Ekran pokoju odpytuje co 8 s, póki kanał uchodzi za żywy; poczekalnia spóźnionego i ogranicznik zostają przy 15 s.

**Contract**: nowa stała `ROOM_POLL_MS = 8000` obok `LOBBY_POLL_MS` (bez zmiany jej wartości); `schedulePoll` w `useRoomState.ts:259-268` używa `ROOM_POLL_MS` zamiast `LOBBY_POLL_MS`; `BROKEN_POLL_MS` bez zmian. Komentarz z rachunkiem: 20 graczy ≈ 150 pobrań/min, wieczór 3 h ≈ 27 tys. wobec 100 tys./dzień w planie Workers.

#### 2. Natychmiastowe pobranie po powrocie sieci

**File**: `src/components/room/useRoomState.ts`

**Intent**: Po zdarzeniu `online` i po `pageshow` z `persisted` ekran pobiera stan od razu.

**Contract**: nasłuchy na `window` rejestrowane i zdejmowane w tym samym efekcie co `visibilitychange` (`:343`, `:353`), wołają `limiter.refresh()`; bez zmian w podglądach (`isPreview`).

#### 3. Wyrocznie dzwonka

**File**: `tests/e2e/seed.spec.ts`, `tests/e2e/lobby-connection-drop.spec.ts`, `tests/e2e/player-color.spec.ts`, `tests/e2e/game.spec.ts`, `tests/e2e/remove-player.spec.ts`, `tests/e2e/support/round.ts`, `src/lib/live-sync/shared.ts`, `context/foundation/test-plan.md`

**Intent**: Wyrocznia „stan przyszedł dzwonkiem, nie odpytaniem” porównuje czas z odpytywaniem ekranu pokoju, inaczej przechodziłaby na samym odpytaniu.

**Contract**: porównania `< LOBBY_POLL_MS` na ekranie pokoju → `< ROOM_POLL_MS`, także w `remove-player.spec.ts:69-70,88-91,141-150` (inaczej próbny alarm S-09 z `test-plan.md:316` przestaje działać); `LOBBY_POLL_MS` zostaje w `JoinWaiting` i jako sufit ogranicznika (`limiter.ts:109`), komentarz `shared.ts:9-11` rozdzielony na obie stałe; `limiter.test.ts` bez zmian. `ROUND_UPDATE_MS` (10 s) jest odtąd dłuższe niż odpytywanie (8 s), więc zwykłe czekanie na przejście fazy nie dowodzi już dzwonka: dowodzą go tylko wyrocznie `< ROOM_POLL_MS`; komentarz `support/round.ts:9-11` i `test-plan.md:291-296` mówią to wprost, a 10 s to teraz budżet S-04 (PRD „w mniej niż 10 s”). Budżet 8 s w `lobby-connection-drop` i `player-color` obejmuje kroki przygotowania (wejście drugiego gościa, powrót połączenia): pierwszy przebieg CI zapisuje zmierzony czas w komunikacie asercji, a gdy zapas wyjdzie poniżej 2 s, test liczy od pobrania tuż przed akcją (wzór `game.spec.ts`, `test-plan.md:293`).

#### 4. E2E odświeżenia i martwego gniazda

**File**: `tests/e2e/rejoin.spec.ts` (nowy)

**Intent**: Dwa scenariusze: (a) gość głosuje, przeładowuje stronę i jest na swoim nicku na liście „Gracze”, widzi „Głos oddany” i nie ma formularza głosu; (b) gość ma martwe gniazdo (`sleepableRealtime().sleep()`), host odsłania wynik, a gość widzi odsłonę w `ROUND_UPDATE_MS` (10 s) bez przeładowania.

**Contract**: helpery z `support/room.ts` i `support/round.ts`. Scenariusz (b) ustawia fazę odpytywania, bo ekran w grze odpytuje w nieznanej fazie (`test-plan.md:293`), a łańcuch `setTimeout` w `useRoomState.ts:259-268` nie restartuje się po dzwonku: po `sleep()` test czeka na jedno pobranie z odpytywania (`nextListFetch`) i zaraz potem host odsłania wynik. To najgorszy przypadek (następne odpytanie po ~8 s), więc test mierzy czas od potwierdzenia „Odsłoń wynik” do odsłony u gościa i wymaga `< ROUND_UPDATE_MS`; przy `ROOM_POLL_MS = 15000` czerwieni się za każdym razem, nie w 1 przebiegu na 3.

### Success Criteria:

#### Automated Verification:

- Bramka lokalna przechodzi: `npm run lint`, `npx astro check`, `npm test`, `npm run build`
- `npx playwright test --list` pokazuje `rejoin.spec.ts`
- Draft PR do `main`: CI zielone we wszystkich jobach, w `e2e` oba scenariusze `rejoin.spec.ts` przechodzą
- Próbny alarm: tymczasowy commit z `ROOM_POLL_MS = 15000` zapala tylko scenariusz (b); po `git revert` CI zielone

#### Manual Verification:

- Na serwerze dev w Chrome na laptopie (serwer dev słucha tylko na `localhost`, telefon go nie widzi): DevTools → Network → Offline na kilka sekund w trakcie rundy, po powrocie do Online stan dogania się od razu; pokój powstaje w produkcyjnej bazie jak przy smoke na dev, więc za zgodą

**Implementation Note**: Próbny alarm według `test-plan.md` §6.4 „Break-check”, przewidywanie w opisie commita. Po fazie pauza na akceptację Karola.

---

## Faza 2: Własny głos po przeładowaniu (D1)

### Overview

Po przeładowaniu w trakcie głosowania gracz widzi, na kogo zagłosował, z pamięci tej karty; wpis żyje najwyżej do końca rundy.

### Changes Required:

#### 1. Moduł pamięci głosu

**File**: `src/lib/rooms/my-vote.ts` (nowy), `tests/unit/my-vote.test.ts` (nowy)

**Intent**: Zapis, odczyt i kasowanie własnego głosu w `sessionStorage`, osobno od pamięci nicku (S-14 zakazuje tam głosu).

**Contract**: klucz `mlt-my-vote:<roomId>`, wartość JSON `{round: number, target: string | null}`; funkcje `rememberMyVote(storage, roomId, round, target)`, `recallMyVote(storage, roomId, round)` (zwraca `MyVote | null`, zły format → kasuje i `null`), `forgetMyVote(storage, roomId)`; dostęp przez `browserSessionStorage()`; nigdy nie rzuca; log tylko `op`/`step`/`errName` (wzór `remembered-nick.ts`), nigdy nick ani cel. Testy jak `remembered-nick.test.ts`: zapis/odczyt, inna runda → `null` i skasowanie, odmowa pamięci bez nicku w logu.

#### 2. Ekran głosowania i pokoju

**File**: `src/components/room/RoundVoting.tsx`, `src/components/room/RoomScreen.tsx`

**Intent**: `RoundVoting` zapisuje głos po `{ok:true}` i po zamontowaniu odtwarza `myVote` z pamięci, gdy `round.me_voted`; `RoomScreen` kasuje wpis, gdy widok przestaje być głosowaniem tej rundy.

**Contract**: zapis obok `setMyVote` (`RoundVoting.tsx:181`); odczyt w efekcie po zamontowaniu (nie w `useState`); podglądy pomijają pamięć; komentarz `:34-35` zmieniony na regułę „tylko karta gracza, do końca rundy (AGENTS.md)”.

#### 3. Wyjątek w zasadach

**File**: `AGENTS.md`, `context/foundation/prd.md`, `context/domain/glossary.md`, `tests/e2e/cohost.spec.ts`

**Intent**: Zapisać przyjętą granicę: własny głos gracza w `sessionStorage` jego karty, od głosu do odsłony, pominięcia albo nowej rundy; gdy ekran pokoju w tej karcie już się nie otworzy (gracz usunięty albo przeniesiony, pokój zamknięty: kasować nie ma kto), najdłużej do zamknięcia karty; serwer, host i twórca gry nadal go nie znają.

**Contract**: AGENTS.md Hard Rules — dopisek do zdania o anonimowości; PRD `:152` — nowy świadomie przyjęty przypadek; słownik `:16`; komentarz `cohost.spec.ts:226-227` zaktualizowany.

#### 4. Podgląd i e2e

**File**: `src/pages/dev/room-states.astro`, `tests/e2e/rejoin.spec.ts`

**Intent**: Nowy stan na końcu listy „Gość: po odświeżeniu, głos z pamięci karty”; podgląd 35 opisany jako „pamięć karty pusta”. W e2e scenariusz (a) sprawdza po przeładowaniu „Twój głos: X.”, nowy scenariusz: wstrzymanie się → przeładowanie → „Wstrzymujesz się.”; po odsłonie `sessionStorage` nie ma klucza `mlt-my-vote:<roomId>`.

**Contract**: numer nowego podglądu = następny wolny (bez przenumerowania).

### Success Criteria:

#### Automated Verification:

- Bramka lokalna przechodzi: `npm run lint`, `npx astro check`, `npm test`, `npm run build`
- `tests/unit/my-vote.test.ts` przechodzi
- CI na PR zielone, w `db` testy anonimowości bez zmian, w `e2e` scenariusze głosu po przeładowaniu przechodzą
- Próbny alarm: tymczasowy commit bez kasowania w `RoomScreen` zapala tylko sprawdzenie pustej pamięci po odsłonie; po `git revert` CI zielone

#### Manual Verification:

- Karol akceptuje brzmienie wyjątku w AGENTS.md i PRD
- Na serwerze dev w Chrome na laptopie: głos, przeładowanie (F5), widać „Twój głos: X.” (telefon sprawdza 5.4 na produkcji)

**Implementation Note**: Wygląd się nie zmienia (ta sama linijka co przed przeładowaniem), więc bez wariantów na zrzutach. Po fazie pauza na akceptację Karola.

---

## Faza 3: Powrót bez ciasteczka — baza (D2)

### Overview

Prośba o powrót na istniejące miejsce i przepięcie tokenu po „Wpuść”, w poczekalni i w trakcie gry.

### Changes Required:

#### 1. Migracja

**File**: `supabase/migrations/<timestamp>_rejoin_after_refresh.sql` (przez `npx supabase migration new rejoin_after_refresh`)

**Intent**: Prośba może wskazywać istniejące miejsce; prowadzący ją zatwierdza albo odrzuca jak prośbę spóźnionego; zatwierdzenie przepina miejsce na nowy token, a stary token zostawia ślad „przeniesiony”.

**Contract**:

- `join_requests.player_id uuid null references public.players on delete cascade` (powrót, gdy nie null); `status` dopuszcza `moved` (ślad starego tokenu, tylko do `join_request_state`); wiersz `moved` ma `nick` miejsca (kolumna `NOT NULL`) i `player_id = null`, więc nigdy nie jest prośbą o powrót; limit 5 i `nick_taken` liczą tylko `pending` (`20261022132240_latecomer_admission.sql:171-185`), więc ślad ich nie blokuje;
- `request_join` (`:160-192` dziś wskrzesza każdy wiersz tokenu jako `pending`) i `request_return`: gdy token ma wiersz `moved`, wiersz jest kasowany, a prośba idzie jak nowa; ślad nigdy nie wraca jako prośba ani nie daje `{ok:true}` bez prośby;
- `request_return(p_link_token text, p_nick text, p_player_token text) returns jsonb`: pokój w `lobby` albo `playing` (inaczej `room_closed`), token już gracza → `{ok:true}`, nick musi należeć do gościa (nie hosta: `host_returns_by_login`; brak: `player_unknown`), ten token ma już prośbę `pending` → `{ok:true}`, cudza oczekująca prośba na ten nick → `nick_taken`, limit 5 → `requests_full`; zapis jak w `request_join`;
- `admit_latecomer`: dla prośby z `player_id` przepina `player_secrets.token_hash` na hash prośby, stary hash zapisuje jako wiersz `moved`, kasuje prośbę; działa także w `lobby`; dla prośby bez `player_id` bez zmian (tylko `playing`);
- `reject_latecomer`: także w `lobby` dla prośby powrotu;
- `join_request_state`: `moved` dla śladu (dziś zwraca status wiersza, `:247-255`, więc wystarczy dopuścić wartość); `room_lobby`: nowy klucz `returning` (nicki oczekujących próśb powrotu, tylko dla prowadzących, podzbiór `requests`); `requests` już dziś przychodzi w każdym stanie pokoju (`20261101125331_remove_player.sql:249-253`), w poczekalni ogranicza go tylko ekran;
- `drop_round_state` bez zmian: już kasuje wszystkie wiersze `join_requests` pokoju przy jego zamknięciu (`20261026074427_question_play_data.sql:243-262`); test bazy to potwierdza dla śladu `moved`;
- RLS/granty jak `request_join` (anon, authenticated), `set search_path = ''`, właściciel `postgres`.

#### 2. Testy bazy i widok twórcy

**File**: `tests/db/rejoin.test.ts` (nowy), `tests/db/support/rounds.ts`, `supabase/tests/round_creator_view.test.sql`, `tests/unit/room-rpc-gate.test.ts`

**Intent**: Dowód reguł: powrót tylko po „Wpuść” prowadzącego; cudzy token nie przepina miejsca; po powrocie stary token daje `room_lobby` = `null` i `join_request_state` = `moved`; stary token prosi potem jako spóźniony pod nowym nickiem → nowa prośba bez `player_id`, a jej „Wpuść” nie rusza przeniesionego miejsca; wracający zachowuje kolor, wyniki i `me_voted` (drugi głos → `already_voted`); prośba na nick hosta odrzucona; w poczekalni i w grze; współhost może wpuścić; `LOBBY_KEYS` z `returning`; po `end_game` nie zostaje żaden wiersz `join_requests` pokoju.

**Contract**: helpery `requestReturn` obok `requestJoin`; pgTAP: `plan(...)` podbity, fakty nowej funkcji i nowych wersji, kolumna `player_id`, brak grantów na `join_requests`; wiersz RPC w `room-rpc-gate.test.ts`.

### Success Criteria:

#### Automated Verification:

- Bramka lokalna przechodzi: `npm run lint`, `npx astro check`, `npm test`, `npm run build`
- CI na PR zielone, w `db` `rejoin.test.ts` i nowe asercje pgTAP przechodzą, testy anonimowości bez zmian
- Próbny alarm: tymczasowy commit, w którym `admit_latecomer` nie zapisuje śladu `moved`, zapala tylko przewidziane testy; po `git revert` CI zielone; tymczasowej migracji nie wgrywamy

#### Manual Verification:

- Karol czyta streszczenie migracji (kto prosi, kto zatwierdza, co dzieje się ze starym urządzeniem, głosem i wynikami) i je akceptuje

**Implementation Note**: Po fazie pauza na akceptację Karola.

---

## Faza 4: Powrót bez ciasteczka — serwer i ekrany (D2)

### Overview

Gracz z zajętym nickiem może poprosić o powrót; prowadzący widzi prośbę także w poczekalni; stare urządzenie ma własny tekst.

### Changes Required:

#### 1. Worker

**File**: `src/pages/api/rooms/join.ts`, `src/lib/rooms/server.ts`, `src/lib/rooms/shared.ts`, `src/lib/rooms/errors.ts`, `src/pages/j/[token].astro`, `src/pages/r/[id].astro`

**Intent**: Formularz wejścia po `nick_taken` daje drugą drogę: „To mój nick — poproś o powrót”, która woła `request_return`, zapisuje ciasteczko, dzwoni i prowadzi na ekran oczekiwania; `/r/[id]` przy stanie `moved` pokazuje tekst o powrocie na innym urządzeniu.

**Contract**: `POST /api/rooms/join` z polem powrotu; wrapper `requestReturn`; parser stanu z `returning`; `parseJoinRequestState` i typ `JoinRequestState` przyjmują `moved` (`shared.ts:430-441`; dziś `fail("state")`, a `/r/[id]` dałby wtedy 500 „Nie udało się otworzyć pokoju.” zamiast nowego tekstu), tak samo `JoinWaiting.tsx:111-120` i `requestAnswer` w `scripts/smoke.mjs:247-253`; unit test parsera z `moved`; nowe kody (`host_returns_by_login`, `player_unknown` w tym kontekście) z tekstami; tekst `nick_taken` wskazuje nową drogę; `JoinWaiting` dostaje wariant tekstu dla powrotu; unit testy parsera i tekstów; smoke: krok powrotu bez ciasteczka.

#### 2. Ekrany (warianty → wybór Karola)

**File**: `src/components/room/JoinForm.tsx`, `src/components/room/JoinWaiting.tsx`, `src/components/room/JoinRequests.tsx`, `src/components/room/RoomScreen.tsx`, `src/components/room/RoomLobby.tsx`, `src/pages/dev/room-states.astro`, `src/pages/dev/room-window.astro`

**Intent**: Najpierw 2–3 warianty na zrzutach (przycisk powrotu przy odmowie nicku, wiersz „Kasia chce wrócić” u prowadzącego w poczekalni i w grze, tekst na starym urządzeniu), Karol wybiera; potem ekrany i podglądy.

**Contract**: `JoinRequests` renderowany także w poczekalni dla prowadzących; wiersz powrotu odróżniony tekstem, nie samym kolorem; tokeny UI z `global.css`; nowe stany na końcu `/dev/room-states`, w `/dev/room-window` stan poczekalni z prośbą.

#### 3. E2E

**File**: `tests/e2e/rejoin.spec.ts`, `tests/e2e/support/room.ts`

**Intent**: Scenariusz: gość w kontekście A głosuje; kontekst B bez ciasteczka wpisuje ten sam nick, prosi o powrót, host wpuszcza; B widzi pokój na tym nicku z „Głos oddany”, A po przeładowaniu widzi tekst o powrocie gdzie indziej. Drugi scenariusz w poczekalni.

### Success Criteria:

#### Automated Verification:

- Bramka lokalna przechodzi: `npm run lint`, `npx astro check`, `npm test`, `npm run build`
- CI na PR zielone, w `e2e` scenariusze powrotu bez ciasteczka przechodzą, w `smoke` krok powrotu PASS
- Próbny alarm e2e: trasa powrotu bez dzwonka zapala tylko przewidziane scenariusze; po `git revert` CI zielone

#### Manual Verification:

- Karol wybiera warianty na zrzutach
- Karol ocenia zrzuty gotowych stanów (odmowa nicku z przyciskiem powrotu, oczekiwanie, prośba u hosta i współhosta w poczekalni i w grze, stare urządzenie) na laptopie i telefonie

**Implementation Note**: Najpierw warianty i wybór Karola, dopiero potem ekrany. Po fazie pauza na akceptację Karola.

---

## Faza 5: Wdrożenie

### Overview

Baza, potem kod (`context/deployment/deploy-plan.md`), smoke na produkcji i gra z ekipą.

### Changes Required:

#### 1. Baza na produkcji

**Intent**: Migracja Fazy 3 na produkcji przed scaleniem kodu.

**Contract**: PR gotowy (nie draft), CI zielone; `npx supabase db push --dry-run` (tylko ta migracja), `db push`, `migration list`, każde za zgodą i nie z eduroam; Advisors → Security bez nowych błędów; wpis w `deploy-plan.md`; smoke na serwerze dev.

#### 2. Scalenie i sprawdzenie

**Intent**: Kod na produkcji i dowód, że działa.

**Contract**: scala Karol (`! gh pr merge <n> --merge`); potem `BASE_URL=https://most-likely-to.charlesonthewave.workers.dev npm run smoke` (za zgodą) i gra z ekipą.

### Success Criteria:

#### Automated Verification:

- `npx supabase migration list` pokazuje nową migrację lokalnie i zdalnie
- Smoke na produkcji zielony

#### Manual Verification:

- Karol scala PR
- Karol z ekipą: ktoś odświeża w trakcie rundy i widzi swój głos; ktoś otwiera link w innej przeglądarce, prosi o powrót, prowadzący wpuszcza

**Implementation Note**: Przy grze z ekipą powiedzieć, że po otwarciu linku w innej przeglądarce trzeba wpisać swój nick i nacisnąć „poproś o powrót”.

---

## Testing Strategy

### Unit Tests:

- `my-vote.test.ts`: zapis/odczyt/kasowanie, inna runda, zły format, odmowa pamięci bez danych w logu
- parser stanu z `returning`, teksty nowych odmów, wiersz RPC w `room-rpc-gate.test.ts`

### Integration Tests:

- `tests/db/rejoin.test.ts` (reguły powrotu), pgTAP widoku twórcy, testy anonimowości bez zmian
- e2e `rejoin.spec.ts`: odświeżenie, martwe gniazdo, głos z pamięci karty, powrót bez ciasteczka w grze i w poczekalni

### Manual Testing Steps:

1. Telefon: głos, przeciągnięcie strony, widać „Twój głos: X.”
2. Telefon: tryb samolotowy w trakcie rundy, host odsłania, po wyłączeniu trybu odsłona od razu
3. Link otwarty w drugiej przeglądarce: ten sam nick, „poproś o powrót”, host wpuszcza, pierwsza przeglądarka pokazuje tekst o powrocie gdzie indziej

## Performance Considerations

Odpytywanie ekranu pokoju 15 s → 8 s: 20 graczy ≈ 150 pobrań/min, wieczór 3 h ≈ 27 tys. pobrań plus dzwonki, w limicie 100 tys./dzień planu Workers (`context/foundation/infrastructure.md`). Dwa–trzy takie wieczory jednego dnia zbliżają się do limitu.

## Migration Notes

Jedna migracja (Faza 3), wgrana przed scaleniem kodu. Stary kod z nową bazą działa: `requests` zostaje listą nicków, a parser stanu buduje wynik z nazwanych pól i nieznanego klucza najwyższego poziomu nie odrzuca (`src/lib/rooms/shared.ts:379-391`; ścisłe klucze sprawdza tylko w `round`, `:258`), więc `returning` stary kod pominie. Prośba powrotu złożona przed scaleniem kodu jest niemożliwa (stary Worker nie woła `request_return`).

## References

- Research: `context/changes/rejoin-after-refresh/research.md`
- Wzór prośby i „Wpuść”: `supabase/migrations/20261022132240_latecomer_admission.sql`, `src/components/room/JoinRequests.tsx`, `tests/db/latecomers.test.ts`, `tests/e2e/latecomer.spec.ts`
- Wzór pamięci przeglądarki: `src/lib/rooms/remembered-nick.ts`, `tests/unit/remembered-nick.test.ts`
- Martwe gniazdo w e2e: `tests/e2e/support/realtime.ts`, `tests/e2e/lobby-connection-drop.spec.ts`

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: Doganianie stanu po zerwaniu połączenia

#### Automated

- [x] 1.1 Bramka lokalna przechodzi: `npm run lint`, `npx astro check`, `npm test`, `npm run build` — ff6c2ad
- [x] 1.2 `npx playwright test --list` pokazuje `rejoin.spec.ts` — ff6c2ad
- [x] 1.3 Draft PR do `main`: CI zielone we wszystkich jobach, w `e2e` oba scenariusze `rejoin.spec.ts` przechodzą — ff6c2ad
- [x] 1.4 Próbny alarm: tymczasowy commit z `ROOM_POLL_MS = 15000` zapala tylko scenariusz (b); po `git revert` CI zielone — ff6c2ad

#### Manual

- [x] 1.5 Na serwerze dev w Chrome na laptopie (serwer dev słucha tylko na `localhost`, telefon go nie widzi): DevTools → Network → Offline na kilka sekund w trakcie rundy, po powrocie do Online stan dogania się od razu; pokój powstaje w produkcyjnej bazie jak przy smoke na dev, więc za zgodą — pominięte za zgodą Karola (03.11); nasłuchy `online` i `pageshow` sprawdza e2e „po powrocie sieci” z przeglądu (F2)

### Phase 2: Własny głos po przeładowaniu (D1)

#### Automated

- [x] 2.1 Bramka lokalna przechodzi: `npm run lint`, `npx astro check`, `npm test`, `npm run build` — 54734bd
- [x] 2.2 `tests/unit/my-vote.test.ts` przechodzi — 54734bd
- [x] 2.3 CI na PR zielone, w `db` testy anonimowości bez zmian, w `e2e` scenariusze głosu po przeładowaniu przechodzą — 54734bd
- [x] 2.4 Próbny alarm: tymczasowy commit bez kasowania w `RoomScreen` zapala tylko sprawdzenie pustej pamięci po odsłonie; po `git revert` CI zielone — 54734bd

#### Manual

- [x] 2.5 Karol akceptuje brzmienie wyjątku w AGENTS.md i PRD — 54734bd
- [x] 2.6 Na serwerze dev w Chrome na laptopie: głos, przeładowanie (F5), widać „Twój głos: X.” (telefon sprawdza 5.4 na produkcji) — 54734bd, pominięte za zgodą Karola (03.11); sprawdza e2e „odświeżenie w trakcie głosowania” i 5.4

### Phase 3: Powrót bez ciasteczka — baza (D2)

#### Automated

- [x] 3.1 Bramka lokalna przechodzi: `npm run lint`, `npx astro check`, `npm test`, `npm run build` — da4957b
- [x] 3.2 CI na PR zielone, w `db` `rejoin.test.ts` i nowe asercje pgTAP przechodzą, testy anonimowości bez zmian — da4957b
- [x] 3.3 Próbny alarm: tymczasowy commit, w którym `admit_latecomer` nie zapisuje śladu `moved`, zapala tylko przewidziane testy; po `git revert` CI zielone; tymczasowej migracji nie wgrywamy — da4957b

#### Manual

- [x] 3.4 Karol czyta streszczenie migracji (kto prosi, kto zatwierdza, co dzieje się ze starym urządzeniem, głosem i wynikami) i je akceptuje — da4957b

### Phase 4: Powrót bez ciasteczka — serwer i ekrany (D2)

#### Automated

- [x] 4.1 Bramka lokalna przechodzi: `npm run lint`, `npx astro check`, `npm test`, `npm run build` — 0bf8f70
- [x] 4.2 CI na PR zielone, w `e2e` scenariusze powrotu bez ciasteczka przechodzą, w `smoke` krok powrotu PASS — 0bf8f70
- [x] 4.3 Próbny alarm e2e: trasa powrotu bez dzwonka zapala tylko przewidziane scenariusze; po `git revert` CI zielone — 0bf8f70

#### Manual

- [x] 4.4 Karol wybiera warianty na zrzutach — 0bf8f70, wybór: C (gość „To ty?”), E (osobna sekcja u prowadzących), T1 (stare urządzenie)
- [x] 4.5 Karol ocenia zrzuty gotowych stanów (odmowa nicku z przyciskiem powrotu, oczekiwanie, prośba u hosta i współhosta w poczekalni i w grze, stare urządzenie) na laptopie i telefonie — 0bf8f70

### Phase 5: Wdrożenie

#### Automated

- [x] 5.1 `npx supabase migration list` pokazuje nową migrację lokalnie i zdalnie
- [x] 5.2 Smoke na produkcji zielony — 2026-11-03, 109/109 PASS na `4de89bf` (wersja Workera `a3faa121`), w tym powrót bez ciasteczka, ślad `moved` na starej przeglądarce i odmowa nicku hosta

#### Manual

- [x] 5.3 Karol scala PR — PR #39, `4de89bf`
- [ ] 5.4 Karol z ekipą: ktoś odświeża w trakcie rundy i widzi swój głos; ktoś otwiera link w innej przeglądarce, prosi o powrót, prowadzący wpuszcza
