<!-- PLAN-REVIEW-REPORT -->

# Plan Review: Kciuki na odsłonie i zbiorcze dane o pytaniach (S-11, FR-016, FR-018)

- **Plan**: `context/changes/question-reactions-play-data/plan.md`
- **Mode**: Deep (weryfikacja kodu wykonana w tej sesji, bez sub-agenta: zlecający zabronił dalszej delegacji)
- **Date**: 2026-10-26
- **Verdict**: REVISE (lekki: trzy celowane poprawki w planie, bez zmiany podejścia) → wszystkie ustalenia przyjęte i naniesione w planie 2026-10-26
- **Findings**: 0 critical, 3 warnings, 5 observations

## Verdicts

| Dimension             | Verdict |
| --------------------- | ------- |
| End-State Alignment   | PASS    |
| Lean Execution        | PASS    |
| Architectural Fitness | PASS    |
| Blind Spots           | WARNING |
| Plan Completeness     | WARNING |

## Grounding

Grounding: 11/11 paths ✓ (3 nowe pliki nieobecne zgodnie z planem: `QuestionReaction.tsx`, `api/rooms/[id]/react.ts`,
`tests/db/reactions.test.ts`), 10/11 symbols ✓ (`finish_round`, `skip_round`, `next_round`, `start_game`,
`drop_round_state`, `castVote`, `ROUND_TABLES`, `REVEALED_ROUND_KEYS`, `VIEW_CHANGING`, `ThumbsUp` w `lucide-react`;
`voteTarget` leży w `src/pages/api/rooms/[id]/vote.ts:10`, nie w `json-route.ts`, co plan sugeruje w Fazie 2 #1 —
kosmetyka), brief↔plan ✓, Progress↔Phase ✓ (3/3 fazy, 12/12 kroków, brak checkboksów w blokach faz).

Weryfikacja najbardziej ryzykownych twierdzeń względem ostatnich definicji w `supabase/migrations/`:

1. **Pięć haków po wszystkich odmowach, bez podwójnego liczenia — potwierdzone.**
   - `finish_round` woła się tylko z `cast_vote` (`20261020205751_round_number_required.sql:220`, przed tym odmowy
     `round_revealed`/`round_over`/`already_voted`) i z `reveal_round` (`:285`, tylko z `voting`; ponowna odsłona
     `revealed` zwraca ok bez wywołania). Starsze wywołania (`first_live_round.sql:714,764`,
     `full_game_evening.sql:387`) są zastąpione; pgTAP pilnuje jednej wersji `cast_vote`/`reveal_round`.
   - `skip_round`: dopisek po `phase = 'skipped'` (`full_game_evening.sql:197`), przed `open_next_round` (`:199`); drugi
     skip tej samej rundy trafia w `round_over` (faza ≠ `voting`). Wyjątek `too many candidates` cofa całość.
   - `start_game`: ostatnia odmowa `not_enough_players` w `question_list_review.sql:458`, insert rundy `:461`; drugi start
     → `game_started`.
   - `next_round`: zsyp po udanym `open_next_round` (`full_game_evening.sql:129-130`); przy `no_questions` runda zostaje
     najnowsza, kciuki czekają; po udanym przejściu stary numer → `round_over`. Ponowione wywołanie (retry Workera) też
     → `round_over`.
   - `drop_round_state`: wołają ją wszystkie trzy drogi zamknięcia (`first_live_round.sql:278` w bloku z
     `exception when unique_violation`, który cofa także zsyp; `full_game_evening.sql:238`;
     `close_stale_games.sql:33`). Innych miejsc z `status = 'closed'` w ostatnich definicjach nie ma.
2. **Para gracz↔cel: brak.** `round_reactions` nie ma kolumny głosu; liczniki w `finish_round` dzielą transakcję (i `xmin`)
   z `round_results`, które już niosą te same liczby; zsyp kciuków w transakcji hosta/sprzątania. Dane per gracz nie
   przeżywają rundy: zsyp kasuje wszystkie `round_reactions` pokoju, także dla rund bez `question_id` i hostów
   wykluczonych. Przeżywają natomiast odsłonę (do „Następne pytanie”/końca/sprzątania, ≤ ~13 h) — zob. F8.
