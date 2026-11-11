// risk: a player who reloads the page or whose connection drops is back in the current round on their own nick within
// 10 s (S-04, PRD US-01, FR-011; context/changes/rejoin-after-refresh/plan.md, Faza 1 #4, Faza 2 #4). A reload with the
// room's cookie lands on the same nick with the vote already cast, and the same tab still says whom the player voted
// for, from its sessionStorage (decision D1), which forgets it at the reveal; a socket that died quietly (open, but
// nothing comes through: realtime-js notices only after 25–50 s) still gets the round's next phase from the screen's
// own poll, every ROOM_POLL_MS. A guest whose browser lost the room's cookie (another browser, cleared data: Faza 4 #3,
// decision D2) types their nick, is asked "To ty?" and asks to come back; a leader sees the request apart from the
// latecomers', by the bell, and lets them back: the new browser is on the same place, with the vote cast, and the old
// one's open screen says the place moved to another device. In the lobby too, after a first "Odrzuć". The form left
// open in a second tab takes no place beside a request still waiting (impl-review F1). A quiet socket's screen looks
// again at once when the network comes back or the page returns from the back/forward cache (`online`, `pageshow`;
// impl-review F2). Whom a player voted for stays in their own tab alone (AGENTS.md, the first Hard Rule; decision D1):
// after the reload no cookie, no localStorage or IndexedDB and no address of the guest's or the host's browser holds
// that nick, as typed or URL-encoded (refactor-opportunities, Faza 2). Laptop window only (project chromium).
// seed: tests/e2e/seed.spec.ts
import { test, expect, type BrowserContext, type Page } from "@playwright/test";
import { ROOM_POLL_MS } from "../../src/lib/live-sync/shared";
import {
  askToComeBack,
  comeBackButton,
  joinRoom,
  movedTitle,
  newGuestContext,
  nextListFetch,
  nextRequestFetch,
  openRoom,
  playerRow,
  reachComeBack,
  returnRequests,
  returnRow,
  returnWaitingTitle,
  uniqueNick,
} from "./support/room";
import { sleepableRealtime } from "./support/realtime";
import {
  castVote,
  resultTable,
  revealResult,
  ROUND_UPDATE_MS,
  roundQuestion,
  startGame,
  voteConfirmation,
} from "./support/round";

// The tab's own entry of the player's vote in the room (src/lib/rooms/my-vote.ts), as stored, or null with none.
function storedVote(page: Page, roomId: string): Promise<string | null> {
  return page.evaluate((key) => sessionStorage.getItem(key), `mlt-my-vote:${roomId}`);
}

// Whether a text carries a player's nick: as typed, or as encodeURIComponent writes it ("Kuba%20ab12c34"), the form a
// cookie or an address may hold instead. The nick comes from the test's own steps (uniqueNick), never from the game.
function carriesNick(text: string, nick: string): boolean {
  return text.includes(nick) || text.includes(encodeURIComponent(nick));
}

// What a player's browser keeps outside the tab, as text: the context's cookies by name and value (HttpOnly ones too,
// which document.cookie never shows), what its pages keep for each origin (localStorage and IndexedDB; the snapshot has
// no sessionStorage, the tab's own memory) and the page's address.
interface OutsideTab {
  cookies: string;
  storage: string;
  url: string;
}

async function outsideTheTab(context: BrowserContext, page: Page): Promise<OutsideTab> {
  const snapshot = await context.storageState({ indexedDB: true });
  return {
    cookies: JSON.stringify(snapshot.cookies.map(({ name, value }) => ({ name, value }))),
    storage: JSON.stringify(snapshot.origins),
    url: page.url(),
  };
}

// The first Hard Rule of AGENTS.md from the browser's side: the nick a player voted for is nowhere outside their tab.
// Soft, so one run shows every place that holds it; on a boolean, so a failure prints neither the nick nor the
// snapshot (the host's session cookies).
function expectVoteOnlyInTab(who: string, outside: OutsideTab, target: string): void {
  const found = (place: string) => `the nick ${who} voted for is in ${who}'s ${place}`;
  expect.soft(carriesNick(outside.cookies, target), found("cookies")).toBe(false);
  expect.soft(carriesNick(outside.storage, target), found("localStorage or IndexedDB")).toBe(false);
  expect.soft(carriesNick(outside.url, target), found("page address")).toBe(false);
}

