# Nowy wygląd gry (S-25) — Plan Brief

> Full plan: `context/changes/game-restyle/plan.md`
> Research: `context/changes/game-restyle/research.md`

## What & Why

Cała gra dostaje jeden ciemny wygląd, który Karol wybrał na trzech galeriach zrzutów 2026-11-19: grafitowe tło, kolor Blurple na głównych akcjach, płasko z cieniem, guziki-pigułki, gracze jako osobne kafelki, czcionka Manrope (PRD FR-029, roadmapa S-25). Dzisiejsza szara paleta jest „za płaska” i „kolor główny nie pasuje”; zmienia się tylko wygląd, nie funkcje.

## Starting Point

Widoki są już na tokenach (0 literałów), więc wygląd siedzi w `src/styles/global.css` i `src/components/ui`. Brakuje czcionki, cienia i osobnych ról koloru; osiem list to ramki z liniami bez wspólnego źródła; tło `#1a1a1a` jest wpisane w 7 miejscach poza tokenem; kontrastu nic nie pilnuje.

## Desired End State

Każdy ekran na telefonie i laptopie wygląda jak runda 3 galerii (z poprawką kontrastu A), a `npm run lint` liczy kontrast tokenów, więc kolejna zmiana koloru nie zepsuje czytelności po cichu. Manrope ładuje się z plików gry, a budowanie bez niej jest czerwone. Listy są kafelkami z jednego modułu, wynik zostaje tabelą w jednej karcie bez linii. Pasek przeglądarki, ikona i karta linku na Discordzie mają nowe tło `#18191d`.

## Key Decisions Made

| Decision           | Choice                                                                                             | Why (1 sentence)                                                                                               | Source             |
| ------------------ | -------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------- | ------------------ |
| Kierunek wyglądu   | G2 Grafit + 6 Blurple + D1, kształty planera, Manrope, `--radius: 1rem`                            | Wybór Karola z trzech galerii zrzutów („git” na rundę 3).                                                      | Research (galerie) |
| Kontrast Blurple   | Poprawka A: guzik L 0,58, nowa rola `--primary-text` 0,76/0,12, `--ring` 0,84/0,08, `--input` 0,59 | Blurple 0,6 z białym napisem i fokusem oblewa progi (4,19 i 1,88); o włos ciemniejszy guzik przechodzi (4,56). | Plan (Karol)       |
| Czcionka           | Fonty Astro z Fontsource przy budowaniu + `check-fonts.mjs`                                        | Jak w planerze: bez nowej zależności, gracz nie łączy się z obcym serwerem.                                    | Plan (Karol)       |
| Głębia             | D1 teraz, D2–D4 osobną zmianą po grze                                                              | Mniejszy zakres, decyzja z prawdziwej gry w nowym wyglądzie.                                                   | Plan (Karol)       |
| Strażnik kontrastu | `scripts/contrast.mjs` w `npm run lint`, pary z alfą (`ring/50`, `primary/35`)                     | Dziś nic nie pilnuje kontrastu, a komponenty rysują fokus z przezroczystością.                                 | Plan               |
| Kafelki            | Jeden moduł klas `src/components/room/surfaces.ts`; `<li>` i `<table>` zostają                     | Osiem miejsc z jednego źródła, a e2e szuka wierszy listy i tabeli po rolach.                                   | Research C3 + Plan |
| Linie sekcji       | Zostają                                                                                            | Runda 3, na którą Karol odpowiedział „git”, była z liniami.                                                    | Plan               |
| Kolory graczy      | Bez zmian; komentarz o progu 3:1 zamiast 3,5:1                                                     | Zasada Karola; trzy kolory mają 3,37–3,43:1, czyli spełniają WCAG.                                             | Plan               |
| Ikona              | Tylko nowe tło, znak i plasterki bez zmian                                                         | Ikona to wybór Karola; tło musi pasować do ramy gry.                                                           | Plan               |
| Cykl               | Lżejszy (bez plan-review), `/10x-impl-review` po wdrożeniu                                         | Same ekrany, bez bazy i serwera; zmiana dotyka każdego ekranu, więc przegląd po.                               | Sesja-gry.md       |

