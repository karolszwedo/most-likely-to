<!-- IMPL-REVIEW-REPORT -->

# Implementation Review: Przegląd brzmienia pytań bazy (S-28)

- **Plan**: context/changes/question-clarity/plan.md
- **Scope**: Full plan (all automated criteria done; manual 3.4 pending, the owner's check at the next game)
- **Reviewed phases**: 1, 2, 3
- **Date**: 2026-11-23
- **Verdict**: APPROVED
- **Findings**: 0 critical, 2 warnings, 4 observations

## Verdicts

| Dimension           | Verdict |
| ------------------- | ------- |
| Plan Adherence      | WARNING |
| Scope Discipline    | PASS    |
| Safety & Quality    | WARNING |
| Architecture        | PASS    |
| Pattern Consistency | WARNING |
| Success Criteria    | PASS    |

Verdict: two minor warnings (the plan's text lags behind the owner's decisions; the new test counts length differently from the database), the rest observations about the new test. Nothing affects the game on production today, hence APPROVED.

Evidence: all 960 entries of `src/data/questions.ts` parsed at `684c299`, `49911bb`, `8e06d7f` and `7d3f62d` and compared field by field. Phase 1: 14 rewordings, 13 verbatim from list A, `znane-gry-024` in the owner's own wording (research.md, decision 1 "Ostatecznie"); the header's 18+ rule matches the plan's contract word for word. Phase 2: 181 `adult` true → false, 0 false → true, no text, id or category change, still 960; the 18+ set of the final file equals the 60 of decision 6 in both directions, the 39 of decision 3 included, `gry-i-internet-075` still 18+. Migration `20261123125426_question_base_snapshot.sql`: byte-identical to `20261116124645` apart from 181 rows `true` → `false`; same (id, category) pairs, so `when not matched by source then delete` deletes nothing; guarded by `tests/unit/question-base-snapshot.test.ts`. Re-pinned tests: `na-co-dzien-026` (question-base, game-length, cohost, no-recent-repeats) and `przyszlosc-025` (draw) are 18+ in their categories, checked at compile time by `satisfies`; the comments next to the constants tell the truth. Deploy order: true → false only, so the old Worker against the new database is refused nothing. Smallest category still has 37 ordinary questions (test: at least 15). No new import of questions into a browser island. Local gate on `7d3f62d`: `npm run lint`, `npx astro check` (0 errors), `npm test` (2611), `npm run build` green. PR #93 `ci`, `smoke`, `db`, `e2e` and the AI review green; after the merge (`186bcd1`) the same on `main` plus Workers Builds; smoke on production 150/150 (23.11). Outside the plan, all approved by the owner and harmless: the rewording of `zwierzeta-i-dom-035` (`8e06d7f`, research.md decision 6, "Brzmienie przy okazji"), the sixth test case "is checked on the whole base".

## Findings

### F1 — Plan mówi o 16 brzmieniach i 3 testach, a jest 14 i 5

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Adherence
- **Location**: context/changes/question-clarity/plan.md:11, 18, 28-32, 64-70, 113, 117, 152-154
- **Detail**: Plan (Desired End State, Faza 1 #1, kryteria 1.4 i 1.5) dalej mówi o 16 nowych brzmieniach z listy A. Wdrożone jest 14: `podroze-i-przygody-063` i `gry-i-internet-075` zostały bez zmian, a `znane-gry-024` ma brzmienie Karola. To zgodne z decyzją 1 „Ostatecznie” w `research.md:131`, ale plan tego nie odnotowuje. Plan nie wspomina też o przeróbce `zwierzeta-i-dom-035` (`8e06d7f`). Key Discoveries i Faza 2 #3 wymieniają 3 testy przypinające 18+, a `na-co-dzien-021` siedział też w `tests/db/cohost.test.ts` i `tests/db/no-recent-repeats.test.ts`; wdrożenie przepięło wszystkie 5. Po archiwizacji plan będzie wprowadzał w błąd.
- **Fix**: Dopisać w planie notę „Po decyzjach Karola” (14 brzmień według decyzji 1, przeróbka `zwierzeta-i-dom-035`, 5 plików testów zamiast 3), bez zmiany tytułów kroków w Progress.
- **Decision**: FIXED — note "Po decyzjach Karola i wdrożeniu" in plan.md after Key Discoveries; Progress step titles unchanged

### F2 — Test liczy długość inaczej niż baza

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Pattern Consistency
- **Location**: tests/unit/question-text.test.ts:12-13, 23-25
- **Detail**: Nowy test liczy znaki jako grafemy (`Intl.Segmenter`). Reszta projektu liczy ten sam limit 90 znaków w punktach kodowych po NFC: `questionLength` w `src/lib/rooms/shared.ts:844` i `char_length` w bazie (`private.question_text`). „Popraw” wstawia tekst pytania z bazy do pola własnego pytania (`QuestionList.tsx:132`), więc pytanie z emoji złożonym przez ZWJ albo znakiem łączącym mogłoby przejść test, a pokazać „91/90” i zostać odrzucone przez bazę bez zmian. Dziś wszystkie 960 tekstów liczy się tak samo każdą metodą (najdłuższy 86).
- **Fix**: Liczyć jak baza: `Array.from(text.normalize("NFC")).length`, z komentarzem, że tak liczy `private.question_text`.
- **Decision**: FIXED — `Array.from(text.normalize("NFC")).length`, comment points to `private.question_text` and `questionLength`

### F3 — Test trybu przypuszczającego przyjmuje liczbę mnogą

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: tests/unit/question-text.test.ts:39-40
- **Detail**: Gałąź `liby` przepuszcza liczbę mnogą („zrobiliby”), która po „Kto z nas” jest błędem i przeczy „generic form” z nagłówka (`src/data/questions.ts:15-16`). Forma męska pojedyncza zawsze kończy się na „łby”. Żadne pytanie nie opiera się na `liby` (jedyny tekst z „mówiliby” ma też „studiowałby”). Plan sam przepisał `liby` do kontraktu, więc to błąd planu. Sprawdzenie jest heurystyką („jakieś słowo kończy się na łby”), nie analizą głównego czasownika, i to wystarczy.
- **Fix**: Usunąć `liby` z wyrażenia i z tytułu przypadku; baza zostaje zielona.
- **Decision**: FIXED — regex `/łby(?!\p{L})/u`, case title and comment say it is a heuristic

### F4 — Przypadki testu bez kontroli na złym przykładzie

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: tests/unit/question-text.test.ts:23-41
- **Detail**: Żaden z pięciu warunków nie ma w pliku kontroli na znanym złym tekście, więc warunek, który po przeróbce nic nie łapie, zostanie zielony. Dowodem działania jest tylko jednorazowy próbny alarm zapisany w test-plan §6.1 (to wzór projektu, S-17 i S-21). Sąsiedni `question-base-snapshot.test.ts:125-126` ma taką kontrolę w pliku. Poza tym zasady „bez spacji na brzegach” nie ma w nagłówku, na który test powołuje się jako na wyrocznię.
- **Fix**: Nazwać pięć warunków i dodać jeden przypadek, w którym każdy odrzuca znany zły tekst (np. „Spóźniłby się.”); zasadę o spacjach dopisać do nagłówka pliku pytań.
- **Decision**: SKIPPED — the recorded dry-run alarm in test-plan §6.1 is the project's pattern (owner's choice, 23.11)

### F5 — Nic nie pilnuje, że kategoria ma choć jedno pytanie 18+

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: tests/unit/draw.test.ts:168-175; src/components/room/NewGameForm.tsx:233-247
- **Detail**: Formularz nowej gry zawsze pokazuje pole 18+ przy każdej kategorii. Po S-28 „Praca i szkoła” i „Jedzenie i gotowanie” mają po jednym pytaniu 18+, „Imprezy”, „Przyszłość” i „Pieniądze i zakupy” po trzy. Karol to zatwierdził (decyzja 6), ale gdy przyszła przeróbka zdejmie ostatnie, pole 18+ tej kategorii po cichu nic nie da. Test „co najmniej 15 zwykłych” pilnuje tylko drugiej strony.
- **Fix**: Dodać obok w `draw.test.ts` przypadek „każda kategoria ma co najmniej jedno pytanie 18+”.
- **Decision**: FIXED — `tests/unit/draw.test.ts` "the 18+ of every category"; dry-run alarm: `praca-i-szkola-023` set to `adult: false` turned only that case red (1 of 82), green after undoing

### F6 — Komentarz testu obiecuje pilnowanie tłumaczeń (S-27)

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: tests/unit/question-text.test.ts:5-7
- **Detail**: Komentarz mówi, że test pilnuje też przetłumaczonych pytań (S-27). Test czyta tylko polskie `q.text`, a zasada „łby” nie ma sensu po angielsku. Gdy S-27 Faza 3 doda angielskie teksty, nikt ich nie sprawdzi, choć komentarz sugeruje co innego.
- **Fix**: Zmienić komentarz: tłumaczenia (S-27) dostaną własne zasady w swojej fazie; dopisać to do planu S-27 Faza 3.
- **Decision**: FIXED — comment says only the Polish `text` is checked and points to S-27 Faza 3 #4 (`tests/unit/questions-en.test.ts`)
