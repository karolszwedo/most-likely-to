---
change_id: refactor-opportunities
title: Ranking okazji do refaktoryzacji w przepływie gościa od linku do głosu
status: implementing
created: 2026-10-20
updated: 2026-11-10
archived_at: null
---

## Notes

Intencja: mamy analizę przepływu gościa od linku do głosu, która dokumentuje dług techniczny
i ryzyka strukturalne: context/changes/guest-vote-flow-analysis/research.md (od 2026-11-09 w context/archive/2026-10-20-guest-vote-flow-analysis/research.md).
Ta zmiana odpowiada na pytanie, które tamta analiza celowo zostawiła otwarte:
KTÓRE z tych problemów warto naprawić, w jakim docelowym kształcie i w jakiej kolejności.
Eksplorujemy każdy zapisany problem w kodzie i historii, a potem porządkujemy je jako refactor opportunities.
Zmiana przebiega etapami: eksploracja → decyzja i plan → implementacja.
Na etapie eksploracji nie dzieje się żaden refaktor i nie zapada żadna decyzja.
Wynik eksploracji: research.md tej zmiany, zakończony rankingiem opcji z trade-offami.
Najpierw przeczytam raport; decyzja, co realizujemy, zapada na etapie planowania,
a refaktor rusza dopiero według przyjętego planu.

## Przegląd dryfu i decyzje (2026-11-09)

Plan z 2026-10-22 sprawdzony wobec `main` (`e501ac3`, po S-04, S-07, S-09, S-10, S-11, S-18, S-19). Decyzje Karola:

- **Faza 1**: alarmy 1.4 i 1.5 robi agent lokalnie (bez commita), z poprawionymi współrzędnymi; 1.6 (czytanie nazw testów) pominięte. Współrzędne dziś:
  - 1.4: `"reveal_round"` w wywołaniu `callRpc` to `src/lib/rooms/server.ts:445` (nie `:261`; `:449` to tylko nazwa w logu, jej zmiana nic nie zaświeci). Czerwone mają być 2 przypadki: „Odsłoń wynik (host, bez tokenu gościa)” i „Odsłoń wynik (współhost, token gościa)”.
  - 1.5: `createRoom` w `server.ts:131`, `p_nick` `:136`, `p_link_token` `:137`; czerwony 1 przypadek („Załóż grę”).
  - `tests/unit/room-rpc-gate.test.ts` ma 44 przypadki (nie 12) i obejmuje wszystkie 28 wywołań `callRpc` w `server.ts`; opis w test-plan §6.1.
- **Faza 4 skreślona**: smoke od `b9d0c3c` (2026-10-20) odsłania rundę przez Worker (`scripts/smoke.mjs:604`, plus odmowy `:350`, `:573`, `:624`), opis w test-plan §6.5 („Kontrola pozytywna”); smoke ma 124 kroki, nie 54.
- **Fazy 2–3 do przeplanowania na jedną małą fazę** (`/10x-plan`). Reguła D7 z planu („tylko znacznik przeładowania w `useRoomState.ts`”) nie pasuje do twardej zasady po S-04: głos legalnie trafia do `sessionStorage` (`mlt-my-vote:<roomId>`, `src/lib/rooms/my-vote.ts`) przez `browserSessionStorage` z `src/lib/rooms/remembered-nick.ts:110`, a nick i kolor do `localStorage` przez `browserNickStorage` (`remembered-nick.ts:37`). Reguła widziałaby 5 miejsc (`useRoomState.ts:105,106,116`, `remembered-nick.ts:37,110`) i nie odróżni „głos w karcie” od „głos w `localStorage`”, bo oba idą przez te same funkcje. Nowa faza:
  - test e2e (np. w `tests/e2e/rejoin.spec.ts`, dziś sprawdza tylko klucz `mlt-my-vote:<roomId>` przy `:45`): po głosie ani `localStorage`, ani `document.cookie`, ani adres strony nie zawierają nicku, na który oddano głos; wyrocznia z kroków testu;
  - reguła lintu bez wyjątków: zakaz `document.cookie`, `cookieStore` i `indexedDB` w `src/` (dziś 0 trafień); hooki agentów uruchamiają ESLint z `--quiet`, więc reguła od razu jako `error`;
  - komunikat reguły i opisy zgodne z pierwszą twardą zasadą `AGENTS.md`. Luka `.astro` `<script>` (przegląd planu, F1) zostaje jako znane ograniczenie.

## Próbne alarmy Fazy 1 (2026-11-10, agent, lokalnie, bez commita)

Na `refactor-opportunities-finish` (`src` równe `origin/main` = `e501ac3`), `npx vitest run --project unit tests/unit/room-rpc-gate.test.ts`; przed alarmami 44/44 zielone.

- **1.4, alarm A** (`server.ts:445`: `"reveal_round"` → `"reveal_rounds"`): 2 czerwone, 42 zielone, dokładnie przypadki „Odsłoń wynik (host, bez tokenu gościa) → reveal_round” i „Odsłoń wynik (współhost, token gościa) → reveal_round”, komunikat `expected 'reveal_rounds' to be 'reveal_round'`.
- **1.5, alarm B** (`server.ts:136-137`: zamienione wartości `p_nick` i `p_link_token` w `createRoom`): 1 czerwony, 43 zielone, dokładnie „Załóż grę → create_room”; diff argumentów pokazuje `p_nick: 'link-token-sentinel'` i `p_link_token: 'nick-sentinel'` zamiast wartowników na swoich miejscach.
- Po każdym alarmie `git checkout -- src/lib/rooms/server.ts`; na koniec 44/44 zielone, `git diff origin/main --stat -- src` pusty.

## Próbny alarm lintu Fazy 2 (2.6, 2026-11-10, agent, lokalnie, bez commita)

Trzy odczyty wstawione narzędziem Edit (żeby zadziałał hook po edycji) i cofnięte `git checkout`: `void Boolean(document.cookie);` w `JoinForm.tsx:86`, `void indexedDB.open("mlt-alarm");` w `RoundVoting.tsx:149`, `void Boolean(window.cookieStore);` w `my-vote.ts:24`. Hook `lint-edited-file.mjs` i `npx eslint` na trzech plikach: dokładnie 3 błędy, po jednym w pliku, z komunikatem reguły (`no-restricted-properties` dla `document.cookie` i `window.cookieStore`, `no-restricted-globals` dla `indexedDB`). Pierwsza próba z gołym `void document.cookie;` dawała dodatkowo `@typescript-eslint/no-meaningless-void-operator`, więc wartość idzie przez wywołanie. Po cofnięciu `git diff origin/main --stat -- src` pusty, `my-vote.test.ts` 25/25.
