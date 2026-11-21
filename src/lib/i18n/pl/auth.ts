// Polish dictionary: the sign-in screen (src/components/auth/, src/pages/auth/).
export const auth = {
  // The card around the sign-in (SignInCard.astro).
  card: {
    title: "Zaloguj się",
    description: "Konto ma tylko osoba prowadząca. Goście grają bez konta.",
    // Between the providers' buttons and the password form.
    separator: "albo e-mailem i hasłem",
    footer: "Nowe konto: przez Discord albo Google.",
  },
  // One button per provider (ProviderButtons.tsx).
  providers: {
    discord: "Zaloguj przez Discord",
    google: "Zaloguj przez Google",
    redirecting: "Przekierowuję…",
  },
  // The e-mail and password form (SignInForm.tsx, PasswordToggle.tsx).
  form: {
    emailLabel: "E-mail",
    emailPlaceholder: "ty@przyklad.pl",
    emailMissing: "Podaj adres e-mail",
    emailInvalid: "Podaj poprawny adres e-mail",
    passwordLabel: "Hasło",
    passwordPlaceholder: "Twoje hasło",
    passwordMissing: "Podaj hasło",
    showPassword: "Pokaż hasło",
    hidePassword: "Ukryj hasło",
    submit: "Zaloguj się",
    pending: "Logowanie…",
  },
};
