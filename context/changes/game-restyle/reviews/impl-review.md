<!-- IMPL-REVIEW-REPORT -->

# Implementation Review: Nowy wygląd gry (S-25)

- **Plan**: context/changes/game-restyle/plan.md
- **Scope**: Full plan
- **Reviewed phases**: 1, 2, 3, 4
- **Date**: 2026-11-20
- **Verdict**: APPROVED
- **Findings**: 0 critical, 2 warnings, 4 observations

## Verdicts

| Dimension           | Verdict |
| ------------------- | ------- |
| Plan Adherence      | PASS    |
| Scope Discipline    | PASS    |
| Safety & Quality    | WARNING |
| Architecture        | PASS    |
| Pattern Consistency | WARNING |
| Success Criteria    | PASS    |

Evidence: diff `59abdd2..7632129` (PR #84). Gate on `main` 20.11: `npm run lint` (contrast 68/68 pairs, 0 literals in 69 view files), `npx astro check` (0 errors), `npm test` (2452 passed), `npm run build` (check-fonts: 2 `.woff2` in `dist/client/_astro/fonts`). CI on PR #84 and on `main` `7632129` green (`ci`, `smoke`, `db`, `e2e`, Workers Builds); smoke on production green 20.11. `git grep 1a1a1a` outside `public/dev/gifs` and `context`: empty; `git grep divide-y -- src`: empty. Every token in the plan's table matches `.dark` (`--accent` 0.328 instead of ~0.332, recomputed for `--primary` 0.58 and explained in `theme.md`). All eight lists are tiles with roles kept (`ul`/`li`, table with header row, native radio, `data-*`, `listRef`, `MOTION_TABLE`); the component diffs are class strings and imports only. Fonts are served only from `/_astro/fonts/` (no foreign host in `dist`); the kitchen sink keeps the dev-only guard (404 outside dev). Manual 4.5 (Karol's phone and laptop after the deploy) is pending.

Planned deviations accepted without a finding: `PLAYER_ROW` lives in `CohostButton.tsx` instead of `ROW` in `RoundVoting.tsx` (same intent, one shared value); `field.tsx` link hover moved to `text-primary-text` (the "never `text-primary`" rule); `TILE_ON_CARD` (`bg-muted`) for categories on the new-game card (Karol's pick B, in `AGENTS.md`); `TABLE_FRAME` is `rounded-lg`; the font trial alarm used an unknown family name instead of removing the wiring (test-plan §6.7 says why).

## Findings

### F1 — Wybrana opcja głosu słabo widoczna

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Safety & Quality
- **Location**: src/components/room/RoundVoting.tsx:92
- **Detail**: A chosen vote is a native radio `accent-primary` on a choice tile that turns `bg-accent` (`CHOICE_TILE`, `src/components/room/surfaces.ts`). `--primary` on `--accent` measures 2.72:1 (was 3.97:1 before the restyle), below WCAG 1.4.11's 3:1; the tile's own change from `--card` to `--accent` is 1.23:1, so on a phone the "this is my vote" signal got weaker. Measured with a copy of `scripts/contrast.mjs` plus the missing pairs. `contrast.mjs` has no `primary`/`accent` pair, so lint stays green. Same family, weaker: a ticked category checkbox is `bg-primary` on `--muted` (2.89:1), but its white tick (4.56:1) carries the state.
- **Fix**: Radio in the text Blurple: `RADIO` → `accent-primary-text` (5.66:1 on `--accent`), the same in the kitchen sink's copy, and the pair `["primary-text", "accent", UI]` in `PAIRS`; Karol confirms on a screenshot (voting with a chosen option, phone and laptop).
  - Strength: one class and one guard row; the radio stays native and visible (e2e `.check()`), and the guard stops the next regression.
  - Tradeoff: the chosen radio becomes a lighter Blurple than the "Zagłosuj" button: a look change, so it is Karol's call on a screenshot.
  - Confidence: HIGH — the 5.66:1 is measured on the current tokens; `primary-text` is already the token for Blurple on dark surfaces.
  - Blind spot: Chrome may adjust `accent-color` itself in dark mode; not checked in a browser yet (the screenshot will show it).
- **Decision**: FIXED (PR #86, `accent-primary-text`; screenshot shown 20.11, Karol's „tak” pending before merge)

### F2 — Macierz stanów kopiuje klasy głosowania zamiast je importować

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Pattern Consistency
- **Location**: src/pages/dev/ui-kitchen-sink.astro:119-120
- **Detail**: The kitchen sink keeps its own copies of `RADIO` and `CHOICE_LABEL` from `RoundVoting.tsx` (comment: "not exported"), and of the request and category tile classes, while `PLAYER_ROW`, `BUSY_BUTTON` and `CHOICE_TILE` are imported. If the vote changes (e.g. F1), the visual gate quietly shows the old look.
- **Fix**: Export `RADIO` and the label class from `RoundVoting.tsx` (and the tile classes from their views or `surfaces.ts`) and import them in the kitchen sink.
- **Decision**: FIXED (PR #86)

### F3 — Strażnik kontrastu czyta `:root` i `.dark`, dokumenty mówią „tylko `.dark`”

- **Severity**: 💬 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Adherence
- **Location**: scripts/contrast.mjs:69
- **Detail**: The plan said the guard reads only `.dark`; `readTokens` merges `:root` then `.dark` as the browser cascade does (documented in the script header and test-plan §6.7). `AGENTS.md` ("measures the WCAG contrast of the `.dark` tokens") and `docs/development.md` ("from the `.dark` palette") say otherwise. Side effect: a token removed from `.dark` would be measured with its light `:root` value instead of failing.
- **Fix**: Reword both lines to "the palette on screen (`:root` with `.dark` on top)".
- **Decision**: FIXED (PR #86)

### F4 — Biały napis na „Usuń grę” bez wiersza w strażniku

- **Severity**: 💬 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: scripts/contrast.mjs:23
- **Detail**: White text on `dark:bg-destructive/60` ("Usuń grę", `DeleteGameButton.tsx:113`) dropped from 6.3:1 to 5.20:1. It passes, but `AGENTS.md` asks for a `PAIRS` row for every text-on-surface pairing and this one has none.
- **Fix**: Add `["primary-foreground", ["card", "destructive/60"], TEXT]` to `PAIRS`.
- **Decision**: FIXED (PR #86)

### F5 — Paleta kolorów pod własnym nickiem w poczekalni 12 px niżej

- **Severity**: 💬 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Adherence
- **Location**: src/components/room/RoomLobby.tsx:225
- **Detail**: The lobby's copy of the row was `gap-x-3`; the shared `PLAYER_ROW` is `gap-3`. A player's own row wraps (`flex-wrap`), so the open `ColorPalette` (`basis-full`) now sits 12 px lower under the nick. Unplanned, small; voting rows already had `gap-3`.
- **Fix**: Look at it on the phone with 4.5; if it looks loose, give the own row `gap-x-3` back.
- **Decision**: ACCEPTED: Karol looks at it on the phone with 4.5; `gap-x-3` back only if it looks loose

### F6 — Każde budowanie zależy od Fontsource

- **Severity**: 💬 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: package.json:7
- **Detail**: `check-fonts.mjs` turns a failed Fontsource fetch into a red build, deliberately (plan, Phase 1). The flip side: a Fontsource outage also blocks CI and Workers Builds, including an urgent hotfix. The risk and the way around it are not written down.
- **Fix**: One line in `context/deployment/deploy-plan.md`: a red `check-fonts` with a Fontsource outage means wait or retry, not delete the check; a hotfix waits for Fontsource or goes out as a `wrangler rollback`.
- **Decision**: FIXED (PR #86, `deploy-plan.md` „Sytuacje brzegowe”)
