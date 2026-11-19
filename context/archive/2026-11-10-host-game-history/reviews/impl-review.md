<!-- IMPL-REVIEW-REPORT -->

# Implementation Review: Lista gier hosta i kasowanie (S-13)

- **Plan**: context/changes/host-game-history/plan.md
- **Scope**: Full plan (Fazy 1–3; Faza 4, wdrożenie, jeszcze nie zaczęta)
- **Reviewed phases**: 1, 2, 3
- **Date**: 2026-11-12
- **Verdict**: APPROVED
- **Findings**: 0 critical, 1 warning, 5 observations

Bramka lokalna na `0efb83c` (+ niescommitowane odhaczenia 3.2, 3.3 w `plan.md`): `npm run lint` PASS, `npx astro check` 0 błędów, `npm test` 1073/1073, `npm run build` PASS, `npx prettier --check` dla zmienionych `.md` PASS. CI na `0efb83c`: `ci`, `smoke`, `db`, `e2e` zielone. Ręczne 1.5, 2.4, 3.4, 3.5 odhaczone, z dowodami w commitach Faz 1–3 i w sesjach Karola.

Zgodność z planem: każda zaplanowana zmiana Faz 1–3 to MATCH (migracja, pgTAP 458, testy bazy, trasy, parsery, smoke 9 kroków, `/gry`, `HostGames`, `DeleteGameButton`, `/dashboard` usunięty, e2e, dokumenty). Dodatki nieszkodliwe: `src/lib/rooms/game-list.ts` z testem (format daty D2 wspólny dla strony i podglądów), `HostGamesLink.astro` (wybór L1), podtytuł listy. Próbne alarmy 1.4 i 2.3 w jednym commicie: decyzja Karola z 10.11 (Progress 1.4, 2.3). Nic z „What We're NOT Doing” nie zostało zrobione.

## Verdicts

| Dimension           | Verdict |
| ------------------- | ------- |
| Plan Adherence      | PASS    |
| Scope Discipline    | PASS    |
| Safety & Quality    | PASS    |
| Architecture        | PASS    |
| Pattern Consistency | WARNING |
| Success Criteria    | PASS    |

## Findings

### F1 — Odmowa kasowania ściąga fokus z powrotem na „Usuń”

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Pattern Consistency
- **Location**: src/components/room/DeleteGameButton.tsx:48-53, :76
- **Detail**: Po odmowie `confirm()` zawsze ustawia `focusNext.current = "delete"`, a efekt bezwarunkowo woła `deleteRef.current?.focus()`. Host, który w czasie żądania przeszedł Tabem dalej (np. do „Usuń” innego wiersza), zostaje ściągnięty z powrotem. `AGENTS.md` (UI) każe przekazywać fokus tylko, gdy zginął razem z przyciskiem (`focusWasLost`, `src/components/room/focus.ts:15-18`); `useRowFocus` w tym samym widoku robi to dobrze.
- **Fix**: W efekcie (`:48-53`) przenosić fokus tylko, gdy `focusWasLost()`. Ścieżki „Usuń” → pytanie i „Anuluj” działają dalej, bo znikający przycisk i tak zostawia fokus na `body`.
- **Decision**: FIXED — `focusWasLost()` w efekcie `DeleteGameButton.tsx`; sprawdzone w przeglądarce (odmowa 404 podstawiona przez Playwright): fokus wraca na „Usuń”, gdy zginął; zostaje na „Usuń” następnej karty, gdy host przeszedł dalej (stara wersja tu oblewa); „Anuluj” bez zmian

### F2 — Drugie kasowanie tej samej gry daje ogólny tekst „Spróbuj ponownie”

