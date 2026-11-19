---
date: 2026-11-19T10:49:47+01:00
researcher: Claude (Opus 5.5)
git_commit: 59abdd25abbbb610f94c307154cdfbe0b58e88e4
branch: game-restyle
repository: most-likely-to
topic: "Audyt /10x-ui pod restyl gry: G2 Grafit + Blurple + D1, kształty planera, Manrope"
tags: [research, ui, tokens, contrast, shadcn, global-css, game-restyle]
status: complete
last_updated: 2026-11-19
last_updated_by: Claude (Opus 5.5)
---

# Research: audyt /10x-ui pod restyl gry

**Date**: 2026-11-19T10:49:47+01:00
**Researcher**: Claude (Opus 5.5)
**Git Commit**: 59abdd25abbbb610f94c307154cdfbe0b58e88e4
**Branch**: game-restyle
**Repository**: most-likely-to

## Research Question

Dwukierunkowy audyt (źródło → widoki, widok → źródło) przed restylem całej gry na wybór Karola z `change.md`: tło G2 Grafit `oklch(0.215 0.008 265)`, karty `oklch(0.265 0.008 265)`, kolor główny Blurple `oklch(0.6 0.2 277)` z białym napisem, głębia D1 (płasko z cieniem kart), kształty planera (pigułki, kafelki zamiast linii, tabela wyniku bez linii, pola z tłem `muted` i obwódką 1,5 px), Manrope, `--radius: 1rem`; gra zawsze ciemna, kolory graczy bez zmian. Wynik: `## Charges` (3–5 zarzutów) i odpowiedzi na pytania 1–9 z briefu.

## Summary

- **Wariant kontraktu: istniejący system projektowy.** Wartości są w `src/styles/global.css` (`:root`, `.dark`, `@theme inline`), komponenty w `src/components/ui`, reguły w `AGENTS.md:54-64`. Skan literałów na widokach: 0 trafień w `src/components/room`, `src/components/auth`, `src/pages` (bez `dev/`); 10 w `src/components/ui` (domyślne shadcn) i 2 w `src/layouts/Layout.astro` (komentarz i `theme-color` `#1a1a1a`, `Layout.astro:39-43`). Restyl to więc głównie wartości tokenów, nowe role i kształty komponentów wspólnych, a nie przepisywanie widoków.
- **Blurple z białym napisem nie przechodzi kontrastu w trzech rolach** (pomiar podagenta, skrypt w katalogu roboczym sesji): biały na `oklch(0.6 0.2 277)` 4,19:1 (próg 4,5), Blurple jako tekst na karcie 3,65:1, a obwódka fokusu przy `ring-ring/50` (tak używają jej komponenty) 1,88:1 na karcie (próg 3). Żadna jedna jasność Blurple nie spełnia obu progów: biały napis wymaga L ≤ 0,583, tekst w kolorze Blurple na tle i karcie L ≥ 0,656. Rozwiązanie zachowujące wybór Karola: osobne role dla wypełnienia guzika, tekstu/linków i fokusu (zarzut C1).
- **Osiem list zbudowanych ręcznie jako ramka z liniami** (`divide-y rounded-md border`), bez wspólnego komponentu (zarzut C3). Kafelki graczy z wyboru Karola wymagają jednego wspólnego miejsca na klasy.
- **Kolor tła jest sprzężony z co najmniej 7 miejscami poza tokenem**, z czego komentarz przy `theme-color` wymienia część (zarzut C4).
- **Czcionka, cień i promień nie mają dziś tokenów ani ścieżki ładowania** (zarzut C2). Polityka CSP nie blokuje czcionek (`src/lib/security-headers.ts:37`, bez `default-src` i `font-src`), więc czcionka z tego samego źródła ładuje się bez zmiany CSP i bez zmiany przypiętego testu `tests/unit/security-headers.test.ts:30-54`.
- **Bramka wizualna:** w repo nie ma `toHaveScreenshot`/`toMatchSnapshot` (`playwright.config.ts:29` tylko `screenshot: "only-on-failure"`); są podglądy `/dev/room-states` (ok. 190 stanów), `/dev/room-window`, `/dev/link-window`, `/dev/ui-kitchen-sink` (7 stanów logowania). Bramką będzie galeria zrzutów z tych podglądów, jak w trzech rundach wyboru.

## Charges

Każdy zarzut: kategoria, dowód `plik:linia`, wpływ na gracza. Zarzuty, których plan nie zaadresuje, zostają tu jako **deferred** z powodem.

