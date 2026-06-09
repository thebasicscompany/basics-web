import { Card, CardContent } from "@/components/ui/card";
import { FieldDescription } from "@/components/ui/field";

export function AuthShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-svh flex-col items-center justify-center bg-muted p-6 md:p-10">
      <div className="w-full max-w-sm md:max-w-3xl">
        <div className="flex flex-col gap-6">
          <Card className="overflow-hidden p-0">
            <CardContent className="grid p-0 md:grid-cols-2">
              {children}
              <div className="relative hidden flex-col justify-between bg-linear-to-br from-[oklch(0.28_0.06_170)] via-[oklch(0.38_0.08_160)] to-[oklch(0.46_0.09_150)] p-8 text-white md:flex">
                <div className="font-heading text-lg font-semibold tracking-tight">
                  Basics
                </div>
                <div className="space-y-3">
                  <p className="font-heading text-2xl font-semibold leading-snug tracking-tight text-balance">
                    A tutor that talks it through, draws it out, and remembers
                    what you know.
                  </p>
                  <p className="text-sm text-white/75">
                    Voice-first lessons, a shared whiteboard, and progress that
                    actually means something.
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
          <FieldDescription className="px-6 text-center">
            By continuing, you agree to our Terms of Service and Privacy
            Policy.
          </FieldDescription>
        </div>
      </div>
    </div>
  );
}
