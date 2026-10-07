type Event =
  | "app_opened"
  | "onboarding_completed"
  | "daily_completed"
  | "journal_saved"
  | "plan_started"
  | "plan_day_completed"
  | "auth_started"
  | "auth_completed"
  | "chat_message_posted"
  | "prayer_posted"
  | "prayer_reacted"
  | "product_clicked"
  | "giving_outbound";
type Metadata = Partial<
  Record<"tab" | "plan" | "room" | "product" | "date" | "domain", string>
>;
export function track(event: Event, metadata: Metadata = {}) {
  // Explicit allowlist: never pass journal, message, profile, email, or auth data.
  const safe = safeMetadata(metadata);
  console.info("[Daily Walk]", event, safe);
}
export function safeMetadata(metadata: Record<string, unknown>) {
  const values: Record<string, RegExp> = {
    tab: /^(Today|Plans|Community|Shop)$/,
    plan: /^(closer-to-god|consistent-in-the-word|peace-in-god)$/,
    room: /^(general-fellowship|todays-scripture|prayer-praise)$/,
    product:
      /^(nlt-every-woman-s-bible-filament-enabled|esv-applying-the-gospel-study-bible-for-men-hardcover|amplified-study-bible-hardcover)$/,
    date: /^\d{4}-\d{2}-\d{2}$/,
    domain: /^(secure\.givewell\.org|www\.gofundme\.com)$/,
  };
  return Object.fromEntries(
    Object.entries(metadata).filter(
      ([key, value]) =>
        typeof value === "string" && !!values[key] && values[key].test(value),
    ),
  );
}
