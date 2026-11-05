import type { KeyboardEvent, ReactNode, Ref } from "react";
import { Field, FieldDescription, FieldError, FieldLabel } from "@/components/ui/field";
import { InputGroup, InputGroupAddon, InputGroupInput } from "@/components/ui/input-group";
import { QUESTION_MAX_LENGTH, questionLength } from "@/lib/rooms/shared";
import { cn } from "@/lib/utils";

// A question's field and what goes with it, shared by the host's game's question list (QuestionList) and a player's
// proposal (ProposalForm, S-10).

// While a move is on its way its buttons wait, still focusable (aria-disabled, not disabled), so the keyboard's place
// is not lost when the move is refused (as in JoinRequests). A busy button swaps only its icon for a spinner and keeps
// its word, so it keeps its width.
export const BUSY_BUTTON = "aria-disabled:cursor-default aria-disabled:opacity-50";

// The check before sending; the database has the final word (invalid_question_text).
export function questionError(text: string): string | undefined {
  const length = questionLength(text);
  if (length === 0) return "Wpisz treść pytania";
  if (length > QUESTION_MAX_LENGTH) return `Pytanie może mieć najwyżej ${QUESTION_MAX_LENGTH} znaków`;
  return undefined;
}

interface QuestionFieldProps {
  id: string;
  label: string;
  // In a row of the list: the label and the hint for a screen reader only, the row shows what is being changed.
  compact?: boolean;
  // The label alone for a screen reader only: the button that unfolds the field says the same words.
  labelHidden?: boolean;
  value: string;
  onChange: (value: string) => void;
  error?: string;
  inputRef?: Ref<HTMLInputElement>;
  // Added to the input's own classes, e.g. the room it keeps from the emotes' bar when it takes the focus.
  inputClassName?: string;
  onKeyDown?: (e: KeyboardEvent<HTMLInputElement>) => void;
  // A button on the field's line ("Dodaj", "Wyślij").
  action?: ReactNode;
  // In place of the list's example and hint: the host in the lobby sees two fields side by side.
  placeholder?: string;
  hint?: string;
}

// A question's field with the counter of NewGameForm's nick: the length as the database counts it, red past the limit.
export function QuestionField({
  id,
  label,
  compact = false,
  labelHidden = false,
  value,
  onChange,
  error,
  inputRef,
  inputClassName,
  onKeyDown,
  action,
  placeholder = compact ? undefined : "np. zjadłby pizzę z ananasem",
  hint = `Dokończ zdanie „Kto z nas najprawdopodobniej…”. Najwyżej ${QUESTION_MAX_LENGTH} znaków.`,
}: QuestionFieldProps) {
  const length = questionLength(value);
  const errorId = `${id}-error`;
  const hintId = `${id}-hint`;
  const input = (
    <InputGroup>
      <InputGroupInput
        ref={inputRef}
        id={id}
        className={cn("text-foreground", inputClassName)}
        value={value}
        onChange={(e) => {
          onChange(e.target.value);
        }}
        onKeyDown={onKeyDown}
        placeholder={placeholder}
        autoComplete="off"
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? errorId : hintId}
      />
      <InputGroupAddon align="inline-end">
        <span
          aria-hidden="true"
          className={cn(
            "text-xs tabular-nums",
            length > QUESTION_MAX_LENGTH ? "text-destructive" : "text-muted-foreground",
          )}
        >
          {length}/{QUESTION_MAX_LENGTH}
        </span>
      </InputGroupAddon>
    </InputGroup>
  );

  return (
    <Field data-invalid={error ? true : undefined}>
      <FieldLabel htmlFor={id} className={cn((compact || labelHidden) && "sr-only")}>
        {label}
      </FieldLabel>
      {action ? (
        <div className="flex gap-2">
          {input}
          {action}
        </div>
      ) : (
        input
      )}
      {error ? (
        // No role="alert": the focus goes back to the field, which reads this text through aria-describedby.
        <FieldError id={errorId} role={undefined}>
          {error}
        </FieldError>
      ) : (
        <FieldDescription id={hintId} className={cn(compact && "sr-only")}>
          {hint}
        </FieldDescription>
      )}
    </Field>
  );
}
