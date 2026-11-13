// risk: game-length (context/changes/game-length/plan.md, Faza 3 #6), the game's length on every player's screen. The
// oracle is Karol's decisions of 2026-11-07 (change.md): in the lobby every player sees the number of the game's
// questions ("Liczba pytań: N"), and it changes on every screen at once when the host draws, adds or removes a
// question; at every question everyone reads "Pytanie N z T"; after the game's last question the database opens no
// next one, the leader has "Jeszcze 5 pytań" and no "Następne pytanie", a player with no role reads that the leader
// decides, and once pressed everyone goes on at "Pytanie 3 z 7"; a skipped question counts. Every number is written
// out by hand from the moves of this test, never counted. The lobby's bell is checked against the poll (test-plan
// §6.4, "Bell vs poll") at each of the three kinds of move: guest A's screen loads again just before it, and the new
// count must come sooner than A's own poll could have brought it. The room has two categories (40 questions without
// 18+): with one (20), the 16 questions the list ever held would leave 4 to add, and the button would say "Jeszcze 4
// pytania". Plays twice (playwright.config.ts): in a laptop's window (project chromium) and in a phone's (project
// phone, 390×844); every player's window is checked first.
// seed: tests/e2e/seed.spec.ts
import { test, expect, type Locator, type Page } from "@playwright/test";
import { CATEGORIES } from "../../src/data/questions";
import { ROOM_POLL_MS } from "../../src/lib/live-sync/shared";
import { joinRoom, newGuestContext, nextListFetch, openRoom, playerRow, uniqueNick } from "./support/room";
import {
  castVote,
  endGame,
  eveningEnd,
  expectFreshVote,
  nextQuestion,
  resultTable,
  ROUND_UPDATE_MS,
  roundQuestion,
  skipNotice,
  skipQuestion,
  startGame,
  voteConfirmation,
} from "./support/round";

// Tailwind's lg (64rem): from this window width the room has its wide layout (AGENTS.md "## UI").
const LG_WIDTH = 1024;
// The list "Przejrzyj pytania" draws, and the game's questions with no list (Karol's decision).
const LIST_LENGTH = 15;
// The host's own question, an ending after "Kto z nas najprawdopodobniej", within the 90 characters of a question.
const OWN_QUESTION = "przyniósłby na imprezę swoje krzesło";
// What a player with no role reads after the game's last question (Karol's variant G2), written out by hand.
const LAST_QUESTION = "To było ostatnie pytanie. Prowadzący zdecyduje, czy gramy dalej.";

// "Liczba pytań: N" under the lobby's subtitle, on every player's screen (Karol's variant 1C).
function questionCount(page: Page, count: number): Locator {
  return page.getByText(`Liczba pytań: ${String(count)}`, { exact: true });
}

// "Pytanie N z T" above the round's title, on the voting, the reveal and a skipped question (Karol's variant 2A).
function roundCounter(page: Page, number: number, total: number): Locator {
  return page.getByText(`Pytanie ${String(number)} z ${String(total)}`, { exact: true });
}

// The host's section "Pytania (N)" under "Przejrzyj pytania", once unfolded, and its rows in the order of the list.
function listRows(page: Page): Locator {
  return page.getByRole("region", { name: /^Pytania \(\d+\)$/ }).getByRole("listitem");
}

// A leader's "Jeszcze N pytań" after the game's last question.
function moreButton(page: Page): Locator {
  return page.getByRole("button", { name: /^Jeszcze \d+ pyta/ });
}

// Guest A's lobby loads again just before a host's move on the list, so its own poll comes no sooner than ROOM_POLL_MS
// after the returned moment, and a new count before that can only have come with the bell. The host's moves before
// this one rang the bell too, so the old page may still be fetching: the wait for the first fetch starts once the new
// document has come (commit), so it is the new page's, and awaiting it means the screen listens.
async function reloadListening(page: Page, roomId: string): Promise<number> {
  const loadedAt = Date.now();
  await page.reload({ waitUntil: "commit" });
  await nextListFetch(page, roomId);
  return loadedAt;
}

