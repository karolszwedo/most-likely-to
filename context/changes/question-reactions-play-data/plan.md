# Kciuki na odsłonie i zbiorcze dane o pytaniach — plan implementacji

## Overview

S-11 (FR-016, FR-018): gracz jednym dotknięciem daje kciuk w górę lub w dół na ekranie odsłony, nieobowiązkowo i bez
blokowania prowadzącego, a baza zbiera o każdym pytaniu z bazy zbiorcze liczniki: odsłony, głosy, wstrzymania,
skupienie głosów, pominięcia, kciuki, wystawienia na liście i usunięcia z niej. Liczniki nie mają pokoju, gracza ani
czasu, więc przetrwają skasowanie gry (FR-019, S-13) i zasilą dobór pytań (S-12). S-11 idzie przed pierwszym wieczorem
z ekipą, bo dane zbierają się dopiero od wdrożenia.

## Current State Analysis

Pełny research: `context/changes/question-reactions-play-data/research.md`. Najważniejsze:

- Odsłonę renderuje `src/components/room/RoundReveal.tsx` (pytanie, region „Wynik”, u hosta przyklejony pasek
  `HostActions`); ekran rundy ma `key={view.round.number}` (`RoomScreen.tsx:190,204,221`), więc stan lokalny zeruje się
  z każdą rundą.
- Akcja gracza to wzór głosu: `room-actions.ts` → `POST /api/rooms/<id>/vote` → `castVote` (`server.ts:325-339`) →
  `cast_vote` (`supabase/migrations/20261020205751_round_number_required.sql:87-225`: token, blokada pokoju, host albo
  gość, `round_over` przy starym numerze pytania) → dzwonek.
- Odsłona dzieje się tylko w `private.finish_round` (`supabase/migrations/20261014101922_first_live_round.sql:182-213`),
  wołanej przez `cast_vote` (`:220` w `…round_number_required.sql`) i `reveal_round` (`:285`, tylko z fazy `voting`).
- Pominięcie: `skip_round` (`supabase/migrations/20261015122252_full_game_evening.sql:140-203`). Start z listą:
  `start_game` (`supabase/migrations/20261024094002_question_list_review.sql:400-471`). Następne pytanie: `next_round`
  (`…full_game_evening.sql:79-135`). Sprzątanie stanu rundy: `private.drop_round_state`
  (`supabase/migrations/20261022132240_latecomer_admission.sql:69-84`), wołana przez `end_game`, „Nową grę”
  (`create_room`) i sprzątanie co godzinę.
- Baza nie zna katalogu pytań; id `<kategoria>-<NNN>` nigdy nie wraca (`src/data/questions.ts:5-10`). Runda pytania
  własnego albo poprawionego ma `question_id = null` (`…question_list_review.sql:437`).
- Każda dzisiejsza tabela wisi na pokoju albo graczu; nie ma tabeli globalnej.
- Smoke na produkcji (`scripts/smoke.mjs`) gra prawdziwe pytania z bazy: odsłania pytanie 1 i pomija pytanie 2
  (`:408`) przy każdym uruchomieniu. Bez wykluczenia jego gier liczniki dostawałyby co wdrożenie fałszywe odsłony i
  pominięcia.

## Desired End State

- Na ekranie odsłony każdy gracz w pokoju (także host i spóźniony wpuszczony w tej rundzie) widzi dwa przyciski:
  „Dobre pytanie” i „Słabe pytanie” (ikony kciuków). Dotknięcie zaznacza, drugie dotknięcie tego samego zdejmuje,
  dotknięcie drugiego przełącza. Nikt inny nie widzi cudzego kciuka ani liczby kciuków. Pasek hosta działa bez zmian.
- W bazie `private.question_stats` ma jeden wiersz na pytanie z bazy z sumami. Kciuki rundy trafiają tam dopiero przy
  „Następne pytanie”, końcu gry, „Nowej grze” albo sprzątaniu; w trakcie odsłony leżą w nielogowanej
  `private.round_reactions` i są kasowane przy zsypie.
