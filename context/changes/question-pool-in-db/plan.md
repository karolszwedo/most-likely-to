# Pula pytań w bazie (S-17) Implementation Plan

## Overview

Baza dostaje własną kopię wspólnej bazy pytań: numer pytania, kategorię i znacznik 18+, bez treści (`private.question_base`). Każdy ruch prowadzącego, który przyjmuje numer pytania, przepuszcza tylko pytanie z kategorii wybranych przez hosta, a 18+ tylko z kategorii, w których host je włączył. Dotyczy to także hosta i współhosta, którzy wołają funkcję bazy sami, z pominięciem ekranu (roadmapa S-17, PRD FR-005). Zmiana zamyka znaną dziurę F1 z przeglądu planu S-07 (dwa testy `it.fails` „znana dziura F1 → S-17”) i ryzyko 8 z S-11: host nie zawyży już liczników pytań numerem spoza bazy.

**Decyzje (2026-11-13):**

- **Karol:** wariant W-A z `research.md`, czyli katalog w bazie (numer → kategoria, 18+) wypełniany migracją generowaną z `src/data/questions.ts`. Każde dopisanie pytań to od teraz także migracja i `db push` przed scaleniem.
- **Sesja** (Karol przyjął „0 pytań, decyzje techniczne moje”):
  1. Tabela `private.question_base` bez grantów i bez polityk, czytana tylko przez funkcje.
  2. Każda zmiana `questions.ts` to nowa migracja „migawka” z jednej komendy `npm run questions:migration`. Migawka ustawia katalog dokładnie na stan pliku. Test jednostkowy w `npm test` jest czerwony, gdy plik i najnowsza migawka się rozjadą.
  3. Numer spoza wyboru hosta odpada z kandydatów, tak jak dziś numer w złym formacie. Gdy nic nie zostaje, wraca dzisiejsze `no_questions`. `start_game` z takim numerem dostaje dzisiejsze `invalid_question` (na ekranie: „Nie udało się wylosować pytania. Spróbuj jeszcze raz.”). Żadna sygnatura się nie zmienia, więc stary Worker działa w okienku między `db push` a scaleniem.
  4. `create_room` odmawia nazw kategorii, których katalog nie zna (dzisiejsze `invalid_categories`).
  5. Żaden ekran się nie zmienia, więc nie ma zrzutów do oceny.

## Current State Analysis

- Numer pytania od wołającego wchodzi do bazy sześcioma funkcjami. Każda sprawdza tylko format `^[a-z0-9-]+-[0-9]{3}$` (`research.md`, tabela „Wejścia numeru pytania”):
  - `start_game` (`20261027121442_co_host_role.sql:110-194`, sprawdzenie w `:158`, numer używany tylko bez listy pytań gry);
  - `next_round`, `skip_round` i `more_questions` przez `private.unplayed_candidates` (`20261107091322_game_length.sql:78-93`, format w `:86`);
  - tylko dla hosta: `open_question_list` (`20261024094002_question_list_review.sql:104-166`, format w `:150`) i `draw_list_question` (`:171-230`, format w `:212`).
- Wybór hosta leży w `rooms.categories` i `rooms.adult_categories` (`20261007122858_room_lobby.sql:26-27`). Zapisuje go jedynie `create_room` (`20261031090821_player_color_choice.sql:76-159`), który sprawdza sam kształt tablic (`:110-114`), a nie nazwy.
- Baza nie zna kategorii ani znacznika 18+ żadnego pytania. Regułę FR-005 ma tylko Worker (`poolFrom`, `src/lib/rounds/draw.ts:26-34`), a Worker pomija też nieznane nazwy kategorii.
- Wpisy listy bez numeru (poprawione, własne, zatwierdzone propozycje) nie niosą numeru do sprawdzenia (`research.md`, tabela rodzajów). Wpisy z numerem powstają tylko w `open_question_list` i `draw_list_question`, więc sprawdzenie w tych dwóch funkcjach wystarcza dla listy.
- Wspólna baza pytań: 216 pytań w 8 kategoriach, 57 z nich 18+ (`src/data/questions.ts`). Żaden skrypt nie robi z niej SQL.

## Desired End State

- `private.question_base` ma dokładnie te numery, kategorie i znaczniki 18+, które są w `src/data/questions.ts`. Gdy plik i najnowsza migawka się różnią, `npm test` jest czerwony.
- Każdy z sześciu ruchów otwiera albo wpisuje na listę tylko pytanie, które `poolFrom` dałby dla wyboru tego pokoju (ta sama reguła, więc „Jeszcze N pytań” nie obiecuje więcej, niż baza doda). Numer spoza wyboru, także w poprawnym formacie i także od hosta z sesją, odpada albo dostaje odmowę.
- `create_room` z nazwą kategorii spoza katalogu dostaje `invalid_categories`.
- Gra na ekranie działa jak dotąd: Worker wysyła numery z tej samej puli, a baza je przepuszcza.
- Dopisanie pytań działa tak: zmiana w `questions.ts`, potem `npm run questions:migration`, potem PR, potem `db push` i dopiero wtedy scalenie. Opisują to `deploy-plan.md`, nagłówek `questions.ts` i `AGENTS.md`.
- Sprawdzenie: test zgodności migawki (`npm test`), testy bazy (`tests/db/question-base.test.ts` i dawne F1 jako zwykłe testy), pgTAP, smoke na produkcji i krótka gra Karola.

