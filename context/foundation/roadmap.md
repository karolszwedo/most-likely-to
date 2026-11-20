---
project: "Most Likely To"
version: 1
status: draft
created: 2026-09-26
updated: 2026-11-19
prd_version: 1
main_goal: learn
top_blocker: skills
milestone_id: live-game-nights-v1
milestone_seq: 1
milestone_status: open
---

# Roadmap: Most Likely To

> Na podstawie `context/foundation/prd.md` (v1) i automatycznego przeglądu kodu.
> Edytuj w miejscu; archiwizuj, gdy zostanie zastąpiona.
> Elementy niżej są w kolejności zależności. Tabela „At a glance” to spis treści.

## Milestone

**M-01: Ekipa gra wieczory na żywo (v1)** — Status: open

Kamień milowy to zestaw elementów, który zamyka się, gdy wszystkie są zrobione, a nie w konkretnym terminie.

- **Intent:** Pierwsza wersja gry obsługuje prawdziwe wieczory: host zakłada grę, ekipa gra rundy na żywo z anonimowymi głosami, a pytania dobierają się coraz lepiej. Pierwszy punkt kontrolny to S-02 (w PRD: „pokój + runda działają z 3 osobami”).
- **Source materials:** `context/foundation/prd.md` (v1); pomocniczo `context/foundation/tech-stack.md`, `context/foundation/infrastructure.md` i `context/deployment/deploy-plan.md`.
- **Done when:** każdy element F-NN i S-NN niżej ma status `done`.
- **Scope anchors:** US-01 oraz wszystkie konieczne wymagania: FR-001–FR-009 i FR-011–FR-020. Dodatki zdjęte z Parked: FR-024 (S-14), FR-022 (S-15) i FR-023 w wersji z samymi emotkami (S-16, decyzja hosta 2026-10-26), a potem czat w pokoju z gifami (FR-028, S-23 i S-24, decyzja hosta 2026-11-17); FR-021 zostaje w Parked.

## Vision recap

Ekipa znajomych umawia się na Discordzie na „Kto z nas najprawdopodobniej…”, a jedynym narzędziem była ręcznie budowana ankieta w Google Forms, czytana tydzień później. Hipoteza hosta, czyli założenie, które gra ma dopiero sprawdzić, brzmi: brakuje wspólnej rundy na żywo (każdy z telefonem, odsłona i rozmowa od razu), puli pytań z kategoriami, która zostaje między wieczorami, oraz doboru pytań uczącego się z rozgrywek. Skala: do około stu użytkowników.

## North star

**S-02: Ekipa rozgrywa pierwszą rundę na żywo** — to gwiazda przewodnia, czyli najmniejszy element od początku do końca, którego działanie potwierdza hipotezę gry. Stoi tak wcześnie, jak pozwalają zależności, bo reszta ma sens tylko wtedy, gdy on działa. Przy celu „nauka” to także pierwsze prawdziwe użycie techniki na żywo sprawdzonej w F-01. Kryterium z US-01 o odświeżeniu strony domyka S-04.

## At a glance

| ID   | Change ID                    | Outcome (user can …)                                                                                                | Prerequisites    | PRD refs                                                  | Status      |
| ---- | ---------------------------- | ------------------------------------------------------------------------------------------------------------------- | ---------------- | --------------------------------------------------------- | ----------- |
| F-01 | live-sync-spike              | (foundation) Technika na żywo sprawdzona: kanał-dzwonek + stan z serwera, 20 graczy, 95% w ≤ 2 s, max 5 s           | —                | FR-007, FR-009, NFR (≤ 2 s, 20 graczy, prywatność głosów) | done        |
| F-02 | starter-question-base        | (foundation) Baza startowa pytań po polsku w kilku kategoriach, zatwierdzona przez twórcę gry                       | —                | FR-005, FR-015, Access Control (twórca gry)               | done        |
| S-01 | room-lobby                   | Host tworzy pokój z kategoriami (18+ osobno w każdej) i linkiem; goście wchodzą z nickiem, a host widzi ich na żywo | F-01, F-02       | US-01, FR-002, FR-005                                     | done        |
| S-02 | first-live-round             | Wszyscy widzą to samo pytanie, głosują anonimowo i widzą odsłonę po ostatnim głosie                                 | S-01, F-01, F-02 | US-01, FR-006, FR-007, FR-008, FR-009, FR-015             | done        |
| S-03 | full-game-evening            | Prowadzący przechodzi do kolejnych pytań, pomija rundę i kończy grę z potwierdzeniem                                | S-02             | FR-006, FR-015                                            | done        |
| S-04 | rejoin-after-refresh         | Gracz po odświeżeniu wraca na swój nick w bieżącej rundzie, z oddanym głosem                                        | S-02             | US-01, FR-011                                             | done        |
| S-05 | one-click-host-login         | Host loguje się jednym kliknięciem, bez hasła, z zapasową drogą logowania                                           | —                | FR-001                                                    | done        |
| S-06 | question-list-review         | Host może przed startem przejrzeć i poprawić wylosowaną listę pytań                                                 | S-02             | FR-012                                                    | done        |
| S-07 | co-host-role                 | Host nadaje i odbiera współhosta, który może prowadzić rundy                                                        | S-03             | FR-003, FR-006, FR-020                                    | in-progress |
| S-08 | latecomer-admission          | Spóźniony prosi o wejście, prowadzący go wpuszcza, a on głosuje od następnej rundy                                  | S-03             | FR-020                                                    | done        |
| S-09 | remove-player-new-link       | Prowadzący usuwa gracza, a pokój dostaje nowy link                                                                  | S-07             | FR-004                                                    | in-progress |
| S-10 | guest-question-proposals     | Gość proponuje pytania do limitu, a prowadzący zatwierdza je do listy tej gry                                       | S-07             | FR-013, FR-014                                            | done        |
| S-11 | question-reactions-play-data | Gracz daje kciuk na ekranie odsłony, a gra zbiera zbiorcze dane o pytaniach                                         | S-03, S-06       | FR-016, FR-018                                            | done        |
| S-12 | learning-question-selection  | Ekipa częściej dostaje pytania, które dobrze zagrały u innych ekip, a słabe przestają się pojawiać                  | S-11             | FR-017                                                    | proposed    |
| S-13 | host-game-history            | Host widzi listę swoich gier i kasuje wybraną; anonimowe dane o pytaniach zostają                                   | S-11             | FR-019                                                    | done        |
| S-14 | remembered-nick              | Ten sam telefon podpowiada ostatni nick przy wejściu do pokoju i przy nowej grze                                    | S-01             | FR-024, Access Control (gość)                             | done        |
| S-15 | game-summary                 | Na końcu gry wszyscy widzą podsumowanie wieczoru z wyróżnieniami, bez punktów i rankingu                            | S-03             | FR-022                                                    | done        |
| S-16 | room-emotes                  | Gracz jednym dotknięciem wysyła emotkę, którą na chwilę widzi cały pokój                                            | S-02             | FR-023                                                    | done        |
| S-17 | question-pool-in-db          | Prowadzący otwiera tylko pytania z kategorii wybranych przez hosta, także gdy woła bazę z pominięciem ekranu        | S-07             | FR-005                                                    | done        |
| S-18 | player-color-choice          | Gracz wybiera swój kolor z palety gry i ma go przez całą grę; dwóch graczy nie ma tego samego koloru                | S-01             | FR-025                                                    | done        |
| S-19 | game-length                  | Każdy gracz widzi, ile pytań ma gra, a po ostatnim pytaniu prowadzący kończy grę albo dobiera kolejne               | S-03, S-06, S-10 | FR-012, FR-015, FR-026                                    | done        |
| S-20 | no-recent-repeats            | Gra bierze na końcu pytania, które padły w innych grach tego samego hosta, najdawniej grane najpierw                | S-17, S-19       | FR-015                                                    | done        |
| S-21 | home-screen-icon             | Gracz dodaje grę do ekranu głównego telefonu i otwiera ją z ikony gry; karta linku pokazuje obrazek gry             | S-01             | FR-027                                                    | in-progress |
| S-22 | security-hardening           | Pokój mieści do 50 graczy, konto zakłada do 60 gier na godzinę, a głos nigdy nie trafia do adresu strony            | S-01, S-08, S-20 | FR-002, FR-008, FR-020, NFR (50 graczy, anonimowy głos)   | done        |
| S-23 | room-chat                    | Gracz pisze krótkie wiadomości na czacie pokoju; wszyscy widzą je na żywo z jego nickiem, nic się nie zapisuje      | S-16, S-09       | FR-028, NFR (czat nieanonimowy, treść bez zapisu)         | done        |
| S-24 | room-chat-gifs               | Gracz wyszukuje gifa i wysyła go na czat pokoju; wyszukiwarka bez treści dla dorosłych                              | S-23             | FR-028, FR-023                                            | in-progress |
| S-25 | game-restyle                 | Gracz widzi każdy ekran gry w jednym ciemnym wyglądzie: grafit, kolor Blurple, guziki-pigułki, kafelki graczy       | —                | FR-029                                                    | in-progress |

## Streams

Pomoc w nawigacji: grupuje elementy o wspólnym łańcuchu zależności. Kanoniczna kolejność to graf zależności niżej; ta tabela to proponowana kolejność czytania równoległych ścieżek.

