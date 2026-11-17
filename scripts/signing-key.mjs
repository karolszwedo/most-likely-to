// A new key for the Worker's signature on the room's players' topic (room-chat, Faza 1 #6;
// src/lib/live-sync/signature.ts): the secret LIVE_SIGNING_KEY, a private P-256 JWK ({kty, crv, x, y, d}) as JSON in
// base64url, one line with no quotes. The one way to make it, so it never lands in the repo or in anyone's output:
//
//   node scripts/signing-key.mjs | npx wrangler secret put LIVE_SIGNING_KEY   (production; with the owner's consent)
//   node scripts/signing-key.mjs --env-line >> .dev.vars                      (the dev server, or a CI job's build)
//
// With no argument it writes the secret alone, with no trailing newline, for the pipe; --env-line writes
// LIVE_SIGNING_KEY=<secret> and one newline, to append to an env file. Either way it goes only to stdout, which the
// caller sends on; nothing else is written and nothing is printed to the terminal: run with stdout on a terminal (no
// pipe, no redirect, as when trying it out), it makes no key, says so on stderr and exits with 2 (impl-review F5). The
// key comes from Web Crypto in Node. Before writing it the script proves it as the Worker and a screen will use it
// (import, sign, open, and the public key equal to the pair's own): when that fails it writes nothing to stdout, says
// so on stderr without the secret, and exits with 1; a wrong argument exits with 2. It imports the signature module as TypeScript, which Node
// strips by itself from 22.18 (.nvmrc). Nothing reaches a server here; the pipe's wrangler command asks first
// (.claude/settings.json).
import { Buffer } from "node:buffer";
import { importSigningKey, importVerifyKey, openSignedMessage, signMessage } from "../src/lib/live-sync/signature.ts";

const USAGE = "usage: node scripts/signing-key.mjs [--env-line]";

function fail(message, code) {
  console.error(`signing-key: ${message}`);
  process.exit(code);
}

const args = process.argv.slice(2);
if (args.length > 1 || (args.length === 1 && args[0] !== "--env-line")) fail(USAGE, 2);
const envLine = args[0] === "--env-line";
if (process.stdout.isTTY) {
  fail("stdout is a terminal, so no key is made: pipe it into wrangler or append it to .dev.vars (see the header)", 2);
}

const { subtle } = globalThis.crypto;
const pair = await subtle.generateKey({ name: "ECDSA", namedCurve: "P-256" }, true, ["sign", "verify"]);
const { kty, crv, x, y, d } = await subtle.exportKey("jwk", pair.privateKey);
const secret = Buffer.from(JSON.stringify({ kty, crv, x, y, d })).toString("base64url");

// The proof: the secret imports as the Worker imports it, its public key is the pair's own, and a message it signs
// opens with that public key as a screen opens it, to the same fields.
async function proven() {
  const signer = await importSigningKey(secret);
  if (!signer) return "the new secret does not import";
  const raw = Buffer.from(await subtle.exportKey("raw", pair.publicKey)).toString("base64url");
  if (signer.publicKey !== raw) return "the secret's public key is not the pair's own";
  const verifyKey = await importVerifyKey(signer.publicKey);
  if (!verifyKey) return "the public key does not import";
  const content = { room: "signing-key-check", event: "emote", emote: "heart", nick: "Ola" };
  const envelope = await signMessage(signer.privateKey, content);
  const expected = { room: content.room, event: content.event, now: Date.now() };
  const fields = await openSignedMessage(verifyKey, envelope, expected);
  if (fields?.emote !== content.emote || fields.nick !== content.nick) return "a signed message does not open";
  return null;
}

const problem = await proven();
if (problem !== null) fail(`${problem}; nothing was written.`, 1);
process.stdout.write(envLine ? `LIVE_SIGNING_KEY=${secret}\n` : secret);
