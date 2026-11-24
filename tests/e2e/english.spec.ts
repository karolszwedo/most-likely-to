// risk: test-plan.md #2 and #3 for a game in two languages (S-27, PRD FR-031): the game has no language, so every player
// sees the one question of the round in the language of their own screen, votes on it and sees the same reveal. A screen
// opens in its browser's language; the switch in its corner changes that person's screen alone, in the middle of a round
// and with no reload, keeps the vote already cast, and stays after a reload. A link copied from an English screen ends in
// ?lang=en, for its card alone: the guest's page is in the guest's language (context/changes/english-version/plan.md,
// decisions 1, 3, 4 and 10). The one English evening of the suite; every other spec plays in Polish (locale in
// playwright.config.ts). It plays twice: in a laptop's window (project chromium) and in a phone's (project phone), where
// the switch stands last in the header's row.
// seed: tests/e2e/seed.spec.ts
import { test, expect, type Locator, type Page } from "@playwright/test";
import { CATEGORIES, QUESTIONS, type QuestionEntry } from "../../src/data/questions";
import { CATEGORY_NAMES_EN, POLISH_ONLY, QUESTIONS_EN } from "../../src/data/questions-en";
import { joinRoom, newGuestContext, uniqueNick } from "./support/room";
import { castVote, expectReveal, ROUND_UPDATE_MS, roundQuestion, voteConfirmation } from "./support/round";

// The host's browser and, through newGuestContext, guest A's; guest B's is Polish.
test.use({ locale: "en-US" });

const ROOM_PATH = /^\/r\/[0-9a-f-]{36}$/;

// The question base as plain entries: the ids of one category and both texts of each.
const BASE = Object.entries(QUESTIONS as Record<string, QuestionEntry>);
const ENGLISH_TEXTS: Readonly<Partial<Record<string, string>>> = QUESTIONS_EN;

// A category whose every question has an English text, so whichever one the game draws, an English screen shows it in
// English. Counted from the list of the questions only in Polish, never written down here.
const CATEGORY = CATEGORIES.find(({ id }) =>
  BASE.every(([question, entry]) => entry.category !== id || !Object.hasOwn(POLISH_ONLY, question)),
);

// The switch of the screen's language by the code it shows ("EN") and, for a screen reader, what it is. A pattern, as the
// hidden words stand in an element of their own, with a space before them in some browsers' name of the button.
function languageSwitch(page: Page, code: "EN" | "PL"): Locator {
  return page.getByRole("button", { name: code === "EN" ? /^EN ?, screen language$/ : /^PL ?, język ekranu$/ });
}

// The page's own language, as it declares it.
function pageLanguage(page: Page): Locator {
  return page.locator("html");
}

// The round's question as an English screen's title, "Who’s most likely to …?".
function englishQuestion(page: Page): Locator {
  return page.getByRole("heading", { level: 1, name: /^Who’s most likely to .+\?$/ });
}

// The one question of the round as an English screen has to show it, from the Polish sentence of a Polish screen: the
// same id of the base in the other language.
function englishSentence(polishSentence: string, category: string): string {
  const id = BASE.find(
    ([, entry]) => entry.category === category && polishSentence === `Kto z nas najprawdopodobniej ${entry.text}?`,
  )?.[0];
  if (id === undefined) throw new Error("the Polish screen shows a question the base has not");
  const text = ENGLISH_TEXTS[id];
  if (text === undefined) throw new Error("the drawn question has no English text");
  return `Who’s most likely to ${text}?`;
}

