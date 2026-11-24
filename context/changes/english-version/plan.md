# Wersja angielska gry: plan implementacji

## Overview

Host przy „Nowa gra” wybiera język gry, polski albo angielski. Gra otwiera się w tym języku wszystkim, a angielska losuje tylko pytania, które mają angielski tekst. Do tego każdy, na każdym ekranie, ma w prawym górnym rogu przełącznik PL | EN, który zmienia tylko jego ekrany, w każdej chwili, także w trakcie gry. Pytania po angielsku to tłumaczenie tych samych 960 numerów bazy, więc „bez powtórek” działa dalej.

Decyzje Karola (21.11.2026, po researchu i w wywiadzie do planu):

1. Język należy do gry: host wybiera PL albo EN przy „Nowa gra”. Język gry to język startowy dla wszystkich graczy (strona linku z kartą na Discordzie, pokój, koniec gry, historia gry) i pula pytań: angielska gra losuje tylko pytania z angielskim tekstem. Język gry jest stały, nie zmienia się po założeniu.
2. Angielskie pytania to tłumaczenie tych samych numerów (bez zmian w `private.question_base` i w migawce). Liczniki `question_stats` łączą oba języki pod jednym numerem.
3. Przełącznik PL | EN w prawym górnym rogu każdego ekranu, aktywny cały czas. Zmienia tylko ekrany osoby, która kliknie (ciasteczko), także w pokoju w trakcie gry. Wygląd Karol wybiera na zrzutach.
4. Skąd język ekranu: najpierw przełącznik (ciasteczko), potem język gry (strony gry: `/j/`, `/r/`, `/gry/<id>`), na końcu przeglądarka. Przeglądarka: polski, gdy na liście jej języków polski stoi przed angielskim; angielski, gdy angielski stoi przed polskim albo nie ma żadnego z nich (np. tylko niemiecki); bez nagłówka języka (boty, Discord, smoke) polski. „Woli polski” rozumiemy jako „polski przed angielskim na liście przeglądarki” (rozstrzygnięcie sesji: `de, pl` daje polski).
5. Stały początek angielskiego pytania: „Who’s most likely to …?” (np. „Who’s most likely to be late for their own birthday?”).
6. Tłumaczenie dosłowne albo pytanie wypada: pytanie z polskim odniesieniem, które nie działa dosłownie, nie dostaje angielskiego tekstu. Gdy w jakiejś kategorii zostanie mniej niż 15 zwykłych (nie 18+) angielskich pytań, sesja zatrzymuje się i pyta Karola.
7. Pytania pisze agent-tłumacz, poprawia agent-krytyk, wszystkie 960 z 18+; Karol ogląda próbkę około 30 i zatwierdza.
8. Osoba na EN w polskiej grze widzi po polsku pytania bez angielskiego tekstu (oznaczone dla czytnika ekranu; całe zdanie z polskim początkiem, `reviews/plan-review.md` F1). Pytania wpisane przez hosta i propozycje gości zostają tak, jak je napisał autor.
9. Dwa PR-y: PR A to sam słownik bez zmiany wyglądu (scalony osobno, smoke na produkcji), PR B to reszta, z migracją na produkcji przed scaleniem.

## Current State Analysis

Gra nie ma żadnego mechanizmu języków (research, sekcja „Summary”). Polski jest wpisany na sztywno: około 450 napisów w około 50 plikach, w tym ~290 w `src/components/room/**`, plus mapy błędów (`src/lib/rooms/errors.ts:53-126`, `src/lib/auth-errors.ts:6-36`), zdania składane w kodzie (`src/lib/rooms/shared.ts:853-861`, `announce.ts:19-45`, `game-list.ts:27-55`, `summary.ts:32-39`, `emotes.ts:8-13`, `chart-colors.ts:56-77`, `link-page.ts:28-64`, `game-intro.ts:8-23`), `lang="pl"` w `src/layouts/Layout.astro:25` i `locale: "pl"` w `src/lib/rooms/gifs.ts:84`.

Pytania mają już rozdzielony numer i tekst: baza zna numer, kategorię i 18+, tekst dobiera Worker (`src/lib/rounds/draw.ts:102-104`, `src/lib/rooms/server.ts:285-293`). Każda pula losowania powstaje w Workerze (`shuffledQuestions`, `questionPool` w `draw.ts:54-71`). Baza nie zna języka: brak kolumny w `rooms`, `create_room` ma 5 parametrów.

### Key Discoveries:

- Prawie cały pokój to jedna wyspa `RoomScreen` (`src/pages/r/[id].astro:112-118`); pozostałe wyspy: `NewGameForm` (`index.astro:53`), `HostGames` (`gry.astro:35`), `SignInForm` i `ProviderButtons` (`auth/signin.astro:16`, `SignInCard.astro:28`), `JoinForm` i `JoinWaiting` (`LinkScreen.astro:44-100`). `/gry/<id>` rysuje React tylko na serwerze (`gry/[id].astro:17`, `:60-65`). Wszystkie wyspy to `client:load`.
- Moduły z tekstem używane po obu stronach: `errors.ts` (strony i `room-actions.ts:70` w przeglądarce), `shared.ts` (`playerCountLabel`, `questionSentence`), `summary.ts` (`plural`), `link-page.ts`. `HostActions.tsx:139` porównuje błąd po tekście (`error === QUESTIONS_RAN_OUT`).
- `Astro.preferredLocale` bez `i18n` w `astro.config.mjs` jest `undefined` (`node_modules/astro/dist/core/fetch/fetch-state.js:640-648`), a z `i18n` dopasowuje tylko dokładny kod (`pl-PL` ≠ `pl`, `node_modules/astro/dist/i18n/utils.js:55-101`) i dokłada logikę tras (404 dla segmentu z domyślnym językiem, `router.js:107-125`). Język przeglądarki czytamy więc sami w middleware.
- `src/middleware.ts:13-40`: klient Supabase, `locals.user`, przekierowania `/auth/*` i `/gry`, nagłówki bezpieczeństwa; `Astro.locals` typowane w `src/env.d.ts:1-5`. Wzór ciasteczka: `src/lib/rooms/tokens.ts:31-45` (`httpOnly`, `sameSite lax`, `path`, `secure` po protokole).
- `create_room` (najnowsza: `supabase/migrations/20261116172906_security_hardening.sql:53-164`) to `security definer` z grantem dla `authenticated`; odmowy `invalid_nick`, `invalid_categories` (`:78-108`). pgTAP wymaga dokładnie jednej wersji i przypina podpis (`supabase/tests/round_creator_view.test.sql:1774-1778`, `:1789-1794`, `:2138-2143`, `plan(512)` przy `:92`), tak samo `tests/unit/room-rpc-gate.test.ts:45-52` i `:281-299`. Nowy parametr to więc `drop` starego podpisu i nowe granty (wzór: `*_co_host_role.sql:104`, `*_no_recent_repeats.sql:107`).
- `room_lobby` (`20261114101656_players_channel_key.sql:202-472`) oddaje klucze dla każdego gracza i osobno `leader_draw` dla prowadzącego; `room_link` (`20261014101922_first_live_round.sql:384-418`) oddaje tylko `status` i `room_id`; `game_history` (`20261120174140_game_history_details.sql:45-131`).
- Parsery Workera biorą tylko klucze kontraktu, a nadmiarowe pomijają (`parseLobbyState` `src/lib/rooms/shared.ts:502-529`, `roomLink` `server.ts:171-185`, `parseGameHistory` `shared.ts:696-717`). Dzięki temu `db push` przed scaleniem nie psuje produkcji.
- Dokładne zbiory kluczy w testach: `LOBBY_KEYS` (`tests/db/support/rounds.ts:288-304`, używane w kilkunastu plikach), `HISTORY_KEYS` (`:347-359`), `room_link` przez `toEqual` (`tests/db/canary.test.ts:24` i ~8 innych), `VIEW_KEYS` (`tests/unit/room-state.test.ts:1211-1229`).
- `playwright.config.ts:26-52` nie ustawia `locale`: na CI (ubuntu) przeglądarka mówi po angielsku, więc ekrany hosta zmieniłyby język i `tests/e2e/auth.setup.ts:18-27` (polskie etykiety) by padło. Pokoje e2e powstają przez API (`tests/e2e/support/room.ts:32-60`), rdzeń polskich lokatorów to `support/room.ts` i `support/round.ts` (wyrażenie pytania `:19`).
- Smoke: pokój przez `POST /api/rooms` (`scripts/smoke.mjs:273-277`), karta linku przepisana ręcznie w `LINK_CARD` (`:321-327`, „change the two together”), `request()` bez `Accept-Language` (`:82-91`). Jedyna przerwa bez otwartego pokoju to między `...gameSteps()` (`:1346`) a `...closingSteps()` (`:1347`).
- `scripts/ui-literals.mjs:14-29` czyta każdy wpis `src/components/room/` i `src/components/auth/` jako plik: podfolder w nich wysypałby skrypt (EISDIR). Słownik idzie do `src/lib/i18n/`.
- `scripts/question-base-migration.mjs:39-50` czyta tylko numer, kategorię i 18+, więc angielskie teksty nie zmieniają migawki.
- Pytania tylko po stronie serwera (`context/foundation/lessons.md`, „Pytania gry tylko po stronie serwera”): `questions.ts` importują tylko Worker, testy i skrypty; `NewGameForm` dostaje same nazwy kategorii (`index.astro:19`).

