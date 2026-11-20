# Poprawki z przeglądu implementacji (guest-question-proposals)

Źródło: `reviews/impl-review.md` (06.11.2026). Decyzja Karola: F1 (Fix A), F3 i F5 poprawione, F2, F6 i F7 przyjęte, F4 odłożone tutaj.

## F4: fokus ginie po własnym ruchu

- **Kiedy**: bez pośpiechu, przy następnej zmianie tych ekranów. Na wieczorze z czytnikiem ekranu (F7 z S-02) warto zwrócić na to uwagę.
- **Co**: po trzeciej propozycji wysłanej Enterem pole znika, a po „Zatwierdź” znika wiersz, przy ostatnim cała sekcja. Fokus spada wtedy na `body`, choć komentarz mówi, że odpowiedź go nie przenosi (`src/components/room/ProposalForm.tsx`, `usedUp`; `src/components/room/QuestionProposals.tsx`, nagłówek pliku i `setOpen(false)` przy pustej liście). `JoinRequests` ma ten sam brak, więc to odziedziczony wzorzec. Głównie cierpi czytnik ekranu. Niesprawdzone w przeglądarce.
- **Zrób**: najpierw sprawdzić w przeglądarce, gdzie naprawdę ląduje fokus. Potem jedna zasada dla trzech miejsc (`ProposalForm`, `QuestionProposals`, `JoinRequests`), gdy przycisk znika pod fokusem: następny wiersz, a bez niego przycisk albo nagłówek obok, jak po „Usuń” na liście „Gracze” (`RoomScreen.tsx`, `removal`). Test e2e na fokus po ostatnim wierszu.
- **Stan**: poprawione w zmianie `scroll-and-focus-fixes` (PR #47, 2026-11-09), rozszerzone o „Zagłosuj”. Przed poprawką nowe sprawdzenia e2e były czerwone we wszystkich trzech miejscach (fokus nie trafiał na następny wiersz, zdanie o limicie ani tytuł). Zasada w `src/components/room/focus.ts`, testy w `proposals.spec.ts` i `latecomer.spec.ts`.
