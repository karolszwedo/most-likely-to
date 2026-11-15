---
date: 2026-11-15T09:30:35+01:00
researcher: Claude (Opus 5.5) z Karolem
git_commit: 47d0a4d5a1eb01f81eebf73459216e678a6e53ab
branch: no-recent-repeats
repository: most-likely-to
topic: "S-20: jak losowanie ma omijać pytania z wcześniejszych gier tego samego hosta"
tags:
  [
    research,
    no-recent-repeats,
    S-20,
    FR-015,
    open_next_round,
    open_question_list,
    draw_list_question,
    start_game,
    unplayed_candidates,
    rounds,
  ]
status: complete
last_updated: 2026-11-15
last_updated_by: Claude (Opus 5.5)
last_updated_note: "Trzy decyzje Karola z Open Questions (wszystkie gry, pominięte i usunięte z listy liczą się jako zagrane)"
---

# Research: S-20, bez powtórek z ostatnich gier hosta

**Date**: 2026-11-15T09:30:35+01:00
**Researcher**: Claude (Opus 5.5) z Karolem
**Git Commit**: 47d0a4d (gałąź od `origin/main`; roadmapa i `change.md` niescommitowane)
**Branch**: no-recent-repeats
**Repository**: most-likely-to

## Research Question

Gdzie i jak gra wybiera pytania, z czego da się wziąć historię pytań zagranych w grach tego samego hosta i co trzeba zmienić, żeby losowanie dawało najpierw pytania niezagrane u tego hosta, a po nich zagrane najdawniej (decyzja Karola 2026-11-15, `change.md` Notes; Open Roadmap Question 5 rozstrzygnięte w `context/foundation/roadmap.md`).

## Summary

- **Zmiana to wyłącznie kolejność, nie wykluczanie.** Przy decyzji „najdawniej grane najpierw” żaden kandydat nie wypada, więc liczniki zostają bez zmian: `private.question_count` czyta tylko listę i `extra_questions` (`supabase/migrations/20261107091322_game_length.sql:59-72`), `more_questions` liczy zbiór `distinct` (`:249-250`), `questionsToDraw` w Workerze liczy z rozmiaru puli (`src/lib/rounds/draw.ts:99-105`), a `open_question_list` bierze zawsze 15. Warunek: nowa kolejność nie może zgubić żadnego kandydata, a Worker dalej wysyła całą potasowaną pulę (dziś tak robi każdy z pięciu endpointów, patrz niżej).
- **Kolejność kandydatów ustala dziś Worker, bazę obchodzi tylko `place`.** Worker tasuje całą pulę (`shuffledPool`, `src/lib/rounds/draw.ts:58-69`), baza bierze pierwszy pasujący po `place` (decyzja D1 W-B, `context/archive/2026-10-15-full-game-evening/research.md:106`, `:144`). Nową kolejność najprościej nałożyć w bazie: każda funkcja i tak blokuje `public.rooms` po `p_room_id`, a `private.picked_candidates` już łączy `rooms` (`supabase/migrations/20261113162527_question_base_checks.sql:52-64`). Worker nie ma dostępu do historii: `private.rounds` nie ma grantów, `host_games` daje tylko liczbę pytań na grę (`20261110131123_host_game_history.sql:48-74`), a przy ruchach współhosta Worker nie ma sesji hosta.
- **Cztery miejsca wybierają pytanie z bazy wspólnej:** lista pytań gry na start (`open_question_list`, `20261113162527_question_base_checks.sql:322-330`), dolosowanie pytania (`draw_list_question`, `:386-393`), pytanie po końcu listy przy następnym pytaniu, pominięciu pytania i dobraniu pytań (`private.open_next_round` → `unplayed_candidates`, `20261107091322_game_length.sql:143-146`), oraz pierwsze pytanie gry bez listy, które dziś wybiera Worker sam (`src/pages/api/rooms/[id]/start.ts:34`, `drawQuestion`), a baza tylko sprawdza jedno id (`start_game(uuid, text, text)`, `20261113162527_question_base_checks.sql:188`).
- **Historia hosta już jest w bazie i nie trzeba nowych danych.** `public.rooms.host_id` to zawsze twórca gry (`create_room` z `auth.uid()`, `20261113162527_question_base_checks.sql:106`, `:159-161`; współhost to wiersz gościa, `20261027121442_co_host_role.sql:49-50`). `private.rounds` zostaje po końcu gry: `end_game`, „Nowa gra” i godzinny sweep tylko zamykają grę i czyszczą stan rundy (`drop_round_state`, `20261104095452_guest_question_proposals.sql:384-406`; `close_stale_games`, `:413-439`). Rundy znikają tylko z grą (`delete_game`, `20261110131123_host_game_history.sql:105-110`) albo z kontem hosta (kaskada, `20261007122858_room_lobby.sql:21`).
- **„Kiedy zagrane” bierze się z gry, nie z rundy.** `private.rounds` celowo nie ma czasu ani sekwencji (`20261014101922_first_live_round.sql:111`), a pgTAP pilnuje, żeby tabele `private` nie miały kolumn czasu (`supabase/tests/round_creator_view.test.sql:1140`, `:1174`). Do kolejności wystarczy `rooms.started_at` (ustawiane przez `start_game`, `20261113162527_question_base_checks.sql:269`), z `created_at` w zapasie, jak już robi `host_games` (`coalesce(started_at, created_at)`, `20261110131123_host_game_history.sql:67`).
- **Do decyzji Karola zostały trzy rzeczy:** czy liczą się wszystkie gry hosta, czy pominięte pytanie liczy się jako zagrane i czy liczą się pozycje usunięte z listy przed startem. Skasowana gra wypada z historii sama, bo rundy idą kaskadą (patrz Open Questions). Reszta to technika do planu.

