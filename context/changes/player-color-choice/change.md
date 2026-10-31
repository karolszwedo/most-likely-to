---
change_id: player-color-choice
title: Wybór koloru przez gracza
status: impl_reviewed
created: 2026-10-31
updated: 2026-10-31
archived_at: null
---

## Notes

Gracz sam wybiera swój kolor zamiast koloru z miejsca przy stole (`seatColors`, zmiana `player-colors` z 2026-10-25, gdzie wybór odłożono jako wariant B). Prośba znajomych po grze 2026-10-26. Kolejność Karola z 2026-10-27: S-07 → wybór koloru → S-09 → S-10; S-09 (usunięcie gracza) potrzebuje zapisanego koloru, bo dziś kolor liczy się z pozycji na liście graczy, a słownik („kolor gracza”) wymaga, żeby usunięcie gracza nie zmieniało kolorów pozostałych. PRD nie ma jeszcze takiego wymagania: dodatek v1 jak FR-024, do dopisania jako FR-025 (decyzja Karola 2026-10-31: „tak, działamy”). Wygląd wyboru koloru wybiera Karol na zrzutach.

Faza 3 (2026-10-31, decyzje Karola na zrzutach): wygląd A „Kropki pod nickiem” (paleta rozwija się pod własnym wierszem, 5 kolorów w rzędzie), podpowiedź „Dotknij swojej kropki, żeby zmienić kolor.” pod listą. Na prośbę Karola („kolory dość pstrokate”) nowa paleta „Stonowana” w miejsce kolorów z `player-colors` (`--chart-1` … `--chart-20` w `src/styles/global.css`; plan wykluczał nowe kolory, Karol zmienił to sam): ziemiste odcienie, kontrast co najmniej 3,5:1, najbliższa para 0,064 w OKLab (wcześniej 0,095). Nazwy kolorów (`COLOR_NAMES`) tylko dla czytnika ekranu, na ekranie żadnej („nie ma sensu”).
