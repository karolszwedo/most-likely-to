import { plural } from "@/lib/i18n";

// Polish dictionary: the room's chat and its gif search (RoomChat, GifPicker, useGifSearch). Only the screen's own
// texts: a message's text, a gif's description and the search's word are the players' and KLIPY's, never here.
export const chat = {
  // The chat's heading, and the folded chat's button below lg.
  heading: "Czat",
  fold: "Zwiń",
  empty: "Nikt jeszcze nic nie napisał.",
  // The message field: its name for a screen reader, its placeholder, the counter near the limit ("185/200") and the
  // button that sends.
  fieldLabel: "Wiadomość na czacie",
  placeholder: "Napisz do wszystkich…",
  counter: (length: number, max: number) => `${String(length)}/${String(max)}`,
  send: "Wyślij wiadomość",
  // The check before sending.
  errors: {
    empty: "Wpisz wiadomość",
    tooLong: (max: number) =>
      `Wiadomość może mieć najwyżej ${String(max)} ${plural("pl", max, { one: "znak", few: "znaki", many: "znaków" })}`,
  },
  // After the folded chat's button, for a screen reader only: ", nowe: 3".
  unread: (count: number) => `, nowe: ${String(count)}`,
  // After the sender's nick, for a screen reader only, and what the live region says of a message: "<nick>: <text>",
  // a gif as "gif" and its description, if any.
  afterNick: ":",
  spoken: (nick: string, words: string) => `${nick}: ${words}`,
  gifWords: (title: string) => (title === "" ? "gif" : `gif ${title}`),
  // A gif's image without KLIPY's description.
  gifAlt: "gif",
  // The button "GIF", which opens the search and closes it again: next to the message field, and while the search is
  // open at the start of the search's row (chat-composer, R1).
  gifButton: "GIF",
  gifButtonLabel: "GIF: wyszukaj gifa",
  // The emoji grid (chat-composer, E1), both for a screen reader: the button with a smile after "GIF" (or alone,
  // without a gif search key), which opens the grid over the message field and closes it again, and the grid's name,
  // apart from the emotes' group "Emotki". The grid's emoji are the characters themselves (CHAT_EMOJI in
  // src/components/room/chat-composer.ts), never here: the previews' pseudo language would wrap each in ⟦…⟧, and a
  // press would put the marks into the message; a screen reader reads each one's name in the system's language.
  emoji: {
    button: "Emoji",
    grid: "Emoji",
  },
  // The gif search (GifPicker).
  gifs: {
    region: "Wyszukiwarka gifów",
    // The search's visible heading over its results, next to the way back (chat-composer, R1); a key of its own apart
    // from fieldLabel, as the two may differ in another language (S-27).
    heading: "Szukaj gifa",
    // The search's field, for a screen reader.
    fieldLabel: "Szukaj gifa",
    // As KLIPY requires it in the search's field (decision 5 of room-chat-gifs): "Search KLIPY" in every language; a
    // screen reader hears fieldLabel.
    placeholder: "Search KLIPY",
    search: "Szukaj",
    // The way back from the search to the message field, in the heading's line: below xl (the search in the writing
    // row's place) backToWriting, from xl (the search in the list's place too) back.
    backToWriting: "Wróć do pisania",
    back: "Wróć do czatu",
    idle: "Wpisz słowo i naciśnij „Szukaj”.",
    loading: "Szukam gifów…",
    empty: "Nie ma gifów dla tego słowa.",
    limit: "Gify na tę godzinę się skończyły. Spróbuj później, a na razie napisz wiadomość.",
    // Not only a failure of the network: a real 429 of KLIPY's may come without the CORS header, and the browser then
    // reports it as a failed fetch, so this text names the hour's limit as a possible cause (impl-review F5).
    error: "Nie udało się wczytać gifów. Może skończył się limit na tę godzinę.",
    results: "Wyniki wyszukiwania",
    // With results, for a screen reader only.
    found: (count: number) => `Znalezione gify: ${String(count)}.`,
    // A result's button: "Wyślij gifa" and KLIPY's description, if any.
    sendGif: (title: string) => (title === "" ? "Wyślij gifa" : `Wyślij gifa: ${title}`),
  },
};
