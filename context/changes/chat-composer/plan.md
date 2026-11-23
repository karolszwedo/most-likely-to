# Czat: szukanie gifa zamiast pisania i emoji w wiadomości (S-29): plan implementacji

## Overview

Po pierwszej grze ze znajomymi (2026-11-22) znajoma wysłała na czat słowo, które chciała wpisać w wyszukiwarkę gifów. Pole szukania i pole wiadomości stały naraz i wyglądały tak samo (uwaga M). Karol chce też przycisku z siatką emoji obok „GIF” (uwaga N, roadmapa S-29).

Zmiana robi trzy rzeczy:

- **R1.** Szukanie gifa zajmuje miejsce wiersza pisania, więc na ekranie stoi naraz tylko jedno pole tekstowe. „GIF” wygląda na włączony, gdy szukanie jest otwarte.
- **E1 + K1.** Przycisk 😊 obok „GIF” otwiera siatkę 33 emoji nad polem wiadomości. Dotknięcie emoji wstawia je w miejscu kursora.
- **Z5.** Pasek emotek na telefonie dostaje 3 brakujące piksele, żeby panel czatu stał na nim bez szczeliny.

Decyzje Karola (2026-11-23):

- decyzje 1–4 z galerii są w `research.md`, w „Open Questions”;
- w tej rozmowie zapadły jeszcze dwie:
  - siatka zamyka się przy dotknięciu albo kliknięciu pola wiadomości, na każdym urządzeniu;
  - napisy robocze zostają: „Szukaj gifa”, „Wróć do pisania” poniżej `xl`, „Wróć do czatu” od `xl`, przycisk 😊 dla czytnika „Emoji”.

