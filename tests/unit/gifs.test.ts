import { format } from "node:util";
import { afterEach, beforeEach, describe, expect, it, vi, type MockInstance } from "vitest";
import { gifSearchToRun, type GifSearch } from "@/components/room/useGifSearch";
import {
  GIF_SEARCH_TIMEOUT_MS,
  GIF_TITLE_MAX_LENGTH,
  GIF_URL_MAX_LENGTH,
  gifSearchQuery,
  gifSearchUrl,
  gifTitle,
  isKlipyMediaUrl,
  parseGifResults,
  runGifSearch,
  searchGifs,
  type GifFetch,
  type GifSearchOutcome,
} from "@/lib/rooms/gifs";

// S-24 (PRD FR-028): a gif on the room's chat. The oracle is Karol's decision 3 of 2026-11-17
// (context/changes/room-chat-gifs/plan.md): the game shows only images from KLIPY's servers, whose media hosts KLIPY
// names (docs.klipy.com/network-requirements.md, 2026-11-17: static.klipy.com, static1.klipy.com, static2.klipy.com,
// over https), and KLIPY forbids changing its addresses, so the Worker and a screen take an address exactly as KLIPY
// gave it or refuse it, never rewrite it (plan, Critical Implementation Details); up to 512 characters, and a
// description up to 100 (plan, Faza 2 #1). The hosts and every address are written out by hand, never from the module's
// list. The search (plan, Faza 3 #2): KLIPY's search API (docs.klipy.com/gifs-api/gifs-search-api.md, 2026-11-17) with
// the word of up to 50 characters, one page of 12, the strictest filter, the game's language and webp, never a
// customer_id or anything else of the game; the results in KLIPY's order and as KLIPY gave them, only a result that
// cannot be shown left out (integration-requirements.md); a search only after a word and "Szukaj", the same word never
// asked twice in a row (decisions 4 and the limit of 100 an hour); a failure logged with neither the word, the key nor
// an address (AGENTS.md, Hard Rules). The answer's shape is the one of a real search (2026-11-18), its addresses copied
// from it.

// The path of a gif's address as KLIPY's media addresses are shaped.
const PATH = "/ii/4e7bea9f7a3371424e6c16ebc93252fe/9a/5c/hYjF3kVb.webp";

// An address on KLIPY's first media host of exactly this many characters.
function addressOf(length: number): string {
  const start = "https://static.klipy.com/ii/";
  const end = ".webp";
  return `${start}${"a".repeat(length - start.length - end.length)}${end}`;
}

describe("the gif's limits", () => {
  it("are the plan's: an address of up to 512 characters, a description of up to 100", () => {
    expect(GIF_URL_MAX_LENGTH).toBe(512);
    expect(GIF_TITLE_MAX_LENGTH).toBe(100);
  });
});

