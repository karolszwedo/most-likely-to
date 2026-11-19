---
change_id: game-restyle
title: Game restyle
status: implementing
created: 2026-11-19
updated: 2026-11-19
archived_at: null
---

## Notes

<!-- Free-form notes for this change: links, ad-hoc context, decisions that don't belong in research/frame/plan. -->

Roadmapa S-25, PRD FR-029. Decyzje Karola z trzech galerii zrzutów (2026-11-19):

- Runda 1 (Dziś / A „Tablica nocą” / B „Tablica dzienna” / C „Scena”, wzór z planera Karola): „coś między A a B, ale to jeszcze nie to”. Nie pasował kolor główny i było za płasko; „motyw typu full biały na pewno nie, ciężko się korzysta”. Baza ciemna: grafit, czerń, szarość, antracyt, z kolorem „z przeciwnej strony palety”. Wzory: Discord, Spotify / Apple Music, XTB.
- Runda 2 (tło G1–G4, kolor 1–16, głębia D1–D4): **G2 Grafit** (tło `oklch(0.215 0.008 265)`, karty `oklch(0.265 0.008 265)`), **6 Blurple** (`oklch(0.6 0.2 277)`, biały napis), **D1 płasko z cieniem**; głębia „jeszcze jako otwarty temat”.
- Runda 3 (pełne ekrany, Dziś obok Nowego): „git”.
- Kształty z planera: przyciski i plakietki jako pigułki, gracze na listach jako osobne kafelki z cieniem zamiast linii, tabela wyniku bez linii, czcionka Manrope (400–800), `--radius: 1rem`, pola z tłem `muted` i obwódką 1,5 px. Gra zostaje zawsze ciemna; kolory graczy bez zmian.
- Generator zrzutów (poza repo): `shots.mjs`, `shots2.mjs`, `shots3.mjs` w katalogu roboczym sesji; wartości wszystkich tokenów rundy 2 są w `shots2.mjs` (`BASES.g2`, `ACCENTS[5]`, `SHAPES`, `DEPTH`).
