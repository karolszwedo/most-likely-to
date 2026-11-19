// The game's surfaces in one place (game-restyle, Karol's pick D1 "flat with a shadow", 2026-11-19), as reveal-motion.ts
// holds the reveal's motion: a card drawn in a view without the Card component (src/components/ui/card.tsx) looks like
// one, the card's colour and corners with the game's shadow (shadow-card, src/styles/global.css) instead of an outline.
// A view adds its own layout (flex, gap, padding) next to it with cn() or class:list. Whole class names only: Tailwind
// generates just the classes it finds written out.
export const SURFACE = "bg-card rounded-xl shadow-card";

// The game's lists as tiles (Karol's pick of 2026-11-19, round 3 of the gallery): every row of the lists "Gracze" in the
// lobby and while a game is in play, the vote's options, the game's question list, the proposals of questions, the
// requests to come in and to come back, and the categories of a new game stands as a tile of its own, apart from the
// next one, with no outline and no line between rows. The list stays a <ul> of <li> (the E2E specs find its rows as
// listitems); the row keeps its own layout (padding, height) next to TILE.
export const TILE_LIST = "flex flex-col gap-2";
// Smaller corners than a card's (rounded-sm, SURFACE has rounded-xl), so a tile reads as a row of a list.
export const TILE = "bg-card rounded-sm shadow-card";
// A tile lying on a card (the categories of "Nowa gra" in RoomCard): a shade lighter than the card, as a card-coloured
// tile on a card stands apart by its shadow alone (Karol's pick B, 2026-11-19). foreground and input on muted are pairs
// of scripts/contrast.mjs.
export const TILE_ON_CARD = "bg-muted rounded-sm shadow-card";
// The vote's option (RoundVoting): the tile shows the choice and the keyboard focus of its radio, which has no outline of
// its own. The ring stays in view in the gap between the tiles.
export const CHOICE_TILE = `${TILE} has-[:checked]:bg-accent has-[:focus-visible]:ring-3 has-[:focus-visible]:ring-ring/50`;

// The reveal's result table: one card with the game's shadow and no line between the rows. overflow-hidden keeps the
// header's background and the bars in "Paski" inside its corners; the card's own shadow is drawn outside, never cut.
export const TABLE_FRAME = "bg-card rounded-lg shadow-card overflow-hidden";
