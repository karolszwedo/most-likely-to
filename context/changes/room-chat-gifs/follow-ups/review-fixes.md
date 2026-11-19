# Poprawki z przeglądu implementacji (room-chat-gifs)

Źródło: `reviews/impl-review.md` (2026-11-19, APPROVED, 0/1/7). Karol: „Wszystkie F1–F8” (F1 w wersji A, bez zdarzeń na serwer). Jedna zmiana na osobnej gałęzi od `origin/main`, PR, scalenie dopiero po zielonym CI (dotyka `src/lib/rooms/` i `tests/`). Przed push: bramka (`npm run lint`, `npx astro check`, `npm test`, `npm run build`) i, według `context/foundation/lessons.md` („Po poprawkach z przeglądu uruchom zmieniony kod przed push”), przeklikanie wyszukiwarki na `/dev/room-states` i `/dev/room-window` (zrzuty w headless Chrome).

## Do zrobienia

- [ ] **F1** `src/lib/rooms/gifs.ts` `searchGifs`: KLIPY oddało wyniki (`data.data` niepuste), a `parseGifResults` pominęło wszystkie → `logEvent("warn", { op: "gif_search", status, field: "file" })` i `{ kind: "failed", failure: "error" }` zamiast `empty`. Pusta lista od KLIPY dalej `empty`. Test jednostkowy obu przypadków w `tests/unit/gifs.test.ts`.
- [ ] **F2** `parseGifResults`: opis łamiący `GIF_TITLE_MAX_LENGTH` (100) albo regułę znaków czatu (ta sama funkcja co w `chatContent`, `src/lib/rooms/chat.ts`) → `""`. Test: opis 101 znaków, ze znakiem sterującym, ze znakiem kierunku.
- [ ] **F3** `searchGifs` przyjmuje `signal` od wołającego; `useGifSearch` tworzy `AbortController` na wyszukiwanie, przerywa go `setTimeout(GIF_SEARCH_TIMEOUT_MS)`, nowszym wyszukiwaniem i sprzątaniem przy odmontowaniu (wzór: `src/lib/live-sync/limiter.ts:79-87`). Bez `AbortSignal.timeout`. Przerwane przez nowsze albo odmontowanie: bez logu i bez zmiany stanu.
- [ ] **F4** `src/components/room/RoomChat.tsx:473`: `aria-label` przycisku „GIF” → „GIF: wyszukaj gifa”; lokator w `tests/e2e/chat.spec.ts:108-111` i podglądy, jeśli go używają.
- [ ] **F5** tekst ogólnej awarii wyszukiwarki (`GifPicker.tsx`): dopisać możliwy godzinny limit, np. „Nie udało się wczytać gifów. Może skończył się limit na tę godzinę.” Sprawdzić asercje e2e i podglądy z tym tekstem.
- [ ] **F6** `public/.assetsignore` z `dev/` (próbki `/dev/gifs/*.svg` poza plikami Workera), jeśli Workers Static Assets czyta `.assetsignore` z katalogu wyjściowego `dist/`; sprawdzić po `npm run build`, że `dist/dev/` nie trafia do wgrania, a podglądy `/dev/*` na `astro dev` dalej mają obrazki. Gdy się nie da prosto: przenieść próbki do `src/` i importować w stronach `/dev`.
- [ ] **F7** `tests/e2e/support/live.ts`: usunąć `heardGif` (`:122-125`, `:211`) i `isGif`, jeśli nic innego go nie używa.
- [ ] **F8** `src/lib/rooms/gifs.ts:137-139`: „KLIPY learns nothing of the room or the player” zamiast „…of the game's site or room” (zapytanie CORS zawsze niesie `Origin`).

Po scaleniu: smoke na produkcji (za zgodą), Decision w raporcie → FIXED z SHA.
