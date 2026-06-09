"use client";

import { useSignIn } from "@clerk/nextjs";
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

export function LoginForm({
  className,
  ...props
}: React.ComponentProps<"form">) {
  const router = useRouter();
  const { signIn, errors, fetchStatus } = useSignIn();
  const [formError, setFormError] = useState<string | null>(null);
  const [isOAuthPending, setIsOAuthPending] = useState(false);
  const isPending = fetchStatus === "fetching" || isOAuthPending;
  const errorMessage =
    formError ?? formatClerkError(errors?.global?.[0] ?? errors?.raw?.[0]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFormError(null);

    const formData = new FormData(event.currentTarget);
    const identifier = String(formData.get("email") ?? "").trim();
    const password = String(formData.get("password") ?? "");

    if (!identifier || !password) {
      setFormError("Enter your email and password.");
      return;
    }

    const attempt = await signIn.password({ identifier, password });

    if (attempt.error) {
      setFormError(formatClerkError(attempt.error));
      return;
    }

    if (signIn.status === "complete") {
      const finalizeAttempt = await signIn.finalize({
        navigate: async () => {
          router.replace("/courses");
        },
      });

      if (finalizeAttempt.error) {
        setFormError(formatClerkError(finalizeAttempt.error));
      }

      return;
    }

    setFormError("This sign-in needs an additional verification step.");
  }

  async function handleOAuth(strategy: OAuthStrategy) {
    setFormError(null);
    setIsOAuthPending(true);

    try {
      const callbackUrl = `${window.location.origin}/sso-callback`;
      const attempt = await signIn.sso({
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
          <h1 className="text-2xl font-bold">Welcome back</h1>
          <p className="text-balance text-muted-foreground">
            Sign in to continue your lessons.
          </p>
        </div>
        {errorMessage ? <FieldError>{errorMessage}</FieldError> : null}
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
        </Field>
        <Field>
          <FieldLabel htmlFor="password">Password</FieldLabel>
          <Input
            id="password"
            name="password"
            type="password"
            autoComplete="current-password"
            required
          />
        </Field>
        <Field>
          <Button type="submit" disabled={isPending}>
            {isOAuthPending
              ? "Redirecting..."
              : isPending
                ? "Signing in..."
                : "Sign in"}
          </Button>
        </Field>
        <OAuthButtons
          disabled={isPending}
          actionLabel="Sign in"
          onSelect={(strategy) => void handleOAuth(strategy)}
        />
        <FieldDescription className="text-center">
          Don&apos;t have an account? <Link href="/sign-up">Sign up</Link>
        </FieldDescription>
      </FieldGroup>
    </form>
  );
}
