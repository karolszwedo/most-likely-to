// risk: test-plan.md #3, the game's question list (S-06, PRD FR-012): the host reviews the list in the lobby
// ("Przejrzyj pytania": 15 questions), rewords one, removes one and adds an own one, and the game then plays the list in
// its order: the reworded question first, on every screen, and after the reveal the question that followed the removed
// one. The guests never see the list in the lobby, neither on their screen nor in their own state (lessons.md, "Pytania
// gry tylko po stronie serwera"). The oracle is the host's screen: the texts are read from the list, never from the
// question base. Plays twice (playwright.config.ts): in a laptop's window (project chromium) and in a phone's (project
// phone, 390×844), where the rows' buttons show their icons alone and an open "Popraw" must not make the page scroll
// sideways; every player's window is checked first.
// seed: tests/e2e/seed.spec.ts
import { test, expect, type Locator, type Page } from "@playwright/test";
import { joinRoom, newGuestContext, nextListFetch, openRoom, playerRow, uniqueNick } from "./support/room";
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

// Tailwind's lg (64rem): from this window width the room has its wide layout (AGENTS.md "## UI").
const LG_WIDTH = 1024;
// The list "Przejrzyj pytania" draws (Karol's decision in the plan).
const LIST_LENGTH = 15;
// The host's own texts, endings after "Kto z nas najprawdopodobniej", within the 90 characters of a question.
const REWORDED = "zatańczyłby na stole w kuchni o trzeciej nad ranem";
const OWN_QUESTION = "przyniósłby na imprezę swoje krzesło";

// The host's section "Pytania (N)" under "Przejrzyj pytania", once unfolded.
function questionList(page: Page): Locator {
  return page.getByRole("region", { name: /^Pytania \(\d+\)$/ });
}

// The list's rows, in the order of the list.
function listRows(page: Page): Locator {
  return questionList(page).getByRole("listitem");
}

// The row that shows exactly this question.
function rowWith(page: Page, question: string): Locator {
  return listRows(page).filter({ has: page.getByText(question, { exact: true }) });
}

function editButton(row: Locator): Locator {
  return row.getByRole("button", { name: "Popraw", exact: true });
}

// A row's question as the host's screen shows it: the text its "Popraw" carries as its description.
async function rowQuestion(row: Locator): Promise<string> {
  const id = await editButton(row).getAttribute("aria-describedby");
  expect(id, "„Popraw” names the question it acts on").toBeTruthy();
  const described = row.page().locator(`[id="${id ?? ""}"]`);
  const text = (await described.textContent()) ?? "";
  expect(text, "a row with no question").not.toBe("");
  return text;
}

// The whole round's title, as every screen shows it.
function sentence(question: string): string {
  return `Kto z nas najprawdopodobniej ${question}?`;
}

