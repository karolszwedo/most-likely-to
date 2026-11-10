# Strażnicy bramy RPC i anonimowości w przeglądarce — plan implementacji

> Przeplanowanie 2026-11-10 (decyzje Karola z 2026-11-09, `change.md`, „Przegląd dryfu i decyzje”). Plan z 2026-10-22
> sprawdzony wobec `main` (`e501ac3`, po S-04, S-07, S-09, S-10, S-11, S-18, S-19):
>
> - Faza 1 jest na `main`: commit `6827aaa` po przepisaniu historii 2026-10-22 to `9e00c34`
>   (`context/deployment/history-rewrite-2026-10-22.md:221`). Zostały próbne alarmy 1.4 i 1.5 (agent, lokalnie); 1.6
>   pominięte.
> - Dawne fazy 2–4 skreślone. Fazy 2–3 (reguła „zero pamięci przeglądarki poza znacznikiem przeładowania”) nie pasują do
>   twardej zasady po S-04 i S-14; zastępuje je nowa Faza 2. Faza 4 (krok smoke „Odsłoń wynik”) jest zbędna: smoke od
>   `b9d0c3c` odsłania rundę przez Workera (`scripts/smoke.mjs:604`, `test-plan.md` §6.5 „Kontrola pozytywna”).

## Overview

Plan realizuje pozycję **K1** z rankingu `research.md` tej zmiany (strażnik bramy RPC, Faza 1, już na `main`) i tani
zysk **D7** w nowym kształcie: trzecia warstwa strażnika anonimowości, tym razem w przeglądarce. Test e2e sprawdza, że po
głosie ani pamięć przeglądarki poza kartą (ciasteczka, `localStorage`, IndexedDB), ani adres strony nie zawierają nicku,
na który oddano głos. Reguła ESLint bez wyjątków zabrania w `src` interfejsów, których gra wcale nie używa:
`document.cookie`, `cookieStore` i `indexedDB`. Kod gry się nie zmienia. Zmiana zamyka gałąź porządków jednym PR-em.

## Current State Analysis

- **Faza 1 na `main`.** `tests/unit/room-rpc-gate.test.ts` ma 44 przypadki w jednym `it.each` (`:547`) i obejmuje
  wszystkie 28 wywołań `callRpc` w `src/lib/rooms/server.ts` (opis w `test-plan.md` §6.1). Wywołanie `"reveal_round"`
  jest w `server.ts:445` (`:449` to tylko etykieta w `actionResult`), `createRoom` w `:131`, `p_nick` `:136`,
  `p_link_token` `:137`. Próbne alarmy 1.4 i 1.5 nie zostały zrobione.
- **Twarda zasada po S-04** (`AGENTS.md`, pierwsza Hard Rule): cel głosu wolno trzymać tylko w karcie głosującego,
  `sessionStorage` pod kluczem `mlt-my-vote:<roomId>` (`src/lib/rooms/my-vote.ts:15`, wartość `{round, target}` w JSON,
  `:70`), od głosu do odsłony, pominięcia albo następnej rundy; nigdy w `localStorage`, ciasteczku ani adresie, nigdy na
  serwerze.
- **Pamięć przeglądarki w `src` dziś**: `localStorage` tylko w `browserNickStorage` (`src/lib/rooms/remembered-nick.ts:37`:
  nick `mlt-nick` i kolor `mlt-color`, S-14, S-18); `sessionStorage` w `browserSessionStorage` (`remembered-nick.ts:110`:
  pokoje zapytane o kolor i głos karty) oraz znacznik przeładowania (`src/components/room/useRoomState.ts:105,106,116`).
  `document.cookie`, `cookieStore`, `indexedDB`: 0 trafień w `src` (grep 2026-11-10). Ciasteczko gracza ustawia serwer.
- **Reguła na nazwy interfejsów nie odróżni** „głos w karcie” od „głos w `localStorage`”: oba idą przez te same funkcje
  (`browserNickStorage`, `browserSessionStorage`). Głos poza kartą może więc wykryć tylko test zachowania.
