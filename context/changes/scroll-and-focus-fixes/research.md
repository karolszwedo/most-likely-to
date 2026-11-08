---
date: 2026-11-08T18:41:11+01:00
researcher: Claude (Opus 5.5) z Karolem
git_commit: 03402b7825e35adcd2457e8756886bed72ae4d26
branch: scroll-and-focus-fixes
repository: most-likely-to
topic: "Przewijanie w bok przy „Popraw” na telefonie i fokus po zniknięciu przycisku (F4 z S-10)"
tags:
  [
    research,
    ui,
    a11y,
    focus,
    QuestionField,
    field,
    QuestionList,
    ProposalForm,
    QuestionProposals,
    JoinRequests,
    RoundVoting,
    RoomScreen,
  ]
status: partial
last_updated: 2026-11-08
last_updated_by: Claude (Opus 5.5)
---

# Research: przewijanie w bok przy „Popraw” i fokus po zniknięciu przycisku

**Date**: 2026-11-08T18:41:11+01:00
**Researcher**: Claude (Opus 5.5) z Karolem
**Git Commit**: 03402b7825e35adcd2457e8756886bed72ae4d26
**Branch**: scroll-and-focus-fixes
**Repository**: most-likely-to

## Research Question

1. Czy na telefonie lista pytań hosta po „Popraw” nadal daje przewijanie w bok (zgłoszone 05.11 jako „ukryta podpowiedź w »Popraw«”, przed S-19), i dlaczego?
2. F4 z `context/changes/guest-question-proposals/follow-ups/review-fixes.md`: gdzie naprawdę ląduje fokus, gdy przycisk znika pod fokusem po własnym ruchu (ProposalForm po trzeciej propozycji, QuestionProposals po „Zatwierdź”/„Odrzuć”, JoinRequests po „Wpuść”/„Odrzuć”), i jaka jedna zasada pasuje do istniejących wzorców („Usuń” na liście „Gracze” i na liście pytań).

## Summary

1. **Przewijanie w bok jest i ma jedną przyczynę.** Pomiar w Chrome (headless, `/dev/room-window?state=lobby-host-questions`, klik w pierwsze „Popraw”): przy szerokości okna 320, 360 i 390 px strona ma po kliknięciu 473 px szerokości (`scrollWidth`), przed kliknięciem tyle, ile okno; przy 1280 px bez nadmiaru. Jedyny wystający element to ukryta podpowiedź pola (`FieldDescription` z `sr-only`, tekst „Dokończ zdanie »Kto z nas najprawdopodobniej…«. Najwyżej 90 znaków.”): `position: absolute`, `white-space: nowrap`, `clip-path: inset(50%)` i szerokość 445 px zamiast 1 px. Szerokość nadpisuje reguła shadcn `Field` `[&>.sr-only]:w-auto` (`src/components/ui/field.tsx:53`), mocniejsza od samego `sr-only`; `clip-path` chowa tekst, ale nie zdejmuje go z obszaru przewijania. Ta sama reguła jest w aktualnym shadcn (sprawdzone `npx shadcn@latest view field`, 08.11), więc ponowne dodanie komponentu tego nie naprawi.
2. **W trzech miejscach F4 żaden kod nie przenosi fokusu; w jednym dodatkowym miejscu zmierzyłem, że spada na `body`.** Żaden kod nie przenosi fokusu po własnym ruchu w ProposalForm (po `usedUp`), QuestionProposals (po zniknięciu wiersza i sekcji) ani JoinRequests (po zniknięciu wiersza i sekcji); ogólne przeniesienie na tytuł działa tylko dla ruchów zmieniających widok (`VIEW_CHANGING`, `src/components/room/RoomScreen.tsx:133`), a te ruchy do nich nie należą. Dodatkowe miejsce poza F4: „Zagłosuj” w `RoundVoting` — sprawdzone w Chrome na podglądzie `vote-guest`: fokus na „Zagłosuj”, Enter, po głosie `document.activeElement` to `body`. Dwa dobre wzorce istnieją, ale każdy jest napisany osobno (RoomScreen `removal`, QuestionList `removedRow`); do F4 pasuje wzorzec `removal`, bo wiersze znikają po odświeżonym stanie, czasem zanim przyjdzie odpowiedź.

