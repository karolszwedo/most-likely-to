---
date: 2026-11-07T09:07:25+01:00
researcher: Claude (Opus 5.5)
git_commit: f74bac3
branch: game-length
repository: most-likely-to
topic: "Długość gry: skąd bierze się liczba pytań, jak pokazać ją wszystkim graczom i jak zatrzymać grę po ostatnim pytaniu"
tags: [research, game-length, room_lobby, open_next_round, game_questions, HostActions, RoomLobby]
status: complete
last_updated: 2026-11-07
last_updated_by: Claude (Opus 5.5)
---

# Research: długość gry widoczna dla wszystkich

**Date**: 2026-11-07T09:07:25+01:00
**Researcher**: Claude (Opus 5.5)
**Git Commit**: f74bac3
**Branch**: game-length
**Repository**: most-likely-to

## Research Question

Decyzje Karola z 07.11 są w `change.md` (opcja B). Pytanie: co w bazie, serwerze, ekranach i testach trzeba zmienić, żeby każda gra miała widoczną liczbę pytań („Pytanie 7 z 15”, w poczekalni na żywo), a po ostatnim pytaniu prowadzący wybierał „Zakończ grę” albo „Jeszcze 5 pytań”.

## Summary

- Dziś gra nie ma długości. `private.open_next_round` bierze najpierw listę, a gdy lista się skończy, pierwszego niezagranego kandydata z puli (`supabase/migrations/20261104095452_guest_question_proposals.sql:344-359`). Koniec przychodzi przy wyczerpaniu puli: 216 pozycji w `src/data/questions.ts` (159 zwykłych i 57 18+) albo po „Zakończ grę”.
- Żaden gracz nie zna liczby pytań. Liczby listy idą tylko do prowadzących w `leader_draw` (`…guest_question_proposals.sql:591-606`), a Worker nie wysyła ich na ekran (`src/lib/rooms/shared.ts:193`). Jedyny licznik, „Pytania (N)”, jest hosta i tylko po rozwinięciu listy (`src/components/room/QuestionList.tsx:379-381`).
- Rekomendacja: **licznik nad dzisiejszym losowaniem** (wariant M2 niżej). Liczba pytań liczona z istniejących danych, jedna kolumna na „Jeszcze 5”, strażnik w `private.open_next_round`, nowy klucz na najwyższym poziomie `room_lobby`. `start_game` i sposób losowania bez zmian, więc mniej testów do przepisania i brak okna, w którym stary Worker się psuje.
- Klucz musi być na najwyższym poziomie stanu, nie w `round`: parser Workera odrzuca każdy dodatkowy klucz pominiętej rundy (`src/lib/rooms/shared.ts:281-289`), a na najwyższym poziomie dodatkowe klucze pomija (`shared.ts:280`, `:333-334`). To daje kolejność „baza, potem kod”.
- „Jeszcze 5 pytań” powinno od razu otwierać następne pytanie. Akcja, która nie zmienia rundy, zostawia przyciski zajęte (`src/components/room/HostActions.tsx:109-114`) i ustawiony `movedFrom` (`src/components/room/RoomScreen.tsx:221`).

## Detailed Findings

### Skąd dziś biorą się pytania

