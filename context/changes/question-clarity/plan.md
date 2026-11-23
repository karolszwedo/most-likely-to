# Przegląd brzmienia pytań bazy (S-28): plan implementacji

## Overview

Po pierwszej grze ze znajomymi (22.11.2026) poprawiamy pytania, przy których gracz musi się domyślać, o co chodzi. Porządkujemy też znacznik 18+ według zasady złagodzonej przez Karola 23.11: 18+ dostaje tylko to, co naprawdę jest dla dorosłych (upijanie się i gry alkoholowe, hazard na pieniądze, wyraźny podtekst, aplikacje randkowe). Sama wzmianka o alkoholu, pocałunek, ex i randka trafiają do zwykłych gier. Numery pytań zostają, więc „bez powtórek” i dane o pytaniach liczą się dalej. Zmiana tekstu nie dotyka bazy danych. Zmiana 18+ to migawka bazy pytań i `db push` przed scaleniem.

## Current State Analysis

- `src/data/questions.ts` ma 960 pytań, 241 z nich 18+ (ostatnia migawka `supabase/migrations/20261116124645_question_base_snapshot.sql`). Tekst żyje tylko w Workerze, a baza (`private.question_base`) zna numer, kategorię i 18+ (`src/data/questions.ts:20-23`, `scripts/question-base-migration.mjs:1-6`).
- Zasada 18+ stoi w nagłówku pliku (`src/data/questions.ts:17-19`): dwuznaczność, alkohol, randki, hazard. Niewinny romans nie jest sam w sobie 18+.
- Audyt (`research.md`) i decyzje Karola z 23.11 (`research.md`, „Decyzje Karola” 1–5): 16 poprawek brzmienia (lista A), 18+ zdjęte z 39 pytań, powtórki zostają, nowa, łagodniejsza granica 18+ (decyzja 5).
- Wszystkie 960 tekstów spełnia dziś zasady z nagłówka (`src/data/questions.ts:14-16`), co sprawdziłem 23.11 jednorazowym skryptem: najdłuższy ma 86 znaków, każdy zaczyna się małą literą, kończy bez „?” i „.” i ma tryb przypuszczający. Żaden test tego nie pilnuje (`research.md`, lista A).
- Z pozostałych 202 pytań 18+ (wyszukiwanie słów 23.11) około 70 ma znacznik tylko przez alkohol, a około 28 mówi o randce albo podrywie. Wiele z nich nie spełnia nowej granicy, np. „kupiłby wino tylko dlatego, że miało ładną etykietę”.
- Po zdjęciu 39 każda kategoria ma jeszcze 8–20 pytań 18+. Przegląd z Fazy 2 może zostawić kategorię z bardzo małą liczbą pytań 18+ albo bez żadnego.

## Desired End State

- 16 pytań z listy A ma nowe brzmienie pod tym samym numerem.
- Nagłówek `src/data/questions.ts` podaje nową zasadę 18+.
- Żadne pytanie nie ma 18+ bez jednego z czterech powodów nowej granicy: upijanie się albo gra alkoholowa, hazard na pieniądze, wyraźny podtekst (nagość, noc u kogoś), aplikacja randkowa. Dotyczy to 39 pytań z decyzji 3 i tych z przeglądu w Fazie 2, które zatwierdzi Karol (decyzja 6).
- Test jednostkowy pilnuje zasad tekstu każdego pytania, a jego próbny alarm trafił.
- Migawka jest na produkcji przed scaleniem kodu, a smoke na produkcji jest zielony.

Sprawdzenie: bramka, CI na PR, `db push` z `migration list`, smoke na produkcji. Brzmienie w praktyce Karol sprawdza przy grze.

### Key Discoveries:

- Testy przypinają trzy pytania jako 18+:
  - `tests/db/question-base.test.ts:51-59` i `tests/db/game-length.test.ts:101-102`: `na-co-dzien-021` i `imprezy-021`, przez `satisfies`. Zdjęcie im 18+ to czerwony `npx astro check`.
  - `tests/unit/draw.test.ts:126-132`: `przyszlosc-011`, w czasie działania testu.

  Żadne z 39 nie jest przypięte. W przeglądzie z Fazy 2 mogą jednak wypaść `na-co-dzien-021` („napisałby do ex o drugiej w nocy”) i `przyszlosc-011` („wziąłby ślub w Las Vegas”).
