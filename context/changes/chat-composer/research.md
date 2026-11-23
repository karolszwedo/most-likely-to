---
date: 2026-11-23T18:15:38+01:00
researcher: Claude (Opus 5.5) z Karolem
git_commit: cc2e056
branch: chat-composer
repository: most-likely-to
topic: "Czat: szukanie gifa nie myli się z pisaniem, emoji w wiadomości (S-29)"
tags: [research, ui, chat, gif-search, emoji, RoomChat, GifPicker]
status: complete
last_updated: 2026-11-23
last_updated_by: Claude (Opus 5.5)
---

# Research: czat, szukanie gifa odróżnione od pisania, emoji w wiadomości (S-29)

**Date**: 2026-11-23T18:15:38+01:00
**Researcher**: Claude (Opus 5.5) z Karolem
**Git Commit**: cc2e056
**Branch**: chat-composer
**Repository**: most-likely-to

## Research Question

Po pierwszej grze ze znajomymi (2026-11-22) znajoma wysłała wiadomość na czat, myśląc, że wpisuje słowo w wyszukiwarkę gifów (uwaga M w `sesja-gry.md`), a Karol chce przycisku z siatką emoji obok „GIF” (uwaga N; roadmapa S-29, `context/foundation/roadmap.md:496-506`). Pytania badania:

1. Dlaczego dwa pola się mylą: zarzuty audytu `/10x-ui` (Z1–Z4) z plikiem, linią i skutkiem dla gracza.
2. Jakimi sposobami da się rozdzielić pisanie i szukanie i co każdy z nich zmienia w kodzie, testach i podglądach.
3. Jak wstawić emoji do wiadomości bez nowej biblioteki: miejsce siatki, licznik znaków, klawiatura telefonu, nazwy dla czytnika ekranu.
4. Jakich wcześniejszych decyzji i ograniczeń zmiana musi się trzymać (KLIPY, układ W1/W2, F1 z `room-chat`, słownik S-27).

## Summary

- **Przyczyna Z1 jest w budowie, nie w kolorze.** Pole szukania i pole wiadomości to ten sam kod: `InputGroup className="bg-background h-11"` z `InputGroupInput className="text-foreground"` (`src/components/room/GifPicker.tsx:166-179`, `src/components/room/RoomChat.tsx:481-496`), obok każdego przycisk `secondary` (`GifPicker.tsx:180`, `RoomChat.tsx:511-517`). Różni je tylko `enterKeyHint` (`search` / `send`), którego nie widać. W obu układach wybranych 2026-11-18 pole wiadomości stoi na ekranie razem z wyszukiwarką: W2 kładzie pasek wyszukiwarki tuż nad polem wiadomości, a W1 chowa tylko listę (`RoomChat.tsx:103-104`). Ukrycie pola wiadomości na czas szukania nigdy nie było w galerii (przeszukane: `context/changes/room-chat-gifs/` research, plan, przeglądy, notatki).
- **Skan literałów: 0 trafień** w czacie (czat jest pod `scripts/ui-literals.mjs`, który skanuje cały `src/components/room`, `scripts/ui-literals.mjs:7-21`), więc zarzutu braku tokenów nie ma. Wariant kontraktu: **istniejący system projektowy** (tokeny `src/styles/global.css`, komponenty `src/components/ui`), który rozszerzamy.
- **Trzy sposoby rozdzielenia** (szczegóły w „Sposoby rozdzielenia”): R1, czyli wyszukiwarka zajmuje miejsce pola wiadomości i naraz jest tylko jedno pole tekstowe; R2, czyli dwa pola zostają, ale wyglądają inaczej; R3, czyli tacka z kartami „Emoji | GIF” nad polem wiadomości. Tylko R1 usuwa samą możliwość pomyłki. R2 i R3 tylko ją utrudniają. Wybór należy do Karola, na zrzutach.
- **Emoji da się zrobić bez nowej zależności.** Wiadomość już przyjmuje emoji (`src/lib/rooms/chat-text.ts:9`, `:23-30`). `radix-ui` z `react-popover` jest już w zależnościach (`package.json`, `node_modules/@radix-ui/react-popover`), więc `npx shadcn add popover` nie dodaje paczki npm. Pasek wewnątrz panelu czatu, jak W2 dla gifów, nie potrzebuje nawet tego.
- **Licznik liczy punkty kodowe, nie emoji, jak je widzi człowiek.** `chatTextLength` = `Array.from(NFC)` (`chat-text.ts:17-21`): 😂 to 1 znak, ale ❤️ to 2 (U+2764 U+FE0F), 👍🏻 to 2, 🤷‍♀️ to 4 (sprawdzone w Node 2026-11-23). Dokumenty mówią, że „emoji to jeden znak” (`context/domain/glossary.md:51`, `src/lib/rooms/chat.ts:16`), co jest prawdą tylko dla emoji z jednego punktu kodowego. Siatka złożona z takich emoji nie wchodzi w tę rozbieżność.
- **Zmiana zostaje w lżejszym cyklu.** Dotyka `src/components/room/`, `src/lib/i18n/pl/chat.ts`, podglądów `/dev/*`, `tests/e2e/chat.spec.ts`, słownika domeny i `test-plan.md`. Nie dotyka bazy, `src/lib/rooms/` ani `src/pages/api/rooms/`. Zmiana w `tests/` i tak idzie tylko przez PR z zielonym CI (`AGENTS.md`, Hard Rules).