### C1. Brakujące tokeny: jeden `--primary` gra trzy role i w każdej oblewa kontrast

- **Dowód:** `.dark --primary` i `--ring` w `src/styles/global.css` (blok `.dark`, `:61-113`); `text-primary` jako tekst w `src/components/ui/badge.tsx:17`, `src/components/ui/button.tsx:19` (warianty `link`), `src/components/ui/field.tsx:137` (link po najechaniu); obwódka fokusu `focus-visible:ring-ring/50` w `src/components/ui/button.tsx:8`, `input.tsx:10` i w `CHOICE_ROW` `src/components/room/RoundVoting.tsx:89`.
- **Pomiar (proponowane wartości G2 + Blurple 0,6):** biały na `--primary` 4,19:1 ✗ (4,5); `--primary` jako tekst na tle / karcie / `muted` / zaznaczonym kafelku 4,18 / 3,65 / 3,14 / 2,91 ✗ (4,5); `--ring` przy 50% na tle / karcie / `muted` 1,97 / 1,88 / 1,77 ✗ (3); obwódka pola `--input` (L 0,56) na `muted` 2,83 i na `secondary` 2,73 ✗ (3). Przechodzą: `foreground` (≥ 10,87 na wszystkich czterech tłach), `muted-foreground` (≥ 4,85), `destructive` jako tekst (≥ 5,76), wszystkie 20 kolorów graczy na nowej karcie (min. 3,37) i tle (min. 3,85; próg 3).
- **Wpływ na gracza:** biały napis „Zagłosuj” i linki w kolorze Blurple są słabo czytelne na telefonie w ciemnym pokoju, a gracz z klawiaturą nie widzi, gdzie jest fokus.
- **Poprawka (propozycja A, zachowuje wybór Karola: Blurple z białym napisem):** `--primary` `oklch(0.58 0.2 277)` (biały 4,56; hover `/90` 5,14); nowa rola dla tekstu i linków, np. `--primary-text` `oklch(0.76 0.12 277)` (tło 7,99, karta 6,98, `muted` 6,01, zaznaczony kafelek 5,66); `--ring` jako osobna wartość `oklch(0.84 0.08 277)` (przy 50%: 3,61 / 3,43 / 3,18); `--input` L 0,59 (na `muted` 3,20, na `secondary` 3,09). Propozycja B (jaśniejszy Blurple `oklch(0.71 0.15 277)` z ciemnym napisem) zmienia wygląd guzika na pastelowy i oblewa tekst na zaznaczonym kafelku (4,21), więc odpada jako sprzeczna z wyborem Karola.
- **Przy okazji:** komentarz w `global.css` przy `--chart-1..20` mówi „co najmniej 3,5:1 względem `--card`”; na jaśniejszej karcie `--chart-8` (3,43), `--chart-16` (3,37), `--chart-19` (3,38) spadają poniżej. Podbicie L o +0,01 daje 3,57 / 3,51 / 3,52; inaczej komentarz trzeba zmienić. Kolory graczy zostają „bez zmian” dla oka (+0,01 L), co plan musi nazwać.
- **Deferred w C1:** biały na `bg-destructive` przy hover `/90` (3,11) i 100% (2,66) w `button.tsx` (wariant `destructive`, `text-white`): problem jest dziś, a nie z restylu; zostaje jako uwaga, chyba że plan i tak dotknie wariantu `destructive` (który z `dark:bg-destructive/60` i `hover:bg-destructive/90` wygrywa w ciemnym trybie, nie sprawdzono).

### C2. Brakujące tokeny: czcionka, cień karty i promień planera nie mają miejsca w systemie

