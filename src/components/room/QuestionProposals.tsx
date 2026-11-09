import { useEffect, useId, useRef, useState } from "react";
import { Check, ChevronDown, ChevronUp, Lightbulb, X } from "lucide-react";
import { ServerError } from "@/components/auth/ServerError";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { focusTarget, rowsAfter, useRowFocus } from "@/components/room/focus";
import { BUSY_BUTTON } from "@/components/room/QuestionField";
import type { ActionOutcome } from "@/components/room/room-actions";
import { questionSentence, type QuestionProposal } from "@/lib/rooms/shared";
import { cn } from "@/lib/utils";

// A leader's (the host's or a co-host's, S-10, PRD FR-014) list of the players' proposals of questions, folded so the
// vote stays in reach (Karol's picks F and I on the screenshots of 2026-11-05). In a game a small pill on the line of
// "Link dla graczy", which follows it in the column, so the view moves down by only 8 px; with no link under it (a
// failed fetch) it stands as an ordinary line across the column, as it does in the lobby, where the link stands under
// the title. Unfolded it is that line with the rows under it, each with the whole sentence, its author's nick and, once
// the game has started, "Zatwierdź" next to "Odrzuć", one tap each. Nothing shows with no proposal waiting. The text is
// plain text from the Worker, rendered as text, never as HTML (lessons.md). RoomScreen shows it above the view and
// outside the part that takes the focus after a leader's move, so an answer does not move the focus unless it took the
// pressed button away with its row: then, once the refreshed list has no such proposal and only when the focus was
// lost, to the same button of the next row (from the list as it was at the press), else to the list's button while the
// list is there, else to the view's title (focus.ts); another leader's answer never moves it. Before the view's title
// in the DOM on purpose, as JoinRequests; the button is the caption, not a heading, so the title stays the view's first
// heading (AGENTS.md, "## UI"). Only a leader gets proposals, and only a leader's screen has this list, so nobody else
// hears one: room_lobby gives anyone else [].

type Answer = "approve" | "reject";

// /dev/room-states and /dev/room-window only: the starting state of the list; the real page never sets it.
export interface QuestionProposalsPreview {
  open?: boolean;
  // An answer on its way in the row of this number.
  busy?: { number: number; answer: Answer };
  // A refusal under the row of this number.
  rowError?: { number: number; message: string | null };
}

interface Props {
  // The proposals waiting, in the order of their numbers (room_lobby).
  proposals: QuestionProposal[];
  // The game has started: "Zatwierdź" (approve_proposal refuses in the lobby with game_not_started).
  approvable: boolean;
  // RoomScreen shows the players' link right after this list, so the folded pill can stand on its label's line.
  onLinkLine: boolean;
  onApprove: (number: number) => Promise<ActionOutcome>;
  onReject: (number: number) => Promise<ActionOutcome>;
  // How many refreshed states the screen has had (useRoomState), changed or not.
  refreshes: number;
  // Unique ids when /dev/room-states renders several screens on one page; "" on the real page.
  idPrefix: string;
  // RoomScreen's: the focus to the view's title, the last place after an answer that took the whole list away.
  focusTitle: () => void;
  preview?: QuestionProposalsPreview;
}

// The leader's own answer on its way or accepted, until the refreshed list has no such proposal (focus.ts).
interface ProposalMove {
  key: number;
  button: Answer;
  // The numbers of the rows after it, nearest first, as the list was at the press.
  next: number[];
}

interface RowProps {
  proposal: QuestionProposal;
  approvable: boolean;
  onApprove: (number: number) => Promise<ActionOutcome>;
  onReject: (number: number) => Promise<ActionOutcome>;
  refreshes: number;
  preview?: { busy?: Answer; error?: string | null };
}

const CAPTION = "Propozycje pytań";

// The ordinary line: the caption on the left, the chevron on the right, as wide as the column.
const FOLD_LINE = "h-auto min-h-9 w-full justify-start py-2 text-left whitespace-normal";

// What the screen reader hears when the list gets a proposal it did not have: "" when none.
function newProposalsText(added: QuestionProposal[]): string {
  if (added.length === 0) return "";
  if (added.length === 1) return `${added[0].nick} proponuje pytanie.`;
  return `Nowe propozycje pytań: ${added.length}.`;
}

