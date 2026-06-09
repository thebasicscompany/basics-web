"use client";

import { useTransition } from "react";

import { Button } from "@/components/ui/button";
import { enrollInCourse, unenrollFromCourse } from "@/lib/enrollment-actions";

export function EnrollButton({
  courseId,
  enrolled,
  size = "sm",
}: {
  courseId: string;
  enrolled: boolean;
  size?: "sm" | "default";
}) {
  const [pending, startTransition] = useTransition();

  return (
    <Button
      size={size}
      variant={enrolled ? "outline" : "default"}
      disabled={pending}
      onClick={() =>
        startTransition(async () => {
          if (enrolled) {
            await unenrollFromCourse(courseId);
          } else {
            await enrollInCourse(courseId);
          }
        })
      }
    >
      {pending ? "Working..." : enrolled ? "Unenroll" : "Enroll"}
    </Button>
  );
}
