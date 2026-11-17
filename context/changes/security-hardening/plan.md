# Poprawki z przeglądu bezpieczeństwa (punkt H) Implementation Plan

## Overview

Zmiana domyka punkt 5 nowej kolejki (H, drobiazgi techniczne) po przeglądzie bezpieczeństwa całej gry z 16.11.2026 (`security-review.md`). Jedna migracja zamyka w bazie stare wejście `p_question_id` (S-20 F3), dokłada sufit 50 graczy w pokoju, limit 60 nowych gier na konto na godzinę (DB-1) i limit listy kategorii (DB-5). Serwer i przeglądarka dostają poprawki z przeglądu: głos nie trafia do adresu strony przed załadowaniem wyspy (B-1), strony mają nagłówki bezpieczeństwa i `no-store` (W-4), formularze i `ring` czytają treść z limitem (W-3, W-2), a ciasteczka, klucz i logi logowania są domknięte (W-7, W-8, W-9). Repo dostaje ostrzejsze pytania o zgodę dla agenta (R-2, R-4), `permissions` w CI i pełniejszy `.gitignore` (R-8).

Decyzje Karola (16.11.2026, `change.md`): zakres z przeglądu „tak”, sufit 50 graczy „tak”, śledzenie błędów zostaje w Parked do pierwszego wieczoru, a ten plan bez pytań merytorycznych (liczby i teksty ustala plan, Karol może je zmienić).

## Current State Analysis

- **Głos przed załadowaniem wyspy (B-1).** `src/components/room/RoundVoting.tsx:374` renderuje `<form onSubmit={handleSubmit} noValidate>` bez `method` i `action`. Radio mają `name={`${idPrefix}vote`}` i `value={index}` (`:385-390`), a „Zagłosuj” to zwykły `type="submit"` z `aria-disabled` tylko w trakcie wysyłki (`:440-443`). `RoomScreen` jest `client:load` (`src/pages/r/[id].astro:92`), więc HTML z serwera ma ten formularz. Klik przed hydracją robi GET `/r/<id>?vote=<numer>`: numer miejsca trafia do paska adresu, historii, Workera i logów wywołań Cloudflare (`wrangler.jsonc:11-12`). Sprawdzone renderem `renderToStaticMarkup`. To jedyny formularz w grze z nazwanymi polami bez `method`.
- **`start_game` (F3).** `public.start_game(p_room_id uuid, p_question_id text default null, p_player_token text default null, p_candidates text[] default null)` (`supabase/migrations/20261115095052_no_recent_repeats.sql:119-124`). Bez listy i bez `p_candidates` runda 1 to `p_question_id` (`:187-193`), z odmową `invalid_question`, gdy pytania nie ma w wyborze pokoju. Worker (`src/lib/rooms/server.ts:414-427`), smoke i e2e wysyłają tylko `p_candidates`. `p_question_id` wysyłają testy: `tests/db/support/rounds.ts` (`startGame` `:349-355`, `seedStartGame` `:623-628`, 28 wywołań w 13 plikach), bezpośrednie `startGame` w `cohost`, `game-length`, `proposals`, `question-base`, `question-list`, `round-rules`, oraz pgTAP `round_creator_view.test.sql` (`host_starts` `:215-221`). Pomocnik `startGameWithCandidates` (`rounds.ts:360-367`) już istnieje.
- **Brak sufitu graczy.** Nowy wiersz `public.players` dodają: `create_room` (host), `join_room` (`20261031090821_player_color_choice.sql:219-223`, tylko poczekalnia) i `admit_latecomer` w ścieżce spóźnionego (`20261103151953_rejoin_after_refresh.sql:481-485`). Ścieżka powrotu (`:439-476`) przenosi istniejące miejsce i nie dodaje wiersza. `request_join` (`:181`) dodaje tylko prośbę. Wszystkie trzy blokują wiersz pokoju `for update` (`join_room :189-192`, `admit_latecomer :412-415`, `request_join :101-104`), więc liczenie graczy pod tą blokadą jest bez wyścigu. PRD mówi „brak limitu graczy” (`context/foundation/prd.md:156`), roadmapa trzyma sufit w Parked (`roadmap.md:452`).
- **Brak limitu zakładania gier (DB-1).** `create_room` (`20261113162527_question_base_checks.sql:93-179`) zamyka poprzedni otwarty pokój hosta i wstawia nowy pokój z hostem. Nic nie liczy, ile gier konto założyło. `rooms.created_at timestamptz default now()` istnieje (`room_lobby.sql:28`), indeks `rooms_by_host(host_id)` też (`no_recent_repeats.sql:50`). `delete_game` kasuje wiersz pokoju, więc skasowana gra wypada z licznika.
- **Ile gier na konto robią testy (do wyboru limitu):** e2e jedno konto, 30 + 7 = 37 gier na przebieg (`playwright.config.ts:17-22`, ponowienia do 2 razy); `tests/db` nowy host na plik, najwięcej 27 (`nicks.test.ts:59-66`); pgTAP nowy użytkownik na pokój, najwięcej 3; smoke 2 na przebieg (na produkcji jedno stałe konto, więc przebiegi w tej samej godzinie się sumują). Limit 60 zostawia zapas nad 37.
- **Lista kategorii (DB-5).** `create_room :129-134` sprawdza niepustość, brak nulli, `<@` wobec kategorii `private.question_base` i 18+ jako podzbiór. Brak limitu długości i powtórzeń. Worker wysyła listę bez powtórzeń, najwyżej 14 (`src/pages/api/rooms/index.ts:42-58`).
- **Serwer.**
  - `src/middleware.ts` to jeden `defineMiddleware`: klient Supabase i użytkownik (`:9-15`), przekierowania z `/auth/*` (`:20-27`), strażnik `/gry` (`:29-33`), potem `next()` (`:35`). Nikt nie ustawia nagłówków bezpieczeństwa ani `Cache-Control` na stronach (W-4). Pliki statyczne nie przechodzą przez middleware (adapter serwuje je przed `app.render`, brak `run_worker_first`). Żadna strona nie jest prerenderowana, nic nie osadza gry w `iframe`.
  - Trasy formularzy czytają `formData()` bez limitu i połykają błąd `.catch(() => null)` (W-3): `src/pages/api/rooms/join.ts:38`, `src/pages/api/rooms/index.ts:47`, `src/pages/api/auth/signin.ts:8`, `src/pages/api/auth/oauth.ts:18`. Wszyscy nadawcy wysyłają `application/x-www-form-urlencoded` (formularze bez `enctype`, smoke, e2e).
  - `src/pages/api/live-sync/ring.ts:12` czyta `request.json()` bez limitu i odpowiada bez `no-store` (W-2). Używa go tylko sonda (`scripts/live-sync-probe.mjs`) i `/dev/live-sync`; `docs/development.md:212` zostawia go na produkcji celowo.
  - `src/lib/supabase.ts:11` daje ciasteczkom sesji tylko `httpOnly`, bez `secure` (W-7); `createClient` sprawdza tylko obecność klucza (`:6`), przedrostek `sb_publishable_` sprawdza tylko `getPublicSupabaseConfig` (`:28`) (W-8).
  - `console.error` zamiast `logEvent` w `src/pages/api/auth/callback.ts:28,47`, `oauth.ts:42`, `signin.ts:26` i `src/lib/auth-user.ts:16` (W-9). Pola logu: `LOG_FIELDS` (`src/lib/log.ts:13-27`), pilnuje ich `tests/unit/log.test.ts:10-24`; `tests/unit/auth-user.test.ts:54` oczekuje dziś `{name, status, code}`.
