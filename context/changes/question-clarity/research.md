---
date: 2026-11-22T22:22:36+01:00
researcher: Claude (Opus 5.5) z Karolem
git_commit: 09f2b52
branch: question-clarity
repository: most-likely-to
topic: "Przegląd brzmienia 960 pytań bazy po pierwszej grze ze znajomymi"
tags: [research, questions, question-base, adult-flag]
status: complete
last_updated: 2026-11-22
last_updated_by: Claude (Opus 5.5)
---

# Research: przegląd brzmienia pytań bazy (S-28)

**Date**: 2026-11-22T22:22:36+01:00
**Researcher**: Claude (Opus 5.5) z Karolem
**Git Commit**: 09f2b52
**Branch**: question-clarity
**Repository**: most-likely-to

## Research Question

Które z 960 pytań `src/data/questions.ts` gracz musi zgadywać (ukryte nawiązanie, słowo zmieniające sens; wzór `znane-gry-024` z gry 2026-11-22) i jakie inne problemy ma baza (powtórki, za długie, zła kategoria lub 18+, raniące, płaskie)? Wynik: krótka lista do wyboru przez Karola, z nowym brzmieniem (`change.md`).

## Summary

- Baza jest w dobrym stanie: prawdziwych zacięć w brzmieniu jest **16** (lista A), każde da się poprawić **bez zmiany sensu**, więc z tym samym numerem (`src/data/questions.ts:9`).
- Największa grupa to **znacznik 18+**: 23 pytania o samym zauroczeniu mają 18+, choć reguła bazy mówi, że niewinny romans nie jest 18+ (`src/data/questions.ts:17-19`). Przed zmianą trzeba potwierdzić jedną regułę: czy „randka = 18+” obowiązuje dosłownie (lista B).
- **Powtórek nie przerabiamy teraz**: przeróbka to nowa sytuacja, czyli nowy numer, a gra nie umie wycofać starego numeru z losowania. 14 par z tej samej kategorii warto wymienić, gdy powstanie wycofywanie (lista C).
- Pytań raniących nie znaleziono. Przesycone tematy: zasypianie (~17 pytań w 7 kategoriach) i kłótnie (~15).
- Zmiana tekstu nie zmienia bazy danych. Zmiana znacznika 18+ zmienia stan bazy, więc to `npm run questions:migration` i `db push` przed scaleniem (`src/data/questions.ts:20-23`).

## Detailed Findings

### Jak powstała lista

Trzech redaktorów (agentów) przejrzało po 320 pytań (grupy kategorii), czwarty szukał powtórek w całej bazie, a niezależny krytyk sprawdził każde zgłoszenie z obecnym tekstem i regułą 18+ z nagłówka pliku. Zgłoszeń: 39 brzmienia, 29 znacznika 18+, 60 par powtórek. Krytyk przepuścił 15 (+ `znane-gry-024` z gry), 18 (+5 własnych), 34 pary (z tego 0 do zrobienia teraz).

Uwaga o procesie: w poleceniu dla redaktorów reguła 18+ była błędnie zawężona do „randkowania z podtekstem”; krytyk dostał regułę z pliku dosłownie i według niej rozstrzygał. Krytyk odrzucił `znane-gry-024` jako „znany mem”, ale to pytanie zacięło prawdziwą graczkę na grze 2026-11-22, więc zostaje na liście (dowód z gry wygrywa z opinią).

### A. Brzmienie: 16 poprawek, ten sam sens, ten sam numer

