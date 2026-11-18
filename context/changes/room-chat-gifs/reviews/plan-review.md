<!-- PLAN-REVIEW-REPORT -->

# Plan Review: Gify w czacie pokoju: wyszukiwarka KLIPY, gif z nickiem, bez zapisu

- **Plan**: `context/changes/room-chat-gifs/plan.md`
- **Mode**: Deep (jeden podagent sprawdził 7 najbardziej ryzykownych twierdzeń w kodzie)
- **Date**: 2026-11-17
- **Verdict**: REVISE
- **Findings**: 0 critical, 2 warnings, 2 observations
- **Triage**: 17.11.2026, Karol „tak” dla wszystkich rekomendacji; poprawki wpisane do `plan.md` (F1 nowy punkt 3.4 i konto KLIPY przed Fazą 3, F2 alarm 2.3, F3 `klipy.ts`, F4 nowy punkt 4.5) i `plan-brief.md`. Werdykt po poprawkach: SOUND

## Verdicts

| Dimension             | Verdict |
| --------------------- | ------- |
| End-State Alignment   | PASS    |
| Lean Execution        | PASS    |
| Architectural Fitness | PASS    |
| Blind Spots           | WARNING |
| Plan Completeness     | WARNING |

## Grounding

25/25 istniejących ścieżek ✓ (4 nowe pliki jeszcze nie istnieją, zgodnie z planem: `src/lib/rooms/gifs.ts`, `gif-key.ts`, `src/components/room/useGifSearch.ts`, `tests/e2e/support/klipy.ts`), 11/11 symboli ✓ (`bodyChatText`, `parseChatMessage`, `appendChatMessage`, `keepPlayersChat`, `sendChat`, `broadcastChat`, `withSecurityHeaders`, `getPublicSupabaseConfig`, `RoomLiveConfig`, `CHAT_COOLDOWN_MS`, `HEADER_CHECKS`), odwołania do linii ✓, brief↔plan ✓, Progress↔Fazy ✓ (1.1–1.4, 2.1–2.3, 3.1–3.5, 4.1–4.7, bez checkboxów poza Progress).

Potwierdzone w kodzie:

- Przeglądarka nie woła Supabase po `https`: ekrany tylko subskrybują (`useRoomState.ts:536-547`, `JoinWaiting.tsx:169-176`), bez `channel.send`, `track` i `httpSend`; emotki i czat idą przez trasy Workera. Zapasowa droga REST w `@supabase/realtime-js` 2.119.0 (`RealtimeChannel.ts:1103-1110`) uruchamia się tylko przy `send()` z przeglądarki, której nie ma. `connect-src` z samym `wss://` (w CI `ws://127.0.0.1:54321`) wystarcza. Gdyby kiedyś ekran zaczął sam nadawać, CSP zablokuje zapasowy `https`.
- Obrazki, czcionki i połączenia tylko z własnej domeny; bez `data:`, `blob:`, `url(` w źródłach i zbudowanym CSS, bez analityki i awatarów. Niesprawdzalne z kodu: ewentualny beacon Cloudflare Web Analytics włączony w panelu (na `workers.dev` się go nie spodziewamy).
- `logEvent` przepuści `{ op: "gif_search", status, errName }` i `{ op: "gif_key", step }` bez zmian w `log.ts` (`log.ts:13-27`); w przeglądarce woła tylko `console`. Wzór „raz na izolat”: `signing-key.ts:13,20-25`.
- Promień rażenia zgodny z listą planu. `RoomLiveConfig` jest zdefiniowany w `useRoomState.ts:43`, ale plan podaje `gifSearchKey` osobno od niego, więc `useRoomState.ts` nie wymaga zmiany poza ewentualnym komentarzem.
- Smoke ma `supabaseUrl` w propsach strony pokoju (`src/pages/r/[id].astro:77-81`) i wzór czytania propsów (`scripts/smoke.mjs:1182-1191`, `decodeEntities` `:311-313`); `HEADER_CHECKS` `:397-402`, krok nagłówków `:404-418`.
- Playwright: strona na `http://localhost:4321`, projekty `chromium` i `phone` (Desktop Chrome 390×844); CI dopisuje `LIVE_SIGNING_KEY` do `.dev.vars` w `ci.yml:61` i `:144`. Brak stron prerenderowanych (`output: "server"`), więc odczyt `SUPABASE_URL` w middleware w czasie żądania jest bezpieczny.

