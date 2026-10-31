---
date: 2026-10-31T09:17:01+01:00
researcher: Claude (Opus 5.5) z Karolem
git_commit: fe1d5f6
branch: player-color-choice
repository: most-likely-to
topic: "S-18 wybór koloru przez gracza: skąd dziś bierze się kolor gracza i co trzeba zmienić, żeby gracz wybierał go sam"
tags: [research, player-color, rooms, room_lobby, players, chart, remembered-nick]
status: complete
last_updated: 2026-10-31
last_updated_by: Claude (Opus 5.5)
last_updated_note: "Decyzje Karola 1–8 i projekt techniczny do planu (sekcja na końcu)"
---

# Research: S-18 wybór koloru przez gracza

**Date**: 2026-10-31T09:17:01+01:00
**Researcher**: Claude (Opus 5.5) z Karolem
**Git Commit**: fe1d5f6
**Branch**: player-color-choice
**Repository**: most-likely-to

## Research Question

Skąd dziś bierze się kolor gracza (lista „Gracze”, koło odsłony, podsumowanie, dymki emotek), jak wygląda baza graczy i wejście do pokoju, i co trzeba zmienić, żeby gracz (host i gość) sam wybierał kolor z palety gry, bez dwóch graczy w tym samym kolorze (roadmapa S-18, `context/foundation/roadmap.md`).

## Summary

- Kolor nie jest dziś nigdzie zapisany. Liczy go przeglądarka: `seatColors(players)` daje nickowi numer koloru = pozycja na liście graczy modulo `MAX_PIE_SLICES` = 20 (`src/lib/rooms/chart.ts:95-97`, `:12`). Lista przychodzi z `room_lobby` w kolejności `seat` (`supabase/migrations/20261027121442_co_host_role.sql:879-889`), a `seat` to kolejność wejścia (host 1, potem `max(seat)+1`; `20261007122858_room_lobby.sql:40-41`, `join_room` w `20261014101922_first_live_round.sql:308`).
- Kolor czyta pięć widoków, każdy przez `seatColors` i mapę nick → numer: `RoomLobby.tsx:82`, `RoundVoting.tsx:143`, `RoundReveal.tsx:93`, `GameSummary.tsx:28`, `EmoteBubbles.tsx:44`. Klasy są w trzech tablicach po 20 pozycji w `src/components/room/chart-colors.ts` (`SLICE_FILLS`, `SLICE_DOTS`, `SLICE_BORDERS`), a kolory to tokeny `--chart-1` … `--chart-20` w `src/styles/global.css` (ciemne `:81-100`). Kolor jest przypięty do nicka, nie do miejsca w wyniku (`RoundReveal.tsx:49-55`).
- W bazie wystarczy kolumna na `players` (jak `cohost` w S-07), nowa funkcja zmiany koloru otwarta dla gościa z tokenem i klucz `color` w `room_lobby`. Wszystkie funkcje, które dodają gracza (`join_room`, `admit_latecomer`) albo zmienią kolor, blokują wiersz pokoju (`for update`), więc zajęty kolor da się sprawdzić pod tą blokadą, jak dziś zajęty nick.
- PRD nie ma limitu graczy (przeszukany `context/foundation/prd.md`: brak), a paleta ma 20 kolorów. Zasada „dwóch graczy nie ma tego samego koloru” może więc obowiązywać tylko do 20 graczy; od 21. kolory muszą się powtarzać (jak dziś) albo gracz zostaje bez koloru.
- Kolor to publiczna cecha gracza, jak nick: widzą go wszyscy na liście „Gracze”. Nie tworzy pary głosujący→cel, o ile nie trafi do tabel rundy (`private.round_*`) ani do logów obok głosu (AGENTS.md, Hard Rules).
- Decyzje produktowe Karola i projekt techniczny: sekcja „Decyzje do planu” na końcu.

## Detailed Findings

### Kolor w przeglądarce dziś

