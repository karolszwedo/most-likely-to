import { describe, expect, it } from "vitest";
import { CATEGORIES, QUESTIONS, type QuestionEntry } from "@/data/questions";
import { CATEGORY_NAMES_EN, POLISH_ONLY, QUESTIONS_EN } from "@/data/questions-en";

// The English texts of the shared question base (english-version, S-27; PRD FR-031;
// context/changes/english-version/plan.md, Faza 3 #1 and #4, Faza 4 #3 and #4). Oracle: the rules of the header of
// src/data/questions-en.ts, as the plan states them (the ending after "Who’s most likely to", lowercase start, no
// trailing "?" or ".", at most 90 characters, typographic apostrophe and quotes), and decision 6 of 24.11.2026: every
// question of the base has an English text or a deliberate entry "only in Polish" with its reason, never both and never
// neither. The game has no language and no English pool (decision 1 of 24.11.2026): every game draws from all the
// questions, so no test here counts a pool. No text is copied into an assertion: each rule names every id that breaks
// it, so a red run says which ones to fix. The split is checked against sets taken straight from the two files, never
// through the draw or questionText.

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

describe("every category on an English screen", () => {
  it.each(CATEGORIES.map(({ id }) => id))("%s has an English name", (category) => {
    expect(CATEGORY_NAMES_EN[category].trim()).not.toBe("");
  });
});

// The split of the base (decision 6 of 24.11.2026; the header of src/data/questions-en.ts): every id of QUESTIONS has
// its English text in QUESTIONS_EN or the reason it has none in POLISH_ONLY. A question with neither would show on an
// English screen in Polish with nobody having decided so, and one with both would have a text the list says it lacks.
// Own keys only, so "constructor" counts as no entry. Each case names the ids that break it.
describe("the split of the base between English texts and the questions only in Polish", () => {
  const ids = Object.keys(BASE);
  const english = (id: string) => Object.hasOwn(QUESTIONS_EN, id);
  const polishOnly = (id: string) => Object.hasOwn(POLISH_ONLY, id);
  const reasons = Object.entries(POLISH_ONLY);

  it("is of a base with questions", () => {
    expect(ids.length).toBeGreaterThan(0);
  });

  it("gives every question of the base an English text or an entry only in Polish", () => {
    expect(ids.filter((id) => !english(id) && !polishOnly(id))).toEqual([]);
  });

  it("never gives a question both", () => {
    expect(ids.filter((id) => english(id) && polishOnly(id))).toEqual([]);
  });

  // A key that is no question of the base would be a reason for nothing (and fails `npx astro check` too).
  it("lists only ids of the Polish base as only in Polish", () => {
    expect(reasons.map(([id]) => id).filter((id) => !Object.hasOwn(BASE, id))).toEqual([]);
  });

  it("gives every question only in Polish its reason", () => {
    expect(reasons.filter(([, reason]) => reason.trim() === "").map(([id]) => id)).toEqual([]);
  });
});