- `tests/unit/draw.test.ts:168-175`: każda kategoria musi mieć co najmniej 15 pytań bez 18+. Zdjęcie 18+ tylko tę liczbę zwiększa.
- Żadne pytanie bez 18+ nie wspomina dziś aplikacji randkowej (wyszukiwanie „tinder” i „aplikacj… randkow…”). Pozostałe trzy powody nowej granicy są węższe niż w starej zasadzie. Nowa zasada nie każe więc nikomu dodać 18+.
- Wszystkie zmiany idą w jednym kierunku: `true → false`. Między `db push` a scaleniem baza uważa te pytania za zwykłe, a stary Worker dalej za 18+. Worker proponuje więc mniej pytań, niż baza przyjmie, i nie ma błędów. Okienko z błędami ma tylko odwrotny kierunek, czyli włączenie 18+ (`context/deployment/deploy-plan.md:131`), a tu go nie ma.
- `origin/english-version-b` (draft PR #92) ma niewgraną migrację `20261121200226_game_language.sql`, starszą niż nasza migawka. Gałąź nie dotyka `src/data/questions.ts` ani skryptu migawki.

## What We're NOT Doing

- Powtórki (14 par): zostają wszystkie, także na później (decyzja 4).
- Zmiany sensu pytań, czyli nowe numery, i wycofywanie pytań.
- Włączanie 18+ pytaniom bez znacznika: nowa zasada nie daje takich kandydatów, a przegląd szuka tylko w pytaniach z 18+.
- Propozycje odrzucone przez krytyka (lista D w `research.md`).
- Kategorie, liczba pytań, nowe pytania.
- Tłumaczenie pytań (S-27 Faza 3, po tej zmianie).

## Implementation Approach

Najpierw tekst bez bazy (Faza 1: bramka zielona bez migawki), potem 18+ (Faza 2: przegląd, decyzja Karola, plik, migawka), na końcu wydanie (Faza 3) w kolejności baza przed kodem. Tekst i 18+ jadą jednym PR-em i jednym `db push`.

## Critical Implementation Details

- **Kolejność z S-27.** Po wgraniu naszej migawki migracja `20261121200226_game_language.sql` z `english-version-b` będzie starsza niż ostatnia wgrana, a `supabase db push` takich nie wgrywa bez `--include-all`. Przed jej `db push` trzeba nadać jej nowy znacznik czasu. Wolno, bo nie była wgrana. Trzeba to zapisać w „Stanie” `sesja-gry.md` i powiedzieć Karolowi przy wydaniu.
- **Przegląd w Fazie 2.** Redaktor i krytyk dostają zasadę 18+ dosłownie z nowego nagłówka pliku. Lekcja z audytu 22.11: zawężona zasada w poleceniu dała złe zgłoszenia. W poleceniach dla podagentów jest też zakaz instalacji (lekcja S-26).

## Faza 1: Brzmienie i zasada

### Overview

16 nowych brzmień, nowa zasada 18+ w nagłówku i test zasad tekstu. Znaczniki 18+ zostają bez zmian, więc ta faza nie potrzebuje migawki.

### Changes Required:

#### 1. Nowe brzmienie 16 pytań

**File**: `src/data/questions.ts`

**Intent**: Zamienić `text` 16 pytań z listy A w `research.md` na nowe brzmienie z tej tabeli, dosłownie. Sens zostaje, więc numer, kategoria i `adult` się nie zmieniają (`src/data/questions.ts:8-9`).

**Contract**: numery z listy A, zmienia się tylko pole `text`.

#### 2. Nowa zasada 18+ w nagłówku

**File**: `src/data/questions.ts:17-19`

**Intent**: Zasada zgodna z decyzjami 2, 3 i 5 Karola z 23.11.

**Contract**: `adult: true` oznacza pytanie naprawdę dla dorosłych: upijanie się albo grę alkoholową, hazard na pieniądze, wyraźny podtekst (nagość, noc u kogoś) albo aplikacje randkowe (np. Tinder), bez wulgarności i niczego dosadnego. Sama wzmianka o winie czy piwie, kac, pocałunek, ex i niewinny romans (zauroczenie, randka, rocznica, oświadczyny, ślub) nie są same w sobie 18+. Zdanie o pytaniach kategorii „Randki i związki” zostaje. Po angielsku, jak reszta nagłówka.

#### 3. Test zasad tekstu

**File**: `tests/unit/question-text.test.ts` (nowy)

**Intent**: Pilnuje zasad tekstu z nagłówka przy każdym pytaniu bazy, żeby przeróbka (tu i w S-27) nie przeszła za długa albo źle zapisana.

**Contract**: wyrocznia to zasady z nagłówka (`src/data/questions.ts:14-16`), nie logika kodu. Osobny przypadek na każdą zasadę:
- najwyżej 90 znaków, liczonych jako znaki, nie bajty;
- mała litera na początku;
- bez „?” i „.” na końcu;
- bez spacji na brzegach;
- czasownik w trybie przypuszczającym, czyli słowo zakończone na „łby” albo „liby”.

Każdy przypadek zbiera numery pytań, które łamią zasadę, i oczekuje pustej listy, więc błąd od razu je wymienia. Importy według test-plan §6.1.

#### 4. Próbny alarm (lokalnie)

**Intent**: Przewidywanie zapisane przed alarmem:
- jedno pytanie tymczasowo wydłużone do 91 znaków czerwieni tylko przypadek długości;
- „?” na końcu czerwieni tylko przypadek interpunkcji;
- wielka litera na początku czerwieni tylko przypadek małej litery.

Potem cofnąć. Wynik z datą trafia do test-plan §6.1 jako nowy punkt „Question text rules”.

**Contract**: alarm bez commita (lokalnie, jak alarmy testów jednostkowych S-17 i S-21).

### Success Criteria:

#### Automated Verification:

- Bramka zielona: `npm run lint`, `npx astro check`, `npm test`, `npm run build`
- Nowy test zasad tekstu przechodzi na wszystkich 960 pytaniach
- Próbny alarm trafia dokładnie: 91 znaków czerwieni tylko przypadek długości, „?” tylko przypadek interpunkcji, wielka litera tylko przypadek małej litery; po cofnięciu zielono
- `git diff` w `src/data/questions.ts`: zmienione tylko `text` 16 pytań z listy A i nagłówek, żadne `adult`

#### Manual Verification:

- Karol potwierdza 16 brzmień w ostatecznej formie (wstępne „tak” z 23.11)

**Implementation Note**: Commit Fazy 1 zabiera też plan, brief, `change.md` i roadmapę.

---

## Faza 2: Oznaczenia 18+

### Overview

Przegląd pozostałych pytań 18+ według nowej zasady i decyzja Karola. Potem zdjęcie 18+ w pliku i migawka bazy.

### Changes Required:

#### 1. Przegląd pozostałych pytań 18+

**Intent**:
- Podagent-redaktor przegląda 202 pytania 18+ spoza 39 z decyzji 3. Przy każdym podaje powód z nowej granicy albo „brak powodu”.
- Niezależny krytyk sprawdza każde „brak powodu” i każde wątpliwe.
- Wynik to numerowana lista z rekomendacją, pogrupowana tematami (alkohol, pocałunek i ex, hazard bez pieniędzy, inne). Karol dostaje jedną grupę na wiadomość i może wypisać pojedyncze numery.
- Raport podaje też, ile pytań 18+ zostanie w każdej kategorii. Kategorię z mniej niż 5 albo bez żadnego Karol widzi osobno. Jej pole 18+ w formularzu nowej gry dalej będzie widoczne, a uzupełnienie to osobne dopisywanie pytań.
- Decyzja trafia do `research.md` jako punkt 6 „Decyzji Karola”.

**Contract**: podagenci tylko czytają, zasadę dostają dosłownie z nagłówka po Fazie 1 i nic nie instalują. Z wyników pośrednich commitujemy tylko `research.md`.

#### 2. Zdjęcie 18+

**File**: `src/data/questions.ts`

**Intent**: `adult: false` dla 39 pytań z decyzji 3 i dla pytań zatwierdzonych w przeglądzie. `gry-i-internet-075` (Tinder) zostaje 18+.

**Contract**: zmienia się tylko `adult`, tylko z `true` na `false`.

#### 3. Testy przypinające 18+

**File**: `tests/db/question-base.test.ts:51-59`, `tests/db/game-length.test.ts:101-102`, `tests/unit/draw.test.ts:126-132`

**Intent**: Tylko jeśli przegląd zdejmie 18+ z `na-co-dzien-021`, `imprezy-021` albo `przyszlosc-011`: przepiąć test na inne pytanie tej samej kategorii, które zostaje 18+.

**Contract**: zmienia się tylko numer pytania, komentarze przy stałych dalej mówią prawdę.

#### 4. Migawka

**Intent**: `npm run questions:migration` tworzy nowy `supabase/migrations/<timestamp>_question_base_snapshot.sql`. Migawki nie poprawiamy ręcznie (`context/deployment/deploy-plan.md`, „Dopisywanie pytań do wspólnej bazy pytań”).

**Contract**: jedna nowa migracja, samo polecenie `merge` z generatora.

### Success Criteria:

#### Automated Verification:

- Bramka zielona: `npm run lint`, `npx astro check`, `npm test` (z testem migawki), `npm run build`
- Nowa migawka różni się od `20261116124645_question_base_snapshot.sql` tylko wierszami zdjętych pytań, a w każdym z nich `true` zmienia się na `false`
- W `src/data/questions.ts` zmienione tylko `adult` z `true` na `false`, przy pytaniach z decyzji 3 i z przeglądu

#### Manual Verification:

- Karol zatwierdza listę z przeglądu pozostałych pytań 18+ (decyzja 6)

---

## Faza 3: Wydanie

### Overview

Pełny cykl z migracją: baza przed kodem.

### Changes Required:

#### 1. PR i CI

**Intent**: Push gałęzi (zgoda Karola), potem `gh pr create` i zielone `ci`, `smoke`, `db`, `e2e`.

**Contract**: gałąź `question-clarity` bez upstreamu na `main`, czyli push z jawnym celem.

#### 2. Baza przed kodem

**Intent**: Najpierw `npx supabase db push --dry-run` (zgoda Karola, ma pokazać tylko nową migawkę), potem `db push` i `migration list`. Nie z eduroam, tylko z kabla w akademiku albo hotspotu. Scalenie zaraz potem.

**Contract**: kolejność z `context/deployment/deploy-plan.md` („Dopisywanie pytań do wspólnej bazy pytań”, kroki 4–6).

#### 3. Scalenie i smoke

**Intent**: Karol scala (`! gh pr merge <n> --merge`), potem Workers Builds i smoke na produkcji za zgodą Karola, jeden przebieg.

**Contract**: bez zmian w kodzie.

#### 4. Dokumenty i epilog

**File**: `context/deployment/deploy-plan.md`, `context/foundation/roadmap.md`, ten plan, `context/changes/question-clarity/change.md`, `C:\Users\karol\Documents\sesja-gry.md`

**Intent**:
- **`deploy-plan.md`:** wpis migawki jak przy `20261116124645`: liczba pytań 18+ przed i po, same dane, CI, dry-run, `migration list`, PR.
- **Plan:** Progress z SHA.
- **`change.md`:** `implemented` po ręcznym sprawdzeniu Karola.
- **„Stan” w `sesja-gry.md`:** uwaga o migracji S-27.
- **Dalej:** `/10x-impl-review` według kroku 6 pełnego cyklu, `/10x-archive` po grze. Dokumenty po wgraniu idą małym PR-em epilogu albo z następną zmianą.

**Contract**: bez zmian w kodzie.

### Success Criteria:

#### Automated Verification:

- CI na PR zielone: `ci`, `smoke`, `db`, `e2e`
- `db push --dry-run` pokazuje tylko nową migawkę, a `migration list` po wgraniu ma ją lokalnie i zdalnie
- Smoke na produkcji zielony po scaleniu (za zgodą Karola)

#### Manual Verification:

- Karol przy grze: nowe brzmienia czyta się bez domyślania (zwłaszcza pilot od Wii), a w grze bez 18+ padają też pytania, z których zdjęliśmy 18+

---

## Testing Strategy

### Unit Tests:

- Nowy `tests/unit/question-text.test.ts`: zasady tekstu z nagłówka przy każdym pytaniu, z próbnym alarmem.
- Istniejące, bez zmian w logice: test migawki (`tests/unit/question-base-snapshot.test.ts`), co najmniej 15 pytań bez 18+ w kategorii i limit 1000 kandydatów (`tests/unit/draw.test.ts`).

### Integration Tests:

- Job `db` w CI: testy bazy z nową migawką. Przypięte pytania 18+ są sprawdzane w Fazie 2 #3.

### Manual Testing Steps:

1. Karol czyta 16 brzmień w ostatecznej formie (Faza 1).
2. Karol zatwierdza listę z przeglądu 18+ (Faza 2).
3. Przy grze: pytania czyta się bez domyślania, a w grze bez 18+ padają pytania, z których zdjęliśmy 18+.

## Performance Considerations

Bez wpływu: liczba pytań bez zmian (960, poniżej limitu 1000 kandydatów jednego ruchu).

## Migration Notes

- Migawka to jedno `merge` w `private.question_base`: zmienia tylko znacznik 18+ wskazanych pytań, bez zmian w tabelach, funkcjach i grantach.
- Wycofanie to nowa migawka ze starymi znacznikami, nigdy edycja wgranej.
- Okienko między `db push` a scaleniem jest bezpieczne (kierunek `true → false`, „Key Discoveries”).

## References

- Research: `context/changes/question-clarity/research.md` (lista A, B, decyzje Karola z 23.11)
- Zasady bazy pytań: `src/data/questions.ts:1-24`
- Generator migawki: `scripts/question-base-migration.mjs`
- Kolejność wgrywania: `context/deployment/deploy-plan.md` („Dopisywanie pytań do wspólnej bazy pytań”)
- Poprzednia migawka: `supabase/migrations/20261116124645_question_base_snapshot.sql`
- Tłumaczenie pytań: `context/changes/english-version/plan.md` (Faza 3)

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: Brzmienie i zasada

#### Automated

- [x] 1.1 Bramka zielona: `npm run lint`, `npx astro check`, `npm test`, `npm run build` — 49911bb
- [x] 1.2 Nowy test zasad tekstu przechodzi na wszystkich 960 pytaniach — 49911bb
- [x] 1.3 Próbny alarm trafia dokładnie: 91 znaków czerwieni tylko przypadek długości, „?” tylko przypadek interpunkcji, wielka litera tylko przypadek małej litery; po cofnięciu zielono — 49911bb
- [x] 1.4 `git diff` w `src/data/questions.ts`: zmienione tylko `text` 16 pytań z listy A i nagłówek, żadne `adult` — 49911bb

#### Manual

- [x] 1.5 Karol potwierdza 16 brzmień w ostatecznej formie (wstępne „tak” z 23.11) — 49911bb

### Phase 2: Oznaczenia 18+

#### Automated

- [x] 2.1 Bramka zielona: `npm run lint`, `npx astro check`, `npm test` (z testem migawki), `npm run build`
- [x] 2.2 Nowa migawka różni się od `20261116124645_question_base_snapshot.sql` tylko wierszami zdjętych pytań, a w każdym z nich `true` zmienia się na `false`
- [x] 2.3 W `src/data/questions.ts` zmienione tylko `adult` z `true` na `false`, przy pytaniach z decyzji 3 i z przeglądu

#### Manual

- [x] 2.4 Karol zatwierdza listę z przeglądu pozostałych pytań 18+ (decyzja 6)

### Phase 3: Wydanie

#### Automated

- [ ] 3.1 CI na PR zielone: `ci`, `smoke`, `db`, `e2e`
- [ ] 3.2 `db push --dry-run` pokazuje tylko nową migawkę, a `migration list` po wgraniu ma ją lokalnie i zdalnie
- [ ] 3.3 Smoke na produkcji zielony po scaleniu (za zgodą Karola)

#### Manual

- [ ] 3.4 Karol przy grze: nowe brzmienia czyta się bez domyślania (zwłaszcza pilot od Wii), a w grze bez 18+ padają też pytania, z których zdjęliśmy 18+
