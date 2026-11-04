import { beforeAll, describe, expect, it } from "vitest";
import type { QuestionId } from "@/data/questions";
import { anonClient, newHost, newPlayerToken, type Host } from "./support/clients";
import { SEED_CATEGORIES, isRecord, seedGuest, seedRoom, type OwnRoom, type SeededGuest } from "./support/rooms";
import {
  EVENING_QUESTION_IDS,
  LOBBY_KEYS,
  OWN_PROPOSALS_KEYS,
  PROPOSAL_KEYS,
  VOTING_ROUND_KEYS,
  admitLatecomer,
  approveProposal,
  endGame,
  keysOf,
  nextRound,
  openQuestionList,
  proposeQuestion,
  rejectProposal,
  removePlayer,
  requestJoin,
  requestReturn,
  roomLobby,
  roundOf,
  seedReveal,
  seedStartGame,
  setCohost,
  skipRound,
  startGame,
  type Answer,
} from "./support/rounds";

// Proposals of questions (S-10) through the roles' own doors: RPC with the publishable key, as the room's guests (anon
// with a player token), as a co-host (anon with a token: a co-host has no session) and as the signed-in host, past the
// Worker. Oracle: PRD FR-013 and FR-014 (a player proposes a question during the evening, a leader approves or rejects
// it, and the approved one joins this game's list) and Karol's decisions 1-5 at the top of
// context/changes/guest-question-proposals/plan.md: (1) proposals go out in the lobby and during the game, and are
// approved only from the start of the game; (2) an approved question plays in the next round, ahead of the rest of the
// list; (3) only a leader sees the author's nick; (4) every player, the host and the co-hosts included, has 3 proposals
// per game, and a rejected one still counts; (5) the author sees only the counts (waiting, left), never how a proposal
// was decided. Every number, nick, text, count and refusal expected here is written out by hand from the scenario,
// never computed.
//
// propose_question, approve_proposal, reject_proposal and room_lobby's proposals and own_proposals come from
// supabase/migrations/*_guest_question_proposals.sql. Without it PostgREST answers each new call with PGRST202 (no such
// function), and every test here is red on its own probe or on the state those calls should have made. What the roles
// cannot see (the catalog, the rows left, the sweep, list_full) is supabase/tests/round_creator_view.test.sql's to
// check. Another host's session in this room is out of reach: one host per file.
//
// One sign-up per run, in beforeAll. One open room per host, so each room opens once the one before is closed
// (confirm_close closes it should the end have failed); Vitest runs the suites in order, each suite's beforeAll right
// before its tests. Each room plays out once, in order, in its beforeAll, and each step's answer is kept and checked by
// its own test, so no test depends on another one having run.

const anon = anonClient();
const [Q1, Q2] = EVENING_QUESTION_IDS;
const Q20 = "na-co-dzien-020" satisfies QuestionId;
const OK = { data: { ok: true }, error: null };
// Not a player token: the Worker sends the cookie's 32-byte one or none.
const MALFORMED_TOKEN = "not-a-player-token";

// The players' texts, as a question is stored: the end of the sentence, with no "?".
const KINO = "zasnąłby w kinie";
const URODZINY = "zapomniałby o własnych urodzinach";
const WINDA = "zaśpiewałby w windzie";
const PIZZA = "zjadłby pizzę z ananasem";
const KLUCZE = "zgubiłby klucze w lodówce";
const KAPCIE = "poszedłby na spacer w kapciach";
const KAWA = "wypiłby kawę z solą";
const TAKSOWKA = "pomyliłby taksówkę z radiowozem";
const PARASOL = "zostawiłby parasol w tramwaju";
// Exactly 90 characters, the most a question may have, and 91, one over the limit.
const LONGEST = "zabrałby na biwak namiot bez śledzi, cztery latarki bez baterii i ani jednej łyżki do zupy";
const TOO_LONG = "zabrałby na biwak namiot bez śledzi, cztery latarki bez baterii i ani jednej łyżki do zupek";
// A good question after 385 spaces: 16 characters once normalized, but 401 as sent, one over the cap of 400.
const PADDED = " ".repeat(385) + "zasnąłby w kinie";

// "Przejrzyj pytania" in the room with a list: 15 questions of the first seed category, none 18+.
const LIST_CANDIDATES = [
  "na-co-dzien-001",
  "na-co-dzien-002",
  "na-co-dzien-003",
  "na-co-dzien-004",
  "na-co-dzien-005",
  "na-co-dzien-006",
  "na-co-dzien-007",
  "na-co-dzien-008",
  "na-co-dzien-009",
  "na-co-dzien-010",
  "na-co-dzien-011",
  "na-co-dzien-012",
  "na-co-dzien-013",
  "na-co-dzien-014",
  "na-co-dzien-015",
] as const satisfies readonly QuestionId[];
// The list those 15 make, at positions 1-15.
const OPENED = [
  { position: 1, question_id: "na-co-dzien-001", text: null },
  { position: 2, question_id: "na-co-dzien-002", text: null },
  { position: 3, question_id: "na-co-dzien-003", text: null },
  { position: 4, question_id: "na-co-dzien-004", text: null },
  { position: 5, question_id: "na-co-dzien-005", text: null },
  { position: 6, question_id: "na-co-dzien-006", text: null },
  { position: 7, question_id: "na-co-dzien-007", text: null },
  { position: 8, question_id: "na-co-dzien-008", text: null },
  { position: 9, question_id: "na-co-dzien-009", text: null },
  { position: 10, question_id: "na-co-dzien-010", text: null },
  { position: 11, question_id: "na-co-dzien-011", text: null },
  { position: 12, question_id: "na-co-dzien-012", text: null },
  { position: 13, question_id: "na-co-dzien-013", text: null },
  { position: 14, question_id: "na-co-dzien-014", text: null },
  { position: 15, question_id: "na-co-dzien-015", text: null },
];

// A precondition, not the thing under test: throws on anything but { ok: true }, so beforeAll fails red. Only the
// function's own refusal code goes into the message, never its arguments (nicks, tokens, texts).
function seed(answer: Answer, step: string): void {
  if (answer.error) throw new Error(`${step} failed: ${answer.error.code}`);
  const data = answer.data;
  if (!isRecord(data) || data.ok !== true) {
    const reason = isRecord(data) && typeof data.reason === "string" ? data.reason : "an unexpected shape";
    throw new Error(`${step} was refused: ${reason}`);
  }
}

// A top-level field of a room_lobby answer; undefined when the answer has none. Never throws.
function fieldOf(answer: Answer, key: string): unknown {
  return isRecord(answer.data) ? answer.data[key] : undefined;
}

