<!-- PLAN-REVIEW-REPORT -->

# Plan Review: Wersja angielska gry

- **Plan**: `context/changes/english-version/plan.md`
- **Mode**: Deep
- **Date**: 2026-11-21
- **Verdict**: REVISE → SOUND po triage (wszystkie 8 ustaleń poprawione w planie)
- **Findings**: 1 critical, 5 warnings, 2 observations

## Verdicts

| Dimension             | Verdict |
| --------------------- | ------- |
| End-State Alignment   | FAIL    |
| Lean Execution        | PASS    |
| Architectural Fitness | WARNING |
| Blind Spots           | WARNING |
| Plan Completeness     | WARNING |

## Grounding

30/30 paths ✓, 12/12 symbols ✓ (`plan(512)`, `LOBBY_KEYS`, `HISTORY_KEYS`, `versions_of`, `function_facts`, `gameSteps`/`closingSteps`, `LINK_CARD`, `QUESTIONS_RAN_OUT`, `questionText` i inne), brief↔plan ✓, Progress↔Fazy ✓.

## Findings

### F1 — Początek pytania w języku ekranu skleja dwa języki

- **Severity**: ❌ CRITICAL
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: End-State Alignment
- **Location**: Faza 1 §2 (`questionSentence`), Faza 3 §2, Faza 4 §3, decyzja 8
- **Detail**: Faza 1 mówi „początek zdania należy do języka ekranu”. Przy przełączniku język ekranu ≠ język tekstu w trzech przypadkach. (a) Pytanie bazy bez angielskiego na ekranie EN w polskiej grze daje „Who’s most likely to spóźnić się…?”, a decyzja 8 mówi „po polsku”. (b) Pytanie hosta albo propozycja gościa (w języku gry) na ekranie w drugim języku daje „Kto z nas najprawdopodobniej be late…?”. (c) „Popraw” wpisuje w pole `question.text` (`QuestionList.tsx:108`, `:126-128`), który Worker oddaje w języku ekranu hosta. Zapis idzie jako `p_text` (`server.ts:782`) i staje się pytaniem hosta w złym języku dla wszystkich graczy. Podpowiedzi „Kto z nas najprawdopodobniej…” w formularzach (`QuestionList.tsx:390`, `ProposalForm.tsx:46`, `QuestionField.tsx:58`) w języku ekranu zachęcają do pisania w złym języku. Research (§3) podał właśnie to mieszanie jako powód, dla którego język należy do gry.
- **Fix**: Reguła „treść pytania w języku tekstu, reszta w języku ekranu”. Pytanie rundy, lista hosta i historia niosą `{text, lang}`: tekst bazy ma język z `questionText`, a pytanie hosta i propozycja mają język gry. `questionSentence` bierze początek ze słownika tego języka, a zdanie dostaje `lang`, gdy różni się od ekranu. Lista hosta i „Popraw” idą w języku gry, a podpowiedzi w formularzach pytań też w języku gry.
  - Strength: zgodne z decyzją 8 i z argumentem researchu; jedna reguła na rundę, listę, historię i czytnik ekranu.
  - Tradeoff: host z ekranem PL w grze EN przegląda listę po angielsku; wyspa potrzebuje początku zdania z obu słowników (i tak oba są w paczce od Fazy 4).
  - Confidence: HIGH — wszystkie trzy przypadki sprawdzone w kodzie.
  - Blind spot: zdania czytnika z pytaniem (`announce.ts:26`) muszą wziąć tę samą regułę.
- **Decision**: FIXED (Fix in plan: decyzja 8, Desired End State, Critical Implementation Details „Język treści pytania”, Faza 1 §2, Faza 3 §2, Faza 4 §3, Testing Strategy)