## Desired End State

- Na „Nowa gra” host wybiera język gry (domyślnie język, w którym widzi ekran). Angielska gra: strona linku i karta na Discordzie po angielsku, pokój i pytania po angielsku dla każdego, kto nie kliknął przełącznika; losowane są tylko pytania z angielskim tekstem.
- Przełącznik PL | EN w prawym górnym rogu każdego ekranu (`/`, `/gry`, `/gry/<id>`, `/auth/signin`, `/j/<token>` we wszystkich stanach, `/r/<id>` we wszystkich stanach). Kliknięcie zmienia tylko ekrany tej osoby i zostaje zapamiętane; w pokoju działa bez przeładowania (czat i głos zostają).
- Ekrany hosta przed grą i strony bez znanej gry otwierają się według reguły przeglądarki z decyzji 4.
- Każda strona deklaruje swój język (`<html lang>`), a pytanie w innym języku niż ekran stoi w całości w swoim języku (z jego początkiem zdania) i ma swój `lang`.
- Polski wygląda co do litery jak dziś (podglądy przed i po bez różnic), e2e po polsku bez zmian w asercjach, jeden angielski przebieg e2e i kroki smoke angielskiej gry.
- Sprawdzenie: CI zielone, smoke na produkcji zielony z krokami angielskiej gry, Karol na telefonie i laptopie (Faza 5).

## What We're NOT Doing

- Zmiany języka gry po jej założeniu (język gry stały; zmienia się tylko język ekranu osoby).
- Innych języków niż polski i angielski (PRD §Non-Goals).
- Tłumaczenia pytań wpisanych przez hosta, przeredagowanych i propozycji gości; nie oznaczamy też ich języka.
- Adaptacji polskich odniesień w pytaniach (decyzja 6: dosłownie albo wypada).
- Adresów z przedrostkiem `/en/` i konfiguracji `i18n` w Astro.
- Angielskiej wersji `public/manifest.webmanifest` (jeden plik dla zainstalowanej ikony; zostaje polski opis).
- Strefy czasowej widza: daty dalej w `Europe/Warsaw`, po angielsku w formacie `en-GB`.
- Ekranów Google i Discorda przy logowaniu (mają własny język) i maili (gra nie wysyła maili).
- Tłumaczenia danych przykładowych podglądów `/dev/*` poza tym, co pokazuje ekran gry (nicki i pytania przykładowe mogą zostać polskie).
- Podziału `question_stats` na języki (temat S-12) i znacznika języka na liście „Twoje gry”.
- Nowej biblioteki do tłumaczeń.

## Implementation Approach

Słownik to zwykłe moduły TypeScript w `src/lib/i18n/`: polski jest wzorem typu, angielski musi mieć każdy klucz (`npx astro check` pilnuje kompletności). Teksty z parametrami to funkcje, liczba mnoga przez `Intl.PluralRules`, daty przez `Intl.DateTimeFormat`. Wyspy dostają język w danych strony (jak dziś `gifSearchKey`), a w środku każdej wyspy słownik podaje kontekst React. Pliki `.astro` biorą słownik z `Astro.locals`.

Kolejność chroni polski: najpierw słownik bez zmiany wyglądu (PR A, porównanie podglądów przed i po), potem baza (język gry, wstecznie zgodna migracja), potem angielskie pytania, na końcu angielskie ekrany z przełącznikiem. Faza 4 potrzebuje pytań z Fazy 3, bo angielski przebieg e2e musi zagrać rundę.

## Critical Implementation Details

**Kolejność wdrożenia.** Migracja (Faza 2) idzie na produkcję przed scaleniem PR B i musi działać ze starym Workerem. Nowy parametr `create_room` stoi na końcu z domyślnym `'pl'`, więc wywołanie z 5 nazwanymi argumentami dalej trafia. Nowe klucze `language` stary kod pomija (parsery biorą tylko klucze kontraktu). Nowy kod odmawia odpowiedzi bez `language`, jak dziś przy każdym nowym kluczu.

**Przełącznik w pokoju (kolejność stanów)** (`reviews/plan-review.md` F4). Kliknięcie od razu zmienia słownik wyspy i prosi o świeży stan pokoju w nowym języku wprost: `GET /api/rooms/<id>/lobby?lang=<pl|en>` (endpoint: parametr, potem ciasteczko, potem język gry; zła wartość parametru → 400). Język wyspa czyta z refa, nie jako zależność efektu dzwonków, bo ten nie może się uruchomić ponownie dla tego samego pokoju (`useRoomState.ts:391-396`, `:466`). Równolegle `POST /api/lang` zapisuje ciasteczko, tylko dla następnych wczytań strony; jego błąd nie cofa przełącznika (po przeładowaniu ekran wraca wtedy do języka gry, znane ograniczenie przy zablokowanych ciasteczkach). Widok z Workera mówi, w jakim języku ma teksty; widok w starym języku (pobranie wysłane przed kliknięciem) wyspa odrzuca raz, bo następne pobranie już prosi o nowy język, więc bez pętli także wtedy, gdy przeglądarka nie zapisze ciasteczka. `JoinWaiting` nie pokazuje tekstu z serwera poza nickiem, więc zmienia tylko słownik i zapisuje ciasteczko. Po zmianie: `document.documentElement.lang` i tytuł karty idą za językiem, a fokus zostaje na przełączniku.

