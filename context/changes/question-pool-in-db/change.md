---
change_id: question-pool-in-db
title: Pula pytań w bazie
status: impl_reviewed
created: 2026-11-13
updated: 2026-11-14
archived_at: null
---

## Notes

S-17 z roadmapy (FR-005): prowadzący (host albo współhost) może otworzyć tylko pytanie z kategorii wybranych przez
hosta, a pytanie 18+ tylko z kategorii, w których host je włączył, także gdy woła funkcję bazy sam, z tokenem z
ciasteczka, z pominięciem ekranu gry. Zamyka znaną dziurę F1 z przeglądu planu S-07
(`context/changes/co-host-role/reviews/plan-review.md`), przypiętą testem `test.fails` „znana dziura F1 → S-17” w
`tests/db/cohost.test.ts`: dziś pulę sprawdza tylko Worker (`poolFrom`, `src/lib/rounds/draw.ts`), a `start_game`,
`next_round`, `skip_round` i `more_questions` sprawdzają tylko format id. Otwarte pytanie z roadmapy: jak baza ma znać
kategorie i 18+ pytań bazy startowej, które dziś są tylko w kodzie Workera (`src/data/questions.ts`). Po S-17 Karol
planuje rozbudowę bazy pytań (nowe kategorie i pytania), więc rozwiązanie nie powinno utrudniać dopisywania pytań.
