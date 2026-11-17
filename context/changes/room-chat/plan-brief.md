# Czat w pokoju: krótkie wiadomości z nickiem, bez zapisu — Plan Brief

> Full plan: `context/changes/room-chat/plan.md`
> Research: `context/changes/room-chat/research.md`

## What & Why

Gracze w pokoju piszą krótkie wiadomości na czacie, a cały pokój widzi je na żywo z nickiem nadawcy: w poczekalni, w grze i na końcu wieczoru (S-23, PRD FR-028). To pierwsza treść pisana przez graczy, więc zanim pójdzie pierwsza wiadomość, ekrany muszą móc sprawdzić, że nadał ją ten gracz, a nie ktoś z cudzym nickiem.

## Starting Point

Emotki idą dziś drogą ekran → Worker (bierze nick ze stanu pokoju) → temat graczy `live-players:<klucz kanału>`, bez zapisu. Kanał nie ma podpisu: gracz, który zna klucz, może nadać emotkę z cudzym nickiem, a e2e sprawdza to dziś jako kontrolę nadawcy.

## Desired End State

Worker podpisuje każdą wiadomość tematu graczy (emotkę i czat) kluczem prywatnym. Ekrany pokazują tylko podpisane, świeże i niepowtórzone. Czat stoi w każdym stanie pokoju, w układzie wybranym przez Karola: do 200 znaków, 2 s pauzy, ostatnie 50 wiadomości tylko w pamięci karty. Po odświeżeniu czat jest pusty, a po usunięciu gracza jego wpisy znikają.

## Key Decisions Made

| Decision                | Choice                                                   | Why (1 sentence)                                                                           | Source           |
| ----------------------- | -------------------------------------------------------- | ------------------------------------------------------------------------------------------ | ---------------- |
| Zapis treści            | nigdzie: ani baza, ani logi, ani pamięć przeglądarki     | FR-028 i decyzja Karola; czat zaczyna się od chwili wejścia                                | PRD / change.md  |
| Długość i pauza         | 200 znaków, 2 s                                          | dwa–trzy zdania; pauza trzyma budżet Realtime (100 wiadomości/s na projekt)                | Research (Karol) |
| Wpisy usuniętego gracza | znikają z ekranów                                        | usunięcie to jedyne narzędzie prowadzącego, bo gra nie ma moderacji                        | Plan (Karol)     |
| Linki                   | zwykły tekst                                             | gra bez moderacji nie podsuwa obcych stron jednym dotknięciem                              | Plan (Karol)     |
| Wygląd                  | galeria wariantów w Fazie 3, wybiera Karol               | stała zasada: wygląd ekranów wybiera Karol na zrzutach                                     | Research         |
| Podpis                  | ECDSA P-256 w `crypto.subtle`                            | działa w każdej przeglądarce od 2020; Ed25519 nie działa w Samsung Internet 29 i na iOS 16 | Research         |
| Kształt                 | `{data, sig}`, `data` z pokojem, zdarzeniem, czasem i id | podpis dokładnego ciągu; nie da się przenieść do innego pokoju ani pod inne zdarzenie      | Research / Plan  |
| Świeżość                | okno ±60 s od czasu serwera, odrzucanie powtórzonych id  | zegar telefonu bywa przestawiony, więc liczy się przesunięcie z propsów i nagłówka `Date`  | Plan             |
| Sekret                  | `LIVE_SIGNING_KEY`, opcjonalny; bez niego 503            | brak wymaganej zmiennej wywróciłby wszystkie trasy                                         | Research / Plan  |
| Echo nadawcy            | brak, swoją wiadomość widać z kanału                     | jak emotki: jedno źródło, bez podwójnych wpisów                                            | Plan             |
| Czytnik ekranu          | najnowsza wiadomość w `aria-live="polite"`, jak emotki   | dławienie (F3 z S-16) dalej czeka na sprawdzenie z czytnikiem                              | Plan             |

## Scope

**In scope:**

- podpis na emotkach i czacie, sprawdzenie na ekranach, odwrócony test podszycia;
- trasa `POST /api/rooms/<id>/chat`, zdarzenie `chat`;
- czat we wszystkich stanach pokoju, podglądy `/dev`, klawiatura telefonu;
- nowy sekret, klucz w CI, skrypt klucza;
- testy jednostkowe, e2e i smoke, dokumenty, wdrożenie.

