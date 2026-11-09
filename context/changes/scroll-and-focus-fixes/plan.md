# Przewijanie i fokus — plan implementacji

## Overview

Dwie drobne poprawki ekranu pokoju, bez bazy i bez API. (1) Na telefonie lista pytań hosta po „Popraw” daje się przesuwać w bok, bo ukryta dla oka podpowiedź pola ma pełną szerokość tekstu. (2) Gdy własny ruch gracza zabiera przycisk, na którym stał fokus (trzecia propozycja, „Zatwierdź”/„Odrzuć” propozycji, „Wpuść”/„Odrzuć” prośby, „Zagłosuj”), fokus spada na `body` i osoba z klawiaturą albo czytnikiem ekranu ląduje na początku strony. Poprawka (2) zamyka F4 z przeglądu S-10 (`context/changes/guest-question-proposals/follow-ups/review-fixes.md`) i rozszerza go o „Zagłosuj” (decyzja Karola, 08.11).

## Current State Analysis

Źródło: `context/changes/scroll-and-focus-fixes/research.md` (status `partial`: trzy miejsca F4 niesprawdzone w przeglądarce, domyka to Faza 1).

- Przewijanie: `QuestionField` w trybie `compact` daje etykiecie i podpowiedzi `sr-only` (`src/components/room/QuestionField.tsx:95`, `:112`), a `Field` nadpisuje ich szerokość regułą `[&>.sr-only]:w-auto` (`src/components/ui/field.tsx:53`, `:60`). Zmierzone w Chrome: przy 320, 360 i 390 px strona po „Popraw” ma 473 px szerokości. Ta sama reguła jest w aktualnym rejestrze shadcn (08.11).
- Fokus: ogólne przeniesienie na tytuł działa tylko po ruchach z `VIEW_CHANGING` (`src/components/room/RoomScreen.tsx:133`). ProposalForm, QuestionProposals, JoinRequests i RoundVoting nie przenoszą fokusu po własnym ruchu. Po „Zagłosuj” zmierzone w Chrome: fokus na `body`.
- Dobre wzorce: RoomScreen `removal` (`RoomScreen.tsx:234-260`, `:315-329`; cel zapisany przy naciśnięciu, rozstrzygnięcie po odświeżonym stanie, tylko gdy fokus zginął) i QuestionList `removedRow` (`QuestionList.tsx:354-360`). Sztuczka „nagłówek z `tabIndex=-1` i `outline-none`” jest powtórzona w RoomScreen dwa razy (`:224-228`, `:250-257`).
- Testy: tylko e2e (Vitest w `environment: "node"`, bez testów komponentów). E2e biegnie wyłącznie w CI (job `e2e`).

## Desired End State

- Na telefonie (szerokość poniżej 1024 px) po „Popraw” strona nie jest szersza od okna.
- Po własnym ruchu, który zabiera naciśnięty przycisk, fokus trafia (tylko gdy zginął) według jednej zasady: (1) ten sam przycisk w następnym wierszu tej samej listy, (2) element bloku, który został (nagłówek listy, zdanie o limicie), (3) tytuł widoku. Cudzy ruch nigdy nie przenosi fokusu (`RoomScreen.tsx:212-213`).
- Konkretnie: trzecia propozycja → zdanie „Nie masz już propozycji…”; „Zatwierdź”/„Odrzuć” propozycji → następny wiersz → przycisk listy „Propozycje pytań (n)” → tytuł widoku; „Wpuść”/„Odrzuć” → następny wiersz tej samej sekcji → nagłówek tej sekcji → nagłówek drugiej sekcji → tytuł widoku; „Zagłosuj” (i „Wstrzymuję się”) → tytuł widoku, a gdy głos odsłonił rundę — tytuł odsłony.
- „Zagłosuj” w czasie wysyłki czeka z `aria-disabled` (nie `disabled`), jak przyciski z `BUSY_BUTTON`, więc przy odmowie fokus zostaje.
- Weryfikacja: e2e w CI czerwone na nowych sprawdzeniach przed poprawką (Faza 1) i zielone po niej (Faza 2); Karol na telefonie po wdrożeniu (Faza 3).

