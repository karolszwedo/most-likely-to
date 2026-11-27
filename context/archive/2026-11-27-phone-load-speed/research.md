---
date: 2026-11-27T17:26:28+01:00
researcher: Claude (Opus 5.5)
git_commit: 086837b34cff4f3d6a33326cf9e6a79c420a8454
branch: phone-load-speed
repository: most-likely-to
topic: "Jak szybko gra otwiera się na telefonie i czy jest co przyspieszyć (punkt G)"
tags: [research, performance, phone, astro-islands, supabase-js, bundle]
status: partial
last_updated: 2026-11-27
last_updated_by: Claude (Opus 5.5)
last_updated_note: "Decyzja Karola 2026-11-27: G zamknięte samym pomiarem, bez kodu (Open Questions, 1)"
---

# Research: Jak szybko gra otwiera się na telefonie (punkt G)

**Date**: 2026-11-27T17:26:28+01:00
**Researcher**: Claude (Opus 5.5)
**Git Commit**: `086837b` (gałąź od `origin/main` `cce0ef1` plus commit `change.md`)
**Branch**: phone-load-speed
**Repository**: most-likely-to

## Research Question

Jak szybko gra otwiera się na telefonie, zwłaszcza strony, które gracz widzi pierwszy raz (link do pokoju `/j/…`, potem
pokój `/r/…`), i czy jest coś, co warto przyspieszyć (`context/changes/phone-load-speed/change.md`).

## Summary

- **Strony przed pokojem otwierają się szybko.** Pomiar 2026-11-27 na produkcji, w emulowanym telefonie (Chrome przez
  Playwright, 390×844, procesor spowolniony 4×), mediana z 3 pierwszych wejść:
  - dobre LTE: strona logowania `/` i strona linku `/j/…` pokazują treść po 0,40–0,48 s, a działają po 0,68–0,73 s;
  - słaby zasięg („Slow 4G” z DevTools): treść po 1,59–1,66 s, a działają po ok. 3,4 s;
  - drugie wejście, z plikami w pamięci przeglądarki: treść po 0,71–0,74 s na słabym zasięgu.
- **Formularz „Dołącz” działa, zanim skrypt się załaduje.** To zwykły formularz HTML wysyłany do serwera
  (`src/components/room/JoinForm.tsx:111`). Gość na słabym zasięgu może więc wpisać nick już po ok. 1,6 s (wniosek: zmierzona była strona 404 tej samej ścieżki, a
  formularz dokłada 10 KB gz skryptu modułowego, który nie wstrzymuje rysowania).
- **Pokój nie jest jeszcze zmierzony w przeglądarce.** Do tego trzeba prawdziwego pokoju na produkcji, a jego założenie
  zmienia bazę (Open Questions, 2). Znany jest rozmiar: pokój ściąga 190 KB skryptów po gzip, prawie dwa razy więcej niż
  strona logowania (98 KB). Do tego dochodzą połączenie na żywo z Supabase i jedno pobranie stanu.
- **Wymaganie PRD jest spełnione z dużym zapasem.** PRD wymaga, by gość dołączał w mniej niż 30 s bez instrukcji
  (`context/foundation/prd.md:50`). Jedyny pomiar drogi gościa: Android, link z Discorda, ok. 10 s od dotknięcia linku do
  poczekalni, razem z wpisaniem nicku (2026-10-08, `context/archive/2026-10-07-room-lobby/phone-test.md:23`).
- **Pięć możliwych przyspieszeń, żadne pilne.** Każde daje ułamki sekundy, i to głównie na słabym zasięgu (lista w
  „Możliwe przyspieszenia”). Bez nich gra nie łamie żadnego wymagania.

## Detailed Findings

### Pomiar na produkcji (2026-11-27, ok. 17:05–17:20)

- **Narzędzie:** skrypt w scratchpadzie sesji. Używa Chrome z systemu przez Playwright (`channel: "chrome"`, ten sam
  sposób co `scripts/icons.mjs:15,55`), bez nowych zależności. Throttling idzie przez CDP
  (`Network.emulateNetworkConditions`, `Emulation.setCPUThrottlingRate`), a czasy z `PerformanceObserver`
  (FCP, LCP), `performance.getEntriesByType("navigation")` (TTFB, DCL, load) i znikania atrybutu `ssr` z
  `astro-island` (koniec hydratacji).
