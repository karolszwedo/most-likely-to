<!-- IMPL-REVIEW-REPORT -->

# Implementation Review: Wersja angielska gry (S-27)

- **Plan**: context/changes/english-version/plan.md
- **Scope**: Full plan (all automated criteria done; manual 6.4 and 6.5 pending, the owner's check at the next game)
- **Reviewed phases**: 1, 2, 3, 4, 5, 6
- **Date**: 2026-11-25
- **Verdict**: APPROVED
- **Findings**: 0 critical, 2 warnings, 8 observations

## Verdicts

| Dimension           | Verdict |
| ------------------- | ------- |
| Plan Adherence      | WARNING |
| Scope Discipline    | PASS    |
| Safety & Quality    | WARNING |
| Architecture        | PASS    |
| Pattern Consistency | WARNING |
| Success Criteria    | WARNING |

Verdict: two warnings (F1, F2), neither touches votes, anonymity or data, and neither shows in an ordinary game; the rest are observations. Hence APPROVED, with F1 and F2 worth fixing.

Evidence: PR #92 as `git diff 1e4f3d6^1 1e4f3d6` (684c299..1e4f3d6 would also hold S-28, S-29 and S-30), PR #91 as `684c299^1..684c299`; `src`, `tests` and `scripts` are the same at HEAD as at `fb33463`, which the owner accepted (5.6). Two independent reviewers (plan drift; safety and quality) plus this session's own reading of the server, the switch, the room's state and both dictionaries. Limits: the quality scan covered PR #92; the code of PR #91 (phase 1) was checked against the plan, and its dictionary read in full, but not scanned again. Phase 2 was checked as withdrawn: `supabase` and `tests/db` diff empty, no `invalid_language`, `p_language` or `playsIn` left. Local gate on HEAD: `npm run lint`, `npx astro check` (0 errors), `npm test` (2828 passed, 1 skipped), `npm run build` green. `db`, `e2e` and smoke were not run again (CI on PR #92 and on `main` green, smoke on production 157/157, 25.11). Not repeated: the comparison of the previews (5.2, no code change since).

Checked and clean: no remount, replayed motion or lost draft on a switch, focus on the pill, `<html lang>` and the tab's title follow (reviewer's harness in headless Chrome); the bells' effect never runs again on a language; `live-lang` is one module in the build; no open redirect, CSRF checks on both content types, `no-store` on every answer; no question text in `dist/client` (all 960 + 960 searched; only the 4 teaser phrases); every case of decision 4 has its test; 130 drawn pairs PL | EN read by this session, no wrong translation, no English text used twice. The switch stands in the row, not in the corner, at about 1152-1535 px on the history in halves (`room-frame.ts`, `wide`), as its comment says; part of what 5.6 accepted, so no finding.

## Findings

### F1 — Odmowa, która przyjdzie tuż po przełączeniu języka, nie pokazuje się wcale

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Safety & Quality
- **Location**: src/lib/i18n/react.tsx:41-51 (`useTextState`), najgorzej src/components/room/RoundVoting.tsx:159, 223
- **Detail**: Gracz naciska „Zagłosuj” na wolnej sieci i przełącza PL→EN, zanim przyjdzie odpowiedź. Odmowa (`round_over`, błąd sieci) zapisuje się pod starym językiem i hak jej nie pokazuje: formularz po prostu znów jest aktywny, bez powodu, czytnik milczy. Tak samo każdy inny ruch z tym hakiem. Komentarz w kodzie mówi, że to celowe, ale `AGENTS.md` zakazuje połykania błędów, a `HostActions` w tym samym PR-ze robi to dobrze (trzyma kod, tekst składa przy rysowaniu). Drugi skutek tego samego: hak zasłania, a nie czyści, więc po powrocie na stary język wraca stare zdanie (w próbie „Usunięto Kuba.” cztery rundy później w regionie czytnika, stara odmowa głosu jako `role="alert"`).
- **Fix A ⭐ Recommended**: Hak czyści tekst przy zmianie języka (stan poprawiany przy rysowaniu) i pokazuje to, co przyjdzie później.
  - Strength: Jeden plik, obie usterki naraz, komponenty bez zmian.
  - Tradeoff: Spóźniona odmowa stoi w języku sprzed przełączenia (rzadkie, jedno zdanie).
  - Confidence: HIGH — wszystkie użycia przechodzą przez ten hak.
  - Blind spot: Hak nie ma testu jednostkowego (bez DOM); sprawdzenie ręczne na podglądzie.
- **Fix B**: Błędy trzymać jako kod i składać tekst przy rysowaniu, jak `HostActions`; zdania dla czytnika czyścić przy zmianie języka.
  - Strength: Zawsze właściwy język.
  - Tradeoff: Około 11 komponentów.
  - Confidence: MEDIUM — każdy komponent osobno.
  - Blind spot: Podglądy `/dev/*` podają dziś gotowy tekst błędu.
