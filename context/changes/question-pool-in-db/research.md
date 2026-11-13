---
date: 2026-11-13T14:03:19+01:00
researcher: Claude (Opus 5.5) z Karolem
git_commit: 8128c48ec24b9487bf412b4b786a5c6aef026c8a
branch: question-pool-in-db
repository: most-likely-to
topic: "S-17: jak baza ma pilnować kategorii i 18+ wybranych przez hosta"
tags: [research, question-pool-in-db, S-17, FR-005, start_game, open_next_round, unplayed_candidates, questions]
status: complete
last_updated: 2026-11-13
last_updated_by: Claude (Opus 5.5)
---

# Research: S-17, kategorie i 18+ sprawdzane w bazie

**Date**: 2026-11-13T14:03:19+01:00
**Researcher**: Claude (Opus 5.5) z Karolem
**Git Commit**: `8128c48`
**Branch**: `question-pool-in-db`
**Repository**: most-likely-to

## Research Question

S-17 (`context/foundation/roadmap.md:326-337`, FR-005): prowadzący (host albo współhost) ma otworzyć tylko pytanie z
kategorii wybranych przez hosta, a pytanie 18+ tylko z kategorii, w których host je włączył, także gdy woła funkcję
bazy sam, z pominięciem ekranu gry. Pytanie z roadmapy (`roadmap.md:335`): jak baza ma znać kategorię i znacznik 18+
pytań, które dziś są tylko w `src/data/questions.ts`? Którędy numer pytania wchodzi do bazy, co pękłoby po dodaniu
sprawdzenia i jak nie utrudnić Karolowi dopisywania nowych kategorii i pytań po S-17 (`change.md`, Notes).

## Summary

- **Dziura jest szersza niż w roadmapie.** Numer pytania od wołającego wchodzi do bazy sześcioma funkcjami (tabela
  niżej); w każdej jedynym sprawdzeniem jest format `^[a-z0-9-]+-[0-9]{3}$`. Współhost (bez konta, token z ciasteczka)
  ma cztery z nich: `start_game`, `next_round`, `skip_round`, `more_questions`; host dodatkowo dwie funkcje listy pytań
  gry (S-06): `open_question_list`, `draw_list_question`. Trzy z czterech ruchów współhosta przechodzą przez jedną
  funkcję `private.unplayed_candidates` (`20261107091322_game_length.sql:78-93`), a `start_game` sprawdza numer sam
  (`20261027121442_co_host_role.sql:158`).
- **Baza nie zna dziś żadnych danych o pytaniu** poza numerem: żadna tabela nie ma kategorii, znacznika 18+ ani treści
  pytań bazy (`20261026074427_question_play_data.sql:17-19`). Wybór hosta leży w `rooms.categories` i
  `rooms.adult_categories` (`20261007122858_room_lobby.sql:26-27`), zapisywany jeden raz w `create_room`, który sprawdza
  tylko kształt tablic, nie nazwy kategorii (`20261031090821_player_color_choice.sql:110-114`); po założeniu nic go nie
  zmienia.
- **Wybór techniczny (do planu):** W-A katalog w bazie (numer → kategoria, 18+, bez treści) wypełniany migracją
  generowaną z `questions.ts`; W-B pula zapisana w pokoju przy zakładaniu (Worker hosta podaje numery); W-C cała
  wspólna baza pytań z treścią w bazie danych. Tylko W-A i W-C spełniają S-17 dosłownie także dla hosta; W-B zamyka
  dziurę współhosta (F1), ale nie hosta. W-A kosztuje migrację przy każdym dopisaniu pytań; W-B nic nie kosztuje przy
  dopisywaniu; W-C to przebudowa losowania i treści, za duża na S-17.
- **Co pęknie po sprawdzeniu w bazie:** test bazy twórcy gry (pgTAP) używa wymyślonych numerów `pgtap-…-NNN` spoza
  wspólnej bazy pytań (73 linie w `supabase/tests/round_creator_view.test.sql`); dwa testy `it.fails` „znana dziura
  F1 → S-17” (`tests/db/cohost.test.ts:413-421`, `tests/db/game-length.test.ts:650-660`) zaczerwienią się i tracą
  znacznik. Testy bazy (`tests/db`), smoke i e2e wysyłają numery z puli albo celowo złe, więc zostają bez zmian.

## Detailed Findings

### Wejścia numeru pytania do bazy (najnowsze definicje)

