// The word filter (migration 008) refuses posts with blocked words. When that is why a post
// failed, the reader is told so instead of a general error.
export const blockedLanguage =
  "This contains language that is not allowed in the community. Please rephrase it.";

export function postError(error: unknown, fallback: string): string {
  const message = typeof error === "object" && error && "message" in error ? String((error as { message: unknown }).message) : "";
  return message.includes("language that is not allowed") ? blockedLanguage : fallback;
}
