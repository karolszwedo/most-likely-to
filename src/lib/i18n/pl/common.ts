import { plural } from "@/lib/i18n";

// Polish dictionary: words and sentences more than one screen shares.
export const common = {
  // "1 gracz", "2 graczy", "5 graczy": every count but 1 says "graczy" (the open room's notice on /, the old room's line
  // of "Nowa gra").
  players: (count: number) =>
    `${String(count)} ${plural("pl", count, { one: "gracz", few: "graczy", many: "graczy" })}`,
  // The question as one sentence (questionSentence in src/lib/rooms/shared.ts): the base's and the host's questions are
  // the ending after its start, without the "?". notLoaded: the base did not have the round's question.
  question: {
    sentence: (text: string) => `Kto z nas najprawdopodobniej ${text}?`,
    notLoaded: "Nie udało się wczytać pytania.",
  },
  // The switch of the screen's language in the corner of every screen (LanguageSwitch, S-27): the code on its button
  // with, for a screen reader only, what the button is, the menu's name and its rows. Every language is named in itself,
  // so codes and names are the same in every dictionary.
  screenLang: {
    codes: { pl: "PL", en: "EN" },
    names: { pl: "Polski", en: "English" },
    afterCode: ", język ekranu",
    menu: "Język ekranu",
  },
};
