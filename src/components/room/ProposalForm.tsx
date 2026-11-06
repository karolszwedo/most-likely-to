import { useEffect, useRef, useState } from "react";
import { ChevronDown, ChevronUp, Send } from "lucide-react";
import { ServerError } from "@/components/auth/ServerError";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { BUSY_BUTTON, QuestionField, questionError } from "@/components/room/QuestionField";
import type { ActionOutcome } from "@/components/room/room-actions";
import type { OwnProposals } from "@/lib/rooms/shared";
import { cn } from "@/lib/utils";

// A player's proposal of a question (S-10, PRD FR-013; Karol's picks B and J on the screenshots of 2026-11-05): any
// player, the host and a co-host too, on every screen of the lobby and the game. One button, "Zaproponuj pytanie",
// unfolds the field in its place, and under it stand the player's own counts, never how a decided proposal was decided
// (decision 5). RoomScreen keeps it outside the view, right before the emotes' bar, so a new round leaves the typed text
// and the focus alone: only the player's own press moves the focus, to the field it unfolded. With all 3 used up the
// form gives way to a quiet line, and what was typed goes with it, since it could no longer be sent. No heading, so the
// focus after a leader's move still goes to the view's title.

// /dev/room-states and /dev/room-window only: the starting state of the form; the real page never sets it.
export interface ProposalFormPreview {
  open?: boolean;
  text?: string;
  sending?: boolean;
  sent?: boolean;
  error?: string | null;
  // The text was checked as on "Wyślij" (its error shown).
  showErrors?: boolean;
}

interface Props {
  // The player's own counts (RoomView.own_proposals).
  own: OwnProposals;
  // Unique ids when /dev/room-states renders several screens on one page; "" on the real page.
  idPrefix: string;
  // In the lobby, where from lg the form stands under the game's column instead of across the frame.
  lobby: boolean;
  // The host in the lobby, who has "Dodaj własne pytanie" too.
  hostInLobby: boolean;
  onPropose: (text: string) => Promise<ActionOutcome>;
  preview?: ProposalFormPreview;
}

const LABEL = "Zaproponuj pytanie";
const HINT = "Dokończ zdanie „Kto z nas najprawdopodobniej…”. Prowadzący zdecyduje, czy trafi do gry.";
const HOST_LOBBY_HINT =
  "Propozycję zatwierdzisz dopiero po starcie gry. Od razu na listę trafia tylko „Dodaj własne pytanie” w „Przejrzyj pytania”.";
const SENT = "Wysłane. Prowadzący zdecyduje, czy trafi do gry.";
const LIMIT = "Nie masz już propozycji na tę grę.";

function proposalsLeftText(left: number): string {
  return left === 1 ? "została ci 1" : `zostały ci ${left}`;
}

function Counters({ own, className }: { own: OwnProposals; className?: string }) {
  const parts: string[] = [];
  if (own.waiting > 0) parts.push(`czeka na decyzję: ${own.waiting}`);
  if (own.left > 0) parts.push(proposalsLeftText(own.left));
  return <p className={cn("text-muted-foreground text-xs", className)}>{parts.join(" · ")}</p>;
}

