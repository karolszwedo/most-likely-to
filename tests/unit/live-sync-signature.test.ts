import { Buffer } from "node:buffer";
import { describe, expect, it } from "vitest";
import {
  importSigningKey,
  importVerifyKey,
  openSignedMessage,
  signMessage,
  type ChannelSigner,
  type SignedEnvelope,
} from "@/lib/live-sync/signature";

// The Worker's signature on the room's players' topic (room-chat, Faza 1 #1 and #7). The oracle is the PRD, "nobody
// writes with another player's nick", in the plan's words (context/archive/2026-11-17-room-chat/plan.md, Desired End
// State): every message of the topic is { data, sig }, data the JSON text with v, room, event, at (the server's time in
// ms), id and the content, sig an ECDSA P-256 / SHA-256 signature of that text; a screen takes it only when the
// signature holds, room and event match, and at is within 60 s of the server's time. Every expected value is written
// out here, never read from the module (the version 1, the 60 s, the 65 bytes of a raw P-256 key, the 22 characters of
// an id). The keys are made in the test, so no key material sits in the repo.

const ROOM_ID = "3f2b8c1e-7a4d-4e9b-9c2a-5d6e7f8a9b0c";
const OTHER_ROOM_ID = "9a8b7c6d-5e4f-4a3b-8c2d-1e0f9a8b7c6d";
const WINDOW_MS = 60_000;
const MESSAGE_ID = /^[A-Za-z0-9_-]{22}$/;

function base64url(bytes: ArrayBuffer | Uint8Array): string {
  return Buffer.from(bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes)).toString("base64url");
}

function secretOf(jwk: unknown): string {
  return Buffer.from(JSON.stringify(jwk)).toString("base64url");
}

// A fresh key pair as scripts/signing-key.mjs makes one: the private JWK's kty, crv, x, y and d as JSON in base64url.
async function newKey(): Promise<{ secret: string; jwk: JsonWebKey; rawPublicKey: string }> {
  const pair = await crypto.subtle.generateKey({ name: "ECDSA", namedCurve: "P-256" }, true, ["sign", "verify"]);
  const jwk = await crypto.subtle.exportKey("jwk", pair.privateKey);
  const secret = secretOf({ kty: jwk.kty, crv: jwk.crv, x: jwk.x, y: jwk.y, d: jwk.d });
  return { secret, jwk, rawPublicKey: base64url(await crypto.subtle.exportKey("raw", pair.publicKey)) };
}

async function keys(): Promise<{ signer: ChannelSigner; verifyKey: CryptoKey }> {
  const { secret } = await newKey();
  const signer = await importSigningKey(secret);
  if (!signer) throw new Error("the test's secret did not import");
  const verifyKey = await importVerifyKey(signer.publicKey);
  if (!verifyKey) throw new Error("the test's public key did not import");
  return { signer, verifyKey };
}

// A valid signature on any text, as the Worker's key would make it: for messages signMessage never makes (another
// version, no id), so a check after the signature is tested on its own.
async function signText(privateKey: CryptoKey, data: string): Promise<SignedEnvelope> {
  const sig = await crypto.subtle.sign({ name: "ECDSA", hash: "SHA-256" }, privateKey, new TextEncoder().encode(data));
  return { data, sig: base64url(sig) };
}

function fieldsOf(envelope: SignedEnvelope): Record<string, unknown> {
  return JSON.parse(envelope.data) as Record<string, unknown>;
}

const emote = { room: ROOM_ID, event: "emote", emote: "heart", nick: "Ola" };
const expectEmote = (now: number) => ({ room: ROOM_ID, event: "emote", now });

