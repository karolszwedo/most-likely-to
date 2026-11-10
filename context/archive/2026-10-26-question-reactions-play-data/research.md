---
date: 2026-10-26T08:09:53+01:00
researcher: Claude (Opus 5.5)
git_commit: d5b2d59ae1bda9f02d947fe958676416b9edd443
branch: question-reactions-play-data
repository: most-likely-to
topic: "S-11: gdzie i jak dodać kciuk na odsłonie oraz zbiorcze dane o pytaniach, nie łącząc gracza z niczym, co przetrwa rundę"
tags: [research, s-11, reakcja, odsłona, dane-o-pytaniach, finish_round, private, pgtap]
status: complete
last_updated: 2026-10-26
last_updated_by: Claude (Opus 5.5)
---

# Research: S-11 kciuki na odsłonie i zbiorcze dane o pytaniach

**Date**: 2026-10-26T08:09:53+01:00
**Researcher**: Claude (Opus 5.5)
**Git Commit**: d5b2d59ae1bda9f02d947fe958676416b9edd443
**Branch**: question-reactions-play-data
**Repository**: most-likely-to

## Research Question

Roadmapa S-11 (`context/foundation/roadmap.md:243-253`), PRD FR-016 i FR-018 (`context/foundation/prd.md:122,126`):
gracz jednym dotknięciem daje kciuk w górę lub w dół na ekranie odsłony (nieobowiązkowo, bez blokowania
prowadzącego), a gra zapisuje zbiorcze dane o każdym pytaniu: skupienie głosów, pominięcia, reakcje i usunięcia
z list przed startem. Dane wyłącznie zbiorcze i mają przetrwać skasowanie gry (FR-019, S-13). Pytanie badawcze:
w których miejscach dzisiejszego kodu i schematu to się wpina, jakie wzorce skopiować i czego nie wolno zrobić.

Zakres: stan obecny i ograniczenia. Bez emotek (FR-023, osobna zmiana), bez doboru pytań (S-12), bez listy gier (S-13).

## Summary

1. **Kciuk to nowa akcja gracza na wzór głosu**, ale bez dzwonka: przycisk w `RoundReveal.tsx` → `room-actions.ts`
   → nowy `POST /api/rooms/<id>/react` (kopia `vote.ts`) → nowe RPC (kopia tożsamości i sprawdzenia numeru pytania
   z `cast_vote`, `supabase/migrations/20261020205751_round_number_required.sql:87-225`). Nikt poza reagującym nie
   widzi kciuka (FR-018 tego nie wymaga), więc nie trzeba dzwonić (`ringLobby` budzi wszystkich tylko po to, by
   pobrali stan, `src/lib/rooms/server.ts:523-536`).
2. **Kciuk gracza żyje jak urna**: w nowej nielogowanej tabeli `private` bez uprawnień (wiersz: runda, gracz,
   kierunek), a przy zamknięciu odsłoniętej rundy zostaje **zsypany** do liczników pytania i usunięty. Wiersz per
   gracz i tak jest potrzebny (jeden kciuk na gracza, zmiana zdania). Bezpośrednie dopisywanie do licznika w
   transakcji gracza wymagałoby odejmowania przy zmianie zdania, a `xmin` licznika wskazywałby transakcję ostatniego
   reagującego (pułapka `xmin`: `context/archive/2026-10-13-first-live-round/research.md:99`). Zsyp robi transakcja
   prowadzącego („Następne pytanie”) albo sprzątania, więc liczniki nie niosą śladu gracza, a o gościu nie zostaje nic
   poza nickiem i głosami (PRD NFR).
3. **Liczniki pytań to nowa tabela bez kluczy obcych** do pokojów, rund i graczy, z kluczem `question_id`
   (`<kategoria>-<NNN>`, id nigdy nie wraca: `src/data/questions.ts:5-10`). W 8 sprawdzonych migracjach każda
   tabela wisi kluczem obcym na pokoju albo graczu (`rooms.host_id` → `auth.users` `…room_lobby.sql:21`, `players`
   `:36`, `player_secrets` `:50`, `rounds` `…first_live_round.sql:114`, `round_results` `:131-132`, urna `:142,150`,
   `join_requests` `…latecomer_admission.sql:41`, `game_questions` `…question_list_review.sql:48`), a żadna funkcja
   nie kasuje pokoju; to będzie pierwsza tabela globalna.
