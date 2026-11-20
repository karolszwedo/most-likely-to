---
date: 2026-11-14T09:59:43+0100
researcher: Claude (Opus 5.5)
git_commit: 4fa5197e7dcf9ccd1e6778dca2da6a5d16e67e41
branch: players-only-live-channel
repository: most-likely-to
topic: "Kanał na żywo tylko dla graczy pokoju"
tags: [research, live-sync, realtime, emotes, remove-player, latecomer]
status: complete
last_updated: 2026-11-14
last_updated_by: Claude (Opus 5.5)
last_updated_note: "Kontynuacja przed planem: W-A′ (po kluczu tylko emotki), ustalenia bazy, ekranów i testów"
---

# Research: Kanał na żywo tylko dla graczy pokoju

**Date**: 2026-11-14T09:59:43+0100
**Researcher**: Claude (Opus 5.5)
**Git Commit**: 4fa5197e7dcf9ccd1e6778dca2da6a5d16e67e41
**Branch**: players-only-live-channel
**Repository**: most-likely-to

## Research Question

Kanał na żywo (`live-sync:<roomId>`) jest publiczny, więc gracz usunięty w S-09 zna id pokoju i do końca gry może oglądać i nadawać emotki pod cudzym nickiem (roadmapa, Parked: „Kanał na żywo tylko dla graczy pokoju”; Karol przyjął to po przeglądzie S-09, F2, 2026-11-02). Jak zrobić kanał tylko dla graczy pokoju, skoro goście nie mają kont Supabase? Roadmapa podaje dwie drogi: temat z sekretu pokoju zmienianego przy usunięciu albo prywatny kanał z autoryzacją Realtime. Zmiana ma też być fundamentem pod ewentualny czat w pokoju.

## Summary

- **Dziś** temat kanału to surowe id pokoju (`src/lib/live-sync/shared.ts:35-37`), które zna każdy gracz, spóźniony w poczekalni i gracz usunięty. Id nie zmienia się przez całą grę (`supabase/migrations/20261101125331_remove_player.sql:28-29`). Wysyła tylko Worker, przez REST Realtime z kluczem publicznym (`src/lib/live-sync/server.ts:59-85`), ale kanał publiczny przyjmuje wiadomość od każdego, kto zna temat i ma klucz publiczny. Ekran odsiewa tylko emotki spoza listy i nicki spoza listy graczy (`src/lib/rooms/emotes.ts:51-61`).
- **Dwie różne dziury, nie jedna:**
  1. _Kto słyszy kanał._ Usunięty gracz, odrzucony spóźniony i każdy, kto zobaczył adres `/r/<id>`, słyszą emotki z nickami i dzwonki do końca gry.
  2. _Kto może nadawać pod cudzym nickiem._ Każdy, kto zna temat, łącznie z obecnymi graczami.
- **Rekomendacja: W-A, tajny klucz kanału.** Temat `live-sync:<klucz>` zamiast id pokoju. Klucz to nowy losowy kod pokoju (128 bitów, jak kod linku), który `room_lobby` daje tylko graczom pokoju. Zmienia się przy każdym usunięciu gracza.
  - Zamyka dziurę 1: usunięty, odrzucony i obcy z adresem `/r/<id>` tracą kanał.
  - Bez zmian w panelu Supabase, bez nowego sekretu w Workerze. W pełni sprawdzalne w CI: job `e2e` ma Realtime (`.github/workflows/ci.yml:126-127`).
  - Dziura 2 zostaje wewnątrz pokoju: obecny gracz dalej może wysłać emotkę z nickiem kolegi albo zalać kanał.
- **Pod czat** dziura 2 przestaje być drobiazgiem, bo podszyta wiadomość tekstowa to więcej niż podszyta emotka. Najtańsze domknięcie na później to W-E, podpis serwera na każdej wiadomości. Prywatny kanał Supabase (W-B, W-C) też to domyka, ale za cenę zapisu wiadomości w bazie na 3 dni (W-B) albo bardzo mocnego sekretu w Workerze i zmian w jedynym, produkcyjnym projekcie (W-C).
- **Kanały prywatne Supabase nie pasują dziś do gry.** Polityka jest liczona przy dołączeniu i trzymana przez całe połączenie. Usunięty gracz traci dostęp dopiero, gdy wygaśnie jego JWT. Goście nie mają JWT, a każda droga do niego jest kosztowna: konta anonimowe to PRD Non-Goal i otwierają rolę `authenticated` każdemu; własny JWT wymaga klucza, który może wybić `service_role`.