- Gry konta smoke nie zasilają liczników.
- Weryfikacja: pgTAP (katalog, uprawnienia, scenariusze z przyrostami liczników), testy bazy przez REST (odmowy
  kciuka), oracle RPC, test E2E z kciukiem; po wdrożeniu smoke 77/77 i ręczny test w zbiorczej grze Karola.

### Key Discoveries:

- `finish_round` biegnie raz na rundę w sprawdzonych ścieżkach (`…round_number_required.sql:220,285`), pod blokadą
  pokoju; `round_results` ma wiersz dla każdego uprawnionego, z zerami (`…first_live_round.sql:200-204`).
- Odmowy w RPC to dane `{ok:false, reason}`, a nie wyjątki, więc transakcja się zatwierdza: każdy dopisek do liczników
  musi stać po wszystkich odmowach (`…question_list_review.sql:446-460`, `…full_game_evening.sql:176-192`).
- `next_round` zwraca `no_questions`, gdy `open_next_round` nie otworzy rundy (`…full_game_evening.sql:128-131`); runda
  zostaje wtedy odsłonięta, a kciuki mogą jeszcze przychodzić.
- Skan pgTAP każdej tabeli `private`: bez grantów, poza publikacją, bez kolumn daty/czasu, identity i `nextval`
  (`supabase/tests/round_creator_view.test.sql:366-385, :693-700`).
- Pułapka `xmin`: wiersze z jednej transakcji mają wspólny numer (`context/archive/2026-10-13-first-live-round/research.md:99`),
  stąd zsyp kciuków w transakcji prowadzącego, a nie licznik w transakcji gracza.
- `tests/unit/room-rpc-gate.test.ts:33-133` wymaga wiersza `SQL_SIGNATURES` i przypadku `CASES` dla nowego RPC w tej
  samej zmianie co migracja (`context/foundation/test-plan.md:145`).

## What We're NOT Doing

- Liczby kciuków dla pokoju i dzwonek po kciuku (decyzja Karola 2026-10-26: pokój ich nie widzi; reakcje „na pokaz” to
  emotki, FR-023, osobna zmiana).
- Kciuk po przeładowaniu strony: bez nowego pola w `room_lobby`; po przeładowaniu przyciski są puste, a ponowne
  dotknięcie nadpisuje wybór w bazie.
- Ocena pytania, wagi i progi (S-12) ani przeniesienie katalogu pytań do bazy.
- Liczniki dla pytań własnych i poprawionych (brak `question_id`; decyzja S-06).
- Rund porzuconych przez sprzątanie w fazie głosowania i liczenia usunięć w grach, które nie wystartowały.
- Uzupełniania liczników z gier rozegranych przed wdrożeniem.
- Nowych kodów odmów w `errors.ts` (używamy istniejących).
- Zmian w smoke (oprócz tego, że jego gry nie liczą się do danych) i decyzji o S-04 (osobny wpis w roadmapie).

## Implementation Approach

Baza najpierw: jedna migracja z trzema tabelami, nowym RPC kciuka, pomocnikami i dopiskami w pięciu istniejących
funkcjach (kopie ich ostatnich definicji). W tej samej fazie opakowanie RPC w Workerze, bo wymaga go oracle RPC. Potem
trasa, ekran (warianty wyglądu do wyboru Karola), podglądy, E2E. Na końcu wdrożenie: migracja przed kodem.

## Critical Implementation Details

- **Kopie funkcji.** `create or replace` pięciu funkcji musi wyjść od ich ostatnich definicji (anchory wyżej) z
  dopiskami i niczym więcej. Po napisaniu porównaj każdą z poprzednią wersją (diff ciał, krok 1.4: tylko linie `+`);
  pgTAP pilnuje jednej wersji funkcji, nie treści. Łatwo zgubić np. kasowanie `join_requests` w `drop_round_state`
  (`…latecomer_admission.sql:81-82`).
