<!-- IMPL-REVIEW-REPORT -->

# Implementation Review: Powrót po odświeżeniu (S-04)

- **Plan**: context/changes/rejoin-after-refresh/plan.md
- **Scope**: Full plan (fazy ukończone; w fazie 5 czeka tylko 5.4, gra z ekipą)
- **Reviewed phases**: 1, 2, 3, 4
- **Date**: 2026-11-03
- **Verdict**: NEEDS ATTENTION
- **Findings**: 0 critical, 4 warnings, 5 observations

## Verdicts

| Dimension           | Verdict |
| ------------------- | ------- |
| Plan Adherence      | WARNING |
| Scope Discipline    | PASS    |
| Safety & Quality    | WARNING |
| Architecture        | PASS    |
| Pattern Consistency | PASS    |
| Success Criteria    | WARNING |

Dowody, które przeszły:

- Migracja `20261103151953_rejoin_after_refresh.sql` przeczytana w całości: `security definer`, `search_path = ''`, właściciel `postgres`, `revoke` i selektywny grant dla sześciu funkcji; pięć zastąpionych funkcji porównanych z ich ostatnimi wersjami: tylko zamierzone zmiany, sygnatury bez zmian. Wiersz pokoju blokowany pierwszy, wszystkie sprawdzenia przed pierwszym zapisem. `admit_latecomer` i `reject_latecomer` najpierw `private.leader_refusal`. Ślad `moved` nie ma drogi do `{ok:true}` ani do miejsca. Dotykane wiersze przechodzą nowe `check`.
- Anonimowość: brak nowego odczytu `private.ballot_boxes`, `VOTING_ROUND_KEYS` i odpowiedź `cast_vote` bez zmian, przepięcie rusza token, nie głos, `my-vote.ts` pisze tylko do `sessionStorage`, logi tylko pola dozwolone.
- Worker i ekrany: nicki renderowane przez JSX i Astro (bez `set:html`), przekierowania na sprawdzony kod linku, `mlt_taken_nick` z tymi samymi flagami co ciasteczko pokoju, nick nigdy w adresie. Bez literałów kolorów. `RoomLobby.tsx` z listy planu bez zmian, bo `RoomScreen.tsx:454` renderuje `JoinRequests` w każdym stanie poza `closed`.
- Pliki spoza listy planu są konsekwencją planu: `room-actions.ts` (komentarz), `tokens.ts` (ciasteczko nicku), `remembered-nick.ts` (`removeItem`, `op`), `admit.ts` (`cohost_returns_by_host`), fikstury `returning: []`, `remembered-nick.spec.ts` (wyrocznia po wariancie C).
- Bramki 2026-11-03 na kodzie z `main` (`4de89bf`): `npm run lint`, `npx astro check` (0 błędów), `npm test` (889/889), `npm run build`, `npx playwright test --list` (5 × `rejoin.spec.ts`), `npx supabase migration list` (`20261103151953` lokalnie i zdalnie). CI zielone na `d045dd3` (`ci`, `smoke`, `db`, `e2e`). Próbne alarmy w historii: `44a4fdc` → `f210448`, `e044788` → `316bf64`, `da8485f` → `1f58689`, `2dcd66c` → `de88dce`. Smoke na produkcji 109/109 na `4de89bf`.
- Ręczne: 2.5, 3.4, 4.4, 4.5 z decyzjami Karola; 5.4 czeka na grę z ekipą.

## Findings

### F1 — Druga karta w poczekalni: prośba o powrót przeżywa dołączenie pod innym nickiem

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Safety & Quality
- **Location**: src/pages/api/rooms/join.ts:104
- **Detail**: Gość prosi o powrót na nick Ala (token T w ciasteczku, ekran czekania). Z drugiej karty albo strony przywróconej przyciskiem Wstecz wysyła formularz z innym nickiem. Poczekalnia zawsze tworzy nowy token: `join_room` zakłada Boba i nadpisuje ciasteczko, a prośba z T zostaje na liście prowadzącego. Strażnik w `admit_latecomer` (`exists … player_secrets`) przepuszcza T, bo T nie jest graczem. „Wpuść” przepina miejsce Ali na token, którego nie ma żadna przeglądarka, a prawdziwa Ala widzi „Grasz teraz na innym urządzeniu.” i musi sama poprosić o powrót. Prośby nie da się anulować. W trakcie gry tej dziury nie ma: `request_join` z oczekującą prośbą odpowiada `{ok:true}` bez zmian. Komentarz `20261103151953_rejoin_after_refresh.sql:461-462` zakłada wejście tym samym tokenem, którego Worker nie robi.
- **Fix**: Przed `joinRoom`, gdy ciasteczko ma token w dobrej formie, sprawdzić `joinRequestState` i przy `pending` wrócić 303 na `/j/<kod>` (ekran czekania); scenariusz w `rejoin.spec.ts`.
  - Strength: Bez migracji, ta sama reguła co w grze: czekający czeka pod nickiem, o który prosił.
  - Tradeoff: Jedno wywołanie RPC więcej, tylko dla przeglądarki z ciasteczkiem pokoju, które nie otwiera pokoju.
  - Confidence: HIGH — ścieżka prześledzona w kodzie; `/j/<kod>` już robi to samo sprawdzenie (`src/pages/j/[token].astro:57-66`).
  - Blind spot: Gość czeka aż prowadzący odrzuci prośbę; przycisku „anuluj” dalej nie ma (tak samo u spóźnionego).
