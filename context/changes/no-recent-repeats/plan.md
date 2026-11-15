# Bez powtórek z gier hosta (S-20) Implementation Plan

## Overview

Gra losuje najpierw pytania, których host jeszcze nie zna ze swoich innych gier, a dopiero po nich pytania znane mu najdawniej. Działa to jak talia: zagrane karty idą pod spód. Dzięki temu ekipa na wieczorze nie dostaje pytań, które host już widział w grach testowych i poprzednich grach (roadmapa S-20, PRD FR-015, Open Roadmap Question 5). Zmienia się tylko kolejność, w której baza bierze kandydatów od Workera, w czterech miejscach losowania. Liczniki, ekrany i dane zostają bez zmian.

**Decyzje (2026-11-15):**

- **Karol** (`research.md`, Open Questions; `change.md`):
  1. Gdy pytania nieznane hostowi się skończą, gra bierze najpierw te znane najdawniej (decyzja A), a nie zapomina historii. Gdy świeżych jest mniej, niż gra potrzebuje, idą najpierw świeże, a reszta z najdawniej znanych.
  2. Liczą się wszystkie gry hosta, bez limitu „N ostatnich”.
  3. Pominięte pytanie i runda przerwana bez odsłony liczą się jako zagrane.
  4. Pozycje usunięte z listy przed startem też się liczą (host je zna), także przeredagowane.
  5. Skasowana gra (S-13) wypada z historii razem ze swoimi rundami.
- **Sesja** (Karol przyjął „0 pytań, decyzje techniczne moje”):
  1. **Jeden pomocnik kolejności.** Nowa funkcja `private.ordered_candidates(p_room_id, p_candidates)` zwraca kandydatów z wyboru pokoju (`private.picked_candidates`) z nowym `place`, czyli kolejnością losowania. Biorą ją `open_question_list`, `draw_list_question`, `private.unplayed_candidates` (a przez nią `private.open_next_round` i `more_questions`) i `start_game`. Reguła ma jedną definicję, jak FR-005 w S-17.
  2. **Pytanie znane hostowi** to numer z `private.rounds.question_id` albo `private.game_questions.question_id` innego pokoju tego samego hosta (`rooms.host_id`), w każdym statusie, także pokoju zamkniętego w poczekalni. Kiedy je poznał: najpóźniejsze `coalesce(started_at, created_at)` tych pokoi. Kolejność losowania: najpierw nieznane, w kolejności Workera; potem znane, od poznanych najdawniej; przy remisie kolejność Workera.
  3. **W liście 15 pytań świeże zajmują pierwsze pozycje, a znane idą na koniec**, bez dodatkowego tasowania (talia Karola). Gdy gra skończy się wcześniej, znane pytania nie padną.
  4. **`start_game` dostaje kandydatów.** Czwarty parametr to `p_candidates text[] default null`, a `p_question_id` dostaje `default null`. W grze bez listy funkcja z kandydatami bierze pierwszego w kolejności losowania, a gdy żaden nie przechodzi, odpowiada `no_questions`. Bez kandydatów sprawdza `p_question_id` jak dziś (`invalid_question`). Stara ścieżka zostaje dla starego Workera (okienko między `db push` a scaleniem, cofnięcie wersji Workera) i dla testów, które ustalają pierwsze pytanie. Starą wersję `(uuid, text, text)` usuwamy, bo pgTAP wymaga jednej wersji funkcji.
  5. **„Zacznij grę” wysyła całą potasowaną pulę** (`shuffledQuestions`), jak pozostałe pięć endpointów. `drawQuestion` i `drawFrom` znikają, a ich testy na prawdziwej bazie pytań przechodzą na `questionPool`.
  6. **Indeks `public.rooms (host_id)`.** Dziś jest tylko częściowy unikat otwartych pokoi, którego odczyt gier zamkniętych nie użyje.
  7. **Testy z jednym hostem na wiele gier.** `game-length.test.ts` kasuje wcześniejsze gry hosta przed każdym następnym pokojem, a `proposals.test.ts` dostaje kandydatów listy, których host nie zna. Nowy plik `tests/db/no-recent-repeats.test.ts` ma jednego hosta (konto 26 z 30 na przebieg), a pgTAP dostaje scenariusz z dwoma hostami i cofniętym czasem.
  8. Żaden ekran się nie zmienia, więc nie ma zrzutów do oceny.

## Current State Analysis

- **Kolejność kandydatów ustala dziś Worker.** Każdy z pięciu endpointów wysyła całą potasowaną pulę (`shuffledPool`, `src/lib/rounds/draw.ts:58-69`; `question-list.ts:33`, `question-draw.ts:34`, `next.ts:44`, `skip.ts:40`, `more.ts:47-53`). Baza bierze pierwszego pasującego po `place` (D1 W-B, `context/archive/2026-10-15-full-game-evening/research.md:106`).
- **Cztery miejsca wybierają pytanie:**
  - lista na start: `open_question_list`, pierwszych 15 różnych po `min(place)` (`supabase/migrations/20261113162527_question_base_checks.sql:322-330`);
  - „Dolosuj pytanie”: `draw_list_question`, pierwszy spoza listy `order by c.place` (`:386-393`);
  - pytanie po liście przy „Następne pytanie”, „Pomiń pytanie” i „Jeszcze 5 pytań”: `private.open_next_round` bierze pierwszego z `private.unplayed_candidates` `order by c.place` (`20261107091322_game_length.sql:143-146`; `unplayed_candidates` w `20261113162527_question_base_checks.sql:70-84`);
  - pierwsze pytanie gry bez listy: Worker losuje jedno id (`src/pages/api/rooms/[id]/start.ts:34`), a `start_game(uuid, text, text)` tylko je sprawdza (`20261113162527_question_base_checks.sql:188`, `:235-240`).
