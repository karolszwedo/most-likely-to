# Nowy wygląd gry (S-25) — plan implementacji

## Overview

Cała gra (logowanie i lista gier hosta, strona linku `/j/`, pokój we wszystkich stanach) dostaje jeden ciemny wygląd wybrany przez Karola na trzech galeriach zrzutów 2026-11-19: tło G2 Grafit, kolor Blurple na głównych akcjach, płasko z cieniem (D1), guziki-pigułki, gracze na listach jako osobne kafelki, czcionka Manrope. Zmienia się tylko wygląd (PRD FR-029, roadmapa S-25): żaden ekran nie zyskuje ani nie traci funkcji, gra zostaje zawsze ciemna, kolory graczy bez zmian.

## Current State Analysis

- Widoki są na tokenach: skan literałów `scripts/ui-literals.mjs` daje 0 trafień w `src/components/room`, `src/components/auth` i stronach (research, Summary). Restyl to więc wartości w `src/styles/global.css` (`.dark`, `:root --radius`, `@theme inline`), klasy w `src/components/ui/*` i jedno źródło klas dla list, a nie przepisywanie widoków.
- Zarzuty z `research.md` (`## Charges`): C1 jedna rola `--primary` na wypełnienie, tekst i fokus oblewa kontrast przy Blurple; C2 brak tokenów czcionki, cienia i promienia; C3 osiem list jako ramka z liniami bez wspólnego źródła; C4 tło `#1a1a1a` powielone w 7 miejscach poza tokenem; C5 (deferred) martwa jasna paleta i `bg-cosmic`.
- Testy nie sprawdzają klas (`toHaveClass`, `toHaveCSS`, `toHaveScreenshot`: 0 w `tests/`). Sprawdzają role: wiersze list jako `listitem`, wynik jako `table`/`row`/`cell` z wierszem nagłówka, natywne radio w głosowaniu, `data-*` (szczegóły w Key Discoveries).
- Kontrastu tokenów nic nie pilnuje (`scripts/ui-literals.mjs:24` zakazuje tylko literałów). Planer Karola ma `scripts/contrast.mjs` w `npm run lint` i `scripts/check-fonts.mjs` po `astro build` (wzór do przeniesienia, bez zależności).
- Czcionki dziś brak: żadnego `--font-*`, `@font-face` ani `fonts` w `astro.config.mjs`; ekrany idą domyślnym stosem systemowym Tailwinda.

## Desired End State

Każdy ekran gry na telefonie (390 px) i laptopie (1536 px) wygląda jak runda 3 galerii („git” Karola), z poprawką kontrastu A, i przechodzi strażnika kontrastu w `npm run lint`. Manrope ładuje się z plików gry (`/_astro/fonts/`), a budowanie bez nich jest czerwone. Listy graczy, pytań, próśb, propozycji, kategorii i opcji głosu są kafelkami z jednego modułu klas; wynik zostaje tabelą w jednej karcie bez linii. Pasek przeglądarki, ekran startowy z ikony i karta linku na Discordzie mają nowe tło `#18191d`. `/dev/ui-kitchen-sink` pokazuje macierz 7 stanów kontrolek, a `AGENTS.md` mówi kolejnemu agentowi, skąd brać czcionkę, kafelki i jak nie zepsuć kontrastu. Weryfikacja: bramka (`npm run lint`, `npx astro check`, `npm test`, `npm run build`), CI (`ci`, `smoke`, `db`, `e2e`), galerie zrzutów zaakceptowane przez Karola, smoke na produkcji.

### Key Discoveries:

- Tło sprzężone w 7 miejscach: `src/layouts/Layout.astro:39-43` (komentarz i `theme-color`), `public/manifest.webmanifest:11-12`, `public/icons/icon.svg:12` (+ `npm run icons`, `scripts/icons.mjs`), `scripts/smoke.mjs:313` (`LINK_CARD["theme-color"]`, sprawdzany w :340-357), `tests/unit/home-screen-icon.test.ts:8-12, 63-64`, `AGENTS.md:61`, `global.css` `.dark --primary-foreground` (:70, dziś ten sam kolor co tło). `public/dev/gifs/probka-*.svg` też mają `#1a1a1a`, ale to twarze próbnych gifów: nie ruszać.
- Nowe tło G2 `oklch(0.215 0.008 265)` = `#18191d` (przeliczone OKLCH → sRGB tą samą drogą co w research).
- `text-primary` jako kolor tekstu: 0 w prawdziwych widokach; tylko warianty `link` w `src/components/ui/button.tsx:19` i `badge.tsx:17` (żaden widok ich nie używa) oraz linki w `src/pages/dev/link-window.astro:106` i `room-window.astro:1220`. Fokus `ring-ring/50`: `button.tsx:8`, `input.tsx:11`, `textarea.tsx:9`, `input-group.tsx:25`, `checkbox.tsx:11`, `badge.tsx:7`, `RoundVoting.tsx:89` (`CHOICE_ROW`), `PlayerColorPicker.tsx:166, 183`, `AppHeader.astro:27`; `global.css:197` `outline-ring/50`.
- Tekst na Blurple pod spodem: paski wyniku `bg-primary/35` i `/20` za nickiem (`RoundReveal.tsx:188-196`), licznik nieprzeczytanych `bg-primary text-primary-foreground` (`RoomChat.tsx:586`).
- Osiem list `divide-y rounded-md border`: `RoomLobby.tsx:212`, `RoundVoting.tsx:260` i `:380` (`ROW` :87, `CHOICE_ROW` :89, `RADIO` :90), `QuestionList.tsx:390`, `QuestionProposals.tsx:262` (`listRef`, `data-proposal`), `JoinRequests.tsx:192` (dwa razy, `data-request`), `NewGameForm.tsx:147` (focus na `'[data-slot="checkbox"]'` :101); tabela wyniku `RoundReveal.tsx:160-184` (ramka :162 z `MOTION_TABLE`, `tbody divide-y` :178). `COHOST_ROW` z `CohostButton.tsx:22`; `RoomLobby.tsx:221-223` powtarza wartość `ROW` w linii.
- Powierzchnie `bg-card … border`: `card.tsx:8` (Card: `RoomCard.astro:15`, `SignInCard.astro:20`), `alert.tsx:6, 10-11` (`ServerError`, potwierdzenia, `LiveBanner`, notki w `RoomScreen` i `RoundVoting`), `OpenRoomNotice.astro:16`, `HostGamesLink.astro:9`, `HostGames.tsx:86`, `GameSummary.tsx:40, 80, 107`, panele `xl:` w `EmoteBar.tsx:29-30` i `RoomChat.tsx:100`.
- Kruche przy pigułkach i promieniu 1rem (md 14 px, lg 16 px, xl 20 px): ikonka 32 px `HomeScreenHint.astro:25` (`rounded-lg` → kółko), przełącznik Koło/Paski `RoundReveal.tsx:136` (ramka `rounded-md` wokół pigułek), guziki w kilku linijkach `HostActions.tsx:195`, `QuestionProposals.tsx:76` (`FOLD_LINE`), `RemovePlayerButton.tsx:138`.
- Testy e2e zależne od układu (tylko w CI): `game.spec.ts:104-112` (odsłona > 400 px, „Następne pytanie” cały w oknie), `chat.spec.ts:331, 553` (pole czatu w niskim oknie), `emotes.spec.ts:76`, `question-list.spec.ts:129-133` (bez przewijania w bok). Ruch odsłony liczony w regionie „Wynik” (`tests/e2e/support/round.ts:79-85`, `round.spec.ts:97-110`).
- `scripts/ui-literals.mjs` czyta `src/components/room` i `src/components/auth` przez nierekurencyjne `readdirSync` + `readFileSync`: nowy plik wprost w `src/components/room/` jest skanowany, podkatalog wywróciłby lint (EISDIR). Wzorzec stałych klas w jednym module: `src/components/room/reveal-motion.ts`.
- `tests/unit/home-screen-icon.test.ts:100-108` sprawdza każdy dosłowny `<link href="/…">` w `Layout.astro`; komponent `<Font />` nie ma dosłownego `href`, więc test go nie dotyczy.
- Fonty w Astro 7.4.12 (u nas) działają jak w planerze: `fonts` w `astro.config.mjs` z `fontProviders.fontsource()`, `<Font cssVariable=… preload />` z `astro:assets` w `<head>`, pliki w `/_astro/fonts/`; przy nieudanym pobraniu Astro tylko ostrzega (stąd `check-fonts.mjs`). Wzór: `C:\Users\karol\planer\astro.config.mjs`, `planer/scripts/check-fonts.mjs`, `planer/src/styles/global.css` (~:120, publikacja `--font-sans`, `shadow-card`). Workers Builds buduje `npm run build` (`context/deployment/deploy-plan.md:7, 254`), więc kontrola po budowaniu działa też przed publikacją.
- CSP to tylko `img-src` i `connect-src` (`src/lib/security-headers.ts:37`), bez `font-src`/`default-src`: czcionka z tego samego źródła ładuje się bez zmiany CSP.

## What We're NOT Doing

