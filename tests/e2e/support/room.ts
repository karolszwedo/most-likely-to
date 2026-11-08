// Room steps shared by the E2E specs. Setup goes through the app's own endpoints; the steps a player takes go
// through the screen, by role and accessible name.

import { expect, type Browser, type BrowserContext, type Locator, type Page, type Response } from "@playwright/test";
import { CATEGORIES } from "../../../src/data/questions";

const ROOM_PATH = /^\/r\/([0-9a-f-]{36})$/;

export interface OpenRoom {
  id: string;
  // The host's own nick in the room's list (the round's specs need it for the host's row in the reveal).
  hostNick: string;
  // The guests' link, as the host's screen shows it.
  link: string;
  // Taken just before the host's screen loads, so `Date.now() - openedAt` is never shorter than the time since the
  // screen started polling.
  openedAt: number;
}

// A nick no earlier run used: rooms and players stay in the database (nothing deletes them until S-13).
// At most 20 characters (the nick rule).
export function uniqueNick(prefix: string): string {
  return `${prefix} ${Date.now().toString(36).slice(-5)}${String(Math.floor(Math.random() * 100))}`;
}

// Setup, not the risk: the signed-in host opens a fresh room through the endpoint behind "Załóż grę". confirm_close=1
// closes a room left open by an earlier test or retry instead of stopping at the question. Then the host's screen
// opens the room and waits for its first list fetch: the screen fetches when its channel subscribes and otherwise only
// at its first poll, so a bell rung before that moment could not be told from the fetch. categories: the picked ones,
// by default the first alone (20 questions without 18+); a spec that needs a bigger pool picks more (game-length).
export async function openRoom(
  page: Page,
  baseURL: string | undefined,
  categories: readonly string[] = [CATEGORIES[0].id],
): Promise<OpenRoom> {
  if (!baseURL) throw new Error("baseURL is not set (playwright.config.ts)");
  const hostNick = uniqueNick("Host");
  // A form field per picked category, as the form's checkboxes send them.
  const form = new FormData();
  form.append("nick", hostNick);
  for (const category of categories) form.append("category", category);
  form.append("confirm_close", "1");
  const response = await page.request.post("/api/rooms", {
    form,
    // Astro refuses a form POST from another origin.
    headers: { Origin: baseURL },
  });
  await expect(response).toBeOK();
  const id = ROOM_PATH.exec(new URL(response.url()).pathname)?.[1];
  expect(id, `"Załóż grę" did not end in a room: ${new URL(response.url()).pathname}`).toBeDefined();
  const roomId = id ?? "";

  const subscribed = nextListFetch(page, roomId);
  const openedAt = Date.now();
  await page.goto(`/r/${roomId}`);
  await subscribed;
  const link = await page.getByRole("textbox", { name: "Link dla graczy" }).inputValue();
  return { id: roomId, hostNick, link, openedAt };
}

// The screen's next successful fetch of the room's list. Before the first poll, the only fetch is the one a screen makes
// when its channel subscribes, so awaiting it means the screen is listening. Start waiting before the screen loads.
export function nextListFetch(page: Page, roomId: string): Promise<Response> {
  return page.waitForResponse((res) => new URL(res.url()).pathname === `/api/rooms/${roomId}/lobby` && res.ok());
}

// How many fetches of the room's list the screen starts from now on, for a screen that must stay quiet. Means something
// only within ROOM_POLL_MS of the screen's load, before its own poll could have run.
export function countListFetches(page: Page, roomId: string): () => number {
  let fetches = 0;
  page.on("request", (request) => {
    if (new URL(request.url()).pathname === `/api/rooms/${roomId}/lobby`) fetches += 1;
  });
  return () => fetches;
}

// A guest has no account: a browser context with no cookies. A context made with browser.newContext() inside a test
// inherits the project's `use`, the host's saved session included, so the session is cleared explicitly.
export function newGuestContext(browser: Browser): Promise<BrowserContext> {
  return browser.newContext({ storageState: { cookies: [], origins: [] } });
}

// The join form is a React island; since S-14 (useNickField) it keeps what was typed before it hydrates, and the
// retry stays as a safety net. Joining again from the same browser only goes back to the room
// (src/pages/api/rooms/join.ts), so fill + submit can be retried until the guest is in.
export async function joinRoom(page: Page, link: string, nick: string): Promise<void> {
  await page.goto(link);
  await expect(async () => {
    if (ROOM_PATH.test(new URL(page.url()).pathname)) return;
    await page.getByRole("textbox", { name: "Twój nick" }).fill("");
    await page.getByRole("textbox", { name: "Twój nick" }).fill(nick);
    await page.getByRole("button", { name: "Dołącz", exact: true }).click();
    await page.waitForURL((url) => ROOM_PATH.test(url.pathname), { timeout: 5_000 });
  }).toPass();
  await expect(page.getByRole("heading", { name: `Jesteś w grze jako ${nick}` })).toBeVisible();
}

// One player's row in the room's list ("Gracze (N)").
export function playerRow(page: Page, nick: string): Locator {
  return page
    .getByRole("region", { name: /^Gracze/ })
    .getByRole("listitem")
    .filter({ hasText: nick });
}

// The host's switch of the co-host role by a guest's nick in the room's list (S-07, CohostButton): a toggle button
// named after the nick, pressed (aria-pressed "true") while the guest has the role. Only the host's screen has it.
export function cohostSwitch(page: Page, nick: string): Locator {
  return page.getByRole("region", { name: /^Gracze/ }).getByRole("button", { name: `Współhost: ${nick}`, exact: true });
}