4. **Cztery punkty zaczepienia w bazie**, wszystkie w istniejących funkcjach:
   - odsłona: `private.finish_round` (`supabase/migrations/20261014101922_first_live_round.sql:182-213`); w ostatnich
     definicjach wołają ją tylko `cast_vote` (`…round_number_required.sql:220`) i `reveal_round` (`:285`, wyłącznie
     z fazy `voting`), więc w sprawdzonych ścieżkach biegnie raz na rundę;
   - pominięcie: `skip_round` (`supabase/migrations/20261015122252_full_game_evening.sql:140-203`), liczyć sam fakt,
     nigdy częściowej urny (decyzja D3, `context/archive/2026-10-15-full-game-evening/research.md:118-121`);
   - usunięcia z listy: `start_game` (`supabase/migrations/20261024094002_question_list_review.sql:400-471`), bo
     dopiero tu zbiór usuniętych jest ostateczny, a pokoje zamknięte w poczekalni nie liczą się;
   - zsyp kciuków: `next_round` (`…full_game_evening.sql:79-135`) i `private.drop_round_state`
     (`supabase/migrations/20261022132240_latecomer_admission.sql:69-84`), którą wołają `end_game`
     (`…full_game_evening.sql:238`), „Nowa gra” w `create_room` (`…first_live_round.sql:278`) i sprzątanie co
     godzinę (`supabase/migrations/20261014101925_close_stale_games.sql:33`).
5. **Statystyki tylko dla pytań z bazy w niezmienionym brzmieniu.** Runda pytania własnego albo poprawionego ma
   `rounds.question_id = null` (`…question_list_review.sql:437`, decyzja S-06: statystyki nie mieszają brzmień,
   `context/archive/2026-10-24-question-list-review/plan-brief.md:28`). Takie rundy nie zasilają liczników; ich
   kciuki są usuwane bez liczenia.
6. **Testy, które na pewno się zaczerwienią**: pgTAP `supabase/tests/round_creator_view.test.sql` (plan(150) `:31`,
   listy tabel i funkcji, skan tabel `private` bez kolumn czasu i identity `:366-385`), oracle RPC
   `tests/unit/room-rpc-gate.test.ts:33-133`, ewentualnie `REVEALED_ROUND_KEYS` w `tests/db/support/rounds.ts:132-140`
   i `ROUND_TABLES` w `tests/db/round-anonymity.test.ts:62`.

## Detailed Findings

### Ekran odsłony (klient)

- `RoundReveal.tsx` renderuje odsłonę; `RoomScreen.tsx:170-234` wybiera ekran po fazie, a każdy ekran rundy ma
  `key={view.round.number}` (`RoomScreen.tsx:190,204,221`), więc stan lokalny komponentu (np. wybrany kciuk) zeruje
  się z każdą nową rundą bez dodatkowego kodu i ginie przy przeładowaniu.
- Układ (`RoundReveal.tsx:92`, `flex flex-col gap-8`): (a) tytuł-pytanie `RoundQuestion` (`:93`); (b) region „Wynik”
  (`<section>` od `:95`, od `lg` siatka 2 kolumn: nagłówek z przełącznikiem Koło/Paski `:99-123`, koło, tabela,
  stopka „Wstrzymało się” `:183`); (c) tylko host: `HostActions` (`:191`), od `lg` przyklejony do dołu
  (`HostActions.tsx:83,133`). Szerokość kolumny: `room-frame.ts:19,35` (`max-w-lg`, od `lg` `lg:max-w-3xl`).
- Na odsłonie nie ma regionu „Gracze” (jest na głosowaniu, `RoundVoting.tsx:165-167`); e2e szuka tu regionu „Wynik”
  (`tests/e2e/support/round.ts:45`) i wymaga, by „Następne pytanie” było widoczne przy oknie `lg` o wysokości 400 px
  (`tests/e2e/game.spec.ts:93-102`).