- **Test e2e S-04** (`tests/e2e/rejoin.spec.ts`): „odświeżenie w trakcie głosowania” (`:49-97`) — Ola głosuje na Kubę,
  przeładowuje stronę i widzi „Twój głos: <Kuba>.”; host głosuje na Olę. Plik czyta już wpis karty (`storedVote`,
  `:43-46`) i sprawdza jego zniknięcie po odsłonie (drugi test), ale nigdzie nie sprawdza, czy głos nie trafił poza kartę.
- **ESLint**: brak `no-restricted-globals` i `no-restricted-properties` w `eslint.config.js` (jedyny zakaz to
  `@typescript-eslint/no-restricted-imports` dla `tests/**`, `:94-109`). Hooki agentów uruchamiają ESLint z `--quiet`
  (`.claude/hooks/lint-edited-file.mjs:12`, `end-of-turn.mjs:58`), więc widzą tylko błędy.

### Key Discoveries:

- Playwright 1.64 (`package.json:45`): `browserContext.storageState({ indexedDB: true })` zwraca migawkę ciasteczek
  kontekstu (wszystkich, także `HttpOnly`, których `document.cookie` nie widzi), `localStorage` i IndexedDB każdego
  źródła (`node_modules/playwright-core/types/types.d.ts:10746`). `sessionStorage` w migawce nie ma, więc migawka to
  dokładnie „pamięć poza kartą”, której dotyczy zasada.
- Wyrocznia z kroków testu: nicki z `uniqueNick` (`tests/e2e/support/room.ts:22-24`, np. `Kuba ab12c34`, ze spacją),
  więc sprawdzenie obejmuje też postać po `encodeURIComponent` (ciasteczko i adres mogą nieść ją zamiast surowej).
- Kontrola pozytywna jest pod ręką: karta Oli trzyma nick Kuby (`storedVote`, zgodnie z D1), a jej `localStorage` trzyma
  jej własny nick (`mlt-nick`, ekran pokoju zapamiętuje go po wejściu, S-14). Pierwsze dowodzi, że szukana postać nicku
  jest tą, którą gra zapisuje; drugie, że migawka naprawdę czyta `localStorage`.
- Skryptów `<script>` w `.astro` ESLint dziś nie sprawdza żadną regułą (przegląd planu 2026-10-20, F1). Test e2e widzi
  skutek niezależnie od tego, gdzie leży kod, więc na ścieżce głosu ta luka lintu jest osłonięta.
- Konwencja próbnego alarmu e2e: tymczasowy commit na gałęzi z listą testów, które mają zaświecić, push za zgodą, potem
  `git revert` (`test-plan.md` §6.4, „Break-check”). Joby CI nie mają `needs:`, więc czerwony lint w `ci` nie wyłącza
  `e2e`, a jeden przebieg pokazuje obie warstwy.

## Desired End State

- `rejoin.spec.ts` po przeładowaniu w trakcie głosowania sprawdza dla Oli (gość) i hosta: w migawce pamięci kontekstu
  (ciasteczka osobno, pamięć stron osobno) ani w adresie strony nie ma nicku, na który dana osoba zagłosowała, w żadnej
  postaci. Kontrola pozytywna: karta Oli ma nick Kuby, migawka Oli ma jej własny nick.
- ESLint w `src/**/*.{ts,tsx,astro}` zgłasza błąd przy `document.cookie`, `cookieStore` i `indexedDB` (jako zmiennej
  globalnej i jako własności `window`, `globalThis`, `self`), bez wyjątków; komunikat odsyła do pierwszej twardej zasady
  `AGENTS.md`.
- `test-plan.md` §6.3 opisuje trzy warstwy (dwie w bazie, jedna w przeglądarce) ze znaną luką `<script>` w `.astro`;
  §6.4 ma nowe sprawdzenie w opisie `rejoin.spec.ts` i wpis próbnego alarmu.
- Oba próbne alarmy trafiły dokładnie; CI zielone we wszystkich jobach na końcowym commicie PR-a porządków; Karol scalił.
- Sprawdzenie: Progress na dole, wszystkie wiersze odhaczone.

## What We're NOT Doing

- Reguły lintu na `localStorage` i `sessionStorage`: dziś 5 legalnych miejsc, a reguła nie odróżni głosu od nicku; tę
  granicę pilnuje test e2e.
