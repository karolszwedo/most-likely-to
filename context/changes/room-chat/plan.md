# Czat w pokoju: krótkie wiadomości z nickiem, bez zapisu Implementation Plan

## Overview

Każdy gracz w pokoju (host, współhost i gość bez roli) pisze krótkie wiadomości na czacie pokoju. Cały pokój widzi je na żywo z nickiem nadawcy w poczekalni, w grze (także w głosowaniu) i na końcu wieczoru (S-23, PRD FR-028). Wiadomość idzie drogą emotki: ekran → Worker (nick bierze ze stanu pokoju) → temat graczy `live-players:<klucz kanału>`. Nic nie zostaje w bazie, w logach ani w pamięci przeglądarki poza otwartą kartą. Zanim pójdzie pierwsza wiadomość, Worker zaczyna podpisywać każdą wiadomość tematu graczy, także emotkę (W-E), a ekrany pokazują tylko podpisane. Dzięki temu nikt nie napisze z cudzym nickiem, także gracz, który zna klucz kanału.

**Decyzje Karola (2026-11-17):**

1. Wiadomość do 200 znaków (liczonych jak w polu propozycji: polska litera i emoji to jeden znak), 2 s pauzy między wiadomościami jednego gracza (research, pytanie 1).
2. Gdy prowadzący usunie gracza, wpisy tego gracza znikają z czatu na ekranach pozostałych. Usunięcie to jedyne narzędzie prowadzącego na niechcianego gracza (PRD: bez moderacji).
3. Link w wiadomości to zwykły tekst, nie klikalny.
4. Wygląd czatu na telefonie i laptopie: Karol wybiera z galerii zrzutów w Fazie 3 (research, pytanie 2).
5. Wcześniej, przy zmianie PRD (`change.md`): nic nie zapisujemy; czat cały czas; gify osobno w S-24 `room-chat-gifs`.

## Current State Analysis

- Emotka: `POST /api/rooms/<id>/emote` → `refuseForeignPost` → id → `readJsonBody` (4096 bajtów) → `bodyEmote` → ciasteczko gracza albo sesja hosta → `createClient` (503) → `roomLobby` (`null` = 404) → `broadcastEmote` → `{ok:true}` (`src/pages/api/rooms/[id]/emote.ts:21-47`). Nick i klucz kanału bierze z `result.lobby.me` i `result.lobby.channel_key` (`src/lib/rooms/shared.ts:158,166`).
- `sendEmote` nadaje `{ emote, nick }` jako zdarzenie `emote` na `live-players:<klucz>` przez `httpSend` z limitem 5 s (`src/lib/live-sync/server.ts:25-54,74-89`). Przy błędzie loguje tylko `op`, `roomId`, `errName` i powód serwera z wyciętym kluczem. `broadcastEmote` oddaje nadanie do `waitUntil` (`src/lib/rooms/server.ts:854-873`).
- Ekran ma jednego klienta Realtime (`useRoomState.ts:149-157`). Efekt tematu graczy zależy od klucza kanału, ponawia subskrypcję 1–30 s po `CLOSED` i przekazuje zdarzenie do `onEmoteRef` (`useRoomState.ts:427-473`). `RoomScreen` sprawdza emotkę przez `parseEmoteMessage`: id z listy i nick z bieżącej listy graczy (`RoomScreen.tsx:149-185`, `src/lib/rooms/emotes.ts:58`).
- Nadawca widzi własną emotkę tylko z kanału, bez lokalnego echa (`server.ts:20-21`, `EmoteBar.tsx:48,66-76`).
- Podpisu nie ma: gracz z kluczem kanału nadaje na temat graczy z pominięciem Workera i z cudzym nickiem, a e2e sprawdza to jako kontrolę nadawcy (`tests/e2e/players-channel.spec.ts:125-132`).
- Zmienne serwera: tylko `SUPABASE_URL` i `SUPABASE_KEY` (`astro.config.mjs:17-22`), czytane wyłącznie przez `astro:env/server`. Brak typów `Env` Workera. Moduł czytający `astro:env` nie wchodzi do testów jednostkowych (`test-plan.md:141`), dlatego `src/lib/supabase-key.ts` leży osobno (`:3-4`).
- CI: `smoke` startuje Supabase bez Realtime i dopisuje `SMOKE_*` do `.dev.vars` (`.github/workflows/ci.yml:51-69`); `e2e` startuje z Realtime (`:132-151`). Podgląd bierze zmienne z `dist/server/.dev.vars`.
- Nicki w pokoju są unikalne (`nick_taken`, `src/lib/rooms/errors.ts:59`), więc nick wystarcza do rozpoznania nadawcy.
- Pasek emotek i dymki stoją w każdym widoku `RoomScreen` (poczekalnia, głosowanie, pominięcie, odsłona, koniec wieczoru), poza `contentRef` i bez nagłówka (`RoomScreen.tsx:558-575`). Spóźniony czekający (`JoinWaiting.tsx`) i strony usuniętego, obcego, przeniesionego i skasowanej gry (`src/pages/r/[id].astro:93-124`) paska nie mają.
- Czytnik ekranu słyszy emotki przez jeden `aria-live="polite"` z najnowszą emotką (`EmoteBubbles.tsx:45-51`). Bez dławienia: F3 z przeglądu S-16 Karol odłożył do sprawdzenia z czytnikiem (F7) (`context/archive/2026-10-26-room-emotes/reviews/impl-review.md:63-79`).
- Meta viewport to samo `width=device-width` (`src/layouts/Layout.astro:23`). W `src` nie ma `interactive-widget` ani `visualViewport`.

## Desired End State