- Miejsce na kciuk: osobny mały blok między (b) a (c). U gościa to koniec ekranu, u hosta tuż nad przyklejonym
  paskiem, więc go nie zasłania. Wzór kontrolki: przełącznik Koło/Paski, czyli `Button` z `aria-pressed` w
  `role="group"` (`RoundReveal.tsx:104-121`). W `src/components/ui` nie ma `toggle`/`toggle-group` (raport klienta).
  Emotki (FR-023) mogą później dostać własny blok obok; nagłówek „Wynik” jest już zajęty przełącznikiem.
- Spóźniony czekający na wpuszczenie nie widzi odsłony (`JoinWaiting.tsx:119`). Spóźniony wpuszczony w trakcie
  rundy widzi odsłonę gościa, ale nie ma go w `results` (wyniki obejmują `eligible`, `…first_live_round.sql:200-204`).

### Droga akcji (klient → Worker → baza), wzór: głos

- `RoundVoting.tsx:117-128` woła `onVote(target, round.number)`; wybór żyje tylko w pamięci komponentu (komentarz
  `RoundVoting.tsx:19-20`). `RoomScreen.act()` (`:138-149`) w podglądzie nie idzie do sieci, poza nim woła
  `sendRoomAction` i zawsze `refresh()`. Akcje zmieniające widok są w `VIEW_CHANGING` (`RoomScreen.tsx:94`:
  start, reveal, next, skip, end); kciuk nie może tam trafić, bo przeniósłby fokus.
- `room-actions.ts:16-29`: unia `RoomAction` (nowa akcja musi do niej dojść); `:47-72`: `POST` z JSON, kod odmowy →
  `roomErrorMessage`.
- Trasa `src/pages/api/rooms/[id]/vote.ts`: `refuseForeignPost` (`json-route.ts:39-50`), UUID, `readJsonBody` (4 KB),
  `bodyRound` (`json-route.ts:121-127`); gość to ciasteczko httpOnly `mlt_player_<roomId>` (`tokens.ts:31-45`), host to
  `context.locals.user`; potem `castVote` (`server.ts:325-339`) i `ringLobby` (`vote.ts:48`).
- `cast_vote` (`…round_number_required.sql:87-225`): format tokenu (`:111-113`), blokada pokoju (`:117-120`), host przez
  `auth.uid()` albo gość przez `player_secrets.token_hash` (`:126-135`), status pokoju (`:142-148`), najnowsza runda i
  `p_round` różny od niej → `round_over` (`:150-164`), faza (`:166-173`). Odmowy wracają jako `{ok:false, reason}`.
  Dla kciuka: runda najnowsza i `revealed`; po „Następne pytanie” spóźniony kciuk dostaje `round_over`, po końcu gry
  `room_closed`.
- Kody odmów: `ROUND_REFUSALS` i polskie teksty w `src/lib/rooms/errors.ts:10-29,37-73`, sprawdzane względem planów
  przez `tests/unit/room-errors.test.ts:87`. Nowy kod = zmiana w obu; ponowne użycie istniejących kodów nic nie rusza.
- Logi: `LOG_FIELDS` (`src/lib/log.ts:13-27`); `actionAnswer` loguje `{op, outcome, roomId, status}`
  (`json-route.ts:177-185`). Kierunek kciuka nie może trafić do `code` ani `outcome`.

### Stan pokoju

- `RevealedRound` (`src/lib/rooms/shared.ts:46-54`): `number, question_id, question_text, phase, results, abstained,
ballots`; bez `me_voted`. Parser kopiuje tylko klucze kontraktu (`parseRound`, `shared.ts:213-261`).
- Gdyby kciuk miał wracać po przeładowaniu, potrzebne jest nowe pole w gałęzi `revealed` funkcji `room_lobby`
  (ostatnia definicja `supabase/migrations/20261025122918_game_summary.sql:46`), w typie, parserze, podglądach i w
  `REVEALED_ROUND_KEYS` (`tests/db/support/rounds.ts:132-140`). Bez tego pola kciuk po przeładowaniu znika z ekranu,
  a ponowne dotknięcie nadpisuje poprzedni wybór (przy zapisie „ostatni wygrywa”).