- **Decision**: PENDING

### F2 — „Popraw” i „Zapisz” bez zmiany odbiera pytaniu drugi język

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: src/components/room/QuestionList.tsx:138-159 (`save`)
- **Detail**: Host w poczekalni otwiera „Popraw” przy pytaniu bazy i zapisuje bez zmiany. Ekran wysyła ten sam tekst, a `edit_list_question` (`20261024094002_question_list_review.sql`) zapisuje go zawsze jako własny tekst hosta. Przed S-27 gracze widzieli to samo brzmienie; teraz pytanie traci drugi język i ekran po polsku pokazuje „Kto z nas najprawdopodobniej be late for their own birthday?” (u polskiego hosta odwrotnie). Znika też z danych o pytaniu, jak dotąd. Decyzja 9 dotyczy prawdziwej przeróbki, nie zapisu bez zmiany.
- **Fix**: Zapis bez zmiany (`savedQuestion(draft)` równe obecnemu tekstowi) działa jak „Anuluj”: bez wysyłania, wiersz wraca do podglądu.
- **Decision**: PENDING

### F3 — Zdania dla czytnika ekranu zostają w starym języku

- **Severity**: 👁 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Pattern Consistency
- **Location**: src/components/room/QuestionList.tsx:294, ProposalForm.tsx:66, JoinRequests.tsx:183, QuestionProposals.tsx:217, RoomScreen.tsx:279
- **Detail**: Cztery ukryte regiony trzymają gotowe zdanie w zwykłym `useState`, wbrew regule dopisanej w tym PR-ze do `AGENTS.md` (tekst w słowach → `useTextState`), więc po przełączeniu stoją po staremu pod `<html lang>` nowego języka. Odwrotnie informacja o roli współhosta: składa się przy rysowaniu, więc przełączenie czyta ją jeszcze raz, nawet po minutach.
- **Fix**: Cztery regiony przez `useTextState` po poprawce F1 (inaczej wróciłby stary tekst); informacja o roli nie czytana ponownie po samej zmianie języka.
- **Decision**: PENDING

### F4 — Lista pytań hosta nie oznacza języka pytania

- **Severity**: 👁 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Adherence
- **Location**: src/components/room/QuestionList.tsx:186
- **Detail**: `change.md` (24.11): zostaje `lang` na zdaniu w innym języku niż ekran. `ListQuestion.lang` jest wysyłane i sprawdzane, ale lista go nie czyta. Dziś widać to tylko przez chwilę po przełączeniu; przy pierwszym wpisie na `POLISH_ONLY` polskie pytanie stałoby pod „Who’s most likely to…” bez `lang`, a strażnik przypomni tylko o dopisku.
- **Fix**: `lang={foreignLang(question.lang, screen)}` na tekście wiersza (po zapisanej zmianie język ekranu).
- **Decision**: PENDING

### F5 — Strażnik „pytania tylko na serwerze” łapie tylko import wprost

- **Severity**: 👁 OBSERVATION
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Safety & Quality
- **Location**: eslint.config.js:113-135
- **Detail**: Reguła odmawia `@/data/*` w `src/components/**`. Przepuszcza tam `@/lib/rounds/draw` i `@/lib/rooms/server` (oba ciągną całą bazę), dynamiczny `import()` oraz `@/data/*` w modułach przeglądarki spoza `components` (`src/lib/rooms/shared.ts`, `src/lib/i18n/index.ts`). Jedna pomyłka wysyła 960 pytań dwa razy, z 18+. Dzisiejsza paczka jest czysta.
- **Fix**: Skrypt po buildzie, obok `check-fonts`, szuka tekstów pytań w `dist/client` jako całych napisów (zdania z karty linku stoją w dłuższym napisie, więc nie zapalą).
  - Strength: Łapie każdą drogę, także taką, której reguła nie zna.
  - Tradeoff: Nowy skrypt około 30 linii w `npm run build`.
  - Confidence: HIGH — tym sposobem sprawdzono dziś paczkę.
  - Blind spot: Zmiana zapisu znaków w paczce (np. `\u…`) wymaga porównania po rozkodowaniu.
- **Decision**: PENDING

### F6 — Dwa szybkie przełączenia mogą zapamiętać nie ten język

- **Severity**: 👁 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: src/components/room/LanguageSwitch.tsx:45-58 (`keepLang`)
- **Detail**: Dwa przełączenia pod rząd wysyłają dwa zapisy bez kolejki, więc wygrywa odpowiedź, która przyjdzie później (w próbie ekran `pl`, ciasteczko `en`). Bez `keepalive` przełączenie tuż przed przeładowaniem lub zamknięciem może się nie zapisać (niesprawdzone).
- **Fix**: Zapisy jeden po drugim i `keepalive: true`.
- **Decision**: PENDING

