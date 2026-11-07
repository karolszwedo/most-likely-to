# Długość gry widoczna dla wszystkich Implementation Plan

> **Decyzje Karola (2026-11-07):** opcja B z `change.md` oraz: (1) wariant M2, licznik nad dzisiejszym losowaniem; (2) licznik mówi autorowi propozycji o decyzji chwilę wcześniej, przyjęte jako wyjątek od decyzji 5 S-10; (3) po zatwierdzeniu propozycji gracze bez roli widzą „z 16” do 8 s później, bo dzwonek tylko do prowadzących z PR #44 zostaje; (4) pominięte pytanie zużywa jedno z liczby pytań gry: 3 pominięcia w grze z 15 dają 12 odsłon, a licznik nie skacze. Wygląd ekranów Karol wybiera na zrzutach (Faza 3).

## Overview

Każda gra dostaje widoczną liczbę pytań: domyślnie 15, także bez otwarcia listy. Gracze widzą ją w poczekalni na żywo, a przy każdym pytaniu czytają „Pytanie 7 z 15”. Po ostatnim pytaniu gra się zatrzymuje, a prowadzący wybiera „Zakończ grę” albo „Jeszcze 5 pytań”. Dziś gra po liście po cichu losuje całą pulę, więc wieczór nie ma widocznego końca (do 216 pytań).

## Current State Analysis

Pełne ustalenia: `context/changes/game-length/research.md`. W skrócie:

- Gra nie ma długości. `private.open_next_round` bierze listę, a potem pierwszego niezagranego kandydata (`supabase/migrations/20261104095452_guest_question_proposals.sql:317-376`). Koniec przychodzi przy wyczerpaniu puli albo po „Zakończ grę”.
- Żaden gracz nie zna liczby pytań. Liczby listy idą tylko do prowadzących w `leader_draw`, a Worker nie wysyła ich na ekran (`src/lib/rooms/server.ts:306-322`).
- `questionsLeft` odpowiada dziś na pytanie „czy zostało coś w puli” (`src/lib/rounds/draw.ts:95-101`), a przyciski po rundzie wybiera `afterRoundActions` (`src/components/room/HostActions.tsx:57-66`).
- Ruchy na liście w poczekalni świadomie nie dzwonią (`src/pages/api/rooms/[id]/question-remove.ts:12`, `question-draw.ts:15`, `question-add.ts:12`).

## Desired End State

- W poczekalni każdy gracz widzi liczbę pytań, a gdy host usunie, dolosuje albo doda pytanie, liczba zmienia się u wszystkich w 2 s.
- Przy każdym pytaniu, także po odsłonie i po pominięciu, każdy gracz widzi „Pytanie N z T”.
- Zatwierdzona propozycja dodaje jedno pytanie („z 16”).
- Po rundzie T baza nie otworzy następnej. Prowadzący widzi „Jeszcze 5 pytań” i „Zakończ grę”, a po dobraniu od razu trwa „Pytanie 16 z 20”.
- Gdy zostało mniej niż 5 pytań, przycisk mówi prawdę („Jeszcze 3 pytania”). Gdy nie zostało nic, jest „Zakończ grę” i zdanie „Pytań już nie ma. Możesz zakończyć grę.”.

Sprawdzenie: testy bazy z wyrocznią z decyzji Karola, `tests/e2e/game-length.spec.ts` w dwóch oknach, smoke na produkcji i przeklikanie Karola na telefonie i laptopie.

### Key Discoveries:

- `next_round` i `skip_round` wołają jedną funkcję, która już umie odpowiedzieć `false` (`supabase/migrations/20261027121442_co_host_role.sql:257`, `:350`), więc strażnik wystarczy w jednym miejscu. Pominięcie ostatniego pytania daje dzisiejszy ekran `RoundSkipped`.
- `round.number` rośnie też przy pominięciach (`src/lib/rounds/draw.ts:82`), czyli licznik z decyzji 4 działa bez osobnego liczenia.
- Lista zmienia się tylko w poczekalni (`game_started`, `supabase/migrations/20261024094002_question_list_review.sql:132`), a zatwierdzić można tylko w grze, więc wiersz `proposed` nigdy nie jest usunięty.
- Dzisiejszy wzór `poolSize - list_base_count + list_entries - N` daje dokładnie tyle, ile kandydatów policzy baza przy dobieraniu (sprawdzone dla gry bez listy, z listą, z usunięciami, z poprawionym pytaniem i z propozycjami), więc przycisk nie obieca liczby innej niż dobierze baza.
- Parser odrzuca dodatkowy klucz pominiętej rundy (`src/lib/rooms/shared.ts:281-289`), a na najwyższym poziomie pomija klucze spoza umowy, stąd `question_count` na najwyższym poziomie.
- `RoomView` rozszerza stan, więc `question_count` przechodzi przez `roomView` spreadem, jak `proposals`. Klucz musi tylko trafić do `parseRoomState`.
- `useRoomState` porównuje stan jako JSON (`src/components/room/useRoomState.ts:166`, `:249`), więc nowa liczba odświeży ekran bez dodatkowego kodu.
- `plural` już jest i działa w przeglądarce (`src/lib/rooms/summary.ts:34`).

