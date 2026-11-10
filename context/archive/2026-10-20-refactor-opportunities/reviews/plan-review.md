<!-- PLAN-REVIEW-REPORT -->
# Plan Review: Strażnicy bramy RPC i anonimowości w przeglądarce

- **Plan**: context/changes/refactor-opportunities/plan.md
- **Mode**: Deep
- **Date**: 2026-10-20
- **Verdict**: REVISE → SOUND po triage (wszystkie ustalenia poprawione w planie i briefie)
- **Findings**: 1 critical, 0 warnings, 2 observations

## Verdicts

| Dimension | Verdict |
|-----------|---------|
| End-State Alignment | PASS |
| Lean Execution | WARNING |
| Architectural Fitness | PASS |
| Blind Spots | FAIL |
| Plan Completeness | WARNING |

## Grounding

10/10 paths ✓ (`tests/unit/room-rpc-gate.test.ts` jeszcze nie istnieje, zgodnie z planem), 10/10 sygnatur SQL ✓, symbole smoke ✓ (`act` `scripts/smoke.mjs:239`, `ACCEPTED` `:244`, `hostJar` `:180`, krok „room state shows the reveal with the votes' counts” `:276`), Progress↔Fazy ✓ (6/4/4/6 wierszy), brief↔plan ✓.

Fakty planu sprawdzone u źródła:

- **12 przypadków**: 10 funkcji opakowujących woła dokładnie 10 RPC (`server.ts:115,137,156,177,235,250,261,274,291,302`); `castVote` bez numeru pytania pomija `p_round` całkiem (`:253`), `roomLobby` bez tokenu wysyła `p_player_token: null` (`:180`).
- **Sygnatury SQL**: wszystkie zgodne z planem i to są najnowsze definicje. `cast_vote` w jednej wersji (stara 3-argumentowa usunięta w `full_game_evening.sql:248`); `room_lobby` zastąpione w `full_game_evening.sql:403` z tymi samymi parametrami; `close_stale_games` nie redefiniuje żadnej z 10 funkcji.
- **Drugie „Odsłoń wynik”**: `first_live_round.sql:763-767` kończy rundę tylko w fazie `voting`, inaczej oddaje `{ok:true}` bez zmian. `reveal.ts` nie czyta treści żądania, więc `act("reveal", {}, hostJar)` dostaje 200 i `{"ok":true}`; następny krok („a vote after the reveal is refused”) dalej dostaje `round_revealed`.
- **Smoke 53 → 54**: 14 kroków bazowych (`smoke.mjs:101-161`) + 39 kroków pokoju = 53 w domyślnym trybie; nowy krok w `roundSteps()` podlega `SMOKE_ROUND=0`.
- **3 ostrzeżenia**: sonda z konfiguracją repo i blokiem reguły jako `warn` na całym `src` (93 pliki): dokładnie 3 komunikaty `no-restricted-properties` w `useRoomState.ts:99,100,110`, kod wyjścia 0. Żadna z dwóch reguł nie jest dziś skonfigurowana, więc nowy blok niczego nie nadpisuje.
- **CI**: `ci.yml:3-7` uruchamia się na push do `main` i na PR do `main`; joby `ci`, `smoke`, `db`, `e2e` bez `needs:`, więc czerwony test unit nie wyłącza smoke (próbny alarm z fazy 2 zobaczy oba). `npm run lint` bez `--max-warnings`: ostrzeżenia nie oblewają CI.
- **Hook agenta**: twierdzenie „czerwony test w hooku” prawdziwe, ale przez `related-tests.mjs` (`vitest related … --project unit`, `.claude/settings.json:68`) i `end-of-turn.mjs:63`, nie przez hooki lintu wymienione w planie.
- e2e nie naciska „Odsłoń wynik” nigdzie (`round.spec.ts:49`, `game.spec.ts:70-71`), więc próbny alarm z fazy 2 nie zapali e2e.

Cztery właściwości planu refaktoryzacji (lekcja M4L4): test charakteryzujący przed dotknięciem kodu bez testów ✓ (faza 1 przed jakąkolwiek edycją `server.ts`, faza 3 charakteryzuje stan lintu przed `useRoomState.ts`); osobne, odwracalne commity ✓, „od najtańszej” częściowo (F2); kryteria automatyczne i ręczne w każdej fazie ✓; mechanizm przy zielonym, egzekwowanie osobnym krokiem ✓ (faza 3 `warn` → faza 4 `error`).

## Findings

### F1 — Reguła D7 nie sięga skryptów `<script>` w plikach `.astro`

- **Severity**: ❌ CRITICAL
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Blind Spots
- **Location**: Desired End State pkt 3; Critical Implementation Details („Skrypty klienta w `.astro`”); Faza 3 #1 (`files`); Faza 4 Manual 4.5
- **Detail**: Plan zakłada, że eslint-plugin-astro lintuje skrypty klienta jako pliki wirtualne `*.astro/*.ts`. Plugin je tworzy, ale ich parsowanie pada: `projectService: true` z konfiguracji bazowej obejmuje plik wirtualny („was not found by the project service”), a `projectService: false` z bloku astro dotyczy tylko `**/*.astro`. Plugin po cichu wyrzuca ten błąd, więc żadna reguła nie widzi tych skryptów. Dowód: `npx eslint src/components/room/RoomCard.astro src/components/auth/SignInCard.astro --rule '{"no-restricted-syntax":["warn","CallExpression"]}'` nie zgłasza nic, choć `RoomCard.astro:30` ma wywołanie. Skutek: kryterium 4.5 (`document.cookie` w `<script>` z `RoomCard.astro` daje błąd) nie przejdzie, a obietnica „także skrypty klienta w `.astro`” jest nieprawdziwa. To luka istniejąca dla wszystkich reguł lintu, nie tylko D7.
- **Fix A ⭐ Recommended**: zawęzić D7 do `src/**/*.{ts,tsx,astro}` (kod React i frontmatter), usunąć glob plików wirtualnych i część `RoomCard.astro` z 4.5 (zamiast niej `document.cookie` w pliku `.tsx`), a lukę zapisać jawnie: punkt w „What We're NOT Doing” i w §6.3 („skrypty `<script>` w `.astro` nie są dziś lintowane; osobna zmiana”).
  - Strength: D7 zostaje tanie; miejsce, które S-04 może kusić zapamiętaniem głosu, to React (`useRoomState.ts`, `RoundVoting.tsx`), a ono jest pokryte. Dziś w `.astro` są tylko 2 skrypty, oba ustawiają fokus.
  - Tradeoff: przyszły `<script>` w `.astro` z zapisem w przeglądarce przejdzie bez sygnału, dopóki osobna zmiana nie naprawi lintowania tych skryptów.
  - Confidence: HIGH — luka potwierdzona sondą; zawężenie nie zmienia 3 ostrzeżeń z fazy 3.
  - Blind spot: None significant.
- **Fix B**: dodatkowa faza przed D7: dla `**/*.astro/*.{js,ts}` wyłączyć parsowanie z typami (`projectService: false` i `tseslint.configs.disableTypeChecked`), żeby wszystkie reguły widziały skrypty `.astro`; dopiero potem D7 z obecnym zakresem.
  - Strength: zamyka cichą lukę lintu dla wszystkich reguł, nie tylko D7.
  - Tradeoff: zmienia działanie lintu poza D7; w dwóch skryptach (`RoomCard.astro`, `SignInCard.astro`) mogą wyjść nowe błędy do poprawy, czyli zmiany w plikach gry poza komentarzami; „tani zysk D7” przestaje być tani.
  - Confidence: MED — sonda potwierdziła lukę, nie sprawdziła poprawki.
  - Blind spot: które reguły zaczną zgłaszać błędy w tych dwóch skryptach.
- **Decision**: FIXED (Fix A). Zakres D7 `src/**/*.{ts,tsx,astro}`, luka w Key Discoveries, Critical Implementation Details, „What We're NOT Doing” i w punkcie §6.3 fazy 3; próbny alarm lintu czyta `document.cookie` w `src/components/room/JoinForm.tsx`.

### F2 — Faza 2 (push i 3 przebiegi CI) przed tańszymi, lokalnymi fazami 3–4

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Lean Execution
- **Location**: Implementation Approach (kolejność faz); Faza 2 Manual 2.3; Faza 4 Automated 4.4
- **Detail**: Lekcja każe iść od najtańszej fazy. Fazy 3–4 to kilka linii i tylko lokalne sprawdzenia, a faza 2 wymaga otwartego PR, push, tymczasowego commita i revertu (CI rusza tylko na PR do `main`, `ci.yml:3-7`). Przy obecnej kolejności po fazie 4 potrzebny jest jeszcze jeden push i pełne CI (4.4): razem 4 pushe i 4 przebiegi CI zamiast 3, każdy push za zgodą Karola. Fazy 3–4 nie zależą od 1–2.
- **Fix**: kolejność 1 → D7 `warn` → D7 `error` → krok smoke z próbnym alarmem w CI (fazy 2, 3, 4 przenumerowane na 4, 2, 3; Progress razem z nimi); pierwszy push dopiero w ostatniej fazie.
- **Decision**: FIXED. Fazy: 1 test bramy, 2 D7 `warn`, 3 D7 `error`, 4 krok smoke + pierwszy push i PR; kryterium „CI zielone we wszystkich jobach” przeniesione do fazy 4 (4.2), diff `useRoomState.ts` czytany lokalnie (3.5).

### F3 — Test bramy nie sprawdza, że atrapa przeszła walidację odpowiedzi

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Completeness
- **Location**: Faza 1 #1 (Contract); Critical Implementation Details („Atrapa na ścieżce sukcesu”)
- **Detail**: Plan opisuje, że zła odpowiedź atrapy kończy się `unexpectedShape` i linią logu, ale przypadek sprawdza tylko wywołanie `rpc`. Atrapa z błędną odpowiedzią dałaby więc zielony test, a wynik testu tylko zaśmieciłby się logiem. Istniejący wzór ręcznej atrapy (`tests/unit/auth-user.test.ts:14-17`, obiekt z jedną metodą i import samego typu) nie jest w planie wskazany.
- **Fix**: w każdym przypadku dodatkowo `expect(result.ok).toBe(true)`; w Contract wskazać `tests/unit/auth-user.test.ts:14-17` jako wzór atrapy.
- **Decision**: FIXED