**Luka (status `partial`):** trzech miejsc F4 nie da się sprawdzić w przeglądarce lokalnie: podglądy gry nie robią zapytań, a ruchy prowadzącego zostają w nich „zajęte” do nowego stanu (`RoomScreen.tsx:42-45`), e2e biegnie tylko w CI (lokalna Supabase), a serwer dev pisze do produkcyjnej bazy. Wniosek „fokus na `body`” dla tych trzech opiera się na kodzie i na tym samym mechanizmie zmierzonym w „Zagłosuj”. Domknięcie: w planie najpierw testy e2e na fokus (czerwone przed poprawką).

## Detailed Findings

### 1. Przewijanie w bok przy „Popraw”

- „Popraw” otwiera w wierszu `QuestionField` w trybie `compact` (`src/components/room/QuestionList.tsx:230-233`). W tym trybie etykieta i podpowiedź dostają `sr-only` (`src/components/room/QuestionField.tsx:95`, `:112`); oba elementy są bezpośrednimi dziećmi `Field` (`QuestionField.tsx:94-116`).
- `Field` w orientacji `vertical` (domyślnej) ma `[&>*]:w-full [&>.sr-only]:w-auto` (`src/components/ui/field.tsx:53`); wariant `responsive` ma to samo (`field.tsx:60`). Selektor `[&>.sr-only]:w-auto` ma większą szczegółowość niż `.sr-only`, więc ukryty element dostaje `width: auto`; przy `position: absolute` i `white-space: nowrap` jego szerokość to cała linia tekstu.
- Pomiar (skrypt `scratchpad/sf/scroll.mjs` tej sesji, Chrome z `channel: "chrome"`): wystający element `p[data-slot=field-description]`, `left` 28 px, `right` 473 px, `width` 445 px, `clip-path: inset(50%)`. Ten sam wynik przy 320, 360 i 390 px. Etykieta „Treść pytania” też ma `width: auto`, ale przy tych szerokościach nie wystaje (nie było jej na liście wystających elementów).
- Inne miejsca z `sr-only` jako bezpośrednim dzieckiem `Field`: przeszukane pliki importujące `components/ui/field` (`grep sr-only`): poza `QuestionField.tsx:95,112` brak; `EmoteBar.tsx:86` i `NewGameForm.tsx:180` nie są dziećmi `Field`. `QuestionField` z `labelHidden` (ProposalForm, `ProposalForm.tsx:158-161`, etykieta „Zaproponuj pytanie”, `ProposalForm.tsx:43`) ma ten sam mechanizm na etykiecie, ale krótki tekst; przy pomiarach nie wystawał.
- Przegląd wszystkich 67 stanów `/dev/room-window` przy 320 i 360 px bez klikania (`scratchpad/sf/all-states.mjs`): żaden nie jest szerszy od okna. Przegląd nie obejmuje stanów po interakcji poza „Popraw”.
- Możliwe poprawki (wybór do planu):
  - **A — u źródła, w `field.tsx`:** `[&>.sr-only]:w-auto` → `[&>.sr-only]:w-px` w wariantach `vertical` i `responsive` (przywraca 1 px z `sr-only` wobec `[&>*]:w-full`). Zmienia lokalną kopię komponentu shadcn; wymaga komentarza, bo `npx shadcn add field --overwrite` przywróciłby błąd.
  - **B — tylko w `QuestionField`:** np. `!w-px` przy `sr-only` albo ukryte teksty nie jako bezpośrednie dzieci `Field`. Nie dotyka shadcn, ale zostawia pułapkę dla następnego pola z `sr-only`.
  - Odrzucone: `overflow-x-clip`/`hidden` na ramce pokoju — chowa objaw, nie przyczynę.
