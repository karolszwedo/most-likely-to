import { afterEach, describe, expect, it, vi } from "vitest";
import { contentLang, devPseudoLang, htmlLang, isLang, messages, plural } from "@/lib/i18n";

// The game's dictionary (S-27, english-version, context/changes/english-version/plan.md, Faza 1 #1 and #4;
// reviews/plan-review.md, F2). Oracle, written out by hand and never computed here: the Polish forms of a noun after a
// count as the game wrote them before the dictionary (src/lib/rooms/summary.ts' plural: 1 takes one; a count ending in
// 2-4, but not in 12-14, takes few; every other count, 0 included, takes many), the old phrases of the counts
// ("1 pytanie", "2 pytania", "5 pytań" of "Twoje gry"; "1 gracz" and "N graczy" for every other count of the open
// room's notice), the plan's contract of the languages (pl and en, the previews' pseudo language xx outside Lang and
// only in `astro dev`, <html lang> Polish under it, a question's sentence in its text's own language) and of the pseudo
// dictionary (every text in ⟦…⟧, a function's result too). In this phase English is Polish: the English dictionary
// comes in phase 4.

const PL = messages("pl");
const VOTES = { one: "głos", few: "głosy", many: "głosów" };

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("plural", () => {
  it.each([
    { count: 0, form: "głosów" },
    { count: 1, form: "głos" },
    { count: 2, form: "głosy" },
    { count: 4, form: "głosy" },
    { count: 5, form: "głosów" },
    { count: 12, form: "głosów" },
    { count: 14, form: "głosów" },
    { count: 21, form: "głosów" },
    { count: 22, form: "głosy" },
    { count: 102, form: "głosy" },
    { count: 112, form: "głosów" },
  ])("gives $count the Polish form $form, as the game's old three-form rule did", ({ count, form }) => {
    expect(plural("pl", count, VOTES)).toBe(form);
  });
});

describe("the dictionary's counts", () => {
  it.each([
    [1, "1 pytanie"],
    [2, "2 pytania"],
    [5, "5 pytań"],
    [12, "12 pytań"],
    [22, "22 pytania"],
  ])("says %i questions of a game as before: %s", (count, text) => {
    expect(PL.host.gameList.questions(count)).toBe(text);
  });

  // Every count but 1 said "graczy" before the dictionary ("2 graczy" too), and still does.
  it.each([
    [0, "0 graczy"],
    [1, "1 gracz"],
    [2, "2 graczy"],
    [5, "5 graczy"],
    [12, "12 graczy"],
    [22, "22 graczy"],
  ])("says %i players as before: %s", (count, text) => {
    expect(PL.common.players(count)).toBe(text);
  });

  it.each([
    [1, "1 głos"],
    [2, "2 głosy"],
    [5, "5 głosów"],
    [22, "22 głosy"],
  ])("says %i votes of the summary as before: %s", (count, text) => {
    expect(PL.round.summary.votes(count)).toBe(text);
  });

  // The proposals a player has left (ProposalForm): "została ci 1", and "zostały ci N" for every other count.
  it.each([
    [1, "została ci 1"],
    [2, "zostały ci 2"],
    [5, "zostały ci 5"],
    [12, "zostały ci 12"],
    [22, "zostały ci 22"],
  ])("says %i proposals left as before: %s", (count, text) => {
    expect(PL.room.proposalForm.left(count)).toBe(text);
  });

  // The screen reader's line on new requests (JoinRequests) and proposals (QuestionProposals): one by name, more
  // listed or counted, as before.
  it("names one request by its nick and lists more", () => {
    expect(PL.room.joinRequests.returning(["Kasia 🎉"])).toBe("Kasia 🎉 prosi o powrót na swoje miejsce.");
    expect(PL.room.joinRequests.returning(["Kasia 🎉", "Ola"])).toBe(
      "Proszą o powrót na swoje miejsce: Kasia 🎉, Ola.",
    );
    expect(PL.room.joinRequests.latecomers(["Kuba"])).toBe("Kuba prosi o wejście.");
    expect(PL.room.joinRequests.latecomers(["Kuba", "Zosia", "Igor", "Ola", "Bartek"])).toBe(
      "Proszą o wejście: Kuba, Zosia, Igor, Ola, Bartek.",
    );
  });

  it("names one new proposal by its author and counts more", () => {
    expect(PL.room.proposals.added(1, "Kuba")).toBe("Kuba proponuje pytanie.");
    expect(PL.room.proposals.added(2, "Kuba")).toBe("Nowe propozycje pytań: 2.");
    expect(PL.room.proposals.added(5, "Kuba")).toBe("Nowe propozycje pytań: 5.");
  });
});

