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