- **Repo.** `.claude/settings.json:4-6` zezwala na `npm *`, `npx *`, `node *`, a `ask` łapie tylko dosłowne przedrostki (np. `npx wrangler deploy`), więc `npx -y wrangler deploy`, `npm exec …`, `npx supabase@2 db push` i `npx supabase config push` przechodzą bez pytania (R-2). `gh pr merge` nie jest na żadnej liście (R-4). `ci.yml` nie ma bloku `permissions` (R-8). `.gitignore` ma `.env` i `.env.production`, ale nie `.env.*`, `.dev.vars.*` ani `.claude/settings.local.json` (R-8). Żywy link do repo pod starą nazwą konta: `context/deployment/deploy-plan.md:6` (R-1).

## Desired End State

- Żaden klik przed załadowaniem wyspy nie wyśle głosu w adresie: w HTML z serwera „Zagłosuj” ma `disabled`, po hydracji działa jak dziś.
- Baza:
  - `start_game` ma tę samą sygnaturę, ale bez listy i bez `p_candidates` odmawia `no_questions`; `p_question_id` nic nie znaczy;
  - pokój nie przyjmie 51. gracza (`room_full` przy dołączeniu, prośbie spóźnionego i „Wpuść”);
  - konto nie założy 61. gry w ciągu godziny (`too_many_games`);
  - lista kategorii jest bez powtórzeń i nie dłuższa niż liczba kategorii bazy, a lista 18+ bez powtórzeń i nie dłuższa niż lista kategorii;
  - w pełnym pokoju gracz, który wpisze swój nick, dalej dostaje „To ty? Poproś o powrót” (`nick_taken` przed `room_full`).
- Gość widzi „W tym pokoju jest już 50 graczy…”, prowadzący przy „Wpuść” tę samą treść, a host przy zakładaniu gry tekst o limicie.
- Każda odpowiedź Workera z middleware ma `X-Frame-Options: DENY`, `Referrer-Policy: same-origin`, `X-Content-Type-Options: nosniff`, a strony i przekierowania także `Cache-Control: no-store`.
- Trasy formularzy i `ring` odrzucają treść ponad 4096 bajtów przed jej przeczytaniem, z linią `logEvent` zamiast połkniętego błędu.
- Ciasteczka sesji mają `Secure` poza serwerem dev, Worker z kluczem bez przedrostka `sb_publishable_` nie tworzy klienta, logowanie loguje przez `logEvent`.
- Agent dostaje pytanie o zgodę przy każdym `npx wrangler`, `npx supabase`, `npx -y`/`--yes`/`-p`, `npm exec`, `gh pr merge` i zapisie przez `gh api`.
- PRD mówi o suficie 50 graczy, roadmapa ma slice tej zmiany, a sufit znika z Parked.

Weryfikacja: bramka i CI (`ci`, `smoke`, `db`, `e2e`) zielone; próbne alarmy trafiają dokładnie w przewidziane testy; smoke na produkcji po wdrożeniu widzi nowe nagłówki.

### Key Discoveries:

- `tests/unit/room-rpc-gate.test.ts:83-88` ma `p_question_id hasDefault:true`, a parametr bez wartości domyślnej musi wysyłać Worker (`:580-583`), więc `p_question_id` zostaje z `default null`.
- pgTAP `versions_of` (`round_creator_view.test.sql:582-590`, `:1447-1451`, `:2039-2043`) porównuje nazwy i typy parametrów `start_game`, więc sygnatura nie może się zmienić.
- `invalid_question` zwraca tylko `start_game` (`src/lib/rooms/errors.ts:22,80`, `tests/unit/room-errors.test.ts:47`); po F3 kod znika z gry.
- `tests/unit/room-errors.test.ts:9-22,43-73,110-113` trzyma ręczne listy `GUEST_REFUSALS` i `PLANNED_ROUND_REFUSALS` i wymaga osobnego tekstu dla każdego kodu.
- pgTAP odrzuca w schemacie `private` kolumny czasu (`round_creator_view.test.sql:1229-1231`), więc limit gier liczy z `public.rooms.created_at`, bez nowej tabeli.
- Brak hooka „po hydracji” w kodzie; `useSyncExternalStore(subscribe, () => true, () => false)` daje `false` na serwerze i w hydracji, a `true` od razu przy montowaniu po hydracji, bez efektu i bez wyłączania reguły lint. Playwright traktuje `disabled` jak nieaktywny i czeka (`castVote` w `tests/e2e/support/round.ts:30-37`).
- Testy jednostkowe działają w node bez jsdom (`vitest.config.ts:19`), ale `react-dom/server` renderuje `RoundVoting` w `.test.ts` (sprawdzone), a import `.tsx` w testach już jest (`tests/unit/host-actions.test.ts:2`).
- Middleware importuje `astro:middleware` i `astro:env`, których Vitest nie ładuje (`vitest.config.ts:4-5`); wzór: czysta funkcja w `src/lib/` z testem, jak `readUser` w `src/lib/auth-user.ts`.
- Odpowiedzi z `context.redirect` mają zmienne nagłówki; żadna trasa nie zwraca `Response.redirect` ani pobranej odpowiedzi.