**Out of scope:**

- gify (S-24);
- serwerowy limit wiadomości;
- moderacja i filtry;
- prywatne wiadomości, edycja, reakcje, „pisze…”, dźwięki;
- klikalne linki;
- podpis dzwonków;
- czat u spóźnionego czekającego i usuniętego;
- dławienie czytnika ekranu;
- migracje bazy.

## Architecture / Approach

Wspólny moduł `src/lib/live-sync/signature.ts` (bez importów serwera) podpisuje i sprawdza kopertę. Worker czyta sekret przez `astro:env/server` (`signing-key.ts`), podpisuje w trasach emotki i czatu i nadaje przez `httpSend` jak dziś. Strona pokoju podaje ekranowi klucz publiczny i czas serwera obok konfiguracji Realtime. Efekt tematu graczy w `useRoomState` sprawdza każdą kopertę, zanim przekaże emotkę albo wiadomość do `RoomScreen`. Czat ma własny moduł limitów (`src/lib/rooms/chat.ts`) i komponent `RoomChat.tsx`.

## Phases at a Glance

| Phase                               | What it delivers                                                               | Key risk                                                                     |
| ----------------------------------- | ------------------------------------------------------------------------------ | ---------------------------------------------------------------------------- |
| 1. Podpis serwera na temacie graczy | emotki podpisane, podróbki odrzucone, sekret i klucz w CI; gracz nic nie widzi | pułapki formatu podpisu (P1363, dokładny ciąg); karty otwarte przy wdrożeniu |
| 2. Czat na serwerze                 | trasa czatu z walidacją, podpisane zdarzenie `chat`, kroki smoke               | treść wpadnie do logu (pilnują testy logu)                                   |
| 3. Czat na ekranach                 | galeria, wybór Karola, czat we wszystkich stanach, podglądy, `chat.spec.ts`    | klawiatura prawdziwego telefonu przy polu na dole ekranu                     |
| 4. Dokumenty i wdrożenie            | słownik, AGENTS.md, deploy-plan; sekret przed scaleniem, smoke na produkcji    | scalenie przed `wrangler secret put` daje 503 na emotkach i czacie           |

**Prerequisites:** S-16 i `players-only-live-channel` na produkcji (są). Zgoda Karola na push, `wrangler secret put`, smoke i dopisanie klucza do lokalnego `.dev.vars`.
**Estimated effort:** około 4–5 sesji (Faza 3 z galerią najdłuższa).

## Open Risks & Assumptions

- `interactive-widget=resizes-content` (tylko przy wariancie z polem przyklejonym do dołu) pomaga tylko na Androidzie i działa na całą stronę pokoju, więc pola hosta „Popraw” i „Dodaj własne pytanie” dostają ten sam `scroll-mb` co pole propozycji. Na iPhonie zachowanie pola przy klawiaturze sprawdzi dopiero przeklikanie, a planem awaryjnym jest domyślny viewport z `scroll-mb`.
- Sprawdzanie podpisu w przeglądarce jest asynchroniczne: ekran trzyma jedną kolejkę, żeby wiadomości czatu nie zamieniały się miejscami. Bez `crypto.subtle` (gość na `http://` w sieci domowej) ekran nie słucha tematu graczy.
- Gracz z kluczem kanału dalej może zalać temat graczy (przyjęte). Podpis odrzuca tylko podrobioną treść.
- Czytnik ekranu przy żywej rozmowie może opóźniać zapowiedzi gry (F3 z S-16, do sprawdzenia przez Karola, F7).
- Powtórka cudzej podpisanej wiadomości w oknie 60 s dotrze tylko do ekranów, które nie widziały oryginału (przyjęte).

## Success Criteria (Summary)

- Cały pokój widzi wiadomość gracza na żywo z jego nickiem w poczekalni, w grze i na końcu wieczoru, a gra działa jak dotąd.
- Podrobiona wiadomość albo emotka z cudzym nickiem nie pojawia się na żadnym ekranie (e2e i próbny alarm).
- Nic z treści czatu nie trafia do bazy ani logów, po odświeżeniu czat jest pusty, a wpisy usuniętego gracza znikają.
