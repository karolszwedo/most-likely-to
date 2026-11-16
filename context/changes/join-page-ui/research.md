---
date: 2026-11-16T09:29:45+01:00
researcher: Claude (Opus 5.5) z Karolem
git_commit: 76f7f1d7882d2de966dfac8a129499adf8350b7c
branch: join-page-ui
repository: most-likely-to
topic: "Audyt /10x-ui strony wejścia z linku (/j/<kod>): zarzuty, macierz 7 stanów, granice dla wariantów"
tags: [research, join-page-ui, 10x-ui, JoinForm, JoinWaiting, RoomMessage, Layout, discord, open-graph, room-states]
status: complete
last_updated: 2026-11-16
last_updated_by: Claude (Opus 5.5)
---

# Research: audyt /10x-ui strony wejścia z linku

**Date**: 2026-11-16T09:29:45+01:00
**Researcher**: Claude (Opus 5.5) z Karolem
**Git Commit**: 76f7f1d7882d2de966dfac8a129499adf8350b7c
**Branch**: join-page-ui
**Repository**: most-likely-to

## Research Question

Audyt `/10x-ui` jednego widoku, strony linku do pokoju `/j/<kod>` (`src/pages/j/[token].astro` z `RoomCard.astro`, `JoinForm.tsx`, `JoinWaiting.tsx`, `RoomMessage.astro`, `AppHeader.astro`, `Layout.astro`), w dwóch kierunkach (źródło → widoki, widok → źródło): 3–5 zarzutów z plikiem:linią i wpływem na gracza. Pytanie wprost: co widzi ktoś, kto pierwszy raz klika link z Discorda na telefonie (podgląd linku, strona i jej stany). Do tego macierz 7 stanów dziś i granice dla wariantów galerii.

## Summary

- **Kontrakt stoi.** Skan literałów z `/10x-ui` na 7 plikach widoku dał 0 trafień, a `scripts/ui-literals.mjs:17-18` pilnuje `[token].astro` i całego `src/components/room/` (bez `Layout.astro`). Widok składa się z `Card`, `Button`, `FieldGroup`, `Spinner` z `src/components/ui` i z `FormField`, `ServerError`, `SubmitButton` z `src/components/auth`. Tak jak przy odsłonie problem leży w tym, co strona mówi, a nie w kolorach.
- **Nowa osoba nie dowiaduje się, co to za gra (Z1).** Karta mówi „Dołącz do gry” i „Wpisz nick i jesteś w grze”, nagłówek to angielskie „Most Likely To”. Zdanie o grze i o anonimowym głosie jest w repo, ale tylko na `/` dla niezalogowanego (`Landing.astro:14-17`).
- **Podgląd linku na Discordzie jest pusty (Z2).** Strona ma sam `<title>`. Discord bierze `<title>` tylko w parze z `<meta name="description">`, a bez obrazka najpewniej nie pokaże karty wcale (dokumentacja Discorda, niżej). Ekipa widzi więc goły adres z 22 znakami kodu.
- **Koniec gry ma na tej stronie trzy brzmienia i dwa wyglądy (Z3)**, bo wyśrodkowany komunikat jest złożony ręcznie w 5 miejscach repo, z tego 3 na tej stronie.
- **Ekran błędu i tytuł karty (Z4)**: błąd otwarcia (500/503) nie ma podglądu ani kroku dalej, a karta przeglądarki mówi „Dołącz do gry” także dla linku, który nie działa.
- **Granice:** strona przed wejściem zna tylko status pokoju i jego id, więc nick hosta czy liczba graczy to migracja i pełny cykl, nie ta zmiana. Znaczniki podglądu bez danych pokoju (decyzja z S-01). Kolumna 512 px, motyw Graphite, układ C przy zajętym nicku, teksty T2 i „prowadzący” zostają, chyba że Karol zdecyduje inaczej na zrzutach.

## Charges

