// risk: S-23 (PRD FR-028), the room's chat: a player's message reaches the whole room with the sender's nick, in the
// lobby, during the vote, on the reveal and on the end of the evening, the sender's own screen too (the message comes
// back on the room's players' channel, signed by the Worker); the sender's "Wyślij wiadomość" rests 2 s after a message
// and then works again; and when a leader removes a player, that player's messages leave the chat on every other
// screen. The oracle is Karol's decisions of 2026-11-17 (context/changes/room-chat/plan.md, Overview: decision 1, a
// 2 s pause; decision 2, a removal takes the player's messages; change.md: the chat all the time). Each message is read
// in the region "Czat" as a screen reader reads its line, "<nick>: <text>"; the texts are written out by hand. Plays in
// a laptop's window (project chromium, 1280 px: from xl the chat is a panel at the window's left edge, always open) and
// in a phone's (project phone: the chat folded behind the button "Czat", unfolded to read or write and folded again, so
// its panel never covers the game's buttons); every player's window is checked first (test-plan §6.4, "Spec w oknie
// telefonu"). A message sent before a screen listens on the room's players' topic is lost, as the chat keeps nothing,
// so the test waits for each screen's join first (tests/e2e/support/live.ts, watchJoins).
// seed: tests/e2e/seed.spec.ts
import { test, expect, type Locator, type Page } from "@playwright/test";
import { CHAT_COOLDOWN_MS } from "../../src/lib/rooms/chat";
import { channelKeyOf, playersTopic, watchJoins, type TopicJoins } from "./support/live";
import { joinRoom, newGuestContext, openRoom, playerRow, removePlayer, uniqueNick } from "./support/room";
import {
  castVote,
  endGame,
  eveningEnd,
  expectFreshVote,
  nextQuestion,
  resultTable,
  ROUND_UPDATE_MS,
  roundQuestion,
  startGame,
  voteConfirmation,
} from "./support/round";

// Tailwind's lg (64rem): from this window width the room has its wide layout (AGENTS.md "## UI").
const LG_WIDTH = 1024;

// The messages, each one once in the test, with Polish letters and an emoji.
const LOBBY_TEXT = "Cześć wszystkim! Gramy? 🎉";
const VOTING_TEXT = "Ja stawiam na hosta 😂";
const REVEAL_TEXT = "Mówiłem! Zgadłem wynik 💀";
const END_TEXT = "Dziękuję za wieczór, do następnego 👋";

type Screens = readonly (readonly [who: string, page: Page])[];

// The screen's chat (src/components/room/RoomChat.tsx): a region under its heading "Czat".
function chatRegion(page: Page): Locator {
  return page.getByRole("region", { name: "Czat", exact: true });
}

// One message on the screen's chat, as a screen reader reads its line: "<nick>: <text>".
function chatLine(page: Page, nick: string, text: string): Locator {
  return chatRegion(page)
    .getByRole("listitem")
    .filter({ hasText: `${nick}: ${text}` });
}

function chatField(page: Page): Locator {
  return chatRegion(page).getByRole("textbox", { name: "Wiadomość na czacie", exact: true });
}

function sendButton(page: Page): Locator {
  return chatRegion(page).getByRole("button", { name: "Wyślij wiadomość", exact: true });
}

// Below lg the chat is folded behind the button "Czat" (Karol's pick T2), which unfolds it; from lg the chat always
// stands (a section under the view, from xl the panel at the window's left edge), with no such button.
async function openChat(page: Page): Promise<void> {
  const unfold = page.getByRole("button", { name: /^Czat/ });
  if (await unfold.isVisible()) await unfold.click();
  await expect(chatRegion(page)).toBeVisible();
}

// Below lg folds the chat again ("Zwiń"), so its panel, fixed over the window's lower part, covers none of the game's
// buttons; from lg there is nothing to fold.
async function foldChat(page: Page): Promise<void> {
  const fold = chatRegion(page).getByRole("button", { name: "Zwiń", exact: true });
  if (!(await fold.isVisible())) return;
  await fold.click();
  await expect(chatRegion(page)).toBeHidden();
}