- `seatColors(players: readonly LobbyPlayer[]): ReadonlyMap<string, number>` (`src/lib/rooms/chart.ts:95-97`): `new Map(players.map((p, i) => [p.nick, i % MAX_PIE_SLICES]))`. Komentarz `:89-94` zakłada, że nikt nie wychodzi z pokoju; S-09 (usunięcie gracza) to złamie, a słownik wymaga, żeby usunięcie nie zmieniło kolorów pozostałych (`context/domain/glossary.md:48`).
- Testy `tests/unit/chart.test.ts:147-194` przypinają: host + 4 gości → 0…4 (`:157`), spóźniony na końcu dostaje następny numer (`:167`), 21. gracz → 0, 22. → 1 (`:181`), pusta lista → pusta mapa (`:191`).
- Konsumenci (każdy pomija nick bez koloru, `color !== undefined`):
  - lista „Gracze” w poczekalni: `RoomLobby.tsx:82` (mapa), `:228`, kropka `SLICE_DOTS` `:241`;
  - lista „Gracze” w głosowaniu: `RoundVoting.tsx:143`, `:203`, `:213`; formularz głosu bez kropki (komentarz `:194`);
  - odsłona: `RoundReveal.tsx:93`, koło `:51-56`, tabela `:151`, kropka `:174`;
  - podsumowanie: `GameSummary.tsx:28-29`, legenda `:55`, koło `:132`;
  - dymki emotek: `EmoteBubbles.tsx:44`, `:57` (`SLICE_BORDERS`).
- `/dev/room-states` i `/dev/room-window` budują literały `LobbyPlayer` (`room-states.astro:52-120`, `room-window.astro:39-43`, `:66-70`) i renderują prawdziwe komponenty, więc kolor idzie za fiksturami.
- Testy E2E nie sprawdzają klas kolorów (przeszukany `tests/e2e/`: brak `chart-`, `SLICE_`, `seatColors`).

### Paleta

- 20 tokenów `--chart-1` … `--chart-20`, oklch, jasne `global.css:27-47`, ciemne `:81-100`, w `@theme inline` `:134-153`. Gra zawsze działa w ciemnym motywie. Komentarz przy ciemnej palecie: każdy kolor ma co najmniej 3,8:1 na `--card`, najbliższa para różni się o 0,095 w OKLab (`context/archive/2026-10-25-player-colors/plan.md:36`).
- Repo nie ma nazw kolorów (przeszukany `src/`: brak). Wybór koloru dostępny dla czytnika ekranu potrzebuje 20 polskich nazw dopasowanych do odcieni.
- `MAX_PIE_SLICES` decyduje też o kole odsłony: przełącznik koło/paski tylko przy 1–20 graczach z głosami (`chart.ts:14-20`). Wybór koloru tego nie zmienia.

### Typ gracza i parsery Workera

- `LobbyPlayer` = `{nick, host, cohost}` (`src/lib/rooms/shared.ts:15-19`). `parsePlayers` (`:200-210`) sprawdza każdy klucz i kopiuje tylko klucze kontraktu; brak klucza daje błąd z nazwą pola (`players.cohost`), czego pilnują testy „bazy sprzed migracji” (`tests/unit/room-state.test.ts:279-292`, `:677-681`).
- Fikstury do uzupełnienia o nowe pole: `tests/unit/room-state.test.ts` (`:25-27`, `:105-107`, `:358-362`, `:497`, `:511`), `tests/unit/announce.test.ts:13-15`, `:133`, `tests/unit/chart.test.ts:150`, `src/pages/dev/room-states.astro`, `src/pages/dev/room-window.astro`.

### Baza: gracze i wejście do pokoju

- `public.players` (`20261007122858_room_lobby.sql:34-45`): `id`, `room_id`, `nick` (1–20 znaków), `user_id` (tylko host), `seat`; unikalne `(room_id, user_id)`, `(room_id, seat)`, a od S-02 `(room_id, nick_key)` (`20261014101922_first_live_round.sql:103-107`); od S-07 `cohost` z `check (not cohost or user_id is null)` (`20261027121442_co_host_role.sql:49-50`). Host ma tylko `select` przez RLS, `anon` nic; każdy zapis idzie przez funkcje `security definer` (`first_live_round.sql:35-38`).
- Gdzie powstaje gracz:
  - `create_room` (`first_live_round.sql:220`): wiersz hosta z `seat = 1`;
  - `join_room(p_link_token, p_nick, p_player_token)` (`first_live_round.sql:308`): blokada wiersza pokoju (`for update`), `seat = max(seat)+1`, `unique_violation` na `players_room_nick_key` → `nick_taken`;
  - `admit_latecomer(p_room_id, p_nick, p_player_token default null)` (`co_host_role.sql:477`): blokada pokoju, kontrola prowadzącego, wstawienie jak wyżej, kolizja nicka → `latecomer_nick_taken` (`:529`);
  - `request_join` (`20261022132240_latecomer_admission.sql:94`): spóźniony podaje tylko nick, a wybór czegokolwiek więcej przed wpuszczeniem wymagałby kolumny na `join_requests`.