- **Dowód:** brak `@font-face`, `--font-*` i `font-family` w `src/styles/global.css` (`@layer base` `:195-207` ustawia tylko `bg-background text-foreground`); brak czcionki w `src/layouts/Layout.astro:25-57` i `astro.config.mjs:10-30`; brak `@fontsource*` w `package.json`. Cień: `src/components/ui/card.tsx:8` ma `rounded-xl border py-6 shadow-sm`, a w `global.css` nie ma tokenu cienia. Promień: `--radius: 0.75rem` w `:root` (`global.css:11`).
- **Wpływ na gracza:** bez tokenów wygląd planera da się zrobić tylko literałami (`shadow-[…]`, `font-[…]`) rozsianymi po widokach, więc kolejny ekran wróci do starego wyglądu, a gracz zobaczy dwie różne gry w jednym wieczorze.
- **Poprawka:** `--font-sans` (Manrope) w `@theme`, `--shadow-card` w `.dark` i opublikowany w `@theme inline`, `--radius: 1rem`; karty bez obwódki z cieniem w `card.tsx` i na powierzchniach `bg-card`.
- **Czcionka, dwie drogi (decyzja w planie):** (a) paczka `@fontsource-variable/manrope` (jak w planerze), import w `global.css`, pliki trafiają do `/_astro/` z nagłówkiem `Cache-Control: public, max-age=31536000, immutable` (`node_modules/@astrojs/cloudflare/dist/index.js:472-500`); nowa zależność = zgoda Karola (`AGENTS.md`, zasady sesji); (b) dwa pliki woff2 (latin, latin-ext) i licencja OFL w repo, `@font-face` w `global.css` z adresem względnym, bundlowane tak samo do `/_astro/`; bez nowej zależności, ale bez aktualizacji paczką. Pliki z `public/fonts/` nie dostałyby jawnej reguły cache (`public/` nie ma `_headers`). Żadna droga nie zmienia CSP.

### C3. Brakujący współdzielony komponent: osiem list zbudowanych ręcznie jako ramka z liniami

- **Dowód (8 kontenerów):** `src/components/room/RoomLobby.tsx:212` (gracze w poczekalni), `RoundVoting.tsx:260` (gracze w rundzie), `RoundVoting.tsx:380` (opcje głosu, wiersze `CHOICE_ROW` `:89` z radiem), `QuestionList.tsx:390` (pytania), `QuestionProposals.tsx:262` (propozycje, z `bg-card`), `JoinRequests.tsx:192` (prośby o wejście, z `bg-card`), `NewGameForm.tsx:147` (kategorie), `RoundReveal.tsx:160-178` (tabela wyniku: `overflow-hidden rounded-md border`, `tbody divide-y`). W `src/components/ui` nie ma komponentu listy (są: alert, badge, button, card, checkbox, field, input, input-group, label, separator, spinner, textarea). Już jako osobne kafelki z odstępem: `HostGames.tsx:82-86` (`/gry`) i `GameSummary.tsx:48, 87-91`.
- **Wpływ na gracza:** wybrane przez Karola kafelki zamiast linii trzeba by wpisać osobno w ośmiu miejscach, więc łatwo o listę, która zostanie ramką z liniami obok list z kafelkami, i dwa różne wyglądy tej samej rzeczy (gracze w poczekalni i w rundzie).
- **Poprawka:** jedno źródło klas listy-kafelków (wzór z `AGENTS.md:58` i `src/components/room/reveal-motion.ts`: stałe klas w jednym module) albo komponent w `src/components/ui`; użyte we wszystkich ośmiu kontenerach, z zachowaniem dzisiejszych wierszy (`ROW`, `CHOICE_ROW`, `COHOST_ROW` z `CohostButton.tsx:22`), ról i fokusu.

### C4. Przypadkowa architektura: kolor tła powielony poza tokenem, a komentarz nie wymienia wszystkich miejsc

- **Dowód:** komentarz `src/layouts/Layout.astro:39-42` i reguła `AGENTS.md:61` wiążą tło z: `Layout.astro:43` (`theme-color` `#1a1a1a`), `public/manifest.webmanifest:11-12` (`background_color`, `theme_color`), `public/icons/icon.svg:12` (`<rect fill>`, potem `npm run icons` przerysowuje PNG wg `scripts/icons.mjs:18-23`, w tym `icon-512.png`, obrazek karty Discorda `scripts/smoke.mjs:333`), `scripts/smoke.mjs:313` (`LINK_CARD["theme-color"]`). Poza komentarzem: `tests/unit/home-screen-icon.test.ts:12, 63-64` (oba pola manifestu `#1a1a1a`), `AGENTS.md:61` (nazwa `#1a1a1a`), `global.css` `.dark --primary-foreground` = `oklch(0.2178 0 0)` (`:70`, ten sam kolor co tło). Discord przyjmuje `theme-color` tylko jako `#RRGGBB` (`context/changes/join-page-ui/research.md:52`).
- **Wpływ na gracza:** po zmianie samego tokenu pasek przeglądarki na telefonie, ekran startowy gry z ikony i karta linku na Discordzie zostałyby w starym `#1a1a1a`, czyli widoczny szew między grafitową grą a jej ramą, a testy smoke i unit poczerwienieją.
- **Poprawka:** jeden przelicznik nowego tła na `#RRGGBB` i zmiana we wszystkich siedmiu miejscach naraz, z dopisaniem brakujących trzech do komentarza w `Layout.astro`.

