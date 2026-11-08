import { CATEGORIES, QUESTIONS, type QuestionId } from "@/data/questions";
import type { LeaderDraw } from "@/lib/rooms/shared";

// The round's question. Server only: this file imports the whole question base, 18+ included, which never goes to the
// browser; a screen gets only the current round's text (context/foundation/lessons.md, "Pytania gry tylko po stronie
// serwera").

// What the host picked, as stored in the room. The database checks only the shape (a host can store any name over
// RPC), so names that are not categories of the base are skipped here
// (context/archive/2026-10-07-room-lobby/follow-ups/review-fixes.md:16).
export interface QuestionSelection {
  categories: readonly string[];
  adultCategories: readonly string[];
}

// The category ids that exist and each question's category and 18+ flag; the real one is src/data/questions.ts.
export interface QuestionBase<Id extends string = string> {
  categories: readonly string[];
  questions: Readonly<Record<Id, { category: string; adult: boolean }>>;
}

const BASE: QuestionBase<QuestionId> = { categories: CATEGORIES.map((category) => category.id), questions: QUESTIONS };

// PRD FR-015 and US-01: only questions of the picked categories that exist in the base, 18+ only from the picked
// categories where the host included them (FR-005). In the base's order.
function poolFrom<Id extends string>(base: QuestionBase<Id>, selection: QuestionSelection): Id[] {
  const known = new Set(base.categories);
  const picked = new Set(selection.categories.filter((id) => known.has(id)));
  const adult = new Set(selection.adultCategories.filter((id) => picked.has(id)));
  return (Object.keys(base.questions) as Id[]).filter((id) => {
    const entry = base.questions[id];
    return picked.has(entry.category) && (!entry.adult || adult.has(entry.category));
  });
}

// An index in [0, length) from random, which gives a number in [0, 1); a value outside that still lands in range.
function indexFrom(random: () => number, length: number): number {
  const value = random();
  return Number.isFinite(value) ? Math.min(length - 1, Math.max(0, Math.floor(value * length))) : 0;
}

// Round 1's question: one question of the pool, picked by random; null when the pool is empty.
export function drawFrom<Id extends string>(
  base: QuestionBase<Id>,
  selection: QuestionSelection,
  random: () => number,
): Id | null {
  const pool = poolFrom(base, selection);
  return pool.length === 0 ? null : pool[indexFrom(random, pool.length)];
}

// The candidates of "Następne pytanie" and "Pomiń pytanie": the whole pool, each question once, in an order drawn by
// random (Fisher-Yates). The database takes the first one not played in this game yet, so no question comes twice
// (FR-015; decision D1 of context/archive/2026-10-15-full-game-evening/research.md).
export function shuffledPool<Id extends string>(
  base: QuestionBase<Id>,
  selection: QuestionSelection,
  random: () => number,
): Id[] {
  const pool = poolFrom(base, selection);
  for (let i = pool.length - 1; i > 0; i--) {
    const j = indexFrom(random, i + 1);
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }
  return pool;
}

export function drawQuestion(selection: QuestionSelection, random: () => number): QuestionId | null {
  return drawFrom(BASE, selection, random);
}

export function shuffledQuestions(selection: QuestionSelection, random: () => number): QuestionId[] {
  return shuffledPool(BASE, selection, random);
}

// The game's pool in the base's order. Its size tells a leader how many questions are left to draw (questionsToDraw).
export function questionPool(selection: QuestionSelection): QuestionId[] {
  return poolFrom(BASE, selection);
}

// How many questions the game could still draw after round roundNumber (pozostałe pytania), for "Jeszcze 5 pytań"
// (game-length), at least 0. Every round of a game plays one question, skipped ones included, and none comes twice.
// With no list the game plays the pool of poolSize questions, so N rounds have played N of them. With the game's
// question list it plays the list's entries not removed first (list_entries of them), then the pool without every
// question id on any row of the list (removed and reworded entries included, list_base_count of them, all of the pool:
// the list is drawn from it). So the game has poolSize - list_base_count + list_entries questions in all
// (context/archive/2026-10-24-question-list-review/plan.md, Critical Implementation Details); with no list and no
// approved proposal both are 0. A question approved from a proposal (S-10) is an entry with no question id, so it adds
// to list_entries alone: one more question in all, also in a game with no list.
// Since game-length "Następne pytanie" goes by the number of the game's questions instead (question_count,
// leaderQuestionsLeft in src/lib/rooms/server.ts), and this count says how many "Jeszcze 5 pytań" can add once that
// number is reached: the list is played to its end by then, so it is exactly as many candidates as more_questions finds
// not played and on no row of the list, and the button never promises a question the database cannot add
// (context/changes/game-length/plan.md, Key Discoveries).
// The two numbers come from room_lobby's leader_draw, so a co-host, who never sees the list, gets the count too (S-07).
export function questionsToDraw(
  poolSize: number,
  list: Pick<LeaderDraw, "list_entries" | "list_base_count">,
  roundNumber: number,
): number {
  return Math.max(0, poolSize - list.list_base_count + list.list_entries - roundNumber);
}

// The most questions one "Jeszcze 5 pytań" adds, as more_questions has it (supabase/migrations/*_game_length.sql).
export const MORE_QUESTIONS = 5;

// The text after "Kto z nas najprawdopodobniej" of a round's question, or null for an id the base does not have (the
// database checks only the id's format). Own keys only, so "constructor" is unknown too.
export function questionText(id: string): string | null {
  return Object.hasOwn(QUESTIONS, id) ? QUESTIONS[id as QuestionId].text : null;
}