| Funkcja                                                                  | Granty                                   | Kto może                                                       | Parametr z numerami                                                   | Sprawdzenie numeru                   |
| ------------------------------------------------------------------------ | ---------------------------------------- | -------------------------------------------------------------- | --------------------------------------------------------------------- | ------------------------------------ |
| `start_game` (`co_host_role.sql:110-194`)                                | `anon`, `authenticated` (`:916`, `:928`) | prowadzący przez `leader_refusal` (`:133`), tylko w poczekalni | `p_question_id`, używany tylko bez listy pytań gry (`:146-162`)       | format (`:158`) → `invalid_question` |
| `next_round` (`co_host_role.sql:201-267`)                                | `anon`, `authenticated` (`:917`, `:929`) | prowadzący (`:226`)                                            | `p_candidates` → `open_next_round` (`:257`)                           | przez `unplayed_candidates`          |
| `skip_round` (`co_host_role.sql:275-354`)                                | `anon`, `authenticated` (`:918`, `:930`) | prowadzący (`:301`)                                            | `p_candidates` → `open_next_round` (`:350`)                           | przez `unplayed_candidates`          |
| `more_questions` (`game_length.sql:180-268`)                             | `anon`, `authenticated` (`:588`, `:593`) | prowadzący (`:208`)                                            | `p_candidates` liczone (`:249-250`), potem `open_next_round` (`:259`) | przez `unplayed_candidates`          |
| `open_question_list` (`20261024094002_question_list_review.sql:104-166`) | tylko `authenticated` (`:739`, `:748`)   | tylko host (`:123`), w poczekalni                              | `p_candidates`, pierwsze 15 różnych (`:146-154`)                      | format (`:150`)                      |
| `draw_list_question` (`question_list_review.sql:171-230`)                | tylko `authenticated` (`:740`, `:749`)   | tylko host (`:190`), w poczekalni                              | `p_candidates`, pierwszy spoza listy (`:213-217`)                     | format (`:212`)                      |

- `private.open_next_round` (`game_length.sql:109-165`, bez grantów): najpierw lista pytań gry (`:132-140`), potem
  pierwszy wiersz `unplayed_candidates` według kolejności Workera (`:142-150`). `private.unplayed_candidates`
  (`game_length.sql:78-93`, sprawdzone na bajtach): format (`:86`), nie zagrane w tym pokoju (`:87-89`), nie na żadnym
  wierszu listy (`:90-92`). Jedno miejsce obsługuje więc `next_round`, `skip_round` i `more_questions`.
- Pozostałe funkcje nie przyjmują numeru: `edit_list_question`, `add_own_question`, `remove_list_question`
  (`question_list_review.sql:234-393`), `approve_proposal` (`20261104095452_guest_question_proposals.sql:200-257`,
  wstawia sam tekst z `proposed = true`), `cast_vote`, `reveal_round`, `react_round`, `end_game`, `remove_player`,
  `host_games`, `delete_game` (sygnatury w `tests/unit/room-rpc-gate.test.ts:43-212`).

### Wybór hosta w bazie

- `rooms.categories text[] not null check (cardinality >= 1)` i `rooms.adult_categories text[] … check
(adult_categories <@ categories)` (`room_lobby.sql:26-27`, sprawdzone na bajtach).
- Jedyny zapis: `create_room` (`player_color_choice.sql:76-159`, tylko `authenticated`, `:660`, `:668`), sprawdzenie
  tylko kształtu (`:110-114`, sprawdzone na bajtach): co najmniej jedna kategoria, bez `null`, 18+ podzbiorem
  wybranych. Nazwy kategorii sprawdza tylko Worker (`src/pages/api/rooms/index.ts:52-57`), a `poolFrom` pomija
  nieznane (`src/lib/rounds/draw.ts:26-34`). Po założeniu żadna funkcja nie zmienia tych kolumn, a `authenticated` ma
  na `rooms` tylko `select` (`20261014101922_first_live_round.sql:33-37`).
- Prowadzący czyta wybór w `room_lobby.leader_draw` (`game_length.sql:421-423`); Worker liczy z niego pulę w
  `leaderSelection` (`src/lib/rooms/server.ts:379-389`) albo, dla funkcji listy, w `hostRoomCategories`
  (`server.ts:788-804`).

### Jak reprezentowane są pytania spoza wspólnej bazy pytań

Sprawdzenie musi przepuszczać rundy i wpisy bez numeru (`question_list_review.sql:47-81`,
`guest_question_proposals.sql:87`):

