# Ikona gry na ekranie głównym telefonu — plan implementacji

## Overview

Gra dostaje własną ikonę (wariant 2 „Wynik z pytajnikiem”, wybór Karola 16.11.2026) i manifest, więc da się ją dodać z menu przeglądarki do ekranu głównego telefonu: ikona z podpisem „Most Likely To”, gra otwiera się bez paska przeglądarki. Karta linku do pokoju na Discordzie dostaje małą ikonę gry z prawej (A). Strona główna `/` na telefonie mówi jedną linijką, jak dodać grę do ekranu głównego. Pliki ikony są od razu w formacie Google Play; sam sklep zostaje w Parked (S-21, FR-027).

## Current State Analysis

- `public/favicon.png` to ikonka startera (32×32, z pierwszego commita `ab7bc1b`), jedyna ikona gry. Nie ma manifestu, `apple-touch-icon` ani ikon 192/512.
- `src/layouts/Layout.astro:21` linkuje `favicon.png`, `:24` ma `theme-color` `#1a1a1a` (`--background` z `.dark`, decyzja `join-page-ui`), `:25-32` wypisuje znaczniki Open Graph tylko z propsa `preview` (dziś bez obrazka).
- Kartę linku dostaje tylko strona linku do pokoju: `src/pages/j/[token].astro:110` (`preview={LINK_PREVIEW}`), tekst w `src/components/room/game-intro.ts:16-20`. GET `/j/<kod>` nic nie zmienia, a karta nie niesie danych pokoju.
- Pliki z `public/` serwuje Workers Assets przed Workerem (`wrangler.jsonc`, `assets.directory: ./dist`), więc manifest i ikony nie przechodzą przez middleware ani serwer gry.
- Strona główna `src/pages/index.astro`: niezalogowany widzi `Landing.astro` (zdanie o grze, „Zaloguj się…”, „Masz link od hosta?…”), zalogowany host kartę „Nowa gra” i ramkę „Twoje gry” (`HostGamesLink.astro`). Obie wersje mają podgląd w `/dev/room-states` (sekcja „Strona główna”, `room-states.astro:783-800`).
- Smoke ma krok karty linku (`scripts/smoke.mjs:310`, `LINK_CARD` `:282`), który sprawdza `og:*`, `theme-color` i brak id pokoju i kodu linku w `<head>`; suma kroków to 136 (test-plan §6.5).
- Rozpoznanie zasad (16.11, `change.md`): Chrome na Androidzie od wersji 108 instaluje z menu bez service workera, gdy manifest ma `name`/`short_name`, ikony 192 i 512, `start_url`, `display` i nie ma `prefer_related_applications`; samoczynny pasek instalacji wymaga service workera z `fetch`, więc bez niego nic nie wyskakuje w grze. iPhone bierze `apple-touch-icon` 180 px. Google Play: 512×512, PNG 32-bit z kanałem alfa, sRGB, do 1024 KB, pełny kwadrat.

## Desired End State

