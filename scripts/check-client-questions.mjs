// Question check after `astro build` (english-version, impl-review F5): the game's questions stay on the server
// (context/foundation/lessons.md, "Pytania gry tylko po stronie serwera"). The lint rule of eslint.config.js sees only a
// direct import of @/data/* in src/components/**; one import of a server module in an island, or a dynamic one, would
// still ship the whole base to every browser, 18+ included. This check looks at what the browser gets: no file of
// dist/client may hold the text of a base question, in either language, as a string of its own. A longer string is not
// a hit: the link's card and the teaser show sentences of their own. The same search has to find every text in
// dist/server, where the base belongs; else it reads the build's strings wrongly and a clean dist/client would mean
// nothing. `npm run build` runs it (also in CI and in Workers Builds, before the deploy) with
// --experimental-strip-types, which Node 22 (.nvmrc) needs to import the .ts files; exits 1 with the files and the ids,
// never the texts. Zero dependencies on purpose.
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { QUESTIONS } from "../src/data/questions.ts";
import { QUESTIONS_EN } from "../src/data/questions-en.ts";

const CLIENT = "dist/client";
const SERVER = "dist/server";
const BINARY = /\.(png|woff2)$/;
// A string that is a question and nothing else stands between two of these. A text of the base has none (Polish and
// English typography, the headers of both files); with one the search would not find it, so that stops the check.
const QUOTE = /["'`]/;
// Of a file's hits only the first ids: a leak is usually the whole base.
const SHOWN = 5;

const ids = new Map();
for (const [id, entry] of Object.entries(QUESTIONS)) ids.set(entry.text, id);
for (const [id, text] of Object.entries(QUESTIONS_EN)) ids.set(text, `${id} (en)`);
const quoted = [...ids].filter(([text]) => QUOTE.test(text)).map(([, id]) => id);
if (quoted.length > 0) {
  console.error(`check-client-questions: a straight quote in the text of ${quoted.join(", ")}; use “ ” „ ” or ’.`);
  process.exit(1);
}

// The source with escaped characters and quotes as themselves, as a bundler may write them either way.
function decoded(source) {
  return source
    .replace(/\\u\{([0-9a-f]{1,6})\}|\\u([0-9a-f]{4})|\\x([0-9a-f]{2})/gi, (escape, braced, four, two) => {
      const code = parseInt(braced ?? four ?? two, 16);
      return code > 0x10ffff ? escape : String.fromCodePoint(code);
    })
    .replace(/\\(["'`])/g, "$1");
}

// The base's texts in the files of a directory, by file.
function questionsIn(dir) {
  const found = new Map();
  let scanned = 0;
  for (const entry of readdirSync(dir, { withFileTypes: true, recursive: true })) {
    if (!entry.isFile() || BINARY.test(entry.name)) continue;
    const file = join(entry.parentPath, entry.name).replaceAll("\\", "/");
    scanned += 1;
    const texts = new Set(
      decoded(readFileSync(file, "utf8"))
        .split(QUOTE)
        .filter((part) => ids.has(part)),
    );
    if (texts.size > 0) found.set(file, texts);
  }
  return { found, scanned };
}

const server = questionsIn(SERVER);
const onServer = new Set([...server.found.values()].flatMap((texts) => [...texts]));
if (onServer.size < ids.size) {
  console.error(
    `check-client-questions: found ${onServer.size} of the base's ${ids.size} texts in ${SERVER}, expected all of ` +
      "them. The search no longer reads this build's strings, so it cannot tell whether the browser gets questions.",
  );
  process.exit(1);
}

const client = questionsIn(CLIENT);
if (client.found.size > 0) {
  for (const [file, texts] of client.found) {
    const some = [...texts].slice(0, SHOWN).map((text) => ids.get(text));
    console.error(
      `${file}: ${texts.size} question(s) of the base: ${some.join(", ")}${texts.size > SHOWN ? ", …" : ""}`,
    );
  }
  console.error(
    "\ncheck-client-questions: the browser would get questions of the base. An island, or a module it imports, pulls in " +
      "src/data/* (often through a server module, e.g. @/lib/rounds/draw or @/lib/rooms/server); the Worker hands a " +
      "screen only the text to show now.",
  );
  process.exit(1);
}
console.log(
  `check-client-questions: 0 questions of the base in ${client.scanned} files of ${CLIENT} (all ${ids.size} texts found in ${SERVER})`,
);