// The proposals of a room_lobby answer, or [] when there are none to read. Never throws.
function proposalsOf(answer: Answer): unknown[] {
  const proposals = fieldOf(answer, "proposals");
  return Array.isArray(proposals) ? (proposals as unknown[]) : [];
}

// The numbers on a leader's list, in the order of the answer. Never throws.
function numbersOf(answer: Answer): unknown[] {
  return proposalsOf(answer).map((proposal) => (isRecord(proposal) ? proposal.number : null));
}

// Which of several calls made at once got which answer is the race's; how many got each is not. Sorted. Never throws.
function outcomesOf(answers: Answer[]): string[] {
  return answers
    .map((answer) => {
      if (answer.error) return `error ${answer.error.code}`;
      const data = answer.data;
      if (isRecord(data) && data.ok === true) return "ok";
      return isRecord(data) && typeof data.reason === "string" ? data.reason : "an unexpected shape";
    })
    .sort();
}

function refusal(reason: string): { error: null; data: { ok: false; reason: string } } {
  return { error: null, data: { ok: false, reason } };
}

let host: Host;
// Tokens of the first room, for the second room's strangers.
let firstRoomGuestToken: string;
let firstRoomCohostToken: string;

beforeAll(async () => {
  host = await newHost();
});

describe("the lobby, then a game with no list: Host, Ola, Bartek and Kuba, a co-host", () => {
  let room: OwnRoom;
  let ola: SeededGuest;
  let bartek: SeededGuest;
  let kuba: SeededGuest;
  // The positive control.
  let olaProposes: Answer;
  let olaView: Answer;
  let hostView: Answer;
  let kubaView: Answer;
  let bartekView: Answer;
  // The form sent twice.
  let olaAgain: Answer;
  let olaAfterAgain: Answer;
  let hostAfterAgain: Answer;
  // The other doors.
  let hostProposes: Answer;
  let kubaProposes: Answer;
  let hostSeesThree: Answer;
  // The text.
  let emptyText: Answer;
  let onlySpaces: Answer;
  let onlyQuestionMarks: Answer;
  let noText: Answer;
  let tooLong: Answer;
  let overTheCap: Answer;
  let olaAfterRefusedTexts: Answer;
  // The limit.
  let longestText: Answer;
  let olaThird: Answer;
  let olaFull: Answer;
  let olaFourth: Answer;
  let hostSeesLongest: Answer;
  // A rejection in the lobby.
  let rejectInLobby: Answer;
  let hostAfterReject: Answer;
  let olaAfterReject: Answer;
  let bartekAfterReject: Answer;
  let olaResendsRejected: Answer;
  let olaResendsWaiting: Answer;
  let olaAfterResends: Answer;
  // At once.
  let bartekAtOnce: Answer[];
  let bartekAfterAtOnce: Answer;
  let kubaAtOnce: Answer[];
  let kubaAfterAtOnce: Answer;
  // Who may.
  let noTokenProposes: Answer;
  let strangerProposes: Answer;
  let malformedProposes: Answer;
  let bartekApproves: Answer;
  let bartekRejects: Answer;
  let noTokenApproves: Answer;
  let noTokenRejects: Answer;
  let malformedApproves: Answer;
  let malformedRejects: Answer;
  // The lobby's trap.
  let hostApprovesInLobby: Answer;
  let kubaApprovesInLobby: Answer;
  let hostAfterRefusedApprove: Answer;
  let hostRound1: Answer;
  // The approval.
  let kubaApproves: Answer;
  let hostAfterApprove: Answer;
  let olaAfterApprove: Answer;
  let kubaAfterApprove: Answer;
  let bartekAfterApprove: Answer;
  // The queue.
  let nextToProposal: Answer;
  let bartekRound2: Answer;
  let hostRound2: Answer;
  let nextPastProposal: Answer;
  let hostRound3: Answer;
  // The end.
  let end: Answer;
  let hostAfterEnd: Answer;
  let proposeAfterEnd: Answer;
  let approveAfterEnd: Answer;
  let rejectAfterEnd: Answer;

  beforeAll(async () => {
    room = await seedRoom(host);
    ola = await seedGuest(room.linkToken, "Ola");
    bartek = await seedGuest(room.linkToken, "Bartek");
    kuba = await seedGuest(room.linkToken, "Kuba");
    firstRoomGuestToken = ola.playerToken;
    firstRoomCohostToken = kuba.playerToken;
    seed(await setCohost(host.client, room.id, "Kuba", true), "the co-host role for Kuba");

    // Number 1: Ola, a guest with no session.
    olaProposes = await proposeQuestion(anon, room.id, KINO, ola.playerToken);
    olaView = await roomLobby(anon, room.id, ola.playerToken);
    hostView = await roomLobby(host.client, room.id);
    kubaView = await roomLobby(anon, room.id, kuba.playerToken);
    bartekView = await roomLobby(anon, room.id, bartek.playerToken);

    // The form sent twice, this time with the "?" the screen adds: the same text once stored.
    olaAgain = await proposeQuestion(anon, room.id, `${KINO}?`, ola.playerToken);
    olaAfterAgain = await roomLobby(anon, room.id, ola.playerToken);
    hostAfterAgain = await roomLobby(host.client, room.id);

    // Numbers 2 and 3: the host by its session, with "??" at the end, and Kuba by his token.
    hostProposes = await proposeQuestion(host.client, room.id, `${URODZINY}??`);
    kubaProposes = await proposeQuestion(anon, room.id, WINDA, kuba.playerToken);
    hostSeesThree = await roomLobby(host.client, room.id);

    // Texts the rule refuses, none of which may use up a proposal.
    emptyText = await proposeQuestion(anon, room.id, "", ola.playerToken);
    onlySpaces = await proposeQuestion(anon, room.id, "   ", ola.playerToken);
    onlyQuestionMarks = await proposeQuestion(anon, room.id, "??", ola.playerToken);
    noText = await proposeQuestion(anon, room.id, null, ola.playerToken);
    tooLong = await proposeQuestion(anon, room.id, TOO_LONG, ola.playerToken);
    overTheCap = await proposeQuestion(anon, room.id, PADDED, ola.playerToken);
    olaAfterRefusedTexts = await roomLobby(anon, room.id, ola.playerToken);

    // Numbers 4 and 5: Ola's second, the longest text there is, and her third; the fourth is over the limit.
    longestText = await proposeQuestion(anon, room.id, LONGEST, ola.playerToken);
    olaThird = await proposeQuestion(anon, room.id, PIZZA, ola.playerToken);
    olaFull = await roomLobby(anon, room.id, ola.playerToken);
    olaFourth = await proposeQuestion(anon, room.id, KLUCZE, ola.playerToken);
    hostSeesLongest = await roomLobby(host.client, room.id);

    // The host turns number 5 down in the lobby. Ola sends the same text again, which waits no more, and then her first
    // text, which does.
    rejectInLobby = await rejectProposal(host.client, room.id, 5);
    hostAfterReject = await roomLobby(host.client, room.id);
    olaAfterReject = await roomLobby(anon, room.id, ola.playerToken);
    bartekAfterReject = await roomLobby(anon, room.id, bartek.playerToken);
    olaResendsRejected = await proposeQuestion(anon, room.id, PIZZA, ola.playerToken);
    olaResendsWaiting = await proposeQuestion(anon, room.id, KINO, ola.playerToken);
    olaAfterResends = await roomLobby(anon, room.id, ola.playerToken);

    // Numbers 6 and 7: Bartek keeps one proposal, and sends two different texts at once.
    seed(await proposeQuestion(anon, room.id, KAPCIE, bartek.playerToken), "Bartek's first proposal");
    seed(await proposeQuestion(anon, room.id, KAWA, bartek.playerToken), "Bartek's second proposal");
    bartekAtOnce = await Promise.all([
      proposeQuestion(anon, room.id, TAKSOWKA, bartek.playerToken),
      proposeQuestion(anon, room.id, PARASOL, bartek.playerToken),
    ]);
    bartekAfterAtOnce = await roomLobby(anon, room.id, bartek.playerToken);

    // Kuba keeps one proposal too, and sends one text twice at once: the form sent twice.
    seed(await proposeQuestion(anon, room.id, KLUCZE, kuba.playerToken), "Kuba's second proposal");
    kubaAtOnce = await Promise.all([
      proposeQuestion(anon, room.id, TAKSOWKA, kuba.playerToken),
      proposeQuestion(anon, room.id, TAKSOWKA, kuba.playerToken),
    ]);
    kubaAfterAtOnce = await roomLobby(anon, room.id, kuba.playerToken);

    // Who may. Each with arguments that, let through, would add a proposal or decide number 1.
    noTokenProposes = await proposeQuestion(anon, room.id, KLUCZE);
    strangerProposes = await proposeQuestion(anon, room.id, KLUCZE, newPlayerToken());
    malformedProposes = await proposeQuestion(anon, room.id, KLUCZE, MALFORMED_TOKEN);
    bartekApproves = await approveProposal(anon, room.id, 1, bartek.playerToken);
    bartekRejects = await rejectProposal(anon, room.id, 1, bartek.playerToken);
    noTokenApproves = await approveProposal(anon, room.id, 1);
    noTokenRejects = await rejectProposal(anon, room.id, 1);
    malformedApproves = await approveProposal(anon, room.id, 1, MALFORMED_TOKEN);
    malformedRejects = await rejectProposal(anon, room.id, 1, MALFORMED_TOKEN);

    // The lobby's trap: a row on the list before the start would pass for a reviewed list.
    hostApprovesInLobby = await approveProposal(host.client, room.id, 1);
    kubaApprovesInLobby = await approveProposal(anon, room.id, 1, kuba.playerToken);
    hostAfterRefusedApprove = await roomLobby(host.client, room.id);
    await seedStartGame(host, room.id, Q1);
    hostRound1 = await roomLobby(host.client, room.id);

    // Round 1 is voting: Kuba approves Ola's number 1.
    kubaApproves = await approveProposal(anon, room.id, 1, kuba.playerToken);
    hostAfterApprove = await roomLobby(host.client, room.id);
    olaAfterApprove = await roomLobby(anon, room.id, ola.playerToken);
    kubaAfterApprove = await roomLobby(anon, room.id, kuba.playerToken);
    bartekAfterApprove = await roomLobby(anon, room.id, bartek.playerToken);

    // The approved question plays next, whatever the candidates say; then the candidates go on.
    await seedReveal(host, room.id, 1);
    nextToProposal = await nextRound(host.client, room.id, 1, [Q1, Q2]);
    bartekRound2 = await roomLobby(anon, room.id, bartek.playerToken);
    hostRound2 = await roomLobby(host.client, room.id);
    await seedReveal(host, room.id, 2);
    nextPastProposal = await nextRound(host.client, room.id, 2, [Q1, Q2]);
    hostRound3 = await roomLobby(host.client, room.id);

    // "Zakończ grę" with proposals waiting, then each move in the closed room.
    end = await endGame(host.client, room.id);
    hostAfterEnd = await roomLobby(host.client, room.id);
    proposeAfterEnd = await proposeQuestion(anon, room.id, PARASOL, ola.playerToken);
    approveAfterEnd = await approveProposal(host.client, room.id, 2);
    rejectAfterEnd = await rejectProposal(host.client, room.id, 2);
  });

  // The positive control and who sees what -----------------------------------------------------------------------------

  // An allowed move must work, or a wrong address would look like a refusal everywhere.
  it("positive control: Ola, a guest with no session, proposes in the lobby: exactly { ok: true }, and she has 2 left and 1 waiting", () => {
    expect(olaProposes).toEqual(OK);
    expect(fieldOf(olaView, "own_proposals")).toEqual({ left: 2, waiting: 1 });
  });

  it("the host sees exactly { number: 1, nick: Ola, text }", () => {
    expect(fieldOf(hostView, "proposals")).toEqual([{ number: 1, nick: "Ola", text: KINO }]);
  });

  it("Kuba, a co-host, sees the same proposal as the host", () => {
    expect(fieldOf(kubaView, "proposals")).toEqual([{ number: 1, nick: "Ola", text: KINO }]);
  });

  // Decision 3: only a leader sees the author, and nobody else sees the text.
  it.each([
    { who: "Ola, its author", view: () => olaView },
    { who: "Bartek, a guest with no role", view: () => bartekView },
  ])("$who sees proposals: [] and the text nowhere in the state", ({ view }) => {
    expect(fieldOf(view(), "proposals")).toEqual([]);
    expect(JSON.stringify(view().data)).not.toContain(KINO);
  });

  it("Bartek, who proposed nothing, has 3 left and 0 waiting", () => {
    expect(fieldOf(bartekView, "own_proposals")).toEqual({ left: 3, waiting: 0 });
  });

  // Exact keys (test-plan §6.3): a key next to these could tell the author how a proposal was decided.
  it.each([
    { who: "the host", view: () => hostView },
    { who: "Kuba, a co-host", view: () => kubaView },
    { who: "Ola, a guest", view: () => olaView },
  ])("$who's state has exactly the lobby's keys and own_proposals exactly left and waiting", ({ view }) => {
    expect(keysOf(view().data)).toEqual(LOBBY_KEYS);
    expect(keysOf(fieldOf(view(), "own_proposals"))).toEqual(OWN_PROPOSALS_KEYS);
  });

  it("each proposal on the leaders' list is exactly number, nick and text", () => {
    expect(proposalsOf(hostView).map(keysOf)).toEqual([PROPOSAL_KEYS]);
  });

  // The form sent twice ----------------------------------------------------------------------------------------------

  it("Ola sending the same text again, with a ? at the end, gets exactly { ok: true } and uses up no proposal", () => {
    expect(olaAgain).toEqual(OK);
    expect(fieldOf(olaAfterAgain, "own_proposals")).toEqual({ left: 2, waiting: 1 });
    expect(numbersOf(hostAfterAgain)).toEqual([1]);
  });

  // The other doors --------------------------------------------------------------------------------------------------

  // Decision 4: every player, the host and the co-hosts included, proposes the same way.
  it.each([
    { who: "The host, by its session,", answer: () => hostProposes },
    { who: "Kuba, a co-host, by his token,", answer: () => kubaProposes },
  ])("$who proposes: exactly { ok: true }", ({ answer }) => {
    expect(answer()).toEqual(OK);
  });

  it("the list shows the three in the order of numbers, each with its author, the ?? taken off the host's", () => {
    expect(fieldOf(hostSeesThree, "proposals")).toEqual([
      { number: 1, nick: "Ola", text: KINO },
      { number: 2, nick: "Host", text: URODZINY },
      { number: 3, nick: "Kuba", text: WINDA },
    ]);
  });

  // The text ---------------------------------------------------------------------------------------------------------

  it.each([
    { what: "an empty text", answer: () => emptyText },
    { what: "only spaces", answer: () => onlySpaces },
    { what: "only question marks", answer: () => onlyQuestionMarks },
    { what: "no text at all", answer: () => noText },
    { what: "91 characters", answer: () => tooLong },
    { what: "401 characters as sent, 16 once normalized", answer: () => overTheCap },
  ])("a proposal with $what gets invalid_question_text", ({ answer }) => {
    expect(answer()).toMatchObject(refusal("invalid_question_text"));
  });

  it("the refused texts used up nothing: Ola still has 2 left and 1 waiting", () => {
    expect(fieldOf(olaAfterRefusedTexts, "own_proposals")).toEqual({ left: 2, waiting: 1 });
  });

  it("a text of exactly 90 characters goes through and stays whole", () => {
    expect(longestText).toEqual(OK);
    expect(proposalsOf(hostSeesLongest)[3]).toEqual({ number: 4, nick: "Ola", text: LONGEST });
  });

  // The limit --------------------------------------------------------------------------------------------------------

  it("Ola's third gets exactly { ok: true } and leaves her 0 left and 3 waiting", () => {
    expect(olaThird).toEqual(OK);
    expect(fieldOf(olaFull, "own_proposals")).toEqual({ left: 0, waiting: 3 });
  });

  it("Ola's fourth gets proposal_limit, and nothing joins the list", () => {
    expect(olaFourth).toMatchObject(refusal("proposal_limit"));
    expect(numbersOf(hostSeesLongest)).toEqual([1, 2, 3, 4, 5]);
  });

  // A rejection in the lobby ------------------------------------------------------------------------------------------

  // It does not touch the game's list, so it works before the start.
  it("Odrzuć in the lobby gets exactly { ok: true } and the text leaves the state", () => {
    expect(rejectInLobby).toEqual(OK);
    expect(numbersOf(hostAfterReject)).toEqual([1, 2, 3, 4]);
    expect(JSON.stringify(hostAfterReject.data)).not.toContain(PIZZA);
  });

  // Decision 4: a rejected one still counts. Decision 5: the author sees that one less waits, and nothing else.
  it("after the rejection Ola has 0 left and 2 waiting, and her state has the same keys as before", () => {
    expect(fieldOf(olaAfterReject, "own_proposals")).toEqual({ left: 0, waiting: 2 });
    expect(keysOf(olaAfterReject.data)).toEqual(LOBBY_KEYS);
  });

  it("Bartek's counts do not move with someone else's rejection", () => {
    expect(fieldOf(bartekAfterReject, "own_proposals")).toEqual({ left: 3, waiting: 0 });
  });

  // Only a text still waiting is the form sent twice.
  it("Ola sending her rejected text again gets proposal_limit", () => {
    expect(olaResendsRejected).toMatchObject(refusal("proposal_limit"));
  });

  it("Ola sending a text still waiting, with no proposal left, gets exactly { ok: true } and changes nothing", () => {
    expect(olaResendsWaiting).toEqual(OK);
    expect(fieldOf(olaAfterResends, "own_proposals")).toEqual({ left: 0, waiting: 2 });
  });

  // At once ----------------------------------------------------------------------------------------------------------

  // Which of the two gets through is the race's; only the lock on the room's row keeps the second out.
  it("two different texts at once with 1 left get exactly 1 × ok and 1 × proposal_limit", () => {
    expect(outcomesOf(bartekAtOnce)).toEqual(["ok", "proposal_limit"]);
    expect(fieldOf(bartekAfterAtOnce, "own_proposals")).toEqual({ left: 0, waiting: 3 });
  });

  it("one text twice at once with 1 left is the form sent twice: 2 × ok and one new proposal", () => {
    expect(outcomesOf(kubaAtOnce)).toEqual(["ok", "ok"]);
    expect(fieldOf(kubaAfterAtOnce, "own_proposals")).toEqual({ left: 0, waiting: 3 });
  });

  // Who may ----------------------------------------------------------------------------------------------------------

  it.each([
    { who: "Someone with no token", answer: () => noTokenProposes },
    { who: "Someone with a token of no player", answer: () => strangerProposes },
  ])("$who proposing gets room_unknown", ({ answer }) => {
    expect(answer()).toMatchObject(refusal("room_unknown"));
  });

  it.each([
    { fn: "approve_proposal", answer: () => bartekApproves },
    { fn: "reject_proposal", answer: () => bartekRejects },
  ])("Bartek, a guest with no role, calling $fn gets not_leader", ({ answer }) => {
    expect(answer()).toMatchObject(refusal("not_leader"));
  });

  it.each([
    { fn: "approve_proposal", answer: () => noTokenApproves },
    { fn: "reject_proposal", answer: () => noTokenRejects },
  ])("someone with no token calling $fn gets room_unknown", ({ answer }) => {
    expect(answer()).toMatchObject(refusal("room_unknown"));
  });

  // Not our client: an exception, as for a malformed token in a vote, with no row's values in details.
  it.each([
    { fn: "propose_question", answer: () => malformedProposes },
    { fn: "approve_proposal", answer: () => malformedApproves },
    { fn: "reject_proposal", answer: () => malformedRejects },
  ])("calling $fn with a malformed player token is refused with 22023", ({ answer }) => {
    expect(answer()).toMatchObject({ data: null, error: { code: "22023", details: null } });
  });

  // The lobby's trap --------------------------------------------------------------------------------------------------

  // Decision 1: approved only from the start of the game.
  it.each([
    { who: "the host", answer: () => hostApprovesInLobby },
    { who: "Kuba, a co-host", answer: () => kubaApprovesInLobby },
  ])("approving in the lobby as $who gets game_not_started", ({ answer }) => {
    expect(answer()).toMatchObject(refusal("game_not_started"));
  });

  it("after the refused approvals number 1 still waits, and the host's question_list stays null", () => {
    expect(proposalsOf(hostAfterRefusedApprove)[0]).toEqual({ number: 1, nick: "Ola", text: KINO });
    expect(hostAfterRefusedApprove).toMatchObject({ error: null, data: { status: "lobby", question_list: null } });
  });

  // No row on the list, so the start is the Worker's candidate, as in any game with no list.
  it("the game starts on the Worker's candidate, with the proposals still waiting and no list", () => {
    expect(roundOf(hostRound1)).toMatchObject({ number: 1, question_id: Q1, question_text: null, phase: "voting" });
    expect(numbersOf(hostRound1)).toEqual([1, 2, 3, 4, 6, 7, 8, 9, 10]);
    expect(fieldOf(hostRound1, "leader_draw")).toEqual({
      categories: SEED_CATEGORIES,
      adult_categories: [],
      list_entries: 0,
      list_base_count: 0,
    });
  });

  // The approval -----------------------------------------------------------------------------------------------------

  it("Kuba, a co-host with his token, approves number 1: exactly { ok: true }, and it leaves the leaders' list", () => {
    expect(kubaApproves).toEqual(OK);
    expect(numbersOf(hostAfterApprove)).toEqual([2, 3, 4, 6, 7, 8, 9, 10]);
    expect(numbersOf(kubaAfterApprove)).toEqual([2, 3, 4, 6, 7, 8, 9, 10]);
  });

  // Decision 4 and decision 5.
  it("after the approval Ola has one less waiting and no proposal back: 0 left and 1 waiting", () => {
    expect(fieldOf(olaAfterApprove, "own_proposals")).toEqual({ left: 0, waiting: 1 });
  });

  // The game now has a list of one row with no question id: list_entries counts it, list_base_count does not.
  it("in a game with no list, list_entries grows by 1 and list_base_count does not", () => {
    expect(fieldOf(hostAfterApprove, "leader_draw")).toEqual({
      categories: SEED_CATEGORIES,
      adult_categories: [],
      list_entries: 1,
      list_base_count: 0,
    });
  });

  it("the host's question_list holds the approved text alone, and a co-host's stays null", () => {
    expect(fieldOf(hostAfterApprove, "question_list")).toEqual({
      entries: [{ position: 1, question_id: null, text: KINO }],
      base_count: 0,
    });
    expect(fieldOf(kubaAfterApprove, "question_list")).toBeNull();
  });

  it("until its round opens, the approved text is nowhere in the state of a guest with no role", () => {
    expect(bartekAfterApprove.error).toBeNull();
    expect(JSON.stringify(bartekAfterApprove.data)).not.toContain(KINO);
  });

  // The queue --------------------------------------------------------------------------------------------------------

  // Decision 2. No question id, so a candidate could not have given it.
  it("round 2 is the approved question: no question_id, its text, and exactly the voting keys, so no author", () => {
    expect(nextToProposal).toEqual(OK);
    expect(roundOf(bartekRound2)).toMatchObject({
      number: 2,
      question_id: null,
      question_text: KINO,
      phase: "voting",
    });
    expect(keysOf(roundOf(bartekRound2))).toEqual(VOTING_ROUND_KEYS);
  });

  it("while it plays, the leaders' list does not show it again", () => {
    expect(numbersOf(hostRound2)).toEqual([2, 3, 4, 6, 7, 8, 9, 10]);
  });

  it("once it is played the candidates go on: round 3 is Q2, the first not played yet", () => {
    expect(nextPastProposal).toEqual(OK);
    expect(roundOf(hostRound3)).toMatchObject({ number: 3, question_id: Q2, question_text: null });
  });

  // The end ----------------------------------------------------------------------------------------------------------

  it("end_game with proposals waiting gets exactly { ok: true }, and the host sees no proposal", () => {
    expect(end).toEqual(OK);
    expect(hostAfterEnd).toMatchObject({ error: null, data: { status: "closed", proposals: [] } });
  });

  // FR-021: the approved question stays with the room for the game's creator; only its author went.
  it("the approved question stays on the closed room's list", () => {
    expect(fieldOf(hostAfterEnd, "question_list")).toEqual({
      entries: [{ position: 1, question_id: null, text: KINO }],
      base_count: 0,
    });
  });

  it.each([
    { fn: "propose_question", answer: () => proposeAfterEnd },
    { fn: "approve_proposal", answer: () => approveAfterEnd },
    { fn: "reject_proposal", answer: () => rejectAfterEnd },
  ])("$fn in the closed room gets room_closed", ({ answer }) => {
    expect(answer()).toMatchObject(refusal("room_closed"));
  });
});