// A player writes on their own screen and presses "Wyślij wiadomość", once the button rests no more. Not
// toBeEnabled: Playwright counts aria-disabled as disabled (emotes.spec.ts).
async function writeMessage(page: Page, text: string): Promise<void> {
  await openChat(page);
  await expect(sendButton(page), "the button rests no more").not.toHaveAttribute("aria-disabled", {
    timeout: CHAT_COOLDOWN_MS + ROUND_UPDATE_MS,
  });
  await chatField(page).fill(text);
  await sendButton(page).click();
}

// The Worker took the message: the field is empty again.
async function expectSent(page: Page, who: string): Promise<void> {
  await expect(chatField(page), `${who}'s field is empty once the message is in`).toHaveValue("");
}

// Every screen has the message on its chat, with the sender's nick.
async function expectOnEveryChat(screens: Screens, nick: string, text: string, what: string): Promise<void> {
  for (const [who, screen] of screens) {
    await openChat(screen);
    await expect(chatLine(screen, nick, text), `${who} reads ${what}`).toBeVisible({ timeout: ROUND_UPDATE_MS });
    await foldChat(screen);
  }
}

// Every screen listens on the players' topic of this channel key.
async function expectListening(joins: readonly (readonly [string, TopicJoins])[], key: string): Promise<void> {
  for (const [who, watch] of joins) {
    await expect
      .poll(() => watch.joined(playersTopic(key)), {
        message: `${who}'s screen joined the room's players' topic`,
        timeout: ROUND_UPDATE_MS,
      })
      .toBe(true);
  }
}