describe("isKlipyMediaUrl", () => {
  it.each([
    ["static.klipy.com", `https://static.klipy.com${PATH}`],
    ["static1.klipy.com", `https://static1.klipy.com${PATH}`],
    ["static2.klipy.com", `https://static2.klipy.com${PATH}`],
    ["a query string, in its canonical form", `https://static.klipy.com${PATH}?v=2`],
  ])("takes an address on KLIPY's media host %s", (_name, address) => {
    expect(isKlipyMediaUrl(address)).toBe(true);
  });

  it("takes an address of exactly 512 characters", () => {
    const address = addressOf(512);

    expect(address).toHaveLength(512);
    expect(isKlipyMediaUrl(address)).toBe(true);
  });

  it.each([
    ["over http", `http://static.klipy.com${PATH}`],
    ["on a protocol-relative path", `//static.klipy.com${PATH}`],
    ["on klipy.com itself", `https://klipy.com${PATH}`],
    ["on KLIPY's API, which serves no media", `https://api.klipy.com${PATH}`],
    ["on another domain that starts with a media host's name", `https://static.klipy.com.evil.example${PATH}`],
    ["on another domain that ends with a media host's name", `https://evilstatic.klipy.com${PATH}`],
    ["on a subdomain of a media host", `https://cdn.static.klipy.com${PATH}`],
    ["on a media host's name with a trailing dot", `https://static.klipy.com.${PATH}`],
    ["on another site, over https", `https://media.example.com${PATH}`],
    ["with a login", `https://user@static.klipy.com${PATH}`],
    ["with a login and a password", `https://user:secret@static.klipy.com${PATH}`],
    ["with a port", `https://static.klipy.com:8443${PATH}`],
    ["with https's own port written out", `https://static.klipy.com:443${PATH}`],
    ["with capitals in the host", `https://STATIC.klipy.com${PATH}`],
    ["with capitals in the scheme", `HTTPS://static.klipy.com${PATH}`],
    ["with .. in the path", "https://static.klipy.com/ii/../4e7bea9f7a3371424e6c16ebc93252fe/hYjF3kVb.webp"],
    ["with . in the path", "https://static.klipy.com/ii/./hYjF3kVb.webp"],
    ["with a percent-encoded dot in the host", `https://static%2Eklipy.com${PATH}`],
    ["with a space in the path", "https://static.klipy.com/ii/hYjF 3kVb.webp"],
    ["with a backslash in the path", "https://static.klipy.com\\ii\\hYjF3kVb.webp"],
    ["with no path at all", "https://static.klipy.com"],
    ["with blanks at the edges", ` https://static.klipy.com${PATH} `],
    ["that is no address", "hYjF3kVb.webp"],
    ["that is empty", ""],
    ["of a data: image", "data:image/webp;base64,UklGRg=="],
    ["of javascript:", "javascript:alert(1)"],
  ])("refuses an address %s", (_name, address) => {
    expect(isKlipyMediaUrl(address)).toBe(false);
  });

  it("refuses an address of 513 characters", () => {
    const address = addressOf(513);

    expect(address).toHaveLength(513);
    expect(isKlipyMediaUrl(address)).toBe(false);
  });

  it.each([
    ["no value", undefined],
    ["null", null],
    ["a number", 42],
    ["a URL object", new URL(`https://static.klipy.com${PATH}`)],
    ["an array", [`https://static.klipy.com${PATH}`]],
    ["an object", { href: `https://static.klipy.com${PATH}` }],
  ])("refuses %s, which is not a text", (_name, value) => {
    expect(isKlipyMediaUrl(value)).toBe(false);
  });
});

describe("gifSearchQuery", () => {
  it.each([
    ["a word as it is", "kot", "kot"],
    ["Polish letters and an emoji as they are", "żółty kot 🐱", "żółty kot 🐱"],
    ["blanks at the edges cut", "  kot \n", "kot"],
    ["runs of spaces, tabs and newlines one space", "śmieszny \n\t  kot", "śmieszny kot"],
    ["only blanks as nothing", " \n\t ", ""],
    ["nothing as nothing", "", ""],
  ])("takes %s", (_name, raw, query) => {
    expect(gifSearchQuery(raw)).toBe(query);
  });

  it.each([
    ["50 letters", "a".repeat(50), "a".repeat(50)],
    ["60 letters", "a".repeat(60), "a".repeat(50)],
    ["51 Polish letters", "ż".repeat(51), "ż".repeat(50)],
    ["60 emoji, each one character", "😀".repeat(60), "😀".repeat(50)],
    ["a cut that ends on a space", `${"a".repeat(49)} bcd`, "a".repeat(49)],
  ])("keeps at most 50 characters of %s", (_name, raw, query) => {
    expect(gifSearchQuery(raw)).toBe(query);
  });
});

describe("gifSearchUrl", () => {
  it("asks KLIPY's search API with the key in the path", () => {
    const url = new URL(gifSearchUrl("TestKey_0123456789-abc", "kot", "pl"));

    expect(`${url.origin}${url.pathname}`).toBe("https://api.klipy.com/api/v1/TestKey_0123456789-abc/gifs/search");
  });

  it("asks for exactly one page of 12 webp gifs for the word, with the strictest filter and the screen's language", () => {
    const url = new URL(gifSearchUrl("TestKey_0123456789-abc", "kot", "pl"));

    expect([...url.searchParams.keys()]).toHaveLength(6);
    expect(Object.fromEntries(url.searchParams)).toStrictEqual({
      q: "kot",
      per_page: "12",
      page: "1",
      content_filter: "high",
      locale: "pl",
      format_filter: "webp",
    });
  });

  // KLIPY's locale is a country's code (docs.klipy.com: "ge; us; uk; ru"), so an English screen asks as the US.
  it("asks in the language of an English screen with KLIPY's code of a country", () => {
    const url = new URL(gifSearchUrl("TestKey_0123456789-abc", "cat", "en"));

    expect(url.searchParams.get("locale")).toBe("us");
    expect([...url.searchParams.keys()]).toHaveLength(6);
  });

  it("sends no customer_id", () => {
    const address = gifSearchUrl("TestKey_0123456789-abc", "kot", "pl");

    expect(new URL(address).searchParams.has("customer_id")).toBe(false);
    expect(address).not.toContain("customer");
  });

  it("sends the word as gifSearchQuery leaves it, encoded", () => {
    const url = new URL(gifSearchUrl("TestKey_0123456789-abc", "  żółty \n kot & pies 🐱 ", "pl"));

    expect(url.searchParams.get("q")).toBe("żółty kot & pies 🐱");
  });

  it("encodes the key in the path", () => {
    expect(gifSearchUrl("a/b?c#d", "kot", "pl")).toMatch(
      /^https:\/\/api\.klipy\.com\/api\/v1\/a%2Fb%3Fc%23d\/gifs\/search\?/,
    );
  });
});