// The signed-in host opens a game through the English form of "New game", as a host would: the category by its English
// name, the nick, "Create game". A room an earlier spec left open with guests is closed after the form's own question.
// The form is a React island, whose checkboxes do nothing until it runs, so the first press is retried.
async function createGame(page: Page, nick: string, category: string): Promise<void> {
  await page.goto("/");
  await expect(pageLanguage(page)).toHaveAttribute("lang", "en");
  await expect(page.getByRole("heading", { level: 1, name: "New game", exact: true })).toBeVisible();
  await expect(async () => {
    await page.getByRole("checkbox", { name: category, exact: true }).check({ timeout: 2_000 });
  }).toPass();
  await page.getByRole("textbox", { name: "Your nickname" }).fill(nick);
  await page.getByRole("button", { name: "Create game", exact: true }).click();
  const closeOld = page.getByRole("button", { name: "Close the old room and create the game", exact: true });
  const lobby = page.getByRole("heading", { level: 1, name: "Your room", exact: true });
  await expect(closeOld.or(lobby)).toBeVisible();
  if (await closeOld.isVisible()) await closeOld.click();
  await page.waitForURL((url) => ROOM_PATH.test(url.pathname));
  await expect(lobby).toBeVisible();
}

// joinRoom on an English screen, as retried: the join form is a React island too.
async function joinInEnglish(page: Page, link: string, nick: string): Promise<void> {
  await page.goto(link);
  await expect(pageLanguage(page)).toHaveAttribute("lang", "en");
  await expect(page.getByRole("heading", { level: 1, name: "Join the game", exact: true })).toBeVisible();
  await expect(async () => {
    if (ROOM_PATH.test(new URL(page.url()).pathname)) return;
    await page.getByRole("textbox", { name: "Your nickname" }).fill("");
    await page.getByRole("textbox", { name: "Your nickname" }).fill(nick);
    await page.getByRole("button", { name: "Join", exact: true }).click();
    await page.waitForURL((url) => ROOM_PATH.test(url.pathname), { timeout: 5_000 });
  }).toPass();
  await expect(page.getByRole("heading", { name: `You’re in the game as ${nick}` })).toBeVisible();
}

// One player's vote on an English screen: a person from the list, or null for "Abstain", then "Vote".
async function castEnglishVote(page: Page, target: string | null): Promise<void> {
  await page.getByRole("radio", { name: target ?? "Abstain", exact: true }).check();
  await page.getByRole("button", { name: "Vote", exact: true }).click();
}