- Każda wiadomość tematu graczy (emotka i czat) ma postać `{ data, sig }`. `data` to ciąg JSON z polami `v`, `room` (id pokoju), `event`, `at` (czas serwera w ms), `id` (losowe) i treścią zdarzenia (`emote` albo `text`) z `nick`. `sig` to podpis ECDSA P-256 / SHA-256 tego ciągu (IEEE P1363, base64url).
- Ekran pokazuje emotkę albo wiadomość tylko wtedy, gdy podpis się zgadza z kluczem publicznym z propsów, `room` i `event` pasują, `at` mieści się w oknie ±60 s od czasu serwera, `id` nie było, a nick jest na bieżącej liście graczy.
- `POST /api/rooms/<id>/chat` z `{ text }` przyjmuje od 1 do 200 znaków po normalizacji. Nick bierze ze stanu pokoju, nadaje podpisane zdarzenie `chat` i odpowiada `{ok:true}`. Treści nie loguje ani nie zapisuje.
- Na ekranie pokoju w każdym stanie (poczekalnia, głosowanie, pominięcie, odsłona, koniec wieczoru) gracz widzi ostatnie wiadomości (do 50, tylko w pamięci karty) i pole do pisania z pauzą 2 s, w układzie wybranym przez Karola. Po odświeżeniu czat jest pusty. Po usunięciu gracza jego wpisy znikają u pozostałych.
- Worker ma jeden nowy sekret `LIVE_SIGNING_KEY`. Bez niego trasy emotki i czatu odpowiadają 503, a ekrany nie słuchają tematu graczy.
- Weryfikacja: testy jednostkowe podpisu i czatu, odwrócony krok 1 w `players-channel.spec.ts` (podrobiona emotka nie dochodzi), nowy `chat.spec.ts` w obu projektach, nowe kroki smoke, smoke na produkcji i przeklikanie Karola.

### Key Discoveries:

- Web Crypto w Workerach i przeglądarkach podpisuje ECDSA w formacie P1363 (r‖s, 64 bajty), nie DER. Podpis i sprawdzenie robi więc `crypto.subtle` po obu stronach, nigdy `node:crypto` (`research.md` §3).
- Klucz publiczny da się złożyć z prywatnego JWK bez wywołań kryptograficznych: `0x04 ‖ x ‖ y` (65 bajtów `raw`).
- `astro:env/server` z brakującą zmienną wymaganą wywraca wszystkie trasy (`node_modules/astro/dist/env/vite-plugin-env.js:86-88,131`), więc nowy sekret musi mieć `optional: true`.
- `listen` w `tests/e2e/support/live.ts:118-159` obsługuje tylko zdarzenie `emote` i dopasowuje surowe `{emote, nick}` (`:113-115`). Po podpisie musi czytać `data` z koperty.
- `tests/unit/live-sync-server.test.ts:77` sprawdza `toEqual({emote, nick})`, więc zmieni się razem z kopertą.
- Kroki smoke emotki (`scripts/smoke.mjs:522-532`) już pokażą brak sekretu: bez klucza „Ola sends an emote” dostanie 503 zamiast 200.

## What We're NOT Doing

- Bez gifów (S-24 `room-chat-gifs`, osobna zmiana po tej).
- Bez zapisu treści: ani baza, ani logi gry, ani `sessionStorage`/`localStorage`. Bez historii po odświeżeniu, dla wpuszczonego spóźnionego i po grze. Bez migracji.
- Bez serwerowego limitu wiadomości: pauza 2 s jest po stronie ekranu, jak przy emotkach. Gracz z kluczem kanału może dalej zalać temat (podpis odrzuca tylko podrobioną treść; przyjęte w `players-only-live-channel`).
- Bez moderacji, filtrów słów i zgłoszeń. Narzędziem prowadzącego jest usunięcie gracza, które zabiera też jego wpisy (decyzja 2).
- Bez prywatnych wiadomości, edycji i kasowania własnych wpisów, reakcji na wiadomości, „pisze…”, potwierdzeń przeczytania, dźwięków, wibracji i powiadomień.
- Bez klikalnych linków i formatowania: wiadomość to zwykły tekst (decyzja 3).
- Bez lokalnego echa: nadawca widzi swoją wiadomość z kanału, jak emotkę. Gdy jego kanał nie działa, pole jest wyczyszczone po `{ok:true}`, ale wpisu nie widzi.
- Dzwonki (`bell`, `leader-bell`) zostają niepodpisane na publicznym `live-sync:<roomId>`: nie niosą treści.
- Bez czatu na ekranie spóźnionego czekającego i na stronach usuniętego, obcego, przeniesionego i skasowanej gry (PRD).
- Bez dławienia zapowiedzi czytnika ekranu. Czat robi to samo co emotki, a F3 z S-16 dalej czeka na sprawdzenie z czytnikiem (F7).
- Powtórka podpisanej wiadomości kolegi przez gracza z kluczem w oknie 60 s pokaże ją jeszcze raz tylko ekranom, które nie widziały oryginału (np. po odświeżeniu). Przyjęte.
- Bez automatycznej wymiany klucza podpisu. Procedura ręczna trafia do `deploy-plan.md`.

## Implementation Approach

Cztery fazy, jak przy S-13 i kanale graczy: najpierw bezpieczeństwo (podpis na istniejących emotkach, bez widocznej zmiany), potem treść na serwerze, potem wygląd z galerią, na końcu dokumenty i wdrożenie. Podpis to jeden wspólny moduł bez importów serwera, używany przez Workera, ekrany i testy jednostkowe. Cienka nakładka na `astro:env` czyta sekret i trzyma zaimportowany klucz w zasięgu modułu. Klucz publiczny i czas serwera dochodzą do ekranu w propsach strony pokoju, obok adresu i klucza Realtime. Ekran sprawdza kopertę jeden raz, w efekcie tematu graczy, zanim przekaże zdarzenie dalej. Czat dokłada zdarzenie `chat` na tym samym temacie i trasę wzorowaną na emotce. Wszystkie fazy idą jednym PR-em, a `wrangler secret put` musi wejść przed scaleniem.

## Critical Implementation Details

- **Dokładny ciąg.** Worker podpisuje dokładnie ten ciąg `data`, który wysyła. Ekran sprawdza podpis na tym ciągu i dopiero potem robi `JSON.parse`. Żadnej ponownej serializacji po drodze.
- **Zegar.** Ekran liczy przesunięcie względem serwera z `serverNow` w propsach i odświeża je nagłówkiem `Date` każdej odpowiedzi `/api/rooms/<id>/lobby` (`useRoomState.ts:238`). Bez tego telefon z przestawionym zegarem odrzucałby wszystko.
- **Kolejność wdrożenia.** Najpierw `wrangler secret put` (stary kod sekretu nie używa), potem scalenie. Karty otwarte przed wdrożeniem nie mają klucza publicznego i czytają stary kształt, więc do odświeżenia nie zobaczą emotek. Wdrażać poza wieczorem gry.
- **Usunięcie gracza.** Wpisy usuniętego gracza znikają przy odświeżeniu stanu, gdy jego nick wypada z `view.players`, a nie przy samym rysowaniu. Dzięki temu nowy gracz z tym samym nickiem nie przywróci starych wpisów.

## Faza 1: Podpis serwera na temacie graczy

