# Usunięcie gracza i nowy link (S-09) Implementation Plan

## Overview

Prowadzący (host albo współhost) usuwa gracza z pokoju w poczekalni i w trakcie gry, a pokój w tej samej chwili dostaje nowy link dla graczy. Stary przestaje działać, pozostali gracze grają dalej. Host i współhost widzą link dla graczy w poczekalni i w grze, żeby wkleić nowy na Discorda (roadmapa S-09, PRD FR-004; decyzje Karola 1–8 w `research.md`, „Decyzje do planu”).

## Current State Analysis

- Gracz po wejściu jest rozpoznawany po `rooms.id` i tokenie z ciasteczka `mlt_player_<roomId>` (host po sesji), nie po kodzie linku (`src/pages/r/[id].astro:28-29`, `src/lib/rooms/server.ts:226-244`). Link jest osobny od pokoju od S-01 z myślą o S-09 (`supabase/migrations/20261007122858_room_lobby.sql:22`), więc wymiana kodu nikogo nie wyrzuca.
- Kod linku pisze tylko `create_room` (`20261031090821_player_color_choice.sql:138-142`); żadna funkcja go nie zmienia, `authenticated` nie ma `update` na `rooms`.
- Usunięcia gracza nie ma. Skasowanie wiersza `players` kaskadą zabiera token (`player_secrets`, `room_lobby.sql:49-52`) i jego wyniki (`round_results`, `first_live_round.sql:130-135`), ale zostawia id w `rounds.eligible`, wiersz w `round_voters`, klucz w `ballot_boxes.tally` i kciuk w `round_reactions` (tabele urny celowo bez kluczy obcych, `first_live_round.sql:141-153`).
- Odsłona automatyczna rusza, gdy `count(round_voters) >= cardinality(eligible)` (`20261020205751_round_number_required.sql:214-220`); usunięty, który nie głosował, blokowałby ją do ręcznej „Odsłoń wynik”. `finish_round` bierze tylko `players` złączonych z `eligible` (`20261026074427_question_play_data.sql:184-188`), więc głosy na kogoś, kogo nie ma w `players`, odpadają same.
- Link widzi dziś tylko host i tylko w poczekalni: Worker czyta kod przez RLS (`hostLinkToken`, `server.ts:604-618`), a `linkUrl` to prop ustalony przy ładowaniu strony (`src/pages/r/[id].astro:42-48`, `RoomScreen.tsx:69`, `:291`), nie część stanu pokoju. `room_lobby` celowo nie zwraca kodu (komentarz „no … link code”, `player_color_choice.sql:392-394`).

## Desired End State

- Host widzi „Usuń” przy każdym gościu, współhost przy gościach bez roli; nikt przy hoście ani przy sobie. „Usuń” → „Na pewno usunąć <nick>?” z „Anuluj”.
- Po usunięciu: usunięty na otwartej karcie widzi „Nie jesteś w tym pokoju.”, pozostali grają dalej bez przeładowania, stary link pokazuje „Ten link nie działa…”, a nowy link widać u hosta i współhosta (w poczekalni i w grze) bez przeładowania ich kart.
- Usunięty w trakcie głosowania: głos, który już oddał, zostaje w wyniku; głosy na niego przepadają; jeśli nie głosował, runda odsłania się sama, gdy zagłosuje reszta.
- Usunięty znika z listy „Gracze”, z wyników poprzednich rund i z podsumowania wieczoru; kolory pozostałych bez zmian. Wraca tylko nowym linkiem (w poczekalni sam, w grze przez prośbę i „Wpuść”).
- Weryfikacja: testy bazy `remove-player.test.ts`, pgTAP, smoke, e2e `remove-player.spec.ts`, smoke na produkcji i gra z ekipą.

### Key Discoveries:

- Wzór ruchu prowadzącego: `reject_latecomer` (`co_host_role.sql:548-583`, właściciel `:909`, granty `:922`, `:934`) i trasa `src/pages/api/rooms/[id]/reject.ts`; gościa po nicku z pominięciem hosta szuka `set_cohost` (`co_host_role.sql:595`): `p.user_id is null and p.nick_key = private.nick_key(p_nick)`.
- `private.leader_refusal` (`co_host_role.sql:59`) daje 22023 dla tokenu w złym formacie, `room_unknown` i `not_leader`; host to `auth.uid() = rooms.host_id`.
- Klucz tylko dla prowadzących w stanie pokoju: `leader_draw` (`player_color_choice.sql:476`, `:510-511`), parser wymaga obecności klucza, więc stara baza jest odrzucana (`src/lib/rooms/shared.ts:376-401`). Stary parser buduje obiekt z wymienionych pól, więc nowy klucz od nowej bazy po prostu pomija.
- `cast_vote` blokuje wiersz pokoju `for update`, tak jak każdy ruch prowadzącego, więc usunięcie i ostatni głos nie ścigają się o próg odsłony.
- Usunięty, który wraca w trakcie gry z tym samym ciasteczkiem, wysyła swój martwy token jako token prośby (`src/pages/api/rooms/join.ts:46-57`); jego hash zniknął z `player_secrets` kaskadą, więc `request_join` przyjmie go jak nowy.
- Wzór fokusu po usunięciu wiersza: następny wiersz albo przycisk pod listą, z komunikatem dla czytnika (`QuestionList.tsx:452-458`); potwierdzenie z „Anuluj” i powrotem fokusu: `HostActions.tsx:117-130`.
- Dokładne zestawy kluczy stanu pokoju: `tests/db/support/rounds.ts:151-157` i `tests/db/round-anonymity.test.ts:156-160`; dane testowe stanu w `tests/unit/room-state.test.ts`.