| Stream | Theme               | Chain                                                        | Note                                                                                                                                                                                                                                                                                                                     |
| ------ | ------------------- | ------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| A      | Runda na żywo       | `F-01` → `S-01` → `S-02` → `S-03` → `S-04`                   | Najpierw technika na żywo (cel „nauka”), potem gwiazda przewodnia S-02 i pełny wieczór.                                                                                                                                                                                                                                  |
| B      | Pytania i dane gier | `F-02` → `S-06` → `S-11` → `S-20` → `S-12` → `S-13`          | F-02 dołącza do A przy S-01; S-06 rusza po S-02, a S-11 czeka też na S-03. S-20 (z S-12, 2026-11-15) stoi na losowaniu z S-17 i S-19 i idzie przed S-12, które czeka na dane z wieczorów.                                                                                                                                |
| C      | Prowadzący i goście | `S-07` → `S-08` → `S-09` → `S-10`                            | Rusza po S-03 ze ścieżki A; S-08 idzie przed S-07 z samym hostem; S-09 i S-10 czekają na S-07.                                                                                                                                                                                                                           |
| D      | Logowanie hosta     | `S-05`                                                       | Niezależne od reszty; czeka tylko na wybór dostawców logowania.                                                                                                                                                                                                                                                          |
| E      | Dodatki             | `S-14` → `S-15` → `S-16` → `S-21` → `S-23` → `S-24` → `S-25` | Dodatki „miło mieć” zdjęte z Parked (hosta 2026-10-25/26); S-15 czeka na S-03, S-16 na S-02, S-21 (ikona gry, 2026-11-16) na S-01. Czat (2026-11-17): S-23 stoi na S-16 i dołącza do C przy S-09, S-24 (gify) na S-23. S-25 (nowy wygląd, 2026-11-19) nie stoi na niczym, ale idzie po czacie, żeby objąć i jego ekrany. |

## Baseline

Stan kodu na 2026-09-26 (automatyczny przegląd, potwierdzony przez właściciela projektu). Fundamenty niżej zakładają, że to istnieje, i nie budują tego od nowa.

- **Frontend:** present — Astro 7 SSR z wyspami React, Tailwind i shadcn/ui (`astro.config.mjs:11-12`); są tylko ekrany startera (`index`, `dashboard`, `auth/*`), po angielsku (`src/layouts/Layout.astro:14`), bez ekranów gry.
- **Backend / API:** present — trasy logowania i middleware (`src/pages/api/auth/*.ts`, `src/middleware.ts`); brak logiki gry i brak jakiegokolwiek mechanizmu na żywo (WebSocket, SSE, kanały, odpytywanie).
- **Data:** partial — klient Supabase podłączony (`src/lib/supabase.ts:9`), ale bez schematu, migracji i tabel (`supabase/` ma tylko `config.toml`); aplikacja korzysta wyłącznie z wbudowanego logowania.
- **Auth:** present — Supabase Auth, tylko e-mail i hasło (`src/pages/api/auth/signin.ts:13`, `src/pages/api/auth/signup.ts:13`), sesje w ciasteczkach, middleware chroni `/dashboard` (`src/middleware.ts:4`); brak logowania jednym kliknięciem i brak tożsamości gościa (nicku).
- **Deploy / infra:** present — Cloudflare Workers (`wrangler.jsonc`), produkcja pod https://most-likely-to.charlesonthewave.workers.dev; Workers Builds wdraża każdy push do `main`, a GitHub Actions uruchamia lint, `astro check`, build i smoke (`.github/workflows/ci.yml`, `context/deployment/deploy-plan.md`).
- **Observability:** partial — logi Workers włączone (`wrangler.jsonc:12-13`), test dymny w CI (`scripts/smoke.mjs`); brak logów w kodzie i śledzenia błędów.

## Foundations

### F-01: Test techniki na żywo (spike)

- **Outcome:** (foundation) Technika na żywo jest sprawdzona w prototypie: publiczny kanał Supabase Realtime niesie tylko sygnał „coś się zmieniło” (dzwonek), a stan przeglądarka pobiera z serwera. Dzwonek może nadać każdy, kto zna nazwę kanału, więc stan pochodzi wyłącznie z bazy, nigdy z treści dzwonka. W trakcie rundy stan pokazuje tylko, kto już zagłosował; liczby głosów dopiero przy odsłonie, nigdy „kto na kogo”. Kryterium: 95% dostarczeń do 20 graczy w ≤ 2 s, żadne powyżej 5 s; spełnione na produkcji 2026-10-04 (100% w 2 s, max 247 ms; `context/archive/2026-09-27-live-sync-spike/measurements.md`).
- **Change ID:** live-sync-spike
- **PRD refs:** FR-007, FR-009, NFR (≤ 2 s, 20 graczy, prywatność głosów)
- **Unlocks:** S-01 (goście pojawiają się u hosta na żywo), S-02 (wspólne pytanie i odsłona), ścieżka weryfikacji „20 graczy, odsłona w ≤ 2 s” dla S-02
- **Prerequisites:** —
- **Parallel with:** F-02, S-05
- **Blockers:** —
- **Unknowns:**
  - Jak gość bez konta odbiera zdarzenia pokoju, żeby kanał nie był otwarty dla obcych? Rozstrzygnięte w F-01 (2026-10-04): kanał jest publiczny, ale niesie tylko dzwonek, a stan gość pobiera z serwera. — Owner: Karol. Block: no.
- **Risk:** To pierwsze zetknięcie z techniką, której w projekcie nikt jeszcze nie budował (główne ryzyko: umiejętności); lepiej, żeby jej problemy wyszły w krótkim teście niż w środku rundy.
- **Status:** done

### F-02: Baza startowa pytań

- **Outcome:** (foundation) Pierwsza wspólna baza pytań po polsku, w kilku kategoriach, jest spisana, zatwierdzona przez twórcę gry i gotowa do wczytania.
- **Change ID:** starter-question-base
- **PRD refs:** FR-005, FR-015, Access Control (twórca gry)
- **Unlocks:** S-01 (wybór kategorii przy tworzeniu pokoju), S-02 (losowanie pytań do rundy)
- **Prerequisites:** —
- **Parallel with:** F-01, S-05
- **Blockers:** —
- **Unknowns:**
  - Ile pytań i jakie kategorie na start? — Owner: Karol. Block: no.
  - Jakie pytania „most likely to” działają najlepiej (Open Roadmap Question 7)? — Owner: Karol. Block: no.
- **Risk:** Bez pytań nie ma rundy, a słaba baza zepsuje pierwsze wieczory bardziej niż błąd w kodzie; to praca twórcy gry, którą można robić równolegle z F-01.
- **Status:** done

## Slices

### S-01: Pokój i poczekalnia

- **Outcome:** Host tworzy pokój, wybiera kategorie (przy każdej osobno decyduje, czy dołączyć jej pytania 18+) i dostaje link do wklejenia na Discordzie; gość otwiera link na telefonie, wpisuje nick (zajęty nick jest odrzucany) i trafia do pokoju, a host widzi dołączających na żywo.
- **Change ID:** room-lobby
- **PRD refs:** US-01, FR-002, FR-005
- **Prerequisites:** F-01, F-02
- **Parallel with:** S-05
- **Blockers:** —
- **Unknowns:** —
- **Risk:** Pierwszy element, który łączy zalogowanego hosta, gości bez konta i działanie na żywo; od niego zależy każda późniejsza runda.
- **Status:** done

### S-02: Pierwsza runda na żywo

- **Outcome:** Host klika „start”; wszyscy w pokoju widzą to samo pytanie z wybranych kategorii (18+ tylko z tych, w których host je dołączył), każdy wskazuje jedną osobę z listy nicków (także siebie) albo się wstrzymuje, wszyscy widzą, kto już zagłosował, a po ostatnim głosie lub przewinięciu przez prowadzącego widzą odsłonę: ile głosów dostała każda osoba.
- **Change ID:** first-live-round
- **PRD refs:** US-01, FR-006, FR-007, FR-008, FR-009, FR-015
- **Prerequisites:** S-01, F-01, F-02
- **Parallel with:** S-05
- **Blockers:** —
- **Unknowns:** —
- **Risk:** Tu pierwszy raz zapisujemy głosy, więc para „kto na kogo” nie może trafić do bazy, logów ani kanału na żywo; to twarda zasada gry, nie szczegół do poprawienia później. Z przeglądu S-01 (`context/archive/2026-10-07-room-lobby/follow-ups/review-fixes.md`): host ma dziś bezpośrednie `update (status)` na `rooms`, więc przy stanach gry musi dostać tylko dozwolone przejścia; dzwonek potrzebuje ogranicznika, bo pójdzie przy każdym głosie. Ta sama migracja domyka regułę nicku (F4, decyzja z 2026-10-10): niewidoczne znaki, które reguła dziś pomija (m.in. selektory wariantu i znaczniki), i limit długości przed normalizacją; o emotkach, którym FE0F naprawdę zmienia wygląd, decyzja zapada przy tej poprawce. Kryteria akceptacji: testy „znana dziura F1 → S-02” (`tests/db/roles.test.ts`) i „znana dziura F4 → S-02” (`tests/db/nicks.test.ts`) przechodzą, a znacznik `test.fails` zostaje zdjęty.
- **Status:** done

### S-03: Pełny wieczór

