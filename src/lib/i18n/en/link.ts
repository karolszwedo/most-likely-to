import type { Messages } from "@/lib/i18n";

// English dictionary: the link's page /j/ (the forms, the waiting screen, its messages, the link's card) and the centred
// message of the room pages. The two questions of the game's sentence are written out by hand, as in Polish.
const GAME_TITLE = "Who’s most likely to…?";
const GAME_TEASER =
  "…fall asleep at their own party? …give their vacuum cleaner a name? Pick the one in your crew who fits best. Votes are anonymous, and everyone sees the result.";

export const link: Messages["link"] = {
  tabTitle: {
    join: "Join the game",
    request: "Ask to join",
    rejected: "You weren’t let in",
    waiting: "Waiting to get in",
    closed: "This game is already over",
    unknown: "This link doesn’t work",
    error: "Couldn’t open the link",
  },
  gameOver: {
    title: "This game is already over.",
    text: "Ask the host for a new link.",
  },
  deadLink: {
    title: "This link doesn’t work.",
    text: "Check that you copied all of it, or ask the host for a new one.",
  },
  intro: {
    title: GAME_TITLE,
    teaser: GAME_TEASER,
  },
  // Discord shows og:title up to 70 bytes and og:description up to 350; this description is well under (about 190 bytes
  // of UTF-8).
  preview: {
    siteName: "Most Likely To",
    title: "Join the game",
    description: `${GAME_TITLE} ${GAME_TEASER}`,
  },
  screen: {
    joinTitle: "Join the game",
    joinText: "Type a nickname and you’re in. You don’t need an account.",
    requestTitle: "Ask to join",
    requestText: "The game has already started, so the host has to let you in. Type a nickname and ask to join.",
    rejectedTitle: "You weren’t let in.",
    rejectedReturnLobbyText: "You can ask again to come back, or join under another nickname.",
    rejectedReturnText: "You can ask again to come back, or ask to join under another nickname.",
    rejectedRequestText: "You can ask again.",
    errorTitle: "Couldn’t open the link.",
  },
  joinForm: {
    join: {
      submit: "Join",
      pending: "Joining…",
      hint: (max) => `This is how other players will see you. At most ${String(max)} characters.`,
      other: "or join under another nickname",
    },
    request: {
      submit: "Ask to join",
      pending: "Sending the request…",
      hint: (max) =>
        `The host and co-hosts will see this nickname and, once you’re let in, so will the other players. At most ${String(max)} characters.`,
      other: "or ask to join under another nickname",
    },
    requestAgain: {
      submit: "Ask again",
      pending: "Sending the request…",
      hint: (max) => `You can keep this nickname or type another one. At most ${String(max)} characters.`,
      other: "or ask to join under another nickname",
    },
    nickLabel: "Your nickname",
    otherNickLabel: "Another nickname",
    nickPlaceholder: "e.g. Sam",
    nickMissing: "Enter your nickname",
    nickTooLong: (max) => `A nickname can have at most ${String(max)} characters`,
    nickTakenAfter: " is already playing in this room.",
    isItYou: "Is that you, on another phone or in another browser?",
    returnSubmit: "Yes, it’s me. Ask to come back",
    returnPending: "Sending the request…",
    returnLobbyText: "The host will check it’s you, and you’ll get your place back, with your colour.",
    returnText:
      "The host will check that it’s you. You’ll get your place back with your colour and results, and any vote you’ve already cast still counts.",
  },
  waiting: {
    title: "Waiting for the host to let you in",
    returningTitle: "Waiting for the host to confirm it’s you",
    askingBefore: "You’re asking to join as ",
    returningBefore: "You’re asking to come back as ",
    nickAfter: ".",
    text: "Once you’re let in, this page will take you to the game.",
    returningText:
      "Once you’re let in, you’ll get your place back with your colour and results, and any vote you’ve already cast still counts.",
    refreshFailed: "Couldn’t refresh the game",
  },
  message: {
    refresh: "Refresh the page",
  },
};