### Key Discoveries:

- `invalid_question` ma już tekst „Nie udało się wylosować pytania. Spróbuj jeszcze raz.” (`src/lib/rooms/errors.ts:80`), a ponowne „Zacznij grę” losuje od nowa (`src/pages/api/rooms/[id]/start.ts:39-43`). Odmowa startu nie wymaga zmian w Workerze ani na ekranie.
- pgTAP sam przegląda każdą tabelę schematu `private` pod kątem grantów, publikacji Realtime i kolumn czasu (`supabase/tests/round_creator_view.test.sql:440-480`). Nowa tabela nie ma kolumn czasu ani serii, więc przejdzie te kontrole bez dopisywania.
- pgTAP gra scenariusze na wymyślonych numerach `pgtap-<scenariusz>-NNN` (11 przedrostków) i na prawdziwych `na-co-dzien-001..015` (bez 18+; `host_reviews_list`, `:631`) w pokojach z kategorią `na-co-dzien` bez 18+ (`round_creator_view.test.sql:64`, `:158-161`). Po sprawdzeniu wymyślone numery odpadną, jeśli plik nie wstawi ich do katalogu we własnej transakcji. Plik kończy się `rollback`, więc wstawione wiersze nie zostają w bazie.
- Lokalny i produkcyjny Postgres to 17 (`supabase/config.toml:40`), więc migawka może być jednym `merge … when not matched by source then delete`.
- Oba testy F1 wysyłają jedyny kandydat `na-co-dzien-021` (18+, kategoria bez 18+): `tests/db/cohost.test.ts:243`, `:413-421` i `tests/db/game-length.test.ts:613`, `:657-666`. Po zmianie dostaną dokładnie `no_questions`.
- Brama RPC (`tests/unit/room-rpc-gate.test.ts:41-206`) porównuje sygnatury. Te się nie zmieniają; nieaktualne zrobią się tylko odnośniki `plik:linia` w komentarzach przy `create_room`, `start_game`, `open_question_list` i `draw_list_question`.
- `node` lokalnie to 24.19 (sam zdejmuje typy z `.ts`), a CI i `.nvmrc` to 22.14, gdzie trzeba flagi `--experimental-strip-types`. Generator biegnie tylko lokalnie. Precedens uruchamiania `.ts` przez `node`: `tests/db/support/print-nick-pairs.ts` (test-plan §6.2).
- Słownik: „pula” jest odradzana (`context/domain/glossary.md:65`, `:68`). Nazwy w kodzie: `question_base` (wspólna baza pytań) i „wybrane kategorie” (`picked`, jak w `draw.ts`).

## What We're NOT Doing

- Bez treści pytań w bazie i bez przenoszenia losowania do bazy (W-C z `research.md`). Treść na ekranie dalej składa Worker z `questions.ts`.
- Bez znacznika „odłożone” (`retired`, S-12/FR-017); katalog jest dla niego naturalnym miejscem później.
- Bez zmiany sygnatur, nowych kodów odmowy i zmian ekranów. Brama RPC zmienia tylko odnośniki w komentarzach.
- Bez zmiany w losowaniu Workera: `poolFrom`, `shuffledPool` i `questionsToDraw` zostają. Baza filtruje to, co Worker wysyła.
- Bez sprawdzania wpisów listy i rund, które powstały przed wdrożeniem (pokoje sprzed `db push` żyją najwyżej 12 h, a ich numery pochodzą z puli Workera).
- Bez strażnika w CI, który sprawdzałby, czy migawka jest już na produkcji: CI nie widzi produkcji. Kolejność „baza, potem kod” zapisujemy w `deploy-plan.md`.
- Bez warunku, że kategoria z włączonym 18+ ma jakiekolwiek pytanie 18+ (Worker też go nie stawia).
- Bez edycji `context/domain/domain-distillation.md` (odświeży ją następny przebieg skilla) i czegokolwiek w `context/archive/`.
- Bez rozbudowy bazy pytań: nowe kategorie i pytania Karola to osobna zmiana po S-17.

## Implementation Approach

Najpierw dane, potem sprawdzanie. Faza 1 tworzy tabelę i pierwszą migawkę z generatora oraz strażnika zgodności z plikiem; zachowanie gry się nie zmienia. Faza 2 dodaje jedną funkcję `private.picked_candidates` (kandydaci z wybranych kategorii, w kolejności Workera) i podpina ją we wszystkich miejscach, które dziś sprawdzają sam format. Dzięki temu reguła FR-005 ma w bazie jedną definicję, a „Następne pytanie”, „Pomiń”, „Jeszcze 5 pytań”, start i obie funkcje listy nie mogą się rozjechać (uwaga z przeglądu S-19 o łataniu funkcji osobno). Faza 3 to dokumenty i wdrożenie: trzy migracje naraz przed scaleniem kodu.

