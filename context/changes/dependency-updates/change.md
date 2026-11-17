---
change_id: dependency-updates
title: Aktualizacja paczek po alertach Dependabota
status: new
created: 2026-11-17
updated: 2026-11-17
archived_at: null
---

## Notes

Punkt 5 kolejki (H, drobiazgi techniczne), po wdrożeniu `security-hardening` (PR #72). Decyzja Karola 17.11.2026: „tak”, osobna mała zmiana.

- Stan 17.11.2026: 62 otwarte alerty Dependabota w 15 paczkach (19 wysokich, 33 średnie, 10 niskich).
- Do Workera na produkcji trafiają tylko `astro` 7.3.2, `devalue` 5.9.2 i `zod` 4.6.2, wszystkie w kodzie samego Astro. Żaden opisany scenariusz nie dotyczy gry: obrazki w adapterze `@astrojs/node` (gra stoi na Cloudflare), nazwy tagów z danych użytkownika, View Transitions, `devalue` z własnymi reviverami albo `uneval` (nie ma go w paczce Workera), `zod` na danych od gracza (gra go tak nie używa).
- Reszta działa tylko u twórcy gry i w CI: `undici` (wrangler/miniflare, `unifont` w Astro), `vite` (serwer dev), `sharp`, `source-map-js`, `smol-toml`, `fast-uri` (`@astrojs/check`), `brace-expansion`, `minimatch`; `tools/pr-review` (`hono`, `@hono/node-server`, `body-parser` przez `@modelcontextprotocol/sdk` w `@anthropic-ai/claude-agent-sdk`) to recenzja AI w CI, bez wystawionego serwera.
- Zakres: aktualizacja w granicach obecnych zakresów `package.json` (`npm update`), w repo i w `tools/pr-review`; bez skoków głównych wersji (Supabase CLI 3, TypeScript 7, `@astrojs/react` 7, `lint-staged` 17, `cn` 0.5). Bez osobnego `plan.md`: zmiana mechaniczna, sprawdza ją bramka (`npm run lint`, `npx astro check`, `npm test`, `npm run test:hooks`, `npm run build`) i pełne CI z `e2e`. Po scaleniu smoke na produkcji.
- 17.11.2026, po scaleniu PR #74 (`985734a`): CI na `main` zielone, ale Workers Builds czerwony, więc na produkcji dalej wersja Workera `32ff2445` z PR #73. Przyczyna z logu builda: `.nvmrc` 22.14.0, a `astro` 7.4.12 wymaga Node co najmniej 22.23.4 (CI bierze najnowszą 22, dlatego przeszło). Poprawka: `.nvmrc` 22.23.4 w osobnym PR (`dependency-updates-node`), plus zdanie w `deploy-plan.md` („Build w Cloudflare pada”) i `docs/development.md`.
