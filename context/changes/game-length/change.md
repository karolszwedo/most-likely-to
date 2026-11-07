---
change_id: game-length
title: Długość gry widoczna dla wszystkich i koniec po ostatnim pytaniu
status: implementing
created: 2026-11-07
updated: 2026-11-07
archived_at: null
---

## Notes

Skąd to się wzięło: Karol po grach ze znajomymi miał wrażenie, że pytań jest dziwnie dużo, poczekalnia pokazuje tylko część, a w grze nie ma końca. Sprawdzone w kodzie 07.11: „Przejrzyj pytania” pokazuje 15 pytań, a po ostatnim z listy gra po cichu losuje dalej z wybranych kategorii, aż skończą się wszystkie (w bazie 216 pytań) albo prowadzący zakończy grę. Bez otwarcia listy tak samo od pierwszego pytania. Nigdzie nie ma licznika. To nie usterka: decyzja „wieczór się nie urywa” z S-06 (D1 z S-03), tylko bez znaku na ekranie.

Decyzje Karola (07.11), opcja B:

- przy każdym pytaniu widać, które to pytanie i ile ich jest: „Pytanie 7 z 15”;
- w poczekalni widać, ile pytań ma gra, a liczba zmienia się od razu, gdy host usunie, dolosuje albo doda pytanie;
- licznik widzą wszyscy gracze, nie tylko prowadzący; gracz dostaje samą liczbę, nigdy treści listy;
- każda gra ma domyślnie 15 pytań, także gdy nikt nie otworzy listy;
- zatwierdzona propozycja gracza dodaje jedno pytanie („z 16”);
- po ostatnim pytaniu prowadzący wybiera „Zakończ grę” albo „Jeszcze 5 pytań”, a licznik idzie dalej („Pytanie 16 z 20”).

Liczba dla wszystkich graczy wymaga migracji: `room_lobby` daje dziś liczby listy tylko prowadzącym. `db push` z domu albo hotspotu, nie z eduroam. Wygląd ekranów wybiera Karol na zrzutach.

Wygląd z Fazy 3 (wybór Karola na zrzutach, 2026-11-07):

- Poczekalnia 1C z tekstem Karola: szara pigułka pod podtytułem „Liczba pytań: 15”, dla każdej roli.
- Licznik przy pytaniu 2A: mała szara linijka „Pytanie 7 z 15” nad tytułem, w głosowaniu, na wyniku i po pominięciu.
- Prowadzący po ostatnim pytaniu 3B: główny (jasny) „Zakończ grę”, obok drugi „Jeszcze 5 pytań”.
- Gracz bez roli po ostatnim pytaniu G2: szare zdanie pod pytaniem „To było ostatnie pytanie. Prowadzący zdecyduje, czy gramy dalej.”
