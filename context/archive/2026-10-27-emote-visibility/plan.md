# Lepiej widoczne dymki emotek i odrobinę większy pasek — plan implementacji

## Overview

Po pierwszej grze ze znajomymi (2026-10-26) emotki działały, ale dymki na dole ekranu były mało widoczne, a pasek emotek
mógłby być odrobinę większy. Zmieniamy tylko wygląd dymków (wariant wybrany przez Karola na zrzutach) i powiększamy
przyciski paska; zachowanie emotek, serwer i baza zostają bez zmian.

## Current State Analysis

- Dymek to mała pigułka `bg-card` z obwódką, nick `text-sm`, emotka `text-lg` (ok. 18 px) i kropka `size-2.5` w kolorze
  gracza (`src/components/room/EmoteBubbles.tsx:51-63`). W ciemnym motywie karta prawie zlewa się z tłem.
- Dymki stoją w prawym dolnym rogu: na telefonie nad paskiem przyklejonym do dołu okna (`bottom-20`), od `lg` w rogu
  okna, od `xl` na lewo od pionowego paska (`EmoteBubbles.tsx:14-16`). Wszyscy patrzą wtedy na pytanie u góry ekranu.
- Dymek znika po `EMOTE_SHOW_MS` (3 s), na ekranie jest ich najwyżej `EMOTE_MAX_SHOWN` (5) (`src/lib/rooms/emotes.ts:26-30`).
- Przyciski paska to `Button size="icon"` (`size-9`, 36 px) z emotką `text-lg`, w rzędzie z napisem „Emotki”
  (`src/components/room/EmoteBar.tsx:84-106`); slot na telefonie ma `h-16`, żeby koniec widoku nie chował się pod paskiem
  (`EmoteBar.tsx:25`).
- Na telefonie 360 px (kolumna 328 px) dzisiejszy rząd ma ok. 323 px; przy przyciskach 40 px z napisem obok byłoby
  ok. 347 px, więc rząd by się zawinął.
- Test E2E (`tests/e2e/emotes.spec.ts`) znajduje pasek po nazwie grupy „Emotki” i przyciskach, sprawdza
  `toBeInViewport()` przycisków, a emotkę czyta z regionu sr-only, nie z dymku (`aria-hidden`); wygląd dymku go nie dotyczy.

## Desired End State

- Dymki są dobrze widoczne na telefonie i laptopie w wariancie wybranym przez Karola: większa emotka, czytelny nick,
  kolor gracza i tło odcinające się od strony.
- Przyciski paska są odrobinę większe, z większą emotką; na telefonie od 360 px sześć przycisków mieści się w jednym
  rzędzie, a koniec widoku nie chowa się pod paskiem.
- Zachowanie bez zmian: 3 s dymku, przerwa 3 s paska, najwyżej 5 dymków, nick nadawcy, komunikat dla czytnika ekranu,
  dymki nie łapią dotknięć, fokus po ruchu hosta w tytule widoku.

### Key Discoveries:

- Kolor gracza w dymku pochodzi z `seatColors(players)` i listy `SLICE_DOTS` (`src/components/room/chart-colors.ts`);
  obwódka albo tło w kolorze gracza wymaga nowej listy pełnych nazw klas obok `SLICE_DOTS` (Tailwind generuje tylko klasy
  wypisane w kodzie).
- Animacje wejścia idą z `tw-animate-css` (`src/styles/global.css:2`) pod `motion-safe:`; własny ruch (np. unoszenie)
  wymaga `@keyframes` i zmiennej `--animate-*` w `@theme` w `global.css`, nie wartości dowolnej w widoku.
- `scripts/ui-literals.mjs` sprawdza cały `src/components/room/` oraz `/dev/room-states` i `/dev/room-window`: same tokeny
  i klasy ról, bez wartości dowolnych; wysokości ze skali Tailwinda (np. `h-17`) są dozwolone.
- Podglądy: `/dev/room-states` 91–95 (pasek w spoczynku, przerwa, odmowa, 3 i 5 dymków, w ramce ekranu) i
  `/dev/room-window` (`vote-guest-emotes`, `reveal-host-emotes`, `reveal-guest-emote-refused`, w całym oknie)
  (`src/pages/dev/room-window.astro:320-336`).