- **Outcome:** Prowadzący przechodzi do kolejnego pytania (bez powtórek w tej grze), może pominąć rundę (jej głosy przepadają i nie liczą się do jakości pytania) i kończy grę po potwierdzeniu; po ostatnim pytaniu ekipa widzi koniec wieczoru bez punktacji.
- **Change ID:** full-game-evening
- **PRD refs:** FR-006, FR-015
- **Prerequisites:** S-02
- **Parallel with:** S-04, S-05, S-06
- **Blockers:** —
- **Unknowns:** —
- **Risk:** Zamienia jedną rundę w wieczór z 10 pytaniami, czyli główne kryterium sukcesu; przypadkowe „koniec gry” zabiłoby wieczór, stąd potwierdzenie.
- **Status:** done

### S-04: Powrót po odświeżeniu

- **Outcome:** Gracz, który odświeży stronę albo straci połączenie, w mniej niż 10 s wraca na swój nick w bieżącej rundzie i widzi swój oddany głos; nikt inny nie może w tym czasie przejąć jego nicku.
- **Change ID:** rejoin-after-refresh
- **PRD refs:** US-01, FR-011
- **Prerequisites:** S-02
- **Parallel with:** S-03, S-05, S-06 i każdy późniejszy element (nic od niego nie zależy)
- **Blockers:** —
- **Unknowns:**
  - Czy przywrócenie oddanego głosu może działać tylko na tym samym urządzeniu (głos pamięta telefon gracza, a serwer nie przechowuje pary „kto na kogo”)? — Owner: Karol. Block: no. **Rozstrzygnięte 2026-11-03: tak** (D1: `sessionStorage` karty do końca rundy, wyjątek w AGENTS.md i PRD); gracz bez ciasteczka wraca prośbą zatwierdzaną przez prowadzącego (D2). Plan: `context/archive/2026-11-03-rejoin-after-refresh/plan.md`.
- **Risk:** Przywracanie głosu ściera się z zasadą, że „kto na kogo” nigdy nie jest do odzyskania; trzeba to rozstrzygnąć przy planowaniu, zanim kod gdziekolwiek zapisze tę parę.
- **Status:** done

### S-05: Logowanie hosta jednym kliknięciem

- **Outcome:** Host loguje się jednym kliknięciem przez zewnętrznego dostawcę, bez rejestracji i hasła; ten sam e-mail oznacza tego samego hosta także przy zapasowej drodze logowania.
- **Change ID:** one-click-host-login
- **PRD refs:** FR-001
- **Prerequisites:** —
- **Parallel with:** każdy inny element (nie dzieli z nimi zależności)
- **Blockers:** —
- **Unknowns:**
  - Którzy dostawcy logowania i jaka droga zapasowa (drugi dostawca czy e-mail)? Rozstrzygnięte 2026-10-06: Discord (główny) + Google (zapasowy), „Confirm email” włączone; logowanie hasłem zostaje dla istniejących kont, rejestracja z hasłem w Parked (`context/archive/2026-10-04-one-click-host-login/research.md`, sekcja „Decyzja”). — Owner: Karol. Block: no.
- **Risk:** Do tego czasu host loguje się e-mailem i hasłem ze startera, co wystarcza do gry z własną ekipą; przed zaproszeniem obcych hostów ten element musi być gotowy.
- **Status:** done

### S-06: Przegląd listy pytań przed startem

- **Outcome:** Host może przed startem przejrzeć wylosowaną listę pytań tej gry: usunąć pytanie, dolosować nowe, poprawić treść albo dodać własne; domyślną ścieżką zostaje „start teraz” bez przeglądania.
- **Change ID:** question-list-review
- **PRD refs:** FR-012
- **Prerequisites:** S-02
- **Parallel with:** S-03, S-04, S-05
- **Blockers:** —
- **Unknowns:** —
- **Risk:** Przegląd nie może spowolnić ścieżki „gra w mniej niż 5 minut”, dlatego zostaje opcjonalny.
- **Status:** done

### S-07: Współhost

- **Outcome:** Host nadaje i odbiera rolę współhosta graczowi w pokoju; współhost może startować, pomijać i kończyć rundy, więc wieczór trwa dalej, gdy host wyjdzie.
- **Change ID:** co-host-role
- **PRD refs:** FR-003, FR-006, FR-020
- **Prerequisites:** S-03
- **Parallel with:** S-04, S-05, S-06, S-08
- **Blockers:** —
- **Unknowns:** —
- **Risk:** Wprowadza drugą rolę prowadzącego, na której opierają się S-09 i S-10; S-08 idzie wcześniej z samym hostem (decyzja 2026-10-22), a S-07 dopisze współhosta do wpuszczania spóźnionych.
- **Status:** in-progress

### S-08: Wpuszczanie spóźnionych

- **Outcome:** Spóźniony gracz prosi o wejście do trwającej gry z wybranym nickiem; prośba jest widoczna dla hosta na każdym ekranie (współhosta dopisze S-07), także w trakcie głosowania; wpuszczony widzi bieżącą rundę i głosuje od następnej.
- **Change ID:** latecomer-admission
- **PRD refs:** FR-020
- **Prerequisites:** S-03
- **Parallel with:** S-04, S-06, S-07, S-09, S-10, S-11
- **Blockers:** —
- **Unknowns:** —
- **Risk:** Powiadomienie „na każdym ekranie” to kolejne zdarzenie na żywo; sprawdza, czy synchronizacja z F-01 działa także poza samą rundą.
- **Status:** done

### S-09: Usunięcie gracza i nowy link

- **Outcome:** Host lub współhost usuwa gracza z pokoju; pokój dostaje nowy link, a stary przestaje działać.
- **Change ID:** remove-player-new-link
- **PRD refs:** FR-004
- **Prerequisites:** S-07
- **Parallel with:** S-08, S-10, S-11
- **Blockers:** —
- **Unknowns:**
  - Co z głosami oddanymi na gracza i przez gracza usuniętego w środku rundy (Open Roadmap Question 3; propozycja: przepadają)? Rozstrzygnięte 2026-10-31 (decyzja 1): głosy na usuniętego przepadają, głos oddany przez niego zostaje policzony, a jeśli jeszcze nie głosował, runda przestaje na niego czekać i odsłania się sama, gdy zagłosuje reszta (`context/changes/remove-player-new-link/research.md`, „Decyzje do planu”). — Owner: Karol. Block: no.
- **Risk:** Zmiana linku w trakcie gry nie może wyrzucić pozostałych graczy, dlatego ten element idzie po rundzie na żywo i po współhoście.
- **Status:** in-progress

### S-10: Propozycje pytań od gości

- **Outcome:** Gość proponuje pytania z linku do pokoju w trakcie wieczoru, do limitu na grę; host lub współhost zatwierdza albo odrzuca, a zatwierdzone trafiają do listy tej gry.
- **Change ID:** guest-question-proposals
- **PRD refs:** FR-013, FR-014
- **Prerequisites:** S-07
- **Parallel with:** S-08, S-09, S-11
- **Blockers:** —
- **Unknowns:**
  - Ile propozycji na gościa w jednej grze (Open Roadmap Question 4; propozycja: około 3)? Rozstrzygnięte 2026-11-04 (decyzja 4): 3 na gracza w jednej grze, także na hosta i współhosta, a odrzucone też się liczą (`context/archive/2026-11-04-guest-question-proposals/plan.md`). — Owner: Karol. Block: no.
  - Gdzie czekają zatwierdzone propozycje na przegląd twórcy gry, skoro w v1 odbywa się on poza aplikacją (FR-021 w Parked)? Rozstrzygnięte 2026-11-04: zostają na liście pytań gry, w `private.game_questions` ze znacznikiem `proposed`, bez autora, a twórca gry czyta je zapytaniem z `context/deployment/deploy-plan.md`. — Owner: Karol. Block: no.
- **Risk:** Zalew propozycji odciąga prowadzącego od gry; limit i szybkie zatwierdzanie chronią rytm wieczoru.
- **Status:** done

### S-11: Reakcje i dane o pytaniach

- **Outcome:** Gracz jednym dotknięciem daje kciuk w górę lub w dół na ekranie odsłony (nieobowiązkowo, bez blokowania prowadzącego), a gra zapisuje zbiorcze dane o każdym pytaniu: skupienie głosów, pominięcia, reakcje i usunięcia z list przed startem.
- **Change ID:** question-reactions-play-data
- **PRD refs:** FR-016, FR-018
- **Prerequisites:** S-03, S-06
- **Parallel with:** S-07, S-08, S-09, S-10
- **Blockers:** —
- **Unknowns:** —
- **Risk:** Dane o pytaniu muszą być wyłącznie zbiorcze (rozkład głosów, nigdy „kto na kogo”), bo zasila je każda ekipa i zostają po skasowaniu gry.
- **Status:** done

### S-12: Dobór pytań uczący się z rozgrywek

- **Outcome:** Ekipa częściej dostaje pytania, które dobrze zagrały u wszystkich ekip; nowe pytania dostają szansę przed oceną, a słabe przestają się pojawiać i czekają na twórcę gry. Losowanie bez pytań z ostatnich gier hosta wydzielone 2026-11-15 do S-20 (decyzja Karola).
- **Change ID:** learning-question-selection
- **PRD refs:** FR-017
- **Prerequisites:** S-11
- **Parallel with:** S-13 (nie z S-20, które zmienia to samo losowanie)
- **Blockers:** —
- **Unknowns:**
  - Od ilu zagrań pytanie jest oceniane i jak ważyć sygnały (Open Roadmap Question 6)? Na start proste wartości, strojenie po pierwszych wieczorach. — Owner: Karol. Block: no.