| Rodzaj                       | Wiersz `game_questions`                | Wiersz `rounds`                                                                     |
| ---------------------------- | -------------------------------------- | ----------------------------------------------------------------------------------- |
| Wylosowane z kandydatów      | brak                                   | `question_id` = numer, `list_position` null                                         |
| Wpis listy z bazy, bez zmian | `question_id` = numer, `text` null     | `question_id` = numer, `list_position`                                              |
| Wpis poprawiony              | `question_id` zostaje, `text` własny   | `question_id` null, `list_position` (`co_host_role.sql:148`, `game_length.sql:132`) |
| Własne pytanie               | `question_id` null, `text`             | `question_id` null, `list_position`                                                 |
| Zatwierdzona propozycja      | `question_id` null, `text`, `proposed` | `question_id` null, `list_position`                                                 |

Wniosek: wpisy listy mają numer tylko wtedy, gdy powstały z kandydatów `open_question_list`/`draw_list_question`;
sprawdzenie przy tych dwóch funkcjach wystarcza, żeby lista nie wniosła pytania spoza wyboru hosta.

### Strona Workera

- Numery wysyła sześć tras (`src/pages/api/rooms/[id]/start.ts:31-37`, `next.ts:41-44`, `skip.ts:37-40`,
  `more.ts:44-53`, `question-list.ts:29-33`, `question-draw.ts:30-34`), zawsze z puli `poolFrom` (cała pula, do 216
  numerów, w losowej kolejności); `start_game` dostaje jeden numer z `drawQuestion`.
- Treść pytania na ekranie składa Worker: `round.question_text ?? questionText(question_id)` (`server.ts:326-327`);
  nieznany numer daje `question: null` i log `unknown_question` (`server.ts:270-281`).
- Liczba „Jeszcze N pytań” pochodzi z puli Workera (`server.ts:368-372`, `draw.ts:96-105`) i zakłada, że baza dobierze
  tyle samo; sprawdzenie w bazie musi więc dawać dokładnie tę samą pulę co `poolFrom`, inaczej przycisk obieca więcej,
  niż baza doda.
- Wspólna baza pytań: 216 pytań w 8 kategoriach po 27, z tego 57 pytań 18+ (policzone 2026-11-13 z
  `src/data/questions.ts`; `przyszlosc` ma 8 pytań 18+, reszta po 7). Żaden skrypt nie generuje SQL z TS, a jedyną
  kontrolą bazy pytań są typy (TS1117 przy powtórzonym kluczu, `questions.ts:12-13`) i `tests/unit/draw.test.ts:217-223`
  (co najmniej 15 pytań bez 18+ w każdej kategorii).

### Testy, które dotknie sprawdzenie w bazie

- **pgTAP** (`supabase/tests/round_creator_view.test.sql`, `plan(458)` `:68`): scenariusze liczników S-11 używają
  wymyślonych numerów `pgtap-<scenariusz>-NNN` (zasada w `:64`; 73 linie z `pgtap-`), w pokojach z kategorią
  `na-co-dzien` bez 18+ (`:158-161`, `:281-284`), przez `start_game` (`host_starts_with`, `:680-687`), `next_round`,
  `skip_round`, `more_questions` i funkcje listy (`:712-755`, `:2225-2876`). Każdy z nich odmówi po sprawdzeniu;
  scenariusze trzeba przestawić na prawdziwe numery z `na-co-dzien` albo wstawić numery testowe do katalogu w teście.
- **`it.fails` „znana dziura F1 → S-17”**: `cohost.test.ts:413-421` (`next_round` współhosta z `na-co-dzien-021`) i
  `game-length.test.ts:650-660` (`more_questions`). Oba sprawdzają tylko `{ ok: false }` bez kodu odmowy i wracają bez
  asercji, gdy odmowa przyjdzie jako błąd (`error !== null`), więc plan powinien je zaostrzyć (kod odmowy, brak błędu).
  Dla `start_game`, `skip_round`, `open_question_list` i `draw_list_question` takiego testu nie ma.
- **Bez zmian:** testy bazy w `tests/db` wysyłają numery z `SEED_CATEGORIES = [na-co-dzien, imprezy]` bez 18+
  (`tests/db/support/rooms.ts:9,48-55`; `rounds.ts:207-216`) albo celowo złe (`round-rules.test.ts:378-387`);
  testy, które wysyłają podzbiór puli i czekają pierwszego kandydata albo `no_questions`, dalej przejdą, jeśli baza
  filtruje kandydatów, a nie zastępuje ich swoimi. Smoke i e2e nie wysyłają numerów (`scripts/smoke.mjs:192-202`,
  `tests/e2e/support/room.ts:32-49`). Brama RPC (`room-rpc-gate.test.ts`) zmienia się tylko przy zmianie sygnatury.