### Cykl życia rundy w bazie

- `private.finish_round` (`…first_live_round.sql:182-213`, nigdy nie przedefiniowana): czyta `tally` i `abstained` z
  urny (`:192-194`), liczy `ballots` z `round_voters` (`:196-198`), wstawia `round_results` dla każdego uprawnionego, z
  zerami (`:200-204`), ustawia `phase='revealed'` (`:206-208`), kasuje urnę (`:210-211`). Biegnie w transakcji
  wołającego, pod blokadą pokoju. Te same liczby zostają po odsłonie w tabelach logowanych (`rounds.abstained`,
  `rounds.ballots`, `rounds.eligible`, `round_results.votes`), więc skupienie głosów da się policzyć bez dotykania
  urny.
- Odsłona z 0 głosów jest możliwa (host odsłania w dowolnej chwili; `coalesce` w `:207`).
- `skip_round` (`…full_game_evening.sql:140-203`): kasuje urnę, ustawia `skipped` (`:195-197`), otwiera następną
  rundę (`:199`). Pominąć można tylko rundę w fazie `voting`.
- `start_game` (`…question_list_review.sql:400-471`): host, pokój w `lobby`; przy liście pierwsza runda to pierwszy
  nieusunięty wpis, a `question_id` trafia do rundy tylko, gdy wpis nie ma własnego tekstu (`:435-445`).
- Statusy pokoju to `lobby | playing | closed` (`…first_live_round.sql:43`); każde wyjście z `playing` prowadzi do
  `closed` przez `end_game`, „Nowa gra” albo sprzątanie (sprzątanie: pokoje `playing` starsze niż 12 h, co godzinę,
  `close_stale_games.sql:17-42`). Runda porzucona przez sprzątanie zostaje w `voting` bez liczb.

### Tożsamość pytania i lista pytań gry

- `rounds.question_id` ma format `^[a-z0-9-]+-[0-9]{3}$` (`…first_live_round.sql:117`), od S-06 może być `null`
  (`…question_list_review.sql:72`); `(room_id, question_id)` jest unikalne (`…first_live_round.sql:125`), więc pytanie
  z bazy pada najwyżej raz na pokój.
- **Baza danych nie zna katalogu pytań**: sprawdza tylko format id; katalog i kategorie są w `src/data/questions.ts`
  (tylko serwer, `context/foundation/lessons.md`, „Pytania gry tylko po stronie serwera”).
- `private.game_questions` (`…question_list_review.sql:47-61`): `question_id` (null dla własnego), `text` (null dla
  niezmienionego z bazy), `removed`. `remove_list_question` (`:234-277`) działa tylko w poczekalni (`:260-262`), ustawia
  `removed = true` (`:271-273`) bez cofnięcia; usunięte id nie wraca w tej grze (`:210-217`, `:516-518`).
- Lista zostaje po zamknięciu pokoju z poczekalni (pgTAP `round_creator_view.test.sql:948-962`), więc liczenie usunięć
  w `remove_list_question` liczyłoby też gry, które nigdy nie wystartowały; liczenie przy `start_game` nie.

### Granice i uprawnienia

- Tabela osiągana tylko przez funkcje: RLS, `revoke all … from public, anon, authenticated`, bez grantów i polityk
  (wzory: `…room_lobby.sql:49-58`, `…first_live_round.sql:155-161`, `…question_list_review.sql:63-66`). Pomocnicze
  funkcje `private` to `security invoker`, `search_path=''`, bez `execute` dla ról (`…first_live_round.sql:786-787`).
- Urna: `ballot_boxes` i `round_voters` są `unlogged` w `private` (`…first_live_round.sql:141-153`); `round_voters`
  celowo bez klucza obcego do graczy.