- **Historia hosta już jest w bazie.** `rooms.host_id` to zawsze twórca gry. Rundy i lista zostają po końcu gry (`drop_round_state` i `close_stale_games` kasują tylko stan rundy, `20261104095452_guest_question_proposals.sql:384-439`). Znikają tylko z grą (`delete_game`, `20261110131123_host_game_history.sql:105-110`) albo z kontem hosta.
- **Przeredagowane pytanie z bazy** gra rundę z `question_id = null`; numer zostaje tylko na wierszu listy (`20261024094002_question_list_review.sql:11-12`). Historia z samych rund by je pominęła, więc liczymy też wiersze listy.
- **Czas:** `private.rounds` nie ma czasu ani sekwencji (`20261014101922_first_live_round.sql:111`), a pgTAP pilnuje, żeby tabele `private` nie miały kolumn czasu. Czas daje `rooms.started_at` z `created_at` w zapasie, jak w `host_games` (`20261110131123_host_game_history.sql:67`).

## Desired End State

- W każdym z czterech miejsc baza bierze najpierw kandydatów, których host nie zna z innych swoich gier, w kolejności Workera, a potem znanych, od poznanych najdawniej. Żaden kandydat nie wypada, więc „Liczba pytań”, „Jeszcze N pytań” i `questionsToDraw` liczą jak dziś.
- Gra bez listy dostaje pierwsze pytanie z bazy według tej samej kolejności: Worker wysyła pulę, a nie jedno id.
- Historia innego hosta, bieżący pokój i skasowane gry niczego nie przestawiają.
- Stary Worker działa z nową bazą (sygnatura z wartościami domyślnymi), więc kolejność wdrożenia to „baza, potem kod”.
- Sprawdzenie: nowy plik testów bazy z wyrocznią z decyzji Karola, scenariusz pgTAP, dwa próbne alarmy w CI, smoke na produkcji i Karola dwie listy pod rząd bez wspólnych pytań.

### Key Discoveries:

- `open_next_round` i `more_questions` nie wymagają zmian. Pierwsza bierze `order by c.place` z `unplayed_candidates` (`20261107091322_game_length.sql:143-146`), a druga liczy jej wiersze (`:249-250`). Wystarczy, że `unplayed_candidates` zwróci `place` w kolejności losowania przy tej samej sygnaturze (`create or replace`).
- Kod `no_questions` jest już odmową rundy z polskim tekstem „W wybranych kategoriach nie ma pytań…” (`src/lib/rooms/errors.ts:21`, `:79`). Worker przepuszcza każdy powód (`src/lib/rooms/server.ts:132`, `:397-401`), więc start z kandydatami nie wymaga zmian w TypeScript poza wywołaniem.
- pgTAP: `function_facts` bierze dokładne typy argumentów (`supabase/tests/round_creator_view.test.sql:496-525`). Na czerwono pójdą `function_facts('public.start_game(uuid, text, text)')` (`:1184`) i `versions_of('start_game')` (`:1390-1393`, `:1982-1986`). Nowy pomocnik potrzebuje dwóch asercji, jak `picked_candidates` (`:1977-1981`). Indeksów pgTAP nie sprawdza.
- pgTAP: cały plik to jedna transakcja, więc `now()` jest wszędzie ten sam i `started_at`/`created_at` remisują. Scenariusz „najdawniej” musi cofnąć czas jako właściciel (wzór `:2337-2342`), o minuty, w pokojach zamkniętych, żeby `close_stale_games` niczego nie zamknął. Przesuwa naraz `created_at` i `started_at`, bo reguła bierze `coalesce(started_at, created_at)` (wzór z `:2337-2342` cofa tylko `started_at`). Każdy `open_room` (`:162-193`) zakłada nowego hosta. Drugi pokój tego samego hosta daje dziś tylko `pg_temp.host_opens_new_room` (`:293-300`; `abandoned`, `listed`, `thumbs-new`, `stats-lobby`, `proposed-new`). Nic w nim nie losuje i nie zapisuje go w `test_rooms` (klucz główny to sam `key`, `:89`).
- tests/db: pliki biegną po kolei (`fileParallelism: false`), a każdy ma własnego hosta (`newHost`, `tests/db/support/clients.ts:33-46`). Psują się tylko:
  - `proposals.test.ts`: w pokoju 2 lista i rundy 1, 3 i 6 (`:744-765`, `:771-773`, `:794-796`), bo pokój 1 zagrał `na-co-dzien-001` i `-002`;
  - `game-length.test.ts`: pokoje 3–5 (`:434-501`, `:541-545`, `:577-668`), bo sześć pokoi gra na jednym hoście. W pokoju 3 `beforeAll` rzuci już na „Dolosuj pytanie” (`:445`).

  Pozostałe pliki trzymają: pierwszy pokój, start z `p_question_id`, same liczniki albo remis. `question-list.test.ts:549` trzyma tylko dlatego, że `list_full` jest sprawdzane przed szukaniem kandydata (`20261113162527_question_base_checks.sql:379-381`).

- Brama RPC (`tests/unit/room-rpc-gate.test.ts:43-212`) to ręczna tabela `{name, hasDefault}` z odnośnikiem do migracji. Przypadki startu (`:330-341`) porównują dokładny obiekt parametrów (`toStrictEqual`, `:577`).
- Smoke i e2e nie sprawdzają numerów ani kolejności pytań (`scripts/smoke.mjs`, `tests/e2e/*.spec.ts`), a smoke kasuje każdą zakończoną grę swojego konta (`scripts/smoke.mjs:908`). Zmiana ich nie rusza.
- Pytania 18+ w kategoriach testowych to `na-co-dzien-021…027, 038…040` (tak samo w `imprezy`). Zwykłe to `001…020` i `028…037`.

## What We're NOT Doing