## Detailed Findings

### 1. Kanał dziś: temat, kto słucha, kto nadaje

- **Temat.** `topicFor(room)` daje `"live-sync:" + roomId` (`src/lib/live-sync/shared.ts:3,35-37`). Id pokoju to UUID z `rooms.id` (`supabase/migrations/20261007122858_room_lobby.sql:20`). Przy usunięciu gracza zmienia się tylko `rooms.link_token`; komentarz mówi wprost: „The room, its id, its channel and every other player's token stay” (`20261101125331_remove_player.sql:28-29,149-152`).
- **Słuchacze w przeglądarce.** Sprawdzone trzy wyspy, wszystkie łączą się jako `anon` i żadna nie ustawia `private`:
  - ekran pokoju w trakcie: `bell`, `leader-bell`, `emote` (`src/components/room/useRoomState.ts:315-359`);
  - ekran końca wieczoru: tylko `emote`, bez końca czasu (`useRoomState.ts:388-404`);
  - spóźniony czekający na „Wpuść”: tylko `bell` (`src/components/room/JoinWaiting.tsx:166-195`).
  - Do tego dev-demo F-01 (`src/components/live-sync/LiveSyncDemo.tsx:59-77`) i sonda (`scripts/live-sync-probe.mjs:12`).
  - Klient Realtime nigdy się nie loguje, także u hosta: sesja hosta żyje w ciasteczkach serwera (`useRoomState.ts:128-133`).
- **Nadawca: tylko Worker.** `send()` woła `channel.httpSend` (REST broadcast) i zaraz usuwa kanał (`src/lib/live-sync/server.ts:59-85`). Wrappery: `ringRoom`, `ringRoomLeaders`, `sendEmote` (`server.ts:87-99`), a na trasach `ringLobby`, `ringLeaders` i `broadcastEmote` przez `waitUntil` (`src/lib/rooms/server.ts:818-864`). Na sprawdzonej ścieżce baza nic nie wysyła: brak `realtime.send`, triggerów broadcastu i tabel w publikacji (raport z przeglądu `supabase/migrations`, `src`).
- **Zdarzenia.**

  | Zdarzenie     | Treść             | Kto reaguje                                                              |
  | ------------- | ----------------- | ------------------------------------------------------------------------ |
  | `bell`        | `{ seq }`         | każdy ekran: pobiera stan przez limiter (`src/lib/live-sync/limiter.ts`) |
  | `leader-bell` | `{ seq }`         | tylko ekran prowadzącego (`useRoomState.ts:323-325`)                     |
  | `emote`       | `{ emote, nick }` | każdy ekran pokoju (`RoomScreen.tsx:154-182`, `parseEmoteMessage`)       |

- **Droga emotki.** Przeglądarka → `POST /api/rooms/<id>/emote` → `room_lobby` musi zwrócić gracza (inaczej 404) → Worker nadaje `{ emote, nick: lobby.me }` (`src/pages/api/rooms/[id]/emote.ts:31-43`). Przez Workera usunięty gracz dostaje 404, bo jego hash tokenu zniknął razem z wierszem gracza (`remove_player.sql:21-23,146-147`). Ominięcie Workera to jedno wywołanie Realtime z kluczem publicznym i tematem.
- **Konfiguracja Realtime dla przeglądarki** (URL + klucz publiczny, tylko `sb_publishable_`, `src/lib/supabase.ts:27-32`) trafia trzema drogami:
  - propsy `/r/[id]` (`src/pages/r/[id].astro:72,92`);
  - propsy poczekalni spóźnionego (`src/pages/j/[token].astro:112,175-183`);
  - publiczny `GET /api/live-sync/config` bez logowania (`src/pages/api/live-sync/config.ts:6-12`).
- **`POST /api/live-sync/ring`** (dev-demo F-01): każdy zalogowany może zadzwonić na dowolny temat `live-sync:<[a-z0-9-]{1,64}>`, także prawdziwego pokoju (`src/pages/api/live-sync/ring.ts:7-25`, `shared.ts:25-29`).

### 2. Kto dziś zna temat i co może z nim zrobić

- Id pokoju widać:
  - w adresie `/r/<id>`;
  - w propsach wysp (`r/[id].astro:92`, `j/[token].astro:177`);
  - w nazwie ciasteczka `mlt_player_<roomId>` (`src/lib/rooms/tokens.ts:11`);
  - w zapytaniach `/api/rooms/<id>/…`;
  - w dołączeniu WebSocketu.
