import { plural, type Messages } from "@/lib/i18n";

// English dictionary: words and sentences more than one screen shares.
export const common: Messages["common"] = {
  players: (count) => `${String(count)} ${plural("en", count, { one: "player", other: "players" })}`,
  question: {
    sentence: (text) => `Who’s most likely to ${text}?`,
    notLoaded: "Couldn’t load the question.",
  },
  screenLang: {
    codes: { pl: "PL", en: "EN" },
    names: { pl: "Polski", en: "English" },
    afterCode: ", screen language",
    menu: "Screen language",
  },
};
