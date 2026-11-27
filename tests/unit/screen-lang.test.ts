import { createElement, type ComponentProps, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import type { APIContext } from "astro";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cardLang, linkPreview } from "@/components/room/game-intro";
import HeaderActions from "@/components/room/HeaderActions";
import PlayerLink from "@/components/room/PlayerLink";
import QuestionList from "@/components/room/QuestionList";
import { RoundQuestion } from "@/components/room/RoundQuestion";
import { messages, type Lang, type UiLang } from "@/lib/i18n";
import { keepLang } from "@/lib/i18n/live-lang";
import { I18nProvider } from "@/lib/i18n/react";
import { askedLang, LANG_COOKIE, langCookieOptions, nextPath, screenLang } from "@/lib/i18n/screen-lang";
import { POST } from "@/pages/api/lang";
import { GET as GET_LOBBY } from "@/pages/api/rooms/[id]/lobby";

// A person's screen language (S-27, english-version; context/changes/english-version/plan.md, decisions 3, 4, 8, 9 and
// 10, Faza 5 #3-#5 and "Testing Strategy"). Oracle, written out by hand: the order of the sources (the switch's cookie,
// then the browser's list by its weights, Polish with no list), the route that keeps the switch and where it may send the
// browser back, the language of the link's card, and the language of a question's sentence on a screen in another one.

// The room's route alone asks for a client: the real one reads astro:env, which the tests do not have. None here, so a
// request that gets past the route's own checks ends as service_unavailable.
const createClient = vi.hoisted(() => vi.fn(() => null));
vi.mock("@/lib/supabase", () => ({ createClient }));

describe("screenLang", () => {
  it.each([
    { cookie: "en", browser: "pl-PL", lang: "en" },
    { cookie: "pl", browser: "en-US,en;q=0.9", lang: "pl" },
    { cookie: "en", browser: null, lang: "en" },
    { cookie: "pl", browser: "de", lang: "pl" },
  ])("takes the cookie $cookie over the browser's $browser", ({ cookie, browser, lang }) => {
    expect(screenLang(cookie, browser)).toBe(lang);
  });

  it.each(["de", "xx", "PL", "", "en-US", "constructor"])("leaves a cookie that is no language (%s) out", (cookie) => {
    expect(screenLang(cookie, "pl-PL")).toBe("pl");
    expect(screenLang(cookie, "en-GB")).toBe("en");
  });

  it.each([
    { browser: "pl-PL", lang: "pl" },
    { browser: "pl", lang: "pl" },
    { browser: "PL-pl,EN;q=0.5", lang: "pl" },
    { browser: "pl-PL,pl;q=0.9,en-US;q=0.8,en;q=0.7", lang: "pl" },
    { browser: "en-US,en;q=0.9,pl;q=0.8", lang: "en" },
    { browser: "en-GB", lang: "en" },
    // Polish before English decides, whatever comes before both.
    { browser: "de-DE,de;q=0.9,pl;q=0.8", lang: "pl" },
    { browser: "de-DE,de;q=0.9,en;q=0.8,pl;q=0.7", lang: "en" },
    // The weights decide, not the order on the list.
    { browser: "en;q=0.5,pl;q=0.8", lang: "pl" },
    // The earlier one on a tie.
    { browser: "en;q=0.8,pl;q=0.8", lang: "en" },
    { browser: "pl;q=0.8, en;q=0.8", lang: "pl" },
    // A language with q=0 is refused.
    { browser: "pl;q=0,en;q=0.5", lang: "en" },
    { browser: "en;q=0,pl;q=0.1", lang: "pl" },
    // A weight that is no number from 0 to 1 counts as refused, too.
    { browser: "pl;q=x,en;q=0.5", lang: "en" },
    { browser: "pl;q=7,en;q=0.5", lang: "en" },
    // Neither on the list: English.
    { browser: "de", lang: "en" },
    { browser: "de-DE,fr;q=0.5", lang: "en" },
    { browser: "de,*;q=0.1", lang: "en" },
    // A language whose code only starts like one of the two is another one.
    { browser: "plt", lang: "en" },
  ])("takes $lang from the browser's $browser", ({ browser, lang }) => {
    expect(screenLang(undefined, browser)).toBe(lang);
  });

  it.each([null, "", "  ", "*", "*;q=0.5", ",", " , "])("is Polish with no list at all (%j)", (browser) => {
    expect(screenLang(undefined, browser)).toBe("pl");
  });
});