## Detailed Findings

### Ścieżki losowania (aktualne wersje funkcji)

1. **Lista pytań gry (S-06), `open_question_list`**, `20261113162527_question_base_checks.sql:281-342`. Powstaje przy pierwszym „Przejrzyj pytania” hosta (`src/components/room/QuestionList.tsx:12-13`); Worker wysyła całą potasowaną pulę (`src/pages/api/rooms/[id]/question-list.ts:33`). Baza bierze pierwsze 15 różnych kandydatów po `min(place)` (`:322-330`) i zapisuje je jako pozycje 1–15 (`:336-338`); pozycje decydują o kolejności gry. **Miejsce zmiany:** `order by first_place` w podzapytaniu (`:325-329`).
2. **Dolosowanie pytania, `draw_list_question`**, `:348-406`. Worker wysyła całą pulę (`src/pages/api/rooms/[id]/question-draw.ts:34`); baza bierze pierwszego kandydata spoza listy `order by c.place limit 1` (`:386-393`). **Miejsce zmiany:** to `order by`.
3. **Pierwsze pytanie, `start_game`**, `:188-273`. Z listą gra pierwszą nieusuniętą pozycję (`:224-234`), więc dziedziczy kolejność z punktu 1. Bez listy Worker losuje jedno id (`start.ts:34`, `drawFrom` w `draw.ts:46-53`), a baza je tylko sprawdza (`:237`). **Miejsce zmiany:** potrzebni kandydaci w `start_game`, czyli nowa sygnatura (dziś `p_question_id text`).
4. **Po liście: `private.open_next_round`**, `20261107091322_game_length.sql:109-165`. Najpierw lista (`proposed desc, position`, `:132-140`), potem pierwszy z `private.unplayed_candidates` po `place` (`:143-146`). `unplayed_candidates` (`20261113162527_question_base_checks.sql:70-84`) to `picked_candidates` bez rund tej gry i bez wierszy jej listy. Wołają ją `next_round` (`20261027121442_co_host_role.sql:257`), `skip_round` (`:350`) i `more_questions` (`20261107091322_game_length.sql:259`). **Miejsce zmiany:** `order by c.place` (`:145`) albo kolumna rangi w `unplayed_candidates` (nowa kolumna wyniku wymaga `drop`, bo `create or replace` nie zmienia typu wyniku).
5. **Poza zakresem:** zatwierdzone propozycje pytań i własne pytania hosta nie mają `question_id` i idą przed resztą listy (`approve_proposal`, `20261104095452_guest_question_proposals.sql:246`; `add_own_question`, `20261024094002_question_list_review.sql:386`).

