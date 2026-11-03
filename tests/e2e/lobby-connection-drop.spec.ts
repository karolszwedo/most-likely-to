// risk: test-plan.md #2, lobby part — facet: a screen whose connection dropped (a phone that slept) catches up when the
// connection returns, without a reload. The bell itself is covered by seed.spec.ts, the round by round.spec.ts.
// seed: tests/e2e/seed.spec.ts
import { test, expect } from "@playwright/test";
import { ROOM_POLL_MS } from "../../src/lib/live-sync/shared";
import { sleepableRealtime } from "./support/realtime";
import { joinRoom, newGuestContext, nextListFetch, openRoom, playerRow, uniqueNick } from "./support/room";

test.describe("risk #2 (lobby) — a screen that lost its connection catches up when it returns", () => {
  test("a guest whose connection dropped sees who joined meanwhile once it is back, without a reload", async ({
    page,
    browser,
    baseURL,
  }) => {
    // Setup: the host opens a fresh room.
    const room = await openRoom(page, baseURL);

    // Setup: guest A joins on a connection that can sleep, and A's screen starts listening.
    const sleeper = await newGuestContext(browser);
    const pageA = await sleeper.newPage();
    const connection = await sleepableRealtime(pageA);
    const nickA = uniqueNick("Ola");
    const aListening = nextListFetch(pageA, room.id);
    const aOpenedAt = Date.now();
    await joinRoom(pageA, room.link, nickA);
    await aListening;

    // Action: A's phone sleeps, and guest C joins meanwhile.
    connection.sleep();
    const nickC = uniqueNick("Kuba");
    const latecomer = await newGuestContext(browser);
    await joinRoom(await latecomer.newPage(), room.link, nickC);

    // The bell rang (the host's screen shows C), but A's screen missed it.
    await expect(playerRow(page, nickC)).toBeVisible();
    await expect
      .poll(() => connection.missed(), { message: "A's screen should have missed the bell" })
      .toBeGreaterThan(0);
    await expect(playerRow(pageA, nickC)).toHaveCount(0);

    // Action: A's phone wakes up; the connection comes back.
    await connection.wake();

    // Assertion: A's list shows C without a reload...
    await expect(playerRow(pageA, nickC)).toBeVisible();
    // ...before A's first poll could have run, so the return of the connection brought C, not the poll.
    expect(Date.now() - aOpenedAt, "C appeared only after A's first poll could have run").toBeLessThan(ROOM_POLL_MS);

    // Cleanup: both guests' browsers close. The room and the guests stay in the database, because nothing can delete
    // them yet (no close or delete endpoint until S-13). CI runs on a throwaway local Supabase; unique nicks keep runs
    // apart.
    await sleeper.close();
    await latecomer.close();
  });
});
