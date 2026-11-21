// risk: the host's list of own games, the history of one ended game and the deletion of a game (lista własnych gier,
// historia gry, skasowanie gry; PRD FR-019 and FR-030; context/archive/2026-11-10-host-game-history/plan.md, Faza 3 #4,
// decisions 3, 5 and 7; context/changes/game-history-details/plan.md, Faza 3 #6 and Karol's picks of 2026-11-21):
// after a game of three questions with two guests (the first revealed with the guests' votes, the second skipped, the
// third cut short by the end of the game) the host goes from / to "Twoje gry" and finds the game's card there, with the
// guests' nicks and its three questions. "Historia" on the card opens the game's history: the evening's summary and
// the three questions in their order, the first with the counts its reveal showed the room, the second and third
// marked as skipped and cut short, nothing in motion, the page no wider than the window; "Twoje gry" leads back. "Usuń"
// opens the question with what goes and what stays, and "Anuluj" gives the focus back to "Usuń"; the second time "Usuń
// grę" deletes the game: its card goes away and the focus does not fall to the page's body. The guest who reloads the
// game's room page is told the game is gone (404), and the game's old link opens nothing (404). Laptop and phone window
// (projects chromium and phone). seed: tests/e2e/seed.spec.ts
import { test, expect, type Locator, type Page } from "@playwright/test";
import { deadLinkTitle, joinRoom, newGuestContext, openRoom, playerRow, uniqueNick } from "./support/room";
import {
  castVote,
  endGame,
  eveningEnd,
  expectFreshVote,
  expectGameSummary,
  HISTORY_SUMMARY,
  nextQuestion,
  resultTable,
  revealResult,
  ROUND_UPDATE_MS,
  roundQuestion,
  skipNotice,
  skipQuestion,
  startGame,
  voteConfirmation,
} from "./support/round";

// Tailwind's lg (64rem): from this window width the history in halves is wider than the phone's column.
const LG_WIDTH = 1024;

// One game's card on "Twoje gry" (HostGames), found by the nicks of its players: the e2e host has many ended games,
// one per test, and only these nicks are unique to this one.
function gameCard(page: Page, nicks: string[]): Locator {
  let card = page.getByRole("main").getByRole("listitem");
  for (const nick of nicks) card = card.filter({ hasText: nick });
  return card;
}

// A card's "Usuń": its name is the word, then the game's date (DeleteGameButton). "Usuń grę", the question's button,
// has no date.
function deleteButton(card: Locator): Locator {
  return card.getByRole("button", { name: /^Usuń grę: / });
}

function confirmButton(card: Locator): Locator {
  return card.getByRole("button", { name: "Usuń grę", exact: true });
}

// A card's "Historia": its name is the word, then the game's date, as "Usuń"'s (HostGames).
function historyLink(card: Locator): Locator {
  return card.getByRole("link", { name: /^Historia gry: / });
}

// The questions of the history, in the order of rounds: one item each in the list under "Pytania po kolei".
function historyQuestions(page: Page): Locator {
  return page.getByRole("region", { name: "Pytania po kolei", exact: true }).getByRole("listitem");
}

// A question of the history shows its reveal: exactly these players (header row aside) with these counts, and the
// abstentions, as the room's reveal showed them (the check of expectReveal, on the history's own table).
async function expectHistoryReveal(
  question: Locator,
  votes: [nick: string, count: number][],
  abstained: number,
): Promise<void> {
  const table = question.getByRole("table");
  await expect(table).toHaveCount(1);
  await expect(table.getByRole("row")).toHaveCount(votes.length + 1);
  for (const [nick, count] of votes) {
    const cell = table.getByRole("row").filter({ hasText: nick }).getByRole("cell").last();
    await expect(cell, `votes of ${nick}`).toHaveText(String(count));
  }
  await expect(question.getByText(`Wstrzymało się: ${String(abstained)}`, { exact: true })).toBeVisible();
}

// The first "Usuń" on the page: the list is a React island, so a press before it hydrates does nothing. Pressed until
// the question opens, as joinRoom retries the join form.
async function askToDelete(card: Locator): Promise<void> {
  await expect(async () => {
    if (await confirmButton(card).isVisible()) return;
    await deleteButton(card).click();
    await expect(confirmButton(card)).toBeVisible({ timeout: 2_000 });
  }).toPass();
}

// What has the focus, in words: the page's body (the focus was lost), a card's "Usuń", or the text of the element.
function focused(page: Page): Promise<string> {
  return page.evaluate(() => {
    const active = document.activeElement;
    if (active === null || active === document.body) return "the page's body";
    if (active instanceof HTMLElement && active.dataset.deleteGame !== undefined) return "a card's Usuń";
    return active.textContent.trim();
  });
}

