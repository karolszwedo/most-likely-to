---
date: 2026-11-04T08:15:00+01:00
researcher: Claude (Opus 5.5)
git_commit: 111f660
branch: guest-question-proposals
repository: most-likely-to
topic: "S-10 propozycje pytań: jak dziś działa lista pytań gry, co musi się zmienić, żeby pytanie gracza zatwierdzone w trakcie gry zostało zagrane, jaki wzór „gracz prosi, prowadzący decyduje” skopiować, gdzie to postawić na ekranach i gdzie czekają zatwierdzone pytania na przegląd twórcy gry"
tags:
  [
    research,
    guest-question-proposals,
    game_questions,
    open_next_round,
    room_lobby,
    join_requests,
    JoinRequests,
    leader_refusal,
    FR-013,
    FR-014,
    FR-021,
  ]
status: complete
last_updated: 2026-11-04
last_updated_by: Claude (Opus 5.5)
last_updated_note: Pytanie Karola o poczekalnię: pułapka dotyczy zatwierdzania, a nie wysyłania; dopisana opcja i skutki.
---

# Research: S-10 propozycje pytań od gości

**Date**: 2026-11-04T08:15:00+01:00
**Researcher**: Claude (Opus 5.5)
**Git Commit**: 111f660
**Branch**: guest-question-proposals
**Repository**: most-likely-to

## Research Question

S-10 z roadmapy (`context/foundation/roadmap.md:232-244`): gość proponuje pytania z linku do pokoju w trakcie wieczoru, limit 3 na gościa na grę (decyzja Karola 2026-11-04, Open Roadmap Question 4), host lub współhost zatwierdza albo odrzuca, a zatwierdzone trafiają do listy tej gry (FR-013, FR-014). Pytanie otwarte z roadmapy: gdzie czekają zatwierdzone propozycje na przegląd twórcy gry (FR-021, poza aplikacją w v1).

## Summary

- **Sama rozgrywka nie wymaga nowego mechanizmu.** Wiersz z tekstem w `private.game_questions` dopisany w trakcie gry zostanie zagrany istniejącą drogą: `private.open_next_round` czyta tabelę na żywo, nic nie jest zamrażane przy starcie (`20261024094002_question_list_review.sql:483-541`). Tekst dociera do graczy jako `question_text`, a `questionsLeft` liczy taki wiersz poprawnie (`src/lib/rounds/draw.ts:89-95`).
- **Kolejność jest dziś „na koniec kolejki”.** Runda bierze wpis o najniższej niezagranej pozycji (`…question_list_review.sql:506`). W grze bez listy (domyślna ścieżka „start now”, PRD FR-012) zatwierdzone pytanie gra się w następnej rundzie. W grze z listą ląduje za wszystkimi czekającymi wpisami, więc przy liście 15 pytań może nie paść tego wieczoru; to obiekcja z PRD `prd.md:125`, odłożona jako szczegół. Wepchnięcie przed listę wymaga zmiany tego `order by` i osobnej kolumny lub flagi, bo pozycje są stałymi uchwytami (`…question_list_review.sql:47-60`).
- **Zatwierdzanie w poczekalni to pułapka; samo wysyłanie nie.** Pułapka działa dopiero od wiersza w `game_questions`, czyli od zatwierdzenia. `open_question_list` przy jakimkolwiek wierszu listy odpowiada `ok` i niczego nie losuje (`…question_list_review.sql:136-138`), a `start_game` przy istniejącym wierszu ignoruje pytanie wybrane przez Workera (`20261027121442_co_host_role.sql:146-158`). Zatwierdzenie w poczekalni przed „Przejrzyj pytania” dałoby hostowi listę z jednego pytania zamiast 15.
- **Wzór do skopiowania istnieje:** `join_requests` + `JoinRequests.tsx` (S-08, S-04): tabela bez grantów, `security definer`, odmowy jako dane, klucz w `room_lobby` tylko dla prowadzących, dzwonek, sprzątanie w `private.drop_round_state`. Trasa dostępna dla każdego gracza, także hosta, ma wzór w `src/pages/api/rooms/[id]/color.ts`.
- **Limit na gracza to nowość.** Dziś nie ma żadnego limitu na osobę; `requests_full` to 5 czekających próśb na pokój (`20261103151953_rejoin_after_refresh.sql:288-290`). Wiersze `game_questions` nie mają autora, więc limit wymaga własnego zapisu.
- **FR-021: nowego magazynu nie trzeba.** Zatwierdzone pytanie jako wiersz `private.game_questions` zostaje po grze tak samo jak własne pytanie hosta: wierszy nie kasuje żadna funkcja, a pokoju nie usuwa żadna migracja (raport przeglądu migracji; `…question_list_review.sql:15-17`). Twórca gry czyta je SQL-em. Autora w tym wierszu nie ma, więc po grze nie zostaje para „kto zaproponował”.

