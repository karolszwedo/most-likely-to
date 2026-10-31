// Smoke test: proves the built app, the Cloudflare adapter and the Supabase auth flow still work together.
// Zero dependencies on purpose. Run against a live server: BASE_URL=http://localhost:4321 npm run smoke
// Signs in with the fixed test account SMOKE_EMAIL / SMOKE_PASSWORD (npm run smoke reads them from .dev.vars,
// environment variables win) and creates no accounts: the project has "Confirm email" on. The room steps open rooms on
// that account and join them as guests; rooms and guests stay in the database (S-13 cleans up).
// SMOKE_OAUTH=1 also follows Supabase one hop on to discord.com and accounts.google.com. That needs both providers
// enabled in the Supabase project, so CI (local Supabase, no providers) runs without it.
// SMOKE_GAME=0 skips the evening's steps (S-03: the next question, a late vote, a skip, the end) and prints them as
// skipped: for production while it still runs a Worker without them, between `npx supabase db push` and the merge
// (context/archive/2026-10-15-full-game-evening/plan.md, Faza 6). SMOKE_ROUND=0 skips the round's steps and the
// evening's after them, as S-02 needed it (context/archive/2026-10-13-first-live-round/plan.md, Faza 6).
// SMOKE_LIST=0 skips the host's review of the game's question list (S-06: "Przejrzyj pytania" and the moves on the list,
// in the room "Nowa gra" opens at the end) and prints them as skipped: for production while it still runs a Worker
// without the list's routes, between `npx supabase db push` and the merge
// (context/archive/2026-10-24-question-list-review/plan.md, Faza 2 #8). The game itself always plays with no list, so
// "Zacznij grę" with no review is checked on every run.

const missing = ["SMOKE_EMAIL", "SMOKE_PASSWORD"].filter((name) => !process.env[name]);
if (missing.length > 0) {
  console.error(`Missing ${missing.join(", ")}: add the test account to .dev.vars (AGENTS.md, Testing)`);
  process.exit(1);
}

const BASE_URL = process.env.BASE_URL ?? "http://localhost:4321";
const email = process.env.SMOKE_EMAIL;
const password = process.env.SMOKE_PASSWORD;
const OAUTH = process.env.SMOKE_OAUTH === "1";
const ROUND = process.env.SMOKE_ROUND !== "0";
// The evening goes on from the round's reveal, so it needs the round's steps.
const GAME = ROUND && process.env.SMOKE_GAME !== "0";
// The list's steps need no round: they run in a room of their own, still in the lobby.
const LIST = process.env.SMOKE_LIST !== "0";
const jar = new Map();

function cookieHeader(cookies = jar) {
  return [...cookies.entries()].map(([k, v]) => `${k}=${v}`).join("; ");
}

// Returns the names this response set (not the ones it cleared), so a step checks its own cookies and not what an
// earlier step left in the jar, and which of them are HttpOnly.
function storeCookies(response, cookies = jar) {
  const set = [];
  const httpOnly = [];
  for (const raw of response.headers.getSetCookie()) {
    const [pair, ...attrs] = raw.split(";");
    const [name, ...rest] = pair.split("=");
    const expired = attrs.some((a) => /max-age=0/i.test(a.trim()));
    if (expired) cookies.delete(name.trim());
    else {
      cookies.set(name.trim(), rest.join("="));
      set.push(name.trim());
      if (attrs.some((a) => a.trim().toLowerCase() === "httponly")) httpOnly.push(name.trim());
    }
  }
  return { set, httpOnly };
}

// `cookies`: a jar of its own (one per player in the room steps). `form`: an object, or [name, value] pairs for repeated
// fields. `json`: a value sent as a JSON body, as the room screen sends the round's actions (their routes want this
// Content-Type and the app's Origin, src/lib/rooms/json-route.ts). `readBody`: also return the response text.
async function request(path, { method = "GET", form, json, cookies = jar, readBody = false } = {}) {
  let contentType;
  let body;
  if (form) {
    contentType = "application/x-www-form-urlencoded";
    body = new URLSearchParams(form).toString();
  } else if (json !== undefined) {
    contentType = "application/json";
    body = JSON.stringify(json);
  }
  const response = await fetch(BASE_URL + path, {
    method,
    redirect: "manual",
    headers: {
      Cookie: cookieHeader(cookies),
      Origin: BASE_URL,
      ...(contentType ? { "Content-Type": contentType } : {}),
    },
    body,
  });
  const { set, httpOnly } = storeCookies(response, cookies);
  const result = { status: response.status, location: response.headers.get("location") ?? "", cookies: set, httpOnly };
  return readBody ? { ...result, body: await response.text() } : result;
}

// Supabase authorize URL from each OAuth start step, for the SMOKE_OAUTH steps that follow it.
const authorizeUrls = new Map();

