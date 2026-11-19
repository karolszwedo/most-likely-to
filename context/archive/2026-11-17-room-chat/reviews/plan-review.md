<!-- PLAN-REVIEW-REPORT -->

# Plan Review: Czat w pokoju: krótkie wiadomości z nickiem, bez zapisu

- **Plan**: `context/changes/room-chat/plan.md`
- **Mode**: Deep (jeden podagent sprawdził 7 najbardziej ryzykownych twierdzeń w kodzie)
- **Date**: 2026-11-17
- **Verdict**: REVISE
- **Findings**: 0 critical, 5 warnings, 1 observation
- **Triage**: 17.11.2026, Karol „tak” dla wszystkich rekomendacji; poprawki wpisane do `plan.md` (F1–F6, nowy punkt 2.3) i `plan-brief.md`. Werdykt po poprawkach: SOUND

## Verdicts

| Dimension             | Verdict |
| --------------------- | ------- |
| End-State Alignment   | PASS    |
| Lean Execution        | PASS    |
| Architectural Fitness | WARNING |
| Blind Spots           | WARNING |
| Plan Completeness     | WARNING |

## Grounding

26/26 ścieżek ✓ (nowe pliki: `src/lib/live-sync/signature.ts`, `signing-key.ts`, `src/lib/rooms/chat.ts`, `src/pages/api/rooms/[id]/chat.ts`, `RoomChat.tsx`, `scripts/signing-key.mjs`, nowe testy), 9/9 symboli ✓ (`LiveConfig`, `EMOTE_EVENT`, `onEmoteRef`, `sendEmote`, `broadcastEmote`, `parseEmoteMessage`, `refuseForeignPost`, `actionAnswer`, `getPublicSupabaseConfig`), brief↔plan ✓, Progress↔Fazy ✓ (1.1–1.4, 2.1–2.2, 3.1–3.5, 4.1–4.6, bez checkboxów poza Progress).

Potwierdzone w kodzie (astro 7.4.12, @astrojs/cloudflare 14.4.8, @cloudflare/vite-plugin 1.69.1):

- Sekret `optional: true` czytany w funkcji w czasie żądania działa: `astro:env/server` czyta go na nowo po `setGetEnv` (`node_modules/astro/dist/env/vite-plugin-env.js:131-132`), a wejście Workera woła `setGetEnv` na górze (`@astrojs/cloudflare/dist/utils/handler.js:9`). Odczyt leniwy przy pierwszym wywołaniu z pamięcią w module (jak w planie) to dobry kształt; odczyt na górze modułu byłby kruchy.
- Build kopiuje `.dev.vars` do `dist/server/.dev.vars` (`@cloudflare/vite-plugin/dist/index.mjs:94909-94915`), więc dopisanie klucza zaraz po `cp .env .dev.vars` w jobach `smoke` (`ci.yml:59-70`) i `e2e` (build w `webServer`, `playwright.config.ts:57`) stoi przed buildem ✓. Serwer dev wczytuje `.dev.vars` tą samą drogą co `SUPABASE_URL` (`@astrojs/cloudflare/dist/index.js:339,386`) ✓.
- Wpuszczony spóźniony przechodzi pełną nawigacją na `/r/<id>` (`JoinWaiting.tsx:127`), więc dostaje klucz publiczny z propsów strony pokoju ✓.
- Nagłówek `Date` w podglądzie jest (Node go dokłada, `vite-plugin/dist/index.mjs:55111-55117`); na produkcji z kodu nie da się tego stwierdzić (F3).
- Smoke ma wzór czytania propsów wyspy z HTML strony pokoju (`LINK_IN_PAGE`, `scripts/smoke.mjs:221,811-815`; `decodeEntities` `:307-308`); 65 bajtów `raw` to 87 znaków base64url.
- `scripts/live-sync-probe.mjs`, `/api/live-sync/config`, `EmoteBar.tsx:66`, `room-actions.ts:50` i kroki smoke emotek (`smoke.mjs:522-530`, sam status i treść odpowiedzi) kształtu koperty nie dotykają ✓.

## Findings