### Key Discoveries:

- `[&>.sr-only]:w-auto` ma większą szczegółowość niż `.sr-only`, a `clip-path: inset(50%)` nie zdejmuje elementu z obszaru przewijania (`field.tsx:53`; research, sekcja 1).
- Komunikat „Głos oddany” to `Alert` z domyślnym `role="alert"` (`src/components/ui/alert.tsx:21`, `RoundVoting.tsx:360-362`), a e2e znajduje go po tej roli (`tests/e2e/support/round.ts:41-43`). Fokus na nim dałby podwójne odczytanie, więc celem po głosie jest tytuł.
- Wiersze propozycji i próśb znikają po odświeżonym stanie, a dzwonek może przyjść przed odpowiedzią HTTP (`src/lib/rooms/server.ts:797-800`); cel trzeba zapisać przed wysłaniem, jak w `removal`.
- Formularz głosu znika w tym samym renderze, w którym stan ma `me_voted` albo nowy widok (`RoundVoting.tsx:158`), więc rozstrzygnięcie po stanie widzi już zgubiony fokus.
- Podglądy gry nie robią zapytań (`RoomScreen.tsx:42-45`): ścieżek po odpowiedzi serwera nie da się przeklikać lokalnie.

## What We're NOT Doing

- „Zacznij grę” (`RoomLobby.tsx:165`, prawdziwe `disabled`): po starcie fokus i tak idzie na tytuł; odmowa startu poza zakresem.
- Utrata roli współhosta (cudzy ruch odmontowuje JoinRequests i QuestionProposals): zasada „nie ruszamy fokusu innym graczom” zostaje.
- Przepisanie RoomScreen `removal` i QuestionList `removedRow` na nowy mechanizm: działają i mają testy; RoomScreen dostaje tylko wspólny pomocnik zamiast powtórzonej sztuczki z nagłówkiem.
- Zmiana roli komunikatu „Głos oddany” i jego wyglądu; wyglądu żadnego ekranu.
- Testy komponentów (jsdom) i sprawdzanie czytników ekranu (NVDA, VoiceOver, TalkBack).
- Nowe stany w `/dev/room-states` i `/dev/room-window` (żaden stan nie przybywa).

## Implementation Approach

Najpierw testy (Faza 1): sprawdzenia fokusu i szerokości strony w istniejących specach e2e plus jeden nowy test z dwiema propozycjami, wypchnięte bez poprawki. Czerwone CI dokładnie na nowych sprawdzeniach to próbny alarm (test-plan §6.4, „Break-check”) i zarazem brakujący dowód z przeglądarki. Nowe sprawdzenia fokusu używają `expect.soft`, żeby jeden przebieg pokazał każde z nich (jak alarm F1 S-10). Potem poprawki (Faza 2): jedna linijka u źródła w `field.tsx` i wspólny pomocnik fokusu użyty w czterech miejscach. Na koniec dokumenty, reguła dla przyszłych agentów i wdrożenie (Faza 3).

## Critical Implementation Details

- **Timing & lifecycle:** w QuestionProposals, JoinRequests i ProposalForm cel zapisuje się przed wysłaniem i jest kasowany przy odmowie (dzwonek może odświeżyć stan przed odpowiedzią). Rozstrzygnięcie w efekcie po renderze, w którym pozycji już nie ma, i tylko gdy `document.activeElement` to `null` albo `body`. Logika siedzi w komponencie listy (rodzicu wierszy), nie w wierszu, bo wiersz znika razem ze stanem.
- **Głos:** RoundVoting znika z widokiem przy odsłonie, więc oczekujący cel głosu trzyma RoomScreen (jak `removal`): zapis `{ key, round }` przed wysłaniem, kasowanie przy odmowie, rozstrzygnięcie, gdy klucz widoku się zmienił (odsłona, pominięcie, koniec) albo gdy stan tej rundy ma `me_voted`. W podglądzie stan nie przychodzi, więc w podglądzie fokus po głosie się nie przenosi — to oczekiwane.