async function startOAuth(provider) {
  const result = await request("/api/auth/oauth", { method: "POST", form: { provider } });
  authorizeUrls.set(provider, result.location);
  return result;
}

// One hop on from Supabase, without the app's cookies or Origin. Supabase answers 302 to the provider only when the
// provider is enabled with a client id; a disabled one gives 400. A wrong id, secret or redirect at the provider
// still passes here: only a real sign-in catches those.
async function followToProvider(provider) {
  const url = authorizeUrls.get(provider) ?? "";
  if (!url.startsWith("http")) {
    return { status: 0, location: "(no Supabase URL from the start step)", cookies: [], httpOnly: [] };
  }
  const response = await fetch(url, { redirect: "manual" });
  return { status: response.status, location: response.headers.get("location") ?? "", cookies: [], httpOnly: [] };
}

const steps = [
  ["home renders", () => request("/"), { status: 200 }],
  ["dashboard redirects anonymous user", () => request("/dashboard"), { status: 302, location: "/auth/signin" }],
  // Sign-up is gone; old links to it must land on the sign-in page, not on a 404.
  ["signup redirects to signin", () => request("/auth/signup"), { status: 302, exact: "/auth/signin" }],
  [
    "signin rejects wrong password",
    () => request("/api/auth/signin", { method: "POST", form: { email, password: "wrong" } }),
    { status: 302, location: "/auth/signin?error=" },
  ],
  [
    "signin accepts correct password",
    () => request("/api/auth/signin", { method: "POST", form: { email, password } }),
    // Only the server reads the session cookie, so scripts must not see it (src/lib/supabase.ts).
    { status: 302, exact: "/", httpOnly: "-auth-token" },
  ],
  ["dashboard renders for signed-in user", () => request("/dashboard"), { status: 200 }],
  ["signout clears session", () => request("/api/auth/signout", { method: "POST" }), { status: 302, exact: "/" }],
  ["dashboard redirects after signout", () => request("/dashboard"), { status: 302, location: "/auth/signin" }],
  // OAuth steps run signed out, after the password steps, so they cannot disturb them. auth-js also writes per-flow
  // verifier cookies, but the callback (exchangeCodeForSession without a flow id) reads only the fixed
  // <storageKey>-code-verifier, so that is the one to check: if a library update stops writing it, sign-in breaks.
  [
    "oauth start sends discord to Supabase",
    () => startOAuth("discord"),
    {
      status: 302,
      contains: ["/auth/v1/authorize?provider=discord"],
      cookie: "-auth-token-code-verifier",
      httpOnly: "-auth-token",
    },
  ],
  [
    "oauth start sends google to Supabase",
    () => startOAuth("google"),
    {
      status: 302,
      contains: ["/auth/v1/authorize?provider=google", "prompt=select_account"],
      cookie: "-auth-token-code-verifier",
      httpOnly: "-auth-token",
    },
  ],
  [
    "oauth start rejects unknown provider",
    () => request("/api/auth/oauth", { method: "POST", form: { provider: "github" } }),
    { status: 302, location: "/auth/signin?error=unsupported_provider" },
  ],
  [
    "callback without code",
    () => request("/api/auth/callback"),
    { status: 302, location: "/auth/signin?error=bad_oauth_callback" },
  ],
  [
    "callback passes on cancelled consent",
    () => request("/api/auth/callback?error=access_denied"),
    { status: 302, location: "/auth/signin?error=access_denied" },
  ],
  [
    "callback turns free text into unknown",
    () => request(`/api/auth/callback?error=${encodeURIComponent("<b>not a code</b>")}`),
    { status: 302, exact: "/auth/signin?error=unknown" },
  ],
  ...(OAUTH
    ? [
        [
          "Supabase sends discord on to discord.com",
          () => followToProvider("discord"),
          { status: 302, location: "https://discord.com/" },
        ],
        [
          "Supabase sends google on to accounts.google.com",
          () => followToProvider("google"),
          { status: 302, location: "https://accounts.google.com/" },
        ],
      ]
    : []),
];

