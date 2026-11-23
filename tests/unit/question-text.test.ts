import { describe, expect, it } from "vitest";
import { QUESTIONS, type QuestionEntry } from "@/data/questions";

// The text rules of the shared question base (header of src/data/questions.ts): `text` is the ending after the fixed
// prefix "Kto z nas najprawdopodobniej", so the screen shows "Kto z nas najprawdopodobniej {text}?". A reworded
// question (S-28, context/changes/question-clarity/plan.md, Faza 1 #3) must not come out too long for a phone or written
// so that the sentence on screen breaks. Only the Polish `text` is checked here: the English texts of S-27 get their own
// rules (context/changes/english-version/plan.md, Faza 3 #4). Oracle: the rules as the header states them, one case
// per rule; each case names every question that breaks its rule, so a red run says which ones to fix.

const ENTRIES = Object.entries(QUESTIONS) as [string, QuestionEntry][];

// Characters as the database counts the 90 of a question (char_length in private.question_text, and questionLength in
// src/lib/rooms/shared.ts in the browser): code points after NFC. "Popraw" puts a base text into the field of the
// host's own question, so a base text must fit the same count.
const characters = (text: string) => Array.from(text.normalize("NFC")).length;

// The ids of the questions whose text breaks a rule.
const breaking = (keeps: (text: string) => boolean) => ENTRIES.filter(([, q]) => !keeps(q.text)).map(([id]) => id);

describe("the text of every question in the base", () => {
  it("is checked on the whole base, not on an empty one", () => {
    expect(ENTRIES.length).toBeGreaterThan(0);
  });

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

  // The generic form is the masculine singular ("zasnąłby"), always "łby"; the plural "zrobiliby" does not fit "Kto z
  // nas". A heuristic: some word ends in "łby", not a parse of the main verb.
  it('has a verb in the conditional mood: a word ending in "łby" ("zasnąłby…")', () => {
    expect(breaking((text) => /łby(?!\p{L})/u.test(text))).toEqual([]);
  });
});
