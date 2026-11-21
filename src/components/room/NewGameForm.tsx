import React, { useEffect, useRef, useState } from "react";
import { Play, TriangleAlert, User } from "lucide-react";
import { FormField } from "@/components/auth/FormField";
import { ServerError } from "@/components/auth/ServerError";
import { SubmitButton } from "@/components/auth/SubmitButton";
import { useSubmitPending } from "@/components/auth/useSubmitPending";
import { TILE_LIST, TILE_ON_CARD } from "@/components/room/surfaces";
import { useNickField } from "@/components/room/useNickField";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { FieldDescription, FieldError, FieldGroup, FieldSet } from "@/components/ui/field";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import { NICK_MAX_LENGTH, nickLength, playerCountLabel } from "@/lib/rooms/shared";

// Only id and name: the page passes them as props, so the question base itself never reaches the browser (lessons.md).
// A category's tile on the form's card: the category's checkbox and its 18+; exported for the states' matrix
// (/dev/ui-kitchen-sink).
export const CATEGORY_TILE = `${TILE_ON_CARD} flex items-center justify-between gap-4 px-3 py-2.5`;

interface Category {
  id: string;
  name: string;
}

export interface CategoryChoice {
  on: boolean;
  adult: boolean;
}

// Starting state for /dev/room-states, which renders several forms on one page; the real page never sets it.
interface Preview {
  idPrefix: string;
  nick?: string;
  // The categories picked at the start; without it none is, as on the real page.
  picked?: readonly string[];
  showErrors?: boolean;
  confirming?: boolean;
  pending?: boolean;
}

interface Props {
  categories: Category[];
  // The host's open room when guests are in it: "Nowa gra" closes it, so the form asks first.
  roomToClose?: { players: number } | null;
  serverError?: string | null;
  preview?: Preview;
}

interface FieldErrors {
  nick?: string;
  categories?: string;
}

function getFieldErrors(nick: string, choices: Record<string, CategoryChoice>): FieldErrors {
  const errors: FieldErrors = {};
  const length = nickLength(nick);
  if (length === 0) {
    errors.nick = "Podaj swój nick";
  } else if (length > NICK_MAX_LENGTH) {
    errors.nick = `Nick może mieć najwyżej ${NICK_MAX_LENGTH} znaków`;
  }
  if (!Object.values(choices).some((choice) => choice.on)) {
    errors.categories = "Wybierz co najmniej jedną kategorię";
  }
  return errors;
}

// The shortcut over the categories (categories-unticked): it unpicks them all only when every one is picked, and
// picks them all otherwise.
export function allCategoriesPicked(choices: Record<string, CategoryChoice>): boolean {
  const all = Object.values(choices);
  return all.length > 0 && all.every((choice) => choice.on);
}

// Every category picked or none. Each one's 18+ stays as it was, as when a single category is unpicked and picked
// again: the shortcut itself never turns 18+ on.
export function pickAllCategories(
  choices: Record<string, CategoryChoice>,
  on: boolean,
): Record<string, CategoryChoice> {
  return Object.fromEntries(Object.entries(choices).map(([id, choice]) => [id, { ...choice, on }]));
}

