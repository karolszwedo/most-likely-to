<!-- PLAN-REVIEW-REPORT -->

# Plan Review: Bez powtórek z gier hosta (S-20)

- **Plan**: `context/changes/no-recent-repeats/plan.md`
- **Mode**: Deep
- **Date**: 2026-11-15
- **Verdict**: SOUND
- **Findings**: 0 critical, 2 warnings, 4 observations

## Verdicts

| Dimension             | Verdict |
| --------------------- | ------- |
| End-State Alignment   | PASS    |
| Lean Execution        | PASS    |
| Architectural Fitness | PASS    |
| Blind Spots           | WARNING |
| Plan Completeness     | WARNING |

## Grounding

Grounding: 12/12 ścieżek ✓, 10/10 symboli ✓ (`picked_candidates`, `unplayed_candidates`, `open_next_round`, `more_questions`, `open_question_list`, `draw_list_question`, `start_game`, `delete_game`/`host_games`, `drawQuestion`/`drawFrom`, `shuffledQuestions`), brief↔plan ✓, Progress↔fazy ✓ (1.1–1.6, 2.1–2.3, 3.1–3.7).

Weryfikacja kodu (podagent, 6 twierdzeń): potwierdzone, że w `tests/db` psują się tylko `proposals` i `game-length` (pozostałe 17 plików: pierwszy pokój, start z `p_question_id`, same liczniki albo remis; `cohost.test.ts` pokój 2 zmienia skład listy, ale sprawdza tylko liczby). Potwierdzone poprawki `game-length` (`delete_game` na każdym poprzednim pokoju daje `{ ok: true }`, żaden `it` nie czyta poprzedniego pokoju) i `proposals` (pokój 1 nie dotyka 003–017). `private.rounds` i `private.game_questions` są logowane i nic poza kaskadą z `public.rooms` ich nie kasuje. `rooms` nie ma dziś zwykłego indeksu na `host_id`. Smoke i e2e nie sprawdzają numerów ani kolejności pytań.

## Findings

### F1 — Wyrocznia nie odróżnia „ostatniego poznania” od „pierwszego”

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Blind Spots
- **Location**: Faza 1, §2 (pokój C), §6 (alarmy)
- **Detail**: Reguła bierze `max(coalesce(started_at, created_at))`, czyli ostatnią grę, w której host poznał pytanie. Żaden przypadek testu ani pgTAP nie ma pytania znanego z dwóch gier o różnym czasie: `003` jest tylko z B, `030` tylko z A, w pgTAP `-001` tylko ze „starego”, `-003` tylko z „nowego”. Implementacja z `min` przeszłaby cały zestaw, a w grze dałaby dokładnie to, przed czym S-20 chroni: pytanie z ostatniej gry, które padło też w dawnej, wróciłoby jako pierwsze ze znanych, gdy świeże się skończą (u Karola po dwóch grach w jednej kategorii).
- **Fix**: W pokoju C ostatnie „Następne pytanie” z `[001, 003, 030]` → `030`. `001` padło w A, ale stało też na liście B, więc liczy się późniejsza B. Przy `min` `001` i `030` remisują na A i wychodzi `001`, więc test świeci. Oba alarmy też go zapalają: (a) daje `001`, bo jest pierwsze i niezagrane w C, a (b) daje `001`, bo jest z nowszej B.
  - Strength: ten sam przypadek, bez nowego pokoju i konta, a pilnuje obu połów reguły.
  - Tradeoff: zmienia przewidywania alarmów (F2).
  - Confidence: HIGH — rozpisane na A < B w czasie rzeczywistym REST, każdy ruch to osobna transakcja.
  - Blind spot: None significant.
- **Decision**: FIXED (Fix in plan; sesja, decyzje techniczne)

### F2 — Przewidywanie alarmu (a) nie jest dokładne

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Completeness
- **Location**: Faza 1, §6 (a)
- **Detail**: Plan mówi, że przy (a) czerwone są „oczekiwania pokojów B i C”. Przy pierwotnym scenariuszu C „Następne pytanie” z `[003, 030]` przy (a) zostaje zielone (`003` padło już w C jako runda 2, więc wychodzi `030`). Odmowy startu w C też zostają zielone. Test-plan §6.2 (Break-check, krok 2) każe się zatrzymać, gdy przewidziany test zostaje zielony, więc ogólne przewidywanie da fałszywy alarm albo zgadywanie przy CI. Do tego przy (a) pozycje na liście B się przesuwają, więc „Usuń” i „Popraw” wskazane numerem pozycji usunęłyby inne pytania.
- **Fix**: Wypisać w planie dokładną listę: przy (a) czerwone są lista B, „Dolosuj pytanie” z `016` i z `028`, start C z `018` i oba „Następne pytanie” w C (`019`, `030`) oraz asercja pgTAP. Zielone zostają A, odmowy startu w C, D, reszta plików, smoke i e2e. Ruchy w `beforeAll` zbierają `{ data, error }` bez rzucania, a „Usuń” i „Popraw” w B szukają pozycji po numerze pytania.
- **Decision**: FIXED (Fix in plan)