// S-01 rooms (context/archive/2026-10-07-room-lobby/plan.md), on a jar of their own: the host signs in again and opens a room.
// confirm_close=1, so guests left in the open room by an interrupted earlier run cannot block "Nowa gra".
const hostJar = new Map();
// Same ids as CATEGORIES in src/data/questions.ts.
const CATEGORY_IDS = [
  "na-co-dzien",
  "imprezy",
  "przyszlosc",
  "wpadki-i-obciach",
  "gry-i-internet",
  "podroze-i-przygody",
  "sport-i-wyzwania",
  "praca-i-szkola",
];
const HOME = /^\/$/;
const ROOM_PATH = /^\/r\/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$/;
const LINK_IN_PAGE = /\/j\/([A-Za-z0-9_-]{22})(?![A-Za-z0-9_-])/;
// A link code in a location (/j/<code>?error=…) is printed masked.
const LINK_IN_LOCATION = /\/j\/[A-Za-z0-9_-]{22}/g;
const mask = (location) => location.replace(LINK_IN_LOCATION, "/j/<code>");
const NICK_TAKEN = /^\/j\/[A-Za-z0-9_-]{22}\?error=nick_taken$/;
// Filled in as the steps run. Never printed: the link code opens the room. listRoom: the room "Nowa gra" opens at the
// end, where the host reviews the game's question list (S-06).
const room = { id: "", link: "" };
const listRoom = { id: "", link: "" };
// Ola's jar: she votes, makes a leader's move as a co-host (S-07) and checks the lobby again after the game is over.
// The second guest ("ola") keeps a jar too, to vote, and to send the vote that comes late. So do the two latecomers of
// the round (S-08), whose requests the steps follow: Kuba, let in, and Ula, turned away, and Ela, the guest of the
// list's room, whose view of it the steps check. Every other guest gets a fresh jar.
const olaJar = new Map();
const secondGuestJar = new Map();
const kubaJar = new Map();
const ulaJar = new Map();
const elaJar = new Map();

function newRoom({ confirmClose }) {
  const form = [["nick", "Smoke host"], ...CATEGORY_IDS.map((id) => ["category", id])];
  if (confirmClose) form.push(["confirm_close", "1"]);
  return request("/api/rooms", { method: "POST", form, cookies: hostJar });
}

// link: the room's link code, the main room's unless given.
function join(nick, cookies, link = room.link) {
  return request("/api/rooms/join", { method: "POST", form: { link, nick }, cookies });
}

function lobby(roomId, cookies) {
  return request(`/api/rooms/${roomId}/lobby`, { cookies, readBody: true });
}

// A latecomer's own request, by the room's cookie in their jar (GET /api/rooms/<id>/request, the waiting screen's look).
function requestState(cookies) {
  return request(`/api/rooms/${room.id}/request`, { cookies, readBody: true });
}

// That answer, its whole text: the state, and the nick while the request waits or after "Odrzuć"; never the question,
// the players or anyone else's request. Either order of the two keys.
function requestAnswer(state, nick) {
  const parts = [`"state":"${state}"`];
  if (nick !== undefined) parts.push(`"nick":"${nick}"`);
  const orders = parts.length === 1 ? [parts] : [parts, [...parts].reverse()];
  return new RegExp(`^\\{(?:${orders.map((order) => order.join(",")).join("|")})\\}$`);
}

// Discord's preview, or a guest opening the link again. One fresh jar for all three, so a later open sends back
// whatever an earlier one set; the cookies of every response count. Status and Location of the first response that is
// not 200, if any.
async function openLinkThreeTimes() {
  const cookies = new Map();
  const results = [];
  for (let i = 0; i < 3; i++) results.push(await request(`/j/${room.link}`, { cookies }));
  const shown = results.find((result) => result.status !== 200) ?? results[0];
  return { ...shown, cookies: results.flatMap((r) => r.cookies), httpOnly: results.flatMap((r) => r.httpOnly) };
}

// Exactly one player object in the lobby's list, whatever the key order inside it. Nicks hold no braces here.
const ONLY_ONE_PLAYER = /"players":\[\{[^{}]*\}\]/;

// The room's own page; a function, because the id is known only once the room exists.
const thisRoom = () => ({ status: 302, location: new RegExp(`^/r/${room.id}$`) });

// A game's action (src/pages/api/rooms/[id]/start.ts, vote.ts, reveal.ts, next.ts, skip.ts, end.ts, admit.ts,
// reject.ts, cohost.ts, question-*.ts, emote.ts, color.ts), as JSON, the way the room screen sends it; in the main room
// unless roomId is given.
function act(action, body, cookies, roomId = room.id) {
  return request(`/api/rooms/${roomId}/${action}`, { method: "POST", json: body, cookies, readBody: true });
}

// An accepted action answers exactly this: a vote's answer carries no target and no count.
const ACCEPTED = /^\{"ok":true\}$/;
// Back to the link's own page, with no error: after a latecomer's request it shows the waiting screen.
const LINK_PAGE = /^\/j\/[A-Za-z0-9_-]{22}$/;
// The reveal the votes below make, every player in seat order: Smoke host 0, Ola 1, ola 1; one abstention, three
// ballots. Each part is checked on its own, so the order of the round's keys does not matter.
const REVEALED = new RegExp(
  [
    '"phase":"revealed"',
    '"results":\\[\\{"nick":"Smoke host","votes":0\\},\\{"nick":"Ola","votes":1\\},\\{"nick":"ola","votes":1\\}\\]',
    '"abstained":1[,}]',
    '"ballots":3[,}]',
  ]
    .map((part) => `(?=.*${part})`)
    .join(""),
);