// The queue with a list: an approved question plays ahead of the rest of the list, and the list then goes on where it
// stopped. The lobby's trap with a list too: a proposal sent before "Przejrzyj pytania" does not stop the 15 questions
// from being drawn.
describe("a game with a list: Host, Ewa and Zosia", () => {
  let room: OwnRoom;
  let ewa: SeededGuest;
  let zosia: SeededGuest;
  // Strangers from the first room.
  let guestOfAnotherRoom: Answer;
  let cohostOfAnotherRoomApproves: Answer;
  let cohostOfAnotherRoomRejects: Answer;
  // Before the list.
  let approveBeforeList: Answer;
  let hostBeforeList: Answer;
  let openList: Answer;
  let hostWithList: Answer;
  let start: Answer;
  let hostRound1: Answer;
  // Round after round.
  let approveFirst: Answer;
  let hostAfterApprove: Answer;
  let zosiaRound2: Answer;
  let ewaRound3: Answer;
  let approveThird: Answer;
  let approveSecond: Answer;
  let zosiaRound4: Answer;
  let skipRound4: Answer;
  let ewaRound5: Answer;
  let hostRound6: Answer;

  beforeAll(async () => {
    room = await seedRoom(host, { confirmClose: true });
    ewa = await seedGuest(room.linkToken, "Ewa");
    zosia = await seedGuest(room.linkToken, "Zosia");

    // Numbers 1 to 3, in the lobby, before anyone opens the list.
    seed(await proposeQuestion(anon, room.id, KINO, ewa.playerToken), "Ewa's proposal");
    seed(await proposeQuestion(anon, room.id, PIZZA, zosia.playerToken), "Zosia's first proposal");
    seed(await proposeQuestion(anon, room.id, KLUCZE, zosia.playerToken), "Zosia's second proposal");

    guestOfAnotherRoom = await proposeQuestion(anon, room.id, KAWA, firstRoomGuestToken);
    cohostOfAnotherRoomApproves = await approveProposal(anon, room.id, 1, firstRoomCohostToken);
    cohostOfAnotherRoomRejects = await rejectProposal(anon, room.id, 1, firstRoomCohostToken);

    approveBeforeList = await approveProposal(host.client, room.id, 1);
    hostBeforeList = await roomLobby(host.client, room.id);
    openList = await openQuestionList(host.client, room.id, [...LIST_CANDIDATES]);
    hostWithList = await roomLobby(host.client, room.id);

    // With a list, round 1 is its first entry, whatever the candidate.
    start = await startGame(host.client, room.id, Q20);
    hostRound1 = await roomLobby(host.client, room.id);

    // Round 1 is voting: number 1 is approved, and it plays next.
    approveFirst = await approveProposal(host.client, room.id, 1);
    hostAfterApprove = await roomLobby(host.client, room.id);
    await seedReveal(host, room.id, 1);
    seed(await nextRound(host.client, room.id, 1, [Q20]), "the next question after round 1");
    zosiaRound2 = await roomLobby(anon, room.id, zosia.playerToken);

    // The list goes on where it stopped.
    await seedReveal(host, room.id, 2);
    seed(await nextRound(host.client, room.id, 2, [Q20]), "the next question after round 2");
    ewaRound3 = await roomLobby(anon, room.id, ewa.playerToken);

    // Round 3 is voting: number 3 is approved before number 2, so it plays first.
    approveThird = await approveProposal(host.client, room.id, 3);
    approveSecond = await approveProposal(host.client, room.id, 2);
    await seedReveal(host, room.id, 3);
    seed(await nextRound(host.client, room.id, 3, [Q20]), "the next question after round 3");
    zosiaRound4 = await roomLobby(anon, room.id, zosia.playerToken);

    // "Pomiń pytanie" opens the next approved one too, and after it the list goes on.
    skipRound4 = await skipRound(host.client, room.id, 4, [Q20]);
    ewaRound5 = await roomLobby(anon, room.id, ewa.playerToken);
    await seedReveal(host, room.id, 5);
    seed(await nextRound(host.client, room.id, 5, [Q20]), "the next question after round 5");
    hostRound6 = await roomLobby(host.client, room.id);

    seed(await endGame(host.client, room.id), "end_game");
  });

  // Tokens that are real, in a room that is not this one.
  it("a guest of another room proposing here with her token gets room_unknown", () => {
    expect(guestOfAnotherRoom).toMatchObject(refusal("room_unknown"));
  });

  it.each([
    { fn: "approve_proposal", answer: () => cohostOfAnotherRoomApproves },
    { fn: "reject_proposal", answer: () => cohostOfAnotherRoomRejects },
  ])("a co-host of another room calling $fn here with his token gets room_unknown", ({ answer }) => {
    expect(answer()).toMatchObject(refusal("room_unknown"));
  });

  it("approving before the list is open gets game_not_started, and question_list stays null", () => {
    expect(approveBeforeList).toMatchObject(refusal("game_not_started"));
    expect(hostBeforeList).toMatchObject({ error: null, data: { status: "lobby", question_list: null } });
  });

  // Karol's decision 1 keeps this: a row of a proposal on the list would make open_question_list draw nothing.
  it("Przejrzyj pytania still draws the 15 questions, with no proposal among them", () => {
    expect(openList).toEqual(OK);
    expect(hostWithList).toMatchObject({ error: null, data: { question_list: { entries: OPENED, base_count: 15 } } });
    expect(numbersOf(hostWithList)).toEqual([1, 2, 3]);
  });

  it("round 1 is the list's first entry, not a proposal", () => {
    expect(start).toEqual(OK);
    expect(roundOf(hostRound1)).toMatchObject({ number: 1, question_id: Q1, question_text: null });
  });

  it("the approved question joins the list at position 16, with no question id", () => {
    expect(approveFirst).toEqual(OK);
    expect(hostAfterApprove).toMatchObject({
      error: null,
      data: {
        question_list: { entries: [...OPENED, { position: 16, question_id: null, text: KINO }], base_count: 15 },
      },
    });
    expect(fieldOf(hostAfterApprove, "leader_draw")).toMatchObject({ list_entries: 16, list_base_count: 15 });
  });

  // Decision 2: ahead of the 14 entries still to play.
  it("round 2 is the approved question, not the list's second entry", () => {
    expect(roundOf(zosiaRound2)).toMatchObject({ number: 2, question_id: null, question_text: KINO });
  });

  it("round 3 goes back to the list's second entry", () => {
    expect(roundOf(ewaRound3)).toMatchObject({ number: 3, question_id: Q2, question_text: null });
  });

  it("number 3 and number 2, approved in that order, each get exactly { ok: true }", () => {
    expect(approveThird).toEqual(OK);
    expect(approveSecond).toEqual(OK);
  });

  it("two approved questions play in the order of approval: round 4 is the one approved first", () => {
    expect(roundOf(zosiaRound4)).toMatchObject({ number: 4, question_id: null, question_text: KLUCZE });
  });

  it("Pomiń pytanie opens the next approved question too", () => {
    expect(skipRound4).toEqual(OK);
    expect(roundOf(ewaRound5)).toMatchObject({
      number: 5,
      question_id: null,
      question_text: PIZZA,
      after_skip: true,
    });
  });

  it("with no approved question left, round 6 is the list's third entry", () => {
    expect(roundOf(hostRound6)).toMatchObject({ number: 6, question_id: "na-co-dzien-003", question_text: null });
  });
});

