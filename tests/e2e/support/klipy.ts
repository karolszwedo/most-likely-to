// KLIPY in the browser without KLIPY (room-chat-gifs, plan Faza 3 #5): every request a browser context makes to a
// KLIPY host is answered here and never leaves the runner, so CI calls neither KLIPY's API (the test key's 100
// searches an hour, and CI has only a fake key) nor its media. The API answers a search with a trimmed real answer, or
// with 429 as when the key's searches for the hour are used up; a media host answers a tiny image made here; any other
// KLIPY host is refused. The page on http://localhost asks KLIPY's API across origins, so the answer carries
// access-control-allow-origin: *, and the screen's request (credentials "omit", no custom headers) is a simple one with
// no preflight, which route.fulfill passes through the browser's CORS check. Every request is kept with all the headers
// the browser sent (request.allHeaders(): request.headers() leaves out Referer and Cookie in Chromium), for the test's
// checks that nothing of the game goes to KLIPY.

import type { BrowserContext } from "@playwright/test";

// KLIPY's hosts as KLIPY's documentation names them (docs.klipy.com/network-requirements.md, 2026-11-17), written out
// here, not taken from src/lib/rooms/gifs.ts: the API, and the media host of every address in the answer below.
const API_HOST = "api.klipy.com";
const MEDIA_HOST = "static.klipy.com";

// A gif of the real search of 2026-11-18 (the word "kot", plan Faza 3 #2), trimmed to the fields the screen reads:
// KLIPY's id and title, and the webp files sm (the chat's gif) and xs (the search's preview) as KLIPY gave them.
interface KlipyFile {
  url: string;
  width: number;
  height: number;
}

export interface KlipyGif {
  id: number;
  title: string;
  sm: KlipyFile;
  xs: KlipyFile;
}

// The first four results of that answer, in KLIPY's order, their addresses on static.klipy.com as they came.
export const KLIPY_GIFS: readonly KlipyGif[] = [
  {
    id: 8679151651012575,
    title: "Happy Cat",
    sm: {
      url: "https://static.klipy.com/ii/0db853ad1d7f196f1b7a6eb9ab617a5a/c3/0d/hPuTSGxEmDebDCm.webp",
      width: 165,
      height: 258,
    },
    xs: {
      url: "https://static.klipy.com/ii/0db853ad1d7f196f1b7a6eb9ab617a5a/c3/0d/VZRcalb07TNnNmlK5.webp",
      width: 58,
      height: 90,
    },
  },
  {
    id: 7020571319511840,
    title: "Cute Cat Makes Heart with Paws",
    sm: {
      url: "https://static.klipy.com/ii/8ce8357c78ea940b9c2015daf05ce1a5/26/7e/5zt5n8Ir.webp",
      width: 220,
      height: 215,
    },
    xs: {
      url: "https://static.klipy.com/ii/8ce8357c78ea940b9c2015daf05ce1a5/26/7e/vd3o5SmH.webp",
      width: 90,
      height: 88,
    },
  },
  {
    id: 4215521251273678,
    title: "Tole Tole Mei Mei",
    sm: {
      url: "https://static.klipy.com/ii/4493325008d34b7bf8cd6813cd5c1619/71/6b/2wxssB1ubkEsQ2.webp",
      width: 220,
      height: 241,
    },
    xs: {
      url: "https://static.klipy.com/ii/4493325008d34b7bf8cd6813cd5c1619/71/6b/SXlR1SdDTCirWrhS.webp",
      width: 83,
      height: 90,
    },
  },
  {
    id: 2769044477738946,
    title: "Adorable White Kitten",
    sm: {
      url: "https://static.klipy.com/ii/f87f46a2c5aeaeed4c68910815f73eaf/ad/57/Pn95Tfic.webp",
      width: 220,
      height: 391,
    },
    xs: {
      url: "https://static.klipy.com/ii/f87f46a2c5aeaeed4c68910815f73eaf/ad/57/9CjI6sca.webp",
      width: 51,
      height: 90,
    },
  },
];

// KLIPY's answer to a search in the shape of the real one ({ result, data: { data: [ … ], has_next } }).
const SEARCH_ANSWER = {
  result: true,
  data: {
    data: KLIPY_GIFS.map(({ id, title, sm, xs }) => ({
      id,
      type: "gif",
      title,
      file: { sm: { webp: sm }, xs: { webp: xs } },
    })),
    has_next: true,
  },
};

// The answer of 429, as KLIPY's limit for the hour gives it to the screen: only the status counts there.
const LIMIT_ANSWER = { result: false };

// Every media file is this image: a transparent GIF of 1×1 pixels, made here, never fetched. The browser decodes it by
// its bytes, whatever the address's extension says.
const TINY_IMAGE = Buffer.from("R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7", "base64");

const CORS = { "access-control-allow-origin": "*" };

function isKlipyHost(url: URL): boolean {
  return url.hostname === "klipy.com" || url.hostname.endsWith(".klipy.com");
}

// One request the context made to a KLIPY host: a search on the API (…/gifs/search), another call to the API (a test's
// own), a media file, or a request to another KLIPY host, which was refused.
export interface KlipyRequest {
  kind: "search" | "api" | "media" | "other";
  url: URL;
  // Every header the browser sent, lower-cased (request.allHeaders()).
  headers: Readonly<Record<string, string>>;
}

export interface KlipyStub {
  // Every request to KLIPY in the order the context made it.
  readonly requests: readonly KlipyRequest[];
  // What the API answers from now on: the search's results (the default), or 429.
  answer(kind: "results" | "limit"): void;
}

// Call on a context before its pages load anything, so no request of its pages ever reaches KLIPY.
export async function stubKlipy(context: BrowserContext): Promise<KlipyStub> {
  const requests: KlipyRequest[] = [];
  let answer: "results" | "limit" = "results";
  await context.route(isKlipyHost, async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    // Read before the answer: Playwright gives a routed request's headers at once (from the paused request), so this
    // never waits for the network.
    const headers = await request.allHeaders();
    if (url.hostname === API_HOST) {
      requests.push({ kind: url.pathname.endsWith("/gifs/search") ? "search" : "api", url, headers });
      await route.fulfill(
        answer === "limit"
          ? { status: 429, headers: CORS, json: LIMIT_ANSWER }
          : { status: 200, headers: CORS, json: SEARCH_ANSWER },
      );
      return;
    }
    if (url.hostname === MEDIA_HOST) {
      requests.push({ kind: "media", url, headers });
      await route.fulfill({ status: 200, contentType: "image/gif", body: TINY_IMAGE });
      return;
    }
    requests.push({ kind: "other", url, headers });
    await route.abort("blockedbyclient");
  });
  return {
    requests,
    answer(kind) {
      answer = kind;
    },
  };
}
