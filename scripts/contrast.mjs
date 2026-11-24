// Token contrast guard (game-restyle, S-25): reads the game's palette from src/styles/global.css, turns its oklch
// colours into sRGB and checks the WCAG 2 contrast ratio of every pair in PAIRS. Exits 1 when a pair falls below its
// threshold. `npm run lint` runs it (so does CI), so no change of a token can make text or a focus ring hard to see
// without the gate going red. Pattern: scripts/contrast.mjs of Karol's planer. Zero dependencies on purpose.
//
// The game is always dark (class="dark" on <html>, src/layouts/Layout.astro), so the palette on screen is :root with
// .dark on top: both match <html> with the same specificity and .dark comes later in the file. The script applies the
// blocks the same way, in file order. A colour with a slash is drawn with that opacity, as the classes do it
// (ring-ring/50 → "ring/50", bg-primary/35 → "primary/35"), mixed onto what lies under it in sRGB, as the browser does.
import { readFileSync } from "node:fs";
import path from "node:path";

const CSS_FILE = path.join(import.meta.dirname, "..", "src", "styles", "global.css");

const TEXT = 4.5; // text (WCAG 1.4.3)
const UI = 3; // an input's outline, the focus ring, a player's dot (WCAG 1.4.11)

const PLAYERS = Array.from({ length: 20 }, (_, index) => `chart-${index + 1}`);

// [front, back, threshold]. The back is one token, or a list of tokens laid from the bottom up on the page's
// background (["card", "primary/35"]: a bar of 35% primary on a card). A new colour token, or a new "text on a surface"
// combination in a view, gets its row here (AGENTS.md, "## UI").
const PAIRS = [
  ["foreground", "background", TEXT],
  ["card-foreground", "card", TEXT],
  ["popover-foreground", "popover", TEXT],
  ["foreground", "muted", TEXT],
  ["foreground", "accent", TEXT],
  ["muted-foreground", "background", TEXT],
  ["muted-foreground", "card", TEXT],
  // A field's placeholder on the field's own background (input.tsx, textarea.tsx, input-group.tsx: bg-muted).
  ["muted-foreground", "muted", TEXT],
  // The white label on a Blurple button, also under the pointer (button.tsx: hover:bg-primary/90).
  ["primary-foreground", "primary", TEXT],
  ["primary-foreground", "primary/90", TEXT],
  ["secondary-foreground", "secondary", TEXT],
  ["accent-foreground", "accent", TEXT],
  // Blurple as text and links (text-primary-text: button and badge "link", the dev pages' links); never text-primary.
  // On accent it is also the chosen vote's radio (RADIO in RoundVoting.tsx: accent-primary-text on the chosen tile's
  // bg-accent), held here to the stricter text threshold.
  ["primary-text", "background", TEXT],
  ["primary-text", "card", TEXT],
  ["primary-text", "muted", TEXT],
  ["primary-text", "accent", TEXT],
  ["destructive", "background", TEXT],
  ["destructive", "card", TEXT],
  // The white label of a destructive button on a card ("Usuń grę", DeleteGameButton.tsx: dark:bg-destructive/60).
  ["primary-foreground", ["card", "destructive/60"], TEXT],
  // The bars of "Paski" behind a nick in the reveal's table (RoundReveal.tsx: bg-primary/35 for the top, /20 the rest).
  ["foreground", ["card", "primary/35"], TEXT],
  ["foreground", ["card", "primary/20"], TEXT],
  // The focus ring as the components draw it: ring-ring/50 (button.tsx, input.tsx, CHOICE_ROW in RoundVoting.tsx), on
  // every surface a focusable thing stands on.
  ["ring/50", "background", UI],
  ["ring/50", "card", UI],
  ["ring/50", "muted", UI],
  ["ring/50", "accent", UI],
  // A row of the language switch's menu (LanguageSwitch.tsx).
  ["ring/50", "popover", UI],
  // A field's outline (border-input) on the page, a card, its own background and a secondary surface.
  ["input", "background", UI],
  ["input", "card", UI],
  ["input", "muted", UI],
  ["input", "secondary", UI],
  // The players' colours: the pie's slices, the dots and the emotes' outlines (src/components/room/chart-colors.ts).
  ...PLAYERS.map((name) => [name, "card", UI]),
  ...PLAYERS.map((name) => [name, "background", UI]),
];

// --- Reading the tokens ---

// `:root {` or `.dark {` at the start of a line; the variant `@custom-variant dark (&:is(.dark *))` does not match.
const BLOCK = /^\s*(:root|\.dark)\s*\{([^}]*)\}/gm;