## Detailed Findings

### Lista pytań gry

- `private.game_questions` powstaje w `…question_list_review.sql:47-60` i żadna późniejsza migracja jej nie zmienia: `room_id` (FK `on delete cascade`), `position` 1–100, `question_id` (null dla własnego pytania), `text` 1–90 znaków, `removed`. Tabela ma RLS, `revoke all` i nie ma grantów (`:63-66`).
- `position` to stały uchwyt: nowy wpis dostaje `max+1`, nic nie jest przenumerowywane. `rounds.list_position` ma klucz obcy i unikat na `(room_id, list_position)` (`:76-79`).
- Pięć funkcji listy (`open_question_list`, `draw_list_question`, `remove_list_question`, `edit_list_question`, `add_own_question`) wpuszcza tylko hosta przez `auth.uid()` i tylko w statusie `lobby`, inaczej `game_started` (przykład: `:116-134`, `add_own_question` `:341-392`). Są nadane tylko `authenticated`, więc współhost, gość bez sesji, ich nie wywoła. Zatwierdzanie musi być osobną funkcją; luzowanie tych pięciu nie jest potrzebne.
- Tekst: `private.question_text` (`:89-95`) to `normalize_nick` + `rtrim(…, '? ')`. `add_own_question` tnie surowy tekst na 400 znakach i wymaga 1–90 po normalizacji, inaczej `invalid_question_text` (`:341-392`). Duplikatów nie sprawdza. `bodyQuestionText` (`src/lib/rooms/json-route.ts:160-165`) to gotowy parser ciała żądania.
- Wybór następnego pytania jest w bazie: `private.open_next_round` (`:483-541`) bierze wpis nieusunięty, bez rundy, `order by g.position limit 1` (`:499-507`), a gdy takiego nie ma, kandydata z puli Workera. `next_round` i `skip_round` wołają tę funkcję (raport; `20261027121442_co_host_role.sql:201`, `:275`).
- Koniec pytań: z faz rundy `next_round` odmawia dla `voting`, a dla `skipped` nie (`20261027121442_co_host_role.sql:252-253`), a przyciski zależą od `questionsLeft` (`src/components/room/HostActions.tsx:58-65`, `RoundSkipped.tsx:41`). Pytanie zatwierdzone, gdy pytania się skończyły, przywraca „Następne pytanie” (wniosek z tych ścieżek, niesprawdzony uruchomieniem).
- Limit 100 wierszy: `list_full` istnieje w `add_own_question` (`:383`). Przy 20 graczach po 3 propozycje i liście 15 to 75 wierszy; granicy dotyka tylko ręcznie rozbudowana lista. Zatwierdzanie i tak musi obsłużyć tę odmowę.

### Dane o pytaniach i podsumowanie

