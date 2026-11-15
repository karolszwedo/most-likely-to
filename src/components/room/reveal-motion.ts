// The motion of the reveal (Karol's pick of 2026-11-15, reveal-ui, after the gallery): the pie spins in and grows, the
// table slides up from below and in "Paski" each bar grows from the left. Only under motion-safe:, so with reduced
// motion in the system the result simply stands. The classes come from tw-animate-css (src/styles/global.css:2):
// fade-in, zoom-in-*, spin-in-*, slide-in-* and the rest only set its variables, and nothing moves without animate-in.
// Durations and delays from Tailwind's scale, no keyframes or tokens of our own. Whole class names only: Tailwind
// generates just the classes it finds written out.
export const MOTION_PIE = "animate-in fade-in zoom-in-50 spin-in-45 duration-700 delay-300 fill-mode-both";
export const MOTION_TABLE = "animate-in fade-in slide-in-from-bottom-2 duration-500 delay-500 fill-mode-both";
export const MOTION_BAR = "animate-in slide-in-from-left duration-1000 delay-300 fill-mode-both";