### F2 — Strażnik i sprawdzenia widzą tylko polskie litery

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Blind Spots
- **Location**: Faza 1 §3 i kryteria 1.2–1.3, Faza 4 kryterium 4.2
- **Detail**: Wiele dzisiejszych napisów nie ma ąćęłńóśźż: „Gracze” (16×), „Nowa gra” (18×), „Anuluj”, „Czat”, „Zapisz”, „Wyloguj”, „Zaloguj przez Google”, „Historia gry”, „Twoje gry”, „Kolory”, „Popraw”, „Kto z nas najprawdopodobniej…”. Cel Fazy 1 („żaden widoczny napis nie zostaje w kodzie”) nie ma sprawdzenia: porównanie przed i po zestawia polski z polskim, więc pominięty napis wygląda tak samo. Kryterium 4.2 („po angielsku bez polskich liter”) nie złapie tych samych napisów. Zostawione „Gracze” na angielskim ekranie znalazłby dopiero Karol na zrzutach (4.6). Do tego w zasięgu strażnika są pliki spoza listy przenosin: `src/components/live-sync/LiveSyncDemo.tsx`, `src/lib/live-sync/server.ts:184` (sonda dev) i `src/components/Banner.astro`.
- **Fix A ⭐ Recommended**: Pseudosłownik w Fazie 1. Język tylko dla `/dev/*` (`?lang=xx`, poza typem `Lang`), zrobiony z polskiego: każdy napis w znacznikach, np. `⟦Gracze⟧`. Skrypt porównania wypisuje każdy widoczny tekst i nazwę dostępną bez znaczników, która nie jest daną przykładową podglądu.
  - Strength: dowodzi celu Fazy 1 przed angielskim, w każdym stanie podglądu, niezależnie od liter; Faza 4 użyje go ponownie.
  - Tradeoff: jeszcze jedna gałąź w `messages` (tylko dev) i lista danych przykładowych (nicki, końcówki pytań) w skrypcie.
  - Confidence: MED — znana technika, lista danych przykładowych może być żmudna.
  - Blind spot: napisy tylko po akcji (czytnik, błędy), jak dziś.
- **Fix B**: Szerszy strażnik i słownictwo w Fazie 4. `ui-text` odmawia każdego tekstu JSX i atrybutu tekstowego z literami (w każdym języku). Faza 4 szuka na angielskich podglądach słów ze słownictwa polskiego słownika i `questions.ts`.
  - Strength: bez nowego trybu w kodzie; strażnik zatrzyma też przyszły angielski wpisany na sztywno.
  - Tradeoff: heurystyka; stała w TS (`const label = "Gracze"`) przejdzie; sprawdzenie dopiero po scaleniu PR A.
  - Confidence: MED — skuteczność zależy od pokrycia słownictwa.
  - Blind spot: słowa wspólne dla obu języków (np. „Start”).
- **Decision**: FIXED (Fix A: Faza 1 §1 i §3, kryterium i Progress 1.7, Faza 4 kryterium i Progress 4.2)

### F3 — Dwie drogi losowania nie czytają room_lobby

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Completeness
- **Location**: Faza 2 §3
- **Detail**: „Przejrzyj pytania” (`src/pages/api/rooms/[id]/question-list.ts:30,34`) i „Dolosuj pytanie” (`question-draw.ts:30,34`) biorą kategorie z `hostRoomCategories` (`server.ts:871-887`, select z `rooms`), nie z `room_lobby`. Liczba dla „Jeszcze 5 pytań” (`leaderMoreQuestions` `server.ts:382-386`, `drawSelection` `:355-357`) liczy się z puli. Planu nie ma tych plików, a `english.spec.ts` nie przechodzi przez przegląd listy, więc angielska gra po przeglądzie dolosowałaby pytania bez angielskiego tekstu.
- **Fix**: `language` jako wymagane pole `QuestionSelection` (`npx astro check` wskaże wszystkie 7 miejsc: start, next, more, skip, question-list, question-draw, `leaderMoreQuestions`), `language` w select i `RoomCategoriesResult` `hostRoomCategories` (grant select na tabelę już jest, `first_live_round.sql:34`), oba pliki tras w liście Fazy 2.
- **Decision**: FIXED (Fix in plan: Faza 2 §3, File i Contract)

### F4 — Odświeżenie po przełączniku zależy od zapisu ciasteczka

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Architectural Fitness
- **Location**: Critical Implementation Details „Przełącznik w pokoju”, Faza 4 §3
- **Detail**: Wyspa czeka na 204, Worker bierze język z ciasteczka, a widok w innym języku wyspa odrzuca i pobiera ponownie. Gdy przeglądarka nie zapisze ciasteczka (zablokowane, ścisła prywatność, część przeglądarek w aplikacjach), każdy `GET …/lobby` oddaje język gry. Wyspa odrzuca go w kółko i pokój przestaje się odświeżać. Do tego kliknięcie czeka na sieć, zanim cokolwiek się zmieni.
- **Fix**: Wyspa prosi wprost: `GET …/lobby?lang=<ekran>`. Adres to dziś zwykły szablon (`useRoomState.ts:288`), a testy patrzą tylko na `pathname` (`tests/e2e/support/room.ts:65,73`). Język wyspa czyta z refa, bo efekt dzwonków nie może się uruchomić ponownie (`useRoomState.ts:391-396`, `:466`). Endpoint bierze parametr, potem ciasteczko, potem język gry. `POST /api/lang` idzie równolegle, tylko dla następnych wczytań strony. Widok sprzed kliknięcia wyspa odrzuca raz, bo następne pobranie już prosi o dobry język.
  - Strength: bez zależności od kolejności i bez pętli; przełącznik działa od razu; limiter już odrzuca stare odpowiedzi (`limiter.ts:102-103`).
  - Tradeoff: jedno wejście więcej w endpoincie (`pl`|`en`) i test do niego.
  - Confidence: HIGH — budowa adresu i testy sprawdzone.
  - Blind spot: przy zablokowanych ciasteczkach przeładowanie wraca do języka gry (do zapisania jako znane).