test.describe("the host's list of own games — the host reads an ended game's history and deletes the game", () => {
  test("the host finds the game on „Twoje gry”, reads its history, deletes it after the question, and its guest is told it is gone", async ({
    page,
    browser,
    baseURL,
  }) => {
    // Four browsers, a game of three questions and its history take longer than the default 30 s on a slow runner.
    test.slow();

    // Setup: the signed-in host opens a fresh room; guests Ola (A) and Kuba (B) join it from browsers of their own.
    const room = await openRoom(page, baseURL);
    const nickA = uniqueNick("Ola");
    const nickB = uniqueNick("Kuba");
    const guestA = await newGuestContext(browser);
    const guestB = await newGuestContext(browser);
    const pageA = await guestA.newPage();
    const pageB = await guestB.newPage();
    await joinRoom(pageA, room.link, nickA);
    await joinRoom(pageB, room.link, nickB);
    await expect(playerRow(page, nickB)).toBeVisible();

    // Setup: the host starts the game. At question 1 Ola votes for Kuba and Kuba abstains; the host does not vote and
    // reveals the result ("Odsłoń wynik" before everyone voted).
    await startGame(page);
    await expect(roundQuestion(page)).toBeVisible({ timeout: ROUND_UPDATE_MS });
    const question1 = (await roundQuestion(page).textContent()) ?? "";
    await expect(roundQuestion(pageA)).toHaveText(question1, { timeout: ROUND_UPDATE_MS });
    await expect(roundQuestion(pageB)).toHaveText(question1, { timeout: ROUND_UPDATE_MS });
    await castVote(pageA, nickB);
    await expect(voteConfirmation(pageA)).toBeVisible();
    await castVote(pageB, null);
    await expect(voteConfirmation(pageB)).toBeVisible();
    await revealResult(page);
    await expect(resultTable(page)).toBeVisible({ timeout: ROUND_UPDATE_MS });

    // Setup: the host opens question 2 and skips it, then ends the game while question 3 is voting; Ola's tab shows the
    // end of the evening.
    await nextQuestion(page);
    await expectFreshVote(page);
    const question2 = (await roundQuestion(page).textContent()) ?? "";
    await skipQuestion(page);
    await expect(skipNotice(page)).toBeVisible({ timeout: ROUND_UPDATE_MS });
    const question3 = (await roundQuestion(page).textContent()) ?? "";
    expect(new Set([question1, question2, question3]).size, "the game repeats a question").toBe(3);
    await endGame(page);
    await expect(eveningEnd(page)).toBeVisible({ timeout: ROUND_UPDATE_MS });
    await expect(eveningEnd(pageA)).toBeVisible({ timeout: ROUND_UPDATE_MS });

    // Action: the host goes to / and opens "Twoje gry" under the "Nowa gra" card.
    await page.goto("/");
    await page.getByRole("link", { name: "Zobacz twoje gry", exact: true }).click();
    await page.waitForURL((url) => url.pathname === "/gry");
    await expect(page.getByRole("heading", { level: 1, name: "Twoje gry", exact: true })).toBeVisible();

    // Assertion: the game has one card, with the host's and both guests' nicks and the three questions it opened, the
    // skipped one and the one cut short included.
    const card = gameCard(page, [nickA, nickB]);
    await expect(card).toHaveCount(1);
    await expect(card).toContainText(room.hostNick);
    await expect(card).toContainText("3 pytania");

    // Action: "Historia" on the card. Its name ends with the card's date, the date the history shows.
    const date = ((await historyLink(card).getAttribute("aria-label")) ?? "").replace(/^Historia gry: /, "");
    expect(date, "the card's date").not.toBe("");
    await historyLink(card).click();
    await page.waitForURL((url) => url.pathname === `/gry/${room.id}`);

    // Assertion: the history's title, with the game's date under it.
    await expect(page.getByRole("heading", { level: 1, name: "Historia gry", exact: true })).toBeVisible();
    await expect(page.getByRole("main").getByText(date, { exact: true })).toBeVisible();

    // Assertion: the evening's summary from its only reveal, question 1: 1 question, 1 vote, Kuba with it, the host and
    // Ola with none, in seat order; the host's own nick has the badge "ty". Questions 2 and 3 add nothing.
    await expectGameSummary(
      page,
      room.hostNick,
      {
        counts: [
          ["Odsłoniętych pytań:", 1],
          ["Ilość głosów łącznie:", 1],
        ],
        top: [[nickB, "1 głos"]],
        unvoted: [room.hostNick, nickA],
      },
      HISTORY_SUMMARY,
    );

    // Assertion: the three questions in the order they were played, each as the room saw it. Oracle, from the votes
    // above: Kuba 1, the host 0, Ola 0 (zeros in seat order), one abstention.
    const questions = historyQuestions(page);
    await expect(questions).toHaveCount(3);
    await test.step("question 1 shows the counts of its reveal", async () => {
      await expect(questions.nth(0)).toContainText(question1);
      await expectHistoryReveal(
        questions.nth(0),
        [
          [nickB, 1],
          [room.hostNick, 0],
          [nickA, 0],
        ],
        1,
      );
    });
    await test.step("question 2 is marked as skipped, with no result", async () => {
      await expect(questions.nth(1)).toContainText(question2);
      await expect(questions.nth(1).getByText("Pytanie pominięte.", { exact: true })).toBeVisible();
      await expect(questions.nth(1).getByRole("table")).toHaveCount(0);
    });
    await test.step("question 3 is marked as cut short before its reveal, with no result", async () => {
      await expect(questions.nth(2)).toContainText(question3);
      await expect(questions.nth(2).getByText("Gra skończyła się przed odsłoną.", { exact: true })).toBeVisible();
      await expect(questions.nth(2).getByRole("table")).toHaveCount(0);
    });

    // Assertion: nothing on the page moves. The reveal's motion plays only when a new reveal reaches an open tab of the
    // room (AGENTS.md, "## UI"), and the history is a page just opened: no CSS animation, and no class of tw-animate-css
    // that would start one. Soft, so the window's check below still runs.
    expect
      .soft(
        await page.evaluate(
          () => document.getAnimations().filter((animation) => animation instanceof CSSAnimation).length,
        ),
        "CSS animations on the history",
      )
      .toBe(0);
    await expect.soft(page.locator('[class*="animate-in"]'), "motion classes on the history").toHaveCount(0);

    // Assertion: the history is laid out for the project's window (390×844 in phone, 1280×720 in chromium; only phone
    // below lg) and is no wider than it, so a phone's window does not scroll sideways (the check of question-list.spec.ts).
    await test.step("the history fits the window, with no sideways scroll", async () => {
      const viewport = test.info().project.use.viewport;
      if (!viewport) throw new Error("the project sets no window size");
      expect(viewport.width < LG_WIDTH, "only the phone project plays below lg").toBe(
        test.info().project.name === "phone",
      );
      expect(await page.evaluate(() => window.innerWidth), "the host's page width").toBe(viewport.width);
      const overflow = await page.evaluate(() => {
        const root = document.scrollingElement ?? document.documentElement;
        return root.scrollWidth - root.clientWidth;
      });
      expect.soft(overflow, "the history scrolls sideways").toBe(0);
    });

    // Action: "Twoje gry" back to the list.
    await page.getByRole("link", { name: "Twoje gry", exact: true }).click();
    await page.waitForURL((url) => url.pathname === "/gry");
    await expect(page.getByRole("heading", { level: 1, name: "Twoje gry", exact: true })).toBeVisible();
    await expect(card).toHaveCount(1);

    // Action: "Usuń".
    await askToDelete(card);

    // Assertion: the question says what goes and what stays (decision 7), "Usuń grę" has the focus, and the card's
    // "Usuń" is hidden while it asks.
    await expect(card.getByRole("alert").filter({ hasText: "Na pewno usunąć tę grę?" })).toBeVisible();
    await expect(card.getByText(/Zostaną tylko anonimowe liczniki pytań/)).toBeVisible();
    await expect(confirmButton(card)).toBeFocused();
    await expect(deleteButton(card)).toHaveCount(0);

    // Action: "Anuluj".
    await card.getByRole("button", { name: "Anuluj", exact: true }).click();

    // Assertion: the question is gone, and the focus is back on the card's "Usuń".
    await expect(confirmButton(card)).toHaveCount(0);
    await expect(deleteButton(card)).toBeFocused();

    // Action: "Usuń" again, then "Usuń grę".
    await deleteButton(card).click();
    await expect(confirmButton(card)).toBeFocused();
    await confirmButton(card).click();

    // Assertion: the deleted game's card is gone from the list, without a reload.
    await test.step("wiersza nie ma: the deleted game's card is gone from the list", async () => {
      await expect(gameCard(page, [nickA, nickB])).toHaveCount(0, { timeout: ROUND_UPDATE_MS });
    });

    // Assertion: the focus went on with the card, by the rule of focus.ts: the next card's "Usuń" or, with no card left,
    // the sentence of the empty list; never the page's body. The game was the newest, so no card is left above it to
    // send the focus to the title. A screen reader hears that the game is deleted.
    await expect
      .poll(() => focused(page), { message: "the host's focus after the deletion" })
      .toMatch(/^(a card's Usuń|Nie masz jeszcze zakończonych gier\.)$/);
    await expect(page.getByText("Gra usunięta.", { exact: true })).toBeAttached();

    // Action: Ola reloads the game's room page; her tab showed the end of the evening until then.
    const reloaded = await pageA.reload();

    // Assertion: the page tells her the game is gone (decision 5), with a 404.
    expect(reloaded?.status(), "the deleted game's room page").toBe(404);
    await expect(pageA.getByRole("heading", { level: 1, name: "Tej gry już nie ma.", exact: true })).toBeVisible();

    // Assertion: the game's old link, in a browser with no cookie of it, is a link that does not work (404).
    const stranger = await newGuestContext(browser);
    const strangerPage = await stranger.newPage();
    const oldLink = await strangerPage.goto(room.link);
    expect(oldLink?.status(), "the deleted game's old link").toBe(404);
    await expect(deadLinkTitle(strangerPage)).toBeVisible();

    // Cleanup: the browsers close. The game is deleted; the other tests' rooms stay in the database (no test deletes
    // its rooms afterwards), and CI runs on a throwaway local Supabase.
    await stranger.close();
    await guestA.close();
    await guestB.close();
  });
});