- **Co było mierzone:** tylko odczyty stron (GET). Strona logowania `/` bez sesji i strona linku
  `/j/AAAAAAAAAAAAAAAAAAAAAA`, czyli poprawny format, ale nieistniejący pokój: odpowiedź 404, jedno wywołanie
  `room_link` w Supabase. Bazy nic nie zmieniło.
- **Trzy profile:** `lte` (opóźnienie 60 ms, 9 Mb/s w dół), `slow4g` (562,5 ms, 1,4 Mb/s, wartości „Slow 4G” z
  DevTools) i `none` (bez spowolnienia, sam laptop). W `lte` i `slow4g` procesor jest spowolniony 4×.
- **Pamięć przeglądarki:** `cold` to pusty kontekst, `warm` to drugie wejście w tym samym kontekście. Każda komórka to
  mediana z 3 przebiegów.

| strona       | profil | pamięć | TTFB   | pierwsza treść (FCP) | strona działa (hydratacja) | pobrane          |
| ------------ | ------ | ------ | ------ | -------------------- | -------------------------- | ---------------- |
| `/`          | lte    | cold   | 91 ms  | 476 ms               | 733 ms                     | 167 KB, 17 żądań |
| `/`          | lte    | warm   | 62 ms  | 156 ms               | 168 ms                     | 6 KB             |
| `/`          | slow4g | cold   | 591 ms | 1664 ms              | 3368 ms                    | 167 KB           |
| `/`          | slow4g | warm   | 564 ms | 712 ms               | 775 ms                     | 7 KB             |
| `/`          | none   | cold   | 80 ms  | 172 ms               | 241 ms                     | 167 KB           |
| `/j/…` (404) | lte    | cold   | 159 ms | 404 ms               | 678 ms                     | 167 KB, 16 żądań |
| `/j/…` (404) | lte    | warm   | 68 ms  | 176 ms               | 183 ms                     | 6 KB             |
| `/j/…` (404) | slow4g | cold   | 589 ms | 1588 ms              | 3357 ms                    | 167 KB           |
| `/j/…` (404) | slow4g | warm   | 564 ms | 736 ms               | 792 ms                     | 8 KB             |
| `/j/…` (404) | none   | cold   | 194 ms | 284 ms               | 389 ms                     | 166 KB           |

- **Czas serwera (curl, 5 żądań na `/`, bez spowolnienia):** pierwszy bajt po 65–392 ms. Odpowiedzi przyszły z
  Warszawy (`CF-RAY …-WAW`) z `Cache-Control: no-store`.
- **Supabase w `/j/…`:** na laptopie bez spowolnienia mediana TTFB to 194 ms przy 80 ms dla `/`. Wniosek, nie pomiar
  osobnego wywołania: jedno wywołanie `room_link` kosztuje na tej ścieżce ok. 100 ms.
- **Ograniczenie emulacji:** DevTools nakłada opóźnienie na całe żądanie, nie na pakiety. W `slow4g` TTFB obu stron jest
  prawie równy (589 i 591 ms), choć `/j/…` czeka na Supabase, a `/` nie. Emulacja chowa więc czas serwera krótszy niż
  opóźnienie i nie dolicza zestawiania połączenia (DNS, TCP, TLS). Na prawdziwym telefonie ze słabym zasięgiem pierwsze
  wejście trwa raczej dłużej niż w tabeli. To wniosek z tych liczb, bez pomiaru na telefonie.
- **Procesor:** spowolnienie 4× liczy się od laptopa Karola (model nieznany), nie od konkretnego telefonu.

### Co ściąga każda strona (build lokalny 2026-11-27 17:18 z `086837b`)

