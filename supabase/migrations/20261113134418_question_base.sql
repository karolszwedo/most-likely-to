-- S-17 question-pool-in-db: the database's own copy of the shared question base, with no text: each question's id,
-- its category and whether it is 18+ (context/changes/question-pool-in-db/plan.md, Faza 1 #1; PRD FR-005; Karol's
-- decision W-A of 2026-11-13 at the top of that plan).
--
-- private.question_base holds one row per question of src/data/questions.ts. Only the snapshot migrations write its
-- rows, never a function and never a migration written by hand: after every change of the questions,
-- `npm run questions:migration` (scripts/question-base-migration.mjs) makes a new *_question_base_snapshot.sql that
-- sets the table to exactly the file's ids, categories and 18+ marks. tests/unit/question-base-snapshot.test.ts is red
-- when the file and the latest snapshot differ, and when any other migration writes the table. The snapshot goes in
-- the same PR as the change of the questions, and `npx supabase db push` comes before the merge.
--
-- Nothing reads the table yet: a later migration of this change (plan, Faza 2) makes the leader's moves check the
-- host's choice against it. Until then the game plays exactly as before.
--
-- The text of a question stays in the Worker (src/data/questions.ts): the database needs only what decides whether a
-- question may open in a room, its id, its category and its 18+ mark. A row names no room, no player and no time.
--
-- Never edit this file once it has been pushed; a fix is a new migration.

-- The copy of the shared question base: schema private, no grants, no policies ----------------------------------------

-- One row per question of the base. Logged, like private.question_stats: it is the base, not a game's state. The checks
-- are the formats of src/data/questions.ts, so a snapshot of a malformed file fails as a whole.
create table private.question_base (
  -- "<category-id>-<NNN>", which never changes and never comes back for another question.
  question_id text primary key check (question_id ~ '^[a-z0-9-]+-[0-9]{3}$'),
  -- The id of the question's category (CATEGORIES in src/data/questions.ts).
  category text not null check (category ~ '^[a-z0-9-]+$'),
  -- An 18+ question, which a room plays only from the categories where its host included them.
  adult boolean not null
);

alter table private.question_base enable row level security;

-- Reached only through functions, like private.question_stats: no API role reads or writes it.
revoke all on table private.question_base from public, anon, authenticated;
