---
change_id: room-chat-gifs
title: Room chat gifs
status: implementing
created: 2026-11-17
updated: 2026-11-18
archived_at: null
---

## Notes

S-24 w roadmapie, FR-028 (część „gify”) w PRD; punkt 6 kolejki Karola (B czat), po `room-chat` (S-23). Research: `research.md`.

Decyzje Karola z 2026-11-17 (do Open Questions w `research.md`, „elegancko” = tak na wszystkie trzy):

1. Dostawca: **KLIPY** (klucz testowy 100 zapytań/h, potem wniosek o produkcyjny z nagraniem ekranu; GIPHY odpada, bo jego klucz produkcyjny jest płatny).
2. Prywatność przyjęta: dostawca widzi słowa wyszukiwania oraz IP i przeglądarkę każdego gracza, który szuka albo widzi gifa, ale nie nick ani pokój (wywołania z przeglądarki to wymóg KLIPY; Worker nie pośredniczy).
3. Filtr przyjęty: najostrzejszy filtr w zapytaniu i w panelu KLIPY; gracz, który przerobi własną stronę, może przemycić gifa spoza filtra, a gra pokaże tylko gify z hostów KLIPY; na niechcianego gracza prowadzący ma usunięcie.

Konto KLIPY: decyzja Karola z 2026-11-18 to prywatny Gmail przez „Continue with Google”, jak Cloudflare, GitHub i Supabase. Wcześniejszy zapis „na koncie gry” był nieścisły: osobnej skrzynki gry nie ma (Google odrzuciło nowego Gmaila 07.10), a „mail gry” w `plan.md` znaczy właśnie to konto. Graczom mail konta się nie pokazuje: do przeglądarki idzie sam klucz. Klucz jako sekret Workera (`npx wrangler secret put`, za zgodą) i w `.dev.vars`.

Konto i klucz założone 2026-11-18 (Karol logował się sam, sesja wpisała tylko dane platformy za jego zgodą; klucz nie przeszedł przez sesję):

- Panel partnera `partner.klipy.com`: platforma „Most Likely To” (strona gry, krótki opis po angielsku), klucz testowy „MLT-WEB” z przełącznikiem Ads API na OFF; na pulpicie panel proponuje „Turn on Ads”, więc reklamy są wyłączone.
- Filtr w panelu („Manage content” → „Global Settings” → „Content Filter Options”): poziomy High (G), Medium (G, PG), Low (G, PG, PG-13), Off (G, PG, PG-13, R bez nagości). Ustawiony **High: G**, zapisany („Content Type: G”). Blokady słów i ustawienia krajów puste.
- Klucz w lokalnym `.dev.vars` jako `KLIPY_API_KEY`: 64 znaki, pasuje do `^[A-Za-z0-9_-]{8,128}$` (`getGifSearchKey`), sprawdzone skryptem bez wypisania wartości.
- Jeszcze nie wiadomo: czy panel nadpisuje `content_filter` z zapytania (sprawdzi Faza 3 #2 albo wieczór) i czy klucz produkcyjny jest bezpłatny (przy wniosku, Faza 4).

Prawdziwe wyszukiwanie KLIPY 2026-11-18 (Faza 3 #2, skrypt w scratchpadzie, klucz niewypisany, słowo „kot”): 200, CORS `access-control-allow-origin: *`, nagłówki `x-ratelimit-limit: 100` i `x-ratelimit-remaining`; `locale=pl` i `format_filter=webp` przyjęte (w `file.*` tylko `webp`); 12 wyników, wszystkie `type: "gif"`, bez reklam; adresy `sm`/`xs` na `static.klipy.com` w postaci kanonicznej; `xs` ok. 58–100 × 90 px, `sm` ok. 165–220 × 149–391 px. Czy panel nadpisuje `content_filter` z zapytania, dalej niesprawdzone.

Fakty z zakładania klucza na 2026-11-18 (dokumenty Fazy 4): reklamy wyłączone (wyżej). Czy panel nadpisuje `content_filter` z zapytania, dalej niesprawdzone: jedyne prawdziwe wyszukiwanie (Faza 3 #2) szło z `content_filter=high`. Gra zawsze wysyła `high`, a panel ma High: G, więc wyszukiwanie z ekranu gry idzie z najostrzejszym filtrem tak czy inaczej; słowa dla dorosłych sprawdzi Karol w 4.6. Czy klucz produkcyjny jest bezpłatny, nie wiadomo do wniosku (4.7).

Wybór Karola 2026-11-18 (Faza 3, galeria zrzutów, 3.5): **wyszukiwarka W1 na laptopie** (od `xl`, panel L3: zamiast listy wiadomości, siatka 3 kolumny, „Wróć do czatu”) i **W2 na telefonie** (poniżej `xl`: pasek nad polem wiadomości, wyniki w jednym rzędzie przewijanym w bok); **gif w czacie z nickiem nad obrazkiem, 96 px na telefonie i 128 px na laptopie** (granica jak wyżej, `xl`); **dymek zwiniętego czatu z miniaturą gifa**. Przedział `lg`–`xl` (czat jako sekcja pod grą) dostaje wersję telefonu: sekcja ma listę na kilka linijek, więc pasek i 96 px mieszczą się lepiej (decyzja sesji). Odrzucone: W1 na telefonie, W2 na laptopie, nick obok obrazka, dymek z tekstem.

Gotowe ekrany (3.6) Karol zaakceptował 2026-11-18 na zrzutach (telefon 390×844 i 390×480, laptop 1536×750). Po galerii jedna poprawka: z otwartą wyszukiwarką panel czatu poniżej `lg` ma stałe pół okna (`h-1/2`), bo pod samym `max-h-1/2` lista zgniatała pasek wyników do kilku pikseli. Szczelina na kilka pikseli między polem czatu a paskiem emotek na telefonie (z `room-chat`, już na produkcji) zostaje poza tą zmianą.

Decyzje Karola przy `/10x-plan` (2026-11-17, wszystkie według rekomendacji):

4. Po otwarciu wyszukiwarki puste pole; zapytanie dopiero po słowie i „Szukaj” (limit 100/h), bez popularnych gifów na starcie.
5. Napis w polu „Search KLIPY” po angielsku (wymóg KLIPY), etykieta czytnika ekranu „Szukaj gifa”.
6. Wdrożenie od razu na kluczu testowym; nagranie ekranu z produkcji i wniosek o klucz produkcyjny, po zgodzie podmiana sekretu.
7. Fazy: 1 CSP → 2 gif na serwerze → 3 gify na ekranach (galeria, wybór Karola) → 4 dokumenty i wdrożenie.