- Spóźniony w poczekalni dostaje id przed wpuszczeniem i zachowuje je po odrzuceniu (`j/[token].astro:79-81,177`).
- Kto zna temat i ma klucz publiczny, może na sprawdzonej ścieżce:
  - słuchać wszystkich trzech zdarzeń;
  - nadawać `emote` z nickiem dowolnego obecnego gracza: ekran pokaże ją, bo `parseEmoteMessage` sprawdza tylko listę emotek i listę nicków (`emotes.ts:56-61`);
  - nadawać `bell` (koszt: dodatkowe pobrania stanu, przyhamowane limiterem do 15 s, `limiter.ts:1-17`).
- Stanu pokoju, głosów i wyników kanał nie niesie (F-01: dzwonek jest niezaufaną podpowiedzią; `server.ts:101-103`, `context/archive/2026-09-27-live-sync-spike/measurements.md:104-107`).
- Zalewanie: przerwa 3 s między emotkami jest tylko na ekranie (`emotes.ts:24-26`). Na serwerze nie ma limitu, bo „a forger sends to the public channel past the Worker anyway” (`emote.ts:16-17`).
- Limit darmowego planu Realtime: 100 wiadomości/s średnio na cały projekt, a broadcast do N odbiorców liczy się jako 1+N (`context/archive/2026-10-26-room-emotes/research.md:109-117`; dokumentacja Supabase „Realtime limits”). Przekroczenie rozłącza klientów całego projektu, więc zalanie jednego pokoju dotyka wszystkich pokoi.

### 3. Prywatne kanały Supabase: jak działają (dokumentacja, 2026-11)

Źródła: https://supabase.com/docs/guides/realtime/authorization, https://supabase.com/docs/guides/realtime/broadcast, https://supabase.com/docs/guides/realtime/settings.

- Klient włącza je przez `config: { private: true }`. Dostęp dają polityki RLS na `realtime.messages`: `SELECT` pozwala odbierać, `INSERT` nadawać, filtr po `realtime.topic()` i `extension`. Polityka widzi claims JWT (`auth.uid()`, `auth.jwt()`).
- **Polityka jest liczona przy dołączeniu i trzymana przez całe połączenie** („cached for the duration of the connection”). Po usunięciu z tabeli członków klient „keep[s] receiving messages until their JWT expires or a new one is sent”. Złośliwy usunięty gracz nie odświeży tokenu, więc traci dostęp dopiero po wygaśnięciu JWT.
- Polityka `INSERT` nie widzi treści wiadomości, a Realtime nie dokleja nadawcy. RLS nie zatrzyma więc podpisania się cudzym nickiem w treści. Ochrona przed podszyciem wymaga, by klienci mieli tylko `SELECT`, a nadawał wyłącznie serwer.
- Wymuszenie samych kanałów prywatnych to przełącznik w panelu: „Allow public access to channels” (`private_only` w Management API). Każda zmiana ustawień Realtime rozłącza wszystkich klientów. Nie znaleziono klucza w `config.toml`, więc lokalny Supabase w CI może tego nie odtworzyć.
- Od 2026-07-14 schemat `realtime` jest zablokowany na zmiany obiektów, ale polityki na `realtime.messages` wolno dodawać. `ALTER TABLE realtime.messages ENABLE ROW LEVEL SECURITY` w migracji pada („must be owner”) i przerywa resztę migracji.
- Nadawanie na kanał prywatny:
  - REST z samym kluczem publicznym działa jako `anon`, więc wymagałby polityki `INSERT` dla `anon`, czyli dla każdego;
  - działa REST z JWT użytkownika, którego przepuszcza polityka;
  - działa REST z kluczem sekretnym;
  - działa `realtime.send()` z bazy. Ta funkcja zapisuje wiadomość w `realtime.messages` (partycje dzienne, usuwane po ok. 3 dniach), błędy połyka jako ostrzeżenie, a „Broadcast Replay” pozwala nowemu subskrybentowi odczytać do 25 ostatnich takich wiadomości.
  - Pułapka: nieautoryzowany prywatny REST broadcast dostaje 202 i jest po cichu porzucany.
