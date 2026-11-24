// risk: S-23 (PRD FR-028), the room's chat: a player's message reaches the whole room with the sender's nick, in the
// lobby, during the vote, on the reveal and on the end of the evening, the sender's own screen too (the message comes
// back on the room's players' channel, signed by the Worker); the sender's "Wyślij wiadomość" rests 2 s after a message
// and then works again; and when a leader removes a player, that player's messages leave the chat on every other
// screen. The oracle is Karol's decisions of 2026-11-17 (context/archive/2026-11-17-room-chat/plan.md, Overview:
// decision 1, a 2 s pause; decision 2, a removal takes the player's messages; change.md: the chat all the time). Each
// message is read in the region "Czat" as a screen reader reads its line, "<nick>: <text>"; the texts are written out
// by hand. Plays in a laptop's window (project chromium, 1280 px: from xl the chat is a panel at the window's left
// edge, always open) and in a phone's (project phone: the chat folded behind the button "Czat", unfolded to read or
// write and folded again, so its panel never covers the game's buttons); every player's window is checked first
// (test-plan §6.4, "Spec w oknie telefonu"). A message sent before a screen listens on the room's players' topic is
// lost, as the chat keeps nothing, so the test waits for each screen's join first (tests/e2e/support/live.ts,
// watchJoins). Last, with long messages on the chat and a window as low as a phone's with its keyboard open, the field
// stays whole in view and a tap reaches it, not the emotes' bar, as the list scrolls inside the chat (impl-review F1).
//
// S-24 (PRD FR-028, gifs; context/changes/room-chat-gifs/plan.md, Faza 3 #5), in the same room (the account's budget
// of games): a real gif in the browser on all three screens, with KLIPY answered by a stub in every browser
// (tests/e2e/support/klipy.ts: a trimmed real answer, the media a tiny image, nothing ever reaches KLIPY). In the lobby
// guest A opens "GIF" (the field says "Search KLIPY", as KLIPY requires), searches a word and picks the second result
// of KLIPY's order; every screen shows that gif under A's nick, with KLIPY's address of the chat's file exactly as it
// came and its description, the image loaded through the Content-Security-Policy. The search goes to KLIPY with the
// word and the strictest filter, with no customer_id, nothing of the game in its address and no Referer (decisions 2
// and 3), the images with no Referer either. During the vote B sends a gif too, and B's removal takes it with B's
// messages, while A's gif stays. On the end of the evening KLIPY answers 429: A's search says the limit, and A's text
// message still reaches the room. The same controls by role and name at every width.
//
// S-29 (chat-composer, R1), in the same room: the oracle is Karol's decision 1 of 2026-11-23
// (context/changes/chat-composer/research.md, Open Questions), after a friend's word for the gif search went to the
// whole room as a message in the first game: the open search takes the writing row's place, so the chat has one text
// field at a time (below xl a strip under the list, from xl in the panel's list place too). With A's search open at
// KLIPY's limit, A's chat has no field "Wiadomość na czacie" and no "Wyślij wiadomość", and exactly one "GIF", open
// (aria-expanded "true"), at the start of the search's row; the search's way back ("Wróć do pisania" below xl, "Wróć do
// czatu" from xl) closes it with the focus in the message field.
//
// S-29 (chat-composer, E1 + K1), in the same room, right after: the oracle is Karol's decisions 2 and 3 of 2026-11-23
// (research.md, Open Questions: the grid over the message field with the field in sight, the focus off the field so
// the phone's keyboard goes; his 33 emoji in his order) and his decision of the same day in the plan's conversation (a
// tap of the field closes the grid), all written out here. A types "ab", moves the caret back one character and opens
// "Emoji": the group "Emoji" holds the 33 emoji in Karol's order, the first one has the focus, the field stands in
// sight without it. 😂 and 🔥 go in where the caret stood, one after the other, and the field holds exactly "a😂🔥b", still
// without the focus. "GIF" closes the grid and opens the search, "GIF" again closes the search; "Emoji" and Escape
// close the grid with the focus on "Emoji"; "Emoji" and a click of the field close it with the focus in the field and
// the text untouched. A sends it, and the host and A read "a😂🔥b" under A's nick. In the low window at the end, with
// the grid open, the field still stands whole in view and a tap reaches it. The group "Emoji" stands outside the
// emotes' group "Emotki" (emotes.spec.ts counts its six).
// seed: tests/e2e/seed.spec.ts
import { test, expect, type Locator, type Page } from "@playwright/test";
import { CHAT_COOLDOWN_MS } from "../../src/lib/rooms/chat";
import { KLIPY_GIFS, stubKlipy, type KlipyGif, type KlipyRequest } from "./support/klipy";
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
// Two long messages (151 and 163 characters), a few lines each in a phone's column, and one written with the keyboard.
const LONG_HOST_TEXT =
  "Ostatnia runda była najlepsza z całego wieczoru, serio. Następnym razem gramy dłużej, bo piętnaście pytań to za mało, a pizza i tak zostanie do jutra 🍕";
