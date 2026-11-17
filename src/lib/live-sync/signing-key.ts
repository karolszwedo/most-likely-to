import { LIVE_SIGNING_KEY } from "astro:env/server";
import { importSigningKey, type ChannelSigner } from "@/lib/live-sync/signature";
import { logEvent } from "@/lib/log";

// The Worker's key for the signature on the room's players' topic (src/lib/live-sync/signature.ts), from its secret
// LIVE_SIGNING_KEY, read only through astro:env/server (AGENTS.md) and only when a request first needs it: the value
// is the Worker's at request time, never at the module's load. Imported once per isolate and kept here, keyed by the
// secret's value. The private key never leaves the Worker; a page gets only the public one (src/pages/r/[id].astro).
// Apart from the signature module and outside the unit tests, which load no astro:* module (test-plan.md §6.1).

let imported: { secret: string; signer: Promise<ChannelSigner | null> } | null = null;
// One line per isolate for a missing secret, not one per request.
let missingLogged = false;

// The signer, or null without a secret or with one that is no key: the routes that sign then answer 503 rather than
// send anything unsigned, and the room's page gives its screen no public key. Logged once per isolate (op signing_key,
// step missing or import), never with anything of the secret.
export function getChannelSigner(): Promise<ChannelSigner | null> {
  const secret = LIVE_SIGNING_KEY;
  if (!secret) {
    if (!missingLogged) {
      missingLogged = true;
      logEvent("error", { op: "signing_key", step: "missing" });
    }
    return Promise.resolve(null);
  }
  if (imported?.secret !== secret) {
    const signer = importSigningKey(secret).then((key) => {
      if (!key) logEvent("error", { op: "signing_key", step: "import" });
      return key;
    });
    imported = { secret, signer };
  }
  return imported.signer;
}