// One result of the real search's answer (2026-11-18), as KLIPY shapes it.
function klipyItem(title: unknown, sm: unknown, xs: unknown, type: unknown = "gif"): Record<string, unknown> {
  return {
    id: 7020571319511840,
    type,
    title,
    file: {
      sm: { webp: { url: sm, width: 220, height: 215 } },
      xs: { webp: { url: xs, width: 90, height: 88 } },
    },
  };
}

function klipyAnswer(items: unknown[]): unknown {
  return { result: true, data: { data: items, has_next: true } };
}

const HAPPY = {
  title: "Happy Cat",
  gif: "https://static.klipy.com/ii/0db853ad1d7f196f1b7a6eb9ab617a5a/c3/0d/hPuTSGxEmDebDCm.webp",
  preview: "https://static.klipy.com/ii/0db853ad1d7f196f1b7a6eb9ab617a5a/c3/0d/VZRcalb07TNnNmlK5.webp",
};
const HEART = {
  title: "Cute Cat Makes Heart with Paws",
  gif: "https://static.klipy.com/ii/8ce8357c78ea940b9c2015daf05ce1a5/26/7e/5zt5n8Ir.webp",
  preview: "https://static.klipy.com/ii/8ce8357c78ea940b9c2015daf05ce1a5/26/7e/vd3o5SmH.webp",
};
const KITTEN = {
  title: "Adorable White Kitten",
  gif: "https://static.klipy.com/ii/f87f46a2c5aeaeed4c68910815f73eaf/ad/57/Pn95Tfic.webp",
  preview: "https://static.klipy.com/ii/f87f46a2c5aeaeed4c68910815f73eaf/ad/57/9CjI6sca.webp",
};