## Critical Implementation Details

**Kolejność migracji.** Migawka musi mieć wcześniejszy znacznik czasu niż migracja ze sprawdzeniami. Inaczej przez chwilę w trakcie `db push` sprawdzenia widziałyby pusty katalog i każda gra dostawałaby `no_questions`. Kolejność plików: tabela → migawka → sprawdzenia.

**Ta sama reguła co `poolFrom`.** Pytanie przechodzi, gdy katalog ma jego numer, jego kategoria jest w `rooms.categories`, a jeśli jest 18+, to jego kategoria jest też w `rooms.adult_categories`. Nieznane nazwy kategorii w pokoju niczego nie dodają (jak `known` w `poolFrom`). Każda różnica sprawiłaby, że „Jeszcze N pytań” obieca więcej albo mniej, niż `more_questions` doda.

**Filtr, nie odmowa całego żądania.** Kontrakt kandydatów z S-03 (D1) to „pierwszy pasujący z kolejności Workera”. Numer spoza wyboru wypada tak jak dziś numer w złym formacie, a reszta listy dalej działa. Tylko `start_game`, który dostaje jeden numer, odmawia wprost.

## Faza 1: Katalog wspólnej bazy pytań w bazie

### Overview

Tabela `private.question_base`, generator migawek, pierwsza migawka 216 pytań i test zgodności migawki z `questions.ts`. Gra działa dokładnie jak dziś, bo nic jeszcze katalogu nie czyta.

### Changes Required:

#### 1. Tabela katalogu

**File**: `supabase/migrations/<ts>_question_base.sql` (z `npx supabase migration new question_base`)

**Intent**: Miejsce w bazie na numer, kategorię i znacznik 18+ każdego pytania wspólnej bazy pytań, niewidoczne dla żadnej roli API.

**Contract**: `private.question_base (question_id text primary key, category text not null, adult boolean not null)` z `check` formatu numeru (`^[a-z0-9-]+-[0-9]{3}$`) i id kategorii (`^[a-z0-9-]+$`). Do tego RLS włączone, `revoke all … from public, anon, authenticated`, bez grantów i bez polityk (AGENTS.md: tabela czytana tylko przez funkcje). Komentarz w migracji mówi, że wiersze zapisują wyłącznie migracje-migawki z generatora.

#### 2. Generator migawek

**File**: `scripts/question-base-migration.mjs`, `package.json` (skrypt `questions:migration`)

**Intent**: Jedna komenda, która z `src/data/questions.ts` robi nową migrację ustawiającą katalog dokładnie na stan pliku. Karol (albo agent) uruchamia ją po każdej zmianie pytań.

**Contract**: `npm run questions:migration` = `node --experimental-strip-types scripts/question-base-migration.mjs`. Skrypt importuje `QUESTIONS` z `src/data/questions.ts` i zakłada plik przez `supabase migration new question_base_snapshot` (AGENTS.md). CLI woła przez bin pakietu `supabase` i `process.execPath`, bez powłoki i bez `npx`, jak `runTool` w `.claude/hooks/lib.mjs:93-121`. Na Windows `npx` to plik `.cmd`, którego Node nie uruchomi bez powłoki. Treść migracji podaje CLI na stdin, bo CLI zapisuje do nowego pliku to, co dostanie na wejściu (sprawdzić raz). Jeśli jej nie zapisze, skrypt wpisuje treść do pliku, który CLI założył. Skrypt używa tylko globali z listy dla `scripts/**/*.mjs` w `eslint.config.js:80-97`, a resztę importuje z `node:`. Pierwsza linia pliku to znacznik generatora (stały komentarz, po którym test rozpoznaje migawkę, np. `-- question_base snapshot, generated by npm run questions:migration from src/data/questions.ts; do not edit`). Treść to jedno `merge into private.question_base` ze źródłem `values` (po wierszu `('<id>', '<category>', true|false)` na pytanie, w kolejności pliku): dopasowane aktualizuje, nowe wstawia, a wiersze spoza źródła usuwa (`when not matched by source then delete`). Skrypt niczego nie wysyła do bazy, więc nie potrzebuje reguły `ask` (lessons.md, wpis 1). Musi działać na Node 24 lokalnie; po zmianie uruchom go choć raz (lessons.md, wpis 3).

#### 3. Pierwsza migawka

**File**: `supabase/migrations/<ts>_question_base_snapshot.sql` (wygenerowany, nie pisany ręcznie)

**Intent**: Wypełnić katalog 216 pytaniami z dzisiejszego pliku.

**Contract**: Wynik `npm run questions:migration` bez ręcznych poprawek; znacznik czasu późniejszy niż tabela z punktu 1.

#### 4. Strażnik zgodności migawki z plikiem