## Faza 1: Testy najpierw

### Overview

Nowe sprawdzenia w e2e, bez zmian w `src/`. Push i CI: czerwone tylko nowe sprawdzenia, w przewidzianych projektach.

### Changes Required:

#### 1. Szerokość strony po „Popraw”

**File**: `tests/e2e/question-list.spec.ts`

**Intent**: po otwarciu „Popraw” w wierszu 1 (`:119-123`) sprawdzić, że strona nie jest szersza od okna. Projekt `phone` (390×844) pokazuje usterkę, `chromium` (1280) jest kontrolą.

**Contract**: asercja na `document.scrollingElement`: `scrollWidth - clientWidth` równe 0 (przez `expect.poll` albo `page.evaluate`), z komunikatem nazywającym usterkę.

#### 2. Fokus w specu propozycji

**File**: `tests/e2e/proposals.spec.ts`

**Intent**: w istniejącym teście dopisać trzy sprawdzenia (`expect.soft(...).toBeFocused()`): po zatwierdzeniu jedynej propozycji przez hosta (`:239`) fokus na tytule pytania hosta (`roundQuestion(page)`); po odrzuceniu jedynej propozycji przez współhosta B (`:294`) fokus na tytule u B; po trzeciej propozycji A (`:318`) fokus na zdaniu `LIMIT` (`formText(pageA, LIMIT)`). Nowy krótki test: host i 2 gości, A i B wysyłają po jednej propozycji w poczekalni, host zaczyna grę i rozwija listę, klika „Zatwierdź” w pierwszym wierszu → fokus na „Zatwierdź” drugiego wiersza; Enter → lista znika, fokus na tytule pytania.

**Contract**: nowy test w tym samym `describe`, z kontrolą okna graczy jak w istniejącym teście (projekty `chromium` i `phone`, `testMatch` bez zmian). Wyrocznia: nazwy przycisków i tytuł z ekranu, kolejność wierszy z kolejności wysłania (rozpisana w teście).

#### 3. Fokus w specu spóźnionych

**File**: `tests/e2e/latecomer.spec.ts`

**Intent**: po „Wpuść” jedynej prośby (`:97`) i po obu „Odrzuć” (`:169`, `:187`) fokus hosta na tytule pytania (`roundQuestion(page)`), przez `expect.soft`.

**Contract**: bez nowych kroków gry; tylko asercje po istniejących kliknięciach.

#### 4. Fokus po głosie

**File**: `tests/e2e/round.spec.ts`

**Intent**: po głosie hosta i gościa A (`:50`, `:52`, przed ostatnim głosem) fokus na tytule pytania ich ekranów; po ostatnim głosie gościa B (`:54`) fokus B na tytule odsłony (`roundQuestion(pageB)`, czekanie `ROUND_UPDATE_MS`).

**Contract**: `expect.soft(roundQuestion(...)).toBeFocused()`; `voteConfirmation` zostaje tylko przed ostatnim głosem (test-plan §6.4, „Round”).

### Success Criteria:

#### Automated Verification:

- `npm run lint`, `npx astro check` i `npx playwright test --list` przechodzą (nowy test na liście w `chromium` i `phone`)
- CI na tym commicie: `ci`, `smoke` i `db` zielone; `e2e` czerwony dokładnie na nowych sprawdzeniach: szerokość tylko w `phone`, fokus w `proposals.spec.ts` (oba projekty), `latecomer.spec.ts` i `round.spec.ts`; wszystkie inne testy zielone

**Implementation Note**: commit Fazy 1 niesie też `research.md`, `plan.md`, `plan-brief.md` i `change.md`. Push za zgodą Karola, potem `gh pr create --draft`. Wynik CI (lista czerwonych asercji) zapisany do wpisu alarmu w Fazie 3.

