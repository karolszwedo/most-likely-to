// risk: the player's own colour (S-18, PRD FR-025): a guest picks a free colour from the palette under her own row on
// the list "Gracze", a colour another player has is greyed and cannot be picked, and the other screens show the new
// colour without a reload, through the room's bell; in the next game the same browser gets the colour its player
// picked last time (context/changes/player-color-choice/plan.md, Faza 3 #5). Colours are told by their number on the
// dots (data-color) and the palette's swatches (data-swatch), the order of the palette: the other players' dots are
// aria-hidden, and the colours' names are not on the screen. Expected numbers are written out by hand from the room's
// order: the host gets 0, the next player the first free one. Laptop window only (project chromium).
// seed: tests/e2e/seed.spec.ts
import { test, expect, type Locator, type Page } from "@playwright/test";
import { LOBBY_POLL_MS } from "../../src/lib/live-sync/shared";
import { joinRoom, newGuestContext, nextListFetch, openRoom, playerRow, uniqueNick } from "./support/room";

// The screen's own dot, the button that opens and closes the palette.
function ownDot(page: Page): Locator {
  return page.getByRole("region", { name: /^Gracze/ }).getByRole("button", { name: /Zmień kolor$/ });
}

// The palette under the own row.
function palette(page: Page): Locator {
  return page.getByRole("region", { name: /^Gracze/ }).getByRole("group", { name: "Kolory" });
}

function swatch(page: Page, color: number): Locator {
  return palette(page).locator(`[data-swatch="${String(color)}"]`);
}

// Another player's dot on this screen's list.
function dotOf(page: Page, nick: string): Locator {
  return playerRow(page, nick).locator("[data-color]");
}

test.describe("S-18 — the player picks their own colour", () => {
  test("gość wybiera kolor: a taken colour cannot be picked, and the host sees the new colour without a reload", async ({
    page,
    browser,
    baseURL,
  }) => {
    test.slow();

    // Setup: the signed-in host opens a fresh room (colour 0) and guest A joins (the first free colour, 1).
    const room = await openRoom(page, baseURL);
    const nickA = uniqueNick("Ola");
    const guestA = await newGuestContext(browser);
    const pageA = await guestA.newPage();
    const listeningA = nextListFetch(pageA, room.id);
    await joinRoom(pageA, room.link, nickA);
    await listeningA;
    await expect(ownDot(pageA)).toHaveAttribute("data-color", "1");
    await expect(dotOf(pageA, room.hostNick)).toHaveAttribute("data-color", "0");

    // Setup: the host's screen loads again just before A's pick and waits for its first list fetch, so a change shown
    // sooner than LOBBY_POLL_MS from now came with the bell, not with the screen's own poll (test-plan §6.4, "Bell vs
    // poll").
    await expect(dotOf(page, nickA)).toHaveAttribute("data-color", "1");
    const hostListening = nextListFetch(page, room.id);
    const reloadedAt = Date.now();
    await page.reload();
    await hostListening;

    // Action: A opens the palette under her own row.
    await ownDot(pageA).click();
    await expect(ownDot(pageA)).toHaveAttribute("aria-expanded", "true");

    // Assertion: her own colour is the pressed one, and the host's is greyed but still focusable (aria-disabled, never
    // disabled; toBeEnabled would count aria-disabled as disabled, test-plan §6.4).
    await expect(swatch(pageA, 1)).toHaveAttribute("aria-pressed", "true");
    await expect(swatch(pageA, 0)).toHaveAttribute("aria-disabled", "true");
    await expect(swatch(pageA, 0)).not.toHaveAttribute("disabled");
    await expect(swatch(pageA, 7)).not.toHaveAttribute("aria-disabled");

    // Action: a tap on the host's colour changes nothing (force: Playwright itself would wait for an aria-disabled
    // button to become enabled); then A picks colour 7, which is free.
    await swatch(pageA, 0).click({ force: true });
    await expect(palette(pageA)).toBeVisible();
    await expect(ownDot(pageA)).toHaveAttribute("data-color", "1");
    await swatch(pageA, 7).click();

    // Assertion: A's palette closes, the focus goes back to her dot, and the dot has the new colour.
    await expect(palette(pageA)).toHaveCount(0);
    await expect(ownDot(pageA)).toBeFocused();
    await expect(ownDot(pageA)).toHaveAttribute("data-color", "7");

    // Assertion: the host's screen shows A's new colour without a reload, sooner than its own poll could have.
    await expect(dotOf(page, nickA)).toHaveAttribute("data-color", "7");
    expect(Date.now() - reloadedAt, "A's colour reached the host only after the poll could have run").toBeLessThan(
      LOBBY_POLL_MS,
    );

    // Assertion: in the host's own palette A's colour is now taken and A's old one is free.
    await ownDot(page).click();
    await expect(swatch(page, 7)).toHaveAttribute("aria-disabled", "true");
    await expect(swatch(page, 1)).not.toHaveAttribute("aria-disabled");

    // Cleanup: the guest's browser closes; the room and its players stay in the database until S-13.
    await guestA.close();
  });

  test("zapamiętany kolor: in the next game the same browser gets the colour its player picked", async ({
    page,
    browser,
    baseURL,
  }) => {
    test.slow();

    // Setup: room 1 with the host (0) and guest A (1); A picks colour 9 from the palette, which this browser remembers.
    const room1 = await openRoom(page, baseURL);
    const nickA = uniqueNick("Ola");
    const guestA = await newGuestContext(browser);
    const pageA = await guestA.newPage();
    const listening1 = nextListFetch(pageA, room1.id);
    await joinRoom(pageA, room1.link, nickA);
    await listening1;
    await ownDot(pageA).click();
    await swatch(pageA, 9).click();
    await expect(ownDot(pageA)).toHaveAttribute("data-color", "9");

    // Setup: the host opens room 2, which closes room 1 (openRoom confirms the close).
    const room2 = await openRoom(page, baseURL);

    // Action: A joins room 2 from the same browser. The game gives her the first free colour, 1, on the way in.
    await joinRoom(pageA, room2.link, nickA);

    // Assertion: her screen asks for the remembered colour at once, so she has 9 on her own screen and on the host's,
    // with no tap of hers.
    await expect(ownDot(pageA)).toHaveAttribute("data-color", "9");
    await expect(dotOf(page, nickA)).toHaveAttribute("data-color", "9");

    // Cleanup: the guest's browser closes; both rooms stay in the database until S-13.
    await guestA.close();
  });
});
