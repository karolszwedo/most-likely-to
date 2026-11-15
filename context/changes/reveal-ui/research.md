---
date: 2026-11-15T14:53:12+01:00
researcher: Claude (Opus 5.5) z Karolem
git_commit: 122f87e42e33455897d9183d1bdb9657f11096ca
branch: reveal-ui
repository: most-likely-to
topic: "Audyt /10x-ui ekranu odsłony wyniku (RoundReveal): zarzuty, macierz 7 stanów, granice dla wariantów"
tags: [research, reveal-ui, 10x-ui, RoundReveal, GameSummary, chart, room-states, room-window, FR-009]
status: complete
last_updated: 2026-11-15
last_updated_by: Claude (Opus 5.5)
---

# Research: audyt /10x-ui ekranu odsłony wyniku

**Date**: 2026-11-15T14:53:12+01:00
**Researcher**: Claude (Opus 5.5) z Karolem
**Git Commit**: 122f87e42e33455897d9183d1bdb9657f11096ca
**Branch**: reveal-ui
**Repository**: most-likely-to

## Research Question

Audyt `/10x-ui` jednego widoku, odsłony wyniku rundy (`src/components/room/RoundReveal.tsx`), w dwóch kierunkach (źródło → widoki, widok → źródło): 3–5 zarzutów z plikiem:linią i wpływem na gracza, macierz 7 stanów (co już pokazują `/dev/room-states` i `/dev/room-window`), a do tego granice, których warianty wyglądu nie mogą przekroczyć (wcześniejsze decyzje Karola, PRD, testy).

## Summary

- **Kontrakt już stoi.** Odsłona używa tokenów z `src/styles/global.css` i komponentów z `src/components/ui`. Skan literałów z `/10x-ui` na 10 plikach odsłony i jej otoczenia (`RoundReveal`, `chart-colors`, `QuestionReaction`, `RoundQuestion`, `RoundCounter`, `HostActions`, `RoundSkipped`, `RoomScreen`, `EmoteBar`, `EmoteBubbles`) dał 0 trafień, a `scripts/ui-literals.mjs:8-19` pilnuje całego `src/components/room/` w `npm run lint`. Wariant kontraktu: istniejący system projektowy. Faza „wartości tokenów” w planie będzie mała albo żadna.
- **Problem leży w hierarchii, nie w kolorach.** Najważniejsza informacja rundy, czyli na kogo padło, jest zwykłym wierszem tabeli z pogrubieniem. Największym napisem na ekranie jest pytanie, które wszyscy już przeczytali (Z1).
- **Brakuje trzech rzeczy:** stanu pustego, gdy nikt nie wskazał osoby (Z2); momentu odsłony, bo wynik pojawia się jak każde odświeżenie stanu (Z3); wspólnego komponentu wykresu, bo koło odsłony i koło podsumowania to dwie kopie (Z4). Z5 (link dla graczy u prowadzącego zajmuje górę ekranu) to decyzja Karola z S-09, więc trafia do galerii jako opcja, a nie jako poprawka.
- **Granice dla wariantów** są twarde i liczne: liczby zawsze (D3), wszyscy gracze w tabeli z zerami na dole, „Koło” domyślnie, kolor gracza zamiast „koloru zwycięzcy”, paski w „Paskach” w kolorze `primary` (wybór Karola), bez rankingu, podium i timera, a e2e czyta tabelę w regionie „Wynik” (sekcja „Granice dla wariantów”).
- **Macierz 7 stanów:** brakuje podglądów dla stanu pustego u prowadzącego, dla 0 kart bez wstrzymań, dla `refreshFailed` na odsłonie oraz dla stanów zajętości, błędu, „Pasków” i pustego wyniku w `/dev/room-window`. Hover i focus-visible nigdzie nie są wymuszone (sekcja „Macierz 7 stanów”).

## Charges

Każdy zarzut ma plik:linię, kategorię i jedno zdanie o wpływie na gracza. Zrzuty z 15.11: `/dev/room-window?state=reveal-host|reveal-guest|reveal-host-20`. Laptop to okno 1536×750 w skali 1, telefon to ramka 390 px. Pliki leżą w scratchpadzie sesji i nie są w repo.

### Z1: na kogo padło, trzeba wyczytać z tabeli (przypadkowa architektura: hierarchia)

