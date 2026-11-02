// risk: a leader removes a player (S-09, PRD FR-004; context/changes/remove-player-new-link/plan.md, Faza 3 #5): the
// removal reaches every screen without a reload, through the room's bell. During a vote the removed player who had not
// voted is no longer waited for, so with everyone else's votes in the round reveals itself; the removed player's screen
// lands outside the room, and the remover's focus goes on where the pressed button was. In the lobby a co-host removes
// a guest: the room gets a new link, the host's screen shows it without a reload, and the old one opens nothing.
// Expected counts are written out by hand from the test's votes. Laptop window only (project chromium).
// seed: tests/e2e/seed.spec.ts
import { test, expect, type Locator, type Page } from "@playwright/test";
import { LOBBY_POLL_MS } from "../../src/lib/live-sync/shared";
import {
  cohostSwitch,
  joinRoom,
  newGuestContext,
  nextListFetch,
  openRoom,
  outsideTitle,
  playerRow,
  removePlayer,
  uniqueNick,
} from "./support/room";
import {
  castVote,
  expectReveal,
  ROUND_UPDATE_MS,
  roundQuestion,
  startGame,
  voteConfirmation,
  type ExpectedReveal,
} from "./support/round";

// A leader's players' link in the lobby (PlayerLink).
function linkField(page: Page): Locator {
  return page.getByRole("textbox", { name: "Link dla graczy" });
}

test.describe("S-09 — a leader removes a player", () => {
  test("usunięcie w głosowaniu odsłania rundę: the host removes the one player who has not voted", async ({
    page,
    browser,
    baseURL,
  }) => {
    test.slow();

    // Setup: the host opens a room, Ola (A) and Kuba (B) join, the host starts the game.
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
    await startGame(page);
    await expect(roundQuestion(pageA)).toBeVisible({ timeout: ROUND_UPDATE_MS });
    await expect(roundQuestion(pageB)).toBeVisible({ timeout: ROUND_UPDATE_MS });
    const question = (await roundQuestion(page).textContent()) ?? "";

    // Setup: the host and Ola vote for Ola; Kuba does not vote, so the round waits for him.
    await castVote(page, nickA);
    await expect(voteConfirmation(page)).toBeVisible();
    await castVote(pageA, nickA);
    await expect(voteConfirmation(pageA)).toBeVisible();

    // Setup: Ola's screen loads again just before the removal and waits for its first list fetch, so a reveal shown
    // sooner than LOBBY_POLL_MS from now came with the bell (test-plan §6.4, "Bell vs poll").
    const listeningA = nextListFetch(pageA, room.id);
    const reloadedAt = Date.now();
    await pageA.reload();
    await listeningA;

    // Action: the host removes Kuba from the list "Gracze" (shown after the host's own vote).
    await removePlayer(page, nickB);

    // Assertion: the round reveals itself on Ola's screen without a reload, sooner than its own poll could have, and
    // without Kuba: Ola 2 votes, the host none, no abstention.
    const expected: ExpectedReveal = {
      question,
      votes: [
        [room.hostNick, 0],
        [nickA, 2],
      ],
      abstained: 0,
    };
    await expectReveal(pageA, expected);
    expect(Date.now() - reloadedAt, "the reveal reached Ola only after the poll could have run").toBeLessThan(
      LOBBY_POLL_MS,
    );

    // Assertion: the host sees the same reveal, with the focus on its title (the pressed button went away with the
    // vote's view).
    await expectReveal(page, expected);
    await expect(roundQuestion(page)).toBeFocused();

    // Assertion: Kuba's screen lands outside the room.
    await expect(outsideTitle(pageB)).toBeVisible({ timeout: ROUND_UPDATE_MS });

    // Cleanup: the guests' browsers close; the room and its players stay in the database until S-13.
    await guestA.close();
    await guestB.close();
  });

  test("współhost usuwa gracza, host widzi nowy link: the old link opens nothing", async ({
    page,
    browser,
    baseURL,
  }) => {
    test.slow();

    // Setup: the host opens a room, Ola (A) and Kuba (B) join, and the host makes Ola a co-host; her screen has the
    // same players' link as the host's.
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
    await cohostSwitch(page, nickA).click();
    await expect(cohostSwitch(page, nickA)).toHaveAttribute("aria-pressed", "true", { timeout: ROUND_UPDATE_MS });
    await expect(linkField(pageA)).toHaveValue(room.link, { timeout: ROUND_UPDATE_MS });

    // Setup: the host's screen loads again just before the removal and waits for its first list fetch ("Bell vs
    // poll").
    const hostListening = nextListFetch(page, room.id);
    const reloadedAt = Date.now();
    await page.reload();
    await hostListening;
    await expect(linkField(page)).toHaveValue(room.link);

    // Action: Ola removes Kuba, the last row of the list.
    await removePlayer(pageA, nickB);

    // Assertion: Ola's list has no Kuba and her focus is on the list's heading (no next row with "Usuń").
    await expect(playerRow(pageA, nickB)).toHaveCount(0, { timeout: ROUND_UPDATE_MS });
    await expect(pageA.getByRole("heading", { name: "Gracze (2)", exact: true })).toBeFocused();

    // Assertion: the host's screen shows a new link without a reload, sooner than its own poll could have, and Ola's
    // screen the same new one.
    await expect(linkField(page)).not.toHaveValue(room.link);
    expect(Date.now() - reloadedAt, "the new link reached the host only after the poll could have run").toBeLessThan(
      LOBBY_POLL_MS,
    );
    const newLink = await linkField(page).inputValue();
    expect(newLink).toMatch(/\/j\/[A-Za-z0-9_-]{22}$/);
    await expect(linkField(pageA)).toHaveValue(newLink);
    await expect(playerRow(page, nickB)).toHaveCount(0);

    // Assertion: Kuba's screen lands outside the room.
    await expect(outsideTitle(pageB)).toBeVisible({ timeout: ROUND_UPDATE_MS });

    // Assertion: the old link opens the page of a link that does not work, and the new one the join form.
    const stranger = await newGuestContext(browser);
    const strangerPage = await stranger.newPage();
    const oldLink = await strangerPage.goto(room.link);
    expect(oldLink?.status(), "the old link").toBe(404);
    await expect(strangerPage.getByRole("textbox", { name: "Twój nick" })).toHaveCount(0);
    await strangerPage.goto(newLink);
    await expect(strangerPage.getByRole("textbox", { name: "Twój nick" })).toBeVisible();

    // Cleanup: the browsers close; the room and its players stay in the database until S-13.
    await stranger.close();
    await guestA.close();
    await guestB.close();
  });
});
