import { describe, expect, it } from "vitest";
import { CATEGORIES, QUESTIONS } from "@/data/questions";
import {
  questionPool,
  questionsToDraw,
  questionText,
  shuffledPool,
  shuffledQuestions,
  type QuestionBase,
  type QuestionSelection,
} from "@/lib/rounds/draw";

// The game's pool and the Worker's candidates (test-plan #3). Oracle: PRD FR-015 and US-01 ("Pytanie pochodzi tylko z
// wybranych kategorii (pytania 18+ tylko z tych, w których host je dołączył)"), FR-005 (18+ is decided per chosen
// category) and context/archive/2026-10-07-room-lobby/follow-ups/review-fixes.md:16 (the categories stored in the
// database are filtered through CATEGORIES: a host can store any name over RPC). The expected sets are written by hand,
// never computed with the draw's own filter. The pool in random order: decision D1 of
// context/archive/2026-10-15-full-game-evening/research.md (the Worker sends the whole pool, in its own order, for
// every draw, "Zacznij grę" too since S-20, and the database takes the candidates in the order of the draw, first the
// questions the host does not know from its other games: supabase/migrations/*_no_recent_repeats.sql, tested in
// tests/db/no-recent-repeats.test.ts).

// A base made for the test: "c" has no 18+ question, "z" is used by a question but is not a category of the base.
const BASE: QuestionBase = {
  categories: ["a", "b", "c"],
  questions: {
    "a-001": { category: "a", adult: false },
    "a-002": { category: "a", adult: true },
    "b-001": { category: "b", adult: false },
    "b-002": { category: "b", adult: true },
    "c-001": { category: "c", adult: false },
    "z-001": { category: "z", adult: false },
  },
};

// Each selection with its pool, written out by hand.
const ALLOWED = [
  { why: "a picked category without 18+", selection: { categories: ["a"], adultCategories: [] }, ids: ["a-001"] },
  {
    why: "a picked category with its 18+",
    selection: { categories: ["a"], adultCategories: ["a"] },
    ids: ["a-001", "a-002"],
  },
  {
    why: "two categories, 18+ in one of them",
    selection: { categories: ["a", "b"], adultCategories: ["a"] },
    ids: ["a-001", "a-002", "b-001"],
  },
  {
    why: "a category with no 18+ questions picked as 18+",
    selection: { categories: ["c"], adultCategories: ["c"] },
    ids: ["c-001"],
  },
  {
    why: "18+ of a category that is not picked",
    selection: { categories: ["b"], adultCategories: ["a"] },
    ids: ["b-001"],
  },
  {
    why: "unknown category names next to a known one",
    selection: { categories: ["a", "nie-ma", "constructor", "__proto__"], adultCategories: ["nie-ma"] },
    ids: ["a-001"],
  },
];

const EMPTY = [
  { why: "no category", selection: { categories: [], adultCategories: [] } },
  { why: "only 18+ and no category", selection: { categories: [], adultCategories: ["a"] } },
  { why: "only unknown names", selection: { categories: ["nie-ma", "constructor"], adultCategories: ["nie-ma"] } },
  { why: "a name used by a question but not a category", selection: { categories: ["z"], adultCategories: ["z"] } },
];

