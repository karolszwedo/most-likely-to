// Polish dictionary: the link's page /j/ (JoinForm, JoinWaiting, LinkScreen, link-page.ts, the link's card in game-intro.ts)
// and the centred message of the room pages (RoomMessage).

// What the game is, for someone who has never played it (Karol's choice from the gallery of join-page-ui, 16.11.2026:
// "zdanie 1"). The two questions in the sentence are written out by hand, never imported from src/data/questions.ts:
// the questions stay on the server (lessons.md), and this text also reaches every link's preview.
const GAME_TITLE = "Kto z nas najprawdopodobniej…?";
const GAME_TEASER =
  "…zasnąłby na własnej imprezie? …nadałby imię swojemu odkurzaczowi? Wskażcie, kto z ekipy pasuje najbardziej. Głos jest anonimowy, wynik widzą wszyscy.";

export const link = {
  // The browser tab's name from the screen's title (linkTitle in src/components/room/link-page.ts, join-page-ui, Z4).
  tabTitle: {
    join: "Dołącz do gry",
    request: "Poproś o wejście",
    // A request to join or to come back a leader turned away, in the lobby and in a game in play.
    rejected: "Prowadzący cię nie wpuścił",
    waiting: "Czekasz na wejście",
    closed: "Ta gra już się skończyła",
    unknown: "Ten link nie działa",
    error: "Nie udało się otworzyć linku",
  },
  // The end of the game in one wording (K1): a link opened after the game, and a latecomer whose request was still
  // waiting when the game ended. e2e looks for this h1 (tests/e2e/game.spec.ts).
  gameOver: {
    title: "Ta gra już się skończyła.",
    text: "Poproś hosta o nowy link.",
  },
  // An unknown link (T2). e2e looks for this h1 (tests/e2e/support/room.ts).
  deadLink: {
    title: "Ten link nie działa.",
    text: "Sprawdź, czy skopiował się cały, albo poproś hosta o nowy.",
  },
  // The title and the sentence under it on / (not signed in) and on the host's link /j/<code> (GameIntro.astro).
  intro: {
    title: GAME_TITLE,
    teaser: GAME_TEASER,
  },
  // The link's preview card on Discord, Messenger or WhatsApp (linkPreview in src/components/room/game-intro.ts, the
  // Open Graph tags of Layout.astro): the same for every room and state. Discord shows og:title up to 70 bytes and
  // og:description up to 350; this description is 195 bytes of UTF-8.
  preview: {
    siteName: "Most Likely To",
    title: "Dołącz do gry",
    description: `${GAME_TITLE} ${GAME_TEASER}`,
  },
  // The cards and the error of the link's page (LinkScreen.astro, RoomCard.astro).
  screen: {
    // A room in the lobby.
    joinTitle: "Dołącz do gry",
    joinText: "Wpisz nick i jesteś w grze. Konto nie jest potrzebne.",
    // A game in play: the latecomer asks a leader to let them in.
    requestTitle: "Poproś o wejście",
    requestText: "Gra już trwa, więc prowadzący musi cię wpuścić. Wpisz nick i poproś o wejście.",
    // A leader turned the request away: to come back in the lobby, to come back in a game in play, to join.
    rejectedTitle: "Prowadzący cię nie wpuścił.",
    rejectedReturnLobbyText: "Możesz poprosić o powrót jeszcze raz albo dołączyć pod innym nickiem.",
    rejectedReturnText: "Możesz poprosić o powrót jeszcze raz albo o wejście pod innym nickiem.",
    rejectedRequestText: "Możesz poprosić o wejście jeszcze raz.",
    errorTitle: "Nie udało się otworzyć linku.",
  },
  // The guest's way in (JoinForm.tsx): the form of each variant, then the question "To ty?" next to a taken nick.
  joinForm: {
    // A room in the lobby: the guest is in at once.
    join: {
      submit: "Dołącz",
      pending: "Dołączanie…",
      hint: (max: number) => `Tak zobaczą cię inni gracze. Najwyżej ${String(max)} znaków.`,
      other: "albo dołącz pod innym nickiem",
    },
    // A game in play: the form asks a leader to let the latecomer in.
    request: {
      submit: "Poproś o wejście",
      pending: "Wysyłanie prośby…",
      hint: (max: number) =>
        `Ten nick zobaczy prowadzący, a gdy cię wpuści, także inni gracze. Najwyżej ${String(max)} znaków.`,
      other: "albo poproś o wejście pod innym nickiem",
    },
    // The same after a leader turned the request away.
    requestAgain: {
      submit: "Poproś jeszcze raz",
      pending: "Wysyłanie prośby…",
      hint: (max: number) => `Możesz zostawić ten nick albo wpisać inny. Najwyżej ${String(max)} znaków.`,
      other: "albo poproś o wejście pod innym nickiem",
    },
    nickLabel: "Twój nick",
    // The field for another nick under the question "To ty?".
    otherNickLabel: "Inny nick",
    nickPlaceholder: "np. Ola",
    nickMissing: "Podaj swój nick",
    nickTooLong: (max: number) => `Nick może mieć najwyżej ${String(max)} znaków`,
    // "<nick> już gra w tym pokoju.": the text after the nick, which the form shows in bold.
    nickTakenAfter: " już gra w tym pokoju.",
    isItYou: "To ty, na innym telefonie albo w innej przeglądarce?",
    returnSubmit: "Tak, to ja. Poproś o powrót",
    returnPending: "Wysyłanie prośby…",
    // What coming back brings, in the lobby and in a game in play.
    returnLobbyText: "Prowadzący sprawdzi, że to ty, i wrócisz na swoje miejsce, ze swoim kolorem.",
    returnText: "Prowadzący sprawdzi, że to ty, i wrócisz na swoje miejsce: z kolorem, wynikami i oddanym głosem.",
  },
  // The latecomer's screen while the request waits (JoinWaiting.tsx).
  waiting: {
    title: "Czekasz, aż prowadzący cię wpuści",
    returningTitle: "Czekasz, aż prowadzący potwierdzi, że to ty",
    // "Prosisz o wejście jako <nick>.": the texts before and after the nick, which the screen shows in bold.
    askingBefore: "Prosisz o wejście jako ",
    returningBefore: "Prosisz o powrót jako ",
    nickAfter: ".",
    text: "Gdy prowadzący cię wpuści, ta strona sama przejdzie do gry.",
    returningText: "Gdy prowadzący cię wpuści, wrócisz na swoje miejsce: z kolorem, wynikami i oddanym głosem.",
    refreshFailed: "Nie udało się odświeżyć stanu gry",
  },
  // The centred message of the room pages (RoomMessage.tsx), on /j/ and on /r/: the way out of an error.
  message: {
    refresh: "Odśwież stronę",
  },
};