Lżejszy cykl: same ekrany czatu, bez migracji, bez serwera gry i bez `/10x-plan-review`. Jedyne dotknięcie `src/lib/rooms/` to poprawka komentarza (Faza 2, #6), bez zmiany działania. Zmiana w `tests/` i tak idzie tylko przez PR z zielonym CI.

## Current State Analysis

- **Szukanie (R1).** Pole szukania (`src/components/room/GifPicker.tsx:166-179`) i pole wiadomości (`src/components/room/RoomChat.tsx:481-496`) to ten sam kod: `InputGroup bg-background h-11`, a obok każdego przycisk `secondary`.
  - Wyszukiwarka stoi między listą a wierszem pisania (`RoomChat.tsx:439-454`). Poniżej `xl` to pasek nad polem wiadomości (W2). Od `xl` stoi w miejscu listy (W1, `listBehindSearch`), ale pole wiadomości zostaje pod nią.
  - Wiersz szukania to pole, „Szukaj” i X „Zamknij wyszukiwarkę” (`GifPicker.tsx:154-193`). Od `xl` pod wynikami jest jeszcze „Wróć do czatu” (`GifPicker.tsx:212-217`).
- **Przycisk „GIF”** (`RoomChat.tsx:467-479`) ma `variant="outline"` zawsze. Stan widzi tylko czytnik (`aria-expanded`). `button.tsx` nie ma wyglądu „włączony”. Wzór w grze: wywołujący podmienia wariant (`QuestionReaction.tsx:83-92`, `default`/`outline` z `aria-pressed`).
- **Fokus.** `focusNext` z celami `field | pill | gif-field | gif-button` (`RoomChat.tsx:251`, efekt `:285-296`) przenosi fokus po każdym renderze:
  - „GIF” otwiera szukanie z fokusem w polu szukania (`:313-320`);
  - X i „Wróć do czatu” oddają fokus na „GIF” (`:323-326`);
  - wybrany gif przenosi go do pola wiadomości (`:362-368`).
- **Panel poniżej `lg`** to `fixed bottom-18 max-h-1/2`. Z otwartym szukaniem dostaje `h-1/2` (`sectionWhileSearching`, `RoomChat.tsx:94-106`), żeby lista oddawała miejsce pierwsza.
- **Pasek emotek** ma 69 px (`EmoteBar.tsx:25-33`: przycisk 44 + `py-3` + `border-t`), a panel stoi na `bottom-18` (72 px). Stąd 3 px szczeliny (Z5, zmierzone w researchu).
- **Napisy** czatu są w `src/lib/i18n/pl/chat.ts:5-57`. `gifs.close` używa tylko X (`GifPicker.tsx:187`). Polskie litery poza słownikiem są błędem `scripts/ui-text.mjs`, a surowe emoji w `.ts` są dozwolone (wzór `src/lib/rooms/emotes.ts:8-15`).
- **Licznik** liczy punkty kodowe (`src/lib/rooms/chat-text.ts:17-21`). Każde z 33 emoji Karola to jeden punkt kodowy (sprawdzone z `emoji-test.txt`, `research.md`, decyzja 3). Zdanie „emoji to jeden znak” w `context/domain/glossary.md:51` i `src/lib/rooms/chat.ts:16` jest prawdą tylko dla takich emoji.
- **E2e:** jeden duży test `tests/e2e/chat.spec.ts:264-566` w projektach `chromium` (1280×720, czyli `xl`) i `phone` (390×844, bez dotyku). Lokatory: `:100-125`, pomocnicze `:131-198`. Krok „with the search still open, A writes” (`:517-520`) pisze w polu, którego po R1 nie ma. Budżet gier w przebiegu jest wyczerpany (`test-plan.md:406`), więc nowe kroki idą do istniejącego testu.

## Desired End State

- **Szukanie.** Po „GIF” wiersz pisania (pole wiadomości, 😊, „Wyślij wiadomość”) znika z ekranu i z drzewa dostępności. Na dole, na każdej szerokości, stoi wiersz szukania:
  - włączony „GIF” (wypełniony Blurple);
  - pole z lupą z przodu i placeholderem „Search KLIPY”;
  - „Szukaj”.
- **Nad wynikami** stoi wiersz z napisem „Szukaj gifa” po lewej i przyciskiem powrotu po prawej: „Wróć do pisania” poniżej `xl`, „Wróć do czatu” od `xl`. Nie ma X ani dolnego „Wróć do czatu”. Od `xl` wyniki (3 kolumny) stoją w miejscu listy.
- **Wyjście z szukania:**
  - „GIF” zamyka szukanie z fokusem na „GIF”;
  - „Wróć…” zamyka je z fokusem w polu wiadomości;
  - wybrany gif idzie na czat jak dziś, z fokusem w polu wiadomości;
  - szkic wiadomości przeżywa szukanie.
- **Siatka emoji.** Obok „GIF” (albo sam, gdy strona nie ma klucza KLIPY) stoi przycisk z ikoną uśmiechu „Emoji”, włączony, gdy siatka jest otwarta. Siatka to grupa „Emoji”: 33 przyciski w kolejności Karola, 7 kolumn, nad polem wiadomości, w miejscu wyników gifów. Pole wiadomości zostaje widoczne.
- **Zachowanie siatki:**
  - otwarcie przenosi fokus na pierwsze emoji (na telefonie chowa się klawiatura, K1);
  - emoji wstawia się w miejscu kursora pola, a kolejne stają za poprzednim;
  - siatkę zamykają: drugie dotknięcie 😊, Esc (fokus na 😊), dotknięcie pola wiadomości (decyzja z tej rozmowy) i zwinięcie czatu;
  - „GIF” zamyka siatkę i otwiera szukanie, bo naraz otwarte jest tylko jedno z nich.
- **Pasek emotek** poniżej `lg` ma co najmniej 72 px (`min-h-18`), więc panel czatu siada na nim bez szczeliny.
- **Wokół:**
  - podglądy `/dev/room-states` i `/dev/room-window` pokazują nowe stany;
  - `/dev/ui-kitchen-sink` ma wiersze przełącznika i komórki emoji;
  - słownik domeny ma hasło „emoji”;
  - e2e pilnuje R1 (próbny alarm trafił) i siatki;
  - `AGENTS.md` ma regułę „jedno pole naraz”.

### Key Discoveries:

- Przełączanie „włączony” podmianą wariantu (`default`/`outline`) to wzór gry (`QuestionReaction.tsx:83-92`). Kontrast tej pary już jest w `scripts/contrast.mjs:34-35`, a `text-primary-text` na `background` i `card` w `:41-42`. Nowych par kontrastu nie trzeba, o ile tekst nie stanie na nowej powierzchni.
- Wygląd zależy od szerokości tylko przez klasy (`xl:`), a kontrolka innej szerokości ma `display: none` (`GifPicker.tsx:31-42`). Dwa przyciski powrotu trzymają się tego wzoru.
- Lokatory e2e nie mogą się zepsuć:
  - „GIF: wyszukaj gifa” musi być dokładnie jeden widoczny (`chat.spec.ts:110-112`, kliknięcia `:170`, `:196`);
  - pole „Szukaj gifa” zostaje `textbox`, bez `type="search"`, i stoi wewnątrz regionu „Wyszukiwarka gifów” (`:115-121`), tak samo jak `status` (`:510`);
  - nic nowego nie może mieć nazwy zaczynającej się od „Czat” (`:131`);
  - siatka nie może być grupą z „emotki” w nazwie, bo lokator `emotes.spec.ts:22-24` jest bez `exact`.
- `emotes.spec.ts:72-76` liczy dokładnie 6 przycisków w grupie „Emotki”, więc siatka stoi poza nią.

## What We're NOT Doing

- Bez zmian w serwerze gry, trasie `/chat`, zasadach tekstu (`chat-text.ts`), bazie i smoke (smoke nie ma lokatorów DOM).
- Bez nazw emoji w słowniku. Czytnik czyta znak w języku systemu (`research.md`, „Nazwy dla czytnika”).
- Bez wyszukiwarki emoji, grup w siatce, ostatnio używanych, odcieni skóry i emoji złożonych.
- Bez wstawiania emotek z paska emotek do tekstu. Emotka zostaje reakcją (`glossary.md:49`).
- Bez strzałek w siatce (roving tabindex). Każde emoji jest osobnym przystankiem Tab, a Esc wychodzi z siatki.
- Wstawianie emoji nie blokuje się przy limicie 200 znaków. Licznik i sprawdzenie przy „Wyślij” działają jak dziś.
- Bez zmian zachowania KLIPY:
  - wyszukiwarka pusta na start (decyzja 4 `room-chat-gifs`);
  - „Search KLIPY” po angielsku;
  - kolejność i skład wyników bez zmian.
- Bez angielskich napisów. Nowe klucze dostają tylko polski, a angielski dopisze Faza 4 S-27.
- Bez wniosku o produkcyjny klucz KLIPY (`room-chat-gifs` 4.7). Nagranie do niego można zrobić już z nowym wyglądem, ale to osobna sprawa.
- Bez wpisu w roadmapie poza statusem S-29.

## Implementation Approach

Najpierw kontrakt, potem piksele:

- Wygląd „włączony” i lista 33 emoji trafiają do jednego modułu `src/components/room/chat-composer.ts`, z którego korzystają ekran, podglądy i macierz kontrolek.
- Faza 1 przebudowuje szukanie (R1). Wyrocznia z gry („na ekranie jedno pole naraz”) dostaje krok e2e i próbny alarm w CI.
- Faza 2 dokłada siatkę emoji w tym samym miejscu panelu co wyniki gifów i zakleja szczelinę.
- Faza 3 zostawia regułę w `AGENTS.md`, wpis w test-planie i prowadzi zmianę na produkcję.

Każda faza z ekranem kończy się zrzutami przed i po dla Karola (telefon 390 px w prawdziwej wielkości, laptop 1:1, całe okno). Zrzuty robi headless Chrome z `/dev/room-window`. Strona „Co oceniasz” otwiera się w Chrome Karola.

## Critical Implementation Details

- **„GIF” przechodzi między wierszami.** Jest jednym przyciskiem. Przy zamkniętym szukaniu stoi w wierszu pisania, przy otwartym w wierszu szukania wewnątrz regionu, bo `GifPicker` dostaje go jako element na początek swojego wiersza. Zmiana miejsca montuje go od nowa, więc zamknięcie szukania przez „GIF” musi ustawić `focusNext = "gif-button"` (dziś `toggleSearch` przy zamykaniu tego nie robi, bo przycisk zostawał). Dwa „GIF” w drzewie naraz to błąd trybu ścisłego w e2e.
- **Kursor przy wstawianiu emoji.**
  - Gdy siatka jest otwarta, pole wiadomości nie może dostać fokusu ani `setSelectionRange`, bo na telefonie wróciłaby klawiatura (K1, a Safari na iOS potrafi zrobić to samo przy zaznaczaniu).
  - Pozycję kursora trzymamy w refie, aktualizowanym z `onSelect` i `onChange` pola (`selectionStart`, `selectionEnd`).
  - Wstawienie zastępuje zaznaczenie i przesuwa ref za wstawione emoji. Pozycje liczymy w jednostkach UTF-16 (`emoji.length`, 2 dla 😂), nie przez `chatTextLength`.
  - Bez zapisanej pozycji (pole nigdy nie miało fokusu, wiadomość właśnie wyszła) emoji idzie na koniec tekstu.
- **Zamknięcie przy polu.** Siatkę zamyka `onFocus` pola. Każde ustawienie fokusu w polu też ją zamyka (np. błąd sprawdzenia przy „Wyślij” albo wybrany gif), co jest zgodne z decyzją.

## Faza 1: Szukanie gifa zamiast pisania (R1)

### Overview

Wiersz szukania zastępuje wiersz pisania, a „GIF” dostaje wygląd „włączony”. Wyszukiwarka ma widoczny napis, lupę i jeden przycisk powrotu. E2e pilnuje, że pole wiadomości znika na czas szukania, a próbny alarm w CI to potwierdza.

### Changes Required:

#### 1. Kontrakt przełącznika

**File**: nowy `src/components/room/chat-composer.ts`

**Intent**: Jedno źródło wyglądu przycisków, które otwierają panel czatu (dziś „GIF”, w Fazie 2 też 😊). Zamknięty ma wygląd `outline`, otwarty `default` (wypełniony `primary` z `primary-foreground`), rozmiar `size-11`. Komentarz mówi, skąd decyzja (uwaga M, R1, Z2 z `research.md`).

**Contract**: czysty moduł bez Reacta i bez `astro:*`, żeby macierz kontrolek mogła go użyć w `.astro`:

- `composerToggleVariant(open: boolean): "default" | "outline"`;
- stała klas rozmiaru przełącznika.

Stan niesie `aria-expanded` na przycisku.

#### 2. Wiersz szukania i nagłówek wyszukiwarki

**File**: `src/components/room/GifPicker.tsx`

**Intent**: Układ regionu od góry:

- wiersz nagłówka: napis „Szukaj gifa” (`h3`, `text-primary-text`, `text-sm font-semibold`, z ikoną lupy jak na makiecie R1) i przycisk powrotu `ghost` `sm` ze strzałką. Poniżej `xl` mówi „Wróć do pisania”, od `xl` „Wróć do czatu”. To dwa przyciski przełączane samym CSS (`xl:hidden` / `hidden xl:inline-flex`), a w ramce `/dev/room-states` (`inFrame`) tylko „Wróć do pisania”;
- status i wyniki jak dziś (pasek przewijany w bok poniżej `xl`, siatka 3 kolumn od `xl`);
- na dole wiersz szukania: przekazany przycisk „GIF”, pole z lupą (`InputGroupAddon align="inline-start"`, ikona `aria-hidden`), „Szukaj”.

X i dolne „Wróć do czatu” znikają. Komentarze `STRIP`/`PANEL_FROM_XL` i komponentu opisują R1 zamiast W2 nad polem.

**Contract**:

- nowe propsy:
  - `toggle: ReactNode`, czyli przycisk „GIF” na początek wiersza szukania;
  - `onBack: () => void` w miejsce `onClose`.
- bez zmian:
  - region „Wyszukiwarka gifów”;
  - pole „Szukaj gifa” jako `textbox` (bez `type="search"`, `enterKeyHint="search"` zostaje);
  - placeholder „Search KLIPY”;
  - lista „Wyniki wyszukiwania”;
  - `role="status"` wewnątrz regionu.

#### 3. Czat: jedno pole naraz

**File**: `src/components/room/RoomChat.tsx`

**Intent**:

- Przy otwartym szukaniu wiersz pisania (formularz z polem i „Wyślij wiadomość”) nie jest renderowany. Szkic żyje w stanie `text`, więc wraca nietknięty.
- „GIF” renderuje się raz: w wierszu pisania albo jako `toggle` wyszukiwarki. Wygląd ma z `composerToggleVariant(searchOpen)`.
- Fokus:
  - zamknięcie „GIF”-em → `gif-button`;
  - „Wróć…” → `field`;
  - wybór gifa → `field` (bez zmian).
- Komentarze komponentu i układu opisują R1.

**Contract**:

- `aria-expanded` i `aria-controls` „GIF” bez zmian;
- `sectionWhileSearching` dalej daje panelowi poniżej `lg` wysokość `h-1/2`;
- od `xl` lista dalej chowa się za wyszukiwarką.

#### 4. Napisy

**File**: `src/lib/i18n/pl/chat.ts`

**Intent**:

- dochodzi `gifs.heading` („Szukaj gifa”, widoczny napis nad wynikami, osobny klucz od `fieldLabel`, bo w S-27 może brzmieć inaczej);
- dochodzi `gifs.backToWriting` („Wróć do pisania”);
- `gifs.back` („Wróć do czatu”) zostaje dla `xl`;
- `gifs.close` znika razem z X.

**Contract**: komentarze kluczy mówią, gdzie stoją. Test pseudojęzyka (`tests/unit/i18n.test.ts`) obejmie je sam.

#### 5. Podglądy

**File**: `src/pages/dev/room-states.astro`, `src/pages/dev/room-window.astro`

**Intent**: Stany szukania 202–207 i próbki `chat-reveal-host-gif-search`, `-results`, `-empty`, `-limit` pokażą R1 bez nowych danych. Trzeba sprawdzić opisy stanów (`room-states.astro:1097-1124`) i poprawić te, które mówią o X albo o pasku nad polem. Nowych stanów nie ma, bo R1 nie dodaje stanu, tylko zmienia wygląd istniejących.

**Contract**: identyfikatory stanów i próbek bez zmian.

#### 6. Macierz kontrolek

**File**: `src/pages/dev/ui-kitchen-sink.astro`

**Intent**: Wiersz przełącznika czatu w dwóch odmianach (zamknięty i otwarty), według reguły wierszy (`:40-46`):

- komórki default, hover i focus są żywe;
- komórki disabled, error, empty i loading to „nie dotyczy” z powodem (przełącznik nigdy nie jest wyłączony, nie ma błędu ani treści do wczytania).

Wiersz używa `composerToggleVariant` i klas z `chat-composer.ts`, bez wyspy. Ma własny klucz `data-cell`, bo dzisiejsze id wierszy przycisków buduje się z wariantu (`:226`, `:243`, `:255`).

**Contract**: `data-cell="toggle-off:<stan>"`, `data-cell="toggle-on:<stan>"` (nazwa kontrolki w id wolna, byle unikalna).

#### 7. E2e

**File**: `tests/e2e/chat.spec.ts`

**Intent**: Przed zmianą przeczytać `context/foundation/test-plan.md` §6 (wyrocznia, odmowy, budżet gier). Wyrocznia to decyzja Karola 1 (R1), wypisana w teście.

- Krok „with the search still open, A writes” (`:517-520`) zastąpić. Przy otwartym szukaniu (po limicie z `:510`) u A:
  - nie ma pola „Wiadomość na czacie” ani „Wyślij wiadomość” (`toHaveCount(0)`), jest jeden „GIF” z `aria-expanded="true"`;
  - A naciska przycisk powrotu (w regionie, nazwa `/^Wróć do (pisania|czatu)$/`, bo `chromium` ma `xl`, a `phone` nie);
  - regionu już nie ma, fokus stoi w polu wiadomości;
  - A pisze `END_TEXT` jak dziś.
- Komentarz nagłówka `:25-26` opisuje R1.
- Reszta lokatorów zostaje: `closeGifSearch` dalej klika „GIF”, który teraz stoi w wierszu szukania.

**Contract**: bez nowej gry i bez nowego testu (budżet gier). Liczby i teksty wypisane w teście.

#### 8. Próbny alarm w CI

**Intent**: Przewidywanie zapisane przed alarmem. Tymczasowy commit renderuje wiersz pisania także przy otwartym szukaniu, ale bez drugiego „GIF” (ten zostaje tylko w wierszu szukania).

Przewidywanie:

- czerwony jest tylko test `chat.spec.ts`, w kroku „nie ma pola wiadomości przy otwartym szukaniu”, w obu projektach (`chromium`, `phone`);
- `ci`, `db` i `smoke` są zielone.

Push alarmu i revertu za zgodą Karola. Recenzję AI na alarmie anulować. Wynik z datą trafia do `test-plan.md` §6.4 według wzoru `:433-436`.

**Contract**: alarm i revert jako osobne commity na gałęzi.

#### 9. Zrzuty przed i po

**Intent**: Strona „Co oceniasz” w Chrome Karola. Zrzuty:

- telefon 390×844 (prawdziwa wielkość) i 390×480 (z klawiaturą);
- laptop 1536×750 1:1;
- z `/dev/room-window`: czat ze szkicem, szukanie puste, z wynikami i przy limicie;
- przed (z `main`) i po.

Serwer dev zatrzymany po zrzutach.

### Success Criteria:

#### Automated Verification:

- Bramka zielona: `npm run lint`, `npx astro check`, `npm test`, `npm run build`
- `npx playwright test --list` wymienia `chat.spec.ts` w obu projektach
- CI na draft PR zielone: `ci`, `smoke`, `db`, `e2e`
- Próbny alarm trafia dokładnie: czerwony tylko krok R1 w `chat.spec.ts` (`chromium`, `phone`), po revercie CI zielone, wpis w `test-plan.md` §6.4

#### Manual Verification:

- Karol akceptuje zrzuty przed i po (telefon w prawdziwej wielkości, laptop 1:1): przy otwartym szukaniu jedno pole, włączony „GIF”, lupa, „Szukaj gifa”, „Wróć…”

**Implementation Note**: po akceptacji Karola commit fazy (z `plan.md`, `plan-brief.md`, `change.md` i roadmapą), potem push za zgodą, draft PR, CI, alarm i revert.

---

## Faza 2: Siatka emoji i szczelina (E1 + K1, Z5)

### Overview

Przycisk 😊 i siatka 33 emoji nad polem wiadomości, wstawianie w miejscu kursora, zamykanie według K1 i decyzji z tej rozmowy. Pasek emotek bez szczeliny.

### Changes Required:

#### 1. Lista emoji

**File**: `src/components/room/chat-composer.ts`

**Intent**: Lista 33 emoji Karola w jego kolejności (decyzja 3), z komentarzem o kolejności motywów, o tym, że każde to jeden punkt kodowy (licznik liczy je jak 1 znak), i o ryzyku 🫨 (Emoji 15.0, możliwy kwadracik na starszym sprzęcie, przyjęte). Klasa komórki: `ghost`, `h-11`, `text-2xl`, przezroczysta, 7 kolumn.

**Contract**: `CHAT_EMOJI: readonly string[]` dokładnie:

`😂 🤣 😭 💀 😱 🤯 😳 🫨 🤨 🧐 👀 🙄 🤔 😏 😬 🙈 😅 🤦 🤷 🥴 🥺 😍 😎 😈 🤬 🤡 🗿 🔥 💯 👏 👉 🥳 🍻`.

Wartość „emoji” w kodzie, bez „emote”.

#### 2. Przycisk 😊 i siatka

**File**: `src/components/room/RoomChat.tsx`

**Intent**:

- W wierszu pisania, po „GIF”, przycisk z ikoną `Smile` (lucide), `aria-label` „Emoji”, `aria-expanded`, `aria-controls` siatki, wygląd z `composerToggleVariant`. Stoi też bez klucza KLIPY.
- Siatka (otwarta tylko z przyciskiem) stoi między listą a wierszem pisania, w tym samym miejscu co wyniki gifów. To `role="group"` z nazwą „Emoji”, a nie region ani grupa ze słowem „Emotki”. W środku 33 przyciski, nazwą każdego jest sam znak. Pod wąskim, niskim oknem siatka przewija się w sobie (`min-h-0`, `overflow-y-auto`), więc pole nigdy nie wypada z panelu (F1 z `room-chat`).
- Poniżej `lg` panel z otwartą siatką ma `h-1/2`, jak przy szukaniu. Od `xl` lista nad siatką się kurczy.
- Zachowanie:
  - otwarcie → fokus na pierwsze emoji;
  - drugie dotknięcie 😊 → zamknięcie, fokus zostaje na 😊;
  - Esc w siatce → zamknięcie, fokus na 😊;
  - fokus w polu wiadomości → zamknięcie;
  - „GIF” → siatka zamknięta, szukanie otwarte (fokus w polu szukania);
  - zwinięcie czatu → zamknięta;
  - dotknięcie emoji → wstawienie (Critical Implementation Details), zdjęcie błędu sprawdzenia jak przy pisaniu; siatka zostaje otwarta, a fokus nie idzie do pola.

**Contract**:

- nowy stan „siatka otwarta”, wykluczający się z `searchOpen`;
- nowy cel `focusNext` dla 😊 i pierwszego emoji;
- `ChatPreview.emojiOpen?: boolean` (otwarta siatka na starcie podglądu).

#### 3. Napisy

**File**: `src/lib/i18n/pl/chat.ts`

**Intent**: Klucze przycisku („Emoji”) i nazwy grupy („Emoji”), z komentarzem, że znaki emoji nie są w słowniku (pseudojęzyk owinąłby je w ⟦…⟧).

**Contract**: np. `emoji: { button, grid }`.

#### 4. Szczelina nad paskiem emotek (Z5)

**File**: `src/components/room/EmoteBar.tsx`

**Intent**: Pasek poniżej `lg` ma co najmniej 72 px, tyle co jego miejsce `h-18` i `bottom-18` panelu czatu. Komentarz łączy te trzy wartości. Od `lg` bez zmian.

**Contract**: `min-h-18 lg:min-h-0` w `IN_WINDOW.bar` (bez wartości arbitralnej, `ui-literals.mjs` by ją odrzucił).

#### 5. Podglądy i macierz

**File**: `src/pages/dev/room-states.astro`, `src/pages/dev/room-window.astro`, `src/pages/dev/ui-kitchen-sink.astro`

**Intent**:

- `/dev/room-states`: nowy stan „207a. Czat: siatka emoji otwarta (szkic w polu)” (numery 208–214 zajęte przez historię, wzór litery „5b”).
- `/dev/room-window`: próbka `chat-reveal-host-emoji` (panel otwarty, siatka otwarta, szkic).
- `/dev/ui-kitchen-sink`: wiersz „Komórka emoji” według reguły wierszy. Default, hover i focus są żywe. Disabled, error, empty i loading to „nie dotyczy” z powodem (komórka zawsze działa, a limit sprawdza „Wyślij”).

**Contract**: unikalne `id` jak w istniejących stanach (`:2547-2564`), próbka z `open: true`.

#### 6. Słownik domeny

**File**: `context/domain/glossary.md`, `src/lib/rooms/chat.ts` (tylko komentarz)

**Intent**:

- Nowe hasło „emoji”: znak w tekście wiadomości na czacie, z siatki obok „GIF” (33, wybór Karola 2026-11-23) albo z klawiatury; liczy się do 200 znaków jak punkty kodowe (😂 = 1, ❤️ = 2); to nie emotka.
- W kodzie: `CHAT_EMOJI`, przycisk „Emoji”. Unikać: „emotka”, „reakcja”.
- Zdanie przy „wiadomość na czacie” (`:51`) i komentarz `chat.ts:16` mówią prawdę: polska litera i emoji z siatki to jeden znak, emoji złożone (❤️, odcień skóry) to 2–4.

**Contract**: bez zmiany działania w `src/lib/rooms/`.

#### 7. E2e

**File**: `tests/e2e/chat.spec.ts`

**Intent**: Wyrocznia: decyzje 2 i 3 oraz decyzja z tej rozmowy (zamknięcie przy polu), wypisane w teście. Po kroku R1 z Fazy 1, zamiast `writeMessage(END_TEXT)`, A składa wiadomość z emoji:

- A wpisuje „ab” i cofa kursor o jeden znak, potem naciska „Emoji”;
- jest grupa „Emoji” z 33 przyciskami w kolejności Karola (`toHaveText` z listą wypisaną w teście), pole wiadomości widoczne i bez fokusu, „Emoji” z `aria-expanded="true"`;
- A naciska 😂 i 🔥 → pole ma dokładnie „a😂🔥b”;
- „GIF” → grupy nie ma, region wyszukiwarki jest; „GIF” znowu → regionu nie ma;
- „Emoji”, Esc → grupy nie ma, fokus na „Emoji”;
- „Emoji”, klik w pole → grupy nie ma, fokus w polu, tekst „a😂🔥b” nietknięty;
- A wysyła, a host i A czytają „a😂🔥b” z nickiem A (zamiast `END_TEXT`).

W kroku niskiego okna (`:548-556`) dochodzi jeszcze jedno sprawdzenie: z otwartą siatką pole stoi całe w oknie, a środek pola trafia w pole (`reachesField`).

**Contract**: bez nowej gry. Grupa „Emoji” poza grupą „Emotki” (`emotes.spec.ts` bez zmian i zielony).

#### 8. Zrzuty przed i po

**Intent**: Strona „Co oceniasz”:

- siatka otwarta na telefonie 390×844 i 390×480, na laptopie 1536×750;
- czat bez klucza KLIPY (sam 😊);
- zbliżenie 4× szczeliny przed i po (`chat-reveal-host-gif`, `chat-vote-guest-gif`, telefon).

Serwer dev zatrzymany po zrzutach.

### Success Criteria:

#### Automated Verification:

- Bramka zielona: `npm run lint`, `npx astro check`, `npm test`, `npm run build`
- Na telefonie 390×844 (`/dev/room-window?state=chat-reveal-host-gif`) dolna krawędź panelu czatu równa górnej krawędzi paska emotek (szczelina 0 px, pomiar skryptem w scratchpadzie)
- CI na PR zielone: `ci`, `smoke`, `db`, `e2e` (z krokami emoji w `chat.spec.ts` i bez zmian w `emotes.spec.ts`)

#### Manual Verification:

- Karol akceptuje zrzuty przed i po: siatka na telefonie i laptopie, 😊 bez klucza KLIPY, brak szczeliny

**Implementation Note**: po akceptacji Karola commit fazy, potem push za zgodą i CI. Bez osobnego próbnego alarmu: test porównuje dokładny tekst „a😂🔥b” i dokładną listę 33 emoji, więc nie przejdzie na pusto. Alarm całej zmiany pilnuje błędu z gry (Faza 1).

---

## Faza 3: Domknięcie i wdrożenie

### Overview

Reguła dla następnych agentów, wpis w test-planie, gotowy PR, produkcja.

### Changes Required:

#### 1. Reguła w `AGENTS.md`

**File**: `AGENTS.md` („## UI”)

**Intent**: Jedno zdanie: na czacie naraz stoi jedno pole tekstowe, wyszukiwarka gifów zastępuje wiersz pisania (S-29, uwaga z gry 2026-11-22). Przycisk, który otwiera panel czatu (GIF, emoji), bierze wygląd z `src/components/room/chat-composer.ts` (`outline` zamknięty, `default` otwarty, z `aria-expanded`).

**Contract**: bez `@ścieżki` (wkleiłaby plik).

#### 2. Test-plan

**File**: `context/foundation/test-plan.md` (§6.4, `:398` i wpis alarmu)

**Intent**: Opis ekranu czatu w e2e po R1: jedno pole naraz, przycisk powrotu, „GIF” w wierszu szukania, grupa „Emoji” z 33 przyciskami, zamknięcie przy polu i Esc. Wpis alarmu z Fazy 1, jeśli nie trafił tam w Fazie 1.

**Contract**: bez zmian w innych sekcjach.

#### 3. PR i wdrożenie

**Intent**:

- PR z draftu na gotowy → zielone `ci`, `smoke`, `db`, `e2e` → scala Karol (`! gh pr merge <n> --merge`) → Workers Builds → smoke na produkcji (zgoda Karola, jeden przebieg).
- Epilog (Progress z SHA, `change.md` → `implemented`) po ręcznym sprawdzeniu Karola, małym PR-em albo z następną zmianą.
- `/10x-impl-review` według uznania Karola (zmiana średnia, lżejszy cykl).
- `/10x-archive` po grze.

**Contract**: bez migracji, więc bez `db push`.

### Success Criteria:

#### Automated Verification:

- CI na PR zielone: `ci`, `smoke`, `db`, `e2e`
- Smoke na produkcji zielony po scaleniu (za zgodą Karola)

#### Manual Verification:

- Karol na telefonie i laptopie w prawdziwej grze:
  - „GIF” chowa pole wiadomości, a „Wróć…” je przywraca ze szkicem;
  - gif idzie na czat;
  - 😊 chowa klawiaturę i wstawia emoji w miejscu kursora;
  - dotknięcie pola zamyka siatkę i przywraca klawiaturę;
  - brak szczeliny nad paskiem emotek;
  - 🫨 widać (albo kwadracik na starym sprzęcie, przyjęte).

---

## Testing Strategy

### Unit Tests:

- Bez nowych. Żaden test jednostkowy nie renderuje `RoomChat` (`test-plan.md:434`), a zachowanie siatki potrzebuje przeglądarki. Pseudojęzyk w `tests/unit/i18n.test.ts` obejmie nowe klucze sam.

### Integration Tests:

- `tests/e2e/chat.spec.ts`, rozszerzony istniejący test w obu projektach:
  - R1: pole wiadomości i „Wyślij” znikają przy szukaniu, a powrót przywraca fokus w polu (alarm w Fazie 1);
  - siatka: 33 emoji w kolejności, wstawianie w miejscu kursora, wykluczanie z szukaniem, Esc, zamknięcie przy polu, wiadomość z emoji u hosta;
  - niskie okno z otwartą siatką.
- `tests/e2e/emotes.spec.ts` i `players-channel.spec.ts` bez zmian, zielone (siatka nie koliduje z grupą „Emotki”).

### Manual Testing Steps:

1. Telefon: czat → „GIF” → widać jedno pole, z lupą i z napisem „Szukaj gifa”; „Wróć do pisania” → pole wiadomości ze szkicem, klawiatura.
2. Telefon: 😊 → klawiatura się chowa, siatka; 😂 w środku tekstu; dotknięcie pola → siatka znika, klawiatura wraca.
3. Laptop (od `xl`): „GIF” → wyniki w miejscu listy, „Wróć do czatu”; 😊 → lista się kurczy, siatka nad polem.
4. Telefon: brak prześwitu między panelem czatu a paskiem emotek.

## Performance Considerations

Bez znaczenia: 33 przyciski w pamięci wyspy, bez nowych zapytań. Szukanie gifów pyta KLIPY dokładnie tak jak dziś.

## Migration Notes

Nie dotyczy (bez bazy i bez zapisanych danych).

## References

- Research i decyzje Karola 1–4: `context/changes/chat-composer/research.md`
- Roadmapa: `context/foundation/roadmap.md` (S-29)
- Czat i wyszukiwarka: `src/components/room/RoomChat.tsx`, `src/components/room/GifPicker.tsx`
- Wzór „włączony” przez wariant: `src/components/room/QuestionReaction.tsx:83-92`
- Wzór faz z galerią i zrzutami: `context/changes/categories-unticked/plan.md`; alarmy e2e w CI: `context/changes/room-chat-gifs/plan.md`
- Makiety (poza repo, scratchpady sesji 2026-11-23, mogą zniknąć): R1 `…\c40d02ea-…\scratchpad\s29\inject.js`, E1 `inject2.js`, siatka i szczelina `…\9f5d5abb-…\scratchpad\s29-d3\inject3.js`, `gap-fix.mjs`

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: Szukanie gifa zamiast pisania (R1)

#### Automated

- [x] 1.1 Bramka zielona: `npm run lint`, `npx astro check`, `npm test`, `npm run build` — 4475e77
- [x] 1.2 `npx playwright test --list` wymienia `chat.spec.ts` w obu projektach — 4475e77
- [x] 1.3 CI na draft PR zielone: `ci`, `smoke`, `db`, `e2e` — 4475e77
- [x] 1.4 Próbny alarm trafia dokładnie: czerwony tylko krok R1 w `chat.spec.ts` (`chromium`, `phone`), po revercie CI zielone, wpis w `test-plan.md` §6.4 — 3811bd6

#### Manual

- [x] 1.5 Karol akceptuje zrzuty przed i po (telefon w prawdziwej wielkości, laptop 1:1): przy otwartym szukaniu jedno pole, włączony „GIF”, lupa, „Szukaj gifa”, „Wróć…” — 4475e77

### Phase 2: Siatka emoji i szczelina (E1 + K1, Z5)

#### Automated

- [ ] 2.1 Bramka zielona: `npm run lint`, `npx astro check`, `npm test`, `npm run build`
- [ ] 2.2 Na telefonie 390×844 (`/dev/room-window?state=chat-reveal-host-gif`) dolna krawędź panelu czatu równa górnej krawędzi paska emotek (szczelina 0 px, pomiar skryptem w scratchpadzie)
- [ ] 2.3 CI na PR zielone: `ci`, `smoke`, `db`, `e2e` (z krokami emoji w `chat.spec.ts` i bez zmian w `emotes.spec.ts`)

#### Manual

- [ ] 2.4 Karol akceptuje zrzuty przed i po: siatka na telefonie i laptopie, 😊 bez klucza KLIPY, brak szczeliny

### Phase 3: Domknięcie i wdrożenie

#### Automated

- [ ] 3.1 CI na PR zielone: `ci`, `smoke`, `db`, `e2e`
- [ ] 3.2 Smoke na produkcji zielony po scaleniu (za zgodą Karola)

#### Manual

- [ ] 3.3 Karol na telefonie i laptopie w prawdziwej grze: „GIF” chowa pole wiadomości, a „Wróć…” je przywraca ze szkicem; gif idzie na czat; 😊 chowa klawiaturę i wstawia emoji w miejscu kursora; dotknięcie pola zamyka siatkę i przywraca klawiaturę; brak szczeliny nad paskiem emotek; 🫨 widać (albo kwadracik na starym sprzęcie, przyjęte)
