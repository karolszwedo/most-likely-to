---
change_id: reveal-ui
title: Wygląd ekranu odsłony wyniku
status: impl_reviewed
created: 2026-11-15
updated: 2026-11-16
archived_at: null
---

## Notes

Zmiana `/10x-ui`, punkt 3 kolejki przed wieczorem z ekipą (`C:\Users\karol\Documents\sesja-gry.md`, decyzja Karola 15.11): odsłona wyniku to kulminacja gry, więc jest pierwszym z dwóch ekranów (drugi, strona wejścia z linku, dostanie osobną zmianę).

- **Jeden widok:** odsłona wyniku w pokoju `/r/[id]`: `src/components/room/RoundReveal.tsx` z częściami, których używa na tym ekranie (`RoundQuestion`, `RoundCounter`, `QuestionReaction`, `HostActions` w pasku, `chart-colors.ts`, `src/lib/rooms/chart.ts`). Inne ekrany pokoju (poczekalnia, głosowanie, pominięte pytanie, koniec wieczoru) poza zakresem, chyba że research pokaże wspólny komponent, który odsłona musi z nimi dzielić.
- **Wariant kontraktu:** istniejący system projektowy. Tokeny w `src/styles/global.css` (`:root`, `.dark`, `@theme inline`; aplikacja zawsze ciemna; kolory graczy `--chart-1` … `--chart-20`), komponenty shadcn w `src/components/ui`, zasady w `AGENTS.md` §UI, szerokości w `src/components/room/room-frame.ts`, kontrola literałów `scripts/ui-literals.mjs` w `npm run lint` (obejmuje już `src/components/room/`), podglądy stanów na `/dev/room-states` i okna na `/dev/room-window`.
- **Audyt wstępny 15.11:** 0 literałów w plikach odsłony (skan z `/10x-ui`). Problem nie leży w kolorach, tylko w hierarchii i komponentach. Kandydaci na zarzuty do `/10x-research`: (1) osoba z największą liczbą głosów jest tylko pogrubiona w tabeli, a nagłówek „Wynik” ma `text-sm` (`RoundReveal.tsx:118-119`); (2) przełącznik „Koło / Paski” (`:122`) i tabela (`:147`) złożone ręcznie, w `src/components/ui` brak `table` i `toggle-group`; (3) wszyscy się wstrzymali: prawdopodobnie tabela samych zer, bez stanu pustego (`chart.ts:18`); (4) brak momentu odsłony, ekran głosowania po prostu się podmienia (`prefers-reduced-motion` do uszanowania).
- **Granice z PRD i AGENTS.md:** bez punktów, rankingów i timerów; odsłona pokazuje tylko liczby głosów na osobę i liczbę wstrzymań, nigdy „kto na kogo”. Wcześniejsze decyzje Karola zostają, chyba że sam zdecyduje inaczej na zrzutach: zawsze liczby, także po jednym głosie (D3, `context/archive/2026-10-13-first-live-round/`), przełącznik „Koło / Paski” tylko na ekranie tego gracza, kolor gracza z `players.color`, układ od `lg` z kołem obok tabeli i paskiem prowadzącego (`context/archive/2026-10-15-room-wide-layout/`).
- **Wybór Karola z galerii (15.11.2026, zrzuty laptop 1280×600 1:1 i telefon 390 px; sekcje galerii 1–6):**
  - 1–3 wygląd wyniku: **„dziś”** (A „Reflektor”, B wyróżniony wiersz, C duże paski odrzucone): Z1 zostaje jak dziś;
  - 4 nikt nikogo nie wskazał: **„dziś”**, bez zdania (E1–E3 odrzucone): Z2 zostaje jak dziś;
  - 5 link dla graczy u prowadzącego na odsłonie: **zwinięty w jedną linijkę** (etykieta, niskie pole, „Kopiuj” jako przycisk ghost `sm`; w poczekalni i głosowaniu jak dziś): Z5 do zrobienia;
  - 6 ruch przy odsłonie (Z3): **tak, w tej postaci** (decyzja Karola 15.11.2026 po drugim pokazie w Chrome z przyciskiem „Powtórz ruch”: „może być taka animacja”). Ruch z prototypu: koło `fade-in zoom-in-50 spin-in-45` 700 ms z opóźnieniem 300 ms, tabela `fade-in slide-in-from-bottom-2` 500 ms z opóźnieniem 500 ms, paski `slide-in-from-left` 1000 ms z opóźnieniem 300 ms; wszystko pod `motion-safe`. Pierwszy pokaz „nie działał”, bo ruch grał raz przy otwarciu strony galerii, zanim Karol przewinął do sekcji 6 (animacje w Windows są włączone).
  - Prototyp wariantów leży lokalnie, bez commita: `src/components/room/reveal-prototype.tsx` + parametry `?v=&empty=&link=compact&motion=1` w `/dev/room-window` (zmiany w `RoundReveal`, `RoomScreen`, `PlayerLink`); plan ma go usunąć i zostawić tylko wybrany zwinięty link.
- **Proces wyglądu (jak przy `room-wide-layout`):** po researchu galeria 3–4 wariantów na tymczasowej stronie podglądów z prawdziwymi komponentami gry; zrzuty: laptop jako całe okno gry 1:1, telefon w prawdziwej wielkości, strona „Co oceniasz” w Chrome Karola. Karol wybiera (albo miesza), dopiero potem plan i kod gry.
- **Wdrożenie (2026-11-15):** PR #64 scalony (`25345d7`), Workers Builds i smoke na produkcji zielone; próbny alarm `4b75947` trafił dokładnie w 2 przewidziane asercje `round.spec.ts` (revert `b569d7a`, wpis w test-planie §6.4 `6ce4fc5`). Bez bazy i bez zmian w Workerze.
- **Czeka na grę (2026-11-16):** ręczne 3.5 (telefon + laptop) Karol robi przy najbliższej grze; to domyślny stan zmian, termin poda sam. Po 3.5 `/10x-archive reveal-ui`.
