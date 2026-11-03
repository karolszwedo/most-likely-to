// risk: test-plan.md #2 and #3, the evening on the players' screens: after "Następne pytanie" and after a skip every
// screen shows the same new question, one this game has not played yet (FR-015), ready for a fresh vote; after a skip
// every screen says its votes are gone; "Zakończ grę" ends the evening on every screen (PRD FR-006; decisions D2 and D4
// of context/archive/2026-10-15-full-game-evening/research.md), with a summary from the game's reveals only (PRD
// FR-022, S-15). One time is checked: guest B gets the next question from the room's bell, before its own poll could
// have run (test-plan §6.4, "Bell vs poll"). The 2 s budget is the probe's. The evening plays twice
// (playwright.config.ts): in a laptop's window (project chromium) and in a phone's (project phone, 390×844), where the
// room has the layout below lg; every player's window is checked first.
// seed: tests/e2e/seed.spec.ts
import { test, expect } from "@playwright/test";
import { ROOM_POLL_MS } from "../../src/lib/live-sync/shared";
import { joinRoom, newGuestContext, nextListFetch, openRoom, playerRow, uniqueNick } from "./support/room";
import {
  castVote,
  endGame,
  eveningEnd,
  expectFreshVote,
  expectGameSummary,
  nextQuestion,
  questionThumb,
  resultTable,
  ROUND_UPDATE_MS,
  roundQuestion,
  skipNotice,
  skipQuestion,
  startGame,
  voteConfirmation,
} from "./support/round";

// Tailwind's lg (64rem): from this window width the room has its wide layout and the host's bar (AGENTS.md "## UI").
const LG_WIDTH = 1024;

