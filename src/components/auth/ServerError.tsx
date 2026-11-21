import { CircleAlert } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import type { UiLang } from "@/lib/i18n";
import { WithI18n } from "@/lib/i18n/react";

interface ServerErrorProps {
  message?: string | null;
}

// The message is in the HTML from the start (after a redirect), and most screen readers skip a role="alert" that never
// changed. The scripts in SignInCard and RoomCard focus [data-server-error] on load so it gets read; nothing to click,
// so no focus ring.
// From a .astro file (SignInCard.astro) it is a root of its own and takes the page's language (Astro.locals.lang);
// inside an island it reads the island's dictionary (WithI18n, src/lib/i18n/react.tsx).
export function ServerError({ lang, ...props }: ServerErrorProps & { lang?: UiLang }) {
  return (
    <WithI18n lang={lang}>
      <ServerErrorAlert {...props} />
    </WithI18n>
  );
}

function ServerErrorAlert({ message }: ServerErrorProps) {
  if (!message) return null;

  return (
    <Alert variant="destructive" tabIndex={-1} data-server-error className="outline-hidden">
      <CircleAlert />
      <AlertDescription>{message}</AlertDescription>
    </Alert>
  );
}