- Bez wag z danych o pytaniach i bez odkładania słabych pytań (S-12, FR-017).
- Bez limitu „N ostatnich gier” i bez zapominania historii po czasie (decyzja Karola 2).
- Bez nowych tabel, kolumn i danych: historia pochodzi z istniejących `rooms`, `rounds` i `game_questions`. Bez kolumn czasu w `private`.
- Bez zmiany liczników (`private.question_count`, `more_questions`, `questionsToDraw`) i bez nowych kodów odmów. `no_questions` przy starcie z kandydatami jest już znanym kodem z tym samym tekstem.
- Bez zmian na ekranach: host nie widzi, które pytania zna.
- Bez historii ekipy ani gracza: liczy się konto hosta. Współhost w grze hosta nie wnosi swojej historii.
- Bez usuwania `p_question_id` ze `start_game` w tej zmianie (zgodność ze starym Workerem i testami).
- Zatwierdzone propozycje i własne pytania hosta (bez `question_id`) są poza historią.
- Bez wyjątku dla konta smoke (smoke i tak kasuje swoje gry).
- Bez zmian w `private.open_next_round` i `more_questions` (patrz Key Discoveries), bez edycji `context/domain/domain-distillation.md` i czegokolwiek w `context/archive/`.

## Implementation Approach

Najpierw baza, potem kod, potem dokumenty i wdrożenie, jak w S-17 i S-19. Faza 1 to jedna migracja: pomocnik kolejności, nowe ciała trzech funkcji, nowa wersja `start_game` i indeks. Do niej testy bazy, pgTAP, poprawki dwóch plików testów i dwa próbne alarmy. Po Fazie 1 stary Worker dalej wysyła jedno id do `start_game`, a reszta losowania już ma nową kolejność. Faza 2 przełącza „Zacznij grę” na pulę i sprząta stare losowanie jednego pytania. Faza 3 dopisuje dokumenty i wgrywa migrację przed scaleniem.

## Critical Implementation Details

**Bieżący pokój nie liczy się do historii.** Pomocnik bierze tylko inne pokoje hosta. Własne rundy i własną listę pokoju wykluczają dalej wołający: `unplayed_candidates` (rundy i wiersze listy tej gry) i `draw_list_question` (wiersze listy). Bez tego pozycje własnej listy przestawiłyby się same za siebie.

**`list_full` przed szukaniem kandydata.** Nowe `draw_list_question` musi zachować dzisiejszą kolejność sprawdzeń (`20261113162527_question_base_checks.sql:379-381`). Od niej zależy `question-list.test.ts:549`.

**Okienko wdrożenia.** Między `db push` a scaleniem stary Worker woła `start_game` z nazwanymi `p_room_id`, `p_question_id`, `p_player_token`. Jedna wersja funkcji z wartościami domyślnymi przyjmuje to wywołanie i daje dzisiejsze zachowanie. Nowy Worker wysyła `p_room_id`, `p_candidates`, `p_player_token` bez `p_question_id`.

## Faza 1: Kolejność losowania w bazie

### Overview

Jedna migracja z pomocnikiem kolejności, podpiętym w czterech miejscach losowania, nową wersją `start_game` i indeksem. Do tego nowy plik testów bazy, scenariusz pgTAP, poprawki `proposals` i `game-length`, wiersz bramy RPC i dwa próbne alarmy w CI.

### Changes Required:

#### 1. Migracja

**File**: `supabase/migrations/<ts>_no_recent_repeats.sql` (z `npx supabase migration new no_recent_repeats`)

**Intent**: Baza bierze kandydatów w kolejności „najpierw nieznane hostowi, potem znane od najdawniej”, a `start_game` bez listy wybiera pierwsze pytanie z kandydatów.

**Contract**:

- Nagłówek: co zmienia S-20 i dlaczego `open_next_round` i `more_questions` zostają bez zmian (biorą `place` z `unplayed_candidates`). Do tego zdanie, że wgranej migracji się nie edytuje.
- `create index rooms_by_host on public.rooms (host_id)`.
- Nowa `private.ordered_candidates(p_room_id uuid, p_candidates text[]) returns table (question_id text, place bigint)`: `language sql stable`, invoker, `set search_path = ''`, nazwy z prefiksem schematu, właściciel `postgres`, `revoke execute … from public, anon, authenticated`, bez grantów (wzór: `picked_candidates`). Zwraca wszystkie wiersze `picked_candidates` (także powtórzonego kandydata), a `place` numeruje je na nowo, od 1, w kolejności losowania. Żaden wiersz nie wypada. Szkic reguły (implementujący może zapisać ją inaczej przy tym samym wyniku):

  ```sql
  with known as (
    select k.question_id, max(coalesce(o.started_at, o.created_at)) as known_at
    from public.rooms r
    join public.rooms o on o.host_id = r.host_id and o.id <> r.id
    cross join lateral (
      select x.question_id from private.rounds x where x.room_id = o.id and x.question_id is not null
      union
      select g.question_id from private.game_questions g where g.room_id = o.id and g.question_id is not null
    ) k
    where r.id = p_room_id
    group by k.question_id
  )
  select c.question_id, row_number() over (order by k.known_at nulls first, c.place) as place
  from private.picked_candidates(p_room_id, p_candidates) c
  left join known k on k.question_id = c.question_id
  ```

