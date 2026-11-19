// The game's surfaces in one place (game-restyle, Karol's pick D1 "flat with a shadow", 2026-11-19), as reveal-motion.ts
// holds the reveal's motion: a card drawn in a view without the Card component (src/components/ui/card.tsx) looks like
// one, the card's colour and corners with the game's shadow (shadow-card, src/styles/global.css) instead of an outline.
// A view adds its own layout (flex, gap, padding) next to it with cn() or class:list. Whole class names only: Tailwind
// generates just the classes it finds written out.
export const SURFACE = "bg-card rounded-xl shadow-card";