test.describe("risks #2 and #3 (two languages) — one game on English and Polish screens", () => {
  test("every player sees the round in their own language, and the switch changes one screen with its vote kept", async ({
    page,
    browser,
  }) => {
    // Three browsers, two joins, three votes and a reload take longer than the default 30 s on a slow runner.
    test.slow();

    if (!CATEGORY) throw new Error("no category has an English text for its every question");

    // Action: the host, whose browser speaks English, opens a game on an English screen.
    const hostNick = uniqueNick("Host");
    await createGame(page, hostNick, CATEGORY_NAMES_EN[CATEGORY.id]);

    // Assertion: the link on the host's English screen ends in ?lang=en (decision 10).
    const linkField = page.getByRole("textbox", { name: "Link for players" });
    await expect(linkField).toHaveValue(/\/j\/[A-Za-z0-9_-]{22}\?lang=en$/);
    const link = await linkField.inputValue();

    // Action and assertion: guest A (an English browser) gets an English page from that link, and guest B (a Polish one)
    // a Polish page from the very same link, as the language of a page is the guest's own. joinRoom reads Polish screens.
    const nickA = uniqueNick("Ola");
    const nickB = uniqueNick("Kuba");
    const guestA = await newGuestContext(browser);
    const guestB = await newGuestContext(browser, "pl-PL");
    const pageA = await guestA.newPage();
    const pageB = await guestB.newPage();
    await joinInEnglish(pageA, link, nickA);
    await joinRoom(pageB, link, nickB);
    await expect(pageLanguage(pageB)).toHaveAttribute("lang", "pl");
    const players = page.getByRole("region", { name: /^Players/ }).getByRole("listitem");
    await expect(players.filter({ hasText: nickA })).toBeVisible({ timeout: ROUND_UPDATE_MS });
    await expect(players.filter({ hasText: nickB })).toBeVisible({ timeout: ROUND_UPDATE_MS });

    // Action: the host starts the game.
    const start = page.getByRole("button", { name: "Start game", exact: true });
    await expect(start).toBeEnabled({ timeout: ROUND_UPDATE_MS });
    await start.click();

    // Assertion: B sees the question in Polish, the host and A the same one in English. Oracle: the question base, one
    // id with its text in each language.
    await expect(roundQuestion(pageB)).toBeVisible({ timeout: ROUND_UPDATE_MS });
    const polish = (await roundQuestion(pageB).textContent()) ?? "";
    const english = englishSentence(polish, CATEGORY.id);
    await expect(englishQuestion(page)).toHaveText(english, { timeout: ROUND_UPDATE_MS });
    await expect(englishQuestion(pageA)).toHaveText(english, { timeout: ROUND_UPDATE_MS });

    // Action: A votes for B on the English screen.
    await castEnglishVote(pageA, nickB);
    await expect(pageA.getByRole("alert").filter({ hasText: "Vote cast" })).toContainText(`Your vote: ${nickB}.`);

    // Setup for the switch: a mark on A's page that any reload would lose.
    await pageA.evaluate(() => {
      document.documentElement.dataset.e2eTab = "the same page";
    });

    // Action: in the middle of the round A switches their own screen to Polish. The page keeps the pick with a request
    // of its own, which the reload below needs.
    const kept = pageA.waitForResponse((res) => new URL(res.url()).pathname === "/api/lang");
    await languageSwitch(pageA, "EN").click();
    await pageA.getByRole("button", { name: "Polski", exact: true }).click();

    // Assertion: A's screen is in Polish with no reload: the question (the one B has), the vote A cast, the page's own
    // language, and the focus on the switch, now in Polish.
    await expect(roundQuestion(pageA)).toHaveText(polish, { timeout: ROUND_UPDATE_MS });
    await expect(voteConfirmation(pageA)).toContainText(`Twój głos: ${nickB}.`);
    await expect(pageLanguage(pageA)).toHaveAttribute("lang", "pl");
    await expect(languageSwitch(pageA, "PL")).toBeFocused();
    await expect(pageLanguage(pageA), "no reload").toHaveAttribute("data-e2e-tab", "the same page");
    expect((await kept).status(), "the pick is kept for A's next pages").toBe(204);

    // Assertion: nobody else's screen changed.
    await expect(pageLanguage(page)).toHaveAttribute("lang", "en");
    await expect(englishQuestion(page)).toHaveText(english);
    await expect(pageLanguage(pageB)).toHaveAttribute("lang", "pl");
    await expect(roundQuestion(pageB)).toHaveText(polish);

    // Action and assertion: after a reload A's screen is still in Polish, though the browser speaks English, with the
    // vote still there.
    await pageA.reload();
    await expect(pageLanguage(pageA), "after a reload").toHaveAttribute("lang", "pl");
    await expect(roundQuestion(pageA)).toHaveText(polish);
    await expect(voteConfirmation(pageA)).toContainText(`Twój głos: ${nickB}.`);

    // Action: the host abstains on the English screen and B votes for A on the Polish one, the last vote.
    await castEnglishVote(page, null);
    await castVote(pageB, nickA);

    // Assertion: one reveal, each in their own language. Oracle, from the votes above: A 1, B 1, the host 0, one
    // abstention.
    const votes: [nick: string, count: number][] = [
      [hostNick, 0],
      [nickA, 1],
      [nickB, 1],
    ];
    await expectReveal(pageA, { question: polish, votes, abstained: 1 });
    await expectReveal(pageB, { question: polish, votes, abstained: 1 });
    const table = page.getByRole("region", { name: "Result", exact: true }).getByRole("table");
    await expect(table).toBeVisible({ timeout: ROUND_UPDATE_MS });
    await expect(englishQuestion(page)).toHaveText(english);
    await expect(table.getByRole("row")).toHaveCount(votes.length + 1);
    for (const [nick, count] of votes) {
      const cell = table.getByRole("row").filter({ hasText: nick }).getByRole("cell").last();
      await expect(cell, `votes of ${nick}`).toHaveText(String(count));
    }
    await expect(page.getByText("Abstained: 1", { exact: true })).toBeVisible();

    // Cleanup: both guests' browsers close. The room, its players and the round's counts stay in the database, because
    // no test deletes its rooms afterwards. CI runs on a throwaway local Supabase; unique nicks keep runs apart.
    await guestA.close();
    await guestB.close();
  });
});
