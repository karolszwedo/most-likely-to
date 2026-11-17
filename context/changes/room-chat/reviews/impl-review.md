<!-- IMPL-REVIEW-REPORT -->

# Implementation Review: Czat w pokoju: krótkie wiadomości z nickiem, bez zapisu

- **Plan**: context/changes/room-chat/plan.md
- **Scope**: Full plan (all automated criteria and manual 1.4, 3.4, 3.5 done; manual 4.5 and 4.6 pending, the owner's checks at the next game)
- **Reviewed phases**: 1, 2, 3, 4
- **Date**: 2026-11-17
- **Verdict**: NEEDS ATTENTION
- **Findings**: 0 critical, 1 warning, 8 observations

## Verdicts

| Dimension           | Verdict |
| ------------------- | ------- |
| Plan Adherence      | PASS    |
| Scope Discipline    | PASS    |
| Safety & Quality    | WARNING |
| Architecture        | PASS    |
| Pattern Consistency | PASS    |
| Success Criteria    | PASS    |

Verdict: one warning only, but not a minor one: below `lg` the open chat hides its field after a few messages (F1), so the chat on a phone breaks during a real evening. Hence NEEDS ATTENTION, not APPROVED.

Evidence: every planned item of Phases 1–4 compared with the code (`git diff 2f4cc34^1 HEAD`): no MISSING, no violation of "What We're NOT Doing" (no local echo, text as React text nodes without links, no storage, the bells on `live-sync:<roomId>` untouched, `JoinWaiting` untouched). Signature: `openSignedMessage` checks the signature on the exact `data` string before `JSON.parse`, then version, room, event, the ±60 s window on the adjusted clock and the id form, inside one `try`; bad base64 and wrong signature lengths are refused before any crypto; the private key is imported non-extractable, only `publicKey` and `serverNow` reach the page's props, and no client module imports `signing-key.ts` or `astro:env/server`. Chat text: never in `logEvent` (`actionAnswer` logs `op`, `outcome`, `roomId`), storage, the URL or the database. The chat route keeps the emote route's order (`refuseForeignPost`, id, body, cookie or session, client, signer 503, `roomLobby` 404). The verify queue: one per effect run, `isActive()` after each await, `.catch` keeps it resolved. Local gate on `57994a7`: `npm run lint` (0 literals in 66 view files), `npx astro check` (0 errors), `npm test` (2260), `npm run build` green; `npx prettier --check` on the changed `.md` files green; PR #77 and PR #78 `ci`, `smoke`, `db`, `e2e` green; smoke on production 142/142 (17.11). Outside the plan, all harmless: `ROOM_PAGE_CHAT` in `room-frame.ts` (needed by L3), `MOTION_CHAT_TOAST` in `reveal-motion.ts` (AGENTS.md "## UI"), a comment in `json-route.ts`, extra hardening in `signature.ts` (4096-character cap on `data`, content cannot override `v`/`at`/`id`, id form check), extra log lines from the allowed fields only (`step: "sign"`, `step: "remove_channel"`, the screen's `verify_key`/`verify`).

## Findings

### F1 — Na telefonie pole czatu chowa się pod paskiem emotek

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: src/components/room/RoomChat.tsx:66 (`IN_WINDOW.section`), :244
- **Detail**: Poniżej `lg` otwarty panel czatu ma `flex-col`, ale nie `flex` (jest tylko `lg:flex`), więc jest zwykłym blokiem: `flex-1 min-h-0` wewnątrz nic nie robi, lista nie przewija się, a treść wylewa się poza `max-h-1/2` panelu w dół, pod pasek emotek (`fixed … z-10`, później w DOM) albo poza okno. Zmierzone na `/dev/room-window?state=chat-lobby-guest` w Chrome: 390×844 z 6 wiadomościami pole widać, z 40 pole stoi na y=1529 (okno 844); 390×480 (okno z otwartą klawiaturą Androida przy `interactive-widget=resizes-content`) pole jest pod paskiem emotek już przy 6 wiadomościach. Testy tego nie złapały: `chat.spec.ts` sprawdza okno przy kilku wiadomościach, `/dev/room-window` ma ich 6, a 50 wiadomości w `/dev/room-states` stoi w ramce (`IN_FRAME`), która `flex` ma. Ta sama sekcja z dopisanym `flex` (sprawdzone w tej samej przeglądarce): pole widoczne we wszystkich czterech przypadkach (844 i 480, 6 i 40 wiadomości), lista przewija się w panelu.
- **Fix**: dopisać `flex` na początku `IN_WINDOW.section` (`hidden` zwiniętego panelu i tak wygrywa w `cn`), a w `chat.spec.ts` (projekt `phone`) krok: kilkanaście wiadomości przy oknie o wysokości telefonu z klawiaturą (np. 390×480), pole czatu `toBeInViewport` i nie zasłonięte paskiem emotek; próbny alarm: bez `flex` krok czerwony.
- **Decision**: FIXED (Karol 2026-11-17: „poprawiam wszystkie”). `flex` w `IN_WINDOW.section` (`RoomChat.tsx`); na `/dev/room-window` w Chrome pole widoczne przy 390×844 i 390×480, z 6 i 40 wiadomościami. Nowy krok na końcu `chat.spec.ts` (oba projekty): dwie długie wiadomości, okno A zmniejszone do 480 px wysokości, pole `toBeInViewport({ ratio: 1 })`, stuknięcie w środek trafia w pole, A wysyła z tego okna jeszcze jedną wiadomość. Próbny alarm w CI (bez `flex`).

### F2 — Zalew ponad 200 wiadomości w minutę pozwala powtórzyć cudzą prawdziwą wiadomość

- **Severity**: 💬 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: src/components/room/useRoomState.ts:79 (`SEEN_IDS_MAX = 200`), :152-160 (`firstSeen`)
- **Detail**: Pamięć widzianych `id` wyrzuca najstarsze po liczbie, nie po czasie. Serwer nie ma limitu wiadomości (przyjęte w planie), więc gracz pokoju, który wyśle ponad 200 emotek albo wiadomości w ciągu 60 s, wypycha `id` prawdziwej wiadomości kolegi i może ją nadać jeszcze raz (podpis się zgadza, okno 60 s też). Ekran pokaże starą wiadomość drugi raz z nickiem kolegi; `appendChatMessage` też jej nie odrzuci, bo zalew wypchnął ją z ostatnich 50. Treści podrobić się nie da, a sam zalew był już przyjętym ryzykiem.
- **Fix**: zapominać `id` po czasie, nie po liczbie (`Map` `id → at`, wpis wypada, gdy jest starszy niż okno podpisu z zapasem, np. 2 × `SIGNED_WINDOW_MS`).
- **Decision**: FIXED (wszystkie). `firstSeen` w nowym `src/lib/live-sync/seen-messages.ts`: `Map` `id → at`, wpis wypada po `SEEN_KEEP_MS` = 2 × `SIGNED_WINDOW_MS` czasu serwera, bez limitu sztuk; `useRoomState` podaje `fields.at` i `now`. Test `tests/unit/live-sync-seen-messages.test.ts` (zalew 1000 wiadomości nie wypycha prawdziwej). Lokalny próbny alarm (pamięć po 200 sztuk, jak przed poprawką): czerwone tylko 3 testy `firstSeen` o czasie.

### F3 — Wiadomość z samych znaków niewidocznych przechodzi, a nick i tekst nie mają izolacji kierunku pisma

- **Severity**: 💬 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: src/lib/rooms/chat.ts:30 (`REFUSED_CHARACTERS`); src/components/room/RoomChat.tsx:93-94
- **Detail**: `\s` nie obejmuje znaków formatu (`\p{Cf}`, np. U+200B, U+2060), a `REFUSED_CHARACTERS` odrzuca tylko `\p{Cc}` i znaki kierunku, więc tekst z samego U+200B ma długość 1 i trafia na czat jako pusty wpis z nickiem. Osobno: nick i tekst stoją obok siebie bez `<bdi>`, więc nick pisany od prawej do lewej obok tekstu od prawej do lewej może się wizualnie przestawić.
- **Fix**: odrzucać tekst, który po usunięciu `\p{Cf}` jest pusty (test w `chat.test.ts`), i owinąć nick i tekst w `MessageLine` w `<bdi>`.
- **Decision**: FIXED (wszystkie). `isBlankChatText` w `chat.ts` (wspólna dla ekranu i Workera): tekst pusty po usunięciu `\p{Cf}` odpada, `RoomChat` pokazuje wtedy „Wpisz wiadomość”; nick i tekst w `MessageLine` w `<bdi>`. Testy w `chat.test.ts` (sam U+200B, same niewidoczne, sam U+200E odpadają; emoji rodziny z U+200D i U+200B w środku słowa przechodzą). Lokalny próbny alarm (bez usuwania `\p{Cf}`): czerwone dokładnie te 3 nowe odmowy.

### F4 — Wiadomość usuniętego gracza w drodze może zostać do następnego odświeżenia stanu

- **Severity**: 💬 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: src/components/room/RoomScreen.tsx:199-212
- **Detail**: `keepPlayersChat` czyści listę już przy renderze z nową listą graczy, ale `nicksRef` (sprawdzany w `onChat`) zmienia się dopiero w `useEffect` po zatwierdzeniu renderu. Wiadomość usuniętego gracza, którą kolejka sprawdzania skończy dokładnie w tej przerwie, przejdzie przez stary zestaw nicków i zostanie na liście do następnej zmiany `view.players`. Okno trwa milisekundy, a usunięty po usunięciu i tak dostaje 404 na nowe wiadomości.
- **Fix**: aktualizować `nicksRef` w `useLayoutEffect` (przed oddaniem sterowania przeglądarce) zamiast w `useEffect`.
- **Decision**: FIXED (wszystkie). `nicksRef` w `useLayoutEffect` (`RoomScreen.tsx`); React 19 nie ostrzega o nim przy renderze na serwerze. Bez nowego testu: okno wyścigu trwa milisekundy i nie da się go pewnie wywołać w e2e.

### F5 — `scripts/signing-key.mjs` wypisze klucz prywatny wprost do terminala

- **Severity**: 💬 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: scripts/signing-key.mjs:54
- **Detail**: Skrypt pisze sekret na wyjście bez sprawdzenia, czy to potok albo plik. Uruchomiony „na próbę” bez `|` ani `>>` (przez agenta albo człowieka) wypisze świeży klucz prywatny do terminala i zapisu sesji, wbrew zasadzie z AGENTS.md („nobody prints it”). Sam wypisany klucz nigdzie nie działa, dopóki ktoś go nie wgra, ale wtedy już jest w zapisie sesji.
- **Fix**: przed wygenerowaniem klucza `if (process.stdout.isTTY) fail("pipe it into wrangler or >> .dev.vars", 2)`.
- **Decision**: FIXED (wszystkie). `scripts/signing-key.mjs`: gdy stdout to terminal, skrypt nie robi klucza, pisze powód na stderr i kończy kodem 2; nagłówek to opisuje. Uruchomiony lokalnie: przez potok 235 znaków bez nowej linii, `--env-line` jedna linia, z udawanym terminalem kod 2 (wyjście zawsze do `/dev/null` albo licznika, klucz nigdzie się nie wypisał).

### F6 — Powód błędu Realtime w logu, a ładunek niesie teraz tekst gracza

- **Severity**: 💬 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: src/lib/live-sync/server.ts:47-52
- **Detail**: `send()` loguje `error.message` z `httpSend` jako `code` (świadoma decyzja audytu L6, żeby 429 i 401 nie wyglądały tak samo); `withoutSecret` wycina tylko klucz kanału. Sprzed tej zmiany, ale ładunek tematu graczy niesie teraz treść czatu: gdyby serwer Realtime kiedyś powtórzył ładunek w powodzie błędu, tekst trafiłby do logów Workera, wbrew zasadzie z AGENTS.md. Dziś nic tego nie pokazuje.
- **Fix**: zostawiać w `code` tylko krótki powód o bezpiecznym kształcie (np. `/^[\w .:-]{1,60}$/`), a inny zastępować stałym `other`, z testem w `live-sync-server.test.ts`.
- **Decision**: FIXED differently (wszystkie). Zamiast filtra kształtu powodu (krótki tekst gracza by przez niego przeszedł) `send()` dostaje `content` i wycina z powodu serwera każdą kopię tego, co wysłał gracz (`data` i `sig` koperty, nick, tekst czatu), także w postaci z wnętrza JSON-a raz i dwa razy, najdłuższe najpierw, jak klucz kanału; komentarze `sendEmote`/`sendChat` obiecywały to już wcześniej, a kod wycinał tylko klucz. Testy w `live-sync-server.test.ts` (powód z samym tekstem z cudzysłowem i ukośnikiem, z całym ładunkiem jako JSON i jako JSON w JSON-ie). Lokalny próbny alarm (bez wycinania): czerwone dokładnie te 3 testy.

### F7 — Testy nie sprawdzają powtórki dokładnej koperty, kolejki ani przesunięcia zegara

- **Severity**: 💬 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Success Criteria
- **Location**: tests/e2e/players-channel.spec.ts; src/components/room/useRoomState.ts:152-165
- **Detail**: Podróbki w `players-channel.spec.ts` zmieniają podpis, nick albo kształt, ale żaden test nie nadaje jeszcze raz niezmienionej prawdziwej koperty (pamięć `id`). `firstSeen`, kolejność kolejki i przesunięcie zegara z nagłówka `Date` nie mają testu jednostkowego.
- **Fix**: w `players-channel.spec.ts` krok: `lastEnvelope()` nadana jeszcze raz bez zmian nie pokazuje emotki drugi raz (z kontrolą pozytywną §6.4); `firstSeen` i `serverTime` do czystego modułu z testem jednostkowym (razem z F2).
- **Decision**: FIXED (wszystkie). `players-channel.spec.ts`, krok 2: prawdziwa koperta serca Oli nadana jeszcze raz bez zmian, w połowie okna podpisu, nie pokazuje się drugi raz (nowy podsłuch `watchLiveChanges` zapisuje każdą zmianę regionu po kolei, bo zbiór `watchLiveRegions` miał już „Ola: Serce”), sprawdzane po prawdziwym „Kciuk w górę” (§6.4). `firstSeen` i odczyt przesunięcia zegara z nagłówka `Date` (`clockOffsetFrom`) w czystym module z testem jednostkowym; kolejność kolejki bez osobnego testu (pokrywają ją e2e). Próbny alarm w CI (ekran bez `firstSeen`).

### F8 — Dwie drobne różnice od planu bez wpisu w planie

- **Severity**: 💬 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Adherence
- **Location**: src/lib/live-sync/signing-key.ts:20-29; src/components/room/RoomChat.tsx:88-95
- **Detail**: (a) Plan: zły sekret daje jedno `logEvent("error", { op: "signing_key", errName })`. Kod: `{ op: "signing_key", step: "import" }` bez `errName` (`importSigningKey` zwraca `null`), plus jedna linia `step: "missing"` na izolat, gdy sekretu brak; `deploy-plan.md` opisuje obie. Treści sekretu nie ma w żadnej. (b) Plan: „nick w kolorze gracza”. Kod: kropka w kolorze gracza i pogrubiony nick, zaakceptowane przez Karola na zrzutach (3.5).
- **Fix**: jedno zdanie w `change.md` (Notes) o obu różnicach, bez zmiany kodu.
- **Decision**: FIXED (wszystkie). Akapit w `change.md` (Notes) o obu różnicach.

### F9 — Podwojony fragment zdania w Progress 4.5

- **Severity**: 💬 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Adherence
- **Location**: context/changes/room-chat/plan.md:566
- **Detail**: Punkt 4.5 kończy się dwa razy fragmentem „czatu ani (przy zmienionym viewporcie) pól hosta „Popraw” i „Dodaj własne pytanie””, od pierwszego commitu planu (`0a9b645`). Kryterium w bloku Fazy 4 (`:471`) jest poprawne.
- **Fix**: usunąć powtórzony fragment w `plan.md:566`.
- **Decision**: FIXED (wszystkie). Powtórzony fragment usunięty z Progress 4.5.
