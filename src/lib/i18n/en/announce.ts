import type { Messages } from "@/lib/i18n";

// English dictionary: the screen reader's sentences.
export const announce: Messages["announce"] = {
  eveningEnd: "End of the evening.",
  skipped: "The question was skipped.",
  revealed: "Result revealed.",
  question: (number, total, sentence) => `Question ${String(number)} of ${String(total)}. ${sentence}`,
  gameStarted: (question) => `The game has started. ${question}`,
  afterSkip: (question) => `The previous question was skipped. ${question}`,
  cohostGiven: "You’re a co-host: you can run the game.",
  cohostTaken: "You’re no longer a co-host.",
};