describe("isLang", () => {
  it.each(["pl", "en"])("takes %s", (value) => {
    expect(isLang(value)).toBe(true);
  });

  // "constructor" is on Object.prototype: a lookup that is not a plain comparison would find it.
  it.each(["xx", "", null, undefined, "PL", "en-GB", "constructor", 1])("refuses %s", (value) => {
    expect(isLang(value)).toBe(false);
  });
});

describe("htmlLang", () => {
  it("declares a page in its own language, and the pseudo language as Polish underneath", () => {
    expect(htmlLang("pl")).toBe("pl");
    expect(htmlLang("en")).toBe("en");
    expect(htmlLang("xx")).toBe("pl");
  });
});

describe("contentLang", () => {
  it("puts a question's sentence together in its text's language, whatever the screen's", () => {
    expect(contentLang("pl", "pl")).toBe("pl");
    expect(contentLang("pl", "en")).toBe("pl");
    expect(contentLang("en", "pl")).toBe("en");
    expect(contentLang("en", "en")).toBe("en");
  });

  it("follows the pseudo language, so a preview shows the sentence's start in ⟦…⟧ too", () => {
    expect(contentLang("pl", "xx")).toBe("xx");
    expect(contentLang("en", "xx")).toBe("xx");
  });
});

describe("devPseudoLang", () => {
  it("turns the pseudo language on only for /dev/* with ?lang=xx", () => {
    expect(devPseudoLang(new URL("http://localhost:4321/dev/room-states?lang=xx"))).toBe("xx");
    expect(devPseudoLang(new URL("http://localhost:4321/dev/room-window?state=lobby-host&lang=xx"))).toBe("xx");
    expect(devPseudoLang(new URL("http://localhost:4321/dev/room-states"))).toBeNull();
    expect(devPseudoLang(new URL("http://localhost:4321/dev/room-states?lang=en"))).toBeNull();
    expect(devPseudoLang(new URL("http://localhost:4321/r/3f2b8c1e-7a4d-4e9b-9c2a-5d6e7f8a9b0c?lang=xx"))).toBeNull();
    expect(devPseudoLang(new URL("http://localhost:4321/?lang=xx"))).toBeNull();
  });

  it("never outside `astro dev`", () => {
    vi.stubEnv("DEV", false);
    expect(devPseudoLang(new URL("http://localhost:4321/dev/room-states?lang=xx"))).toBeNull();
  });
});

// Every path to a text of a dictionary, with what stands there: "string", "function" or, for anything else, its type.
function leaves(value: unknown, path = ""): Map<string, string> {
  if (typeof value === "string" || typeof value === "function") return new Map([[path, typeof value]]);
  if (value === null || typeof value !== "object") return new Map([[path, String(value)]]);
  return new Map(Object.entries(value).flatMap(([key, item]) => [...leaves(item, `${path}.${key}`)]));
}

function at(dictionary: unknown, path: string): unknown {
  return path
    .split(".")
    .slice(1)
    .reduce<unknown>((value, key) => (value as Record<string, unknown>)[key], dictionary);
}

describe("messages", () => {
  it("gives English the Polish dictionary in this phase", () => {
    expect(messages("en")).toBe(PL);
  });

  it("holds only texts and functions, in groups", () => {
    for (const kind of leaves(PL).values()) expect(["string", "function"]).toContain(kind);
  });
});

describe("the pseudo dictionary (/dev/*?lang=xx)", () => {
  const XX = messages("xx");

  it("wraps a text in ⟦…⟧", () => {
    expect(XX.link.tabTitle.join).toBe("⟦Dołącz do gry⟧");
    expect(XX.roomErrors.codes.room_full).toBe("⟦W tym pokoju jest już 50 graczy. Więcej się nie zmieści.⟧");
  });

  it("wraps a function's result in ⟦…⟧", () => {
    expect(XX.host.gameList.questions(5)).toBe("⟦5 pytań⟧");
    expect(XX.common.question.sentence("spóźniłby się na własne urodziny")).toBe(
      "⟦Kto z nas najprawdopodobniej spóźniłby się na własne urodziny?⟧",
    );
  });

  it("keeps the dictionary's groups and keys, and wraps every text of it", () => {
    const polish = leaves(PL);
    const pseudo = leaves(XX);

    expect([...pseudo.keys()]).toEqual([...polish.keys()]);
    for (const [path, kind] of pseudo) {
      expect(kind).toBe(polish.get(path));
      if (kind === "string") expect(at(XX, path)).toBe(`⟦${String(at(PL, path))}⟧`);
    }
  });

  it("is Polish outside `astro dev`", () => {
    vi.stubEnv("DEV", false);
    expect(messages("xx")).toBe(PL);
  });
});
