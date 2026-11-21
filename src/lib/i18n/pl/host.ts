import { dateFormat, plural } from "@/lib/i18n";

// Polish dictionary: the host's screens before and after a game (new game, Twoje gry, a game's history, the header):
// src/components/room/ NewGameForm, OpenRoomNotice, HostGamesLink, HostGames, DeleteGameButton, GameHistory, AppHeader.

// Made on the first date, not here: this module is part of src/lib/i18n's own import, which has not finished when this
// one runs.
let day: Intl.DateTimeFormat | undefined;
let time: Intl.DateTimeFormat | undefined;

export const host = {
  // A row of "Twoje gry" (src/lib/rooms/game-list.ts) and the date of a game's history.
  gameList: {
    // Karol's pick "D2": the day in words, then ", " and the hour, in Europe/Warsaw (dateFormat): "wtorek, 10 listopada
    // 2026, 21:14". Two formats joined, because pl-PL's dateStyle "full" with timeStyle "short" puts no comma before the
    // hour.
    date: (at: Date) => {
      day ??= dateFormat("pl", { weekday: "long", day: "numeric", month: "long", year: "numeric" });
      time ??= dateFormat("pl", { hour: "2-digit", minute: "2-digit" });
      return `${day.format(at)}, ${time.format(at)}`;
    },
    // "1 pytanie", "2 pytania", "7 pytań": the questions the game opened, the skipped ones included.
    questions: (count: number) =>
      `${String(count)} ${plural("pl", count, { one: "pytanie", few: "pytania", many: "pytań" })}`,
    // Instead of the count, for a game that never started.
    notStarted: "Gra nie wystartowała",
  },
  // The top bar of the game's screens (AppHeader.astro).
  header: {
    gameName: "Most Likely To",
    signOut: "Wyloguj",
  },
  // "Wróć do pokoju" above the "Nowa gra" card (OpenRoomNotice.astro); players: the count's phrase (common.players).
  openRoom: {
    title: "Masz otwarty pokój",
    playing: (players: string) => `Gra w toku, ${players}`,
    lobby: (players: string) => `${players} w poczekalni`,
    back: "Wróć do pokoju",
  },
  // The card of "Nowa gra" on / (index.astro, RoomCard.astro).
  newGameCard: {
    title: "Nowa gra",
    description: "Wpisz swój nick i wybierz kategorie. Link dla graczy dostaniesz od razu.",
  },
  // The new game's form (NewGameForm.tsx).
  newGameForm: {
    nickLabel: "Twój nick",
    nickPlaceholder: "np. Ola",
    nickHint: (max: number) => `Tak zobaczą cię inni gracze. Najwyżej ${String(max)} znaków.`,
    nickMissing: "Podaj swój nick",
    nickTooLong: (max: number) => `Nick może mieć najwyżej ${String(max)} znaków`,
    categoriesHeading: "Kategorie pytań",
    // The shortcut over the categories (categories-unticked).
    pickAll: "Zaznacz wszystkie",
    unpickAll: "Odznacz wszystkie",
    categoriesHint: "Pytania 18+ włączasz osobno w każdej kategorii.",
    categoriesMissing: "Wybierz co najmniej jedną kategorię",
    // A category's 18+ checkbox: the visible label, and for a screen reader which category it is in.
    adult: "18+",
    adultIn: (category: string) => `w kategorii ${category}`,
    // The question before "Nowa gra" closes the host's room with guests; players: the count's phrase (common.players).
    closeRoomTitle: (players: string) => `Stary pokój (${players}) zostanie zamknięty`,
    closeRoomText: "Gracze z tamtego pokoju zobaczą, że gra się skończyła.",
    closeAndCreate: "Zamknij stary pokój i załóż grę",
    cancel: "Anuluj",
    create: "Załóż grę",
    creating: "Zakładanie…",
  },
  // The way to "Twoje gry" under the "Nowa gra" card (HostGamesLink.astro).
  gamesLink: {
    title: "Twoje gry",
    text: "Zakończone gry: kiedy, ile pytań, kto grał.",
    link: "Zobacz",
    linkLabel: "Zobacz twoje gry",
  },
  // The host's list of own games, /gry (HostGames.tsx).
  games: {
    title: "Twoje gry",
    subtitle: "Zakończone gry, najnowsze na górze.",
    empty: "Nie masz jeszcze zakończonych gier.",
    newGame: "Nowa gra",
    history: "Historia",
    // The history's link name says which game, its visible word first; date: the row's date.
    historyLabel: (date: string) => `Historia gry: ${date}`,
    // The screen reader's line after a deletion.
    deleted: "Gra usunięta.",
  },
  // "Usuń" in a game's row of "Twoje gry" (DeleteGameButton.tsx).
  deleteGame: {
    delete: "Usuń",
    // The button's name says which game it deletes; date: the row's date.
    deleteLabel: (date: string) => `Usuń grę: ${date}`,
    question: "Na pewno usunąć tę grę?",
    consequences:
      "Znikną nicki, wyniki i pytania tej gry. Zostaną tylko anonimowe liczniki pytań (ile razy padły, pominięcia, kciuki), bez nicków i bez tej gry.",
    confirm: "Usuń grę",
    deleting: "Usuwam…",
    cancel: "Anuluj",
  },
  // A game's history, /gry/<id> (GameHistory.tsx).
  history: {
    title: "Historia gry",
    back: "Twoje gry",
    summaryHeading: "Podsumowanie wieczoru",
    notStarted: "Gra nie wystartowała, więc nie ma tu pytań.",
    questionsHeading: "Pytania po kolei",
    questionNumber: (number: number) => `Pytanie ${String(number)}`,
    // Where a question comes from: the host's own or reworded one, an approved proposal (never its author).
    own: "Twoje",
    proposal: "propozycja gościa",
    skipped: "Pytanie pominięte.",
    cutShort: "Gra skończyła się przed odsłoną.",
    abstained: (count: number) => `Wstrzymało się: ${String(count)}`,
    votesLost: "Część głosów przepadła razem z usuniętym graczem.",
    // The page's answers when there is no history to show (GameHistoryMessage), each with the way back.
    unknown: {
      title: "Nie ma takiej gry.",
      text: "Mogła zostać usunięta albo adres jest niepełny.",
    },
    playing: {
      title: "Ta gra jeszcze trwa.",
      text: "Jej historia będzie tutaj, gdy gra się skończy.",
    },
    errorTitle: "Nie udało się otworzyć historii gry.",
    backToList: "Twoje gry",
  },
};