---

## Faza 2: Poprawki

### Overview

Przewijanie u źródła i jedna zasada fokusu w czterech miejscach.

### Changes Required:

#### 1. Ukryte teksty w `Field`

**File**: `src/components/ui/field.tsx`

**Intent**: ukryty dla oka bezpośredni potomek `Field` zachowuje 1 px szerokości `sr-only`, zamiast dostawać szerokość tekstu.

**Contract**: w wariantach `vertical` i `responsive` `[&>.sr-only]:w-auto` → `[&>.sr-only]:w-px`; komentarz, że to lokalne odstępstwo od shadcn (rejestr 08.11 ma `w-auto`), więc `shadcn add field --overwrite` przywróci usterkę.

#### 2. Wspólny pomocnik fokusu

**File**: `src/components/room/focus.ts` (nowy)

**Intent**: jedna zasada w jednym miejscu: czy fokus zginął i jak oddać go elementowi, który nie jest fokusowalny.

**Contract**: `focusWasLost(): boolean` (`activeElement` to `null` albo `body`); `focusTarget(el: HTMLElement | null): boolean` (element bez własnego `tabIndex` dostaje `tabIndex = -1` i `outline-none`, potem `focus()`; `false` dla `null`). Komentarz nagłówka opisuje kolejność celów z „Desired End State”. Logikę „zapisz przed wysłaniem, rozstrzygnij, gdy pozycji nie ma” dla list wolno ująć tu jako hook używany przez QuestionProposals i JoinRequests.

#### 3. RoomScreen: tytuł widoku i głos

**File**: `src/components/room/RoomScreen.tsx`

**Intent**: obie kopie sztuczki z nagłówkiem (`:224-228`, `:250-257`) używają `focusTarget`; RoomScreen daje JoinRequests i QuestionProposals funkcję fokusu tytułu widoku (pierwszy `h1, h2` w `contentRef`); `vote` zapisuje cel głosu i rozstrzyga go według „Critical Implementation Details”.

**Contract**: nowy prop `focusTitle: () => void` w JoinRequests i QuestionProposals; ref celu głosu obok `removal`; zachowanie `removal` i `movedFrom` bez zmian (pilnują `remove-player.spec.ts:96`, `:142`).

#### 4. Propozycje

**File**: `src/components/room/QuestionProposals.tsx`

**Intent**: po własnym przyjętym „Zatwierdź”/„Odrzuć” fokus według zasady: ten sam przycisk w następnym wierszu (z listy sprzed ruchu) → przycisk listy (sekcja jeszcze jest) → `focusTitle`.

**Contract**: wiersz i przyciski rozpoznawalne po atrybutach danych (np. `data-proposal`, `data-answer`), jak `data-remove`; cel zapisany w rodzicu przed `onApprove`/`onReject`, skasowany przy odmowie. Komentarz nagłówka (`:17-18`) poprawiony: odpowiedź nie przenosi fokusu, chyba że zabrała przycisk.

#### 5. Prośby o wejście

**File**: `src/components/room/JoinRequests.tsx`

**Intent**: jak w propozycjach, w obrębie sekcji: ten sam przycisk w następnym wierszu tej samej sekcji → nagłówek tej sekcji → nagłówek drugiej sekcji → `focusTitle`.

**Contract**: atrybuty danych na wierszu i przyciskach; nagłówki sekcji (`<p>` przy `:168`, `:181`) jako cele przez `focusTarget`; komentarz nagłówka (`:14-17`) poprawiony.

#### 6. Trzecia propozycja

**File**: `src/components/room/ProposalForm.tsx`

**Intent**: gdy wysłana propozycja jest ostatnią z limitu (`own.left === 1` przy wysłaniu), po przyjęciu i zniknięciu formularza (`usedUp`) fokus na zdaniu `LIMIT` (`:131-136`), jeśli zginął.