// A skipped step keeps only its name and says which switch skipped it.
function skippedBy(steps, reason) {
  return steps.map(([name]) => [name, null, reason]);
}

// Ola's row in the room's state with the colour she picked (S-18), 7: one player object, whatever the key order inside
// it. Nicks hold no braces here.
const OLA_PICKED_COLOR = /\{(?=[^{}]*"nick":"Ola")(?=[^{}]*"color":7[,}])[^{}]*\}/;

// Question 1 as the room's state shows it to Kuba, let in while it was voting: he is a player ("me"), the round is still
// voting, and those who may vote in it are the three who were in the room when it opened, in seat order, without him.
// Each part is checked on its own, as in REVEALED.
const LATECOMER_ROUND = new RegExp(
  ['"me":"Kuba"', '"phase":"voting"', '"eligible":\\["Smoke host","Ola","ola"\\]']
    .map((part) => `(?=.*${part})`)
    .join(""),
);

// S-02's round (context/archive/2026-10-13-first-live-round/plan.md, Faza 5) in the room of the steps around it: the
// host, Ola and the second guest. The votes: Ola for herself, the second guest abstains, and the host, last, for "ola"
// (not Ola: case counts); the last vote reveals the round by itself. Every vote carries question 1's number, as the
// room screen sends it; a vote or a reveal without one is refused before the database (F2 of
// context/archive/2026-10-20-deferred-review-fixes/plan.md). The targets live only in the request bodies: no step's
// name and nothing the script prints says who voted for whom. Two latecomers come during question 1 (S-08,
// context/archive/2026-10-22-latecomer-admission/plan.md, Faza 2 #10 and Faza 3 #5): the form answers 303 back to
// the link, whose page shows the waiting screen, and sets the room's cookie with the request's token. The host lets
// Kuba in: he is a player from then on, but may not vote in question 1, so the three votes still reveal it and its
// results leave him out. The host turns Ula away; her request stays rejected until the room closes (closingSteps).
// Then the emotes (S-16, context/changes/room-emotes/plan.md, Faza 1 #6), which need no screen: Ola, a player, sends
// one; an id off the list is refused before the database is asked; and Ula, turned away, is no player, so the route
// answers her as for no room at all. Nothing of an emote comes back in the answer. Then the players' colours (S-18,
// context/changes/player-color-choice/plan.md, Faza 2 #5) while question 1 is voting: the host has 0, Ola 1, the
// second guest 2 and Kuba, let in, 3. Ola picks the free 7 with her cookie and the host's room state shows it on her
// row; Kuba asks for the same one and gets color_taken; the host picks a free one by the session; and a colour off the
// palette is refused before the database is asked. Skipped with SMOKE_ROUND=0.
function roundSteps() {
  const round = [
    ["host starts the game", () => act("start", {}, hostJar), { status: 200, body: ACCEPTED }],
    [
      "a vote without a question number is refused",
      () => act("vote", { target: null }, olaJar),
      { status: 400, body: /^\{"error":"invalid_body"\}$/ },
    ],
    [
      "a reveal without a question number is refused",
      () => act("reveal", {}, hostJar),
      { status: 400, body: /^\{"error":"invalid_body"\}$/ },
    ],
    [
      "a new guest asks to join a game in play and gets the room's cookie",
      () => join("Kuba", kubaJar),
      () => ({ status: 303, location: LINK_PAGE, cookie: `mlt_player_${room.id}` }),
    ],
    ["Kuba's request is pending", () => requestState(kubaJar), { status: 200, body: requestAnswer("pending", "Kuba") }],
    [
      "host sees Kuba among the requests",
      () => lobby(room.id, hostJar),
      { status: 200, body: /"requests":\["Kuba"\]/ },
    ],
    ["host lets Kuba in", () => act("admit", { nick: "Kuba" }, hostJar), { status: 200, body: ACCEPTED }],
    ["Kuba's request is admitted", () => requestState(kubaJar), { status: 200, body: requestAnswer("admitted") }],
    [
      "room state shows Kuba question 1, which he may not vote in",
      () => lobby(room.id, kubaJar),
      { status: 200, body: LATECOMER_ROUND },
    ],
    [
      "a second latecomer asks to join",
      () => join("Ula", ulaJar),
      () => ({ status: 303, location: LINK_PAGE, cookie: `mlt_player_${room.id}` }),
    ],
    ["host turns Ula away", () => act("reject", { nick: "Ula" }, hostJar), { status: 200, body: ACCEPTED }],
    ["Ula's request is rejected", () => requestState(ulaJar), { status: 200, body: requestAnswer("rejected", "Ula") }],
    ["Ola sends an emote", () => act("emote", { emote: "heart" }, olaJar), { status: 200, body: ACCEPTED }],
    [
      "an emote not on the list is refused",
      () => act("emote", { emote: "eggplant" }, olaJar),
      { status: 400, body: /^\{"error":"invalid_body"\}$/ },
    ],
    [
      "Ula, rejected, cannot send an emote",
      () => act("emote", { emote: "heart" }, ulaJar),
      { status: 404, body: /^\{"error":"not_found"\}$/ },
    ],
    ["Ola picks a free colour", () => act("color", { color: 7 }, olaJar), { status: 200, body: ACCEPTED }],
    [
      "host's room state shows Ola's new colour",
      () => lobby(room.id, hostJar),
      { status: 200, body: OLA_PICKED_COLOR },
    ],
    [
      "Kuba cannot pick Ola's colour",
      () => act("color", { color: 7 }, kubaJar),
      { status: 409, body: /^\{"error":"color_taken"\}$/ },
    ],
    ["host picks a free colour", () => act("color", { color: 12 }, hostJar), { status: 200, body: ACCEPTED }],
    [
      "a colour off the palette is refused",
      () => act("color", { color: 20 }, olaJar),
      { status: 400, body: /^\{"error":"invalid_body"\}$/ },
    ],
    ["Ola votes", () => act("vote", { target: "Ola", round: 1 }, olaJar), { status: 200, body: ACCEPTED }],
    [
      "the second guest votes",
      () => act("vote", { target: null, round: 1 }, secondGuestJar),
      { status: 200, body: ACCEPTED },
    ],
    ["host votes last", () => act("vote", { target: "ola", round: 1 }, hostJar), { status: 200, body: ACCEPTED }],
    [
      "room state shows the reveal with the votes' counts",
      () => lobby(room.id, olaJar),
      { status: 200, body: REVEALED },
    ],
    [
      "a vote after the reveal is refused",
      () => act("vote", { target: null, round: 1 }, olaJar),
      { status: 409, body: /^\{"error":"round_revealed"\}$/ },
    ],
    ["link with Ola's cookie goes back to the room", () => request(`/j/${room.link}`, { cookies: olaJar }), thisRoom],
  ];
  return ROUND ? round : skippedBy(round, "SMOKE_ROUND=0");
}

