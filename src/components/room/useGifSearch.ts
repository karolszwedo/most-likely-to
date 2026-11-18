import { useCallback, useEffect, useRef, useState } from "react";
import {
  gifSearchQuery,
  searchGifs,
  type GifFetch,
  type GifResult,
  type GifSearchFailure,
  type GifSearchOutcome,
} from "@/lib/rooms/gifs";

// The state of the chat's gif search (room-chat-gifs, Faza 3 #2): nothing asked yet, a search on its way, its results,
// none for the word, or a failure (KLIPY's limit for the hour, or anything else). query: the word as it went to KLIPY
// (gifSearchQuery).
export type GifSearch =
  | { state: "idle" }
  | { state: "loading"; query: string }
  | { state: "results"; query: string; results: readonly GifResult[] }
  | { state: "empty"; query: string }
  | { state: "failed"; query: string; failure: GifSearchFailure };

// The dev previews only (/dev/room-states, /dev/room-window), through ChatPreview: the search open with this state; a
// preview never asks KLIPY, so "Szukaj" changes nothing there. query: the word in the field and of the state.
export interface GifSearchPreview {
  open: boolean;
  query?: string;
  state: GifSearch["state"];
  results?: GifResult[];
  failure?: GifSearchFailure;
}

function fromPreview(preview: GifSearchPreview | undefined): GifSearch {
  const query = preview?.query ?? "";
  switch (preview?.state) {
    case "loading":
    case "empty":
      return { state: preview.state, query };
    case "results":
      return { state: "results", query, results: preview.results ?? [] };
    case "failed":
      return { state: "failed", query, failure: preview.failure ?? "error" };
    default:
      return { state: "idle" };
  }
}

function fromOutcome(query: string, outcome: GifSearchOutcome): GifSearch {
  if (outcome.kind === "results") return { state: "results", query, results: outcome.results };
  if (outcome.kind === "empty") return { state: "empty", query };
  return { state: "failed", query, failure: outcome.failure };
}

// The word a press of "Szukaj" sends to KLIPY, or null when it asks nothing: no word once whitespace is collapsed
// (decision 4: a search only after a word), or the very word whose results, or none, are on the screen or on their way
// (the test key's 100 searches an hour are the whole game's). After a failure the same word asks again: "Spróbuj
// jeszcze raz".
export function gifSearchToRun(raw: string, current: GifSearch): string | null {
  const query = gifSearchQuery(raw);
  if (query === "") return null;
  if (current.state !== "idle" && current.state !== "failed" && current.query === query) return null;
  return query;
}

// The browser's own fetch, called as a plain function.
const browserFetch: GifFetch = (url, init) => fetch(url, init);

// The search of an open gif picker (GifPicker): run asks KLIPY through searchGifs (src/lib/rooms/gifs.ts) when
// gifSearchToRun gives a word. A newer search takes the place of one still on its way, whose answer is then dropped,
// and so is every answer after the picker closes (it unmounts): the word lives only in the open picker's state, never
// in the browser's storage, an address or a log line. A preview starts with its own state and never asks.
export function useGifSearch(
  key: string,
  preview?: GifSearchPreview,
): { search: GifSearch; run: (raw: string) => void } {
  const [search, setSearch] = useState<GifSearch>(() => fromPreview(preview));
  const isPreview = preview !== undefined;
  // The number of the latest search; an answer of an older one, or after unmounting, is dropped.
  const latest = useRef(0);
  useEffect(
    () => () => {
      latest.current += 1;
    },
    [],
  );
  const run = useCallback(
    (raw: string) => {
      if (isPreview) return;
      const query = gifSearchToRun(raw, search);
      if (query === null) return;
      latest.current += 1;
      const mine = latest.current;
      setSearch({ state: "loading", query });
      void searchGifs(browserFetch, key, query).then((outcome) => {
        if (latest.current === mine) setSearch(fromOutcome(query, outcome));
      });
    },
    [isPreview, key, search],
  );
  return { search, run };
}
