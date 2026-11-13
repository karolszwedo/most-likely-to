/**
 * Shared question base: the game creator curates it, every game draws from it.
 *
 * Rules for adding questions (also for later additions, PRD FR-021):
 * - Key = question id `<category-id>-<NNN>`, numbered in order within the category. An id never
 *   changes and is never reused, even if the question moves to another category or is retired:
 *   per-question play data (S-11) is stored under it.
 * - Never delete an entry: a retired question stays in QUESTIONS (S-11/S-12 decide how draws
 *   skip it). A typo fix keeps the id; a change of meaning is a new question with a new id.
 * - A new id takes the next number after the highest existing id with the same prefix. Never
 *   derive the category from the id: a question that moves to another category keeps its id.
 * - Keep QUESTIONS a single object literal. A duplicated key fails `npx astro check` (TS1117);
 *   merging parts with spread would let duplicates through silently.
 * - `text` is the ending after the fixed prefix "Kto z nas najprawdopodobniej"; the screen shows
 *   "Kto z nas najprawdopodobniej {text}?". Lowercase start, no trailing "?" or ".", conditional
 *   mood in the generic form ("zasnąłby…"), at most 90 characters.
 * - `adult: true` marks an 18+ question (innuendo, alcohol, dating; no vulgarity, nothing explicit).
 *   The host decides per category whether to include them (S-01).
 * - After every change here run `npm run questions:migration`: it makes a new migration, a snapshot that sets the
 *   database's copy of this base (private.question_base: id, category, 18+) to exactly this file. The snapshot goes
 *   in the same PR, and `npx supabase db push` comes before the merge (context/deployment/deploy-plan.md): the
 *   database refuses question ids and categories it does not know, so a new category merged before the push means no
 *   game with it can be created. `npm test` is red while this file and the latest snapshot differ (S-17).
 */

export const CATEGORIES = [
  { id: "na-co-dzien", name: "Na co dzień" },
  { id: "imprezy", name: "Imprezy" },
  { id: "przyszlosc", name: "Przyszłość" },
  { id: "wpadki-i-obciach", name: "Wpadki i obciach" },
  { id: "gry-i-internet", name: "Gry i internet" },
  { id: "podroze-i-przygody", name: "Podróże i przygody" },
  { id: "sport-i-wyzwania", name: "Sport i wyzwania" },
  { id: "praca-i-szkola", name: "Praca i szkoła" },
] as const;

export type CategoryId = (typeof CATEGORIES)[number]["id"];

export interface QuestionEntry {
  category: CategoryId;
  text: string;
  adult: boolean;
}

