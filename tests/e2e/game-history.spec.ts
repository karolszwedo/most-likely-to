// risk: the host's list of own games and the deletion of a game (lista własnych gier, skasowanie gry; PRD FR-019;
// context/changes/host-game-history/plan.md, Faza 3 #4, decisions 3, 5 and 7): after a game with two guests the host
// goes from / to "Twoje gry" and finds the game's card there, with the guests' nicks. "Usuń" opens the question with
// what goes and what stays, and "Anuluj" gives the focus back to "Usuń"; the second time "Usuń grę" deletes the game:
// its card goes away and the focus does not fall to the page's body. The guest who reloads the game's room page is told
// the game is gone (404), and the game's old link opens nothing (404). Laptop and phone window (projects chromium and
// phone).
// seed: tests/e2e/seed.spec.ts
import { test, expect, type Locator, type Page } from "@playwright/test";
import { deadLinkTitle, joinRoom, newGuestContext, openRoom, playerRow, uniqueNick } from "./support/room";
import { endGame, eveningEnd, ROUND_UPDATE_MS, roundQuestion, startGame } from "./support/round";

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

test.describe("the host's list of own games — the host deletes an ended game", () => {
  test("the host finds the game on „Twoje gry”, deletes it after the question, and its guest is told it is gone", async ({
    page,
    browser,
    baseURL,
  }) => {
    // Four browsers and a game take longer than the default 30 s on a slow runner.
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

    // Setup: the host starts the game and ends it during the first question; Ola's tab shows the end of the evening.
    await startGame(page);
    await expect(roundQuestion(page)).toBeVisible({ timeout: ROUND_UPDATE_MS });
    await endGame(page);
    await expect(eveningEnd(page)).toBeVisible({ timeout: ROUND_UPDATE_MS });
    await expect(eveningEnd(pageA)).toBeVisible({ timeout: ROUND_UPDATE_MS });

    // Action: the host goes to / and opens "Twoje gry" under the "Nowa gra" card.
    await page.goto("/");
    await page.getByRole("link", { name: "Zobacz twoje gry", exact: true }).click();
    await page.waitForURL((url) => url.pathname === "/gry");
    await expect(page.getByRole("heading", { level: 1, name: "Twoje gry", exact: true })).toBeVisible();

    // Assertion: the game has one card, with the host's and both guests' nicks and the one question it opened.
    const card = gameCard(page, [nickA, nickB]);
    await expect(card).toHaveCount(1);
    await expect(card).toContainText(room.hostNick);
    await expect(card).toContainText("1 pytanie");

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
