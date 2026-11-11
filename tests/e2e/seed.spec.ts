// Seed test — the pattern every generated E2E test copies.
// risk: test-plan.md #2, lobby part only: a player who joins shows up on the screens already in the room, without a
// reload, through the room's bell (Realtime). The round and its reveal are round.spec.ts's.
import { test, expect } from "@playwright/test";
import { ROOM_POLL_MS } from "../../src/lib/live-sync/shared";
import { joinRoom, newGuestContext, openRoom, playerRow, uniqueNick } from "./support/room";

test("the host's lobby shows a guest who just joined, without a reload (risk #2, lobby)", async ({
  page,
  browser,
  baseURL,
}) => {
  // Setup: the signed-in host opens a fresh room; their screen is subscribed to the room's channel.
  const room = await openRoom(page, baseURL);

  // Action: a guest with no account opens the link and joins under a unique nick.
  const nick = uniqueNick("Gość");
  const guest = await newGuestContext(browser);
  await joinRoom(await guest.newPage(), room.link, nick);

  // Assertion: the host's list shows the guest without a reload...
  await expect(playerRow(page, nick)).toBeVisible();
  // ...before the screen's first poll could have run, so only the bell can have brought the guest in.
  expect(Date.now() - room.openedAt, "the guest appeared only after the first poll could have run").toBeLessThan(
    ROOM_POLL_MS,
  );

  // Cleanup: the guest's browser closes. The room and the guest stay in the database, because no test deletes its rooms
  // afterwards. CI runs on a throwaway local Supabase; the unique nick keeps runs apart.
  await guest.close();
});
