---
change_id: no-recent-repeats
title: Bez powtórek z ostatnich gier hosta
status: implementing
created: 2026-11-15
updated: 2026-11-15
archived_at: null
---

## Notes

- Roadmapa: S-20, wydzielone z S-12 (`learning-question-selection`) decyzją Karola 2026-11-15. Druga połowa S-12 (wagi z danych o pytaniach) czeka na dane z wieczorów z ekipą.
- Cel w grze: ekipa nie dostaje pytań, które host zna już z gier testowych i poprzednich gier. Wszystkie dotychczasowe gry (testy i ze znajomymi) założył Karol na swoim koncie, więc liczy się historia tego jednego hosta.
- Dziś gra pilnuje tylko braku powtórek w jednej grze (`private.rounds`, unikat `room_id` + `question_id`); zagrane pytania zostają przy grze hosta (`rooms.host_id`) także po jej końcu, do skasowania gry (S-13) albo konta. S-20 czyta ten zapis, nie dodaje nowych danych o graczach.
- Decyzja Karola 2026-11-15 (Open Roadmap Question 5): gdy w wybranych kategoriach skończą się pytania niegrane u tego hosta, gra bierze najpierw te grane najdawniej (talia: zagrane idą pod spód), a nie zapomina historii. Gdy świeżych jest mniej, niż gra potrzebuje, najpierw świeże, resztę z najdawniej granych.
- Decyzje Karola po researchu (2026-11-15): liczą się wszystkie gry hosta; pominięte pytanie i runda bez odsłony liczą się jako zagrane; pozycje usunięte z listy przed startem też. Skasowana gra (S-13) wypada z historii razem z rundami.
- Skala bazy 2026-11-15: 400 pytań, 10 kategorii po 30 + 10 pytań 18+; jedna kategoria bez 18+ starcza na 2 gry po 15 pytań.