- Wzór zmiany cechy gracza: `set_cohost(p_room_id, p_nick, p_cohost)` (`co_host_role.sql:595`): walidacja argumentu (22023), blokada pokoju, odmowy `room_unknown`, `room_closed`, `player_unknown`, `update players`. Gość bez konta rozpoznawany po tokenie z ciasteczka (`sha256` w `player_secrets`), jak w `cast_vote` i `private.leader_refusal`.
- Testy przypinające klucze i katalog: `tests/db/support/rounds.ts:142-153` (`LOBBY_KEYS`, `PLAYER_KEYS = ["cohost","host","nick"]`), pgTAP `supabase/tests/round_creator_view.test.sql:1220-1272`, `tests/unit/room-rpc-gate.test.ts` (`SQL_SIGNATURES`).
- Limit rejestracji w testach bazy: 16 kont na przebieg przy limicie 30 na 5 minut (`context/foundation/test-plan.md:189`). Nowy plik testów z własnym hostem to 17.

### Worker i formularze

- `createRoom` (`src/lib/rooms/server.ts:128`) z `src/pages/api/rooms/index.ts`, formularz `NewGameForm.tsx` (`<form method="POST" action="/api/rooms">`, `:116`). `joinRoom` (`:169`) i `requestJoin` (`:192`) z `src/pages/api/rooms/join.ts`, formularz `JoinForm.tsx` (`action="/api/rooms/join"`, `:95`; warianty join/request/request-again). Oba formularze wysyłają dziś tylko nick (i kategorie u hosta).
- Trasy JSON ekranu pokoju idą przez `src/lib/rooms/json-route.ts` (wzór: `cohost.ts`, `vote.ts:39-47` dla sesji albo ciasteczka gracza).
- Zapamiętany nick (S-14): `src/lib/rooms/remembered-nick.ts` (klucz `mlt-nick`, `:9`; zapis `rememberNick` `:54-61` dopiero po przyjęciu nicka przez bazę, wywołanie w `RoomScreen.tsx:203-207`; odczyt w `useNickField.ts:16-23`). Komentarz w `tests/unit/remembered-nick.test.ts` mówi, że w przeglądarce leży tylko nick, pod jednym kluczem.

### Komponenty UI

- `src/components/ui/`: alert, badge, button, card, checkbox, field, input, input-group, label, separator, spinner, textarea. Brak radio-group i toggle-group: wybór koloru to nowy element (`npx shadcn@latest add radio-group` albo przyciski `aria-pressed` jak `CohostButton.tsx`).

## Code References

- `src/lib/rooms/chart.ts:12`, `:14-20`, `:95-97` — `MAX_PIE_SLICES`, koło/paski, `seatColors`
- `src/components/room/chart-colors.ts:7`, `:29`, `:52` — `SLICE_FILLS`, `SLICE_DOTS`, `SLICE_BORDERS`
- `src/styles/global.css:81-100` — 20 ciemnych tokenów `--chart-N`
- `src/lib/rooms/shared.ts:15-19`, `:200-210` — `LobbyPlayer`, `parsePlayers`
- `supabase/migrations/20261007122858_room_lobby.sql:34-45` — tabela `players`
- `supabase/migrations/20261027121442_co_host_role.sql:49-50`, `:595`, `:879-889` — kolumna `cohost`, `set_cohost`, gracze w `room_lobby`
- `supabase/migrations/20261014101922_first_live_round.sql:220`, `:308` — `create_room`, `join_room`
- `src/lib/rooms/remembered-nick.ts:9`, `:54-61` — zapamiętany nick
- `tests/unit/chart.test.ts:147-194`, `tests/db/support/rounds.ts:142-153` — testy kolorów i kluczy

## Architecture Insights