### Overview

Worker podpisuje każdą emotkę, a ekrany pokazują tylko podpisane. Dochodzi sekret `LIVE_SIGNING_KEY` (opcjonalny w schemacie, bez niego 503), klucz jednorazowy w jobach CI `smoke` i `e2e` oraz skrypt generujący klucz. Krok 1 w `players-channel.spec.ts` odwraca się: podrobiona emotka nie dochodzi. Gracz na ekranie nie widzi żadnej zmiany.

### Changes Required:

#### 1. Wspólny moduł podpisu

**File**: `src/lib/live-sync/signature.ts` (nowy)

**Intent**: Jedno miejsce z kształtem koperty, podpisem i sprawdzeniem, bez importów serwera, więc działa w Workerze, w przeglądarce i w Vitest.

**Contract**:

- `SignedEnvelope = { data: string; sig: string }`, `SIGNED_VERSION = 1`, `SIGNED_WINDOW_MS = 60_000`.
- `importSigningKey(secret: string)`: sekret to prywatny JWK P-256 (z `x`, `y`, `d`) zakodowany jako JSON w base64url (jeden ciąg bez cudzysłowów, ten sam w `.dev.vars`, w CI i w `wrangler secret put`). Zwraca `{ privateKey: CryptoKey, publicKey: string }` (publiczny `raw` w base64url) albo `null`, gdy sekret jest zły.
- `signMessage(privateKey, fields)`: zwraca `SignedEnvelope`. Sam dopisuje `v`, `at` (ms) i `id` (16 losowych bajtów, base64url).
- `importVerifyKey(publicKey: string)` dla ekranu.
- `openSignedMessage(verifyKey, payload: unknown, expect: { room: string; event: string; now: number })`: zwraca pola albo `null`. `null` dostaje każdy błąd kształtu, podpisu, wersji, `room`, `event` i `at` spoza okna ±60 s. Nigdy nie rzuca. Duplikatów nie sprawdza: robi to ekran.

#### 2. Sekret Workera

**File**: `astro.config.mjs`, `src/lib/live-sync/signing-key.ts` (nowy)

**Intent**: Worker czyta sekret tylko przez `astro:env/server`, importuje klucz raz na izolat i podaje stronie tylko klucz publiczny.

**Contract**:

- Schemat: `LIVE_SIGNING_KEY: envField.string({ context: "server", access: "secret", optional: true })`.
- `getChannelSigner(): Promise<{ privateKey; publicKey } | null>`, z pamięcią w zasięgu modułu. Przy złym sekrecie jeden `logEvent("error", { op: "signing_key", errName })`, bez treści sekretu.

#### 3. Podpisane nadanie emotki

**File**: `src/lib/live-sync/server.ts`, `src/lib/rooms/server.ts`, `src/pages/api/rooms/[id]/emote.ts`, `src/lib/live-sync/shared.ts`

**Intent**: Emotka wychodzi tylko jako koperta podpisana przez Workera. Bez sekretu trasa odmawia, zamiast nadawać niepodpisane.

**Contract**:

- `sendEmote(supabase, roomId, channelKey, signer, message)` nadaje `signMessage(...)` z `room: roomId, event: "emote", nick, emote`. `send()` bez zmian, log bez koperty, treści i nicku.
- `broadcastEmote` przekazuje podpisującego.
- Trasa: po `createClient` → `getChannelSigner()`. Gdy `null`, odpowiada 503 `service_unavailable` (przez `actionAnswer`). Reszta kolejności bez zmian.
- Komentarz przy `EMOTE_EVENT` mówi o podpisie zamiast „bez podpisu”.

#### 4. Klucz publiczny i czas serwera w propsach

**File**: `src/pages/r/[id].astro`, `src/components/room/useRoomState.ts` (`LiveConfig`, `:28-31`), `src/components/room/RoomScreen.tsx`

**Intent**: Ekran dostaje to, czego potrzebuje do sprawdzenia, i nic więcej.

**Contract**: Osobny typ tylko dla ekranu pokoju, `RoomLiveConfig = LiveConfig & { signingKey: string | null; serverNow: number }` (`signingKey` to publiczny `raw`, base64url), w `useRoomState` i `RoomScreen`. Sam `LiveConfig` zostaje bez zmian, bo typują nim też `LinkScreen.astro:8,20` i `JoinWaiting.tsx:5,36`, a `/j/[token].astro:105,112` podaje mu `getPublicSupabaseConfig()` z dwoma polami (plan-review F1). Strona pokoju składa `RoomLiveConfig` z `getPublicSupabaseConfig()` i `getChannelSigner()`. Podglądy `/dev/*` dalej podają `realtime={null}`. `/api/live-sync/config`, `/j/`, `LinkScreen` i `JoinWaiting` bez zmian (słuchają tylko dzwonków; wpuszczony spóźniony przechodzi pełnym ładowaniem na `/r/<id>`, `JoinWaiting.tsx:127`). `EmoteMessage` zostaje `{ emote, nick }` (podglądy `/dev` typują nim swoje dane), a pola koperty mają własny typ w `signature.ts`.

#### 5. Sprawdzenie na ekranie

**File**: `src/components/room/useRoomState.ts`, `src/lib/rooms/emotes.ts`

**Intent**: Do `onEmote` dochodzi tylko emotka podpisana przez Workera dla tego pokoju, świeża i niepowtórzona.

**Contract**:

- Efekt tematu graczy (`:427-473`) subskrybuje tylko z `signingKey` i tylko wtedy, gdy jest `crypto.subtle` (poza bezpiecznym kontekstem, np. gość na `http://<IP w sieci domowej>`, `tokens.ts:35-36`, go nie ma). Bez któregoś z nich ekran tematu graczy nie słucha, jak dziś bez konfiguracji Realtime, i nic nie rzuca. Klucz do sprawdzania importuje raz na wartość `signingKey`.
- Kolejność (plan-review F3): `crypto.subtle.verify` jest asynchroniczne i nie kończy się w kolejności wywołań, więc efekt trzyma jedną kolejkę obietnic. Łańcuch zaczyna się od importu klucza, każde zdarzenie dopina się na koniec, więc zdarzenie sprzed końca importu czeka, a kolejność wyświetlania to kolejność przyjścia. Po każdym `await` efekt sprawdza `active`, zanim cokolwiek przekaże dalej.
- Każde zdarzenie przechodzi przez `openSignedMessage` z `room: roomId`, `event` z nazwy zdarzenia i `now: Date.now() + przesunięcie`.
- Przesunięcie liczy się z `serverNow`, a potem z nagłówka `Date` każdej odpowiedzi `/lobby` (`:238`). Brak albo nieczytelny nagłówek zostawia poprzednie przesunięcie. W podglądzie Node dokłada `Date`; na produkcji sprawdza go jedno `curl -sI` przy wdrożeniu (Faza 4).
- Pamięć widzianych `id` ma do 200 wpisów, w `useRef` poza efektem, więc przeżywa zmianę klucza kanału: gracz z nowym kluczem nie powtórzy w oknie 60 s wiadomości, które ekran już pokazał.
- `parseEmoteMessage(fields, nicks)` sprawdza dalej id emotki i nick z listy, a komentarz o podszyciu (`emotes.ts:55-57`) się zmienia.

