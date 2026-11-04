# Propozycje pytań od gości (S-10) Implementation Plan

> **Decyzje Karola (2026-11-04):** (1) propozycje można wysyłać w poczekalni i w grze, a zatwierdzać dopiero od startu gry; (2) zatwierdzone pytanie gra w następnej rundzie, przed resztą listy; (3) nick autora widzą tylko prowadzący; (4) każdy gracz, także host i współhost, ma 3 propozycje na grę, odrzucone też się liczą; (5) autor widzi tylko liczniki („czeka”, „zostało”), bez statusu „zatwierdzona/odrzucona”.

## Overview

Gracz w trakcie wieczoru proponuje własne pytanie, a prowadzący (host albo współhost) je zatwierdza albo odrzuca. Zatwierdzone trafia do listy pytań tej gry i pada w następnej rundzie (FR-013, FR-014). To jedyny sposób, w jaki goście dokładają treść do gry, więc jedyną bramką jest decyzja prowadzącego, a tekst nie może dotrzeć do nikogo innego przed zatwierdzeniem.

## Current State Analysis

Pełne ustalenia: `context/changes/guest-question-proposals/research.md`. W skrócie:

- `private.game_questions` trzyma listę pytań gry, a `private.open_next_round` czyta ją na żywo, więc wiersz dopisany w trakcie gry zostanie zagrany istniejącą drogą. Dziś bierze wpis o najniższej niezagranej pozycji.
- Pięć funkcji listy działa tylko dla hosta i tylko w poczekalni. Zatwierdzanie musi być osobną funkcją, a współhost nie może widzieć listy.
- `open_question_list` i `start_game` traktują każdy wiersz `game_questions` jako przejrzaną listę, więc nic nie może tam trafić przed startem gry.
- Wzór „gracz prosi, prowadzący decyduje” to `join_requests` i `JoinRequests.tsx` (S-08, S-04), a trasa dla każdego gracza to `color.ts` (S-18).
- Nie ma limitu na osobę, a wiersze `game_questions` nie mają autora.

## Desired End State

- Każdy gracz w poczekalni i w grze widzi formularz propozycji oraz swoje liczniki („czeka na decyzję: 1”, „zostały Ci 2”).
- Prowadzący widzi czekające propozycje z nickiem autora w poczekalni i w grze; od startu gry może je zatwierdzić, a odrzucić może zawsze. Nikt inny nie widzi tekstu przed rundą.
- Zatwierdzone pytanie pada w następnej rundzie, przed resztą listy, także gdy pytania już się skończyły. Kilka zatwierdzonych gra w kolejności zatwierdzania.
- Po zamknięciu pokoju w bazie nie zostaje para autor–tekst, a w pokoju, który po 12 h od założenia wciąż jest w poczekalni, propozycje znikają przy każdym godzinnym sprzątaniu. Zatwierdzone pytania zostają na liście gry bez autora, do przeglądu twórcy gry SQL-em (FR-021).
- Weryfikacja: `tests/db/proposals.test.ts`, pgTAP, smoke, `tests/e2e/proposals.spec.ts`.

### Key Discoveries:

- Kolejność pytań jest w `private.open_next_round`, `supabase/migrations/20261024094002_question_list_review.sql:499-507`, i to najnowsza definicja tej funkcji.
- `questionsLeft` (`src/lib/rounds/draw.ts:89-95`) liczy pytanie z propozycji poprawnie: `list_entries` rośnie o 1, a `list_base_count` nie, bo wiersz nie ma `question_id`. Komentarz „both 0 with no list” przestaje być ścisły.
- `next_round` odmawia tylko w fazie `voting` (`20261027121442_co_host_role.sql:252-254`), a `afterRoundActions` zależy od `questionsLeft` (`src/components/room/HostActions.tsx:58-65`, `RoundSkipped.tsx`), więc po dzwonku wraca „Następne pytanie”, także po pominięciu ostatniego pytania.
- `close_stale_games` bierze tylko `status = 'playing'` (`20261014101925_close_stale_games.sql:29`). Pokój w poczekalni trzeba sprzątać osobno, po `rooms.created_at` (`20261007122858_room_lobby.sql:28`).
- pgTAP zabrania w `private` kolumn czasu, `serial` i `identity` (`supabase/tests/round_creator_view.test.sql:425-458`), więc propozycja ma numer w obrębie pokoju, jak `position`.
- Tabela nielogowana z kluczem obcym do logowanej ma precedens: `private.round_reactions` (`20261026074427_question_play_data.sql:86-92`).
- Identyfikację dowolnego gracza pokoju pokazuje `set_player_color` (`20261031090821_player_color_choice.sql:325-387`), a role prowadzącego `reject_latecomer` (`20261103151953_rejoin_after_refresh.sql:507-548`).
- Formularz nie może siedzieć w widoku rundy, bo zmiana rundy podmienia widok (`src/components/room/RoomScreen.tsx:355-429`); miejsce poza `contentRef` jest przy `EmoteBar` (`RoomScreen.tsx:482-484`).