- **Kolejność pobierania pierwszego wejścia na `/`** (lista żądań bez spowolnienia): HTML (4,9 KB) → dwa pliki Manrope
  (24,6 i 15,1 KB, `preload`, `src/layouts/Layout.astro:53`), CSS (14,1 KB), skrypt wyspy i renderer Reacta (66 KB) →
  7 modułów importowanych przez nie → `log.js`. To trzy fale skryptów po HTML. W profilu `slow4g` każda fala kosztuje
  co najmniej jedno opóźnienie (562,5 ms), a jest tak, bo Astro nie dodaje `modulepreload` dla zależności wysp
  (`node_modules/astro/dist/core/environment/production.js:66`).
- **Pliki statyczne:** adapter dopisuje `/_astro/*  Cache-Control: public, max-age=31536000, immutable`
  (`dist/client/_headers`, log builda). To dlatego drugie wejście pobiera 6–8 KB.
- **Skrypty stron:** sumy z grafu importów w `dist/client/_astro`, gzip poziom 9:

| strona           | wyspy (`client:load`)                                                       | skrypty              | najgłębszy łańcuch importów |
| ---------------- | --------------------------------------------------------------------------- | -------------------- | --------------------------- |
| `/` bez sesji    | `HeaderActions` (`src/components/room/AppHeader.astro:46-54`)               | 10 plików, 98 KB gz  | 3                           |
| `/j/…` formularz | `HeaderActions` + `JoinForm` (`src/components/room/LinkScreen.astro:48-53`) | 20 plików, 108 KB gz | 3                           |
| `/r/…` pokój     | `HeaderActions` + `RoomScreen` (`src/pages/r/[id].astro:116-123`)           | 24 pliki, 190 KB gz  | 3                           |

- **Największe części pokoju:**
  - renderer Reacta, 63 KB gz;
  - cały `supabase-js`, 54 KB gz (`shared.r-SuVO4N.js`);
  - `RoomScreen` razem z czatem, gifami, emoji, odsłoną i podsumowaniem, 25 KB gz;
  - słowniki obu języków razem z ikonami, 15 KB gz (`react.C43Y6IdC.js`).
- **Zero podziału kodu:** w żadnym pliku `dist/client/_astro/*.js` nie ma `import(`, więc wszystko z listy ładuje się
  od razu.
- **Słowniki:** oba języki idą do przeglądarki, bo `src/lib/i18n/index.ts:1-2` importuje `en` i `pl` statycznie. Tego
  wymaga przełączanie języka bez przeładowania (`src/lib/i18n/live-lang.ts`, AGENTS.md, UI).
- **`supabase-js` w pokoju:** importuje go `src/components/room/useRoomState.ts:2`, a ekran używa z niego tylko kanału
  na żywo (`03-anti-corruption-layer.md:218-224`). Na stronie linku `supabase-js` ładuje się tylko na ekranie
  oczekiwania spóźnionego (`JoinWaiting`, `LinkScreen.astro:94-98`).

### Praca serwera przed pierwszym bajtem (raport agenta, kotwice sprawdzone wyrywkowo)

- **Kolejne wywołania:** żadna sprawdzona ścieżka nie odpala ich równolegle; w `src/` nie ma `Promise.all` ani `Promise.allSettled` (grep 2026-11-27).
- **Sesja hosta:** middleware czeka na `auth.getUser()` przy każdym żądaniu (`src/middleware.ts:24-25`,
  `src/lib/auth-user.ts:13-14`). Z ciasteczkiem sesji to jedno wywołanie Auth przez sieć. Gość bez sesji płaci tylko
  lokalny błąd `AuthSessionMissingError`, bez sieci (według agenta, `node_modules/@supabase/auth-js/…/GoTrueClient.js:2711-2714`).
- **`/j/…`, gość pierwszy raz:** jedno wywołanie, `room_link` (`src/pages/j/[token].astro:32`). Gość z ciasteczkiem
  pokoju: do trzech po kolei (`:32`, `:40`, `:51`).
