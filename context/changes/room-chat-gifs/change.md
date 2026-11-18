---
change_id: room-chat-gifs
title: Room chat gifs
status: implementing
created: 2026-11-17
updated: 2026-11-18
archived_at: null
---

## Notes

S-24 w roadmapie, FR-028 (część „gify”) w PRD; punkt 6 kolejki Karola (B czat), po `room-chat` (S-23). Research: `research.md`.

Decyzje Karola z 2026-11-17 (do Open Questions w `research.md`, „elegancko” = tak na wszystkie trzy):

1. Dostawca: **KLIPY** (klucz testowy 100 zapytań/h, potem wniosek o produkcyjny z nagraniem ekranu; GIPHY odpada, bo jego klucz produkcyjny jest płatny).
2. Prywatność przyjęta: dostawca widzi słowa wyszukiwania oraz IP i przeglądarkę każdego gracza, który szuka albo widzi gifa, ale nie nick ani pokój (wywołania z przeglądarki to wymóg KLIPY; Worker nie pośredniczy).
3. Filtr przyjęty: najostrzejszy filtr w zapytaniu i w panelu KLIPY; gracz, który przerobi własną stronę, może przemycić gifa spoza filtra, a gra pokaże tylko gify z hostów KLIPY; na niechcianego gracza prowadzący ma usunięcie.

Konto KLIPY na koncie gry (nie prywatnym Karola); klucz jako sekret Workera (`npx wrangler secret put`, za zgodą) i w `.dev.vars`.

Decyzje Karola przy `/10x-plan` (2026-11-17, wszystkie według rekomendacji):

4. Po otwarciu wyszukiwarki puste pole; zapytanie dopiero po słowie i „Szukaj” (limit 100/h), bez popularnych gifów na starcie.
5. Napis w polu „Search KLIPY” po angielsku (wymóg KLIPY), etykieta czytnika ekranu „Szukaj gifa”.
6. Wdrożenie od razu na kluczu testowym; nagranie ekranu z produkcji i wniosek o klucz produkcyjny, po zgodzie podmiana sekretu.
7. Fazy: 1 CSP → 2 gif na serwerze → 3 gify na ekranach (galeria, wybór Karola) → 4 dokumenty i wdrożenie.
