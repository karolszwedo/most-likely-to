import * as React from "react";
import { cn } from "cn";

// A local departure from shadcn (game-restyle), as in input.tsx: background --muted (dark:bg-muted instead of
// dark:bg-input/30) and a 1.5 px border-input outline (border-[1.5px] instead of border).
// `npx shadcn add textarea --overwrite` would bring back the old field.
function Textarea({ className, ...props }: React.ComponentProps<"textarea">) {
  return (
    <textarea
      data-slot="textarea"
      className={cn(
        "border-input placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-ring/50 aria-invalid:border-destructive aria-invalid:ring-destructive/20 dark:bg-muted dark:aria-invalid:ring-destructive/40 flex field-sizing-content min-h-16 w-full rounded-md border-[1.5px] bg-transparent px-3 py-2 text-base shadow-xs transition-[color,box-shadow] outline-none focus-visible:ring-[3px] disabled:cursor-not-allowed disabled:opacity-50 md:text-sm",
        className,
      )}
      {...props}
    />
  );
}

export { Textarea };