3. **Testy:** lista zmian pgTAP/`tests/db` zgodna ze strukturą `round_creator_view.test.sql` (skany
   `private_tables_failing` obejmą nowe tabele same, `function_facts`, delty), z dwiema lukami (F1, F6).
4. **Wykluczenie smoke:** smoke gra tylko kontem `SMOKE_EMAIL` jako hostem (`scripts/smoke.mjs:3,25`), pokój listy nie
   startuje, więc wykluczenie po `rooms.host_id` wystarcza; brak FK poprawny (CI zakłada własne konto smoke,
   `.github/workflows/ci.yml:57-65`). Luka: nic nie sprawdza go na produkcji (F3).
5. **Kolejność:** baza → kod zgodna z `context/deployment/deploy-plan.md` i z wzorem S-15; zmiany addytywne, sygnatury bez
   zmian, więc stary Worker z nową bazą działa.

## Findings

### F1 — Granty: `skip_round`, `start_game`, `next_round` nie są dziś dla `anon`

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Completeness
- **Location**: Faza 1 #1, ostatni punkt kontraktu migracji (`plan.md:147-150`)
- **Detail**: Plan każe dać `grant execute` „(`react_round`, `skip_round`, `start_game`, `next_round` dla `anon,
authenticated` jak dotąd)”. Dotąd te trzy funkcje hosta są tylko dla `authenticated`
  (`20261015122252_full_game_evening.sql:539-540`, `20261024094002_question_list_review.sql:753`), a pgTAP przypina to
  dokładnie: `'… | execute: authenticated'` (`supabase/tests/round_creator_view.test.sql:707-720`). Dosłowne wykonanie
  planu poszerza powierzchnię funkcji `security definer` o `anon` (i daje czerwony job `db`). `cast_vote` pokazuje wzór
  dla funkcji gościa, a `react_round` jest jedyną nową dla `anon`.
- **Fix**: Zmienić na: „`react_round` dla `anon, authenticated`; `skip_round`, `start_game`, `next_round` dla
  `authenticated` jak dotąd; `finish_round`, `drop_round_state`, `fold_reactions`, `counts_for_stats` bez grantów”.
- **Decision**: ACCEPTED — granty bez zmian (`skip_round`, `start_game`, `next_round` tylko `authenticated`), `anon` tylko dla `react_round`; plan: Critical Implementation Details i Faza 1 #1

### F2 — Kluczowe ryzyko (kopie pięciu funkcji) bez kroku w Progress

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Completeness
- **Location**: Critical Implementation Details „Kopie funkcji” (`plan.md:83-85`); Progress Fazy 1 (`plan.md:386-395`)
- **Detail**: Brief nazywa to głównym ryzykiem Fazy 1, a plan mówi „porównaj każdą z poprzednią wersją (diff ciał)”, ale
  ani Success Criteria, ani Progress tego nie zawierają, a pgTAP „pilnuje jednej wersji funkcji, nie treści”. Przy
  `/10x-implement` albo `/10x-goal-implement` krok bez pozycji w Progress łatwo pominąć; zgubiona linia (np. `delete
from public.join_requests` w `drop_round_state`, `latecomer_admission.sql:81-82`) nie zaświeci żadnego testu poza
  pojedynczymi scenariuszami.
- **Fix**: Dodać w Fazie 1 „Automated Verification” (i jako 1.x w Progress): „dla każdej z pięciu funkcji `diff` ciała z
  ostatniej definicji (anchor) i z nowej migracji pokazuje wyłącznie linie dopisków (wynik wklejony do opisu PR)”.
- **Decision**: ACCEPTED — krok 1.4 (diff ciał, tylko dopisane linie)

### F3 — Wykluczenie smoke i liczenie nigdy nie sprawdzone na produkcji

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Blind Spots
- **Location**: Critical Implementation Details „UUID konta smoke” (`plan.md:90-92`), Faza 1 Manual (`plan.md:218`),
  Faza 3 Manual (`plan.md:337-339`); brief Success Criteria („bez gier smoke”)
