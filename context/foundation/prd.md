---
project: "Most Likely To"
version: 1
status: draft
created: 2026-09-20
context_type: greenfield
product_type: web-app
target_scale:
  users: medium
  qps: low
  data_volume: small
timeline_budget:
  mvp_weeks: 8
  hard_deadline: null
  after_hours_only: true
---

# Most Likely To — PRD

## Vision & Problem Statement

Ekipa znajomych umawia się na godzinę na Discordzie, żeby zagrać w „Kto z nas najprawdopodobniej…". Jedyne narzędzie, jakie host widział, to Google Forms: ankietę trzeba zbudować ręcznie, za każdym razem od zera, a pytania dopisywać samemu; zajmuje to godziny. Ciężar spada na jedną osobę, a gdy ona nie ma czasu, gra się nie odbywa. Dotychczasowa forma: kumpel wysyła link do ankiety, każdy wypełnia ją w swoim czasie, po tygodniu ekipa zbiera się i czyta odpowiedzi. Ankieta asynchroniczna nie pasuje do wspólnego grania na żywo z odsłoną i rozmową.

Hipoteza hosta (niezweryfikowana wobec istniejących aplikacji, patrz Open Questions): to, czego brakuje, to wspólna runda na żywo (każdy z telefonem, rozmowa na Discordzie, wypełnianie w czasie rzeczywistym, rozmowa od razu, jak kalambury przy stole), pula pytań z kategoriami i własnymi pytaniami ekipy, która zostaje między wieczorami, oraz dobór pytań uczący się z rozgrywki. Produkt nie zakłada więcej niż około stu użytkowników; zanim do tego dojdzie, host chce na nowo przemyśleć sens i skalę gry, świadomie poza v1.

## User & Persona

**Host** (główna persona) — osoba organizująca wieczór dla swojej ekipy znajomych; dowolna ekipa, nie tylko ekipa autora. Kontekst: 3+ osób na Discordzie, telefony w rękach, około godziny. Moment: „zagrajmy w coś" — host chce w minutę mieć gotową grę, bez budowania ankiety.

### Secondary persona

**Gość** — uczestnik bez konta; wchodzi linkiem, wpisuje nick, głosuje, proponuje pytania.

## Success Criteria

### Primary

- Host zakłada grę (logowanie → kategorie → link) w mniej niż 5 minut.
- Ekipa rozgrywa co najmniej 10 pytań w jednym wieczorze bez awarii i bez sięgania po Google Forms.

### Secondary

- Goście sami dodali własne pytania w trakcie wieczoru.
- Po 3 wieczorach pytania są zauważalnie lepsze (ekipa to czuje).
- Ktoś spoza ekipy autora zagrał i dał feedback, że to fajne.

### Guardrails

- Runda przeżywa odświeżenie strony i wypadnięcie gracza; gracz wraca na swój nick, gra idzie dalej.
- Gość dołącza w mniej niż 30 sekund bez instrukcji.
- O gościu nie zostaje nic poza nickiem i głosami; host może skasować historię.
- Działa na telefonie w przeglądarce, bez instalacji.

## User Stories

Główna ścieżka MVP (v1, zablokowana w sesji kształtowania):

1. Host otwiera stronę, loguje się jednym kliknięciem.
2. Host klika „nowa gra", wybiera kategorie pytań.
3. Host dostaje link do pokoju, wkleja go na Discordzie.
4. Host widzi, jak goście dołączają; klika „start".
5. Gość otwiera link na telefonie, wpisuje nick, jest w pokoju.
6. Na ekranach pojawia się pytanie.
7. Każdy wskazuje osobę z listy nicków (albo pomija).
8. Po zebraniu głosów albo gdy prowadzący przewinie: odsłona (kto ile głosów).
9. Następne pytanie. Po ostatnim: koniec wieczoru (bez punktacji).