- **Risk:** Dobór ma sens dopiero na danych z kilku wieczorów, dlatego idzie po S-11 i czeka na pierwsze wieczory z ekipą (decyzja Karola 2026-11-15); strojenie wag na małych liczbach byłoby zgadywaniem.
- **Status:** proposed

### S-13: Lista gier hosta i kasowanie

- **Outcome:** Host widzi minimalną listę swoich gier (data, liczba pytań, kto grał) i kasuje dowolną; kasowanie usuwa wszystko, co wiąże się z nickami, a anonimowe dane o pytaniach zostają we wspólnej bazie, o czym aplikacja mówi wprost.
- **Change ID:** host-game-history
- **PRD refs:** FR-019
- **Prerequisites:** S-11
- **Parallel with:** S-12
- **Blockers:** —
- **Unknowns:** —
- **Risk:** Idzie po S-11, żeby kasowanie dało się sprawdzić na prawdziwych danych zbiorczych: nicki znikają, dane o pytaniach zostają. Kasowanie gry albo konta hosta zmieni ekran gościa z otwartą kartą: `/r/[id].astro` uznaje dziś za usuniętego (S-09, „Usunięto cię z pokoju.”) każdego z ciasteczkiem pokoju, dla którego `join_request_state` daje `none`, bo gracza kasuje tylko `remove_player` (przegląd S-09, F6). Kasowanie gry usunie kaskadą także zatwierdzone propozycje pytań z `private.game_questions` (S-10), także te, których twórca gry jeszcze nie przejrzał (FR-021).
- **Status:** done

### S-14: Zapamiętany nick

- **Outcome:** Gość, który wchodzi do pokoju z tego samego telefonu co ostatnio, ma już wpisany swój poprzedni nick i tylko klika „Dołącz”; host ma swój nick wpisany w formularzu „Nowa gra”. Nick da się zmienić przed wejściem.
- **Change ID:** remembered-nick
- **PRD refs:** FR-024, Access Control (gość)
- **Prerequisites:** S-01
- **Parallel with:** każdy element (nic od niego nie zależy)
- **Blockers:** —
- **Unknowns:** —
- **Risk:** Zapis w przeglądarce sąsiaduje z zasadą „głos tylko w pamięci”: zapamiętany może być wyłącznie nick, nigdy głos ani cel głosu.
- **Status:** done

### S-15: Podsumowanie wieczoru

- **Outcome:** Gdy gra się kończy (po ostatnim pytaniu albo gdy prowadzący zakończy ją wcześniej), wszyscy gracze na ekranie „Koniec wieczoru” widzą kilka wyróżnień z tej gry, np. „najwięcej głosów dziś” i „nikt dziś nie głosował na X”; bez punktów, miejsc i porównań z innymi wieczorami.
- **Change ID:** game-summary
- **PRD refs:** FR-022
- **Prerequisites:** S-03
- **Parallel with:** każdy element (nic od niego nie zależy)
- **Blockers:** —
- **Unknowns:**
  - Jakie wyróżnienia i ile (PRD podaje dwa przykłady)? Na start proste, liczone z samych odsłon tej gry. — Owner: Karol. Block: no.
  - Czy wyniki odsłon całej gry są jeszcze dostępne, gdy gra się kończy (urna znika przy każdej odsłonie)? Rozstrzygnięte 2026-10-25: tak, liczby na osobę z każdej odsłony zostają w bazie także po końcu gry, ale stan zamkniętego pokoju ich dziś nie oddaje (`context/archive/2026-10-25-game-summary/research.md`). — Owner: Karol. Block: no.
- **Risk:** Podsumowanie łatwo zamienić w tabelę wyników, a punkty i ranking są poza zakresem (PRD §Non-Goals); liczy się wyłącznie z wyników odsłon, które ekipa już widziała (pominięte pytania i wstrzymania się nie dają nikomu głosów), nigdy z par „kto na kogo”.
- **Status:** done

### S-16: Emotki do pokoju

- **Outcome:** Każdy gracz w pokoju (host i goście) może w trakcie gry jednym dotknięciem wysłać emotkę z krótkiej, stałej listy, a cały pokój widzi ją na chwilę na swoim ekranie; bez gifów, bez wpisywania tekstu i bez historii wiadomości. Emotka jest nieobowiązkowa i niczego nie blokuje.
- **Change ID:** room-emotes
- **PRD refs:** FR-023
- **Prerequisites:** S-02
- **Parallel with:** każdy element (nic od niego nie zależy)
- **Blockers:** —
- **Unknowns:**
  - Czy przy emotce widać nick nadawcy, czy leci anonimowo? — Owner: Karol. Block: no (rozstrzygnąć w planie).
  - Jakie emotki, ile i gdzie pojawiają się na ekranie (każdy ekran pokoju czy tylko głosowanie i odsłona)? — Owner: Karol, wybór na zrzutach. Block: no.
- **Risk:** To pierwsza treść od graczy, która idzie do całego pokoju na żywo, a kanał na żywo dziś niesie tylko dzwonek, który może nadać każdy znający jego nazwę; emotka nie może dać się podszyć pod gracza ani zalać pokoju, nie może zdradzić głosu (np. emotka „na kogoś” w trakcie głosowania) i nie zostawia śladu w bazie ani logach poza tym, czego gra potrzebuje. Gify i tekst zostają w Parked (PRD §Non-Goals: czat poza aplikacją).
- **Status:** done

### S-17: Pula pytań w bazie

- **Outcome:** Prowadzący (host albo współhost) może otworzyć tylko pytanie z kategorii wybranych przez hosta, a pytanie 18+ tylko z kategorii, w których host je włączył, także gdy woła funkcję bazy sam, z tokenem z ciasteczka, z pominięciem ekranu gry.
- **Change ID:** question-pool-in-db
- **PRD refs:** FR-005
- **Prerequisites:** S-07
- **Parallel with:** każdy element (nic od niego nie zależy)
- **Blockers:** —
- **Unknowns:**
  - Jak baza ma znać kategorie i 18+ pytań bazy startowej, które dziś są tylko w kodzie Workera (`src/data/questions.ts`)? — Owner: Karol. Block: no (rozstrzygnąć w researchu).
- **Risk:** Znana dziura F1 z przeglądu planu S-07 (`context/changes/co-host-role/reviews/plan-review.md`), przypięta testem `test.fails` „znana dziura F1 → S-17” w `tests/db/cohost.test.ts`: pulę sprawdza dziś tylko Worker (`poolFrom`, `src/lib/rounds/draw.ts`), a `start_game`, `next_round`, `skip_round` i `more_questions` (game-length) sprawdzają tylko format id, więc współhost, który zna technikę, może otworzyć pytanie 18+ spoza wyboru hosta. Wymaga złośliwego i technicznego gracza w pokoju; naprawa zmienia trzy ruchy prowadzącego i zaczerwienia `test.fails`.
- **Status:** done

### S-18: Wybór koloru przez gracza

- **Outcome:** Gracz (host i gość) wybiera swój kolor z palety gry i ma go przez całą grę: kropka przy nicku, kawałek koła odsłony i podsumowania, dymek emotki. Dwóch graczy w pokoju nie ma tego samego koloru, a kto nie wybierze, dostaje kolor sam.
- **Change ID:** player-color-choice
- **PRD refs:** FR-025 (nowy dodatek v1, do dopisania w PRD jak FR-024; decyzja Karola 2026-10-31)
- **Prerequisites:** S-01
- **Parallel with:** każdy element poza S-09 (S-09 korzysta z zapisanego koloru)
- **Blockers:** —
- **Unknowns:**
  - Kiedy gracz wybiera kolor (przy wejściu z nickiem czy w poczekalni) i czy może go zmienić w trakcie gry? — Owner: Karol. Block: no (rozstrzygnąć w researchu).
  - Wygląd wyboru (paleta 20 kolorów `chart-colors.ts` na telefonie) — Owner: Karol, wybór na zrzutach. Block: no.
- **Risk:** Kolor przestaje wynikać z miejsca przy stole (`seatColors`), więc trafia do bazy; zajęty kolor i równoczesne wybory dwóch graczy rozstrzyga baza. Kolor nie może zdradzić głosu ani zostać w danych o pytaniach. Słownik: usunięcie gracza (S-09) nie zmienia kolorów pozostałych.
- **Status:** done

### S-19: Długość gry widoczna dla wszystkich

- **Outcome:** Każda gra ma liczbę pytań: domyślnie 15, także gdy nikt nie otworzy listy, a po przeglądzie listy tyle, ile ma lista; zatwierdzona propozycja dodaje jedno pytanie, a pominięte pytanie zużywa jedno. Każdy gracz widzi tę liczbę w poczekalni, zmienianą na żywo przy ruchach hosta na liście, i przy każdym pytaniu („Pytanie 7 z 15”). Po ostatnim pytaniu gra nie otwiera następnego: prowadzący wybiera „Zakończ grę” albo „Jeszcze 5 pytań” (mniej, gdy w wybranych kategoriach zostało mniej niezagranych pytań), a licznik idzie dalej („Pytanie 16 z 20”). Gra nadal nie kończy się sama.
- **Change ID:** game-length
- **PRD refs:** FR-012, FR-015, FR-026 (nowy dodatek v1, decyzja hosta 2026-11-07)
- **Prerequisites:** S-03, S-06, S-10
- **Parallel with:** każdy element poza S-12 i S-17, które zmienią to samo losowanie (`private.open_next_round`) i ruchy prowadzącego
- **Blockers:** —
- **Unknowns:**
  - Czy 15 pytań wypełnia wieczór, a przystanek po ostatnim pytaniu nie psuje rytmu gry? — Owner: host, przy grze z ekipą. Block: no.
