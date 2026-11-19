// Font check after `astro build` (game-restyle, S-25). When the fetch of Manrope from Fontsource fails, Astro only
// warns and builds on with the fallback font (system-ui), so without this check CI and Workers Builds would be green
// and production would lose the game's font. `npm run build` runs it (also in CI and in Workers Builds, before the
// deploy); exits 1 when the font files are missing. Expected at least 2 .woff2 files: the `latin` and `latin-ext`
// subsets (Polish letters). The directory is where @astrojs/cloudflare puts the static files (dist/client).
// Pattern: scripts/check-fonts.mjs of Karol's planer. Zero dependencies on purpose.
import { readdirSync } from "node:fs";

const DIR = "dist/client/_astro/fonts";
const MIN = 2;

let files = [];
try {
  files = readdirSync(DIR).filter((file) => file.endsWith(".woff2"));
} catch (error) {
  // No directory means the build wrote no font at all; any other failure is not ours to hide.
  if (error.code !== "ENOENT") throw error;
}

if (files.length < MIN) {
  console.error(
    `check-fonts: ${files.length} .woff2 file(s) in ${DIR}, expected at least ${MIN} (latin + latin-ext). ` +
      "The build did not fetch Manrope from Fontsource; see the astro build warnings above.",
  );
  process.exit(1);
}
console.log(`check-fonts: ${files.length} .woff2 files in ${DIR}`);