## Charges

Zarzuty audytu `/10x-ui` (wstępny audyt 2026-11-23, potwierdzony w tym badaniu). Każdy dostaje fazę w planie albo zostaje tu jako **deferred** z powodem.

| Id  | Kategoria                                    | Plik:linia                                                                         | Co widzi gracz                                                                                                                                                                                                                                                               |
| --- | -------------------------------------------- | ---------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Z1  | przypadkowa architektura                     | `GifPicker.tsx:166-179`, `RoomChat.tsx:481-496`                                    | Z otwartą wyszukiwarką widzi dwa jednakowe pola jedno nad drugim (telefon, W2) albo wyszukiwarkę nad polem wiadomości (laptop, W1). Wpisuje słowo w pole, które ma bliżej kciuka, i wysyła je do całego pokoju jako wiadomość. To przypadek z gry 2026-11-22.                |
| Z2  | brakujący wspólny komponent (stan przycisku) | `RoomChat.tsx:467-479`                                                             | „GIF” wygląda tak samo zamknięty i otwarty (`variant="outline"`). Stan widzi tylko czytnik ekranu (`aria-expanded`), więc gracz nie wie, że jest „w trybie gifów”. `button.tsx` nie ma wyglądu „włączony” (`src/components/ui/button.tsx:12-38`).                            |
| Z3  | przypadkowa architektura (podpis)            | `GifPicker.tsx:163-165`, `:175`; `src/lib/i18n/pl/chat.ts:37-40`                   | Wyszukiwarka nie ma widocznego polskiego podpisu: tylko placeholder „Search KLIPY” (wymóg KLIPY), który znika po pierwszej literze. „Szukaj gifa” słyszy tylko czytnik (`sr-only`). Pole nie ma też ikony lupy.                                                              |
| Z4  | brakujący komponent                          | `RoomChat.tsx:466-522`                                                             | Przy polu wiadomości nie ma emoji. Na laptopie gracz nie ma ich skąd wziąć. Na telefonie musi przełączyć klawiaturę. Emotki (❤️ 👍 👎 😭 🤬 💀, `src/lib/rooms/emotes.ts:7-14`) to osobne reakcje, nie tekst wiadomości (`glossary.md:49`).                                  |
| Z5  | deferred (do decyzji w planie)               | `RoomChat.tsx:96` (`bottom-18`), `src/components/room/EmoteBar.tsx:24-33` (`h-18`) | Szczelina kilku pikseli między polem czatu a paskiem emotek na telefonie, odłożona w `room-chat-gifs` (`context/changes/room-chat-gifs/change.md:35`). Po restylu S-25 nie sprawdzona na ekranie. To samo miejsce co Z1 i Z4, więc warto ją obejrzeć na zrzutach tej zmiany. |

## Detailed Findings

### Jak dziś stoi czat i wyszukiwarka

