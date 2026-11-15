// risk: test-plan.md #2 and #3, the round on the players' screens: everyone in the room sees the same question, every
// vote goes through a screen, and everyone sees the same reveal, with counts that follow the votes (PRD FR-009, US-01).
// A vote takes "Zagłosuj" away, so the voter's focus goes to the view's title, the reveal's after the last vote.
// The reveal comes in with its motion only on a screen where the voting turned into it in the open tab and only when the
// system allows motion (reveal-ui): not for guest A, whose tab asks for reduced motion, nor for guest B after a reload.
// No time is measured here: the 2 s budget is the probe's, on production (test-plan §6.4, "No 2 s here").
// seed: tests/e2e/seed.spec.ts
import { test, expect } from "@playwright/test";
import { joinRoom, newGuestContext, nextListFetch, openRoom, playerRow, uniqueNick } from "./support/room";
import {
  castVote,
  expectReveal,
  revealMotion,
  ROUND_UPDATE_MS,
  roundQuestion,
  startGame,
  voteConfirmation,
  type ExpectedReveal,
} from "./support/round";

test.describe("risks #2 and #3 (round) — three players play one round on their own screens", () => {
  test("the host and two guests see the same question and the same reveal, with counts that follow their votes", async ({
    page,
    browser,
    baseURL,
  }) => {
    // Three browsers, two joins and three votes take longer than the default 30 s on a slow runner.
    test.slow();

    // Setup: the signed-in host opens a fresh room; guests A and B join it from browsers of their own.
    const room = await openRoom(page, baseURL);
    const nickA = uniqueNick("Ola");
    const nickB = uniqueNick("Kuba");
    const guestA = await newGuestContext(browser);
    const guestB = await newGuestContext(browser);
    const pageA = await guestA.newPage();
    const pageB = await guestB.newPage();
    await joinRoom(pageA, room.link, nickA);
    await joinRoom(pageB, room.link, nickB);
    await expect(playerRow(page, nickA)).toBeVisible();
    await expect(playerRow(page, nickB)).toBeVisible();

    // Action: the host starts the game.
    await startGame(page);

    // Assertion: all three screens show the same question.
    await expect(roundQuestion(page)).toBeVisible({ timeout: ROUND_UPDATE_MS });
    const question = (await roundQuestion(page).textContent()) ?? "";
    await expect(roundQuestion(pageA)).toHaveText(question, { timeout: ROUND_UPDATE_MS });
    await expect(roundQuestion(pageB)).toHaveText(question, { timeout: ROUND_UPDATE_MS });

    // Setup for the motion: guest A's system asks for reduced motion, before the round is revealed, so A's reveal
    // mounts under it.
    await pageA.emulateMedia({ reducedMotion: "reduce" });

    // Action: the host votes for A, A for themselves (allowed, FR-009), and B abstains. Each screen confirms its own
    // vote; B's vote is the last one, which reveals the round by itself, so no one presses "Odsłoń wynik". "Zagłosuj"
    // goes away with the vote, so the focus goes to the question, the view's title, not to the page's start
    // (scroll-and-focus-fixes); not to "Głos oddany", an alert already read out. Soft, so every screen is checked in
    // one run.
    await castVote(page, nickA);
    await expect(voteConfirmation(page)).toContainText(`Twój głos: ${nickA}.`);
    await expect.soft(roundQuestion(page), "the host's focus after the vote").toBeFocused();
    await castVote(pageA, nickA);
    await expect(voteConfirmation(pageA)).toContainText(`Twój głos: ${nickA}.`);
    await expect.soft(roundQuestion(pageA), "guest A's focus after the vote").toBeFocused();
    await castVote(pageB, null);

    // Assertion: every screen shows the same reveal. Oracle, from the votes above: A 2, the host 0, B 0, one abstention.
    const reveal: ExpectedReveal = {
      question,
      votes: [
        [nickA, 2],
        [room.hostNick, 0],
        [nickB, 0],
      ],
      abstained: 1,
    };
    for (const [who, screen] of [
      ["the host", page],
      ["guest A", pageA],
      ["guest B", pageB],
    ] as const) {
      await test.step(`${who} sees the reveal`, async () => {
        await expectReveal(screen, reveal);
      });
    }

    // Assertion: B's vote took the voting view away with it, so B's focus is on the reveal's title, the question; the
    // voting's title is gone by now, so this is the new view's.
    await expect.soft(roundQuestion(pageB), "guest B's focus after the vote that revealed the round").toBeFocused();

    // Assertion: the reveal came in with its motion only where the voting turned into it in the open tab and the system
    // allows motion (Karol's pick and the session's rule of 2026-11-15, reveal-ui): on the host's and B's screens, not
    // on A's under reduced motion. The oracle is that rule, "some motion" or "none", never the classes of
    // src/components/room/reveal-motion.ts. Soft, so every screen is checked in one run.
    expect.soft(await revealMotion(page), "motion on the reveal in the open tab: the host").toBeGreaterThan(0);
    expect.soft(await revealMotion(pageB), "motion on the reveal in the open tab: guest B").toBeGreaterThan(0);
    expect.soft(await revealMotion(pageA), "no motion on the reveal under reduced motion: guest A").toBe(0);

    // Action: B reloads the page on the reveal. The first fetch of the reloaded screen comes after the island has
    // hydrated (nextListFetch), so motion that only the browser's code would add is there by then too.
    const listeningB = nextListFetch(pageB, room.id);
    await pageB.reload();
    await listeningB;
    await expectReveal(pageB, reveal);

    // Assertion: after a reload the reveal stands still (S-04: the screen opens on the reveal, nothing was revealed in
    // this tab).
    expect.soft(await revealMotion(pageB), "no motion on the reveal after a reload: guest B").toBe(0);

    // Cleanup: both guests' browsers close. The room, its players and the round's counts stay in the database, because
    // no test deletes its rooms afterwards. CI runs on a throwaway local Supabase; unique nicks keep runs apart.
    await guestA.close();
    await guestB.close();
  });
});