- Głębia D2–D4 (poświata, świecący guzik, połysk): decyzja Karola 2026-11-19 „D1 teraz, reszta po grze”; osobna mała zmiana po grze w nowym wyglądzie.
- C5: sprzątanie jasnej palety `:root` i `bg-cosmic` (nic nie zmienia na ekranie); tylko zdanie w komentarzu przy `:root`, że gra jest zawsze ciemna i kolory ról siedzą w `.dark`.
- Kolory graczy `--chart-1..20`: bez zmian (zasada Karola). Trzy z nich (8, 16, 19) mają na nowej karcie 3,37–3,43:1, czyli spełniają próg WCAG 3:1, ale nie własne 3,5:1 z komentarza `global.css:81-84`; zmienia się komentarz, nie kolory.
- Ikona gry: zmienia się tylko jej tło (`#18191d`); znak zapytania i plasterki zostają, jak wybrał Karol (komentarz w `icon.svg` dostaje zdanie, że to dawne kolory, celowo).
- Wysokości kontrolek: guziki i pola zostają tej samej wysokości co dziś (galerie zmieniały tylko kształt, tło i obwódkę), żeby nie ruszać układu.
- Linie oddzielające sekcje (`AppHeader.astro:22`, `HostActions.tsx:170`, `ProposalForm.tsx:139`, paski emotek i czatu, `SignInCard` „albo e-mailem…”): zostają, bo runda 3 („git”) była z nimi.
- Biały napis na guziku `destructive` (2,66–3,11:1): problem sprzed restylu (research C1, deferred); guzik zmienia tylko kształt.
- Zmiany układu ekranów, nowe stany, nowe funkcje, jasny motyw, przełącznik motywu, paleta do wyboru.
- Testy zrzutów (`toHaveScreenshot`) i nowe zależności npm: bramką są galerie zrzutów i strażnik kontrastu.
- Skanowanie `src/components/ui` przez `ui-literals.mjs` (shadcn ma tam `ring-[3px]`, `rounded-[4px]`, `text-white`; osobny temat).

## Implementation Approach

Kolejność `/10x-ui`: środowisko → wartości tokenów → widok → stany. Najpierw czcionka i dwaj strażnicy (czcionka po budowaniu, kontrast w `lint`), sprawdzeni próbnym alarmem, póki wartości są stare. Potem nowe wartości i role w jednym miejscu (`global.css`) plus kształty w `src/components/ui`, co zmienia wszystkie ekrany naraz, i tło w siedmiu sprzężonych miejscach. Potem jedno źródło klas kafelków zamiast ośmiu ramek z liniami, z zachowaniem ról, na których stoją testy. Na koniec macierz 7 stanów, pełna galeria, reguła w `AGENTS.md` i wdrożenie lżejszym cyklem. Każda faza wizualna kończy się zrzutami (telefon 390×844 ×2, laptop 1536×750 ×1, Playwright z `channel: "chrome"` na serwerze dev, skrypt w scratchpadzie jak w rundach galerii) i wyborem Karola.

## Critical Implementation Details

- **Kolejność względem PR #83.** Gałąź `game-restyle` stoi na `59abdd2`, a otwarty PR #83 (archiwa) zmienia te same wiersze roadmapy (S-22–S-24 `done`). Przed pierwszym pushem: `git fetch` i, jeśli #83 jest scalony, `git rebase origin/main` z ręcznym połączeniem roadmapy (statusy z #83 + wiersz i treść S-25).
- **Kontrast z przezroczystością.** Komponenty rysują fokus jako `ring-ring/50`, a paski wyniku jako `bg-primary/35` za nickiem: strażnik musi liczyć warstwę z alfą zmieszaną na tle (jak `alpha.mjs` w scratchpadzie research), inaczej przepuści fokus, którego nie widać. `--accent` zapisać jako stałe `oklch(...)` (nie `color-mix`), bo strażnik czyta tylko `oklch`.
- **Role, nie klasy.** Wiersz listy zostaje `<li>` w `<ul>`, wynik zostaje `<table>` z wierszem nagłówka, radio zostaje natywnym, widocznym `<input type="radio">` (Playwright `.check()` na ukrytym elemencie nie zadziała), `data-slot="checkbox"`, `data-request`, `data-proposal`, `data-answer`, `listRef` i `MOTION_TABLE` na ramce tabeli zostają na swoich elementach.
- **Układ w e2e.** Manrope ma inną szerokość niż czcionka systemowa, a kafelki z odstępem `gap-2` są wyższe od wierszy z linią: e2e z listy w Key Discoveries widać dopiero w CI (lokalnie Playwright odmawia), więc po pushu Faz 2–3 patrzeć na nie pierwsze.

## Faza 1: Czcionka i strażnicy

### Overview

Manrope w grze tak jak w planerze, kontrola czcionki po budowaniu i strażnik kontrastu tokenów w `npm run lint`, przypięty na dzisiejszych wartościach i sprawdzony próbnym alarmem. Na ekranie zmienia się tylko czcionka. W pierwszym commicie fazy jadą też niescommitowane PRD (FR-029), roadmapa (S-25), `research.md`, `change.md`, ten plan i brief.

### Changes Required:

#### 1. Czcionka Manrope

**File**: `astro.config.mjs`, `src/layouts/Layout.astro`, `src/styles/global.css`

**Intent**: Gra ładuje Manrope z własnych plików, które Astro pobiera z Fontsource przy budowaniu (decyzja Karola: „jak w planerze”), więc przeglądarka gracza nie łączy się z obcym serwerem czcionek, a w `package.json` nie przybywa zależność.

**Contract**: `fonts` w konfiguracji: `fontProviders.fontsource()`, `name: "Manrope"`, `cssVariable: "--font-manrope"`, `weights: ["400 800"]`, `styles: ["normal"]`, `subsets: ["latin", "latin-ext"]` (bez `latin-ext` polskie litery idą czcionką zapasową), `fallbacks: ["system-ui", "sans-serif"]`, z komentarzem dlaczego. `<Font cssVariable="--font-manrope" preload />` w `<head>` layoutu. `--font-sans: var(--font-manrope)` opublikowane w `@theme inline` (wzór planera), więc `body` i wszystko bez własnej rodziny dostaje Manrope. Emotki i emoji dalej z czcionek systemu.

