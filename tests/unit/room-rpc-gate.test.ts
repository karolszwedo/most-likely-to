import type { SupabaseClient } from "@supabase/supabase-js";
import { describe, expect, it } from "vitest";
import {
  addOwnQuestion,
  admitLatecomer,
  castVote,
  createRoom,
  drawListQuestion,
  editListQuestion,
  endGame,
  joinRequestState,
  joinRoom,
  nextRound,
  openQuestionList,
  reactRound,
  rejectLatecomer,
  removeListQuestion,
  requestJoin,
  revealRound,
  roomLink,
  roomLobby,
  setCohost,
  setPlayerColor,
  skipRound,
  startGame,
} from "@/lib/rooms/server";

// The Worker reaches the database only through these RPCs (src/lib/rooms/server.ts), and the function's name and its
// p_* keys are plain strings. A typo there, a lost or extra key, or a value passed to the wrong parameter would pass
// every local check and show only in CI, or, for "Odsłoń wynik", which no CI job drives through the Worker, nowhere
// (context/changes/refactor-opportunities/plan.md, Faza 1). This test pins, for each game action, the function's name
// and the exact arguments the Worker sends.

// The oracle: each function's parameters as the latest migration defines them, written out by hand, never read from
// server.ts. A new or changed RPC function adds or changes its row here, together with the migration.
const SQL_SIGNATURES: Record<string, { name: string; hasDefault: boolean }[]> = {
  // supabase/migrations/20261031090821_player_color_choice.sql:76-82
  create_room: [
    { name: "p_nick", hasDefault: false },
    { name: "p_link_token", hasDefault: false },
    { name: "p_categories", hasDefault: false },
    { name: "p_adult_categories", hasDefault: false },
    { name: "p_confirm_close", hasDefault: true },
  ],
  // supabase/migrations/20261014101922_first_live_round.sql:384
  room_link: [{ name: "p_link_token", hasDefault: false }],
  // supabase/migrations/20261031090821_player_color_choice.sql:165
  join_room: [
    { name: "p_link_token", hasDefault: false },
    { name: "p_nick", hasDefault: false },
    { name: "p_player_token", hasDefault: false },
  ],
  // supabase/migrations/20261022132240_latecomer_admission.sql:94
  request_join: [
    { name: "p_link_token", hasDefault: false },
    { name: "p_nick", hasDefault: false },
    { name: "p_player_token", hasDefault: false },
  ],
  // supabase/migrations/20261022132240_latecomer_admission.sql:207
  join_request_state: [
    { name: "p_room_id", hasDefault: false },
    { name: "p_player_token", hasDefault: false },
  ],
  // supabase/migrations/20261031090821_player_color_choice.sql:413
  room_lobby: [
    { name: "p_room_id", hasDefault: false },
    { name: "p_player_token", hasDefault: true },
  ],
  // supabase/migrations/20261027121442_co_host_role.sql:110
  start_game: [
    { name: "p_room_id", hasDefault: false },
    { name: "p_question_id", hasDefault: false },
    { name: "p_player_token", hasDefault: true },
  ],
  // supabase/migrations/20261020205751_round_number_required.sql:87-92
  cast_vote: [
    { name: "p_room_id", hasDefault: false },
    { name: "p_target", hasDefault: false },
    { name: "p_player_token", hasDefault: true },
    { name: "p_round", hasDefault: true },
  ],
  // supabase/migrations/20261027121442_co_host_role.sql:365
  reveal_round: [
    { name: "p_room_id", hasDefault: false },
    { name: "p_round", hasDefault: true },
    { name: "p_player_token", hasDefault: true },
  ],
  // supabase/migrations/20261026074427_question_play_data.sql:505-510
  react_round: [
    { name: "p_room_id", hasDefault: false },
    { name: "p_round", hasDefault: false },
    { name: "p_reaction", hasDefault: false },
    { name: "p_player_token", hasDefault: true },
  ],
  // supabase/migrations/20261027121442_co_host_role.sql:201-206
  next_round: [
    { name: "p_room_id", hasDefault: false },
    { name: "p_round", hasDefault: false },
    { name: "p_candidates", hasDefault: false },
    { name: "p_player_token", hasDefault: true },
  ],
  // supabase/migrations/20261027121442_co_host_role.sql:275-280
  skip_round: [
    { name: "p_room_id", hasDefault: false },
    { name: "p_round", hasDefault: false },
    { name: "p_candidates", hasDefault: false },
    { name: "p_player_token", hasDefault: true },
  ],
  // supabase/migrations/20261027121442_co_host_role.sql:431
  end_game: [
    { name: "p_room_id", hasDefault: false },
    { name: "p_player_token", hasDefault: true },
  ],
  // supabase/migrations/20261031090821_player_color_choice.sql:247
  admit_latecomer: [
    { name: "p_room_id", hasDefault: false },
    { name: "p_nick", hasDefault: false },
    { name: "p_player_token", hasDefault: true },
  ],
  // supabase/migrations/20261027121442_co_host_role.sql:548
  reject_latecomer: [
    { name: "p_room_id", hasDefault: false },
    { name: "p_nick", hasDefault: false },
    { name: "p_player_token", hasDefault: true },
  ],
  // supabase/migrations/20261027121442_co_host_role.sql:595
  set_cohost: [
    { name: "p_room_id", hasDefault: false },
    { name: "p_nick", hasDefault: false },
    { name: "p_cohost", hasDefault: false },
  ],
  // supabase/migrations/20261031090821_player_color_choice.sql:325
  set_player_color: [
    { name: "p_room_id", hasDefault: false },
    { name: "p_color", hasDefault: false },
    { name: "p_player_token", hasDefault: true },
  ],
  // supabase/migrations/20261024094002_question_list_review.sql:104
  open_question_list: [
    { name: "p_room_id", hasDefault: false },
    { name: "p_candidates", hasDefault: false },
  ],
  // supabase/migrations/20261024094002_question_list_review.sql:171
  draw_list_question: [
    { name: "p_room_id", hasDefault: false },
    { name: "p_candidates", hasDefault: false },
  ],
  // supabase/migrations/20261024094002_question_list_review.sql:234
  remove_list_question: [
    { name: "p_room_id", hasDefault: false },
    { name: "p_position", hasDefault: false },
  ],
  // supabase/migrations/20261024094002_question_list_review.sql:283
  edit_list_question: [
    { name: "p_room_id", hasDefault: false },
    { name: "p_position", hasDefault: false },
    { name: "p_text", hasDefault: false },
  ],
  // supabase/migrations/20261024094002_question_list_review.sql:341
  add_own_question: [
    { name: "p_room_id", hasDefault: false },
    { name: "p_text", hasDefault: false },
  ],
};

