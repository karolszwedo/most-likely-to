// risk: test-plan.md #2, #3 and #4 for a latecomer (S-08, PRD FR-020): someone who opens the link while a question is
// voting asks the host to let them in and waits without seeing the question; the host sees the request on the round's
// screen without a reload and lets them in; the latecomer then sees the round in progress with a note instead of the
// vote, the counter stays at the players the round opened with, and the round reveals itself after their votes; from
// the next question on the latecomer votes like everyone. A second latecomer turned away sees so, asks again and is on
// the host's list again; turned away once more while the host's screen cannot refresh, they ask again before it sees
// the answer, and their row works again once a refreshed list still has them (F4 of S-08). An answer that takes the
// list away takes the host's focus to the view's title; a row that stays keeps it (scroll-and-focus-fixes). Laptop
// window only (project chromium). The 2 s budget is the probe's (test-plan §6.4).
// seed: tests/e2e/seed.spec.ts
import { test, expect, type Locator, type Page } from "@playwright/test";
import {
  askToJoin,
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
  expectFreshVote,
  expectReveal,
  nextQuestion,
  ROUND_UPDATE_MS,
  roundQuestion,
  startGame,
  voteConfirmation,
  type ExpectedReveal,
} from "./support/round";

// The title of the link's page once a leader turned the latecomer away: the form to ask again is under it.
function turnedAwayTitle(page: Page): Locator {
  return page.getByRole("heading", { level: 1, name: "Prowadzący cię nie wpuścił.", exact: true });
}

// The note a latecomer gets in place of the vote while the question they came in during is voting.
function latecomerNote(page: Page): Locator {
  return page.getByRole("note").filter({ hasText: "Zagłosujesz od następnego pytania" });
}

// "Zagłosowało: X z Y" under the vote, the list of players or the form.
function votedCounter(page: Page, voted: number, of: number): Locator {
  return page.getByText(`Zagłosowało: ${String(voted)} z ${String(of)}`, { exact: true });
}