- **Gdzie:**
  - `RoundReveal.tsx:118-119`: nagłówek „Wynik” ma `text-sm font-medium`, mniejszy od pytania;
  - `RoundQuestion.tsx:12`: pytanie `text-2xl font-semibold`, największy napis na ekranie;
  - `RoundReveal.tsx:160`, `:187`, `:192`: osobę z największą liczbą głosów wyróżnia tylko `font-semibold` w wierszu;
  - `:170-172`: w „Paskach” jej pasek ma `bg-primary/35`, a pozostałe `bg-primary/20`;
  - `:54-69`: koło jest `aria-hidden`, bez podpisów, więc kawałek łączy się z nickiem wyłącznie przez kropkę w tabeli (`:182-185`).
- **Dowód:**
  - Laptop, prowadzący, 5 graczy: pierwszy nick stoi w tabeli na wysokości ok. 377 px, zwykłym rozmiarem tekstu.
  - Telefon, gość: nick z największą liczbą głosów stoi ok. 566 px od góry ekranu 844 px, pod kołem 180 px.
  - Remis (Ola 2, Kasia 2) to dwa pogrubione wiersze. Nigdzie nie pada słowo „remis”.
- **Wpływ:** w kulminacji rundy cały pokój szuka imienia w tabeli. Odpowiedzi na pytanie „kto z nas…” nie widać na pierwszy rzut oka, a na telefonie stoi dopiero pod kołem.

### Z2: nikt nie wskazał osoby, a ekran pokazuje tabelę przygaszonych zer (stan pusty)

- **Gdzie:**
  - `src/lib/rooms/chart.ts:16-20`: przy 0 głosach brak przełącznika, widok „Paski”;
  - `RoundReveal.tsx:160`: `top` = 0, więc nikt nie jest wyróżniony;
  - `:163`: każdy wiersz `text-muted-foreground`;
  - `:165`: brak pasków, bo `percent` = 0;
  - `:201`: zostaje sama linijka „Wstrzymało się: N”.
- **Czy to się zdarza:** tak, na dwa sposoby.
  - Wszyscy głosujący się wstrzymują: głos bez celu to wstrzymanie, a ostatni głos sam odsłania wynik (`supabase/migrations/20261020205751_round_number_required.sql:203`, `:215-221`).
  - Prowadzący odsłania wynik bez progu, także przy 0 kartach i 0 wstrzymaniach (`20261027121442_co_host_role.sql:360-415`, D3).
  - `finish_round` zapisuje 0 dla każdego gracza (`20261026074427_question_play_data.sql:184-188`).
  - Testy jednostkowe potwierdzają ten wynik: `tests/unit/chart.test.ts:73`, `:140`, `tests/unit/results.test.ts:60`.
- **Podglądy:** jest tylko 44 `reveal-all-abstained` (`src/pages/dev/room-states.astro:1613`), dla gościa. Brakuje wersji prowadzącego z paskiem przycisków i wersji 0 kart bez wstrzymań.
- **Wpływ:** pokój widzi szarą tabelę samych zer, co wygląda jak zepsuty ekran. Brakuje jednego zdania („Nikt nikogo nie wskazał”), które zamieniłoby ten moment w żart.

### Z3: wynik pojawia się jak każde odświeżenie, bez momentu odsłony (przypadkowa architektura)

- **Gdzie:**
  - `RoomScreen.tsx:452-453`: `RoundReveal` z `key={view.round.number}`, więc głosowanie podmienia się na odsłonę w jednej klatce;
  - `src/styles/global.css:2`: `tw-animate-css` jest zaimportowany, ale w `src/` nie używa go żaden komponent;
  - `global.css:165-186`: jedyny keyframe to `emote-rise`;
  - `motion-safe:` występuje w jednym pliku, `EmoteBubbles.tsx:19`, `:63`.
- **Dowód:** zero animacji i przejść na ścieżce głosowanie → odsłona w `RoomScreen.tsx`. Fokus przechodzi na tytuł (`RoomScreen.tsx:232-236`, `focus.ts:23-31`), a czytnik ekranu słyszy „Wynik odsłonięty.” (`src/lib/rooms/announce.ts:24`).
- **Wpływ:** odsłona, czyli moment, na który pokój czeka całą rundę, wygląda tak samo jak doczytanie stanu. Nie ma chwili, w której wszyscy razem „widzą” odpowiedź.
- **Ograniczenia dla poprawki:**
  - dane nie mogą przyjść później: wymóg 2 s z `prd.md:153`, a komunikat czytnika i fokus zostają;
  - ruch tylko pod `motion-safe`, jak emotki (`context/archive/2026-10-26-room-emotes/plan.md:35`);
  - żadnego odliczania, bo to byłby timer (`AGENTS.md:8`);
  - `RoundReveal` montuje się też po odświeżeniu strony i przy wejściu spóźnionego gracza (S-04, S-08), więc plan musi rozstrzygnąć, czy animacja gra tylko przy zmianie fazy w tej karcie.

