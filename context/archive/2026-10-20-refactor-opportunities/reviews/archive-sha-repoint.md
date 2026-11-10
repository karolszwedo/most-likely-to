# Podmiana SHA przed archiwizacją

## 2026-11-10

- **Cel:** `origin/main` (`git ls-remote --symref origin HEAD` → `refs/heads/main`), stan `6e367ab81850895157eea8bda7b448baa4349869`
  (scalenie PR #48).
- **Commit integrujący:** `9e00c34` „test(refactor-opportunities): Test bramy RPC (K1) (p1)”.
- **Powiązanie:** nie squash, tylko przepisanie historii 2026-10-23 (`git filter-repo`, każdy stary commit ma dokładnie
  jeden nowy): mapa `context/deployment/history-rewrite-2026-10-22.md:221` (`6827aaa…` → `9e00c34…`).
- **Dowód:** `6827aaa` nie jest przodkiem celu (`git merge-base --is-ancestor`, kod 1), `9e00c34` jest (kod 0). Ten sam
  opis i identyczny diff (`git diff --stat`: `change.md`, `plan.md`, `test-plan.md`, `tests/unit/room-rpc-gate.test.ts`,
  4 pliki, +235/−5). Pozostałe SHA w Progress (`bae236d`, `eff6d70`, `6e367ab`) są w historii celu i zostają.
- **Decyzja:** Karol, „Zaktualizuj i archiwizuj”.

| Wiersz | Stary sufiks (OID)                                     | Nowy SHA  |
| ------ | ------------------------------------------------------ | --------- |
| 1.1    | `6827aaa` (`6827aaa092f9fab70928c0c06d322b709fe596c9`) | `9e00c34` |
| 1.2    | `6827aaa` (`6827aaa092f9fab70928c0c06d322b709fe596c9`) | `9e00c34` |
| 1.3    | `6827aaa` (`6827aaa092f9fab70928c0c06d322b709fe596c9`) | `9e00c34` |

Razem: 3 wiersze.
