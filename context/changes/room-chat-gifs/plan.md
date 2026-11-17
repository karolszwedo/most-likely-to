# Gify w czacie pokoju: wyszukiwarka KLIPY, gif z nickiem, bez zapisu Implementation Plan

## Overview

Gracz na czacie pokoju (host, współhost i gość bez roli) otwiera wyszukiwarkę gifów, wpisuje słowo, wybiera gifa, a cały pokój widzi go na żywo z jego nickiem (S-24, PRD FR-028). Wyszukiwanie i obrazki idą prosto z przeglądarki do KLIPY, z najostrzejszym filtrem i bez nicku i pokoju. Wybrany gif idzie drogą wiadomości: ekran → Worker (sprawdza adres, bierze nick ze stanu pokoju, podpisuje) → temat graczy. Nic nie zostaje w bazie, w logach ani w pamięci przeglądarki poza otwartą kartą. Przy okazji gra dostaje nagłówek Content-Security-Policy (`img-src`, `connect-src`), odłożony z `security-hardening`.

**Decyzje Karola (2026-11-17, `change.md`):**

1. Dostawca: KLIPY (klucz testowy 100 zapytań/h na całą grę, potem wniosek o produkcyjny z nagraniem ekranu).
2. Prywatność przyjęta: KLIPY widzi słowa wyszukiwania oraz IP i przeglądarkę gracza, który szuka albo widzi gifa, ale nie nick ani pokój.
3. Filtr przyjęty: najostrzejszy w zapytaniu i w panelu KLIPY; gracz, który przerobi własną stronę, może przemycić gifa spoza filtra, ale gra pokaże tylko obrazki z serwerów KLIPY; na niechcianego gracza prowadzący ma usunięcie.
4. Po otwarciu wyszukiwarki puste pole: zapytanie idzie dopiero po słowie i „Szukaj”, bez popularnych gifów na starcie i bez szukania przy każdej literze.
5. Napis w polu wyszukiwania „Search KLIPY”, dokładnie jak wymaga KLIPY; czytnik ekranu dostaje polską etykietę „Szukaj gifa”.
6. Wdrożenie od razu na kluczu testowym; Karol nagrywa gify na produkcji i składa wniosek o klucz produkcyjny, po zgodzie podmieniamy sekret.
7. Wygląd wyszukiwarki i gifa w czacie: Karol wybiera z galerii zrzutów w Fazie 3.

## Current State Analysis

- Wiadomość: `RoomChat.tsx:205-229` → `RoomScreen.tsx:348-352` → `sendRoomAction(roomId, "chat", { text })` (`room-actions.ts:72-97`) → trasa `src/pages/api/rooms/[id]/chat.ts:25-57`: `refuseForeignPost` → UUID → `readJsonBody` (4096 bajtów) → `bodyChatText` (400 `invalid_body`) → ciasteczko albo sesja → `createClient` (503) → `getChannelSigner` (503) → `roomLobby` (`null` = 404) → `broadcastChat` z `result.lobby.me`.
- `sendChat` (`src/lib/live-sync/server.ts:137-172`) podpisuje `{ room, event: "chat", text, nick }` i wycina z powodu błędu Realtime kopertę, podpis, nick i tekst (`:170`).
- Ekran: `useRoomState.ts:520-546` otwiera kopertę (`openSignedMessage`, przepuszcza nieznane pola) i woła `onChat`; `RoomScreen.tsx:186-191` bierze `parseChatMessage(fields, nicks)`, które zwraca `null` bez `text` (`src/lib/rooms/chat.ts:84-91`). `ChatMessage = { id, nick, text }` (`chat.ts:20-24`). `appendChatMessage` i `keepPlayersChat` patrzą tylko na `id` i `nick` (`chat.ts:95-107`).
- `RoomChat.tsx`: wiersz wiadomości `MessageLine` (`:80-100`), region `aria-live` (`:241-243`), formularz (`:284-345`), dymek zwiniętego czatu (`:352-362`), podgląd `ChatPreview` (`:17-33`). Wygląd z S-23: T2 na telefonie (panel nad paskiem emotek, najwyżej pół okna), L3 od `xl` (panel przy lewej krawędzi).
- Nagłówki: `src/lib/security-headers.ts:8-20` (bez CSP, bez importów `astro:*`), nakładane w `src/middleware.ts:10-38` na każdą odpowiedź Workera (strony, `/api/*`, przekierowania); pliki statyczne z `dist/` idą obok middleware. Test `tests/unit/security-headers.test.ts:10-53` porównuje wybrane nagłówki po nazwie; smoke `scripts/smoke.mjs:389-418,1153` sprawdza tylko `X-Frame-Options` i `Cache-Control`.
- Przeglądarka łączy się dziś z jednym obcym adresem: Supabase Realtime przez `wss://<projekt>` (w CI `ws://127.0.0.1:54321`), z adresu `SUPABASE_URL`, który strona dostaje z `getPublicSupabaseConfig()` (`src/lib/supabase.ts:34-39`; `useRoomState.ts:161-164`, `JoinWaiting.tsx:159-169`). Klienci w przeglądarce nie wołają REST Supabase. Wszystkie obrazki są z naszej domeny (`Layout.astro:31-34`, `HomeScreenHint.astro:25`), bez obcych czcionek, analityki i `data:`.
- Sekret wzorcowy: `LIVE_SIGNING_KEY` opcjonalny w schemacie (`astro.config.mjs:24`), czytany tylko w `src/lib/live-sync/signing-key.ts`, do ekranu tylko klucz publiczny w propsach (`src/pages/r/[id].astro:76-81`). CI dopisuje klucz jednorazowy do `.dev.vars` w jobach `smoke` i `e2e` (`.github/workflows/ci.yml:60-61,143-144`).
- KLIPY (dokumentacja z 2026-11-17): `GET https://api.klipy.com/api/v1/{app_key}/gifs/search` z `q`, `per_page` (8–50), `page`, `locale`, `content_filter` (`off|low|medium|high`, domyślna niepodana), `format_filter`, opcjonalnym `customer_id`. Odpowiedź `{ result, data: { data: [ { id, slug, title, type, file: { hd|md|sm|xs: { gif|webp|jpg|mp4|webm: { url, width, height, size } } }, blur_preview } ], has_next, … } }`. Media na `static.klipy.com`, `static1.klipy.com`, `static2.klipy.com`. Wymagane: placeholder „Search KLIPY”, wywołania z przeglądarki, adresy mediów bez zmian, wyniki w kolejności i składzie KLIPY, filtrowanie tylko w panelu; reklamy (`type: "ad"`) pojawiają się tylko po włączeniu w panelu.