describe("parseGifResults", () => {
  it("gives the results in KLIPY's order, the small file as the preview and the larger one as the gif", () => {
    const answer = klipyAnswer([
      klipyItem(HAPPY.title, HAPPY.gif, HAPPY.preview),
      klipyItem(HEART.title, HEART.gif, HEART.preview),
      klipyItem(KITTEN.title, KITTEN.gif, KITTEN.preview),
    ]);

    expect(parseGifResults(answer)).toStrictEqual([HAPPY, HEART, KITTEN]);
  });

  it("gives no results for an answer with none", () => {
    expect(parseGifResults(klipyAnswer([]))).toStrictEqual([]);
  });

  it.each([
    ["an ad", klipyItem(HEART.title, HEART.gif, HEART.preview, "ad")],
    ["a result that is not a gif", klipyItem(HEART.title, HEART.gif, HEART.preview, "sticker")],
    ["a result with no type", { title: HEART.title, file: klipyItem(HEART.title, HEART.gif, HEART.preview).file }],
    ["a gif with no sm file", { type: "gif", title: HEART.title, file: { xs: { webp: { url: HEART.preview } } } }],
    ["a gif with no xs file", { type: "gif", title: HEART.title, file: { sm: { webp: { url: HEART.gif } } } }],
    [
      "a gif with no webp files",
      {
        type: "gif",
        title: HEART.title,
        file: { sm: { gif: { url: HEART.gif } }, xs: { gif: { url: HEART.preview } } },
      },
    ],
    ["a gif with no file at all", { type: "gif", title: HEART.title }],
    ["a gif on another host", klipyItem(HEART.title, "https://media.example.com/ii/a/5zt5n8Ir.webp", HEART.preview)],
    ["a preview on another host", klipyItem(HEART.title, HEART.gif, "https://media.example.com/ii/a/vd3o5SmH.webp")],
    ["a gif over http", klipyItem(HEART.title, "http://static.klipy.com/ii/a/5zt5n8Ir.webp", HEART.preview)],
    [
      "a gif's address not in its canonical form",
      klipyItem(HEART.title, "https://STATIC.klipy.com/ii/a.webp", HEART.preview),
    ],
    ["a gif's address that is not a text", klipyItem(HEART.title, 42, HEART.preview)],
    ["a result that is null", null],
    ["a result that is a text", HEART.gif],
  ])("leaves out %s and keeps the rest in order", (_name, item) => {
    const answer = klipyAnswer([
      klipyItem(HAPPY.title, HAPPY.gif, HAPPY.preview),
      item,
      klipyItem(KITTEN.title, KITTEN.gif, KITTEN.preview),
    ]);

    expect(parseGifResults(answer)).toStrictEqual([HAPPY, KITTEN]);
  });

  it.each([
    ["a number", 42],
    ["null", null],
    ["no description", undefined],
    ["an object", { pl: "Kot" }],
  ])("gives a result whose description is %s an empty one", (_name, title) => {
    expect(parseGifResults(klipyAnswer([klipyItem(title, HEART.gif, HEART.preview)]))).toStrictEqual([
      { ...HEART, title: "" },
    ]);
  });

  it.each([
    ["101 characters", `${"a".repeat(GIF_TITLE_MAX_LENGTH)}b`],
    ["a control character", "Happy\u0000Cat"],
    ["a right-to-left override", "Happy \u202ECat"],
    ["a direction isolate", "Happy \u2066Cat\u2069"],
    ["only blanks", "   "],
    ["only a zero-width space", "\u200B"],
  ])("gives a result whose description is %s an empty one, as the chat would", (_name, title) => {
    expect(parseGifResults(klipyAnswer([klipyItem(title, HEART.gif, HEART.preview)]))).toStrictEqual([
      { ...HEART, title: "" },
    ]);
  });

  it("keeps a description of 100 characters, normalized as the chat sends it", () => {
    const title = "ż".repeat(GIF_TITLE_MAX_LENGTH);

    expect(parseGifResults(klipyAnswer([klipyItem(`  ${title}\n`, HEART.gif, HEART.preview)]))).toStrictEqual([
      { ...HEART, title },
    ]);
    expect(parseGifResults(klipyAnswer([klipyItem("Happy \n\n  Cat ", HEART.gif, HEART.preview)]))).toStrictEqual([
      { ...HEART, title: "Happy Cat" },
    ]);
  });

  it.each([
    ["null", null],
    ["no answer", undefined],
    ["a text", "constructor"],
    ["an array", [klipyItem(HEART.title, HEART.gif, HEART.preview)]],
    ["an object with no data", { result: true }],
    ["data that is null", { result: true, data: null }],
    ["data that is the list itself", { result: true, data: [klipyItem(HEART.title, HEART.gif, HEART.preview)] }],
    ["a list that is not an array", { result: true, data: { data: {} } }],
    ["a list that is null", { result: true, data: { data: null } }],
  ])("refuses an answer of another shape: %s", (_name, json) => {
    expect(parseGifResults(json)).toBeNull();
  });
});

describe("gifTitle", () => {
  it("is the one rule of a gif's description, for the search's results and for the chat", () => {
    expect(gifTitle(" Taniec \n radości ")).toBe("Taniec radości");
    expect(gifTitle("a".repeat(GIF_TITLE_MAX_LENGTH + 1))).toBe("");
    expect(gifTitle("Taniec\u001Bradości")).toBe("");
    expect(gifTitle(42)).toBe("");
  });
});

// The key and the word of the searches below, which no log line may hold.
const KEY = "TestKey_0123456789-abcdef";
const WORD = "tajnykotek";

// One search with a signal nobody aborts, unless the test passes its own.
function search(fetchGifs: GifFetch, signal = new AbortController().signal): Promise<GifSearchOutcome | null> {
  return searchGifs(fetchGifs, KEY, WORD, "pl", signal);
}

