# Gify w czacie pokoju — Plan Brief

> Full plan: `context/changes/room-chat-gifs/plan.md`
> Research: `context/changes/room-chat-gifs/research.md`

## What & Why

Gracz na czacie pokoju wpisuje słowo, wybiera gifa z wyszukiwarki KLIPY, a cały pokój widzi go na żywo z jego nickiem (S-24, PRD FR-028). Wyszukiwarka zawsze odfiltrowuje treści dla dorosłych, KLIPY nie dostaje nicku ani pokoju, a gify, jak wiadomości, nie zostają nigdzie. Przy okazji gra dostaje nagłówek CSP odłożony z przeglądu bezpieczeństwa.

## Starting Point

Czat tekstowy S-23 działa na produkcji: wiadomość idzie przez Workera, który bierze nick ze stanu pokoju i podpisuje ją na temacie graczy, a ekrany pokazują tylko podpisane. Gra nie ma CSP i łączy się dziś z jednym obcym adresem: Supabase Realtime (`wss`).

## Desired End State

Przy polu czatu jest przycisk „GIF”. Wyszukiwarka z napisem „Search KLIPY” szuka po „Szukaj” i pokazuje do 12 wyników w kolejności KLIPY, a dotknięcie wysyła gifa do wszystkich z nickiem nadawcy. Gra ładuje obrazki tylko ze swojej domeny i serwerów KLIPY i łączy się tylko z domeną, Supabase i API KLIPY. Wyczerpany limit KLIPY to komunikat w wyszukiwarce, a czat tekstowy działa dalej.

## Key Decisions Made

| Decision               | Choice                                                                      | Why (1 sentence)                                                                    | Source   |
| ---------------------- | --------------------------------------------------------------------------- | ----------------------------------------------------------------------------------- | -------- |
| Dostawca               | KLIPY                                                                       | Jedyny z drogą do klucza bez limitu bez podanej ceny; Tenor wyłączony, GIPHY płatny | Research |
| Prywatność             | KLIPY widzi słowa i IP graczy, nie nick ani pokój                           | Wywołania z przeglądarki to wymóg KLIPY, pośrednik zakazany                         | Research |
| Filtr                  | `content_filter=high` + panel KLIPY; tylko hosty KLIPY na ekranie           | Przerobiona strona może obejść filtr, prowadzący ma usunięcie                       | Research |
| Start wyszukiwarki     | Puste pole, zapytanie po „Szukaj”                                           | Klucz testowy ma 100 zapytań/h na całą grę                                          | Plan     |
| Napis                  | „Search KLIPY” po angielsku, etykieta czytnika „Szukaj gifa”                | Wymóg KLIPY, tłumaczenie niepewne                                                   | Plan     |
| Wdrożenie              | Od razu na kluczu testowym, potem wniosek o produkcyjny z nagraniem         | Nagranie z prawdziwej gry, gify działają od razu                                    | Plan     |
| Droga gifa             | To samo zdarzenie `chat` i trasa `/chat`, wiadomość = tekst albo gif        | Podpis, kolejka, limit 50 i usuwanie wpisów działają bez zmian                      | Plan     |
| Co idzie przez Workera | Adres `sm` webp z odpowiedzi KLIPY, kanoniczny, z hostów KLIPY, + opis      | KLIPY zabrania składania adresów z id; Worker tylko sprawdza                        | Plan     |
| CSP                    | Tylko `img-src` i `connect-src`, Supabase z `SUPABASE_URL` w chwili żądania | Nie dotyka skryptów Astro; CI ma inny adres Supabase                                | Plan     |
| Klucz KLIPY            | Sekret `KLIPY_API_KEY`, do ekranu w propsach strony pokoju                  | Poza publicznym repo; bez klucza czat bez gifów                                     | Plan     |
| Testy                  | Udawane KLIPY w e2e (`context.route`), smoke bez wołania KLIPY              | CI bez sekretu i bez zużywania wspólnego limitu                                     | Plan     |
| Wygląd                 | Galeria w Fazie 3, wybiera Karol                                            | Wygląd ekranu to decyzja Karola                                                     | Plan     |

## Scope

**In scope:**