export default function NewGameForm({ categories, roomToClose, serverError, preview }: Props) {
  const formRef = useRef<HTMLFormElement>(null);
  // The host's remembered nick (S-14): creating a game never answers nick_taken, so only a preview goes without it.
  const [nick, setNick] = useNickField(preview?.nick ?? "", formRef, { enabled: !preview, suggest: true });
  // No category picked and 18+ off: the host picks the categories (Karol, 21.11.2026, categories-unticked), instead of
  // unpicking them from "all on", the default from the interview for S-02.
  const [choices, setChoices] = useState<Record<string, CategoryChoice>>(() =>
    Object.fromEntries(
      categories.map((category) => [
        category.id,
        { on: preview?.picked?.includes(category.id) ?? false, adult: false },
      ]),
    ),
  );
  const [errors, setErrors] = useState<FieldErrors>(() => (preview?.showErrors ? getFieldErrors(nick, choices) : {}));
  const [confirming, setConfirming] = useState(preview?.confirming ?? false);
  const [pending, setPending] = useSubmitPending(preview?.pending);
  const isPreview = Boolean(preview);
  const idPrefix = preview ? `${preview.idPrefix}-` : "";
  const length = nickLength(nick);

  // The warning replaces "Załóż grę"; focus moves to the button that confirms instead of falling to the page top.
  useEffect(() => {
    if (confirming && !isPreview) {
      formRef.current?.querySelector<HTMLButtonElement>('button[type="submit"]')?.focus();
    }
  }, [confirming, isPreview]);

  function clearError(field: keyof FieldErrors) {
    if (errors[field]) setErrors((prev) => ({ ...prev, [field]: undefined }));
  }

  function setChoice(id: string, change: Partial<CategoryChoice>) {
    setChoices((prev) => ({ ...prev, [id]: { ...prev[id], ...change } }));
    clearError("categories");
  }

  const allPicked = allCategoriesPicked(choices);

  // The same button stays under the focus, only its word changes.
  function toggleAll() {
    setChoices((prev) => pickAllCategories(prev, !allCategoriesPicked(prev)));
    clearError("categories");
  }

  function handleSubmit(e: React.SubmitEvent<HTMLFormElement>) {
    const next = getFieldErrors(nick, choices);
    setErrors(next);
    if (next.nick || next.categories) {
      e.preventDefault();
      // Send the user (and a screen reader) straight to the first broken field.
      const firstInvalid = next.nick ? '[name="nick"]' : '[data-slot="checkbox"]';
      e.currentTarget.querySelector<HTMLElement>(firstInvalid)?.focus();
      return;
    }
    if (roomToClose && !confirming) {
      // First click with guests in the open room: ask inside the form, no window.confirm.
      e.preventDefault();
      setConfirming(true);
      return;
    }
    // Fields stay enabled: disabled inputs would drop out of the posted form.
    setPending(true);
  }

  return (
    <form ref={formRef} method="POST" action="/api/rooms" onSubmit={handleSubmit} noValidate>
      <FieldGroup>
        <FormField
          id={`${idPrefix}nick`}
          name="nick"
          label="Twój nick"
          value={nick}
          onChange={(v) => {
            setNick(v);
            clearError("nick");
          }}
          placeholder="np. Ola"
          error={errors.nick}
          hint={`Tak zobaczą cię inni gracze. Najwyżej ${NICK_MAX_LENGTH} znaków.`}
          icon={<User className="size-4" />}
          endContent={
            <span
              aria-hidden="true"
              className={cn(
                "text-xs tabular-nums",
                length > NICK_MAX_LENGTH ? "text-destructive" : "text-muted-foreground",
              )}
            >
              {length}/{NICK_MAX_LENGTH}
            </span>
          }
        />

        {/* A <legend> must be the fieldset's first child and is laid out outside its box, so the shortcut beside the
            heading gets a row of its own, and the row's text names the group instead (Karol's W1, categories-unticked).
            The shortcut is a plain button, never a submit one, and has no name, so the form posts only categories. */}
        <FieldSet className="gap-3" aria-labelledby={`${idPrefix}categories-heading`}>
          <div className="flex items-center justify-between gap-2">
            <span id={`${idPrefix}categories-heading`} className="text-sm font-medium">
              Kategorie pytań
            </span>
            <Button type="button" variant="link" size="sm" className="-my-1.5 -mr-3" onClick={toggleAll}>
              {allPicked ? "Odznacz wszystkie" : "Zaznacz wszystkie"}
            </Button>
          </div>
          <FieldDescription>Pytania 18+ włączasz osobno w każdej kategorii.</FieldDescription>
          <ul className={TILE_LIST}>
            {categories.map((category) => {
              const choice = choices[category.id];
              const categoryId = `${idPrefix}category-${category.id}`;
              const adultId = `${idPrefix}adult-${category.id}`;
              return (
                <li key={category.id} className={CATEGORY_TILE}>
                  <div className="flex items-center gap-3">
                    <Checkbox
                      id={categoryId}
                      name="category"
                      value={category.id}
                      checked={choice.on}
                      onCheckedChange={(checked) => {
                        setChoice(category.id, { on: checked === true });
                      }}
                      aria-invalid={errors.categories ? true : undefined}
                    />
                    <Label htmlFor={categoryId}>{category.name}</Label>
                  </div>
                  <div className="flex items-center gap-2">
                    {/* Off while the category is off; a disabled checkbox is not posted either. */}
                    <Checkbox
                      id={adultId}
                      name="adult"
                      value={category.id}
                      checked={choice.on && choice.adult}
                      disabled={!choice.on}
                      onCheckedChange={(checked) => {
                        setChoice(category.id, { adult: checked === true });
                      }}
                    />
                    <Label htmlFor={adultId} className="text-muted-foreground">
                      18+<span className="sr-only"> w kategorii {category.name}</span>
                    </Label>
                  </div>
                </li>
              );
            })}
          </ul>
          {errors.categories && <FieldError>{errors.categories}</FieldError>}
        </FieldSet>

        <ServerError message={serverError} />

        {confirming && roomToClose ? (
          <div className="flex flex-col gap-3">
            <Alert>
              <TriangleAlert />
              {/* The title may wrap: on a phone a one-line clamp cut off "zamknięty", the word that matters. */}
              <AlertTitle className="line-clamp-none">
                Stary pokój ({playerCountLabel(roomToClose.players)}) zostanie zamknięty
              </AlertTitle>
              <AlertDescription>Gracze z tamtego pokoju zobaczą, że gra się skończyła.</AlertDescription>
            </Alert>
            {/* A hidden field and not the button's value: the button disables itself on submit, and a disabled
                submitter drops its name and value from the post. */}
            <input type="hidden" name="confirm_close" value="1" />
            <SubmitButton pending={pending} pendingText="Zakładanie…" icon={<Play className="size-4" />}>
              Zamknij stary pokój i załóż grę
            </SubmitButton>
            <Button
              type="button"
              variant="ghost"
              disabled={pending}
              onClick={() => {
                setConfirming(false);
              }}
            >
              Anuluj
            </Button>
          </div>
        ) : (
          <SubmitButton pending={pending} pendingText="Zakładanie…" icon={<Play className="size-4" />}>
            Załóż grę
          </SubmitButton>
        )}
      </FieldGroup>
    </form>
  );
}