### C5. Przypadkowa architektura (deferred): martwa jasna paleta i `bg-cosmic`

- **Dowód:** jedyne `<html` jest w `src/layouts/Layout.astro:24` (`class="dark"`), każda strona `.astro` używa tego layoutu, middleware zwraca tylko przekierowania (`src/middleware.ts:30, 35`), a wariant `dark` to `&:is(.dark *)` (`global.css:4`), więc kolory w `:root` (`global.css:10-59`) nie trafiają na ekran w sprawdzonych ścieżkach (nie sprawdzono domyślnej strony błędu adaptera i stron Cloudflare). `--radius` siedzi jednak w `:root` i działa. `bg-cosmic` (`global.css:191`, literały hex) używa tylko `src/pages/dev/live-sync.astro:23`. Archiwum mówi to samo: `context/archive/2026-10-04-ui-signin-contract/theme.md:83` („`:root` nie jest używany”).
- **Wpływ na gracza:** żaden bezpośrednio; ryzyko, że kolejny agent zmieni kolor w `:root` i nic nie zobaczy albo uzna tę paletę za obowiązującą.
- **Deferred:** sprzątanie jasnej palety i `bg-cosmic` nie zmienia niczego, co widzi gracz; restyl zmienia tylko `.dark` i nowe tokeny, a w `:root` co najwyżej `--radius`. Wystarczy zdanie w komentarzu przy `:root`. Osobna drobna zmiana, jeśli kiedyś przyjdzie jasny motyw (Karol go odrzucił 2026-11-19).

## Detailed Findings

### Kształty dziś (pytania 1, 4)

- Przyciski: `src/components/ui/button.tsx:8` baza `rounded-md`, `:23-24` rozmiary `sm`/`lg` powtarzają `rounded-md`, `:25` `icon` = `size-9`. Pigułki są już w widokach: `CohostButton.tsx:109`, `RemovePlayerButton.tsx:116, 139` (`rounded-full`), `RoomChat.tsx:575` (`h-11 rounded-full shadow-lg`), surowe `<button>` `PlayerColorPicker.tsx:166, 208` (`rounded-full`). Nadpisania rozmiaru/kształtu: `GifPicker.tsx:57, 123, 189`, `EmoteBar.tsx:99`, `RoomChat.tsx:476, 518`, `HostActions.tsx:195`, `QuestionProposals.tsx:76`, `PlayerLink.tsx:79`.
- Plakietki: `badge.tsx:7` już `rounded-full`.
- Pola: `input.tsx:10`, `textarea.tsx:9`, `input-group.tsx:15` `rounded-md border … shadow-xs`; `checkbox.tsx:11` `rounded-[4px]` (literał arbitralny w `src/components/ui`, poza skanerem).
- Przełącznik Koło/Paski zrobiony ręcznie: `RoundReveal.tsx:136` (`rounded-md border p-0.5` z `Button size="sm"`); brak komponentu toggle-group/tabs.
- Linie oddzielające sekcje: `AppHeader.astro:22` (`border-b`), `HostActions.tsx:170` i `ProposalForm.tsx:139` (`border-t pt-6`), `EmoteBar.tsx:25, 27, 28, 35`, `RoomChat.tsx:97, 110`, `GifPicker.tsx:56, 64`, `SignInCard.astro:31, 33` (`Separator` przy „lub”). Galerie Karola pokazały je bez zmian; plan decyduje, które zostają (D1 to „płasko z cieniem”, linie nad paskiem prowadzącego i nad formularzem pełnią rolę granicy sekcji).
- `Card`: `auth/SignInCard.astro:20-40`, `room/RoomCard.astro:15-25`. `bg-card`: `GameSummary.tsx:40, 80, 107`, `HostGames.tsx:86`, `HostGamesLink.astro:9`, `OpenRoomNotice.astro:16`, `JoinRequests.tsx:192`, `QuestionProposals.tsx:262`, `EmoteBar.tsx:29` i `RoomChat.tsx:100` (panele `xl:` z `xl:border`), `ui/alert.tsx:10-11`.