## What We're NOT Doing

- Bez edycji tekstu przez prowadzącego: zatwierdź albo odrzuć (FR-014).
- Bez cofania decyzji. Pytanie zatwierdzone przez pomyłkę prowadzący pomija w rundzie.
- Bez zatwierdzania w poczekalni: `open_question_list`, `start_game` i pięć funkcji listy zostają bez zmian.
- Bez skrótu dla prowadzących: ich propozycje idą tą samą drogą i tym samym limitem.
- Bez statusu „zatwierdzona/odrzucona” i bez komunikatu o odrzuceniu dla autora (decyzja 5).
- Bez filtra słów i bez limitu na pokój: bramką jest prowadzący, a zalew ogranicza limit 3 na gracza.
- Bez panelu twórcy gry (FR-021 zostaje SQL-em) i bez wliczania takich pytań do `private.question_stats`, jak przy własnych pytaniach.
- Bez widocznej listy zatwierdzonych pytań: po zatwierdzeniu współhost i tak nie widzi listy pytań gry.
- Limit nie przeżywa usunięcia gracza: usunięty, który wraca nowym linkiem, jest nowym graczem z nowymi 3 propozycjami (przyjęte).
- S-13 nie jest częścią zmiany: kasowanie gry usunie kaskadą także zatwierdzone pytania, co trafia jako uwaga do roadmapy.

## Implementation Approach

Kolejność jak w S-04, S-07 i S-09: baza z testami, serwer gry, ekrany z wariantami do wyboru Karola, wdrożenie. Propozycja żyje w osobnej tabeli `private.question_proposals`, bo tylko tam autor spotyka się z tekstem. Decyzja prowadzącego od razu kasuje tekst z tego wiersza, a sam wiersz zostaje jako wykorzystany limit do zamknięcia pokoju. Zatwierdzenie kopiuje tekst do `private.game_questions` ze znacznikiem `proposed`, bez autora.

## Critical Implementation Details

- **Kolejka:** `order by g.proposed desc, g.position` w `private.open_next_round`. `position` zostaje stałym uchwytem, a `start_game` nie zmienia się, bo przed startem nie ma wierszy `proposed`.
- **Kolejność wdrożenia:** baza, potem kod. Nowy `parseRoomState` odmawia przy braku kluczy, więc scalenie przed `db push` zablokuje otwieranie każdego pokoju. Stary Worker przy nowej bazie działa, bo kopiuje tylko klucze swojego kontraktu.
- **Numer propozycji** to `max(number) + 1` pod blokadą pokoju. Numer może wrócić tylko wtedy, gdy usunięto autora propozycji o najwyższym numerze; nieświeży ekran prowadzącego odświeża się wtedy dzwonkiem po usunięciu, więc to okno przyjmujemy.
- **Dzwonek** niesie tylko `seq`, bo kanał jest publiczny. Tekst idzie wyłącznie przez `room_lobby` po kontroli roli.

## Faza 1: Baza

### Overview

Tabela propozycji, trzy nowe funkcje, pierwszeństwo w kolejce, stan pokoju i sprzątanie, z testami przez drzwi ról i z widoku twórcy gry.

### Changes Required:

#### 1. Migracja: tabela i znacznik

**File**: `supabase/migrations/<timestamp>_guest_question_proposals.sql` (przez `npx supabase migration new guest_question_proposals`)

**Intent**: Oddzielić parę autor–tekst od listy gry i oznaczyć pytania z propozycji bez wskazywania osoby. Tabela nielogowana, jak kciuki: awaria bazy kasuje czekające propozycje, a para nie trafia do WAL.

**Contract**:

```sql
create unlogged table private.question_proposals (
  room_id uuid not null references public.rooms (id) on delete cascade,
  number integer not null check (number >= 1),
  player_id uuid not null references public.players (id) on delete cascade,
  text text check (char_length(text) between 1 and 90), -- null po decyzji prowadzącego
  primary key (room_id, number)
);
alter table private.game_questions add column proposed boolean not null default false;
```

Plus indeks na `player_id`, RLS, `revoke all … from public, anon, authenticated`, bez grantów i polityk. Czeka = `text is not null`. Wiersz po decyzji to zużyta propozycja, bez rozróżnienia zatwierdzona/odrzucona.

#### 2. Funkcje propozycji

**File**: ta sama migracja

**Intent**: Dać graczowi i prowadzącemu trzy publiczne ruchy z kompletem kontroli w środku (`security definer`, odmowy jako dane), po blokadzie wiersza pokoju, oraz jeden punkt z limitem 3.

**Contract**:

- `private.proposals_left(p_player_id uuid) returns integer`, `stable`, bo woła ją też `room_lobby`: `greatest(3 - liczba wierszy gracza, 0)`, jedyne miejsce z liczbą 3, bez grantów.
- `public.propose_question(p_room_id uuid, p_text text, p_player_token text default null)`, grant dla `anon, authenticated`. Kolejność: token (22023), blokada pokoju, gracz jak w `set_player_color` (`room_unknown`), `room_closed`, tekst jak w `add_own_question` (`invalid_question_text`), ta sama treść czekająca od tego gracza daje `{ok: true}` bez nowego wiersza (podwójne wysłanie nie zużywa limitu), `proposal_limit`, zapis. Działa w statusie `lobby` i `playing`.
- `public.approve_proposal(p_room_id uuid, p_number integer, p_player_token text default null)`, grant jak wyżej. Kolejność: blokada, `private.leader_refusal`, `room_closed`, `game_not_started` gdy pokój jest w poczekalni, czekająca propozycja (`proposal_unknown`), `list_full` przy 100 wierszach listy (propozycja dalej czeka), wpis do `game_questions` (`max(position) + 1`, `proposed = true`, sam tekst), `text = null`.
- `public.reject_proposal(p_room_id uuid, p_number integer, p_player_token text default null)`, grant jak wyżej. Kontrole jak przy zatwierdzaniu, bez `game_not_started` i `list_full`; działa też w poczekalni, bo nie dotyka listy gry.
- Każda zwraca dokładnie `{ok: true}` albo `{ok: false, reason}`. Zły token to 22023.

#### 3. Kolejka, sprzątanie, stan pokoju

**File**: ta sama migracja

**Intent**: Dać zatwierdzonym pytaniom pierwszeństwo, skasować propozycje przy każdym zamknięciu pokoju i w porzuconej poczekalni oraz pokazać stan tylko właściwym osobom.

**Contract**:

- `private.open_next_round`: `create or replace` z najnowszej definicji, zmiana tylko w `order by` (Critical Implementation Details).
- `private.drop_round_state`: `create or replace` z `*_question_play_data.sql:243-261`, dodane `delete from private.question_proposals where room_id = p_room_id`.
- `private.close_stale_games`: po dotychczasowej pętli druga pętla z tą samą blokadą wiersza pokoju (`for update skip locked`) kasuje wszystkie wiersze propozycji pokoi w statusie `lobby` założonych ponad 12 h temu, także zużyte, więc limit takiego pokoju liczy się od nowa (przyjęte). Pokój zostaje w poczekalni. Funkcja dalej nie rzuca niczego od siebie.
- `public.room_lobby`: `create or replace` z `*_rejoin_after_refresh.sql:577-815`, dwa nowe klucze: `proposals` (czekające, `[{number, nick, text}]` w kolejności numerów, tylko dla prowadzącego, `[]` dla reszty, w każdym statusie) i `own_proposals` (`{left, waiting}` dla każdego gracza). Komentarz nad funkcją: `list_entries` obejmuje też pytania zatwierdzone w grze bez listy, a `question_list` u hosta takiej gry przestaje być `null` po pierwszym zatwierdzeniu (Worker podaje listę ekranowi tylko w poczekalni, więc nic jej nie pokazuje).
- Właściciele `postgres`, `revoke` i `grant` każdej nowej i zmienionej funkcji w jednym bloku, jak `*_rejoin_after_refresh.sql:821-844`. Nagłówek migracji opisuje cykl życia propozycji i kolejność wdrożenia.

#### 4. Testy bazy

**File**: `tests/db/proposals.test.ts` (nowy, jeden host), `tests/db/support/rounds.ts`, `tests/db/round-anonymity.test.ts`

**Intent**: Sprawdzić reguły przez drzwi ról, z wyrocznią z decyzji 1–5, nie z implementacji (`context/foundation/test-plan.md` §6.2).

**Contract**: `rounds.ts` dostaje `proposeQuestion`, `approveProposal`, `rejectProposal` oraz `LOBBY_KEYS` z `own_proposals` i `proposals`. `ROUND_TABLES` w `round-anonymity.test.ts` dostaje `question_proposals`, więc strażnik §6.3 sprawdza też, że API nie wystawia tej tabeli. Przypadki:

- Kontrola pozytywna: gość jako `anon` wysyła, dokładnie `{ok: true}`, widzi `{left: 2, waiting: 1}`, host widzi `{number, nick, text}`, gość bez roli `proposals: []`.
- Host z sesją i współhost jako `anon` też wysyłają.
- Tekst: `??` na końcu zdjęte, puste, 91 i 401 znaków to `invalid_question_text`.
- Podwójne wysłanie tej samej czekającej treści: `{ok: true}`, jeden wiersz, limit bez zmian.
- Limit: czwarta to `proposal_limit`; odrzucona dalej się liczy; dwie naraz z różnymi tekstami przy `left = 1` dają dokładnie 1 × `ok` i 1 × `proposal_limit` (ten sam tekst to podwójne wysłanie, czyli 2 × `ok`).
- Odmowy: obcy i token z innego pokoju `room_unknown`, czekający spóźniony `room_unknown`, zły token 22023, gość bez roli `not_leader`.
- Pułapka poczekalni: `approve_proposal` to `game_not_started`, propozycja czeka, host ma `question_list: null`, a `open_question_list` daje 15 wpisów bez propozycji; `start_game` gra pytanie kandydata.
- Odrzucenie w poczekalni działa, tekst znika ze stanu, `left` się nie zmienia.
- Zatwierdzenie od współhosta jako `anon`: dokładnie `{ok: true}`, `proposals` puste, `waiting` spada, `left` bez zmian.
- Kolejka z listą: runda 2 ma tekst propozycji i `question_id: null`, runda 3 wraca do drugiego wpisu listy; dwie zatwierdzone grają w kolejności zatwierdzania; `skip_round` też otwiera zatwierdzone.
- Bez listy: `leader_draw.list_entries` rośnie o 1, `list_base_count` nie.
- Koniec pytań: `next_round` z pustymi kandydatami daje `no_questions`, a po zatwierdzeniu `{ok: true}`; to samo po pominiętej ostatniej rundzie.
- Dwaj prowadzący naraz: 1 × `ok`, 1 × `proposal_unknown`, jeden wiersz listy; ponowne zatwierdzenie i zatwierdzenie odrzuconej to `proposal_unknown`.
- Usunięcie autora kasuje jego czekające propozycje, cudze zostają; zatwierdzone pytanie zostaje. Przeniesienie miejsca (S-04) zachowuje limit.
- Po `end_game` każda z trzech funkcji to `room_closed`, a `proposals` jest puste.

#### 5. Widok twórcy gry

**File**: `supabase/tests/round_creator_view.test.sql`

**Intent**: Sprawdzić to, czego role gry nie widzą: katalog, resztki i przechowanie pytania bez autora.

**Contract**: Tabela nielogowana, bez grantów, poza publikacją (skany plus jawnie po nazwie); `hasnt_column` dla autora w `game_questions`; trzy funkcje `security definer` właściciela `postgres`, z pustym `search_path`, grant dla `anon, authenticated`; `proposals_left` bez grantów; 0 wierszy propozycji po `end_game`, „Nowej grze” i `close_stale_games`; pokój w poczekalni z `created_at` starszym niż 12 h traci propozycje i zostaje w poczekalni, a świeży je zachowuje; zatwierdzone pytanie zostaje w `game_questions` z `proposed = true`; `list_full` przy 100 wierszach wstawionych jako właściciel, propozycja dalej czeka. `select plan(…)` rośnie o nowe asercje.

### Success Criteria:

#### Automated Verification:

- Job `db` zielony w CI, w tym `tests/db/proposals.test.ts` i nowe asercje pgTAP
- Bramka zielona: `npm run lint`, `npx astro check`, `npm test`, `npm run build`
- Próbny alarm A trafia dokładnie: `room_lobby` daje `proposals` każdemu graczowi i `drop_round_state` nie kasuje propozycji (czerwone tylko testy wymienione w opisie commita, potem revert i zielone CI)
- Próbny alarm B trafia dokładnie: `private.open_next_round` bez pierwszeństwa propozycji (osobny commit, bo przesuwa kolejne rundy)
- `git diff main...HEAD -- supabase/migrations` pokazuje wyłącznie migrację tej zmiany

#### Manual Verification:

- Karol akceptuje streszczenie migracji po ludzku

**Implementation Note**: Push gałęzi i draft PR za zgodą Karola. Po fazie zatrzymaj się na akceptację streszczenia migracji. Migracja na produkcję idzie dopiero w Fazie 4. Alarm A psuje dwie rzeczy jednym commitem, co jest świadomym odstępstwem od „jednej rzeczy” z §6.2, tak samo jak para alarmów S-08; opis commita mówi, która usterka czerwieni który test.

---

## Faza 2: Serwer gry

### Overview

Worker przyjmuje nowy stan pokoju, wystawia trzy trasy i ma teksty odmów. Smoke przechodzi całą drogę propozycji.

### Changes Required:

#### 1. Stan pokoju

**File**: `src/lib/rooms/shared.ts`, `src/lib/rooms/server.ts`

**Intent**: Oba klucze są częścią kontraktu i idą do ekranu, a tekst propozycji dostaje tylko prowadzący, bo tak daje go baza.

**Contract**: Typy `QuestionProposal { number, nick, text }` i `OwnProposals { left, waiting }`; `LobbyState` i `RoomView` z `proposals` i `own_proposals`; `parseRoomState` odmawia przy braku lub złym kształcie obu kluczy, we wszystkich gałęziach statusu. `roomView` przekazuje je dalej, a komentarze przy `LobbyState` i `roomView` dostają opis.

#### 2. Ruchy i trasy

**File**: `src/lib/rooms/server.ts`, `src/lib/rooms/json-route.ts`, `src/pages/api/rooms/[id]/propose.ts`, `proposal-approve.ts`, `proposal-reject.ts`