### Z4: dwa koła i ręczne prymitywy zamiast wspólnych komponentów (brakujący współdzielony komponent)

- **Gdzie:**
  - koło odsłony `ResultPie` (`RoundReveal.tsx:54-69`; `stroke-background stroke-2`, `size-48 sm:size-56`) i koło podsumowania `SummaryPie` (`GameSummary.tsx:118-143`; `stroke-card stroke-1`, `size-56 lg:size-72`): ta sama geometria (`slicePath(slice, 50, 48)`), ten sam kawałek-koło przy jednym głosującym, te same `SLICE_FILLS`;
  - kropka gracza: `RoundReveal.tsx:182-185` (`size-2.5`) i `GameSummary.tsx:53-56` (`size-3`);
  - przełącznik „Koło / Paski” to `div role="group"` z `Button aria-pressed` (`RoundReveal.tsx:122`), a tabela to ręczny `<table>` (`:147`);
  - w `src/components/ui` nie ma `table` ani `toggle-group`.
- **Dowód:**
  - Odroczone świadomie w `room-wide-layout`: „nie zmieniają układu, a ich wymiana to osobne ryzyko (e2e szuka ról `radio`, `table`, `alert`)” (`context/archive/2026-10-15-room-wide-layout/research.md:95-96`).
  - `toggle-group` nie wymaga nowej paczki: `radix-ui` jest już zależnością (`package.json:37`) i eksportuje `ToggleGroup` (`node_modules/radix-ui/dist/index.d.ts:63-64`). Komponenty `checkbox`, `label` i `separator` importują z niej już dziś (`src/components/ui/checkbox.tsx:4`).
- **Wpływ:** dla gracza mały: koło na odsłonie i na końcu wieczoru różni się obrysem i rozmiarem. Dla wyglądu duży: każdą zmianę wykresu, którą Karol wybierze, trzeba zrobić dwa razy, a druga kopia się rozjedzie.

### Z5: u prowadzącego górę ekranu odsłony zajmuje „Link dla graczy” (przypadkowa architektura; decyzja Karola, tylko do galerii)

- **Gdzie:** `RoomScreen.tsx:523-526`: `PlayerLink` nad treścią każdego ekranu gry prowadzącego, odsłony też.
- **Dowód:** na laptopie (1536×750, prowadzący, 5 graczy) pole z linkiem zajmuje wysokość ok. 85–150 px, pytanie zaczyna się ok. 220 px, a tabela ok. 320 px. „Oceń pytanie” stoi na 657 px, a jego kciuki chowają się pod paskiem przycisków, dopóki nie przewiniesz.
- **Historia:** miejsce linku nad pytaniem to wariant D wybrany przez Karola w S-09 na zrzutach 2026-11-02 (`context/changes/remove-player-new-link/plan.md:414`).
- **Wpływ:** na ekranie prowadzącego, który na laptopie widzi cały pokój, wynik zaczyna się w połowie wysokości okna.
- **Status:** do decyzji Karola na zrzutach (np. link zwinięty w jedną linię na odsłonie). Bez jego wyboru: **deferred**, zostaje jak dziś.

## Macierz 7 stanów (stan dzisiejszy)

