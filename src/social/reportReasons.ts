// The reasons a reader can give when reporting something, in the order the dialog shows
// them (harm first, "Something else" last), and the words around a report.
// The `value` of each row is what the server stores in community_reports.category and must
// stay inside the CHECK list of migration 006; tests/safety.test.ts keeps the two together.
export const reportReasons = [
  {
    value: "harassment",
    label: "Harassment or threats",
    hint: "Targeting, insulting or scaring someone.",
  },
  {
    value: "hate",
    label: "Hate",
    hint: "Attacking people for who they are, including their faith.",
  },
  {
    value: "sexual content",
    label: "Sexual content",
    hint: "Sexual or explicit material, or sexual exploitation.",
  },
  {
    value: "dangerous advice",
    label: "Dangerous advice",
    hint: "Advice that could hurt someone, including encouraging self-harm.",
  },
  {
    value: "scam",
    label: "Scam",
    hint: "Asking for money or details under false pretences.",
  },
  {
    value: "private information",
    label: "Private information",
    hint: "Sharing details about someone that they have not shared themselves.",
  },
  {
    value: "spam",
    label: "Spam",
    hint: "Ads, repeated posts or links nobody asked for.",
  },
  {
    value: "other",
    label: "Something else",
    hint: "Tell us more below.",
  },
] as const;
export type ReportReason = (typeof reportReasons)[number];

/** What the person is looking at, from the server's target kind. Unknown kinds read as "post". */
export function kindNoun(kind: string): string {
  switch (kind) {
    case "chat":
      return "chat message";
    case "prayer":
      return "prayer request";
    case "support":
      return "support request";
    default:
      return "post";
  }
}

export const chooseReasonMessage = "Choose a reason so we know where to look.";
export const signInToReportTitle = "Sign in to report";
export const signInToReportBody =
  "Reports are linked to an account so we can follow up and stop misuse. Open Profile to sign in.";
export const sendFailedMessage =
  "Your report was not sent. Check your connection and try again.";
export const reportLimitMessage =
  "You have sent a lot of reports in the last hour. Please try again later.";

export type ReportFailure = "gone" | "signed-out" | "limit" | "failed";

function messageOf(error: unknown): string {
  if (typeof error === "string") return error;
  if (error && typeof error === "object" && "message" in error) {
    const message = (error as { message?: unknown }).message;
    if (typeof message === "string") return message;
  }
  return "";
}

/** Which of the four failures this is. Only the server's own wording is read, never shown. */
export function reportFailure(error: unknown): ReportFailure {
  const message = messageOf(error);
  if (message.includes("Visible target required")) return "gone";
  if (message.includes("Authentication required")) return "signed-out";
  if (message.includes("Report limit reached")) return "limit";
  return "failed";
}

/** A calm sentence for the reader. The server's wording is never passed through. */
export function reportErrorMessage(error: unknown, noun = "post"): string {
  switch (reportFailure(error)) {
    case "gone":
      return `This ${noun} is no longer available, so it cannot be reported.`;
    case "signed-out":
      return `${signInToReportTitle}. ${signInToReportBody}`;
    case "limit":
      return reportLimitMessage;
    default:
      return sendFailedMessage;
  }
}
