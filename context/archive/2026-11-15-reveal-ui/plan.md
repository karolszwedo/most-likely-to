# Wygląd ekranu odsłony wyniku (reveal-ui) Implementation Plan

## Overview

Odsłona wyniku to kulminacja rundy, a dziś wynik podmienia się w jednej klatce, jak każde odświeżenie stanu. U prowadzącego górę ekranu zajmuje do tego pełne pole „Link dla graczy”. Zmiana dodaje dwie rzeczy, które Karol wybrał w galerii 15.11.2026: krótki ruch przy odsłonie (koło obraca się i rośnie, tabela wjeżdża od dołu, paski rosną od lewej) oraz link dla graczy zwinięty u prowadzącego na odsłonie w jedną niską linijkę. Reszta ekranu zostaje jak dziś. Prototyp galerii znika, a brakujące stany odsłony dostają podglądy.

**Decyzje (2026-11-15):**

- **Karol** (`change.md`, „Wybór Karola z galerii”):
  1. Wygląd wyniku „dziś”: tabela, koło, pogrubienie osoby z największą liczbą głosów. Warianty A „Reflektor”, B „wyróżniony wiersz” i C „duże paski” odrzucone (Z1 odłożony).
  2. Nikt nikogo nie wskazał: „dziś”, bez zdania; E1–E3 odrzucone (Z2 odłożony).
  3. Link dla graczy u prowadzącego **na odsłonie zwinięty w jedną linijkę**: etykieta, niskie pole, „Kopiuj” jako przycisk `ghost` `sm`. W poczekalni i głosowaniu zostaje jak dziś (Z5).
  4. **Ruch przy odsłonie: tak, w tej postaci** (drugi pokaz w Chrome, „może być taka animacja”), z klasami z prototypu (Z3).
  5. Złożoność niska, 0 pytań merytorycznych, fazy 1–3 jak niżej (zatwierdzone przy planie).
- **Sesja** (technika, Karol przyjął „technikę rozstrzygam sam”):
  1. **Ruch gra tylko przy zmianie fazy w tej karcie:** głosowanie → odsłona, gdy ekran już stoi. Nie gra po odświeżeniu strony ani u spóźnionego gracza, który wchodzi na odsłonę (S-04, S-08). Dane przychodzą bez opóźnienia (PRD 2 s), bez odliczania (timer to Non-Goal). Po zmianie widoku „Koło” / „Paski” w tej samej odsłonie nowy widok wjeżdża tak samo, jak w prototypie, który Karol widział.
  2. **Ruch tylko pod `motion-safe:`**, jak emotki. Przy wyłączonych animacjach w systemie wynik po prostu stoi.
  3. **Klasy `tw-animate-css`** (już zaimportowane w `global.css:2`) zebrane w jednym module `src/components/room/reveal-motion.ts`. Bez nowych keyframes i tokenów: czasy i opóźnienia pochodzą ze skali Tailwinda, a kontrola literałów ich nie łapie.
  4. **Zwinięty link to tryb `compact` w `PlayerLink`**, nie drugi komponent. Szara linijka „link się zmienił” (S-09, „Szara linijka”) stoi pod wierszem, a nie obok pola, jak w prototypie.
  5. **Z4 odłożony:** wspólne koło odsłony i podsumowania, `toggle-group` i `table` z shadcn. Wygląd wykresu się nie zmienia, więc nie ma czego robić dwa razy, a wymiana prymitywów to ryzyko dla ról w e2e (`room-wide-layout/research.md:95-96`).
  6. **Test e2e ruchu** w `round.spec.ts` z próbnym alarmem. Testów zrzutów dalej brak (test-plan:440), bramką wyglądu są podglądy i zrzuty dla Karola.

## Current State Analysis