test.describe("risks #2 and #3 (evening) — three players go on to the next question, skip one and end the game", () => {
  test("every screen gets the same new question after Następne pytanie and after a skip, and the end of the evening", async ({
    page,
    browser,
    baseURL,
  }) => {
    // Three browsers, three questions and the end take longer than the default 30 s on a slow runner.
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
    // Each screen with its player's nick.
    const screens = [
      ["the host", page, room.hostNick],
      ["guest A", pageA, nickA],
      ["guest B", pageB, nickB],
    ] as const;
    const guests = screens.slice(1);

    // Setup check: every player's window is the project's (390×844 in phone, 1280×720 in chromium). The guests'
    // contexts take it from the project's `use`; a phone project played at a laptop's width would be a false green.
    const viewport = test.info().project.use.viewport;
    if (!viewport) throw new Error("the project sets no window size");
    expect(viewport.width < LG_WIDTH, "only the phone project plays below lg").toBe(
      test.info().project.name === "phone",
    );
    for (const [who, screen] of screens) {
      expect(screen.viewportSize(), `${who}'s window`).toEqual(viewport);
      expect(await screen.evaluate(() => window.innerWidth), `${who}'s page width`).toBe(viewport.width);
    }

    // Setup: question 1 played to its reveal. A votes for B and B abstains; the host's vote is the last one and
    // reveals the round by itself. The counts are round.spec.ts's; here every screen only has to be on the reveal.
    await startGame(page);
    await expect(roundQuestion(page)).toBeVisible({ timeout: ROUND_UPDATE_MS });
    const question1 = (await roundQuestion(page).textContent()) ?? "";
    for (const [, screen] of guests) {
      await expect(roundQuestion(screen)).toHaveText(question1, { timeout: ROUND_UPDATE_MS });
    }
    await castVote(pageA, nickB);
    await expect(voteConfirmation(pageA)).toBeVisible();
    await castVote(pageB, null);
    await expect(voteConfirmation(pageB)).toBeVisible();
    await castVote(page, nickA);
    for (const [, screen] of screens) {
      await expect(resultTable(screen)).toBeVisible({ timeout: ROUND_UPDATE_MS });
    }

    // Action and assertion (S-11, PRD FR-018): guest A gives the question a thumb up and takes it back. The screen
    // presses it only once the database has it, and nothing waits for it: the host moves on below as before.
    await questionThumb(pageA, "up").click();
    await expect(questionThumb(pageA, "up")).toHaveAttribute("aria-pressed", "true");
    await expect(questionThumb(pageA, "down")).toHaveAttribute("aria-pressed", "false");
    await questionThumb(pageA, "up").click();
    await expect(questionThumb(pageA, "up")).toHaveAttribute("aria-pressed", "false");

    // From lg the host's buttons are a bar stuck to the window's bottom (HostActions, placement "bar"): in a window
    // too short for the reveal, "Następne pytanie" is in view at the top of the page. Without the bar it would be
    // below the window's edge. A phone's window has no bar.
    if (viewport.width >= LG_WIDTH) {
      await page.setViewportSize({ width: viewport.width, height: 400 });
      await page.evaluate(() => {
        window.scrollTo(0, 0);
      });
      expect(
        await page.evaluate(() => document.documentElement.scrollHeight),
        "the reveal is taller than the window",
      ).toBeGreaterThan(400);
      await expect(page.getByRole("button", { name: "Następne pytanie", exact: true })).toBeInViewport({ ratio: 1 });
      await page.setViewportSize(viewport);
    }

    // Setup: guest B's screen loads again, on the reveal. Its own poll then comes no sooner than ROOM_POLL_MS after
    // this moment, so a new question before that can only have come with the bell. Waiting for its first fetch means
    // the screen is listening; the wait starts before the reload.
    const listening = nextListFetch(pageB, room.id);
    const loadedB = Date.now();
    await pageB.reload();
    await listening;
    await expect(resultTable(pageB)).toBeVisible();

    // Action: the host opens the next question.
    await nextQuestion(page);

    // Assertion: question 2 is not question 1, and guest B has it before its own poll could have run.
    await expectFreshVote(page);
    const question2 = (await roundQuestion(page).textContent()) ?? "";
    expect(question2, "question 2 repeats question 1").not.toBe(question1);
    await expect(roundQuestion(pageB)).toHaveText(question2, { timeout: ROUND_UPDATE_MS });
    expect(Date.now() - loadedB, "guest B got question 2 only after its own poll could have run").toBeLessThan(
      ROOM_POLL_MS,
    );
    await expect(roundQuestion(pageA)).toHaveText(question2, { timeout: ROUND_UPDATE_MS });
    // A voted at question 1, and her screen asks again: nothing chosen, nothing cast.
    for (const [who, screen] of screens) {
      await test.step(`${who} can vote at question 2`, async () => {
        await expectFreshVote(screen);
      });
    }

    // Action: A votes at question 2, then the host skips it.
    await castVote(pageA, nickA);
    await expect(voteConfirmation(pageA)).toBeVisible();
    await skipQuestion(page);

    // Assertion: every screen shows the same question 3, other than both before it, says that question 2 was skipped
    // with its votes, and asks for a fresh vote, A's screen too. The host's form was fresh already, so the note is what
    // tells that the host's screen moved on.
    await expect(skipNotice(page)).toBeVisible({ timeout: ROUND_UPDATE_MS });
    const question3 = (await roundQuestion(page).textContent()) ?? "";
    expect(question3, "question 3 repeats question 1").not.toBe(question1);
    expect(question3, "question 3 repeats question 2").not.toBe(question2);
    for (const [, screen] of guests) {
      await expect(roundQuestion(screen)).toHaveText(question3, { timeout: ROUND_UPDATE_MS });
    }
    for (const [who, screen] of screens) {
      await test.step(`${who} sees the skip note and can vote at question 3`, async () => {
        await expect(skipNotice(screen)).toBeVisible();
        await expectFreshVote(screen);
      });
    }

    // Action: the host ends the game while question 3 is voting.
    await endGame(page);

    // Assertion: every screen shows the end of the evening; only the host gets "Nowa gra", a guest is told to ask the
    // host for a new link.
    for (const [who, screen] of screens) {
      await test.step(`${who} sees the end of the evening`, async () => {
        await expect(eveningEnd(screen)).toBeVisible({ timeout: ROUND_UPDATE_MS });
      });
    }

    // Assertion: every screen sums up the game from its only reveal, question 1: A 1 vote (the host's), B 1 (A's), the
    // host none, B abstained. Question 2 was skipped with A's vote for herself and question 3 was cut short, so neither
    // counts: 1 question, 2 votes, A and B with 1 each in seat order and no "pozostali", and the host has none.
    for (const [who, screen, me] of screens) {
      await test.step(`${who} sees the game's summary`, async () => {
        await expectGameSummary(screen, me, {
          counts: [
            ["Odsłoniętych pytań:", 1],
            ["Ilość głosów łącznie:", 2],
          ],
          top: [
            [nickA, "1 głos"],
            [nickB, "1 głos"],
          ],
          unvoted: [room.hostNick],
        });
      });
    }
    await expect(page.getByRole("link", { name: "Nowa gra", exact: true })).toBeVisible();
    for (const [who, screen] of guests) {
      await test.step(`${who} is asked to get a new link from the host`, async () => {
        await expect(
          screen.getByText("Chcesz zagrać jeszcze raz? Poproś hosta o nowy link.", { exact: true }),
        ).toBeVisible();
        await expect(screen.getByRole("link", { name: "Nowa gra", exact: true })).toHaveCount(0);
      });
    }

    // Assertion: the room's old link only says the game is over, also to guest A, who has the room's cookie.
    const linkAnswer = await pageA.goto(room.link);
    expect(linkAnswer?.status(), "the old link's status").toBe(410);
    await expect(
      pageA.getByRole("heading", { level: 1, name: "Ta gra już się skończyła.", exact: true }),
    ).toBeVisible();

    // Cleanup: both guests' browsers close. The room, its players and question 1's counts stay in the database, because
    // nothing can delete them yet (S-13). CI runs on a throwaway local Supabase; unique nicks keep runs apart.
    await guestA.close();
    await guestB.close();
  });
});