- Rundy bez `question_id` są poza `question_stats`: warunki odsłon, pominięć i kciuków mają `question_id is not null` (`20261026074427_question_play_data.sql:142`, `:193-198`). Pytanie z propozycji nie zaburzy danych o pytaniach, a jego kciuki przepadną bez zliczenia, jak przy własnym pytaniu (glosariusz: „pytań własnych i poprawionych nie obejmują”).
- Liczniki `listed`/`removed` są zapisywane raz, przy `start_game` (`20261027121442_co_host_role.sql:172-181`), i liczą tylko wpisy bazy bez tekstu. Propozycje to wpisy z tekstem, więc tego nie dotyczy.
- `RoundQuestion` wyświetla `questionSentence` jako węzeł tekstowy Reacta (`src/lib/rooms/shared.ts:589`), czyli zgodnie z lekcją „Pytania gry tylko po stronie serwera” (zwykły tekst). Prefiks „Kto z nas najprawdopodobniej” i „?” dokłada ekran, więc zapisana treść to sama końcówka zdania.

### Wzór „gracz prosi, prowadzący decyduje”

- Tabela: `join_requests` (`20261022132240_latecomer_admission.sql:39-61`) z RLS, `revoke all`, bez grantów. Blok właściciel/`revoke`/`grant` funkcji: tam `:519-540`, najnowszy `20261103151953_rejoin_after_refresh.sql:821-844`.
- Tożsamość: gość przez `p_player_token` (hash w `player_secrets`), host przez `auth.uid()`. `private.leader_refusal` (`20261027121442_co_host_role.sql:59-97`) daje null dla hosta i współhosta, inaczej `not_leader` albo `room_unknown`. Woła się je po `for update` na wierszu pokoju (`admit_latecomer`, `…rejoin_after_refresh.sql:390`; `reject_latecomer`, `:507`).
- Odmowy to dane `{ok:false, reason}`; wyjątek 22023 tylko dla tokenu w złym formacie.
- Stan: `room_lobby` (`…rejoin_after_refresh.sql:577-815`) daje `requests` i `returning` tylko przy `v_leader` (`:641`, `:648-655`); pozostali dostają `[]`. Gracz czekający na wpuszczenie dostaje null, więc nie jest jeszcze graczem (komentarz nad funkcją).
- Miejsca do zmiany przy nowym kluczu stanu: `room_lobby` wraz z ponowieniem właściciela i grantów; `LobbyState` (`src/lib/rooms/shared.ts:125`) i `parseRoomState` (`:374`), które odmawiają przy braku klucza; `roomView` (`src/lib/rooms/server.ts:302`), który rozsmarowuje stan do ekranu; `LOBBY_KEYS` (`tests/db/support/rounds.ts:184`); `tests/unit/room-state.test.ts`, `announce.test.ts`; `/dev/room-states`, `/dev/room-window`; `RoomScreen.tsx:454-463`. Worker po migracji: baza, potem kod (`AGENTS.md`, `deploy-plan.md`).
- Trasy: `admit.ts`, `reject.ts` (prowadzący), `color.ts` (każdy gracz, host przez sesję, gość przez ciasteczko, `src/pages/api/rooms/[id]/color.ts:9-41`). Rolę sprawdza baza, nie trasa. Teksty odmów: `src/lib/rooms/errors.ts:22-46`, `:48-105`. Każde nowe RPC to wiersz w `SQL_SIGNATURES` i `CASES` w `tests/unit/room-rpc-gate.test.ts`.
- Powiadomienie: `ringLobby` (`src/lib/rooms/server.ts:679`) dzwoni, ekrany odświeżają stan; zapas to odpytywanie co 8 s (`src/lib/live-sync/shared.ts:17`). Dzwonek niesie tylko `seq` (`src/lib/live-sync/server.ts:44-45`); kanał jest publiczny (roadmapa, Parked „Kanał na żywo tylko dla graczy pokoju”), więc tekst propozycji nie może nim iść.
- Sprzątanie: `private.drop_round_state` (`20261026074427_question_play_data.sql:243-259`) kasuje `join_requests` przy `end_game`, „Nowej grze” i godzinnym zamykaniu starych gier (`20261027121442_co_host_role.sql:463`, `20261031090821_player_color_choice.sql:134`, `20261014101925_close_stale_games.sql:33`). Odsłona go nie uruchamia. Usunięcie gracza kasuje jego wiersze przez `on delete cascade` po `player_id` (wzór: `…rejoin_after_refresh.sql:54`).
- Przeniesienie na inne urządzenie (S-04) zmienia hash tokenu, a nie `player_id`, więc limit liczony po `player_id` idzie za miejscem gracza.

