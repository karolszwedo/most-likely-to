// Polish dictionary: a room error code's text (src/lib/rooms/errors.ts). The keys of `codes` are the codes themselves,
// as they travel in `?error=` and in a JSON answer; a code with no key gets `generic`.
export const roomErrors = {
  generic: "Coś poszło nie tak. Spróbuj ponownie.",
  codes: {
    invalid_nick: "Nick musi mieć od 1 do 20 znaków.",
    // Right after the refusal the link's page asks "To ty?" instead of this text (S-04); it shows it when the page
    // opens again without the nick (the short cookie is gone), and then typing the nick again leads to that question.
    nick_taken:
      "Ten nick ma już ktoś w tej grze. Wpisz inny albo, jeśli to twój, wpisz go jeszcze raz i poproś o powrót.",
    // request_return's refusals on the link's form (S-04; POST /api/rooms/join renames nick_taken and player_unknown).
    return_taken: "Ktoś już prosi o powrót na ten nick. Jeśli to nie ty, powiedz o tym prowadzącemu.",
    return_unknown: "Nikt w tej grze nie ma tego nicku, więc nie ma dokąd wrócić. Wpisz inny nick.",
    host_returns_by_login: "To nick hosta. Host wraca do gry, logując się na swoje konto.",
    invalid_categories: "Wybierz co najmniej jedną kategorię.",
    // "Nowa gra" with a game's language other than Polish and English (english-version; POST /api/rooms and
    // create_room).
    invalid_language: "Wybierz język gry: polski albo angielski.",
    open_room_has_guests:
      "W starym pokoju są już goście. Załóż grę jeszcze raz i potwierdź, że stary pokój ma zostać zamknięty.",
    try_again: "Nie udało się założyć gry. Spróbuj jeszcze raz.",
    // "Nowa gra" once the account has opened 60 games within the hour (security-hardening, DB-1).
    too_many_games: "W ciągu godziny można założyć najwyżej 60 gier. Spróbuj trochę później.",
    room_closed: "Ta gra jest zamknięta. Poproś hosta o nowy link.",
    // The /j/<code> page's text for a link no room has: an old one (S-09) or one copied only in part.
    room_unknown: "Ten link nie działa. Sprawdź, czy skopiował się cały, albo poproś hosta o nowy.",
    service_unavailable: "Serwer jest chwilowo niedostępny. Spróbuj za kilka minut.",
    // Also the host's second "Zacznij grę"; a latecomer sees it above the form that asks the host to let them in.
    game_started: "Gra już trwa.",
    requests_full: "Na wejście czeka już 5 osób. Spróbuj za chwilę.",
    // A guest's way in, a latecomer's request and the leader's "Wpuść" once the room has 50 players, the host included
    // (security-hardening).
    room_full: "W tym pokoju jest już 50 graczy. Więcej się nie zmieści.",
    room_open: "Gra jeszcze się nie zaczęła. Odśwież stronę i dołącz.",
    request_unknown: "Tej prośby już nie ma.",
    latecomer_nick_taken: "Ten nick ma już ktoś w grze. Odrzuć prośbę, a spóźniony poprosi pod innym nickiem.",
    not_enough_players: "Do gry potrzeba co najmniej 3 graczy.",
    no_questions: "W wybranych kategoriach nie ma pytań. Załóż nową grę z innymi kategoriami.",
    already_voted: "Twój głos jest już oddany. Nie da się go zmienić.",
    round_revealed: "Wynik jest już odsłonięty. Głosowanie się skończyło.",
    unknown_target: "Tej osoby nie ma w grze. Wybierz kogoś z listy.",
    no_round: "Teraz nie trwa żadna runda.",
    round_over: "To pytanie już się zmieniło.",
    round_in_progress: "Głosowanie jeszcze trwa. Najpierw odsłoń wynik.",
    // The game's questions ran out: the host's note after the last question (HostActions) and the refusal of
    // "Następne pytanie" say the same sentence, so the screen shows it once.
    questions_ran_out: "Pytań już nie ma. Możesz zakończyć grę.",
    // "Usuń" or "Popraw" of an entry removed already (a double tap, the host's second screen).
    question_unknown: "Tego pytania nie ma już na liście.",
    invalid_question_text: "Pytanie może mieć od 1 do 90 znaków.",
    list_full: "Na liście nie zmieszczą się kolejne pytania.",
    // "Zacznij grę" with every entry of the game's question list removed.
    list_empty: "Lista pytań jest pusta. Dolosuj albo dodaj pytanie.",
    // "Dolosuj pytanie" once every question of the picked categories is on the list: draw_list_question's
    // no_questions, whose start text would send the host to a new game (src/pages/api/rooms/[id]/question-draw.ts).
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
    // "Zatwierdź" in the lobby (S-10): a row of the game's question list before the start would pass for a reviewed
    // list.
    game_not_started: "Propozycję można zatwierdzić dopiero po starcie gry.",
    // The host's "Usuń" of a game still open (S-13): only an ended game can be deleted, so nobody plays in a room that
    // disappears.
    game_not_ended: "Tej gry nie da się usunąć, dopóki trwa. Najpierw ją zakończ.",
  },
};