## Desired End State

- Nagłówek `Content-Security-Policy` na każdej odpowiedzi Workera: `img-src 'self' https://static.klipy.com https://static1.klipy.com https://static2.klipy.com; connect-src 'self' <ws/wss adresu Supabase> https://api.klipy.com`. Gra w przeglądarce nie załaduje obrazka ani nie połączy się nigdzie poza tą listą.
- `POST /api/rooms/<id>/chat` przyjmuje albo `{ text }` jak dziś, albo `{ gif, title? }`: `gif` to adres `https` z jednego z hostów mediów KLIPY w postaci kanonicznej, do 512 znaków; `title` (opis z KLIPY, do 100 znaków, reguły tekstu czatu) jest opcjonalny. Oba naraz albo żadne: 400 `invalid_body`. Worker podpisuje gifa z nickiem i nadaje zdarzenie `chat`. Adresu i opisu nie loguje ani nie zapisuje.
- Strona pokoju podaje ekranowi klucz KLIPY (`gifSearchKey`), gdy Worker ma sekret `KLIPY_API_KEY`; bez niego czat działa bez przycisku gifów.
- Na ekranie czatu przycisk „GIF” otwiera wyszukiwarkę w wybranym przez Karola układzie: pole z placeholderem „Search KLIPY”, „Szukaj”, siatka do 12 wyników w kolejności KLIPY. Dotknięcie wyniku wysyła gifa, zamyka wyszukiwarkę i daje tę samą pauzę 2 s co wiadomość. Gif stoi w czacie z nickiem nadawcy u wszystkich, po odświeżeniu znika, po usunięciu gracza znika jak jego wiadomości. Wyczerpany limit albo awaria KLIPY to komunikat w wyszukiwarce; czat tekstowy działa dalej.
- Weryfikacja: testy jednostkowe adresu, treści, nadania, zapytania i CSP; kroki smoke (gif, obcy host, tekst i gif naraz, klucz na stronie, CSP); `chat.spec.ts` z udawanym KLIPY (`context.route`) w obu projektach; smoke na produkcji i przeklikanie Karola.

### Key Discoveries:

- CSP3 dopasowuje `ws:`/`wss:` do `'self'`, ale nie do `https://host`, więc adres Realtime musi stać w `connect-src` jawnie, ze schematem `wss` (albo `ws` w CI). Nagłówek trzeba składać z `SUPABASE_URL` w chwili żądania, nie wpisywać na sztywno.
- `security-headers.ts` celowo nie importuje `astro:*` (test jednostkowy go ładuje), więc adres Supabase podaje mu middleware, który już importuje `@/lib/supabase` (`middleware.ts:4`).
- `Referrer-Policy: same-origin` już nie wysyła ścieżki `/r/<id pokoju>` do KLIPY; plan dokłada jawne `referrerPolicy: "no-referrer"` i `credentials: "omit"` na zapytaniu oraz `referrerPolicy="no-referrer"` na obrazkach.
- KLIPY zabrania składania adresów z id, więc gif przechodzi jako adres z odpowiedzi KLIPY, a nie id. Worker przyjmuje tylko adres, który `new URL(adres).href` oddaje bez zmian (kanoniczny), więc nie musi go przepisywać.
- Pasek dewelopera `astro dev` woła `astro.build` (`node_modules/astro/dist/runtime/client/dev-toolbar/apps/astro.js:23`); po CSP jego zakładka integracji nie załaduje się na serwerze dev. Przyjęte, tylko dev.
- `per_page` wyszukiwania ma minimum 8. 12 wyników `xs` webp (mediana 35 KB) to około 0,4 MB na wyszukiwanie; gif w czacie `sm` webp (mediana 117 KB) u każdego gracza.

## What We're NOT Doing

- Bez pośrednika: Worker nie łączy się z KLIPY (zakaz bez pisemnej zgody), więc nie ukrywa przed KLIPY słów ani IP graczy (decyzja 2).
- Bez popularnych gifów na starcie, bez szukania przy każdej literze, bez „Więcej wyników” i bez kategorii (decyzja 4; limit 100/h). Popularne mogą dojść po kluczu produkcyjnym, osobną zmianą.
- Bez własnego filtrowania i przestawiania wyników: tylko `content_filter=high` i ustawienia panelu KLIPY. Ekran pomija wyłącznie wynik, którego nie da się pokazać (nie `type: "gif"` albo bez adresów `sm`/`xs` webp z hostów KLIPY); reklamy w panelu zostają wyłączone.
- Bez `customer_id`, nicku, id pokoju i czegokolwiek z gry w zapytaniu do KLIPY; `locale=pl` to język gry, nie gracza.
- Bez zapisu: ani baza, ani logi gry, ani `sessionStorage`/`localStorage`; słowo wyszukiwania żyje tylko w stanie otwartej wyszukiwarki. Bez migracji.
- Bez własnej kopii mediów, bez zmiany adresów, bez `blur_preview` (byłby `data:` w `img-src`), bez wideo (`<video>` wymagałoby `media-src`): gif to `<img>` z webp.
- Bez znaku wodnego i „Powered by KLIPY” (opcjonalne u KLIPY).
- Bez `default-src`, `script-src`, `style-src` i `form-action` w CSP: skrypty i style Astro (wyspy, `<script>` w `.astro`) zostają bez zmian, a logowanie OAuth przechodzi przekierowaniem.
- Bez CSP na plikach statycznych z `dist/` (idą obok middleware; przyjęte w `security-hardening`).
- Bez sekretu KLIPY w GitHubie i bez wołania KLIPY w CI i smoke: testy podstawiają odpowiedź KLIPY albo sprawdzają samą trasę.
- Bez serwerowego limitu gifów: pauza 2 s po stronie ekranu, jak przy wiadomościach.
- Karty otwarte przed wdrożeniem pomijają gify do odświeżenia (`parseChatMessage` bez `text` zwraca dziś `null`). Przyjęte.

## Implementation Approach

