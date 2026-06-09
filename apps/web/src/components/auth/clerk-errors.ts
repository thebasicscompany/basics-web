export function formatClerkError(error: unknown): string | null {
  if (!error) {
    return null;
  }

  if (isDisplayError(error)) {
    return error.longMessage ?? error.message;
  }

  if (error instanceof Error) {
    return error.message;
  }

  return "Something went wrong. Try again.";
}

function isDisplayError(
  error: unknown,
): error is { longMessage?: string; message: string } {
  return (
    typeof error === "object" &&
    error !== null &&
    "message" in error &&
    typeof (error as { message?: unknown }).message === "string"
  );
}