describe("askedLang (GET /api/rooms/<id>/lobby)", () => {
  it.each<{ query: string; request: Lang; lang: Lang | null }>([
    { query: "?lang=en", request: "pl", lang: "en" },
    { query: "?lang=pl", request: "en", lang: "pl" },
    { query: "", request: "en", lang: "en" },
    { query: "", request: "pl", lang: "pl" },
    { query: "?lang=de", request: "en", lang: null },
    { query: "?lang=", request: "pl", lang: null },
    { query: "?lang=xx", request: "pl", lang: null },
  ])("answers $query of a request in $request with $lang", ({ query, request, lang }) => {
    expect(askedLang(new URLSearchParams(query), request)).toBe(lang);
  });
});

// GET /api/rooms/<id>/lobby on a stand-in of Astro's context, as POST below.
async function getLobby(query: string): Promise<Response> {
  const id = "3f2b8c1e-7a4d-4e9b-9c2a-5d6e7f8a9b0c";
  const url = new URL(`/api/rooms/${id}/lobby${query}`, "https://most-likely-to.example");
  const context = {
    params: { id },
    request: new Request(url),
    url,
    cookies: { get: () => undefined },
    locals: { lang: "pl", user: null },
  };
  return GET_LOBBY(context as unknown as APIContext);
}

describe("GET /api/rooms/<id>/lobby", () => {
  beforeEach(() => {
    createClient.mockClear();
  });

  it.each(["?lang=de", "?lang=", "?lang=xx", "?lang=EN"])(
    "refuses %s with 400, before it asks for a room",
    async (query) => {
      const response = await getLobby(query);

      expect(response.status).toBe(400);
      expect(createClient).not.toHaveBeenCalled();
    },
  );

  it.each(["?lang=en", "?lang=pl", ""])("goes on with %j", async (query) => {
    const response = await getLobby(query);

    expect(response.status).toBe(503);
    expect(createClient).toHaveBeenCalledOnce();
  });
});