- **Granty bez zmian.** `skip_round`, `start_game` i `next_round` są dziś tylko dla `authenticated`
  (`…full_game_evening.sql:539-540`, `…question_list_review.sql:753`), a pgTAP to przypina
  (`round_creator_view.test.sql:707-720`); `anon` dostaje wyłącznie nowe `react_round`.
- **Granica „stan w toku”.** Kciuki leżą w nielogowanej `round_reactions` od odsłony do zsypu: zwykle do „Następne
  pytanie”, najdłużej ok. 13 h przy grze porzuconej na odsłonie (sprzątanie); awaria bazy je kasuje. Zapisać to w
  komentarzu migracji i w nagłówku pgTAP.
- **Kolejność upsertów.** Upsert wielu wierszy w `start_game` (do ok. 15) i w zsypie idzie `order by question_id`, żeby
  dwie gry startujące naraz z tymi samymi pytaniami nie zakleszczyły się.
- **Kolejność w `next_round`.** Zsyp kciuków dopiero po udanym `open_next_round`; przy `no_questions` kciuki czekają na
  koniec gry (inaczej gracz, który zmieni kciuk po nieudanym „Następne pytanie”, liczyłby się dwa razy).
- **Delty w pgTAP.** Tabela liczników jest globalna, a w jobie `db` inne testy grają te same id, więc scenariusze
  porównują przyrost względem stanu sprzed scenariusza, nie wartości bezwzględne.
- **UUID konta smoke.** Wartość do `private.stats_excluded_hosts` daje Karol (panel Supabase → Authentication → Users →
  wiersz z adresem `SMOKE_EMAIL` z `.dev.vars` → User UID) przed pushem gałęzi. Bez klucza obcego do `auth.users`, bo
  lokalnej bazie w CI tego konta brak. Zły, ale poprawny UUID przejdzie CI po cichu, dlatego krok 3.5 sprawdza liczniki
  na produkcji przed i po smoke.

## Faza 1: Kciuk i liczniki w bazie

### Overview

Migracja dodaje tabele, RPC `react_round`, zsyp kciuków i liczniki odsłon, pominięć i list; testy bazy i oracle RPC to
pilnują; Worker dostaje opakowanie RPC.

### Changes Required:

#### 1. Migracja

**File**: `supabase/migrations/<timestamp>_question_play_data.sql` (przez `npx supabase migration new question_play_data`)

**Intent**: Liczniki pytań bez śladu pokoju, gracza i czasu; kciuk tylko na czas odsłony, zsypany w transakcji
prowadzącego albo sprzątania.

**Contract**:

- `private.question_stats` (logowana): `question_id text primary key` z checkiem formatu `^[a-z0-9-]+-[0-9]{3}$`;
  liczby całkowite `not null default 0`: `revealed`, `eligible`, `ballots`, `abstained`, `scored`, `scored_eligible`,
  `scored_votes`, `scored_top`, `skipped`, `listed`, `removed`, `thumbs_up`, `thumbs_down`. Bez kluczy obcych i kolumn
  czasu. Komentarz: dane zbiorcze FR-016, zostają po skasowaniu gry (FR-019); `eligible` i `scored_eligible` (liczba
  uprawnionych) pozwolą S-12 liczyć udział i skupienie względem wielkości grupy, bo wyników rund po S-13 już nie będzie.
- `private.round_reactions` (`unlogged`): `round_id uuid not null references private.rounds(id) on delete cascade`,
  `player_id uuid not null` (bez klucza obcego, jak `round_voters`), `up boolean not null`, klucz `(round_id, player_id)`.
- `private.stats_excluded_hosts`: `user_id uuid primary key`, bez klucza obcego; jeden wiersz: UUID konta smoke
  (komentarz: konto smoke gra prawdziwe pytania przy każdym wdrożeniu).
- Każda z trzech: RLS włączone, `revoke all … from public, anon, authenticated`, bez grantów i polityk.
- `private.counts_for_stats(p_room_id uuid) returns boolean` (`security invoker`, `search_path = ''`): host pokoju nie
  jest w `stats_excluded_hosts`.
