import type { Messages } from "@/lib/i18n";

const TOO_MANY_TRIES = "Too many attempts. Wait a moment and try again.";
const CHECK_FIELDS = "Check your email and password.";
const SERVICE_UNAVAILABLE = "The server is temporarily unavailable. Try again in a few minutes.";
const EXPIRED = "Your sign-in expired or was interrupted. Start again.";
const VERIFY_EMAIL = "Confirm your email address with the provider or sign in another way.";
const OTHER_WAY = "Couldn’t sign in with this account. Try another way.";

// English dictionary: an auth error code's text (the codes and when each shows: src/lib/i18n/pl/auth-errors.ts).
export const authErrors: Messages["authErrors"] = {
  generic: "Something went wrong. Try again.",
  codes: {
    missing_fields: "Enter your email and password.",
    invalid_credentials: "Wrong email or password.",
    email_not_confirmed: "This account isn’t confirmed. Sign in with Discord or Google.",
    over_request_rate_limit: TOO_MANY_TRIES,
    over_email_send_rate_limit: TOO_MANY_TRIES,
    validation_failed: CHECK_FIELDS,
    email_address_invalid: CHECK_FIELDS,
    signup_disabled: "Creating accounts is turned off.",
    config_missing: SERVICE_UNAVAILABLE,
    service_unavailable: SERVICE_UNAVAILABLE,
    access_denied: "Signing in was cancelled. Try again.",
    bad_oauth_state: EXPIRED,
    bad_oauth_callback: EXPIRED,
    flow_state_expired: EXPIRED,
    flow_state_not_found: EXPIRED,
    flow_state_already_used: EXPIRED,
    pkce_code_verifier_not_found: EXPIRED,
    bad_code_verifier: EXPIRED,
    provider_email_needs_verification: VERIFY_EMAIL,
    email_address_not_authorized: VERIFY_EMAIL,
    unexpected_failure: OTHER_WAY,
    user_banned: OTHER_WAY,
  },
};