### Prywatność i nadużycia

- Tekst gracza to nowość: dotąd gość dostarczał tylko nick. Normalizacja `private.normalize_nick` (`20261014101922_first_live_round.sql:60-80`) zdejmuje znaki sterujące i niewidoczne. Filtra słów nie ma nigdzie w sprawdzonych ścieżkach (`src/`, `supabase/migrations/`), a jedyną bramką treści jest prowadzący. Nikt poza prowadzącymi nie widzi tekstu przed zatwierdzeniem, o ile `room_lobby` daje listę tylko im.
- `logEvent` przyjmuje tylko pola z `LOG_FIELDS` (`src/lib/log.ts:13-27`), więc tekstu nie da się zalogować tą drogą.
- Autor to nie głos, więc zasada twarda z `AGENTS.md` (głosujący→cel) nie ma tu zastosowania. Wymaganie „O gościu nie zostaje nic poza nickiem i głosami” (`prd.md:152`) oznacza jednak, że para autor–tekst nie powinna przeżyć gry. Wzór spełnia to, gdy autor siedzi tylko w tabeli czyszczonej przez `drop_round_state`, a do `game_questions` trafia sam tekst.
- Przegląd S-06 zauważył, że własne pytanie może nazywać gościa (`context/archive/2026-10-24-question-list-review/reviews/impl-review.md:53`); tamta uwaga nie złamała żadnej zasady twardej. Dotyczy to też propozycji, a tekst zostaje po grze.

### Ograniczenia testów bazy dla nowej tabeli

- pgTAP skanuje każdą tabelę schematu `private`: brak grantów, brak publikacji i brak kolumny czasu, `serial` czy `identity` (`supabase/tests/round_creator_view.test.sql:425-458`, `:915-924`). Tabela w `private` musi więc mieć numer w obrębie pokoju, jak `position`, a nie `created_at`. Tabela w `public` bez grantów (jak `join_requests`) może mieć czas, ale nie ma powodu go trzymać.
- Test-plan §6.2 wymaga dokładnego `{ok:true}`, odmów jako danych, kontroli pozytywnej, dokładnych zbiorów kluczy i próbnego alarmu. Analogi: `tests/db/latecomers.test.ts`, `rejoin.test.ts`, `cohost.test.ts`; `tests/e2e/latecomer.spec.ts`. Alarmy S-08: „`room_lobby` daje gościowi listę” i „`drop_round_state` nie kasuje”. Limit zakładania kont: jeden host na plik.
- Smoke ma kroki pokoju i spóźnionych (`scripts/smoke.mjs:215-245`), więc propozycja i zatwierdzenie pasują do tego samego scenariusza.

### Ekrany