## What We're NOT Doing

- Host, który wyszedł, dalej blokuje samą odsłonę, a „Nowa gra” hosta dalej zamyka wieczór współhosta (decyzja 8).
- Bez miękkiego usuwania i bez banów (PRD Non-Goals); usunięty może wrócić nowym linkiem.
- Bez rozróżniania „stary link” od „literówka” na stronie `/j/` (wymagałoby pamiętania starych kodów); jeden prawdziwy tekst dla obu.
- Bez listy „Gracze” na odsłonie: w grze lista jest w głosowaniu dopiero po własnym głosie (`RoundVoting.tsx:299-326`), więc prowadzący usuwa w poczekalni albo w głosowaniu po swoim głosie.
- Bez ogłoszenia usunięcia pozostałym graczom (gracz po prostu znika z listy).
- Bez zmian w `room_link`, `join_room`, `request_join`, `cast_vote`, `finish_round` i keep-awake (ping `room_link` dalej dostaje `unknown`, `scripts/keep-supabase-awake.mjs:74`).
- Odrzucony spóźniony, który trzyma stary link (`JoinWaiting.tsx:120`), zobaczy „Ten link nie działa…”; akceptowane.

## Implementation Approach

Jedna migracja z nową funkcją `remove_player` (wszystkie odmowy przed pierwszym zapisem, potem w jednej transakcji: runda, kciuk, gracz, nowy kod linku) i `room_lobby` z kodem linku tylko dla prowadzących. Worker zamienia kod na `RoomView.linkUrl`, więc link jest częścią stanu pokoju i po wymianie dociera do każdego prowadzącego dzwonkiem, jak każdy inny ruch. Ekrany dostają „Usuń” w wierszu listy „Gracze” i link dla prowadzących także w grze; wygląd wybiera Karol na zrzutach. Wdrożenie: baza przed kodem, bo nowy parser wymaga `link_token`.

## Critical Implementation Details

- **Kopiuj najnowszą `room_lobby`.** Dziś `player_color_choice.sql:413`; sprawdź jeszcze raz `grep -ln "function public.room_lobby(" supabase/migrations/*.sql`. Sygnatura bez zmian, więc `create or replace` podmienia jedyną wersję. Zmień tylko klucz `link_token` i komentarz; starsza kopia cofnęłaby po cichu kolory S-18, współhosta albo sumy S-15.
- **Kto głosował, ten zostaje w `eligible`.** Zdjęcie z `eligible` głosującego przy pozostawionym jego `round_voters` odsłoniłoby rundę o jeden głos za wcześnie. Funkcja patrzy tylko, czy id usuniętego jest w `round_voters` (publiczna lista „kto już zagłosował”), nigdy na `tally`; klucza w `tally` nie rusza.
- **Kolejność wdrożenia:** `db push` przed scaleniem kodu. Stary Worker pomija nowy klucz i nie zna `remove_player`; nowy parser odrzuca stan bez `link_token`.
- **Po „Usuń”: czekaj na odświeżony stan, fokus według widoku.** Po sukcesie wiersz zostaje wyłączony aż do pierwszego odświeżenia po odpowiedzi (`refreshes`, jak `CohostButton.tsx:75` i `RequestRow` w `JoinRequests.tsx:65`), więc „Usuń” nie wraca na chwilę i drugi klik nie daje `player_unknown` (ten sam błąd w przeglądach S-07 F1 i S-18 F1). Gdy odświeżony widok to ten sam ekran (poczekalnia albo dalej głosowanie), fokus przechodzi na „Usuń” następnego wiersza (albo, gdy go nie ma, na nagłówek listy „Gracze”). Gdy usunięcie odsłoniło rundę, ekran głosowania znika razem z przyciskiem (zmienia się `announcementKey`, `RoomScreen.tsx:173`), a `remove` nie jest w `VIEW_CHANGING` (`RoomScreen.tsx:122`): fokus idzie wtedy na nagłówek nowego widoku tak jak po ruchach z `VIEW_CHANGING` (`movedFrom`), ale `movedFrom` nie może zostać ustawiony po usunięciu, które widoku nie zmieniło (inaczej późniejszy cudzy ruch przeniósłby fokus). Region `aria-live` mówi, że gracz usunięty i link się zmienił. „Anuluj” zwraca fokus na „Usuń” tego wiersza.

## Faza 1: Baza

### Overview

Funkcja usunięcia gracza z wymianą linku, kod linku w stanie pokoju dla prowadzących, testy bazy, pgTAP, dokumenty z nazwami i próbny alarm na draft PR.

