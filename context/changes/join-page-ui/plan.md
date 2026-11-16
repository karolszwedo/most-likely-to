# Strona wejścia z linku: plan implementacji

## Overview

Strona `/j/<kod>` to pierwsze, co widzi ktoś z ekipy po kliknięciu linku z Discorda. Dziś nie mówi, co to za gra, podgląd linku na Discordzie jest pusty, koniec gry ma dwa brzmienia i dwa wyglądy, a błąd serwera nie daje kroku dalej. Zmiana wdraża wybór Karola z galerii 16.11.2026 (`change.md`, „Wybór Karola z galerii”):

- nad kartą formularza duże „Kto z nas najprawdopodobniej…?” i zdanie 1 (B), to samo zdanie na `/` i w karcie na Discordzie;
- karta linku P1 (znaczniki Open Graph bez danych pokoju);
- jeden wspólny komunikat z ikoną (K1), także na stronie pokoju `/r/`;
- „Odśwież stronę” przy błędzie i nazwa karty przeglądarki z tytułu ekranu.

Bez bazy, bez migracji, bez zmian w `src/lib/rooms/` i w API: lżejszy cykl.

**Decyzje Karola (16.11.2026):**

1. Zdanie o grze: układ **B** w poczekalni i przy grze w toku, zdanie **1**: „…zasnąłby na własnej imprezie? …nadałby imię swojemu odkurzaczowi? Wskażcie, kto z ekipy pasuje najbardziej. Głos jest anonimowy, wynik widzą wszyscy.” To samo zdanie zastępuje zasady na `/` dla niezalogowanego i trafia do opisu karty na Discordzie.
2. Karta na Discordzie: **P1** (`og:site_name` „Most Likely To”, `og:title` „Dołącz do gry”, `og:description` = „Kto z nas najprawdopodobniej…?” + zdanie 1).
3. `theme-color`: **ciemny jak tło gry** (`#1a1a1a`, `--background` z `.dark`), na każdej stronie: pasek adresu Chrome na Androidzie w kolorze gry, na Discordzie pasek z lewej prawie niewidoczny (zgoda na to w planowaniu).
4. Komunikaty: **K1**, jedno brzmienie końca gry („Ta gra już się skończyła.” + „Poproś hosta o nowy link.”) dla linku po grze i dla czekającego spóźnionego, każdy komunikat z ikoną; **ikony także na `/r/`** (decyzja w planowaniu).
5. Błąd: **tak, teraz**: przycisk „Odśwież stronę” z ikoną i nazwy kart przeglądarki z tytułu ekranu (tabela niżej).

**Decyzje sesji (technika, do korekty przez Karola na zrzutach Fazy 2):**

- Zdanie o grze stoi tylko nad kartami „Dołącz do gry” i „Poproś o wejście” (pierwsze wejście, także z pytaniem „To ty?”). Nie stoi nad „Prowadzący cię nie wpuścił.”, na ekranie czekania ani przy komunikatach. Ekran czekania nie pokazuje nic z gry (`JoinWaiting.tsx:14-15`), a e2e sprawdza tam brak tekstu „Kto z nas najprawdopodobniej” (`latecomer.spec.ts:92`, `rejoin.spec.ts:318`).
- „Odśwież stronę” dostaje też błąd na `/r/` („Nie udało się otworzyć pokoju.”), bo to ten sam komunikat i ta sama awaria.
- Ikony komunikatów `/r/`: „Nie jesteś w tym pokoju.” kłódka, „Usunięto cię z pokoju.” osoba z minusem, „Grasz teraz na innym urządzeniu.” telefon, „Tej gry już nie ma.” kosz, błąd trójkąt ostrzegawczy.

## Current State Analysis