**File**: `tests/unit/question-base-snapshot.test.ts`

**Intent**: Czerwony `npm test` (lokalnie i w jobie `ci`), gdy ktoś zmieni pytania bez nowej migawki albo poprawi migawkę ręcznie.

**Contract**: Test czyta `supabase/migrations/*.sql` przez `node:fs` w kolejności nazw i wybiera najnowszy plik ze znacznikiem generatora. Wiersze `('<id>', '<category>', true|false)` wyciąga własnym wyrażeniem regularnym, niezależnym od kodu generatora, żeby wyrocznia nie była lustrem (test-plan §6.1). Przypadki:

- jest co najmniej jedna migawka;
- zbiór numerów migawki = klucze `QUESTIONS` (brak i nadmiar wymienione z nazwy w komunikacie);
- dla każdego numeru kategoria i 18+ jak w `QUESTIONS`;
- żaden plik, który nie jest migawką, nie zapisuje `private.question_base` (`insert`, `update`, `delete`, `merge`, `truncate` na tej tabeli). Migracja z punktu 1 i migracja Fazy 2 tylko ją tworzą albo czytają.

#### 5. pgTAP: struktura katalogu

**File**: `supabase/tests/round_creator_view.test.sql`

**Intent**: Widok twórcy potwierdza, że katalog jest zamknięty dla ról API i że migawka go wypełniła.

**Contract**: Kontrole dla `private.question_base`: tabela istnieje (`to_regclass`), RLS włączone, `table_privs_are` dla `anon` i `authenticated` puste (jak `game_questions`, `:1060-1063`), katalog niepusty i każdy wiersz w formacie numeru. Do tego zaktualizowany `plan(N)`. Liczby wierszy nie sprawdzamy, bo pgTAP nie czyta `questions.ts`, a liczbę pilnuje test z punktu 4.

#### 6. Zasady dopisywania pytań

**File**: `src/data/questions.ts` (komentarz nagłówka), `AGENTS.md` (Conventions), `docs/development.md` (lista skryptów)

**Intent**: Każdy, kto dopisuje pytania (Karol z agentem po S-17), wie, że zmiana pliku wymaga migawki i `db push` przed scaleniem.

**Contract**: W nagłówku `questions.ts` nowa reguła: po każdej zmianie `npm run questions:migration`, migawka jedzie w tym samym PR-ze, a `db push` idzie przed scaleniem, bo baza odrzuca numery i kategorie, których nie zna. Nowa kategoria scalona przed `db push` oznacza, że gry z nią nie da się założyć. W `AGENTS.md` jedno zdanie w Conventions z tą samą regułą i odnośnikiem do `deploy-plan.md`. W `docs/development.md` skrypt `questions:migration` trafia na listę skryptów (`:37-48`) i do opisu `scripts/` (`:64`).

### Success Criteria:

#### Automated Verification:

- `npm run questions:migration` uruchomiony raz tworzy dokładnie jeden plik `*_question_base_snapshot.sql` z 216 wierszami, późniejszy niż `*_question_base.sql`
- `npm test` zielony, z `tests/unit/question-base-snapshot.test.ts`
- Próbny alarm lokalny: usunięty jeden wiersz migawki, a osobno zmieniony jeden znacznik 18+ zaczerwieniają tylko test zgodności (po cofnięciu zielono, bez commita)
- `npm run lint`, `npx astro check`, `npm run build` zielone
- Draft PR (push za zgodą Karola): zielone `ci`, `smoke`, `db` (z pgTAP) i `e2e`

#### Manual Verification:

- Karol akceptuje sposób dopisywania pytań (streszczenie 3–5 linii: komenda, PR, `db push`, scalenie)

**Implementation Note**: Po zielonej weryfikacji automatycznej zatrzymaj się na akceptację Karola przed Fazą 2.

---

## Faza 2: Sprawdzenie w ruchach prowadzącego

### Overview

Jedna funkcja `private.picked_candidates` z regułą FR-005, podpięta w `unplayed_candidates`, `start_game`, `open_question_list` i `draw_list_question`, oraz sprawdzenie nazw kategorii w `create_room`. Do tego testy bazy, pgTAP i próbny alarm w CI.

### Changes Required:

#### 1. Migracja ze sprawdzeniami

**File**: `supabase/migrations/<ts>_question_base_checks.sql` (z `npx supabase migration new question_base_checks`, znacznik czasu późniejszy niż migawka)

**Intent**: Baza sama pilnuje wyboru hosta we wszystkich sześciu wejściach numeru pytania, bez zmiany sygnatur.

**Contract**:

- Nowa `private.picked_candidates(p_room_id uuid, p_candidates text[]) returns table (question_id text, place bigint)`: `language sql stable`, invoker, `set search_path = ''`, nazwy z prefiksem schematu, `revoke execute … from public, anon, authenticated`, bez grantów (wzór: `unplayed_candidates`, `game_length.sql:78-93`). Zwraca kandydatów z miejscem (`with ordinality`), których numer jest w `private.question_base`, a kategoria w `rooms.categories` pokoju; pytanie 18+ tylko wtedy, gdy jego kategoria jest też w `rooms.adult_categories`. Format sprawdza sam katalog (`check` z Fazy 1).
- `private.unplayed_candidates`: zamiast własnego warunku formatu bierze kandydatów z `picked_candidates`; reszta (niezagrane, na żadnym wierszu listy) bez zmian. Tym samym obejmuje `next_round`, `skip_round`, `more_questions` i liczenie w `more_questions`.
- `public.start_game`: gałąź bez listy odmawia `invalid_question`, gdy `p_question_id` nie przechodzi przez `picked_candidates` (`null` też); gałąź z listą bez zmian.
- `public.open_question_list`: pierwszych 15 różnych bierze spośród `picked_candidates`, nie spośród samego formatu; `no_questions`, gdy nic nie zostaje.
- `public.draw_list_question`: pierwszy kandydat z `picked_candidates` spoza listy; `no_questions`, gdy nic nie zostaje.
- `public.create_room`: oprócz dzisiejszego kształtu odmawia `invalid_categories`, gdy któraś nazwa z `p_categories` nie jest kategorią żadnego wiersza `private.question_base`; odmowa zapada przed zamknięciem starego pokoju (jak dziś sprawdzenie kształtu, `player_color_choice.sql:110-114`).
- Wszystkie przez `create or replace` z tą samą sygnaturą, właścicielem `postgres`, `security definer` tam, gdzie było, `set search_path = ''`, `revoke`/`grant` powtórzone jak w poprzednich migracjach. Limit 1000 kandydatów (22023) zostaje.

#### 2. Testy bazy

**File**: `tests/db/question-base.test.ts` (nowy, jeden host), `tests/db/cohost.test.ts`, `tests/db/game-length.test.ts`

**Intent**: Ruchy prowadzącego, także hosta z sesją, nie otwierają pytania spoza wyboru, a wybrane pytania, także 18+ tam, gdzie host je włączył, dalej przechodzą.

**Contract**: Wyrocznia to FR-005 i outcome S-17. Numery są wypisane wprost, sprawdzone ręcznie w `questions.ts`, nie liczone kodem gry: `przyszlosc-008` (kategoria niewybrana), `na-co-dzien-021` (18+ w kategorii bez 18+), `imprezy-021` (18+ w kategorii z 18+), `na-co-dzien-999` (dobry format, brak w bazie), `na-co-dzien-001`, `na-co-dzien-002`, `imprezy-020` (zwykłe). Przypadki (wzorce: §6.2, `cohost.test.ts`, `game-length.test.ts`):

- `create_room` z `[na-co-dzien, nieznana]` → `invalid_categories`, bez pokoju; potem pokój `[na-co-dzien, imprezy]` z 18+ tylko w `imprezy`, Ola jako współhost i Kuba;
- w poczekalni bez listy: `start_game` współhosta jako `anon` z każdym z trzech numerów spoza wyboru oraz hosta z sesją z `na-co-dzien-021` → dokładnie `invalid_question`, pokój dalej w poczekalni; kontrola pozytywna: `start_game` z `imprezy-021` → `{ ok: true }`, runda 1 to `imprezy-021`;
- w grze: `skip_round` i `next_round` z numerami spoza wyboru przed zwykłym → otwiera zwykły (filtr, nie odmowa); same numery spoza wyboru → `no_questions`, najnowsza runda bez zmian; jedno z wywołań jako host z sesją;
- drugi pokój (`confirmClose`) z listą: `open_question_list` z kandydatami `[przyszlosc-008, na-co-dzien-021, imprezy-021, na-co-dzien-999, na-co-dzien-001]` → lista dokładnie `[imprezy-021, na-co-dzien-001]`; `draw_list_question` z `[przyszlosc-008, na-co-dzien-021, na-co-dzien-002]` dopisuje `na-co-dzien-002`, a z samymi spoza wyboru `no_questions` i lista bez zmian;
- oba testy „znana dziura F1 → S-17” tracą `it.fails` i przedrostek: zwykłe `it` z dokładnym `{ error: null, data: { ok: false, reason: "no_questions" } }`, a w `game-length` także liczba pytań bez zmiany. Do tego nowy odczyt `roomLobby` po `moreQuestions` (`:613`), przed `endGame` (`:615`): liczba pytań dalej 20, a runda 20 dalej najnowsza. Ten test jest już przy ostatnim pytaniu gry, więc odmowa przychodzi z liczenia w `more_questions`. Komentarze nad nimi mówią, że S-17 zamknęło dziurę (test-plan §6.2, „Known hole”: zdejmij znacznik, nie usuwaj testu).

#### 3. pgTAP

**File**: `supabase/tests/round_creator_view.test.sql`

**Intent**: Scenariusze liczników dalej działają na własnych numerach, a widok twórcy pokazuje nową funkcję i zamknięte ryzyko 8 z S-11.

