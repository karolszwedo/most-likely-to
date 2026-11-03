<!-- IMPL-REVIEW-REPORT -->

# Implementation Review: Usunięcie gracza i nowy link (S-09)

- **Plan**: context/changes/remove-player-new-link/plan.md
- **Scope**: Full plan (fazy ukończone; w fazie 4 czeka tylko 4.4, gra z ekipą)
- **Reviewed phases**: 1, 2, 3
- **Date**: 2026-11-02
- **Verdict**: NEEDS ATTENTION
- **Findings**: 0 critical, 2 warnings, 5 observations

## Verdicts

| Dimension           | Verdict |
| ------------------- | ------- |
| Plan Adherence      | PASS    |
| Scope Discipline    | PASS    |
| Safety & Quality    | WARNING |
| Architecture        | PASS    |
| Pattern Consistency | WARNING |
| Success Criteria    | PASS    |

Dowody, które przeszły:

- `remove_player` (`20261101125331_remove_player.sql`): `security definer`, `search_path = ''`, właściciel `postgres`, `revoke` i grant `anon, authenticated`; blokada wiersza pokoju `for update` na początku; odmowy w kolejności planu (22023 i `room_unknown`/`not_leader` z `private.leader_refusal`, `room_closed`, `player_unknown` z nickiem hosta, nickiem > 100 znaków i drugim usunięciem, `cohost_protected`) i wszystkie przed pierwszym zapisem; z `eligible` zdejmowany tylko ten, kogo nie ma w `round_voters`, potem próg jak w `cast_vote` → `private.finish_round`; `tally` nieczytane; kciuk, gracz, nowy `link_token` jak w `create_room`; odpowiedź dokładnie `{ok: true}`.
- `room_lobby` porównana z `20261031090821_player_color_choice.sql:413`: różni się tylko zmienną `v_link_token`, `r.link_token` w pierwszym `select` i kluczem `link_token` dla `v_leader` (komentarz funkcji zmieniony zgodnie z planem); kolory S-18, współhost i sumy S-15 nietknięte.
- Worker: `parseLobbyState` wymaga `link_token` (22 znaki albo `null`), `roomView` wyjmuje kod ze stanu i buduje `linkUrl` tylko prowadzącemu, `parseRoomView` odrzuca `linkUrl` u nie-prowadzącego, `hostLinkToken` usunięty; `remove.ts` linia w linię jak `reject.ts` (nick tylko w ciele, nigdy w logu, dzwonek po sukcesie, 404/400/409).
- Ekrany: `mayRemove` (host przy każdym gościu, współhost przy gościach bez roli, nigdy przy hoście ani przy sobie); pytanie i „Anuluj” w wierszu, wiersz zajęty aż do `refreshes` jak `CohostButton`; `remove` poza `VIEW_CHANGING`, osobny `removal` dla fokusu; link prowadzących w poczekalni i nad widokiem rundy (D), szara linijka (G), T2, ekran usuniętego R4 (wybór Karola w 3.5).
- Spoza listy plików planu, bez zmian w działaniu: `json-route.ts` i `useRoomState.ts` (tylko komentarze). `scripts/ui-literals.mjs` z planu nie wymagał edycji: `VIEWS` czyta cały katalog `src/components/room` (0 literałów w 48 plikach).
- Bramki 2026-11-02 na `main` (`80a6ea1`): `npm run lint`, `npx astro check` (0 błędów), `npm test` (842/842), `npm run build`, `prettier --check` zmienionych `.md`, `npx playwright test --list` (2 × `remove-player.spec.ts`), `npx supabase migration list` (`20261101125331` lokalnie i zdalnie). CI zielone na `fce3947`, `fd2fd98`, `4190bb8`; próbne alarmy trafiły: `546b916` zapalił tylko `db`, `0b66374` tylko `e2e`, po revertach (`391221d`, `cd46a1e` → `4190bb8`) zielono. Smoke na produkcji zielony na `62ccb30`.
- Ręczne: 1.5, 3.5, 3.6 z decyzjami Karola w Progress; 2.3 smoke na serwerze dev po `db push`; 4.4 czeka na grę z ekipą.

