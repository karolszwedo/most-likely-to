// Room errors travel only as codes: in the URL (`?error=`) after a form, in the JSON answer of a round's action. The
// screen shows the Polish text from this map, so text typed into `?error=` never reaches the screen (same as
// src/lib/auth-errors.ts).

// The refusals of the game's actions (start, vote, reveal, next, skip, end), of the leader's answer to a latecomer
// ("Wpuść", "Odrzuć"), of the host's role button (player_unknown) and of the host's moves on the game's question list
// ("Przejrzyj pytania", "Dolosuj pytanie", "Usuń", "Popraw", "Dodaj własne"; list_empty is the start's), each with its
// own text (audit G2). not_leader: a leader's move by a guest of the room without the co-host role, e.g. once the host
// took it (S-07). color_taken: a player's pick of a colour another player of the room has (S-18). cohost_protected: a
// co-host's "Usuń" by another co-host's nick, or its own (S-09); player_unknown is also the removal's, for a nick no
// guest of the room has. cohost_returns_by_host: a co-host's "Wpuść" of a request to come back to a co-host's place
// (S-04; admit_latecomer's cohost_protected, renamed by POST /api/rooms/<id>/admit). proposal_limit: a player's
// proposal once theirs are used up (S-10). proposal_unknown: a leader's answer to a proposal no longer waiting.
// game_not_started: "Zatwierdź" of a proposal in the lobby. game_not_ended: the host's "Usuń" of a game on its list of
// own games while the room is in the lobby or the game in play (S-13). tests/unit/room-errors.test.ts checks this list
// against the plans. game_started is also join_room's: a game in play takes a latecomer only through a request to the
// host (S-08).
export const ROUND_REFUSALS = [
  "game_started",
  "not_enough_players",
  "no_questions",
  "invalid_question",
  "already_voted",
  "round_revealed",
  "unknown_target",
  "no_round",
  "round_over",
  "round_in_progress",
  "questions_ran_out",
  "request_unknown",
  "latecomer_nick_taken",
  "question_unknown",
  "invalid_question_text",
  "list_full",
  "list_empty",
  "no_new_questions",
  "not_leader",
  "player_unknown",
  "color_taken",
  "cohost_protected",
  "cohost_returns_by_host",
  "proposal_limit",
  "proposal_unknown",
  "game_not_started",
  "game_not_ended",
] as const;

export type RoundRefusal = (typeof ROUND_REFUSALS)[number];

// The game's questions ran out: the host's note after the last question (HostActions) and the refusal of "Następne
// pytanie" (questions_ran_out) say the same sentence, so the screen shows it once.
export const QUESTIONS_RAN_OUT = "Pytań już nie ma. Możesz zakończyć grę.";