#### 2. Kontrola czcionki po budowaniu

**File**: `scripts/check-fonts.mjs` (nowy), `package.json`

**Intent**: Astro przy nieudanym pobraniu tylko ostrzega i buduje z czcionką zapasową; kontrola zamienia to w czerwone budowanie w CI i w Workers Builds, zanim produkcja dostanie grę bez Manrope.

**Contract**: `"build": "astro build && node scripts/check-fonts.mjs"`; skrypt bez zależności, kod wyjścia 1, gdy w katalogu z czcionkami wyniku budowania jest mniej niż 2 pliki `.woff2` (latin + latin-ext). Katalog wyjścia sprawdzić na naszym adapterze po pierwszym budowaniu (w planerze `dist/client/_astro/fonts`; u nas `wrangler.jsonc` wskazuje `./dist` jako zasoby). Ścieżka i opis w `docs/development.md`.

#### 3. Strażnik kontrastu

**File**: `scripts/contrast.mjs` (nowy), `package.json`, `context/foundation/test-plan.md` (§6, wpis próbnego alarmu)

**Intent**: Żadna przyszła zmiana tokenu nie może po cichu zepsuć czytelności; strażnik liczy WCAG 2 dla par „kolor na tle” z bloku `.dark` (gra jest zawsze ciemna).

**Contract**: wzór `C:\Users\karol\planer\scripts\contrast.mjs` (bez zależności: OKLCH → OKLab → liniowe sRGB, przycięcie, wzór WCAG), czyta tylko blok `.dark` w `src/styles/global.css`; lista `PAIRS` `[przód, tło, próg, alfa?]` z progami 4,5 (tekst) i 3 (obwódka pola, fokus, kropka gracza); warstwa z alfą mieszana na tle w sRGB. `"lint": "eslint . && node scripts/contrast.mjs && node scripts/ui-literals.mjs"`. Faza 1 przypina tylko pary, które dzisiejsza paleta spełnia: `foreground`/`card-foreground`/`popover-foreground` na swoich tłach, `foreground` na `muted` i `accent`, `muted-foreground` na `background` i `card`, `primary-foreground` na `primary`, `secondary-foreground` na `secondary`, `accent-foreground` na `accent`, `destructive` na `background` i `card`, `ring` przy 50% na `background` i `card`, `chart-1..20` na `card` i `background` (3:1). Para, która dziś nie przechodzi, nie dostaje wyjątku: wchodzi w Fazie 2 razem z nowymi wartościami (lista w komunikacie commita Fazy 1).

### Success Criteria:

#### Automated Verification:

- Bramka zielona: `npm run lint` (ze strażnikiem kontrastu), `npx astro check`, `npm test`, `npm run build` (z `check-fonts.mjs`, który znajduje co najmniej 2 pliki `.woff2`)
- Próbny alarm lokalnie: przyciemniony `--muted-foreground` w `.dark` → `npm run lint` czerwony dokładnie na parach `muted-foreground`; wpięcie `fonts` wyłączone → `npm run build` czerwony na `check-fonts`; po cofnięciu oba zielone; wynik wpisany w `test-plan.md` §6

#### Manual Verification:

- Karol na zrzutach (telefon i laptop: `/j/`, poczekalnia, głosowanie, odsłona) widzi Manrope z polskimi literami (ą ć ę ł ń ó ś ź ż) i emotki jak dotąd

**Implementation Note**: Po fazie i zielonej bramce zatrzymaj się na ocenę Karola na zrzutach przed Fazą 2.

---

## Faza 2: Nowe kolory i kształty

### Overview

Wartości G2 Grafit + Blurple z poprawką kontrastu A w `.dark`, nowe role (`--primary-text`, osobny `--ring`, `--shadow-card`), promień 1rem, kształty planera w komponentach wspólnych i nowe tło w siedmiu sprzężonych miejscach. Zmienia wszystkie ekrany naraz.

### Changes Required:

#### 1. Wartości i role tokenów

**File**: `src/styles/global.css`, `context/changes/game-restyle/theme.md` (nowy)

**Intent**: Jedno źródło wartości wyboru Karola (C1, C2): runda 2–3 galerii (`shots2.mjs`: `BASES.g2`, `ACCENTS[5]`, `SHAPES`) z poprawką A, z której wynika osobny kolor wypełnienia guzika, tekstu w kolorze Blurple i fokusu.

**Contract**: w `.dark` (barwa bazy 265, Blurple 277):