**Contract**:

- Przed pierwszym scenariuszem plik wstawia do `private.question_base` każdy numer `pgtap-<scenariusz>-NNN`, którego używa, jako `na-co-dzien` bez 18+. Wstawienie jest w transakcji pliku, więc `rollback` je zabiera; zasada w komentarzu przy `:64`.
- `function_facts('private.picked_candidates(uuid, text[])')`: invoker, puste `search_path`, żadna rola API nie woła (wzór `:1838-1840`).
- `versions_of` dla `start_game`, `open_question_list`, `draw_list_question` i `create_room`: dalej dokładnie jedna wersja z tą samą sygnaturą.
- Ryzyko 8: host w pokoju scenariusza woła `next_round` z jedynym kandydatem spoza katalogu (`pgtap-outside-001`, niewstawionym) → `no_questions` i `stats_gain` bez przyrostu.
- Zaktualizowany `plan(N)`.

#### 4. Odnośniki i komentarze

**File**: `tests/unit/room-rpc-gate.test.ts`, `src/lib/rounds/draw.ts`, `src/lib/rooms/server.ts`, `tests/db/support/rounds.ts`, `tests/db/game-length.test.ts`, `tests/db/question-list.test.ts`, `supabase/tests/round_creator_view.test.sql` (nagłówek)

**Intent**: Komentarze, które mówią „baza sprawdza tylko kształt/format”, przestają kłamać.

**Contract**: Odnośniki `plik:linia` przy `create_room`, `start_game`, `open_question_list`, `draw_list_question` w bramie RPC wskazują nową migrację; sygnatury bez zmian. Komentarze w `draw.ts:8-9`, `:107-108` i `server.ts:272`, `:299`, `:787` mówią, że baza sprawdza wybór i numer sama (S-17), a Worker filtruje dalej, żeby wysyłać tylko pytania, które baza przyjmie (nieznany numer w rundzie może się zdarzyć już tylko w pokoju sprzed wdrożenia albo przy rozjeździe kodu i bazy). Logika Workera bez zmian. Zdanie „baza sprawdza tylko format” poprawiają też komentarze testów:

- `tests/db/support/rounds.ts:15-16`, `:69-74`, `:184-190`, `:205-206`;
- `tests/db/game-length.test.ts:53-55`;
- `tests/db/question-list.test.ts:50`, `:94`;
- nagłówek `round_creator_view.test.sql:1-64`.

#### 5. Próbny alarm

**File**: tymczasowy commit na gałęzi (test-plan §6.2, „Break-check”)

**Intent**: Dowód, że nowe testy bazy świecą na czerwono, gdy sprawdzenie pęknie.

**Contract**: Jeden tymczasowy commit z dwiema usterkami w migracji zmiany (jeszcze nie na produkcji), bo każda zapala inne testy: (a) `picked_candidates` ignoruje znacznik 18+, (b) `create_room` przepuszcza nieznaną kategorię. Przed pushem lista przewidzianych czerwonych testów w opisie commita, potem porównanie z CI, `git revert` i znów zielono. Nigdy `db push` tymczasowego stanu. Wynik w test-plan §6.2 (Faza 3).

### Success Criteria:

#### Automated Verification:

- `npm test` (brama RPC z nowymi odnośnikami), `npm run lint`, `npx astro check`, `npm run build` zielone
- CI na PR: `db` zielony z nowym `question-base.test.ts`, dawnymi testami F1 bez `it.fails` i pgTAP z nowymi asercjami; `ci`, `smoke`, `e2e` zielone
- Próbny alarm (a) + (b) w CI trafił dokładnie w przewidziane testy, revert znów zielony
- `git diff main...HEAD -- supabase/migrations` pokazuje tylko trzy migracje zmiany

#### Manual Verification:

- Karol akceptuje streszczenie migracji (co baza teraz odmawia i czego gra na ekranie nie zauważy)

**Implementation Note**: Po zielonym CI i alarmie zatrzymaj się na akceptację Karola przed Fazą 3.

---

## Faza 3: Dokumenty i wdrożenie

### Overview

Dokumenty projektu opisują katalog i sposób dopisywania pytań. Potem migracje trafiają na produkcję przed scaleniem kodu, a smoke i krótka gra Karola potwierdzają, że nic się nie zepsuło.

### Changes Required:

#### 1. Plan testów

**File**: `context/foundation/test-plan.md`

**Intent**: Nowy plik testów, zamknięta dziura F1 i wynik próbnego alarmu są w przepisach.

**Contract**:

- §6.1: wpis o teście zgodności migawki.
- §6.2:
  - wpis `question-base.test.ts`;
  - w opisach `cohost.test.ts` i `game-length.test.ts` F1 jako zamknięte przez S-17;
  - „Known hole”: dziś żadnej;
  - licznik rejestracji 22 → 23 z nowym plikiem;
  - w „Widoku twórcy”: zasada, że scenariusze wstawiają swoje numery `pgtap-…` do katalogu;
  - w „Break-check”: wpis S-17 z wynikiem alarmu (a) i (b).