Każdy zarzut ma plik:linię, kategorię i jedno zdanie o wpływie na gracza. Zrzuty z 16.11: `/dev/room-states#join-*` w oknie 390×844, skala 1 (11 próbek: `join-default`, `join-nick-taken`, `join-pending`, `join-unknown`, `join-closed`, `join-request`, `join-request-waiting`, `join-request-waiting-error`, `join-request-rejected`, `join-request-closed`, `join-remembered`). Pliki leżą w scratchpadzie sesji i nie są w repo.

### Z1: strona nie mówi nowej osobie, co to za gra (przypadkowa architektura: punkt wejścia)

- **Gdzie:** `src/pages/j/[token].astro:119-126`: tytuł „Dołącz do gry” i opis „Wpisz nick i jesteś w grze. Konto nie jest potrzebne.”; `src/components/room/AppHeader.astro:32`: nazwa „Most Likely To” zwykłym tekstem (dla gościa bez linku, `:5-7`).
- **Dowód:** zdanie o grze istnieje w `src/components/room/Landing.astro:14-17` („Kto z nas najprawdopodobniej…?” i „Wszyscy widzą to samo pytanie, każdy oddaje jeden anonimowy głos, a wynik pojawia się po ostatnim głosie.”), ale `Landing` renderuje tylko `/` dla kogoś niezalogowanego (`Landing.astro:4`). Na `/j/` (zrzut `join-default`) nie ma ani nazwy gry po polsku, ani słowa o anonimowym głosie.
- **Wpływ:** ktoś z ekipy, kto nie grał, wpisuje nick, nie wiedząc, co się zaraz stanie ani że nikt nie zobaczy, na kogo głosował.
- **Kierunek:** do galerii. Jedno źródło zdania o grze dla `/` i `/j/` (wspólny komponent albo stała), a nie druga kopia tekstu.

### Z2: podgląd linku na Discordzie jest pusty (przypadkowa architektura: punkt wejścia)

