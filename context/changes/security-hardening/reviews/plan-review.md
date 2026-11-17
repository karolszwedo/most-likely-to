<!-- PLAN-REVIEW-REPORT -->

# Plan Review: Poprawki z przeglądu bezpieczeństwa (punkt H)

- **Plan**: `context/changes/security-hardening/plan.md`
- **Mode**: Deep (weryfikacja kodu wykonana w tej sesji, bez podagenta)
- **Date**: 2026-11-16
- **Verdict**: REVISE
- **Findings**: 1 critical, 3 warnings, 6 observations
- **Triage**: 16.11.2026, Karol „tak” dla wszystkich rekomendacji; poprawki wpisane do `plan.md` i `plan-brief.md`. Werdykt po poprawkach: SOUND

## Verdicts

| Dimension             | Verdict |
| --------------------- | ------- |
| End-State Alignment   | WARNING |
| Lean Execution        | WARNING |
| Architectural Fitness | WARNING |
| Blind Spots           | WARNING |
| Plan Completeness     | FAIL    |

## Grounding

26/26 paths ✓, 12/12 symbols ✓, brief↔plan ✓, Progress↔Phases ✓ (3 fazy, 1.1–1.5, 2.1–2.5, 3.1–3.7, bez checkboxów poza Progress).
Sprawdzone w kodzie: najnowsze definicje to `start_game` → `20261115095052_no_recent_repeats.sql:119` (po `drop` w `:107`), `join_room` → `20261031090821_player_color_choice.sql:165`, `request_join` → `20261103151953_rejoin_after_refresh.sql:76`, `admit_latecomer` → `20261103151953_rejoin_after_refresh.sql:390`, `create_room` → `20261113162527_question_base_checks.sql:93`; żadna późniejsza migracja ich nie zmienia. Wiersz w `public.players` wstawiają tylko `create_room`, `join_room` i gałąź spóźnionego w `admit_latecomer` (ścieżka powrotu nic nie wstawia). e2e: 30 + 7 = 37 `openRoom` na jednym koncie ✓; `tests/db` najwięcej 27–28 pokoi na hosta ✓; pgTAP nowy użytkownik na pokój ✓. `invalid_question` poza `errors.ts`, testami bazy i komentarzami nie występuje (smoke i e2e go nie znają) ✓. `context.redirect` w Astro 7.3.2 to `new Response(null, { headers })` (`node_modules/astro/dist/core/fetch/fetch-state.js:403`), a ciasteczka Astro są doklejane do odpowiedzi zwróconej przez middleware (`astro-middleware.js:42`), więc kopia odpowiedzi ich nie gubi ✓. Playwright 1.64 wysyła ciasteczka `Secure` na `http://localhost` (`isLocalHostname` w `filterCookies`) ✓. Nic nie osadza gry w `iframe` ✓. Reguły `ask` nie łapią żadnego polecenia bramki (`npm run lint`, `npx astro check`, `npm test`, `npm run build`, `npx astro sync`, `npx playwright test --list`) ✓.

## Findings

### F1 — Polecenie grep z „Najnowszych definicji” wskazuje starą `start_game`

