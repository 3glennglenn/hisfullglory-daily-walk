// push-sender: sends the push notifications that are due (migration 010). pg_cron calls it
// every five minutes with a shared secret (migration 011). The texts are fixed here, so a
// notification can never carry what anyone wrote in a prayer, a journal or a post.
import webpush from "npm:web-push@3.6.7";
import { createClient } from "npm:@supabase/supabase-js@2.45.4";

const messages: Record<string, { title: string; body: string; url: string }> = {
  daily: { title: "Your daily walk is ready", body: "A few quiet minutes with Scripture today.", url: "/walk" },
  prayed_for: { title: "Someone prayed for you", body: "A member of the community prayed for your request.", url: "/pray" },
  test: { title: "Reminders are on", body: "This is how your daily reminder will look.", url: "/" },
};

Deno.serve(async (request) => {
  const db = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
    auth: { persistSession: false },
  });
  const { data: settings, error: settingsError } = await db.rpc("push_settings");
  if (settingsError || !settings?.vapid_private || !settings?.cron_secret)
    return new Response("Push is not configured.", { status: 500 });
  if (request.headers.get("x-push-secret") !== settings.cron_secret) return new Response("Forbidden.", { status: 403 });
  webpush.setVapidDetails(settings.contact, settings.vapid_public, settings.vapid_private);

  const { data: batch, error } = await db.rpc("claim_push_batch");
  if (error) return new Response("Could not read what is due.", { status: 500 });
  const result = { sent: 0, gone: 0, failed: 0 };
  for (const row of (batch ?? []) as { endpoint: string; p256dh: string; auth: string; kind: string }[]) {
    const message = messages[row.kind];
    if (!message) continue;
    try {
      await webpush.sendNotification(
        { endpoint: row.endpoint, keys: { p256dh: row.p256dh, auth: row.auth } },
        JSON.stringify({ ...message, tag: row.kind }),
        { TTL: 60 * 60 },
      );
      result.sent++;
    } catch (failure) {
      const status = (failure as { statusCode?: number }).statusCode;
      if (status === 404 || status === 410) {
        await db.rpc("drop_push_subscription", { sub_endpoint: row.endpoint });
        result.gone++;
      } else result.failed++;
    }
  }
  return Response.json(result);
});