Worker wysyła całą potasowaną pulę w każdym z pięciu endpointów: `question-list.ts:33`, `question-draw.ts:34`, `next.ts:44`, `skip.ts:40`, `more.ts:47-53` (sprawdzone ścieżki; `start.ts:34` wysyła jedno id).

### Co znaczy „zagrane u hosta” (dane w `private.rounds`)

- Runda zostaje przy pominięciu pytania z `phase = 'skipped'` (`20261027121442_co_host_role.sql:336-338`) i przy grze przerwanej bez odsłony z `phase = 'voting'` (`drop_round_state` kasuje tylko urnę). `host_games` liczy wszystkie te rundy jako pytania gry (`20261110131123_host_game_history.sql:7-8`).
- Pozycja usunięta z listy przed startem nie dostaje rundy (`start_game` `not g.removed`, `20261113162527_question_base_checks.sql:228`; `open_next_round`, `20261107091322_game_length.sql:135`), ale wiersz listy z `question_id` zostaje przy grze (`20261024094002_question_list_review.sql:17-18`).
- Przeredagowane pytanie z bazy (`edit_list_question`) gra rundę z `question_id = null` i `list_position` (`start_game` `:226`, `open_next_round` `:132`); id z bazy zostaje tylko na wierszu listy (`20261024094002_question_list_review.sql:11-12`, `:76-81`). Historia z samego `rounds.question_id` by je pominęła; złączenie `list_position` → `game_questions` je odzyskuje.
- Konto testu dymnego jest wyłączone ze statystyk (`private.stats_excluded_hosts`, `20261026074427_question_play_data.sql:94-109`), a jego zamknięte gry kasuje każdy przebieg smoke (`scripts/smoke.mjs:908-918`, `:928-956`). S-20 nie potrzebuje dla niego wyjątku: historia jest per host.

### Kolejność „najdawniej zagrane”

- Dostępne: `rooms.started_at` (raz, w `start_game`), `rooms.created_at`, `rounds.number` (unikalny w grze, liczy też pominięcia). Brak `ended_at` (`context/changes/host-game-history/plan.md:21`). Host ma najwyżej jedną otwartą grę (`20261014101922_first_live_round.sql:47`), więc gry hosta nie nachodzą na siebie w czasie.
- Pytanie zagrane w kilku grach hosta liczy się według ostatniej z nich (najpóźniejszy `started_at`); niezagrane mają najwyższy priorytet. W obrębie jednej grupy zostaje kolejność od Workera (`place`), więc losowość się nie zmienia.

### Indeksy i skala

- Rundy: unikaty `(room_id, number)`, `(room_id, question_id)` (`20261014101922_first_live_round.sql:124-125`) i `(room_id, list_position)` (`20261024094002_question_list_review.sql:79`) prowadzą przez `room_id`.
- Gry hosta: tylko częściowy unikat `(host_id) where status in ('lobby','playing')` (`20261014101922_first_live_round.sql:47`); `host_games` filtruje po `host_id` bez indeksu. Przy skali do około stu użytkowników (PRD) to nie problem; plan może dodać indeks.

## Code References