// An answer on the success path for each function, one that passes server.ts's check of its shape.
const SUCCESS: Record<string, unknown> = {
  create_room: { ok: true, room_id: "room-created" },
  join_room: { ok: true, room_id: "room-joined" },
  room_link: { status: "unknown" },
  room_lobby: null,
  join_request_state: { state: "none" },
};

interface RpcCall {
  fn: string;
  args: unknown[];
}

// A client that has only rpc(fn, args, options?): it records each call, with every argument it got, and answers as
// the database would on the success path.
function fakeClient(): { supabase: SupabaseClient; calls: RpcCall[] } {
  const calls: RpcCall[] = [];
  const client = {
    rpc(fn: string, ...args: unknown[]) {
      calls.push({ fn, args });
      const data = fn in SUCCESS ? SUCCESS[fn] : { ok: true };
      return Promise.resolve({ data, error: null, status: 200 });
    },
  };
  return { supabase: client as unknown as SupabaseClient, calls };
}

// Sentinels: a different value for every input field, so a value sent to the wrong parameter shows.
const ROOM_ID = "room-id-sentinel";
const NICK = "nick-sentinel";
const LINK_TOKEN = "link-token-sentinel";
const PLAYER_TOKEN = "player-token-sentinel";
const QUESTION_ID = "question-id-sentinel";
const TARGET = "target-sentinel";
const CATEGORIES = ["category-sentinel"];
const ADULT_CATEGORIES = ["adult-category-sentinel"];
const CANDIDATES = ["candidate-sentinel"];
const QUESTION_TEXT = "question-text-sentinel";
const ROUND = 7;
const POSITION = 3;
// A colour of the palette that is neither ROUND nor POSITION, nor 0, the host's colour of a new room.
const COLOR = 11;
// One of the three values the screen sends; "down", so neither the first one nor the one that takes a thumb back.
const REACTION = "down";