**Contract**: znacznik ustawiany przed `onPropose`, kasowany przy odmowie, rozstrzygany w efekcie jak `focusField` (`:83-87`); zdanie dostaje ref.

#### 7. „Zagłosuj”

**File**: `src/components/room/RoundVoting.tsx`

**Intent**: przycisk w czasie wysyłki czeka jako `aria-disabled` z `BUSY_BUTTON` zamiast `disabled` (`:439`), żeby odmowa nie gubiła fokusu; podwójne wysłanie blokuje już `handleSubmit` (`if (voting) return`).

**Contract**: wygląd w czasie wysyłki jak dotąd (przygaszony przycisk ze spinnerem); bez zmian w „Głos oddany”.

### Success Criteria:

#### Automated Verification:

- Bramka: `npm run lint`, `npx astro check`, `npm test`, `npm run build`
- Pomiar w Chrome na `/dev/room-window?state=lobby-host-questions` po „Popraw” przy 320, 360 i 390 px: `scrollWidth` równe `clientWidth`; 67 stanów `/dev/room-window` przy 320 i 360 px dalej bez nadmiaru
- CI zielone: `ci`, `smoke`, `db`, `e2e` (wszystkie nowe sprawdzenia z Fazy 1 przechodzą w obu projektach)

#### Manual Verification:

- Podgląd `/dev/room-window` z „Popraw” przy 390 px: wiersz w edycji wygląda jak przed zmianą (zrzut przed i po, bez różnic poza brakiem paska przewijania w bok)

**Implementation Note**: przed pushem uruchomić zmienione ekrany w podglądzie (lessons.md, wpis 3). Push za zgodą Karola.

---

## Faza 3: Dokumenty i wdrożenie

### Overview

Zapis wyniku, reguła dla następnych agentów, PR gotowy, Karol scala i sprawdza na telefonie.

### Changes Required:

#### 1. Test-plan

**File**: `context/foundation/test-plan.md`

**Intent**: §6.4: opisy `question-list.spec.ts` (szerokość na telefonie), `proposals.spec.ts` (fokus, nowy test), `latecomer.spec.ts` i `round.spec.ts` (fokus) oraz wpis próbnego alarmu z wynikiem Fazy 1 (które asercje, w których projektach).

**Contract**: istniejące punkty §6.4 uzupełnione, bez nowej sekcji.

#### 2. Reguła dla agentów

**File**: `AGENTS.md`

**Intent**: jedno zdanie w „## UI”: przycisk, który znika po własnym ruchu gracza, oddaje fokus przez `src/components/room/focus.ts` (następny wiersz → blok → tytuł; tylko gdy fokus zginął, nigdy po cudzym ruchu).

**Contract**: jedna linia w istniejącej sekcji.

#### 3. Notka przy F4 i zmiana

**File**: `context/changes/guest-question-proposals/follow-ups/review-fixes.md`, `context/changes/scroll-and-focus-fixes/change.md`

**Intent**: przy F4 dopisek, że poprawione w `scroll-and-focus-fixes` (numer PR); w `change.md` decyzje (zakres z „Zagłosuj”, `field.tsx` u źródła, tytuł zamiast „Głos oddany”).

**Contract**: dopiski, bez przepisywania istniejących treści.

### Success Criteria:

#### Automated Verification:

- `npm run lint` (Prettier na zmienionych `.md`) przechodzi
- CI zielone na końcowym commicie; PR z draftu na gotowy (`gh pr ready`)

#### Manual Verification:

- Karol scala PR (`! gh pr merge <n> --merge`); na `main` zielone `ci`, `smoke`, `db`, `e2e` i Workers Builds
- Karol na telefonie w swojej grze: „Przejrzyj pytania” → „Popraw” → ekranu nie da się przesunąć w bok

**Implementation Note**: smoke na produkcji niepotrzebny (zmiana tylko ekranu; smoke czyta API). Push i `gh pr ready` za zgodą Karola.