### Changes Required:

#### 1. Migracja

**File**: `supabase/migrations/<timestamp>_remove_player.sql` (przez `npx supabase migration new remove_player`)

**Intent**: Prowadzący usuwa gościa w jednej transakcji: runda przestaje na niego czekać, nic po nim nie zostaje, pokój dostaje nowy kod linku. Stan pokoju niesie kod linku tylko prowadzącym.

**Contract**:

- `public.remove_player(p_room_id uuid, p_nick text, p_player_token text default null) returns jsonb`, `security definer`, `set search_path = ''`, właściciel `postgres`, `revoke execute … from public, anon, authenticated`, potem `grant execute … to anon, authenticated` (publiczny punkt wejścia, wszystkie kontrole w środku). Po kolei, wszystkie odmowy przed pierwszym zapisem:
  - blokada wiersza pokoju `for update` (wzór `reject_latecomer`);
  - `private.leader_refusal(p_room_id, v_host, p_player_token)`: zły format tokenu 22023, `room_unknown` (brak pokoju, obcy, usunięty, czekający spóźniony), `not_leader` (gość bez roli);
  - pokój `closed`: `room_closed`;
  - gość tego pokoju po `nick_key` z `user_id is null` (nick dłuższy niż 100 znaków traktowany jak nieznany, jak w `reject_latecomer`); brak, nick hosta albo drugi raz ten sam: `player_unknown`;
  - wołający nie jest hostem (`auth.uid()` różne od `rooms.host_id`, czyli współhost), a cel ma `cohost` (inny współhost albo on sam): nowy kod `cohost_protected`;
  - zapisy: (a) runda pokoju w fazie `voting`, w której id usuniętego jest w `eligible`, a nie ma go w `round_voters`: `eligible = array_remove(eligible, id)`, potem próg jak w `cast_vote` (`count(round_voters) >= cardinality(eligible)` → `private.finish_round`); głosował albo nie ma go w `eligible`: runda bez zmian. `eligible` nie spadnie do zera, bo host jest w każdej migawce, a hosta usunąć nie można; (b) `delete` jego wierszy z `private.round_reactions`; (c) `delete from public.players` (kaskada: `player_secrets`, `round_results`); (d) nowy `rooms.link_token` z `translate(encode(extensions.gen_random_bytes(16), 'base64'), '+/=', '-_')` jak w `create_room` (128 bitów: bez obsługi kolizji, błąd cofa całą transakcję);
  - odpowiedź dokładnie `{ok: true}`, nic o głosach ani o nowym kodzie.
- `public.room_lobby` (`create or replace`, sygnatura bez zmian): nowy klucz `link_token`, kod linku dla prowadzącego (`v_leader`) w każdym statusie, `null` dla każdego innego. Komentarz funkcji: „no … link code” zmienione na kod tylko dla prowadzącego, dla Workera, który robi z niego link; granty powtórzone jak w poprzednich migracjach.
- Nagłówek migracji: reguła głosów (decyzja 1), kogo wolno usunąć (decyzja 2), że funkcja nie czyta `tally`, i kolejność wdrożenia (baza, potem kod).

#### 2. Testy bazy

**File**: `tests/db/remove-player.test.ts` (nowy), `tests/db/support/rounds.ts`, `tests/db/round-anonymity.test.ts`

**Intent**: Dowieść decyzji 1, 2, 4 i 6 oraz tego, że wymiana linku nie wyrzuca pozostałych. Przed pisaniem przeczytaj `context/foundation/test-plan.md` §6.

**Contract**:

- `remove-player.test.ts`, jeden host na plik (wzór `cohost.test.ts`):
  - kontrola pozytywna: host usuwa gościa w poczekalni, dokładnie `{ok: true}`;
  - po usunięciu w poczekalni: token usuniętego → `room_lobby` `null`; stary kod → `room_link` `unknown`; nowy kod (z `link_token` w stanie hosta) → `open`; drugi gość dalej widzi pokój i ma ten sam kolor; ten sam nick wchodzi nowym kodem przez `join_room`;
  - reguła 1 w trzech wariantach w trakcie gry: (i) usunięty nie głosował, pozostali już tak → runda odsłonięta przez samo usunięcie, urna pusta; (ii) głosował → runda dalej w głosowaniu, a po głosach reszty jego głos jest w wyniku; (iii) ktoś głosował na usuniętego → przy odsłonie usuniętego nie ma w wyniku, pozostałe liczby bez zmian;
  - powrót w trakcie gry: usunięty prosi o wejście nowym kodem tym samym tokenem (`request_join`), prowadzący go wpuszcza, a jego token znów otwiera pokój;
  - współhost usuwa gościa bez roli: `ok`; host usuwa współhosta: `ok`;
  - kod linku w stanie pokoju: string 22 znaków u hosta i u współhosta, równy kodowi, który działa w `room_link`; `null` u gościa bez roli;
  - odmowy z argumentami, które przepuszczone coś by zmieniły (gracz dalej w pokoju, kod linku bez zmian): `cohost_protected` (współhost → inny współhost, współhost → on sam), `not_leader` (gość bez roli → inny gość), `player_unknown` (nick hosta, nieznany nick, drugie usunięcie), `room_closed` (pokój zamknięty przez `end_game`), `room_unknown` (`anon` bez tokenu, token z innego pokoju), token w złym formacie 22023.