- **Risk:** Zastępuje zasadę „wieczór się nie urywa” z S-06 (decyzja D1 z S-03): gra nie losuje już po cichu z wybranych kategorii, aż się skończą, tylko staje po ostatnim pytaniu, a grę dalej kończy prowadzący. Liczba pytań trafia do każdego gracza, także gościa bez roli, więc musi zostać samą liczbą, nigdy treścią listy; wzrost liczby mówi autorowi propozycji o zatwierdzeniu chwilę przed rundą (przyjęty wyjątek od decyzji 5 S-10). Nowy Worker wymaga klucza `question_count` w stanie pokoju, więc wdrożenie idzie „baza, potem kod”, poza grą. `more_questions`, jak `next_round`, sprawdza tylko format id pytania, więc znana dziura F1 (S-17) obejmuje też „Jeszcze 5 pytań”.
- **Status:** done

### S-20: Bez powtórek z ostatnich gier hosta

- **Outcome:** Gra losuje najpierw pytania, których ten sam host nie grał w innych grach, a te, które już padły, bierze na końcu, najdawniej grane najpierw. Ekipa nie dostaje więc pytań, które host zna już z gier testowych i poprzednich wieczorów, dopóki w wybranych kategoriach są niegrane. Dotyczy każdego losowania pytań w grze.
- **Change ID:** no-recent-repeats
- **PRD refs:** FR-015 (część „bez pytań z ostatnich wieczorów hosta”; wydzielone z S-12, decyzja Karola 2026-11-15)
- **Prerequisites:** S-17, S-19 (to samo losowanie; oba na produkcji)
- **Parallel with:** każdy element poza S-12, które zmieni to samo losowanie
- **Blockers:** —
- **Unknowns:**
  - Co znaczy „ostatnie gry hosta”: ile gier wstecz albo jak dawno? Rozstrzygnięte 2026-11-15 (Karol, po researchu): wszystkie gry hosta, bez limitu „N ostatnich” i bez zapominania po czasie; jako zagrane liczą się każda runda, także pominięta i przerwana bez odsłony, i każdy wpis listy pytań gry z pytaniem z bazy, także usunięty przed startem i przeredagowany (`context/archive/2026-11-15-no-recent-repeats/research.md`, „Open Questions”). — Owner: Karol. Block: no.
  - Co losuje gra, gdy w wybranych kategoriach skończą się pytania spoza ostatnich gier hosta (Open Roadmap Question 5)? Rozstrzygnięte 2026-11-15 (Karol): najpierw pytania grane u tego hosta najdawniej, a gdy świeżych jest za mało, świeże i reszta z najdawniej granych. — Owner: Karol. Block: no.
  - Gra skasowana przez hosta (S-13) wypada z ostatnich gier razem ze swoimi rundami, więc jej pytania mogą się u tego hosta szybciej powtórzyć. Czy to uwzględnić? Rozstrzygnięte 2026-11-15 (Karol): nie, skasowana gra wypada z historii hosta razem ze swoimi rundami i listą pytań gry, bo kasowanie ma zostawić tylko anonimowe dane o pytaniach (`context/archive/2026-11-15-no-recent-repeats/research.md`, „Open Questions”). — Owner: Karol. Block: no.
- **Risk:** Wydzielone z S-12, bo nie potrzebuje danych z wieczorów, a ekipa odczuje je od pierwszej gry: host przed wieczorem przegrał wiele pytań w grach testowych. Historia gier hosta może mówić tylko, które pytania padły, nigdy kto na kogo głosował. Przy jednej wybranej kategorii niezagrane pytania kończą się po dwóch grach, więc „najdawniej grane najpierw” (Open Roadmap Question 5) zadziała już w trzeciej.
- **Status:** done

### S-21: Ikona gry na ekranie głównym telefonu

- **Outcome:** Gracz (host albo gość) dodaje grę z menu przeglądarki do ekranu głównego telefonu: ma tam ikonę gry („Wynik z pytajnikiem”, wybór Karola) z podpisem „Most Likely To”, a gra otwiera się z niej bez paska przeglądarki. Karta linku do pokoju na Discordzie pokazuje obrazek gry. Ikona i jej pliki są od razu w formacie Google Play, ale sama aplikacja ze sklepu zostaje w Parked.
- **Change ID:** home-screen-icon
- **PRD refs:** FR-027 (nowy dodatek v1, decyzja hosta 2026-11-16)
- **Prerequisites:** S-01 (strona linku do pokoju i jej karta z `join-page-ui`)
- **Parallel with:** każdy element; nie zmienia bazy ani serwera gry
- **Blockers:** —
- **Unknowns:**
  - Czy host zaloguje się z ikony na iPhonie (osobne dane aplikacji z ekranu początkowego, logowanie wychodzi do Google albo Discorda i wraca)? — Owner: Karol, ręczne sprawdzenie na telefonie. Block: no.
- **Risk:** Bez service workera Chrome nie podsuwa instalacji sam, więc ikona nie przeszkadza w grze, ale też nikt się o niej nie dowie bez podpowiedzi. Obrazek karty linku nie może nieść danych pokoju (jak tekst karty z `join-page-ui`).
- **Status:** in-progress

### S-22: Poprawki z przeglądu bezpieczeństwa

- **Outcome:** Pokój mieści najwyżej 50 graczy razem z hostem: 51. gość z linku, spóźniony z prośbą o wejście i „Wpuść” prowadzącego dostają „W tym pokoju jest już 50 graczy. Więcej się nie zmieści.”, a gracz, który wraca na swój nick, wchodzi jak dotąd. Jedno konto zakłada najwyżej 60 gier w ciągu godziny. „Zagłosuj” działa dopiero, gdy strona się załaduje, więc głos nigdy nie trafia do adresu strony. Strony gry mają nagłówki bezpieczeństwa i przeglądarka ich nie zapamiętuje, a formularze odrzucają za duże dane. Dla ekipy gra działa jak dotąd.
- **Change ID:** security-hardening
- **PRD refs:** FR-002, FR-008, FR-020, NFR (sufit 50 graczy zamiast „brak limitu graczy”, decyzja Karola 2026-11-16; anonimowy głos)
- **Prerequisites:** S-01, S-08, S-20 (wejście z linku, prośba spóźnionego i start gry z pulą kandydatów, które ta zmiana zaostrza; wszystkie na produkcji)
- **Parallel with:** każdy element; kolejna zmiana `start_game`, `join_room`, `request_join`, `admit_latecomer` albo `create_room` idzie po migracji tej zmiany
- **Blockers:** —
- **Unknowns:**
  - Ilu graczy mieści pokój i ile gier może założyć jedno konto? Rozstrzygnięte 2026-11-16 (Karol): 50 graczy razem z hostem, wyraźnie ponad sprawdzane 20, więc sufit wychodzi z Parked; 60 nowych gier na konto w ciągu godziny, z zapasem nad 37 gier jednego przebiegu e2e; obie liczby Karol może zmienić (`context/archive/2026-11-16-security-hardening/plan.md`). — Owner: Karol. Block: no.
- **Risk:** Zmiana z przeglądu bezpieczeństwa całej gry (16.11.2026). Jedna migracja zamyka starą ścieżkę `p_question_id` w `start_game` (S-20 F3), więc Worker sprzed S-20 nie zacznie już gry, a wdrożenie idzie „baza, potem kod”, poza grą. Zmieniony formularz głosu leży na głównej ścieżce gry: gdy skrypt strony się nie załaduje, gracz nie zagłosuje, zamiast zostawić głos w adresie. Nagłówek `no-store` wyłącza też szybki powrót do strony gry przyciskiem „wstecz”.
- **Status:** done

### S-23: Czat w pokoju: krótkie wiadomości

- **Outcome:** Każdy gracz w pokoju (host, współhost i gość bez roli) pisze krótkie wiadomości na czacie pokoju, a cały pokój widzi je na żywo z jego nickiem: w poczekalni, w trakcie gry (także w głosowaniu) i na końcu wieczoru. Nikt nie napisze z cudzym nickiem, a usunięty gracz przestaje widzieć i pisać. Wiadomości nie zostają nigdzie, ani w bazie, ani w logach, więc po odświeżeniu strony albo dla wpuszczonego spóźnionego czat zaczyna się od tej chwili. Czat jest nieobowiązkowy i niczego w grze nie blokuje.
- **Change ID:** room-chat
- **PRD refs:** FR-028 (część „krótkie wiadomości”; nowy dodatek v1, decyzja hosta 2026-11-17), NFR (czat nieanonimowy, treść bez zapisu)
- **Prerequisites:** S-16 (emotki: pierwsza treść od graczy na kanale na żywo), S-09 (usunięcie gracza zmienia klucz kanału, `players-only-live-channel`; oba na produkcji)
- **Parallel with:** każdy element poza S-24, które stoi na tym czacie
- **Blockers:** —
- **Unknowns:**
  - Ile znaków ma wiadomość i ile wiadomości w krótkim czasie może wysłać jeden gracz? Rekomendacja w planie, liczby Karol może zmienić. Rozstrzygnięte 2026-11-17 (właściciel): do 200 znaków (polska litera i emoji to jeden znak) i 2 s pauzy między wiadomościami jednego gracza (`context/archive/2026-11-17-room-chat/change.md`). — Owner: Karol. Block: no.
  - Gdzie czat stoi na ekranie telefonu, żeby nie zasłaniał pytania i guzików głosu? Warianty na zrzutach. Rozstrzygnięte 2026-11-17 (właściciel, galeria zrzutów): na telefonie guzik „Czat” z liczbą nowych wiadomości nad paskiem emotek, który rozwija panel z listą i polem (T2); na laptopie od `xl` panel czatu przy lewej krawędzi okna (L3) (`context/archive/2026-11-17-room-chat/change.md`). — Owner: Karol. Block: no.