- Na Androidzie (Chrome) i iPhonie (Safari) grę da się dodać do ekranu głównego z menu przeglądarki: ikona 2 z podpisem „Most Likely To”, gra otwiera się z ikony bez paska przeglądarki, z ciemnym tłem i paskiem stanu; na Androidzie ekran startowy jest ciemny z ikoną.
- Karta przeglądarki na laptopie pokazuje nową ikonę.
- Karta linku do pokoju na Discordzie ma z prawej małą ikonę gry; tekst karty bez zmian, nadal bez danych pokoju.
- Na telefonie strona główna ma jedną linijkę, jak dodać grę do ekranu głównego (tekst osobny dla Androida i iPhone'a, miejsce i wygląd z wyboru Karola na zrzutach); linijki nie ma, gdy grę otwarto z ikony, i nie ma jej na komputerze.
- `public/icons/icon-512.png` nadaje się wprost jako ikona Google Play.
- Weryfikacja: `npm test` (nowy test ikon i manifestu), smoke 137 kroków (nowy krok plików ikony, `og:image` w kroku karty), ręczne sprawdzenia Karola na telefonach.

### Key Discoveries:

- `Layout.astro:22-24`: komentarz każe zmieniać `theme-color` razem z `--background`; dochodzą manifest (`theme_color`, `background_color`) i smoke `LINK_CARD`, więc komentarz wymieni wszystkie miejsca.
- `game-intro.ts:13-20`: `LINK_PREVIEW` to jedno źródło karty linku; smoke przepisuje go ręcznie (`smoke.mjs:279-288`, „change the two together”).
- `room-states.astro:783-800`: podgląd strony głównej korzysta z tych samych komponentów (`Landing`, `HostGamesLink`), więc linijka jako osobny komponent trafia do obu podglądów bez kopiowania.
- `scripts/ui-literals.mjs:7-17`: kontrola literałów obejmuje `src/components/room/` i `src/pages/index.astro`; linijka używa tylko tokenów. Pliki w `public/` (SVG, manifest) nie są widokami i mogą mieć kolory wprost.
- `sharp` jest tylko opcjonalną zależnością Astro, a `@playwright/test` jest w `devDependencies`, więc generator PNG rysuje SVG przez Playwright i Chrome (jak dotychczasowe zrzuty), bez nowej zależności.

## What We're NOT Doing

- Aplikacji w Google Play: bez TWA, `assetlinks.json`, konta Play, polityki prywatności i oceny wiekowej (Parked, PRD §Non-Goals).
- Service workera, trybu offline i własnego przycisku „Zainstaluj” (`beforeinstallprompt` wymaga service workera z `fetch`).
- Dużego obrazka 1200×630 w karcie linku (Karol wybrał A, małą ikonę) ani `twitter:card`.
- Karty linku na innych stronach niż `/j/` (bez zmian względem `join-page-ui`).
- Ikon w wielu kształtach na różne launchery: jedna ikona na pełnym kwadracie, którą telefon sam przycina (kółko, zaokrąglony kwadrat).
- Zmian w bazie, serwerze gry i ekranach pokoju.

## Implementation Approach

Najpierw pliki statyczne i `<head>` (Faza 1), bo od nich zależy wszystko inne, z testem unit, który pilnuje wymagań Chrome i Google Play na plikach w repo. Potem jedyny nowy element ekranu, linijka na stronie głównej (Faza 2), z wariantami na zrzutach przed kodem. Na końcu smoke sprawdza, że produkcja serwuje manifest i ikony, oraz `og:image` w karcie (Faza 3), PR i ręczne sprawdzenia na telefonach. Źródło ikony to jeden SVG, z którego skrypt robi wszystkie PNG; PNG są w repo, więc build i CI ich nie generują.

## Critical Implementation Details

- **Obrazek karty jako pełny adres.** `og:image` musi być bezwzględnym adresem (Discord nie rozwiązuje ścieżek względnych): Layout buduje go z `Astro.url` i ścieżki z `LINK_PREVIEW`, więc na produkcji to `https://most-likely-to.charlesonthewave.workers.dev/icons/icon-512.png`, a w smoke adres serwera, na którym smoke działa. Bez `twitter:card`, bo `summary_large_image` dałby duży obrazek.
- **Linijka tylko na telefonie i nie w ikonie.** Platformę rozpoznaje serwer z nagłówka `User-Agent` (Android albo iPhone, inaczej nic); ukrycie w grze otwartej z ikony robi CSS `@media (display-mode: standalone)`, bo serwer nie wie, skąd otwarto stronę.

## Faza 1: Ikona, manifest i karta linku

### Overview

Źródło ikony w SVG, PNG we wszystkich potrzebnych rozmiarach, manifest, znaczniki w `<head>` i mała ikona w karcie linku; test unit na plikach.

### Changes Required:

#### 1. Źródło ikony

**File**: `public/icons/icon.svg`

**Intent**: Ikona 2 z galerii jako jedyne źródło: ciemne tło na pełnym kwadracie, pierścień odsłony w czterech kolorach graczy, w środku jasny pytajnik z kształtów (bez liter, więc bez zależności od czcionki).

**Contract**: `viewBox="0 0 512 512"`, nieprzezroczyste tło `#1a1a1a` na całym kwadracie; wszystko ważne w kole o promieniu 205 wokół środka (strefa bezpieczna ikony maskable, 40% boku). Kolory: tło i pytajnik jak `--background` i `--foreground` z `.dark` (`#1a1a1a`, `#d9d9d9`), wycinki jak `--chart-2`, `--chart-1`, `--chart-4`, `--chart-3` (terakota `#c47457`, szałwiowy `#90b697`, musztardowy `#d3b460`, łupkowy `#6e88aa`); komentarz w pliku wskazuje te tokeny i galerię (`change.md`). Kształt z prototypu galerii (`variants.mjs`, wariant 2: pierścień r 182/122, pytajnik w skali 0,5).

#### 2. Generator PNG

**File**: `scripts/icons.mjs`, `package.json` (skrypt `icons`)

**Intent**: Jedno polecenie (`npm run icons`) rysuje `icon.svg` do wszystkich PNG, żeby po zmianie ikony nikt nie składał ich ręcznie. Uruchamiany tylko lokalnie przy zmianie ikony; PNG są w repo.

**Contract**: Playwright (`chromium` z `@playwright/test`, `channel: "chrome"`, czyli Chrome zainstalowany w systemie) otwiera SVG w oknie dokładnie w rozmiarze docelowym i zapisuje zrzut PNG z kanałem alfa (`omitBackground`). Wyjście: `public/favicon.png` 32×32 (nadpisuje ikonkę startera), `public/apple-touch-icon.png` 180×180, `public/icons/icon-192.png`, `public/icons/icon-512.png`. Skrypt wypisuje, co zapisał; błąd uruchomienia Chrome kończy go kodem ≠ 0 z komunikatem (bez połykania). Przechodzi `npm run lint` (`scriptsConfig` w `eslint.config.js`).

#### 3. Manifest

**File**: `public/manifest.webmanifest`

**Intent**: Dane, których Chrome potrzebuje do instalacji z menu i ekranu startowego, a później opakowanie pod Google Play.

**Contract**: `id` `/`, `name` i `short_name` „Most Likely To” (N1), `description` z pytaniem gry („Kto z nas najprawdopodobniej…?”), `lang` `pl`, `start_url` `/`, `scope` `/`, `display` `standalone`, `background_color` i `theme_color` `#1a1a1a`, `categories` `["games"]`, `icons`: 192 (`any`), 512 (`any`), 512 (`maskable`, ten sam plik), wszystkie `image/png`. Bez `prefer_related_applications`.

#### 4. Znaczniki w `<head>`

**File**: `src/layouts/Layout.astro`

**Intent**: Każda strona wskazuje manifest, ikony i tytuł dla iPhone'a; strona z kartą linku dostaje `og:image`.

**Contract**: `<link rel="manifest" href="/manifest.webmanifest">`, ikona karty przeglądarki: `/icons/icon.svg` (`type="image/svg+xml"`) i `/favicon.png` (32×32), `<link rel="apple-touch-icon" href="/apple-touch-icon.png">`, `apple-mobile-web-app-title` „Most Likely To”, `mobile-web-app-capable` i `apple-mobile-web-app-capable` `yes`, `apple-mobile-web-app-status-bar-style` `black`. Prop `preview` dostaje `image` (ścieżkę); przy nim `og:image` = `new URL(preview.image, Astro.url).href` oraz `og:image:width`/`og:image:height` 512. Komentarz przy `theme-color` wymienia wszystkie miejsca koloru tła: `--background` w `.dark`, ten znacznik, `manifest.webmanifest` (`theme_color`, `background_color`), `LINK_CARD` w `scripts/smoke.mjs`.

#### 5. Obrazek karty linku

**File**: `src/components/room/game-intro.ts`

**Intent**: Karta linku na Discordzie dostaje małą ikonę gry (wybór A) z tego samego jednego źródła co tekst.

**Contract**: `LINK_PREVIEW.image = "/icons/icon-512.png"`; komentarz: obrazek jest ten sam dla każdego pokoju i stanu, bez danych pokoju, kwadrat, więc Discord pokazuje go małym z prawej. `src/pages/j/[token].astro` bez zmian (przekazuje cały `LINK_PREVIEW`).

#### 6. Test plików ikony

**File**: `tests/unit/home-screen-icon.test.ts`

**Intent**: Czerwony, gdy manifest albo ikony przestaną spełniać wymagania Chrome do instalacji, Google Play albo decyzje Karola, także po przemianowaniu albo przegenerowaniu plików.

**Contract**: czyta pliki przez `node:fs`, wymiary PNG z nagłówka IHDR (szerokość, wysokość, typ koloru), bez nowych zależności. Wyrocznia: kryteria Chrome i specyfikacja Google Play (rozpoznanie w `change.md`) i decyzje Karola, wypisane w teście, nigdy z kodu. Przypadki (`it.each` tam, gdzie właściwość powtarza się po plikach):

- manifest: `name` i `short_name` „Most Likely To”, `start_url` i `scope` `/`, `display` `standalone`, brak `prefer_related_applications` albo `false`, `theme_color` i `background_color` `#1a1a1a`;
- ikony manifestu: jest wpis 192×192 i 512×512, jest wpis `maskable` 512×512; każdy `src` istnieje w `public/` i jego PNG ma wymiary z `sizes`;
- `icon-512.png`: PNG z kanałem alfa (typ koloru 6) i do 1024 KB (Google Play);
- `apple-touch-icon.png` 180×180, `favicon.png` 32×32;
- każdy `href` z `/` w `<link>` w `Layout.astro` wskazuje istniejący plik w `public/`;
- `LINK_PREVIEW.image` wskazuje istniejący kwadratowy PNG (import przez `@/components/room/game-intro`).

Próbny alarm lokalnie, bez commita: `icon-192.png` podmieniony kopią `icon-512.png` i `display` `browser` w manifeście; przewidywanie: czerwone tylko przypadki wymiarów 192 i `display`, w tym pliku; po cofnięciu zielono. Wynik do test-planu §6.1 w Fazie 3.

### Success Criteria:

#### Automated Verification:

- `npm run icons` zapisuje 4 PNG z wymiarami z kontraktu
- `npm test` przechodzi, z nowym `tests/unit/home-screen-icon.test.ts`
- Próbny alarm lokalny trafia dokładnie w przewidziane przypadki, po cofnięciu zielono
- `npm run lint`, `npx astro check`, `npm run build` przechodzą
- `dist/` po buildzie ma `manifest.webmanifest`, `apple-touch-icon.png`, `favicon.png` i `icons/` (192, 512, SVG)

#### Manual Verification:

- Karol na zrzutach (laptop 1:1 i telefon w prawdziwej wielkości) akceptuje gotowe PNG ikony: ekran główny Androida i iPhone'a, karta przeglądarki, ikona 512 jak w Google Play

**Implementation Note**: Po zielonej automatyce zatrzymaj się na akceptację Karola przed Fazą 2.

---

## Faza 2: Linijka na stronie głównej

### Overview

Jedna linijka na telefonie, jak dodać grę do ekranu głównego; najpierw warianty na zrzutach, potem kod i podgląd.

### Changes Required:

#### 1. Warianty na zrzutach (przed kodem gry)

**File**: tymczasowa strona podglądu poza commitem (jak galeria `join-page-ui`), zrzuty w scratchpadzie

**Intent**: Karol wybiera, gdzie stoi linijka, dla kogo i jak wygląda; tekst sprawdza na swoim telefonie z prawdziwym menu przeglądarki.

**Contract**: telefon 390×844 w prawdziwej wielkości, strona „Co oceniasz” w Chrome Karola. Do wyboru: **dla kogo i gdzie** (G1: niezalogowany pod „Masz link od hosta?…” i host pod „Twoje gry”; G2: tylko host pod „Twoje gry”; G3: tylko niezalogowany), **wygląd** (L1: szary tekst jak „Masz link od hosta?”; L2: szary tekst z ikoną; L3: ramka jak „Twoje gry”), **tekst** dla Androida (Chrome, menu ⋮ i nazwa pozycji menu, którą Karol widzi u siebie) i dla iPhone'a (Safari, „Udostępnij” → „Do ekranu początkowego”). Domyślne, gdy Karol nie wskaże: G1, L1. Wybór zapisany w `change.md`.

#### 2. Rozpoznanie platformy

**File**: `src/lib/home-screen.ts`, `tests/unit/home-screen.test.ts`

**Intent**: Serwer wybiera tekst linijki dla Androida albo iPhone'a, a na komputerze nie pokazuje jej wcale.

**Contract**: `homeScreenPlatform(userAgent: string | null): "android" | "ios" | null`: `Android` w nagłówku → `"android"`, `iPhone` → `"ios"`, reszta (komputer, iPad udający Maca, brak nagłówka) → `null`. Test: `it.each` na prawdziwych nagłówkach (Chrome na Androidzie, Samsung Internet, Safari i Chrome na iPhonie, Chrome na Windows, Safari na iPadzie, `null`, pusty).

#### 3. Komponent linijki

**File**: `src/components/room/HomeScreenHint.astro`, `src/styles/global.css`, `src/pages/index.astro`

**Intent**: Linijka z wybranego wariantu, w wybranym miejscu, ukryta w grze otwartej z ikony.

**Contract**: props `platform: "android" | "ios"`; tylko tokeny (kontrola `ui-literals`). W `global.css` wariant `@custom-variant standalone (@media (display-mode: standalone));`, a linijka ma `standalone:hidden`. `index.astro` liczy `homeScreenPlatform(Astro.request.headers.get("user-agent"))` i renderuje komponent tylko przy platformie innej niż `null`, w miejscu z wyboru Karola (`Landing.astro` dostaje go przez slot albo prop, żeby podgląd `/dev/room-states` mógł podać platformę).

#### 4. Podgląd i zasady

**File**: `src/pages/dev/room-states.astro`, `AGENTS.md`

**Intent**: Nowy stan strony głównej ma podgląd (zasada `AGENTS.md` §UI), a następny agent wie, skąd biorą się ikony.

**Contract**: w sekcji „Strona główna” próbki z linijką dla Androida i iPhone'a w wybranym miejscu (nowe `id` sekcji). `AGENTS.md` §UI, jedno zdanie: ikona gry ma źródło w `public/icons/icon.svg`, po zmianie `npm run icons` i commit PNG; kolor tła `#1a1a1a` zmienia się razem w miejscach z komentarza w `Layout.astro`.

### Success Criteria:

#### Automated Verification:

- `npm test` przechodzi, z `tests/unit/home-screen.test.ts`
- `npm run lint` (z `ui-literals`), `npx astro check`, `npm run build` przechodzą

#### Manual Verification:

- Karol wybiera wariant linijki na zrzutach (G, L, teksty sprawdzone z menu na jego telefonie)
- Karol akceptuje gotową stronę główną na zrzutach telefonu (niezalogowany i host, Android i iPhone) i podgląd w `/dev/room-states`

**Implementation Note**: Po wyborze wariantu i zielonej automatyce zatrzymaj się na akceptację gotowych ekranów przed Fazą 3.

---

## Faza 3: Smoke, PR i wdrożenie

### Overview

Smoke sprawdza, że serwer naprawdę oddaje manifest i ikony, a karta linku ma obrazek gry; potem PR, wdrożenie i sprawdzenia Karola na telefonach.

### Changes Required:

#### 1. Smoke

**File**: `scripts/smoke.mjs`

**Intent**: Po wdrożeniu czerwone, gdy produkcja nie serwuje plików ikony albo karta linku traci obrazek gry.

**Contract**:

- `linkPreview`: `og:image` musi być pełnym adresem `http(s)://…` kończącym się na `/icons/icon-512.png`; inaczej słowa „no og:image” albo „another og:image” (jak dla innych znaczników). Sprawdzenie braku id pokoju i kodu linku w `<head>` bez zmian, więc obejmuje też adres obrazka.
- Nowy krok zaraz po karcie linku, w każdym trybie (bez przełącznika): `GET /manifest.webmanifest` 200 z `Content-Type` zawierającym `json`, treść to JSON, a każda ikona z `icons` oraz `/apple-touch-icon.png` odpowiada 200 z `image/png`. Wynik słowami jak `linkPreview` („the game's icons”, „no manifest”, „icon missing: <ścieżka>”). Suma kroków 137.

#### 2. Dokumenty

**File**: `context/foundation/test-plan.md`, `context/changes/home-screen-icon/change.md`

**Intent**: Test-plan zna nowy test unit i krok smoke; `change.md` niesie decyzje i wynik.

**Contract**: §6.1: wpis o `home-screen-icon.test.ts` (wyrocznia: kryteria Chrome, Google Play, decyzje Karola) z wynikiem próbnego alarmu z Fazy 1. §6.5: krok plików ikony i `og:image` w karcie linku, suma 137 (z `SMOKE_LIST=0` 109). Krok smoke nie pilnuje zakazu, więc bez próbnego alarmu w CI (§6.5 „Break-check”); zakaz danych pokoju w karcie pilnuje już istniejące sprawdzenie `<head>`.

#### 3. PR i wdrożenie

**Intent**: Zmiana idzie na produkcję jak `join-page-ui`: bez migracji, kod po zielonym CI.

**Contract**: push gałęzi `home-screen-icon` (zgoda Karola) → `gh pr create` → zielone `ci`, `smoke`, `db`, `e2e` → scala Karol → Workers Builds → smoke na produkcji (zgoda Karola) → epilog (Progress z SHA, `change.md`) osobnym PR.

### Success Criteria:

#### Automated Verification:

- Bramka lokalna: `npm run lint`, `npx astro check`, `npm test`, `npm run build`
- CI na PR zielone: `ci`, `smoke` (137 kroków), `db`, `e2e`
- Smoke na produkcji po scaleniu zielony, 137/137

#### Manual Verification:

- Android (Chrome): menu → dodanie do ekranu głównego daje ikonę 2 z podpisem „Most Likely To”; gra otwiera się z ikony bez paska przeglądarki, z ciemnym ekranem startowym; linijki na stronie głównej nie ma w grze z ikony, a w Chrome jest
- iPhone (Safari): „Udostępnij” → „Do ekranu początkowego” daje ikonę 2; gra otwiera się z ikony bez paska Safari
- Logowanie hosta z ikony na obu telefonach (Google albo Discord) kończy się na stronie głównej zalogowanego; jeśli na iPhonie nie przejdzie, zapis w `change.md` jako znana granica (host loguje się w Safari) i decyzja Karola o poprawce w `follow-ups/`
- Link do pokoju z `?v=3` wklejony na Discordzie: karta z małą ikoną gry z prawej, tekst bez zmian, bez danych pokoju
- Laptop: karta przeglądarki ma nową ikonę

**Implementation Note**: Ręczne sprawdzenia mogą czekać na wygodny moment Karola; po nich `change.md` → `implemented` → `/10x-archive home-screen-icon`.

---

## Testing Strategy

### Unit Tests:

- `tests/unit/home-screen-icon.test.ts`: manifest i pliki ikon względem kryteriów Chrome, Google Play i decyzji Karola (Faza 1, z próbnym alarmem).
- `tests/unit/home-screen.test.ts`: rozpoznanie platformy z nagłówka (Faza 2).

### Integration Tests:

- Smoke: `og:image` w karcie linku i krok plików ikony, lokalnie w CI (job `smoke`) i na produkcji.

### Manual Testing Steps:

1. Android: Chrome → strona główna → linijka widoczna → menu → dodanie do ekranu głównego → ikona i podpis → otwarcie z ikony (bez paska, ciemny start, bez linijki) → logowanie hosta.
2. iPhone: Safari → linijka → „Udostępnij” → „Do ekranu początkowego” → otwarcie z ikony → logowanie hosta.
3. Discord: link z `?v=3` → mała ikona w karcie.
4. Laptop: nowa ikona w karcie przeglądarki.

## Performance Considerations

PNG są małe (512 px to kilkadziesiąt KB) i serwowane jako pliki statyczne; `<head>` dostaje kilka znaczników. Bez service workera nic nie działa w tle.

## Migration Notes

Bez migracji. Telefony, które już zapisały starą ikonkę w zakładkach, odświeżą ją same; Discord trzyma podgląd linku w pamięci podręcznej, stąd `?v=3` przy sprawdzeniu.

## References

- Zmiana i decyzje: `context/changes/home-screen-icon/change.md` (rozpoznanie, galeria 10 wariantów, wybór Karola)
- Roadmapa: S-21, PRD FR-027
- Karta linku i jej smoke: `context/changes/join-page-ui/plan.md`, `scripts/smoke.mjs:279-325`
- Kryteria instalacji Chrome: developer.chrome.com/blog/update-install-criteria, web.dev/articles/install-criteria
- Ikona Google Play: developer.android.com/google-play/resources/icon-design-specifications

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: Ikona, manifest i karta linku

#### Automated

- [x] 1.1 `npm run icons` zapisuje 4 PNG z wymiarami z kontraktu
- [x] 1.2 `npm test` przechodzi, z nowym `tests/unit/home-screen-icon.test.ts`
- [x] 1.3 Próbny alarm lokalny trafia dokładnie w przewidziane przypadki, po cofnięciu zielono
- [x] 1.4 `npm run lint`, `npx astro check`, `npm run build` przechodzą
- [x] 1.5 `dist/` po buildzie ma `manifest.webmanifest`, `apple-touch-icon.png`, `favicon.png` i `icons/` (192, 512, SVG)

#### Manual

- [x] 1.6 Karol na zrzutach akceptuje gotowe PNG ikony (ekran główny Androida i iPhone'a, karta przeglądarki, ikona 512 jak w Google Play)

### Phase 2: Linijka na stronie głównej

#### Automated

- [ ] 2.1 `npm test` przechodzi, z `tests/unit/home-screen.test.ts`
- [ ] 2.2 `npm run lint` (z `ui-literals`), `npx astro check`, `npm run build` przechodzą

#### Manual

- [ ] 2.3 Karol wybiera wariant linijki na zrzutach (G, L, teksty sprawdzone z menu na jego telefonie)
- [ ] 2.4 Karol akceptuje gotową stronę główną na zrzutach telefonu i podgląd w `/dev/room-states`

### Phase 3: Smoke, PR i wdrożenie

#### Automated

- [ ] 3.1 Bramka lokalna: `npm run lint`, `npx astro check`, `npm test`, `npm run build`
- [ ] 3.2 CI na PR zielone: `ci`, `smoke` (137 kroków), `db`, `e2e`
- [ ] 3.3 Smoke na produkcji po scaleniu zielony, 137/137

#### Manual

- [ ] 3.4 Android: ikona 2 z podpisem, otwarcie bez paska, ciemny start, linijka tylko w Chrome
- [ ] 3.5 iPhone: ikona 2, otwarcie bez paska Safari
- [ ] 3.6 Logowanie hosta z ikony na obu telefonach (albo zapis znanej granicy na iPhonie)
- [ ] 3.7 Discord: link z `?v=3` ma małą ikonę gry w karcie, bez danych pokoju
- [ ] 3.8 Laptop: nowa ikona w karcie przeglądarki