// Question 3 as the lobby shows it to Ola after question 2 was skipped: voting, after a skip, and no vote in it yet
// (Ola's vote went with question 2). Each part is checked on its own, as in REVEALED.
const THIRD_AFTER_SKIP = new RegExp(
  ['"number":3[,}]', '"phase":"voting"', '"voted":\\[\\]', '"me_voted":false', '"after_skip":true']
    .map((part) => `(?=.*${part})`)
    .join(""),
);
const GAME_OVER = new RegExp(['"status":"closed"', '"round":null'].map((part) => `(?=.*${part})`).join(""));

// S-03's evening (context/archive/2026-10-15-full-game-evening/plan.md, Faza 5), on from the round's reveal in the same
// room: the next question, a vote that comes late, a skip and the end. Ola votes at question 2 with its number, as the
// room screen sends it. The second guest's screen is still on question 1, so its vote carries 1 and must not land in
// question 2, which it has not shown (round_over); nor may "Odsłoń wynik" from a host's screen still on question 1
// (F2 of context/archive/2026-10-20-deferred-review-fixes/plan.md), and Ola's vote right after it shows question 2
// still voting. The host reveals question 3 with its number before the end: a route that refused every reveal would
// pass the refusals too. Then the co-host role (S-07, context/changes/co-host-role/plan.md, Faza 2 #5): the host gives
// it to Ola, who opens question 4 with her cookie alone, through the Worker's draw from the leader's data of the
// room's state; the host takes it back, and her reveal of question 4 is refused as no leader's. Had it passed, it would
// only have revealed question 4, so the host's end below holds either way. Skipped with SMOKE_GAME=0 and with
// SMOKE_ROUND=0.
function gameSteps() {
  const game = [
    ["host opens the next question", () => act("next", { round: 1 }, hostJar), { status: 200, body: ACCEPTED }],
    [
      "a reveal sent from question 1 is refused at question 2",
      () => act("reveal", { round: 1 }, hostJar),
      { status: 409, body: /^\{"error":"round_over"\}$/ },
    ],
    [
      "Ola votes at question 2",
      () => act("vote", { target: "Smoke host", round: 2 }, olaJar),
      { status: 200, body: ACCEPTED },
    ],
    [
      "a vote sent from question 1 is refused at question 2",
      () => act("vote", { target: null, round: 1 }, secondGuestJar),
      { status: 409, body: /^\{"error":"round_over"\}$/ },
    ],
    ["host skips question 2", () => act("skip", { round: 2 }, hostJar), { status: 200, body: ACCEPTED }],
    [
      "question 3 is open after the skip, with no vote in it",
      () => lobby(room.id, olaJar),
      { status: 200, body: THIRD_AFTER_SKIP },
    ],
    [
      "host reveals question 3 with its number",
      () => act("reveal", { round: 3 }, hostJar),
      { status: 200, body: ACCEPTED },
    ],
    [
      "host gives Ola the co-host role",
      () => act("cohost", { nick: "Ola", cohost: true }, hostJar),
      { status: 200, body: ACCEPTED },
    ],
    [
      "Ola, a co-host, opens the next question",
      () => act("next", { round: 3 }, olaJar),
      { status: 200, body: ACCEPTED },
    ],
    [
      "host takes Ola's co-host role",
      () => act("cohost", { nick: "Ola", cohost: false }, hostJar),
      { status: 200, body: ACCEPTED },
    ],
    [
      "Ola, no longer a co-host, cannot reveal question 4",
      () => act("reveal", { round: 4 }, olaJar),
      { status: 409, body: /^\{"error":"not_leader"\}$/ },
    ],
    ["host ends the game", () => act("end", {}, hostJar), { status: 200, body: ACCEPTED }],
    ["room state tells the host the game is over", () => lobby(room.id, hostJar), { status: 200, body: GAME_OVER }],
    ["room state tells Ola the game is over", () => lobby(room.id, olaJar), { status: 200, body: GAME_OVER }],
    ["old link says the game is over", () => request(`/j/${room.link}`, { cookies: olaJar }), { status: 410 }],
  ];
  if (GAME) return game;
  return skippedBy(game, ROUND ? "SMOKE_GAME=0" : "SMOKE_ROUND=0");
}