**Intent**: Trzy cienkie trasy; rolę i limit rozstrzyga baza. Tekst nigdy nie trafia do adresu ani logu.

**Contract**:

- `proposeQuestion`, `approveProposal`, `rejectProposal` przez `callRpc` i `actionResult`.
- `bodyProposalNumber`: liczba całkowita od 1 do zakresu `integer`; `bodyQuestionText` bez zmian.
- `POST …/propose` z `{text}` według `color.ts`; `POST …/proposal-approve` i `…/proposal-reject` z `{number}` według `reject.ts`. Wszystkie dzwonią `ringLobby` po `ok` i odpowiadają przez `actionAnswer`.

#### 3. Teksty i kolejka pytań

**File**: `src/lib/rooms/errors.ts`, `src/lib/rounds/draw.ts`, `src/components/room/room-actions.ts`, `src/lib/rooms/shared.ts`, `src/lib/rooms/server.ts`, `src/components/room/RoundSkipped.tsx`

**Intent**: Każda odmowa ma własny tekst po polsku, a komentarze przy kolejce pytań mówią prawdę o grze bez listy.

**Contract**: `ROUND_REFUSALS` i `MESSAGES` z `proposal_limit`, `proposal_unknown` i `game_not_started`, każdy tekst inny niż dotychczasowe (`room-errors.test.ts`), także niż `room_open`; `RoomAction` z `propose`, `proposal-approve`, `proposal-reject`. Komentarze do poprawienia: `questionsLeft`, `LeaderDraw` i `question_list` w `LobbyState`, `leaderQuestionsLeft` oraz nagłówek `RoundSkipped` (po pominięciu ostatniego pytania „Następne pytanie” wraca po zatwierdzeniu propozycji).

#### 4. Testy i smoke

**File**: `tests/unit/room-rpc-gate.test.ts`, `room-state.test.ts`, `room-errors.test.ts`, `json-route.test.ts`, `draw.test.ts`, `announce.test.ts`, `remembered-nick.test.ts`, `src/pages/dev/room-states.astro`, `src/pages/dev/room-window.astro`, `scripts/smoke.mjs`

**Intent**: Przypiąć nazwy RPC i argumenty, kontrakt stanu oraz drogę przez prawdziwego Workera.

**Contract**:

- `SQL_SIGNATURES` i `CASES` dla trzech funkcji; `PLANNED_ROUND_REFUSALS` z nowymi kodami; `questionsLeft` z zatwierdzonym pytaniem; brak klucza i zły wpis w `parseRoomState`.
- Fikstury i podglądy `/dev` dostają puste wartości nowych kluczy (właściwe podglądy w Fazie 3).
- Smoke: gość wysyła propozycję o rozpoznawalnym tekście; odpowiedź `GET …/lobby` innego gościa nie zawiera tego tekstu; host widzi ją i zatwierdza; gość bez roli dostaje 409 `not_leader`; zły `number` daje 400; „Następne pytanie” pokazuje tekst propozycji. Kroki stoją tak, żeby nie przesuwać rund, których oczekują dalsze kroki.

### Success Criteria:

#### Automated Verification:

- Bramka zielona: `npm run lint`, `npx astro check`, `npm test`, `npm run build`
- Job `smoke` zielony w CI z nowymi krokami, w tym krokiem o braku tekstu u innego gościa
- Jobs `db` i `ci` zielone

**Implementation Note**: Ta faza nie zmienia niczego na ekranach, więc nie wymaga ręcznej akceptacji. Serwera dev nie używamy tu do sprawdzania tras, bo `.dev.vars` wskazuje na produkcję; drogę przez Workera sprawdza job `smoke`.

---

## Faza 3: Ekrany

### Overview

Karol wybiera wygląd na zrzutach, potem powstają formularz gracza i lista prowadzącego, z podglądami i e2e.

### Changes Required:

#### 1. Warianty do wyboru

**File**: strona HTML w scratchpadzie (nie w repo)

**Intent**: Wygląd to decyzja Karola, także w trybie samodzielnym.

**Contract**: 2–3 warianty z „Co oceniasz”, laptop jako całe okno 1:1 i telefon w prawdziwej wielkości, zrzuty z headless Chrome, otwarte w Chrome Karola. Do wyboru: miejsce i forma formularza przy przypiętym pasku emotek, wygląd listy prowadzącego w grze oraz to, co prowadzący widzi w poczekalni (wiersz z nickiem i tekstem, „Odrzuć”, informacja, że zatwierdzi po starcie). Każdy wariant pokazuje też dwa najtrudniejsze ekrany: telefon prowadzącego w głosowaniu z 9 czekającymi propozycjami, wraz ze sposobem zwijania listy (Karol wybiera), oraz hosta w poczekalni, który ma obok siebie „Dodaj własne pytanie” i formularz propozycji. Teksty przycisków idą razem z wariantem.