- `src/pages/j/[token].astro:115-191` składa całą stronę: `Layout` z tytułem „Dołącz do gry” dla każdego stanu (`:116`), `AppHeader`, karty `RoomCard` z `JoinForm`, `JoinWaiting`, `RoomMessage` dla nieznanego linku (`:139`), końca gry (`:185`) i błędu (`:186-188`, bez kroku dalej).
- `src/layouts/Layout.astro:14-19`: w `<head>` tylko `charset`, `viewport`, ikona i `<title>`. Discord bez opisu i obrazka nie robi karty (research Z2).
- `src/components/room/Landing.astro:13-21`: jedyne zdanie o grze w repo, tylko na `/` dla niezalogowanego, i to są zasady.
- Wyśrodkowany komunikat złożony ręcznie w 5 miejscach (research Z3). `RoomMessage.astro` (Astro, bez ikony) służy `/j/` i `/r/` (`src/pages/r/[id].astro:93-111`). `JoinWaiting.tsx:220-249` ma własne dwa ekrany z ikonami i inne brzmienie końca gry („Gra się skończyła.”). Wyspa React nie zaimportuje komponentu `.astro`.
- Podglądy: `/dev/room-states` pokazuje same karty i komunikaty (sekcja „Link gościa (/j/…)”, `room-states.astro:967-1070`, 11 próbek `join-*`), bez stanu błędu. Całego okna strony `/j/` nie pokazuje żaden podgląd (`/dev/room-window` obejmuje tylko `/r/`).
- Tymczasowy prototyp galerii `src/pages/dev/join-gallery.astro` leży lokalnie, bez commita.

## Desired End State

- `/j/<kod>` w poczekalni i przy grze w toku: nagłówek, potem wyśrodkowane „Kto z nas najprawdopodobniej…?” (duże, `text-3xl`) i zdanie 1, a niżej karta jak dziś. Na `/` dla niezalogowanego ten sam tytuł i zdanie 1 zamiast zasad, reszta jak dziś.
- Link wklejony na Discordzie (i w Messengerze, WhatsAppie) pokazuje kartę: „Most Likely To”, „Dołącz do gry”, „Kto z nas najprawdopodobniej…? …zasnąłby na własnej imprezie? …”. Karta jest ta sama dla każdego pokoju i stanu, bez nicku, liczby graczy, id pokoju i kodu linku.
- Każdy wyśrodkowany komunikat `/j/` i `/r/` to jeden komponent z ikoną. Koniec gry brzmi na `/j/` zawsze „Ta gra już się skończyła.” + „Poproś hosta o nowy link.”, także u czekającego spóźnionego.
- Błąd otwarcia linku (500/503) i pokoju ma „Odśwież stronę”. Karta przeglądarki ma nazwę z tytułu ekranu.
- Każdy stan `/j/` ma podgląd całego okna na nowej stronie `/dev/link-window`, a `/dev/room-states` pokazuje zdanie o grze, ikony i stan błędu.
- Smoke pilnuje karty linku: znaczniki P1 na stronie linku i brak id pokoju i kodu linku w `<head>`.

Weryfikacja: bramka (`npm run lint`, `npx astro check`, `npm test`, `npm run build`), zielone CI na PR (`ci`, `smoke`, `db`, `e2e`), próbny alarm nowego kroku smoke, zrzuty zaakceptowane przez Karola, karta sprawdzona na Discordzie z `?v=2`.

### Key Discoveries:

- e2e szuka nagłówków `h1` po dokładnym tekście: „Ta gra już się skończyła.” (`game.spec.ts:208`), „Ten link nie działa.” (`support/room.ts:131`), tytuły ekranu czekania (`support/room.ts:136`, `:182`). Karty formularza muszą zostać `h1`, więc tytuł gry nad kartą na `/j/` to `<p>`, nie nagłówek.
- `latecomer.spec.ts:92` i `rejoin.spec.ts:318` sprawdzają, że ekran czekania nie ma tekstu „Kto z nas najprawdopodobniej”: zdanie o grze nie może tam trafić.
- Smoke otwiera link 3 razy i oczekuje 200 bez ciasteczka gracza (`scripts/smoke.mjs:999-1000`). Krok „guest sees the join form” (`:999`) to miejsce na nowy krok karty. Kod linku nie może trafić do wydruku smoke (test-plan §6.5, „Usunięcie gracza”).
- Discord czyta `og:title` (do 70 bajtów), `og:description` (do 350 bajtów), `og:site_name`, `theme-color` (`#RRGGBB`). Kartę robi tylko dla odpowiedzi 2xx, nie uruchamia JS i trzyma kartę ok. 30 minut (`?v=2` wymusza świeżą) (research Z2).
- `theme-color` `#1a1a1a` to `--background` z `.dark` (`src/styles/global.css:60`, `oklch(0.2178 0 0)`). `Layout.astro` leży poza skanem `ui-literals`, więc źródło trzeba zapisać obok wartości.
- Zdanie 1 zawiera dwa pytania z bazy (`src/data/questions.ts`, bez 18+). Tekst przepisany ręcznie, nie import z bazy (lessons: „Pytania gry tylko po stronie serwera”).
- `field.tsx:50-54` ma lokalną poprawkę `w-px`: bez `shadcn add field --overwrite`.

