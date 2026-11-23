import { useState, type ReactNode, type RefObject } from "react";
import { ArrowLeft, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { InputGroup, InputGroupAddon, InputGroupInput } from "@/components/ui/input-group";
import { Spinner } from "@/components/ui/spinner";
import { BUSY_BUTTON } from "@/components/room/QuestionField";
import { useGifSearch, type GifSearch, type GifSearchPreview } from "@/components/room/useGifSearch";
import { useT } from "@/lib/i18n/react";
import type { GifResult } from "@/lib/rooms/gifs";
import { cn } from "@/lib/utils";

interface Props {
  // The region's id, which the chat's button "GIF" controls.
  id: string;
  // Unique ids when /dev/room-states renders several screens on one page; "" on the real page.
  idPrefix: string;
  // The key of KLIPY's search the room's page handed over (getGifSearchKey).
  searchKey: string;
  // /dev/room-states, several screens on one page: the strip at every width, as the chat's frame there is a phone's
  // column.
  inFrame: boolean;
  // The chat's pause after a message or a gif (CHAT_COOLDOWN_MS): the results rest, still focusable.
  resting: boolean;
  // The search's field, which takes the focus as the search opens (RoomChat).
  fieldRef: RefObject<HTMLInputElement | null>;
  // The chat's button "GIF" (RoomChat), open, at the start of the search's row: one button, which stands in the writing
  // row while the search is closed, so the tree never holds two.
  toggle: ReactNode;
  onPick: (result: GifResult) => void;
  // The way back to the message field ("Wróć do pisania", from xl "Wróć do czatu"): closes the search (RoomChat).
  onBack: () => void;
  preview?: GifSearchPreview;
}

// Where the search stands (R1, Karol's decision 1 of 2026-11-23, context/changes/chat-composer/research.md, after note
// M of the first game with friends; W1 and W2 of 2026-11-18 placed it next to the message field): the search takes the
// writing row's place, so the chat has one text field at a time (RoomChat renders no message field while the search is
// open). From the top: a line with the visible heading "Szukaj gifa" and the way back, the status and the results, and
// at the bottom the search's row: the open "GIF", the field with a magnifier in front and "Szukaj".
// STRIP: below xl, and in /dev/room-states' frames at every width, a strip under the list of messages, at the panel's
// bottom where the writing row stood; the results one row of images 96 px high at their own width that scrolls
// sideways; the way back says "Wróć do pisania". The strip keeps its full height and the list takes what is left; in a
// low window (a phone with its keyboard open) the list gives up its room first, then the strip's results scroll (region
// and scroll shrink, min-h-0), so the search's field never slides under the emotes' bar (impl-review F1 of room-chat).
// Below lg, where the chat's panel is at most half the window high, both need the panel's height to be definite while
// the search is open (RoomChat, sectionWhileSearching).
// PANEL_FROM_XL: from xl in the window, in the chat's panel at the window's left edge (L3), the search in the list's
// place too (RoomChat hides the list meanwhile), its results a grid of three columns of 96 px tiles in their own scroll
// box; the way back says "Wróć do czatu". By Tailwind's xl: alone, never the window's width read in code, so the
// server's render and the browser's are the same; the way back of the other width is display: none, so only one is
// ever focusable or heard. Whole class names only.
const STRIP = {
  region: "flex min-h-0 flex-col gap-2 border-t pt-2",
  scroll: "flex min-h-0 flex-col gap-2 overflow-y-auto",
  results: "flex gap-2 overflow-x-auto pb-1",
  result: "h-24 min-w-16",
  image: "h-24 w-auto",
};
const PANEL_FROM_XL = {
  region: "xl:flex-1 xl:border-t-0 xl:pt-0",
  scroll: "xl:flex-1",
  results: "xl:grid xl:grid-cols-3 xl:pb-0",
  result: "xl:w-full xl:min-w-0",
  image: "xl:size-full xl:object-cover",
  backToWriting: "xl:hidden",
  back: "hidden xl:inline-flex",
};

// What the search says under its field: a hint before the first search, the search on its way, none for the word, or
// the failure; with results only, for a screen reader, how many came. In one live region that stands while the search
// is open, so each change is heard.
function SearchStatus({ search }: { search: GifSearch }) {
  const t = useT();
  let line;
  if (search.state === "idle") {
    line = <p className="text-muted-foreground text-sm">{t.chat.gifs.idle}</p>;
  } else if (search.state === "loading") {
    line = (
      <p className="text-muted-foreground flex items-center gap-2 text-sm">
        <Spinner aria-hidden="true" />
        {t.chat.gifs.loading}
      </p>
    );
  } else if (search.state === "empty") {
    line = <p className="text-muted-foreground text-sm">{t.chat.gifs.empty}</p>;
  } else if (search.state === "failed") {
    line =
      search.failure === "limit" ? (
        <p className="text-muted-foreground text-sm">{t.chat.gifs.limit}</p>
      ) : (
        <p className="text-destructive text-sm">{t.chat.gifs.error}</p>
      );
  } else {
    line = <p className="sr-only">{t.chat.gifs.found(search.results.length)}</p>;
  }
  return <div role="status">{line}</div>;
}

// One result: a button with KLIPY's small file, its description for a screen reader. While the chat rests a press
// sends nothing (RoomChat), and the button says so (aria-disabled), still focusable.
function ResultButton({
  result,
  resting,
  className,
  imageClassName,
  onPick,
}: {
  result: GifResult;
  resting: boolean;
  className: string;
  imageClassName: string;
  onPick: (result: GifResult) => void;
}) {
  const t = useT();
  return (
    <Button
      type="button"
      variant="ghost"
      aria-label={t.chat.gifs.sendGif(result.title)}
      aria-disabled={resting || undefined}
      className={cn("bg-muted overflow-hidden rounded-md p-0", BUSY_BUTTON, className)}
      onClick={() => {
        onPick(result);
      }}
    >
      <img
        src={result.preview}
        alt={result.title || t.chat.gifAlt}
        referrerPolicy="no-referrer"
        loading="lazy"
        className={imageClassName}
      />
    </Button>
  );
}

// The chat's gif search (room-chat-gifs, Faza 3 #3; since chat-composer in the writing row's place, R1): a region of
// the chat's panel, not a dialog. Opened empty (decision 4): it asks KLIPY only after a word and "Szukaj"
// (useGifSearch), with the field's text "Search KLIPY" as KLIPY requires (decision 5); the visible heading "Szukaj
// gifa" over the results says in Polish what the field is for, as the placeholder goes with the first letter. The
// results in KLIPY's order (parseGifResults); a press sends the gif (RoomChat). The way back and "GIF" both close it
// (RoomChat). The word lives only in this component's state: closing the search unmounts it, and the word and the
// results go with it. One region, one field and one list of results at every width; only its look changes at xl
// (STRIP, PANEL_FROM_XL).
export default function GifPicker({
  id,
  idPrefix,
  searchKey,
  inFrame,
  resting,
  fieldRef,
  toggle,
  onPick,
  onBack,
  preview,
}: Props) {
  const t = useT();
  const { search, run } = useGifSearch(searchKey, preview);
  const [query, setQuery] = useState(preview?.query ?? "");
  const fieldId = `${idPrefix}gif-field`;
  const results = search.state === "results" ? search.results : [];
  const wide = !inFrame;

  return (
    <section id={id} aria-label={t.chat.gifs.region} className={cn(STRIP.region, wide && PANEL_FROM_XL.region)}>
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-primary-text flex items-center gap-1.5 text-sm font-semibold">
          <Search aria-hidden="true" className="size-4" />
          {t.chat.gifs.heading}
        </h3>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className={cn(wide && PANEL_FROM_XL.backToWriting)}
          onClick={onBack}
        >
          <ArrowLeft aria-hidden="true" />
          {t.chat.gifs.backToWriting}
        </Button>
        {wide && (
          <Button type="button" variant="ghost" size="sm" className={PANEL_FROM_XL.back} onClick={onBack}>
            <ArrowLeft aria-hidden="true" />
            {t.chat.gifs.back}
          </Button>
        )}
      </div>
      <div className={cn(STRIP.scroll, wide && PANEL_FROM_XL.scroll)}>
        <SearchStatus search={search} />
        {results.length > 0 && (
          <ul aria-label={t.chat.gifs.results} className={cn(STRIP.results, wide && PANEL_FROM_XL.results)}>
            {results.map((result, index) => (
              <li key={`${String(index)}:${result.gif}`} className="shrink-0">
                <ResultButton
                  result={result}
                  resting={resting}
                  className={cn(STRIP.result, wide && PANEL_FROM_XL.result)}
                  imageClassName={cn(STRIP.image, wide && PANEL_FROM_XL.image)}
                  onPick={onPick}
                />
              </li>
            ))}
          </ul>
        )}
      </div>
      <div className="flex gap-2">
        {toggle}
        <form
          role="search"
          noValidate
          className="flex min-w-0 flex-1 gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            run(query);
          }}
        >
          <label htmlFor={fieldId} className="sr-only">
            {t.chat.gifs.fieldLabel}
          </label>
          <InputGroup className="bg-background h-11">
            <InputGroupInput
              ref={fieldRef}
              id={fieldId}
              className="text-foreground"
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
              }}
              placeholder={t.chat.gifs.placeholder}
              autoComplete="off"
              enterKeyHint="search"
            />
            <InputGroupAddon align="inline-start">
              <Search aria-hidden="true" />
            </InputGroupAddon>
          </InputGroup>
          <Button type="submit" variant="secondary" className="h-11">
            {t.chat.gifs.search}
          </Button>
        </form>
      </div>
    </section>
  );
}
