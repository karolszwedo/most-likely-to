import type { Messages } from "@/lib/i18n";

// English dictionary: the sign-in screen.
export const auth: Messages["auth"] = {
  card: {
    title: "Sign in",
    description: "Only the host needs an account. Guests play without one.",
    separator: "or with email and password",
    footer: "No account yet? Use Discord or Google.",
  },
  providers: {
    discord: "Sign in with Discord",
    google: "Sign in with Google",
    redirecting: "Redirecting…",
  },
  form: {
    emailLabel: "Email",
    emailPlaceholder: "you@example.com",
    emailMissing: "Enter your email address",
    emailInvalid: "Enter a valid email address",
    passwordLabel: "Password",
    passwordPlaceholder: "Your password",
    passwordMissing: "Enter your password",
    showPassword: "Show password",
    hidePassword: "Hide password",
    submit: "Sign in",
    pending: "Signing in…",
  },
};