## What We're NOT Doing

- CSP (B-2) i nicki-sobowtóry (B-3): przy czacie (punkt B kolejki), bo dziś nie ma punktu wstrzyknięcia, a CSP zależy od dostawcy gifów.
- Ogranicznik żądań i dziennego limitu Workera (W-1): wymaga własnej domeny z regułą WAF.
- Kolejność blokady w funkcjach rundy (DB-4): przegląd wszystkich funkcji naraz, osobna zmiana, jeśli ktoś nadużyje.
- DB-2 (współprowadzący przejmuje miejsce gościa), DB-3 (kolejka próśb), DB-6, W-5 (logi `client-events`), W-6 (logowanie hasłem), R-5 (`ai-review.yml` z kodem PR), R-7 (ścieżka hooków), przypinanie akcji po SHA: przyjęte jako granice gry dla znajomych.
- Aktualizacja `astro` i `wrangler` (R-6): osobna mała zmiana.
- Śledzenie błędów i metryki: w Parked do pierwszego wieczoru (decyzja Karola).
- Wyłączenie `ring` i `state` na produkcji: zostają dla sondy (`docs/development.md:212`), dostają tylko limit treści.
- Zmiana nazwy konta GitHub i historii repo (R-1): świadoma decyzja Karola z 31.10; poprawiamy tylko żywy link.

## Implementation Approach

Baza pierwsza, jak przy S-20: Faza 1 to migracja z testami bazy i pgTAP oraz tekstami nowych odmów, w draft PR, żeby CI (`db`) sprawdziło ją osobno. Faza 2 to Worker i ekran: każda poprawka idzie wzorem, który kod już ma (`readJsonRequest`, `jsonAnswer`, `logEvent`, czysta funkcja w `src/lib/` z testem). Faza 3 to repo, dokumenty i wdrożenie: `db push` przed scaleniem (baza, potem kod), bo stary Worker działa z nową bazą (wysyła `p_candidates`, a nowe kody pokaże ogólnym tekstem do scalenia).

## Critical Implementation Details

- **Najnowsze definicje.** Każdą zastępowaną funkcję kopiuj z ostatniej migracji, która ją definiuje. Źródła sprawdzone 16.11.2026 (przegląd planu, F1): `start_game` z `20261115095052_no_recent_repeats.sql:119` (po `drop` w `:107`, więc `create function`, nie `create or replace`), `join_room` z `20261031090821_player_color_choice.sql:165`, `request_join` z `20261103151953_rejoin_after_refresh.sql:76`, `admit_latecomer` z `20261103151953_rejoin_after_refresh.sql:390`, `create_room` z `20261113162527_question_base_checks.sql:93`. Przed kopiowaniem potwierdź je poleceniem `grep -nE "create (or replace )?function public\.<nazwa>\(" supabase/migrations/*.sql` (ostatni plik wygrywa); samo `create or replace` w wzorcu gubi `start_game`.
- **Kolejność w `create_room`.** Limit gier i limit kategorii sprawdzaj po sesji, a przed zamknięciem poprzedniego pokoju i `drop_round_state`, żeby odmowa niczego nie zmieniała. Licznik obejmuje pokój otwarty i zamknięte z ostatniej godziny (`created_at > now() - interval '1 hour'`), więc 60 gier w godzinie przechodzi, a 61. nie.
- **Sufit liczy graczy pokoju, z hostem.** Sprawdzenie stoi pod istniejącą blokadą wiersza pokoju, przed wstawieniem. Ścieżka powrotu w `admit_latecomer` i `request_return` nie liczy się (przenosi istniejące miejsce).
- **Zajęty nick przed sufitem (F2).** `join_room` wykrywa dziś zajęty nick dopiero przy wstawieniu (`unique_violation`, `player_color_choice.sql:218-230`). Tylko `nick_taken` daje gościowi „To ty? Poproś o powrót” (`src/pages/api/rooms/join.ts:125`, `src/pages/j/[token].astro:88-92`), więc w pełnym pokoju gracz bez ciasteczka, który wpisze swój nick, musi dalej dostać `nick_taken`, nie `room_full`. Dlatego w `join_room` i `request_join` najpierw sprawdzenie zajętego nicka (`players.nick_key` pokoju), potem sufit.

## Faza 1: Baza: stare wejście, sufit, limity

### Overview

Jedna migracja i testy. Po tej fazie baza w CI odmawia `room_full`, `too_many_games`, za długiej listy kategorii, a `start_game` bez puli odmawia `no_questions`. Worker zna teksty nowych kodów.

### Changes Required:

#### 1. Migracja

**File**: `supabase/migrations/<timestamp>_security_hardening.sql` (przez `npx supabase migration new security_hardening < /dev/null`, jak w `context/foundation/test-plan.md:272`; tworzy tylko plik lokalnie)

**Intent**: Zamknąć w bazie F3, sufit, DB-1 i DB-5 w jednym pliku, z nagłówkiem jak w poprzednich migracjach (id zmiany, plan, decyzje, kolejność wdrożenia, notka o anonimowości: zmiana nie dotyka urny ani głosów, „Never edit this file once it has been pushed”).

**Contract**:

- `public.start_game`: sygnatura i wartości domyślne bez zmian. Bez listy pytań gry i bez `p_candidates` zwraca `{ok:false, reason:'no_questions'}`; gałąź z `p_question_id` znika, parametr zostaje bez znaczenia (komentarz: tylko dla sygnatury i bramy RPC).
- `public.join_room`: w poczekalni, pod blokadą pokoju, najpierw zajęty nick (`nick_taken`, jak dziś), potem: gdy pokój ma już 50 graczy (`count(*)` z `public.players` pokoju, host wliczony), zwraca `{ok:false, reason:'room_full'}` przed wstawieniem.
- `public.request_join`: po sprawdzeniu `nick_taken`, a przed oboma zapisami prośby spóźnionego (wstawienie nowej i odnowienie odrzuconej, `update … status = 'pending'`, `rejoin_after_refresh.sql:169-172`) to samo sprawdzenie sufitu (`room_full`), żeby spóźniony nie czekał na „Wpuść”, które i tak odmówi.
- `public.admit_latecomer`: w ścieżce spóźnionego (nie powrotu) to samo sprawdzenie przed wstawieniem gracza; odmowa `room_full`, prośba zostaje (prowadzący może ją odrzucić).
- `public.create_room`: `invalid_categories`, gdy `p_categories` ma więcej pozycji niż `count(distinct category)` z `private.question_base` albo ma powtórzenia, i tak samo, gdy `p_adult_categories` ma powtórzenia albo więcej pozycji niż `p_categories` (F4: lista 18+ przechodziła dotąd tylko przez `<@`). Najpierw tanie sprawdzenia długości (`cardinality`), potem powtórzenia, potem istniejące `<@`. `too_many_games`, gdy konto ma co najmniej 60 pokoi z `created_at` w ostatniej godzinie.
- Sufit 50 i limit 60 jako stałe w kodzie funkcji z komentarzem (PRD, decyzja Karola 16.11.2026; 60 ponad 37 gier e2e na jednym koncie).
- Na końcu dla każdej zastąpionej funkcji: `alter function … owner to postgres`, `revoke execute … from public, anon, authenticated`, te same `grant` co w poprzedniej definicji.

#### 2. Testy bazy: pomocnicy i stare wywołania

**File**: `tests/db/support/rounds.ts`, `tests/db/cohost.test.ts`, `tests/db/game-length.test.ts`, `tests/db/proposals.test.ts`, `tests/db/question-base.test.ts`, `tests/db/question-list.test.ts`, `tests/db/round-rules.test.ts`, `tests/unit/room-rpc-gate.test.ts` (komentarze), `src/lib/rooms/server.ts` (komentarz)

**Intent**: Testy startują grę pulą jednego pytania, bo `p_question_id` nic już nie znaczy.

**Contract**: `startGame` i `seedStartGame` wysyłają `p_candidates: [questionId]` zamiast `p_question_id` (nazwy i parametry pomocników bez zmian, więc 28 wywołań `seedStartGame` nie wymaga edycji). Oczekiwane `invalid_question` zmieniają się na `no_questions` (`question-base.test.ts:188-193`, `round-rules.test.ts:380-386`), z poprawionymi opisami testów. Komentarz w `rounds.ts:17` bez `invalid_question`. Komentarze, które wskazują migrację każdej zastępowanej funkcji (`room-rpc-gate.test.ts:44,54,60,82,135`), wskazują nową migrację; komentarz `server.ts:410-413` nie mówi już, że baza trzyma `p_question_id` dla testów (F7).

#### 3. Testy bazy: sufit i lista kategorii

**File**: nowy `tests/db/room-limits.test.ts`; `tests/db/question-base.test.ts`

**Intent**: Dowód sufitu w trzech wejściach i limitu listy kategorii przez REST/RPC, jak gracz i host.

**Contract**:

- Pokój z hostem i 49 gośćmi: 51. `join_room` dostaje dokładnie `room_full`, a po `remove_player` jednego gościa dołączenie przechodzi.
- Pokój pełny w trakcie gry: `request_join` spóźnionego dostaje `room_full`.
- Prośba spóźnionego złożona przy 49 graczach, potem pokój zapełniony do 50: „Wpuść” (`admit_latecomer`) dostaje `room_full`.
- Powrót na swoje miejsce przy pełnym pokoju (ścieżka `request_return` + `admit_latecomer`) przechodzi.
- Pełna poczekalnia, `join_room` z nickiem gracza, który już jest w pokoju: dokładnie `nick_taken` (F2).
- Pełny pokój w trakcie gry, `request_join` z nickiem gracza z pokoju: dokładnie `nick_taken` (F2).
- Spóźniony odrzucony przy wolnym miejscu prosi ponownie, gdy pokój jest już pełny: `room_full` (gałąź odnowienia, F2).
- `create_room` z powtórzoną kategorią, z listą dłuższą niż liczba kategorii bazy, z powtórzoną kategorią 18+ i z listą 18+ dłuższą niż `p_categories` dostaje `invalid_categories` (obok `question-base.test.ts:130`).

#### 4. pgTAP

**File**: `supabase/tests/round_creator_view.test.sql`

**Intent**: Pomocnicy startują pulą, a limit gier sprawdzamy tutaj, bo tylko widok twórcy może cofnąć `created_at`.

**Contract**: `host_starts` i `host_starts_with` wołają `start_game` z `p_candidates` jednego pytania (sygnatura w `versions_of` bez zmian). Nowe asercje: host z 59 pokojami z ostatniej godziny (wstawionymi bezpośrednio, zamkniętymi) zakłada 60. grę, a 61. dostaje `too_many_games`; pokój sprzed 61 minut się nie liczy. `function_facts` dla zastąpionych funkcji bez zmian (definer, właściciel, `search_path`, granty). Zwiększ `plan(n)` o nowe asercje.

#### 5. Teksty nowych odmów

**File**: `src/lib/rooms/errors.ts`, `tests/unit/room-errors.test.ts`

**Intent**: Gość, prowadzący i host widzą zrozumiały tekst nowych odmów, a martwy `invalid_question` znika.

**Contract**:

- `room_full`: „W tym pokoju jest już 50 graczy. Więcej się nie zmieści.” W `ROUND_REFUSALS` (odpowiedź 409 na „Wpuść”) i w `MESSAGES`; w teście w `GUEST_REFUSALS` i `PLANNED_ROUND_REFUSALS`.
- `too_many_games`: „W ciągu godziny można założyć najwyżej 60 gier. Spróbuj trochę później.” W `MESSAGES` (formularz nowej gry, `/?error=`); w teście na liście kodów hosta, żeby test pilnował osobnego tekstu (F7).
- `invalid_question` usunięty z `ROUND_REFUSALS`, `MESSAGES` i list w teście.
- Trasy bez zmian: każda przepuszcza kod odmowy dalej (`refusal()` w `src/lib/rooms/server.ts:132`, `?error=` w `join.ts:106,125` i `index.ts:72`, `actionAnswer` z 409 dla nieznanego kodu w `json-route.ts:199-204`; sprawdzone w przeglądzie planu, F6).