## What We're NOT Doing

- Bez listy zapisywanej na starcie (M1): `start_game`, `open_question_list` i losowanie w Workerze zostają bez zmian.
- Bez samoczynnego końca gry: grę dalej kończy prowadzący (D2 z S-03).
- Bez wyboru długości przy tworzeniu gry: 15 i 5 to stałe, a długość zmienia się listą albo „Jeszcze 5”.
- Bez zmian w dzwonku `proposal-approve` (decyzja 3) i w statystykach S-11.
- Bez liczby na ekranie czekania spóźnionego (umowa „nic z gry”, `src/components/room/JoinWaiting.tsx:14-15`) i na ekranie końca, który ma już „Odsłoniętych pytań”.
- Bez obsługi gry w toku przy wdrożeniu: pokój po 15. rundzie zobaczy liczbę mniejszą od numeru, a prowadzący zakończy grę. Gdy numer rundy przekracza liczbę pytań także po dobraniu, `more_questions` odpowie `no_questions`, a podbite `extra_questions` zostanie; nikomu nie psuje to stanu. Wdrażamy poza grą.
- Bez punktu 6 kolejki (`refactor-opportunities`), pominięty decyzją Karola.

## Implementation Approach

Kolejność jak w S-07, S-09 i S-10: baza z testami, serwer gry, ekrany z wariantami do wyboru Karola, wdrożenie. Liczba pytań jest wyliczana w jednej funkcji `private`, używanej przez `room_lobby`, strażnika i dobieranie, a jedyna nowa dana to licznik dobranych pytań na pokoju.

## Critical Implementation Details

- **Kolejność wdrożenia:** baza, potem kod. Nowy `parseRoomState` odmówi stanu bez `question_count`, więc scalenie przed `db push` zablokuje każdy pokój. Stary Worker przy nowej bazie działa, ale przez chwilę po 15. pytaniu pokaże „Pytań już nie ma”.
- **„Jeszcze 5” od razu otwiera rundę.** Ruch bez zmiany rundy zostawiłby zajęte przyciski (`src/components/room/HostActions.tsx:109-114`) i ustawiony `movedFrom` (`src/components/room/RoomScreen.tsx:221`).
- **Licznik nie jest nagłówkiem i stoi w DOM po tytule.** Fokus idzie na pierwszy `h1, h2` (`RoomScreen.tsx:224`), `tests/e2e/support/round.ts:19` wymaga nagłówka dokładnie ze zdaniem, a `AGENTS.md` każe zaczynać widok tytułem. Wariant z licznikiem nad pytaniem ustawia to wyłącznie kolejnością w układzie.

## Faza 1: Baza

### Overview

Baza zna liczbę pytań, zatrzymuje grę po ostatnim pytaniu, umie dobrać kolejne i daje liczbę każdemu graczowi.

### Changes Required:

#### 1. Migracja: kolumna i liczba pytań

**File**: `supabase/migrations/*_game_length.sql` (`npx supabase migration new game_length`)

**Intent**: Dać jedną definicję liczby pytań gry, bo to z niej korzystają stan pokoju, strażnik i dobieranie.

**Contract**: `public.rooms.extra_questions integer not null default 0 check (extra_questions between 0 and 1000)`, bez nowych grantów: zmienia ją tylko funkcja `definer`. Nowa `private.question_count(p_room_id uuid) returns integer`, `stable`, `set search_path = ''`, właściciel `postgres`, bez grantów:

```sql
select case
         when count(*) filter (where not g.proposed) > 0 then count(*) filter (where not g.removed)
         else 15 + count(*) filter (where g.proposed)
       end::integer
       + (select r.extra_questions from public.rooms r where r.id = p_room_id)
from private.game_questions g
where g.room_id = p_room_id;
```

Lista z samymi usuniętymi daje 0 i `start_game` dalej odpowiada `list_empty`. Gra bez listy z zatwierdzoną propozycją daje 16.

