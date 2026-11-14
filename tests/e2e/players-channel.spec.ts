// risk: the room's emotes reach only the room's players (players-only-live-channel,
// context/changes/players-only-live-channel/plan.md, Faza 2 #7; the owner's decisions 1-4 at the top of that plan). The
// emotes go on a topic made of the room's channel key, which room_lobby gives every player and remove_player replaces,
// and the room's screens listen there; the public topic of the room's id carries only the bells. On the local stack's
// real Realtime, with raw clients in Node next to the browsers (tests/e2e/support/live.ts): someone who knows the old
// key, as a removed player does, hears nothing once the key is replaced; a stranger with the room's id alone reaches no
// screen with an emote; the players left hear each other on, also on the end of the evening. The bound within the room
// stays (decision 1): whoever has the key may send with another player's nick, and the host's screen shows it, a
// positive control of the sender, not a known hole (the plan's What We're NOT Doing). Every "nothing came" is checked
// QUIET_MS after a positive control came. Nicks and the emotes' names are written out by hand, and each step sends
// another emote, so the screens' bubbles never mix. Laptop window only (project chromium).
// seed: tests/e2e/seed.spec.ts
import { test, expect, type Locator, type Page } from "@playwright/test";
import { EMOTE_COOLDOWN_MS } from "../../src/lib/rooms/emotes";
import {
  channelKeyOf,
  listen,
  liveConfig,
  playersTopic,
  publicTopic,
  sendEmoteTo,
  watchJoins,
  watchLiveRegions,
  type Listener,
} from "./support/live";
import { joinRoom, newGuestContext, openRoom, playerRow, removePlayer, uniqueNick } from "./support/room";
import {
  castVote,
  endGame,
  eveningEnd,
  ROUND_UPDATE_MS,
  roundQuestion,
  startGame,
  voteConfirmation,
} from "./support/round";

// How long a topic must stay quiet after another one brought the same emote: Realtime hands one broadcast to every
// subscriber of its topic at once, so two seconds leave a wide margin on the local stack.
const QUIET_MS = 2_000;

// One emote's button in the screen's "Emotki" bar (src/components/room/EmoteBar.tsx), as in emotes.spec.ts.
function emoteButton(page: Page, name: string): Locator {
  return page.getByRole("group", { name: "Emotki" }).getByRole("button", { name, exact: true });
}

// What a screen reader hears of the newest emote on the screen (src/components/room/EmoteBubbles.tsx).
function emoteNews(page: Page, nick: string, name: string): Locator {
  return page.getByText(`${nick}: ${name}`, { exact: true });
}

// A tap on an emote once the bar rests no more (EMOTE_COOLDOWN_MS after the player's previous tap). Not toBeEnabled:
// Playwright counts aria-disabled as disabled (emotes.spec.ts).
async function tapEmote(page: Page, name: string): Promise<void> {
  const button = emoteButton(page, name);
  await expect(button, `${name} rests no more`).not.toHaveAttribute("aria-disabled", {
    timeout: EMOTE_COOLDOWN_MS + ROUND_UPDATE_MS,
  });
  await button.click();
}

// The raw listeners of the test, closed after it whatever its end.
const listeners: Listener[] = [];

test.afterEach(async () => {
  await Promise.all(listeners.splice(0).map((listener) => listener.close()));
});

async function listening(...args: Parameters<typeof listen>): Promise<Listener> {
  const listener = await listen(...args);
  listeners.push(listener);
  return listener;
}