| Token                                                            | Wartość                                                               | Uwaga                                     |
| ---------------------------------------------------------------- | --------------------------------------------------------------------- | ----------------------------------------- |
| `--background`                                                   | `oklch(0.215 0.008 265)`                                              | `#18191d`                                 |
| `--card`, `--popover`                                            | `oklch(0.265 0.008 265)`                                              |                                           |
| `--foreground` i wszystkie `*-foreground` poza `primary`/`muted` | `oklch(0.96 0.004 265)`                                               |                                           |
| `--muted`                                                        | `oklch(0.31 0.012 265)`                                               |                                           |
| `--muted-foreground`                                             | `oklch(0.74 0.012 265)`                                               |                                           |
| `--secondary`                                                    | `oklch(0.32 0.012 265)`                                               |                                           |
| `--border`                                                       | `oklch(0.325 0.012 265)`                                              |                                           |
| `--input`                                                        | `oklch(0.59 0.016 265)`                                               | poprawka A (0,56 → 0,59)                  |
| `--primary`                                                      | `oklch(0.58 0.2 277)`                                                 | poprawka A (0,6 → 0,58)                   |
| `--primary-foreground`                                           | `oklch(1 0 0)`                                                        | biały napis                               |
| `--primary-text` (nowy)                                          | `oklch(0.76 0.12 277)`                                                | Blurple jako tekst i link                 |
| `--ring`                                                         | `oklch(0.84 0.08 277)`                                                | poprawka A                                |
| `--accent`                                                       | ok. `oklch(0.332 0.046 275.4)`                                        | 20% Blurple w karcie (OKLab), zapis stały |
| `--destructive`                                                  | `oklch(0.72 0.16 25)`                                                 | z galerii                                 |
| `--shadow-card` (nowy)                                           | `0 1px 2px oklch(0 0 0 / 0.35), 0 10px 28px -8px oklch(0 0 0 / 0.55)` | D1                                        |

`:root --radius: 1rem`. W `@theme inline`: `--color-primary-text`, cień `shadow-card` (wzór planera). `--sidebar-*` i `--chart-1..20` bez zmian; komentarz przy `--chart-*` mówi o progu 3:1 sprawdzanym przez `scripts/contrast.mjs` zamiast 3,5:1. Linia źródła nad `.dark` wskazuje `context/changes/game-restyle/theme.md`, a ten plik ma surowe wartości, skąd pochodzą (galerie 2026-11-19, poprawka A z research C1) i tabelę par z `contrast.mjs`.

#### 2. Brakujące pary strażnika

**File**: `scripts/contrast.mjs`

**Intent**: Strażnik pilnuje też ról, które wnosi Blurple.

**Contract**: dochodzą pary: `primary-foreground` na `primary` przy hover `/90` na `background`; `primary-text` na `background`, `card`, `muted`, `accent` (4,5); `ring` przy 50% także na `muted` i `accent` (3); `input` na `background`, `card`, `muted`, `secondary` (3); `foreground` na `primary` przy 35% i 20% na `card` (paski wyniku, 4,5); oraz pary pominięte w Fazie 1. Wszystkie przechodzą na wartościach z tabeli bez wyjątków.

#### 3. Kształty komponentów wspólnych

**File**: `src/components/ui/button.tsx`, `badge.tsx`, `input.tsx`, `textarea.tsx`, `input-group.tsx`, `checkbox.tsx`, `card.tsx`, `alert.tsx`

**Intent**: Kształty planera w jednym miejscu, żeby każdy ekran dostał je bez ruszania widoków.

**Contract**: przyciski `rounded-full` (baza i rozmiary `sm`/`lg`, te same wysokości); warianty `link` w `button` i `badge` używają `text-primary-text`; pola (`input`, `textarea`, `input-group`) z tłem `bg-muted` zamiast `dark:bg-input/30` i obwódką `border-input` 1,5 px (klasa w `src/components/ui`; ta sama wysokość); `card` i `alert` bez obwódki, z `shadow-card` (Card zostaje `rounded-xl`); fokus dalej `ring-ring/50` (teraz jasny Blurple). Lokalne odstępstwa od shadcn opisane komentarzem jak w `field.tsx:50-54`.

#### 4. Powierzchnie i kruche miejsca w widokach

**File**: `src/components/room/HomeScreenHint.astro`, `RoundReveal.tsx`, `HostActions.tsx`, `QuestionProposals.tsx`, `RemovePlayerButton.tsx`, `OpenRoomNotice.astro`, `HostGamesLink.astro`, `HostGames.tsx`, `GameSummary.tsx`, `EmoteBar.tsx`, `RoomChat.tsx`, `src/pages/dev/link-window.astro`, `src/pages/dev/room-window.astro`

**Intent**: Karty `bg-card … border` w widokach wyglądają jak karty z komponentu (cień zamiast obwódki), a miejsca, które pigułki i promień 1rem by rozjechały, zostają czytelne.

**Contract**: stała `SURFACE` (`bg-card` + promień + `shadow-card`, bez obwódki) w nowym module `src/components/room/surfaces.ts` (wprost w `room/`, nie w podkatalogu), użyta w kartach z listy powierzchni (Key Discoveries); panele `xl:` emotek i czatu dostają cień zamiast `xl:border`. Ikonka 32 px zostaje kwadratem z rogami 12 px (`rounded-sm` przy nowym promieniu). Ramka przełącznika Koło/Paski `rounded-full`. Guziki w kilku linijkach dostają mniejszy promień niż pigułka, gdy tekst się łamie (do oceny na zrzutach). Linki `text-primary` na stronach dev → `text-primary-text`.

