import { describe, expect, it } from "vitest";
import { GIF_TITLE_MAX_LENGTH, GIF_URL_MAX_LENGTH, isKlipyMediaUrl } from "@/lib/rooms/gifs";

// S-24 (PRD FR-028): a gif on the room's chat. The oracle is Karol's decision 3 of 2026-11-17
// (context/changes/room-chat-gifs/plan.md): the game shows only images from KLIPY's servers, whose media hosts KLIPY
// names (docs.klipy.com/network-requirements.md, 2026-11-17: static.klipy.com, static1.klipy.com, static2.klipy.com,
// over https), and KLIPY forbids changing its addresses, so the Worker and a screen take an address exactly as KLIPY
// gave it or refuse it, never rewrite it (plan, Critical Implementation Details); up to 512 characters, and a
// description up to 100 (plan, Faza 2 #1). The hosts and every address are written out by hand, never from the module's
// list.

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