| id                           | obecnie                                                                | nowe brzmienie (znaki)                                                                 | dlaczego                                                         |
| ---------------------------- | ---------------------------------------------------------------------- | -------------------------------------------------------------------------------------- | ---------------------------------------------------------------- |
| znane-gry-024                | trafiłby pilotem od Wii w telewizor                                    | zamachnąłby się przy grze na Wii tak, że pilot wyleciał mu z ręki w telewizor (77)     | z gry: „trafiłby” brzmi jak celny rzut, anegdota nieopisana      |
| wpadki-i-obciach-041         | odpowiedziałby komuś, kto rozmawiał przez słuchawkę z kimś innym       | odpowiedziałby komuś, kto w słuchawkach rozmawiał z kimś innym (62)                    | „słuchawka” to też słuchawka telefonu w ręce                     |
| wpadki-i-obciach-064         | klaskałby w filharmonii między częściami utworu                        | klaskałby w filharmonii, zanim utwór naprawdę się skończy (57)                         | kto nie zna etykiety, nie widzi wpadki                           |
| gry-i-internet-016           | przegapiłby wesele kuzyna, bo był w środku rajdu                       | przegapiłby wesele kuzyna, bo był w środku rajdu w grze online (62)                    | „rajd” = wyścig samochodowy dla niegrających                     |
| gry-i-internet-056           | wciągnąłby kogoś w swoją grę, a ten ograłby go po tygodniu             | namówiłby kogoś na swoją ulubioną grę, a po tygodniu już z nim przegrywał (73)         | „wciągnąć w swoją grę” = intryga; „ten… go” się plącze           |
| gry-i-internet-065           | ustawiłby limit czasu na telefonie i wyłączał go co wieczór            | ustawiłby limit czasu na telefonie i co wieczór klikał „ignoruj limit” (70)            | „go” = telefon odwraca żart                                      |
| gry-i-internet-075 (18+)     | wrzuciłby na Tindera zdjęcie sprzed dziesięciu lat                     | wrzuciłby na Tindera zdjęcie sprzed pięciu lat (46)                                    | dziesięć lat temu gracz był dzieckiem                            |
| praca-i-szkola-004           | odpowiedziałby „do wszystkich” na maila do jednej osoby                | odpowiedziałby „do wszystkich” wiadomością, która była tylko dla jednej osoby (77)     | mail do jednej osoby nie ma „wszystkich”                         |
| znane-gry-070                | kłóciłby się w Activity, że gest wcale nie był podpowiedzią            | kłóciłby się w Activity, że gest przy opisywaniu hasła wcale nie był podpowiedzią (81) | w pantomimie gest to cała gra                                    |
| znane-gry-075 (18+)          | wybierałby w każdej grze drużynowej parę z osobą, która mu się podoba  | dobierałby sobie w każdej grze do pary osobę, która mu się podoba (65)                 | „wybierać parę z osobą” nie brzmi po polsku; też w B (zdjąć 18+) |
| popkultura-057               | przechodziłby na drugą stronę ulicy na widok klauna po obejrzeniu „To” | przechodziłby na drugą stronę ulicy na widok klauna po obejrzeniu horroru „To” (78)    | na głos „To” brzmi jak „tego”                                    |
| popkultura-077 (18+)         | bawiłby się na weselu jak bohaterowie „Wesela” Smarzowskiego           | bawiłby się na weselu do upadłego jak bohaterowie „Wesela” Smarzowskiego (72)          | kto nie widział filmu, nie wie, jak się bawią                    |
| podroze-i-przygody-012       | przespałby noc na szczycie, żeby zobaczyć wschód słońca                | nocowałby na szczycie, żeby zobaczyć wschód słońca (50)                                | „przespałby” = też „przegapiłby przez sen”                       |
| podroze-i-przygody-020       | pojechałby na lotnisko w złym dniu                                     | pojechałby na lotnisko nie tego dnia, co trzeba (47)                                   | „zły dzień” to pech, nie pomylona data                           |
| podroze-i-przygody-063       | kupiłby na wycieczce zestaw garnków z pokazu                           | kupiłby na darmowej wycieczce z pokazem cały zestaw garnków (59)                       | „z pokazu” mętne; nowe nazywa znany motyw                        |
| pieniadze-i-zakupy-038 (18+) | zrzucałby się z kumplami na beczkę piwa jak na inwestycję              | zrzucałby się z kumplami na beczkę piwa i nazywał to inwestycją (63)                   | puenta ginie w „jak na inwestycję”                               |

Liczby znaków policzył krytyk (`znane-gry-024`: policzone w sesji, 77). W `tests/unit/` nie znalazłem testu, który pilnuje limitu 90 znaków ani reszty zasad tekstu (sprawdzone: `draw.test.ts`, `question-base-snapshot.test.ts`, `room-state.test.ts`), więc plan musi te zasady sprawdzić sam.

### B. Znacznik 18+

Reguła (`src/data/questions.ts:17-19`): 18+ = dwuznaczność, alkohol, **randki (dating)**, hazard; niewinny romans (zauroczenie, rocznica, oświadczyny, ślub) nie jest sam w sobie 18+.