- Poniżej `lg` czat to panel `fixed inset-x-0 bottom-18 z-10 max-h-1/2` tuż nad paskiem emotek (`RoomChat.tsx:94-101`). Z otwartą wyszukiwarką panel ma dokładnie pół okna (`h-1/2`, `RoomChat.tsx:102`): pod samym `max-h-1/2` lista zgniatała wyniki do kilku pikseli (`RoomChat.tsx:88-91`, `room-chat-gifs/change.md:35`).
- Od `lg` do `xl` czat to sekcja pod widokiem z listą na kilka linijek. Od `xl` to panel przy lewej krawędzi okna (`RoomChat.tsx:77-93`).
- Wyszukiwarka (`GifPicker`) poniżej `xl` to pasek nad polem wiadomości (W2), a od `xl` stoi w miejscu listy (W1, siatka 3 kolumn, „Wróć do czatu”) (`GifPicker.tsx:31-59`). Szerokość przełącza sam CSS (`xl:`), nigdy szerokość okna odczytana w kodzie, żeby render serwera i przeglądarki był ten sam. Przyciski innej szerokości mają `display: none` (`GifPicker.tsx:40-42`).
- Fokus (`RoomChat.tsx:187-204`, `:249-324`): „GIF” przenosi fokus do pola szukania, zamknięcie wyszukiwarki oddaje go na „GIF”, a wybrany gif przenosi go do pola wiadomości. Dotknięcie „Wyślij wiadomość” zostawia fokus w polu (`keepFieldFocus`, `onMouseDown` z `preventDefault`, `RoomChat.tsx:370-374`, `:518`), więc klawiatura telefonu zostaje otwarta.

### Sposoby rozdzielenia pisania i szukania (Z1–Z3)

|                                | R1: wyszukiwarka zamiast pola wiadomości                                                                                                                                                                                                                                       | R2: dwa pola, różny wygląd                                                                                                   | R3: tacka z kartami „Emoji / GIF”                                                                       |
| ------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------- |
| Co widzi gracz                 | Po „GIF” wiersz pola wiadomości znika, a w jego miejscu (na dole, przy kciuku) staje pole szukania z lupą i widocznym podpisem. „GIF” zostaje w tym samym miejscu, wyraźnie włączony. Zamknięcie przywraca pole wiadomości.                                                    | Jak dziś, plus lupa w polu szukania, widoczny podpis „Szukaj gifa” nad nim, inna powierzchnia paska i włączony wygląd „GIF”. | Nad polem wiadomości tacka z kartami: „Emoji” (siatka) i „GIF” (wyszukiwarka). Pole wiadomości zostaje. |
| Czy pomyłka z gry jest możliwa | Nie: naraz jest tylko jedno pole tekstowe.                                                                                                                                                                                                                                     | Tak, rzadziej: oba pola dalej stoją naraz.                                                                                   | Tak, rzadziej, na karcie „GIF”.                                                                         |
| Laptop (od `xl`)               | Wyszukiwarka w miejscu listy (jak W1), wiersz wiadomości schowany, „Wróć do czatu” zostaje.                                                                                                                                                                                    | Bez zmiany układu W1, tylko wygląd.                                                                                          | Tacka nad polem w panelu. Do rozstrzygnięcia: lista czy siatka 3 kolumn.                                |
| Kod                            | `RoomChat`: wiersz wiadomości ukryty, gdy `searching`. Fokus i tak idzie do pola szukania (`RoomChat.tsx:318`). Przycisk X w pasku (`GifPicker.tsx:183-192`) dubluje włączony „GIF” (do decyzji).                                                                              | Wygląd `GifPicker` i stan „GIF”. Logika bez zmian.                                                                           | Nowy wspólny komponent tacki. „GIF” i emoji jako karty. Największa przebudowa.                          |
| e2e                            | Krok „with the search still open, A writes” (`tests/e2e/chat.spec.ts:517-520`) traci sens: do przepisania (zamknąć wyszukiwarkę, potem pisać). `closeGifSearch` czyta `aria-expanded` „GIF” i nim zamyka (`chat.spec.ts:194-198`), więc „GIF” musi zostać widoczny i klikalny. | Bez zmian w lokatorach, o ile nazwy zostają.                                                                                 | Nazwy i role do przepisania (`chat.spec.ts:108-125`), `test-plan.md:398`.                               |

