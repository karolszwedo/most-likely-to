---
change_id: room-chat
title: Czat w pokoju: krótkie wiadomości z nickiem, bez zapisu
status: impl_reviewed
created: 2026-11-17
updated: 2026-11-17
archived_at: null
---

## Notes

S-23 w roadmapie, FR-028 w PRD (punkt 6 kolejki Karola, B czat). Gify to osobna zmiana S-24 `room-chat-gifs`, po tej.

Decyzje Karola 2026-11-17 (przy zmianie PRD):

- wiadomości nie zostają nigdzie: ani w bazie, ani w logach; po odświeżeniu albo dla wpuszczonego spóźnionego czat zaczyna się od tej chwili;
- gify z wyszukiwarki darmowego dostawcy, zawsze z filtrem treści dla dorosłych, bez nicku i pokoju u dostawcy (S-24);
- czat dostępny cały czas: poczekalnia, gra (także głosowanie) i koniec wieczoru.

Decyzja Karola 2026-11-17 (research, pytanie 1): wiadomość do 200 znaków (liczonych jak w polu propozycji: polska litera i emoji to jeden znak), 2 s pauzy między wiadomościami jednego gracza.

Decyzje Karola 2026-11-17 (`/10x-plan`): wpisy usuniętego gracza znikają z czatu na ekranach pozostałych (usunięcie to jedyne narzędzie prowadzącego); link w wiadomości to zwykły tekst, nie klikalny; wygląd czatu na telefonie i laptopie wybiera z galerii zrzutów w Fazie 3; złożoność wysoka, 4 fazy (podpis → czat na serwerze → ekrany → dokumenty i wdrożenie).

Dopisane przez sesję, bez sprzeciwu Karola: jeden czat na pokój, bez prywatnych wiadomości; bez moderacji (prowadzący ma usunięcie gracza); spóźniony czekający i usunięty nie widzą czatu.

Przed pierwszą wiadomością: podpis serwera na każdej wiadomości kanału, także emotce (W-E, `context/changes/players-only-live-channel/research.md`). Nowy sekret Workera to `npx wrangler secret put`, za zgodą Karola.

Wybór Karola 2026-11-17 (Faza 3, galeria zrzutów, 3.4): telefon **T2 „Przycisk Czat z licznikiem”** (guzik „Czat” z liczbą nowych wiadomości nad paskiem emotek z lewej; nowa wiadomość wyskakuje na chwilę nad guzikiem, jak dymek emotki; dotknięcie otwiera panel z listą i polem, rozwijany region, nie okno modalne); laptop **L3 „Panel z lewej”** (od `xl` panel czatu przy lewej krawędzi przez całą wysokość okna, emotki zostają w karcie przy prawej krawędzi, gra między nimi; od `lg` do `xl` czat jako sekcja pod grą). L3 to propozycja Karola przy galerii („z lewej strony ekranu chyba nic nie ma”), dorobiona na zrzutach obok L1 (panel z prawej z emotkami w środku); odrzucone: T1, T3, L1, L2.

Skutek wyboru T2 (plan, Faza 3 #4; plan-review F4, „tak” właściciela 17.11): strona pokoju `/r/` ma w meta viewport `interactive-widget=resizes-content`, więc na Androidzie panel czatu i pasek emotek stają nad klawiaturą, a pola hosta „Popraw” i „Dodaj własne pytanie” dostały `scroll-mb-44 lg:scroll-mb-0` jak pole propozycji. Klawiaturę prawdziwego telefonu sprawdza właściciel w 4.5; gdy pokaże problem, strona wraca do domyślnego viewportu, a czat dostaje `scroll-mb`.

Przegląd implementacji 2026-11-17 (`reviews/impl-review.md`, NEEDS ATTENTION; Karol: „poprawiam wszystkie”). Poprawki F1–F9 w osobnym PR-ze (gałąź `room-chat-review-fixes`). Dwie drobne różnice od planu zostają, opisane tu zamiast w planie (F8): (a) zły albo brakujący sekret daje linię `{ op: "signing_key", step: "import" }` albo `step: "missing"`, bez `errName`, bo `importSigningKey` zwraca `null` zamiast błędu; treści sekretu nie ma w żadnej (`deploy-plan.md`, „Sekrety Workera”); (b) nick na czacie to kropka w kolorze gracza i pogrubiony nick, a nie nick w kolorze gracza, jak na zrzutach zaakceptowanych przez Karola w 3.5.