- Test: projekt Playwright `phone` istnieje (`playwright.config.ts:41`); asercja `scrollWidth <= clientWidth` po „Popraw” pasuje do `tests/e2e/question-list.spec.ts` (tam są już kroki z „Popraw”, np. `:119-126`).

### 2. Fokus po zniknięciu przycisku

Wspólne: ogólne przeniesienie fokusu na tytuł nowego widoku (`RoomScreen.tsx:221-229`) działa tylko po ruchach z `VIEW_CHANGING = ["start", "reveal", "next", "more", "skip", "end"]` (`RoomScreen.tsx:133`); komentarz `RoomScreen.tsx:126-132` wprost mówi, że odpowiedź na spóźnionego, propozycja i odpowiedź na propozycję „keep the focus”. Efekt `removal` reaguje tylko na `remove` (`RoomScreen.tsx:234-260`). Komponenty F4 nie mają własnego kodu przenoszącego fokus po tych ruchach (raport podagenta, kotwice niżej; sprawdzone wyrywkowo: `RoomScreen.tsx:126-133`, `:234-260`, `QuestionProposals.tsx:197`, `JoinRequests.tsx:166`, `:179`, `ProposalForm.tsx:131-136`, `RoundVoting.tsx:357`, `:439`, `QuestionList.tsx:354-360`).

- **ProposalForm, trzecia propozycja:** fokus na polu (Enter) albo na „Wyślij”. Po odświeżonym stanie z `left: 0` (`usedUp`, `ProposalForm.tsx:76`) cały blok z przyciskiem rozwijania, polem i „Wyślij” znika, zostaje zwykły tekst „Nie masz już propozycji…” (`ProposalForm.tsx:131-136`). Efekt `focusField` (`:83-87`) działa tylko po rozwinięciu. Inny gracz nie może tego wywołać (liczy się tylko własny limit).
- **QuestionProposals, „Zatwierdź”/„Odrzuć”:** przyciski z `aria-disabled` trzymają fokus w czasie wysyłki (`:127-150`); wiersz `<li key={number}>` (`:226-238`) znika, gdy odświeżony stan nie ma już propozycji. Przy ostatnim wierszu znika cała sekcja razem z przyciskiem rozwijania (`count > 0 &&`, `:197`). Dzwonek prowadzących idzie przez `waitUntil` (`src/lib/rooms/server.ts:797-800`), więc odświeżenie może przyjść przed odpowiedzią HTTP. Ten sam wiersz może zniknąć przez ruch drugiego prowadzącego.
- **JoinRequests, „Wpuść”/„Odrzuć”:** ten sam wzór (`:101-123`, `:150-156`); każda z dwóch sekcji renderuje się tylko przy niepustej liście (`:166` „Chcą wrócić na swoje miejsce”, `:179` „Proszą o wejście”), więc ostatni wiersz zabiera nagłówek sekcji. Brak przycisku rozwijania.
- **RoundVoting, „Zagłosuj” (poza F4):** prawdziwe `disabled={voting}` (`RoundVoting.tsx:439`); po przyjętym głosie formularz zastępuje komunikat „Głos oddany” (`:357-370`). Zmierzone w Chrome (`scratchpad/sf/vote-focus.mjs`, podgląd `vote-guest`, 390 px): przed Enter fokus na „Zagłosuj”, po głosie na `body`. `vote` nie jest w `VIEW_CHANGING`.
- **Utrata roli współhosta (ruch innej osoby):** `view.leader` = false odmontowuje JoinRequests, QuestionProposals i pasek prowadzącego; istniejąca zasada nie przenosi fokusu innym graczom (`RoomScreen.tsx:212-213`).

