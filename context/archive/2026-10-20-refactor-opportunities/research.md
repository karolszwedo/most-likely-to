---
date: 2026-10-20T12:49:42+02:00
researcher: Claude (Opus 5.5)
git_commit: a17a8f5
branch: main
repository: CharlesOnTheWave/most-likely-to
topic: "Refactor opportunities: które problemy z analizy przepływu gościa warto naprawić, w jakim docelowym kształcie i w jakiej kolejności"
tags: [research, refactor-opportunities, rooms-server, sql-contract, refusal-codes, live-sync, tests, verified]
status: complete
last_updated: 2026-10-20
last_updated_by: Claude (Opus 5.5)
verified_commit: a17a8f5
last_updated_note: "Twierdzenia strukturalne sprawdzone ast-grep 0.51.0 (TS/TSX/JS) i grepem (SQL, .astro, każde zero) na a17a8f5; wyniki w sekcji „Weryfikacja twierdzeń (ast-grep)”, poprawki w miejscu w K1, K2, „Nowe ustalenia” i Code References."
---

# Research: refactor opportunities w przepływie gościa od linku do głosu

**Date**: 2026-10-20T12:49:42+02:00
**Researcher**: Claude (Opus 5.5)
**Git Commit**: a17a8f5 (lokalny, jeszcze nie na `origin`; kod aplikacji bez zmian od `06b025d`; kotwice to `plik:linia`, bez permalinków)
**Branch**: main
**Repository**: CharlesOnTheWave/most-likely-to

Etykiety: **[E]** evidence (kod, dokument decyzji, historia git), **[I]** inference, **[U]** unknown.
Wejście: `context/changes/guest-vote-flow-analysis/research.md` (dalej „analiza M4L3”), jej ustalenia przyjęte jako
dowody. Priory: `context/map/repo-map.md`, `context/archive/*/`, `context/foundation/test-plan.md`, `lessons.md`.
Trzy perspektywy tylko do odczytu (subagenci): obecny kształt, historia i intencjonalność, wykonalność migracji.
Niczego nie uruchamiano (testy, build, CLI Supabase, sonda). Twierdzenia strukturalne sprawdzono po napisaniu raportu
(ast-grep i grep, HEAD a17a8f5): sekcja „Weryfikacja twierdzeń (ast-grep)”.

## Research Question

Które problemy zapisane w analizie M4L3 warto naprawić, w jakim docelowym kształcie i w jakiej kolejności? Wynik to
ranking opcji z trade-offami. Bez refaktoru i bez decyzji: decyzja zapada w `/10x-plan refactor-opportunities`.

## Lista problemów i klasyfikacja

KANDYDAT = problem, którego naprawa zmieniłaby strukturę kodu. Pozostałe są wejściem do oceny wykonalności i kosztu.

| # | Problem (analiza M4L3) | Skąd | Klasa | Dlaczego |
| --- | --- | --- | --- | --- |
| P1 | Nazwy RPC i argumenty `p_*` jako stringi, kopie w testach, brak typów bazy | D1 | **KANDYDAT K1** | kontrakt bramy TS↔SQL |
| P2 | Ręczne typy odpowiedzi, walidacja w runtime, parser gubi nieznane klucze | D2 | **KANDYDAT K2** | kontrakt kształtu odpowiedzi |
| P3 | Kody odmów SQL ↔ `MESSAGES` ↔ lista w teście; `not_signed_in` bez komunikatu | D3 | **KANDYDAT K3** | kontrakt kodów |
| P4 | Wzorce tokenów w TS, SQL i smoke | D4 | **KANDYDAT K4** | kontrakt wartości |
| P5 | Kopia kontraktu dzwonka w sondzie | D5 | **KANDYDAT K5** | kontrakt nazw kanału |
| P6 | Gałęzie awarii bez testu (`server.ts:57-104`, `vote.ts`, `join.ts`, 404 w `useRoomState.ts`) | D6 | luka testowa | kształt bez zmian |
| P7 | Zasada „wybór tylko w pamięci” bez strażnika | D7 | brak osłony | kształt już docelowy (Hard Rule anonimowości), brak tylko strażnika |
| P8 | Smoke w CI bez Realtime | D8 | luka testowa (konfiguracja CI) | |
| P9 | Sprzężenia „tanie”: sygnatura `cast_vote`, tabele `private`, zbiory kluczy `room_lobby`, `{ok:true}`, eksporty i typy, pola logu, reguła migracji | „Dług tani” | już osłonięte | wejście: istniejące osłony |
| P10 | Luki testów na ścieżce: przeładowanie w głosowaniu, głos bez ciasteczka lub ze złym przez HTTP, podwójny głos przez HTTP/UI, walidacja nicku w `JoinForm`, `cast_vote` w zamkniętym pokoju, utrata ciasteczka → `nick_taken`; częściowo: atrybuty ciasteczka, `invalid_nick` tylko w bazie, `/r/` po przeładowaniu tylko na odsłonie | „Luki w testach” | luki testowe | |
| P11 | Wyjątek 22023 → `unexpected` bez testu | Ścieżki błędów, OQ5 | luka testowa (część P6) | |
| P12 | Po odświeżeniu ekran nie wie, na kogo gość głosował | „Stan po odświeżeniu”, OQ1 | **pojęcie biznesowe → stop** | decyzja produktowa S-04 w granicach Hard Rule anonimowości, nie struktura kodu |
| P13 | Utrata ciasteczka zamyka drogę do własnego nicku | „Stan po odświeżeniu” | **pojęcie biznesowe → stop** | tożsamość gracza bez konta to pojęcie domeny |
| P14 | Ładunek dzwonka `{seq}` nieczytany na ekranie pokoju | Summary, krok 22 | znalezisko, dołączone do K5 | |
| P15 | Czy logi Supabase/PostgREST/Cloudflare zapisują cel głosu | OQ2 | unknown (zewnętrzne) | poza kodem |
| P16 | Czy rekordy pokoi i graczy są kasowane | OQ4 | produkt (S-13) | |
| P17 | Komentarz `server.ts:7-9` wskazuje złą migrację | stopka „Priory z mapy” | luka w dokumentacji | |
| P18 | Korekty mapy (`announce.ts`, kopie RPC w testach, „14 wejść”) | Summary, „Priory z mapy” | luka w dokumentacji (mapa) | |
| P19 | Sprzężenie TS↔SQL widoczne tylko jako sekwencja faz; para `server.ts`↔`shared.ts`; huby `tokens.ts`, `RoomLobby.tsx` | „Historia zmian” | hotspot, wejście do blast radius | analiza nie wskazuje kosztu; parę pilnuje `astro check` |
| P20 | Push na `main` wdraża mimo czerwonego CI | uwaga pod tabelą długu | proces (test-plan Faza 4) | |

Wynik: 5 kandydatów (K1–K5 = D1–D5), 15 nie-kandydatów, w tym 2 zatrzymane na granicy pojęć biznesowych (P12, P13).

## Summary