### F3 — Sprzątanie w Fazie 2: nieużywane stałe i nieaktualne komentarze

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Completeness
- **Location**: Faza 2, §1–§3
- **Detail**: Po przejściu testów na `questionPool` w `tests/unit/draw.test.ts` nic nie używa `GRID` i `drawable()` (`:23-28`). W `tests/unit/room-rpc-gate.test.ts` nic nie używa `QUESTION_ID` (`:248`), bo używały go tylko przypadki startu (`:333-340`). `no-unused-vars` to błąd lintu (`eslint.config.js:27-35`), więc 2.1 padnie. Poza listą planu zostają też komentarze, które dalej mówią o pierwszym kandydacie w kolejności Workera: `src/lib/rooms/server.ts:479-481` i `:658-660`, `src/pages/api/rooms/[id]/next.ts:10-15`, `question-list.ts:9-12`, `question-draw.ts:10-12` i nagłówek `more.ts`.
- **Fix**: Dopisać do Fazy 2 usunięcie `GRID`/`drawable` (o ile nic ich nie używa) i `QUESTION_ID` oraz te komentarze.
- **Decision**: FIXED (Fix in plan)

### F4 — pgTAP: drugi pokój hosta i cofanie czasu

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Completeness
- **Location**: Key Discoveries (pgTAP); Faza 1, §4
- **Detail**: Zdanie „dziś żaden host w pgTAP nie ma dwóch pokoi” jest nieścisłe. `pg_temp.host_opens_new_room` (`supabase/tests/round_creator_view.test.sql:293-300`) daje drugi pokój pięciu hostom (`abandoned`, `listed`, `thumbs-new`, `stats-lobby`, `proposed-new`), tylko nic w nim nie losuje i nie zapisuje go w `test_rooms` (klucz główny to sam `key`, `:89`). Scenariusz `repeat` potrzebuje więc nowego pomocnika. Poza tym reguła bierze `coalesce(started_at, created_at)`, a wzór z `:2337-2342` cofa tylko `started_at`. W pokoju bez startu albo w pokoju z nieprzesuniętym `created_at` wyszedłby remis i fałszywy wynik.
- **Fix**: Poprawić zdanie w Key Discoveries. W §4 dopisać pomocnika, który zakłada drugi pokój hosta przez `create_room(…, true)` i zapisuje go w `test_rooms` pod nowym kluczem z tym samym `host_id`. Cofanie czasu ma przesuwać `created_at` i `started_at` razem.
- **Decision**: FIXED (Fix in plan)

### F5 — Wycofanie: kolejność Worker → baza

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Blind Spots
- **Location**: Migration Notes (Wycofanie)
- **Detail**: Po Fazie 2 Worker wysyła `p_candidates`. Migracja wycofania, która przywraca tylko `start_game(uuid, text, text)`, zepsułaby „Zacznij grę” temu Workerowi, bo PostgREST nie znajdzie funkcji z tym parametrem.
- **Fix**: W notatce o wycofaniu: najpierw poprzednia wersja Workera (za zgodą), potem migracja. Druga możliwość: migracja wycofania zostawia czteroargumentową sygnaturę, a zmienia tylko kolejność.
- **Decision**: FIXED (Fix in plan)

### F6 — Ręczne 3.7: druga gra zostaje otwarta

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Blind Spots
- **Location**: Faza 3, Manual Verification (3.7)
- **Detail**: Po dwóch listach druga gra zostaje w poczekalni. `delete_game` kasuje tylko zamknięte gry (`game_not_ended`), a w poczekalni nie ma przycisku „Zakończ grę” (jest tylko w grze, `HostActions.tsx:31`). Grę w poczekalni zamyka dopiero „Nowa gra”. Bez tego kroku druga lista zostanie w historii, choć plan mówi, że obie gry można skasować.
- **Fix**: Po drugiej liście Karol klika „Nowa gra” trzeci raz, bez „Przejrzyj pytania” (to zamyka drugą grę), i kasuje dwie pierwsze w „Twoje gry”. Trzecia gra bez listy nie dodaje nic do historii.
- **Decision**: FIXED (Fix in plan)