- **Detail**: UUID wpisuje się ręcznie z panelu; poprawny format, ale zły UUID (literówka, inne konto, a zwłaszcza konto
  Karola-hosta) przejdzie migrację i CI, bo w CI tego konta nie ma, a pgTAP testuje mechanizm na wierszu dodanym w teście.
  Skutek byłby cichy i nieodwracalny: albo smoke co wdrożenie dopisuje odsłony i pominięcia, albo zbiorcza gra z ekipą
  w ogóle się nie liczy. Ręczny test 3.4 sprawdza tylko UI kciuka, nie liczniki. Tak samo nic nie pokazuje, że po
  wdrożeniu liczniki w ogóle rosną.
- **Fix**: W Fazie 3 Manual dopisać: „przed i po smoke na produkcji Karol (właściciel) czyta w SQL Editorze tylko do
  odczytu `select sum(revealed), sum(skipped), sum(thumbs_up)+sum(thumbs_down) from private.question_stats` — bez zmian po
  smoke, wzrost po zbiorczej grze”; w kroku 1.3 dopisać „UUID porównany z wierszem konta `SMOKE_EMAIL` w panelu (nie
  z kontem Karola)”.
- **Decision**: ACCEPTED — UUID z wiersza `SMOKE_EMAIL`; krok 3.5 (sumy liczników przed i po smoke oraz po grze, tylko odczyt)

### F4 — Zestaw sygnałów jest nieodwracalny, a brakuje w nim wielkości grupy

- **Severity**: 💡 OBSERVATION
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: End-State Alignment
- **Location**: Faza 1 #1, `private.question_stats` i dopisek w `finish_round` (`plan.md:112-115, 134-137`)
- **Detail**: Liczniki to sumy po rundach, bez uzupełniania wstecz (`plan.md:71`), a S-13 skasuje `round_results` — czego
  nie zbierzemy od pierwszego wieczoru, tego S-12 nigdy nie odtworzy. FR-016/FR-017 chcą „rozkładu głosów” i wykrywania
  pytań „głosowanych bez sensu”. `scored_top / scored_votes` mówi o skupieniu, ale bez liczby uprawnionych
  (`cardinality(rounds.eligible)`) nie da się odróżnić „wszyscy zagłosowali” od „host odsłonił przy połowie głosów”
  (zaangażowanie) ani znormalizować skupienia do wielkości grupy (2 z 3 to co innego niż 2 z 10).
- **Fix**: Rozważyć z Karolem dodatkową kolumnę `eligible` (`+ cardinality(eligible)` w `finish_round`, ta sama
  transakcja, ta sama prywatność co `ballots`); jeśli nie — zapisać świadomą decyzję w „What We're NOT Doing”.
  - Strength: jedna linia teraz zamiast utraconych danych z pierwszych wieczorów, które plan wprost chce zebrać.
  - Tradeoff: jeszcze jedna kolumna w kontrakcie pgTAP (`columns_are`) i scenariuszach delt.
  - Confidence: MED — wartość zależy od wzoru oceny w S-12, który świadomie nie jest jeszcze ustalony.
  - Blind spot: nie sprawdzono, czy S-12 nie wolałby rozkładu per runda (np. suma kwadratów udziałów).
- **Decision**: ACCEPTED (decyzja techniczna, Karol prosił o mniej pytań) — kolumny `eligible` i `scored_eligible` w `question_stats`

### F5 — Upsert wielu wierszy w `start_game` bez stałej kolejności

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Blind Spots
- **Location**: Faza 1 #1, dopisek w `start_game` (`plan.md:140-142`)
- **Detail**: `start_game` zaktualizuje do ~15 wierszy globalnej `question_stats` naraz. Dwa starty w różnych pokojach z
  nakładającymi się pytaniami, blokujące wiersze w różnej kolejności, mogą dać deadlock (40P01) i 500 przy „Zacznij grę”.
  Przy tej skali rzadkie, ale tanie do wykluczenia; pozostałe dopiski dotykają jednego wiersza.
- **Fix**: W kontrakcie: „upsert z `order by question_id`” (tak samo w `fold_reactions`, jeśli zsypuje kilka rund).
- **Decision**: ACCEPTED — upserty `order by question_id` (Critical Implementation Details, `start_game`)