#### 2. Plan wdrożenia

**File**: `context/deployment/deploy-plan.md`

**Intent**: Dopisywanie pytań ma swoją kolejność, a nowe migracje są w rejestrze.

**Contract**: Nowa podsekcja „Dopisywanie pytań do wspólnej bazy pytań”, krok po kroku:

1. zmiana w `questions.ts`;
2. `npm run questions:migration`;
3. `npm test`;
4. PR i zielone CI;
5. `db push` (zgoda, nie z eduroam);
6. scalenie.

Do tego, co się stanie po scaleniu przed `db push`: nowe pytania nie padają, start czasem „Spróbuj jeszcze raz”, „Jeszcze N pytań” obiecuje za dużo. Gry z nową kategorią nie da się wtedy założyć: baza odmawia (`invalid_categories`), a ekran mówi „Wybierz co najmniej jedną kategorię.”. W „Przeglądzie pytań z gier” zdanie „zwykłą zmianą w repo” zostaje zastąpione odnośnikiem do tej podsekcji. Wpis „Wgrane migracje” dla trzech migracji z wynikiem `db advisors` i smoke trafia do epilogu po wdrożeniu (osobny PR, jak przy S-13).

#### 3. Słownik

**File**: `context/domain/glossary.md`

**Intent**: Nowa nazwa w kodzie należy do istniejącego terminu.

**Contract**: W wierszu „wspólna baza pytań” kolumna kodu dostaje `private.question_base` (kopia w bazie: numer, kategoria, 18+) i `npm run questions:migration`.

#### 4. Wdrożenie

**File**: — (polecenia; każde za zgodą Karola, z domu albo hotspotu, nie z eduroam)

**Intent**: Baza przed kodem. Stary Worker działa z nowymi funkcjami, bo sygnatury i kody odmów się nie zmieniają, a numery z jego puli są w katalogu.

**Contract**:

1. `gh pr ready` i zielone CI na ostatnim SHA.
2. `npx supabase db push --dry-run`: tylko trzy migracje zmiany, w kolejności tabela → migawka → sprawdzenia.
3. `db push`, `migration list` (lokalnie = zdalnie) i `npx supabase db advisors --linked --type security` (0 błędów).
4. `npm run smoke` na serwerze dev (nowy kod na produkcyjnej bazie).
5. Scalenie przez Karola.
6. Workers Builds.
7. Smoke na produkcji.

### Success Criteria:

#### Automated Verification:

- Dokumenty zaktualizowane, `npm run lint`, `npx astro check`, `npm test`, `npm run build` zielone
- PR gotowy (nie draft), zielone `ci`, `smoke`, `db`, `e2e` na ostatnim SHA
- `npx supabase db push --dry-run` pokazuje tylko trzy migracje zmiany; `db push` i `migration list` zgodne; `db advisors` 0 błędów
- `npm run smoke` na serwerze dev zielony po `db push`
- Po scaleniu przez Karola: Workers Builds zielony, smoke na produkcji zielony
- Epilog: wpis „Wgrane migracje” w `deploy-plan.md` i Progress przez osobny PR

#### Manual Verification:

- Karol: krótka gra na produkcji (telefon i laptop). Pokój z 1–2 kategoriami bez 18+, „Zacznij grę”, „Następne pytanie”, „Pomiń pytanie”, „Przejrzyj pytania” i „Dolosuj pytanie”: pytania tylko z wybranych kategorii, bez 18+, żadnego „Spróbuj jeszcze raz”

---

## Testing Strategy

### Unit Tests:

- Zgodność najnowszej migawki z `QUESTIONS` (numery, kategorie, 18+), migawki jako jedyni pisarze katalogu.
- Brama RPC bez zmian w sygnaturach (pilnuje, że żadna funkcja nie zmieniła wejścia).
- `tests/unit/draw.test.ts` bez zmian (Worker losuje jak dziś).

### Integration Tests:

- `tests/db/question-base.test.ts`: sześć wejść numeru pytania, host z sesją i współhost jako `anon`, kandydaci spoza wyboru odpadają, a wybrani (także 18+ tam, gdzie włączone) przechodzą; `create_room` z nieznaną kategorią.
- Dawne F1 w `cohost.test.ts` i `game-length.test.ts` jako zwykłe testy z dokładną odmową.
- pgTAP: katalog bez grantów, RLS, nowa funkcja bez grantów, sygnatury bez zmian, ryzyko 8 S-11 zamknięte; scenariusze liczników na numerach wstawionych do katalogu w transakcji.
- Cały dotychczasowy zestaw bazy, smoke i e2e zielony bez zmian (grają prawdziwymi numerami z puli).

### Manual Testing Steps:

1. Faza 1: Karol czyta streszczenie dopisywania pytań i je akceptuje.
2. Faza 2: Karol akceptuje streszczenie migracji.
3. Faza 3: Karol rozgrywa krótką grę na produkcji (kroki w Fazie 3).

