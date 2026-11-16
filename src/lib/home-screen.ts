// Which phone the line about the game's icon on / speaks to (home-screen-icon, HomeScreenHint): Android adds a page to
// the home screen from the browser's menu, an iPhone through "Udostępnij". Anything else (a computer, an iPad that
// presents itself as a Mac, no header) gets no line. The server reads only the User-Agent header for this and keeps
// nothing; the game opened from its icon hides the line by CSS (display-mode: standalone), which the server cannot see.
export type HomeScreenPlatform = "android" | "ios";

export function homeScreenPlatform(userAgent: string | null): HomeScreenPlatform | null {
  if (!userAgent) return null;
  if (userAgent.includes("Android")) return "android";
  if (userAgent.includes("iPhone")) return "ios";
  return null;
}
