# Follow-upy z przeglądu implementacji S-20

Źródło: `reviews/impl-review.md` (15.11.2026). Karol przyjął rekomendacje: F1 (komentarz przy pokoju D), F2 (przyjęta granica w `change.md`) i F4 (nieaktualne zdania) poprawione w PR z poprawkami; F5–F7 bez zmian; F3 odłożone tutaj.

## Na później

- **F3, stara ścieżka `p_question_id` w `start_game`.**
  - Stan dziś: `public.start_game(uuid, text, text, text[])` (`supabase/migrations/20261115095052_no_recent_repeats.sql`) przyjmuje dalej `p_question_id`, gdy nie ma listy ani `p_candidates`. Worker od S-20 go nie wysyła (`src/lib/rooms/server.ts`); ścieżka została dla Workera sprzed S-20 (cofnięcie wersji) i dla testów, które startują grę z jednym pytaniem (`tests/db/question-list.test.ts`, `tests/db/support/rounds.ts`, pgTAP `round_creator_view.test.sql`). Nowej możliwości nie daje: prowadzący i tak wybiera pytanie jednym kandydatem w `next_round`.
  - Co zrobić: gdy cofnięcie do Workera sprzed S-20 przestanie wchodzić w grę, nowa migracja usuwa ścieżkę `p_question_id`, ale zostawia czteroargumentową sygnaturę (parametr bez znaczenia albo odmowa), bo Worker po S-20 woła `start_game` z `p_candidates` (plan-review F5: migracja z trzema argumentami zepsułaby „Zacznij grę”). Testy startujące z `p_question_id` przechodzą na `p_candidates` z jednym pytaniem; `tests/unit/room-rpc-gate.test.ts` dalej widzi parametr.
  - Dlaczego nie teraz: S-20 jest na produkcji od 15.11.2026, a ścieżka jest zabezpieczeniem cofnięcia wersji Workera. Gracz nie zyskuje na jej usunięciu nic.