- `support/rounds.ts` i `round-anonymity.test.ts`: `link_token` w dokładnym zestawie kluczy stanu pokoju, z tytułem i komentarzem testu. `LOBBY_KEYS` z `support/rounds.ts` sprawdzają też `cohost.test.ts:288`, `game-summary.test.ts:215`, `:317`, `reactions.test.ts:181` i `round-anonymity.test.ts:291`, `:330`; klucz jest zawsze (`null` u nie-prowadzącego), więc wystarczy jedna stała. Tytuł z listą kluczy także w `cohost.test.ts:285`.

#### 3. Widok twórcy (pgTAP)

**File**: `supabase/tests/round_creator_view.test.sql`

**Intent**: Przypiąć to, czego klucz publishable nie widzi: wersje, właściciela, `search_path` i granty nowej funkcji oraz pustą urnę po odsłonie przez usunięcie.

**Contract**: `remove_player` w jednej wersji, `security definer`, `search_path=''`, właściciel `postgres`, `execute` dla `anon` i `authenticated` (wzór sekcji współhosta, `function_facts`, `versions_of`). `room_lobby` nadal w jednej wersji z tymi samymi grantami. Po odsłonie wywołanej usunięciem `round_voters` i `ballot_boxes` tej rundy puste (N2, `context/domain/02-invariant-aggregate-refactor.md:131`). `plan(N)` zaktualizowany (dziś 291).

#### 4. Dokumenty z nazwami

**File**: `context/foundation/prd.md`, `context/domain/glossary.md`, `context/foundation/test-plan.md`, `context/foundation/roadmap.md`

**Intent**: Decyzje Karola i nazwy z kodu zapisane przed Workerem i ekranami.

**Contract**:

- PRD: dopisek S-07 (`prd.md:170`) uzupełniony o S-09: link dla graczy widzą host i współhost, w poczekalni i w trakcie gry (decyzja 5); wiersz „link dla graczy w poczekalni” (`:181`) → „link dla graczy w poczekalni i w trakcie gry” z ✓ u współhosta; Open Question 3 (`:211`) rozstrzygnięte decyzją 1.
- Słownik: współhost (`glossary.md:41`) widzi link dla graczy; „link do pokoju” (`:46`) wymieniany przy usunięciu gracza, w stanie pokoju tylko dla prowadzących (`link_token`, `RoomView.linkUrl`); „usunięcie gracza” (`:52`) z nazwami `remove_player`, `POST /api/rooms/<id>/remove`, `cohost_protected`.
- `test-plan.md` §6.2: `remove-player.test.ts` na liście plików i liczba rejestracji na przebieg (+1); §6.3: `link_token` w dokładnym zestawie kluczy; po próbnym alarmie wpis w „Break-check”.
- Roadmapa S-09: Unknown (Open Roadmap Question 3) rozstrzygnięte decyzją 1.

### Success Criteria:

#### Automated Verification:

- Bramka lokalna przechodzi: `npm run lint`, `npx astro check`, `npm test`, `npm run build`
- `npx prettier --check` dla nowych i zmienionych plików `.md` przechodzi
- Draft PR do `main` (push za zgodą Karola): CI zielone we wszystkich jobach, w `db` nowe testy `remove-player.test.ts` i nowe asercje pgTAP przechodzą
- Próbny alarm: tymczasowy commit zapala tylko przewidziane testy; po `git revert` CI zielone

#### Manual Verification:

- Karol czyta streszczenie migracji (kto kogo usuwa, co dzieje się z rundą, głosami i linkiem, link w stanie pokoju) i je akceptuje

**Implementation Note**: Próbny alarm według `test-plan.md` §6.2 „Break-check”: jeden tymczasowy commit z dwoma uszkodzeniami, bo każde zapala inne testy: (a) usunięty, który nie głosował, zostaje w `eligible`; (b) `remove_player` nie wymienia `link_token`. Przewidywania przed pushem, a opis commita wymienia z nazwy każdy test, który ma zaświecić. Tymczasowej migracji nigdy nie wgrywamy; na końcu `git diff main...HEAD -- supabase/migrations` pokazuje tylko migrację zmiany. Po fazie pauza na akceptację Karola.

---

## Faza 2: Serwer gry

### Overview

Link w stanie pokoju (`RoomView.linkUrl`) zamiast propa z ładowania strony, trasa `remove`, nowa odmowa, testy jednostkowe i kroki smoke. Ekrany działają jak dziś (link u hosta w poczekalni).

### Changes Required:

#### 1. Typy, parser i widok

**File**: `src/lib/rooms/shared.ts`, `src/lib/rooms/server.ts`, `src/pages/api/rooms/[id]/lobby.ts`, `src/pages/r/[id].astro`

**Intent**: Kod linku z bazy staje się linkiem w widoku pokoju prowadzącego, więc każde odświeżenie stanu niesie aktualny link.