## What We're NOT Doing

- Obrazek karty (`og:image`), logo, ikona gry i manifest: punkt J kolejki.
- `og:url`, `twitter:*`, `author`, kontakt w `<head>`.
- Dane pokoju przed wejściem (nick hosta, liczba graczy): wymagają nowej funkcji bazy dla `anon`, czyli migracji (research, „Granice”).
- Zmiana koloru przycisku `--primary` (motyw Graphite, wybór Karola dla całej gry).
- Ręcznie złożone ekrany `RoomErrorBoundary.tsx:64` i `RoomScreen.tsx:106` zostają (research Z3, deferred): poza stroną linku i komunikatami `/r/`.
- Tekst `room_closed` w `src/lib/rooms/errors.ts:68` zostaje: na `/j/` się nie pojawia (formularz wraca na stronę, która już pokazuje koniec gry), a ekran pokoju używa go w odpowiedziach JSON.
- Zdanie „Skończyła się, zanim prowadzący cię wpuścił.” u czekającego znika (K1), bez wersji pośredniej.
- Bez testów zrzutów (test-plan §7) i bez nowych testów e2e: e2e sprawdza istniejące tytuły, a wygląd sprawdza Karol na zrzutach.

## Implementation Approach

Najpierw kod strony (Faza 1): treści w jednym module, mały komponent zdania o grze, `RoomMessage` jako komponent React z zestawem ikon (wspólny dla Astro i wyspy `JoinWaiting`). Zawartość `<main>` strony `/j/` przenosimy do `LinkScreen.astro`, żeby prawdziwa strona i podgląd całego okna renderowały ten sam kod. Logika `loadPage`, statusy, ciasteczka i przekierowania w `[token].astro` zostają bez zmian. Potem podglądy i zrzuty dla Karola (Faza 2), na końcu krok smoke z próbnym alarmem, dokumenty i PR (Faza 3).

## Faza 1: Strona `/j/` w kodzie gry

### Overview

Prawdziwa strona linku, strona główna i komunikaty `/r/` wyglądają jak w wyborze Karola, a `<head>` strony linku niesie kartę P1.

### Changes Required:

#### 1. Treści gry i strony linku w jednym miejscu

**File**: `src/components/room/game-intro.ts` (nowy)

**Intent**: Jedno źródło tytułu gry, zdania 1 i tekstu karty linku dla `/`, `/j/` i `<head>`, żeby nie powstała druga kopia (research Z1).

**Contract**: eksporty `GAME_TITLE` („Kto z nas najprawdopodobniej…?”), `GAME_TEASER` (zdanie 1 dosłownie, jak w „Decyzje Karola” 1) i `LINK_PREVIEW` (`siteName` „Most Likely To”, `title` „Dołącz do gry”, `description` = `${GAME_TITLE} ${GAME_TEASER}`). Komentarz: tekst przepisany ręcznie, nigdy import z `src/data/questions.ts`; opis mieści się w 350 bajtach Discorda.

**File**: `src/components/room/link-page.ts` (nowy)

**Intent**: Stany strony linku, ich nazwy kart przeglądarki i wspólne komunikaty, z których korzystają `[token].astro`, `LinkScreen.astro`, `JoinWaiting.tsx` i podglądy.

**Contract**:
- typ `LinkView` (dzisiejszy `Page` bez `inside`, z danymi formularza, które dziś liczy `[token].astro`: błąd formularza, podpowiedź nicku, zajęty nick);
- `linkTitle(view)` z tytułami kart:

| Stan | Tytuł karty |
| --- | --- |
| join (bez odrzuconego powrotu) | Dołącz do gry |
| started (bez odrzucenia) | Poproś o wejście |
| join albo started po odrzuceniu | Prowadzący cię nie wpuścił |
| waiting | Czekasz na wejście |
| closed | Ta gra już się skończyła |
| unknown | Ten link nie działa |
| error | Nie udało się otworzyć linku |

- stałe komunikatów `GAME_OVER` („Ta gra już się skończyła.” / „Poproś hosta o nowy link.”, ikona końca gry) i `DEAD_LINK` (T2: „Ten link nie działa.” / „Sprawdź, czy skopiował się cały, albo poproś hosta o nowy.”, ikona martwego linku).