- **Pięciu kandydatów to jedna rodzina:** ręcznie utrzymywane kopie kontraktu na granicy TS↔SQL (K1–K4) i
  skrypt↔`src` (K5). Historia pokazuje, że kopie są w większości **świadome i nośne**: testy db celowo wołają bazę
  „drzwiami atakującego” z niezależną wyrocznią (`context/archive/2026-10-10-testing-lobby-foundation/plan.md:85`,
  `test-plan.md:140`), SQL celowo powtarza walidację, bo funkcje dla `anon` omijają Workera
  (`supabase/migrations/20261007122858_room_lobby.sql:8-10`), parser celowo gubi nowe klucze, bo na tym stoi kolejność
  wdrożeń „baza, potem kod” (`context/archive/2026-10-13-first-live-round/plan.md:32`), a sonda celowo kopiuje stałe
  (`context/archive/2026-09-27-live-sync-spike/plan.md:365`). [E]
- **Wniosek z historii:** przebudowa do „jednego źródła prawdy” zniosłaby te gwarancje. Adekwatny kształt dla
  wszystkich pięciu to **strażnik, nie przebudowa**. Gra zostaje Transaction Scriptem (trasa API = jedno żądanie,
  reguły w SQL). [I]
- **Brak wygenerowanych typów bazy:** decyzji nigdzie nie zapisano (**unknown**). Zysk byłby mały: 10 z 10 RPC
  wołanych przez `server.ts` zwraca `jsonb` (`first_live_round.sql:227,309,385,541,724`;
  `full_game_evening.sql:80,141,208,261,404`), więc typy odpowiedzi wyszłyby jako `Json`. [E/I]
- **Nowe twarde ustalenie:** ścieżki Workera dla „Odsłoń wynik” (`revealRound`, `src/lib/rooms/server.ts:260-263`)
  nie wywołuje żaden ze sprawdzonych testów CI: smoke woła start, 6× vote, next, skip i end (`scripts/smoke.mjs:270-323`),
  e2e kończy rundę ostatnim głosem i „nikt nie naciska »Odsłoń wynik«” (`tests/e2e/round.spec.ts:48-49`), a testy db
  wołają `reveal_round` własną kopią nazwy (`tests/db/support/rounds.ts:114`, `round-rules.test.ts:213`). [E] Literówka
  w nazwie albo zmiana parametru w SQL bez poprawki Workera przeszłaby wszystkie joby. [I]
- **Ranking:** ① K1 strażnik bramy RPC, ② K3 strażnik kodów odmów, ③ K2 strażnik parsera wobec zbiorów kluczy.
  Odrzucone jako refaktor: K4, K5 i wariant K1 „wygenerowane typy”. Zatrzymane na granicy pojęć biznesowych: P12, P13 i
  los `seq` w dzwonku (zakres prototypu F-01).

## Kandydaci

### K1 (D1): kontrakt bramy RPC, nazwy i argumenty `p_*`

**Obecny kształt**
- [E] 10 funkcji, aktualne definicje: `create_room`, `join_room`, `room_link`, `start_game`, `reveal_round`
  (`first_live_round.sql:220,308,384,540,723`); `next_round`, `skip_round`, `end_game`, `cast_vote`, `room_lobby`
  (`full_game_evening.sql:79,140,207,255,403`).
- [E] Każda funkcja opakowująca w `server.ts` łączy nazwę RPC (string), mapowanie pól na `p_*`, walidację kształtu,
  przepuszczenie odmowy i mapowanie wyniku. Nazwa występuje 2–4 (raport: 2–3) razy, bo jest też etykietą w `unexpectedShape` i
  `actionResult` (np. `create_room`: `server.ts:115,125,133`). `callRpc` (`server.ts:82-98`) to transport, logowanie
  (`:57-63`) i zamiana awarii na `service_unavailable`/`unexpected`.
- [E] Kopie nazw w testach: 9 (raport: wszystkie 10) w `tests/db/support/rounds.ts:91-144`, bez `create_room`; dalej `rooms.ts:49,75,92`,
  `roles.test.ts`, `nicks.test.ts:40`, `canary.test.ts:20`; pgTAP `supabase/tests/round_creator_view.test.sql`
  odwołuje się do 8 z 10 funkcji (bez `room_link` i `room_lobby`).
- [E] Różnice argumentów są świadome, nie są dryfem: `create_room` trzyma `p_link_token`, którego nie używa
  (komentarz `first_live_round.sql:218-219`), a Worker go wysyła (`src/pages/api/rooms/index.ts:40`); `cast_vote` ma
  `p_player_token default null` (`full_game_evening.sql:258`), helper testów pomija go dla hosta (`rounds.ts:108`),
  Worker wysyła zawsze (`server.ts:253`).
- [E] Nie ma modułu nazw RPC ani wygenerowanych typów (`tests/db/support/clients.ts:18`, brak `SupabaseClient<Database>`).
- [E] Testy db już importują z `src/` (generatory tokenów, `clients.ts:9`; `@/data/questions` w `rooms.ts:1`,
  `rounds.ts:1`; alias w `vitest.config.ts:11`).

**Historia i intencja: werdykt mieszany**
- Kopie nazw w testach: **świadome ograniczenie**. „Drzwi atakującego, nie Workera” (`testing-lobby-foundation/plan.md:85`,
  `clients.ts:4`, 4c50599); testy przed kodem z nazwami z planu (`first-live-round/plan.md:86`, `:172`;
  `full-game-evening/plan.md:97`, `:113`); wyrocznia „nigdy z implementacji” (`test-plan.md:140`). [E]
- Nazwy i parametry to kontrakt między wdrożeniami „baza, potem kod”: `p_link_token` zostaje dla starego Workera
  (`first-live-round/research.md:344`, `plan.md:295`), starą `cast_vote` usuwa `full_game_evening.sql:246-248`, audyt
  G1 ostrzega przed PGRST202 (`context/audits/observability/2026-10-11_guest-join-live-lobby.md:78`). [E]
- Brak typów: **unknown**, żadnego zapisu decyzji w `context/`, `AGENTS.md`, `package.json` ani CI. [I] Sprzyjały mu
  brak Dockera lokalnie i jeden projekt Supabase, który jest produkcją.
- Jeden historyczny błąd z rozjazdu TS↔SQL: `p_round integer` kontra liczby do 2^53 → 500
  (`full-game-evening/reviews/impl-review.md:60-68`, F1; naprawa 8e76b01 `MAX_ROUND`). [I] Typy z `gen types` dałyby
  `number`, więc by go nie złapały.

**Wykonalność**
- Osłony dziś: smoke i e2e w CI (bez ścieżki Workera dla `reveal_round`, Summary), `db` i pgTAP na własnych kopiach;
  lokalnie nic. [E]
- (a) Istniejąca abstrakcja: test unit z atrapą klienta `{ rpc(fn, args) }`, który dla 10 funkcji opakowujących
  zapisuje nazwę i klucze argumentów; oczekiwania ręcznie z sygnatur SQL (wzór: `PLANNED_ROUND_REFUSALS`,
  `tests/unit/room-errors.test.ts:17-21`). `server.ts` nie importuje `astro:*` ani `src/lib/supabase.ts` [E], ESLint
  pozwala testom na importy typów supabase-js (`eslint.config.js:94-109`) [E], więc import w projekcie `unit` jest
  wykonalny [I]. 1 plik w `tests/unit/` (tylko PR), koszt mały, jeden revert.
