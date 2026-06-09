import { AuthShell } from "@/components/auth/auth-shell";
import { SignupForm } from "@/components/signup-form";

export const metadata = { title: "Sign up | Basics" };

export default function SignUpPage() {
  return (
    <AuthShell>
      <SignupForm />
    </AuthShell>
  );
}
