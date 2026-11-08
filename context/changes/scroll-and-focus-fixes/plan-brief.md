# Przewijanie i fokus — Plan Brief

> Full plan: `context/changes/scroll-and-focus-fixes/plan.md`
> Research: `context/changes/scroll-and-focus-fixes/research.md`

## What & Why

Dwie drobne poprawki ekranu pokoju. Na telefonie lista pytań hosta po „Popraw” daje się przesuwać w bok. Gdy własny ruch gracza zabiera przycisk, na którym stał fokus (trzecia propozycja, odpowiedź na propozycję lub prośbę o wejście, „Zagłosuj”), osoba z klawiaturą albo czytnikiem ekranu ląduje na początku strony. To F4 z przeglądu S-10, rozszerzony o „Zagłosuj”.

## Starting Point

Ukryta podpowiedź pola w „Popraw” ma 445 px szerokości zamiast 1 px przez regułę shadcn `Field` `[&>.sr-only]:w-auto` (zmierzone: strona 473 px przy oknach 320–390 px). Fokus po tych ruchach nie jest nigdzie przenoszony; po „Zagłosuj” zmierzone w Chrome: `body`. Dobry wzorzec już jest: „Usuń” na liście „Gracze” (RoomScreen `removal`).

## Desired End State

Po „Popraw” na telefonie strona ma szerokość okna. Po własnym ruchu, który zabiera przycisk, fokus (tylko gdy zginął) idzie na ten sam przycisk w następnym wierszu, potem na element bloku, który został, a na końcu na tytuł widoku; po głosie na tytuł pytania, a po głosie, który odsłonił rundę, na tytuł odsłony. Cudzy ruch fokusu nie rusza.

## Key Decisions Made

| Decision                    | Choice                                                            | Why (1 sentence)                                                                       | Source   |
| --------------------------- | ----------------------------------------------------------------- | -------------------------------------------------------------------------------------- | -------- |
| Zakres fokusu               | F4 (3 miejsca) + „Zagłosuj”                                       | Ten sam błąd, mała zmiana, najczęstszy ruch w grze.                                    | Karol    |
| Poprawka przewijania        | U źródła: `field.tsx`, `w-auto` → `w-px`                          | Usuwa pułapkę dla każdego przyszłego pola z ukrytym tekstem; shadcn ma tę samą regułę. | Research |
| Zasada fokusu               | Następny wiersz → blok → tytuł; tylko gdy fokus zginął            | Uogólnia działający wzorzec `removal`.                                                 | Research |
| Cel po głosie               | Tytuł pytania, nie „Głos oddany”                                  | „Głos oddany” ma `role="alert"`; fokus na nim dałby podwójne odczytanie.               | Plan     |
| „Zagłosuj” w czasie wysyłki | `aria-disabled` zamiast `disabled`                                | Odmowa nie gubi fokusu, jak przy innych przyciskach gry.                               | Plan     |
| Gdzie żyje logika           | Komponent listy (cel zapisany przed wysłaniem); głos w RoomScreen | Wiersz i widok głosu znikają razem ze stanem; dzwonek może wyprzedzić odpowiedź.       | Plan     |
| Dowód                       | Testy e2e najpierw, CI czerwone przed poprawką                    | Domyka lukę researchu (bez przeglądarki lokalnie dla ścieżek z serwerem).              | Plan     |

## Scope

**In scope:**

- `field.tsx` (ukryte teksty w `Field`)
- Wspólny pomocnik `src/components/room/focus.ts`
- Fokus w ProposalForm, QuestionProposals, JoinRequests, RoundVoting i RoomScreen (tytuł, głos)
- E2e: `question-list`, `proposals` (+ nowy test z dwiema propozycjami), `latecomer`, `round`
- Test-plan §6.4, reguła w AGENTS.md, notka przy F4

**Out of scope:**

- „Zacznij grę”, utrata roli współhosta, przepisanie `removal`/`removedRow`
- Wygląd ekranów, rola „Głos oddany”, czytniki ekranu, testy komponentów, nowe stany podglądu

## Architecture / Approach

Lista (QuestionProposals, JoinRequests) przed wysłaniem odpowiedzi zapisuje cel z listy sprzed ruchu; gdy odświeżony stan nie ma już pozycji i fokus zginął, oddaje go według zasady przez `focus.ts`, z tytułem widoku od RoomScreen jako ostatnim celem. ProposalForm robi to samo dla zdania o limicie. Cel głosu trzyma RoomScreen, bo widok głosu znika przy odsłonie.

## Phases at a Glance

| Phase                    | What it delivers                                                 | Key risk                                                    |
| ------------------------ | ---------------------------------------------------------------- | ----------------------------------------------------------- |
| 1. Testy najpierw        | Nowe sprawdzenia e2e, CI czerwone dokładnie na nich              | Czerwone coś jeszcze (wtedy najpierw poprawić test)         |
| 2. Poprawki              | `field.tsx`, zasada fokusu w 4 miejscach, „Zagłosuj”; CI zielone | Wyścig dzwonka z odpowiedzią (cel zapisany przed wysłaniem) |
| 3. Dokumenty i wdrożenie | Test-plan, AGENTS.md, notka F4, PR, scalenie, telefon Karola     | —                                                           |

**Prerequisites:** gałąź `scroll-and-focus-fixes` od `03402b7`; zgoda Karola na każdy push.
**Estimated effort:** ~1 sesja, 3 fazy, 2–3 przebiegi CI.

## Open Risks & Assumptions

- E2e sprawdza tylko Chromium; zachowanie Safari i czytników ekranu niesprawdzone.
- Gałąź „następny wiersz” w JoinRequests nie ma osobnego testu (ten sam pomocnik co w propozycjach).
- W podglądzie gry fokus po głosie się nie przenosi (podgląd nie dostaje stanu) — oczekiwane.

## Success Criteria (Summary)

- Host na telefonie poprawia pytanie bez przesuwania ekranu w bok.
- Po każdym z czterech ruchów klawiatura i czytnik ekranu zostają w sensownym miejscu, a nie na początku strony.
- E2e w CI pilnuje obu poprawek.
