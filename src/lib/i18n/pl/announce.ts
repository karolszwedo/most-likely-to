// Polish dictionary: the screen reader's sentences (src/lib/rooms/announce.ts and the room's live regions). A move the
// host or a co-host may make is the leader's ("prowadzący", S-07).
export const announce = {
  eveningEnd: "Koniec wieczoru.",
  skipped: "Prowadzący pominął pytanie.",
  revealed: "Wynik odsłonięty.",
  // "Pytanie 7 z 15." as RoundCounter shows it (game-length), then the question's sentence (questionSentence, in the
  // language of the question's text).
  question: (number: number, total: number, sentence: string) =>
    `Pytanie ${String(number)} z ${String(total)}. ${sentence}`,
  // The first question starts the game first, and the one after a skip says the skip first (`question` above).
  gameStarted: (question: string) => `Gra się zaczęła. ${question}`,
  afterSkip: (question: string) => `Prowadzący pominął poprzednie pytanie. ${question}`,
  // A guest given the co-host role by the host, and one it was taken from (S-07).
  cohostGiven: "Jesteś współhostem: możesz prowadzić grę.",
  cohostTaken: "Nie jesteś już współhostem.",
};