| Stan          | Gdzie widać dziś                                                                                                                                                               | Czego brakuje                                                                                                               |
| ------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------- |
| default       | `room-states` 41–45f (`:1576-1705`), `room-window` `reveal-*` (`:557-723`)                                                                                                     | „Paski” tylko w 45c (`:1659`), w `room-window` wcale                                                                        |
| hover         | 42, 45f, 86, 174 opisane do ręcznego najechania (`room-states.astro:743-746`)                                                                                                  | stan wymuszony do zrzutu                                                                                                    |
| focus-visible | jak hover (Tab ręcznie); fokus po ruchu prowadzącego na tytule (`focus.ts:23-31`)                                                                                              | stan wymuszony do zrzutu                                                                                                    |
| disabled      | zajętość przycisków prowadzącego 54 (`:1909`), 177 (`:2169`): `aria-disabled` + `opacity-50` (`HostActions.tsx:193-195`); kciuki w trakcie wysyłania 89 (`:1742`)              | przełącznik nie ma stanu wyłączonego (nie potrzebuje: działa lokalnie)                                                      |
| error         | 55 `round_over` w `destructive` (`:1920`, `HostActions.tsx:233`), 62/63 `questions_ran_out` w szarym (`:1942`, `:1960`), 90 kciuk (`:1753`, `FieldError`), 93 emotka (`:1796`) | `refreshFailed` na odsłonie (podgląd tylko w głosowaniu i poczekalni), odmowa „Zakończ grę” / „Jeszcze N pytań”             |
| empty         | 44 wszyscy się wstrzymali, tylko gość (`:1613`)                                                                                                                                | prowadzący z paskiem; 0 kart bez wstrzymań; prawdziwy komunikat (Z2)                                                        |
| loading       | spinner w przycisku: 54, 177 (`HostActions.tsx:200-204`), 89 (`QuestionReaction.tsx:98-99`)                                                                                    | sam wynik nie ma stanu ładowania: przychodzi razem ze stanem pokoju, więc N/A dla tabeli i koła (do potwierdzenia w planie) |

`/dev/room-window` nie przekazuje dziś `resultView`, `reaction`, `refreshFailed` ani `liveBroken` (`room-window.astro:240-255`, `:890-900`). Prowadzący ma tam tylko stan `confirming` (`:593`).

## Granice dla wariantów (czego wygląd nie może zgubić)

**Decyzje Karola i PRD**

- **D3, liczby zawsze**, także po jednym głosie; wszyscy gracze w tabeli, najwięcej głosów na górze, remis w kolejności miejsc, zera przygaszone na dole, linijka „Wstrzymało się: N”: `context/archive/2026-10-13-first-live-round/research.md:276-282`, `plan.md:38`, `:102`, `plan-brief.md:34` („Kto dostał zero, to często najlepszy temat do rozmowy”); w PRD odsłona to „liczba głosów na osobę, bez informacji kto na kogo” (`prd.md:74`, `:166`).
- **„Koło” / „Paski”:** „Koło” domyślne przy 1–20 osobach z głosami, poza tym same „Paski” bez przełącznika (`chart.ts:4-7`, `:14-20`). Wybór zmienia tylko ekran tego gracza (`RoomScreen.tsx:193-195`). Tabela to dostępne dane w obu widokach (`RoundReveal.tsx:51`). Układ, który zgubi przełącznik, powtórzone pytanie albo odsłonę w dwóch krokach, odpada (`room-wide-layout/research.md:209`).
- **Kolor gracza:**
  - każdy ma jeden kolor na całą grę, w kole i jako kropkę w każdym wierszu (`context/archive/2026-10-25-player-colors/plan.md:23`);
  - słownik zakazuje „koloru zwycięzcy” i koloru z miejsca w wyniku (`context/domain/glossary.md:48`), więc wyróżnienie osoby z największą liczbą głosów może użyć tylko jej własnego koloru;
  - w „Paskach” pasek zostaje jednym kolorem `primary`, dochodzi tylko kropka; paski w kolorach graczy były poza zakresem (`player-colors/plan-brief.md:32`, `:48`). Zmiana tego to nowa decyzja Karola.
- **Układ od 1024 px** (`room-wide-layout`, mieszanka „M”, odsłona jak w C):
  - kolumna `lg:max-w-3xl` (`room-frame.ts:20`);
  - koło obok tabeli;
  - pasek prowadzącego przyklejony do dołu okna;
  - telefon bez zmian (`room-wide-layout/plan-brief.md:16-23`).
- **Kciuki** pod wynikiem, nad paskiem prowadzącego, wariant Karola (`context/archive/2026-10-26-question-reactions-play-data/plan.md:436`). **Emotki** żyją poza `RoundReveal` (`RoomScreen.tsx:552-554`).
- **„Pytanie N z T”** nad tytułem (2A), na ostatnim pytaniu „Zakończ grę” główne, a „Jeszcze 5 pytań” obok (3B). Gość czyta wtedy zdanie G2 (`context/changes/game-length/change.md:28-30`).
- **PRD Non-Goals:**
  - nigdy „kto na kogo” (`prd.md:201`, `AGENTS.md:7`);
  - bez punktów i rankingu; podium z miejscami 1–2–3 albo „tabela wyników” czytałyby się jak ranking (`prd.md:202`; słownik odradza „ranking” i „tabela wyników”, `glossary.md:22`);
  - bez timera (`AGENTS.md:8`).

