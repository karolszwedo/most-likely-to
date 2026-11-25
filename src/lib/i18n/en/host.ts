import { dateFormat, plural, type Messages } from "@/lib/i18n";

// English dictionary: the host's screens before and after a game (new game, your games, a game's history, the header).

// Made on the first date, as in the Polish dictionary (src/lib/i18n/pl/host.ts says why).
let day: Intl.DateTimeFormat | undefined;
let time: Intl.DateTimeFormat | undefined;

export const host: Messages["host"] = {
  gameList: {
    // "Tuesday, 10 November 2026, 21:14" (en-GB, Europe/Warsaw).
    date: (at) => {
      day ??= dateFormat("en", { weekday: "long", day: "numeric", month: "long", year: "numeric" });
      time ??= dateFormat("en", { hour: "2-digit", minute: "2-digit" });
      return `${day.format(at)}, ${time.format(at)}`;
    },
    questions: (count) => `${String(count)} ${plural("en", count, { one: "question", other: "questions" })}`,
    notStarted: "The game never started",
  },
  header: {
    gameName: "Most Likely To",
    signOut: "Sign out",
  },
  openRoom: {
    title: "You have an open room",
    playing: (players) => `Game in progress, ${players}`,
    lobby: (players) => `${players} in the lobby`,
    back: "Back to the room",
  },
  newGameCard: {
    title: "New game",
    description: "Type your nickname and pick categories. You’ll get the link for players right away.",
  },
  newGameForm: {
    nickLabel: "Your nickname",
    nickPlaceholder: "e.g. Sam",
    nickHint: (max) => `This is how other players will see you. At most ${String(max)} characters.`,
    nickMissing: "Enter your nickname",
    nickTooLong: (max) => `A nickname can have at most ${String(max)} characters`,
    categoriesHeading: "Question categories",
    pickAll: "Select all",
    unpickAll: "Clear all",
    categoriesHint: "Turn on 18+ questions separately in each category.",
    categoriesMissing: "Pick at least one category",
    adult: "18+",
    adultIn: (category) => `in the ${category} category`,
    closeRoomTitle: (players) => `The old room (${players}) will be closed`,
    closeRoomText: "The players in that room will see that the game is over.",
    closeAndCreate: "Close the old room and create the game",
    cancel: "Cancel",
    create: "Create game",
    creating: "Creating…",
  },
  gamesLink: {
    title: "Your games",
    text: "Finished games: when, how many questions, who played.",
    link: "View",
    linkLabel: "View your games",
  },
  games: {
    title: "Your games",
    subtitle: "Finished games, newest first.",
    empty: "You have no finished games yet.",
    newGame: "New game",
    history: "History",
    historyLabel: (date) => `History of the game: ${date}`,
    deleted: "Game deleted.",
  },
  deleteGame: {
    delete: "Delete",
    deleteLabel: (date) => `Delete the game: ${date}`,
    question: "Delete this game?",
    consequences:
      "This game’s nicknames, results and questions will disappear. Only anonymous question counts stay (times asked, skips, thumbs up and down), not linked to any nickname or to this game.",
    confirm: "Delete game",
    deleting: "Deleting…",
    cancel: "Cancel",
  },
  history: {
    title: "Game history",
    back: "Your games",
    summaryHeading: "Evening summary",
    notStarted: "The game never started, so there are no questions here.",
    questionsHeading: "Questions in order",
    questionNumber: (number) => `Question ${String(number)}`,
    own: "Yours",
    proposal: "a guest’s suggestion",
    skipped: "Question skipped.",
    cutShort: "The game ended before the reveal.",
    abstained: (count) => `Abstained: ${String(count)}`,
    votesLost: "Some of the votes were lost along with a removed player.",
    unknown: {
      title: "There’s no such game.",
      text: "It may have been deleted, or the address is incomplete.",
    },
    playing: {
      title: "This game is still on.",
      text: "Its history will be here once the game is over.",
    },
    errorTitle: "Couldn’t open the game’s history.",
    backToList: "Your games",
  },
};