// Decision 2 at the end of the questions: a proposal approved when nothing is left brings "Następne pytanie" back, after
// a reveal and after a skip that stayed the latest round. The candidates are empty, as they are once the pool is played.
describe("the end of the questions: Host, Ola and Bartek, a co-host", () => {
  let room: OwnRoom;
  let ola: SeededGuest;
  let bartek: SeededGuest;
  let proposeWhileVoting: Answer;
  let nextWithNothing: Answer;
  let hostStillRound1: Answer;
  let olaBeforeApprove: Answer;
  let bartekApproves: Answer;
  let hostAfterApprove: Answer;
  let olaAfterApprove: Answer;
  let nextAfterApprove: Answer;
  let olaRound2: Answer;
  let skipLast: Answer;
  let hostSkipped: Answer;
  let nextAfterSkip: Answer;
  let proposeOnSkipped: Answer;
  let approveAfterSkip: Answer;
  let hostAfterSecond: Answer;
  let olaAfterSecond: Answer;
  let nextAfterSecond: Answer;
  let olaRound3: Answer;

  beforeAll(async () => {
    room = await seedRoom(host, { confirmClose: true });
    ola = await seedGuest(room.linkToken, "Ola");
    bartek = await seedGuest(room.linkToken, "Bartek");
    seed(await setCohost(host.client, room.id, "Bartek", true), "the co-host role for Bartek");
    await seedStartGame(host, room.id, Q1);

    // A proposal waiting is no question yet: nothing is left to open until a leader approves it.
    proposeWhileVoting = await proposeQuestion(anon, room.id, KINO, ola.playerToken);
    await seedReveal(host, room.id, 1);
    nextWithNothing = await nextRound(host.client, room.id, 1, []);
    hostStillRound1 = await roomLobby(host.client, room.id);

    olaBeforeApprove = await roomLobby(anon, room.id, ola.playerToken);
    bartekApproves = await approveProposal(anon, room.id, 1, bartek.playerToken);
    hostAfterApprove = await roomLobby(host.client, room.id);
    olaAfterApprove = await roomLobby(anon, room.id, ola.playerToken);
    nextAfterApprove = await nextRound(host.client, room.id, 1, []);
    olaRound2 = await roomLobby(anon, room.id, ola.playerToken);

    // Nothing to open after round 2, so the skipped round stays the latest one.
    skipLast = await skipRound(host.client, room.id, 2, []);
    hostSkipped = await roomLobby(host.client, room.id);
    nextAfterSkip = await nextRound(host.client, room.id, 2, []);

    proposeOnSkipped = await proposeQuestion(anon, room.id, PIZZA, ola.playerToken);
    approveAfterSkip = await approveProposal(host.client, room.id, 2);
    hostAfterSecond = await roomLobby(host.client, room.id);
    olaAfterSecond = await roomLobby(anon, room.id, ola.playerToken);
    nextAfterSecond = await nextRound(host.client, room.id, 2, []);
    olaRound3 = await roomLobby(anon, room.id, ola.playerToken);

    seed(await endGame(host.client, room.id), "end_game");
  });

  it.each([
    { when: "while a round votes", answer: () => proposeWhileVoting },
    { when: "on a skipped round", answer: () => proposeOnSkipped },
  ])("Ola proposing during the game, $when, gets exactly { ok: true }", ({ answer }) => {
    expect(answer()).toEqual(OK);
  });

  it("with no candidate left, Następne pytanie gets no_questions and round 1 stays the latest", () => {
    expect(nextWithNothing).toMatchObject(refusal("no_questions"));
    expect(roundOf(hostStillRound1)).toMatchObject({ number: 1, phase: "revealed" });
  });

  it("Bartek, a co-host with his token, approves: exactly { ok: true }, and the leaders' list is empty", () => {
    expect(bartekApproves).toEqual(OK);
    expect(fieldOf(hostAfterApprove, "proposals")).toEqual([]);
  });

  // Decision 4 and decision 5.
  it("the approval takes Ola's waiting from 1 to 0 and leaves her left at 2", () => {
    expect(fieldOf(olaBeforeApprove, "own_proposals")).toEqual({ left: 2, waiting: 1 });
    expect(fieldOf(olaAfterApprove, "own_proposals")).toEqual({ left: 2, waiting: 0 });
  });

  it("after the approval Następne pytanie gets exactly { ok: true } and round 2 is the approved question", () => {
    expect(nextAfterApprove).toEqual(OK);
    expect(roundOf(olaRound2)).toMatchObject({ number: 2, question_id: null, question_text: KINO, phase: "voting" });
  });

  it("a skip with nothing to open gets exactly { ok: true } and stays the latest round", () => {
    expect(skipLast).toEqual(OK);
    expect(roundOf(hostSkipped)).toEqual({ number: 2, phase: "skipped" });
  });

  it("after the last skip Następne pytanie gets no_questions", () => {
    expect(nextAfterSkip).toMatchObject(refusal("no_questions"));
  });

  it("the last proposal approved leaves the leaders' list empty, and Ola 1 left and 0 waiting", () => {
    expect(approveAfterSkip).toEqual(OK);
    expect(fieldOf(hostAfterSecond, "proposals")).toEqual([]);
    expect(fieldOf(olaAfterSecond, "own_proposals")).toEqual({ left: 1, waiting: 0 });
  });

  it("after the approval Następne pytanie goes on from the skipped round, to the approved question", () => {
    expect(nextAfterSecond).toEqual(OK);
    expect(roundOf(olaRound3)).toMatchObject({
      number: 3,
      question_id: null,
      question_text: PIZZA,
      phase: "voting",
      after_skip: true,
    });
  });
});