- Skąd JWT dla gościa bez konta:
  - **Konta anonimowe** (`signInAnonymously`). Dają rolę `authenticated` każdemu z kluczem publicznym, więc trzeba by przejrzeć każdy `grant … to authenticated`. Limit to 30/h na IP, CAPTCHA „strongly recommended”, brak automatycznego sprzątania `auth.users`. https://supabase.com/docs/guides/auth/auth-anonymous
  - **Własny JWT z Workera.** Wymaga zaimportowania własnego klucza podpisującego do projektu (albo starego sekretu HS256, „no longer recommended”) i trzymania go jako sekret Workera. Taki klucz wybije też `role: service_role`, więc w Workerze, który dziś nie ma żadnego sekretu Supabase, staje się równy kluczowi sekretnemu. Wpięcie klucza zmienia też podpisywanie sesji hosta w całym projekcie. https://supabase.com/docs/guides/auth/signing-keys

### 4. Opcje

|                                                                                                  | Słyszy usunięty / obcy z id?                  | Obecny gracz podszyje się?    | Zalanie przez obcego? | Nowy sekret / panel                             | Zapis w bazie                                                     | Koszt                             |
| ------------------------------------------------------------------------------------------------ | --------------------------------------------- | ----------------------------- | --------------------- | ----------------------------------------------- | ----------------------------------------------------------------- | --------------------------------- |
| **W-A: tajny klucz kanału** (kanał dalej publiczny)                                              | nie                                           | tak                           | nie (nie zna tematu)  | nie / nie                                       | nowa kolumna, brak treści                                         | średni                            |
| **W-B: kanał prywatny, gracze tylko odbierają (`anon` `SELECT`), nadaje baza (`realtime.send`)** | nie, gdy temat dalej tajny: `anon` to wszyscy | nie                           | nie                   | nie / tak (przełącznik zalecany)                | **każdy dzwonek i emotka z nickiem w `realtime.messages` ~3 dni** | duży: każda funkcja dzwoni z bazy |
| **W-C: kanał prywatny, JWT od Workera**                                                          | nie, po wygaśnięciu JWT                       | nie, gdy klienci bez `INSERT` | nie                   | **tak (klucz mocy `service_role`) / tak**       | nie                                                               | duży, ryzyko na jedynym projekcie |
| **W-D: konta anonimowe + kanał prywatny**                                                        | nie, po wygaśnięciu JWT                       | nie, gdy klienci bez `INSERT` | nie                   | nie / tak (CAPTCHA, przełącznik)                | wiersze w `auth.users`                                            | duży; PRD Non-Goal „Konta gości”  |
| **W-E: podpis serwera** (dodatek do W-A)                                                         | jak W-A                                       | **nie**                       | nie                   | tak, ale własny klucz bez dostępu do bazy / nie | nie                                                               | średni, na czas czatu             |

- **W-A** to opcja z roadmapy („temat z sekretu pokoju zmienianego razem z linkiem”). Stoi na tym samym modelu co link do pokoju i ciasteczko gracza: kto ma 128-bitowy kod, ten wchodzi. Klucz nie może trafić do adresu, logu ani odpowiedzi dla kogoś spoza pokoju.
- **W-B** łamie dzisiejszą zasadę emotek „nic nie zapisuje” (glosariusz: emotka „idzie tylko kanałem na żywo, nic nie zapisuje”; `emote.ts:13-15`). Wymaga też przeniesienia dzwonka z Workera do kilkunastu funkcji SQL, a CI-owy job `db` startuje Supabase bez Realtime (`ci.yml:94`).
- **W-C i W-D** wymagają zmian w panelu jedynego projektu Supabase, z którego korzysta produkcja. Pierwsza decyzja F-01 odrzuciła W-D z tych samych powodów (`context/archive/2026-09-27-live-sync-spike/external-research.md:63-97,147-159`).
- **W-E** (wniosek, nie z dokumentacji Supabase):
  - Worker podpisuje każdą wiadomość kanału kluczem prywatnym (ECDSA P-256 lub Ed25519 w Web Crypto), a ekrany sprawdzają podpis kluczem publicznym z propsów.
  - W podpisanej treści musi być temat i znacznik czasu, żeby nie dało się odtworzyć starej wiadomości w innym pokoju ani później.
  - Klucz nie daje żadnego dostępu do bazy, więc w razie wycieku pozwala tylko podrobić wiadomość kanału.
  - Dodanie go to `npx wrangler secret put` (pytać).
  - Ma sens dopiero przy czacie. Dla emotek między znajomymi koszt jest większy niż szkoda.

