import type { SupabaseClient } from "@supabase/supabase-js";
import { afterEach, beforeEach, describe, expect, it, vi, type MockInstance } from "vitest";
import { messages } from "@/lib/i18n";
import { historyTotals, votesLost } from "@/lib/rooms/history";
import { gameHistory } from "@/lib/rooms/server";
import type { HistoryRound } from "@/lib/rooms/shared";
import { gameSummary } from "@/lib/rooms/summary";

// The history of one ended game for its host (S-26, historia gry: /gry/<id>; PRD FR-030). Oracle, written out by hand
// and never computed here: context/changes/game-history-details/plan.md (Faza 2 #2; decision 2: a reveal whose counts
// and abstentions add up to fewer than its ballots lost votes with a removed player, and the page gets only that, never
// the number; decision 3: own and proposal questions carry the text of their entry); the summary's rule of
// context/archive/2026-10-25-game-summary/plan.md (sums of the reveals only, every player with a result in at least one
// reveal, in seat order; at most 3 at the top unless the top tie alone is more, the zeros among the nicks with none);
// the date of "Twoje gry" (context/archive/2026-11-10-host-game-history/plan.md, Karol's pick "D2", Europe/Warsaw);
// the text of na-co-dzien-001 copied from src/data/questions.ts.

const ROOM_ID = "3f2b8c1e-7a4d-4e9b-9c2a-5d6e7f8a9b0c";
// The page's dictionary (S-27): Polish, whose date the oracle spells out.
const PL = messages("pl");

// Seat order: the host Ola, then Bartek and Kuba; Zosia was let in during the game (S-08), Igor after its last reveal.
const PLAYERS = [
  { nick: "Ola", color: 0 },
  { nick: "Bartek", color: 19 },
  { nick: "Kuba", color: 7 },
];
const WITH_LATECOMERS = [...PLAYERS, { nick: "Zosia", color: 3 }, { nick: "Igor", color: 4 }];

// A revealed round of a question of the base: its results in seat order (the order of the keys), as the database
// gives them.
function revealed(number: number, results: Record<string, number>, abstained: number, ballots: number): HistoryRound {
  return {
    number,
    phase: "revealed",
    question_id: "na-co-dzien-001",
    question_text: null,
    origin: "base",
    results: Object.entries(results).map(([nick, votes]) => ({ nick, votes })),
    abstained,
    ballots,
  };
}

const SKIPPED: HistoryRound = {
  number: 2,
  phase: "skipped",
  question_id: null,
  question_text: "zgubiłby klucze w drodze do domu",
  origin: "proposal",
};
const CUT_SHORT: HistoryRound = {
  number: 4,
  phase: "voting",
  question_id: "przyszlosc-011",
  question_text: null,
  origin: "base",
};

describe("historyTotals", () => {
  it("sums two reveals per player in seat order, not by votes", () => {
    const rounds = [
      revealed(1, { Ola: 1, Bartek: 0, Kuba: 2 }, 0, 3),
      revealed(3, { Ola: 1, Bartek: 2, Kuba: 1 }, 0, 4),
    ];

    expect(historyTotals(PLAYERS, rounds)).toEqual({
      revealed: 2,
      totals: [
        { nick: "Ola", votes: 2 },
        { nick: "Bartek", votes: 2 },
        { nick: "Kuba", votes: 3 },
      ],
    });
  });

  it("counts nothing of a skipped round and of one cut short, nor as a revealed question", () => {
    const rounds = [revealed(1, { Ola: 2, Bartek: 0, Kuba: 1 }, 1, 4), SKIPPED, CUT_SHORT];

    expect(historyTotals(PLAYERS, rounds)).toEqual({
      revealed: 1,
      totals: [
        { nick: "Ola", votes: 2 },
        { nick: "Bartek", votes: 0 },
        { nick: "Kuba", votes: 1 },
      ],
    });
  });

  // Zosia could be voted for only in the second reveal; Igor in none, so "nobody voted for" him would not be true.
  it("counts a latecomer from the reveal they were in, and leaves out one with no result anywhere", () => {
    const rounds = [
      revealed(1, { Ola: 1, Bartek: 1, Kuba: 1 }, 0, 3),
      SKIPPED,
      revealed(3, { Ola: 0, Bartek: 1, Kuba: 0, Zosia: 2 }, 1, 4),
    ];

    expect(historyTotals(WITH_LATECOMERS, rounds)).toEqual({
      revealed: 2,
      totals: [
        { nick: "Ola", votes: 1 },
        { nick: "Bartek", votes: 2 },
        { nick: "Kuba", votes: 1 },
        { nick: "Zosia", votes: 2 },
      ],
    });
  });

  // Bartek could be voted for in both reveals and got nothing: the summary lists him among the nicks with none.
  it("keeps a player at 0 in every reveal, whom the summary lists among the nicks with none", () => {
    const rounds = [
      revealed(1, { Ola: 2, Bartek: 0, Kuba: 1 }, 0, 3),
      revealed(3, { Ola: 1, Bartek: 0, Kuba: 2 }, 0, 3),
    ];
    const totals = historyTotals(PLAYERS, rounds);

    expect(totals).not.toBeNull();
    expect(totals === null ? null : gameSummary(totals)).toEqual({
      revealed: 2,
      votes: 6,
      top: [
        { nick: "Ola", votes: 3 },
        { nick: "Kuba", votes: 3 },
      ],
      unvoted: ["Bartek"],
    });
  });

  it.each([
    { why: "no round at all (a game that never started)", rounds: [] },
    { why: "only a skipped round and one cut short", rounds: [SKIPPED, CUT_SHORT] },
  ])("gives null with $why: no summary", ({ rounds }) => {
    expect(historyTotals(PLAYERS, rounds)).toBeNull();
  });
});

