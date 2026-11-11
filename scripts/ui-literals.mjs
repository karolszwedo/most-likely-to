// Literal scan from /10x-ui: palette classes, colour functions, hex colours and arbitrary px/rem values in views
// that are already on design tokens. Runs as part of `npm run lint` (and so in CI); exits 1 on any hit.
// When another view is moved onto tokens, add its files to VIEWS. Zero dependencies on purpose.
import { readFileSync, readdirSync } from "node:fs";

const AUTH_DIR = "src/components/auth";
const ROOM_DIR = "src/components/room";
const VIEWS = [
  "src/pages/auth/signin.astro",
  "src/pages/dev/ui-kitchen-sink.astro",
  "src/pages/dev/room-states.astro",
  "src/pages/dev/room-window.astro",
  ...readdirSync(AUTH_DIR).map((name) => `${AUTH_DIR}/${name}`),
  "src/pages/index.astro",
  "src/pages/gry.astro",
  "src/pages/r/[id].astro",
  "src/pages/j/[token].astro",
  ...readdirSync(ROOM_DIR).map((name) => `${ROOM_DIR}/${name}`),
];

// Same pattern as the hard-coded values scan in .claude/skills/10x-ui/SKILL.md.
const LITERAL =
  /#[0-9a-fA-F]{3,8}\b|rgba?\(|hsla?\(|oklch\(|-\[[0-9.]+(px|rem)\]|\b(bg|text|border|ring|outline|from|via|to|fill|stroke|shadow|divide)-(slate|gray|zinc|neutral|stone|red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose|white|black)\b/;

let hits = 0;
for (const file of VIEWS) {
  readFileSync(file, "utf8")
    .split(/\r?\n/)
    .forEach((line, index) => {
      if (LITERAL.test(line)) {
        hits += 1;
        console.error(`${file}:${index + 1}: ${line.trim()}`);
      }
    });
}

if (hits > 0) {
  console.error(
    `\nui-literals: ${hits} literal(s) in token-based views. Use tokens from src/styles/global.css (AGENTS.md, "## UI").`,
  );
  process.exit(1);
}
console.log(`ui-literals: 0 literals in ${VIEWS.length} view files`);