- CSP (`img-src`, `connect-src`) na każdej odpowiedzi Workera
- Gif w trasie czatu, podpisie i na ekranie, opis gifa dla czytnika ekranu
- Wyszukiwarka KLIPY w czacie, komunikat limitu i awarii
- Sekret `KLIPY_API_KEY`, udawany klucz w CI, kroki smoke, e2e, podglądy `/dev`
- Słownik, AGENTS.md, test-plan, deploy-plan, roadmapa; konto KLIPY i wniosek o klucz produkcyjny

**Out of scope:**

- Pośrednik w Workerze, `customer_id`, cokolwiek z gry w zapytaniu
- Popularne gify na starcie, szukanie przy każdej literze, „Więcej wyników”, kategorie
- Własne filtrowanie wyników, kopie mediów, wideo, `blur_preview`, „Powered by KLIPY”
- `script-src`/`default-src`, CSP na plikach statycznych
- Zapis czegokolwiek, migracja, serwerowy limit gifów

## Architecture / Approach

Przeglądarka gracza pyta KLIPY wprost (`api.klipy.com`, filtr `high`, bez danych gry, bez `Referer`) i ładuje miniatury z `static*.klipy.com`. Wybrany gif idzie jako adres w ciele `POST /api/rooms/<id>/chat`. Worker sprawdza adres jedną funkcją z listą hostów KLIPY, bierze nick z `room_lobby`, podpisuje i nadaje zdarzenie `chat` na temacie graczy. Ekrany sprawdzają podpis, nick i ten sam adres, a potem pokazują `<img>`. Trzecią zaporą jest CSP z tą samą listą hostów.

## Phases at a Glance

| Phase                      | What it delivers                                                                           | Key risk                                                                       |
| -------------------------- | ------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------ |
| 1. Content-Security-Policy | Nagłówek z listą obrazków i połączeń, hosty KLIPY w jednym module                          | Zablokowany Realtime (adres Supabase w złym schemacie)                         |
| 2. Gif na serwerze         | Trasa przyjmuje i podpisuje gifa, klucz KLIPY na stronie, kroki smoke                      | Adres spoza KLIPY przepuszczony przez Workera                                  |
| 3. Gify na ekranach        | Prawdziwe zapytanie → galeria → wyszukiwarka, gif w czacie, podglądy, e2e z udawanym KLIPY | Zapytanie bez filtra albo z danymi gry; kontrakt KLIPY inny niż w dokumentacji |
| 4. Dokumenty i wdrożenie   | Docs, sekret KLIPY przed scaleniem, smoke prod, 5 min w przeglądarce od razu, wniosek      | Scalenie przed sekretem; limit 100/h na wieczorze                              |

**Prerequisites:** konto KLIPY na mailu gry z kluczem testowym w lokalnym `.dev.vars` (Karol, przed Fazą 3; panel: najostrzejszy filtr, reklamy wyłączone); zgody na push, smoke, `wrangler secret put`.
**Estimated effort:** ~3–4 sesje w 4 fazach (Faza 3 z galerią najdłuższa).

## Open Risks & Assumptions

- Kształt odpowiedzi KLIPY, wzór klucza i postać adresów mediów znamy z dokumentacji; rozstrzyga je jedno prawdziwe wyszukiwanie na początku Fazy 3, z którego powstają też dane udawanego KLIPY w e2e.
- Nie wiadomo, czy filtr w panelu KLIPY nadpisuje `content_filter` z zapytania (sprawdzić przy zakładaniu klucza).
- Klucz produkcyjny KLIPY: cena niepodana na oficjalnych stronach, zgoda nie wiadomo kiedy; do tego czasu 100 zapytań/h na całą grę.
- KLIPY może dodać nowy host mediów: gify z niego zostaną odrzucone, aż dopiszemy go do listy.
- Karty otwarte przed wdrożeniem nie pokażą gifów do odświeżenia.

## Success Criteria (Summary)

- Gracz znajduje gifa słowem i cały pokój widzi go z jego nickiem, w każdym stanie pokoju, a po odświeżeniu go nie ma.
- Do KLIPY nie trafia nic z gry, a wyszukiwarka nie daje treści dla dorosłych.
- CI, smoke i e2e zielone z CSP; smoke na produkcji zielony, przeklikanie Karola zaliczone.