test.describe("players-only-live-channel — the room's emotes reach only its players", () => {
  test("a removed player's key hears nothing, a stranger reaches no screen, and the players left hear each other on", async ({
    page,
    browser,
    baseURL,
  }) => {
    // Three browsers, raw listeners, a removal, the end of the game and three quiet waits take longer than 30 s.
    test.slow();
    if (!baseURL) throw new Error("baseURL is not set (playwright.config.ts)");

    // Setup: the host's sockets are watched from the first frame, so step 4 can tell when the host's screen has joined
    // the new key's topic.
    const hostJoins = watchJoins(page);

    // Setup: the host opens a room, Ola and Zosia join from browsers of their own, and the host starts the game.
    const room = await openRoom(page, baseURL);
    const nickOla = uniqueNick("Ola");
    const nickZosia = uniqueNick("Zosia");
    const ola = await newGuestContext(browser);
    const zosia = await newGuestContext(browser);
    const pageOla = await ola.newPage();
    const pageZosia = await zosia.newPage();
    await joinRoom(pageOla, room.link, nickOla);
    await joinRoom(pageZosia, room.link, nickZosia);
    await expect(playerRow(page, nickZosia)).toBeVisible();
    await startGame(page);
    await expect(roundQuestion(page)).toBeVisible({ timeout: ROUND_UPDATE_MS });
    await expect(roundQuestion(pageOla)).toBeVisible({ timeout: ROUND_UPDATE_MS });

    // Setup: the room's channel key as Zosia's own state gives it (K1), and the URL and key any browser gets. The host's
    // screen listens on K1's topic: a positive control of the watch, so a missing join in step 4 means the screen did
    // not move, not that the watch is blind.
    const config = await liveConfig(page.request, baseURL);
    const k1 = await channelKeyOf(zosia, baseURL, room.id);
    await expect
      .poll(() => hostJoins.joined(playersTopic(k1)), {
        message: "the host's screen joined the players' topic of the room's first key (K1)",
        timeout: ROUND_UPDATE_MS,
      })
      .toBe(true);

    // 1. Positive control: a listener on K1's topic, as Zosia's key would let her listen, hears Ola's "Serce".
    const onK1 = await listening(config, playersTopic(k1));
    await tapEmote(pageOla, "Serce");
    await expect
      .poll(() => onK1.heard("heart", nickOla), {
        message: "K1's listener heard Ola's heart",
        timeout: ROUND_UPDATE_MS,
      })
      .toBe(true);

    // 1. The bound within the room (decision 1), and a control of the sender: whoever has K1 sends "Płacz" with Ola's
    // nick past the Worker, and the host's screen shows it.
    expect(await sendEmoteTo(config, playersTopic(k1), "cry", nickOla), "Realtime took the emote sent with K1").toBe(
      true,
    );
    await expect(emoteNews(page, nickOla, "Płacz"), "the host heard the emote sent with K1").toBeAttached({
      timeout: ROUND_UPDATE_MS,
    });

    // 2. A stranger with the room's id alone sends "Wkurzenie" with Ola's nick on the room's public topic. A listener
    // there hears it, so it was delivered; the host's screen, which listens there for the bells, never shows it, from
    // before the send until Ola's real "Kciuk w dół", sent after it, shows there.
    const onPublic = await listening(config, publicTopic(room.id));
    const hostHeard = await watchLiveRegions(page);
    expect(
      await sendEmoteTo(config, publicTopic(room.id), "angry", nickOla),
      "Realtime took the stranger's emote",
    ).toBe(true);
    await expect
      .poll(() => onPublic.heard("angry", nickOla), {
        message: "the public topic's listener heard the stranger's emote",
        timeout: ROUND_UPDATE_MS,
      })
      .toBe(true);
    await tapEmote(pageOla, "Kciuk w dół");
    await expect(emoteNews(page, nickOla, "Kciuk w dół"), "the host heard Ola's real dislike").toBeAttached({
      timeout: ROUND_UPDATE_MS,
    });
    expect(await hostHeard(), "the host's screen showed the stranger's emote").not.toContain(`${nickOla}: Wkurzenie`);

    // 2. The Worker sends no emote on the public topic any more: K1's listener hears Ola's real dislike (positive
    // control), and the public topic's listener does not, QUIET_MS later.
    await expect
      .poll(() => onK1.heard("dislike", nickOla), {
        message: "K1's listener heard Ola's dislike",
        timeout: ROUND_UPDATE_MS,
      })
      .toBe(true);
    await page.waitForTimeout(QUIET_MS);
    expect(onPublic.steady(), "the public topic's listener stayed subscribed").toBe(true);
    expect(onPublic.heard("dislike", nickOla), "the public topic brought Ola's real dislike").toBe(false);

    // 3. The host votes (the list "Gracze" with "Usuń" shows after the host's own vote) and removes Zosia, who has not
    // voted. Ola's own state then carries a new key, K2, which is not K1.
    await castVote(page, nickOla);
    await expect(voteConfirmation(page)).toBeVisible();
    await removePlayer(page, nickZosia);
    await expect(playerRow(page, nickZosia)).toHaveCount(0, { timeout: ROUND_UPDATE_MS });
    const k2 = await channelKeyOf(ola, baseURL, room.id);
    expect(k2 === k1, "Ola's state after the removal still carries K1").toBe(false);
    const heardOnK1 = onK1.received.length;
    const onK2 = await listening(config, playersTopic(k2));

    // 4. The host's screen joins K2's topic: Realtime answered its phx_join with ok. An emote sent before that would be
    // lost to the host's screen, so the test waits for the join first.
    await expect
      .poll(() => hostJoins.joined(playersTopic(k2)), {
        message: "the host's screen joined the players' topic of the new key (K2)",
        timeout: ROUND_UPDATE_MS,
      })
      .toBe(true);

    // 4. Once her bar rests no more, Ola sends "Kciuk w górę": the host's screen shows it (it moved to K2), K2's listener
    // hears it, and K1's hears nothing, QUIET_MS after K2's did.
    await tapEmote(pageOla, "Kciuk w górę");
    await expect(emoteNews(page, nickOla, "Kciuk w górę"), "the host heard Ola's like on K2").toBeAttached({
      timeout: ROUND_UPDATE_MS,
    });
    await expect
      .poll(() => onK2.heard("like", nickOla), { message: "K2's listener heard Ola's like", timeout: ROUND_UPDATE_MS })
      .toBe(true);
    await page.waitForTimeout(QUIET_MS);
    expect(onK1.steady(), "K1's listener stayed subscribed").toBe(true);
    expect(onK1.received.slice(heardOnK1), "what K1's topic brought after the removal").toEqual([]);

    // 5. The host ends the game, and on the end of the evening Ola sends "Czaszka", the emote no step has used: the
    // host's screen shows it (its emotes outlive the game's end), K2's listener hears it, and K1's hears nothing.
    await endGame(page);
    await expect(eveningEnd(page)).toBeVisible({ timeout: ROUND_UPDATE_MS });
    await expect(eveningEnd(pageOla)).toBeVisible({ timeout: ROUND_UPDATE_MS });
    await tapEmote(pageOla, "Czaszka");
    await expect(
      emoteNews(page, nickOla, "Czaszka"),
      "the host heard Ola's skull on the end of the evening",
    ).toBeAttached({ timeout: ROUND_UPDATE_MS });
    await expect
      .poll(() => onK2.heard("skull", nickOla), {
        message: "K2's listener heard Ola's skull",
        timeout: ROUND_UPDATE_MS,
      })
      .toBe(true);
    await page.waitForTimeout(QUIET_MS);
    expect(onK1.steady(), "K1's listener stayed subscribed").toBe(true);
    expect(onK1.received.slice(heardOnK1), "what K1's topic brought after the removal").toEqual([]);

    // Cleanup: the guests' browsers close, and the listeners after the test; the room and its players stay in the
    // database: no test deletes its rooms afterwards, and CI runs on a throwaway local Supabase.
    await ola.close();
    await zosia.close();
  });
});
