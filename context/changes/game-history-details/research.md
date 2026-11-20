---
date: 2026-11-20T18:40:00+01:00
researcher: Claude (Opus 5.5) z Karolem
git_commit: 79ee141
branch: game-history-details
repository: most-likely-to
topic: "S-26 game-history-details: co baza trzyma po grze i jak pokazać hostowi historię gry (FR-030)"
tags: [research, host-game-history, game-summary, round-results, game-questions, anonymity]
status: complete
last_updated: 2026-11-20
last_updated_by: Claude (Opus 5.5)
---

# Research: historia gry w panelu hosta (S-26, FR-030)

**Date**: 2026-11-20 ok. 18:40 (Europe/Warsaw)
**Researcher**: Claude (Opus 5.5), trzy wątki tylko do odczytu (baza, warstwa aplikacji, wcześniejsze decyzje) + własne sprawdzenie kluczowych miejsc SQL
**Git Commit**: 79ee141
**Branch**: game-history-details
**Repository**: most-likely-to

## Research Question

Wariant B z decyzji Karola 2026-11-20 (`context/foundation/prd.md`, FR-030; `context/foundation/roadmap.md`, S-26): host na liście „Twoje gry” (`/gry`) otwiera zakończoną grę i widzi podsumowanie wieczoru jak na ekranie końca gry, a pod nim pytania w kolejności, w jakiej padły, z wynikiem każdej odsłony (ile głosów dostał każdy nick); pominięte i przerwane bez odsłony oznaczone. Tylko host, nic nowego nie zapisujemy. Pytania: (1) czy baza trzyma wszystko, czego to wymaga, i jak to odczytać; (2) co z pytaniami dopisanymi w grze i z graczem usuniętym z pokoju; (3) które kawałki aplikacji i testów da się użyć ponownie; (4) jakie decyzje i zasady z wcześniejszych zmian tego dotyczą.

## Summary

- **Dane są, nowego zapisu nie trzeba.** Po zamknięciu gry zostają `public.rooms`, `public.players`, `private.rounds`, `private.round_results` i `private.game_questions`, aż host skasuje grę (`context/archive/2026-11-10-host-game-history/research.md:91-93`; `end_game` zmienia tylko status i woła `drop_round_state`, `supabase/migrations/20261027121442_co_host_role.sql:462-463`). Kolejność pytań to `rounds.number` (bez dziur: każda następna runda to ostatnia + 1, `co_host_role.sql:257`, `:342`, `20261107091322_game_length.sql:109`).
- **Odsłona, pominięcie i przerwanie da się rozróżnić z samych danych:** `phase = 'revealed'` (z `abstained`, `ballots` i wierszami `round_results`), `phase = 'skipped'` (bez wyników), `phase = 'voting'` w pokoju `closed` = runda przerwana bez odsłony (koniec gry, „Nowa gra” albo godzinne sprzątanie; którym z nich, baza nie mówi, a kończy się tak co najwyżej ostatnia runda gry, bo `next_round` odmawia przy rundzie w głosowaniu, `co_host_role.sql:252`).
- **Żadna dzisiejsza funkcja nie oddaje wyników pojedynczych rund zakończonej gry.** `host_games()` oddaje tylko `{id, created_at, started_at, questions, nicks}` (`20261110131123_host_game_history.sql:48-74`), a `game_totals` to klucz `room_lobby` z samymi sumami (`20261114101656_players_channel_key.sql:400-430`). Potrzebna nowa funkcja `security definer` dla zalogowanego hosta (wzór: `host_games`, `delete_game`).
- **Tekst pytania:** pytanie z bazy ma w rundzie `question_id`, a tekst istnieje tylko w Workerze (`src/data/questions.ts` przez `baseQuestionText`, `src/lib/rooms/server.ts:277`); pytanie z listy gry (przeredagowane, własne hosta, zatwierdzona propozycja) ma `question_id = null` i `list_position`, a tekst w `game_questions.text`. Wszystkie cztery rodzaje są do odczytania po grze; ginie tylko para autor–tekst propozycji, której historia nie potrzebuje.
- **Gracz usunięty z pokoju (S-09) znika z historii:** jego wiersze `round_results` idą kaskadą we wszystkich odsłonach, a głosy oddane na niego przed odsłoną przepadają; `ballots` i `abstained` zostają, więc w takiej odsłonie suma głosów + wstrzymania może być mniejsza niż `ballots`. Gracz, który wrócił na swoje miejsce (S-04), ma ten sam wiersz `players` i swoje wyniki, bez duplikatu.
- **Anonimowość:** historia może pokazać tylko to, co pokój widział na odsłonach (nick i liczba głosów, liczba wstrzymań), bez listy „kto już zagłosował”; PRD przyjmuje, że głos z jednomyślnej odsłony widać w historii aż do skasowania gry (`context/foundation/prd.md`, NFR o anonimowości, zdanie o FR-030).
- **Do wzięcia z aplikacji:** czysty `gameSummary` (`src/lib/rooms/summary.ts:19`), `sortResults` (`src/lib/rooms/results.ts`), pomocniki wykresu (`src/lib/rooms/chart.ts`), `questionSentence` (`src/lib/rooms/shared.ts`); `GameSummary.tsx` wymaga dziś `view: RoomView` (kolory graczy i plakietka „ty”), a tabela wyniku odsłony siedzi w `RoundReveal.tsx` i nie jest wydzielona.