#### 2. Strażnik i jedna definicja kandydata

**File**: ta sama migracja

**Intent**: Zatrzymać grę w jednym miejscu i nie powtarzać warunku „niezagrany kandydat spoza listy” przy dobieraniu.

**Contract**: Nowa `private.unplayed_candidates(p_room_id uuid, p_candidates text[]) returns table (question_id text, place bigint)`, `stable`, bez grantów, z warunkami kandydata z dzisiejszej `open_next_round`. `private.open_next_round` (ta sama sygnatura, `create or replace`) korzysta z niej i zaraz po kontroli 1000 kandydatów zwraca `false`, gdy `p_number > private.question_count(p_room_id)`. Dalej nic nie zmienia się w kolejności: lista, propozycje przed resztą, kandydaci.

#### 3. Ruch „Jeszcze 5 pytań”

**File**: ta sama migracja

**Intent**: Pozwolić prowadzącemu dobrać pytania i od razu ruszyć dalej, bez obiecywania pytań, których nie ma.

**Contract**: `public.more_questions(p_room_id uuid, p_round integer, p_candidates text[], p_player_token text default null) returns jsonb`, `security definer`, `set search_path = ''`, właściciel `postgres`, `grant execute to anon, authenticated`, jak `next_round`. Kroki po kolei:

1. Blokada wiersza pokoju i te same odmowy co `next_round`, w tej samej kolejności: `leader_refusal`, `room_closed`, `no_round`, `round_over`, `round_in_progress`.
2. Kontrola 1000 kandydatów (22023), jak w `open_next_round`.
3. Gdy numer rundy jest mniejszy od liczby pytań, nic nie dobiera. To nieświeży ekran: inny prowadzący właśnie zatwierdził propozycję, więc ruch działa jak „Następne pytanie”.
4. W przeciwnym razie `least(5, count(distinct question_id))` z `private.unplayed_candidates`, bo funkcja jest publicznym wejściem, a powtórzone id nie mogą podbić liczby. Zero to `no_questions` i nic nie jest zapisane. Więcej niż zero podnosi `extra_questions` o tę liczbę.
5. `private.open_next_round` dla następnego numeru (`false` to `no_questions`), potem `private.fold_reactions`, jak w `next_round` (S-11), i dokładnie `{ok: true}`.

#### 4. Stan pokoju

**File**: ta sama migracja

**Intent**: Dać liczbę każdemu graczowi, bez treści listy.

**Contract**: `public.room_lobby` (ta sama sygnatura) zwraca na najwyższym poziomie `question_count` z `private.question_count`, dla każdej roli i w każdym statusie. Reszta stanu bez zmian, `leader_draw` też, bo jego liczby są potrzebne do „Jeszcze 5”.

#### 5. Testy bazy

**File**: `tests/db/game-length.test.ts` (nowy, jeden host), `tests/db/support/rounds.ts`, `tests/db/question-list.test.ts`, `tests/db/roles.test.ts`

**Intent**: Sprawdzić reguły przez drzwi ról, z wyrocznią z decyzji Karola (`context/foundation/test-plan.md` §6.2, także limit rejestracji).

**Contract**: `rounds.ts` dostaje `moreQuestions` i `question_count` w `LOBBY_KEYS`. Przypadki:

- Liczba u wszystkich: host, współhost i gość bez roli widzą 15 przed otwarciem listy, a gość nie dostaje niczego z listy.
- Ruchy na liście: 15 po otwarciu, 14 po usunięciu, 15 po dolosowaniu, 16 po własnym, 16 po „Popraw”.
- Pusta lista: 0 i `list_empty`.
- Zatrzymanie: gra bez listy po rundzie 15 odpowiada `no_questions`, runda 15 zostaje ostatnia, nic nie powstaje.
- Decyzja 4: gra z pominięciami staje po rundzie 15, a liczba zostaje 15.
- Pominięcie ostatniego: `{ok: true}`, runda T w fazie `skipped`, bez nowej rundy.
- Propozycja: 16 w grze bez listy i z listą; po zatwierdzeniu przy zatrzymanej grze `next_round` przechodzi.
- „Jeszcze 5”: po rundzie 15 dokładnie `{ok: true}`, liczba 20, runda 16 z nowym pytaniem, stop po rundzie 20.
- Limit: 3 świeżych kandydatów to liczba 18; zero to `no_questions` i liczba bez zmian; kandydaci zagrani i z listy się nie liczą; powtórzone id liczą się raz.
- Z listą: dobieranie sięga poza listę i nie zwraca pytania usuniętego ani poprawionego.
- Nieświeży ekran: po zatwierdzeniu przez drugiego prowadzącego ruch otwiera propozycję, a liczba zostaje 16.
- Odmowy: `round_in_progress`, `round_over`, `not_leader`, `room_unknown`, `room_closed`, `no_round`, zły token 22023. Współhost jako `anon` działa. Dwa ruchy naraz: 1 × `ok`, 1 × `round_over`, liczba rośnie raz.
- `tests/db/roles.test.ts`: host nie zmieni `extra_questions` przez `update`.
- `question-list.test.ts`: runda po ostatnim wpisie listy idzie teraz przez `moreQuestions`, a `next_round` przed nim dostaje `no_questions`. Alarm B z S-06 dalej pilnuje kandydatów z listy.