// The room "Nowa gra" opens at the end, kept for the list's steps.
async function newListRoom({ confirmClose }) {
  const actual = await newRoom({ confirmClose });
  listRoom.id = ROOM_PATH.exec(actual.location)?.[1] ?? "";
  return actual;
}

// The view of the room's state as the Worker sends it: the host's game's question list as 15 questions, each
// {position, text, own}; question texts hold no braces. Never question_list itself, nor for a guest anything of the list.
const FIFTEEN_QUESTIONS = /^(?!.*"question_list")(?=.*"questions":\[(?:\{[^{}]*\},){14}\{[^{}]*\}\])/;
const NO_QUESTIONS = /^(?!.*"question_list")(?=.*"questions":null)/;
// The host's own texts: the ending after "Kto z nas najprawdopodobniej", as on the room screen.
const SMOKE_REWORDED = "przeszedłby test dymny za pierwszym razem";
const SMOKE_OWN_QUESTION = "napisałby test, zanim napisze kod";

// S-06's review of the game's question list (context/archive/2026-10-24-question-list-review/plan.md, Faza 2 #8)
// through the real routes, in the room "Nowa gra" opened at the end, which stays in the lobby: no game starts with a
// list here, so the game's steps above keep "Zacznij grę" with no review checked after every deploy (an own question in
// a round is the database tests' and e2e's to check). A guest joins first, to check that only the host gets the list.
// The list is the first 15 of the pool in random order, so the steps name its entries by position only. Skipped with
// SMOKE_LIST=0.
function listSteps() {
  const inListRoom = (action, body) => act(action, body, hostJar, listRoom.id);
  const list = [
    [
      "the new room's page shows host its link",
      async () => {
        const actual = await request(`/r/${listRoom.id}`, { cookies: hostJar, readBody: true });
        listRoom.link = LINK_IN_PAGE.exec(actual.body)?.[1] ?? "";
        return actual;
      },
      { status: 200, body: LINK_IN_PAGE },
    ],
    [
      "a guest joins the new room as Ela",
      () => join("Ela", elaJar, listRoom.link),
      () => ({ status: 302, location: new RegExp(`^/r/${listRoom.id}$`), cookie: `mlt_player_${listRoom.id}` }),
    ],
    ["host opens the question list", () => inListRoom("question-list", {}), { status: 200, body: ACCEPTED }],
    ["host sees 15 questions on the list", () => lobby(listRoom.id, hostJar), { status: 200, body: FIFTEEN_QUESTIONS }],
    ["Ela sees no question list", () => lobby(listRoom.id, elaJar), { status: 200, body: NO_QUESTIONS }],
    [
      "host rewords question 1",
      () => inListRoom("question-edit", { position: 1, text: SMOKE_REWORDED }),
      { status: 200, body: ACCEPTED },
    ],
    ["host removes question 2", () => inListRoom("question-remove", { position: 2 }), { status: 200, body: ACCEPTED }],
    [
      "removing question 2 again is refused",
      () => inListRoom("question-remove", { position: 2 }),
      { status: 409, body: /^\{"error":"question_unknown"\}$/ },
    ],
    [
      "an own question of 91 characters is refused",
      () => inListRoom("question-add", { text: "x".repeat(91) }),
      { status: 409, body: /^\{"error":"invalid_question_text"\}$/ },
    ],
    [
      "host adds an own question",
      () => inListRoom("question-add", { text: SMOKE_OWN_QUESTION }),
      { status: 200, body: ACCEPTED },
    ],
    ["host draws one more question", () => inListRoom("question-draw", {}), { status: 200, body: ACCEPTED }],
  ];
  return LIST ? list : skippedBy(list, "SMOKE_LIST=0");
}

