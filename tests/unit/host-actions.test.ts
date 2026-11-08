import { describe, expect, it, vi } from "vitest";
import { afterRoundActions, moreQuestionsAction, type AfterRound } from "@/components/room/HostActions";
import type { ActionOutcome } from "@/components/room/room-actions";

// A leader's buttons once no round is voting, the reveal's and a skipped question's (game-length,
// context/changes/game-length/plan.md, Faza 3 #3). The oracle is Karol's decisions (change.md): before the game's
// last question "Następne pytanie" and "Zakończ grę"; after it "Zakończ grę" as the main button first and then
// "Jeszcze N pytań" (variant 3B of 2026-11-07), N being what the Worker counted it can add, one press with no question;
// with nothing to add "Zakończ grę" alone with the note that the questions ran out. The buttons are told apart by their
// ids; the labels of "Jeszcze N pytań" are checked word for word, written out by hand, because the form of "pytanie"
// after N is the behaviour here (e2e with a pool of 40 only ever shows 5).

type Moves = Pick<AfterRound, "onNext" | "onMore" | "onEnd">;

function ok(): Promise<ActionOutcome> {
  return Promise.resolve({ ok: true });
}

// The buttons for this state, and the handlers they were given, to tell which one a button calls.
function after(questionsLeft: boolean, moreQuestions: number | null) {
  const calls: Moves = { onNext: vi.fn(ok), onMore: vi.fn(ok), onEnd: vi.fn(ok) };
  return { ...afterRoundActions({ questionsLeft, moreQuestions, ...calls }), calls };
}

describe("afterRoundActions", () => {
  it("offers the next question and the end before the game's last question", () => {
    const { actions, note } = after(true, null);

    expect(actions.map(({ id }) => id)).toEqual(["next", "end"]);
    expect(actions.map(({ variant }) => variant)).toEqual(["default", "outline"]);
    expect(note).toBeUndefined();
  });

  it.each([5, 3, 1])(
    "after the game's last question with %i to add: the end as the main button, then more",
    (count) => {
      const { actions, note } = after(false, count);

      expect(actions.map(({ id }) => id)).toEqual(["end", "more"]);
      expect(actions.map(({ variant }) => variant)).toEqual(["default", "outline"]);
      expect(note).toBeUndefined();
    },
  );

  it("offers only the end, with the note, when nothing is left to add", () => {
    for (const moreQuestions of [0, null]) {
      const { actions, note } = after(false, moreQuestions);

      expect(actions.map(({ id }) => id)).toEqual(["end"]);
      expect(note).toBeTruthy();
    }
  });

  it("never offers more while a question is left, whatever the count", () => {
    expect(after(true, 5).actions.map(({ id }) => id)).not.toContain("more");
  });

  it("ends the game only after a question, and adds questions with one press", () => {
    const { actions } = after(false, 5);
    const [end, more] = actions;

    expect(end.confirmText).toBeTruthy();
    expect(more.confirmText).toBeUndefined();
  });

  it("sends each move to its own handler", async () => {
    const last = after(false, 3);
    await Promise.all(last.actions.map((action) => action.run()));
    expect(last.calls.onEnd).toHaveBeenCalledTimes(1);
    expect(last.calls.onMore).toHaveBeenCalledTimes(1);
    expect(last.calls.onNext).not.toHaveBeenCalled();

    const before = after(true, null);
    await Promise.all(before.actions.map((action) => action.run()));
    expect(before.calls.onNext).toHaveBeenCalledTimes(1);
    expect(before.calls.onEnd).toHaveBeenCalledTimes(1);
    expect(before.calls.onMore).not.toHaveBeenCalled();
  });
});

describe("moreQuestionsAction", () => {
  it.each([
    [1, "Jeszcze 1 pytanie"],
    [3, "Jeszcze 3 pytania"],
    [5, "Jeszcze 5 pytań"],
  ])("says how many it adds: %i", (count, label) => {
    expect(moreQuestionsAction(count, ok).label).toBe(label);
  });
});
