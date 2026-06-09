import { AuthShell } from "@/components/auth/auth-shell";
import { LoginForm } from "@/components/login-form";

export const metadata = { title: "Sign in | Basics" };

export default function SignInPage() {
  return (
    <AuthShell>
      <LoginForm />
    </AuthShell>
  );
}
