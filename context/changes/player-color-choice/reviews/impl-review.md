<!-- IMPL-REVIEW-REPORT -->

# Implementation Review: Wybór koloru przez gracza (S-18)

- **Plan**: context/changes/player-color-choice/plan.md
- **Scope**: Full plan (fazy ukończone; faza 4 to wdrożenie i czeka na `db push`)
- **Reviewed phases**: 1, 2, 3
- **Date**: 2026-10-31
- **Verdict**: APPROVED
- **Findings**: 0 critical, 1 warning, 7 observations

## Verdicts

| Dimension           | Verdict |
| ------------------- | ------- |
| Plan Adherence      | PASS    |
| Scope Discipline    | PASS    |
| Safety & Quality    | PASS    |
| Architecture        | PASS    |
| Pattern Consistency | WARNING |
| Success Criteria    | PASS    |

Dowody, które przeszły:

- `create_room`, `join_room`, `admit_latecomer` i `room_lobby` w `20261031090821_player_color_choice.sql` porównane z najnowszymi definicjami (`first_live_round.sql:220`, `:308`, `co_host_role.sql:477`, `:667`). Różnią się tylko wstawieniem gracza z `private.free_color(...)` i kluczem `color` w obiekcie gracza. Nic ze współhosta, sum S-15 ani próśb S-08 nie zginęło. To jedyne trzy drogi `insert into public.players`; nie ma triggera ani kopii wierszy graczy.
- Kolejność w migracji zgodna z planem: kolumna bez `not null`, uzupełnienie `(seat - 1) % 20`, `set not null` i `check 0–19`, bez wartości domyślnej.
- `set_player_color`: 22023 dla złego koloru i tokenu, blokada wiersza pokoju przed kontrolą zajętego koloru, host po `auth.uid()`, gość po `sha256(token)` w swoim pokoju, `room_unknown` przed `room_closed` (nic nie wycieka), zapis tylko przy zmianie, `update … where id = v_player` (nikt nie zmieni cudzego koloru). `search_path = ''`, właściciel `postgres`, `revoke` przed `grant` dla `anon, authenticated`. `free_color` bez grantów. `players` dalej tylko `select` dla API (test REST: 42501).
- Kolor nie trafia do danych rundy, `question_stats` ani logów; `color.ts` loguje tylko `op`, `outcome`, `roomId`, `status` i kopiuje wzór `vote.ts`.
- Ekrany: tylko własna kropka jest przyciskiem („Twój kolor: <nazwa>. Zmień kolor”), kropki innych `aria-hidden` z `data-color`, zajęte kolory `aria-disabled` z „zajęty”, krzyżykiem i przygaszeniem (kolor nie jest jedynym nośnikiem). Zapamiętany kolor: najwyżej raz na pokój, nigdy w podglądzie, odmowa po cichu, `mlt-color` tylko po wyborze z palety. `ui-literals` czyta cały `src/components/room/`, więc obejmuje nowy plik.
- Bramki 31.10 na `9110471`: `npm run lint` (0 literałów w 46 plikach), `npx astro check` (0 błędów), `npm test` (802/802), `npm run build`, `prettier --check` dla zmienionych `.md`, `npx playwright test --list` (2 × `player-color.spec.ts`). CI na PR #32 zielone (`ci`, `smoke`, `db`, `e2e`). Gałąź łączy się z `origin/main` (`26dae42`) bez konfliktów.
- Dodatki spoza planu są uzasadnione: `bodyColor` w `json-route.ts` (walidacja ciała trasy, wzór `bodyRound`, 14 testów), paleta „Stonowana” w `global.css` (decyzja Karola w `change.md`), drobiazgi palety (Escape, fokus na własnym kolorze, „Wszystkie kolory są zajęte.”, podpowiedź) widoczne w podglądach ocenionych w 3.6.
- Ręczne: 1.5, 3.5 i 3.6 mają decyzje Karola w `change.md`; 2.3 czeka zgodnie z planem na `db push` w fazie 4.
- Poza ustaleniami: czerwone „Workers Builds” na gałęzi to budowanie gałęzi pobocznych w Cloudflare (czerwone też na PR #31 i #33), nie ta zmiana.

## Findings

### F1 — Po wyborze koloru kropka i czytnik przez chwilę pokazują stary kolor

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Pattern Consistency
- **Location**: src/components/room/PlayerColorPicker.tsx:90-95
- **Detail**: Po przyjętym wyborze `pick` od razu woła `close()`, który przenosi fokus na kropkę. Kolor kropki i jej nazwa dostępna biorą się z `players`, a te są jeszcze stare: `act()` tylko zleca `refresh()` i nie czeka (`RoomScreen.tsx:227`). Czytnik ekranu czyta „Twój kolor: <stary>”, widzący gracz widzi starą kropkę do przyjścia stanu, a ponowne otwarcie palety w tej chwili zaznacza stary kolor. Ta sama klasa co S-08 F4 i S-07 F1: `CohostButton.tsx:60-88` i `JoinRequests` czekają na odświeżony stan licznikiem `refreshes` i `acceptedAt`, a RoomLobby i RoundVoting już dostają `refreshes`.
- **Fix**: Trzymać „wysyłam” do chwili, gdy lista pokaże wybrany kolor albo przyjdzie stan odświeżony po przyjęciu (`refreshes > acceptedAt`), i dopiero wtedy zamknąć paletę i oddać fokus kropce.
- **Decision**: FIXED — `useColorPicker` dostaje `refreshes`; przyjęty wybór trzyma kółko do odświeżonego stanu (`color === sending` albo `refreshes > acceptedAt`, jak `CohostButton`), dopiero wtedy paleta się zamyka, a fokus wraca na kropkę z nowym kolorem.

### F2 — Uzupełnienie koloru padnie na wierszu z `seat` mniejszym niż 1

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: supabase/migrations/20261031090821_player_color_choice.sql:42 (po poprawce :44)
- **Detail**: `(seat - 1) % 20` zakłada `seat >= 1`, a kolumna nie ma takiej kontroli (`*_room_lobby.sql:41`), a od 07.10 do `first_live_round` zalogowany miał `insert` na `players` bez ograniczenia `seat`. Wiersz z `seat <= 0` daje ujemną resztę, `players_color_check` odrzuca całą migrację i `db push` się cofa. Dane się nie psują, ale wdrożenie stanęłoby. Migracja nie jest jeszcze wgrana, więc wolno ją zmienić.
- **Fix**: `update public.players set color = ((seat - 1) % 20 + 20) % 20;` z jednym zdaniem komentarza.
- **Decision**: FIXED — `((seat - 1) % 20 + 20) % 20` z komentarzem; odwołania `plik:linia` w `room-rpc-gate.test.ts` przesunięte o 2.

### F3 — Pamięć „już poprosiłem” trzyma tylko jeden pokój na kartę

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: src/lib/rooms/remembered-nick.ts:121-131
- **Detail**: `mlt-color-asked` to jedno id pokoju. Karta w pokoju A (gra w toku) → pokój B → z powrotem A: `colorAskedIn(A)` daje false i ekran prosi o zapamiętany kolor drugi raz. `mlt-color` jest wspólny dla kart, więc mógł zostać wybrany w B, i graczowi zmienia się kolor w A bez dotknięcia, wbrew komentarzowi w `RoomScreen.tsx:254-256`. Rzadkie na wieczorze, ale tani do zamknięcia.
- **Fix**: Trzymać w tym samym kluczu krótką listę id pokojów (np. 10 ostatnich) zamiast jednego, z testem „A → B → A nie prosi drugi raz”.
- **Decision**: FIXED — `mlt-color-asked` trzyma do 10 ostatnich pokojów (`COLOR_ASKED_ROOMS`), stara wartość z jednym id czyta się jako jeden pokój; testy A → B → A, ponowny pokój na koniec, 11. pokój, stara wartość.

### F4 — Dotknięcie koloru, który gracz już ma, nie zapamiętuje go

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Adherence
- **Location**: src/components/room/PlayerColorPicker.tsx:84-87
- **Detail**: Gdy gracz dostał kolor od gry, polubił go i dotknął go w palecie, `pick` tylko zamyka paletę, bez zapisu do `mlt-color`. W następnej grze dostaje pierwszy wolny kolor, choć świadomie wybrał ten. Plan: zapis „po przyjętym wyborze gracza z palety”; dotknięcie własnego koloru to też wybór.
- **Fix**: Dotknięcie własnego koloru zapisuje go w `mlt-color` (bez prośby do serwera) i zamyka paletę; test jednostkowy albo krok w E2E.
- **Decision**: FIXED — `RoomScreen.setColor`: własny kolor zapamiętany bez prośby do serwera; nowy scenariusz e2e „zatrzymany kolor”, opis w `test-plan.md` §6.4.

### F5 — W trakcie gry kolor da się zmienić dopiero po oddaniu głosu

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Success Criteria
- **Location**: src/components/room/RoundVoting.tsx:297-325
- **Detail**: Lista „Gracze” (a z nią własna kropka) jest w głosowaniu tylko po oddaniu głosu i u spóźnionego, który jeszcze nie głosuje; przed głosem, na odsłonie i po pominięciu jej nie ma. Tak było już przed zmianą (`origin/main`, `RoundVoting.tsx:253-276`) i plan nie dodaje list w nowych miejscach, więc to nie błąd. Ręczna kontrola 4.4 („zmianę w trakcie gry widać na kole odsłony”) tego nie mówi i ekipa może szukać kropki przed głosem.
- **Fix**: Dopisać w 4.4 planu: „w trakcie gry kolor zmienia się po oddaniu głosu”.
- **Decision**: FIXED — notatka przy fazie 4 i krok 3 „Manual Testing Steps” w planie (tytuł 4.4 bez zmian, konwencja Progress).

### F6 — Escape na kropce nie zamyka otwartej palety

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: src/components/room/PlayerColorPicker.tsx:192-194
- **Detail**: Escape działa tylko z fokusem w palecie. Gdy fokus wrócił na kropkę, a paleta jest otwarta (`aria-expanded=true`), Escape nic nie robi. Reszta klawiatury jest w porządku (fokus na własnym kolorze po otwarciu, powrót na kropkę po zamknięciu).
- **Fix**: Ten sam `onKeyDown` z Escape na przycisku kropki, gdy paleta jest otwarta.
- **Decision**: FIXED — `onKeyDown` z Escape na kropce, gdy paleta jest otwarta.

### F7 — Kontrola „kolor z palety 0–19” powtórzona w trzech miejscach

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Pattern Consistency
- **Location**: src/lib/rooms/shared.ts:207, src/lib/rooms/remembered-nick.ts:69, src/lib/rooms/json-route.ts:176
- **Detail**: Ta sama kontrola (liczba całkowita 0 … `MAX_PIE_SLICES - 1`) jest napisana trzy razy. Dziś są zgodne; przy zmianie wielkości palety trzeba pamiętać o wszystkich trzech.
- **Fix**: Jedna eksportowana `isPaletteColor` w `chart.ts`, użyta w trzech miejscach.
- **Decision**: SKIPPED — Karol 2026-10-31: sam porządek w kodzie, dziś trzy zgodne kontrole.

### F8 — Tytuł PR #32 mówi „faza 1: baza”

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Success Criteria
- **Location**: N/A (PR #32)
- **Detail**: PR ma fazy 1–3, a tytuł dalej „S-18: wybór koloru przez gracza (faza 1: baza)”. Przy S-07 tytuł i opis poprawiono przed scaleniem.
- **Fix**: `gh pr edit 32 --title "S-18: wybór koloru przez gracza (fazy 1–3)"` i opis z trzema fazami, przy przełączeniu PR na gotowy w fazie 4.
- **Decision**: ACCEPTED — tytuł i opis PR #32 poprawiam zaraz po pushu poprawek (push za zgodą Karola).

## Triage

Karol 2026-10-31: „tak” na poprawki F1–F6 i F8, F7 pominięte.

- Fixed: F1, F2, F3, F4, F5, F6 (6)
- Accepted: F8 (po pushu poprawek)
- Skipped: F7 (1)

Po poprawkach: `npm run lint`, `npx astro check`, `npm test` (805/805), `npm run build`, `npx playwright test --list` (3 × `player-color.spec.ts`), `prettier --check` zielone. Paleta przeklikana w `/dev/room-states` (podgląd 110, headless Chrome): Escape na kropce i w palecie zamyka, fokus po otwarciu na własnym kolorze, po zamknięciu na kropce, dotknięcie własnego koloru zamyka paletę, wolny kolor czeka z kółkiem (w podglądzie odświeżony stan nie przychodzi, jak przy `CohostButton`). Zmiana z czekaniem na stan i zapamiętaniem własnego koloru w prawdziwym pokoju: CI `e2e` („gość wybiera kolor”, „zatrzymany kolor”), bo serwer dev łączy się z produkcyjną bazą bez tej migracji.