- **`/r/…`:** gość jedno wywołanie, `room_lobby` (`src/pages/r/[id].astro:48`); host dwa (Auth i `room_lobby`).
- **Pokój po hydratacji:** gdy kanał na żywo jest gotowy (`SUBSCRIBED`), ekran od razu pobiera stan
  (`useRoomState.ts:437`, `limiter.refresh()`). Te same dane serwer właśnie narysował w HTML. Potem pobiera stan co 8 s,
  gdy karta jest widoczna (`ROOM_POLL_MS`, według agenta `src/lib/live-sync/shared.ts:42`).
- **KLIPY:** wyszukiwarka gifów odpytuje KLIPY tylko po wpisaniu słowa (według agenta `useGifSearch.ts:88-100`). Przy
  otwarciu pokoju nic nie idzie do KLIPY.

### Możliwe przyspieszenia (ocena „co to da w grze”, nic nie zmierzone)

1. **Czat, gify i emoji ładowane dopiero przy otwarciu czatu** (`React.lazy` dla `RoomChat`/`GifPicker`). Zysk to część
   25 KB gz `RoomScreen`. Ryzyko: czat liczy nowe wiadomości także zamknięty, więc odroczyć można tylko panel, nie
   odbiór.
2. **Tylko klient kanału na żywo zamiast całego `supabase-js`.** Zysk wynosi do 54 KB gz minus rozmiar
   `@supabase/realtime-js` (niezmierzony). Ten pomysł zapisano już jako S2 w `03-anti-corruption-layer.md:484,653`,
   z uwagą, że najpierw warto zmierzyć jego wpływ (`:683-684`). Ryzyko: dotyka kanału na żywo i podpisów, czyli
   głównej ścieżki gry.
3. **`modulepreload` dla zależności wysp**, żeby trzy fale skryptów stały się jedną. Na słabym zasięgu to ok. 1–2
   opóźnienia mniej (ok. 0,6–1,1 s w profilu `slow4g`), na LTE ok. 0,1 s. Astro tego nie robi samo, potrzebna byłaby
   własna integracja buildu.
4. **Przełącznik języka hydratowany później** (`client:idle` zamiast `client:load` w `AppHeader.astro:53`). Na stronach
   bez innych wysp (strona logowania, komunikaty) React ładowałby się po narysowaniu. Ryzyko: AGENTS.md wymaga, by
   przełącznik był „zawsze aktywny”, więc pierwsze dotknięcie przed hydratacją trzeba by sprawdzić.
5. **Bez podwójnego pobrania stanu po wejściu do pokoju** (`useRoomState.ts:437`). Dla gracza to jedno żądanie mniej,
   dla hosta dwa (Auth i `room_lobby`). Ryzyko: to pobranie łata stan między narysowaniem strony a gotowym kanałem,
   więc wymaga osobnego researchu (`src/components/room/` i API pokoju, pełny cykl).

## Code References

- `src/pages/j/[token].astro:32-51` — wywołania Supabase strony linku, po kolei
- `src/pages/r/[id].astro:48,116-123` — `room_lobby` i wyspa `RoomScreen` z `client:load`
- `src/middleware.ts:24-25`, `src/lib/auth-user.ts:13-14` — `auth.getUser()` przy każdym żądaniu
- `src/components/room/AppHeader.astro:46-54` — `HeaderActions` z `client:load` na każdej stronie z nagłówkiem
- `src/components/room/LinkScreen.astro:48-53,94-98` — `JoinForm` i `JoinWaiting` z `client:load`
- `src/components/room/JoinForm.tsx:111` — zwykły formularz POST, działa bez skryptu
- `src/components/room/useRoomState.ts:2,437` — import `supabase-js`; pobranie stanu po `SUBSCRIBED`
- `src/lib/i18n/index.ts:1-2` — oba słowniki statycznie
- `src/lib/security-headers.ts:45` — `Cache-Control: no-store` dla HTML i API
- `src/layouts/Layout.astro:53` — `<Font … preload />`
- `dist/client/_headers` — `immutable` dla `/_astro/*` (z builda)

## Architecture Insights

- Wszystkie wyspy mają `client:load`, a w kliencie nie ma `import()`. Każda strona ładuje więc cały kod swoich wysp od
  razu. Przy tej skali gry to prostota kosztem ułamków sekundy na słabym zasięgu.