test.describe("S-04 — back on one's own nick after a reload or a dropped connection", () => {
  test("odświeżenie w trakcie głosowania: the guest is on their nick, with the vote cast and no form", async ({
    page,
    browser,
    baseURL,
  }) => {
    test.slow();

    // Setup: the host opens a room, Ola (A) and Kuba (B) join, the host starts the game.
    const room = await openRoom(page, baseURL);
    const nickA = uniqueNick("Ola");
    const nickB = uniqueNick("Kuba");
    const guestA = await newGuestContext(browser);
    const guestB = await newGuestContext(browser);
    const pageA = await guestA.newPage();
    const pageB = await guestB.newPage();
    await joinRoom(pageA, room.link, nickA);
    await joinRoom(pageB, room.link, nickB);
    await expect(playerRow(page, nickB)).toBeVisible();
    await startGame(page);
    await expect(roundQuestion(pageA)).toBeVisible({ timeout: ROUND_UPDATE_MS });
    const question = (await roundQuestion(page).textContent()) ?? "";

    // Setup: the host votes (a screen shows the list "Gracze" after its own vote), then Ola votes for Kuba; Kuba does
    // not, so the round goes on voting.
    await castVote(page, nickA);
    await expect(voteConfirmation(page)).toBeVisible();
    await castVote(pageA, nickB);
    await expect(voteConfirmation(pageA)).toBeVisible();

    // Action: Ola's page loads again.
    await pageA.reload();

    // Assertion: the same question, Ola on her own nick in the list "Gracze" (the badge "ty"), her vote counted with
    // whom she voted for (this tab remembers it, decision D1), and no form to vote a second time.
    await expect(roundQuestion(pageA)).toHaveText(question);
    await expect(voteConfirmation(pageA)).toBeVisible();
    await expect(pageA.getByText(`Twój głos: ${nickB}.`, { exact: true })).toBeVisible();
    await expect(playerRow(pageA, nickA)).toContainText("ty");
    await expect(playerRow(pageA, nickA)).toContainText("zagłosował(a)");
    await expect(pageA.getByRole("button", { name: "Zagłosuj", exact: true })).toHaveCount(0);

    // Assertion: the host's list still has Ola once, as one who voted.
    await expect(playerRow(page, nickA)).toHaveCount(1);
    await expect(playerRow(page, nickA)).toContainText("zagłosował(a)", { timeout: ROUND_UPDATE_MS });

    // Assertion: whom each of them voted for stays in their own tab alone (AGENTS.md, the first Hard Rule; decision
    // D1): no cookie, no localStorage or IndexedDB and no address of Ola's or the host's browser holds that nick. The
    // round still votes (Kuba has not voted), so Ola's tab still holds her vote, and anything written outside the tab
    // at the vote would have outlived the reload. Positive controls first: her tab holds Kuba's nick in the form
    // searched for, and her snapshot holds her own nick (the remembered nick, S-14), so it does read localStorage.
    const outsideA = await outsideTheTab(guestA, pageA);
    const outsideHost = await outsideTheTab(page.context(), page);
    const storedA = (await storedVote(pageA, room.id)) ?? "";
    expect(carriesNick(storedA, nickB), "Ola's tab should remember whom she voted for").toBe(true);
    expect(carriesNick(outsideA.storage, nickA), "Ola's snapshot should hold her remembered nick").toBe(true);
    expectVoteOnlyInTab("Ola", outsideA, nickB);
    expectVoteOnlyInTab("the host", outsideHost, nickA);

    // Cleanup: the guests' browsers close; the room and its players stay in the database: no test deletes its rooms
    // afterwards, and CI runs on a throwaway local Supabase.
    await guestA.close();
    await guestB.close();
  });

  test("wstrzymanie się i odświeżenie: the tab still says so, and forgets it at the reveal", async ({
    page,
    browser,
    baseURL,
  }) => {
    test.slow();

    // Setup: the host opens a room, Ola (A) and Kuba (B) join, the host starts the game.
    const room = await openRoom(page, baseURL);
    const nickA = uniqueNick("Ola");
    const nickB = uniqueNick("Kuba");
    const guestA = await newGuestContext(browser);
    const guestB = await newGuestContext(browser);
    const pageA = await guestA.newPage();
    const pageB = await guestB.newPage();
    await joinRoom(pageA, room.link, nickA);
    await joinRoom(pageB, room.link, nickB);
    await expect(playerRow(page, nickB)).toBeVisible();
    await startGame(page);
    await expect(roundQuestion(pageA)).toBeVisible({ timeout: ROUND_UPDATE_MS });

    // Setup: the host votes, then Ola abstains; Kuba does not vote, so the round goes on voting. Her tab now holds the
    // abstention under the room's key.
    await castVote(page, nickA);
    await expect(voteConfirmation(page)).toBeVisible();
    await castVote(pageA, null);
    await expect(voteConfirmation(pageA)).toBeVisible();
    expect(await storedVote(pageA, room.id), "Ola's tab should remember her abstention").not.toBeNull();

    // Action: Ola's page loads again.
    await pageA.reload();

    // Assertion: her screen still says she abstains, with the vote cast and no form.
    await expect(voteConfirmation(pageA)).toBeVisible();
    await expect(pageA.getByText("Wstrzymujesz się.", { exact: true })).toBeVisible();
    await expect(pageA.getByRole("button", { name: "Zagłosuj", exact: true })).toHaveCount(0);

    // Action: the host reveals the result before Kuba votes.
    await revealResult(page);

    // Assertion: Ola's screen shows the reveal, and her tab no longer holds the vote: the entry lives only while its
    // round is voting (AGENTS.md, Hard Rules).
    await expect(resultTable(pageA)).toBeVisible({ timeout: ROUND_UPDATE_MS });
    await expect
      .poll(() => storedVote(pageA, room.id), { message: "Ola's tab should forget her vote at the reveal" })
      .toBeNull();

    // Cleanup: the guests' browsers close; the room and its players stay in the database: no test deletes its rooms
    // afterwards, and CI runs on a throwaway local Supabase.
    await guestA.close();
    await guestB.close();
  });

  test("martwe gniazdo: the reveal reaches a screen that missed the bell within 10 s, from its own poll", async ({
    page,
    browser,
    baseURL,
  }) => {
    test.slow();

    // Setup: the host opens a room; Ola (A) joins on a connection that can sleep, Kuba (B) on a plain one; the host
    // starts the game.
    const room = await openRoom(page, baseURL);
    const nickA = uniqueNick("Ola");
    const nickB = uniqueNick("Kuba");
    const guestA = await newGuestContext(browser);
    const guestB = await newGuestContext(browser);
    const pageA = await guestA.newPage();
    const connection = await sleepableRealtime(pageA);
    const pageB = await guestB.newPage();
    await joinRoom(pageA, room.link, nickA);
    await joinRoom(pageB, room.link, nickB);
    await expect(playerRow(page, nickB)).toBeVisible();
    await startGame(page);
    await expect(roundQuestion(pageA)).toBeVisible({ timeout: ROUND_UPDATE_MS });

    // Setup: the host and Ola vote; Kuba does not, so the round waits until a leader reveals it.
    await castVote(page, nickA);
    await expect(voteConfirmation(page)).toBeVisible();
    await castVote(pageA, nickB);
    await expect(voteConfirmation(pageA)).toBeVisible();

    // Setup: Ola's page loads again, so no bell of the votes above is still on its way to her screen, and its poll
    // starts over. Its first fetch comes when its channel subscribes; then her socket goes quiet, as a phone's does when
    // the network drops without closing it.
    const subscribed = nextListFetch(pageA, room.id);
    await pageA.reload();
    await subscribed;
    await expect(voteConfirmation(pageA)).toBeVisible();
    connection.sleep();

    // Setup: the next fetch of Ola's screen is its own poll (no bell gets through, nothing else asks), so the one after
    // it comes a whole ROOM_POLL_MS later: the reveal below lands on the worst moment.
    await nextListFetch(pageA, room.id);

    // Action: the host reveals the result at once ("Odsłoń wynik", then the confirmation).
    await page.getByRole("button", { name: "Odsłoń wynik", exact: true }).click();
    await expect(page.getByRole("button", { name: "Anuluj", exact: true })).toBeVisible();
    const revealedAt = Date.now();
    await page.getByRole("button", { name: /^Na pewno odsłonić\? Zagłosowało \d+ z \d+$/ }).click();

    // The bell rang (the host's screen shows the reveal), but Ola's screen missed it.
    await expect(resultTable(page)).toBeVisible({ timeout: ROUND_UPDATE_MS });
    await expect
      .poll(() => connection.missed(), { message: "Ola's screen should have missed the bell" })
      .toBeGreaterThan(0);

    // Assertion: Ola's screen shows the reveal without a reload, within S-04's 10 s of the reveal, from its own poll.
    await expect(resultTable(pageA)).toBeVisible({ timeout: ROUND_UPDATE_MS });
    expect(Date.now() - revealedAt, "the reveal reached Ola's quiet screen too late").toBeLessThan(ROUND_UPDATE_MS);

    // Cleanup: the guests' browsers close; the room and its players stay in the database: no test deletes its rooms
    // afterwards, and CI runs on a throwaway local Supabase.
    await guestA.close();
    await guestB.close();
  });

  test("powrót bez ciasteczka w trakcie gry: the host lets Ola back from another browser, with her vote", async ({
    page,
    browser,
    baseURL,
  }) => {
    test.slow();

    // Setup: the host opens a room, Ola (A) and Kuba (B) join, the host starts the game.
    const room = await openRoom(page, baseURL);
    const nickA = uniqueNick("Ola");
    const nickB = uniqueNick("Kuba");
    const guestA = await newGuestContext(browser);
    const guestB = await newGuestContext(browser);
    const pageA = await guestA.newPage();
    const pageB = await guestB.newPage();
    await joinRoom(pageA, room.link, nickA);
    await joinRoom(pageB, room.link, nickB);
    await expect(playerRow(page, nickB)).toBeVisible();
    await startGame(page);
    await expect(roundQuestion(pageA)).toBeVisible({ timeout: ROUND_UPDATE_MS });
    const question = (await roundQuestion(page).textContent()) ?? "";

    // Setup: the host and Ola vote; Kuba does not, so the round goes on voting.
    await castVote(page, nickA);
    await expect(voteConfirmation(page)).toBeVisible();
    await castVote(pageA, nickB);
    await expect(voteConfirmation(pageA)).toBeVisible();

    // Action: Ola opens the link in another browser (C), with no room's cookie, and types her nick: the page asks
    // whether the place is hers.
    const otherA = await newGuestContext(browser);
    const pageC = await otherA.newPage();
    await pageC.goto(room.link);
    await reachComeBack(pageC, nickA, "Poproś o wejście");
    await expect(pageC.getByText(`${nickA} już gra w tym pokoju.`, { exact: true })).toBeVisible();

    // Setup: the host's screen loads again and listens (its first fetch comes when its channel subscribes); then its
    // next fetch is its own poll, and the one after it comes a whole ROOM_POLL_MS later, since the poll's chain never
    // restarts on a bell. A request that reaches the screen sooner than that after this poll came with the bell
    // (test-plan.md, "Bell vs poll"). Counted from the load instead, the poll, which starts at mounting, could come
    // first: the break-check of 2026-11-03 passed this way once in three tries.
    const listening = nextListFetch(page, room.id);
    await page.reload();
    await listening;
    await nextListFetch(page, room.id);
    const polledHost = Date.now();

    // Action: Ola asks to come back.
    const waitingC = nextRequestFetch(pageC, room.id);
    await askToComeBack(pageC);
    await waitingC;
    await expect(pageC.getByText(nickA, { exact: true })).toBeVisible();
    await expect(pageC.getByText(/Kto z nas najprawdopodobniej/)).toHaveCount(0);

    // Assertion: the host sees her among those who come back, apart from the latecomers, by the bell.
    await expect(returnRow(page, nickA)).toBeVisible({ timeout: ROUND_UPDATE_MS });
    expect(
      Date.now() - polledHost,
      "the host saw the request to come back only after its own poll could have run",
    ).toBeLessThan(ROOM_POLL_MS);
    await expect(page.getByRole("region", { name: "Proszą o wejście" })).toHaveCount(0);

    // Action: the host lets her back.
    await returnRow(page, nickA).getByRole("button", { name: "Wpuść", exact: true }).click();

    // Assertion: the other browser goes on to the room by itself, on Ola's place: the same question, her vote cast,
    // no form to vote again. The tab's memory of whom she voted for stayed in the old browser (decision D1).
    await pageC.waitForURL((url) => url.pathname === `/r/${room.id}`, { timeout: ROUND_UPDATE_MS });
    await expect(roundQuestion(pageC)).toHaveText(question);
    await expect(voteConfirmation(pageC)).toBeVisible();
    await expect(pageC.getByRole("button", { name: "Zagłosuj", exact: true })).toHaveCount(0);
    await expect(playerRow(pageC, nickA)).toContainText("ty");
    await expect(playerRow(pageC, nickA)).toContainText("zagłosował(a)");

    // Assertion: the old browser's open screen finds its way in gone and says the place moved; the host's list has
    // Ola once and no request left.
    await expect(movedTitle(pageA)).toBeVisible({ timeout: ROUND_UPDATE_MS });
    await expect(pageA.getByText(`jako ${nickA}.`, { exact: false })).toBeVisible();
    await expect(playerRow(page, nickA)).toHaveCount(1);
    await expect(returnRequests(page)).toHaveCount(0, { timeout: ROUND_UPDATE_MS });

    // Cleanup: the guests' browsers close; the room and its players stay in the database: no test deletes its rooms
    // afterwards, and CI runs on a throwaway local Supabase.
    await guestA.close();
    await guestB.close();
    await otherA.close();
  });

  test("powrót bez ciasteczka w poczekalni: turned away once, Ola asks again and the host lets her back", async ({
    page,
    browser,
    baseURL,
  }) => {
    test.slow();

    // Setup: the host opens a room, Ola (A) joins and waits in the lobby.
    const room = await openRoom(page, baseURL);
    const nickA = uniqueNick("Ola");
    const guestA = await newGuestContext(browser);
    const pageA = await guestA.newPage();
    await joinRoom(pageA, room.link, nickA);
    await expect(playerRow(page, nickA)).toBeVisible();

    // Action: Ola opens the link in another browser (C) and types her nick: "Dołącz" is refused as taken, and the page
    // asks whether the place is hers.
    const otherA = await newGuestContext(browser);
    const pageC = await otherA.newPage();
    await pageC.goto(room.link);
    await reachComeBack(pageC, nickA, "Dołącz");

    // Setup: the host's screen loads again and listens, and its own poll comes, as in the game above.
    const listening = nextListFetch(page, room.id);
    await page.reload();
    await listening;
    await nextListFetch(page, room.id);
    const polledHost = Date.now();

    // Action: Ola asks to come back.
    const waitingC = nextRequestFetch(pageC, room.id);
    await askToComeBack(pageC);
    await waitingC;

    // Assertion: the host sees the request in the lobby too, by the bell.
    await expect(returnRow(page, nickA)).toBeVisible({ timeout: ROUND_UPDATE_MS });
    expect(
      Date.now() - polledHost,
      "the host saw the request to come back only after its own poll could have run",
    ).toBeLessThan(ROOM_POLL_MS);

    // Action: the host turns it away.
    await returnRow(page, nickA).getByRole("button", { name: "Odrzuć", exact: true }).click();

    // Assertion: the other browser goes back to the link's page, which says so and asks again "To ty?"; the old
    // browser is still Ola in the lobby.
    await expect(
      pageC.getByRole("heading", { level: 1, name: "Prowadzący cię nie wpuścił.", exact: true }),
    ).toBeVisible({
      timeout: ROUND_UPDATE_MS,
    });
    await expect(comeBackButton(pageC)).toBeVisible();
    await expect(pageA.getByRole("heading", { name: `Jesteś w grze jako ${nickA}` })).toBeVisible();

    // Action: Ola asks again, and the host lets her back.
    await askToComeBack(pageC);
    await expect(returnWaitingTitle(pageC)).toBeVisible();
    await expect(returnRow(page, nickA)).toBeVisible({ timeout: ROUND_UPDATE_MS });
    await returnRow(page, nickA).getByRole("button", { name: "Wpuść", exact: true }).click();

    // Assertion: the other browser is Ola in the lobby; the old one says the place moved; the host's list has Ola once.
    await pageC.waitForURL((url) => url.pathname === `/r/${room.id}`, { timeout: ROUND_UPDATE_MS });
    await expect(pageC.getByRole("heading", { name: `Jesteś w grze jako ${nickA}` })).toBeVisible();
    await expect(movedTitle(pageA)).toBeVisible({ timeout: ROUND_UPDATE_MS });
    await expect(playerRow(page, nickA)).toHaveCount(1);
    await expect(returnRequests(page)).toHaveCount(0, { timeout: ROUND_UPDATE_MS });

    // Cleanup: the guests' browsers close; the room and its players stay in the database: no test deletes its rooms
    // afterwards, and CI runs on a throwaway local Supabase.
    await guestA.close();
    await otherA.close();
  });

  test("druga karta w poczekalni: the form left open takes no place beside a request to come back", async ({
    page,
    browser,
    baseURL,
  }) => {
    test.slow();

    // Setup: the host opens a room, Ola (A) joins and waits in the lobby.
    const room = await openRoom(page, baseURL);
    const nickA = uniqueNick("Ola");
    const nickB = uniqueNick("Bartek");
    const guestA = await newGuestContext(browser);
    const pageA = await guestA.newPage();
    await joinRoom(pageA, room.link, nickA);
    await expect(playerRow(page, nickA)).toBeVisible();

    // Setup: another browser opens the link in two tabs, which share the room's cookie.
    const other = await newGuestContext(browser);
    const firstTab = await other.newPage();
    const secondTab = await other.newPage();
    await firstTab.goto(room.link);
    await secondTab.goto(room.link);

    // Setup: the first tab asks to come back to Ola's place; the second still shows the form it opened with.
    await reachComeBack(firstTab, nickA, "Dołącz");
    await askToComeBack(firstTab);
    await expect(returnRow(page, nickA)).toBeVisible({ timeout: ROUND_UPDATE_MS });

    // Action: the second tab sends the form with another nick.
    await expect(async () => {
      if (await returnWaitingTitle(secondTab).isVisible()) return;
      await secondTab.getByRole("textbox", { name: "Twój nick" }).fill("");
      await secondTab.getByRole("textbox", { name: "Twój nick" }).fill(nickB);
      await secondTab.getByRole("button", { name: "Dołącz", exact: true }).click();
      await expect(returnWaitingTitle(secondTab)).toBeVisible({ timeout: 5_000 });
    }).toPass({ timeout: 20_000 });

    // Assertion: the second tab waits with the first, nobody new is in the room, and the request still stands.
    await expect(playerRow(page, nickB)).toHaveCount(0);
    await expect(returnRow(page, nickA)).toBeVisible();

    // Action: the host lets the request in.
    await returnRow(page, nickA).getByRole("button", { name: "Wpuść", exact: true }).click();

    // Assertion: the browser that asked holds Ola's place, because its cookie is still the request's token; the old one
    // says the place moved.
    await firstTab.waitForURL((url) => url.pathname === `/r/${room.id}`, { timeout: ROUND_UPDATE_MS });
    await expect(firstTab.getByRole("heading", { name: `Jesteś w grze jako ${nickA}` })).toBeVisible();
    await expect(movedTitle(pageA)).toBeVisible({ timeout: ROUND_UPDATE_MS });

    // Cleanup: the guests' browsers close; the room and its players stay in the database: no test deletes its rooms
    // afterwards, and CI runs on a throwaway local Supabase.
    await guestA.close();
    await other.close();
  });

  test("po powrocie sieci: a quiet screen looks again at once on online and on pageshow from the cache", async ({
    page,
    browser,
    baseURL,
  }) => {
    test.slow();

    // Setup: the host opens a room; Ola (A), whose socket can go quiet, joins and waits in the lobby.
    const room = await openRoom(page, baseURL);
    const nickA = uniqueNick("Ola");
    const guestA = await newGuestContext(browser);
    const pageA = await guestA.newPage();
    const connection = await sleepableRealtime(pageA);
    await joinRoom(pageA, room.link, nickA);
    await expect(playerRow(page, nickA)).toBeVisible();

    // Setup: Ola's page loads again, so its poll starts over, and her socket goes quiet: no bell can ask for a fetch.
    const subscribed = nextListFetch(pageA, room.id);
    await pageA.reload();
    await subscribed;
    connection.sleep();

    // Setup: the next fetch is the screen's own poll, so the one after it comes a whole ROOM_POLL_MS later, and only
    // the events below can bring one sooner.
    await nextListFetch(pageA, room.id);
    const polledAt = Date.now();

    // Action and assertion: the network comes back. The test fires the event itself: going offline in Playwright would
    // also stop the fetches it measures.
    const afterOnline = nextListFetch(pageA, room.id);
    await pageA.evaluate(() => window.dispatchEvent(new Event("online")));
    await afterOnline;

    // Action and assertion: the page comes back from the back/forward cache.
    const afterPageShow = nextListFetch(pageA, room.id);
    await pageA.evaluate(() => window.dispatchEvent(new PageTransitionEvent("pageshow", { persisted: true })));
    await afterPageShow;

    // Both fetches came before the poll that was next.
    expect(Date.now() - polledAt, "the screen waited for its own poll instead of looking again").toBeLessThan(
      ROOM_POLL_MS,
    );

    // Cleanup: the guests' browsers close; the room and its players stay in the database: no test deletes its rooms
    // afterwards, and CI runs on a throwaway local Supabase.
    await guestA.close();
  });
});