#### 6. Skrypt klucza i CI

**File**: `scripts/signing-key.mjs` (nowy), `.github/workflows/ci.yml`

**Intent**: Jeden sposób na nowy klucz, który nigdy nie ląduje w repo ani w wyjściu agenta.

**Contract**:

- `node scripts/signing-key.mjs` wypisuje sam sekret, bez końcowego znaku nowej linii, do potoku `| npx wrangler secret put LIVE_SIGNING_KEY`.
- `--env-line` wypisuje `LIVE_SIGNING_KEY=<sekret>` z jednym znakiem nowej linii, do `>> .dev.vars`.
- Klucz generuje Web Crypto w Node. Przed wypisaniem skrypt robi próbę przez `importSigningKey`, `signMessage` i `openSignedMessage`; gdy próba nie przejdzie, nic nie wypisuje i kończy się kodem błędu (plan-review F6).
- `importSigningKey` obcina białe znaki z brzegów sekretu.
- W jobach `smoke` i `e2e` jedna linia po `cp .env .dev.vars` (`ci.yml:59`, `:140`) dopisuje klucz jednorazowy. Wartości nie wypisuje żaden krok.

#### 7. Testy

**File**: `tests/unit/live-sync-signature.test.ts` (nowy), `tests/unit/live-sync-server.test.ts`, `tests/unit/emotes.test.ts`, `tests/e2e/support/live.ts`, `tests/e2e/players-channel.spec.ts`, `scripts/smoke.mjs`

**Intent**: Wyrocznią jest PRD: „nikt nie napisze z cudzym nickiem”. Testy dowodzą, że podrobiona albo przerobiona wiadomość nie dochodzi, a podpisana dochodzi.

**Contract**:

- Jednostkowe, z kluczem wygenerowanym w teście:
  - przejście tam i z powrotem;
  - odrzucenie: zmieniony `data` (inny nick), zły i pusty `sig`, inny `room`, inny `event`, `at` za stary i z przyszłości poza oknem, zła wersja, śmieci (`null`, tablica, `"constructor"`, zły base64url);
  - klucz publiczny z JWK równy eksportowi `raw`, bez `d`;
  - zły sekret daje `null`.
- `sendEmote`: kopertę da się otworzyć kluczem publicznym; log bez nicku, treści, klucza i podpisu.
- `live.ts`: `listen` czyta `data` z koperty (bez sprawdzania podpisu), `heard(emote, nick)` dalej działa. Dochodzi wysyłka surowego ładunku i zapamiętanie ostatniej koperty, do przeróbki.
- `players-channel.spec.ts`:
  - krok 1 odwrócony, z podróbkami o poprawnym kształcie, które odrzuca tylko podpis (plan-review F2: ekran już widział `id` prawdziwej koperty, więc jej kopia odpadłaby jako powtórka, a stary płaski kształt odpada na kształcie):
    - (1) nowe `data` (świeże `id`, `at` z zegara testu, właściwe `room` i `event`, nick Oli) z losowym 64-bajtowym `sig`;
    - (2) zapamiętana prawdziwa koperta z podmienionym nickiem i nowym `id`, ze starym `sig`;
    - obie nie pojawiają się na ekranie hosta;
  - osobna asercja: niepodpisana emotka w starym kształcie `{ emote, nick }` z nickiem Oli też nie;
  - kontrola pozytywna według §6.4: słuchacz je dostał, a późniejsza prawdziwa emotka Oli jest na ekranie hosta.
- Smoke: nowy krok „strona pokoju niesie klucz publiczny kanału” (`signingKey` o kształcie 65-bajtowego `raw` w base64url) dla gościa.

#### 8. Lokalny `.dev.vars` Karola

**File**: — (polecenie)

**Intent**: Serwer dev i smoke na serwerze dev podpisują własnym kluczem.

**Contract**: za zgodą Karola `node scripts/signing-key.mjs --env-line >> .dev.vars`. Wartości nikt nie wypisuje ani nie czyta. Klucz lokalny jest inny niż produkcyjny.

### Success Criteria:

#### Automated Verification:

- Bramka lokalna przechodzi: `npm run lint`, `npx astro check`, `npm test`, `npm run build`
- Draft PR do `main` (push za zgodą Karola): CI zielone we wszystkich jobach; `emotes.spec.ts` i `players-channel.spec.ts` z odwróconym krokiem 1 przechodzą, kroki smoke emotek i klucza publicznego przechodzą
- Próbny alarm: ekran przyjmuje emotkę bez sprawdzenia podpisu; czerwony tylko krok 1 w `players-channel.spec.ts`; po `git revert` CI zielone

#### Manual Verification:

- Karol czyta streszczenie podpisu (co podpisuje Worker, co odrzuca ekran, co się dzieje bez sekretu i z kartami otwartymi przy wdrożeniu) i je akceptuje

**Implementation Note**: Próbny alarm według `test-plan.md` §6.4: tymczasowo `openSignedMessage` zwraca pola bez sprawdzenia podpisu (kształt, wersja, `room`, `event`, okno czasu i pamięć `id` zostają). Przewidywanie, wpisane w opis commita przed pushem: czerwony tylko krok 1 `players-channel.spec.ts` (podróbki (1) i (2) na ekranie hosta, płaska w starym kształcie nie) we wszystkich próbach; `emotes.spec.ts`, `ci`, `smoke`, `db` zielone. Wynik w rejestrze §6.4. Podglądy `/dev/*` się nie zmieniają (nie otwierają kanału), więc zrzuty niepotrzebne.

---

## Faza 2: Czat na serwerze

### Overview