- `private.unplayed_candidates` (`create or replace`, ta sama sygnatura i komentarz zaktualizowany): kandydaci z `ordered_candidates` zamiast `picked_candidates`, a filtr (niezagrane w tym pokoju, na żadnym wierszu jego listy) bez zmian.
- `public.open_question_list` (`create or replace`): pierwszych 15 różnych z `ordered_candidates`. Powtórzony kandydat liczy się raz, na swoim pierwszym `place`, jak dziś. Pozycje 1–15 w tej kolejności.
- `public.draw_list_question` (`create or replace`): pierwszy kandydat z `ordered_candidates` spoza listy. Kolejność sprawdzeń, w tym `list_full` przed szukaniem kandydata, bez zmian.
- `public.start_game`:
  - `drop function public.start_game(uuid, text, text)`, potem `create function public.start_game(p_room_id uuid, p_question_id text default null, p_player_token text default null, p_candidates text[] default null)`. Treść jak dziś (`20261113162527_question_base_checks.sql:188-273`) z jedną różnicą: w gałęzi bez listy, gdy `p_candidates` nie jest `null`, rundę 1 otwiera pierwszy z `ordered_candidates`, a gdy żaden nie przechodzi, funkcja odpowiada `no_questions` i nic nie pisze. Gdy `p_candidates` jest `null`, zostaje dzisiejsze sprawdzenie `p_question_id` (`invalid_question`, także dla `null`). Z listą oba parametry nic nie znaczą.
  - Więcej niż 1000 kandydatów rzuca wyjątek `22023` bez wartości z listy, jak w pozostałych funkcjach.
  - Komentarz nad funkcją mówi, kto używa której ścieżki (nowy Worker: kandydaci; stary Worker i testy: `p_question_id`).
  - `security definer`, właściciel `postgres`, `revoke execute … from public, anon, authenticated`, `grant execute … to anon, authenticated` (współhost bez sesji).
- Właściciele, `revoke` i `grant` powtórzone dla każdej funkcji z tego pliku, jak w `20261113162527_question_base_checks.sql:412-435`.

#### 2. Testy bazy: nowy plik S-20

**File**: `tests/db/no-recent-repeats.test.ts` (nowy, jeden host), `tests/db/support/rounds.ts`

**Intent**: Wszystkie cztery miejsca losowania, przez drzwi ról (host z sesją, współhost jako `anon`), biorą najpierw pytania nieznane hostowi, potem znane od najdawniej. Liczą się pominięte, przerwane, usunięte i przeredagowane pozycje, a skasowana gra przestaje się liczyć.

**Contract**:

- **Nowy pomocnik** w `rounds.ts`: start z kandydatami, `{ p_room_id, p_candidates, p_player_token? }`, bez `p_question_id`. Pozycyjny `playerToken` dzisiejszego `startGame` (`:326-333`) zostaje.
- **Wyrocznia** z decyzji Karola, wypisana ręcznie. Każdy pokój ma kategorię `na-co-dzien` bez 18+, a numery niżej to `na-co-dzien-NNN`. Każdy następny pokój tego samego hosta powstaje przez `seedRoom(host, { confirmClose: true })`, z dwoma gośćmi (Ola, Bartek):
  - **Pokój A** (bez listy):
    - start z kandydatami `[001, 002, 003]` → runda 1 to `001` (host nie ma innych gier, więc rozstrzyga kolejność Workera; inne pliki grały `001` innymi hostami);
    - dalej kandydaci podani pojedynczo: runda 1 pominięta (`skip_round` z `[002]`), runda 2 `002` odsłonięta trzema głosami, „Następne pytanie” z `[028]` → runda 3 `028` pominięta (`skip_round` z `[030]`), runda 4 `030` pominięta (`skip_round` z `[031]`), runda 5 `031`;
    - `end_game` w trakcie głosowania rundy 5 (runda przerwana bez odsłony).
  - **Pokój B** (lista, nigdy nie wystartuje):
    - `open_question_list` z `[001…015]` → lista dokładnie `[003, 004, …, 015, 001, 002]`. Najpierw 13 świeżych, a `001` i `002` z gry A remisują i idą w kolejności Workera;
    - „Usuń” pozycji z `005` i „Popraw” pozycji z `006` (pozycję znajduje po numerze pytania z listy hosta, nie po stałym numerze pozycji, bo przy alarmie (a) pozycje się przesuwają);
    - `draw_list_question` z `[001, 028, 016]` → dopisuje `016` (`001` jest na liście, `028` znane, `016` świeże);
    - `draw_list_question` z samym `[028]` → dopisuje `028`, bo znane pytanie nie wypada.
  - **Pokój C** (bez listy, Ola współhost; zamyka B w poczekalni):
    - przed startem: kandydaci `[021, 038]` (18+, kategoria bez 18+) → dokładnie `no_questions`, pokój dalej w poczekalni; pusta tablica → `no_questions`; 1001 kandydatów → błąd `22023`;
    - start hosta z `[005, 006, 018, 001]` → `018`. `005` (usunięte w B), `006` (przeredagowane w B) i `001` są znane;
    - „Następne pytanie” współhosta z `[003, 030, 019]` → `019` (świeże najpierw);
    - „Następne pytanie” z `[001, 003, 030]` → `030`. `030` zna tylko z gry A, a `003` tylko z B. `001` padło w A, ale stało też na liście B, więc liczy się późniejsza B: najpóźniejsze poznanie, nie pierwsze. Przy `min` zamiast `max` `001` i `030` remisują na A i wychodzi `001` (plan-review F1);
    - `end_game`.
  - **Pokój D** (lista): najpierw `delete_game` pokoju A → `{ ok: true }`. Potem `open_question_list` z `[031, 033]` → lista dokładnie `[031, 033]`. `031` było znane tylko z gry A, więc po jej skasowaniu wraca do nieznanych i zostaje przed `033` w kolejności Workera. Przed skasowaniem A lista byłaby `[033, 031]`.
- **Odczyt** rundy i listy jak w dzisiejszych plikach (`room_lobby` hosta, `toEqual` całych zbiorów kluczy, dokładne odpowiedzi `{ ok: true }` i odmowy). Kontrola pozytywna na początku pliku: pokój A. Wszystkie ruchy w `beforeAll`, w `it` tylko sprawdzenia (test-plan §6.2). Ruchy, których wynik sprawdza `it`, idą przez sondy `{ data, error }` (`openQuestionList`, `drawListQuestion`, `startGame` z kandydatami, `nextRound`), a nie przez rzucające `seed*`. Dzięki temu pęknięta reguła daje czerwone `it`, a nie padnięty `beforeAll` całego bloku.

