# Nowa gra bez zaznaczonych kategorii: plan implementacji

## Overview

Formularz nowej gry na stronie głównej przestaje zaznaczać kategorie za hosta. Na start żaden kwadracik kategorii nie jest zaznaczony, 18+ dalej wyłączone, a host sam wybiera, z czego gra losuje pytania. Nad listą dochodzi skrót „Zaznacz wszystkie”. Gdy wszystkie są zaznaczone, skrót brzmi „Odznacz wszystkie”. Kategorii jest 14, więc bez skrótu gra ze wszystkich to 14 kliknięć.

Decyzje Karola (21.11.2026):

- punkt L kolejki, przed F;
- pusty wybór na start;
- skrót: tak; jak wygląda, Karol wybierze na zrzutach w Fazie 1;
- zdanie pod „Kategorie pytań” bez zmian: „Pytania 18+ włączasz osobno w każdej kategorii.”

Lżejszy cykl: sam ekran, bez migracji, bez `src/lib/rooms/` i `src/pages/api/rooms/`, bez `/10x-plan-review`.

## Current State Analysis

- Stan kwadracików żyje tylko w wyspie `NewGameForm`. Dziś każda kategoria startuje z `on: true` (`!preview?.noCategories`) i `adult: false` (`src/components/room/NewGameForm.tsx:73-76`). Komentarz przy nim mówi o ustaleniu z wywiadu do planu S-02 („All categories on, 18+ off”), które ta zmiana zastępuje.
- Pusty wybór już ma obsługę: `getFieldErrors` daje „Wybierz co najmniej jedną kategorię” (`NewGameForm.tsx:63-65`), a przy wysyłce fokus idzie na pierwszy `[data-slot="checkbox"]` (`NewGameForm.tsx:106`). Na serwerze trasa `/api/rooms` odsyła pusty albo zły wybór na `/?error=invalid_categories` (`src/pages/api/rooms/index.ts:50,58`).
- 18+ kategorii jest wyłączone (`disabled`), dopóki kategoria nie jest zaznaczona, a wyłączone pole się nie wysyła (`NewGameForm.tsx:173-183`). Odznaczenie i ponowne zaznaczenie kategorii przywraca jej 18+, bo stan `adult` zostaje w pamięci.
- Formularz jest tylko na `/` (`src/pages/index.astro:53`), z kategoriami jako `{ id, name }` z `CATEGORIES` (`index.astro:19`).
- E2e i smoke zakładają gry trasą za „Załóż grę”, bez klikania w formularz: `openRoom` w `tests/e2e/support/room.ts:35-42` i `CATEGORY_IDS` w `scripts/smoke.mjs:221,274`. E2e, które otwierają `/` (`remembered-nick.spec.ts:38`, `game-history.spec.ts:150`), nie wysyłają formularza. Nic nie zakłada gotowego zaznaczenia.
- Podglądy formularza w `/dev/room-states` (`src/pages/dev/room-states.astro:1159-1290`):
  - stany 2, 2a i 2b (domyślny), 3 (za długi nick), 5 i 5b (otwarty pokój) startują z pełnym wyborem;
  - stan 4 (brak kategorii) używa `noCategories`;
  - stany 6 (potwierdzenie zamknięcia) i 7 (wysyłanie) pokazują pełny wybór, bo do nich dochodzi się z poprawnym formularzem.
- `CATEGORY_TILE` z formularza trafia też do macierzy stanów `/dev/ui-kitchen-sink` (`src/pages/dev/ui-kitchen-sink.astro:13,384-442`).
- `Checkbox` (`src/components/ui/checkbox.tsx`) ma tylko stany „pusty” i „zaznaczony”: nie ma wyglądu stanu częściowego (`indeterminate`). `Button` ma wariant `link` (Blurple jako tekst) i rozmiar `sm`.

## Desired End State

- Host po wejściu na `/` widzi wszystkie kategorie niezaznaczone, a 18+ wyłączone przy każdej.
- Skrót w wybranym wariancie:
  - zaznacza wszystkie kategorie;
  - gdy zaznaczone są wszystkie, odznacza je;
  - 18+ nie rusza: wyłączone zostaje wyłączone, a włączone wcześniej wraca jak przy pojedynczej kategorii;
  - zdejmuje błąd „Wybierz co najmniej jedną kategorię”;
  - fokus zostaje na nim;
  - sam niczego nie wysyła w formularzu.