**Contract**:

- `LobbyState.link_token: string | null`; `parseLobbyState` wymaga klucza (brak = stara baza, odmowa) i przyjmuje tylko kod 22 znaków `^[A-Za-z0-9_-]{22}$` albo `null`.
- `RoomView` bez `link_token`, z `linkUrl: string | null`: `link_token` dopisany do `Omit` w `RoomView` (`shared.ts:170`) i w typie `parseRoomState` (`shared.ts:352-354`). `roomView(lobby, roomId, questionsLeft, origin)` wyjmuje `link_token` z `...state` tak jak `leader_draw` (`server.ts:280`; inaczej surowy kod pojedzie do przeglądarki obok `linkUrl`, a złapie to tylko `VIEW_KEYS`) i buduje `${origin}/j/${link_token}` dla prowadzącego (ten sam `leader`, który już liczy), `null` dla innych. Wołający: `/r/[id].astro` (`Astro.url.origin`) i `GET …/lobby` (`context.url.origin`).
- `hostLinkToken` i jego użycie w `/r/[id].astro` znikają; strona przekazuje do `RoomScreen` tylko widok.

#### 2. Trasa i funkcja bazy

**File**: `src/lib/rooms/server.ts`, `src/pages/api/rooms/[id]/remove.ts` (nowy), `src/components/room/room-actions.ts`

**Intent**: „Usuń” z ekranu prowadzącego, z dzwonkiem do całego pokoju, żeby usunięty zobaczył ekran „Nie jesteś w tym pokoju.”, a inni prowadzący nowy link.

**Contract**:

- `removePlayer(supabase, roomId, nick, playerToken)` na wzór `rejectLatecomer`, RPC `remove_player` z `p_room_id`, `p_nick`, `p_player_token`.
- `POST /api/rooms/[id]/remove` na wzór `reject.ts`: body `{nick}` (`bodyNick`, nigdy w logu), sesja albo ciasteczko pokoju, `ringLobby` po sukcesie, `actionAnswer` (`room_unknown` 404, `invalid_body` 400, pozostałe odmowy 409).
- `RoomAction` dostaje `"remove"`, komentarz modułu opisuje jego body; traktowany jak `cohost` (ruch na liście graczy, nie zmiana widoku).

#### 3. Odmowa

**File**: `src/lib/rooms/errors.ts`, `tests/unit/room-errors.test.ts`

**Intent**: Współhost, który próbuje usunąć współhosta, dostaje zrozumiały tekst.

**Contract**: `cohost_protected` w `ROUND_REFUSALS` i `MESSAGES` („Współhosta może usunąć tylko host.”) oraz ręcznie w `PLANNED_ROUND_REFUSALS` z odnośnikiem do tego planu.

#### 4. Ekran bez zmiany wyglądu

**File**: `src/components/room/RoomScreen.tsx`, `src/components/room/RoomLobby.tsx`, `src/pages/dev/room-states.astro`, `src/pages/dev/room-window.astro`

**Intent**: Prop `linkUrl` znika z `RoomScreen`; `RoomLobby` dostaje `view.linkUrl`, więc host dalej widzi link w poczekalni, teraz odświeżany dzwonkiem.

**Contract**: `RoomScreen` bez propa `linkUrl` (`:69`, `:130`, `:291`); podglądy (`room-states.astro`, stała `LINK_URL` i jej użycia; `room-window.astro` `:25`, `:211`, `:508`) wkładają link do budowanych widoków zamiast propa. Widoczność linku u współhosta i w grze dopiero w fazie 3.

#### 5. Testy jednostkowe i smoke

**File**: `tests/unit/room-state.test.ts`, `tests/unit/announce.test.ts`, `tests/unit/remembered-nick.test.ts`, `tests/unit/room-rpc-gate.test.ts`, `scripts/smoke.mjs`, `context/foundation/test-plan.md`

**Intent**: Przypiąć parser, link w widoku i nazwy RPC; dowieść przez HTTP, że usunięcie działa end-to-end bez przeglądarki.

**Contract**:

- `room-state.test.ts`: dane testowe z `link_token`; brak klucza i zły format → odmowa parsera; `linkUrl` u hosta i u współhosta z originem, `null` u gościa; `linkUrl` w `VIEW_KEYS`, bez `link_token`.
- Literały `RoomView` w testach (tsconfig obejmuje `tests/`): `announce.test.ts` (5 budowniczych widoku, `:20-120`) i `remembered-nick.test.ts:354-367` (`colorView`) dostają `linkUrl`.
- `room-rpc-gate.test.ts`: wiersz `SQL_SIGNATURES` `remove_player` (z odnośnikiem do nowej migracji), odnośnik `room_lobby` przeniesiony na nową migrację, przypadki „Usuń gracza (host, bez tokenu gościa)” i „Usuń gracza (współhost, token gościa)”.
- Smoke: nowa grupa kroków po `listSteps()`, w pokoju z „Nowa gra” (stary link nie jest już potem potrzebny): drugi gość wchodzi linkiem; link w stanie pokoju hosta (`GET …/lobby`, `linkUrl`) i `null` u gościa; host usuwa drugiego gościa: 200; stan pokoju usuniętego (jego własny słoik ciasteczek): 404; stan Eli: 200; stary `/j/<kod>`: 404; nowy `/j/<kod>` z odświeżonego stanu hosta: 200; drugie usunięcie: 409 `player_unknown`. Grupa stoi na pokoju z listą i Eli, więc przy `SMOKE_LIST=0` jest pomijana razem z `listSteps()` (`smoke.mjs:555`). `test-plan.md` §6.5: opis kroków i nowa suma.

