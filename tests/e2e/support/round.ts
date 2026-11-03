// Round steps shared by the E2E specs: a leader (the host, or a co-host since S-07) starts the game, a player votes, a
// screen's reveal is read, a leader moves the evening on (a reveal before everyone voted, the next question, a skip, the
// end), and the end's summary is read. Every step takes the screen it runs on, so it works on a co-host's screen as on
// the host's, and goes through it by role and accessible name, as a player would (src/components/room/RoundVoting.tsx,
// RoundReveal.tsx, HostActions.tsx, RoomScreen.tsx, GameSummary.tsx).

import { expect, type Locator, type Page } from "@playwright/test";

// How long a screen may take to show the round's next phase after someone else's action: the bell, the screen's
// limiter (500 ms between fetches, a little more after a bell that found nothing new; src/lib/live-sync/limiter.ts)
// and a slow CI runner. Also S-04's budget (PRD US-01, "w mniej niż 10 s"): a screen whose socket died quietly gets it
// from its own poll. Since S-04 it is longer than ROOM_POLL_MS (8 s), so a wait of ROUND_UPDATE_MS no longer tells the
// bell from the poll: only the "Bell vs poll" checks against ROOM_POLL_MS do (test-plan §6.4).
export const ROUND_UPDATE_MS = 10_000;

// The round's question as the screen's title, "Kto z nas najprawdopodobniej …?". The text shown when the question
// could not be loaded ("Nie udało się wczytać pytania.") does not match.
export function roundQuestion(page: Page): Locator {
  return page.getByRole("heading", { level: 1, name: /^Kto z nas najprawdopodobniej .+\?$/ });
}

// The host's "Zacznij grę", once the screen allows it (at least 3 players in the list).
export async function startGame(host: Page): Promise<void> {
  const start = host.getByRole("button", { name: "Zacznij grę", exact: true });
  await expect(start).toBeEnabled();
  await start.click();
}

// One player's vote through their own screen: a person from the list, or null for "Wstrzymuję się", then "Zagłosuj".
export async function castVote(page: Page, target: string | null): Promise<void> {
  const choice =
    target === null
      ? page.getByRole("radio", { name: "Wstrzymuję się", exact: true })
      : page.getByRole("radio", { name: target, exact: true });
  await choice.check();
  await page.getByRole("button", { name: "Zagłosuj", exact: true }).click();
}

// The screen's own confirmation of an accepted vote ("Głos oddany"). It stays until the round is revealed, so the last
// vote's confirmation may be gone before anyone looks: check the reveal after that one.
export function voteConfirmation(page: Page): Locator {
  return page.getByRole("alert").filter({ hasText: "Głos oddany" });
}

// The reveal's table under "Wynik": one row per player, nick and votes. It is there in both views ("Koło" and
// "Paski"), so the toggle is never needed to read the counts.
export function resultTable(page: Page): Locator {
  return page.getByRole("region", { name: "Wynik" }).getByRole("table");
}

export interface ExpectedReveal {
  // The question every screen showed while voting.
  question: string;
  // Every player of the round with their count, as the oracle has it.
  votes: [nick: string, count: number][];
  abstained: number;
}

// A screen shows the round's reveal: the same question, exactly these players (header row aside) with these counts,
// and the abstentions. Waits for the reveal to arrive first.
export async function expectReveal(page: Page, expected: ExpectedReveal): Promise<void> {
  const table = resultTable(page);
  await expect(table).toBeVisible({ timeout: ROUND_UPDATE_MS });
  await expect(roundQuestion(page)).toHaveText(expected.question);
  await expect(table.getByRole("row")).toHaveCount(expected.votes.length + 1);
  for (const [nick, count] of expected.votes) {
    const votes = table.getByRole("row").filter({ hasText: nick }).getByRole("cell").last();
    await expect(votes, `votes of ${nick}`).toHaveText(String(count));
  }
  await expect(page.getByText(`Wstrzymało się: ${String(expected.abstained)}`, { exact: true })).toBeVisible();
}

// A screen on a question's vote with nothing chosen and nothing cast: "Zagłosuj" is there and no radio is checked, so
// no choice and no "Głos oddany" carried over from the question before. Waits for the vote's view first.
export async function expectFreshVote(page: Page): Promise<void> {
  await expect(page.getByRole("button", { name: "Zagłosuj", exact: true })).toBeVisible({ timeout: ROUND_UPDATE_MS });
  await expect(page.getByRole("radio", { checked: true })).toHaveCount(0);
}

// A thumb on the reveal, under "Oceń pytanie" (S-11): every player of the room has both. The buttons show only the
// icon; their names are "Dobre pytanie" and "Słabe pytanie".
export function questionThumb(page: Page, thumb: "up" | "down"): Locator {
  return page.getByRole("button", { name: thumb === "up" ? "Dobre pytanie" : "Słabe pytanie", exact: true });
}