- Kolor jest dziś funkcją kolejności; po zmianie staje się danymi gracza w bazie. Każdy widok i tak bierze kolor z mapy nick → numer, więc wystarczy podmienić źródło mapy (`seatColors` → kolor z `players[].color`), bez zmian w pięciu widokach poza nazwą funkcji.
- Rozstrzyganie kolizji w tym repo: kontrola pod blokadą wiersza pokoju, a unikalny indeks jako zabezpieczenie (`join_room`, `request_join`). Przy kolorach unikalny indeks `(room_id, color)` nie zadziała od 21. gracza, jeśli kolory mają się wtedy powtarzać.
- Nowa funkcja dla gościa bez konta = publiczny punkt wejścia z grantem `anon`; wszystkie kontrole w środku (AGENTS.md).

## Historical Context (from prior changes)

- `context/archive/2026-10-25-player-colors/change.md:13-15` — kolory wprowadzono, bo kolor szedł za miejscem w wyniku i ludzie się mylili; Karol wybrał wariant A (kolor z miejsca), a wariant B (gracz wybiera w poczekalni: pole w bazie, wybór, konflikt dwóch chętnych na ten sam kolor) odłożył „na później, na A”.
- `context/archive/2026-10-25-player-colors/plan-brief.md` — kropka przy nicku na listach „Gracze”, w tabeli odsłony i w legendzie podsumowania; bez kropki: formularz głosu, chipy „Nikt dziś nie głosował na”, prośby spóźnionych; kropka `aria-hidden`, kolor nigdy nie jest jedynym nośnikiem informacji.
- `context/archive/2026-10-26-room-emotes/plan.md` — dymek emotki obrysowany kolorem gracza (`SLICE_BORDERS`).
- `context/archive/2026-10-25-remembered-nick/plan-brief.md` — zapis nicka w `localStorage` dopiero po przyjęciu przez bazę; host i gość dzielą jeden zapamiętany nick.
- `context/foundation/prd.md:68`, `:143`, `:172` — FR-024 dopisany jako „dodatek v1, decyzja hosta 2026-10-25” w trzech miejscach; FR-025 pójdzie tym samym wzorem.

## Related Research

- `context/archive/2026-10-25-player-colors/research.md`
- `context/changes/co-host-role/research.md` (wzór kolumny na `players` i funkcji z tokenem gracza)

## Open Questions

Pytania produktowe do Karola — z rekomendacjami w sekcji „Decyzje do planu”.

## Decyzje do planu

### Produktowe (Karol, 2026-10-31: „Elegancko, działamy” — wszystkie rekomendacje przyjęte)

1. **Gdzie:** na liście „Gracze” gracz dotyka swojej kropki przy nicku i rozwija paletę 20 kolorów. Przy wejściu do pokoju gra sama daje pierwszy wolny kolor; formularze z nickiem (`JoinForm`, `NewGameForm`) zostają bez zmian.
2. **Kiedy:** w poczekalni i w trakcie gry (wpuszczony spóźniony też). Zmiana od razu widoczna wszędzie, także na kołach odsłon i w podsumowaniu. Zamknięta gra: bez zmian.
3. **Zajęty kolor:** widoczny w palecie, wyszarzony i nieklikalny. Dwa równoczesne wybory tego samego koloru: drugi dostaje „Ten kolor ktoś właśnie zajął”.
4. **Host:** wybiera na tych samych zasadach, bez zarezerwowanego koloru.
5. **Zapamiętany kolor:** przeglądarka pamięta wybrany kolor jak nick (FR-024); w następnej grze gracz dostaje go od razu, jeśli jest wolny.
6. **Ponad 20 graczy:** do 20 graczy każdy ma inny kolor; od 21. kolory się powtarzają (paleta ma 20), jak dziś.
7. **Kropki:** tylko tam, gdzie są dziś (bez kropek w formularzu głosu, chipach „Nikt dziś nie głosował na” i prośbach spóźnionych).
8. **Wygląd palety:** Karol wybiera na zrzutach z 2–3 wariantów.

### Projekt techniczny (rozstrzygnięty w sesji; do potwierdzenia w planie)

