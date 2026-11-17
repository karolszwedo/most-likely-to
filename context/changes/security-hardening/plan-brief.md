# Poprawki z przeglądu bezpieczeństwa (punkt H) — Plan Brief

> Full plan: `context/changes/security-hardening/plan.md`
> Research: `context/changes/security-hardening/security-review.md` (przegląd bezpieczeństwa z 16.11.2026, w roli researchu)

## What & Why

Przegląd bezpieczeństwa całej gry (16.11.2026) nie znalazł nic poważnego, ale jedna rzecz łamie twardą zasadę anonimowości. Klik „Zagłosuj” przed załadowaniem strony wysyła numer wybranej osoby w adresie (`/r/<id>?vote=<numer>`). Zmiana poprawia to i drobne luki z przeglądu, a przy okazji domyka S-20 F3 i sufit graczy. Wszystko to przed czatem (punkt B kolejki), który otworzy grę na treść od graczy.

## Starting Point

Baza:

- nie ma sufitu graczy (PRD: „brak limitu”);
- nie ma limitu zakładania gier;
- przyjmuje listę kategorii dowolnej długości;
- `start_game` ma jeszcze stare wejście `p_question_id`.

Worker:

- nie ustawia nagłówków bezpieczeństwa;
- trasy formularzy i `ring` czytają treść bez limitu;
- logowanie loguje przez `console.error`.

Agent może bez pytania odpalić `npx -y wrangler deploy` albo `npx supabase config push`.

## Desired End State

- „Zagłosuj” działa dopiero po załadowaniu strony.
- Pokój mieści do 50 graczy razem z hostem.
- Konto założy najwyżej 60 gier na godzinę.
- Strony gry nie zostają w pamięci przeglądarki i nie dadzą się osadzić w cudzej ramce.
- Formularze odrzucają za dużą treść przed jej przeczytaniem.
- Agent pyta o zgodę przed każdym poleceniem, które wdraża albo zmienia bazę lub repo.

## Key Decisions Made

| Decision         | Choice                                                                                                   | Why (1 sentence)                                                                | Source                 |
| ---------------- | -------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------- | ---------------------- |
| Zakres           | Poprawki z przeglądu wg listy w `change.md`; CSP i nicki-sobowtóry przy czacie                           | Dziś bez punktu wstrzyknięcia, przy czacie z gifami stają się ważne             | Research (Karol „tak”) |
| Sufit graczy     | 50 na pokój, z hostem; w `join_room`, `request_join`, `admit_latecomer` (bez ścieżki powrotu)            | Wyraźnie ponad sprawdzane 20, zamyka zalewanie fałszywymi graczami przed czatem | Karol 16.11            |
| Limit gier       | 60 nowych na konto na godzinę, liczone z `rooms.created_at`                                              | e2e zakłada do 37 gier na jednym koncie, a zwykły host nigdy się nie zbliży     | Plan                   |
| F3               | Sygnatura `start_game` bez zmian, bez puli odmowa `no_questions`; `invalid_question` znika               | Brama RPC i pgTAP pilnują sygnatury, a Worker wysyła tylko pulę                 | Plan                   |
| B-1              | `disabled` do hydracji przez `useSyncExternalStore`, `aria-disabled` dla wysyłki zostaje                 | Bez mrugania i bez efektu; Playwright czeka na aktywny przycisk                 | Plan                   |
| Nagłówki         | Czysta funkcja w `src/lib/` stosowana w middleware; bez CSP                                              | Middleware nie da się przetestować w Vitest, funkcję tak                        | Plan                   |
| `ring`           | Zostaje dla sondy, z `readJsonRequest` i `no-store`, bez kontroli `Origin`                               | Sonda Node nie wysyła `Origin`                                                  | Plan                   |
| Pytania o zgodę  | Szerokie `ask`: `npx *wrangler*`, `npx *supabase*`, `node *wrangler*`, `npx -y`, `npm exec`, `gh pr merge`, zapisy `gh api` | Dosłowne przedrostki dało się obejść                                            | Research, F3           |
| Śledzenie błędów | Zostaje w Parked do pierwszego wieczoru                                                                  | Gra nie była jeszcze grana, logi i `island_crash` już są                        | Karol 16.11            |

## Scope

**In scope:**

- jedna migracja: F3, sufit 50, limit 60 gier na godzinę, limit kategorii;
- teksty `room_full` i `too_many_games`;
- B-1, nagłówki, limit formularzy, `ring`, `Secure`, klucz, logi logowania;
- `settings.json`, `permissions` w `ci.yml`, `.gitignore`;
- PRD, roadmapa, link w `deploy-plan.md`.

**Out of scope:**

- CSP (B-2) i nicki-sobowtóry (B-3);
- ogranicznik żądań (W-1);
- kolejność blokad (DB-4);
- DB-2, DB-3, DB-6, W-5, W-6, R-5, R-7;
- aktualizacja astro;
- śledzenie błędów;
- wyłączenie `ring` na produkcji.

## Architecture / Approach

Baza pierwsza (draft PR, CI `db` sprawdza migrację osobno), potem Worker i ekran wzorami, które kod już ma (`readJsonRequest`, `jsonAnswer`, `logEvent`, czysta funkcja z testem). Na koniec repo i dokumenty. Wdrożenie: `db push` przed scaleniem, bo stary Worker działa z nową bazą.

## Phases at a Glance

| Phase                         | What it delivers                                                                     | Key risk                                                                             |
| ----------------------------- | ------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------ |
| 1. Baza                       | Migracja z sufitem, limitami i bez `p_question_id`; testy bazy i pgTAP; teksty odmów | Przeoczenie późniejszej definicji funkcji przy kopiowaniu; około 20 miejsc w testach |
| 2. Serwer i przeglądarka      | B-1, nagłówki, limit formularzy, `ring`, `Secure`, klucz, logi                       | Nagłówki na niezmiennej odpowiedzi; `Secure` na `localhost` w e2e                    |
| 3. Repo, dokumenty, wdrożenie | `ask`, CI, `.gitignore`, PRD, roadmapa, `db push`, smoke                             | `db push` tylko z dobrej sieci (nie eduroam)                                         |

**Prerequisites:** gałąź `security-hardening` od `origin/main`; zgody Karola na push, `db push`, smoke; scala Karol.
**Estimated effort:** około 2–3 sesji w 3 fazach.

## Open Risks & Assumptions

- Przegląd planu (`reviews/plan-review.md`, 16.11.2026): REVISE, poprawki F1–F10 wpisane do planu. Najważniejsze: dokładne źródła funkcji (F1), zajęty nick przed sufitem (F2), szersze reguły `ask` z kosztem pytania przy `npx supabase migration new` (F3), limit także listy 18+ (F4).
- `secure: !import.meta.env.DEV` zakłada, że Chromium w e2e przyjmuje ciasteczka `Secure` na `http://localhost` (tak od wersji 89).
- `no-store` wyłącza bfcache stron gry; powrót „Wstecz” przeładuje stronę.

## Success Criteria (Summary)

- Głos oddany zaraz po otwarciu strony nie zostawia `?vote=` w adresie, a gra działa jak dotąd.
- Baza odmawia 51. gracza i 61. gry w godzinie, a CI z próbnymi alarmami to potwierdza.
- Smoke na produkcji widzi nowe nagłówki i `Secure`.