function readTokens(css) {
  const source = css.replace(/\/\*[\s\S]*?\*\//g, "");
  const tokens = {};
  let dark = 0;
  for (const [, selector, body] of source.matchAll(BLOCK)) {
    if (selector === ".dark") dark += 1;
    for (const [, name, value] of body.matchAll(/--([\w-]+)\s*:\s*([^;]+);/g)) {
      tokens[name] = value.trim();
    }
  }
  if (dark === 0) throw new Error(`No .dark block in ${CSS_FILE}: the game's palette lives there`);
  return tokens;
}

// --- Colour: OKLCH → OKLab → XYZ (D65) → linear sRGB → sRGB (matrices from CSS Color 4) ---

function multiply(matrix, vector) {
  return matrix.map((row) => row[0] * vector[0] + row[1] * vector[1] + row[2] * vector[2]);
}

const OKLAB_TO_LMS = [
  [1, 0.3963377773761749, 0.2158037573099136],
  [1, -0.1055613458156586, -0.0638541728258133],
  [1, -0.0894841775298119, -1.2914855480194092],
];
const LMS_TO_XYZ = [
  [1.2268798758459243, -0.5578149944602171, 0.2813910456659647],
  [-0.0405757452148008, 1.112286803280317, -0.0717110580655164],
  [-0.0763729366746601, -0.4214933324022432, 1.5869240198367816],
];
const XYZ_TO_LINEAR_SRGB = [
  [3.2409699419045226, -1.537383177570094, -0.4986107602930034],
  [-0.9692436362808796, 1.8759675015077202, 0.04155505740717559],
  [0.05563007969699366, -0.20397695888897652, 1.0569715142428786],
];

function number(text, percentScale) {
  if (text === "none") return 0;
  if (text.endsWith("%")) return (parseFloat(text) / 100) * percentScale;
  return parseFloat(text);
}

// oklch(L C H) or oklch(L C H / A) → { rgb: [r, g, b] in sRGB 0–1 (clipped to the gamut), alpha }
function parseOklch(name, value) {
  const match = /^oklch\(\s*([^\s/]+)\s+([^\s/]+)\s+([^\s/]+)\s*(?:\/\s*([^\s)]+)\s*)?\)$/.exec(value);
  if (!match) throw new Error(`--${name}: expected oklch(…), found "${value}"`);
  const lightness = number(match[1], 1);
  const chroma = number(match[2], 0.4);
  const hue = (number(match[3].replace(/deg$/, ""), 1) * Math.PI) / 180;
  const alpha = match[4] === undefined ? 1 : number(match[4], 1);
  const lab = [lightness, chroma * Math.cos(hue), chroma * Math.sin(hue)];
  const lms = multiply(OKLAB_TO_LMS, lab).map((c) => c ** 3);
  const linear = multiply(XYZ_TO_LINEAR_SRGB, multiply(LMS_TO_XYZ, lms));
  const rgb = linear.map((c) => {
    const encoded =
      Math.sign(c) * (Math.abs(c) <= 0.0031308 ? 12.92 * Math.abs(c) : 1.055 * Math.abs(c) ** (1 / 2.4) - 0.055);
    return Math.min(1, Math.max(0, encoded));
  });
  return { rgb, alpha };
}

// A colour with its alpha laid onto an opaque backdrop (mixed in sRGB, as the browser does).
function over(color, backdrop) {
  return color.rgb.map((c, i) => c * color.alpha + backdrop[i] * (1 - color.alpha));
}

function luminance(rgb) {
  const [r, g, b] = rgb.map((c) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function ratio(a, b) {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

// --- The pairs ---

const tokens = readTokens(readFileSync(CSS_FILE, "utf8"));

// "ring/50" → --ring at 50% of its own opacity
function layer(spec) {
  const [name, percent] = spec.split("/");
  if (!(name in tokens)) throw new Error(`No token --${name} in ${CSS_FILE}`);
  const color = parseOklch(name, tokens[name]);
  return percent === undefined ? color : { ...color, alpha: color.alpha * (Number(percent) / 100) };
}

// The page's background lies on the browser's dark canvas; everything else lies on the page.
const page = over(layer("background"), [0, 0, 0]);

const rows = PAIRS.map(([front, back, threshold]) => {
  const stack = back === "background" ? [] : [back].flat();
  const backdrop = stack.reduce((under, spec) => over(layer(spec), under), page);
  const value = ratio(over(layer(front), backdrop), backdrop);
  return { pair: `${front} / ${[back].flat().join(" + ")}`, value, threshold, ok: value >= threshold };
});

const width = Math.max(...rows.map((row) => row.pair.length));
console.log(`${"pair".padEnd(width)}  ratio  min   ok`);
for (const row of rows) {
  const value = row.value.toFixed(2).padStart(5);
  console.log(`${row.pair.padEnd(width)}  ${value}  ${row.threshold.toFixed(1)}  ${row.ok ? "yes" : "NO"}`);
}

const failed = rows.filter((row) => !row.ok);
if (failed.length > 0) {
  console.error(`\ncontrast: ${failed.length} pair(s) below threshold: ${failed.map((row) => row.pair).join(", ")}`);
  process.exit(1);
}
console.log(`\ncontrast: all ${rows.length} pairs pass`);
