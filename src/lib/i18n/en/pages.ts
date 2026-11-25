import type { Messages } from "@/lib/i18n";

// English dictionary: page titles, the layout's banner, the config warnings, / for someone not signed in.
export const pages: Messages["pages"] = {
  layout: {
    warning: "Warning:",
    docs: "Documentation",
  },
  config: {
    supabase: {
      message: "Supabase isn’t configured — signing in is turned off.",
      docsLabel: "See the setup instructions",
    },
  },
  titles: {
    default: "Most Likely To",
    newGame: "New game",
    signIn: "Sign in",
    games: "Your games",
    history: "Game history",
    historyUnknown: "There’s no such game",
    historyPlaying: "This game is still on",
    historyError: "Game history",
  },
  landing: {
    signIn: "Sign in to create a game",
    haveLink: "Got a link from a host? Open it to join.",
  },
  // A no-break space keeps the menu's ⋮ next to the word "menu", as in Polish.
  homeScreenHint: {
    android: "Add the game to your home screen from the browser’s ⋮\u00a0menu.",
    ios: "Add the game to your home screen: “Share” in Safari.",
  },
};