---

## Testing Strategy

### Unit Tests:

- Brak: projekt nie ma testów komponentów (Vitest w `environment: "node"`), a pomocnik fokusu działa na DOM.

### Integration Tests:

- E2e (CI): szerokość strony po „Popraw” w `phone`; fokus po: zatwierdzeniu ostatniej propozycji, odrzuceniu ostatniej (współhost), trzeciej propozycji, zatwierdzeniu pierwszej z dwóch (następny wiersz) i drugiej klawiszem Enter, „Wpuść” i „Odrzuć” ostatniej prośby, głosie przed ostatnim i ostatnim (odsłona).
- Gałąź „następny wiersz” w JoinRequests i „nagłówek drugiej sekcji” nie mają osobnego testu; dzielą pomocnik z propozycjami, gdzie gałąź „następny wiersz” jest sprawdzana.

### Manual Testing Steps:

1. Podgląd `/dev/room-window?state=lobby-host-questions` przy 390 px: „Popraw” bez przewijania w bok.
2. Po wdrożeniu Karol na telefonie: to samo w prawdziwej grze.

## Performance Considerations

Brak: jedna klasa CSS i efekty uruchamiane po zmianie listy.

## Migration Notes

Nie dotyczy (bez bazy i bez API).

## References

- Research: `context/changes/scroll-and-focus-fixes/research.md`
- F4: `context/changes/guest-question-proposals/follow-ups/review-fixes.md`
- Wzorzec: `src/components/room/RoomScreen.tsx:234-260`, `:315-329` (`removal`), `src/components/room/QuestionList.tsx:354-360` (`removedRow`)
- Test-plan: `context/foundation/test-plan.md` §6.4 (e2e, „Break-check”, „Spec w oknie telefonu”)

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: Testy najpierw

#### Automated

- [x] 1.1 `npm run lint`, `npx astro check` i `npx playwright test --list` przechodzą (nowy test na liście w `chromium` i `phone`) — d0c2bf7
- [x] 1.2 CI na tym commicie: `ci`, `smoke` i `db` zielone; `e2e` czerwony dokładnie na nowych sprawdzeniach: szerokość tylko w `phone`, fokus w `proposals.spec.ts` (oba projekty), `latecomer.spec.ts` i `round.spec.ts`; wszystkie inne testy zielone — d0c2bf7

### Phase 2: Poprawki

#### Automated

- [x] 2.1 Bramka: `npm run lint`, `npx astro check`, `npm test`, `npm run build` — f1daa55
- [x] 2.2 Pomiar w Chrome na `/dev/room-window?state=lobby-host-questions` po „Popraw” przy 320, 360 i 390 px: `scrollWidth` równe `clientWidth`; 67 stanów `/dev/room-window` przy 320 i 360 px dalej bez nadmiaru — f1daa55
- [x] 2.3 CI zielone: `ci`, `smoke`, `db`, `e2e` (wszystkie nowe sprawdzenia z Fazy 1 przechodzą w obu projektach) — f1daa55

#### Manual

- [x] 2.4 Podgląd `/dev/room-window` z „Popraw” przy 390 px: wiersz w edycji wygląda jak przed zmianą (zrzut przed i po, bez różnic poza brakiem paska przewijania w bok) — f1daa55

### Phase 3: Dokumenty i wdrożenie

#### Automated

- [x] 3.1 `npm run lint` (Prettier na zmienionych `.md`) przechodzi
- [ ] 3.2 CI zielone na końcowym commicie; PR z draftu na gotowy (`gh pr ready`)

#### Manual

- [ ] 3.3 Karol scala PR (`! gh pr merge <n> --merge`); na `main` zielone `ci`, `smoke`, `db`, `e2e` i Workers Builds
- [ ] 3.4 Karol na telefonie w swojej grze: „Przejrzyj pytania” → „Popraw” → ekranu nie da się przesunąć w bok
