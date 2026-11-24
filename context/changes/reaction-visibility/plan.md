# Kciuki na odsłonie lepiej widoczne (S-30) Implementation Plan

## Overview

Po pierwszej grze ze znajomymi (2026-11-22, uwaga P) wyszło, że gracze nie zauważają kciuków „Oceń pytanie” na odsłonie. Kciuki przechodzą spod wyniku do cichej linii pod pytaniem (wariant W2, wybór Karola 2026-11-24): po lewej podpis „Oceń pytanie”, po prawej dwie pigułki z ikoną i słowem „Dobre” i „Słabe”. Dzięki temu stoją w pierwszym ekranie przy każdej liczbie graczy i roli, na telefonie i na laptopie. Więcej kciuków to więcej danych o słabych pytaniach (S-28, druga połowa S-12).

Lżejszy cykl: same ekrany i napisy, bez bazy, `src/lib/rooms/` i `src/pages/api/rooms/`. Zmiana dotyka `tests/`, więc idzie PR-em na zielonym CI.

## Current State Analysis

- Kciuki stoją po całym wyniku (`src/components/room/RoundReveal.tsx:152`), między sekcją „Wynik” a przyciskami prowadzącego. Pomiar z researchu (`research.md`, „Gdzie dziś stoją kciuki”):
  - na telefonie 390×844 są poza pierwszym ekranem we wszystkich 4 stanach, u gościa z 5 graczami pod paskiem emotek;
  - na laptopie hosta dolne 4 px przycisków chowa jego przyklejony pasek;
  - przy 20 graczach kciuki są poza oknem na obu ekranach.
- Przyciski mają 36 px (`size="icon"`, `src/components/ui/button.tsx:30`) i samą konturową ikonę. Znaczenie („Dobre pytanie”, „Słabe pytanie”) jest tylko w `aria-label` (`src/components/room/QuestionReaction.tsx:85`), a podpis „Oceń pytanie” ma ten sam styl co nagłówek „Wynik” (`QuestionReaction.tsx:73`, `RoundReveal.tsx:94`).
- Obok, w pasku emotek, stoją duże kolorowe 👍 👎 (`src/lib/rooms/emotes.ts:10-11`, `src/components/room/EmoteBar.tsx:103`), które lecą do całego pokoju i nic nie oceniają.
- Stany kciuków działają i zostają:
  - zaznaczony wypełnia się Blurple (`variant="default"`, `fill-current`);
  - wysyłany kręci `Spinner`, a oba przyciski mają `aria-disabled`;
  - odmowa pokazuje `FieldError` pod przyciskami (`QuestionReaction.tsx:56-108`).

## Desired End State

Na odsłonie każdy gracz widzi od razu pod pytaniem linię „Oceń pytanie · [👍 Dobre] [👎 Słabe]”, bez przewijania, na telefonie 390×844 i na laptopie 1536×750, także przy 20 graczach i u hosta. Kolejność na ekranie:

1. licznik;
2. pytanie;
3. przy ostatnim pytaniu i graczu bez roli dopisek;
4. kciuki;
5. „Wynik”;
6. przyciski prowadzącego.

Zachowanie kciuka się nie zmienia:

- dotknięcie zaznacza, drugie dotknięcie cofa, a dotknięcie drugiego kciuka przełącza;
- nikt inny go nie widzi i nic nie czeka na kciuk;
- czytnik ekranu i e2e znajdują przyciski po nazwach „Dobre pytanie” i „Słabe pytanie”.

Weryfikacja:

- krok e2e w `game.spec.ts` (kciuki w pierwszym ekranie i nad regionem „Wynik”, w projektach `chromium` i `phone`) z próbnym alarmem;
- pomiar skryptem na `/dev/room-window`;
- zrzuty przed i po do akceptacji Karola.

### Key Discoveries:

- `RoundCounter` stoi w DOM po tytule i podnosi się klasą `order-first` (`src/components/room/RoundCounter.tsx:11-17`). Tytuł zostaje pierwszym elementem widoku, bo tam idzie fokus po ruchu prowadzącego (`AGENTS.md`, ## UI). Kciuki wchodzą do tej samej kolumny, po liczniku i `LastQuestionNote` (`RoundReveal.tsx:83-87`), bez żadnego `order-*`.
- `revealMotion` liczy animacje CSS w regionie „Wynik” (`tests/e2e/support/round.ts:79-85`). Kciuki stoją poza nim, więc liczby w `round.spec.ts` się nie zmieniają.
- E2e szuka kciuków po `getByRole("button", { name: "Dobre pytanie" | "Słabe pytanie", exact: true })` (`tests/e2e/support/round.ts:97-98`), a `game.spec.ts:93-97` sprawdza `aria-pressed`. `aria-label` zostaje bez zmian: widoczne słowo („Dobre”) jest początkiem nazwy dostępnej (WCAG 2.5.3, „label in name”).
- `Button size="lg"` (h-10, pigułka, `has-[>svg]:px-4`, `button.tsx:29`) daje 40 px, jak na makiecie W2. To istniejący rozmiar, więc wiersz w `/dev/ui-kitchen-sink` nie jest potrzebny.
- `game.spec.ts:99-111` (laptop o wysokości 400 px, „Następne pytanie” w oknie) nie zależy od miejsca kciuków, bo pasek hosta jest przyklejony od `lg`.
- Polskie napisy w komponentach blokuje `scripts/ui-text.mjs`, więc słowa idą przez słownik (`src/lib/i18n/pl/round.ts:82-87`). Zgodność kluczy pilnuje `tests/unit/i18n.test.ts`.
- `src/components/room/chat-composer.ts:5` wskazuje kciuki jako wzór przełącznika `outline` → `default`. Po zmianie dalej to prawda (bez numerów linii), więc komentarz zostaje.
- `/dev/room-window` nie ma osobnego stanu kciuków, ale każda odsłona (`reveal-*`, `chat-reveal-*`, `proposals-reveal*`) je pokazuje. Okno (nagłówek, pasek hosta) się nie zmienia, więc nowy stan okna nie jest potrzebny (`AGENTS.md`, ## UI).

## What We're NOT Doing

- Bez zmian w bazie, `src/lib/rooms/`, `src/pages/api/rooms/` i trasie kciuka (`react.ts`). Kciuk zostaje nieobowiązkowy, nie wstrzymuje prowadzącego i widzi go tylko ten gracz.
- Bez „Dzięki” po dotknięciu (decyzja 3 w `research.md`). Potwierdzeniem zostaje samo zaznaczenie.
- Bez karty wokół kciuków, nowego rozmiaru `Button` i nowego tokenu. Bez ruchu ani animacji wejścia.
- Bez zmian w pasku emotek i jego 👍 👎 (S-16).
- Bez zmiany nazw dostępnych i bez angielskiego słownika (S-27 Faza 4 przetłumaczy nowe klucze, bo test zgodności kluczy ich zażąda).
- Bez nowego stanu w `/dev/room-window` i bez kroku smoke (smoke nie dotyka ekranu kciuków).
- Bez W1 i W3 (odrzucone w `research.md`, decyzja 1).

## Implementation Approach

Jedna faza kodu i jedna domknięcia, jak w S-29. W Fazie 1 `QuestionReaction` zmienia sam wygląd (pigułki ze słowami, cichy podpis, jedna linia z zawijaniem), a `RoundReveal` przenosi go do kolumny pytania. Logika kciuka (`tap`, stany, `onReact`) się nie zmienia. Nowy krok e2e pilnuje właściwości, dla której robimy zmianę: kciuki w pierwszym ekranie, przed wynikiem. Próbny alarm cofa samo miejsce i ma trafić dokładnie w ten krok. Faza 2 dopisuje regułę dla następnych agentów, poprawia dokumenty i wdraża.

## Critical Implementation Details

- **Kolejność w DOM.** Kciuki idą do kolumny pytania (pierwszy `div` odsłony), po `RoundCounter` i `LastQuestionNote`, nigdy przed tytułem. Kolejność czytania zgadza się wtedy z ekranem: pytanie → ocena → wynik.
- **Wysyłanie.** `Spinner` zastępuje ikonę, a słowo zostaje. Oba mają `size-4`, więc pigułka nie zmienia szerokości i sąsiad nie skacze. Jedna ramka w obu stanach (`border`, przy zaznaczeniu `border-primary`), jak dziś.

## Faza 1: Kciuki pod pytaniem (W2)

### Overview

Pigułki „Dobre” i „Słabe” z ikoną w cichej linii pod pytaniem, krok e2e, zrzuty do akceptacji, draft PR, CI i próbny alarm.

### Changes Required:

#### 1. Słowa na przyciskach

**File**: `src/lib/i18n/pl/round.ts` (`reaction`, `:82-87`)

**Intent**: Widoczne słowa przycisków „Dobre” i „Słabe” obok dotychczasowych nazw dostępnych. Komentarz przestaje mówić, że przyciski pokazują samą ikonę.

**Contract**: `t.round.reaction` dostaje słowa dla `up` i `down` (np. `words: { up: "Dobre", down: "Słabe" }`). Klucze `label` („Oceń pytanie”), `up` („Dobre pytanie”) i `down` („Słabe pytanie”) zostają bez zmian.

#### 2. Kciuki jako cicha linia z pigułkami

**File**: `src/components/room/QuestionReaction.tsx`

**Intent**: Jedna linia: podpis po lewej, dwie pigułki po prawej, zawijana na wąskim ekranie (`flex-wrap`, `justify-between`, `items-center`). Podpis jest cichy (`text-muted-foreground text-sm`, bez `font-medium`), żeby ocena nie konkurowała z nagłówkiem „Wynik”. Każdy przycisk to `Button size="lg"` z ikoną i słowem ze słownika. Warianty `outline` i `default`, `fill-current` przy zaznaczeniu, spinner, `aria-*` i `FieldError` zostają jak dziś. Komentarze (`:25`, `:41-47`) opisują nowe miejsce i słowa.

**Contract**:

- `role="group"` z `aria-labelledby` na podpisie;
- przyciski z `aria-label={t.round.reaction[thumb]}` i `aria-pressed`;
- props bez zmian, `QuestionReactionPreview` i `Reaction` bez zmian (`RoomScreen.tsx` ich używa).

#### 3. Miejsce na odsłonie

**File**: `src/components/room/RoundReveal.tsx` (`:83-87`, `:152`, komentarz `:47-57`)

**Intent**: `<QuestionReaction …>` wychodzi spod sekcji „Wynik” do kolumny pytania, za `RoundCounter` i `LastQuestionNote`. Ma mały odstęp od pytania (makieta: około 20 px, klasą ze skali Tailwinda). Komentarz komponentu mówi „pod pytaniem”, a nie „pod wynikiem”.

**Contract**: kolejność w DOM: tytuł → licznik → dopisek → kciuki, potem `<section>` „Wynik”, potem `HostActions`. Kciuki poza regionem „Wynik”.

#### 4. Podglądy

**File**: `src/pages/dev/room-states.astro` (`:2414-2482`, stany 86–90)

**Intent**: Stany kciuków zostają. Nagłówki podglądów mówią o zaznaczonym „Dobre” lub „Słabe”, a nie o nazwie dostępnej. Każdy stan pokazuje nowy układ sam, bo renderuje prawdziwy `RoomScreen`.

**Contract**: identyfikatory sekcji (`reaction-none`, `reaction-up`, `reaction-host-down`, `reaction-sending`, `reaction-error`) bez zmian.

#### 5. E2e: kciuki w pierwszym ekranie, przed wynikiem

**Files**: `tests/e2e/game.spec.ts` (`:91-97`), `tests/e2e/support/round.ts` (komentarz `:95-96`)

**Intent**: Przed pierwszym dotknięciem kciuka gościa A nowy krok sprawdza, po przewinięciu strony na górę (`window.scrollTo(0, 0)`), w tej kolejności, że:

1. dolna krawędź kciuków leży nad górną krawędzią regionu „Wynik” (`getByRole("region", { name: "Wynik" })`);
2. oba kciuki są całe w oknie (`toBeInViewport({ ratio: 1 })`).

Asercja kolejności idzie pierwsza: nie zależy od długości wylosowanego pytania, więc alarm zawsze pada na niej. Krok gra się w obu projektach (`chromium` 1280 px, `phone` 390×844). Komentarz kroku podaje powód: S-30, w grze 2026-11-22 kciuków nie widziano. Komentarz `questionThumb` opisuje ikonę ze słowem i miejsce pod pytaniem. Przed pisaniem: `context/foundation/test-plan.md` §6.4 (`AGENTS.md`, Testing).

**Contract**: `questionThumb` bez zmiany sygnatury i lokatora. Reszta kroku (zaznacz, przełącz `aria-pressed`, cofnij) bez zmian.

#### 6. Pomiar na podglądzie okna

**Intent**: Skrypt w scratchpadzie (wzór `audit.mjs` z researchu: Playwright, `channel: "chrome"`, serwer dev) mierzy `getBoundingClientRect` grupy kciuków na `/dev/room-window`. Stany: `reveal-guest`, `reveal-host`, `reveal-host-20` i `chat-reveal-host`, na telefonie 390×844 i na laptopie 1536×750. Wynik: dolna krawędź grupy nad górną krawędzią paska emotek na telefonie i paska hosta na laptopie, przy oknie przewiniętym na górę.

**Contract**: wynik w `pomiar.json` w scratchpadzie, liczby w opisie commita albo w Progress.

#### 7. Zrzuty przed i po

**Intent**: Strona „Co oceniasz” otwarta w Chrome Karola (`cmd //c start chrome …`). Zrzuty w headless Chrome z `/dev/room-window`:

- telefon 390×844 w prawdziwej wielkości i laptop 1536×750 w skali 1:1;
- stany `reveal-guest`, `reveal-host` i `reveal-host-20`;
- na telefonie dodatkowo `/dev/room-states`: zaznaczone „Dobre” (`reaction-up`), wysyłanie (`reaction-sending`) i odmowa (`reaction-error`);
- jeden telefon 360×780 (wąski Android), żeby sprawdzić zawijanie linii.

„Przed” to zrzuty W0 z galerii researchu (scratchpad `a9ad86f2-…\scratchpad\s30\gal\`) albo świeże z `main`. Serwer dev zatrzymany po zrzutach.

#### 8. Próbny alarm w CI

**Intent**: Przewidywanie zapisane przed alarmem. Tymczasowy commit przenosi `<QuestionReaction …>` w `RoundReveal.tsx` z powrotem pod sekcję „Wynik” (wygląd pigułek zostaje).

Przewidywanie:

- w `e2e` czerwony jest tylko `game.spec.ts`, w nowym kroku, na pierwszej asercji („kciuki nad regionem Wynik”), w obu projektach (`chromium`, `phone`);
- `round.spec.ts` i pozostałe pliki e2e są zielone;
- `ci`, `db` i `smoke` są zielone.

Push alarmu i revertu za zgodą Karola. Recenzję AI na alarmie anulować. Wynik z datą trafia do `test-plan.md` §6.4, według wzoru wpisu S-29.

**Contract**: alarm i revert jako osobne commity na gałęzi.

### Success Criteria:

#### Automated Verification:

- Bramka zielona: `npm run lint`, `npx astro check`, `npm test`, `npm run build`
- `npx playwright test --list` wymienia `game.spec.ts` w obu projektach
- Pomiar na `/dev/room-window`: kciuki całe w pierwszym ekranie w `reveal-guest`, `reveal-host`, `reveal-host-20` i `chat-reveal-host`, na telefonie 390×844 (nad paskiem emotek) i na laptopie 1536×750 (nad paskiem hosta)
- CI na draft PR zielone: `ci`, `smoke`, `db`, `e2e`
- Próbny alarm trafia dokładnie: czerwony tylko nowy krok `game.spec.ts` (asercja „nad Wynik”, `chromium` i `phone`), po revercie CI zielone, wpis w `test-plan.md` §6.4

#### Manual Verification:

- Karol akceptuje zrzuty przed i po (telefon w prawdziwej wielkości, laptop 1:1): linia „Oceń pytanie · Dobre · Słabe” pod pytaniem w pierwszym ekranie, zaznaczenie, wysyłanie, odmowa, wąski telefon

**Implementation Note**:

1. Po akceptacji Karola commit fazy razem z `plan.md`, `plan-brief.md`, `change.md`, `research.md` (decyzje) i roadmapą (status `in-progress`).
2. Przed pushem `git fetch`. Gałąź stoi na `622015d`, a `origin/main` ma nad nim tylko merge PR #95. Jeśli `main` poszedł dalej, `git merge origin/main` (gałąź nie była wypychana).
3. Push za zgodą, draft PR, CI, alarm i revert.

---

## Faza 2: Domknięcie i wdrożenie

### Overview

Reguła dla następnych agentów, wpisy w test-planie i roadmapie, gotowy PR, produkcja.

### Changes Required:

#### 1. Reguła w `AGENTS.md`

**File**: `AGENTS.md` („## UI”)

**Intent**: Jedno zdanie: kciuki oceny pytania (`QuestionReaction`) stoją na odsłonie pod pytaniem, przed wynikiem, z widocznymi słowami „Dobre” i „Słabe”. Nie przenosi się ich pod wynik ani do przyklejonego paska i nie zostawia samych ikon. Powód: S-30, w grze 2026-11-22 gracze ich nie zauważali, a obok są 👍 👎 emotek.

**Contract**: bez `@ścieżki` (wkleiłaby plik).

#### 2. Test-plan

**File**: `context/foundation/test-plan.md` (§6.4)

**Intent**: Opis kroku kciuków w `game.spec.ts`: w pierwszym ekranie i nad regionem „Wynik”, w obu projektach. Do tego wpis alarmu z Fazy 1, jeśli nie trafił tam w Fazie 1.

**Contract**: bez zmian w innych sekcjach.

#### 3. Roadmapa

**File**: `context/foundation/roadmap.md` (S-30: wiersz w „At a glance” `:75` i Outcome `:512`)

**Intent**: „pod wynikiem odsłony” → „na odsłonie, pod pytaniem”, bo tak zdecydował Karol 2026-11-24 (W2). To samo zdanie w obu miejscach; inne elementy roadmapy bez zmian.

**Contract**: tylko te dwa zdania i status S-30.

#### 4. PR i wdrożenie

**Intent**:

- Draft → gotowy PR → zielone `ci`, `smoke`, `db`, `e2e` → scala Karol (`! gh pr merge <n> --merge`) → Workers Builds → smoke na produkcji (zgoda Karola, jeden przebieg).
- Epilog (Progress z SHA, `change.md` → `implemented`) po ręcznym sprawdzeniu Karola, małym PR-em albo z następną zmianą.
- `/10x-impl-review` niepotrzebny (mała zmiana, lżejszy cykl), chyba że Karol zechce.
- `/10x-archive` po grze.

**Contract**: bez migracji, więc bez `db push`.

### Success Criteria:

#### Automated Verification:

- CI na PR zielone: `ci`, `smoke`, `db`, `e2e`
- Smoke na produkcji zielony po scaleniu (za zgodą Karola, jeden przebieg)

#### Manual Verification:

- Karol na telefonie i laptopie w prawdziwej grze:
  - kciuki widać od razu pod pytaniem, bez przewijania;
  - „Dobre” i „Słabe” zaznaczają się, cofają i przełączają;
  - prowadzący idzie dalej bez czekania;
  - ekipa nie myli ich z drugim głosem ani z emotkami (pytanie do ekipy).

---

## Testing Strategy

### Unit Tests:

- Bez nowych. `tests/unit/i18n.test.ts` pilnuje zgodności nowych kluczy słownika z pseudojęzykiem.

### Integration Tests:

- E2e `game.spec.ts` (oba projekty): kciuki gościa w pierwszym ekranie i nad regionem „Wynik”, a potem jak dotąd zaznaczenie i cofnięcie z `aria-pressed`. Próbny alarm dowodzi, że krok łapie powrót kciuków pod wynik.
- `round.spec.ts` (`revealMotion`) bez zmian liczb, bo kciuki są poza regionem „Wynik”.

### Manual Testing Steps:

1. Zrzuty przed i po (Faza 1): telefon 390×844 i 360×780, laptop 1536×750, gość i host, 5 i 20 graczy, zaznaczenie, wysyłanie, odmowa.
2. W prawdziwej grze (Faza 2): telefon i laptop, odsłona, kciuk w górę, cofnięcie, w dół, „Następne pytanie” bez czekania.

## Performance Considerations

Brak: ten sam komponent i te same zapytania, inne miejsce i wygląd.

## Migration Notes

Brak: bez migracji i bez zmian danych.

## References

- Research i decyzje: `context/changes/reaction-visibility/research.md` (zarzuty Z1–Z4, warianty W1–W3, „Decisions”)
- Roadmapa: `context/foundation/roadmap.md:510-520` (S-30)
- Poprzednie kciuki: `context/archive/2026-10-26-question-reactions-play-data/plan.md:280-287`
- Wzór planu `/10x-ui` z alarmem: `context/changes/chat-composer/plan.md`
- Galeria wariantów: scratchpad sesji `a9ad86f2-…\scratchpad\s30\galeria.html` (makiety `galeria.mjs`)

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: Kciuki pod pytaniem (W2)

#### Automated

- [x] 1.1 Bramka zielona: `npm run lint`, `npx astro check`, `npm test`, `npm run build` — 1d757d5
- [x] 1.2 `npx playwright test --list` wymienia `game.spec.ts` w obu projektach — 1d757d5
- [x] 1.3 Pomiar na `/dev/room-window`: kciuki całe w pierwszym ekranie w `reveal-guest`, `reveal-host`, `reveal-host-20` i `chat-reveal-host`, na telefonie 390×844 (nad paskiem emotek) i na laptopie 1536×750 (nad paskiem hosta) — 1d757d5
- [x] 1.4 CI na draft PR zielone: `ci`, `smoke`, `db`, `e2e` — 1d757d5
- [x] 1.5 Próbny alarm trafia dokładnie: czerwony tylko nowy krok `game.spec.ts` (asercja „nad Wynik”, `chromium` i `phone`), po revercie CI zielone, wpis w `test-plan.md` §6.4 — b4a1900

#### Manual

- [x] 1.6 Karol akceptuje zrzuty przed i po (telefon w prawdziwej wielkości, laptop 1:1): linia „Oceń pytanie · Dobre · Słabe” pod pytaniem w pierwszym ekranie, zaznaczenie, wysyłanie, odmowa, wąski telefon — 1d757d5

### Phase 2: Domknięcie i wdrożenie

#### Automated

- [ ] 2.1 CI na PR zielone: `ci`, `smoke`, `db`, `e2e`
- [ ] 2.2 Smoke na produkcji zielony po scaleniu (za zgodą Karola, jeden przebieg)

#### Manual

- [ ] 2.3 Karol na telefonie i laptopie w prawdziwej grze: kciuki widać od razu pod pytaniem, bez przewijania; „Dobre” i „Słabe” zaznaczają się, cofają i przełączają; prowadzący idzie dalej bez czekania; ekipa nie myli ich z drugim głosem ani z emotkami