- `RoomScreen.tsx:356-431` wybiera widok, a `:433-486` składa kolumnę. `JoinRequests` stoi nad widokiem, poza `contentRef`, w każdym stanie dla prowadzących (`:454-463`); komentarz `:455-457` mówi, że odpowiedź na prośbę nie przenosi fokusu. To naturalny sąsiad listy do zatwierdzania.
- Współhost nie ma listy pytań (`prd.md:169`, glosariusz), a `QuestionList` jest tylko w poczekalni i tylko u hosta (`RoomLobby.tsx:186`). Czekające propozycje to osobny region, nie lista gry, więc reguły nie łamią.
- Formularz gracza nie powinien siedzieć wewnątrz widoku rundy: zmiana rundy podmienia widok i kasowałaby niewysłany tekst (wniosek z `RoomScreen.tsx:356-431`). Miejsce poza `contentRef`, obok `EmoteBar` (`:482-483`), przeżywa zmianę rundy. Fokus innych graczy nie jest przenoszony (`:204-205`), więc pisanie nie zostanie przerwane.
- Na telefonie `EmoteBar` jest przypięty do dołu okna poniżej `lg` (`src/components/room/EmoteBar.tsx:19-29`), więc drugiego przypiętego paska nie ma gdzie dać. Kolejność u gościa w głosowaniu: pytanie, formularz głosu, „Gracze” (`RoundVoting.tsx:456+`).
- Zestaw `src/components/ui`: alert, badge, button, card, checkbox, field, input, input-group, label, separator, spinner, textarea; bez Dialog, Sheet i Collapsible. Rozwijanie sekcji robi się stanem `open` (`QuestionList`, „Przejrzyj pytania”). Wzór formularza: `QuestionField` (`src/components/room/QuestionList.tsx:96-163`, nieeksportowany) z etykietą „Dodaj własne pytanie”, placeholderem „np. zjadłby pizzę z ananasem”, podpowiedzią „Dokończ zdanie „Kto z nas najprawdopodobniej…”. Najwyżej 90 znaków.”
- Nowy stan to podgląd w `/dev/room-states`, a przy zmianie okna też `/dev/room-window` (`AGENTS.md`). `scripts/ui-literals.mjs:8-18` skanuje `src/components/room/*` automatycznie.

## Code References

- `supabase/migrations/20261024094002_question_list_review.sql:47-60` - definicja `private.game_questions`
- `supabase/migrations/20261024094002_question_list_review.sql:89-95` - `private.question_text`
- `supabase/migrations/20261024094002_question_list_review.sql:136-138` - lista z wierszami nie jest losowana
- `supabase/migrations/20261024094002_question_list_review.sql:341-392` - `add_own_question`
- `supabase/migrations/20261024094002_question_list_review.sql:483-541` - `private.open_next_round`, kolejność `:506`
- `supabase/migrations/20261027121442_co_host_role.sql:59-97` - `private.leader_refusal`
- `supabase/migrations/20261027121442_co_host_role.sql:146-158` - `start_game` z listą
- `supabase/migrations/20261103151953_rejoin_after_refresh.sql:577-815` - najnowszy `room_lobby`
- `supabase/migrations/20261026074427_question_play_data.sql:243-259` - `private.drop_round_state`
- `supabase/migrations/20261022132240_latecomer_admission.sql:39-61` - `join_requests`, wzór tabeli
- `src/pages/api/rooms/[id]/color.ts:9-41` - trasa dla każdego gracza
- `src/lib/rooms/json-route.ts:160-165` - `bodyQuestionText`
- `src/lib/rounds/draw.ts:89-95` - `questionsLeft`
- `src/components/room/RoomScreen.tsx:454-463` - montaż `JoinRequests`
- `src/components/room/QuestionList.tsx:96-163` - `QuestionField`
- `tests/db/support/rounds.ts:184` - `LOBBY_KEYS`
- `supabase/tests/round_creator_view.test.sql:425-458` - skan tabel `private`

## Architecture Insights

- Dwa poziomy prawdy: bramką jest funkcja bazy, a nie trasa. Nowe akcje idą przez `security definer` z kontrolami w środku.
- Stan rundy w toku i dane łączące osobę z treścią żyją krótko i znikają w `drop_round_state`; trwałe jest tylko to, co nie ma autora. Propozycje wpisują się w ten podział, jeśli autor zostanie po stronie tabeli sprzątanej.
- Dzwonek jest niezaufaną podpowiedzią bez treści; treść przechodzi przez `room_lobby` z kontrolą roli.

## Historical Context (from prior changes)