### Czcionka, CSP, zasoby statyczne (pytanie 3)

- Dziś ciało strony dostaje domyślny stos systemowy Tailwinda (wniosek z braku `--font-*`; nie sprawdzono w przeglądarce).
- CSP: cała polityka to `img-src` + `connect-src` (`src/lib/security-headers.ts:37`), komentarz `:10-11` „No default-src, script-src or style-src”; test przypina cały napis (`tests/unit/security-headers.test.ts:30-54`), smoke sprawdza tylko `img-src` i `connect-src` (`scripts/smoke.mjs:445-448`).
- Zasoby: `wrangler.jsonc:7-11` (`ASSETS`, `./dist`, `not_found_handling: 404-page`, bez `run_worker_first`), więc pliki statyczne idą bez nagłówków middleware; `public/.assetsignore` ma tylko `/dev/`.
- Manrope w planerze to `@fontsource-variable/manrope` (zestawy `latin`, `latin-ext`, wagi 200–800), według `C:\Users\karol\planer\context\archive\2026-11-17-look-and-feel-basics\theme.md`.

### Kontrast (pytanie 4)

- Repo nie ma skryptu kontrastu (`scripts/ui-literals.mjs:24` tylko zakazuje `oklch(` w widokach). Archiwum: kontrast obecnej palety liczono jednorazowym skryptem spoza repo (`context/archive/2026-10-04-ui-signin-contract/theme.md`), z lekcją, że trzeba liczyć też przezroczystości ukryte w klasach (`/90`, `/60`, `/50`).
- Pomiar tej sesji: OKLCH → OKLab → liniowe sRGB (macierze CSS Color 4), przycięcie kanałów, mieszanie alfy w sRGB, wzór WCAG 2. Zaznaczony kafelek (`--accent` = 20% Blurple w karcie, OKLab) = `oklch(0.332 0.046 275.4)`. Liczby w C1. Przy L > ok. 0,63 chroma 0,2 wychodzi poza sRGB i przeglądarka ją przycina; różnica w ratio ≤ 0,17 przy L 0,70.
- Skrypt kontrastu do repo (np. `scripts/contrast.mjs`, jak w planerze) jest kandydatem na „kontrolę” z kroku „Utrwal to”: dziś nic nie pilnuje kontrastu tokenów.

### Bramka wizualna i podglądy (pytanie 6)

- Brak testów zrzutów; `scripts/ui-literals.mjs:8-20` skanuje `signin.astro`, cztery strony dev, całe `src/components/auth` i `src/components/room`, `index.astro`, `gry.astro`, `r/[id].astro`, `j/[token].astro`; nie skanuje `src/components/ui`, `global.css` ani `Layout.astro`.
- `/dev/ui-kitchen-sink` pokazuje 7 stanów karty logowania; macierz 7 stanów dla przycisku, pola i kafelka wyboru (pytanie 8) nie ma dziś jednego miejsca: hover/focus-visible/disabled są w stanach `/dev/room-states` rozproszone, a „loading” to `Spinner` (`src/components/ui/spinner.tsx`) w przyciskach w drodze.

### Zakres (pytanie 7)

- Twarda zasada `/10x-ui`: „jeden widok plus globalne tokeny”. Tutaj wartości globalne (C1, C2, C4) zmieniają każdy ekran naraz, bo widoki są na tokenach (skan: 0 literałów). Widokiem głównego przepływu, na którym mierzymy, jest pokój w głosowaniu i odsłonie (`RoundVoting.tsx`, `RoundReveal.tsx`, `RoomLobby.tsx`), które gracz widzi najdłużej.
- Rekomendacja: w tej zmianie tokeny i role (C1, C2), komponenty wspólne (`button`, `input`/`textarea`/`input-group`, `card`), czcionka, sprzężenie tła (C4) i jedno źródło listy-kafelków (C3) użyte w ośmiu kontenerach, bo to jedna klasa w ośmiu miejscach, a zostawienie części list jako ramek z liniami dałoby dwa wyglądy tej samej rzeczy. Osobno (deferred): C5, głębia D2–D4 (otwarta decyzja Karola), ewentualne zmiany układu ekranów (layout nie był przedmiotem galerii).

## Code References