#### 6. Budżet gier w testach (F10)

**File**: `playwright.config.ts`, `context/foundation/test-plan.md`

**Intent**: Następny, kto dopisze specyfikację e2e, wie, że jedno konto ma limit 60 nowych gier na godzinę.

**Contract**: Przy regule „jedno konto” (`playwright.config.ts:17-19`) i w `test-plan.md` §6.4 zdanie: e2e otwiera dziś 37 gier na przebieg (plus jedna na każdą ponowioną specyfikację), baza przyjmuje 60 na godzinę; przy około 45 rozdzielić konta. W `test-plan.md:214` liczba kont `tests/db` na przebieg o jeden większa (`room-limits`), a opis `question-base` bez `invalid_question` (F7).

#### 7. Próbny alarm (a)

**File**: tymczasowy commit na gałęzi (test-plan §6.2, „Break-check”)

**Intent**: Dowód, że nowe testy świecą na czerwono, gdy sufit i limit gier pękną.

**Contract**: Jeden commit usuwa w migracji zmiany (jeszcze nie na produkcji) sprawdzenie sufitu w `join_room`, `request_join` i `admit_latecomer` oraz limit w `create_room`. W opisie commita lista przewidzianych czerwonych testów: cztery przypadki sufitu z `room-limits.test.ts` (`join_room`, `request_join`, „Wpuść”, odnowiona prośba) i asercja `too_many_games` w pgTAP. Zielone zostają: powrót przy pełnym pokoju, oba przypadki `nick_taken` w pełnym pokoju, testy kategorii, reszta plików. Potem push, porównanie z CI i `git revert`. Nigdy `db push` tymczasowego stanu.

### Success Criteria:

#### Automated Verification:

- `npm test` (room-errors z nowymi kodami, brama RPC bez zmian), `npm run lint`, `npx astro check`, `npm run build` zielone
- CI na draft PR: `db` zielony z `room-limits.test.ts`, poprawionymi pomocnikami i plikami oraz pgTAP z nowymi asercjami; `ci`, `smoke`, `e2e` zielone
- Próbny alarm (a) w CI trafił dokładnie w przewidziane testy, revert znów zielony
- `git diff main...HEAD -- supabase/migrations` pokazuje tylko migrację zmiany

#### Manual Verification:

- Karol akceptuje streszczenie migracji (3–5 linii: co baza teraz odmawia i czego gracz nie zauważy)

**Implementation Note**: Po zielonej automatyce tej fazy zatrzymaj się na akceptację Karola, zanim ruszy Faza 2.

---

## Faza 2: Serwer i przeglądarka

### Overview

Poprawki B-1, W-2, W-3, W-4, W-7, W-8, W-9, każda wzorem, który kod już ma, z testem jednostkowym.

### Changes Required:

#### 1. „Zagłosuj” dopiero po hydracji (B-1)

**File**: `src/components/room/RoundVoting.tsx`; nowy mały hook (np. `src/components/room/useHydrated.ts`); nowy test `tests/unit/round-voting-ssr.test.ts`

**Intent**: Przed hydracją przycisk głosu jest nieaktywny, więc przeglądarka nie wyśle formularza sama, a głos nie trafi do adresu.

**Contract**: Hook zwraca `useSyncExternalStore(subscribeNever, () => true, () => false)`, gdzie `subscribeNever` (`() => () => {}`) to stała na poziomie modułu, żeby React nie podpinał jej od nowa przy każdym renderze (F9). „Zagłosuj” dostaje `disabled={!hydrated}`, a `aria-disabled={voting || undefined}` zostaje dla wysyłki (wzór `BUSY_BUTTON`, focus przy odmowie). Test renderuje `RoundVoting` przez `react-dom/server` (`createElement`, propsy fazy głosowania) i sprawdza, że przycisk submit w HTML ma `disabled`, a radio dalej mają `name` (grupowanie strzałkami zostaje).

#### 2. Nagłówki bezpieczeństwa (W-4)

**File**: nowy `src/lib/security-headers.ts`, `src/middleware.ts`, nowy `tests/unit/security-headers.test.ts`, `scripts/smoke.mjs`

**Intent**: Strony z kluczem kanału, linkiem pokoju i nickami nie zostają w pamięci przeglądarki ani pośrednika, a gry nie da się osadzić w cudzej ramce.

**Contract**:

- Czysta funkcja dokłada do odpowiedzi `X-Frame-Options: DENY`, `Referrer-Policy: same-origin`, `X-Content-Type-Options: nosniff` i `Cache-Control: no-store`, gdy odpowiedź nie ma własnego `Cache-Control`.
- Middleware stosuje ją do każdej odpowiedzi, którą zwraca: przekierowań (`:20-33`) i `next()`, zawsze przez `headers.set` na tej samej odpowiedzi, bez kopii. Nagłówki tych odpowiedzi są zmienne: `context.redirect` w Astro 7.3.2 to `new Response(null, { headers })` (`node_modules/astro/dist/core/fetch/fetch-state.js:403`), a żadna trasa nie zwraca `Response.redirect` ani pobranej odpowiedzi (F8).
- Test funkcji: wszystkie cztery nagłówki, zachowany istniejący `Cache-Control`, przekierowanie z `Location` bez zmian.
- Smoke: `request()` oddaje też nagłówki, a nowy krok sprawdza `x-frame-options` i `cache-control: no-store` na stronie głównej i na `/r/<id>`, oraz `x-frame-options` na przekierowaniu `/gry` bez sesji (302) i na jednej trasie `/api/…`, żeby sprawdzić podpięcie w middleware, nie tylko funkcję (F8).

#### 3. Formularze z limitem treści (W-3)

