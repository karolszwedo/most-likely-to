---
date: 2026-11-21T17:24:44+01:00
researcher: Claude (Opus 5.5), sesja gry
git_commit: deb96c1edcf2c15fb765f229ff7889ad81ba389e
branch: english-version
repository: most-likely-to
topic: "Co wymaga wersja angielska gry: teksty ekranów, pytania, wybór języka, testy"
tags: [research, i18n, questions, room-lobby, create-room, e2e, smoke, prd]
status: complete
last_updated: 2026-11-21
last_updated_by: Claude (Opus 5.5), sesja gry
last_updated_note: "Open Questions rozstrzygnięte przez Karola 2026-11-21"
---

# Research: wersja angielska gry

**Date**: 2026-11-21T17:24:44+01:00
**Researcher**: Claude (Opus 5.5), sesja gry (trzech podagentów tylko do odczytu + sprawdzenie kotwic w głównym kontekście)
**Git Commit**: `deb96c1` (`origin/main` po PR #90)
**Branch**: `english-version`
**Repository**: most-likely-to

## Research Question

Punkt 11 F kolejki gry (`context/changes/english-version/change.md`). Co trzeba zmienić, żeby gra działała po angielsku? Pytanie obejmuje:

- gdzie żyje tekst, który widzi gracz i host, i ile go jest;
- jak pytania przechodzą przez bazę i serwer gry;
- czy język ma należeć do gry, czy do osoby;
- co z testami, które sprawdzają polskie teksty;
- jakie decyzje Karola są potrzebne przed planem.

## Summary

- **Dziś gra nie ma żadnego mechanizmu języków.** Podagent przeszukał `src`, `astro.config.mjs` i `package.json` pod kątem `i18n`, `locale`, `lang`, `currentLocale`, `accept-language` i `translation` i nie znalazł słownika ani biblioteki. Polski jest wpisany na sztywno w czterech miejscach:
  - `lang="pl"` w `src/layouts/Layout.astro:25`;
  - `"lang": "pl"` w `public/manifest.webmanifest`;
  - `locale: "pl"` w zapytaniu do KLIPY, `src/lib/rooms/gifs.ts:84`;
  - daty `pl-PL` w `src/lib/rooms/game-list.ts:27-35`.
- **Teksty ekranów: około 420–450 napisów w około 50 plikach.** Do tego dochodzi 960 pytań i 14 nazw kategorii. Liczba napisów to szacunek skryptu podagenta: literały z polskimi literami albo słowami, bez komentarzy, poprawione o pominięte pojedyncze słowa. Najwięcej jest w ekranach pokoju (`src/components/room/**`, 39 z 53 plików). Błędy już dziś chodzą jako kody, a tekst daje mapa:
  - `src/lib/rooms/errors.ts`: 41 kodów;
  - `src/lib/auth-errors.ts`: 27 kodów.
- **Pytania są dobrze przygotowane na drugi język.**
  - Baza zna tylko numer, kategorię i 18+ pytania, bez tekstu (`supabase/migrations/20261113134418_question_base.sql:24-31`).
  - Tekst dobiera Worker po numerze (`src/lib/rounds/draw.ts:102-104`, `src/lib/rooms/server.ts:285-293`).
  - Kanał na żywo nie niesie tekstu pytań.
  - Pytanie to końcówka po stałym początku „Kto z nas najprawdopodobniej” (`src/data/questions.ts:14-16`, `src/lib/rooms/shared.ts:859-861`). Angielskie „Who's most likely to …” ma ten sam kształt, ale każdą z 960 końcówek trzeba napisać od nowa.
- **Język powinien należeć do gry, nie do gracza** (wniosek). Wszyscy widzą to samo pytanie. Pytania wpisane przez hosta i propozycje graczy są w jednym języku, autora: `private.game_questions.text` i `private.question_proposals.text`. Pod początkiem zdania w innym języku byłyby niegramatyczne. Do tego potrzebna jest kolumna języka w `rooms` i nowy parametr `create_room`, a więc migracja i pełny cykl.
- **Testy:**
  - e2e są mocno związane z polskimi nazwami: około 226 lokatorów `getByRole`, `getByText` i `getByLabel` w około 20 z 24 plików;
  - smoke sprawdza około 9 polskich fragmentów HTML (`scripts/smoke.mjs:321-326`, `:643`, `:679`, `:1176`, `:1196-1201`);
  - testy jednostkowe w większości trzymają się zasady §6.1 „zachowanie, nie tekst” (`context/foundation/test-plan.md:143`); wyjątki to polskie daty, liczba mnoga i „Gra nie wystartowała”.
- **Zasada anonimowości zostaje nietknięta.** Język gry to cecha pokoju. Nie dotyka urny, głosów, wyników rundy ani klucza `mlt-my-vote:<roomId>`.
- **Najpierw trzeba zmienić PRD i roadmapę:**
  - Non-Goal „Bez wersji angielskiej w v1” (`context/foundation/prd.md:219`, decyzja hosta 2026-09-26, commit `e6e2545`);
  - Parked „Wersja angielska” (`context/foundation/roadmap.md:520`).

  Uzasadnienie w dokumentach to jedno zdanie: „angielski ewentualnie po dopracowaniu gry”.

## Detailed Findings

### 1. Teksty ekranów

Szacunek z inwentarza podagenta (skrypt w scratchpadzie, liczy różne napisy w pliku raz).

| Obszar                                 | Pliki z polskim | ~Napisów     | Kotwice                                                                                                                                                                                                                                                                                                                                                     |
| -------------------------------------- | --------------- | ------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Ekrany pokoju `src/components/room/**` | 39 z 53         | ~290         | `RoundVoting.tsx` (25), `JoinForm.tsx` (18), `GameHistory.tsx` (16), `NewGameForm.tsx` (13), `QuestionList.tsx` (13, komunikaty dla czytnika), `GifPicker.tsx` (12), `link-page.ts:28-64`, `LinkScreen.astro`, `GameSummary.tsx`, `chart-colors.ts:56-77` (20 nazw kolorów dla czytnika), `game-intro.ts:8-23` (tytuł, karta linku), `HomeScreenHint.astro` |
| Logowanie `src/components/auth/**`     | 4 z 9           | ~15          | `SignInCard.astro:25`, `SignInForm.tsx:84` (`ty@przyklad.pl`), `ProviderButtons.tsx`, `PasswordToggle.tsx`                                                                                                                                                                                                                                                  |
| Strony                                 | 6               | ~21          | `index.astro:43-51`, `gry.astro:32`, `gry/[id].astro`, `r/[id].astro:93-148` (14), `j/[token].astro:110`, `auth/signin.astro:13`                                                                                                                                                                                                                            |
| Layout i `public/`                     | 2               | ~4           | `Layout.astro:25` (`lang`), `:67`, `:72`, karta linku z `LINK_PREVIEW`; `manifest.webmanifest:5-6`                                                                                                                                                                                                                                                          |
| Mapy błędów                            | 2               | ~54          | `src/lib/rooms/errors.ts:53-126` (41 kodów, używane na stronach i w przeglądarce przez `room-actions.ts:70`); `src/lib/auth-errors.ts:6-36`                                                                                                                                                                                                                 |
| Zdania składane w kodzie               | 5               | ~15          | `shared.ts:853-861`, `announce.ts:19-45` (czytnik ekranu), `game-list.ts:27-55`, `emotes.ts:8-13`, `config-status.ts:15-17`                                                                                                                                                                                                                                 |
| shadcn `src/components/ui/**`          | 0 z 13          | 0            | `spinner.tsx:5` ma już angielskie `aria-label="Loading"` (niespójność)                                                                                                                                                                                                                                                                                      |
| Podglądy `/dev/*`                      | 5               | ~470         | tylko w trybie dev (404 na produkcji); polskie dane przykładowe                                                                                                                                                                                                                                                                                             |
| Migracje                               | 21 z 25         | 0 widocznych | polski tylko w komentarzach SQL; funkcje oddają kody                                                                                                                                                                                                                                                                                                        |

Gramatyka polska w kodzie (do przepisania przy słowniku):

- **Liczba mnoga** `plural()` z trzema formami, `src/lib/rooms/summary.ts:32-39`. Używają jej:
  - `GameSummary.tsx:77`, `:86`;
  - `HostActions.tsx:55`;
  - `game-list.ts:50`.

  Prostsze wybory 1 albo N są w trzech miejscach:
  - `shared.ts:853-855`;
  - `ProposalForm.tsx:51-53`;
  - `JoinRequests.tsx:73-76`, `QuestionProposals.tsx:83-84`.

  Wbudowane `Intl.PluralRules` zna formy obu języków (pl: one/few/many, en: one/other).

- **Rodzaj:**
  - „zagłosował(a)” (`RoundVoting.tsx:117`);
  - prowadzący zawsze w rodzaju męskim, „Prowadzący pominął” (`announce.ts:23`, `:27`, `RoomScreen.tsx:605`, `RoundSkipped.tsx:37`, `link-page.ts:31`, `:33`, `r/[id].astro:134` i inne);
  - nazwy kolorów jako przymiotniki (`chart-colors.ts:56-77`).

  Po angielsku te miejsca stają się prostsze.

- **Daty:** `Intl.DateTimeFormat("pl-PL")` w strefie `Europe/Warsaw`, dzień i godzina łączone ręcznie (`game-list.ts:27-41`).
- **Typografia:** „…” i „np.” w podpowiedziach (`JoinForm.tsx:127`, `NewGameForm.tsx:163`, `ProposalForm.tsx:190`).
- **Nicki** są zawsze w mianowniku („Usunięto ${nick}.”), więc po angielsku też brzmią dobrze.

### 2. Pytania i baza

- **`src/data/questions.ts`:**
  - kształt `QuestionEntry { category, text, adult }` (`:46-50`), bez pola języka;
  - 960 pytań, z nich 242 z 18+;
  - 14 kategorii (`:27-42`, polskie numery i nazwy): 10 po 80 pytań i 4 po 40;
  - numer `<kategoria>-NNN` nigdy się nie zmienia ani nie wraca (`:5-7`);
  - test wymaga co najmniej 15 zwykłych pytań w każdej kategorii (`tests/unit/draw.test.ts:168-175`).
- **Nazwy kategorii** widać tylko na formularzu „Nowa gra” (`src/pages/index.astro:19` → `NewGameForm`). Worker sprawdza numery z `CATEGORY_IDS` (`src/pages/api/rooms/index.ts:9`, `:57`).
- **Migawka bazy** (`npm run questions:migration`, `scripts/question-base-migration.mjs`):
  - pisze jedno `merge into private.question_base`;
  - ma klauzulę `when not matched by source then delete` (`:69`), więc usuwa każdy wiersz, którego nie ma w pliku;
  - drugą pulę pytań w osobnym pliku generator by skasował, chyba że czyta obie.
- **Losowanie:**
  - działa tylko na numerach i kategoriach, bez tekstu: `private.picked_candidates` (`20261113162527_question_base_checks.sql:52-64`), `private.ordered_candidates` z „bez powtórek” (`20261115095052_no_recent_repeats.sql:60-80`), `open_next_round`, `start_game`;
  - każde losowanie odmawia przy ponad 1000 kandydatach (`22023`, np. `20261107091322_game_length.sql:120`);
  - Worker wysyła całą pulę wybranych kategorii (`draw.ts:56-76`): dziś 960 przy wszystkich kategoriach z 18+.
- **Liczniki pytań** `private.question_stats` (`20261026074427_question_play_data.sql:53-84`):
  - mają klucz sam `question_id`;
  - nikt ich jeszcze nie czyta (S-12 dalej „proposed”);
  - zasada z `20261024094002_question_list_review.sql:24-25`: dane pod jednym numerem „nie mieszają dwóch brzmień”.
- **Tekst pytania do przeglądarki** przechodzi tylko przez Workera, w trzech miejscach `server.ts`:
  - runda (`roomView`, `:333-351`);
  - lista pytań hosta w poczekalni (`listQuestions`, `:298-306`);
  - historia gry (`historyView`, `:670-686`).

  Trafia na stronę pokoju (`r/[id].astro:75`), do odświeżenia (`api/rooms/[id]/lobby.ts:43`) i do `/gry/<id>`. Historia celowo pokazuje dzisiejsze brzmienie z `questions.ts` (`context/changes/game-history-details/plan.md:27`).

- **Początek zdania „Kto z nas najprawdopodobniej”** jest w kilku miejscach:
  - w kodzie dla przeglądarki: `shared.ts:860`;
  - w podpowiedziach: `QuestionList.tsx:390`, `ProposalForm.tsx:46`, `QuestionField.tsx:58`;
  - w karcie linku: `game-intro.ts:8`;
  - w czytniku ekranu: `announce.ts:26`;
  - w starym prototypie `live-sync/server.ts:184` (tylko sonda dev).

### 3. Język gry czy osoby

- Ekran pokoju jest liczony przy każdym żądaniu (`roomView`). Technicznie da się więc pokazać różny język różnym osobom.
- Pytania od ludzi są w jednym języku, a baza ich nie oznacza:
  - pytanie hosta albo przeredagowane: `private.game_questions.text` (`question_list_review.sql:47-64`);
  - propozycja gracza: `private.question_proposals.text` (`20261104095452_guest_question_proposals.sql:60-77`).

  Przy języku na osobę takie pytanie pokazałoby się pod obcym początkiem zdania.

- **Język na grę** wymaga zmian w bazie:
  - nowa kolumna `rooms.language` z `check`;
  - nowy parametr `create_room` (inna sygnatura, czyli `drop` i ponowne nadanie uprawnień);
  - język w `room_lobby` dla każdego gracza. Dziś kategorie są tylko w części prowadzącego `leader_draw` (`20261114101656_players_channel_key.sql:315-330`);
  - język w `game_history`.

  Najpierw baza, potem kod (`context/deployment/deploy-plan.md`).

- **Ekrany hosta przed grą** (`/`, `/gry`, logowanie) nie mają jeszcze pokoju, więc ich język trzeba wziąć skądinąd. Są trzy możliwości:
  - przełącznik w ciasteczku;
  - nagłówek `Accept-Language`;
  - przedrostek w adresie.
- **Astro 7.4.12** daje tylko trasy (`node_modules/astro/dist/types/public/config.d.ts:2590-2838`):
  - `i18n.locales`, `defaultLocale`, `routing.prefixDefaultLocale`, `fallback`;
  - `Astro.preferredLocale` z `Accept-Language` (`context.d.ts:346`);
  - `Astro.currentLocale` z adresu (`:373`).

  Nie tłumaczy napisów. `currentLocale` nie dociera do wysp React. Przedrostek `/en/` wymagałby zmiany każdego przekierowania na sztywne ścieżki: `/?error=`, `/auth/signin`, `/j/…`, `/r/…`.

- **Kanał na żywo nie wymaga zmian.** Podpisane wiadomości nie niosą tekstu Workera: dzwonek to numer, emotka to numer i nick, czat to tekst gracza (`src/lib/live-sync/shared.ts:10-33`, `server.ts:94-177`).

### 4. Testy i skrypty

- **e2e** (24 pliki): około 226 lokatorów z polskimi nazwami.
  - Rdzeń to pomocniki `tests/e2e/support/room.ts` (22 nazwy) i `support/round.ts` (22 nazwy, wyrażenie `/^Kto z nas najprawdopodobniej .+\?$/` w `:19`).
  - Zasada §6.4: kroki rundy przez ekran, po roli i dostępnej nazwie (`test-plan.md:364`).
  - `playwright.config.ts` nie ustawia języka ani strefy.
- **Smoke** sprawdza około 9 polskich fragmentów:
  - karta linku „Dołącz do gry” (`smoke.mjs:321-326`, komentarz: „change the two together”);
  - strony `/j/`, `/r/` i `/gry` (`:643`, `:679`, `:1176`, `:1196-1201`);
  - polską ścieżkę `/gry` (`:132` i dalej).
- **Testy jednostkowe** (31 plików): w 14 jest polski, głównie w danych przykładowych.
  - Prawdziwa zależność od tekstu: `game-list.test.ts:28-61` (daty, „1 pytanie / 2 pytania / 5 pytań”, „Gra nie wystartowała”), `game-history.test.ts:227`, `:349`, `host-actions.test.ts:81-87`, `summary.test.ts:128-143` (formy liczby mnogiej), `gifs.test.ts:156`.
- **Testy bazy** sprawdzają kody i JSON, bez polskich tekstów.
- **Skrypty:**
  - `scripts/ui-literals.mjs` ma na liście polskie nazwy plików tras (`:16-19`), co nie przeszkadza;
  - `scripts/check-fonts.mjs` wymaga podzbioru `latin-ext`, a angielskiemu to nie przeszkadza.

### 5. Logowanie i poczta

- W `supabase/config.toml` szablony maili są zakomentowanymi domyślnymi po angielsku (`:235-244`), a katalogu `supabase/templates/` nie ma.
- Gra nie wysyła maili (`auth-errors.ts:9`).
- Ekranów Discorda i Google przy logowaniu repo nie widać.

## Code References

- `src/layouts/Layout.astro:25`: `<html lang="pl" class="dark">`
- `src/data/questions.ts:14-16`: pytanie to końcówka po „Kto z nas najprawdopodobniej”, w trybie przypuszczającym
- `src/data/questions.ts:27-42`, `:46-50`: kategorie i kształt pytania
- `supabase/migrations/20261113134418_question_base.sql:24-31`: baza zna numer, kategorię i 18+, bez tekstu
- `scripts/question-base-migration.mjs:69`: migawka usuwa wiersze spoza pliku
- `src/lib/rounds/draw.ts:56-76`, `:102-104`: pula do losowania i tekst po numerze
- `src/lib/rooms/server.ts:285-293`, `:298-306`, `:333-351`, `:670-686`: tekst pytania na serwerze (lista, runda, historia)
- `src/lib/rooms/shared.ts:853-861`: „1 gracz / N graczy” i zdanie pytania
- `src/lib/rooms/summary.ts:32-39`: polska liczba mnoga
- `src/lib/rooms/game-list.ts:27-35`: daty `pl-PL`, `Europe/Warsaw`
- `src/lib/rooms/gifs.ts:84`: `locale: "pl"` dla KLIPY
- `src/lib/rooms/errors.ts:53-126`, `src/lib/auth-errors.ts:6-36`: kody błędów na teksty
- `supabase/migrations/20261114101656_players_channel_key.sql:315-330`: kategorie tylko w części prowadzącego `room_lobby`
- `tests/e2e/support/room.ts`, `tests/e2e/support/round.ts:19`: rdzeń polskich lokatorów e2e
- `scripts/smoke.mjs:321-326`: karta linku po polsku w smoke

## Architecture Insights

- **Błędy jako kody to gotowy wzór.** Trasy i funkcje bazy oddają kody, a tekst daje mapa (`errors.ts`, `auth-errors.ts`). Słownik ekranów może pójść tą samą drogą: moduł na język z tymi samymi kluczami, a TypeScript (`npx astro check`) pilnuje, że angielski ma każdy klucz. Bez nowej biblioteki.
- **Pytania są już rozdzielone na numer i tekst.** Numer jest w bazie, tekst w Workerze. Drugi język pytań to drugi tekst pod tym samym numerem (wariant a niżej) albo osobna pula numerów (wariant b). Losowanie, „bez powtórek” i liczniki zależą tylko od numerów.
- **Wyspy React nie znają języka strony.** Słownik albo napisy muszą przyjść w danych ekranu. Wzór to `gifSearchKey` i `signingKey` w danych strony pokoju.
- **Zasada z `lessons.md`** „Pytania gry tylko po stronie serwera” obowiązuje też dla angielskich tekstów pytań.

## Historical Context (from prior changes)

- `context/foundation/prd.md:219` (commit `e6e2545`, 2026-09-26): „Bez wersji angielskiej w v1 — gra i baza pytań są po polsku; angielski ewentualnie po dopracowaniu gry”. Wspierane: to jedyne uzasadnienie w dokumentach.
- `context/foundation/roadmap.md:520`: Parked „Wersja angielska”, to samo uzasadnienie. Wspierane.
- `context/foundation/roadmap.md:89`: „ekrany startera po angielsku (`Layout.astro:14`)”. **Nieaktualne**: dziś jest `lang="pl"` w `Layout.astro:25`.
- `context/archive/2026-10-04-ui-signin-contract/plan.md:18`, `research.md:97-100`: przejście z `lang="en"` na `lang="pl"`. Z `lang="en"` czytnik ekranu czytał polski z angielską wymową. Przy angielskiej grze `lang` musi iść za językiem ekranu.
- `context/changes/room-chat-gifs/plan.md:50`: „`locale=pl` to język gry, nie gracza”. Zgodne z językiem na grę.
- `context/domain/glossary.md:9`: terminy zostają po polsku, nazwy w kodzie po angielsku. Angielskie napisy potrzebują stałych odpowiedników terminów (odsłona, pominięcie pytania, wstrzymanie się, propozycja, współhost).
- `context/domain/03-anti-corruption-layer.md:174`, `:189`, `:263`: błędy Supabase tłumaczone na polski w `auth-errors.ts`, celowo.

## Related Research

- `context/archive/2026-11-15-no-recent-repeats/research.md`: losowanie i „znane” pytania hosta.
- `context/changes/game-history-details/research.md`, `plan.md`: historia pokazuje dzisiejsze brzmienie pytań.
- `context/archive/2026-10-04-ui-signin-contract/research.md`: `lang` strony i czytnik ekranu.

## Open Questions

Rozstrzygnięte przez Karola 2026-11-21 (rekomendacje sesji przyjęte w całości). Pytania 1 i 4 z pierwszej wersji tej listy połączone w decyzję 3.

1. **Język należy do gry.** Host wybiera PL albo EN przy „Nowa gra”. Link, karta linku na Discordzie, pokój i pytania są w tym języku dla wszystkich graczy. Wymaga `rooms.language`, nowego parametru `create_room` i języka w `room_lobby` i `game_history` (sekcja 3).
2. **Angielskie pytania to tłumaczenie tych samych numerów** (wariant a). Te same 960 numerów i 14 kategorii, drugi tekst po angielsku w `questions.ts`. Bez zmian w `private.question_base` i w migawce. „Bez powtórek” liczy się dalej po numerach, więc host nie dostanie po angielsku pytania, które grał po polsku. Pytanie bez angielskiego tekstu Worker pomija w puli angielskiej gry. Liczniki `question_stats` łączą oba języki pod jednym numerem. Nikt ich jeszcze nie czyta, a podział na języki to temat S-12.
3. **Ekrany hosta przed grą** (`/`, `/gry`, logowanie): na start język przeglądarki (`Accept-Language`, `Astro.preferredLocale`), do tego przełącznik PL/EN zapamiętany w ciasteczku. Bez adresu `/en/`, więc przekierowania zostają bez zmian. Wygląd przełącznika Karol wybiera na zrzutach.
4. **Angielskie pytania pisze agent, agent-krytyk poprawia** (wzór z punktu I). Wszystkie 960, z 18+. Karol ogląda próbkę około 30 i zatwierdza.

Rozstrzyga sesja (technika):

5. **Testy.** e2e zostają po polsku (domyślny język), dochodzi jeden angielski przebieg gry. Smoke dostaje kroki angielskiej gry. Testy jednostkowe słownika sprawdzają, że angielski ma każdy klucz polskiego, bez przepisywania tekstów do asercji (§6.1).
6. **PRD i roadmapa** przed planem, za zgodą Karola: zdjęcie z Non-Goals (`prd.md:219`), nowe FR-031, slice S-27 z Parked (`roadmap.md:520`). Jeden slice z kilkoma fazami i PR-ami, bo sama angielska strona bez angielskich pytań nic graczom nie daje.