**Język treści pytania** (`reviews/plan-review.md` F1). Treść pytania jest zawsze w języku swojego tekstu, a reszta ekranu w języku ekranu; początek zdania należy do tekstu, nigdy do ekranu, więc zdanie nigdy nie miesza dwóch języków. Pytanie bazy ma język, który oddaje `questionText` (angielski albo polski zapas). Pytanie hosta, przeredagowane i propozycja gościa mają język gry. Lista pytań hosta, pole „Popraw” i podpowiedzi formularzy pytań (`QuestionList.tsx:390`, `ProposalForm.tsx:46`, `QuestionField.tsx:58`) są w języku gry, bo to, co host albo gość tam zapisze, staje się pytaniem tej gry (dziś „Popraw” wpisuje w pole `question.text` z Workera, `QuestionList.tsx:108`, `:126-128`, a zapis idzie jako `p_text`, `server.ts:782`). Zdanie w innym języku niż ekran dostaje swój `lang`; czytnik ekranu (`announce.ts:26`) bierze tę samą regułę.

**Playwright.** `locale: "pl-PL"` w `use` całego configu przed pierwszą zmianą, która czyta język przeglądarki (Faza 4). Angielski przebieg ustawia język sam.

**Typografia angielska.** Apostrof `’`, cudzysłowy `“ ”`, wielokropek `…`, tak jak polskie napisy używają typograficznych znaków; wyrażenie pytania w e2e: `/^Who’s most likely to .+\?$/`.

## Faza 1: Słownik bez zmiany wyglądu

### Overview

Wszystkie napisy ekranów przechodzą do polskiego słownika, a kod wybiera je przez język (na razie zawsze `pl`). Na ekranie nic się nie zmienia. Osobny PR A, scalony przed resztą.

### Changes Required:

#### 1. Słownik

**File**: `src/lib/i18n/` (nowe moduły; nazwy plików ustala implementujący)

**Intent**: Jedno miejsce na każdy napis gry, z typem, który w Fazie 4 wymusi kompletny angielski.

**Contract**:

- `type Lang = "pl" | "en"`, `isLang(value)`, `messages(lang)`; w tej fazie `messages` zwraca polski dla obu wartości, a angielskiego modułu jeszcze nie ma.
- Pseudosłownik (`reviews/plan-review.md` F2): tryb tylko dla podglądów `/dev/*` (`?lang=xx`, poza typem `Lang`, wyłączony poza `import.meta.env.DEV`), zrobiony z polskiego słownika: każdy napis w znacznikach `⟦…⟧`, a funkcje owijają swój wynik. Napis, który został w kodzie, stoi wtedy na ekranie bez znaczników, niezależnie od tego, czy ma polskie litery.
- Polski słownik pogrupowany po ekranach i modułach (pokój, link, logowanie, strony, błędy pokoju, błędy logowania, czytnik ekranu, kolory, emotki, karta linku). Teksty z parametrami to funkcje (`(nick) => …`).
- `plural(lang, count, forms)` przez `Intl.PluralRules(lang)` (polski: `one`, `few`, `many`; angielski w Fazie 4: `one`, `other`), zastępuje `summary.ts:32-39` i wybory 1 albo N (`shared.ts:853-855`, `ProposalForm.tsx:51-53`, `JoinRequests.tsx:73-76`, `QuestionProposals.tsx:83-84`).
- Daty: jedna funkcja z językiem, dziś `pl-PL` i `Europe/Warsaw` jak w `game-list.ts:27-41`.
- Kontekst React z hookiem do słownika, owijany w korzeniu każdej wyspy (`RoomScreen`, `NewGameForm`, `HostGames`, `SignInForm`, `ProviderButtons`, `JoinForm`, `JoinWaiting`) i w każdym pliku `.astro`, który rysuje komponent React bezpośrednio (`gry/[id].astro` z `GameHistory`, `LinkScreen.astro` i `r/[id].astro` z `RoomMessage`, `SignInCard.astro` z `ServerError`). `RoomMessage` i `ServerError` są też w wyspach (`JoinWaiting`, `HostActions`, `NewGameForm` i inne), więc same tylko czytają kontekst, bez własnego owinięcia (`reviews/plan-review.md` F8).

#### 2. Przeniesienie napisów

**File**: `src/components/room/**`, `src/components/auth/**`, `src/pages/**` (bez `dev/`), `src/layouts/Layout.astro`, moduły z listy w „Current State Analysis”, `src/lib/config-status.ts`

**Intent**: Żaden widoczny napis (także `aria-label`, `title`, `alt`, `placeholder`, tytuły stron, komunikaty czytnika, karta linku) nie zostaje w kodzie ekranu; tekst co do znaku ten sam.

**Contract**:

- Wyspy dostają prop `lang` (z `Astro.locals.lang`, w tej fazie zawsze `"pl"`); `Astro.locals.lang` ustawia middleware na `"pl"` (typ w `src/env.d.ts`). `Layout.astro` dostaje prop `lang` dla `<html lang>`.
- Moduły tekstu (`errors.ts`, `auth-errors.ts`, `announce.ts`, `shared.ts` zdania, `game-list.ts`, `link-page.ts`, `game-intro.ts`, `chart-colors.ts`, `emotes.ts`) biorą język albo słownik jako argument; kody błędów i ich znaczenie bez zmian.
- `HostActions.tsx:139` porównuje kod błędu, nie tekst (`QUESTIONS_RAN_OUT`).
- `questionSentence` składa pytanie ze słownika języka tekstu, nie ekranu („Język treści pytania” w „Critical Implementation Details”; w tej fazie zawsze `pl`), tekst końcówki dalej z Workera.
- Bez podfolderów w `src/components/room/` i `src/components/auth/` (`scripts/ui-literals.mjs:14-29`).

#### 3. Strażnik napisów

**File**: `scripts/ui-text.mjs` (nowy), `package.json` (`lint`)

**Intent**: Nowa zmiana nie może dopisać polskiego napisu z pominięciem słownika, bo angielski ekran by go pokazał.

**Contract**: skrypt w `npm run lint` odmawia linii z polską literą (`ąćęłńóśźżĄĆĘŁŃÓŚŹŻ`) poza komentarzem w `src/components/**`, `src/pages/**` (bez `dev/`), `src/layouts/**` i `src/lib/**` (bez `src/lib/i18n/`); `src/data/` poza zakresem. Krótka lista wyjątków w skrypcie, każdy z powodem. Komunikat mówi, gdzie dopisać napis. Strażnik łapie tylko napisy z polskimi literami („Gracze”, „Nowa gra”, „Anuluj”, „Zapisz” przejdą), więc kompletność słownika dowodzi pseudosłownik z punktu 1. W zasięgu strażnika są też pliki spoza listy przenosin: `src/components/live-sync/LiveSyncDemo.tsx` i `src/lib/live-sync/server.ts:184` (sonda dev) oraz `src/components/Banner.astro`; sondę na wyjątek z powodem, `Banner.astro` do słownika.

#### 4. Testy jednostkowe

**File**: `tests/unit/**` (przed pisaniem przeczytaj `context/foundation/test-plan.md` §6.1)

**Intent**: Te same zachowania, nowe podpisy funkcji.

**Contract**: `game-list.test.ts`, `host-actions.test.ts`, `summary.test.ts`, `room-errors.test.ts`, `game-history.test.ts`, `announce.test.ts` i reszta z wywołaniami po nowym podpisie (`lang` albo słownik); asercje tekstów zostają tam, gdzie są dziś (to one dowodzą, że polski się nie zmienił). Nowy test słownika: liczba mnoga dla 0, 1, 2, 5, 12, 22 po polsku zgodna z dzisiejszym `plural`.

#### 5. PRD i roadmapa

**File**: `context/foundation/prd.md`, `context/foundation/roadmap.md`

**Intent**: Decyzja Karola o przełączniku dla osoby zapisana w kontrakcie produktu, zanim kod jej użyje.