## Detailed Findings

### Baza: co zostaje po grze

- `public.rooms` (`20261007122858_room_lobby.sql:19-29`): `host_id` (właściciel), `status` (`lobby|playing|closed`, `20261014101922_first_live_round.sql:42-43`), `created_at`, `started_at` (ustawia `start_game`, `first_live_round.sql:51`). Kolumny z czasem końca gry nie ma (sprawdzone: wszystkie migracje w `supabase/migrations/`, raport wątku bazy).
- `public.players` (`room_lobby.sql:34-46`): `nick`, `seat`, `user_id` (tylko host), `cohost` (`20261027121442_co_host_role.sql:49`), `color` (`20261031090821_player_color_choice.sql:43-46`); nick unikalny w pokoju przez `nick_key` (`first_live_round.sql:103-107`).
- `private.rounds` (`first_live_round.sql:112-127`): `number` (unikalny w pokoju), `question_id` (od `20261024094002_question_list_review.sql:72-81` może być `null`, wtedy `list_position` wskazuje wpis listy), `phase` (`voting|revealed|skipped`, `20261015122252_full_game_evening.sql:28-29`), `eligible uuid[]`, `abstained` i `ballots` ustawiane tylko przy odsłonie.
- `private.round_results` (`first_live_round.sql:130-135`): `(round_id, player_id, votes)`, bez kolumny głosującego; klucz obcy do `players` z `on delete cascade`. Przy odsłonie `finish_round` wstawia jeden wiersz na każdego uprawnionego gracza, który wciąż istnieje, także z zerem (`20261026074427_question_play_data.sql:182-186`), i ustawia `phase = 'revealed'`, `abstained`, `ballots` (`:230-232`).
- `private.game_questions` (`question_list_review.sql:47-60`, `proposed` z `20261104095452_guest_question_proposals.sql:87`): `position`, `question_id`, `text`, `removed`; wiersze zostają po zamknięciu (`context/archive/2026-10-24-question-list-review/plan-brief.md:31`). Kolejność gry to `rounds.number`, nie `position` (zatwierdzone propozycje wchodzą przed resztę listy, `game_length.sql:139`).
- `private.question_base` (`20261113134418_question_base.sql:24-31`): id, kategoria, 18+; tekstu pytań nie ma.

### Baza: los rundy

| Zdarzenie                                                                           | Wiersz `rounds` | `phase`                                     | `round_results`                                                                                  |
| ----------------------------------------------------------------------------------- | --------------- | ------------------------------------------- | ------------------------------------------------------------------------------------------------ |
| Odsłona (`reveal_round` → `finish_round`, `question_play_data.sql:160-240`)         | zostaje         | `revealed`, `abstained`/`ballots` ustawione | wiersz na każdego obecnego uprawnionego, zera też                                                |
| Pominięcie (`skip_round`, `co_host_role.sql:275`, `:338`)                           | zostaje         | `skipped`                                   | brak                                                                                             |
| `end_game` (`co_host_role.sql:462-463`)                                             | zostaje         | dalej `voting`                              | brak; `drop_round_state` usuwa tylko urnę i głosujących (`guest_question_proposals.sql:384-411`) |
| Sprzątanie co godzinę (`close_stale_games`, `guest_question_proposals.sql:413-438`) | jak `end_game`  | dalej `voting`                              | brak                                                                                             |
| „Nowa gra” (`create_room`, `20261116172906_security_hardening.sql:137-139`)         | jak `end_game`  | dalej `voting`                              | brak                                                                                             |

### Baza: usunięty i powracający gracz