- Odsłonę montuje `RoomScreen.tsx:452-469`: `RoundReveal` z `key={view.round.number}`, więc głosowanie podmienia się na wynik w jednej klatce. Animacji na tej ścieżce nie ma, a `motion-safe:` występuje tylko w `EmoteBubbles.tsx` (research Z3).
- `RoomScreen.tsx:191-201` ma już wzorzec „adjusting state while rendering”: zmiana `announcementKey(view)` (`announce.ts:11-13`, `status:phase:number`) ustawia komunikat czytnika, nigdy przy pierwszym renderze. Ten sam punkt rozpozna odsłonę w tej karcie.
- `PlayerLink` stoi nad treścią każdego ekranu gry prowadzącego (`RoomScreen.tsx:527-536`, poza `contentRef`), także na odsłonie. Na laptopie pole zajmuje ok. 85–150 px wysokości (research Z5).
- **Prototyp galerii leży lokalnie, bez commita:**
  - `src/components/room/reveal-prototype.tsx` (nowy plik);
  - w `RoundReveal.tsx`: warianty A/B/C, stan pusty, ruch pod propem `prototype`;
  - w `RoomScreen.tsx`: `ScreenPreview.reveal` i `compact` z podglądu;
  - w `PlayerLink.tsx`: prop `compact`;
  - w `room-window.astro`: próbki `g-*` i parametry `?v=&empty=&link=&motion=`.

  Klasy ruchu z prototypu (`reveal-prototype.tsx:66-70`) to dokładnie to, co Karol zaakceptował.
- **Usterka prototypu:** w trybie `compact` kontener `PlayerLink` ma `flex-row`, więc szara linijka „link się zmienił” stanęłaby obok pola, a nie pod nim.
- **Podglądy:**
  - `room-states.astro`, sekcja „Gra: odsłona” (41–45f, ok. `:1576-1720`). Helper `revealed()` daje prowadzącemu `linkUrl` (`seat()`, `:225-229`), więc po zmianie 42 pokaże zwinięty link sam.
  - `room-window.astro` nie przekazuje `resultView`, `refreshFailed`, `link` ani `reaction` (`:940-952`, research „Macierz 7 stanów”).

## Desired End State

- Gracz, któremu wynik odsłania się w otwartej karcie (prowadzący, współhost albo gość), widzi krótki ruch. Koło obraca się i rośnie (700 ms, opóźnienie 300 ms). Tabela wjeżdża od dołu (500 ms, opóźnienie 500 ms). W „Paskach” paski rosną od lewej (1000 ms, opóźnienie 300 ms). Po odświeżeniu strony, u spóźnionego gracza i przy `prefers-reduced-motion: reduce` wynik stoi od razu. Dane, fokus na tytule i komunikat czytnika „Wynik odsłonięty.” przychodzą jak dziś.
- Prowadzący na odsłonie widzi link w jednej niskiej linijce: przygaszona etykieta, niskie pole, „Kopiuj” jako przycisk `ghost` `sm`. Po usunięciu gracza szara linijka stoi pod tą linijką. W poczekalni i głosowaniu link wygląda jak dziś.
- Kodu prototypu w repo nie ma. `RoundReveal` ma jeden wygląd, „dziś” z ruchem.
- Każdy z 7 stanów odsłony jest pokazany w `/dev/room-states` lub `/dev/room-window` albo opisany jako N/A z powodem. Karol zaakceptował zrzuty.
- `AGENTS.md` mówi, jak dodawać ruch w pokoju.
- e2e pilnuje, że ruch gra tylko w otwartej karcie i tylko pod `motion-safe`.

Weryfikacja: bramka lokalna, CI (`ci`, `smoke`, `db`, `e2e`), próbny alarm, zrzuty dla Karola, a po wdrożeniu gra Karola na telefonie i laptopie.

### Key Discoveries:

- `src/components/room/reveal-prototype.tsx:66-70`: zaakceptowane klasy ruchu (`MOTION_PIE`, `MOTION_TABLE`, `MOTION_BAR`). `MOTION_POP` służył odrzuconym wariantom A i E.
- `src/components/room/RoomScreen.tsx:191-201`: zmiana klucza widoku, nigdy przy pierwszym renderze; tu dochodzi znacznik ruchu.
- `src/components/room/RoomScreen.tsx:452-469`: `RoundReveal` z `key={view.round.number}`, czyli nowa runda to nowy montaż.
- `src/components/room/PlayerLink.tsx:66-97`: układ pola, przycisk, szara linijka (`changed`) i ukryty `aria-live`.
- `tests/e2e/support/round.ts:47-71`: wyrocznia odsłony (`resultTable`, `expectReveal`) w regionie „Wynik”. `toBeVisible` nie patrzy na `opacity`, więc tabela w trakcie wjazdu jest dla niej widoczna.
- `tests/e2e/support/room.ts:58`, `remove-player.spec.ts:35`, `cohost.spec.ts:90`: link czytany po roli `textbox` i nazwie „Link dla graczy”. Etykieta musi zostać powiązana z polem także w trybie `compact`.
- `scripts/ui-literals.mjs:13-18`: skan obejmuje cały `src/components/room/` i obie strony podglądów, także nowy `reveal-motion.ts`.
- `playwright.config.ts:30-46`: `round.spec.ts` gra tylko w projekcie `chromium`.