#### 6. Widok twórcy gry

**File**: `supabase/tests/round_creator_view.test.sql`

**Intent**: Sprawdzić katalog i to, czego role gry nie widzą.

**Contract**: `function_facts` i `versions_of` dla `more_questions`, `room_lobby` i `open_next_round`; dwie funkcje `private` bez grantów; kolumna z domyślnym 0 i ograniczeniem; kciuki liczone raz po `more_questions`, według wzorca S-11 ze `stats_gain`; zaktualizowany `plan(n)`.

Strażnik zatrzymałby też istniejący scenariusz `stats-excluded` (`:2300-2319`): lista ma 2 wpisy z usuniętą pozycją 2, czyli liczbę 1, a gra idzie do rundy 3. Lista dostaje 4 kandydatów `pgtap-excluded-001..004`, dalej z usuniętą pozycją 2 (liczba 3, rundy 001, 003, 004). Zmienia się opis asercji `setup`, a `stats_gain` zostaje.

### Success Criteria:

#### Automated Verification:

- Job `db` zielony w CI, w tym `tests/db/game-length.test.ts`, przepisany `tests/db/question-list.test.ts` i nowe asercje pgTAP
- Bramka zielona: `npm run lint`, `npx astro check`, `npm test`, `npm run build`
- Próbny alarm A trafia dokładnie: `private.open_next_round` bez strażnika (czerwone tylko testy z opisu commita, potem revert i zielone CI)
- Próbny alarm B trafia dokładnie: `more_questions` zawsze dobiera 5 (osobny commit, potem revert i zielone CI)
- `git diff main...HEAD -- supabase/migrations` pokazuje wyłącznie migrację tej zmiany

#### Manual Verification:

- Karol akceptuje streszczenie migracji po ludzku

**Implementation Note**: Push gałęzi i draft PR za zgodą Karola. Po fazie zatrzymaj się na akceptację streszczenia. Migracja na produkcję idzie dopiero w Fazie 4. Oba alarmy to osobne commity, bo alarm A przesuwa rundy scenariusza.

---

## Faza 2: Serwer gry

### Overview

Worker czyta liczbę, liczy, co prowadzący może zrobić po rundzie, wystawia nowy ruch i dzwoni przy zmianach listy.

### Changes Required:

#### 1. Stan pokoju

**File**: `src/lib/rooms/shared.ts`

**Intent**: Uczynić `question_count` częścią umowy, tak by baza bez niego została odmówiona, a nie odczytana jako 0.

**Contract**: `LobbyState.question_count: number`, wymagane w `parseRoomState` (`isCount`), więc przechodzi też do `RoomView`. Nowe `RoomView.moreQuestions: number | null`, sprawdzane w `parseRoomView`.

#### 2. Liczenie po rundzie

**File**: `src/lib/rounds/draw.ts`, `src/lib/rooms/server.ts`

**Intent**: Rozdzielić dwa pytania: „czy gra ma jeszcze pytanie” i „ile da się dobrać”.

**Contract**: `questionsLeft` z `draw.ts` zmienia się w `questionsToDraw(poolSize, list, roundNumber): number`, ten sam wzór, najmniej 0. Stała `MORE_QUESTIONS = 5`. `leaderQuestionsLeft` odpowiada `round.number < question_count`. Nowe `leaderMoreQuestions(lobby)`: `null`, gdy `leaderQuestionsLeft` nie jest `false`, w przeciwnym razie `Math.min(MORE_QUESTIONS, questionsToDraw(...))`. `roomView` liczy je sam z `lobby`, więc `lobby.ts` i `src/pages/r/[id].astro` zostają bez zmian. Komentarze przy obu funkcjach opisują nowe znaczenie.

#### 3. Nowy ruch

**File**: `src/lib/rooms/server.ts`, `src/pages/api/rooms/[id]/more.ts` (nowy), `src/components/room/room-actions.ts`, `src/lib/rooms/json-route.ts`