### Success Criteria:

#### Automated Verification:

- Bramka lokalna przechodzi: `npm run lint`, `npx astro check`, `npm test`, `npm run build`
- CI na PR zielone we wszystkich jobach, w tym nowe kroki smoke usunięcia

#### Manual Verification:

- Nowa trasa `remove` przeklikana raz na serwerze dev przez API po `db push` z fazy 4, bo serwer dev łączy się z produkcyjną bazą (lessons.md, wpis 3)

**Implementation Note**: Po fazie pauza na akceptację Karola.

---

## Faza 3: Ekrany

### Overview

Najpierw warianty do wyboru Karola, potem „Usuń” z potwierdzeniem w wierszu listy „Gracze”, link dla prowadzących w poczekalni i w grze, prawdziwy tekst starego linku, podglądy i E2E.

### Changes Required:

#### 1. Warianty do wyboru

**File**: `/dev/room-states` (tymczasowe stany wariantów), strona HTML z „Co oceniasz” w scratchpadzie

**Intent**: Wygląd to decyzja Karola (decyzje 3, 5, 7; pamięć „Wygląd ekranu = decyzja Karola”).

**Contract**:

- 2–3 warianty: (a) „Usuń” i potwierdzenie w wierszu gracza obok przełącznika współhosta u hosta oraz w wierszu u współhosta, w poczekalni i w głosowaniu; (b) link dla graczy w grze u prowadzącego (miejsce obok próśb o wejście, `RoomScreen.tsx:376-379`; rozwinięty albo zwinięty) i krótka informacja po wymianie, że link się zmienił; (c) teksty: ekran starego linku („Ten link nie działa.” / „Sprawdź, czy skopiował się cały, albo poproś hosta o nowy.”) i komunikat po usunięciu;
- zrzuty: laptop jako całe okno gry 1:1, telefon w prawdziwej wielkości, headless Chrome przez Playwright z `channel: "chrome"`, ukryty `astro-dev-toolbar`; strona otwarta w Chrome Karola, a wybór zapisany w Progress (3.5);
- komponenty tylko z `src/components/ui`; brakujący przez `npx shadcn@latest add <name>` (nowa paczka npm tylko za zgodą Karola). Kolory tylko z tokenów.

#### 2. „Usuń” w wierszu gracza

**File**: nowy komponent w `src/components/room/` (np. `RemovePlayerButton.tsx`), `src/components/room/{RoomLobby,RoundVoting,RoomScreen}.tsx`, `scripts/ui-literals.mjs`

**Intent**: Prowadzący usuwa gracza dwoma dotknięciami, bez ryzyka pomyłki i bez gubienia fokusu.

**Contract**:

- przycisk w wierszu listy „Gracze” w poczekalni (`RoomLobby.tsx:282-290`) i w głosowaniu (`RoundVoting.tsx:264-272`), za bramką `leader` zamiast `isHost`: host przy każdym gościu, współhost przy gościach bez roli, nigdy przy hoście ani przy sobie; układ wiersza prowadzącego z wybranego wariantu (dziś `COHOST_ROW` tylko u hosta);
- „Usuń” → „Na pewno usunąć <nick>?” z przyciskiem potwierdzenia i „Anuluj” w tym samym wierszu (zachowanie jak `HostActions.tsx:117-130`, nie sam komponent); akcja `remove` z `{nick}`; odmowa tekstem z `roomErrorMessage` przy wierszu;
- fokus i komunikat jak w „Critical Implementation Details”;
- nowe pliki widoków dopisane do `VIEWS` w `scripts/ui-literals.mjs`.

#### 3. Link dla prowadzących

**File**: `src/components/room/{RoomLobby,RoomScreen}.tsx` (pole linku wydzielone do komponentu, jeśli wariant tego wymaga), `src/pages/j/[token].astro`

**Intent**: Host i współhost widzą aktualny link w poczekalni i w grze (decyzja 5); ktoś ze starym linkiem dostaje prawdziwy tekst (decyzja 7).

**Contract**:

- pole „Link dla graczy” z „Kopiuj” w poczekalni dla `leader` (dziś `isHost`, `RoomLobby.tsx:165-192`) i w grze w miejscu z wybranego wariantu, z `view.linkUrl`; zmiana linku po dzwonku widoczna bez przeładowania i ogłoszona zgodnie z wariantem;
- `/j/[token].astro:92`: tekst nieznanego linku z wybranego wariantu (ten sam dla starego linku i literówki). To samo zdanie ma odmowa `room_unknown` w `src/lib/rooms/errors.ts:51` (formularz wysłany ze starym linkiem, `join.ts:34`) i podgląd `room-states.astro:580`: zmieniane razem.