- (b) Plik w `tests/db` wołający funkcje z `server.ts` prawdziwą bazą: +1 host w budżecie rejestracji (§6.2), próbny
  alarm wymaga push gałęzi (ask). Koszt mały do średniego.
- (c) Nowa abstrakcja `supabase gen types --local`: tylko w CI (Docker), job `db` startuje z `-x …postgres-meta…`
  (`.github/workflows/ci.yml:94`), czy generator wtedy działa: [U]; połączony projekt to produkcja
  (`context/deployment/deploy-plan.md:47`); odpowiedzi jako `Json`. Koszt duży, zysk mały.
- Ta sama atrapa obsłuży gałęzie awarii z P6 (`server.ts:57-104`), więc koszt jest dzielony. [I]
- **Pierwszy krok-prerekwizyt:** test charakteryzujący (a) utrwalający dzisiejsze nazwy i klucze `p_*` 10 wywołań
  (z warunkowym `p_round`, `server.ts:253`).

### K2 (D2): ręczne typy odpowiedzi i parser

**Obecny kształt**
- [E] Źródło kształtu: `room_lobby` (`full_game_evening.sql:463-515`), wynik `create_room` (`first_live_round.sql:300`).
  Typy: `server.ts:22-35`, `src/lib/rooms/shared.ts:20-59`. Parsery: `parseLobbyState` (`shared.ts:166-185`) i
  `parseRoomView` (`:189-201`, woła go wyspa `useRoomState.ts:206`). Ręczne sprawdzenia w
  `server.ts:125-133,141-149,164-168,227-231,349-352`. Zbiory kluczy w `tests/db/support/rounds.ts:59-68`.
- [E] `shared.ts` łączy stałe (`:4-6`), typy kontraktu, parser i teksty UI (`:205-217`). Parser jest zarazem
  strażnikiem anonimowości: kopiuje tylko klucze kontraktu (`:119-121`), przy pominiętej rundzie odrzuca każdy
  dodatkowy klucz (`:126-128`).
- [E] `isRecord` w 4 kopiach: `server.ts:37`, `shared.ts:79-93` (z `isStringList`), `src/components/room/room-actions.ts:16`,
  `tests/db/support/rooms.ts:11`. zod nie jest bezpośrednią zależnością (tylko przechodnio przez `astro`).

**Historia i intencja: świadome ograniczenie (decyzja nośna)**
- Walidacja od 77860b8, przebudowana po audycie (P6, L4) w `first-live-round/plan.md:392-403`. [E]
- „parseLobby ignoruje dodatkowe pola… To podstawa kolejności wdrożenia »baza, potem kod«” (`first-live-round/plan.md:32`,
  `:766`); parser odrzuca nieznaną fazę, więc wycofanie kodu jest bezpieczne do pierwszej rundy `skipped`
  (`full-game-evening/plan.md:41`, `:553`). [E]
- Decyzja D3 (pominięta runda bez liczb) potwierdzona w `full-game-evening/research.md:118-121`, `:146` i
  `full-game-evening/reviews/impl-review.md:42`. [E] Błędów z tej kopii nie znaleziono.
- [I] Parser chroni przed rozjazdem części wdrażanych osobno (baza, Worker, stara karta przeglądarki); typy kompilacji
  tego nie widzą.

**Wykonalność**
- Osłony: `tests/unit/room-state.test.ts:61-188` (raport: 61-187) (lokalnie i CI; `:175` obcy klucz odpada); job `db` porównuje dokładne
  zbiory kluczy z `*_KEYS` (`rounds.ts:57-68`, §6.3). [E] Cichy przypadek [I]: PR zmienia SQL i `*_KEYS`, a parsera nie,
  więc nowe pole ginie na ekranie; złapie to najwyżej e2e tej funkcji, w CI.
- Docelowy kształt: zostaje ręczny kontrakt z białą listą w runtime; dochodzi strażnik unit „każdy klucz z `*_KEYS`
  przechodzi przez parser”. `rounds.ts` importuje supabase-js przez `clients.ts`, więc czystsza droga to moduł z samymi
  danymi (wzór `tests/db/support/nick-pairs.ts`) [I]; czy obecny import jest nieszkodliwy w `unit`: [U].
- 1–2 pliki w `tests/` (tylko PR), produkcja nietknięta, koszt mały, jeden revert.
- **Pierwszy krok-prerekwizyt:** test charakteryzujący parser na pełnej próbce zbudowanej z `*_KEYS`.

### K3 (D3): kody odmów

**Obecny kształt**
- [E] Kody powstają w SQL (aktualne definicje: `create_room` `first_live_round.sql:240-297`, `join_room` `:327-371`,
  `start_game` `:561-581`, `reveal_round` `:744-760`; `next_round`, `skip_round`, `end_game`, `cast_vote`
  `full_game_evening.sql:100-130,162-192,226-234,291-359`; `room_link` i `room_lobby` bez `reason`) oraz w TS
  (`service_unavailable`/`unexpected` `server.ts:61,103`, `invalid_body` `src/pages/api/rooms/[id]/next.ts:26`,
  `invalid_categories` `api/rooms/index.ts:27`, `no_questions` `[id]/start.ts:30`, `not_found` `json-route.ts:137`).
- [E] Kopie kodów: `MESSAGES` (`src/lib/rooms/errors.ts:22-43`, 18 kluczy), `ROUND_REFUSALS` (`errors.ts:7-18`), listy w
  teście (`tests/unit/room-errors.test.ts:8-15`, `:21-32`), `statusFor` (`json-route.ts:118-124`), smoke
  (`smoke.mjs:198,245,432`), oczekiwania w testach db.
- [E] `RoomFailure.reason: string` (`server.ts:15`), `MESSAGES: Record<string, string>`; typ `RoundRefusal`
  (`errors.ts:20`) nie ma użyć w `src` ani `tests` (grep).
- [E] Kod spoza `MESSAGES` dostaje „Coś poszło nie tak.” (`errors.ts:45-49`). Teksty trafiają na ekran przez
  `src/pages/index.astro:15`, `j/[token].astro:60,78`, `r/[id].astro:69`, `room-actions.ts:26`.
- [E] Różnice: migracje (wszystkie wersje, grep) mają 18 różnych literałów `'reason'`; `MESSAGES` ma 17 z nich plus
  `service_unavailable` (z TS); brakuje `not_signed_in` (`room_lobby.sql:151`, `first_live_round.sql:240`). Test nie zna
  `not_signed_in`, `invalid_categories`, `open_room_has_guests`, `try_again` i porównuje `ROUND_REFUSALS` z ręczną listą
  „z planów” (`room-errors.test.ts:17-21`), nie z SQL.