Wspólne dla wszystkich trzech: placeholder „Search KLIPY” zostaje dosłownie (wymóg KLIPY, `context/changes/room-chat-gifs/research.md:48`, decyzja 5, `src/lib/i18n/pl/chat.ts:38-40`). Polski podpis może stać obok niego jako widoczny tekst. Wyszukiwarka zostaje pusta na start i szuka dopiero po „Szukaj” (decyzja 4: klucz testowy ma 100 zapytań na godzinę na całą grę, `room-chat-gifs/research.md:57`). Wyniki zostają w kolejności i składzie KLIPY.

**Rekomendacja badania (do potwierdzenia przez Karola na zrzutach):** R1 z widocznymi znakami z R2 (lupa, widoczny podpis, włączony „GIF”). Tylko R1 usuwa pomyłkę z gry, a dzisiejszy kod już chowa część czatu na czas szukania (listę od `xl`), więc to ten sam mechanizm. Pisanie w trakcie przeglądania gifów było możliwe, ale w grze nikt go nie potrzebował, a test e2e sprawdza je tylko przy okazji limitu KLIPY (`chat.spec.ts:517-520`).

### Emoji w wiadomości (Z4)

- **Miejsce siatki:**
  - (E1) pasek w panelu czatu nad polem wiadomości, jak W2 dla gifów. Bez nowego komponentu, w tym samym ograniczeniu wysokości (`h-1/2` jak `sectionWhileSearching`).
  - (E2) okienko wyskakujące (`npx shadcn add popover`, Radix już zainstalowany). Okienko wyświetla się w portalu nad wszystkim, więc na telefonie może zasłonić pole. Test e2e sprawdza, że dotknięcie środka pola trafia w pole (`reachesField`, `chat.spec.ts:158-164`, `:553-556`).
  - Pole wiadomości musi zostać widoczne, gdy siatka jest otwarta, bo gracz widzi, co wstawia. Siatka i wyszukiwarka gifów wykluczają się nawzajem: otwarcie jednej zamyka drugą.
- **Nie mylić z paskiem emotek.** Pasek emotek to sześć przycisków `size-11` przy dole okna, `role="group"` z nazwą „Emotki” (`EmoteBar.tsx:24-33`, `:85-100`). `tests/e2e/emotes.spec.ts:23` i `:72` szukają `getByRole("group", { name: "Emotki" })` bez `exact`, więc siatka nie może być grupą z „emotki” w nazwie. Bezpieczna nazwa to np. „Emoji”. Słownik domeny nie ma jeszcze hasła „emoji” (jest tylko w opisie wiadomości, `glossary.md:51`), a `AGENTS.md` (Conventions) wymaga go przed nazwaniem czegokolwiek w kodzie.
- **Zestaw.** Emoji z jednego punktu kodowego (😂 🔥 🫠 itd.) liczą się jak 1 znak. Emoji z U+FE0F, odcieniem skóry albo złączone ZWJ liczą się jak 2–4 (`chat-text.ts:17-21`). Wszystkie przechodzą zasady tekstu: `REFUSED_CHARACTERS` to tylko `\p{Cc}` i znaki kierunku pisma (`chat-text.ts:9`), a znak formatu wewnątrz czytelnego tekstu zostaje (`chat-text.ts:23-26`). Liczba i wybór emoji należą do Karola (roadmapa, Unknowns, `roadmap.md:503-504`).
- **Wstawianie w miejscu kursora:** `selectionStart`/`selectionEnd` pola, nowy tekst w stanie, kursor za wstawionym emoji po renderze. Wzór fokusu jest już w `RoomChat` (`focusNext`, `RoomChat.tsx:251`, `:285-296`).
- **Klawiatura telefonu.** Dotknięcie przycisku zabiera fokus z pola i zamyka klawiaturę, chyba że przycisk robi `preventDefault` przy wciśnięciu, jak „Wyślij wiadomość” (`RoomChat.tsx:372-374`). To wniosek z tego wzoru, nie sprawdzone na telefonie. Plan musi wybrać jedno z dwóch: siatka zamiast klawiatury (jak w komunikatorach) albo klawiatura zostaje otwarta.
- **Nazwy dla czytnika.** Każdy przycisk potrzebuje nazwy dostępnej. Polski tekst w nazwie idzie do słownika (`src/lib/i18n/pl/chat.ts`, reguła w `src/lib/i18n/index.ts:11-12`, strażnik `scripts/ui-text.mjs`). Sam znak emoji przechodzi strażnika. Czytnik czyta nazwę emoji w języku systemu.

