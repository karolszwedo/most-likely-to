// risk: S-16 (PRD FR-023), a player's emote reaches the whole room: a guest taps an emote and every screen of the room
// hears "<nick>: <emote's name>", the guest's too (the emote comes back on the room's players' channel), for a moment;
// the guest's bar rests for 3 s after the tap and then works again; nobody waits for an emote, so the host starts the
// game at once and the emotes go on during the vote. The oracle is Karol's decision of 2026-10-26
// (context/changes/room-emotes/change.md, Notes): six emotes, with the sender's nick. The bubble itself is hidden from
// a screen reader, so the steps read the screen's announcement. Plays in a laptop's window (project chromium, where
// the bar stands upright at the window's right edge from 1280 px) and in a phone's (project phone, the bar fixed to
// the window's bottom); every player's window is checked first (test-plan §6.4, "Spec w oknie telefonu").
// seed: tests/e2e/seed.spec.ts
import { test, expect, type Locator, type Page } from "@playwright/test";
import { EMOTE_COOLDOWN_MS, EMOTE_SHOW_MS } from "../../src/lib/rooms/emotes";
import { joinRoom, newGuestContext, openRoom, playerRow, uniqueNick } from "./support/room";
import { ROUND_UPDATE_MS, roundQuestion, startGame } from "./support/round";

// Tailwind's lg (64rem): from this window width the room has its wide layout (AGENTS.md "## UI").
const LG_WIDTH = 1024;

// The six emotes' names in Karol's order, written out by hand.
const EMOTE_NAMES = ["Serce", "Kciuk w górę", "Kciuk w dół", "Płacz", "Wkurzenie", "Czaszka"];

// One emote's button in the screen's "Emotki" bar (src/components/room/EmoteBar.tsx).
function emoteButton(page: Page, name: string): Locator {
  return page.getByRole("group", { name: "Emotki" }).getByRole("button", { name, exact: true });
}

// What a screen reader hears of the newest emote on the screen (src/components/room/EmoteBubbles.tsx).
function emoteNews(page: Page, nick: string, name: string): Locator {
  return page.getByText(`${nick}: ${name}`, { exact: true });
}

test.describe("S-16 (emotes) — a guest's emote reaches every screen of the room", () => {
  test("everyone hears the emote with the guest's nick, the guest's bar rests 3 s, and the game goes on", async ({
    page,
    browser,
    baseURL,
  }) => {
    // Three browsers, two joins, two emotes and the 3 s rest take longer than the default 30 s on a slow runner.
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

    // Setup check: every player has the six emotes in view, in Karol's order.
    for (const [who, screen] of screens) {
      const buttons = screen.getByRole("group", { name: "Emotki" }).getByRole("button");
      await expect(buttons, `${who}'s emotes`).toHaveCount(EMOTE_NAMES.length);
      for (const [index, name] of EMOTE_NAMES.entries()) {
        await expect(buttons.nth(index), `${who}'s emote ${String(index + 1)}`).toHaveAccessibleName(name);
        await expect(buttons.nth(index)).toBeInViewport();
      }
    }

    // Action: guest A taps "Serce" in the lobby.
    await emoteButton(pageA, "Serce").click();

    // Assert: every button of A's bar rests, still focusable: aria-disabled, never the disabled attribute. (Not
    // toBeEnabled: Playwright counts aria-disabled as disabled, so it would wait out the rest.)
    for (const name of EMOTE_NAMES) {
      await expect(emoteButton(pageA, name), `A's ${name} rests`).toHaveAttribute("aria-disabled", "true");
      await expect(emoteButton(pageA, name), `A's ${name} stays focusable`).not.toHaveAttribute("disabled");
    }
    // Assert: every screen, A's own too, hears "A: Serce".
    for (const [who, screen] of screens) {
      await expect(emoteNews(screen, nickA, "Serce"), `${who} hears A's heart`).toBeAttached({
        timeout: ROUND_UPDATE_MS,
      });
    }

    // Action: the host starts the game at once; nobody waits for an emote.
    await startGame(page);
    for (const [who, screen] of screens) {
      await expect(roundQuestion(screen), `${who}'s question`).toBeVisible({ timeout: ROUND_UPDATE_MS });
    }

    // Assert: A's bar works again once the rest is over, and A's emote leaves every screen after its moment.
    for (const name of EMOTE_NAMES) {
      await expect(emoteButton(pageA, name), `A's ${name} after the rest`).not.toHaveAttribute("aria-disabled", {
        timeout: EMOTE_COOLDOWN_MS + ROUND_UPDATE_MS,
      });
    }
    for (const [who, screen] of screens) {
      await expect(emoteNews(screen, nickA, "Serce"), `A's heart leaves ${who}'s screen`).toHaveCount(0, {
        timeout: EMOTE_SHOW_MS + ROUND_UPDATE_MS,
      });
    }

    // Action: during the vote guest B taps "Czaszka".
    await emoteButton(pageB, "Czaszka").click();

    // Assert: the host and A hear "B: Czaszka" on the vote's screen.
    for (const [who, screen] of screens) {
      await expect(emoteNews(screen, nickB, "Czaszka"), `${who} hears B's skull`).toBeAttached({
        timeout: ROUND_UPDATE_MS,
      });
    }

    await guestA.close();
    await guestB.close();
  });
});
