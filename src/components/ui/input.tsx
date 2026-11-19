import * as React from "react";
import { cn } from "cn";

// A local departure from shadcn (game-restyle, the field of Karol's planner): the field's own background is --muted
// (dark:bg-muted instead of dark:bg-input/30; the game is always dark, and the dark: variant keeps shadcn's order, so a
// caller's plain bg-* stays under it as before) and its outline is border-input 1.5 px (border-[1.5px] instead of
// border), at the same height (box-sizing: border-box). The same in textarea.tsx and input-group.tsx.
// `npx shadcn add input --overwrite` would bring back the old field.
function Input({ className, type, ...props }: React.ComponentProps<"input">) {
  return (
    <input
      type={type}
      data-slot="input"
      className={cn(
        "border-input selection:bg-primary selection:text-primary-foreground file:text-foreground placeholder:text-muted-foreground dark:bg-muted h-9 w-full min-w-0 rounded-md border-[1.5px] bg-transparent px-3 py-1 text-base shadow-xs transition-[color,box-shadow] outline-none file:inline-flex file:h-7 file:border-0 file:bg-transparent file:text-sm file:font-medium disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50 md:text-sm",
        "focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px]",
        "aria-invalid:border-destructive aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40",
        className,
      )}
      {...props}
    />
  );
}

export { Input };
