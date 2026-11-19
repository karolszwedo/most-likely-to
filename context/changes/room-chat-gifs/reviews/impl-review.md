<!-- IMPL-REVIEW-REPORT -->

# Implementation Review: Gify w czacie pokoju: wyszukiwarka KLIPY, gif z nickiem, bez zapisu

- **Plan**: context/changes/room-chat-gifs/plan.md
- **Scope**: Full plan (all automated criteria done, 4.4 smoke on production 146/146; manual 1.4, 3.5, 3.6 done; manual 4.5–4.8 pending, the owner's checks)
- **Reviewed phases**: 1, 2, 3, 4
- **Date**: 2026-11-19
- **Verdict**: APPROVED
- **Findings**: 0 critical, 1 warning, 7 observations

## Verdicts

| Dimension           | Verdict |
| ------------------- | ------- |
| Plan Adherence      | PASS    |
| Scope Discipline    | PASS    |
| Safety & Quality    | WARNING |
| Architecture        | PASS    |
| Pattern Consistency | WARNING |
| Success Criteria    | PASS    |

Verdict: one warning (F1), and it is a gap the plan chose (plan.md:235), not drift; the rest are observations. Hence APPROVED.

Evidence: every planned item of Phases 1–4 compared with the code (`git diff 06f2e99 c0e203b`, PR #80): no MISSING, no violation of "What We're NOT Doing" (no proxy through the Worker, no trending gifs, no search per keystroke, no own filtering beyond skipping results that cannot be shown, no `blur_preview`/`data:`/video, the word, address and title nowhere in storage, cookies, URL, logs or the database, CSP only `img-src` and `connect-src`, no KLIPY secret in GitHub). All three trial alarms revert cleanly (`18404e7..ecb531b`, `de7cb90..c93916e`, `65e1e70..e00db86` empty). Security core clean: one shared address check (`isKlipyMediaUrl`) for the Worker, the screens and the results; signature verified before render; titles only as React-escaped `alt`/`aria-label`; no `set:html` or `dangerouslySetInnerHTML` in `src/`; the key only through `astro:env/server`, only to the lobby page (`no-store`); CSP covers everything the app loads and connects to and is set on `next()` answers and both middleware redirects; the chat route's checks unchanged. Gate on `main` 2026-11-19: `npm run lint` PASS, `npx astro check` 0/0/0, `npm test` 2433/2433, `npm run build` PASS; CI on `main` green after the merge; smoke on production 146/146.

Deliberate minor drift, not a finding: `gifSearchToRun` (`src/components/room/useGifSearch.ts:56-61`) asks again with the same word after a failure ("Spróbuj jeszcze raz"), and a closed and reopened picker starts from scratch; the plan says only "to samo słowo drugi raz nie pyta ponownie". Documented in the code comment; against the shared 100/h limit acceptable.

## Findings

### F1 — Awaria wyszukiwarki gifów jest cicha, a w jednym przypadku myli

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Safety & Quality
- **Location**: src/lib/rooms/gifs.ts:113, :171; src/lib/log.ts:54-64
- **Detail**: Gdy KLIPY odda wyniki, ale żaden nie przejdzie `isKlipyMediaUrl` (np. KLIPY zacznie podawać media z nowego hosta, czego komentarz `gifs.ts:6` się spodziewa), `parseGifResults` pomija wszystkie, a `searchGifs` zwraca `empty`: ekran mówi „Nie ma gifów dla tego słowa”, bez żadnej linii logu. Pozostałe awarie (429 na wspólnym limicie, cofnięty klucz 401/403, odpowiedź innego kształtu) idą tylko przez `logEvent`, czyli w przeglądarce do `console.*`, więc twórca gry ich nie widzi. Projekt ma już kanał awarii ekranu dla twórcy: `reportClientEvent` → `POST /api/client-events` (`useRoomState.ts:90-118`, lista `src/lib/client-events.ts:8`). Żaden automat tego nie złapie: e2e podstawia tylko `static.klipy.com`, smoke nie woła KLIPY. To wybór planu (plan.md:235), nie dryf.
- **Fix A ⭐ Recommended**: gdy KLIPY oddało wyniki, a wszystkie odpadły: `logEvent` z `op: "gif_search"`, `field: "file"` i wynik `failed/error` zamiast `empty`; test jednostkowy tego przypadku.
  - Strength: znika jedyny mylący komunikat; zmiana w jednej funkcji, w tym samym stylu co dotychczasowe `field: "data"`.
  - Tradeoff: twórca dalej nie widzi awarii KLIPY u siebie; dowie się od graczy.
  - Confidence: HIGH — jedna gałąź w `searchGifs`, testy jednostkowe już mają podstawiany fetch.
  - Blind spot: None significant.
- **Fix B**: Fix A plus zdarzenie `gif_search` (stany `limit` / `error` / `shape`) w `CLIENT_EVENTS`, wysyłane przez `reportClientEvent` (sam status, nigdy słowo, klucz ani adres).
  - Strength: limit 100/h i cofnięty klucz widać w logach Workera, zanim zgłosi to ekipa.
  - Tradeoff: zmiana kontraktu `/api/client-events` (lista zdarzeń i stanów, testy trasy); twórca i tak nie ogląda logów na bieżąco (śledzenie błędów w Parked).
  - Confidence: MED — wzór jest, ale trzeba przenieść `reportClientEvent` poza `useRoomState`.
  - Blind spot: nie sprawdzone, czy ograniczanie zdarzeń w `reportClientEvent` wystarczy przy wielu graczach naraz.
- **Decision**: FIXED in `919cea3` (Karol 2026-11-19: „Wszystkie F1–F8”; Fix A, bez zdarzeń na serwer) → follow-ups/review-fixes.md

### F2 — Opis gifa z KLIPY nie przechodzi reguł czatu po stronie wyszukiwarki

- **Severity**: 💬 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: src/lib/rooms/gifs.ts:114; src/components/room/GifPicker.tsx:119; src/components/room/RoomChat.tsx:368
- **Detail**: `parseGifResults` zostawia opis dowolnej długości i z dowolnymi znakami; wyszukiwarka czyta go w etykiecie „Wyślij gifa: <opis>” i wysyła. Worker i ekrany zamieniają opis ponad 100 znaków albo ze znakiem sterującym na `""`, więc nadawca słyszy pełny opis, a reszta tylko „gif”. Skrajnie: opis ponad ok. 3,4 KB przekracza `MAX_BODY_LENGTH = 4096` i gif dostaje odmowę, wbrew komentarzowi `gifs.ts:18-19`.
- **Fix**: w `parseGifResults` opis łamiący `GIF_TITLE_MAX_LENGTH` albo regułę znaków czatu staje się `""` (ta sama funkcja co w `chatContent`), plus przypadek w `gifs.test.ts`.
- **Decision**: FIXED in `919cea3` (Karol 2026-11-19: „Wszystkie F1–F8”) → follow-ups/review-fixes.md

### F3 — `AbortSignal.timeout` i brak przerywania starszych wyszukiwań

- **Severity**: 💬 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Pattern Consistency
- **Location**: src/lib/rooms/gifs.ts:149; src/components/room/useGifSearch.ts:77-94
- **Detail**: `AbortSignal.timeout` wymaga Safari 16, a reszta ekranu ok. 15.4 (`Object.hasOwn`, `.at()`): na iOS 15.4–15.8 każde wyszukiwanie kończy się „Nie udało się wczytać gifów”. Hak poprawnie odrzuca stare odpowiedzi (`latest`), ale nie przerywa zapytania zastąpionego nowszym ani trwającego po zamknięciu wyszukiwarki. Wzór w projekcie: `AbortController` + `setTimeout` z przerwaniem przy zatrzymaniu (`src/lib/live-sync/limiter.ts:79-87`).
- **Fix**: jeden `AbortController` na wyszukiwanie, przerywany limitem czasu, nowszym wyszukiwaniem i sprzątaniem przy odmontowaniu (sygnał podawany do `searchGifs`).
- **Decision**: FIXED in `919cea3` (Karol 2026-11-19: „Wszystkie F1–F8”) → follow-ups/review-fixes.md

### F4 — Przycisk „GIF” ma nazwę dostępną bez widocznego napisu

- **Severity**: 💬 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: src/components/room/RoomChat.tsx:473; tests/e2e/chat.spec.ts:108-111
- **Detail**: Widać „GIF”, a `aria-label` to „Wyszukaj gifa”. Sterowanie głosem („kliknij GIF”) może nie trafić w przycisk (WCAG 2.5.3, etykieta w nazwie).
- **Fix**: nazwa zaczynająca się od widocznego napisu, np. „GIF: wyszukaj gifa”, i ten sam lokator w `chat.spec.ts`.
- **Decision**: FIXED in `919cea3` (Karol 2026-11-19: „Wszystkie F1–F8”) → follow-ups/review-fixes.md

### F5 — Prawdziwy 429 z KLIPY może pokazać „awarię” zamiast „limitu”

- **Severity**: 💬 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: tests/e2e/support/klipy.ts:114, :148-152; src/lib/rooms/gifs.ts:151-157
- **Detail**: Ścieżkę 429 → „limit” sprawdza tylko udawane KLIPY, które dokłada `access-control-allow-origin: *`. Nikt nie sprawdził, czy prawdziwy 429 KLIPY ma ten nagłówek; bez niego `fetch` w przeglądarce kończy się `TypeError`, a ekran pokazuje ogólną awarię („Spróbuj jeszcze raz”), która zachęca do kolejnych prób.
- **Fix**: w tekście ogólnej awarii wspomnieć o godzinnym limicie (np. „Nie udało się wczytać gifów. Może skończył się limit na tę godzinę.”); nagłówki prawdziwego 429 sprawdzić przy okazji, gdy limit się wyczerpie.
- **Decision**: FIXED in `919cea3` (Karol 2026-11-19: „Wszystkie F1–F8”) → follow-ups/review-fixes.md

### F6 — Próbki obrazków z podglądów `/dev` trafiają na produkcję

- **Severity**: 💬 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Pattern Consistency
- **Location**: public/dev/gifs/probka-1..6.svg
- **Detail**: Pliki z `public/` idą do `dist` i są serwowane na produkcji pod `/dev/gifs/…`, choć strony `/dev/*` odpowiadają tam 404. Nieszkodliwe (kilkaset bajtów, bez skryptów), ale to materiał tylko dla dewelopera.
- **Fix**: wykluczyć `dev/` z plików Workera przez `.assetsignore` w `public/` (albo zostawić; decyzja bez wpływu na graczy).
- **Decision**: FIXED in `919cea3` (Karol 2026-11-19: „Wszystkie F1–F8”) → follow-ups/review-fixes.md

### F7 — Martwy pomocnik `heardGif` w e2e

- **Severity**: 💬 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Pattern Consistency
- **Location**: tests/e2e/support/live.ts:122-125, :211
- **Detail**: Plan dodał `heardGif` „pod Fazę 3”, ale Faza 3 sprawdza gify przez DOM; żaden spec go nie woła.
- **Fix**: usunąć `heardGif` i jego `isGif`, jeśli nic innego go nie używa.
- **Decision**: FIXED in `919cea3` (Karol 2026-11-19: „Wszystkie F1–F8”) → follow-ups/review-fixes.md

### F8 — Komentarz obiecuje więcej prywatności, niż daje przeglądarka

- **Severity**: 💬 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: src/lib/rooms/gifs.ts:137-139
- **Detail**: „KLIPY learns nothing of the game's site or room”: zapytanie CORS zawsze wysyła nagłówek `Origin` z adresem gry, a klucz i tak wskazuje grę. Żadnej zasady to nie łamie (AGENTS.md wymienia nick, pokój, link, klucz kanału, `customer_id` i Referer; e2e sprawdza ich brak), ale komentarz jest nieścisły.
- **Fix**: „KLIPY learns nothing of the room or the player”.
- **Decision**: FIXED in `919cea3` (Karol 2026-11-19: „Wszystkie F1–F8”) → follow-ups/review-fixes.md