Cztery fazy. Najpierw CSP, bo działa bez gifów i całe e2e od razu pokaże, czy nagłówek czegoś nie blokuje. Potem gif na serwerze (trasa, podpis, klucz na stronie), bez zmian na ekranie. Potem ekran z galerią wariantów, na końcu dokumenty i wdrożenie. Lista hostów KLIPY ma jedno źródło w module bez importów serwera: korzystają z niej Worker (sprawdzenie adresu), ekran (sprawdzenie przed pokazaniem i zapytanie) i CSP. Gif to druga postać wiadomości czatu na tym samym zdarzeniu `chat`, więc kolejka sprawdzania podpisu, pamięć `id`, limit 50 wpisów i usuwanie wpisów usuniętego gracza działają bez zmian. Wszystkie fazy idą jednym PR-em, a `wrangler secret put KLIPY_API_KEY` wchodzi przed scaleniem.

## Critical Implementation Details

- **Adres bez przeróbek.** Ekran wysyła dokładnie `file.sm.webp.url` z odpowiedzi KLIPY. Worker i ekran przyjmują go tylko wtedy, gdy `new URL(adres)` ma `https:`, host z listy, brak loginu, hasła i portu, a `href` równa się wejściu. Niczego nie poprawiają, tylko odrzucają.
- **Prawdziwe KLIPY przed scaleniem (przegląd planu, F1).** Kształt odpowiedzi, `locale`, `format_filter`, wzór klucza i kanoniczność adresów mediów znamy tylko z dokumentacji, a udawane KLIPY w e2e powstaje z tych samych założeń. Dlatego Karol zakłada konto KLIPY i wpisuje klucz testowy do lokalnego `.dev.vars` przed Fazą 3, a Faza 3 zaczyna się od jednego prawdziwego wyszukiwania (Faza 3 #2).
- **Kolejność wdrożenia.** Konto KLIPY na mailu gry (najostrzejszy filtr, reklamy wyłączone) jest już z Fazy 3; przed scaleniem Karol wpisuje ten klucz przez `wrangler secret put KLIPY_API_KEY` (za zgodą), dopiero potem scalenie. Smoke na produkcji sprawdza klucz na stronie pokoju, więc bez sekretu będzie czerwony.
- **Limit wspólny.** Klucz testowy ma 100 zapytań/h na wszystkie przeglądarki naraz. Zapytanie idzie tylko po „Szukaj” z niepustym słowem; ponowne „Szukaj” z tym samym słowem nie pyta drugi raz.

## Faza 1: Content-Security-Policy

### Overview

Każda odpowiedź Workera dostaje CSP z dwiema dyrektywami. Lista hostów KLIPY powstaje już teraz, w module gifów, żeby CSP i późniejsze sprawdzenie adresu brały ją z jednego miejsca. Gracz nie widzi zmiany.

### Changes Required:

#### 1. Hosty KLIPY

**File**: `src/lib/rooms/gifs.ts` (nowy)

**Intent**: Jedno źródło adresów KLIPY dla CSP, Workera i ekranu, bez importów serwera.

**Contract**: `KLIPY_API_ORIGIN = "https://api.klipy.com"`, `KLIPY_MEDIA_HOSTS = ["static.klipy.com", "static1.klipy.com", "static2.klipy.com"] as const`, z komentarzem o źródle (`docs.klipy.com/network-requirements.md`, 2026-11-17).

#### 2. Nagłówek

**File**: `src/lib/security-headers.ts`, `src/middleware.ts`

**Intent**: CSP zamyka obrazki i połączenia do listy, a adres Realtime bierze z tego samego `SUPABASE_URL`, z którego korzysta strona.

**Contract**:

- `contentSecurityPolicy(supabaseUrl: string | null): string` (czysta): `img-src 'self'` + hosty mediów KLIPY ze schematem `https://`; `connect-src 'self'` + origin Supabase ze schematem `wss:` (gdy `https:`) albo `ws:` (gdy `http:`) + `KLIPY_API_ORIGIN`. Adres nieczytelny albo `null`: bez wpisu Supabase.
- `withSecurityHeaders(response, supabaseUrl)` dokłada `Content-Security-Policy`; middleware podaje `getPublicSupabaseConfig()?.supabaseUrl ?? null`. Reszta nagłówków bez zmian.

#### 3. Testy

**File**: `tests/unit/security-headers.test.ts`, `scripts/smoke.mjs`

**Intent**: Wyrocznią jest lista z researchu: przeglądarka gry ładuje obrazki tylko z domeny i KLIPY, łączy się tylko z domeną, Supabase i API KLIPY.

**Contract**:

- Jednostkowe: dokładny ciąg CSP dla `https://abc.supabase.co` (`wss://abc.supabase.co`), dla `http://127.0.0.1:54321` (`ws://127.0.0.1:54321`, z portem), dla `null` i śmieci; CSP na stronie, odpowiedzi JSON i przekierowaniu, obok czterech dotychczasowych nagłówków.
- Smoke, krok „the game's answers carry the security headers”: każda odpowiedź z `HEADER_CHECKS` ma CSP z `img-src` zawierającym `https://static.klipy.com` i `connect-src` zawierającym origin Realtime z `SUPABASE_URL` serwera (ze strony pokoju: `supabaseUrl` w propsach, jak krok klucza publicznego).

### Success Criteria:

#### Automated Verification:

- Bramka lokalna przechodzi: `npm run lint`, `npx astro check`, `npm test`, `npm run build`
- Draft PR do `main` (push za zgodą Karola): CI zielone we wszystkich jobach; całe e2e (Realtime, emotki, czat) przechodzi z CSP w przeglądarce, krok smoke nagłówków przechodzi
- Próbny alarm: middleware składa CSP bez adresu Supabase; czerwone tylko krok smoke nagłówków i specs e2e, które czekają na temat graczy albo dzwonek; po `git revert` CI zielone

#### Manual Verification:

- Na serwerze dev (`npx astro dev`, tylko `/dev/*`) konsola Chrome na `/dev/room-states` i `/dev/room-window` nie pokazuje naruszeń CSP poza paskiem dewelopera Astro

**Implementation Note**: Próbny alarm według `test-plan.md` §6.4: tymczasowo middleware podaje `null` zamiast adresu Supabase (funkcja CSP i jej testy jednostkowe zostają poprawne). Przewidywanie w opisie commita przed pushem: czerwony krok smoke nagłówków i w `e2e` specs zależne od Realtime (m.in. `emotes`, `chat`, `players-channel`, `round`); `ci` i `db` zielone. Wynik w rejestrze §6.4.

---

## Faza 2: Gif na serwerze

### Overview

Trasa czatu przyjmuje gifa, Worker podpisuje go z nickiem i nadaje na temacie graczy. Strona pokoju podaje ekranowi klucz KLIPY. CI dostaje udawany klucz. Ekran jeszcze gifów nie pokazuje.

### Changes Required:

#### 1. Treść gifa

**File**: `src/lib/rooms/gifs.ts`, `src/lib/rooms/chat.ts`

**Intent**: Reguły gifa w jednym miejscu dla Workera i ekranu; wiadomość czatu staje się tekstem albo gifem.

**Contract**:

- `GIF_URL_MAX_LENGTH = 512`, `GIF_TITLE_MAX_LENGTH = 100`.
- `isKlipyMediaUrl(value: unknown): value is string`: ciąg do 512 znaków, `new URL` się udaje, `protocol === "https:"`, `hostname` z `KLIPY_MEDIA_HOSTS`, puste `username`, `password` i `port`, `href === value`.
- `ChatMessage = ChatText | ChatGif`: `{ id, nick, kind: "text", text }` albo `{ id, nick, kind: "gif", gif, title }` (`title` może być `""`).
- `bodyChatContent(body)` zastępuje `bodyChatText`: `{ text }` jak dziś albo `{ gif, title? }`; `title` przechodzi reguły tekstu czatu z limitem 100, a pusty, zły albo za długi daje `""` (opis to podpowiedź dla czytnika, nie powód odmowy). Oba pola naraz, żadne, `"constructor"`, nie-obiekt: `undefined`.
- `parseChatMessage` przyjmuje obie postacie z tymi samymi regułami (adres przez `isKlipyMediaUrl`); `appendChatMessage` i `keepPlayersChat` bez zmian zachowania.

#### 2. Nadanie i trasa

**File**: `src/lib/live-sync/server.ts`, `src/lib/rooms/server.ts`, `src/pages/api/rooms/[id]/chat.ts`, `src/lib/live-sync/shared.ts`, `src/components/room/room-actions.ts`

**Intent**: Gif idzie tą samą trasą, zdarzeniem i podpisem co wiadomość.

**Contract**:

- `sendChat`/`broadcastChat` przyjmują treść bez `id` (tekst albo gif z nickiem); koperta ma `text` albo `gif` i `title`. Lista wycinana z powodu błędu obejmuje adres i opis.
- Trasa: kolejność bez zmian, `bodyChatContent` zamiast `bodyChatText`. Komentarze trasy, `CHAT_EVENT` i `room-actions.ts` mówią o gifie (adres tylko w ciele, nigdy w adresie, logu ani pamięci urządzenia).

#### 3. Klucz KLIPY

**File**: `astro.config.mjs`, `src/lib/rooms/gif-key.ts` (nowy), `src/pages/r/[id].astro`, `src/components/room/RoomScreen.tsx`, `.github/workflows/ci.yml`

**Intent**: Klucz nie leży w publicznym repo, a ekran dostaje go tylko na stronie pokoju; bez niego czat działa bez gifów.

**Contract**:

- Schemat: `KLIPY_API_KEY: envField.string({ context: "server", access: "secret", optional: true })`.
- `getGifSearchKey(): string | null`: tylko przez `astro:env/server`; wartość spoza `^[A-Za-z0-9_-]{8,128}$` (idzie do ścieżki zapytania) daje `null` i jedną linię `logEvent("error", { op: "gif_key", step })` na izolat, bez wartości.
- Strona pokoju podaje `gifSearchKey` w propsach `RoomScreen` (osobno od `RoomLiveConfig`); podglądy `/dev/*` podają własną wartość albo `null`.
- CI: w jobach `smoke` i `e2e` po linii klucza podpisu jedna linia dopisuje stały udawany `KLIPY_API_KEY` do `.dev.vars` (nie sekret; KLIPY w CI nie jest wołany).

#### 4. Testy

**File**: `tests/unit/chat.test.ts`, `tests/unit/gifs.test.ts` (nowy), `tests/unit/live-sync-server.test.ts`, `scripts/smoke.mjs`, `tests/e2e/support/live.ts`

**Intent**: Granice z decyzji 3 (tylko hosty KLIPY) i z FR-028 (nic w logach), nie z kodu.

**Contract**:

- `isKlipyMediaUrl`: przyjmuje adresy z trzech hostów; odrzuca `http:`, `klipy.com`, `api.klipy.com`, `static.klipy.com.evil.example`, `evilstatic.klipy.com`, login w adresie, port, adres niekanoniczny (wielkie litery hosta, `..`, kodowanie), 513 znaków, nie-ciąg.
- `bodyChatContent`: tekst jak dotąd; gif z opisem i bez; opis za długi albo ze znakiem sterującym daje `""`; gif z obcym hostem `https`, tekst i gif naraz, żadne, `"constructor"` odrzucone.
- `parseChatMessage`: gif z obcym hostem i nick spoza listy odpadają.
- `sendChat` z gifem: koperta otwiera się z `gif` i `title`; linia logu bez adresu, opisu, nicku, klucza i podpisu.
- Smoke, obok kroków czatu:
  - „Ola sends a gif”: 200 `{"ok":true}` (stały adres `https://static.klipy.com/…`, którego Worker nie pobiera);
  - „a gif from another host is refused”: 400 `invalid_body`;
  - „a chat message with text and a gif is refused”: 400 `invalid_body`;
  - „the room page carries the gif search key”: `gifSearchKey` o kształcie klucza w propsach strony gościa.
- `live.ts`: `heardGif(url, nick)` pod Fazę 3.

### Success Criteria:

#### Automated Verification:

- Bramka lokalna przechodzi: `npm run lint`, `npx astro check`, `npm test`, `npm run build`
- Push do draft PR (za zgodą Karola): CI zielone; nowe kroki smoke gifa i klucza przechodzą
- Próbny alarm: `bodyChatContent` przyjmuje gifa z dowolnego hosta `https`; czerwone tylko przypadek obcego hosta w teście `bodyChatContent` i krok smoke „a gif from another host is refused”; po `git revert` CI zielone

**Implementation Note**: Próbny alarm według `test-plan.md` §6.5: tymczasowo `bodyChatContent` sprawdza adres gifa tylko po `https:` zamiast przez `isKlipyMediaUrl` (sama `isKlipyMediaUrl` i jej testy zostają). Przewidywanie w opisie commita: w `ci` czerwony tylko przypadek obcego hosta w teście `bodyChatContent`, w `smoke` tylko krok „a gif from another host is refused”; `db`, `e2e`, reszta testów jednostkowych i smoke zielone. Wynik w rejestrze §6.5.

---

## Faza 3: Gify na ekranach

### Overview

Najpierw galeria wariantów (telefon w prawdziwej wielkości, laptop 1:1, strona HTML z „Co oceniasz” w Chrome Karola), Karol wybiera. Potem wyszukiwarka, gif w czacie, podglądy `/dev` i e2e z udawanym KLIPY.

### Changes Required:

#### 1. Galeria wariantów

**File**: tymczasowe stany w `src/pages/dev/room-window.astro` i `src/pages/dev/room-states.astro`, strona galerii w scratchpadzie

**Intent**: Karol wybiera, jak wygląda wyszukiwarka i gif w czacie, zanim powstanie gotowy ekran.

**Contract**: Pokazane na telefonie (panel T2) i na laptopie (L3), z próbkami obrazków z naszej domeny (`public/`, bez sieci). Do wyboru:

- wyszukiwarka: W1 zamiast listy wiadomości w tym samym panelu (pole, „Szukaj”, siatka 3 kolumny, „Wróć do czatu”) albo W2 nad polem wiadomości jako pasek z poziomą siatką;
- gif w czacie: wysokość obrazka (np. 96 i 128 px) i miejsce nicku (nad obrazkiem albo obok);
- dymek zwiniętego czatu: miniatura gifa albo tekst „<nick>: gif”;
- stany wyszukiwarki: puste, szukanie, wyniki, brak wyników, limit/awaria.

Wybór trafia do `change.md`, warianty niewybrane znikają przed commitem.

#### 2. Zapytanie do KLIPY

**File**: `src/lib/rooms/gifs.ts`, `src/components/room/useGifSearch.ts` (nowy)

**Intent**: Zapytanie z najostrzejszym filtrem i bez niczego z gry; wyniki w kolejności KLIPY.

**Contract**:

- `gifSearchUrl(key, query)`: `${KLIPY_API_ORIGIN}/api/v1/${encodeURIComponent(key)}/gifs/search` z `q` (słowo po `trim`, do 50 znaków), `per_page=12`, `page=1`, `content_filter=high`, `locale=pl`, `format_filter=webp`; nigdy `customer_id`.
- `parseGifResults(json): GifResult[] | null`: `null` dla złego kształtu; z `data.data` w kolejności wyniki `type === "gif"` z `file.xs.webp.url` i `file.sm.webp.url` przechodzącymi `isKlipyMediaUrl`, plus `title`. `GifResult = { preview: string; gif: string; title: string }`.
- Hak: `fetch(gifSearchUrl(...), { credentials: "omit", referrerPolicy: "no-referrer", signal: AbortSignal.timeout(8000) })`; stany `idle | loading | results | empty | failed`; 429 i inne błędy to `failed` z tekstem limitu albo awarii; to samo słowo drugi raz nie pyta ponownie. Log tylko przez `logEvent` z `op: "gif_search"`, `status`, `errName`: nigdy słowa ani adresu. Fetch podstawiany w testach.
- **Prawdziwe zapytanie (przegląd planu, F1), zanim powstanie ekran:** skrypt w scratchpadzie (poza repo) sam czyta `KLIPY_API_KEY` z lokalnego `.dev.vars` i nigdy go nie wypisuje, robi jedno wyszukiwanie przez `gifSearchUrl` (1–2 z 100 zapytań/h) i wypisuje same wyniki sprawdzeń: odpowiedź 200; klucz pasuje do wzoru z `getGifSearchKey`; `parseGifResults` niepuste; każdy `gif` i `preview` przechodzi `isKlipyMediaUrl` (hosty i postać kanoniczna). Gdy coś nie pasuje, najpierw poprawka kontraktu (`gifs.ts`, wzór klucza), potem ekran. Przycięta prawdziwa odpowiedź (same adresy, opisy i pola potrzebne `parseGifResults`) staje się danymi `klipy.ts`.

#### 3. Komponent czatu

**File**: `src/components/room/RoomChat.tsx`, w razie potrzeby nowy `src/components/room/GifPicker.tsx`

**Intent**: Gif w czacie i wyszukiwarka w wybranym układzie, z tokenów i klocków `src/components/ui`, bez nowej zależności.

**Contract**:

- Przycisk „GIF” przy polu wiadomości tylko z `gifSearchKey`; rozwija wyszukiwarkę (region, nie okno modalne), fokus na jej pole.
- Pole: `placeholder="Search KLIPY"`, etykieta `sr-only` „Szukaj gifa”, `enterKeyHint="search"`, „Szukaj”.
- Wyniki: `<button>` z `<img src={preview} alt={title || "gif"} referrerPolicy="no-referrer" loading="lazy">`, etykieta „Wyślij gifa: <opis>”. Dotknięcie wysyła `{ gif, title }`, zamyka wyszukiwarkę i oddaje fokus polu wiadomości (`focus.ts`), z tą samą pauzą `CHAT_COOLDOWN_MS` co wiadomość; w pauzie wyniki mają `aria-disabled`. Odmowa jak przy wiadomości (`FieldError`).
- Gif w czacie: nick w kolorze gracza i `<img src={gif} alt={title || "gif"} referrerPolicy="no-referrer">` o stałej wysokości, więc lista nie skacze. Region `aria-live` mówi „<nick>: gif <opis>”. Dymek według wyboru.
- `ChatPreview` dostaje stany wyszukiwarki (otwarta, słowo, wyniki, brak, błąd).

#### 4. Ekran pokoju i podglądy

**File**: `src/components/room/RoomScreen.tsx`, `src/pages/dev/room-states.astro`, `src/pages/dev/room-window.astro`, `public/` (próbki)

**Intent**: Gify w każdym widoku z czatem; nowe stany w podglądach według AGENTS.md (UI).

**Contract**:

- `RoomScreen` wysyła `{ text }` albo `{ gif, title }` przez `sendRoomAction(roomId, "chat", …)`.
- `room-states.astro`, grupa czatu: gif w liście, długi opis, wyszukiwarka pusta, wyniki, brak wyników, limit. `room-window.astro`: gość w głosowaniu z gifem, host na odsłonie z otwartą wyszukiwarką. Próbki obrazków w `public/` (kilka KB, z naszej domeny).

#### 5. E2E

**File**: `tests/e2e/chat.spec.ts`, `tests/e2e/support/klipy.ts` (nowy), `context/foundation/test-plan.md`

**Intent**: Prawdziwy gif w przeglądarce u trzech graczy, bez wołania KLIPY i bez nowego pokoju (budżet gier konta).

**Contract**:

- `klipy.ts`: `context.route` na `https://api.klipy.com/**` (przycięta prawdziwa odpowiedź z Fazy 3 #2, adresy na `static.klipy.com`, z nagłówkiem `access-control-allow-origin: *`, bo strona na `http://localhost` pyta inny origin, a `route.fulfill` przechodzi sprawdzenie CORS; zapytanie z `credentials: "omit"` jest proste, bez preflightu) i `https://static.klipy.com/**` (mały obrazek z testu); zapamiętuje zapytania.
- W istniejącym teście `chat.spec.ts` (oba projekty), w poczekalni: A otwiera „GIF”, placeholder to „Search KLIPY”, szuka słowa, wybiera drugi wynik; gif z adresem i opisem z odpowiedzi jest u hosta, A i B.
- Zapytanie do KLIPY: `content_filter=high`, brak `customer_id`, brak nicku i id pokoju w adresie, brak nagłówka `Referer` (czytany z `request.allHeaders()`, bo `request.headers()` nie zwraca wszystkich).
- Odpowiedź 429: wyszukiwarka pokazuje komunikat limitu, a wiadomość tekstowa dalej dochodzi.
- Usunięcie B zabiera też jego gifa (B wysyła gifa przed usunięciem).
- Nowy wzór w test-plan §6.4: `context.route` na obcy host.

### Success Criteria:

#### Automated Verification:

- Bramka lokalna przechodzi: `npm run lint`, `npx astro check`, `npm test`, `npm run build`
- Push do draft PR (za zgodą Karola): CI zielone; `chat.spec.ts` z gifami przechodzi w `chromium` i `phone`, siatka regresji e2e zielona
- Próbny alarm: zapytanie do KLIPY bez `content_filter`; czerwone tylko test jednostkowy zapytania i asercja filtra w `chat.spec.ts`, w obu projektach; po `git revert` CI zielone
- Prawdziwe wyszukiwanie KLIPY kluczem testowym z `.dev.vars` (skrypt w scratchpadzie, klucz niewypisany): 200, klucz pasuje do wzoru, `parseGifResults` niepuste, wszystkie adresy przechodzą `isKlipyMediaUrl`; dane `klipy.ts` z tej odpowiedzi

#### Manual Verification:

- Karol wybiera układ wyszukiwarki, wygląd gifa w czacie i dymek z galerii zrzutów (wybór w `change.md`)
- Karol akceptuje gotowe ekrany na zrzutach (telefon w prawdziwej wielkości, laptop 1:1): wyszukiwarka pusta, wyniki, brak wyników, limit, gif w czacie w poczekalni, w głosowaniu i na odsłonie, dymek

**Implementation Note**: Przed Fazą 3 Karol zakłada konto KLIPY na mailu gry (panel: najostrzejszy filtr, reklamy wyłączone) i sam dopisuje `KLIPY_API_KEY=<klucz testowy>` do lokalnego `.dev.vars`; klucz nie przechodzi przez sesję. Prawdziwe wyszukiwanie (#2) idzie jako pierwsze, przed galerią. Serwer dev tylko do podglądów `/dev/*` bez sieci, zatrzymany po pracy. Próbny alarm: tymczasowo `gifSearchUrl` bez `content_filter` (przewidywanie: czerwone test jednostkowy zapytania w `ci` i asercja filtra w `e2e`, w obu projektach; reszta zielona). Wynik w rejestrze §6.4.

---

## Faza 4: Dokumenty i wdrożenie

### Overview

Słownik, AGENTS.md, test-plan, deploy-plan, development.md, roadmapa i notatki zmiany. Potem sekret KLIPY (konto z Fazy 3) przed scaleniem, scalenie przez Karola, smoke na produkcji, krótkie sprawdzenie w przeglądarce od razu, przeklikanie, nagranie i wniosek o klucz produkcyjny.

### Changes Required:

#### 1. Słownik i zasady

**File**: `context/domain/glossary.md`, `AGENTS.md`, `docs/development.md`

**Intent**: Nowe słowa i zasady tam, gdzie agent ich szuka.

**Contract**:

- Słownik: nowy wpis „gif” (obrazek z wyszukiwarki KLIPY wysłany na czat; adres tylko z hostów KLIPY, opis do 100 znaków; jak wiadomość: z nickiem, podpisany, nic nie zapisuje; kod: `ChatGif`, `isKlipyMediaUrl`, `KLIPY_MEDIA_HOSTS`, `GifPicker`, `KLIPY_API_KEY`; unikać: „naklejka”, „emotka”). „Czat” i „wiadomość na czacie”: wiadomość to tekst albo gif.
- `AGENTS.md`, Hard Rules: słowo wyszukiwania gifa i adres gifa jak treść czatu (nigdy w bazie, logu, pamięci przeglądarki ani adresie gry); KLIPY tylko z przeglądarki, nigdy przez Workera; do KLIPY nic z gry (nick, pokój, `customer_id`); `KLIPY_API_KEY` tylko przez `astro:env/server`, w sekrecie Workera i `.dev.vars`, nigdy w repo (do przeglądarki trafia z założenia). Zdanie o CSP: nowy obcy adres to wpis w `security-headers.ts`.
- `development.md`: linia `KLIPY_API_KEY` w lokalnym `.dev.vars`, udawany klucz w CI.

#### 2. Test-plan, deploy-plan, roadmapa, notatki

**File**: `context/foundation/test-plan.md`, `context/deployment/deploy-plan.md`, `context/foundation/roadmap.md`, `context/changes/room-chat-gifs/change.md`, `context/changes/security-hardening/` (jeśli jeszcze nie w archiwum: tylko notka, że CSP zamknęła ta zmiana)

**Intent**: Wzory testów, wyniki alarmów i procedura klucza tam, gdzie następna zmiana ich szuka.

**Contract**:

- `test-plan.md`: §6.4 wzór `context.route` na obcy host i wyniki alarmów Faz 1 i 3; §6.5 nowa suma kroków smoke i wynik alarmu Fazy 2; Freshness Ledger.
- `deploy-plan.md`, „Sekrety Workera”: `KLIPY_API_KEY` (konto KLIPY na mailu gry, panel: najostrzejszy filtr, reklamy wyłączone; Karol wpisuje klucz sam przez `npx wrangler secret put KLIPY_API_KEY`, za zgodą; kolejność „sekret, potem kod”; wymiana na klucz produkcyjny tym samym poleceniem; po wymianie nic nie trzeba odświeżać, strona bierze klucz przy każdym wczytaniu).
- `roadmap.md`: S-24 `in-progress`.
- `change.md`: decyzje 4–7 i wybór wyglądu; fakty sprawdzone przy zakładaniu klucza (czy panel nadpisuje `content_filter`, czy reklamy są wyłączone, czy klucz produkcyjny jest bezpłatny).

#### 3. Wdrożenie

**File**: — (polecenia i kroki Karola)

**Intent**: Klucz przed kodem, potem scalenie, sprawdzenie na produkcji i wniosek o klucz bez limitu.

**Contract**:

- Karol: klucz testowy z konta KLIPY założonego przed Fazą 3 (w panelu najostrzejszy filtr i wyłączone reklamy, już w lokalnym `.dev.vars`); `! npx wrangler secret put KLIPY_API_KEY` (wpisuje klucz sam, za zgodą); `npx wrangler secret list` pokazuje nazwę.
- PR gotowy (nie draft) → scala Karol (`! gh pr merge <n> --merge`) → Workers Builds → smoke na produkcji (za zgodą) → `curl -sI` strony głównej na produkcji pokazuje CSP z adresem `wss://` projektu Supabase.
- Zaraz po smoke, nie na wieczorze (przegląd planu, F4): Karol na laptopie i telefonie, około 5 minut, jeden pokój testowy: emotka dochodzi do drugiego ekranu, jedno wyszukiwanie i jeden gif dochodzą, konsola Chrome na laptopie bez błędów „Content Security Policy”. Smoke (Node) i `curl` CSP nie egzekwują, a e2e sprawdza ją tylko na `http://localhost` z `ws://`.
- Gdy smoke pokaże brak klucza na stronie: najpierw ponowne `wrangler secret put` (za zgodą), dopiero potem `npx wrangler rollback` (za zgodą).
- Karol: nagranie ekranu (do 25 MB) z wyszukiwania i wysłania gifa na produkcji → wniosek o klucz produkcyjny w panelu KLIPY → po zgodzie `wrangler secret put` z nowym kluczem (za zgodą).
- Epilog osobnym PR-em: SHA w Progress, wpis w `deploy-plan.md`.

### Success Criteria:

#### Automated Verification:

- `npx prettier --check` dla zmienionych plików `.md` przechodzi
- `KLIPY_API_KEY` wgrany na produkcję przed scaleniem (Karol, `wrangler secret put` za zgodą), `npx wrangler secret list` pokazuje nazwę
- Po scaleniu: Workers Builds zielony, na `main` zielone `ci`, `smoke`, `db`, `e2e`
- Smoke na produkcji zielony, z krokami gifa, klucza i CSP (za zgodą Karola)

#### Manual Verification:

- Karol zaraz po smoke na produkcji (około 5 min, laptop i telefon, jeden pokój testowy): emotka dochodzi, jedno wyszukiwanie i jeden gif dochodzą, konsola Chrome bez błędów „Content Security Policy”
- Karol na telefonie i laptopie: wyszukiwanie słowem, gif dochodzi do wszystkich z nickiem w poczekalni, w głosowaniu, na odsłonie i na końcu wieczoru; czat tekstowy i emotki działają jak dotąd; po odświeżeniu gifów nie ma; po usunięciu gracza jego gify znikają; słowa dla dorosłych nie dają wyników dla dorosłych
- Karol nagrywa ekran i składa wniosek o klucz produkcyjny KLIPY; po zgodzie klucz podmieniony
- Na wieczorze z ekipą: gify nie zasłaniają pytania ani guzików głosu, limit nie skończył się w trakcie (albo komunikat był zrozumiały)

**Implementation Note**: PR NIE scalać przed `wrangler secret put KLIPY_API_KEY`: smoke na produkcji sprawdza klucz na stronie pokoju. Klucz wpisuje Karol sam (nie przechodzi przez sesję). Wdrażać poza wieczorem gry.

---

## Testing Strategy

### Unit Tests:

- Adres gifa: trzy hosty KLIPY przechodzą; `http:`, inne hosty i podróbki nazw, login, port, postać niekanoniczna, 513 znaków i nie-ciąg odpadają.
- Treść: tekst jak dotąd, gif z opisem i bez, opis zły daje `""`, tekst i gif naraz oraz żadne odpadają; `parseChatMessage` obu postaci.
- Nadanie: koperta z gifem się otwiera; log bez adresu, opisu, nicku, klucza i podpisu.
- Zapytanie: `content_filter=high`, `locale=pl`, `per_page=12`, bez `customer_id`; klucz zakodowany w ścieżce; `parseGifResults` zachowuje kolejność, pomija wynik bez adresów KLIPY i reklamę, zły kształt daje `null`.
- CSP: dokładny ciąg dla `https`, `http` z portem, `null`.

### Integration Tests:

- Całe e2e z CSP w przeglądarce (Faza 1): Realtime, emotki i czat dalej działają.
- `chat.spec.ts`: gif przez udawane KLIPY u trzech graczy w obu projektach, zapytanie bez niczego z gry i z filtrem, 429 z komunikatem, gif usuniętego znika.
- Smoke: gif 200, obcy host 400, tekst i gif naraz 400, klucz na stronie, CSP w nagłówkach.

### Manual Testing Steps:

1. Telefon i laptop w jednej grze testowej: gif z każdej strony w poczekalni, w głosowaniu, na odsłonie i na końcu wieczoru.
2. Słowo, które powinno dać treści dla dorosłych: wyniki bez nich.
3. Odświeżenie: gifów nie ma, nowe dochodzą. Usunięcie gracza: jego gify znikają.
4. Klawiatura prawdziwego telefonu przy polu „Search KLIPY”.

## Performance Considerations

Wyszukiwanie to 12 miniatur `xs` webp (około 0,4 MB) z serwerów KLIPY, gif w czacie `sm` webp (mediana 117 KB) u każdego gracza; Worker nie dotyka mediów. Koperta z adresem (około 100 znaków) i opisem mieści się w limicie 4096 znaków. Klucz testowy: 100 zapytań/h na całą grę, tylko po „Szukaj”.

## Migration Notes

Bez migracji bazy. Nowy sekret Workera `KLIPY_API_KEY` wchodzi przed scaleniem. Wycofanie: `npx wrangler rollback` (za zgodą) przywraca kod bez gifów i CSP; sekret może zostać.

## References

- Research: `context/changes/room-chat-gifs/research.md`
- Plan czatu S-23: `context/changes/room-chat/plan.md`
- Trasa czatu: `src/pages/api/rooms/[id]/chat.ts:25-57`
- Moduł czatu: `src/lib/rooms/chat.ts:20-107`
- Nadanie: `src/lib/live-sync/server.ts:137-172`
- Nagłówki: `src/lib/security-headers.ts:8-20`, `src/middleware.ts:10-38`
- KLIPY: `docs.klipy.com/gifs-api/gifs-search-api.md`, `integration-requirements.md`, `attribution.md`, `network-requirements.md` (stan 2026-11-17)

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: Content-Security-Policy

#### Automated

- [x] 1.1 Bramka lokalna przechodzi: `npm run lint`, `npx astro check`, `npm test`, `npm run build` — 18404e7
- [x] 1.2 Draft PR do `main` (push za zgodą Karola): CI zielone we wszystkich jobach; całe e2e (Realtime, emotki, czat) przechodzi z CSP w przeglądarce, krok smoke nagłówków przechodzi — 18404e7
- [x] 1.3 Próbny alarm: middleware składa CSP bez adresu Supabase; czerwone tylko krok smoke nagłówków i specs e2e, które czekają na temat graczy albo dzwonek; po `git revert` CI zielone — ecb531b

#### Manual

- [x] 1.4 Na serwerze dev (`npx astro dev`, tylko `/dev/*`) konsola Chrome na `/dev/room-states` i `/dev/room-window` nie pokazuje naruszeń CSP poza paskiem dewelopera Astro — 18404e7

### Phase 2: Gif na serwerze

#### Automated

- [ ] 2.1 Bramka lokalna przechodzi: `npm run lint`, `npx astro check`, `npm test`, `npm run build`
- [ ] 2.2 Push do draft PR (za zgodą Karola): CI zielone; nowe kroki smoke gifa i klucza przechodzą
- [ ] 2.3 Próbny alarm: `bodyChatContent` przyjmuje gifa z dowolnego hosta `https`; czerwone tylko przypadek obcego hosta w teście `bodyChatContent` i krok smoke „a gif from another host is refused”; po `git revert` CI zielone

### Phase 3: Gify na ekranach

#### Automated

- [ ] 3.1 Bramka lokalna przechodzi: `npm run lint`, `npx astro check`, `npm test`, `npm run build`
- [ ] 3.2 Push do draft PR (za zgodą Karola): CI zielone; `chat.spec.ts` z gifami przechodzi w `chromium` i `phone`, siatka regresji e2e zielona
- [ ] 3.3 Próbny alarm: zapytanie do KLIPY bez `content_filter`; czerwone tylko test jednostkowy zapytania i asercja filtra w `chat.spec.ts`, w obu projektach; po `git revert` CI zielone
- [ ] 3.4 Prawdziwe wyszukiwanie KLIPY kluczem testowym z `.dev.vars` (skrypt w scratchpadzie, klucz niewypisany): 200, klucz pasuje do wzoru, `parseGifResults` niepuste, wszystkie adresy przechodzą `isKlipyMediaUrl`; dane `klipy.ts` z tej odpowiedzi

#### Manual

- [ ] 3.5 Karol wybiera układ wyszukiwarki, wygląd gifa w czacie i dymek z galerii zrzutów (wybór w `change.md`)
- [ ] 3.6 Karol akceptuje gotowe ekrany na zrzutach (telefon w prawdziwej wielkości, laptop 1:1): wyszukiwarka pusta, wyniki, brak wyników, limit, gif w czacie w poczekalni, w głosowaniu i na odsłonie, dymek

### Phase 4: Dokumenty i wdrożenie

#### Automated

- [ ] 4.1 `npx prettier --check` dla zmienionych plików `.md` przechodzi
- [ ] 4.2 `KLIPY_API_KEY` wgrany na produkcję przed scaleniem (Karol, `wrangler secret put` za zgodą), `npx wrangler secret list` pokazuje nazwę
- [ ] 4.3 Po scaleniu: Workers Builds zielony, na `main` zielone `ci`, `smoke`, `db`, `e2e`
- [ ] 4.4 Smoke na produkcji zielony, z krokami gifa, klucza i CSP (za zgodą Karola)

#### Manual

- [ ] 4.5 Karol zaraz po smoke na produkcji (około 5 min, laptop i telefon, jeden pokój testowy): emotka dochodzi, jedno wyszukiwanie i jeden gif dochodzą, konsola Chrome bez błędów „Content Security Policy”
- [ ] 4.6 Karol na telefonie i laptopie: wyszukiwanie słowem, gif dochodzi do wszystkich z nickiem w poczekalni, w głosowaniu, na odsłonie i na końcu wieczoru; czat tekstowy i emotki działają jak dotąd; po odświeżeniu gifów nie ma; po usunięciu gracza jego gify znikają; słowa dla dorosłych nie dają wyników dla dorosłych
- [ ] 4.7 Karol nagrywa ekran i składa wniosek o klucz produkcyjny KLIPY; po zgodzie klucz podmieniony
- [ ] 4.8 Na wieczorze z ekipą: gify nie zasłaniają pytania ani guzików głosu, limit nie skończył się w trakcie (albo komunikat był zrozumiały)
