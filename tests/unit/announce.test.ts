import { describe, expect, it } from "vitest";
import { announcement, announcementKey, roleAnnouncement, skipNotice } from "@/lib/rooms/announce";
import type { LobbyPlayer, RoomView } from "@/lib/rooms/shared";

// What the room screen's live region says when the game moves on, and when the screen shows the note after a skip
// (context/archive/2026-10-15-full-game-evening/plan.md, Faza 4 #1; Desired End State 2 and 7). Behaviour only: a new
// question's number is heard, out of the game's questions from the first one on (game-length,
// context/changes/game-length/plan.md, Faza 3 #4: the same as "Pytanie N z T" on the screen), and a change of that
// count alone is no news; a skip and the end of the evening have their own words, the note belongs to the round
// after a skip alone; a guest hears when the host gives them the co-host role and when the host takes it back
// (context/changes/co-host-role/plan.md, Faza 3 #3), apart from the key. The Polish sentences are not copied here
// (test-plan §6.1); the states are written by hand from the contract in src/lib/rooms/shared.ts, the players' link of a
// leader's view included (S-09), which nothing here announces.

const PLAYERS: LobbyPlayer[] = [
  { nick: "Ola", host: true, cohost: false, color: 0 },
  { nick: "Bartek", host: false, cohost: false, color: 1 },
  { nick: "Kuba", host: false, cohost: false, color: 2 },
];
const QUESTION = "spóźniłby się na własne urodziny";
const OTHER_QUESTION = "zjadłby pizzę z ananasem";
// S-09: the players' link in a leader's view, in every status; a guest's view has none.
const LINK_URL = "https://most-likely-to.charlesonthewave.workers.dev/j/Xq3vL9tR2mWb7KpZ0aYc_e";
// players-only-live-channel: the room's channel key in every player's view, which nothing here announces.
const CHANNEL_KEY = "Pk7sW2nQ9xLb4VmT8rYc-a";

function lobby(): RoomView {
  return {
    status: "lobby",
    role: "host",
    leader: true,
    me: "Ola",
    players: PLAYERS,
    round: null,
    requests: [],
    returning: [],
    proposals: [],
    own_proposals: { left: 3, waiting: 0 },
    question_count: 15,
    questionsLeft: null,
    moreQuestions: null,
    questions: null,
    summary: null,
    linkUrl: LINK_URL,
    channel_key: CHANNEL_KEY,
  };
}

// total: the number of the game's questions (question_count), 15 unless a test changes it.
function voting(
  number: number,
  options: {
    afterSkip?: boolean;
    question?: string | null;
    voted?: string[];
    role?: "host" | "guest";
    total?: number;
  } = {},
): RoomView {
  const voted = options.voted ?? [];
  const me = options.role === "host" ? "Ola" : "Bartek";
  return {
    status: "playing",
    role: options.role ?? "guest",
    leader: options.role === "host",
    me,
    players: PLAYERS,
    round: {
      number,
      question_id: "na-co-dzien-001",
      question_text: null,
      phase: "voting",
      eligible: PLAYERS.map(({ nick }) => nick),
      voted,
      me_voted: voted.includes(me),
      after_skip: options.afterSkip ?? false,
      question: options.question === undefined ? QUESTION : options.question,
    },
    requests: [],
    returning: [],
    proposals: [],
    own_proposals: { left: 3, waiting: 0 },
    question_count: options.total ?? 15,
    questionsLeft: null,
    moreQuestions: null,
    questions: null,
    summary: null,
    linkUrl: options.role === "host" ? LINK_URL : null,
    channel_key: CHANNEL_KEY,
  };
}

function revealed(number: number): RoomView {
  return {
    status: "playing",
    role: "guest",
    leader: false,
    me: "Bartek",
    players: PLAYERS,
    round: {
      number,
      question_id: "na-co-dzien-001",
      question_text: null,
      phase: "revealed",
      results: [
        { nick: "Ola", votes: 2 },
        { nick: "Bartek", votes: 0 },
        { nick: "Kuba", votes: 1 },
      ],
      abstained: 0,
      ballots: 3,
      question: QUESTION,
    },
    requests: [],
    returning: [],
    proposals: [],
    own_proposals: { left: 3, waiting: 0 },
    question_count: 15,
    questionsLeft: null,
    moreQuestions: null,
    questions: null,
    summary: null,
    linkUrl: null,
    channel_key: CHANNEL_KEY,
  };
}