## Findings

### F1 — Kontrakt KLIPY sprawdzony tylko na dokumentacji, pierwszy kontakt z prawdziwym API dopiero na produkcji

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Blind Spots
- **Location**: Faza 2 #3 (wzór klucza), Faza 3 #2 (`gifSearchUrl`, `parseGifResults`), Faza 3 #5 (`klipy.ts`), Faza 4 #3
- **Detail**: Kilka założeń planu pochodzi wyłącznie z dokumentacji KLIPY i nie zderzy się z prawdziwym API przed scaleniem: kształt odpowiedzi (`data.data[]`, `type === "gif"`, `file.xs.webp.url`, `file.sm.webp.url`), wartości `locale=pl` i `format_filter=webp`, wzór klucza `^[A-Za-z0-9_-]{8,128}$` oraz to, że adresy mediów są kanoniczne (`new URL(adres).href === adres`). Odpowiedź udawana w e2e powstaje z tych samych założeń, więc CI będzie zielone także wtedy, gdy któreś jest błędne. Skutek na produkcji: każde wyszukiwanie kończy się „brak wyników” albo błędem, Worker odrzuca każdy gif (400), albo `getGifSearchKey` daje `null` i przycisk „GIF” znika (smoke prod czerwony po scaleniu). Konto KLIPY powstaje dopiero przed Fazą 4, a ręczne sprawdzenie 4.5 zwykle czeka na wieczór z ekipą.
- **Fix A ⭐ Recommended**: Konto KLIPY i klucz testowy w `.dev.vars` przed Fazą 3 (Karol, jak w planie, tylko wcześniej); w Fazie 3 nowy krok automatyczny: jedno prawdziwe wyszukiwanie przez `gifSearchUrl` + `parseGifResults` skryptem w scratchpadzie, który sam czyta klucz z `.dev.vars` i nigdy go nie wypisuje (1–2 z 100 zapytań/h). Sprawdza: odpowiedź 200, wynik `parseGifResults` niepusty, każdy `gif` i `preview` przechodzi `isKlipyMediaUrl`, klucz pasuje do wzoru. Przycięta prawdziwa odpowiedź (same adresy i opisy) staje się danymi `klipy.ts`.
  - Strength: Błąd kontraktu wychodzi w Fazie 3, przy otwartym PR, a nie po scaleniu; dane e2e odpowiadają rzeczywistości.
  - Tradeoff: Karol zakłada konto wcześniej (przed Fazą 3 zamiast przed Fazą 4); sesja dotyka `.dev.vars` skryptem (bez wypisywania klucza).
  - Confidence: HIGH — jedno zapytanie rozstrzyga wszystkie cztery założenia naraz.
  - Blind spot: Klucz testowy może różnić się formatem od produkcyjnego; wzór warto sprawdzić drugi raz przy podmianie.
- **Fix B**: Zostawić kolejność, ale 4.5 w skróconej wersji (jedno wyszukiwanie i jeden gif na telefonie i laptopie) robić zaraz po wdrożeniu, nie na wieczorze.
  - Strength: Bez zmian w kolejności kont i sekretów.
  - Tradeoff: Błąd wychodzi dopiero na produkcji, poprawka to nowy PR albo `wrangler rollback`.
  - Confidence: MEDIUM — wykrywa problem, ale po fakcie.
  - Blind spot: None significant.
- **Decision**: FIXED (Fix A) — Karol 17.11.2026 („tak” dla całości)

