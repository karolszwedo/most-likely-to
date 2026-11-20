<!-- PLAN-REVIEW-REPORT -->

# Plan Review: Pula pytań w bazie (S-17)

- **Plan**: context/changes/question-pool-in-db/plan.md
- **Mode**: Deep
- **Date**: 2026-11-13
- **Verdict**: SOUND (4 poprawki naniesione w planie)
- **Findings**: 0 critical, 2 warnings, 2 observations

Weryfikacja czytaniem kodu, bez uruchamiania testów i CI. Wyjątek: jednorazowy import `src/data/questions.ts` w Node 24.19 z `--experimental-strip-types` (216 pytań, 8 kategorii).

## Verdicts

| Dimension             | Verdict |
| --------------------- | ------- |
| End-State Alignment   | PASS    |
| Lean Execution        | PASS    |
| Architectural Fitness | WARNING |
| Blind Spots           | WARNING |
| Plan Completeness     | WARNING |

## Grounding

14/14 ścieżek ✓, 6/6 symboli ✓ (`unplayed_candidates`, `start_game`, `open_question_list`, `draw_list_question`, `create_room`, `poolFrom`; cytowane migracje to najnowsze definicje), brief↔plan ✓, Progress↔Fazy ✓ (15 kroków automatycznych i 3 ręczne, tytuły zgodne), produkcja to Postgres 17.6 (`supabase/.temp/postgres-version`), więc `merge … when not matched by source` przejdzie.

## Co się trzyma

Sprawdzone w kodzie, bez ustaleń:

- pgTAP ma trzy kontrole, które przechodzą po wszystkich tabelach `private` (`round_creator_view.test.sql:444-478`: granty, publikacja, kolumny czasu i serie). Nowa tabela przejdzie je bez zmian. Tabele unlogged, RLS i „resztki po grze” (`game_rows`, `:930-958`) są sprawdzane po nazwie. `plan(458)` jest wpisany ręcznie. Najbliższy wzór to `private.question_stats`: tabela logged, bez `room_id`, bez grantów.
- pgTAP otwiera każdy pokój przez `create_room` z `{na-co-dzien}` bez 18+. Ma 11 przedrostków `pgtap-…` (26 numerów), wszystkie w formacie numeru. Żaden scenariusz nie oczekuje, że numer w dobrym formacie spoza bazy przejdzie. Wstawienie numerów `pgtap-…` przed `:2225` wystarcza.
- Żadne wywołanie `create_room` (testy bazy, smoke, e2e, pgTAP, Worker) nie podaje kategorii spoza 8 z `CATEGORIES`. Testy bazy wysyłają na ścieżkach sukcesu tylko pytania bez 18+ z `na-co-dzien` i `imprezy`. Jedyny numer spoza wyboru to `na-co-dzien-021` w dwóch testach F1. Po zmianie oba dostaną dokładnie `no_questions`.
- Brama RPC (`room-rpc-gate.test.ts`) nie czyta migracji. Odnośniki `plik:linia` to tylko komentarze, więc nieaktualne zrobią się cztery: `:44`, `:82`, `:164`, `:169`. `private.unplayed_candidates` wołają tylko `open_next_round` i `more_questions`.
- `questions.ts` nie ma importów ani składni, której Node nie umie zdjąć. `package.json` ma `"type": "module"`, a ESLint nie ma wtyczki rozwiązującej importy, więc import `../src/data/questions.ts` z `.mjs` przejdzie lint i `astro check`.
- Reguła `picked_candidates` daje tę samą pulę co `poolFrom`, bo każda kategoria z `CATEGORIES` ma pytania (`draw.test.ts`: co najmniej 15 bez 18+). Liczba „Jeszcze N pytań” dalej się więc zgadza.

## Findings