#### 3. Testy bazy: poprawki plików z jednym hostem na wiele gier

**File**: `tests/db/proposals.test.ts`, `tests/db/game-length.test.ts`, `tests/db/support/rounds.ts` (komentarze)

**Intent**: Dotychczasowe testy dalej sprawdzają swoje reguły, a nie przypadkową historię hosta z wcześniejszych opisów w tym samym pliku.

**Contract**:

- `proposals.test.ts`: `LIST_CANDIDATES` (`:78`) to `na-co-dzien-003…017`, a `OPENED` to te same numery na pozycjach 1–15. Oczekiwane rundy: `:752` → `003`, `:772` → `004`, `:795` → `005`. Pokój 1 zostaje bez zmian, bo `:727-736` potrzebują jego tokenów. Implementujący sprawdza, że pokój 1 nie gra żadnego z `003…017`.
- `game-length.test.ts`: w `beforeAll` każdego opisu od drugiego wzwyż, zaraz po `seedRoom(host, { confirmClose: true })` (który zamyka poprzedni pokój), poprzedni pokój idzie do `deleteGame` (`rounds.ts:473`) z dokładnym `{ ok: true }`. Robi się to przed pierwszym ruchem na liście albo w grze. Każdy pokój jest wtedy jedyną grą hosta, a wszystkie oczekiwania zostają jak są. Komentarz przy pierwszym takim miejscu mówi dlaczego (S-20).
- Komentarze `rounds.ts`, które przestają być prawdą (`:15-19` sygnatura `start_game`, `:31-35`, `:71-77`, `:85-87`, `:187-194`, `:203-207`, `:220-221`), mówią „w kolejności losowania: najpierw pytania nieznane hostowi (S-20)” albo „skasowana gra wypada też z historii hosta”.

#### 4. pgTAP

**File**: `supabase/tests/round_creator_view.test.sql`

**Intent**: Widok twórcy pokazuje nowego pomocnika bez grantów i jedną wersję `start_game`. Scenariusz na dwóch hostach dowodzi reguły kolejności bez drzwi Workera.

**Contract**:

- `function_facts('public.start_game(uuid, text, text, text[])')` (`:1184`) z tym samym oczekiwaniem (`security definer | owner postgres | search_path="" | execute: anon, authenticated`).
- `versions_of('start_game')` (`:1390-1393`, `:1982-1986`): `start_game(p_room_id uuid, p_question_id text, p_player_token text, p_candidates text[])`.
- `function_facts('private.ordered_candidates(uuid, text[])')`: invoker, puste `search_path`, `execute: nobody`. `private_versions_of('ordered_candidates')`: jedna wersja.
- Scenariusz `repeat`, z numerami `pgtap-repeat-001…006` dopisanymi do wstawienia katalogu (`:2063`):
  - host P: pokój „stary” (zamknięty, czas cofnięty o 30 minut) z rundą `-001` i usuniętym wierszem listy `-002`;
  - host P: pokój „nowy” (zamknięty, cofnięty o 10 minut) z rundą `-003`;
  - host Q: pokój z rundą `-004`;
  - host P: pokój bieżący w poczekalni z własnym wierszem listy `-005`.

  Historię budują funkcje pokoju tam, gdzie są pomocniki, a w pozostałych miejscach wstawienia jako właściciel w krokach `lives_ok`. Drugi i trzeci pokój hosta P zakłada nowy pomocnik: `create_room(…, true)` jako `host_of(<klucz>)`, a potem zapis `room_id` z odpowiedzi w `test_rooms` pod nowym kluczem z tym samym `host_id`. `host_opens_new_room` tego nie robi. Cofnięcie czasu przesuwa `created_at` i `started_at` razem. Asercja: `array_agg(question_id order by place)` z `private.ordered_candidates(<bieżący>, array[-003, -001, -004, -005, -002, -006])` = `{-004, -005, -006, -001, -002, -003}`. Najpierw nieznane w podanej kolejności (inny host, własny pokój i nigdy), potem pokój „stary” (remis, podana kolejność), na końcu „nowy”.

- Zaktualizowany `plan(N)` (liczy każdą nową asercję i krok `lives_ok`).

#### 5. Brama RPC

**File**: `tests/unit/room-rpc-gate.test.ts`

**Intent**: Ręczna tabela sygnatur zgadza się z nową wersją `start_game`. Worker w tej fazie dalej wysyła `p_question_id`, a to nowa sygnatura przyjmuje.

**Contract**: Wiersz `start_game` (`:82-87`): odnośnik do nowej migracji, `p_question_id` z `hasDefault: true`, nowy `{ name: "p_candidates", hasDefault: true }`. Przypadki akcji bez zmian w tej fazie.

#### 6. Próbne alarmy

**File**: dwa tymczasowe commity na gałęzi (test-plan §6.2, „Break-check”)

**Intent**: Dowód, że nowe testy świecą na czerwono, gdy reguła kolejności pęknie, a poprawione pliki nie zależą już od historii hosta.

**Contract**: Każda usterka w migracji zmiany (jeszcze nie na produkcji) idzie osobnym commitem z listą przewidzianych czerwonych testów w opisie. Po każdym: push, porównanie z CI, `git revert`. Nigdy `db push` tymczasowego stanu.

- **(a) Historia ignorowana:** `ordered_candidates` zwraca `place` z `picked_candidates`. Czerwone mają być dokładnie:
  - w `no-recent-repeats.test.ts`: lista B (wychodzi `[001…015]`), „Dolosuj pytanie” z `[001, 028, 016]` (wychodzi `028`), „Dolosuj pytanie” z `[028]` (`028` jest już na liście, więc `no_questions`), start C (wychodzi `005`), „Następne pytanie” z `[003, 030, 019]` (`003`) i z `[001, 003, 030]` (`001`, niezagrane w C);
  - asercja kolejności pgTAP.

  Zielone zostają: pokój A, odmowy startu w C (`no_questions`, `22023`), pokój D (oczekuje kolejności Workera), wszystkie pozostałe pliki (w tym poprawione `proposals` i `game-length`), reszta pgTAP, smoke i e2e.