- **Kolumna:** `public.players.color smallint not null` z `check (color between 0 and 19)`. Uzupełnienie istniejących wierszy: `(seat - 1) % 20`, czyli dokładnie dzisiejszy `seatColors` (`seat` bez luk: host 1, potem `max(seat)+1`, nikt nie wychodzi), więc wdrożenie nie zmienia nikomu koloru. Bez unikalnego indeksu `(room_id, color)` (od 21. gracza kolory się powtarzają); unikalność do 20 graczy pilnuje kontrola pod blokadą wiersza pokoju, którą trzymają wszystkie funkcje dodające gracza albo zmieniające kolor.
- **Kolor przy wejściu:** `private.free_color(p_room_id)` — najniższy numer, którego nie ma nikt w pokoju; gdy zajęte wszystkie 20, `(liczba graczy) % 20`. Wołają ją `create_room` (host: 0), `join_room` i `admit_latecomer`, pod blokadą pokoju. Sygnatury tych trzech funkcji bez zmian (stary Worker działa dalej).
- **Zmiana koloru:** `public.set_player_color(p_room_id uuid, p_color integer, p_player_token text default null) returns jsonb`, `security definer`, grant `anon, authenticated` (publiczny punkt wejścia, wszystkie kontrole w środku). Gracz to host po `auth.uid()` albo gość po `sha256(token)` w `player_secrets` tego pokoju; token w złym formacie 22023, kolor spoza 0–19 albo null 22023. Blokada wiersza pokoju, potem odmowy: `room_unknown` (nie gracz tego pokoju), `room_closed`, `color_taken` (inny gracz pokoju ma ten kolor). Ten sam kolor drugi raz: `ok`. Działa w poczekalni i w trakcie gry.
- **Stan pokoju:** `room_lobby` (`create or replace`, lista argumentów bez zmian) daje graczowi `{nick, host, cohost, color}`. Stary parser Workera kopiuje tylko znane klucze, więc `db push` przed kodem jest bezpieczny.
- **Anonimowość:** kolor tylko na `players`, nigdy w `private.round_*`, `private.round_reactions` ani `private.question_stats`; logi bez koloru obok głosu.
- **Worker:** `LobbyPlayer.color: number` (całkowita 0–19, inaczej `players.color`); `seatColors` → `playerColors(players)` (mapa nick → `color`), pięć widoków bez innych zmian. Trasa `POST /api/rooms/[id]/color` (ciało `{color}`, sesja albo ciasteczko gracza jak `vote.ts:39-47`, `invalid_body`, dzwonek po sukcesie). `color_taken` w `ROUND_REFUSALS` (409) i `MESSAGES` („Ten kolor ktoś właśnie zajął.”).
- **Zapamiętany kolor:** klucz `mlt-color` w `localStorage` obok `mlt-nick`, zapis po przyjętym wyborze gracza (nie po kolorze nadanym przez grę). Po wejściu do pokoju ekran raz prosi o zapamiętany kolor, jeśli jest inny niż obecny i wolny na liście graczy; odmowa `color_taken` zostawia kolor nadany przez grę. Bez zmian w formularzach i w funkcjach wejścia.
- **Wybór koloru na ekranie:** własna kropka na liście „Gracze” (poczekalnia i głosowanie) staje się przyciskiem; paleta 20 kolorów z polskimi nazwami (`COLOR_NAMES`, dla czytnika ekranu), zajęte wyszarzone i nieklikalne. Wygląd: 2–3 warianty na zrzutach.
- **Testy:** nowy `tests/db/player-colors.test.ts` (jeden host, rejestracje 17 na przebieg, limit 30), pgTAP (kolumna, `check`, funkcja, granty, jedna wersja), `room-rpc-gate` (`set_player_color`), `room-state` i `chart` (kolor z bazy zamiast z miejsca), smoke (wybór koloru, zajęty kolor 409), e2e (gość wybiera kolor, drugi gracz go widzi; zajęty kolor nieklikalny). Próbny alarm: `set_player_color` przepuszcza zajęty kolor; `free_color` zawsze daje 0.
- **Dokumenty:** PRD FR-025 w trzech miejscach jak FR-024 (`prd.md:68`, lista FR, `:172`); słownik „kolor gracza” (zapisany, wybierany, pierwszy wolny przy wejściu, powtarza się od 21. gracza; nazwy `players.color`, `playerColors`, `set_player_color`, `free_color`); `test-plan.md` §6.2 (nowy plik, 17 rejestracji); komentarz i test `remembered-nick` (w przeglądarce nick i kolor).
- **Fazy (szkic):** 1 Baza (migracja, testy bazy, pgTAP, PRD, słownik, test-plan), 2 Serwer gry (parser, `playerColors`, trasa, odmowa, testy jednostkowe, smoke), 3 Ekrany (warianty na zrzutach → wybór Karola, wybór koloru, zapamiętany kolor, podglądy, e2e), 4 Wdrożenie (`db push` przed scaleniem, smoke na produkcji, gra z ekipą).