## What We're NOT Doing

- **Z1 (deferred):** „Reflektor”, wyróżniony wiersz ani duże paski (wybór Karola: „dziś”). Nagłówek „Wynik” i pogrubienie zostają.
- **Z2 (deferred):** zdanie stanu pustego (wybór Karola: „dziś”). Dochodzą tylko podglądy tego stanu.
- **Z4 (deferred):**
  - wspólny komponent koła odsłony i podsumowania;
  - `toggle-group` i `table` z shadcn;
  - ujednolicenie kropki gracza.
- Bez ruchu w głosowaniu, pominięciu, poczekalni i na końcu wieczoru (`GameSummary`). Bez dźwięku, odliczania i przełącznika „wyłącz animacje” w grze (wystarcza ustawienie systemu).
- Bez zmiany linku w poczekalni i głosowaniu. Bez zmiany miejsca linku (wariant D z S-09 zostaje).
- Bez nowych keyframes, tokenów `--animate-*` i zależności npm.
- Bez zmian w bazie, Workerze i `src/lib/rooms/`.

## Implementation Approach

Kolejność `/10x-ui`: środowisko i biblioteka (nic: `tw-animate-css` już jest) → wartości tokenów (nic: zero nowych wartości) → jeden widok (Faza 1) → stany (Faza 2) → zabezpieczenie (Faza 3, test i reguła). Faza 1 zaczyna od czystego `main` dla plików gry: prototyp nie wchodzi do historii, a z niego przechodzą tylko zaakceptowane klasy i tryb `compact`. Każda faza to jeden commit. Draft PR po Fazie 1 (push za zgodą Karola) daje wcześnie sygnał z e2e, że ruch nie psuje istniejących wyroczni.

## Critical Implementation Details

- **Cykl życia ruchu.** Znacznik ruchu (numer odsłoniętej rundy) ustawia się w tej samej gałęzi co komunikat czytnika (`if (key !== shownKey)`), tylko gdy nowy widok to `phase === "revealed"`. Przy pierwszym renderze się nie ustawia. `RoundReveal` dostaje go jako prop i nakłada klasy na pierwszym montażu. Klasy zostają do końca rundy, więc odpytywanie i dzwonek, które odświeżają stan bez zmiany klucza, nie puszczają ruchu drugi raz (nic się nie montuje od nowa).
- **`PlayerLink` nie może się zamontować od nowa** przy przejściu głosowanie → odsłona: ten sam element JSX, zmienia się tylko prop `compact`, bez `key`. Dzięki temu fokus na „Kopiuj”, „Skopiowano” i szara linijka przechodzą na odsłonę.
- **Serwer dev (15.11):** po starcie Vite dwa razy przebudowuje zależności („vite config has changed”), a po kilku żądaniach `/dev/*` odpowiada `The file does not exist at …/.vite/deps_ssr/@astrojs_cloudflare_entrypoints_server.js`. Restart pomaga na chwilę. Przed zrzutami wyczyść pamięć `node_modules/.vite` (za zgodą Karola, bo `rm -rf` jest zablokowane) i dopiero wtedy zrób zrzuty. Zrzuty headless Chrome robią jedno żądanie na stan.

## Faza 1: Odsłona: ruch i zwinięty link

### Overview

Zaakceptowany wygląd trafia do prawdziwego kodu gry, a prototyp znika. Po tej fazie gra wygląda jak w galerii („dziś”, ruch, zwinięty link), a `/dev/room-window` ma próbkę z ruchem.

### Changes Required:

#### 1. Kontrakt ruchu

**File**: `src/components/room/reveal-motion.ts` (nowy)

**Intent**: Jedno miejsce na ruch odsłony, żeby kolejna zmiana nie rozsiała klas po komponentach. Wartości dokładnie z prototypu, który Karol zaakceptował.