- `private.fold_reactions(p_room_id uuid) returns void` (`security invoker`): dla rund pokoju z `question_id` i przy
  `counts_for_stats` dodaje do `thumbs_up`/`thumbs_down` liczby kciuków każdej rundy (upsert po `question_id`), potem
  kasuje wszystkie `round_reactions` rund tego pokoju (także rund bez `question_id`).
- `public.react_round(p_room_id uuid, p_round integer, p_reaction text, p_player_token text default null) returns jsonb`
  (`security definer`, właściciel `postgres`, `search_path = ''`, `execute` dla `anon, authenticated`). Kolejność jak
  `cast_vote` (`…round_number_required.sql:111-173`): zły format tokenu albo `p_reaction` spoza `up|down|none` →
  wyjątek 22023; blokada pokoju `for update`; tożsamość: host przez `auth.uid()` i jego wiersz gracza albo gość przez
  `player_secrets.token_hash`; brak → `room_unknown`; `closed` → `room_closed`; inny niż `playing` → `no_round`;
  najnowsza runda; `p_round` pusty albo inny → `round_over`; faza `skipped` → `round_over`, `voting` → `no_round`;
  `revealed`: `up`/`down` → upsert wiersza gracza, `none` → usunięcie. Bez sprawdzania `eligible` (ocenia pytanie, nie
  wynik). Zwraca `{ok:true}`.
- `create or replace private.finish_round` (`…first_live_round.sql:182-213`): po wstawieniu `round_results`, gdy runda
  ma `question_id` i `counts_for_stats`: `revealed + 1`, `eligible + cardinality(rounds.eligible)`, `ballots + v_ballots`,
  `abstained + coalesce(v_abstained, 0)`; przy sumie głosów na osoby (`sum(round_results.votes)` tej rundy) ≥ 2 także
  `scored + 1`, `scored_eligible + cardinality(rounds.eligible)`, `scored_votes + suma`, `scored_top + max(votes)`.
- `create or replace public.skip_round` (`…full_game_evening.sql:140-203`): po `phase = 'skipped'`, przed
  `open_next_round`, gdy runda ma `question_id` i `counts_for_stats`: `skipped + 1`. Urny nie czyta (D3).
- `create or replace public.start_game` (`…question_list_review.sql:400-471`): po odmowie `not_enough_players`, przed
  wstawieniem rundy, gdy pokój ma listę i `counts_for_stats`: dla wpisów z `question_id` i bez `text`: `listed + 1`, a
  dla usuniętych spośród nich także `removed + 1` (upsert `order by question_id`).
- `create or replace public.next_round` (`…full_game_evening.sql:79-135`): po udanym `open_next_round`
  `perform private.fold_reactions(p_room_id)`.
- `create or replace private.drop_round_state` (`…latecomer_admission.sql:69-84`): na początku zsyp kciuków
  (`select private.fold_reactions(p_room_id);`), potem dotychczasowe kasowanie.
- Na końcu pliku jak w poprzednich migracjach: `alter function … owner to postgres` dla funkcji `security definer`,
  `revoke execute … from public, anon, authenticated` dla każdej nowej i zmienionej funkcji, potem `grant execute`
  dokładnie jak dotąd: `skip_round`, `start_game`, `next_round` tylko `authenticated`; nowe `react_round` dla
  `anon, authenticated`; pomocniki `private` bez grantów. Komentarz migracji opisuje granicę kciuków (Critical
  Implementation Details).

#### 2. Opakowanie RPC w Workerze

**File**: `src/lib/rooms/server.ts`

**Intent**: Worker woła `react_round` tym samym torem co `castVote`.

**Contract**: `reactRound(supabase, roomId, round, reaction: "up" | "down" | "none", playerToken?)` → RPC `react_round`
z `p_room_id, p_round, p_reaction, p_player_token`, sprawdzenie kształtu odpowiedzi jak przy `castVote`
(`server.ts:325-339`); nagłówek z listą migracji (`server.ts:16-21`) dopisuje nową.

#### 3. Oracle RPC

**File**: `tests/unit/room-rpc-gate.test.ts`