- Skan pgTAP każdej tabeli `private`: żadnych grantów dla `anon`/`authenticated`, żadnej publikacji, żadnych kolumn
  daty/czasu, identity ani `nextval` (`round_creator_view.test.sql:366-385, :391-425, :693-700`). Nowe tabele w
  `private` nie mogą mieć `created_at` ani licznika `serial`.
- Żadna tabela nie jest w `supabase_realtime`; „dzwonek” to broadcast Workera (`src/lib/live-sync/server.ts:12-32`).

### Testy i strażniki do zaktualizowania

- pgTAP `supabase/tests/round_creator_view.test.sql`: `plan(150)` (`:31`), nagłówek obiektów (`:10-23`),
  `table_privs_are` (`:620-651`), `publication_of` (`:654-662`), `order_columns` (`:665-673`), `columns_are`
  (`:676-683`), skany (`:693-700`), `function_facts` (`:707-736, :793-812, :840-864`), jedna wersja funkcji
  (`:739-761, :815-834, :868-902`), scenariusze pozostałych wierszy: odsłona (`:906-917`), porzucona (`:921-942`),
  lista (`:948-962`), pominięta (`:968-993`), koniec (`:998-1030`), awaria (`:1037-1053`), sprzątanie (`:1058-1139`).
- `tests/unit/room-rpc-gate.test.ts`: `SQL_SIGNATURES` (`:33-133`, z komentarzem plik:linia migracji), `SUCCESS`
  (`:136-142`), `CASES` (`:177-316`); wymóg z `context/foundation/test-plan.md:145`: wiersz w tej samej zmianie co
  migracja, wyrocznia z SQL.
- `tests/db/round-anonymity.test.ts:62` (`ROUND_TABLES`, sprawdzenia PGRST106/PGRST205 `:66-89`): nowe tabele
  `private` tam należą. `tests/db/support/rounds.ts`: dokładne zestawy kluczy (`:114-146`) i opakowania RPC
  (`:169-283`).
- Podglądy: `/dev/room-states` (`src/pages/dev/room-states.astro`, pomocnik `revealed(…)` `:199-230`, sekcja odsłony
  `:1074-1205`) i `/dev/room-window` (`room-window.astro:136-158, :258-284`); flagi podglądu ekranu w `ScreenPreview`
  (`RoomScreen.tsx:28-36`). `scripts/ui-literals.mjs:7-18` skanuje cały `src/components/room/`, więc nowe pliki są
  objęte same.
- Wytyczne testów: `context/foundation/test-plan.md` §6.2 (`:147-211`: klucz publishable, jeden host na nowy plik,
  14 z 30 rejestracji zużyte `:186-188`, próba złamania strażnika raz na strażnik `:194-211`), §6.3 (`:213-244`:
  wyrocznia to PRD i D1, nowy klucz w odpowiedzi to droga wycieku), §6.5 (`:298-312`: nazwy kroków smoke nie
  zdradzają par, przełącznik `SMOKE_*` na okno starego Workera).

## Code References

- `src/components/room/RoundReveal.tsx:92-198` — układ odsłony; `:104-121` wzór dwóch przycisków `aria-pressed`
- `src/components/room/RoomScreen.tsx:94` — `VIEW_CHANGING`; `:138-149` `act()`; `:190,204,221` `key` rundy
- `src/components/room/room-actions.ts:16-29,47-72` — unia akcji i wysyłka
- `src/pages/api/rooms/[id]/vote.ts` — wzór trasy akcji gracza
- `src/lib/rooms/json-route.ts:39-50,121-127,165-185` — strażnik POST, `bodyRound`, statusy HTTP
- `src/lib/rooms/server.ts:325-339` — `castVote`; `:523-536` dzwonek
- `src/lib/rooms/errors.ts:10-29` — `ROUND_REFUSALS`
- `src/lib/rooms/shared.ts:46-54,213-261` — `RevealedRound`, parser
- `supabase/migrations/20261020205751_round_number_required.sql:87-225` — `cast_vote` (wzór RPC); `:238-297` `reveal_round`
- `supabase/migrations/20261014101922_first_live_round.sql:182-213` — `finish_round`; `:141-161` urna
- `supabase/migrations/20261015122252_full_game_evening.sql:79-135,140-203,207-242` — `next_round`, `skip_round`, `end_game`
- `supabase/migrations/20261022132240_latecomer_admission.sql:69-84` — `drop_round_state`
- `supabase/migrations/20261024094002_question_list_review.sql:47-61,234-277,400-471` — lista, usuwanie, `start_game`
- `supabase/migrations/20261014101925_close_stale_games.sql:17-42` — sprzątanie co godzinę
- `supabase/tests/round_creator_view.test.sql:31,366-385,620-700` — pgTAP
- `tests/unit/room-rpc-gate.test.ts:33-316` — oracle RPC