#### 5. Nowe tło w siedmiu miejscach (C4)

**File**: `src/layouts/Layout.astro`, `public/manifest.webmanifest`, `public/icons/icon.svg` + PNG z `npm run icons`, `scripts/smoke.mjs`, `tests/unit/home-screen-icon.test.ts`, `AGENTS.md`

**Intent**: Pasek przeglądarki, ekran startowy z ikony i karta linku na Discordzie mają ten sam grafit co gra, bez szwu.

**Contract**: `#1a1a1a` → `#18191d` w `theme-color`, `theme_color` i `background_color`, tle `icon.svg`, `LINK_CARD["theme-color"]`, oczekiwaniach testu (z wyrocznią w komentarzu :8-12) i regule `AGENTS.md:61`; komentarz `Layout.astro:39-42` cytuje nową wartość tokenu i wymienia wszystkie siedem miejsc (także test unit i `AGENTS.md`). Cztery PNG przerysowane `npm run icons` i w commicie (żaden test nie sprawdza ich pikseli). Znak zapytania i plasterki ikony bez zmian.

### Success Criteria:

#### Automated Verification:

- Bramka zielona: `npm run lint` (strażnik kontrastu z nowymi parami, 0 literałów), `npx astro check`, `npm test` (także `home-screen-icon` z `#18191d`), `npm run build`
- `grep -rn "1a1a1a"` poza `public/dev/gifs/` i `context/` nic nie znajduje
- CI na PR zielone (`ci`, `smoke`, `db`, `e2e`), także e2e zależne od układu

#### Manual Verification:

- Karol na zrzutach (telefon i laptop: `/j/`, logowanie, `/`, poczekalnia hosta i gościa, głosowanie, odsłona z kołem i paskami, czat, koniec wieczoru) mówi „tak”: wygląd jak runda 3, guzik Blurple z białym napisem czytelny, fokus z klawiatury widoczny
- Ikona na zrzucie (`icon-512.png`) z nowym tłem, bez innych zmian

**Implementation Note**: Po fazie i zielonej bramce zatrzymaj się na „tak” Karola na zrzutach przed Fazą 3.

---

## Faza 3: Kafelki zamiast linii

### Overview

Jedno źródło klas listy-kafelków (C3) zamiast ośmiu ramek z liniami; wynik zostaje tabelą w jednej karcie bez linii. Widok główny (poczekalnia, głosowanie, odsłona) na zrzutach.

### Changes Required:

#### 1. Moduł klas kafelków

**File**: `src/components/room/surfaces.ts`

**Intent**: Jedno miejsce na wygląd listy-kafelków, żeby kolejna lista nie wróciła do ramki z liniami (wzór `reveal-motion.ts`).

**Contract**: obok `SURFACE` stałe: lista (`ul`: kolumna z odstępem `gap-2`, bez obwódki i linii), kafelek (`li`: `bg-card`, promień mniejszy niż karta, `shadow-card`), kafelek wyboru (kafelek + `has-[:checked]:bg-accent` + fokus `has-[:focus-visible]:ring-3 ring-ring/50`, czyli dzisiejszy `CHOICE_ROW` bez linii) i ramka tabeli wyniku (karta z `shadow-card`, `overflow-hidden`). Stałe `ROW`, `CHOICE_ROW`, `RADIO` z `RoundVoting.tsx:87-90` i `COHOST_ROW` zostają jako układ wiersza (odstępy, wysokość), a kolor tła i kształt biorą z modułu.

#### 2. Osiem list i tabela

**File**: `src/components/room/RoomLobby.tsx`, `RoundVoting.tsx`, `QuestionList.tsx`, `QuestionProposals.tsx`, `JoinRequests.tsx`, `NewGameForm.tsx`, `RoundReveal.tsx`

**Intent**: Gracze w poczekalni i w rundzie, opcje głosu, pytania, propozycje, prośby o wejście i powrót, kategorie wyglądają tak samo: osobne kafelki z cieniem.

**Contract**: każdy z ośmiu kontenerów `divide-y rounded-md border` (Key Discoveries) bierze listę i kafelek z modułu; `RoomLobby.tsx:221-223` używa wspólnej wartości wiersza zamiast kopii `ROW`. Elementy zostają `<ul>`/`<li>`, regiony i nagłówki („Gracze (n)”, „Pytania (n)”, „Propozycje pytań”, „Proszą o wejście”, „Chcą wrócić na swoje miejsce”) i atrybuty `data-*`, `listRef`, `name="category"`/`name="adult"` bez zmian. Tabela wyniku: ramka z modułu zamiast `overflow-hidden rounded-md border`, `tbody` bez `divide-y`, nagłówek tabeli i `MOTION_TABLE` na ramce zostają; paski `bg-primary/35`/`/20` za nickiem jak dziś.

### Success Criteria:

#### Automated Verification:

- Bramka zielona: `npm run lint`, `npx astro check`, `npm test` (`round-voting-ssr`: jeden formularz, wyłączone „Zagłosuj”, radio dla każdego gracza + „Wstrzymuję się”), `npm run build`
- `grep -rn "divide-y" src/components src/pages --include=*.tsx --include=*.astro` nie znajduje list ani tabel w widokach gry (poza stronami dev)
- CI na PR zielone, w tym e2e list i wyniku (`support/round.ts` tabela i wiersze, `support/room.ts` wiersze graczy i próśb, `question-list.spec.ts`, `proposals.spec.ts`, ruch odsłony `round.spec.ts:97-110`)

#### Manual Verification:

- Karol na zrzutach (telefon i laptop: poczekalnia hosta z 20 graczami i z listą pytań, głosowanie z zaznaczoną opcją i fokusem z klawiatury, odsłona z tabelą, prośby o wejście, propozycje, nowa gra z kategoriami) mówi „tak”

**Implementation Note**: Po fazie i zielonej bramce zatrzymaj się na „tak” Karola na zrzutach przed Fazą 4.

---

## Faza 4: Stany, bramka i wdrożenie

### Overview

Macierz 7 stanów kontrolek w jednym miejscu, pełna galeria wszystkich ekranów, reguła dla kolejnego agenta i wdrożenie lżejszym cyklem.

### Changes Required:

#### 1. Macierz 7 stanów

**File**: `src/pages/dev/ui-kitchen-sink.astro`

**Intent**: Stany, które rozjeżdżają się pierwsze (disabled, error, focus-visible), widać naraz na jednej stronie (`AGENTS.md:63` już wskazuje tę stronę na stany).

**Contract**: nowa sekcja „Kontrolki gry” obok 7 stanów logowania: guzik (warianty `default`, `secondary`, `outline`, `ghost`, `destructive`, `link`), pole (`InputGroup`), checkbox, kafelek i kafelek wyboru z radiem z `surfaces.ts`, każdy w stanach: default; hover i focus-visible (do najechania i Tab; skrypt zrzutów najeżdża i fokusuje); disabled; error (`aria-invalid` + komunikat pod polem w `destructive`); empty (lista bez elementów: zdanie jak w grze, np. pusty stan próśb, albo „nie dotyczy” z powodem); loading (`Spinner` w guziku `aria-disabled`, jak „Wysyłanie…”). Strona zostaje w `ui-literals.mjs` (już jest).

#### 2. Reguła dla kolejnego agenta

