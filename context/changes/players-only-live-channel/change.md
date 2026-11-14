---
change_id: players-only-live-channel
title: Players only live channel
status: implementing
created: 2026-11-14
updated: 2026-11-14
archived_at: null
---

## Notes

<!-- Free-form notes for this change: links, ad-hoc context, decisions that don't belong in research/frame/plan. -->

- 2026-11-14, Faza 1 (baza) `c6ab7b0`, draft PR #57; CI zielone (`ci`, `smoke`, `db`, `e2e`), w `db` 18 testów `channel-key.test.ts`, pgTAP 484/484. Właściciel zaakceptował streszczenie migracji (1.4).
- Próbny alarm Fazy 1 (do rejestru test-plan §6.2 w Fazie 3): `0bce2e8` z dwoma uszkodzeniami, (a) `remove_player` bez nowego `channel_key`, (b) `room_lobby` z `channel_key` tylko dla prowadzących. Przewidywanie zapisane przed pushem: 6 czerwonych w `channel-key.test.ts`, reszta zielona. Wynik: trafił dokładnie (rotacja przy usunięciu; Ola ×3; Ola po usunięciu; nowa przeglądarka Bartka), pozostałe 18 plików `db`, pgTAP 484/484, `ci`, `smoke`, `e2e` zielone; recenzja AI `fail` (widziała uszkodzenia, poza bramką). Revert `d4e57a0`.
- Do Fazy 3: test-plan §6.2 „Sign-up limit” mówi o 23 kontach na przebieg, z `channel-key` (2 hosty: drugi tylko do odczytu REST cudzego pokoju) jest 25 z 30.
