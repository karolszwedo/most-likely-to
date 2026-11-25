import { plural } from "@/lib/i18n";

// Polish dictionary: the room's screen around the round (RoomScreen, lobby, leader's bar, questions, proposals, players).
// The hints of a question's field are in the screen's language too, the language of the person writing (plan, "Język
// treści pytania"): the game does not know the language a player writes a question in.
export const room = {
  // The leader's buttons that move the game on (HostActions: endGameAction, moreQuestionsAction, nextQuestionAction).
  hostActions: {
    end: {
      label: "Zakończ grę",
      busyLabel: "Kończenie gry…",
      confirmText: "Na pewno zakończyć grę? Wszyscy zobaczą koniec wieczoru",
    },
    // "Jeszcze 5 pytań" (game-length): count is how many questions it adds, at most 5, so never more than it promises
    // ("Jeszcze 3 pytania").
    more: {
      label: (count: number) =>
        `Jeszcze ${String(count)} ${plural("pl", count, { one: "pytanie", few: "pytania", many: "pytań" })}`,
      busyLabel: "Dobieranie pytań…",
    },
    next: {
      label: "Następne pytanie",
      busyLabel: "Wczytywanie pytania…",
    },
    // Next to the question of an action that asks first.
    cancel: "Anuluj",
  },
  // A player's proposals of questions (ProposalForm, S-10).
  proposalForm: {
    // The proposals a player has left: "została ci 1", "zostały ci 2", "zostały ci 5".
    left: (count: number) =>
      plural("pl", count, {
        one: `została ci ${String(count)}`,
        few: `zostały ci ${String(count)}`,
        many: `zostały ci ${String(count)}`,
      }),
    // The player's proposals still waiting for a leader's decision.
    waiting: (count: number) => `czeka na decyzję: ${String(count)}`,
    // The button that unfolds the field, and the field's name.
    label: "Zaproponuj pytanie",
    // The field's example and hint.
    placeholder: "np. zasnąłby na weselu",
    hint: "Dokończ zdanie „Kto z nas najprawdopodobniej…”. Prowadzący zdecyduje, czy trafi do gry.",
    // The host in the lobby, who has "Dodaj własne pytanie" too.
    hostLobbyHint:
      "Propozycję zatwierdzisz dopiero po starcie gry. Od razu na listę trafia tylko „Dodaj własne pytanie” w „Przejrzyj pytania”.",
    send: "Wyślij",
    sent: "Wysłane. Prowadzący zdecyduje, czy trafi do gry.",
    // All 3 proposals used up: the line in the form's place.
    limit: "Nie masz już propozycji na tę grę.",
  },
  // What the screen reader hears when the leader's lists of requests get nicks they did not have (JoinRequests): one
  // nick by name in a sentence, more after a colon.
  joinRequests: {
    returning: (nicks: readonly string[]) =>
      plural("pl", nicks.length, {
        one: `${nicks[0] ?? ""} prosi o powrót na swoje miejsce.`,
        few: `Proszą o powrót na swoje miejsce: ${nicks.join(", ")}.`,
        many: `Proszą o powrót na swoje miejsce: ${nicks.join(", ")}.`,
      }),
    latecomers: (nicks: readonly string[]) =>
      plural("pl", nicks.length, {
        one: `${nicks[0] ?? ""} prosi o wejście.`,
        few: `Proszą o wejście: ${nicks.join(", ")}.`,
        many: `Proszą o wejście: ${nicks.join(", ")}.`,
      }),
    admit: "Wpuść",
    reject: "Odrzuć",
    // The section of guests who ask to come back to their own place (S-04): its name, its caption with the count, and
    // its warning.
    backsLabel: "Chcą wrócić na swoje miejsce",
    backsCaption: (count: number) => `Chcą wrócić na swoje miejsce (${String(count)})`,
    backsNote:
      "Wpuść tylko, jeśli to na pewno ta osoba: wróci z wynikami i oddanym głosem, a jej stare urządzenie wypadnie z gry.",
    // The section of latecomers (S-08).
    latecomersLabel: "Proszą o wejście",
    latecomersCaption: (count: number) => `Proszą o wejście (${String(count)})`,
    latecomersNote: "Wpuszczona osoba zagłosuje od następnego pytania.",
  },
  // What the screen reader hears when the leader's list of proposals gets ones it did not have (QuestionProposals):
  // one by its author's nick, more as a count.
  proposals: {
    added: (count: number, firstNick: string) =>
      plural("pl", count, {
        one: `${firstNick} proponuje pytanie.`,
        few: `Nowe propozycje pytań: ${String(count)}.`,
        many: `Nowe propozycje pytań: ${String(count)}.`,
      }),
    // The list's name, and its button with the count.
    caption: "Propozycje pytań",
    captionCount: (count: number) => `Propozycje pytań (${String(count)})`,
    // In the lobby, next to the caption.
    approveAfterStart: "zatwierdzisz po starcie",
    approve: "Zatwierdź",
    reject: "Odrzuć",
    // Under the unfolded list: once the game has started, and in the lobby.
    approvedNext: "Zatwierdzone pytanie pojawi się jako następne.",
    beforeStart: "Zatwierdzisz je po starcie gry. Odrzucić możesz już teraz.",
  },
  // The room's screen around the views (RoomScreen).
  screen: {
    // What a screen reader hears after the leader's own removal of a player.
    removed: (nick: string) => `Usunięto ${nick}.`,
    // The note above the next question after a skip.
    skipped: {
      title: "Prowadzący pominął poprzednie pytanie.",
      text: "Głosy z niego przepadły.",
    },
  },
  // "Koniec wieczoru" for everyone once the room is closed (RoomScreen's EveningEnd).
  end: {
    title: "Koniec wieczoru",
    thanks: "Dzięki za grę!",
    newGame: "Nowa gra",
    askHost: "Chcesz zagrać jeszcze raz? Poproś hosta o nowy link.",
  },
  // The lobby (RoomLobby): its title and subtitle by role, a leader's "Zacznij grę" and the list "Gracze".
  lobby: {
    hostTitle: "Twój pokój",
    playerTitle: (nick: string) => `Jesteś w grze jako ${nick}`,
    hostSubtitle: "Wklej link na Discordzie. Kto go otworzy, wpisze nick i dołączy.",
    cohostSubtitle: "Jesteś współhostem: możesz zacząć grę.",
    waitingSubtitle: "Czekamy, aż prowadzący zacznie.",
    linkFailed: "Nie udało się pobrać linku. Odśwież stronę.",
    start: "Zacznij grę",
    starting: "Zaczynamy…",
    startHint: "Po starcie nowi gracze wejdą tylko wtedy, gdy ich wpuścisz.",
    tooFew: (min: number) => `Grę zaczniesz, gdy będzie was co najmniej ${String(min)}.`,
    playersHeading: (count: number) => `Gracze (${String(count)})`,
    refreshFailed: "Nie udało się odświeżyć listy",
    hostBadge: "host",
    youBadge: "ty",
  },
  // The co-host role (CohostButton, S-07): the hint under the lobby's list "Gracze" for the host, once a guest is in the
  // room (Karol, 2026-10-29; the game's own, without the start, is RoundVoting's); the badge everyone sees; the host's
  // switch.
  cohost: {
    hintLobby:
      "Współhost może prowadzić grę: zacząć, odsłonić wynik, pominąć pytanie, wpuścić spóźnionych i ją zakończyć.",
    badge: "współhost",
    switchLabel: (nick: string) => `Współhost: ${nick}`,
    switchText: "współhost",
  },
  // The player's own colour (PlayerColorPicker, S-18): the hint under the lobby's list "Gracze" for every player, the
  // dot's and a swatch's names (color is the colour's name, colorName), the palette's name.
  colorPicker: {
    hint: "Dotknij swojej kropki, żeby zmienić kolor.",
    dotLabel: (color: string) => `Twój kolor: ${color}. Zmień kolor`,
    taken: (color: string) => `${color}, zajęty`,
    group: "Kolory",
    allTaken: "Wszystkie kolory są zajęte.",
  },
  // A leader's "Usuń" in a guest's row of the list "Gracze" (RemovePlayerButton, S-09).
  removePlayer: {
    button: "usuń",
    label: (nick: string) => `Usuń: ${nick}`,
    confirm: (nick: string) => `Na pewno usunąć ${nick}?`,
    busy: "Usuwam…",
    cancel: "Anuluj",
  },
  // A leader's players' link (PlayerLink, S-09).
  playerLink: {
    label: "Link dla graczy",
    copy: "Kopiuj",
    copied: "Skopiowano",
    // What the screen reader hears after "Kopiuj".
    copiedAnnounce: "Link skopiowany",
    changed: "Link dla graczy się zmienił. Stary już nie działa. Wyślij graczom nowy.",
  },
  // The room's live channel is down (LiveBanner).
  liveBanner: {
    broken: "Połączenie na żywo przerwane — odświeżam",
  },
  // The screen of a room screen that threw (RoomErrorBoundary).
  crash: {
    title: "Coś się popsuło — odśwież stronę.",
    reload: "Odśwież stronę",
  },
  // How long the game is (RoundCounter): "Pytanie 7 z 15" above a round's title, "Liczba pytań: 15" in the lobby (the
  // same form for every count), and the line for a player with no role after the game's last question.
  counter: {
    round: (number: number, total: number) => `Pytanie ${String(number)} z ${String(total)}`,
    questionCount: (count: number) => `Liczba pytań: ${String(count)}`,
    lastQuestion: "To było ostatnie pytanie. Prowadzący zdecyduje, czy gramy dalej.",
  },
  // A question's field (QuestionField), the host's list's and a player's proposal's.
  questionField: {
    // The check before sending; max is QUESTION_MAX_LENGTH.
    empty: "Wpisz treść pytania",
    tooLong: (max: number) => `Pytanie może mieć najwyżej ${String(max)} znaków`,
    // The list's example and hint, where the caller gives none.
    placeholder: "np. zjadłby pizzę z ananasem",
    hint: (max: number) => `Dokończ zdanie „Kto z nas najprawdopodobniej…”. Najwyżej ${String(max)} znaków.`,
  },
  // The host's game's question list in the lobby (QuestionList, S-06).
  questionList: {
    open: "Przejrzyj pytania",
    heading: (count: number) => `Pytania (${String(count)})`,
    // The start of every question's sentence, above the list.
    start: "Kto z nas najprawdopodobniej…",
    empty: "Na liście nie ma pytań.",
    ownBadge: "własne",
    edit: "Popraw",
    remove: "Usuń",
    // The field of "Popraw".
    fieldLabel: "Treść pytania",
    save: "Zapisz",
    cancel: "Anuluj",
    draw: "Dolosuj pytanie",
    addLabel: "Dodaj własne pytanie",
    add: "Dodaj",
    // What the screen reader hears after the host's move.
    announce: {
      drawnList: "Pytania wylosowane.",
      drawnOne: "Dolosowano pytanie na koniec listy.",
      added: "Dodano pytanie na koniec listy.",
      removed: "Usunięto pytanie.",
      saved: "Zapisano pytanie.",
    },
  },
  // The room's page /r/[id] (src/pages/r/[id].astro): the browser tab's name by the page's kind, and the centred
  // message of each page that is not the room's screen.
  page: {
    tabTitle: {
      lobby: "Pokój",
      outside: "Nie jesteś w tym pokoju",
      removed: "Usunięto cię z pokoju",
      moved: "Grasz na innym urządzeniu",
      gone: "Tej gry już nie ma",
      error: "Pokój",
    },
    outside: {
      title: "Nie jesteś w tym pokoju.",
      text: "Poproś hosta o link.",
    },
    removed: {
      title: "Usunięto cię z pokoju.",
      text: "Jeśli to pomyłka albo host się zgodzi, możesz wrócić: poproś go o nowy link.",
    },
    // The old device of a guest a leader let back to their place on another one (S-04): nick is the place's.
    moved: {
      title: "Grasz teraz na innym urządzeniu.",
      text: (nick: string) => `Prowadzący wpuścił cię tam z powrotem jako ${nick}. Tę kartę możesz zamknąć.`,
    },
    gone: {
      title: "Tej gry już nie ma.",
      text: "Host ją usunął. Na następną grę poproś go o nowy link.",
    },
    // The text under it is the error code's (roomErrorMessage).
    error: {
      title: "Nie udało się otworzyć pokoju.",
    },
  },
};
