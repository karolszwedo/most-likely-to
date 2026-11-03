import type { AstroCookieSetOptions } from "astro";

// Random codes and the guest's cookie. Server only: every token comes from crypto.getRandomValues in the Worker.

// The code in /j/<code> (the database checks the same pattern).
export const LINK_TOKEN_PATTERN = /^[A-Za-z0-9_-]{22}$/;
// Room ids in /r/<id>. Lowercase only, as Postgres prints them: the id is also the live-sync topic.
export const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
// A guest's token as newPlayerToken makes it (the database checks the same pattern). cast_vote raises on any other
// form, so a cookie that does not match is treated as no cookie.
export const PLAYER_TOKEN_PATTERN = /^[A-Za-z0-9_-]{43}$/;

const PLAYER_COOKIE_MAX_AGE = 60 * 60 * 24;

function randomBase64Url(byteCount: number): string {
  const bytes = crypto.getRandomValues(new Uint8Array(byteCount));
  const binary = Array.from(bytes, (byte) => String.fromCharCode(byte)).join("");
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

// 16 bytes: 22 characters.
export function newLinkToken(): string {
  return randomBase64Url(16);
}

// 32 bytes: 43 characters. The database keeps only its sha256.
export function newPlayerToken(): string {
  return randomBase64Url(32);
}

export function playerCookieName(roomId: string): string {
  return `mlt_player_${roomId}`;
}

// 24 h instead of a session cookie, which in-app browsers may drop when the app goes to the background. Secure only on
// https: a phone on http://<LAN IP> would reject a Secure cookie.
export function playerCookieOptions(url: URL): AstroCookieSetOptions {
  return {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: PLAYER_COOKIE_MAX_AGE,
    secure: url.protocol === "https:",
  };
}

// The nick a guest asked with when the link's form refused it as taken (S-04): the form on /j/<code> then offers to ask
// for a return to the place with that nick, without retyping it and without the nick ever going into a URL. Only the
// link pages get it back, for a few minutes; the room's cookie keeps the guest's token, this one never anything but the
// nick they typed.
export const TAKEN_NICK_COOKIE = "mlt_taken_nick";

export function takenNickCookieOptions(url: URL): AstroCookieSetOptions {
  return {
    httpOnly: true,
    sameSite: "lax",
    path: "/j/",
    maxAge: 10 * 60,
    secure: url.protocol === "https:",
  };
}