// The moves that race or come twice, and what goes with a player: a co-host and the host answering at once, a decision
// made already, a place moved to another device and a removed author.
describe("the edges: Host, Ola, Bartek, Zosia and Kuba, a co-host", () => {
  let room: OwnRoom;
  let ola: SeededGuest;
  let bartek: SeededGuest;
  let zosia: SeededGuest;
  let kuba: SeededGuest;
  const ula = newPlayerToken();
  const zosiaNew = newPlayerToken();
  // Decided already.
  let atOnce: Answer[];
  let hostAfterAtOnce: Answer;
  let approveAgain: Answer;
  let rejectApproved: Answer;
  let rejectBartek: Answer;
  let approveRejected: Answer;
  let rejectAgain: Answer;
  let approveNoSuch: Answer;
  let rejectNoSuch: Answer;
  // A latecomer.
  let latecomerProposes: Answer;
  // A place moved.
  let zosiaBefore: Answer;
  let zosiaAfterMove: Answer;
  let zosiaOldProposes: Answer;
  let hostAfterMove: Answer;
  // A removed author.
  let hostBeforeRemoval: Answer;
  let removeOla: Answer;
  let hostAfterRemoval: Answer;
  let bartekAfterRemoval: Answer;
  let proposeOnReveal: Answer;
  let hostRound2: Answer;

  beforeAll(async () => {
    room = await seedRoom(host, { confirmClose: true });
    ola = await seedGuest(room.linkToken, "Ola");
    bartek = await seedGuest(room.linkToken, "Bartek");
    zosia = await seedGuest(room.linkToken, "Zosia");
    kuba = await seedGuest(room.linkToken, "Kuba");
    seed(await setCohost(host.client, room.id, "Kuba", true), "the co-host role for Kuba");
    await seedStartGame(host, room.id, Q1);

    // Numbers 1 to 5.
    seed(await proposeQuestion(anon, room.id, KINO, ola.playerToken), "Ola's first proposal");
    seed(await proposeQuestion(anon, room.id, PIZZA, ola.playerToken), "Ola's second proposal");
    seed(await proposeQuestion(anon, room.id, KLUCZE, bartek.playerToken), "Bartek's first proposal");
    seed(await proposeQuestion(anon, room.id, KAPCIE, zosia.playerToken), "Zosia's proposal");
    seed(await proposeQuestion(anon, room.id, KAWA, bartek.playerToken), "Bartek's second proposal");

    // The host and Kuba approve number 1 at the same moment.
    atOnce = await Promise.all([
      approveProposal(host.client, room.id, 1),
      approveProposal(anon, room.id, 1, kuba.playerToken),
    ]);
    hostAfterAtOnce = await roomLobby(host.client, room.id);

    // A decision made already, either way, and a number nobody has.
    approveAgain = await approveProposal(host.client, room.id, 1);
    rejectApproved = await rejectProposal(host.client, room.id, 1);
    rejectBartek = await rejectProposal(anon, room.id, 3, kuba.playerToken);
    approveRejected = await approveProposal(host.client, room.id, 3);
    rejectAgain = await rejectProposal(host.client, room.id, 3);
    approveNoSuch = await approveProposal(host.client, room.id, 99);
    rejectNoSuch = await rejectProposal(host.client, room.id, 99);

    // A latecomer still waiting is no player yet.
    seed(await requestJoin(room.linkToken, "Ula", ula), "Ula's request");
    latecomerProposes = await proposeQuestion(anon, room.id, PARASOL, ula);

    // Zosia, 1 sent and 1 waiting, comes back on a new browser (S-04): the same place, so the same limit.
    zosiaBefore = await roomLobby(anon, room.id, zosia.playerToken);
    seed(await requestReturn(room.linkToken, "Zosia", zosiaNew), "Zosia's request to come back");
    seed(await admitLatecomer(host.client, room.id, "Zosia"), "Wpuść for Zosia");
    zosiaAfterMove = await roomLobby(anon, room.id, zosiaNew);
    zosiaOldProposes = await proposeQuestion(anon, room.id, PARASOL, zosia.playerToken);
    hostAfterMove = await roomLobby(host.client, room.id);

    // Ola's number 1 is on the list and her number 2 waits; the host removes her.
    hostBeforeRemoval = await roomLobby(host.client, room.id);
    removeOla = await removePlayer(host.client, room.id, "Ola");
    hostAfterRemoval = await roomLobby(host.client, room.id);
    bartekAfterRemoval = await roomLobby(anon, room.id, bartek.playerToken);
    await seedReveal(host, room.id, 1);
    proposeOnReveal = await proposeQuestion(anon, room.id, PARASOL, bartek.playerToken);
    seed(await nextRound(host.client, room.id, 1, [Q2]), "the next question after round 1");
    hostRound2 = await roomLobby(host.client, room.id);

    seed(await endGame(host.client, room.id), "end_game");
  });

  // Which leader gets through is the race's; only the lock on the room's row keeps the second out.
  it("two leaders approving one proposal at once get exactly 1 × ok and 1 × proposal_unknown", () => {
    expect(outcomesOf(atOnce)).toEqual(["ok", "proposal_unknown"]);
  });

  it("after them the list has one row, not two", () => {
    expect(fieldOf(hostAfterAtOnce, "question_list")).toEqual({
      entries: [{ position: 1, question_id: null, text: KINO }],
      base_count: 0,
    });
  });

  it.each([
    { move: "approving an approved proposal", answer: () => approveAgain },
    { move: "rejecting an approved proposal", answer: () => rejectApproved },
    { move: "approving a rejected proposal", answer: () => approveRejected },
    { move: "rejecting a rejected proposal", answer: () => rejectAgain },
    { move: "approving a number nobody has", answer: () => approveNoSuch },
    { move: "rejecting a number nobody has", answer: () => rejectNoSuch },
  ])("$move gets proposal_unknown", ({ answer }) => {
    expect(answer()).toMatchObject(refusal("proposal_unknown"));
  });

  it("Kuba, a co-host with his token, rejects: exactly { ok: true }", () => {
    expect(rejectBartek).toEqual(OK);
  });

  it("a latecomer still waiting, with the token of the request, proposing gets room_unknown", () => {
    expect(latecomerProposes).toMatchObject(refusal("room_unknown"));
  });

  // S-04: the place moves a token and keeps the player's id, so the limit does not start over.
  it("after coming back on a new browser Zosia has the same counts: 2 left and 1 waiting", () => {
    expect(fieldOf(zosiaBefore, "own_proposals")).toEqual({ left: 2, waiting: 1 });
    expect(fieldOf(zosiaAfterMove, "own_proposals")).toEqual({ left: 2, waiting: 1 });
  });

  it("her waiting proposal stays hers on the leaders' list", () => {
    expect(fieldOf(hostAfterMove, "proposals")).toEqual([
      { number: 2, nick: "Ola", text: PIZZA },
      { number: 4, nick: "Zosia", text: KAPCIE },
      { number: 5, nick: "Bartek", text: KAWA },
    ]);
  });

  it("her old token proposing gets room_unknown", () => {
    expect(zosiaOldProposes).toMatchObject(refusal("room_unknown"));
  });

  it("removing Ola gets exactly { ok: true }: her waiting proposal goes, and the others' stay", () => {
    expect(numbersOf(hostBeforeRemoval)).toEqual([2, 4, 5]);
    expect(removeOla).toEqual(OK);
    expect(fieldOf(hostAfterRemoval, "proposals")).toEqual([
      { number: 4, nick: "Zosia", text: KAPCIE },
      { number: 5, nick: "Bartek", text: KAWA },
    ]);
  });

  it("the counts of the others do not move: Bartek still has 1 left and 1 waiting", () => {
    expect(fieldOf(bartekAfterRemoval, "own_proposals")).toEqual({ left: 1, waiting: 1 });
  });

  it("Bartek proposing on a reveal gets exactly { ok: true }", () => {
    expect(proposeOnReveal).toEqual(OK);
  });

  // Her approved question has no author, so it stays and plays.
  it("the question approved from her proposal stays on the list and plays in round 2", () => {
    expect(fieldOf(hostAfterRemoval, "leader_draw")).toMatchObject({ list_entries: 1, list_base_count: 0 });
    expect(roundOf(hostRound2)).toMatchObject({ number: 2, question_id: null, question_text: KINO });
  });
});
