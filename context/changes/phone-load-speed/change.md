---
change_id: phone-load-speed
title: Pomiar szybkości otwierania gry na telefonie
status: preparing
created: 2026-11-27
updated: 2026-11-27
archived_at: null
---

## Notes

Punkt G kolejki Karola (16.11.2026, bardzo niski priorytet; ostatni punkt kolejki po S-27). Pytanie: jak szybko gra otwiera się na telefonie, zwłaszcza strony, które gracz widzi pierwszy raz (link do pokoju `/j/…`, potem pokój `/r/…`), i czy jest coś, co warto przyspieszyć. 15.11 pomiar był skreślony, 16.11 wrócił do kolejki jako G.

- **Najpierw pomiar, potem decyzja:** gdy pomiar pokaże, że gra otwiera się szybko, zmiana kończy się zapisem wyniku bez kodu; slice w roadmapie (`/10x-roadmap`, za zgodą Karola) tylko wtedy, gdy jest co poprawiać.
- **Granice:** bez nowych narzędzi bez zgody Karola (na miejscu są Playwright i Chrome); produkcja tylko do odczytu stron, a pokój na produkcji tylko za zgodą (zmienia bazę, jak smoke); `.dev.vars` wskazuje na produkcję, więc serwer dev tylko do podglądów `/dev/*`.