### F2 — Odmowa obcego hosta w Workerze bez testu jednostkowego; opis próbnego alarmu Fazy 2 nie pasuje do kodu

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Completeness
- **Location**: Faza 2 #4 (testy `bodyChatContent`) i Implementation Note Fazy 2
- **Detail**: Odmowa gifa spoza hostów KLIPY to rdzeń decyzji 3, a testy `bodyChatContent` w planie nie mają przypadku obcego hosta (jest tylko w `isKlipyMediaUrl` i `parseChatMessage`). Pilnuje go wyłącznie krok smoke. Do tego alarm mówi „trasa sprawdza tylko `https:` zamiast `isKlipyMediaUrl`”, a według kontraktu trasa woła `bodyChatContent`, nie `isKlipyMediaUrl`. Gdy implementator naturalnie dopisze przypadek obcego hosta do testu `bodyChatContent`, przewidywanie „czerwony tylko krok smoke” się nie sprawdzi.
- **Fix**: Do testów `bodyChatContent` dopisać „gif z obcym hostem → `undefined`”; alarm: w `bodyChatContent` tymczasowo samo sprawdzenie `https:` zamiast `isKlipyMediaUrl`; przewidywanie: czerwony ten przypadek w `ci` i krok smoke „a gif from another host is refused”, `db` i `e2e` zielone.
- **Decision**: FIXED (Fix) — Karol 17.11.2026 („tak” dla całości)

### F3 — Udawane KLIPY w e2e: nagłówek CORS i sprawdzanie `Referer`

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Completeness
- **Location**: Faza 3 #5 (`tests/e2e/support/klipy.ts`)
- **Detail**: Strona w e2e stoi na `http://localhost:4321`, a `fetch` idzie do `https://api.klipy.com`, czyli między originami. Odpowiedź z `route.fulfill` przechodzi sprawdzenie CORS, więc bez `Access-Control-Allow-Origin` przeglądarka odrzuci ją jak awarię KLIPY. E2E chodzi tylko w CI, więc każde takie potknięcie to dodatkowa runda. Asercja „brak nagłówka `Referer`” powinna czytać pełne nagłówki (`request.allHeaders()`), bo `request.headers()` nie zwraca wszystkich i brak mógłby wyjść „na pusto”.
- **Fix**: W kontrakcie `klipy.ts`: odpowiedź API z `access-control-allow-origin: *` (zapytanie z `credentials: "omit"` jest proste, bez preflightu); sprawdzanie `Referer` przez `allHeaders()`.
- **Decision**: FIXED (Fix) — Karol 17.11.2026 („tak” dla całości)

### F4 — CSP i gify w prawdziwej przeglądarce na produkcji sprawdza dopiero 4.5

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Blind Spots
- **Location**: Faza 4 #3 i Manual 4.5
- **Detail**: Po scaleniu CSP na produkcji sprawdzają `curl -sI` (sam ciąg) i smoke (skrypt Node, który CSP nie egzekwuje). E2E testuje CSP w Chrome, ale na `http://localhost` z `ws://127.0.0.1:54321`, a produkcja to `https` z `wss://`. Ryzyko jest małe (dokładne dopasowanie hosta, a przeglądarka nie woła Supabase po `https`), ale gdyby CSP zablokowało Realtime na produkcji, każda gra straciłaby dzwonek, emotki i czat (zostaje odpytywanie co 8 s), a 4.5 zwykle czeka na wieczór.
- **Fix**: W Fazie 4 po smoke na produkcji: krótkie sprawdzenie w przeglądarce od razu, nie na wieczorze (Karol, około 5 min: jeden pokój testowy, emotka dochodzi, jedno wyszukiwanie i gif, konsola Chrome bez „Content Security Policy”); reszta 4.5 przy grze.
- **Decision**: FIXED (Fix) — Karol 17.11.2026 („tak” dla całości)
