import React, { useRef, useState } from "react";
import { DoorOpen, Hand, Undo2, User } from "lucide-react";
import { FormField } from "@/components/auth/FormField";
import { ServerError } from "@/components/auth/ServerError";
import { SubmitButton } from "@/components/auth/SubmitButton";
import { useSubmitPending } from "@/components/auth/useSubmitPending";
import { useNickField } from "@/components/room/useNickField";
import { Button } from "@/components/ui/button";
import { FieldGroup } from "@/components/ui/field";
import { Spinner } from "@/components/ui/spinner";
import type { Messages, UiLang } from "@/lib/i18n";
import { I18nProvider, useT } from "@/lib/i18n/react";
import { cn } from "@/lib/utils";
import { NICK_MAX_LENGTH, nickLength } from "@/lib/rooms/shared";

// Starting state for the previews (/dev/room-states renders several forms on one page, LinkScreen one in
// /dev/link-window); the real page never sets it.
export interface JoinFormPreview {
  idPrefix: string;
  nick?: string;
  showErrors?: boolean;
  pending?: boolean;
  // The request to come back on its way (S-04).
  returnPending?: boolean;
}

// "join": a room in the lobby, the guest is in at once. "request": a game in play, the form asks a leader (the host or
// a co-host) to let the latecomer in (S-08, S-07); "request-again": the same after a leader turned the request away.
export type JoinFormVariant = "join" | "request" | "request-again";

interface Props {
  // The code from /j/<code>, already checked by the page. It goes back in a hidden field; the nick never goes in a URL.
  linkToken: string;
  serverError?: string | null;
  variant?: JoinFormVariant;
  // The nick asked with before, after "Odrzuć": the page has it from the latecomer's own request, never from a URL.
  initialNick?: string;
  // The page lets the form suggest the nick this browser remembers from its last game (S-14); off after nick_taken, so
  // the field stays empty then.
  suggestNick?: boolean;
  // The nick of a place the guest may ask to come back to (S-04): the nick the form was refused as taken (the link
  // pages' short cookie), or that of a request to come back a leader turned away. Never from a URL.
  takenNick?: string | null;
  preview?: JoinFormPreview;
}

// Each variant's words in the dictionary (link.joinForm).
const VARIANT_TEXTS = { join: "join", request: "request", "request-again": "requestAgain" } as const;

type JoinFormTexts = Messages["link"]["joinForm"];

function getNickError(nick: string, t: JoinFormTexts): string | undefined {
  const length = nickLength(nick);
  if (length === 0) return t.nickMissing;
  if (length > NICK_MAX_LENGTH) return t.nickTooLong(NICK_MAX_LENGTH);
  return undefined;
}

// The guest's way in: a nick, and with a taken nick (takenNick, S-04) first the question whether the place is theirs,
// layout C of Karol's choice (context/archive/2026-11-03-rejoin-after-refresh/plan.md, Faza 4, 4.4): "To ty?" and the
// request to come back on top, then the form for another nick under "albo…". The return is its own small form with the
// nick in a hidden field and intent=return (POST /api/rooms/join), so the form for another nick keeps its own field and
// button.
// The island's root: the page's language (lang, from Astro.locals.lang) for the dictionary of its whole tree.
export default function JoinForm({ lang, ...props }: Props & { lang: UiLang }) {
  return (
    <I18nProvider lang={lang}>
      <JoinFormContent {...props} />
    </I18nProvider>
  );
}

function JoinFormContent({
  linkToken,
  serverError,
  variant = "join",
  initialNick,
  suggestNick = false,
  takenNick = null,
  preview,
}: Props) {
  const t = useT().link.joinForm;
  const formRef = useRef<HTMLFormElement>(null);
  // The remembered nick (S-14) neither in a preview, nor with the nick from the server ("Poproś jeszcze raz"), nor next
  // to a taken nick, whose field is for another one.
  const [nick, setNick] = useNickField(preview?.nick ?? initialNick ?? "", formRef, {
    enabled: !preview,
    suggest: suggestNick && !initialNick && takenNick === null,
  });
  const [error, setError] = useState(() => (preview?.showErrors ? getNickError(nick, t) : undefined));
  const [pending, setPending] = useSubmitPending(preview?.pending);
  const [returnPending, setReturnPending] = useSubmitPending(preview?.returnPending);
  const idPrefix = preview ? `${preview.idPrefix}-` : "";
  const length = nickLength(nick);
  const texts = t[VARIANT_TEXTS[variant]];
  const offer = takenNick !== null;

  function handleSubmit(e: React.SubmitEvent<HTMLFormElement>) {
    const next = getNickError(nick, t);
    setError(next);
    if (next) {
      e.preventDefault();
      e.currentTarget.querySelector<HTMLInputElement>('[name="nick"]')?.focus();
      return;
    }
    // The field stays enabled: a disabled input would drop out of the posted form.
    setPending(true);
  }

  const form = (
    <form ref={formRef} method="POST" action="/api/rooms/join" onSubmit={handleSubmit} noValidate>
      <input type="hidden" name="link" value={linkToken} />
      <FieldGroup>
        <FormField
          id={`${idPrefix}nick`}
          name="nick"
          label={offer ? t.otherNickLabel : t.nickLabel}
          value={nick}
          onChange={(v) => {
            setNick(v);
            if (error) setError(undefined);
          }}
          placeholder={t.nickPlaceholder}
          error={error}
          hint={texts.hint(NICK_MAX_LENGTH)}
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

        {/* With a taken nick a refusal goes with the return, above. */}
        {!offer && <ServerError message={serverError} />}

        {offer ? (
          // The way for someone else with the same nick: second to the return, so an outline button.
          <Button type="submit" variant="outline" disabled={pending} className="w-full">
            {pending ? <Spinner aria-hidden="true" /> : variant === "join" ? <DoorOpen /> : <Hand />}
            {pending ? texts.pending : texts.submit}
          </Button>
        ) : (
          <SubmitButton
            pending={pending}
            pendingText={texts.pending}
            icon={variant === "join" ? <DoorOpen className="size-4" /> : <Hand className="size-4" />}
          >
            {texts.submit}
          </SubmitButton>
        )}
      </FieldGroup>
    </form>
  );

  if (!offer) return form;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-3">
        <p className="font-semibold">
          <span className="break-all">{takenNick}</span>
          {t.nickTakenAfter}
        </p>
        <p className="text-muted-foreground text-sm">{t.isItYou}</p>
        <ServerError message={serverError} />
        <form
          method="POST"
          action="/api/rooms/join"
          onSubmit={() => {
            setReturnPending(true);
          }}
        >
          <input type="hidden" name="link" value={linkToken} />
          <input type="hidden" name="nick" value={takenNick} />
          <input type="hidden" name="intent" value="return" />
          <Button type="submit" disabled={returnPending} className="w-full">
            {returnPending ? <Spinner aria-hidden="true" /> : <Undo2 />}
            {returnPending ? t.returnPending : t.returnSubmit}
          </Button>
        </form>
        <p className="text-muted-foreground text-sm">{variant === "join" ? t.returnLobbyText : t.returnText}</p>
      </div>
      <div className="flex items-center gap-3">
        <span aria-hidden="true" className="bg-border h-px flex-1" />
        <span className="text-muted-foreground text-sm">{texts.other}</span>
        <span aria-hidden="true" className="bg-border h-px flex-1" />
      </div>
      {form}
    </div>
  );
}