## Architecture Insights

- **Wzór „urna, która znika” pasuje do kciuka 1:1.** Stan per gracz tylko w nielogowanej tabeli `private` na czas
  odsłony, zsyp do liczb przy zamknięciu, kasowanie w tej samej transakcji. To zachowuje granicę D1
  (`context/archive/2026-10-13-first-live-round/research.md:277,284-297`) i AGENTS.md (stan w toku tylko w
  nielogowanych tabelach `private`, kasowany przy końcu rundy i przez sprzątanie). Kciuk nie jest parą „kto na kogo”,
  ale zsyp i tak jest potrzebny, bo o gościu ma zostać tylko nick i głosy.
- **Zsyp w transakcji prowadzącego.** `next_round` i `drop_round_state` biegną w transakcji hosta albo sprzątania, więc
  `xmin` wiersza z licznikami wskazuje na prowadzącego, nie na reagującego. Liczniki odsłony dopisywane w
  `finish_round` dzielą `xmin` z `round_results` tej samej transakcji (ostatni głosujący albo host); to nie dodaje
  informacji ponad to, co `round_results` już niesie (liczby bez głosujących).
- **Surowe sygnały zamiast oceny.** PRD odkłada wagi i progi do pierwszych wieczorów (`prd.md:201`, Open Q6), więc
  liczniki powinny trzymać sumy, z których S-12 policzy ocenę: liczba odsłon, suma głosów oddanych, suma wstrzymań,
  suma głosów na osobę z największą liczbą głosów (skupienie = ta suma / głosy oddane), pominięcia, kciuki w górę i w
  dół, usunięcia z list i liczba wystawień na liście wystartowanej gry (mianownik dla usunięć). Same liczby całkowite,
  bez kolumn czasu (skan pgTAP).
- **Tabela globalna to precedens.** Bez kluczy obcych do pokoju, rundy i gracza; S-13 kasuje pokój kaskadą, a liczniki
  zostają (FR-019, `prd.md:128`). Usunięcia z listy muszą być policzone przy `start_game`, zanim S-13 skasuje
  `game_questions`.
- **Kolejność wdrożenia: baza, potem kod** (`context/deployment/deploy-plan.md`). Zmiana jest addytywna dla starego
  Workera: nowe RPC i tabele; ciała `finish_round`, `skip_round`, `start_game`, `next_round`, `drop_round_state` dostają
  dopiski bez zmiany sygnatur (pgTAP wymaga jednej wersji funkcji).

## Historical Context (from prior changes)

- `context/archive/2026-10-15-full-game-evening/research.md:118-121` (D3) — pominięta runda zostaje tylko dla numeracji;
  „nie dane dla S-11”, które zbuduje własne zestawienia; głosy pominiętej rundy nie trafiają do żadnych danych, sygnałem
  jest samo pominięcie (interpretacja FR-006 „do potwierdzenia”). Obowiązuje.
- `context/archive/2026-10-24-question-list-review/plan-brief.md:28-31` — poprawione pytanie gra jako własne, bo
  statystyki S-11 nie mieszają brzmień; usunięcie to flaga, „S-11 może je policzyć”. Obowiązuje (potwierdzone w
  `…question_list_review.sql:437`).
