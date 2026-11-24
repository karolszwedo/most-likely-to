# Wersja angielska gry: plan implementacji

## Overview

Gra nie ma języka. Każdy gracz ma swój język ekranu, polski albo angielski, i zmienia go w każdej chwili przełącznikiem w prawym górnym rogu każdego ekranu, także w trakcie rundy; bez wyboru ekran otwiera się w języku przeglądarki. Pytania bazy każdy widzi w swoim języku: angielskie to tłumaczenie tych samych 960 numerów, więc „bez powtórek” działa dalej, a każda gra losuje ze wszystkich pytań. Pytanie, którego nie da się przetłumaczyć nawet z krótkim wyjaśnieniem, osoba na angielskim ekranie widzi po polsku z dopiskiem. Karta linku na Discordzie jest w języku tego, kto skopiował link.

Decyzje Karola: 21.11.2026 po researchu i w wywiadzie do planu; 24.11.2026 zmiana „gra nie ma języka” i trzy decyzje, które z niej wynikły (przy każdej data).

1. Gra nie ma języka (24.11; zastępuje „język należy do gry, host wybiera go przy »Nowa gra«” z 21.11, przyjęte wtedy w paczce rekomendacji). Każdy gracz ma swój język ekranu, PL albo EN (docelowo może więcej), i zmienia go tylko przełącznikiem. Nie ma wyboru języka na „Nowa gra”, języka w bazie ani osobnej angielskiej puli: każda gra losuje ze wszystkich pytań. Faza 2 (język gry w bazie) zostaje wycofana w Fazie 4; jej migracja nigdy nie trafiła na produkcję.
2. Angielskie pytania to tłumaczenie tych samych numerów (bez zmian w `private.question_base` i w migawce). Liczniki `question_stats` łączą oba języki pod jednym numerem.
3. Przełącznik w prawym górnym rogu każdego ekranu, aktywny cały czas. Zmienia tylko ekrany osoby, która kliknie (ciasteczko), także w pokoju w trakcie gry. Wygląd: F2, wybrany na zrzutach 24.11 (Faza 5 #1).
4. Skąd język ekranu: najpierw przełącznik (ciasteczko), potem przeglądarka (24.11: bez języka gry pomiędzy). Przeglądarka: polski, gdy na liście jej języków polski stoi przed angielskim; angielski, gdy angielski stoi przed polskim albo nie ma żadnego z nich (np. tylko niemiecki); bez nagłówka języka (boty, Discord, smoke) polski. „Woli polski” rozumiemy jako „polski przed angielskim na liście przeglądarki” (rozstrzygnięcie sesji: `de, pl` daje polski).
5. Stały początek angielskiego pytania: „Who’s most likely to …?” (np. „Who’s most likely to be late for their own birthday?”).
6. Tłumaczenie dosłowne, z krótkim wyjaśnieniem, gdy trzeba (24.11; 21.11 było „dosłownie albo pytanie wypada”): pytanie z polskim odniesieniem dostaje dosłowne tłumaczenie z krótkim wyjaśnieniem w samym pytaniu, gdy mieści się w 90 znakach i znaczy to samo (np. „climb Rysy, Poland’s highest peak, in flip-flops”); inaczej zostaje bez angielskiego tekstu. Nigdy adaptacja z innym znaczeniem: w jednej rundzie gracze czytają to samo pytanie w dwóch językach i głosują razem.
7. Pytania pisze agent-tłumacz, poprawia agent-krytyk, wszystkie 960 z 18+; Karol ogląda próbkę około 30 (zrobione 24.11: 927 z 960) i wszystkie dotłumaczone z wyjaśnieniem (Faza 4).
8. Pytanie bez angielskiego tekstu osoba na EN widzi po polsku: całe zdanie z polskim początkiem i `lang="pl"` (`reviews/plan-review.md` F1), z widocznym dopiskiem „Only in Polish” (24.11; wygląd na zrzutach). Takie pytanie zostaje w losowaniu dla wszystkich; host może je pominąć jak każde inne.
9. Pytania wpisane przez graczy (własne pytanie hosta, pytanie przeredagowane przez „Popraw”, propozycja gościa) zostają tak, jak je napisał autor. Gra nie zna ich języka, więc początek zdania jest w języku ekranu osoby, która czyta, a tekst nie dostaje `lang` (24.11; świadomie przyjęte: w mieszanej ekipie takie zdanie może mieszać języki, np. „Who’s most likely to zjadłby całą pizzę?”).
10. Karta linku (Discord, Messenger) w języku tego, kto skopiował link (24.11): link skopiowany z ekranu po angielsku ma dopisek `?lang=en` i kartę po angielsku, bez dopisku karta jest po polsku. Sama strona linku otwiera się w języku gościa (decyzja 4), nie kopiującego.
11. Dwa PR-y: PR A to sam słownik bez zmiany wyglądu (scalony 21.11, na produkcji), PR B to reszta (draft PR #92). Po decyzji 1 PR B nie ma migracji, więc odpada `db push` przed scaleniem.

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

### Stan na 24.11.2026 (gałąź `english-version-b`, draft PR #92)

- Faza 1 (słownik) na produkcji od 21.11 (PR A #91 → `684c299`); `locals.lang` dalej zawsze `pl`.
- Faza 2 na gałęzi, nigdy na produkcji: migracja `supabase/migrations/20261121200226_game_language.sql` (`rooms.language`, `create_room(…, p_language)`, `language` w `room_lobby`, `room_link` i `game_history`), w Workerze `LobbyState.language`, `GameHistoryRecord.language`, `roomLink(…).language`, `createRoom({ language })`, pole `language` i kod `invalid_language` w `POST /api/rooms`, `QuestionSelection.language` z filtrem `playsIn` (`src/lib/rounds/draw.ts`), `language` w selekcie `hostRoomCategories`; testy `tests/db/**` (z `game-language.test.ts`), pgTAP (`round_creator_view.test.sql`), `tests/unit/room-rpc-gate.test.ts`. Wszystko to znika w Fazie 4.
- Faza 3 na gałęzi: `src/data/questions-en.ts` (927 z 960 pytań, 14 nazw kategorii), `questionText(id, lang)` z polskim zapasem, `roundQuestion` w `server.ts` (tekst gracza dziś z językiem gry), `categoryChoices(lang)` na „Nowa gra”, `questionLang` w `RoundView` i `lang` w `ListQuestion` i `HistoryQuestion`. Zostaje, poza filtrem puli i językiem gry przy tekstach graczy.
- 33 pytania bez angielskiego tekstu (popkultura 8, znane gry 7, jedzenie 6, imprezy 4, podróże 4, przyszłość 3, sport 1; trzy z nich 18+).

## Desired End State

- Gra bez języka: „Nowa gra” bez wyboru języka, baza i jej testy jak na `main` (`git diff origin/main...HEAD -- supabase tests/db` pusty), każda gra losuje ze wszystkich pytań.
- Przełącznik F2 w prawym górnym rogu każdego ekranu (`/`, `/gry`, `/gry/<id>`, `/auth/signin`, `/j/<token>` we wszystkich stanach, `/r/<id>` we wszystkich stanach). Kliknięcie zmienia tylko ekrany tej osoby i zostaje zapamiętane; w pokoju działa bez przeładowania (czat i głos zostają).
- Bez wyboru z przełącznika każdy ekran otwiera się według reguły przeglądarki z decyzji 4.
- Każda strona deklaruje swój język (`<html lang>`). Pytanie bazy w innym języku niż ekran stoi w całości w swoim języku (z jego początkiem zdania), ma swój `lang` i dopisek „Only in Polish”.
- Każde z 960 pytań ma angielski tekst albo świadomy wpis „tylko po polsku” z powodem; test pilnuje, że nigdy żadnego albo obu.
- Karta linku: `/j/<token>?lang=en` po angielsku, `/j/<token>` po polsku, niezależnie od języka samej strony; prowadzący z ekranem po angielsku kopiuje link z dopiskiem.
- Polski wygląda co do litery jak dziś (podglądy przed i po bez różnic), e2e po polsku bez zmian w asercjach, jeden angielski przebieg e2e, kroki smoke języka ekranu, przełącznika i karty linku.
- Sprawdzenie: CI zielone, smoke na produkcji zielony z nowymi krokami, Karol na telefonie i laptopie (Faza 6).

## What We're NOT Doing

- Języka gry (decyzja 1 z 24.11): bez wyboru na „Nowa gra”, bez kolumny w bazie i bez osobnej puli pytań.
- Usuwania z losowania pytań tylko po polsku (decyzja 8: dopisek, a host może je pominąć).
- Innych języków niż polski i angielski (PRD §Non-Goals).
- Tłumaczenia pytań wpisanych przez hosta, przeredagowanych i propozycji gości; nie oznaczamy też ich języka (decyzja 9).
- Adaptacji polskich odniesień z innym znaczeniem (decyzja 6; krótkie wyjaśnienie w tłumaczeniu tak).
- Adresów z przedrostkiem `/en/` i konfiguracji `i18n` w Astro.
- Angielskiej wersji `public/manifest.webmanifest` (jeden plik dla zainstalowanej ikony; zostaje polski opis).
- Strefy czasowej widza: daty dalej w `Europe/Warsaw`, po angielsku w formacie `en-GB`.
- Ekranów Google i Discorda przy logowaniu (mają własny język) i maili (gra nie wysyła maili).
- Tłumaczenia danych przykładowych podglądów `/dev/*` poza tym, co pokazuje ekran gry (nicki i pytania przykładowe mogą zostać polskie).
- Podziału `question_stats` na języki (temat S-12).
- Nowej biblioteki do tłumaczeń.

## Implementation Approach

Słownik to zwykłe moduły TypeScript w `src/lib/i18n/`: polski jest wzorem typu, angielski musi mieć każdy klucz (`npx astro check` pilnuje kompletności). Teksty z parametrami to funkcje, liczba mnoga przez `Intl.PluralRules`, daty przez `Intl.DateTimeFormat`. Wyspy dostają język w danych strony (jak dziś `gifSearchKey`), a w środku każdej wyspy słownik podaje kontekst React. Pliki `.astro` biorą słownik z `Astro.locals`.

Kolejność chroni polski: słownik bez zmiany wyglądu (Faza 1, na produkcji), angielskie pytania (Faza 3), cofnięcie języka gry i dotłumaczenie pytań (Faza 4), angielskie ekrany z przełącznikiem (Faza 5), dokumenty i wdrożenie (Faza 6). Faza 2 (język gry w bazie) była zrobiona 21–22.11 i jest wycofana decyzją 1 z 24.11. Faza 5 potrzebuje pytań z Faz 3–4, bo angielski przebieg e2e musi zagrać rundę.

## Critical Implementation Details

**Bez migracji.** Po Fazie 4 PR B nie zmienia bazy: Worker z PR B działa na bazie z `main`, więc kolejność „baza, potem kod” go nie dotyczy, a job `db` w CI pokazuje, że testy bazy są te z `main`. Plik `20261121200226_game_language.sql` kasujemy, nie cofamy nową migracją: nigdy nie trafił na produkcję (`db push` miał być w Fazie 5 starego planu), więc zasada „nigdy nie edytuj wgranej migracji” go nie obejmuje.

**Przełącznik w pokoju (kolejność stanów)** (`reviews/plan-review.md` F4). Kliknięcie od razu zmienia słownik wyspy i prosi o świeży stan pokoju w nowym języku wprost: `GET /api/rooms/<id>/lobby?lang=<pl|en>` (endpoint: parametr, potem ciasteczko, potem przeglądarka; zła wartość parametru → 400). Język wyspa czyta z refa, nie jako zależność efektu dzwonków, bo ten nie może się uruchomić ponownie dla tego samego pokoju (`useRoomState.ts:391-396`, `:466`). Równolegle `POST /api/lang` zapisuje ciasteczko, tylko dla następnych wczytań strony; jego błąd nie cofa przełącznika (po przeładowaniu ekran wraca wtedy do języka przeglądarki, znane ograniczenie przy zablokowanych ciasteczkach). Widok z Workera mówi, w jakim języku ma teksty; widok w starym języku (pobranie wysłane przed kliknięciem) wyspa odrzuca raz, bo następne pobranie już prosi o nowy język, więc bez pętli także wtedy, gdy przeglądarka nie zapisze ciasteczka. `JoinWaiting` nie pokazuje tekstu z serwera poza nickiem, więc zmienia tylko słownik i zapisuje ciasteczko. Po zmianie: `document.documentElement.lang` i tytuł karty idą za językiem, a fokus zostaje na przełączniku.

**Język treści pytania** (`reviews/plan-review.md` F1; decyzje 8 i 9 z 24.11). Reszta ekranu jest zawsze w języku ekranu. Pytanie bazy jest w języku ekranu, gdy ma w nim tekst, inaczej po polsku (`questionText` oddaje tekst i jego język); zdanie dostaje początek języka tekstu, nigdy ekranu, a przy różnicy z ekranem swój `lang` i dopisek „Only in Polish”. Pytanie wpisane przez gracza (własne, przeredagowane, propozycja) to tekst autora z początkiem w języku ekranu, bez `lang` i bez dopisku: gra nie zna jego języka. W widoku jedno pole mówi, w jakim języku jest początek zdania (`questionLang` w `RoundView`, `lang` w `ListQuestion` i `HistoryQuestion`): dla pytania bazy język tekstu, dla pytania gracza język ekranu, więc `lang` i dopisek pojawiają się tylko przy pytaniu bazy. Lista pytań hosta, pole „Popraw” i podpowiedzi formularzy pytań (`QuestionList.tsx`, `ProposalForm.tsx`, `QuestionField.tsx`) są w języku ekranu osoby, która pisze („Popraw” wpisuje w pole tekst z listy, a zapis idzie jako `p_text`). Czytnik ekranu (`announce.ts`) bierze tę samą regułę.

**Link prowadzącego i karta** (decyzja 10). Worker oddaje `linkUrl` bez dopisku, jak dziś. Dopisek `?lang=en` dokleja `PlayerLink` w przeglądarce, gdy ekran prowadzącego jest po angielsku, w polu i przy „Kopiuj”. Porównanie „link się zmienił” (S-09, „Szara linijka”) idzie dalej po `linkUrl` z Workera, więc przełączenie języka go nie zapala. Strona `/j/<token>` czyta `?lang` tylko do znaczników karty (`linkPreview` w `Layout.astro`, `og:*`): `en` daje angielską kartę, brak albo inna wartość polską. Treść strony idzie za decyzją 4. Formularz wejścia i przekierowania dopisku nie niosą.

**Playwright.** `locale: "pl-PL"` w `use` całego configu przed pierwszą zmianą, która czyta język przeglądarki (Faza 5). Angielski przebieg ustawia język sam.

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

## Faza 2: Język gry w bazie (wycofana 24.11.2026)

### Overview

**Wycofana decyzją 1 z 24.11.2026 (gra nie ma języka).** Zrobiona i sprawdzona w CI 21–22.11 (draft PR #92, próbny alarm trafił dokładnie, §6.2), migracja nigdy nie trafiła na produkcję. Cofnięcie w Fazie 4 #1–#2. Zapis tego, co zrobiła, żeby cofnięcie było pełne:

- Migracja `supabase/migrations/20261121200226_game_language.sql`: `public.rooms.language text not null default 'pl'` z `check`, `create_room` z nowym parametrem `p_language` (stary podpis zrzucony, odmowa `invalid_language`), klucz `language` w `room_lobby` (każdy gracz, każdy stan), `room_link` (`open`, `started`, `closed`) i `game_history`.
- Testy bazy: `LOBBY_KEYS` i `HISTORY_KEYS` (`tests/db/support/rounds.ts`), `seedRoom` z językiem (`tests/db/support/rooms.ts`), dokładne `toEqual` na `room_link` w kilku plikach `tests/db/*.test.ts`, nowy `tests/db/game-language.test.ts`; pgTAP `supabase/tests/round_creator_view.test.sql` (podpis, granty, `plan(N)`); `tests/unit/room-rpc-gate.test.ts` (`SQL_SIGNATURES`, `p_language`).
- Worker: `LobbyState.language`, `GameHistoryRecord.language`, `RoomView.language` (z `LobbyState`), `language` w `roomLink` i `createRoom`, pole `language` i kod `invalid_language` w `POST /api/rooms` (z tekstem w `src/lib/i18n/pl/room-errors.ts`), `QuestionSelection.language` z filtrem `playsIn` w `src/lib/rounds/draw.ts` (każde miejsce losowania, także `leaderMoreQuestions`, „Przejrzyj pytania” i „Dolosuj pytanie” przez `hostRoomCategories`).

### Success Criteria (wykonane przed wycofaniem)

- Bramka lokalna, draft PR B z zielonym CI, próbny alarm `create_room` zapisuje zawsze `pl` (Progress 2.1–2.4).

---

## Faza 3: Angielskie pytania

### Overview

Angielskie teksty tych samych numerów i angielskie nazwy kategorii, napisane przez agenta i poprawione przez krytyka, z testami reguł tekstu i liczebności.

**Po decyzjach z 24.11 (Faza 4):** filtr angielskiej puli (`playsIn`) i jego testy znikają razem z językiem gry; tekst pytania gracza bierze język ekranu, nie gry (decyzja 9); lista pytań hosta jest w języku ekranu hosta; próg „co najmniej 15 zwykłych angielskich pytań w kategorii” zastępuje strażnik podziału (każde pytanie ma angielski tekst albo wpis „tylko po polsku”), a 33 pytania bez angielskiego tekstu dostają drugie podejście z krótkim wyjaśnieniem (decyzja 6). Opis niżej to stan po Fazie 3.

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

## Faza 4: Gra bez języka i dotłumaczenie pytań

### Overview

Cofnięcie Fazy 2 (baza i jej testy jak na `main`, Worker bez języka gry), losowanie ze wszystkich pytań, tekst pytania gracza i lista pytań hosta w języku ekranu, drugie podejście do 33 pytań bez angielskiego tekstu (krótkie wyjaśnienie, decyzja 6) i strażnik, że każde pytanie ma angielski tekst albo świadomy wpis „tylko po polsku”. Na ekranie nic się nie zmienia: `locals.lang` jest dalej zawsze `pl`, angielskiego słownika jeszcze nie ma.

### Changes Required:

#### 1. Baza jak na `main`

**File**: `supabase/migrations/20261121200226_game_language.sql` (usunięty), `supabase/tests/round_creator_view.test.sql`, `tests/db/**` (`tests/db/game-language.test.ts` usunięty), `tests/unit/room-rpc-gate.test.ts`

**Intent**: Gra nie ma języka, więc baza go nie zna; PR B nie zmienia bazy.

**Contract**: pliki przywrócone z `origin/main` (`git checkout origin/main -- …`, `git rm` migracji i `game-language.test.ts`); `git diff origin/main...HEAD -- supabase tests/db tests/unit/room-rpc-gate.test.ts` pusty. Kasowanie pliku migracji jest bezpieczne tylko dlatego, że nigdy nie był wgrany („Critical Implementation Details”, „Bez migracji”).

#### 2. Worker i ekrany bez języka gry

**File**: `src/lib/rooms/shared.ts`, `src/lib/rooms/server.ts`, `src/lib/rooms/history.ts`, `src/lib/rounds/draw.ts`, `src/pages/api/rooms/index.ts`, `src/pages/api/rooms/[id]/question-list.ts`, `src/pages/api/rooms/[id]/question-draw.ts`, `src/lib/i18n/pl/room-errors.ts`, `src/components/room/{QuestionList,QuestionField,ProposalForm,QuestionProposals,RoomLobby,RoomScreen}.tsx`, `src/pages/dev/room-states.astro`, `src/pages/dev/room-window.astro`

**Intent**: Nic w kodzie nie zakłada języka gry; teksty idą za językiem ekranu według „Język treści pytania”.

**Contract**:

- Bez `language` w `LobbyState`, `RoomView`, `GameHistoryRecord`, `roomLink` i `createRoom`; parsery jak na `main` (baza tego klucza nie oddaje).
- `POST /api/rooms` bez pola `language`; kod `invalid_language` i jego tekst znikają.
- `QuestionSelection` bez `language`, bez `playsIn`: pula z kategorii i 18+, jak na `main`; `hostRoomCategories` bez `language`.
- `questionText(id, lang)` i `categoryChoices(lang)` zostają (język ekranu). `roundQuestion`: tekst gracza z językiem ekranu (decyzja 9), tekst bazy z `questionText`. Lista pytań hosta (`listQuestions`) w języku ekranu hosta, historia w języku strony.
- Komponenty formularzy pytań i propozycji biorą język ekranu z kontekstu słownika (prop `language` znika).
- `questionLang` w `RoundView` i `lang` w `ListQuestion` i `HistoryQuestion` zostają: Faza 5 rysuje z nich `lang` i dopisek.

#### 3. Dotłumaczenie (agent + krytyk)

**File**: `src/data/questions-en.ts`, zestawienie dla Karola w scratchpadzie

**Intent**: Jak najmniej pytań tylko po polsku, bez zmiany znaczenia (decyzja 6 z 24.11).

**Contract**:

- Agent-tłumacz bierze 33 numery bez angielskiego tekstu i każdemu daje dosłowne tłumaczenie z krótkim wyjaśnieniem w samym pytaniu (np. „climb Rysy, Poland’s highest peak, in flip-flops”) albo zostawia je tylko po polsku z powodem. Agent-krytyk z osobnym promptem sprawdza: to samo znaczenie co po polsku (w jednej rundzie gracze czytają oba języki), naturalny angielski, reguły nagłówka pliku (najwyżej 90 znaków, mała litera, bez „?” i „.”), wyjaśnienie krótkie i prawdziwe, 18+ bez wulgarności.
- Lista „tylko po polsku” w `questions-en.ts` (nazwa ustala implementujący, np. `POLISH_ONLY`): numery bez angielskiego tekstu, każdy z powodem w komentarzu; jeden literał, jak `QUESTIONS_EN`.
- Nagłówek pliku: decyzja 6 z 24.11 (wyjaśnienie zamiast „brak wpisu”), brak angielskiej puli (pytanie bez angielskiego tekstu gra w każdej grze i stoi na ekranie EN po polsku z dopiskiem), nowe pytanie bazy dostaje angielski tekst albo wpis na liście.
- Zestawienie: wszystkie 33 jako tabela PL | EN (albo „zostaje po polsku” z powodem), z oznaczeniem 18+.

#### 4. Testy

**File**: `tests/unit/questions-en.test.ts`, `tests/unit/draw.test.ts`, `tests/unit/room-state.test.ts`, `tests/unit/game-history.test.ts` i inne, które dziś podają `language` (przed pisaniem przeczytaj `context/foundation/test-plan.md` §6.1)

**Intent**: Podział pytań pilnowany testem, a widok sprawdzony bez języka gry.

**Contract**:

- Strażnik podziału: każdy numer `QUESTIONS` ma angielski tekst albo wpis na liście „tylko po polsku”, nigdy oba i nigdy żadnego; lista zawiera tylko numery bazy (wyrocznia: zbiory z obu plików, bez filtra losowania).
- Usunięte razem z angielską pulą: test „pula angielskiej gry ma tylko numery z angielskim tekstem”, przypadki filtra języka w `draw.test.ts` (te 5, które zapalił alarm 3.3) i próg „co najmniej 15 zwykłych angielskich pytań w kategorii”. Reguły tekstu i `questionText` zostają.
- Widok: tekst pytania gracza ma język ekranu (ekran PL i EN), pytanie bazy bez angielskiego na ekranie EN ma `pl`, lista hosta w języku ekranu, historia w języku strony; klucza `language` nie ma w widoku.

### Success Criteria:

#### Automated Verification:

- Bramka lokalna przechodzi: `npm run lint`, `npx astro check`, `npm test`, `npm run build`; `git diff origin/main...HEAD -- supabase tests/db tests/unit/room-rpc-gate.test.ts` pusty; `npm run questions:migration` nie robi nowej migracji
- Strażnik podziału działa (lokalnie, bez pusha): angielski tekst jednego pytania usunięty na próbę bez wpisu na liście „tylko po polsku” czerwieni `npm test` tylko w teście podziału
- Push za zgodą Karola: CI zielone we wszystkich jobach (`db` na testach z `main`)

#### Manual Verification:

- Karol ogląda tabelę 33 pytań (dotłumaczone z wyjaśnieniem i te, które zostają po polsku) i zatwierdza

**Implementation Note**: Najpierw cofnięcie (#1, #2, #4) z bramką, potem dotłumaczenie (#3) podagentami tłumacz i krytyk; w promptach zakaz instalacji i jawne wykluczenie `.dev.vars` i `.env*` w grep. Próbny alarm lokalny, bo jedyny nowy test to strażnik podziału. Wpisy alarmów Faz 2 i 3 w `test-plan.md` §6.1 i §6.2 to historia; ich opisy poprawia Faza 6. Po fazie pauza na akceptację Karola.

---

## Faza 5: Angielskie ekrany i przełącznik

### Overview

Angielski słownik, język ekranu z przełącznika albo przeglądarki, przełącznik w rogu każdego ekranu, dopisek przy pytaniu tylko po polsku, karta linku w języku kopiującego, podglądy po angielsku, e2e i smoke.

### Changes Required:

#### 1. Galeria wariantów (decyzja Karola)

**File**: zrzuty w scratchpadzie (podglądy z danymi z ręki, bez sieci)

**Intent**: Karol wybiera wygląd dopisku „Only in Polish” (`AGENTS.md` „## UI”; strona HTML z „Co oceniasz” w Chrome Karola, laptop jako całe okno 1:1, telefon w prawdziwej wielkości). Przełącznik jest już wybrany (niżej).

**Contract**: 2–3 warianty dopisku z tokenów (`src/styles/global.css`), bez nowych kolorów, chyba że Karol wybierze wariant, który ich wymaga (wtedy token i wiersz w `PAIRS`); na głosowaniu, odsłonie, liście pytań hosta i w historii gry, na laptopie i telefonie.

**Decyzja Karola (24.11.2026, galeria w wersji 2 po jego uwagach):** przełącznik **F2** (najpierw F1, potem zmiana na F2): przycisk z flagą i kodem obecnego języka ze strzałką, „🇵🇱 PL ˅” (`bg-muted`, kod `text-foreground`, strzałka `text-muted-foreground`), a po dotknięciu menu pod nim z dwoma wierszami „🇵🇱 Polski” i „🇬🇧 English” (nazwa każdego języka w nim samym, z `lang`); obecny wiersz na `bg-accent` z ptaszkiem `text-primary-text`, menu na `bg-popover` z cieniem karty. Zmiana dwoma dotknięciami; menu zamyka Esc, klik obok i wybór, fokus wraca na przycisk. Stoi zawsze w samym prawym górnym rogu ekranu: gdy kolumna nagłówka sięga krawędzi okna (telefon), jako ostatni w wierszu, za „Wyloguj”; gdy kolumna stoi na środku (laptop, `/` i `/j/` 512 px, pokój `ROOM_FRAME`), przy krawędzi okna, poza kolumną, na wysokości wiersza nagłówka. Flagi to obrazki SVG w `public/` (emoji flag Windows rysuje literami „PL”), 20×14 z zaokrągleniem; angielska brytyjska (daty `en-GB`). Kolory flag żyją tylko w tych plikach, jak w `public/icons/icon.svg`, nie w widokach. Wzór makiety: `shots.mjs` w scratchpadzie sesji `722d40d4-…\scratchpad\s27p4\` (`F2`, `F2-open`, `placeSwitcher`; galeria `galeria.html`). Wybór języka gry na „Nowa gra” (J1–J3 z tej galerii) odpadł z decyzją 1 z 24.11.

#### 2. Angielski słownik

**File**: `src/lib/i18n/` (moduł angielski)

**Intent**: Każdy napis po angielsku; brak klucza to błąd `npx astro check`.

**Contract**: angielski typowany typem polskiego słownika; terminy gry stałe w całym słowniku (np. reveal, skip, abstain, co-host, question suggestion; lista trafia do słownika pojęć w Fazie 6); typografia z „Critical Implementation Details”; daty `en-GB` w `Europe/Warsaw`; liczba mnoga `one`/`other`; karta linku po angielsku („Who’s most likely to …”); dopisek „Only in Polish” (i jego wersja dla czytnika, jeśli wariant jej potrzebuje).

#### 3. Język ekranu i przełącznik

**File**: `src/middleware.ts`, `src/env.d.ts`, `src/lib/i18n/`, nowa trasa `src/pages/api/lang.ts`, `src/layouts/Layout.astro`, strony z `src/pages/**`, nowy komponent przełącznika w `src/components/room/`

**Intent**: Każda strona wybiera język według decyzji 4, a przełącznik go zmienia i zapamiętuje.

**Contract**:

- Czysta funkcja rozstrzygająca: `(ciasteczko, Accept-Language) → Lang`. Ciasteczko `pl`/`en` wygrywa; potem lista przeglądarki: pierwszy tag z głównym podtagiem `pl` albo `en` według wag `q` (`pl-PL` to `pl`; przy równym `q` wcześniejszy na liście, tag z `q=0` pominięty, `reviews/plan-review.md` F7); gdy żadnego z nich nie ma → `en`; brak nagłówka, pusty albo samo `*` → `pl`.
- Middleware ustawia `locals.lang` dla każdej strony tą funkcją; żadna strona nie dokłada języka z bazy.
- Ciasteczko `mlt-lang`: wartości `pl`/`en`, `path=/`, `sameSite=lax`, `httpOnly`, `secure` po protokole, około roku; ustawia je tylko `POST /api/lang` (pole `lang`, pole `next` z adresem powrotu). `next` czytany przez `new URL(next, url.origin)` i przyjęty tylko przy tym samym `origin`; przekierowanie idzie na jego `pathname + search`, inaczej na `/` (`reviews/plan-review.md` F5: sama reguła „od `/`, nie od `//`” przepuszcza `/\evil.com`, bo przeglądarka czyta `\` jak `/`). Formularz bez JS (`application/x-www-form-urlencoded`): 303 na `next`. Wyspa: JSON we wzorze `refuseForeignPost` (`src/lib/rooms/json-route.ts:47-58`), odpowiedź 204. Zła wartość `lang`: 400 bez ciasteczka.
- Przełącznik w prawym górnym rogu każdej strony z „Desired End State”: na stronach bez stanu na żywo zwykły formularz z przeładowaniem; w pokoju (`RoomScreen`) i w czekaniu na wpuszczenie (`JoinWaiting`) zmiana bez przeładowania według „Critical Implementation Details”.
- Widok pokoju (`roomView`, `GET …/lobby`) rysuje teksty w języku ekranu tej osoby (parametr `lang` z wyspy, potem ciasteczko, potem przeglądarka) i mówi, w jakim języku je ma.
- `Layout.astro`: `<html lang>` z języka ekranu.
- KLIPY: `locale` z języka ekranu osoby (`gifs.ts:84`).
- „Nowa gra”: nazwy kategorii w języku ekranu (`categoryChoices`, z Fazy 3), bez innych zmian formularza.

#### 4. Dopisek przy pytaniu tylko po polsku

**File**: `src/components/room/RoundQuestion.tsx`, `QuestionList.tsx`, `GameHistory.tsx`, `src/lib/rooms/announce.ts` (i to, co wskaże wybrany wariant)

**Intent**: Gracz na ekranie EN wie, że polskie pytanie to nie błąd, a host widzi je na liście i może je pominąć (decyzja 8).

**Contract**: dopisek w wariancie wybranym przez Karola wszędzie, gdzie pytanie bazy stoi w innym języku niż ekran (`questionLang`/`lang` ≠ język ekranu): głosowanie, odsłona, lista pytań hosta, historia gry; czytnik ekranu czyta zdanie z jego `lang`. Przy pytaniu gracza nigdy (ma język ekranu, „Język treści pytania”).

#### 5. Karta linku w języku kopiującego

**File**: `src/components/room/PlayerLink.tsx`, `src/pages/j/[token].astro`, `src/lib/i18n/` (karta po angielsku)

**Intent**: Link wklejony na Discorda przez prowadzącego z ekranem po angielsku ma angielską kartę (decyzja 10).

**Contract**: według „Link prowadzącego i karta” w „Critical Implementation Details”: `PlayerLink` dokleja `?lang=en` przy ekranie EN (pole i „Kopiuj”), „link się zmienił” porównuje `linkUrl` z Workera; `/j/<token>` bierze kartę z `?lang` (`en` → angielska, inaczej polska), a treść strony z języka ekranu.

#### 6. Podglądy

**File**: `src/pages/dev/room-states.astro`, `room-window.astro`, `link-window.astro`, `ui-kitchen-sink.astro`

**Intent**: Każdy stan do obejrzenia po polsku i po angielsku.

**Contract**: parametr `?lang=en` na każdym podglądzie (linki list stanów go zachowują); przełącznik ma stan w `/dev/room-window` i `/dev/link-window` (zmienia okno) oraz wiersz w `/dev/ui-kitchen-sink` (domyślny, hover, focus-visible, otwarte menu, aktywny język; reszta „nie dotyczy” z powodem); dopisek „Only in Polish” w `room-states` (głosowanie, odsłona, lista hosta) i link prowadzącego z dopiskiem `?lang=en`.

#### 7. E2E

**File**: `playwright.config.ts`, `tests/e2e/support/room.ts`, `tests/e2e/support/round.ts`, nowy `tests/e2e/english.spec.ts` (przed pisaniem przeczytaj `context/foundation/test-plan.md` §6.4)

**Intent**: Polskie testy bez zmian, jeden angielski przebieg z przełącznikiem.

**Contract**:

- `use.locale: "pl-PL"` w `playwright.config.ts`.
- `english.spec.ts` w obu projektach (`chromium` i `phone`, dopisany do `testMatch` telefonu): host z przeglądarką `en-US` widzi `/` po angielsku i zakłada grę z jedną kategorią, w której każde pytanie ma angielski tekst (kategoria liczona w teście z listy „tylko po polsku”, nie wpisana na sztywno), a jego link kończy się `?lang=en`; gość A (`en-US`) wchodzi z linku (strona linku po angielsku), gość B (`pl-PL`) też (strona po polsku); runda: host i A widzą pytanie `/^Who’s most likely to .+\?$/`, B po polsku; A w trakcie rundy przełącza na PL (jego pytanie i ekran po polsku, u innych bez zmian, jego głos zostaje), a po odświeżeniu dalej PL.
- Limit konta e2e: przebieg otwiera dziś 39 gier na 60 na godzinę (`playwright.config.ts:17-20`); nowy plik dokłada 2 (po jednej w projekcie).

#### 8. Smoke

**File**: `scripts/smoke.mjs` (przed pisaniem przeczytaj `context/foundation/test-plan.md` §6.5)

**Intent**: Na produkcji sprawdzone: język ekranu, przełącznik i karta linku.

**Contract**: strona bez gry i bez sesji (np. `/auth/signin`) bez `Accept-Language` ma `lang="pl"`, z `Accept-Language: en-US,en;q=0.9` ma `lang="en"`; `POST /api/lang` z `lang=en` ustawia `mlt-lang` (`httpOnly`, `secure` na https), a ta strona z tym ciasteczkiem i `Accept-Language: pl` ma `lang="en"`; zła wartość → 400 bez ciasteczka; `next` z obcym adresem (`//evil.com`, `/\evil.com`, `https://evil.com`) nie przekierowuje poza stronę; obok istniejącego kroku karty linku: `/j/<link>?lang=en` ma angielską kartę (druga stała `LINK_CARD_EN` obok `LINK_CARD`, komentarz „change the two together”), a `/j/<link>` dalej polską. Bez nowej gry. Suma kroków w §6.5.

### Success Criteria:

#### Automated Verification:

- Bramka lokalna przechodzi: `npm run lint`, `npx astro check` (angielski słownik ma każdy klucz polskiego), `npm test` (z testami funkcji rozstrzygającej, trasy `/api/lang`, karty linku i dopisku), `npm run build`
- Podglądy `/dev/*` po polsku bez różnic względem stanu po Fazie 1 (poza przełącznikiem), a po angielsku bez polskich liter poza danymi przykładowymi graczy i pytaniami tylko po polsku; pseudosłownik (`?lang=xx`) dalej bez napisów spoza słownika, także na przełączniku i dopisku (skrypt porównania z Fazy 1)
- Push za zgodą Karola: CI zielone, `english.spec.ts` w obu projektach i nowe kroki smoke przechodzą, polskie e2e bez zmian w asercjach
- Próbny alarm: przeglądarka wygrywa z ciasteczkiem; zapalają się tylko przewidziane testy; po `git revert` CI zielone

#### Manual Verification:

- Karol wybiera wygląd dopisku „Only in Polish” na zrzutach (przełącznik F2 wybrany 24.11)
- Karol akceptuje angielskie ekrany na zrzutach (laptop i telefon, wszystkie stany pokoju, strona linku, ekrany hosta, historia gry)

**Implementation Note**: Najpierw galeria dopisku i wybór Karola, potem kod. Próbny alarm: w funkcji rozstrzygającej przeglądarka przed ciasteczkiem. Przewidywanie: w `ci` czerwone przypadki kolejności źródeł (ciasteczko kontra przeglądarka); w `e2e` krok „po odświeżeniu dalej PL” w `english.spec.ts` w obu projektach; w `smoke` krok „ciasteczko `en` wygrywa z `Accept-Language: pl`”; `db` zielony. Wynik w §6.4. Po fazie pauza na akceptację Karola.

---

## Faza 6: Dokumenty i wdrożenie

### Overview

Nazwy i decyzje w dokumentach, PR B gotowy, scalenie, smoke na produkcji, sprawdzenie Karola. Bez `db push` (decyzja 1 z 24.11).

### Changes Required:

#### 1. Dokumenty

**File**: `context/domain/glossary.md`, `AGENTS.md`, `context/foundation/test-plan.md`, `context/deployment/deploy-plan.md`, `context/foundation/roadmap.md`, `docs/development.md`

**Intent**: Następna zmiana wie, gdzie są napisy, jak dopisać nowy i nowe pytanie, i jak nazywać język.

**Contract**:

- Słownik pojęć: „język ekranu” (`mlt-lang`, przełącznik, `locals.lang`; nie: „język gry”, „locale”; gra nie ma języka), „przełącznik języka”, „pytanie tylko po polsku” (lista w `questions-en.ts`, dopisek „Only in Polish”); angielskie odpowiedniki terminów gry z angielskiego słownika (kolumna albo tabela).
- `AGENTS.md` (Conventions lub UI): każdy nowy napis trafia do obu słowników w `src/lib/i18n/` (strażnik `ui-text` i `npx astro check`); nowe pytanie bazy dostaje angielski tekst albo wpis „tylko po polsku” z powodem (`src/data/questions-en.ts`, test podziału).
- `test-plan.md`: §6.1 (testy słownika, strażnik podziału; filtr angielskiej puli i jego test usunięte 24.11, wpis alarmu 3.3 zostaje jako historia z dopiskiem), §6.2 (strażnik języka gry wycofany razem z migracją 24.11, wpis zostaje jako historia z dopiskiem), §6.4 (`english.spec.ts`, `locale` w configu), §6.5 suma kroków, wyniki alarmów Faz 4–5, wpis w §8.
- `deploy-plan.md`: PR B bez migracji, zwykła kolejność (scalenie, Workers Builds, smoke).
- `docs/development.md`: `?lang=en` w podglądach, gdzie są słowniki.
- Roadmapa: status S-27 prowadzą `/10x-implement` i `/10x-archive`.

#### 2. Scalenie i sprawdzenie

**File**: brak

**Intent**: Kod na produkcji i sprawdzony na prawdziwym urządzeniu.

**Contract**: opis PR B poprawiony (bez migracji i języka gry); PR B gotowy (nie draft), CI zielone; scala Karol (`! gh pr merge <n> --merge`); Workers Builds; smoke na produkcji za zgodą (`BASE_URL=https://most-likely-to.charlesonthewave.workers.dev npm run smoke`); Karol na telefonie i laptopie.

### Success Criteria:

#### Automated Verification:

- `npx prettier --check` dla zmienionych plików `.md` przechodzi
- CI na PR B zielone (`ci`, `smoke`, `db`, `e2e`)
- Smoke na produkcji zielony, z krokami języka ekranu, przełącznika i karty linku

#### Manual Verification:

- Karol na laptopie i telefonie: link skopiowany z ekranu EN ma na Discordzie angielską kartę, a z PL polską; gość z angielską przeglądarką widzi pokój po angielsku; przełącznik w trakcie rundy w obie strony (głos i czat zostają); pytanie tylko po polsku z dopiskiem na ekranie EN
- Karol: ekrany otwierają się w języku przeglądarki, a wybór z przełącznika zostaje po zamknięciu przeglądarki

**Implementation Note**: Kolejność: dokumenty i bramka → PR B gotowy → zielone CI → scala Karol → smoke prod (zgoda) → sprawdzenie Karola. Potem `/10x-impl-review` (każdy ekran i widok pokoju) i poprawki.

---

## Testing Strategy

### Unit Tests:

- Słownik: polska liczba mnoga zgodna z dzisiejszym `plural`, angielska `one`/`other`; daty obu języków.
- Funkcja rozstrzygająca: tabela przypadków (ciasteczko kontra `Accept-Language`: `pl-PL`, `en-US,en;q=0.9,pl;q=0.8`, `de-DE,de;q=0.9,pl;q=0.8` → `pl`, `de` → `en`, brak, pusty, `*` → `pl`, `en;q=0.8,pl;q=0.8` → `en`, `pl;q=0,en;q=0.5` → `en`, złe ciasteczko pomijane, ciasteczko `en` przy `pl-PL` → `en`).
- Trasa `/api/lang`: 303 z `next` (formularz), 204 z wyspy (JSON), 400 bez ciasteczka, obcy `next` odrzucony (`//evil.com`, `/\evil.com`, `/<tab>/evil.com`, `https://evil.com` → `/`).
- `GET …/lobby?lang=`: parametr wygrywa z ciasteczkiem i przeglądarką, zła wartość → 400.
- Karta linku: `?lang=en` → angielska, brak albo inna wartość → polska, niezależnie od języka strony; `PlayerLink` z dopiskiem przy ekranie EN, bez fałszywego „link się zmienił” po przełączeniu.
- Pytania angielskie: reguły tekstu, strażnik podziału (angielski tekst albo „tylko po polsku”), zapas polski z `lang`.
- Zdanie pytania: pytanie bazy bez angielskiego na ekranie EN całe po polsku z `lang="pl"` i dopiskiem; pytanie gracza z początkiem w języku ekranu, bez `lang` i bez dopisku; lista hosta w języku ekranu.
- Istniejące testy z nowymi podpisami, asercje polskich tekstów bez zmian.

### Integration Tests:

- Baza (`db`): testy z `main` bez zmian (PR B nie zmienia bazy).
- E2E: `english.spec.ts` w obu projektach; reszta po polsku z `locale: "pl-PL"`.
- Smoke: kroki języka ekranu, przełącznika i karty linku.

### Manual Testing Steps:

1. Host z ekranem po angielsku kopiuje link i wkleja na Discordzie: karta po angielsku; link z polskiego ekranu: karta po polsku.
2. Gość z angielską przeglądarką: pokój po angielsku; przełącza na PL w trakcie rundy, głos i czat zostają; gość z polską przeglądarką: pokój po polsku.
3. Na ekranie EN pytanie tylko po polsku: całe zdanie po polsku z dopiskiem; host może je pominąć.
4. Wylogowany: `/` w języku przeglądarki; po przełączeniu wybór zostaje po zamknięciu przeglądarki.

## Performance Considerations

Oba słowniki trafiają do paczki wysp (szacunkowo kilkanaście KB na język przed kompresją). To mniej niż obrazek, więc bez dzielenia paczek na języki. Pytania (polskie i angielskie) nigdy nie trafiają do przeglądarki.

## Migration Notes

Bez migracji (decyzja 1 z 24.11): plik migracji Fazy 2 skasowany, zanim trafił na produkcję, więc produkcja nigdy nie miała `rooms.language`. Wycofanie Workera (rollback) niczego w bazie nie zostawia.

## References

- Research: `context/changes/english-version/research.md`
- Decyzje Karola: `context/changes/english-version/change.md`, PRD FR-031 (`context/foundation/prd.md`), roadmapa S-27
- Wzór kodów błędów na teksty: `src/lib/rooms/errors.ts`, `tests/unit/room-errors.test.ts:7-8`
- Wzór danych strony dla wyspy: `gifSearchKey` i `signingKey` w `src/pages/r/[id].astro:81-86`
- Wzór pisania pytań agentem z krytykiem: punkt I (PR #70, gałąź `question-base-expansion-2`, commit `2481724`) i Faza 3 tej zmiany (`16884e7`)
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

> Wycofana decyzją Karola z 24.11.2026 (gra nie ma języka); cofnięcie w Fazie 4. Kroki niżej to zapis tego, co było zrobione.

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

### Phase 4: Gra bez języka i dotłumaczenie pytań

#### Automated

- [x] 4.1 Bramka lokalna przechodzi; baza i jej testy bez różnic względem `main`; `npm run questions:migration` nie robi nowej migracji — 1f57734
- [x] 4.2 Strażnik podziału: angielski tekst usunięty na próbę bez wpisu „tylko po polsku” czerwieni `npm test` (lokalnie) — 1f57734
- [x] 4.3 Push za zgodą Karola: CI zielone we wszystkich jobach — baf257a

#### Manual

- [x] 4.4 Karol ogląda tabelę 33 pytań (dotłumaczone z wyjaśnieniem i zostające po polsku) i zatwierdza — 1f57734

### Phase 5: Angielskie ekrany i przełącznik

#### Automated

- [ ] 5.1 Bramka lokalna przechodzi: angielski słownik ma każdy klucz, testy funkcji rozstrzygającej, `/api/lang`, karty linku i dopisku
- [ ] 5.2 Podglądy po polsku bez różnic względem Fazy 1 (poza przełącznikiem), po angielsku bez polskich liter poza danymi graczy i pytaniami tylko po polsku, pseudosłownik bez napisów spoza słownika
- [ ] 5.3 Push za zgodą Karola: CI zielone, `english.spec.ts` w obu projektach i nowe kroki smoke przechodzą
- [ ] 5.4 Próbny alarm: przeglądarka wygrywa z ciasteczkiem; zapalają się tylko przewidziane testy; po revercie CI zielone

#### Manual

- [ ] 5.5 Karol wybiera wygląd dopisku „Only in Polish” na zrzutach (przełącznik F2 wybrany 24.11)
- [ ] 5.6 Karol akceptuje angielskie ekrany na zrzutach (laptop i telefon, wszystkie stany)

### Phase 6: Dokumenty i wdrożenie

#### Automated

- [ ] 6.1 `npx prettier --check` dla zmienionych plików `.md` przechodzi
- [ ] 6.2 CI na PR B zielone (`ci`, `smoke`, `db`, `e2e`)
- [ ] 6.3 Smoke na produkcji zielony, z krokami języka ekranu, przełącznika i karty linku

#### Manual

- [ ] 6.4 Karol na laptopie i telefonie: karta linku w języku kopiującego, gość z angielską przeglądarką, przełącznik w trakcie rundy, pytanie tylko po polsku z dopiskiem
- [ ] 6.5 Karol: ekrany w języku przeglądarki, wybór przełącznika zostaje po zamknięciu przeglądarki