test.describe("S-23 (room chat) — a player's message reaches the whole room", () => {
  test("everyone reads it with the nick in every state, the button rests 2 s, and a removed player's messages go", async ({
    page,
    browser,
    baseURL,
  }) => {
    // Three browsers, two joins, four messages read on every screen, two rounds and a removal take longer than 30 s.
    test.slow();
    if (!baseURL) throw new Error("baseURL is not set (playwright.config.ts)");

    // Setup: every screen's sockets are watched from the first frame; the signed-in host opens a fresh room, and guests
    // A and B join it from browsers of their own.
    const hostJoins = watchJoins(page);
    const room = await openRoom(page, baseURL);
    const nickA = uniqueNick("Ola");
    const nickB = uniqueNick("Kuba");
    const guestA = await newGuestContext(browser);
    const guestB = await newGuestContext(browser);
    const pageA = await guestA.newPage();
    const pageB = await guestB.newPage();
    const joinsA = watchJoins(pageA);
    const joinsB = watchJoins(pageB);
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

    // Setup check: every screen listens on the players' topic of the room's key (K1), and has the chat's field in view
    // once the chat is open.
    const k1 = await channelKeyOf(guestA, baseURL, room.id);
    await expectListening(
      [
        ["the host", hostJoins],
        ["guest A", joinsA],
        ["guest B", joinsB],
      ],
      k1,
    );
    for (const [who, screen] of screens) {
      await openChat(screen);
      await expect(chatField(screen), `${who}'s field`).toBeInViewport();
      await foldChat(screen);
    }

    // Action: in the lobby guest A writes.
    await writeMessage(pageA, LOBBY_TEXT);

    // Assert: A's button rests at once, still focusable (aria-disabled, never the disabled attribute); the message goes
    // in, the focus stays in the field for the next one, and after the pause the button works again.
    await expect(sendButton(pageA), "A's button rests").toHaveAttribute("aria-disabled", "true");
    await expect(sendButton(pageA), "A's button stays focusable").not.toHaveAttribute("disabled");
    await expectSent(pageA, "A");
    await expect(chatField(pageA), "A's focus stays in the field").toBeFocused();
    await expect(sendButton(pageA), "A's button after the pause").not.toHaveAttribute("aria-disabled", {
      timeout: CHAT_COOLDOWN_MS + ROUND_UPDATE_MS,
    });
    await foldChat(pageA);

    // Assert: every screen, A's own too, reads "A: <text>".
    await expectOnEveryChat(screens, nickA, LOBBY_TEXT, "A's message in the lobby");

    // Action: the host starts the game; during the vote guest B writes.
    await startGame(page);
    for (const [who, screen] of screens) {
      await expect(roundQuestion(screen), `${who}'s question`).toBeVisible({ timeout: ROUND_UPDATE_MS });
    }
    await writeMessage(pageB, VOTING_TEXT);
    await expectSent(pageB, "B");
    await foldChat(pageB);

    // Assert: every screen reads B's message on the vote's screen.
    await expectOnEveryChat(screens, nickB, VOTING_TEXT, "B's message during the vote");

    // Action: everyone votes for A, so B's vote, the last one, reveals the round; on the reveal B writes again.
    await castVote(page, nickA);
    await expect(voteConfirmation(page)).toBeVisible();
    await castVote(pageA, nickA);
    await expect(voteConfirmation(pageA)).toBeVisible();
    await castVote(pageB, nickA);
    for (const [who, screen] of screens) {
      await expect(resultTable(screen), `${who}'s reveal`).toBeVisible({ timeout: ROUND_UPDATE_MS });
    }
    await writeMessage(pageB, REVEAL_TEXT);
    await expectSent(pageB, "B");
    await foldChat(pageB);

    // Assert: every screen reads B's message on the reveal.
    await expectOnEveryChat(screens, nickB, REVEAL_TEXT, "B's message on the reveal");

    // Action: the host opens the next question, votes and removes B from the list "Gracze" (shown after the host's own
    // vote).
    await nextQuestion(page);
    await expectFreshVote(page);
    await castVote(page, nickA);
    await expect(voteConfirmation(page)).toBeVisible();
    await removePlayer(page, nickB);
    await expect(playerRow(page, nickB)).toHaveCount(0, { timeout: ROUND_UPDATE_MS });

    // Assert: both of B's messages leave the host's and A's chat once their state comes without B (decision 2), and
    // A's message stays.
    for (const [who, screen] of [
      ["the host", page],
      ["guest A", pageA],
    ] as const) {
      await openChat(screen);
      await expect(chatLine(screen, nickB, VOTING_TEXT), `B's message of the vote leaves ${who}'s chat`).toHaveCount(
        0,
        { timeout: ROUND_UPDATE_MS },
      );
      await expect(chatLine(screen, nickB, REVEAL_TEXT), `B's message of the reveal leaves ${who}'s chat`).toHaveCount(
        0,
      );
      await expect(chatLine(screen, nickA, LOBBY_TEXT), `A's message stays on ${who}'s chat`).toBeVisible();
      await foldChat(screen);
    }

    // Action: the host ends the game.
    await endGame(page);
    for (const [who, screen] of [
      ["the host", page],
      ["guest A", pageA],
    ] as const) {
      await expect(eveningEnd(screen), `${who}'s end of the evening`).toBeVisible({ timeout: ROUND_UPDATE_MS });
    }

    // Setup check: the removal replaced the room's channel key (K2), and the host's and A's screens listen on its topic.
    const k2 = await channelKeyOf(guestA, baseURL, room.id);
    expect(k2 === k1, "the removal replaced the room's channel key").toBe(false);
    await expectListening(
      [
        ["the host", hostJoins],
        ["guest A", joinsA],
      ],
      k2,
    );

    // Action: on the end of the evening guest A writes.
    await writeMessage(pageA, END_TEXT);
    await expectSent(pageA, "A");
    await foldChat(pageA);

    // Assert: the chat goes on after the game: the host and A read A's message.
    await expectOnEveryChat(
      [
        ["the host", page],
        ["guest A", pageA],
      ],
      nickA,
      END_TEXT,
      "A's message on the end of the evening",
    );

    await guestA.close();
    await guestB.close();
  });
});
