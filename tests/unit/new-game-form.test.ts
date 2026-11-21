import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import NewGameForm, {
  allCategoriesPicked,
  type CategoryChoice,
  pickAllCategories,
} from "@/components/room/NewGameForm";

// The new game's form on / (categories-unticked). The oracle is Karol's decision of 21.11.2026
// (context/changes/categories-unticked/change.md, plan.md), not the form's code:
// - the form starts with no category picked, and every category's 18+ unpicked and off, so the host picks what the game
//   draws from instead of unpicking it from "all on" (the default from the interview for S-02, which this replaces);
// - one shortcut over the list picks every category, and unpicks them all only when every one is picked;
// - the shortcut never turns 18+ on or off: each category keeps its 18+ as it was, as when a single category is
//   unpicked and picked again;
// - the shortcut posts nothing: it is not a submit button and has no name, so /api/rooms gets only categories.
// Clicking it, the focus and the error it clears are Karol's to check on a phone and a laptop (plan.md, 3.3).

const CATEGORIES = [
  { id: "na-co-dzien", name: "Na co dzień" },
  { id: "imprezy", name: "Imprezy" },
  { id: "przyszlosc", name: "Przyszłość" },
];

// The form as the server renders it into /: no preview, ids without a prefix.
function serverHtml(): string {
  return renderToStaticMarkup(createElement(NewGameForm, { categories: CATEGORIES }));
}

// Every opening tag of an element, with its attributes.
function tags(html: string, element: string): string[] {
  return [...html.matchAll(new RegExp(`<${element}\\b[^>]*>`, "g"))].map(([tag]) => tag);
}

function attribute(tag: string, name: string): string | undefined {
  return new RegExp(`\\s${name}="([^"]*)"`).exec(tag)?.[1];
}

function hasAttribute(tag: string, name: string): boolean {
  return new RegExp(`\\s${name}(?:=|\\s|>|/)`).test(tag);
}

describe("NewGameForm in the server's HTML, as the host first sees it", () => {
  const buttons = tags(serverHtml(), "button");
  const checkboxes = buttons.filter((tag) => attribute(tag, "role") === "checkbox");
  const checkbox = (id: string) => checkboxes.find((tag) => attribute(tag, "id") === id);

  it("has one checkbox per category and one per category's 18+, and nothing else to tick", () => {
    expect(checkboxes).toHaveLength(CATEGORIES.length * 2);
  });

  it.each(CATEGORIES)("$id starts unpicked, with its 18+ unpicked and off", ({ id }) => {
    const category = checkbox(`category-${id}`);
    const adult = checkbox(`adult-${id}`);

    expect(category).toBeDefined();
    expect(adult).toBeDefined();
    expect(attribute(category ?? "", "aria-checked")).toBe("false");
    expect(attribute(adult ?? "", "aria-checked")).toBe("false");
    expect(hasAttribute(adult ?? "", "disabled")).toBe(true);
  });

  it("has one shortcut over the categories, which neither submits nor posts a field", () => {
    const others = buttons.filter((tag) => attribute(tag, "role") !== "checkbox");
    const submits = others.filter((tag) => attribute(tag, "type") === "submit");
    const shortcuts = others.filter((tag) => attribute(tag, "type") !== "submit");

    // "Załóż grę" and the shortcut.
    expect(submits).toHaveLength(1);
    expect(shortcuts).toHaveLength(1);
    expect(attribute(shortcuts[0], "type")).toBe("button");
    expect(hasAttribute(shortcuts[0], "name")).toBe(false);
  });
});

// The host's choice in the form's state. "imprezy" remembers its 18+ while unpicked, as after the host ticked its 18+
// and then unpicked the category.
const NONE: Record<string, CategoryChoice> = {
  "na-co-dzien": { on: false, adult: false },
  imprezy: { on: false, adult: true },
  przyszlosc: { on: false, adult: false },
};
const SOME: Record<string, CategoryChoice> = {
  "na-co-dzien": { on: true, adult: true },
  imprezy: { on: false, adult: false },
  przyszlosc: { on: true, adult: false },
};
const ALL: Record<string, CategoryChoice> = {
  "na-co-dzien": { on: true, adult: false },
  imprezy: { on: true, adult: true },
  przyszlosc: { on: true, adult: true },
};

function picked(choices: Record<string, CategoryChoice>): Record<string, boolean> {
  return Object.fromEntries(Object.entries(choices).map(([id, choice]) => [id, choice.on]));
}

function adult(choices: Record<string, CategoryChoice>): Record<string, boolean> {
  return Object.fromEntries(Object.entries(choices).map(([id, choice]) => [id, choice.adult]));
}

const EVERY = { "na-co-dzien": true, imprezy: true, przyszlosc: true };
const NOTHING = { "na-co-dzien": false, imprezy: false, przyszlosc: false };

describe("allCategoriesPicked, which turns the shortcut from picking all to unpicking all", () => {
  it.each([
    { why: "no category picked", choices: NONE, expected: false },
    { why: "some picked", choices: SOME, expected: false },
    { why: "every one picked", choices: ALL, expected: true },
    { why: "the one category picked", choices: { imprezy: { on: true, adult: false } }, expected: true },
    { why: "the one category not picked", choices: { imprezy: { on: false, adult: true } }, expected: false },
    { why: "no categories at all", choices: {}, expected: false },
  ])("is $expected with $why", ({ choices, expected }) => {
    expect(allCategoriesPicked(choices)).toBe(expected);
  });
});

describe("pickAllCategories, the shortcut's move", () => {
  it.each([
    { why: "none", choices: NONE },
    { why: "some", choices: SOME },
    { why: "all", choices: ALL },
  ])("picks every category from $why picked", ({ choices }) => {
    expect(picked(pickAllCategories(choices, true))).toEqual(EVERY);
  });

  it.each([
    { why: "all", choices: ALL },
    { why: "some", choices: SOME },
  ])("unpicks every category from $why picked", ({ choices }) => {
    expect(picked(pickAllCategories(choices, false))).toEqual(NOTHING);
  });

  it.each([
    {
      why: "picking all from none",
      choices: NONE,
      on: true,
      expected: { "na-co-dzien": false, imprezy: true, przyszlosc: false },
    },
    {
      why: "picking all from some",
      choices: SOME,
      on: true,
      expected: { "na-co-dzien": true, imprezy: false, przyszlosc: false },
    },
    {
      why: "unpicking all",
      choices: ALL,
      on: false,
      expected: { "na-co-dzien": false, imprezy: true, przyszlosc: true },
    },
  ])("leaves each category's 18+ as it was when $why", ({ choices, on, expected }) => {
    expect(adult(pickAllCategories(choices, on))).toEqual(expected);
  });

  it("works on the one category of a list of one", () => {
    expect(pickAllCategories({ imprezy: { on: false, adult: true } }, true)).toEqual({
      imprezy: { on: true, adult: true },
    });
  });

  it("leaves the choice it gets as it was, as React's state must", () => {
    const before = structuredClone(SOME);

    pickAllCategories(SOME, true);

    expect(SOME).toEqual(before);
  });
});