- [I] `not_signed_in` dotrze na ekran tylko wtedy, gdy sesja wygaśnie między `api/rooms/index.ts:16` a wywołaniem RPC;
  `/?error=not_signed_in` pokaże wtedy tekst ogólny.

**Historia i intencja: werdykt mieszany**
- Tekst ogólny dla nieznanego kodu: **świadome** (`context/archive/2026-10-07-room-lobby/plan.md:270`; powód w
  `errors.ts:1-3`: tekst z `?error=` nie trafia na ekran). [E]
- Ręczna lista w teście: **świadome** (wyrocznia z planów, `test-plan.md:140`; komentarz `room-errors.test.ts:17-20`;
  lista gości z F4, 5c92030). [E]
- Audyt G2 (`audits/observability/2026-10-11_guest-join-live-lobby.md:79`) zalecił tekst dla każdego kodu i ostrzeżenie
  dla kodu spoza `MESSAGES`; wdrożono tylko tekst (`first-live-round/plan.md:417-424`, 90e3b7c). Odrzucenia ostrzeżenia
  nie znaleziono: **unknown**.
- `not_signed_in` jest w kontrakcie od S-01 (`room-lobby/plan.md:174`), a ten sam plan pomija go w `MESSAGES` (`:270`)
  bez zapisanego powodu: **unknown** ([I] nieosiągalny przez Workera).
- Pokrewne: F5, `no_questions` znaczy co innego na starcie i w trakcie wieczoru, odroczone
  (`full-game-evening/reviews/impl-review.md:100-108`). To drobna decyzja o tekście, nie przebudowa pojęć.

**Wykonalność**
- Osłona dziś: `room-errors.test.ts` (lokalnie i CI) sprawdza tylko ręczną listę; SQL z `MESSAGES` nie porównuje nic. [E]
- Docelowy kształt: tekst ogólny zostaje; dochodzi strażnik unit czytający `supabase/migrations/*.sql` (precedens skanu
  tekstu: `scripts/ui-literals.mjs:4,26` w `npm run lint`), który sprawdza, że każdy kod `'reason'` dostaje tekst inny
  niż ogólny. To dokładnie przykład asercji z `test-plan.md:141`. Wyrocznią są migracje, inny artefakt niż `errors.ts`,
  więc §6.1 to dopuszcza. [I]
- Pułapki: stare definicje zostają w tekście migracji (kod usunięty później nadal „istnieje”), więc potrzebna jawna
  lista wyjątków z uzasadnieniem; wzorzec, który nic nie złapie, da fałszywą zieleń, więc kontrola pozytywna
  (`test-plan.md:154`) i próbny alarm (`:190`). Hooki agenta nie uruchamiają unitów po zmianie samego `.sql`
  (`.claude/hooks/lib.mjs:15`), więc sygnał przyjdzie z `npm test` albo CI. [E]
- `tests/unit/` i ewentualnie 1 wpis w `errors.ts` (oba tylko PR), bez migracji, koszt mały, jeden revert.
- **Pierwszy krok-prerekwizyt:** decyzja właściciela o `not_signed_in` (własny tekst albo wyjątek z uzasadnieniem):
  to wyrocznia strażnika.

### K4 (D4): wzorce tokenów

- **Kształt [E]:** gracz `{43}`: `tokens.ts:11` (sprawdzany w `vote.ts:41`), SQL `first_live_round.sql:322`,
  `full_game_evening.sql:279,438`; link `{22}`: `tokens.ts:6` (`join.ts:14`, `j/[token].astro:26`), CHECK
  `room_lobby.sql:23`, `first_live_round.sql:326,395`, generator SQL `:282-286`, smoke `smoke.mjs:194,196,198,245`.
  Starsze wystąpienia leżą w nadpisanych definicjach (`room_lobby.sql:218,329`, `first_live_round.sql:460,617`).
  Jedyne powiązanie to komentarze „the database checks the same pattern” (`tokens.ts:5,9`).
- **Intencja: świadome, obrona w głąb w obie strony.** SQL: `room_lobby.sql:8-10` i reguła w `AGENTS.md` (6dbfedd),
  plan S-01 `room-lobby/plan.md:181`; potwierdził to błąd F1 z S-01, gdy reguła żyła tylko w Workerze
  (`room-lobby/reviews/impl-review.md:29-46`). TS: filtr przed bazą (`tokens.ts:9-10`,
  `first-live-round/reviews/impl-review.md:62`, 90e3b7c). Smoke: „Zero dependencies on purpose” (`smoke.mjs:2`, starter
  237a297), wzorce bez osobnego uzasadnienia. Błędów z rozjazdu nie znaleziono. [E]
- **Wykonalność:** seed `db` używa generatorów Workera (`clients.ts:9`), smoke i e2e chodzą prawdziwym linkiem;
  `tokens.ts` nie ma testu unit. [E] Jedno źródło w SQL to nowa migracja przepisująca kilka funkcji i `db push` [I];
  import `tokens.ts` w smoke łamie „zero dependencies” i niezależność wyroczni. Tani strażnik: test unit generatorów
  wobec wzorców (wyrocznia 16 i 32 bajty → 22 i 43 znaki, `tokens.ts:21,26`), 1 plik.

### K5 (D5): kontrakt dzwonka w sondzie

- **Kształt [E]:** `scripts/live-sync-probe.mjs:11-13` („Mirrors”) obok `src/lib/live-sync/shared.ts:3-4`. Komentarz
  `shared.ts:1` twierdzi, że moduł jest wspólny z sondą, a sonda importuje tylko `@supabase/supabase-js` (`:9`).
  `ringRoom` (`live-sync/server.ts:12-32`) obsługuje dwa kontrakty: prototyp F-01 (`api/live-sync/ring.ts:24`, wymaga
  `seq`) i dzwonek pokoju (`rooms/server.ts:369`, `seq = Date.now()`). `seq` czyta ścieżka prototypu
  (`LiveSyncDemo.tsx:62-64`, `api/live-sync/state.ts:10-15`, sonda `:137,141,147`), ekran pokoju nie
  (`useRoomState.ts:286-288`). Sonda: `npm run live-probe` (`package.json:17`), poza CI.
- **Intencja: świadome ograniczenie, uznane po fakcie.** Przegląd F6 (`live-sync-spike/reviews/impl-review.md:160-171`)
  → odstępstwo zapisane w `live-sync-spike/plan.md:365` (3746df6): skrypt `.mjs` nie importuje TypeScriptu z `src/`.
  [I] Uzasadnienie częściowo nieaktualne: repo uruchamia `.ts` czystym Node (`tests/db/support/print-nick-pairs.ts:1,7`);
  czy działa na Node 22.14 z `.nvmrc` bez flagi: [U]. Cel `seq` w dzwonku pokoju nie jest zapisany
  (`room-lobby/plan.md:267`): [U], [I] pozostałość po spike'u.
- **Granica:** czy `seq` zostaje, zależy od tego, czy prototyp F-01 i `/api/live-sync/*` mają żyć dalej (strona dev daje
  404 na produkcji, `src/pages/dev/live-sync.astro:10-13`, API zostaje). To decyzja o zakresie produktu: stop.
