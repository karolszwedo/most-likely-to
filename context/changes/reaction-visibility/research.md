---
date: 2026-11-24T12:26:56+01:00
researcher: Claude (Opus 5.5) z Karolem
git_commit: 55827b9
branch: reaction-visibility
repository: most-likely-to
topic: "Kciuki na odsłonie lepiej widoczne (S-30)"
tags: [research, ui, reveal, thumbs, QuestionReaction, RoundReveal, EmoteBar]
status: complete
last_updated: 2026-11-24
last_updated_by: Claude (Opus 5.5)
---

# Research: kciuki na odsłonie lepiej widoczne (S-30)

**Date**: 2026-11-24T12:26:56+01:00
**Researcher**: Claude (Opus 5.5) z Karolem
**Git Commit**: 55827b9
**Branch**: reaction-visibility
**Repository**: most-likely-to

## Research Question

Po pierwszej grze ze znajomymi (2026-11-22, uwaga P) kciuki „Oceń pytanie” pod wynikiem odsłony okazały się mało widoczne: gracze ich nie zauważali (roadmapa S-30, `context/foundation/roadmap.md:510-520`). Brief audytu `/10x-ui`:

1. Gdzie kciuki lądują na telefonie 390×844 i na laptopie 1536×750 przy różnej liczbie graczy i czy są w pierwszym ekranie.
2. Czy przyciski 36 px z samą ikoną i podpis `text-sm` dają się zauważyć i zrozumieć bez czytnika ekranu.
3. Co pokazuje stan po dotknięciu, wysyłanie i błąd.
4. Jakie tokeny, karty i kafelki z `surfaces.ts` i `ui` mogą je podnieść bez nowej palety.
5. Co zmiana rusza w e2e, podglądach i słowniku.

Na końcu 2–4 sposoby do galerii zrzutów z rekomendacją. Granice: kciuk nieobowiązkowy, nie wstrzymuje prowadzącego, widzi go tylko ten gracz, bez timerów, bez bazy i `src/lib/rooms/`, ruch tylko pod `motion-safe`.

## Summary

