<!-- PLAN-REVIEW-REPORT -->
# Plan Review: Propozycje pytań od gości (S-10)

- **Plan**: context/changes/guest-question-proposals/plan.md
- **Mode**: Deep
- **Date**: 2026-11-04
- **Verdict**: REVISE (po naniesieniu poprawek: SOUND)
- **Findings**: 0 critical, 6 warnings, 2 observations

Weryfikacja czytaniem kodu, bez uruchamiania testów i CI.

## Verdicts

| Dimension | Verdict |
|-----------|---------|
| End-State Alignment | PASS |
| Lean Execution | PASS |
| Architectural Fitness | PASS |
| Blind Spots | WARNING |
| Plan Completeness | WARNING |

## Grounding

38/38 ścieżek ✓, symbole ✓ (`bodyQuestionText`, `ROUND_REFUSALS`, `MESSAGES`, `RoomAction`, `ringLobby`, `LOBBY_KEYS`, `SQL_SIGNATURES`, `CASES`, `stats_excluded_hosts`, `leader_refusal`), brief↔plan ✓, Progress↔fazy ✓, brak `docs/reference/contract-surfaces.md`.

Potwierdzone w kodzie: stary Worker czyta tylko klucze swojego kontraktu (`src/lib/rooms/shared.ts:374-434`), więc baza przed kodem jest bezpieczna; `next.ts` i `skip.ts` zawsze wołają RPC, a lista ma pierwszeństwo przed kandydatami, więc zatwierdzone pytanie gra też przy pustej puli; `questionsLeft` zgadza się przed zagraniem i po nim, z listą i bez; wszystkie trzy drogi zamknięcia pokoju wołają `drop_round_state`, a nic nie woła go w trakcie gry; `remove_player` naprawdę kasuje wiersz `public.players`; `count(*) >= 100` nie rozjeżdża się z `position between 1 and 100`, bo nic nie kasuje wierszy `game_questions`; `v_me_id` w `room_lobby` jest ustawione dla hosta z sesji i gościa z tokenu; wszystkie kody odmów nowych funkcji mają tekst; budżet kont po nowym pliku to 20 z 30.

## Findings

### F1 — Nowe ruchy nie mają dowodu dzwonka

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Blind Spots
- **Location**: Faza 3 #5, Success Criteria
- **Detail**: E2E czeka `ROUND_UPDATE_MS` (10 s), a to więcej niż `ROOM_POLL_MS` (8 s), więc trasa bez `ringLobby` zostaje zielona, bo stan dowiezie odpytywanie. Smoke dzwonków nie widzi. §6.4 „Bell vs poll” wymaga pomiaru, a S-18, S-09 i S-04 miały alarm „trasa bez dzwonka”; Faza 3 nie miała żadnego.
- **Fix**: Pomiar przez `nextListFetch` dla wysłania i zatwierdzenia oraz próbny alarm C (`propose.ts` bez dzwonka) w Success Criteria i Progress.
- **Decision**: FIXED (Fix in plan)

### F2 — E2E propozycji nie gra w oknie telefonu

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Blind Spots
- **Location**: Faza 3 #5
- **Detail**: `playwright.config.ts:41` ma `testMatch: /(game|question-list|emotes)\.spec\.ts/`, więc `proposals.spec.ts` biegłby tylko w 1280 px, choć brief podaje telefon przy pasku emotek jako główne ryzyko tej fazy. §6.4 każe dopisać taki spec do projektu `phone`.
- **Fix**: `playwright.config.ts` w plikach Fazy 3 #5, spec w `testMatch`, kontrola okna graczy jak w `emotes.spec.ts`.
- **Decision**: FIXED (Fix in plan)

### F3 — Miejsce nowych bloków niedookreślone

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Completeness
- **Location**: Faza 3 #2–#4
- **Detail**: Poniżej `lg` `EmoteBar` jest przypięty do okna, a jego miejsce `h-18` w kolumnie trzyma koniec strony nad paskiem (`src/components/room/EmoteBar.tsx:25`). Formularz postawiony za paskiem zostałby nim zasłonięty, a plan mówił tylko „przy EmoteBar”. Zapis „Tytuł widoku zostaje pierwszy w DOM” przeczył liście nad widokiem; prawdziwa zasada to podpisy zamiast nagłówków (`src/components/room/JoinRequests.tsx`). Wydzielenie `QuestionField` wymaga też `questionError` i `BUSY_BUTTON`, formularz potrzebuje własnego `id` i etykiety, nowe akcje zostają poza `VIEW_CHANGING`, a przycisk „Anuluj” zderzyłby się z lokatorem bez zawężenia w `tests/e2e/support/round.ts:91`.
- **Fix**: Formularz bezpośrednio przed `<EmoteBar>`, lista z podpisami, reszta jako jawne punkty kontraktu.
- **Decision**: FIXED (Fix in plan)