#### 4. Podglądy

**File**: `src/pages/dev/room-states.astro`, `src/pages/dev/room-window.astro`

**Intent**: Każdy nowy stan ma podgląd (AGENTS.md, UI).

**Contract**: `room-states`: lista „Gracze” u hosta i u współhosta z „Usuń”, otwarte potwierdzenie, odmowa `cohost_protected`, poczekalnia współhosta z linkiem. `room-window`: link prowadzącego w trakcie gry (zmienia okno nad widokiem rundy).

#### 5. E2E

**File**: `tests/e2e/remove-player.spec.ts` (nowy), `tests/e2e/cohost.spec.ts`, `tests/e2e/support/room.ts`

**Intent**: Dowieść w przeglądarce, że usunięcie dociera do wszystkich bez przeładowania, a nowy link do drugiego prowadzącego.

**Contract**:

- „usunięcie w głosowaniu odsłania rundę”: host, Ola i Kuba; host i Ola głosują, host usuwa Kubę; u Oli odsłona bez przeładowania, u Kuby „Nie jesteś w tym pokoju.”, a fokus hosta na nagłówku odsłony. Dowód dzwonka według „Bell vs poll” (`test-plan.md` §6.4): `nextListFetch` przed `goto`/`reload`, zmiana w czasie krótszym niż `LOBBY_POLL_MS` od załadowania;
- „współhost usuwa gracza, host widzi nowy link”: Ola współhostem usuwa gościa w poczekalni; pole linku u hosta pokazuje nowy kod bez przeładowania, a stary kod otwiera stronę „Ten link nie działa”;
- `cohost.spec.ts:88`: współhost teraz widzi „Link dla graczy”; `support/room.ts:47` i `LINK_IN_PAGE` w `scripts/smoke.mjs:201` (link z HTML `/r/<id>`): odczyt linku z pola, jeśli wariant zmieni jego etykietę albo miejsce.

### Success Criteria:

#### Automated Verification:

- Bramka lokalna przechodzi: `npm run lint`, `npx astro check`, `npm test`, `npm run build`
- `npx playwright test --list` pokazuje `remove-player.spec.ts`
- CI na PR zielone we wszystkich jobach, w `e2e` nowe scenariusze `remove-player.spec.ts` przechodzą
- Próbny alarm e2e: `remove.ts` bez dzwonka zapala tylko przewidziane scenariusze; po `git revert` CI zielone

#### Manual Verification:

- Karol wybiera warianty („Usuń” z potwierdzeniem, link w grze, teksty) na zrzutach
- Karol ocenia zrzuty gotowych stanów (lista u hosta i u współhosta, potwierdzenie, odmowa, link w poczekalni i w grze, strona starego linku) na laptopie i telefonie

**Implementation Note**: Najpierw warianty i wybór Karola (3.5), dopiero potem ekrany. Tymczasowe stany wariantów znikają z `/dev/room-states` po wyborze. Próbny alarm e2e według `test-plan.md` §6.4 „Break-check”: tymczasowy commit usuwa z `remove.ts` wywołanie `ringLobby` razem z importem (inaczej czerwony byłby też lint); przewidywanie: czerwone oba scenariusze `remove-player.spec.ts` (odsłona u Oli i nowy link u hosta czekają na dzwonek), smoke, baza i `ci` zielone. Po `git revert` CI zielone, wynik w §6.4. Po fazie pauza na akceptację Karola.

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
- Advisors → Security: nowe ostrzeżenie dla `remove_player` przyznanej `anon` jest zamierzone, jak dla `set_player_color`;
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
- Karol z ekipą: prowadzący usuwa kogoś w głosowaniu, runda odsłania się bez niego, nowy link z ekranu wklejony na Discorda wpuszcza usuniętego z powrotem, a stary pokazuje „Ten link nie działa”

**Implementation Note**: Przy 4.4 powiedzieć ekipie, że w trakcie gry „Usuń” jest na liście „Gracze”, która pojawia się po oddaniu własnego głosu.

---

## Testing Strategy

### Unit Tests:

- Parser stanu (`link_token`: brak, zły format, `null`), `roomView` (`linkUrl` u hosta, u współhosta, `null` u gościa), bramka RPC (`remove_player`, nowe odniesienie `room_lobby`), odmowa `cohost_protected`.

### Integration Tests:

- `tests/db/remove-player.test.ts`: usunięcie w poczekalni i w grze, reguła 1 w trzech wariantach, powrót nowym kodem w poczekalni i przez prośbę, kod linku w stanie pokoju, wszystkie odmowy (CI `db`).
- pgTAP: wersja, właściciel, `search_path`, granty, pusta urna po odsłonie przez usunięcie (CI `db`).
- E2E `remove-player.spec.ts` (CI `e2e`), smoke (CI i produkcja).

### Manual Testing Steps:

1. Zrzuty wariantów i gotowych stanów (faza 3).
2. Na produkcji: współhost usuwa gościa w poczekalni, host widzi nowy link bez przeładowania; stary link pokazuje „Ten link nie działa”.
3. W grze: prowadzący po swoim głosie usuwa kogoś, kto nie głosował; runda odsłania się po głosach reszty, usunięty widzi „Nie jesteś w tym pokoju.”.
4. Usunięty wraca nowym linkiem przez prośbę i „Wpuść”; podsumowanie wieczoru na końcu bez jego starych wyników.

## Performance Considerations

Usunięcie to jedna transakcja pod istniejącą blokadą pokoju, a `room_lobby` dokłada jedno pole z już czytanego wiersza `rooms`. Każde usunięcie to jeden dzwonek i odświeżenie stanu u wszystkich, jak przy innych ruchach.

## Migration Notes

- Migracja jest addytywna dla starego Workera: nowa funkcja nieużywana, nowy klucz `link_token` pomijany przez stary parser, sygnatura `room_lobby` bez zmian. `db push` przed scaleniem nie psuje produkcji.
- Wycofanie kodu: revert PR (stary Worker czyta link przez RLS jak dziś). Wycofanie bazy: nowa migracja (pushowanej nie edytujemy). Usuniętych graczy nie da się przywrócić; wracają nowym linkiem.

## References

- Research i decyzje Karola 1–8: `context/changes/remove-player-new-link/research.md` (sekcja „Decyzje do planu”)
- Roadmapa: `context/foundation/roadmap.md:219-230`; PRD `context/foundation/prd.md:93-94`, `:170`, `:181`, `:211`
- Wzorce: `reject_latecomer`, `set_cohost` i `private.leader_refusal` `supabase/migrations/20261027121442_co_host_role.sql:59`, `:548`, `:595`; `room_lobby` i generowanie kodu `20261031090821_player_color_choice.sql:138-142`, `:413`; próg odsłony `20261020205751_round_number_required.sql:214-220`; trasa `src/pages/api/rooms/[id]/reject.ts`
- Poprzednie zmiany z tym samym układem faz: `context/changes/player-color-choice/plan.md`, `context/changes/co-host-role/plan.md`
- Zasady testów: `context/foundation/test-plan.md` §6; wdrożenie: `context/deployment/deploy-plan.md`

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: Baza

#### Automated

- [x] 1.1 Bramka lokalna przechodzi: `npm run lint`, `npx astro check`, `npm test`, `npm run build` — fce3947
- [x] 1.2 `npx prettier --check` dla nowych i zmienionych plików `.md` przechodzi — fce3947
- [x] 1.3 Draft PR do `main` (push za zgodą Karola): CI zielone we wszystkich jobach, w `db` nowe testy `remove-player.test.ts` i nowe asercje pgTAP przechodzą — PR #36, fce3947
- [x] 1.4 Próbny alarm: tymczasowy commit zapala tylko przewidziane testy; po `git revert` CI zielone — 546b916, revert 391221d

#### Manual

- [x] 1.5 Karol czyta streszczenie migracji (kto kogo usuwa, co dzieje się z rundą, głosami i linkiem, link w stanie pokoju) i je akceptuje — 2026-11-01

### Phase 2: Serwer gry

#### Automated

- [ ] 2.1 Bramka lokalna przechodzi: `npm run lint`, `npx astro check`, `npm test`, `npm run build`
- [ ] 2.2 CI na PR zielone we wszystkich jobach, w tym nowe kroki smoke usunięcia

#### Manual

- [ ] 2.3 Nowa trasa `remove` przeklikana raz na serwerze dev przez API po `db push` z fazy 4, bo serwer dev łączy się z produkcyjną bazą (lessons.md, wpis 3)

### Phase 3: Ekrany

#### Automated

- [ ] 3.1 Bramka lokalna przechodzi: `npm run lint`, `npx astro check`, `npm test`, `npm run build`
- [ ] 3.2 `npx playwright test --list` pokazuje `remove-player.spec.ts`
- [ ] 3.3 CI na PR zielone we wszystkich jobach, w `e2e` nowe scenariusze `remove-player.spec.ts` przechodzą
- [ ] 3.4 Próbny alarm e2e: `remove.ts` bez dzwonka zapala tylko przewidziane scenariusze; po `git revert` CI zielone

#### Manual

- [ ] 3.5 Karol wybiera warianty („Usuń” z potwierdzeniem, link w grze, teksty) na zrzutach
- [ ] 3.6 Karol ocenia zrzuty gotowych stanów (lista u hosta i u współhosta, potwierdzenie, odmowa, link w poczekalni i w grze, strona starego linku) na laptopie i telefonie

### Phase 4: Wdrożenie

#### Automated

- [ ] 4.1 `npx supabase migration list` pokazuje nową migrację lokalnie i zdalnie
- [ ] 4.2 Smoke na produkcji zielony

#### Manual

- [ ] 4.3 Karol scala PR
- [ ] 4.4 Karol z ekipą: prowadzący usuwa kogoś w głosowaniu, runda odsłania się bez niego, nowy link z ekranu wklejony na Discorda wpuszcza usuniętego z powrotem, a stary pokazuje „Ten link nie działa”