// A leader's "Usuń" by a guest's nick in the room's list (S-09, RemovePlayerButton): the first press turns the same
// button into the question "Na pewno usunąć <nick>?", which keeps the focus; the second sends.
export async function removePlayer(leader: Page, nick: string): Promise<void> {
  const players = leader.getByRole("region", { name: /^Gracze/ });
  await players.getByRole("button", { name: `Usuń: ${nick}`, exact: true }).click();
  const confirm = players.getByRole("button", { name: `Na pewno usunąć ${nick}?`, exact: true });
  await expect(confirm).toBeFocused();
  await confirm.click();
}

// The page a removed player's screen lands on (src/pages/r/[id].astro): the room's state answers 404, the screen
// reloads, and the page knows the removed player by the room's cookie with no player and no request behind it.
export function removedTitle(page: Page): Locator {
  return page.getByRole("heading", { level: 1, name: "Usunięto cię z pokoju.", exact: true });
}

// The /j/<code> page of a link no room has: an old one, replaced when a leader removed a player (S-09).
export function deadLinkTitle(page: Page): Locator {
  return page.getByRole("heading", { level: 1, name: "Ten link nie działa.", exact: true });
}

// The waiting screen's title on /j/<code> (JoinWaiting), once a latecomer's request is sent (S-08).
export function waitingTitle(page: Page): Locator {
  return page.getByRole("heading", { level: 1, name: "Czekasz, aż prowadzący cię wpuści", exact: true });
}

// The waiting screen's next successful look at its own request. Its first one comes when its channel subscribes, so
// awaiting it means the screen will hear a leader's answer by the bell. Start waiting before the page loads.
export function nextRequestFetch(page: Page, roomId: string): Promise<Response> {
  return page.waitForResponse((res) => new URL(res.url()).pathname === `/api/rooms/${roomId}/request` && res.ok());
}

// The latecomer's form on /j/<code> during a game: the nick, then "Poproś o wejście" ("Poproś jeszcze raz" after a
// refusal), until the waiting screen shows. The form is a React island, so fill and submit are retried, as in joinRoom;
// once the request is sent the page is the waiting screen.
export async function askToJoin(
  page: Page,
  nick: string,
  button: "Poproś o wejście" | "Poproś jeszcze raz",
): Promise<void> {
  await expect(async () => {
    if (await waitingTitle(page).isVisible()) return;
    const field = page.getByRole("textbox", { name: "Twój nick" });
    await field.fill("");
    await field.fill(nick);
    await page.getByRole("button", { name: button, exact: true }).click();
    await expect(waitingTitle(page)).toBeVisible({ timeout: 5_000 });
  }).toPass();
}

// A leader's (the host's or a co-host's) list of latecomers waiting, above the round's view.
export function requests(page: Page): Locator {
  return page.getByRole("region", { name: "Proszą o wejście" });
}

// One latecomer's row in a leader's list, with "Wpuść" and "Odrzuć".
export function requestRow(page: Page, nick: string): Locator {
  return requests(page).getByRole("listitem").filter({ hasText: nick });
}

// The question on /j/<code> once a guest's nick is refused as a place in the room (S-04, JoinForm): "<nick> już gra w
// tym pokoju. To ty…?" and this button, the request to come back to that place. A form of its own that posts natively,
// so it works before the island hydrates.
export function comeBackButton(page: Page): Locator {
  return page.getByRole("button", { name: "Tak, to ja. Poproś o powrót", exact: true });
}

// The waiting screen's title on /j/<code> for a request to come back (S-04, JoinWaiting).
export function returnWaitingTitle(page: Page): Locator {
  return page.getByRole("heading", { level: 1, name: "Czekasz, aż prowadzący potwierdzi, że to ty", exact: true });
}

// A guest with no room's cookie (another browser) types the nick of their own place into the link's form ("Dołącz" in
// the lobby, "Poproś o wejście" during a game) and is refused as taken, until the page asks "To ty?". Retried as in
// joinRoom; the page must already be on the link.
export async function reachComeBack(page: Page, nick: string, button: "Dołącz" | "Poproś o wejście"): Promise<void> {
  await expect(async () => {
    if (await comeBackButton(page).isVisible()) return;
    const field = page.getByRole("textbox", { name: "Twój nick" });
    await field.fill("");
    await field.fill(nick);
    await page.getByRole("button", { name: button, exact: true }).click();
    await expect(comeBackButton(page)).toBeVisible({ timeout: 5_000 });
  }).toPass();
}

// "Tak, to ja. Poproś o powrót", until the waiting screen shows. Sent twice, the request stays one (request_return).
export async function askToComeBack(page: Page): Promise<void> {
  await expect(async () => {
    if (await returnWaitingTitle(page).isVisible()) return;
    await comeBackButton(page).click();
    await expect(returnWaitingTitle(page)).toBeVisible({ timeout: 5_000 });
  }).toPass();
}

// A leader's list of guests asking to come back to their own place (S-04, JoinRequests), above the room's view, apart
// from the latecomers' "Proszą o wejście".
export function returnRequests(page: Page): Locator {
  return page.getByRole("region", { name: "Chcą wrócić na swoje miejsce" });
}

// One guest's row in that list, with "Wpuść" and "Odrzuć".
export function returnRow(page: Page, nick: string): Locator {
  return returnRequests(page).getByRole("listitem").filter({ hasText: nick });
}

// The page the old device of a guest let back on another one lands on (src/pages/r/[id].astro, S-04): the room's
// state answers 404, the screen reloads, and the page knows the old token by its trace (moved).
export function movedTitle(page: Page): Locator {
  return page.getByRole("heading", { level: 1, name: "Grasz teraz na innym urządzeniu.", exact: true });
}