describe("votesLost", () => {
  it.each([
    // 2 + 0 + 1 votes and 1 abstention: every one of the 4 ballots is on the table.
    { why: "the counts and abstentions add up to the ballots", abstained: 1, ballots: 4, lost: false },
    // Also when one of the 3 who cast them was removed since: their own ballot and vote stay counted (plan, "Critical
    // Implementation Details"), so no note.
    { why: "nobody abstained and every ballot is a vote", abstained: 0, ballots: 3, lost: false },
    // The votes for a guest removed after the reveal went with their rows: 3 + 1 of 6 ballots, and 3 of 4.
    { why: "2 votes went with a removed player", abstained: 1, ballots: 6, lost: true },
    { why: "1 vote went with a removed player", abstained: 0, ballots: 4, lost: true },
  ])("gives $lost when $why", ({ abstained, ballots, lost }) => {
    const results = [
      { nick: "Ola", votes: 2 },
      { nick: "Bartek", votes: 0 },
      { nick: "Kuba", votes: 1 },
    ];

    expect(votesLost({ results, abstained, ballots })).toBe(lost);
  });
});

// A client that has only rpc(): game_history answers with the given data, as the database would.
function historyClient(data: unknown): SupabaseClient {
  const client = { rpc: () => Promise.resolve({ data, error: null, status: 200 }) };
  return client as unknown as SupabaseClient;
}

// An ended game with every way a round ends and every origin of a question: a question of the base revealed (1), a
// guest's approved proposal skipped (2), the host's reworded question revealed after a guest with 2 of its votes was
// removed (3: 1 vote on the table and no abstention among 3 ballots) and a question of the base the base no longer has,
// cut short by the end of the game (4).
const ANSWER = {
  ok: true,
  created_at: "2026-11-10T19:50:00+00:00",
  started_at: "2026-11-10T20:14:33.123456+00:00",
  me: "Ola",
  players: PLAYERS,
  rounds: [
    {
      number: 1,
      phase: "revealed",
      question_id: "na-co-dzien-001",
      question_text: null,
      origin: "base",
      results: [
        { nick: "Ola", votes: 2 },
        { nick: "Bartek", votes: 0 },
        { nick: "Kuba", votes: 1 },
      ],
      abstained: 1,
      ballots: 4,
    },
    {
      number: 2,
      phase: "skipped",
      question_id: null,
      question_text: "zgubiłby klucze w drodze do domu",
      origin: "proposal",
    },
    {
      number: 3,
      phase: "revealed",
      question_id: null,
      question_text: "wypiłby mleko prosto z kartonu",
      origin: "own",
      results: [
        { nick: "Ola", votes: 0 },
        { nick: "Bartek", votes: 1 },
        { nick: "Kuba", votes: 0 },
      ],
      abstained: 0,
      ballots: 3,
    },
    { number: 4, phase: "voting", question_id: "nie-ma-001", question_text: null, origin: "base" },
  ],
};