- **(b) Kierunek odwrócony:** znane od poznanych najpóźniej (`known_at desc`, nieznane dalej pierwsze). Czerwone mają być tylko przypadki „najdawniej najpierw”: w C „Następne pytanie” z `[001, 003, 030]` (wychodzi `001` z nowszej B) i asercja pgTAP. Osobny commit, bo zbiór (b) mieści się w zbiorze (a).

### Success Criteria:

#### Automated Verification:

- `npm test` (brama RPC z nowym wierszem `start_game`), `npm run lint`, `npx astro check`, `npm run build` zielone
- CI na draft PR: `db` zielony z `no-recent-repeats.test.ts`, poprawionymi `proposals` i `game-length` oraz pgTAP z nowymi asercjami; `ci`, `smoke`, `e2e` zielone
- Próbny alarm (a) w CI trafił dokładnie w przewidziane testy, revert znów zielony
- Próbny alarm (b) w CI trafił dokładnie w przewidziane testy, revert znów zielony
- `git diff main...HEAD -- supabase/migrations` pokazuje tylko migrację zmiany

#### Manual Verification:

- Karol akceptuje streszczenie migracji (3–5 linii: w jakiej kolejności baza teraz bierze pytania i czego gra na ekranie nie zauważy)

**Implementation Note**: Po zielonym CI i obu alarmach zatrzymaj się na akceptację Karola przed Fazą 2.

---

## Faza 2: „Zacznij grę” wysyła pulę

### Overview

Worker przy starcie gry bez listy wysyła całą potasowaną pulę, jak przy pozostałych ruchach, więc pierwsze pytanie też idzie w kolejności losowania. Stare losowanie jednego pytania znika.

### Changes Required:

#### 1. Endpoint startu i wywołanie bazy

**File**: `src/pages/api/rooms/[id]/start.ts`, `src/lib/rooms/server.ts`

**Intent**: „Zacznij grę” daje bazie kandydatów zamiast jednego id.

**Contract**:

- `start.ts` bierze `shuffledQuestions(room.selection, Math.random)`. Pusta pula dalej kończy się `no_questions` bez wołania bazy.
- `startGame(supabase, roomId, candidates, playerToken)` wysyła `{ p_room_id, p_candidates, p_player_token }`, bez `p_question_id`.
- Komentarze `start.ts:10-13` i `server.ts:407-409` mówią, że baza wybiera pierwsze pytanie z kandydatów w kolejności losowania (S-20).
- Ten sam zwrot w komentarzach pozostałych ruchów, które dziś mówią o pierwszym kandydacie w kolejności Workera: `server.ts:479-481` i `:658-660`, `src/pages/api/rooms/[id]/next.ts:10-15`, `question-list.ts:9-12`, `question-draw.ts:10-12` i nagłówek `more.ts` (plan-review F3).

#### 2. Stare losowanie jednego pytania

**File**: `src/lib/rounds/draw.ts`, `tests/unit/draw.test.ts`

**Intent**: Bez martwego kodu i komentarzy, które opisują losowanie, którego już nie ma.

**Contract**:

- `drawFrom` i `drawQuestion` usunięte, a `indexFrom` zostaje dla `shuffledPool`.
- Komentarz `shuffledPool` (`:55-57`) mówi, że baza bierze kandydatów w kolejności losowania: najpierw nieznane hostowi, potem znane od najdawniej, przy remisie w kolejności Workera. Niezagrane w tej grze, więc bez powtórek (FR-015, D1, S-20).
- W `draw.test.ts` przypadki na prawdziwej bazie pytań z `drawQuestion` (`:137-182`: po jednym na kategorię, 18+ tylko tam, gdzie włączone, 18+ w swojej kategorii, nieznane nazwy i `"constructor"`) przechodzą na `questionPool` z tą samą wyrocznią. Przypadki `drawFrom` (`:93-107`) znikają razem z funkcją, a nagłówek (`:15-21`) jest poprawiony. `GRID` i `drawable()` (`:23-28`) znikają, jeśli po przejściu na `questionPool` nic ich nie używa (`no-unused-vars` to błąd lintu, `eslint.config.js:27-35`).

#### 3. Brama RPC: przypadki startu

**File**: `tests/unit/room-rpc-gate.test.ts`

**Intent**: Brama pilnuje dokładnych parametrów nowego wywołania.

**Contract**: Przypadki `start_game` (`:330-341`) wołają `startGame` z kandydatami (np. tablica `CANDIDATES`, `:252`) i oczekują `{ p_room_id, p_candidates, p_player_token }` przez `toStrictEqual`, z tokenem i bez. `QUESTION_ID` (`:248`), używane tylko przez dawne przypadki startu, znika.

### Success Criteria:

#### Automated Verification:

- `npm test` (brama RPC z nowymi przypadkami startu, `draw.test.ts` na `questionPool`), `npm run lint`, `npx astro check`, `npm run build` zielone
- `grep -rn "drawQuestion\|drawFrom" src tests` nic nie znajduje
- CI na PR: `ci`, `smoke` (start przez Worker na bazie z migracją), `db`, `e2e` zielone

**Implementation Note**: Faza bez ręcznych kroków. Ekrany się nie zmieniają.

---

## Faza 3: Dokumenty i wdrożenie

### Overview

Dokumenty projektu opisują nową kolejność losowania. Potem migracja trafia na produkcję przed scaleniem kodu, a smoke i krótkie sprawdzenie Karola potwierdzają działanie.

### Changes Required:

#### 1. Słownik

