import { Button } from "@/components/ui/button";
import LanguageSwitch, { type LanguageSwitchPreview } from "@/components/room/LanguageSwitch";
import { SWITCH_PLACE, type SwitchPlace } from "@/components/room/room-frame";
import type { UiLang } from "@/lib/i18n";
import { useScreenLang } from "@/lib/i18n/live-lang";
import { I18nProvider, useT } from "@/lib/i18n/react";
import { cn } from "@/lib/utils";

interface Props {
  // A signed-in host's "Wyloguj"; a guest and the sign-in screen have the switch alone.
  signedIn: boolean;
  // Where the switch stands in the header (room-frame.ts); null on the sign-in screen, which places it itself.
  place: SwitchPlace | null;
  next: string;
  live?: boolean;
  preview?: LanguageSwitchPreview;
}

// The right end of the header (AppHeader.astro): "Wyloguj" and the switch of the screen's language. An island of its
// own, as the header stands outside the room's: a switch without a reload reaches it through the same module
// (useScreenLang), so "Wyloguj" changes too.
export default function HeaderActions({ lang, ...props }: Props & { lang: UiLang }) {
  return (
    <I18nProvider lang={useScreenLang(lang)}>
      <Actions {...props} />
    </I18nProvider>
  );
}

function Actions({ signedIn, place, next, live, preview }: Props) {
  const t = useT();
  return (
    <div className="flex items-center gap-2">
      {signedIn && (
        // From xl the room's screen has its switch right beside the header's end, so "Wyloguj" keeps clear of it.
        <form method="POST" action="/api/auth/signout" className={cn(place === "chat" && "xl:mr-4")}>
          <Button type="submit" variant="ghost" size="sm">
            {t.host.header.signOut}
          </Button>
        </form>
      )}
      <div className={cn(place !== null && !preview?.inRow && SWITCH_PLACE[place])}>
        <LanguageSwitch next={next} live={live} preview={preview} />
      </div>
    </div>
  );
}