- **Wykonalność:** (a) test unit: import `shared.ts` i odczyt tekstu sondy przez `fs`, porównanie literałów (sondy nie da
  się zaimportować, wykonuje się od razu); (b) sonda importuje `../src/lib/live-sync/shared.ts` (plik bez importów),
  nie do sprawdzenia bez uruchomienia sondy na produkcji. 1 plik, koszt mały, wartość niska: przy rozjeździe sonda
  pokaże fałszywy FAIL F-01 [I]. P8 (smoke bez Realtime) lekko podnosi wartość (a).

## Nowe ustalenia względem analizy M4L3

1. Ścieżki Workera dla „Odsłoń wynik” nie wywołuje żaden ze sprawdzonych testów CI (Summary). [E]
2. Każda nazwa RPC występuje w `server.ts` 2–4 (raport: 2–3) razy (wywołanie i etykiety), np. `create_room` `:115,125,133`. [E]
3. Różnice argumentów (`p_link_token`, `p_player_token`) są świadomą zgodnością wdrożeń, nie dryfem. [E]
4. Typ `RoundRefusal` nie ma użyć; test kodów porównuje z planami, nie z SQL, i nie zna 4 kodów (K3). [E]
5. `isRecord` w 4 kopiach (K2). [E]
6. Komentarz `live-sync/shared.ts:1` jest nieprawdziwy: sonda kopiuje stałe. [E]
7. `ringRoom` obsługuje dwa kontrakty; `seq` czyta tylko ścieżka prototypu F-01. [E]
8. Hooki agenta nie uruchamiają unitów po zmianie samego `.sql` (`.claude/hooks/lib.mjs:15`). [E]
9. Zalecenie audytu G2 wdrożono w połowie: bez ostrzeżenia dla kodu spoza `MESSAGES` i bez linii logu przy `join`. [E]

## Refactor opportunities (ranked)

Wspólne tło: w żadnym z pięciu kandydatów nie znaleziono przypadkowej złożoności, której koszt rośnie na tyle, by
uzasadnić przebudowę; kopie są nośne (niezależna wyrocznia, obrona w głąb, kolejność wdrożeń, prywatność). [I] Ranking
porządkuje więc strażników według relacji kosztu długu do kosztu zmiany. Każdy wchodzi do `tests/`, czyli tylko przez PR
i zielone CI (`AGENTS.md`).

### 1. K1: strażnik bramy RPC (nazwy i argumenty Workera)

- **Obecny → docelowy kształt:** 10 funkcji opakowujących z nazwą RPC i kluczami `p_*` jako stringami, sprawdzanych
  tylko w CI przez smoke i e2e, bez ścieżki „Odsłoń wynik” → ten sam ręczny kontrakt plus lokalny test unit z atrapą
  klienta, który dla każdej z 10 funkcji sprawdza nazwę RPC i zbiór kluczy argumentów wobec ręcznej listy z sygnatur SQL.
- **Dlaczego #1:** jedyny kandydat z potwierdzoną dziurą, którą dziś przechodzą wszystkie joby (`reveal_round` przez
  Workera); skutkiem rozjazdu jest zepsuta akcja hosta na produkcji, a nie tylko zły tekst. Zmiana to 1 plik w
  `tests/unit/`, zero kodu produkcyjnego; daje pierwszy lokalny sygnał dla `server.ts`, którego dziś nie importuje żaden
  test (analiza M4L3, C16); ta sama atrapa otwiera tanie testy gałęzi awarii (P6). Koszt długu: średni (zmiany rzadkie,
  awaria głośna). Koszt zmiany: mały.
- **Blast radius:** kod produkcyjny nietknięty. Test importuje `server.ts` (12 importerów runtime w `src`, analiza M4L3
  C15), więc zmiana sygnatur funkcji opakowujących będzie wymagała poprawki testu.
- **Szkic ścieżki:** (1) test charakteryzujący utrwala dzisiejsze nazwy i klucze 10 wywołań; (2) próbny alarm:
  literówka w `reveal_round` daje czerwony unit (`test-plan.md:190`); (3) osobno i opcjonalnie: ścieżka Workera dla
  „Odsłoń wynik” w CI (krok smoke albo plik `tests/db` przez funkcje `server.ts`), co wymaga push gałęzi (ask) i budżetu
  rejestracji; (4) wygenerowane typy dopiero wtedy, gdy 1–3 nie wystarczą.
- **Pierwszy krok-prerekwizyt:** spisać z aktualnych definicji SQL listę 10 nazw i ich parametrów jako wyrocznię testu.

### 2. K3: strażnik kodów odmów (SQL ↔ `MESSAGES`)

- **Obecny → docelowy kształt:** kody w SQL i TS, teksty w `MESSAGES`, test porównuje ręczną listę z planami, nowy kod
  daje tekst ogólny bez żadnego sygnału → test unit czytający migracje: każdy kod `'reason'` ma tekst inny niż ogólny,
  z jawną listą wyjątków z uzasadnieniem i kontrolą pozytywną. Tekst ogólny zostaje (świadomy).
- **Dlaczego #2:** jest żywy przypadek (`not_signed_in`) i w połowie wdrożone zalecenie audytu G2; S-04 i kolejne
  slice'y dopiszą kody [I]; asercja to przykład z `test-plan.md:141`. Niżej niż K1, bo skutkiem jest zły tekst (UX), a
  jedyny dzisiejszy brak jest [I] nieosiągalny przez Workera; przed testem potrzebna jest decyzja właściciela. Koszt
  zmiany: mały.
- **Blast radius:** `tests/unit/` i ewentualnie 1 wpis w `errors.ts` (`src/lib/rooms/`); migracje nietknięte.
- **Szkic ścieżki:** (1) decyzja o `not_signed_in`; (2) strażnik z kontrolą pozytywną, `not_signed_in` jako `test.fails`
  „znana dziura D3 → …” albo jako wyjątek; (3) próbny alarm; (4) osobno: tekst w `errors.ts` i zdjęcie znacznika;
  opcjonalnie ostrzeżenie `logEvent` dla kodu spoza `MESSAGES` (G2).
- **Pierwszy krok-prerekwizyt:** decyzja właściciela o `not_signed_in`.

### 3. K2: strażnik parsera wobec ustalonych zbiorów kluczy

- **Obecny → docelowy kształt:** typy, parser z białą listą i `*_KEYS` w testach db utrzymywane osobno; nowy klucz
  przechodzi `db`, a parser może go po cichu zgubić → biała lista zostaje (decyzja nośna), `*_KEYS` w module z samymi
  danymi, test unit: każdy klucz z `*_KEYS` przechodzi przez `parseLobbyState`.
- **Dlaczego #3:** chroni przed cichym przypadkiem przy najbliższym slice, który zmieni stan pokoju (S-04) [I]; koszt
  mały. Dziś bez żywego przypadku, a część ryzyka łapie e2e danej funkcji.
