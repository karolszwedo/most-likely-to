# Kciuki na odsłonie lepiej widoczne (S-30) — Plan Brief

> Full plan: `context/changes/reaction-visibility/plan.md`
> Research: `context/changes/reaction-visibility/research.md`

## What & Why

W pierwszej grze ze znajomymi (2026-11-22, uwaga P) gracze nie zauważali kciuków „Oceń pytanie” na odsłonie. Kciuki przechodzą pod pytanie, w cichą linię z pigułkami „Dobre” i „Słabe”, żeby każdy widział je od razu, bez przewijania. Więcej kciuków to więcej danych o słabych pytaniach dla przeglądu pytań (S-28) i doboru pytań (S-12).

## Starting Point

Dziś kciuki stoją po całym wyniku (`RoundReveal.tsx:152`): na telefonie zawsze poza pierwszym ekranem, na laptopie hosta częściowo pod jego paskiem. Są to dwie konturowe ikony 36 px bez słów, a obok stoją duże kolorowe 👍 👎 emotek, które nic nie oceniają.

## Desired End State

Pod pytaniem każdy gracz widzi linię „Oceń pytanie · [👍 Dobre] [👎 Słabe]”: na telefonie i na laptopie, u gościa i u hosta, przy 5 i przy 20 graczach. Dotknięcie zaznacza kciuk na niebiesko, drugie go cofa. Nikt inny go nie widzi i nic na niego nie czeka. Wynik stoi zaraz pod linią.

## Key Decisions Made

| Decision       | Choice                                               | Why (1 sentence)                                                                                            | Source   |
| -------------- | ---------------------------------------------------- | ----------------------------------------------------------------------------------------------------------- | -------- |
| Wariant        | W2: cicha linia pod pytaniem                         | Jedyny układ z kciukami w pierwszym ekranie przy każdej liczbie graczy i roli (W1 dalej wymaga przewijania) | Research |
| Słowa          | „Dobre” / „Słabe”, podpis „Oceń pytanie” (cichy)     | Znaczenie widać bez czytnika ekranu, a podpis mówi, że to ocena, nie drugi głos                             | Research |
| Potwierdzenie  | Bez „Dzięki”, samo zaznaczenie                       | Zero dodatkowego ruchu na kulminacji rundy                                                                  | Research |
| Nazwy dostępne | Zostają „Dobre pytanie” / „Słabe pytanie”            | Widoczne słowo jest początkiem nazwy (label in name), e2e szuka bez zmian                                   | Plan     |
| Rozmiar        | Istniejący `Button size="lg"` (40 px, pigułka)       | Jak na makiecie, bez nowego rozmiaru i wiersza w kitchen-sink                                               | Plan     |
| Miejsce w DOM  | Po tytule, liczniku i dopisku, przed „Wynik”         | Tytuł zostaje pierwszy (fokus), kolejność czytania zgodna z ekranem, `revealMotion` bez zmian               | Plan     |
| Strażnik       | Krok e2e: kciuki nad „Wynik” i w oknie, oba projekty | Pilnuje dokładnie tego, po co jest zmiana; próbny alarm to potwierdza                                       | Plan     |

## Scope

**In scope:**

- wygląd i miejsce kciuków (`QuestionReaction`, `RoundReveal`);
- słowa w słowniku;
- nagłówki podglądów `/dev/room-states`;
- krok e2e w `game.spec.ts` z próbnym alarmem;
- reguła w `AGENTS.md`, wpisy w test-planie i roadmapie;
- PR i wdrożenie.

**Out of scope:**

- baza, serwer gry i trasa kciuka;
- „Dzięki”, karta wokół kciuków, nowe rozmiary i tokeny, ruch;
- pasek emotek;
- angielski słownik (S-27 Faza 4);
- nowy stan `/dev/room-window`, smoke;
- warianty W1 i W3.

## Architecture / Approach

Logika kciuka (`tap`, stany, `onReact`) się nie zmienia. `QuestionReaction` dostaje nowy wygląd: cichy podpis i dwie pigułki ze słowem, w jednej linii zawijanej na wąskim ekranie. `RoundReveal` przenosi go do kolumny pytania. Nowy krok e2e mierzy kciuki względem regionu „Wynik” i okna. Alarm cofa samo miejsce i ma trafić tylko w ten krok.

## Phases at a Glance

| Phase                     | What it delivers                                                                      | Key risk                                                 |
| ------------------------- | ------------------------------------------------------------------------------------- | -------------------------------------------------------- |
| 1. Kciuki pod pytaniem    | Linia W2 na odsłonie, podglądy, krok e2e, zrzuty do akceptacji, draft PR, alarm       | Zaznaczone „Dobre” nad kołem może wyglądać na drugi głos |
| 2. Domknięcie i wdrożenie | Reguła w `AGENTS.md`, test-plan, roadmapa, PR scalony, smoke prod, sprawdzenie w grze | Ręczne sprawdzenie czeka na najbliższą grę               |

**Prerequisites:** gałąź `reaction-visibility` (research i decyzje zrobione), serwer dev do zrzutów i pomiaru, zgoda Karola na push i smoke na produkcji.
**Estimated effort:** 1–2 sesje w 2 fazach (CI z e2e około 7–20 min na przebieg, razy 3: faza, alarm, revert).

## Open Risks & Assumptions

- Zaznaczony kciuk (wypełnienie Blurple) nad kołem może przyciągać wzrok bardziej niż wynik. Karol widział ten stan na galerii (W2, „Dobre” zaznaczone) i wybrał W2. Sprawdzian: zrzuty Fazy 1 i pytanie do ekipy w grze.
- Wynik zjeżdża o około 50 px. Przy 20 graczach i tak trzeba przewinąć do końca tabeli, ale tak było już przed zmianą.
- S-27 (`english-version-b`, draft PR #92) po powrocie dostanie nowe klucze słownika z `main`. Test zgodności kluczy zażąda ich angielskich odpowiedników w Fazie 4.

## Success Criteria (Summary)

- Na telefonie i na laptopie, u każdego gracza, kciuki są w pierwszym ekranie odsłony, pod pytaniem i ze słowami.
- Kciuk działa jak dotąd (zaznacz, cofnij, przełącz), a prowadzący nigdy na niego nie czeka.
- W następnej grze ekipa daje kciuki bez podpowiadania i nie myli ich z głosem ani z emotkami.
