---
change_id: categories-unticked
title: Nowa gra bez zaznaczonych kategorii
status: implementing
created: 2026-11-21
updated: 2026-11-21
archived_at: null
---

## Notes

Punkt L kolejki gry (decyzja Karola z 21.11.2026; tego samego dnia przesunięty przed F, wersję angielską).

Dziś formularz nowej gry (`src/components/room/NewGameForm.tsx`) zaznacza na start wszystkie kategorie i host musi odznaczać te, których nie chce. Ma być odwrotnie: na start żadna kategoria nie jest zaznaczona, host sam zaznacza kwadraciki. Pytania 18+ dalej domyślnie wyłączone. Przy pustym wyborze jest już błąd „Wybierz co najmniej jedną kategorię”.

Zmienia to wcześniejsze ustalenie „wszystkie kategorie włączone, 18+ wyłączone” (wywiad do planu S-02, komentarz przy stanie `choices` w formularzu).

Lżejszy cykl (sam ekran, bez migracji, bez `src/lib/rooms/` i `src/pages/api/rooms/`). E2e i smoke zakładają grę przez trasę za „Załóż grę”, bez klikania w formularz, więc gotowego zaznaczenia nie potrzebują; do sprawdzenia przy planie podglądy w `/dev/room-states`.

## Decyzje Karola

- 21.11.2026, Faza 1 (galeria skrótu, zrzuty telefonu i laptopa): **W1**, guzik `link` w rozmiarze `sm` po prawej, w jednej linii z „Kategorie pytań”. Uwag brak. W2 (link pod zdaniem o 18+) i W3 (kafelek „Wszystkie kategorie” z kreską „częściowo”) odpadają, więc `Checkbox` zostaje bez stanu częściowego.

## Odstępstwa od planu (Faza 2)

- Fokus po „Załóż grę” bez kategorii zostaje na selektorze `[data-slot="checkbox"]`. Plan zmieniał go na `[name="category"]` tylko z powodu W3. Przy W1 pierwszy kwadracik formularza to pierwsza kategoria. `name` z Radix trafia też tylko do ukrytego pola formularza, nie do kwadracika, więc `[name="category"]` złapałby niewidoczne pole.
- Stan 3 w `/dev/room-states` (za długi nick) startuje z dwiema kategoriami, jak 6 i 7. Inaczej po pustym starcie pokazywałby też błąd kategorii.
- W macierzy `/dev/ui-kitchen-sink` wiersz guzika `link` już jest („Twoje gry” w historii gry, też w rozmiarze `sm`). Dopisane tylko miejsce „Zaznacz wszystkie”.