**Contract**: Eksportuje trzy stałe klas: koło (`motion-safe:animate-in fade-in zoom-in-50 spin-in-45 duration-700 delay-300 fill-mode-both`), tabela (`motion-safe:animate-in fade-in slide-in-from-bottom-2 duration-500 delay-500 fill-mode-both`) i pasek (`motion-safe:animate-in slide-in-from-left duration-1000 delay-300 fill-mode-both`). Komentarz mówi: tylko pod `motion-safe:`; klasy z `tw-animate-css` (`global.css:2`); same zmienne bez `animate-in` nic nie robią; wybór Karola 15.11.2026. Bez Reacta, sam plik stałych.

#### 2. Odsłona z ruchem, bez prototypu

**File**: `src/components/room/RoundReveal.tsx`

**Intent**: Wraca kod z `main` (jeden wygląd „dziś”) i dochodzi jeden prop: czy ta odsłona ma wejść z ruchem.

**Contract**:

- Nowy prop `animate: boolean`, przy `true` klasy z `reveal-motion.ts`: na `ResultPie` (przez jego `className`), na obramowaniu tabeli i na pasku za nickiem w „Paskach”.
- Prop `prototype`, import `reveal-prototype` i wszystkie gałęzie wariantów (`variant`, `bigBars`, `card`, `EmptyResult`, `Spotlight`, `SLICE_TINTS`, `SLICE_BORDERS` z tej ścieżki) znikają.
- Komentarz nad komponentem dostaje zdanie o ruchu: tylko przy odsłonie w tej karcie, pod `motion-safe`.
- Znaczniki, role, kolejność DOM i teksty bez zmian (`round.ts:47-71`, `AGENTS.md` §UI).

#### 3. Znacznik ruchu i zwinięty link w ekranie pokoju

**File**: `src/components/room/RoomScreen.tsx`

**Intent**: Ekran wie, że wynik odsłonił się na jego oczach, i tylko wtedy prosi o ruch. Prowadzący na odsłonie dostaje zwinięty link.

**Contract**:

- Stan `motionRound: number | null`. W gałęzi `key !== shownKey` (`:197-201`): gdy `view.round?.phase === "revealed"`, to `motionRound = view.round.number`. Przy pierwszym renderze `null`, chyba że podgląd prosi o ruch.
- `ScreenPreview` traci `reveal?: RevealPrototype` i dostaje `revealMotion?: boolean`: odsłona z podglądu wchodzi z ruchem przy montażu. Prawdziwa strona go nie ustawia.
- `RoundReveal` dostaje `animate={motionRound === view.round.number}`.
- `PlayerLink` dostaje `compact={view.round?.phase === "revealed"}`, bez `key`. Komentarz przy linku wskazuje wybór Karola 15.11.2026 (reveal-ui).
- Dopisane po przeglądzie implementacji (F4, 2026-11-16): na odsłonie zwinięte propozycje pytań (pigułka `QuestionProposals`) stoją w osobnej linijce nad zwiniętym linkiem (`onLinkLine` fałszywe przy `phase === "revealed"`), bo w jednej linijce z linkiem zasłaniały „Kopiuj”. Wybór Karola (a) przy akceptacji Fazy 1, zapisany w `research.md` (Z5, „Status”) i w komentarzu `RoomScreen.tsx` przy `QuestionProposals`.

#### 4. Zwinięty link

**File**: `src/components/room/PlayerLink.tsx`

**Intent**: Tryb `compact` z prototypu staje się prawdziwy, z poprawionym miejscem szarej linijki.

**Contract**:

- Prop `compact?: boolean` (domyślnie `false`). W trybie `compact` jeden wiersz: etykieta (`text-muted-foreground`, `font-normal`, nie zwęża się), pole `h-8 text-xs text-muted-foreground` wypełniające resztę, „Kopiuj” / „Skopiowano” jako `variant="ghost"` `size="sm"`.
- Szara linijka `changed` i ukryty `aria-live` stoją pod wierszem w obu trybach: kontener zostaje `flex-col`, a wiersz etykiety i pola to osobny element.
- `Label htmlFor` zostaje, więc nazwa pola się nie zmienia.
- Komentarz komponentu mówi o trybie zwiniętym na odsłonie (wybór Karola) i usuwa słowo „TEMPORARY”.

#### 5. Sprzątanie prototypu i próbka z ruchem

**File**: `src/components/room/reveal-prototype.tsx` (usunąć), `src/pages/dev/room-window.astro`

