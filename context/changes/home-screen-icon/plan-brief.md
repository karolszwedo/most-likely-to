# Ikona gry na ekranie głównym telefonu — Plan Brief

> Full plan: `context/changes/home-screen-icon/plan.md`

## What & Why

Gra dostaje własną ikonę i manifest, żeby ekipa mogła ją dodać do ekranu głównego telefonu i otwierać jak aplikację, bez szukania linku. Przy okazji karta linku do pokoju na Discordzie dostaje obrazek gry, a strona główna mówi na telefonie, jak dodać ikonę. Pliki są od razu w formacie Google Play, choć sam sklep zostaje zamknięty (S-21, FR-027).

## Starting Point

Dziś gra ma tylko ikonkę startera 32 px i ciemny `theme-color`; nie ma manifestu ani większych ikon, a karta linku `/j/` (z `join-page-ui`) ma sam tekst. Pliki z `public/` serwuje Cloudflare przed serwerem gry.

## Desired End State

Na Androidzie i iPhonie gra dodana z menu przeglądarki ma ikonę „Wynik z pytajnikiem” z podpisem „Most Likely To” i otwiera się bez paska przeglądarki. Karta linku na Discordzie ma małą ikonę z prawej. Na telefonie strona główna ma jedną linijkę, jak dodać grę; w grze otwartej z ikony linijki nie ma.

## Key Decisions Made

| Decision            | Choice                                                          | Why (1 sentence)                                                                                 | Source          |
| ------------------- | --------------------------------------------------------------- | ------------------------------------------------------------------------------------------------ | --------------- |
| Wygląd ikony        | 2 „Wynik z pytajnikiem”                                         | Pierścień odsłony w kolorach graczy z pytajnikiem łączy pytanie i wynik; Karol: „też mi siedzi”. | Galeria (Karol) |
| Podpis pod ikoną    | N1 „Most Likely To”                                             | Pełna nazwa mieści się na typowych telefonach.                                                   | Galeria (Karol) |
| Wpis w roadmapie    | S-21, PRD FR-027                                                | Każdy punkt kolejki trafia do roadmapy.                                                          | Karol           |
| Obrazek karty linku | A, mała ikona z prawej                                          | Ten sam plik co ikona, karta zostaje niska w czacie.                                             | Plan (Karol)    |
| Podpowiedź o ikonie | Tak, jedna linijka na stronie głównej                           | Bez service workera Chrome sam nie podsunie instalacji.                                          | Plan (Karol)    |
| Service worker      | Brak                                                            | PRD: bez trybu offline; brak samoczynnego paska instalacji w trakcie gry to zaleta.              | Rozpoznanie     |
| Ikona maskable      | Ten sam plik 512 z `purpose` `maskable`                         | Wszystko ważne mieści się w strefie bezpiecznej (koło 40% boku).                                 | Plan            |
| Generator PNG       | `npm run icons` przez Playwright i Chrome                       | Bez nowej zależności; `sharp` jest tylko opcjonalny w Astro.                                     | Plan            |
| Platforma linijki   | Serwer z `User-Agent`, ukrycie przez `display-mode: standalone` | Tekst inny dla Androida i iPhone'a; serwer nie wie, czy otwarto z ikony.                         | Plan            |

## Scope

**In scope:**

- SVG ikony i PNG 32, 180, 192, 512; manifest; znaczniki w `Layout.astro` (z iPhone'em)
- `og:image` w karcie linku `/j/`
- Linijka o ikonie na stronie głównej (wariant na zrzutach), podgląd w `/dev/room-states`
- Test unit plików, krok smoke plików ikony, `og:image` w kroku karty
- PR, wdrożenie, sprawdzenia na telefonach

**Out of scope:**

- Aplikacja w Google Play (TWA, `assetlinks.json`, konto, polityka prywatności, ocena wiekowa)
- Service worker, tryb offline, własny przycisk „Zainstaluj”
- Duży obrazek 1200×630, karta linku na innych stronach
- Baza, serwer gry, ekrany pokoju

## Architecture / Approach

Jedno źródło ikony (`public/icons/icon.svg`), z którego `npm run icons` robi PNG trzymane w repo. Manifest i ikony leżą w `public/` i serwuje je Workers Assets. `Layout.astro` wskazuje je na każdej stronie, a przy karcie linku (`LINK_PREVIEW.image`) dokłada `og:image` z pełnym adresem. Linijka na stronie głównej to komponent z tekstem wybranym po platformie z `User-Agent`, schowany CSS-em w trybie `standalone`.

## Phases at a Glance

| Phase                            | What it delivers                                                                   | Key risk                                                                   |
| -------------------------------- | ---------------------------------------------------------------------------------- | -------------------------------------------------------------------------- |
| 1. Ikona, manifest i karta linku | Pliki ikony, manifest, `<head>`, `og:image`, test unit z alarmem                   | PNG z Chrome bez kanału alfa albo z innym rozmiarem (test to łapie)        |
| 2. Linijka na stronie głównej    | Wybrany wariant linijki, rozpoznanie platformy, podgląd                            | Nazwa pozycji menu inna niż w tekście (Karol sprawdza na swoim telefonie)  |
| 3. Smoke, PR i wdrożenie         | Krok smoke plików ikony, `og:image` w karcie, produkcja, sprawdzenia na telefonach | Logowanie z ikony na iPhonie (osobne dane aplikacji z ekranu początkowego) |

**Prerequisites:** S-01 i `join-page-ui` na produkcji (karta linku); Chrome w systemie do `npm run icons`.
**Estimated effort:** ~2 sesje w 3 fazach (najwięcej czasu: zrzuty i wybór linijki).

## Open Risks & Assumptions

- Logowanie Google albo Discord z ikony na iPhonie może nie wrócić do aplikacji z ekranu początkowego; wtedy znana granica (host loguje się w Safari) i decyzja Karola o poprawce.
- Discord trzyma podgląd linku w pamięci podręcznej; do sprawdzenia link z `?v=3`.
- Zakładamy, że Workers Assets oddaje `.webmanifest` jako JSON; smoke to sprawdza na produkcji.

## Success Criteria (Summary)

- Karol ma grę na ekranie głównym swojego telefonu z ikoną 2 i otwiera ją jak aplikację.
- Link do pokoju na Discordzie pokazuje małą ikonę gry.
- Ekipa na telefonie widzi na stronie głównej, jak dodać grę do ekranu głównego.