**Istniejące dobre wzorce:**

- **RoomScreen `removal` („Usuń” na liście „Gracze”):** przy naciśnięciu, z listy sprzed ruchu, zapamiętuje usuwany nick i następny wiersz (`RoomScreen.tsx:315-329`, zapis przed wysłaniem, bo dzwonek może być pierwszy). Efekt czeka, aż odświeżony stan nie ma nicku, ogłasza „Usunięto X.” i **tylko gdy fokus zginął** (`activeElement` to `null` albo `body`, `:239-240`) przenosi go kolejno na: przycisk następnego wiersza (`[data-remove]`), nagłówek `players-heading` z `tabIndex=-1` i `outline-none`, a gdy widok się zmienił — pierwszy `h1, h2` (`:241-259`).
- **QuestionList `removedRow`:** po przyjętym „Usuń” od razu, przed ukryciem wiersza, fokus na „Popraw” następnego wiersza albo na „Dolosuj pytanie” (`QuestionList.tsx:354-360`); bez sprawdzania, czy fokus zginął. Działa, bo wiersz znika optymistycznie na odpowiedź, a nie na odświeżony stan.
- Wspólnego pomocnika brak; sztuczka „nagłówek z `tabIndex=-1`” jest powtórzona dwa razy w RoomScreen (`:224-228`, `:250-257`).

**Testy fokusu dziś (e2e; testów jednostkowych komponentów brak, Vitest w `environment: "node"`):** `remove-player.spec.ts:96` (tytuł rundy po usunięciu, które odsłania), `:142` (nagłówek „Gracze (2)” po ostatnim wierszu), `question-list.spec.ts:128`, `:137` (powrót na „Popraw”), `:150` („Usuń” → następne „Popraw”), `proposals.spec.ts:150` (rozwinięcie → pole), `:308`, `:315`, `player-color.spec.ts:80`, `:162`. Bez testu: fokus po trzeciej propozycji (`proposals.spec.ts` sprawdza tylko zniknięcie formularza), po „Zatwierdź”/„Odrzuć”, po „Wpuść”/„Odrzuć”, po głosie, gałąź „następny wiersz” w `removal`, „Dolosuj pytanie” po ostatnim wierszu listy.

**Zasada pasująca do istniejących wzorców (propozycja dla planu):** uogólnić `removal`. Przy własnym ruchu, który zabiera naciśnięty przycisk, zapamiętać cel z listy sprzed ruchu; gdy odświeżony stan nie ma już pozycji i **tylko gdy fokus zginął**, przenieść go kolejno na: (1) ten sam przycisk w następnym wierszu, (2) najbliższy element tego samego bloku, który został (z `tabIndex=-1`, jak `players-heading`), (3) tytuł widoku. Logika w rodzicu listy, nie w wierszu, bo dzwonek może odmontować wiersz przed odpowiedzią. Dla ProposalForm krok (2) to linia „Nie masz już propozycji…”; dla „Zagłosuj” — komunikat „Głos oddany”.

## Code References