**Intent**: W repo nie zostaje nic z galerii, a ruch da się obejrzeć na żywo.

**Contract**:

- `reveal-prototype.tsx` usunięty.
- W `room-window.astro` znikają: import typów prototypu, `oneTopResults`, `zeroResults`, próbki `g-*`, parsowanie `?v=&empty=&link=&motion=` i `reveal` w `preview`.
- `Sample` dostaje `revealMotion?: boolean` przekazywane do `preview`. Nowa próbka `reveal-host-motion` („Odsłona: host, 5 graczy, z ruchem”) z tymi samymi danymi co `reveal-host`.
- Na stronie tej próbki stoi przycisk „Powtórz ruch”, tylko w dev: krótki skrypt w stronie, który puszcza od nowa animacje CSS ekranu przez `document.getAnimations()`, z `cancel()` i `play()`. Dzięki niemu ruch da się obejrzeć bez F5.

### Success Criteria:

#### Automated Verification:

- `npm run lint` (z `ui-literals: 0 literals`), `npx astro check`, `npm test`, `npm run build` zielone
- `git grep -n "reveal-prototype\|RevealPrototype\|reveal-ui gallery"` nic nie znajduje
- Draft PR (push za zgodą Karola): zielone `ci`, `smoke`, `db`, `e2e`; istniejące wyrocznie odsłony (`round`, `game`, `cohost`, `latecomer`, `remove-player`, `question-list`) przechodzą z ruchem

#### Manual Verification:

- Karol na `/dev/room-window?state=reveal-host-motion` (przycisk „Powtórz ruch”) widzi ten sam ruch co w prototypie, a na `?state=reveal-host` zwinięty link bez ruchu

**Implementation Note**: Po zielonym CI zatrzymaj się na krótkie „tak” Karola przed Fazą 2.

---

## Faza 2: Stany odsłony i zrzuty

### Overview

Macierz 7 stanów odsłony z nowym linkiem i ruchem: każdy stan pokazany w podglądach albo opisany jako N/A z powodem. Na końcu zrzuty dla Karola (bramka wizualna).

### Changes Required:

#### 1. Nowe stany w `/dev/room-states`

**File**: `src/pages/dev/room-states.astro` (sekcja „Gra: odsłona”, numery wolne po 44 i 45f)

**Intent**: Brakujące stany z macierzy researchu, w ramce strony podglądów.

**Contract**: Nowe sekcje, każda z opisem w `h2`, jak sąsiednie:

- host: wszyscy się wstrzymali (pasek prowadzącego, zwinięty link);
- gość: nikt nie zagłosował (0 kart, 0 wstrzymań);
- gość: odsłona z `refreshFailed`;
- host: odsłona z `link: { changed: true }` (zwinięty link z szarą linijką pod spodem).

Opis sekcji 42 dostaje zdanie, że link na odsłonie jest zwinięty.

#### 2. Nowe stany w `/dev/room-window`

**File**: `src/pages/dev/room-window.astro`

**Intent**: Te same stany w prawdziwej ramie okna, do zrzutów całego okna.

**Contract**:

- `Sample` dostaje `resultView`, `refreshFailed` i `link` (typ z `PlayerLink`), przekazywane do `preview`.
- Nowe próbki: `reveal-host-bars` („Paski”), `reveal-host-abstained` (wszyscy się wstrzymali), `reveal-guest-nobody` (0 kart), `reveal-host-link-changed`, `reveal-guest-refresh-failed`.
- Lista próbek na stronie startowej pokazuje je jak pozostałe.

#### 3. Macierz 7 stanów (kryteria tej fazy)

**File**: — (sprawdzenie na podglądach)

**Intent**: Każda komórka pokazana albo N/A z powodem (`/10x-ui`).

**Contract**:

| Stan          | Gdzie                                                                                     | Uwagi                                                                                                                                           |
| ------------- | ----------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| default       | 42, `reveal-host`, `reveal-host-bars`, `reveal-host-motion`                                | zwinięty link; ruch tylko w próbce z ruchem                                                                                                     |
| hover         | `reveal-host` (ręcznie: „Kopiuj” w trybie `ghost`, przełącznik)                           | wymuszonego stanu repo nie ma nigdzie, opis jak przy 42/45f                                                                                     |
| focus-visible | `reveal-host` (Tab: tytuł → … → „Kopiuj”)                                                  | pierścień z `Button`; fokus po odsłonie na tytule bez zmian                                                                                     |
| disabled      | N/A dla linku i ruchu                                                                     | „Kopiuj” nigdy nie jest wyłączony, przełącznik działa lokalnie; zajętość paska prowadzącego już jest (54, 177)                                   |
| error         | nowa sekcja i `reveal-guest-refresh-failed`                                               | brak schowka (pole zaznaczone) N/A: podgląd nie odmówi schowka, zachowanie bez zmian                                                            |
| empty         | nowe: host przy samych wstrzymaniach, gość przy 0 kartach (+ 44)                            | wygląd „dziś”, bez zdania (wybór Karola)                                                                                                        |
| loading       | N/A                                                                                       | wynik przychodzi razem ze stanem pokoju, a ruch nie jest ładowaniem (dane są od pierwszej klatki)                                               |

### Success Criteria:

#### Automated Verification:

- `npm run lint` (z `ui-literals: 0 literals`), `npx astro check`, `npm test`, `npm run build` zielone
- Każda nowa próbka `/dev/room-window?state=…` i strona `/dev/room-states` odpowiadają 200 na serwerze dev (po wyczyszczeniu `node_modules/.vite`, Critical Implementation Details)

#### Manual Verification:

- Karol akceptuje zrzuty na stronie „Co oceniasz” w swoim Chrome. Laptop: całe okno 1280×600 w skali 1. Telefon: 390 px w prawdziwej wielkości. Stany: `reveal-host`, `reveal-host-link-changed`, `reveal-host-abstained`, `reveal-guest-nobody` oraz telefon `reveal-host`
- Macierz 7 stanów kompletna: każda komórka pokazana albo N/A z powodem (tabela wyżej)

**Implementation Note**: Po akceptacji Karola commit i dopiero potem Faza 3.

---

## Faza 3: Test ruchu, zasada i PR

### Overview

Zabezpieczenie zmiany: e2e pilnuje, kiedy ruch gra, próbny alarm dowodzi, że test łapie usterkę, a `AGENTS.md` mówi kolejnemu agentowi, jak dodawać ruch. Dokumenty i PR gotowy do scalenia.

### Changes Required:

#### 1. e2e: kiedy ruch gra

**File**: `tests/e2e/support/round.ts`, `tests/e2e/round.spec.ts`

**Intent**: Wyrocznia z decyzji Karola i sesji 15.11: ruch gra tylko przy odsłonie w otwartej karcie i tylko pod `motion-safe`.

**Contract**:

- Helper `revealMotion(page): Promise<number>`: liczba animacji CSS w regionie „Wynik” (`element.getAnimations({ subtree: true })`, tylko `CSSAnimation`, bez przejść). Skończona animacja z `fill-mode-both` dalej należy do `getAnimations()`, więc wynik nie zależy od tego, kiedy test pyta.
- W `round.spec.ts`:
  - gość A przed odsłoną przełącza stronę na `page.emulateMedia({ reducedMotion: "reduce" })`;
  - po `expectReveal` na trzech ekranach: host i gość B mają ruch (> 0), a gość A nie ma (0);
  - gość B przeładowuje stronę, znowu `expectReveal`, a ruchu nie ma (0).
- Asercje `expect.soft` z nazwami („ruch po odsłonie w karcie…”). Komentarz na górze pliku dostaje zdanie o ruchu.

#### 2. Próbny alarm

**File**: tymczasowy commit na gałęzi (test-plan §6.4)

**Intent**: Dowód, że nowe asercje świecą, gdy pęknie reguła ruchu.

**Contract**:

- Jeden commit: `RoundReveal` dostaje ruch zawsze (także przy pierwszym montażu), a klasy w `reveal-motion.ts` tracą `motion-safe:`. Dopisane po przeglądzie (F4, 2026-11-16): ruch „zawsze” włączył `RoomScreen.tsx`, który prosi `RoundReveal` o ruch (`animate={motionRound !== -1}`, więc lint i typy zostały zielone); sam `RoundReveal.tsx` alarm zostawił bez zmian. Dokładny opis w test-planie §6.4.
- Przewidziane czerwone: dokładnie 2 miękkie asercje w `round.spec.ts` (gość A przy `reduce`, gość B po przeładowaniu). Asercje hosta i B przed przeładowaniem oraz wszystkie inne spece zostają zielone.
- Push, porównanie z CI, `git revert`, push. Wynik zapisany w test-plan §6.4.

