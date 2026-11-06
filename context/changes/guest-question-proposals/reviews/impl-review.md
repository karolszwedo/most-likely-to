<!-- IMPL-REVIEW-REPORT -->

# Implementation Review: Propozycje pytań od gości (S-10)

- **Plan**: context/changes/guest-question-proposals/plan.md
- **Scope**: Fazy 1, 2, 3 z 4 (Faza 4 ma otwarte ręczne 4.5 i 4.6)
- **Reviewed phases**: 1, 2, 3
- **Date**: 2026-11-06
- **Verdict**: NEEDS ATTENTION
- **Findings**: 0 critical, 1 warning, 6 observations

Kod oceniany: `git diff 111f660..0c74c8b`. Bramka lokalna zielona 2026-11-06 (`npm run lint`, `npx astro check` 195 plików, `npm test` 968/968, `npm run build`), na PR i na `main` zielone `ci`, `smoke`, `db`, `e2e`. Zgodność z planem: MISSING 0. Bezpieczeństwo, anonimowość głosów, sprzątanie danych i rachunek pytań bez uwag.

## Verdicts

| Dimension           | Verdict                     |
| ------------------- | --------------------------- |
| Plan Adherence      | PASS                        |
| Scope Discipline    | WARNING (F7)                |
| Safety & Quality    | WARNING (F1, F2, F4)        |
| Architecture        | PASS                        |
| Pattern Consistency | WARNING (F3, F5, F6)        |
| Success Criteria    | PASS (4.5 i 4.6 oczekujące) |

## Findings

### F1 — Dzwonki propozycji spowalniają ekrany graczy bez roli

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Safety & Quality
- **Location**: `src/pages/api/rooms/[id]/propose.ts:39`, `proposal-approve.ts:46`, `proposal-reject.ts:43`; mechanizm `src/lib/live-sync/limiter.ts:52`, `:109`, `src/components/room/useRoomState.ts:243`
- **Detail**: Każda z trzech tras dzwoni na kanale całego pokoju. U gracza bez roli, który nie jest autorem, stan się nie zmienia, więc `fetchState` daje `false`, a limiter uznaje to za spam i podwaja `gap`. Przerwa wraca do 500 ms dopiero po znalezieniu zmiany, a na odsłonie nic jej nie zmienia, bo kciuki nie dzwonią. Scenariusz: na odsłonie dwie osoby proponują, prowadzący zatwierdza obie i naciska „Następne pytanie”. Prowadzący i autorzy widzą pytanie od razu, reszta do 8 s później (własne odpytanie), a PRD wymaga 2 s (`context/foundation/prd.md:148`). To samo dotyczy rozliczania propozycji w czasie czekania na ostatni głos. Pomiar prawdziwym `limiter.ts` na sztucznym zegarze, 400 faz odpytywania, pobranie 120 ms; odsetek liczy fazy, nie częstość w grze:

| Przebieg przed „Następne pytanie” | mediana | p90    | maks. | powyżej 2 s |
| --------------------------------- | ------- | ------ | ----- | ----------- |
| bez propozycji                    | 120 ms  | 120 ms | 0,6 s | 0%          |
| 1 propozycja, następne po 2 s     | 120 ms  | 201 ms | 0,6 s | 0%          |
| 2 propozycje, decyzje co 2 s      | 120 ms  | 7,3 s  | 8,1 s | 25%         |
| 2 propozycje, decyzje co 3 s      | 4,1 s   | 6,1 s  | 6,1 s | 77%         |
| 3 propozycje, decyzje co 2 s      | 2,1 s   | 7,3 s  | 8,1 s | 77%         |

Testy tego nie łapią: w `proposals.spec.ts` przy „Następne pytanie” gość A jest autorem, a gość B współhostem, więc nikt nie gra gracza bez roli. Plan i przegląd planu limitera nie omawiają. Repo zna zasadę „stan się nie zmienia, więc bez dzwonka” (`emote.ts:15`, `QuestionList.tsx:17`). Główna sesja potwierdziła mechanizm w kodzie limitera.

- **Fix A ⭐ Recommended**: Osobne zdarzenie na kanale dla ruchów propozycji, które na ekranie obsługują tylko prowadzący (`view.leader`); pozostali je pomijają i dostają zmianę z własnego odpytania.
  - Strength: Tylko prowadzący potrzebują tej zmiany natychmiast, a limiter zostaje nietknięty. Mniej odczytów bazy, kilka linii kodu.
  - Tradeoff: Licznik autora po decyzji prowadzącego odświeża się do 8 s później. Asercja czasu dla licznika autora w `proposals.spec.ts` trzeba zmienić, a plan dostaje dopisek.
  - Confidence: HIGH — tylko `proposals` u prowadzącego i `own_proposals` autora zależą od tych ruchów.
  - Blind spot: Sposób odczytu `view.leader` w subskrypcji `useRoomState` do sprawdzenia przy implementacji.
