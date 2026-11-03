// risk: a player who reloads the page or whose connection drops is back in the current round on their own nick within
// 10 s (S-04, PRD US-01, FR-011; context/changes/rejoin-after-refresh/plan.md, Faza 1 #4, Faza 2 #4). A reload with the
// room's cookie lands on the same nick with the vote already cast, and the same tab still says whom the player voted
// for, from its sessionStorage (decision D1), which forgets it at the reveal; a socket that died quietly (open, but
// nothing comes through: realtime-js notices only after 25–50 s) still gets the round's next phase from the screen's
// own poll, every ROOM_POLL_MS. Laptop window only (project chromium).
// seed: tests/e2e/seed.spec.ts
import { test, expect, type Page } from "@playwright/test";
import { joinRoom, newGuestContext, nextListFetch, openRoom, playerRow, uniqueNick } from "./support/room";
import { sleepableRealtime } from "./support/realtime";
import {
  castVote,
  resultTable,
  revealResult,
  ROUND_UPDATE_MS,
  roundQuestion,
  startGame,
  voteConfirmation,
} from "./support/round";

// The tab's own entry of the player's vote in the room (src/lib/rooms/my-vote.ts), as stored, or null with none.
function storedVote(page: Page, roomId: string): Promise<string | null> {
  return page.evaluate((key) => sessionStorage.getItem(key), `mlt-my-vote:${roomId}`);
}