#### 3. Zasada dla agentów

**File**: `AGENTS.md` (sekcja `## UI`)

**Intent**: Zabezpieczenie `/10x-ui`: kolejny agent dodaje ruch tą samą drogą.

**Contract**: Jeden punkt:

- ruch w pokoju tylko pod `motion-safe:`;
- klasy `tw-animate-css` zebrane w module (wzór `src/components/room/reveal-motion.ts`), a własny keyframe dopiero, gdy klas nie wystarczy: jako `--animate-*` w `@theme` (`global.css`, jak `emote-rise`);
- ruch nigdy nie opóźnia danych ani fokusu i nie odlicza czasu;
- ruch odsłony gra tylko przy zmianie fazy w karcie.

Bez nowej kontroli w lincie: `ui-literals` już obejmuje cały `src/components/room/`.

#### 4. Dokumenty zmiany

**File**: `context/changes/reveal-ui/research.md`, `context/foundation/test-plan.md`, `context/changes/reveal-ui/change.md`

**Intent**: Zarzuty bez poprawki zostają z powodem, a testy i alarm są opisane tam, gdzie szuka ich kolejna sesja.

**Contract**:

- `research.md` `## Charges`: przy Z1, Z2 i Z4 linijka **Status: deferred** z powodem (wybór Karola „dziś” 15.11; Z4: bez zmiany wykresu nie ma podwójnej pracy). Przy Z3 i Z5 status „Faza 1 planu”.
- test-plan §6.4: wpis `round.spec.ts` dostaje zdanie o ruchu i wynik próbnego alarmu.
- `change.md`: notka o wdrożeniu po scaleniu (status prowadzą skille).

#### 5. PR i wdrożenie

**File**: — (polecenia, każde za zgodą Karola)

**Intent**: Bez migracji, więc kod wchodzi zwykłym scaleniem.

**Contract**: `gh pr ready`, zielone CI na ostatnim SHA → scalenie przez Karola (`! gh pr merge <n> --merge`) → Workers Builds zielony → smoke na produkcji (zgoda) → ręczne sprawdzenie Karola.

### Success Criteria:

#### Automated Verification:

- `npm run lint`, `npx astro check`, `npm test`, `npm run build` zielone; `npx playwright test --list` widzi zmieniony `round.spec.ts`
- Próbny alarm w CI trafił dokładnie w 2 przewidziane asercje `round.spec.ts`, a po revercie znów zielono
- PR gotowy (nie draft): zielone `ci`, `smoke`, `db`, `e2e` na ostatnim SHA
- Po scaleniu przez Karola: Workers Builds zielony, smoke na produkcji zielony

#### Manual Verification:

- Karol na produkcji, telefon + laptop, jedna runda:
  - wynik wjeżdża z ruchem na obu ekranach;
  - po odświeżeniu strony na odsłonie wynik stoi bez ruchu;
  - u prowadzącego link na odsłonie jest w jednej linijce i „Kopiuj” kopiuje;
  - na iPhonie (Safari) dotknięcie zwiniętego pola z linkiem i „Kopiuj” nie powiększa strony (przegląd implementacji F2; jeśli powiększa, w trybie `compact` `PlayerLink.tsx` zamienić `text-xs` na `text-base md:text-xs`);
  - w następnym głosowaniu link jest pełny

---

## Testing Strategy

### Unit Tests:

- Bez nowych: `chart.ts` i `results.ts` się nie zmieniają, więc `chart.test.ts` i `results.test.ts` dalej pilnują progów, kolejności i kątów. Reguła ruchu żyje w stanie `RoomScreen`, a repo nie ma testów komponentów (brak `@testing-library`), więc pilnuje jej e2e.

### Integration Tests:

- `round.spec.ts` (Faza 3): ruch u hosta i gościa B po odsłonie w karcie, brak ruchu u gościa A z `reduce` i u B po przeładowaniu.
- Siatka regresji bez zmian w kodzie testów: `expectReveal` w `round`, `cohost`, `question-list`, `latecomer`, `remove-player`; widoczność tabeli w `game`, `proposals`, `rejoin`, `game-length`; `game.spec.ts:102-113` (odsłona wyższa niż okno 1024×400, „Następne pytanie” w oknie); pole „Link dla graczy” w `room.ts:58`, `remove-player`, `cohost`.

