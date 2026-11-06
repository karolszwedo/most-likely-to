import { useEffect, useId, useRef, useState } from "react";
import { Check, ChevronDown, ChevronUp, Pencil, Plus, Shuffle, Trash2 } from "lucide-react";
import { ServerError } from "@/components/auth/ServerError";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { BUSY_BUTTON, QuestionField, questionError } from "@/components/room/QuestionField";
import type { ActionOutcome } from "@/components/room/room-actions";
import type { ListQuestion } from "@/lib/rooms/shared";
import { cn } from "@/lib/utils";

// The host's review of the game's question list in the lobby (S-06, PRD FR-012): "Przejrzyj pytania" under "Zacznij
// grę", folded, so starting at once stays one press. Its first press draws the list (question-list) and the section
// unfolds once the list arrives with the refreshed state: every question as the ending after "Kto z nas
// najprawdopodobniej…", with "Popraw" and "Usuń", and under the list "Dolosuj pytanie" and "Dodaj własne pytanie". Only
// the host's: RoomView.questions is null for a guest. The questions are plain text from the Worker, rendered as text,
// never as HTML (lessons.md). The list's moves ring no bell (only the host sees the list) and keep the view, so they
// keep the focus (RoomScreen's VIEW_CHANGING): after "Usuń" it goes to "Popraw" of the next row, or to "Dolosuj
// pytanie" after the last row; after "Zapisz" and "Anuluj" back to "Popraw" of the row. A removed or reworded question
// shows so at once, until the refreshed state confirms it: an entry keeps its position for good, so a row keeps its
// handle across refreshes.

// The host's moves on the list, through RoomScreen's act(): each answers ok or the refusal's text.
export interface QuestionListActions {
  onOpen: () => Promise<ActionOutcome>;
  onDraw: () => Promise<ActionOutcome>;
  onRemove: (position: number) => Promise<ActionOutcome>;
  onEdit: (position: number, text: string) => Promise<ActionOutcome>;
  onAdd: (text: string) => Promise<ActionOutcome>;
}

// /dev/room-states and /dev/room-window only: the starting state of the section; the real page never sets it.
export interface QuestionListPreview {
  // "Przejrzyj pytania" pressed: the list unfolded, or, with the view's questions null, still being drawn.
  open?: boolean;
  // The row of this position in "Popraw", with this text in its field.
  editing?: { position: number; text: string };
  // A refusal under the row of this position.
  rowError?: { position: number; message: string | null };
  // The text in "Dodaj własne pytanie", and whether it was checked as on "Dodaj" (its error shown).
  addText?: string;
  addShowErrors?: boolean;
}

interface Props {
  // The view's questions: null until "Przejrzyj pytania" drew the list.
  questions: ListQuestion[] | null;
  // Unique ids when /dev/room-states renders several screens on one page; "" on the real page.
  idPrefix: string;
  // Whether the host unfolded the section. RoomLobby keeps it: the game's column stops sticking while the list is open.
  open: boolean;
  onOpenChange: (open: boolean) => void;
  actions: QuestionListActions;
  preview?: QuestionListPreview;
}

// The text as the refreshed list will show it (private.question_text, as questionLength counts it), shown right after
// "Zapisz" until the state confirms it.
function savedQuestion(text: string): string {
  return text
    .normalize("NFC")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/[? ]+$/, "");
}

type RowMove = "edit" | "remove";

interface RowProps {
  question: ListQuestion;
  onEdit: (position: number, text: string) => Promise<ActionOutcome>;
  onRemove: (position: number) => Promise<ActionOutcome>;
  // Registers the row's "Popraw", where the focus goes after "Usuń" of the row above it.
  editButtonRef: (node: HTMLButtonElement | null) => void;
  onSaved: () => void;
  // The list hides the row and takes the focus on.
  onRemoved: (position: number) => void;
  preview?: { editing?: string; error?: string | null };
}