**Intent**: Nazwy i argumenty RPC z Workera zgodne z SQL (`test-plan.md:145`).

**Contract**: wiersz `react_round` w `SQL_SIGNATURES` z komentarzem plik:linia nowej migracji; komentarze wierszy
`start_game`, `next_round`, `skip_round` wskazują nową migrację (sygnatury bez zmian); przypadek w `CASES` („Kciuk”).
Ręczna tabela sygnatur w `context/changes/refactor-opportunities/plan.md` to osobna zmiana: bez edycji tutaj.

#### 4. pgTAP

**File**: `supabase/tests/round_creator_view.test.sql`

**Intent**: Widok twórcy gry: nowe tabele bez dostępu ról, kciuki znikają przy zsypie, liczniki rosną tylko tak, jak
mówi plan.

**Contract**: nowy `plan(N)` i nagłówek obiektów; `table_privs_are`, `publication_of`, `order_columns` i `columns_are`
dla trzech tabel; `round_reactions` nielogowana, `question_stats` logowana; `function_facts` dla `react_round`,
`fold_reactions`, `counts_for_stats`; jedna wersja: `react_round` przez `pg_temp.versions_of`, pomocniki `private`
przez jego wariant dla schematu `private` (dziś szuka tylko w `public`, `round_creator_view.test.sql:476-485`); nagłówek
opisuje granicę kciuków. Scenariusze (przyrosty względem stanu sprzed scenariusza):

- odsłona z kciukami (host w górę, gość w dół, drugi gość w górę i potem zdejmuje) i „Następne pytanie”: zero wierszy
  `round_reactions` tego pokoju; `thumbs_up + 1`, `thumbs_down + 1`, `revealed + 1`, `ballots`/`abstained` z wyroczni,
  `scored` według reguły ≥ 2 głosów na osoby;
- odsłona z jednym głosem: `revealed + 1`, `scored` bez zmian;
- kciuki przed „Zakończ grę”, przed „Nową grą” i przed sprzątaniem: zsypane, `round_reactions` puste;
- `eligible` i `scored_eligible` rosną o liczbę uprawnionych rundy;
- „Następne pytanie” z `no_questions`: kciuki zostają do końca gry, liczone raz;
- pominięcie: `skipped + 1`, `revealed`, `ballots` bez zmian;
- start z listą (wpis usunięty, wpis poprawiony i usunięty, własne pytanie): `listed` i `removed` tylko dla wpisów z
  bazy bez własnego tekstu; pokój zamknięty z poczekalni nic nie dodaje;
- runda pytania poprawionego: kciuki skasowane, liczniki bez zmian;
- pokój hosta z `stats_excluded_hosts` (wiersz dodany w teście): liczniki bez zmian, kciuki i tak skasowane.

#### 5. Testy bazy przez REST

**File**: `tests/db/reactions.test.ts` (nowy, jeden host), `tests/db/support/rounds.ts`, `tests/db/round-anonymity.test.ts`,
`context/foundation/test-plan.md`

**Intent**: Odmowy i zgody kciuka z perspektywy gościa i hosta; nowe tabele niewidoczne przez REST.

**Contract**: opakowanie `reactRound` w `rounds.ts`. Przypadki: gość i host na odsłoniętej najnowszej rundzie →
dokładnie `{ok:true}`;
`up` → `down` → `none` → ok; spóźniony wpuszczony w trakcie rundy → ok; runda w głosowaniu → `no_round`; stary numer po
„Następne pytanie” → `round_over`; po końcu gry → `room_closed`; token z innego pokoju → `room_unknown`; zły
`p_reaction` i zły format tokenu → błąd 22023; po kciukach `room_lobby` ma dokładnie `REVEALED_ROUND_KEYS`.
`ROUND_TABLES` (`round-anonymity.test.ts:62`) dostaje trzy nowe tabele. W `test-plan.md` licznik rejestracji 15 z 30
(`:186-188`) i punkt §6 o licznikach pytań (tylko pgTAP, przyrosty, gry smoke wykluczone).