Trasa `POST /api/rooms/<id>/chat`, walidacja treści, podpisane zdarzenie `chat` na temacie graczy, wspólne stałe i parser dla ekranu. Testy jednostkowe i kroki smoke. Ekran jeszcze niczego nie pokazuje.

### Changes Required:

#### 1. Wspólny moduł czatu

**File**: `src/lib/rooms/chat.ts` (nowy)

**Intent**: Limity i reguły treści w jednym miejscu, dla Workera i ekranu.

**Contract**:

- `CHAT_MAX_LENGTH = 200`, `CHAT_COOLDOWN_MS = 2000`, `CHAT_MAX_KEPT = 50`.
- `chatTextLength(text)` liczy punkty kodowe po NFC i zwinięciu odstępów, jak `questionLength` (`shared.ts:713-723`), ale bez obcinania „?”.
- `bodyChatText(body): string | undefined` przyjmuje `{ text: string }`. Zwraca tekst znormalizowany (NFC, odstępy w jedną spację, obcięte brzegi) o długości 1–200. Odrzuca znaki sterujące `\p{Cc}`, które zostają po zwinięciu odstępów, i znaki kierunku pisma U+202A–U+202E, U+2066–U+2069. `undefined` także dla `"constructor"`, nie-ciągu i braku pola.
- `ChatMessage = { id: string; nick: string; text: string }`.
- `parseChatMessage(fields, nicks)` przyjmuje sprawdzone pola. Zwraca wiadomość tylko z nickiem z listy i tekstem, który przechodzi te same reguły.

#### 2. Zdarzenie i nadanie

**File**: `src/lib/live-sync/shared.ts`, `src/lib/live-sync/server.ts`, `src/lib/rooms/server.ts`

**Intent**: Czat idzie tym samym tematem i tą samą drogą co emotka.

**Contract**: `CHAT_EVENT = "chat"` z komentarzem (treść od gracza, podpisana, nic nie zapisuje). `sendChat(supabase, roomId, channelKey, signer, { nick, text })` z `op: "chat_send"` i `broadcastChat(...)` wzorem emotki. Log jak przy emotce, bez tekstu i nicku.

#### 3. Trasa

**File**: `src/pages/api/rooms/[id]/chat.ts` (nowy), `src/components/room/room-actions.ts`

**Intent**: Kolejność kontroli jak w trasie emotki.

**Contract**: `OP = "chat"`. Kolejność: `refuseForeignPost` → id (404) → `readJsonBody` (400) → `bodyChatText` (400 `invalid_body`) → ciasteczko albo sesja → `createClient` (503) → `getChannelSigner` (503) → `roomLobby` (`null` = 404) → `broadcastChat` z `result.lobby.me` → `{ok:true}`. Logi tylko przez `actionAnswer` (`op`, `outcome`, `roomId`). `"chat"` dopisany do unii `RoomAction`.

#### 4. Testy

**File**: `tests/unit/chat.test.ts` (nowy), `tests/unit/live-sync-server.test.ts`, `scripts/smoke.mjs`, `tests/e2e/support/live.ts`

**Intent**: Granice z decyzji Karola, nie z kodu.

**Contract**:

- `bodyChatText`:
  - przyjmuje 1 i 200 znaków, w tym 200 polskich liter i 200 prostych emoji;
  - odrzuca 0 i 201 znaków, same odstępy, `\u0000`, U+202E, nie-ciąg, brak pola, `"constructor"`;
  - zwija odstępy i nowe linie.
- `parseChatMessage`: nick spoza listy i inna wielkość liter odpadają.
- `sendChat`: koperta otwiera się z `event: "chat"`; log bez tekstu, nicku, klucza i podpisu.
- Smoke, w `roundSteps()` obok emotek:
  - „Ola writes on the chat”: 200 `{"ok":true}`;
  - „a 201-character chat message is refused”: 400 `invalid_body`;
  - „Ula, rejected, cannot write on the chat”: 404.
- `live.ts`: `listen` zbiera też zdarzenia `chat` (`heardChat(text, nick)`), pod Fazę 3.

### Success Criteria:

#### Automated Verification:

- Bramka lokalna przechodzi: `npm run lint`, `npx astro check`, `npm test`, `npm run build`
- Push do draft PR (za zgodą Karola): CI zielone; nowe kroki smoke czatu przechodzą
- Próbny alarm: odrzucona Ula pisze na czacie i treść trafia do logu; czerwone tylko krok smoke „Ula, rejected…” i test logu `sendChat`; po `git revert` CI zielone

**Implementation Note**: Próbny alarm według `test-plan.md` §6.5 (Break-check; plan-review F5): jeden tymczasowy commit z dwiema usterkami, bo każda zapala inny test: (a) trasa czatu bez sprawdzenia `result.lobby` (odrzucona Ula dostaje 500 zamiast 404) → czerwony tylko krok smoke „Ula, rejected, cannot write on the chat”; (b) `sendChat` dopisuje tekst do `code` linii logu → czerwony tylko test logu w `live-sync-server.test.ts`. Przewidywanie w opisie commita przed pushem; `db`, `e2e` i reszta smoke i testów jednostkowych zielone. Wynik w rejestrze §6.5.

---

## Faza 3: Czat na ekranach

### Overview

Najpierw galeria wariantów: telefon w prawdziwej wielkości, laptop jako całe okno 1:1, strona HTML z „Co oceniasz” w Chrome Karola. Karol wybiera. Potem gotowy czat we wszystkich stanach pokoju, podglądy `/dev`, klawiatura telefonu i `chat.spec.ts`.

### Changes Required:

#### 1. Galeria wariantów

**File**: tymczasowe stany podglądu w `src/pages/dev/room-window.astro`, strona galerii w scratchpadzie

**Intent**: Karol wybiera, gdzie stoi czat, zanim powstanie gotowy ekran.

**Contract**: Każdy wariant pokazany w poczekalni, w głosowaniu (gość i host) i na odsłonie, z kilkoma wiadomościami, długą wiadomością i polem w trakcie pisania. Kandydaci na telefon:

- T1 „Pole nad emotkami”: pole przyklejone nad paskiem emotek, nad nim 2–3 ostatnie wiadomości, pełna lista po dotknięciu.
- T2 „Przycisk Czat z licznikiem”: w dolnym pasku przycisk „Czat” z liczbą nowych wiadomości, który rozwija panel z listą i polem (rozwijany region, nie okno modalne). Przy zwiniętym czacie nowe wiadomości wyskakują krótko jak dymki emotek.
- T3 „Czat na końcu kolumny”: lista i pole jako zwykła sekcja pod widokiem, nic się nie przykleja.

