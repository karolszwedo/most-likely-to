import { useEffect, useId, useRef, useState } from "react";
import { Check, ChevronDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { htmlLang, LANGS, type Lang } from "@/lib/i18n";
import { keepLang, switchLang } from "@/lib/i18n/live-lang";
import { useLang, useT } from "@/lib/i18n/react";
import { cn } from "@/lib/utils";

// The dev previews only: no request at all; the menu open; always in the header's row (a frame narrower than its window,
// /dev/room-states); the pill's id (/dev/ui-kitchen-sink).
export interface LanguageSwitchPreview {
  open?: boolean;
  inRow?: boolean;
  id?: string;
}

interface Props {
  // The page's own path and query, where the form brings the browser back to.
  next: string;
  // The room's screen and the waiting screen: the language changes on the page (switchLang), without a reload.
  live?: boolean;
  preview?: LanguageSwitchPreview;
}

// The flags are the game's own images: Windows draws the emoji ones as letters. Their colours live only in the files.
const FLAGS: Record<Lang, string> = { pl: "/flags/pl.svg", en: "/flags/gb.svg" };

function Flag({ lang }: { lang: Lang }) {
  return (
    // Lazy, or React's server render would put a preload of the image in front of the header.
    <img
      src={FLAGS[lang]}
      alt=""
      width={20}
      height={14}
      loading="lazy"
      className="ring-border h-3.5 w-5 shrink-0 rounded-xs ring-1"
    />
  );
}

// The switch of the person's own screen language (S-27, PRD FR-031; Karol's pick F2 of 2026-11-24): a pill with the
// flag and the code of the language now, and a menu with every language named in itself, so two taps change it. Only
// this person's screens change. The menu closes with a pick, Escape, a press beside it or the focus going past it, and
// the focus goes back to the pill after the first two. A page without live state sends the form (POST /api/lang) and
// comes back reloaded; a live one changes by itself and keeps the pick with a fetch.
export default function LanguageSwitch({ next, live = false, preview }: Props) {
  const t = useT().common.screenLang;
  const lang = htmlLang(useLang());
  const [open, setOpen] = useState(preview?.open ?? false);
  const rootRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const menuId = useId();
  const isPreview = preview !== undefined;

  useEffect(() => {
    if (!open) return;
    function onPress(event: PointerEvent) {
      if (event.target instanceof Node && rootRef.current?.contains(event.target)) return;
      setOpen(false);
    }
    document.addEventListener("pointerdown", onPress);
    return () => {
      document.removeEventListener("pointerdown", onPress);
    };
  }, [open]);

  function close() {
    setOpen(false);
    buttonRef.current?.focus();
  }

  // False when the form has nothing to send.
  function pick(picked: Lang): boolean {
    if (picked === lang) {
      close();
      return false;
    }
    if (live) {
      switchLang(picked);
      if (!isPreview) void keepLang(picked);
      close();
      return false;
    }
    if (isPreview) {
      const url = new URL(window.location.href);
      url.searchParams.set("lang", picked);
      window.location.assign(url);
      return false;
    }
    return true;
  }

  return (
    <div
      ref={rootRef}
      className="relative"
      onKeyDown={(e) => {
        if (e.key === "Escape" && open) close();
      }}
      onBlur={(e) => {
        // A press that takes the focus nowhere (Safari's buttons) is not the focus going past the menu.
        if (e.relatedTarget === null || e.currentTarget.contains(e.relatedTarget)) return;
        setOpen(false);
      }}
    >
      <Button
        ref={buttonRef}
        id={preview?.id}
        type="button"
        variant="secondary"
        size="sm"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        className="bg-muted hover:bg-accent px-2.5 font-semibold"
        onClick={() => {
          setOpen(!open);
        }}
      >
        <Flag lang={lang} />
        {t.codes[lang]}
        <span className="sr-only">{t.afterCode}</span>
        <ChevronDown aria-hidden="true" className="text-muted-foreground size-3.5" />
      </Button>
      {open && (
        <form
          id={menuId}
          method="POST"
          action="/api/lang"
          className="bg-popover text-popover-foreground shadow-card absolute top-full right-0 z-50 mt-1.5 w-40 rounded-xl p-1"
        >
          <input type="hidden" name="next" value={next} />
          <ul aria-label={t.menu} className="flex flex-col">
            {LANGS.map((code) => (
              <li key={code}>
                <button
                  type="submit"
                  name="lang"
                  value={code}
                  lang={code}
                  aria-current={code === lang ? "true" : undefined}
                  className={cn(
                    "focus-visible:ring-ring/50 flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-sm font-medium outline-none focus-visible:ring-3",
                    code === lang ? "bg-accent text-accent-foreground" : "hover:bg-muted",
                  )}
                  onClick={(e) => {
                    if (!pick(code)) e.preventDefault();
                  }}
                >
                  <Flag lang={code} />
                  {t.names[code]}
                  {code === lang && <Check aria-hidden="true" className="text-primary-text ml-auto size-4" />}
                </button>
              </li>
            ))}
          </ul>
        </form>
      )}
    </div>
  );
}