- **Decision**: FIXED: `join.ts` przed `joinRoom` sprawdza `joinRequestState`, przy `pending` wraca na ekran czekania; e2e „druga karta w poczekalni”.

### F2 — `online` i `pageshow` bez żadnego testu, a 1.5 pominięte

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Success Criteria
- **Location**: src/components/room/useRoomState.ts (nasłuchy), tests/e2e/rejoin.spec.ts
- **Detail**: Stan końcowy planu obiecuje doganianie „natychmiast” po powrocie sieci. Grep po `tests/` nie znajduje ani `online`, ani `pageshow`, ani `setOffline`. Scenariusz „martwe gniazdo” dowodzi odpytywania, nie nasłuchu, a ręczne 1.5 Karol świadomie pominął. Usunięcie nasłuchów nie zapaliłoby niczego.
- **Fix**: Scenariusz e2e: po `sleep()` i pobraniu z odpytywania wysłać `online` na `window` i wymagać pobrania wyraźnie przed następnym odpytaniem; próbny alarm bez nasłuchu.
- **Decision**: FIXED: e2e „po powrocie sieci” (`online` i `pageshow` z `persisted`).

### F3 — Dwie gałęzie kontraktu bez testu

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Adherence
- **Location**: tests/db/rejoin.test.ts, supabase/migrations/20261103151953_rejoin_after_refresh.sql:173, :299-305
- **Detail**: (a) `request_return` z tokenem, który ma ślad `moved`: nikt tego nie wywołuje, a to jedyna droga powrotu po pomyłkowym „Wpuść”. Kontrakt 3.1 („ślad nigdy nie daje `{ok:true}` bez prośby”) nie ma dowodu dla tej funkcji. (b) Odrzucona prośba o powrót, która prosi potem przez `request_join`: `player_id = null` z linii 173 nie jest sprawdzone; regresja sprawiłaby, że „Wpuść” przepnie miejsce zamiast dodać spóźnionego. Jedyny `request_join` ze starym tokenem (`rejoin.test.ts:219`) idzie gałęzią śladu.
- **Fix**: Dwa przypadki w `tests/db/rejoin.test.ts`.
- **Decision**: FIXED: drugi pokój w `tests/db/rejoin.test.ts` (obie gałęzie).

### F4 — Tekst `nick_taken` nie wskazuje drogi powrotu

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Adherence
- **Location**: src/lib/rooms/errors.ts:50, src/pages/j/[token].astro:107
- **Detail**: Kontrakt 4.1 mówi, że tekst wskazuje nową drogę. Zwykle zastępuje go pytanie „To ty?”, ale bez ciasteczka nicku (po 10 minutach, adres otwarty ponownie) strona pokazuje samo „Ten nick ma już ktoś w tej grze.”, bez przycisku i bez rady. Wcześniejszy tekst mówił, żeby wpisać inny nick.
- **Fix**: „Ten nick ma już ktoś w tej grze. Wpisz inny albo, jeśli to twój, wpisz go jeszcze raz i poproś o powrót.”
- **Decision**: FIXED: nowy tekst `nick_taken`.

### F5 — Wyjątek w zasadach nie wymienia gracza przeniesionego

- **Severity**: 🔵 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Adherence
- **Location**: AGENTS.md (Hard Rules), context/foundation/prd.md:152, src/lib/rooms/my-vote.ts:10-11
- **Detail**: Plan 2.3 mówi „gracz usunięty albo przeniesiony”, teksty wymieniają tylko usuniętego i zamknięty pokój. Ekran `moved` nie ma wyspy, która skasowałaby wpis, więc stara karta trzyma cel głosu do zamknięcia. Ogólna klauzula to obejmuje, więc to nie naruszenie, ale przykład jest niepełny.
- **Fix**: Dopisać przypadek przeniesionego do trzech tekstów.
- **Decision**: FIXED: przeniesiony dopisany w AGENTS.md, PRD i `my-vote.ts`.