### F1 — Wymagane pola w `LiveConfig` wywracają `astro check` na stronie linku

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Architectural Fitness
- **Location**: Faza 1 #4 (Klucz publiczny i czas serwera w propsach)
- **Detail**: Plan dopisuje do `LiveConfig` (`useRoomState.ts:28-31`) pola `signingKey` i `serverNow` i mówi, że `JoinWaiting` i `/api/live-sync/config` zostają bez zmian. `LiveConfig` importują jednak też `LinkScreen.astro:8,20` i `JoinWaiting.tsx:5,36`, a `src/pages/j/[token].astro:105,112` podaje do `LinkScreen` wynik `getPublicSupabaseConfig()` z dwoma polami (`src/lib/supabase.ts:34`). Wymagane nowe pola dają błąd `astro check` w `/j/`. Podobnie podglądy `src/pages/dev/room-states.astro:20,208-216` i `room-window.astro:272-279` typują `EmoteMessage[]`, więc `EmoteMessage` nie może zmienić kształtu.
- **Fix**: Osobny typ tylko dla ekranu pokoju (np. `RoomLiveConfig = LiveConfig & { signingKey: string | null; serverNow: number }`) w `useRoomState` i `RoomScreen`; `LiveConfig`, `/j/`, `LinkScreen` i `JoinWaiting` bez zmian; `EmoteMessage` zostaje `{ emote, nick }`, a pola koperty mają własny typ w `signature.ts`.
- **Decision**: FIXED (Fix) — Karol 17.11.2026 („tak” dla całości)

### F2 — Podróbki w odwróconym kroku 1 odpadają z innego powodu niż podpis; przewidywanie alarmu się nie sprawdzi

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Completeness
- **Location**: Faza 1 #7 (`players-channel.spec.ts`) i Implementation Note Fazy 1
- **Detail**: (a) „Podpisana koperta Oli z podmienionym nickiem” to koperta zapamiętana przez słuchacza (`live.ts`), czyli prawdziwa emotka Oli, którą ekran hosta już pokazał. Jej `id` jest więc w pamięci widzianych, a ekran odrzuci ją jako powtórkę, z podpisem czy bez. (b) „Niepodpisana emotka” w starym kształcie `{ emote, nick }` odpada na kształcie (`data` nie jest ciągiem), zanim dojdzie do podpisu. Alarm z planu („`openSignedMessage` zwraca pola bez sprawdzenia podpisu”) nie pokaże więc żadnej z dwóch podróbek, a przewidywanie mówi „obie podróbki na ekranie hosta”. Test byłby zielony, nie dowodząc, że ekran sprawdza podpis, a alarm by chybił.
- **Fix**: Dwie podróbki o poprawnym kształcie, które odrzuca tylko podpis: (1) nowe `data` (świeże `id`, `at` z zegara testu, właściwe `room` i `event`, nick Oli) z losowym 64-bajtowym `sig`; (2) prawdziwa koperta z podmienionym nickiem i nowym `id`, ze starym `sig`. Stary płaski kształt zostaje jako osobna asercja. Przewidywanie alarmu: obie podróbki (1) i (2) na ekranie hosta, płaska nie; reszta zielona.
- **Decision**: FIXED (Fix) — Karol 17.11.2026 („tak” dla całości)

### F3 — Sprawdzanie podpisu na ekranie: kolejność, wyścigi i brzegi niedopowiedziane

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Blind Spots
- **Location**: Faza 1 #5 (Sprawdzenie na ekranie), Faza 3 #3 (Ekran pokoju)
- **Detail**: Dziś droga emotki jest synchroniczna: callback Realtime woła `onEmoteRef.current` od razu (`useRoomState.ts:441-443`), a `RoomScreen.tsx:158-169` dokłada dymek w kolejności przyjścia. `crypto.subtle.verify` jest asynchroniczne, a specyfikacja nie gwarantuje, że wywołania skończą się w kolejności: dwie wiadomości czatu wysłane kilka ms po sobie mogą się na liście zamienić miejscami. Plan nie mówi też: (a) co z wiadomością, która przyjdzie przed końcem importu klucza; (b) `active` jest sprawdzane tylko przed wywołaniem (`:442`), a po `await` efekt mógł już zostać sprzątnięty; (c) pamięć `id` „w zasięgu efektu” znika przy zmianie klucza kanału (usunięcie gracza), więc gracz z nowym kluczem może w oknie 60 s powtórzyć wiadomości, które wszyscy już widzieli; (d) `crypto.subtle` nie istnieje poza bezpiecznym kontekstem, a gra obsługuje gościa na `http://<IP w sieci domowej>` (`src/lib/rooms/tokens.ts:35-36`): wyjątek w callbacku Realtime; (e) nagłówek `Date` na produkcji niepotwierdzony, a brak albo zły nagłówek nie może zepsuć przesunięcia zegara.
- **Fix**: Jedna kolejka obietnic na efekt tematu graczy (łańcuch zaczyna się od importu klucza, każde zdarzenie dopina się na koniec, więc kolejność wyświetlania = kolejność przyjścia), `active` sprawdzane po `await`; pamięć `id` w `useRef` poza efektem (przeżywa zmianę klucza); bez `crypto.subtle` albo bez `signingKey` ekran nie subskrybuje tematu graczy, jak dziś bez konfiguracji Realtime; brak albo nieczytelny `Date` zostawia poprzednie przesunięcie; przy wdrożeniu jedno `curl -sI` na produkcji sprawdza, czy `Date` jest.
- **Decision**: FIXED (Fix) — Karol 17.11.2026 („tak” dla całości)