**Contract**: pod FR-031 „Uzupełnienie 2026-11-21 (S-27, decyzje hosta)”: język gry to język startowy i pula pytań; przełącznik PL | EN w rogu każdego ekranu zmienia tylko ekrany tej osoby, w każdej chwili; reguła przeglądarki z decyzji 4; tłumaczenie dosłowne albo pytanie wypada; pytanie bez angielskiego tekstu osoba na EN widzi po polsku. W S-27 zdanie „Outcome” zgodne z tym.

### Success Criteria:

#### Automated Verification:

- Bramka lokalna przechodzi: `npm run lint` (z `ui-text`, `ui-literals` i kontrastem), `npx astro check`, `npm test`, `npm run build`
- Podglądy `/dev/*` przed i po bez różnic: skrypt w scratchpadzie zapisuje tekst widoczny, nazwy dostępne i zrzut każdego podglądu i stanu (`room-states`, `room-window?state=…`, `link-window?state=…`, `ui-kitchen-sink`) na `main` i na gałęzi, a różnica jest pusta
- Strażnik napisów działa: polski napis wpisany na próbę w komponent czerwieni `npm run lint`, a jeden zmieniony napis słownika daje w porównaniu podglądów dokładnie jedną różnicę
- Pseudosłownik: na każdym podglądzie i stanie z `?lang=xx` skrypt porównania nie znajduje tekstu widocznego ani nazwy dostępnej bez znaczników `⟦…⟧` poza danymi przykładowymi podglądów (nicki, końcówki pytań; lista w skrypcie); napis bez polskich liter wpisany na próbę w komponent („Gracze”) skrypt wskazuje
- PR A (push za zgodą Karola): CI zielone we wszystkich jobach, bez zmian w asercjach e2e i smoke
- Po scaleniu PR A przez Karola: Workers Builds i CI na `main` zielone, smoke na produkcji zielony (za zgodą)

#### Manual Verification:

- Karol akceptuje krótkie streszczenie (ile napisów i gdzie, jak działa strażnik, wynik porównania podglądów)

**Implementation Note**: Przeniesienie napisów da się podzielić na podagentów po obszarach (pokój, link, logowanie, strony i moduły); w promptach zakaz instalacji i jawne wykluczenie `.dev.vars` i `.env*` w grep. Oba próbne alarmy tej fazy są lokalne (strażnik i porównanie), bez pusha. Gałąź PR A od `origin/main`, bez upstreamu na `main` (krok 1 cyklu z `sesja-gry.md`). Po fazie pauza na akceptację Karola i scalenie PR A; Faza 2 startuje od świeżego `origin/main`.

---

## Faza 2: Język gry w bazie

### Overview

Pokój pamięta język gry, Worker go zapisuje przy zakładaniu, czyta przy każdym ekranie i wybiera angielską pulę pytań. Bez widocznej zmiany: formularz nie ma jeszcze wyboru języka. Początek PR B (draft).

### Changes Required:

#### 1. Migracja

**File**: `supabase/migrations/<timestamp>_game_language.sql` (przez `npx supabase migration new game_language`)

**Intent**: Język gry jako cecha pokoju, wstecznie zgodna ze starym Workerem.

**Contract**:

- `public.rooms.language text not null default 'pl'` z `check (language in ('pl', 'en'))`; istniejące pokoje dostają `pl`.
- `drop function public.create_room(text, text, text[], text[], boolean)`, potem `public.create_room(p_nick text, p_link_token text, p_categories text[], p_adult_categories text[], p_confirm_close boolean default false, p_language text default 'pl') returns jsonb`: ta sama treść co w `*_security_hardening.sql:53-164`, odmowa `{ok:false, reason:'invalid_language'}` dla wartości spoza `pl`/`en` (przed jakimkolwiek zapisem, obok `invalid_categories`), zapis `language`. `security definer`, `set search_path = ''`, właściciel `postgres`, `revoke execute … from public, anon, authenticated`, `grant execute … to authenticated`.
- `room_lobby`: `language` w kluczach każdego gracza (obok `channel_key`), dla hosta i gości we wszystkich stanach.
- `room_link`: `language` przy `open`, `started` i `closed` (strona `/j/` i karta linku znają język przed wejściem gracza; przy `closed` dalej bez `room_id`); `unknown` bez zmian.
- `game_history`: `language` w odpowiedzi z historią.
- Nagłówek migracji: FR-031 i decyzje 1–2, że język nie dotyka urny ani głosów, kolejność wdrożenia (baza przed kodem, stary Worker działa dalej).

#### 2. Testy bazy i widok twórcy

**File**: `tests/db/**`, `supabase/tests/round_creator_view.test.sql`, `tests/unit/room-rpc-gate.test.ts` (przed pisaniem przeczytaj `context/foundation/test-plan.md` §6.2)

**Intent**: Kontrakt języka udowodniony przez REST jako host i gość, a granty i podpis przypięte w pgTAP.

**Contract**:

- `LOBBY_KEYS`, `HISTORY_KEYS` i wszystkie dokładne `toEqual` na `room_link` z kluczem `language`; `seedRoom` (`tests/db/support/rooms.ts:53-59`) przyjmuje język.
- Nowe przypadki (wyrocznia ręczna): gra założona z `p_language: 'en'` oddaje `language: 'en'` w `room_lobby` hostowi i gościowi, w `room_link` (otwarta, rozpoczęta, zamknięta) i w `game_history`; bez parametru `pl`; `'de'` i `null` → `invalid_language` bez nowego pokoju.
- pgTAP: `function_facts` i `versions_of` nowego podpisu `create_room`, dokładnie jedna wersja, wywołania pozycyjne (`:183`, `:307`, `:326`) dalej działają; `plan(N)` zaktualizowany.
- `room-rpc-gate.test.ts`: nowy podpis w `SQL_SIGNATURES` i argumenty `p_language`.

#### 3. Serwer gry

**File**: `src/lib/rooms/server.ts`, `src/lib/rooms/shared.ts`, `src/pages/api/rooms/index.ts`, `src/lib/rounds/draw.ts`, `src/pages/api/rooms/[id]/question-list.ts`, `src/pages/api/rooms/[id]/question-draw.ts`

**Intent**: Worker zapisuje i czyta język gry i z niego bierze pulę pytań.

**Contract**:

- `LobbyState.language: Lang` (odmowa, gdy brak albo inna wartość, jak przy każdym kluczu kontraktu), `roomLink` oddaje `language` przy znanym pokoju, `GameHistoryRecord.language`.
- `POST /api/rooms`: pole formularza `language` (`pl`/`en`); brak → `pl` (stare formularze, smoke, e2e); inna wartość → ta sama ścieżka błędu co zła kategoria, z kodem `invalid_language` w mapie błędów (tekst polski w słowniku).
- `QuestionSelection` dostaje język gry jako wymagane pole (`reviews/plan-review.md` F3), więc `npx astro check` wskaże każde miejsce losowania: `start`, `next`, `more`, `skip` (z `leader_draw` przez `leaderSelection`), `leaderMoreQuestions` (`server.ts:382-386`, przez `drawSelection` `:355-357`, liczba dla „Jeszcze 5 pytań”) oraz „Przejrzyj pytania” i „Dolosuj pytanie” (`question-list.ts:30,34`, `question-draw.ts:30,34`), które biorą kategorie z `hostRoomCategories` (`server.ts:871-887`, select z `rooms`, nie `room_lobby`): ten select i `RoomCategoriesResult` dostają `language` (grant select na tabelę już jest, `20261014101922_first_live_round.sql:34`). Dla `en` pula to tylko numery z angielskim tekstem. Do Fazy 3 angielskich tekstów nie ma, więc angielska gra nie wystartuje (`questions_ran_out`); formularz nie pozwala jej założyć aż do Fazy 4.