- `context/archive/2026-10-24-question-list-review/plan.md:38` - propozycje gości poza zakresem S-06, lista tylko hosta.
- `context/archive/2026-10-24-question-list-review/follow-ups/review-fixes.md:17` - lista pytań przeżywa „Nową grę” dla S-11 i FR-021, poza sprzątaniem 12 h.
- `context/changes/co-host-role/plan.md:40`, `plan-brief.md:50` - propozycje świadomie przesunięte do S-10.
- `context/foundation/prd.md:92` - zatwierdzenia trafiają tylko do listy tej gry, nic trwałego; bazę strzeże twórca gry (FR-021, `:136`).

## Related Research

- `context/changes/rejoin-after-refresh/research.md` - tożsamość gracza, `join_requests`, `room_lobby`.
- `context/changes/remove-player-new-link/research.md` - usunięcie gracza, kaskady, rola współhosta.
- `context/archive/2026-10-22-latecomer-admission/` - wzór prośby rozstrzyganej przez prowadzącego.

## Open Questions

Decyzje produktowe do planu (właściciel: Karol):

Stan na 2026-11-04: rekomendacje to (1) wysyłanie w poczekalni i w grze, zatwierdzanie od startu gry; (2) zatwierdzone pytanie w następnej rundzie; (3) nick autora widzą tylko prowadzący; (4) każdy gracz po 3 propozycje, odrzucone też się liczą. Karol o (1): „wstępnie podoba mi się”. Do (2)–(4) nie odniósł się wprost, więc plan potwierdza wszystkie cztery jednym tak/nie.

1. **Kiedy można proponować?** Dokumenty mówią tylko „during the evening” (`prd.md:122`). Pułapka z `open_question_list` i `start_game` (Summary) dotyczy zatwierdzania, bo tylko ono pisze do `game_questions`. Opcje: tylko w trakcie gry; wysyłanie także w poczekalni, a zatwierdzanie od startu gry; albo oba w poczekalni, co wymaga zmian w `open_question_list`, `start_game` i `question_list`.
   Skutki drugiej opcji (sprawdzone 2026-11-04): pierwsza runda otwiera się przy starcie (`20261027121442_co_host_role.sql:185-190`), więc propozycja z poczekalni zagra najwcześniej w rundzie 2. Pokój porzucony przed startem nie ma sprzątania: `close_stale_games` bierze tylko `status = 'playing'` (`20261014101925_close_stale_games.sql:29`), „Zakończ grę” odmawia poza grą (`20261027121442_co_host_role.sql:458`), a `drop_round_state` odpali dopiero „Nowa gra” tego hosta (`20261031090821_player_color_choice.sql:121-134`). Bez dopisania tego do godzinnego sprzątania tekst z autorem zostałby w takim pokoju bezterminowo.
2. **Gdzie wchodzi zatwierdzone pytanie?** Opcje: następna runda (zmiana `order by` plus flaga w `game_questions`); albo koniec listy (bez zmiany, ale przy liście może nie paść). Bez listy obie opcje dają ten sam skutek.
3. **Kto widzi autora?** Prowadzący przy zatwierdzaniu tak lub nie. Grający w rundzie autora nie widzą w żadnej z opcji, bo `game_questions` go nie ma.
4. **Kto proponuje i co liczy limit?** Tabela PRD (`prd.md:184`) daje propozycję hostowi, współhostowi i gościowi, a FR-013 mówi „Guest”. Limit 3 liczy wszystkie wysłane albo tylko nieodrzucone.

Wygląd (miejsce formularza, widok zatwierdzania, informacja dla gościa) Karol wybiera na zrzutach w fazie ekranów.

Skutek dla S-13 (bez decyzji teraz): kasowanie gry usunie kaskadą także zatwierdzone pytania (`…question_list_review.sql:48`), zanim twórca gry je przejrzy.

Sprawdzone tylko raportem pomocniczym, bez ponownego czytania: ciała `react_round`, testy e2e, pełny `scripts/smoke.mjs`.