// "Nowa gra" at the end. After the evening's steps the room is closed already, so a new one opens without asking.
// Without them (SMOKE_GAME=0, SMOKE_ROUND=0) the room is still open with its guests, so "Nowa gra" with the
// confirmation closes it, and its old link and lobby say so. Either way the room's requests went with it (S-08): Ula's,
// turned away during question 1, now says the game is over (the rows themselves are pgTAP's to check,
// supabase/tests/round_creator_view.test.sql). That step is a round step: skipped with SMOKE_ROUND=0, which has no
// latecomers. Then the list's steps in the new room, in every mode (listSteps).
function closingSteps() {
  const requestGone = [
    ["Ula's request says the game is over", () => requestState(ulaJar), { status: 200, body: requestAnswer("closed") }],
  ];
  const latecomer = ROUND ? requestGone : skippedBy(requestGone, "SMOKE_ROUND=0");
  if (GAME) {
    return [
      [
        "new game after the end opens a room without asking",
        () => newListRoom({ confirmClose: false }),
        { status: 302, location: ROOM_PATH },
      ],
      ...latecomer,
      ...listSteps(),
    ];
  }
  return [
    [
      "new game with confirmation opens a new room",
      () => newListRoom({ confirmClose: true }),
      { status: 302, location: ROOM_PATH },
    ],
    ["old link says the game is closed", () => request(`/j/${room.link}`, { cookies: olaJar }), { status: 410 }],
    [
      "old lobby tells Ola the game is closed",
      () => lobby(room.id, olaJar),
      { status: 200, body: /"status":"closed"/ },
    ],
    ...latecomer,
    ...listSteps(),
  ];
}

const roomSteps = [
  [
    "host signs in",
    () => request("/api/auth/signin", { method: "POST", form: { email, password }, cookies: hostJar }),
    { status: 302, location: HOME },
  ],
  [
    "signin page sends signed-in host home",
    () => request("/auth/signin", { cookies: hostJar }),
    { status: 302, location: HOME },
  ],
  [
    "signin page still shows an error to signed-in host",
    () => request("/auth/signin?error=access_denied", { cookies: hostJar }),
    { status: 200 },
  ],
  [
    "host creates a room",
    async () => {
      const actual = await newRoom({ confirmClose: true });
      room.id = ROOM_PATH.exec(actual.location)?.[1] ?? "";
      return actual;
    },
    { status: 302, location: ROOM_PATH },
  ],
  [
    "room page shows host the link",
    async () => {
      const actual = await request(`/r/${room.id}`, { cookies: hostJar, readBody: true });
      room.link = LINK_IN_PAGE.exec(actual.body)?.[1] ?? "";
      return actual;
    },
    { status: 200, body: LINK_IN_PAGE },
  ],
  ["home renders for signed-in host", () => request("/", { cookies: hostJar }), { status: 200 }],
  // Guests. Opening the link only reads (Discord fetches it for its preview): however often, it sets no player cookie
  // and adds nobody to the room. Joining sets the cookie, and with it the lobby knows Ola again after a refresh. The
  // nick stays taken, also by "Ola " (a trailing space), "O\u200Bla" (a zero-width space) and "Ola\u{FE0F}" (a
  // variation selector, decision D5 in context/archive/2026-10-13-first-live-round/research.md), which look like it; "ola" is
  // another nick, because case counts.
  ["guest sees the join form", () => request(`/j/${room.link}`, { cookies: olaJar }), { status: 200 }],
  ["opening the link three times sets no player cookie", openLinkThreeTimes, { status: 200, noCookie: "mlt_player_" }],
  ["opening the link adds no player", () => lobby(room.id, hostJar), { status: 200, body: ONLY_ONE_PLAYER }],
  [
    "guest joins as Ola and gets the room's cookie",
    () => join("Ola", olaJar),
    () => ({ ...thisRoom(), cookie: `mlt_player_${room.id}` }),
  ],
  [
    "lobby lists the host and Ola",
    () => lobby(room.id, olaJar),
    { status: 200, body: /"nick":"Smoke host".*"nick":"Ola"/ },
  ],
  ["lobby with Ola's cookie still shows Ola as me", () => lobby(room.id, olaJar), { status: 200, body: /"me":"Ola"/ }],
  ["same plain nick Ola again is taken", () => join("Ola", new Map()), { status: 302, location: NICK_TAKEN }],
  ["nick with a trailing space is taken", () => join("Ola ", new Map()), { status: 302, location: NICK_TAKEN }],
  ["nick with a zero-width space is taken", () => join("O\u200Bla", new Map()), { status: 302, location: NICK_TAKEN }],
  [
    "nick with a variation selector is taken",
    () => join("Ola\u{FE0F}", new Map()),
    { status: 302, location: NICK_TAKEN },
  ],
  ["same nick in another case joins", () => join("ola", secondGuestJar), thisRoom],
  ["lobby without the cookie is not found", () => lobby(room.id, new Map()), { status: 404 }],
  // The round (S-02) in this room, with three players: the host, Ola and the second guest. Skipped with SMOKE_ROUND=0.
  ...roundSteps(),
  // "Nowa gra" without the confirmation, while the game is in play (still in the lobby with SMOKE_ROUND=0): guests are
  // in the room, so it only asks and changes nothing. Before the evening's steps, which close the room, so every run
  // checks it.
  [
    "new game asks before closing a room with guests",
    () => newRoom({ confirmClose: false }),
    { status: 302, location: "/?error=open_room_has_guests" },
  ],
  // The evening (S-03) on from the round's reveal. Skipped with SMOKE_GAME=0 and SMOKE_ROUND=0.
  ...gameSteps(),
  ...closingSteps(),
  ["unknown link is not found", () => request("/j/AAAAAAAAAAAAAAAAAAAAAA", { cookies: new Map() }), { status: 404 }],
  [
    "host signs out",
    () => request("/api/auth/signout", { method: "POST", cookies: hostJar }),
    { status: 302, location: HOME },
  ],
];