**File**: `src/lib/rooms/json-route.ts`, `src/pages/api/rooms/join.ts`, `src/pages/api/rooms/index.ts`, `src/pages/api/auth/signin.ts`, `src/pages/api/auth/oauth.ts`, `tests/unit/json-route.test.ts`

**Intent**: Publiczne trasy formularzy nie czytają treści dowolnej długości i nie połykają błędu odczytu.

**Contract**:

- Nowa eksportowana funkcja obok `readJsonRequest` (np. `readFormRequest(request, op)`) czyta treść tym samym limitem (`Content-Length` ponad 4096 albo zła wartość: odmowa bez czytania; bez nagłówka: `readLimited`).
- Akceptuje tylko `application/x-www-form-urlencoded`, parsuje przez `new URLSearchParams` i zwraca je albo odmowę, logując `logEvent("warn", { op, step: "body", status: 400, code })`.
- Każda trasa zastępuje `formData().catch(() => null)` tą funkcją i przy odmowie idzie tą samą drogą co dziś przy złym formularzu (`/j/invalid`, `/?error=invalid_categories`, `missing_fields`, `unsupported_provider`). `formStrings` (`index.ts:35-37`) działa na `URLSearchParams.getAll`.
- Testy: za duży `Content-Length`, strumień 4097 bajtów, zły typ treści, poprawny formularz z powtórzonym polem.

#### 4. `ring` jak inne trasy JSON (W-2)

**File**: `src/pages/api/live-sync/ring.ts`

**Intent**: Ostatnia trasa JSON bez limitu treści czyta ją przez `readJsonRequest` i odpowiada z `no-store`.

**Contract**: Treść przez `readJsonRequest(context.request, "ring")`, odpowiedzi przez `jsonAnswer`. Sprawdzenie zalogowania i walidacja `room`/`seq` bez zmian. Bez `refuseForeignPost`, bo sonda Node nie wysyła `Origin` (`docs/development.md:212`). Sonda działa dalej (sprawdzenie ręczne nie jest potrzebne, bo zmienia się tylko odczyt treści, a test `json-route` go pokrywa).

#### 5. Ciasteczka, klucz, logi logowania (W-7, W-8, W-9)

**File**: `src/lib/supabase.ts`, nowy czysty predykat (np. `isPublishableKey` w module bez `astro:env`), `src/pages/api/auth/callback.ts`, `src/pages/api/auth/oauth.ts`, `src/pages/api/auth/signin.ts`, `src/lib/auth-user.ts`, `tests/unit/auth-user.test.ts`, nowy albo istniejący test predykatu

**Intent**: Sesja nie jedzie po http na własnej domenie, Worker z kluczem sekretnym nie rusza, a logowanie loguje tylko dozwolone pola.

**Contract**:

- `cookieOptions` w `createClient` dostaje `secure: !import.meta.env.DEV` (e2e i CI to build na `http://localhost`, który Chromium i Playwright traktują jak bezpieczny; smoke trzyma ciasteczka ręcznie). Komentarz przy tym w `src/lib/supabase.ts` (F5): ciasteczko gracza bierze `secure` z protokołu żądania (`src/lib/rooms/tokens.ts:35-44`), a ciasteczka sesji nie, więc build otwarty z telefonu po `http://<IP w sieci domowej>` wpuści gracza, ale nie zaloguje hosta.
- `createClient` i `getPublicSupabaseConfig` używają tego samego predykatu przedrostka `sb_publishable_`; przy złym kluczu `createClient` zwraca `null` (wywołujący już obsługują `null` jako 503).
- Każdy `console.error` w trasach logowania i w `auth-user.ts` przechodzi na `logEvent("error" | "warn", { op, step, status, code, errName })` z pól `LOG_FIELDS`. `auth-user.test.ts:54` oczekuje nowego kształtu.
- Smoke na `https` sprawdza `Secure` przy `-auth-token`, obok istniejącego `HttpOnly` (`smoke.mjs:55,125,140,150`).

#### 6. Próbny alarm (b)

**File**: tymczasowy commit na gałęzi

**Intent**: Dowód, że test B-1 świeci na czerwono, gdy przycisk znów jest aktywny przed hydracją.

**Contract**: Commit usuwa `disabled={!hydrated}`. Czerwony ma być dokładnie test `round-voting-ssr`; reszta `npm test` i e2e zielone. Sprawdzenie lokalne (`npm test`) wystarczy, bo test jest jednostkowy. Potem `git revert`.

### Success Criteria:

#### Automated Verification:

- `npm test` (nowe testy `round-voting-ssr`, `security-headers`, `json-route`, `auth-user`, predykat klucza), `npm run lint`, `npx astro check`, `npm run build` zielone
- Próbny alarm (b) trafił dokładnie w test `round-voting-ssr`, revert znów zielony
- `grep -rn "console\.\(error\|log\)" src/pages/api/auth src/lib/auth-user.ts` nic nie znajduje, a `grep -rn "formData()" src/pages/api` nic nie znajduje
- CI na PR: `ci`, `smoke` (z nowymi krokami nagłówków), `db`, `e2e` zielone

#### Manual Verification:

- Karol na serwerze dev (laptop, `/dev/room-states`, stan głosowania) widzi „Zagłosuj” jak dotąd, a w narzędziach przeglądarki nagłówki `X-Frame-Options` i `Cache-Control: no-store` na stronie pokoju

**Implementation Note**: Po zielonej automatyce zatrzymaj się na ręczne sprawdzenie, zanim ruszy Faza 3.

---

## Faza 3: Repo, dokumenty i wdrożenie

### Overview

Pytania o zgodę dla agenta, CI, `.gitignore`, dokumenty, potem wdrożenie: baza przed kodem.

### Changes Required:

#### 1. Pytania o zgodę dla agenta (R-2, R-4)

**File**: `.claude/settings.json`

**Intent**: Agent nie wdroży gry ani nie zmieni bazy, ustawień Supabase czy repo bez pytania, nawet obejściem przedrostka.

