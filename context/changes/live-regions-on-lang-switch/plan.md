# Czytnik ekranu nie czyta drugi raz komunikatów po przełączeniu języka: plan implementacji

## Overview

W pokoju i na ekranie czekania język zmienia się bez przeładowania (`src/lib/i18n/live-lang.ts`). Ukryty region czytnika ekranu (`aria-live`, `role="status"`), który składa swoje zdanie przy każdym rysowaniu, dostaje wtedy to samo zdanie w nowym języku. Czytnik słyszy zmianę tekstu i czyta je jako nowość. Najdłużej trwa to przy linku: „Link dla graczy się zmienił” stoi, dopóki host nie skopiuje nowego linku, więc przełączenie nawet po kilku minutach czyta go drugi raz.

Poprawka to jedna wspólna funkcja `useSpoken`. Po przełączeniu języka wycisza ukryty region, aż jego zdanie zmieni się z innego powodu, czyli przy następnym zdarzeniu. Funkcja trafia w 7 miejsc. Wygląd ekranu się nie zmienia.

Decyzje Karola (27.11.2026):

- robimy, póki czekamy na wieczór („działamy dalej”);
- złożoność niska, zakres: 7 ukrytych regionów (link, koniec pytań, brak połączenia, emotki, „Usunąć X?”, liczba gifów, czat na zapas); widoczne komunikaty poza zakresem;
- fazy: 1. kod i testy, 2. wdrożenie.

Lżejszy cykl: same ekrany, bez migracji, bez `src/lib/rooms/` i `src/pages/api/rooms/`, bez `/10x-plan-review`. Dochodzi nowy test, więc jest próbny alarm.

## Current State Analysis

- Język bez przeładowania działa tylko w pokoju (`RoomScreen`) i na ekranie czekania (`JoinWaiting`). Każda inna strona przeładowuje się przy przełączeniu (`src/components/room/LanguageSwitch.tsx:79-80`, `src/lib/i18n/live-lang.ts:4-9`), więc jej regiony startują od nowa i problemu nie mają (np. `HostGames` na liście gier).
- Wzór już jest. `useTextState` (`src/lib/i18n/react.tsx:42-56`) trzyma tekst złożony w chwili zdarzenia i przy zmianie języka go zdejmuje. Region w `RoomScreen` składa zdanie o roli współhosta raz, przy zmianie roli (`RoomScreen.tsx:274-288`; poprawka F3 z `context/changes/english-version/reviews/impl-review.md`). Cztery regiony z F3 (`QuestionList`, `ProposalForm`, `JoinRequests`, `QuestionProposals`) i trzy regiony `RoomScreen` (`RoomScreen.tsx:558-566`) już tak działają.
- Ukryte regiony, które składają zdanie przy rysowaniu, w drzewie pokoju:
  - `PlayerLink.tsx:104-106`: `copied ? copiedAnnounce : changed ? changed : ""`, gdzie „skopiowany” trwa 2 s, a „zmienił się” trwa do skopiowania;
  - `HostActions.tsx:246-248`: `asking?.confirmText ?? (ranOut ? ranOutText : "")`, gdzie „skończyły się pytania” stoi do następnego ruchu, a pytanie potwierdzenia trwa, dopóki host decyduje;
  - `LiveBanner.tsx:19-21` (`role="status"`): `broken ? text : ""`, przez cały czas zerwanego połączenia;
  - `EmoteBubbles.tsx:50-52`: `t.round.emotes.spoken(nick, t.emotes[emote])`, gdzie nazwa emotki pochodzi ze słownika, a bańka trwa `EMOTE_SHOW_MS` = 3 s (`src/lib/rooms/emotes.ts:30`);
  - `RemovePlayerButton.tsx:157-159`: `confirming && !busy ? texts.confirm(nick) : ""`;
  - `GifPicker.tsx:94` (`SearchStatus`, komponent): ukryta linijka `t.chat.gifs.found(n)` w `role="status"`, dopóki wyszukiwarka jest otwarta;
  - `RoomChat.tsx:513-515`: `spokenMessage(announced, t)`. Dziś bez objawu: `t.chat.spoken` i `t.chat.gifWords` brzmią w obu słownikach tak samo (`src/lib/i18n/pl/chat.ts:27-28`, `src/lib/i18n/en/chat.ts:19-20`), więc React nie zmienia tekstu i czytnik milczy. Wchodzi na zapas: zepsułby się przy pierwszej różnicy w słownikach.