#### 2. Zdanie o grze

**File**: `src/components/room/GameIntro.astro` (nowy), `src/components/room/Landing.astro`

**Intent**: Wyśrodkowany tytuł gry `text-3xl` i zdanie 1 (`text-muted-foreground text-balance`), jak dziś na `Landing`, wspólne dla `/` i `/j/`. `Landing` składa go z przyciskiem „Zaloguj się, żeby założyć grę” i zdaniem o linku, które zostają.

**Contract**: prop `titleAs: "h1" | "h2" | "p"`: `/` `h1`, podgląd na `/dev/room-states` `h2`, strona linku `p` (tam `h1` to tytuł karty). Sam `GameIntro` nie ma odstępów zewnętrznych, odstępy daje miejsce, które go składa.

#### 3. Wspólny komunikat z ikoną

**File**: `src/components/room/RoomMessage.tsx` (nowy), usunięty `src/components/room/RoomMessage.astro`

**Intent**: Jeden komunikat na środku strony (K1), renderowany na serwerze z Astro bez `client:*` i w wyspie `JoinWaiting`. Ten sam wygląd co dziś (`flex flex-col items-center gap-4 py-12 text-center` + `ROOM_NARROW`), plus ikona nad tytułem jak dziś na ekranie czekania (`text-muted-foreground size-10`, `aria-hidden`).

**Contract**: props `title`, `text`, `titleAs` (`h1` domyślnie, `h2` w podglądach), `icon` (klucz z zestawu komponentu, nie komponent: `game-over` DoorClosed, `dead-link` Link2Off, `error` TriangleAlert, `waiting` Hourglass, `outside` Lock, `removed` UserRoundMinus, `moved` Smartphone, `gone` Trash2) oraz opcjonalne `children` pod tekstem (przycisk, dodatkowe akapity). Komentarz z zasadą z `RoomMessage.astro:3-5` przechodzi do nowego pliku.

#### 4. Ekran czekania na wspólnym komunikacie

**File**: `src/components/room/JoinWaiting.tsx`

**Intent**: Oba ekrany (`:220-249`) przez `RoomMessage`. Czekanie: ikona `waiting`, ten sam tytuł, nick, zdanie i linijka `aria-live` jako `children`. Koniec gry: `GAME_OVER`. Gdy ekran sam przejdzie w koniec gry, nazwa karty przeglądarki zmienia się na tytuł końca gry (tylko poza podglądem). Logika odpytywania, kanału i ogranicznika zostaje bez zmian.

**Contract**: teksty ekranu czekania bez zmian (e2e: `support/room.ts:136`, `:182`). Koniec gry ma `h1` „Ta gra już się skończyła.”. Komentarz na górze pliku (`:20`) mówi nowe brzmienie.

#### 5. Zawartość strony linku w jednym komponencie

**File**: `src/components/room/LinkScreen.astro` (nowy), `src/pages/j/[token].astro`

**Intent**: Zawartość `<main>` strony `/j/` dla jednego `LinkView`, wspólna dla prawdziwej strony i `/dev/link-window`. `[token].astro` zostaje przy ładowaniu danych, statusach i ciasteczkach (`:14-114` bez zmian w działaniu) i renderuje `Layout` z `linkTitle(view)` i `LINK_PREVIEW`, `AppHeader` oraz `LinkScreen`.

**Contract**:
- `GameIntro` (`titleAs="p"`) stoi nad kartą tylko przy „Dołącz do gry” i „Poproś o wejście” (pierwsze wejście, także z pytaniem „To ty?”). Nie stoi przy „Prowadzący cię nie wpuścił.”, na ekranie czekania ani przy komunikatach.
- Nieznany link: `DEAD_LINK`. Koniec gry: `GAME_OVER`. Błąd: `RoomMessage` z ikoną `error`, tekstem z `roomErrorMessage(reason)` i linkiem „Odśwież stronę” (`buttonVariants()`, ikona RotateCw jak w `RoomErrorBoundary.tsx`) na `/j/<kod>` bez `?error=` (zwykłe GET, niczego nie zmienia).
- Prop `preview` przekazuje formularzom i ekranowi czekania ich podglądy (bez sieci, bez zapamiętanego nicku), także stan końca gry ekranu czekania. Prawdziwa strona go nie podaje.
- Wyspy zostają `client:load`, z tymi samymi propsami co dziś.

#### 6. Karta linku i kolor gry w `<head>`