**Testy, które pilnują znaczników**

- `tests/e2e/support/round.ts:47-49`: tabela (`role="table"`) w regionie o nazwie z „Wynik” (sekcja z nagłówkiem), jeden taki region (`AGENTS.md:52`).
- `round.ts:61-71` (`expectReveal`): wierszy = graczy + 1 (jeden wiersz nagłówka, bez stopki); ostatnia komórka wiersza to sama liczba; tekst „Wstrzymało się: N” dokładnie. Używają go `round.spec.ts:78`, `cohost.spec.ts:130`, `question-list.spec.ts:224`, `latecomer.spec.ts:149`, `remove-player.spec.ts:88`, `:95`. Sama widoczność tabeli to sygnał „wynik przyszedł” w `game.spec.ts`, `proposals.spec.ts`, `rejoin.spec.ts`, `game-length.spec.ts`.
- Fokus po głosie, który odsłania wynik, ląduje na tytule h1 (`round.spec.ts:84`, `remove-player.spec.ts:96`). Żaden nagłówek nie może więc stać przed pytaniem w DOM (`RoomScreen.tsx:217-218`).
- `game.spec.ts:102-113`: przy 1024 px szerokości i 400 px wysokości odsłona musi być wyższa niż okno, a „Następne pytanie” cały w oknie.
- Kciuki „Dobre pytanie” / „Słabe pytanie” z `aria-pressed` (`round.ts:82-84`, `game.spec.ts:93-97`).
- **Niepilnowane przez e2e:** przyciski „Koło” / „Paski”, nagłówki „Gracz” / „Głosy”, plakietka „ty” w tabeli, wygląd wierszy i kropka (`player-color.spec.ts` czyta `data-color` tylko z listy „Gracze”).
- **Testów zrzutów brak:** w repo nie ma `toHaveScreenshot`; zrzuty w CI wykluczono celowo (`context/foundation/test-plan.md:440`). Bramka wizualna to więc podglądy `/dev/room-states` i `/dev/room-window` plus zrzuty dla Karola.
- Testy jednostkowe `tests/unit/chart.test.ts` i `results.test.ts` pilnują progów widoków, kolejności i kątów. Wygląd ich nie dotyka, dopóki logika `chart.ts` zostaje.

## Code References

- `src/components/room/RoundReveal.tsx:54-69`: koło odsłony (`ResultPie`)
- `src/components/room/RoundReveal.tsx:96-101`: wiersze, `top`, kawałki, kolory, wybór widoku
- `src/components/room/RoundReveal.tsx:117-140`: nagłówek „Wynik” i przełącznik
- `src/components/room/RoundReveal.tsx:145-197`: tabela, paski, kropka, „ty”
- `src/components/room/RoundReveal.tsx:200-205`: „Wstrzymało się” i linijka `refreshFailed`
- `src/components/room/RoundReveal.tsx:208-226`: kciuki i pasek prowadzącego
- `src/components/room/GameSummary.tsx:118-143`: koło podsumowania (`SummaryPie`)
- `src/components/room/RoomScreen.tsx:452-469`: montowanie odsłony; `:523-526` link dla graczy
- `src/lib/rooms/chart.ts:16-20`: `resultViews`
- `src/styles/global.css:2`, `:58-110`, `:112-163`, `:165-186`: import animacji, wartości `.dark`, `@theme inline`, `emote-rise`
- `src/components/room/room-frame.ts:20`: kolumna odsłony
- `tests/e2e/support/round.ts:47-71`: wyrocznia odsłony w e2e

## Architecture Insights

- **Tokeny:**
  - `.dark` ma neutralne `primary` (`oklch(0.7058 0 0)`) i resztę ról bez nasycenia;
  - jedynym kolorem w aplikacji są kolory graczy `--chart-1…20` (`global.css:58-110`). Na odsłonie to zaleta: emocję może nieść kolor osoby, nie akcent aplikacji;
  - typografia nie ma tokenów: ekrany biorą domyślną skalę Tailwinda (`text-2xl` tytułu, `text-4xl lg:text-5xl` w `GameSummary.tsx:109`). Plan nie musi ich wprowadzać, bo jeden widok to za mało na skalę.
