import { fixupPluginRules } from "@eslint/compat";
import eslint from "@eslint/js";
import { defineConfig, globalIgnores, includeIgnoreFile } from "eslint/config";
import eslintPluginPrettier from "eslint-plugin-prettier/recommended";
import eslintPluginAstro from "eslint-plugin-astro";
import pluginReact from "eslint-plugin-react";
import eslintPluginReactHooks from "eslint-plugin-react-hooks";
import path from "node:path";
import tseslint from "typescript-eslint";

// eslint-plugin-react still uses context APIs removed in ESLint 10; wrap it until it ships native support.
const reactPlugin = fixupPluginRules(pluginReact);

const gitignorePath = path.resolve(import.meta.dirname, ".gitignore");

const baseConfig = defineConfig({
  extends: [eslint.configs.recommended, tseslint.configs.strictTypeChecked, tseslint.configs.stylisticTypeChecked],
  languageOptions: {
    parserOptions: {
      projectService: true,
      tsconfigRootDir: import.meta.dirname,
    },
  },
  rules: {
    "no-console": "warn",
    "no-unused-vars": "off",
    "@typescript-eslint/no-unused-vars": [
      "error",
      {
        argsIgnorePattern: "^_",
        varsIgnorePattern: "^_",
        caughtErrorsIgnorePattern: "^_",
        destructuredArrayIgnorePattern: "^_",
        ignoreRestSiblings: true,
      },
    ],
    "@typescript-eslint/restrict-template-expressions": ["error", { allowNumber: true }],
    "@typescript-eslint/no-misused-promises": ["error", { checksVoidReturn: { attributes: false } }],
  },
});

const reactConfig = defineConfig({
  files: ["**/*.{js,jsx,ts,tsx}"],
  extends: [eslintPluginReactHooks.configs.flat["recommended-latest"]],
  plugins: { react: reactPlugin },
  languageOptions: {
    ...pluginReact.configs.flat.recommended.languageOptions,
    globals: {
      window: true,
      document: true,
    },
  },
  settings: { react: { version: "detect" } },
  rules: {
    ...pluginReact.configs.flat.recommended.rules,
    "react/react-in-jsx-scope": "off",
  },
});

const astroConfig = defineConfig({
  files: ["**/*.astro"],
  languageOptions: {
    // astro-eslint-parser does not support projectService yet and warns on every file; hand it a project path instead.
    parserOptions: { projectService: false, project: "./tsconfig.json", tsconfigRootDir: import.meta.dirname },
  },
  rules: {
    "astro/no-set-html-directive": "error",
    "astro/no-unused-css-selector": "warn",
    "astro/prefer-class-list-directive": "warn",
  },
});

const scriptsConfig = defineConfig({
  files: ["scripts/**/*.mjs"],
  extends: [tseslint.configs.disableTypeChecked],
  languageOptions: {
    globals: {
      console: true,
      process: true,
      fetch: true,
      URLSearchParams: true,
      URL: true,
      performance: true,
      setTimeout: true,
      clearTimeout: true,
      AbortSignal: true,
    },
  },
  rules: { "no-console": "off" },
});

// The db suite's guard (local Supabase, publishable key) runs in tests/db/support/clients.ts. A test that built its own
// client would skip it and could reach production. The e2e suite's one raw Realtime client (players-only-live-channel)
// lives in tests/e2e/support/live.ts, which runs the same checks on the app's own config before it makes one.
const testsConfig = defineConfig({
  files: ["tests/**/*.ts"],
  ignores: ["tests/db/support/clients.ts", "tests/e2e/support/live.ts"],
  rules: {
    "@typescript-eslint/no-restricted-imports": [
      "error",
      {
        paths: ["@supabase/supabase-js", "@supabase/ssr", "@/lib/supabase"].map((name) => ({
          name,
          message:
            "Use anonClient() or newHost() from tests/db/support/clients.ts: they run the guard that keeps tests off production.",
          allowTypeImports: true,
        })),
      },
    ],
  },
});

// The first Hard Rule of AGENTS.md: whom a player voted for lives only in that tab's sessionStorage
// (src/lib/rooms/my-vote.ts). Besides it the game keeps only the remembered nick and colour in localStorage, and the
// server sets the player's cookie, so the browser storage the game never uses is closed here: a new kind of storage is
// the owner's decision, not an accident. Error level, since the agent hooks lint with --quiet. localStorage and
// sessionStorage stay open, as a rule on their names cannot tell a vote from a nick: tests/e2e/rejoin.spec.ts checks
// what the browser keeps after a vote. <script> blocks in .astro files are not linted by any rule today (their virtual
// files do not parse; test-plan.md §6.3), so this reaches React code and .astro frontmatter.
const BROWSER_STORAGE_MESSAGE =
  "Whom a player voted for lives only in the tab's sessionStorage (src/lib/rooms/my-vote.ts), never in a cookie, localStorage, IndexedDB or the URL, and the player's cookie is set by the server (AGENTS.md, Hard Rules). New browser storage needs the owner's decision.";
const UNUSED_BROWSER_STORAGE = ["indexedDB", "cookieStore"];

const browserStorageConfig = defineConfig({
  files: ["src/**/*.{ts,tsx,astro}"],
  rules: {
    "no-restricted-globals": [
      "error",
      ...UNUSED_BROWSER_STORAGE.map((name) => ({ name, message: BROWSER_STORAGE_MESSAGE })),
    ],
    "no-restricted-properties": [
      "error",
      { object: "document", property: "cookie", message: BROWSER_STORAGE_MESSAGE },
      ...["window", "globalThis", "self"].flatMap((object) =>
        UNUSED_BROWSER_STORAGE.map((property) => ({ object, property, message: BROWSER_STORAGE_MESSAGE })),
      ),
    ],
  },
});

export default defineConfig(
  includeIgnoreFile(gitignorePath),
  // Agent skills in .claude/ come from the course package with their own scripts; they are not project code.
  globalIgnores([".claude/"]),
  // tools/ holds packages with their own dependencies, which the root `npm ci` does not install; each checks its own
  // types (`npm run typecheck` in tools/pr-review).
  globalIgnores(["tools/"]),
  baseConfig,
  reactConfig,
  eslintPluginAstro.configs["flat/recommended"],
  eslintPluginAstro.configs["flat/jsx-a11y-recommended"],
  astroConfig,
  scriptsConfig,
  testsConfig,
  browserStorageConfig,
  eslintPluginPrettier,
);