## Code References

- `supabase/migrations/20261107091322_game_length.sql:78-93` - `private.unplayed_candidates`, wspólne miejsce dla trzech ruchów
- `supabase/migrations/20261107091322_game_length.sql:109-165` - `private.open_next_round`
- `supabase/migrations/20261027121442_co_host_role.sql:110-194` - `start_game`, sprawdzenie formatu `:158`
- `supabase/migrations/20261027121442_co_host_role.sql:59-98` - `private.leader_refusal`
- `supabase/migrations/20261024094002_question_list_review.sql:104-230` - `open_question_list`, `draw_list_question`
- `supabase/migrations/20261031090821_player_color_choice.sql:76-159` - `create_room`, kształt wyboru `:110-114`
- `supabase/migrations/20261007122858_room_lobby.sql:26-27` - kolumny wyboru hosta
- `src/lib/rounds/draw.ts:26-34` - `poolFrom`, reguła FR-005 w Workerze
- `src/lib/rooms/server.ts:368-389`, `:788-804` - pula do „Jeszcze N pytań”, odczyt wyboru
- `src/data/questions.ts:1-19` - zasady numerów (stały, nigdy ponownie użyty, kategorii nie czytać z numeru)
- `tests/db/cohost.test.ts:413-421`, `tests/db/game-length.test.ts:650-660` - znane dziury F1
- `supabase/tests/round_creator_view.test.sql:64`, `:680-687` - wymyślone numery pgTAP

## Architecture Insights

- **Jedno miejsce sprawdzenia dla losowania:** dopisanie warunku do `unplayed_candidates` obejmuje `next_round`,
  `skip_round`, `more_questions` i liczenie w `more_questions` (`game_length.sql:249-250`); osobno trzeba `start_game`
  i dwie funkcje listy. Wygodnie: jedna funkcja `private` (np. „czy numer należy do wyboru pokoju”), wołana w czterech
  miejscach. Uwaga z przeglądu S-19 (`context/changes/game-length/reviews/impl-review.md:29-37`): łatanie każdej
  funkcji osobno grozi pominięciem `more_questions`.
- **Filtr, nie odmowa całego żądania:** dzisiejszy kontrakt kandydatów to „pierwszy pasujący z listy Workera”
  (decyzja D1 S-03, `context/archive/2026-10-15-full-game-evening/research.md:104-113`); numer spoza wyboru może po
  prostu odpaść jak dziś numer w złym formacie. Ale test F1 chce `{ ok: false }`: gdy po odfiltrowaniu nic nie zostaje,
  ruch kończy się dzisiejszym `no_questions`, co spełnia ten test; dla `start_game` z jednym numerem potrzebna jest
  wprost odmowa.
- **Kolejność wdrożenia przy W-A:** numer pytania dopisanego w kodzie, którego katalog w bazie jeszcze nie zna, odpada
  z kandydatów (gra go nie zagra), a `start_game` z takim numerem odmówi, więc gra nie wystartuje, jeśli Worker go
  wylosuje. Zasada „baza, potem kod” (`context/deployment/deploy-plan.md:52-53`) to załatwia, ale plan powinien rozważyć
  `start_game` z listą kandydatów zamiast jednego numeru (jak `next_round`), żeby rozjazd nie blokował startu.
- **Słownik:** „pula” jest w słowniku słowem odradzanym (`context/domain/glossary.md:65`, `:68`; „wspólna baza pytań”,
  „pozostałe pytania”). Nazwy w kodzie i planie powinny iść za słownikiem (np. katalog wspólnej bazy pytań, pytania
  wybranych kategorii), mimo że Change ID to `question-pool-in-db`.

## Historical Context (from prior changes)

- `context/archive/2026-09-27-starter-question-base/plan.md:34`, `:195`: pytania miały trafić do bazy „w S-01 albo
  S-11, z tymi samymi identyfikatorami”, a numery zostać kluczami tabeli. Werdykt: częściowo nieaktualne, bo S-01
  (`context/archive/2026-10-07-room-lobby/plan.md:60`) i S-11
  (`context/archive/2026-10-26-question-reactions-play-data/research.md:239-241`) świadomie tego nie zrobiły; zasada
  „numery zostają kluczami” dalej obowiązuje (`src/data/questions.ts:4-10`).
- `context/archive/2026-09-27-starter-question-base/reviews/impl-review.md:62-67`: znacznik `retired` w pliku odrzucony,
  bo „S-12 … może trzymać odłożone pytania w bazie”. Katalog w bazie (W-A) byłby naturalnym miejscem na taki znacznik
  później (FR-017), ale S-17 go nie potrzebuje.