- **Severity**: 🔍 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: src/components/room/DeleteGameButton.tsx:75, src/pages/dev/room-states.astro:938 (stan 187)
- **Detail**: Gra skasowana już w drugiej karcie albo wygasła sesja: 404 `not_found` → `roomErrorMessage` daje „Coś poszło nie tak. Spróbuj ponownie.”, wiersz zostaje, każde ponowienie znów 404. Plan to akceptuje („What We're NOT Doing”: dwie karty, ogólny tekst, wiersz do odświeżenia). Wygaśnięcie sesji jest rzadkie, bo middleware odświeża sesję przy każdym żądaniu.
- **Fix**: Bez zmian (decyzja planu). Jeśli kiedyś przeszkodzi: własny tekst dla 404 kasowania, np. „Tej gry już nie ma albo sesja wygasła. Odśwież stronę.”, bez cichego usuwania wiersza.
- **Decision**: ACCEPTED — decyzja planu (dwie karty, ogólny tekst); Karol 2026-11-12

### F3 — Stan `gone` zdradza anonimowi, czy pokój o danym id istnieje

- **Severity**: 🔍 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: supabase/migrations/20261110131123_host_game_history.sql:126-178 (`join_request_state`, grant dla `anon`)
- **Detail**: Z dowolnym poprawnym formatem tokenu brakujący pokój daje `gone`, a istniejący `none`; wcześniej oba `none`. Id pokoju to losowy UUID, który i tak jest w adresie `/r/<id>` podawanym gościom, więc to nie daje niczego do wykorzystania (to samo rozumowanie co S-09 F6).
- **Fix**: Zaakceptować; ten raport jest zapisem rozważenia.
- **Decision**: ACCEPTED — UUID w adresie i tak znany gościom; Karol 2026-11-12

### F4 — Brak indeksów pod listę i kaskadę

- **Severity**: 🔍 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: supabase/migrations/20261110131123_host_game_history.sql:72
- **Detail**: `host_games` filtruje `host_id = auth.uid() and status = 'closed'` bez pasującego indeksu (`rooms_one_open_per_host` jest częściowy: lobby/playing), więc skanuje całe `public.rooms`. Kaskada szuka `private.round_results(player_id)` i `join_requests(room_id)` bez pełnych indeksów (stan sprzed zmiany). Przy dzisiejszej skali pomijalne.
- **Fix**: Gdy tabele urosną, nowa migracja z indeksami `rooms (host_id) where status = 'closed'`, `round_results (player_id)`, `join_requests (room_id)`.
- **Decision**: SKIPPED — na później, gdy tabele urosną

### F5 — Sprzątanie smoke nie sprawdza, czyje to konto

- **Severity**: 🔍 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: scripts/smoke.mjs:869-872
- **Detail**: Krok „host deletes every finished game” kasuje wszystkie zakończone gry konta z `SMOKE_EMAIL`, bez sprawdzenia, że to konto smoke. Zła linia w `.dev.vars` skasowałaby historię prawdziwego hosta. Reguły `ask` dla smoke w `.claude/settings.json` już są (lekcja 1 spełniona).
- **Fix**: Opcjonalnie strażnik (oczekiwany wzór maila albo `SMOKE_DELETE=1`) przed sprzątaniem.
- **Decision**: SKIPPED — reguły `ask` dla smoke wystarczą na dziś

### F6 — Drobiazgi w dokumentach

- **Severity**: 🔍 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Adherence
- **Location**: context/changes/host-game-history/plan.md:306; context/domain/03-anti-corruption-layer.md:155
- **Detail**: Kryterium „`grep -rn "S-13" tests scripts` bez trafień” jest za ostre: 13 trafień to nowe komentarze opisujące tę zmianę, żaden stary „until S-13” nie został (intencja spełniona). W `context/domain/03-anti-corruption-layer.md:155` zostaje wzmianka o `/dashboard` (wynik skilla, odświeży go następny przebieg `/10x-domain-distillation`). Format daty (`Intl`, `Europe/Warsaw`) sprawdzają testy w Node, nie w Workerze; pokryje to przeklikanie 4.4 na produkcji.
- **Fix**: Bez zmian.
- **Decision**: SKIPPED — bez zmian
