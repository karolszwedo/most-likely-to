// risk: S-10 (PRD FR-013, FR-014), a player's proposal of a question reaches only those who lead the game, and an
// approved one is the next question for everyone. The oracle is Karol's decisions of 2026-11-04
// (context/changes/guest-question-proposals/plan.md): a guest proposes in the lobby and sees only the counts, the host
// sees the whole sentence with the author's nick and another guest nothing; a leader approves only once the game has
// started, and the question comes next, on every screen, with no author; a co-host decides as the host does; the third
// proposal uses up the player's limit, a rejected one counts too. Text typed and not sent stays in the field, with the
// focus, when the round changes under it. The leaders' bell is checked both ways (test-plan §6.4, "Bell vs poll"): the
// host gets the proposal and a co-host the approval before their own poll could have run, and a player who leads
// nothing makes no fetch for a proposal sent, approved or rejected, or the next round would reach them late (impl-review
// F1), so the author's count comes with her own poll. A screen measured loads again just before the move, so its next
// poll comes no sooner than ROOM_POLL_MS after the load. Plays in a laptop's window (project chromium) and in a phone's
// (project phone); every player's window is checked first (test-plan §6.4, "Spec w oknie telefonu").
// seed: tests/e2e/seed.spec.ts
import { test, expect, type Locator, type Page } from "@playwright/test";
import { ROOM_POLL_MS } from "../../src/lib/live-sync/shared";
import {
  cohostSwitch,
  countListFetches,
  joinRoom,
  newGuestContext,
  nextListFetch,
  openRoom,
  playerRow,
  uniqueNick,
} from "./support/room";
import {
  castVote,
  nextQuestion,
  resultTable,
  ROUND_UPDATE_MS,
  roundQuestion,
  skipQuestion,
  startGame,
  voteConfirmation,
} from "./support/round";

// Tailwind's lg (64rem): from this window width the room has its wide layout (AGENTS.md "## UI").
const LG_WIDTH = 1024;

// The guest's three proposals, endings after "Kto z nas najprawdopodobniej", within the 90 characters of a question.
const FIRST = "zapomniałby własnego adresu po wyjściu z taksówki";
const SECOND = "przespałby cały lot i obudził się w złym kraju";
const THIRD = "kupiłby coś z telezakupów o trzeciej w nocy";

// What the form says, written out by hand.
const SENT = "Wysłane. Prowadzący zdecyduje, czy trafi do gry.";
const LIMIT = "Nie masz już propozycji na tę grę.";

// A proposal as a leader reads it, and as the round's title.
function sentence(text: string): string {
  return `Kto z nas najprawdopodobniej ${text}?`;
}

// The player's "Zaproponuj pytanie" (src/components/room/ProposalForm.tsx): the button that unfolds the field, and the
// field, which carries the same words as its label.
function formButton(page: Page): Locator {
  return page.getByRole("button", { name: "Zaproponuj pytanie", exact: true });
}

function formField(page: Page): Locator {
  return page.getByRole("textbox", { name: "Zaproponuj pytanie", exact: true });
}

function sendButton(page: Page): Locator {
  return page.getByRole("button", { name: "Wyślij", exact: true });
}

// The player's own counts under the form, or anything else the form says.
function formText(page: Page, text: string): Locator {
  return page.getByText(text, { exact: true });
}

// A leader's list (src/components/room/QuestionProposals.tsx), which only a leader's screen has, and nobody's with no
// proposal waiting.
function proposals(page: Page): Locator {
  return page.getByRole("region", { name: "Propozycje pytań", exact: true });
}

// The pill, or the line in the lobby, that unfolds the list; its name starts with the count.
function listButton(page: Page, count: number): Locator {
  return proposals(page).getByRole("button", { name: new RegExp(`^Propozycje pytań \\(${String(count)}\\)`) });
}

function proposalRow(page: Page, text: string): Locator {
  return proposals(page)
    .getByRole("listitem")
    .filter({ hasText: sentence(text) });
}

