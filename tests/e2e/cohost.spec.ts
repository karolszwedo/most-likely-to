// risk: test-plan.md #2 and #4 for the co-host (S-07, PRD FR-003, FR-006 and FR-020; Karol's decisions 1-6 in
// context/changes/co-host-role/research.md): the host gives a guest the co-host role in the lobby, and the evening goes
// on without the host. The co-host sees the badge, "Zacznij grę" and the players' link (S-09, decision 5), another
// guest neither the start nor any role switch, and the co-host none of the host's own things (the game's question list,
// the switches). With the
// host's page closed the co-host starts, reveals the first question after the guests' votes (the host who left is
// still among those who may vote, so it never reveals itself: decision 6), opens the next one, lets a latecomer in and
// ends the game with its "Na pewno?". When the host takes the role back during a vote, the co-host's buttons go away
// without a reload and the co-host is told so. Laptop window only (project chromium). The 2 s budget is the probe's
// (test-plan §6.4).
// seed: tests/e2e/seed.spec.ts
import { test, expect, type Locator, type Page } from "@playwright/test";
import {
  askToJoin,
  cohostSwitch,
  joinRoom,
  newGuestContext,
  nextRequestFetch,
  openRoom,
  playerRow,
  requestRow,
  requests,
  uniqueNick,
} from "./support/room";
import {
  castVote,
  endGame,
  eveningEnd,
  expectFreshVote,
  expectReveal,
  nextQuestion,
  revealResult,
  ROUND_UPDATE_MS,
  roundQuestion,
  startGame,
  voteConfirmation,
  type ExpectedReveal,
} from "./support/round";

// The notice above the view when the host gives a guest the role or takes it back (RoomScreen, roleAnnouncement). A
// note for the eye; a live region of its own says the same words to a screen reader.
function roleNotice(page: Page, text: string): Locator {
  return page.getByRole("note").filter({ hasText: text });
}

const GIVEN = "Jesteś współhostem: możesz prowadzić grę.";
const TAKEN = "Nie jesteś już współhostem.";

// The host's switch by a guest's nick, pressed to give (true) or take (false) the role, and the host's own screen
// showing the new value once its refreshed state is in.
async function switchCohost(host: Page, nick: string, cohost: boolean): Promise<void> {
  const toggle = cohostSwitch(host, nick);
  await expect(toggle).toHaveAttribute("aria-pressed", String(!cohost));
  await toggle.click();
  await expect(toggle).toHaveAttribute("aria-pressed", String(cohost), { timeout: ROUND_UPDATE_MS });
}