#### 2. Formularz gracza

**File**: `src/components/room/ProposalForm.tsx` (nowy), `src/components/room/QuestionList.tsx`

**Intent**: Każdy gracz proponuje z każdego ekranu poczekalni i gry, a niewysłany tekst przeżywa zmianę rundy.

**Contract**: `QuestionField` wydzielony z `QuestionList.tsx:96-163` razem z `questionError` i `BUSY_BUTTON` do użycia w obu miejscach, bez zmiany działania listy hosta. Formularz ma własne `id` z `idPrefix` i własną etykietę, bo host w poczekalni widzi oba pola, a `/dev` kilka ekranów naraz. Formularz pokazuje `view.own_proposals`, stany: domyślny, wysyłanie, odmowa (`ServerError`), po wysłaniu, wykorzystany limit. Bez przenoszenia fokusu po ruchu innych osób.

#### 3. Lista prowadzącego

**File**: `src/components/room/QuestionProposals.tsx` (nowy)

**Intent**: Prowadzący rozstrzyga propozycję jednym dotknięciem, widząc pełne zdanie i nick autora.

**Contract**: Wiersz po `key={number}` z pełnym zdaniem „Kto z nas najprawdopodobniej … ?” jako zwykłym tekstem Reacta i nickiem autora, przyciski z mechaniką `RequestRow` z `JoinRequests.tsx:57-130` (czekanie do odświeżonego stanu, `aria-disabled`, błąd pod wierszem). W poczekalni bez zatwierdzania. Zwijanie według wybranego wariantu, stanem `open`, bo zestaw `ui` nie ma Dialog ani Collapsible. Bez przycisku „Anuluj”: `tests/e2e/support/round.ts` szuka go na ekranie prowadzącego bez zawężenia do regionu. Region `aria-live` z nową propozycją, jak w `JoinRequests`, bez czytania tekstu innym graczom.

#### 4. Podłączenie i podglądy

**File**: `src/components/room/RoomScreen.tsx`, `src/pages/dev/room-states.astro`, `src/pages/dev/room-window.astro`

**Intent**: Oba elementy stoją poza `contentRef`, więc ani odpowiedź na propozycję, ani pisanie nie przenosi fokusu.

**Contract**: `QuestionProposals` zaraz za `JoinRequests`, nad widokiem, dla `view.leader` i statusu innego niż `closed`, z podpisami zamiast nagłówków (wyjątek opisany w `JoinRequests.tsx`), żeby tytuł widoku został pierwszym nagłówkiem. `ProposalForm` bezpośrednio przed `<EmoteBar>`, dla każdego gracza i statusu innego niż `closed`: `EmoteBar` musi zostać ostatni w kolumnie, bo poniżej `lg` jego miejsce `h-18` trzyma koniec strony nad paskiem przypiętym do okna. Warunek `closed` jest po stronie formularza, bo `EmoteBar` stoi w każdym stanie. Akcje przez `act("propose", {text})`, `act("proposal-approve", {number})` i `act("proposal-reject", {number})`, poza `VIEW_CHANGING`. Podglądy wszystkich nowych stanów w `/dev/room-states`, także z 9 czekającymi propozycjami, a stanów zmieniających okno także w `/dev/room-window`. Szerokości z `room-frame.ts`, kolory tylko z tokenów.

#### 5. E2E

**File**: `tests/e2e/proposals.spec.ts` (nowy), `playwright.config.ts`

**Intent**: Sprawdzić całą drogę w przeglądarce z kilkoma graczami i dzwonkiem, także w oknie telefonu (`context/foundation/test-plan.md` §6.4).

**Contract**: Gość wysyła propozycję w poczekalni i widzi liczniki; host widzi ją, a drugi gość nie; po starcie host zatwierdza; po „Następne pytanie” wszyscy widzą to pytanie, bez nicku autora; współhost odrzuca kolejną propozycję; po trzeciej gość widzi wykorzystany limit; niewysłany tekst zostaje w polu po zmianie rundy. Dzwonek mierzony według §6.4 „Bell vs poll”, bo `ROUND_UPDATE_MS` (10 s) jest dłuższe niż `ROOM_POLL_MS` (8 s): ekran odbiorcy pobiera stan tuż przed ruchem (`nextListFetch`), a zmiana przychodzi przed upływem `ROOM_POLL_MS`; dotyczy wysłania propozycji (ekran hosta) i zatwierdzenia (licznik autora). Spec dopisany do `testMatch` projektu `phone`, z kontrolą okna graczy jak w `emotes.spec.ts`.

### Success Criteria:

#### Automated Verification:

- Bramka zielona: `npm run lint` (z `scripts/ui-literals.mjs`), `npx astro check`, `npm test`, `npm run build`
- Job `e2e` zielony w CI, w tym `tests/e2e/proposals.spec.ts` w projektach `chromium` i `phone`
- Próbny alarm C trafia dokładnie: `propose.ts` bez dzwonka (import `ringLobby` usunięty razem z wywołaniem; czerwony tylko `proposals.spec.ts`, potem revert i zielone CI)