- `src/styles/global.css:4` — wariant `dark` jako `&:is(.dark *)`
- `src/styles/global.css:10-59` — `:root` (jasna paleta, nieużywana; `--radius` `:11`)
- `src/styles/global.css:61-113` — `.dark` (paleta gry; `--background` `:63`, `--primary-foreground` `:70`, `--chart-1..20`)
- `src/styles/global.css:191` — `bg-cosmic` (hex, tylko `dev/live-sync.astro:23`)
- `src/layouts/Layout.astro:24` — jedyne `<html class="dark">`; `:39-43` komentarz i `theme-color`
- `src/components/ui/button.tsx:8, 23-25` — kształty przycisków, `ring-ring/50`
- `src/components/ui/card.tsx:8` — karta z obwódką i `shadow-sm`
- `src/components/room/RoundVoting.tsx:87-90, 260, 380` — wiersze i dwie listy w rundzie
- `src/components/room/RoundReveal.tsx:136, 160-178` — przełącznik i tabela wyniku
- `src/lib/security-headers.ts:37` — CSP bez `font-src`
- `public/manifest.webmanifest:11-12`, `public/icons/icon.svg:12`, `scripts/smoke.mjs:313, 333`, `tests/unit/home-screen-icon.test.ts:12, 63-64` — kolor tła poza tokenem

## Architecture Insights

- Kontrakt działa: widoki są na rolach (`bg-primary`, `text-muted-foreground`), więc zmiana wyglądu to w większości zmiana wartości w `.dark` i klas w `src/components/ui`. Skaner `ui-literals.mjs` pilnuje widoków, ale nie `src/components/ui` (stąd `rounded-[4px]` w `checkbox.tsx:11` i `text-white` w `button.tsx`).
- Jedna rola na trzy zadania (`--primary` = wypełnienie, tekst, fokus) działała przy szarościach (kontrast był z zapasem), a przy nasyconym kolorze się rozjeżdża: to typowy powód osobnych ról w systemach z mocnym kolorem marki.

## Historical Context (from prior changes)

- `context/archive/2026-10-04-ui-signin-contract/theme.md:5, 22` — paleta „Graphite” z tweakcn, wybór Karola nr 25; `:7, 27` promień 0,75rem; `:6` „Bez czcionek, cieni”; `:83` „`:root` nie jest używany… gdyby doszedł jasny motyw, `--ring` w `:root` trzeba przyciemnić”. Ten restyl świadomie zmienia dwie z tych decyzji (czcionka i cień wchodzą, wybór Karola 2026-11-19).
- `context/archive/2026-10-04-ui-signin-contract/plan-brief.md:24` — gra ciemna przez klasę `dark` na `<html>`; dalej obowiązuje.
- `context/archive/2026-10-04-ui-signin-contract/reviews/impl-review.md:25` — bez nowych zależności poza `radix-ui`; czcionka z paczki byłaby pierwszą zależnością wyglądu od tamtej pory.
- `context/changes/home-screen-icon/plan.md:32, 64` i `plan-brief.md:28` — ikona „bez nowej zależności”, `icon.svg:8` bez liter, więc czcionka jej nie dotyczy; tło ikony tak (C4).
- Planer Karola: `C:\Users\karol\planer\context\archive\2026-11-17-look-and-feel-basics\theme.md` — źródło kształtów (pigułki, brak linii, pola 44 px z obwódką 1,5 px, `--shadow-card`, Manrope).

## Related Research

- `context/changes/join-page-ui/research.md` — `theme-color` w karcie Discorda (`#RRGGBB`).
- `context/archive/2026-10-15-room-wide-layout/` — szeroki układ pokoju; `research.md:223` mówi, że większa skala czcionki to „decyzja o tokenach typografii”.

## Open Questions

- **Czcionka:** paczka `@fontsource-variable/manrope` (nowa zależność, zgoda Karola) czy dwa pliki woff2 + OFL w repo. Rekomendacja w planie.
- **Głębia D2–D4:** otwarta decyzja Karola; plan zostawia D1 i miejsce na późniejszy wybór na zrzutach.
- **Linie sekcji** (`AppHeader.astro:22`, `HostActions.tsx:170`, `ProposalForm.tsx:139`): zostają jako granice sekcji czy znikają jak w planerze; wygląd do pokazania Karolowi.
- **Nie sprawdzono:** wyliczona rodzina czcionki w przeglądarce, domyślna strona błędu adaptera, który z wariantów `dark:bg-destructive/60` i `hover:bg-destructive/90` wygrywa przy hover, kontrast APCA i odróżnialność kolorów graczy przy zaburzeniach widzenia barw po podbiciu L.