// The room's and the waiting screen's picks (LanguageSwitch), on a stand-in of fetch: what was sent, and the answers
// still owed. The cookie is the last answer's, so the last pick has to be the last one answered.
describe("keepLang", () => {
  interface Sent {
    lang: unknown;
    init: RequestInit;
    answer: (status: number) => void;
    fail: () => void;
  }
  let sent: Sent[] = [];

  beforeEach(() => {
    sent = [];
    vi.spyOn(console, "warn").mockImplementation(() => undefined);
    vi.stubGlobal("fetch", (_url: string, init: RequestInit & { body: string }) => {
      return new Promise<Response>((resolve, reject) => {
        sent.push({
          lang: (JSON.parse(init.body) as { lang: unknown }).lang,
          init,
          answer: (status) => {
            resolve(new Response(null, { status }));
          },
          fail: () => {
            reject(new TypeError("no network"));
          },
        });
      });
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("sends the second pick only after the first one's answer", async () => {
    const first = keepLang("en");
    const second = keepLang("pl");
    // Time for a second request that does not wait.
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(sent.map(({ lang }) => lang)).toEqual(["en"]);

    sent[0].answer(204);
    await first;
    await vi.waitFor(() => {
      expect(sent.map(({ lang }) => lang)).toEqual(["en", "pl"]);
    });
    sent[1].answer(204);
    await second;
  });

  it.each<{ how: string; end: (pick: Sent) => void }>([
    {
      how: "fails",
      end: (pick) => {
        pick.fail();
      },
    },
    {
      how: "is refused",
      end: (pick) => {
        pick.answer(503);
      },
    },
  ])("sends the next pick when the one before it $how", async ({ end }) => {
    const first = keepLang("en");
    const second = keepLang("pl");
    await vi.waitFor(() => {
      expect(sent).toHaveLength(1);
    });
    end(sent[0]);
    await first;
    await vi.waitFor(() => {
      expect(sent.map(({ lang }) => lang)).toEqual(["en", "pl"]);
    });
    sent[1].answer(204);
    await second;
  });

  it("outlives the page it was made on", async () => {
    const kept = keepLang("en");
    await vi.waitFor(() => {
      expect(sent).toHaveLength(1);
    });
    expect(sent[0].init.keepalive).toBe(true);
    sent[0].answer(204);
    await kept;
  });
});

const ORIGIN = "https://most-likely-to.example";

describe("nextPath", () => {
  it.each([
    ["/", "/"],
    ["/gry", "/gry"],
    ["/j/Xq3vL9tR2mWb7KpZ0aYc_e?error=nick_taken", "/j/Xq3vL9tR2mWb7KpZ0aYc_e?error=nick_taken"],
    [`${ORIGIN}/r/3f2b8c1e-7a4d-4e9b-9c2a-5d6e7f8a9b0c`, "/r/3f2b8c1e-7a4d-4e9b-9c2a-5d6e7f8a9b0c"],
    ["/gry#top", "/gry"],
  ])("sends %s back to %s", (next, path) => {
    expect(nextPath(next, ORIGIN)).toBe(path);
  });

  it.each([
    "//evil.com",
    "/\\evil.com",
    "\\\\evil.com",
    "/\t/evil.com",
    "/\n/evil.com",
    "https://evil.com",
    "https:evil.com/\\evil.com",
    "http://most-likely-to.example/",
    "javascript:alert(1)",
    "data:text/html,x",
    // On this site, with a path the browser would read as another site's address.
    "/.//evil.com",
    "/.\\\\evil.com",
    `${ORIGIN}//evil.com`,
    null,
  ])("never sends the browser to %j", (next) => {
    const target = new URL(nextPath(next, ORIGIN), ORIGIN);
    expect(target.origin).toBe(ORIGIN);
    expect(target.pathname.startsWith("//")).toBe(false);
  });
});

// POST /api/lang on a stand-in of Astro's context: what it answers and which cookie it sets.
interface SetCookie {
  name: string;
  value: unknown;
  options: unknown;
}

async function post(
  body: string,
  headers: Record<string, string>,
  origin = ORIGIN,
): Promise<{ response: Response; cookies: SetCookie[] }> {
  const cookies: SetCookie[] = [];
  const url = new URL("/api/lang", origin);
  const context = {
    request: new Request(url, { method: "POST", body, headers }),
    url,
    cookies: {
      set: (name: string, value: unknown, options: unknown) => {
        cookies.push({ name, value, options });
      },
    },
    redirect: (location: string, status: number) => new Response(null, { status, headers: { Location: location } }),
  };
  return { response: await POST(context as unknown as APIContext), cookies };
}

const FORM = { "Content-Type": "application/x-www-form-urlencoded" };
const JSON_POST = { "Content-Type": "application/json", Origin: ORIGIN };

describe("POST /api/lang", () => {
  beforeEach(() => {
    vi.spyOn(console, "warn").mockImplementation(() => undefined);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it.each(["pl", "en"])("keeps %s from the form and goes back to the page it came from", async (lang) => {
    const { response, cookies } = await post(`next=%2Fgry%3Fa%3D1&lang=${lang}`, FORM);

    expect(response.status).toBe(303);
    expect(response.headers.get("Location")).toBe("/gry?a=1");
    expect(cookies).toEqual([{ name: LANG_COOKIE, value: lang, options: langCookieOptions(new URL(ORIGIN)) }]);
  });

  it.each(["pl", "en"])("keeps %s from the room's screen, which goes nowhere", async (lang) => {
    const { response, cookies } = await post(JSON.stringify({ lang }), JSON_POST);

    expect(response.status).toBe(204);
    expect(await response.text()).toBe("");
    expect(cookies.map(({ name, value }) => [name, value])).toEqual([[LANG_COOKIE, lang]]);
  });

  it.each(["//evil.com", "/\\evil.com", "https://evil.com", "https://evil.com/gry", "/.//evil.com"])(
    "keeps the language and goes to / instead of %s",
    async (next) => {
      const { response, cookies } = await post(new URLSearchParams({ lang: "en", next }).toString(), FORM);

      expect(response.status).toBe(303);
      expect(response.headers.get("Location")).toBe("/");
      expect(cookies).toHaveLength(1);
    },
  );

  it.each([
    { why: "another language in the form", body: "lang=de&next=%2F", headers: FORM },
    { why: "no language in the form", body: "next=%2F", headers: FORM },
    { why: "the pseudo language in the form", body: "lang=xx", headers: FORM },
    { why: "a multipart form", body: "lang=en", headers: { "Content-Type": "multipart/form-data; boundary=x" } },
    { why: "another language in the JSON", body: '{"lang":"de"}', headers: JSON_POST },
    { why: "no object in the JSON", body: '"en"', headers: JSON_POST },
    { why: "a list in the JSON", body: '["en"]', headers: JSON_POST },
    { why: "no JSON", body: "lang=en", headers: JSON_POST },
  ])("refuses $why with 400 and no cookie", async ({ body, headers }) => {
    const { response, cookies } = await post(body, headers);

    expect(response.status).toBe(400);
    expect(cookies).toEqual([]);
  });

  it.each([
    { why: "another site's", origin: "https://evil.com" },
    { why: "no", origin: null },
  ])("refuses a JSON request with $why Origin, and sets no cookie", async ({ origin }) => {
    const headers: Record<string, string> = { "Content-Type": "application/json" };
    if (origin !== null) headers.Origin = origin;
    const { response, cookies } = await post('{"lang":"en"}', headers);

    expect(response.status).toBe(403);
    expect(cookies).toEqual([]);
  });

  it("keeps the cookie from scripts and, on https, from plain http", () => {
    expect(langCookieOptions(new URL("https://most-likely-to.example/gry"))).toMatchObject({
      httpOnly: true,
      sameSite: "lax",
      path: "/",
      secure: true,
    });
    expect(langCookieOptions(new URL("http://192.168.0.10:4321/"))).toMatchObject({ httpOnly: true, secure: false });
  });
});

// Decision 10: the card is in the language of the one who copied the link, the page in the guest's own.
describe("the link's card", () => {
  it.each([
    ["?lang=en", "en"],
    ["", "pl"],
    ["?lang=pl", "pl"],
    ["?lang=de", "pl"],
    ["?lang=EN", "pl"],
    ["?error=nick_taken", "pl"],
  ])("of a link with %j is in %s", (query, lang) => {
    expect(cardLang(new URLSearchParams(query))).toBe(lang);
  });

  it("has other words in each language and the same picture", () => {
    const pl = linkPreview(messages("pl"));
    const en = linkPreview(messages("en"));

    expect(en.title).not.toBe(pl.title);
    expect(en.description).not.toBe(pl.description);
    expect(en.image).toBe(pl.image);
  });

  // Discord cuts a longer one (src/lib/i18n/pl/link.ts).
  it.each<Lang>(["pl", "en"])("fits Discord in %s", (lang) => {
    const { title, description } = linkPreview(messages(lang));
    const bytes = (text: string) => new TextEncoder().encode(text).length;

    expect(bytes(title)).toBeLessThanOrEqual(70);
    expect(bytes(description)).toBeLessThanOrEqual(350);
  });
});

function render(lang: UiLang, child: ReactNode): string {
  return renderToStaticMarkup(createElement(I18nProvider, { lang } as ComponentProps<typeof I18nProvider>, child));
}

const LINK = "https://most-likely-to.example/j/Xq3vL9tR2mWb7KpZ0aYc_e";

describe("a leader's players' link", () => {
  it.each<{ lang: UiLang; shown: string }>([
    { lang: "pl", shown: LINK },
    { lang: "en", shown: `${LINK}?lang=en` },
    { lang: "xx", shown: LINK },
  ])("on a screen in $lang is $shown, and is never said to have changed", ({ lang, shown }) => {
    const html = render(lang, createElement(PlayerLink, { linkUrl: LINK, idPrefix: "" }));

    expect(html).toContain(`value="${shown}"`);
    expect(html).not.toContain(messages(lang === "xx" ? "pl" : lang).room.playerLink.changed);
  });
});

// Decisions 8 and 9: a question's sentence is whole in the language of its start, and says so to a screen reader only
// when that is not the screen's.
describe("a question on a screen", () => {
  it.each<{ screen: UiLang; questionLang: Lang; lang: string | null; starts: string }>([
    { screen: "pl", questionLang: "pl", lang: null, starts: "Kto z nas najprawdopodobniej " },
    { screen: "en", questionLang: "en", lang: null, starts: "Who’s most likely to " },
    { screen: "en", questionLang: "pl", lang: "pl", starts: "Kto z nas najprawdopodobniej " },
    { screen: "pl", questionLang: "en", lang: "en", starts: "Who’s most likely to " },
  ])("in $screen with a text in $questionLang has lang $lang", ({ screen, questionLang, lang, starts }) => {
    const html = render(screen, createElement(RoundQuestion, { question: "abc", questionLang, titleAs: "h1" }));

    expect(html).toContain(`>${starts}abc?</h1>`);
    expect(/ lang="([^"]*)"/.exec(html)?.[1] ?? null).toBe(lang);
  });

  // The host's list shows the text alone, under the start in the screen's language.
  it.each<{ screen: UiLang; textLang: Lang; own: boolean; lang: string | null }>([
    { screen: "pl", textLang: "pl", own: false, lang: null },
    { screen: "en", textLang: "en", own: false, lang: null },
    { screen: "en", textLang: "pl", own: false, lang: "pl" },
    { screen: "pl", textLang: "en", own: false, lang: "en" },
    // The host's own text, whatever language the list was made in: the game does not know its language.
    { screen: "en", textLang: "pl", own: true, lang: null },
  ])(
    "on the host's list in $screen with a text in $textLang (own: $own) has lang $lang",
    ({ screen, textLang, own, lang }) => {
      const ok = () => Promise.resolve({ ok: true as const });
      const html = render(
        screen,
        createElement(QuestionList, {
          questions: [{ position: 1, text: "abc", lang: textLang, own }],
          idPrefix: "",
          open: true,
          onOpenChange: () => undefined,
          actions: { onOpen: ok, onDraw: ok, onRemove: ok, onEdit: ok, onAdd: ok },
        }),
      );

      const row = /<span([^>]*)>abc<\/span>/.exec(html);
      expect(row, "the row's text").not.toBeNull();
      expect(/ lang="([^"]*)"/.exec(row?.[1] ?? "")?.[1] ?? null).toBe(lang);
    },
  );
});

// The switch itself (LanguageSwitch, Karol's pick F2): its pill names the language now, and its form brings the browser
// back to the page. The menu opens with a press, which is e2e's to check.
describe("the switch of the language", () => {
  it.each<{ lang: Lang; code: string; other: string }>([
    { lang: "pl", code: "PL", other: "EN" },
    { lang: "en", code: "EN", other: "PL" },
  ])("on a screen in $lang shows $code, closed", ({ lang, code, other }) => {
    const html = renderToStaticMarkup(
      createElement(HeaderActions, { signedIn: false, place: "narrow", next: "/gry", lang }),
    );

    expect(html).toContain(`>${code}<`);
    expect(html).not.toContain(`>${other}<`);
    expect(html).toContain('aria-expanded="false"');
    expect(html).not.toContain("<form");
  });

  it("names every language in itself in the open menu, the screen's own marked, and comes back to the page", () => {
    const html = renderToStaticMarkup(
      createElement(HeaderActions, {
        signedIn: false,
        place: "narrow",
        next: "/gry?a=1",
        lang: "en",
        preview: { open: true },
      }),
    );

    const form = /<form [^>]*>/.exec(html)?.[0] ?? "";
    expect(form).toContain('method="POST"');
    expect(form).toContain('action="/api/lang"');
    expect(html).toContain('name="next" value="/gry?a=1"');
    const rows = [...html.matchAll(/<button type="submit"[^>]*>/g)].map(([row]) => row);
    expect(rows.map((row) => /value="([^"]*)"/.exec(row)?.[1])).toEqual(["pl", "en"]);
    expect(rows.map((row) => /lang="([^"]*)"/.exec(row)?.[1])).toEqual(["pl", "en"]);
    expect(rows.map((row) => row.includes('aria-current="true"'))).toEqual([false, true]);
  });
});
