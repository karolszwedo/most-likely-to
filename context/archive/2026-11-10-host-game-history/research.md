---
date: 2026-11-10T12:25:08+01:00
researcher: Claude (Opus 5.5) z trzema pracownikami tylko do odczytu
git_commit: 61b6ffbfd1503391ea549e76d0b797dace55ce2e
branch: host-game-history
repository: most-likely-to
topic: "S-13: lista gier hosta i kasowanie gry (FR-019) — co jest powiązane z grą, jak wpiąć listę i kasowanie, co już zdecydowano"
tags: [research, s-13, host-game-history, fr-019, rooms, cascade, question-stats, host-panel]
status: complete
last_updated: 2026-11-10
last_updated_by: Claude (Opus 5.5)
---

# Research: S-13, lista gier hosta i kasowanie gry

**Date**: 2026-11-10T12:25:08+01:00
**Git Commit**: `61b6ffb` (`main` po PR #50)
**Branch**: `host-game-history`

## Research Question

Co w bazie wiąże się z pokojem (grą) i co skasowanie gry musi usunąć, a co zostawić; gdzie lista własnych gier
i kasowanie wpinają się w Worker i ekrany; co dzieje się na ekranach graczy, gdy pokój znika; co projekt już
zdecydował, obiecał albo odłożył do S-13 (FR-019).

## Summary

- **Baza już umie skasować grę jednym `delete from public.rooms`.** Żaden klucz obcy do `rooms` nie jest
  `restrict` ani `set null`; kaskada zabiera graczy, hashe tokenów, prośby, rundy, wyniki, urnę, kciuki,
  propozycje i listę pytań gry (tabela niżej, migracje M1–M15). `private.question_stats` nie ma klucza do pokoju
  ani gracza, więc zostaje (M9:53-81, pgTAP `round_creator_view.test.sql:1301-1308`). Nikt w repo nigdy nie
  kasował pokoju (`grep "delete from public.rooms"` w `supabase/migrations/`: 0 trafień), więc kaskada nie jest
  sprawdzona testem; jedno ryzyko to klucz `rounds (room_id, list_position) → game_questions` bez `on delete`
  (`20261024094002_question_list_review.sql:77-78`), przeglądane już w S-06 (F2, odłożone do S-13).
- **Kasowanie musi iść przez funkcję `security definer`.** Host nie ma grantu ani polityki `delete` na żadnej
  tabeli i nie widzi schematu `private` (M2:31-38, `revoke usage` M2:797). Wzór sprawdzenia „tylko host”:
  `set_cohost` (M10:595-643), odmowy jako `{ok:false, reason}`, grant tylko dla `authenticated`.
- **Kciuki czekające na odsłoniętej rundzie przepadłyby przy kasowaniu otwartej gry**, bo `fold_reactions`
  działa tylko w `next_round`, `more_questions` i `drop_round_state` (M10:261-263, M15:263-264, M14:389-390).
  Dla gry zamkniętej (`status='closed'`) nic nie czeka. Podwójne liczenie jest niemożliwe (liczniki bez klucza
  pokoju, nic ich nie odejmuje).
- **Lista gier:** zamknięty pokój zachowuje wiersz `rooms` (`created_at`, `started_at`), graczy z nickami,
  rundy z fazą i `round_results` (M2, M7; pgTAP T:1799-1817). „Kto grał” = `players.nick` (bez usuniętych
  wcześniej przez S-09), „data” = `started_at` albo `created_at`, „liczba pytań” wymaga odczytu `private.rounds`,
  czyli funkcji definer. Host czyta własne `rooms`/`players` przez RLS już dziś (`hostOpenRoomId`,
  `src/lib/rooms/server.ts:745-758`).
- **Dziś host widzi tylko swój jeden otwarty pokój** (`OpenRoomNotice`, `src/pages/index.astro:48-80`); zamknięte
  gry są nieosiągalne. Strona `/dashboard` to angielska pozostałość startera (`src/pages/dashboard.astro`,
  `PROTECTED_ROUTES` w `src/middleware.ts:5`, 3 kroki smoke `scripts/smoke.mjs:111,125,127`); słownik zabrania
  nazwy „dashboard” (`context/domain/glossary.md:54`).
- **Ekrany po skasowaniu gry:** gość z ciasteczkiem pokoju (żyje 24 h, `src/lib/rooms/tokens.ts:13`) dostaje na
  `/r/<id>` „Usunięto cię z pokoju.” (`src/pages/r/[id].astro:53,88-93`), bo `join_request_state` daje `none` dla
  nieistniejącego pokoju (`20261103151953_rejoin_after_refresh.sql:343`) — to ryzyko F6 z roadmapy. Host bez
  ciasteczka dostaje „Nie jesteś w tym pokoju.” (`[id].astro:56,87`). Link `/j/<kod>` zmienia się z 410 „Ta gra już
  się skończyła.” na 404 „Ten link nie działa.” (`src/pages/j/[token].astro:40-41,79-82`). Otwarta karta
  zamkniętej gry („Koniec wieczoru”) nie odpytuje serwera (`useRoomState.ts:169,174`), więc nic się w niej nie
  zmieni do ręcznego odświeżenia.
- **Decyzje produktowe do podjęcia w planie** (Open Questions): kasowanie tylko zamkniętych gier czy też otwartych;
  los zatwierdzonych propozycji i własnych pytań (FR-021 kontra prywatność, F3); znaczenie „liczby pytań” i „daty”;
  adres listy zamiast `/dashboard`; tekst dla gościa po skasowaniu gry; sprzątanie pokoi konta smoke; treść
  zdania „anonimowe dane o pytaniach zostają”. Kasowanie konta hosta nie ma FR (poza zakresem).

## Detailed Findings

### 1. Baza: co wisi na pokoju

Migracje: M1 `20261007122858_room_lobby`, M2 `20261014101922_first_live_round`, M3 `…_close_stale_games`,
M4 `…_full_game_evening`, M6 `…_latecomer_admission`, M7 `20261024094002_question_list_review`, M9
`20261026074427_question_play_data`, M10 `20261027121442_co_host_role`, M11 `…_player_color_choice`, M12
`…_remove_player`, M13 `20261103151953_rejoin_after_refresh`, M14 `…_guest_question_proposals`, M15
`…_game_length`. T = `supabase/tests/round_creator_view.test.sql`.

| tabela                                                    | klucz → `on delete`                                                                                        | związane z nickiem/graczem?                                                                       |
| --------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------- |
| `public.rooms`                                            | `host_id → auth.users` cascade (M1:21)                                                                     | konto hosta; `status` lobby/playing/closed (M2:42-43), `created_at` (M1:28), `started_at` (M2:51) |
| `public.players`                                          | `room_id → rooms` cascade (M1:36); `user_id → auth.users` cascade (M1:39)                                  | tak: `nick`, `seat`, `cohost`, `color`                                                            |
| `public.player_secrets`                                   | `player_id → players` cascade (M1:49-52)                                                                   | tak: `token_hash` gościa                                                                          |
| `public.join_requests`                                    | `room_id` cascade (M6:39-52); `player_id → players` cascade (M13:54)                                       | tak: `nick`, `token_hash`                                                                         |
| `private.rounds`                                          | `room_id` cascade (M2:112-126); `(room_id, list_position) → game_questions` **bez `on delete`** (M7:77-78) | częściowo: `eligible uuid[]` z id graczy, bez klucza                                              |
| `private.round_results`                                   | `round_id` cascade; `player_id → players` cascade (M2:130-135)                                             | tak: liczba głosów na gracza                                                                      |
| `private.ballot_boxes`, `private.round_voters` (unlogged) | `round_id` cascade (M2:141-153)                                                                            | tak: urna w toku                                                                                  |
| `private.round_reactions` (unlogged)                      | `round_id` cascade (M9:86-92)                                                                              | tak: kciuk gracza do złożenia                                                                     |
| `private.question_proposals` (unlogged)                   | `room_id`, `player_id` cascade (M14:65-76)                                                                 | tak: autor + tekst                                                                                |
| `private.game_questions`                                  | `room_id` cascade (M7:47-61)                                                                               | bez autora (T:1604-1610), ale tekst własny/zatwierdzony może nazywać osobę (S-06 F3)              |
| `private.question_stats`                                  | brak klucza (M9:53-81)                                                                                     | nie: zbiorcze, zostaje                                                                            |
| `private.stats_excluded_hosts`                            | brak klucza do `auth.users` (M9:94-98)                                                                     | nie; `counts_for_stats` łączy przez `rooms.host_id` (M9:114-126)                                  |

- Zamknięcie pokoju to zawsze `status='closed'` + `private.drop_round_state` w trzech miejscach: `create_room`
  („Nowa gra”, M11:120-135), `end_game` (M10:431-467), godzinne `close_stale_games` (M14:413-441, cron M3:42).
  Nic nie kasuje pokoi; sprzątanie zamyka grę i czyści urnę/prośby/propozycje.
- Po zamknięciu zostają: `rooms`, `players`, `player_secrets` (ciasteczko gościa nadal otwiera podsumowanie),
  `rounds`, `round_results`, `game_questions` (T:1799-1817, T:2509-2516). Znikają: urna, kciuki (złożone),
  prośby, propozycje (T:1883-1885, T:2505-2508).
- `counts_for_stats` dla nieistniejącego pokoju zwraca `true` (`not exists`, M9:120-125), więc złożenie kciuków
  musi nastąpić przed `delete`.
- Konwencje funkcji: `security definer`, `set search_path = ''`, `owner postgres`, `revoke … from public, anon,
authenticated`, grant tylko potrzebnej roli; odmowy jako dane, błędne wejście `raise … 22023`, wszystkie
  sprawdzenia przed pierwszym zapisem (np. `set_cohost` M10:595-643, grant M10:935).

### 2. Worker i ekrany

- Logowanie: `src/middleware.ts:7-32` (`locals.user`, przekierowanie z chronionych tras na `/auth/signin`);
  po logowaniu lądowanie na `/` (`src/pages/api/auth/signin.ts:30`, `callback.ts:51`).
- Wzór akcji hosta: `src/pages/api/rooms/[id]/cohost.ts` → `setCohost` (`server.ts:600-608`) → `callRpc`
  (`server.ts:102-118`) → `actionAnswer` (`json-route.ts:198-218`: 200, 409 `{error}`, 404 `not_found` dla
  `room_unknown`, 400, 503, 500). Ochrona: `refuseForeignPost` (415/403, `json-route.ts:44-55`), limit ciała
  4096 B. Po stronie przeglądarki `sendRoomAction` (`src/components/room/room-actions.ts:146-211`) obsługuje tylko
  trasy `/api/rooms/<id>/<akcja>`.
- Alternatywa formularzowa: „Nowa gra” to POST formularza z przekierowaniem (`src/pages/api/rooms/index.ts:92-131`),
  z potwierdzeniem przez ukryte `confirm_close=1` (`NewGameForm.tsx:192-224`).
- Nowe kody błędów: `MESSAGES` w `src/lib/rooms/errors.ts:51-113`; odmowy rundy/pokoju w `ROUND_REFUSALS`
  (`:16-43`), przypięte testem `tests/unit/room-errors.test.ts`.
- Brama RPC: `tests/unit/room-rpc-gate.test.ts` — nowa funkcja to wiersz `SQL_SIGNATURES` (`:41-206`) z
  `plik:linia` migracji, wpis `CASES` (`:256-543`) i ewentualnie `SUCCESS` (`:209-215`). Odczyty przez
  `supabase.from(...)` brama nie widzi (fałszywy klient ma tylko `rpc`).
- Logi tylko przez `logEvent` z polami `LOG_FIELDS` (`src/lib/log.ts:94-108`), bez nicków i treści listy.
- Ekrany: `AppHeader.astro` ma tylko logo i „Wyloguj”, bez maila (Karol streamuje na Discordzie, `:4-6`);
  shadcn w `src/components/ui`: alert, badge, button, card, checkbox, field, input, input-group, label,
  separator, spinner, textarea (brak dialogu i tabeli). Potwierdzenie w miejscu bez okienka:
  `RemovePlayerButton.tsx:37-161` („Na pewno usunąć …?” + „Anuluj”, `aria-live`, fokus przez `focus.ts`).
- Podglądy: `/dev/room-states` ma już stany `/` i `OpenRoomNotice` (`:770-813`) oraz „Usunięto cię z pokoju.”
  (`:1085-1095`). Nowa strona trafia na listę `scripts/ui-literals.mjs:8-18`.

### 3. Testy, których zmiana dotknie

- pgTAP `round_creator_view.test.sql`: `plan(424)` (T:65) do podbicia; skany prywatnych tabel (T:1005-1012);
  `function_facts` dla funkcji hosta (`… | execute: authenticated`, jak T:1394-1398); jedna wersja funkcji
  (T:525-534). Żaden test nie kasuje pokoju — test „po skasowaniu 0 wierszy, liczniki bez zmian” trzeba napisać
  (liczniki tylko jako przyrost, `test-plan.md:170`).
- `tests/db/`: jeden host na nowy plik (limit rejestracji), kontrola pozytywna, odmowy konkretne
  (`test-plan.md:171-206`); odroczone tam testy S-08 F1 („np. S-13”,
  `context/archive/2026-10-22-latecomer-admission/follow-ups/review-fixes.md:7-12`).
- e2e: host z zapisaną sesją (`tests/e2e/auth.setup.ts:6-30`), `openRoom` (`tests/e2e/support/room.ts:31-60`),
  wzór `remove-player.spec.ts` (404/410 linku, ekran usuniętego).
- smoke: loguje się kontem smoke i zakłada pokoje, które zostają („S-13 cleans up”, `scripts/smoke.mjs:3-5`;
  `AGENTS.md`); kroki `/dashboard` (`:111,125,127`), 410 starego linku (`:631,842`), 404 nieznanego (`:931`).

## Code References

- `supabase/migrations/20261007122858_room_lobby.sql:21,36,39` — kaskady od `auth.users` i `rooms`
- `supabase/migrations/20261024094002_question_list_review.sql:76-79` — klucz `rounds → game_questions` bez `on delete`
- `supabase/migrations/20261026074427_question_play_data.sql:53-81,114-126,131-153` — `question_stats`, `counts_for_stats`, `fold_reactions`
- `supabase/migrations/20261027121442_co_host_role.sql:431-467,595-643` — `end_game`, `set_cohost` (wzór „tylko host”)
- `supabase/migrations/20261103151953_rejoin_after_refresh.sql:339-345` — `join_request_state` → `none` dla braku pokoju
- `supabase/migrations/20261104095452_guest_question_proposals.sql:384-441` — `drop_round_state`, `close_stale_games`
- `src/pages/index.astro:48-80`, `src/components/room/OpenRoomNotice.astro:17-26` — dzisiejszy widok hosta
- `src/pages/dashboard.astro`, `src/middleware.ts:5` — pozostałość startera
- `src/pages/r/[id].astro:30-93`, `src/pages/j/[token].astro:40-41,79-82` — ekrany po zniknięciu pokoju
- `src/components/room/useRoomState.ts:169-206` — odpytywanie tylko otwartych pokoi, `notFound()` z jednym przeładowaniem
- `src/lib/rooms/server.ts:102-129,600-608,745-758`, `src/lib/rooms/json-route.ts:44-55,198-218` — wzór akcji
- `tests/unit/room-rpc-gate.test.ts:41-568` — brama RPC

## Architecture Insights

- Kasowanie gry to jedna nowa funkcja SQL hosta + jedna trasa Workera; reszta zrobi kaskada. Kolejność w funkcji:
  zablokować wiersz pokoju (`for update`), sprawdzić hosta, (dla otwartego pokoju) `drop_round_state`, dopiero
  potem `delete`.
- Lista gier potrzebuje liczby pytań z `private.rounds`, więc też funkcji definer (np. jedna funkcja zwracająca
  listę); RLS na `rooms`/`players` wystarcza tylko do daty i nicków.
- Zgodnie z S-04 i S-09 każdy nowy powód zniknięcia z pokoju dostaje własny tekst na `/r/<id>` (precedens: ślad
  `moved` w S-04, `rejoin-after-refresh/plan.md:31`).

## Historical Context (from prior changes)

- `context/foundation/prd.md:135-136` — FR-019 must-have; przycisk ma mówić, że anonimowe dane zostają („inaczej
  przycisk kłamie”). `:157` — automatyczne kasowanie po 30 dniach odrzucone. `:170-171,191` — panel tylko hosta,
  współhost bez dostępu. `:155` — o hoście tylko e-mail.
- `context/foundation/roadmap.md:273-283` — S-13: ryzyka F6 (ekran gościa) i kaskady propozycji (FR-021).
- `context/archive/2026-10-24-question-list-review/follow-ups/review-fixes.md:3-19` — decyzja Karola: F2 (test
  kasowania pokoju z rundą z listy, kolejność kluczy) i F3 (teksty własnych pytań w zakresie kasowania) na S-13.
- `context/archive/2026-10-26-question-reactions-play-data/research.md:223-224`, `plan.md:122-126` — liczniki
  projektowano tak, by przetrwały skasowanie gry; usunięcia z listy liczone przy starcie.
- `context/changes/guest-question-proposals/research.md:154`, `plan.md:49` — kaskada skasuje zatwierdzone
  propozycje przed przeglądem twórcy gry; „bez decyzji teraz”.
- `context/archive/2026-10-07-room-lobby/plan.md:601` — pokoje smoke „posprząta S-13 albo jednorazowa migracja”;
  `context/deployment/deploy-plan.md:53` zakazuje SQL w panelu, więc jednorazowe sprzątanie to migracja.
- `context/archive/2026-10-04-one-click-host-login/research.md:85,350` — brak polityki prywatności przyjęty do
  otwarcia gry dla obcych.

## Related Research

- `context/archive/2026-10-26-question-reactions-play-data/research.md`
- `context/archive/2026-10-24-question-list-review/research.md`
- `context/changes/remove-player-new-link/research.md`, `context/changes/guest-question-proposals/research.md`

## Open Questions

Decyzje produktowe (Karol, w `/10x-plan`):

1. **Które gry da się skasować:** tylko zamknięte (FR-019 mówi „past games”; otwarty pokój host zamyka „Zakończ
   grę” albo „Nową grą”) czy też otwarte (wtedy funkcja najpierw robi to co `end_game`, a ekrany graczy w grze
   dostają 404 i przeładowanie, `useRoomState.ts:198-206`).
2. **Zatwierdzone propozycje i własne pytania** (`private.game_questions`): kasować razem z grą (prywatność, S-06
   F3) czy zachować do przeglądu twórcy gry (FR-021, `deploy-plan.md:73-83`) — dokumenty są tu sprzeczne.
3. **Co pokazuje lista:** „liczba pytań” = odsłonięte, zagrane (odsłonięte + pominięte) czy liczba pytań gry;
   „data” = start gry czy założenie pokoju; czy pokazywać pokoje zamknięte bez startu.
4. **Adres i wejście:** nowa polska trasa zamiast `/dashboard` (zmiana `PROTECTED_ROUTES`, kroków smoke i
   `docs/development.md:142`) i link z `/` lub z nagłówka.
5. **Tekst dla gościa po skasowaniu gry** zamiast „Usunięto cię z pokoju.” (np. osobny stan w
   `join_request_state` dla braku pokoju) i dla hosta, który wejdzie w stary adres.
6. **Sprzątanie pokoi konta smoke:** smoke kasuje swoje pokoje na końcu przebiegu (nowa akcja) i/lub jednorazowa
   migracja dla starych.
7. **Zdanie o anonimowych danych** przy przycisku (wygląd i tekst na zrzutach).

Fakty do sprawdzenia testem w planie: kaskada z kluczem `rounds → game_questions` bez `on delete` w jednym
`delete` (S-06 F2); liczniki `question_stats` bez zmian po skasowaniu (przyrost 0).

Nieaktualne zapisy do poprawienia przy okazji: `context/foundation/test-stack.md:29` i `test-plan.md:330` („nic nie
zamyka ani nie kasuje do S-13”), `roadmap.md:383` („Czeka na S-11”), `domain-distillation.md:184` (D-06 sprzed
S-09). Kasowanie konta hosta: brak FR (tylko `prd.md:170` „prawo skasowania swoich danych”), poza zakresem S-13.
