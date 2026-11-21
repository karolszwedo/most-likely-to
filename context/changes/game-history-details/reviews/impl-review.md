<!-- IMPL-REVIEW-REPORT -->

# Implementation Review: Historia gry w panelu hosta (S-26)

- **Plan**: `context/changes/game-history-details/plan.md`
- **Scope**: Full plan (fazy 1–4; ręczne 4.5 i 4.6 czekają na grę Karola)
- **Reviewed phases**: 1, 2, 3, 4
- **Date**: 2026-11-21
- **Verdict**: APPROVED
- **Findings**: 0 critical, 1 warning, 4 observations

## Verdicts

| Dimension           | Verdict |
| ------------------- | ------- |
| Plan Adherence      | PASS    |
| Scope Discipline    | PASS    |
| Safety & Quality    | PASS    |
| Architecture        | PASS    |
| Pattern Consistency | WARNING |
| Success Criteria    | PASS    |

## Evidence

- Zakres: PR #87, `git diff 2d70b0f^1 2d70b0f` (37 plików). Wszystkie pliki z „Changes Required” są w diffie. Spoza planu są cztery pliki i każdy jest uzasadniony: `AppHeader.astro` (sam komentarz), `room-frame.ts` (`historyInHalves`, szerokości pokoju mieszkają w tym module), `tests/e2e/support/round.ts` (nagłówki podsumowania N2, domyślne zostają dla innych speców), `tests/unit/game-list.test.ts` (dwa testy `href`).
- Bramka na `main` (`2d70b0f`, 21.11): `npm run lint`, `npx astro check` (0 błędów), `npm test` (2530/2530), `npm run build` przechodzą. `npx prettier --check` dla dokumentów zmiany przechodzi. `npx supabase migration list` pokazuje `20261120174140` lokalnie i zdalnie. CI na PR i na `main` zielone (`ci`, `smoke`, `db`, `e2e`), smoke na produkcji 150/150 z krokami historii.
- Sprawdzone i w porządku:
  - Odmowy `game_history` stoją przed odczytem gry, jak w `delete_game`. Obcy host, brak pokoju i brak wołającego dają `room_unknown`; `game_not_ended` pada dopiero po sprawdzeniu hosta.
  - Funkcja ma `security definer`, `stable` i `search_path = ''`. Właściciel to `postgres`, `revoke`, a potem `grant` tylko dla `authenticated`. Niczego nie zapisuje (pgTAP `game_rows`).
  - Jedno RPC na stronę, a złączenia idą po kluczach głównych.
  - Bez `client:*`, `set:html` i `dangerouslySetInnerHTML`. `ballots`, `question_id`, `host_id` ani id użytkowników nie wychodzą z Workera (test jednostkowy przez `JSON.stringify`).
  - Żadnych danych głosujących: liczby z odsłony to podzbiór tego, co `room_lobby` dał pokojowi przy odsłonie.
  - DOM odsłony w pokoju i ekranu końca gry jest bez zmian po wydzieleniu `ResultTable` i nowych propsach `GameSummary`.
- Uwaga podagenta odrzucona jako już zdecydowana: tekst pytania z bazy jest dzisiejszym brzmieniem z `src/data/questions.ts`. To decyzja 5 planu (FR-030: historia nic nie dopisuje do bazy).

## Findings

### F1 — Ręcznie złożony link „Twoje gry” zamiast wariantu `link` przycisku

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Pattern Consistency
- **Location**: src/components/room/GameHistory.tsx:28-30, :55
- **Detail**: `BACK_LINK` to własny ciąg klas linku. Komentarz mówi „as the game's other text links”, ale żaden inny widok gry nie składa linku ręcznie. Wspólny styl to `buttonVariants({ variant: "link" })` (`src/components/ui/button.tsx:24`). `/dev/ui-kitchen-sink` ma już dla niego wiersz z etykietą „Twoje gry” i opisem „w grze dziś nieużywany” (`src/pages/dev/ui-kitchen-sink.astro:84-89`). Nowy styl linku nie ma wiersza w kuchni, wbrew `AGENTS.md` „## UI”.
- **Fix**: Złożyć link z `buttonVariants({ variant: "link", size: "sm" })` z `self-start` (i ewentualnie `px-0`). W kuchni zmienić „gdzie” na powrót „Twoje gry” w historii gry. Pokazać Karolowi zrzut przed i po.
  - Strength: jeden styl linku w grze; wiersz w kuchni już istnieje i od razu zaczyna opisywać prawdziwe użycie.
  - Tradeoff: link dostaje wysokość 32 px i zaokrąglony pierścień fokusu, więc wygląd zatwierdzony w 3.5 lekko się zmienia i potrzebny jest zrzut dla Karola.
  - Confidence: HIGH — wariant i jego wiersz w kuchni są gotowe, zmiana dotyczy jednego elementu.
  - Blind spot: nie sprawdzony odstęp nad nagłówkiem „Podsumowanie wieczoru” przy wyższym linku.
