import { plural, type Messages } from "@/lib/i18n";

// English dictionary: the room's screen around the round (RoomScreen, lobby, leader's bar, questions, proposals, players).
export const room: Messages["room"] = {
  hostActions: {
    end: {
      label: "End game",
      busyLabel: "Ending the game…",
      confirmText: "End the game for everyone?",
    },
    more: {
      label: (count) => `${String(count)} more ${plural("en", count, { one: "question", other: "questions" })}`,
      busyLabel: "Adding questions…",
    },
    next: {
      label: "Next question",
      busyLabel: "Loading the question…",
    },
    cancel: "Cancel",
  },
  proposalForm: {
    left: (count) => `you have ${String(count)} left`,
    waiting: (count) => `${String(count)} waiting for a decision`,
    label: "Suggest a question",
    placeholder: "e.g. fall asleep at a wedding",
    hint: "Finish the sentence “Who’s most likely to…”. The host or a co-host decides if it goes into the game.",
    hostLobbyHint:
      "You can approve a suggestion only once the game has started. To put a question on the list right away, use “Add your own question” in “Review questions”.",
    send: "Send",
    sent: "Sent. The host or a co-host decides if it goes into the game.",
    limit: "You have no suggestions left for this game.",
  },
  joinRequests: {
    returning: (nicks) =>
      plural("en", nicks.length, {
        one: `${nicks[0] ?? ""} is asking to come back.`,
        other: `Asking to come back: ${nicks.join(", ")}.`,
      }),
    latecomers: (nicks) =>
      plural("en", nicks.length, {
        one: `${nicks[0] ?? ""} is asking to join.`,
        other: `Asking to join: ${nicks.join(", ")}.`,
      }),
    admit: "Let in",
    reject: "Decline",
    backsLabel: "Asking to come back",
    backsCaption: (count) => `Asking to come back (${String(count)})`,
    backsNote:
      "Let them in only if you’re sure it’s really them: they’ll come back with their results, any vote they’ve already cast still counts, and their old device drops out of the game.",
    latecomersLabel: "Asking to join",
    latecomersCaption: (count) => `Asking to join (${String(count)})`,
    latecomersNote: "Anyone you let in can vote from the next question on.",
  },
  proposals: {
    added: (count, firstNick) =>
      plural("en", count, {
        one: `${firstNick} suggested a question.`,
        other: `New question suggestions: ${String(count)}.`,
      }),
    caption: "Question suggestions",
    // Short, so the pill stays clear of the link's label on a 360 px phone.
    captionCount: (count) => `Suggestions (${String(count)})`,
    approveAfterStart: "you can approve them once the game starts",
    approve: "Approve",
    reject: "Decline",
    approvedNext: "An approved question comes up next.",
    beforeStart: "You can approve them once the game has started. You can decline them now.",
  },
  screen: {
    removed: (nick) => `${nick} was removed.`,
    skipped: {
      title: "The previous question was skipped.",
      text: "Its votes were lost.",
    },
  },
  end: {
    title: "End of the evening",
    thanks: "Thanks for playing!",
    newGame: "New game",
    askHost: "Want to play again? Ask the host for a new link.",
  },
  lobby: {
    hostTitle: "Your room",
    playerTitle: (nick) => `You’re in the game as ${nick}`,
    hostSubtitle: "Share the link on Discord. Anyone who opens it types a nickname and joins.",
    cohostSubtitle: "You’re a co-host: you can start the game.",
    waitingSubtitle: "Waiting for the game to start.",
    linkFailed: "Couldn’t get the link. Refresh the page.",
    start: "Start game",
    starting: "Starting…",
    startHint: "Once the game starts, new players get in only if you let them in.",
    tooFew: (min) => `You can start once there are at least ${String(min)} of you.`,
    playersHeading: (count) => `Players (${String(count)})`,
    refreshFailed: "Couldn’t refresh the list",
    hostBadge: "host",
    youBadge: "you",
  },
  cohost: {
    hintLobby:
      "A co-host can run the game: start it, reveal the result, skip a question, let latecomers in and end it.",
    badge: "co-host",
    switchLabel: (nick) => `Co-host: ${nick}`,
    switchText: "co-host",
  },
  colorPicker: {
    hint: "Tap your dot to change your colour.",
    dotLabel: (color) => `Your colour: ${color}. Change colour`,
    taken: (color) => `${color}, taken`,
    group: "Colours",
    allTaken: "All the colours are taken.",
  },
  removePlayer: {
    button: "remove",
    label: (nick) => `Remove: ${nick}`,
    confirm: (nick) => `Remove ${nick}?`,
    busy: "Removing…",
    cancel: "Cancel",
  },
  playerLink: {
    label: "Link for players",
    copy: "Copy",
    copied: "Copied",
    copiedAnnounce: "Link copied",
    changed: "The link for players has changed. The old one no longer works. Send the players the new one.",
  },
  liveBanner: {
    broken: "Live connection lost — refreshing",
  },
  crash: {
    title: "Something broke — refresh the page.",
    reload: "Refresh the page",
  },
  counter: {
    round: (number, total) => `Question ${String(number)} of ${String(total)}`,
    questionCount: (count) => `Questions: ${String(count)}`,
    lastQuestion: "That was the last question. The host or a co-host decides if we keep playing.",
  },
  questionField: {
    empty: "Type the question",
    tooLong: (max) => `A question can have at most ${String(max)} characters`,
    placeholder: "e.g. eat pizza with pineapple",
    hint: (max) => `Finish the sentence “Who’s most likely to…”. At most ${String(max)} characters.`,
  },
  questionList: {
    open: "Review questions",
    heading: (count) => `Questions (${String(count)})`,
    start: "Who’s most likely to…",
    empty: "There are no questions on the list.",
    ownBadge: "your own",
    edit: "Edit",
    remove: "Remove",
    fieldLabel: "Question text",
    save: "Save",
    cancel: "Cancel",
    draw: "Draw another question",
    addLabel: "Add your own question",
    add: "Add",
    announce: {
      drawnList: "Questions drawn.",
      drawnOne: "A question was drawn and added to the end of the list.",
      added: "A question was added to the end of the list.",
      removed: "Question removed.",
      saved: "Question saved.",
    },
  },
  page: {
    tabTitle: {
      lobby: "Room",
      outside: "You’re not in this room",
      removed: "You were removed from the room",
      moved: "You’re playing on another device",
      gone: "This game is gone",
      error: "Room",
    },
    outside: {
      title: "You’re not in this room.",
      text: "Ask the host for the link.",
    },
    removed: {
      title: "You were removed from the room.",
      text: "If it was a mistake or the host agrees, you can come back: ask them for a new link.",
    },
    moved: {
      title: "You’re now playing on another device.",
      text: (nick) => `You were let back in there as ${nick}. You can close this tab.`,
    },
    gone: {
      title: "This game is gone.",
      text: "The host deleted it. Ask them for a new link to the next game.",
    },
    error: {
      title: "Couldn’t open the room.",
    },
  },
};