test.describe("risks #2 and #4 (co-host) — the co-host leads the evening without the host", () => {
  test("the host makes Ola a co-host and leaves; Ola starts, reveals, opens the next question, lets a latecomer in and ends the game", async ({
    page,
    browser,
    baseURL,
  }) => {
    // Four browsers, two questions, a request and the end take longer than the default 30 s on a slow runner.
    test.slow();

    // Setup: the signed-in host opens a fresh room; guests Ola (A) and Kuba (B) join it from browsers of their own.
    const room = await openRoom(page, baseURL);
    const nickA = uniqueNick("Ola");
    const nickB = uniqueNick("Kuba");
    const nickC = uniqueNick("Ula");
    const guestA = await newGuestContext(browser);
    const guestB = await newGuestContext(browser);
    const pageA = await guestA.newPage();
    const pageB = await guestB.newPage();
    await joinRoom(pageA, room.link, nickA);
    await joinRoom(pageB, room.link, nickB);
    await expect(playerRow(page, nickA)).toBeVisible();
    await expect(playerRow(page, nickB)).toBeVisible();

    // Action: in the lobby the host gives Ola the co-host role with the switch by her nick.
    await switchCohost(page, nickA, true);

    // Assertion: Ola's screen, without a reload, has the badge by her nick, the notice, "Zacznij grę" and the players'
    // link (S-09, decision 5: a leader shares it), and none of the host's own things: no game's question list, no role
    // switch (decisions 4 and 5 of S-07).
    await expect(playerRow(pageA, nickA)).toContainText("współhost", { timeout: ROUND_UPDATE_MS });
    await expect(roleNotice(pageA, GIVEN)).toBeVisible();
    await expect(pageA.getByRole("button", { name: "Zacznij grę", exact: true })).toBeVisible();
    await expect(pageA.getByRole("textbox", { name: "Link dla graczy" })).toHaveValue(room.link);
    await expect(pageA.getByRole("button", { name: "Przejrzyj pytania", exact: true })).toHaveCount(0);
    await expect(pageA.getByRole("button", { name: /^Współhost: / })).toHaveCount(0);

    // Assertion: Kuba's screen has the badge by Ola's nick, so it has the new state, and still no "Zacznij grę" and no
    // notice of a role he does not have.
    await expect(playerRow(pageB, nickA)).toContainText("współhost", { timeout: ROUND_UPDATE_MS });
    await expect(pageB.getByRole("button", { name: "Zacznij grę", exact: true })).toHaveCount(0);
    await expect(roleNotice(pageB, GIVEN)).toHaveCount(0);

    // Action: Ola starts the game; the host's page is then closed for good.
    await startGame(pageA);
    await expect(roundQuestion(pageA)).toBeVisible({ timeout: ROUND_UPDATE_MS });
    const question1 = (await roundQuestion(pageA).textContent()) ?? "";
    await expect(roundQuestion(pageB)).toHaveText(question1, { timeout: ROUND_UPDATE_MS });
    await page.close();

    // Action: Ola votes for Kuba and Kuba for Ola; the host, gone, does not vote, so the round waits. Ola reveals it.
    await castVote(pageA, nickB);
    await expect(voteConfirmation(pageA)).toBeVisible();
    await castVote(pageB, nickA);
    await expect(voteConfirmation(pageB)).toBeVisible();
    await revealResult(pageA);

    // Assertion: both screens show the reveal of question 1. Oracle, from the votes above: Ola 1, Kuba 1, the host 0
    // (still a player of the round), no abstention.
    const reveal: ExpectedReveal = {
      question: question1,
      votes: [
        [room.hostNick, 0],
        [nickA, 1],
        [nickB, 1],
      ],
      abstained: 0,
    };
    for (const [who, screen] of [
      ["co-host Ola", pageA],
      ["guest Kuba", pageB],
    ] as const) {
      await test.step(`${who} sees the reveal of question 1`, async () => {
        await expectReveal(screen, reveal);
      });
    }

    // Action: Ola opens question 2.
    await nextQuestion(pageA);

    // Assertion: both screens get a new question with an empty vote.
    await expectFreshVote(pageA);
    const question2 = (await roundQuestion(pageA).textContent()) ?? "";
    expect(question2).not.toBe(question1);
    await expect(roundQuestion(pageB)).toHaveText(question2, { timeout: ROUND_UPDATE_MS });
    await expectFreshVote(pageB);

    // Action: latecomer Ula opens the link while question 2 is voting and asks to join.
    const latecomerC = await newGuestContext(browser);
    const pageC = await latecomerC.newPage();
    const listeningC = nextRequestFetch(pageC, room.id);
    await pageC.goto(room.link);
    await askToJoin(pageC, nickC, "Poproś o wejście");
    await listeningC;

    // Assertion: Ola, a leader, sees the request without a reload; Kuba gets no list of requests.
    await expect(requestRow(pageA, nickC)).toBeVisible({ timeout: ROUND_UPDATE_MS });
    await expect(requests(pageB)).toHaveCount(0);

    // Action: Ola lets Ula in.
    await requestRow(pageA, nickC).getByRole("button", { name: "Wpuść", exact: true }).click();

    // Assertion: Ula's waiting screen moves on to the room by itself, on question 2; Ola's list of requests is gone.
    await pageC.waitForURL((url) => url.pathname === `/r/${room.id}`, { timeout: ROUND_UPDATE_MS });
    await expect(roundQuestion(pageC)).toHaveText(question2);
    await expect(requests(pageA)).toHaveCount(0, { timeout: ROUND_UPDATE_MS });

    // Action: Ola ends the game; it asks "Na pewno zakończyć grę?" first (decision 3).
    await endGame(pageA);

    // Assertion: the end of the evening on every screen left, Ula's too.
    for (const [who, screen] of [
      ["co-host Ola", pageA],
      ["guest Kuba", pageB],
      ["latecomer Ula", pageC],
    ] as const) {
      await test.step(`${who} sees the end of the evening`, async () => {
        await expect(eveningEnd(screen)).toBeVisible({ timeout: ROUND_UPDATE_MS });
      });
    }

    // Cleanup: the guests' and the latecomer's browsers close. The room and its players stay in the database until the
    // next test's room; no test deletes its rooms afterwards. CI runs on a throwaway local Supabase.
    await guestA.close();
    await guestB.close();
    await latecomerC.close();
  });

  test("the host takes Ola's role back during a vote; her buttons go away without a reload and she is told so", async ({
    page,
    browser,
    baseURL,
  }) => {
    test.slow();

    // Setup: the host opens a fresh room, Ola (A) and Kuba (B) join, the host makes Ola a co-host and starts the game.
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
    await switchCohost(page, nickA, true);
    await expect(playerRow(pageA, nickA)).toContainText("współhost", { timeout: ROUND_UPDATE_MS });
    await startGame(page);
    await expect(roundQuestion(page)).toBeVisible({ timeout: ROUND_UPDATE_MS });
    const question1 = (await roundQuestion(page).textContent()) ?? "";
    await expect(roundQuestion(pageA)).toHaveText(question1, { timeout: ROUND_UPDATE_MS });

    // Setup: Ola votes for Kuba, so her screen remembers her choice; the host votes, which shows the host the list of
    // players with the switches. Kuba does not vote, so question 1 keeps voting.
    await castVote(pageA, nickB);
    await expect(voteConfirmation(pageA)).toBeVisible();
    const myVoteA = pageA.getByText(`Twój głos: ${nickB}.`, { exact: true });
    await expect(myVoteA).toBeVisible();
    await castVote(page, nickA);
    await expect(voteConfirmation(page)).toBeVisible();
    // Precondition: Ola has the leader's buttons.
    const revealA = pageA.getByRole("button", { name: "Odsłoń wynik", exact: true });
    await expect(revealA).toBeVisible();

    // Action: the host takes the role back with the switch by Ola's nick.
    await switchCohost(page, nickA, false);

    // Assertion: Ola's leader's buttons go away and the notice says the role is gone. Without a reload: her screen
    // still says whom she voted for, which only her tab holds (the page's memory and, since S-04, the tab's
    // sessionStorage; another browser says "Głos oddany" alone).
    await expect(revealA).toHaveCount(0, { timeout: ROUND_UPDATE_MS });
    await expect(pageA.getByRole("button", { name: "Zakończ grę", exact: true })).toHaveCount(0);
    await expect(roleNotice(pageA, TAKEN)).toBeVisible();
    await expect(myVoteA).toBeVisible();
    await expect(roundQuestion(pageA)).toHaveText(question1);
    await expect(playerRow(pageA, nickA)).not.toContainText("współhost");

    // Cleanup: the guests' browsers close; the room stays until the next test's room closes it, and no test deletes
    // its rooms afterwards. CI runs on a throwaway local Supabase.
    await guestA.close();
    await guestB.close();
  });
});