function skipped(number: number, role: "host" | "guest" = "guest"): RoomView {
  return {
    status: "playing",
    role,
    leader: role === "host",
    me: role === "host" ? "Ola" : "Bartek",
    players: PLAYERS,
    round: { number, phase: "skipped" },
    requests: [],
    returning: [],
    proposals: [],
    own_proposals: { left: 3, waiting: 0 },
    question_count: 15,
    questionsLeft: role === "host" ? false : null,
    moreQuestions: role === "host" ? 0 : null,
    questions: null,
    summary: null,
    linkUrl: role === "host" ? LINK_URL : null,
    channel_key: CHANNEL_KEY,
  };
}

function closed(role: "host" | "guest"): RoomView {
  return {
    status: "closed",
    role,
    leader: role === "host",
    me: role === "host" ? "Ola" : "Bartek",
    players: PLAYERS,
    round: null,
    requests: [],
    returning: [],
    proposals: [],
    own_proposals: { left: 3, waiting: 0 },
    question_count: 15,
    questionsLeft: null,
    moreQuestions: null,
    questions: null,
    summary: null,
    linkUrl: role === "host" ? LINK_URL : null,
    channel_key: CHANNEL_KEY,
  };
}

// The guest's lobby (Bartek), with no role.
function guestLobby(): RoomView {
  return { ...lobby(), role: "guest", leader: false, me: "Bartek", linkUrl: null };
}

// The same state for a guest the host made a co-host (S-07): the role on their row of the list, and they lead, so the
// view carries the players' link too (S-09).
function asCohost(view: RoomView): RoomView {
  return {
    ...view,
    leader: true,
    players: view.players.map((player) => (player.nick === view.me ? { ...player, cohost: true } : player)),
    linkUrl: LINK_URL,
  };
}

// A number as a word of its own: "12" is not "2" followed by something.
function saysNumber(text: string, number: number): boolean {
  return new RegExp(`(^|\\D)${String(number)}(\\D|$)`).test(text);
}

describe("announcement", () => {
  it("has its own words for every step of the evening", () => {
    const steps = [voting(1), voting(2), voting(2, { afterSkip: true }), revealed(2), skipped(3), closed("guest")].map(
      announcement,
    );
    for (const text of steps) expect(text).not.toBe("");
    expect(new Set(steps).size).toBe(steps.length);
  });

  it.each([2, 3, 12])("says the number of question %i", (number) => {
    expect(saysNumber(announcement(voting(number)), number)).toBe(true);
    expect(saysNumber(announcement(voting(number, { afterSkip: true })), number)).toBe(true);
  });

  it("tells question 2 from question 12 with the same text", () => {
    expect(announcement(voting(2))).not.toBe(announcement(voting(12)));
    expect(saysNumber(announcement(voting(2)), 12)).toBe(false);
  });

  it.each([1, 2, 7])("says question %i out of the game's questions, also after a skip", (number) => {
    for (const total of [7, 16, 20]) {
      expect(saysNumber(announcement(voting(number, { total })), total)).toBe(true);
      expect(saysNumber(announcement(voting(number, { total, afterSkip: number > 1 })), total)).toBe(true);
    }
  });

  it("tells question 3 of 7 from question 3 of 20", () => {
    expect(announcement(voting(3, { total: 7 }))).not.toBe(announcement(voting(3, { total: 20 })));
    expect(saysNumber(announcement(voting(3, { total: 7 })), 20)).toBe(false);
  });

  it("starts the game with the first question, in words of its own", () => {
    expect(announcement(voting(1))).not.toBe(announcement(voting(2)));
  });

  it("says the question on every new question, also after a skip", () => {
    for (const view of [voting(1), voting(2), voting(4, { afterSkip: true })]) {
      expect(announcement(view)).toContain(QUESTION);
    }
    expect(announcement(voting(2, { question: OTHER_QUESTION }))).toContain(OTHER_QUESTION);
  });

  it("says a question the base did not have without a placeholder", () => {
    const text = announcement(voting(2, { question: null }));
    expect(text).not.toBe("");
    expect(text).not.toBe(announcement(voting(2)));
    expect(text).not.toMatch(/null|undefined/);
  });

  it("says the skip together with the new question, so a screen that slept through it still hears it", () => {
    expect(announcement(voting(3, { afterSkip: true }))).not.toBe(announcement(voting(3)));
  });

  it("is the same for the host and a guest", () => {
    expect(announcement(voting(2, { role: "host" }))).toBe(announcement(voting(2, { role: "guest" })));
    expect(announcement(skipped(4, "host"))).toBe(announcement(skipped(4, "guest")));
    expect(announcement(closed("host"))).toBe(announcement(closed("guest")));
  });

  it("says nothing in the lobby", () => {
    expect(announcement(lobby())).toBe("");
  });
});