export default function ProposalForm({ own, idPrefix, lobby, hostInLobby, onPropose, preview }: Props) {
  const [open, setOpen] = useState(preview?.open ?? false);
  const [text, setText] = useState(preview?.text ?? "");
  const [fieldError, setFieldError] = useState<string | undefined>(() =>
    preview?.showErrors ? questionError(preview.text ?? "") : undefined,
  );
  const [sending, setSending] = useState(preview?.sending ?? false);
  const [sent, setSent] = useState(preview?.sent ?? false);
  const [error, setError] = useState<string | null>(preview?.error ?? null);
  // The screen reader's line after sending. The count makes a sentence said twice in a row new to the live region.
  const [announced, setAnnounced] = useState({ text: "", count: 0 });
  const inputRef = useRef<HTMLInputElement>(null);
  // The press unfolded the field: the focus goes there once it is on the page. Never on the first render, so a preview
  // unfolded takes no focus, and never by anyone else's move.
  const focusField = useRef(false);
  const usedUp = own.left === 0;
  const id = `${idPrefix}proposal`;
  const panelId = `${id}-panel`;

  // Adjusting state while rendering (react.dev, "You Might Not Need an Effect"): text that can no longer be sent goes.
  if (usedUp && text !== "") setText("");

  useEffect(() => {
    if (!focusField.current) return;
    focusField.current = false;
    inputRef.current?.focus();
  });

  function toggle() {
    focusField.current = !open;
    setOpen(!open);
    setSent(false);
  }

  async function send() {
    if (sending) return;
    const sentText = text;
    const invalid = questionError(sentText);
    setFieldError(invalid);
    if (invalid) {
      inputRef.current?.focus();
      return;
    }
    setSending(true);
    setSent(false);
    setError(null);
    const outcome = await onPropose(sentText);
    setSending(false);
    if (!outcome.ok) {
      setError(outcome.message);
      return;
    }
    // The field stays for the next one, and text typed while the proposal was on its way stays too, unless that was the
    // last proposal: the field goes, and the text with it.
    setText((current) => (current === sentText ? "" : current));
    setSent(true);
    setAnnounced((prev) => ({ text: SENT, count: prev.count + 1 }));
  }

  return (
    // The same two boxes in every status, so the field and its focus outlive the game's start. From lg the lobby's grid
    // of RoomLobby, so the form stands under the game's column.
    <div className={cn(lobby && "lg:grid lg:grid-cols-3 lg:gap-x-12")}>
      <div className={cn("flex flex-col gap-3 border-t pt-6", lobby && "lg:col-span-2")}>
        {/* On the page from the start, so the first proposal is heard too (a live region added together with its text
            is often not read). */}
        <p aria-live="polite" className="sr-only">
          {announced.text}
          {announced.count % 2 === 1 ? " " : ""}
        </p>
        {usedUp ? (
          <div className="flex flex-col gap-1">
            <p className="text-muted-foreground text-sm">{LIMIT}</p>
            {own.waiting > 0 && <Counters own={own} />}
          </div>
        ) : (
          <>
            <Button
              type="button"
              variant="outline"
              className="w-full"
              aria-expanded={open}
              aria-controls={panelId}
              onClick={toggle}
            >
              {open ? <ChevronUp /> : <ChevronDown />}
              {LABEL}
            </Button>
            {open && (
              <form
                id={panelId}
                noValidate
                onSubmit={(e) => {
                  e.preventDefault();
                  void send();
                }}
              >
                <QuestionField
                  id={id}
                  label={LABEL}
                  labelHidden
                  value={text}
                  onChange={(value) => {
                    setText(value);
                    setFieldError(undefined);
                    setSent(false);
                  }}
                  error={fieldError}
                  inputRef={inputRef}
                  // Below lg the emotes' bar is fixed to the window's bottom: a focused field, its hint and the counters
                  // stay clear of it.
                  inputClassName="scroll-mb-44 lg:scroll-mb-0"
                  placeholder="np. zasnąłby na weselu"
                  hint={sent ? SENT : hostInLobby ? HOST_LOBBY_HINT : HINT}
                  action={
                    <Button
                      type="submit"
                      variant="secondary"
                      aria-disabled={sending || undefined}
                      className={BUSY_BUTTON}
                    >
                      {sending ? <Spinner aria-hidden="true" /> : <Send />}
                      Wyślij
                    </Button>
                  }
                />
              </form>
            )}
          </>
        )}
        {/* A refusal by its code's text (src/lib/rooms/errors.ts). proposal_limit outlives the form: the refreshed state
            says the same, and the line above takes the field's place. */}
        <ServerError message={error} />
        {!usedUp && <Counters own={own} className="text-center" />}
      </div>
    </div>
  );
}