### Success Criteria:

#### Automated Verification:

- Bramka lokalna przechodzi: `npm run lint`, `npx astro check`, `npm test`, `npm run build`
- Draft PR B do `main` (push za zgodą Karola): CI zielone we wszystkich jobach, w `db` nowe testy języka gry i nowe asercje pgTAP przechodzą
- Próbny alarm: `create_room` zapisuje zawsze `pl`; zapalają się tylko przewidziane testy; po `git revert` CI zielone

#### Manual Verification:

- Karol akceptuje krótkie streszczenie migracji (co dochodzi, kto co widzi, kolejność wdrożenia)

**Implementation Note**: Próbny alarm według `test-plan.md` §6.2 „Break-check”: tymczasowa migracja zmiany wpisuje do pokoju `'pl'` zamiast `p_language`. Przewidywanie przed pushem w opisie commita: w `db` czerwone tylko przypadki „gra po angielsku oddaje `en`” (REST i pgTAP, jeśli pgTAP je sprawdza); `ci`, `smoke`, `e2e` zielone. Tymczasowej migracji nigdy nie wgrywamy; na końcu `git diff main...HEAD -- supabase/migrations` pokazuje tylko migrację zmiany. Wynik w §6.2. Po fazie pauza na akceptację Karola.

---

## Faza 3: Angielskie pytania

### Overview

Angielskie teksty tych samych numerów i angielskie nazwy kategorii, napisane przez agenta i poprawione przez krytyka, z testami reguł tekstu i liczebności.

### Changes Required:

#### 1. Plik pytań

**File**: `src/data/questions-en.ts` (nowy)

**Intent**: Drugi tekst pod tym samym numerem, tylko na serwerze.

**Contract**:

- Teksty pod `QuestionId` (częściowy rekord: brak klucza = pytanie nie gra po angielsku), angielska nazwa każdej kategorii z `CATEGORIES`. Jeden literał obiektu (jak `questions.ts`, zasada „Keep QUESTIONS a single object literal”).
- Nagłówek z zasadami: tekst to końcówka po „Who’s most likely to”; ekran pokazuje „Who’s most likely to {text}?”; forma podstawowa czasownika („be late for their own birthday”); mała litera na początku; bez „?” i „.” na końcu; najwyżej 90 znaków; neutralne „their”; 18+ dziedziczy oznaczenie z `questions.ts`; tłumaczenie dosłowne albo brak wpisu; zmiana znaczenia polskiego pytania to nowy numer w obu plikach.
- Import tylko w kodzie serwera, testach i skryptach (`lessons.md`). Pilnuje tego reguła `no-restricted-imports` dla `@/data/*` w `src/components/**/*.tsx` w `eslint.config.js` (`reviews/plan-review.md` F6), dla obu plików pytań.

#### 2. Tekst pytania w Workerze

**File**: `src/lib/rounds/draw.ts`, `src/lib/rooms/server.ts`

**Intent**: Tekst pytania w języku ekranu osoby, z polskim zapasem i znacznikiem języka.

**Contract**: `questionText(id, lang)` oddaje tekst i jego język: dla `en` angielski, gdy jest, inaczej polski z językiem `pl`; dla `pl` polski. Pytanie rundy (`roomView` `server.ts:333-351`) i historia (`historyView` `:670-686`) biorą język ekranu, a lista pytań hosta (`listQuestions` `:298-306`) język gry („Język treści pytania”). Każdy tekst pytania w widoku niesie swój język: tekst bazy język z `questionText`, pytanie hosta, przeredagowane i propozycja język gry. Nazwy kategorii na formularzu w języku ekranu (`index.astro:19`).

#### 3. Tłumaczenie (agent + krytyk)

**File**: `src/data/questions-en.ts`, zestawienie dla Karola w scratchpadzie

**Intent**: Wszystkie 960 pytań, z 18+, według decyzji 5–7.

**Contract**:

- Agent-tłumacz po kategoriach (wzór punktu I z 16.11), potem agent-krytyk z osobnym promptem: naturalny angielski, reguły nagłówka, dosłowność (brak wpisu zamiast adaptacji), 18+ bez wulgarności, każdy brak wpisu z powodem w zestawieniu.
- Zestawienie: liczba pytań po angielsku na kategorię (zwykłe i 18+), lista pominiętych z powodem, próbka około 30 (z każdej kategorii, z 18+, z pominiętymi) jako tabela PL | EN.
- Zatrzymanie: kategoria z mniej niż 15 zwykłymi angielskimi pytaniami → pytanie do Karola przed commitem.

#### 4. Testy

**File**: `tests/unit/questions-en.test.ts` (nowy), `tests/unit/draw.test.ts` (przed pisaniem przeczytaj `context/foundation/test-plan.md` §6.1)

**Intent**: Reguły tekstu i pula angielskiej gry sprawdzone bez przepisywania tekstów do asercji.

**Contract**: każdy tekst spełnia reguły nagłówka (mała litera, bez „?” i „.”, najwyżej 90 znaków, bez polskich liter, nie zaczyna się od „who”); każda kategoria ma angielską nazwę i co najmniej 15 zwykłych angielskich pytań; pula angielskiej gry ze wszystkimi kategoriami i 18+ zawiera tylko numery z angielskim tekstem i ma najwyżej 1000 pozycji; `questionText(id, "en")` dla pytania bez angielskiego oddaje polski z językiem `pl`.

### Success Criteria:

#### Automated Verification:

- Bramka lokalna przechodzi, w tym `tests/unit/questions-en.test.ts` i nowe przypadki `draw.test.ts`; `npm run questions:migration` nie robi nowej migracji
- Push za zgodą Karola: CI zielone we wszystkich jobach
- Próbny alarm: angielska pula bierze też numery bez angielskiego tekstu; zapalają się tylko przewidziane testy; po `git revert` CI zielone
- Strażnik importu (lokalnie, bez pusha): import `@/data/questions-en` wpisany na próbę w wyspę czerwieni `npm run lint`

#### Manual Verification:

- Karol ogląda zestawienie i próbkę około 30 pytań PL | EN (z 18+ i z pominiętymi, z angielskimi nazwami kategorii) i zatwierdza

**Implementation Note**: Próbny alarm: filtr angielskiej puli w `draw.ts` wyłączony. Przewidywanie: w `ci` czerwony tylko test „pula angielskiej gry ma tylko numery z angielskim tekstem”; `db`, `smoke`, `e2e` zielone. Wynik w §6.1. Recenzja AI może paść na limicie przy dużym diffie (nie bramka). Po fazie pauza na akceptację Karola.

---

## Faza 4: Angielskie ekrany i przełącznik

### Overview

Angielski słownik, wybór języka ekranu, przełącznik w rogu każdego ekranu, wybór języka gry na „Nowa gra”, podglądy po angielsku, e2e i smoke.

### Changes Required:

#### 1. Galeria wariantów (decyzja Karola)

**File**: zrzuty w scratchpadzie (podglądy z danymi z ręki, bez sieci)

