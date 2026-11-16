import { describe, expect, it } from "vitest";
import { homeScreenPlatform } from "@/lib/home-screen";

// Which phone the line about the game's icon on / speaks to (home-screen-icon, phase 2). Oracle: real User-Agent
// headers of the browsers below, copied as each one sends them, and Karol's pick (16.11.2026): the line only on a phone,
// with Android's text on Android and the iPhone's on an iPhone; nothing on a computer. An iPad presents itself as a Mac
// in Safari, so it gets nothing either, like a computer.
const ANDROID_CHROME =
  "Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/142.0.0.0 Mobile Safari/537.36";
const ANDROID_SAMSUNG =
  "Mozilla/5.0 (Linux; Android 14; SAMSUNG SM-S921B) AppleWebKit/537.36 (KHTML, like Gecko) SamsungBrowser/28.0 Chrome/130.0.0.0 Mobile Safari/537.36";
const IPHONE_SAFARI =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 18_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.6 Mobile/15E148 Safari/604.1";
const IPHONE_CHROME =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 18_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/142.0.7444.46 Mobile/15E148 Safari/604.1";
const WINDOWS_CHROME =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/142.0.0.0 Safari/537.36";
const MAC_SAFARI =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.6 Safari/605.1.15";
// Safari on an iPad sends the same header as Safari on a Mac.
const IPAD_SAFARI = MAC_SAFARI;

describe("homeScreenPlatform", () => {
  it.each([
    { browser: "Chrome on Android", userAgent: ANDROID_CHROME, platform: "android" },
    { browser: "Samsung Internet on Android", userAgent: ANDROID_SAMSUNG, platform: "android" },
    { browser: "Safari on an iPhone", userAgent: IPHONE_SAFARI, platform: "ios" },
    { browser: "Chrome on an iPhone", userAgent: IPHONE_CHROME, platform: "ios" },
    { browser: "Chrome on Windows", userAgent: WINDOWS_CHROME, platform: null },
    { browser: "Safari on a Mac", userAgent: MAC_SAFARI, platform: null },
    { browser: "Safari on an iPad", userAgent: IPAD_SAFARI, platform: null },
    { browser: "no header", userAgent: null, platform: null },
    { browser: "an empty header", userAgent: "", platform: null },
  ])("$browser gets $platform", ({ userAgent, platform }) => {
    expect(homeScreenPlatform(userAgent)).toBe(platform);
  });
});
