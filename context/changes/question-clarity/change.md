---
change_id: question-clarity
title: Przegląd brzmienia pytań bazy po pierwszej grze ze znajomymi
status: new
created: 2026-11-22
updated: 2026-11-22
archived_at: null
---

## Notes

Roadmapa S-28 (`context/foundation/roadmap.md`), decyzja Karola 2026-11-22, po pierwszej grze ze znajomymi.

- Uwaga graczy: pytania pisane z AI bywają sformułowane tak, że trzeba się domyślać, o co chodzi. Nie chodzi o brak wiedzy o grze czy serialu z pytania, tylko o samo brzmienie.
- Przykład z gry: `znane-gry-024` „trafiłby pilotem od Wii w telewizor”. Znajoma nie wiedziała, czemu „trafił”: pytanie zakłada nieopisaną anegdotę (pilot wyślizgujący się z ręki w ferworze gry), a „trafiłby” brzmi jak celny rzut. Dwa wzorce: ukryte nawiązanie i słowo, które zmienia sens.
- Przegląd otwarty („może coś innego ciekawego znajdziemy”): też prawie powtórki, pytania za długie na ekran telefonu, nietrafiona kategoria albo znacznik 18+, pytania, które mogą zranić zamiast rozbawić, pytania płaskie.
- Sposób: agent przegląda, agent-krytyk sprawdza, Karol wybiera z krótkiej listy znalezisk, co poprawiamy. Numery pytań zostają.
- Kolejność: przed Fazą 3 S-27 `english-version` (tłumaczenie pytań; draft PR #92 czeka).
- Same przeróbki tekstu nie zmieniają bazy (stan bazy trzyma numery, kategorie i znacznik 18+); zmiana kategorii albo 18+ to migracja `npm run questions:migration` i `db push` przed scaleniem.