**File**: `src/layouts/Layout.astro`

**Intent**: Znaczniki karty P1 tylko na stronie, która je poda (strona linku). `theme-color` w kolorze tła gry na każdej stronie (decyzja 3).

**Contract**:
- opcjonalny prop `preview?: { siteName; title; description }` daje `og:site_name`, `og:title`, `og:description` i `og:type` `website`;
- `<meta name="theme-color" content="#1a1a1a">` zawsze, z komentarzem: to `--background` z `.dark` w `src/styles/global.css` (`oklch(0.2178 0 0)`), zmieniane razem.

Strona linku podaje `LINK_PREVIEW` w każdym stanie (tekst stały, bez danych pokoju). Discord i tak robi kartę tylko z 2xx.

#### 7. Komunikaty strony pokoju

**File**: `src/pages/r/[id].astro`

**Intent**: Komunikaty `:93-111` przez `RoomMessage.tsx` z ikonami (outside, removed, moved, gone, error). Błąd dostaje „Odśwież stronę” na `/r/<id>`. Teksty i tytuły kart bez zmian.

**Contract**: import `RoomMessage` z `.tsx`. Teksty bez zmian (e2e i smoke czytają „Usunięto cię z pokoju.”, „Grasz teraz na innym urządzeniu.”, „Tej gry już nie ma.”).

### Success Criteria:

#### Automated Verification:

- `npm run lint` przechodzi, z `ui-literals` (nowe pliki w `src/components/room/` są w skanie)
- `npx astro check` przechodzi
- `npm test` przechodzi
- `npm run build` przechodzi

**Implementation Note**: zrzuty i akceptacja w Fazie 2. Commit fazy po zielonej bramce, bez pusha.

---

## Faza 2: Podglądy i zrzuty

### Overview

Każdy stan strony linku ma podgląd całego okna, `/dev/room-states` pokazuje nowy wygląd, prototyp galerii znika, a Karol akceptuje gotowe ekrany na zrzutach.

### Changes Required:

#### 1. Stany w `/dev/room-states`

**File**: `src/pages/dev/room-states.astro`

**Intent**: Sekcja „Link gościa (/j/…)” pokazuje `GameIntro` nad kartą w `join-default`, `join-request` i `join-remembered`, jak strona. Nowa próbka `join-error` to błąd 503 z „Odśwież stronę”. Próbki komunikatów `/j/` i `/r/` (`:1004-1013`, `:1202-1230`, `:2813`) używają `RoomMessage.tsx` ze swoimi ikonami, a próbki końca gry i martwego linku stałych `GAME_OVER` i `DEAD_LINK`. Podgląd `/` (`:785`) pokaże nowe zdanie sam.

**Contract**: numer nowej próbki to kolejny wolny na stronie, `id="join-error"`. Tytuły w podglądach `h2`.

#### 2. Podgląd całego okna strony linku

**File**: `src/pages/dev/link-window.astro` (nowy)

**Intent**: Jeden stan `/j/` w prawdziwej ramie strony (`Layout` z `linkTitle`, `AppHeader` gościa, `LinkScreen` z `preview`), do zrzutów telefonu i laptopa, jak `/dev/room-window` dla `/r/`. Bez zapytania strona pokazuje listę stanów. Lokalnie tylko: build produkcyjny odpowiada pustym 404 (wzór `room-window.astro:23-26`).

**Contract**: `?state=` z co najmniej: `join`, `join-taken` („To ty?”), `join-rejected-return`, `request`, `request-rejected`, `waiting`, `waiting-return`, `waiting-closed`, `closed`, `unknown`, `error`. Bez bazy, bez kanału, bez odpytywania.

#### 3. Sprzątanie prototypu i zasada dla agentów

**File**: usunięty `src/pages/dev/join-gallery.astro` (nigdy nie w commicie), `AGENTS.md` §UI

**Intent**: Z galerii nie zostaje nic. Następny agent składa komunikat z `RoomMessage` i dodaje podgląd okna dla `/j/`.

**Contract**:
- w `AGENTS.md` §UI zdanie o podglądach (`A new room state gets a preview…`) dostaje dopisek: stan strony linku `/j/` też w `/dev/link-window`;
- nowy punkt: wyśrodkowany komunikat strony (`/j/`, `/r/`) to `RoomMessage` (`src/components/room/RoomMessage.tsx`) z ikoną z jego zestawu. Nowy komunikat dodaje tam ikonę, nie składa się ręcznie.