#### 6. Próba złamania strażnika

**Intent**: Dowód, że pgTAP łapie kciuki zostawione po rundzie (`test-plan.md` §6.2, `:194-211`).

**Contract**: tymczasowy commit, w którym `fold_reactions` nie kasuje `round_reactions` → job `db` czerwony na
scenariuszu zsypu → revert. Tymczasowej migracji nigdy nie wypychamy przez `db push`.

### Success Criteria:

#### Automated Verification:

- `npm run lint`, `npx astro check`, `npm test` (z oracle RPC), `npm run build` przechodzą lokalnie
- CI na gałęzi: job `db` zielony (pgTAP i `tests/db`)
- Diff ciał pięciu zmienionych funkcji względem ich poprzednich definicji pokazuje tylko dopisane linie
- Próba złamania: `db` czerwony na zsypie bez kasowania kciuków, potem zielony po revercie

#### Manual Verification:

- Karol podaje UUID konta smoke z panelu Supabase i jest ono w migracji przed pushem gałęzi

**Implementation Note**: Testy bazy działają tylko w CI (`db`); push gałęzi za zgodą Karola.

---

## Faza 2: Kciuki na ekranie odsłony

### Overview

Trasa `/react`, akcja klienta, kciuki na odsłonie w wariancie wybranym przez Karola, podglądy, test E2E i słownik.

### Changes Required:

#### 1. Trasa i walidacja ciała

**File**: `src/pages/api/rooms/[id]/react.ts` (nowy)

**Intent**: Kciuk przechodzi tym samym strażnikiem co głos, bez dzwonka.

**Contract**: kopia `vote.ts` bez `ringLobby`; ciało `{ reaction: "up" | "down" | "none", round }`; walidator
`bodyReaction` w pliku trasy, jak `voteTarget` w `vote.ts:10`, zły → `invalid_body`; `actionAnswer` z `op: "react"`
(kierunek nigdy w logu).

#### 2. Akcja klienta

**File**: `src/components/room/room-actions.ts`, `src/components/room/RoomScreen.tsx`, `src/components/room/RoundReveal.tsx`

**Intent**: Odsłona dostaje `onReact(reaction, round)`; akcja nie przenosi fokusu.

**Contract**: `"react"` w unii `RoomAction`; `react = act("react", { reaction, round })`, poza `VIEW_CHANGING`; podgląd
bez sieci jak inne akcje.

#### 3. Kontrolka kciuków i wybór wyglądu

**File**: `src/components/room/QuestionReaction.tsx` (nowy), `RoundReveal.tsx`

**Intent**: Dwa przyciski z ikonami `ThumbsUp`/`ThumbsDown` z `lucide-react`, `aria-pressed`, nazwy „Dobre pytanie” i
„Słabe pytanie” w grupie z etykietą; tylko tokeny i istniejący `Button`.

**Contract**: stan wyboru w pamięci komponentu (zeruje się z rundą); dotknięcie wysyła i blokuje oba przyciski do
odpowiedzi; ok → zaznaczenie; drugie dotknięcie zaznaczonego → `none`; odmowa → krótki tekst z `roomErrorMessage` pod
przyciskami, przyciski znów aktywne; nic nie blokuje paska hosta. Najpierw 2–3 warianty umiejscowienia jako stany
`/dev/room-states` (np. A: osobny blok pod „Wynikiem”, nad paskiem hosta; B: pod pytaniem; C: przy pytaniu w jednej
linii). Zrzuty telefonu w prawdziwej wielkości i całego okna laptopa 1:1 na stronie „Co oceniasz” w Chrome Karola
(pamięć: zrzuty do oceny). Karol wybiera; zostaje tylko wybrany wariant.

#### 4. Podglądy

**File**: `src/pages/dev/room-states.astro`, `src/pages/dev/room-window.astro`, `RoomScreen.tsx` (`ScreenPreview`)

**Intent**: Każdy stan kciuka widać bez gry (`AGENTS.md`, UI).

