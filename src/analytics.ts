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
  | "product_clicked";
type Metadata = Partial<
  Record<"tab" | "plan" | "room" | "product" | "date", string>
>;
export function track(event: Event, metadata: Metadata = {}) {
  // Explicit allowlist: never pass journal, message, profile, email, or auth data.
  const safe = Object.fromEntries(
    Object.entries(metadata).filter(([key]) =>
      ["tab", "plan", "room", "product", "date"].includes(key),
    ),
  );
  console.info("[Daily Walk]", event, safe);
}