### F4 — Warianty nie obejmują najgorszego ekranu prowadzącego

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Blind Spots
- **Location**: Faza 3 #1, #3
- **Detail**: Prośby o wejście mają sufit 5 na pokój, a propozycje nie („Bez limitu na pokój”). Lista stoi nad widokiem na każdym ekranie prowadzącego, więc przy 8 graczach to do 24 wierszy nad pytaniem i formularzem głosu, a przy 20 graczach do 60. To dokładnie ryzyko S-10 z roadmapy: zalew odciąga prowadzącego od gry. Host w poczekalni ma też obok siebie „Dodaj własne pytanie” i formularz propozycji.
- **Fix**: Warianty pokazują telefon prowadzącego z 9 czekającymi i sposób zwijania oraz hosta w poczekalni z oboma polami; Karol wybiera na zrzutach, a podgląd z 9 propozycjami trafia do `/dev/room-states`.
  - Strength: Decyzja o wyglądzie zostaje u Karola, a ryzyko wychodzi przed kodem.
  - Tradeoff: Dwa dodatkowe zrzuty w każdym wariancie.
  - Confidence: HIGH — układ `RoomScreen.tsx` i brak sufitu sprawdzone w kodzie.
  - Blind spot: Zachowanie klawiatury ekranowej przy przypiętym pasku na prawdziwym telefonie.
- **Decision**: FIXED (Fix in plan)

### F5 — Tabela propozycji poza strażnikami §6.3

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Blind Spots
- **Location**: Faza 1 #4, Faza 4 #1
- **Detail**: `ROUND_TABLES` (`tests/db/round-anonymity.test.ts:65-73`) napędza sprawdzenie, że API nie wystawia tabel `private`, a nowej tabeli, jedynego miejsca z parą autor–tekst, tam nie było. Faza 4 pomijała też §6.3 (wpis na każdy klucz `room_lobby`) i §6.5 (kroki smoke).
- **Fix**: `question_proposals` w `ROUND_TABLES`; test-plan z §6.3 i §6.5.
- **Decision**: FIXED (Fix in plan)

### F6 — PRD i słownik zostałyby sprzeczne z decyzjami

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Completeness
- **Location**: Faza 4 #1
- **Detail**: FR-013 mówi „Guest”, a decyzja 4 daje propozycje każdemu graczowi. `prd.md:51` i `:152` obiecują „nic poza nickiem i głosami”, a zatwierdzony tekst zostaje dla FR-021. Słownik: „prowadzący” (`:40`) bez nowych ruchów, „własne pytanie” (`:67`) z dopiskiem „pytanie gościa”.
- **Fix**: Te miejsca dopisane do kontraktu Fazy 4 #1.
- **Decision**: FIXED (Fix in plan)

### F7 — Sprzątanie porzuconej poczekalni

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Completeness
- **Location**: Desired End State, Faza 1 #3
- **Detail**: „Najpóźniej ok. 13 h od założenia” jest nieścisłe: propozycja wysłana do starszej poczekalni żyje do następnego przebiegu. Każdy przebieg kasuje też zużyte wiersze, więc limit takiego pokoju liczy się od nowa. Zwykły `delete` omijałby blokadę, którą obiecuje nagłówek `close_stale_games`.
- **Fix**: Zdanie w End State poprawione, druga pętla z `for update skip locked`, skutek dla limitu i dla pokoju założonego z wyprzedzeniem wpisany jako przyjęty (plan i brief).
- **Decision**: FIXED (Fix in plan)

### F8 — Drobiazgi dla implementacji

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Completeness
- **Location**: Faza 1 #2–#5, Faza 2 #3
- **Detail**: Przestarzałe komentarze o „grze bez listy” (`src/lib/rooms/shared.ts:100-102`, `:112-114`, `src/lib/rooms/server.ts:328-331`, `src/components/room/RoundSkipped.tsx:15-19`, nagłówek `room_lobby`); `proposals_left` wołana z `stable` `room_lobby`; test „dwie naraz” z tym samym tekstem dałby 2 × `ok`; alarm A psuje dwie rzeczy; `select plan(333)` rośnie; nowe teksty odmów muszą się różnić (`room-errors.test.ts`).
- **Fix**: Wszystko dopisane do kontraktów odpowiednich punktów i do Implementation Note Fazy 1.
- **Decision**: FIXED (Fix in plan)
