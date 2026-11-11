import { useRef, useState } from "react";
import { ServerError } from "@/components/auth/ServerError";
import { buttonVariants } from "@/components/ui/button";
import { DeleteGameButton, type DeletionPreview } from "@/components/room/DeleteGameButton";
import { focusTarget, rowsAfter, useRowFocus } from "@/components/room/focus";
import { sendRoomAction, type ActionOutcome } from "@/components/room/room-actions";
import type { HostGameRow } from "@/lib/rooms/game-list";

// The dev previews only (/dev/room-states): one row's "Usuń" pressed, its question open, on its way or refused. With a
// preview "Usuń grę" sends nothing: the row goes away at once, on its own screen only.
export interface HostGamesPreview {
  game?: { id: string } & DeletionPreview;
}

interface Props {
  // The host's ended games, newest first, as the page made them of host_games (src/lib/rooms/game-list.ts).
  games: HostGameRow[];
  // The database did not answer: its code's text instead of the list, never an empty list (gry.astro answers 503 or
  // 500).
  error?: string | null;
  // The states page has its own h1, so there the title is an h2 (as RoomCard's titleAs).
  titleAs?: "h1" | "h2";
  preview?: HostGamesPreview;
}

// The host's own deletion on its way or accepted, until the list has no such row (focus.ts): the ids of the rows after
// it, nearest first, as the list was at the press.
interface DeletionMove {
  key: string;
  next: string[];
}

// The host's list of own games (S-13, lista własnych gier: "Twoje gry", /gry; Karol's picks of 2026-11-11): the title
// first in the DOM, then one card per ended game (Karol's "R1 Osobne karty", the look of OpenRoomNotice) with its date,
// its questions and its players, and "Usuń" (DeleteGameButton). With no ended game, a sentence and "Nowa gra". An
// accepted deletion takes the row away here, with no refetch: the list has no live state, and the game is gone for
// good. A screen reader hears "Gra usunięta.", and the focus, when it was lost with the row, goes by the rule of
// focus.ts: "Usuń" of the next row, else the sentence of the empty list, else the page's title.
export default function HostGames({ games, error, titleAs: Title = "h1", preview }: Props) {
  const [rows, setRows] = useState(games);
  // The screen reader's line after a deletion. The count makes the same sentence said twice in a row new to the live
  // region (as QuestionList's).
  const [announced, setAnnounced] = useState({ text: "", count: 0 });
  const titleRef = useRef<HTMLHeadingElement>(null);
  const listRef = useRef<HTMLUListElement>(null);
  const emptyRef = useRef<HTMLParagraphElement>(null);
  const keys = rows.map((row) => row.id);
  const track = useRowFocus<DeletionMove>(keys, (move) => {
    for (const id of move.next) {
      const next = listRef.current?.querySelector<HTMLElement>(`[data-delete-game="${CSS.escape(id)}"]`) ?? null;
      if (focusTarget(next)) return;
    }
    if (focusTarget(emptyRef.current)) return;
    focusTarget(titleRef.current);
  });

  async function remove(id: string): Promise<ActionOutcome> {
    const send = (): Promise<ActionOutcome> =>
      preview ? Promise.resolve({ ok: true }) : sendRoomAction(id, "delete", {});
    const outcome = await track({ key: id, next: rowsAfter(keys, id) }, send);
    if (outcome.ok) {
      setRows((prev) => prev.filter((row) => row.id !== id));
      setAnnounced((prev) => ({ text: "Gra usunięta.", count: prev.count + 1 }));
    }
    return outcome;
  }

  let content: React.ReactNode;
  if (error) {
    content = <ServerError message={error} />;
  } else if (rows.length === 0) {
    content = (
      <div className="flex flex-col items-start gap-4">
        <p ref={emptyRef}>Nie masz jeszcze zakończonych gier.</p>
        <a href="/" className={buttonVariants({ variant: "secondary" })}>
          Nowa gra
        </a>
      </div>
    );
  } else {
    content = (
      <ul ref={listRef} className="flex flex-col gap-3">
        {rows.map((row) => (
          <li
            key={row.id}
            className="bg-card flex flex-wrap items-start justify-between gap-x-4 gap-y-3 rounded-xl border p-4"
          >
            <div className="flex min-w-0 flex-1 flex-col gap-1">
              <p className="font-medium">{row.date}</p>
              <p className="text-muted-foreground text-sm">{row.questions}</p>
              <p className="text-sm wrap-anywhere">{row.nicks}</p>
            </div>
            <DeleteGameButton
              gameId={row.id}
              date={row.date}
              onDelete={() => remove(row.id)}
              preview={preview?.game?.id === row.id ? preview.game : undefined}
            />
          </li>
        ))}
      </ul>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-1">
        <Title ref={titleRef} className="text-2xl font-semibold">
          Twoje gry
        </Title>
        <p className="text-muted-foreground text-sm">Zakończone gry, najnowsze na górze.</p>
      </div>
      {content}
      {/* On the page from the start, so the first deletion is heard too (a live region added together with its text is
          often not read). */}
      <p aria-live="polite" className="sr-only">
        {announced.text}
        {announced.count % 2 === 1 ? " " : ""}
      </p>
    </div>
  );
}