Zakres v1: logowanie hosta, pokój, runda, kategorie, opcjonalny przegląd listy pytań przed startem, propozycje gości z zatwierdzaniem, dobór uczący się z rozgrywki, współhost, minimalna lista własnych gier z kasowaniem. Do v2: pełna historia wieczorów w panelu, panel weryfikacji dla twórcy gry. Nick przypięty w przeglądarce wszedł do v1 jako dodatek (FR-024, decyzja hosta 2026-10-25), a wybór koloru przez gracza też (FR-025, decyzja hosta 2026-10-31). Koszt czasu: 8 tygodni pracy po godzinach, zaakceptowany 2026-09-19 (szacunek roboczy, do rewizji po pierwszym kamieniu milowym: pokój + runda działają z 3 osobami).

### US-01: Ekipa rozgrywa pierwszą rundę

- **Given** zalogowany host stworzył pokój z wybranymi kategoriami i co najmniej 2 gości dołączyło nickiem
- **When** host klika „start"
- **Then** wszyscy widzą to samo pytanie; gdy wszyscy zagłosują (albo host przewinie), wszyscy widzą odsłonę z liczbą głosów na osobę, bez informacji kto na kogo

#### Acceptance Criteria

- Pytanie pochodzi tylko z wybranych kategorii (pytania 18+ tylko z tych, w których host je dołączył) i nie powtórzyło się w tej sesji
- Gość, który odświeży stronę w trakcie rundy, wraca na swój nick, widzi bieżące pytanie i swój oddany głos
- Przy 3 graczach odsłona następuje natychmiast po trzecim głosie; nie ma timera
- W trakcie rundy widać, kto już zagłosował, ale nigdy na kogo

## Functional Requirements

### Dostęp i role

- FR-001: Host can sign in with one click via an external provider, without registration or password; host identity is tied to the e-mail, so the same host can sign in through an alternative method (another provider or e-mail) when one is unavailable. Priority: must-have
  > Socratic: Counter-argument considered: "provider outage on game night or a host without an account at that provider locks the host out of their own pool." Resolution: amended; identity keyed by e-mail, at least one alternative sign-in path (second provider or e-mail).
- FR-002: Guest can join a room via its link by entering a nick, without an account; the room rejects a duplicate nick. Priority: must-have
  > Socratic: Counter-argument considered: "two guests with the same nick mix up votes; a leaked link lets a stranger in mid-game." Resolution: duplicate nick rejected (rare in practice — people pick individual nicks before the game); late joiners go through host admission (FR-020).
- FR-003: Host can grant and revoke the co-host role to a guest in the room. Priority: must-have
  > Socratic: Counter-argument considered: "co-host approving guest proposals puts someone else's decisions into the host's permanent pool." Resolution (after pool model): kept — approvals land only in this game's list, nothing permanent; the shared base is gated separately by the game creator (FR-021). Co-host: run rounds, approve proposals, admit latecomers, remove players.
- FR-004: Host or co-host can remove a player from the room; after removal the room gets a new link and the old one stops working. Priority: must-have
  > Socratic: Counter-argument considered: "removed player returns via the same link under a new nick; removal mid-round leaves dangling votes." Resolution: amended — new room link after removal (host hands it to newcomers). Votes on/by a removed player mid-round: rule not decided → Open Questions.
- FR-020: Latecomer can request to join a started game with a chosen nick; the request is visible to host and co-host on every screen, including mid-vote; once admitted, the latecomer sees the current round and votes from the next one. Priority: must-have
  > Socratic: Counter-argument considered: "21:30, the host is mid-round looking at the question, not at notifications; a latecomer spends five minutes on Discord asking to be let in." Resolution: amended — knock visible to both leaders everywhere; entry from the next round.

### Pokój i rozgrywka

