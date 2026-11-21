// The texts' guard (S-27, english-version): a Polish letter outside a comment in the screens' code means a text that
// skipped the dictionary, and an English screen would show it in Polish. Runs as part of `npm run lint` (and so in
// CI); exits 1 on any hit. It sees only Polish letters, so a text like "Gracze" passes here: the previews' pseudo
// language (/dev/*?lang=xx, src/lib/i18n/pseudo.ts) shows those. Zero dependencies on purpose.
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

const ROOTS = ["src/components", "src/pages", "src/layouts", "src/lib"];
// The previews' own sample data and labels (dev only, 404 in production) and the dictionaries themselves.
const SKIP = ["src/pages/dev", "src/lib/i18n"];
const SOURCE = /\.(astro|ts|tsx|js|mjs)$/;
const POLISH = /[ąćęłńóśźżĄĆĘŁŃÓŚŹŻ]/;

// Each exception with its reason; a line matches when its file is the same and it contains `text` (or any line of
// the file without `text`).
const EXCEPTIONS = [
  {
    file: "src/lib/live-sync/server.ts",
    text: "Kto z nas najprawdopodobniej",
    reason:
      "the live-sync probe's sample question (/dev/live-sync and scripts/live-sync-probe.mjs), never a game's screen",
  },
  {
    file: "src/components/live-sync/LiveSyncDemo.tsx",
    reason: "the live-sync probe's page /dev/live-sync, dev only (404 in production)",
  },
];

function files(dir) {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name).replaceAll("\\", "/");
    if (SKIP.some((skip) => path === skip || path.startsWith(`${skip}/`))) return [];
    if (entry.isDirectory()) return files(path);
    return SOURCE.test(entry.name) ? [path] : [];
  });
}

// The file with every comment blanked (// and /* */ in code, <!-- --> in an .astro template), strings kept, newlines
// kept so line numbers stay. A ' or " string ends at the end of its line at the latest (JSX text may hold a lone
// apostrophe); a template literal may span lines.
function withoutComments(source, astro) {
  let out = "";
  let i = 0;
  let state = "code";
  let quote = "";
  while (i < source.length) {
    const c = source[i];
    const next = source[i + 1];
    if (state === "line") {
      if (c === "\n") {
        state = "code";
        out += c;
      }
      i += 1;
      continue;
    }
    if (state === "block" || state === "html") {
      const end = state === "block" ? "*/" : "-->";
      if (source.startsWith(end, i)) {
        state = "code";
        i += end.length;
        continue;
      }
      if (c === "\n") out += c;
      i += 1;
      continue;
    }
    if (state === "string") {
      out += c;
      if (c === "\\") {
        out += next ?? "";
        i += 2;
        continue;
      }
      if (c === quote || (c === "\n" && quote !== "`")) state = "code";
      i += 1;
      continue;
    }
    if (c === "/" && next === "/") {
      state = "line";
      i += 2;
      continue;
    }
    if (c === "/" && next === "*") {
      state = "block";
      i += 2;
      continue;
    }
    if (astro && source.startsWith("<!--", i)) {
      state = "html";
      i += 4;
      continue;
    }
    if (c === "'" || c === '"' || c === "`") {
      state = "string";
      quote = c;
    }
    out += c;
    i += 1;
  }
  return out;
}

let hits = 0;
let scanned = 0;
for (const root of ROOTS) {
  for (const file of files(root)) {
    scanned += 1;
    const source = readFileSync(file, "utf8");
    const original = source.split(/\r?\n/);
    withoutComments(source, file.endsWith(".astro"))
      .split(/\r?\n/)
      .forEach((line, index) => {
        if (!POLISH.test(line)) return;
        const excepted = EXCEPTIONS.some(
          (exception) => exception.file === file && (exception.text === undefined || line.includes(exception.text)),
        );
        if (excepted) return;
        hits += 1;
        console.error(`${file}:${index + 1}: ${original[index].trim()}`);
      });
  }
}

if (hits > 0) {
  console.error(
    `\nui-text: ${hits} line(s) with a Polish letter in the screens' code. Move the text to the dictionary of its ` +
      `screen in src/lib/i18n/pl/ and read it through messages(lang) or useT() (src/lib/i18n/index.ts); a comment may ` +
      `stay as it is.`,
  );
  process.exit(1);
}
console.log(`ui-text: 0 Polish texts outside the dictionary in ${scanned} files`);
