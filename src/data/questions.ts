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
 * - `adult: true` marks a question that is really for adults, for one of four reasons only: getting drunk or a
 *   drinking game, gambling for money, clear innuendo (nudity, a night at someone's place) or a dating app (e.g.
 *   Tinder); no vulgarity, nothing explicit. The host decides per category whether to include them (S-01). A mere
 *   mention of wine or beer, a hangover, a kiss, an ex and innocent romance (a crush, a date, an anniversary, a
 *   proposal, a wedding) are not 18+ by themselves: the ordinary questions of "Randki i związki" are made of them.
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
  { id: "znane-gry", name: "Gry" },
  { id: "popkultura", name: "Popkultura" },
  { id: "jedzenie-i-gotowanie", name: "Jedzenie i gotowanie" },
  { id: "randki-i-zwiazki", name: "Randki i związki" },
  { id: "pieniadze-i-zakupy", name: "Pieniądze i zakupy" },
  { id: "zwierzeta-i-dom", name: "Zwierzęta i dom" },
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
  "na-co-dzien-021": { category: "na-co-dzien", text: "napisałby do ex o drugiej w nocy", adult: false },
  "na-co-dzien-022": { category: "na-co-dzien", text: "poszedłby na randkę w dresie", adult: false },
  "na-co-dzien-023": { category: "na-co-dzien", text: "otworzyłby wino w poniedziałek, „bo zasłużył”", adult: false },
  "na-co-dzien-024": { category: "na-co-dzien", text: "znałby po imieniu ekspedientkę z nocnego", adult: false },
  "na-co-dzien-025": { category: "na-co-dzien", text: "zasnąłby na randce", adult: false },
  "na-co-dzien-026": { category: "na-co-dzien", text: "przewijałby Tindera, zamiast spać", adult: true },
  "na-co-dzien-027": {
    category: "na-co-dzien",
    text: "nosiłby w portfelu tę samą prezerwatywę od liceum",
    adult: true,
  },

  "na-co-dzien-028": {
    category: "na-co-dzien",
    text: "zjadłby obiad na stojąco nad zlewem, żeby nie zmywać talerza",
    adult: false,
  },
  "na-co-dzien-029": {
    category: "na-co-dzien",
    text: "trzymałby pod zlewem reklamówkę pełną innych reklamówek",
    adult: false,
  },
  "na-co-dzien-030": {
    category: "na-co-dzien",
    text: "miałby w przeglądarce czterdzieści otwartych kart",
    adult: false,
  },
  "na-co-dzien-031": {
    category: "na-co-dzien",
    text: "udawałby, że nie ma go w domu, gdy ktoś dzwoni do drzwi",
    adult: false,
  },
  "na-co-dzien-032": {
    category: "na-co-dzien",
    text: "zasnąłby przed telewizorem i upierał się, że wcale nie spał",
    adult: false,
  },
  "na-co-dzien-033": { category: "na-co-dzien", text: "przypaliłby wodę na makaron", adult: false },
  "na-co-dzien-034": {
    category: "na-co-dzien",
    text: "nosiłby skarpetki nie do pary i mówił, że to styl",
    adult: false,
  },
  "na-co-dzien-035": {
    category: "na-co-dzien",
    text: "szukałby telefonu, świecąc sobie latarką z tego telefonu",
    adult: false,
  },
  "na-co-dzien-036": {
    category: "na-co-dzien",
    text: "miałby krzesło tak zawalone ciuchami, że nikt nie pamięta jego koloru",
    adult: false,
  },
  "na-co-dzien-037": {
    category: "na-co-dzien",
    text: "wracałby trzy razy, żeby sprawdzić, czy zamknął drzwi",
    adult: false,
  },
  "na-co-dzien-038": {
    category: "na-co-dzien",
    text: "pisałby z trzema osobami naraz w aplikacji randkowej",
    adult: true,
  },
  "na-co-dzien-039": {
    category: "na-co-dzien",
    text: "kupiłby wino tylko dlatego, że miało ładną etykietę",
    adult: false,
  },
  "na-co-dzien-040": {
    category: "na-co-dzien",
    text: "ukrywałby przed współlokatorami, kto u niego nocował",
    adult: true,
  },
  "na-co-dzien-041": {
    category: "na-co-dzien",
    text: "odstawiłby pusty karton po mleku z powrotem do lodówki",
    adult: false,
  },
  "na-co-dzien-042": {
    category: "na-co-dzien",
    text: "zjadłby na kolację o północy miskę płatków z mlekiem",
    adult: false,
  },
  "na-co-dzien-043": {
    category: "na-co-dzien",
    text: "znałby kuriera po imieniu i pytał go, co słychać u dzieci",
    adult: false,
  },
  "na-co-dzien-044": { category: "na-co-dzien", text: "odkładałby wizytę u dentysty przez trzy lata", adult: false },
  "na-co-dzien-045": {
    category: "na-co-dzien",
    text: "przestawiałby meble w mieszkaniu o drugiej w nocy",
    adult: false,
  },
  "na-co-dzien-046": {
    category: "na-co-dzien",
    text: "kupiłby kolejny kubek, choć w szafce nie mieści się już żaden",
    adult: false,
  },
  "na-co-dzien-047": {
    category: "na-co-dzien",
    text: "poszedłby do sklepu w kapciach, bo „to tylko na chwilę”",
    adult: false,
  },
  "na-co-dzien-048": {
    category: "na-co-dzien",
    text: "zjadłby całe opakowanie ciastek, „bo i tak było otwarte”",
    adult: false,
  },
  "na-co-dzien-049": {
    category: "na-co-dzien",
    text: "oglądałby filmiki o sprzątaniu, zamiast posprzątać",
    adult: false,
  },
  "na-co-dzien-050": {
    category: "na-co-dzien",
    text: "chowałby słodycze przed samym sobą na najwyższej półce",
    adult: false,
  },
  "na-co-dzien-051": {
    category: "na-co-dzien",
    text: "zasypiałby przy filmiku na YouTubie i budził się przy zupełnie innym",
    adult: false,
  },
  "na-co-dzien-052": { category: "na-co-dzien", text: "naprawiałby wszystko w domu taśmą klejącą", adult: false },
  "na-co-dzien-053": {
    category: "na-co-dzien",
    text: "zostawiałby garnki „do odmoczenia” na cały tydzień",
    adult: false,
  },
  "na-co-dzien-054": {
    category: "na-co-dzien",
    text: "trzymałby w telefonie tysiące zrzutów ekranu, do których nigdy nie wróci",
    adult: false,
  },
  "na-co-dzien-055": {
    category: "na-co-dzien",
    text: "zaglądałby do lodówki co pół godziny, jakby miało w niej coś przybyć",
    adult: false,
  },
  "na-co-dzien-056": {
    category: "na-co-dzien",
    text: "ubijałby śmieci w koszu, byle ich jeszcze nie wynosić",
    adult: false,
  },
  "na-co-dzien-057": {
    category: "na-co-dzien",
    text: "zgubiłby pilota w kanapie i przez cały wieczór oglądał jeden kanał",
    adult: false,
  },
  "na-co-dzien-058": {
    category: "na-co-dzien",
    text: "słuchałby jednej piosenki w kółko przez cały dzień",
    adult: false,
  },
  "na-co-dzien-059": {
    category: "na-co-dzien",
    text: "witałby się z każdym psem na ulicy, nie zauważając jego właściciela",
    adult: false,
  },
  "na-co-dzien-060": { category: "na-co-dzien", text: "odpowiadałby „zaraz” i robił to za tydzień", adult: false },
  "na-co-dzien-061": { category: "na-co-dzien", text: "myłby naczynia, zanim włoży je do zmywarki", adult: false },
  "na-co-dzien-062": { category: "na-co-dzien", text: "nosiłby ten sam sweter przez całą zimę", adult: false },
  "na-co-dzien-063": {
    category: "na-co-dzien",
    text: "wyszedłby z domu z telefonem na jednym procencie baterii",
    adult: false,
  },
  "na-co-dzien-064": {
    category: "na-co-dzien",
    text: "rozpakowywałby walizkę jeszcze miesiąc po urlopie",
    adult: false,
  },
  "na-co-dzien-065": {
    category: "na-co-dzien",
    text: "sprzątałby mieszkanie tylko wtedy, gdy zapowiedzą się goście",
    adult: false,
  },
  "na-co-dzien-066": {
    category: "na-co-dzien",
    text: "zostawiałby w każdym pokoju niedopitą szklankę wody",
    adult: false,
  },
  "na-co-dzien-067": { category: "na-co-dzien", text: "odpisywałby na długie wiadomości jednym emoji", adult: false },
  "na-co-dzien-068": {
    category: "na-co-dzien",
    text: "przeczytałby wiadomość, odpisał w myślach i był pewien, że ją wysłał",
    adult: false,
  },
  "na-co-dzien-069": {
    category: "na-co-dzien",
    text: "jadłby śniadanie o czternastej i dalej nazywał je śniadaniem",
    adult: false,
  },
  "na-co-dzien-070": {
    category: "na-co-dzien",
    text: "zamawiałby jedzenie na dwie osoby, żeby kurier nie myślał, że je sam",
    adult: false,
  },
  "na-co-dzien-071": {
    category: "na-co-dzien",
    text: "przewinąłby profil nowej sympatii aż do zdjęć z komunii",
    adult: false,
  },
  "na-co-dzien-072": {
    category: "na-co-dzien",
    text: "posprzątałby mieszkanie w trzy minuty po SMS-ie „jestem pod blokiem”",
    adult: false,
  },
  "na-co-dzien-073": { category: "na-co-dzien", text: "zapisałby ex w telefonie jako „NIE ODPISUJ”", adult: false },
  "na-co-dzien-074": {
    category: "na-co-dzien",
    text: "szykowałby się na randkę dwie godziny i odwołał ją w ostatniej chwili",
    adult: false,
  },
  "na-co-dzien-075": {
    category: "na-co-dzien",
    text: "trzymałby szczoteczkę do zębów u kogoś, z kim „nic go nie łączy”",
    adult: true,
  },
  "na-co-dzien-076": {
    category: "na-co-dzien",
    text: "zmieniłby pościel przed randką, „tak na wszelki wypadek”",
    adult: true,
  },
  "na-co-dzien-077": {
    category: "na-co-dzien",
    text: "zaprosiłby kogoś „na Netflixa” i naprawdę obejrzał cały film",
    adult: true,
  },
  "na-co-dzien-078": {
    category: "na-co-dzien",
    text: "przeleżałby niedzielę na kacu i trzy razy zamówił jedzenie",
    adult: false,
  },
  "na-co-dzien-079": {
    category: "na-co-dzien",
    text: "pisałby do crusha długie wiadomości i kasował je przed wysłaniem",
    adult: false,
  },
  "na-co-dzien-080": { category: "na-co-dzien", text: "piłby wino z kubka, bo kieliszki są „dla gości”", adult: false },
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
  "imprezy-022": { category: "imprezy", text: "obudziłby się rano w wannie gospodarza", adult: false },
  "imprezy-023": {
    category: "imprezy",
    text: "pocałowałby o północy kogoś, kogo poznał pięć minut wcześniej",
    adult: false,
  },
  "imprezy-024": { category: "imprezy", text: "zdjąłby koszulkę na parkiecie", adult: false },
  "imprezy-025": { category: "imprezy", text: "wyznawałby wszystkim miłość po trzecim drinku", adult: false },
  "imprezy-026": { category: "imprezy", text: "wróciłby z imprezy w cudzej kurtce", adult: false },
  "imprezy-027": { category: "imprezy", text: "flirtowałby z barmanem dla darmowego shota", adult: false },

  "imprezy-028": { category: "imprezy", text: "wylałby coś na jedyny biały dywan w mieszkaniu", adult: false },
  "imprezy-029": {
    category: "imprezy",
    text: "przyniósłby na imprezę sałatkę jarzynową, choć nikt o nią nie prosił",
    adult: false,
  },
  "imprezy-030": {
    category: "imprezy",
    text: "przyszedłby na imprezę z pustymi rękami i wyszedł z resztkami tortu",
    adult: false,
  },
  "imprezy-031": { category: "imprezy", text: "przegadałby całą imprezę z psem gospodarza", adult: false },
  "imprezy-032": {
    category: "imprezy",
    text: "wymyśliłby na imprezie grę, której zasad nikt poza nim nie rozumie",
    adult: false,
  },
  "imprezy-033": { category: "imprezy", text: "wpadłby na imprezę „tylko na chwilę” i wyszedł ostatni", adult: false },
  "imprezy-034": { category: "imprezy", text: "zamawiałby taksówkę, nie znając adresu, pod którym jest", adult: false },
  "imprezy-035": { category: "imprezy", text: "kupiłby o trzeciej w nocy kebaba i zasnął z nim w ręce", adult: false },
  "imprezy-036": {
    category: "imprezy",
    text: "opowiadałby na imprezie o swojej pracy, choć nikt nie pytał",
    adult: false,
  },
  "imprezy-037": {
    category: "imprezy",
    text: "wychodziłby z imprezy przez godzinę, żegnając się z każdym osobno",
    adult: false,
  },
  "imprezy-038": { category: "imprezy", text: "robiłby wszystkim drinki z tego, co znalazł w lodówce", adult: false },
  "imprezy-039": { category: "imprezy", text: "nie pamiętałby rano, z kim się całował na imprezie", adult: true },
  "imprezy-040": {
    category: "imprezy",
    text: "zaproponowałby na imprezie grę w butelkę jak w gimnazjum",
    adult: false,
  },
  "imprezy-041": {
    category: "imprezy",
    text: "przesiedziałby całą imprezę w kuchni, bo tam toczą się najlepsze rozmowy",
    adult: false,
  },
  "imprezy-042": { category: "imprezy", text: "złożyłby życzenia urodzinowe nie tej osobie", adult: false },
  "imprezy-043": {
    category: "imprezy",
    text: "kupiłby prezent urodzinowy na stacji benzynowej po drodze",
    adult: false,
  },
  "imprezy-044": { category: "imprezy", text: "rozpisałby w arkuszu, kto co przynosi na imprezę", adult: false },
  "imprezy-045": { category: "imprezy", text: "zrobiłby gościom quiz o sobie samym", adult: false },
  "imprezy-046": { category: "imprezy", text: "przewróciłby choinkę na imprezie świątecznej", adult: false },
  "imprezy-047": { category: "imprezy", text: "wygrałby na weselu każdą zabawę na oczepinach", adult: false },
  "imprezy-048": {
    category: "imprezy",
    text: "przygotowałby na urodziny kumpla przemowę dłuższą niż sama impreza",
    adult: false,
  },
  "imprezy-049": {
    category: "imprezy",
    text: "zacząłby śpiewać „Sto lat” tak wysoko, że nikt nie dałby rady dołączyć",
    adult: false,
  },
  "imprezy-050": { category: "imprezy", text: "zdmuchnąłby świeczki na cudzym torcie", adult: false },
  "imprezy-051": {
    category: "imprezy",
    text: "przyniósłby na imprezę własne jedzenie, bo nie ufa cudzej kuchni",
    adult: false,
  },
  "imprezy-052": {
    category: "imprezy",
    text: "zaprosiłby na domówkę pół miasta jedną relacją na Instagramie",
    adult: false,
  },
  "imprezy-053": { category: "imprezy", text: "nauczyłby całą imprezę swojego układu tanecznego", adult: false },
  "imprezy-054": {
    category: "imprezy",
    text: "skończyłby imprezę na balkonie, rozmawiając z sąsiadem o sensie życia",
    adult: false,
  },
  "imprezy-055": {
    category: "imprezy",
    text: "stałby się duszą towarzystwa na imprezie, na której nikogo nie znał",
    adult: false,
  },
  "imprezy-056": { category: "imprezy", text: "spędziłby pół imprezy na szukaniu ładowarki do telefonu", adult: false },
  "imprezy-057": { category: "imprezy", text: "zwołałby wszystkich na after, a sam poszedł spać", adult: false },
  "imprezy-058": {
    category: "imprezy",
    text: "przyszedłby na sylwestra w dresie, choć obowiązywał strój wieczorowy",
    adult: false,
  },
  "imprezy-059": { category: "imprezy", text: "rozpaliłby grilla w ulewie, trzymając nad nim parasol", adult: false },
  "imprezy-060": { category: "imprezy", text: "puściłby gościom pokaz zdjęć ze swoich wakacji", adult: false },
  "imprezy-061": { category: "imprezy", text: "obraziłby się, że nikt nie spróbował jego ciasta", adult: false },
  "imprezy-062": { category: "imprezy", text: "dałby prezent z nieoderwaną metką z ceną", adult: false },
  "imprezy-063": { category: "imprezy", text: "przyszedłby na imprezę dzień po niej, bo pomylił daty", adult: false },
  "imprezy-064": {
    category: "imprezy",
    text: "zbierałby gościom szklanki do zmywania, zanim zdążą je dopić",
    adult: false,
  },
  "imprezy-065": { category: "imprezy", text: "przetańczyłby całe wesele z ciocią panny młodej", adult: false },
  "imprezy-066": { category: "imprezy", text: "zrobiłby wszystkim rano śniadanie po domówce", adult: false },
  "imprezy-067": {
    category: "imprezy",
    text: "zaplanowałby swoje urodziny co do minuty i obraził się na każde spóźnienie",
    adult: false,
  },
  "imprezy-068": { category: "imprezy", text: "oglądałby w kącie imprezy mecz na telefonie", adult: false },
  "imprezy-069": { category: "imprezy", text: "wynająłby na swoje trzydzieste urodziny dmuchany zamek", adult: false },
  "imprezy-070": {
    category: "imprezy",
    text: "zgubiłby się w drodze na imprezę, choć była dwie ulice dalej",
    adult: false,
  },
  "imprezy-071": {
    category: "imprezy",
    text: "liczyłby na imprezie kieliszki wszystkich, tylko nie swoje",
    adult: false,
  },
  "imprezy-072": {
    category: "imprezy",
    text: "postawiłby kolejkę całemu barowi i przez miesiąc jadł zupki chińskie",
    adult: false,
  },
  "imprezy-073": {
    category: "imprezy",
    text: "obudziłby się po imprezie z nową fryzurą, zrobioną przez kumpla",
    adult: false,
  },
  "imprezy-074": {
    category: "imprezy",
    text: "zaprosiłby crusha na imprezę i przez cały wieczór bał się do niego podejść",
    adult: false,
  },
  "imprezy-075": {
    category: "imprezy",
    text: "wyszedłby z imprezy z inną osobą niż ta, z którą przyszedł",
    adult: false,
  },
  "imprezy-076": {
    category: "imprezy",
    text: "pocałowałby kogoś pod jemiołą, powołując się na tradycję",
    adult: false,
  },
  "imprezy-077": {
    category: "imprezy",
    text: "przygotowałby poncz tak mocny, że impreza skończyłaby się przed północą",
    adult: true,
  },
  "imprezy-078": {
    category: "imprezy",
    text: "rozpłakałby się po trzech drinkach przy pierwszej smutnej piosence",
    adult: false,
  },
  "imprezy-079": {
    category: "imprezy",
    text: "zasnąłby na imprezie z pełnym kieliszkiem w ręce, nie wylewając ani kropli",
    adult: false,
  },
  "imprezy-080": {
    category: "imprezy",
    text: "przyniósłby na domówkę jedną butelkę, a wyszedł z trzema",
    adult: false,
  },
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
  "przyszlosc-011": { category: "przyszlosc", text: "wziąłby ślub w Las Vegas", adult: false },
  "przyszlosc-012": { category: "przyszlosc", text: "wróciłby do swojej dawnej szkoły jako nauczyciel", adult: false },
  "przyszlosc-013": { category: "przyszlosc", text: "miałby w domu więcej kotów niż mebli", adult: false },
  "przyszlosc-014": { category: "przyszlosc", text: "dożyłby setki", adult: false },
  "przyszlosc-015": { category: "przyszlosc", text: "rzuciłby korpo i otworzył food trucka", adult: false },
  "przyszlosc-016": { category: "przyszlosc", text: "przepuściłby wygraną w lotto w jeden rok", adult: false },
  "przyszlosc-017": { category: "przyszlosc", text: "zagrałby w reklamie telewizyjnej", adult: false },
  "przyszlosc-018": { category: "przyszlosc", text: "zbudowałby dom własnymi rękami", adult: false },
  "przyszlosc-019": { category: "przyszlosc", text: "mieszkałby za dziesięć lat na innym kontynencie", adult: false },
  "przyszlosc-020": { category: "przyszlosc", text: "wynalazłby coś, czego będą używać wszyscy", adult: false },
  "przyszlosc-021": { category: "przyszlosc", text: "wziąłby ślub z kimś poznanym na wakacjach", adult: false },
  "przyszlosc-022": { category: "przyszlosc", text: "miałby na koncie trzy rozwody", adult: false },
  "przyszlosc-023": {
    category: "przyszlosc",
    text: "otworzyłby własny pub i był w nim najlepszym klientem",
    adult: false,
  },
  "przyszlosc-024": { category: "przyszlosc", text: "zostałby zawodowym degustatorem piwa", adult: false },
  "przyszlosc-025": { category: "przyszlosc", text: "poznałby miłość życia w aplikacji randkowej", adult: true },
  "przyszlosc-026": { category: "przyszlosc", text: "wróciłby do ex po dziesięciu latach", adult: false },
  "przyszlosc-027": { category: "przyszlosc", text: "wystąpiłby w randkowym reality show", adult: false },

  "przyszlosc-028": {
    category: "przyszlosc",
    text: "kandydowałby na prezydenta z jednym punktem programu",
    adult: false,
  },
  "przyszlosc-029": { category: "przyszlosc", text: "zagrałby w filmie, który dostanie Oscara", adult: false },
  "przyszlosc-030": { category: "przyszlosc", text: "nigdy nie wyprowadziłby się z rodzinnego miasta", adult: false },
  "przyszlosc-031": { category: "przyszlosc", text: "kupiłby własną wyspę i nikogo na nią nie zaprosił", adult: false },
  "przyszlosc-032": { category: "przyszlosc", text: "pracowałby zdalnie z plaży na drugim końcu świata", adult: false },
  "przyszlosc-033": { category: "przyszlosc", text: "ogrywałby na starość wnuki na konsoli", adult: false },
  "przyszlosc-034": { category: "przyszlosc", text: "trafiłby do Księgi rekordów Guinnessa", adult: false },
  "przyszlosc-035": { category: "przyszlosc", text: "przeszedłby na emeryturę przed czterdziestką", adult: false },
  "przyszlosc-036": {
    category: "przyszlosc",
    text: "założyłby zespół, który zagra na wielkim festiwalu",
    adult: false,
  },
  "przyszlosc-037": { category: "przyszlosc", text: "zamieszkałby na stałe w kamperze", adult: false },
  "przyszlosc-038": {
    category: "przyszlosc",
    text: "chodziłby na randki z aplikacji jeszcze na emeryturze",
    adult: true,
  },
  "przyszlosc-039": { category: "przyszlosc", text: "zostałby barmanem na Ibizie", adult: false },
  "przyszlosc-040": { category: "przyszlosc", text: "miałby romans z kimś sławnym", adult: false },
  "przyszlosc-041": { category: "przyszlosc", text: "zostałby słynnym youtuberem od recenzji kebabów", adult: false },
  "przyszlosc-042": { category: "przyszlosc", text: "otworzyłby własne schronisko dla zwierząt", adult: false },
  "przyszlosc-043": {
    category: "przyszlosc",
    text: "zostałby profesorem i wykładał to, z czego sam ledwo zdał",
    adult: false,
  },
  "przyszlosc-044": {
    category: "przyszlosc",
    text: "wydałby autobiografię, zanim skończy trzydzieści lat",
    adult: false,
  },
  "przyszlosc-045": {
    category: "przyszlosc",
    text: "wzbogaciłby się na pomyśle, który wszyscy wyśmiali",
    adult: false,
  },
  "przyszlosc-046": { category: "przyszlosc", text: "zasiadłby w jury programu talentów", adult: false },
  "przyszlosc-047": {
    category: "przyszlosc",
    text: "zostałby ulubionym wujkiem albo ulubioną ciocią wszystkich dzieci w rodzinie",
    adult: false,
  },
  "przyszlosc-048": { category: "przyszlosc", text: "miałby za dziesięć lat ten sam telefon co dziś", adult: false },
  "przyszlosc-049": { category: "przyszlosc", text: "założyłby własną religię opartą na drzemkach", adult: false },
  "przyszlosc-050": {
    category: "przyszlosc",
    text: "kupiłby zamek w ruinie i odnawiał go do końca życia",
    adult: false,
  },
  "przyszlosc-051": {
    category: "przyszlosc",
    text: "zostałby prezesem firmy, w której zaczynał od parzenia kawy",
    adult: false,
  },
  "przyszlosc-052": { category: "przyszlosc", text: "zamieszkałby jako dorosły w domku na drzewie", adult: false },
  "przyszlosc-053": {
    category: "przyszlosc",
    text: "odkryłby nowy gatunek żuka i nazwał go swoim imieniem",
    adult: false,
  },
  "przyszlosc-054": { category: "przyszlosc", text: "prowadziłby własny program kulinarny w telewizji", adult: false },
  "przyszlosc-055": { category: "przyszlosc", text: "pojechałby na igrzyska olimpijskie w curlingu", adult: false },
  "przyszlosc-056": {
    category: "przyszlosc",
    text: "dostałby Nagrodę Nobla, a w przemowie podziękował swojemu kotu",
    adult: false,
  },
  "przyszlosc-057": {
    category: "przyszlosc",
    text: "miałby na starość garaż pełen „przydatnych rzeczy”",
    adult: false,
  },
  "przyszlosc-058": {
    category: "przyszlosc",
    text: "nauczyłby się grać na pięciu instrumentach i nie skończył żadnej piosenki",
    adult: false,
  },
  "przyszlosc-059": {
    category: "przyszlosc",
    text: "założyłby rodzinną firmę i zatrudnił w niej wszystkich kuzynów",
    adult: false,
  },
  "przyszlosc-060": {
    category: "przyszlosc",
    text: "przeprowadziłby się do Japonii, bo obejrzał za dużo anime",
    adult: false,
  },
  "przyszlosc-061": {
    category: "przyszlosc",
    text: "zostałby pilotem samolotu i witał pasażerów żartami",
    adult: false,
  },
  "przyszlosc-062": {
    category: "przyszlosc",
    text: "zostałby na starość osiedlowym szeryfem, który pilnuje parkowania",
    adult: false,
  },
  "przyszlosc-063": { category: "przyszlosc", text: "zostałby selekcjonerem reprezentacji Polski", adult: false },
  "przyszlosc-064": { category: "przyszlosc", text: "zrobiłby karierę w Hollywood jako kaskader", adult: false },
  "przyszlosc-065": { category: "przyszlosc", text: "wygrałby „Taniec z gwiazdami”", adult: false },
  "przyszlosc-066": {
    category: "przyszlosc",
    text: "jeździłby na Pol’and’Rock jeszcze po siedemdziesiątce",
    adult: false,
  },
  "przyszlosc-067": { category: "przyszlosc", text: "przeprowadzałby się co roku do innego miasta", adult: false },
  "przyszlosc-068": {
    category: "przyszlosc",
    text: "zostałby stałym ekspertem w telewizji śniadaniowej",
    adult: false,
  },
  "przyszlosc-069": {
    category: "przyszlosc",
    text: "miałby dom z basenem i nigdy by do niego nie wszedł",
    adult: false,
  },
  "przyszlosc-070": {
    category: "przyszlosc",
    text: "zostałby honorowym obywatelem małego miasteczka we Włoszech",
    adult: false,
  },
  "przyszlosc-071": { category: "przyszlosc", text: "wynalazłby lek na kaca", adult: false },
  "przyszlosc-072": {
    category: "przyszlosc",
    text: "założyłby biuro matrymonialne i sam nie znalazł nikogo",
    adult: false,
  },
  "przyszlosc-073": {
    category: "przyszlosc",
    text: "miałby piwniczkę z winami wartą więcej niż mieszkanie",
    adult: false,
  },
  "przyszlosc-074": {
    category: "przyszlosc",
    text: "dostawałby od fanów listy miłosne i odpisywał na każdy",
    adult: false,
  },
  "przyszlosc-075": {
    category: "przyszlosc",
    text: "prowadziłby podcast o randkach i opowiadał w nim nasze historie",
    adult: false,
  },
  "przyszlosc-076": {
    category: "przyszlosc",
    text: "bawiłby się na własnym weselu tak, że nie pamiętałby oczepin",
    adult: true,
  },
  "przyszlosc-077": {
    category: "przyszlosc",
    text: "poszedłby na wesele swojej byłej sympatii i bawił się najlepiej ze wszystkich",
    adult: false,
  },
  "przyszlosc-078": {
    category: "przyszlosc",
    text: "trafiłby na okładkę magazynu jako najseksowniejsza osoba roku",
    adult: false,
  },
  "przyszlosc-079": { category: "przyszlosc", text: "popłynąłby w rejs dla singli i wrócił zaręczony", adult: false },
  "przyszlosc-080": {
    category: "przyszlosc",
    text: "urządziłby na czterdzieste urodziny imprezę jak na osiemnastce",
    adult: false,
  },
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
    adult: false,
  },
  "wpadki-i-obciach-022": {
    category: "wpadki-i-obciach",
    text: "wysłałby pikantną wiadomość na rodzinną grupę",
    adult: true,
  },
  "wpadki-i-obciach-023": {
    category: "wpadki-i-obciach",
    text: "dałby się przyłapać rodzicom na całowaniu",
    adult: false,
  },
  "wpadki-i-obciach-024": {
    category: "wpadki-i-obciach",
    text: "obudziłby się po imprezie z czyimś numerem napisanym na ręce",
    adult: false,
  },
  "wpadki-i-obciach-025": { category: "wpadki-i-obciach", text: "próbowałby tańczyć na rurze i spadł", adult: false },
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

  "wpadki-i-obciach-028": {
    category: "wpadki-i-obciach",
    text: "powiedziałby „pa, kocham cię” do szefa przez telefon",
    adult: false,
  },
  "wpadki-i-obciach-029": { category: "wpadki-i-obciach", text: "odjechałby w sklepie cudzym wózkiem", adult: false },
  "wpadki-i-obciach-030": {
    category: "wpadki-i-obciach",
    text: "udostępniłby na spotkaniu ekran z czymś, czego nikt nie miał zobaczyć",
    adult: false,
  },
  "wpadki-i-obciach-031": {
    category: "wpadki-i-obciach",
    text: "zgubiłby samochód na parkingu pod galerią",
    adult: false,
  },
  "wpadki-i-obciach-032": {
    category: "wpadki-i-obciach",
    text: "wsiadłby do obcego auta, bo było w tym samym kolorze",
    adult: false,
  },
  "wpadki-i-obciach-033": {
    category: "wpadki-i-obciach",
    text: "pomyliłby sól z cukrem w torcie urodzinowym",
    adult: false,
  },
  "wpadki-i-obciach-034": {
    category: "wpadki-i-obciach",
    text: "podałby rękę komuś, kto chciał przybić piątkę",
    adult: false,
  },
  "wpadki-i-obciach-035": {
    category: "wpadki-i-obciach",
    text: "zacząłby klaskać w samolocie po lądowaniu",
    adult: false,
  },
  "wpadki-i-obciach-036": {
    category: "wpadki-i-obciach",
    text: "oblałby się kawą tuż przed rozmową o pracę",
    adult: false,
  },
  "wpadki-i-obciach-037": {
    category: "wpadki-i-obciach",
    text: "odchyliłby się na krześle i runął do tyłu przy wszystkich",
    adult: false,
  },
  "wpadki-i-obciach-038": {
    category: "wpadki-i-obciach",
    text: "zadzwoniłby po pijaku do mamy, myśląc, że zamawia taksówkę",
    adult: true,
  },
  "wpadki-i-obciach-039": {
    category: "wpadki-i-obciach",
    text: "poderwałby na imprezie kogoś, kto w poniedziałek okazał się jego nowym szefem",
    adult: false,
  },
  "wpadki-i-obciach-040": {
    category: "wpadki-i-obciach",
    text: "wypiłby za dużo na pierwszym spotkaniu z rodzicami drugiej połówki",
    adult: true,
  },
  "wpadki-i-obciach-041": {
    category: "wpadki-i-obciach",
    text: "odpowiedziałby komuś, kto w słuchawkach rozmawiał z kimś innym",
    adult: false,
  },
  "wpadki-i-obciach-042": {
    category: "wpadki-i-obciach",
    text: "pomyliłby imiona bliźniaków, z którymi zna się od lat",
    adult: false,
  },
  "wpadki-i-obciach-043": {
    category: "wpadki-i-obciach",
    text: "kichnąłby głośno w najcichszym momencie egzaminu",
    adult: false,
  },
  "wpadki-i-obciach-044": {
    category: "wpadki-i-obciach",
    text: "zatrzasnąłby kluczyki w samochodzie z włączonym silnikiem",
    adult: false,
  },
  "wpadki-i-obciach-045": {
    category: "wpadki-i-obciach",
    text: "mignąłby w tle relacji na żywo w telewizji, dłubiąc w nosie",
    adult: false,
  },
  "wpadki-i-obciach-046": {
    category: "wpadki-i-obciach",
    text: "wysłałby list motywacyjny z nazwą zupełnie innej firmy",
    adult: false,
  },
  "wpadki-i-obciach-047": {
    category: "wpadki-i-obciach",
    text: "zrobiłby w muzeum zdjęcie z lampą błyskową tuż pod zakazem",
    adult: false,
  },
  "wpadki-i-obciach-048": {
    category: "wpadki-i-obciach",
    text: "śpiewałby latami piosenkę ze źle usłyszanym tekstem",
    adult: false,
  },
  "wpadki-i-obciach-049": {
    category: "wpadki-i-obciach",
    text: "rozdarłby spodnie, schylając się po coś przy wszystkich",
    adult: false,
  },
  "wpadki-i-obciach-050": {
    category: "wpadki-i-obciach",
    text: "wyszedłby od fryzjera z fryzurą, o którą nie prosił, i jeszcze podziękował",
    adult: false,
  },
  "wpadki-i-obciach-051": {
    category: "wpadki-i-obciach",
    text: "przedstawiłby się dwa razy tej samej osobie w ciągu jednego wieczoru",
    adult: false,
  },
  "wpadki-i-obciach-052": {
    category: "wpadki-i-obciach",
    text: "kupiłby bilety na bajkę zamiast na horror, bo pomylił seanse",
    adult: false,
  },
  "wpadki-i-obciach-053": {
    category: "wpadki-i-obciach",
    text: "utknąłby w windzie ze swoim dawnym wychowawcą",
    adult: false,
  },
  "wpadki-i-obciach-054": {
    category: "wpadki-i-obciach",
    text: "wrzuciłby przez przypadek do relacji filmik z przedniej kamery",
    adult: false,
  },
  "wpadki-i-obciach-055": {
    category: "wpadki-i-obciach",
    text: "uderzyłby głową w szafkę, którą sam przed chwilą otworzył",
    adult: false,
  },
  "wpadki-i-obciach-056": {
    category: "wpadki-i-obciach",
    text: "zasnąłby na wykładzie i obudził się z odciśniętą na policzku klawiaturą",
    adult: false,
  },
  "wpadki-i-obciach-057": {
    category: "wpadki-i-obciach",
    text: "nie wyciszyłby telefonu w teatrze, a ten zagrałby najgłupszy dzwonek",
    adult: false,
  },
  "wpadki-i-obciach-058": {
    category: "wpadki-i-obciach",
    text: "jechałby pół godziny złym autobusem, zanim to zauważy",
    adult: false,
  },
  "wpadki-i-obciach-059": {
    category: "wpadki-i-obciach",
    text: "przeprosiłby manekina, na którego wpadł w sklepie",
    adult: false,
  },
  "wpadki-i-obciach-060": {
    category: "wpadki-i-obciach",
    text: "przegadałby całą prezentację z rozpiętym rozporkiem",
    adult: false,
  },
  "wpadki-i-obciach-061": {
    category: "wpadki-i-obciach",
    text: "poprosiłby o rachunek kogoś, kto wcale nie był kelnerem",
    adult: false,
  },
  "wpadki-i-obciach-062": {
    category: "wpadki-i-obciach",
    text: "zjadłby frytkę z talerza obcej osoby, myśląc, że to jego stolik",
    adult: false,
  },
  "wpadki-i-obciach-063": {
    category: "wpadki-i-obciach",
    text: "przez rok mówiłby do kolegi złym imieniem, bo nie dosłyszał przy poznaniu",
    adult: false,
  },
  "wpadki-i-obciach-064": {
    category: "wpadki-i-obciach",
    text: "klaskałby w filharmonii, zanim utwór naprawdę się skończy",
    adult: false,
  },
  "wpadki-i-obciach-065": {
    category: "wpadki-i-obciach",
    text: "zapchałby toaletę podczas pierwszej wizyty u kogoś w domu",
    adult: false,
  },
  "wpadki-i-obciach-066": {
    category: "wpadki-i-obciach",
    text: "zostałby przyłapany na kłótni z samym sobą na głos",
    adult: false,
  },
  "wpadki-i-obciach-067": {
    category: "wpadki-i-obciach",
    text: "śmiałby się z żartu, którego nie zrozumiał, aż ktoś poprosi go o wyjaśnienie",
    adult: false,
  },
  "wpadki-i-obciach-068": {
    category: "wpadki-i-obciach",
    text: "odpowiedziałby na głos na retoryczne pytanie wykładowcy",
    adult: false,
  },
  "wpadki-i-obciach-069": {
    category: "wpadki-i-obciach",
    text: "przytrzasnąłby kurtkę drzwiami samochodu i jechał z nią powiewającą na zewnątrz",
    adult: false,
  },
  "wpadki-i-obciach-070": {
    category: "wpadki-i-obciach",
    text: "wpadłby do fontanny, cofając się do zdjęcia",
    adult: false,
  },
  "wpadki-i-obciach-071": {
    category: "wpadki-i-obciach",
    text: "obudziłby się z historią połączeń, której wolałby nie oglądać",
    adult: true,
  },
  "wpadki-i-obciach-072": {
    category: "wpadki-i-obciach",
    text: "celowałby w policzek przy pożegnaniu, a trafił w usta",
    adult: false,
  },
  "wpadki-i-obciach-073": {
    category: "wpadki-i-obciach",
    text: "poszedłby na randkę do knajpy, w której akurat siedzi jego ex",
    adult: false,
  },
  "wpadki-i-obciach-074": {
    category: "wpadki-i-obciach",
    text: "zostałby wyproszony z klubu za zbyt ekspresyjny taniec",
    adult: false,
  },
  "wpadki-i-obciach-075": {
    category: "wpadki-i-obciach",
    text: "dostałby rano SMS „było miło, odezwij się” z nieznanego numeru",
    adult: true,
  },
  "wpadki-i-obciach-076": {
    category: "wpadki-i-obciach",
    text: "próbowałby zmysłowo zdjąć sweter i utknął w nim głową",
    adult: true,
  },
  "wpadki-i-obciach-077": {
    category: "wpadki-i-obciach",
    text: "zaprosiłby do przytulańca kogoś, kto tylko szedł do łazienki",
    adult: false,
  },
  "wpadki-i-obciach-078": {
    category: "wpadki-i-obciach",
    text: "podrywałby kogoś przez pół wieczoru, nie zauważając obrączki",
    adult: false,
  },
  "wpadki-i-obciach-079": {
    category: "wpadki-i-obciach",
    text: "odebrałby wideorozmowę od mamy w nie najlepszym momencie",
    adult: false,
  },
  "wpadki-i-obciach-080": {
    category: "wpadki-i-obciach",
    text: "porwałby po kilku kieliszkach mikrofon na weselu i wygłosił mowę",
    adult: false,
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
    text: "przegapiłby wesele kuzyna, bo był w środku rajdu w grze online",
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
    adult: false,
  },
  "gry-i-internet-022": {
    category: "gry-i-internet",
    text: "zorganizowałby na Discordzie grę alkoholową w środę",
    adult: true,
  },
  "gry-i-internet-023": { category: "gry-i-internet", text: "poznałby drugą połówkę w grze online", adult: false },
  "gry-i-internet-024": {
    category: "gry-i-internet",
    text: "zniknąłby z Discorda w pół zdania, bo „ktoś przyszedł”",
    adult: false,
  },
  "gry-i-internet-025": {
    category: "gry-i-internet",
    text: "sprzedałby konto w grze, żeby postawić wszystkim kolejkę",
    adult: false,
  },
  "gry-i-internet-026": {
    category: "gry-i-internet",
    text: "nie dałby nikomu zajrzeć do swojej historii przeglądarki",
    adult: false,
  },
  "gry-i-internet-027": {
    category: "gry-i-internet",
    text: "grałby rankingi po pijaku i spadł o dwie ligi",
    adult: true,
  },

  "gry-i-internet-028": { category: "gry-i-internet", text: "odpowiadałby na każdą wiadomość memem", adult: false },
  "gry-i-internet-029": {
    category: "gry-i-internet",
    text: "miałby więcej znajomych w internecie niż w realu",
    adult: false,
  },
  "gry-i-internet-030": {
    category: "gry-i-internet",
    text: "uwierzyłby w fake newsa i rozesłał go całej rodzinie",
    adult: false,
  },
  "gry-i-internet-031": {
    category: "gry-i-internet",
    text: "fotografowałby każdy posiłek, zanim ktokolwiek go tknie",
    adult: false,
  },
  "gry-i-internet-032": {
    category: "gry-i-internet",
    text: "prowadziłby konto swojego kota na Instagramie",
    adult: false,
  },
  "gry-i-internet-033": {
    category: "gry-i-internet",
    text: "kliknąłby w link „Wygrałeś nowego iPhone’a”",
    adult: false,
  },
  "gry-i-internet-034": {
    category: "gry-i-internet",
    text: "kłóciłby się z czatbotem, aż ten przyzna mu rację",
    adult: false,
  },
  "gry-i-internet-035": { category: "gry-i-internet", text: "kupiłby nowy komputer tylko do jednej gry", adult: false },
  "gry-i-internet-036": {
    category: "gry-i-internet",
    text: "wybierałby film dłużej, niż potem go oglądał",
    adult: false,
  },
  "gry-i-internet-037": {
    category: "gry-i-internet",
    text: "wyciszyłby wszystkie grupowe czaty i nic nie wiedział o planach",
    adult: false,
  },
  "gry-i-internet-038": {
    category: "gry-i-internet",
    text: "wysłałby w nocy dwuznacznego mema i udawał, że to żart",
    adult: false,
  },
  "gry-i-internet-039": {
    category: "gry-i-internet",
    text: "zamówiłby coś w internecie po pijaku i nie pamiętał co",
    adult: true,
  },
  "gry-i-internet-040": { category: "gry-i-internet", text: "trafiłby na Tinderze na własnego kuzyna", adult: true },
  "gry-i-internet-041": {
    category: "gry-i-internet",
    text: "kupiłby fotel gamingowy droższy niż swoje łóżko",
    adult: false,
  },
  "gry-i-internet-042": {
    category: "gry-i-internet",
    text: "miałby w grze nick, którego wstydziłby się wypowiedzieć na głos",
    adult: false,
  },
  "gry-i-internet-043": {
    category: "gry-i-internet",
    text: "postawiłby dla nas własny serwer gry i grał na nim sam",
    adult: false,
  },
  "gry-i-internet-044": {
    category: "gry-i-internet",
    text: "kupiłby grę w przedsprzedaży, nie widząc ani jednego zwiastuna",
    adult: false,
  },
  "gry-i-internet-045": {
    category: "gry-i-internet",
    text: "nagrałby na TikToka taniec, którego wstydziłby się do końca życia",
    adult: false,
  },
  "gry-i-internet-046": {
    category: "gry-i-internet",
    text: "zostałby surowym moderatorem forum o kaktusach",
    adult: false,
  },
  "gry-i-internet-047": {
    category: "gry-i-internet",
    text: "chodziłby po mieście w słuchawkach gamingowych z mikrofonem",
    adult: false,
  },
  "gry-i-internet-048": {
    category: "gry-i-internet",
    text: "dzieliłby konto na Netflixie z dziesięcioma osobami, których nie zna",
    adult: false,
  },
  "gry-i-internet-049": {
    category: "gry-i-internet",
    text: "wymieniałby telefon na nowy co roku, choć stary działa",
    adult: false,
  },
  "gry-i-internet-050": { category: "gry-i-internet", text: "nie wyłączałby komputera miesiącami", adult: false },
  "gry-i-internet-051": { category: "gry-i-internet", text: "robiłby kopię zapasową kopii zapasowej", adult: false },
  "gry-i-internet-052": { category: "gry-i-internet", text: "miałby wszędzie to samo hasło: „123456”", adult: false },
  "gry-i-internet-053": {
    category: "gry-i-internet",
    text: "wystawiałby każdej knajpie długą recenzję w Google Maps",
    adult: false,
  },
  "gry-i-internet-054": { category: "gry-i-internet", text: "edytowałby Wikipedię, żeby wygrać kłótnię", adult: false },
  "gry-i-internet-055": {
    category: "gry-i-internet",
    text: "trzymałby memy w folderach posegregowanych tematycznie",
    adult: false,
  },
  "gry-i-internet-056": {
    category: "gry-i-internet",
    text: "namówiłby kogoś na swoją ulubioną grę, a po tygodniu już z nim przegrywał",
    adult: false,
  },
  "gry-i-internet-057": {
    category: "gry-i-internet",
    text: "obejrzałby cały sezon serialu w jedną noc i poszedł prosto do pracy",
    adult: false,
  },
  "gry-i-internet-058": {
    category: "gry-i-internet",
    text: "założyłby podcast, w którym gada sam do siebie o grach",
    adult: false,
  },
  "gry-i-internet-059": {
    category: "gry-i-internet",
    text: "napisałby do sklepu internetowego reklamację na trzy strony",
    adult: false,
  },
  "gry-i-internet-060": {
    category: "gry-i-internet",
    text: "nagrywałby każdy swój mecz i analizował go potem klatka po klatce",
    adult: false,
  },
  "gry-i-internet-061": {
    category: "gry-i-internet",
    text: "polubiłby własny post, żeby nie wisiało na nim zero",
    adult: false,
  },
  "gry-i-internet-062": {
    category: "gry-i-internet",
    text: "pisałby na czacie ściany tekstu, gdy wszyscy siedzą na kanale głosowym",
    adult: false,
  },
  "gry-i-internet-063": {
    category: "gry-i-internet",
    text: "znałby na pamięć hasła do Wi-Fi wszystkich znajomych",
    adult: false,
  },
  "gry-i-internet-064": {
    category: "gry-i-internet",
    text: "naprawiałby rodzinie komputery przez telefon w każde święta",
    adult: false,
  },
  "gry-i-internet-065": {
    category: "gry-i-internet",
    text: "ustawiłby limit czasu na telefonie i co wieczór klikał „ignoruj limit”",
    adult: false,
  },
  "gry-i-internet-066": {
    category: "gry-i-internet",
    text: "kupiłby klawiaturę mechaniczną tak głośną, że słychać ją na całym Discordzie",
    adult: false,
  },
  "gry-i-internet-067": {
    category: "gry-i-internet",
    text: "prowadziłby fanpage swojej ulubionej marki pierogów",
    adult: false,
  },
  "gry-i-internet-068": {
    category: "gry-i-internet",
    text: "oglądałby zwiastun gry tyle razy, że znałby w nim każdą klatkę",
    adult: false,
  },
  "gry-i-internet-069": {
    category: "gry-i-internet",
    text: "wymyśliłby teorię spiskową o fabule gry i bronił jej latami",
    adult: false,
  },
  "gry-i-internet-070": {
    category: "gry-i-internet",
    text: "wysyłałby nam memy, które cały internet widział tydzień temu",
    adult: false,
  },
  "gry-i-internet-071": {
    category: "gry-i-internet",
    text: "pisałby z kimś pół roku na Discordzie i bał się spotkać na żywo",
    adult: false,
  },
  "gry-i-internet-072": {
    category: "gry-i-internet",
    text: "odpisałby crushowi dopiero po kwadransie, żeby nie wyglądać na zdesperowanego",
    adult: false,
  },
  "gry-i-internet-073": {
    category: "gry-i-internet",
    text: "wrzucałby relacje z imprez tylko z myślą o tym, że obejrzy je ex",
    adult: false,
  },
  "gry-i-internet-074": {
    category: "gry-i-internet",
    text: "polubiłby crushowi zdjęcie o trzeciej w nocy i spanikował",
    adult: false,
  },
  "gry-i-internet-075": {
    category: "gry-i-internet",
    text: "wrzuciłby na Tindera zdjęcie sprzed dziesięciu lat",
    adult: true,
  },
  "gry-i-internet-076": {
    category: "gry-i-internet",
    text: "umówiłby się na randkę przez grę i przyszedł w koszulce z tej gry",
    adult: false,
  },
  "gry-i-internet-077": {
    category: "gry-i-internet",
    text: "flirtowałby z czatbotem, bo ten zawsze odpisuje",
    adult: false,
  },
  "gry-i-internet-078": {
    category: "gry-i-internet",
    text: "wysyłałby nam zrzuty rozmów z aplikacji randkowej z prośbą o pomoc",
    adult: true,
  },
  "gry-i-internet-079": {
    category: "gry-i-internet",
    text: "wysłałby komuś poznanemu w grze pizzę pod drzwi, żeby zrobić wrażenie",
    adult: false,
  },
  "gry-i-internet-080": {
    category: "gry-i-internet",
    text: "przesuwałby wszystkich w prawo, a potem nie odpisywał nikomu",
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
    text: "nocowałby na szczycie, żeby zobaczyć wschód słońca",
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
    text: "pojechałby na lotnisko nie tego dnia, co trzeba",
    adult: false,
  },
  "podroze-i-przygody-021": { category: "podroze-i-przygody", text: "przeżyłby wakacyjny romans", adult: false },
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
    adult: false,
  },
  "podroze-i-przygody-026": {
    category: "podroze-i-przygody",
    text: "zakochałby się w przewodniku wycieczki",
    adult: false,
  },
  "podroze-i-przygody-027": {
    category: "podroze-i-przygody",
    text: "przywiózłby w walizce więcej wina niż ubrań",
    adult: false,
  },

  "podroze-i-przygody-028": {
    category: "podroze-i-przygody",
    text: "zarezerwowałby nocleg w innym mieście o tej samej nazwie",
    adult: false,
  },
  "podroze-i-przygody-029": {
    category: "podroze-i-przygody",
    text: "zająłby parawanem pół plaży nad Bałtykiem",
    adult: false,
  },
  "podroze-i-przygody-030": {
    category: "podroze-i-przygody",
    text: "próbowałby przemycić przez kontrolę na lotnisku słoik bigosu",
    adult: false,
  },
  "podroze-i-przygody-031": {
    category: "podroze-i-przygody",
    text: "budziłby wszystkich o szóstej na zwiedzanie",
    adult: false,
  },
  "podroze-i-przygody-032": {
    category: "podroze-i-przygody",
    text: "wróciłby z tygodnia w Hiszpanii z hiszpańskim akcentem",
    adult: false,
  },
  "podroze-i-przygody-033": {
    category: "podroze-i-przygody",
    text: "rozbiłby namiot w środku burzy, bo „to przygoda”",
    adult: false,
  },
  "podroze-i-przygody-034": {
    category: "podroze-i-przygody",
    text: "targowałby się na egipskim bazarze o każdą złotówkę",
    adult: false,
  },
  "podroze-i-przygody-035": {
    category: "podroze-i-przygody",
    text: "przejechałby pół Europy, żeby zjeść jedną konkretną pizzę",
    adult: false,
  },
  "podroze-i-przygody-036": {
    category: "podroze-i-przygody",
    text: "wyniósłby z hotelu wszystkie szampony i kapcie",
    adult: false,
  },
  "podroze-i-przygody-037": {
    category: "podroze-i-przygody",
    text: "wybrałby lot z trzema przesiadkami, żeby oszczędzić pięćdziesiąt złotych",
    adult: false,
  },
  "podroze-i-przygody-038": {
    category: "podroze-i-przygody",
    text: "pojechałby do Pragi na jedno piwo i wrócił po tygodniu",
    adult: true,
  },
  "podroze-i-przygody-039": {
    category: "podroze-i-przygody",
    text: "umówiłby się na wakacjach na randkę z kimś bez wspólnego języka",
    adult: false,
  },
  "podroze-i-przygody-040": {
    category: "podroze-i-przygody",
    text: "zamówiłby w samolocie drinka o siódmej rano, „bo jest urlop”",
    adult: false,
  },
  "podroze-i-przygody-041": {
    category: "podroze-i-przygody",
    text: "spakowałby na tydzień walizkę książek i przeczytał tylko menu",
    adult: false,
  },
  "podroze-i-przygody-042": {
    category: "podroze-i-przygody",
    text: "spakowałby walizkę tak ciężką, że za nadbagaż zapłaciłby więcej niż za bilet",
    adult: false,
  },
  "podroze-i-przygody-043": {
    category: "podroze-i-przygody",
    text: "wybierałby hotel wyłącznie po zdjęciach śniadania",
    adult: false,
  },
  "podroze-i-przygody-044": {
    category: "podroze-i-przygody",
    text: "opalałby się nad Bałtykiem w kurtce i był zachwycony",
    adult: false,
  },
  "podroze-i-przygody-045": {
    category: "podroze-i-przygody",
    text: "przywiózłby z Zakopanego ciupagę i powiesił ją nad łóżkiem",
    adult: false,
  },
  "podroze-i-przygody-046": {
    category: "podroze-i-przygody",
    text: "zjadłby krewetki z przydrożnego baru i spędził resztę urlopu w łazience",
    adult: false,
  },
  "podroze-i-przygody-047": {
    category: "podroze-i-przygody",
    text: "mówiłby „grazie” w każdym kraju, nawet w Niemczech",
    adult: false,
  },
  "podroze-i-przygody-048": {
    category: "podroze-i-przygody",
    text: "wynająłby kampera i utknął nim na pierwszym rondzie",
    adult: false,
  },
  "podroze-i-przygody-049": {
    category: "podroze-i-przygody",
    text: "przyjechałby na lotnisko pięć godzin przed odlotem",
    adult: false,
  },
  "podroze-i-przygody-050": {
    category: "podroze-i-przygody",
    text: "zapłaciłby za pokój z widokiem na morze i patrzył na parking",
    adult: false,
  },
  "podroze-i-przygody-051": {
    category: "podroze-i-przygody",
    text: "nosiłby w Polsce sombrero przywiezione z wakacji",
    adult: false,
  },
  "podroze-i-przygody-052": {
    category: "podroze-i-przygody",
    text: "objechałby Islandię dookoła rowerem",
    adult: false,
  },
  "podroze-i-przygody-053": {
    category: "podroze-i-przygody",
    text: "przespałby noc w hamaku w środku lasu",
    adult: false,
  },
  "podroze-i-przygody-054": {
    category: "podroze-i-przygody",
    text: "namówiłby wszystkich na wycieczkę i zaspał na zbiórkę",
    adult: false,
  },
  "podroze-i-przygody-055": {
    category: "podroze-i-przygody",
    text: "zrobiłby zdjęcie, „podtrzymując” Krzywą Wieżę w Pizie",
    adult: false,
  },
  "podroze-i-przygody-056": {
    category: "podroze-i-przygody",
    text: "dałby się okraść mewie z gofra nad morzem",
    adult: false,
  },
  "podroze-i-przygody-057": {
    category: "podroze-i-przygody",
    text: "pojechałby na all inclusive i ani razu nie wyszedł poza hotel",
    adult: false,
  },
  "podroze-i-przygody-058": {
    category: "podroze-i-przygody",
    text: "wypłynąłby żaglówką na jezioro, nie umiejąc żeglować",
    adult: false,
  },
  "podroze-i-przygody-059": {
    category: "podroze-i-przygody",
    text: "wróciłby z urlopu opalony tylko z jednej strony",
    adult: false,
  },
  "podroze-i-przygody-060": {
    category: "podroze-i-przygody",
    text: "pojechałby w Anglii pod prąd, zapominając o ruchu lewostronnym",
    adult: false,
  },
  "podroze-i-przygody-061": {
    category: "podroze-i-przygody",
    text: "jadłby za granicą tylko to, co zna z Polski",
    adult: false,
  },
  "podroze-i-przygody-062": {
    category: "podroze-i-przygody",
    text: "spędziłby tydzień w Paryżu i nie zobaczył wieży Eiffla",
    adult: false,
  },
  "podroze-i-przygody-063": {
    category: "podroze-i-przygody",
    text: "kupiłby na wycieczce zestaw garnków z pokazu",
    adult: false,
  },
  "podroze-i-przygody-064": {
    category: "podroze-i-przygody",
    text: "wypożyczyłby skuter w Grecji i wrócił cały w plastrach",
    adult: false,
  },
  "podroze-i-przygody-065": {
    category: "podroze-i-przygody",
    text: "wysłałby z wakacji pocztówki, które dojdą po jego powrocie",
    adult: false,
  },
  "podroze-i-przygody-066": {
    category: "podroze-i-przygody",
    text: "szukałby na wakacjach Wi-Fi bardziej niż zabytków",
    adult: false,
  },
  "podroze-i-przygody-067": {
    category: "podroze-i-przygody",
    text: "stałby dwie godziny w kolejce do jednego zdjęcia na Instagram",
    adult: false,
  },
  "podroze-i-przygody-068": {
    category: "podroze-i-przygody",
    text: "nurkowałby z rekinami, choć panicznie boi się gołębi",
    adult: false,
  },
  "podroze-i-przygody-069": {
    category: "podroze-i-przygody",
    text: "poprawiałby przewodnika wycieczki, bo przeczytał coś w internecie",
    adult: false,
  },
  "podroze-i-przygody-070": {
    category: "podroze-i-przygody",
    text: "wróciłby z wakacji z kotem przygarniętym z ulicy",
    adult: false,
  },
  "podroze-i-przygody-071": {
    category: "podroze-i-przygody",
    text: "poszedłby na nocną imprezę na plaży i obudził się na leżaku",
    adult: false,
  },
  "podroze-i-przygody-072": {
    category: "podroze-i-przygody",
    text: "podrywałby w obcym kraju zdaniami z rozmówek",
    adult: false,
  },
  "podroze-i-przygody-073": {
    category: "podroze-i-przygody",
    text: "wypiłby przed kontrolą na lotnisku całe wino, którego nie mógł wnieść na pokład",
    adult: true,
  },
  "podroze-i-przygody-074": {
    category: "podroze-i-przygody",
    text: "wróciłby z Oktoberfestu w skórzanych spodenkach i z kuflem",
    adult: false,
  },
  "podroze-i-przygody-075": {
    category: "podroze-i-przygody",
    text: "trafiłby przez przypadek na plażę nudystów i został",
    adult: true,
  },
  "podroze-i-przygody-076": {
    category: "podroze-i-przygody",
    text: "spróbowałby w jeden wieczór wszystkich lokalnych trunków",
    adult: true,
  },
  "podroze-i-przygody-077": {
    category: "podroze-i-przygody",
    text: "wróciłby z urlopu z numerami telefonów zapisanymi w pięciu językach",
    adult: false,
  },
  "podroze-i-przygody-078": {
    category: "podroze-i-przygody",
    text: "nauczyłby się w każdym języku tylko jednego zdania: „jeszcze jedno piwo”",
    adult: false,
  },
  "podroze-i-przygody-079": {
    category: "podroze-i-przygody",
    text: "spędziłby cały urlop w barze przy basenie i nazwał to zwiedzaniem",
    adult: false,
  },
  "podroze-i-przygody-080": {
    category: "podroze-i-przygody",
    text: "popłynąłby w rejs po Mazurach od portu do portu, czyli od baru do baru",
    adult: false,
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
    adult: false,
  },
  "sport-i-wyzwania-023": {
    category: "sport-i-wyzwania",
    text: "poszedłby pobiegać z kacem, żeby „wypocić” imprezę",
    adult: false,
  },
  "sport-i-wyzwania-024": {
    category: "sport-i-wyzwania",
    text: "przebiegłby nago przez boisko w trakcie meczu",
    adult: true,
  },
  "sport-i-wyzwania-025": {
    category: "sport-i-wyzwania",
    text: "umówiłby się na randkę na ściance wspinaczkowej",
    adult: false,
  },
  "sport-i-wyzwania-026": {
    category: "sport-i-wyzwania",
    text: "zapisałby się na bieg z piwem na każdym kilometrze",
    adult: true,
  },
  "sport-i-wyzwania-027": {
    category: "sport-i-wyzwania",
    text: "chodziłby na mecze wyłącznie dla piwa na trybunach",
    adult: false,
  },

  "sport-i-wyzwania-028": {
    category: "sport-i-wyzwania",
    text: "chodziłby w kółko po mieszkaniu, żeby dobić do dziesięciu tysięcy kroków",
    adult: false,
  },
  "sport-i-wyzwania-029": {
    category: "sport-i-wyzwania",
    text: "wytrzymałby w desce dłużej niż wszyscy, byle wygrać",
    adult: false,
  },
  "sport-i-wyzwania-030": {
    category: "sport-i-wyzwania",
    text: "rozciągałby się przed meczem dłużej, niż potem grał",
    adult: false,
  },
  "sport-i-wyzwania-031": {
    category: "sport-i-wyzwania",
    text: "kibicowałby drużynie tylko dlatego, że ma ładne stroje",
    adult: false,
  },
  "sport-i-wyzwania-032": {
    category: "sport-i-wyzwania",
    text: "przegrałby w szachy z komputerem na najłatwiejszym poziomie",
    adult: false,
  },
  "sport-i-wyzwania-033": {
    category: "sport-i-wyzwania",
    text: "sędziowałby mecz na podwórku i każdemu dał kartkę",
    adult: false,
  },
  "sport-i-wyzwania-034": {
    category: "sport-i-wyzwania",
    text: "opowiadałby o rybie „taaakiej”, choć nic nie złowił",
    adult: false,
  },
  "sport-i-wyzwania-035": {
    category: "sport-i-wyzwania",
    text: "utknąłby w błocie na biegu z przeszkodami",
    adult: false,
  },
  "sport-i-wyzwania-036": {
    category: "sport-i-wyzwania",
    text: "spróbowałby salta na trampolinie po dwudziestu latach przerwy",
    adult: false,
  },
  "sport-i-wyzwania-037": {
    category: "sport-i-wyzwania",
    text: "kłóciłby się, że e-sport to prawdziwy sport",
    adult: false,
  },
  "sport-i-wyzwania-038": { category: "sport-i-wyzwania", text: "byłby niepokonany w beer pongu", adult: true },
  "sport-i-wyzwania-039": {
    category: "sport-i-wyzwania",
    text: "poszedłby na randkę w ciemno, bo przegrał zakład",
    adult: false,
  },
  "sport-i-wyzwania-040": {
    category: "sport-i-wyzwania",
    text: "podrywałby kogoś na basenie, udając ratownika",
    adult: false,
  },
  "sport-i-wyzwania-041": {
    category: "sport-i-wyzwania",
    text: "liczyłby na siłowni powtórzenia na głos, żeby wszyscy słyszeli",
    adult: false,
  },
  "sport-i-wyzwania-042": {
    category: "sport-i-wyzwania",
    text: "krzyczałby na kolegów z amatorskiej drużyny jak trener reprezentacji",
    adult: false,
  },
  "sport-i-wyzwania-043": {
    category: "sport-i-wyzwania",
    text: "zasnąłby na zajęciach jogi w trakcie relaksacji",
    adult: false,
  },
  "sport-i-wyzwania-044": {
    category: "sport-i-wyzwania",
    text: "uchylałby się przed piłką, stojąc na bramce",
    adult: false,
  },
  "sport-i-wyzwania-045": {
    category: "sport-i-wyzwania",
    text: "przejechałby na rowerze stacjonarnym tysiąc kilometrów, nie ruszając się z pokoju",
    adult: false,
  },
  "sport-i-wyzwania-046": {
    category: "sport-i-wyzwania",
    text: "założyłby pełny strój kolarski na przejażdżkę do piekarni",
    adult: false,
  },
  "sport-i-wyzwania-047": {
    category: "sport-i-wyzwania",
    text: "wrzucałby na Stravę każdy spacer do sklepu",
    adult: false,
  },
  "sport-i-wyzwania-048": {
    category: "sport-i-wyzwania",
    text: "skoczyłby ze spadochronem w prezencie urodzinowym",
    adult: false,
  },
  "sport-i-wyzwania-049": {
    category: "sport-i-wyzwania",
    text: "dogoniłby uciekający autobus sprintem przez trzy przystanki",
    adult: false,
  },
  "sport-i-wyzwania-050": { category: "sport-i-wyzwania", text: "rzuciłby kulą do kręgli do tyłu", adult: false },
  "sport-i-wyzwania-051": {
    category: "sport-i-wyzwania",
    text: "zjadłby w godzinę pizzę wielkości koła od roweru",
    adult: false,
  },
  "sport-i-wyzwania-052": {
    category: "sport-i-wyzwania",
    text: "nauczyłby się jeździć na rolkach po trzydziestce, w kasku i ochraniaczach",
    adult: false,
  },
  "sport-i-wyzwania-053": {
    category: "sport-i-wyzwania",
    text: "wygrałby mecz paintballa, siedząc cały czas w krzakach",
    adult: false,
  },
  "sport-i-wyzwania-054": {
    category: "sport-i-wyzwania",
    text: "wszedłby na ściankę wspinaczkową w dżinsach szybciej niż wszyscy",
    adult: false,
  },
  "sport-i-wyzwania-055": {
    category: "sport-i-wyzwania",
    text: "zjechałby z czarnej trasy, głównie na plecach",
    adult: false,
  },
  "sport-i-wyzwania-056": { category: "sport-i-wyzwania", text: "wytrzymałby cały tydzień bez telefonu", adult: false },
  "sport-i-wyzwania-057": {
    category: "sport-i-wyzwania",
    text: "przyszedłby na mecz z twarzą w barwach drużyny i wrócił bez głosu",
    adult: false,
  },
  "sport-i-wyzwania-058": {
    category: "sport-i-wyzwania",
    text: "wystartowałby w zawodach w jedzeniu pierogów na czas",
    adult: false,
  },
  "sport-i-wyzwania-059": {
    category: "sport-i-wyzwania",
    text: "wspominałby do dziś, jak wygrał bieg na sześćdziesiąt metrów w podstawówce",
    adult: false,
  },
  "sport-i-wyzwania-060": {
    category: "sport-i-wyzwania",
    text: "przebiegłby półmaraton w stroju dinozaura",
    adult: false,
  },
  "sport-i-wyzwania-061": {
    category: "sport-i-wyzwania",
    text: "kopnąłby piłkę na podwórko sąsiada, do którego nikt nie ma odwagi iść",
    adult: false,
  },
  "sport-i-wyzwania-062": {
    category: "sport-i-wyzwania",
    text: "opowiadałby tygodniami o swoim rekordzie w martwym ciągu",
    adult: false,
  },
  "sport-i-wyzwania-063": {
    category: "sport-i-wyzwania",
    text: "wróciłby z wycieczki rowerowej, prowadząc rower pod każdą górkę",
    adult: false,
  },
  "sport-i-wyzwania-064": {
    category: "sport-i-wyzwania",
    text: "przepłynąłby pół basenu pod wodą, żeby się popisać",
    adult: false,
  },
  "sport-i-wyzwania-065": {
    category: "sport-i-wyzwania",
    text: "grałby w piłkę w klapkach i strzelił najwięcej goli",
    adult: false,
  },
  "sport-i-wyzwania-066": {
    category: "sport-i-wyzwania",
    text: "założyłby z kolegami z pracy drużynę ligi szóstek",
    adult: false,
  },
  "sport-i-wyzwania-067": {
    category: "sport-i-wyzwania",
    text: "nie umiałby uruchomić bieżni i udawał, że się rozciąga",
    adult: false,
  },
  "sport-i-wyzwania-068": {
    category: "sport-i-wyzwania",
    text: "wyzwałby każdego na siłowanie się na rękę",
    adult: false,
  },
  "sport-i-wyzwania-069": {
    category: "sport-i-wyzwania",
    text: "zapisałby się na crossfit i mówił o nim przy każdej okazji",
    adult: false,
  },
  "sport-i-wyzwania-070": {
    category: "sport-i-wyzwania",
    text: "trafiałby rzutkami we wszystko oprócz tarczy",
    adult: false,
  },
  "sport-i-wyzwania-071": {
    category: "sport-i-wyzwania",
    text: "obstawiałby u bukmachera mecze ligi, której nie zna",
    adult: true,
  },
  "sport-i-wyzwania-072": {
    category: "sport-i-wyzwania",
    text: "kończyłby każdy trening piwem w barze naprzeciw siłowni",
    adult: false,
  },
  "sport-i-wyzwania-073": {
    category: "sport-i-wyzwania",
    text: "zabrałby kogoś na pierwszą randkę na mecz piłki nożnej",
    adult: false,
  },
  "sport-i-wyzwania-074": {
    category: "sport-i-wyzwania",
    text: "pokazywałby wszystkim mięśnie po trzecim piwie",
    adult: false,
  },
  "sport-i-wyzwania-075": {
    category: "sport-i-wyzwania",
    text: "przegrałby specjalnie zakład, w którym stawką był pocałunek",
    adult: false,
  },
  "sport-i-wyzwania-076": {
    category: "sport-i-wyzwania",
    text: "grałby w siatkówkę plażową głównie po to, żeby pokazać się w stroju kąpielowym",
    adult: false,
  },
  "sport-i-wyzwania-077": {
    category: "sport-i-wyzwania",
    text: "przyniósłby na morsowanie termos z grzańcem",
    adult: false,
  },
  "sport-i-wyzwania-078": {
    category: "sport-i-wyzwania",
    text: "założyłby na siłownię najkrótsze spodenki świata",
    adult: false,
  },
  "sport-i-wyzwania-079": {
    category: "sport-i-wyzwania",
    text: "oblewałby wygraną w piłkarzyki szampanem jak mistrzostwo świata",
    adult: false,
  },
  "sport-i-wyzwania-080": {
    category: "sport-i-wyzwania",
    text: "wygrywałby w bilard w barze tylko po kilku piwach",
    adult: false,
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
    text: "odpowiedziałby „do wszystkich” wiadomością, która była tylko dla jednej osoby",
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
  "praca-i-szkola-021": { category: "praca-i-szkola", text: "wdałby się w romans biurowy", adult: false },
  "praca-i-szkola-022": { category: "praca-i-szkola", text: "przyszedłby do pracy prosto z imprezy", adult: false },
  "praca-i-szkola-023": {
    category: "praca-i-szkola",
    text: "wypiłby za dużo na firmowej wigilii i powiedział szefowi, co myśli",
    adult: true,
  },
  "praca-i-szkola-024": {
    category: "praca-i-szkola",
    text: "wysłałby dwuznaczną emotkę na firmowym czacie",
    adult: false,
  },
  "praca-i-szkola-025": {
    category: "praca-i-szkola",
    text: "przespałby egzamin po imprezie w akademiku",
    adult: false,
  },
  "praca-i-szkola-026": { category: "praca-i-szkola", text: "schowałby piersiówkę w szufladzie biurka", adult: false },
  "praca-i-szkola-027": { category: "praca-i-szkola", text: "umówiłby się na randkę z kimś z działu HR", adult: false },
  "praca-i-szkola-028": {
    category: "praca-i-szkola",
    text: "oddałby pracę z czatbota razem z dopiskiem „Oto Twój tekst!”",
    adult: false,
  },
  "praca-i-szkola-029": {
    category: "praca-i-szkola",
    text: "udawałby na spotkaniu online, że ma słaby internet",
    adult: false,
  },
  "praca-i-szkola-030": {
    category: "praca-i-szkola",
    text: "wynosiłby z biura długopisy całymi garściami",
    adult: false,
  },
  "praca-i-szkola-031": {
    category: "praca-i-szkola",
    text: "wszedłby na ważne spotkanie z włączonym filtrem kota",
    adult: false,
  },
  "praca-i-szkola-032": {
    category: "praca-i-szkola",
    text: "zrobiłby tak dobrą ściągę, że nauczyłby się z niej wszystkiego",
    adult: false,
  },
  "praca-i-szkola-033": {
    category: "praca-i-szkola",
    text: "zgłosiłby się do odpowiedzi, nie wiedząc, o co pytano",
    adult: false,
  },
  "praca-i-szkola-034": { category: "praca-i-szkola", text: "zamieniłby firmowy czat w grupę z memami", adult: false },
  "praca-i-szkola-035": {
    category: "praca-i-szkola",
    text: "poszedłby na studia tylko dla zniżki na bilety",
    adult: false,
  },
  "praca-i-szkola-036": {
    category: "praca-i-szkola",
    text: "wymyśliłby, że pies zjadł mu pendrive’a z projektem",
    adult: false,
  },
  "praca-i-szkola-037": {
    category: "praca-i-szkola",
    text: "zacząłby trzy kierunki studiów i nie skończył żadnego",
    adult: false,
  },
  "praca-i-szkola-038": {
    category: "praca-i-szkola",
    text: "flirtowałby w dziekanacie, żeby przesunąć termin",
    adult: false,
  },
  "praca-i-szkola-039": {
    category: "praca-i-szkola",
    text: "zorganizowałby integrację, która skończy się w klubie o piątej rano",
    adult: false,
  },
  "praca-i-szkola-040": { category: "praca-i-szkola", text: "zostałby legendą imprez w akademiku", adult: false },
  "praca-i-szkola-041": {
    category: "praca-i-szkola",
    text: "wysłałby maila „w załączniku” bez załącznika",
    adult: false,
  },
  "praca-i-szkola-042": {
    category: "praca-i-szkola",
    text: "spędziłby pierwsze dziesięć minut prezentacji na podłączaniu rzutnika",
    adult: false,
  },
  "praca-i-szkola-043": { category: "praca-i-szkola", text: "odgrzewałby w biurowej mikrofalówce rybę", adult: false },
  "praca-i-szkola-044": {
    category: "praca-i-szkola",
    text: "ucinałby sobie drzemkę w samochodzie na firmowym parkingu",
    adult: false,
  },
  "praca-i-szkola-045": {
    category: "praca-i-szkola",
    text: "zautomatyzowałby swoją pracę i nikomu o tym nie powiedział",
    adult: false,
  },
  "praca-i-szkola-046": {
    category: "praca-i-szkola",
    text: "mówiłby „podeślij mi to na asapie” nawet w domu",
    adult: false,
  },
  "praca-i-szkola-047": {
    category: "praca-i-szkola",
    text: "chowałby się w łazience, gdy szef szuka ochotnika",
    adult: false,
  },
  "praca-i-szkola-048": {
    category: "praca-i-szkola",
    text: "nosiłby do pracy garnitur, choć wszyscy chodzą w bluzach",
    adult: false,
  },
  "praca-i-szkola-049": {
    category: "praca-i-szkola",
    text: "zostałby w pracy osobą od zbierania na prezenty dla wszystkich",
    adult: false,
  },
  "praca-i-szkola-050": {
    category: "praca-i-szkola",
    text: "spóźniałby się codziennie o pięć minut, zawsze z nową wymówką",
    adult: false,
  },
  "praca-i-szkola-051": { category: "praca-i-szkola", text: "byłby pupilkiem każdego nauczyciela", adult: false },
  "praca-i-szkola-052": {
    category: "praca-i-szkola",
    text: "grałby na lekcji w statki z kolegą z ławki",
    adult: false,
  },
  "praca-i-szkola-053": {
    category: "praca-i-szkola",
    text: "wychodziłby z pracy o szesnastej zero zero, ani sekundy później",
    adult: false,
  },
  "praca-i-szkola-054": {
    category: "praca-i-szkola",
    text: "zostawałby po godzinach, choć nikt go o to nie prosi",
    adult: false,
  },
  "praca-i-szkola-055": {
    category: "praca-i-szkola",
    text: "przyjechałby do biura w dzień, w którym wszyscy pracują zdalnie",
    adult: false,
  },
  "praca-i-szkola-056": {
    category: "praca-i-szkola",
    text: "toczyłby codzienną wojnę z firmową drukarką",
    adult: false,
  },
  "praca-i-szkola-057": {
    category: "praca-i-szkola",
    text: "wpisałby w CV „zaawansowany Excel”, znając tylko autosumowanie",
    adult: false,
  },
  "praca-i-szkola-058": {
    category: "praca-i-szkola",
    text: "zostałby na uczelni jako doktorant, byle nie iść do pracy",
    adult: false,
  },
  "praca-i-szkola-059": {
    category: "praca-i-szkola",
    text: "nauczyłby się na egzamin w jedną noc i zdał najlepiej z roku",
    adult: false,
  },
  "praca-i-szkola-060": {
    category: "praca-i-szkola",
    text: "przepisałby od kogoś pracę domową razem z cudzym podpisem",
    adult: false,
  },
  "praca-i-szkola-061": {
    category: "praca-i-szkola",
    text: "opowiadałby na rozmowie o pracę głównie o swoim kocie",
    adult: false,
  },
  "praca-i-szkola-062": {
    category: "praca-i-szkola",
    text: "wziąłby urlop w najgorszym możliwym momencie projektu",
    adult: false,
  },
  "praca-i-szkola-063": {
    category: "praca-i-szkola",
    text: "zwołałby godzinne spotkanie w sprawie, którą dało się załatwić mailem",
    adult: false,
  },
  "praca-i-szkola-064": { category: "praca-i-szkola", text: "nazwałby plik „final_final_ostateczny_v3”", adult: false },
  "praca-i-szkola-065": {
    category: "praca-i-szkola",
    text: "zacząłby oficjalnego maila do profesora od „Siemka”",
    adult: false,
  },
  "praca-i-szkola-066": {
    category: "praca-i-szkola",
    text: "studiowałby tak długo, że wykładowcy mówiliby mu po imieniu",
    adult: false,
  },
  "praca-i-szkola-067": {
    category: "praca-i-szkola",
    text: "kiwałby głową na spotkaniu, nie rozumiejąc żadnego skrótu",
    adult: false,
  },
  "praca-i-szkola-068": {
    category: "praca-i-szkola",
    text: "sprzedawałby kolegom słodycze na przerwach z zyskiem",
    adult: false,
  },
  "praca-i-szkola-069": {
    category: "praca-i-szkola",
    text: "zostałby skarbnikiem klasy i zgubił pieniądze na wycieczkę",
    adult: false,
  },
  "praca-i-szkola-070": {
    category: "praca-i-szkola",
    text: "dodałby szefa do znajomych na Facebooku pierwszego dnia pracy",
    adult: false,
  },
  "praca-i-szkola-071": {
    category: "praca-i-szkola",
    text: "wziąłby urlop na żądanie dzień po każdych swoich urodzinach",
    adult: false,
  },
  "praca-i-szkola-072": {
    category: "praca-i-szkola",
    text: "przemyciłby alkohol na studniówkę w butelce po wodzie",
    adult: false,
  },
  "praca-i-szkola-073": { category: "praca-i-szkola", text: "podkochiwałby się w swoim wykładowcy", adult: false },
  "praca-i-szkola-074": {
    category: "praca-i-szkola",
    text: "pisałby na firmowym czacie z crushem z innego piętra",
    adult: false,
  },
  "praca-i-szkola-075": {
    category: "praca-i-szkola",
    text: "zdałby egzamin na kacu lepiej niż wszyscy na trzeźwo",
    adult: false,
  },
  "praca-i-szkola-076": {
    category: "praca-i-szkola",
    text: "zasnąłby na wyjeździe integracyjnym w jacuzzi",
    adult: false,
  },
  "praca-i-szkola-077": {
    category: "praca-i-szkola",
    text: "wprowadziłby w firmie obowiązkowe piątkowe piwo",
    adult: false,
  },
  "praca-i-szkola-078": {
    category: "praca-i-szkola",
    text: "przychodziłby na firmową wigilię co roku z inną osobą towarzyszącą",
    adult: false,
  },
  "praca-i-szkola-079": {
    category: "praca-i-szkola",
    text: "dorabiałby na studiach jako barman i pił połowę zapasów",
    adult: false,
  },
  "praca-i-szkola-080": {
    category: "praca-i-szkola",
    text: "napisałby pracę magisterską o piwie rzemieślniczym",
    adult: false,
  },
  // Gry
  "znane-gry-001": { category: "znane-gry", text: "zgłosiłby w Among Us ciało, które sam zostawił", adult: false },
  "znane-gry-002": {
    category: "znane-gry",
    text: "zwołałby w Among Us zebranie awaryjne, żeby pogadać o pogodzie",
    adult: false,
  },
  "znane-gry-003": {
    category: "znane-gry",
    text: "grałby w Mafię tak przekonująco, że nikt by mu potem nie ufał",
    adult: false,
  },
  "znane-gry-004": {
    category: "znane-gry",
    text: "zbudowałby w Minecrafcie dom z ziemi i nazwał go zamkiem",
    adult: false,
  },
  "znane-gry-005": {
    category: "znane-gry",
    text: "kłóciłby się w Scrabble, że wymyślone słowo naprawdę istnieje",
    adult: false,
  },
  "znane-gry-006": {
    category: "znane-gry",
    text: "postawiłby w Minecrafcie TNT „dla żartu” i wysadził wspólną bazę",
    adult: false,
  },
  "znane-gry-007": {
    category: "znane-gry",
    text: "upierałby się, że Heroes III to najlepsza gra wszech czasów",
    adult: false,
  },
  "znane-gry-008": {
    category: "znane-gry",
    text: "zabrałby Simowi drabinkę z basenu „tylko żeby zobaczyć”",
    adult: false,
  },
  "znane-gry-009": {
    category: "znane-gry",
    text: "wpisałby w Simsach kod na kasę w pierwszej minucie gry",
    adult: false,
  },
  "znane-gry-010": {
    category: "znane-gry",
    text: "rzuciłby w najlepszego kumpla niebieską skorupą w Mario Kart",
    adult: false,
  },
  "znane-gry-011": { category: "znane-gry", text: "zniszczyłby przyjaźń jedną partią Mario Party", adult: false },
  "znane-gry-012": {
    category: "znane-gry",
    text: "jeździłby w GTA zgodnie z przepisami i czekał na zielonym",
    adult: false,
  },
  "znane-gry-013": {
    category: "znane-gry",
    text: "wziąłby tydzień urlopu, żeby przejść GTA VI bez przerw",
    adult: false,
  },
  "znane-gry-014": { category: "znane-gry", text: "przegrałby w Wiedźminie całe złoto w gwinta", adult: false },
  "znane-gry-015": { category: "znane-gry", text: "mówiłby „Zaraza!” jak Geralt przy każdej wpadce", adult: false },
  "znane-gry-016": {
    category: "znane-gry",
    text: "kupiłby Cyberpunka w dniu premiery i bronił go mimo wszystkich błędów",
    adult: false,
  },
  "znane-gry-017": {
    category: "znane-gry",
    text: "nazwałby każdego swojego Pokémona imieniem kogoś z nas",
    adult: false,
  },
  "znane-gry-018": {
    category: "znane-gry",
    text: "wyszedłby w nocy na miasto tylko po rzadkiego Pokémona",
    adult: false,
  },
  "znane-gry-019": {
    category: "znane-gry",
    text: "zginąłby w Dark Souls sto razy na tym samym bossie i się nie poddał",
    adult: false,
  },
  "znane-gry-020": {
    category: "znane-gry",
    text: "tańczyłby w Fortnite nad przeciwnikiem i zaraz potem zginął",
    adult: false,
  },
  "znane-gry-021": {
    category: "znane-gry",
    text: "grałby w League of Legends i twierdził, że to go odpręża",
    adult: false,
  },
  "znane-gry-022": { category: "znane-gry", text: "krzyczałby w CS-ie „rush B” bez względu na sytuację", adult: false },
  "znane-gry-023": { category: "znane-gry", text: "układałby zakupy w lodówce jak klocki w Tetrisie", adult: false },
  "znane-gry-024": {
    category: "znane-gry",
    text: "zamachnąłby się przy grze na Wii tak mocno, że pilot poleciałby prosto w telewizor",
    adult: false,
  },
  "znane-gry-025": {
    category: "znane-gry",
    text: "grałby w Guitar Hero, jakby dawał koncert na stadionie",
    adult: false,
  },
  "znane-gry-026": {
    category: "znane-gry",
    text: "pokonałby w Tekkenie mistrza, wciskając na oślep wszystkie przyciski",
    adult: false,
  },
  "znane-gry-027": {
    category: "znane-gry",
    text: "podbierałby w Monopoly pieniądze z banku, gdy nikt nie patrzy",
    adult: false,
  },
  "znane-gry-028": {
    category: "znane-gry",
    text: "rzuciłby w Uno „+4” na kumpla, któremu została jedna karta",
    adult: false,
  },
  "znane-gry-029": { category: "znane-gry", text: "zbiłby w Chińczyku babcię bez mrugnięcia okiem", adult: false },
  "znane-gry-030": {
    category: "znane-gry",
    text: "wygrałby w Kahoot, odpowiadając, zanim przeczyta pytanie",
    adult: false,
  },
  "znane-gry-031": {
    category: "znane-gry",
    text: "romansowałby w Baldur’s Gate 3 ze wszystkimi postaciami po kolei",
    adult: false,
  },
  "znane-gry-032": { category: "znane-gry", text: "zaproponowałby rozbierane Uno", adult: true },
  "znane-gry-033": {
    category: "znane-gry",
    text: "zrobiłby z Mario Kart grę alkoholową: shot za każde wypadnięcie z trasy",
    adult: true,
  },
  "znane-gry-034": {
    category: "znane-gry",
    text: "stworzyłby w Simsach siebie oraz crusha i swatał ich całą noc",
    adult: false,
  },
  "znane-gry-035": {
    category: "znane-gry",
    text: "zadałby w „Prawdzie czy wyzwaniu” pytanie, po którym zapadłaby cisza",
    adult: false,
  },
  "znane-gry-036": {
    category: "znane-gry",
    text: "grałby w Among Us po trzech piwach i wydał się już na pierwszym zebraniu",
    adult: false,
  },
  "znane-gry-037": {
    category: "znane-gry",
    text: "grałby w Wiedźmina tylko dla romansów z czarodziejkami",
    adult: false,
  },
  "znane-gry-038": {
    category: "znane-gry",
    text: "pokazałby w kalamburach hasło tak, że wszyscy by się zaczerwienili",
    adult: false,
  },
  "znane-gry-039": { category: "znane-gry", text: "zaprosiłby kogoś na pierwszą randkę do Minecrafta", adult: false },
  "znane-gry-040": {
    category: "znane-gry",
    text: "grałby w FIFĘ o to, kto stawia następną kolejkę",
    adult: false,
  },
  "znane-gry-041": { category: "znane-gry", text: "handlowałby w Catanie owcami jak makler na giełdzie", adult: false },
  "znane-gry-042": { category: "znane-gry", text: "wyciągałby klocek w Jendze przez dziesięć minut", adult: false },
  "znane-gry-043": {
    category: "znane-gry",
    text: "splątałby się w Twisterze w węzeł nie do rozwiązania",
    adult: false,
  },
  "znane-gry-044": {
    category: "znane-gry",
    text: "dawałby w Dixicie tak dziwne skojarzenia, że nikt by nie trafił",
    adult: false,
  },
  "znane-gry-045": {
    category: "znane-gry",
    text: "podawałby w Tajniakach hasło na pięć słów, a drużyna trafiałaby w zabójcę",
    adult: false,
  },
  "znane-gry-046": {
    category: "znane-gry",
    text: "rozpoznawałby w GeoGuessrze kraj po samych słupkach przy drodze",
    adult: false,
  },
  "znane-gry-047": {
    category: "znane-gry",
    text: "przejechałby w Euro Truck Simulatorze więcej kilometrów niż autem w życiu",
    adult: false,
  },
  "znane-gry-048": {
    category: "znane-gry",
    text: "spędziłby weekend na koszeniu wirtualnego zboża w Farming Simulatorze",
    adult: false,
  },
  "znane-gry-049": {
    category: "znane-gry",
    text: "wprowadziłby w Football Managerze klub z czwartej ligi do Ligi Mistrzów",
    adult: false,
  },
  "znane-gry-050": {
    category: "znane-gry",
    text: "zrzuciłby w Civilization atomówkę na sąsiada, z którym przed chwilą handlował",
    adult: false,
  },
  "znane-gry-051": { category: "znane-gry", text: "zginąłby w Gothicu od pierwszego kretoszczura", adult: false },
  "znane-gry-052": {
    category: "znane-gry",
    text: "zabiłby w Skyrimie kurczaka i uciekał przed całą wioską",
    adult: false,
  },
  "znane-gry-053": {
    category: "znane-gry",
    text: "podlewałby w Stardew Valley wirtualne grządki codziennie przed pracą",
    adult: false,
  },
  "znane-gry-054": {
    category: "znane-gry",
    text: "spłacałby kredyt u szopa w Animal Crossing sumienniej niż prawdziwe rachunki",
    adult: false,
  },
  "znane-gry-055": {
    category: "znane-gry",
    text: "wydzierałby się w Overcooked jak szef kuchni z telewizji",
    adult: false,
  },
  "znane-gry-056": { category: "znane-gry", text: "zajechałby myszkę w Diablo w pierwszym tygodniu", adult: false },
  "znane-gry-057": {
    category: "znane-gry",
    text: "obudowałby się w Age of Empires murami i nie wyszedł z bazy",
    adult: false,
  },
  "znane-gry-058": {
    category: "znane-gry",
    text: "wspominałby rajdy w World of Warcraft jak weteran wojenny",
    adult: false,
  },
  "znane-gry-059": {
    category: "znane-gry",
    text: "przywoływałby w Elden Ringu pomoc i twierdził, że przeszedł grę sam",
    adult: false,
  },
  "znane-gry-060": {
    category: "znane-gry",
    text: "wierzyłby, że na kartridżu do Pegasusa naprawdę jest 9999 gier",
    adult: false,
  },
  "znane-gry-061": {
    category: "znane-gry",
    text: "strzelałby w Rocket League więcej samobójów niż goli",
    adult: false,
  },
  "znane-gry-062": {
    category: "znane-gry",
    text: "prowadziłby kampanię Dungeons & Dragons, która ciągnie się od trzech lat",
    adult: false,
  },
  "znane-gry-063": { category: "znane-gry", text: "rysowałby w Gartic Phone same ludziki z patyków", adult: false },
  "znane-gry-064": {
    category: "znane-gry",
    text: "podkładałby w Exploding Kittens wybuchającego kota zawsze temu samemu graczowi",
    adult: false,
  },
  "znane-gry-065": {
    category: "znane-gry",
    text: "blokowałby we „Wsiąść do pociągu” trasy wszystkim tylko na złość",
    adult: false,
  },
  "znane-gry-066": {
    category: "znane-gry",
    text: "jeździłby w Red Dead Redemption 2 konno przez całą mapę, zamiast użyć szybkiej podróży",
    adult: false,
  },
  "znane-gry-067": {
    category: "znane-gry",
    text: "próbowałby pobić światowy rekord w przejściu Super Mario na czas",
    adult: false,
  },
  "znane-gry-068": {
    category: "znane-gry",
    text: "grałby w Overwatchu wyłącznie postacią leczącą i narzekał, że nikt mu nie dziękuje",
    adult: false,
  },
  "znane-gry-069": { category: "znane-gry", text: "oszukiwałby w Grzybobraniu, grając z dziećmi", adult: false },
  "znane-gry-070": {
    category: "znane-gry",
    text: "kłóciłby się w Activity, że gest przy opisywaniu hasła wcale nie był podpowiedzią",
    adult: false,
  },
  "znane-gry-071": {
    category: "znane-gry",
    text: "wyrwałby w Jungle Speed totem razem z czyjąś ręką, grając po piwie",
    adult: false,
  },
  "znane-gry-072": {
    category: "znane-gry",
    text: "miałby na tapecie postać z gry, w której się podkochuje",
    adult: false,
  },
  "znane-gry-073": { category: "znane-gry", text: "piłby w „Nigdy przenigdy” przy każdym pytaniu", adult: true },
  "znane-gry-074": {
    category: "znane-gry",
    text: "zaprosiłby crusha na wspólne granie w It Takes Two, licząc, że coś z tego będzie",
    adult: false,
  },
  "znane-gry-075": {
    category: "znane-gry",
    text: "dobierałby sobie w każdej grze do pary osobę, która mu się podoba",
    adult: false,
  },
  "znane-gry-076": {
    category: "znane-gry",
    text: "grałby w Monopoly na prawdziwe pieniądze i przegrał wypłatę",
    adult: true,
  },
  "znane-gry-077": { category: "znane-gry", text: "flirtowałby w Mafii z każdym, żeby przeżyć noc", adult: false },
  "znane-gry-078": {
    category: "znane-gry",
    text: "wybierałby w „Prawdzie czy wyzwaniu” zawsze wyzwanie, nawet najgorsze",
    adult: false,
  },
  "znane-gry-079": {
    category: "znane-gry",
    text: "piłby łyk za każdą śmierć w Dark Souls i nie dotrwał do pierwszego bossa",
    adult: true,
  },
  "znane-gry-080": {
    category: "znane-gry",
    text: "zaprosiłby kogoś na randkę na planszówki i ograł go bez litości",
    adult: false,
  },
  // Popkultura
  "popkultura-001": {
    category: "popkultura",
    text: "pstryknąłby palcami jak Thanos, żeby skrócić kolejkę w sklepie",
    adult: false,
  },
  "popkultura-002": {
    category: "popkultura",
    text: "zostawałby w kinie na scenę po napisach, nawet gdy jej nie ma",
    adult: false,
  },
  "popkultura-003": {
    category: "popkultura",
    text: "wpadłby do Avengersów na koniec bitwy i zgarnął całą chwałę",
    adult: false,
  },
  "popkultura-004": {
    category: "popkultura",
    text: "obejrzałby wszystkie filmy Marvela po kolei w jeden weekend",
    adult: false,
  },
  "popkultura-005": {
    category: "popkultura",
    text: "płakałby na „Królu Lwie”, choć widział go dwadzieścia razy",
    adult: false,
  },
  "popkultura-006": {
    category: "popkultura",
    text: "oglądałby „Kevina samego w domu” w każde święta i cytował wszystkie dialogi",
    adult: false,
  },
  "popkultura-007": { category: "popkultura", text: "zrobiłby Jackowi miejsce na drzwiach w „Titanicu”", adult: false },
  "popkultura-008": { category: "popkultura", text: "trafiłby w Hogwarcie do Slytherinu", adult: false },
  "popkultura-009": { category: "popkultura", text: "wciąż czekałby na list z Hogwartu", adult: false },
  "popkultura-010": { category: "popkultura", text: "mówiłby jak Yoda, gdy chce zabrzmieć mądrze", adult: false },
  "popkultura-011": { category: "popkultura", text: "przeszedłby na ciemną stronę Mocy dla ciastka", adult: false },
  "popkultura-012": {
    category: "popkultura",
    text: "kłóciłby się do upadłego, że Ross i Rachel byli na przerwie",
    adult: false,
  },
  "popkultura-013": {
    category: "popkultura",
    text: "zamieszkałby w bagnie jak Shrek, byle nikt go nie odwiedzał",
    adult: false,
  },
  "popkultura-014": { category: "popkultura", text: "gadałby bez przerwy jak Osioł ze „Shreka”", adult: false },
  "popkultura-015": {
    category: "popkultura",
    text: "trzymałby pilota do telewizora jak Gollum swój skarb",
    adult: false,
  },
  "popkultura-016": {
    category: "popkultura",
    text: "przeżyłby w „Grze o tron” najdłużej, bo nikomu nie wchodziłby w drogę",
    adult: false,
  },
  "popkultura-017": {
    category: "popkultura",
    text: "próbowałby wygiąć się do tyłu jak Neo i skończył u fizjoterapeuty",
    adult: false,
  },
  "popkultura-018": {
    category: "popkultura",
    text: "cofnąłby się w czasie DeLoreanem tylko po to, żeby kupić bitcoina",
    adult: false,
  },
  "popkultura-019": {
    category: "popkultura",
    text: "zachowywałby się w eleganckiej restauracji jak Jaś Fasola",
    adult: false,
  },
  "popkultura-020": {
    category: "popkultura",
    text: "leżałby na kanapie jak Ferdek Kiepski i czekał na lepsze czasy",
    adult: false,
  },
  "popkultura-021": { category: "popkultura", text: "zagłodziłby Tamagotchi w pierwszym tygodniu", adult: false },
  "popkultura-022": { category: "popkultura", text: "tańczyłby Gangnam Style, jakby wciąż był rok 2012", adult: false },
  "popkultura-023": {
    category: "popkultura",
    text: "nosiłby wciąż Nokię 3310, bo „bateria trzyma tydzień”",
    adult: false,
  },
  "popkultura-024": {
    category: "popkultura",
    text: "ustawiłby na Gadu-Gadu smutny opis, żeby ktoś zapytał, co się stało",
    adult: false,
  },
  "popkultura-025": {
    category: "popkultura",
    text: "handlowałby na przerwach karteczkami do segregatora jak na giełdzie",
    adult: false,
  },
  "popkultura-026": { category: "popkultura", text: "przeżyłby fazę emo z grzywką na pół twarzy", adult: false },
  "popkultura-027": {
    category: "popkultura",
    text: "nagrałby z nami teledysk jak boysband z lat dziewięćdziesiątych",
    adult: false,
  },
  "popkultura-028": {
    category: "popkultura",
    text: "znałby na pamięć wszystkie hity disco polo, choć niby go nie słucha",
    adult: false,
  },
  "popkultura-029": { category: "popkultura", text: "przeżywałby Eurowizję bardziej niż mundial", adult: false },
  "popkultura-030": { category: "popkultura", text: "zrobiłby Rickrolla na własnym weselu", adult: false },
  "popkultura-031": {
    category: "popkultura",
    text: "zamówiłby martini „wstrząśnięte, niemieszane” jak Bond",
    adult: false,
  },
  "popkultura-032": { category: "popkultura", text: "podrywałby cytatami z komedii romantycznych", adult: false },
  "popkultura-033": {
    category: "popkultura",
    text: "stanąłby pod oknem crusha z boomboxem jak w filmie z lat osiemdziesiątych",
    adult: false,
  },
  "popkultura-034": {
    category: "popkultura",
    text: "zamówiłby na urodziny striptizera przebranego za Spider-Mana",
    adult: true,
  },
  "popkultura-035": {
    category: "popkultura",
    text: "obudziłby się po imprezie jak w „Kac Vegas”: z tygrysem w łazience",
    adult: true,
  },
  "popkultura-036": {
    category: "popkultura",
    text: "podrywałby na imprezach jak Barney z „Jak poznałem waszą matkę”",
    adult: false,
  },
  "popkultura-037": {
    category: "popkultura",
    text: "śpiewałby ABBĘ po trzech winach głośniej niż w „Mamma Mia!”",
    adult: false,
  },
  "popkultura-038": {
    category: "popkultura",
    text: "pisałby po nocach romantyczne fanfiki o Avengersach",
    adult: false,
  },
  "popkultura-039": {
    category: "popkultura",
    text: "zakochałby się w gwieździe serialu i pisał do niej na Instagramie",
    adult: false,
  },
  "popkultura-040": {
    category: "popkultura",
    text: "obejrzałby „Pięćdziesiąt twarzy Greya” w kinie z babcią",
    adult: true,
  },
  "popkultura-041": {
    category: "popkultura",
    text: "nuciłby muzykę z „Mission: Impossible”, skradając się po ciastko",
    adult: false,
  },
  "popkultura-042": {
    category: "popkultura",
    text: "nuciłby czołówkę „Przyjaciół” i klaskał w odpowiednich miejscach",
    adult: false,
  },
  "popkultura-043": { category: "popkultura", text: "odpowiadałby na wszystko cytatami z „Misia”", adult: false },
  "popkultura-044": {
    category: "popkultura",
    text: "znałby wszystkie wątki „Klanu” od pierwszego odcinka",
    adult: false,
  },
  "popkultura-045": { category: "popkultura", text: "śpiewałby „Mam tę moc” na cały głos przy zmywaniu", adult: false },
  "popkultura-046": {
    category: "popkultura",
    text: "wygrałby „Big Brothera”, przesypiając większość programu",
    adult: false,
  },
  "popkultura-047": {
    category: "popkultura",
    text: "zaspojlerowałby nam finał serialu, zanim ktokolwiek go obejrzy",
    adult: false,
  },
  "popkultura-048": {
    category: "popkultura",
    text: "miałby na kanapie swoje miejsce jak Sheldon i nie pozwalał nikomu na nim siadać",
    adult: false,
  },
  "popkultura-049": {
    category: "popkultura",
    text: "zrobiłby maraton „Władcy Pierścieni” w wersji rozszerzonej",
    adult: false,
  },
  "popkultura-050": {
    category: "popkultura",
    text: "przebrałby się na Halloween za Jokera i nie wychodził z roli przez tydzień",
    adult: false,
  },
  "popkultura-051": { category: "popkultura", text: "przewidziałby przyszłość lepiej niż „Simpsonowie”", adult: false },
  "popkultura-052": {
    category: "popkultura",
    text: "znałby cały układ do „Makareny” i uczył go ciocie na weselach",
    adult: false,
  },
  "popkultura-053": {
    category: "popkultura",
    text: "powtarzałby przed lustrem „Do mnie mówisz?” jak w „Taksówkarzu”",
    adult: false,
  },
  "popkultura-054": {
    category: "popkultura",
    text: "trzymałby figurki z „Gwiezdnych wojen” w nieotwartych pudełkach",
    adult: false,
  },
  "popkultura-055": {
    category: "popkultura",
    text: "pomyliłby „Star Treka” z „Gwiezdnymi wojnami” przy samych fanach",
    adult: false,
  },
  "popkultura-056": {
    category: "popkultura",
    text: "śpiewałby „Bohemian Rhapsody” w samochodzie, kiwając głową jak w „Wayne’s World”",
    adult: false,
  },
  "popkultura-057": {
    category: "popkultura",
    text: "przechodziłby na drugą stronę ulicy na widok klauna po obejrzeniu horroru „To”",
    adult: false,
  },
  "popkultura-058": {
    category: "popkultura",
    text: "obejrzałby trzy sezony serialu tylko po to, żeby zrozumieć jednego mema",
    adult: false,
  },
  "popkultura-059": {
    category: "popkultura",
    text: "zgadywałby piosenkę z radia po pierwszych dwóch nutach",
    adult: false,
  },
  "popkultura-060": { category: "popkultura", text: "zbierałby tazosy z chipsów i grał nimi o wszystko", adult: false },
  "popkultura-061": { category: "popkultura", text: "wierzyłby w każde UFO jak Mulder z „Z Archiwum X”", adult: false },
  "popkultura-062": {
    category: "popkultura",
    text: "prowadziłby śledztwo jak Sherlock w sprawie zjedzonego jogurtu",
    adult: false,
  },
  "popkultura-063": {
    category: "popkultura",
    text: "odpadłby w „Squid Game” już przy „Baba Jaga patrzy”",
    adult: false,
  },
  "popkultura-064": {
    category: "popkultura",
    text: "wyobrażałby sobie, że jest Batmanem, jadąc nocnym autobusem",
    adult: false,
  },
  "popkultura-065": {
    category: "popkultura",
    text: "pojechałby za granicę na koncert Taylor Swift i znał każde słowo",
    adult: false,
  },
  "popkultura-066": {
    category: "popkultura",
    text: "kłóciłby się, że „Szklana pułapka” to film świąteczny",
    adult: false,
  },
  "popkultura-067": {
    category: "popkultura",
    text: "mówiłby o swojej ekipie „rodzina” jak Dominic Toretto",
    adult: false,
  },
  "popkultura-068": {
    category: "popkultura",
    text: "mówiłby „Houston, mamy problem” przy każdej awarii",
    adult: false,
  },
  "popkultura-069": {
    category: "popkultura",
    text: "jadłby na śniadanie bułkę z bananem, bo tak robił Małysz",
    adult: false,
  },
  "popkultura-070": { category: "popkultura", text: "tańczyłby na każdej imprezie jak Wednesday Addams", adult: false },
  "popkultura-071": {
    category: "popkultura",
    text: "zamawiałby cosmopolitany, czując się jak bohaterka „Seksu w wielkim mieście”",
    adult: false,
  },
  "popkultura-072": {
    category: "popkultura",
    text: "oglądałby „Bridgertonów” dla scen, których nie ogląda się z rodzicami",
    adult: true,
  },
  "popkultura-073": {
    category: "popkultura",
    text: "piłby White Russiana w szlafroku jak Koleś z „Big Lebowskiego”",
    adult: false,
  },
  "popkultura-074": {
    category: "popkultura",
    text: "odtworzyłby na randce scenę przy kole garncarskim z „Uwierz w ducha”",
    adult: false,
  },
  "popkultura-075": {
    category: "popkultura",
    text: "zaśpiewałby w karaoke duet z „Grease” z osobą, na którą ma oko",
    adult: false,
  },
  "popkultura-076": {
    category: "popkultura",
    text: "uczyłby kogoś tańca jak Johnny w „Dirty Dancing”, bardzo z bliska",
    adult: false,
  },
  "popkultura-077": {
    category: "popkultura",
    text: "bawiłby się na weselu do upadłego jak bohaterowie „Wesela” Smarzowskiego",
    adult: true,
  },
  "popkultura-078": {
    category: "popkultura",
    text: "urządziłby imprezę firmową jak w „Wilku z Wall Street”",
    adult: true,
  },
  "popkultura-079": {
    category: "popkultura",
    text: "powiesiłby nad łóżkiem plakat swojego idola i całował go na dobranoc",
    adult: false,
  },
  "popkultura-080": {
    category: "popkultura",
    text: "wyznałby miłość na progu, pokazując kartki jak w „To właśnie miłość”",
    adult: false,
  },
  // Jedzenie i gotowanie
  "jedzenie-i-gotowanie-001": {
    category: "jedzenie-i-gotowanie",
    text: "dosypywałby do każdej potrawy tyle czosnku, że czuć go w sąsiednim mieszkaniu",
    adult: false,
  },
  "jedzenie-i-gotowanie-002": { category: "jedzenie-i-gotowanie", text: "jadłby pizzę nożem i widelcem", adult: false },
  "jedzenie-i-gotowanie-003": {
    category: "jedzenie-i-gotowanie",
    text: "zamawiałby w każdej restauracji zawsze to samo danie",
    adult: false,
  },
  "jedzenie-i-gotowanie-004": {
    category: "jedzenie-i-gotowanie",
    text: "polewałby pierogi keczupem przy całej rodzinie",
    adult: false,
  },
  "jedzenie-i-gotowanie-005": {
    category: "jedzenie-i-gotowanie",
    text: "dosoliłby zupę, zanim jej spróbuje",
    adult: false,
  },
  "jedzenie-i-gotowanie-006": {
    category: "jedzenie-i-gotowanie",
    text: "obierałby ziemniaki tak grubo, że zostawałaby z nich połowa",
    adult: false,
  },
  "jedzenie-i-gotowanie-007": {
    category: "jedzenie-i-gotowanie",
    text: "udawałby, że ostre curry wcale nie piecze, ze łzami w oczach",
    adult: false,
  },
  "jedzenie-i-gotowanie-008": {
    category: "jedzenie-i-gotowanie",
    text: "gotowałby z przepisu, zmieniając w nim wszystkie składniki",
    adult: false,
  },
  "jedzenie-i-gotowanie-009": {
    category: "jedzenie-i-gotowanie",
    text: "wyjadałby z garnka, zanim obiad trafi na talerze",
    adult: false,
  },
  "jedzenie-i-gotowanie-010": {
    category: "jedzenie-i-gotowanie",
    text: "zrobiłby w domu sushi, po którym ryż byłby nawet na suficie",
    adult: false,
  },
  "jedzenie-i-gotowanie-011": {
    category: "jedzenie-i-gotowanie",
    text: "piekłby chleb na zakwasie i opowiadał o nim jak o dziecku",
    adult: false,
  },
  "jedzenie-i-gotowanie-012": {
    category: "jedzenie-i-gotowanie",
    text: "trzymałby resztki w lodówce, aż wyhoduje na nich nową cywilizację",
    adult: false,
  },
  "jedzenie-i-gotowanie-013": {
    category: "jedzenie-i-gotowanie",
    text: "zjadłby w barze mlecznym obiad za dziesięć złotych i był z siebie dumny",
    adult: false,
  },
  "jedzenie-i-gotowanie-014": {
    category: "jedzenie-i-gotowanie",
    text: "omijałby na talerzu wszystko, co zielone",
    adult: false,
  },
  "jedzenie-i-gotowanie-015": {
    category: "jedzenie-i-gotowanie",
    text: "upierałby się, że ruskie to najlepsze pierogi na świecie",
    adult: false,
  },
  "jedzenie-i-gotowanie-016": {
    category: "jedzenie-i-gotowanie",
    text: "czytałby menu przez pół godziny i zamówił schabowego",
    adult: false,
  },
  "jedzenie-i-gotowanie-017": {
    category: "jedzenie-i-gotowanie",
    text: "wracałby od mamy z torbą pełną słoików",
    adult: false,
  },
  "jedzenie-i-gotowanie-018": {
    category: "jedzenie-i-gotowanie",
    text: "umiałby ugotować tylko jajecznicę, ale za to mistrzowską",
    adult: false,
  },
  "jedzenie-i-gotowanie-019": {
    category: "jedzenie-i-gotowanie",
    text: "spróbowałby każdego dziwnego smaku chipsów",
    adult: false,
  },
  "jedzenie-i-gotowanie-020": {
    category: "jedzenie-i-gotowanie",
    text: "ugotowałby dla gości danie, które widział tylko na TikToku",
    adult: false,
  },
  "jedzenie-i-gotowanie-021": {
    category: "jedzenie-i-gotowanie",
    text: "zjadłby sam całą blachę ciasta, zanim wystygnie",
    adult: false,
  },
  "jedzenie-i-gotowanie-022": {
    category: "jedzenie-i-gotowanie",
    text: "nosiłby w plecaku własną tubkę majonezu",
    adult: false,
  },
  "jedzenie-i-gotowanie-023": {
    category: "jedzenie-i-gotowanie",
    text: "przygotowałby sam wszystkie dwanaście potraw wigilijnych",
    adult: false,
  },
  "jedzenie-i-gotowanie-024": {
    category: "jedzenie-i-gotowanie",
    text: "pokłóciłby się o to, czy mówi się „szneka”, czy „drożdżówka”",
    adult: false,
  },
  "jedzenie-i-gotowanie-025": {
    category: "jedzenie-i-gotowanie",
    text: "zjadłby w tłusty czwartek więcej pączków niż wszyscy razem",
    adult: false,
  },
  "jedzenie-i-gotowanie-026": {
    category: "jedzenie-i-gotowanie",
    text: "wiedziałby, w której Żabce są najlepsze hot dogi",
    adult: false,
  },
  "jedzenie-i-gotowanie-027": {
    category: "jedzenie-i-gotowanie",
    text: "podjadałby gościom z talerzy, gdy tylko się odwrócą",
    adult: false,
  },
  "jedzenie-i-gotowanie-028": {
    category: "jedzenie-i-gotowanie",
    text: "przypaliłby popcorn tak, że włączyłby się alarm w całym bloku",
    adult: false,
  },
  "jedzenie-i-gotowanie-029": {
    category: "jedzenie-i-gotowanie",
    text: "zrobiłby kanapkę tak wysoką, że nie zmieściłaby mu się w ustach",
    adult: false,
  },
  "jedzenie-i-gotowanie-030": {
    category: "jedzenie-i-gotowanie",
    text: "porównywałby każdy rosół do domowego i żaden by mu nie dorównał",
    adult: false,
  },
  "jedzenie-i-gotowanie-031": {
    category: "jedzenie-i-gotowanie",
    text: "gotowałby z winem: trochę do sosu, reszta do kieliszka",
    adult: false,
  },
  "jedzenie-i-gotowanie-032": {
    category: "jedzenie-i-gotowanie",
    text: "ugotowałby na pierwszą randkę danie, którego nigdy wcześniej nie robił",
    adult: false,
  },
  "jedzenie-i-gotowanie-033": {
    category: "jedzenie-i-gotowanie",
    text: "dobierałby do każdego dania inny alkohol, „bo tak się komponuje smaki”",
    adult: false,
  },
  "jedzenie-i-gotowanie-034": {
    category: "jedzenie-i-gotowanie",
    text: "leczyłby kaca kiszonymi ogórkami prosto ze słoika",
    adult: false,
  },
  "jedzenie-i-gotowanie-035": {
    category: "jedzenie-i-gotowanie",
    text: "karmiłby drugą połówkę truskawkami w czekoladzie jak w filmie",
    adult: false,
  },
  "jedzenie-i-gotowanie-036": {
    category: "jedzenie-i-gotowanie",
    text: "udawałby znawcę wina, nie odróżniając wytrawnego od słodkiego",
    adult: false,
  },
  "jedzenie-i-gotowanie-037": {
    category: "jedzenie-i-gotowanie",
    text: "przyniósłby komuś śniadanie do łóżka i wylał kawę na pościel",
    adult: false,
  },
  "jedzenie-i-gotowanie-038": {
    category: "jedzenie-i-gotowanie",
    text: "zrobiłby na imprezę galaretki z wódką",
    adult: false,
  },
  "jedzenie-i-gotowanie-039": {
    category: "jedzenie-i-gotowanie",
    text: "zaprosiłby kogoś na drogą kolację i udawał, że nie patrzy na ceny",
    adult: false,
  },
  "jedzenie-i-gotowanie-040": {
    category: "jedzenie-i-gotowanie",
    text: "zjadłby ostrygi, bo podobno działają jak afrodyzjak",
    adult: true,
  },
  // Randki i związki
  "randki-i-zwiazki-001": {
    category: "randki-i-zwiazki",
    text: "zapomniałby o rocznicy i udawał, że niespodzianka dopiero się szykuje",
    adult: false,
  },
  "randki-i-zwiazki-002": {
    category: "randki-i-zwiazki",
    text: "oświadczyłby się w przerwie meczu na telebimie",
    adult: false,
  },
  "randki-i-zwiazki-003": {
    category: "randki-i-zwiazki",
    text: "dałby na Walentynki misia większego od siebie",
    adult: false,
  },
  "randki-i-zwiazki-004": {
    category: "randki-i-zwiazki",
    text: "pisałby dla swojej sympatii wiersze do szuflady",
    adult: false,
  },
  "randki-i-zwiazki-005": {
    category: "randki-i-zwiazki",
    text: "wybrałby imiona dla wspólnych dzieci po pierwszej randce",
    adult: false,
  },
  "randki-i-zwiazki-006": {
    category: "randki-i-zwiazki",
    text: "zakochałby się od pierwszego wejrzenia w kimś z tramwaju",
    adult: false,
  },
  "randki-i-zwiazki-007": {
    category: "randki-i-zwiazki",
    text: "wysłałby swojej sympatii kwiaty do pracy, żeby wszyscy widzieli",
    adult: false,
  },
  "randki-i-zwiazki-008": {
    category: "randki-i-zwiazki",
    text: "mówiłby do ukochanej osoby tak słodko, że wszystkim robi się mdło",
    adult: false,
  },
  "randki-i-zwiazki-009": {
    category: "randki-i-zwiazki",
    text: "byłby z jedną osobą od podstawówki aż do emerytury",
    adult: false,
  },
  "randki-i-zwiazki-010": {
    category: "randki-i-zwiazki",
    text: "swatałby wszystkich znajomych, nawet tych zajętych",
    adult: false,
  },
  "randki-i-zwiazki-011": {
    category: "randki-i-zwiazki",
    text: "wysyłałby swojej sympatii dwadzieścia wiadomości dziennie",
    adult: false,
  },
  "randki-i-zwiazki-012": {
    category: "randki-i-zwiazki",
    text: "kłóciłby się przez telefon, kto pierwszy się rozłączy",
    adult: false,
  },
  "randki-i-zwiazki-013": {
    category: "randki-i-zwiazki",
    text: "obraziłby się o niepolubione zdjęcie na Instagramie",
    adult: false,
  },
  "randki-i-zwiazki-014": {
    category: "randki-i-zwiazki",
    text: "płakałby na każdym ślubie, nawet nieznajomych",
    adult: false,
  },
  "randki-i-zwiazki-015": {
    category: "randki-i-zwiazki",
    text: "wiedziałby o każdym nowym związku w naszej ekipie przed wszystkimi",
    adult: false,
  },
  "randki-i-zwiazki-016": {
    category: "randki-i-zwiazki",
    text: "chodziłby w parze w takich samych bluzach",
    adult: false,
  },
  "randki-i-zwiazki-017": {
    category: "randki-i-zwiazki",
    text: "wymyśliłby dla swojej pary wspólne imię jak celebryci",
    adult: false,
  },
  "randki-i-zwiazki-018": {
    category: "randki-i-zwiazki",
    text: "nagrałby ukochanej osobie playlistę z dedykacjami",
    adult: false,
  },
  "randki-i-zwiazki-019": {
    category: "randki-i-zwiazki",
    text: "przyjaźniłby się z kimś dziesięć lat, zanim wyzna mu uczucia",
    adult: false,
  },
  "randki-i-zwiazki-020": {
    category: "randki-i-zwiazki",
    text: "oprowadziłby swoją sympatię po muzeum, opowiadając o każdym obrazie",
    adult: false,
  },
  "randki-i-zwiazki-021": {
    category: "randki-i-zwiazki",
    text: "przyszedłby na pierwszy obiad u przyszłych teściów z ciastem i przemową",
    adult: false,
  },
  "randki-i-zwiazki-022": {
    category: "randki-i-zwiazki",
    text: "zakochiwałby się co tydzień w kimś innym",
    adult: false,
  },
  "randki-i-zwiazki-023": {
    category: "randki-i-zwiazki",
    text: "kupiłby na urodziny drugiej połówki prezent, który sam chciał mieć",
    adult: false,
  },
  "randki-i-zwiazki-024": {
    category: "randki-i-zwiazki",
    text: "świętowałby w związku nawet „pół roku i dwa tygodnie”",
    adult: false,
  },
  "randki-i-zwiazki-025": {
    category: "randki-i-zwiazki",
    text: "przeprowadziłby się dla miłości do innego kraju",
    adult: false,
  },
  "randki-i-zwiazki-026": { category: "randki-i-zwiazki", text: "zerwałby z kimś przez SMS", adult: false },
  "randki-i-zwiazki-027": {
    category: "randki-i-zwiazki",
    text: "byłby świadkiem na pięciu ślubach w jednym roku",
    adult: false,
  },
  "randki-i-zwiazki-028": {
    category: "randki-i-zwiazki",
    text: "ustaliłby w związku grafik zmywania na cały rok",
    adult: false,
  },
  "randki-i-zwiazki-029": {
    category: "randki-i-zwiazki",
    text: "zakochałby się w kimś tylko dlatego, że ładnie pisze",
    adult: false,
  },
  "randki-i-zwiazki-030": {
    category: "randki-i-zwiazki",
    text: "zasypywałby nas zdjęciami swojej nowej sympatii",
    adult: false,
  },
  "randki-i-zwiazki-031": {
    category: "randki-i-zwiazki",
    text: "pocałowałby kogoś na pierwszej randce, zanim podadzą przystawki",
    adult: false,
  },
  "randki-i-zwiazki-032": {
    category: "randki-i-zwiazki",
    text: "zostałby na „jeszcze jedną herbatę” aż do rana",
    adult: true,
  },
  "randki-i-zwiazki-033": {
    category: "randki-i-zwiazki",
    text: "poszedłby na randkę na trzeźwo pierwszy raz od lat",
    adult: false,
  },
  "randki-i-zwiazki-034": {
    category: "randki-i-zwiazki",
    text: "spotykałby się z kimś „bez zobowiązań” i zakochał po tygodniu",
    adult: false,
  },
  "randki-i-zwiazki-035": {
    category: "randki-i-zwiazki",
    text: "zaprosiłby kogoś na randkę do baru, w którym zna wszystkich barmanów",
    adult: false,
  },
  "randki-i-zwiazki-036": {
    category: "randki-i-zwiazki",
    text: "nie wyszedłby z pokoju hotelowego przez całą podróż poślubną",
    adult: true,
  },
  "randki-i-zwiazki-037": {
    category: "randki-i-zwiazki",
    text: "flirtowałby nawet z kimś przy okienku na poczcie",
    adult: false,
  },
  "randki-i-zwiazki-038": {
    category: "randki-i-zwiazki",
    text: "umówiłby się z dwiema osobami na randkę w tym samym miejscu i o tej samej porze",
    adult: false,
  },
  "randki-i-zwiazki-039": {
    category: "randki-i-zwiazki",
    text: "całowałby się w samochodzie pod blokiem jak nastolatek",
    adult: false,
  },
  "randki-i-zwiazki-040": {
    category: "randki-i-zwiazki",
    text: "umówiłby się na randkę z ex swojego ex",
    adult: false,
  },
  // Pieniądze i zakupy
  "pieniadze-i-zakupy-001": {
    category: "pieniadze-i-zakupy",
    text: "płaciłby w sklepie stosem kuponów, a kolejka by czekała",
    adult: false,
  },
  "pieniadze-i-zakupy-002": {
    category: "pieniadze-i-zakupy",
    text: "jechałby przez pół miasta, żeby zaoszczędzić dwa złote na paliwie",
    adult: false,
  },
  "pieniadze-i-zakupy-003": {
    category: "pieniadze-i-zakupy",
    text: "zapisywałby każdy wydatek w arkuszu, łącznie z gumą do żucia",
    adult: false,
  },
  "pieniadze-i-zakupy-004": {
    category: "pieniadze-i-zakupy",
    text: "wydałby całą wypłatę w pierwszym tygodniu",
    adult: false,
  },
  "pieniadze-i-zakupy-005": {
    category: "pieniadze-i-zakupy",
    text: "zwracałby do sklepów internetowych połowę tego, co zamówi",
    adult: false,
  },
  "pieniadze-i-zakupy-006": {
    category: "pieniadze-i-zakupy",
    text: "kupiłby kryptowaluty dzień przed wielkim spadkiem",
    adult: false,
  },
  "pieniadze-i-zakupy-007": {
    category: "pieniadze-i-zakupy",
    text: "odkładałby rok na wymarzoną rzecz i kupił za to coś zupełnie innego",
    adult: false,
  },
  "pieniadze-i-zakupy-008": {
    category: "pieniadze-i-zakupy",
    text: "trzymałby oszczędności w słoiku schowanym w szafie",
    adult: false,
  },
  "pieniadze-i-zakupy-009": {
    category: "pieniadze-i-zakupy",
    text: "płaciłby od lat za subskrypcję, o której zapomniał",
    adult: false,
  },
  "pieniadze-i-zakupy-010": {
    category: "pieniadze-i-zakupy",
    text: "nie wydałby nic na siebie, a znajomym kupowałby prezenty za fortunę",
    adult: false,
  },
  "pieniadze-i-zakupy-011": {
    category: "pieniadze-i-zakupy",
    text: "kupiłby na raty telewizor większy niż ściana",
    adult: false,
  },
  "pieniadze-i-zakupy-012": {
    category: "pieniadze-i-zakupy",
    text: "trzymałby się listy zakupów co do jednej bułki",
    adult: false,
  },
  "pieniadze-i-zakupy-013": {
    category: "pieniadze-i-zakupy",
    text: "miałby w portfelu karty lojalnościowe każdego sklepu w mieście",
    adult: false,
  },
  "pieniadze-i-zakupy-014": {
    category: "pieniadze-i-zakupy",
    text: "zainwestowałby oszczędności w pomysł kumpla na biznes",
    adult: false,
  },
  "pieniadze-i-zakupy-015": {
    category: "pieniadze-i-zakupy",
    text: "rozliczałby wspólny rachunek w restauracji co do grosza",
    adult: false,
  },
  "pieniadze-i-zakupy-016": {
    category: "pieniadze-i-zakupy",
    text: "pożyczałby od wszystkich po dychę i nie pamiętał, komu ile wisi",
    adult: false,
  },
  "pieniadze-i-zakupy-017": {
    category: "pieniadze-i-zakupy",
    text: "stanąłby przy kasie z pełnym wózkiem i bez portfela",
    adult: false,
  },
  "pieniadze-i-zakupy-018": {
    category: "pieniadze-i-zakupy",
    text: "czekałby w Black Friday pod sklepem od piątej rano",
    adult: false,
  },
  "pieniadze-i-zakupy-019": {
    category: "pieniadze-i-zakupy",
    text: "przeglądałby sklepy internetowe w nocy, zamiast spać",
    adult: false,
  },
  "pieniadze-i-zakupy-020": {
    category: "pieniadze-i-zakupy",
    text: "znałby na pamięć cenę masła w każdym sklepie w okolicy",
    adult: false,
  },
  "pieniadze-i-zakupy-021": {
    category: "pieniadze-i-zakupy",
    text: "zamówiłby z telezakupów cudowny nóż, który kroi nawet buty",
    adult: false,
  },
  "pieniadze-i-zakupy-022": {
    category: "pieniadze-i-zakupy",
    text: "kupowałby bilety na koncerty w pierwszej minucie sprzedaży",
    adult: false,
  },
  "pieniadze-i-zakupy-023": {
    category: "pieniadze-i-zakupy",
    text: "wygrałby licytację w ostatniej sekundzie i przepłacił dwa razy",
    adult: false,
  },
  "pieniadze-i-zakupy-024": {
    category: "pieniadze-i-zakupy",
    text: "sprzedałby na Vinted nawet stare skarpetki",
    adult: false,
  },
  "pieniadze-i-zakupy-025": {
    category: "pieniadze-i-zakupy",
    text: "zostawiłby napiwek większy niż rachunek",
    adult: false,
  },
  "pieniadze-i-zakupy-026": {
    category: "pieniadze-i-zakupy",
    text: "nosiłby w portfelu paragony sprzed trzech lat",
    adult: false,
  },
  "pieniadze-i-zakupy-027": {
    category: "pieniadze-i-zakupy",
    text: "nie miałby przy sobie gotówki, nawet na parking",
    adult: false,
  },
  "pieniadze-i-zakupy-028": {
    category: "pieniadze-i-zakupy",
    text: "wydawałby majątek na kawę na mieście i narzekał na brak oszczędności",
    adult: false,
  },
  "pieniadze-i-zakupy-029": { category: "pieniadze-i-zakupy", text: "przeliczałby każdą cenę na kebaby", adult: false },
  "pieniadze-i-zakupy-030": {
    category: "pieniadze-i-zakupy",
    text: "kupowałby co tydzień z gazetki Lidla coś, czego nie potrzebuje",
    adult: false,
  },
  "pieniadze-i-zakupy-031": {
    category: "pieniadze-i-zakupy",
    text: "kupowałby zdrapki za każdą resztę z zakupów",
    adult: true,
  },
  "pieniadze-i-zakupy-032": {
    category: "pieniadze-i-zakupy",
    text: "kupiłby whisky za tysiąc złotych i czekał na okazję, która nigdy nie nadejdzie",
    adult: false,
  },
  "pieniadze-i-zakupy-033": {
    category: "pieniadze-i-zakupy",
    text: "kupiłby komuś drogi prezent po pierwszej randce",
    adult: false,
  },
  "pieniadze-i-zakupy-034": {
    category: "pieniadze-i-zakupy",
    text: "poszedłby do kasyna i postawił wszystko na czerwone",
    adult: true,
  },
  "pieniadze-i-zakupy-035": {
    category: "pieniadze-i-zakupy",
    text: "wydawałby więcej na taksówki po imprezach niż na same imprezy",
    adult: false,
  },
  "pieniadze-i-zakupy-036": {
    category: "pieniadze-i-zakupy",
    text: "płaciłby za wersję premium aplikacji randkowej",
    adult: true,
  },
  "pieniadze-i-zakupy-037": {
    category: "pieniadze-i-zakupy",
    text: "zaprosiłby kogoś na randkę i przy rachunku nagle „zapomniał” portfela",
    adult: false,
  },
  "pieniadze-i-zakupy-038": {
    category: "pieniadze-i-zakupy",
    text: "zrzucałby się z kumplami na beczkę piwa i nazywał to inwestycją",
    adult: false,
  },
  "pieniadze-i-zakupy-039": {
    category: "pieniadze-i-zakupy",
    text: "zbierałby po imprezie butelki, żeby odzyskać kaucję",
    adult: false,
  },
  "pieniadze-i-zakupy-040": {
    category: "pieniadze-i-zakupy",
    text: "zamówiłby w barze najdroższego drinka z karty, żeby komuś zaimponować",
    adult: false,
  },
  // Zwierzęta i dom
  "zwierzeta-i-dom-001": {
    category: "zwierzeta-i-dom",
    text: "mówiłby do swojego psa jak do człowieka i czekał na odpowiedź",
    adult: false,
  },
  "zwierzeta-i-dom-002": { category: "zwierzeta-i-dom", text: "dokarmiałby wszystkie koty z osiedla", adult: false },
  "zwierzeta-i-dom-003": {
    category: "zwierzeta-i-dom",
    text: "ubrałby psa w sweterek pasujący do własnego",
    adult: false,
  },
  "zwierzeta-i-dom-004": {
    category: "zwierzeta-i-dom",
    text: "trzymałby w akwarium rybki nazwane imionami piłkarzy",
    adult: false,
  },
  "zwierzeta-i-dom-005": {
    category: "zwierzeta-i-dom",
    text: "spałby na brzegu łóżka, żeby nie przeszkadzać kotu",
    adult: false,
  },
  "zwierzeta-i-dom-006": {
    category: "zwierzeta-i-dom",
    text: "wiedziałby wszystko o każdym sąsiedzie z klatki",
    adult: false,
  },
  "zwierzeta-i-dom-007": {
    category: "zwierzeta-i-dom",
    text: "odbierałby paczki za cały blok, bo zawsze jest w domu",
    adult: false,
  },
  "zwierzeta-i-dom-008": {
    category: "zwierzeta-i-dom",
    text: "wierciłby w ścianę w niedzielę o ósmej rano",
    adult: false,
  },
  "zwierzeta-i-dom-009": {
    category: "zwierzeta-i-dom",
    text: "robiłby remont przez trzy lata i wciąż go nie skończył",
    adult: false,
  },
  "zwierzeta-i-dom-010": {
    category: "zwierzeta-i-dom",
    text: "skręciłby szafę i został z garścią śrubek, które „chyba nie są potrzebne”",
    adult: false,
  },
  "zwierzeta-i-dom-011": {
    category: "zwierzeta-i-dom",
    text: "nazwałby psa zwykłym ludzkim imieniem, na przykład Zbigniew",
    adult: false,
  },
  "zwierzeta-i-dom-012": {
    category: "zwierzeta-i-dom",
    text: "obchodziłby urodziny chomika z tortem i czapeczkami",
    adult: false,
  },
  "zwierzeta-i-dom-013": {
    category: "zwierzeta-i-dom",
    text: "hodowałby na balkonie w bloku pomidory i chwalił się każdym",
    adult: false,
  },
  "zwierzeta-i-dom-014": {
    category: "zwierzeta-i-dom",
    text: "miałby mieszkanie czyste jak z katalogu, bo prawie w nim nie bywa",
    adult: false,
  },
  "zwierzeta-i-dom-015": {
    category: "zwierzeta-i-dom",
    text: "powiesiłby półkę krzywo i twierdził, że tak miało być",
    adult: false,
  },
  "zwierzeta-i-dom-016": {
    category: "zwierzeta-i-dom",
    text: "zarzekałby się, że pies nie wejdzie do łóżka, a po tygodniu spał z nim pod kołdrą",
    adult: false,
  },
  "zwierzeta-i-dom-017": {
    category: "zwierzeta-i-dom",
    text: "miałby kota, który pojawia się na każdym spotkaniu online",
    adult: false,
  },
  "zwierzeta-i-dom-018": {
    category: "zwierzeta-i-dom",
    text: "zabrałby do domu pisklę, które wcale nie potrzebowało ratunku",
    adult: false,
  },
  "zwierzeta-i-dom-019": {
    category: "zwierzeta-i-dom",
    text: "przenosiłby jeże przez jezdnię w drodze do pracy",
    adult: false,
  },
  "zwierzeta-i-dom-020": {
    category: "zwierzeta-i-dom",
    text: "zamieniłby mieszkanie w dżunglę z roślin doniczkowych",
    adult: false,
  },
  "zwierzeta-i-dom-021": {
    category: "zwierzeta-i-dom",
    text: "zbudowałby w salonie fort z poduszek i spał w nim",
    adult: false,
  },
  "zwierzeta-i-dom-022": {
    category: "zwierzeta-i-dom",
    text: "wyprowadziłby się na noc z mieszkania przez jednego pająka",
    adult: false,
  },
  "zwierzeta-i-dom-023": {
    category: "zwierzeta-i-dom",
    text: "przyklejałby na klatce kartki z uwagami do sąsiadów",
    adult: false,
  },
  "zwierzeta-i-dom-024": {
    category: "zwierzeta-i-dom",
    text: "przytargałby do mieszkania fotel znaleziony przy śmietniku",
    adult: false,
  },
  "zwierzeta-i-dom-025": {
    category: "zwierzeta-i-dom",
    text: "byłby ignorowany przez własnego kota, który uwielbia wszystkich gości",
    adult: false,
  },
  "zwierzeta-i-dom-026": {
    category: "zwierzeta-i-dom",
    text: "trzymałby zapasowy klucz pod wycieraczką, o czym wie całe osiedle",
    adult: false,
  },
  "zwierzeta-i-dom-027": {
    category: "zwierzeta-i-dom",
    text: "przeglądałby oferty mieszkań, choć wcale nie zamierza się przeprowadzać",
    adult: false,
  },
  "zwierzeta-i-dom-028": {
    category: "zwierzeta-i-dom",
    text: "przygarnąłby papugę, która przeklina gorzej niż on",
    adult: false,
  },
  "zwierzeta-i-dom-029": {
    category: "zwierzeta-i-dom",
    text: "kupiłby dwie świnki morskie, a po roku miał ich dwadzieścia",
    adult: false,
  },
  "zwierzeta-i-dom-030": {
    category: "zwierzeta-i-dom",
    text: "spędzałby soboty w markecie budowlanym, nic nie kupując",
    adult: false,
  },
  "zwierzeta-i-dom-031": {
    category: "zwierzeta-i-dom",
    text: "wyprosiłby kota z sypialni tylko na specjalne okazje",
    adult: true,
  },
  "zwierzeta-i-dom-032": {
    category: "zwierzeta-i-dom",
    text: "chodziłby z psem do parku głównie po to, żeby kogoś poznać",
    adult: false,
  },
  "zwierzeta-i-dom-033": {
    category: "zwierzeta-i-dom",
    text: "urządzałby domówki, po których sąsiedzi dzwonią na policję",
    adult: false,
  },
  "zwierzeta-i-dom-034": {
    category: "zwierzeta-i-dom",
    text: "miałby w domu barek z kolekcją wódek smakowych",
    adult: false,
  },
  "zwierzeta-i-dom-035": {
    category: "zwierzeta-i-dom",
    text: "poszedłby do sąsiada po korkociąg i został u niego do rana",
    adult: true,
  },
  "zwierzeta-i-dom-036": {
    category: "zwierzeta-i-dom",
    text: "jeździłby windą w górę i w dół, byle dłużej pogadać z ładną osobą z siódmego piętra",
    adult: false,
  },
  "zwierzeta-i-dom-037": {
    category: "zwierzeta-i-dom",
    text: "rozpoznawałby sąsiadów po odgłosach zza ściany",
    adult: false,
  },
  "zwierzeta-i-dom-038": { category: "zwierzeta-i-dom", text: "nazwałby kota Whisky, a psa Bimber", adult: false },
  "zwierzeta-i-dom-039": {
    category: "zwierzeta-i-dom",
    text: "piłby z sąsiadem piwo na ławce pod blokiem",
    adult: false,
  },
  "zwierzeta-i-dom-040": {
    category: "zwierzeta-i-dom",
    text: "zakochałby się w weterynarzu swojego kota",
    adult: false,
  },
} as const satisfies Record<string, QuestionEntry>;

export type QuestionId = keyof typeof QUESTIONS;