describe("signMessage and openSignedMessage", () => {
  it("opens what the Worker signed to the room, the event, the content, the version, the server's time and an id", async () => {
    const { signer, verifyKey } = await keys();
    const before = Date.now();

    const envelope = await signMessage(signer.privateKey, emote);
    const fields = await openSignedMessage(verifyKey, envelope, expectEmote(Date.now()));

    expect(Object.keys(envelope).sort()).toEqual(["data", "sig"]);
    expect(fields).toMatchObject({ v: 1, room: ROOM_ID, event: "emote", emote: "heart", nick: "Ola" });
    expect(fields?.at).toBeGreaterThanOrEqual(before);
    expect(fields?.at).toBeLessThanOrEqual(Date.now());
    expect(fields?.id).toMatch(MESSAGE_ID);
    // The fields are those of the exact text that was signed.
    expect(fields).toEqual(fieldsOf(envelope));
  });

  it("gives every message an id of its own", async () => {
    const { signer } = await keys();

    const first = fieldsOf(await signMessage(signer.privateKey, emote));
    const second = fieldsOf(await signMessage(signer.privateKey, emote));

    expect(first.id).not.toBe(second.id);
  });

  it("never lets the content set the version, the time or the id", async () => {
    const { signer, verifyKey } = await keys();

    const envelope = await signMessage(signer.privateKey, { ...emote, v: 2, at: 0, id: "AAAAAAAAAAAAAAAAAAAAAA" });
    const fields = await openSignedMessage(verifyKey, envelope, expectEmote(Date.now()));

    expect(fields?.v).toBe(1);
    expect(fields?.at).not.toBe(0);
    expect(fields?.id).not.toBe("AAAAAAAAAAAAAAAAAAAAAA");
  });

  it("takes a message up to 60 s from the server's time, either way", async () => {
    const { signer, verifyKey } = await keys();
    const envelope = await signMessage(signer.privateKey, emote);
    const at = fieldsOf(envelope).at as number;

    expect(await openSignedMessage(verifyKey, envelope, expectEmote(at + WINDOW_MS))).not.toBeNull();
    expect(await openSignedMessage(verifyKey, envelope, expectEmote(at - WINDOW_MS))).not.toBeNull();
  });

  it.each([
    ["more than 60 s old", 1],
    ["more than 60 s ahead", -1],
  ])("drops a message %s", async (_why, sign) => {
    const { signer, verifyKey } = await keys();
    const envelope = await signMessage(signer.privateKey, emote);
    const at = fieldsOf(envelope).at as number;

    expect(await openSignedMessage(verifyKey, envelope, expectEmote(at + sign * (WINDOW_MS + 1)))).toBeNull();
  });

  it("drops the Worker's message with another player's nick put into its text", async () => {
    const { signer, verifyKey } = await keys();
    const envelope = await signMessage(signer.privateKey, emote);

    const forged = { data: envelope.data.replace('"nick":"Ola"', '"nick":"Zosia"'), sig: envelope.sig };

    expect(forged.data).not.toBe(envelope.data);
    expect(await openSignedMessage(verifyKey, forged, expectEmote(Date.now()))).toBeNull();
  });

  it("drops a message signed with another key", async () => {
    const { verifyKey } = await keys();
    const { signer: stranger } = await keys();

    const envelope = await signMessage(stranger.privateKey, emote);

    expect(await openSignedMessage(verifyKey, envelope, expectEmote(Date.now()))).toBeNull();
  });

  it.each([
    ["a random signature", () => base64url(crypto.getRandomValues(new Uint8Array(64)))],
    ["an empty signature", () => ""],
    ["a signature one byte short", () => base64url(crypto.getRandomValues(new Uint8Array(63)))],
    ["a signature that is no base64url", () => "*".repeat(86)],
  ])("drops the Worker's text with %s", async (_why, sig) => {
    const { signer, verifyKey } = await keys();
    const envelope = await signMessage(signer.privateKey, emote);

    expect(await openSignedMessage(verifyKey, { data: envelope.data, sig: sig() }, expectEmote(Date.now()))).toBeNull();
  });

  it.each([
    ["another room", { room: OTHER_ROOM_ID, event: "emote" }],
    ["another event", { room: ROOM_ID, event: "chat" }],
  ])("drops a message the Worker signed for %s", async (_why, expected) => {
    const { signer, verifyKey } = await keys();
    const envelope = await signMessage(signer.privateKey, emote);

    expect(await openSignedMessage(verifyKey, envelope, { ...expected, now: Date.now() })).toBeNull();
  });

  // Validly signed texts the Worker never sends: each check after the signature on its own.
  it.each([
    ["another version", { v: 2 }],
    ["no version", { v: undefined }],
    ["a time that is no number", { at: "now" }],
    ["no id", { id: undefined }],
    ["an id of another form", { id: "short" }],
  ])("drops a signed message with %s", async (_why, change) => {
    const { signer, verifyKey } = await keys();
    const now = Date.now();
    const data = JSON.stringify({
      v: 1,
      room: ROOM_ID,
      event: "emote",
      at: now,
      id: "Pk7sW2nQ9xLb4VmT8rYc-a",
      ...change,
    });

    const envelope = await signText(signer.privateKey, data);

    expect(await openSignedMessage(verifyKey, envelope, expectEmote(now))).toBeNull();
  });

  it.each([
    ["a text that is no JSON", "heart"],
    ["an array", "[1,2]"],
    ["null", "null"],
  ])("drops a signed message whose data is %s", async (_why, data) => {
    const { signer, verifyKey } = await keys();

    const envelope = await signText(signer.privateKey, data);

    expect(await openSignedMessage(verifyKey, envelope, expectEmote(Date.now()))).toBeNull();
  });

  it.each([
    ["null", null],
    ["an array", [{ data: "{}", sig: "" }]],
    ["a name from Object.prototype", "constructor"],
    ["an emote in the old shape", { emote: "heart", nick: "Ola" }],
    ["an envelope without a signature", { data: "{}" }],
    ["data that is no text", { data: { v: 1 }, sig: "" }],
    ["data far longer than any message", { data: "x".repeat(5000), sig: "" }],
  ])("drops %s as a payload", async (_why, payload) => {
    const { verifyKey } = await keys();

    expect(await openSignedMessage(verifyKey, payload, expectEmote(Date.now()))).toBeNull();
  });
});

