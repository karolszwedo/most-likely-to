import type { Messages } from "@/lib/i18n";
import type { HostGame } from "@/lib/rooms/shared";

// A row of the host's list of own games (S-13, lista własnych gier: "Twoje gry", /gry) as the page shows it, made on
// the server from host_games (HostGame) and handed to the island as plain text
// (context/archive/2026-11-10-host-game-history/ plan.md, decision 3; Karol's picks of 2026-11-11), in the words of the
// page's dictionary (t = messages(lang), src/lib/i18n/pl/host.ts). Types only, no other import: nothing here may pull
// server code into the browser (context/foundation/lessons.md, "Pytania gry tylko po stronie serwera").

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
  // The game's history (S-26, /gry/<id>), the card's way in ("Historia", Karol's pick E2 of 2026-11-21); null for a
  // game that never started, which has no question to show.
  href: string | null;
}

// Always the game's own time zone, never the runtime's: the Worker runs in UTC, and a date made in the browser would
// differ from the server's render (plan, "Critical Implementation Details"); the dictionary's date (dateFormat in
// src/lib/i18n) keeps Europe/Warsaw.
export function gameDate(timestamp: string, t: Messages): string {
  return t.host.gameList.date(new Date(timestamp));
}

export function hostGameRow(game: HostGame, t: Messages): HostGameRow {
  const started = game.startedAt !== null;
  return {
    id: game.id,
    date: gameDate(game.startedAt ?? game.createdAt, t),
    questions: started ? t.host.gameList.questions(game.questions) : t.host.gameList.notStarted,
    nicks: game.nicks.join(", "),
    href: started ? `/gry/${game.id}` : null,
  };
}