// A result of KLIPY's whose gif is on a host that is not KLIPY's: the screen cannot show it.
const UNSHOWABLE = klipyItem(HEART.title, "https://media.example.com/ii/a/5zt5n8Ir.webp", HEART.preview);

// A fetch that answers this, or fails with this error, and keeps every request it got.
function stubFetch(answer: () => Response | Error): {
  fetchGifs: GifFetch;
  requests: { url: string; init: RequestInit }[];
} {
  const requests: { url: string; init: RequestInit }[] = [];
  const fetchGifs: GifFetch = (url, init) => {
    requests.push({ url, init });
    const outcome = answer();
    return outcome instanceof Error ? Promise.reject(outcome) : Promise.resolve(outcome);
  };
  return { fetchGifs, requests };
}

function jsonAnswer(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

describe("searchGifs", () => {
  let consoleWarn: MockInstance<typeof console.warn>;

  beforeEach(() => {
    consoleWarn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
  });

  afterEach(() => {
    consoleWarn.mockRestore();
  });

  function logged(): string {
    return consoleWarn.mock.calls.map((call) => format(...(call as unknown[]))).join("\n");
  }

  it("gives KLIPY's results for the word", async () => {
    const { fetchGifs, requests } = stubFetch(() =>
      jsonAnswer(
        klipyAnswer([
          klipyItem(HEART.title, HEART.gif, HEART.preview),
          klipyItem(KITTEN.title, KITTEN.gif, KITTEN.preview),
        ]),
      ),
    );

    const outcome = await search(fetchGifs);

    expect(outcome).toStrictEqual({ kind: "results", results: [HEART, KITTEN] });
    expect(requests).toHaveLength(1);
    const url = new URL(requests[0].url);
    expect(`${url.origin}${url.pathname}`).toBe(`https://api.klipy.com/api/v1/${KEY}/gifs/search`);
    expect(url.searchParams.get("q")).toBe(WORD);
    expect(url.searchParams.get("content_filter")).toBe("high");
    expect(consoleWarn).not.toHaveBeenCalled();
  });

  it("asks with no cookie and no Referer, on the caller's signal", async () => {
    const { fetchGifs, requests } = stubFetch(() => jsonAnswer(klipyAnswer([])));
    const { signal } = new AbortController();

    await search(fetchGifs, signal);

    const { init } = requests[0];
    expect(init.credentials).toBe("omit");
    expect(init.referrerPolicy).toBe("no-referrer");
    expect(init.signal).toBe(signal);
  });

  it("gives none for an answer with no results", async () => {
    const { fetchGifs } = stubFetch(() => jsonAnswer(klipyAnswer([])));

    expect(await search(fetchGifs)).toStrictEqual({ kind: "empty" });
    expect(consoleWarn).not.toHaveBeenCalled();
  });

  it("gives none for an answer whose only result is an ad", async () => {
    const { fetchGifs } = stubFetch(() =>
      jsonAnswer(klipyAnswer([klipyItem(HEART.title, HEART.gif, HEART.preview, "ad")])),
    );

    expect(await search(fetchGifs)).toStrictEqual({ kind: "empty" });
  });

  it.each([
    ["no result it can show", [UNSHOWABLE]],
    ["only gifs it cannot show, and an ad", [UNSHOWABLE, klipyItem(HAPPY.title, HAPPY.gif, HAPPY.preview, "ad")]],
    ["a gif with no file at all", [{ type: "gif", title: HEART.title }]],
  ])("fails, not as no gifs for the word, on an answer with %s", async (_name, items) => {
    const { fetchGifs } = stubFetch(() => jsonAnswer(klipyAnswer(items)));

    expect(await search(fetchGifs)).toStrictEqual({ kind: "failed", failure: "error" });
    expect(consoleWarn).toHaveBeenCalledTimes(1);
    expect(logged()).toContain("file");
  });

  it("gives the results it can show when KLIPY's answer has others too, with no log line", async () => {
    const { fetchGifs } = stubFetch(() =>
      jsonAnswer(klipyAnswer([UNSHOWABLE, klipyItem(KITTEN.title, KITTEN.gif, KITTEN.preview)])),
    );

    expect(await search(fetchGifs)).toStrictEqual({ kind: "results", results: [KITTEN] });
    expect(consoleWarn).not.toHaveBeenCalled();
  });

  it("fails on KLIPY's limit for the hour (429)", async () => {
    const { fetchGifs } = stubFetch(() => jsonAnswer({ result: false }, 429));

    expect(await search(fetchGifs)).toStrictEqual({ kind: "failed", failure: "limit" });
  });

  it.each([
    ["another status of KLIPY's (500)", () => jsonAnswer({ result: false }, 500)],
    ["a refused key (401)", () => jsonAnswer({ result: false }, 401)],
    ["no network", () => new TypeError("Failed to fetch")],
    ["the timeout", () => new DOMException("The operation timed out.", "TimeoutError")],
    ["an answer that is no JSON", () => new Response("<html>KLIPY</html>", { status: 200 })],
    ["an answer of another shape", () => jsonAnswer({ result: true, data: [] })],
  ])("fails on %s, not as the limit", async (_name, answer) => {
    const { fetchGifs } = stubFetch(answer);

    expect(await search(fetchGifs)).toStrictEqual({ kind: "failed", failure: "error" });
  });

  it.each([
    ["the limit", () => jsonAnswer({ result: false, message: `${KEY} ${WORD}` }, 429)],
    ["another status", () => jsonAnswer({ result: false }, 500)],
    ["no network", () => new TypeError(`fetch failed: https://api.klipy.com/api/v1/${KEY}/gifs/search?q=${WORD}`)],
    ["the timeout", () => new DOMException("The operation timed out.", "TimeoutError")],
    ["an answer that is no JSON", () => new Response(`<html>${WORD}</html>`, { status: 200 })],
    ["an answer of another shape", () => jsonAnswer({ result: true, data: { data: WORD } })],
    [
      "results none of which can be shown",
      () => jsonAnswer(klipyAnswer([klipyItem(WORD, `https://media.example.com/${KEY}/${WORD}.webp`, HEART.preview)])),
    ],
  ])("logs a failure on %s as one line with neither the word, the key nor an address", async (_name, answer) => {
    const { fetchGifs } = stubFetch(answer);

    await search(fetchGifs);

    expect(consoleWarn).toHaveBeenCalledTimes(1);
    const line = logged();
    expect(line).toContain("gif_search");
    expect(line).not.toContain(KEY);
    expect(line).not.toContain(WORD);
    expect(line).not.toContain("klipy");
    expect(line).not.toContain("http");
  });

  it("ends with nothing and no log line when the caller gave the search up on its way", async () => {
    const controller = new AbortController();
    const { fetchGifs } = stubFetch(() => {
      controller.abort();
      return new DOMException("The operation was aborted.", "AbortError");
    });

    expect(await search(fetchGifs, controller.signal)).toBeNull();
    expect(consoleWarn).not.toHaveBeenCalled();
  });

  it("ends with nothing and no log line when the caller gave the search up while its answer came", async () => {
    const controller = new AbortController();
    const aborting: GifFetch = () => {
      controller.abort();
      const res = jsonAnswer(klipyAnswer([]));
      return Promise.resolve(
        Object.assign(res, {
          json: () => Promise.reject(new DOMException("The operation was aborted.", "AbortError")),
        }),
      );
    };

    expect(await search(aborting, controller.signal)).toBeNull();
    expect(consoleWarn).not.toHaveBeenCalled();
  });

  it("counts an abort by the timeout a failure, and logs it", async () => {
    const controller = new AbortController();
    const timedOut = new DOMException("The gif search took too long.", "TimeoutError");
    const { fetchGifs } = stubFetch(() => {
      controller.abort(timedOut);
      return timedOut;
    });

    expect(await search(fetchGifs, controller.signal)).toStrictEqual({ kind: "failed", failure: "error" });
    expect(consoleWarn).toHaveBeenCalledTimes(1);
    expect(logged()).toContain("TimeoutError");
  });
});

describe("runGifSearch", () => {
  let consoleWarn: MockInstance<typeof console.warn>;

  beforeEach(() => {
    vi.useFakeTimers();
    consoleWarn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
  });

  afterEach(() => {
    consoleWarn.mockRestore();
    vi.useRealTimers();
  });

  // A KLIPY that never answers: the request ends only when its signal is aborted, with the signal's reason, as a
  // browser's fetch does. Keeps the signal it got.
  function silentKlipy(): { fetchGifs: GifFetch; signal: () => AbortSignal } {
    let got: AbortSignal | undefined;
    const fetchGifs: GifFetch = (_url, init) => {
      const signal = init.signal ?? undefined;
      got = signal;
      return new Promise((_resolve, reject) => {
        signal?.addEventListener("abort", () => {
          reject(signal.reason as Error);
        });
      });
    };
    return {
      fetchGifs,
      signal: () => {
        if (got === undefined) throw new Error("no request yet");
        return got;
      },
    };
  }

  it("gives a search KLIPY does not answer up as a failure after GIF_SEARCH_TIMEOUT_MS, not before", async () => {
    const { fetchGifs, signal } = silentKlipy();
    const onOutcome = vi.fn<(outcome: GifSearchOutcome) => void>();

    runGifSearch(fetchGifs, KEY, WORD, "pl", onOutcome);
    await vi.advanceTimersByTimeAsync(GIF_SEARCH_TIMEOUT_MS - 1);

    expect(signal().aborted).toBe(false);
    expect(onOutcome).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(1);

    expect(signal().aborted).toBe(true);
    expect(onOutcome).toHaveBeenCalledTimes(1);
    expect(onOutcome).toHaveBeenCalledWith({ kind: "failed", failure: "error" });
    expect(consoleWarn).toHaveBeenCalledTimes(1);
  });

  it("aborts a cancelled search's request and ends it with no outcome and no log line", async () => {
    const { fetchGifs, signal } = silentKlipy();
    const onOutcome = vi.fn<(outcome: GifSearchOutcome) => void>();

    const cancel = runGifSearch(fetchGifs, KEY, WORD, "pl", onOutcome);
    cancel();
    await vi.advanceTimersByTimeAsync(GIF_SEARCH_TIMEOUT_MS * 2);

    expect(signal().aborted).toBe(true);
    expect(onOutcome).not.toHaveBeenCalled();
    expect(consoleWarn).not.toHaveBeenCalled();
  });

  it("hands KLIPY's answer over once, and neither the timer nor a later cancel aborts anything", async () => {
    const { fetchGifs, requests } = stubFetch(() =>
      jsonAnswer(klipyAnswer([klipyItem(HEART.title, HEART.gif, HEART.preview)])),
    );
    const onOutcome = vi.fn<(outcome: GifSearchOutcome) => void>();

    const cancel = runGifSearch(fetchGifs, KEY, WORD, "pl", onOutcome);
    await vi.advanceTimersByTimeAsync(0);

    expect(onOutcome).toHaveBeenCalledTimes(1);
    expect(onOutcome).toHaveBeenCalledWith({ kind: "results", results: [HEART] });
    expect(vi.getTimerCount()).toBe(0);

    await vi.advanceTimersByTimeAsync(GIF_SEARCH_TIMEOUT_MS);
    cancel();

    expect(requests[0].init.signal?.aborted).toBe(false);
    expect(onOutcome).toHaveBeenCalledTimes(1);
  });
});

describe("gifSearchToRun", () => {
  const RESULTS = [HEART];

  it.each<[string, GifSearch]>([
    ["nothing asked yet", { state: "idle" }],
    ["the same word failed (the limit)", { state: "failed", query: "kot", failure: "limit" }],
    ["the same word failed", { state: "failed", query: "kot", failure: "error" }],
    ["another word's results on the screen", { state: "results", query: "pies", results: RESULTS }],
    ["another word on its way", { state: "loading", query: "pies" }],
    ["no results for another word", { state: "empty", query: "pies" }],
  ])("asks KLIPY for the word after %s", (_name, current) => {
    expect(gifSearchToRun(" kot ", current)).toBe("kot");
  });

  it.each<[string, GifSearch]>([
    ["its results on the screen", { state: "results", query: "kot", results: RESULTS }],
    ["it on its way", { state: "loading", query: "kot" }],
    ["no results for it", { state: "empty", query: "kot" }],
  ])("asks nothing for the same word, with %s", (_name, current) => {
    expect(gifSearchToRun("  kot\n", current)).toBeNull();
  });

  it.each<[string, GifSearch]>([
    ["nothing asked yet", { state: "idle" }],
    ["results on the screen", { state: "results", query: "kot", results: RESULTS }],
    ["a failure", { state: "failed", query: "kot", failure: "error" }],
  ])("asks nothing for a field of only blanks, after %s", (_name, current) => {
    expect(gifSearchToRun(" \n\t ", current)).toBeNull();
    expect(gifSearchToRun("", current)).toBeNull();
  });
});