- `remove_player` (najnowsza definicja `players_channel_key.sql:63-161`) kasuje wiersz gracza (`:150`); kaskada zabiera jego `round_results` z każdej wcześniejszej odsłony, a `game_totals` traci go też. Głosy oddane na niego przed odsłoną przepadają, bo `finish_round` łączy tylko istniejących graczy (`question_play_data.sql:182-186`); jego własny oddany głos zostaje policzony. `ballots`, `abstained` i `eligible` się nie zmieniają (`context/changes/remove-player-new-link/research.md:31`, `:64-65`, `:82`, `:155`, `:158`).
- Decyzja S-09: usunięty „znika ze wszystkiego: z listy »Gracze«, z wyników poprzednich rund i z podsumowania wieczoru” (`context/changes/remove-player-new-link/research.md:158`). Wrócić może tylko nowym linkiem, z nowym wierszem i wynikami od tej chwili.
- Powrót na miejsce (S-04): przenosi się tylko token (`player_secrets`); wiersz `players` i jego wyniki zostają, ślad `moved` w `join_requests` znika przy zamknięciu (`context/archive/2026-11-03-rejoin-after-refresh/plan.md:22`, `:183-189`). Duplikatów nicku nie ma.

### Baza: tekst pytania

- Pytanie z bazy: `rounds.question_id` ustawione, tekst tylko w Workerze (`src/lib/rounds/draw.ts:102`, `src/lib/rooms/server.ts:277`). Historia pokaże dzisiejsze brzmienie (poprawka literówki zachowuje id); `questions.ts` zabrania kasowania wpisów, a nieznane id daje `null` i log `unknown_question` bez tekstu (`server.ts:277`).
- Pytanie z listy: `question_id = null`, `list_position` ustawione (`security_hardening.sql:579`, `game_length.sql:132`); tekst z `game_questions.text`, tak samo jak dziś w `room_lobby` (`players_channel_key.sql:342-348`). Przeredagowane ma w wierszu listy też id z bazy, własne hosta `proposed = false` bez id, zatwierdzona propozycja `proposed = true` (`guest_question_proposals.sql:246-249`).
- Przy zamknięciu znika `question_proposals` (pary autor–tekst); zatwierdzone mają już tekst bez autora w `game_questions` (`context/archive/2026-11-04-guest-question-proposals/plan-brief.md:50`).

### Baza: istniejące funkcje hosta

- `host_games()` (`host_game_history.sql:48-74`): SQL, `stable`, `security definer`, `search_path = ''`; tylko pokoje `closed` z `host_id = auth.uid()`; `execute` tylko dla `authenticated` (`:189-202`).
- `delete_game(p_room_id uuid)` (`host_game_history.sql:81-113`): sprawdza właściciela (inaczej `room_unknown`), odmawia gry niezakończonej (`game_not_ended`), jedno `delete from rooms` z kaskadą.
- `game_totals` w `room_lobby(uuid, text)` (`players_channel_key.sql:202`, sumy `:400-430`, `execute` dla `anon` i `authenticated` `:488`): `{revealed, totals: [{nick, votes}]}` tylko dla pokoju `closed` z co najmniej jedną odsłoną; w sumach są tylko gracze z wynikiem w co najmniej jednej odsłonie.

### Aplikacja: `/gry`

- Ochrona: `src/middleware.ts:7` (`PROTECTED_ROUTES = ["/gry"]`, sprawdzane przez `startsWith`, `:33-37`), więc trasa `/gry/<id>` byłaby chroniona bez zmian w middleware.
- `src/pages/gry.astro:14-26`: `hostGames(supabase)` z `src/lib/rooms/server.ts:630` (RPC `host_games`, parser `parseHostGames`, `src/lib/rooms/shared.ts:576`); błąd → 503/500 i tekst błędu dla wyspy, nigdy pusta lista. Wiersze przez `hostGameRow` (`src/lib/rooms/game-list.ts:42`), do wyspy tylko zwykły tekst.
- `src/components/room/HostGames.tsx`: karta `SURFACE` na grę (`:86`), tekst data / pytania / nicki (`:88-90`), `DeleteGameButton` (`:92-97`), fokus po usunięciu przez `focus.ts`; dziś bez wejścia w grę. Podglądy: `src/pages/dev/room-states.astro` (lista ok. `:127-159`, stany ok. `:1169-1211`).
- `scripts/ui-literals.mjs:16` ma `src/pages/gry.astro`, a `:22` obejmuje cały `src/components/room/`; nową stronę trzeba dopisać ręcznie.

