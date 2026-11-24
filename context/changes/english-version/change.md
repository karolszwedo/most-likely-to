---
change_id: english-version
title: Wersja angielska gry
status: implementing
created: 2026-11-21
updated: 2026-11-24
archived_at: null
---

## Notes

Punkt 11 F kolejki gry (kolejność zatwierdzona przez Karola 16.11.2026, po L `categories-unticked`).

Dziś gra i baza pytań są tylko po polsku: PRD §Non-Goals „Bez wersji angielskiej w v1” (decyzja hosta 2026-09-26), roadmapa, Parked: „Wersja angielska”. Najpierw zmiana PRD (zdjęcie z Non-Goals, nowe FR) i wpis w roadmapie przez `/10x-roadmap` (z Parked do nowego slice'a), za zgodą Karola.

Zakres (język ekranów, pytań, wybór języka) do ustalenia w researchu i decyzjach Karola. Pełny cykl, jeśli zmiana dotknie bazy pytań albo serwera gry.

## Decyzje Karola

- 21.11.2026, po researchu (rekomendacje przyjęte w całości):
  - język należy do gry: host wybiera PL albo EN przy „Nowa gra”, wszyscy w pokoju widzą ten język;
  - angielskie pytania to tłumaczenie tych samych 960 numerów (bez zmian w bazie pytań), nieprzetłumaczalne gra po angielsku pomija;
  - ekrany hosta przed grą: język przeglądarki na start, przełącznik PL/EN w ciasteczku (wygląd na zrzutach);
  - pytania pisze agent, poprawia agent-krytyk, Karol ogląda próbkę około 30 i zatwierdza; wszystkie 960, z 18+.
- 21.11.2026, wywiad do planu (`plan.md`, decyzje 3–9):
  - przełącznik PL | EN w prawym górnym rogu każdego ekranu, aktywny cały czas, zmienia tylko ekrany osoby, która kliknie (także w pokoju w trakcie gry); język gry to język startowy i pula pytań, sam jest stały;
  - przeglądarka w innym języku niż polski i angielski daje angielski, bez nagłówka języka polski;
  - początek angielskiego pytania „Who’s most likely to …?”;
  - tłumaczenie dosłowne albo pytanie wypada (zamiast adaptacji polskich odniesień);
  - dwa PR-y: najpierw sam słownik bez zmiany wyglądu, potem reszta.
- 24.11.2026, wieczór, zmiana kierunku (`plan.md`, decyzje 1, 4, 6, 8–11):
  - gra nie ma języka: każdy gracz ma swój język ekranu i zmienia go tylko przełącznikiem (F2); bez wyboru na „Nowa gra”, bez języka w bazie (Faza 2 wycofana, nigdy na produkcji), każda gra losuje ze wszystkich pytań;
  - 33 pytania bez angielskiego tekstu: drugie podejście, dosłowne tłumaczenie z krótkim wyjaśnieniem w samym pytaniu; te, które i tak nie działają, zostają w grze i na ekranie EN stoją po polsku z dopiskiem „Only in Polish”;
  - karta linku w języku tego, kto skopiował link (`?lang=en` z ekranu po angielsku);
  - pytania wpisane przez graczy: początek zdania w języku ekranu osoby, która czyta (świadomie przyjęte mieszanie języków w mieszanej ekipie).