## Findings

### F1 — Podwójne kliknięcie „usuń” u hosta przełącza współhosta

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Safety & Quality
- **Location**: src/components/room/RemovePlayerButton.tsx:110 (wiersze w `RoomLobby.tsx:243-259`, `RoundVoting.tsx:273-289`)
- **Detail**: Po pierwszym naciśnięciu pigułka „usuń” staje się pytaniem w osobnej linii (`flex basis-full`), więc przełącznik „współhost” z tego samego wiersza przesuwa się na jej miejsce. Sprawdzone w Chrome na `/dev/room-states` (`#cohost-host-sending`, laptop 1280 px i telefon 390 px): po pierwszym kliknięciu pod kursorem jest przełącznik współhosta, u Kasi `aria-pressed=false`, u Bartka `true`. Drugie szybkie kliknięcie (dwuklik, nerwowe dwa stuknięcia) nada gościowi rolę współhosta albo ją odbierze; współhost może usuwać innych i prowadzić rundy. Dotyczy tylko widoku hosta (u współhosta przełącznika nie ma).
- **Fix A ⭐ Recommended**: Gdy pytanie jest otwarte, pigułka zostawia na swoim miejscu niewidoczny zastępnik tej samej szerokości, więc nic się nie przesuwa
  - Strength: Zmiana w jednym komponencie (`RemovePlayerButton`), bez nowego stanu w listach; wiersz przestaje „skakać”, a pod kursorem po pierwszym kliknięciu nie ma nic klikalnego.
  - Tradeoff: Mała zmiana wyglądu (przełącznik zostaje na miejscu, a obok niego pusta przestrzeń, dopóki pytanie jest otwarte), więc zrzut do akceptacji Karola.
  - Confidence: HIGH — pozycje sprawdzone w przeglądarce; zastępnik `invisible` + `aria-hidden` nie wchodzi do drzewa dostępności.
  - Blind spot: Wąski telefon, gdzie wiersz i tak się zawija; do sprawdzenia tym samym skryptem.
- **Fix B**: Gdy pytanie jest otwarte, przełącznik współhosta w tym wierszu jest wyłączony
  - Strength: Wprost mówi „najpierw dokończ pytanie”.
  - Tradeoff: Stan „pytanie otwarte” trzeba podnieść z `RemovePlayerButton` do obu list; przełącznik i tak się przesuwa pod kursor, tylko nie reaguje.
  - Confidence: MEDIUM — więcej miejsc do zmiany i do testów.
  - Blind spot: Jak wyłączony przełącznik czyta czytnik ekranu.
- **Decision**: FIXED via Fix A (2026-11-02): `RemovePlayerButton` zostawia niewidoczny zastępnik pigułki, gdy pytanie jest otwarte. Dwuklik w Chrome na `/dev/room-states`: przed poprawką przełącznik Bartka przechodził w wysyłanie, po poprawce nie; zrzuty przed/po, Karol: „elegancko wyszło”.