### Napisy i wersja angielska

- Wszystkie napisy czatu są w `src/lib/i18n/pl/chat.ts:7-55`. Używają ich tylko `RoomChat.tsx` i `GifPicker.tsx`. Angielskiego słownika nie ma: `messages()` zwraca polski dla obu języków (`src/lib/i18n/index.ts:31-38`). Nowe klucze teraz dostają tylko polski tekst. Angielski dopisze Faza 4 S-27 (`context/changes/english-version/plan.md:311-313`), gdzie brak klucza wywali `npx astro check`.
- Podglądy `/dev/*?lang=xx` pokazują każdy napis w ⟦…⟧ (`src/lib/i18n/pseudo.ts:6`), co sprawdza, że nowy tekst przeszedł przez słownik.

### Co trzeba będzie zmienić poza komponentami

- **e2e** (`tests/e2e/chat.spec.ts`; jedyny test, który dotyka DOM czatu, a żaden test jednostkowy nie renderuje `RoomChat`, `context/foundation/test-plan.md:434`). Lokatory:
  - region „Czat” (`:82`);
  - pole „Wiadomość na czacie” (`:101`);
  - „Wyślij wiadomość” (`:105`);
  - „GIF: wyszukaj gifa” (`:111`);
  - region „Wyszukiwarka gifów” wewnątrz regionu czatu (`:116`);
  - pole „Szukaj gifa” jako `textbox` (`:120`; `type="search"` zmieniłby rolę na `searchbox` i zepsuł lokator);
  - placeholder „Search KLIPY” (`:172-175`);
  - wyniki „Wyślij gifa: …” (`:184-189`);
  - przycisk zwiniętego czatu po `/^Czat/` (`:131`; nowy przycisk o nazwie zaczynającej się od „Czat” by z nim kolidował).

  Opis tych nazw: `test-plan.md:361`, `:398`. Smoke nie ma lokatorów DOM (`scripts/smoke.mjs`, tylko API).

- **Podglądy** (`AGENTS.md`, UI):
  - `/dev/room-states`: stany czatu `:987-1089` (191–207, numeracja ręczna), opis zachowania `:1097-1124`;
  - `/dev/room-window`: stany `chat-*` `:1018-1132`, w tym `chat-reveal-host-gif-search` i `-results`;
  - kształty `ChatPreview` (`RoomChat.tsx:33-51`) i `GifSearchPreview` (`src/components/room/useGifSearch.ts:22-28`). Otwarta siatka emoji potrzebuje nowego pola.

  Nowy stan to podgląd w obu stronach, a nowa kontrolka albo wygląd przycisku („GIF” włączony, przycisk emoji) to wiersz w `/dev/ui-kitchen-sink`, który dziś nie ma nic z czatu.

- **Kontrast:** `scripts/contrast.mjs` (PAIRS `:23-66`) nie ma par czatu. Nowe zestawienie tekstu na powierzchni (np. włączony „GIF” na `primary` albo `secondary`, podpis na powierzchni paska) dostaje wiersz (`AGENTS.md`, UI).

## Code References

- `src/components/room/RoomChat.tsx:94-115` - układ panelu (`IN_WINDOW`, `IN_FRAME`), `sectionWhileSearching`, `listBehindSearch`
- `src/components/room/RoomChat.tsx:312-326` - `toggleSearch`, `closeSearch` (fokus przy otwarciu i zamknięciu)
- `src/components/room/RoomChat.tsx:439-454` - wyszukiwarka między listą a polem
- `src/components/room/RoomChat.tsx:466-522` - wiersz pola: „GIF”, pole wiadomości, licznik, „Wyślij wiadomość”
- `src/components/room/GifPicker.tsx:43-59` - `STRIP` (W2) i `PANEL_FROM_XL` (W1)
- `src/components/room/GifPicker.tsx:153-193` - region, formularz `role="search"`, pole, „Szukaj”, X
- `src/lib/rooms/chat-text.ts:9-41` - zasady tekstu, licznik punktów kodowych
- `src/lib/i18n/pl/chat.ts:7-55` - napisy czatu i wyszukiwarki
- `src/components/room/EmoteBar.tsx:24-33`, `:85-100` - pasek emotek (miejsce, rozmiar, nazwa grupy)
- `src/components/ui/button.tsx:12-38` - warianty przycisku (bez wyglądu „włączony”)
- `src/components/ui/input-group.tsx:14-40` - pole z obramowaniem (`InputGroupAddon inline-start` dla lupy)
- `tests/e2e/chat.spec.ts:155-198`, `:517-556` - lokatory, zamykanie wyszukiwarki, pisanie przy otwartej wyszukiwarce, pole w niskim oknie (F1)

