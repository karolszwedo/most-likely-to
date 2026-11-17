// The Worker's signature on what the room's players' topic carries (room-chat, Faza 1; option W-E of
// context/changes/players-only-live-channel/research.md). Whoever has the room's channel key and the publishable key may
// broadcast on the players' topic past the Worker (src/lib/live-sync/shared.ts, playersTopicFor), so a nick in a bare
// payload proves nothing. The Worker therefore sends every message of that topic as an envelope { data, sig }: data is
// the exact JSON text it signed (the version, the room's id, the event, the server's time, a random id and the content),
// sig its ECDSA P-256 / SHA-256 signature (IEEE P1363, r‖s, 64 bytes, base64url). The private key lives only in the
// Worker's secret LIVE_SIGNING_KEY (src/lib/live-sync/signing-key.ts); the room's screen gets the public one with the
// page and shows a message only when the signature holds on that very text, for this room and this event, within
// SIGNED_WINDOW_MS of the server's time. Web Crypto on both sides (crypto.subtle), never node:crypto, whose ECDSA
// signatures are DER by default.
//
// No imports, so it runs in the Worker, in the browser, in Vitest and in a plain Node script (scripts/signing-key.mjs,
// through Node's type stripping): only TypeScript that strips away (annotations, interfaces, type aliases, `as`), and
// base64url through btoa/atob, never Buffer.

// What the players' topic carries for every event of the Worker's.
export interface SignedEnvelope {
  data: string;
  sig: string;
}

// The envelope's shape. A screen of another version drops the message.
export const SIGNED_VERSION = 1;
// How far a message's time may be from the server's time as the screen knows it, either way. Against a replay later
// on; the screen's memory of seen ids covers the window itself.
export const SIGNED_WINDOW_MS = 60_000;

// The Worker's key, imported once per isolate: the private one to sign with, and the public one for the screens, raw
// (0x04 ‖ x ‖ y, 65 bytes) in base64url.
export interface ChannelSigner {
  privateKey: CryptoKey;
  publicKey: string;
}

// What the Worker signs for one event: the room's id, the event's name and its content (an emote with a nick today).
export interface SignedContent {
  room: string;
  event: string;
  [field: string]: unknown;
}

// The fields of an envelope the screen opened: the content with the version, the server's time (ms) and the message's
// random id, which the screen remembers to drop a copy.
export type SignedFields = SignedContent & { v: number; at: number; id: string };

const KEY_ALGORITHM = { name: "ECDSA", namedCurve: "P-256" };
const SIGN_ALGORITHM = { name: "ECDSA", hash: "SHA-256" };
// A coordinate (x, y) and the private scalar (d) of a P-256 key, and a P1363 signature (r ‖ s), in bytes.
const COORDINATE_BYTES = 32;
const SIGNATURE_BYTES = 64;
// The uncompressed point's first byte.
const UNCOMPRESSED_POINT = 0x04;
// 16 random bytes, as the room's channel key: 22 base64url characters.
const MESSAGE_ID_BYTES = 16;
const MESSAGE_ID = /^[A-Za-z0-9_-]{22}$/;
// An envelope's data far longer than any message of the Worker's is dropped before any crypto: an emote's is about 150
// characters, and a request body is capped at 4096 bytes (src/lib/rooms/json-route.ts).
const MAX_DATA_LENGTH = 4096;
const BASE64URL = /^[A-Za-z0-9_-]*$/;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function toBase64url(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/, "");
}

// The bytes of a base64url text without padding; null for any other character or a length no encoding gives.
function fromBase64url(text: string): Uint8Array<ArrayBuffer> | null {
  if (!BASE64URL.test(text) || text.length % 4 === 1) return null;
  const binary = atob(text.replaceAll("-", "+").replaceAll("_", "/"));
  return Uint8Array.from(binary, (char) => char.charCodeAt(0));
}

