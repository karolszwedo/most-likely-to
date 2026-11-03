---
change_id: remove-player-new-link
title: Usunięcie gracza i nowy link do pokoju (S-09)
status: impl_reviewed
created: 2026-10-31
updated: 2026-11-02
archived_at: null
---

## Notes

S-09 z roadmapy (`context/foundation/roadmap.md`, FR-004): host lub współhost usuwa gracza z pokoju, pokój dostaje nowy link, a stary przestaje działać. Ryzyko z roadmapy: zmiana linku w trakcie gry nie może wyrzucić pozostałych graczy. Kolejność Karola z 2026-10-27: S-07 → wybór koloru (S-18) → S-09 → S-10; Karol 2026-10-31: „tak, zaczynamy S-09”. Zapisany kolor gracza (S-18, `players.color`) jest gotowy: usunięcie gracza nie może zmienić kolorów pozostałych (`context/domain/glossary.md`, „kolor gracza”). Znane z przeglądu S-07: host, który wyszedł, dalej jest uprawniony do głosu, więc runda czeka na jego głos aż do ręcznej odsłony. Wygląd ekranów wybiera Karol na zrzutach.
