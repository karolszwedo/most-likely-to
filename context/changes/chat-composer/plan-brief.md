# Czat: szukanie gifa zamiast pisania i emoji w wiadomości (S-29): plan w skrócie

> Full plan: `context/changes/chat-composer/plan.md`
> Research: `context/changes/chat-composer/research.md`

## What & Why

W pierwszej grze ze znajomymi (2026-11-22) znajoma wysłała do całego pokoju słowo, które chciała wpisać w wyszukiwarkę gifów. Oba pola stały naraz i wyglądały tak samo. Zmiana sprawia, że naraz jest tylko jedno pole tekstowe. Dokłada też przycisk z siatką emoji obok „GIF”, o który prosił Karol.

## Starting Point

Dziś wyszukiwarka gifów stoi nad polem wiadomości (telefon) albo w miejscu listy, z polem wiadomości pod spodem (laptop). Oba pola to ten sam kod. „GIF” wygląda tak samo zamknięty i otwarty. Emoji nie ma skąd wziąć poza klawiaturą telefonu. Na telefonie między panelem czatu a paskiem emotek prześwituje 3 px.

## Desired End State

- **Szukanie.** Po „GIF” wiersz pisania znika. Na dole stoi wiersz szukania: włączony „GIF”, pole z lupą i „Szukaj”. Nad wynikami jest napis „Szukaj gifa” i przycisk powrotu.
- **Emoji.** 😊 obok „GIF” otwiera siatkę 33 emoji nad polem. Dotknięcie wstawia emoji w miejscu kursora. Na telefonie klawiatura się chowa, a dotknięcie pola ją przywraca i zamyka siatkę.
- **Pasek emotek** stoi pod panelem czatu bez szczeliny.

## Key Decisions Made

| Decision                 | Choice                                                                   | Why (1 sentence)                                                                | Source            |
| ------------------------ | ------------------------------------------------------------------------ | ------------------------------------------------------------------------------- | ----------------- |
| Rozdzielenie pól         | R1: wyszukiwarka zamiast wiersza pisania, ze znakami z R2                | Tylko R1 usuwa samą możliwość pomyłki z gry                                     | Research (dec. 1) |
| Miejsce siatki           | E1: w panelu nad polem, w miejscu wyników gifów                          | Bez nowego komponentu, pole zostaje widoczne                                    | Research (dec. 2) |
| Klawiatura przy siatce   | K1: 😊 chowa klawiaturę, siatka zamiast niej                             | Cała siatka widoczna na telefonie, jak w komunikatorach                         | Research (dec. 2) |
| Zestaw emoji             | 33 (zestaw B + 🫨 🧐 🥴 🤬 🗿), 7 kolumn                                 | Każde to 1 znak licznika; 🫨 z ryzykiem kwadracika, przyjęte                    | Research (dec. 3) |
| Szczelina Z5             | Zaklejamy w tej zmianie (`min-h-18`)                                     | To samo miejsce ekranu co reszta zmiany                                         | Research (dec. 4) |
| Siatka a dotknięcie pola | Zamyka się, na każdym urządzeniu                                         | Na telefonie wraca sama klawiatura; jedno zachowanie, sprawdzalne w e2e         | Plan              |
| Napisy                   | „Szukaj gifa”, „Wróć do pisania” / „Wróć do czatu” (od `xl`), „Emoji”    | Każdy powrót mówi, co się stanie                                                | Plan              |
| Wygląd „włączony”        | Wariant `default`, zamknięty `outline`, wspólny moduł `chat-composer.ts` | Wzór gry (kciuki przy odsłonie), kontrast tych par już sprawdzony               | Plan              |
| Próbny alarm             | Jeden, w Fazie 1, na R1                                                  | To błąd z gry; test emoji porównuje dokładny tekst, więc nie przejdzie na pusto | Plan              |

## Scope

**In scope:**

- R1 w `GifPicker` i `RoomChat`;
- przycisk 😊 i siatka;
- napisy w słowniku;
- podglądy `/dev`, macierz kontrolek;
- hasło „emoji” w słowniku domeny;
- e2e w istniejącym teście czatu;
- `min-h-18` paska emotek;
- reguła w `AGENTS.md`, wpis w test-planie.

**Out of scope:**

- serwer gry, baza, zasady tekstu, smoke;
- nazwy emoji, wyszukiwarka emoji, odcienie skóry;
- strzałki w siatce;
- angielskie napisy (S-27, Faza 4);
- produkcyjny klucz KLIPY.

## Architecture / Approach

Moduł `src/components/room/chat-composer.ts` trzyma kontrakt: wygląd przełącznika (zamknięty i otwarty) i listę 33 emoji. Korzystają z niego `RoomChat`, `GifPicker`, podglądy i `/dev/ui-kitchen-sink`.

`RoomChat` renderuje albo wiersz pisania, albo wyszukiwarkę z wierszem szukania na dole. „GIF” to jeden przycisk przenoszony między wierszami. Siatka emoji stoi w tym samym miejscu panelu co wyniki gifów. Kursor pola trzymamy w refie, żeby wstawianie nie dawało polu fokusu (inaczej wróciłaby klawiatura).

## Phases at a Glance

| Phase                            | What it delivers                                                              | Key risk                                                                     |
| -------------------------------- | ----------------------------------------------------------------------------- | ---------------------------------------------------------------------------- |
| 1. Szukanie gifa zamiast pisania | Jedno pole naraz, włączony „GIF”, lupa i powrót; e2e i próbny alarm w CI      | Fokus po przeniesieniu „GIF” między wierszami; lokatory e2e w trybie ścisłym |
| 2. Siatka emoji i szczelina      | 😊, siatka 33 emoji, wstawianie w miejscu kursora, pasek emotek bez szczeliny | Klawiatura telefonu wracająca przy wstawianiu; siatka w niskim oknie         |
| 3. Domknięcie i wdrożenie        | Reguła w `AGENTS.md`, test-plan, PR, produkcja                                | Brak                                                                         |

**Prerequisites:** gałąź `chat-composer` (lokalna, bez upstreamu); zgody Karola na każdy push i smoke na produkcji.
**Estimated effort:** około 3 sesji (Faza 1 z alarmem, Faza 2, Faza 3 z wdrożeniem).

## Open Risks & Assumptions

- K1 (klawiatura chowa się po 😊) wynika ze wzoru „Wyślij wiadomość”, a nie z próby na telefonie. E2e nie emuluje dotyku, więc potwierdzi to dopiero ręczne sprawdzenie Karola (3.3).
- 🫨 (Emoji 15.0) może wyjść jako kwadracik na Windows 10 i starszych telefonach (przyjęte przez Karola).
- Makiety leżą w scratchpadach sesji i mogą zniknąć. Plan opisuje wygląd słowami.

## Success Criteria (Summary)

- Przy otwartym szukaniu gifa na ekranie nie ma pola wiadomości, więc pomyłki z gry nie da się powtórzyć.
- Emoji z siatki trafiają w miejsce kursora, a na telefonie siatka zastępuje klawiaturę.
- Między panelem czatu a paskiem emotek nie ma szczeliny.