describe("announcementKey", () => {
  it("changes with every new question, phase and status", () => {
    const keys = [lobby(), voting(1), revealed(1), voting(2), revealed(2), skipped(3), closed("guest")].map(
      announcementKey,
    );
    expect(new Set(keys).size).toBe(keys.length);
  });

  it("changes when a skip opens the next question, even with the same phase", () => {
    expect(announcementKey(voting(3, { afterSkip: true }))).not.toBe(announcementKey(voting(2)));
  });

  it("stays the same while players vote, so a vote is not announced as a new question", () => {
    expect(announcementKey(voting(2, { voted: ["Ola"] }))).toBe(announcementKey(voting(2)));
    expect(announcementKey(voting(2, { voted: ["Ola", "Kuba"] }))).toBe(announcementKey(voting(2, { voted: ["Ola"] })));
  });

  it("stays the same when only the number of the game's questions changes, so that alone is not announced", () => {
    // An approved proposal mid-round (16) and the lobby's list moves (14).
    expect(announcementKey(voting(2, { total: 16 }))).toBe(announcementKey(voting(2)));
    expect(announcementKey({ ...lobby(), question_count: 14 })).toBe(announcementKey(lobby()));
  });
});

describe("skipNotice", () => {
  it("shows on the round after a skip, for the host and a guest", () => {
    expect(skipNotice(voting(3, { afterSkip: true }))).toBe(true);
    expect(skipNotice(voting(3, { afterSkip: true, role: "host", voted: ["Ola"] }))).toBe(true);
  });

  it.each([
    { why: "a round after a reveal", view: voting(3) },
    { why: "the first question", view: voting(1) },
    { why: "a reveal", view: revealed(3) },
    { why: "a skipped last question", view: skipped(3) },
    { why: "the lobby", view: lobby() },
    { why: "the end of the evening", view: closed("guest") },
  ])("stays hidden on $why", ({ view }) => {
    expect(skipNotice(view)).toBe(false);
  });
});

describe("roleAnnouncement", () => {
  it("tells a guest who got the co-host role and one who lost it, each in words of its own", () => {
    const given = roleAnnouncement(false, asCohost(voting(2)));
    const taken = roleAnnouncement(true, voting(2));
    expect(given).not.toBe("");
    expect(taken).not.toBe("");
    expect(given).not.toBe(taken);
  });

  it("says the same in the lobby, while voting and after a reveal", () => {
    const given = [guestLobby(), voting(2), revealed(2)].map((view) => roleAnnouncement(false, asCohost(view)));
    const taken = [guestLobby(), voting(2), revealed(2)].map((view) => roleAnnouncement(true, view));
    expect(new Set(given).size).toBe(1);
    expect(new Set(taken).size).toBe(1);
  });

  it("says nothing while the role stays", () => {
    expect(roleAnnouncement(false, voting(2))).toBe("");
    expect(roleAnnouncement(true, asCohost(voting(2)))).toBe("");
  });

  it("says nothing to the host, who always leads", () => {
    expect(roleAnnouncement(false, voting(2, { role: "host" }))).toBe("");
  });

  it("says nothing once the room is closed", () => {
    expect(roleAnnouncement(true, closed("guest"))).toBe("");
  });

  it("is apart from announcementKey, so a role is never announced as a new question", () => {
    expect(announcementKey(asCohost(voting(2)))).toBe(announcementKey(voting(2)));
    expect(announcementKey(asCohost(guestLobby()))).toBe(announcementKey(guestLobby()));
  });
});
