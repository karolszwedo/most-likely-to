// Polish dictionary: an auth error code's text (src/lib/auth-errors.ts). The keys of `codes` are the codes themselves,
// as they travel in `?error=` and `?error_code=`; a code with no key gets `generic`.
const TOO_MANY_TRIES = "Za dużo prób. Odczekaj chwilę i spróbuj ponownie.";
const CHECK_FIELDS = "Sprawdź adres e-mail i hasło.";
const SERVICE_UNAVAILABLE = "Serwer jest chwilowo niedostępny. Spróbuj za kilka minut.";
const EXPIRED = "Logowanie wygasło albo się urwało. Zacznij od nowa.";
const VERIFY_EMAIL = "Potwierdź adres e-mail u dostawcy albo zaloguj się drugą drogą.";
const OTHER_WAY = "Nie udało się zalogować tym kontem. Spróbuj drugiej drogi.";

export const authErrors = {
  generic: "Coś poszło nie tak. Spróbuj ponownie.",
  codes: {
    missing_fields: "Podaj e-mail i hasło.",
    invalid_credentials: "Nieprawidłowy e-mail lub hasło.",
    // The game sends no emails: an unconfirmed account can only come from Supabase's own sign-up API (deploy-plan.md).
    email_not_confirmed: "To konto nie jest potwierdzone. Zaloguj się przez Discord albo Google.",
    over_request_rate_limit: TOO_MANY_TRIES,
    over_email_send_rate_limit: TOO_MANY_TRIES,
    validation_failed: CHECK_FIELDS,
    email_address_invalid: CHECK_FIELDS,
    signup_disabled: "Zakładanie kont jest wyłączone.",
    config_missing: SERVICE_UNAVAILABLE,
    service_unavailable: SERVICE_UNAVAILABLE,
    // OAuth: the host cancelled consent at Discord or Google.
    access_denied: "Logowanie przerwane. Spróbuj jeszcze raz.",
    // OAuth: expired (over 300 s) or broken flow, e.g. a lost PKCE cookie or a reused link.
    bad_oauth_state: EXPIRED,
    bad_oauth_callback: EXPIRED,
    flow_state_expired: EXPIRED,
    flow_state_not_found: EXPIRED,
    flow_state_already_used: EXPIRED,
    pkce_code_verifier_not_found: EXPIRED,
    bad_code_verifier: EXPIRED,
    // OAuth: the email is not verified at the provider.
    provider_email_needs_verification: VERIFY_EMAIL,
    email_address_not_authorized: VERIFY_EMAIL,
    // OAuth: other failures on Supabase's side (unexpected_failure covers e.g. a provider account without an email).
    unexpected_failure: OTHER_WAY,
    user_banned: OTHER_WAY,
  },
};