## What We're NOT Doing

- Bez zmian czasu dymku (3 s), przerwy paska (3 s), limitu 5 dymków, listy sześciu emotek i nicku przy emotce.
- Bez zmian kciuków na odsłonie (bez uwag po grze).
- Bez zmian serwera, kanału na żywo, bazy i smoke; bez dźwięku, wibracji i historii emotek.
- Bez nowych testów logiki: zmiana nie ma logiki; strażnikiem wyglądu są zrzuty.

## Implementation Approach

Jak przy S-16: najpierw tymczasowy przełącznik trzech wariantów dymków w `/dev/room-window`, zrzuty i strona „Co
oceniasz” w Chrome Karola; pasek jest powiększony tak samo we wszystkich wariantach. Po wyborze przełącznik znika,
zostaje wybrany wariant, a podglądy pokazują go w ramce i w oknie.

## Faza 1: Warianty, wybór i wykonanie

### Overview

Większy pasek, trzy warianty dymków na zrzutach do wyboru Karola, wybrany wariant w kodzie, podglądy i zielona bramka.

### Changes Required:

#### 1. Większy pasek

**File**: `src/components/room/EmoteBar.tsx`

**Intent**: Przyciski odrobinę większe (ok. 40–44 px) z większą emotką, tak żeby na telefonie od 360 px sześć przycisków
stało w jednym rzędzie (np. napis „Emotki” tylko dla czytnika ekranu na wąskim ekranie albo mniejsze odstępy; wybór na
zrzutach); slot na telefonie rośnie razem z paskiem; pionowy pasek od `xl` dopasowany do nowych przycisków.

**Contract**: grupa nadal ma nazwę „Emotki” (`aria-labelledby`), przyciski te same nazwy i `aria-disabled` w przerwie;
klasy ze skali Tailwinda i tokenów.

#### 2. Warianty dymków (tymczasowe)

**File**: `src/components/room/EmoteBubbles.tsx`, `src/pages/dev/room-window.astro`, zrzuty w scratchpadzie

**Intent**: Trzy warianty przez tymczasowy przełącznik `?bubbles=<1|2|3>` w `/dev/room-window`: (1) „Większe w rogu” —
to samo miejsce, duża emotka, większy nick, obwódka w kolorze gracza na wyraźniejszym tle; (2) „U góry ekranu” — stos
dymków pod nagłówkiem, przy pytaniu; (3) „Unoszące się” — duża emotka z nickiem płynie z dołu w górę wzdłuż prawej
krawędzi i gaśnie w ciągu `EMOTE_SHOW_MS`, przy ograniczeniu ruchu stoi w miejscu. Zrzuty: telefon 390×844 ×2 i 360 px,
laptop jako całe okno 1536×750, plus 1280 px dla pionowego paska; strona „Co oceniasz” w Chrome Karola.

**Contract**: wybór Karola zapisany w tym planie (Progress 1.3) przed wykonaniem ostatecznym.

#### 3. Wybrany wariant

**File**: `src/components/room/EmoteBubbles.tsx`, w razie potrzeby `src/components/room/chart-colors.ts` i
`src/styles/global.css`

**Intent**: Zostaje tylko wybrany wariant, przełącznik i pozostałe warianty usunięte; komentarz komponentu opisuje nowe
miejsce i wygląd z datą wyboru Karola.

**Contract**: bez zmian: `aria-hidden` i `pointer-events-none` nakładki, region sr-only „<nick>: <nazwa emotki>”, kolor z
`seatColors`, ruch tylko pod `motion-safe`; nowa lista klas w kolorze gracza (jeśli potrzebna) jako pełne nazwy klas obok
`SLICE_DOTS`; własna animacja jako `--animate-*` w `@theme`.

#### 4. Podglądy

**File**: `src/pages/dev/room-states.astro`, `src/pages/dev/room-window.astro`

**Intent**: Stany 91–95 i próbki emotek w oknie pokazują nowy pasek i dymki; akapit wstępu poprawiony, jeśli opisuje
miejsce dymków.

**Contract**: numeracja i klucze `?state=` bez zmian.

### Success Criteria:

#### Automated Verification:

- Bramka zielona: `npm run lint` (z `scripts/ui-literals.mjs`), `npx astro check`, `npm test`, `npm run build`
- `npx playwright test --list` nadal pokazuje test emotek

#### Manual Verification:

- Karol wybrał wariant dymków na zrzutach (zapisany tutaj)
- Zrzuty wybranego wariantu: telefon 390 i 360 px (sześć przycisków w jednym rzędzie, koniec widoku nad paskiem), laptop
  1536×750 i 1280 px; 3 i 5 dymków, przerwa, odmowa; dymki nie zasłaniają przycisków hosta

**Implementation Note**: Po fazie i zielonej bramce zatrzymaj się na potwierdzenie przed wdrożeniem.

---

## Faza 2: Wdrożenie

### Overview

Bez migracji: PR, zielone CI, scalenie przez Karola, smoke na produkcji, sprawdzenie w najbliższej grze.

### Changes Required:

#### 1. PR i wdrożenie

**File**: — (gałąź `emote-visibility`)

**Intent**: Push gałęzi (za zgodą), `gh pr create`, zielone `ci`, `smoke`, `db`, `e2e`; scala Karol
(`! gh pr merge <n> --merge`), Workers Builds wdraża; smoke na produkcji raz (za zgodą).

**Contract**: wszystko z tego terminala przez PR (AGENTS.md, ochrona `main`).

### Success Criteria:

#### Automated Verification:

- CI na PR zielone: `ci`, `smoke`, `db`, `e2e`

#### Manual Verification:

- Smoke na produkcji zielony po scaleniu (za zgodą)
- Karol w najbliższej grze: dymki dobrze widać na telefonie i laptopie, pasek wygodny, nic nie przeszkadza hostowi

---

## Testing Strategy

### Unit Tests:

- Bez nowych: zmiana nie ma logiki.

### Integration Tests:

- `tests/e2e/emotes.spec.ts` bez zmian gra w CI (oba projekty): przyciski w oknie, przerwa, komunikat z nickiem.

### Manual Testing Steps:

1. Zrzuty wybranego wariantu na telefonie (360 i 390 px) i laptopie (1280 i 1536 px).
2. `/dev/room-states` 91–95 i `/dev/room-window` z emotkami przeklikane lokalnie.
3. W najbliższej grze kilka emotek naraz na odsłonie: widać je, nic się nie rozjeżdża.

## Performance Considerations

Bez wpływu: tyle samo dymków i żądań; animacja (jeśli wariant 3) tylko przez CSS.

## Migration Notes

Brak.

## References

- Zmiana źródłowa: `context/changes/room-emotes/plan.md` (Faza 2, wariant 3 rozmieszczenia)
- Pasek: `src/components/room/EmoteBar.tsx`; dymki: `src/components/room/EmoteBubbles.tsx`
- Uwagi z gry: `context/changes/emote-visibility/change.md` (Notes)

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: Warianty, wybór i wykonanie

#### Automated

- [x] 1.1 Bramka zielona: `npm run lint` (z `scripts/ui-literals.mjs`), `npx astro check`, `npm test`, `npm run build` — d1f0b80
- [x] 1.2 `npx playwright test --list` nadal pokazuje test emotek — d1f0b80

#### Manual

- [x] 1.3 Karol wybrał wariant dymków na zrzutach (zapisany tutaj) — d1f0b80
- [x] 1.4 Zrzuty wybranego wariantu: telefon 390 i 360 px (sześć przycisków w jednym rzędzie, koniec widoku nad paskiem), laptop 1536×750 i 1280 px; 3 i 5 dymków, przerwa, odmowa; dymki nie zasłaniają przycisków hosta — d1f0b80

### Phase 2: Wdrożenie

#### Automated

- [x] 2.1 CI na PR zielone: `ci`, `smoke`, `db`, `e2e` — PR #28, `9e4a209`

#### Manual

- [x] 2.2 Smoke na produkcji zielony po scaleniu (za zgodą) — Workers Builds success, smoke raz, wszystkie kroki zielone
- [x] 2.3 Karol w najbliższej grze: dymki dobrze widać na telefonie i laptopie, pasek wygodny, nic nie przeszkadza hostowi (gra z ekipą 19.11.2026)