- Widoczne komunikaty z `aria-live` albo `role="alert"` też zmieniają tekst przy przełączeniu: „Nie udało się odświeżyć” (`JoinWaiting.tsx:253`, `RoomLobby.tsx:208`, `RoundReveal.tsx:152`, `RoundSkipped.tsx:43`, `RoundVoting.tsx:251`), `linkFailed` (`RoomLobby.tsx:157`), `ServerError` z `roomErrorMessage(error, t)` (`HostActions.tsx:249`), widoczne linijki `SearchStatus`. Ich tekst na ekranie musi się przetłumaczyć, więc wyciszenie tu nie pasuje. Poza zakresem (decyzja Karola).
- Testy: `vitest` bez DOM, komponenty renderowane tylko statycznie (`renderToStaticMarkup`, `tests/unit/screen-lang.test.ts:392`), więc przejścia stanu hooka sprawdza test czystej funkcji. W e2e jest gotowy podsłuch regionów `watchLiveRegions` (`tests/e2e/support/live.ts:301-319`): zbiera każdy niepusty tekst regionów `[aria-live]` od chwili założenia. Przełącznik języka jako lokator jest dziś funkcją lokalną `languageSwitch` w `tests/e2e/english.spec.ts:33-35`. Test „współhost usuwa gracza, host widzi nowy link” (`tests/e2e/remove-player.spec.ts:107-171`) zostawia na ekranie hosta trwałe „Link dla graczy się zmienił”. To deterministyczne miejsce na krok e2e, bez wyścigu z czasem.

## Desired End State

- Po przełączeniu języka w pokoju żaden z 7 ukrytych regionów nie dostaje zdania w nowym języku. Region jest pusty, aż przyjdzie nowe zdarzenie (nowa wiadomość, emotka, zmiana linku, kolejne pytanie potwierdzenia, nowe wyniki gifów, zerwanie połączenia). Wtedy mówi już w nowym języku.
- Widoczne teksty (szara linijka pod linkiem, przyciski, baner połączenia) przechodzą na nowy język jak dziś.
- Bez przełączenia regiony mówią dokładnie to, co dziś.
- `AGENTS.md` mówi następnemu agentowi, że ukryty region składany przy rysowaniu idzie przez `useSpoken`.

Sprawdzenie: test jednostkowy przejść `useSpoken`, krok e2e w `remove-player.spec.ts` (host przełącza język po usunięciu gracza: szara linijka po angielsku, a podsłuch regionów nie słyszy angielskiego zdania), próbny alarm w CI.

### Key Discoveries:

- `useTextState` zdejmuje tekst przy zmianie języka „adjusting state while rendering” (`src/lib/i18n/react.tsx:47-51`). `useSpoken` idzie tym samym wzorcem, ale dla tekstu wyliczonego, nie trzymanego.
- Przy zmianie języka nowe zdanie przychodzi w tym samym rysowaniu co nowy `lang`, więc hook musi zwrócić `""` już w tym rysowaniu, nie dopiero w następnym. Inaczej region na chwilę dostanie angielskie zdanie i czytnik je przeczyta.
- To samo zdanie przed i po zdarzeniu (np. drugi „zmienił się” bez kopiowania) dziś też nie jest czytane drugi raz, bo React nie zmienia tekstu. `useSpoken` tego nie zmienia.

## What We're NOT Doing

- Widoczne komunikaty z `aria-live` lub `role="alert"` („Nie udało się odświeżyć” ×5, `linkFailed`, `ServerError` w `HostActions`, widoczne linijki wyszukiwarki gifów). Wymagałyby rozdzielenia tekstu dla oka i dla czytnika (decyzja Karola: poza zakresem).
- Regiony już na `useTextState` (F3, `RoomScreen`) zostają bez zmian.
- Strony z przeładowaniem przy przełączeniu (lista gier, logowanie, `/j/`) zostają bez zmian.
- Nowe teksty, słowniki, podglądy `/dev/*`, wygląd: nic się nie zmienia, więc bez galerii i zrzutów.
- Przypadek, gdy język i prawdziwe zdarzenie trafią w to samo rysowanie. Takie zdarzenie zostanie wyciszone (jak w `useTextState`), co przyjmujemy jako znaną granicę.

## Implementation Approach

Jedna czysta funkcja przejścia i cienki hook nad nią w `src/lib/i18n/react.tsx`, obok `useTextState`. Każde z 7 miejsc liczy swoje zdanie jak dziś i przepuszcza je przez `useSpoken` przed wstawieniem do regionu. Hook wywoływany na górze komponentu, nigdy warunkowo. Test jednostkowy na czystej funkcji, jeden krok e2e na prawdziwej przeglądarce, reguła w `AGENTS.md`.

## Faza 1: Kod i testy

### Overview

`useSpoken` w słowniku Reacta, 7 regionów przez niego, test jednostkowy, krok e2e, reguła w `AGENTS.md`, bramka, próbny alarm w CI.

### Changes Required:

#### 1. Hook `useSpoken`

**File**: `src/lib/i18n/react.tsx`

**Intent**: Dać ukrytemu regionowi czytnika tekst, który milknie po przełączeniu języka i wraca przy następnej zmianie zdania. Komentarz w stylu `useTextState` mówi, po co jest i kiedy go używać zamiast `useTextState` (tekst wyliczany przy rysowaniu, nie trzymany po zdarzeniu).

**Contract**:

- `export function useSpoken(text: string): string`: zwraca `text` albo `""`.
- Czysta funkcja przejścia, eksportowana do testu, np. `nextSpoken(prev, lang, text)` na stanie `{ lang, text, quiet }`:
  - inny `lang` niż w stanie: `{ lang, text, quiet: true }`;
  - ten sam `lang`, inny `text`: `{ lang, text, quiet: false }`;
  - poza tym stan bez zmian (ta sama referencja, żeby hook nie ustawiał stanu w kółko).
- Hook liczy przejście przy rysowaniu, ustawia stan tylko przy zmianie i zwraca wynik z wyliczonego, nowego stanu (`quiet ? "" : text`), więc `""` jest już w rysowaniu, w którym zmienił się język. Pierwsze rysowanie: `quiet: false`, więc region startuje z tekstem jak dziś (np. najnowsza wiadomość czatu, podglądy).

#### 2. Siedem regionów

**Files**: `src/components/room/PlayerLink.tsx`, `src/components/room/HostActions.tsx`, `src/components/room/LiveBanner.tsx`, `src/components/room/EmoteBubbles.tsx`, `src/components/room/RemovePlayerButton.tsx`, `src/components/room/GifPicker.tsx` (`SearchStatus`), `src/components/room/RoomChat.tsx`

**Intent**: W każdym miejscu dzisiejsze wyrażenie z regionu idzie przez `useSpoken`, a region pokazuje wynik. Przy `GifPicker` tylko ukryta linijka „znaleziono N” (widoczne linijki tego samego `role="status"` zostają). Przy `LiveBanner` i `PlayerLink` widoczna kopia tekstu (Alert, szara linijka) zostaje bez hooka. Krótki komentarz przy regionie tam, gdzie dziś stoi komentarz o regionie.

**Contract**: Wyrażenie z dzisiejszego regionu bez zmian, tylko owinięte. `useSpoken` wywołany bezwarunkowo na górze komponentu (reguły hooków). Żadnych nowych tekstów w słownikach.

#### 3. Test jednostkowy

**File**: `tests/unit/screen-lang.test.ts` (nowy blok `describe`; plik testuje już zachowanie ekranu przy zmianie języka)

**Intent**: Sprawdzić przejścia czystej funkcji jako ciąg rysowań: tekst bez zmiany języka jest słyszany; zmiana języka wycisza nowe zdanie; po wyciszeniu nowe zdanie (także przez `""`) jest słyszane; to samo zdanie po wyciszeniu dalej milczy; stan bez zmian to ta sama referencja.

**Contract**: Przed napisaniem przeczytać `context/foundation/test-plan.md` §6.1. Oczekiwane wartości wypisane ręcznie, bez liczenia ich funkcją pod testem.

#### 4. Krok e2e

**Files**: `tests/e2e/remove-player.spec.ts`, `tests/e2e/english.spec.ts`, `tests/e2e/support/room.ts` (albo inny wspólny moduł `support/`)

**Intent**: W teście „współhost usuwa gracza, host widzi nowy link”, po asercjach nowego linku na ekranie hosta: zakładamy podsłuch `watchLiveRegions` na stronie hosta, host przełącza ekran na angielski. Asercje: szara linijka „The link for players has changed…” widoczna, a podsłuch nie słyszał zdania „The link for players has changed…”. Polskie zdanie, które stało w regionie przed przełączeniem, jest w zbiorze od założenia i nie przeszkadza. Lokator przełącznika `languageSwitch` przenosimy z `english.spec.ts` do `support/`, żeby oba pliki brały ten sam.

**Contract**: Przed zmianą przeczytać `context/foundation/test-plan.md` §6.4. Krok stoi po ostatniej asercji na stronie hosta (dalsze kroki dotyczą innych stron), więc host nie musi wracać do polskiego. Bez czekania na czas (stan „zmienił się” trwa do skopiowania).

#### 5. Reguła w `AGENTS.md`

