---
change_id: scroll-and-focus-fixes
title: Scroll and focus fixes
status: implementing
created: 2026-11-08
updated: 2026-11-09
archived_at: null
---

## Notes

<!-- Free-form notes for this change: links, ad-hoc context, decisions that don't belong in research/frame/plan. -->

- PR #47 (draft).
- Faza 1, próbny alarm (2026-11-08, `d0c2bf7`, run 42512724525): `ci`, `smoke`, `db` zielone; w `e2e` czerwone 7 testów, każdy we wszystkich 3 próbach i tylko na nowych asercjach `expect.soft`: `question-list.spec.ts` tylko w `phone` (linia 133, strona szersza od okna o 90 px); `proposals.spec.ts` w `chromium` i `phone`, pierwszy test na liniach 263, 315 i 342, nowy test na liniach 410 i 418; `latecomer.spec.ts` (linie 111 i 180); `round.spec.ts` (linie 56, 59 i 84). 25 pozostałych testów zielonych.
- ADAPT względem planu: po drugim „Odrzuć” w `latecomer.spec.ts` (`:187` planu) wiersz D nie znika (pobieranie stanu hosta zablokowane, D prosi drugi raz pod tym samym nickiem), więc test sprawdza, że fokus zostaje na „Odrzuć”. Zielone przed poprawką, ma zostać zielone po niej.
- Faza 2 (2026-11-09, `f1daa55`, run 42588641874): `ci`, `smoke`, `db` i `e2e` zielone, w tym wszystkie nowe sprawdzenia z Fazy 1 w obu projektach. Workers Builds na gałęzi czerwone, tak samo jak przy PR #45 i #46, więc to nie ta zmiana.
- Decyzje:
  - Zakres fokusu: F4 z przeglądu S-10 (ProposalForm, QuestionProposals, JoinRequests) plus „Zagłosuj” (decyzja Karola, 2026-11-08): ten sam błąd i najczęstszy ruch w grze.
  - Przewijanie poprawione u źródła, w `src/components/ui/field.tsx` (`[&>.sr-only]:w-px` zamiast `w-auto`), a nie w `QuestionField`: usuwa pułapkę dla każdego przyszłego pola z ukrytym tekstem. Lokalne odstępstwo od shadcn (rejestr z 2026-11-08 ma `w-auto`), więc `shadcn add field --overwrite` przywróci usterkę; mówi o tym komentarz w pliku.
  - Po głosie fokus idzie na pytanie (tytuł widoku), nie na „Głos oddany”: komunikat ma `role="alert"`, więc fokus na nim dałby podwójne odczytanie.
