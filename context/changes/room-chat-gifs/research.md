---
date: 2026-11-17T19:18:08+01:00
researcher: Claude (Opus 5.5)
git_commit: 06f2e997b2d07aba109ec19d4e2a605c116b5123
branch: room-chat-gifs
repository: most-likely-to
topic: "Gify w czacie pokoju: dostawca, droga gifa, filtr treści dla dorosłych, prywatność (S-24, FR-028)"
tags: [research, chat, gifs, klipy, giphy, csp, live-sync, privacy]
status: complete
last_updated: 2026-11-17
last_updated_by: Claude (Opus 5.5)
---

# Research: Gify w czacie pokoju

**Date**: 2026-11-17T19:18:08+01:00
**Researcher**: Claude (Opus 5.5)
**Git Commit**: 06f2e997b2d07aba109ec19d4e2a605c116b5123
**Branch**: room-chat-gifs
**Repository**: most-likely-to

## Research Question

Jak dodać do czatu pokoju (S-23, na produkcji od PR #77 i #79) gify z wyszukiwarki zewnętrznego dostawcy, zgodnie z S-24 i PRD FR-028: wyszukiwarka zawsze odfiltrowuje treści dla dorosłych, dostawca nie dostaje nicku gracza ani pokoju, gify jak wiadomości nie zostają nigdzie. Który dostawca jest dziś dostępny za darmo i na jakich warunkach, którędy ma iść wyszukiwanie, wybór i obrazek, co z tego dotyka kodu czatu, nagłówków bezpieczeństwa, sekretów, logów i testów.

## Summary

- **Do wyboru zostają dwaj dostawcy: KLIPY i GIPHY.** Tenor (Google) nie przyjmuje nowych kluczy od 13.01.2026 i jest wyłączony od 30.06.2026 ([Google](https://support.google.com/tenor/answer/10455265)). Obaj pozostali dają darmowy klucz z limitem 100 zapytań na godzinę ([KLIPY](https://docs.klipy.com/getting-started.md), [GIPHY](https://developers.giphy.com/docs/api/)). Klucz produkcyjny KLIPY znosi limit („unlimited API requests”), a oficjalne strony nie podają ceny. Klucz produkcyjny GIPHY jest płatny: po zgłoszeniu „a member of our team will reach out via email to discuss pricing” ([GIPHY](https://developers.giphy.com/docs/api/)).
- **Obaj zabraniają pośrednika, więc wyszukiwanie i obrazki idą prosto z przeglądarki gracza, nie przez Workera.** GIPHY: „Do not proxy requests to GIPHY, either API calls or media URL loads” ([best practices](https://developers.giphy.com/docs/api/best-practices/)). KLIPY: „API requests and media loads must originate from the user's mobile app, desktop app, or web browser”, a pośrednik tylko „with prior written approval from KLIPY” ([integration requirements](https://docs.klipy.com/integration-requirements.md)). Pomysł z roadmapy, że Worker ukryje graczy przed dostawcą (`context/foundation/roadmap.md:432-434`), odpada bez pisemnej zgody KLIPY.
- **PRD da się spełnić dosłownie i bez pośrednika.** FR-028 wymaga, żeby dostawca nie dostał nicku ani pokoju (`context/foundation/prd.md:151`, `:160`). Przy wywołaniach z przeglądarki dostawca dostaje słowo wyszukiwania, adres IP i przeglądarkę gracza. Nicku i pokoju nie musi dostać, bo `customer_id` jest u obu opcjonalne, a `Referrer-Policy: same-origin` (`src/lib/security-headers.ts:10`) nie wysyła ścieżki `/r/<id pokoju>` do obcych hostów. Dostawca zobaczy też IP każdego ekranu, który pokaże gifa. To nowa granica prywatności do przyjęcia przez Karola.
- **Wybrany gif przechodzi przez Workera jak wiadomość.** Ekran wysyła do trasy czatu adres gifa z odpowiedzi dostawcy. Worker sprawdza adres (https, host dostawcy, długość) i podpisuje go z nickiem z `room_lobby`, jak tekst (`src/pages/api/rooms/[id]/chat.ts:25-57`, `src/lib/live-sync/server.ts:137-172`). Worker nie łączy się z dostawcą. Adresu nie wolno składać z samego id, bo KLIPY zabrania „reconstruct URL parameters, content identifiers” ([integration requirements](https://docs.klipy.com/integration-requirements.md)).
- **Filtr dla dorosłych siedzi w zapytaniu przeglądarki, więc gracz, który przerobi własną stronę, może go obejść.** GIPHY bez `rating` oddaje wszystkie oceny ([endpoint](https://developers.giphy.com/docs/api/endpoint/)), KLIPY ma `content_filter=off|low|medium|high` ([search](https://docs.klipy.com/gifs-api/gifs-search-api.md)) oraz blokady słów i treści w panelu partnera ([integration requirements](https://docs.klipy.com/integration-requirements.md)). Czy ustawienie filtra w panelu KLIPY ([content filtering](https://docs.klipy.com/content-filtering.md)) nadpisuje parametr zapytania, strona nie mówi w czytelnym tekście. Druga granica do przyjęcia przez Karola.
- **CSP przypada tej zmianie.** Gra nie ma dziś Content-Security-Policy (`src/lib/security-headers.ts:8-12`; brak w `src/`, `astro.config.mjs`, `wrangler.jsonc` i `public/`). Przegląd bezpieczeństwa odłożył ją do czatu, bo „CSP zależy od dostawcy gifów” (`context/archive/2026-11-16-security-hardening/plan.md:57`, `change.md:25`), a S-23 jej nie dodał.
- **Rekomendacja badania: KLIPY.** Jedyny z dwóch z drogą do klucza bez limitu, przy którym oficjalne strony nie podają ceny, oraz z filtrem w panelu. Wybór należy do Karola (roadmapa, `context/foundation/roadmap.md:432`).

## Detailed Findings

### Dostawcy gifów (stan na 2026-11-17)

|                               | KLIPY                                                                                                                                                                                                                                                                                        | GIPHY                                                                                                                                                                                               | Tenor                                                                                                |
| ----------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| Nowe klucze                   | tak, panel partnera ([getting started](https://docs.klipy.com/getting-started.md))                                                                                                                                                                                                           | tak, dashboard ([api](https://developers.giphy.com/docs/api/))                                                                                                                                      | nie od 13.01.2026, wyłączony 30.06.2026 ([Google](https://support.google.com/tenor/answer/10455265)) |
| Darmowy klucz                 | testowy, 100 zapytań/h                                                                                                                                                                                                                                                                       | beta, 100 zapytań/h, `limit` wyszukiwania do 50                                                                                                                                                     | —                                                                                                    |
| Klucz produkcyjny             | „unlimited API requests”, wniosek w panelu (kategoria aplikacji, liczba użytkowników, nagranie ekranu do 25 MB, [blog KLIPY](https://klipy.com/blog/klipy-partner-panel)); cena: oficjalne strony jej nie podają, „darmowy” tylko w artykułach i we fragmencie starej strony (NIESPRAWDZONE) | po wniosku „discuss pricing” (płatny)                                                                                                                                                               | —                                                                                                    |
| Filtr dla dorosłych           | `content_filter=off\|low\|medium\|high` w zapytaniu, domyślna wartość niepodana; filtry w panelu „globally or by country”; czy panel nadpisuje zapytanie: NIESPRAWDZONE                                                                                                                      | `rating=g\|pg\|pg-13\|r`, bez parametru wszystkie oceny; pobranie gifa po id z `rating` oddaje 4xx dla wyższej oceny ([endpoint](https://developers.giphy.com/docs/api/endpoint/))                  | —                                                                                                    |
| Pośrednik (Worker)            | zakazany bez pisemnej zgody                                                                                                                                                                                                                                                                  | zakazany                                                                                                                                                                                            | —                                                                                                    |
| Przechowywanie i przerabianie | bez własnej kopii mediów, bez zmiany i składania adresów, bez zmiany kolejności i filtrowania wyników                                                                                                                                                                                        | bez cache odpowiedzi i adresów, bez zmiany kolejności i filtrowania                                                                                                                                 | —                                                                                                    |
| Podpis dostawcy               | wymagany placeholder pola wyszukiwania „Search KLIPY”; czy wolno go przetłumaczyć, strona nie mówi ([attribution](https://docs.klipy.com/attribution.md))                                                                                                                                    | wymagany znak „Powered By GIPHY” tam, gdzie działa wyszukiwarka                                                                                                                                     | —                                                                                                    |
| Co dostaje dostawca           | IP, przeglądarka, przybliżona lokalizacja, historia wyszukiwań; dane do pomiaru i targetowania reklam, partnerzy reklamowi; honoruje Global Privacy Control ([polityka, 23.06.2026](https://klipy.com/support/privacy-policy))                                                               | słowo i IP przy wywołaniu z przeglądarki; polityka prywatności nieczytelna dla narzędzia (NIESPRAWDZONE)                                                                                            | —                                                                                                    |
| Hosty                         | `api.klipy.com`, `static.klipy.com`, `static1.klipy.com`, `static2.klipy.com` ([network requirements](https://docs.klipy.com/network-requirements.md))                                                                                                                                       | w przykładach `media.giphy.com`, `media1.giphy.com`, `media4.giphy.com`, analityka `giphy-analytics.giphy.com` ([schema](https://developers.giphy.com/docs/api/schema/)); pełna lista NIESPRAWDZONA | —                                                                                                    |
| Małe rozmiary                 | `xs` (90 px) i `sm` (220 px) jako gif, webp, mp4, webm; mediana `xs` webp 35 KB, `sm` webp 117 KB ([sizes](https://docs.klipy.com/gifs-api/gifs-format-sizes.md))                                                                                                                            | `fixed_width_small` (100 px), `fixed_width` (200 px), `downsized_small` mp4 do 200 KB ([optional settings](https://developers.giphy.com/docs/optional-settings/))                                   | —                                                                                                    |
| Warunki dla graczy            | „personal and non-commercial purposes”, w EOG od 16 lat ([terms, 23.06.2026](https://klipy.com/support/terms-services))                                                                                                                                                                      | —                                                                                                                                                                                                   | —                                                                                                    |

- Inni: GifMe (jeden wspólny klucz w README, endpointy `http://`, filtr NSFW po stronie klienta) odpada; Imgur to nie wyszukiwarka gifów-reakcji, a jego dokumentacji narzędzie nie pobrało (NIESPRAWDZONE).
- Sprzeczność u GIPHY: strona wyszukiwania prosi o kod kraju „if requests are proxied through your service” ([endpoint](https://developers.giphy.com/docs/api/endpoint/)), a strona dobrych praktyk zakazuje pośrednika. Wiąże zakaz (wprost i ogólnie).
- Limit klucza testowego KLIPY: aktualne strony mówią „100 API requests per hour” ([getting started](https://docs.klipy.com/getting-started.md)); fragment starszej strony w wyszukiwarce mówił o minucie. Przyjmujemy godzinę.
- Limit 100/h dotyczy jednego klucza, a klucz jest w każdej przeglądarce (wymóg wywołań z przeglądarki), więc wszystkie pokoje gry dzielą te 100 zapytań na godzinę do czasu klucza produkcyjnego. Wyszukiwanie przy każdym znaku zjadłoby limit w kilka minut; potrzebny przycisk „Szukaj” albo opóźnienie.

### Droga wiadomości dziś i co zmienia gif

- **Wysyłka tekstu**: `RoomChat.tsx:205-229` (`send()`, pauza `CHAT_COOLDOWN_MS` tylko na ekranie) → `RoomScreen.tsx:348-352` → `room-actions.ts:72-97` (`POST /api/rooms/<id>/chat`, JSON). Trasa `src/pages/api/rooms/[id]/chat.ts:25-57` po kolei: obce żądanie 415/403, UUID, ciało do 4096 bajtów (`json-route.ts:20`), `bodyChatText` albo 400, sesja lub ciasteczko gracza, podpisujący albo 503, `roomLobby` (`null` dla spóźnionego, odrzuconego, usuniętego i obcego, ta sama 404), potem `broadcastChat` z `nick: result.lobby.me`.
- **Koperta**: `sendChat` (`src/lib/live-sync/server.ts:137-172`) podpisuje `{ room, event: "chat", text, nick }`; `data` to tekst JSON `{"v":1,"room":…,"event":"chat","at":…,"id":…,"text":…,"nick":…}` (`signature.ts:122-128`), wysłany na `live-players:<klucz kanału>` (`shared.ts:59-61`). Pola treści nie nadpiszą `v`, `room`, `event`, `at` ani `id` (`signature.ts:123`).
- **Odbiór**: `useRoomState.ts:520-533` (`openSignedMessage` → `firstSeen` → `onChat`), subskrypcja zdarzenia `chat` w `useRoomState.ts:543-546`. `openSignedMessage` (`signature.ts:149-175`) odrzuca `data` dłuższe niż 4096 znaków i przepuszcza pola, których nie zna (`signature.ts:170`). `parseChatMessage` (`src/lib/rooms/chat.ts:84-91`) bierze tylko `id`, `nick` i `text` i oddaje `null`, gdy `text` nie przejdzie; `ChatMessage` to płaskie `{ id, nick, text }` (`chat.ts:20-24`), bez unii rodzajów.
- **Wnioski dla gifa** (analiza, nie decyzja):
  - Gif może iść tą samą trasą i tym samym zdarzeniem `chat` z polem `gif` zamiast `text`; wtedy nie dochodzi subskrypcja, a ekran otwarty przed wdrożeniem po cichu pominie gifa (`parseChatMessage` zwraca `null` bez `text`, `chat.ts:89`), co po odświeżeniu znika. Osobne zdarzenie wymaga stałej w `shared.ts` i drugiego `.on` w `useRoomState.ts:539-546`.
  - `ChatMessage` staje się unią (tekst albo gif). `appendChatMessage` i `keepPlayersChat` używają tylko `id` i `nick` (`chat.ts:95-107`), więc usunięcie gracza wymaże też jego gify bez zmian. Gałąź dla gifa potrzebują trzy miejsca wyświetlania w `RoomChat.tsx`: `MessageLine` (`:80-100`), region `aria-live` (`:241-243`) i dymek zwiniętego czatu (`:352-362`); do tego podglądy `ChatPreview` (`:17-33`), `src/pages/dev/room-states.astro` i `src/pages/dev/room-window.astro`.
  - Rozmiar: koperta z adresem gifa, nickiem i polami podpisu mieści się w limicie `data` 4096 znaków (`signature.ts:56-58`) i w ciele żądania 4096 bajtów (`json-route.ts:20`); limit Realtime 256 KB nie wiąże (`context/archive/2026-11-17-room-chat/plan.md:502`).
  - Adres w wiadomości sprawdzają dwie strony: Worker przed podpisem (https, host z listy dostawcy, długość) i ekran przed pokazaniem (ta sama reguła, czysta funkcja w `src/lib/rooms/`), a trzecią zaporą jest `img-src` w CSP.

### Nagłówki bezpieczeństwa i CSP

- Dziś: `X-Frame-Options: DENY`, `Referrer-Policy: same-origin`, `X-Content-Type-Options: nosniff` i domyślne `Cache-Control: no-store` (`src/lib/security-headers.ts:8-19`), nakładane w `src/middleware.ts`. Pliki statyczne z `dist/` omijają middleware i nie mają tych nagłówków (przyjęte w przeglądzie security-hardening, `context/archive/2026-11-16-security-hardening/change.md:28`).
- Pilnują ich test `tests/unit/security-headers.test.ts:10-14,27-39` (dokładnie te cztery wartości) i krok smoke „the game's answers carry the security headers” (`scripts/smoke.mjs:389-418`). Żaden test nie sprawdza CSP, bo jej nie ma.
- Bez CSP obrazek z hosta dostawcy i `fetch` z przeglądarki do API dostawcy dziś przejdą; ogranicza je tylko CORS dostawcy.
- CSP z samymi dyrektywami `img-src` i `connect-src` (bez `default-src` i `script-src`) nie dotyka skryptów Astro (`SignInCard.astro:42`, `RoomCard.astro:27`, wyspy React), a zamyka obrazki i połączenia do listy hostów. `connect-src` musi wtedy objąć `'self'`, adres Supabase (REST i `wss:` Realtime, z `supabaseUrl` strony) i API dostawcy; `img-src` `'self'`, ewentualnie `data:`, i hosty mediów dostawcy. Jakie obrazki z obcych hostów gra ładuje dziś (np. awatary logowania), badanie nie sprawdzało: do ustalenia w planie przed zawężeniem `img-src`.

### Klucz dostawcy, sekrety i logi

- Klucz dostawcy musi trafić do przeglądarki (wywołania z przeglądarki są wymogiem obu dostawców), więc nie jest sekretem w sensie `LIVE_SIGNING_KEY`. AGENTS.md reguluje tylko klucze Supabase i klucz podpisu (`AGENTS.md:11-12`, `:14`). Żeby nie leżał w publicznym repo (kradzież wspólnego limitu), może iść jak `LIVE_SIGNING_KEY`: opcjonalne `envField` serwera w `astro.config.mjs:17-26`, odczyt tylko przez `astro:env/server`, `npx wrangler secret put` (za zgodą) i `.dev.vars`, a do ekranu w propsach strony pokoju jak `signingKey` (`src/pages/r/[id].astro:79-80`). Bez klucza ekran nie pokazuje wyszukiwarki gifów, a czat tekstowy działa.
- Procedura nowego sekretu: `context/deployment/deploy-plan.md:130-139` (najpierw sekret, potem kod; `wrangler secret put` od razu wdraża nową wersję Workera, `context/foundation/infrastructure.md:159`).
- Słowo wyszukiwania nie dotyka Workera (przeglądarka pyta dostawcę wprost), więc nie trafia do jego logów. Adres gifa w trasie czatu to treść od gracza: `logEvent` przepuszcza tylko pola z listy (`src/lib/log.ts:13-27`), a powód błędu Realtime ma wycięte dane, które wysłał gracz (`live-sync/server.ts:65-76`, lista `:170`); lista do wycięcia musi objąć adres gifa. Cloudflare zapisuje w logach wywołań pełne adresy URL zapytań do Workera (`observability` w `wrangler.jsonc`), więc gif idzie w ciele POST, nie w adresie, jak dziś tekst.

### Testy

- CI nie ma prawdziwego klucza: joby `e2e` i `smoke` nie dostają sekretów repozytorium i piszą jednorazowe wartości do `.dev.vars` (`.github/workflows/ci.yml:56-61`, `:139-144`; `docs/development.md:229`). Prawdziwy klucz w CI to nowy sekret GitHub (`gh secret set`, za zgodą) i zużycie wspólnego limitu, więc nie.
- E2E może podstawić odpowiedź dostawcy przez `page.route` (wyszukiwanie i obrazek z pliku testu). Dziś `page.route` jest w dwóch specs, oba na adresach gry (`tests/e2e/latecomer.spec.ts:192`, `tests/e2e/remembered-nick.spec.ts:82`); obcy host byłby nowym wzorcem w test-plan §6.4.
- Smoke chodzi po produkcji przy każdym pushu na `main` i za zgodą (`context/foundation/test-plan.md:419-420`); krok wołający dostawcę zjadałby limit (anty-wzorzec „test obciążeniowy na produkcji”, `test-plan.md:63-69`). Smoke może sprawdzić samą trasę: adres z hosta dostawcy przechodzi, adres z obcego hosta 400, nieznany gracz 404, bez wołania dostawcy.
- Testy jednostkowe: wzór czystej funkcji w `src/lib/` z testem i podstawianego klienta zamiast `vi.stubGlobal("fetch")` (`tests/unit/live-sync-server.test.ts:30-43`, `tests/unit/limiter.test.ts:27-45`).

### Słownik i nieaktualne miejsca

- `context/domain/glossary.md:49-53` nie ma terminu „gif”, a „czat” opisuje same krótkie wiadomości; FR-028 obejmuje gify. Plan dopisuje termin.
- `context/foundation/shape-notes.md:243` („emotka lub gif… to dodatek, nie czat”) jest zastąpiony przez FR-028.
- Roadmapa pokazuje S-23 jako `in-progress` (`context/foundation/roadmap.md:68`), choć jest na produkcji; status zmieni `/10x-archive room-chat` po grze.

## Code References

- `src/pages/api/rooms/[id]/chat.ts:25-57` - trasa czatu: kolejność sprawdzeń i nadanie z nickiem z `room_lobby`
- `src/lib/rooms/chat.ts:10-16` - limity czatu (200 znaków, 2 s, 50 wpisów)
- `src/lib/rooms/chat.ts:20-24`, `:84-91` - `ChatMessage` i `parseChatMessage` (bez unii, `null` bez `text`)
- `src/lib/live-sync/server.ts:137-172` - `sendChat`, podpis i lista wycinanych pól
- `src/lib/live-sync/signature.ts:149-175` - `openSignedMessage`, limit 4096 i przepuszczanie nieznanych pól
- `src/components/room/useRoomState.ts:520-546` - odbiór i subskrypcja `chat`
- `src/components/room/RoomChat.tsx:80-100`, `:205-229`, `:241-243`, `:352-362` - wiersz wiadomości, wysyłka, region `aria-live`, dymek
- `src/lib/security-headers.ts:8-19` - nagłówki bez CSP
- `astro.config.mjs:17-26` - schemat `astro:env`, wzór opcjonalnego sekretu
- `src/pages/r/[id].astro:79-80` - klucz publiczny podpisu w propsach strony (wzór dla klucza dostawcy)
- `src/lib/log.ts:13-27` - dozwolone pola logu
- `scripts/smoke.mjs:389-418` - krok smoke nagłówków bezpieczeństwa

## Architecture Insights

- Gif to druga treść od gracza na tym samym podpisanym kanale: Worker pozostaje jedynym, który nadaje z nickiem, a obca usługa dochodzi tylko po stronie przeglądarki (wyszukiwanie i obrazek). Worker nadal nie łączy się z nikim poza Supabase.
- Trzy niezależne zapory przed obcym obrazkiem w czacie: sprawdzenie adresu w Workerze przed podpisem, to samo sprawdzenie na ekranie przed pokazaniem i `img-src` w CSP.
- Granice prywatności i filtra wynikają z warunków dostawców, nie z kodu gry, więc są decyzją produktową, a nie techniczną.

## Historical Context (from prior changes)

- `context/archive/2026-10-26-room-emotes/change.md:12` - S-16 wziął FR-023 tylko z emotkami, gify do Parked (bez technicznego powodu w archiwum).
- `context/archive/2026-11-17-room-chat/change.md:17` - decyzja Karola: gify z wyszukiwarki darmowego dostawcy, zawsze z filtrem dla dorosłych, bez nicku i pokoju u dostawcy (S-24).
- `context/archive/2026-11-17-room-chat/plan.md:11`, `:54` - linki w czacie zostają zwykłym tekstem.
- `context/archive/2026-11-16-security-hardening/plan.md:57`, `change.md:25` - CSP odłożona do czatu, „zależy od dostawcy gifów”; nadal otwarta.
- `context/deployment/deploy-plan.md:44` - brak polityki prywatności to przyjęte ryzyko, dopóki gra jest dla znajomych; wraca przed otwarciem gry dla obcych.

## Related Research

- `context/archive/2026-11-17-room-chat/research.md` - czat S-23: podpis ECDSA P-256, koperta, droga wiadomości.
- `context/archive/2026-11-14-players-only-live-channel/research.md` - temat graczy i klucz kanału.

## Open Questions

Decyzje Karola przed planem (rekomendacje badania w nawiasie):

1. **Dostawca**: KLIPY czy GIPHY (KLIPY: klucz bez limitu bez podanej ceny, filtr w panelu; GIPHY: klucz produkcyjny płatny).
2. **Prywatność**: dostawca widzi słowa wyszukiwania oraz IP i przeglądarkę każdego gracza, który szuka albo widzi gifa, ale nie nick ani pokój. To jedyna droga dozwolona bez pisemnej zgody KLIPY (przyjąć).
3. **Filtr**: gracz, który przerobi własną stronę, może wysłać gifa spoza filtra; gra pokaże tylko gify z hostów dostawcy, a na niechcianego gracza prowadzący ma usunięcie (PRD, `context/foundation/prd.md:186`, `:211`). Do tego najostrzejszy filtr w zapytaniu i w panelu (przyjąć).

Fakty do sprawdzenia przy zakładaniu klucza (nie blokują planu):

- czy ustawienie filtra w panelu KLIPY nadpisuje `content_filter` z zapytania;
- czy placeholder „Search KLIPY” wolno przetłumaczyć (pytanie do developers@klipy.com albo zostawić po angielsku);
- czy klucz produkcyjny KLIPY jest bezpłatny (oficjalne strony nie podają ceny);
- jakie obce obrazki gra ładuje dziś, zanim CSP zawęzi `img-src`.