// The Worker's key from its secret: a private P-256 JWK ({kty, crv, x, y, d}) as JSON, in base64url, one line with no
// quotes (scripts/signing-key.mjs makes one). Blanks around it are cut, so a trailing newline from a pipe or a file
// does no harm. null for any secret that is not such a key; it never throws: the caller logs the null
// (getChannelSigner, src/lib/live-sync/signing-key.ts) and its route answers 503, and nothing of the secret may reach a
// log line, so nothing here passes an error on. The public key is built from x and y, with no crypto call.
export async function importSigningKey(secret: string): Promise<ChannelSigner | null> {
  try {
    const json = fromBase64url(secret.trim());
    if (!json) return null;
    const jwk: unknown = JSON.parse(new TextDecoder().decode(json));
    if (!isRecord(jwk) || jwk.kty !== "EC" || jwk.crv !== "P-256") return null;
    const { x, y, d } = jwk;
    if (typeof x !== "string" || typeof y !== "string" || typeof d !== "string") return null;
    const xBytes = fromBase64url(x);
    const yBytes = fromBase64url(y);
    const dBytes = fromBase64url(d);
    if (
      xBytes?.length !== COORDINATE_BYTES ||
      yBytes?.length !== COORDINATE_BYTES ||
      dBytes?.length !== COORDINATE_BYTES
    ) {
      return null;
    }
    const privateKey = await crypto.subtle.importKey(
      "jwk",
      { kty: "EC", crv: "P-256", x, y, d },
      KEY_ALGORITHM,
      false,
      ["sign"],
    );
    const raw = new Uint8Array(1 + 2 * COORDINATE_BYTES);
    raw[0] = UNCOMPRESSED_POINT;
    raw.set(xBytes, 1);
    raw.set(yBytes, 1 + COORDINATE_BYTES);
    return { privateKey, publicKey: toBase64url(raw) };
  } catch {
    // Not JSON, or a point off the curve (importKey's DataError): a bad secret, which the caller logs as such.
    return null;
  }
}

// One message for the players' topic, signed: the version, the room, the event, the server's time and a fresh random
// id, then the content, as the exact JSON text that is signed and sent. The content cannot override the first five:
// keys of theirs in it are dropped.
export async function signMessage(privateKey: CryptoKey, fields: SignedContent): Promise<SignedEnvelope> {
  const { room, event, v: _v, at: _at, id: _id, ...content } = fields;
  const id = toBase64url(crypto.getRandomValues(new Uint8Array(MESSAGE_ID_BYTES)));
  const data = JSON.stringify({ v: SIGNED_VERSION, room, event, at: Date.now(), id, ...content });
  const signature = await crypto.subtle.sign(SIGN_ALGORITHM, privateKey, new TextEncoder().encode(data));
  return { data, sig: toBase64url(new Uint8Array(signature)) };
}

// The screen's key to check with, from the page's public key (raw, base64url). null for a key that is not a P-256
// point; it never throws: the screen logs the null and hears no message on the players' topic.
export async function importVerifyKey(publicKey: string): Promise<CryptoKey | null> {
  const raw = fromBase64url(publicKey);
  if (raw?.length !== 1 + 2 * COORDINATE_BYTES || raw[0] !== UNCOMPRESSED_POINT) return null;
  try {
    return await crypto.subtle.importKey("raw", raw, KEY_ALGORITHM, false, ["verify"]);
  } catch {
    // A point off the curve (importKey's DataError): no key, which the screen logs.
    return null;
  }
}

// The fields of a message from the players' topic, when the Worker signed it for this room and this event within
// SIGNED_WINDOW_MS of now (the server's time as the screen knows it); null for anything else: a payload of another
// shape, a signature that does not hold on the exact text, another version, room or event, a time out of the window,
// an id of another form. The signature is checked on the text as it came, before it is parsed, so nothing is ever
// serialized again on the way. It never throws: whatever a sender puts on the topic is dropped as a forgery, as
// parseEmoteMessage drops a message it does not take. Copies are not its concern: the screen remembers the ids it took.
export async function openSignedMessage(
  verifyKey: CryptoKey,
  payload: unknown,
  expect: { room: string; event: string; now: number },
): Promise<SignedFields | null> {
  try {
    if (!isRecord(payload)) return null;
    const { data, sig } = payload;
    if (typeof data !== "string" || typeof sig !== "string" || data.length > MAX_DATA_LENGTH) return null;
    const signature = fromBase64url(sig);
    if (signature?.length !== SIGNATURE_BYTES) return null;

    const verified = await crypto.subtle.verify(SIGN_ALGORITHM, verifyKey, signature, new TextEncoder().encode(data));
    if (!verified) return null;

    const fields: unknown = JSON.parse(data);
    if (!isRecord(fields)) return null;
    const { v, room, event, at, id } = fields;
    if (v !== SIGNED_VERSION || room !== expect.room || event !== expect.event) return null;
    if (typeof at !== "number" || !Number.isFinite(at) || Math.abs(expect.now - at) > SIGNED_WINDOW_MS) return null;
    if (typeof id !== "string" || !MESSAGE_ID.test(id)) return null;
    return { ...fields, v: SIGNED_VERSION, room: expect.room, event: expect.event, at, id };
  } catch {
    // Only a sender's text can get here (data that is not JSON): a forgery, dropped as any other.
    return null;
  }
}
