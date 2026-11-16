<!-- IMPL-REVIEW-REPORT -->

# Implementation Review: Wygląd ekranu odsłony wyniku (reveal-ui)

- **Plan**: context/changes/reveal-ui/plan.md
- **Scope**: Full plan (Phase 3: all automated criteria done; manual 3.5 pending, the owner's check at the next game, the default state of changes since 2026-11-16)
- **Reviewed phases**: 1, 2, 3
- **Date**: 2026-11-16
- **Verdict**: APPROVED
- **Findings**: 0 critical, 1 warning, 3 observations

## Verdicts

| Dimension           | Verdict                                                       |
| ------------------- | ------------------------------------------------------------- |
| Plan Adherence      | PASS                                                          |
| Scope Discipline    | WARNING (F4)                                                  |
| Safety & Quality    | PASS (F2 observation)                                         |
| Architecture        | PASS                                                          |
| Pattern Consistency | WARNING (F1)                                                  |
| Success Criteria    | PASS (F3 observation; manual 3.5 pending, not falsely ticked) |

Evidence for Success Criteria (2026-11-16, branch `reveal-ui-deploy` = `main` `25345d7` + epilog): `npm run lint` (`ui-literals: 0 literals in 58 view files`), `npx astro check` (0 errors), `npm test` (1516 passed), `npm run build` green; `git grep` for the prototype finds nothing in `src` or `tests` (only the plan, change note and brief quote the name); `npx playwright test --list` lists `round.spec.ts`. PR #64: `ci`, `db`, `e2e`, `smoke` pass; alarm commit `4b75947`: CI failure as planned, revert exact (`107b5ca`..`b569d7a` empty diff); `main` `25345d7`: CI success. Checked without a finding: dev pages gated (404 outside dev, no `set:html`), hydration (no motion on the first render), focus on „Kopiuj” survives the compact switch (no remount), the field keeps its name „Link dla graczy”, latecomers (admission reloads the page, `JoinWaiting.tsx:128`, so no motion), performance (≈22 transform/opacity animations at 20 players).

## Findings

### F1 — Zasada ruchu w AGENTS.md mówi co innego niż kod

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Pattern Consistency
- **Location**: AGENTS.md:54 (i komentarz `src/components/room/RoomScreen.tsx:199-200`)
- **Detail**: Nowa zasada od pierwszego dnia ma trzy rozjazdy z kodem: (1) „Motion in a room runs only under `motion-safe:`”, a spinner zajętości (`src/components/ui/spinner.tsx:5`, `animate-spin`) kręci się bez `motion-safe:` w `HostActions`, `JoinRequests`, `CohostButton`, `ProposalForm` i innych; (2) „Motion never holds back data”, a tabela wyniku (jedyna część z liczbami, koło jest `aria-hidden`) jest przez 500 ms przezroczysta i w pełni widoczna po ok. 1 s (`reveal-motion.ts:9`, wybór Karola 15.11); czytnik ekranu dostaje dane od razu; (3) „only when the voting turns into the reveal”, a kod puszcza ruch przy każdej zmianie klucza, która kończy się na odsłonie (`RoomScreen.tsx:209`), więc telefon, który przespał głosowanie w otwartej karcie, też zobaczy ruch. Zachowanie w (3) jest dobre dla gracza (wynik jest dla niego nowy), więc poprawić trzeba słowa, nie kod. Ryzyko: kolejny agent „naprawi” spinnery albo wytnie ruch tabeli, który wybrał Karol.
- **Fix**: Przeredagować punkt w `AGENTS.md` §UI: dotyczy ruchu wejścia i ozdobnego (spinner zajętości to wyjątek); krótkie wejście do ok. 1 s jest dozwolone, gdy dane są od pierwszej klatki w DOM i u czytnika; ruch odsłony gra, gdy nowa odsłona przychodzi w otwartej karcie, nigdy po przeładowaniu ani u spóźnionego. Ten sam sens w komentarzu `RoomScreen.tsx:199-200`.
- **Decision**: FIXED (Karol 2026-11-16, gałąź `reveal-ui-deploy`): punkt o ruchu w `AGENTS.md` §UI przeredagowany (ruch wejścia i ozdobny pod `motion-safe:`, spinner zajętości jako wyjątek; krótkie wejście do ok. 1 s dozwolone, gdy dane są od pierwszej klatki w DOM i u czytnika; ruch odsłony raz, gdy nowa odsłona dochodzi do otwartej karty, także na telefonie, który przespał głosowanie). Ten sam sens w komentarzu `RoomScreen.tsx` przy `motionRound`. Kod bez zmian.

### F2 — Zwinięte pole linku ma 12 px na telefonie

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: src/components/room/PlayerLink.tsx:79
- **Detail**: `text-xs` w trybie `compact` zastępuje `text-base` z `Input` (`src/components/ui/input.tsx:10`), a `md:text-sm` zostaje: 12 px na telefonie, 14 px od `md`. Pole o czcionce poniżej 16 px może na iPhonie (Safari) powiększyć stronę przy fokusie; pole jest `readOnly`, więc to niepewne. Fokus dostaje po dotknięciu i w zapasowej drodze bez schowka (`linkRef.current?.focus()`). Pole widzi tylko prowadzący na odsłonie.
- **Fix**: Dopisać do ręcznego 3.5: na iPhonie dotknąć zwiniętego pola i „Kopiuj”; jeśli strona się powiększa, `text-base md:text-xs` w trybie `compact`.
- **Decision**: ACCEPTED (Karol 2026-11-16): dopisane do ręcznego 3.5 w `plan.md` (Faza 3, Manual Verification i Progress): na iPhonie dotknąć zwiniętego pola i „Kopiuj”; jeśli strona się powiększa, `text-base md:text-xs` w trybie `compact`.

### F3 — e2e nie sprawdza, że odpytywanie nie puszcza ruchu drugi raz

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Success Criteria
- **Location**: tests/e2e/round.spec.ts:103-110
- **Detail**: Po przeładowaniu B test czyta animacje raz, tuż po pierwszym pobraniu stanu; usterka, która włączyłaby ruch dopiero po tym pobraniu, mogłaby jeszcze dać 0. Licznik `> 0` u hosta nie zobaczy też ruchu odtwarzanego od nowa przy odpytywaniu (liczba animacji się nie zmienia), więc zdanie z komentarza `RoomScreen.tsx:203` („a refresh … never plays it again”) nie ma testu. Ryzyko małe: znacznik ruchu zmienia się tylko przy zmianie klucza widoku.
- **Fix**: Drugi odczyt po następnym odpytaniu (`nextListFetch`, `ROOM_POLL_MS` = 8 s) u B i u hosta, u hosta porównanie `startTime` animacji przed i po; koszt: ok. 8 s więcej w `e2e`.
- **Decision**: SKIPPED (Karol 2026-11-16): ryzyko małe (znacznik ruchu zmienia się tylko przy zmianie klucza widoku), a test wydłużyłby `e2e` o ok. 8 s.

### F4 — Pigułka propozycji na odsłonie poza planem

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Scope Discipline
- **Location**: src/components/room/RoomScreen.tsx:520-527
- **Detail**: Na odsłonie zwinięte propozycje pytań (pigułka) stoją w osobnej linijce nad zwiniętym linkiem (`&& view.round?.phase !== "revealed"`), bo inaczej zasłaniały „Kopiuj”. To wybór Karola (a) z Fazy 1, zapisany tylko w `research.md:105`; „Changes Required” go nie opisuje. Do tego opis próbnego alarmu w planie (3.2 i treść commita) mówi „`RoundReveal` dostaje ruch zawsze”, a zmiana alarmu siedziała w `RoomScreen.tsx:470` (`animate={motionRound !== -1}`); test-plan §6.4 opisuje to poprawnie.
- **Fix**: Dopisek w `plan.md` (Faza 1, #3): pigułka w osobnej linijce na odsłonie, wybór Karola, z odnośnikiem do `research.md:105`; przy Fazie 3 #2 zdanie, że alarm włączył ruch w `RoomScreen`.
- **Decision**: FIXED (Karol 2026-11-16, gałąź `reveal-ui-deploy`): dopisek w `plan.md` Faza 1 #3 (pigułka w osobnej linijce na odsłonie, wybór Karola (a), `research.md` Z5) i Faza 3 #2 (alarm włączył ruch w `RoomScreen.tsx`, `animate={motionRound !== -1}`). Treść commita alarmu `4b75947` zostaje, jest już w historii.
