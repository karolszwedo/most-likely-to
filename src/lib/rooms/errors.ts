// Room errors travel only as codes: in the URL (`?error=`) after a form, in the JSON answer of a round's action. The
// screen shows the Polish text from this map, so text typed into `?error=` never reaches the screen (same as
// src/lib/auth-errors.ts).

// The refusals of the game's actions (start, vote, reveal, next, skip, end), of the leader's answer to a latecomer
// ("Wpuść", "Odrzuć"), of the host's role button (player_unknown) and of the host's moves on the game's question list
// ("Przejrzyj pytania", "Dolosuj pytanie", "Usuń", "Popraw", "Dodaj własne"; list_empty is the start's), each with its
// own text (audit G2). not_leader: a leader's move by a guest of the room without the co-host role, e.g. once the host
// took it (S-07). color_taken: a player's pick of a colour another player of the room has (S-18).
// tests/unit/room-errors.test.ts checks this list against the plans. game_started is also join_room's: a game in play
// takes a latecomer only through a request to the host (S-08).
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
] as const;

export type RoundRefusal = (typeof ROUND_REFUSALS)[number];

// The game's questions ran out: the host's note after the last question (HostActions) and the refusal of "Następne
// pytanie" (questions_ran_out) say the same sentence, so the screen shows it once.
export const QUESTIONS_RAN_OUT = "Pytań już nie ma. Możesz zakończyć grę.";

const MESSAGES: Record<string, string> = {
  invalid_nick: "Nick musi mieć od 1 do 20 znaków.",
  nick_taken:
    "Ten nick jest już zajęty. Jeśli to ty, a telefon cię nie pamięta (np. link otwarty w innej przeglądarce), wpisz inny nick.",
  invalid_categories: "Wybierz co najmniej jedną kategorię.",
  open_room_has_guests:
    "W starym pokoju są już goście. Załóż grę jeszcze raz i potwierdź, że stary pokój ma zostać zamknięty.",
  try_again: "Nie udało się założyć gry. Spróbuj jeszcze raz.",
  room_closed: "Ta gra jest zamknięta. Poproś hosta o nowy link.",
  room_unknown: "Nie znamy tego linku. Sprawdź, czy skopiował się cały.",
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
  // The host's role button for a nick no guest of the room has (gone from the room, or the host's own).
  player_unknown: "Tego gracza nie ma w pokoju.",
  // A pick of a colour another player of the room took a moment before (S-18): set_player_color and the other pick
  // take turns on the room's row.
  color_taken: "Ten kolor ktoś właśnie zajął.",
};

const GENERIC_MESSAGE = "Coś poszło nie tak. Spróbuj ponownie.";

export function roomErrorMessage(code: string | null): string | null {
  if (code === null) return null;
  return Object.hasOwn(MESSAGES, code) ? MESSAGES[code] : GENERIC_MESSAGE;
}