**Intent**: Karol wybiera wygląd przełącznika PL | EN w prawym górnym rogu (laptop i telefon, na ekranach hosta, stronie linku i w pokoju) i wyboru języka gry na „Nowa gra” (`AGENTS.md` „## UI”; strona HTML z „Co oceniasz” w Chrome Karola, laptop jako całe okno 1:1, telefon w prawdziwej wielkości).

**Contract**: 2–3 warianty każdego elementu z tokenów (`src/styles/global.css`), bez nowych kolorów, chyba że Karol wybierze wariant, który ich wymaga (wtedy token i wiersz w `PAIRS`).

**Decyzja Karola (24.11.2026, galeria w wersji 2 po jego uwagach):** przełącznik **F2** (najpierw F1, potem zmiana na F2): przycisk z flagą i kodem obecnego języka ze strzałką, „🇵🇱 PL ˅” (`bg-muted`, kod `text-foreground`, strzałka `text-muted-foreground`), a po dotknięciu menu pod nim z dwoma wierszami „🇵🇱 Polski” i „🇬🇧 English” (nazwa każdego języka w nim samym, z `lang`); obecny wiersz na `bg-accent` z ptaszkiem `text-primary-text`, menu na `bg-popover` z cieniem karty. Zmiana dwoma dotknięciami; menu zamyka Esc, klik obok i wybór, fokus wraca na przycisk. Stoi zawsze w samym prawym górnym rogu ekranu: gdy kolumna nagłówka sięga krawędzi okna (telefon), jako ostatni w wierszu, za „Wyloguj”; gdy kolumna stoi na środku (laptop, `/` i `/j/` 512 px, pokój `ROOM_FRAME`), przy krawędzi okna, poza kolumną, na wysokości wiersza nagłówka. Flagi to obrazki SVG w `public/` (emoji flag Windows rysuje literami „PL”), 20×14 z zaokrągleniem; angielska brytyjska (daty `en-GB`). Kolory flag żyją tylko w tych plikach, jak w `public/icons/icon.svg`, nie w widokach. Wzór makiety: `shots.mjs` w scratchpadzie sesji `722d40d4-…\scratchpad\s27p4\` (`F2`, `F2-open`, `placeSwitcher`; galeria `galeria.html`). Wybór języka gry na „Nowa gra” (J1 dwa kafelki z kółkiem, J2 pigułka, J3 lista; rekomendacja sesji J1): czeka na Karola.

#### 2. Angielski słownik

**File**: `src/lib/i18n/` (moduł angielski)

**Intent**: Każdy napis po angielsku; brak klucza to błąd `npx astro check`.

**Contract**: angielski typowany typem polskiego słownika; terminy gry stałe w całym słowniku (np. reveal, skip, abstain, co-host, question suggestion; lista trafia do słownika pojęć w Fazie 5); typografia z „Critical Implementation Details”; daty `en-GB` w `Europe/Warsaw`; liczba mnoga `one`/`other`; karta linku po angielsku („Who’s most likely to …”).

#### 3. Język ekranu i przełącznik

**File**: `src/middleware.ts`, `src/env.d.ts`, `src/lib/i18n/`, nowa trasa `src/pages/api/lang.ts`, `src/layouts/Layout.astro`, strony z `src/pages/**`, nowy komponent przełącznika w `src/components/room/`

**Intent**: Każda strona wybiera język według decyzji 4, a przełącznik go zmienia i zapamiętuje.

**Contract**:

- Czysta funkcja rozstrzygająca: `(ciasteczko, język gry | null, Accept-Language) → Lang`. Ciasteczko `pl`/`en` wygrywa; potem język gry; potem lista przeglądarki: pierwszy tag z głównym podtagiem `pl` albo `en` według wag `q` (`pl-PL` to `pl`; przy równym `q` wcześniejszy na liście, tag z `q=0` pominięty, `reviews/plan-review.md` F7); gdy żadnego z nich nie ma → `en`; brak nagłówka, pusty albo samo `*` → `pl`.
- Middleware ustawia `locals.lang` dla stron bez gry; strony gry (`/j/<token>` z `room_link`, `/r/<id>` z `room_lobby`, `/gry/<id>` z `game_history`) rozstrzygają z językiem gry; strona gry bez znanego pokoju (nieznany link, `/r/` dla obcego, usuniętego, przeniesionego, skasowana gra) jak strona bez gry.
- Ciasteczko `mlt-lang`: wartości `pl`/`en`, `path=/`, `sameSite=lax`, `httpOnly`, `secure` po protokole, około roku; ustawia je tylko `POST /api/lang` (pole `lang`, pole `next` z adresem powrotu). `next` czytany przez `new URL(next, url.origin)` i przyjęty tylko przy tym samym `origin`; przekierowanie idzie na jego `pathname + search`, inaczej na `/` (`reviews/plan-review.md` F5: sama reguła „od `/`, nie od `//`” przepuszcza `/\evil.com`, bo przeglądarka czyta `\` jak `/`). Formularz bez JS (`application/x-www-form-urlencoded`): 303 na `next`. Wyspa: JSON we wzorze `refuseForeignPost` (`src/lib/rooms/json-route.ts:47-58`), odpowiedź 204. Zła wartość `lang`: 400 bez ciasteczka.
- Przełącznik w prawym górnym rogu każdej strony z „Desired End State”: na stronach bez stanu na żywo zwykły formularz z przeładowaniem; w pokoju (`RoomScreen`) i w czekaniu na wpuszczenie (`JoinWaiting`) zmiana bez przeładowania według „Critical Implementation Details”.
- Widok pokoju (`roomView`, `GET …/lobby`) rysuje teksty w języku ekranu tej osoby (parametr `lang` z wyspy, potem ciasteczko z żądania, potem język gry), mówi, w jakim języku je ma, i przy każdym tekście pytania podaje jego język; ekran składa zdanie z początkiem tego języka i daje mu `lang`, gdy różni się od ekranu („Język treści pytania”). Podpowiedzi formularzy pytań hosta i propozycji gości w języku gry.
- `Layout.astro`: `<html lang>` z języka ekranu.
- KLIPY: `locale` z języka ekranu osoby (`gifs.ts:84`; zmienia wcześniejsze „język gry” z `room-chat-gifs`).

#### 4. „Nowa gra”

**File**: `src/components/room/NewGameForm.tsx`, `src/pages/index.astro`

**Intent**: Host wybiera język gry w wariancie wybranym przez Karola.

**Contract**: pole `language` (`pl`/`en`), domyślnie język ekranu hosta; nazwy kategorii w języku ekranu; `tests/unit/new-game-form.test.ts` z nową kontrolką (liczniki przycisków i pól według wariantu).

#### 5. Podglądy

**File**: `src/pages/dev/room-states.astro`, `room-window.astro`, `link-window.astro`, `ui-kitchen-sink.astro`

**Intent**: Każdy stan do obejrzenia po polsku i po angielsku.

**Contract**: parametr `?lang=en` na każdym podglądzie (linki list stanów go zachowują); przełącznik ma stan w `/dev/room-window` i `/dev/link-window` (zmienia okno) oraz wiersz w `/dev/ui-kitchen-sink` (domyślny, hover, focus-visible, aktywny język; reszta „nie dotyczy” z powodem); wybór języka na „Nowa gra” w `room-states`.

#### 6. E2E

**File**: `playwright.config.ts`, `tests/e2e/support/room.ts`, `tests/e2e/support/round.ts`, nowy `tests/e2e/english.spec.ts` (przed pisaniem przeczytaj `context/foundation/test-plan.md` §6.4)

**Intent**: Polskie testy bez zmian, jeden angielski przebieg z przełącznikiem.

**Contract**:

- `use.locale: "pl-PL"` w `playwright.config.ts`; `openRoom` przyjmuje język gry (pole formularza).
- `english.spec.ts` w obu projektach (`chromium` i `phone`, dopisany do `testMatch` telefonu): host zakłada angielską grę, dwóch gości wchodzi z linku (strona linku po angielsku), runda po angielsku (pytanie `/^Who’s most likely to .+\?$/`, głos, wstrzymanie, odsłona), jeden gość w trakcie rundy przełącza na PL (jego pytanie i ekran po polsku, u innych bez zmian, głos zostaje), po odświeżeniu dalej PL; ekran hosta przed grą z przeglądarką `en-US` po angielsku.
- Limit konta e2e: przebieg otwiera dziś 39 gier na 60 na godzinę (`playwright.config.ts:17-20`); nowy plik dokłada 2.

#### 7. Smoke

**File**: `scripts/smoke.mjs` (przed pisaniem przeczytaj `context/foundation/test-plan.md` §6.5)

**Intent**: Na produkcji sprawdzone: angielska gra, karta linku i przełącznik.

**Contract**: kroki między `...gameSteps()` a `...closingSteps()`: angielska gra przez `POST /api/rooms` z `language=en` (bez gości, więc pokój listy w `closingSteps` zamknie ją bez pytania); `/j/<link>` z `lang="en"` i angielską kartą (druga stała obok `LINK_CARD`, komentarz „change the two together”); `/r/<id>` hosta z `lang="en"`; `POST /api/lang` z `lang=pl` ustawia `mlt-lang` (`httpOnly`, `secure` na https), a potem `/r/<id>` ma `lang="pl"`; zła wartość → 400 bez ciasteczka; `next` z obcym adresem (`//evil.com`, `/\evil.com`, `https://evil.com`) nie przekierowuje poza stronę. Suma kroków w §6.5.

### Success Criteria:

#### Automated Verification:

- Bramka lokalna przechodzi: `npm run lint`, `npx astro check` (angielski słownik ma każdy klucz polskiego), `npm test` (z testami funkcji rozstrzygającej i trasy `/api/lang`), `npm run build`
- Podglądy `/dev/*` po polsku bez różnic względem stanu po Fazie 1 (poza przełącznikiem i wyborem języka), a po angielsku bez polskich liter poza danymi przykładowymi graczy; pseudosłownik (`?lang=xx`) dalej bez napisów spoza słownika, także na przełączniku i wyborze języka (skrypt porównania z Fazy 1)
- Push za zgodą Karola: CI zielone, `english.spec.ts` w obu projektach i nowe kroki smoke przechodzą, polskie e2e bez zmian w asercjach
- Próbny alarm: język gry wygrywa z ciasteczkiem; zapalają się tylko przewidziane testy; po `git revert` CI zielone

#### Manual Verification:

- Karol wybiera wygląd przełącznika w rogu i wyboru języka gry na „Nowa gra” na zrzutach
- Karol akceptuje angielskie ekrany na zrzutach (laptop i telefon, wszystkie stany pokoju, strona linku, ekrany hosta, historia gry)

**Implementation Note**: Najpierw galeria i wybór Karola, potem kod. Próbny alarm: w funkcji rozstrzygającej język gry przed ciasteczkiem. Przewidywanie: w `ci` czerwony test kolejności źródeł; w `e2e` krok „gość przełącza na PL” w `english.spec.ts` w obu projektach; w `smoke` krok „po `/api/lang` strona pokoju ma `lang="pl"`”; `db` zielony. Wynik w §6.4. Po fazie pauza na akceptację Karola.

---

## Faza 5: Dokumenty i wdrożenie

### Overview

Nazwy i decyzje w dokumentach, baza na produkcji przed scaleniem PR B, scalenie, smoke na produkcji, sprawdzenie Karola.

### Changes Required:

#### 1. Dokumenty

**File**: `context/domain/glossary.md`, `AGENTS.md`, `context/foundation/test-plan.md`, `context/deployment/deploy-plan.md`, `context/foundation/roadmap.md`, `docs/development.md`

**Intent**: Następna zmiana wie, gdzie są napisy, jak dopisać nowy i jak nazywać język.

**Contract**:

- Słownik pojęć: „język gry” (`rooms.language`, `p_language`, wybór na „Nowa gra”; nie: „język pokoju”, „locale”), „język ekranu” (`mlt-lang`, przełącznik, `locals.lang`), „przełącznik języka”; angielskie odpowiedniki terminów gry z angielskiego słownika (kolumna albo tabela).
- `AGENTS.md` (Conventions lub UI): każdy nowy napis trafia do obu słowników w `src/lib/i18n/` (strażnik `ui-text` i `npx astro check`); nowe pytanie bazy dostaje angielski tekst albo świadomy brak wpisu (`src/data/questions-en.ts`).
- `test-plan.md`: §6.1 (testy słownika i pytań), §6.2 (`game_language`), §6.4 (`english.spec.ts`, `locale` w configu), §6.5 suma kroków, wyniki alarmów z faz 2–4, wpis w §8.
- `deploy-plan.md`: migracja w „Wgrane migracje” po `db push`; kolejność „baza, potem kod”.
- `docs/development.md`: `?lang=en` w podglądach, gdzie są słowniki.
- Roadmapa: status S-27 prowadzą `/10x-implement` i `/10x-archive`.

#### 2. Baza na produkcji

**File**: brak (polecenia)

**Intent**: Kolumna i funkcje na produkcji, zanim kod, który ich używa.

**Contract**: za zgodą Karola i nie z eduroam: `npx supabase db push --dry-run` (tylko migracja zmiany), `npx supabase db push`, `npx supabase migration list`.

#### 3. Scalenie i sprawdzenie

**File**: brak

**Intent**: Kod na produkcji i sprawdzony na prawdziwym urządzeniu.

**Contract**: PR B gotowy (nie draft), CI zielone; scala Karol (`! gh pr merge <n> --merge`); Workers Builds; smoke na produkcji za zgodą (`BASE_URL=https://most-likely-to.charlesonthewave.workers.dev npm run smoke`); Karol na telefonie i laptopie.

### Success Criteria:

#### Automated Verification:

- `npx prettier --check` dla zmienionych plików `.md` przechodzi
- `npx supabase migration list` pokazuje migrację zmiany po stronie lokalnej i zdalnej
- CI na PR B zielone (`ci`, `smoke`, `db`, `e2e`)
- Smoke na produkcji zielony, z krokami angielskiej gry

#### Manual Verification:

- Karol na laptopie i telefonie: angielska gra z „Nowa gra”, gość z linku (karta na Discordzie po angielsku), przełącznik w trakcie rundy w obie strony, polska gra z przełącznikiem na EN (pytania bez angielskiego po polsku)
- Karol: ekrany hosta otwierają się w języku przeglądarki, a wybór z przełącznika zostaje po zamknięciu przeglądarki

**Implementation Note**: Kolejność: dokumenty i bramka → `db push` (zgoda) → PR B gotowy → zielone CI → scala Karol → smoke prod (zgoda) → sprawdzenie Karola. Potem `/10x-impl-review` (zmiana bazy i każdego ekranu) i poprawki.

---

## Testing Strategy

### Unit Tests:

- Słownik: polska liczba mnoga zgodna z dzisiejszym `plural`, angielska `one`/`other`; daty obu języków.
- Funkcja rozstrzygająca: tabela przypadków (ciasteczko kontra język gry kontra `Accept-Language`: `pl-PL`, `en-US,en;q=0.9,pl;q=0.8`, `de-DE,de;q=0.9,pl;q=0.8` → `pl`, `de` → `en`, brak, pusty, `*` → `pl`, `en;q=0.8,pl;q=0.8` → `en`, `pl;q=0,en;q=0.5` → `en`, złe ciasteczko pomijane).
- Trasa `/api/lang`: 303 z `next` (formularz), 204 z wyspy (JSON), 400 bez ciasteczka, obcy `next` odrzucony (`//evil.com`, `/\evil.com`, `/<tab>/evil.com`, `https://evil.com` → `/`).
- `GET …/lobby?lang=`: parametr wygrywa z ciasteczkiem i językiem gry, zła wartość → 400.
- Pytania angielskie: reguły tekstu, ≥15 zwykłych w każdej kategorii, pula angielskiej gry tylko z tłumaczeniami, zapas polski z `lang`.
- Zdanie pytania: początek z języka tekstu (polski tekst na ekranie EN daje całe zdanie po polsku, pytanie hosta angielskiej gry na ekranie PL całe po angielsku); lista hosta w języku gry.
- Istniejące testy z nowymi podpisami, asercje polskich tekstów bez zmian.

### Integration Tests:

- Baza (`db`): język gry w `create_room`, `room_lobby`, `room_link`, `game_history`, odmowa `invalid_language`; pgTAP podpis i granty.
- E2E: `english.spec.ts` w obu projektach; reszta po polsku z `locale: "pl-PL"`.
- Smoke: kroki angielskiej gry i przełącznika.

### Manual Testing Steps:

1. „Nowa gra” po angielsku, link na Discordzie: karta po angielsku.
2. Gość wchodzi z linku na telefonie z polską przeglądarką: pokój po angielsku; przełącza na PL w trakcie rundy, głos zostaje, czat zostaje.
3. Polska gra, Karol przełącza na EN: pytania bez angielskiego tekstu po polsku.
4. Wylogowany: `/` w języku przeglądarki; po przełączeniu wybór zostaje po zamknięciu przeglądarki.

## Performance Considerations

Oba słowniki trafiają do paczki wysp (szacunkowo kilkanaście KB na język przed kompresją). To mniej niż obrazek, więc bez dzielenia paczek na języki. Pytania (polskie i angielskie) nigdy nie trafiają do przeglądarki.

## Migration Notes

Istniejące pokoje dostają `language = 'pl'` (wartość domyślna). Migracja jest wstecznie zgodna ze starym Workerem, więc `db push` przed scaleniem PR B nie zmienia działania produkcji. Wycofanie kodu (rollback Workera) zostawia kolumnę bez szkody; wycofanie bazy to nowa migracja (nigdy edycja wgranej).

## References

- Research: `context/changes/english-version/research.md`
- Decyzje Karola: `context/changes/english-version/change.md`, PRD FR-031 (`context/foundation/prd.md`), roadmapa S-27
- Wzór nowego parametru funkcji z `drop`: `supabase/migrations/*_co_host_role.sql:104`, `*_no_recent_repeats.sql:107`
- Wzór kodów błędów na teksty: `src/lib/rooms/errors.ts`, `tests/unit/room-errors.test.ts:7-8`
- Wzór danych strony dla wyspy: `gifSearchKey` i `signingKey` w `src/pages/r/[id].astro:81-86`
- Wzór pisania pytań agentem z krytykiem: punkt I (PR #70, gałąź `question-base-expansion-2`, commit `2481724`)
- `lang` strony i czytnik ekranu: `context/archive/2026-10-04-ui-signin-contract/research.md`

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: Słownik bez zmiany wyglądu

#### Automated

- [x] 1.1 Bramka lokalna przechodzi: `npm run lint` (z `ui-text`, `ui-literals` i kontrastem), `npx astro check`, `npm test`, `npm run build` — bc1d929
- [x] 1.2 Podglądy `/dev/*` przed i po bez różnic (tekst widoczny, nazwy dostępne, zrzuty; skrypt w scratchpadzie) — bc1d929
- [x] 1.3 Strażnik napisów działa: polski napis na próbę czerwieni lint, jeden zmieniony napis daje dokładnie jedną różnicę w porównaniu — bc1d929
- [x] 1.4 PR A (push za zgodą Karola): CI zielone we wszystkich jobach, bez zmian w asercjach e2e i smoke — 5e92169
- [x] 1.5 Po scaleniu PR A: Workers Builds i CI na `main` zielone, smoke na produkcji zielony (za zgodą) — 684c299
- [x] 1.7 Pseudosłownik: żaden podgląd z `?lang=xx` nie ma napisu spoza słownika, a „Gracze” na próbę skrypt wskazuje — bc1d929

#### Manual

- [x] 1.6 Karol akceptuje krótkie streszczenie (napisy, strażnik, wynik porównania podglądów) — bc1d929

### Phase 2: Język gry w bazie

#### Automated

- [x] 2.1 Bramka lokalna przechodzi: `npm run lint`, `npx astro check`, `npm test`, `npm run build` — 0f38d8b
- [x] 2.2 Draft PR B (push za zgodą Karola): CI zielone, w `db` nowe testy języka gry i asercje pgTAP przechodzą — 3fd8286 (PR #92)
- [x] 2.3 Próbny alarm: `create_room` zapisuje zawsze `pl`; zapalają się tylko przewidziane testy; po revercie CI zielone — 7122117, revert b207459 (CI na d74c446 zielone)

#### Manual

- [x] 2.4 Karol akceptuje krótkie streszczenie migracji (co dochodzi, kto co widzi, kolejność wdrożenia) — 0f38d8b

### Phase 3: Angielskie pytania

#### Automated

- [x] 3.1 Bramka lokalna przechodzi z testami angielskich pytań; `npm run questions:migration` nie robi nowej migracji — 16884e7
- [x] 3.2 Push za zgodą Karola: CI zielone we wszystkich jobach — 45d8945
- [x] 3.3 Próbny alarm: angielska pula bierze też numery bez angielskiego tekstu; zapalają się tylko przewidziane testy; po revercie CI zielone — 7b603ae, revert 6bf6f8e
- [x] 3.5 Strażnik importu: `@/data/questions-en` na próbę w wyspie czerwieni lint — 16884e7

#### Manual

- [x] 3.4 Karol ogląda zestawienie i próbkę około 30 pytań PL | EN i zatwierdza — 16884e7

### Phase 4: Angielskie ekrany i przełącznik

#### Automated

- [ ] 4.1 Bramka lokalna przechodzi: angielski słownik ma każdy klucz, testy funkcji rozstrzygającej i `/api/lang`
- [ ] 4.2 Podglądy po polsku bez różnic względem Fazy 1 (poza przełącznikiem i wyborem języka), po angielsku bez polskich liter poza danymi graczy, pseudosłownik bez napisów spoza słownika
- [ ] 4.3 Push za zgodą Karola: CI zielone, `english.spec.ts` w obu projektach i nowe kroki smoke przechodzą
- [ ] 4.4 Próbny alarm: język gry wygrywa z ciasteczkiem; zapalają się tylko przewidziane testy; po revercie CI zielone

#### Manual

- [ ] 4.5 Karol wybiera wygląd przełącznika w rogu i wyboru języka gry na „Nowa gra” na zrzutach
- [ ] 4.6 Karol akceptuje angielskie ekrany na zrzutach (laptop i telefon, wszystkie stany)

### Phase 5: Dokumenty i wdrożenie

#### Automated

- [ ] 5.1 `npx prettier --check` dla zmienionych plików `.md` przechodzi
- [ ] 5.2 `npx supabase migration list` pokazuje migrację zmiany po stronie lokalnej i zdalnej
- [ ] 5.3 CI na PR B zielone (`ci`, `smoke`, `db`, `e2e`)
- [ ] 5.4 Smoke na produkcji zielony, z krokami angielskiej gry

#### Manual

- [ ] 5.5 Karol na laptopie i telefonie: angielska gra, gość z linku, przełącznik w trakcie rundy, polska gra na EN
- [ ] 5.6 Karol: ekrany hosta w języku przeglądarki, wybór przełącznika zostaje po zamknięciu przeglądarki