- **Blast radius:** 1–2 pliki w `tests/`; produkcja nietknięta (opcjonalny krok 4 dotyka `src/lib/rooms/shared.ts`).
- **Szkic ścieżki:** (1) test charakteryzujący parser na pełnej próbce; (2) moduł danych `*_KEYS`, z którego importują
  testy db; (3) strażnik; (4) opcjonalnie log nazwy odrzuconego klucza, bez wartości.
- **Pierwszy krok-prerekwizyt:** ustalić, czy `tests/db/support/rounds.ts` da się zaimportować w projekcie `unit` bez
  skutków ubocznych [U]; jeśli nie, najpierw moduł danych.

### Rozważone i odrzucone

- **K1, wariant „wygenerowane typy bazy”:** 10/10 RPC zwraca `jsonb`, więc odpowiedzi to `Json`; wymaga Dockera w CI
  (`ci.yml:94` wyklucza `postgres-meta`, [U] czy to przeszkadza) albo produkcji; nie złapałby jedynego historycznego
  błędu (F1 `p_round`). Koszt duży, zysk mały.
- **K1/K2, „jedno źródło nazw i kluczy dla testów db”:** zniosłoby świadomą niezależność wyroczni (`test-plan.md:140`,
  „drzwi atakującego”).
- **K4:** świadoma obrona w głąb, błąd F1 z S-01 ją potwierdził; zero błędów z rozjazdu; jedno źródło to nowa migracja i
  `db push`. Opcjonalnie tani test unit `tokens.ts`.
- **K5:** świadome, zapisane odstępstwo; sonda rzadko uruchamiana i poza CI; zysk niski. Opcjonalnie test porównujący
  literały i poprawka nieprawdziwego komentarza `live-sync/shared.ts:1`. Los `seq` to decyzja o zakresie prototypu F-01.
- **Granica pojęć biznesowych (poza tą analizą):** P12 (wybór głosu po odświeżeniu: S-04 w granicach Hard Rule
  anonimowości), P13 (odzyskanie miejsca po utracie ciasteczka), zakres prototypu F-01.

### Tanie zyski z nie-kandydatów (wejście do planu)

- P7 (D7): strażnik statyczny „żadnego `localStorage`, `sessionStorage` ani `document.cookie` na ścieżce głosu” na wzór
  `scripts/ui-literals.mjs`; brak jsdom i testing-library w `package.json`, więc skan tekstu, nie test komponentu. Koszt
  mały, pilnuje Hard Rule.
- P6 (D6): kontynuacja K1 na tej samej atrapie.
- P17: poprawka komentarza `server.ts:7-9`.

## Weryfikacja twierdzeń (ast-grep)

**Metoda.** 2026-10-20, HEAD `a17a8f5` (kod aplikacji jak w `06b025d`). ast-grep 0.51.0 (`npx -p @ast-grep/cli`,
jednorazowo, bez instalacji w projekcie) dla TS, TSX i JS; ast-grep nie parsuje SQL ani `.astro`, więc tam grep
(zaznaczone). Każde zero z ast-grep sprawdzono grepem. Dwa zera okazały się złymi wzorcami, nie brakiem wystąpień:
`isRecord` z typem zwrotnym `$R` (predykat typu to inny węzeł) i pierwsza reguła storage bez `property_identifier`
(`window.sessionStorage`). Reguły YAML i skrypty zostały poza repo (scratchpad sesji); poniżej ich treść w skrócie.
Poza zakresem: kotwice w dokumentach (plany, audyty, `test-plan.md`) i ustalenia przejęte z analizy M4L3 (P1–P20), bo
nie są twierdzeniami o strukturze kodu.

