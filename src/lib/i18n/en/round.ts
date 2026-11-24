import { plural, type Messages } from "@/lib/i18n";

function votes(count: number): string {
  return `${String(count)} ${plural("en", count, { one: "vote", other: "votes" })}`;
}

// English dictionary: the round (voting, reveal, skip, result table, summary, thumbs, emotes' bar).
export const round: Messages["round"] = {
  refreshFailed: "Couldn’t refresh the game",
  badges: {
    host: "host",
    me: "you",
    voted: "voted",
  },
  voting: {
    playersHeading: (count) => `Players (${String(count)})`,
    fromNextQuestion: "from the next question",
    votedCount: (voted, eligible) => `Voted: ${String(voted)} of ${String(eligible)}`,
    colorHint: "Tap your dot to change your colour.",
    cohostHint: "A co-host can run the game: reveal the result, skip a question, let latecomers in and end it.",
    hint: "Pick one person, yourself included, or abstain.",
    waitingLeader: "You’ll see the result once everyone has voted.",
    waiting: "You’ll see the result once everyone has voted, or when the host or a co-host reveals it.",
    latecomerTitle: "You can vote from the next question on",
    latecomerText: "You were let in during this question. You’ll see the result with everyone else.",
    votedTitle: "Vote cast",
    abstained: "You abstained.",
    myVote: (nick) => `Your vote: ${nick}.`,
    final: "A vote can’t be changed.",
    legend: "Your vote",
    abstain: "Abstain",
    missingChoice: "Pick a person or “Abstain”.",
    sending: "Sending…",
    vote: "Vote",
    reveal: {
      label: "Reveal result",
      busyLabel: "Revealing…",
      confirmText: (voted, eligible) => `Reveal it now? ${String(voted)} of ${String(eligible)} voted`,
    },
    skip: {
      label: "Skip question",
      busyLabel: "Skipping…",
      confirmText: (voted, eligible) =>
        `Skip it? The votes will be lost (${String(voted)} of ${String(eligible)} voted)`,
    },
    leaderNote: "You can reveal the result at any time, even before everyone has voted.",
  },
  reveal: {
    heading: "Result",
    viewToggle: "Result view",
    views: { pie: "Pie", bars: "Bars" },
    abstained: (count) => `Abstained: ${String(count)}`,
  },
  resultTable: {
    player: "Player",
    votes: "Votes",
  },
  skipped: {
    title: "The question was skipped.",
    votesGone: "Its votes were lost.",
  },
  reaction: {
    label: "Rate the question",
    up: "Good question",
    down: "Weak question",
    words: { up: "Good", down: "Weak" },
  },
  emotes: {
    label: "Emotes",
    spoken: (nick, name) => `${nick}: ${name}`,
  },
  summary: {
    votes,
    topVotes: (count) => `— ${votes(count)}`,
    rest: (count) => `everyone else — ${votes(count)}`,
    revealed: "Questions revealed:",
    votesTotal: "Total votes:",
    headings: {
      end: { top: "Most votes tonight", unvoted: "Tonight nobody voted for" },
      history: { top: "Most votes that evening", unvoted: "That evening nobody voted for" },
    },
  },
};
