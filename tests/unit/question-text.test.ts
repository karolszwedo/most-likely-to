import { describe, expect, it } from "vitest";
import { QUESTIONS, type QuestionEntry } from "@/data/questions";

// The text rules of the shared question base (header of src/data/questions.ts): `text` is the ending after the fixed
// prefix "Kto z nas najprawdopodobniej", so the screen shows "Kto z nas najprawdopodobniej {text}?". A reworded
// question (S-28, context/changes/question-clarity/plan.md, Faza 1 #3) or a translated one (S-27) must not come out too
// long for a phone or written so that the sentence on screen breaks. Oracle: the rules as the header states them, one
// case per rule; each case names every question that breaks its rule, so a red run says which ones to fix.

const ENTRIES = Object.entries(QUESTIONS) as [string, QuestionEntry][];

// The characters a reader sees ("ą" is one, however it is encoded), not bytes or UTF-16 units.
const characters = (text: string) => [...new Intl.Segmenter("pl", { granularity: "grapheme" }).segment(text)].length;

// The ids of the questions whose text breaks a rule.
const breaking = (keeps: (text: string) => boolean) => ENTRIES.filter(([, q]) => !keeps(q.text)).map(([id]) => id);

describe("the text of every question in the base", () => {
  it("is checked on the whole base, not on an empty one", () => {
    expect(ENTRIES.length).toBeGreaterThan(0);
  });

  it("has at most 90 characters, counted as characters, not bytes", () => {
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

  it('has a verb in the conditional mood: a word ending in "łby" or "liby" ("zasnąłby…")', () => {
    expect(breaking((text) => /(?:łby|liby)(?!\p{L})/u.test(text))).toEqual([]);
  });
});