- „Przejrzyj pytania” zapisuje pierwszych 15 kandydatów (`supabase/migrations/20261024094002_question_list_review.sql:153`). Bez otwarcia listy nie ma wierszy w `private.game_questions`, a `start_game` bierze pytanie wylosowane przez Workera (`supabase/migrations/20261027121442_co_host_role.sql`, `start_game`; `src/pages/api/rooms/[id]/start.ts:34-37`).
- Kolejne pytania: `next_round` i `skip_round` wołają `private.open_next_round` (`20261027121442_co_host_role.sql:257`, `:350`). Przy braku kandydata `next_round` odpowiada `no_questions`, a `skip_round` odpowiada `{ok: true}` i pominięta runda zostaje ostatnia (`:273`).
- `next.ts` zamienia `no_questions` na `questions_ran_out` (`src/pages/api/rooms/[id]/next.ts:46-48`), tekst: „Pytań już nie ma. Możesz zakończyć grę.” (`src/lib/rooms/errors.ts:49`).
- Wielkość puli: `src/data/questions.ts` ma 216 wpisów. Najmniejsza pula jednej kategorii bez 18+ to 19 pytań (Przyszłość), pozostałe mają 20, więc w wariancie M2 domyślne 15 zawsze się mieści. Worker sprawdza pulę (`draw.ts`), baza nie zna jej wielkości.
- `round.number` rośnie także przy pominięciach (`src/lib/rounds/draw.ts:82`), więc „Pytanie 7” znaczy siódmą rundę, nie siedem odsłon.

### Dwa modele długości gry

| | M1: każda gra ma zapisaną listę | **M2: licznik nad dzisiejszym losowaniem** |
|---|---|---|
| Liczba pytań | wiersze listy, zawsze prawdziwa z konstrukcji | liczona: lista albo 15, plus zatwierdzone propozycje, plus dobrane |
| Start gry | `start_game` musi przyjąć kandydatów i zapisać listę: nowa sygnatura, zgodność ze starym Workerem w oknie wdrożenia | bez zmian |
| Współhost | musi móc zapisać listę | bez zmian |
| Dane S-11 | `listed` liczyłby listy nieoglądane, więc licznik trzeba wyłączyć dla list automatycznych (`20261026074427_question_play_data.sql:330-339`) | bez zmian |
| Testy do przepisania | m.in. `proposals.test.ts:327,549-558,575-581`, `cohost.test.ts:243,277-282,418-420`, pgTAP `:2356-2369`, `:2473-2476`, dokładne `stats_gain` | głównie `question-list.test.ts:282-294,469-477` i blok `draw.test.ts:205-283` |
| Zgodność z PRD | dosłowna („losowana jest lista pytań na daną grę”, `prd.md:118`) | zgodna co do skutku, losowanie zostaje leniwe |
| Ryzyko przed wieczorem z ekipą | większe, rusza start każdej gry | mniejsze, dokłada zatrzymanie |

Rekomendacja M2. Licząca się cena: liczba jest wyliczana, a nie wynika z wierszy, więc musi mieć jedną definicję w jednej funkcji.

### Definicja liczby pytań w M2

`T = baza + zatwierdzone + dobrane`, jedna funkcja `private` używana przez `room_lobby` i strażnika:

- baza: gdy pokój ma wiersze listy z `proposed = false`, liczba tych wierszy z `removed = false`; gdy nie ma, 15. Lista z samymi usuniętymi daje 0, a nie 15, i „Zacznij grę” odpowiada `list_empty` jak dziś.
- zatwierdzone: wiersze `proposed = true`. Dziś zatwierdzona propozycja w grze bez listy tworzy wiersz (`…guest_question_proposals.sql:246`), więc warunek na `proposed = false` jest konieczny, żeby baza została 15.
- dobrane: nowa kolumna na `public.rooms`, domyślnie 0. Tabela ma `grant select, insert` dla `authenticated` i `update (status)` (`20261007122858_room_lobby.sql:59-60`), więc kolumna wymaga ograniczenia `check`, a zmienia ją tylko funkcja `definer`.

Sprawdzone ścieżki: usunięcie, dolosowanie, własne pytanie (`Popraw` nie zmienia liczby), zatwierdzenie w grze bez listy i z listą, pominięcie ostatniego pytania, „Jeszcze 5” z listą (idzie do puli poza listą, jak dziś).

### Zatrzymanie i „Jeszcze 5 pytań”

