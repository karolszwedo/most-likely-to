---
date: 2026-11-17T10:54:45+0100
researcher: Claude (Opus 5.5)
git_commit: 8bee529b1a1fe0b26756fea92d2eaa8b80bbcb11
branch: room-chat
repository: most-likely-to
topic: "Czat w pokoju: krótkie wiadomości z nickiem, bez zapisu, z podpisem serwera (S-23, FR-028)"
tags: [research, chat, live-sync, realtime, emotes, signing, web-crypto]
status: complete
last_updated: 2026-11-17
last_updated_by: Claude (Opus 5.5)
---

# Research: Czat w pokoju: krótkie wiadomości z nickiem, bez zapisu, z podpisem serwera

**Date**: 2026-11-17T10:54:45+0100
**Researcher**: Claude (Opus 5.5)
**Git Commit**: 8bee529b1a1fe0b26756fea92d2eaa8b80bbcb11
**Branch**: room-chat
**Repository**: most-likely-to

## Research Question

Jak zbudować czat pokoju z S-23 (PRD FR-028 i NFR o czacie z 2026-11-17) na obecnej grze: krótkie wiadomości od każdego gracza, widoczne na żywo z nickiem nadawcy w poczekalni, w grze i na końcu wieczoru; nic nie zostaje w bazie ani w logach; nikt nie napisze z cudzym nickiem (podpis serwera W-E na każdej wiadomości kanału, także emotce); usunięty gracz przestaje widzieć i pisać. Co da się wziąć z emotek, co trzeba dodać i gdzie są granice.

## Summary

