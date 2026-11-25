import { plural, type Messages } from "@/lib/i18n";

// English dictionary: the room's chat and its gif search.
export const chat: Messages["chat"] = {
  heading: "Chat",
  fold: "Hide",
  empty: "No messages yet.",
  fieldLabel: "Chat message",
  placeholder: "Write to everyone…",
  counter: (length, max) => `${String(length)}/${String(max)}`,
  send: "Send message",
  errors: {
    empty: "Type a message",
    tooLong: (max) =>
      `A message can have at most ${String(max)} ${plural("en", max, { one: "character", other: "characters" })}`,
  },
  unread: (count) => `, ${String(count)} new`,
  afterNick: ":",
  spoken: (nick, words) => `${nick}: ${words}`,
  gifWords: (title) => (title === "" ? "gif" : `gif ${title}`),
  gifAlt: "gif",
  gifButton: "GIF",
  gifButtonLabel: "GIF: search for a gif",
  emoji: {
    button: "Emoji",
    grid: "Emoji",
  },
  gifs: {
    region: "Gif search",
    heading: "Search for a gif",
    fieldLabel: "Search for a gif",
    placeholder: "Search KLIPY",
    search: "Search",
    backToWriting: "Back to writing",
    back: "Back to chat",
    idle: "Type a word and press “Search”.",
    loading: "Searching for gifs…",
    empty: "There are no gifs for this word.",
    limit: "No more gifs for this hour. Try again later, or send a message for now.",
    error: "Couldn’t load the gifs. The limit for this hour may have been reached.",
    results: "Search results",
    found: (count) => `Gifs found: ${String(count)}.`,
    sendGif: (title) => (title === "" ? "Send gif" : `Send gif: ${title}`),
  },
};