// A leader's "Odsłoń wynik" while the question is voting, before everyone has voted (S-07: the co-host, while the host
// who left is still among those who may vote). It asks first: the first press turns the same button into "Na pewno
// odsłonić? Zagłosowało N z M" with "Anuluj" next to it, and the second press reveals.
export async function revealResult(leader: Page): Promise<void> {
  await leader.getByRole("button", { name: "Odsłoń wynik", exact: true }).click();
  await expect(leader.getByRole("button", { name: "Anuluj", exact: true })).toBeVisible();
  await leader.getByRole("button", { name: /^Na pewno odsłonić\? Zagłosowało \d+ z \d+$/ }).click();
}

// The host's "Następne pytanie" after a reveal: one press, nothing is lost.
export async function nextQuestion(host: Page): Promise<void> {
  await host.getByRole("button", { name: "Następne pytanie", exact: true }).click();
}

// The host's "Pomiń pytanie" while the question is voting. Its votes are lost, so it asks first: the first press turns
// the same button into "Na pewno pominąć? Głosy przepadną (zagłosowało N z M)" with "Anuluj" next to it, and the second
// press skips.
export async function skipQuestion(host: Page): Promise<void> {
  await host.getByRole("button", { name: "Pomiń pytanie", exact: true }).click();
  await expect(host.getByRole("button", { name: "Anuluj", exact: true })).toBeVisible();
  await host.getByRole("button", { name: /^Na pewno pominąć\? Głosy przepadną \(zagłosowało \d+ z \d+\)$/ }).click();
}

// The host's "Zakończ grę", while voting or after a reveal. It ends the evening for everyone, so it asks first, as
// skipQuestion does.
export async function endGame(host: Page): Promise<void> {
  await host.getByRole("button", { name: "Zakończ grę", exact: true }).click();
  await expect(host.getByRole("button", { name: "Anuluj", exact: true })).toBeVisible();
  await host
    .getByRole("button", { name: "Na pewno zakończyć grę? Wszyscy zobaczą koniec wieczoru", exact: true })
    .click();
}

// The note above the question on every screen of the round that follows a skip, for the whole round. A note, not an
// alert: the screen's announcement already says the skip with the new question.
export function skipNotice(page: Page): Locator {
  return page.getByRole("note").filter({ hasText: "Prowadzący pominął poprzednie pytanie." });
}

// The screen's title once the game is over ("Zakończ grę"), the same for the host and every guest.
export function eveningEnd(page: Page): Locator {
  return page.getByRole("heading", { level: 1, name: "Koniec wieczoru", exact: true });
}

// The summary under the end of the evening once the game had a revealed question (S-15, PRD FR-022;
// src/components/room/GameSummary.tsx): the game's counts, each one term and its number (the end has no other term or
// definition), the list under the region "Najwięcej głosów dziś" (one item per person, then one "pozostali" for the
// rest, if any; the pie above it is for the eye only) and the list under the region "Nikt dziś nie głosował na".
export function gameSummary(page: Page): { terms: Locator; numbers: Locator; top: Locator; unvoted: Locator } {
  return {
    terms: page.getByRole("term"),
    numbers: page.getByRole("definition"),
    top: page.getByRole("region", { name: "Najwięcej głosów dziś", exact: true }).getByRole("listitem"),
    unvoted: page.getByRole("region", { name: "Nikt dziś nie głosował na", exact: true }).getByRole("listitem"),
  };
}

export interface ExpectedSummary {
  // Each count as the screen names it, with its number, in the screen's order.
  counts: [term: string, value: number][];
  // Everyone under "Najwięcej głosów dziś" in seat order, with their votes as the screen says them ("1 głos").
  top: [nick: string, votes: string][];
  // Everyone under "Nikt dziś nie głosował na", in seat order.
  unvoted: string[];
}

// A screen shows the game's summary: exactly these counts, each term with the number at its place, and exactly these
// items in this order under each heading, so a "pozostali" item or a missing person is one item off. `me` is the
// screen's own player: their item, and only theirs, has the badge "ty" after the nick, as in the reveal.
export async function expectGameSummary(page: Page, me: string, expected: ExpectedSummary): Promise<void> {
  const summary = gameSummary(page);
  await expect(summary.terms).toHaveText(expected.counts.map(([term]) => term));
  await expect(summary.numbers).toHaveText(expected.counts.map(([, value]) => String(value)));
  await expect(summary.top).toHaveText(expected.top.map(([nick, votes]) => summaryItem(nick, me, `— ${votes}`)));
  await expect(summary.unvoted).toHaveText(expected.unvoted.map((nick) => summaryItem(nick, me, "")));
}

// One item of a summary list as its text reads: the nick, "ty" right after it on the player's own screen, then the
// rest. A pattern, because the item's parts are separate elements with no space promised between them.
function summaryItem(nick: string, me: string, rest: string): RegExp {
  const badge = nick === me ? "ty\\s*" : "";
  return new RegExp(`^\\s*${literal(nick)}\\s*${badge}${literal(rest)}\\s*$`);
}

// Text inside a pattern as the plain text it is.
function literal(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