### Manual Testing Steps:

1. `/dev/room-window?state=reveal-host-motion`, „Powtórz ruch”: koło, tabela, po „Paski” paski.
2. Chrome DevTools → Rendering → `prefers-reduced-motion: reduce` na tej samej próbce: nic się nie rusza.
3. `/dev/room-window?state=reveal-host-link-changed`: szara linijka pod zwiniętym linkiem, nie obok.
4. Tab na `reveal-host`: widoczny fokus na „Kopiuj” w trybie `ghost`.
5. Po wdrożeniu: runda na telefonie i laptopie (Faza 3, Manual).

## Performance Considerations

Ruch to animacje CSS na `opacity` i `transform` (składane przez GPU), jednorazowo na odsłonę. Przy 20 graczach w „Paskach” to 20 krótkich animacji. Kosztu w JS nie ma, poza jednym stanem w `RoomScreen`.

## Migration Notes

Brak. Bez bazy i bez zmian w Workerze. Cofnięcie: revert PR albo wersja Workera sprzed scalenia.

## References

- Research: `context/changes/reveal-ui/research.md` (Z1–Z5, macierz 7 stanów, „Granice dla wariantów”)
- Wybór Karola: `context/changes/reveal-ui/change.md`
- Wzór ruchu: `src/components/room/EmoteBubbles.tsx:19`, `:63`, `src/styles/global.css:165-186`
- Wzór „adjusting state while rendering”: `src/components/room/RoomScreen.tsx:191-201`, `src/components/room/PlayerLink.tsx:34-40`
- Poprzedni `/10x-ui`: `context/archive/2026-10-15-room-wide-layout/`
- Link dla graczy (S-09, wariant D, „Szara linijka”): `context/changes/remove-player-new-link/plan.md:414`

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: Odsłona: ruch i zwinięty link

#### Automated

- [x] 1.1 `npm run lint` (z `ui-literals: 0 literals`), `npx astro check`, `npm test`, `npm run build` zielone — ba99478
- [x] 1.2 `git grep -n "reveal-prototype\|RevealPrototype\|reveal-ui gallery"` nic nie znajduje — ba99478
- [x] 1.3 Draft PR (push za zgodą Karola): zielone `ci`, `smoke`, `db`, `e2e`; istniejące wyrocznie odsłony przechodzą z ruchem — ba99478

#### Manual

- [x] 1.4 Karol widzi na `reveal-host-motion` ten sam ruch co w prototypie, a na `reveal-host` zwinięty link bez ruchu — ba99478

### Phase 2: Stany odsłony i zrzuty

#### Automated

- [x] 2.1 `npm run lint` (z `ui-literals: 0 literals`), `npx astro check`, `npm test`, `npm run build` zielone — bdf7a46
- [x] 2.2 Nowe próbki `/dev/room-window` i `/dev/room-states` odpowiadają 200 na serwerze dev — bdf7a46

#### Manual

- [x] 2.3 Karol akceptuje zrzuty (laptop 1280×600 1:1, telefon 390 px) na stronie „Co oceniasz” — bdf7a46
- [x] 2.4 Macierz 7 stanów kompletna: każda komórka pokazana albo N/A z powodem — bdf7a46

### Phase 3: Test ruchu, zasada i PR

#### Automated

- [x] 3.1 `npm run lint`, `npx astro check`, `npm test`, `npm run build` zielone; `npx playwright test --list` widzi zmieniony `round.spec.ts` — 107b5ca
- [x] 3.2 Próbny alarm w CI trafił dokładnie w 2 przewidziane asercje `round.spec.ts`, revert znów zielony — 6ce4fc5
- [x] 3.3 PR gotowy (nie draft): zielone `ci`, `smoke`, `db`, `e2e` na ostatnim SHA — 6ce4fc5
- [x] 3.4 Po scaleniu przez Karola: Workers Builds zielony, smoke na produkcji zielony — 25345d7

#### Manual

- [x] 3.5 Karol na produkcji (telefon + laptop): ruch przy odsłonie, brak ruchu po odświeżeniu, zwinięty link kopiuje (na iPhonie bez powiększania strony, F2), w głosowaniu link pełny (gra z ekipą 19.11.2026)