// A string matches the start of the value, a RegExp the pattern.
function matches(pattern, value) {
  return pattern instanceof RegExp ? pattern.test(value) : value.startsWith(pattern);
}

// At least one cookie this step set has `part` in its name, and every such cookie is HttpOnly.
function httpOnlyOk(actual, part) {
  const named = actual.cookies.filter((cookie) => cookie.includes(part));
  return named.length > 0 && named.every((cookie) => actual.httpOnly.includes(cookie));
}

let failed = 0;
const skippedBecause = new Map();
for (const [name, run, expectation] of [...steps, ...roomSteps]) {
  // A round, evening or list step with SMOKE_ROUND=0, SMOKE_GAME=0 or SMOKE_LIST=0: the third element names the switch.
  if (run === null) {
    skippedBecause.set(expectation, (skippedBecause.get(expectation) ?? 0) + 1);
    console.log(`SKIP  ${name}  (${expectation})`);
    continue;
  }
  const actual = await run();
  // A function gives values known only after earlier steps (the room id).
  const expected = typeof expectation === "function" ? expectation() : expectation;
  // location: Location starts with it (a string) or matches it (a RegExp); exact: Location is exactly it (a bare "/"
  // as a prefix matches any path); contains: Location has every part; body: the response text matches it; cookie: a
  // cookie this step set ends with it; noCookie: no cookie this step set has it in its name; httpOnly: the step set
  // cookies whose names contain it, all of them HttpOnly.
  const contains = expected.contains ?? [];
  const ok =
    actual.status === expected.status &&
    (expected.location === undefined || matches(expected.location, actual.location)) &&
    (expected.exact === undefined || actual.location === expected.exact) &&
    contains.every((part) => actual.location.includes(part)) &&
    (expected.body === undefined || expected.body.test(actual.body ?? "")) &&
    (expected.cookie === undefined || actual.cookies.some((cookie) => cookie.endsWith(expected.cookie))) &&
    (expected.noCookie === undefined || !actual.cookies.some((cookie) => cookie.includes(expected.noCookie))) &&
    (expected.httpOnly === undefined || httpOnlyOk(actual, expected.httpOnly));
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}  -> ${actual.status} ${mask(actual.location)}`);
  if (!ok) {
    failed++;
    console.log(`      expected ${expected.status} ${expected.exact ?? expected.location ?? ""}`);
    if (contains.length > 0) console.log(`      expected Location to contain ${contains.join(" and ")}`);
    if (expected.body !== undefined) console.log(`      expected the body to match ${expected.body}`);
    if (expected.cookie !== undefined) {
      console.log(`      expected a cookie ending in ${expected.cookie}, set: ${actual.cookies.join(", ") || "none"}`);
    }
    if (expected.noCookie !== undefined) {
      console.log(
        `      expected no cookie containing ${expected.noCookie}, set: ${actual.cookies.join(", ") || "none"}`,
      );
    }
    if (expected.httpOnly !== undefined) {
      console.log(
        `      expected HttpOnly cookies containing ${expected.httpOnly}, HttpOnly: ${actual.httpOnly.join(", ") || "none"}`,
      );
    }
  }
}

const skippedNote = skippedBecause.size
  ? ` (${[...skippedBecause].map(([reason, count]) => `${count} step(s) skipped: ${reason}`).join(", ")})`
  : "";
console.log(failed ? `\n${failed} step(s) failed${skippedNote}` : `\nAll smoke steps passed${skippedNote}`);
process.exit(failed ? 1 : 0);