const CASES: {
  action: string;
  fn: string;
  call: (supabase: SupabaseClient) => Promise<{ ok: boolean }>;
  expected: Record<string, unknown>;
}[] = [
  {
    action: "Załóż grę",
    fn: "create_room",
    call: (supabase) =>
      createRoom(supabase, {
        nick: NICK,
        linkToken: LINK_TOKEN,
        categories: CATEGORIES,
        adultCategories: ADULT_CATEGORIES,
        confirmClose: true,
      }),
    expected: {
      p_nick: NICK,
      p_link_token: LINK_TOKEN,
      p_categories: CATEGORIES,
      p_adult_categories: ADULT_CATEGORIES,
      p_confirm_close: true,
    },
  },
  {
    action: "Otwarcie linku do pokoju",
    fn: "room_link",
    call: (supabase) => roomLink(supabase, LINK_TOKEN),
    expected: { p_link_token: LINK_TOKEN },
  },
  {
    action: "Dołącz do gry",
    fn: "join_room",
    call: (supabase) => joinRoom(supabase, { linkToken: LINK_TOKEN, nick: NICK, playerToken: PLAYER_TOKEN }),
    expected: { p_link_token: LINK_TOKEN, p_nick: NICK, p_player_token: PLAYER_TOKEN },
  },
  {
    action: "Poproś o wejście (gra w toku)",
    fn: "request_join",
    call: (supabase) => requestJoin(supabase, LINK_TOKEN, NICK, PLAYER_TOKEN),
    expected: { p_link_token: LINK_TOKEN, p_nick: NICK, p_player_token: PLAYER_TOKEN },
  },
  {
    action: "Stan prośby spóźnionego",
    fn: "join_request_state",
    call: (supabase) => joinRequestState(supabase, ROOM_ID, PLAYER_TOKEN),
    expected: { p_room_id: ROOM_ID, p_player_token: PLAYER_TOKEN },
  },
  {
    action: "Stan pokoju gościa (token gościa)",
    fn: "room_lobby",
    call: (supabase) => roomLobby(supabase, ROOM_ID, PLAYER_TOKEN),
    expected: { p_room_id: ROOM_ID, p_player_token: PLAYER_TOKEN },
  },
  {
    action: "Stan pokoju hosta (bez tokenu gościa)",
    fn: "room_lobby",
    call: (supabase) => roomLobby(supabase, ROOM_ID),
    expected: { p_room_id: ROOM_ID, p_player_token: null },
  },
  {
    action: "Zacznij grę (host, bez tokenu gościa)",
    fn: "start_game",
    call: (supabase) => startGame(supabase, ROOM_ID, QUESTION_ID, null),
    expected: { p_room_id: ROOM_ID, p_question_id: QUESTION_ID, p_player_token: null },
  },
  {
    action: "Zacznij grę (współhost, token gościa)",
    fn: "start_game",
    call: (supabase) => startGame(supabase, ROOM_ID, QUESTION_ID, PLAYER_TOKEN),
    expected: { p_room_id: ROOM_ID, p_question_id: QUESTION_ID, p_player_token: PLAYER_TOKEN },
  },
  {
    action: "Zagłosuj",
    fn: "cast_vote",
    call: (supabase) => castVote(supabase, ROOM_ID, TARGET, PLAYER_TOKEN, ROUND),
    expected: { p_room_id: ROOM_ID, p_target: TARGET, p_player_token: PLAYER_TOKEN, p_round: ROUND },
  },
  {
    action: "Odsłoń wynik (host, bez tokenu gościa)",
    fn: "reveal_round",
    call: (supabase) => revealRound(supabase, ROOM_ID, ROUND, null),
    expected: { p_room_id: ROOM_ID, p_round: ROUND, p_player_token: null },
  },
  {
    action: "Odsłoń wynik (współhost, token gościa)",
    fn: "reveal_round",
    call: (supabase) => revealRound(supabase, ROOM_ID, ROUND, PLAYER_TOKEN),
    expected: { p_room_id: ROOM_ID, p_round: ROUND, p_player_token: PLAYER_TOKEN },
  },
  {
    action: "Kciuk",
    fn: "react_round",
    call: (supabase) => reactRound(supabase, ROOM_ID, ROUND, REACTION, PLAYER_TOKEN),
    expected: { p_room_id: ROOM_ID, p_round: ROUND, p_reaction: REACTION, p_player_token: PLAYER_TOKEN },
  },
  {
    action: "Kciuk hosta (bez tokenu gościa)",
    fn: "react_round",
    call: (supabase) => reactRound(supabase, ROOM_ID, ROUND, REACTION),
    expected: { p_room_id: ROOM_ID, p_round: ROUND, p_reaction: REACTION, p_player_token: null },
  },
  {
    action: "Następne pytanie (host, bez tokenu gościa)",
    fn: "next_round",
    call: (supabase) => nextRound(supabase, ROOM_ID, ROUND, CANDIDATES, null),
    expected: { p_room_id: ROOM_ID, p_round: ROUND, p_candidates: CANDIDATES, p_player_token: null },
  },
  {
    action: "Następne pytanie (współhost, token gościa)",
    fn: "next_round",
    call: (supabase) => nextRound(supabase, ROOM_ID, ROUND, CANDIDATES, PLAYER_TOKEN),
    expected: { p_room_id: ROOM_ID, p_round: ROUND, p_candidates: CANDIDATES, p_player_token: PLAYER_TOKEN },
  },
  {
    action: "Pomiń pytanie (host, bez tokenu gościa)",
    fn: "skip_round",
    call: (supabase) => skipRound(supabase, ROOM_ID, ROUND, CANDIDATES, null),
    expected: { p_room_id: ROOM_ID, p_round: ROUND, p_candidates: CANDIDATES, p_player_token: null },
  },
  {
    action: "Pomiń pytanie (współhost, token gościa)",
    fn: "skip_round",
    call: (supabase) => skipRound(supabase, ROOM_ID, ROUND, CANDIDATES, PLAYER_TOKEN),
    expected: { p_room_id: ROOM_ID, p_round: ROUND, p_candidates: CANDIDATES, p_player_token: PLAYER_TOKEN },
  },
  {
    action: "Zakończ grę (host, bez tokenu gościa)",
    fn: "end_game",
    call: (supabase) => endGame(supabase, ROOM_ID, null),
    expected: { p_room_id: ROOM_ID, p_player_token: null },
  },
  {
    action: "Zakończ grę (współhost, token gościa)",
    fn: "end_game",
    call: (supabase) => endGame(supabase, ROOM_ID, PLAYER_TOKEN),
    expected: { p_room_id: ROOM_ID, p_player_token: PLAYER_TOKEN },
  },
  {
    action: "Wpuść (host, bez tokenu gościa)",
    fn: "admit_latecomer",
    call: (supabase) => admitLatecomer(supabase, ROOM_ID, NICK, null),
    expected: { p_room_id: ROOM_ID, p_nick: NICK, p_player_token: null },
  },
  {
    action: "Wpuść (współhost, token gościa)",
    fn: "admit_latecomer",
    call: (supabase) => admitLatecomer(supabase, ROOM_ID, NICK, PLAYER_TOKEN),
    expected: { p_room_id: ROOM_ID, p_nick: NICK, p_player_token: PLAYER_TOKEN },
  },
  {
    action: "Odrzuć (host, bez tokenu gościa)",
    fn: "reject_latecomer",
    call: (supabase) => rejectLatecomer(supabase, ROOM_ID, NICK, null),
    expected: { p_room_id: ROOM_ID, p_nick: NICK, p_player_token: null },
  },
  {
    action: "Odrzuć (współhost, token gościa)",
    fn: "reject_latecomer",
    call: (supabase) => rejectLatecomer(supabase, ROOM_ID, NICK, PLAYER_TOKEN),
    expected: { p_room_id: ROOM_ID, p_nick: NICK, p_player_token: PLAYER_TOKEN },
  },
  // false, so neither the value a default would give nor the one most cases send.
  {
    action: "Odbierz rolę współhosta",
    fn: "set_cohost",
    call: (supabase) => setCohost(supabase, ROOM_ID, NICK, false),
    expected: { p_room_id: ROOM_ID, p_nick: NICK, p_cohost: false },
  },
  {
    action: "Nadaj rolę współhosta",
    fn: "set_cohost",
    call: (supabase) => setCohost(supabase, ROOM_ID, NICK, true),
    expected: { p_room_id: ROOM_ID, p_nick: NICK, p_cohost: true },
  },
  {
    action: "Zmień kolor (host, bez tokenu gościa)",
    fn: "set_player_color",
    call: (supabase) => setPlayerColor(supabase, ROOM_ID, COLOR, null),
    expected: { p_room_id: ROOM_ID, p_color: COLOR, p_player_token: null },
  },
  {
    action: "Zmień kolor (gość, token gościa)",
    fn: "set_player_color",
    call: (supabase) => setPlayerColor(supabase, ROOM_ID, COLOR, PLAYER_TOKEN),
    expected: { p_room_id: ROOM_ID, p_color: COLOR, p_player_token: PLAYER_TOKEN },
  },
  {
    action: "Przejrzyj pytania",
    fn: "open_question_list",
    call: (supabase) => openQuestionList(supabase, ROOM_ID, CANDIDATES),
    expected: { p_room_id: ROOM_ID, p_candidates: CANDIDATES },
  },
  {
    action: "Dolosuj pytanie",
    fn: "draw_list_question",
    call: (supabase) => drawListQuestion(supabase, ROOM_ID, CANDIDATES),
    expected: { p_room_id: ROOM_ID, p_candidates: CANDIDATES },
  },
  {
    action: "Usuń pytanie",
    fn: "remove_list_question",
    call: (supabase) => removeListQuestion(supabase, ROOM_ID, POSITION),
    expected: { p_room_id: ROOM_ID, p_position: POSITION },
  },
  {
    action: "Popraw pytanie",
    fn: "edit_list_question",
    call: (supabase) => editListQuestion(supabase, ROOM_ID, POSITION, QUESTION_TEXT),
    expected: { p_room_id: ROOM_ID, p_position: POSITION, p_text: QUESTION_TEXT },
  },
  {
    action: "Dodaj własne pytanie",
    fn: "add_own_question",
    call: (supabase) => addOwnQuestion(supabase, ROOM_ID, QUESTION_TEXT),
    expected: { p_room_id: ROOM_ID, p_text: QUESTION_TEXT },
  },
];

describe("the Worker's RPC calls to the database", () => {
  it.each(CASES)("$action → $fn", async ({ fn, call, expected }) => {
    const { supabase, calls } = fakeClient();

    const result = await call(supabase);

    expect(calls).toHaveLength(1);
    const [{ fn: calledFn, args: callArgs }] = calls;
    expect(calledFn).toBe(fn);
    // Exactly (fn, args): no third argument, so always a POST; { get: true } would put the arguments into the URL.
    expect(callArgs).toHaveLength(1);
    const [args] = callArgs;
    expect(args).toStrictEqual(expected);

    const params = SQL_SIGNATURES[fn];
    const keys = Object.keys(args as Record<string, unknown>);
    expect(params.map((param) => param.name)).toEqual(expect.arrayContaining(keys));
    for (const param of params.filter((p) => !p.hasDefault)) {
      expect(keys).toContain(param.name);
    }

    // The fake's answer passed server.ts's check of its shape.
    expect(result.ok).toBe(true);
  });
});
