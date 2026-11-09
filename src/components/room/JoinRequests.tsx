import { useEffect, useId, useRef, useState } from "react";
import { Hand, Undo2, UserCheck, UserX } from "lucide-react";
import { ServerError } from "@/components/auth/ServerError";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { focusTarget, rowsAfter, useRowFocus } from "@/components/room/focus";
import type { ActionOutcome } from "@/components/room/room-actions";

// A leader's (the host's or a co-host's, S-07) list of latecomers waiting to be let in (S-08, PRD FR-020): each nick on
// its own row with "Wpuść" and "Odrzuć", one tap each; "Odrzuć" asks nothing first, and the latecomer may ask again.
// Above it, in a section of their own, the guests who ask to come back to their own place from another device (S-04;
// layout E of Karol's choice, context/changes/rejoin-after-refresh/plan.md, Faza 4, 4.4): there "Wpuść" moves the place,
// with its results and vote, and the old device drops out of the game, so the section says to let in only the same
// person. RoomScreen shows both in the lobby (only requests to come back can wait there) and on every screen of a game
// in play (the voting before and after the leader's own vote, the reveal, a skipped last question), above the view and
// outside the part that takes the focus after a leader's move, so an answer does not move the focus unless it took the
// pressed button away with its row: then, once the refreshed list has no such nick and only when the focus was lost,
// to the same button of the next row of the same section (from the list as it was at the press), else to that
// section's caption, else to the other section's, else to the view's title (focus.ts); another leader's answer never
// moves it, and a row still there (the latecomer asked again under the same nick) keeps it. Before the view's title in
// the DOM on purpose, as the live banner and the note after a skip; captions, not headings, so the title stays the
// view's first heading (AGENTS.md, "## UI"). Only a leader gets requests: room_lobby gives anyone else [].

type Answer = "admit" | "reject";

// The section of a request: to come back to one's own place (S-04), or a latecomer's to come in (S-08).
type Section = "back" | "late";

interface Props {
  // The nicks waiting, in the order of asking (room_lobby).
  requests: string[];
  // The nicks among them that ask to come back to their own place (S-04), in the order of asking.
  returning: string[];
  onAdmit: (nick: string) => Promise<ActionOutcome>;
  onReject: (nick: string) => Promise<ActionOutcome>;
  // How many refreshed states the screen has had (useRoomState), changed or not.
  refreshes: number;
  // RoomScreen's: the focus to the view's title, the last place after an answer that took both sections away.
  focusTitle: () => void;
}

// The leader's own answer on its way or accepted, until the refreshed list has no such nick (focus.ts).
interface RequestMove {
  key: string;
  button: Answer;
  section: Section;
  // The nicks of the rows after it in its own section, nearest first, as the list was at the press.
  next: string[];
}

interface RowProps {
  nick: string;
  onAdmit: (nick: string) => Promise<ActionOutcome>;
  onReject: (nick: string) => Promise<ActionOutcome>;
  refreshes: number;
}

// While one answer is on its way both buttons of the row wait, still focusable (aria-disabled, not disabled), so the
// keyboard's place is not lost when the answer is refused (as in HostActions). The busy button swaps only its icon for
// a spinner and keeps its word, so it keeps its width: every row looks the same, the nick on the left and both buttons
// on its line, and a long nick wraps in its own column instead of pushing the buttons below it.
const ANSWER_BUTTON = "aria-disabled:cursor-default aria-disabled:opacity-50";

// What the screen reader hears when the lists get a nick they did not have: "" when none.
function newRequestsText(added: string[], returning: string[]): string {
  const back = added.filter((nick) => returning.includes(nick));
  const late = added.filter((nick) => !returning.includes(nick));
  const parts: string[] = [];
  if (back.length === 1) parts.push(`${back[0]} prosi o powrót na swoje miejsce.`);
  if (back.length > 1) parts.push(`Proszą o powrót na swoje miejsce: ${back.join(", ")}.`);
  if (late.length === 1) parts.push(`${late[0]} prosi o wejście.`);
  if (late.length > 1) parts.push(`Proszą o wejście: ${late.join(", ")}.`);
  return parts.join(" ");
}

function RequestRow({ nick, onAdmit, onReject, refreshes }: RowProps) {
  const [busy, setBusy] = useState<Answer | null>(null);
  const [error, setError] = useState<string | null>(null);
  // The count of refreshed states when the answer was accepted; null while no accepted answer waits.
  const [acceptedAt, setAcceptedAt] = useState<number | null>(null);
  // The latest count, for the answer's continuation, which runs with the count of the render it started in.
  const refreshesRef = useRef(refreshes);
  useEffect(() => {
    refreshesRef.current = refreshes;
  }, [refreshes]);
  // The buttons say only "Wpuść" and "Odrzuć"; the nick they act on comes with them as their description.
  const nickId = useId();

  // F4 of S-08 (context/archive/2026-10-22-latecomer-admission/follow-ups/review-fixes.md): a state refreshed after the
  // accepted answer still has this nick, so the latecomer asked again under it before this screen saw the answer (e.g.
  // after a failed refresh), and the row is a new request: free again. Adjusting state while rendering (react.dev, "You
  // Might Not Need an Effect"); a state without the nick drops the row instead. Known limit: a fetch already on its way
  // before the answer landed may free the row for a moment, until the next refresh drops it.
  if (acceptedAt !== null && refreshes > acceptedAt) {
    setAcceptedAt(null);
    setBusy(null);
  }

  async function answer(kind: Answer) {
    if (busy !== null) return;
    setBusy(kind);
    setError(null);
    const outcome = await (kind === "admit" ? onAdmit(nick) : onReject(nick));
    // Accepted: the row stays busy until a refreshed state drops it from the list, or still has the nick (above).
    if (outcome.ok) {
      setAcceptedAt(refreshesRef.current);
      return;
    }
    setBusy(null);
    setError(outcome.message);
  }

  return (
    // data-request and data-answer: where the focus goes after the answer of the row above (focus.ts).
    <li data-request={nick} className="flex flex-col gap-2 px-3 py-2.5">
      <div className="flex items-center justify-between gap-3">
        <span id={nickId} className="min-w-0 flex-1 wrap-anywhere">
          {nick}
        </span>
        <div className="flex shrink-0 gap-2">
          <Button
            type="button"
            size="sm"
            data-answer="admit"
            aria-describedby={nickId}
            aria-disabled={busy !== null || undefined}
            className={ANSWER_BUTTON}
            onClick={() => void answer("admit")}
          >
            {busy === "admit" ? <Spinner aria-hidden="true" /> : <UserCheck />}
            Wpuść
          </Button>
          <Button
            type="button"
            size="sm"
            variant="outline"
            data-answer="reject"
            aria-describedby={nickId}
            aria-disabled={busy !== null || undefined}
            className={ANSWER_BUTTON}
            onClick={() => void answer("reject")}
          >
            {busy === "reject" ? <Spinner aria-hidden="true" /> : <UserX />}
            Odrzuć
          </Button>
        </div>
      </div>
      {/* A refusal by its code's text (src/lib/rooms/errors.ts), e.g. a request already answered on another screen. */}
      <ServerError message={error} />
    </li>
  );
}