- **Decision**: FIXED (Fix in plan: Critical Implementation Details „Przełącznik w pokoju”, Faza 4 §3, Testing Strategy)

### F5 — Sprawdzenie next przepuszcza /\evil.com

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Blind Spots
- **Location**: Faza 4 §3 (`/api/lang`), §7 (smoke)
- **Detail**: Reguła „zaczyna się od `/`, nie od `//`” przepuszcza `/\evil.com` i `/<tab>/evil.com`. Przeglądarka czyta `\` jak `/` i usuwa tabulatory, więc 303 prowadzi na obcą stronę z adresu gry. Repo nie ma dziś takiego strażnika, bo wszystkie przekierowania idą na stałe ścieżki. Nie wiadomo też, po czym trasa odróżni formularz (303) od wyspy (204).
- **Fix**: `new URL(next, url.origin)`, zgoda tylko przy tym samym `origin`, przekierowanie na `pathname + search`, inaczej `/`; wyspa wysyła JSON we wzorze `refuseForeignPost` (`src/lib/rooms/json-route.ts:47-58`) → 204, formularz → 303; testy unit i smoke z `/\evil.com`, `//evil.com`, `https://evil.com`.
- **Decision**: FIXED (Fix in plan: Faza 4 §3 i §7, Testing Strategy)

### F6 — Angielskie pytania bez strażnika importu

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Blind Spots
- **Location**: Faza 3 §1, Faza 4 §4
- **Detail**: Reguła z `lessons.md` („Pytania gry tylko po stronie serwera”) jest dziś tylko tekstem: ani ESLint, ani skrypt nie skanuje paczki (`eslint.config.js:99-139`). Faza 4 kładzie angielskie nazwy kategorii na „Nowa gra”, a najprostszy skrót to import z `questions-en.ts` w wyspie: 960 tekstów z 18+ w przeglądarce każdego gracza.
- **Fix**: w Fazie 3 `no-restricted-imports` dla `@/data/*` w `src/components/**/*.tsx` i lokalny próbny alarm (import na próbę czerwieni `npm run lint`).
- **Decision**: FIXED (Fix in plan: Faza 3 §1, kryterium i Progress 3.5)

### F7 — Remis i q=0 w Accept-Language

- **Severity**: OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Blind Spots
- **Location**: Faza 4 §3 (funkcja rozstrzygająca)
- **Detail**: „Według wag `q`” nie mówi, co przy `en;q=0.8, pl;q=0.8`. Według RFC `pl;q=0` znaczy „nie chcę”.
- **Fix**: sortuj po `q` malejąco, przy równym `q` wcześniejszy na liście (decyzja 4), `q=0` pomijaj; dwa wiersze w tabeli testów.
- **Decision**: FIXED (Fix in plan: Faza 4 §3, Testing Strategy)

### F8 — RoomMessage i ServerError nie są tylko serwerowe

- **Severity**: OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Completeness
- **Location**: Faza 1 §1 (kontekst React)
- **Detail**: Plan owija kontekst w „komponentach rysowanych tylko na serwerze (`GameHistory`, `RoomMessage`, `ServerError`)”. Tymczasem `RoomMessage` jest w wyspie `JoinWaiting`, a `ServerError` w 9 wyspach (`HostActions`, `NewGameForm`…).
- **Fix**: komponenty czytają kontekst jak każde inne; dostawca owija wywołania w plikach `.astro` (`LinkScreen.astro`, `r/[id].astro`, `SignInCard.astro`, `gry/[id].astro`).
- **Decision**: FIXED (Fix in plan: Faza 1 §1)