### 5. Co W-A zmienia w kontraktach (dla `/10x-plan`)

- **Baza.** Nowa kolumna pokoju z kluczem kanału, generowana jak `link_token`: `translate(encode(extensions.gen_random_bytes(16), 'base64'), '+/=', '-_')` (`remove_player.sql:150-151`).
  - `room_lobby` zwraca ją każdemu graczowi pokoju, także gościom. Dziś `link_token` dostają tylko prowadzący (`remove_player.sql:33-37`), więc trzeba nowego klucza w wyniku.
  - `remove_player` ją zmienia.
  - Spóźniony czekający i odrzucony jej nie dostają.
- **Worker musi znać klucz, żeby zadzwonić.** Dziś `ringLobby`, `ringLeaders` i `broadcastEmote` dostają tylko `roomId` (`src/lib/rooms/server.ts:834-864`), a dzwoni kilkanaście tras po udanej RPC (`api/rooms/index.ts:77`, `join.ts:90,131`, `[id]/admit|cohost|color|end|more|next|question-*|reject|remove|reveal|skip|start|vote`, `propose.ts:40`, `proposal-*.ts`). Droga do wyboru w planie:
  - (a) każda funkcja ruchu zwraca klucz w wyniku;
  - (b) osobna funkcja „klucz kanału”, która sprawdza gracza tak jak `room_lobby`.
  - Funkcja oddająca klucz po samym id pokoju byłaby publicznym końcem (security definer dla `anon`) i przekreśliłaby zmianę.
  - Po usunięciu gracza dzwonek musi pójść na **stary** temat, bo pozostali słuchają jeszcze starego. Ich ekrany pobierają stan, dostają nowy klucz i przechodzą na nowy temat. Usunięty dostaje 404 i widzi „Usunięto cię z pokoju” (`useRoomState.ts:198-206`).
- **Wyspy.** `useRoomState` (dwa efekty) i `RoomScreen` subskrybują temat z klucza z ostatniego stanu i przełączają się, gdy klucz się zmieni. Dziś oba efekty zależą od `roomId` (`useRoomState.ts:384,404`). Emotki wysłane w chwili przełączenia mogą przepaść, a ekran bez kanału łapie stan przez poll co 8 s (`shared.ts:18-23`).
- **Spóźniony czekający** nie może już słuchać kanału pokoju. Decyzja dla Karola:
  - (a) własny temat prośby z osobnym kluczem, na który Worker dzwoni przy „Wpuść”/„Odrzuć”/końcu gry;
  - (b) tylko poll co 15 s (`LOBBY_POLL_MS`, `shared.ts:15-17`), czyli po „Wpuść” do 15 s czekania.
- **Logi.** `send()` loguje `roomId` przy błędzie (`server.ts:75-80`). Klucz nie może trafić do `logEvent` ani do `client-events`. Pola `logEvent` są z listy (`src/lib/log.ts`).
- **Dev-demo i sonda** (`/dev/live-sync`, `/api/live-sync/ring`, `scripts/live-sync-probe.mjs`) używają własnych tematów i mogą zostać. `ring.ts` przestaje sięgać do pokoi, bo nie zna kluczy.
- **Testy.** Dziś nie ma testu, że usunięty gracz albo obcy nie słyszy kanału, ani `test.fails` „znana dziura” dla tej sprawy (raport kodu). Siatka regresji to e2e z dzwonkiem i emotkami:
  - `seed.spec.ts:13-25`;
  - `game.spec.ts:115-133`;
  - `remove-player.spec.ts:69-90,149`;
  - `emotes.spec.ts:31-32`;
  - `lobby-connection-drop.spec.ts` z `support/realtime.ts:15-45`;
  - poczekalnia spóźnionego przez `support/room.ts:139-140`.
  - pgTAP sprawdza tylko publikację (`supabase/tests/round_creator_view.test.sql:417-430,1251-1262`).

## Code References