- „Załóż grę” bez wyboru daje dzisiejszy błąd i fokus na pierwszy kwadracik kategorii.
- Podglądy w `/dev/room-states` pokazują nowy stan domyślny, stan „wszystkie zaznaczone” i realne zaznaczenie w stanach 6–7.
- Nowy test jednostkowy pilnuje pustego startu i działania skrótu, a jego próbny alarm trafił.

### Key Discoveries:

- Zmiana stanu startowego to jedna linia (`NewGameForm.tsx:75`). Resztę pracy robi wygląd skrótu, podglądy i test.
- `Preview.noCategories` (`NewGameForm.tsx:36`) przestaje mieć sens: pusty start jest teraz domyślny. Za to stany 6–7 i „wszystkie zaznaczone” potrzebują startu z zaznaczeniem.
- Wzór testu renderowania wyspy na serwerze: `tests/unit/round-voting-ssr.test.ts` (`renderToStaticMarkup` + `createElement`, bez przeglądarki).
- test-plan §6.1: sprawdzamy zachowanie, nie polski tekst. Wyrocznia to decyzja właściciela (`change.md`), nie kod formularza.
- AGENTS.md „## UI”:
  - nowy stan dostaje podgląd w `/dev/room-states`;
  - nowa kontrolka albo nowy wariant przycisku dostaje wiersz w `/dev/ui-kitchen-sink`;
  - kolory tylko z tokenów;
  - fokus nie znika po własnym ruchu (`src/components/room/focus.ts`, tu wystarczy, że skrót zostaje tym samym elementem).

## What We're NOT Doing

- Nie zapamiętujemy wyboru kategorii między grami ani po błędzie serwera. Po przekierowaniu na `/?error=…` (rzadkie: `try_again`, `service_unavailable`) formularz wraca do pustego wyboru, tak jak dziś wraca do pełnego. Kategorie nie trafiają do adresu ani do pamięci przeglądarki.
- Skrót nie włącza 18+. Nie ma osobnego skrótu „wszystkie 18+”.
- Zdanie pod „Kategorie pytań” zostaje bez zmian (decyzja Karola).
- Bez zmian w serwerze gry, bazie, trasie `/api/rooms`, e2e i smoke. Bez nowego kroku smoke (smoke nie klika w formularz).
- Bez wpisu w roadmapie: to poprawka formularza S-01 bez nowego slice'a, jak `reveal-ui` i `join-page-ui`.
- Bez zmiany komunikatu błędu i bez licznika zaznaczonych kategorii.

## Implementation Approach

Najpierw wygląd skrótu, potem kod. W Fazie 1 formularz dostaje pusty start, a skrót powstaje tymczasowo w trzech wariantach na stronie galerii w `/dev/`. Karol wybiera na zrzutach. W Fazie 2 zostaje tylko wybrany wariant, galeria znika, dochodzą podglądy, test z próbnym alarmem i bramka. Faza 3 to PR i wdrożenie.

Działanie skrótu jest takie samo w każdym wariancie, więc logikę wydzielamy do dwóch czystych funkcji w module formularza. Test sprawdza je bez przeglądarki, a ekran tylko je woła.

## Critical Implementation Details

- **Skrót nie może wysłać ani dopisać pola.** Guzik (W1, W2) ma `type="button"`, bo bez tego zatwierdzi formularz. Kwadracik „Wszystkie kategorie” (W3) nie ma `name`, bo inaczej trafi do wysyłanych pól jako dodatkowa kategoria. Trasa odrzuci wtedy cały wybór (`invalid_categories`).
- **Fokus przy błędzie.** Selektor `[data-slot="checkbox"]` (`NewGameForm.tsx:106`) w W3 trafiłby w kwadracik „Wszystkie kategorie”. Fokus ma iść na pierwszy kwadracik kategorii (`[name="category"]`).

## Faza 1: Galeria skrótu

### Overview

Pusty start w formularzu i trzy warianty skrótu na zrzutach. Karol wybiera jeden. Bez commita: galeria jest tymczasowa, a pusty start pojedzie z Fazą 2.

### Changes Required:

#### 1. Pusty start formularza

**File**: `src/components/room/NewGameForm.tsx`

**Intent**: Każda kategoria startuje niezaznaczona, 18+ wyłączone. Komentarz przy stanie mówi, skąd ta zasada (decyzja Karola z 21.11.2026, zastępuje ustalenie z planu S-02).

