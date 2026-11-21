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
};