#### 4. Zrzuty dla Karola

**Intent**: Strona „Co oceniasz” w Chrome Karola: telefon 390 px w prawdziwej wielkości (całe okno), laptop 1280×600 1:1. Na niej:
- stany `/dev/link-window` (poczekalnia, gra w toku, „To ty?”, odrzucenie, czekanie, koniec gry u czekającego, koniec gry, martwy link, błąd);
- komunikaty `/r/` z ikonami (z `/dev/room-states`);
- `/` dla niezalogowanego z nowym zdaniem.

Zrzuty headless Chrome przez DevTools Protocol (wzór ze scratchpadu galerii). Serwer dev tylko dla `/dev/*`, zatrzymany po zrzutach.

### Success Criteria:

#### Automated Verification:

- Bramka zielona: `npm run lint`, `npx astro check`, `npm test`, `npm run build`
- Każdy stan `/dev/link-window?state=…` odpowiada 200 lokalnie, a `src/pages/dev/join-gallery.astro` nie istnieje

#### Manual Verification:

- Karol akceptuje zrzuty (telefon w prawdziwej wielkości, laptop 1:1): stany `/j/`, komunikaty `/r/` z ikonami, `/` z nowym zdaniem

**Implementation Note**: po akceptacji Karola commit fazy, bez pusha.

---

## Faza 3: Strażnik karty, PR i wdrożenie

### Overview

Smoke pilnuje karty linku i zakazu danych pokoju w podglądzie, próbny alarm dowodzi, że krok potrafi zaświecić, a zmiana trafia na produkcję przez PR.

### Changes Required:

#### 1. Krok smoke karty linku

**File**: `scripts/smoke.mjs`

**Intent**: Zaraz po kroku „guest sees the join form” (`:999`) nowy krok „the link's preview is the game's card, without the room's data”. Z `<head>` strony linku (200) sprawdza `og:site_name` „Most Likely To”, `og:title` „Dołącz do gry”, `og:description` równy tekstowi P1 i `theme-color` `#1a1a1a`. Sprawdza też, że `<head>` nie ma ani id pokoju, ani kodu linku.

**Contract**:
- tekst P1 przepisany w skrypcie z komentarzem, że źródło to `src/components/room/game-intro.ts` (skrypt `.mjs` nie importuje TS);
- obecność id i kodu skrypt sprawdza sam, a na wydruk przy porażce idzie tylko słowo („room data in the preview”), nigdy kod (test-plan §6.5);
- krok bez przełącznika, w każdym trybie.

#### 2. Próbny alarm

**Intent**: Dowód, że krok potrafi zaświecić (test-plan §6.5, „Break-check”). Tymczasowy commit na gałęzi PR dopisuje kod linku do `og:description` na stronie linku. Oczekiwane: w CI czerwony tylko nowy krok smoke, a `ci`, `db` i `e2e` zielone. Potem revert i wpis wyniku z SHA w test-planie.

**Contract**: przewidywanie zapisane przed pushem alarmu. Push alarmu i revertu za zgodą Karola.

#### 3. Dokumenty

**File**: `context/foundation/test-plan.md`, `context/changes/join-page-ui/change.md`, ten plan

**Intent**:
- §6.5 dostaje punkt „Karta linku (join-page-ui)” (co krok sprawdza, że kod linku nie trafia do wydruku) i nową sumę kroków (od S-13: 133, teraz 134);
- wynik alarmu trafia tam, gdzie test-plan zapisuje próbne alarmy smoke;
- `change.md` dostaje status i epilog wdrożenia, a Progress SHA.