- `src/components/ui/field.tsx:53`, `:60` — `[&>.sr-only]:w-auto` w wariantach `vertical` i `responsive` (shadcn, bez zmian względem rejestru 08.11)
- `src/components/room/QuestionField.tsx:94-116` — `Field` z etykietą i podpowiedzią jako bezpośrednimi dziećmi; `sr-only` przy `compact`/`labelHidden`
- `src/components/room/QuestionList.tsx:230-233` — „Popraw” renderuje `QuestionField compact`
- `src/components/room/QuestionList.tsx:354-360` — `removedRow`: fokus na następne „Popraw” albo „Dolosuj pytanie”
- `src/components/room/RoomScreen.tsx:126-133` — `VIEW_CHANGING` i komentarz o ruchach, które „keep the focus”
- `src/components/room/RoomScreen.tsx:221-229` — fokus na tytuł nowego widoku po ruchu prowadzącego
- `src/components/room/RoomScreen.tsx:234-260`, `:315-329` — wzorzec `removal`
- `src/components/room/RoomScreen.tsx:42-45` — podglądy bez zapytań; ruchy prowadzącego zostają „zajęte”
- `src/components/room/ProposalForm.tsx:76`, `:83-87`, `:131-136` — `usedUp`, `focusField`, tekst po limicie
- `src/components/room/QuestionProposals.tsx:127-150`, `:197`, `:226-238` — przyciski wiersza, sekcja tylko przy `count > 0`, wiersz
- `src/components/room/JoinRequests.tsx:101-123`, `:150-156`, `:166`, `:179` — przyciski, wiersz, dwie sekcje
- `src/components/room/RoundVoting.tsx:357-370`, `:439` — „Głos oddany” zamiast formularza, `disabled={voting}`
- `src/lib/rooms/server.ts:797-800` — dzwonek przez `waitUntil` (odświeżenie może wyprzedzić odpowiedź)
- `playwright.config.ts:41` — projekt `phone`

## Architecture Insights

- Ukrywanie „tylko dla czytnika” w `Field` jest pułapką całego komponentu, nie jednego ekranu: każde przyszłe pole z `sr-only` na etykiecie albo podpowiedzi dostanie pełną szerokość tekstu. Poprawka u źródła (A) usuwa pułapkę dla wszystkich.
- W pokoju są dwa rodzaje znikania wiersza: optymistyczne na odpowiedź (QuestionList — fokus można przenieść od razu) i na odświeżony stan (Gracze, propozycje, prośby — fokus trzeba przenieść po stanie, z zapisanym celem). Miejsca F4 należą do drugiego rodzaju.
- Zasada „nie ruszamy fokusu innym graczom” (`RoomScreen.tsx:212-213`) zostaje: przenosimy tylko po własnym ruchu i tylko gdy fokus zginął.

## Historical Context (from prior changes)

- `context/changes/guest-question-proposals/follow-ups/review-fixes.md` — F4: „Fokus spada wtedy na `body`… Niesprawdzone w przeglądarce”. Werdykt: dla trzech miejsc **częściowo potwierdzone** (kod potwierdza brak przeniesienia, przeglądarka nie dla tych trzech; mechanizm zmierzony na „Zagłosuj”). Zdanie „`JoinRequests` ma ten sam brak” — **potwierdzone** w kodzie. Wskazany wzór „jak po »Usuń« na liście »Gracze«” — **potwierdzony** jako pasujący.
- `Desktop\10xdevs-gra.md` („Stan”, 05.11): „w »Popraw« na liście hosta ukryta podpowiedź daje przewijanie w bok na telefonie” — **potwierdzone** 08.11, po S-19, pomiarem w Chrome.

## Related Research

- `context/changes/guest-question-proposals/research.md` — wzorce formularza i rozwijania sekcji (S-10).
- Nie dotyczy: brak wcześniejszego researchu o `Field`/`sr-only`.

## Open Questions

1. Poprawka przewijania: A (`field.tsx`, u źródła) czy B (tylko `QuestionField`)? Rekomendacja researchu: A z komentarzem.
2. Zakres fokusu: tylko trzy miejsca F4 czy także „Zagłosuj”? (Zmierzone, ten sam błąd, mała zmiana.)
3. Cel fokusu po ostatnim wierszu QuestionProposals i ostatnim wierszu sekcji JoinRequests: druga sekcja, nagłówek „Gracze”, czy tytuł widoku — do ustalenia w planie, w duchu `removal`.
4. Luka dowodowa: zachowanie w przeglądarce dla trzech miejsc F4 domkną testy e2e w CI (napisane przed poprawką, powinny najpierw być czerwone). Zachowanie czytników ekranu (NVDA, VoiceOver, TalkBack) niesprawdzone.
