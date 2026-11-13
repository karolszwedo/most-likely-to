import type { HostGame } from "@/lib/rooms/shared";
import { plural } from "@/lib/rooms/summary";

// A row of the host's list of own games (S-13, lista własnych gier: "Twoje gry", /gry) as the page shows it, made on
// the server from host_games (HostGame) and handed to the island as plain text (context/changes/host-game-history/
// plan.md, decision 3; Karol's picks of 2026-11-11). Types from shared.ts and plural only, no other import: nothing here
// may pull server code into the browser (context/foundation/lessons.md, "Pytania gry tylko po stronie serwera").

export interface HostGameRow {
  // The room's id, the handle of "Usuń" (POST /api/rooms/<id>/delete).
  id: string;
  // When the game started, or for a game that never started when its room was made: "wtorek, 10 listopada 2026, 21:14".
  date: string;
  // "1 pytanie", "2 pytania", "7 pytań": the questions the game opened, the skipped ones included; for a game that
  // never started "Gra nie wystartowała" instead.
  questions: string;
  // The players' nicks in seat order, the host's included, joined with ", ".
  nicks: string;
}

// Always the game's own time zone, never the runtime's: the Worker runs in UTC, and a date made in the browser would
// differ from the server's render (plan, "Critical Implementation Details").
const ZONE = "Europe/Warsaw";
const DAY = new Intl.DateTimeFormat("pl-PL", {
  weekday: "long",
  day: "numeric",
  month: "long",
  year: "numeric",
  timeZone: ZONE,
});
const TIME = new Intl.DateTimeFormat("pl-PL", { hour: "2-digit", minute: "2-digit", timeZone: ZONE });

// Karol's pick "D2": the day in words, then ", " and the hour. Two formats joined, because pl-PL's dateStyle "full" with
// timeStyle "short" puts no comma before the hour.
export function gameDate(timestamp: string): string {
  const at = new Date(timestamp);
  return `${DAY.format(at)}, ${TIME.format(at)}`;
}

export function hostGameRow(game: HostGame): HostGameRow {
  const started = game.startedAt !== null;
  return {
    id: game.id,
    date: gameDate(game.startedAt ?? game.createdAt),
    questions: started
      ? `${String(game.questions)} ${plural(game.questions, "pytanie", "pytania", "pytań")}`
      : "Gra nie wystartowała",
    nicks: game.nicks.join(", "),
  };
}