**Intent**: Wystawić „Jeszcze 5 pytań” tą samą drogą co „Następne pytanie”.

**Contract**: `moreQuestions(supabase, roomId, round, candidates, playerToken)` jak `nextRound`. Trasa `more.ts` to kopia `next.ts` z `OP = "more"`: `{round}`, `leaderSelection`, cała pula w losowej kolejności, po sukcesie `ringLobby`, `no_questions` zamienione na `questions_ran_out`. `RoomAction` dostaje `"more"`, a komentarze nagłówków `room-actions.ts` i `json-route.ts:6-11` wymieniają nową trasę.

#### 4. Dzwonki

**File**: `src/pages/api/rooms/[id]/question-remove.ts`, `question-draw.ts`, `question-add.ts`, `src/components/room/QuestionList.tsx`

**Intent**: Liczba w poczekalni ma się zmieniać u wszystkich od razu.

**Contract**: Po przyjętym ruchu `ringLobby`, z komentarzem zamiast „No bell”, także w `QuestionList.tsx:17`. `question-edit.ts` i `question-list.ts` bez dzwonka: nie zmieniają liczby. `proposal-approve.ts` bez zmian (decyzja 3).

#### 5. Testy i smoke

**File**: `tests/unit/draw.test.ts`, `tests/unit/room-state.test.ts`, `tests/unit/room-rpc-gate.test.ts`, `tests/unit/announce.test.ts`, `tests/unit/remembered-nick.test.ts`, `tests/e2e/question-list.spec.ts`, `scripts/smoke.mjs`, `src/pages/dev/room-states.astro`, `src/pages/dev/room-window.astro`

**Intent**: Pokryć nowe liczenie i umowę, a podglądy utrzymać przy zmianie typów.

**Contract**:

- `draw.test.ts`: blok `:205-283` na liczbach, z tymi samymi przypadkami.
- `room-state.test.ts`: brak `question_count` odmawia stanu, `VIEW_KEYS` z `moreQuestions`, `leaderQuestionsLeft` i `leaderMoreQuestions` na granicach: N < T, N = T z pulą 7, 3 i 0, gość, runda w głosowaniu.
- `room-rpc-gate.test.ts`: wiersz wyroczni i przypadek `more_questions`.
- Fikstury `RoomView` w testach i podglądach dostają nowe pola.
- `question-list.spec.ts:165-171`: gość A dostaje teraz dzwonek po dodaniu pytania, a `nextListFetch` ustawiony przed `reload` może złapać pobranie starego dokumentu. Razem z dzwonkami: `await pageA.reload({ waitUntil: "commit" })`, dopiero potem `await nextListFetch(pageA, room.id)`.
- Smoke: gość i host widzą `question_count: 15`, liczba rośnie i spada przy ruchach na liście, `more` w trakcie głosowania to `round_in_progress`, gość bez roli dostaje `not_leader`, a komentarz `smoke.mjs:277` wymienia `more.ts`. Liczba kroków w `test-plan` §6.5 rośnie w Fazie 4.

### Success Criteria:

#### Automated Verification:

- Bramka zielona: `npm run lint`, `npx astro check`, `npm test`, `npm run build`
- CI zielone: `ci`, `smoke`, `db`, `e2e`, z nowymi krokami smoke

**Implementation Note**: Push za zgodą Karola. W tej fazie ekran po ostatnim pytaniu pokazuje tylko „Zakończ grę” i notkę, a przycisk dochodzi w Fazie 3.

---

## Faza 3: Ekrany

### Overview

Karol wybiera wygląd na zrzutach, potem licznik i przycisk trafiają na ekrany.

### Changes Required:

#### 1. Warianty do wyboru

**File**: scratchpad, podglądy `/dev`

**Intent**: Wygląd to decyzja Karola, także w trybie samodzielnym.

**Contract**: Strona HTML z „Co oceniasz” w Chrome Karola: laptop jako całe okno 1:1, telefon w prawdziwej wielkości. Trzy decyzje, po 2–3 warianty: licznik w poczekalni, licznik przy pytaniu (głosowanie, odsłona, pominięcie), ekran prowadzącego po ostatnim pytaniu, z główną akcją i ewentualną linijką dla graczy bez roli. Bez wyboru Karola nie ma dalszego kodu ekranów.

#### 2. Licznik

**File**: nowy komponent w `src/components/room/`, `RoundVoting.tsx`, `RoundReveal.tsx`, `RoundSkipped.tsx`, `RoomLobby.tsx`