test.describe("S-10 (proposals) — a player's question goes through a leader into the game", () => {
  test("a guest proposes, the host approves after the start, the question comes next, a co-host rejects, the limit ends it", async ({
    page,
    browser,
    baseURL,
  }) => {
    // Three browsers, three questions and the screens that load again take longer than the default 30 s on a slow
    // runner.
    test.slow();

    // Setup: the signed-in host opens a fresh room; guests A (the author) and B join it from browsers of their own.
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
    const screens = [
      ["the host", page],
      ["guest A", pageA],
      ["guest B", pageB],
    ] as const;

    // Setup check: every player's window is the project's (390×844 in phone, 1280×720 in chromium); a phone project
    // played at a laptop's width would be a false green.
    const viewport = test.info().project.use.viewport;
    if (!viewport) throw new Error("the project sets no window size");
    expect(viewport.width < LG_WIDTH, "only the phone project plays below lg").toBe(
      test.info().project.name === "phone",
    );
    for (const [who, screen] of screens) {
      expect(screen.viewportSize(), `${who}'s window`).toEqual(viewport);
      expect(await screen.evaluate(() => window.innerWidth), `${who}'s page width`).toBe(viewport.width);
    }

    // Action: guest A unfolds the form, the press takes the focus to the field, and she types her first proposal.
    await expect(formText(pageA, "zostały ci 3")).toBeVisible();
    await formButton(pageA).click();
    await expect(formField(pageA)).toBeFocused();
    await formField(pageA).fill(FIRST);

    // Setup: the screens of B and the host load again just before A sends. Their own polls then come no sooner than
    // ROOM_POLL_MS after this moment, so a proposal shown before that can only have come with the bell, and a fetch can
    // only have been made for a bell (test-plan §6.4, "Bell vs poll"). Waiting for the first fetch means the screen is
    // listening; the wait starts before the reload.
    const listeningQuietB = nextListFetch(pageB, room.id);
    const loadedQuietB = Date.now();
    await pageB.reload();
    await listeningQuietB;
    const fetchesB = countListFetches(pageB, room.id);
    const hostListening = nextListFetch(page, room.id);
    const loadedHost = Date.now();
    await page.reload();
    await hostListening;
    await expect(proposals(page)).toHaveCount(0);

    // Action: guest A sends it in the lobby.
    await sendButton(pageA).click();

    // Assertion: the host gets it without a reload, sooner than its own poll could have brought it.
    await expect(listButton(page, 1)).toBeVisible({ timeout: ROUND_UPDATE_MS });
    expect(Date.now() - loadedHost, "the host saw the proposal only after its own poll could have run").toBeLessThan(
      ROOM_POLL_MS,
    );

    // Assertion: B, who leads nothing, on the same channel, made no fetch for it. A proposal changes nothing on his
    // screen, and such a fetch would delay the next round's bell.
    expect(Date.now() - loadedQuietB, "B's own poll could have run, so his fetches prove nothing").toBeLessThan(
      ROOM_POLL_MS,
    );
    expect(fetchesB(), "guest B fetched the state for a proposal").toBe(0);

    // Assertion: A's field is empty for the next one, and she sees the counts, nothing more.
    await expect(formText(pageA, "czeka na decyzję: 1 · zostały ci 2")).toBeVisible({ timeout: ROUND_UPDATE_MS });
    // The field's own hint, by its description: the screen reader's live region says the same words.
    await expect(formField(pageA)).toHaveAccessibleDescription(SENT);
    await expect(formField(pageA)).toHaveValue("");

    // Action and assertion: the host unfolds the list: the whole sentence with the author's nick, and in the lobby only
    // "Odrzuć". Then folds it, so the game below starts with the pill.
    await listButton(page, 1).click();
    await expect(proposalRow(page, FIRST)).toContainText(nickA);
    await expect(proposalRow(page, FIRST).getByRole("button", { name: "Odrzuć", exact: true })).toBeVisible();
    await expect(proposalRow(page, FIRST).getByRole("button", { name: "Zatwierdź", exact: true })).toHaveCount(0);
    await listButton(page, 1).click();
    await expect(proposalRow(page, FIRST)).toHaveCount(0);

    // Assertion: guest B, a player with no role, sees nothing of it: no list, his own full counts, and the text is not
    // in his own state, which his screen loads again to read. The wait starts before the reload.
    const listeningB = nextListFetch(pageB, room.id);
    await pageB.reload();
    const lobbyB = await listeningB;
    expect(await lobbyB.text(), "guest B's state has the proposal's text").not.toContain(FIRST);
    await expect(proposals(pageB)).toHaveCount(0);
    await expect(formText(pageB, "zostały ci 3")).toBeVisible();

    // Action: the host gives B the co-host role; a leader sees the proposals.
    await cohostSwitch(page, nickB).click();
    await expect(cohostSwitch(page, nickB)).toHaveAttribute("aria-pressed", "true", { timeout: ROUND_UPDATE_MS });
    await expect(listButton(pageB, 1)).toBeVisible({ timeout: ROUND_UPDATE_MS });

    // Action: the host starts the game; question 1 comes from the game's pool, not from the proposal.
    await startGame(page);
    await expect(roundQuestion(page)).toBeVisible({ timeout: ROUND_UPDATE_MS });
    const question1 = (await roundQuestion(page).textContent()) ?? "";
    expect(question1, "the proposal played before its approval").not.toBe(sentence(FIRST));
    for (const [who, screen] of screens) {
      await expect(roundQuestion(screen), `${who}'s question 1`).toHaveText(question1, { timeout: ROUND_UPDATE_MS });
    }

    // Action: the host unfolds the pill; now the row has "Zatwierdź".
    await listButton(page, 1).click();
    const approve = proposalRow(page, FIRST).getByRole("button", { name: "Zatwierdź", exact: true });
    await expect(approve).toBeVisible();

    // Setup: the screens of A, who leads nothing, and of co-host B load again just before the host's move, as above. A
    // still has the count, and B the list.
    const listeningA = nextListFetch(pageA, room.id);
    const loadedA = Date.now();
    await pageA.reload();
    await listeningA;
    const fetchesAtApproval = countListFetches(pageA, room.id);
    await expect(formText(pageA, "czeka na decyzję: 1 · zostały ci 2")).toBeVisible();
    const listeningCohost = nextListFetch(pageB, room.id);
    const loadedCohost = Date.now();
    await pageB.reload();
    await listeningCohost;
    await expect(listButton(pageB, 1)).toBeVisible();

    // Action: the host approves.
    await approve.click();

    // Assertion: the list empties on the host's screen and on co-host B's, sooner than his own poll could have brought
    // it, so the leaders' bell reached a screen that made no move.
    await expect(proposals(page)).toHaveCount(0, { timeout: ROUND_UPDATE_MS });
    await expect(proposals(pageB)).toHaveCount(0, { timeout: ROUND_UPDATE_MS });
    expect(Date.now() - loadedCohost, "B saw the approval only after his own poll could have run").toBeLessThan(
      ROOM_POLL_MS,
    );

    // Assertion: A, on the same channel, made no fetch for that bell.
    expect(Date.now() - loadedA, "A's own poll could have run, so her fetches prove nothing").toBeLessThan(
      ROOM_POLL_MS,
    );
    expect(fetchesAtApproval(), "guest A fetched the state for an approval").toBe(0);

    // Assertion: A's count of those waiting goes with her own poll; the proposal is used up all the same, and how it was
    // decided is not said.
    await expect(formText(pageA, "zostały ci 2")).toBeVisible({ timeout: ROUND_UPDATE_MS });

    // Setup: question 1 played to its reveal; the host's vote is the last one and reveals the round by itself.
    await castVote(pageA, nickB);
    await expect(voteConfirmation(pageA)).toBeVisible();
    await castVote(pageB, nickA);
    await expect(voteConfirmation(pageB)).toBeVisible();
    await castVote(page, nickA);
    for (const [who, screen] of screens) {
      await expect(resultTable(screen), `${who}'s reveal`).toBeVisible({ timeout: ROUND_UPDATE_MS });
    }

    // Action: the host opens the next question.
    await nextQuestion(page);

    // Assertion: it is the approved proposal on every screen: exactly the sentence, so no nick of its author.
    for (const [who, screen] of screens) {
      await test.step(`${who} gets the approved question`, async () => {
        await expect(roundQuestion(screen)).toHaveText(sentence(FIRST), { timeout: ROUND_UPDATE_MS });
        await expect(proposals(screen)).toHaveCount(0);
      });
    }

    // Action: A sends her second proposal while question 2 is voting; her form folded when her page loaded again.
    await formButton(pageA).click();
    await formField(pageA).fill(SECOND);
    await sendButton(pageA).click();
    await expect(formText(pageA, "czeka na decyzję: 1 · została ci 1")).toBeVisible({ timeout: ROUND_UPDATE_MS });

    // Setup: co-host B, a leader, unfolds his list; the host has the proposal too, and A's screen loads again.
    await listButton(pageB, 1).click({ timeout: ROUND_UPDATE_MS });
    await expect(proposalRow(pageB, SECOND)).toContainText(nickA);
    await expect(listButton(page, 1)).toBeVisible({ timeout: ROUND_UPDATE_MS });
    const listeningAgainA = nextListFetch(pageA, room.id);
    const reloadedA = Date.now();
    await pageA.reload();
    await listeningAgainA;
    const fetchesAtRejection = countListFetches(pageA, room.id);

    // Action: B rejects it.
    await proposalRow(pageB, SECOND).getByRole("button", { name: "Odrzuć", exact: true }).click();

    // Assertion: the list empties on both leaders' screens, and A, on the same channel, made no fetch for that bell.
    await expect(proposals(pageB)).toHaveCount(0, { timeout: ROUND_UPDATE_MS });
    await expect(proposals(page)).toHaveCount(0, { timeout: ROUND_UPDATE_MS });
    expect(Date.now() - reloadedA, "A's own poll could have run, so her fetches prove nothing").toBeLessThan(
      ROOM_POLL_MS,
    );
    expect(fetchesAtRejection(), "guest A fetched the state for a rejection").toBe(0);

    // Assertion: the rejected proposal counts: with her own poll A has one left, with no word on how it went.
    await expect(formText(pageA, "została ci 1")).toBeVisible({ timeout: ROUND_UPDATE_MS });

    // Action: A types her third proposal, her form folded again when her page loaded, and does not send it; the host
    // skips question 2 meanwhile.
    await formButton(pageA).click();
    await formField(pageA).fill(THIRD);
    await expect(formField(pageA)).toBeFocused();
    await skipQuestion(page);

    // Assertion: A's screen is on the next question, with her text in the field and the focus still there: another
    // player's move takes neither.
    await expect(roundQuestion(pageA)).not.toHaveText(sentence(FIRST), { timeout: ROUND_UPDATE_MS });
    await expect(formField(pageA)).toHaveValue(THIRD);
    await expect(formField(pageA)).toBeFocused();

    // Action: A sends it after all.
    await sendButton(pageA).click();

    // Assertion: her limit is used up: a quiet line with the one still waiting, and no form.
    await expect(formText(pageA, LIMIT)).toBeVisible({ timeout: ROUND_UPDATE_MS });
    await expect(formText(pageA, "czeka na decyzję: 1")).toBeVisible();
    await expect(formButton(pageA)).toHaveCount(0);
    await expect(formField(pageA)).toHaveCount(0);

    // Cleanup: both guests' browsers close. The room, its players and the approved question stay in the database,
    // because nothing can delete them yet (S-13); the next test's room closes this one. CI runs on a throwaway local
    // Supabase; unique nicks keep runs apart.
    await guestA.close();
    await guestB.close();
  });
});