test.describe("risks #2, #3 and #4 (latecomer) — the host lets a latecomer in mid-round and turns another away", () => {
  test("a latecomer asks mid-round, is let in, watches the question and votes from the next one; another is turned away and asks again", async ({
    page,
    browser,
    baseURL,
  }) => {
    // Five browsers, two requests, two questions and a refusal take longer than the default 30 s on a slow runner.
    test.slow();

    // Setup: the signed-in host opens a fresh room; guests A and B join it from browsers of their own, and the host
    // starts the game. Question 1 opens with these three players.
    const room = await openRoom(page, baseURL);
    const nickA = uniqueNick("Ola");
    const nickB = uniqueNick("Kuba");
    const nickC = uniqueNick("Ula");
    const nickD = uniqueNick("Igor");
    const guestA = await newGuestContext(browser);
    const guestB = await newGuestContext(browser);
    const pageA = await guestA.newPage();
    const pageB = await guestB.newPage();
    await joinRoom(pageA, room.link, nickA);
    await joinRoom(pageB, room.link, nickB);
    await expect(playerRow(page, nickA)).toBeVisible();
    await expect(playerRow(page, nickB)).toBeVisible();
    await startGame(page);
    await expect(roundQuestion(page)).toBeVisible({ timeout: ROUND_UPDATE_MS });
    const question1 = (await roundQuestion(page).textContent()) ?? "";
    for (const screen of [pageA, pageB]) {
      await expect(roundQuestion(screen)).toHaveText(question1, { timeout: ROUND_UPDATE_MS });
    }

    // Action: latecomer C opens the link while question 1 is voting and asks to join.
    const latecomerC = await newGuestContext(browser);
    const pageC = await latecomerC.newPage();
    const listeningC = nextRequestFetch(pageC, room.id);
    await pageC.goto(room.link);
    await askToJoin(pageC, nickC, "Poproś o wejście");
    await listeningC;

    // Assertion: C waits with the nick asked with and sees nothing of the game, the question least of all
    // (lessons.md, "Pytania gry tylko po stronie serwera").
    await expect(pageC.getByText(nickC, { exact: true })).toBeVisible();
    await expect(pageC.getByText(/Kto z nas najprawdopodobniej/)).toHaveCount(0);

    // Assertion: the host sees the request on the round's screen without a reload.
    await expect(requestRow(page, nickC)).toBeVisible({ timeout: ROUND_UPDATE_MS });

    // Action: the host lets C in.
    await requestRow(page, nickC).getByRole("button", { name: "Wpuść", exact: true }).click();

    // Assertion: C's waiting screen moves on to the room by itself. C sees question 1 with the note in place of the
    // vote and is among the players, marked "od następnego pytania"; the host's list of requests is gone.
    await pageC.waitForURL((url) => url.pathname === `/r/${room.id}`, { timeout: ROUND_UPDATE_MS });
    await expect(roundQuestion(pageC)).toHaveText(question1);
    await expect(latecomerNote(pageC)).toBeVisible();
    await expect(pageC.getByRole("button", { name: "Zagłosuj", exact: true })).toHaveCount(0);
    await expect(playerRow(pageC, nickC)).toContainText("od następnego pytania");
    await expect(requests(page)).toHaveCount(0, { timeout: ROUND_UPDATE_MS });

    // Assertion: the host's "Wpuść" went away with its list, so the host's focus is on the view's title, the question,
    // not on the page's start (scroll-and-focus-fixes). Soft, so each answer is checked in one run.
    await expect.soft(roundQuestion(page), "the host's focus after the last request's Wpuść").toBeFocused();

    // Action: guest A votes for B.
    await castVote(pageA, nickB);
    await expect(voteConfirmation(pageA)).toBeVisible();

    // Assertion: A's list has C, marked "od następnego pytania", so A's screen has the state with C in it, and the
    // counter still counts the 3 players question 1 opened with. B's form shows A's vote and the same counter, and does
    // not offer C. Oracle: who may vote is who was in the room when the question opened (PRD FR-020, Karol's decision).
    await expect(playerRow(pageA, nickC)).toContainText("od następnego pytania", { timeout: ROUND_UPDATE_MS });
    await expect(votedCounter(pageA, 1, 3)).toBeVisible({ timeout: ROUND_UPDATE_MS });
    await expect(votedCounter(pageB, 1, 3)).toBeVisible({ timeout: ROUND_UPDATE_MS });
    await expect(pageB.getByRole("radio", { name: nickC, exact: true })).toHaveCount(0);
    await expect(votedCounter(pageC, 1, 3)).toBeVisible({ timeout: ROUND_UPDATE_MS });

    // Action: B votes for A, and the host votes last, for A.
    await castVote(pageB, nickA);
    await expect(voteConfirmation(pageB)).toBeVisible();
    await castVote(page, nickA);

    // Assertion: the third vote reveals question 1 by itself on every screen, C's too, and C is not in its result.
    // Oracle, from the votes above: A 2, B 1, the host 0, no abstention; C was not in the round.
    const reveal: ExpectedReveal = {
      question: question1,
      votes: [
        [nickA, 2],
        [room.hostNick, 0],
        [nickB, 1],
      ],
      abstained: 0,
    };
    for (const [who, screen] of [
      ["the host", page],
      ["guest A", pageA],
      ["guest B", pageB],
      ["latecomer C", pageC],
    ] as const) {
      await test.step(`${who} sees the reveal of question 1`, async () => {
        await expectReveal(screen, reveal);
      });
    }

    // Action: the host opens question 2.
    await nextQuestion(page);
    await expectFreshVote(page);
    const question2 = (await roundQuestion(page).textContent()) ?? "";

    // Assertion: C gets question 2 with the form and no note, votes, and the counter counts all 4 players.
    await expect(roundQuestion(pageC)).toHaveText(question2, { timeout: ROUND_UPDATE_MS });
    await expectFreshVote(pageC);
    await expect(latecomerNote(pageC)).toHaveCount(0);
    await castVote(pageC, nickA);
    await expect(voteConfirmation(pageC)).toBeVisible();
    await expect(votedCounter(pageC, 1, 4)).toBeVisible({ timeout: ROUND_UPDATE_MS });

    // Action: latecomer D opens the link while question 2 is voting and asks to join; the host turns D away.
    const latecomerD = await newGuestContext(browser);
    const pageD = await latecomerD.newPage();
    const listeningD = nextRequestFetch(pageD, room.id);
    await pageD.goto(room.link);
    await askToJoin(pageD, nickD, "Poproś o wejście");
    await listeningD;
    await expect(requestRow(page, nickD)).toBeVisible({ timeout: ROUND_UPDATE_MS });
    await requestRow(page, nickD).getByRole("button", { name: "Odrzuć", exact: true }).click();

    // Assertion: D's waiting screen says so by itself, with the form to ask again; the host's list is gone, and with it
    // the pressed "Odrzuć", so the host's focus is on the view's title.
    await expect(turnedAwayTitle(pageD)).toBeVisible({ timeout: ROUND_UPDATE_MS });
    await expect(requests(page)).toHaveCount(0, { timeout: ROUND_UPDATE_MS });
    await expect.soft(roundQuestion(page), "the host's focus after the last request's Odrzuć").toBeFocused();

    // Action: D asks again.
    await askToJoin(pageD, nickD, "Poproś jeszcze raz");

    // Assertion: the request is on the host's list again, without a reload.
    await expect(requestRow(page, nickD)).toBeVisible({ timeout: ROUND_UPDATE_MS });

    // Action (F4 of S-08, context/archive/2026-10-22-latecomer-admission/follow-ups/review-fixes.md): the host's screen
    // cannot fetch the room's state from now on, and the host turns D away again. The answer is accepted, so D's row
    // waits for a refreshed list, which does not come.
    const stateFetch = (url: URL) => url.pathname === `/api/rooms/${room.id}/lobby`;
    await page.route(stateFetch, (route) => route.abort());
    const answerD = requestRow(page, nickD).getByRole("button", { name: "Wpuść", exact: true });
    const rejectD = requestRow(page, nickD).getByRole("button", { name: "Odrzuć", exact: true });
    await rejectD.click();
    await expect(turnedAwayTitle(pageD)).toBeVisible({ timeout: ROUND_UPDATE_MS });
    await expect(answerD).toHaveAttribute("aria-disabled", "true");

    // Action: D asks again under the same nick before the host's screen has seen the answer; then the host's screen
    // can fetch again, and B's vote rings the bell, so it gets a refreshed list.
    await askToJoin(pageD, nickD, "Poproś jeszcze raz");
    await page.unroute(stateFetch);
    await castVote(pageB, nickA);

    // Assertion: the refreshed list still has D, so D's row is a new request, and its buttons work again: the attribute
    // is gone, not only greyed (aria-disabled leaves a button focusable, so toBeEnabled() would not tell).
    await expect(votedCounter(page, 2, 4)).toBeVisible({ timeout: ROUND_UPDATE_MS });
    await expect(answerD).not.toHaveAttribute("aria-disabled", { timeout: ROUND_UPDATE_MS });

    // Assertion: the row never went away, so the focus never left the pressed "Odrzuć": it waited there, focusable, and
    // stays once the row works again. Only a button that goes away moves the focus (scroll-and-focus-fixes).
    await expect.soft(rejectD, "the host's focus on a row that stayed").toBeFocused();

    // Cleanup: the guests' and latecomers' browsers close. The room, its players, question 1's counts and D's request
    // stay in the database until the next test's room closes this one (openRoom with confirm_close=1 drops its requests);
    // no test deletes its rooms afterwards. CI runs on a throwaway local Supabase; unique nicks keep runs apart.
    await guestA.close();
    await guestB.close();
    await latecomerC.close();
    await latecomerD.close();
  });
});