- `src/lib/rounds/draw.ts:46-69` – `drawFrom`, `shuffledPool` (Fisher-Yates), komentarz o „pierwszym niezagranym” (`:56`)
- `src/lib/rounds/draw.ts:99-105` – `questionsToDraw`
- `src/pages/api/rooms/[id]/start.ts:34` – Worker losuje jedno id dla gry bez listy
- `supabase/migrations/20261113162527_question_base_checks.sql:52-64` – `private.picked_candidates`
- `supabase/migrations/20261113162527_question_base_checks.sql:70-84` – `private.unplayed_candidates`
- `supabase/migrations/20261113162527_question_base_checks.sql:188-273` – `start_game` (wersja aktualna)
- `supabase/migrations/20261113162527_question_base_checks.sql:281-342` – `open_question_list`
- `supabase/migrations/20261113162527_question_base_checks.sql:348-406` – `draw_list_question`
- `supabase/migrations/20261107091322_game_length.sql:109-165` – `private.open_next_round`
- `supabase/migrations/20261107091322_game_length.sql:180-268` – `more_questions`
- `supabase/migrations/20261110131123_host_game_history.sql:48-114` – `host_games`, `delete_game`
- `supabase/migrations/20261104095452_guest_question_proposals.sql:384-439` – `drop_round_state`, `close_stale_games`

## Architecture Insights

- Wzorzec od S-02/S-03: Worker tasuje, baza filtruje i wybiera pierwszy pasujący (`context/archive/2026-10-13-first-live-round/research.md:356-358`; D1 W-B). S-17 zachowało ten podział: „Baza filtruje to, co Worker wysyła” (`context/changes/question-pool-in-db/plan.md:53`). S-20 dokłada w bazie drugi klucz sortowania (ranga z historii hosta) przed `place`, bez zmiany podziału ról.
- Wspólny pomocnik w stylu `picked_candidates` (np. ranga z historii hosta dla danej gry) użyty w `open_question_list`, `draw_list_question`, `unplayed_candidates`/`open_next_round` i nowym `start_game` trzyma jedną definicję, tak jak S-19 trzyma jedną definicję w `unplayed_candidates` (`context/changes/game-length/plan.md:93`).
- Zmiany ciał funkcji (`create or replace`, te same sygnatury) przechodzą bez zmian w Workerze. `start_game` z kandydatami to zmiana sygnatury: wzorzec z S-07 to parametr z wartością domyślną (`context/deployment/deploy-plan.md:60`), a pgTAP `versions_of` wymaga dokładnie jednej wersji funkcji, więc starą trzeba usunąć. Kolejność wdrożenia: baza, potem kod (`deploy-plan.md:52-53`, `:80`).

## Historical Context (from prior changes)

- `context/archive/2026-10-15-full-game-evening/plan.md:49` – „Bez pytań z ostatnich wieczorów hosta: S-12”; kontrakt `open_next_round` `:205`. Wspiera: teraz S-20.
- `context/archive/2026-10-24-question-list-review/plan.md:41-42`, `:84-85`, `:90` – baza wybiera z listy, Worker podaje kandydatów; zmiana losowania S-12 poza zakresem; lista bierze pierwsze 15 w podanej kolejności; dolosowanie bierze pierwszego spoza listy. Wspiera.
- `context/changes/game-length/plan.md:33`, `:93`, `:106` – `questionsToDraw` musi równać się liczeniu bazy; jedna definicja w `unplayed_candidates`; `more_questions` dodaje `least(5, …)`. Wspiera (czysta zmiana kolejności tego nie rusza).
- `context/changes/question-pool-in-db/plan.md:13`, `:50-53`, `:70` – bez przenoszenia losowania do bazy, bez zmian sygnatur, filtr zamiast odmowy. Częściowo: S-20 zmieni sygnaturę `start_game` (pierwsze pytanie gry bez listy), o ile plan tak zdecyduje.
- `context/changes/host-game-history/plan.md:57` – skasowana gra wypada z ostatnich gier hosta. Wspiera (kaskada rund).
- Rozjazd w dokumentach: PRD wciąż ma Open Question 5 jako otwarte (`context/foundation/prd.md:220`), a `:167` i plan S-06 (`:42`) mówią „ekipy”, choć FR-015 (`:126`) mówi o hoście. Do poprawki w fazie dokumentów.

