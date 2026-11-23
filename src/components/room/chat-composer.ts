// The chat's composer (S-29, chat-composer): the one source of the look of a button that opens a panel of the chat in
// place of, or above, the message field ("GIF", which opens the gif search, and the smile "Emoji", which opens the
// emoji grid), and of the emoji grid itself. A toggle's state is visible, not only to a screen reader (aria-expanded
// on the button): closed it is outline, open it is filled Blurple (default: bg-primary under text-primary-foreground),
// as the thumbs on a revealed question switch theirs (QuestionReaction). Karol's decision 1 of 2026-11-23 (R1,
// context/changes/chat-composer/research.md) after note M of the first game with friends: a friend typed the word for
// the gif search into the message field and sent it to the whole room, as "GIF" looked the same closed and open (Z2)
// and both fields stood at once. A plain module, no React and no astro:*, so /dev/ui-kitchen-sink draws the same look
// without an island.

// The variant of buttonVariants (src/components/ui/button.tsx) for a toggle of the composer, closed or open.
export function composerToggleVariant(open: boolean): "default" | "outline" {
  return open ? "default" : "outline";
}

// A toggle's size: as high as the message field and the search's field (h-11), square, in both states.
export const COMPOSER_TOGGLE_SIZE = "size-11";

// The emoji of the chat's grid (E1 + K1, Karol's decisions 2 and 3 of 2026-11-23, research.md, Open Questions): an
// emoji goes into the message's text where the field's caret stood, as a typed character would; not an emote (the six
// of the emotes' bar, src/lib/rooms/emotes.ts, are reactions of their own). Karol's 33 in his order, by theme:
// laughter, shock, suspicion, embarrassment, sadness and anger, character, gestures, party. Each is one code point,
// fully qualified (checked against Unicode's emoji-test.txt), so the field's counter and the check of a message
// (chatTextLength, src/lib/rooms/chat-text.ts) count it as one character; a composed emoji (❤️ with U+FE0F, a skin
// tone, a ZWJ sequence) would count two to four, so none is here. All come from Emoji 11.0 (2018) or older but 🫨
// (Emoji 15.0, 2022), which Windows 10 and a phone's system from before 2023 may draw as an empty box: a risk Karol
// took, picking it with its year marked. The characters themselves, never in the dictionary: the previews' pseudo
// language would wrap each in ⟦…⟧ (src/lib/i18n/pl/chat.ts, emoji).
export const CHAT_EMOJI: readonly string[] = [
  "😂",
  "🤣",
  "😭",
  "💀",
  "😱",
  "🤯",
  "😳",
  "🫨",
  "🤨",
  "🧐",
  "👀",
  "🙄",
  "🤔",
  "😏",
  "😬",
  "🙈",
  "😅",
  "🤦",
  "🤷",
  "🥴",
  "🥺",
  "😍",
  "😎",
  "😈",
  "🤬",
  "🤡",
  "🗿",
  "🔥",
  "💯",
  "👏",
  "👉",
  "🥳",
  "🍻",
];

// The grid: seven columns (five rows, the last one short), no names of groups. It scrolls inside itself (min-h-0,
// overflow-y-auto) when the chat's panel is low, so the message field under it never leaves the panel (impl-review F1
// of room-chat); p-1 keeps the focus ring of a cell at the edge inside the scroll box.
export const CHAT_EMOJI_GRID = "grid min-h-0 grid-cols-7 gap-1 overflow-y-auto p-1";
// A cell: the button variant ghost (transparent until hovered), as high as the message field, the emoji large; as wide
// as its column, with no padding, so a column narrower than a phone's (the panel from xl) still fits the emoji.
export const CHAT_EMOJI_VARIANT = "ghost";
export const CHAT_EMOJI_CELL = "h-11 p-0 text-2xl";