- **Severity**: ❌ CRITICAL
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Completeness
- **Location**: Critical Implementation Details — „Najnowsze definicje” (`plan.md:71`)
- **Detail**: Plan każe kopiować każdą funkcję z wyniku `grep -n "create or replace function public.<nazwa>" supabase/migrations/*.sql` („ostatni plik wygrywa”) i to „nie z plików wymienionych wyżej”. Najnowsza `start_game` powstała jednak przez `drop function` + `create function` (`20261115095052_no_recent_repeats.sql:107,119`), więc ten grep jej nie widzi i jako „ostatni” zwraca `20261113162527_question_base_checks.sql:188`: wersję `(uuid, text, text)` bez `p_candidates`. Skopiowana z `create or replace` dodałaby drugą wersję funkcji obok czteroargumentowej (pgTAP `versions_of('start_game')`, `round_creator_view.test.sql:1448`, zaświeci na czerwono, ale po przeróbce). To dokładnie ryzyko, które brief wymienia jako kluczowe dla Fazy 1.
- **Fix**: Zmienić polecenie na `grep -nE "create (or replace )?function public\.<nazwa>\(" supabase/migrations/*.sql` i wpisać do planu pięć źródeł wprost: `start_game` z `no_recent_repeats.sql:119`, `join_room` z `player_color_choice.sql:165`, `request_join` i `admit_latecomer` z `rejoin_after_refresh.sql:76` i `:390`, `create_room` z `question_base_checks.sql:93`.
- **Decision**: FIXED (Fix) — Karol 16.11.2026 („tak” dla całości)

### F2 — `room_full` przed `nick_taken` zamyka powrót na swoje miejsce w pełnym pokoju

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Blind Spots
- **Location**: Faza 1 #1 (kontrakt `join_room`, `request_join`) i #3 (test powrotu)
- **Detail**: Plan stawia sufit w `join_room` „przed wstawieniem”, a `join_room` wykrywa zajęty nick dopiero przy wstawieniu (`unique_violation`, `player_color_choice.sql:218-230`). W pełnej poczekalni gość bez ciasteczka, który wpisze własny nick, dostanie więc `room_full`, nie `nick_taken`. A tylko `nick_taken` daje „To ty? Poproś o powrót”: `join.ts:125` ustawia ciasteczko nicku tylko dla `nick_taken`, a `/j/` pokazuje ofertę tylko dla `nick_taken`, `return_taken` i `requests_full` (`src/pages/j/[token].astro:88-92`). Obietnica „powrót przy pełnym pokoju przechodzi” jest więc spełniona tylko dla bezpośredniego `request_return`; test z Fazy 1 #3 (`plan.md:118`) woła go wprost i tej drogi nie zobaczy. W `request_join` „przed wstawieniem prośby” nie obejmuje gałęzi, która odnawia odrzuconą prośbę (`update … status = 'pending'`, `rejoin_after_refresh.sql:169-172`).
- **Fix**: W `join_room` sprawdzić zajęty nick (`players.nick_key`) przed sufitem i dopiero potem `room_full`; w `request_join` postawić `room_full` po `nick_taken`, a przed oboma zapisami (odnowienie i wstawienie). Do `room-limits.test.ts` dodać: pełna poczekalnia + `join_room` z nickiem gościa → dokładnie `nick_taken`; pełna gra + `request_join` z nickiem gracza → `nick_taken`; odrzucony spóźniony prosi ponownie przy pełnym pokoju → `room_full`.
- **Decision**: FIXED (Fix) — Karol 16.11.2026 („tak” dla całości)

