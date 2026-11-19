import { useState, type RefObject } from "react";
import { ArrowLeft, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { InputGroup, InputGroupInput } from "@/components/ui/input-group";
import { Spinner } from "@/components/ui/spinner";
import { BUSY_BUTTON } from "@/components/room/QuestionField";
import { useGifSearch, type GifSearch, type GifSearchPreview } from "@/components/room/useGifSearch";
import type { GifResult } from "@/lib/rooms/gifs";
import { cn } from "@/lib/utils";

interface Props {
  // The region's id, which the chat's button "GIF" controls.
  id: string;
  // Unique ids when /dev/room-states renders several screens on one page; "" on the real page.
  idPrefix: string;
  // The key of KLIPY's search the room's page handed over (getGifSearchKey).
  searchKey: string;
  // /dev/room-states, several screens on one page: the strip (W2) at every width, as the chat's frame there is a
  // phone's column.
  inFrame: boolean;
  // The chat's pause after a message or a gif (CHAT_COOLDOWN_MS): the results rest, still focusable.
  resting: boolean;
  // The search's field, which takes the focus as the search opens (RoomChat).
  fieldRef: RefObject<HTMLInputElement | null>;
  onPick: (result: GifResult) => void;
  onClose: () => void;
  preview?: GifSearchPreview;
}

const REGION = "Wyszukiwarka gifów";
const LABEL = "Szukaj gifa";
// As KLIPY requires it in the search's field (decision 5), in English; a screen reader hears LABEL.
const PLACEHOLDER = "Search KLIPY";
const IDLE = "Wpisz słowo i naciśnij „Szukaj”.";
const LOADING = "Szukam gifów…";
const EMPTY = "Nie ma gifów dla tego słowa.";
const LIMIT = "Gify na tę godzinę się skończyły. Spróbuj później, a na razie napisz wiadomość.";
// Not only a failure of the network: a real 429 of KLIPY's may come without the CORS header, and the browser then
// reports it as a failed fetch, so this text names the hour's limit as a possible cause (impl-review F5).
const ERROR = "Nie udało się wczytać gifów. Może skończył się limit na tę godzinę.";
const RESULTS = "Wyniki wyszukiwania";

// Where the search stands (Karol's pick of 2026-11-18 on the screenshots, context/changes/room-chat-gifs/change.md).
// Below xl, and in /dev/room-states' frames at every width, W2: a strip right above the message field, the list of
// messages staying above it; the field, "Szukaj" and "Zamknij wyszukiwarkę" in one line, the results one row of
// images 96 px high at their own width that scrolls sideways. The strip keeps its full height and the list takes what
// is left; in a low window (a phone with its keyboard open) the list gives up its room first, then the strip's results
// scroll (region and scroll shrink, min-h-0), so the message field never slides under the emotes' bar (impl-review F1
// of room-chat). Below lg, where the chat's panel is at most half the window high, both need the panel's height to be
// definite while the search is open (RoomChat, sectionWhileSearching). From xl in the window, in the chat's panel at
// the window's left edge (L3), W1: the search in the list's place (RoomChat hides the list meanwhile), its results a
// grid of three columns of 96 px tiles in their own scroll box, "Wróć do czatu" under them. By Tailwind's xl: alone,
// never the window's width read in code, so the server's render and the browser's are the same; a control of the
// other width is display: none, so only one way to close the search is ever focusable. Whole class names only.
const STRIP = {
  region: "flex min-h-0 flex-col gap-2 border-t pt-2",
  close: "size-11",
  scroll: "flex min-h-0 flex-col gap-2 overflow-y-auto",
  results: "flex gap-2 overflow-x-auto pb-1",
  result: "h-24 min-w-16",
  image: "h-24 w-auto",
};
const PANEL_FROM_XL = {
  region: "xl:flex-1 xl:border-t-0 xl:pt-0",
  close: "xl:hidden",
  scroll: "xl:flex-1",
  results: "xl:grid xl:grid-cols-3 xl:pb-0",
  result: "xl:w-full xl:min-w-0",
  image: "xl:size-full xl:object-cover",
  back: "hidden self-start xl:inline-flex",
};

// What the search says under its field: a hint before the first search, the search on its way, none for the word, or
// the failure; with results only, for a screen reader, how many came. In one live region that stands while the search
// is open, so each change is heard.
function SearchStatus({ search }: { search: GifSearch }) {
  let line;
  if (search.state === "idle") {
    line = <p className="text-muted-foreground text-sm">{IDLE}</p>;
  } else if (search.state === "loading") {
    line = (
      <p className="text-muted-foreground flex items-center gap-2 text-sm">
        <Spinner aria-hidden="true" />
        {LOADING}
      </p>
    );
  } else if (search.state === "empty") {
    line = <p className="text-muted-foreground text-sm">{EMPTY}</p>;
  } else if (search.state === "failed") {
    line =
      search.failure === "limit" ? (
        <p className="text-muted-foreground text-sm">{LIMIT}</p>
      ) : (
        <p className="text-destructive text-sm">{ERROR}</p>
      );
  } else {
    line = <p className="sr-only">Znalezione gify: {search.results.length}.</p>;
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
  return (
    <Button
      type="button"
      variant="ghost"
      aria-label={result.title === "" ? "Wyślij gifa" : `Wyślij gifa: ${result.title}`}
      aria-disabled={resting || undefined}
      className={cn("bg-muted overflow-hidden rounded-md p-0", BUSY_BUTTON, className)}
      onClick={() => {
        onPick(result);
      }}
    >
      <img
        src={result.preview}
        alt={result.title || "gif"}
        referrerPolicy="no-referrer"
        loading="lazy"
        className={imageClassName}
      />
    </Button>
  );
}

// The chat's gif search (room-chat-gifs, Faza 3 #3): a region of the chat's panel, not a dialog. Opened empty
// (decision 4): it asks KLIPY only after a word and "Szukaj" (useGifSearch), with the field's text "Search KLIPY" as
// KLIPY requires (decision 5). The results in KLIPY's order (parseGifResults); a press sends the gif (RoomChat). The
// word lives only in this component's state: closing the search unmounts it, and the word and the results go with it.
// One region, one field and one list of results at every width; only its look changes at xl (STRIP, PANEL_FROM_XL).
export default function GifPicker({
  id,
  idPrefix,
  searchKey,
  inFrame,
  resting,
  fieldRef,
  onPick,
  onClose,
  preview,
}: Props) {
  const { search, run } = useGifSearch(searchKey, preview);
  const [query, setQuery] = useState(preview?.query ?? "");
  const fieldId = `${idPrefix}gif-field`;
  const results = search.state === "results" ? search.results : [];
  const wide = !inFrame;

  return (
    <section id={id} aria-label={REGION} className={cn(STRIP.region, wide && PANEL_FROM_XL.region)}>
      <form
        role="search"
        noValidate
        className="flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          run(query);
        }}
      >
        <label htmlFor={fieldId} className="sr-only">
          {LABEL}
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
            placeholder={PLACEHOLDER}
            autoComplete="off"
            enterKeyHint="search"
          />
        </InputGroup>
        <Button type="submit" variant="secondary" className="h-11">
          Szukaj
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          aria-label="Zamknij wyszukiwarkę"
          className={cn(STRIP.close, wide && PANEL_FROM_XL.close)}
          onClick={onClose}
        >
          <X />
        </Button>
      </form>
      <div className={cn(STRIP.scroll, wide && PANEL_FROM_XL.scroll)}>
        <SearchStatus search={search} />
        {results.length > 0 && (
          <ul aria-label={RESULTS} className={cn(STRIP.results, wide && PANEL_FROM_XL.results)}>
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
      {wide && (
        <Button type="button" variant="ghost" size="sm" className={PANEL_FROM_XL.back} onClick={onClose}>
          <ArrowLeft />
          Wróć do czatu
        </Button>
      )}
    </section>
  );
}