- `src/lib/live-sync/shared.ts:3-37`: prefiks tematu, zdarzenia, `topicFor`, poll 8 s / 15 s.
- `src/lib/live-sync/server.ts:59-99`: jedyny nadawca (`httpSend`), log błędu z `roomId`.
- `src/lib/rooms/server.ts:818-864`: `deliverBell`, `ringLobby`, `ringLeaders`, `broadcastEmote` (tylko `roomId`).
- `src/pages/api/rooms/[id]/emote.ts:10-43`: emotka przez Workera, nick z `room_lobby.me`.
- `src/lib/rooms/emotes.ts:24-61`: przerwa 3 s tylko na ekranie, `parseEmoteMessage`.
- `src/components/room/useRoomState.ts:128-133,315-404`: klient bez logowania, dwie subskrypcje po `roomId`.
- `src/components/room/JoinWaiting.tsx:157-195`: spóźniony słucha kanału pokoju.
- `src/pages/api/live-sync/ring.ts:7-25`, `config.ts:6-12`: dzwonek dev-demo dla zalogowanych, publiczna konfiguracja.
- `supabase/migrations/20261101125331_remove_player.sql:18-37,140-152`: rotacja tylko `link_token`; `room_lobby` daje kod tylko prowadzącym.
- `src/lib/rooms/tokens.ts:7-11`: „the id is also the live-sync topic”, ciasteczko `mlt_player_<roomId>`.

## Architecture Insights

- Gra stoi na kodach-zaproszeniach o mocy 128 bitów: link do pokoju (`link_token`), token gracza w ciasteczku z samym hashem w bazie. W-A dokłada trzeci kod tego samego rodzaju, więc nie zmienia modelu zaufania.
- Kanał jest od F-01 „dzwonkiem”: stan zawsze pochodzi z bazy przez Workera. To ogranicza szkodę z każdej opcji do emotek i zbędnych pobrań. Czat jest pierwszą treścią na kanale, która sama jest wartością, i dopiero przy nim podszycie wewnątrz pokoju zaczyna ważyć.
- Realtime liczy limit na cały projekt, więc pokój jest tak bezpieczny, jak najsłabiej chroniony temat: zalanie jednego pokoju rozłącza wszystkie pokoje.

## Historical Context (from prior changes)

- `context/archive/2026-09-27-live-sync-spike/external-research.md:30-34,63-97,147-159,179-188`: F-01 wybrało kanał publiczny jako dzwonek (droga B). Kanał prywatny z anonimowym logowaniem gości (A) odpadł, bo:
  - wymaga przełącznika na całym projekcie i RLS na `realtime.messages`;
  - logowanie anonimowe ma limit 30/h na IP i nie sprząta kont;
  - cofnięty gracz słyszy do wygaśnięcia JWT;
  - v1 miało być bez kont gości.
  - Sekretnego tematu ani własnego JWT wtedy nie oceniano. Wyzwalacze powrotu: obcy dzwonią do pokoi albo S-09/S-04 potrzebują czegoś, czego dzwonek nie da. Werdykt: nadal aktualne, a S-09 to drugi wyzwalacz.
- `context/archive/2026-10-26-room-emotes/plan.md:55-66,106-118,131-138`: S-16 zostawiło kanał publiczny, bez podpisów i bez kanałów prywatnych. Karol przyjął 2026-10-26, że kto zna UUID pokoju, nada emotkę z nickiem obecnego gracza. Przerwa między emotkami jest tylko na ekranie. Aktualne. Roadmapa przy S-16 wymagała, by emotka „nie mogła dać się podszyć” (`context/foundation/roadmap.md:323`), a plan to świadomie uchylił.
- `context/changes/remove-player-new-link/reviews/impl-review.md:54-71`: F2, „usunięty gracz zostaje na publicznym kanale pokoju”. Fix A (przyjąć granicę) wybrany 2026-11-02, zapis w `remove-player-new-link/plan.md:42` i `roadmap.md:421`. Fix B to dzisiejsze W-A albo kanał prywatny; ślepa plamka to przełączanie tematu w trakcie gry. Aktualne.
- `context/foundation/infrastructure.md:151,156`: pre-mortem „fałszywa odsłona na publicznym kanale” i nieznana niewiadoma „kanały prywatne wymagają RLS na `realtime.messages`, a goście nie mają kont”. Aktualne. Link w `:156` wskazuje dawne `context/changes/room-emotes/plan.md`, dziś to `context/archive/2026-10-26-room-emotes/`.
- `context/foundation/prd.md:206`: „Bez czatu głosowego i tekstowego w aplikacji”. Czat w pokoju jest w Parked (`roadmap.md:413`) i wymaga zmiany PRD. Ta zmiana PRD nie rusza.

## Related Research

- `context/archive/2026-09-27-live-sync-spike/external-research.md`: technika na żywo, porównanie dróg A–C.
- `context/archive/2026-10-26-room-emotes/research.md`: drogi emotek a–c2, limity Realtime.
- `context/changes/remove-player-new-link/research.md`: rotacja linku, decyzje S-09.