- Strażnik w `private.open_next_round`: numer rundy większy niż `T` → `false`. To jedno miejsce dla `next_round` i `skip_round`, które już obsługują `false` (`no_questions`, pominięta runda zostaje ostatnia).
- Nowa funkcja `definer` dla prowadzącego, z `p_round` jak `next_round`: dobiera najwyżej 5, ale nie więcej, niż jest niezagranych kandydatów spoza listy, i od razu otwiera następną rundę. Zero kandydatów → `no_questions`. Dzięki temu „z 20” nie obiecuje pytań, których nie ma, a pula jednej kategorii (19 albo 20) kończy się uczciwie.
- `questionsLeft` zmienia znaczenie: `round.number < T`. Istniejący wzór z `draw.ts:96` zostaje jako „czy da się dobrać”, stąd `leader_draw` bez zmian i testy `cohost.test.ts:277,460,462`, `proposals.test.ts:553,576` zielone.

### Na żywo u wszystkich

- `question-remove.ts:12`, `question-draw.ts:15`, `question-add.ts:12` świadomie nie dzwonią (plan S-06, `context/archive/2026-10-24-question-list-review/plan.md:213,444`). Teraz muszą: stan zmienia się każdemu graczowi, więc ogranicznik nie rozciągnie przerwy (`src/lib/live-sync/limiter.ts`, zmieniony stan wraca do `MIN_GAP_MS`). `question-edit` i `question-list` dalej bez dzwonka.
- `proposal-approve.ts:46` dzwoni tylko do prowadzących (przegląd S-10, F1, scalone dziś). Zostawić: reszta dostanie „z 16” z własnego odpytania, najpóźniej po 8 s, a `proposals.spec.ts` pilnuje, że ekran bez roli nic nie pobiera przy zatwierdzeniu.

### Ekrany

- Poczekalnia: blok tytułu (`src/components/room/RoomLobby.tsx:136-141`) to jedyny blok kolumny gry widoczny dla każdej roli.
- W grze nie ma wspólnego komponentu: `RoundQuestion` obsługuje głosowanie i odsłonę (`RoundVoting.tsx:459`, `RoundReveal.tsx:101`), pominięcie ma własny tytuł (`RoundSkipped.tsx:32`). Licznik nie może wejść do nagłówka: `tests/e2e/support/round.ts:19` wymaga nagłówka 1. poziomu dokładnie ze zdaniem. Musi być elementem innym niż `h1`/`h2`, bo fokus idzie na pierwszy taki nagłówek (`RoomScreen.tsx:220-228`).
- Ekran koniec (`EveningEnd`) ma już „Odsłoniętych pytań:” (`GameSummary.tsx:33`), więc bez licznika. Ekran czekania spóźnionego zostaje bez liczby: umowa „nic z gry” (`JoinWaiting.tsx:14-15`).
- Czytnik ekranu: `announcementKey` nie zawiera liczby (`announce.ts:10-12`), więc zmiana `T` niczego nie ogłasza. „Pytanie N.” można rozszerzyć o „z T”.
- `afterRoundActions` (`HostActions.tsx:57-66`): dziś `questionsLeft` false daje „Zakończ grę” i notkę. Nowa akcja dopisuje się do `HostActionId` (`:16`), `RoomAction` (`room-actions.ts:26-47`) i `VIEW_CHANGING` (`RoomScreen.tsx:132`).
- `RoundReveal` traktuje `questionsLeft` przez `!== false`, a `RoundSkipped` przez `=== true` (`RoundReveal.tsx:204`, `RoundSkipped.tsx:41`), bo `null` znaczy co innego na obu ekranach.

### Testy i podglądy