- Ścieżka gościa jest odporna na wolny skrypt tam, gdzie to najważniejsze. Formularz „Dołącz” działa bez skryptu, ale
  „Zagłosuj” czeka na hydratację (przyjęte w S-22, `context/foundation/roadmap.md:413`).

## Historical Context (from prior changes)

- `context/foundation/prd.md:50` — wymaganie: gość dołącza w mniej niż 30 s. To czas człowieka, sprawdzany ręcznie, a nie
  automatycznie (`context/foundation/test-plan.md:68`, według agenta). Budżetu ładowania stron (TTFB, LCP, rozmiar
  skryptów) nie ma nigdzie w `context/foundation/`.
- `context/archive/2026-10-07-room-lobby/phone-test.md:23` — Android, link z Discorda: ok. 10 s do poczekalni
  (2026-10-08). Nadal aktualne jako jedyny pomiar drogi gościa. iOS nie był sprawdzany.
- `context/archive/2026-09-27-live-sync-spike/measurements.md` — F-01, 2026-10-04: dzwonek i stan docierają w p95 235 ms
  przy 20 graczach (według agenta `:23`). Mierzono z laptopa w domowej sieci, bez danych komórkowych (`:45`).
- `context/domain/03-anti-corruption-layer.md:218-224,683-684` — 2026-10-20: `supabase-js` miał 54 595 B gzip.
  Dziś ma 53,9 KB gz (55,2 tys. B), więc stwierdzenie nadal stoi. Pomysł S2 nie został zrobiony.
- `context/foundation/roadmap.md:413` (S-22) — `no-store` wyłącza szybki powrót przyciskiem „wstecz”. Przyjęte.
- `context/foundation/infrastructure.md:18` — „zimny start rzędu milisekund” Workers to twierdzenie z researchu
  platformy, nigdy nie mierzone. Dzisiejszy curl dał pierwszy bajt po 65–392 ms, ale nie da się z niego oddzielić
  zimnego startu.
- Powodu skreślenia G 15.11 nie zapisano ani w repo, ani w `sesja-gry.md` („skreślony 15.11 (moja decyzja)”). Powrót
  16.11 jest zapisany z dopiskiem „bardzo niski priorytet”.

## Related Research

- `context/archive/2026-09-27-live-sync-spike/measurements.md` — opóźnienia kanału na żywo
- `context/domain/03-anti-corruption-layer.md` — `supabase-js` w paczce przeglądarki (S2)

## Open Questions

1. **Czy zamknąć G samym pomiarem, bez kodu?** Rekomendacja badania: tak. Pomiar nie pokazał niczego, co łamie PRD.
   Przyspieszenia z listy dają ułamki sekundy na słabym zasięgu, a dwa najbardziej opłacalne (2 i 5) dotykają głównej
   ścieżki gry. **Rozstrzygnięte 2026-11-27 (Karol): tak.** G kończy się tym pomiarem, bez kodu i bez slice'a w
   roadmapie. Pytania 2 i 3 zostają otwarte, a pokoju nie mierzymy. Przyspieszenia z listy wracają tylko wtedy, gdy
   gracze zgłoszą wolne otwieranie.
2. **Czy zmierzyć jeszcze pokój `/r/…` na produkcji?** (Nie teraz, zob. 1.) Potrzebny jest jeden pokój na koncie smoke, założony i
   skasowany jak w `npm run smoke`, więc to zmiana bazy produkcyjnej za zgodą. Inaczej zostaje szacunek z rozmiaru
   skryptów: ok. 1,9× więcej niż strona logowania, plus kanał na żywo i jedno pobranie stanu. Luka: nie wiadomo, po ilu
   sekundach na słabym zasięgu działa „Zagłosuj”.
3. **Prawdziwy telefon:** iOS/Safari i dane komórkowe nigdy nie były mierzone przy ładowaniu. Emulacja nie dolicza
   zestawiania połączenia. Najprościej sprawdzić to przy grze, na oko, bez narzędzi.