**Contract**: W `ask` szerokie reguły bez granicy słowa zamiast dosłownych przedrostków (F3, wariant A): `Bash(npx *wrangler*)` (łapie też aliasy `wrangler2` i `cf-wrangler` z `node_modules/wrangler/package.json` oraz `npx --no-install wrangler …`), `Bash(npx *supabase*)`, `Bash(node *wrangler*)`, `Bash(node *supabase*)` (bezpośrednie `node node_modules/…`), `Bash(npx -y *)`, `Bash(npx --yes *)`, `Bash(npx -p *)`, `Bash(npx --package*)`, `Bash(npx -c*)`, `Bash(npx --call*)`, `Bash(npm exec *)`, `Bash(npm x *)`, `Bash(gh pr merge*)`, `Bash(gh repo edit*)`, `Bash(gh api *-X*)`, `Bash(gh api *--method*)`, `Bash(gh api *-f*)`, `Bash(gh api *-F*)`, `Bash(gh api *--field*)`, `Bash(gh api *--raw-field*)`, `Bash(gh api *--input*)`. Szczegółowe reguły `npx wrangler …` i `npx supabase …` objęte szerszymi znikają. Reszta `allow`, `ask`, `deny` i hooki bez zmian. `npm run test:hooks` zielony (czyta tylko komendy hooków). Przyjęty koszt: `npx supabase migration new` i `npx supabase status` też pytają, więc przebieg bez nadzoru (`claude -p`, `/10x-goal-implement`) nie założy migracji sam; jedno zdanie o tym w `docs/development.md`.

#### 2. CI i `.gitignore` (R-8)

**File**: `.github/workflows/ci.yml`, `.gitignore`

**Intent**: Token CI tylko do odczytu, jawnie; pliki z sekretami nie trafią do gita na nowej maszynie.

**Contract**: `ci.yml` dostaje na górze `permissions: contents: read`. `.gitignore` dostaje `.env.*` z wyjątkiem `!.env.example`, `.dev.vars*` i `.claude/settings.local.json`. `git status` po zmianie nie pokazuje nowych plików śledzonych ani zgubionych (`.env.example` dalej w repo).

#### 3. Dokumenty

**File**: `context/foundation/prd.md`, `context/foundation/roadmap.md` (przez `/10x-roadmap`), `context/deployment/deploy-plan.md`, `docs/development.md` (jeśli opisuje `ask` albo formularze)

**Intent**: Dokumenty mówią to, co gra robi po zmianie.

**Contract**:

- PRD `:156`: pokój mieści do 50 graczy razem z prowadzącym; 20 to poziom, na którym to sprawdzamy.
- Roadmapa przez `/10x-roadmap`: slice tej zmiany (Change ID `security-hardening`); „Sufit liczby graczy w `join_room`” zdjęty z Parked; przy „Śledzenie błędów i metryki” dopisana decyzja z 16.11.2026 (wrócić po pierwszym wieczorze).
- `deploy-plan.md:6`: link do repo pod obecnym adresem; `deploy-plan.md:118` bez `invalid_question` (F7).
- `docs/development.md`: zdanie o `ring` (limit treści, dalej dla sondy), jeśli wymienia jego zachowanie; zdanie o pytaniu przy `npx supabase …` (F3).

#### 4. Wdrożenie

**File**: brak zmian w kodzie

**Intent**: Baza przed kodem, jak przy S-20.

**Contract**:

- PR gotowy, wszystkie wymagane sprawdzenia zielone na ostatnim SHA.
- Za zgodą Karola (nie z eduroam): `npx supabase db push --dry-run` pokazuje tylko migrację zmiany, potem `db push`, `migration list` zgodne i `db advisors` bez błędów.
- Za zgodą: smoke na serwerze dev po `db push`.
- Scala Karol. Potem Workers Builds zielony i smoke na produkcji (za zgodą).
- Epilog osobnym PR: wpis w „Wgrane migracje” `deploy-plan.md` i Progress.

### Success Criteria:

#### Automated Verification:

- Dokumenty, `settings.json`, `ci.yml`, `.gitignore` zaktualizowane; `npm run lint`, `npx astro check`, `npm test`, `npm run test:hooks`, `npm run build` zielone
- PR gotowy (nie draft), zielone `ci`, `smoke`, `db`, `e2e` na ostatnim SHA
- `npx supabase db push --dry-run` pokazuje tylko migrację zmiany; `db push` i `migration list` zgodne; `db advisors` 0 błędów
- `npm run smoke` na serwerze dev zielony po `db push`
- Po scaleniu przez Karola: Workers Builds zielony, smoke na produkcji zielony (z nagłówkami i `Secure`)
- Epilog: wpis „Wgrane migracje” w `deploy-plan.md` i Progress przez osobny PR

#### Manual Verification:

- Karol na produkcji (telefon i laptop), przy najbliższej grze: dołączenie z linku, nowa gra i głos działają jak dotąd, głos oddany zaraz po otwarciu strony nie zostawia `?vote=` w adresie, a „Zagłosuj” na telefonie najwyżej chwilę po otwarciu jest przygaszony

---

## Testing Strategy

### Unit Tests:

- `round-voting-ssr`: HTML z serwera ma `disabled` na „Zagłosuj” i nazwane radio.
- `security-headers`: cztery nagłówki, zachowany `Cache-Control`, przekierowanie bez zmian.
- `json-route`: `readFormRequest` (limit z nagłówka, strumień ponad limit, zły typ, powtórzone pole).
- Predykat klucza: `sb_publishable_…` tak, `sb_secret_…`, pusty i inny nie.
- `room-errors`: nowe kody z osobnym tekstem, bez `invalid_question`.
- `auth-user`: nowy kształt linii logu.

### Integration Tests:

- `tests/db/room-limits.test.ts`: sufit w `join_room`, `request_join` (także odnowiona prośba), `admit_latecomer`; powrót przy pełnym pokoju przechodzi; zajęty nick w pełnym pokoju daje `nick_taken`.
- `tests/db/question-base.test.ts`: powtórzona kategoria i za długa lista, to samo dla listy 18+.
- pgTAP: limit 60 gier w godzinie z cofniętym `created_at`, pomocnicy startu pulą.
- Smoke: nagłówki na stronie głównej i pokoju, `Secure` na `https`.
- e2e bez nowych testów: `castVote` czeka na aktywny przycisk.

### Manual Testing Steps:

1. Serwer dev, `/dev/room-states`: stan głosowania wygląda jak dotąd, „Zagłosuj” działa po wyborze.
2. Narzędzia przeglądarki na stronie pokoju: `X-Frame-Options: DENY`, `Cache-Control: no-store`.
3. Produkcja przy najbliższej grze: dołączenie, nowa gra, głos zaraz po otwarciu strony, adres bez `?vote=`.

## Performance Considerations

Sufit to `count(*)` najwyżej 50 wierszy pod blokadą, którą funkcje już biorą. Limit gier to `count(*)` pokoi hosta z ostatniej godziny po indeksie `rooms_by_host`. Nagłówki to cztery `headers.set` na odpowiedź. `no-store` wyłącza bfcache stron gry; `useSubmitPending.ts:3-4` i tak resetuje stan po powrocie.

## Migration Notes

- Baza przed kodem: stary Worker wysyła `p_candidates`, więc nowa `start_game` go nie zepsuje; nowe kody (`room_full`, `too_many_games`) do scalenia pokaże ogólnym tekstem.
- Cofnięcie Workera do wersji sprzed S-20 przestaje działać (F3); to granica przyjęta w `no-recent-repeats/follow-ups/review-fixes.md`.
- Istniejące pokoje i dane bez zmian; pokój, który dziś ma ponad 50 graczy, nie istnieje (sprawdzane do 22).

## References

- Przegląd: `context/changes/security-hardening/security-review.md`
- Decyzje: `context/changes/security-hardening/change.md`
- F3: `context/changes/no-recent-repeats/follow-ups/review-fixes.md`
- Wzór migracji i planu z bazą przed kodem: `context/changes/no-recent-repeats/plan.md`, `supabase/migrations/20261115095052_no_recent_repeats.sql`
- Limit treści JSON: `src/lib/rooms/json-route.ts:62-118`
- Lekcja o regułach `ask`: `context/foundation/lessons.md`

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: Baza: stare wejście, sufit, limity

#### Automated

- [x] 1.1 `npm test` (room-errors z nowymi kodami, brama RPC bez zmian), `npm run lint`, `npx astro check`, `npm run build` zielone — 27499af
- [x] 1.2 CI na draft PR: `db` zielony z `room-limits.test.ts`, poprawionymi pomocnikami i plikami oraz pgTAP z nowymi asercjami; `ci`, `smoke`, `e2e` zielone — 27499af, PR #72 (`room-limits` 12/12, pgTAP 506/506)
- [x] 1.3 Próbny alarm (a) w CI trafił dokładnie w przewidziane testy, revert znów zielony — alarm 8577dd5, revert 8362de5, zielone na cca98bc (test-plan §6.2)
- [x] 1.4 `git diff main...HEAD -- supabase/migrations` pokazuje tylko migrację zmiany — 27499af

#### Manual

- [x] 1.5 Karol akceptuje streszczenie migracji (3–5 linii: co baza teraz odmawia i czego gracz nie zauważy) — „tak” 16.11.2026

### Phase 2: Serwer i przeglądarka

#### Automated

- [x] 2.1 `npm test` (nowe testy `round-voting-ssr`, `security-headers`, `json-route`, `auth-user`, predykat klucza), `npm run lint`, `npx astro check`, `npm run build` zielone — cefbfce
- [x] 2.2 Próbny alarm (b) trafił dokładnie w test `round-voting-ssr`, revert znów zielony (lokalnie, bez commita: bez `disabled={!hydrated}` czerwony tylko „comes with its one submit button disabled”, 2146 zielonych) — cefbfce
- [x] 2.3 `grep -rn "console\.\(error\|log\)" src/pages/api/auth src/lib/auth-user.ts` nic nie znajduje, a `grep -rn "formData()" src/pages/api` nic nie znajduje — cefbfce
- [x] 2.4 CI na PR: `ci`, `smoke` (z nowymi krokami nagłówków), `db`, `e2e` zielone — cefbfce (PR #72)

#### Manual

- [x] 2.5 Karol na serwerze dev (laptop, `/dev/room-states`, stan głosowania) widzi „Zagłosuj” jak dotąd, a w narzędziach przeglądarki nagłówki `X-Frame-Options` i `Cache-Control: no-store` na stronie pokoju — cefbfce

### Phase 3: Repo, dokumenty i wdrożenie

#### Automated

- [x] 3.1 Dokumenty, `settings.json`, `ci.yml`, `.gitignore` zaktualizowane; `npm run lint`, `npx astro check`, `npm test`, `npm run test:hooks`, `npm run build` zielone — 52d6b77
- [x] 3.2 PR gotowy (nie draft), zielone `ci`, `smoke`, `db`, `e2e` na ostatnim SHA — 52d6b77 (PR #72; także recenzja AI `pass`)
- [x] 3.3 `npx supabase db push --dry-run` pokazuje tylko migrację zmiany; `db push` i `migration list` zgodne; `db advisors` 0 błędów — 17.11.2026, sieć akademika po kablu: dry-run tylko `20261116172906`, `migration list` 24/24, advisors 0 błędów / 54 ostrzeżenia, bez nowych
- [x] 3.4 `npm run smoke` na serwerze dev zielony po `db push` — 17.11.2026, 138/138 (z krokiem nagłówków bezpieczeństwa)
- [x] 3.5 Po scaleniu przez Karola: Workers Builds zielony, smoke na produkcji zielony (z nagłówkami i `Secure`) — PR #72 scalony `d8b3cbb` 17.11.2026; Workers Builds, `ci`, `db`, `smoke`, `e2e` na `main` zielone; smoke prod 138/138
- [x] 3.6 Epilog: wpis „Wgrane migracje” w `deploy-plan.md` i Progress przez osobny PR — gałąź `security-hardening-deploy` (przy okazji zdanie o `p_question_id` w „Poza tym planem”)

#### Manual

- [ ] 3.7 Karol na produkcji (telefon i laptop), przy najbliższej grze: dołączenie z linku, nowa gra i głos działają jak dotąd, głos oddany zaraz po otwarciu strony nie zostawia `?vote=` w adresie, a „Zagłosuj” na telefonie najwyżej chwilę po otwarciu jest przygaszony