- `context/archive/2026-09-27-starter-question-base/plan.md:49` — id `<kat>-<NNN>` nigdy się nie zmienia ani nie wraca,
  bo S-11 trzyma pod nim statystyki. Obowiązuje (`src/data/questions.ts:5-10`). `plan.md:34,197` przewidywał przeniesienie
  pytań do Supabase „w S-01 albo S-11”: częściowo nieaktualne, S-01 tego nie zrobił, a S-11 tego nie potrzebuje
  (liczniki działają na id tekstowym); decyzja przechodzi na S-12, jeśli dobór w bazie będzie jej wymagał.
- `context/archive/2026-10-13-first-live-round/research.md:99` — pułapka `xmin`: wpis i licznik w jednej transakcji
  łączą autora z treścią. Obowiązuje; stąd zsyp zamiast bezpośredniego licznika.
- `context/domain/02-invariant-aggregate-refactor.md:271` — odsłona rundy N+1 ze starego ekranu zapisałaby fałszywe
  „0 głosów” do danych S-11. Domknięte przez `reveal_round(p_room_id, p_round)` (`…round_number_required.sql:238-297`).
- `context/changes/refactor-opportunities/plan.md:386-421` — otwarte fazy 2–4: zakaz `localStorage`/`sessionStorage`/
  ciasteczek w `src` przez ESLint (kciuk w pamięci komponentu tego nie rusza) i krok smoke „Odsłoń wynik” w
  `scripts/smoke.mjs` (ten sam przepływ, co ewentualny krok kciuka; policzyć kroki na nowo).

## Related Research

- `context/changes/guest-vote-flow-analysis/research.md` — przepływ gościa od linku do głosu, ciasteczko, `me_voted`
- `context/archive/2026-10-13-first-live-round/research.md` — D1 i pułapki zapisu (xmin, DETAIL, logi)
- `context/archive/2026-10-24-question-list-review/research.md` — lista pytań gry

## Open Questions

Decyzje dla planu (każda ma rekomendację; żadna nie blokuje researchu):

1. **Kto może dać kciuk.** Rekomendacja: każdy gracz w pokoju na odsłonie, także host i spóźniony wpuszczony w tej
   rundzie (ocenia pytanie, nie wynik). Alternatywa: tylko uprawnieni z `eligible`.
2. **Zmiana zdania.** Rekomendacja: można przełączyć kciuk i zdjąć go drugim dotknięciem; liczy się stan przy zsypie.
3. **Kciuk po przeładowaniu.** Rekomendacja: bez nowego pola w stanie pokoju (tylko pamięć komponentu, jak wybór
   głosu); ponowne dotknięcie nadpisuje. Alternatywa: `my_reaction` w `room_lobby` (więcej zmian w kontrakcie i testach).
4. **Czy pokój widzi liczbę kciuków.** Rekomendacja: nie (FR-018 tego nie wymaga, bez dzwonka; reakcje „na pokaz” to
   emotki z FR-023).
5. **Które odsłony liczą się do skupienia.** Rekomendacja: każda odsłona zwiększa licznik odsłon, a sumy skupienia
   dostają tylko rundy z co najmniej 2 głosami na osoby (odsłona przy 0–1 głosie nic nie mówi o pytaniu).
6. **Usunięcia z listy.** Rekomendacja: liczone przy `start_game` dla wpisów z `question_id` i bez własnego tekstu;
   w tym samym miejscu licznik „wystawione na liście” jako mianownik.
7. **Kody odmów.** Rekomendacja: ponownie użyć istniejących (`round_over`, `room_closed`, `room_unknown`, `no_round`),
   bez nowego kodu w `errors.ts`.
8. **Zatrucie danych.** Host wołający RPC bezpośrednio może grać dowolne id o poprawnym formacie, więc liczniki można
   sztucznie zawyżać (baza nie zna katalogu). Rekomendacja: przyjąć świadomie przy skali ok. 100 osób i jednym twórcy
   gry; zapisać w planie jako ryzyko.
9. **Porzucone rundy** (sprzątanie przy `voting`): rekomendacja: nie liczyć w S-11.
