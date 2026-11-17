---
change_id: room-chat-gifs
title: Room chat gifs
status: preparing
created: 2026-11-17
updated: 2026-11-17
archived_at: null
---

## Notes

S-24 w roadmapie, FR-028 (część „gify”) w PRD; punkt 6 kolejki Karola (B czat), po `room-chat` (S-23). Research: `research.md`.

Decyzje Karola z 2026-11-17 (do Open Questions w `research.md`, „elegancko” = tak na wszystkie trzy):

1. Dostawca: **KLIPY** (klucz testowy 100 zapytań/h, potem wniosek o produkcyjny z nagraniem ekranu; GIPHY odpada, bo jego klucz produkcyjny jest płatny).
2. Prywatność przyjęta: dostawca widzi słowa wyszukiwania oraz IP i przeglądarkę każdego gracza, który szuka albo widzi gifa, ale nie nick ani pokój (wywołania z przeglądarki to wymóg KLIPY; Worker nie pośredniczy).
3. Filtr przyjęty: najostrzejszy filtr w zapytaniu i w panelu KLIPY; gracz, który przerobi własną stronę, może przemycić gifa spoza filtra, a gra pokaże tylko gify z hostów KLIPY; na niechcianego gracza prowadzący ma usunięcie.

Konto KLIPY na koncie gry (nie prywatnym Karola); klucz jako sekret Workera (`npx wrangler secret put`, za zgodą) i w `.dev.vars`.