## Scope

**In scope:** wartości i role tokenów w `.dark`, czcionka, cień, promień; kształty `button`, `badge`, `input`, `textarea`, `input-group`, `checkbox`, `card`, `alert`; karty i kruche miejsca w widokach; osiem list i tabela wyniku jako kafelki; tło w 7 miejscach + ikony; strażnicy kontrastu i czcionki; macierz 7 stanów; reguła w `AGENTS.md`; wdrożenie.

**Out of scope:** głębia D2–D4, jasna paleta i `bg-cosmic` (C5), zmiana kolorów graczy, zmiana wysokości kontrolek i układu ekranów, biały napis na guziku `destructive`, testy zrzutów i nowe zależności npm, skan `src/components/ui`.

## Architecture / Approach

Kolejność `/10x-ui`: środowisko → wartości tokenów → widok → stany. Wartości w jednym miejscu (`global.css`, z surowymi wartościami w `theme.md` zmiany), kształty w komponentach wspólnych, a widoki biorą kafelki i karty z jednego modułu stałych klas (`surfaces.ts`, wzór `reveal-motion.ts`). Strażnik kontrastu i kontrola czcionki stoją w bramce (`lint`, `build`), więc działają w CI i w Workers Builds.

## Phases at a Glance

| Phase                        | What it delivers                                                               | Key risk                                                                 |
| ---------------------------- | ------------------------------------------------------------------------------ | ------------------------------------------------------------------------ |
| 1. Czcionka i strażnicy      | Manrope, `check-fonts.mjs`, `contrast.mjs` w lint z próbnym alarmem            | Budowanie zależne od sieci do Fontsource                                 |
| 2. Nowe kolory i kształty    | Grafit + Blurple A, cień, pigułki, pola, tło `#18191d` w 7 miejscach + ikony   | Przeoczony stan albo pole za słabo widoczne; e2e zależne od układu       |
| 3. Kafelki zamiast linii     | 8 list i tabela wyniku z jednego modułu                                        | Zgubiona rola `li`/`table` albo `data-*`, na których stoją testy i fokus |
| 4. Stany, bramka i wdrożenie | Macierz 7 stanów, pełna galeria, reguła w `AGENTS.md`, PR → smoke na produkcji | Konflikt roadmapy z PR #83 przy rebase                                   |

**Prerequisites:** PR #83 (archiwa) scalony albo rebase przed pierwszym pushem; serwer dev do zrzutów; zgody Karola na push, scalenie i smoke.
**Estimated effort:** ok. 3–4 sesje (po jednej na fazę, z przerwami na zrzuty).

## Open Risks & Assumptions

- Kafelki z odstępem i inna szerokość Manrope mogą przesunąć e2e sprawdzające układ (odsłona > 400 px, guzik w oknie, pole czatu w niskim oknie); widać to dopiero w CI.
- Zakładamy, że katalog czcionek po budowaniu na naszym adapterze to `dist/…/_astro/fonts` jak w planerze; Faza 1 to sprawdza przy pierwszym budowaniu.
- Wartości z galerii liczone były z Blurple 0,6; `--accent` i pary z alfą przelicza strażnik na wartościach z poprawką A.

## Success Criteria (Summary)

- Karol mówi „tak” na galerii całej gry, łącznie z macierzą 7 stanów, a potem widzi nowy wygląd na swoim telefonie i laptopie.
- Bramka i CI zielone, strażnik kontrastu przechodzi bez wyjątków, smoke na produkcji zielony.
- Kolejna lista albo nowy kolor nie wrócą do starego wyglądu, bo pilnują tego `surfaces.ts`, `contrast.mjs` i reguła w `AGENTS.md`.
