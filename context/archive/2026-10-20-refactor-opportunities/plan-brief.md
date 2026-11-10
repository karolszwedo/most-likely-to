# Strażnicy bramy RPC i anonimowości w przeglądarce — Plan Brief

> Full plan: `context/changes/refactor-opportunities/plan.md`
> Research: `context/changes/refactor-opportunities/research.md`
> Przeplanowanie 2026-11-10 według decyzji Karola z 2026-11-09 (`change.md`, „Przegląd dryfu i decyzje”).

## What & Why

Dwa strażniki zamiast przebudowy. **K1** (już na `main`): test, który pilnuje, z jaką nazwą funkcji bazy i jakimi
argumentami Worker woła bazę dla każdej akcji gry. **D7** w nowym kształcie: po S-04 głos legalnie siedzi w karcie
(`sessionStorage`), a nick w `localStorage`, więc reguła „zero pamięci przeglądarki” jest martwa. Zamiast niej test e2e
zachowania (głos nie wychodzi poza kartę) i reguła lintu na interfejsy, których gra w ogóle nie używa.

## Starting Point

Test bramy RPC ma 44 przypadki i obejmuje 28 wywołań `callRpc`; nie zrobiono jego próbnych alarmów. Głos karty trzyma
`src/lib/rooms/my-vote.ts`, nick i kolor `remembered-nick.ts`; `document.cookie`, `cookieStore` i `indexedDB` nie
występują w `src`. `tests/e2e/rejoin.spec.ts` sprawdza wpis głosu w karcie, ale nigdzie nie sprawdza, że głos nie trafił
poza nią. Gałąź `refactor-opportunities-finish` ma już archiwum `guest-vote-flow-analysis` i Progress
`scroll-and-focus-fixes`.

## Desired End State

Po głosie i przeładowaniu ani ciasteczka, ani `localStorage`, ani IndexedDB, ani adres strony gościa i hosta nie niosą
nicku, na który zagłosowali (test e2e w CI). `document.cookie`, `cookieStore` i `indexedDB` w `src` dają błąd lintu w
chwili edycji, w `npm run lint` i w CI. `test-plan.md` opisuje trzy warstwy anonimowości. Gra działa dokładnie jak dziś.

## Key Decisions Made

| Decision            | Choice                                                               | Why (1 sentence)                                                                                           | Source             |
| ------------------- | -------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- | ------------------ |
| Faza 1              | Zostaje; alarmy 1.4/1.5 robi agent lokalnie, 1.6 pominięte           | Test jest na `main`, brakuje tylko dowodu, że świeci; czytanie 44 nazw nic nie wnosi                       | Karol, 09.11       |
| Dawna Faza 4        | Skreślona                                                            | Smoke od `b9d0c3c` odsłania rundę przez Workera (`smoke.mjs:604`)                                          | Karol, 09.11       |
| Dawne fazy 2–3      | Jedna nowa faza                                                      | Reguła „tylko znacznik przeładowania” łamie się na legalnym głosie w karcie i nicku w `localStorage`       | Karol, 09.11       |
| Strażnik głosu      | Test e2e zachowania w `rejoin.spec.ts`                               | Tylko zachowanie odróżni „głos w karcie” od „głos w `localStorage`”: idą przez te same funkcje             | Karol, 09.11       |
| Migawka pamięci     | `storageState({ indexedDB: true })` z Playwrighta                    | Ciasteczka (także `HttpOnly`), `localStorage` i IndexedDB naraz, bez karty, czyli dokładnie granica zasady | Plan               |
| Kto jest sprawdzany | Gość (Ola) i host                                                    | Dwie role głosują, jedno miejsce testu, koszt dwóch linii                                                  | Plan               |
| Kontrola pozytywna  | Karta ma nick celu, migawka ma własny nick gracza                    | Test nie może być zielony tylko dlatego, że nic nie przeczytał                                             | Plan               |
| Reguła lintu        | `document.cookie`, `cookieStore`, `indexedDB`; `error`, bez wyjątków | Gra ich nie używa (0 trafień); hooki mają `--quiet`, więc ostrzeżenie byłoby niewidoczne                   | Karol, 09.11       |
| `.astro` `<script>` | Znana luka lintu, zapisana w §6.3                                    | Lint ich nie parsuje; na ścieżce głosu skutek i tak widzi test e2e                                         | Przegląd 20.10, F1 |
| Próbny alarm e2e    | Jeden tymczasowy commit: głos do `localStorage` i ciasteczka         | Jeden przebieg CI pokazuje naraz alarm lintu (`ci`) i testu (`e2e`)                                        | Plan (Karol)       |

## Scope

**In scope:**

- próbne alarmy 1.4 i 1.5 (lokalnie, bez commita)
- sprawdzenie w `tests/e2e/rejoin.spec.ts`, blok reguły w `eslint.config.js`
- `context/foundation/test-plan.md` §6.3 i §6.4; jeden PR porządków z archiwum `guest-vote-flow-analysis`

**Out of scope:**

- reguła na `localStorage`/`sessionStorage`, krok smoke, krok 1.6
- naprawa lintowania `<script>` w `.astro`, logi dostawców (P15), K2–K5, P6, P17
- zmiany w `src`, migracje, `db push`, smoke na produkcji

## Architecture / Approach

Test zostaje w scenariuszu „odświeżenie w trakcie głosowania”: po przeładowaniu Oli runda dalej głosuje, więc wpis karty
żyje, a każdy zapis z chwili głosu przetrwał w ciasteczku lub `localStorage`. Szuka nicku surowego i po
`encodeURIComponent`, przez `expect.soft` (ciasteczka, pamięć stron, adres osobno). Reguła lintu to ESLint z rdzenia
(`no-restricted-globals`, `no-restricted-properties`) w `src/**/*.{ts,tsx,astro}`. Pierwszy push niesie commit fazy i
commit alarmu; revert i drugi push dają zielone CI na końcowym kodzie.

## Phases at a Glance

| Phase                          | What it delivers                                       | Key risk                                                          |
| ------------------------------ | ------------------------------------------------------ | ----------------------------------------------------------------- |
| 1. Test bramy RPC (K1)         | dowód, że test bramy świeci (2 alarmy lokalnie)        | złe współrzędne (`:449` to etykieta; poprawne `:445`)             |
| 2. Głos nie zostaje poza kartą | test e2e, reguła lintu, §6.3–6.4, alarmy, PR porządków | fałszywa zieleń migawki (osłania kontrola pozytywna i alarm w CI) |

**Prerequisites:** gałąź `refactor-opportunities-finish` od `e501ac3`; zgoda Karola na każdy push.
**Estimated effort:** jedna sesja na obie fazy plus dwa przebiegi CI (alarm, potem zielony).

## Open Risks & Assumptions

- Test pilnuje jednej ścieżki głosu (`rememberMyVote` w karcie gościa i hosta); inne scenariusze idą tą samą drogą.
- Wyciek w postaci innej niż surowa albo po `encodeURIComponent` (np. base64) przejdzie test; reguła lintu zamyka tylko
  interfejsy, których gra nie używa.
- Skryptów `<script>` w `.astro` lint nie sprawdza; poza ścieżką głosu nic ich nie pilnuje.

## Success Criteria (Summary)

- Literówka w `"reveal_round"` (`server.ts:445`) i zamiana argumentów `createRoom` świecą lokalnie w teście bramy.
- Głos zapisany do `localStorage` albo ciasteczka świeci w `e2e` (i w `ci` przez lint przy `document.cookie`).
- CI zielone we wszystkich jobach na końcowym commicie, Karol scalił, gra działa jak dziś.