- **Decision**: PENDING

### F2 — Lista pytań to `<ol>`, a reguła UI mówi o `<ul>`

- **Severity**: 🔵 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Pattern Consistency
- **Location**: src/components/room/GameHistory.tsx:74; AGENTS.md:57
- **Detail**: Plan wprost każe użyć `<ol>` („pytania jako `<ol>`”), a kolejność jest tu treścią („Pytania po kolei”). `AGENTS.md` mówi jednak, że wiersze kafelków „stay `<li>` in a `<ul>`”. Następny agent może to „naprawić” w złą stronę.
- **Fix**: Dopisać w `AGENTS.md` (UI, zdanie o kafelkach), że lista, której treścią jest kolejność (pytania po kolei w historii gry), jest `<ol>`.
- **Decision**: PENDING

### F3 — Dwa komentarze mówią mniej, niż robi kod

- **Severity**: 🔵 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: src/middleware.ts:6; supabase/migrations/20261120174140_game_history_details.sql:23
- **Detail**:
  - Komentarz przy `PROTECTED_ROUTES = ["/gry"]` wymienia tylko „Twoje gry”, choć prefiks chroni też `/gry/<id>`. Ochrona działa: smoke ma krok „game history redirects anonymous user”, a funkcja bez sesji odmawia.
  - Nagłówek migracji mówi, że funkcja nigdy nie oddaje „who could vote (eligible)”. Tymczasem `results` mają wiersz z zerem dla każdego uprawnionego, który wciąż jest w pokoju, więc lista pośrednio pokazuje, kto mógł głosować. To ta sama lista, którą pokój widział przy odsłonie, czyli nic nowego. Wgranej migracji nie poprawiamy.
- **Fix**: Poprawić komentarz w `src/middleware.ts` (lista i historia gier). Niuans nagłówka migracji zostaje zapisany tylko w tym raporcie.
- **Decision**: PENDING

### F4 — Zamiana powodu odmowy na status strony bez testu

- **Severity**: 🔵 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: src/pages/gry/[id].astro:44-49
- **Detail**: Nic nie przypina, że `service_unavailable` daje 503, a inny błąd 500. Smoke sprawdza 302, 404 i 200, testy jednostkowe `gameHistory` sprawdzają `unexpected`. To cztery linie, takie same jak w `src/pages/gry.astro`, który też nie ma testu.
- **Fix**: Bez zmian teraz. Gdy zamiana urośnie albo pojawi się trzecia strona, wydzielić wspólną funkcję z testem jednostkowym.
- **Decision**: PENDING

### F5 — Dwie połowy od `lg` tylko wtedy, gdy podsumowanie ma koło

- **Severity**: 🔵 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Adherence
- **Location**: src/components/room/GameHistory.tsx:74; src/components/room/room-frame.ts (`historyInHalves`)
- **Detail**: U4 mówi o dwóch połowach od `lg`. Kod robi je tylko wtedy, gdy podsumowanie ma koło. Gra bez odsłony i gra, w której wszyscy się wstrzymali, zostają w jednej kolumnie 512 px, tak samo jak `endInHalves` na ekranie końca gry. Karol widział oba stany w podglądach (209, 210) i zaakceptował je w 3.5, ale plan tego przypadku nie nazywa.
- **Fix**: Dopisać w planie przy U4 jedno zdanie: bez koła podsumowania strona zostaje w jednej kolumnie, jak koniec gry.
- **Decision**: PENDING