// The sentence first, the author and the buttons on the line under it, so the leader reads and then acts; from lg all
// on one line. A long nick wraps in its own column. While one answer is on its way both buttons of the row wait, as in
// JoinRequests' RequestRow, and an accepted answer waits for the refreshed state to drop the row.
function ProposalRow({ proposal, approvable, onApprove, onReject, refreshes, preview }: RowProps) {
  const [busy, setBusy] = useState<Answer | null>(preview?.busy ?? null);
  const [error, setError] = useState<string | null>(preview?.error ?? null);
  // The count of refreshed states when the answer was accepted; null while no accepted answer waits.
  const [acceptedAt, setAcceptedAt] = useState<number | null>(null);
  // The latest count, for the answer's continuation, which runs with the count of the render it started in.
  const refreshesRef = useRef(refreshes);
  useEffect(() => {
    refreshesRef.current = refreshes;
  }, [refreshes]);
  // The buttons say only "Zatwierdź" and "Odrzuć"; the sentence and the nick come with them as their description.
  const textId = useId();
  const nickId = useId();
  const described = `${textId} ${nickId}`;

  // Adjusting state while rendering (react.dev, "You Might Not Need an Effect"): a state refreshed after the accepted
  // answer that still has this number frees the row, as in RequestRow; a state without it drops the row instead. A
  // number comes back after its author's removal, whose bell refreshes this screen first, and after the hourly sweep of
  // a lobby older than 12 h, which rings no bell: a screen that has not refreshed since may then, in that short window,
  // reject a newer proposal under the old number.
  if (acceptedAt !== null && refreshes > acceptedAt) {
    setAcceptedAt(null);
    setBusy(null);
  }

  async function answer(kind: Answer) {
    if (busy !== null) return;
    setBusy(kind);
    setError(null);
    const outcome = await (kind === "approve" ? onApprove(proposal.number) : onReject(proposal.number));
    if (outcome.ok) {
      setAcceptedAt(refreshesRef.current);
      return;
    }
    setBusy(null);
    setError(outcome.message);
  }

  return (
    // data-proposal and data-answer: where the focus goes after the answer of the row above (focus.ts).
    <li data-proposal={proposal.number} className="flex flex-col gap-2 px-3 py-2.5">
      <div className="flex flex-col gap-2 lg:flex-row lg:items-center lg:gap-4">
        <p id={textId} className="min-w-0 wrap-anywhere lg:flex-1">
          {questionSentence(proposal.text)}
        </p>
        <div className="flex items-center justify-between gap-3 lg:justify-end">
          <span
            id={nickId}
            className="text-muted-foreground min-w-0 flex-1 text-sm wrap-anywhere lg:flex-none lg:text-right"
          >
            {proposal.nick}
          </span>
          <div className="flex shrink-0 items-center gap-2">
            {approvable && (
              <Button
                type="button"
                size="sm"
                data-answer="approve"
                aria-describedby={described}
                aria-disabled={busy !== null || undefined}
                className={BUSY_BUTTON}
                onClick={() => void answer("approve")}
              >
                {busy === "approve" ? <Spinner aria-hidden="true" /> : <Check />}
                Zatwierdź
              </Button>
            )}
            <Button
              type="button"
              size="sm"
              variant="outline"
              data-answer="reject"
              aria-describedby={described}
              aria-disabled={busy !== null || undefined}
              className={BUSY_BUTTON}
              onClick={() => void answer("reject")}
            >
              {busy === "reject" ? <Spinner aria-hidden="true" /> : <X />}
              Odrzuć
            </Button>
          </div>
        </div>
      </div>
      {/* A refusal by its code's text (src/lib/rooms/errors.ts), e.g. a proposal already answered on another screen. */}
      <ServerError message={error} />
    </li>
  );
}

