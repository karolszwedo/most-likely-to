# Historia gry w panelu hosta (S-26) — Plan Brief

> Full plan: `context/changes/game-history-details/plan.md`
> Research: `context/changes/game-history-details/research.md`

## What & Why

Host otwiera zakończoną grę ze swojej listy „Twoje gry” i widzi jej historię: podsumowanie wieczoru jak na ekranie końca gry, a pod nim pytania w kolejności, w jakiej padły, z wynikiem każdej odsłony. Pytanie pominięte i przerwane bez odsłony jest oznaczone. Dziś lista S-13 pokazuje tylko datę, liczbę pytań i nicki, a wyniki rund po grze są nieosiągalne, choć baza je trzyma (PRD FR-030, wariant B z 2026-11-20).

## Starting Point

Baza trzyma wszystko do skasowania gry: rundy, wyniki odsłon, listę pytań gry. Żadna funkcja nie oddaje jednak wyników rund zakończonej gry. Tabela wyniku i podsumowanie istnieją tylko w pokoju i są spięte z jego widokiem (`RoundReveal.tsx`, `GameSummary.tsx`).

## Desired End State

Karta gry, która wystartowała, prowadzi do `/gry/<id>`. Strona pokazuje podsumowanie, a potem każde pytanie z tabelą głosów i liczbą wstrzymań albo z oznaczeniem pominięcia lub przerwania. Przy pytaniu, które nie pochodzi z bazy, jest plakietka. Gdy głosy przepadły z usuniętym graczem, przy odsłonie jest krótki dopisek. Tylko host gry, nic nowego w bazie, bez skryptu w przeglądarce.

## Key Decisions Made

| Decision               | Choice                                                                              | Why (1 sentence)                                                                                | Source           |
| ---------------------- | ----------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------- | ---------------- |
| Gdzie historia         | Osobna strona `/gry/<id>`                                                           | Serwer ładuje jedną grę, bez nowego API i stanów ładowania; ochrona `/gry` obejmuje ją już dziś | Plan (Karol)     |
| Usunięty gracz         | Krótki dopisek przy odsłonie z utraconymi głosami, bez liczby i nicku               | Host rozumie, czemu głosy się nie sumują; strona dostaje tylko tak/nie                          | Plan (Karol)     |
| Pochodzenie pytania    | Plakietki „Twoje” (własne, przeredagowane) i „propozycja gościa”                    | Widać, co dopisał wieczór; autor propozycji nigdy                                               | Plan (Karol)     |
| Gra bez startu         | Bez wejścia w historię                                                              | Nie ma czego pokazać; po starcie gra ma zawsze rundę                                            | Plan (domyślnie) |
| Brzmienie pytań z bazy | Dzisiejszy tekst z `questions.ts`                                                   | FR-030: nic nowego w bazie, więc bez kopii tekstu                                               | Research / PRD   |
| Wygląd                 | Galeria wariantów w Fazie 3 (wejście z karty, układ, koło przy pytaniu, oznaczenia) | Wygląd ekranu wybiera Karol na zrzutach                                                         | Research / Plan  |
| Dane z bazy            | Jedna funkcja `game_history`: gracze i rundy; podsumowanie liczy Worker             | Podsumowanie z tych samych liczb co tabele, regułą końca gry; test porównuje z `game_totals`    | Plan             |
| Dostęp                 | Tylko host gry; obcy, nieznana i otwarta gra → 404                                  | PRD Access Control; odmowy jak `delete_game`                                                    | PRD / Plan       |

## Scope

**In scope:**

- Funkcja bazy `game_history`, testy bazy i pgTAP
- Odczyt w Workerze, widok, strona `/gry/<id>`, kroki smoke
- Galeria, wspólna tabela wyniku, nowe propsy `GameSummary`, wejście z karty, podglądy, e2e
- Dokumenty (PRD, słownik, test-plan, deploy-plan), `db push`, PR, smoke prod, sprawdzenie Karola

**Out of scope:**

- Współhost i goście, porównania i sumy między grami
- Zapis czegokolwiek nowego (tekst pytań, czas końca gry)
- Liczba głosujących, „kto już zagłosował”, nick usuniętego gracza na ekranie
- Nowa trasa API, przełącznik „Koło/Paski”, zmiana wyglądu pokoju

## Architecture / Approach

`game_history(p_room_id)` (security definer, tylko `authenticated`, właściciel sprawdzany w środku) oddaje graczy (nick, kolor) i rundy po kolei: los rundy, tekst wpisu listy albo id pytania, rodzaj pytania, a przy odsłonie wyniki, wstrzymania i liczbę kartek. Worker parsuje tylko klucze kontraktu, zamienia id na tekst (`baseQuestionText`), liczy podsumowanie (`gameSummary`) i dopisek, a strona Astro renderuje gotowy widok na serwerze. Ekrany biorą tabelę i koło wydzielone z `RoundReveal` i `GameSummary` z nowymi propsami.

## Phases at a Glance

| Phase                    | What it delivers                                                                  | Key risk                                                                          |
| ------------------------ | --------------------------------------------------------------------------------- | --------------------------------------------------------------------------------- |
| 1. Baza                  | `game_history` z testami bazy i pgTAP, próbny alarm (bez sprawdzenia właściciela) | Wyciek cudzej gry albo klucza spoza kontraktu                                     |
| 2. Serwer gry            | Parser, widok, strona `/gry/<id>` ze statusami, testy jednostkowe, smoke, alarm   | Podsumowanie rozjechane z `game_totals`; `ballots` albo id pytania w przeglądarce |
| 3. Ekrany                | Galeria i wybór Karola, wspólna tabela, strona, wejście z karty, podglądy, e2e    | Wydzielenie tabeli zmienia odsłonę w pokoju                                       |
| 4. Dokumenty i wdrożenie | PRD, słownik, test-plan, `db push` przed scaleniem, PR, smoke prod, Karol         | `db push` z sieci blokującej porty bazy; kolejność baza → kod                     |

**Prerequisites:** S-13 i S-15 na produkcji (są); gałąź `game-history-details`; zgody Karola na push, `db push` i smoke prod.
**Estimated effort:** ok. 4–5 sesji (po jednej na fazę, galeria może wymagać drugiej rundy zrzutów).

## Open Risks & Assumptions

- Prawdziwej strony nie da się odpalić lokalnie przed `db push` (serwer dev = produkcyjne Supabase); trasę sprawdza CI, wygląd podglądy.
- Dopisek pojawia się też, gdy gracza usunięto w trakcie głosowania; jest wtedy dalej prawdziwy.
- Pytanie sprzed S-17 z nieznanym id pokaże zdanie zastępcze.

## Success Criteria (Summary)

- Host otwiera dowolną swoją zakończoną grę z „Twoje gry” i widzi te same liczby, które pokój widział na odsłonach.
- Nikt poza hostem gry nie dostaje jej historii; nic nowego nie trafia do bazy ani do przeglądarki.
- Odsłona w pokoju i ekran końca gry wyglądają jak przed zmianą.