- **Zdjąć 18+ (23, samo zauroczenie):** na-co-dzien-071, na-co-dzien-079, imprezy-074, przyszlosc-021, przyszlosc-074, gry-i-internet-023, gry-i-internet-071, gry-i-internet-072, gry-i-internet-074, gry-i-internet-079, znane-gry-072, znane-gry-075, popkultura-033, popkultura-039, popkultura-075, popkultura-079, popkultura-080, podroze-i-przygody-026, zwierzeta-i-dom-040, sport-i-wyzwania-022, zwierzeta-i-dom-036, praca-i-szkola-073, praca-i-szkola-074.
- **Zostawić 18+ (randka, 11):** gry-i-internet-075, gry-i-internet-076, znane-gry-039, znane-gry-080, popkultura-074, sport-i-wyzwania-025, sport-i-wyzwania-039, sport-i-wyzwania-073, jedzenie-i-gotowanie-032, pieniadze-i-zakupy-033, pieniadze-i-zakupy-037.
- **Do decyzji (6):** znane-gry-074 i jedzenie-i-gotowanie-039 (prawie randka; krytyk skłania się zostawić), znane-gry-034 (Simsy z crushem), na-co-dzien-072 (18+ tylko z domysłu, kto przychodzi), przyszlosc-022 (rozwody), przyszlosc-026 (powrót do ex).
- **Niespójność:** randki-i-zwiazki-005 („…po pierwszej randce”) nie ma 18+, choć reguła mówi „randka = 18+”. Albo nadać 18+, albo „randce” → „spotkaniu” (58 znaków, ten sam sens).
- **Skutek:** zdjęcie 23 znaczników powiększa pulę gier bez 18+ i odchudza pulę 18+ w kategoriach, gdzie jest jej mało (10–20 na kategorię); alternatywa „dopisać podtekst” to zmiana sensu, czyli nowy numer.

### C. Powtórki: nic teraz, 14 par na później

Para z tej samej kategorii częściej trafia do jednej gry; przeróbka zmienia sytuację, więc wymaga nowego numeru i wycofania starego, a wycofywania w grze nie ma (`src/data/questions.ts:8-9`). Krytyk: dziś żadna para nie jest warta nowego numeru. Gdy powstanie wycofywanie (S-12 albo osobna zmiana), warte wymiany (nowy numer za pytanie po strzałce; propozycje szukacza powtórek, oceny krytyka w nawiasie):

- sport-i-wyzwania-001 ~ 020 → „trenowałby do triathlonu, a w dniu startu pomylił kolejność dyscyplin” (dobra)
- sport-i-wyzwania-002 ~ 012 → „zapisałby się na kurs surfingu nad Bałtykiem w listopadzie” (dobra)
- sport-i-wyzwania-003 ~ 016 → „wymyśliłby dla nas wyzwanie, którego sam nie dałby rady zrobić” (przeciętna)
- sport-i-wyzwania-011 ~ 032 → „grałby w szachy z komputerem i cofał każdy ruch” (dobra)
- sport-i-wyzwania-065 ~ 054 → „wszedłby na ściankę wspinaczkową i bał się z niej zejść” (dobra)
- znane-gry-010 ~ 028 → „zapominałby w Uno krzyknąć „uno” i ciągnął karty za każdym razem” (dobra)
- znane-gry-033 ~ 079 → „rzucałby w Dark Souls przy każdym zgonie przekleństwem w innym języku” (słaba: bez alkoholu znika powód 18+)
- wpadki-i-obciach-032 ~ 029 → „przewróciłby w sklepie piramidę z puszek, sięgając po tę na samym dole” (dobra)
- wpadki-i-obciach-004 ~ 028 → „odebrałby telefon od szefa z pełną buzią i odpowiadał samym mruczeniem” (dobra)
- wpadki-i-obciach-079 ~ 023 → „przedstawiłby rodzicom sympatię, z którą był na jednej randce” (dobra, 18+ zostaje)
- popkultura-031 ~ 073 ~ 071 → „omawiałby z przyjaciółmi randki przy brunchu jak w „Seksie w wielkim mieście”” (dobra)
- podroze-i-przygody-072 ~ 039 → „umówiłby się na wakacjach na randkę i przyprowadził na nią całą naszą ekipę” (dobra)
- podroze-i-przygody-071 ~ 025 → „wracałby po imprezie do hotelu z mapą narysowaną na serwetce” (dobra)
- gry-i-internet-010 ~ 058 → „komentowałby na głos każdą swoją grę, jakby był na transmisji” (dobra)

20 dalszych par: zostawić obie (różne pule lub inna puenta).

### D. Odrzucone przez krytyka (25 brzmienia, 26 par)

Między innymi: na-co-dzien-002, przyszlosc-058, wpadki-i-obciach-054, -069, gry-i-internet-004, -007, praca-i-szkola-009, znane-gry-045, -060, popkultura-012, -024, -056, -060, podroze-i-przygody-056, -077, sport-i-wyzwania-066, jedzenie-i-gotowanie-024, randki-i-zwiazki-012, -017, -029, pieniadze-i-zakupy-023 (zrozumiałe albo kategoria zakłada znajomość gry; kilka propozycji zmieniało sens).

## Code References

- `src/data/questions.ts:5-9` – numer pytania stały; literówka zachowuje numer, zmiana sensu to nowy numer; wpisów się nie usuwa.
- `src/data/questions.ts:14-16` – zasady tekstu (mała litera, bez „?”, tryb przypuszczający, ≤ 90 znaków).
- `src/data/questions.ts:17-19` – reguła 18+.
- `src/data/questions.ts:20-23` – po zmianie `npm run questions:migration`, migawka w tym samym PR, `db push` przed scaleniem; migawka trzyma numer, kategorię i 18+, nie tekst (`scripts/question-base-migration.mjs:1-6`).
- `src/data/questions.ts:2628` – `znane-gry-024`.