### F6 — Drobne luki testów względem wzorców repo

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Completeness
- **Location**: Faza 1 #4 i #5 (`plan.md:179-207`)
- **Detail**: (a) „jedna wersja” dla `fold_reactions` i `counts_for_stats`: pomocnik `pg_temp.versions_of` szuka tylko w
  `public` (`round_creator_view.test.sql:476-485`), więc potrzebny wariant ze schematem. (b) `round-anonymity.test.ts`
  pilnuje dokładnego `{ ok: true }` z `cast_vote` (próbny alarm (b) w `test-plan.md` §6.2); dla `react_round` plan ma
  tylko „→ ok”, a dodatkowy klucz (np. liczba kciuków) byłby wyciekiem sprzecznym z decyzją Karola. (c) Scenariusz
  pgTAP zsypu przy „Nowej grze” (`create_room` z blokiem `exception`) nie jest wymieniony, choć to trzecia droga
  `drop_round_state`. (d) Poprzednie zmiany z nowymi strażnikami `private` (S-02, S-03, S-06, S-08) robiły próbny alarm z
  §6.2; tu nowe strażniki to „`round_reactions` nielogowana” i „zsyp kasuje kciuki”.
- **Fix**: Dopisać do Fazy 1 #4/#5: wariant `versions_of` ze schematem; asercję dokładnego zbioru kluczy odpowiedzi
  `react_round` w `round-anonymity.test.ts`; scenariusz „kciuki przed Nową grą”; opcjonalnie jeden próbny alarm.
- **Decision**: ACCEPTED — wariant `versions_of` dla `private`, dokładnie `{ok:true}`, scenariusz „Nowa gra”, próba złamania (krok 1.5)

### F7 — Miejsce kroku kciuka w E2E a pomiar dzwonka

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Blind Spots
- **Location**: Faza 2 #5 (`plan.md:280-282`)
- **Detail**: `tests/e2e/game.spec.ts:106-121` przeładowuje ekran gościa B i mierzy, że pytanie 2 dotarło dzwonkiem przed
  jego własnym odpytaniem (`< LOBBY_POLL_MS`, 15 s). Kroki kciuka gościa A (dwa POST-y z odświeżeniem i dwie asercje)
  wstawione między przeładowanie B a „Następne pytanie” wydłużą to okno i mogą dać niestabilny test.
- **Fix**: Wskazać miejsce: kciuk A zaraz po `resultTable` widocznym na wszystkich ekranach (`game.spec.ts:84-86`), przed
  sprawdzeniem okna `lg` i przed przeładowaniem B.
- **Decision**: ACCEPTED — krok kciuka po tabeli wyniku (`game.spec.ts:84-86`), przed blokiem przeładowania

### F8 — Granica „stan w toku” rozszerza się na odsłonę i nie jest zapisana

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Architectural Fitness
- **Location**: Faza 1 #1, `private.round_reactions` (`plan.md:116-117`); AGENTS.md Hard Rules
- **Detail**: AGENTS.md opisuje stan w toku jako kasowany „at the reveal”, z przyjętą granicą dla rundy porzuconej bez
  odsłony. Kciuki z gracza żyją po odsłonie: do „Następne pytanie”, końca gry, „Nowej gry” albo sprzątania, czyli dla gry
  porzuconej na odsłonie (albo po `no_questions`) do ~13 h; awaria je zeruje (nielogowana). To nie łamie zakazu pary
  gracz↔cel, ale plan nie każe tej granicy zapisać, a przyszły czytelnik migracji/pgTAP może uznać ją za błąd.
- **Fix**: W nagłówku migracji i nagłówku pgTAP zapisać: „reakcja (gracz → kierunek) tylko w nielogowanej
  `round_reactions` od odsłony do zsypu; ≤ ~13 h przy grze porzuconej; awaria ją zeruje (jak urnę)”.
- **Decision**: ACCEPTED — granica kciuków w komentarzu migracji i nagłówku pgTAP

## Notes on process

- Skill Krok 3 przewiduje jednego sub-agenta; weryfikację kodu zrobiono bezpośrednio, bo zlecający zabronił delegacji.
- Krok 6 (pytanie o dalszy tryb): użytkownik niedostępny, wybrano „Save report & triage later”; triage:
  `/10x-plan-review context/changes/question-reactions-play-data/reviews/plan-review.md`.
- `change.md` NIE został zaktualizowany do `status: plan_reviewed` (zlecający zabronił edycji `change.md`); zrobić przy
  triage.
