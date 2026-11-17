---
change_id: room-chat
title: Czat w pokoju: krótkie wiadomości z nickiem, bez zapisu
status: implementing
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