describe("importSigningKey", () => {
  it("gives the public key as raw P-256 in base64url (0x04, x, y: 65 bytes), the same as the key pair's own", async () => {
    const { secret, jwk, rawPublicKey } = await newKey();

    const signer = await importSigningKey(secret);

    expect(signer?.publicKey).toBe(rawPublicKey);
    const raw = Buffer.from(signer?.publicKey ?? "", "base64url");
    expect(raw.length).toBe(65);
    expect(raw[0]).toBe(0x04);
    // Nothing of the private scalar d goes into the public key.
    expect(raw.includes(Buffer.from(jwk.d ?? "", "base64url"))).toBe(false);
  });

  it("cuts blanks around the secret, as a pipe or a file leaves a newline", async () => {
    const { secret, rawPublicKey } = await newKey();

    expect((await importSigningKey(`  ${secret}\n`))?.publicKey).toBe(rawPublicKey);
  });

  it.each([
    ["an empty secret", () => ""],
    ["a secret that is no base64url", () => "not a key!"],
    ["a name from Object.prototype", () => "constructor"],
    ["base64url of a text that is no JSON", () => Buffer.from("heart").toString("base64url")],
    ["a JSON array", () => secretOf([])],
    ["a key of another curve", async () => secretOf({ ...(await newKey()).jwk, crv: "P-384" })],
    ["a key of another type", async () => secretOf({ ...(await newKey()).jwk, kty: "RSA" })],
    ["a public key alone (no d)", async () => secretOf({ ...(await newKey()).jwk, d: undefined })],
    ["a coordinate cut short", async () => secretOf({ ...(await newKey()).jwk, x: "AAAA" })],
    [
      "a point off the curve",
      async () =>
        secretOf({
          ...(await newKey()).jwk,
          x: base64url(new Uint8Array(32).fill(1)),
          y: base64url(new Uint8Array(32).fill(2)),
        }),
    ],
    ["a secret cut short", async () => (await newKey()).secret.slice(0, -10)],
  ])("gives null for %s", async (_why, secret) => {
    expect(await importSigningKey(await secret())).toBeNull();
  });
});

describe("importVerifyKey", () => {
  it.each([
    ["an empty key", ""],
    ["a key that is no base64url", "not a key!"],
    ["a key one byte short", base64url(new Uint8Array(64).fill(4))],
    ["a compressed point", base64url(Uint8Array.from({ length: 65 }, (_, index) => (index === 0 ? 0x02 : 1)))],
    ["a point off the curve", base64url(Uint8Array.from({ length: 65 }, (_, index) => (index === 0 ? 0x04 : 1)))],
  ])("gives null for %s", async (_why, publicKey) => {
    expect(await importVerifyKey(publicKey)).toBeNull();
  });
});
