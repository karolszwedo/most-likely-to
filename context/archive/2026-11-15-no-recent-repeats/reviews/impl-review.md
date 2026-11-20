<!-- IMPL-REVIEW-REPORT -->

# Implementation Review: Bez powtórek z gier hosta (S-20)

- **Plan**: context/changes/no-recent-repeats/plan.md
- **Scope**: Full plan (Phase 3: all automated criteria done; manual 3.7 pending, the owner's check before the evening, `Documents\wieczor-z-ekipa.md` part 2)
- **Reviewed phases**: 1, 2, 3
- **Date**: 2026-11-15
- **Verdict**: APPROVED
- **Findings**: 0 critical, 0 warnings, 7 observations

## Verdicts

| Dimension           | Verdict |
| ------------------- | ------- |
| Plan Adherence      | PASS    |
| Scope Discipline    | PASS    |
| Safety & Quality    | PASS    |
| Architecture        | PASS    |
| Pattern Consistency | PASS    |
| Success Criteria    | PASS    |

Evidence: every recreated SQL function compared line by line with its previous version (only the planned changes and comments differ); `npm run lint`, `npx astro check` (0 errors), `npm test` (1516), `npm run build` green on `1ffa695`; `grep drawQuestion|drawFrom` empty; only the change's migration on the branch; `ci`, `smoke`, `db`, `e2e` green on `a5af826`, `53e726b`, `e4c4e58` and `1ffa695`; on production `db push` (dry-run: only this migration), `migration list` 22/22, `db advisors` 0 errors / 54 warnings with none new, smoke dev and production 135/135 (Worker `ad0ec1f3`). The one file outside the plan, `src/lib/rooms/shared.ts:99`, is a comment made true again after `drawQuestion` was removed.

## Findings

### F1 — Pokój D nie sprawdza swojego warunku wstępnego

- **Severity**: 💬 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Success Criteria
- **Location**: tests/db/no-recent-repeats.test.ts:342-376 (komentarz :361)
- **Detail**: `031` jest znane tylko z rundy gry A przerwanej bez odsłony, ale nic nie sprawdza, że przed skasowaniem A lista byłaby `[033, 031]`. Test pokoju D zostaje więc zielony także przy zignorowanej historii (alarm (a), zapisane w planie) i gdyby rundy bez odsłony przestały się liczyć. Regułę rund bez odsłony pilnuje pgTAP (`pgtap-repeat-003`), a skasowanie trzyma kaskada.
- **Fix**: dopisać w komentarzu przy pokoju D, że warunek wstępny pilnuje pgTAP `repeat` (`-003`) i dlaczego test D sam go nie sprawdza.
- **Decision**: FIXED (komentarz przy pokoju D: warunek wstępny pilnuje pgTAP `pgtap-repeat-003`)

### F2 — Współhost może z ruchów wyczytać część historii hosta

- **Severity**: 💬 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: supabase/migrations/20261115095052_no_recent_repeats.sql:60-81
- **Detail**: współhost wołający bazę wprost (`next_round`, `skip_round`, `start_game` z grantem `anon`) może podawać dobrane listy kandydatów i patrzeć, które pytanie się otwiera, więc po kilku ruchach widzi, które pytania z kategorii tego pokoju host grał gdzie indziej i mniej więcej kiedy. Tylko pytania z wyboru pokoju, każda próba otwiera rundę widoczną dla wszystkich, a zwykła gra i tak pokazuje kolejność. Plan, przegląd planu i research tego nie omawiają.
- **Fix**: zapisać w `change.md` jako przyjętą granicę (bez zmiany kodu).
- **Decision**: FIXED (przyjęta granica w `change.md`, bez zmiany kodu)

### F3 — Stara ścieżka `p_question_id` bez zadania na później

- **Severity**: 💬 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Architecture
- **Location**: supabase/migrations/20261115095052_no_recent_repeats.sql:187-193
- **Detail**: plan celowo zostawia `p_question_id` (stary Worker, cofnięcie wersji, testy), ale ani roadmapa, ani `deploy-plan.md` nie mówią, kiedy ją usunąć. Nowej możliwości nie daje: prowadzący i tak wybiera pytanie jednym kandydatem w `next_round`.
- **Fix**: dopisać zadanie na później (follow-up): usunąć ścieżkę `p_question_id`, gdy cofnięcie do Workera sprzed S-20 przestanie wchodzić w grę; migracja zostawia czteroargumentową sygnaturę (plan-review F5).
- **Decision**: FIXED (follow-up w `follow-ups/review-fixes.md` i wiersz w `deploy-plan.md`, „decyzje na później”)

### F4 — Nieaktualne zdania w roadmapie i w `rounds.ts`

- **Severity**: 💬 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Pattern Consistency
- **Location**: context/foundation/roadmap.md:65 i Outcome S-20, context/foundation/roadmap.md:405, tests/db/support/rounds.ts:~15
- **Detail**: roadmapa mówi „Gra nie losuje pytań, które padły…”, a decyzja A to „bierze je na końcu, nie wyklucza”; `:405` podaje jako następny krok `/10x-research no-recent-repeats`; `rounds.ts:~15` mówi, że `start_game` jest „authenticated only” (nieaktualne od S-07, a akapit S-20 w tym samym pliku mówi „anon and authenticated”).
- **Fix**: poprawić te trzy miejsca (roadmapa: „bierze na końcu pytania z ostatnich gier hosta”, następny krok: ręczne 3.7 i `/10x-archive`; `rounds.ts`: `anon` i `authenticated`).
- **Decision**: FIXED (roadmapa: tabela, Outcome S-20, Backlog Handoff; `rounds.ts`: anon i authenticated od S-07)

### F5 — Zbędny wczesny `no_questions` w `start.ts`

- **Severity**: 💬 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Pattern Consistency
- **Location**: src/pages/api/rooms/[id]/start.ts:37
- **Detail**: pusta pula kończy się `no_questions` bez wołania bazy, co zostało po `drawQuestion`. Baza sama odpowiada `no_questions` na `[]` (test pokoju C), a `next.ts` takiego skrótu nie ma. Zachowanie bez zmian względem planu („Pusta pula dalej kończy się `no_questions` bez wołania bazy”) i praktycznie nieosiągalne.
- **Fix**: zostawić (plan tak każe); ewentualnie usunąć przy najbliższej zmianie startu.
- **Decision**: SKIPPED

### F6 — Historia hosta czytana przy każdym losowaniu, bez limitu

- **Severity**: 💬 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: supabase/migrations/20261115095052_no_recent_repeats.sql:66-77; supabase/migrations/20261107091322_game_length.sql:250, :259
- **Detail**: każde losowanie zbiera wszystkie rundy i wiersze list innych gier hosta (decyzja 2: bez limitu), po indeksach (`rooms_by_host`, klucze z `room_id`), raz na wywołanie. „Jeszcze 5 pytań” robi to dwa razy (licznik w `more_questions` i `open_next_round`), a odmowa `not_enough_players` przychodzi dopiero po kolejności. Przy skali PRD pomijalne (ok. 50 tys. wierszy po ~1000 gier).
- **Fix**: bez zmian teraz; gdyby kiedyś zwolniło, zawęzić `known` do `question_id = any(p_candidates)`.
- **Decision**: SKIPPED

### F7 — Odczyty przez `toMatchObject` zamiast pełnych zbiorów kluczy

- **Severity**: 💬 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Adherence
- **Location**: tests/db/no-recent-repeats.test.ts (odczyty rundy i listy)
- **Detail**: plan mówi „`toEqual` całych zbiorów kluczy”, a plik czyta przez `toMatchObject`. Listy i tak są dokładne (tablica w `toMatchObject` wymaga tej samej długości, każda pozycja ma też `toEqual`), a S-20 nie zmienia kształtu `room_lobby`.
- **Fix**: bez zmian.
- **Decision**: SKIPPED