export default function QuestionProposals({
  proposals,
  approvable,
  onLinkLine,
  onApprove,
  onReject,
  refreshes,
  idPrefix,
  focusTitle,
  preview,
}: Props) {
  const [open, setOpen] = useState(preview?.open ?? false);
  const listRef = useRef<HTMLUListElement>(null);
  const toggleRef = useRef<HTMLButtonElement>(null);
  const numbers = proposals.map((proposal) => proposal.number);
  // The leader's own answer took its row away: the same button of the next row, else the list's button, else the
  // view's title (focus.ts).
  const answer = useRowFocus<ProposalMove>(numbers, (move) => {
    const rows = [...(listRef.current?.querySelectorAll<HTMLElement>("[data-proposal]") ?? [])];
    for (const number of move.next) {
      const row = rows.find((candidate) => candidate.dataset.proposal === String(number));
      if (focusTarget(row?.querySelector<HTMLElement>(`[data-answer="${move.button}"]`) ?? null)) return;
    }
    if (focusTarget(toggleRef.current)) return;
    focusTitle();
  });
  const approve = (number: number) =>
    answer({ key: number, button: "approve", next: rowsAfter(numbers, number) }, () => onApprove(number));
  const reject = (number: number) =>
    answer({ key: number, button: "reject", next: rowsAfter(numbers, number) }, () => onReject(number));
  // Adjusting state while rendering (react.dev, "You Might Not Need an Effect"): a number the list did not have before
  // is announced, never on the first render, and a list that shrank empties the region. The count makes a sentence said
  // twice in a row, a player's second proposal, new to the live region.
  const [shown, setShown] = useState(proposals);
  const [announced, setAnnounced] = useState({ text: "", count: 0 });
  if (JSON.stringify(proposals) !== JSON.stringify(shown)) {
    setShown(proposals);
    const added = proposals.filter(({ number }) => !shown.some((old) => old.number === number));
    setAnnounced((prev) => ({ text: newProposalsText(added), count: prev.count + 1 }));
  }
  // The last proposal answered: the next one comes folded, so it never pushes the vote down under the leader's thumb.
  if (open && proposals.length === 0) setOpen(false);

  const count = proposals.length;
  const pill = onLinkLine && !open;
  const listId = `${idPrefix}proposals`;

  return (
    <>
      {/* On the page from the start, so a screen reader hears the first proposal too (a live region added together with
          its text is often not read); the room's own announcements (src/lib/rooms/announce.ts) never say a proposal, so
          nothing is heard twice. */}
      <p aria-live="polite" className="sr-only">
        {announced.text}
        {announced.count % 2 === 1 ? " " : ""}
      </p>
      {count > 0 && (
        // The pill stands over the link's block, hence relative and z-10, and -mb-12 pulls the link up to it. One button
        // for the pill and the line, so the focus stays on it when it unfolds.
        <section aria-label={CAPTION} className={cn("flex flex-col gap-3", pill && "relative z-10 -mb-12 self-end")}>
          <Button
            ref={toggleRef}
            type="button"
            variant="outline"
            size={pill ? "sm" : "default"}
            className={cn(!pill && FOLD_LINE)}
            aria-expanded={open}
            aria-controls={listId}
            onClick={() => {
              setOpen(!open);
            }}
          >
            <Lightbulb />
            <span className={cn(!pill && "flex min-w-0 flex-1 flex-wrap items-baseline gap-x-2")}>
              <span>
                {CAPTION} ({count})
              </span>
              {!approvable && (
                <span className="text-muted-foreground text-xs font-normal">zatwierdzisz po starcie</span>
              )}
            </span>
            {open ? <ChevronUp /> : <ChevronDown />}
          </Button>
          {open && (
            <>
              <ul ref={listRef} id={listId} className="bg-card divide-y rounded-md border">
                {proposals.map((proposal) => (
                  <ProposalRow
                    key={proposal.number}
                    proposal={proposal}
                    approvable={approvable}
                    onApprove={approve}
                    onReject={reject}
                    refreshes={refreshes}
                    preview={{
                      busy: preview?.busy?.number === proposal.number ? preview.busy.answer : undefined,
                      error: preview?.rowError?.number === proposal.number ? preview.rowError.message : undefined,
                    }}
                  />
                ))}
              </ul>
              <p className="text-muted-foreground text-xs">
                {approvable
                  ? "Zatwierdzone pytanie pojawi się jako następne."
                  : "Zatwierdzisz je po starcie gry. Odrzucić możesz już teraz."}
              </p>
            </>
          )}
        </section>
      )}
    </>
  );
}