| # | Twierdzenie (sekcja) | Werdykt | Dowód (plik:linia) | Metoda (wzorzec/reguła) |
| --- | --- | --- | --- | --- |
| W1 | K1: 10 funkcji opakowujących woła bazę przez jeden transport `callRpc` | potwierdzone | `callRpc` 10×: `server.ts:115,137,156,177,235,250,261,274,291,302`; jedyne `.rpc(` w `src`: `server.ts:89` | ast-grep `callRpc($$$A)`, `$C.rpc($$$A)` |
| W2 | K1/Summary: aktualne definicje 10 funkcji, 10/10 `returns jsonb` | potwierdzone | `first_live_round.sql:220/227, 308/309, 384/385, 540/541, 723/724`; `full_game_evening.sql:79/80, 140/141, 207/208, 255/261, 403/404`; `close_stale_games.sql` definiuje tylko `private.close_stale_games` (`:17`) | grep `create (or replace )?function` i `returns` (SQL) |
| W3 | K1: nazwa RPC w `server.ts` 2–3 razy | doprecyzowane: 2–4 | `room_link` 4× (`server.ts:137,141,144,149`), `create_room` i `join_room` 3×, pozostałe 7 po 2× | ast-grep `"$S"` w `server.ts` z liczeniem nazw; grep `"<nazwa>"`: te same liczby |
| W4 | K1: kopie wszystkich 10 nazw w `rounds.ts:91-144` | doprecyzowane: 9 z 10 | `call(…)` w `rounds.ts:92,105,114,119,123,127,131,138,143`; `create_room` w testach tylko `rooms.ts:49`, `roles.test.ts:164,250`; grep `create_room` w `rounds.ts`: 0 | ast-grep `call($C, $N, $$$A)`, `$C.rpc($N, $$$A)` (`tests`, `scripts`) |
| W5 | K1: pgTAP odwołuje się do 8 z 10 funkcji (bez `room_link`, `room_lobby`) | potwierdzone | `supabase/tests/round_creator_view.test.sql`: `room_link` 0, `room_lobby` 0, pozostałe 8 od 2 do 20 trafień | grep (SQL) |
| W6 | K1: różnice argumentów są świadome | potwierdzone | `p_link_token` ignorowany `first_live_round.sql:219`, Worker go wysyła `api/rooms/index.ts:40`; `p_player_token default null` `full_game_evening.sql:258`; helper pomija token hosta `rounds.ts:108`; Worker wysyła go zawsze, `p_round` warunkowo `server.ts:253` | odczyt linii z W1 i W2 |
| W7 | Summary/K1: ścieżki Workera „Odsłoń wynik” nie woła żaden test CI | potwierdzone | smoke: `act(…)` 10× = start, 6× vote, next, skip, end (`smoke.mjs:270-323`), bez `reveal`; e2e: „Odsłoń” tylko w komentarzu `round.spec.ts:49`; db: `reveal_round` przez helper `rounds.ts:114` (`round-rules.test.ts:204,213,255,259,323`); żaden plik `tests/` nie importuje `rooms/server` (grep: 3 komentarze) | ast-grep `act($A, $$$R)` (JS); grep `reveal`, `Odsłoń`, `rooms/server` w `tests`, `scripts` |
| W8 | K1: `server.ts` nie importuje `astro:*` ani `src/lib/supabase.ts` | potwierdzone, także przechodnio | `server.ts:1-5` → `live-sync/server.ts:1-4`, `rounds/draw.ts:1`; `log.ts`, `rooms/shared.ts`, `live-sync/shared.ts`, `data/questions.ts` bez importów; grep `astro:`, `lib/supabase` w łańcuchu: 0 | reguła: `kind: string` w polu `source` węzła `import_statement` |
| W9 | K1 blast radius: 12 importerów runtime `server.ts` | potwierdzone | 9 tras API (`api/rooms/index.ts:3`, `join.ts:2`, `[id]/{start,vote,reveal,next,skip,end}.ts:3`, `[id]/lobby.ts:4`) + `index.astro`, `j/[token].astro`, `r/[id].astro` (grep); `json-route.ts:3` tylko typy | ast-grep `import $$$X from "@/lib/rooms/server"` (TS, TSX); grep dla `.astro` |
| W10 | K1: ESLint pozwala testom na importy typów supabase-js | potwierdzone | `eslint.config.js:94-109`: zakaz importu wartości `@supabase/supabase-js`, `@supabase/ssr`, `@/lib/supabase` w `tests/**`, `allowTypeImports: true`; `@/lib/rooms/server` poza zakazem | odczyt konfiguracji |
| W11 | K1: brak wygenerowanych typów bazy | potwierdzone | `SupabaseClient<…>`: 0 w `src` i `tests`; `clients.ts:18` | ast-grep `SupabaseClient<$T>`: 0; grep `SupabaseClient<`, `Database`: 0 |
| W12 | K2: parsery i biała lista kluczy | potwierdzone | `parseLobbyState` `shared.ts:166-185`, `parseRoomView` `:189-201` (jedyny wołający `useRoomState.ts:206`), `parseRound` `:122-163` z odrzuceniem obcego klucza przy `skipped` `:126-128`; `*_KEYS` `rounds.ts:59-68` | ast-grep `function $F($$$P): $R { $$$B }`, `parseRoomView($$$A)` |
| W13 | K2: `isRecord` w 4 kopiach | potwierdzone | `server.ts:37`, `shared.ts:79`, `room-actions.ts:16`, `tests/db/support/rooms.ts:11` (eksport, import `rounds.ts:3`) | ast-grep `function isRecord($V: unknown): $V is Record<string, unknown> { $$$B }`: 4; grep: 4 |
| W14 | K2: osłona `room-state.test.ts:61-187` | doprecyzowane: 61-188 | `describe("parseLobbyState")` `:61-188`, obcy klucz `:175` | odczyt pliku |
| W15 | K2/OQ4: czy `rounds.ts` da się zaimportować w `unit` [U] | doprecyzowane: strukturalnie tak | łańcuch `rounds.ts` → `rooms.ts`, `clients.ts` → `env.ts`, `tokens.ts`, `data/questions.ts`: zero instrukcji wykonywanych przy imporcie; jedyny inicjalizator z wywołaniem to `rooms.ts:9` (`slice`, `map`); klient powstaje dopiero w `anonClient()` `clients.ts:13-16`. Nie uruchamiano | reguła: `expression_statement`, `if`, `throw`, `for` bezpośrednio w `program` (kontrola pozytywna `print-nick-pairs.ts:20`); grep inicjalizatorów |
| W16 | K3: `MESSAGES` ma 18 kluczy | potwierdzone | `errors.ts:23-42` | reguła: `kind: pair` w obiekcie deklaratora `MESSAGES` |
| W17 | K3: 18 różnych kodów `'reason'` w migracjach, `MESSAGES` = 17 z nich + `service_unavailable`, brak `not_signed_in` | potwierdzone | `not_signed_in`: `room_lobby.sql:151`, `first_live_round.sql:240`; każda linia z `'reason'` w SQL ma literał (innych form 0) | grep `'reason',\s*'[a-z_]+'` z `sort -u` (SQL) |
| W18 | K3: zakresy kodów w aktualnych definicjach | potwierdzone | `first_live_round.sql:240-297, 327-371, 561-581, 744-760`; `full_game_evening.sql:100-130, 162-192, 226-234, 291-359`; `first_live_round.sql:628-686` to stara `cast_vote`, usunięta w `full_game_evening.sql:248` | grep numerów linii `'reason',` wobec granic funkcji (SQL) |
| W19 | K3: test nie zna `not_signed_in`, `invalid_categories`, `open_room_has_guests`, `try_again` | potwierdzone | `room-errors.test.ts:8-15` (6) i `:21-32` (10), razem 15 różnych; 18 kluczy `MESSAGES` − 15 = te 3, plus `not_signed_in` spoza `MESSAGES` | odczyt i porównanie z W16 |
| W20 | K3: typ `RoundRefusal` nie ma użyć | potwierdzone | jedyne wystąpienie: deklaracja `errors.ts:20` | reguła: `kind: type_identifier`, `^RoundRefusal$`; grep: 1 |
| W21 | K3: kody powstające w TS | doprecyzowane: ten sam zbiór, więcej miejsc | `reason: "…"` 12× w `src`: `invalid_body` także `[id]/vote.ts:36`, `skip.ts:25` (oraz `json-route.ts:75` jako `error`), `service_unavailable` w 6 trasach, `room_unknown` `json-route.ts:20`; `?error=invalid_categories` `api/rooms/index.ts:27`; `statusFor` `json-route.ts:118-124` | reguła: `kind: pair`, klucz `reason`, wartość `string`; grep `?error=` |
| W22 | K3: teksty trafiają na ekran przez 5 miejsc | potwierdzone | `index.astro:15`, `j/[token].astro:60,78`, `r/[id].astro:69` (grep), `room-actions.ts:26`; poza tym tylko podglądy `dev/room-states.astro` | ast-grep `roomErrorMessage($$$A)`; grep dla `.astro` |
| W23 | K3: hooki nie uruchamiają unitów po zmianie samego `.sql` (`lib.mjs:15`) | doprecyzowane: mechanizm w innych liniach | `lib.mjs:15` to tylko wzorzec plików; decydują `end-of-turn.mjs:27,61-63` (unit tylko przy zmianie pliku JS/TS/Astro, `package*.json` lub `tsconfig.json` w tej samej turze) i `related-tests.mjs:8` (tylko JS/TS) | odczyt hooków |
| W24 | K4: wzorce `{43}` i `{22}` | potwierdzone, z uzupełnieniem | aktualne: `first_live_round.sql:322,326,395`, `full_game_evening.sql:279,438`, CHECK `room_lobby.sql:23`; w nadpisanych definicjach także `{22}` w `room_lobby.sql:222,280` (raport wymienia tylko `{43}`); TS `tokens.ts:6,11`, użycia `join.ts:14`, `vote.ts:41`, `j/[token].astro:26`; smoke `:194,196,198,245`; testu unit `tokens.ts` brak | grep `\{43\}`, `\{22\}` (SQL, `.astro`, `.mjs`); grep `rooms/tokens` w `tests/unit`: 0 |
| W25 | K5: sonda kopiuje stałe, `ringRoom` ma dwa kontrakty, `seq` czyta tylko prototyp | potwierdzone | `live-sync-probe.mjs:9,11-13` wobec `live-sync/shared.ts:1,3-4`; `ringRoom` `live-sync/server.ts:12-32`, wołający `api/live-sync/ring.ts:24`, `rooms/server.ts:369`; `seq`: `LiveSyncDemo.tsx:52,62-64,114`, `ring.ts:14`, `state.ts:10-15`; ekran pokoju `useRoomState.ts:286-288` bez ładunku | ast-grep `export async function ringRoom($$$P): $R { $$$B }`, `ringRoom($$$A)`, `$O.seq` (TSX); grep `\bseq\b` (`$O.seq` nie łapie `?.seq`) |
| W26 | Tanie zyski P7 (D7): strażnik „żadnego `localStorage`, `sessionStorage` ani `document.cookie` na ścieżce głosu”; brak jsdom i testing-library | **podważa kształt strażnika** (nie pozycję kandydata) | `useRoomState.ts:99,100,110`: `window.sessionStorage` z flagą przeładowania `mlt-room-reloaded:<roomId>` = `"1"` (`:51`, `:96-113`), bez danych głosu; ciasteczko gracza ustawia serwer (`join.ts:53`); `localStorage`, `indexedDB`, `document.cookie`: 0; jsdom, happy-dom, testing-library w `package.json`: 0. Strażnik w tym brzmieniu byłby czerwony od pierwszego dnia: wyjątek dla flagi przeładowania albo węższa reguła — **do decyzji na etapie planowania** | reguła: `identifier` lub `property_identifier` `^(localStorage\|sessionStorage\|indexedDB)$` i `document.cookie`; pierwsza wersja bez `property_identifier` dała fałszywe zero, grep je wyłapał |