#### Manual Verification:

- Karol wybiera wariant na zrzutach
- Karol akceptuje gotowe ekrany na zrzutach, telefon i laptop

**Implementation Note**: Serwer dev tylko do podglądów `/dev/*`, zatrzymany po pracy (`npx astro dev stop`). Po wyborze wariantu i po gotowych ekranach zatrzymaj się na akceptację Karola.

---

## Faza 4: Wdrożenie

### Overview

Dokumenty, migracja, scalenie i sprawdzenie na produkcji, w kolejności baza, potem kod.

### Changes Required:

#### 1. Dokumenty

**File**: `context/domain/glossary.md`, `context/foundation/prd.md`, `context/foundation/roadmap.md`, `context/foundation/test-plan.md`, `context/deployment/deploy-plan.md`

**Intent**: Zapisać rozstrzygnięte pytania otwarte i pokazać twórcy gry, gdzie szukać zatwierdzonych pytań.

**Contract**:

- Słownik: „propozycja pytania” od gracza, nie tylko gościa, z nazwami w kodzie; „prowadzący” z zatwierdzaniem i odrzucaniem propozycji; „własne pytanie” bez dopisku „pytanie gościa”; wiersz o liście pytań gry wspomina pierwszeństwo.
- PRD: FR-013 z limitem 3 i każdym graczem zamiast „Guest”, jak tabela ról; Open Question 4 rozstrzygnięte; FR-014 z miejscem w kolejce; obietnica „nic poza nickiem i głosami” (`prd.md:51`, `:152`) dopełniona o zatwierdzone pytanie, które zostaje bez autora dla FR-021.
- Roadmapa: Open Roadmap Question 4 i oba Unknowns S-10 rozstrzygnięte, uwaga przy S-13 o kaskadzie.
- Test-plan: §6.2 z `proposals.test.ts`, 20 kont, próbne alarmy; §6.3 z kluczami `proposals` i `own_proposals` oraz tabelą w `ROUND_TABLES`; §6.4 z `proposals.spec.ts`, także w projekcie `phone`; §6.5 z krokami smoke.
- `deploy-plan.md`: zapytanie twórcy gry (FR-021), z pominięciem gier konta smoke:

```sql
select r.created_at::date as gra, g.text
from private.game_questions g
join public.rooms r on r.id = g.room_id
where g.proposed
  and r.host_id not in (select user_id from private.stats_excluded_hosts)
order by r.created_at desc, g.position;
```

#### 2. Kolejność wdrożenia

**File**: bez zmian w kodzie

**Intent**: Migracja przed kodem, każdy krok ze zgodą Karola, z dobrej sieci (nie eduroam).

**Contract**: Gałąź wypchnięta, PR gotowy i zielony → `npx supabase db push --dry-run` → `npx supabase db push` → `npx supabase migration list` → Karol scala (`! gh pr merge <n> --merge`) → Workers Builds → smoke na produkcji → przeklikanie Karola.

### Success Criteria:

#### Automated Verification:

- Na PR zielone `ci`, `smoke`, `db` i `e2e`
- `npx supabase db push --dry-run` pokazuje tylko migrację tej zmiany, a po `db push` `npx supabase migration list` jest zgodny
- Na `main` zielone `ci`, `smoke`, `db`, `e2e` i Workers Builds
- `BASE_URL=https://most-likely-to.charlesonthewave.workers.dev npm run smoke` zielony

#### Manual Verification:

- Karol na telefonie i laptopie przechodzi drogę: propozycja w poczekalni, zatwierdzenie po starcie, pytanie w następnej rundzie, odrzucenie, wykorzystany limit
- Przy grze z ekipą: propozycje nie rozbijają rytmu wieczoru, a prowadzący nadąża z decyzjami

**Implementation Note**: PR nie może zostać scalony przed `db push` (Critical Implementation Details). Po scaleniu `/10x-impl-review`, a po grze z ekipą `/10x-archive`.

---

## Testing Strategy

### Unit Tests:

- Parser stanu: brak kluczy, zły kształt wpisu, poprawny stan u prowadzącego i u gracza.
- Brama RPC: nazwy i dokładne argumenty trzech funkcji.
- `questionsLeft` z zatwierdzonym pytaniem w grze bez listy i z listą; `bodyProposalNumber`; teksty nowych odmów.

### Integration Tests:

- `tests/db/proposals.test.ts`: role, limit, kolejka, koniec pytań, równoczesne ruchy (Faza 1 #4).
- pgTAP: katalog, resztki, sprzątanie, `list_full` (Faza 1 #5).
- Smoke: droga przez Workera (Faza 2 #4). E2E: droga w przeglądarce (Faza 3 #5).

### Manual Testing Steps:

1. Jako gość wyślij propozycję w poczekalni i sprawdź liczniki.
2. Jako host zobacz ją z nickiem, wystartuj grę i zatwierdź; drugi gość nie widzi jej do następnej rundy.
3. Kliknij „Następne pytanie” i sprawdź, że pada to pytanie, bez nicku autora.
4. Wyślij dwie kolejne, odrzuć jedną i sprawdź, że limit jest wykorzystany.
5. Dojdź do końca pytań z mniejszą pulą, zatwierdź propozycję i sprawdź, że wraca „Następne pytanie”.

## Performance Considerations

`room_lobby` przy odpytywaniu co 8 s dostaje dwa małe zapytania po kluczu pokoju i `player_id`, na najwyżej kilkudziesięciu wierszach. Każdy ruch trzyma blokadę pokoju krótko, jak inne ruchy gry.

## Migration Notes

Migracja tylko dodaje: nowa tabela, kolumna z domyślnym `false`, dwa klucze stanu, a `order by` zmienia wynik dopiero, gdy istnieją wiersze `proposed`. Stary Worker działa na nowej bazie. Wycofanie kodu po migracji jest bezpieczne; poprawka bazy to nowa migracja, nigdy edycja wypchniętej.

## References

- Research: `context/changes/guest-question-proposals/research.md`
- Roadmapa: `context/foundation/roadmap.md`, S-10
- PRD: `context/foundation/prd.md`, FR-013, FR-014, FR-021, tabela ról
- Wzór prośby: `supabase/migrations/20261022132240_latecomer_admission.sql`, `src/components/room/JoinRequests.tsx`
- Wzór ruchu gracza: `src/pages/api/rooms/[id]/color.ts`
- Wzór planu i wdrożenia: `context/changes/rejoin-after-refresh/plan.md`
- Zasady testów: `context/foundation/test-plan.md` §6.2, §6.3, §6.4

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: Baza

#### Automated

- [ ] 1.1 Job `db` zielony w CI, w tym `tests/db/proposals.test.ts` i nowe asercje pgTAP
- [x] 1.2 Bramka zielona: `npm run lint`, `npx astro check`, `npm test`, `npm run build`
- [ ] 1.3 Próbny alarm A trafia dokładnie: `room_lobby` daje `proposals` każdemu graczowi i `drop_round_state` nie kasuje propozycji (czerwone tylko testy wymienione w opisie commita, potem revert i zielone CI)
- [ ] 1.4 Próbny alarm B trafia dokładnie: `private.open_next_round` bez pierwszeństwa propozycji (osobny commit, bo przesuwa kolejne rundy)
- [ ] 1.5 `git diff main...HEAD -- supabase/migrations` pokazuje wyłącznie migrację tej zmiany

#### Manual

- [x] 1.6 Karol akceptuje streszczenie migracji po ludzku

### Phase 2: Serwer gry

#### Automated

- [ ] 2.1 Bramka zielona: `npm run lint`, `npx astro check`, `npm test`, `npm run build`
- [ ] 2.2 Job `smoke` zielony w CI z nowymi krokami, w tym krokiem o braku tekstu u innego gościa
- [ ] 2.3 Jobs `db` i `ci` zielone

### Phase 3: Ekrany

#### Automated

- [ ] 3.1 Bramka zielona: `npm run lint` (z `scripts/ui-literals.mjs`), `npx astro check`, `npm test`, `npm run build`
- [ ] 3.2 Job `e2e` zielony w CI, w tym `tests/e2e/proposals.spec.ts` w projektach `chromium` i `phone`
- [ ] 3.3 Próbny alarm C trafia dokładnie: `propose.ts` bez dzwonka (import `ringLobby` usunięty razem z wywołaniem; czerwony tylko `proposals.spec.ts`, potem revert i zielone CI)

#### Manual

- [ ] 3.4 Karol wybiera wariant na zrzutach
- [ ] 3.5 Karol akceptuje gotowe ekrany na zrzutach, telefon i laptop

### Phase 4: Wdrożenie

#### Automated

- [ ] 4.1 Na PR zielone `ci`, `smoke`, `db` i `e2e`
- [ ] 4.2 `npx supabase db push --dry-run` pokazuje tylko migrację tej zmiany, a po `db push` `npx supabase migration list` jest zgodny
- [ ] 4.3 Na `main` zielone `ci`, `smoke`, `db`, `e2e` i Workers Builds
- [ ] 4.4 `BASE_URL=https://most-likely-to.charlesonthewave.workers.dev npm run smoke` zielony

#### Manual

- [ ] 4.5 Karol na telefonie i laptopie przechodzi drogę: propozycja w poczekalni, zatwierdzenie po starcie, pytanie w następnej rundzie, odrzucenie, wykorzystany limit
- [ ] 4.6 Przy grze z ekipą: propozycje nie rozbijają rytmu wieczoru, a prowadzący nadąża z decyzjami