function QuestionRow({ question, onEdit, onRemove, editButtonRef, onSaved, onRemoved, preview }: RowProps) {
  // The text in "Popraw"'s field; null while the row shows its question.
  const [draft, setDraft] = useState<string | null>(preview?.editing ?? null);
  const [fieldError, setFieldError] = useState<string | undefined>(undefined);
  const [busy, setBusy] = useState<RowMove | null>(null);
  const [error, setError] = useState<string | null>(preview?.error ?? null);
  // After "Zapisz": the text as saved, until the refreshed state brings the row's new text.
  const [saved, setSaved] = useState<string | null>(null);
  // Adjusting state while rendering (react.dev, "You Might Not Need an Effect"): the row's new text from the state
  // replaces the one shown after "Zapisz".
  const [seen, setSeen] = useState(question);
  if (seen.text !== question.text || seen.own !== question.own) {
    setSeen(question);
    setSaved(null);
  }
  // The buttons say only "Popraw" and "Usuń"; the question they act on comes with them as their description. Below lg
  // they show their icons alone, so the question keeps the row's width on a phone; the word stays for screen readers.
  const textId = useId();
  const fieldId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const editRef = useRef<HTMLButtonElement | null>(null);
  // Where the focus goes once the row shows its new face: the field after "Popraw", "Popraw" after "Zapisz" or
  // "Anuluj". Never on the first render, so a preview in edit takes no focus.
  const focusNext = useRef<"field" | "edit" | null>(null);
  const text = saved ?? question.text;
  const own = saved !== null || question.own;
  const waiting = busy !== null || undefined;

  useEffect(() => {
    const target = focusNext.current;
    if (target === null) return;
    focusNext.current = null;
    if (target === "edit") {
      editRef.current?.focus();
      return;
    }
    const input = inputRef.current;
    if (!input) return;
    input.focus();
    input.setSelectionRange(input.value.length, input.value.length);
  });

  function startEdit() {
    if (busy !== null) return;
    setDraft(text);
    setFieldError(undefined);
    setError(null);
    focusNext.current = "field";
  }

  function cancel() {
    if (busy !== null) return;
    setDraft(null);
    setFieldError(undefined);
    setError(null);
    focusNext.current = "edit";
  }

  async function save() {
    if (busy !== null || draft === null) return;
    const sent = draft;
    const invalid = questionError(sent);
    if (invalid) {
      setFieldError(invalid);
      inputRef.current?.focus();
      return;
    }
    setBusy("edit");
    setError(null);
    const outcome = await onEdit(question.position, sent);
    setBusy(null);
    if (!outcome.ok) {
      setError(outcome.message);
      return;
    }
    setSaved(savedQuestion(sent));
    setDraft(null);
    focusNext.current = "edit";
    onSaved();
  }

  async function remove() {
    if (busy !== null) return;
    setBusy("remove");
    setError(null);
    const outcome = await onRemove(question.position);
    if (!outcome.ok) {
      setBusy(null);
      setError(outcome.message);
      return;
    }
    onRemoved(question.position);
  }

  return (
    <li className="flex flex-col gap-2 px-3 py-2.5">
      {draft === null ? (
        <div className="flex items-center justify-between gap-3">
          <span className="min-w-0 flex-1 wrap-anywhere">
            <span id={textId}>{text}</span>
            {own && (
              <Badge variant="secondary" className="ml-2 align-middle">
                własne
              </Badge>
            )}
          </span>
          <div className="flex shrink-0 gap-2">
            <Button
              ref={(node) => {
                editRef.current = node;
                editButtonRef(node);
              }}
              type="button"
              size="sm"
              variant="outline"
              aria-describedby={textId}
              aria-disabled={waiting}
              className={BUSY_BUTTON}
              onClick={startEdit}
            >
              <Pencil />
              <span className="sr-only lg:not-sr-only">Popraw</span>
            </Button>
            <Button
              type="button"
              size="sm"
              variant="outline"
              aria-describedby={textId}
              aria-disabled={waiting}
              className={BUSY_BUTTON}
              onClick={() => void remove()}
            >
              {busy === "remove" ? <Spinner aria-hidden="true" /> : <Trash2 />}
              <span className="sr-only lg:not-sr-only">Usuń</span>
            </Button>
          </div>
        </div>
      ) : (
        // Enter in the field sends the form ("Zapisz"), Escape cancels.
        <form
          noValidate
          className="flex flex-col gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            void save();
          }}
        >
          <QuestionField
            id={fieldId}
            label="Treść pytania"
            compact
            value={draft}
            onChange={(value) => {
              setDraft(value);
              setFieldError(undefined);
            }}
            error={fieldError}
            inputRef={inputRef}
            onKeyDown={(e) => {
              if (e.key !== "Escape") return;
              e.preventDefault();
              cancel();
            }}
          />
          <div className="flex gap-2">
            <Button type="submit" size="sm" aria-disabled={waiting} className={BUSY_BUTTON}>
              {busy === "edit" ? <Spinner aria-hidden="true" /> : <Check />}
              Zapisz
            </Button>
            <Button
              type="button"
              size="sm"
              variant="ghost"
              aria-disabled={waiting}
              className={BUSY_BUTTON}
              onClick={cancel}
            >
              Anuluj
            </Button>
          </div>
        </form>
      )}
      {/* A refusal by its code's text (src/lib/rooms/errors.ts), e.g. an entry removed already on the host's other
          screen. */}
      <ServerError message={error} />
    </li>
  );
}