**Contract**: stan startowy `choices` = `{ on: false, adult: false }` dla każdej kategorii, poza podglądem z zaznaczeniem (Faza 2, #2).

#### 2. Trzy warianty skrótu (tymczasowo)

**File**: `src/components/room/NewGameForm.tsx`, nowa `src/pages/dev/categories-gallery.astro`

**Intent**: Te same funkcje skrótu (#3) w trzech wyglądach, przełączane tymczasowym polem podglądu. Strona galerii pokazuje formularz w prawdziwym układzie strony głównej (`Layout`, karta „Nowa gra”), po jednym wariancie i stanie na adres (`?variant=w1|w2|w3&state=empty|some|all`), żeby każdy zrzut był całym oknem.

- **W1:** guzik `link` w rozmiarze `sm` po prawej, w jednej linii z „Kategorie pytań”.
- **W2:** guzik `link` pod zdaniem o 18+, nad listą.
- **W3:** pierwszy kafelek listy „Wszystkie kategorie” (`CATEGORY_TILE`) z kwadracikiem w trzech stanach: pusty, częściowy (kreska), pełny. Kreska to tymczasowy wygląd `indeterminate` w samej galerii.

**Contract**: tylko tokeny i istniejące warianty `Button`. Galeria i pole wariantu znikają w Fazie 2.

#### 3. Funkcje skrótu

**File**: `src/components/room/NewGameForm.tsx`

**Intent**: Dwie czyste funkcje z eksportem, żeby test (Faza 2) mógł je sprawdzić bez przeglądarki. Jedna mówi, czy zaznaczone są wszystkie kategorie. Druga ustawia `on` wszystkich kategorii na podaną wartość i zostawia `adult` każdej bez zmian. Skrót pokazuje „Odznacz wszystkie” tylko wtedy, gdy zaznaczone są wszystkie. Przy pustym i częściowym wyborze pokazuje „Zaznacz wszystkie”. Kliknięcie zdejmuje błąd kategorii, tak jak `setChoice`.

**Contract**: `Record<string, CategoryChoice>` na wejściu i wyjściu, bez zmiany kształtu `CategoryChoice`.

#### 4. Zrzuty dla Karola

**Intent**: Strona „Co oceniasz” w Chrome Karola:

- telefon 390 px w prawdziwej wielkości (całe okno), laptop 1280 px 1:1 (całe okno);
- dla każdego wariantu: pusty start, część zaznaczona, wszystkie zaznaczone (skrót „Odznacz wszystkie”) i błąd po „Załóż grę” bez wyboru;
- dla porównania dzisiejszy formularz (pełny start).

Zrzuty w headless Chrome przez DevTools Protocol, skrypt w scratchpadzie. Serwer dev tylko dla `/dev/*`, zatrzymany po zrzutach.

### Success Criteria:

#### Automated Verification:

- `npx astro check` przechodzi z galerią
- Każdy adres galerii `/dev/categories-gallery?variant=…&state=…` odpowiada 200 lokalnie

#### Manual Verification:

- Karol wybiera wariant skrótu (W1, W2 albo W3) na zrzutach telefonu i laptopa

**Implementation Note**: wybór Karola trafia do `change.md`. Bez commita.

---

## Faza 2: Formularz z wybranym skrótem

### Overview

Zostaje wybrany wariant, galeria znika, podglądy pokazują nowe stany, test pilnuje decyzji, bramka zielona, commit.

### Changes Required:

#### 1. Wybrany wariant w formularzu

**File**: `src/components/room/NewGameForm.tsx`, `src/components/ui/checkbox.tsx` (tylko przy W3)

**Intent**: Zostaje wybrany wariant skrótu, pozostałe i pole wariantu znikają. Fokus przy błędzie idzie na pierwszy kwadracik kategorii (`[name="category"]`). Przy W3 `Checkbox` dostaje wygląd stanu częściowego (`data-[state=indeterminate]`: Blurple z kreską) jako lokalne odejście od shadcn, opisane w komentarzu jak dzisiejsze.

**Contract**: skrót bez `name`, guzik z `type="button"`. Kontrolki z `src/components/ui`, kolory z tokenów.

#### 2. Podgląd ze startowym zaznaczeniem

**File**: `src/components/room/NewGameForm.tsx`

**Intent**: `Preview.noCategories` znika, bo pusty start jest teraz domyślny. Na jego miejsce wchodzi `picked`: numery kategorii zaznaczonych na starcie, tylko dla podglądów. Prawdziwa strona go nie ustawia.

**Contract**: `picked?: readonly string[]` w `Preview`.

#### 3. Stany w `/dev/room-states`

**File**: `src/pages/dev/room-states.astro`

**Intent**:

- stan 2 (domyślny) pokazuje pusty start;
- stan 4 (brak kategorii) bez `noCategories`;
- stany 6 (potwierdzenie) i 7 (wysyłanie) startują z dwiema zaznaczonymi kategoriami;
- nowy stan „2c. Nowa gra: wszystkie zaznaczone (skrót „Odznacz wszystkie”)” z `picked` = wszystkie kategorie.

**Contract**: identyfikatory sekcji jak dziś (`new-…`), nowa `new-all-picked`.

#### 4. Macierz kontrolek (tylko przy W3)

**File**: `src/pages/dev/ui-kitchen-sink.astro`

**Intent**: Przy W3 nowy stan kwadracika (częściowy) dostaje komórkę w wierszu kwadracika, zgodnie z AGENTS.md „## UI”. Przy W1 i W2 nic, bo guzik `link` `sm` już ma swój wiersz. Sprawdzić, czy jest. Jeśli nie, wiersz dochodzi.

**Contract**: wiersz macierzy jak istniejące.

#### 5. Sprzątanie galerii

**File**: `src/pages/dev/categories-gallery.astro`

**Intent**: Plik usunięty, pole wariantu w formularzu też.

**Contract**: brak pliku po tej fazie.

#### 6. Test formularza

**File**: nowy `tests/unit/new-game-form.test.ts`

**Intent**: Przed pisaniem przeczytać test-plan §6.1. Wyrocznia: decyzja Karola z 21.11.2026 (`change.md`), wypisana w teście. Test:

- renderuje `NewGameForm` na serwerze (`renderToStaticMarkup`, wzór `round-voting-ssr.test.ts`) z kilkoma kategoriami, bez podglądu;
- sprawdza, że każdy kwadracik kategorii jest niezaznaczony, a każde 18+ niezaznaczone i wyłączone;
- sprawdza, że skrót jest na stronie i nie wysyła pola (bez `name`, a guzik `type="button"`);
- sprawdza funkcje skrótu z #3 Fazy 1: zaznaczenie wszystkich z pustego i z częściowego wyboru, odznaczenie wszystkich, 18+ każdej kategorii bez zmian, „wszystkie zaznaczone” prawdziwe tylko przy pełnym wyborze (`it.each`) i przypadek brzegowy (jedna kategoria).

Bez polskiego tekstu w asercjach.

**Contract**: tylko `vitest`, `react`, `react-dom/server` i `@/components/room/NewGameForm`. Bez modułów `astro:*`.

#### 7. Próbny alarm (lokalnie)

**Intent**: Przewidywanie zapisane przed alarmem. Tymczasowo przywrócić pełny start (`on: true`). Czerwony ma być tylko przypadek pustego startu w `new-game-form.test.ts`, reszta `npm test` zielona. Potem cofnąć. Drugi alarm: funkcja skrótu zeruje `adult`. Czerwony tylko przypadek 18+. Wynik z datą trafia do test-plan §6.1, jako nowy punkt „New game form”.

**Contract**: bez commita alarmu (lokalnie, jak alarmy testów jednostkowych S-17 i S-21).

#### 8. Zrzuty przed i po

**Intent**: Strona „Co oceniasz” w Chrome Karola: telefon w prawdziwej wielkości, laptop 1:1. Na niej stany 2, 2c, 4, 6 i 7 z `/dev/room-states` przed zmianą (z `main`) i po niej. Serwer dev zatrzymany po zrzutach.

### Success Criteria:

#### Automated Verification:

- Bramka zielona: `npm run lint`, `npx astro check`, `npm test`, `npm run build`
- Próbny alarm trafia dokładnie: pełny start czerwieni tylko przypadek pustego startu, zerowanie 18+ tylko przypadek 18+, po cofnięciu zielono
- `src/pages/dev/categories-gallery.astro` nie istnieje, a w kodzie nie ma `noCategories`

#### Manual Verification:

- Karol akceptuje zrzuty przed i po (telefon w prawdziwej wielkości, laptop 1:1): pusty start, wszystkie zaznaczone, błąd, potwierdzenie, wysyłanie

**Implementation Note**: po akceptacji Karola commit fazy (z `plan.md`, `plan-brief.md`, `change.md` i wpisem w test-planie), bez pusha.

---

## Faza 3: PR i wdrożenie

### Overview

Zmiana idzie na produkcję lżejszym cyklem.

### Changes Required:

#### 1. PR i wdrożenie

**Intent**: Push gałęzi (zgoda Karola) → `gh pr create` → zielone `ci`, `smoke`, `db`, `e2e` → scala Karol (`! gh pr merge <n> --merge`) → Workers Builds → smoke na produkcji (zgoda Karola).

**Contract**: bez migracji, więc bez `db push`.

#### 2. Epilog

**File**: ten plan, `context/changes/categories-unticked/change.md`

**Intent**: Progress z SHA i `change.md` → `implemented` po ręcznym sprawdzeniu Karola, osobnym małym PR-em albo razem z następną zmianą. `/10x-impl-review` niepotrzebny (mała zmiana, lżejszy cykl). `/10x-archive` po grze.

**Contract**: bez zmian w kodzie.

### Success Criteria:

#### Automated Verification:

- CI na PR zielone: `ci`, `smoke`, `db`, `e2e`
- Smoke na produkcji zielony po scaleniu (za zgodą Karola)

#### Manual Verification:

- Karol na telefonie i laptopie: na `/` kategorie puste, skrót zaznacza i odznacza wszystkie, 18+ zostaje wyłączone, „Załóż grę” bez wyboru daje błąd, z wybranymi kategoriami gra się zakłada i losuje tylko z nich

---

## Testing Strategy

### Unit Tests:

- `tests/unit/new-game-form.test.ts`: pusty start (kategorie i 18+), skrót bez `name` i bez wysyłki, funkcje skrótu (pełny, częściowy, pusty wybór, 18+ bez zmian, jedna kategoria).

### Integration Tests:

- Bez nowych. E2e i smoke zakładają gry trasą, więc nie zależą od stanu formularza. Ich zielone CI pokazuje, że trasa i gra działają jak dotąd.

### Manual Testing Steps:

1. `/` zalogowanego hosta: wszystkie kategorie puste, 18+ wyłączone.
2. Skrót: wszystkie zaznaczone, skrót zmienia się na „Odznacz wszystkie”, fokus na nim. Drugie kliknięcie: wszystkie puste.
3. „Załóż grę” bez wyboru: błąd i fokus na pierwszej kategorii. Zaznaczenie kategorii albo skrót zdejmuje błąd.
4. Dwie kategorie i 18+ w jednej → „Załóż grę” → pytania tylko z nich.

## Performance Considerations

Bez znaczenia: 14 kafelków, stan w pamięci wyspy.

## Migration Notes

Nie dotyczy (bez bazy i bez zapisanych danych).

## References

- Decyzja i opis punktu L: `context/changes/categories-unticked/change.md`, `C:\Users\karol\Documents\sesja-gry.md` (kolejka, punkt L)
- Formularz: `src/components/room/NewGameForm.tsx:69-118`
- Podglądy: `src/pages/dev/room-states.astro:1159-1290`
- Wzór testu renderowania: `tests/unit/round-voting-ssr.test.ts`
- Wzór galerii z adresami stanów: `context/changes/join-page-ui/plan.md` (Faza 2, zrzuty dla Karola)

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: Galeria skrótu

#### Automated

- [x] 1.1 `npx astro check` przechodzi z galerią
- [x] 1.2 Każdy adres galerii `/dev/categories-gallery?variant=…&state=…` odpowiada 200 lokalnie

#### Manual

- [x] 1.3 Karol wybiera wariant skrótu (W1, W2 albo W3) na zrzutach telefonu i laptopa

### Phase 2: Formularz z wybranym skrótem

#### Automated

- [x] 2.1 Bramka zielona: `npm run lint`, `npx astro check`, `npm test`, `npm run build`
- [x] 2.2 Próbny alarm trafia dokładnie: pełny start czerwieni tylko przypadek pustego startu, zerowanie 18+ tylko przypadek 18+, po cofnięciu zielono
- [x] 2.3 `src/pages/dev/categories-gallery.astro` nie istnieje, a w kodzie nie ma `noCategories`

#### Manual

- [x] 2.4 Karol akceptuje zrzuty przed i po (telefon w prawdziwej wielkości, laptop 1:1): pusty start, wszystkie zaznaczone, błąd, potwierdzenie, wysyłanie

### Phase 3: PR i wdrożenie

#### Automated

- [ ] 3.1 CI na PR zielone: `ci`, `smoke`, `db`, `e2e`
- [ ] 3.2 Smoke na produkcji zielony po scaleniu (za zgodą Karola)

#### Manual

- [ ] 3.3 Karol na telefonie i laptopie: na `/` kategorie puste, skrót zaznacza i odznacza wszystkie, 18+ zostaje wyłączone, „Załóż grę” bez wyboru daje błąd, z wybranymi kategoriami gra się zakłada i losuje tylko z nich