const LONG_A_TEXT =
  "Zgadzam się w stu procentach i dorzucam jeszcze jedno: w przyszłym tygodniu u mnie, przynieście tylko dobre humory, a ja ogarnę napoje i przekąski dla wszystkich 🎉";
const KEYBOARD_TEXT = "Piszę z klawiaturą na pół ekranu ⌨️";

// The words of the gif searches; the stub answers the same results whatever the word.
const GIF_WORD = "kot";
const LIMIT_WORD = "pies";
// The start of the search's message once KLIPY's limit for the hour is used up (Karol's decision: a message in the
// search, the text chat goes on), written out by hand.
const LIMIT_TEXT = "Gify na tę godzinę się skończyły.";
// The address of the test's own call to KLIPY's API, which sends its Referer on purpose (the positive control of "no
// Referer"); the stub answers it as any call to the API.
const CONTROL_URL = "https://api.klipy.com/api/v1/control";

// The chat's emoji grid in Karol's order (decision 3 of 2026-11-23), written out by hand.
const GRID_EMOJI = [
  "😂",
  "🤣",
  "😭",
  "💀",
  "😱",
  "🤯",
  "😳",
  "🫨",
  "🤨",
  "🧐",
  "👀",
  "🙄",
  "🤔",
  "😏",
  "😬",
  "🙈",
  "😅",
  "🤦",
  "🤷",
  "🥴",
  "🥺",
  "😍",
  "😎",
  "😈",
  "🤬",
  "🤡",
  "🗿",
  "🔥",
  "💯",
  "👏",
  "👉",
  "🥳",
  "🍻",
];
// What A types before the emoji, and the message once 😂 and 🔥 went in where the caret stood, between "a" and "b".
const EMOJI_DRAFT = "ab";
const EMOJI_TEXT = "a😂🔥b";

// A phone's window with its keyboard open (390×844 halved, about what Android leaves under the room's
// interactive-widget=resizes-content): the open chat may take at most half of it.
const KEYBOARD_WINDOW_HEIGHT = 480;

type Screens = readonly (readonly [who: string, page: Page])[];

// What of the game must never go to KLIPY, by name; the values never go into a message (the channel keys among them).
type GameValues = Readonly<Record<string, string>>;

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

// A gif on the screen's chat: the image under the sender's nick, named by its description (its alt).
function gifLine(page: Page, nick: string, title: string): Locator {
  return chatRegion(page)
    .getByRole("listitem")
    .filter({ hasText: nick })
    .getByRole("img", { name: title, exact: true });
}

function chatField(page: Page): Locator {
  return chatRegion(page).getByRole("textbox", { name: "Wiadomość na czacie", exact: true });
}

function sendButton(page: Page): Locator {
  return chatRegion(page).getByRole("button", { name: "Wyślij wiadomość", exact: true });
}

