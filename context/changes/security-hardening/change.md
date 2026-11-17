---
change_id: security-hardening
title: Security hardening
status: impl_reviewed
created: 2026-11-16
updated: 2026-11-17
archived_at: null
---

## Notes

Punkt 5 nowej kolejki (H, drobiazgi techniczne), pełny cykl (baza i serwer gry).

- Z listy H już zrobione wcześniej: F6 (limit treści przed odczytem, `readJsonRequest` w `src/lib/rooms/json-route.ts`) i F4 (`RoomErrorBoundary` ze zgłoszeniem `island_crash`).
- Zostaje: przegląd bezpieczeństwa całej gry (baza, serwer z logowaniem, przeglądarka z kanałem na żywo, CI z sekretami i paczkami; 16.11.2026, czterech agentów, tylko odczyt), S-20 F3 (usunięcie ścieżki `p_question_id` w `start_game`, `context/changes/no-recent-repeats/follow-ups/review-fixes.md`) i poprawki z przeglądu.
- Decyzje Karola (16.11.2026):
  - sufit graczy w `join_room`: tak, 50 na pokój (wyraźnie ponad sprawdzane 20); w PRD zmienia się zdanie „brak limitu graczy”, a pozycja wychodzi z Parked w roadmapie;
  - śledzenie błędów i metryki: zostają w Parked do pierwszego wieczoru z ekipą (logi Workera i `island_crash` już są).
- Jedna migracja na całą zmianę (F3, sufit, poprawki bazy z przeglądu), czyli jeden `db push` przed scaleniem.
- Przegląd: `security-review.md` (ID znalezisk B-, W-, DB-, R-), celowo poza publicznym repo (tylko lokalnie, `.git/info/exclude`), bo opisuje słabości, których ta zmiana nie poprawia; o publikacji decyduje Karol po wdrożeniu. Zakres zatwierdzony przez Karola 16.11.2026 („tak”):
  - baza (jedna migracja): S-20 F3, sufit 50 graczy, DB-1 (limit nowych gier na konto na godzinę), DB-5 (limit listy kategorii);
  - serwer: W-4 (nagłówki bezpieczeństwa i `no-store` na stronach SSR, bez CSP), W-3 (limit treści formularzy), W-2 (`ring` jak inne trasy JSON), W-7, W-8, W-9;
  - przeglądarka: B-1 („Zagłosuj” działa dopiero po zamontowaniu wyspy);
  - repo: R-2 i R-4 (ostrzejsze `ask` w `.claude/settings.json`, także `gh pr merge*`), R-8 (`permissions` w `ci.yml`, `.gitignore`), R-1 (linki do repo w `deploy-plan.md`).
  - Odłożone: B-2 (CSP) i B-3 (nicki-sobowtóry) do czatu; W-1 (wymaga własnej domeny); DB-4 (przegląd wszystkich funkcji); DB-2, DB-3, DB-6, W-5, W-6, R-5, R-7; aktualizacja astro osobno (R-6).
- Ustawienia GitHuba (16.11.2026, za zgodą Karola, `gh api`): zatwierdzanie przebiegów z forków dla wszystkich spoza repo (R-3) i alerty Dependabota (R-6) włączone.
- Przegląd implementacji (17.11.2026, `reviews/impl-review.md`, APPROVED), decyzje Karola („tak”): F1 test w `tests/db/round-rules.test.ts` (sam `p_question_id` daje `no_questions`), F2 `Bash(npm explore*)` w `ask`; F5 i F6 pominięte. Przyjęte granice, bez zmiany kodu:
  - F3: odpowiedź 500 z wyjątku trasy (bez `src/pages/500.astro`) i pliki statyczne wychodzą bez nagłówków bezpieczeństwa; puste ciało i pliki publiczne, nic do osadzenia w ramce ani do zapamiętania;
  - F4: limit 60 gier na godzinę liczy istniejące pokoje, więc gra skasowana przez `delete_game` z niego wypada; ogranicza liczbę wierszy, nie liczbę wywołań, a ogranicznik żądań to odłożone W-1 (własna domena).
