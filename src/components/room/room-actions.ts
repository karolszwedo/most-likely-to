import { logEvent } from "@/lib/log";
import { roomErrorMessage } from "@/lib/rooms/errors";

// The game's actions from the room screen (src/pages/api/rooms/[id]/start.ts, vote.ts, reveal.ts, react.ts, next.ts,
// skip.ts, end.ts, admit.ts, reject.ts, cohost.ts, color.ts, question-list.ts, question-draw.ts, question-remove.ts,
// question-edit.ts, question-add.ts): JSON from the app's own page (the routes check Content-Type and Origin), answered
// {ok: true} or {error: code}. A vote, "Odsłoń wynik", a thumb on the reveal (react, {reaction}), "Następne pytanie"
// and "Pomiń pytanie" carry the number of the question on the screen ({round}), so none of them lands in a question the
// player has not seen. A leader's (the host's or a co-host's) "Wpuść" (admit) and "Odrzuć" (reject) carry the
// latecomer's nick from the list of requests ({nick}). The host's switch of the co-host role (cohost) carries the
// guest's nick and the role asked for ({nick, cohost}). A player's pick of their own colour (color, S-18) carries the
// colour's number ({color}). The host's moves on the game's question list in the lobby:
// "Przejrzyj pytania" (question-list) and "Dolosuj pytanie" (question-draw) with {}, "Usuń" (question-remove) with the
// entry's {position}, "Popraw" (question-edit) with {position, text} and "Dodaj własne" (question-add) with {text}. A
// vote's target and a thumb go only in the body: never in the URL, a log line or storage on the device (AGENTS.md, Hard
// Rules; S-04 shows a vote after a reload). Browser lines go through src/lib/log.ts too, so the target cannot slip into
// one, nor can a question's text. A player's emote to the whole room, from every screen of the room (emote,
// src/pages/api/rooms/[id]/emote.ts), carries only the emote's id ({emote}, src/lib/rooms/emotes.ts).

export type RoomAction =
  | "start"
  | "vote"
  | "reveal"
  | "react"
  | "next"
  | "skip"
  | "end"
  | "admit"
  | "reject"
  | "cohost"
  | "color"
  | "question-list"
  | "question-draw"
  | "question-remove"
  | "question-edit"
  | "question-add"
  | "emote";

// The screen shows a refusal by its code's text (src/lib/rooms/errors.ts), never text from the answer.
export type ActionOutcome = { ok: true } | { ok: false; message: string };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function errorName(error: unknown): string {
  return error instanceof Error ? error.name : "unknown";
}

// A code no map knows ("unexpected") gives the generic text.
function refused(code: string): ActionOutcome {
  return { ok: false, message: roomErrorMessage(code) ?? "" };
}

export async function sendRoomAction(roomId: string, action: RoomAction, body: unknown): Promise<ActionOutcome> {
  let res: Response;
  try {
    res = await fetch(`/api/rooms/${roomId}/${action}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      cache: "no-store",
    });
  } catch (error) {
    logEvent("warn", { op: action, roomId, step: "fetch", errName: errorName(error) });
    return refused("unexpected");
  }

  let answer: unknown;
  try {
    answer = await res.json();
  } catch (error) {
    logEvent("warn", { op: action, roomId, step: "answer", status: res.status, errName: errorName(error) });
    return refused(res.status >= 500 ? "service_unavailable" : "unexpected");
  }
  if (res.ok && isRecord(answer) && answer.ok === true) return { ok: true };
  if (isRecord(answer) && typeof answer.error === "string") return refused(answer.error);
  logEvent("warn", { op: action, roomId, step: "answer", status: res.status, field: "error" });
  return refused("unexpected");
}
