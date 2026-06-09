"use client";

import { useSignUp } from "@clerk/nextjs";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";

import { formatClerkError } from "@/components/auth/clerk-errors";
import { OAuthButtons, type OAuthStrategy } from "@/components/auth/oauth-buttons";
import { Button } from "@/components/ui/button";
import {
  Field,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

export function SignupForm({
  className,
  ...props
}: React.ComponentProps<"form">) {
  const router = useRouter();
  const { signUp, errors, fetchStatus } = useSignUp();
  const [formError, setFormError] = useState<string | null>(null);
  const [isVerifyingEmail, setIsVerifyingEmail] = useState(false);
  const [isOAuthPending, setIsOAuthPending] = useState(false);
  const isPending = fetchStatus === "fetching" || isOAuthPending;
  const errorMessage =
    formError ?? formatClerkError(errors?.global?.[0] ?? errors?.raw?.[0]);

  async function finalizeIfComplete() {
    if (signUp.status !== "complete") {
      return false;
    }

    const finalizeAttempt = await signUp.finalize({
      navigate: async () => {
        router.replace("/courses");
      },
    });

    if (finalizeAttempt.error) {
      setFormError(formatClerkError(finalizeAttempt.error));
      return false;
    }

    return true;
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFormError(null);

    const formData = new FormData(event.currentTarget);

    if (isVerifyingEmail) {
      const code = String(formData.get("code") ?? "").trim();

      if (!code) {
        setFormError("Enter the verification code.");
        return;
      }

      const verificationAttempt = await signUp.verifications.verifyEmailCode({
        code,
      });

      if (verificationAttempt.error) {
        setFormError(formatClerkError(verificationAttempt.error));
        return;
      }

      if (!(await finalizeIfComplete())) {
        setFormError(
          "Email verification succeeded, but signup still needs another step.",
        );
      }

      return;
    }

    const emailAddress = String(formData.get("email") ?? "").trim();
    const password = String(formData.get("password") ?? "");
    const confirmPassword = String(formData.get("confirm-password") ?? "");

    if (!emailAddress || !password) {
      setFormError("Enter your email and password.");
      return;
    }

    if (password !== confirmPassword) {
      setFormError("Passwords do not match.");
      return;
    }

    const attempt = await signUp.password({ emailAddress, password });

    if (attempt.error) {
      setFormError(formatClerkError(attempt.error));
      return;
    }

    if (await finalizeIfComplete()) {
      return;
    }

    if (signUp.unverifiedFields.includes("email_address")) {
      const verificationAttempt = await signUp.verifications.sendEmailCode();

      if (verificationAttempt.error) {
        setFormError(formatClerkError(verificationAttempt.error));
        return;
      }

      setIsVerifyingEmail(true);
      return;
    }

    setFormError("This signup needs an additional verification step.");
  }

  async function handleOAuth(strategy: OAuthStrategy) {
    setFormError(null);
    setIsOAuthPending(true);

    try {
      const callbackUrl = `${window.location.origin}/sso-callback`;
      const attempt = await signUp.sso({
        strategy,
        redirectUrl: callbackUrl,
        redirectCallbackUrl: callbackUrl,
      });

      if (attempt.error) {
        setIsOAuthPending(false);
        setFormError(formatClerkError(attempt.error));
      }
    } catch (error) {
      setIsOAuthPending(false);
      setFormError(formatClerkError(error));
    }
  }

  return (
    <form
      {...props}
      className={cn("p-6 md:p-8", className)}
      onSubmit={handleSubmit}
    >
      <FieldGroup>
        <div className="flex flex-col items-center gap-2 text-center">
          <h1 className="font-heading text-2xl font-semibold tracking-tight">
            Create your account
          </h1>
          <p className="text-sm text-balance text-muted-foreground">
            {isVerifyingEmail
              ? "Enter the code we sent to your email."
              : "Enter your email below to create your account."}
          </p>
        </div>
        {errorMessage ? <FieldError>{errorMessage}</FieldError> : null}
        {isVerifyingEmail ? (
          <Field>
            <FieldLabel htmlFor="code">Verification code</FieldLabel>
            <Input
              id="code"
              name="code"
              inputMode="numeric"
              autoComplete="one-time-code"
              placeholder="123456"
              required
            />
          </Field>
        ) : (
          <>
            <Field>
              <FieldLabel htmlFor="email">Email</FieldLabel>
              <Input
                id="email"
                name="email"
                type="email"
                placeholder="m@example.com"
                autoComplete="email"
                required
              />
              <FieldDescription>
                We&apos;ll use this to connect your lessons to your account.
              </FieldDescription>
            </Field>
            <Field>
              <Field className="grid grid-cols-2 gap-4">
                <Field>
                  <FieldLabel htmlFor="password">Password</FieldLabel>
                  <Input
                    id="password"
                    name="password"
                    type="password"
                    autoComplete="new-password"
                    required
                  />
                </Field>
                <Field>
                  <FieldLabel htmlFor="confirm-password">
                    Confirm Password
                  </FieldLabel>
                  <Input
                    id="confirm-password"
                    name="confirm-password"
                    type="password"
                    autoComplete="new-password"
                    required
                  />
                </Field>
              </Field>
              <FieldDescription>
                Must be at least 8 characters long.
              </FieldDescription>
            </Field>
          </>
        )}
        <Field>
          <Button type="submit" disabled={isPending}>
            {isOAuthPending
              ? "Redirecting..."
              : isPending
                ? isVerifyingEmail
                  ? "Verifying..."
                  : "Creating account..."
                : isVerifyingEmail
                  ? "Verify email"
                  : "Create account"}
          </Button>
        </Field>
        {!isVerifyingEmail ? (
          <OAuthButtons
            disabled={isPending}
            actionLabel="Sign up"
            onSelect={(strategy) => void handleOAuth(strategy)}
          />
        ) : null}
        <FieldDescription className="text-center">
          Already have an account? <Link href="/sign-in">Sign in</Link>
        </FieldDescription>
      </FieldGroup>
    </form>
  );
}
