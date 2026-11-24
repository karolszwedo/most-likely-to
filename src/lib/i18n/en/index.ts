import type { Messages } from "@/lib/i18n";
import { announce } from "@/lib/i18n/en/announce";
import { auth } from "@/lib/i18n/en/auth";
import { authErrors } from "@/lib/i18n/en/auth-errors";
import { chat } from "@/lib/i18n/en/chat";
import { colors } from "@/lib/i18n/en/colors";
import { common } from "@/lib/i18n/en/common";
import { emotes } from "@/lib/i18n/en/emotes";
import { host } from "@/lib/i18n/en/host";
import { link } from "@/lib/i18n/en/link";
import { pages } from "@/lib/i18n/en/pages";
import { room } from "@/lib/i18n/en/room";
import { roomErrors } from "@/lib/i18n/en/room-errors";
import { round } from "@/lib/i18n/en/round";

// The English dictionary (S-27, english-version, phase 5), module for module as the Polish one (src/lib/i18n/pl/, whose
// comments say where each text stands). Its type is the Polish one's, so a key it lacks fails `npx astro check`.
//
// The game's words, the same in every module: host, co-host, player, guest, nickname, room, lobby, question, question
// suggestion (propozycja pytania), vote, abstain (wstrzymać się), reveal (odsłona), skip (pominięcie pytania), draw
// (dolosować, the list) and add (dobrać, after the last question), end of the evening, emotes. English has no one word
// for "prowadzący", a host or a co-host: what they did is told with no doer ("The question was skipped."), what they may
// do names both ("The host or a co-host decides…"), and only the link's page, read from outside the room, says "the
// host" for either. British spelling (dates are en-GB), and the typography the Polish texts have of their own: ’ “ ” …,
// never the ASCII ' or ".
export const en: Messages = {
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
