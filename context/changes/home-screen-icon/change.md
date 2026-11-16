---
change_id: home-screen-icon
title: Ikona gry na ekranie głównym telefonu, gotowa pod Google Play
status: preparing
created: 2026-11-16
updated: 2026-11-16
archived_at: null
---

## Notes

Punkt 3 (J) nowej kolejki Karola z 16.11.2026: ikona gry na ekranie głównym telefonu, od razu pod Google Play. Manifest (nazwa, kolory, `display: standalone`) i ikony, w tym 512 px i wersja maskable. Lżejszy cykl, wygląd ikony wybiera Karol na zrzutach. Sam sklep to dalej zamknięta zasada PRD (§Non-Goals: „Bez aplikacji mobilnej ze sklepu i bez trybu offline”). Gdy Karol go otworzy, zostaje: ekran offline, `assetlinks.json`, opakowanie TWA (np. PWABuilder), konto Play (jednorazowo ok. 25 USD), polityka prywatności, ocena wiekowa (18+), testy zamknięte. Zasady Google sprawdzić aktualnie przed tamtą decyzją.

- **Rozpoznanie 16.11.2026 (krótkie, bez `research.md`; lżejszy cykl):**
  - Chrome na Androidzie od wersji 108 instaluje stronę z menu („Dodaj do ekranu głównego” / „Zainstaluj aplikację”) bez service workera, gdy manifest ma `name` lub `short_name`, ikony 192 i 512 px, `start_url`, `display` (`standalone`) i nie ma `prefer_related_applications`; ikona maskable zalecana (developer.chrome.com/blog/update-install-criteria, web.dev/articles/install-criteria). Samoczynny pasek „Zainstaluj” na dole ekranu (mini-infobar) dalej wymaga service workera z obsługą `fetch`, więc bez niego nic nie wyskoczy graczom w trakcie gry: zgodne z PRD (bez trybu offline), a ikonę dodaje się z menu Chrome.
  - iPhone (Safari, „Do ekranu początkowego”) bierze `apple-touch-icon` 180 px.
  - Google Play: ikona 512×512, PNG 32-bit, sRGB, do 1024 KB, pełny kwadrat; sklep sam zaokrągla rogi (developer.android.com/google-play/resources/icon-design-specifications).
  - Pliki z `public/` serwuje Workers Assets (`wrangler.jsonc`, `assets.directory: ./dist`) przed Workerem, więc manifest i ikony nie przechodzą przez middleware. Dziś `public/favicon.png` to ikonka startera (32 px, z pierwszego commita), `Layout.astro` ma już `theme-color` `#1a1a1a`.
  - **Ryzyko do sprawdzenia na telefonach:** logowanie hosta z ikony (tryb `standalone`). Android dzieli ciasteczka z Chrome, więc host zalogowany w Chrome jest zalogowany i w ikonie; iPhone trzyma dla aplikacji z ekranu początkowego osobne dane, więc host loguje się tam drugi raz, a logowanie Google/Discord wychodzi poza grę i wraca. Ręczne sprawdzenie w planie.
  - **W zakresie także obrazek karty linku na Discordzie** (`og:image`): `join-page-ui` odłożyło go „razem z J” (Z2). Mały obrazek obok tekstu czy duży pod nim, Karol wybiera na zrzutach razem z ekranem startowym, już z wybraną ikoną.
- **Galeria 16.11.2026** (`scratchpad/icons/gallery.html`, poza repo): 10 wariantów ikony (1 Wynik, 2 Wynik z pytajnikiem, 3 Pytajnik, 4 Pytajnik w dymku, 5 Krąg graczy, 6 Wskazany, 7 Pytajnik na kolorze, 8 Jasna, 9 MLT, 10 Kto?) na Androidzie i iPhonie w prawdziwej wielkości, z bliska, w karcie przeglądarki; podpis pod ikoną N1 „Most Likely To”, N2 „Most Likely”, N3 „Kto z nas?”. Kolory z gry: tło `#1a1a1a`, jasny `#d9d9d9`, kolory graczy (terakota, szałwiowy, musztardowy, łupkowy). **Czeka na wybór Karola**, potem `/10x-plan home-screen-icon`.