- `context/changes/co-host-role/reviews/plan-review.md:28-45` (F1): Fix B „baza dostaje kategorię i flagę 18+ każdego
  pytania (albo zapisaną pulę pokoju)”, z ryzykiem „kopia bazy pytań w SQL do synchronizacji” i ślepą plamką „własne i
  przeredagowane pytania listy S-06” (rozstrzygnięte wyżej: wpisy bez numeru nie wymagają sprawdzenia).
- `context/archive/2026-10-26-question-reactions-play-data/research.md:273-275` (ryzyko 8): host wołający RPC może
  grać dowolne numery i zawyżać liczniki `question_stats`, przyjęte świadomie. W-A i W-C to zamykają (numer spoza
  katalogu odpada), W-B nie (host zapisuje dowolną pulę).
- `context/archive/2026-10-24-question-list-review/plan.md:41`: S-06 odłożyło pilnowanie kategorii kandydatów po
  liście (Q-04, `context/domain/domain-distillation.md:222`, nigdy formalnie nierozstrzygnięte); S-17 je przejmuje.
- `context/domain/domain-distillation.md:208` (priorytet 5): „gotowe, gdy `start_game` i `next_round` z id pytania
  spoza kategorii pokoju dostają odmowę”.
- `context/foundation/test-plan.md:66` (ryzyko 4): „Worker sprawdza, więc baza nie musi” to fałszywe założenie;
  `AGENTS.md:25`: funkcja z grantem `anon` jest publicznym wejściem, wszystkie sprawdzenia w środku.
- `context/deployment/deploy-plan.md:77`: dziś pytanie warte zachowania trafia do `src/data/questions.ts` zwykłą zmianą
  w repo, bez migracji. W-A to zmienia (zmiana w repo + migracja katalogu + `db push` przed scaleniem).
- Żaden dokument nie zabrania trzymania w bazie treści ani pytań 18+; reguła „Pytania gry tylko po stronie serwera”
  (`context/foundation/lessons.md:12-17`) dotyczy przeglądarki.

## Related Research

- `context/archive/2026-10-07-room-lobby/research.md` (Q8: pytania w bazie czy tylko wybór kategorii)
- `context/archive/2026-10-15-full-game-evening/research.md` (D1: kandydaci od Workera)
- `context/archive/2026-10-24-question-list-review/research.md` (lista pytań gry, Q-04)
- `context/archive/2026-10-26-question-reactions-play-data/research.md` (liczniki pod numerem, ryzyko 8)
- `context/changes/game-length/research.md` (strażnik w bazie dla `anon`)

## Open Questions

1. **Skąd baza zna kategorię i 18+ (decyzja do planu, rekomendacja dla Karola):**
   - **W-A katalog w bazie** — tabela `private` bez grantów: numer → kategoria, 18+ (bez treści), wypełniana migracją
     generowaną skryptem z `src/data/questions.ts`; strażnik zgodności katalogu z plikiem w testach CI. Spełnia S-17 dla
     hosta i współhosta, zamyka ryzyko 8 S-11 i nieznane nazwy kategorii w `create_room`; daje miejsce na odłożone
     pytania z FR-017. Koszt: każde dopisanie pytań to też migracja i `db push` przed scaleniem.
   - **W-B wybór zamrożony w pokoju** — `create_room` dostaje od Workera hosta listę numerów pytań wybranych kategorii,
     ruchy prowadzącego sprawdzają przynależność do niej. Bez kopii bazy pytań i bez migracji przy dopisywaniu, ale
     zalogowany host przez RPC zapisze dowolną listę (S-17 nie spełnione dla hosta, ryzyko 8 zostaje).
   - **W-C cała wspólna baza pytań w bazie danych** — źródło prawdy z treścią przenosi się do bazy; przebudowa
     losowania, treści na ekranie, podsumowania i listy. Poza zakresem S-17.
2. Jak strażnik ma pilnować zgodności katalogu z plikiem przy W-A (test jednostkowy czytający migracje, generator z
   trybem sprawdzania w `npm run lint`, test bazy w CI) — do planu.
3. `start_game`: odmowa dla numeru spoza wyboru czy zmiana na listę kandydatów (zmiana sygnatury, brama RPC, pgTAP) —
   do planu.
4. Czy przy okazji `create_room` ma odmawiać nieznanych nazw kategorii (dziś tylko Worker,
   `context/archive/2026-10-07-room-lobby/reviews/impl-review.md:35`) — mały dodatek przy W-A.