test.describe("S-04 — back on one's own nick after a reload or a dropped connection", () => {
  test("odświeżenie w trakcie głosowania: the guest is on their nick, with the vote cast and no form", async ({
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
    const question = (await roundQuestion(page).textContent()) ?? "";

    // Setup: the host votes (a screen shows the list "Gracze" after its own vote), then Ola votes for Kuba; Kuba does
    // not, so the round goes on voting.
    await castVote(page, nickA);
    await expect(voteConfirmation(page)).toBeVisible();
    await castVote(pageA, nickB);
    await expect(voteConfirmation(pageA)).toBeVisible();

    // Action: Ola's page loads again.
    await pageA.reload();

    // Assertion: the same question, Ola on her own nick in the list "Gracze" (the badge "ty"), her vote counted with
    // whom she voted for (this tab remembers it, decision D1), and no form to vote a second time.
    await expect(roundQuestion(pageA)).toHaveText(question);
    await expect(voteConfirmation(pageA)).toBeVisible();
    await expect(pageA.getByText(`Twój głos: ${nickB}.`, { exact: true })).toBeVisible();
    await expect(playerRow(pageA, nickA)).toContainText("ty");
    await expect(playerRow(pageA, nickA)).toContainText("zagłosował(a)");
    await expect(pageA.getByRole("button", { name: "Zagłosuj", exact: true })).toHaveCount(0);

    // Assertion: the host's list still has Ola once, as one who voted.
    await expect(playerRow(page, nickA)).toHaveCount(1);
    await expect(playerRow(page, nickA)).toContainText("zagłosował(a)", { timeout: ROUND_UPDATE_MS });

    // Cleanup: the guests' browsers close; the room and its players stay in the database until S-13.
    await guestA.close();
    await guestB.close();
  });

  test("wstrzymanie się i odświeżenie: the tab still says so, and forgets it at the reveal", async ({
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

    // Setup: the host votes, then Ola abstains; Kuba does not vote, so the round goes on voting. Her tab now holds the
    // abstention under the room's key.
    await castVote(page, nickA);
    await expect(voteConfirmation(page)).toBeVisible();
    await castVote(pageA, null);
    await expect(voteConfirmation(pageA)).toBeVisible();
    expect(await storedVote(pageA, room.id), "Ola's tab should remember her abstention").not.toBeNull();

    // Action: Ola's page loads again.
    await pageA.reload();

    // Assertion: her screen still says she abstains, with the vote cast and no form.
    await expect(voteConfirmation(pageA)).toBeVisible();
    await expect(pageA.getByText("Wstrzymujesz się.", { exact: true })).toBeVisible();
    await expect(pageA.getByRole("button", { name: "Zagłosuj", exact: true })).toHaveCount(0);

    // Action: the host reveals the result before Kuba votes.
    await revealResult(page);

    // Assertion: Ola's screen shows the reveal, and her tab no longer holds the vote: the entry lives only while its
    // round is voting (AGENTS.md, Hard Rules).
    await expect(resultTable(pageA)).toBeVisible({ timeout: ROUND_UPDATE_MS });
    await expect
      .poll(() => storedVote(pageA, room.id), { message: "Ola's tab should forget her vote at the reveal" })
      .toBeNull();

    // Cleanup: the guests' browsers close; the room and its players stay in the database until S-13.
    await guestA.close();
    await guestB.close();
  });

  test("martwe gniazdo: the reveal reaches a screen that missed the bell within 10 s, from its own poll", async ({
    page,
    browser,
    baseURL,
  }) => {
    test.slow();

    // Setup: the host opens a room; Ola (A) joins on a connection that can sleep, Kuba (B) on a plain one; the host
    // starts the game.
    const room = await openRoom(page, baseURL);
    const nickA = uniqueNick("Ola");
    const nickB = uniqueNick("Kuba");
    const guestA = await newGuestContext(browser);
    const guestB = await newGuestContext(browser);
    const pageA = await guestA.newPage();
    const connection = await sleepableRealtime(pageA);
    const pageB = await guestB.newPage();
    await joinRoom(pageA, room.link, nickA);
    await joinRoom(pageB, room.link, nickB);
    await expect(playerRow(page, nickB)).toBeVisible();
    await startGame(page);
    await expect(roundQuestion(pageA)).toBeVisible({ timeout: ROUND_UPDATE_MS });

    // Setup: the host and Ola vote; Kuba does not, so the round waits until a leader reveals it.
    await castVote(page, nickA);
    await expect(voteConfirmation(page)).toBeVisible();
    await castVote(pageA, nickB);
    await expect(voteConfirmation(pageA)).toBeVisible();

    // Setup: Ola's page loads again, so no bell of the votes above is still on its way to her screen, and its poll
    // starts over. Its first fetch comes when its channel subscribes; then her socket goes quiet, as a phone's does when
    // the network drops without closing it.
    const subscribed = nextListFetch(pageA, room.id);
    await pageA.reload();
    await subscribed;
    await expect(voteConfirmation(pageA)).toBeVisible();
    connection.sleep();

    // Setup: the next fetch of Ola's screen is its own poll (no bell gets through, nothing else asks), so the one after
    // it comes a whole ROOM_POLL_MS later: the reveal below lands on the worst moment.
    await nextListFetch(pageA, room.id);

    // Action: the host reveals the result at once ("Odsłoń wynik", then the confirmation).
    await page.getByRole("button", { name: "Odsłoń wynik", exact: true }).click();
    await expect(page.getByRole("button", { name: "Anuluj", exact: true })).toBeVisible();
    const revealedAt = Date.now();
    await page.getByRole("button", { name: /^Na pewno odsłonić\? Zagłosowało \d+ z \d+$/ }).click();

    // The bell rang (the host's screen shows the reveal), but Ola's screen missed it.
    await expect(resultTable(page)).toBeVisible({ timeout: ROUND_UPDATE_MS });
    await expect
      .poll(() => connection.missed(), { message: "Ola's screen should have missed the bell" })
      .toBeGreaterThan(0);

    // Assertion: Ola's screen shows the reveal without a reload, within S-04's 10 s of the reveal, from its own poll.
    await expect(resultTable(pageA)).toBeVisible({ timeout: ROUND_UPDATE_MS });
    expect(Date.now() - revealedAt, "the reveal reached Ola's quiet screen too late").toBeLessThan(ROUND_UPDATE_MS);

    // Cleanup: the guests' browsers close; the room and its players stay in the database until S-13.
    await guestA.close();
    await guestB.close();
  });
});