**File**: `context/domain/glossary.md`

**Intent**: Nowe pojęcie ma nazwę, zanim pojawi się w kodzie i rozmowie.

**Contract**: Nowy wiersz „pytanie znane hostowi” to pytanie wspólnej bazy pytań, które:

- padło w innej grze tego hosta (każda runda, także pominięta i przerwana bez odsłony), albo
- stało na liście pytań gry innej jego gry (także usunięte i przeredagowane, także w grze zamkniętej w poczekalni).

Gra bierze je dopiero po pytaniach, których host nie zna, a najpierw te znane najdawniej. Skasowana gra przestaje się liczyć. Kod: `private.ordered_candidates`. Odradzane: „zagrane pytanie” (pytanie usunięte z listy nie padło), „historia ekipy”. Wiersze „lista pytań gry” i „dolosowanie pytania” dostają pół zdania o tej kolejności.

#### 2. PRD

**File**: `context/foundation/prd.md`

**Intent**: Wymaganie i otwarte pytanie mówią to, co gra robi.

**Contract**:

- Pod FR-015 (`:126`): „Amendment 2026-11-15 (S-20, host's decision)”. Liczą się wszystkie gry hosta, a „played” to każda runda (także pominięta i przerwana) i każdy wiersz listy z pytaniem z bazy. Gdy świeżych zabraknie, najpierw te znane najdawniej. Skasowana gra wypada.
- Open Question 5 (`:220`): „Rozstrzygnięte 2026-11-15 (S-20)…”.
- Reguła pomocnicza (`:167`): „ani z ostatnich wieczorów tej ekipy” → o grach tego hosta.

#### 3. Plan testów

**File**: `context/foundation/test-plan.md`

**Intent**: Nowy plik, nowa zasada dla plików z wieloma grami jednego hosta i wynik alarmów są w przepisach.

**Contract**:

- §6.2:
  - wpis `no-recent-repeats.test.ts`;
  - licznik rejestracji o jeden w górę (25 → 26);
  - zasada: plik, którego host gra kilka gier, od S-20 dostaje w późniejszych grach kolejność z historii hosta, więc albo kasuje wcześniejsze gry (`deleteGame`), albo podaje kandydatów, których host nie zna;
  - w „Widoku twórcy” uwaga o jednym `now()` w transakcji i cofaniu czasu jako właściciel;
  - w „Break-check” wpis S-20 z wynikami alarmów (a) i (b).

#### 4. Roadmapa

**File**: `context/foundation/roadmap.md`

**Intent**: Wpis S-20 nie ma już otwartych niewiadomych.

**Contract**: W S-20 niewiadome o „ostatnich grach” i o skasowanej grze przepisane na rozstrzygnięte 2026-11-15 (decyzje Karola z `research.md`). Status prowadzą skille (`/10x-implement`, `/10x-archive`).

#### 5. Wdrożenie

**File**: — (polecenia; każde za zgodą Karola, z domu albo hotspotu, nie z eduroam)

**Intent**: Baza przed kodem. Stary Worker działa z nową bazą, bo `start_game` przyjmuje jego wywołanie, a pozostałe sygnatury się nie zmieniają.

**Contract**:

1. `gh pr ready` i zielone CI na ostatnim SHA.
2. `npx supabase db push --dry-run` pokazuje tylko migrację zmiany.
3. `db push`, `migration list` (lokalnie = zdalnie) i `npx supabase db advisors --linked --type security` (0 błędów, bez nowych ostrzeżeń: `start_game` ma te same granty).
4. `npm run smoke` na serwerze dev (nowy kod na produkcyjnej bazie).
5. Scalenie przez Karola.
6. Workers Builds.
7. Smoke na produkcji.
8. Epilog osobnym PR: wpis w „Wgrane migracje” w `deploy-plan.md` (z wynikiem `db advisors`) i Progress.

### Success Criteria:

#### Automated Verification:

- Dokumenty zaktualizowane, `npm run lint`, `npx astro check`, `npm test`, `npm run build` zielone
- PR gotowy (nie draft), zielone `ci`, `smoke`, `db`, `e2e` na ostatnim SHA
- `npx supabase db push --dry-run` pokazuje tylko migrację zmiany; `db push` i `migration list` zgodne; `db advisors` 0 błędów
- `npm run smoke` na serwerze dev zielony po `db push`
- Po scaleniu przez Karola: Workers Builds zielony, smoke na produkcji zielony
- Epilog: wpis „Wgrane migracje” w `deploy-plan.md` i Progress przez osobny PR

#### Manual Verification:

- Karol na produkcji (wystarczy laptop): dwie gry pod rząd w jednej kategorii bez 18+ (np. „Na co dzień”, 30 pytań), w każdej „Przejrzyj pytania”. Druga lista nie ma żadnego pytania z pierwszej. Potem „Nowa gra” trzeci raz, bez „Przejrzyj pytania” (zamyka drugą grę), i obie gry testowe można skasować w „Twoje gry”; inaczej ich pytania zostaną znane (decyzja Karola 4)

---

## Testing Strategy

### Unit Tests:

- Brama RPC: nowa sygnatura `start_game` (Faza 1) i dokładne parametry wywołania z kandydatami (Faza 2).
- `draw.test.ts`: reguła FR-005 na prawdziwej bazie pytań przez `questionPool`, tasowanie przez `shuffledPool` bez zmian.

### Integration Tests:

- `tests/db/no-recent-repeats.test.ts`: cztery miejsca losowania, host z sesją i współhost jako `anon`, pominięte i przerwane rundy, usunięte i przeredagowane pozycje listy, gra zamknięta w poczekalni, skasowana gra, odmowy startu z kandydatami (`no_questions`, `22023`).
- pgTAP: pomocnik bez grantów, jedna wersja `start_game`, kolejność na dwóch hostach z cofniętym czasem.
- `proposals` i `game-length` po poprawkach z dawnymi oczekiwaniami. Reszta zestawu bazy, smoke i e2e bez zmian.
- Dwa próbne alarmy (a) i (b) w CI.

### Manual Testing Steps:

1. Faza 1: Karol akceptuje streszczenie migracji.
2. Faza 3: Karol robi dwie listy pod rząd w jednej kategorii bez wspólnych pytań. Potem trzecia „Nowa gra” bez listy zamyka drugą grę (w poczekalni nie ma „Zakończ grę”, a `delete_game` kasuje tylko zamknięte), i Karol kasuje obie gry testowe.

## Performance Considerations

`ordered_candidates` czyta pokoje hosta po nowym indeksie `rooms_by_host`, a ich rundy i listy po istniejących kluczach z `room_id` (`20261014101922_first_live_round.sql:124-125`, `20261024094002_question_list_review.sql:79`). Przy kilkudziesięciu grach hosta to kilka tysięcy wierszy na wywołanie, obok najwyżej 1000 kandydatów: pomijalne przy skali PRD (do ok. stu użytkowników). `more_questions` liczy przez `unplayed_candidates`, więc też policzy kolejność. To jeden ruch na koniec gry.

## Migration Notes

- Jedna migracja, jeden `db push` przed scaleniem kodu. Stary Worker wysyła `p_question_id` i dostaje dzisiejsze zachowanie, a jego listy, dolosowania i następne pytania już od `db push` idą w nowej kolejności.
- Pokoje otwarte w chwili wdrożenia grają dalej. Ich lista już jest, a następne pytania po liście dostają nową kolejność.
- Wycofanie: nowa migracja przywracająca poprzednie ciała funkcji i `start_game(uuid, text, text)` (nigdy edycja wgranej). Indeks może zostać. Po Fazie 2 najpierw wraca poprzednia wersja Workera (za zgodą Karola), a dopiero potem migracja. Nowy Worker wysyła `p_candidates`, więc przy trzyargumentowym `start_game` „Zacznij grę” by padło. Druga możliwość: migracja wycofania zostawia czteroargumentową sygnaturę i zmienia tylko kolejność (plan-review F5).
- Historia działa od razu na danych sprzed wdrożenia: gry testowe Karola już są w `rooms`, `rounds` i `game_questions`.

## References

- Research: `context/changes/no-recent-repeats/research.md`
- Roadmapa: `context/foundation/roadmap.md` (S-20, Open Roadmap Question 5)
- Kandydaci od Workera (D1): `context/archive/2026-10-15-full-game-evening/research.md:104-113`
- Wzór pomocnika bez grantów: `supabase/migrations/20261113162527_question_base_checks.sql:52-64`
- Plan S-17 (filtr w bazie, jedna definicja): `context/changes/question-pool-in-db/plan.md`
- Liczniki S-19: `context/changes/game-length/plan.md:33`, `:93`
- Przepisy testów: `context/foundation/test-plan.md` §6.1, §6.2

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: Kolejność losowania w bazie

#### Automated

- [x] 1.1 `npm test` (brama RPC z nowym wierszem `start_game`), `npm run lint`, `npx astro check`, `npm run build` zielone — a5af826
- [x] 1.2 CI na draft PR: `db` zielony z `no-recent-repeats.test.ts`, poprawionymi `proposals` i `game-length` oraz pgTAP z nowymi asercjami; `ci`, `smoke`, `e2e` zielone — a5af826
- [x] 1.3 Próbny alarm (a) w CI trafił dokładnie w przewidziane testy, revert znów zielony — 2343a39
- [x] 1.4 Próbny alarm (b) w CI trafił dokładnie w przewidziane testy, revert znów zielony — 32deee4
- [x] 1.5 `git diff main...HEAD -- supabase/migrations` pokazuje tylko migrację zmiany — a5af826

#### Manual

- [x] 1.6 Karol akceptuje streszczenie migracji (3–5 linii: w jakiej kolejności baza teraz bierze pytania i czego gra na ekranie nie zauważy) — a5af826

### Phase 2: „Zacznij grę” wysyła pulę

#### Automated

- [ ] 2.1 `npm test` (brama RPC z nowymi przypadkami startu, `draw.test.ts` na `questionPool`), `npm run lint`, `npx astro check`, `npm run build` zielone
- [ ] 2.2 `grep -rn "drawQuestion\|drawFrom" src tests` nic nie znajduje
- [ ] 2.3 CI na PR: `ci`, `smoke` (start przez Worker na bazie z migracją), `db`, `e2e` zielone

### Phase 3: Dokumenty i wdrożenie

#### Automated

- [ ] 3.1 Dokumenty zaktualizowane, `npm run lint`, `npx astro check`, `npm test`, `npm run build` zielone
- [ ] 3.2 PR gotowy (nie draft), zielone `ci`, `smoke`, `db`, `e2e` na ostatnim SHA
- [ ] 3.3 `npx supabase db push --dry-run` pokazuje tylko migrację zmiany; `db push` i `migration list` zgodne; `db advisors` 0 błędów
- [ ] 3.4 `npm run smoke` na serwerze dev zielony po `db push`
- [ ] 3.5 Po scaleniu przez Karola: Workers Builds zielony, smoke na produkcji zielony
- [ ] 3.6 Epilog: wpis „Wgrane migracje” w `deploy-plan.md` i Progress przez osobny PR

#### Manual

- [ ] 3.7 Karol na produkcji (wystarczy laptop): dwie gry pod rząd w jednej kategorii bez 18+ (np. „Na co dzień”, 30 pytań), w każdej „Przejrzyj pytania”. Druga lista nie ma żadnego pytania z pierwszej. Potem „Nowa gra” trzeci raz, bez „Przejrzyj pytania” (zamyka drugą grę), i obie gry testowe można skasować w „Twoje gry”; inaczej ich pytania zostaną znane (decyzja Karola 4)