- **Risk:** Pierwsza treść pisana przez graczy. Klucz kanału zna każdy gracz pokoju, więc zanim pójdzie pierwsza wiadomość, ekrany muszą móc sprawdzić, że nadał ją ten gracz (podpis serwera na każdej wiadomości kanału, także emotce: W-E z `context/archive/2026-11-14-players-only-live-channel/research.md`); nowy sekret Workera to `npx wrangler secret put`, za zgodą. Treść od graczy nie może trafić do bazy ani do logów, a czat nie może opóźnić głosu ani odsłony (NFR: ≤ 2 s).
- **Status:** done

### S-24: Gify w czacie

- **Outcome:** Gracz na czacie pokoju wpisuje słowo, wybiera gifa z wyszukiwarki i cały pokój widzi go na żywo z jego nickiem. Wyszukiwarka zawsze odfiltrowuje treści dla dorosłych, a dostawca gifów nie dostaje nicku gracza ani pokoju. Gify, jak wiadomości, nie zostają nigdzie.
- **Change ID:** room-chat-gifs
- **PRD refs:** FR-028 (część „gify”), FR-023 (część „gif”)
- **Prerequisites:** S-23
- **Parallel with:** każdy element poza S-23
- **Blockers:** —
- **Unknowns:**
  - Który dostawca gifów: darmowy, z filtrem treści dla dorosłych, z warunkami do przyjęcia (podpis dostawcy na ekranie, limity zapytań, klucz w przeglądarce czy w Workerze)? Warunki sprawdzić w dniu researchu. — Owner: research przy `room-chat-gifs`, wybór Karol. Block: no.
- **Risk:** Pierwszy obcy serwis, z którym łączy się gra: wyszukiwane słowa idą do dostawcy, a obrazki przychodzą z jego serwerów, więc gra nie może mu podać nicku ani pokoju. Bez darmowego dostawcy element wraca do Parked, a S-23 zostaje czatem bez gifów.
- **Status:** in-progress

### S-25: Nowy wygląd gry

- **Outcome:** Gracz widzi grę w jednym ciemnym wyglądzie na każdym ekranie (logowanie i lista gier hosta, strona linku, pokój we wszystkich stanach): grafitowe tło, kolor Blurple na głównych guzikach i zaznaczeniu, guziki w kształcie pigułki, gracze na listach jako osobne kafelki z cieniem zamiast linii, czcionka Manrope. Gra zostaje zawsze ciemna; kolory graczy bez zmian. Wybór Karola z trzech galerii zrzutów 2026-11-19 (G2 Grafit, 6 Blurple, D1 płasko z cieniem), wzorem jego planera i Discorda, Spotify, XTB.
- **Change ID:** game-restyle
- **PRD refs:** FR-029 (nowy dodatek v1, decyzja hosta 2026-11-19)
- **Prerequisites:** — (wszystkie ekrany już istnieją; zmienia się tylko ich wygląd)
- **Parallel with:** każdy element; nie zmienia bazy, serwera gry ani zasady anonimowości
- **Blockers:** —
- **Unknowns:**
  - Ile głębi ponad płaskie karty z cieniem (poświata koloru u góry, świecący guzik, połysk kart)? Karol zostawił to jako otwarty temat. — Owner: Karol, wybór na zrzutach w trakcie zmiany. Block: no.
- **Risk:** Zmiana dotyka każdego ekranu naraz, więc łatwo o tekst za słabo czytelny (kolor Blurple jako tekst na ciemnym tle) albo przeoczony stan; kontrast liczony skryptem, a każdy stan sprawdzony na zrzutach przed scaleniem.
- **Status:** in-progress

## Backlog Handoff

| Roadmap ID | Change ID                    | Suggested issue title                                                  | Ready for `/10x-plan` | Notes                                                                               |
| ---------- | ---------------------------- | ---------------------------------------------------------------------- | --------------------- | ----------------------------------------------------------------------------------- |
| F-01       | live-sync-spike              | Test techniki na żywo: 20 graczy, odsłona w ≤ 2 s, tylko dane zbiorcze | yes                   | Run `/10x-plan live-sync-spike`; odblokowuje gwiazdę przewodnią S-02                |
| F-02       | starter-question-base        | Baza startowa pytań po polsku z kategoriami                            | yes                   | Run `/10x-plan starter-question-base`; praca twórcy gry, równolegle z F-01          |
| S-01       | room-lobby                   | Pokój z kategoriami, link i wejście gości z nickiem                    | no                    | Czeka na F-01 i F-02                                                                |
| S-02       | first-live-round             | Pierwsza runda na żywo: wspólne pytanie, anonimowy głos, odsłona       | no                    | Gwiazda przewodnia; czeka na S-01                                                   |
| S-03       | full-game-evening            | Pełny wieczór: następne pytanie, pominięcie, koniec gry                | no                    | Czeka na S-02                                                                       |
| S-04       | rejoin-after-refresh         | Powrót na swój nick po odświeżeniu, z oddanym głosem                   | no                    | Czeka na S-02                                                                       |
| S-05       | one-click-host-login         | Logowanie hosta jednym kliknięciem                                     | no                    | Zablokowane: wybór dostawców logowania                                              |
| S-06       | question-list-review         | Opcjonalny przegląd listy pytań przed startem                          | no                    | Czeka na S-02                                                                       |
| S-07       | co-host-role                 | Rola współhosta                                                        | no                    | Czeka na S-03                                                                       |
| S-08       | latecomer-admission          | Wpuszczanie spóźnionych graczy                                         | yes                   | Run `/10x-plan latecomer-admission`; wpuszcza sam host, współhost w S-07            |
| S-09       | remove-player-new-link       | Usunięcie gracza i nowy link do pokoju                                 | no                    | Czeka na S-07                                                                       |
| S-10       | guest-question-proposals     | Propozycje pytań od gości z zatwierdzaniem                             | no                    | Czeka na S-07                                                                       |
| S-11       | question-reactions-play-data | Kciuki na odsłonie i zbiorcze dane o pytaniach                         | no                    | Czeka na S-03 i S-06                                                                |
| S-12       | learning-question-selection  | Dobór pytań według jakości z danych o pytaniach                        | no                    | Czeka na dane z kilku wieczorów z ekipą (decyzja Karola 2026-11-15)                 |
| S-13       | host-game-history            | Lista gier hosta i kasowanie                                           | no                    | Czeka na S-11                                                                       |
| S-14       | remembered-nick              | Zapamiętany nick w przeglądarce                                        | yes                   | Run `/10x-plan remembered-nick`; S-01 gotowe                                        |
| S-15       | game-summary                 | Podsumowanie wieczoru na ekranie końca gry                             | yes                   | Run `/10x-plan game-summary`; S-03 gotowe                                           |
| S-16       | room-emotes                  | Emotki do pokoju (bez gifów i tekstu)                                  | yes                   | Run `/10x-plan room-emotes`; S-02 gotowe                                            |
| S-17       | question-pool-in-db          | Pula pytań (kategorie, 18+) sprawdzana w bazie                         | yes                   | Run `/10x-plan question-pool-in-db`; S-07 gotowe; zamyka znaną dziurę F1            |
| S-18       | player-color-choice          | Wybór koloru przez gracza zamiast koloru z miejsca                     | yes                   | Run `/10x-research player-color-choice`; przed S-09                                 |
| S-19       | game-length                  | Długość gry widoczna dla wszystkich i przystanek po ostatnim pytaniu   | no                    | W toku: `context/archive/2026-11-07-game-length/plan.md`, Faza 4 (wdrożenie)        |
| S-20       | no-recent-repeats            | Losowanie bez pytań z ostatnich gier hosta                             | no                    | Na produkcji od 2026-11-15; czeka ręczne 3.7 hosta, potem `/10x-archive`            |
| S-21       | home-screen-icon             | Ikona gry na ekranie głównym telefonu, gotowa pod Google Play          | yes                   | Run `/10x-plan home-screen-icon`; ikona wybrana na zrzutach 2026-11-16              |
| S-22       | security-hardening           | Poprawki z przeglądu bezpieczeństwa: sufit graczy i limit gier         | no                    | W toku: `context/archive/2026-11-16-security-hardening/plan.md`, Faza 3 (wdrożenie) |
| S-23       | room-chat                    | Czat w pokoju: krótkie wiadomości z nickiem, bez zapisu                | no                    | W toku: `context/archive/2026-11-17-room-chat/plan.md`, Faza 4 (wdrożenie)          |
| S-24       | room-chat-gifs               | Gify w czacie z wyszukiwarki, bez treści dla dorosłych                 | no                    | W toku: `context/changes/room-chat-gifs/plan.md`, Faza 4 (wdrożenie)                |
| S-25       | game-restyle                 | Nowy wygląd gry: grafit, kolor Blurple, pigułki i kafelki              | yes                   | Run `/10x-ui` → `/10x-plan game-restyle`; wygląd wybrany na zrzutach                |