- **Gdzie:** `src/layouts/Layout.astro:14-19`: w `<head>` tylko `charset`, `viewport`, ikona i `<title>`; `[token].astro:116`: `title="Dołącz do gry"` dla każdego stanu.
- **Dowód (dokumentacja Discorda, https://docs.discord.com/developers/link-previews/overview):**
  - `<title>` i `<meta name="description">` są używane tylko razem i tylko wtedy, gdy strona nie ma tytułu ani opisu z Open Graph lub Twitter, więc sam `<title>` nie daje tekstu;
  - bez obrazka strona najpewniej nie dostaje karty wcale (niepotwierdzone: dokumentacja nie mówi, co Discord robi, gdy nic nie znajdzie; do sprawdzenia w Embed Debuggerze `https://discord.com/developers/embeds`);
  - Discord czyta `og:title` (do 70 bajtów, ok. 60 polskich znaków), `og:description` (do 350 bajtów), `og:site_name` (nad tytułem), `og:image` (PNG, JPG, WebP, AVIF, GIF; SVG nie), `twitter:card` (`summary_large_image` = duży obrazek), `theme-color` (tylko `#RRGGBB` albo `#RRGGBBAA`);
  - kartę robi tylko odpowiedź 2xx (404 i 410 bez karty), przechodzi do 5 przekierowań, nie uruchamia JavaScriptu, a kartę trzyma ok. 30 minut (świeżą wymusza `?v=2` na końcu linku).
- **Wpływ:** ekipa widzi na Discordzie goły adres `…workers.dev/j/` z 22 losowymi znakami, bez nazwy gry, więc link wygląda jak przypadkowy.
- **Kierunek:** karta tekstowa (`og:title`, `og:description`, `og:site_name`, `theme-color`) bez danych pokoju jest w zasięgu tej zmiany. Obrazek (`og:image` 1200×630 PNG) łączy się z punktem J kolejki (ikona) i z odłożonym logo (`context/archive/2026-10-04-ui-signin-contract/change.md:20`). `theme-color` to kolor zapisany heksadecymalnie w `Layout.astro`, który leży poza skanem `ui-literals`, więc plan musi go wyprowadzić z tokenu `--background` i zapisać źródło obok.

### Z3: koniec gry ma trzy brzmienia i dwa wyglądy (brakujący współdzielony komponent)

- **Gdzie:** wyśrodkowany komunikat (`flex flex-col items-center gap-4 py-12 text-center`) złożony ręcznie w 5 miejscach: `src/components/room/RoomMessage.astro:17`, `JoinWaiting.tsx:222`, `JoinWaiting.tsx:231`, `RoomErrorBoundary.tsx:64`, `RoomScreen.tsx:106`. Na tej stronie trzy z nich (`RoomMessage` i oba ekrany `JoinWaiting`). `RoomMessage` to plik `.astro`, więc wyspa React go nie zaimportuje.
- **Dowód:** koniec gry na tej stronie brzmi: „Ta gra już się skończyła.” (strona 410, `[token].astro:185`), „Ta gra jest zamknięta. Poproś hosta o nowy link.” (odmowa formularza `room_closed`, `src/lib/rooms/errors.ts:68`) i „Gra się skończyła.” z ikoną drzwi (`JoinWaiting.tsx:222-226`). Ikona stoi tylko na ekranach czekania (`JoinWaiting.tsx:223`, `:232`), a `RoomMessage` (link nieznany, gra skończona, błąd) jej nie ma (zrzuty `join-unknown`, `join-closed` wobec `join-request-waiting`, `join-request-closed`).
- **Wpływ:** spóźniony, który czekał na wpuszczenie, i ktoś, kto otworzył link po grze, dostają tę samą wiadomość innymi słowami i w innym wyglądzie.
- **Kierunek:** jeden komponent komunikatu dla tej strony (wersja React, z której korzysta też `RoomMessage`, albo wspólne klasy w module jak `room-frame.ts`) i jedno brzmienie końca gry do wyboru przez Karola. `RoomErrorBoundary` i `RoomScreen` to ekrany pokoju: poza tą zmianą (deferred), chyba że plan pokaże, że wspólny komponent obejmie je bez zmiany wyglądu.

### Z4: ekran błędu bez kroku dalej i tytuł karty niezgodny ze stanem (przypadkowa architektura, drobne)

- **Gdzie:** `[token].astro:186-188`: „Nie udało się otworzyć linku.” z tekstem z `roomErrorMessage` (500/503, `:86-88`), bez przycisku i bez podglądu w `/dev/room-states` (11 próbek `join-*` nie obejmuje błędu); `[token].astro:116`: tytuł karty przeglądarki „Dołącz do gry” także przy 404, 410 i błędzie.
- **Wpływ:** przy chwilowej awarii gość nie wie, czy odświeżyć, a karta przeglądarki zapowiada dołączenie do gry, która nie istnieje.
- **Kierunek:** podgląd stanu błędu, ewentualnie przycisk „Spróbuj jeszcze raz” (zwykłe przeładowanie, GET niczego nie zmienia) i tytuł karty zależny od stanu. Niski priorytet; plan może go odroczyć z powodem.

### Odrzucone przy audycie

- **Szary przycisk „Dołącz”.** Główny przycisk ma `primary` z motywu Graphite (`src/styles/global.css:66`, `oklch(0.7058 0 0)`), a stan zajętości to ten sam przycisk z `opacity-50` i kręciołkiem (zrzuty `join-default`, `join-pending`). To wybór Karola dla całej aplikacji (`context/archive/2026-10-04-ui-signin-contract/theme.md:27-28`): kolor gry może dojść później tylko do ważnych akcji. Zmiana `--primary` albo nowy token akcji dotyka wszystkich ekranów, więc nie w tej zmianie; ewentualnie razem z logo.
- **Pusta dolna część ekranu na telefonie.** Formularz zajmuje górę okna 390×844, reszta jest pusta (`[token].astro:118`, `py-8`). To naturalne dla krótkiego formularza w kolumnie 512 px (decyzja `room-wide-layout`, niżej). Wypełni się samo, jeśli galeria doda zdanie o grze (Z1).

## Macierz 7 stanów (stan dzisiejszy)

| Stan          | Gdzie widać dziś                                                                                                                                                    | Czego brakuje                                                                              |
| ------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------ |
| default       | `join-default`, `join-request`, `join-remembered` (nick z S-14); powrót „To ty?” w sekcji `return-*` (`room-states.astro:2690+`)                                    | całe okno strony (nagłówek + `main`) na telefonie: `/dev/room-window` obejmuje tylko `/r/` |
| hover         | `join-default` opisany do ręcznego najechania („domyślny · hover · focus-visible”)                                                                                  | stan wymuszony do zrzutu                                                                   |
| focus-visible | jak hover (Tab ręcznie); po przekierowaniu z błędem fokus na `[data-server-error]` (`RoomCard.astro:27-31`)                                                         | stan wymuszony do zrzutu                                                                   |
| disabled      | `join-pending`: przycisk wyłączony z kręciołkiem „Dołączanie…”; powrót `return-pending`                                                                             | nic                                                                                        |
| error         | `join-nick-taken` (błąd serwera w `destructive` przez `ServerError`), błąd pola z `getNickError` (`JoinForm.tsx:65-70`), `join-request-waiting-error` (`aria-live`) | strona błędu 500/503 „Nie udało się otworzyć linku.” (Z4)                                  |
| empty         | N/A dla formularza (puste pole to `default`); najbliżej: `join-unknown` i `join-closed` (link bez pokoju)                                                           | nic poza Z3 (dwa wyglądy końca gry)                                                        |
| loading       | `join-pending` (wysyłanie), `join-request-waiting` (czekanie na prowadzącego: klepsydra, sam przechodzi do gry)                                                     | strona renderuje się na serwerze, więc bez stanu ładowania samej strony (N/A)              |

## Granice dla wariantów (czego wygląd nie może zgubić)

**Dane i prywatność**

- `GET /j/<kod>` niczego nie zmienia, bo bot Discorda pobiera link do podglądu; tytuł i znaczniki OG bez danych pokoju (adwokat diabła w S-01: `context/archive/2026-10-07-room-lobby/plan.md:53`, `:374`; `[token].astro:14-15`). Smoke otwiera link 3 razy i oczekuje 200 bez ciasteczka gracza (`scripts/smoke.mjs:999`, `context/foundation/test-plan.md:68`).
- Przed wejściem strona zna tylko status pokoju i jego id (`room_link`: `supabase/migrations/20261014101922_first_live_round.sql:384-413`, `src/lib/rooms/server.ts:161-175`). Nick hosta, liczba graczy czy kategorie wymagałyby nowej funkcji dla `anon`, czyli migracji i pełnego cyklu (`AGENTS.md`, Hard Rules i Conventions). W tej zmianie: nie.
- Ekran czekania pokazuje tylko nick, z którym gość prosi, nigdy nic z gry ani pytania (`JoinWaiting.tsx:14-15`, `context/archive/2026-10-22-latecomer-admission/research.md:136`, `context/foundation/lessons.md`, „Pytania gry tylko po stronie serwera”).
- Nick nigdy w adresie ani w logu; błędy jako kody `?error=` z polskimi tekstami (`src/lib/rooms/errors.ts`, `JoinForm.tsx:29-39`).
- Imię, nazwisko i mail Karola nigdzie na stronie ani w znacznikach (bez `author`/kontaktu w `<head>`).

**Wygląd i teksty, które wybrał Karol**

- Kolumna 512 px (`max-w-lg`) dla `/j/` i jej nagłówka: krótkim formularzom wąska kolumna nie szkodzi (`context/archive/2026-10-15-room-wide-layout/plan.md:62`); `AppHeader` bez `wide` (`AppHeader.astro:12-19`).
- Motyw Graphite, promień 0.75rem, bez nowych kolorów poza tokenami (`ui-signin-contract/theme.md:27-28`, `AGENTS.md` §UI). `RoomCard` dzieli z „Nową grą” na `/` (`RoomCard.astro:4`): jego zmiana zmienia też stronę główną.
- 25 stanów S-01 zaakceptowanych 08.10 („Nie mam zastrzeżeń”, `room-lobby/change.md:18`), w tym nazwa gry w nagłówku w jednej linijce.
- Układ C przy zajętym nicku: „<nick> już gra w tym pokoju. To ty…?” i główny „Tak, to ja. Poproś o powrót”, potem „albo…” i formularz innego nicku z przyciskiem `outline` (`JoinForm.tsx:72-75`, `context/changes/rejoin-after-refresh/plan.md:385`).
- Link nieznany: tekst T2 „Ten link nie działa.” / „Sprawdź, czy skopiował się cały, albo poproś hosta o nowy.” (`context/changes/remove-player-new-link/plan.md:414`), ten sam dla literówki, starego linku i skasowanej gry.
- Gra w toku: „Poproś o wejście”, ekran czekania, „Poproś jeszcze raz” z poprzednim nickiem, bez timera i bez wygasania (`latecomer-admission/plan.md:20-25`, `:41`, zrzuty zaakceptowane `:470`).
- Teksty mówią „prowadzący” tam, gdzie może działać host albo współhost (`context/changes/co-host-role/plan.md:23`). Wyjątek: „poproś hosta o nowy link” w T2 i przy końcu gry (wybrany po S-09; do potwierdzenia przy Z3).
- Zapamiętany nick: pole z serwera puste, nick dochodzi po zamontowaniu, nigdy nie nadpisuje wpisanego, puste po `nick_taken` (`context/archive/2026-10-25-remembered-nick/plan.md:25-29`). Bez wyboru koloru przy wejściu (`context/changes/player-color-choice/research.md:123`).
- Ruch tylko pod `motion-safe:`, nigdy nie odlicza czasu (`AGENTS.md` §UI).

**Testy, które pilnują znaczników i tekstów**

- e2e szuka nagłówków poziomu 1 po dokładnym tekście i pól po etykiecie: `tests/e2e/support/room.ts:91-93`, `:131`, `:136`, `:155`, `:177`, `:182`; `latecomer.spec.ts:37`, `game.spec.ts:208`, `remembered-nick.spec.ts:12`, `:72`. Projekt `phone` (390×844) przechodzi przez `/j/` (`playwright.config.ts:41-45`).
- Smoke czyta HTML: „Kuba</span> już gra w tym pokoju” i „Tak, to ja. Poproś o powrót” (`scripts/smoke.mjs:415`) oraz kody 302/404/410/500/503 (`:637`, `:827-842`).
- `tests/unit/room-rpc-gate.test.ts:295`, `:301`.
- Fokus po przekierowaniu z błędem na `[data-server-error]` (`RoomCard.astro:27-31`); błędny nick przenosi fokus do pola (`JoinForm.tsx:101-106`). Na prawdziwej stronie tytuły to `h1`, w podglądach `h2`.
- `src/components/ui/field.tsx:50-54` ma lokalną poprawkę `w-px`; `shadcn add field --overwrite` przywróciłby przewijanie w bok przy 320–390 px.
- Testów zrzutów brak (`context/foundation/test-plan.md:440`): bramka wizualna to podglądy `/dev/room-states` i zrzuty dla Karola.

## Code References

- `src/pages/j/[token].astro:14-21`: zasady strony (GET, Discord, stany)
- `src/pages/j/[token].astro:33-75`: `loadPage`, rodzaje strony
- `src/pages/j/[token].astro:79-88`: kody 302/404/410/500/503
- `src/pages/j/[token].astro:115-191`: układ i wszystkie stany
- `src/layouts/Layout.astro:14-19`: `<head>` bez znaczników podglądu
- `src/components/room/Landing.astro:13-21`: zdanie o grze na `/`
- `src/components/room/JoinForm.tsx:44-63`: teksty trzech wariantów; `:112-200`: formularz i układ C
- `src/components/room/JoinWaiting.tsx:220-249`: ekrany czekania i końca gry
- `src/components/room/RoomMessage.astro:16-19`, `RoomCard.astro:15-31`, `AppHeader.astro:22-42`
- `src/lib/rooms/errors.ts:68`: `room_closed`
- `src/lib/rooms/server.ts:161-175`: `roomLink` (status i id pokoju)
- `src/pages/dev/room-states.astro:967-1070`: sekcja „Link gościa (/j/…)”

## Architecture Insights

- **Strona jest serwerowa,** a wyspy React to tylko formularz i ekran czekania. Zdanie o grze, karta Discorda i komunikaty mogą zostać w Astro bez kosztu JS; znaczniki podglądu muszą być w HTML z serwera, bo Discord nie uruchamia JavaScriptu.
- **`Layout.astro` obsługuje wszystkie strony.** Znaczniki podglądu warto dać przez propsy (domyślne ogólne, `/j/` własne), żeby `/`, `/gry` i `/r/` nie dostały opisu zaproszenia.
- **Wspólny komunikat:** `RoomMessage` jest w Astro, a dwa ekrany `JoinWaiting` i dwa ekrany pokoju w React. Najmniejsza droga to jeden komponent React bez stanu (renderowany na serwerze także bez `client:*`) albo wspólna stała klas w `room-frame.ts`; wybór zostawiam planowi.

## Historical Context (from prior changes)

- `context/archive/2026-10-07-room-lobby/` (S-01): strona `/j/` powstała tu; GET bez zmian i bez danych w OG (`plan.md:53`, `:374`), test na telefonie z Discorda: ok. 10 s do wejścia na Androidzie (`phone-test.md:29`); iOS Discord z osobnymi ciasteczkami niesprawdzony (`phone-test.md:39`), otwarte ryzyko poza tą zmianą.
- `context/archive/2026-10-04-ui-signin-contract/` (pierwszy kontrakt UI): motyw Graphite; logo z nazwą gry odłożone do osobnej zmiany UI dla wszystkich ekranów (`change.md:20`), dotąd niezrobione.
- `context/archive/2026-10-15-room-wide-layout/` (poprzedni `/10x-ui`): `/j/` zostaje w 512 px; galeria najwyżej 4 wariantów z prawdziwymi komponentami.
- `context/archive/2026-10-22-latecomer-admission/` (S-08), `context/changes/rejoin-after-refresh/` (S-04), `context/changes/remove-player-new-link/` (S-09), `context/archive/2026-10-25-remembered-nick/` (S-14): stany i teksty, które Karol zaakceptował na zrzutach (wyżej, „Granice”).
- `context/changes/reveal-ui/` (ostatni `/10x-ui`, 15–16.11): wzór procesu (zarzuty → galeria → plan → alarm); zasada ruchu w `AGENTS.md` §UI.

## Related Research

- `context/changes/reveal-ui/research.md`: ten sam układ audytu dla odsłony wyniku
- `context/archive/2026-10-15-room-wide-layout/research.md`: zarzuty szerokiego układu

## Open Questions

Decyzje Karola na zrzutach, przed planem (galeria 3–4 wariantów, głównie telefon w prawdziwej wielkości):

1. **Zdanie o grze (Z1):** na przykład (A) dzisiejszy układ plus jedno zdanie z `Landing` pod tytułem; (B) tytuł „Kto z nas najprawdopodobniej…?” nad kartą i zdanie o anonimowym głosie, karta „Dołącz do gry” niżej; (C) trzy krótkie kroki pod przyciskiem (to samo pytanie → anonimowy głos → wynik po ostatnim głosie); (D) bez zmian.
2. **Karta na Discordzie (Z2):** treść `og:title` i `og:description` (np. „Most Likely To: dołącz do gry” i zdanie o grze), tylko tekst teraz, obrazek razem z punktem J (ikona). Sprawdzenie po wdrożeniu w Discordzie z `?v=2`.
3. **Koniec gry (Z3):** jedno brzmienie dla trzech dróg (np. „Ta gra już się skończyła.” + „Poproś hosta o nowy link.”) i czy komunikaty mają ikonę (jak dziś ekrany czekania) czy nie (jak dziś `RoomMessage`).
4. **Z4:** przycisk „Spróbuj jeszcze raz” przy błędzie i tytuł karty zależny od stanu: robić teraz czy odroczyć.
