---
change_id: host-game-history
title: Lista gier hosta i kasowanie
status: implementing
created: 2026-11-10
updated: 2026-11-11
archived_at: null
---

## Notes

S-13 z roadmapy (FR-019): host widzi minimalną listę swoich gier (data, liczba pytań, kto grał) i kasuje dowolną;
kasowanie usuwa wszystko, co wiąże się z nickami, a anonimowe dane o pytaniach zostają we wspólnej bazie, o czym
aplikacja mówi wprost. Ryzyka z roadmapy: ekran gościa z otwartą kartą po skasowaniu gry (`/r/[id].astro`, przegląd
S-09, F6) i kaskadowe usunięcie zatwierdzonych propozycji pytań z `private.game_questions` (S-10, FR-021). S-11 jest
zamknięte (10.11: na produkcji 49 wierszy w `private.question_stats`), więc kasowanie da się sprawdzić na prawdziwych
danych zbiorczych.