**Contract**: bez wpisu w roadmapie (zmiana `/10x-ui` bez slice'a, jak `reveal-ui`).

#### 4. PR i wdrożenie

**Intent**: Push gałęzi (zgoda) → `gh pr create` → zielone `ci`, `smoke`, `db`, `e2e` → scala Karol (`! gh pr merge <n> --merge`) → Workers Builds → smoke na produkcji (zgoda). Potem Karol wkleja link na Discordzie z `?v=2` i patrzy na telefon.

### Success Criteria:

#### Automated Verification:

- Próbny alarm trafia dokładnie: w CI czerwony tylko nowy krok smoke, po revercie zielono
- CI na PR zielone: `ci`, `smoke`, `db`, `e2e`
- Smoke na produkcji zielony po scaleniu (za zgodą Karola)

#### Manual Verification:

- Karol: link z `?v=2` na Discordzie pokazuje kartę P1 (Most Likely To, Dołącz do gry, zdanie 1), bez danych pokoju
- Karol na telefonie i laptopie: `/j/` z Discorda ma zdanie o grze nad kartą, komunikaty z ikonami, ciemny pasek Chrome na Androidzie

---

## Testing Strategy

### Unit Tests:

- Bez nowych: zmiana nie ma logiki poza wyborem tytułu karty, który sprawdzają podglądy i smoke.

### Integration Tests:

- Smoke: nowy krok karty linku (P1 i brak danych pokoju), z próbnym alarmem.
- e2e bez zmian. Pilnują, że tytuły `h1` stron linku i ekranu czekania zostały (`game.spec.ts:208`, `support/room.ts:131`, `:136`, `:182`) i że ekran czekania nie ma tekstu gry (`latecomer.spec.ts:92`, `rejoin.spec.ts:318`).

### Manual Testing Steps:

1. Zrzuty Fazy 2: każdy stan `/dev/link-window`, komunikaty `/r/`, `/`.
2. Po wdrożeniu: link w kanale Discorda z `?v=2`, karta P1 bez danych pokoju.
3. Telefon (Android, Chrome i przeglądarka z Discorda): `/j/` z linku, zdanie nad kartą, formularz bez przewijania, pasek adresu ciemny.

## Performance Considerations

Bez nowego JS: `GameIntro`, `LinkScreen` i komunikaty w Astro renderują się na serwerze, a `RoomMessage.tsx` poza wyspą jest statycznym HTML. W wyspie `JoinWaiting` dochodzi tylko kilka ikon lucide.

## Migration Notes

Brak: bez bazy i bez zmian w API. Discord może do 30 minut pokazywać starą (pustą) kartę dla linków wklejonych przed wdrożeniem.

## References

- Research: `context/changes/join-page-ui/research.md` (Z1–Z4, macierz 7 stanów, granice)
- Wybór Karola: `context/changes/join-page-ui/change.md`, „Wybór Karola z galerii”
- Wzór procesu: `context/changes/reveal-ui/plan.md`
- Strona: `src/pages/j/[token].astro:115-191`; `Layout.astro:14-19`; `Landing.astro:13-21`; `JoinWaiting.tsx:220-249`; `RoomMessage.astro:16-19`; `src/pages/r/[id].astro:89-112`
- Smoke: `scripts/smoke.mjs:999-1000`; test-plan §6.5

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: Strona /j/ w kodzie gry

#### Automated

- [x] 1.1 `npm run lint` przechodzi, z `ui-literals` (nowe pliki w `src/components/room/` są w skanie) — 8a7e1fa
- [x] 1.2 `npx astro check` przechodzi — 8a7e1fa
- [x] 1.3 `npm test` przechodzi — 8a7e1fa
- [x] 1.4 `npm run build` przechodzi — 8a7e1fa

### Phase 2: Podglądy i zrzuty

#### Automated

- [x] 2.1 Bramka zielona: `npm run lint`, `npx astro check`, `npm test`, `npm run build` — 72c98de
- [x] 2.2 Każdy stan `/dev/link-window?state=…` odpowiada 200 lokalnie, a `src/pages/dev/join-gallery.astro` nie istnieje — 72c98de

#### Manual

- [x] 2.3 Karol akceptuje zrzuty (telefon w prawdziwej wielkości, laptop 1:1): stany `/j/`, komunikaty `/r/` z ikonami, `/` z nowym zdaniem — 72c98de

### Phase 3: Strażnik karty, PR i wdrożenie

#### Automated

- [x] 3.1 Próbny alarm trafia dokładnie: w CI czerwony tylko nowy krok smoke, po revercie zielono — c38461e
- [x] 3.2 CI na PR zielone: `ci`, `smoke`, `db`, `e2e` — c38461e
- [x] 3.3 Smoke na produkcji zielony po scaleniu (za zgodą Karola) — 43e45bb

#### Manual

- [ ] 3.4 Karol: link z `?v=2` na Discordzie pokazuje kartę P1 (Most Likely To, Dołącz do gry, zdanie 1), bez danych pokoju
- [ ] 3.5 Karol na telefonie i laptopie: `/j/` z Discorda ma zdanie o grze nad kartą, komunikaty z ikonami, ciemny pasek Chrome na Androidzie
