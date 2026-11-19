# Wygląd ekranu odsłony wyniku (reveal-ui) — Plan Brief

> Full plan: `context/changes/reveal-ui/plan.md`
> Research: `context/changes/reveal-ui/research.md`

## What & Why

Odsłona wyniku to kulminacja rundy, a dziś wynik podmienia się w jednej klatce, jak każde odświeżenie stanu. U prowadzącego górę ekranu zajmuje do tego pełne pole „Link dla graczy”. Zmiana dodaje to, co Karol wybrał w galerii 15.11.2026: krótki ruch przy odsłonie i zwinięty link u prowadzącego. Reszta ekranu zostaje „jak dziś”.

## Starting Point

`RoundReveal` montuje się bez żadnej animacji (`RoomScreen.tsx:452-469`). `PlayerLink` stoi pełny nad każdym ekranem gry prowadzącego. Prototyp galerii leży lokalnie bez commita: `reveal-prototype.tsx` oraz zmiany w `RoundReveal`, `RoomScreen`, `PlayerLink` i `room-window.astro`.

## Desired End State

Gracz, któremu wynik odsłania się w otwartej karcie, widzi krótki ruch: koło obraca się i rośnie, tabela wjeżdża od dołu, w „Paskach” paski rosną od lewej. Po odświeżeniu, u spóźnionego gracza i przy wyłączonych animacjach w systemie wynik stoi od razu. Prowadzący ma na odsłonie link w jednej niskiej linijce, a w poczekalni i głosowaniu pełny jak dziś. Prototypu w repo nie ma, stany odsłony mają podglądy, a e2e pilnuje, kiedy ruch gra.

## Key Decisions Made

| Decision                    | Choice                                                         | Why (1 sentence)                                                                 | Source            |
| --------------------------- | -------------------------------------------------------------- | -------------------------------------------------------------------------------- | ----------------- |
| Wygląd wyniku (Z1)          | „dziś”, bez Reflektora i wyróżnień                             | Wybór Karola na zrzutach.                                                        | Research (galeria) |
| Stan pusty (Z2)             | „dziś”, bez zdania                                             | Wybór Karola na zrzutach.                                                        | Research (galeria) |
| Link na odsłonie (Z5)       | zwinięty w jedną linijkę, `ghost` `sm`                          | Wynik zaczyna się wyżej; w poczekalni i głosowaniu link jak dziś.                | Research (galeria) |
| Ruch (Z3)                   | tak, klasy z prototypu                                         | „może być taka animacja” po drugim pokazie.                                      | Plan (Karol)      |
| Kiedy ruch gra              | tylko przy zmianie fazy w tej karcie                           | Odświeżenie i spóźniony gracz nie oglądają „odsłony”, która już była.            | Plan              |
| Ruch a ustawienia systemu   | tylko pod `motion-safe:`                                        | Jak emotki; szacunek dla `prefers-reduced-motion`.                               | Plan              |
| Skąd klasy                  | `tw-animate-css` w `reveal-motion.ts`                           | Biblioteka już jest; jedno miejsce, bez nowych keyframes i tokenów.              | Plan              |
| Zwinięty link               | tryb `compact` w `PlayerLink`, szara linijka pod wierszem       | Jeden komponent; poprawka usterki prototypu (linijka obok pola).                 | Plan              |
| Z4 (wspólne koło, shadcn)   | odłożone                                                       | Wykres się nie zmienia, a wymiana prymitywów grozi rolom w e2e.                  | Plan              |
| Test                        | e2e w `round.spec.ts` + próbny alarm                           | Reguła żyje w stanie ekranu, testów komponentów w repo nie ma.                    | Plan              |

## Scope

**In scope:**

- ruch przy odsłonie (koło, tabela, paski);
- zwinięty link u prowadzącego na odsłonie;
- usunięcie prototypu;
- podglądy brakujących stanów i zrzuty dla Karola;
- e2e ruchu z próbnym alarmem;
- zasada ruchu w `AGENTS.md`;
- statusy zarzutów w `research.md`, wpis w test-plan.

**Out of scope:**

- Z1, Z2, Z4;
- ruch na innych ekranach, dźwięk, odliczanie, przełącznik animacji w grze;
- link w poczekalni i głosowaniu;
- baza, Worker, `src/lib/rooms/`.

## Architecture / Approach

`RoomScreen` już rozpoznaje zmianę widoku w tej karcie (`announcementKey`, „adjusting state while rendering”, nigdy przy pierwszym renderze). W tej samej gałęzi zapamiętuje numer rundy odsłoniętej na oczach gracza i przekazuje `RoundReveal` prop `animate`. `RoundReveal` nakłada wtedy klasy z `reveal-motion.ts` na koło, tabelę i paski. `PlayerLink` dostaje `compact`, gdy faza to `revealed`, bez ponownego montażu, więc fokus i „Skopiowano” przechodzą na odsłonę.

## Phases at a Glance

| Phase                            | What it delivers                                                        | Key risk                                                              |
| -------------------------------- | ----------------------------------------------------------------------- | --------------------------------------------------------------------- |
| 1. Odsłona: ruch i zwinięty link | prawdziwy kod zamiast prototypu, próbka z ruchem i „Powtórz ruch”        | ruch puszczony przy pierwszym renderze; e2e potknie się o animację    |
| 2. Stany odsłony i zrzuty        | 4 sekcje w `room-states`, 5 próbek w `room-window`, macierz 7 stanów    | serwer dev psuje się na pamięci Vite (wyczyścić `node_modules/.vite`) |
| 3. Test ruchu, zasada i PR       | e2e + próbny alarm, punkt w `AGENTS.md`, dokumenty, PR i wdrożenie       | asercja ruchu zależna od chwili (stąd `fill-mode-both` + `getAnimations`) |

**Prerequisites:** gałąź `reveal-ui` od `origin/main` `122f87e` (jest); zgoda Karola na push, czyszczenie `node_modules/.vite` i smoke na produkcji.
**Estimated effort:** ~2 sesje: Faza 1 z draft PR, potem Fazy 2–3 ze zrzutami i alarmem.

## Open Risks & Assumptions

- Zakładamy, że `getAnimations()` na tabeli trzyma skończone animacje z `fill-mode-both` także w CI. W Chrome Karola tak było (2 animacje po 2 s). Gdyby nie, asercja przejdzie na `animationName` z `getComputedStyle`.
- Telefony graczy z oszczędzaniem baterii mogą mieć wyłączone animacje: wtedy wynik po prostu stoi, i to jest zamierzone.
- Na wolnym telefonie tabela przez pierwsze 500 ms jest przezroczysta (opóźnienie wjazdu), a dane już są w DOM, więc czytnik ekranu i fokus działają bez czekania.

## Success Criteria (Summary)

- Na wieczorze cały pokój widzi, jak wynik „wjeżdża” w chwili odsłony, a nikt nie czeka dłużej na dane.
- Prowadzący widzi wynik wyżej na ekranie, a link dla spóźnionych dalej kopiuje się jednym dotknięciem.
- Kolejny agent dodaje ruch w pokoju jedną drogą (`motion-safe`, `reveal-motion.ts`), a e2e łapie ruch puszczony w złej chwili.
