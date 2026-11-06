import { describe, expect, it } from "vitest";
import { CATEGORIES, QUESTIONS } from "@/data/questions";
import {
  drawFrom,
  drawQuestion,
  questionPool,
  questionsLeft,
  questionText,
  shuffledPool,
  shuffledQuestions,
  type QuestionBase,
  type QuestionSelection,
} from "@/lib/rounds/draw";

// The round's question and the game's pool (test-plan #3). Oracle: PRD FR-015 and US-01 ("Pytanie pochodzi tylko z
// wybranych kategorii (pytania 18+ tylko z tych, w których host je dołączył)"), FR-005 (18+ is decided per chosen
// category) and context/archive/2026-10-07-room-lobby/follow-ups/review-fixes.md:16 (the categories stored in the
// database are filtered through CATEGORIES: a host can store any name over RPC). The expected sets are written by hand,
// never computed with the draw's own filter. The pool in random order: decision D1 of
// context/archive/2026-10-15-full-game-evening/research.md (the Worker sends the whole pool, in its own order, and the
// database takes the first question not played yet).

// Every value the injected random can give, on a grid fine enough to reach each question of a small pool.
const GRID = Array.from({ length: 1000 }, (_, i) => i / 1000).concat([1 - Number.EPSILON]);

function drawable<Id extends string>(draw: (random: () => number) => Id | null): Set<Id | null> {
  return new Set(GRID.map((value) => draw(() => value)));
}

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

describe("drawFrom", () => {
  it.each(ALLOWED)("draws only from the allowed questions: $why", ({ selection, ids }) => {
    expect(drawable((random) => drawFrom(BASE, selection, random))).toEqual(new Set(ids));
  });

  it.each(EMPTY)("gives null for an empty pool: $why", ({ selection }) => {
    expect(drawable((random) => drawFrom(BASE, selection, random))).toEqual(new Set([null]));
  });

  it.each([1, -0.5, Number.NaN])("still draws from the pool when random gives %d", (value) => {
    const selection: QuestionSelection = { categories: ["a", "b"], adultCategories: [] };

    expect(["a-001", "b-001"]).toContain(drawFrom(BASE, selection, () => value));
  });
});

// "Następne pytanie" and "Pomiń pytanie" send the whole pool, each question once, in an order of its own every time.
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

describe("drawQuestion", () => {
  it.each(CATEGORIES.map((category) => category.id))("draws only ordinary questions of %s without 18+", (category) => {
    const ids = drawable((random) => drawQuestion({ categories: [category], adultCategories: [] }, random));

    for (const id of ids) {
      expect(id).not.toBeNull();
      if (id === null) continue;
      expect(QUESTIONS[id]).toMatchObject({ category, adult: false });
    }
  });

  // Ids picked by hand from src/data/questions.ts: przyszlosc-001 is ordinary, przyszlosc-011 is 18+.
  it("draws 18+ only from the categories where the host included them", () => {
    const without = drawable((random) => drawQuestion({ categories: ["przyszlosc"], adultCategories: [] }, random));
    const withAdult = drawable((random) =>
      drawQuestion({ categories: ["przyszlosc"], adultCategories: ["przyszlosc"] }, random),
    );

    expect(without.has("przyszlosc-001")).toBe(true);
    expect(without.has("przyszlosc-011")).toBe(false);
    expect(withAdult.has("przyszlosc-001")).toBe(true);
    expect(withAdult.has("przyszlosc-011")).toBe(true);
  });

  it("keeps 18+ in the category the host chose it for", () => {
    const ids = drawable((random) =>
      drawQuestion({ categories: ["imprezy", "przyszlosc"], adultCategories: ["przyszlosc"] }, random),
    );

    expect(ids.has("imprezy-001")).toBe(true);
    for (const id of ids) {
      if (id === null) {
        expect(id).not.toBeNull();
        continue;
      }
      const entry = QUESTIONS[id];
      expect(["imprezy", "przyszlosc"]).toContain(entry.category);
      if (entry.adult) expect(entry.category).toBe("przyszlosc");
    }
  });

  it("gives null when every picked name is unknown", () => {
    expect(drawQuestion({ categories: ["nie-ma", "constructor"], adultCategories: [] }, () => 0)).toBeNull();
  });
});

