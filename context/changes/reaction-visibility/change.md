---
change_id: reaction-visibility
title: Kciuki na odsłonie lepiej widoczne
status: implementing
created: 2026-11-24
updated: 2026-11-24
archived_at: null
---

## Notes

Roadmapa: S-30 `reaction-visibility` (`2452ef6`), w ramach FR-016. Uwaga P z pierwszej gry ze znajomymi (2026-11-22): kciuki „Oceń pytanie” pod wynikiem odsłony były mało widoczne, gracze ich nie zauważali. Więcej kciuków to więcej danych o słabych pytaniach (S-28, druga połowa S-12). Decyzja Karola 2026-11-24.

- **Jeden widok:** odsłona wyniku (`src/components/room/RoundReveal.tsx`), a w niej kciuki (`src/components/room/QuestionReaction.tsx`).
- **Źródło tokenów:** istniejący system z S-25 `game-restyle`: wartości w `src/styles/global.css` (`:root` z `.dark`, publikowane w `@theme inline`), komponenty w `src/components/ui` (shadcn), kafelki i karty w `src/components/room/surfaces.ts`. Rozszerzamy go, bez drugiej palety.
- **Wstępny audyt `/10x-ui` (2026-11-24):** skan literałów na obu plikach widoku: 0 trafień. Kciuki biorą `Button` z `ui` (`size="icon"`, czyli `size-9`, 36 px), `FieldError` i `Spinner`; podpis „Oceń pytanie” `text-sm font-medium`, bez karty; znaczenie kciuków („Dobre pytanie”, „Słabe pytanie”) tylko w `aria-label`. Podglądy: `/dev/room-states` (`reaction-none`, `reaction-up`, `reaction-host-down`, `reaction-sending`, `reaction-error`); e2e szuka przycisków po nazwach (`tests/e2e/support/round.ts:98`).
- **Granice:** kciuk zostaje nieobowiązkowy, nie wstrzymuje prowadzącego, widzi go tylko ten gracz; bez bazy, bez `src/lib/rooms/`, bez timerów. Lżejszy cykl, warianty wybiera Karol na zrzutach.