## Architecture Insights

- Wygląd zależy od szerokości tylko przez klasy Tailwinda (`lg:`, `xl:`), a elementy innej szerokości mają `display: none`, więc dostępne jest jedno sterowanie naraz (`GifPicker.tsx:40-42`). R1 i siatka emoji mogą się tego trzymać: zmienia się tylko, który wiersz stoi pod listą.
- Każdy region pojawia się raz (`AGENTS.md`, UI). Wyszukiwarka i siatka to regiony panelu czatu, nie okna dialogowe (`RoomChat.tsx:196-204`).
- Podgląd steruje stanem przez `preview` (`ChatPreview`), a podgląd nigdy nie pyta KLIPY (`RoomChat.tsx:27-28`, `:451-452`). Nowe stany idą tą samą drogą.

## Historical Context (from prior changes)

- `context/changes/room-chat-gifs/change.md:33` - wybór Karola 2026-11-18: W1 od `xl`, W2 poniżej. Odrzucone: W1 na telefonie, W2 na laptopie, nick obok obrazka, dymek z tekstem. Powodów odrzucenia repo nie zapisało, a galeria była w scratchpadzie i jej już nie ma.
- `context/changes/room-chat-gifs/change.md:35` - stałe `h-1/2` z otwartą wyszukiwarką. Szczelina przy pasku emotek odłożona (Z5).
- `context/changes/room-chat-gifs/research.md:48`, `:141` - „Search KLIPY” wymagany. Czy wolno go tłumaczyć, nie wiadomo, więc decyzja 5 zostawia angielski w każdym języku.
- `context/archive/2026-11-17-room-chat/` - układ T2/L3, F1 z przeglądu (pole pod paskiem emotek → `flex` w sekcji i krok e2e w niskim oknie, `test-plan.md:361`), `interactive-widget=resizes-content` tylko na stronie pokoju (`src/pages/r/[id].astro:101`).
- `context/archive/2026-10-26-room-emotes/change.md:14` - sześć emotek Karola. FR-023 wzięte jako same emotki.
- `context/changes/room-chat-gifs/plan.md:456` - wniosek o produkcyjny klucz KLIPY (4.7) dalej otwarty. Nagranie do niego lepiej zrobić już z nowym wyglądem S-29. Klucz produkcyjny mógłby zdjąć decyzję 4 (pusta wyszukiwarka na start), ale to poza tą zmianą.

## Related Research

- `context/changes/room-chat-gifs/research.md` - wybór dostawcy gifów, warunki KLIPY.
- `context/archive/2026-11-17-room-chat/research.md` - czat, podpis serwera, układ na telefonie.
- `context/changes/english-version/research.md` - słownik napisów (S-27).

## Open Questions

Decyzje Karola, po jednej na wiadomość, z wariantami na zrzutach (telefon 390×844 i 390×480 z klawiaturą, laptop 1536×750):

1. **Rozdzielenie:** R1, R2 czy R3? Rekomendacja badania: R1 ze znakami z R2.
   **Decyzja Karola 2026-11-23 (galeria R1/R2/R3, „wstępnie git”): R1, wstępnie.** Po „GIF” wiersz pola wiadomości znika. W jego miejscu, na dole na każdej szerokości (od `xl` też, a wyniki stoją w miejscu listy), staje wiersz: włączony „GIF” (wypełniony `primary`), pole szukania z lupą, „Szukaj”. Nad wynikami widoczny napis „Szukaj gifa” i przycisk powrotu („Wróć do pisania” na telefonie, „Wróć do czatu” od `xl`), który zastępuje dzisiejsze X i dolne „Wróć do czatu”. Napisy robocze. Makiety: `inject.js` w scratchpadzie sesji 2026-11-23 (nie w repo).