// A repeatable stand-in for Math.random (mulberry32): each seed gives its own sequence in [0, 1).
function seeded(seed: number): () => number {
  let state = seed;
  return () => {
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const SEEDS = Array.from({ length: 200 }, (_, seed) => seed);

// Every draw ("Zacznij grę" too since S-20) sends the whole pool, each question once, in an order of its own every
// time.
describe("shuffledPool", () => {
  it.each(ALLOWED)("gives each allowed question exactly once: $why", ({ selection, ids }) => {
    for (const seed of SEEDS.slice(0, 20)) {
      expect([...shuffledPool(BASE, selection, seeded(seed))].sort()).toEqual(ids);
    }
  });

  it.each(EMPTY)("gives no question for an empty pool: $why", ({ selection }) => {
    expect(shuffledPool(BASE, selection, seeded(1))).toEqual([]);
  });

  // a-001, a-002 and b-001 can stand in 3 · 2 · 1 = 6 orders; each one must be possible, or some question would never
  // come up next.
  it("can give every order of the pool", () => {
    const selection: QuestionSelection = { categories: ["a", "b"], adultCategories: ["a"] };
    const orders = new Set(SEEDS.map((seed) => shuffledPool(BASE, selection, seeded(seed)).join(" ")));

    expect(orders.size).toBe(6);
  });

  it.each([1, -0.5, Number.NaN])("still gives the whole pool when random gives %d", (value) => {
    const selection: QuestionSelection = { categories: ["a", "b"], adultCategories: ["a"] };

    expect([...shuffledPool(BASE, selection, () => value)].sort()).toEqual(["a-001", "a-002", "b-001"]);
  });
});

// The real base, for the Worker's candidates and a leader's count of the questions left to draw. Ids picked by hand
// from src/data/questions.ts: przyszlosc-001 and imprezy-001 are ordinary, przyszlosc-025 is 18+.
describe("questionPool and shuffledQuestions", () => {
  it.each(CATEGORIES.map((category) => category.id))("gives only ordinary questions of %s without 18+", (category) => {
    const pool = questionPool({ categories: [category], adultCategories: [] });

    expect(pool).not.toHaveLength(0);
    for (const id of pool) expect(QUESTIONS[id]).toMatchObject({ category, adult: false });
  });

  it("keep 18+ out unless the host included it, and to the picked categories", () => {
    const without = questionPool({ categories: ["przyszlosc"], adultCategories: [] });
    const withAdult = questionPool({ categories: ["przyszlosc"], adultCategories: ["przyszlosc"] });

    expect(without).toContain("przyszlosc-001");
    expect(without).not.toContain("przyszlosc-025");
    expect(withAdult).toContain("przyszlosc-001");
    expect(withAdult).toContain("przyszlosc-025");
    for (const id of withAdult) expect(QUESTIONS[id].category).toBe("przyszlosc");
  });

  it("keeps 18+ in the category the host chose it for", () => {
    const pool = questionPool({ categories: ["imprezy", "przyszlosc"], adultCategories: ["przyszlosc"] });

    expect(pool).toContain("imprezy-001");
    for (const id of pool) {
      const entry = QUESTIONS[id];
      expect(["imprezy", "przyszlosc"]).toContain(entry.category);
      if (entry.adult) expect(entry.category).toBe("przyszlosc");
    }
  });

  it("shuffledQuestions gives the same questions as questionPool", () => {
    const selection: QuestionSelection = { categories: ["imprezy", "przyszlosc"], adultCategories: ["przyszlosc"] };

    expect([...shuffledQuestions(selection, seeded(7))].sort()).toEqual([...questionPool(selection)].sort());
  });

  it("gives an empty pool when every picked name is unknown", () => {
    expect(questionPool({ categories: ["nie-ma", "constructor"], adultCategories: [] })).toEqual([]);
  });
});

// "Pozostałe pytania" for a leader after a reveal or a skip (context/archive/2026-10-24-question-list-review/plan.md,
// Critical Implementation Details): every round, a skipped one too, plays one question and none comes twice. The game
// plays the entries of its question list not removed first, then the pool of the picked categories without every
// question id on any row of the list. Since S-07 the count takes only the list's two numbers, as room_lobby's
// leader_draw gives them (context/changes/co-host-role/plan.md, Faza 2 #2): its entries not removed (list_entries) and
// its rows with a question id of the base (list_base_count). Since game-length
// (context/archive/2026-11-07-game-length/plan.md, Faza 2 #2) it is a number, how many "Jeszcze 5 pytań" can still
// draw, and never below 0. The numbers and the totals are counted by hand below. A game with no list has 15 questions
// (private.question_count in supabase/migrations/*_game_length.sql), whichever category the host picks. A category with
// fewer ordinary questions would show "z 15" and stop earlier.
describe("the default game length", () => {
  it.each(CATEGORIES.map((category) => category.id))("%s has at least 15 questions without 18+", (category) => {
    const ordinary = Object.values(QUESTIONS).filter((entry) => entry.category === category && !entry.adult);

    expect(ordinary.length).toBeGreaterThanOrEqual(15);
  });
});

// The new-game form offers "18+" at every category (NewGameForm), and FR-005 decides 18+ per chosen category, so the
// checkbox must add at least one question. Since S-28 some categories have a single 18+ question
// (context/changes/question-clarity/research.md, decision 6): a rewording that takes away the last one fails here.
describe("the 18+ of every category", () => {
  it.each(CATEGORIES.map((category) => category.id))("%s has at least one 18+ question", (category) => {
    const adult = Object.values(QUESTIONS).filter((entry) => entry.category === category && entry.adult);

    expect(adult.length).toBeGreaterThanOrEqual(1);
  });
});

// Every draw sends the game's whole pool as its candidates, and the database takes at most 1000 of them: more raise
// 22023 before anything is read or written (start_game, open_question_list, draw_list_question and the other draws,
// supabase/migrations/*_no_recent_repeats.sql), so a host who picks every category with its 18+ questions would get an
// error instead of a game. 1000 is the database's number, written out here. A base that outgrows it needs a migration
// that raises the limit first (960 questions since 2026-11-16).
describe("the database's limit of candidates", () => {
  it("takes the pool of every category with its 18+ questions", () => {
    const every = CATEGORIES.map((category) => category.id);

    expect(questionPool({ categories: every, adultCategories: every }).length).toBeLessThanOrEqual(1000);
  });
});

describe("questionsToDraw", () => {
  // A pool of 20 with no list (both numbers 0): 20 questions in all.
  it("counts the pool alone with no list", () => {
    const noList = { list_entries: 0, list_base_count: 0 };

    expect(questionsToDraw(20, noList, 19)).toBe(1);
    expect(questionsToDraw(20, noList, 20)).toBe(0);
  });

  // "Przejrzyj pytania" drew 15 of the pool and the host changed nothing: 15 entries, 15 rows with an id of the base,
  // then the 5 of the pool off the list, 20 in all, as with no list.
  it("counts a list left as drawn like the pool alone", () => {
    const drawn = { list_entries: 15, list_base_count: 15 };

    expect(questionsToDraw(20, drawn, 19)).toBe(1);
    expect(questionsToDraw(20, drawn, 20)).toBe(0);
  });

  // Of a pool of 20, "Przejrzyj pytania" drew a-001 to a-015 (positions 1-15). The host reworded 1 (its id stays on the
  // list), removed 2 and 5, added an own question (16) and drew a-016 (17). Rows with an id of the base: 15 + 1 = 16.
  // Entries not removed: 17 - 2 = 15 (1 reworded, 12 as drawn, the own one, the drawn one). Off the list: a-017 to
  // a-020, 4. So 15 + 4 = 19 questions in all: after round 1 18 are left, after round 18 one, after round 19 none, and
  // after round 20 still none, not -1.
  it("counts a list with removed, reworded and own questions", () => {
    const reviewed = { list_entries: 15, list_base_count: 16 };

    expect(questionsToDraw(20, reviewed, 1)).toBe(18);
    expect(questionsToDraw(20, reviewed, 18)).toBe(1);
    expect(questionsToDraw(20, reviewed, 19)).toBe(0);
    expect(questionsToDraw(20, reviewed, 20)).toBe(0);
  });

  // The pool is the list: 15 drawn of a pool of 15, 2 removed, 3 own questions added. 13 + 3 = 16 entries, 15 rows with
  // an id of the base, nothing off the list, so 16 in all, one more than the pool.
  it("counts own questions beyond the pool", () => {
    const ownOnTop = { list_entries: 16, list_base_count: 15 };

    expect(questionsToDraw(15, ownOnTop, 15)).toBe(1);
    expect(questionsToDraw(15, ownOnTop, 16)).toBe(0);
  });

  // Every entry removed: the start refuses (list_empty), but the count still holds: only the pool off the list.
  it("counts only the pool off the list when every entry is removed", () => {
    const allRemoved = { list_entries: 0, list_base_count: 15 };

    expect(questionsToDraw(20, allRemoved, 4)).toBe(1);
    expect(questionsToDraw(20, allRemoved, 5)).toBe(0);
  });

  // S-10 (context/archive/2026-11-04-guest-question-proposals/plan.md, Key Discoveries): an approved proposal is a new
  // entry with no question id, so list_entries grows by 1 and list_base_count stays. A pool of 20 with no list: 21 in
  // all.
  it("counts a question approved in a game with no list", () => {
    const approved = { list_entries: 1, list_base_count: 0 };

    expect(questionsToDraw(20, approved, 20)).toBe(1);
    expect(questionsToDraw(20, approved, 21)).toBe(0);
  });

  // The list of 15 left as drawn, and one approved: 16 entries, 15 rows with an id of the base, then the 5 of the pool
  // off the list, 21 in all.
  it("counts a question approved in a game with a list", () => {
    const approved = { list_entries: 16, list_base_count: 15 };

    expect(questionsToDraw(20, approved, 20)).toBe(1);
    expect(questionsToDraw(20, approved, 21)).toBe(0);
  });

  // The questions ran out after round 20, and a proposal approved then gives one to draw again.
  it("gives a question to draw again once one is approved after the last round", () => {
    expect(questionsToDraw(20, { list_entries: 0, list_base_count: 0 }, 20)).toBe(0);
    expect(questionsToDraw(20, { list_entries: 1, list_base_count: 0 }, 20)).toBe(1);
  });
});

describe("questionText", () => {
  it.each(["na-co-dzien-001", "przyszlosc-011"] as const)("gives the text of %s from the base", (id) => {
    expect(questionText(id)).toBe(QUESTIONS[id].text);
  });

  // The id comes from the database: since S-17 one of its copy of the base, but a round from before S-17 or a copy out
  // of step with the code may still bring an unknown one.
  it.each(["nie-ma-001", "constructor", "__proto__", "toString", ""])("gives null for the unknown id %j", (id) => {
    expect(questionText(id)).toBeNull();
  });
});