- Dokładne zbiory kluczy: `LOBBY_KEYS` (`tests/db/support/rounds.ts:204-218`) i `VIEW_KEYS` (`tests/unit/room-state.test.ts:1073-1088`), jeden wpis w każdym. Klucze rund bez zmian.
- pgTAP: `plan(397)` (`supabase/tests/round_creator_view.test.sql:61`), pary `function_facts`/`versions_of` dla nowej funkcji i `room_lobby` (`:1479`, `:1220`). `tests/unit/room-rpc-gate.test.ts` wymaga nowej sygnatury.
- Żaden test ani smoke nie gra 15 rund bez listy (zliczone ręcznie: najwięcej 4 w `db`, 3 w `e2e`, 4 w smoke), więc strażnik ich nie dotknie.
- E2E końca gry można zrobić tanio: host usuwa z listy 13 pytań i gra się kończy po 2. Tej ścieżki nie pokrywa dziś nic poza podglądami (`HostActions.tsx:62-63`).
- `RoomView` buduje ręcznie `src/pages/dev/room-states.astro` i `room-window.astro` oraz fikstury `announce.test.ts`, `remembered-nick.test.ts`; brakujące pole złapie `astro check`.

## Code References

- `supabase/migrations/20261104095452_guest_question_proposals.sql:317-376` - `private.open_next_round`
- `supabase/migrations/20261104095452_guest_question_proposals.sql:475-737` - `public.room_lobby`
- `supabase/migrations/20261027121442_co_host_role.sql:257,350` - wywołania `open_next_round`
- `src/lib/rounds/draw.ts:82-101` - `questionsLeft`
- `src/lib/rooms/server.ts:337-341` - `leaderQuestionsLeft`
- `src/components/room/HostActions.tsx:57-66` - `afterRoundActions`
- `src/lib/rooms/shared.ts:281-289` - ścisły parser pominiętej rundy

## Architecture Insights

- Stan pokoju rośnie kluczami na najwyższym poziomie, parser Workera kopiuje tylko klucze umowy, a brak klucza odmawia pokoju (`shared.ts:469-474`), stąd kolejność „baza, potem kod”.
- Zasady gry żyją w funkcjach `definer`; Worker tylko losuje kandydatów. Strażnik musi być w bazie, bo funkcja dla `anon` jest publicznym wejściem (AGENTS.md).

## Historical Context (from prior changes)

- `context/archive/2026-10-15-full-game-evening/research.md:104-112` - D1: wybrano W-B zamiast W-C (lista N pytań z końcem), bo W-C ucinało wieczór i nie było jak dolosować. „Jeszcze 5” usuwa tę wadę, a M2 zachowuje W-B.
- `context/archive/2026-10-15-full-game-evening/research.md:145` - D2: przy wyczerpanej puli bez samoczynnego końca. Zostaje: grę dalej kończy prowadzący.
- `context/archive/2026-10-24-question-list-review/plan-brief.md:23-24` - 15 pytań „starcza na ok. pół godziny”; po liście „wieczór się nie urywa”. Ta zmiana zastępuje drugi wiersz przystankiem.
- `context/changes/guest-question-proposals/plan.md:3` - decyzja 5: autor widzi tylko liczniki, bez statusu decyzji.

## Related Research

- `context/archive/2026-10-24-question-list-review/research.md`
- `context/changes/guest-question-proposals/research.md`

## Open Questions

1. **Konflikt z decyzją 5 S-10.** „z 16” mówi autorowi, że propozycja przeszła, zanim padnie jako następne pytanie (najpóźniej po 8 s od zatwierdzenia). Brak zmiany liczby przy spadku „czeka” zdradza odrzucenie. Dziś autor dowiaduje się tego z następnej rundy, więc różnica to chwila. Wymaga przyjęcia przez Karola.
2. **Wygląd**: miejsce i brzmienie licznika w poczekalni i w grze, przycisk po ostatnim pytaniu, kto widzi „Jeszcze 5”, tekst zamiast „Pytań już nie ma”. Warianty na zrzutach.
3. **Roadmapa i PRD**: nowy wiersz (S-19) i zapis w FR-012/FR-015, słownik („lista pytań gry”, „pozostałe pytania”, nowy termin na liczbę pytań).
4. **Gra w toku przy wdrożeniu**: pokój w grze po 15. rundzie zatrzyma się na strażniku. Wdrożenie poza grą, więc bez osobnej obsługi.