**Intent**: Pokazać wybrany licznik w jednym miejscu kodu na wszystkich ekranach rundy i w poczekalni.

**Contract**: Element inny niż `h1`/`h2`, w DOM po tytule, tylko tokeny. W poczekalni w bloku tytułu (`RoomLobby.tsx:136-141`), jedynym widocznym dla każdej roli, z odmianą przez `plural`.

#### 3. Przyciski po ostatnim pytaniu

**File**: `src/components/room/HostActions.tsx`, `RoundReveal.tsx`, `RoundSkipped.tsx`, `RoomScreen.tsx`, `tests/unit/host-actions.test.ts` (nowy)

**Intent**: Prowadzący dostaje wybór zamiast gry bez końca.

**Contract**: `HostActionId` z `"more"`, `moreQuestionsAction(count, run)`: etykieta „Jeszcze N pytań” przez `plural`, jedno naciśnięcie, bez pytania o potwierdzenie, bo nic nie przepada. `afterRoundActions` dostaje też liczbę i `onMore`: gdy pytania zostały, „Następne pytanie” i „Zakończ grę”; gdy liczba dobrania jest większa od 0, „Jeszcze N” i „Zakończ grę”; w przeciwnym razie „Zakończ grę” z `QUESTIONS_RAN_OUT`. `RoundReveal` i `RoundSkipped` zachowują swoje różne odczyty `null` przy `questionsLeft`. `VIEW_CHANGING` z `"more"`, plus `onMore` w `RoomScreen`.

Test jednostkowy: trzy stany przycisków i etykieta dla 1, 3 i 5, bo e2e z pulą 20 pokaże tylko „Jeszcze 5”. Żaden test nie importuje dziś `@/components`: jeśli import `HostActions.tsx` nie przejdzie w Vitest, `afterRoundActions` trafia do zwykłego pliku `.ts` obok.

#### 4. Czytnik ekranu

**File**: `src/lib/rooms/announce.ts`, `tests/unit/announce.test.ts`

**Intent**: Niewidomy gracz ma dostać tę samą informację, także na wieczornej próbie F7.

**Contract**: Ogłoszenie „Pytanie N z T.”. `announcementKey` bez liczby T, więc zmiana T sama niczego nie ogłasza.

#### 5. Podglądy

**File**: `src/pages/dev/room-states.astro`, `src/pages/dev/room-window.astro`

**Intent**: Każdy nowy stan ma podgląd (`AGENTS.md`, UI).

**Contract**: Stany: poczekalnia z liczbą u hosta i gościa, odsłona pytania T z „Jeszcze 5”, z „Jeszcze 3”, bez dobierania, pominięcie ostatniego, gość na ostatnim pytaniu. Pasek hosta z „Jeszcze 5” także w `/dev/room-window`.

#### 6. E2E

**File**: `tests/e2e/game-length.spec.ts` (nowy, projekty `chromium` i `phone`), `playwright.config.ts`

**Intent**: Przejść drogę przez prawdziwą przeglądarkę, z kilkoma graczami (`test-plan` §6.4).

**Contract**: Dzwonek według „Bell vs poll” (`test-plan.md:302-306`), bo sama zmiana liczby przyszłaby też z odpytywania: przy każdym z trzech ruchów ekran gościa przeładowuje się z `nextListFetch` tuż przed ruchem, a nowa liczba pojawia się szybciej niż `ROOM_POLL_MS` od przeładowania. Kolejność: dolosowanie (16), własne pytanie (17), usunięcia do 3, ostatnie usunięcie z pomiarem („2 pytania”). Po starcie wszyscy widzą „Pytanie 1 z 2”, po drugim pytaniu host ma „Jeszcze 5 pytań”, nie ma „Następne pytanie”, a po naciśnięciu wszyscy widzą „Pytanie 3 z 7”. Pominięcie liczy się do licznika, a gra kończy się „Zakończ grę”. `game-length` w `testMatch` projektu `phone` (`playwright.config.ts:42`) i w komentarzu nad nim: bez tego test nie pobiegnie w oknie telefonu, a CI będzie zielone.

### Success Criteria:

#### Automated Verification:

- Bramka zielona: `npm run lint`, `npx astro check`, `npm test`, `npm run build`
- Job `e2e` zielony w CI, w tym `tests/e2e/game-length.spec.ts` w projektach `chromium` i `phone`
- Próbny alarm C trafia dokładnie: `question-remove.ts` bez dzwonka (czerwony tylko krok gościa w `game-length.spec.ts`, potem revert i zielone CI)

#### Manual Verification:

- Karol wybiera warianty na zrzutach: licznik w poczekalni, licznik przy pytaniu, ekran po ostatnim pytaniu
- Karol akceptuje gotowe ekrany na zrzutach: laptop i telefon

**Implementation Note**: Po wyborze wariantów i po gotowych ekranach zatrzymaj się na akceptację. Serwer dev tylko do podglądów `/dev/*`, zatrzymać po pracy.

---

## Faza 4: Wdrożenie

### Overview

Dokumenty, migracja, scalenie i sprawdzenie na produkcji, w kolejności baza, potem kod.

### Changes Required:

#### 1. Dokumenty

**File**: `context/domain/glossary.md`, `context/foundation/prd.md`, `context/foundation/roadmap.md`, `context/foundation/test-plan.md`, `context/deployment/deploy-plan.md`, `docs/development.md`

**Intent**: Zapisać nowe zasady gry i zastąpić „wieczór się nie urywa” przystankiem.

**Contract**:

- Słownik: nowe terminy „liczba pytań gry” (`question_count`) i „dobranie pytań” (`more_questions`, `extra_questions`, `moreQuestions`); „lista pytań gry” bez losowania bez końca; „pozostałe pytania” w nowym znaczeniu; przy „propozycji pytania” wyjątek z decyzji 2.
- PRD: FR-012 i FR-015 o liczbie pytań oraz nowe FR-026 z zachowaniem po ostatnim pytaniu.
- Roadmapa przez `/10x-roadmap`: S-19 z `Change ID: game-length`, wiersz w „At a glance” i blok w „Slices”.
- Test-plan: §6.2 z `game-length.test.ts`, alarmami A, B i liczbą kont (20 → 21 z limitu 30, `:193`); §6.3 z kluczem `question_count`; §6.4 z `game-length.spec.ts`, alarmem C i akapitem „Spec w oknie telefonu” (`:308`); §6.5 z krokami smoke.
- `deploy-plan.md`: wpis w „Wgrane migracje” po `db push`, z wynikiem `db advisors`.
- `docs/development.md`: trasa `more` w tabeli tras (`:160`) i nowe kroki w opisie smoke (`:187-190`).

#### 2. Kolejność wdrożenia

**File**: bez zmian w kodzie

**Intent**: Migracja przed kodem, każdy krok ze zgodą Karola, poza grą, z dobrej sieci (nie eduroam).

**Contract**: PR gotowy i zielony → `npx supabase db push --dry-run` → `npx supabase db push` → `npx supabase migration list` → smoke na serwerze dev → Karol scala (`! gh pr merge <n> --merge`) → Workers Builds → smoke na produkcji → przeklikanie Karola → epilog przez osobny PR.

### Success Criteria:

#### Automated Verification:

- Na PR zielone `ci`, `smoke`, `db` i `e2e`
- `npx supabase db push --dry-run` pokazuje tylko migrację tej zmiany, a po `db push` `npx supabase migration list` jest zgodny
- Na `main` zielone `ci`, `smoke`, `db`, `e2e` i Workers Builds
- `BASE_URL=https://most-likely-to.charlesonthewave.workers.dev npm run smoke` zielony

#### Manual Verification:

- Karol na telefonie i laptopie przechodzi drogę: liczba w poczekalni, zmiana listy u gościa, licznik w grze, „Jeszcze 5”, „Zakończ grę”
- Przy grze z ekipą: 15 pytań wypełnia wieczór, a przystanek nie psuje rytmu

**Implementation Note**: PR nie może zostać scalony przed `db push`. Po scaleniu `/10x-impl-review`, a po grze z ekipą `/10x-archive`.

---

## Testing Strategy

### Unit Tests:

- `questionsToDraw`, `leaderQuestionsLeft` i `leaderMoreQuestions` na granicach N = T, N = T - 1 i pula 7, 3, 0.
- Parser odmawia stanu bez `question_count`, `VIEW_KEYS`, wyrocznia RPC.
- `afterRoundActions` (`tests/unit/host-actions.test.ts`): trzy stany przycisków, etykieta z odmianą dla 1, 3 i 5.
- Ogłoszenie „Pytanie N z T.”.

### Integration Tests:

- `tests/db/game-length.test.ts` i pgTAP: reguły przez drzwi ról oraz katalog.
- `tests/e2e/game-length.spec.ts`: cała droga z kilkoma graczami, w dwóch oknach.
- Smoke: droga przez Workera, odmowy `more` i liczba w stanie.

### Manual Testing Steps:

1. Otwórz grę na laptopie i dołącz telefonem: oba ekrany pokazują tę samą liczbę.
2. Usuń pytanie z listy: telefon pokazuje nową liczbę bez odświeżania.
3. Przejdź kilka pytań i pomiń jedno: licznik idzie o 1 za każdym razem.
4. Po ostatnim pytaniu sprawdź „Jeszcze 5 pytań”, a potem „Zakończ grę”.

## Performance Considerations

`private.question_count` to jedno zliczenie po kluczu pokoju przy każdym pobraniu stanu, przy liście najwyżej 100 wierszy. Dodatkowe dzwonki ogranicza `src/lib/live-sync/limiter.ts`: zmieniony stan wraca do `MIN_GAP_MS`, a seria usunięć daje ograniczoną liczbę pobrań.

## Migration Notes

Kolumna ma domyślne 0, więc stare pokoje nie wymagają przeniesienia danych. Wycofanie: stary Worker działa z nową bazą, tylko bez „Jeszcze 5”. Cofnięcie strażnika to nowa migracja, bo wypchniętej się nie edytuje.

## References

- Related research: `context/changes/game-length/research.md`
- Decyzje produktowe: `context/changes/game-length/change.md`
- Wzorzec faz i alarmów: `context/changes/guest-question-proposals/plan.md`
- Wzorzec ruchu prowadzącego: `src/pages/api/rooms/[id]/next.ts`, `supabase/migrations/20261027121442_co_host_role.sql:200-270`
- Wcześniejsze decyzje: `context/archive/2026-10-15-full-game-evening/research.md:104-112`, `context/archive/2026-10-24-question-list-review/plan-brief.md:23-24`

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: Baza

#### Automated

- [x] 1.1 Job `db` zielony w CI, w tym `tests/db/game-length.test.ts`, przepisany `tests/db/question-list.test.ts` i nowe asercje pgTAP — 516cd0b
- [x] 1.2 Bramka zielona: `npm run lint`, `npx astro check`, `npm test`, `npm run build` — 516cd0b
- [x] 1.3 Próbny alarm A trafia dokładnie: `private.open_next_round` bez strażnika (czerwone tylko testy z opisu commita, potem revert i zielone CI) — 516cd0b
- [x] 1.4 Próbny alarm B trafia dokładnie: `more_questions` zawsze dobiera 5 (osobny commit, potem revert i zielone CI) — 516cd0b
- [x] 1.5 `git diff main...HEAD -- supabase/migrations` pokazuje wyłącznie migrację tej zmiany — 516cd0b

#### Manual

- [x] 1.6 Karol akceptuje streszczenie migracji po ludzku — 516cd0b

### Phase 2: Serwer gry

#### Automated

- [x] 2.1 Bramka zielona: `npm run lint`, `npx astro check`, `npm test`, `npm run build`
- [ ] 2.2 CI zielone: `ci`, `smoke`, `db`, `e2e`, z nowymi krokami smoke

### Phase 3: Ekrany

#### Automated

- [ ] 3.1 Bramka zielona: `npm run lint`, `npx astro check`, `npm test`, `npm run build`
- [ ] 3.2 Job `e2e` zielony w CI, w tym `tests/e2e/game-length.spec.ts` w projektach `chromium` i `phone`
- [ ] 3.3 Próbny alarm C trafia dokładnie: `question-remove.ts` bez dzwonka (czerwony tylko krok gościa w `game-length.spec.ts`, potem revert i zielone CI)

#### Manual

- [ ] 3.4 Karol wybiera warianty na zrzutach: licznik w poczekalni, licznik przy pytaniu, ekran po ostatnim pytaniu
- [ ] 3.5 Karol akceptuje gotowe ekrany na zrzutach: laptop i telefon

### Phase 4: Wdrożenie

#### Automated

- [ ] 4.1 Na PR zielone `ci`, `smoke`, `db` i `e2e`
- [ ] 4.2 `npx supabase db push --dry-run` pokazuje tylko migrację tej zmiany, a po `db push` `npx supabase migration list` jest zgodny
- [ ] 4.3 Na `main` zielone `ci`, `smoke`, `db`, `e2e` i Workers Builds
- [ ] 4.4 `BASE_URL=https://most-likely-to.charlesonthewave.workers.dev npm run smoke` zielony

#### Manual

- [ ] 4.5 Karol na telefonie i laptopie przechodzi drogę: liczba w poczekalni, zmiana listy u gościa, licznik w grze, „Jeszcze 5”, „Zakończ grę”
- [ ] 4.6 Przy grze z ekipą: 15 pytań wypełnia wieczór, a przystanek nie psuje rytmu