**File**: `AGENTS.md` (sekcja „## UI”, punkt o przełączniku języka)

**Intent**: Dopisać do zdania o `useTextState`, że ukryty region czytnika, którego zdanie komponent składa przy rysowaniu, idzie przez `useSpoken`, więc przełączenie nie czyta go drugi raz.

**Contract**: Jedno zdanie w istniejącym punkcie, bez nowego punktu.

### Success Criteria:

#### Automated Verification:

- Bramka zielona lokalnie: `npm run lint`, `npx astro check`, `npm test`, `npm run build`
- Próbny alarm w CI trafia dokładnie: `useSpoken` zwracający zawsze `text` czerwieni tylko nowy test jednostkowy i nowy krok e2e; po revercie CI zielone, wpis w `test-plan.md` §6.4

#### Manual Verification:

- Podgląd `/dev/room-states` (lobby hosta z „link się zmienił”, czat, wyszukiwarka gifów) wygląda jak przed zmianą, także z `?lang=en`

**Implementation Note**: Po zielonej bramce i alarmie zatrzymaj się na moje „ok” przy podglądzie, potem Faza 2.

---

## Faza 2: Wdrożenie

### Overview

PR, zielone CI, scalenie przez Karola, smoke na produkcji. Ręczne sprawdzenie z czytnikiem czeka na grę.

### Changes Required:

#### 1. PR i epilog

**File**: `context/changes/live-regions-on-lang-switch/plan.md`, `context/changes/live-regions-on-lang-switch/change.md`

**Intent**: Push gałęzi za zgodą Karola, `gh pr create`, Progress z SHA. Po scaleniu `change.md` → `implemented`, gdy Karol sprawdzi czytnikiem (przy grze).

**Contract**: Push tylko za zgodą, scala tylko Karol (`! gh pr merge <n> --merge`). Smoke na produkcji za zgodą, jeden przebieg.

### Success Criteria:

#### Automated Verification:

- CI zielone na PR: `ci`, `smoke`, `db`, `e2e`
- Workers Builds i CI na `main` zielone po scaleniu

#### Manual Verification:

- Smoke na produkcji zielony (za zgodą, jeden przebieg)
- Przy grze, na telefonie z czytnikiem: po usunięciu gracza host przełącza język, a czytnik nie czyta drugi raz „link się zmienił”; nowa wiadomość czatu po przełączeniu jest czytana

---

## Testing Strategy

### Unit Tests:

- Przejścia `nextSpoken`: bez zmiany języka, zmiana języka, nowe zdanie po wyciszeniu, przejście przez `""`, to samo zdanie po wyciszeniu, stała referencja.

### Integration Tests:

- E2e: host po usunięciu gracza przełącza język; szara linijka po angielsku, region czytnika bez angielskiego zdania (`watchLiveRegions`).

### Manual Testing Steps:

1. `/dev/room-states` i `?lang=en`: stany z linkiem, czatem i gifami bez zmian w wyglądzie.
2. Przy grze, czytnik na telefonie: usunięcie gracza → przełączenie języka → cisza; potem nowa wiadomość czatu → czytana w nowym języku.

## Performance Considerations

Jeden `useState` i porównanie dwóch napisów na rysowanie w 7 komponentach: bez znaczenia.

## Migration Notes

Brak: bez bazy, bez serwera gry, bez nowych tekstów.

## References

- Wzór: `src/lib/i18n/react.tsx:42-56` (`useTextState`), `src/components/room/RoomScreen.tsx:274-288` (rola współhosta)
- Źródło obserwacji: `context/changes/english-version/reviews/impl-review.md` (F3), sekcja „Stan” w sesji z 27.11.2026
- Podsłuch regionów: `tests/e2e/support/live.ts:301-319`
- Test na krok e2e: `tests/e2e/remove-player.spec.ts:107-171`

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: Kod i testy

#### Automated

- [x] 1.1 Bramka zielona lokalnie: `npm run lint`, `npx astro check`, `npm test`, `npm run build` — 8e53a0a
- [x] 1.2 Próbny alarm w CI trafia dokładnie: `useSpoken` zwracający zawsze `text` czerwieni tylko nowy test jednostkowy i nowy krok e2e; po revercie CI zielone, wpis w `test-plan.md` §6.4 — 17ec2a6

#### Manual

- [x] 1.3 Podgląd `/dev/room-states` (lobby hosta z „link się zmienił”, czat, wyszukiwarka gifów) wygląda jak przed zmianą, także z `?lang=en` — 8e53a0a

### Phase 2: Wdrożenie

#### Automated

- [ ] 2.1 CI zielone na PR: `ci`, `smoke`, `db`, `e2e`
- [ ] 2.2 Workers Builds i CI na `main` zielone po scaleniu

#### Manual

- [ ] 2.3 Smoke na produkcji zielony (za zgodą, jeden przebieg)
- [ ] 2.4 Przy grze, na telefonie z czytnikiem: po usunięciu gracza host przełącza język, a czytnik nie czyta drugi raz „link się zmienił”; nowa wiadomość czatu po przełączeniu jest czytana
