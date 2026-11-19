# Lepiej widoczne dymki emotek i odrobinę większy pasek — Plan Brief

> Full plan: `context/changes/emote-visibility/plan.md`

## What & Why

Po pierwszej grze ze znajomymi (2026-10-26) emotki działały, ale dymki na dole ekranu były mało widoczne, a pasek
emotek mógłby być ciutkę większy. Poprawiamy sam wygląd, żeby emotki było widać w trakcie gry.

## Starting Point

Dymek to mała pigułka w kolorze karty (prawie jak tło) z emotką ok. 18 px, w prawym dolnym rogu, przez 3 s. Pasek ma
sześć przycisków po 36 px, na telefonie przyklejony do dołu okna, od 1280 px pionowo przy prawej krawędzi (wybór Karola
z S-16).

## Desired End State

Dymki w wybranym przez Karola wariancie są dobrze widoczne na telefonie i laptopie (większa emotka, czytelny nick, kolor
gracza, wyraźne tło). Przyciski paska są odrobinę większe, a na telefonie od 360 px wciąż stoją w jednym rzędzie.
Zachowanie emotek bez zmian.

## Key Decisions Made

| Decision           | Choice                                                           | Why (1 sentence)                                       |
| ------------------ | ---------------------------------------------------------------- | ------------------------------------------------------ |
| Zakres             | Dymki (wyraźnie) + pasek (ciutkę); kciuki bez zmian              | Tak brzmiały uwagi z gry.                              |
| Wygląd dymków      | Wybór Karola na zrzutach: w rogu większe / u góry / unoszące się | Wygląd ekranu zawsze wybiera Karol.                    |
| Pasek na telefonie | Sześć przycisków w jednym rzędzie od 360 px                      | Większe przyciski nie mogą zawinąć paska na dwa rzędy. |
| Zachowanie         | 3 s dymku, 3 s przerwy, 5 dymków, nick — bez zmian               | Działało w grze; zmieniamy tylko widoczność.           |
| Serwer i baza      | Bez zmian                                                        | Zmiana wyłącznie w wyglądzie dwóch komponentów.        |

## Scope

**In scope:**

- Większe przyciski i emotki w pasku (`EmoteBar.tsx`)
- Nowy wygląd i miejsce dymków (`EmoteBubbles.tsx`), w razie potrzeby klasy koloru gracza i animacja w `global.css`
- Podglądy w `/dev/room-states` i `/dev/room-window`

**Out of scope:**

- Czas dymku, przerwa paska, limit dymków, lista emotek, nick
- Kciuki, serwer, kanał na żywo, baza, dźwięk i wibracje

## Architecture / Approach

Jak przy S-16: tymczasowy przełącznik trzech wariantów dymków w `/dev/room-window`, zrzuty i strona „Co oceniasz” w
Chrome Karola; po wyborze zostaje jeden wariant. Test E2E emotek czyta komunikat dla czytnika ekranu, nie dymek, więc
zostaje bez zmian.

## Phases at a Glance

| Phase                          | What it delivers                                | Key risk                                         |
| ------------------------------ | ----------------------------------------------- | ------------------------------------------------ |
| 1. Warianty, wybór i wykonanie | Większy pasek, wybrany wariant dymków, podglądy | Na 360 px pasek się zawinie; dymek zasłoni treść |
| 2. Wdrożenie                   | PR, CI, scalenie, smoke, sprawdzenie w grze     | —                                                |

**Prerequisites:** S-16 wdrożone (PR #27).
**Estimated effort:** ok. jedna sesja, 2 fazy.

## Open Risks & Assumptions

- Wariant „u góry ekranu” może przykryć pytanie albo baner; dymki nie łapią dotknięć, ale zrzuty muszą pokazać, że tekst
  pytania zostaje czytelny.
- Wariant „unoszące się” na zrzucie widać tylko w jednym momencie lotu; opis ruchu na stronie „Co oceniasz”.

## Success Criteria (Summary)

- W najbliższej grze emotki znajomych widać od razu, na telefonie i laptopie.
- Pasek wygodniej się klika, a nic nie przeszkadza hostowi w prowadzeniu gry.