- **Na telefonie kciuków nie ma w pierwszym ekranie w żadnym z 4 sprawdzonych stanów.** Pomiar na `/dev/room-window` (2026-11-24, Chrome przez Playwright, zrzuty w scratchpadzie sesji `a9ad86f2-…\scratchpad\s30\audyt\`):
  - gość, 5 graczy: grupa zaczyna się na 819 px, pod paskiem emotek przyklejonym na 772–844 px;
  - host, 5 graczy (także z czatem): zaczyna się na 883 px;
  - host, 20 graczy: zaczyna się na 1599 px.

  Gracz widzi pytanie, koło i tabelę, a kciuki dopiero po przewinięciu. Na laptopie stan zależy od roli i liczby graczy:
  - gość, 5 graczy: kciuki widać;
  - host, 5 graczy: dolne 4 px przycisków chowają się pod przyklejonym paskiem hosta (ta sama obserwacja jest w `context/archive/2026-11-15-reveal-ui/research.md:102` i nie była poprawiana);
  - host, 20 graczy: grupa zaczyna się na 1327 px przy oknie 750 px.

- **Duże 👍 i 👎 na ekranie to emotki, nie ocena.** Pasek emotek jest w każdym stanie pokoju (`context/domain/glossary.md:49`), na odsłonie przyklejony do dołu, z kolorowymi 👍 i 👎 w przyciskach 44 px (`src/lib/rooms/emotes.ts:10-11`, `src/components/room/EmoteBar.tsx:103`). Kciuki oceny to dwie konturowe ikony 36 px (`src/components/room/QuestionReaction.tsx:80-103`, `size="icon"` = `size-9`, `src/components/ui/button.tsx:30`). Emotka leci do całego pokoju i nic nie zapisuje (`context/domain/glossary.md:49`). Że gracze klikali emotkę, chcąc ocenić pytanie, to hipoteza (nikt tego nie zgłosił), ale obraz ekranu jej sprzyja.
- **Znaczenie kciuków słyszy tylko czytnik ekranu.** Widoczny jest podpis „Oceń pytanie” (`QuestionReaction.tsx:73`) w tym samym stylu `text-sm font-medium` co nagłówek „Wynik” (`src/components/room/RoundReveal.tsx:94`). Słowa „Dobre pytanie” i „Słabe pytanie” są tylko w `aria-label` (`QuestionReaction.tsx:85`).
- **Skan literałów: 0 trafień** na obu plikach widoku, więc zarzutu braku tokenów nie ma. Wariant kontraktu: **istniejący system projektowy** z S-25 (`src/styles/global.css`, `src/components/ui`, `src/components/room/surfaces.ts`). Rozszerzamy go, bez drugiej palety.
- **Zmiana zostaje w lżejszym cyklu.** Dotyka `src/components/room/` (QuestionReaction, RoundReveal, może HostActions lub pasek emotek), `src/lib/i18n/pl/round.ts`, podglądów `/dev/*` i może `tests/e2e/`. Nie dotyka bazy, `src/lib/rooms/` ani `src/pages/api/rooms/`. Test e2e szuka kciuków po nazwie „Dobre pytanie” i „Słabe pytanie” (`tests/e2e/support/round.ts:97-98`), więc te nazwy zostają.
- **Rekomendacja do galerii: W2, kciuki pod pytaniem**, jedną linią z widocznymi słowami. To jedyny sprawdzony układ, w którym kciuki stoją w pierwszym ekranie niezależnie od liczby graczy i roli. W październiku Karol wybrał miejsce pod wynikiem (wariant A, `context/archive/2026-10-26-question-reactions-play-data/plan.md:285-286`, `:436`), więc galeria pokazuje też W1, czyli to samo miejsce, ale wyraźniej.

## Charges

Zarzuty audytu `/10x-ui` (wstępny audyt 2026-11-24 w `change.md`, potwierdzony w tym badaniu). Każdy dostaje fazę w planie albo zostaje tu jako **deferred** z powodem.

| Id  | Kategoria                   | Plik:linia                                                                          | Co widzi gracz                                                                                                                                                                                                                                                                                                                |
| --- | --------------------------- | ----------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Z1  | przypadkowa architektura    | `RoundReveal.tsx:152`; `EmoteBar.tsx` (pasek przyklejony do dołu)                   | Kciuki stoją po całym wyniku, więc na telefonie we wszystkich 4 sprawdzonych stanach są pod krawędzią ekranu (u gościa z 5 graczami pod paskiem emotek), a na laptopie hosta wchodzą pod jego pasek. Gracz patrzy na wynik, rozmawia, prowadzący klika „Następne pytanie” i kciuków nikt nie widział.                         |
| Z2  | przypadkowa architektura    | `emotes.ts:10-11`, `EmoteBar.tsx:103`; `QuestionReaction.tsx:26-29`, `:80-103`      | Na ekranie są dwie pary kciuków: duże, kolorowe 👍 👎 w pasku emotek (zawsze w widoku) i małe konturowe kciuki oceny (zwykle poza widokiem). Gracz, który chce ocenić pytanie, trafia w emotkę: leci ona do całego pokoju, a ocena pytania się nie zapisuje.                                                                  |
| Z3  | brakujący wspólny komponent | `QuestionReaction.tsx:84` (`size="icon"`), `button.tsx:30` (`size-9`); `:73`, `:85` | Przyciski mają 36 px, czyli są mniejsze od emotek obok (44 px, `EmoteBar.tsx:103`). Mają samą ikonę bez słów, a podpis „Oceń pytanie” wygląda jak nagłówek „Wynik” (`RoundReveal.tsx:94`). Gracz widzi dwie kontury bez znaczenia, a „dobre” i „słabe” słyszy tylko czytnik ekranu. `button.tsx` nie ma rozmiaru ikony 44 px. |
| Z4  | brakujący wspólny komponent | `QuestionReaction.tsx:71-72`; `surfaces.ts` (`SURFACE`)                             | Wynik stoi w karcie (`TABLE_FRAME` w `surfaces.ts`), a kciuki gołe na tle, między tabelą a kreską paska hosta. Gracz odbiera je jak przypis pod tabelą, a nie jak coś do zrobienia.                                                                                                                                           |

Brakujących tokenów brak (skan 0 trafień na `QuestionReaction.tsx` i `RoundReveal.tsx`). Stan po dotknięciu nie jest zarzutem: zaznaczony kciuk wypełnia się kolorem Blurple (`variant="default"` i `fill-current`, `QuestionReaction.tsx:83`, `:101`), co widać. Patrz „Stany” niżej.

## Detailed Findings

### Gdzie dziś stoją kciuki (pytanie 1)

Pomiar `getBoundingClientRect` grupy z podpisem „Oceń pytanie” na `/dev/room-window` (serwer dev, Chrome z Playwright, `deviceScaleFactor: 2`; skrypt `scratchpad\s30\audit.mjs`, wynik `audyt\pomiar.json`). Liczby w pikselach CSS od góry okna, bez przewijania:

| Stan               | Telefon 390×844                             | Laptop 1536×750                                                          |
| ------------------ | ------------------------------------------- | ------------------------------------------------------------------------ |
| `reveal-guest` (5) | 819–883; pasek emotek 772–844; poza ekranem | 547–611; w widoku                                                        |
| `reveal-host` (5)  | 883–947; poza ekranem                       | 611–675; pasek hosta (`lg:sticky`) od 671, dolne 4 px przycisków pod nim |
| `reveal-host-20`   | 1599–1663; poza ekranem                     | 1327–1391; poza ekranem                                                  |
| `chat-reveal-host` | 883–947; poza ekranem                       | 611–675; jak `reveal-host`                                               |

- Kolejność w DOM: pytanie i licznik → sekcja „Wynik” (przełącznik, koło, tabela, „Wstrzymało się”) → `QuestionReaction` → `HostActions` z `placement="bar"` (`RoundReveal.tsx:82-171`). Od `lg` pasek hosta jest przyklejony do dołu okna, a poniżej `lg` stoi w treści (`RoundReveal.tsx:54-56`; e2e `tests/e2e/game.spec.ts:99-111`).
- Na telefonie dół ekranu zajmuje przyklejony pasek emotek (72 px) z pływającym przyciskiem „Czat” nad nim (pomiar: `fixed bottom-20`, 720–764 px), więc pierwszy ekran kończy się około 772 px.
- **3 i 8 graczy nie zmierzone.** `/dev/room-window` ma odsłony z 5 i 20 graczami (`src/pages/dev/room-window.astro:716`, `:740`, `:749`). Wiersz tabeli ma około 44 px (zrzut `reveal-guest-phone.png`), więc wniosek bez pomiaru: przy 3 graczach kciuki gościa stałyby około 88 px wyżej, w okolicy 731–795 px, czyli wciąż częściowo pod paskiem emotek. Przy 8 graczach stałyby niżej niż przy 5.

### Czy da się je zauważyć i zrozumieć (pytanie 2)

- Przyciski: `Button` z `variant="outline"` (niezaznaczony) albo `"default"` (zaznaczony), `size="icon"` (`QuestionReaction.tsx:80-93`). `size-9` to 36×36 px (`button.tsx:30`, pomiar: 36×36 we wszystkich 8 stanach). Ikony `ThumbsUp` i `ThumbsDown` z lucide (`:26-29`) są konturowe, w kolorze tekstu.
- Podpis: `<p className="text-sm font-medium">` „Oceń pytanie” (`QuestionReaction.tsx:73-75`, słownik `src/lib/i18n/pl/round.ts:82-87`). „Dobre pytanie” i „Słabe pytanie” są tylko w `aria-label` (`:85`), a e2e wybiera po tej nazwie (`tests/e2e/support/round.ts:97-98`).
- Obok, w pasku emotek, są 👍 i 👎 z systemowego zestawu emoji, w przyciskach `size-11 text-2xl` (`EmoteBar.tsx:103`). Na zrzucie `reveal-guest-phone.png` to najbardziej kolorowe kciuki na ekranie. Pasek ma podpis „Emotki” widoczny tylko od `lg` (`EmoteBar.tsx:90`, `sr-only lg:not-sr-only`).

### Stany: po dotknięciu, wysyłanie, błąd (pytanie 3)

- **Po dotknięciu**: odpowiedź ok → przycisk `variant="default"` (wypełnienie Blurple) z `border-primary` i ikoną `fill-current`; drugi wraca do `outline` (`QuestionReaction.tsx:56-68`, `:83`, `:90-93`, `:101`). Drugie dotknięcie tego samego cofa kciuk (`none`). Tekstu potwierdzenia nie ma. Nigdzie nie zapisano, że go nie będzie: zaznaczenie jest potwierdzeniem (`context/archive/2026-10-26-question-reactions-play-data/plan.md:284`, „ok → zaznaczenie”).
- **Wysyłanie**: dotknięty przycisk pokazuje `Spinner`, oba dostają `aria-disabled` z `opacity-50` i dalej przyjmują fokus (`:87`, `:91`, `:98-99`).
- **Błąd**: `FieldError` pod przyciskami z tekstem odmowy (`:108`); przycisk dostaje `aria-describedby` (`:88`).
- **Fokus**: kciuk nie jest w `VIEW_CHANGING`, więc po dotknięciu fokus zostaje na nim (`src/components/room/RoomScreen.tsx:156-159`). Ruch odsłony (`reveal-motion.ts`) i `focus.ts` kciuków nie dotyczą.
- **Pusty i ładowanie**: nie dotyczy, bo kciuki są tylko na odsłonie, która zawsze ma pytanie.

### Czym je podnieść bez nowej palety (pytanie 4)

- Karta: `SURFACE` (`bg-card rounded-xl shadow-card`) z `surfaces.ts`, jak tabela wyniku (`TABLE_FRAME`), albo `Card` z `src/components/ui/card.tsx`. `TILE` lub `TILE_ON_CARD` wchodzą w grę, jeśli kciuki mają być dwoma kafelkami-wyborami.
- Przyciski ze słowami: `Button` `size="lg"` (h-10, pigułka, `button.tsx:29`) albo `default` (h-9) z ikoną i tekstem, np. „Dobre” i „Słabe”. Widoczne słowo zawarte w nazwie dostępnej spełnia „label in name”, a `aria-label` „Dobre pytanie” może zostać, więc e2e się nie zmienia.
- Rozmiar 44 px: `button.tsx` nie ma rozmiaru `icon` 44 px. Emotki robią to klasą `size-11` przy `Button` (`EmoteBar.tsx:103`), więc w kodzie jest gotowy wzór. Nowy rozmiar albo wariant `Button` dostaje wiersz w `/dev/ui-kitchen-sink` (`AGENTS.md`, ## UI).
- Kolor: zaznaczenie już ma `bg-primary` / `text-primary-foreground` (para w `scripts/contrast.mjs`). Nowa para tekstu na powierzchni (np. słowa na `bg-card`) dostaje wiersz w `PAIRS`, jeśli jeszcze go nie ma.
- Ruch: jeśli kciuki mają „wejść” po odsłonie, to tylko `motion-safe:` z `tw-animate-css` w module jak `reveal-motion.ts`. Muszą być w DOM od pierwszej klatki, bez odliczania (`AGENTS.md`, ## UI).

### Co zmiana rusza (pytanie 5)

- **Komponenty**: `QuestionReaction` ma jedno użycie, w `RoundReveal.tsx:152`. Typy `Reaction` i `QuestionReactionPreview` używa też `RoomScreen.tsx:18`, `:60-61`, `:386`, `:533-535`.
- **Słownik**: `src/lib/i18n/pl/round.ts:82-87`. Angielskiego słownika jeszcze nie ma: `messages()` zwraca `pl` dla obu języków (`src/lib/i18n/index.ts:31-37`, „English dictionary comes in phase 4”). Nowe klucze same przechodzą przez pseudojęzyk, a `tests/unit/i18n.test.ts:190-194` pilnuje zgodności kluczy. `scripts/ui-text.mjs` nie przepuszcza polskich napisów w komponentach, więc nowe słowa idą przez słownik.
- **e2e**: kciuki szuka się po `getByRole("button", { name, exact: true })` w całej stronie (`tests/e2e/support/round.ts:97-98`), a `game.spec.ts:93-97` sprawdza `aria-pressed`. Pękłoby to przy zmianie nazwy, przy drugim przycisku o tej samej nazwie albo bez `aria-pressed`. `game.spec.ts:99-111` wymaga „Następne pytanie” w całości w oknie `lg` o wysokości 400 px, co trzeba sprawdzić, jeśli kciuki wejdą do paska hosta. `revealMotion` liczy animacje w regionie „Wynik” (`round.ts:79-85`), więc kciuki z animacją w tym regionie zmieniłyby liczby w `round.spec.ts`. Nazw „Kciuk w górę” i „Kciuk w dół” nie wolno brać, bo noszą je emotki (`emotes.spec.ts:23`, `:72`).
- **Podglądy**: `/dev/room-states` ma pięć stanów kciuków: `reaction-none`, `-up`, `-host-down`, `-sending` i `-error`, każdy z 5 graczami (`src/pages/dev/room-states.astro:2414-2482`). Kciuki widać też na około 20 innych odsłonach. `/dev/room-window` nie ma osobnego stanu kciuków, a wszystkie próbki `reveal-*`, `proposals-reveal*` i `chat-reveal-*` je pokazują. Zmiana okna, np. kciuki w przyklejonym pasku, wymaga stanu w `/dev/room-window` (`AGENTS.md`, ## UI).
- **Nieaktualne kotwice**: `context/changes/chat-composer/plan.md:27`, `:66`, `:484` i `src/components/room/chat-composer.ts:5` wskazują `QuestionReaction.tsx:83-92` jako wzór przełącznika włączony/wyłączony. Po zmianie trzeba poprawić komentarz w `chat-composer.ts`. Plan S-29 zostaje jako zapis historyczny.

### Sposoby do galerii (warianty)

Wszystkie zostawiają te same zasady: kciuk nieobowiązkowy, bez potwierdzenia od prowadzącego, widzi go tylko ten gracz, nazwy dostępne „Dobre pytanie” i „Słabe pytanie”, `aria-pressed`, zaznaczenie wypełnieniem Blurple.

- **W1, to samo miejsce, wyraźniej (A z S-11 podniesione).** Kciuki zostają pod wynikiem, ale w karcie `SURFACE`, z pytaniem w podpisie (np. „Jak ci się podoba to pytanie?”) i dwiema pigułkami ze słowem i ikoną („Dobre”, „Słabe”) o wysokości 44 px, na telefonie na całą szerokość. Naprawia Z2, Z3 i Z4, ale nie Z1: na telefonie dalej trzeba przewinąć. Najmniejsza zmiana, bez nowych pułapek układu.
- **W2, pod pytaniem (rekomendacja).** Jedna linia między licznikiem „Pytanie N z T” a sekcją „Wynik”: podpis po lewej, dwie pigułki ze słowami po prawej (na telefonie podpis nad nimi). Naprawia Z1, Z2 i Z3: kciuki są w pierwszym ekranie przy każdej liczbie graczy i roli, przy pytaniu, którego dotyczą. Koszt: wynik zjeżdża o około 50–70 px. Ryzyko z roadmapy (`roadmap.md:520`): kciuki nie mogą wyglądać na drugi głos ani odciągać od wyniku, dlatego muszą być małe i ciche (`outline`), bez karty. W październiku Karol wybrał zamiast tego miejsce pod wynikiem (B „pod pytaniem” był w tamtej galerii, `question-reactions-play-data/plan.md:285-286`). W grze z 2026-11-22 gracze ich tam nie zauważali (uwaga P).
- **W3, przyklejone do dołu na czas odsłony.** Na telefonie wąski pasek „Oceń pytanie: Dobre | Słabe” tuż nad paskiem emotek, a na laptopie kciuki w przyklejonym pasku hosta, u gościa w osobnym. Zawsze w widoku. Koszty:
  - na telefonie zabiera około 56 px z i tak ciasnego dołu (pasek emotek i przycisk „Czat”, tam był błąd F1 z `room-chat`);
  - stawia kciuki oceny tuż przy kciukach emotek (Z2 rośnie);
  - wymaga nowego stanu `/dev/room-window` i może ruszyć `game.spec.ts:99-111`.

  Najwięcej ryzyka układu.

**Rekomendacja: W2**, z W1 jako wariantem zapasowym. W galerii warto pokazać oba w tych samych czterech stanach (gość i host, 5 i 20 graczy) na telefonie 390×844 i laptopie 1536×750, a W2 też z zaznaczonym kciukiem.

## Code References

- `src/components/room/QuestionReaction.tsx:26-29` – ikony `ThumbsUp`/`ThumbsDown`
- `src/components/room/QuestionReaction.tsx:70-110` – grupa, podpis, przyciski `size="icon"`, `aria-label`, `aria-pressed`, spinner, błąd
- `src/components/room/RoundReveal.tsx:82-171` – kolejność odsłony; `:152` kciuki; `:94` nagłówek „Wynik”
- `src/components/ui/button.tsx:26-31` – rozmiary (`icon` = `size-9`, `lg` = h-10 pigułka)
- `src/components/room/EmoteBar.tsx:90`, `:103` – podpis „Emotki” (`sr-only` poniżej `lg`), przyciski `size-11 text-2xl`
- `src/lib/rooms/emotes.ts:8-15` – emotki, w tym 👍 i 👎
- `src/components/room/surfaces.ts` – `SURFACE`, `TILE`, `TILE_ON_CARD`, `TABLE_FRAME`
- `src/lib/i18n/pl/round.ts:82-87` – „Oceń pytanie”, „Dobre pytanie”, „Słabe pytanie”
- `tests/e2e/support/round.ts:79-85`, `:97-98` – `revealMotion`, `questionThumb`
- `tests/e2e/game.spec.ts:93-97`, `:99-111` – `aria-pressed`, pasek hosta w oknie 400 px
- `src/pages/dev/room-states.astro:2414-2482` – stany kciuków

## Architecture Insights

- Odsłona ma jasną kolejność: pytanie → wynik → ocena → ruch prowadzącego. Ocena jako krok po wyniku ma sens logiczny, ale na telefonie wynik zajmuje cały pierwszy ekran (we wszystkich 4 zmierzonych stanach), więc krok „ocena” wypada poza widok, a ruch prowadzącego (poza `lg`) jeszcze niżej.
- Pasek emotek jest w każdym stanie pokoju (`glossary.md:49`), na telefonie przyklejony do dołu. Na odsłonie jego 👍 i 👎 konkurują z oceną znaczeniem i wyglądem. To skutek dwóch zmian zrobionych osobno (S-11 kciuki, S-16 emotki), a nie decyzja.
- System z S-25 wystarcza: karta, pigułki, rozmiar 44 px z wzoru emotek, tokeny Blurple. Nowej palety ani komponentu z zewnątrz nie trzeba.

## Historical Context (from prior changes)

- `context/archive/2026-10-26-question-reactions-play-data/change.md:12` – kciuk „nieobowiązkowo, bez blokowania prowadzącego” (dalej obowiązuje).
- `context/archive/2026-10-26-question-reactions-play-data/plan.md:280-287` – dwa przyciski z ikonami, tylko tokeny i `Button`; warianty A (pod wynikiem), B (pod pytaniem), C (przy pytaniu w jednej linii). `:436` – Karol wybrał wariant na zrzutach (A, sama ikona; commit `55e96f8`). Wybór obowiązywał do gry 2026-11-22, która pokazała, że kciuków nie widać.
- `context/archive/2026-10-26-question-reactions-play-data/research.md:87-88` – „u gościa to koniec ekranu, u hosta tuż nad przyklejonym paskiem”. Częściowo nieaktualne: od `lg` u hosta pasek zasłania 4 px przycisków (pomiar wyżej).
- `context/archive/2026-11-15-reveal-ui/research.md:102` – na laptopie hosta kciuki „chowają się pod paskiem przycisków, dopóki nie przewiniesz”; `reveal-ui` poprawił pole linku, a kciuków nie ruszał. Dalej aktualne.
- `context/foundation/roadmap.md:520` (S-30, Risk) – kciuki nie mogą odciągać od wyniku ani wyglądać na obowiązkowe czy na drugi głos.

## Related Research

- `context/changes/chat-composer/research.md` – ten sam wzór audytu `/10x-ui` (S-29) i stan włączony/wyłączony przycisku.
- `context/archive/2026-10-26-question-reactions-play-data/research.md` – skąd kciuki i co z nimi robi baza.

## Open Questions

1. **Który wariant: W1, W2 czy W3?** Owner: Karol, galeria zrzutów. Rekomendacja sesji: W2.
2. **Jakie słowa przy kciukach?** Kandydaci: „Dobre” i „Słabe” przy przyciskach, podpis „Oceń pytanie” albo „Jak ci się podoba to pytanie?”. Owner: Karol, przy galerii. Nazwy dostępne „Dobre pytanie” i „Słabe pytanie” zostają dla e2e.
3. **Czy po dotknięciu pokazać krótkie „Dzięki”?** Dziś potwierdzeniem jest samo zaznaczenie. Tekst przybliża ocenę do „zrobione”, ale dodaje ruch na ekranie. Owner: Karol. Domyślnie nie.