### F3 — Nowe reguły `ask` dalej da się obejść, a szerokie `npx supabase *` blokuje przebiegi bez nadzoru

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: End-State Alignment
- **Location**: Faza 3 #1 (`plan.md:269`), Desired End State (`plan.md:37`)
- **Detail**: Stan końcowy obiecuje pytanie „przy każdym `npx wrangler`, `npx supabase` …”, „nawet obejściem przedrostka”. Przy `allow` `Bash(npx *)` i `Bash(node *)` (`.claude/settings.json:4-6`, ten sam `node *` jest też w `settings.local.json`) bez pytania przejdą: `npx wrangler2 deploy` i `npx cf-wrangler deploy` (aliasy z `node_modules/wrangler/package.json` „bin”), `npx --no-install wrangler deploy`, `npx -c 'wrangler deploy'` / `--call`, `node node_modules/wrangler/bin/wrangler.js deploy`, `node node_modules/supabase/dist/supabase.js db push`, a w `gh api` `--method=PATCH`, `-XPATCH` i `-fkey=v` (wzorce `*-X *`, `*--method *`, `*-f *` wymagają spacji). Druga strona: `ask` `npx supabase *` obejmie też `npx supabase migration new` (konwencja z `AGENTS.md:22`) i `status`, a w trybie bez nadzoru (`claude -p`, `.claude/skills/10x-goal-implement/SKILL.md:39`) pytanie oznacza odmowę, więc przyszły plan z migracją nie przejdzie bez człowieka; pierwszeństwa `ask` nie zmieni węższe `allow`.
- **Fix A ⭐ Recommended**: Wzorce bez granicy słowa: `Bash(npx *wrangler*)`, `Bash(npx *supabase*)`, `Bash(node *wrangler*)`, `Bash(node *supabase*)`, `Bash(npx -c*)`, `Bash(npx --call*)`, `Bash(gh api *-X*)`, `Bash(gh api *--method*)`, `Bash(gh api *-f*)`, `Bash(gh api *-F*)`, `Bash(gh api *--field*)`, `Bash(gh api *--raw-field*)`, `Bash(gh api *--input*)`; w planie zapisać skutek dla `migration new` w trybie bez nadzoru (np. zdanie w `AGENTS.md` albo `test-plan.md`).
  - Strength: Domyka obejścia znalezione w `node_modules`; jedna reguła zamiast wyliczania wariantów.
  - Tradeoff: Fałszywe pytania (np. `npx vitest run tests/unit/supabase-key.test.ts`, `node scripts/keep-supabase-awake.mjs` już i tak pyta).
  - Confidence: MED — semantyka `*` w środku wzorca zgodna z dokumentacją Claude Code, ale nie sprawdzona tu na żywo.
  - Blind spot: Polecenia z prefiksem zmiennej (`X=1 npx …`) nie pasują do `allow`, więc i tak pytają; inne menedżery (`pnpm dlx`, `bunx`) nie są na `allow`.
- **Fix B**: Zamiast szerokiego `npx supabase *` wyliczyć groźne podpolecenia (`db`, `config`, `link`, `projects`, `secrets`, `functions`, `branches`, `migration up|down|repair`) i zostawić `migration new` bez pytania; obejścia `wrangler2`, `cf-wrangler`, `node …` i `gh api` jak w A.
  - Strength: `/10x-goal-implement` w `claude -p` dalej założy migrację.
  - Tradeoff: Lista do pilnowania przy każdej nowej wersji CLI; nowe podpolecenie przejdzie bez pytania.
  - Confidence: MED — lista podpoleceń Supabase CLI 2.x z pamięci, nie z `--help`.
  - Blind spot: Nie sprawdzono, czy `/10x-goal-implement` w ogóle tworzy migracje (może tworzyć plik przez Write).
- **Decision**: FIXED (Fix A) — Karol 16.11.2026 („tak” dla całości)

### F4 — DB-5 domyka tylko `p_categories`; lista 18+ dalej bez limitu

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: End-State Alignment
- **Location**: Faza 1 #1 (kontrakt `create_room`, `plan.md:95`)
- **Detail**: `create_room` sprawdza `p_adult_categories` tylko jako `<@ p_categories` (`question_base_checks.sql:129-134`), a tabela tylko `adult_categories <@ categories` (`room_lobby.sql:27`). Lista 18+ z dowolnie wieloma powtórzeniami poprawnej kategorii przechodzi oba warunki i trafia do `rooms.adult_categories`. Plan ogranicza powtórzenia i długość tylko w `p_categories`, więc DB-5 („lista kategorii dowolnej długości, z powtórzeniami”) zostaje otwarte przez drugi parametr.
- **Fix**: Ta sama reguła dla `p_adult_categories` (bez powtórzeń, nie dłuższa niż `p_categories`), sprawdzenia długości jako pierwsze, przed `<@`; przypadek obok `question-base.test.ts:130`.
- **Decision**: FIXED (Fix) — Karol 16.11.2026 („tak” dla całości)

