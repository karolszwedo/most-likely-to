import { useEffect, useRef, useState, type MouseEvent } from "react";
import { ChevronDown, MessageCircle, Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { FieldError } from "@/components/ui/field";
import { InputGroup, InputGroupAddon, InputGroupInput } from "@/components/ui/input-group";
import { SLICE_DOTS } from "@/components/room/chart-colors";
import GifPicker from "@/components/room/GifPicker";
import { BUSY_BUTTON } from "@/components/room/QuestionField";
import type { ActionOutcome } from "@/components/room/room-actions";
import { MOTION_CHAT_TOAST } from "@/components/room/reveal-motion";
import type { GifSearchPreview } from "@/components/room/useGifSearch";
import { playerColors } from "@/lib/rooms/chart";
import {
  CHAT_COOLDOWN_MS,
  CHAT_MAX_LENGTH,
  chatTextLength,
  isBlankChatText,
  type ChatGif,
  type ChatMessage,
} from "@/lib/rooms/chat";
import type { GifResult } from "@/lib/rooms/gifs";
import type { LobbyPlayer } from "@/lib/rooms/shared";
import { cn } from "@/lib/utils";

// The search of a preview's chat opened with "GIF" when the preview set none: empty, and it never asks KLIPY.
const PREVIEW_SEARCH: GifSearchPreview = { open: true, state: "idle" };

// The dev previews only (/dev/room-states, /dev/room-window): the starting state of the chat; the real page never sets
// it. A preview's "Wyślij wiadomość" sends nothing: the field empties and the button rests, with no new line; so does a
// press of a gif, which also closes the search.
export interface ChatPreview {
  // The messages on the screen, the oldest first (RoomScreen starts its list with them): texts and gifs.
  messages: ChatMessage[];
  // Text in the field.
  draft?: string;
  // The text was checked as on "Wyślij wiadomość" (its error shown).
  showErrors?: boolean;
  // The button resting after a message.
  cooling?: boolean;
  // The text of a refused message.
  error?: string | null;
  // Below lg: the panel open instead of the button "Czat".
  open?: boolean;
  // Below lg, folded: how many of the newest messages count as new on the button, and the newest popped up over it.
  unread?: number;
  toast?: boolean;
  // The gif search (room-chat-gifs) open with its word and its state; only on a screen with a gif search key.
  gifSearch?: GifSearchPreview;
}

// What a player's press sends on the chat (POST /api/rooms/<id>/chat): a text as typed, or a gif from KLIPY's search
// with its description (room-chat-gifs), the address exactly as KLIPY gave it.
export type ChatBody = { text: string } | { gif: string; title: string };

interface Props {
  // The screen's messages, the oldest first (RoomScreen keeps them): texts and gifs.
  messages: readonly ChatMessage[];
  // The room's players, for each nick's stored colour (playerColors), as on the lists of players.
  players: readonly LobbyPlayer[];
  // Unique ids when /dev/room-states renders several screens on one page; "" on the real page.
  idPrefix: string;
  // /dev/room-states, several screens on one page: the chat stays inside the screen's frame, always open.
  inFrame: boolean;
  // The key of KLIPY's search (getGifSearchKey through the room's page), or null: then the chat has no button "GIF".
  gifSearchKey: string | null;
  onSend: (body: ChatBody) => Promise<ActionOutcome>;
  preview?: ChatPreview;
}

// How long the newest message stays popped up over the folded chat's button, as an emote's bubble stays.
const CHAT_TOAST_MS = 4000;
// The field's counter shows from this length on, near the limit only.
const COUNTER_FROM = 180;
const HEADING = "Czat";
const LABEL = "Wiadomość na czacie";
const EMPTY_LIST = "Nikt jeszcze nic nie napisał.";
const EMPTY_TEXT = "Wpisz wiadomość";
const TOO_LONG = `Wiadomość może mieć najwyżej ${CHAT_MAX_LENGTH} znaków`;

// Where the chat stands (Karol's picks of 2026-11-17 on the screenshots, T2 and L3): below lg folded behind the button
// "Czat" over the emotes' bar, and open as a panel fixed right above that bar (EmoteBar), at most half the window high:
// with the phone's keyboard open the window shrinks (interactive-widget on /r/, src/layouts/Layout.astro) and the panel
// with it. From lg a section under the view, its list a few lines high. From xl a panel at the window's left edge for
// the window's whole height, the newest messages at its bottom next to the field (the page keeps clear of it,
// ROOM_PAGE_CHAT). section: the chat's block, a flex column at every width, so the list (flex-1, min-h-0) takes only
// what the heading and the field leave and scrolls, and the field never slides under the emotes' bar (impl-review F1);
// list: its scroll box. Gifs (Karol's pick of 2026-11-18, context/changes/room-chat-gifs/change.md): below xl, the
// section from lg to xl too, the search is a strip above the field (GifPicker, W2) and a gif in the list is 96 px high;
// from xl, in the panel, the search takes the list's place (W1: listBehindSearch hides the list while it is open) and a
// gif is 128 px high. By Tailwind's xl: alone, so the server's render and the browser's are the same.
// sectionWhileSearching: below lg, with the search open, the panel is exactly half the window high instead of at most
// half. Only a definite height lets the list's flex-1 (basis 0%) count as 0, so the list takes just what the strip
// leaves and gives up its room first in a low window; under a bare max-height the basis counts as the list's content,
// and the list and the strip shrink in proportion to their contents, squeezing the strip's results to a sliver.
const IN_WINDOW = {
  section: cn(
    "bg-background fixed inset-x-0 bottom-18 z-10 flex max-h-1/2 border-t px-4 py-3 shadow-lg",
    "lg:static lg:inset-x-auto lg:bottom-auto lg:z-auto lg:flex lg:max-h-none",
    "lg:bg-transparent lg:px-0 lg:pt-4 lg:pb-0 lg:shadow-none",
    "xl:bg-card xl:fixed xl:top-4 xl:bottom-4 xl:left-4 xl:z-10 xl:w-80 xl:rounded-xl xl:border xl:p-4",
  ),
  sectionWhileSearching: "h-1/2 lg:h-auto",
  list: "min-h-0 flex-1 lg:max-h-48 xl:max-h-none",
  listBehindSearch: "xl:hidden",
  gif: "h-24 xl:h-32",
};
// /dev/room-states: under the view at every width, inside the screen's frame, which is a phone's column: the look
// below xl at every width.
const IN_FRAME = {
  section: "flex border-t pt-4",
  sectionWhileSearching: "",
  list: "max-h-64",
  listBehindSearch: "",
  gif: "h-24",
};

// The sender of a message: the dot of their colour and the nick, then ":" for a screen reader only.
function Sender({ nick, color }: { nick: string; color: number | undefined }) {
  return (
    <>
      <span
        aria-hidden="true"
        className={cn("mr-1.5 inline-block size-2.5 rounded-full", color !== undefined && SLICE_DOTS[color])}
      />
      {/* bdi: a nick and a text written right to left each keep their own direction, so they never swap places. */}
      <bdi className="font-semibold">{nick}</bdi>
      <span className="sr-only">:</span>
    </>
  );
}

// One message: the dot of the sender's colour, the nick and the text, as plain text: a link stays text, and a long word
// breaks anywhere. A screen reader reads it as "<nick>: <text>".
function MessageLine({
  nick,
  text,
  color,
  className,
}: {
  nick: string;
  text: string;
  color: number | undefined;
  className?: string;
}) {
  return (
    <p className={cn("text-sm leading-5 wrap-anywhere", className)}>
      <Sender nick={nick} color={color} /> <bdi>{text}</bdi>
    </p>
  );
}

// What a gif says in words: "gif" and its description, if any.
function gifWords(message: ChatGif): string {
  return message.title === "" ? "gif" : `gif ${message.title}`;
}

// What the live region says of a message: "<nick>: <text>", or "<nick>: gif <description>".
function spokenMessage(message: ChatMessage): string {
  return `${message.nick}: ${message.kind === "text" ? message.text : gifWords(message)}`;
}

// A gif on the chat (room-chat-gifs): the sender's line, and under it the image exactly from KLIPY's address, at a fixed
// height (heightClass), so the list never jumps as it comes in, at its own width up to the list's; with no Referer, so
// KLIPY learns nothing of the room. A screen reader reads "<nick>: <description>" ("gif" without one).
function GifLine({
  message,
  color,
  heightClass,
}: {
  message: ChatGif;
  color: number | undefined;
  heightClass: string;
}) {
  return (
    <div className="flex flex-col items-start gap-1 text-sm leading-5">
      <p className="wrap-anywhere">
        <Sender nick={message.nick} color={color} />
      </p>
      <img
        src={message.gif}
        alt={message.title || "gif"}
        referrerPolicy="no-referrer"
        className={cn("w-auto max-w-full min-w-0 rounded-md object-contain", heightClass)}
      />
    </div>
  );
}

// The room's chat (S-23, PRD FR-028) on every screen of the room: every player, the host, a co-host and a guest with no
// role, writes short messages to the whole room, and everyone sees the last of them with the sender's nick, from the
// room's players' channel (the sender too: nothing is shown before the channel brings it). The list has no live
// semantics; one live region says the newest message, as the emotes do (EmoteBubbles). The field takes one line; the
// length is checked on "Wyślij wiadomość", the counter shows near the limit. After a message the button rests for
// CHAT_COOLDOWN_MS from the press, whatever the answer, still focusable (aria-disabled); a press while resting sends
// nothing. Accepted, the field empties and keeps the focus, a tap on the button included, so the phone's keyboard stays
// open; refused, the text stays and the refusal's short text stands under the field. Outside the view (RoomScreen), so
// the focus after a leader's move never goes to the heading "Czat", and a new round leaves the typed text alone.
// Below lg the button "Czat" unfolds the panel (a region, not a dialog) and takes the focus to the field; "Zwiń" folds
// it and gives the focus back to the button (focus.ts: the player's own move took the pressed button away). While
// folded, the button counts the messages that came since, and the newest pops up over it for CHAT_TOAST_MS.
// Gifs (room-chat-gifs, S-24): with a gif search key the button "GIF" next to the field opens the search (GifPicker, a
// region of the panel: a strip above the field, from xl in the list's place) and takes the focus to its field; closing
// it with its own button gives the focus back to "GIF". A press of a result sends the gif, closes the search and takes
// the focus to the message field, with the same pause as a message (the results rest meanwhile); a refusal stands under
// the field as a message's does. A gif stands in the list under the sender's nick; folded, the newest gif pops up as a
// small thumbnail under the nick.
export default function RoomChat({ messages, players, idPrefix, inFrame, gifSearchKey, onSend, preview }: Props) {
  const isPreview = preview !== undefined;
  const [text, setText] = useState(preview?.draft ?? "");
  const [fieldError, setFieldError] = useState<string | undefined>(() =>
    preview?.showErrors ? textError(preview.draft ?? "") : undefined,
  );
  const [error, setError] = useState<string | null>(preview?.error ?? null);
  const [cooling, setCooling] = useState(preview?.cooling ?? false);
  const [sending, setSending] = useState(false);
  const [open, setOpen] = useState(preview?.open ?? false);
  // The gif search open (GifPicker); its word and results live in it and go when it closes.
  const [searchOpen, setSearchOpen] = useState(preview?.gifSearch?.open ?? false);
  // The ids of the messages that came while the chat was folded, until it unfolds.
  const [unreadIds, setUnreadIds] = useState<readonly string[]>(() =>
    preview?.unread ? messages.slice(-preview.unread).map((message) => message.id) : [],
  );
  // The message popped up over the folded chat's button; a preview's stays.
  const [toastId, setToastId] = useState<string | null>(() => (preview?.toast ? (messages.at(-1)?.id ?? null) : null));
  // The newest message that came, for the live region; a preview starts with its newest.
  const [announcedId, setAnnouncedId] = useState<string | null>(messages.at(-1)?.id ?? null);
  // Adjusting state while rendering (react.dev, "You Might Not Need an Effect"): the messages that came since the list
  // the chat saw last. A list that only lost messages (a removed player's, the oldest past the limit) brings none.
  const [seen, setSeen] = useState(messages);
  if (messages !== seen) {
    setSeen(messages);
    const before = new Set(seen.map((message) => message.id));
    const arrived = messages.filter((message) => !before.has(message.id)).map((message) => message.id);
    const newest = arrived.at(-1);
    if (newest !== undefined) {
      setAnnouncedId(newest);
      if (!open) {
        const kept = new Set(messages.map((message) => message.id));
        setUnreadIds((ids) => [...ids, ...arrived].filter((id) => kept.has(id)));
        setToastId(newest);
      }
    }
  }

  const timer = useRef<number | undefined>(undefined);
  const inputRef = useRef<HTMLInputElement>(null);
  const pillRef = useRef<HTMLButtonElement>(null);
  const gifButtonRef = useRef<HTMLButtonElement>(null);
  const gifFieldRef = useRef<HTMLInputElement>(null);
  // The player's own move took the pressed button away, or opened the search: the focus goes on once the other one is
  // there.
  const focusNext = useRef<"field" | "pill" | "gif-field" | "gif-button" | null>(null);
  const panelId = `${idPrefix}chat`;
  const headingId = `${idPrefix}chat-heading`;
  const fieldId = `${idPrefix}chat-field`;
  const errorId = `${idPrefix}chat-error`;
  const searchId = `${idPrefix}chat-gifs`;
  const placement = inFrame ? IN_FRAME : IN_WINDOW;
  const colors = playerColors(players);
  const length = chatTextLength(text);
  const resting = cooling || sending;
  const shownError = fieldError ?? error;
  const announced = messages.find((message) => message.id === announcedId);
  const toast = open ? undefined : messages.find((message) => message.id === toastId);
  const unread = messages.filter((message) => unreadIds.includes(message.id)).length;
  const searching = gifSearchKey !== null && searchOpen;

  useEffect(
    () => () => {
      window.clearTimeout(timer.current);
    },
    [],
  );

  // A popped-up message goes after CHAT_TOAST_MS; a newer one takes its place and its time.
  useEffect(() => {
    if (toastId === null || isPreview) return;
    const toastTimer = window.setTimeout(() => {
      setToastId(null);
    }, CHAT_TOAST_MS);
    return () => {
      window.clearTimeout(toastTimer);
    };
  }, [toastId, isPreview]);

  useEffect(() => {
    const next = focusNext.current;
    if (next === null) return;
    focusNext.current = null;
    const target = {
      field: inputRef,
      pill: pillRef,
      "gif-field": gifFieldRef,
      "gif-button": gifButtonRef,
    }[next].current;
    target?.focus();
  });

  function unfold() {
    focusNext.current = "field";
    setOpen(true);
    setUnreadIds([]);
    setToastId(null);
  }

  // Folding closes the gif search too: its word lives only while it is open in sight.
  function fold() {
    focusNext.current = "pill";
    setOpen(false);
    setSearchOpen(false);
  }

  // "GIF": opens the search with the focus in its field, or closes it, the focus staying on "GIF".
  function toggleSearch() {
    if (searchOpen) {
      setSearchOpen(false);
      return;
    }
    focusNext.current = "gif-field";
    setSearchOpen(true);
  }

  // The search's own "Wróć do czatu" or close button went away with it: the focus goes back to "GIF".
  function closeSearch() {
    focusNext.current = "gif-button";
    setSearchOpen(false);
  }

  // A message or a gif: the pause starts at the press, whatever the answer; a refusal's text stands under the field.
  async function deliver(body: ChatBody): Promise<boolean> {
    setError(null);
    setCooling(true);
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => {
      setCooling(false);
    }, CHAT_COOLDOWN_MS);
    setSending(true);
    const outcome = await onSend(body);
    setSending(false);
    if (!outcome.ok) {
      setError(outcome.message);
      return false;
    }
    return true;
  }

  async function send() {
    if (resting) return;
    const sentText = text;
    const invalid = textError(sentText);
    setFieldError(invalid);
    setError(null);
    if (invalid) {
      inputRef.current?.focus();
      return;
    }
    // Text typed while the message was on its way stays for the next one.
    if (await deliver({ text: sentText })) setText((current) => (current === sentText ? "" : current));
  }

  // A result of the search: sent as KLIPY gave it, with its description; the pressed result goes away with the search,
  // so the focus goes to the message field. A press while resting sends nothing.
  function pickGif(result: GifResult) {
    if (resting) return;
    focusNext.current = "field";
    setSearchOpen(false);
    setFieldError(undefined);
    void deliver({ gif: result.gif, title: result.title });
  }

  // A tap on "Wyślij wiadomość" leaves the focus in the field, so the phone's keyboard stays open for the next message;
  // the keyboard's Enter and Space on the button still send.
  function keepFieldFocus(e: MouseEvent<HTMLButtonElement>) {
    if (document.activeElement === inputRef.current) e.preventDefault();
  }

  return (
    <>
      {/* On the page from the start and outside the folded panel, so every message is heard (a live region added
          together with its text, or inside a hidden block, is often not read). */}
      <p aria-live="polite" className="sr-only">
        {announced ? spokenMessage(announced) : ""}
      </p>
      <section
        id={panelId}
        aria-labelledby={headingId}
        className={cn(
          "flex-col",
          placement.section,
          searching && placement.sectionWhileSearching,
          !inFrame && !open && "hidden",
        )}
      >
        {/* As wide as a phone's column while the panel spans the window's width. */}
        <div className="mx-auto flex min-h-0 w-full max-w-lg flex-1 flex-col gap-2 lg:max-w-none lg:gap-3">
          <div className="flex items-center justify-between gap-2">
            <h2 id={headingId} className="text-sm font-medium">
              {HEADING}
            </h2>
            {!inFrame && (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="lg:hidden"
                aria-expanded="true"
                aria-controls={panelId}
                onClick={fold}
              >
                <ChevronDown />
                Zwiń
              </Button>
            )}
          </div>
          {/* A scroll box anchored at its end: the newest message stays in view, next to the field. From xl, in the
              panel, it hides while the gif search stands in its place. */}
          <div
            className={cn(
              "flex flex-col-reverse overflow-y-auto",
              placement.list,
              searching && placement.listBehindSearch,
            )}
          >
            {messages.length === 0 ? (
              <p className="text-muted-foreground text-sm">{EMPTY_LIST}</p>
            ) : (
              <ul className="flex flex-col gap-1.5">
                {messages.map((message) => (
                  <li key={message.id}>
                    {message.kind === "text" ? (
                      <MessageLine nick={message.nick} text={message.text} color={colors.get(message.nick)} />
                    ) : (
                      <GifLine message={message} color={colors.get(message.nick)} heightClass={placement.gif} />
                    )}
                  </li>
                ))}
              </ul>
            )}
          </div>
          {searching && (
            // Between the list and the field: below xl the strip above the field, from xl (the list hidden) in the
            // list's place under the heading.
            <GifPicker
              id={searchId}
              idPrefix={idPrefix}
              searchKey={gifSearchKey}
              inFrame={inFrame}
              resting={resting}
              fieldRef={gifFieldRef}
              onPick={pickGif}
              onClose={closeSearch}
              // A preview's search never asks KLIPY, also one opened with "GIF" on a preview without a search state.
              preview={preview ? (preview.gifSearch ?? PREVIEW_SEARCH) : undefined}
            />
          )}
          <form
            noValidate
            className="flex flex-col gap-1.5"
            onSubmit={(e) => {
              e.preventDefault();
              void send();
            }}
          >
            <label htmlFor={fieldId} className="sr-only">
              {LABEL}
            </label>
            <div className="flex gap-2">
              {gifSearchKey !== null && (
                <Button
                  ref={gifButtonRef}
                  type="button"
                  variant="outline"
                  aria-label="GIF: wyszukaj gifa"
                  aria-expanded={searchOpen}
                  aria-controls={searchId}
                  className="size-11 text-xs font-semibold"
                  onClick={toggleSearch}
                >
                  GIF
                </Button>
              )}
              <InputGroup className="bg-background h-11">
                <InputGroupInput
                  ref={inputRef}
                  id={fieldId}
                  className="text-foreground"
                  value={text}
                  onChange={(e) => {
                    setText(e.target.value);
                    setFieldError(undefined);
                  }}
                  placeholder="Napisz do wszystkich…"
                  autoComplete="off"
                  enterKeyHint="send"
                  aria-invalid={fieldError ? true : undefined}
                  aria-describedby={shownError ? errorId : undefined}
                />
                {length >= COUNTER_FROM && (
                  <InputGroupAddon align="inline-end">
                    <span
                      aria-hidden="true"
                      className={cn(
                        "text-xs tabular-nums",
                        length > CHAT_MAX_LENGTH ? "text-destructive" : "text-muted-foreground",
                      )}
                    >
                      {length}/{CHAT_MAX_LENGTH}
                    </span>
                  </InputGroupAddon>
                )}
              </InputGroup>
              <Button
                type="submit"
                variant="secondary"
                size="icon"
                aria-label="Wyślij wiadomość"
                aria-disabled={resting || undefined}
                className={cn("size-11", BUSY_BUTTON)}
                onMouseDown={keepFieldFocus}
              >
                <Send />
              </Button>
            </div>
            {shownError && (
              // A check of the text sends the focus back to the field, which reads it through aria-describedby; a
              // refusal comes later, so it is said at once.
              <FieldError id={errorId} role={fieldError ? undefined : "alert"}>
                {shownError}
              </FieldError>
            )}
          </form>
        </div>
      </section>
      {!inFrame && !open && (
        // Below lg, over the emotes' bar at the window's left edge (EmoteBubbles rise at its right): the newest message
        // for a moment, for the eye only (the live region above says it), and the button that unfolds the chat.
        <div className="pointer-events-none fixed bottom-20 left-4 z-20 flex max-w-64 flex-col items-start gap-2 lg:hidden">
          {toast && (
            <div
              key={toast.id}
              aria-hidden="true"
              className={cn(
                "bg-secondary text-secondary-foreground rounded-2xl px-3 py-1.5 shadow-lg",
                MOTION_CHAT_TOAST,
              )}
            >
              {toast.kind === "text" ? (
                <MessageLine
                  nick={toast.nick}
                  text={toast.text}
                  color={colors.get(toast.nick)}
                  className="line-clamp-2"
                />
              ) : (
                // A gif: the sender's line and a small thumbnail of it.
                <div className="flex flex-col items-start gap-1 text-sm leading-5">
                  <p className="wrap-anywhere">
                    <Sender nick={toast.nick} color={colors.get(toast.nick)} />
                  </p>
                  <img
                    src={toast.gif}
                    alt=""
                    referrerPolicy="no-referrer"
                    className="h-16 w-auto max-w-full rounded-md object-contain"
                  />
                </div>
              )}
            </div>
          )}
          <Button
            ref={pillRef}
            type="button"
            variant="outline"
            // Opaque, as the emotes' bar under it: the page scrolls behind the button.
            className="bg-background dark:bg-background pointer-events-auto h-11 rounded-full shadow-lg"
            aria-expanded="false"
            aria-controls={panelId}
            onClick={unfold}
          >
            <MessageCircle />
            {HEADING}
            {unread > 0 && (
              <>
                <span
                  aria-hidden="true"
                  className="bg-primary text-primary-foreground rounded-full px-2 text-xs leading-5 font-semibold tabular-nums"
                >
                  {unread}
                </span>
                <span className="sr-only">, nowe: {unread}</span>
              </>
            )}
          </Button>
        </div>
      )}
      {/* Below lg the page's end keeps clear of the button "Czat", as the emotes' bar's slot keeps it clear of the
          bar. */}
      {!inFrame && <div className="h-14 lg:hidden" />}
    </>
  );
}

// The check before sending; the Worker has the final word (invalid_body).
function textError(text: string): string | undefined {
  if (isBlankChatText(text)) return EMPTY_TEXT;
  if (chatTextLength(text) > CHAT_MAX_LENGTH) return TOO_LONG;
  return undefined;
}