export default function QuestionList({ questions, idPrefix, open, onOpenChange, actions, preview }: Props) {
  const [openError, setOpenError] = useState<string | null>(null);
  const [drawing, setDrawing] = useState(false);
  const [drawError, setDrawError] = useState<string | null>(null);
  const [addText, setAddText] = useState(preview?.addText ?? "");
  const [addFieldError, setAddFieldError] = useState<string | undefined>(() =>
    preview?.addShowErrors ? questionError(preview.addText ?? "") : undefined,
  );
  const [adding, setAdding] = useState(false);
  const [addError, setAddError] = useState<string | null>(null);
  // Removed on this screen and accepted, until the refreshed state drops them; a position is never used again.
  const [removed, setRemoved] = useState<ReadonlySet<number>>(() => new Set());
  // The screen reader's line after a move. The count makes a sentence said twice in a row new to the live region.
  const [announced, setAnnounced] = useState({ text: "", count: 0 });
  // Each row's "Popraw" by its position, while the row shows it.
  const editButtons = useRef(new Map<number, HTMLButtonElement>());
  const drawRef = useRef<HTMLButtonElement>(null);
  const addInputRef = useRef<HTMLInputElement>(null);
  const listId = `${idPrefix}questions`;
  const headingId = `${idPrefix}questions-heading`;
  // Pressed before there was a list: "Przejrzyj pytania" waits until the drawn list comes with the refreshed state.
  const opening = open && questions === null;
  const shown = open && questions !== null;
  const visible = questions?.filter((question) => !removed.has(question.position)) ?? [];

  function announce(text: string) {
    setAnnounced((prev) => ({ text, count: prev.count + 1 }));
  }

  async function toggle() {
    if (opening) return;
    if (questions !== null) {
      onOpenChange(!open);
      return;
    }
    setOpenError(null);
    onOpenChange(true);
    const outcome = await actions.onOpen();
    if (!outcome.ok) {
      onOpenChange(false);
      setOpenError(outcome.message);
      return;
    }
    announce("Pytania wylosowane.");
  }

  async function draw() {
    if (drawing) return;
    setDrawing(true);
    setDrawError(null);
    const outcome = await actions.onDraw();
    setDrawing(false);
    if (!outcome.ok) {
      setDrawError(outcome.message);
      return;
    }
    // The drawn question shows at the list's end with the refreshed state.
    announce("Dolosowano pytanie na koniec listy.");
  }

  async function add() {
    if (adding) return;
    const sent = addText;
    const invalid = questionError(sent);
    setAddFieldError(invalid);
    if (invalid) {
      addInputRef.current?.focus();
      return;
    }
    setAdding(true);
    setAddError(null);
    const outcome = await actions.onAdd(sent);
    setAdding(false);
    if (!outcome.ok) {
      setAddError(outcome.message);
      return;
    }
    // The field stays for the next question; text typed while the move was on its way stays too.
    setAddText((current) => (current === sent ? "" : current));
    announce("Dodano pytanie na koniec listy.");
  }

  function removedRow(position: number) {
    // The next row's "Popraw" (positions grow down the list), or "Dolosuj pytanie" after the last row.
    const next = [...editButtons.current].sort(([a], [b]) => a - b).find(([rowPosition]) => rowPosition > position);
    setRemoved((prev) => new Set(prev).add(position));
    announce("Usunięto pytanie.");
    (next ? next[1] : drawRef.current)?.focus();
  }

  return (
    <div className="flex flex-col gap-3">
      <Button
        type="button"
        variant="outline"
        className={cn("w-full", BUSY_BUTTON)}
        aria-expanded={shown}
        aria-controls={listId}
        aria-disabled={opening || undefined}
        onClick={() => void toggle()}
      >
        {opening ? <Spinner aria-hidden="true" /> : shown ? <ChevronUp /> : <ChevronDown />}
        Przejrzyj pytania
      </Button>
      {/* E.g. no question left in the picked categories (no_questions). */}
      <ServerError message={openError} />

      {shown && (
        <section id={listId} aria-labelledby={headingId} className="flex flex-col gap-3">
          <h2 id={headingId} className="text-sm font-medium">
            Pytania ({visible.length})
          </h2>
          {visible.length > 0 ? (
            <>
              <p className="text-muted-foreground text-sm">Kto z nas najprawdopodobniej…</p>
              <ul className="divide-y rounded-md border">
                {visible.map((question) => (
                  <QuestionRow
                    key={question.position}
                    question={question}
                    onEdit={actions.onEdit}
                    onRemove={actions.onRemove}
                    editButtonRef={(node) => {
                      if (node) editButtons.current.set(question.position, node);
                      else editButtons.current.delete(question.position);
                    }}
                    onSaved={() => {
                      announce("Zapisano pytanie.");
                    }}
                    onRemoved={removedRow}
                    preview={{
                      editing: preview?.editing?.position === question.position ? preview.editing.text : undefined,
                      error: preview?.rowError?.position === question.position ? preview.rowError.message : undefined,
                    }}
                  />
                ))}
              </ul>
            </>
          ) : (
            // "Zacznij grę" now answers list_empty.
            <p className="text-muted-foreground text-sm">Na liście nie ma pytań.</p>
          )}

          <div className="flex flex-col gap-3">
            <Button
              ref={drawRef}
              type="button"
              variant="outline"
              className={cn("w-full", BUSY_BUTTON)}
              aria-disabled={drawing || undefined}
              onClick={() => void draw()}
            >
              {drawing ? <Spinner aria-hidden="true" /> : <Shuffle />}
              Dolosuj pytanie
            </Button>
            {/* E.g. every question of the picked categories on the list already (no_new_questions), or list_full. */}
            <ServerError message={drawError} />
          </div>

          <form
            noValidate
            className="flex flex-col gap-3"
            onSubmit={(e) => {
              e.preventDefault();
              void add();
            }}
          >
            <QuestionField
              id={`${idPrefix}question-add`}
              label="Dodaj własne pytanie"
              value={addText}
              onChange={(value) => {
                setAddText(value);
                setAddFieldError(undefined);
              }}
              error={addFieldError}
              inputRef={addInputRef}
              action={
                <Button type="submit" variant="secondary" aria-disabled={adding || undefined} className={BUSY_BUTTON}>
                  {adding ? <Spinner aria-hidden="true" /> : <Plus />}
                  Dodaj
                </Button>
              }
            />
            <ServerError message={addError} />
          </form>
        </section>
      )}

      {/* On the page from the start, so the first move is heard too (a live region added together with its text is
          often not read). */}
      <p aria-live="polite" className="sr-only">
        {announced.text}
        {announced.count % 2 === 1 ? " " : ""}
      </p>
    </div>
  );
}