## Open Roadmap Questions

1. **Czy istniejące aplikacje „most likely to" już rozwiązują problem przygotowania?** — Owner: host. Sprawdzić 2–3 gotowe aplikacje przed budową; jeśli któraś daje pulę własną, rundę na żywo dla ekipy zdalnej i uczenie się z rozgrywki, hipoteza wglądu wymaga zmiany. Block: nie, ale wpływa na Vision.
2. **Kto w ostatnich miesiącach realnie organizował te wieczory i jak często udało się zagrać?** — Owner: host. Kalibruje, jak często panel hosta będzie używany. Block: nie.
3. **Co z głosami oddanymi na gracza (i przez gracza) wyrzuconego w środku rundy?** (FR-004) — Owner: host. Propozycja do rozważenia: głosy przepadają, odsłona liczy się bez niego. Rozstrzygnięte 2026-10-31 w S-09 (decyzja 1): głosy na usuniętego przepadają, głos oddany przez niego zostaje policzony, a jeśli jeszcze nie głosował, runda przestaje na niego czekać (`context/changes/remove-player-new-link/research.md`, „Decyzje do planu”). Block: nie.
4. **Ile propozycji pytań może wysłać jeden gość w jednej grze?** (FR-013) — Owner: host. Liczba do ustalenia; propozycja z rozmowy: około 3. Rozstrzygnięte 2026-11-04 w S-10 (decyzja 4): 3 propozycje na gracza w jednej grze, także dla hosta i współhosta; odrzucone też się liczą (`context/archive/2026-11-04-guest-question-proposals/plan.md`). Block: nie.
5. **Co losuje gra, gdy w wybranych kategoriach skończą się pytania, których ta ekipa jeszcze nie grała?** (FR-015) — Owner: host. Host uważa, że mała baza na start to nie problem (baza rośnie), ale zachowanie w tym przypadku nie jest opisane. Rozstrzygnięte 2026-11-15 w S-20 (`no-recent-repeats`): gra bierze najpierw pytania grane u tego hosta najdawniej; gdy niegranych jest za mało, niegrane i reszta z najdawniej granych. Block: nie.
6. **Co znaczy „za mało zagrań, by oceniać" w FR-017 (próg liczby zagrań) i z jakich sygnałów FR-016 liczy się wynik jakości?** — Owner: host. Kierunek: pominięcia, reakcje, skupienie głosów; wagi i próg do ustalenia po pierwszych wieczorach. Block: nie (szczegół reguły, nie sama reguła).
7. **Jakie pytania „most likely to" działają najlepiej?** — Owner: host. Research poza aplikacją: artykuły, badania, istniejące gry; wynik zasili bazę startową i ewentualnie przyszłe generowanie pytań (poza v1). Block: nie.
8. **Po co gość miałby chcieć konta?** — Owner: host. Konto gościa dopuszczalne po v1, jeśli ktoś go chce, ale dopiero gdy wiadomo, co ma dawać (np. stały nick, własne propozycje między wieczorami). Do rozstrzygnięcia przed jakąkolwiek pracą nad kontami gości. Block: nie.
9. **Jak nie dopuścić do uśpienia darmowego projektu Supabase (po 7 dniach bez ruchu) przed pierwszym prawdziwym wieczorem gry?** — Owner: Karol. Opcje z `infrastructure.md` (ryzyko nr 1): ręczne budzenie z listą kontrolną hosta, cykliczne zapytanie albo plan płatny. Rozstrzygnięte 2026-10-21: opcja 2, workflow `keep-supabase-awake` (GitHub Actions co 6 h puka do bazy, czerwony przebieg = sygnał); zapas: punkt listy przed wieczorem w `deploy-plan.md` (`context/archive/2026-10-21-keep-supabase-awake/plan.md`). Block: no.

## Parked

- **Odsłona lub zapis „kto na kogo głosował”** — Why parked: PRD §Non-Goals; trwała zasada gry, wykluczona na zawsze, a nie odłożona.
- **Punkty i ranking między wieczorami** — Why parked: PRD §Non-Goals; zabawą jest odsłona i rozmowa.
- **Konta gości** — Why parked: PRD §Non-Goals; najpierw Open Roadmap Question 8.
- **Inne mini-gry** — Why parked: PRD §Non-Goals; jedna gra.
- **Generowanie pytań przez AI** — Why parked: PRD §Non-Goals; najpierw research z Open Roadmap Question 7.
- **Wielu kuratorów bazy i narzędzia moderacji** — Why parked: PRD §Non-Goals; bazę weryfikuje jedna osoba.
- **Czat głosowy w aplikacji** — Why parked: PRD §Non-Goals; rozmowa głosowa zostaje na Discordzie.
- **Wersja angielska** — Why parked: PRD §Non-Goals (decyzja hosta 2026-09-26); v1 po polsku, angielski ewentualnie po dopracowaniu gry.
- **Aplikacja ze sklepu i tryb offline** — Why parked: PRD §Non-Goals; tylko przeglądarka, tylko z siecią. Ikona na ekranie głównym bez sklepu weszła jako S-21 (2026-11-16); gdy Karol otworzy sklep, zostają: ekran offline, `assetlinks.json`, opakowanie TWA, konto Google Play, polityka prywatności, ocena wiekowa (18+), testy zamknięte.
- **Skala powyżej około stu użytkowników** — Why parked: PRD §Non-Goals; przed taką skalą host chce przemyśleć grę od nowa.
- **FR-021: panel weryfikacji nowych pytań w aplikacji** — Why parked: PRD przesuwa panel do v2; w v1 twórca gry przegląda nowe pytania poza aplikacją.
- **Pełna historia wieczorów w panelu hosta** — Why parked: PRD przesuwa ją do v2; v1 ma minimalną listę gier (S-13).
- **Rejestracja e-mailem i hasłem dla nowych hostów** — Why parked: decyzja Karola 2026-10-06 przy S-05; bez własnej skrzynki nadawczej nie da się potwierdzić adresu, a bez potwierdzenia obcy może zarejestrować się na cudzy e-mail. Wrócić jako osobna zmiana z własnym SMTP (kandydat: Gmail gry z hasłem aplikacji, do sprawdzenia).
- **Kanał na żywo tylko dla graczy pokoju** — Why parked: po przeglądzie S-09 (F2, 2026-11-02) Karol przyjął, że usunięty gracz zna id pokoju, więc do końca gry ogląda i nadaje emotki na publicznym kanale `live-sync:<roomId>`. Od `players-only-live-channel` (2026-11-14) emotki idą tematem z klucza kanału (`live-players:<klucz kanału>`), który `room_lobby` daje tylko graczom pokoju, a usunięcie gracza zmienia razem z linkiem, więc usunięty, odrzucony spóźniony i obcy z adresem pokoju nie widzą już emotek pokoju i nie podrzucą ich ekranom. Zostają dwie przyjęte granice. Dzwonki dalej idą publicznym tematem `live-sync:<roomId>`: kto zna id pokoju, słyszy je i może dzwonić, ale dzwonek nie niesie treści, a najwyżej wywołuje zbędne pobranie stanu, przyhamowane ogranicznikiem (przyjęte od F-01). Gracz pokoju zna klucz kanału, więc może zalać temat graczy emotkami i wiadomościami na czacie: pauza między nimi jest tylko po stronie ekranu, a Worker niczego nie liczy. Podszycie zamyka podpis serwera z S-23 (room-chat, 2026-11-17; W-E z `context/archive/2026-11-14-players-only-live-channel/research.md`): Worker podpisuje każdą wiadomość tematu graczy, a ekran pokazuje tylko podpisane, więc gracz z kluczem kanału nie nada już emotki ani wiadomości z nickiem kolegi. Głosów ani stanu pokoju kanał nie niesie. Wrócić, gdy ktoś nadużyje dzwonków albo zaleje temat graczy.
- **Śledzenie błędów i metryki** — Why parked: stan bazowy ma logi Workers i test dymny; przy celu „nauka” i skali do stu osób to wystarcza; wrócić, jeśli wieczory testowe pokażą błędy. Decyzja Karola 2026-11-16 (przy S-22): zostaje w Parked, bo logi Workera i zgłoszenie `island_crash` już są; wrócić po pierwszym wieczorze z ekipą.

## Milestone History

_Brak: to pierwszy kamień milowy._

## Done