export const QUESTIONS = {
  // Na co dzień
  "na-co-dzien-001": { category: "na-co-dzien", text: "spóźniłby się na własne urodziny", adult: false },
  "na-co-dzien-002": {
    category: "na-co-dzien",
    text: "zostawiłby herbatę do wystygnięcia i zapomniał o niej trzy razy",
    adult: false,
  },
  "na-co-dzien-003": {
    category: "na-co-dzien",
    text: "zjadłby na śniadanie wczorajszą pizzę prosto z lodówki",
    adult: false,
  },
  "na-co-dzien-004": {
    category: "na-co-dzien",
    text: "miałby w telefonie ponad dziesięć tysięcy nieprzeczytanych maili",
    adult: false,
  },
  "na-co-dzien-005": { category: "na-co-dzien", text: "chodziłby w piżamie cały weekend", adult: false },
  "na-co-dzien-006": { category: "na-co-dzien", text: "zgubiłby klucze we własnym mieszkaniu", adult: false },
  "na-co-dzien-007": { category: "na-co-dzien", text: "zamówiłby jedzenie, mając pełną lodówkę", adult: false },
  "na-co-dzien-008": {
    category: "na-co-dzien",
    text: "wyszedłby ze sklepu z pełną torbą, ale bez tego, po co przyszedł",
    adult: false,
  },
  "na-co-dzien-009": { category: "na-co-dzien", text: "odpisałby na wiadomość po trzech tygodniach", adult: false },
  "na-co-dzien-010": {
    category: "na-co-dzien",
    text: "ustawiłby dziesięć budzików i przespał wszystkie",
    adult: false,
  },
  "na-co-dzien-011": { category: "na-co-dzien", text: "gadałby do swoich roślin doniczkowych", adult: false },
  "na-co-dzien-012": { category: "na-co-dzien", text: "zapomniałby, po co wszedł do pokoju", adult: false },
  "na-co-dzien-013": {
    category: "na-co-dzien",
    text: "oglądałby ten sam serial po raz piąty, zamiast zacząć nowy",
    adult: false,
  },
  "na-co-dzien-014": {
    category: "na-co-dzien",
    text: "trzymałby w szafie ubrania z metkami sprzed roku",
    adult: false,
  },
  "na-co-dzien-015": {
    category: "na-co-dzien",
    text: "przeczytałby cały regulamin, zanim kliknie „akceptuję”",
    adult: false,
  },
  "na-co-dzien-016": {
    category: "na-co-dzien",
    text: "zrobiłby pranie i zostawił je w pralce na dwa dni",
    adult: false,
  },
  "na-co-dzien-017": { category: "na-co-dzien", text: "kłóciłby się z nawigacją w samochodzie", adult: false },
  "na-co-dzien-018": { category: "na-co-dzien", text: "miałby w lodówce więcej sosów niż jedzenia", adult: false },
  "na-co-dzien-019": {
    category: "na-co-dzien",
    text: "planowałby w kalendarzu cały tydzień, łącznie z drzemkami",
    adult: false,
  },
  "na-co-dzien-020": { category: "na-co-dzien", text: "nadałby imię swojemu odkurzaczowi", adult: false },
  "na-co-dzien-021": { category: "na-co-dzien", text: "napisałby do ex o drugiej w nocy", adult: true },
  "na-co-dzien-022": { category: "na-co-dzien", text: "poszedłby na randkę w dresie", adult: true },
  "na-co-dzien-023": { category: "na-co-dzien", text: "otworzyłby wino w poniedziałek, „bo zasłużył”", adult: true },
  "na-co-dzien-024": { category: "na-co-dzien", text: "znałby po imieniu ekspedientkę z nocnego", adult: true },
  "na-co-dzien-025": { category: "na-co-dzien", text: "zasnąłby na randce", adult: true },
  "na-co-dzien-026": { category: "na-co-dzien", text: "przewijałby Tindera, zamiast spać", adult: true },
  "na-co-dzien-027": {
    category: "na-co-dzien",
    text: "nosiłby w portfelu tę samą prezerwatywę od liceum",
    adult: true,
  },

  // Imprezy
  "imprezy-001": { category: "imprezy", text: "zasnąłby na własnej imprezie", adult: false },
  "imprezy-002": { category: "imprezy", text: "zatańczyłby na stole", adult: false },
  "imprezy-003": { category: "imprezy", text: "przyszedłby na imprezę godzinę przed czasem", adult: false },
  "imprezy-004": {
    category: "imprezy",
    text: "przejąłby muzykę na imprezie i puszczał tylko swoje kawałki",
    adult: false,
  },
  "imprezy-005": { category: "imprezy", text: "zaśpiewałby w karaoke bez ani jednej trafionej nuty", adult: false },
  "imprezy-006": { category: "imprezy", text: "zostałby do końca imprezy i jeszcze pozmywał naczynia", adult: false },
  "imprezy-007": { category: "imprezy", text: "wyszedłby z imprezy po angielsku", adult: false },
  "imprezy-008": {
    category: "imprezy",
    text: "przebrałby się na imprezę, na której nikt inny się nie przebrał",
    adult: false,
  },
  "imprezy-009": { category: "imprezy", text: "zorganizowałby imprezę-niespodziankę i sam się wygadał", adult: false },
  "imprezy-010": { category: "imprezy", text: "zjadłby wszystkie przekąski, zanim przyjdą goście", adult: false },
  "imprezy-011": { category: "imprezy", text: "przyprowadziłby na imprezę kogoś, kogo nikt nie zna", adult: false },
  "imprezy-012": { category: "imprezy", text: "opowiadałby tę samą anegdotę na każdej imprezie", adult: false },
  "imprezy-013": {
    category: "imprezy",
    text: "zrobiłby na imprezie sto zdjęć i nie wysłał nikomu ani jednego",
    adult: false,
  },
  "imprezy-014": { category: "imprezy", text: "pokłóciłby się o zasady gry planszowej", adult: false },
  "imprezy-015": { category: "imprezy", text: "zamówiłby dla wszystkich pizzę z ananasem bez pytania", adult: false },
  "imprezy-016": { category: "imprezy", text: "zostałby wodzirejem na weselu kuzyna", adult: false },
  "imprezy-017": { category: "imprezy", text: "przespałby północ w sylwestra", adult: false },
  "imprezy-018": {
    category: "imprezy",
    text: "zgubiłby telefon na domówce, na której było dziesięć osób",
    adult: false,
  },
  "imprezy-019": {
    category: "imprezy",
    text: "przyniósłby na imprezę gitarę i nie oddał jej nikomu do rana",
    adult: false,
  },
  "imprezy-020": { category: "imprezy", text: "tańczyłby sam na parkiecie, zanim ktokolwiek się odważy", adult: false },
  "imprezy-021": { category: "imprezy", text: "wypiłby za dużo i zaczął mówić po angielsku", adult: true },
  "imprezy-022": { category: "imprezy", text: "obudziłby się rano w wannie gospodarza", adult: true },
  "imprezy-023": {
    category: "imprezy",
    text: "pocałowałby o północy kogoś, kogo poznał pięć minut wcześniej",
    adult: true,
  },
  "imprezy-024": { category: "imprezy", text: "zdjąłby koszulkę na parkiecie", adult: true },
  "imprezy-025": { category: "imprezy", text: "wyznawałby wszystkim miłość po trzecim drinku", adult: true },
  "imprezy-026": { category: "imprezy", text: "wróciłby z imprezy w cudzej kurtce", adult: true },
  "imprezy-027": { category: "imprezy", text: "flirtowałby z barmanem dla darmowego shota", adult: true },

  // Przyszłość
  "przyszlosc-001": { category: "przyszlosc", text: "zostałby milionerem", adult: false },
  "przyszlosc-002": { category: "przyszlosc", text: "wyprowadziłby się w Bieszczady hodować kozy", adult: false },
  "przyszlosc-003": { category: "przyszlosc", text: "zostałby sławny w internecie przez przypadek", adult: false },
  "przyszlosc-004": { category: "przyszlosc", text: "założyłby własną firmę przed trzydziestką", adult: false },
  "przyszlosc-005": { category: "przyszlosc", text: "miałby piątkę dzieci", adult: false },
  "przyszlosc-006": { category: "przyszlosc", text: "zostałby burmistrzem swojego miasta", adult: false },
  "przyszlosc-007": { category: "przyszlosc", text: "wygrałby teleturniej w telewizji", adult: false },
  "przyszlosc-008": { category: "przyszlosc", text: "poleciałby w kosmos", adult: false },
  "przyszlosc-009": { category: "przyszlosc", text: "napisałby bestseller", adult: false },
  "przyszlosc-010": { category: "przyszlosc", text: "przeżyłby apokalipsę zombie", adult: false },
  "przyszlosc-011": { category: "przyszlosc", text: "wziąłby ślub w Las Vegas", adult: true },
  "przyszlosc-012": { category: "przyszlosc", text: "wróciłby do swojej dawnej szkoły jako nauczyciel", adult: false },
  "przyszlosc-013": { category: "przyszlosc", text: "miałby w domu więcej kotów niż mebli", adult: false },
  "przyszlosc-014": { category: "przyszlosc", text: "dożyłby setki", adult: false },
  "przyszlosc-015": { category: "przyszlosc", text: "rzuciłby korpo i otworzył food trucka", adult: false },
  "przyszlosc-016": { category: "przyszlosc", text: "przepuściłby wygraną w lotto w jeden rok", adult: false },
  "przyszlosc-017": { category: "przyszlosc", text: "zagrałby w reklamie telewizyjnej", adult: false },
  "przyszlosc-018": { category: "przyszlosc", text: "zbudowałby dom własnymi rękami", adult: false },
  "przyszlosc-019": { category: "przyszlosc", text: "mieszkałby za dziesięć lat na innym kontynencie", adult: false },
  "przyszlosc-020": { category: "przyszlosc", text: "wynalazłby coś, czego będą używać wszyscy", adult: false },
  "przyszlosc-021": { category: "przyszlosc", text: "wziąłby ślub z kimś poznanym na wakacjach", adult: true },
  "przyszlosc-022": { category: "przyszlosc", text: "miałby na koncie trzy rozwody", adult: true },
  "przyszlosc-023": {
    category: "przyszlosc",
    text: "otworzyłby własny pub i był w nim najlepszym klientem",
    adult: true,
  },
  "przyszlosc-024": { category: "przyszlosc", text: "zostałby zawodowym degustatorem piwa", adult: true },
  "przyszlosc-025": { category: "przyszlosc", text: "poznałby miłość życia w aplikacji randkowej", adult: true },
  "przyszlosc-026": { category: "przyszlosc", text: "wróciłby do ex po dziesięciu latach", adult: true },
  "przyszlosc-027": { category: "przyszlosc", text: "wystąpiłby w randkowym reality show", adult: true },

  // Wpadki i obciach
  "wpadki-i-obciach-001": {
    category: "wpadki-i-obciach",
    text: "pomachałby komuś, kto machał do osoby za nim",
    adult: false,
  },
  "wpadki-i-obciach-002": {
    category: "wpadki-i-obciach",
    text: "wysłałby wiadomość o kimś prosto do tej osoby",
    adult: false,
  },
  "wpadki-i-obciach-003": { category: "wpadki-i-obciach", text: "wszedłby z impetem w szklane drzwi", adult: false },
  "wpadki-i-obciach-004": { category: "wpadki-i-obciach", text: "powiedziałby do nauczycielki „mamo”", adult: false },
  "wpadki-i-obciach-005": { category: "wpadki-i-obciach", text: "utknąłby w drzwiach tramwaju", adult: false },
  "wpadki-i-obciach-006": {
    category: "wpadki-i-obciach",
    text: "odpowiedziałby „nawzajem” kelnerowi, który życzy smacznego",
    adult: false,
  },
  "wpadki-i-obciach-007": { category: "wpadki-i-obciach", text: "przewróciłby się na prostej drodze", adult: false },
  "wpadki-i-obciach-008": {
    category: "wpadki-i-obciach",
    text: "zaśmiałby się w najmniej odpowiednim momencie",
    adult: false,
  },
  "wpadki-i-obciach-009": {
    category: "wpadki-i-obciach",
    text: "polubiłby przez przypadek czyjeś zdjęcie sprzed pięciu lat",
    adult: false,
  },
  "wpadki-i-obciach-010": {
    category: "wpadki-i-obciach",
    text: "wyszedłby z toalety z papierem przyklejonym do buta",
    adult: false,
  },
  "wpadki-i-obciach-011": {
    category: "wpadki-i-obciach",
    text: "zapomniałby czyjegoś imienia w trakcie przedstawiania go innym",
    adult: false,
  },
  "wpadki-i-obciach-012": {
    category: "wpadki-i-obciach",
    text: "chodziłby cały dzień w bluzie założonej na lewą stronę",
    adult: false,
  },
  "wpadki-i-obciach-013": {
    category: "wpadki-i-obciach",
    text: "zamówiłby w restauracji nie to, co chciał, bo nie umiał wymówić nazwy",
    adult: false,
  },
  "wpadki-i-obciach-014": {
    category: "wpadki-i-obciach",
    text: "ciągnąłby kilka razy drzwi z napisem „pchać”",
    adult: false,
  },
  "wpadki-i-obciach-015": {
    category: "wpadki-i-obciach",
    text: "zasnąłby w autobusie i obudził się na pętli",
    adult: false,
  },
  "wpadki-i-obciach-016": {
    category: "wpadki-i-obciach",
    text: "śpiewałby na głos w słuchawkach, myśląc, że nikt nie słyszy",
    adult: false,
  },
  "wpadki-i-obciach-017": {
    category: "wpadki-i-obciach",
    text: "pomyliłby sale i przesiedział cały wykład na innym kierunku",
    adult: false,
  },
  "wpadki-i-obciach-018": {
    category: "wpadki-i-obciach",
    text: "potknąłby się, wchodząc na scenę po nagrodę",
    adult: false,
  },
  "wpadki-i-obciach-019": {
    category: "wpadki-i-obciach",
    text: "wysłałby głosówkę, której wcale nie chciał wysłać",
    adult: false,
  },
  "wpadki-i-obciach-020": {
    category: "wpadki-i-obciach",
    text: "pomyliłby obcą osobę z kumplem i klepnął ją w plecy",
    adult: false,
  },
  "wpadki-i-obciach-021": {
    category: "wpadki-i-obciach",
    text: "pomyliłby imię osoby, z którą jest na randce",
    adult: true,
  },
  "wpadki-i-obciach-022": {
    category: "wpadki-i-obciach",
    text: "wysłałby pikantną wiadomość na rodzinną grupę",
    adult: true,
  },
  "wpadki-i-obciach-023": {
    category: "wpadki-i-obciach",
    text: "dałby się przyłapać rodzicom na całowaniu",
    adult: true,
  },
  "wpadki-i-obciach-024": {
    category: "wpadki-i-obciach",
    text: "obudziłby się po imprezie z czyimś numerem napisanym na ręce",
    adult: true,
  },
  "wpadki-i-obciach-025": { category: "wpadki-i-obciach", text: "próbowałby tańczyć na rurze i spadł", adult: true },
  "wpadki-i-obciach-026": {
    category: "wpadki-i-obciach",
    text: "wróciłby z imprezy do domu, ale nie do swojego",
    adult: true,
  },
  "wpadki-i-obciach-027": {
    category: "wpadki-i-obciach",
    text: "wyznałby miłość po pijaku, a rano udawał, że nic nie pamięta",
    adult: true,
  },

  // Gry i internet
  "gry-i-internet-001": {
    category: "gry-i-internet",
    text: "grałby do piątej rano, bo „jeszcze jedna runda”",
    adult: false,
  },
  "gry-i-internet-002": { category: "gry-i-internet", text: "rzuciłby padem po przegranej", adult: false },
  "gry-i-internet-003": { category: "gry-i-internet", text: "wydałby majątek na skórki w grze", adult: false },
  "gry-i-internet-004": {
    category: "gry-i-internet",
    text: "dostałby bana na własnym serwerze Discorda",
    adult: false,
  },
  "gry-i-internet-005": {
    category: "gry-i-internet",
    text: "kłóciłby się na czacie gry z dwunastolatkiem",
    adult: false,
  },
  "gry-i-internet-006": { category: "gry-i-internet", text: "zwaliłby każdą przegraną na lagi", adult: false },
  "gry-i-internet-007": {
    category: "gry-i-internet",
    text: "przeszedłby grę na najwyższym poziomie tylko po to, żeby się pochwalić",
    adult: false,
  },
  "gry-i-internet-008": {
    category: "gry-i-internet",
    text: "oglądałby poradniki do gry dłużej, niż w nią grał",
    adult: false,
  },
  "gry-i-internet-009": {
    category: "gry-i-internet",
    text: "wyszedłby z meczu w połowie, bo przegrywał",
    adult: false,
  },
  "gry-i-internet-010": {
    category: "gry-i-internet",
    text: "założyłby kanał na Twitchu, który ogląda tylko mama",
    adult: false,
  },
  "gry-i-internet-011": {
    category: "gry-i-internet",
    text: "wdałby się w kłótnię w komentarzach pod filmikiem o kotach",
    adult: false,
  },
  "gry-i-internet-012": {
    category: "gry-i-internet",
    text: "miałby w jednej grze więcej godzin, niż przespał w tym roku",
    adult: false,
  },
  "gry-i-internet-013": {
    category: "gry-i-internet",
    text: "wrzucałby na serwer zrzut ekranu każdej swojej wygranej",
    adult: false,
  },
  "gry-i-internet-014": {
    category: "gry-i-internet",
    text: "miałby na Steamie sto gier, których nigdy nie uruchomił",
    adult: false,
  },
  "gry-i-internet-015": { category: "gry-i-internet", text: "stałby się memem na naszym serwerze", adult: false },
  "gry-i-internet-016": {
    category: "gry-i-internet",
    text: "przegapiłby wesele kuzyna, bo był w środku rajdu",
    adult: false,
  },
  "gry-i-internet-017": {
    category: "gry-i-internet",
    text: "gadałby pół godziny na wyciszonym mikrofonie",
    adult: false,
  },
  "gry-i-internet-018": {
    category: "gry-i-internet",
    text: "oddałby wszystkie przedmioty w grze za jedną rzadką broń",
    adult: false,
  },
  "gry-i-internet-019": {
    category: "gry-i-internet",
    text: "wstałby o czwartej rano po limitowany przedmiot w grze",
    adult: false,
  },
  "gry-i-internet-020": {
    category: "gry-i-internet",
    text: "przeklikałby wszystkie dialogi, a potem pytał, o co chodzi w fabule",
    adult: false,
  },
  "gry-i-internet-021": {
    category: "gry-i-internet",
    text: "podrywałby kogoś w grze, nie wiedząc, kim ta osoba jest",
    adult: true,
  },
  "gry-i-internet-022": {
    category: "gry-i-internet",
    text: "zorganizowałby na Discordzie grę alkoholową w środę",
    adult: true,
  },
  "gry-i-internet-023": { category: "gry-i-internet", text: "poznałby drugą połówkę w grze online", adult: true },
  "gry-i-internet-024": {
    category: "gry-i-internet",
    text: "zniknąłby z Discorda w pół zdania, bo „ktoś przyszedł”",
    adult: true,
  },
  "gry-i-internet-025": {
    category: "gry-i-internet",
    text: "sprzedałby konto w grze, żeby postawić wszystkim kolejkę",
    adult: true,
  },
  "gry-i-internet-026": {
    category: "gry-i-internet",
    text: "nie dałby nikomu zajrzeć do swojej historii przeglądarki",
    adult: true,
  },
  "gry-i-internet-027": {
    category: "gry-i-internet",
    text: "grałby rankingi po pijaku i spadł o dwie ligi",
    adult: true,
  },

  // Podróże i przygody
  "podroze-i-przygody-001": { category: "podroze-i-przygody", text: "zgubiłby paszport na lotnisku", adult: false },
  "podroze-i-przygody-002": {
    category: "podroze-i-przygody",
    text: "przegapiłby samolot, siedząc przy bramce",
    adult: false,
  },
  "podroze-i-przygody-003": {
    category: "podroze-i-przygody",
    text: "wybrałby w górach „skrót”, który wydłużył trasę o trzy godziny",
    adult: false,
  },
  "podroze-i-przygody-004": {
    category: "podroze-i-przygody",
    text: "spakowałby się godzinę przed wyjazdem",
    adult: false,
  },
  "podroze-i-przygody-005": {
    category: "podroze-i-przygody",
    text: "przywiózłby z wakacji walizkę pamiątek dla wszystkich",
    adult: false,
  },
  "podroze-i-przygody-006": {
    category: "podroze-i-przygody",
    text: "zjadłby na zagranicznym targu smażonego pająka",
    adult: false,
  },
  "podroze-i-przygody-007": {
    category: "podroze-i-przygody",
    text: "pojechałby autostopem przez Europę",
    adult: false,
  },
  "podroze-i-przygody-008": {
    category: "podroze-i-przygody",
    text: "spaliłby się na raka pierwszego dnia wakacji",
    adult: false,
  },
  "podroze-i-przygody-009": {
    category: "podroze-i-przygody",
    text: "pojechałby na wakacje bez planu i bez noclegu",
    adult: false,
  },
  "podroze-i-przygody-010": { category: "podroze-i-przygody", text: "skoczyłby na bungee", adult: false },
  "podroze-i-przygody-011": {
    category: "podroze-i-przygody",
    text: "zgubiłby się w obcym mieście i trafił do najlepszej knajpy",
    adult: false,
  },
  "podroze-i-przygody-012": {
    category: "podroze-i-przygody",
    text: "przespałby noc na szczycie, żeby zobaczyć wschód słońca",
    adult: false,
  },
  "podroze-i-przygody-013": {
    category: "podroze-i-przygody",
    text: "spakowałby pięć par butów na weekend",
    adult: false,
  },
  "podroze-i-przygody-014": {
    category: "podroze-i-przygody",
    text: "dogadywałby się z miejscowymi na migi przez cały wyjazd",
    adult: false,
  },
  "podroze-i-przygody-015": { category: "podroze-i-przygody", text: "wszedłby na Rysy w klapkach", adult: false },
  "podroze-i-przygody-016": {
    category: "podroze-i-przygody",
    text: "kupiłby bilet w jedną stronę bez planu powrotu",
    adult: false,
  },
  "podroze-i-przygody-017": {
    category: "podroze-i-przygody",
    text: "zrobiłby na wakacjach tysiąc zdjęć i ani jednego z ludźmi",
    adult: false,
  },
  "podroze-i-przygody-018": {
    category: "podroze-i-przygody",
    text: "zatrzasnąłby się na balkonie w hotelu",
    adult: false,
  },
  "podroze-i-przygody-019": {
    category: "podroze-i-przygody",
    text: "przepłynąłby jezioro wpław, bo „to niedaleko”",
    adult: false,
  },
  "podroze-i-przygody-020": {
    category: "podroze-i-przygody",
    text: "pojechałby na lotnisko w złym dniu",
    adult: false,
  },
  "podroze-i-przygody-021": { category: "podroze-i-przygody", text: "przeżyłby wakacyjny romans", adult: true },
  "podroze-i-przygody-022": {
    category: "podroze-i-przygody",
    text: "wróciłby z wakacji z tatuażem, którego nie pamięta",
    adult: true,
  },
  "podroze-i-przygody-023": {
    category: "podroze-i-przygody",
    text: "przepiłby cały budżet wakacyjny w trzy dni",
    adult: true,
  },
  "podroze-i-przygody-024": {
    category: "podroze-i-przygody",
    text: "kąpałby się nago w jeziorze o północy",
    adult: true,
  },
  "podroze-i-przygody-025": {
    category: "podroze-i-przygody",
    text: "przespałby noc na dworcu po imprezie w obcym mieście",
    adult: true,
  },
  "podroze-i-przygody-026": {
    category: "podroze-i-przygody",
    text: "zakochałby się w przewodniku wycieczki",
    adult: true,
  },
  "podroze-i-przygody-027": {
    category: "podroze-i-przygody",
    text: "przywiózłby w walizce więcej wina niż ubrań",
    adult: true,
  },

  // Sport i wyzwania
  "sport-i-wyzwania-001": { category: "sport-i-wyzwania", text: "przebiegłby maraton bez przygotowania", adult: false },
  "sport-i-wyzwania-002": {
    category: "sport-i-wyzwania",
    text: "kupiłby karnet na siłownię i poszedł raz",
    adult: false,
  },
  "sport-i-wyzwania-003": {
    category: "sport-i-wyzwania",
    text: "przyjąłby każdy zakład, nawet najgłupszy",
    adult: false,
  },
  "sport-i-wyzwania-004": {
    category: "sport-i-wyzwania",
    text: "zjadłby najostrzejszą papryczkę świata dla zakładu",
    adult: false,
  },
  "sport-i-wyzwania-005": { category: "sport-i-wyzwania", text: "wskoczyłby do przerębla w styczniu", adult: false },
  "sport-i-wyzwania-006": {
    category: "sport-i-wyzwania",
    text: "zrobiłby sto pompek, żeby coś udowodnić",
    adult: false,
  },
  "sport-i-wyzwania-007": {
    category: "sport-i-wyzwania",
    text: "krzyczałby na sędziego przez telewizor",
    adult: false,
  },
  "sport-i-wyzwania-008": { category: "sport-i-wyzwania", text: "nabawiłby się kontuzji na rozgrzewce", adult: false },
  "sport-i-wyzwania-009": { category: "sport-i-wyzwania", text: "zostałby trenerem personalnym", adult: false },
  "sport-i-wyzwania-010": { category: "sport-i-wyzwania", text: "przeszedłby pieszo całą Polskę", adult: false },
  "sport-i-wyzwania-011": { category: "sport-i-wyzwania", text: "przegrałby w ping-ponga z dzieckiem", adult: false },
  "sport-i-wyzwania-012": {
    category: "sport-i-wyzwania",
    text: "kupiłby cały sprzęt do nowego sportu i rzucił go po tygodniu",
    adult: false,
  },
  "sport-i-wyzwania-013": {
    category: "sport-i-wyzwania",
    text: "robiłby na siłowni więcej selfie niż serii",
    adult: false,
  },
  "sport-i-wyzwania-014": { category: "sport-i-wyzwania", text: "wytrzymałby miesiąc bez słodyczy", adult: false },
  "sport-i-wyzwania-015": { category: "sport-i-wyzwania", text: "pojechałby rowerem nad morze", adult: false },
  "sport-i-wyzwania-016": { category: "sport-i-wyzwania", text: "podjąłby każde wyzwanie z TikToka", adult: false },
  "sport-i-wyzwania-017": { category: "sport-i-wyzwania", text: "zdobyłby Koronę Gór Polski", adult: false },
  "sport-i-wyzwania-018": {
    category: "sport-i-wyzwania",
    text: "obraziłby się po przegranym meczu w piłkarzyki",
    adult: false,
  },
  "sport-i-wyzwania-019": { category: "sport-i-wyzwania", text: "biegałby codziennie o szóstej rano", adult: false },
  "sport-i-wyzwania-020": {
    category: "sport-i-wyzwania",
    text: "zapisałby się na triathlon po jednym treningu",
    adult: false,
  },
  "sport-i-wyzwania-021": { category: "sport-i-wyzwania", text: "wygrałby konkurs picia piwa na czas", adult: true },
  "sport-i-wyzwania-022": {
    category: "sport-i-wyzwania",
    text: "zapisałby się na siłownię dla ładnej osoby z recepcji",
    adult: true,
  },
  "sport-i-wyzwania-023": {
    category: "sport-i-wyzwania",
    text: "poszedłby pobiegać z kacem, żeby „wypocić” imprezę",
    adult: true,
  },
  "sport-i-wyzwania-024": {
    category: "sport-i-wyzwania",
    text: "przebiegłby nago przez boisko w trakcie meczu",
    adult: true,
  },
  "sport-i-wyzwania-025": {
    category: "sport-i-wyzwania",
    text: "umówiłby się na randkę na ściance wspinaczkowej",
    adult: true,
  },
  "sport-i-wyzwania-026": {
    category: "sport-i-wyzwania",
    text: "zapisałby się na bieg z piwem na każdym kilometrze",
    adult: true,
  },
  "sport-i-wyzwania-027": {
    category: "sport-i-wyzwania",
    text: "chodziłby na mecze wyłącznie dla piwa na trybunach",
    adult: true,
  },

  // Praca i szkoła
  "praca-i-szkola-001": { category: "praca-i-szkola", text: "zasnąłby na zebraniu", adult: false },
  "praca-i-szkola-002": {
    category: "praca-i-szkola",
    text: "zostawiłby włączony mikrofon w najgorszym momencie spotkania",
    adult: false,
  },
  "praca-i-szkola-003": { category: "praca-i-szkola", text: "dałby się złapać na ściąganiu", adult: false },
  "praca-i-szkola-004": {
    category: "praca-i-szkola",
    text: "odpowiedziałby „do wszystkich” na maila do jednej osoby",
    adult: false,
  },
  "praca-i-szkola-005": { category: "praca-i-szkola", text: "przyszedłby do pracy w kapciach", adult: false },
  "praca-i-szkola-006": {
    category: "praca-i-szkola",
    text: "napisałby pracę zaliczeniową w noc przed terminem",
    adult: false,
  },
  "praca-i-szkola-007": { category: "praca-i-szkola", text: "zostałby szefem swojego szefa", adult: false },
  "praca-i-szkola-008": { category: "praca-i-szkola", text: "zjadłby cudzy obiad z firmowej lodówki", adult: false },
  "praca-i-szkola-009": {
    category: "praca-i-szkola",
    text: "oglądałby w pracy serial z udawaną tabelką na drugim ekranie",
    adult: false,
  },
  "praca-i-szkola-010": { category: "praca-i-szkola", text: "rzuciłby pracę w dramatyczny sposób", adult: false },
  "praca-i-szkola-011": {
    category: "praca-i-szkola",
    text: "spóźniłby się na własną rozmowę kwalifikacyjną",
    adult: false,
  },
  "praca-i-szkola-012": {
    category: "praca-i-szkola",
    text: "przynosiłby ciasto do pracy w każdy piątek",
    adult: false,
  },
  "praca-i-szkola-013": { category: "praca-i-szkola", text: "dostałby uwagę za gadanie na lekcji", adult: false },
  "praca-i-szkola-014": {
    category: "praca-i-szkola",
    text: "poszedłby na wagary i wpadł na wychowawczynię w galerii",
    adult: false,
  },
  "praca-i-szkola-015": { category: "praca-i-szkola", text: "odpisywałby na maile o drugiej w nocy", adult: false },
  "praca-i-szkola-016": { category: "praca-i-szkola", text: "zostałby przewodniczącym samorządu", adult: false },
  "praca-i-szkola-017": { category: "praca-i-szkola", text: "podpisałby listę obecności za pół grupy", adult: false },
  "praca-i-szkola-018": {
    category: "praca-i-szkola",
    text: "zrobiłby sześćdziesiąt slajdów na pięciominutową prezentację",
    adult: false,
  },
  "praca-i-szkola-019": { category: "praca-i-szkola", text: "kłóciłby się z nauczycielem o pół punktu", adult: false },
  "praca-i-szkola-020": {
    category: "praca-i-szkola",
    text: "zostałby pracownikiem miesiąca, nic nie robiąc",
    adult: false,
  },
  "praca-i-szkola-021": { category: "praca-i-szkola", text: "wdałby się w romans biurowy", adult: true },
  "praca-i-szkola-022": { category: "praca-i-szkola", text: "przyszedłby do pracy prosto z imprezy", adult: true },
  "praca-i-szkola-023": {
    category: "praca-i-szkola",
    text: "wypiłby za dużo na firmowej wigilii i powiedział szefowi, co myśli",
    adult: true,
  },
  "praca-i-szkola-024": {
    category: "praca-i-szkola",
    text: "wysłałby dwuznaczną emotkę na firmowym czacie",
    adult: true,
  },
  "praca-i-szkola-025": { category: "praca-i-szkola", text: "przespałby egzamin po imprezie w akademiku", adult: true },
  "praca-i-szkola-026": { category: "praca-i-szkola", text: "schowałby piersiówkę w szufladzie biurka", adult: true },
  "praca-i-szkola-027": { category: "praca-i-szkola", text: "umówiłby się na randkę z kimś z działu HR", adult: true },
} as const satisfies Record<string, QuestionEntry>;

export type QuestionId = keyof typeof QUESTIONS;
