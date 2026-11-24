import { plural } from "@/lib/i18n";

// "1 głos", "2 głosy", "5 głosów". A function, so plural runs only when a screen asks (never at the module's load).
function votes(count: number): string {
  return `${String(count)} ${plural("pl", count, { one: "głos", few: "głosy", many: "głosów" })}`;
}

// Polish dictionary: the round (voting, reveal, skip, result table, summary, thumbs, emotes' bar).
export const round = {
  // The quiet line on every round's screen when the room's state could not be refreshed (RoundVoting, RoundReveal,
  // RoundSkipped).
  refreshFailed: "Nie udało się odświeżyć stanu gry",
  // The badges next to a nick: the host, and the screen's own player (RoundVoting, ResultTable, GameSummary).
  badges: {
    host: "host",
    me: "ty",
    voted: "zagłosował(a)",
  },
  // The voting (RoundVoting).
  voting: {
    // The list of players with its count: "Gracze (5)".
    playersHeading: (count: number) => `Gracze (${String(count)})`,
    // Under a latecomer's nick let in during this question.
    fromNextQuestion: "od następnego pytania",
    // "Zagłosowało: 3 z 5": who has voted so far out of those who may.
    votedCount: (voted: number, eligible: number) => `Zagłosowało: ${String(voted)} z ${String(eligible)}`,
    // Under the list "Gracze", for every player, and for the host once a guest is in the room (the same texts as the
    // lobby's, room.ts).
    colorHint: "Dotknij swojej kropki, żeby zmienić kolor.",
    cohostHint: "Współhost może prowadzić grę: odsłonić wynik, pominąć pytanie, wpuścić spóźnionych i ją zakończyć.",
    // Under the question: before the vote, and after it (a leader may reveal it themselves).
    hint: "Wybierz jedną osobę, także siebie, albo wstrzymaj się.",
    waitingLeader: "Wynik pokaże się, gdy zagłosują wszyscy.",
    waiting: "Wynik pokaże się, gdy zagłosują wszyscy albo gdy prowadzący go odsłoni.",
    // A latecomer let in during this question.
    latecomerTitle: "Zagłosujesz od następnego pytania",
    latecomerText: "Prowadzący wpuścił cię w trakcie tego pytania. Wynik zobaczysz razem z innymi.",
    // After the vote; myVote: the own choice this tab remembers (S-04).
    votedTitle: "Głos oddany",
    abstained: "Wstrzymujesz się.",
    myVote: (nick: string) => `Twój głos: ${nick}.`,
    final: "Głosu nie da się zmienić.",
    // The form.
    legend: "Twój głos",
    abstain: "Wstrzymuję się",
    missingChoice: "Wybierz osobę albo „Wstrzymuję się”.",
    sending: "Wysyłanie…",
    vote: "Zagłosuj",
    // The leader's buttons while the question is voting (HostActions): voted of eligible as in votedCount.
    reveal: {
      label: "Odsłoń wynik",
      busyLabel: "Odsłanianie…",
      confirmText: (voted: number, eligible: number) =>
        `Na pewno odsłonić? Zagłosowało ${String(voted)} z ${String(eligible)}`,
    },
    skip: {
      label: "Pomiń pytanie",
      busyLabel: "Pomijanie…",
      confirmText: (voted: number, eligible: number) =>
        `Na pewno pominąć? Głosy przepadną (zagłosowało ${String(voted)} z ${String(eligible)})`,
    },
    leaderNote: "Możesz odsłonić wynik w każdej chwili, także zanim zagłosują wszyscy.",
  },
  // The reveal (RoundReveal).
  reveal: {
    heading: "Wynik",
    viewToggle: "Widok wyniku",
    // The toggle's two views, keyed by ResultView (src/lib/rooms/chart.ts).
    views: { pie: "Koło", bars: "Paski" },
    abstained: (count: number) => `Wstrzymało się: ${String(count)}`,
  },
  // The result's table (ResultTable), in the reveal and the game's history.
  resultTable: {
    player: "Gracz",
    votes: "Głosy",
  },
  // A skipped question that was the game's last (RoundSkipped).
  skipped: {
    title: "Prowadzący pominął pytanie.",
    votesGone: "Głosy z niego przepadły.",
  },
  // "Oceń pytanie" under the reveal's question (QuestionReaction, S-30): the thumbs' names, and the word each button
  // shows next to its thumb. The shown word starts the name, so a voice user says what they see (WCAG 2.5.3).
  reaction: {
    label: "Oceń pytanie",
    up: "Dobre pytanie",
    down: "Słabe pytanie",
    words: { up: "Dobre", down: "Słabe" },
  },
  // The emotes' bar (EmoteBar) and what a screen reader hears of the newest bubble (EmoteBubbles): "<nick>: <name>".
  emotes: {
    label: "Emotki",
    spoken: (nick: string, name: string) => `${nick}: ${name}`,
  },
  // The end of the evening's summary and the game's history (GameSummary).
  summary: {
    // "1 głos", "2 głosy", "5 głosów": a top player's votes, and everyone else's together.
    votes,
    // After a top player's nick, and the line for everyone else.
    topVotes: (count: number) => `— ${votes(count)}`,
    rest: (count: number) => `pozostali — ${votes(count)}`,
    revealed: "Odsłoniętych pytań:",
    votesTotal: "Ilość głosów łącznie:",
    // The two cards' headings: "dziś" on the end of the evening, "tego wieczoru" on the game's history (S-26).
    headings: {
      end: { top: "Najwięcej głosów dziś", unvoted: "Nikt dziś nie głosował na" },
      history: { top: "Najwięcej głosów tego wieczoru", unvoted: "Tego wieczoru nikt nie głosował na" },
    },
  },
};