- **Droga wiadomości jest gotowa w emotkach.** Ekran wysyła `POST /api/rooms/<id>/emote`, Worker sprawdza gracza przez `room_lobby` i nadaje treść z nickiem na temat graczy `live-players:<klucz kanału>` przez REST Realtime, niczego nie zapisując (`src/pages/api/rooms/[id]/emote.ts:9-47`, `src/lib/live-sync/server.ts:81-97`). Czat może iść tą samą drogą: nowa trasa, nowe zdarzenie na tym samym temacie, ten sam odbiór w `useRoomState.ts:427-473`. Usunięty gracz traci klucz kanału przy usunięciu (glosariusz `klucz kanału`, `context/domain/glossary.md:51`), więc przestaje widzieć i pisać bez nowej pracy.
- **Brakuje podpisu.** Dziś gracz, który zna klucz kanału, nadaje na temat graczy z pominięciem Workera i z cudzym nickiem, a ekran hosta to pokazuje; e2e sprawdza to jako kontrolę nadawcy (`tests/e2e/players-channel.spec.ts:125-132`). Przy czacie to staje się podszyciem w treści, więc W-E (`context/changes/players-only-live-channel/research.md:111-121`) musi wejść przed pierwszą wiadomością, a ten krok e2e odwraca się: podrobiona wiadomość ma nie dotrzeć na ekran.
- **Algorytm podpisu: ECDSA P-256** w `crypto.subtle` po obu stronach. Ed25519 działa w ostatnich dwóch wersjach głównych przeglądarek (Chrome i Edge od 137, Firefox od 129, Safari od 17), ale Samsung Internet ma go dopiero od 30, a w IX 2026 część użytkowników była jeszcze na 29 ([caniuse](https://caniuse.com/mdn-api_subtlecrypto_verify_ed25519)). ECDSA P-256 jest w każdej przeglądarce od 2020 ([MDN](https://developer.mozilla.org/en-US/docs/Web/API/SubtleCrypto/sign)) i w Workerach bez flagi ([Cloudflare](https://developers.cloudflare.com/workers/runtime-apis/web-crypto/)).
- **Jeden nowy sekret Workera**: prywatny klucz podpisu (JWK z `d`); klucz publiczny Worker wylicza z niego i podaje ekranom w propsach strony, jak dziś adres i klucz Realtime (`src/pages/r/[id].astro:72,92`). Produkcja: `npx wrangler secret put` (za zgodą) przed scaleniem kodu. CI: klucz jednorazowy dopisany do `.dev.vars` w jobach `smoke` i `e2e` (`.github/workflows/ci.yml:55-59,136-140`).
- **Podpis nie hamuje zalewu.** Klucz kanału i publiczny klucz Supabase dalej pozwalają nadawać na temat graczy; podpis tylko odrzuca podrobioną treść. Limit Realtime to 100 wiadomości/s na cały projekt, a każda wiadomość liczy się jako 1 + liczba słuchaczy ([Supabase](https://supabase.com/docs/guides/realtime/limits), [usage](https://supabase.com/docs/guides/platform/manage-your-usage/realtime-messages)). Pauza między wiadomościami zostaje po stronie ekranu, jak przy emotkach (`src/lib/rooms/emotes.ts:23-27`); serwerowy limit nie ma gdzie żyć bez zapisu (Worker nie ma ogranicznika, `context/changes/security-hardening/plan.md:58`).
- **Decyzje Karola przed planem:** długość wiadomości i pauza (roadmapa S-23, Unknowns) oraz miejsce czatu na telefonie (warianty na zrzutach). Reszta to technika, rekomendacje niżej.

## Detailed Findings

### 1. Wysyłka: trasa emotki jako wzór

- Kolejność kontroli w trasie emotki (`src/pages/api/rooms/[id]/emote.ts:21-47`): `refuseForeignPost` (415/403, `src/lib/rooms/json-route.ts:46-57`) → id pokoju → `readJsonBody` (400 `invalid_body`, limit 4096 bajtów, `json-route.ts:19,90-149`) → walidacja treści → ciasteczko gracza albo sesja hosta → `roomLobby` → `null` = 404 jak brak pokoju → `broadcastEmote` → `{ok: true}`.
- `roomLobby` zwraca nick gracza (`result.lobby.me`) i klucz kanału z bieżącego stanu (`emote.ts:44-46`), więc nick w wiadomości bierze serwer, nie ekran. Spóźniony czekający, odrzucony i ktoś obcy dostają `null` (komentarz `emote.ts:9-20`), co pasuje do PRD (Access Control, dodatek FR-028).
- `send` w `src/lib/live-sync/server.ts:24-53` nadaje przez `channel.httpSend` z limitem 5 s i przy błędzie loguje tylko `op`, `roomId`, `errName` i powód serwera z wyciętym kluczem; treści, nicku ani tematu nie loguje (`server.ts:38-46`; testy `tests/unit/live-sync-server.test.ts:97-125`).
- `actionAnswer` loguje jedną linię `{op, outcome, roomId}` (`json-route.ts:226-246`), a `logEvent` przepuszcza tylko pola z `LOG_FIELDS` (`src/lib/log.ts:13-27`: `op`, `route`, `step`, `roomId`, `status`, `code`, `errName`, `field`, `event`, `state`, `outcome`, `hasUser`, `hasPlayerCookie`), resztę odrzuca (`log.ts:38-50`). Treść czatu nie ma pola, w które mogłaby wpaść, o ile nie trafi do `code` (powód błędu).
- Ekran wysyła przez `sendRoomAction` (`src/components/room/room-actions.ts:69-94`); nowa akcja dopisuje się do unii `RoomAction` (`room-actions.ts:28-51`).

### 2. Odbiór i ekrany

- Klient Realtime jest jeden na ekran, tworzony leniwie (`src/components/room/useRoomState.ts:137-157`); adres i publiczny klucz przychodzą w propsach (`src/pages/r/[id].astro:72,92`, `src/lib/supabase.ts:34-39`). Gdy ich nie ma, ekran tylko odpytuje i emotek nie dostaje (`useRoomState.ts:26-31`), więc czatu też nie będzie.
- Klucz kanału przychodzi w stanie pokoju (`src/lib/rooms/shared.ts:150-166,217`, wzór `shared.ts:467-468`). Efekt emotek ma klucz w zależnościach: nowy klucz zamyka stary temat i słucha nowego, z ponawianiem 1–30 s po zamknięciu kanału (`useRoomState.ts:427-473`, uzasadnienie `:415-426`). Zdarzenie czatu dopisuje się obok `.on(EMOTE_EVENT)` (`useRoomState.ts:440-443`).
- Wiadomości wysłane przed subskrypcją, w trakcie zmiany tematu albo bez połączenia przepadają, bez historii (`useRoomState.ts:415-426`); to zgodne z decyzją „nic nie zapisujemy” i FR-028 (po odświeżeniu czat zaczyna się od tej chwili).
- `RoomScreen.tsx:149-185` sprawdza emotkę przez `parseEmoteMessage` (`src/lib/rooms/emotes.ts:58-63`): id z listy i nick z bieżącej listy graczy (`nicksRef`, `RoomScreen.tsx:183-185`). Ten drugi warunek przyda się czatowi także po dodaniu podpisu (wiadomość od gracza, którego już nie ma na liście, nie wyświetla się).
- Gdzie ekran pokazuje emotki: `RoomScreen.tsx:561-575`, poza `contentRef`, dla każdego stanu poza ekranem spóźnionego czekającego (`JoinWaiting.tsx:9`) i stronami usuniętego, obcego, przeniesionego i skasowanej gry (`[id].astro:93-124`). Ten sam zestaw pasuje do czatu z PRD.
- Układ: na telefonie (<lg) pasek emotek jest `fixed` przy dolnej krawędzi z odstępem `h-18` na końcu kolumny (`EmoteBar.tsx:24-32`), dymki `fixed right-4 bottom-20` (`EmoteBubbles.tsx:16,54`); od `lg` pasek stoi pod widokiem, od `xl` jako pionowa karta przy prawej krawędzi. Pasek hosta jest przyklejony dopiero od `lg` (`HostActions.tsx:120`). Ramka: `max-w-lg lg:max-w-6xl` (`room-frame.ts:9,31-38`).
- Fokus: `focusTitle` szuka pierwszego h1/h2 w `contentRef` (`RoomScreen.tsx:229-231`), dlatego pasek emotek nie ma nagłówka (`EmoteBar.tsx:46-51`). Czat poza `contentRef` z nagłówkiem nie przejmie fokusu tytułu, ale nagłówek w nim trzeba sprawdzić w planie.
- Klocki: w `src/components/ui` są `input`, `input-group` (z `InputGroupTextarea` i `InputGroupButton`, `input-group.tsx:147`), `textarea`, `field`, `button`, `card`, `badge`, `spinner`; nie ma `scroll-area`, `sheet`, `drawer` ani `dialog` (dodaje się je `npx shadcn@latest add`, AGENTS.md). Pole propozycji liczy znaki po normalizacji NFC i zwinięciu odstępów, w punktach kodowych, więc polska litera i emoji to jeden znak (`shared.ts:706-723`; limit pytania 90, `shared.ts:9`); licznik `aria-hidden`, kontrola przy wysyłce (`QuestionField.tsx:16-21,80-88`).
- Klawiatura telefonu: jedyne zabezpieczenie to `scroll-mb-44 lg:scroll-mb-0` przy propozycjach (`ProposalForm.tsx:187-189`); meta viewport to samo `width=device-width` (`Layout.astro:23`). Pole czatu przy dolnej krawędzi telefonu to nowe ryzyko (zasłonięcie przez klawiaturę), do sprawdzenia na prawdziwym telefonie.
- Podglądy: `ScreenPreview.emotes` (`RoomScreen.tsx:59-75,152-154`), grupa „Gra: emotki” w `src/pages/dev/room-states.astro:1897-1958` z danymi `threeEmotes`/`fiveEmotes` (`:206-218`), stany w `src/pages/dev/room-window.astro` (`Sample` `:245-268`, emotki `:754-779`, render `:953-972`). Podgląd nie otwiera sieci ani kanału (`useRoomState.ts:200,429`). Czat potrzebuje nowego pola w `ScreenPreview` i `Sample`.

### 3. Podpis serwera (W-E)

- Stan dziś: S-16 świadomie bez podpisu i bez serwerowej pauzy (`context/archive/2026-10-26-room-emotes/plan.md:55-66`); `players-only-live-channel` przyjął podszycie w pokoju do czasu czatu (`context/changes/players-only-live-channel/plan.md:9,45-48`). W-E: Worker podpisuje każdą wiadomość kanału, ekrany sprawdzają kluczem publicznym z propsów, w podpisanej treści temat i znacznik czasu (`players-only-live-channel/research.md:111-121`).
- Przeglądarki (źródła zewnętrzne, stan XI 2026): ECDSA P-256 w `crypto.subtle` jest „Baseline widely available” od I 2020 ([MDN sign](https://developer.mozilla.org/en-US/docs/Web/API/SubtleCrypto/sign)). Ed25519 jest domyślnie w Chrome i Edge 137 (V 2025), Firefox 129, Safari 17 ([Chrome](https://developer.chrome.com/docs/modern-web-guidance/guides/security/digital-signatures.md.txt), [MDN Fx129](https://developer.mozilla.org/docs/Mozilla/Firefox/Releases/129)); Samsung Internet 30–31 tak, 29 i starsze nie ([caniuse](https://caniuse.com/mdn-api_subtlecrypto_verify_ed25519)). iPhone na iOS 16 nie ma Ed25519. Wniosek: ECDSA P-256, bo NFR mówi o „dwóch ostatnich wersjach popularnych przeglądarek”, a telefon z Samsung Internet 29 albo iPhone na iOS 16 może się w ekipie trafić (wniosek, nie pomiar).
- Pułapki ECDSA w Web Crypto: podpis ma postać IEEE P1363 (r‖s, 64 bajty), nie DER z OpenSSL ani domyślnego `node:crypto`, więc Worker podpisuje przez `crypto.subtle`; `hash: "SHA-256"`; klucz publiczny do przeglądarki najprościej w formacie `raw` (65 bajtów, nieskompresowany) ([MDN importKey](https://developer.mozilla.org/en-US/docs/Web/API/SubtleCrypto/importKey)).
- Workers: ECDSA i standardowy Ed25519 są w tabeli Web Crypto, bez flagi zgodności ([Cloudflare](https://developers.cloudflare.com/workers/runtime-apis/web-crypto/)); `wrangler.jsonc:5-6` ma `compatibility_date: "2026-05-08"` i `nodejs_compat`. Podpis to dziesiątki mikrosekund przy limicie 10 ms CPU planu darmowego ([limits](https://developers.cloudflare.com/workers/platform/limits)); klucz importuje się raz i trzyma w zasięgu modułu.
- Wzorzec z zewnętrznych źródeł ([Stripe](https://docs.stripe.com/webhooks#verify-events), [RFC 9421](https://www.rfc-editor.org/rfc/rfc9421.html) §1.2, §7.2.2, §7.2.4):
  - podpisuje się dokładny ciąg JSON i wysyła go jako ciąg (`{payload: "<json>", sig}`), a odbiorca sprawdza ten ciąg, zanim go sparsuje; ponowna serializacja psuje podpis;
  - w podpisanej treści temat, zdarzenie i id pokoju, żeby wiadomości nie dało się przenieść do innego pokoju albo pod inne zdarzenie;
  - przed powtórką chronią znacznik czasu z oknem i id wiadomości do odrzucania duplikatów; sam znacznik czasu dopuszcza powtórkę w oknie;
  - zegary telefonów bywają przestawione o minuty, więc ekran liczy przesunięcie względem czasu serwera z propsów zamiast ufać `Date.now()`.
- Wniosek dla planu (nie z dokumentacji): powtórka podpisanej wiadomości kolegi w oknie czasu przez gracza z kluczem kanału pokaże ją drugi raz najwyżej ekranom, które nie widziały oryginału (np. po odświeżeniu); przy krótkim oknie to granica do przyjęcia, jak dziś podszycie emotek.

### 4. Sekret, środowisko i CI

- Zmienne serwera: dziś tylko `SUPABASE_URL` i `SUPABASE_KEY`, obie `envField.string({ context: "server", access: "secret", optional: true })` (`astro.config.mjs:17-22`), czytane wyłącznie przez `astro:env/server` (`src/lib/supabase.ts:3`, `src/lib/config-status.ts:1,14`). Żadna nie jest prawdziwym sekretem (klucz musi być `sb_publishable_…`, `src/lib/supabase-key.ts`). Klucz podpisu będzie pierwszym prawdziwym sekretem w repo.
- Brak zmiennej: build nie pada (`validateSecrets` domyślnie `false`); w czasie działania brak zmiennej wymaganej sprawia, że cały moduł `astro:env/server` rzuca błąd przy ładowaniu, więc padają wszystkie trasy, także Supabase (`node_modules/astro/dist/env/vite-plugin-env.js:86-88,131`). Klucz podpisu musi więc być `optional: true`, a trasy, które go potrzebują, odpowiadają 503 `service_unavailable`, gdy go nie ma (wzór `emote.ts:41-42`).
- Produkcja: `SUPABASE_*` są sekretami Workera, wgranymi raz przez `--secrets-file .dev.vars` (`context/deployment/deploy-plan.md:9,220-225`); dziś `.dev.vars` ma też `SMOKE_*` (`deploy-plan.md:12,271`), więc nowy sekret idzie przez `npx wrangler secret put <NAZWA>` (reguła „ask”: AGENTS.md, `.claude/settings.json:24,26`). Sekretów nie dodaje się jako zmiennych buildu Workers Builds (`deploy-plan.md:261`).
- CI: `ci` buduje z `secrets.SUPABASE_*` (`ci.yml:28-31`), a przy zmiennej opcjonalnej nie potrzebuje nic nowego. `smoke` i `e2e` piszą `.dev.vars` z lokalnego stosu (`ci.yml:55-59`, `:136-140`); tam dopisuje się jednorazowy klucz wygenerowany w jobie (`node`/`openssl`), z `::add-mask::` jak `ci.yml:147`. `playwright.config.ts` nie czyta pliku środowiska (`:13-14`), a `tests/e2e/support/env.ts:15-44` sprawdza tylko `SUPABASE_*`; `npm run smoke` czyta `.dev.vars` przez `--env-file-if-exists` (`package.json:16`). `docs/development.md:218-221` mówi, że `smoke`/`e2e` nie potrzebują sekretów, co dalej będzie prawdą (klucz jest generowany w jobie).
- Kolejność wdrożenia (wniosek): gdy ekrany zaczną odrzucać niepodpisane emotki, Worker bez sekretu przestanie móc je nadawać, więc najpierw `wrangler secret put`, potem scalenie kodu. `wrangler secret put` tworzy nową wersję Workera ze starym kodem, który sekretu nie używa.

### 5. Limity Realtime i zalew

- Plan darmowy Supabase: wiadomość do 256 KB, 100 wiadomości/s na projekt, 200 równoczesnych połączeń, 2 mln wiadomości miesięcznie; każda rozgłoszona wiadomość liczy się jako 1 + liczba subskrybentów ([limits](https://supabase.com/docs/guides/realtime/limits), [usage](https://supabase.com/docs/guides/platform/manage-your-usage/realtime-messages)). Dokumentacja nie mówi wprost o `httpSend`; kod Realtime sprawdza ścieżkę REST tym samym limitem zdarzeń na sekundę ([batch_broadcast.ex](https://github.com/supabase/realtime/blob/main/lib/realtime/tenants/batch_broadcast.ex)).
- S-16 policzył emotki: przy 20 graczach i pauzie 3 s wychodzi około 140 wiadomości/s w najgorszym przypadku, przyjęte (`context/archive/2026-10-26-room-emotes/plan.md:52-53,348-350`). Czat dodaje drugi strumień na tym samym temacie, więc pauza czatu i długość wiadomości to też budżet projektu, nie tylko wygoda.
- Ochrona po stronie serwera: Worker nie ma ogranicznika (W-1 odłożone do własnej domeny, `security-hardening/plan.md:58`, `change.md:29`); jedyny limit w bazie to 60 gier na godzinę. Gracz z kluczem i tak omija Workera, więc serwerowa pauza nie powstrzymałaby zalewu (to samo uzasadnienie co `emotes.ts:23-25`).

### 6. Testy i słownik

- Dziś: `tests/unit/emotes.test.ts` (lista, `bodyEmote`, `parseEmoteMessage`, `:16-88`), `tests/unit/live-sync-server.test.ts` (temat graczy, log bez treści, nicku i klucza, `:72-125`), `tests/e2e/emotes.spec.ts` (host + dwóch gości w osobnych kontekstach, odbiór po tekście dla czytnika „<nick>: <nazwa>”, pauza `aria-disabled`, oba projekty `chromium` i `phone`, `:27-112`), `tests/e2e/players-channel.spec.ts` (surowe klienty Realtime z `support/live.ts`; obcy na publicznym temacie nie dociera, po usunięciu K1 milknie, `:115-218`), smoke: 3 kroki emotek (`scripts/smoke.mjs:522-532`), razem 138 kroków (`context/foundation/test-plan.md:418`).
- Krok 1 `players-channel.spec.ts:125-132` dziś oczekuje, że podrobiona emotka z nickiem Oli DOCIERA na ekran hosta; plan tamtej zmiany zapowiada, że zmienia się razem z W-E (`players-only-live-channel/plan.md:45`). Po podpisie ten krok jest najmocniejszym testem zmiany: podrobiona emotka i wiadomość nie docierają, podpisana przez Workera dociera.
- Zasady z `test-plan.md` §6: wyrocznia z PRD albo decyzji Karola, nie z kodu (§6.1 `:142-144`); surowe klienty Realtime tylko z lokalnym adresem, `QUIET_MS` i `steady()` przed „nic nie przyszło”, klucze nigdy w komunikatach błędów (§6.4 `:369-376`); budżet gier e2e 37 z 60 na godzinę (`:384`); nowy krok smoke pilnujący zakazu wymaga próbnego alarmu (§6.5 `:440`); znane dziury jako `test.fails` „znana dziura <F> → <zmiana>” (§6.2 `:205-207`).
- Słownik: „wiadomość” i „czat” są dziś na liście słów, których nie używać dla emotki (`context/domain/glossary.md:49`); „czat” nie ma wpisu. Plan dopisuje wpisy (np. „czat”, „wiadomość na czacie”, „podpis serwera”), a emotka dalej nie jest wiadomością.

## Code References

- `src/pages/api/rooms/[id]/emote.ts:21-47` - trasa emotki: kontrole, `roomLobby`, nadanie, odpowiedź
- `src/lib/live-sync/server.ts:24-53,81-97` - `send` przez `httpSend`, log bez treści, `sendEmote` na temat graczy
- `src/lib/rooms/emotes.ts:23-31,58-63` - pauza 3 s po stronie ekranu, czas dymka, `parseEmoteMessage`
- `src/lib/rooms/json-route.ts:19,46-57,90-149,226-246` - limit 4096 bajtów, odmowy, `actionAnswer`
- `src/lib/log.ts:13-27,38-50` - dozwolone pola logu
- `src/components/room/useRoomState.ts:137-157,415-473` - klient Realtime, temat graczy, `.on(EMOTE_EVENT)`
- `src/components/room/RoomScreen.tsx:149-185,229-231,561-575` - odbiór emotek, fokus tytułu, miejsce paska
- `src/components/room/EmoteBar.tsx:24-32,46-51` - pasek na telefonie, brak nagłówka
- `src/lib/rooms/shared.ts:9,706-723` - limit pytania i liczenie znaków
- `src/pages/r/[id].astro:72,92` - publiczna konfiguracja Realtime w propsach
- `astro.config.mjs:17-22` - schemat zmiennych serwera
- `.github/workflows/ci.yml:28-31,55-59,136-140,147` - zmienne w jobach
- `tests/e2e/players-channel.spec.ts:125-132` - kontrola nadawcy, do odwrócenia
- `scripts/smoke.mjs:522-532` - kroki emotek

## Architecture Insights

- Gra ma jedną zasadę dla treści na żywo: stan zawsze z serwera, kanał niesie tylko to, czego nie trzeba przechowywać, a każda treść od gracza przechodzi przez Workera, który bierze nick ze stanu pokoju (`emote.ts:9-20`). Czat w tej zasadzie mieści się bez nowej tabeli.
- Klucz kanału to granica „gracze pokoju”, podpis to granica „ten gracz”. Pierwsza istnieje od `players-only-live-channel`, drugą dodaje ta zmiana; razem dają FR-028 bez kont gości (PRD Non-Goals).
- Tajny klucz podpisu daje tylko podrabianie wiadomości kanału, nie dostęp do bazy (`players-only-live-channel/research.md:116-121`), więc jego wyciek ma mały zasięg; nie może jednak trafić do propsów, logów ani repo (AGENTS.md: sekret nigdy w przeglądarce).

## Historical Context (from prior changes)

- `context/archive/2026-10-26-room-emotes/change.md:12-14` - Karol przyjął nick przy emotce mimo podszycia; bez tekstu i historii (wtedy).
- `context/archive/2026-10-26-room-emotes/plan.md:55-66` - bez podpisu, bez serwerowej pauzy, bez zapisu; `:52-53,348-350` budżet 100 wiadomości/s.
- `context/archive/2026-10-26-room-emotes/research.md:47-56,97-104` - odrzucona droga `realtime.send` z bazy, bo zostawia wiersz w bazie (to dalej obowiązuje przy czacie: „nic nie zapisujemy”).
- `context/changes/players-only-live-channel/plan.md:9,45-48,60` - W-E dopiero przy czacie; podszycie i zalew w pokoju przyjęte; emotki zgubione przy zmianie klucza przyjęte.
- `context/changes/players-only-live-channel/plan.md:28`, `plan-brief.md:66` - klucz kanału widać w logach API Supabase (przyjęte).
- `context/changes/security-hardening/plan.md:58,209-226` - brak ogranicznika w Workerze, limit treści 4096 bajtów.

## Related Research

- `context/changes/players-only-live-channel/research.md` - opcje W-A…W-E, kontynuacja W-A′
- `context/archive/2026-10-26-room-emotes/research.md` - droga emotek i budżet Realtime

## Open Questions

Decyzje Karola przed `/10x-plan` (produkt i wygląd):

1. **Długość wiadomości i pauza między wiadomościami jednego gracza.** Rekomendacja: do 200 znaków (liczonych jak w polu propozycji, polska litera i emoji = 1) i 2 s pauzy. 200 to dwa–trzy zdania i mieści się z zapasem w limicie 4096 bajtów; 2 s przy 20 piszących to około 10 wiadomości/s na pokój, czyli ponad 200 dostarczeń/s w najgorszym przypadku, więc to raczej górna granica niż cel (budżet Realtime, sekcja 5). **Rozstrzygnięte 2026-11-17 (Karol): tak, 200 znaków i 2 s pauzy.**
2. **Ile ostatnich wiadomości widać na ekranie i jak czat stoi na telefonie** (otwarte pole z ostatnimi wiadomościami nad paskiem emotek czy zwinięty przycisk „Czat” z licznikiem nowych). Rekomendacja: wybór na zrzutach, w planie faza ekranów z galerią wariantów; ostatnie wiadomości tylko w pamięci karty (nie `sessionStorage`), np. 50.

Technika (rozstrzyga sesja, do zapisania w planie):

- ECDSA P-256 w `crypto.subtle`; jeden sekret (prywatny JWK), klucz publiczny wyliczany w Workerze i podawany w propsach jako `raw`.
- Podpisany ciąg JSON z tematem, zdarzeniem, id pokoju, nickiem, treścią, czasem serwera i losowym id wiadomości; okno świeżości liczone od czasu serwera z propsów; odrzucanie duplikatów po id.
- Emotki podpisane w tej samej fazie co wiadomości; krok 1 `players-channel.spec.ts` odwrócony; próbny alarm na odrzuceniu podrobionej wiadomości.
- Sekret `optional: true`; bez niego trasy emotki i czatu odpowiadają 503; kolejność wdrożenia: `wrangler secret put` (zgoda), potem scalenie.
- Do sprawdzenia w planie: zachowanie klawiatury telefonu przy polu czatu (meta viewport `interactive-widget`?), nagłówek czatu a `focusTitle`, czytnik ekranu (live region nie może zalać czytnika, por. S-16 impl-review F3).