- FR-005: Host can create a room, choose question categories for the game (and, for each chosen category, whether to include its 18+ questions), and get a shareable room link. Priority: must-have
  > Socratic: Counter-argument considered: "host picks two thin categories and the game ends after six questions; no count shown at selection." Resolution: kept as written; the question base will grow over a long time, showing counts is not needed.
  > Amendment 2026-09-27 (F-02 planning, game creator's decision): every question carries an 18+ flag, and the host decides per chosen category whether its 18+ questions are included.
- FR-006: Host or co-host can start the game, skip the current round, and end the game; a skipped question discards its votes without points and does not count toward question quality; ending the game requires a confirmation. Priority: must-have
  > Socratic: Counter-arguments considered: "skipping after some have voted wastes their votes and pollutes question data"; "an accidental 'end game' kills the evening." Resolution: both accepted — amended as above.
- FR-007: All players in the room see the current question at the same time. Priority: must-have
  > Socratic: Counter-argument considered: "a player on a slow connection sees the question seconds later and has less time to vote." Resolution: kept; there is no round timer (see FR-009), so delivery latency does not disadvantage anyone.
- FR-008: Player can vote for exactly one person from the nick list (including themselves) or abstain. Priority: must-have
  > Socratic: Counter-arguments considered: "self-vote skews results"; "abstain button pollutes data / is redundant without a timer." Resolution: self-vote explicitly allowed (it is part of the fun); abstain kept as an explicit choice.
- FR-009: Players see who has already voted (never for whom — votes are anonymous); reveal happens when everyone has voted or whenever host or co-host advances the round (players who did not vote simply do not vote), and shows how many votes each person received. Priority: must-have
  > Socratic: Counter-arguments considered: "counts without 'who voted for whom' cut the best part of the conversation"; "host advancing early causes arguments." Resolution: votes stay anonymous by rule (no 'who voted for whom', ever); host has full control and may advance at any time.
- FR-011: Player who refreshes the page or reconnects returns to their nick and the current round state, including a vote already cast; reclaiming a nick requires verification that it is the same person. Priority: must-have
  > Socratic: Counter-arguments considered: "someone else takes my nick while I am disconnected"; "reconnect without restoring the vote lets a player vote twice." Resolution: both accepted — amended as above; verification mechanism is a downstream choice.

_FR-010 (punktacja) usunięte w sesji kształtowania: w tej grze nie ma punktów; zabawą jest odsłona i rozmowa, nie ranking._

### Pula pytań

Model puli: wspólna baza pytań z kategoriami, kuratorowana przez twórcę gry; z niej losowana jest lista pytań na daną grę. Lista należy do tej jednej gry — host nie ma trwałej puli własnej w panelu.

- FR-012: Host can optionally review the drawn question list before starting the game (remove questions, draw more from the base, edit wording, add own questions); the default path is "start now" without reviewing; the list belongs to this game only. Priority: must-have
  > Socratic: Counter-argument considered: "Friday 20:00, six people waiting on Discord while the host spends 10 minutes polishing 15 questions — the 'game in under 5 minutes' criterion dies." Resolution: amended — review is optional, default is start now; a bad question mid-game is skipped (FR-006).
- FR-013: Guest can propose questions from the room link during the evening, up to a per-guest limit per game (number to be set). Priority: must-have
  > Socratic: Counter-argument considered: "one guest floods the queue with 12 proposals mid-round and the host clicks approve/reject instead of playing." Resolution: amended — per-guest limit per evening; exact number → Open Questions.
- FR-014: Host or co-host can approve or reject proposed questions; approved ones enter this game's question list. Priority: must-have
  > Socratic: Counter-argument considered: "an approved proposal lands behind 20 base questions and never gets played in a 12-round evening." Resolution: kept as written; where the approved question lands in the order is a downstream detail.
- FR-015: Game draws questions from the shared base in the selected categories only (18+ questions only from categories where the host included them), without repeats within a game and without questions played on the host's recent evenings. Priority: must-have
  > Socratic: Counter-argument considered: "60 questions in 3 categories, the same crew plays four Fridays in a row and after excluding recent evenings nothing is left to draw." Resolution: kept; host's view: the base is small at first and that is fine, it grows over time. Behaviour when fresh questions run out is not decided → Open Questions (non-blocking).
- FR-016: App records per-question play data that feeds the quality score, across all hosts' games: vote distribution (how concentrated), skips, post-round reactions, and removals from a game list by a host before start. Priority: must-have
  > Socratic: Counter-argument considered: "with no timer and the crew talking on Discord, 'time to vote' is noise (someone went for a beer), and four measures are four times the work of one." Resolution: amended — time to vote dropped from v1; only what the quality score uses is recorded.
- FR-017: Question selection prefers questions with a higher quality score computed from play data of all crews; a question with too few plays to be judged is drawn as neutral (or slightly favoured) until it has enough plays; a question that keeps being skipped, removed, or voted nonsensically stops being drawn and is set aside for the game creator to rework (feeds FR-021). Priority: must-have
  > Socratic: Counter-argument considered: "a new question gets three thumbs down because it landed on someone who took offence, the algorithm buries it forever, old 'good' questions play on repeat and new ones never get a chance." Resolution: amended — new questions get a chance before being judged; the play-count threshold is a downstream tuning detail.
- FR-018: Player can react to the question (thumb up / down) with a single tap on the reveal screen; the reaction is optional and never blocks the host from advancing. Priority: must-have
  > Socratic: Counter-argument considered: "after the reveal everyone laughs on Discord, nobody looks at the phone, the host taps 'next'; after ten evenings reactions cover 4% of rounds and the quality score has nothing to stand on." Resolution: amended — one tap on the reveal screen, non-blocking; host accepts that reactions will be sparse and the score also rests on skips and vote spread (FR-016).
- FR-019: Host can see a minimal list of their past games (date, number of questions, who played) and delete any of them; deletion removes everything tied to nicks (players, votes, results), while anonymous per-question aggregates stay in the shared base. Priority: must-have
  > Socratic: Counter-argument considered: "with no evening history in v1 it is unclear what 'delete an evening' even means; and if per-question play data already fed the shared quality score, either 'delete' rolls quality back or the button lies." Resolution: amended — a minimal game list enters v1 (full history stays v2); delete removes all person-linked data and says openly that anonymous question aggregates remain.
- FR-021: Game creator can review, after a game, the new questions it produced (approved guest proposals and the host's own additions or edits) and add each to the shared base under a category, or reject it. Priority: nice-to-have
  > Socratic: Counter-argument considered: "in v1 there is one creator, and a review panel is another screen inside an 8-week budget when a list to review outside the app would do." Resolution: downgraded to nice-to-have — in v1 the app sets new questions aside for review and the creator adds them to the base the same way the starting base is built (outside the UI); the in-app panel is v2.

### Dodatki

- FR-022: Players can see an end-of-evening summary with highlights such as "most voted tonight" and "nobody voted for X tonight"; no points and no ranking across evenings. Priority: nice-to-have
- FR-023: Player can send an emoji or gif reaction visible to the room during the evening; voice and text conversation stays on Discord. Priority: nice-to-have
- FR-024: The same browser suggests the nick its player used last time when they join a room or create a game; the player can change it before joining. Priority: nice-to-have
- FR-025: Each player picks their colour from the game's palette in the room; while the room has at most 20 players no two share a colour, a player who has not picked gets the first free one, and the same browser offers the colour its player picked last time. Priority: nice-to-have

## Non-Functional Requirements

- Oddany głos jest potwierdzony na ekranie gracza natychmiast; odsłona pojawia się u każdego gracza w pokoju w ciągu 2 s od ostatniego głosu albo przewinięcia przez prowadzącego.
- Gra działa w przeglądarce telefonu i komputera, w dwóch ostatnich głównych wersjach popularnych przeglądarek, bez instalowania czegokolwiek.
- Pokój z 20 graczami głosującymi równocześnie zachowuje się tak samo jak pokój z 3 graczami (brak limitu graczy; 20 to poziom, na którym to sprawdzamy).
- Gracz, który odświeży stronę albo straci połączenie, jest z powrotem w bieżącej rundzie na swoim nicku w mniej niż 10 s, bez pomocy hosta.
- O gościu nie zostaje nic poza nickiem i głosami; „kto na kogo głosował" nigdy nie jest pokazywane ani możliwe do odzyskania, także przez hosta i twórcę gry. Gwarancja dotyczy stanu po rundzie, logów i każdej roli w grze; świadomie przyjęte (decyzje 2026-10-13 i 2026-10-14): twórca gry, który w trakcie rundy podgląda bazę (przy rundzie przerwanej bez odsłony najwyżej ok. 13 h od startu gry, zanim zadanie sprzątające ją zamknie) albo przed rundą włącza szersze logowanie lub zmienia kod, technicznie mógłby zobaczyć głos; odsłona liczb razem z jawną listą „kto już zagłosował” ujawnia głos, gdy zagłosowała jedna osoba albo wszyscy wskazali tę samą.
- O hoście aplikacja przechowuje wyłącznie adres e-mail z logowania (tożsamość), bez innych danych osobowych.

Świadomie odrzucone przy zbieraniu: automatyczne kasowanie gier po 30 dniach (host kasuje sam, FR-019); zobowiązanie do braku przerw serwisowych w weekendowe wieczory.

## Business Logic

Aplikacja prowadzi rundę na żywo: pokazuje wszystkim to samo pytanie w tej samej chwili, zbiera od każdego jeden anonimowy głos i odsłania wynik w momencie, gdy zagłosuje ostatnia osoba (albo prowadzący przewinie), tak żeby rozmowa o wyniku działa się od razu na Discordzie, a nie tydzień później po zebraniu ankiet.

**Wejście i wyjście.** Wejściem są lista nicków w pokoju i głosy graczy (jeden głos na osobę z listy albo wstrzymanie się; głos na siebie dozwolony). Wyjściem jest odsłona „ile głosów na kogo" (nigdy „kto na kogo") i przejście do następnego pytania. Ekipa spotyka się z tą regułą w każdej rundzie, od „start" do „koniec wieczoru"; w trakcie widać, kto już zagłosował, żeby wiadomo było, na kogo się czeka. Dotychczasowa forma (link do ankiety, każdy wypełnia w swoim czasie, spotkanie po tygodniu) jest tym, co ta reguła zastępuje.

**Reguła pomocnicza: dobór pytań uczący się z rozgrywek.** Kolejne pytanie pochodzi z kategorii wybranych przez hosta, nie powtarza się w tej grze ani z ostatnich wieczorów tej ekipy, a częściej padają pytania, które dobrze zagrały u wszystkich ekip (mało pominięć, kciuki w górę, głosy skupione na jednej osobie), rzadziej te, które grały słabo. Nowe pytanie dostaje szansę, zanim zostanie ocenione. Pytanie, które jest stale pomijane, usuwane z list przez hostów albo głosowane „bez sensu", przestaje się pojawiać i trafia do twórcy gry na warsztat. Gra ulepsza się więc dzięki rozgrywkom innych ludzi, nie tylko własnej ekipy. Wagi sygnałów, progi „za mało zagrań" i „wycofać" są do ustalenia po pierwszych wieczorach (Open Questions).

## Access Control

- **Twórca gry** (operator) — buduje i kuratoruje wspólną bazę pytań z kategoriami, z której losują wszyscy hości; po każdym wieczorze weryfikuje nowe pytania (zatwierdzone propozycje gości i własne pytania hosta) i dołącza je do bazy albo odrzuca. Jedna osoba w MVP (autor).
- **Host** — loguje się bez rejestracji i hasła; do wyboru kilka sposobów logowania jednym kliknięciem, zależnie od preferencji osoby (konkretna lista dostawców to decyzja późniejsza, poza PRD). Host jest właścicielem swoich gier: wybiera kategorie, przegląda i poprawia listę pytań na dany wieczór przed startem, ma minimalną listę swoich gier (pełna historia w v2) i prawo skasowania swoich danych. Nie ma trwałej puli własnej — pytania dopisane przez hosta żyją w tej grze, a potem trafiają do weryfikacji twórcy.
- **Współhost** — gość, któremu host w pokoju nadaje uprawnienia prowadzenia: start gry, odsłona wyniku, następne pytanie, pominięcie rundy i zakończenie gry (z tym samym potwierdzeniem co u hosta), zatwierdzanie propozycji (trafiają tylko do listy tej gry, więc nic trwałego nie psuje), wpuszczanie spóźnionych, usunięcie gracza z pokoju. Nie ma dostępu do panelu hosta ani do listy pytań gry. Cel: wieczór nie umiera, gdy host wyjdzie.
  > Uzupełnienie 2026-10-27 (S-07, decyzje twórcy gry): współhostów może być wielu; współhostem może zostać każdy gość w pokoju, także wpuszczony spóźniony, nigdy host; rolę nadaje i odbiera tylko host; współhost kończy grę jak host; link dla graczy widzi tylko host.
- **Gość** — wchodzi linkiem do pokoju, wpisuje nick, bez konta. Może głosować, pomijać, proponować pytania. Tożsamość żyje w tej sesji.
- **Niezalogowany na trasie hosta** (panel, tworzenie pokoju) → przekierowanie do logowania. Link do pokoju działa bez logowania.
- Dodatek v1 (FR-024, decyzja hosta 2026-10-25): nick „przypięty" w przeglądarce, żeby ten sam telefon proponował ten sam nick następnym razem.
- Dodatek v1 (FR-025, decyzja hosta 2026-10-31): każdy gracz, host też, sam wybiera swój kolor z palety gry w poczekalni i w trakcie gry; do 20 graczy kolory się nie powtarzają, kto nie wybierze, dostaje pierwszy wolny, a ten sam telefon proponuje kolor wybrany ostatnio.

| możliwość                                                               | twórca gry | host | współhost | gość |
| ----------------------------------------------------------------------- | ---------- | ---- | --------- | ---- |
| tworzenie pokoju, wybór kategorii                                       | –          | ✓    | –         | –    |
| przegląd i edycja listy pytań gry przed startem                         | –          | ✓    | –         | –    |
| start gry, odsłona, następne pytanie, pominięcie rundy, zakończenie gry | –          | ✓    | ✓         | –    |
| link dla graczy w poczekalni                                            | –          | ✓    | –         | –    |
| głosowanie, pomijanie, propozycja pytania                               | –          | ✓    | ✓         | ✓    |
| zatwierdzanie propozycji (do listy tej gry)                             | –          | ✓    | ✓         | –    |
| wpuszczanie spóźnionych, usunięcie gracza z pokoju                      | –          | ✓    | ✓         | –    |
| nadanie / odebranie roli współhosta                                     | –          | ✓    | –         | –    |
| panel hosta: lista własnych gier i kasowanie pojedynczych               | –          | ✓    | –         | –    |
| wspólna baza pytań i kategorie; weryfikacja nowych pytań po grze        | ✓          | –    | –         | –    |

## Non-Goals

Funkcjonalne:

- **Żadnej odsłony ani zapisu „kto na kogo głosował", w jakiejkolwiek formie** — trwała zasada gry, nie „na później"; aplikacja nie ma zbierać, że gość X głosował na gościa Y, ani razu, ani 200 razy.
- **Bez punktów i rankingu między wieczorami** — zabawą jest odsłona i rozmowa; jednorazowe „podsumowanie wieczoru" (FR-022) to dodatek, nie tabela wyników.
- **Bez kont gości w v1** — gość wchodzi linkiem i wpisuje nick; nick pamiętany w przeglądarce to dodatek v1 (FR-024), a nie konto. Konto gościa nie jest zakazane na przyszłość: jeśli ktoś chce je mieć, nie będziemy tego zabraniać, ale najpierw trzeba ustalić, po co gość w ogóle chce mieć konto (Open Questions).
- **Bez innych mini-gier** — jedna gra; inne tryby najwyżej później, jeśli ekipa i inni hości polubią koncept.
- **Bez generowania pytań przez AI w v1** — nie wykluczone na przyszłość; wcześniej host chce zrobić research, jakie pytania działają najlepiej (Open Questions).
- **Bez wielu kuratorów bazy i narzędzi moderacji** — jedna osoba (twórca gry) weryfikuje pytania; żadnych ról moderatorów, zgłoszeń, banów.
- **Bez czatu głosowego i tekstowego w aplikacji** — rozmowa jest na Discordzie; emotka lub gif do pokoju (FR-023) to dodatek, nie czat.
- **Bez wersji angielskiej w v1** — gra i baza pytań są po polsku; angielski ewentualnie po dopracowaniu gry (decyzja hosta 2026-09-26).

Niefunkcjonalne:

- **Bez aplikacji mobilnej ze sklepu i bez trybu offline** — tylko przeglądarka, tylko z siecią.
- **Bez założeń o skali powyżej około stu użytkowników** — przed wyjściem poza tę skalę host chce przemyśleć sens gry od nowa.

## Open Questions

1. **Czy istniejące aplikacje „most likely to" już rozwiązują problem przygotowania?** — Owner: host. Sprawdzić 2–3 gotowe aplikacje przed budową; jeśli któraś daje pulę własną, rundę na żywo dla ekipy zdalnej i uczenie się z rozgrywki, hipoteza wglądu wymaga zmiany. Block: nie, ale wpływa na Vision.
2. **Kto w ostatnich miesiącach realnie organizował te wieczory i jak często udało się zagrać?** — Owner: host. Kalibruje, jak często panel hosta będzie używany. Block: nie.
3. **Co z głosami oddanymi na gracza (i przez gracza) wyrzuconego w środku rundy?** (FR-004) — Owner: host. Propozycja do rozważenia: głosy przepadają, odsłona liczy się bez niego. Block: nie.
4. **Ile propozycji pytań może wysłać jeden gość w jednej grze?** (FR-013) — Owner: host. Liczba do ustalenia; propozycja z rozmowy: około 3. Block: nie.
5. **Co losuje gra, gdy w wybranych kategoriach skończą się pytania, których ta ekipa jeszcze nie grała?** (FR-015) — Owner: host. Host uważa, że mała baza na start to nie problem (baza rośnie), ale zachowanie w tym przypadku nie jest opisane. Block: nie.
6. **Co znaczy „za mało zagrań, by oceniać" w FR-017 (próg liczby zagrań) i z jakich sygnałów FR-016 liczy się wynik jakości?** — Owner: host. Kierunek: pominięcia, reakcje, skupienie głosów; wagi i próg do ustalenia po pierwszych wieczorach. Block: nie (szczegół reguły, nie sama reguła).
7. **Jakie pytania „most likely to" działają najlepiej?** — Owner: host. Research poza aplikacją: artykuły, badania, istniejące gry; wynik zasili bazę startową i ewentualnie przyszłe generowanie pytań (poza v1). Block: nie.
8. **Po co gość miałby chcieć konta?** — Owner: host. Konto gościa dopuszczalne po v1, jeśli ktoś go chce, ale dopiero gdy wiadomo, co ma dawać (np. stały nick, własne propozycje między wieczorami). Do rozstrzygnięcia przed jakąkolwiek pracą nad kontami gości. Block: nie.