## Related Research

- `context/archive/2026-10-15-full-game-evening/research.md` – D1, kto losuje
- `context/changes/question-pool-in-db/research.md` – S-17, pula w bazie
- `context/changes/game-length/research.md` – liczniki i dobranie pytań

## Testy, które zmiana dotknie

- **Jednostkowe:** `tests/unit/draw.test.ts` bez zmian, jeśli kolejność zmienia tylko baza. `tests/unit/room-rpc-gate.test.ts:43-130` (`SQL_SIGNATURES`, ręczna wyrocznia z kotwicą migracji na funkcję) zmienia się dla każdej nowej wersji funkcji, a sygnatura `start_game` także w przypadkach akcji (`:332-405`).
- **Bazodanowe (`tests/db`), główne ryzyko:** pliki z jednym hostem i wieloma grami na tych samych id po S-20 dostaną inną kolejność w późniejszych grach. Wskazane przez research: `proposals.test.ts:78-111` (lista gry 2 oczekiwana jako `na-co-dzien-001..015`, a gra 1 zagrała 001 i 002), też `:752`, `:772`, `:795`; `game-length.test.ts:434-500`, `:516-543`, `:577-641`; zależne od rozstrzygania remisów: `game-summary.test.ts:251-262`, `question-base.test.ts:233-245`. Wspólna pomoc `tests/db/support/rounds.ts:220-227` („pierwszy jeszcze niezagrany”). Nie sprawdzono każdej asercji późniejszych gier pod konkretną regułę.
- **pgTAP:** `supabase/tests/round_creator_view.test.sql` (`plan(484)` `:82`, `function_facts`, `versions_of`, `private_versions_of`); każda gra ma tam świeżego hosta (`open_room` `:162-173`), więc scenariusz S-20 potrzebuje dwóch gier jednego hosta.
- **E2E:** brak asercji na id pytań; `game.spec.ts:148` sprawdza tylko brak powtórek w jednej grze.
- **Zasady:** wyrocznia z decyzji Karola, pisana ręcznie; limit zakładania kont 30 na 5 min, dziś zajęte 25, więc najwyżej 5 nowych hostów; jeden host na nowy plik; próba alarmu w tymczasowym commicie (`context/foundation/test-plan.md:142`, `:145`, `:187`, `:205-208`, `:213-217`).

## Open Questions

Decyzje produktowe, rozstrzygnięte przez Karola 2026-11-15 (wszystkie trzy zgodnie z rekomendacją):

1. **Które gry hosta się liczą:** wszystkie gry hosta, bez limitu N ostatnich (przy „najdawniej grane najpierw” limit nic nie daje).
2. **Pominięte pytanie:** liczy się jako zagrane (ekipa je widziała); tak samo runda przerwana bez odsłony, bo obie zostają w `private.rounds`.
3. **Pozycje usunięte z listy przed startem:** liczą się jako zagrane (host je zna), czyli historia to rundy gry hosta i wiersze jej listy pytań z `question_id`, także przeredagowane.

Skasowana gra (S-13) wypada z historii razem ze swoimi rundami (kaskada, `20261110131123_host_game_history.sql:107`); research nie widzi powodu, by to zmieniać, bo kasowanie ma zostawić tylko anonimowe dane o pytaniach.

Techniczne, do planu: kandydaci w `start_game` (nowa sygnatura czy inny sposób), jeden pomocnik rangi czy osobne `order by`, rozstrzyganie remisów (`started_at`, potem `place`), uwzględnienie przeredagowanych pytań przez `list_position`, indeks na `rooms(host_id)`, przestawienie testów `tests/db` z jednym hostem na wiele gier, nowe pojęcie w słowniku (np. „pytania zagrane u hosta”).
