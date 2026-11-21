import React, { useState } from "react";
import { Mail, Lock, LogIn } from "lucide-react";
import { FormField } from "@/components/auth/FormField";
import { FieldGroup } from "@/components/ui/field";
import { PasswordToggle } from "@/components/auth/PasswordToggle";
import { SubmitButton } from "@/components/auth/SubmitButton";
import { useSubmitPending } from "@/components/auth/useSubmitPending";
import type { Messages, UiLang } from "@/lib/i18n";
import { I18nProvider, useT } from "@/lib/i18n/react";

interface FieldErrors {
  email?: string;
  password?: string;
}

// Starting state for /dev/ui-kitchen-sink, which renders several forms on one page; the real page never sets it.
interface Preview {
  idPrefix: string;
  email?: string;
  password?: string;
  showErrors?: boolean;
  pending?: boolean;
}

interface Props {
  preview?: Preview;
}

function getFieldErrors(email: string, password: string, t: Messages["auth"]["form"]): FieldErrors {
  const errors: FieldErrors = {};
  if (!email.trim()) {
    errors.email = t.emailMissing;
  } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    errors.email = t.emailInvalid;
  }
  if (!password) {
    errors.password = t.passwordMissing;
  }
  return errors;
}

// The island's root: the page's language (lang, from Astro.locals.lang) for the dictionary of its whole tree.
export default function SignInForm({ lang, ...props }: Props & { lang: UiLang }) {
  return (
    <I18nProvider lang={lang}>
      <SignInFormContent {...props} />
    </I18nProvider>
  );
}

function SignInFormContent({ preview }: Props) {
  const t = useT();
  const texts = t.auth.form;
  const [email, setEmail] = useState(preview?.email ?? "");
  const [password, setPassword] = useState(preview?.password ?? "");
  const [showPassword, setShowPassword] = useState(false);
  const [errors, setErrors] = useState<FieldErrors>(() =>
    preview?.showErrors ? getFieldErrors(email, password, texts) : {},
  );
  const [pending, setPending] = useSubmitPending(preview?.pending);
  const idPrefix = preview ? `${preview.idPrefix}-` : "";

  function validate() {
    const next = getFieldErrors(email, password, texts);
    setErrors(next);
    return next;
  }

  function clearError(field: keyof typeof errors) {
    if (errors[field]) setErrors((prev) => ({ ...prev, [field]: undefined }));
  }

  function handleSubmit(e: React.SubmitEvent<HTMLFormElement>) {
    const next = validate();
    const firstInvalid = next.email ? "email" : next.password ? "password" : null;
    if (firstInvalid) {
      e.preventDefault();
      // Send the user (and a screen reader) straight to the first broken field.
      e.currentTarget.querySelector<HTMLInputElement>(`[name="${firstInvalid}"]`)?.focus();
      return;
    }
    // Fields stay enabled: disabled inputs would drop out of the posted form.
    setPending(true);
  }

  return (
    <form method="POST" action="/api/auth/signin" onSubmit={handleSubmit} noValidate>
      <FieldGroup>
        <FormField
          id={`${idPrefix}email`}
          name="email"
          type="email"
          label={texts.emailLabel}
          value={email}
          onChange={(v) => {
            setEmail(v);
            clearError("email");
          }}
          placeholder={texts.emailPlaceholder}
          error={errors.email}
          icon={<Mail className="size-4" />}
        />

        <FormField
          id={`${idPrefix}password`}
          name="password"
          label={texts.passwordLabel}
          type={showPassword ? "text" : "password"}
          value={password}
          onChange={(v) => {
            setPassword(v);
            clearError("password");
          }}
          placeholder={texts.passwordPlaceholder}
          error={errors.password}
          icon={<Lock className="size-4" />}
          endContent={
            <PasswordToggle
              visible={showPassword}
              onToggle={() => {
                setShowPassword(!showPassword);
              }}
            />
          }
        />

        <SubmitButton pending={pending} pendingText={texts.pending} icon={<LogIn className="size-4" />}>
          {texts.submit}
        </SubmitButton>
      </FieldGroup>
    </form>
  );
}