### F1 — Generator: jak uruchomić Supabase CLI z `scripts/*.mjs`

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Architectural Fitness
- **Location**: Faza 1 #2 (Generator migawek)
- **Detail**: Plan każe skryptowi zakładać plik przez `npx supabase migration new`. Na Windows `spawnSync("npx", …)` bez `shell: true` pada: `npx` to plik `.cmd`, a obecny Node nie uruchamia `.cmd` bez powłoki. Żaden `scripts/*.mjs` nie uruchamia dziś innych procesów. Wzór jest w `.claude/hooks/lib.mjs:93-121` (`runTool`): bin pakietu przez `createRequire(…).resolve('<pkg>/package.json')` i `spawn(process.execPath, …)`, bez powłoki i bez `npx`. Bin pakietu `supabase` to launcher JS (`dist/supabase.js`, wersja 2.117.0). Do tego ESLint dla `scripts/**/*.mjs` zna tylko kilka globali (`eslint.config.js:80-97`), więc np. `Buffer` padnie na `no-undef`.
- **Fix**: W kontrakcie generatora: CLI przez bin pakietu `supabase` i `process.execPath`, jak `runTool` w `.claude/hooks/lib.mjs`. Treść migracji podana na stdin `migration new`, bo CLI zapisuje do nowego pliku to, co dostanie na wejściu (sprawdzić raz przy implementacji). Jeśli nie zapisze, wpisać treść do pliku, który CLI założył (najnowszy `*_question_base_snapshot.sql`). Globale tylko z listy w `eslint.config.js` albo importy z `node:`.
- **Decision**: FIXED (Fix in plan)

### F2 — Nowa kategoria scalona przed `db push` blokuje zakładanie gry

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Blind Spots
- **Location**: Faza 1 #6 (Zasady dopisywania pytań), Faza 3 #2 (Plan wdrożenia)
- **Detail**: Po S-17 `create_room` odmawia kategorii, której katalog nie zna (decyzja 4). Następna zmiana Karola to nowe kategorie. Gdy kod z nową kategorią wejdzie przed `db push`, Worker przepuści jej nazwę (jest w `CATEGORIES`), a baza odmówi. Wtedy każde „Załóż grę” z tą kategorią skończy się napisem „Wybierz co najmniej jedną kategorię.” (`src/lib/rooms/errors.ts:64`), choć host ją wybrał. To skutek gorszy niż te, które plan wymienia, bo gry nie da się w ogóle założyć. Tymczasem lista skutków w `deploy-plan.md` i reguła w nagłówku `questions.ts` mówią tylko o numerach pytań („baza odrzuca numery, których nie zna”).
- **Fix**: Dopisać ten skutek do listy „co się stanie po scaleniu przed `db push`” w `deploy-plan.md` (Faza 3 #2), a w regule w `questions.ts` i `AGENTS.md` (Faza 1 #6) napisać, że baza odrzuca numery i kategorie, których nie zna.
- **Decision**: FIXED (Fix in plan)

### F3 — Test F1 w `game-length`: brak odczytu liczby pytań

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Completeness
- **Location**: Faza 2 #2 (Testy bazy, ostatni punkt)
- **Detail**: Plan każe sprawdzić „w `game-length` także liczbę pytań bez zmiany”, ale między `moreQuestions(…)` (`tests/db/game-length.test.ts:613`) a `endGame` (`:615`) nie ma dziś żadnego odczytu stanu. Ten test jest już przy ostatnim pytaniu gry (15 + 5 = 20, runda 20 odsłonięta). Odmowa przyjdzie więc z liczenia w `more_questions` (`game_length.sql:245-253`): 0 kandydatów daje `no_questions` przed jakimkolwiek zapisem. Oczekiwany wynik z planu się zgadza.
- **Fix**: W kontrakcie: po `:613`, przed `endGame`, odczyt `roomLobby`, a w nim liczba pytań dalej 20 i runda 20 dalej najnowsza.
- **Decision**: FIXED (Fix in plan)

### F4 — Nieaktualne komentarze i dokumenty poza listą planu

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Completeness
- **Location**: Faza 1 #6, Faza 2 #3 i #4, Key Discoveries
- **Detail**: Zdanie „baza sprawdza tylko format” stoi też poza plikami z Fazy 2 #4:
  - `tests/db/support/rounds.ts:15-16`, `:69-74`, `:184-190`, `:205-206`;
  - `tests/db/game-length.test.ts:53-55`;
  - `tests/db/question-list.test.ts:50`, `:94`;
  - nagłówek pgTAP `round_creator_view.test.sql:1-64`.

  Lista skryptów w `docs/development.md` (`:37-48`, `:64`) nie zna `npm run questions:migration`. Key Discoveries mówi o „trzech prawdziwych” numerach pgTAP (`na-co-dzien-001..003`), a `host_reviews_list` wysyła `na-co-dzien-001..015` (`:631`). Te przejdą, bo pytania 18+ w tej kategorii to 021–027.

- **Fix**: Dopisać te pliki do Fazy 2 #4 (komentarze) i `docs/development.md` do Fazy 1 #6, poprawić zdanie w Key Discoveries.
- **Decision**: FIXED (Fix in plan)