- **F-02: (foundation) Pierwsza wspólna baza pytań po polsku, w kilku kategoriach, jest spisana, zatwierdzona przez twórcę gry i gotowa do wczytania.** — Archived 2026-09-27 → `context/archive/2026-09-27-starter-question-base/`. Lesson: `context/foundation/lessons.md` → „Pytania gry tylko po stronie serwera”.
- **F-01: (foundation) Technika na żywo jest sprawdzona w prototypie: publiczny kanał Supabase Realtime niesie tylko sygnał „coś się zmieniło” (dzwonek), a stan przeglądarka pobiera z serwera. Dzwonek może nadać każdy, kto zna nazwę kanału, więc stan pochodzi wyłącznie z bazy, nigdy z treści dzwonka. W trakcie rundy stan pokazuje tylko, kto już zagłosował; liczby głosów dopiero przy odsłonie, nigdy „kto na kogo”. Kryterium: 95% dostarczeń do 20 graczy w ≤ 2 s, żadne powyżej 5 s; spełnione na produkcji 2026-10-04 (100% w 2 s, max 247 ms; `context/archive/2026-09-27-live-sync-spike/measurements.md`).** — Archived 2026-10-04 → `context/archive/2026-09-27-live-sync-spike/`. Lesson: —.
- **S-01: Host tworzy pokój, wybiera kategorie (przy każdej osobno decyduje, czy dołączyć jej pytania 18+) i dostaje link do wklejenia na Discordzie; gość otwiera link na telefonie, wpisuje nick (zajęty nick jest odrzucany) i trafia do pokoju, a host widzi dołączających na żywo.** — Archived 2026-10-08 → `context/archive/2026-10-07-room-lobby/`. Lesson: —.
- **S-05: Host loguje się jednym kliknięciem przez zewnętrznego dostawcę, bez rejestracji i hasła; ten sam e-mail oznacza tego samego hosta także przy zapasowej drodze logowania.** — Archived 2026-10-08 → `context/archive/2026-10-04-one-click-host-login/`. Lesson: —.
- **S-02: Host klika „start”; wszyscy w pokoju widzą to samo pytanie z wybranych kategorii (18+ tylko z tych, w których host je dołączył), każdy wskazuje jedną osobę z listy nicków (także siebie) albo się wstrzymuje, wszyscy widzą, kto już zagłosował, a po ostatnim głosie lub przewinięciu przez prowadzącego widzą odsłonę: ile głosów dostała każda osoba.** — Archived 2026-10-15 → `context/archive/2026-10-13-first-live-round/`. Lesson: —.
- **S-03: Prowadzący przechodzi do kolejnego pytania (bez powtórek w tej grze), może pominąć rundę (jej głosy przepadają i nie liczą się do jakości pytania) i kończy grę po potwierdzeniu; po ostatnim pytaniu ekipa widzi koniec wieczoru bez punktacji.** — Archived 2026-10-15 → `context/archive/2026-10-15-full-game-evening/`. Lesson: —.
- **Szeroki układ ekranów gry na laptopie i dużym monitorze (zmiana `/10x-ui` z Parked, bez numeru slice'a): od 1024 px poczekalnia w dwóch kolumnach, odsłona z wykresem obok tabeli, przyciski hosta w pasku przyklejonym do dołu okna; telefon bez zmian.** — Archived 2026-10-18 → `context/archive/2026-10-15-room-wide-layout/`. Lesson: —.
- **S-06: Host może przed startem przejrzeć wylosowaną listę pytań tej gry: usunąć pytanie, dolosować nowe, poprawić treść albo dodać własne; domyślną ścieżką zostaje „start teraz” bez przeglądania.** — Archived 2026-10-24 → `context/archive/2026-10-24-question-list-review/`. Lesson: —.
- **S-08: Spóźniony gracz prosi o wejście do trwającej gry z wybranym nickiem; prośba jest widoczna dla hosta na każdym ekranie (współhosta dopisze S-07), także w trakcie głosowania; wpuszczony widzi bieżącą rundę i głosuje od następnej.** — Archived 2026-10-24 → `context/archive/2026-10-22-latecomer-admission/`. Lesson: —.
- **S-14: Gość, który wchodzi do pokoju z tego samego telefonu co ostatnio, ma już wpisany swój poprzedni nick i tylko klika „Dołącz”; host ma swój nick wpisany w formularzu „Nowa gra”. Nick da się zmienić przed wejściem.** — Archived 2026-10-25 → `context/archive/2026-10-25-remembered-nick/`. Lesson: —.
- **S-15: Gdy gra się kończy (po ostatnim pytaniu albo gdy prowadzący zakończy ją wcześniej), wszyscy gracze na ekranie „Koniec wieczoru” widzą kilka wyróżnień z tej gry, np. „najwięcej głosów dziś” i „nikt dziś nie głosował na X”; bez punktów, miejsc i porównań z innymi wieczorami.** — Archived 2026-10-25 → `context/archive/2026-10-25-game-summary/`. Lesson: —.
- **S-16: Każdy gracz w pokoju (host i goście) może w trakcie gry jednym dotknięciem wysłać emotkę z krótkiej, stałej listy, a cały pokój widzi ją na chwilę na swoim ekranie; bez gifów, bez wpisywania tekstu i bez historii wiadomości. Emotka jest nieobowiązkowa i niczego nie blokuje.** — Archived 2026-10-27 → `context/archive/2026-10-26-room-emotes/`. Lesson: —.
- **S-11: Gracz jednym dotknięciem daje kciuk w górę lub w dół na ekranie odsłony (nieobowiązkowo, bez blokowania prowadzącego), a gra zapisuje zbiorcze dane o każdym pytaniu: skupienie głosów, pominięcia, reakcje i usunięcia z list przed startem.** — Archived 2026-11-10 → `context/archive/2026-10-26-question-reactions-play-data/`. Lesson: —.
- **S-23: Każdy gracz w pokoju (host, współhost i gość bez roli) pisze krótkie wiadomości na czacie pokoju, a cały pokój widzi je na żywo z jego nickiem: w poczekalni, w trakcie gry (także w głosowaniu) i na końcu wieczoru. Nikt nie napisze z cudzym nickiem, a usunięty gracz przestaje widzieć i pisać. Wiadomości nie zostają nigdzie, ani w bazie, ani w logach, więc po odświeżeniu strony albo dla wpuszczonego spóźnionego czat zaczyna się od tej chwili. Czat jest nieobowiązkowy i niczego w grze nie blokuje.** — Archived 2026-11-19 → `context/archive/2026-11-17-room-chat/`. Lesson: —.
- **S-19: Każda gra ma liczbę pytań: domyślnie 15, także gdy nikt nie otworzy listy, a po przeglądzie listy tyle, ile ma lista; zatwierdzona propozycja dodaje jedno pytanie, a pominięte pytanie zużywa jedno. Każdy gracz widzi tę liczbę w poczekalni, zmienianą na żywo przy ruchach hosta na liście, i przy każdym pytaniu („Pytanie 7 z 15”). Po ostatnim pytaniu gra nie otwiera następnego: prowadzący wybiera „Zakończ grę” albo „Jeszcze 5 pytań” (mniej, gdy w wybranych kategoriach zostało mniej niezagranych pytań), a licznik idzie dalej („Pytanie 16 z 20”). Gra nadal nie kończy się sama.** — Archived 2026-11-19 → `context/archive/2026-11-07-game-length/`. Lesson: —.
- **S-22: Pokój mieści najwyżej 50 graczy razem z hostem: 51. gość z linku, spóźniony z prośbą o wejście i „Wpuść” prowadzącego dostają „W tym pokoju jest już 50 graczy. Więcej się nie zmieści.”, a gracz, który wraca na swój nick, wchodzi jak dotąd. Jedno konto zakłada najwyżej 60 gier w ciągu godziny. „Zagłosuj” działa dopiero, gdy strona się załaduje, więc głos nigdy nie trafia do adresu strony. Strony gry mają nagłówki bezpieczeństwa i przeglądarka ich nie zapamiętuje, a formularze odrzucają za duże dane. Dla ekipy gra działa jak dotąd.** — Archived 2026-11-19 → `context/archive/2026-11-16-security-hardening/`. Lesson: —.
- **S-17: Prowadzący (host albo współhost) może otworzyć tylko pytanie z kategorii wybranych przez hosta, a pytanie 18+ tylko z kategorii, w których host je włączył, także gdy woła funkcję bazy sam, z tokenem z ciasteczka, z pominięciem ekranu gry.** — Archived 2026-11-19 → `context/archive/2026-11-13-question-pool-in-db/`. Lesson: —.
- **S-20: Gra losuje najpierw pytania, których ten sam host nie grał w innych grach, a te, które już padły, bierze na końcu, najdawniej grane najpierw. Ekipa nie dostaje więc pytań, które host zna już z gier testowych i poprzednich wieczorów, dopóki w wybranych kategoriach są niegrane. Dotyczy każdego losowania pytań w grze.** — Archived 2026-11-19 → `context/archive/2026-11-15-no-recent-repeats/`. Lesson: —.
- **S-04: Gracz, który odświeży stronę albo straci połączenie, w mniej niż 10 s wraca na swój nick w bieżącej rundzie i widzi swój oddany głos; nikt inny nie może w tym czasie przejąć jego nicku.** — Archived 2026-11-19 → `context/archive/2026-11-03-rejoin-after-refresh/`. Lesson: —.
- **S-18: Gracz (host i gość) wybiera swój kolor z palety gry i ma go przez całą grę: kropka przy nicku, kawałek koła odsłony i podsumowania, dymek emotki. Dwóch graczy w pokoju nie ma tego samego koloru, a kto nie wybierze, dostaje kolor sam.** — Archived 2026-11-19 → `context/archive/2026-10-31-player-color-choice/`. Lesson: —.
- **S-10: Gość proponuje pytania z linku do pokoju w trakcie wieczoru, do limitu na grę; host lub współhost zatwierdza albo odrzuca, a zatwierdzone trafiają do listy tej gry.** — Archived 2026-11-19 → `context/archive/2026-11-04-guest-question-proposals/`. Lesson: —.
- **S-13: Host widzi minimalną listę swoich gier (data, liczba pytań, kto grał) i kasuje dowolną; kasowanie usuwa wszystko, co wiąże się z nickami, a anonimowe dane o pytaniach zostają we wspólnej bazie, o czym aplikacja mówi wprost.** — Archived 2026-11-19 → `context/archive/2026-11-10-host-game-history/`. Lesson: —.