## Open Questions

Decyzje dla Karola przed `/10x-plan`:

1. **W-A teraz, W-E dopiero przy czacie?** Rekomendacja: tak. W-A zamyka dziurę z roadmapy bez ruszania panelu Supabase i sekretów. Podszycie się obecnego gracza pod kolegę zostaje świadomą granicą (zapis w roadmapie i glosariuszu), dopóki nie ma czatu.
2. **Spóźniony w poczekalni:** własny temat prośby (natychmiastowe „Wpuść”) czy sam poll co 15 s? Rekomendacja: własny temat, bo to jedno miejsce więcej, a 15 s czekania po „Wpuść” na wieczorze widać.
3. **Nowa nazwa w glosariuszu:** „klucz kanału”, osobny od „link do pokoju” i „kod”.

Do sprawdzenia w planie (technika, nie decyzja Karola):

- Jak Worker dostaje klucz do dzwonienia: wynik każdej funkcji ruchu czy osobna funkcja z kontrolą gracza (pkt 5).
- Czy przełączenie tematu w trakcie gry nie gubi dzwonka: przypadek e2e „usunięcie gracza w trakcie rundy, pozostali dalej dostają dzwonek i emotki, usunięty już nie”.
- Rotacja klucza a S-13 (kasowanie gry) i koniec gry: czy ekran końca wieczoru dostaje klucz z ostatniego stanu.

## Kontynuacja: 2026-11-14, rozpoznanie przed planem

Zastępuje przy wariancie W-A′ pkt 5 „Worker musi znać klucz, żeby zadzwonić” i decyzję 2 z Open Questions (własny temat prośby spóźnionego).

### Kluczowe ustalenie: Worker nie ma sekretu

- Funkcję, którą Worker woła kluczem publicznym, może wywołać każdy z tym kluczem (`security definer` dla `anon` to publiczny koniec, `AGENTS.md`). „Dane tylko dla Workera” więc nie istnieją.
- Gdyby dzwonek szedł po kluczu, `request_join` (Worker dzwoni do prowadzących o nowej prośbie, `src/pages/api/rooms/join.ts:90`) musiałby oddać klucz Workerowi, a przez to każdemu z aktualnym linkiem. Klucz miałby też spóźniony przed wpuszczeniem i po odrzuceniu.

### W-A′ (rekomendacja): po kluczu tylko emotki, dzwonki zostają

- `bell` i `leader-bell` zostają na `live-sync:<roomId>`. Nie niosą treści, a stan zawsze przychodzi z bazy; usunięty dostaje 404 (`src/pages/api/rooms/[id]/lobby.ts:32-41`).
- Bez zmian zostają trasy dzwoniące (lista w pkt 5) i poczekalnia spóźnionego (`JoinWaiting.tsx:170`), więc własny temat prośby nie jest potrzebny.
- `emote` (później czat) idzie na nowy temat z klucza kanału. Trasa emotki ma już wynik `room_lobby` (`emote.ts:38-42`), więc klucz bierze stamtąd bez dodatkowego wywołania.
- Jak dziś zostaje: usunięty i obcy z id pokoju słyszą dzwonki (bez treści) i mogą dzwonić (koszt: pobrania stanu, przyhamowane limiterem). Przyjęte od F-01.

### Baza

- `room_lobby`: najnowsza definicja w `supabase/migrations/20261107091322_game_length.sql:304-576`. Wynik buduje `:531-575`, a `link_token` daje tylko prowadzącym (`:553`).
  - Odpowiada też w pokoju zamkniętym, bo `end_game` nie usuwa graczy (`tests/db/game-history.test.ts:208`).
  - `null` dla wszystkich zwraca dopiero po `delete_game`.
- `public.rooms`: `grant select` dla `authenticated` na całą tabelę (`20261014101922_first_live_round.sql:33-34`) i jedna polityka „Hosts read their rooms” (`20261007122858_room_lobby.sql:65-67`).
  - Nową kolumnę przeczyta więc przez REST host tego pokoju. Host jest graczem, więc to zgodne z zasadą.
  - `anon` nie ma nic (`tests/db/roles.test.ts:150`). Sprawdzone migracje nie mają widoków ani funkcji zwracających cały wiersz pokoju.