const MESSAGES: Record<string, string> = {
  invalid_nick: "Nick musi mieć od 1 do 20 znaków.",
  // Right after the refusal the link's page asks "To ty?" instead of this text (S-04); it shows it when the page opens
  // again without the nick (the short cookie is gone), and then typing the nick again leads to that question.
  nick_taken:
    "Ten nick ma już ktoś w tej grze. Wpisz inny albo, jeśli to twój, wpisz go jeszcze raz i poproś o powrót.",
  // request_return's refusals on the link's form (S-04; POST /api/rooms/join renames nick_taken and player_unknown).
  return_taken: "Ktoś już prosi o powrót na ten nick. Jeśli to nie ty, powiedz o tym prowadzącemu.",
  return_unknown: "Nikt w tej grze nie ma tego nicku, więc nie ma dokąd wrócić. Wpisz inny nick.",
  host_returns_by_login: "To nick hosta. Host wraca do gry, logując się na swoje konto.",
  invalid_categories: "Wybierz co najmniej jedną kategorię.",
  open_room_has_guests:
    "W starym pokoju są już goście. Załóż grę jeszcze raz i potwierdź, że stary pokój ma zostać zamknięty.",
  try_again: "Nie udało się założyć gry. Spróbuj jeszcze raz.",
  room_closed: "Ta gra jest zamknięta. Poproś hosta o nowy link.",
  // The /j/<code> page's text for a link no room has: an old one (S-09) or one copied only in part.
  room_unknown: "Ten link nie działa. Sprawdź, czy skopiował się cały, albo poproś hosta o nowy.",
  service_unavailable: "Serwer jest chwilowo niedostępny. Spróbuj za kilka minut.",
  // Also the host's second "Zacznij grę"; a latecomer sees it above the form that asks the host to let them in.
  game_started: "Gra już trwa.",
  requests_full: "Na wejście czeka już 5 osób. Spróbuj za chwilę.",
  room_open: "Gra jeszcze się nie zaczęła. Odśwież stronę i dołącz.",
  request_unknown: "Tej prośby już nie ma.",
  latecomer_nick_taken: "Ten nick ma już ktoś w grze. Odrzuć prośbę, a spóźniony poprosi pod innym nickiem.",
  not_enough_players: "Do gry potrzeba co najmniej 3 graczy.",
  no_questions: "W wybranych kategoriach nie ma pytań. Załóż nową grę z innymi kategoriami.",
  invalid_question: "Nie udało się wylosować pytania. Spróbuj jeszcze raz.",
  already_voted: "Twój głos jest już oddany. Nie da się go zmienić.",
  round_revealed: "Wynik jest już odsłonięty. Głosowanie się skończyło.",
  unknown_target: "Tej osoby nie ma w grze. Wybierz kogoś z listy.",
  no_round: "Teraz nie trwa żadna runda.",
  round_over: "To pytanie już się zmieniło.",
  round_in_progress: "Głosowanie jeszcze trwa. Najpierw odsłoń wynik.",
  questions_ran_out: QUESTIONS_RAN_OUT,
  // "Usuń" or "Popraw" of an entry removed already (a double tap, the host's second screen).
  question_unknown: "Tego pytania nie ma już na liście.",
  invalid_question_text: "Pytanie może mieć od 1 do 90 znaków.",
  list_full: "Na liście nie zmieszczą się kolejne pytania.",
  // "Zacznij grę" with every entry of the game's question list removed.
  list_empty: "Lista pytań jest pusta. Dolosuj albo dodaj pytanie.",
  // "Dolosuj pytanie" once every question of the picked categories is on the list: draw_list_question's no_questions,
  // whose start text would send the host to a new game (src/pages/api/rooms/[id]/question-draw.ts).
  no_new_questions: "W wybranych kategoriach nie ma już nowych pytań. Dodaj własne.",
  // A leader's move after the host took the co-host role (S-07): set_cohost and the move take turns on the room's row.
  not_leader: "Nie jesteś już współhostem.",
  // The host's role button or a leader's "Usuń" for a nick no guest of the room has (gone from the room, removed
  // already, or the host's own).
  player_unknown: "Tego gracza nie ma w pokoju.",
  // A pick of a colour another player of the room took a moment before (S-18): set_player_color and the other pick
  // take turns on the room's row.
  color_taken: "Ten kolor ktoś właśnie zajął.",
  // A co-host's "Usuń" by a co-host's nick, its own included (S-09): only the host decides about co-hosts.
  cohost_protected: "Współhosta może usunąć tylko host.",
  // A co-host's "Wpuść" of a request to come back to a co-host's place (S-04): only the host decides about co-hosts.
  cohost_returns_by_host: "Na miejsce współhosta może wpuścić tylko host.",
  // A player's proposal with all of theirs used up (S-10): a rejected one counts too.
  proposal_limit: "Nie masz już propozycji do wysłania.",
  // A leader's answer to a proposal decided a moment before (another leader, a double tap) or gone with its author
  // (S-10).
  proposal_unknown: "Tej propozycji już nie ma.",
  // "Zatwierdź" in the lobby (S-10): a row of the game's question list before the start would pass for a reviewed list.
  game_not_started: "Propozycję można zatwierdzić dopiero po starcie gry.",
  // The host's "Usuń" of a game still open (S-13): only an ended game can be deleted, so nobody plays in a room that
  // disappears.
  game_not_ended: "Tej gry nie da się usunąć, dopóki trwa. Najpierw ją zakończ.",
};

const GENERIC_MESSAGE = "Coś poszło nie tak. Spróbuj ponownie.";

export function roomErrorMessage(code: string | null): string | null {
  if (code === null) return null;
  return Object.hasOwn(MESSAGES, code) ? MESSAGES[code] : GENERIC_MESSAGE;
}