test.describe("game-length — every player sees how long the game is, and the leader decides after its last question", () => {
  test("the count follows the host's list in the lobby, every question says N of T, and Jeszcze 5 pytań goes on", async ({
    page,
    browser,
    baseURL,
  }) => {
    // Three browsers, 17 moves on the list, three questions and the end take longer than the default 30 s.
    test.slow();

    // Setup: the signed-in host opens a fresh room with two categories; guests A and B join it from browsers of their
    // own.
    const room = await openRoom(page, baseURL, [CATEGORIES[0].id, CATEGORIES[1].id]);
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
    const screens = [
      ["the host", page],
      ["guest A", pageA],
      ["guest B", pageB],
    ] as const;
    const guests = screens.slice(1);

    // Setup check: every player's window is the project's (390×844 in phone, 1280×720 in chromium), as in
    // game.spec.ts; a phone project played at a laptop's width would be a false green.
    const viewport = test.info().project.use.viewport;
    if (!viewport) throw new Error("the project sets no window size");
    expect(viewport.width < LG_WIDTH, "only the phone project plays below lg").toBe(
      test.info().project.name === "phone",
    );
    for (const [who, screen] of screens) {
      expect(screen.viewportSize(), `${who}'s window`).toEqual(viewport);
      expect(await screen.evaluate(() => window.innerWidth), `${who}'s page width`).toBe(viewport.width);
    }

    // Assertion: before anyone opens the list, every player sees a game of 15 questions.
    for (const [who, screen] of screens) {
      await test.step(`${who} sees 15 questions in the lobby`, async () => {
        await expect(questionCount(screen, LIST_LENGTH)).toBeVisible();
      });
    }

    // Setup: the host opens "Przejrzyj pytania", which draws the list of 15 and changes no count.
    await page.getByRole("button", { name: "Przejrzyj pytania", exact: true }).click();
    await expect(listRows(page)).toHaveCount(LIST_LENGTH, { timeout: ROUND_UPDATE_MS });

    // Action: with guest A's screen just loaded and listening, the host draws one more question.
    let loadedA = await reloadListening(pageA, room.id);
    await expect(questionCount(pageA, 15)).toBeVisible();
    await page.getByRole("button", { name: "Dolosuj pytanie", exact: true }).click();

    // Assertion: A sees 16 before her own poll could have brought it, and the host's list has the 16th row.
    await expect(questionCount(pageA, 16)).toBeVisible({ timeout: ROUND_UPDATE_MS });
    expect(Date.now() - loadedA, "guest A saw 16 only after her own poll could have run").toBeLessThan(ROOM_POLL_MS);
    await expect(listRows(page)).toHaveCount(16, { timeout: ROUND_UPDATE_MS });
    await expect(questionCount(page, 16)).toBeVisible();

    // Action: the same, and the host adds an own question.
    loadedA = await reloadListening(pageA, room.id);
    await expect(questionCount(pageA, 16)).toBeVisible();
    const region = page.getByRole("region", { name: /^Pytania \(\d+\)$/ });
    await region.getByRole("textbox", { name: "Dodaj własne pytanie" }).fill(OWN_QUESTION);
    await region.getByRole("button", { name: "Dodaj", exact: true }).click();

    // Assertion: A sees 17 before her own poll could have brought it.
    await expect(questionCount(pageA, 17)).toBeVisible({ timeout: ROUND_UPDATE_MS });
    expect(Date.now() - loadedA, "guest A saw 17 only after her own poll could have run").toBeLessThan(ROOM_POLL_MS);
    await expect(listRows(page)).toHaveCount(17, { timeout: ROUND_UPDATE_MS });

    // Setup: the host removes the list's first row until 3 are left; each row goes once its removal is accepted.
    for (let left = 17; left > 3; left -= 1) {
      await listRows(page).first().getByRole("button", { name: "Usuń", exact: true }).click();
      await expect(listRows(page)).toHaveCount(left - 1, { timeout: ROUND_UPDATE_MS });
    }
    await expect(questionCount(page, 3)).toBeVisible({ timeout: ROUND_UPDATE_MS });

    // Action: the same, and the host removes one more.
    loadedA = await reloadListening(pageA, room.id);
    await expect(questionCount(pageA, 3)).toBeVisible();
    await listRows(page).first().getByRole("button", { name: "Usuń", exact: true }).click();

    // Assertion: A sees 2 before her own poll could have brought it; the host and B see 2 as well.
    await expect(questionCount(pageA, 2)).toBeVisible({ timeout: ROUND_UPDATE_MS });
    expect(Date.now() - loadedA, "guest A saw 2 only after her own poll could have run").toBeLessThan(ROOM_POLL_MS);
    await expect(questionCount(page, 2)).toBeVisible({ timeout: ROUND_UPDATE_MS });
    await expect(questionCount(pageB, 2)).toBeVisible({ timeout: ROUND_UPDATE_MS });

    // Action: the host starts the game.
    await startGame(page);

    // Assertion: everyone is at question 1 of 2.
    for (const [who, screen] of screens) {
      await test.step(`${who} is at question 1 of 2`, async () => {
        await expect(roundCounter(screen, 1, 2)).toBeVisible({ timeout: ROUND_UPDATE_MS });
      });
    }
    const question1 = (await roundQuestion(page).textContent()) ?? "";

    // Action: question 1 played to its reveal: A for B, B for A, and the host's vote last reveals it by itself.
    await castVote(pageA, nickB);
    await expect(voteConfirmation(pageA)).toBeVisible();
    await castVote(pageB, nickA);
    await expect(voteConfirmation(pageB)).toBeVisible();
    await castVote(page, nickA);

    // Assertion: the reveal still says 1 of 2; question 1 is not the last one, so the host goes on as before and no
    // guest is told the game stopped.
    for (const [who, screen] of screens) {
      await test.step(`${who} sees the reveal of question 1 of 2`, async () => {
        await expect(resultTable(screen)).toBeVisible({ timeout: ROUND_UPDATE_MS });
        await expect(roundCounter(screen, 1, 2)).toBeVisible();
      });
    }
    await expect(moreButton(page)).toHaveCount(0);
    for (const [, screen] of guests) await expect(screen.getByText(LAST_QUESTION, { exact: true })).toHaveCount(0);

    // Action: the host opens question 2, and it is played to its reveal the same way.
    await nextQuestion(page);
    for (const [who, screen] of screens) {
      await test.step(`${who} is at question 2 of 2`, async () => {
        await expect(roundCounter(screen, 2, 2)).toBeVisible({ timeout: ROUND_UPDATE_MS });
        await expectFreshVote(screen);
      });
    }
    const question2 = (await roundQuestion(page).textContent()) ?? "";
    await castVote(pageA, nickB);
    await expect(voteConfirmation(pageA)).toBeVisible();
    await castVote(pageB, nickA);
    await expect(voteConfirmation(pageB)).toBeVisible();
    await castVote(page, nickA);
    for (const [, screen] of screens) await expect(resultTable(screen)).toBeVisible({ timeout: ROUND_UPDATE_MS });

    // Assertion: after the game's last question the host has "Jeszcze 5 pytań" and "Zakończ grę", no "Następne
    // pytanie"; each guest reads that the leader decides, and has no button of the leader's.
    await expect(moreButton(page)).toHaveText("Jeszcze 5 pytań");
    await expect(page.getByRole("button", { name: "Zakończ grę", exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: "Następne pytanie", exact: true })).toHaveCount(0);
    await expect(page.getByText(LAST_QUESTION, { exact: true })).toHaveCount(0);
    for (const [who, screen] of guests) {
      await test.step(`${who} reads that the leader decides`, async () => {
        await expect(screen.getByText(LAST_QUESTION, { exact: true })).toBeVisible();
        await expect(moreButton(screen)).toHaveCount(0);
      });
    }

    // Action: the host presses "Jeszcze 5 pytań" once; it asks nothing.
    await moreButton(page).click();

    // Assertion: everyone goes on at question 3 of 7, a question this game has not played, ready for a fresh vote.
    for (const [who, screen] of screens) {
      await test.step(`${who} is at question 3 of 7`, async () => {
        await expect(roundCounter(screen, 3, 7)).toBeVisible({ timeout: ROUND_UPDATE_MS });
        await expectFreshVote(screen);
      });
    }
    const question3 = (await roundQuestion(page).textContent()) ?? "";
    expect(question3, "question 3 repeats question 1").not.toBe(question1);
    expect(question3, "question 3 repeats question 2").not.toBe(question2);

    // Action: the host skips question 3.
    await skipQuestion(page);

    // Assertion: the skipped question counts: everyone is at question 4 of 7, with the note of the skip.
    for (const [who, screen] of screens) {
      await test.step(`${who} is at question 4 of 7 after the skip`, async () => {
        await expect(roundCounter(screen, 4, 7)).toBeVisible({ timeout: ROUND_UPDATE_MS });
        await expect(skipNotice(screen)).toBeVisible();
      });
    }

    // Action: the host ends the game.
    await endGame(page);

    // Assertion: every screen shows the end of the evening.
    for (const [who, screen] of screens) {
      await test.step(`${who} sees the end of the evening`, async () => {
        await expect(eveningEnd(screen)).toBeVisible({ timeout: ROUND_UPDATE_MS });
      });
    }

    // Cleanup: both guests' browsers close. The room, its players, its list and the counts of its reveals stay in the
    // database, because no test deletes its rooms afterwards; the next test's room closes this one. CI runs on a
    // throwaway local Supabase; unique nicks keep runs apart.
    await guestA.close();
    await guestB.close();
  });
});