- **Fix B**: Osobne zdarzenie i drugi tor w limiterze, z własną przerwą, która nie rusza `gap` prawdziwych dzwonków.
  - Strength: Licznik autora zostaje natychmiastowy, plan bez zmian.
  - Tradeoff: Więcej kodu w elemencie chroniącym przed spamem, a każdy gracz nadal pobiera stan przy każdej propozycji.
  - Confidence: MED — symulacja nie była robiona na tym wariancie.
  - Blind spot: Oba tory dzielą jedno pobranie w toku, co może dać nowe przypadki brzegowe.
- **Decision**: PENDING

### F2 — Limit 3 działa na gracza, pokój nie ma sufitu

- **Severity**: 💬 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: `supabase/migrations/20261104095452_guest_question_proposals.sql:178-180`; `join_room` w `20261031090821_player_color_choice.sql:165`
- **Detail**: Osoba z linkiem w poczekalni może skryptem założyć wielu graczy i wysłać po 3 propozycje. 1000 fałszywych graczy to 3000 propozycji i około 450 KB u prowadzącego przy każdym pobraniu. W grze sufit jest naturalny, bo wejście wymaga wpuszczenia. Główny brak to limit graczy w `join_room`, sprzed S-10. Plan świadomie nie ma limitu na pokój („What We're NOT Doing”).
- **Fix**: Przyjąć: link dostają znajomi. Limit graczy w `join_room` dopisać do roadmapy.
- **Decision**: PENDING

### F3 — Czytnik ekranu nie usłyszy drugiej propozycji tej samej osoby

- **Severity**: 💬 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Pattern Consistency
- **Location**: `src/components/room/QuestionProposals.tsx:172-175`
- **Detail**: Tekst regionu „Ola proponuje pytanie.” jest przy drugiej propozycji taki sam, więc DOM się nie zmienia i czytnik milczy. `ProposalForm.tsx:71,127-128` i `QuestionList.tsx:283,462-463` rozwiązują to licznikiem.
- **Fix**: Licznik w regionie, jak w `ProposalForm`.
- **Decision**: PENDING

### F4 — Fokus ginie po własnym ruchu

- **Severity**: 💬 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: `src/components/room/ProposalForm.tsx:130-135`, `src/components/room/QuestionProposals.tsx:17-18`, `:178`
- **Detail**: Po trzeciej propozycji wysłanej Enterem pole znika, a po „Zatwierdź” znika wiersz, przy ostatnim cała sekcja. Fokus spada na `body`, choć komentarz mówi, że odpowiedź go nie przenosi. `JoinRequests` ma ten sam brak, więc to odziedziczony wzorzec. Głównie cierpi czytnik ekranu. Niesprawdzone w przeglądarce.
- **Fix**: Do `follow-ups/review-fixes.md`, razem z `JoinRequests`, bez pośpiechu.
- **Decision**: PENDING

### F5 — Dwa komentarze obiecują za dużo

- **Severity**: 💬 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Pattern Consistency
- **Location**: `src/components/room/QuestionProposals.tsx:90-91`, `src/components/room/ProposalForm.tsx:81`, `:113`
- **Detail**: Numer propozycji wraca też po godzinnym sprzątaniu poczekalni starszej niż 12 h, nie tylko po usunięciu autora; skutek najwyżej odrzucenie nie tej propozycji w wąskim oknie. Komentarz w formularzu mówi, że tekst dopisany w trakcie wysyłania zostaje, a przy ostatniej propozycji znika razem z polem. Migracji edytować nie wolno.
- **Fix**: Poprawić oba komentarze w kodzie.
- **Decision**: PENDING

### F6 — Formularz powtarza siatkę poczekalni

- **Severity**: 💬 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Pattern Consistency
- **Location**: `src/components/room/ProposalForm.tsx:122-123`, `src/components/room/RoomLobby.tsx:126,134`
- **Detail**: Plan mówił „szerokości z `room-frame.ts`”. Szerokość bloku stamtąd pochodzi, ale siatkę `lg:grid-cols-3` formularz powtarza po `RoomLobby`, która też trzyma ją lokalnie. Dla gracza bez znaczenia.
- **Fix**: Przyjąć.
- **Decision**: PENDING

### F7 — Dodatki spoza planu

- **Severity**: 💬 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Scope Discipline
- **Location**: m.in. `src/components/room/ProposalForm.tsx:126-129`, `:171`, `src/components/room/QuestionProposals.tsx:178`, `:236-240`, `scripts/smoke.mjs:558`, `src/lib/rooms/json-route.ts:22`
- **Detail**: 11 dodatków, wszystkie bez szkody: zwijanie listy i pamięć tekstu w zwiniętym polu (przyjęte w `change.md`), `aria-live` formularza, `scroll-mb-44` (klawiatura telefonu czeka na 4.5), podpowiedzi pod listą, dodatkowy krok smoke, zmiana nazwy `MAX_ROUND` na `MAX_INTEGER`, testy mocniejsze niż plan. Lista „What We're NOT Doing” nie została złamana.
- **Fix**: Przyjąć.
- **Decision**: PENDING