- Dawna Faza 4 (krok smoke „Odsłoń wynik”): smoke już to robi (`smoke.mjs:604`). Krok 1.6 (Karol czyta nazwy testów).
- Naprawa lintowania skryptów `<script>` w `.astro` (osobna zmiana; luka zostaje zapisana w §6.3).
- Sprawdzanie logów i żądań do serwera (P15: logi dostawców są poza kodem; żądanie głosu z definicji niesie cel).
- Ten sam test w scenariuszach „martwe gniazdo” i „powrót bez ciasteczka”: głos idzie tą samą drogą (`rememberMyVote`),
  jedno miejsce wystarcza.
- K2, K3, K4, K5, P6, P17 (osobne zmiany), zmiany w `src`, migracje, `db push`, smoke na produkcji (wdrożenie nie zmienia
  działania gry).

## Implementation Approach

Faza 1 kończy się lokalnie (próbne alarmy bez commita). Faza 2 to jeden commit fazy na gałęzi
`refactor-opportunities-finish`, razem z porządkami, które już na niej czekają: commit `3815951` (archiwum
`guest-vote-flow-analysis`), Progress `scroll-and-focus-fixes/plan.md` (3.1–3.3) i zmiany w tym folderze. Najpierw lokalnie
reguła, test, dokumenty i alarm lintu. Pierwszy push (zgoda Karola) niesie commit fazy i od razu tymczasowy commit
alarmu e2e, więc jeden przebieg CI pokazuje alarm obu warstw; potem `git revert`, drugi push (zgoda), CI zielone, PR
gotowy. Tree po revercie jest równe commitowi fazy, więc zielone CI na revercie dotyczy końcowego kodu. Scala wyłącznie
Karol (`! gh pr merge <n> --merge`).

## Critical Implementation Details

- **Szukana postać nicku.** Każde sprawdzenie szuka nicku surowego i po `encodeURIComponent`, w tekście JSON migawki
  (nazwy i wartości ciasteczek osobno od `origins`) i w `page.url()`. Asercje przez `expect.soft`, z komunikatem, która
  osoba i która część pamięci, żeby alarm pokazał w jednym biegu wszystkie trafienia.
- **Moment sprawdzenia**: po przeładowaniu Oli i jej asercjach „Twój głos: …” (`rejoin.spec.ts:82-88`), czyli gdy ekran
  już przeczytał kartę na nowo; runda dalej głosuje (Kuba nie głosował), więc wpis karty jeszcze żyje. Zapis z chwili
  głosu przetrwa przeładowanie w ciasteczku i `localStorage`, a adres po przeładowaniu jest tym samym adresem.
- **Host**: migawka `page.context()` niesie ciasteczka sesji Supabase hosta; nie zawierają nicku gościa, więc nie dają
  fałszywej czerwieni. Nick hosta w jego `localStorage` (S-14) jest innym nickiem niż cel jego głosu.

## Faza 1: Test bramy RPC (K1)

### Overview

Test unit z atrapą klienta utrwala, z jaką nazwą funkcji i jakimi argumentami Worker woła bazę dla każdej akcji gry.
Wyrocznia to ręczna tabela sygnatur SQL. Kod gry bez zmian. **Na `main`** (`6827aaa` = `9e00c34`); zostały próbne alarmy.

### Changes Required:

#### 1. Test bramy

**File**: `tests/unit/room-rpc-gate.test.ts` (na `main`)

**Intent**: Pierwszy lokalny sygnał dla `server.ts`: literówka w nazwie funkcji, zgubiony albo nadmiarowy klucz `p_*` i
wartość podana do złego parametru świecą na czerwono, zanim zmiana trafi do CI.

**Contract**: atrapa `{ rpc(fn, args) }` z odpowiedzią ze ścieżki sukcesu, ręczna tabela sygnatur SQL (nigdy z
`server.ts`), przypadki nazwane akcją gry, wartości-wartownicy, wynik `ok: true`. Dziś 44 przypadki dla 28 wywołań
`callRpc` (pierwotnie 12 dla 10).

#### 2. Wzór w planie testów

**File**: `context/foundation/test-plan.md` §6.1 (na `main`)

**Intent**: Następna funkcja RPC dostaje wiersz w tabeli testu bramy razem z migracją.