describe("gameHistory", () => {
  let consoleError: MockInstance<typeof console.error>;

  beforeEach(() => {
    consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);
  });

  afterEach(() => {
    consoleError.mockRestore();
  });

  it("gives the page its view: the date, the summary of both reveals and the questions in the order of rounds", async () => {
    expect(await gameHistory(historyClient(ANSWER), ROOM_ID, PL, "pl")).toEqual({
      ok: true,
      history: {
        // 20:14 UTC in November is 21:14 in Warsaw (CET).
        date: "wtorek, 10 listopada 2026, 21:14",
        started: true,
        me: "Ola",
        players: [
          { nick: "Ola", color: 0 },
          { nick: "Bartek", color: 19 },
          { nick: "Kuba", color: 7 },
        ],
        // Ola 2, Bartek 1, Kuba 1: the tie at 1 fits whole beside Ola.
        summary: {
          revealed: 2,
          votes: 4,
          top: [
            { nick: "Ola", votes: 2 },
            { nick: "Bartek", votes: 1 },
            { nick: "Kuba", votes: 1 },
          ],
          unvoted: [],
        },
        questions: [
          {
            number: 1,
            text: "spóźniłby się na własne urodziny",
            lang: "pl",
            origin: "base",
            outcome: {
              kind: "revealed",
              results: [
                { nick: "Ola", votes: 2 },
                { nick: "Bartek", votes: 0 },
                { nick: "Kuba", votes: 1 },
              ],
              abstained: 1,
              votesLost: false,
            },
          },
          {
            number: 2,
            text: "zgubiłby klucze w drodze do domu",
            lang: "pl",
            origin: "proposal",
            outcome: { kind: "skipped" },
          },
          {
            number: 3,
            text: "wypiłby mleko prosto z kartonu",
            lang: "pl",
            origin: "own",
            outcome: {
              kind: "revealed",
              results: [
                { nick: "Ola", votes: 0 },
                { nick: "Bartek", votes: 1 },
                { nick: "Kuba", votes: 0 },
              ],
              abstained: 0,
              votesLost: true,
            },
          },
          { number: 4, text: null, lang: "pl", origin: "base", outcome: { kind: "cutShort" } },
        ],
      },
    });
  });

  // An entry's own text wins over the base's, also for a reworded question that kept its id.
  it.each([
    { why: "a question of the base", round: { question_id: "na-co-dzien-001", question_text: null, origin: "base" } },
    {
      why: "a reworded question that kept its id",
      round: { question_id: "na-co-dzien-001", question_text: "wypiłby mleko prosto z kartonu", origin: "own" },
    },
    {
      why: "the host's own question",
      round: { question_id: null, question_text: "napisałby test, zanim napisze kod", origin: "own" },
    },
    {
      why: "a guest's approved proposal",
      round: { question_id: null, question_text: "zgubiłby klucze w drodze do domu", origin: "proposal" },
    },
  ])("gives $why its text", async ({ round }) => {
    const answer = { ...ANSWER, rounds: [{ number: 1, phase: "skipped", ...round }] };
    const result = await gameHistory(historyClient(answer), ROOM_ID, PL, "pl");

    expect(result.ok && result.history.questions.map(({ text }) => text)).toEqual([
      round.question_text ?? "spóźniłby się na własne urodziny",
    ]);
  });

  // The round stays, the page says it could not load the question, and the log names the id, never a text.
  it("gives an id the base does not have the text null, with one log line holding no text", async () => {
    const result = await gameHistory(historyClient(ANSWER), ROOM_ID, PL, "pl");

    expect(result.ok && result.history.questions[3]).toEqual({
      number: 4,
      text: null,
      lang: "pl",
      origin: "base",
      outcome: { kind: "cutShort" },
    });
    expect(consoleError.mock.calls).toEqual([
      [{ op: "question_text", step: "unknown_question", roomId: ROOM_ID, code: "nie-ma-001" }],
    ]);
  });

  // ballots and the questions' ids stay in the Worker: the page gets only whether a reveal lost votes, and the text.
  it("gives the page no ballots and no question id", async () => {
    const result = await gameHistory(historyClient(ANSWER), ROOM_ID, PL, "pl");
    const sent = JSON.stringify(result);

    expect(result.ok).toBe(true);
    expect(sent).not.toContain("ballots");
    expect(sent).not.toContain("question_id");
    expect(sent).not.toContain("na-co-dzien-001");
    expect(sent).not.toContain("nie-ma-001");
  });

  // english-version (plan's "Język treści pytania"; decisions 8 and 9 of context/changes/english-version/plan.md): the
  // history in the page's language. A question of the base in the page's language, with the language of its text; a
  // player's text (a guest's proposal, the host's reworded question) as its author wrote it, with the page's language,
  // whatever it is written in, as the game does not know it; one the base does not have with the page's. The English
  // text of na-co-dzien-001 written out by hand from src/data/questions-en.ts.
  it("gives every question on an English page with the page's language, a question of the base in English", async () => {
    const result = await gameHistory(historyClient(ANSWER), ROOM_ID, PL, "en");

    expect(result.ok && result.history.questions.map(({ text, lang }) => [text, lang])).toEqual([
      ["be late for their own birthday", "en"],
      ["zgubiłby klucze w drodze do domu", "en"],
      ["wypiłby mleko prosto z kartonu", "en"],
      [null, "en"],
    ]);
  });

  it("gives a player's text written in English the language of a Polish page", async () => {
    const english = {
      ...ANSWER,
      rounds: [
        ANSWER.rounds[0],
        { ...ANSWER.rounds[1], question_text: "lose their keys on the way home" },
        { ...ANSWER.rounds[2], question_text: "drink milk straight from the carton" },
        ANSWER.rounds[3],
      ],
    };
    const result = await gameHistory(historyClient(english), ROOM_ID, PL, "pl");

    expect(result.ok && result.history.questions.map(({ text, lang }) => [text, lang])).toEqual([
      ["spóźniłby się na własne urodziny", "pl"],
      ["lose their keys on the way home", "pl"],
      ["drink milk straight from the carton", "pl"],
      [null, "pl"],
    ]);
  });

  it("dates a game that never started by its room's creation, with no summary and no question", async () => {
    const neverStarted = {
      ok: true,
      // 23:10 UTC on 7 November 2026 (a Saturday) is 00:10 on Sunday in Warsaw.
      created_at: "2026-11-07T23:10:00+00:00",
      started_at: null,
      me: "Ola",
      players: [{ nick: "Ola", color: 0 }],
      rounds: [],
    };

    expect(await gameHistory(historyClient(neverStarted), ROOM_ID, PL, "pl")).toEqual({
      ok: true,
      history: {
        date: "niedziela, 8 listopada 2026, 00:10",
        started: false,
        me: "Ola",
        players: [{ nick: "Ola", color: 0 }],
        summary: null,
        questions: [],
      },
    });
  });

  it("gives a game with no reveal no summary", async () => {
    const answer = { ...ANSWER, rounds: [ANSWER.rounds[1], ANSWER.rounds[3]] };
    const result = await gameHistory(historyClient(answer), ROOM_ID, PL, "pl");

    expect(result.ok && result.history.summary).toBeNull();
  });

  // game_history's refusals go on as they came: the page answers both with its 404.
  it.each(["room_unknown", "game_not_ended"])("passes the refusal %s on", async (reason) => {
    expect(await gameHistory(historyClient({ ok: false, reason }), ROOM_ID, PL, "pl")).toEqual({ ok: false, reason });
    expect(consoleError).not.toHaveBeenCalled();
  });

  // Anything else is a database and a Worker out of step: one line naming the field, and the page's 500.
  it.each([
    { why: "a refusal outside its contract", data: { ok: false, reason: "not_leader" }, field: "ok" },
    { why: "no answer at all", data: null, field: "root" },
    {
      why: "a reveal without its results",
      data: { ...ANSWER, rounds: [{ ...ANSWER.rounds[0], results: undefined }] },
      field: "rounds.results",
    },
  ])("answers $why as unexpected, naming $field", async ({ data, field }) => {
    expect(await gameHistory(historyClient(data), ROOM_ID, PL, "pl")).toEqual({ ok: false, reason: "unexpected" });
    expect(consoleError.mock.calls).toEqual([[{ op: "game_history", step: "shape", field, roomId: ROOM_ID }]]);
  });
});