**Contract**: stany odsłony: gość bez kciuka, gość z kciukiem w górę, host z kciukiem w dół, wysyłanie, odmowa;
flaga podglądu kciuka w `ScreenPreview`. W `room-window` istniejące próbki odsłony pokazują kciuki; pasek hosta ich nie
zasłania.

#### 5. Test E2E

**File**: `tests/e2e/game.spec.ts`, `tests/e2e/support/round.ts`

**Intent**: Dowód z perspektywy gracza.

**Contract**: na odsłonie pytania 1, zaraz po pojawieniu się tabeli wyniku (`game.spec.ts:84-86`), a przed blokiem z
przeładowaniem gościa B (`:106-121`, mierzy dojście nowego pytania w `LOBBY_POLL_MS`), gość A dotyka „Dobre pytanie”
(`aria-pressed=true`), potem znów (`false`); host przechodzi „Następne pytanie” bez przeszkód; asercja widoczności
„Następne pytanie” przy oknie `lg` 400 px (`game.spec.ts:93-102`) zostaje.

#### 6. Słownik

**File**: `context/domain/glossary.md`

**Intent**: Nazwy w kodzie zgodne ze słownikiem.

**Contract**: „reakcja” → `react_round`, `round_reactions`, `QuestionReaction`; nowy termin „dane o pytaniu” →
`question_stats` (sumy, nie ocena; „ocena pytania” zostaje dla S-12).

### Success Criteria:

#### Automated Verification:

- `npm run lint` (z `scripts/ui-literals.mjs`), `npx astro check`, `npm test`, `npm run build` przechodzą
- `npx playwright test --list` pokazuje test wieczoru
- CI na gałęzi: `e2e` zielony

#### Manual Verification:

- Karol wybiera wariant kciuków ze zrzutów (telefon i laptop)
- Podgląd `/dev/room-states` i `/dev/room-window` przeklikany lokalnie po wyborze wariantu

**Implementation Note**: Lokalnie kciuk nie dojdzie do bazy przed `db push` (`.dev.vars` wskazuje produkcję), więc
działanie sprawdzają podglądy i E2E w CI.

---

## Faza 3: Wdrożenie

### Overview

Pełny cykl z pliku zasad, z migracją przed kodem.

### Changes Required:

#### 1. Wdrożenie

**Intent**: Baza, potem kod (`context/deployment/deploy-plan.md`).

**Contract**: push gałęzi (zgoda) → PR → zielone `ci`/`smoke`/`db`/`e2e` → `npx supabase db push --dry-run`, `db push`,
`migration list` (zgoda, nie z eduroam) → scalenie przez Karola → smoke na produkcji (zgoda). Stary Worker z nową bazą
działa (zmiany addytywne, sygnatury bez zmian).

### Success Criteria:

#### Automated Verification:

- CI na PR zielone: `ci`, `smoke`, `db`, `e2e`
- `npx supabase migration list` pokazuje nową migrację na produkcji przed scaleniem

#### Manual Verification:

- Smoke na produkcji zielony po scaleniu (za zgodą)
- Karol w zbiorczej grze: kciuk działa na telefonie i laptopie, zdejmuje się drugim dotknięciem, znika po „Następne
  pytanie”, host przechodzi dalej bez czekania
- Liczniki na produkcji: `select sum(revealed), sum(skipped), sum(thumbs_up + thumbs_down) from private.question_stats`
  (tylko odczyt, edytor SQL w panelu) bez zmian po smoke i większe po zbiorczej grze Karola

**Implementation Note**: Push, `db push` i smoke tylko za zgodą Karola; scala wyłącznie Karol
(`! gh pr merge <n> --merge`).

---

## Testing Strategy

### Unit Tests:

- Oracle RPC: `react_round` i komentarze zmienionych funkcji

### Integration Tests:

- pgTAP: katalog, uprawnienia i scenariusze liczników z przyrostami
- `tests/db/reactions.test.ts`: zgody i odmowy kciuka jako gość, host i spóźniony
- E2E: kciuk na odsłonie, host nie czeka

### Manual Testing Steps:

1. Odsłona na telefonie: dotknij „Dobre pytanie”, potem „Słabe pytanie”, potem znowu „Słabe pytanie” (zdjęte)
2. Host na laptopie klika „Następne pytanie” w trakcie, gdy ktoś wysyła kciuk: nic nie blokuje
3. Nowa odsłona: przyciski puste

## Performance Considerations

Jeden upsert na rundę w `finish_round`, `skip_round` i przy zsypie; jedno wywołanie RPC na dotknięcie z blokadą pokoju
jak głos. Przy 20 graczach bez znaczenia.

## Migration Notes

Migracja addytywna: trzy nowe tabele, nowe funkcje, dopiski w pięciu funkcjach bez zmiany sygnatur. Wycofanie kodu to
revert PR; dopiski w bazie mogą zostać (liczą dalej). Liczniki startują od zera w chwili `db push`.

## References

- Research: `context/changes/question-reactions-play-data/research.md`
- Wzór RPC gracza: `supabase/migrations/20261020205751_round_number_required.sql:87-225`
- Wzór urny: `supabase/migrations/20261014101922_first_live_round.sql:141-213`
- Wzór planu z migracją: `context/archive/2026-10-25-game-summary/plan.md`

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: Kciuk i liczniki w bazie

#### Automated

- [x] 1.1 `npm run lint`, `npx astro check`, `npm test` (z oracle RPC), `npm run build` przechodzą lokalnie — 66b429a
- [x] 1.2 CI na gałęzi: job `db` zielony (pgTAP i `tests/db`) — 1bb1506
- [x] 1.4 Diff ciał pięciu zmienionych funkcji względem ich poprzednich definicji pokazuje tylko dopisane linie — 66b429a
- [x] 1.5 Próba złamania: `db` czerwony na zsypie bez kasowania kciuków, potem zielony po revercie — 0a06624, 1bb1506

#### Manual

- [x] 1.3 Karol podaje UUID konta smoke z panelu Supabase i jest ono w migracji przed pushem gałęzi — 8db6c2e

### Phase 2: Kciuki na ekranie odsłony

#### Automated

- [x] 2.1 `npm run lint` (z `scripts/ui-literals.mjs`), `npx astro check`, `npm test`, `npm run build` przechodzą — 55e96f8
- [x] 2.2 `npx playwright test --list` pokazuje test wieczoru — 55e96f8
- [x] 2.3 CI na gałęzi: `e2e` zielony — 1bb1506

#### Manual

- [x] 2.4 Karol wybiera wariant kciuków ze zrzutów (telefon i laptop) — 55e96f8
- [x] 2.5 Podgląd `/dev/room-states` i `/dev/room-window` przeklikany lokalnie po wyborze wariantu — 55e96f8

### Phase 3: Wdrożenie

#### Automated

- [x] 3.1 CI na PR zielone: `ci`, `smoke`, `db`, `e2e` — 1bb1506
- [x] 3.2 `npx supabase migration list` pokazuje nową migrację na produkcji przed scaleniem — 1bb1506

#### Manual

- [x] 3.3 Smoke na produkcji zielony po scaleniu (za zgodą) — PR #26 `2c19ade`, Workers Builds success, smoke raz, wszystkie kroki zielone
- [x] 3.4 Karol w zbiorczej grze: kciuk działa na telefonie i laptopie, zdejmuje się drugim dotknięciem, znika po „Następne pytanie”, host przechodzi dalej bez czekania
- [x] 3.5 Liczniki na produkcji: `select sum(revealed), sum(skipped), sum(thumbs_up + thumbs_down) from private.question_stats` (tylko odczyt, edytor SQL w panelu) bez zmian po smoke i większe po zbiorczej grze Karola. Pierwsza połowa sprawdzona 26.10: tabela pusta (0 wierszy) przed smoke i po nim; druga połowa 10.11 (po grach ze znajomymi): 49 wierszy, 45 odsłon, 2 pominięcia, 10 kciuków (wiersze bez odsłony i pominięcia to pytania usunięte z listy przed startem)
