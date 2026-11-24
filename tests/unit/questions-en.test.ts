import { describe, expect, it } from "vitest";
import { CATEGORIES, QUESTIONS, type QuestionEntry } from "@/data/questions";
import { CATEGORY_NAMES_EN, QUESTIONS_EN } from "@/data/questions-en";
import { questionPool } from "@/lib/rounds/draw";

// The English texts of the shared question base (english-version, S-27; PRD FR-031;
// context/changes/english-version/plan.md, Faza 3 #1 and #4). Oracle: the rules of the header of
// src/data/questions-en.ts, as the plan states them (the ending after "Who’s most likely to", lowercase start, no
// trailing "?" or ".", at most 90 characters, typographic apostrophe and quotes), decision 6 (at least 15 ordinary
// English questions in every category, else the session stops and asks Karol) and the database's limit of 1000
// candidates (supabase/migrations/*_no_recent_repeats.sql, as in draw.test.ts). No text is copied into an assertion: each
// rule names every id that breaks it, so a red run says which ones to fix. The English game's pool is checked against
// sets counted here from the two files, never with the draw's own filter.

const ENTRIES = Object.entries(QUESTIONS_EN);
const BASE = QUESTIONS as Record<string, QuestionEntry>;

// Characters as the database counts the 90 of a question (char_length in private.question_text, and questionLength in
// src/lib/rooms/shared.ts in the browser): code points after NFC, as tests/unit/question-text.test.ts counts the Polish
// ones. "Popraw" puts a base text into the field of the host's own question, so a base text must fit the same count.
const characters = (text: string) => Array.from(text.normalize("NFC")).length;

// The ids whose English text breaks a rule.
const breaking = (keeps: (text: string) => boolean) => ENTRIES.filter(([, text]) => !keeps(text)).map(([id]) => id);

describe("the English text of every question", () => {
  it("has at most 90 characters, counted as the database counts them", () => {
    expect(breaking((text) => characters(text) <= 90)).toEqual([]);
  });

  it("starts with a lowercase letter", () => {
    expect(breaking((text) => /^\p{Ll}/u.test(text))).toEqual([]);
  });

  it('ends without "?" or "." (the screen adds the question mark)', () => {
    expect(breaking((text) => !/[?.]$/.test(text))).toEqual([]);
  });

  it("has no space at either end", () => {
    expect(breaking((text) => text === text.trim())).toEqual([]);
  });

  it("has no Polish letter", () => {
    expect(breaking((text) => !/[ąćęłńóśźżĄĆĘŁŃÓŚŹŻ]/.test(text))).toEqual([]);
  });

  // The screen puts "Who’s most likely to" in front of it: a text of its own with "who" would say it twice.
  it('does not start with "who"', () => {
    expect(breaking((text) => !/^who/i.test(text))).toEqual([]);
  });

  it("uses the typographic apostrophe and quotes, never the ASCII ' or \"", () => {
    expect(breaking((text) => !/['"]/.test(text))).toEqual([]);
  });

  // A key that is no question of the base would be a text no game can draw (and fails `npx astro check` too).
  it("is under an id of the Polish base", () => {
    expect(ENTRIES.map(([id]) => id).filter((id) => !Object.hasOwn(BASE, id))).toEqual([]);
  });
});

// The ordinary (not 18+) questions of a category that have an English text, counted straight from the two files.
function ordinaryInEnglish(category: string): string[] {
  return Object.entries(BASE)
    .filter(([id, entry]) => entry.category === category && !entry.adult && Object.hasOwn(QUESTIONS_EN, id))
    .map(([id]) => id);
}

describe("every category in an English game", () => {
  it.each(CATEGORIES.map(({ id }) => id))("%s has an English name", (category) => {
    expect(CATEGORY_NAMES_EN[category].trim()).not.toBe("");
  });

  // A game with no list plays 15 questions (private.question_count), whichever category the host picks, as
  // draw.test.ts checks for the Polish base.
  it.each(CATEGORIES.map(({ id }) => id))("%s has at least 15 ordinary questions in English", (category) => {
    expect(ordinaryInEnglish(category).length).toBeGreaterThanOrEqual(15);
  });
});

// The pool of an English game with every category and their 18+: only questions with an English text, and every one of
// them. Its size is counted from the two files (the English ids whose question the base has), so a pool that took in
// questions without an English text, or lost some with one, comes out a different size. Every draw sends the whole pool
// as its candidates, and the database takes at most 1000 of them.
describe("the pool of an English game with every category and their 18+", () => {
  const every = CATEGORIES.map(({ id }) => id);
  const pool = questionPool({ categories: every, adultCategories: every, language: "en" });
  const english = Object.keys(BASE).filter((id) => Object.hasOwn(QUESTIONS_EN, id));

  it("is not empty", () => {
    expect(pool.length).toBeGreaterThan(0);
  });

  it("has only questions with an English text", () => {
    expect(pool.filter((id) => !Object.hasOwn(QUESTIONS_EN, id))).toEqual([]);
  });

  it("has every question with an English text, each once", () => {
    expect(new Set(pool).size).toBe(pool.length);
    expect(pool.length).toBe(english.length);
  });

  it("fits the database's limit of 1000 candidates", () => {
    expect(pool.length).toBeLessThanOrEqual(1000);
  });
});
