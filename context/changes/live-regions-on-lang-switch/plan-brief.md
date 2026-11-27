# Czytnik ekranu nie czyta drugi raz komunikatów po przełączeniu języka: skrót planu

> Full plan: `context/changes/live-regions-on-lang-switch/plan.md`

## What & Why

W pokoju język zmienia się bez przeładowania. Ukryte komunikaty dla czytnika ekranu, które składają zdanie przy każdym rysowaniu, dostają wtedy to samo zdanie w nowym języku, a czytnik czyta je jako nowość. Najgorzej przy linku: „Link dla graczy się zmienił” stoi, dopóki host nie skopiuje nowego linku, więc przełączenie nawet po minutach czyta go drugi raz. Gra nie powinna mówić graczowi z czytnikiem drugi raz tego, co już słyszał.

## Starting Point

Wzór już jest: `useTextState` i zdanie o roli współhosta (poprawka F3 z przeglądu wersji angielskiej) składają tekst raz, w chwili zdarzenia, i zdejmują go przy zmianie języka. Siedem innych ukrytych regionów w pokoju dalej składa zdanie przy rysowaniu. Czat dziś objawu nie ma (jego zdanie brzmi w obu językach tak samo), ale ma ten sam mechanizm.

## Desired End State

Po przełączeniu języka 7 ukrytych regionów milczy aż do następnego zdarzenia (nowa wiadomość, emotka, zmiana linku, kolejne pytanie, nowe wyniki gifów, zerwane połączenie). Wtedy mówi już w nowym języku. Widoczne teksty przechodzą na nowy język jak dziś, wygląd ekranu się nie zmienia.

## Key Decisions Made

| Decision            | Choice                                                                                                     | Why (1 sentence)                                                                                                |
| ------------------- | ---------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------- |
| Zakres              | 7 ukrytych regionów: link, koniec pytań, brak połączenia, emotki, „Usunąć X?”, liczba gifów, czat na zapas | Cała klasa problemu jednym ruchem, bez zmiany wyglądu (Karol, 27.11).                                           |
| Widoczne komunikaty | Poza zakresem                                                                                              | Ich tekst na ekranie musi się przetłumaczyć; rozdzielenie na tekst dla oka i dla czytnika to większa przeróbka. |
| Sposób              | Jedna funkcja `useSpoken` obok `useTextState`                                                              | Ten sam wzorzec co dotąd, jedna linia w każdym miejscu, jedna reguła w `AGENTS.md`.                             |
| Test                | Czysta funkcja przejścia w teście jednostkowym + krok e2e po usunięciu gracza                              | `vitest` nie ma DOM; „link się zmienił” trwa do skopiowania, więc e2e nie ściga się z czasem.                   |
| Cykl                | Lżejszy, bez `/10x-plan-review`, z próbnym alarmem                                                         | Same ekrany; dochodzi nowy test.                                                                                |

## Scope

**In scope:**

- `useSpoken` w `src/lib/i18n/react.tsx`;
- 7 regionów: `PlayerLink`, `HostActions`, `LiveBanner`, `EmoteBubbles`, `RemovePlayerButton`, `GifPicker` (ukryta liczba wyników), `RoomChat`;
- test jednostkowy, krok e2e w `remove-player.spec.ts` (lokator przełącznika przeniesiony do `support/`), reguła w `AGENTS.md`.

**Out of scope:**

- widoczne komunikaty („Nie udało się odświeżyć” ×5, `linkFailed`, błędy `ServerError`, widoczne linijki gifów);
- regiony już na `useTextState`;
- strony, które przeładowują się przy przełączeniu;
- nowe teksty i zmiany wyglądu.

## Architecture / Approach

Czysta funkcja przejścia na stanie `{ lang, text, quiet }`: inny język oznacza ciszę, inne zdanie w tym samym języku oznacza mowę. Nad nią cienki hook, który zwraca `""` już w rysowaniu ze zmienionym językiem. Każde z 7 miejsc liczy zdanie jak dziś i przepuszcza je przez hook.

## Phases at a Glance

| Phase          | What it delivers                                               | Key risk                                                                                               |
| -------------- | -------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| 1. Kod i testy | `useSpoken`, 7 regionów, test, krok e2e, reguła, bramka, alarm | Hook zwracający `""` dopiero w następnym rysowaniu przepuściłby angielskie zdanie (krok e2e to łapie). |
| 2. Wdrożenie   | PR, zielone CI, scalenie, smoke na produkcji                   | Brak: nic nie zmienia bazy ani serwera gry.                                                            |

**Prerequisites:** gałąź `live-regions-on-lang-switch` od `origin/main` (jest).
**Estimated effort:** około jednej sesji.

## Open Risks & Assumptions

- Gdy zmiana języka i prawdziwe zdarzenie trafią w to samo rysowanie, zdarzenie zostanie wyciszone. To ta sama znana granica co w `useTextState`.
- Prawdziwe zachowanie czytnika (TalkBack, VoiceOver) sprawdzi Karol przy grze. E2e widzi tylko tekst regionu.

## Success Criteria (Summary)

- Host po usunięciu gracza przełącza język i czytnik nie mówi drugi raz „link się zmienił”.
- Nowa wiadomość, emotka albo zdarzenie po przełączeniu jest czytane, w nowym języku.
- Ekran wygląda tak samo jak przed zmianą.