**Contract**: punkt w §6.1 (jest).

**Nota do Progress (2026-11-10)**: tytuły kroków zostają bez zmian, aktualne współrzędne są tu:

- 1.1: dziś 44 testy zielone, nie 12 (przypadki doszły ze slice'ami po 2026-10-22).
- 1.4: literówka w `"reveal_round"` w wywołaniu `callRpc` to `server.ts:445` (nie `:261`; edycja `:449` nic nie zaświeci,
  to etykieta). Czerwone mają być dokładnie 2 przypadki: „Odsłoń wynik (host, bez tokenu gościa)” i „Odsłoń wynik
  (współhost, token gościa)”.
- 1.5: zamiana wartości `p_nick` (`server.ts:136`) i `p_link_token` (`:137`) w `createRoom` (`:131`); czerwony dokładnie 1
  przypadek („Załóż grę”).
- 1.6 pominięte decyzją Karola (2026-11-09); wiersz usunięty z Progress.

### Success Criteria:

#### Automated Verification:

- `npx vitest run --project unit tests/unit/room-rpc-gate.test.ts`: wszystkie testy zielone (dziś 44)
- `npm test`, `npm run lint`, `npx astro check`, `npm run build` przechodzą
- `git diff main --stat -- src` pusty (kod gry bez zmian)

#### Manual Verification:

- Próbny alarm A (lokalnie, bez commita, agent): `"reveal_round"` → `"reveal_rounds"` w `server.ts:445` daje czerwone
  dokładnie 2 przypadki „Odsłoń wynik”; po cofnięciu `git diff -- src` pusty
- Próbny alarm B (lokalnie, bez commita, agent): zamienione wartości `p_nick` i `p_link_token` w `createRoom` dają czerwony
  dokładnie przypadek „Załóż grę”; po cofnięciu `git diff -- src` pusty

**Implementation Note**: Wyniki obu alarmów (które przypadki, z jakim komunikatem) wpisać do `change.md` tej zmiany;
bez commita kodu.

---

## Faza 2: Głos nie zostaje poza kartą

### Overview

Trzecia warstwa strażnika anonimowości, w przeglądarce: test e2e zachowania (głos nie trafia do pamięci poza kartą ani do
adresu) i reguła lintu na interfejsy, których gra nie używa. Na końcu jeden PR porządków.

### Changes Required:

#### 1. Sprawdzenie w teście S-04

**File**: `tests/e2e/rejoin.spec.ts` (test „odświeżenie w trakcie głosowania”, `:49-97`; komentarz nagłówka pliku)

**Intent**: Pierwsza twarda zasada `AGENTS.md` dostaje sprawdzenie zachowania po stronie przeglądarki: głos żyje tylko w
karcie. Łapie wyciek bez względu na to, którą funkcją albo z jakiego pliku (`.tsx`, `<script>` w `.astro`) przyszedł.

**Contract**:

- Po asercjach przeładowania Oli (Critical Implementation Details): kontrola pozytywna `storedVote(pageA, room.id)`
  zawiera nick Kuby; migawka `guestA.storageState({ indexedDB: true })` zawiera w `origins` nick Oli.
- Dla Oli (`guestA`, `pageA`, cel: nick Kuby) i hosta (`page.context()`, `page`, cel: nick Oli): `expect.soft`, że
  ciasteczka migawki (nazwy i wartości), `origins` migawki (`localStorage` i IndexedDB) i `page.url()` nie zawierają celu
  ani jego postaci po `encodeURIComponent`.
- Pomocnik w specu obok `storedVote` (jedno miejsce na „czy tekst niesie nick”), wyrocznia z kroków testu (`uniqueNick`),
  nigdy z implementacji. Nazwa testu bez zmian; nagłówek pliku i komentarz przy kroku mówią, czego pilnuje (zasada z
  `AGENTS.md`, decyzja D1).

#### 2. Reguła lintu

**File**: `eslint.config.js`

**Intent**: Interfejsy pamięci przeglądarki, których gra nie używa, zostają zamknięte w chwili edycji (hook), w
`npm run lint` i w CI; nowa potrzeba to świadoma decyzja właściciela, nie przypadek.

**Contract**:

- Nowy blok konfiguracji z komentarzem „dlaczego”, `files`: `src/**/*.{ts,tsx,astro}` (bez plików wirtualnych
  `*.astro/*.{js,ts}`, których lint nie parsuje), dodany do eksportu.
- `no-restricted-globals`: `indexedDB`, `cookieStore`. `no-restricted-properties`: `document.cookie` oraz `indexedDB` i
  `cookieStore` na `window`, `globalThis`, `self`. Poziom `error` (hooki mają `--quiet`), bez wyjątków.
- Komunikat po angielsku, zgodny z pierwszą twardą zasadą `AGENTS.md`: cel głosu żyje tylko w `sessionStorage` karty
  (`src/lib/rooms/my-vote.ts`), nigdy w ciasteczku, `localStorage`, IndexedDB ani adresie; ciasteczko gracza ustawia
  serwer; nowa pamięć przeglądarki wymaga decyzji właściciela.

#### 3. Plan testów

**File**: `context/foundation/test-plan.md` §6.3 i §6.4

**Intent**: Warstwa przeglądarki opisana obok dwóch warstw bazy; następny slice wie, gdzie dopisać sprawdzenie.

**Contract**: §6.3: zdanie wstępne z trzema warstwami i punkt „W przeglądarce” (test e2e z wyrocznią i kontrolą
pozytywną, reguła lintu, znana luka `<script>` w `.astro` osłonięta na ścieżce głosu przez e2e). §6.4: zdanie w opisie
`rejoin.spec.ts` i wpis próbnego alarmu z 2.7 (commit, revert, co zaświeciło).

### Success Criteria:

#### Automated Verification:

- `npm run lint` kończy się kodem 0, `npx eslint src` bez błędów i ostrzeżeń
- `npm test`, `npm run test:hooks`, `npx astro check`, `npm run build` przechodzą
- `npx playwright test --list` przechodzi, liczba testów bez zmian
- `git diff main --stat -- src` pusty (kod gry bez zmian)
- CI na PR zielone we wszystkich jobach (`ci`, `smoke`, `db`, `e2e`) na końcowym commicie

#### Manual Verification:

- Próbny alarm lintu (lokalnie, bez commita): odczyt `document.cookie` w `src/components/room/JoinForm.tsx`,
  `indexedDB.open(…)` w `src/components/room/RoundVoting.tsx` i `window.cookieStore` w `src/lib/rooms/my-vote.ts` dają po
  jednym błędzie lintu każde, także w hooku po edycji; po cofnięciu `git diff -- src` pusty
- Próbny alarm e2e w CI (`test-plan.md` §6.4): tymczasowy commit, w którym `rememberMyVote` zapisuje też cel głosu do
  `localStorage` i do ciasteczka przez `document.cookie`; push za zgodą. Czerwone: w `ci` dokładnie 1 błąd lintu (linia
  z `document.cookie` w `my-vote.ts`), w `e2e` tylko „odświeżenie w trakcie głosowania”, we wszystkich 3 próbach, na
  sprawdzeniach ciasteczek i pamięci stron u Oli i hosta (adres zielony); reszta e2e, `smoke` i `db` zielone. Potem
  `git revert`, push za zgodą, CI zielone; wynik w §6.4
- Karol scala PR (`! gh pr merge <n> --merge`); na `main` zielone `ci`, `smoke`, `db`, `e2e` i Workers Builds

**Implementation Note**: Push, otwarcie PR (draft przy pierwszym push, `gh pr ready` po zielonym CI) i każdy ruch na
zdalnej gałęzi tylko za zgodą Karola. Smoke na produkcji niepotrzebny: wdrożenie zmienia tylko konfigurację lintu, testy i
dokumenty.

---

## Testing Strategy

### Unit Tests:

- Test bramy RPC (Faza 1, na `main`): 44 przypadki; próbne alarmy A i B lokalnie.

### Integration Tests:

- e2e w CI: nowe sprawdzenie w `rejoin.spec.ts` (gość i host, trzy części pamięci, kontrola pozytywna); reszta e2e,
  `smoke` i `db` bez zmian jako kontrola regresji.

### Manual Testing Steps:

1. Próbne alarmy A i B z Fazy 1 (agent, lokalnie).
2. Próbny alarm lintu z Fazy 2 (trzy interfejsy w trzech plikach).
3. Próbny alarm e2e w CI z Fazy 2 (tymczasowy commit i revert, dwa push za zgodą).
4. Karol: scalenie PR.

## Performance Considerations

Dwie migawki pamięci w jednym teście e2e (milisekundy), dwie reguły ESLint z rdzenia.

## Migration Notes

Bez migracji i bez zmian bazy; kod gry bez zmian. Cofnięcie to `git revert` commita fazy. Po scaleniu: `/10x-archive
refactor-opportunities` (osobny PR, jak każde archiwum); `scroll-and-focus-fixes` czeka na 3.4 z ekipą.

## References

- Decyzje Karola z 2026-11-09: `context/changes/refactor-opportunities/change.md`
- Research (K1, D7, W26): `context/changes/refactor-opportunities/research.md`
- Przegląd planu z 2026-10-20 (F1: `<script>` w `.astro`): `context/changes/refactor-opportunities/reviews/plan-review.md`
- Twarda zasada: `AGENTS.md`, Hard Rules (pierwsza)
- Głos karty: `src/lib/rooms/my-vote.ts:15,59-71`; pamięć nicku: `src/lib/rooms/remembered-nick.ts:37,110`
- Test S-04: `tests/e2e/rejoin.spec.ts:43-97`; nicki: `tests/e2e/support/room.ts:22-24`
- Wzór zakazu w ESLint: `eslint.config.js:94-109`; hooki: `.claude/hooks/lint-edited-file.mjs:12`, `end-of-turn.mjs:58`
- Warstwy anonimowości i próbne alarmy e2e: `context/foundation/test-plan.md` §6.3, §6.4

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: Test bramy RPC (K1)

#### Automated

- [x] 1.1 `npx vitest run --project unit tests/unit/room-rpc-gate.test.ts`: 12 testów zielonych — 6827aaa
- [x] 1.2 `npm test`, `npm run lint`, `npx astro check`, `npm run build` przechodzą — 6827aaa
- [x] 1.3 `git diff main --stat -- src` pusty (kod gry bez zmian) — 6827aaa

#### Manual

- [x] 1.4 Próbny alarm A (lokalnie, bez commita): `"reveal_round"` → `"reveal_rounds"` w `server.ts:261` daje czerwony dokładnie przypadek „Odsłoń wynik”; po cofnięciu `git diff -- src` pusty — bae236d
- [x] 1.5 Próbny alarm B (lokalnie, bez commita): zamienione wartości `p_nick` i `p_link_token` w `createRoom` dają czerwony dokładnie przypadek „Załóż grę”; po cofnięciu `git diff -- src` pusty — bae236d

### Phase 2: Głos nie zostaje poza kartą

#### Automated

- [x] 2.1 `npm run lint` kończy się kodem 0, `npx eslint src` bez błędów i ostrzeżeń — bae236d
- [x] 2.2 `npm test`, `npm run test:hooks`, `npx astro check`, `npm run build` przechodzą — bae236d
- [x] 2.3 `npx playwright test --list` przechodzi, liczba testów bez zmian — bae236d
- [x] 2.4 `git diff main --stat -- src` pusty (kod gry bez zmian) — bae236d
- [ ] 2.5 CI na PR zielone we wszystkich jobach (`ci`, `smoke`, `db`, `e2e`) na końcowym commicie

#### Manual

- [x] 2.6 Próbny alarm lintu (lokalnie, bez commita): `document.cookie` w `JoinForm.tsx`, `indexedDB.open` w `RoundVoting.tsx` i `window.cookieStore` w `my-vote.ts` dają po jednym błędzie lintu każde; po cofnięciu `git diff -- src` pusty — bae236d
- [ ] 2.7 Próbny alarm e2e w CI: tymczasowy commit zapisuje cel głosu do `localStorage` i ciasteczka; czerwone tylko 1 błąd lintu w `ci` i „odświeżenie w trakcie głosowania” w `e2e`; po `git revert` CI zielone
- [ ] 2.8 Karol scala PR (`! gh pr merge <n> --merge`); na `main` zielone `ci`, `smoke`, `db`, `e2e` i Workers Builds
