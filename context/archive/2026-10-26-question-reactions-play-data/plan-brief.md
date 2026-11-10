# Kciuki na odsłonie i zbiorcze dane o pytaniach — Plan Brief

> Full plan: `context/changes/question-reactions-play-data/plan.md`
> Research: `context/changes/question-reactions-play-data/research.md`

## What & Why

S-11 (FR-016, FR-018): na ekranie odsłony gracz może jednym dotknięciem ocenić pytanie kciukiem, a baza zbiera o
każdym pytaniu z bazy zbiorcze liczniki, które przetrwają skasowanie gry. To paliwo dla doboru pytań (S-12). Idzie
przed pierwszym wieczorem z ekipą, bo dane zbierają się dopiero od wdrożenia.

## Starting Point

Odsłona ma pytanie, region „Wynik” i pasek hosta; nie ma żadnej reakcji. Baza po odsłonie trzyma wyniki rundy tylko
przy pokoju (znikną razem z grą), pominięcia i usunięcia z listy nie są nigdzie liczone, a każda tabela wisi na pokoju.

## Desired End State

Każdy gracz w pokoju widzi na odsłonie „Dobre pytanie” i „Słabe pytanie”; może zaznaczyć, przełączyć albo zdjąć, nikt
nie widzi cudzego kciuka, a host przechodzi dalej bez czekania. W bazie jedna globalna tabela ma o każdym pytaniu z bazy
sumy: odsłony, głosy, wstrzymania, skupienie głosów, pominięcia, kciuki, wystawienia na liście i usunięcia.

## Key Decisions Made

| Decision                       | Choice                                                                                                                | Why (1 sentence)                                                         | Source              |
| ------------------------------ | --------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------ | ------------------- |
| Czy pokój widzi liczby kciuków | Nie, tylko dane                                                                                                       | Bez budzenia wszystkich telefonów; reakcje „na pokaz” przyjdą z emotkami | Plan (Karol)        |
| Wygląd i miejsce kciuków       | 2–3 warianty na zrzutach, wybiera Karol                                                                               | Wygląd ekranu to zawsze decyzja Karola                                   | Plan (Karol)        |
| Kto daje kciuk                 | Każdy gracz w pokoju, także host i wpuszczony spóźniony                                                               | Kciuk ocenia pytanie, nie wynik                                          | Research + Plan     |
| Zmiana zdania                  | Przełączenie i zdjęcie drugim dotknięciem; liczy się stan przy zsypie                                                 | Jeden kciuk na gracza bez odejmowania liczników                          | Plan                |
| Gdzie żyje kciuk               | Nielogowana `private.round_reactions`, zsyp do liczników przy „Następne pytanie”, końcu gry, „Nowej grze”, sprzątaniu | Wzór urny; liczniki nie niosą śladu gracza (pułapka `xmin`)              | Research            |
| Liczniki                       | Surowe sumy w `private.question_stats` (z liczbą uprawnionych), bez pokoju, gracza, czasu                             | Wagi i progi oceny to S-12; wyników rund po S-13 już nie będzie          | Research + przegląd |
| Skupienie głosów               | Tylko rundy z co najmniej 2 głosami na osoby                                                                          | Odsłona przy 0–1 głosie nic nie mówi o pytaniu                           | Research + Plan     |
| Usunięcia z listy              | Liczone przy starcie gry, tylko pytania z bazy bez własnego tekstu                                                    | Pokoje zamknięte w poczekalni się nie liczą; brzmienia się nie mieszają  | Research            |
| Gry smoke                      | Wykluczone (UUID konta w `stats_excluded_hosts`), sprawdzone sumami liczników przed i po smoke                        | Smoke przy każdym wdrożeniu odsłania i pomija prawdziwe pytania          | Plan + przegląd     |
| Kciuk po przeładowaniu         | Nie wraca na ekran; ponowne dotknięcie nadpisuje                                                                      | Bez zmian w kontrakcie stanu pokoju i jego testach                       | Plan                |
| Uprawnienia funkcji            | Bez zmian; `anon` tylko dla nowego `react_round`                                                                      | Trzy przerabiane funkcje są dziś tylko dla zalogowanego hosta            | Przegląd            |
| Kody odmów                     | Istniejące (`round_over`, `room_closed`, `room_unknown`, `no_round`)                                                  | Bez zmian w `errors.ts`                                                  | Plan                |

## Scope

**In scope:**

- Migracja: 3 tabele, RPC `react_round`, zsyp kciuków, dopiski w `finish_round`, `skip_round`, `start_game`,
  `next_round`, `drop_round_state`
- Trasa `/api/rooms/<id>/react`, kontrolka `QuestionReaction` na odsłonie, podglądy `/dev`
- pgTAP, testy bazy, oracle RPC, E2E, słownik domeny

**Out of scope:**

- Liczby kciuków dla pokoju, emotki (FR-023), ocena i dobór pytań (S-12), lista gier i kasowanie (S-13)
- Liczniki pytań własnych i poprawionych, rundy porzucone, dane sprzed wdrożenia
- Zmiany w smoke i decyzja o S-04

## Architecture / Approach

Kciuk idzie torem głosu (przycisk → `POST /react` → `react_round` z tożsamością i numerem pytania jak `cast_vote`), ale
bez dzwonka. W bazie kciuk żyje tylko w trakcie odsłony; transakcja prowadzącego albo sprzątania zsypuje go do
`question_stats` i kasuje. Odsłony, pominięcia i listy dopisują sumy w funkcjach, które już robią te kroki, zawsze po
wszystkich odmowach.

## Phases at a Glance

| Phase                        | What it delivers                                                       | Key risk                                                    |
| ---------------------------- | ---------------------------------------------------------------------- | ----------------------------------------------------------- |
| 1. Kciuk i liczniki w bazie  | Migracja, opakowanie RPC, pgTAP, testy bazy, oracle                    | Kopie pięciu funkcji muszą wyjść od ich ostatnich definicji |
| 2. Kciuki na ekranie odsłony | Trasa, kontrolka w wariancie Karola, podglądy, E2E                     | Kciuk nie może przesunąć paska hosta ani fokusu             |
| 3. Wdrożenie                 | Migracja na produkcji przed kodem, smoke, ręczny test w zbiorczej grze | Okno starego Workera (zmiany addytywne)                     |

**Prerequisites:** UUID konta smoke z panelu Supabase (Karol); `db push` z domu albo przez hotspot.
**Estimated effort:** ~2–3 sesje w 3 fazach.

## Open Risks & Assumptions

- Host wołający RPC bezpośrednio może zawyżać liczniki dowolnym id w poprawnym formacie (baza nie zna katalogu);
  przyjęte przy skali ok. 100 osób.
- Testowe gry Karola na produkcji też zasilają liczniki (kilka rund); przyjęte.
- Kciuki będą rzadkie (FR-018 to zakłada); ocena w S-12 opiera się też na pominięciach i skupieniu.

## Success Criteria (Summary)

- Na odsłonie każdy może dać, przełączyć i zdjąć kciuk, a host nigdy na to nie czeka
- Po grze liczniki pytań w bazie zgadzają się z tym, co się działo, bez śladu graczy i bez gier smoke
- CI zielone (`ci`, `smoke`, `db`, `e2e`), smoke na produkcji 77/77
