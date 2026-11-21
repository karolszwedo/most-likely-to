import { announce } from "@/lib/i18n/pl/announce";
import { auth } from "@/lib/i18n/pl/auth";
import { authErrors } from "@/lib/i18n/pl/auth-errors";
import { chat } from "@/lib/i18n/pl/chat";
import { colors } from "@/lib/i18n/pl/colors";
import { common } from "@/lib/i18n/pl/common";
import { emotes } from "@/lib/i18n/pl/emotes";
import { host } from "@/lib/i18n/pl/host";
import { link } from "@/lib/i18n/pl/link";
import { pages } from "@/lib/i18n/pl/pages";
import { room } from "@/lib/i18n/pl/room";
import { roomErrors } from "@/lib/i18n/pl/room-errors";
import { round } from "@/lib/i18n/pl/round";

// The Polish dictionary, the pattern of the type Messages (src/lib/i18n/index.ts). One module per group of screens:
// - common: words and sentences more than one screen shares (a count of players, the question's sentence, dates);
// - room: the room's screen around the round (RoomScreen, the lobby, the leader's bar, questions, proposals, players);
// - round: the round itself (voting, reveal, skip, result, summary, thumbs, emotes' bar);
// - chat: the room's chat and its gif search;
// - host: the host's screens before and after a game (new game, "Twoje gry", a game's history, the header);
// - link: the link's page /j/ (join form, waiting, its messages, the link's card on Discord);
// - auth: the sign-in screen; pages: page titles, the layout's banner, the config warnings;
// - roomErrors, authErrors: an error code's text; announce: the screen reader's sentences; colors: the players'
//   colours' names; emotes: the emotes' names.
export const pl = {
  common,
  room,
  round,
  chat,
  host,
  link,
  auth,
  pages,
  roomErrors,
  authErrors,
  announce,
  colors,
  emotes,
};