## Performance Considerations

`picked_candidates` łączy najwyżej 1000 kandydatów (limit 22023) z kluczem głównym katalogu i jednym wierszem pokoju. To pomijalne obok dzisiejszych zapytań o rundy i listę. Migawka to jedno `merge` na ok. 216 wierszach.

## Migration Notes

- Trzy migracje idą razem jednym `db push` przed scaleniem kodu. Są zgodne ze starym Workerem: sygnatury i kody odmów się nie zmieniają, a numery, które stary Worker wysyła, są w katalogu.
- Pokoje otwarte w chwili wdrożenia grają dalej. Ich wybór jest poprawny, a lista powstała z puli Workera.
- Wycofanie: nowa migracja przywracająca poprzednie ciała funkcji (nigdy edycja wgranej). Katalog może zostać, bo nic go wtedy nie czyta.
- Po S-17 każda zmiana `questions.ts` to nowa migawka i `db push` przed scaleniem (`deploy-plan.md`, Faza 3).

## References

- Research: `context/changes/question-pool-in-db/research.md`
- Roadmapa: `context/foundation/roadmap.md:326-337` (S-17)
- Dziura F1: `context/changes/co-host-role/reviews/plan-review.md:28-45`
- Ryzyko 8 S-11: `context/archive/2026-10-26-question-reactions-play-data/research.md:273-275`
- Kandydaci od Workera (D1): `context/archive/2026-10-15-full-game-evening/research.md:104-113`
- Wzór funkcji `private` bez grantów: `supabase/migrations/20261107091322_game_length.sql:78-93`
- Reguła FR-005 w Workerze: `src/lib/rounds/draw.ts:26-34`
- Przepisy testów: `context/foundation/test-plan.md` §6.1, §6.2

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: Katalog wspólnej bazy pytań w bazie

#### Automated

- [x] 1.1 `npm run questions:migration` uruchomiony raz tworzy dokładnie jeden plik `*_question_base_snapshot.sql` z 216 wierszami, późniejszy niż `*_question_base.sql` — ccf162b
- [x] 1.2 `npm test` zielony, z `tests/unit/question-base-snapshot.test.ts` — ccf162b
- [x] 1.3 Próbny alarm lokalny: usunięty jeden wiersz migawki, a osobno zmieniony jeden znacznik 18+ zaczerwieniają tylko test zgodności (po cofnięciu zielono, bez commita) — ccf162b
- [x] 1.4 `npm run lint`, `npx astro check`, `npm run build` zielone — ccf162b
- [x] 1.5 Draft PR (push za zgodą Karola): zielone `ci`, `smoke`, `db` (z pgTAP) i `e2e` — ccf162b

#### Manual

- [x] 1.6 Karol akceptuje sposób dopisywania pytań (streszczenie 3–5 linii: komenda, PR, `db push`, scalenie) — ccf162b

### Phase 2: Sprawdzenie w ruchach prowadzącego

#### Automated

- [x] 2.1 `npm test` (brama RPC z nowymi odnośnikami), `npm run lint`, `npx astro check`, `npm run build` zielone
- [ ] 2.2 CI na PR: `db` zielony z nowym `question-base.test.ts`, dawnymi testami F1 bez `it.fails` i pgTAP z nowymi asercjami; `ci`, `smoke`, `e2e` zielone
- [ ] 2.3 Próbny alarm (a) + (b) w CI trafił dokładnie w przewidziane testy, revert znów zielony
- [ ] 2.4 `git diff main...HEAD -- supabase/migrations` pokazuje tylko trzy migracje zmiany

#### Manual

- [ ] 2.5 Karol akceptuje streszczenie migracji (co baza teraz odmawia i czego gra na ekranie nie zauważy)

### Phase 3: Dokumenty i wdrożenie

#### Automated

- [ ] 3.1 Dokumenty zaktualizowane, `npm run lint`, `npx astro check`, `npm test`, `npm run build` zielone
- [ ] 3.2 PR gotowy (nie draft), zielone `ci`, `smoke`, `db`, `e2e` na ostatnim SHA
- [ ] 3.3 `npx supabase db push --dry-run` pokazuje tylko trzy migracje zmiany; `db push` i `migration list` zgodne; `db advisors` 0 błędów
- [ ] 3.4 `npm run smoke` na serwerze dev zielony po `db push`
- [ ] 3.5 Po scaleniu przez Karola: Workers Builds zielony, smoke na produkcji zielony
- [ ] 3.6 Epilog: wpis „Wgrane migracje” w `deploy-plan.md` i Progress przez osobny PR

#### Manual

- [ ] 3.7 Karol: krótka gra na produkcji (telefon i laptop). Pokój z 1–2 kategoriami bez 18+, „Zacznij grę”, „Następne pytanie”, „Pomiń pytanie”, „Przejrzyj pytania” i „Dolosuj pytanie”: pytania tylko z wybranych kategorii, bez 18+, żadnego „Spróbuj jeszcze raz”