### F5 — `secure: !import.meta.env.DEV` to druga reguła obok istniejącej dla ciasteczka gracza

- **Severity**: 💡 OBSERVATION
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Architectural Fitness
- **Location**: Faza 2 #5 (`plan.md:225`)
- **Detail**: Ciasteczko gracza ma `secure: url.protocol === "https:"` z komentarzem, że telefon na `http://<LAN IP>` odrzuci ciasteczko `Secure` (`src/lib/rooms/tokens.ts:35-44`). Plan daje ciasteczkom sesji inną regułę: build (`npm run preview`) otwarty z telefonu po LAN zgubi logowanie hosta, choć gracz wejdzie. e2e i CI działają (Chromium i Playwright traktują `localhost` jak bezpieczny, smoke trzyma ciasteczka sam), ale żaden przebieg CI tej flagi nie sprawdza: krok smoke z `Secure` działa tylko na `https`.
- **Fix A**: Ta sama reguła co w `tokens.ts`: `createClient(request, cookies)` i `secure` z `new URL(request.url).protocol`.
  - Strength: Jedna reguła dla wszystkich ciasteczek gry; LAN działa.
  - Tradeoff: Zmiana sygnatury i około 40 wywołań `createClient` (mechaniczna, ale w `src/pages/api/rooms/`).
  - Confidence: HIGH — wzór już działa dla ciasteczka gracza.
  - Blind spot: Nie sprawdzono, jaki protokół widzi `request.url` w podglądzie Cloudflare za proxy.
- **Fix B ⭐ Recommended**: Zostawić `!import.meta.env.DEV` i dopisać w `src/lib/supabase.ts` (oraz w Detail planu), że podgląd po LAN nie zaloguje hosta, z odwołaniem do `tokens.ts`.
  - Strength: Mała zmiana, zgodna z wagą W-7 („informacja”).
  - Tradeoff: Dwie reguły dla ciasteczek zostają.
  - Confidence: HIGH — dziś nikt nie testuje logowania po LAN (brak śladu w `docs/development.md`).
  - Blind spot: None significant.
- **Decision**: FIXED (Fix B) — Karol 16.11.2026 („tak” dla całości)

### F6 — Otwarte pytanie Fazy 1 #5 jest już rozstrzygnięte w kodzie

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Lean Execution
- **Location**: Faza 1 #5 (`plan.md:131,140`), brief „Open Risks”
- **Detail**: Żadna trasa nie filtruje kodów: `refusal()` przepuszcza każdy `reason` (`src/lib/rooms/server.ts:132`), `join.ts:106,125` wysyła go w `?error=`, `index.ts:72` też, a `admit.ts` przez `actionAnswer`, gdzie nieznany kod to 409 (`json-route.ts:199-204`). `room_full` i `too_many_games` przejdą bez zmian w trasach.
- **Fix**: Usunąć `join.ts`, `index.ts` i `admit.ts` z „File” Fazy 1 #5 i zdanie „Sprawdź to przy implementacji” (także ryzyko w briefie).
- **Decision**: FIXED (Fix) — Karol 16.11.2026 („tak” dla całości)

### F7 — Plan pomija miejsca, które opisują zmieniane funkcje i odmowy

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Completeness
- **Location**: Faza 1 #2, #5; Faza 3 #3
- **Detail**: Nieujęte w planie: komentarze `tests/unit/room-rpc-gate.test.ts:44,54,60,82,135` wskazują migrację każdej zastępowanej funkcji; `src/lib/rooms/server.ts:410-413` mówi, że baza trzyma `p_question_id` dla testów ustalających pierwsze pytanie; `context/foundation/test-plan.md:214` liczy 26 kont na przebieg (`room-limits` doda 27.) i opisuje `question-base` z `invalid_question`; `context/deployment/deploy-plan.md:118` opisuje `invalid_question`; `test-plan.md:272` każe zakładać migrację z `< /dev/null` (bez tego polecenie czeka na stdin), a plan podaje `npx supabase migration new security_hardening` bez tego. `too_many_games` nie trafia do żadnej listy w `room-errors.test.ts`, więc nikt nie pilnuje, że ma własny tekst.
- **Fix**: Dopisać te pliki do Faz 1 i 3 (komentarze i dokumenty), `< /dev/null` przy `migration new`, `too_many_games` do listy kodów hosta w `room-errors.test.ts`.
- **Decision**: FIXED (Fix) — Karol 16.11.2026 („tak” dla całości)

