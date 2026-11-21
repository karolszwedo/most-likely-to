import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { DiscordIcon, GoogleIcon } from "@/components/auth/ProviderIcons";
import { useSubmitPending } from "@/components/auth/useSubmitPending";
import type { UiLang } from "@/lib/i18n";
import { I18nProvider, useT } from "@/lib/i18n/react";

type Provider = "discord" | "google";

// The button's words come from the dictionary (auth.providers), by the provider's id.
const PROVIDERS: { id: Provider; Icon: typeof DiscordIcon }[] = [
  { id: "discord", Icon: DiscordIcon },
  { id: "google", Icon: GoogleIcon },
];

// Starting state for /dev/ui-kitchen-sink (a provider already clicked); the real page never sets it.
interface Preview {
  pending?: Provider;
}

interface Props {
  preview?: Preview;
}

// One plain form per provider, so the buttons work without JS. The provider rides in a hidden field: the clicked
// button is disabled at once, and a disabled button drops out of the posted form.
// The island's root: the page's language (lang, from Astro.locals.lang) for the dictionary of its whole tree.
export default function ProviderButtons({ lang, ...props }: Props & { lang: UiLang }) {
  return (
    <I18nProvider lang={lang}>
      <ProviderButtonsContent {...props} />
    </I18nProvider>
  );
}

function ProviderButtonsContent({ preview }: Props) {
  const t = useT();
  const [pending, setPending] = useSubmitPending(preview?.pending !== undefined);
  // Only picks the button with the spinner; Back (bfcache) clears `pending`, which hides the spinner too.
  const [clicked, setClicked] = useState<Provider | null>(preview?.pending ?? null);

  return (
    <div className="flex flex-col gap-3">
      {PROVIDERS.map(({ id, Icon }) => (
        <form
          key={id}
          method="POST"
          action="/api/auth/oauth"
          onSubmit={() => {
            setClicked(id);
            setPending(true);
          }}
        >
          <input type="hidden" name="provider" value={id} />
          <Button type="submit" variant="outline" disabled={pending} className="w-full">
            {pending && clicked === id ? (
              <>
                <Spinner aria-hidden="true" />
                {t.auth.providers.redirecting}
              </>
            ) : (
              <>
                <Icon />
                {t.auth.providers[id]}
              </>
            )}
          </Button>
        </form>
      ))}
    </div>
  );
}
