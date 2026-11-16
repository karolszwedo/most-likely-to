# Strona wejścia z linku: brief planu

> Full plan: `context/changes/join-page-ui/plan.md`
> Research: `context/changes/join-page-ui/research.md`

## What & Why

Strona `/j/<kod>` to pierwsze, co widzi ekipa po kliknięciu linku z Discorda. Dziś nie mówi, co to za gra, a link na Discordzie wygląda jak goły adres z losowymi znakami. Koniec gry ma dwa brzmienia i dwa wyglądy, a przy awarii serwera gość nie wie, co zrobić. Zmiana wdraża to, co Karol wybrał w galerii 16.11.2026.

## Starting Point

Strona składa się z karty z formularzem i ręcznie złożonych komunikatów (`src/pages/j/[token].astro:115-191`), a `<head>` ma sam `<title>` (`Layout.astro:14-19`). Zdanie o grze jest tylko na `/` i są to zasady (`Landing.astro:13-21`). Wspólny komunikat `RoomMessage.astro` nie ma ikony i nie trafi do wyspy React, więc ekran czekania ma własną kopię z innym tekstem.

## Desired End State

Nad kartą „Dołącz do gry” i „Poproś o wejście” stoi duże „Kto z nas najprawdopodobniej…?” i zdanie: „…zasnąłby na własnej imprezie? …nadałby imię swojemu odkurzaczowi? Wskażcie, kto z ekipy pasuje najbardziej. Głos jest anonimowy, wynik widzą wszyscy.” To samo zdanie jest na `/` i w karcie linku na Discordzie. Każdy komunikat `/j/` i `/r/` ma ikonę, koniec gry jedno brzmienie, a błąd przycisk „Odśwież stronę”. Karta przeglądarki ma nazwę z tytułu ekranu.

## Key Decisions Made

| Decyzja | Wybór | Dlaczego | Źródło |
| --- | --- | --- | --- |
| Zdanie o grze | B (nad kartą) + zdanie 1, też na `/` | Mówi, co to za gra, a nie zasady; formularz dalej bez przewijania | Galeria (Karol) |
| Karta na Discordzie | P1: „Most Likely To” / „Dołącz do gry” / tytuł + zdanie 1 | Tytuł mówi, co zrobić, opis, co to za gra | Galeria (Karol) |
| `theme-color` | ciemny `#1a1a1a` (tło gry), każda strona | Pasek Chrome na Androidzie w kolorze gry; na Discordzie pasek prawie niewidoczny | Planowanie (Karol) |
| Komunikaty | K1: jedno brzmienie końca gry, ikony | Jeden wygląd; ikona już stała na ekranie czekania | Galeria (Karol) |
| Ikony na `/r/` | tak, ten sam komponent | Jeden wygląd komunikatów w całej grze | Planowanie (Karol) |
| Błąd i karty przeglądarki | „Odśwież stronę”, tytuł karty = tytuł ekranu | Krok dalej przy awarii; martwy link nie zapowiada gry | Galeria (Karol) |
| Gdzie stoi zdanie o grze | tylko przy pierwszym wejściu („Dołącz”, „Poproś o wejście”) | Ekran czekania nic nie mówi o grze; e2e pilnuje tam braku tego tekstu | Plan |
| Komponent komunikatu | `RoomMessage.tsx` (React, ikona z zestawu) zamiast `.astro` | Jedna kopia dla Astro i wyspy `JoinWaiting` | Plan |
| Podgląd całego okna `/j/` | nowe `LinkScreen.astro` + `/dev/link-window` | Strona i podgląd renderują ten sam kod | Plan |
| Strażnik | krok smoke: karta P1 i brak id/kodu w `<head>` + próbny alarm | Karta to pierwsze wrażenie ekipy; podgląd nie może nieść danych pokoju | Plan |

## Scope

**In scope:**
- strona `/j/` (wszystkie stany), `/` dla niezalogowanego (zdanie);
- komunikaty `/r/` (ikony, „Odśwież stronę” przy błędzie);
- `<head>` (karta P1 na `/j/`, `theme-color` wszędzie);
- podglądy `/dev/room-states` i nowe `/dev/link-window`, zasada w `AGENTS.md`;
- krok smoke, PR.

**Out of scope:**
- obrazek karty, logo, ikona i manifest (punkt J);
- dane pokoju przed wejściem (migracja);
- kolor przycisków;
- ekrany awarii w pokoju (`RoomErrorBoundary`, `RoomScreen:106`);
- tekst `room_closed`, testy zrzutów, nowe e2e.

## Architecture / Approach

Treści w `game-intro.ts` (tytuł gry, zdanie 1, karta P1) i `link-page.ts` (stany strony, tytuły kart, `GAME_OVER`, `DEAD_LINK`). `GameIntro.astro` składają `/` i `/j/`. `RoomMessage.tsx` renderuje się na serwerze z Astro i w wyspie `JoinWaiting`. Zawartość `<main>` strony linku przechodzi do `LinkScreen.astro`, a `[token].astro` zostaje przy ładowaniu danych, statusach i ciasteczkach. `Layout.astro` dostaje opcjonalny `preview` (znaczniki `og:`) i stały `theme-color`.

## Phases at a Glance

| Faza | Co daje | Główne ryzyko |
| --- | --- | --- |
| 1. Strona `/j/` w kodzie gry | wygląd z galerii na prawdziwej stronie, `/` i `/r/` | przeniesienie `<main>` do `LinkScreen` zmieni coś w zachowaniu formularza albo wysp |
| 2. Podglądy i zrzuty | `/dev/link-window`, nowe próbki, zasada w `AGENTS.md`, akceptacja Karola | ikony `/r/` i reguła „gdzie zdanie o grze” do korekty na zrzutach |
| 3. Strażnik karty, PR i wdrożenie | krok smoke z alarmem, dokumenty, produkcja, karta na Discordzie | Discord przez 30 min pokazuje starą kartę (`?v=2`) |

**Prerequisites:** gałąź `join-page-ui` (lokalnie, bez upstreamu), prototyp galerii do usunięcia w Fazie 2.
**Estimated effort:** 2–3 sesje (kod, zrzuty, PR z alarmem).

## Open Risks & Assumptions

- Zakładamy, że Discord robi kartę tekstową bez obrazka, gdy są `og:title` i `og:description`. Sprawdzi to Karol z `?v=2` po wdrożeniu (3.4).
- Przeglądarka w aplikacji Discorda może nie stosować `theme-color` do paska. Wtedy ciemny pasek widać tylko w Chrome.
- e2e szuka `h1` po dokładnym tekście: tytuły kart i komunikatów muszą zostać `h1`.

## Success Criteria (Summary)

- Ktoś z ekipy po kliknięciu linku od razu wie, że to gra „Kto z nas najprawdopodobniej…?” i że głos jest anonimowy.
- Link na Discordzie wygląda jak zaproszenie do gry, nie jak przypadkowy adres.
- Każdy martwy albo zakończony link mówi to samo w jednym wyglądzie, a awaria ma krok dalej.