### Aplikacja: podsumowanie i wynik odsłony

- `gameSummary(totals)` jest czysta (`src/lib/rooms/summary.ts:19`); woła ją `roomView` (`server.ts:324`). Typy: `GameTotals` (`shared.ts:93`), `RoundResult = {nick, votes}` (`shared.ts:47`), `GameSummary` (`shared.ts:195`), `HostGame` (`shared.ts:565`).
- `GameSummary.tsx` przyjmuje `{view: RoomView, summary, idPrefix, halves}` (`:9-17`); z `view` bierze tylko `playerColors(view.players)` (`src/lib/rooms/chart.ts:95`) i `view.me` (plakietka „ty”). Poza pokojem potrzebuje albo zmiany propsów na `players`/`me`, albo podstawionego widoku.
- Wynik odsłony w pokoju: `RoundReveal.tsx:95-244` jest spięty z `view`, ruchami prowadzącego i kciukami; tabela (`TABLE_FRAME`, kolumny Gracz/Głosy, kropka koloru, `:163-216`), wykres `ResultPie` (`:59`, niewyeksportowany) i „Wstrzymało się: N” (`:219`) nadają się do wydzielenia. Kolejność wierszy: `sortResults` (`src/lib/rooms/results.ts`: najwięcej na górze, remis w kolejności miejsc, zera na dole) – potrzebuje kolejności miejsc (`seat`).

### Testy, które dotyczą zmiany

- Nowe RPC: wiersz w `SQL_SIGNATURES`, `SUCCESS` i `CASES` w `tests/unit/room-rpc-gate.test.ts` (`:209-223`, `:551-562`).
- pgTAP: `supabase/tests/round_creator_view.test.sql` (`plan(506)` w `:90`; blok katalogu S-13 `:2012-2031` z `pg_temp.function_facts` `:540` i `pg_temp.versions_of` `:587`; scenariusze `host_games`/`delete_game` `:1057-1085`, `:3160-3179`).
- Testy bazy: `tests/db/game-history.test.ts` (dokładne klucze `host_games`, `GAME_KEYS` `:45`, brak nadmiarowych kluczy `:204`), `tests/db/game-summary.test.ts`, `tests/db/round-anonymity.test.ts`, pomocnik `tests/db/support/rounds.ts`; limit zakładania kont 30 na 5 min (zajęte 27, `context/foundation/test-plan.md` §6.2).
- Smoke: `scripts/smoke.mjs` (`/gry` bez sesji `:126`, z sesją `:141`, nagłówki bezpieczeństwa `:411`, kroki listy i kasowania ok. `:1145`); nazwy kroków nigdy nie mówią, kto na kogo głosował (test-plan §6.5).
- E2E: `tests/e2e/game-history.spec.ts:50` (lista i kasowanie), podsumowanie w `tests/e2e/game.spec.ts` (ok. `:180`).

## Code References

- `supabase/migrations/20261110131123_host_game_history.sql:48-74` – `host_games()`, wzór funkcji hosta (właściciel przez `auth.uid()`, tylko `closed`)
- `supabase/migrations/20261110131123_host_game_history.sql:81-113` – `delete_game`, wzór odmowy `room_unknown` / `game_not_ended`
- `supabase/migrations/20261026074427_question_play_data.sql:182-186`, `:230-232` – wyniki odsłony i `phase = 'revealed'`
- `supabase/migrations/20261027121442_co_host_role.sql:462-463` – `end_game` zostawia rundę w `voting`
- `supabase/migrations/20261114101656_players_channel_key.sql:150` – `remove_player` kasuje gracza (kaskada wyników)
- `supabase/migrations/20261114101656_players_channel_key.sql:342-348` – tekst pytania z listy gry w `room_lobby`
- `supabase/migrations/20261114101656_players_channel_key.sql:400-430` – `game_totals`
- `src/lib/rooms/server.ts:277`, `:324`, `:630` – tekst pytania z bazy, podsumowanie w `roomView`, `hostGames`
- `src/lib/rooms/summary.ts:19` – `gameSummary`
- `src/components/room/GameSummary.tsx:9-17` – propsy podsumowania
- `src/components/room/RoundReveal.tsx:59`, `:163-219` – wykres i tabela wyniku odsłony
- `src/components/room/HostGames.tsx:86-97` – karta gry na liście
- `src/middleware.ts:7`, `:33-37` – ochrona `/gry*`

## Architecture Insights