## Architecture Insights

- Tekst pytań żyje tylko w Workerze; baza zna numer, kategorię i 18+. Zmiana samego tekstu = bez migracji; zmiana 18+ = migracja i `db push` przed scaleniem (pełny cykl według `sesja-gry.md`).
- S-27 (`english-version`) Faza 3 tłumaczy te same numery na angielski, więc poprawki brzmienia i 18+ powinny wejść przed nią.

## Historical Context (from prior changes)

- `2481724` (baza do 960 pytań): niezależny krytyk naniósł już 70 poprawek (gramatyka, powtórki szablonów, wykluczające pytania, słabe 18+, nostalgia), stąd mało zacięć w obecnej bazie.

## Related Research

- `context/changes/english-version/plan.md` (Faza 3, tłumaczenie pytań).

## Open Questions (decyzje Karola)

1. Lista A: wszystkie 16 poprawek, czy wybrane?
2. Reguła 18+: czy „randka = 18+” obowiązuje dosłownie? Od tego zależy 11 pozycji „zostawić”, randki-i-zwiazki-005 i część „do decyzji”.
3. Lista B: zdjąć 18+ z 23 pytań o samym zauroczeniu? I co z 6 „do decyzji”?
4. Powtórki: zgoda, że czekają na wycofywanie numerów (bez pracy teraz)?

## Decyzje Karola (2026-11-23)

1. **Lista A:** wszystkie 16 poprawek brzmienia, „wstępnie” (Karol może jeszcze wrócić do pojedynczych przy planie).
   - **Ostatecznie (23.11, plan 1.5): 14 poprawek.** `podroze-i-przygody-063` („było lepsze wcześniej”) i `gry-i-internet-075` („nie było złe wcześniej”) zostają w starym brzmieniu. `znane-gry-024` z listy A „nie brzmi polsko” („wyleciał mu z ręki w telewizor”). Karol wybrał zamiast tego: „zamachnąłby się przy grze na Wii tak mocno, że pilot poleciałby prosto w telewizor” (82 znaki). Pozostałe 13 jak w liście A.
2. **Reguła 18+ zmieniona:** najpierw „randka = 18+ dosłownie”, potem (po 6 „do decyzji”, z których Karol żadnego nie uznał za 18+) korekta: **sama randka nie jest 18+**. 18+ = dwuznaczność, alkohol, hazard, **aplikacje randkowe** („Tinder generalnie do 18+”). Do poprawy nagłówek `src/data/questions.ts:17-19`. `randki-i-zwiazki-005` zostaje bez zmiany słów i bez 18+.
3. **Zdjąć 18+ z 39 pytań:** 23 o samym zauroczeniu (lista B), wszystkie 6 „do decyzji” (`znane-gry-074`, `jedzenie-i-gotowanie-039`, `znane-gry-034`, `na-co-dzien-072`, `przyszlosc-022`, `przyszlosc-026`) i 10 z 11 „randka” (bez `gry-i-internet-075`, Tinder, zostaje 18+). Dziś 241 pytań 18+, po zmianie 202; zwykła pula z 719 do 758. Plan sprawdza pozostałe pytania 18+ według nowej reguły (każde musi mieć jeden z czterech powodów).
4. **Powtórki: zostają wszystkie 14 par, bez pracy także później.** Karol: inna gra albo inny film to inna odpowiedź i „smaczek” dla tego, kto go zna; para 1 (maraton / triathlon) „trochę powtórka”, ale inna sytuacja (zero treningu vs jeden trening).
5. **Granica 18+ łagodniej (wariant 1 z trzech, przy planie).** Karol: „mamy mocne zaostrzenie co do 18+, bo większość tych rzeczy dla przeciętnego gracza nie będzie w ogóle drastyczna”. 18+ dostaje tylko to, co naprawdę jest dla dorosłych: **upijanie się i gry alkoholowe, hazard na pieniądze, wyraźny podtekst (nagość, noc u kogoś), aplikacje randkowe**. Sama wzmianka o winie czy piwie, kac, pocałunek, ex i niewinny romans (z randką) trafiają do zwykłych. Odrzucone: „jak w planie” (każdy alkohol, hazard i podtekst zostaje 18+) i „najłagodniej” (18+ tylko podtekst i aplikacje). Dziś około 70 z 202 pozostałych pytań 18+ ma znacznik tylko przez alkohol. Listę z przeglądu pozostałych 202 według tej granicy Karol dostaje pogrupowaną tematami (decyzja 6, w planie).