export default function JoinRequests({ requests, returning, onAdmit, onReject, refreshes, focusTitle }: Props) {
  const backsRef = useRef<HTMLElement>(null);
  const backsCaptionRef = useRef<HTMLParagraphElement>(null);
  const latecomersRef = useRef<HTMLElement>(null);
  const latecomersCaptionRef = useRef<HTMLParagraphElement>(null);
  // The leader's own answer took its row away: the same button of the next row in its section, else that section's
  // caption, else the other section's, else the view's title (focus.ts).
  const answer = useRowFocus<RequestMove>(requests, (move) => {
    const back = move.section === "back";
    const section = back ? backsRef.current : latecomersRef.current;
    const rows = [...(section?.querySelectorAll<HTMLElement>("[data-request]") ?? [])];
    for (const nick of move.next) {
      const row = rows.find((candidate) => candidate.dataset.request === nick);
      if (focusTarget(row?.querySelector<HTMLElement>(`[data-answer="${move.button}"]`) ?? null)) return;
    }
    if (focusTarget(back ? backsCaptionRef.current : latecomersCaptionRef.current)) return;
    if (focusTarget(back ? latecomersCaptionRef.current : backsCaptionRef.current)) return;
    focusTitle();
  });
  // Adjusting state while rendering (react.dev, "You Might Not Need an Effect"): a nick the lists did not have before is
  // announced, never on the first render, and a list that shrank empties the region, so a latecomer who asks again
  // after "Odrzuć" is heard again.
  const [shown, setShown] = useState(requests);
  const [announced, setAnnounced] = useState("");
  if (JSON.stringify(requests) !== JSON.stringify(shown)) {
    setShown(requests);
    setAnnounced(
      newRequestsText(
        requests.filter((nick) => !shown.includes(nick)),
        returning,
      ),
    );
  }

  const backs = requests.filter((nick) => returning.includes(nick));
  const latecomers = requests.filter((nick) => !returning.includes(nick));
  // A section's rows; an answer notes the rows after it in the same section, for the focus.
  const rows = (section: Section, nicks: string[]) => (
    <ul className="bg-card divide-y rounded-md border">
      {nicks.map((nick) => (
        <RequestRow
          key={nick}
          nick={nick}
          onAdmit={(asked) =>
            answer({ key: asked, button: "admit", section, next: rowsAfter(nicks, asked) }, () => onAdmit(asked))
          }
          onReject={(asked) =>
            answer({ key: asked, button: "reject", section, next: rowsAfter(nicks, asked) }, () => onReject(asked))
          }
          refreshes={refreshes}
        />
      ))}
    </ul>
  );

  return (
    <>
      {/* On the page from the start, so a screen reader hears the first request too (a live region added together with
          its text is often not read); the room's own announcements (src/lib/rooms/announce.ts) never say a request,
          so nothing is heard twice. */}
      <p aria-live="polite" className="sr-only">
        {announced}
      </p>
      {backs.length > 0 && (
        <section ref={backsRef} aria-label="Chcą wrócić na swoje miejsce" className="flex flex-col gap-3">
          <p ref={backsCaptionRef} className="flex items-center gap-2 text-sm font-medium">
            <Undo2 aria-hidden="true" className="text-muted-foreground size-4" />
            Chcą wrócić na swoje miejsce ({backs.length})
          </p>
          {rows("back", backs)}
          <p className="text-muted-foreground text-xs">
            Wpuść tylko, jeśli to na pewno ta osoba: wróci z wynikami i oddanym głosem, a jej stare urządzenie wypadnie
            z gry.
          </p>
        </section>
      )}
      {latecomers.length > 0 && (
        <section ref={latecomersRef} aria-label="Proszą o wejście" className="flex flex-col gap-3">
          <p ref={latecomersCaptionRef} className="flex items-center gap-2 text-sm font-medium">
            <Hand aria-hidden="true" className="text-muted-foreground size-4" />
            Proszą o wejście ({latecomers.length})
          </p>
          {rows("late", latecomers)}
          <p className="text-muted-foreground text-xs">Wpuszczona osoba zagłosuje od następnego pytania.</p>
        </section>
      )}
    </>
  );
}