// The chat's button "GIF" (named "GIF: wyszukaj gifa", its visible text first: WCAG 2.5.3) next to the message field, there when the room's page has a gif
// search key (CI writes a fake one into .dev.vars); it opens the gif search, and closes it again from the start of the
// search's row (one button, chat-composer R1).
function gifButton(page: Page): Locator {
  return chatRegion(page).getByRole("button", { name: "GIF: wyszukaj gifa", exact: true });
}

// The chat's button "Emoji" (a smile, its name for a screen reader) in the writing row after "GIF", which opens the
// emoji grid over the message field and closes it again (chat-composer, E1).
function emojiButton(page: Page): Locator {
  return chatRegion(page).getByRole("button", { name: "Emoji", exact: true });
}

// The chat's emoji grid: a group named "Emoji", each button named by its emoji.
function emojiGrid(page: Page): Locator {
  return chatRegion(page).getByRole("group", { name: "Emoji", exact: true });
}

// The chat's gif search (src/components/room/GifPicker.tsx), one region at every width.
function gifSearch(page: Page): Locator {
  return chatRegion(page).getByRole("region", { name: "Wyszukiwarka gifów", exact: true });
}

function gifField(page: Page): Locator {
  return gifSearch(page).getByRole("textbox", { name: "Szukaj gifa", exact: true });
}