**File**: `AGENTS.md` („## UI”), `docs/development.md`

**Intent**: Kolejny ekran dziedziczy wygląd zamiast wracać do ramek z liniami i szarych kolorów.

**Contract**: w „## UI”: czcionka Manrope z `fonts` w `astro.config.mjs` (budowanie bez niej jest czerwone, `scripts/check-fonts.mjs`); Blurple jako tekst tylko przez `text-primary-text`, nigdy `text-primary`; listy graczy, pytań i próśb to kafelki z `src/components/room/surfaces.ts`, nigdy `divide-y` w ramce; karty przez `Card` albo `SURFACE`; `npm run lint` liczy kontrast (`scripts/contrast.mjs`), więc nowy token koloru albo nowe połączenie „tekst na powierzchni” dostaje wiersz w `PAIRS`; tło `#18191d` z listą miejsc (już w Fazie 2). W `docs/development.md` dwa nowe skrypty.

#### 3. Galeria i wdrożenie

**File**: `context/changes/game-restyle/change.md`, `context/foundation/roadmap.md` (przez skille)

**Intent**: Karol ocenia całość przed scaleniem, a produkcja dostaje nowy wygląd lżejszym cyklem.

**Contract**: galeria „Co oceniasz” w Chrome Karola: wszystkie stany `/dev/link-window` (11), główne stany `/dev/room-window` (poczekalnia, głosowanie, odsłona, pominięcie, propozycje, czat i gify, współhost, spóźnieni, koniec), sekcje „Strona główna” i „Twoje gry” z `/dev/room-states`, `/dev/ui-kitchen-sink`; telefon i laptop. Potem push gałęzi (zgoda), PR gotowy, zielone CI, scalenie przez Karola, Workers Builds, smoke na produkcji (zgoda).

### Success Criteria:

#### Automated Verification:

- Bramka zielona: `npm run lint`, `npx astro check`, `npm test`, `npm run build`
- CI na PR zielone: `ci`, `smoke` (z `theme-color` `#18191d`), `db`, `e2e`
- Smoke na produkcji zielony po scaleniu (`BASE_URL=https://most-likely-to.charlesonthewave.workers.dev npm run smoke`, za zgodą)

#### Manual Verification:

- Karol na galerii mówi „tak” dla całej gry, w tym macierzy 7 stanów (każda komórka pokazana albo „nie dotyczy” z powodem)
- Karol na swoim telefonie i laptopie po wdrożeniu: gra w nowym wyglądzie, pasek przeglądarki grafitowy, ikona z ekranu głównego bez szwu (przy najbliższej grze)

**Implementation Note**: Lżejszy cykl: bez `/10x-plan-review`. Po wdrożeniu, jako większa zmiana, `/10x-impl-review game-restyle`, a `/10x-archive` po grze.

---

## Testing Strategy

### Unit Tests:

- `tests/unit/home-screen-icon.test.ts`: kolory manifestu `#18191d` (zmiana oczekiwań, nie nowy test).
- Strażnicy są skryptami w bramce (`lint`, `build`), a nie testami Vitest; sprawdza ich próbny alarm w Fazie 1 (wpis w `test-plan.md` §6). Przed zmianą testu przeczytać `context/foundation/test-plan.md` §6.

### Integration Tests:

- Bez nowych testów e2e: istniejące sprawdzają role, wiersze tabeli, radio i ruch odsłony, czyli to, czego restyl nie może zepsuć. Smoke sprawdza `theme-color` karty linku.

### Manual Testing Steps:

1. Fazy 1–3: zrzuty po każdej fazie (telefon 390×844 ×2, laptop 1536×750), ocena Karola.
2. Faza 4: pełna galeria z macierzą 7 stanów, „tak” Karola.
3. Po wdrożeniu (przy najbliższej grze): telefon i laptop, pasek przeglądarki, ikona z ekranu głównego, karta linku na Discordzie z `?v=4` (cache ok. 30 min).

## Performance Considerations

Dwa pliki `.woff2` (latin i latin-ext, razem ok. 50 KB) z `preload`, z `/_astro/` z nagłówkiem `Cache-Control: public, max-age=31536000, immutable` (adapter Cloudflare, research C2). Bez zmian w kodzie gry i w liczbie zapytań.

## Migration Notes

Bez migracji i bez zmian w bazie, serwerze gry i zasadzie anonimowości. Wycofanie: revert PR-a; tło w siedmiu miejscach wraca razem z nim.

## References

- Research: `context/changes/game-restyle/research.md` (`## Charges` C1–C5)
- Decyzje Karola z galerii: `context/changes/game-restyle/change.md`; generatory zrzutów (poza repo): `shots2.mjs`, `shots3.mjs` w scratchpadzie sesji `a5713290-…\scratchpad\gallery\`
- PRD FR-029, roadmapa S-25
- Wzór planera: `C:\Users\karol\planer\astro.config.mjs`, `planer\scripts\contrast.mjs`, `planer\scripts\check-fonts.mjs`, `planer\context\archive\2026-11-17-look-and-feel-basics\theme.md`
- Poprzedni kontrakt wyglądu: `context/archive/2026-10-04-ui-signin-contract/theme.md`
- `/10x-ui`: `.claude/skills/10x-ui/SKILL.md`, lista kontrolna `references/ui-quality-checklist.md`

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: Czcionka i strażnicy

#### Automated

- [x] 1.1 Bramka zielona: lint ze strażnikiem kontrastu, astro check, test, build z check-fonts — 1ce07f4
- [x] 1.2 Próbny alarm lokalnie: strażnik kontrastu i check-fonts czerwone dokładnie, po cofnięciu zielone, wpis w test-plan §6 — 1ce07f4

#### Manual

- [x] 1.3 Karol na zrzutach widzi Manrope z polskimi literami i emotki jak dotąd — 1ce07f4

### Phase 2: Nowe kolory i kształty

#### Automated

- [x] 2.1 Bramka zielona: lint z nowymi parami kontrastu, astro check, test z #18191d, build — 5ea9d59
- [x] 2.2 Brak #1a1a1a poza public/dev/gifs i context — 5ea9d59
- [x] 2.3 CI na PR zielone, także e2e zależne od układu — 5ea9d59

#### Manual

- [x] 2.4 Karol mówi „tak” na zrzutach: wygląd jak runda 3, guzik Blurple czytelny, fokus widoczny — 5ea9d59
- [x] 2.5 Ikona z nowym tłem, bez innych zmian — 5ea9d59

### Phase 3: Kafelki zamiast linii

#### Automated

- [x] 3.1 Bramka zielona: lint, astro check, test z round-voting-ssr, build — 9fa5af4
- [x] 3.2 Brak divide-y w listach i tabelach widoków gry — 9fa5af4
- [x] 3.3 CI na PR zielone, w tym e2e list, wyniku i ruchu odsłony — 9fa5af4

#### Manual

- [x] 3.4 Karol mówi „tak” na zrzutach list, głosowania i odsłony — 9fa5af4

### Phase 4: Stany, bramka i wdrożenie

#### Automated

- [x] 4.1 Bramka zielona: lint, astro check, test, build — 58e1360
- [x] 4.2 CI na PR zielone: ci, smoke z #18191d, db, e2e — 58e1360
- [x] 4.3 Smoke na produkcji zielony po scaleniu — 7632129 (20.11: Workers Builds i CI na main zielone, smoke prod „All smoke steps passed”)

#### Manual

- [x] 4.4 Karol mówi „tak” na pełnej galerii z macierzą 7 stanów — 58e1360
- [ ] 4.5 Karol na telefonie i laptopie po wdrożeniu: nowy wygląd, grafitowy pasek, ikona bez szwu