- Dane hosta czytają funkcje `security definer` sprawdzające `auth.uid()` w środku; tabele `private` nie mają uprawnień ani polityk (AGENTS.md, „Conventions”). Nowe wyjście z bazy powinno oddawać dokładnie zbiór kluczy, który pokazuje odsłona (nick, liczba głosów, wstrzymania), z testem dokładnych kluczy jak `GAME_KEYS`.
- Tekst pytań z bazy zostaje w Workerze; do przeglądarki idzie tylko tekst, który host ma zobaczyć (`context/foundation/lessons.md`, „Pytania gry tylko po stronie serwera”). Funkcja z bazy oddaje więc `question_id` albo tekst wpisu listy, a Worker zamienia id na tekst przez `baseQuestionText`, jak w `roomView`.
- Podsumowanie da się policzyć w Workerze z sum wyników odsłon tej samej funkcji (ta sama reguła co `game_totals`: suma po graczach z wynikiem w co najmniej jednej odsłonie, kolejność miejsc) albo oddać obok, jak `game_totals`; to decyzja planu.

## Historical Context (from prior changes)

- `context/archive/2026-11-10-host-game-history/plan-brief.md:48`, `plan.md:50`, `:87` – S-13 świadomie pominęło wejście z listy w podsumowanie i jakiekolwiek wyniki („Nic o głosach, wynikach, kolorach ani rolach”); powód: zakres „minimalnej listy”, nie zakaz. FR-030 to odwraca (supported).
- `context/archive/2026-10-25-game-summary/plan-brief.md:20-27`, `:44` – reguła podsumowania (top 3, całe remisy, „nikt nie głosował na…”, tylko odsłony); poza zakresem S-15 były wyróżnienia z pojedynczego pytania, teksty pytań i wstrzymania na ekranie końca, czyli dokładnie to, co dokłada S-26 (supported).
- `context/archive/2026-10-13-first-live-round/research.md:106`, `:282` – D3 „bez progu”: przy jednym głosie albo jednomyślności odsłona ujawnia głos; przyjęte. D1 (`:277`) dotyczy tylko stanu rundy w toku (supported).
- `context/changes/remove-player-new-link/research.md:158` – usunięty gracz znika z wyników i podsumowania (supported, potwierdzone w SQL).
- `context/archive/2026-11-10-host-game-history/plan-brief.md:23` – pytania dopisane w grze znikają razem z grą przy skasowaniu (supported).

## Related Research

- `context/archive/2026-11-10-host-game-history/research.md`
- `context/archive/2026-10-25-game-summary/research.md`
- `context/changes/remove-player-new-link/research.md`
- `context/archive/2026-11-15-no-recent-repeats/research.md` (złączenie `list_position` → `game_questions`, `:62-64`)

## Open Questions

Decyzje Karola (wygląd na zrzutach, reszta: rekomendacja + tak/nie w planie):

1. **Gdzie historia:** rozwinięcie karty na liście `/gry` czy osobna strona gry (np. `/gry/<id>`, chroniona przez obecny middleware)? Wybór na zrzutach.
2. **Co przy każdym pytaniu:** tabela jak na odsłonie (nick, głosy, kropka koloru) i „Wstrzymało się: N”; z wykresem kołowym czy bez? Rekomendacja do planu: tabela bez wykresu przy każdym pytaniu, wykres tylko w podsumowaniu na górze.
3. **Usunięty gracz:** jego wyniki zniknęły z bazy. Czy przy odsłonie, w której suma głosów i wstrzymań jest mniejsza niż liczba głosujących, pokazać krótki dopisek (np. „Część głosów przepadła razem z usuniętym graczem”), czy pokazać to, co zostało, bez komentarza?
4. **Gra bez historii:** gra, która nie wystartowała albo nie ma żadnej rundy, nie ma czego pokazać; wejście w historię tylko dla gier z co najmniej jednym pytaniem?
5. **Brzmienie pytań z bazy:** historia pokaże dzisiejszy tekst z `src/data/questions.ts` (poprawka literówki zmienia też starą grę); przyjąć (nie zapisujemy kopii tekstu, zgodnie z „nic nowego nie zapisujemy”)?

Pytania techniczne dla planu (bez decyzji Karola): jedna nowa funkcja z wynikami rund i sumami czy dwie; wydzielenie tabeli wyniku i `ResultPie` z `RoundReveal.tsx` do wspólnego komponentu; zmiana propsów `GameSummary.tsx` z `view` na `players`/`me`, żeby działał poza pokojem.