Na laptop:

- L1: karta czatu przy prawej krawędzi od `xl`, obok karty emotek.
- L2: sekcja pod widokiem od `lg`.

Wybór trafia do `change.md`, a warianty niewybrane znikają przed commitem.

#### 2. Komponent czatu

**File**: `src/components/room/RoomChat.tsx` (nowy), w razie potrzeby `src/components/room/EmoteBar.tsx`

**Intent**: Lista ostatnich wiadomości i formularz w wybranym układzie, z tokenów i klocków `src/components/ui` (`input-group`, `field`, `button`), bez nowej zależności.

**Contract**:

- Nagłówek „Czat” poza `contentRef`, więc `focusTitle` go nie znajdzie.
- Lista bez semantyki live: wiadomość to nick w kolorze gracza i tekst jako zwykły tekst React, bez linków, z łamaniem długich słów.
- Jeden `sr-only` `aria-live="polite"` z najnowszą wiadomością „<nick>: <tekst>”, jak przy emotkach.
- Pole:
  - jednowierszowe, `enterKeyHint="send"`;
  - licznik `aria-hidden` od 180 znaków, kontrola długości przy wysyłce (wzór `QuestionField.tsx:16-21,80-88`);
  - „Wyślij” z `aria-disabled` przez 2 s od wysyłki (wzór `EmoteBar.tsx:53-76,97`).
- Po `{ok:true}` pole jest czyste i fokus zostaje w nim. Odmowa idzie przez `FieldError` z `roomErrorMessage`, a tekst zostaje w polu.
- Ruch tylko pod `motion-safe:` (`reveal-motion.ts`).

#### 3. Ekran pokoju

**File**: `src/components/room/RoomScreen.tsx`, `src/components/room/useRoomState.ts`

**Intent**: Czat w każdym widoku pokoju, wiadomości tylko w pamięci karty.

**Contract**:

- `useRoomState` dostaje `onChat`, przez ref jak `onEmote`.
- `RoomScreen` trzyma `ChatMessage[]`, najwyżej `CHAT_MAX_KEPT`, z `parseChatMessage`.
- Przy każdej zmianie `view.players` wpisy nicków, których już nie ma, znikają (decyzja 2).
- Czat stoi we wszystkich widokach, które dziś mają pasek emotek (`:405-482,574-575`).
- `ScreenPreview.chat?: ChatPreview` (`messages`, `draft`, `cooling`, `error` i stan rozwinięcia, jeśli wybrany wariant go ma).

#### 4. Klawiatura telefonu

**File**: `src/layouts/Layout.astro`, `src/pages/r/[id].astro`

**Intent**: Pole czatu przy dolnej krawędzi nie chowa się pod klawiaturą.

**Contract**: Tylko wtedy, gdy Karol wybierze wariant z polem przyklejonym do dołu (T1 albo T2; T3 tego nie potrzebuje; plan-review F4):

- `Layout` dostaje opcjonalny `viewport`. Strona pokoju podaje `width=device-width, interactive-widget=resizes-content`, więc na Androidzie przyklejone elementy stają nad klawiaturą. iPhone ten parametr pomija i sam przewija do pola.
- Parametr działa na całą stronę `/r/`: pasek emotek (`EmoteBar.tsx:27`) stanie nad klawiaturą także przy innych polach. Pole propozycji ma już `scroll-mb-44 lg:scroll-mb-0` (`ProposalForm.tsx:189`); te same klasy dostają pola hosta „Popraw” (`QuestionList.tsx:230`) i „Dodaj własne pytanie” (`QuestionList.tsx:439`), które dziś nie mają żadnego marginesu.
- Gdy przeklikanie Karola (4.5) pokaże problem, strona wraca do domyślnego viewportu, a wariant dostaje `scroll-mb` jak `ProposalForm.tsx:187-189`.

#### 5. Podglądy

**File**: `src/pages/dev/room-states.astro`, `src/pages/dev/room-window.astro`

**Intent**: Nowy stan w podglądach według AGENTS.md (UI).

**Contract**:

- Grupa „Gra: czat (/r/…)” w `room-states.astro`: pusty, kilka wiadomości, 50 wiadomości z długą, pauza, odmowa, pisanie blisko limitu.
- Próbki w `room-window.astro` (`Sample.chat`): gość w głosowaniu, host na odsłonie, poczekalnia na telefonie.

#### 6. E2E

**File**: `tests/e2e/chat.spec.ts` (nowy), `playwright.config.ts`, `context/foundation/test-plan.md` (budżet gier)

**Intent**: Prawdziwy czat w przeglądarce z trzema graczami, w obu projektach.

**Contract**: Host i dwóch gości (`newGuestContext`), sprawdzenie okna jak w `emotes.spec.ts:60-68`.

- A pisze w poczekalni, a „A: <tekst>” jest u wszystkich trzech, także u A.
- „Wyślij” u A ma `aria-disabled` i po pauzie wraca.
- B pisze w głosowaniu i na odsłonie.
- Host usuwa B, a wpisy B znikają u hosta i A.
- Na końcu wieczoru czat dalej działa.

`phone` dostaje `chat` w `testMatch`. Komentarz budżetu gier w `playwright.config.ts:17-20` i §6.4 dostaje nową liczbę.

### Success Criteria:

#### Automated Verification:

- Bramka lokalna przechodzi: `npm run lint`, `npx astro check`, `npm test`, `npm run build`
- Push do draft PR (za zgodą Karola): CI zielone; `chat.spec.ts` przechodzi w `chromium` i `phone`, siatka regresji e2e zielona
- Próbny alarm: wpisy usuniętego gracza zostają na ekranach; czerwony tylko krok usunięcia w `chat.spec.ts`; po `git revert` CI zielone

#### Manual Verification:

- Karol wybiera wariant czatu na telefonie i laptopie z galerii zrzutów (wybór w `change.md`)
- Karol akceptuje gotowe ekrany na zrzutach (telefon w prawdziwej wielkości, laptop 1:1): poczekalnia, głosowanie, odsłona, koniec wieczoru, pauza, odmowa, długa wiadomość

**Implementation Note**: Serwer dev tylko do podglądów `/dev/*` bez sieci, zatrzymany po pracy. Próbny alarm: tymczasowo bez czyszczenia wpisów po zmianie listy graczy. Przewidywanie: czerwona tylko asercja „wpisy B znikają” w `chat.spec.ts`, w obu projektach; reszta zielona.

