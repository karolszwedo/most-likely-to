import { questionSentence, type RoomView } from "@/lib/rooms/shared";

// What the room screen tells a screen reader when the game moves on, and when it shows the note after a skip, worked
// out from the room's state alone (context/archive/2026-10-15-full-game-evening/plan.md, Faza 4 #1). No DOM, so the
// unit tests check it; RoomScreen sets its live regions from here. The same words for the host and every guest; a move
// the host or a co-host may make is the leader's ("prowadzący", S-07).

// Changes with the room's status, the round's phase and its number, and with nothing else: a vote changes who has
// voted, never this key, so a vote is not announced as a new question. Nor does the number of the game's questions
// (question_count, game-length): an approved proposal changes it mid-round, and that alone is no news to read out.
export function announcementKey(view: RoomView): string {
  return `${view.status}:${view.round?.phase ?? ""}:${String(view.round?.number ?? "")}`;
}

// The sentence for the state the key points at; "" in the lobby, which the player sees for themselves. Every question
// says its number out of the game's questions ("Pytanie 7 z 15.", as RoundCounter shows it, game-length); the first one
// starts the game first, and the one after a skip says the skip first, so a screen that slept through the skip still
// hears it.
export function announcement(view: RoomView): string {
  if (view.status === "closed") return "Koniec wieczoru.";
  const { round } = view;
  if (round === null) return "";
  if (round.phase === "skipped") return "Prowadzący pominął pytanie.";
  if (round.phase === "revealed") return "Wynik odsłonięty.";

  const question = `Pytanie ${String(round.number)} z ${String(view.question_count)}. ${questionSentence(round.question)}`;
  if (round.after_skip) return `Prowadzący pominął poprzednie pytanie. ${question}`;
  if (round.number === 1) return `Gra się zaczęła. ${question}`;
  return question;
}

// "Prowadzący pominął poprzednie pytanie. Głosy z niego przepadły." above the question, for the whole round that opened
// after a skip. The database says so (after_skip), not the screen's memory: a screen that slept through a reveal would
// take an ordinary "Następne pytanie" for a skip.
export function skipNotice(view: RoomView): boolean {
  return view.status === "playing" && view.round?.phase === "voting" && view.round.after_skip;
}

// What a guest hears and sees when the host gives them the co-host role or takes it back (S-07), between the state the
// screen showed (wasLeader) and the refreshed one: "" when the role stayed, for the host, who always leads, and once
// the room is closed. Apart from announcementKey: the role changes no question, phase or status, and a change of role
// together with a new question is said as both.
export function roleAnnouncement(wasLeader: boolean, view: RoomView): string {
  if (view.role === "host" || view.status === "closed" || view.leader === wasLeader) return "";
  return view.leader ? "Jesteś współhostem: możesz prowadzić grę." : "Nie jesteś już współhostem.";
}