// The real base, for the host's "are there questions left" and the Worker's candidates. Ids picked by hand from
// src/data/questions.ts: przyszlosc-001 is ordinary, przyszlosc-011 is 18+.
describe("questionPool and shuffledQuestions", () => {
  it("keep 18+ out unless the host included it, and to the picked categories", () => {
    const without = questionPool({ categories: ["przyszlosc"], adultCategories: [] });
    const withAdult = questionPool({ categories: ["przyszlosc"], adultCategories: ["przyszlosc"] });

    expect(without).toContain("przyszlosc-001");
    expect(without).not.toContain("przyszlosc-011");
    expect(withAdult).toContain("przyszlosc-011");
    for (const id of withAdult) expect(QUESTIONS[id].category).toBe("przyszlosc");
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
// its rows with a question id of the base (list_base_count). The numbers and the totals are counted by hand below.
describe("questionsLeft", () => {
  // A pool of 20 with no list (both numbers 0): 20 questions in all.
  it("counts the pool alone with no list", () => {
    const noList = { list_entries: 0, list_base_count: 0 };

    expect(questionsLeft(20, noList, 19)).toBe(true);
    expect(questionsLeft(20, noList, 20)).toBe(false);
  });

  // "Przejrzyj pytania" drew 15 of the pool and the host changed nothing: 15 entries, 15 rows with an id of the base,
  // then the 5 of the pool off the list, 20 in all, as with no list.
  it("counts a list left as drawn like the pool alone", () => {
    const drawn = { list_entries: 15, list_base_count: 15 };

    expect(questionsLeft(20, drawn, 19)).toBe(true);
    expect(questionsLeft(20, drawn, 20)).toBe(false);
  });

  // Of a pool of 20, "Przejrzyj pytania" drew a-001 to a-015 (positions 1-15). The host reworded 1 (its id stays on the
  // list), removed 2 and 5, added an own question (16) and drew a-016 (17). Rows with an id of the base: 15 + 1 = 16.
  // Entries not removed: 17 - 2 = 15 (1 reworded, 12 as drawn, the own one, the drawn one). Off the list: a-017 to
  // a-020, 4. So 15 + 4 = 19 questions in all: after round 18 one is left, after round 19 none.
  it("counts a list with removed, reworded and own questions", () => {
    const reviewed = { list_entries: 15, list_base_count: 16 };

    expect(questionsLeft(20, reviewed, 1)).toBe(true);
    expect(questionsLeft(20, reviewed, 18)).toBe(true);
    expect(questionsLeft(20, reviewed, 19)).toBe(false);
    expect(questionsLeft(20, reviewed, 20)).toBe(false);
  });

  // The pool is the list: 15 drawn of a pool of 15, 2 removed, 3 own questions added. 13 + 3 = 16 entries, 15 rows with
  // an id of the base, nothing off the list, so 16 in all, one more than the pool.
  it("counts own questions beyond the pool", () => {
    const ownOnTop = { list_entries: 16, list_base_count: 15 };

    expect(questionsLeft(15, ownOnTop, 15)).toBe(true);
    expect(questionsLeft(15, ownOnTop, 16)).toBe(false);
  });

  // Every entry removed: the start refuses (list_empty), but the count still holds: only the pool off the list.
  it("counts only the pool off the list when every entry is removed", () => {
    const allRemoved = { list_entries: 0, list_base_count: 15 };

    expect(questionsLeft(20, allRemoved, 4)).toBe(true);
    expect(questionsLeft(20, allRemoved, 5)).toBe(false);
  });

  // S-10 (context/changes/guest-question-proposals/plan.md, Key Discoveries): an approved proposal is a new entry with
  // no question id, so list_entries grows by 1 and list_base_count stays. A pool of 20 with no list: 21 in all.
  it("counts a question approved in a game with no list", () => {
    const approved = { list_entries: 1, list_base_count: 0 };

    expect(questionsLeft(20, approved, 20)).toBe(true);
    expect(questionsLeft(20, approved, 21)).toBe(false);
  });

  // The list of 15 left as drawn, and one approved: 16 entries, 15 rows with an id of the base, then the 5 of the pool
  // off the list, 21 in all.
  it("counts a question approved in a game with a list", () => {
    const approved = { list_entries: 16, list_base_count: 15 };

    expect(questionsLeft(20, approved, 20)).toBe(true);
    expect(questionsLeft(20, approved, 21)).toBe(false);
  });

  // The questions ran out after round 20, and a proposal approved then brings "Następne pytanie" back.
  it("gives a question left again once one is approved after the last round", () => {
    expect(questionsLeft(20, { list_entries: 0, list_base_count: 0 }, 20)).toBe(false);
    expect(questionsLeft(20, { list_entries: 1, list_base_count: 0 }, 20)).toBe(true);
  });
});

describe("questionText", () => {
  it.each(["na-co-dzien-001", "przyszlosc-011"] as const)("gives the text of %s from the base", (id) => {
    expect(questionText(id)).toBe(QUESTIONS[id].text);
  });

  // The id comes from the database, which checks only its format.
  it.each(["nie-ma-001", "constructor", "__proto__", "toString", ""])("gives null for the unknown id %j", (id) => {
    expect(questionText(id)).toBeNull();
  });
});