### F2 — Usunięty gracz zostaje na publicznym kanale pokoju

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Safety & Quality
- **Location**: src/lib/live-sync/shared.ts:24 (`topicFor`), src/components/room/RoomScreen.tsx:134
- **Detail**: Temat kanału to `live-sync:<roomId>`, a usunięty zna id pokoju z adresu `/r/<id>`. Z kluczem publishable może dalej oglądać emotki z nickami i dzwonek, a także nadawać emotki pod nickiem dowolnego obecnego gracza (odbiorca sprawdza tylko, czy nick jest na liście). S-16 przyjęło to świadomie dla „kogoś, kto zna UUID” (`context/archive/2026-10-26-room-emotes/plan.md`, „What We're NOT Doing”), ale S-09 jest właśnie po to, żeby kogoś wyprosić, a usunięty taki UUID ma zawsze. Głosów ani wyników kanał nie niesie, stan pokoju (`room_lobby`) usuniętemu odmawia.
- **Fix A ⭐ Recommended**: Przyjąć jako znaną granicę i zapisać ją w planie S-09 („What We're NOT Doing”), w słowniku przy „usunięciu gracza” i w roadmapie (Parked: prywatny kanał albo temat zmieniany razem z linkiem)
  - Strength: Zgodne z decyzją z S-16; wśród znajomych ryzyko to co najwyżej psotne emotki, które host ucina, zaczynając nową grę.
  - Tradeoff: Troll po usunięciu dalej może psocić emotkami pod cudzym nickiem do końca gry.
  - Confidence: MEDIUM — zależy od tego, jak ekipa używa gry.
  - Blind spot: Nie sprawdzone, czy Supabase Realtime ma limity, które by to dodatkowo ograniczały.
- **Fix B**: Osobna zmiana: temat kanału z sekretu pokoju, który dostają tylko gracze przez `room_lobby` i który zmienia się przy usunięciu (albo prywatny kanał z autoryzacją Realtime)
  - Strength: Usunięty naprawdę traci kanał; przy okazji zamyka dziurę „kto zna UUID” z S-16.
  - Tradeoff: Zmiana dzwonka i emotek dla wszystkich (migracja, Worker, wyspa, testy e2e), pełny cykl planu.
  - Confidence: MEDIUM — wymaga researchu Realtime.
  - Blind spot: Ponowna subskrypcja przy zmianie tematu w trakcie gry.
- **Decision**: ACCEPTED via Fix A (Karol 2026-11-02): granica zapisana w planie S-09 („What We're NOT Doing”) i w roadmapie (Parked: „Kanał na żywo tylko dla graczy pokoju”). Słownik bez zmian: wpis „usunięcie gracza” to tabela nazw, granica stoi w planie i roadmapie.

### F3 — Po usunięciach gra może iść dalej z mniej niż 3 głosującymi

- **Severity**: 🔵 OBSERVATION
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Safety & Quality
- **Location**: supabase/migrations/20261101125331_remove_player.sql:122-139
- **Detail**: Minimum 3 graczy sprawdza tylko `start_game` (`co_host_role.sql:168`); `next_round` i `skip_round` go nie mają. Przed S-09 nikt nie wychodził z listy, teraz gra może zejść do 2 graczy, a przy 2 głosach każdy wie, na kogo głosował drugi (e2e `remove-player.spec.ts:81-85` odsłania „Host 0, Ola 2” z dwóch głosów). To nie nowa klasa: prowadzący już dziś może odsłonić rundę po 2 głosach. Plan i research tego nie omawiały.
- **Fix A ⭐ Recommended**: Przyjąć i dopisać zdanie w planie S-09 („What We're NOT Doing”): gra we dwoje nie ma sensu i obaj gracze to widzą
  - Strength: Bez kodu; nie blokuje prowadzącego, który usunął kogoś w trzyosobowej grze.
  - Tradeoff: Dwie osoby mogą grać dalej i znać swoje głosy.
  - Confidence: HIGH — taki sam skutek daje dziś wczesna „Odsłoń wynik”.
  - Blind spot: None significant.
- **Fix B**: Nowa migracja: `next_round` i `skip_round` odmawiają `not_enough_players` poniżej 3 uprawnionych
  - Strength: Zasada „co najmniej 3” trzyma się przez cały wieczór.
  - Tradeoff: Prowadzący utknie w grze, zostanie mu „Zakończ grę”; migracja dwóch funkcji i testy.
  - Confidence: MEDIUM — trzeba przejrzeć ekran odsłony z tą odmową.
  - Blind spot: Co ze spóźnionymi wpuszczanymi w tej chwili.
- **Decision**: ACCEPTED via Fix A (Karol 2026-11-02): zdanie w planie S-09 („What We're NOT Doing”).

### F4 — Cel fokusu po „usuń” zapisany dopiero po odpowiedzi serwera

- **Severity**: 🔵 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: src/components/room/RoomScreen.tsx:296
- **Detail**: `remove` ustawia `removal.current` po `await act(...)`, a `act` ustawia `movedFrom` przed wysłaniem. Gdy pobranie stanu po dzwonku albo odpytaniu wróci przed odpowiedzią na POST, efekt fokusu przejdzie przy `removal.current === null`; kolejne pobrania dają ten sam JSON, więc widok się nie zmienia: fokus zostaje na `body`, „Usunięto X.” nie pada, a stare `removal` odpali przy jakiejś późniejszej zmianie widoku. Rzadkie.
- **Fix**: Ustawić `removal.current` przed wysłaniem (efekt i tak czeka, aż nicka nie będzie na liście) i czyścić przy odmowie, jak `movedFrom`.
- **Decision**: FIXED (2026-11-02): `removal.current` ustawiany przed wysłaniem i czyszczony przy odmowie (`RoomScreen.tsx`).

### F5 — Luki w testach usunięcia

- **Severity**: 🔵 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: tests/db/remove-player.test.ts, supabase/tests/round_creator_view.test.sql, tests/db/cohost.test.ts:470-478
- **Detail**: Kod jest poprawny, ale nie przypięte są: skasowanie kciuka usuniętego z `private.round_reactions` (decyzja 4; regresja wliczyłaby go po cichu do `question_stats`), `remove_player` z tokenem usuniętego współhosta i czekającego spóźnionego (`room_unknown`), `remove_player` w macierzy `MOVES` w `cohost.test.ts`, sumy podsumowania (`game_totals`) bez usuniętego, nick dłuższy niż 100 znaków.
- **Fix**: Dopisać te przypadki (pgTAP dla kciuka, reszta w `remove-player.test.ts` i `cohost.test.ts`) w PR z poprawkami, z zielonym `db`.
- **Decision**: FIXED (2026-11-02): pgTAP scenariusz `thumbs-removed` (11 asercji, `plan(315)`): kciuk usuniętego skasowany, do liczników trafiają tylko kciuki hosta i Oli; `remove-player.test.ts`: token usuniętego współhosta i czekającego spóźnionego → `room_unknown`, nick 101 znaków → `player_unknown`, `game_totals` po końcu gry (3 odsłony, Host 0, Ola 6); `cohost.test.ts`: `remove_player` w `MOVES`. Dowód: CI `db` na PR z poprawkami.

### F6 — Ekran „Usunięto cię z pokoju” zakłada, że gracza kasuje tylko `remove_player`

- **Severity**: 🔵 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: src/pages/r/[id].astro:43-49
- **Detail**: Strona rozpoznaje usuniętego po `join_request_state` = `none`. Dziś to prawda, ale `rooms.host_id` kasuje się kaskadą z `auth.users` (`20261007122858_room_lobby.sql:21`), a S-13 będzie kasować gry: goście takiego pokoju zobaczyliby „Usunięto cię z pokoju.”. Przy okazji komentarz w `[id].astro:17` („nie mówi, które pokoje istnieją”) jest już nieścisły: zamknięty pokój daje inny tekst niż nieistniejący (anon i tak to rozróżni przez `join_request_state`, id to losowe UUID).
- **Fix**: Dopisać ryzyko do S-13 w roadmapie (Risk) i poprawić komentarz w `[id].astro`.
- **Decision**: FIXED (2026-11-02): ryzyko dopisane do S-13 w roadmapie (Risk), komentarz w `src/pages/r/[id].astro` poprawiony.

### F7 — Drobne pozostałości po fazie 3

- **Severity**: 🔵 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Pattern Consistency
- **Location**: src/components/room/RoomScreen.tsx:129, src/components/room/RoundVoting.tsx:223-227, src/pages/dev/room-states.astro:1953
- **Detail**: Komentarz `RoomScreen` dalej mówi „the host alone keeps the link” (od S-09 link mają też współhosty). W `RoundVoting` został pusty `div` z `justify-between` wokół samego nagłówka „Gracze” (po odrzuconym wariancie z przełącznikiem trybu). Podglądy usuwania mają numery 121, 115–119 w złej kolejności.
- **Fix**: Poprawić komentarz, usunąć pusty `div`, przestawić podgląd 121 za 119 w jednym commicie porządkowym.
- **Decision**: FIXED (2026-11-02): komentarz `RoomScreen` i pusty `div` w `RoundVoting` poprawione. Kolejność podglądów DISMISSED: numery na `/dev/room-states` idą według powstania (120 stoi w innej sekcji), nie według miejsca na stronie.