- `link_token` zapisują tylko `create_room` i `remove_player` (`remove_player.sql:149-152`). Osobnego ruchu „nowy link” nie ma.
- Inna utrata dostępu: S-04, powrót na swój nick z innego urządzenia (`admit_latecomer`, `20261103151953_rejoin_after_refresh.sql:439-476`). Stare urządzenie dostaje `null`, ale zna już klucz. To ta sama osoba, więc wniosek: bez rotacji (decyzja 2 niżej).
- Wzorce:
  - nagłówek „same signature, create or replace” (`game_length.sql:24-42`);
  - kolumna z komentarzem (`:46-51`);
  - właściciel i granty (`:580-594`).
- Kolejność wdrożenia: `parseLobbyState` odrzuca brak wymaganego klucza (`src/lib/rooms/shared.ts:486-512`), więc `db push` przed scaleniem kodu.

### Worker i ekrany

- Typy i parsery w `src/lib/rooms/shared.ts`:
  - `LobbyState` (`:151-166`), `RoomView` (`:212-220`, `Omit` z `link_token`), `RoomState` (`:431`);
  - `parseRoomState` (`:436-477`), `parseLobbyState` (`:486-512`), `parseRoomView` (`:636-687`). Ten ostatni kopiuje tylko znane klucze, więc nienauczony parser po cichu zgubi klucz.
  - Mapowanie: `roomView()` (`src/lib/rooms/server.ts:315-340`).
- Klucz trafi do HTML strony danego gracza (props wyspy, `src/pages/r/[id].astro:92`), tak jak dziś `linkUrl` u prowadzących.
- Logi: `send()` loguje `roomId: room` (`src/lib/live-sync/server.ts:75-80`). Temat emotki trzeba przekazać osobno od `roomId`, żeby klucz nie trafił do logu; `logEvent` sprawdza nazwy pól, nie ich treść (`src/lib/log.ts`).
- Subskrypcje:
  - Dziś dzwonki i emotki są na jednym kanale (`useRoomState.ts:317-328`), a koniec wieczoru ma osobny efekt (`:388-404`).
  - Emotki dostają własny efekt zależny od klucza, jeden dla pokoju żywego i zamkniętego. Klucz w zależnościach głównego efektu rozbijałby limiter i poll przy każdej rotacji.
  - Jeden klient Realtime na stronę, bo `sleepableRealtime` (`tests/e2e/support/realtime.ts:15-45`) śledzi tylko ostatni WebSocket.
- Podglądy:
  - `src/pages/dev/room-states.astro`: `seat()` (`:221-227`) i literały (`:1139-1188`);
  - `src/pages/dev/room-window.astro`: `seat()` (`:129-135`) i literały.
  - Nowego stanu pokoju nie ma.

### Testy

- Do aktualizacji:
  - `LOBBY_KEYS` (`tests/db/support/rounds.ts:223-253`): dokładny zbiór, używany w 13 sprawdzonych asercjach;
  - `tests/unit/room-state.test.ts`: `VIEW_KEYS` (`:1144-1161`) i fixtures.
- Wzory:
  - rotacja i „kto dostaje”: `tests/db/remove-player.test.ts:205-229,515-519`;
  - „każdy gracz w każdym stanie”: `tests/db/game-length.test.ts:259-336`.
- e2e:
  - Dziś brak surowego klienta Realtime w testach. Da się go zrobić w Node, jak `tests/db/support/clients.ts:13-16`: URL i klucz publiczny z `GET /api/live-sync/config`, klucz kanału z `page.request.get('/api/rooms/<id>/lobby')` danego gracza.
  - Przypadek do napisania: przed usunięciem słuchacz starego klucza dostaje emotkę (kontrola pozytywna); po usunięciu już nie, a słuchacz nowego klucza dostaje.
- `context/foundation/test-plan.md` §6:
  - wyrocznia z decyzji, odmowa jako kod, kontrola pozytywna;
  - `test.fails` „znana dziura”;
  - próbny alarm, np. „trasa emotki nadaje na temat publiczny” albo „`remove_player` nie zmienia klucza”.

### Decyzje dla planu

1. W-A′ (po kluczu tylko emotki) zamiast pełnego W-A. Rekomendacja: W-A′.
2. S-04, miejsce przeniesione na inne urządzenie: bez rotacji klucza. Rekomendacja: bez rotacji.
3. Słownik: „klucz kanału”, nowy wiersz „kanał na żywo” (dziś go nie ma) i dopisek przy „usunięcie gracza”.