2. **Miejsce siatki emoji:** pasek w panelu (E1) czy okienko wyskakujące (E2)? Do tego: czy na telefonie siatka zastępuje klawiaturę, czy klawiatura zostaje otwarta.
   **Decyzja Karola 2026-11-23 (galeria E1/E2 × K1/K2, „git” na rekomendację): E1 + K1.** Przycisk z ikoną uśmiechu obok „GIF” (włączony wygląd jak „GIF” w R1). Siatka stoi w panelu czatu nad polem wiadomości, na tym samym miejscu co wyniki gifów w R1 (poniżej `lg` panel ma wtedy `h-1/2` jak przy szukaniu, od `xl` lista nad siatką się kurczy). Pole wiadomości zostaje widoczne. Siatka i szukanie gifa wykluczają się nawzajem. K1: na telefonie dotknięcie przycisku emoji zabiera fokus z pola, więc klawiatura się chowa i widać całą siatkę, a dotknięcie pola przywraca klawiaturę. Makiety: `inject2.js` w scratchpadzie sesji 2026-11-23.
3. **Zestaw emoji:** ile i które? Rekomendacja badania: emoji z jednego punktu kodowego, żeby każde liczyło się jak 1 znak. Do decyzji też, czy sześć znaków emotek może być w siatce (jako tekst).
   **Decyzja Karola 2026-11-23 (galeria zestawów A 21 / B 28 / C 42 / D 70 w grupach + katalog 129 kandydatów z numerami): zestaw B + numery 22, 28, 40, 52, 71 (🫨 🧐 🥴 🤬 🗿), razem 33.** Kolejność według motywu (śmiech, szok, podejrzenia, wstyd, smutek i złość, charakter, gesty, impreza): `😂 🤣 😭 💀 😱 🤯 😳 🫨 🤨 🧐 👀 🙄 🤔 😏 😬 🙈 😅 🤦 🤷 🥴 🥺 😍 😎 😈 🤬 🤡 🗿 🔥 💯 👏 👉 🥳 🍻`. Siatka bez nazw grup, 7 kolumn, więc 5 rzędów (ostatni niepełny). Emotki mogą być w siatce jako tekst (są w niej 😭 💀 🤬, a 🤬 Karol dobrał sam). Każde z 33 to jeden punkt kodowy, w pełni kwalifikowane (sprawdzone z `emoji-test.txt` Unicode 18.0), więc licznik liczy je jak 1 znak. Wszystkie pochodzą z Emoji 11.0 (2018) lub starszych poza 🫨 (Emoji 15.0, 2022). Na Windows 10 i na telefonie z systemem sprzed 2023 roku 🫨 może wyjść jako pusty kwadracik. Karol wybrał je z oznaczeniem roku w katalogu (przyjęte ryzyko). Makiety: `s29-d3/` w scratchpadzie sesji 2026-11-23 (`catalog.mjs`, `inject3.js`, `shots3.mjs`, `galeria-3.html`), poza repo.
4. **Z5:** czy szczelinę przy pasku emotek poprawiamy w tej zmianie (jeśli po S-25 dalej jest widoczna)?
   **Decyzja Karola 2026-11-23 (zbliżenie 4× przed i po, rekomendacja „tak”): tak, w tej zmianie.** Zmierzone na `/dev/room-window?state=chat-reveal-host-gif` (i `chat-vote-guest-gif`), telefon 390×844: pasek emotek ma 69 px (przycisk 44 + `py-3` 24 + `border-t` 1, `EmoteBar.tsx:24-33`), a panel czatu stoi na `bottom-18` = 72 px (`RoomChat.tsx:96`), więc zostaje 3 px prześwitu strony. Makieta poprawki: pasek poniżej `lg` ma co najmniej 72 px (`min-h-18`, jak jego miejsce `h-18`), panel siada na jego górnej linii (szczelina 0). Klasę wybiera plan. Zbliżenia: `now-host-zoom.png`, `fix-host-zoom.png` w `s29-d3/` (scratchpad sesji 2026-11-23).

Do sprawdzenia przy planie, nie decyzje: hasło „emoji” w `context/domain/glossary.md`; czy `type="search"` na polu szukania jest potrzebne (zmienia rolę i lokator e2e).