test.describe("risk #3 (question list) — the host reviews the game's question list and the game plays it", () => {
  test("the host rewords, removes and adds questions in the lobby, and the game plays the list in its order", async ({
    page,
    browser,
    baseURL,
  }) => {
    // Three browsers, the list's moves and two questions take longer than the default 30 s on a slow runner.
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

    // Action: the host opens "Przejrzyj pytania".
    const review = page.getByRole("button", { name: "Przejrzyj pytania", exact: true });
    await review.click();

    // Assertion: the drawn list unfolds with its 15 questions.
    await expect(questionList(page)).toBeVisible({ timeout: ROUND_UPDATE_MS });
    await expect(review).toHaveAttribute("aria-expanded", "true");
    await expect(page.getByRole("heading", { name: `Pytania (${String(LIST_LENGTH)})`, exact: true })).toBeVisible();
    await expect(listRows(page)).toHaveCount(LIST_LENGTH);
    const question1 = await rowQuestion(listRows(page).nth(0));
    const question2 = await rowQuestion(listRows(page).nth(1));
    const question3 = await rowQuestion(listRows(page).nth(2));
    expect(new Set([question1, question2, question3]).size, "the list repeats a question").toBe(3);

    // Action: the host opens "Popraw" on row 1 and leaves it with Escape.
    const row1 = listRows(page).nth(0);
    await editButton(row1).click();
    const field = row1.getByRole("textbox", { name: "Treść pytania" });
    await expect(field).toHaveValue(question1);

    // Assertion: the open "Popraw" leaves the page as wide as the window. Its hint is hidden for the eye only (sr-only),
    // and once took the whole width of its text, so a phone's window scrolled sideways (scroll-and-focus-fixes). Soft,
    // so the rest of the test still runs.
    const overflow = await page.evaluate(() => {
      const root = document.scrollingElement ?? document.documentElement;
      return root.scrollWidth - root.clientWidth;
    });
    expect.soft(overflow, "the page scrolls sideways while „Popraw” is open").toBe(0);
    await field.press("Escape");

    // Assertion: the row shows its question again, and the focus is back on its "Popraw".
    await expect(field).toHaveCount(0);
    await expect(editButton(row1)).toBeFocused();
    await expect(row1).toContainText(question1);

    // Action: the host rewords row 1 and saves it with Enter.
    await editButton(row1).click();
    await field.fill(REWORDED);
    await field.press("Enter");

    // Assertion: row 1 shows the host's text, marked "własne", and the focus is back on its "Popraw".
    await expect(editButton(row1)).toBeFocused({ timeout: ROUND_UPDATE_MS });
    await expect(row1).toContainText(REWORDED);
    await expect(row1.getByText("własne", { exact: true })).toBeVisible();

    // Action: the host removes row 2.
    await rowWith(page, question2).getByRole("button", { name: "Usuń", exact: true }).click();

    // Assertion: the list has one question less, without row 2's, and the focus is on "Popraw" of the row after it.
    await expect(listRows(page)).toHaveCount(LIST_LENGTH - 1, { timeout: ROUND_UPDATE_MS });
    await expect(
      page.getByRole("heading", { name: `Pytania (${String(LIST_LENGTH - 1)})`, exact: true }),
    ).toBeVisible();
    await expect(questionList(page).getByText(question2, { exact: true })).toHaveCount(0);
    await expect(editButton(rowWith(page, question3))).toBeFocused();

    // Action: the host adds an own question.
    const addField = questionList(page).getByRole("textbox", { name: "Dodaj własne pytanie" });
    await addField.fill(OWN_QUESTION);
    await questionList(page).getByRole("button", { name: "Dodaj", exact: true }).click();

    // Assertion: the field is empty for the next one, and the question is at the list's end, marked "własne".
    await expect(addField).toHaveValue("", { timeout: ROUND_UPDATE_MS });
    await expect(listRows(page)).toHaveCount(LIST_LENGTH, { timeout: ROUND_UPDATE_MS });
    await expect(listRows(page).last()).toContainText(OWN_QUESTION);
    await expect(listRows(page).last().getByText("własne", { exact: true })).toBeVisible();

    // Setup: guest A's screen loads again, now that the list exists; waiting for its first fetch means it listens for
    // the start. Since game-length the list's moves ring the room's bell, so the old page may still fetch the state
    // after the own question was added: the wait starts once the new document has come (commit), so it catches the new
    // page's fetch and not the old one's.
    await pageA.reload({ waitUntil: "commit" });
    const lobbyA = await nextListFetch(pageA, room.id);

    // Assertion: the guests are in the lobby and see nothing of the list: no "Przejrzyj pytania", no section, and guest
    // A's own state carries none of the list's texts (the reworded one is not played yet).
    const stateA = await lobbyA.text();
    for (const text of [REWORDED, question3, OWN_QUESTION]) {
      expect(stateA, "guest A's state has a question of the list").not.toContain(text);
    }
    for (const [who, screen] of guests) {
      await test.step(`${who} sees the lobby without the question list`, async () => {
        await expect(screen.getByRole("heading", { name: /^Jesteś w grze jako / })).toBeVisible();
        await expect(screen.getByRole("button", { name: "Przejrzyj pytania" })).toHaveCount(0);
        await expect(questionList(screen)).toHaveCount(0);
      });
    }

    // Action: the host starts the game.
    await startGame(page);

    // Assertion: question 1 is the reworded row 1, the same on every screen.
    for (const [who, screen] of screens) {
      await test.step(`${who} gets the reworded question`, async () => {
        await expect(roundQuestion(screen)).toHaveText(sentence(REWORDED), { timeout: ROUND_UPDATE_MS });
      });
    }

    // Action: A votes for B, B for A, and the host votes last, for A.
    await castVote(pageA, nickB);
    await expect(voteConfirmation(pageA)).toBeVisible();
    await castVote(pageB, nickA);
    await expect(voteConfirmation(pageB)).toBeVisible();
    await castVote(page, nickA);

    // Assertion: the third vote reveals question 1 by itself on every screen. Oracle, from the votes above: A 2, B 1,
    // the host 0, no abstention.
    const reveal: ExpectedReveal = {
      question: sentence(REWORDED),
      votes: [
        [room.hostNick, 0],
        [nickA, 2],
        [nickB, 1],
      ],
      abstained: 0,
    };
    for (const [who, screen] of screens) {
      await test.step(`${who} sees the reveal of question 1`, async () => {
        await expectReveal(screen, reveal);
      });
    }

    // Action: the host opens the next question.
    await nextQuestion(page);

    // Assertion: question 2 is row 3 of the list, the one after the removed row 2, on every screen.
    await expectFreshVote(page);
    for (const [who, screen] of screens) {
      await test.step(`${who} gets row 3 of the list`, async () => {
        await expect(roundQuestion(screen)).toHaveText(sentence(question3), { timeout: ROUND_UPDATE_MS });
      });
    }

    // Cleanup: both guests' browsers close. The room, its players, its list and question 1's counts stay in the
    // database, because nothing can delete them yet (S-13); the next test's room closes this one. CI runs on a
    // throwaway local Supabase; unique nicks keep runs apart.
    await guestA.close();
    await guestB.close();
  });
});