### F4 — Zmiana viewportu dotyka pól hosta na liście pytań

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Architectural Fitness
- **Location**: Faza 3 #4 (Klawiatura telefonu), Manual 4.5
- **Detail**: `interactive-widget=resizes-content` dotyczy całej strony `/r/`, nie tylko czatu. Na Androidzie przyklejony pasek emotek (`EmoteBar.tsx:27`, `fixed inset-x-0 bottom-0`, 72 px) stanie tuż nad klawiaturą, a dziś chowa się pod nią. Pole propozycji ma na to `scroll-mb-44 lg:scroll-mb-0` (`ProposalForm.tsx:189`), ale pola hosta „Popraw” (`QuestionList.tsx:230`) i „Dodaj własne pytanie” (`QuestionList.tsx:439`) nie mają żadnego marginesu: Chrome przewinie je tylko do krawędzi widoku, czyli pod pasek, razem z licznikiem i „Zapisz”. To okolica, którą naprawiała `scroll-and-focus-fixes` (3.4 Karola dalej czeka). E2E tego nie zobaczy (emulacja telefonu nie ma klawiatury), a 4.5 sprawdza tylko pole czatu.
- **Fix ⭐ Recommended**: Viewport zmieniany tylko wtedy, gdy Karol wybierze wariant z polem przyklejonym do dołu (T1 albo T2; T3 go nie potrzebuje). Wtedy w Fazie 3 oba pola `QuestionList` dostają `scroll-mb-44 lg:scroll-mb-0`, a 4.5 sprawdza też „Popraw” i „Dodaj własne pytanie” z klawiaturą prawdziwego telefonu.
  - Strength: decyzja w jednym miejscu, po wyborze wyglądu; pola hosta dostają tę samą ochronę co propozycje.
  - Tradeoff: dwa pola więcej w przeklikaniu Karola.
  - Confidence: MED — `scroll-mb-44` przy propozycjach działa w emulacji; prawdziwej klawiatury nikt jeszcze nie sprawdzał (notatka przy S-10).
  - Blind spot: zachowanie iPhone'a (parametr pomija, przewija sam).
- **Decision**: FIXED (Fix) — Karol 17.11.2026 („tak” dla całości)

### F5 — Faza 2 dodaje strażników bez próbnego alarmu

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Completeness
- **Location**: Faza 2 #4 (Testy) i Success Criteria Fazy 2
- **Detail**: Faza 2 dodaje strażników zakazów: krok smoke „Ula, rejected, cannot write on the chat” (404) i test jednostkowy „log `sendChat` bez tekstu i nicku” (pod nową Hard Rule z Fazy 4: treść czatu nigdy w logach). `test-plan.md` §6.5 (Break-check): „nowy krok, który pilnuje zakazu, sprawdź raz próbnym alarmem”; zasada Karola z 16.11: próbny alarm, gdy dochodzi nowy test. Fazy 1 i 3 alarm mają, Faza 2 nie.
- **Fix**: Nowy punkt 2.3 „Próbny alarm”: jeden tymczasowy commit z dwiema usterkami, bo każda zapala inny test: (a) trasa czatu bez sprawdzenia `result.lobby` (odrzucona Ula dostaje 500 zamiast 404) → czerwony tylko krok smoke „Ula, rejected…”; (b) `sendChat` dopisuje tekst do `code` linii logu → czerwony tylko test logu w `live-sync-server.test.ts`. Przewidywanie w opisie commita przed pushem, wynik w §6.5, potem `git revert`.
- **Decision**: FIXED (Fix) — Karol 17.11.2026 („tak” dla całości)

### F6 — Poprawność sekretu na produkcji wychodzi dopiero po scaleniu

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Blind Spots
- **Location**: Faza 1 #6 (Skrypt klucza), Faza 4 #4 (Wdrożenie), 4.2
- **Detail**: 4.2 sprawdza tylko nazwę w `npx wrangler secret list`. Stary kod sekretu nie czyta, więc zły sekret (np. końcowy znak nowej linii z potoku, ucięty ciąg) wyjdzie dopiero po scaleniu: `getChannelSigner()` da `null`, a emotki i czat odpowiedzą 503 na produkcji do poprawki.
- **Fix**: `scripts/signing-key.mjs` przed wypisaniem robi próbę (import, podpis, sprawdzenie) i pisze bez końcowego znaku nowej linii; `importSigningKey` obcina białe znaki z brzegów; w 4.4: gdy smoke na produkcji pokaże 503 na emotkach, najpierw ponowne `wrangler secret put` (za zgodą), dopiero potem `wrangler rollback`.
- **Decision**: FIXED (Fix) — Karol 17.11.2026 („tak” dla całości)
