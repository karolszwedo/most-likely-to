// What the game is, in one place, for someone who has never played it: the title and the sentence under it on / (not
// signed in) and on the host's link /j/<code> (GameIntro.astro), and the link's preview card on Discord, Messenger or
// WhatsApp (LINK_PREVIEW, the Open Graph tags of Layout.astro). Karol's choice from the gallery of join-page-ui
// (16.11.2026): "zdanie 1".
// The two questions in the sentence are written out by hand, never imported from src/data/questions.ts: the questions
// stay on the server (lessons.md), and this text also reaches every link's preview.

export const GAME_TITLE = "Kto z nas najprawdopodobniej…?";

export const GAME_TEASER =
  "…zasnąłby na własnej imprezie? …nadałby imię swojemu odkurzaczowi? Wskażcie, kto z ekipy pasuje najbardziej. Głos jest anonimowy, wynik widzą wszyscy.";

// The link's card is the same for every room and state: no host's nick, no number of players, no room id, no code
// (GET /j/<code> changes nothing, and Discord fetches it for this card). Discord shows og:title up to 70 bytes and
// og:description up to 350; this description is 195 bytes of UTF-8.
export const LINK_PREVIEW = {
  siteName: "Most Likely To",
  title: "Dołącz do gry",
  description: `${GAME_TITLE} ${GAME_TEASER}`,
} as const;

export type LinkPreview = typeof LINK_PREVIEW;
