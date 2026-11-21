// Polish dictionary: page titles, the layout's banner, the config warnings (src/pages/, src/layouts/, src/lib/config-status.ts),
// and / for someone not signed in (Landing.astro, HomeScreenHint.astro).
export const pages = {
  // The banner of a missing config on every page (src/layouts/Layout.astro): "Uwaga: <message> <docs>."
  layout: {
    warning: "Uwaga:",
    docs: "Dokumentacja",
  },
  // The config warnings (src/lib/config-status.ts).
  config: {
    supabase: {
      message: "Supabase nie jest skonfigurowany — funkcje uwierzytelniania są wyłączone.",
      docsLabel: "Zobacz instrukcję konfiguracji",
    },
  },
  // The browser tab's names (<title>). The link's page names its tab by its screen (link.tabTitle), the room's page
  // by its own.
  titles: {
    // A page that names none (Layout.astro): / for someone not signed in.
    default: "Most Likely To",
    newGame: "Nowa gra",
    signIn: "Zaloguj się",
    games: "Twoje gry",
    // A game's history, /gry/<id>: the history, a game that is not there, a game still open, an error.
    history: "Historia gry",
    historyUnknown: "Nie ma takiej gry",
    historyPlaying: "Ta gra jeszcze trwa",
    historyError: "Historia gry",
  },
  // / for someone not signed in (Landing.astro), under the game's title and sentence (link.intro).
  landing: {
    signIn: "Zaloguj się, żeby założyć grę",
    haveLink: "Masz link od hosta? Otwórz go, żeby dołączyć.",
  },
  // On a phone, one line on / on how to add the game to the home screen (HomeScreenHint.astro). A no-break space keeps
  // the menu's ⋮ on the line of the word "menu".
  homeScreenHint: {
    android: "Dodaj grę do ekranu głównego z menu\u00a0⋮ przeglądarki.",
    ios: "Dodaj grę do ekranu początkowego: „Udostępnij” w Safari.",
  },
};