---

## Faza 4: Dokumenty i wdrożenie

### Overview

Słownik, AGENTS.md, test-plan, deploy-plan, development.md, roadmapa i notatki zmiany. Potem sekret na produkcji przed scaleniem, scalenie przez Karola, smoke na produkcji i przeklikanie.

### Changes Required:

#### 1. Słownik

**File**: `context/domain/glossary.md`

**Intent**: Nowe słowa zmiany.

**Contract**:

- Nowe wpisy:
  - „czat” (jeden na pokój, tylko kanałem na żywo, nic nie zapisuje; kod: `CHAT_EVENT`, `POST …/chat`, `RoomChat`);
  - „wiadomość na czacie” (do 200 znaków, z nickiem nadawcy; kod: `ChatMessage`, `bodyChatText`, `parseChatMessage`);
  - „podpis serwera” (koperta `{data, sig}` na temacie graczy; kod: `signMessage`, `openSignedMessage`, `LIVE_SIGNING_KEY`).
- „Emotka” dalej unika słów „wiadomość” i „czat”.
- Dopisek przy „kanał na żywo”: treść tematu graczy podpisana, zdanie o podszyciu znika.

#### 2. Zasady dla agentów i dokumentacja

**File**: `AGENTS.md`, `docs/development.md`

**Intent**: Zasady treści czatu i sekretu tam, gdzie agent ich szuka.

**Contract**:

- `AGENTS.md`, Hard Rules:
  - treść czatu nigdy w bazie, logach, `sessionStorage`/`localStorage` ani w adresie;
  - `LIVE_SIGNING_KEY` tylko jako sekret Workera i w lokalnym `.dev.vars`, nigdy w przeglądarce, repo ani logach;
  - do ekranu idzie tylko klucz publiczny.
- `development.md`: lokalny `.dev.vars` dostaje klucz przez `node scripts/signing-key.mjs --env-line`; w opisie CI jobów `smoke` i `e2e` klucz jednorazowy z joba.

#### 3. Test-plan, deploy-plan, roadmapa, notatki

**File**: `context/foundation/test-plan.md`, `context/deployment/deploy-plan.md`, `context/foundation/roadmap.md`, `context/changes/room-chat/change.md`

**Intent**: Wzory testów, wyniki alarmów i procedura sekretu tam, gdzie następna zmiana ich szuka.

**Contract**:

- `test-plan.md`:
  - §6.4: `chat.spec.ts` i odwrócony krok 1 na liście wzorów, koperta w punkcie „Raw Realtime client”, wyniki alarmów Faz 1 i 3;
  - §6.5: nowa suma kroków smoke;
  - Freshness Ledger.
- `deploy-plan.md`: nowa sekcja „Sekrety Workera”:
  - `LIVE_SIGNING_KEY`: skąd, jak go wgrać (`node scripts/signing-key.mjs | npx wrangler secret put LIVE_SIGNING_KEY`, za zgodą);
  - kolejność „sekret, potem kod”;
  - wymiana klucza: otwarte karty do odświeżenia odrzucają nowe podpisy, więc poza wieczorem gry.
- `roadmap.md`:
  - S-23 `in-progress`;
  - wpis Parked „Kanał na żywo tylko dla graczy pokoju”: podszycie zamknięte podpisem, zostają dzwonki i zalew.
- `change.md`: decyzje 1–4 i wybór wyglądu.

#### 4. Wdrożenie

**File**: — (polecenia)

**Intent**: Sekret przed kodem, potem scalenie i sprawdzenie na produkcji.

**Contract**:

- Za zgodą Karola `node scripts/signing-key.mjs | npx wrangler secret put LIVE_SIGNING_KEY`, potem `npx wrangler secret list` pokazuje nazwę.
- PR gotowy (nie draft) → scala Karol (`! gh pr merge <n> --merge`) → Workers Builds → smoke na produkcji (za zgodą) → jedno `curl -sI` odpowiedzi `/api/rooms/<id>/lobby` na produkcji pokazuje nagłówek `Date` (bez niego ekran liczy przesunięcie tylko z `serverNow`).
- Gdy smoke na produkcji pokaże 503 na emotkach, sekret jest zły: najpierw ponowne `wrangler secret put` (za zgodą), dopiero potem `npx wrangler rollback` (za zgodą).
- Epilog osobnym PR-em: SHA w Progress, wpis w `deploy-plan.md`.

### Success Criteria:

#### Automated Verification:

- `npx prettier --check` dla zmienionych plików `.md` przechodzi
- `LIVE_SIGNING_KEY` wgrany na produkcję przed scaleniem (`wrangler secret put` za zgodą Karola), `npx wrangler secret list` pokazuje nazwę
- Po scaleniu: Workers Builds zielony, na `main` zielone `ci`, `smoke`, `db`, `e2e`
- Smoke na produkcji zielony, z krokami czatu i klucza publicznego (za zgodą Karola)

#### Manual Verification:

- Karol na telefonie i laptopie: czat w poczekalni, w głosowaniu, na odsłonie i na końcu wieczoru dochodzi do wszystkich z nickiem; emotki działają jak dotąd; po odświeżeniu czat jest pusty; po usunięciu gracza jego wpisy znikają, a usunięty czatu nie widzi; klawiatura telefonu nie zasłania pola czatu ani (przy zmienionym viewporcie) pól hosta „Popraw” i „Dodaj własne pytanie”
- Na wieczorze z ekipą: czat nie zasłania pytania ani guzików głosu i nikt nie zgłasza zgubionych wiadomości

**Implementation Note**: PR NIE scalać przed `wrangler secret put`: bez sekretu emotki i czat dostaną 503. Wdrażać poza wieczorem gry, bo otwarte karty do odświeżenia nie zobaczą emotek.

---

## Testing Strategy

### Unit Tests:

- Podpis: przejście tam i z powrotem i każda odmowa (przerobione dane, zły podpis, inny pokój, inne zdarzenie, okno czasu, wersja, śmieci). Klucz publiczny bez `d`.
- Czat: granice 1/200/201 znaków w punktach kodowych, polskie litery i emoji, zwijanie odstępów, znaki sterujące i kierunku pisma, `"constructor"`, nick spoza listy.
- Nadanie: koperta się otwiera, log bez treści, nicku, klucza i podpisu.

### Integration Tests:

- `players-channel.spec.ts`: podróbka o poprawnym kształcie z obcym podpisem, przerobiona koperta z nowym `id` i stary płaski kształt nie dochodzą, prawdziwa dochodzi (kontrola pozytywna §6.4).
- `emotes.spec.ts` bez zmian: dowodzi, że podpis z kluczem CI przechodzi całą drogę.
- `chat.spec.ts`: trzech graczy, oba projekty, wszystkie stany, pauza, usunięcie gracza.
- Smoke: kroki emotek (503 bez sekretu), klucz publiczny na stronie, trzy kroki czatu.

### Manual Testing Steps:

1. Telefon i laptop w jednej grze testowej: wiadomość z każdej strony w poczekalni, w głosowaniu, na odsłonie i na końcu wieczoru.
2. Odświeżenie strony na telefonie: czat pusty, nowe wiadomości dochodzą.
3. Usunięcie gracza: jego wpisy znikają, on sam widzi „Usunięto cię z pokoju.”
4. Klawiatura prawdziwego telefonu przy polu czatu (Android, iPhone, jeśli jest pod ręką).

## Performance Considerations

Podpis i sprawdzenie ECDSA P-256 trwają dziesiątki mikrosekund, przy limicie 10 ms CPU planu darmowego Workera. Klucz importuje się raz na izolat i raz na ekran. Czat dokłada drugi strumień na temacie graczy, a każda wiadomość liczy się w Realtime jako 1 + liczba słuchaczy (limit 100/s na projekt). Pauza 2 s przy 20 piszących to górna granica, nie cel (`research.md` §5). Koperta ma około 400 bajtów, daleko od limitu 256 KB.

## Migration Notes

Bez migracji bazy. Nowy sekret Workera `LIVE_SIGNING_KEY` wchodzi przed scaleniem kodu. Wycofanie: `npx wrangler rollback` (za zgodą) przywraca kod bez podpisu, a sekret może zostać.

## References

- Research: `context/changes/room-chat/research.md`
- Opcja W-E: `context/changes/players-only-live-channel/research.md:111-121`
- Trasa emotki: `src/pages/api/rooms/[id]/emote.ts:21-47`
- Nadanie: `src/lib/live-sync/server.ts:25-54,74-89`
- Temat graczy na ekranie: `src/components/room/useRoomState.ts:427-473`
- Kontrola nadawcy do odwrócenia: `tests/e2e/players-channel.spec.ts:125-132`
- Archiwum emotek: `context/archive/2026-10-26-room-emotes/plan.md:52-66`, `reviews/impl-review.md:63-91`

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: Podpis serwera na temacie graczy

#### Automated

- [x] 1.1 Bramka lokalna przechodzi: `npm run lint`, `npx astro check`, `npm test`, `npm run build` — 0a9b645
- [x] 1.2 Draft PR do `main` (push za zgodą Karola): CI zielone we wszystkich jobach; `emotes.spec.ts` i `players-channel.spec.ts` z odwróconym krokiem 1 przechodzą, kroki smoke emotek i klucza publicznego przechodzą — 0a9b645
- [x] 1.3 Próbny alarm: ekran przyjmuje emotkę bez sprawdzenia podpisu; czerwony tylko krok 1 w `players-channel.spec.ts`; po `git revert` CI zielone — a251fc0

#### Manual

- [x] 1.4 Karol czyta streszczenie podpisu (co podpisuje Worker, co odrzuca ekran, co się dzieje bez sekretu i z kartami otwartymi przy wdrożeniu) i je akceptuje — 0a9b645

### Phase 2: Czat na serwerze

#### Automated

- [x] 2.1 Bramka lokalna przechodzi: `npm run lint`, `npx astro check`, `npm test`, `npm run build` — 9aabe30
- [x] 2.2 Push do draft PR (za zgodą Karola): CI zielone; nowe kroki smoke czatu przechodzą — 9aabe30
- [x] 2.3 Próbny alarm: odrzucona Ula pisze na czacie i treść trafia do logu; czerwone tylko krok smoke „Ula, rejected…” i test logu `sendChat`; po `git revert` CI zielone — a9e98d7

### Phase 3: Czat na ekranach

#### Automated

- [ ] 3.1 Bramka lokalna przechodzi: `npm run lint`, `npx astro check`, `npm test`, `npm run build`
- [ ] 3.2 Push do draft PR (za zgodą Karola): CI zielone; `chat.spec.ts` przechodzi w `chromium` i `phone`, siatka regresji e2e zielona
- [ ] 3.3 Próbny alarm: wpisy usuniętego gracza zostają na ekranach; czerwony tylko krok usunięcia w `chat.spec.ts`; po `git revert` CI zielone

#### Manual

- [ ] 3.4 Karol wybiera wariant czatu na telefonie i laptopie z galerii zrzutów (wybór w `change.md`)
- [ ] 3.5 Karol akceptuje gotowe ekrany na zrzutach (telefon w prawdziwej wielkości, laptop 1:1): poczekalnia, głosowanie, odsłona, koniec wieczoru, pauza, odmowa, długa wiadomość

### Phase 4: Dokumenty i wdrożenie

#### Automated

- [ ] 4.1 `npx prettier --check` dla zmienionych plików `.md` przechodzi
- [ ] 4.2 `LIVE_SIGNING_KEY` wgrany na produkcję przed scaleniem (`wrangler secret put` za zgodą Karola), `npx wrangler secret list` pokazuje nazwę
- [ ] 4.3 Po scaleniu: Workers Builds zielony, na `main` zielone `ci`, `smoke`, `db`, `e2e`
- [ ] 4.4 Smoke na produkcji zielony, z krokami czatu i klucza publicznego (za zgodą Karola)

#### Manual

- [ ] 4.5 Karol na telefonie i laptopie: czat w poczekalni, w głosowaniu, na odsłonie i na końcu wieczoru dochodzi do wszystkich z nickiem; emotki działają jak dotąd; po odświeżeniu czat jest pusty; po usunięciu gracza jego wpisy znikają, a usunięty czatu nie widzi; klawiatura telefonu nie zasłania pola czatu ani (przy zmienionym viewporcie) pól hosta „Popraw” i „Dodaj własne pytanie” czatu ani (przy zmienionym viewporcie) pól hosta „Popraw” i „Dodaj własne pytanie”
- [ ] 4.6 Na wieczorze z ekipą: czat nie zasłania pytania ani guzików głosu i nikt nie zgłasza zgubionych wiadomości
