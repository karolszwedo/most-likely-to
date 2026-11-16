import { existsSync, readFileSync, statSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { LINK_PREVIEW } from "@/components/room/game-intro";

// The game's icon and manifest (home-screen-icon, S-21, FR-027): a phone can add the game to its home screen from the
// browser's menu, and the icon's 512 px file is fit for Google Play. Red when the manifest or the icon files stop
// meeting Chrome's install criteria, Google Play's icon spec or Karol's choices, also after a file is renamed or drawn
// again at a wrong size. Oracle, written out here and never taken from the code: Chrome's criteria (name or
// short_name, a 192 and a 512 px icon, start_url, display, no prefer_related_applications; a maskable icon
// recommended), Google Play's spec (512×512, 32-bit PNG with alpha, at most 1024 KB), the iPhone's 180 px
// apple-touch-icon, and Karol's picks: the name "Most Likely To" under the icon (N1) and the game's dark background
// #1a1a1a (join-page-ui). Sources in context/changes/home-screen-icon/change.md.
// The sizes come from each PNG's own header (IHDR), read here without an image library.

const PUBLIC = new URL("../../public/", import.meta.url);
const LAYOUT = new URL("../../src/layouts/Layout.astro", import.meta.url);

interface ManifestIcon {
  src: string;
  sizes: string;
  type: string;
  purpose?: string;
}

const manifest = JSON.parse(readFileSync(new URL("manifest.webmanifest", PUBLIC), "utf8")) as Record<string, unknown>;
const icons = (manifest.icons ?? []) as ManifestIcon[];

// A file of public/ by its address on the site ("/icons/icon-512.png").
const publicFile = (path: string) => new URL(path.replace(/^\//, ""), PUBLIC);

// Width, height and colour type from a PNG's header; null when the file is no PNG.
function pngHeader(path: string): { width: number; height: number; colorType: number } | null {
  const bytes = readFileSync(publicFile(path));
  const signature = "89504e470d0a1a0a";
  if (bytes.subarray(0, 8).toString("hex") !== signature || bytes.subarray(12, 16).toString("ascii") !== "IHDR") {
    return null;
  }
  return { width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20), colorType: bytes.readUInt8(25) };
}

const size = (path: string) => {
  const header = pngHeader(path);
  return header && `${header.width}x${header.height}`;
};

describe("the game's manifest", () => {
  it("carries the game's name under the icon (Karol's N1)", () => {
    expect(manifest.name).toBe("Most Likely To");
    expect(manifest.short_name).toBe("Most Likely To");
  });

  it("opens the game's home page on its own, without the browser's bar", () => {
    expect(manifest.start_url).toBe("/");
    expect(manifest.scope).toBe("/");
    expect(manifest.display).toBe("standalone");
  });

  it("does not send the phone to an app store instead", () => {
    expect(manifest.prefer_related_applications ?? false).toBe(false);
  });

  it("has the game's dark background for the bar and the start screen", () => {
    expect(manifest.theme_color).toBe("#1a1a1a");
    expect(manifest.background_color).toBe("#1a1a1a");
  });
});

describe("the icons of the manifest", () => {
  it.each(["192x192", "512x512"])("has a PNG icon of %s", (sizes) => {
    expect(icons.some((icon) => icon.sizes === sizes && icon.type === "image/png")).toBe(true);
  });

  it("has a maskable 512x512 icon, which Android cuts to its own shape", () => {
    const maskable = icons.filter((icon) => (icon.purpose ?? "any").split(" ").includes("maskable"));
    expect(maskable.map((icon) => icon.sizes)).toContain("512x512");
  });

  it.each(icons.map((icon) => [icon.src, icon.sizes]))("%s is a PNG of %s", (src, sizes) => {
    expect(existsSync(publicFile(src))).toBe(true);
    expect(size(src)).toBe(sizes);
  });
});

describe("the icon files outside the manifest", () => {
  it.each([
    ["/apple-touch-icon.png", "180x180"],
    ["/favicon.png", "32x32"],
  ])("%s is a PNG of %s", (path, sizes) => {
    expect(size(path)).toBe(sizes);
  });

  it("the 512 px icon fits Google Play: a 32-bit PNG with alpha, at most 1024 KB", () => {
    expect(pngHeader("/icons/icon-512.png")?.colorType).toBe(6);
    expect(statSync(publicFile("/icons/icon-512.png")).size).toBeLessThanOrEqual(1024 * 1024);
  });
});

describe("the pages' <head>", () => {
  // Every local address in a <link> of Layout.astro: the manifest, the icons.
  const hrefs = [...readFileSync(LAYOUT, "utf8").matchAll(/<link\b[^>]*\bhref="(\/[^"]*)"/g)].map(([, href]) => href);

  it("points at the manifest and the iPhone's icon", () => {
    expect(hrefs).toContain("/manifest.webmanifest");
    expect(hrefs).toContain("/apple-touch-icon.png");
  });

  it.each(hrefs)("%s is a file of public/", (href) => {
    expect(existsSync(publicFile(href))).toBe(true);
  });

  it("gives the link's card a square picture that exists", () => {
    const header = pngHeader(LINK_PREVIEW.image);
    expect(header).not.toBeNull();
    expect(header?.width).toBe(header?.height);
  });
});
