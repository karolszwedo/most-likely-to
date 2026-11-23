// The chat's composer (S-29, chat-composer): the one source of the look of a button that opens a panel of the chat in
// place of, or above, the message field (today "GIF", which opens the gif search). Its state is visible, not only to a
// screen reader (aria-expanded on the button): closed it is outline, open it is filled Blurple (default: bg-primary under
// text-primary-foreground), as the thumbs on a revealed question switch theirs (QuestionReaction). Karol's decision 1 of
// 2026-11-23 (R1, context/changes/chat-composer/research.md) after note M of the first game with friends: a friend typed
// the word for the gif search into the message field and sent it to the whole room, as "GIF" looked the same closed and
// open (Z2) and both fields stood at once. A plain module, no React and no astro:*, so /dev/ui-kitchen-sink draws the
// same look without an island.

// The variant of buttonVariants (src/components/ui/button.tsx) for a toggle of the composer, closed or open.
export function composerToggleVariant(open: boolean): "default" | "outline" {
  return open ? "default" : "outline";
}

// A toggle's size: as high as the message field and the search's field (h-11), square, in both states.
export const COMPOSER_TOGGLE_SIZE = "size-11";