### F8 — Nagłówki: martwa gałąź „niezmienne nagłówki” i niesprawdzone podpięcie

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Completeness
- **Location**: Faza 2 #2 (`plan.md:191-194`)
- **Detail**: Plan każe kopiować odpowiedź, „gdy nagłówki są niezmienne”, ale nie mówi, jak to wykryć (bez `try/catch` tego się nie da), a sam stwierdza, że takich odpowiedzi nie ma (`plan.md:52`; potwierdzone dla `context.redirect`). Test jednostkowy sprawdza funkcję, a smoke tylko strony 200 (`/`, `/r/<id>`): podpięcia do przekierowań middleware i odpowiedzi JSON nic nie sprawdza.
- **Fix**: Jedna droga: zawsze `headers.set` (bez gałęzi kopii) albo zawsze `new Response(response.body, response)`; w smoke dodać `x-frame-options` na `/gry` (302 bez sesji) i na jednej trasie `/api/…`.
- **Decision**: FIXED (Fix: zawsze `headers.set`) — Karol 16.11.2026 („tak” dla całości)

### F9 — Hook „po hydracji”: `subscribe` tworzony przy każdym renderze

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Architectural Fitness
- **Location**: Faza 2 #1 (`plan.md:181`)
- **Detail**: `useSyncExternalStore(() => () => {}, …)` z funkcją w treści hooka ma nową tożsamość `subscribe` przy każdym renderze, więc React odpina i podpina ją za każdym razem. Zasady fokusu są zachowane (przycisk nieaktywny tylko przed hydracją, nie znika po ruchu gracza, `aria-disabled` dla wysyłki zostaje), ale `disabled:opacity-50` (`src/components/ui/button.tsx:8`) pokaże na wolnym telefonie przyciemnione „Zagłosuj” do hydracji, a ręczne sprawdzenie 2.5 jest tylko na laptopie, gdzie tego nie widać.
- **Fix**: Stała `subscribe` na poziomie modułu; w sprawdzeniu 2.5 albo 3.7 dopisać jedno zdanie o wyglądzie przycisku zaraz po otwarciu strony na telefonie.
- **Decision**: FIXED (Fix; zdanie o telefonie w 3.7) — Karol 16.11.2026 („tak” dla całości)

### F10 — Zapas limitu 60 gier zależy od rozmiaru e2e i ponowień

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Blind Spots
- **Location**: Current State Analysis (`plan.md:15`), Faza 1 #1 (`plan.md:96`)
- **Detail**: e2e otwiera 37 pokoi na jednym koncie w jednym przebiegu, a `retries: 2` w CI (`playwright.config.ts:22`) dokłada pokój przy każdej ponowionej specyfikacji. Dziś zapas wynosi 23, ale każda nowa specyfikacja go zjada, a po przekroczeniu e2e padnie z mylącym `too_many_games` (Worker pokaże tekst o limicie, nie przyczynę). Smoke na produkcji jest bezpieczny, bo kasuje zakończone gry.
- **Fix**: Zapisać budżet przy regule „jedno konto” w `playwright.config.ts:17-19` i w `test-plan.md` §6.4 (np. „najwyżej 45 `openRoom` na przebieg, limit bazy 60”).
- **Decision**: FIXED (Fix; nowy punkt Fazy 1 #6) — Karol 16.11.2026 („tak” dla całości)