**Wynik.** 26 twierdzeń: 19 potwierdzonych, 6 doprecyzowanych (W3, W4, W14 poprawione w miejscu; W15, W21, W23 tylko
tutaj), 0 obalonych. Żaden wynik nie podważa pozycji K1, K3 ani K2: dziura „Odsłoń wynik” (W7) i brak tekstu dla
`not_signed_in` (W17) stoją. W26 dotyczy taniego zysku D7 i wraca w planie.

## Code References

- `src/lib/rooms/server.ts:15,22-43,57-109,115-133,253,260-263,369` — brama RPC, typy, walidacja, `reveal_round`, dzwonek
- `src/lib/rooms/shared.ts:20-59,79-93,119-128,166-201` — typy kontraktu, parsery, biała lista kluczy
- `src/lib/rooms/errors.ts:1-49` — `ROUND_REFUSALS`, `RoundRefusal`, `MESSAGES`, tekst ogólny
- `src/lib/rooms/tokens.ts:5-11,21-26` — wzorce i generatory tokenów
- `src/lib/live-sync/shared.ts:1-4`, `scripts/live-sync-probe.mjs:9-13` — kontrakt dzwonka i jego kopia
- `tests/unit/room-errors.test.ts:8-32`, `tests/unit/room-state.test.ts:61-188` (raport: 61-187) — dzisiejsze strażniki unit
- `tests/db/support/clients.ts:4-18`, `tests/db/support/rounds.ts:57-144` — „drzwi atakującego”, kopie nazw i kluczy
- `scripts/smoke.mjs:2,194-198,245,270-323`, `tests/e2e/round.spec.ts:48-49` — ścieżki CI przez Workera
- `supabase/migrations/20261014101922_first_live_round.sql:218-240,308,384,540,723` — aktualne `create_room`, `join_room`, `room_link`, `start_game`, `reveal_round`
- `supabase/migrations/20261015122252_full_game_evening.sql:79,140,207,246-261,403` — aktualne `next_round`, `skip_round`, `end_game`, `cast_vote`, `room_lobby`
- `scripts/ui-literals.mjs:4,26`, `.claude/hooks/lib.mjs:15`, `.github/workflows/ci.yml:47,94,128` — precedens skanu, zakres hooków, starty Supabase w CI

## Architecture Insights

- Kontrakt TS↔SQL jest celowo powtórzony w trzech niezależnych miejscach: Worker (`server.ts`), baza (funkcje
  `security definer` walidują same) i testy (drzwi atakującego). Powtórzenie to mechanizm bezpieczeństwa (obrona w głąb
  i niezależna wyrocznia). Jego kosztem jest brak lokalnego sygnału przy rozjeździe, a to adresują strażnicy w `unit`.
- Kolejność wdrożeń „baza, potem kod” wymusza tolerancję po stronie Workera: parser ignoruje nowe pola, stare parametry
  zostają w sygnaturach (`p_link_token`). Każdy refaktor tej granicy musi tę tolerancję zachować.
- Gra pozostaje Transaction Scriptem (trasa API = jedno żądanie, reguły w funkcjach SQL); żaden kandydat nie uzasadnia
  zmiany archetypu. [I]

## Historical Context (from prior changes)

- `context/archive/2026-10-10-testing-lobby-foundation/plan.md:85` — „drzwi atakującego”: testy db omijają Workera
- `context/archive/2026-10-07-room-lobby/plan.md:174,181,267,270` — kontrakt `create_room` z `not_signed_in`, wzorce w funkcjach, `seq` w dzwonku, tekst ogólny
- `context/archive/2026-10-07-room-lobby/reviews/impl-review.md:29-46` — F1: reguła tylko w Workerze (potwierdzenie obrony w głąb)
- `context/archive/2026-10-13-first-live-round/plan.md:32,86,172,295,392-403,417-424` — kolejność wdrożeń, testy przed kodem, parser po audycie, teksty odmów
- `context/archive/2026-10-15-full-game-evening/research.md:118-121,146`, `reviews/impl-review.md:42,60-68,100-108` — D3, F1 `p_round`, F5 `no_questions`
- `context/archive/2026-09-27-live-sync-spike/plan.md:365`, `reviews/impl-review.md:160-171` — odstępstwo sondy (F6)
- `context/audits/observability/2026-10-11_guest-join-live-lobby.md:78-79,89` — G1, G2, wspólny parser

## Related Research

- `context/changes/guest-vote-flow-analysis/research.md` — wejście (D1–D8, weryfikacja ast-grep)
- `context/map/repo-map.md` — mapa projektu (niewiadome 2 i 3 dotyczą K1 i K5)

## Open Questions

1. `not_signed_in`: własny tekst czy wyjątek z uzasadnieniem? Decyzja właściciela, prerekwizyt K3.
2. Czy ścieżkę Workera dla „Odsłoń wynik” dołożyć do CI (krok smoke czy plik `tests/db`) i czy zmieści się w budżecie
   rejestracji (§6.2)? Do planu.
3. Czy `supabase gen types --local` działa w jobie `db` przy `-x postgres-meta`? [U]
4. Czy `tests/db/support/rounds.ts` można bezpiecznie zaimportować w projekcie `unit`? [U]
5. Czy sonda zaimportuje `shared.ts` na Node 22.14 bez flagi? [U]
6. Czy prototyp F-01 i `/api/live-sync/*` mają żyć dalej (los `seq`)? Decyzja produktowa.
7. Ostrzeżenie dla kodu spoza `MESSAGES` z audytu G2: odrzucone czy pominięte? [U]
