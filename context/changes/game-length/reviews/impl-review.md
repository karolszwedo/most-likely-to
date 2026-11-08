<!-- IMPL-REVIEW-REPORT -->

# Implementation Review: Długość gry widoczna dla wszystkich

- **Plan**: context/changes/game-length/plan.md
- **Scope**: Full plan (fazy w pełni odhaczone; Faza 4 czeka na 4.5 i 4.6)
- **Reviewed phases**: 1, 2, 3
- **Date**: 2026-11-08
- **Verdict**: APPROVED
- **Findings**: 0 critical, 1 warning, 4 observations

## Verdicts

| Dimension           | Verdict |
| ------------------- | ------- |
| Plan Adherence      | PASS    |
| Scope Discipline    | PASS    |
| Safety & Quality    | WARNING |
| Architecture        | PASS    |
| Pattern Consistency | WARNING |
| Success Criteria    | PASS    |

Kryteria: bramka lokalna na `9d28f5b` (= `main` `8f0544a` + epilog) zielona: `npm run lint`, `npx astro check` (0 błędów), `npm test` 1025/1025, `npm run build`. Na PR #45 i na `main` zielone `ci`, `smoke`, `db`, `e2e` (`game-length.spec.ts` w `chromium` i `phone`). Alarmy A (`1440f42`), B (`1c0c52a`), C (`fb38645`) z rewertami. W scalonym diffie jedna migracja: `20261107091322_game_length.sql`. Ręczne 1.6, 3.4, 3.5 odhaczone z dowodem (wybór wariantów w `change.md`).

Sprawdzone bez uwag: kolejność odmów `more_questions` jak w `next_round`, blokada wiersza pokoju (dwa naciśnięcia naraz: jedno `ok`, drugie `round_over`), `count(distinct …)`, `no_questions` bez zapisu w normalnej grze, granty i `search_path`, `question_count` jako sama liczba dla każdej roli, brak nowej drogi do celu głosu, dzwonki tylko przy usunięciu, dolosowaniu i dodaniu, licznik po tytule w DOM, ogłoszenie bez T w kluczu. Zapis `extra_questions` przed odmową `no_questions` dotyczy tylko gry trwającej przy wdrożeniu, przyjęte w planie („What We're NOT Doing”). Plakietka w poczekalni bez odmiany („Liczba pytań: N”) to wybór Karola 1C. Dodatki poza planem (`summary.ts`, `question-edit.ts`, `question-list.ts`) to same komentarze; `variant` w `endGameAction`, `LastQuestionNote` i „Dobieranie pytań…” wynikają z wyborów 3B i G2.

## Findings

### F1 — Znana dziura F1 ma czwarte wejście, bez testu i bez wpisu w S-17

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: supabase/migrations/20261107091322_game_length.sql:249-261, tests/db/cohost.test.ts:53, context/foundation/roadmap.md:335
- **Detail**: Współhost, który woła bazę z pominięciem Workera, może przez `more_questions` otworzyć pytanie spoza wybranych kategorii albo 18+: `private.unplayed_candidates` sprawdza tylko format id. To ta sama dziura co w `start_game`, `next_round` i `skip_round` (przyjęta, naprawa w S-17), więc zmiana jej nie poszerza. Ale `test.fails` „znana dziura F1 → S-17” obejmuje tylko `next_round`, a ryzyko S-17 w roadmapie wymienia tylko trzy funkcje. Jeśli S-17 załata każdą funkcję osobno, `more_questions` może zostać otwarte.
- **Fix**: Dopisać przypadek `test.fails` z `KNOWN_HOLE_F1` dla `more_questions` w `tests/db/cohost.test.ts` i dopisać `more_questions` do linii ryzyka S-17 w `roadmap.md`.
- **Decision**: FIXED (`test.fails` „znana dziura F1 → S-17” w `tests/db/game-length.test.ts`; `more_questions` w ryzyku S-17 w `roadmap.md` i w test-plan §6.2)

### F2 — Domyślne 15 pytań zakłada co najmniej 15 pytań w każdej kategorii

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: src/lib/rooms/server.ts:351-355, src/data/questions.ts
- **Detail**: Gra bez listy ma 15 pytań niezależnie od puli. Dziś najmniejsza kategoria bez 18+ ma 19 pytań (`przyszlosc`, sprawdzone), ale żaden test tego nie pilnuje. Mniejsza kategoria dałaby „z 15” i „Następne pytanie”, a potem `questions_ran_out` przed piętnastym pytaniem (łagodnie, bez awarii).
- **Fix**: Test w `tests/unit/draw.test.ts`: każda kategoria ma co najmniej 15 pytań bez 18+.
- **Decision**: FIXED (`tests/unit/draw.test.ts`, „the default game length”, 8 kategorii)

### F3 — Spreparowane żądanie hosta skraca jego własną grę do 1 pytania

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: supabase/migrations/20261024094002_question_list_review.sql:171-230 (`draw_list_question`), `add_own_question`
- **Detail**: Obie funkcje nie wymagają otwartej listy. `POST question-add` przed „Przejrzyj pytania” tworzy listę z jednym wpisem, więc `question_count` = 1. Ekran tego nie oferuje, a dotyczy tylko gry samego hosta, który i tak może dobrać „Jeszcze 5”.
- **Fix**: Zostawić (bez migracji); ewentualnie przy najbliższej migracji listy wymagać otwartej listy.
- **Decision**: SKIPPED (tylko gra samego hosta, bez migracji)

### F4 — `roomView` bierze `questionsLeft` z zewnątrz, a `moreQuestions` liczy sam

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Pattern Consistency
- **Location**: src/lib/rooms/server.ts:308, 315
- **Detail**: `parseRoomView` odrzuca widok, w którym obie wartości się nie zgadzają. Oba wywołania (`src/lib/rooms/lobby.ts:43`, `src/pages/r/[id].astro:62`) podają dziś `leaderQuestionsLeft(lobby)`, więc działa; przyszłe wywołanie z inną wartością dałoby widok odrzucony w przeglądarce.
- **Fix**: Liczyć obie wartości w `roomView` i usunąć parametr z dwóch wywołań.
- **Decision**: SKIPPED (działa dziś, bez korzyści dla graczy)

### F5 — Dwie linie komentarza ponad 120 znaków

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Pattern Consistency
- **Location**: src/components/room/RoomScreen.tsx:127 (206 znaków), src/lib/rooms/summary.ts:5 (173 znaki)
- **Detail**: Obie z `30b9ae8`; komentarze w repo są zawijane do 120 kolumn. Lint tego nie łapie.
- **Fix**: Zawinąć obie linie.
- **Decision**: FIXED (obie linie zawinięte)