### F7 — Odrzucony stan w starym języku może opóźnić nowinę

- **Severity**: 👁 OBSERVATION
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Safety & Quality
- **Location**: src/components/room/useRoomState.ts:341
- **Detail**: Odpowiedź w starym języku wypada także wtedy, gdy niesie odsłonę. Gdy następne pobranie się nie uda, odsłona czeka na odpytywanie (w próbie 7,9 s, w granicy 10 s). Zgodne z planem (`reviews/plan-review.md` F4), bardzo rzadkie. W locie jest zawsze jedno pobranie, więc odpowiedź w starym języku przychodzi przed startem nowego: pokazanie jej niczego nie cofa, a treść i tak ma swój `lang`.
- **Fix**: Usunąć odrzucanie; nowy stan w nowym języku przychodzi zaraz po nim.
  - Strength: Mniej kodu i znika gałąź bez testu (F8).
  - Tradeoff: Odejście od planu; własny tekst gracza przez chwilę z początkiem w starym języku.
  - Confidence: MEDIUM — wynika z czytania `limiter.ts`, nie z próby.
  - Blind spot: `RoomView.lang` zostaje wtedy bez czytelnika.
- **Decision**: PENDING

### F8 — Testy słabsze, niż mówi plan

- **Severity**: 👁 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Adherence
- **Location**: tests/unit/screen-lang.test.ts:263-274, src/pages/api/rooms/[id]/lobby.ts:27, context/foundation/test-plan.md:181
- **Detail**: Test „link się nie zmienił” rysuje `PlayerLink` raz na język, a `changed` przy pierwszym rysowaniu jest zawsze fałszem, więc nie może paść (kod jest dobry: `PlayerLink.tsx:42` porównuje `linkUrl`). `GET …/lobby?lang=de` → 400 sprawdza tylko czysta `askedLang`, nie trasa. Bez testu: odrzucanie starego stanu, `useTextState`, przełączenie w czekaniu na wpuszczenie. `test-plan.md:181` obiecuje pierwsze dwa.
- **Fix**: W `english.spec.ts` host przełącza język w poczekalni (link bez „zmienił się”); test trasy z 400 albo poprawione zdanie w `test-plan.md:181`.
- **Decision**: PENDING

### F9 — Telefon 360 px po angielsku: pigułka propozycji zachodzi na „Link for players”

- **Severity**: 👁 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: src/lib/i18n/en/room.ts (`proposals.captionCount`), src/components/room/QuestionProposals.tsx:244
- **Detail**: „Question suggestions (2)” zakrywa koniec napisu o 4 px, więcej od 10 propozycji; tak samo przy 340 i 320 px. Po polsku tylko przy 320 px. Zmierzone przez recenzenta z Manrope i zbudowanym CSS.
- **Fix**: Krótszy napis po angielsku, np. „Suggestions (2)” (wygląd, decyzja Karola).
- **Decision**: PENDING

### F10 — Dokumenty i komentarze za kodem

- **Severity**: 👁 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Success Criteria
- **Location**: context/changes/english-version/plan.md (Progress 5.1, 5.5, 6.4; Manual Testing 3), plan-brief.md, context/foundation/prd.md (FR-031), roadmap.md (S-27), test-plan.md:482, AGENTS.md:26, src/data/questions-en.ts:12-14, src/lib/i18n/index.ts, RoundQuestion.tsx, announce.ts:8, tests/unit/gifs.test.ts:26, scripts/ui-text.mjs:128, docs/development.md:52
- **Detail**: 5.5 i „dopisek” w 5.1 są odhaczone, choć dopisek świadomie pominięto (mówi o tym decyzja 8, nie te kroki). 6.4 i krok ręczny 3 każą sprawdzić „pytanie tylko po polsku z dopiskiem”, którego nie ma, więc tak zapisane nie dadzą się odhaczyć. PRD, roadmapa, `plan-brief.md` i nagłówek `questions-en.ts` opisują dopisek jak istniejący. Cztery miejsca mówią „zawsze język tekstu” i pomijają decyzję 9 (pytanie gracza: język czytającego). `test-plan.md:482` wskazuje stary `LINK_PREVIEW`, komentarz w `gifs.test.ts:26` mówi „the game's language”, komunikat `ui-text` wymienia tylko `pl/`. Żadne zdanie nie podaje starego kierunku (język gry) jako obecnego.
- **Fix**: Nota „Po decyzjach Karola i wdrożeniu” w planie (bez zmiany tytułów kroków), reszta zdań poprawiona.
- **Decision**: PENDING