### F6 — „To ty?” przy nicku czekającego spóźnionego

- **Severity**: 🔵 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: src/pages/api/rooms/join.ts:98, supabase/migrations/20261103151953_rejoin_after_refresh.sql:153-160
- **Detail**: W grze `request_join` odpowiada `nick_taken` także wtedy, gdy nick ma inny czekający spóźniony, który nie jest graczem. Strona pyta „X już gra w tym pokoju. To ty…?”, a po kliknięciu pokazuje `return_unknown` z radą, żeby wpisać inny nick. Sam się prostuje, a odróżnienie wymaga nowej migracji.
- **Fix**: Bez zmian; przy następnej migracji tych funkcji osobny kod odmowy.
- **Decision**: ACCEPTED: sam się prostuje, a odróżnienie wymaga migracji; przy następnej zmianie `request_join`.

### F7 — Ciasteczko nicku przy każdej odmowie powrotu

- **Severity**: 🔵 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: src/pages/api/rooms/join.ts:90
- **Detail**: `backWithNick` zapisuje nick także przy odmowach, których `/j/` nie czyta (`return_unknown`, `invalid_nick`), bez limitu długości. Dotyczy tylko nadawcy i ręcznie spreparowanego POST-a: pole formularza ma limit, a ciasteczko żyje 10 minut.
- **Fix**: Bez zmian.
- **Decision**: ACCEPTED: dotyczy tylko nadawcy i spreparowanego POST-a.

### F8 — Dwa brzegowe przypadki śladu `moved`

- **Severity**: 🔵 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: supabase/migrations/20261103151953_rejoin_after_refresh.sql:464-467, src/pages/r/[id].astro:54
- **Detail**: (a) `join_requests.token_hash` jest unikalny między pokojami, a czyszczenie śladu działa w jednym pokoju, więc token z prośbą w innym pokoju da przy „Wpuść” 23505 i 500. Worker nigdy tak nie robi (osobny token na pokój); wymaga bezpośredniego RPC i szkodzi tylko temu gościowi. (b) Gdy nowy posiadacz przeniesionego miejsca zostanie usunięty, stare urządzenie dalej czyta „Grasz teraz na innym urządzeniu.”: zły jest tylko tekst.
- **Fix**: Bez zmian; przy następnej migracji `on conflict (token_hash) do nothing` i kasowanie śladu w `remove_player`.
- **Decision**: ACCEPTED: (a) tylko bezpośrednie RPC i szkoda samego gościa, (b) tylko tekst; przy następnej migracji tych funkcji.

### F9 — Komentarze i dokumenty po zmianach

- **Severity**: 🔵 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Adherence
- **Location**: src/pages/api/rooms/[id]/lobby.ts:10, src/pages/api/rooms/[id]/reject.ts:9, src/components/room/JoinForm.tsx:73, src/components/room/JoinRequests.tsx:11, context/domain/glossary.md:47, context/changes/rejoin-after-refresh/plan.md:347, :361
- **Detail**: `lobby.ts` dalej mówi o 15 s, `reject.ts` o samej grze (działa też w poczekalni). Komentarze odsyłają do „Faza 4, 4.4” po warianty C i E, a folder zmiany ich nie nazywa. Słownik definiuje „miejsce” jako `seat`, a prośba o powrót używa go szerzej. W Progress 1.5 i 2.6 są odhaczone, choć Karol je świadomie pominął (2.6 z SHA); pomiar budżetu 8 s nie trafił do komunikatu asercji (CI: całe testy 3,1 s i 1,7 s, zapas ponad 2 s), podgląd 122 stoi przy 35, nie na końcu.
- **Fix**: Poprawić komentarze i słownik, warianty C, E i T1 zapisać w `change.md`, resztę zostawić w tym raporcie.
- **Decision**: FIXED: komentarze `lobby.ts` i `reject.ts`, słownik, Progress 1.5 i 2.6 (pominięte za zgodą Karola), 4.4 (warianty C, E, T1 zapisane tu zamiast w `change.md`, więc komentarze kodu mają pokrycie). Pomiar budżetu 8 s i miejsce podglądu 122 zostają tylko w tym raporcie.
