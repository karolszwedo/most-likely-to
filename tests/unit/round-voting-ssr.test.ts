import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import RoundVoting from "@/components/room/RoundVoting";
import type { ActionOutcome } from "@/components/room/room-actions";
import type { LobbyPlayer, RoomView, VotingRound } from "@/lib/rooms/shared";

// B-1 of the security review (context/archive/2026-11-16-security-hardening/plan.md, Faza 2 #1): the room's page comes
// from the server with the vote's form in it, and the island takes it over only once its script has run (client:load in
// src/pages/r/[id].astro). The form has no method, so a press on "Zagłosuj" before that is the browser's own: a GET of
// the page with the chosen radio in the address (?vote=<place>), into the address bar, the history and the Worker's
// request logs, where no vote's target may ever be (AGENTS.md, Hard Rules). The oracle is the plan's contract: in the
// server's HTML the form's submit button is disabled, and the radios keep their shared name, so the arrow keys still
// move between them as one group. That the button works once the island runs is e2e's to check (castVote waits for it).

const ROOM_ID = "3f2b8c1e-7a4d-4e9b-9c2a-5d6e7f8a9b0c";

const PLAYERS: LobbyPlayer[] = [
  { nick: "Kasia", host: true, cohost: false, color: 0 },
  { nick: "Ola", host: false, cohost: false, color: 1 },
  { nick: "Kuba", host: false, cohost: false, color: 2 },
];

// Question 1 still voting, as a guest who has not voted sees it: the form is on the screen.
const ROUND: VotingRound & { question: string } = {
  number: 1,
  question_id: "q-1",
  question_text: null,
  phase: "voting",
  eligible: PLAYERS.map(({ nick }) => nick),
  voted: ["Kasia"],
  me_voted: false,
  after_skip: false,
  question: "zasnąłby na własnej imprezie",
};

const VIEW: RoomView = {
  status: "playing",
  role: "guest",
  leader: false,
  me: "Ola",
  players: PLAYERS,
  round: ROUND,
  requests: [],
  returning: [],
  proposals: [],
  own_proposals: { left: 3, waiting: 0 },
  question_count: 15,
  channel_key: "AAAAAAAAAAAAAAAAAAAAAA",
  questionsLeft: null,
  moreQuestions: null,
  questions: null,
  summary: null,
  linkUrl: null,
};

function ok(): Promise<ActionOutcome> {
  return Promise.resolve({ ok: true });
}

// The voting screen as the server renders it into the room's page: no preview, ids without a prefix.
function serverHtml(): string {
  return renderToStaticMarkup(
    createElement(RoundVoting, {
      roomId: ROOM_ID,
      view: VIEW,
      round: ROUND,
      idPrefix: "",
      titleAs: "h1",
      refreshFailed: false,
      onVote: ok,
      onReveal: ok,
      onSkip: ok,
      onEnd: ok,
      onCohost: ok,
      onColor: ok,
      onRemove: ok,
      refreshes: 0,
    }),
  );
}

// Every opening tag of an element, with its attributes.
function tags(html: string, element: string): string[] {
  return [...html.matchAll(new RegExp(`<${element}\\b[^>]*>`, "g"))].map(([tag]) => tag);
}

function hasAttribute(tag: string, name: string): boolean {
  return new RegExp(`\\s${name}(?:=|\\s|>|/)`).test(tag);
}

describe("RoundVoting in the server's HTML", () => {
  const html = serverHtml();

  it("has the vote's form", () => {
    expect(tags(html, "form")).toHaveLength(1);
  });

  it("comes with its one submit button disabled", () => {
    const submits = tags(html, "button").filter((tag) => tag.includes('type="submit"'));

    expect(submits).toHaveLength(1);
    expect(hasAttribute(submits[0], "disabled")).toBe(true);
  });

  it("keeps one shared name on every radio, so the arrow keys move between them", () => {
    const radios = tags(html, "input").filter((tag) => tag.includes('type="radio"'));
    const names = radios.map((tag) => /\sname="([^"]*)"/.exec(tag)?.[1]);

    // One radio per player who may vote, and "Wstrzymuję się".
    expect(radios).toHaveLength(PLAYERS.length + 1);
    expect(names.every((name) => name !== undefined && name !== "")).toBe(true);
    expect(new Set(names).size).toBe(1);
  });
});
