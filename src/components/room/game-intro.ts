import type { Messages } from "@/lib/i18n";

// What the game is, in one place, for someone who has never played it: the title and the sentence under it on / (not
// signed in) and on the host's link /j/<code> (GameIntro.astro, from the dictionary's link.intro), and the link's
// preview card on Discord, Messenger or WhatsApp (linkPreview, the Open Graph tags of Layout.astro). Karol's choice
// from the gallery of join-page-ui (16.11.2026): "zdanie 1". The texts live in the dictionary
// (src/lib/i18n/pl/link.ts).

export interface LinkPreview {
  siteName: string;
  title: string;
  description: string;
  image: string;
}

// The link's card is the same for every room and state: no host's nick, no number of players, no room id, no code
// (GET /j/<code> changes nothing, and Discord fetches it for this card). The picture is the game's icon, the same file
// for every room (home-screen-icon, Karol's pick A): a square, so Discord shows it small on the right of the card. A
// path on this site; Layout.astro turns it into the full address that og:image needs.
export const LINK_PREVIEW_IMAGE = "/icons/icon-512.png";

// The card in the words of the page's dictionary (t = messages(lang), src/lib/i18n).
export function linkPreview(t: Messages): LinkPreview {
  return { ...t.link.preview, image: LINK_PREVIEW_IMAGE };
}
