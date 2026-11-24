import { CATEGORIES } from "@/data/questions";
import { anonClient, newLinkToken, newPlayerToken, type Host } from "./clients";

// Seeding through the roles' own doors: a room comes from create_room as its host, a guest from join_room as anon,
// exactly as in the real game, so no test skips the rules it checks. These helpers throw on any failure: use them in
// beforeAll only, never inside a test.fails body or its beforeEach, where a throw would count as the expected failure.

// Real category ids, as the Worker sends them (src/pages/api/rooms/index.ts): picked ones in the order of the base.
export const SEED_CATEGORIES: string[] = CATEGORIES.slice(0, 2).map((category) => category.id);

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

// The function's own refusal code, never its arguments: they hold nicks, tokens and link codes.
function reasonOf(data: unknown): string {
  return isRecord(data) && typeof data.reason === "string" ? data.reason : "an unexpected shape";
}

export interface OwnRoom {
  id: string;
  linkToken: string;
  status: string;
}

// The host's own room as the host reads it through RLS (src/lib/rooms/server.ts reads the link code the same way).
export async function readOwnRoom(host: Host, roomId: string): Promise<OwnRoom> {
  const result = await host.client.from("rooms").select("id, link_token, status").eq("id", roomId);
  if (result.error) {
    throw new Error(`reading the host's room failed: ${String(result.status)} ${result.error.code}`);
  }
  const rows: unknown = result.data;
  if (!Array.isArray(rows) || rows.length !== 1) {
    throw new Error("the host does not see exactly one row of its own room");
  }
  const row: unknown = rows[0];
  const fields: Record<string, unknown> = isRecord(row) ? row : {};
  const { id, link_token: linkToken, status } = fields;
  if (typeof id !== "string" || typeof linkToken !== "string" || typeof status !== "string") {
    throw new Error("the host's room came back in an unexpected shape");
  }
  return { id, linkToken, status };
}

// "Nowa gra" as the Worker does it. Since S-02 (F1) create_room makes the link code in SQL and ignores the one it is
// sent, which still goes out because the signature stays; the code comes back from the room itself, as the Worker reads
// it. A second room of the same host closes the first one; confirmClose answers the "guests are still in it" question.
// adultCategories: the seed categories whose 18+ questions the host includes (S-17), none by default.
export async function seedRoom(
  host: Host,
  options: { nick?: string; confirmClose?: boolean; adultCategories?: string[] } = {},
): Promise<OwnRoom> {
  const result = await host.client.rpc("create_room", {
    p_nick: options.nick ?? "Host",
    p_link_token: newLinkToken(),
    p_categories: SEED_CATEGORIES,
    p_adult_categories: options.adultCategories ?? [],
    p_confirm_close: options.confirmClose ?? false,
  });
  if (result.error) {
    throw new Error(`create_room failed: ${String(result.status)} ${result.error.code}`);
  }
  const data: unknown = result.data;
  if (!isRecord(data) || data.ok !== true || typeof data.room_id !== "string") {
    throw new Error(`create_room refused the seed room: ${reasonOf(data)}`);
  }
  return readOwnRoom(host, data.room_id);
}

export interface SeededGuest {
  roomId: string;
  playerToken: string;
}

// A guest on a new phone: no session, a fresh player token like the one the Worker puts in the cookie. The token comes
// back to the test, which then acts as this guest.
export async function seedGuest(linkToken: string, nick: string): Promise<SeededGuest> {
  const playerToken = newPlayerToken();
  const result = await anonClient().rpc("join_room", {
    p_link_token: linkToken,
    p_nick: nick,
    p_player_token: playerToken,
  });
  if (result.error) {
    throw new Error(`join_room failed: ${String(result.status)} ${result.error.code}`);
  }
  const data: unknown = result.data;
  if (!isRecord(data) || data.ok !== true || typeof data.room_id !== "string") {
    throw new Error(`join_room refused the seed guest: ${reasonOf(data)}`);
  }
  return { roomId: data.room_id, playerToken };
}

// The nicks in the room's lobby, in seat order, as its host sees them through room_lobby.
export async function hostLobbyNicks(host: Host, roomId: string): Promise<string[]> {
  const result = await host.client.rpc("room_lobby", { p_room_id: roomId });
  if (result.error) {
    throw new Error(`room_lobby failed: ${String(result.status)} ${result.error.code}`);
  }
  const data: unknown = result.data;
  const players: unknown = isRecord(data) ? data.players : null;
  if (!Array.isArray(players)) {
    throw new Error("room_lobby gave the host no lobby of its own room");
  }
  return (players as unknown[]).map((player) => {
    if (!isRecord(player) || typeof player.nick !== "string") {
      throw new Error("room_lobby returned a player in an unexpected shape");
    }
    return player.nick;
  });
}