// The search's results, each a button "Wyślij gifa: <description>".
function gifResults(page: Page): Locator {
  return gifSearch(page).getByRole("list", { name: "Wyniki wyszukiwania", exact: true }).getByRole("button");
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

// true when a tap in the middle of the chat's field reaches the field itself, not something fixed over it (below lg the
// emotes' bar at the window's bottom, src/components/room/EmoteBar.tsx).
function reachesField(page: Page): Promise<boolean> {
  return chatField(page).evaluate((field) => {
    const box = field.getBoundingClientRect();
    const hit = document.elementFromPoint(box.left + box.width / 2, box.top + box.height / 2);
    return hit !== null && (hit === field || field.contains(hit));
  });
}

// A player opens "GIF" on their own screen, which takes the focus to the search's field (its text as KLIPY requires
// it), types a word and presses "Szukaj".
async function searchGifs(page: Page, word: string): Promise<void> {
  await openChat(page);
  await gifButton(page).click();
  await expect(gifField(page), "the search's field takes the focus").toBeFocused();
  await expect(gifField(page), "the search's field says what KLIPY requires").toHaveAttribute(
    "placeholder",
    "Search KLIPY",
  );
  await gifField(page).fill(word);
  await gifSearch(page).getByRole("button", { name: "Szukaj", exact: true }).click();
}

// A player presses the result at this place of KLIPY's order, once the results rest no more (the pause after a
// message or a gif); aria-disabled, as for "Wyślij wiadomość".
async function pickGif(page: Page, index: number): Promise<void> {
  const result = gifResults(page).nth(index);
  await expect(result, "the result at its place of KLIPY's order").toHaveAccessibleName(
    `Wyślij gifa: ${KLIPY_GIFS[index].title}`,
  );
  await expect(result, "the results rest no more").not.toHaveAttribute("aria-disabled", {
    timeout: CHAT_COOLDOWN_MS + ROUND_UPDATE_MS,
  });
  await result.click();
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

// Every screen shows the gif on its chat under the sender's nick: the address of KLIPY's chat file (sm) exactly as the
// answer gave it, the description as its name, and the image loaded (through the stub, past the CSP's img-src).
async function expectGifOnEveryChat(screens: Screens, nick: string, gif: KlipyGif, what: string): Promise<void> {
  for (const [who, screen] of screens) {
    await openChat(screen);
    const image = gifLine(screen, nick, gif.title);
    await expect(image, `${who} sees ${what}`).toBeVisible({ timeout: ROUND_UPDATE_MS });
    await expect(image, `${who}'s ${what} has KLIPY's address as it came`).toHaveAttribute("src", gif.sm.url);
    await expect
      .poll(() => image.evaluate((el) => el instanceof HTMLImageElement && el.complete && el.naturalWidth > 0), {
        message: `${who}'s ${what} loaded`,
      })
      .toBe(true);
    await foldChat(screen);
  }
}

// A request to KLIPY carries nothing of the game: none of these values in its address, as it went or decoded, and no
// Referer (the page's address holds the room's id).
function expectNothingOfTheGame(request: KlipyRequest, game: GameValues, what: string): void {
  const address = request.url.href;
  const decoded = decodeURIComponent(address.replace(/\+/g, " "));
  for (const [name, value] of Object.entries(game)) {
    expect(address.includes(value) || decoded.includes(value), `${what}: no ${name} in the address`).toBe(false);
  }
  expect(Object.hasOwn(request.headers, "referer"), `${what}: no Referer`).toBe(false);
}

// A search on KLIPY's API: the word, KLIPY's strictest filter, no customer_id, and nothing of the game (plan, decisions
// 2 and 3; PRD FR-028).
function expectSearch(request: KlipyRequest | undefined, word: string, game: GameValues, what: string): void {
  if (!request) throw new Error(`${what}: no search reached the stub`);
  expect(request.url.searchParams.get("q"), `${what}: the word`).toBe(word);
  expect(request.url.searchParams.get("content_filter"), `${what}: KLIPY's strictest filter`).toBe("high");
  expect(request.url.searchParams.has("customer_id"), `${what}: no customer_id`).toBe(false);
  expectNothingOfTheGame(request, game, what);
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

test.describe("S-23 and S-24 (room chat, gifs) — a player's message or gif reaches the whole room", () => {
  test("everyone reads it with the nick in every state, the button rests 2 s, and a removed player's messages go", async ({
    page,
    browser,
    baseURL,
  }) => {
    // Three browsers, two joins, four messages and three gifs on every screen, two rounds and a removal take longer
    // than 30 s.
    test.slow();
    if (!baseURL) throw new Error("baseURL is not set (playwright.config.ts)");

    // Setup: every browser answers KLIPY with the stub before its first page loads, so no screen ever reaches KLIPY,
    // and every screen's sockets are watched from the first frame; the signed-in host opens a fresh room, and guests A
    // and B join it from browsers of their own.
    const klipyHost = await stubKlipy(page.context());
    const hostJoins = watchJoins(page);
    const room = await openRoom(page, baseURL);
    const nickA = uniqueNick("Ola");
    const nickB = uniqueNick("Kuba");
    const guestA = await newGuestContext(browser);
    const guestB = await newGuestContext(browser);
    const klipyA = await stubKlipy(guestA);
    const klipyB = await stubKlipy(guestB);
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
    const stubs = [
      ["the host", klipyHost],
      ["guest A", klipyA],
      ["guest B", klipyB],
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

    // Setup check: every screen listens on the players' topic of the room's key (K1), and has the chat's field and its
    // button "GIF" in view once the chat is open.
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
      await expect(gifButton(screen), `${who}'s button "GIF"`).toBeVisible();
      await foldChat(screen);
    }
    // What of the game the requests to KLIPY must not carry.
    const linkCode = new URL(room.link).pathname.replace(/^\/j\//, "");
    if (linkCode === "") throw new Error("the players' link has no code");
    const game: GameValues = {
      "host's nick": room.hostNick,
      "A's nick": nickA,
      "B's nick": nickB,
      "room id": room.id,
      "players' link code": linkCode,
      "room's channel key": k1,
    };

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

    // Action (S-24): still in the lobby, A opens "GIF" and searches a word.
    await searchGifs(pageA, GIF_WORD);

    // Assert: the results come in KLIPY's order and number, each with KLIPY's small file (xs).
    await expect(gifResults(pageA), "A's results").toHaveCount(KLIPY_GIFS.length);
    for (const [index, gif] of KLIPY_GIFS.entries()) {
      const result = gifResults(pageA).nth(index);
      await expect(result, `A's result ${String(index + 1)}`).toHaveAccessibleName(`Wyślij gifa: ${gif.title}`);
      await expect(result.locator("img"), `A's result ${String(index + 1)} shows KLIPY's small file`).toHaveAttribute(
        "src",
        gif.xs.url,
      );
    }

    // Action: A picks the second result.
    await pickGif(pageA, 1);

    // Assert: A's button rests as after a message, the search closes and the focus goes to the message field.
    await expect(sendButton(pageA), "A's button rests after the gif").toHaveAttribute("aria-disabled", "true");
    await expect(gifSearch(pageA), "A's search closes with the press").toHaveCount(0);
    await expect(chatField(pageA), "A's focus goes to the message field").toBeFocused();
    await foldChat(pageA);

    // Assert: every screen, A's own too, shows A's gif with KLIPY's address and description.
    await expectGifOnEveryChat(screens, nickA, KLIPY_GIFS[1], "A's gif in the lobby");

    // Assert: A's one search went to KLIPY with the word and the strictest filter, with no customer_id, nothing of the
    // game and no Referer.
    const searchesA = klipyA.requests.filter((request) => request.kind === "search");
    expect(searchesA, "A's screen searched KLIPY once").toHaveLength(1);
    expectSearch(searchesA[0], GIF_WORD, game, "A's search");

    // Positive control: the same reading sees a Referer on a call to KLIPY's API that sends one on purpose (the test's
    // own, from A's page), so "no Referer" is not a blind check.
    await pageA.evaluate(async (url) => {
      await fetch(url, { credentials: "omit", referrerPolicy: "unsafe-url" });
    }, CONTROL_URL);
    const control = klipyA.requests.findLast((request) => request.kind === "api");
    expect(control && Object.hasOwn(control.headers, "referer"), "the test's own call carries its Referer").toBe(true);

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

    // Action (S-24): during the vote B sends a gif too, the first result.
    await searchGifs(pageB, GIF_WORD);
    await pickGif(pageB, 0);
    await expect(gifSearch(pageB), "B's search closes with the press").toHaveCount(0);
    await foldChat(pageB);

    // Assert: every screen shows B's gif; B's search carried nothing of the game either.
    await expectGifOnEveryChat(screens, nickB, KLIPY_GIFS[0], "B's gif during the vote");
    const searchesB = klipyB.requests.filter((request) => request.kind === "search");
    expect(searchesB, "B's screen searched KLIPY once").toHaveLength(1);
    expectSearch(searchesB[0], GIF_WORD, game, "B's search");

    // Assert: every screen took the gifs' images from KLIPY's media host through the stub, with no Referer and nothing
    // of the game, and asked no other KLIPY host.
    for (const [who, stub] of stubs) {
      const media = stub.requests.filter((request) => request.kind === "media");
      expect(media.length, `${who}'s screen loaded KLIPY's media`).toBeGreaterThan(0);
      for (const request of media) expectNothingOfTheGame(request, game, `${who}'s image from KLIPY`);
      expect(
        stub.requests.filter((request) => request.kind === "other"),
        `${who}'s screen asked no other KLIPY host`,
      ).toHaveLength(0);
    }

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

    // Assert: both of B's messages and B's gif leave the host's and A's chat once their state comes without B
    // (decision 2), and A's message and A's gif stay.
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
      await expect(gifLine(screen, nickB, KLIPY_GIFS[0].title), `B's gif leaves ${who}'s chat`).toHaveCount(0);
      await expect(chatLine(screen, nickA, LOBBY_TEXT), `A's message stays on ${who}'s chat`).toBeVisible();
      await expect(gifLine(screen, nickA, KLIPY_GIFS[1].title), `A's gif stays on ${who}'s chat`).toBeVisible();
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

    // Action (S-24): KLIPY's limit for the hour is used up (429); on the end of the evening A searches a gif.
    klipyA.answer("limit");
    await searchGifs(pageA, LIMIT_WORD);

    // Assert: A's search says the limit, and the search did go to KLIPY, with nothing of the game.
    await expect(gifSearch(pageA).getByRole("status"), "A's search tells KLIPY's limit").toContainText(LIMIT_TEXT, {
      timeout: ROUND_UPDATE_MS,
    });
    const limited = klipyA.requests.filter((request) => request.kind === "search");
    expect(limited, "A's screen searched KLIPY a second time").toHaveLength(2);
    expectSearch(limited.at(-1), LIMIT_WORD, { ...game, "room's new channel key": k2 }, "A's search at the limit");

    // Assert (S-29, R1, decision 1): with the search still open, A's chat has one text field, the search's: no message
    // field and no "Wyślij wiadomość", and one "GIF", open.
    await expect(chatField(pageA), "A has no message field while the search is open").toHaveCount(0);
    await expect(sendButton(pageA), 'A has no "Wyślij wiadomość" while the search is open').toHaveCount(0);
    await expect(gifButton(pageA), 'A has one "GIF"').toHaveCount(1);
    await expect(gifButton(pageA), 'A\'s "GIF" is open').toHaveAttribute("aria-expanded", "true");

    // Action: A goes back to writing with the search's way back ("Wróć do pisania" below xl, "Wróć do czatu" from xl;
    // only the one of the window's width is there for a screen reader).
    await gifSearch(pageA)
      .getByRole("button", { name: /^Wróć do (pisania|czatu)$/ })
      .click();

    // Assert: the search is gone and the focus is in the message field.
    await expect(gifSearch(pageA), "A's search closes with the way back").toHaveCount(0);
    await expect(chatField(pageA), "A's focus goes to the message field").toBeFocused();

    // Action (S-29, E1 + K1, decisions 2 and 3): A types "ab", moves the caret back between "a" and "b" and opens
    // "Emoji".
    await chatField(pageA).fill(EMOJI_DRAFT);
    await chatField(pageA).press("ArrowLeft");
    await emojiButton(pageA).click();

    // Assert: the group "Emoji" holds Karol's 33 emoji in his order, the first one with the focus; the message field
    // stands in sight without it (the phone's keyboard goes), and "Emoji" is open.
    const emojiCells = emojiGrid(pageA).getByRole("button");
    await expect(emojiCells, "A's emoji grid").toHaveCount(GRID_EMOJI.length);
    await expect(emojiCells, "A's emoji grid in Karol's order").toHaveText(GRID_EMOJI);
    await expect(emojiCells.first(), "the grid's first emoji takes A's focus").toBeFocused();
    await expect(chatField(pageA), "A's message field stays in sight under the grid").toBeVisible();
    await expect(chatField(pageA), "A's message field has no focus while the grid is open").not.toBeFocused();
    await expect(emojiButton(pageA), 'A\'s "Emoji" is open').toHaveAttribute("aria-expanded", "true");

    // Action: A presses 😂 and then 🔥.
    await emojiGrid(pageA).getByRole("button", { name: "😂", exact: true }).click();
    await emojiGrid(pageA).getByRole("button", { name: "🔥", exact: true }).click();

    // Assert: both went in where the caret stood, one after the other, and the field still has no focus.
    await expect(chatField(pageA), "the emoji go in at A's caret").toHaveValue(EMOJI_TEXT);
    await expect(chatField(pageA), "A's message field still has no focus").not.toBeFocused();

    // Action and assert: "GIF" closes the grid and opens the search instead (only one is ever open); "GIF" again
    // closes the search.
    await gifButton(pageA).click();
    await expect(emojiGrid(pageA), '"GIF" closes A\'s emoji grid').toHaveCount(0);
    await expect(gifSearch(pageA), '"GIF" opens A\'s search').toBeVisible();
    await gifButton(pageA).click();
    await expect(gifSearch(pageA), '"GIF" again closes A\'s search').toHaveCount(0);

    // Action and assert: "Emoji" and Escape close the grid with the focus on "Emoji".
    await emojiButton(pageA).click();
    await expect(emojiCells.first(), "A's emoji grid opens again with the focus in it").toBeFocused();
    await pageA.keyboard.press("Escape");
    await expect(emojiGrid(pageA), "Escape closes A's emoji grid").toHaveCount(0);
    await expect(emojiButton(pageA), 'the focus goes back to A\'s "Emoji"').toBeFocused();

    // Action and assert (the decision of 2026-11-23 in the plan's conversation): "Emoji" and a click of the message
    // field close the grid with the focus in the field, the text untouched.
    await emojiButton(pageA).click();
    await expect(emojiGrid(pageA), "A's emoji grid opens once more").toBeVisible();
    await chatField(pageA).click();
    await expect(emojiGrid(pageA), "a click of the field closes A's emoji grid").toHaveCount(0);
    await expect(chatField(pageA), "A's focus is in the message field").toBeFocused();
    await expect(chatField(pageA), "A's text is untouched").toHaveValue(EMOJI_TEXT);

    // Action: A sends it, once the button rests no more (not toBeEnabled: aria-disabled, as in writeMessage).
    await expect(sendButton(pageA), "the button rests no more").not.toHaveAttribute("aria-disabled", {
      timeout: CHAT_COOLDOWN_MS + ROUND_UPDATE_MS,
    });
    await sendButton(pageA).click();
    await expectSent(pageA, "A");
    await foldChat(pageA);

    // Assert: the text chat goes on past KLIPY's limit and after the game: the host and A read A's message with the
    // emoji.
    await expectOnEveryChat(
      [
        ["the host", page],
        ["guest A", pageA],
      ],
      nickA,
      EMOJI_TEXT,
      "A's message with emoji on the end of the evening",
    );

    // Action (impl-review F1): the host and A write long messages, so A's chat holds more than half a window as low as a
    // phone's with its keyboard open; then A's window shrinks to that height, as Android's keyboard shrinks it under the
    // room's viewport (interactive-widget=resizes-content, src/layouts/Layout.astro).
    await writeMessage(page, LONG_HOST_TEXT);
    await expectSent(page, "the host");
    await foldChat(page);
    await writeMessage(pageA, LONG_A_TEXT);
    await expectSent(pageA, "A");
    await expect(chatLine(pageA, room.hostNick, LONG_HOST_TEXT), "A reads the host's long message").toBeVisible({
      timeout: ROUND_UPDATE_MS,
    });
    await expect(chatLine(pageA, nickA, LONG_A_TEXT), "A reads A's long message").toBeVisible({
      timeout: ROUND_UPDATE_MS,
    });
    await pageA.setViewportSize({ width: viewport.width, height: KEYBOARD_WINDOW_HEIGHT });

    // Assert: A's field stays whole in the window, and a tap in its middle reaches it, not the emotes' bar fixed to the
    // window's bottom below lg; the list scrolls inside the chat instead. A writes one more message from there.
    await openChat(pageA);
    await expect(chatField(pageA), "A's field in the low window").toBeInViewport({ ratio: 1 });
    await expect
      .poll(() => reachesField(pageA), { message: "a tap in the middle of A's field reaches the field" })
      .toBe(true);

    // Assert (S-29, E1): with the emoji grid open as well, the field still stands whole in the low window and a tap in
    // its middle reaches it; the grid scrolls inside the chat instead. Writing the next message puts the focus in the
    // field, which closes the grid.
    await emojiButton(pageA).click();
    await expect(emojiGrid(pageA), "A's emoji grid in the low window").toBeVisible();
    await expect(chatField(pageA), "A's field under the open grid in the low window").toBeInViewport({ ratio: 1 });
    await expect
      .poll(() => reachesField(pageA), { message: "with the grid open, a tap in the middle of A's field reaches it" })
      .toBe(true);
    await writeMessage(pageA, KEYBOARD_TEXT);
    await expectSent(pageA, "A");
    await expect(chatLine(pageA, nickA, KEYBOARD_TEXT), "A reads the message written in the low window").toBeVisible({
      timeout: ROUND_UPDATE_MS,
    });

    await guestA.close();
    await guestB.close();
  });
});
