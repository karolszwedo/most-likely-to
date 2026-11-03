// risk: test-plan.md #6 for the remembered nick (S-14, PRD FR-024): the browser a player last got into a game with
// suggests that nick in the next game's form, a guest's on the next link and the host's in "Nowa gra"; after "nick
// zajęty" the field stays empty, so the taken nick is not offered again (the owner's decision in the change's plan);
// a nick typed before the form runs in the browser stays and is the one posted. The room's screen remembers the nick,
// so only a nick the database took. Laptop window only (project chromium).
// seed: tests/e2e/seed.spec.ts
import { test, expect, type Locator, type Page } from "@playwright/test";
import { comeBackButton, joinRoom, newGuestContext, nextListFetch, openRoom, uniqueNick } from "./support/room";

// The nick field of "Nowa gra" on / and of the join form on /j/<code>.
function nickField(page: Page): Locator {
  return page.getByRole("textbox", { name: "Twój nick" });
}

test.describe("risk #6 (remembered nick) — the next game suggests the nick this browser last got in with", () => {
  test("a guest and the host find their last nick in the next game's form, after nick taken the field is empty, and a nick typed early stays", async ({
    page,
    browser,
    baseURL,
  }) => {
    // Three browsers and two rooms take longer than the default 30 s on a slow runner.
    test.slow();

    // Setup: the signed-in host opens room 1. openRoom waits until the host's screen listens, so the screen has run and
    // remembered the host's nick.
    const room1 = await openRoom(page, baseURL);

    // Setup: guest A joins room 1 from a browser of her own. Her screen remembers her nick once it runs; waiting for its
    // first list fetch means it has. The wait starts before the page loads.
    const nickA = uniqueNick("Ola");
    const guestA = await newGuestContext(browser);
    const pageA = await guestA.newPage();
    const listeningA = nextListFetch(pageA, room1.id);
    await joinRoom(pageA, room1.link, nickA);
    await listeningA;

    // Action: the host goes to "Nowa gra".
    await page.goto("/");

    // Assertion: the host's last nick is in the field. The page arrives with the field empty and the form fills it once
    // it runs in the browser, which toHaveValue waits for.
    await expect(nickField(page)).toHaveValue(room1.hostNick);

    // Setup: the host opens room 2, which closes room 1 (openRoom confirms the close).
    const room2 = await openRoom(page, baseURL);

    // Action: guest A opens room 2's link in the same browser.
    await pageA.goto(room2.link);

    // Assertion: her last nick is in the join form's field.
    await expect(nickField(pageA)).toHaveValue(nickA);

    // Setup: guest B, in a browser of his own, gets into room 2 first, with A's nick.
    const guestB = await newGuestContext(browser);
    await joinRoom(await guestB.newPage(), room2.link, nickA);

    // Action: A presses "Dołącz" on the form that still has her suggested nick, now taken.
    await pageA.getByRole("button", { name: "Dołącz", exact: true }).click();

    // Assertion: A stays on the link with the "nick taken" refusal, told by its code in the address, never by its Polish
    // text (test-plan §6.4). Since S-04 the page asks "To ty?" with the request to come back to that place instead of the
    // refusal's alert (context/changes/rejoin-after-refresh/plan.md, Faza 4, layout C).
    const linkPath = new URL(room2.link).pathname;
    await pageA.waitForURL((url) => url.pathname === linkPath && url.searchParams.get("error") === "nick_taken");
    await expect(comeBackButton(pageA)).toBeVisible();

    // Assertion: the field for another nick is empty, so the taken nick is not offered again, though this browser still
    // remembers it (the same form showed it on this link above). The page arrives with the field empty and only the
    // form, once it runs in the browser, could fill it; nothing on the page shows when it has run, so the check first
    // waits for the page's scripts to have loaded and run (no request for 500 ms).
    await pageA.waitForLoadState("networkidle");
    await expect(pageA.getByRole("textbox", { name: "Inny nick" })).toHaveValue("");

    // Setup: A opens room 2's link again, where the form may suggest her remembered nick, but her form's script is held
    // back until she has typed a new nick, as on a slow phone. Routing also turns off the browser's cache, so the
    // script is fetched again. (impl-review F1 of remembered-nick)
    const newNickA = uniqueNick("Nowa");
    let releaseForm = (): void => undefined;
    const typed = new Promise<void>((resolve) => {
      releaseForm = resolve;
    });
    await pageA.route(/\/_astro\/JoinForm\.[\w-]+\.js$/, async (route) => {
      await typed;
      await route.continue();
    });
    await pageA.goto(room2.link);

    // Action: A types her new nick before the form runs, then the form's script arrives.
    await nickField(pageA).fill(newNickA);
    releaseForm();

    // Assertion: once the form runs, its counter counts the typed nick (the page arrived with 0/20, so this shows the
    // form has run), and the field still has it, not the remembered nick.
    await expect(pageA.getByText(`${String(newNickA.length)}/20`, { exact: true })).toBeVisible();
    await expect(nickField(pageA)).toHaveValue(newNickA);

    // Assertion: "Dołącz" takes her in under the nick she typed.
    await pageA.getByRole("button", { name: "Dołącz", exact: true }).click();
    await expect(pageA.getByRole("heading", { name: `Jesteś w grze jako ${newNickA}` })).toBeVisible();

    // Cleanup: both guests' browsers close. Both rooms and their players stay in the database, because nothing can
    // delete them yet (S-13); the next test's room closes room 2. CI runs on a throwaway local Supabase; unique nicks
    // keep runs apart.
    await guestA.close();
    await guestB.close();
  });
});