- **Komponenty:** `src/components/ui` ma 13 komponentów (alert, badge, button, card, checkbox, field, input, input-group, label, LibBadge.astro, separator, spinner, textarea). Brak `table`, `toggle-group`, `progress`. Dodanie ich przez `npx shadcn@latest add` nie wymaga nowej paczki npm, bo `radix-ui` już jest (Z4).
- **Ruch:** jedyny wzór w repo to emotki: klasa animacji z `@theme` w `global.css` i `motion-safe:` w komponencie. Nowa animacja odsłony powinna iść tą samą drogą (token `--animate-*` w `@theme`, użycie pod `motion-safe:`).

## Historical Context (from prior changes)

- `context/archive/2026-10-13-first-live-round/` (S-02): D3, kolejność, zera, „Wstrzymało się”, przełącznik i pytanie powtórzone na odsłonie, zaakceptowane przez Karola na zrzutach (`plan.md:835`, commit `b5a753e`).
- `context/archive/2026-10-15-room-wide-layout/` (poprzedni `/10x-ui`): galeria najwyżej 4 wariantów z prawdziwymi komponentami, Karol wybrał mieszankę „M”; `toggle-group` i `table` odroczone (`research.md:95-96`).
- `context/archive/2026-10-25-player-colors/` i `context/changes/player-color-choice/` (S-18): kolor gracza zamiast koloru z miejsca, paleta „Stonowana”, paski zostają w `primary`.
- `context/archive/2026-10-26-question-reactions-play-data/` (S-11): kciuki pod wynikiem.
- `context/archive/2026-10-26-room-emotes/`, `context/changes/emote-visibility/`: emotki poza odsłoną, ruch tylko pod `motion-safe`.
- `context/archive/2026-10-25-game-summary/` (S-15): koło podsumowania skopiowane z odsłony, plakietka „ty” „jak w odsłonie” (`plan.md:214`).
- Nie znaleziono osobnej decyzji o pogrubieniu najwyższego wiersza, o plakietce „ty” na odsłonie ani o animacji odsłony.

## Related Research

- `context/archive/2026-10-15-room-wide-layout/research.md`: zarzuty Z1–Z5 szerokiego układu (odsłona: Z2, Z3)
- `context/archive/2026-10-04-ui-signin-contract/`: pierwszy kontrakt UI i wybór palety

## Open Questions

Decyzje Karola na zrzutach, przed planem (galeria 3–4 wariantów jak w `room-wide-layout`):

1. **Wariant kulminacji (Z1).** Na przykład: (A) „Reflektor”, czyli duży nick osoby z największą liczbą głosów w jej kolorze nad wykresem, z liczbą głosów i słowem „remis” przy remisie, a reszta jak dziś; (B) wyróżniony pierwszy wiersz (karta z kolorem gracza) w tabeli; (C) duże „Paski” jako główny widok. Wariant C dotyka decyzji „paski w `primary`”. Bez podium i miejsc 1–2–3.
2. **Moment odsłony (Z3):** tak/nie. Jeśli tak, to krótkie wejście wyniku (pojawienie się nicku, rośnięcie pasków lub koła) tylko przy zmianie fazy, bez opóźnienia danych. Do pokazania na żywym podglądzie, bo zrzut nie pokaże ruchu.
3. **Zdanie stanu pustego (Z2):** treść, np. „Nikt nikogo nie wskazał.” albo „Wszyscy się wstrzymali.” (przy 0 kartach i 0 wstrzymaniach to drugie nie pasuje).
4. **Link dla graczy na odsłonie (Z5):** zostaje jak dziś czy zwinięty na odsłonie.

Technika (rozstrzyga sesja, zapis w planie):

- Wspólny komponent koła dla odsłony i podsumowania (Z4).
- `table` z shadcn: zostaje natywny `<table>`, więc role w e2e się nie zmieniają.
- `toggle-group` z shadcn tylko, jeśli nie zmienia ról, których nic dziś nie pilnuje. Do sprawdzenia w planie, czy Radix `ToggleGroup type="single"` daje `role="radio"`.
- Podglądy brakujących stanów w `/dev/room-states` i `/dev/room-window` (macierz wyżej).
